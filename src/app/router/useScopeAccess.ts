/**
 * What the scope routes need to know about the signed-in user: whether access
 * has loaded, fleet reach, the reachable vessels and their codes. Read from
 * AuthContext, VesselContext and the RBAC store; the decisions themselves are
 * the pure functions in ./reach.ts, ./membershipReach.ts (through
 * ./useMembershipReach.ts: memberships once live, the D-26 legacy rules
 * until then) and ./legacyResolve.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { useVessel, type Vessel } from '@/modules/vessels/contexts/VesselContext';
import { findVesselBySlug } from '@/modules/vessels/lib/vesselSlug';
import { landingPath } from './reach';
import { useMembershipReach } from './useMembershipReach';
import type { LegacyRedirectContext } from './legacyResolve';

export interface ScopeAccess {
  /** Signed in, and auth, vessels and RBAC have loaded at least once. */
  ready: boolean;
  signedIn: boolean;
  /** Auth has finished and nobody is signed in. */
  signedOut: boolean;
  fleetReach: boolean;
  /** The selected vessel's code, else the first reachable vessel's; null if none. */
  lastVesselCode: string | null;
  /**
   * Where this user's "home" is (gap/01 landing rules). A failed vessel-list
   * load never makes it `/me`: without fleet reach or a vessel it is `/`,
   * whose landing redirect shows the error with Retry (D-04).
   */
  homePath: string;
  /**
   * The vessel lists failed to load, or null (D-04, gap/10 A.12). The lists
   * then hold nothing (a first load) or the previous lists of the same user
   * (a refresh), so a missing vessel is not known to be missing: callers
   * show an error with Retry, never "not found" or "no vessels". `ready`
   * still turns true, so the error shows instead of an endless spinner.
   * Never another user's (VesselContext guards it like the lists).
   */
  vesselsError: { message: string } | null;
  /** Loads the vessel lists again (the Retry for `vesselsError`). */
  retryVessels: () => void;
  /** Input for the legacy redirect resolver. */
  legacy: LegacyRedirectContext;
}

/**
 * How long to wait for the profile of a signed-in user before treating it as
 * unreadable. AuthContext gives up on a silent session after the same time.
 */
export const PROFILE_GRACE_MS = 5000;

// Never mutated; shared so the legacy lookups keep a stable identity.
const NO_VESSELS: Vessel[] = [];

export function useScopeAccess(): ScopeAccess {
  const { user, profile, loading: authLoading } = useAuth();
  const vessel = useVessel();
  const rbacInitialized = usePermissionsStore((s) => s.isInitialized);
  // Whose roles the store holds. An account switch can leave `isInitialized`
  // set, and a load that is in flight or has just finished may be the
  // previous user's, so the roles count only once they are this user's own
  // (D-41; fail closed, D-04). A same-user refresh keeps them counted.
  const rbacLoadedFor = usePermissionsStore((s) => s.loadedFor);
  // Fleet reach under the rules VesselContext's load applied: memberships
  // once live, the legacy role and RBAC rules until then (Phase 2 §B.4).
  // RBAC roles count only while they are this user's own.
  const { fleetReach } = useMembershipReach();

  // The profile arrives a moment after the session, and VesselContext only
  // loads once it has one. Wait for it, but not forever: a signed-in user
  // whose profile cannot be read counts as having no vessels.
  const [profileGaveUp, setProfileGaveUp] = useState(false);
  const waitingForProfile = !!user && !profile && !authLoading;
  useEffect(() => {
    if (!waitingForProfile) {
      setProfileGaveUp(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setProfileGaveUp(true), PROFILE_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [waitingForProfile]);
  const userId = user?.id ?? null;
  // The vessel lists count only once they are this user's: VesselContext
  // tags them with the user they were loaded for, and serves nothing while
  // they are another user's (D-25, D-41).
  // A signed-in user whose profile cannot be read has no vessels at all
  // (fail closed), whatever VesselContext still holds.
  const vesselsReady = profile ? !vessel.loading && vessel.loadedForUserId === userId : profileGaveUp;
  const readyNow = !authLoading && !!user && vesselsReady && rbacInitialized && rbacLoadedFor === userId;

  // Once ready, stay ready: a background refresh (refreshVessels, a
  // permissions reload) must not unmount the page the user is working in.
  // The latch belongs to one user: signing out, or switching straight to
  // another account (another tab, no signed-out moment), resets it.
  const latchedFor = useRef<string | null>(null);
  if (latchedFor.current !== userId) latchedFor.current = null;
  if (readyNow && userId) latchedFor.current = userId;
  const ready = readyNow || (userId !== null && latchedFor.current === userId);

  // No readable profile: no vessels, whatever the lists hold.
  const vessels = profile ? vessel.vessels : NO_VESSELS;
  const selectedVesselId = profile ? vessel.selectedVesselId : null;
  const isAllVessels = profile ? vessel.isAllVessels : false;
  const { getVesselCodeById } = vessel;
  const selectedCode = getVesselCodeById(selectedVesselId);
  const firstCode = vessels.length ? getVesselCodeById(vessels[0].id) : null;
  const lastVesselCode = selectedCode ?? firstCode;

  // Not for a signed-in user with no readable profile: that is "no vessels".
  const vesselsError = profile ? vessel.loadError ?? null : null;
  const { refreshVessels } = vessel;
  const retryVessels = useCallback(() => {
    void refreshVessels();
  }, [refreshVessels]);

  const legacy = useMemo<LegacyRedirectContext>(
    () => ({
      fleetReach,
      allVesselsMode: isAllVessels,
      lastVesselCode,
      vesselCodeBySlug: (slug) => {
        const match = findVesselBySlug(vessels, slug);
        return match ? getVesselCodeById(match.id) : null;
      },
      vesselCodeById: (id) => (vessels.some((v) => v.id === id) ? getVesselCodeById(id) : null),
    }),
    [fleetReach, isAllVessels, lastVesselCode, vessels, getVesselCodeById],
  );

  return {
    ready,
    signedIn: !!user,
    signedOut: !authLoading && !user,
    fleetReach,
    lastVesselCode,
    // Fleet reach comes from the role, so a fleet user still lands on the
    // fleet dashboard; anyone else waits on `/` for the list (never `/me`).
    homePath: vesselsError && !fleetReach && !lastVesselCode ? '/' : landingPath({ fleetReach, lastVesselCode }),
    legacy,
    vesselsError,
    retryVessels,
  };
}
