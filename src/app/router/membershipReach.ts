/**
 * Vessel reach and fleet reach, as the database computes them (Phase 2 spec
 * §A.3, §B.4; gap/01 F11, C16; DECISIONS D-26, proposed D-123). Pure: the
 * hooks feed it, the tests drive it with the shared fixture
 * `supabase/tests/fixtures/reach-cases.json`, which the SQL tests of
 * `user_vessel_reach()` / `user_has_fleet_reach()` read too, so the client
 * and the server answer the same question the same way.
 *
 * Two rule sets:
 *
 * - `legacyReach`: D-26, the rules VesselContext's legacy branch runs (it
 *   calls this function) and reach.ts `hasFleetReach` (which this function's
 *   fleet answer delegates to). Used while `account_memberships` does not
 *   exist (D-01), and for a membership marked `legacy_managed` (the
 *   backfilled rows), whose reach the server also evaluates from the legacy
 *   sources.
 *   - vessels: legacy `profiles.role` dpa / shore_management → every vessel
 *     of the company whose `status` is set and is not 'Sold'; anyone else →
 *     the vessels of their current crew assignments with the same status rule;
 *     always only the company's own vessels (RLS);
 *   - a crew assignment is current while `is_current` is set and its leave
 *     date (else end date) has not come (`assignmentIsCurrent`, D-217: the
 *     server's `crew_assignment_is_current`);
 *   - fleet reach: legacy dpa / shore_management, or an active RBAC role that
 *     is fleet-wide (no vessel and the role's default scope is fleet), or
 *     whose name is superadmin / dpa / fleet_master (`FLEET_RBAC_ROLES`).
 * - `membershipReach`: a membership that is not legacy-managed.
 *   - nothing unless the user is active and the membership is `active` and
 *     inside its validity window;
 *   - vessels: `vessel_scope = 'all'` → every non-archived company vessel
 *     (status rule as above); else the membership's vessel rows valid now,
 *     plus current crew assignments (not for `external`);
 *   - fleet reach: `fleet_access`.
 *
 * A vessel counts only while `lifecycle_status` is not 'archived' (when the
 * column is known) and `status` is set and not 'Sold' (legacy parity).
 *
 * Wired by VesselContext's load (src/modules/vessels/contexts/VesselContext.tsx):
 * `./ownMembership.ts` reads the caller's own row and `reachModeFor` picks
 * the rules (`membershipIsLive`); a `legacy` mode cuts the vessel lists with
 * `legacyReach` (the directory for DPA / shore management, else the assigned
 * vessels' own rows), a `membership` mode with `membershipReach`. Fleet
 * reach for the scope routes is `./useMembershipReach.ts` (`fleetReachFor`:
 * reach.ts `hasFleetReach` for the legacy rules, the row's `fleet_access`
 * otherwise). `src/test/router/membershipReach.test.ts` checks both rule sets
 * against the shared fixture, and `src/test/router/reachFixtureVessels.test.tsx`
 * checks the rendered VesselProvider (the code the app runs) against it.
 */
import { hasFleetReach } from './reach';

export interface ReachVessel {
  id: string;
  companyId: string;
  status: string | null;
  /** `vessels.lifecycle_status`, once the P1 column is live. */
  lifecycleStatus?: 'active' | 'inactive' | 'archived' | null;
}

export interface ReachAssignment {
  vesselId: string;
  isCurrent: boolean;
  /** `crew_assignments.leave_date` (YYYY-MM-DD); the row stops counting on that date. */
  leaveDate?: string | null;
  /** `crew_assignments.end_date` (YYYY-MM-DD), used when there is no leave date. */
  endDate?: string | null;
}

/** An RBAC role as `get_user_roles_full` returns it (already active and in date). */
export interface ReachRbacRole {
  roleName: string | null;
  vesselId: string | null;
  isFleetWide: boolean;
}

export interface ReachMembershipVessel {
  vesselId: string;
  validFrom: string | null;
  validUntil: string | null;
}

export interface ReachMembership {
  kind: 'owner' | 'admin' | 'shore' | 'crew' | 'external';
  status: 'invited' | 'active' | 'disabled' | 'removed';
  legacyManaged: boolean;
  fleetAccess: boolean;
  vesselScope: 'all' | 'assigned';
  validFrom: string | null;
  validUntil: string | null;
  vessels: readonly ReachMembershipVessel[];
}

export interface LegacyReachInput {
  companyId: string;
  /** `profiles.role` (legacy user_role enum). */
  profileRole: string | null;
  rbacRoles: readonly ReachRbacRole[];
  assignments: readonly ReachAssignment[];
  /** Every vessel the user's company has (the directory), Sold included. */
  companyVessels: readonly ReachVessel[];
  /** ISO instant the assignments' leave dates (and the validity windows) are checked against. */
  now: string;
}

export interface MembershipReachInput extends LegacyReachInput {
  membership: ReachMembership;
  /** `user_is_active()` / the account status: a disabled user reaches nothing. */
  userActive: boolean;
}

