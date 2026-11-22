import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { assignVesselCodes, resolveVesselByCode } from '@/modules/vessels/lib/vesselCode';

export interface Vessel {
  id: string;
  company_id: string;
  name: string;
  imo_number: string | null;
  flag_state: string | null;
  vessel_type: string | null;
  classification_society: string | null;
  gross_tonnage: number | null;
  build_year: number | null;
  status: string | null;
  /** Rows are read with `select('*')`, so these arrive with every vessel. */
  created_at?: string | null;
  /** `vessels.code`, once the column is live (DECISIONS D-03); absent before. */
  code?: string | null;
  /** `vessels.fleet_group_id` (live column); the vessel switcher groups by it. */
  fleet_group_id?: string | null;
}

/** A vessel of the company as the code derivation needs it (sold ones included). */
export type CompanyVessel = Pick<Vessel, 'id' | 'name' | 'status' | 'created_at' | 'code'>;

interface VesselContextType {
  selectedVessel: Vessel | null;
  selectedVesselId: string | null;
  vessels: Vessel[];
  isAllVessels: boolean;
  setSelectedVessel: (vessel: Vessel | null) => void;
  setSelectedVesselById: (vesselId: string | null) => void;
  setAllVessels: () => void;
  loading: boolean;
  refreshVessels: () => Promise<void>;
  canAccessAllVessels: boolean;
  /**
   * Every vessel of the company, sold ones included, whether or not the user
   * can reach it. Vessel codes are derived against this list so every user
   * sees the same code for a vessel (D-03). Falls back to `vessels` when the
   * company list cannot be read.
   */
  companyVessels: CompanyVessel[];
  /** Vessel id → code (upper case), per D-03. */
  vesselCodes: ReadonlyMap<string, string>;
  /** The code of a vessel (upper case), or null for an unknown id. */
  getVesselCodeById: (vesselId: string | null | undefined) => string | null;
  /** The reachable vessel with this code (any case), or undefined. */
  findVesselByCode: (code: string | null | undefined) => Vessel | undefined;
  /**
   * The user (`profiles.user_id`) whose vessels the lists above hold, or null
   * before the first load. While it differs from the profile, or the profile
   * is not the signed-in auth user's own, the lists are empty, nothing is
   * selected and `loading` is true, so nothing (the scope routes, a vessel
   * picker) ever reads one user's vessels for another (D-25, D-41). A
   * signed-in user whose profile has not arrived also reads as loading, for
   * at most PROFILE_WAIT_MS (an unreadable profile then means no vessels).
   */
  loadedForUserId: string | null;
}

const VesselContext = createContext<VesselContextType | undefined>(undefined);

const STORAGE_KEY_VESSEL_ID = 'storm_selectedVesselId';
const STORAGE_KEY_ALL_VESSELS = 'storm_isAllVessels';

// Roles that can access all vessels and see \"All Vessels\" option
const ALL_VESSELS_ROLES = ['dpa', 'shore_management'];

/**
 * How long a signed-in user without a profile reads as loading. The same
 * grace as PROFILE_GRACE_MS in app/router/useScopeAccess (not imported from
 * there: that module imports this one).
 */
const PROFILE_WAIT_MS = 5000;

