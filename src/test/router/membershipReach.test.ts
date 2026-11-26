/**
 * Reach parity with the database (Phase 2 spec §A.3, §B.4, §E): every user
 * of the shared fixture `supabase/tests/fixtures/reach-cases.json` gets
 * exactly `expected.legacy` from `legacyReach` (D-26, the rules while
 * `account_memberships` is not live) and exactly `expected.membership` from
 * `membershipReach` (what `user_vessel_reach()` / `user_has_fleet_reach()`
 * answer once it is: a backfilled legacy-managed row for users whose
 * `membership` is null). The SQL tests in `supabase/tests/sql/p2_reach` read
 * the same file, so client and server cannot drift apart unnoticed.
 * `legacyReach` is the function VesselContext's legacy branch calls, and
 * ./reachFixtureVessels.test.tsx renders VesselProvider for every fixture
 * user, so the fixture also holds the code the app runs.
 *
 * RBAC roles are filtered as `get_user_roles_full` does before the client
 * sees them: active and in date only, `isFleetWide` = no vessel and the
 * role's default scope is `fleet`.
 *
 * Also here: the own-membership read (`readOwnMembership`) against a mocked
 * client, for each of its outcomes, and `reachModeFor`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Reply = { data: unknown; error: unknown };
const h = vi.hoisted(() => ({
  replies: new Map<string, Reply>(),
  calls: [] as { table: string; columns: string; filters: [string, unknown][]; single: boolean }[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const call = { table, columns: '', filters: [] as [string, unknown][], single: false };
    h.calls.push(call);
    const builder = {
      select: (columns: string) => {
        call.columns = columns;
        return builder;
      },
      eq: (k: string, v: unknown) => {
        call.filters.push([k, v]);
        return builder;
      },
      maybeSingle: () => {
        call.single = true;
        return builder;
      },
      then: (resolve: (v: Reply) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(h.replies.get(table) ?? { data: call.single ? null : [], error: null }).then(resolve, reject),
    };
    return builder;
  };
  return { supabase: { from } };
});

import {
  assignmentIsCurrent,
  legacyReach,
  membershipIsLive,
  membershipReach,
  vesselInReachableState,
  type ReachMembership,
  type ReachRbacRole,
  type ReachVessel,
} from '@/app/router/membershipReach';
import { readOwnMembership, reachModeFor } from '@/app/router/ownMembership';
import { fleetReachFor } from '@/app/router/useMembershipReach';

// ─── The shared fixture ──────────────────────────────────────────────────

interface FixtureVessel {
  key: string;
  company: string;
  name: string;
  status: string | null;
  lifecycleStatus: 'active' | 'inactive' | 'archived' | null;
  createdAt: string;
}
interface FixtureRole {
  roleName: string | null;
  vessel: string | null;
  defaultScope: string;
  isActive: boolean;
  validUntil: string | null;
}
interface FixtureMembership {
  kind: ReachMembership['kind'];
  status: ReachMembership['status'];
  legacyManaged: boolean;
  fleetAccess: boolean;
  vesselScope: ReachMembership['vesselScope'];
  validFrom: string | null;
  validUntil: string | null;
  vessels: { vessel: string; validFrom: string | null; validUntil: string | null }[];
}
interface Expected {
  fleetReach: boolean;
  vessels: string[];
}
interface FixtureUser {
  key: string;
  company: string;
  profileRole: string | null;
  accountStatus: string | null;
  rbacRoles: FixtureRole[];
  assignments: { vessel: string; isCurrent: boolean; leaveDate?: string; endDate?: string }[];
  membership: FixtureMembership | null;
  expected: { legacy: Expected; membership: Expected };
}
interface Fixture {
  now: string;
  vessels: FixtureVessel[];
  users: FixtureUser[];
}

const fixture = JSON.parse(readFileSync(join(process.cwd(), 'supabase/tests/fixtures/reach-cases.json'), 'utf8')) as Fixture;

/** The vessels a user's company has (RLS: never another company's), as the client reads them. */
const companyVessels = (company: string): ReachVessel[] =>
  fixture.vessels
    .filter((v) => v.company === company)
    .map((v) => ({ id: v.key, companyId: v.company, status: v.status, lifecycleStatus: v.lifecycleStatus }));

/** `get_user_roles_full`: active, in-date rows only; fleet-wide = no vessel and a fleet default scope. */
const rbacRolesOf = (u: FixtureUser, now: string): ReachRbacRole[] =>
  u.rbacRoles
    .filter((r) => r.isActive && (r.validUntil === null || Date.parse(r.validUntil) > Date.parse(now)))
    .map((r) => ({ roleName: r.roleName, vesselId: r.vessel, isFleetWide: r.vessel === null && r.defaultScope === 'fleet' }));

