/**
 * The vessel lists and fleet reach once `account_memberships` is live
 * (Phase 2 spec §B.4; DECISIONS D-26, D-04, D-119, proposed D-123). Real
 * AuthProvider, permissions store, VesselProvider, useScopeAccess and
 * HomeRedirect; Supabase is a small fake whose membership tables can be
 * missing, empty, populated or failing.
 *
 * The four read outcomes:
 * - table missing → the D-26 legacy rules (role and crew assignments);
 * - a legacy-managed row → the same legacy rules;
 * - a row an admin manages → its own vessel scope, vessel rows and fleet
 *   access (RBAC fleet roles no longer add fleet reach);
 * - the table live but no row → no vessels and no fleet reach (fail closed);
 * - any other error → the vessel-list error with Retry, never "no vessels"
 *   or the `/me` landing.
 *
 * Company cA has ALPHA and BRAVO (active) and OLDIE (sold, archived);
 * company cB has XRAY. Role names only; no personal data.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

type Row = Record<string, unknown>;
type Account = { id: string; email: string };

const h = vi.hoisted(() => ({
  listeners: [] as ((event: string, session: unknown) => void)[],
  current: null as { id: string; email: string } | null,
  /** `account_memberships` rows, or 'missing' (the table is not live). */
  memberships: 'missing' as Row[] | 'missing',
  membershipVessels: [] as Row[],
  /** Tables whose reads answer 500. */
  failTables: new Set<string>(),
  /** user_id → the rows get_user_roles_full returns. */
  roles: new Map<string, Record<string, unknown>[]>(),
  /** Every table read, as `table:filters`. */
  reads: [] as string[],
  users: {
    dpa: { id: 'u-dpa', email: 'dpa@example.test' },
    crew: { id: 'u-crew', email: 'crew@example.test' },
    admin: { id: 'u-admin', email: 'fleet-manager@example.test' },
    external: { id: 'u-ext', email: 'surveyor@example.test' },
  },
}));

vi.mock('@/integrations/supabase/client', () => {
  const tables: Record<string, Row[]> = {
    profiles: [
      { id: 'p-dpa', user_id: 'u-dpa', company_id: 'cA', role: 'dpa', first_name: 'Dpa', last_name: 'Role' },
      { id: 'p-crew', user_id: 'u-crew', company_id: 'cA', role: 'crew', first_name: 'Crew', last_name: 'Role' },
      { id: 'p-admin', user_id: 'u-admin', company_id: 'cA', role: 'crew', first_name: 'Admin', last_name: 'Role' },
      { id: 'p-ext', user_id: 'u-ext', company_id: 'cA', role: 'crew', first_name: 'External', last_name: 'Role' },
    ],
    vessels: [
      { id: 'va', company_id: 'cA', name: 'ALPHA', status: 'Active', lifecycle_status: 'active', created_at: '2023-01-01T00:00:00Z' },
      { id: 'vb', company_id: 'cA', name: 'BRAVO', status: 'Active', lifecycle_status: 'active', created_at: '2023-01-02T00:00:00Z' },
      { id: 'vo', company_id: 'cA', name: 'OLDIE', status: 'Sold', lifecycle_status: 'archived', created_at: '2023-01-03T00:00:00Z' },
      { id: 'vx', company_id: 'cB', name: 'XRAY', status: 'Active', lifecycle_status: 'active', created_at: '2023-01-04T00:00:00Z' },
    ],
    crew_assignments: [
      { user_id: 'u-crew', vessel_id: 'va', is_current: true },
      { user_id: 'u-ext', vessel_id: 'va', is_current: true },
    ],
  };
  const MISSING = { code: 'PGRST205', message: "Could not find the table 'public.account_memberships' in the schema cache" };
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    const keys: string[] = [];
    let single = false;
    const builder = {
      select: () => builder,
      order: () => builder,
      eq: (k: string, v: unknown) => {
        keys.push(`${k}=${String(v)}`);
        filters.push((r) => r[k] === v);
        return builder;
      },
      neq: (k: string, v: unknown) => {
        filters.push((r) => r[k] !== v);
        return builder;
      },
      in: (k: string, vs: unknown[]) => {
        keys.push(`${k}~${vs.join(',')}`);
        filters.push((r) => vs.includes(r[k]));
        return builder;
      },
      maybeSingle: () => {
        single = true;
        return builder;
      },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        h.reads.push(`${table}:${keys.join('&')}`);
        const result = () => {
          if (h.failTables.has(table)) return { data: null, error: { code: '500', message: 'Internal Server Error' } };
          let source: Row[] = tables[table] ?? [];
          if (table === 'account_memberships') {
            if (h.memberships === 'missing') return { data: null, error: MISSING };
            source = h.memberships;
          }
          if (table === 'account_membership_vessels') source = h.membershipVessels;
          // RLS: a user reads only their company's vessels.
          if (table === 'vessels') {
            const uid = h.current?.id;
            const company = tables.profiles.find((p) => p.user_id === uid)?.company_id;
            source = source.filter((r) => r.company_id === company);
          }
          const rows = source.filter((r) => filters.every((f) => f(r)));
          return { data: single ? rows[0] ?? null : rows, error: null };
        };
        return Promise.resolve().then(result).then(resolve, reject);
      },
    };
    return builder;
  };
  const emit = (event: string, session: unknown) => h.listeners.forEach((cb) => cb(event, session));
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
        signInWithPassword: async ({ email }: { email: string }) => {
          const user = Object.values(h.users).find((u) => u.email === email) ?? null;
          h.current = user;
          emit('SIGNED_IN', { user });
          return { data: { user, session: { user } }, error: null };
        },
        signOut: async () => {
          h.current = null;
          emit('SIGNED_OUT', null);
          return { error: null };
        },
      },
    },
  };
});
vi.mock('@/modules/vessels/hooks/useVesselModuleSettings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/vessels/hooks/useVesselModuleSettings')>();
  const { TABLE_MISSING_STATE } = await import('@/modules/vessels/lib/moduleSettings');
  return { ...actual, useVesselModuleSettings: () => ({ state: TABLE_MISSING_STATE, fetching: false, retry: () => undefined }) };
});
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
}));

