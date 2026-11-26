/**
 * The shared reach fixture against the code the app runs (Phase 2 spec
 * §A.3, §B.4; DECISIONS D-26, D-123): every user of
 * `supabase/tests/fixtures/reach-cases.json` signs in through the real
 * AuthProvider, permissions store and VesselProvider, and the vessel list
 * VesselContext serves plus the fleet reach `useMembershipReach` answers
 * must equal the fixture's expectation. The SQL tests of
 * `user_vessel_reach()` / `user_has_fleet_reach()` read the same file
 * (supabase/tests/sql/p2_reach), so the rendered client and the server are
 * held to one answer. membershipReach.test.ts checks the pure functions;
 * this file checks that VesselContext's load really runs them.
 *
 * Three modes:
 * - `account_memberships` not live (D-01): every user gets `expected.legacy`;
 * - the backfilled legacy-managed row (users the fixture gives no explicit
 *   membership): `expected.membership`, which is the legacy answer for an
 *   active user; a disabled user reads no row (the own-row policy checks
 *   `user_is_active`), so reaches nothing;
 * - an explicit, admin-managed membership: `expected.membership`.
 *
 * Supabase is a small fake fed from the fixture: RLS keeps each user to
 * their company's vessels and their own membership row; `get_user_roles_full`
 * returns the active, in-date roles with `is_fleet_wide` = no vessel and a
 * fleet default scope, as the RPC does. The clock is the fixture's `now`.
 * The fixture is read only. Role names only; no personal data.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  listeners: [] as ((event: string, session: unknown) => void)[],
  current: null as { id: string; email: string } | null,
  tables: { profiles: [] as Row[], vessels: [] as Row[], crew_assignments: [] as Row[] },
  /** `account_memberships` rows, or 'missing' (the table is not live). */
  memberships: 'missing' as Row[] | 'missing',
  membershipVessels: [] as Row[],
  /** user_id → the rows get_user_roles_full returns. */
  roles: new Map<string, Row[]>(),
  /** user_ids the own-row policy hides the membership from (`user_is_active` false). */
  inactive: new Set<string>(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const MISSING = { code: 'PGRST205', message: "Could not find the table 'public.account_memberships' in the schema cache" };
  const companyOf = (uid: string | undefined) => h.tables.profiles.find((p) => p.user_id === uid)?.company_id;
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let single = false;
    const builder = {
      select: () => builder,
      order: () => builder,
      eq: (k: string, v: unknown) => {
        filters.push((r) => r[k] === v);
        return builder;
      },
      // PostgREST's neq drops NULL too.
      neq: (k: string, v: unknown) => {
        filters.push((r) => r[k] !== null && r[k] !== undefined && r[k] !== v);
        return builder;
      },
      in: (k: string, vs: unknown[]) => {
        filters.push((r) => vs.includes(r[k]));
        return builder;
      },
      maybeSingle: () => {
        single = true;
        return builder;
      },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        const result = () => {
          const uid = h.current?.id;
          let source: Row[] = (h.tables as Record<string, Row[]>)[table] ?? [];
          if (table === 'account_memberships') {
            if (h.memberships === 'missing') return { data: null, error: MISSING };
            // Own row only, and none for an inactive user.
            source = h.memberships.filter((r) => r.user_id === uid && !h.inactive.has(String(uid)));
          }
          if (table === 'account_membership_vessels') source = h.membershipVessels;
          // RLS: a user reads only their company's vessels.
          if (table === 'vessels') source = source.filter((r) => r.company_id === companyOf(uid));
          const rows = source.filter((r) => filters.every((f) => f(r)));
          return { data: single ? rows[0] ?? null : rows, error: null };
        };
        return Promise.resolve().then(result).then(resolve, reject);
      },
    };
    return builder;
  };
  return {
    supabase: {
      from,
      rpc: (name: string, args: { p_user_id: string }) => {
        if (name === 'record_session_start') return Promise.resolve({ data: 'active', error: null });
        return Promise.resolve({ data: name === 'get_user_roles_full' ? h.roles.get(args?.p_user_id) ?? [] : [], error: null });
      },
      auth: {
        onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
          h.listeners.push(cb);
          return { data: { subscription: { unsubscribe: () => { h.listeners = h.listeners.filter((x) => x !== cb); } } } };
        },
        getSession: () => Promise.resolve({ data: { session: h.current ? { user: h.current } : null } }),
        getUser: () => Promise.resolve({ data: { user: h.current } }),
        signOut: async () => {
          h.current = null;
          return { error: null };
        },
      },
    },
  };
});

