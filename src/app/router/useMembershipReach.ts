/**
 * Fleet reach for the scope routes, from the reach rules VesselContext's
 * last load applied (Phase 2 spec §B.4; DECISIONS D-26, D-04, D-41,
 * proposed D-123):
 *
 * - `legacy` (`account_memberships` not live, or the user's row is
 *   legacy-managed): `hasFleetReach` in ./reach.ts, exactly as before
 *   Phase 2: the legacy DPA / shore-management role, a fleet-wide RBAC
 *   role, or a superadmin / DPA / fleet-master RBAC role;
 * - `membership` (a row an admin manages): the row's `fleet_access`;
 * - `none` (memberships live, no usable row; or nothing loaded yet for this
 *   user): no fleet reach.
 *
 * `reachUnknown`: the rules were never decided because the load failed (the
 * membership read threw before VesselContext set its reach, so the source
 * is still `none` and the served `loadError` is set). `fleetReach` is then
 * false only for want of an answer: callers show the vessel-list error with
 * Retry, never "not available to you" (D-165, D-119; fail closed, D-04).
 * Nothing else gives `none` with a load error: a no-row read loads without
 * one, and a failed refresh keeps the reach the previous load decided.
 *
 * The vessel lists themselves come from VesselContext, which reads the
 * membership (./ownMembership.ts) inside its ticketed load, so a failed
 * read is its `loadError` with Retry, never "no vessels".
 */
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { hasFleetReach, type FleetReachInput } from './reach';
import { LEGACY_REACH, type VesselReach } from './ownMembership';

/** Fleet reach under the rules in `reach`; `legacy` is only consulted for the legacy rules. */
export function fleetReachFor(reach: VesselReach, legacy: FleetReachInput): boolean {
  if (reach.source === 'legacy') return hasFleetReach(legacy);
  if (reach.source === 'membership') return reach.fleetReach;
  return false;
}

export interface MembershipReachState {
  /** Which rules decided (VesselContext's `reach.source`). */
  source: VesselReach['source'];
  fleetReach: boolean;
  /**
   * The load failed before any reach rules were decided: `fleetReach` is
   * not an answer. Uses the served `loadError`, so it is never another
   * user's or a stale state's.
   */
  reachUnknown: boolean;
}

export function useMembershipReach(): MembershipReachState {
  const { user } = useAuth();
  const vessel = useVessel();
  // VesselProvider always sets `reach`; a hand-built context without it
  // (a test double that predates Phase 2) means today's legacy rules.
  const reach = vessel.reach ?? LEGACY_REACH;
  const { canAccessAllVessels } = vessel;
  // Whose roles the store holds: they count only while they are this
  // user's own (D-41; fail closed, D-04). A same-user refresh keeps them.
  const rbacLoadedFor = usePermissionsStore((s) => s.loadedFor);
  const hasFleetWideRole = usePermissionsStore((s) => s.hasFleetAccess);
  const userRoles = usePermissionsStore((s) => s.userRoles);
  const userId = user?.id ?? null;
  const ownRoles = userId !== null && rbacLoadedFor === userId;
  return {
    source: reach.source,
    reachUnknown: reach.source === 'none' && Boolean(vessel.loadError),
    fleetReach: fleetReachFor(reach, {
      canAccessAllVessels,
      hasFleetWideRole: ownRoles && hasFleetWideRole,
      rbacRoles: ownRoles ? (userRoles ?? []).map((r) => r.role_name) : [],
    }),
  };
}
