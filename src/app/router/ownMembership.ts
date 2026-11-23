/**
 * The signed-in user's own membership, read once per vessel-list load
 * (Phase 2 spec §B.4; gap/01 F11, F22–F24; DECISIONS D-01, D-04, D-26,
 * D-119, proposed D-123). VesselContext calls `readOwnMembership` inside its
 * ticketed load, so the read shares the load's stale-user guard and its
 * error state (an error with Retry, never "no vessels").
 *
 * Four outcomes:
 *
 * - `account_memberships` not live (42P01 / PGRST205, `isMissingTable`):
 *   `table-missing` → the D-26 legacy rules, VesselContext's queries as
 *   today;
 * - the row is there → `row`: a legacy-managed row (the backfill, the
 *   profile sync) evaluates the legacy rules, exactly as the server's
 *   `reach_vessels_for` does, so applying P2 changes nobody's reach; any
 *   other row uses its own scope, vessel rows and fleet access;
 * - the table is there but holds no row for the user in their profile's
 *   company → `no-row` → no reach at all (fail closed: the profile sync
 *   gives every profile with a login a row, and a disabled user reads none,
 *   because the own-row policy checks `user_is_active`);
 * - any other error (a missing column, a 403 / 500, the vessel rows'
 *   table missing while the membership table is there) is thrown; the
 *   caller turns it into its error state.
 *
 * Only the caller's own row is read (`user_id = auth.uid()`, the own-row
 * RLS policy); no other user's membership is ever requested here.
 */
import { isMissingTable } from '@/integrations/supabase/pending';
import { authDb } from '@/modules/auth/services/accessDb';
import { membershipIsLive, type ReachMembership, type ReachMembershipVessel } from './membershipReach';

export type OwnMembershipRead =
  | { kind: 'table-missing' }
  | { kind: 'no-row' }
  | { kind: 'row'; membership: ReachMembership };

/**
 * Which rules decide the user's reach, after the read:
 * - `legacy`: D-26 (table not live, or a live legacy-managed row);
 * - `membership`: a live row that is not legacy-managed;
 * - `none`: no row, or a row that is not active or outside its window.
 */
export type ReachMode =
  | { source: 'legacy' }
  | { source: 'membership'; membership: ReachMembership }
  | { source: 'none' };

/**
 * What VesselContext serves about the rules it applied (no ids beyond the
 * flags the scope routes need). `canAccessAllVessels` and the lists carry
 * the vessels; this carries the fleet reach of a non-legacy membership.
 */
export type VesselReach =
  | { source: 'legacy' }
  | { source: 'membership'; fleetReach: boolean; vesselScope: ReachMembership['vesselScope'] }
  | { source: 'none' };

/** Nothing decided yet, or another user's state: no reach (fail closed, D-04). */
export const NO_REACH: VesselReach = { source: 'none' };
export const LEGACY_REACH: VesselReach = { source: 'legacy' };

const MEMBERSHIP_COLUMNS = 'id, kind, status, legacy_managed, fleet_access, vessel_scope, valid_from, valid_until';
const MEMBERSHIP_VESSEL_COLUMNS = 'vessel_id, valid_from, valid_until';

/** The membership row of `userId` in `companyId` (their profile's company), and its vessel rows when they matter. */
export async function readOwnMembership(userId: string, companyId: string): Promise<OwnMembershipRead> {
  const { data, error } = await authDb
    .from('account_memberships')
    .select(MEMBERSHIP_COLUMNS)
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return { kind: 'table-missing' };
    throw error;
  }
  if (!data) return { kind: 'no-row' };

  // Vessel rows count only for a non-legacy membership scoped to assigned
  // vessels; a legacy-managed row is evaluated from the legacy sources.
  let vessels: ReachMembershipVessel[] = [];
  if (!data.legacy_managed && data.vessel_scope === 'assigned' && data.status === 'active') {
    const res = await authDb.from('account_membership_vessels').select(MEMBERSHIP_VESSEL_COLUMNS).eq('membership_id', data.id);
    // Both tables come from the same migration: one without the other is
    // drift, so even a "missing table" here is an error (fail closed).
    if (res.error) throw res.error;
    vessels = (res.data ?? []).map((v) => ({ vesselId: v.vessel_id, validFrom: v.valid_from, validUntil: v.valid_until }));
  }

  return {
    kind: 'row',
    membership: {
      kind: data.kind,
      status: data.status,
      legacyManaged: data.legacy_managed,
      fleetAccess: data.fleet_access,
      vesselScope: data.vessel_scope,
      validFrom: data.valid_from,
      validUntil: data.valid_until,
      vessels,
    },
  };
}

/** The rules that apply to a read at `now` (ISO instant). */
export function reachModeFor(read: OwnMembershipRead, now: string): ReachMode {
  if (read.kind === 'table-missing') return { source: 'legacy' };
  if (read.kind === 'no-row') return { source: 'none' };
  const m = read.membership;
  if (!membershipIsLive(m, now)) return { source: 'none' };
  if (m.legacyManaged) return { source: 'legacy' };
  return { source: 'membership', membership: m };
}
