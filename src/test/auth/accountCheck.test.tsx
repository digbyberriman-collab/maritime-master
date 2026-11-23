/**
 * The account check after sign-in (Phase 2 spec §B.3; proposed D-122).
 *
 * The real AuthProvider and ProtectedRoute over a fake Supabase client:
 *
 * - `record_session_start()` runs first, before the profile is read (after
 *   migration file 7 a disabled user reads no profile row, so the RPC
 *   answer decides, never a missing row);
 * - `disabled` (from the RPC, or from the profile fallback when the RPCs
 *   are not live) ends the session, never exposes the user, and leaves the
 *   "access disabled" notice for the sign-in screen;
 * - the RPCs missing (D-01) fall back to `my_account_status()`, then to the
 *   own profile's `account_status`; no profile keeps today's behaviour;
 * - any other error, an answer outside the vocabulary or a check that takes
 *   too long keeps the app closed (ProtectedRoute sends the visitor to
 *   /auth), with Retry;
 * - Supabase's `user_banned` sign-in error is the same notice.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

type Answer = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  listeners: [] as Array<(event: string, session: { user: { id: string } } | null) => void>,
  /** RPC answers by function name; a function without one is "missing" (PGRST202). */
  rpc: {} as Record<string, () => Promise<Answer>>,
  rpcCalls: [] as string[],
  /** profiles reads: `account_status` (the fallback) and `*` (the profile). */
  profileReads: [] as string[],
  statusRow: null as { account_status: string | null } | null,
  profileRow: null as Record<string, unknown> | null,
  signOut: vi.fn(),
  signIn: vi.fn(),
  loadPermissions: vi.fn(async () => undefined),
  reset: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    let columns = '';
    const chain = {
      select: (cols: string) => {
        columns = cols;
        return chain;
      },
      eq: () => chain,
      maybeSingle: () => {
        if (table === 'profiles') h.profileReads.push(columns);
        if (table === 'profiles' && columns === 'account_status') return Promise.resolve({ data: h.statusRow, error: null });
        return Promise.resolve({ data: table === 'profiles' ? h.profileRow : null, error: null });
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return chain;
  };
  return {
    supabase: {
      from,
      rpc: (fn: string) => {
        h.rpcCalls.push(fn);
        const answer = h.rpc[fn];
        if (answer) return answer();
        return Promise.resolve({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } });
      },
      auth: {
        onAuthStateChange: (cb: (event: string, session: { user: { id: string } } | null) => void) => {
          h.listeners.push(cb);
          return { data: { subscription: { unsubscribe: () => (h.listeners = h.listeners.filter((l) => l !== cb)) } } };
        },
        getSession: () => Promise.resolve({ data: { session: h.session } }),
        signOut: () => h.signOut(),
        signInWithPassword: () => h.signIn(),
      },
    },
  };
});
vi.mock('@/modules/auth/store/permissionsStore', () => ({
  usePermissionsStore: () => ({
    loadPermissions: h.loadPermissions,
    reset: h.reset,
    isInitialized: true,
    isLoading: false,
    canView: () => false,
    hasRole: () => false,
    permissions: [],
    userRoles: [],
  }),
}));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: { ...actual.notify, warning: vi.fn(), success: vi.fn(), error: vi.fn() } };
});

import { ACCOUNT_CHECK_TIMEOUT_MS, AuthProvider, useAuth } from '@/modules/auth/contexts/AuthContext';
import ProtectedRoute from '@/shared/components/ProtectedRoute';

const answer = (data: unknown, error: unknown = null) => () => Promise.resolve({ data, error });

interface Snap {
  user: string | null;
  loading: boolean;
  accountCheck: string;
  accessNotice: string | null;
  profile: string | null;
}
const snaps: Snap[] = [];
let api: ReturnType<typeof useAuth> | null = null;

const Probe: React.FC = () => {
  const auth = useAuth();
  api = auth;
  const snap: Snap = { user: auth.user?.id ?? null, loading: auth.loading, accountCheck: auth.accountCheck, accessNotice: auth.accessNotice, profile: auth.profile?.id ?? null };
  snaps.push(snap);
  return <output data-testid="auth">{JSON.stringify(snap)}</output>;
};
const state = (): Snap => JSON.parse(screen.getByTestId('auth').textContent ?? '{}') as Snap;

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

const mount = (path = '/') =>
  render(
    <AuthProvider>
      <Probe />
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <p data-testid="app">The app</p>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );

const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