export const VesselProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { profile, user } = useAuth();
  const [selectedVessel, setSelectedVesselState] = useState<Vessel | null>(null);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [companyVessels, setCompanyVessels] = useState<CompanyVessel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAllVessels, setIsAllVessels] = useState(false);
  // Whose vessels the state above holds. A sign-out or a switch to another
  // account changes the profile before the next load lands; until then the
  // previous user's lists must not be served (fail closed, D-04, D-25).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  // Each load takes a ticket; a load that a newer one (or a user change) has
  // superseded never writes, so A's slow load cannot land after B's.
  const loadSeq = useRef(0);
  const profileUserId = profile?.user_id ?? null;
  const authUserId = user?.id ?? null;
  // A profile that is not the signed-in user's own: AuthContext swaps the
  // profile with the session user, so this is a guard, not a normal state.
  const foreignProfile = profileUserId !== null && profileUserId !== authUserId;

  // Check if user can access all vessels based on their role
  const canAccessAllVessels = ALL_VESSELS_ROLES.includes(profile?.role || '');

  // What is served: nothing while the state still belongs to another user
  // (or none), or the profile is not the signed-in user's, derived during
  // render so not even one render hands the previous user's vessels to the
  // next before the clearing effect runs. A missing profile alone is not
  // stale: the lists are already empty then (see awaitingProfile).
  const stale = loadedFor !== profileUserId || foreignProfile;
  const servedVessels = useMemo(() => (stale ? [] : vessels), [stale, vessels]);
  const servedCompany = useMemo(() => (stale ? [] : companyVessels), [stale, companyVessels]);
  const servedSelection = stale ? null : selectedVessel;

  // Signed in, profile not here yet (a sign-in, or a switch straight to
  // another account): nothing has loaded for this user, so report loading,
  // but only for PROFILE_WAIT_MS, after which the user has no vessels.
  const awaitingProfile = authUserId !== null && profileUserId === null;
  const [profileWaitOverFor, setProfileWaitOverFor] = useState<string | null>(null);
  useEffect(() => {
    if (!awaitingProfile) {
      setProfileWaitOverFor(null);
      return undefined;
    }
    const timer = window.setTimeout(() => setProfileWaitOverFor(authUserId), PROFILE_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [awaitingProfile, authUserId]);
  const waitingForProfile = awaitingProfile && profileWaitOverFor !== authUserId;

  // Load vessels based on user role
  const loadVessels = useCallback(async () => {
    loadSeq.current += 1;
    const seq = loadSeq.current;
    const current = () => seq === loadSeq.current;
    const owner = profile?.user_id ?? null;
    if (!profile?.company_id) {
      setLoading(false);
      setLoadedFor(owner);
      return;
    }

    try {
      setLoading(true);

      let vesselsData: Vessel[] = [];

      // The whole company fleet, sold vessels included, so vessel codes
      // (D-03) come out the same for every user. A failure here must not
      // stop the reachable vessels loading: codes then fall back to those.
      const directoryRequest = supabase
        .from('vessels')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('name');

      // DPA/Shore Management see all company vessels
      if (canAccessAllVessels) {
        const { data, error } = await directoryRequest;
        if (!current()) return;

        if (error) throw error;
        const directory: Vessel[] = data || [];
        setCompanyVessels(directory);
        // Same rows as `.neq('status', 'Sold')`, which also drops a null status.
        vesselsData = directory.filter((v) => v.status != null && v.status !== 'Sold');
      } else {
        // Other users see only their assigned vessels
        const [assignmentRes, directoryRes] = await Promise.all([
          supabase
            .from('crew_assignments')
            .select('vessel_id')
            .eq('user_id', profile.user_id)
            .eq('is_current', true),
          directoryRequest,
        ]);
        if (!current()) return;
        const { data: assignments, error: assignmentError } = assignmentRes;

        if (assignmentError) throw assignmentError;
        if (directoryRes.error) {
          console.error('Error loading the company vessel list:', directoryRes.error);
        }
        const directory: Vessel[] = directoryRes.data || [];

        if (assignments && assignments.length > 0) {
          const vesselIds = assignments.map(a => a.vessel_id);
          const { data, error } = await supabase
            .from('vessels')
            .select('*')
            .in('id', vesselIds)
            .neq('status', 'Sold')
            .order('name');
          if (!current()) return;

          if (error) throw error;
          vesselsData = data || [];
        }
        setCompanyVessels(directory);
      }

      setVessels(vesselsData);

      // Restore previous selection from localStorage
      const savedIsAllVessels = localStorage.getItem(STORAGE_KEY_ALL_VESSELS) === 'true';
      const savedVesselId = localStorage.getItem(STORAGE_KEY_VESSEL_ID);

      if (savedIsAllVessels && canAccessAllVessels) {
        setIsAllVessels(true);
        setSelectedVesselState(null);
      } else if (savedVesselId) {
        const vessel = vesselsData.find(v => v.id === savedVesselId);
        if (vessel) {
          setSelectedVesselState(vessel);
          setIsAllVessels(false);
        } else if (vesselsData.length > 0) {
          // Saved vessel not found, default to first vessel
          setSelectedVesselState(vesselsData[0]);
          setIsAllVessels(false);
        } else if (canAccessAllVessels) {
          // No vessels found but user can access all - set to all vessels mode
          setIsAllVessels(true);
        }
      } else if (vesselsData.length > 0) {
        // No saved selection, default to first vessel
        setSelectedVesselState(vesselsData[0]);
        setIsAllVessels(false);
      } else if (canAccessAllVessels) {
        // No vessels but user can access all - set to all vessels mode
        setIsAllVessels(true);
      }
    } catch (error) {
      if (current()) console.error('Error loading vessels:', error);
    } finally {
      if (current()) {
        setLoading(false);
        setLoadedFor(owner);
      }
    }
  }, [profile?.company_id, profile?.user_id, canAccessAllVessels]);

  // A different user (or none): drop the previous user's vessels and
  // selection, and supersede any load still running for them. Declared
  // before the load effect so the new user's load runs after this. Clearing
  // writes nothing to localStorage (the persist effects only store a
  // selection that is set).
  useEffect(() => {
    loadSeq.current += 1;
    setVessels([]);
    setCompanyVessels([]);
    setSelectedVesselState(null);
    setIsAllVessels(false);
    if (!profileUserId) setLoadedFor(null);
  }, [profileUserId]);

  // Load vessels when profile changes
  useEffect(() => {
    if (profile) {
      loadVessels();
    }
  }, [profile, loadVessels]);

  // Persist selected vessel to localStorage
  useEffect(() => {
    if (selectedVessel) {
      localStorage.setItem(STORAGE_KEY_VESSEL_ID, selectedVessel.id);
      localStorage.setItem(STORAGE_KEY_ALL_VESSELS, 'false');
    }
  }, [selectedVessel]);

  // Persist \"All Vessels\" selection
  useEffect(() => {
    if (isAllVessels) {
      localStorage.setItem(STORAGE_KEY_ALL_VESSELS, 'true');
      localStorage.removeItem(STORAGE_KEY_VESSEL_ID);
    }
  }, [isAllVessels]);

  const setSelectedVessel = useCallback((vessel: Vessel | null) => {
    setSelectedVesselState(vessel);
    setIsAllVessels(false);
  }, []);

  const setSelectedVesselById = useCallback((vesselId: string | null) => {
    if (vesselId === null || vesselId === '__all__') {
      if (canAccessAllVessels) {
        setIsAllVessels(true);
        setSelectedVesselState(null);
      }
    } else {
      const vessel = servedVessels.find(v => v.id === vesselId);
      if (vessel) {
        setSelectedVesselState(vessel);
        setIsAllVessels(false);
      }
    }
  }, [servedVessels, canAccessAllVessels]);

  const setAllVessels = useCallback(() => {
    if (canAccessAllVessels) {
      setIsAllVessels(true);
      setSelectedVesselState(null);
    }
  }, [canAccessAllVessels]);

  const refreshVessels = useCallback(async () => {
    await loadVessels();
  }, [loadVessels]);

  // Codes are derived over the company fleet plus anything reachable that
  // the company list missed (e.g. when it could not be read).
  const codeSource = useMemo<CompanyVessel[]>(() => {
    const known = new Set(servedCompany.map((v) => v.id));
    return [...servedCompany, ...servedVessels.filter((v) => !known.has(v.id))];
  }, [servedCompany, servedVessels]);

  const vesselCodes = useMemo(() => assignVesselCodes(codeSource), [codeSource]);

  const getVesselCodeById = useCallback(
    (vesselId: string | null | undefined) => (vesselId ? vesselCodes.get(vesselId) ?? null : null),
    [vesselCodes],
  );

  const findVesselByCode = useCallback(
    (code: string | null | undefined) => resolveVesselByCode(code, servedVessels, codeSource),
    [servedVessels, codeSource],
  );

  const value: VesselContextType = {
    selectedVessel: servedSelection,
    selectedVesselId: servedSelection?.id || null,
    vessels: servedVessels,
    isAllVessels: stale ? false : isAllVessels,
    setSelectedVessel,
    setSelectedVesselById,
    setAllVessels,
    loading: stale || (awaitingProfile ? waitingForProfile : loading),
    refreshVessels,
    // Never another user's role (the profile is swapped with the session user).
    canAccessAllVessels: foreignProfile ? false : canAccessAllVessels,
    companyVessels: codeSource,
    vesselCodes,
    getVesselCodeById,
    findVesselByCode,
    loadedForUserId: loadedFor,
  };

  return <VesselContext.Provider value={value}>{children}</VesselContext.Provider>;
};

// Custom hook to use vessel context
export const useVessel = () => {
  const context = useContext(VesselContext);
  if (context === undefined) {
    throw new Error('useVessel must be used within a VesselProvider');
  }
  return context;
};
