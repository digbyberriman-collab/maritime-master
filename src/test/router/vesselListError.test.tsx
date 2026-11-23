/**
 * A failed vessel-list read is an error state with Retry (D-04, gap/10
 * A.12), never "Vessel not found", "No vessel to open", the `/me` landing or
 * the old page of a legacy URL. Real AuthProvider, permissions store,
 * VesselProvider, HomeRedirect, VesselScopeRoute and LegacyRoute; Supabase is
 * a small fake whose queries can be held back or made to fail (a table in
 * `h.failTables` answers 503), and DashboardLayout a stub.
 *
 * User A (company cA, legacy role crew) has the vessel ALPHA through a crew
 * assignment; user B (company cB, legacy role dpa, so fleet reach) BRAVO.
 * RBAC roles are none.
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
  /** Query key fragment → a promise that holds the result back until resolved. */
  holds: new Map<string, Promise<void>>(),
  /** Tables whose reads answer 503. */
  failTables: new Set<string>(),
  users: {
    a: { id: 'uA', email: 'a@test.invalid' },
    b: { id: 'uB', email: 'b@test.invalid' },
  },
}));

vi.mock('@/integrations/supabase/client', () => {
  const tables: Record<string, Row[]> = {
    profiles: [
      { id: 'pA', user_id: 'uA', company_id: 'cA', role: 'crew', first_name: 'A', last_name: 'A' },
      { id: 'pB', user_id: 'uB', company_id: 'cB', role: 'dpa', first_name: 'B', last_name: 'B' },
    ],
    vessels: [
      { id: 'va', company_id: 'cA', name: 'ALPHA', status: 'Active', created_at: '2023-01-01T00:00:00Z' },
      { id: 'vb', company_id: 'cB', name: 'BRAVO', status: 'Active', created_at: '2023-01-01T00:00:00Z' },
    ],
    crew_assignments: [
      { user_id: 'uA', vessel_id: 'va', is_current: true },
      { user_id: 'uB', vessel_id: 'vb', is_current: true },
    ],
  };
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
        const key = `${table}:${keys.join('&')}`;
        // Decided when the result is produced, so a held read fails or not
        // as the table stands when it is released.
        const result = () => {
          if (h.failTables.has(table)) return { data: null, error: { message: 'Service Unavailable', code: '503' } };
          const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
          return { data: single ? rows[0] ?? null : rows, error: null };
        };
        let hold: Promise<void> | undefined;
        for (const [fragment, p] of h.holds) if (key.includes(fragment)) hold = p;
        return (hold ? hold.then(result) : Promise.resolve().then(result)).then(resolve, reject);
      },
    };
    return builder;
  };
  const emit = (event: string, session: unknown) => h.listeners.forEach((cb) => cb(event, session));
  return {
    supabase: {
      from,
      rpc: () => Promise.resolve({ data: [], error: null }),
      auth: {
        onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
          h.listeners.push(cb);
          return {
            data: {
              subscription: {
                unsubscribe: () => {
                  h.listeners = h.listeners.filter((x) => x !== cb);
                },
              },
            },
          };
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
// The vessel's module settings: the table is not live (D-01), so every module is on.
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
import { HomeRedirect, LegacyRoute, VesselScopeRoute, useVesselScope } from '@/app/router/scopes';
import { useScopeAccess } from '@/app/router/useScopeAccess';
import { legacyEntryFor, targetKind } from '@/app/router/legacyResolve';

// ─── Test app ─────────────────────────────────────────────────────────────

const ERROR_TITLE = 'Your vessels could not load';
/** An old URL whose target is a vessel page (LEGACY_REDIRECTS). */
const LEGACY_FROM = '/crew/list';

const VesselHome: React.FC = () => {
  const scope = useVesselScope();
  return <h1>{scope?.vessel.name}</h1>;
};

let control: {
  signIn: (who: Account) => Promise<unknown>;
  signOut: () => Promise<void>;
  navigate: (to: string) => void;
  refreshVessels: () => Promise<void>;
} | null = null;
const Control: React.FC = () => {
  const { signIn, signOut } = useAuth();
  const { refreshVessels } = useVessel();
  const navigate = useNavigate();
  control = { signIn: (who) => signIn(who.email, 'x'), signOut, navigate, refreshVessels };
  return null;
};

/** As the sign-in page does: once someone is signed in, go to /dashboard. */
const AuthPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  React.useEffect(() => {
    if (user) navigate('/dashboard');
  }, [user, navigate]);
  return <p>Sign in</p>;
};

let path = '';
const PathSpy: React.FC = () => {
  path = useLocation().pathname;
  return null;
};

/** What a reader could see, logged on every render. */
interface Snapshot {
  user: string | null;
  profile: string | null;
  ready: boolean;
  loading: boolean;
  vessels: string[];
  loadError: string | null;
  vesselsError: string | null;
  homePath: string;
}
const snapshots: Snapshot[] = [];
const Probe: React.FC = () => {
  const scope = useScopeAccess();
  const v = useVessel();
  const { user, profile } = useAuth();
  const snap: Snapshot = {
    user: user?.id ?? null,
    profile: profile?.user_id ?? null,
    ready: scope.ready,
    loading: v.loading,
    vessels: v.vessels.map((x) => x.name),
    loadError: v.loadError?.message ?? null,
    vesselsError: scope.vesselsError?.message ?? null,
    homePath: scope.homePath,
  };
  snapshots.push(snap);
  return <output aria-label="probe">{JSON.stringify(snap)}</output>;
};

function renderApp() {
  const view = render(
    <MemoryRouter initialEntries={['/auth']}>
      <AuthProvider>
        <VesselProvider>
          <Control />
          <PathSpy />
          <Probe />
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/dashboard" element={<HomeRedirect />} />
            <Route path="/v/:vesselCode" element={<VesselScopeRoute />}>
              <Route index element={<VesselHome />} />
              <Route path="crew/list" element={<h1>Crew list</h1>} />
            </Route>
            <Route
              path={LEGACY_FROM}
              element={
                <LegacyRoute from={LEGACY_FROM}>
                  <h1>Old crew list</h1>
                </LegacyRoute>
              }
            />
            <Route path="/me" element={<h1>My area</h1>} />
            <Route path="*" element={<p>Elsewhere</p>} />
          </Routes>
        </VesselProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
  return view;
}

const seen = (view: ReturnType<typeof render>) =>
  JSON.parse(view.getByLabelText('probe').textContent ?? '{}') as Snapshot;

/** Run timers and let the fake queries settle. */
const settle = async (ms = 0) => {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(i === 0 ? ms : 0);
    });
  }
};