beforeEach(() => {
  h.session = { user: { id: 'u1' } };
  h.listeners = [];
  h.rpc = {};
  h.rpcCalls = [];
  h.profileReads = [];
  h.statusRow = { account_status: 'active' };
  h.profileRow = { id: 'p-u1', user_id: 'u1', company_id: 'c1', role: 'crew' };
  h.signOut.mockReset().mockImplementation(async () => {
    h.session = null;
    h.listeners.forEach((l) => l('SIGNED_OUT', null));
    return { error: null };
  });
  h.signIn.mockReset();
  h.loadPermissions.mockClear();
  snaps.length = 0;
  api = null;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('account check after sign-in', () => {
  it('active: the check runs before the profile read, then the user is admitted and the app opens', async () => {
    h.rpc.record_session_start = answer('active');
    mount('/app');
    await flush();
    expect(h.rpcCalls[0]).toBe('record_session_start');
    expect(state()).toMatchObject({ user: 'u1', accountCheck: 'allowed', loading: false, profile: 'p-u1' });
    expect(screen.getByTestId('app')).toBeInTheDocument();
    // No render showed the user before the check answered.
    const firstAdmitted = snaps.findIndex((s) => s.user === 'u1');
    expect(snaps.slice(0, firstAdmitted).every((s) => s.accountCheck !== 'allowed')).toBe(true);
    expect(h.loadPermissions).toHaveBeenCalled();
  });

  it('while the check runs the app shows its loading state, not the page', async () => {
    let release: (a: Answer) => void = () => undefined;
    h.rpc.record_session_start = () => new Promise<Answer>((resolve) => (release = resolve));
    mount('/app');
    await flush();
    expect(state()).toMatchObject({ user: null, loading: true, accountCheck: 'checking' });
    expect(screen.queryByTestId('app')).not.toBeInTheDocument();
    expect(screen.queryByTestId('where')).not.toBeInTheDocument();
    expect(h.profileReads).toEqual([]);
    await act(async () => release({ data: 'active', error: null }));
    await flush();
    expect(screen.getByTestId('app')).toBeInTheDocument();
  });

  it('disabled via the RPC: the session is ended, the user never admitted, the profile never read, and the notice is kept', async () => {
    h.rpc.record_session_start = answer('disabled');
    mount('/app');
    await flush();
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(snaps.some((s) => s.user !== null)).toBe(false);
    expect(h.profileReads).toEqual([]);
    expect(h.loadPermissions).not.toHaveBeenCalled();
    expect(state()).toMatchObject({ user: null, accountCheck: 'idle', accessNotice: 'disabled', loading: false });
    expect(screen.getByTestId('where')).toHaveTextContent('/auth');
  });

  it('RPCs not live (D-01): the own profile decides; disabled there signs out too', async () => {
    h.statusRow = { account_status: 'Deactivated' };
    mount('/app');
    await flush();
    expect(h.rpcCalls).toEqual(['record_session_start', 'my_account_status']);
    expect(h.profileReads).toEqual(['account_status']);
    expect(h.signOut).toHaveBeenCalled();
    expect(state()).toMatchObject({ user: null, accessNotice: 'disabled' });
  });

  it('RPCs not live and the profile active: admitted, as today', async () => {
    mount('/app');
    await flush();
    expect(h.rpcCalls).toEqual(['record_session_start', 'my_account_status']);
    expect(h.profileReads).toEqual(['account_status', '*']);
    expect(state()).toMatchObject({ user: 'u1', accountCheck: 'allowed', profile: 'p-u1' });
  });

  it('record_session_start missing but my_account_status live: its answer decides', async () => {
    h.rpc.my_account_status = answer('disabled');
    h.statusRow = { account_status: 'active' };
    mount('/app');
    await flush();
    expect(h.profileReads).toEqual([]);
    expect(state()).toMatchObject({ user: null, accessNotice: 'disabled' });
  });

  it('no profile keeps today’s behaviour: admitted with no profile', async () => {
    h.rpc.record_session_start = answer('no_profile');
    h.profileRow = null;
    mount('/app');
    await flush();
    expect(state()).toMatchObject({ user: 'u1', accountCheck: 'allowed', profile: null });
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it('an RPC error keeps the app closed (sent to /auth) and Retry runs the check again', async () => {
    let calls = 0;
    h.rpc.record_session_start = () => {
      calls += 1;
      return calls === 1
        ? Promise.resolve({ data: null, error: { code: 'XX000', message: 'internal error' } })
        : Promise.resolve({ data: 'active', error: null });
    };
    mount('/app');
    await flush();
    expect(state()).toMatchObject({ user: null, loading: false, accountCheck: 'error' });
    expect(screen.queryByTestId('app')).not.toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/auth');
    expect(h.profileReads).toEqual([]);
    expect(h.signOut).not.toHaveBeenCalled();

    await act(async () => api?.retryAccountCheck());
    await flush();
    expect(state()).toMatchObject({ user: 'u1', accountCheck: 'allowed' });
  });

  it('an answer outside the vocabulary fails closed', async () => {
    h.rpc.record_session_start = answer(null);
    mount('/app');
    await flush();
    expect(state()).toMatchObject({ user: null, accountCheck: 'error' });
  });

  it('a check that never answers times out into the error state', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    h.rpc.record_session_start = () => new Promise<Answer>(() => undefined);
    mount('/app');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACCOUNT_CHECK_TIMEOUT_MS + 50);
    });
    expect(state()).toMatchObject({ user: null, accountCheck: 'error', loading: false });
  });

  it('a token refresh for an admitted user does not check again', async () => {
    h.rpc.record_session_start = answer('active');
    mount('/app');
    await flush();
    await act(async () => {
      h.listeners.forEach((l) => l('TOKEN_REFRESHED', { user: { id: 'u1' } }));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(h.rpcCalls.filter((f) => f === 'record_session_start')).toHaveLength(1);
    expect(snaps.slice(-3).every((s) => s.user === 'u1')).toBe(true);
  });

  it('a banned sign-in (Supabase user_banned) sets the disabled notice; a new sign-in clears it', async () => {
    h.session = null;
    mount('/');
    await flush();
    h.signIn.mockResolvedValueOnce({ data: {}, error: { name: 'AuthApiError', code: 'user_banned', status: 400, message: 'User is banned' } });
    let result: Awaited<ReturnType<NonNullable<typeof api>['signIn']>> | null = null;
    await act(async () => {
      result = await api!.signIn('deckhand@demo-fleet.example', 'secret-pass');
    });
    expect(result).toMatchObject({ accountDisabled: true });
    expect(state().accessNotice).toBe('disabled');

    h.signIn.mockResolvedValueOnce({ data: {}, error: { name: 'AuthApiError', code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' } });
    await act(async () => {
      result = await api!.signIn('deckhand@demo-fleet.example', 'wrong');
    });
    expect(result).not.toMatchObject({ accountDisabled: true });
    expect(state().accessNotice).toBeNull();
  });
});