import { AuthProvider, useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { VesselProvider, useVessel } from '@/modules/vessels/contexts/VesselContext';
import { HomeRedirect, VesselScopeRoute, useVesselScope } from '@/app/router/scopes';
import { useScopeAccess } from '@/app/router/useScopeAccess';
import { useMembershipReach } from '@/app/router/useMembershipReach';

const VesselHome: React.FC = () => {
  const scope = useVesselScope();
  return <h1>{scope?.vessel.name}</h1>;
};

let control: { signIn: (who: Account) => Promise<unknown>; signOut: () => Promise<void>; navigate: (to: string) => void } | null = null;
const Control: React.FC = () => {
  const { signIn, signOut } = useAuth();
  const navigate = useNavigate();
  control = { signIn: (who) => signIn(who.email, 'x'), signOut, navigate };
  return null;
};

const AuthPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  React.useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);
  return <p>Sign in</p>;
};

let path = '';
const PathSpy: React.FC = () => {
  path = useLocation().pathname;
  return null;
};

interface Snapshot {
  ready: boolean;
  fleetReach: boolean;
  source: string;
  vessels: string[];
  allVessels: boolean;
  loadError: string | null;
  homePath: string;
}
const Probe: React.FC = () => {
  const scope = useScopeAccess();
  const reach = useMembershipReach();
  const v = useVessel();
  const snap: Snapshot = {
    ready: scope.ready,
    fleetReach: scope.fleetReach,
    source: reach.source,
    vessels: v.vessels.map((x) => x.name),
    allVessels: v.canAccessAllVessels,
    loadError: v.loadError?.message ?? null,
    homePath: scope.homePath,
  };
  return <output aria-label="probe">{JSON.stringify(snap)}</output>;
};

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/auth']}>
      <AuthProvider>
        <VesselProvider>
          <Control />
          <PathSpy />
          <Probe />
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/fleet/dashboard" element={<h1>Fleet dashboard</h1>} />
            <Route path="/v/:vesselCode" element={<VesselScopeRoute />}>
              <Route index element={<VesselHome />} />
            </Route>
            <Route path="/me" element={<h1>My area</h1>} />
            <Route path="*" element={<p>Elsewhere</p>} />
          </Routes>
        </VesselProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const seen = (view: ReturnType<typeof render>) => JSON.parse(view.getByLabelText('probe').textContent ?? '{}') as Snapshot;