import { AuthProvider } from '@/modules/auth/contexts/AuthContext';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { VesselProvider, useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useMembershipReach } from '@/app/router/useMembershipReach';

// ─── The shared fixture (read only) ──────────────────────────────────────

interface FixtureVessel {
  key: string;
  company: string;
  name: string;
  status: string | null;
  lifecycleStatus: string | null;
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
  kind: string;
  status: string;
  legacyManaged: boolean;
  fleetAccess: boolean;
  vesselScope: string;
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

const userId = (u: FixtureUser) => `u-${u.key}`;
/** D-122: only `disabled` / `deactivated` deny; null or any other value is active. */
const isActive = (u: FixtureUser) => !['disabled', 'deactivated'].includes((u.accountStatus ?? 'active').toLowerCase());

/** The row the backfill / profile sync writes for a user without an explicit membership (§A.3). */
const backfilledRow = (u: FixtureUser): Row => {
  const allVessels = u.profileRole === 'dpa' || u.profileRole === 'shore_management';
  return {
    id: `m-${u.key}`,
    company_id: u.company,
    user_id: userId(u),
    kind: allVessels ? 'admin' : 'crew',
    status: isActive(u) ? 'active' : 'disabled',
    legacy_managed: true,
    fleet_access: false,
    vessel_scope: allVessels ? 'all' : 'assigned',
    valid_from: null,
    valid_until: null,
  };
};

const explicitRow = (u: FixtureUser, m: FixtureMembership): Row => ({
  id: `m-${u.key}`,
  company_id: u.company,
  user_id: userId(u),
  kind: m.kind,
  status: m.status,
  legacy_managed: m.legacyManaged,
  fleet_access: m.fleetAccess,
  vessel_scope: m.vesselScope,
  valid_from: m.validFrom,
  valid_until: m.validUntil,
});

beforeAll(() => {
  h.tables.profiles = fixture.users.map((u) => ({
    id: `p-${u.key}`,
    user_id: userId(u),
    company_id: u.company,
    role: u.profileRole,
    first_name: 'Fixture',
    last_name: 'User',
  }));
  h.tables.vessels = fixture.vessels.map((v) => ({
    id: v.key,
    company_id: v.company,
    name: v.name,
    status: v.status,
    lifecycle_status: v.lifecycleStatus,
    created_at: v.createdAt,
  }));
  h.tables.crew_assignments = fixture.users.flatMap((u) =>
    // With the leave and end dates VesselContext now selects (D-217): a stale
    // row still says is_current, and its dates make it not count.
    u.assignments.map((a) => ({
      user_id: userId(u),
      vessel_id: a.vessel,
      is_current: a.isCurrent,
      leave_date: a.leaveDate ?? null,
      end_date: a.endDate ?? null,
    })),
  );
  // get_user_roles_full: active, in-date rows only; fleet-wide = no vessel and a fleet default scope.
  for (const u of fixture.users) {
    h.roles.set(
      userId(u),
      u.rbacRoles
        .filter((r) => r.isActive && (r.validUntil === null || Date.parse(r.validUntil) > Date.parse(fixture.now)))
        .map((r) => ({ role_name: r.roleName, vessel_id: r.vessel, is_fleet_wide: r.vessel === null && r.defaultScope === 'fleet' })),
    );
  }
  for (const u of fixture.users) if (!isActive(u)) h.inactive.add(userId(u));
});

// ─── Harness ─────────────────────────────────────────────────────────────

interface Snapshot {
  loaded: boolean;
  source: string;
  fleetReach: boolean;
  vessels: string[];
  loadError: string | null;
}

const Probe: React.FC = () => {
  const v = useVessel();
  const reach = useMembershipReach();
  const snap: Snapshot = {
    loaded: !v.loading && v.loadedForUserId === h.current?.id,
    source: reach.source,
    fleetReach: reach.fleetReach,
    // The app orders by name; the reach rule is the set.
    vessels: v.vessels.map((x) => x.id).sort(),
    loadError: v.loadError?.message ?? null,
  };
  return <output aria-label="probe">{JSON.stringify(snap)}</output>;
};

const settle = async () => {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
};

async function signedInAs(u: FixtureUser): Promise<Snapshot> {
  h.current = { id: userId(u), email: `${u.key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@example.test` };
  const view = render(
    <MemoryRouter>
      <AuthProvider>
        <VesselProvider>
          <Probe />
        </VesselProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
  await settle();
  const snap = JSON.parse(view.getByLabelText('probe').textContent ?? '{}') as Snapshot;
  expect(snap.loaded).toBe(true);
  expect(snap.loadError).toBeNull();
  // RBAC must be this user's own for the fleet answer to count (D-41).
  expect(usePermissionsStore.getState().loadedFor).toBe(userId(u));
  return snap;
}

const answer = (snap: Snapshot): Expected => ({ fleetReach: snap.fleetReach, vessels: snap.vessels });
const sorted = (e: Expected): Expected => ({ fleetReach: e.fleetReach, vessels: [...e.vessels].sort() });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(fixture.now));
  usePermissionsStore.getState().reset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  h.memberships = 'missing';
  h.membershipVessels = [];
  h.current = null;
  h.listeners = [];
  localStorage.clear();
  vi.restoreAllMocks();
});

