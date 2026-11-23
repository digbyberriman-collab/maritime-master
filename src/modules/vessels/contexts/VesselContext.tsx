import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { assignVesselCodes, resolveVesselByCode } from '@/modules/vessels/lib/vesselCode';
import { normaliseError } from '@/shared/lib/notify';
import {
  LEGACY_ALL_VESSEL_ROLES,
  legacyReach,
  membershipReach,
  type ReachVessel,
} from '@/app/router/membershipReach';
import { LEGACY_REACH, NO_REACH, readOwnMembership, reachModeFor, type VesselReach } from '@/app/router/ownMembership';
import type { VesselLifecycleStatus } from '@/modules/vessels/types/db.pending';
import { useUiPreferenceSync } from '@/app/shell/useUiPreferenceSync';

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
  /** `vessels.lifecycle_status`, once the P1 column is live; an archived vessel is never reachable. */
  lifecycle_status?: VesselLifecycleStatus | null;
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
  /**
   * The last load of the vessel lists failed, or null (D-04, gap/10 A.12):
   * an error state with Retry, never a definitive "no vessels" or "not
   * found". Set when a load fails and cleared only when one succeeds, so it
   * stays up while a retry runs (the D-76 latch). A failed refresh keeps
   * serving the previous lists of the same user. Served behind the same
   * guard as the lists, so one user's error never shows for another (D-25,
   * D-41). The company directory read alone failing is not a load error:
   * that list only feeds the codes, and the reachable vessels loaded.
   */
  loadError: { message: string } | null;
  /** Loads the vessel lists again (the Retry for `loadError`; same as `refreshVessels`). */
  retryVessels: () => Promise<void>;
  /**
   * Which reach rules the lists were cut with (Phase 2 spec §B.4, D-26,
   * proposed D-123): `legacy` while `account_memberships` is not live or the
   * user's row is legacy-managed (today's role and crew-assignment rules);
   * `membership` for a row an admin manages (its own fleet access and
   * vessel scope); `none` when the table is live but holds no usable row
   * for the user (no reach at all, fail closed). Served behind the same
   * guard as the lists: `none` while loading or while the state is another
   * user's. Optional in the type only so a context built by hand (a test
   * double that predates Phase 2) still reads as before: absent means the
   * legacy rules. VesselProvider always sets it.
   */
  reach?: VesselReach;
}

/** The sentence a failed vessel-list load falls back to when the error has none. */
const LOAD_ERROR_FALLBACK = 'Your vessels could not load.';

const VesselContext = createContext<VesselContextType | undefined>(undefined);

/** A vessel row as the reach rules read it. */
const toReachVessel = (v: Vessel): ReachVessel => ({
  id: v.id,
  companyId: v.company_id,
  status: v.status,
  lifecycleStatus: v.lifecycle_status ?? null,
});