const settle = async () => {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
};

async function signIn(who: Account) {
  await act(async () => {
    await control?.signIn(who);
  });
  await settle();
}

/** A membership row as the server stores it (only the columns the client reads matter). */
const membership = (userId: string, patch: Row): Row => ({
  id: `m-${userId}`,
  company_id: 'cA',
  user_id: userId,
  kind: 'crew',
  status: 'active',
  legacy_managed: false,
  fleet_access: false,
  vessel_scope: 'assigned',
  valid_from: null,
  valid_until: null,
  ...patch,
});

beforeEach(() => {
  vi.useFakeTimers();
  usePermissionsStore.getState().reset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  h.memberships = 'missing';
  h.membershipVessels = [];
  h.failTables.clear();
  h.roles.clear();
  h.reads.length = 0;
  h.current = null;
  h.listeners = [];
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('reach once account_memberships is live (Phase 2 §B.4)', () => {
  it('table missing: the legacy rules, as before Phase 2 (DPA → every active vessel and fleet reach)', async () => {
    const view = renderApp();
    await settle();
    await signIn(h.users.dpa);
    expect(seen(view)).toMatchObject({ ready: true, source: 'legacy', fleetReach: true, vessels: ['ALPHA', 'BRAVO'], allVessels: true, loadError: null });
    expect(path).toBe('/fleet/dashboard');
    // Only the caller's own row, in their profile's company, is ever asked for.
    expect(h.reads.filter((r) => r.startsWith('account_memberships'))).toEqual(['account_memberships:user_id=u-dpa&company_id=cA']);
  });

  it('table missing: crew reach their assigned vessel only', async () => {
    const view = renderApp();
    await settle();
    await signIn(h.users.crew);
    expect(seen(view)).toMatchObject({ source: 'legacy', fleetReach: false, vessels: ['ALPHA'], allVessels: false });
    expect(path).toBe('/v/alp');
  });

  it('a legacy-managed row keeps the legacy rules exactly (applying P2 changes nobody)', async () => {
    h.memberships = [membership('u-dpa', { kind: 'admin', legacy_managed: true, fleet_access: true, vessel_scope: 'all' })];
    const view = renderApp();
    await settle();
    await signIn(h.users.dpa);
    expect(seen(view)).toMatchObject({ source: 'legacy', fleetReach: true, vessels: ['ALPHA', 'BRAVO'], allVessels: true });
    // A legacy-managed row is not cut by its vessel rows: they are never read.
    expect(h.reads.some((r) => r.startsWith('account_membership_vessels'))).toBe(false);
  });

  it('a legacy-managed crew row: legacy RBAC fleet roles still give fleet reach', async () => {
    h.memberships = [membership('u-crew', { legacy_managed: true })];
    h.roles.set('u-crew', [{ role_name: 'fleet_master', is_fleet_wide: false, vessel_id: null }]);
    const view = renderApp();
    await settle();
    await signIn(h.users.crew);
    expect(seen(view)).toMatchObject({ source: 'legacy', fleetReach: true, vessels: ['ALPHA'] });
  });

  it('an admin-managed row scoped to all vessels: every reachable company vessel, fleet reach from fleet_access', async () => {
    h.memberships = [membership('u-admin', { kind: 'admin', fleet_access: true, vessel_scope: 'all' })];
    const view = renderApp();
    await settle();
    await signIn(h.users.admin);
    expect(seen(view)).toMatchObject({ source: 'membership', fleetReach: true, vessels: ['ALPHA', 'BRAVO'], allVessels: true });
    expect(path).toBe('/fleet/dashboard');
  });

  it('an admin-managed assigned row: its vessel rows plus crew assignments; RBAC fleet roles add nothing', async () => {
    h.memberships = [membership('u-crew', { kind: 'shore' })];
    h.membershipVessels = [
      { membership_id: 'm-u-crew', vessel_id: 'vb', valid_from: null, valid_until: null },
      // Another company's vessel never counts, and an expired row neither.
      { membership_id: 'm-u-crew', vessel_id: 'vx', valid_from: null, valid_until: null },
      { membership_id: 'm-u-crew', vessel_id: 'vo', valid_from: null, valid_until: null },
    ];
    h.roles.set('u-crew', [{ role_name: 'fleet_master', is_fleet_wide: true, vessel_id: null }]);
    const view = renderApp();
    await settle();
    await signIn(h.users.crew);
    expect(seen(view)).toMatchObject({ source: 'membership', fleetReach: false, vessels: ['ALPHA', 'BRAVO'], allVessels: false });
    expect(h.reads).toContain('account_membership_vessels:membership_id=m-u-crew');
  });

  it('an external row: its vessel rows only, never crew assignments', async () => {
    h.memberships = [membership('u-ext', { kind: 'external', valid_until: '2999-01-01T00:00:00Z' })];
    h.membershipVessels = [{ membership_id: 'm-u-ext', vessel_id: 'vb', valid_from: null, valid_until: null }];
    const view = renderApp();
    await settle();
    await signIn(h.users.external);
    expect(seen(view)).toMatchObject({ source: 'membership', fleetReach: false, vessels: ['BRAVO'] });
    expect(path).toBe('/v/bra');
  });

  it.each([
    ['disabled', { status: 'disabled' }],
    ['removed', { status: 'removed' }],
    ['invited', { status: 'invited' }],
    ['not valid yet', { valid_from: '2999-01-01T00:00:00Z' }],
    ['expired', { valid_until: '2000-01-01T00:00:00Z' }],
  ])('a %s row reaches nothing, even with the legacy DPA role', async (_name, patch) => {
    h.memberships = [membership('u-dpa', { kind: 'admin', legacy_managed: true, fleet_access: true, vessel_scope: 'all', ...patch })];
    const view = renderApp();
    await settle();
    await signIn(h.users.dpa);
    expect(seen(view)).toMatchObject({ ready: true, source: 'none', fleetReach: false, vessels: [], allVessels: false, loadError: null });
    expect(path).toBe('/me');
  });

  it('table live, no row for the user: no vessels and no fleet reach (fail closed), even for the legacy DPA role', async () => {
    h.memberships = [membership('u-crew', {})];
    h.roles.set('u-dpa', [{ role_name: 'superadmin', is_fleet_wide: true, vessel_id: null }]);
    const view = renderApp();
    await settle();
    await signIn(h.users.dpa);
    expect(seen(view)).toMatchObject({ ready: true, source: 'none', fleetReach: false, vessels: [], allVessels: false, loadError: null });
    expect(path).toBe('/me');
  });

  it('any other membership error: the vessel-list error with Retry, never /me; Retry loads once it reads', async () => {
    h.memberships = [membership('u-admin', { kind: 'admin', fleet_access: true, vessel_scope: 'all' })];
    h.failTables.add('account_memberships');
    const view = renderApp();
    await settle();
    await signIn(h.users.admin);
    expect(seen(view)).toMatchObject({ ready: true, fleetReach: false, vessels: [], loadError: 'Internal Server Error', homePath: '/' });
    expect(path).toBe('/');
    expect(view.getByRole('heading', { level: 1, name: 'Your vessels could not load' })).toBeInTheDocument();
    expect(view.queryByRole('heading', { name: 'My area' })).toBeNull();

    h.failTables.delete('account_memberships');
    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: /try again/i }));
    });
    await settle();
    expect(seen(view)).toMatchObject({ source: 'membership', fleetReach: true, vessels: ['ALPHA', 'BRAVO'], loadError: null });
  });

  it('a failing vessel-rows read is an error too (the membership table is there, so its sibling must be)', async () => {
    h.memberships = [membership('u-crew', { kind: 'shore' })];
    h.failTables.add('account_membership_vessels');
    const view = renderApp();
    await settle();
    await signIn(h.users.crew);
    expect(seen(view)).toMatchObject({ fleetReach: false, vessels: [], loadError: 'Internal Server Error' });
    expect(view.getByRole('heading', { level: 1, name: 'Your vessels could not load' })).toBeInTheDocument();
  });

  it('a membership user whose company list fails sees the error, not a list cut from nothing', async () => {
    h.memberships = [membership('u-admin', { kind: 'admin', fleet_access: true, vessel_scope: 'all' })];
    h.failTables.add('vessels');
    const view = renderApp();
    await settle();
    await signIn(h.users.admin);
    // Fleet reach is known from the row; the vessels are not.
    expect(seen(view)).toMatchObject({ source: 'membership', fleetReach: true, vessels: [], loadError: 'Internal Server Error' });
  });
});