/** D-122: only `disabled` / `deactivated` deny; null or any other value is active. */
const isActive = (u: FixtureUser): boolean => !['disabled', 'deactivated'].includes((u.accountStatus ?? 'active').toLowerCase());

/** The row the backfill / profile sync writes for a user without an explicit membership (§A.3). */
const backfilled = (u: FixtureUser): ReachMembership => {
  const allVessels = u.profileRole === 'dpa' || u.profileRole === 'shore_management';
  return {
    kind: allVessels ? 'admin' : 'crew',
    status: isActive(u) ? 'active' : 'disabled',
    legacyManaged: true,
    // The sync stores legacy_fleet_reach(); a legacy-managed row is evaluated from the legacy sources anyway.
    fleetAccess: false,
    vesselScope: allVessels ? 'all' : 'assigned',
    validFrom: null,
    validUntil: null,
    vessels: [],
  };
};

const legacyInput = (u: FixtureUser) => ({
  companyId: u.company,
  profileRole: u.profileRole,
  rbacRoles: rbacRolesOf(u, fixture.now),
  assignments: u.assignments.map((a) => ({ vesselId: a.vessel, isCurrent: a.isCurrent, leaveDate: a.leaveDate ?? null, endDate: a.endDate ?? null })),
  companyVessels: companyVessels(u.company),
  now: fixture.now,
});

const membershipOf = (u: FixtureUser): ReachMembership =>
  u.membership
    ? { ...u.membership, vessels: u.membership.vessels.map((v) => ({ vesselId: v.vessel, validFrom: v.validFrom, validUntil: v.validUntil })) }
    : backfilled(u);

describe('reach-cases.json parity (D-26 and memberships)', () => {
  it('reads the shared fixture: 25 users over two companies', () => {
    expect(fixture.users).toHaveLength(25);
    expect(new Set(fixture.users.map((u) => u.company))).toEqual(new Set(['A', 'B']));
    expect(fixture.users.filter((u) => u.membership).length).toBeGreaterThan(0);
  });

  it.each(fixture.users.map((u) => [u.key, u] as const))('%s: the legacy rules give expected.legacy', (_key, u) => {
    const reach = legacyReach(legacyInput(u));
    expect({ fleetReach: reach.fleetReach, vessels: reach.vesselIds }).toEqual(u.expected.legacy);
  });

  it.each(fixture.users.map((u) => [u.key, u] as const))('%s: the membership rules give expected.membership', (_key, u) => {
    const reach = membershipReach({ ...legacyInput(u), membership: membershipOf(u), userActive: isActive(u), now: fixture.now });
    expect({ fleetReach: reach.fleetReach, vessels: reach.vesselIds }).toEqual(u.expected.membership);
  });

  it('the client path gives the same answers: reachModeFor + the legacy rules or the row (25/25)', () => {
    const mismatches: string[] = [];
    for (const u of fixture.users) {
      // A disabled user reads no row (the own-row policy checks user_is_active).
      const read = isActive(u) ? ({ kind: 'row', membership: membershipOf(u) } as const) : ({ kind: 'no-row' } as const);
      const mode = reachModeFor(read, fixture.now);
      const legacy = legacyReach(legacyInput(u));
      const got =
        mode.source === 'legacy'
          ? legacy
          : mode.source === 'none'
            ? { fleetReach: false, vesselIds: [] }
            : membershipReach({ ...legacyInput(u), membership: mode.membership, userActive: true, now: fixture.now });
      const expected = u.expected.membership;
      if (got.fleetReach !== expected.fleetReach || JSON.stringify(got.vesselIds) !== JSON.stringify(expected.vessels)) mismatches.push(u.key);
    }
    expect(mismatches).toEqual([]);
  });

  it('with the table missing every user gets expected.legacy (25/25)', () => {
    const mismatches = fixture.users.filter((u) => {
      const mode = reachModeFor({ kind: 'table-missing' }, fixture.now);
      expect(mode.source).toBe('legacy');
      const got = legacyReach(legacyInput(u));
      return got.fleetReach !== u.expected.legacy.fleetReach || JSON.stringify(got.vesselIds) !== JSON.stringify(u.expected.legacy.vessels);
    });
    expect(mismatches.map((u) => u.key)).toEqual([]);
  });
});

