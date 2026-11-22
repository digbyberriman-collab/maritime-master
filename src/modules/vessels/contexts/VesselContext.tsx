import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
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
}

const VesselContext = createContext<VesselContextType | undefined>(undefined);

const STORAGE_KEY_VESSEL_ID = 'storm_selectedVesselId';
const STORAGE_KEY_ALL_VESSELS = 'storm_isAllVessels';

// Roles that can access all vessels and see \"All Vessels\" option
const ALL_VESSELS_ROLES = ['dpa', 'shore_management'];

export const VesselProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const [selectedVessel, setSelectedVesselState] = useState<Vessel | null>(null);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [companyVessels, setCompanyVessels] = useState<CompanyVessel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAllVessels, setIsAllVessels] = useState(false);

  // Check if user can access all vessels based on their role
  const canAccessAllVessels = ALL_VESSELS_ROLES.includes(profile?.role || '');

  // Load vessels based on user role
  const loadVessels = useCallback(async () => {
    if (!profile?.company_id) {
      setLoading(false);
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
      console.error('Error loading vessels:', error);
    } finally {
      setLoading(false);
    }
  }, [profile?.company_id, profile?.user_id, canAccessAllVessels]);

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
      const vessel = vessels.find(v => v.id === vesselId);
      if (vessel) {
        setSelectedVesselState(vessel);
        setIsAllVessels(false);
      }
    }
  }, [vessels, canAccessAllVessels]);

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
    const known = new Set(companyVessels.map((v) => v.id));
    return [...companyVessels, ...vessels.filter((v) => !known.has(v.id))];
  }, [companyVessels, vessels]);

  const vesselCodes = useMemo(() => assignVesselCodes(codeSource), [codeSource]);

  const getVesselCodeById = useCallback(
    (vesselId: string | null | undefined) => (vesselId ? vesselCodes.get(vesselId) ?? null : null),
    [vesselCodes],
  );

  const findVesselByCode = useCallback(
    (code: string | null | undefined) => resolveVesselByCode(code, vessels, codeSource),
    [vessels, codeSource],
  );

  const value: VesselContextType = {
    selectedVessel,
    selectedVesselId: selectedVessel?.id || null,
    vessels,
    isAllVessels,
    setSelectedVessel,
    setSelectedVesselById,
    setAllVessels,
    loading,
    refreshVessels,
    canAccessAllVessels,
    companyVessels: codeSource,
    vesselCodes,
    getVesselCodeById,
    findVesselByCode,
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
