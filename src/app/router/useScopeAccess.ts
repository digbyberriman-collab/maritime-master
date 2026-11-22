/**
 * What the scope routes need to know about the signed-in user: whether access
 * has loaded, fleet reach, the reachable vessels and their codes. Read from
 * AuthContext, VesselContext and the RBAC store; the decisions themselves are
 * the pure functions in ./reach.ts and ./legacyResolve.ts.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { findVesselBySlug } from '@/modules/vessels/lib/vesselSlug';
import { hasFleetReach, landingPath } from './reach';
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
  /** Where this user's "home" is (gap/01 landing rules). */
  homePath: string;
  /** Input for the legacy redirect resolver. */
  legacy: LegacyRedirectContext;
}

/**
 * How long to wait for the profile of a signed-in user before treating it as
 * unreadable. AuthContext gives up on a silent session after the same time.
 */
export const PROFILE_GRACE_MS = 5000;

export function useScopeAccess(): ScopeAccess {
  const { user, profile, loading: authLoading } = useAuth();
  const vessel = useVessel();
  const rbacInitialized = usePermissionsStore((s) => s.isInitialized);
  const hasFleetWideRole = usePermissionsStore((s) => s.hasFleetAccess);
  const userRoles = usePermissionsStore((s) => s.userRoles);

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
  const vesselsReady = profile ? !vessel.loading : profileGaveUp;
  const readyNow = !authLoading && !!user && vesselsReady && rbacInitialized;

  // Once ready, stay ready: a background refresh (refreshVessels, a
  // permissions reload) must not unmount the page the user is working in.
  const readyOnce = useRef(false);
  if (readyNow) readyOnce.current = true;
  if (!user) readyOnce.current = false;
  const ready = readyNow || readyOnce.current;

  const fleetReach = hasFleetReach({
    canAccessAllVessels: vessel.canAccessAllVessels,
    hasFleetWideRole,
    rbacRoles: (userRoles ?? []).map((r) => r.role_name),
  });

  const selectedCode = vessel.getVesselCodeById(vessel.selectedVesselId);
  const firstCode = vessel.vessels.length ? vessel.getVesselCodeById(vessel.vessels[0].id) : null;
  const lastVesselCode = selectedCode ?? firstCode;

  const { vessels, getVesselCodeById, isAllVessels } = vessel;
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
    homePath: landingPath({ fleetReach, lastVesselCode }),
    legacy,
  };
}