export interface Reach {
  fleetReach: boolean;
  /** Reachable vessel ids, in `companyVessels` order. */
  vesselIds: string[];
}

export const LEGACY_ALL_VESSEL_ROLES: readonly string[] = ['dpa', 'shore_management'];

/** Status rule shared by both rule sets (legacy `.neq('status', 'Sold')` drops a null status too). */
export function vesselInReachableState(v: Pick<ReachVessel, 'status' | 'lifecycleStatus'>): boolean {
  if (v.lifecycleStatus === 'archived') return false;
  return v.status !== null && v.status !== undefined && v.status !== 'Sold';
}

/**
 * A crew assignment counts as current (D-217; review round 5,
 * stale-is-current-keeps-reach; SQL `crew_assignment_is_current`):
 * `is_current` is set and its leave date, else its end date, has not come
 * by the UTC date of `now` (the server compares with `current_date`, which
 * is UTC on the project). A row whose leave date passed after it was
 * written still says `is_current` until the daily sweep ends it; it never
 * counts. An invalid `now` counts nothing (fail closed).
 */
export function assignmentIsCurrent(a: ReachAssignment, now: string): boolean {
  if (!a.isCurrent) return false;
  const at = Date.parse(now);
  if (Number.isNaN(at)) return false;
  const ends = a.leaveDate ?? a.endDate ?? null;
  if (!ends) return true;
  const today = new Date(at).toISOString().slice(0, 10);
  return !(ends.slice(0, 10) <= today);
}

function inWindow(from: string | null, until: string | null, now: number): boolean {
  if (from && Date.parse(from) > now) return false;
  if (until && Date.parse(until) <= now) return false;
  return true;
}

/**
 * The membership counts at `now`: status `active` and inside its validity
 * window. Anything else (invited, disabled, removed, not yet valid,
 * expired) reaches nothing, legacy-managed or not.
 */
export function membershipIsLive(m: Pick<ReachMembership, 'status' | 'validFrom' | 'validUntil'>, now: string): boolean {
  return m.status === 'active' && inWindow(m.validFrom, m.validUntil, Date.parse(now));
}

/**
 * D-26 fleet reach: reach.ts `hasFleetReach` (one rule set, the one the
 * scope routes apply through useMembershipReach), fed as VesselContext and
 * the permissions store feed it: the legacy all-vessel role, a fleet-wide
 * RBAC role, or a fleet RBAC role name (reach.ts `FLEET_RBAC_ROLES`).
 */
function legacyFleetReach(input: Pick<LegacyReachInput, 'profileRole' | 'rbacRoles'>): boolean {
  return hasFleetReach({
    canAccessAllVessels: !!input.profileRole && LEGACY_ALL_VESSEL_ROLES.includes(input.profileRole),
    hasFleetWideRole: input.rbacRoles.some((r) => r.isFleetWide),
    rbacRoles: input.rbacRoles.map((r) => r.roleName),
  });
}

function ownVessels(input: LegacyReachInput): ReachVessel[] {
  return input.companyVessels.filter((v) => v.companyId === input.companyId && vesselInReachableState(v));
}

/** D-26: today's rules (VesselContext + reach.ts). */
export function legacyReach(input: LegacyReachInput): Reach {
  const own = ownVessels(input);
  const allVessels = !!input.profileRole && LEGACY_ALL_VESSEL_ROLES.includes(input.profileRole);
  const assigned = new Set(input.assignments.filter((a) => assignmentIsCurrent(a, input.now)).map((a) => a.vesselId));
  return {
    fleetReach: legacyFleetReach(input),
    vesselIds: own.filter((v) => allVessels || assigned.has(v.id)).map((v) => v.id),
  };
}

/** A membership's reach (the server's `user_vessel_reach` / `user_has_fleet_reach`). */
export function membershipReach(input: MembershipReachInput): Reach {
  const m = input.membership;
  const now = Date.parse(input.now);
  if (!input.userActive || !membershipIsLive(m, input.now)) {
    return { fleetReach: false, vesselIds: [] };
  }
  // A live legacy-managed row is the legacy rules, as the SQL
  // `user_vessel_reach` evaluates it. VesselContext never gets here with one
  // (`reachModeFor` sends such a row to its legacy branch, which calls
  // `legacyReach` itself); this keeps the function a mirror of the SQL for
  // any row, which the fixture test relies on for the backfilled rows.
  if (m.legacyManaged) return legacyReach(input);

  const own = ownVessels(input);
  if (m.vesselScope === 'all') return { fleetReach: m.fleetAccess, vesselIds: own.map((v) => v.id) };
  const ids = new Set(m.vessels.filter((v) => inWindow(v.validFrom, v.validUntil, now)).map((v) => v.vesselId));
  if (m.kind !== 'external') for (const a of input.assignments) if (assignmentIsCurrent(a, input.now)) ids.add(a.vesselId);
  return { fleetReach: m.fleetAccess, vesselIds: own.filter((v) => ids.has(v.id)).map((v) => v.id) };
}
