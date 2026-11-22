/**
 * A same-tab user switch never resolves the vessel scope on the previous
 * user's vessels (D-25; fail closed, D-04). Real AuthProvider, permissions
 * store, VesselProvider, HomeRedirect and VesselScopeRoute; Supabase is a
 * small fake whose queries can be held back, and DashboardLayout a stub.
 *
 * User A (company cA) has the vessel ALPHA, user B (company cB) BRAVO.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

type Row = Record<string, unknown>;
type Account = { id: string; email: string };

const h = vi.hoisted(() => ({
  listeners: [] as ((event: string, session: unknown) => void)[],
  current: null as { id: string; email: string } | null,
  /** Query key fragment → a promise that holds the result back until resolved. */
  holds: new Map<string, Promise<void>>(),
  /** user_ids whose profile read fails. */
  profileFails: new Set<string>(),
  users: {
    a: { id: 'uA', email: 'a@test.invalid' },
    b: { id: 'uB', email: 'b@test.invalid' },
  },
}));

vi.mock('@/integrations/supabase/client', () => {
  const tables: Record<string, Row[]> = {
    profiles: [
      { id: 'pA', user_id: 'uA', company_id: 'cA', role: 'crew', first_name: 'A', last_name: 'A' },
      { id: 'pB', user_id: 'uB', company_id: 'cB', role: 'crew', first_name: 'B', last_name: 'B' },
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
        const result = () => {
          if (table === 'profiles') {
            const uid = keys.find((k) => k.startsWith('user_id='))?.slice('user_id='.length) ?? '';
            if (h.profileFails.has(uid)) return { data: null, error: { message: 'profile read failed' } };
          }
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
      rpc: () => {
        const hold = h.holds.get('rpc');
        const result = () => ({ data: [], error: null });
        return hold ? hold.then(result) : Promise.resolve(result());
      },
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
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
}));

import { AuthProvider, useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { VesselProvider, useVessel } from '@/modules/vessels/contexts/VesselContext';
import { HomeRedirect, VesselScopeRoute, useVesselScope } from '@/app/router/scopes';
import { PROFILE_GRACE_MS, useScopeAccess } from '@/app/router/useScopeAccess';

// ─── Test app ─────────────────────────────────────────────────────────────

interface VesselPageRender {
  user: string | null;
  vessel: string | null;
}
const vesselPageRenders: VesselPageRender[] = [];
let path = '';

const VesselHome: React.FC = () => {
  const { user } = useAuth();
  const scope = useVesselScope();
  vesselPageRenders.push({ user: user?.id ?? null, vessel: scope ? scope.vessel.name : null });
  return <h1>{scope?.vessel.name}</h1>;
};

let control: { signIn: (who: Account) => Promise<unknown>; signOut: () => Promise<void>; navigate: (to: string) => void } | null = null;
const Control: React.FC = () => {
  const { signIn, signOut } = useAuth();
  const navigate = useNavigate();
  control = { signIn: (who) => signIn(who.email, 'x'), signOut, navigate };
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

const PathSpy: React.FC = () => {
  path = useLocation().pathname;
  return null;
};

/** What the hook and the context say, for the hook-level checks. */
const AccessProbe: React.FC = () => {
  const access = useScopeAccess();
  const { vessels } = useVessel();
  const { user } = useAuth();
  return (
    <output aria-label="access">
      {JSON.stringify({ user: user?.id ?? null, ready: access.ready, last: access.lastVesselCode, vessels: vessels.map((v) => v.name) })}
    </output>
  );
};

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/auth']}>
      <AuthProvider>
        <VesselProvider>
          <Control />
          <PathSpy />
          <AccessProbe />
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/dashboard" element={<HomeRedirect />} />
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

const access = (view: ReturnType<typeof render>) =>
  JSON.parse(view.getByLabelText('access').textContent ?? '{}') as { user: string | null; ready: boolean; last: string | null; vessels: string[] };

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
  h.holds.set(fragment, new Promise<void>((resolve) => { release = resolve; }));
  return () => act(async () => { release(); });
};

const rendersFor = (user: string) => vesselPageRenders.filter((r) => r.user === user);

async function signInA(view: ReturnType<typeof render>) {
  await act(async () => { await control?.signIn(h.users.a); });
  await settle();
  expect(path).toBe('/v/alp');
  expect(view.getByRole('heading', { name: 'ALPHA' })).toBeInTheDocument();
}

async function signOutToAuth() {
  await act(async () => {
    await control?.signOut();
    control?.navigate('/auth');
  });
  await settle();
  expect(path).toBe('/auth');
}

beforeEach(() => {
  vi.useFakeTimers();
  usePermissionsStore.getState().reset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  h.holds.clear();
  h.profileFails.clear();
  h.current = null;
  h.listeners = [];
  vesselPageRenders.length = 0;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('the vessel scope across a same-tab user switch', () => {
  it("B, whose profile cannot be read, lands on /me after the grace period and never sees A's vessel", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = renderApp();
    await settle();
    await signInA(view);
    await signOutToAuth();

    h.profileFails.add('uB');
    await act(async () => { await control?.signIn(h.users.b); });
    await settle();
    expect(path).toBe('/dashboard');
    expect(access(view).ready).toBe(false);

    await settle(PROFILE_GRACE_MS);
    expect(path).toBe('/me');
    expect(view.getByRole('heading', { name: 'My area' })).toBeInTheDocument();

    await settle(PROFILE_GRACE_MS * 2);
    expect(path).toBe('/me');
    expect(rendersFor('uB')).toEqual([]);
    expect(view.queryByText('ALPHA')).toBeNull();
    expect(access(view)).toMatchObject({ user: 'uB', ready: true, last: null });
  });

  it("RBAC first, then B's profile, B's vessels held: never ready on A's vessels", async () => {
    const view = renderApp();
    await settle();
    await signInA(view);
    await signOutToAuth();

    const releaseProfile = hold('profiles:user_id=uB');
    const releaseVessels = hold('crew_assignments:user_id=uB');
    h.holds.set('vessels:company_id=cB', h.holds.get('crew_assignments:user_id=uB') as Promise<void>);
    await act(async () => { await control?.signIn(h.users.b); });
    await settle();
    // RBAC has landed; the profile has not.
    expect(usePermissionsStore.getState().isInitialized).toBe(true);
    expect(access(view).ready).toBe(false);
    expect(path).toBe('/dashboard');

    await releaseProfile();
    await settle();
    // B's profile is in, B's vessels are not: still loading, nothing of A's.
    expect(access(view)).toMatchObject({ user: 'uB', ready: false, vessels: [] });
    expect(path).toBe('/dashboard');
    expect(view.queryByText('ALPHA')).toBeNull();

    await releaseVessels();
    await settle();
    expect(path).toBe('/v/bra');
    expect(view.getByRole('heading', { name: 'BRAVO' })).toBeInTheDocument();
    expect(rendersFor('uB').every((r) => r.vessel === 'BRAVO')).toBe(true);
    expect(rendersFor('uB').length).toBeGreaterThan(0);
  });

  it("control: B's profile before RBAC lands B on their own vessel", async () => {
    const view = renderApp();
    await settle();
    await signInA(view);
    await signOutToAuth();

    const releaseRbac = hold('modules:');
    await act(async () => { await control?.signIn(h.users.b); });
    await settle();
    expect(access(view)).toMatchObject({ ready: false, vessels: ['BRAVO'] });

    await releaseRbac();
    await settle();
    expect(path).toBe('/v/bra');
    expect(view.getByRole('heading', { name: 'BRAVO' })).toBeInTheDocument();
    expect(rendersFor('uB').every((r) => r.vessel === 'BRAVO')).toBe(true);
  });
});

describe('useScopeAccess and VesselContext across a user switch', () => {
  it('a direct A-to-B switch (no signed-out moment) resets the ready latch', async () => {
    const view = renderApp();
    await settle();
    await signInA(view);
    expect(access(view)).toMatchObject({ user: 'uA', ready: true, last: 'ALP' });

    // Another tab signs B in: SIGNED_IN for B while A is still signed in here.
    const releaseProfile = hold('profiles:user_id=uB');
    await act(async () => { await control?.signIn(h.users.b); });
    await settle();
    // The profile is still A's; the scope is not ready on it.
    expect(access(view)).toMatchObject({ user: 'uB', ready: false });

    await releaseProfile();
    await settle();
    expect(access(view)).toMatchObject({ user: 'uB', ready: true, last: 'BRA', vessels: ['BRAVO'] });
  });

  it("A's load that finishes after B's started never writes B's lists", async () => {
    const view = renderApp();
    await settle();

    // A signs in; A's vessel queries hang.
    const releaseA = hold('crew_assignments:user_id=uA');
    await act(async () => { await control?.signIn(h.users.a); });
    await settle();
    expect(access(view)).toMatchObject({ user: 'uA', ready: false, vessels: [] });

    await act(async () => { await control?.signOut(); });
    await settle();
    await act(async () => { await control?.signIn(h.users.b); });
    await settle();
    expect(access(view)).toMatchObject({ user: 'uB', ready: true, vessels: ['BRAVO'] });

    await releaseA();
    await settle();
    expect(access(view)).toMatchObject({ user: 'uB', ready: true, last: 'BRA', vessels: ['BRAVO'] });
  });

  it('serves nothing once the user signs out', async () => {
    const view = renderApp();
    await settle();
    await signInA(view);
    await signOutToAuth();
    expect(access(view)).toMatchObject({ user: null, ready: false, last: null, vessels: [] });
  });
});