const users = fixture.users.map((u) => [u.key, u] as const);
const withoutMembership = fixture.users.filter((u) => !u.membership).map((u) => [u.key, u] as const);
const withMembership = fixture.users.filter((u) => u.membership).map((u) => [u.key, u] as const);

describe('reach-cases.json through VesselProvider (the app path)', () => {
  it('covers every fixture user: 25 users, some with an explicit membership', () => {
    expect(fixture.users).toHaveLength(25);
    expect(withoutMembership.length + withMembership.length).toBe(25);
    expect(withMembership.length).toBeGreaterThan(0);
  });

  it.each(users)('table missing: %s gets expected.legacy (the D-26 rules, legacyReach)', async (_key, u) => {
    h.memberships = 'missing';
    const snap = await signedInAs(u);
    expect(snap.source).toBe('legacy');
    expect(answer(snap)).toEqual(sorted(u.expected.legacy));
  });

  it.each(withoutMembership)('a backfilled legacy-managed row: %s gets expected.membership', async (_key, u) => {
    h.memberships = fixture.users.filter((x) => !x.membership).map(backfilledRow);
    const snap = await signedInAs(u);
    // An active user's legacy-managed row is the legacy rules; a disabled one reads no row.
    expect(snap.source).toBe(isActive(u) ? 'legacy' : 'none');
    expect(answer(snap)).toEqual(sorted(u.expected.membership));
    if (isActive(u)) expect(u.expected.membership).toEqual(u.expected.legacy);
  });

  it.each(withMembership)('an explicit membership: %s gets expected.membership', async (_key, u) => {
    const m = u.membership as FixtureMembership;
    h.memberships = [explicitRow(u, m)];
    h.membershipVessels = m.vessels.map((v) => ({ membership_id: `m-${u.key}`, vessel_id: v.vessel, valid_from: v.validFrom, valid_until: v.validUntil }));
    const snap = await signedInAs(u);
    expect(answer(snap)).toEqual(sorted(u.expected.membership));
  });
});