const STORAGE_KEY_VESSEL_ID = 'storm_selectedVesselId';
const STORAGE_KEY_ALL_VESSELS = 'storm_isAllVessels';

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
  // The last load failed. Latched: only a load that succeeds clears it (or a
  // user change), never the start of a retry (D-76).
  const [loadError, setLoadError] = useState<{ message: string } | null>(null);
  // Each load takes a ticket; a load that a newer one (or a user change) has
  // superseded never writes, so A's slow load cannot land after B's.
  const loadSeq = useRef(0);
  const profileUserId = profile?.user_id ?? null;
  const authUserId = user?.id ?? null;
  // A profile that is not the signed-in user's own: AuthContext swaps the
  // profile with the session user, so this is a guard, not a normal state.
  const foreignProfile = profileUserId !== null && profileUserId !== authUserId;
  // Density and Show roadmap follow the account once their columns are live
  // (D-19, Phase 2 spec §B.5). Run here because every signed-in screen sits
  // under this provider; the hook reads once per user and adopts only what
  // this device has never chosen.
  useUiPreferenceSync(authUserId);

  // The legacy rule (D-26): DPA and shore management see every company
  // vessel (LEGACY_ALL_VESSEL_ROLES, the same list legacyReach applies). It
  // picks today's queries; what is served depends on the reach rules the
  // load found (see `servedReach` below).
  const legacyAllVessels = LEGACY_ALL_VESSEL_ROLES.includes(profile?.role || '');
  // The reach rules of the last load (Phase 2 spec §B.4).
  const [reach, setReach] = useState<VesselReach>(NO_REACH);

  // What is served: nothing while the state still belongs to another user
  // (or none), or the profile is not the signed-in user's, derived during
  // render so not even one render hands the previous user's vessels to the
  // next before the clearing effect runs. A missing profile alone is not
  // stale: the lists are already empty then (see awaitingProfile).
  const stale = loadedFor !== profileUserId || foreignProfile;
  const servedVessels = useMemo(() => (stale ? [] : vessels), [stale, vessels]);
  const servedCompany = useMemo(() => (stale ? [] : companyVessels), [stale, companyVessels]);
  const servedSelection = stale ? null : selectedVessel;
  // No profile: no membership is read, so today's rules apply (no vessels;
  // fleet reach from the RBAC roles alone, as before Phase 2).
  const servedReach: VesselReach = stale ? NO_REACH : profileUserId === null ? LEGACY_REACH : reach;
  // "All vessels": the legacy role, or a membership scoped to every vessel.
  const canAccessAllVessels =
    !foreignProfile &&
    (servedReach.source === 'legacy' ? legacyAllVessels : servedReach.source === 'membership' && servedReach.vesselScope === 'all');

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
      // No company: a definitive "no vessels", so not an error. No
      // membership exists without a company: today's rules apply.
      setReach(LEGACY_REACH);
      setLoadError(null);
      setLoading(false);
      setLoadedFor(owner);
      return;
    }

    try {
      setLoading(true);

      let vesselsData: Vessel[] = [];
      const companyId = profile.company_id;
      const userId = profile.user_id;

      // The whole company fleet, sold vessels included, so vessel codes
      // (D-03) come out the same for every user. A failure here must not
      // stop the reachable vessels loading on the legacy rules: codes then
      // fall back to those.
      const directoryRequest = supabase
        .from('vessels')
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      const assignmentsRequest = () =>
        supabase
          .from('crew_assignments')
          .select('vessel_id')
          .eq('user_id', userId)
          .eq('is_current', true);
      // The legacy rules (D-26) are legacyReach's, the function the shared
      // fixture (reach-cases.json) checks against the SQL: the vessel ids it
      // reaches among `rows`, given the current assignments. Fleet reach is
      // not decided here: useMembershipReach applies reach.ts hasFleetReach,
      // which legacyReach shares, with the RBAC roles this context never holds.
      const legacyVesselIds = (rows: readonly Vessel[], assigned: readonly { vessel_id: string }[]) =>
        new Set(
          legacyReach({
            companyId,
            profileRole: profile.role ?? null,
            rbacRoles: [],
            assignments: assigned.map((a) => ({ vesselId: a.vessel_id, isCurrent: true })),
            companyVessels: rows.map(toReachVessel),
          }).vesselIds,
        );

      // The user's own membership decides which reach rules apply (Phase 2
      // spec §B.4). It runs alongside the vessel reads; a failure (anything
      // but "table not live") throws, so the lists show the error with
      // Retry, never "no vessels" (D-04, D-119).
      const [membershipRead, directoryRes, legacyAssignmentRes] = await Promise.all([
        readOwnMembership(userId, companyId),
        directoryRequest,
        // DPA / shore management see every company vessel; other users
        // their assigned ones, so only they need the assignments up front.
        legacyAllVessels ? Promise.resolve(null) : assignmentsRequest(),
      ]);
      if (!current()) return;
      const mode = reachModeFor(membershipRead, new Date().toISOString());
      // Known as soon as the read lands, so fleet reach holds (a fleet user
      // still reaches the fleet) even if a vessel read below fails.
      setReach(
        mode.source === 'membership'
          ? { source: 'membership', fleetReach: mode.membership.fleetAccess, vesselScope: mode.membership.vesselScope }
          : mode.source === 'legacy'
            ? LEGACY_REACH
            : NO_REACH,
      );
      let allowAllVessels = false;

      if (mode.source === 'legacy' && legacyAllVessels) {
        // D-26: DPA / shore management see all company vessels: legacyReach
        // over the directory (the same rows as `.neq('status', 'Sold')`,
        // which also drops a null status, and never an archived vessel).
        if (directoryRes.error) throw directoryRes.error;
        const directory: Vessel[] = directoryRes.data || [];
        setCompanyVessels(directory);
        const ids = legacyVesselIds(directory, []);
        vesselsData = directory.filter((v) => ids.has(v.id));
        allowAllVessels = true;
      } else if (mode.source === 'legacy') {
        // D-26: other users see only their assigned vessels.
        const { data: assignments, error: assignmentError } = legacyAssignmentRes ?? (await assignmentsRequest());
        if (!current()) return;

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
          // legacyReach over the assigned vessels' own rows, not the
          // directory: a failed directory read then only degrades the codes,
          // as before (the rows read here carry everything the rules check).
          const rows: Vessel[] = data || [];
          const ids = legacyVesselIds(rows, assignments);
          vesselsData = rows.filter((v) => ids.has(v.id));
        }
        setCompanyVessels(directory);
      } else if (mode.source === 'membership') {
        // A membership an admin manages: its reach is cut from the company
        // list, so that list failing is an error here (fail closed).
        const m = mode.membership;
        if (directoryRes.error) throw directoryRes.error;
        const directory: Vessel[] = directoryRes.data || [];
        let assignments: { vessel_id: string }[] = [];
        if (m.vesselScope === 'assigned' && m.kind !== 'external') {
          const { data, error } = legacyAssignmentRes ?? (await assignmentsRequest());
          if (!current()) return;
          if (error) throw error;
          assignments = data || [];
        }
        const ids = new Set(
          membershipReach({
            companyId,
            profileRole: profile.role ?? null,
            rbacRoles: [],
            assignments: assignments.map((a) => ({ vesselId: a.vessel_id, isCurrent: true })),
            companyVessels: directory.map(toReachVessel),
            membership: m,
            // The own-row policy hides the row from a disabled user, so a row
            // read here belongs to an active user.
            userActive: true,
            now: new Date().toISOString(),
          }).vesselIds,
        );
        setCompanyVessels(directory);
        vesselsData = directory.filter((v) => ids.has(v.id));
        allowAllVessels = m.vesselScope === 'all';
      } else {
        // Memberships are live and the user has no usable one: no reach.
        setCompanyVessels([]);
      }

      setVessels(vesselsData);
      setLoadError(null);

      // Restore previous selection from localStorage
      const savedIsAllVessels = localStorage.getItem(STORAGE_KEY_ALL_VESSELS) === 'true';
      const savedVesselId = localStorage.getItem(STORAGE_KEY_VESSEL_ID);

      if (savedIsAllVessels && allowAllVessels) {
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
        } else if (allowAllVessels) {
          // No vessels found but user can access all - set to all vessels mode
          setIsAllVessels(true);
        }
      } else if (vesselsData.length > 0) {
        // No saved selection, default to first vessel
        setSelectedVesselState(vesselsData[0]);
        setIsAllVessels(false);
      } else if (allowAllVessels) {
        // No vessels but user can access all - set to all vessels mode
        setIsAllVessels(true);
      }
    } catch (error) {
      // The lists stay as they were: empty on a first load, the same user's
      // previous lists on a refresh. Either way it is not "no vessels".
      if (current()) {
        console.error('Error loading vessels:', error);
        setLoadError({ message: normaliseError(error, LOAD_ERROR_FALLBACK).message });
      }
    } finally {
      if (current()) {
        setLoading(false);
        setLoadedFor(owner);
      }
    }
  }, [profile?.company_id, profile?.user_id, profile?.role, legacyAllVessels]);

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
    setLoadError(null);
    setReach(NO_REACH);
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
    canAccessAllVessels,
    companyVessels: codeSource,
    vesselCodes,
    getVesselCodeById,
    findVesselByCode,
    loadedForUserId: loadedFor,
    // Never another user's error, nor one served before their lists (D-25, D-41).
    loadError: stale ? null : loadError,
    retryVessels: refreshVessels,
    reach: servedReach,
  };

  return <VesselContext.Provider value={value}>{children}</VesselContext.Provider>;
};

/**
 * The vessel context. Throws outside a VesselProvider, unless called with
 * `{ optional: true }`, which returns null there instead: for shell chrome
 * that only reports on the lists (VesselListNotice) and is also rendered on
 * its own.
 */
export function useVessel(): VesselContextType;
export function useVessel(options: { optional: true }): VesselContextType | null;
export function useVessel(options?: { optional?: boolean }): VesselContextType | null {
  const context = useContext(VesselContext);
  if (context === undefined) {
    if (options?.optional) return null;
    throw new Error('useVessel must be used within a VesselProvider');
  }
  return context;
}