describe('reach rules, unit', () => {
  it('a crew assignment counts only while is_current and its leave (else end) date has not come (D-217)', () => {
    const now = '2026-11-23T12:00:00Z';
    expect(assignmentIsCurrent({ vesselId: 'v', isCurrent: true }, now)).toBe(true);
    expect(assignmentIsCurrent({ vesselId: 'v', isCurrent: false }, now)).toBe(false);
    // A stale row: still says is_current, its leave date has passed.
    expect(assignmentIsCurrent({ vesselId: 'v', isCurrent: true, leaveDate: '2026-01-15' }, now)).toBe(false);
    // The leave date itself no longer counts (<= today), the day before does.
    expect(assignmentIsCurrent({ vesselId: 'v', isCurrent: true, leaveDate: '2026-11-23' }, now)).toBe(false);
    expect(assignmentIsCurrent({ vesselId: 'v', isCurrent: true, leaveDate: '2026-11-24' }, now)).toBe(true);
    // No leave date: the end date decides; a leave date wins over the end date.
    expect(assignmentIsCurrent({ vesselId: 'v', isCurrent: true, endDate: '2026-02-28' }, now)).toBe(false);
    expect(assignmentIsCurrent({ vesselId: 'v', isCurrent: true, leaveDate: '2099-12-31', endDate: '2026-02-28' }, now)).toBe(true);
    expect(assignmentIsCurrent({ vesselId: 'v', isCurrent: true, leaveDate: null, endDate: null }, now)).toBe(true);
    // The UTC date of now: 23:30 at UTC-2 is already the 24th in UTC.
    expect(assignmentIsCurrent({ vesselId: 'v', isCurrent: true, leaveDate: '2026-11-24' }, '2026-11-23T23:30:00-02:00')).toBe(false);
    // An unreadable instant counts nothing (fail closed).
    expect(assignmentIsCurrent({ vesselId: 'v', isCurrent: true }, 'not a date')).toBe(false);
  });

  it('a vessel is reachable only with a set status that is not Sold, and never archived', () => {
    expect(vesselInReachableState({ status: 'Active' })).toBe(true);
    expect(vesselInReachableState({ status: 'Active', lifecycleStatus: 'inactive' })).toBe(true);
    expect(vesselInReachableState({ status: 'Active', lifecycleStatus: 'archived' })).toBe(false);
    expect(vesselInReachableState({ status: 'Sold' })).toBe(false);
    expect(vesselInReachableState({ status: null })).toBe(false);
  });

  it('membershipIsLive: active and inside the window, the bounds as the SQL reads them', () => {
    const m = { status: 'active' as const, validFrom: '2026-11-23T12:00:00Z', validUntil: '2026-11-24T00:00:00Z' };
    expect(membershipIsLive(m, '2026-11-23T12:00:00Z')).toBe(true);
    expect(membershipIsLive(m, '2026-11-23T11:59:59Z')).toBe(false);
    // valid_until is exclusive (`valid_until > now()`).
    expect(membershipIsLive(m, '2026-11-24T00:00:00Z')).toBe(false);
    expect(membershipIsLive({ ...m, status: 'invited' }, '2026-11-23T13:00:00Z')).toBe(false);
  });

  it('reachModeFor: table missing → legacy; no row → none; a live legacy row → legacy; an admin row → membership', () => {
    const now = '2026-11-23T12:00:00Z';
    const row = (patch: Partial<ReachMembership>) =>
      ({ kind: 'row', membership: { kind: 'shore', status: 'active', legacyManaged: false, fleetAccess: true, vesselScope: 'all', validFrom: null, validUntil: null, vessels: [], ...patch } }) as const;
    expect(reachModeFor({ kind: 'table-missing' }, now)).toEqual({ source: 'legacy' });
    expect(reachModeFor({ kind: 'no-row' }, now)).toEqual({ source: 'none' });
    expect(reachModeFor(row({ legacyManaged: true }), now)).toEqual({ source: 'legacy' });
    expect(reachModeFor(row({ legacyManaged: true, status: 'removed' }), now)).toEqual({ source: 'none' });
    expect(reachModeFor(row({ validUntil: '2026-01-01T00:00:00Z' }), now)).toEqual({ source: 'none' });
    expect(reachModeFor(row({}), now)).toMatchObject({ source: 'membership', membership: { fleetAccess: true } });
  });

  it('fleetReachFor: the legacy helpers only under the legacy rules', () => {
    const legacyDpa = { canAccessAllVessels: true, hasFleetWideRole: false, rbacRoles: [] };
    const rbacFleet = { canAccessAllVessels: false, hasFleetWideRole: true, rbacRoles: ['fleet_master'] };
    expect(fleetReachFor({ source: 'legacy' }, legacyDpa)).toBe(true);
    expect(fleetReachFor({ source: 'legacy' }, rbacFleet)).toBe(true);
    expect(fleetReachFor({ source: 'legacy' }, { canAccessAllVessels: false, hasFleetWideRole: false, rbacRoles: ['captain'] })).toBe(false);
    expect(fleetReachFor({ source: 'membership', fleetReach: false, vesselScope: 'assigned' }, rbacFleet)).toBe(false);
    expect(fleetReachFor({ source: 'membership', fleetReach: true, vesselScope: 'assigned' }, { canAccessAllVessels: false, hasFleetWideRole: false, rbacRoles: [] })).toBe(true);
    expect(fleetReachFor({ source: 'none' }, legacyDpa)).toBe(false);
  });
});