const hold = (fragment: string) => {
  let release = () => {};
  h.holds.set(
    fragment,
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  return () =>
    act(async () => {
      release();
    });
};

const failVesselReads = () => {
  h.failTables.add('vessels');
  h.failTables.add('crew_assignments');
};

async function signIn(who: Account) {
  await act(async () => {
    await control?.signIn(who);
  });
  await settle();
}

async function go(to: string) {
  await act(async () => {
    control?.navigate(to);
  });
  await settle();
}

/** The error state: its h1 and its Try again button, and none of the definitive states. */
function expectListError(view: ReturnType<typeof render>) {
  expect(view.getByRole('heading', { level: 1, name: ERROR_TITLE })).toBeInTheDocument();
  expect(view.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  expect(view.queryByRole('heading', { name: 'Vessel not found' })).toBeNull();
  expect(view.queryByRole('heading', { name: 'No vessel to open' })).toBeNull();
  expect(view.queryByRole('heading', { name: /don't have access/i })).toBeNull();
  expect(view.queryByRole('heading', { name: 'My area' })).toBeNull();
}

async function retry(view: ReturnType<typeof render>) {
  await act(async () => {
    fireEvent.click(view.getByRole('button', { name: /try again/i }));
  });
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  usePermissionsStore.getState().reset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  h.holds.clear();
  h.failTables.clear();
  snapshots.length = 0;
  h.current = null;
  h.listeners = [];
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('the vessel list fails to load (503)', () => {
  it('a vessel user at / waits on the error with Retry, never /me; Retry lands them on their vessel', async () => {
    failVesselReads();
    const view = renderApp();
    await settle();
    await signIn(h.users.a);

    // /dashboard is the landing redirect; it stays there on the error.
    expect(path).toBe('/dashboard');
    expectListError(view);
    expect(seen(view)).toMatchObject({ user: 'uA', ready: true, vessels: [], loadError: 'Service Unavailable', homePath: '/' });

    await go('/');
    expect(path).toBe('/');
    expectListError(view);

    h.failTables.clear();
    await retry(view);
    expect(path).toBe('/v/alp');
    expect(view.getByRole('heading', { name: 'ALPHA' })).toBeInTheDocument();
    expect(seen(view)).toMatchObject({ loadError: null, vesselsError: null, homePath: '/v/alp' });
    // Never landed on /me on the way: once ready, home was never /me (before
    // ready nothing navigates, and the list has not answered yet).
    expect(snapshots.some((s) => s.user === 'uA' && s.ready && s.homePath === '/me')).toBe(false);
    expect(snapshots.some((s) => s.user === 'uA' && s.ready && s.homePath === '/')).toBe(true);
  });

  it('the error stays up while a retry runs, and a retry that fails again keeps it', async () => {
    failVesselReads();
    const view = renderApp();
    await settle();
    await signIn(h.users.a);
    expectListError(view);

    const release = hold('crew_assignments:user_id=uA');
    await retry(view);
    // Loading again: the error is latched, not cleared at the start of the load.
    expect(seen(view)).toMatchObject({ loading: true, loadError: 'Service Unavailable' });
    expectListError(view);

    await release();
    await settle();
    expect(seen(view)).toMatchObject({ loading: false, loadError: 'Service Unavailable' });
    expect(path).toBe('/dashboard');
    expectListError(view);
  });

  it('a vessel page shows the error inside the shell, never "Vessel not found"; Retry opens the page', async () => {
    failVesselReads();
    const view = renderApp();
    await settle();
    await signIn(h.users.a);
    await go('/v/alp/crew/list');

    expect(path).toBe('/v/alp/crew/list');
    expect(view.getByTestId('shell')).toContainElement(view.getByRole('heading', { level: 1, name: ERROR_TITLE }));
    expectListError(view);

    h.failTables.clear();
    await retry(view);
    expect(path).toBe('/v/alp/crew/list');
    expect(view.getByRole('heading', { name: 'Crew list' })).toBeInTheDocument();
    expect(view.queryByRole('heading', { name: ERROR_TITLE })).toBeNull();
  });

  it('a fleet-reach user still lands on /fleet/dashboard; a vessel page shows the error, not "Vessel not found"', async () => {
    h.failTables.add('vessels');
    const view = renderApp();
    await settle();
    await signIn(h.users.b);

    // Reach comes from the role, not from the list.
    expect(path).toBe('/fleet/dashboard');
    expect(seen(view)).toMatchObject({ user: 'uB', vesselsError: 'Service Unavailable', homePath: '/fleet/dashboard' });

    await go('/v/bra');
    expectListError(view);

    h.failTables.clear();
    await retry(view);
    expect(path).toBe('/v/bra');
    expect(view.getByRole('heading', { name: 'BRAVO' })).toBeInTheDocument();
  });

  it('the literal /v/:vesselCode link shows the error, not "No vessel to open"; Retry opens it on the vessel', async () => {
    failVesselReads();
    const view = renderApp();
    await settle();
    await signIn(h.users.a);
    await go('/v/:vesselCode/crew/list');

    expectListError(view);

    h.failTables.clear();
    await retry(view);
    expect(path).toBe('/v/alp/crew/list');
    expect(view.getByRole('heading', { name: 'Crew list' })).toBeInTheDocument();
  });

  it('a legacy vessel URL shows the full-page error, never the old page; Retry redirects it', async () => {
    const entry = legacyEntryFor(LEGACY_FROM);
    expect(entry && targetKind(entry.to)).toBe('vessel');
    failVesselReads();
    const view = renderApp();
    await settle();
    await signIn(h.users.a);
    await go(LEGACY_FROM);

    expect(path).toBe(LEGACY_FROM);
    expectListError(view);
    expect(view.queryByRole('heading', { name: 'Old crew list' })).toBeNull();
    // No shell around it: the full-page frame, with its own main landmark.
    expect(view.queryByTestId('shell')).toBeNull();
    expect(view.getByRole('main')).toContainElement(view.getByRole('heading', { level: 1, name: ERROR_TITLE }));

    h.failTables.clear();
    await retry(view);
    expect(path).toBe('/v/alp/crew/list');
    expect(view.getByRole('heading', { name: 'Crew list' })).toBeInTheDocument();
  });

  it('a refresh that fails after a load keeps the lists and the page, and sets the error until a load succeeds', async () => {
    const view = renderApp();
    await settle();
    await signIn(h.users.a);
    expect(path).toBe('/v/alp');
    await go('/v/alp/crew/list');
    expect(view.getByRole('heading', { name: 'Crew list' })).toBeInTheDocument();

    failVesselReads();
    await act(async () => {
      await control?.refreshVessels();
    });
    await settle();
    expect(seen(view)).toMatchObject({ vessels: ['ALPHA'], loadError: 'Service Unavailable', homePath: '/v/alp' });
    expect(path).toBe('/v/alp/crew/list');
    expect(view.getByRole('heading', { name: 'Crew list' })).toBeInTheDocument();

    h.failTables.clear();
    await act(async () => {
      await control?.refreshVessels();
    });
    await settle();
    expect(seen(view)).toMatchObject({ vessels: ['ALPHA'], loadError: null, vesselsError: null });
  });

  it("a user switch clears the error: A's error is never served for B", async () => {
    failVesselReads();
    const view = renderApp();
    await settle();
    await signIn(h.users.a);
    expect(seen(view)).toMatchObject({ user: 'uA', loadError: 'Service Unavailable' });

    // Another tab signs B in (no signed-out moment); B's reads work, but
    // B's profile and directory read are held, so there is a stale window.
    h.failTables.clear();
    const releaseProfile = hold('profiles:user_id=uB');
    const releaseVessels = hold('vessels:company_id=cB');
    await signIn(h.users.b);
    const stale = snapshots.filter((s) => s.user === 'uB');
    expect(stale.length).toBeGreaterThan(0);
    expect(stale.every((s) => s.loadError === null && s.vesselsError === null)).toBe(true);

    await releaseProfile();
    await settle();
    expect(seen(view)).toMatchObject({ user: 'uB', profile: 'uB', loading: true, loadError: null });

    await releaseVessels();
    await settle();
    expect(seen(view)).toMatchObject({ user: 'uB', vessels: ['BRAVO'], loadError: null });
    expect(snapshots.filter((s) => s.user === 'uB').every((s) => s.loadError === null && s.vesselsError === null)).toBe(true);
  });

  it("B's own failure is B's: after a switch, a failing load for B shows B's error", async () => {
    failVesselReads();
    const view = renderApp();
    await settle();
    await signIn(h.users.a);
    await act(async () => {
      await control?.signOut();
      control?.navigate('/auth');
    });
    await settle();
    expect(seen(view)).toMatchObject({ user: null, loadError: null, vesselsError: null });

    await signIn(h.users.b);
    expect(seen(view)).toMatchObject({ user: 'uB', profile: 'uB', loadError: 'Service Unavailable' });
  });

  it('control: with no failures the vessel opens as today', async () => {
    const view = renderApp();
    await settle();
    await signIn(h.users.a);
    expect(path).toBe('/v/alp');
    expect(view.getByRole('heading', { name: 'ALPHA' })).toBeInTheDocument();
    await go('/v/alp/crew/list');
    expect(view.getByRole('heading', { name: 'Crew list' })).toBeInTheDocument();
    await go(LEGACY_FROM);
    expect(path).toBe('/v/alp/crew/list');
    expect(snapshots.every((s) => s.loadError === null && s.vesselsError === null)).toBe(true);
  });
});
