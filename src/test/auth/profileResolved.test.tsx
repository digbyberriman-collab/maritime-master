/**
 * `profileResolved` (AuthContext): whether the profile read for the current
 * session user has answered, so a consumer can tell "still loading" from "no
 * profile" or "no company" (the tenant logo's skeleton, D-04).
 *
 * - A session user starts unresolved; the read answering with a row, with
 *   no row, with an error or by rejecting resolves it, so nothing waits for
 *   good on a profile that will never come.
 * - No session (none at start, or signed out) is resolved, with no profile.
 * - A token refresh for the same user keeps it resolved (no flash); a new
 *   user starts unresolved in the same render that adopts them.
 * - A read for a previous user that lands after a switch resolves nothing.
 *
 * The real AuthProvider; the Supabase client is a fake whose profile reads
 * are held until a test answers them, and the permissions store a stub.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

type ProfileAnswer = { data: Record<string, unknown> | null; error: { message: string } | null };
interface ProfileRead {
  userId: string;
  resolve: (answer: ProfileAnswer) => void;
  reject: (reason: unknown) => void;
}
interface Snapshot {
  user: string | null;
  profile: string | null;
  profileResolved: boolean;
  loading: boolean;
}

const h = vi.hoisted(() => ({
  listeners: [] as Array<(event: string, session: { user: { id: string } } | null) => void>,
  session: null as { user: { id: string } } | null,
  reads: [] as ProfileRead[],
  renders: [] as Snapshot[],
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

vi.mock('@/integrations/supabase/client', () => {
  // profiles (held reads) and hw_practitioners (none) share one chain.
  const from = () => {
    let userId = '';
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        if (column === 'user_id') userId = String(value);
        return chain;
      },
      maybeSingle: () =>
        new Promise<ProfileAnswer>((resolve, reject) => {
          h.reads.push({ userId, resolve, reject });
        }),
      // The practitioner roster read (hw_practitioners): none.
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return chain;
  };
  return {
    supabase: {
      from,
      auth: {
        onAuthStateChange: (cb: (event: string, session: { user: { id: string } } | null) => void) => {
          h.listeners.push(cb);
          return { data: { subscription: { unsubscribe: () => (h.listeners = h.listeners.filter((l) => l !== cb)) } } };
        },
        getSession: () => Promise.resolve({ data: { session: h.session } }),
        signOut: () => Promise.resolve({ error: null }),
      },
    },
  };
});
vi.mock('@/modules/auth/store/permissionsStore', () => ({ usePermissionsStore: () => h.permissions }));

import { AuthProvider, useAuth } from '@/modules/auth/contexts/AuthContext';

const Probe: React.FC = () => {
  const { user, profile, profileResolved, loading } = useAuth();
  const snapshot: Snapshot = { user: user?.id ?? null, profile: profile?.user_id ?? null, profileResolved, loading };
  h.renders.push(snapshot);
  return <output data-testid="auth">{JSON.stringify(snapshot)}</output>;
};

const state = (): Snapshot => JSON.parse(screen.getByTestId('auth').textContent ?? '{}') as Snapshot;
/** Let the auth promises and the deferred profile read (setTimeout 0) run. */
const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
const emit = (event: string, session: { user: { id: string } } | null) =>
  act(async () => {
    h.listeners.forEach((listener) => listener(event, session));
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
const readFor = (userId: string) => {
  const read = [...h.reads].reverse().find((r) => r.userId === userId);
  if (!read) throw new Error(`no profile read for ${userId}`);
  return read;
};
const row = (userId: string, companyId: string | null = 'c1') => ({ id: `p-${userId}`, user_id: userId, company_id: companyId, role: 'crew' });

const mount = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

beforeEach(() => {
  h.listeners = [];
  h.session = null;
  h.reads = [];
  h.renders = [];
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('profileResolved', () => {
  it('a session user is unresolved while the profile read runs, then resolved with the row', async () => {
    h.session = { user: { id: 'u1' } };
    mount();
    await flush();
    expect(state()).toMatchObject({ user: 'u1', profile: null, profileResolved: false, loading: false });
    await act(async () => readFor('u1').resolve({ data: row('u1'), error: null }));
    expect(state()).toMatchObject({ user: 'u1', profile: 'u1', profileResolved: true });
    // Never resolved for u1 before the row arrived.
    expect(h.renders.some((r) => r.user === 'u1' && r.profileResolved && r.profile === null)).toBe(false);
  });

  it('a read that answers with an error resolves with no profile', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    h.session = { user: { id: 'u1' } };
    mount();
    await flush();
    await act(async () => readFor('u1').resolve({ data: null, error: { message: 'permission denied' } }));
    expect(state()).toMatchObject({ user: 'u1', profile: null, profileResolved: true });
  });

  it('a read that rejects resolves too, with no profile', async () => {
    h.session = { user: { id: 'u1' } };
    mount();
    await flush();
    await act(async () => readFor('u1').reject(new Error('network down')));
    expect(state()).toMatchObject({ user: 'u1', profile: null, profileResolved: true });
  });

  it('no session: resolved, with no profile and no read', async () => {
    mount();
    await flush();
    expect(state()).toEqual({ user: null, profile: null, profileResolved: true, loading: false });
    expect(h.reads).toEqual([]);
  });

  it('a sign-in starts unresolved in the same render; a token refresh keeps it resolved; a sign-out resolves', async () => {
    mount();
    await flush();
    expect(state().profileResolved).toBe(true);

    h.renders = [];
    await emit('SIGNED_IN', { user: { id: 'u2' } });
    // The signed-out "resolved" never stands for the new user.
    expect(h.renders.some((r) => r.user === 'u2' && r.profileResolved)).toBe(false);
    expect(state()).toMatchObject({ user: 'u2', profileResolved: false });
    await act(async () => readFor('u2').resolve({ data: row('u2'), error: null }));
    expect(state()).toMatchObject({ user: 'u2', profile: 'u2', profileResolved: true });

    h.renders = [];
    await emit('TOKEN_REFRESHED', { user: { id: 'u2' } });
    expect(h.renders.every((r) => r.profileResolved && r.profile === 'u2')).toBe(true);
    await act(async () => readFor('u2').resolve({ data: row('u2'), error: null }));
    expect(state()).toMatchObject({ user: 'u2', profile: 'u2', profileResolved: true });

    await emit('SIGNED_OUT', null);
    expect(state()).toMatchObject({ user: null, profile: null, profileResolved: true });
  });

  it("a read for the previous user that lands after a switch neither shows nor resolves the new user's profile", async () => {
    h.session = { user: { id: 'u1' } };
    mount();
    await flush();
    const first = readFor('u1');
    await emit('SIGNED_IN', { user: { id: 'u2' } });
    await act(async () => first.resolve({ data: row('u1'), error: null }));
    expect(state()).toMatchObject({ user: 'u2', profile: null, profileResolved: false });
    await act(async () => readFor('u2').resolve({ data: row('u2', null), error: null }));
    expect(state()).toMatchObject({ user: 'u2', profile: 'u2', profileResolved: true });
  });
});