describe('readOwnMembership: the four read outcomes', () => {
  afterEach(() => {
    h.replies.clear();
    h.calls.length = 0;
  });

  const row = {
    id: 'm1',
    kind: 'shore',
    status: 'active',
    legacy_managed: false,
    fleet_access: false,
    vessel_scope: 'assigned',
    valid_from: null,
    valid_until: '2027-01-01T00:00:00Z',
  };

  it('table missing (PGRST205 or 42P01) → table-missing; nothing else is read', async () => {
    h.replies.set('account_memberships', { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.account_memberships' in the schema cache" } });
    await expect(readOwnMembership('u1', 'c1')).resolves.toEqual({ kind: 'table-missing' });
    h.replies.set('account_memberships', { data: null, error: { code: '42P01', message: 'relation "public.account_memberships" does not exist' } });
    await expect(readOwnMembership('u1', 'c1')).resolves.toEqual({ kind: 'table-missing' });
    expect(h.calls.map((c) => c.table)).toEqual(['account_memberships', 'account_memberships']);
  });

  it('asks for the caller\'s own row in their profile company only', async () => {
    await readOwnMembership('u1', 'c1');
    expect(h.calls[0]).toMatchObject({ table: 'account_memberships', filters: [['user_id', 'u1'], ['company_id', 'c1']], single: true });
    expect(h.calls[0].columns).toBe('id, kind, status, legacy_managed, fleet_access, vessel_scope, valid_from, valid_until');
  });

  it('table present, no row → no-row', async () => {
    h.replies.set('account_memberships', { data: null, error: null });
    await expect(readOwnMembership('u1', 'c1')).resolves.toEqual({ kind: 'no-row' });
  });

  it('a row → row, with its vessel rows for an assigned, admin-managed membership', async () => {
    h.replies.set('account_memberships', { data: row, error: null });
    h.replies.set('account_membership_vessels', { data: [{ vessel_id: 'v1', valid_from: null, valid_until: '2026-12-01T00:00:00Z' }], error: null });
    await expect(readOwnMembership('u1', 'c1')).resolves.toEqual({
      kind: 'row',
      membership: {
        kind: 'shore',
        status: 'active',
        legacyManaged: false,
        fleetAccess: false,
        vesselScope: 'assigned',
        validFrom: null,
        validUntil: '2027-01-01T00:00:00Z',
        vessels: [{ vesselId: 'v1', validFrom: null, validUntil: '2026-12-01T00:00:00Z' }],
      },
    });
    expect(h.calls[1]).toMatchObject({ table: 'account_membership_vessels', filters: [['membership_id', 'm1']] });
  });

  it('a legacy-managed or all-vessel row does not read vessel rows', async () => {
    h.replies.set('account_memberships', { data: { ...row, legacy_managed: true }, error: null });
    await readOwnMembership('u1', 'c1');
    h.replies.set('account_memberships', { data: { ...row, vessel_scope: 'all' }, error: null });
    await readOwnMembership('u1', 'c1');
    expect(h.calls.map((c) => c.table)).toEqual(['account_memberships', 'account_memberships']);
  });

  it.each([
    ['a 403', { code: '42501', message: 'permission denied for table account_memberships' }],
    ['a 500', { code: '500', message: 'Internal Server Error' }],
    ['a missing column (schema drift, not "not live")', { code: '42703', message: 'column account_memberships.vessel_scope does not exist' }],
  ])('%s is thrown (fail closed: the caller shows an error with Retry)', async (_name, error) => {
    h.replies.set('account_memberships', { data: null, error });
    await expect(readOwnMembership('u1', 'c1')).rejects.toBe(error);
  });

  it('a failing vessel-rows read is thrown, even "table missing" (both tables come from one migration)', async () => {
    h.replies.set('account_memberships', { data: row, error: null });
    const missing = { code: 'PGRST205', message: "Could not find the table 'public.account_membership_vessels' in the schema cache" };
    h.replies.set('account_membership_vessels', { data: null, error: missing });
    await expect(readOwnMembership('u1', 'c1')).rejects.toBe(missing);
  });
});
