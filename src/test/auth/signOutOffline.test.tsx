/**
 * Sign out when the auth server cannot be reached (endSession, D-04).
 *
 * supabase-js `signOut()` keeps the stored session when POST /logout fails
 * with anything but 401/403/404, so the app used to look signed out while a
 * reload signed the user straight back in. endSession removes the session on
 * this device anyway, without a network call, and says that only this device
 * was signed out:
 *
 * - /logout rejecting (offline) or answering 503: no session key is left,
 *   getSession() is empty, SIGNED_OUT was emitted, and the warning shows;
 * - afterwards there is no refresh token to use, so no /token call and no
 *   TOKEN_REFRESHED can bring the session back in this tab;
 * - /logout answering 204: signed out with no warning;
 * - the real AuthProvider's signOut() ends with no user, no session, the
 *   profile resolved and the key gone.
 *
 * The REAL supabase-js client runs against a recorded fetch, with
 * localStorage as its storage, so the client's own storage handling is what
 * is tested.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

const h = vi.hoisted(() => ({
  fetch: vi.fn<(...args: [input: RequestInfo | URL, init?: RequestInit]) => Promise<Response>>(),
  warning: vi.fn<(message: string) => string | number>(),
  permissions: {
    loadPermissions: async () => undefined,
    reset: () => undefined,
    isInitialized: true,
    isLoading: false,
    canView: () => false,
    hasRole: () => false,
    permissions: [],
    userRoles: [],
  },
}));

vi.mock('@/integrations/supabase/client', async () => {
  const { createClient } = await vi.importActual<typeof import('@supabase/supabase-js')>('@supabase/supabase-js');
  return {
    supabase: createClient('http://127.0.0.1:54321', 'test-anon-key', {
      auth: { storage: window.localStorage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (...args: FetchArgs) => h.fetch(...args) },
    }),
  };
});
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: { ...actual.notify, warning: (message: string) => h.warning(message) } };
});
vi.mock('@/modules/auth/store/permissionsStore', () => ({ usePermissionsStore: () => h.permissions }));

import { supabase } from '@/integrations/supabase/client';
import { endSession, authStorageKey, SIGNED_OUT_LOCALLY_MESSAGE } from '@/modules/auth/lib/endSession';
import { AuthProvider, useAuth } from '@/modules/auth/contexts/AuthContext';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const KEY = 'sb-127-auth-token';

type LogoutMode = 'reject' | '503' | '204';

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
const calledUrls = () => h.fetch.mock.calls.map(([input]) => urlOf(input));
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function answerWith(logout: LogoutMode) {
  h.fetch.mockImplementation(async (input) => {
    const url = urlOf(input);
    if (url.includes('/auth/v1/logout')) {
      if (logout === 'reject') throw new TypeError('Failed to fetch');
      if (logout === '503') return json({ message: 'unavailable' }, 503);
      return new Response(null, { status: 204 });
    }
    if (url.includes('/auth/v1/token')) return json({ message: 'unexpected' }, 500);
    if (url.includes('/rest/v1/')) return json([]);
    return json({ message: 'not found' }, 404);
  });
}

function seedSession() {
  const now = Math.floor(Date.now() / 1000);
  window.localStorage.setItem(
    KEY,
    JSON.stringify({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: now + 3600,
      user: {
        id: 'user-1',
        aud: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }),
  );
}

const sessionKeys = () => Object.keys(window.localStorage).filter((k) => /^sb-.*-auth-token/.test(k));

function recordEvents() {
  const events: string[] = [];
  const { data } = supabase.auth.onAuthStateChange((event) => {
    events.push(event);
  });
  return { events, stop: () => data.subscription.unsubscribe() };
}

// supabase-js logs a fetch that rejects before wrapping it; that one is expected here.
const originalConsoleError = console.error;
const isExpectedFetchFailure = (args: unknown[]) =>
  args.length === 1 && args[0] instanceof TypeError && args[0].message === 'Failed to fetch';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (!isExpectedFetchFailure(args)) originalConsoleError(...args);
  });
  vi.stubEnv('VITE_SUPABASE_URL', SUPABASE_URL);
  window.localStorage.clear();
  h.fetch.mockReset();
  h.warning.mockReset();
  seedSession();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  window.localStorage.clear();
  supabase.auth.stopAutoRefresh();
});

describe('authStorageKey', () => {
  it('is the supabase-js default key for the API host, and null for no URL', () => {
    expect(authStorageKey()).toBe(KEY);
    expect(authStorageKey('https://abcdefgh.supabase.co')).toBe('sb-abcdefgh-auth-token');
    expect(authStorageKey('not a url')).toBeNull();
    expect(authStorageKey('')).toBeNull();
  });
});

describe('endSession', () => {
  it.each<[string, LogoutMode]>([
    ['rejects (offline)', 'reject'],
    ['answers 503', '503'],
  ])('when /logout %s, the session is still removed on this device and the user is told', async (_name, mode) => {
    answerWith(mode);
    const { data: before } = await supabase.auth.getSession();
    expect(before.session?.user.id).toBe('user-1');
    const { events, stop } = recordEvents();

    await expect(endSession()).resolves.toBe('signed-out-on-this-device');

    // The revoke was attempted.
    expect(calledUrls().some((url) => url.includes('/auth/v1/logout'))).toBe(true);
    expect(sessionKeys()).toEqual([]);
    expect(window.localStorage.getItem(`${KEY}-code-verifier`)).toBeNull();
    expect(window.localStorage.getItem(`${KEY}-user`)).toBeNull();
    const { data: after } = await supabase.auth.getSession();
    expect(after.session).toBeNull();
    await waitFor(() => expect(events).toContain('SIGNED_OUT'));
    expect(h.warning).toHaveBeenCalledWith(SIGNED_OUT_LOCALLY_MESSAGE);
    stop();
  });

  it('leaves no refresh token behind, so nothing can refresh the session back in this tab', async () => {
    answerWith('reject');
    await endSession();
    const { events, stop } = recordEvents();

    const { data, error } = await supabase.auth.refreshSession();
    expect(error).not.toBeNull();
    expect(data.session).toBeNull();

    // The refresh ticker finds nothing to refresh either.
    await supabase.auth.startAutoRefresh();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await supabase.auth.stopAutoRefresh();

    expect(calledUrls().some((url) => url.includes('/auth/v1/token'))).toBe(false);
    expect(events).not.toContain('TOKEN_REFRESHED');
    expect(sessionKeys()).toEqual([]);
    stop();
  });

  it('control: a revoke that succeeds signs out with no warning', async () => {
    answerWith('204');
    const { events, stop } = recordEvents();

    await expect(endSession()).resolves.toBe('signed-out');

    expect(sessionKeys()).toEqual([]);
    const { data } = await supabase.auth.getSession();
    expect(data.session).toBeNull();
    await waitFor(() => expect(events).toContain('SIGNED_OUT'));
    expect(h.warning).not.toHaveBeenCalled();
    stop();
  });
});

describe('AuthProvider signOut while the server cannot be reached', () => {
  const Consumer: React.FC = () => {
    const { user, session, profileResolved, loading, signOut } = useAuth();
    return (
      <>
        <output data-testid="auth">
          {JSON.stringify({ user: user?.id ?? null, session: Boolean(session), profileResolved, loading })}
        </output>
        <button type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </>
    );
  };
  const state = () =>
    JSON.parse(screen.getByTestId('auth').textContent ?? '{}') as {
      user: string | null;
      session: boolean;
      profileResolved: boolean;
      loading: boolean;
    };

  it('ends with no user, no session, the profile resolved and the stored session gone', async () => {
    answerWith('reject');
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(state()).toMatchObject({ user: 'user-1', session: true, profileResolved: true, loading: false }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    });

    await waitFor(() => expect(state()).toMatchObject({ user: null, session: false, profileResolved: true }));
    expect(sessionKeys()).toEqual([]);
    expect(h.warning).toHaveBeenCalledWith(SIGNED_OUT_LOCALLY_MESSAGE);
    const { data } = await supabase.auth.getSession();
    expect(data.session).toBeNull();
  });
});
