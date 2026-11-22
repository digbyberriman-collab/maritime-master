/**
 * A failed identity read must not hang the scope routes (D-04 fail closed,
 * D-54). getUser() resolves to `{ data: { user: null }, error }` when the auth
 * server is unreachable; the RBAC store once took that for a sign-out and
 * committed roles for nobody, so useScopeAccess, which waits for roles loaded
 * for the signed-in user, never became ready. The store now reads the stored
 * session instead; these tests drive the real store and the real hook.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { AuthRetryableFetchError } from '@supabase/supabase-js';

type RpcResult = { data: unknown; error: { message: string } | null };

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const ok = { data: [], error: null };
  return {
    supabase: {
      auth: { getSession: mocks.getSession, getUser: mocks.getUser },
      from: () => ({
        select: () => ({
          eq: () => ({ order: async () => ok }),
          then: (resolve: (value: typeof ok) => void) => resolve(ok),
        }),
      }),
      rpc: mocks.rpc,
    },
  };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    profile: { id: 'p1', user_id: 'u1', role: 'crew', company_id: 'c1' },
    loading: false,
  }),
}));
vi.mock('@/modules/vessels/contexts/VesselContext', () => ({
  useVessel: () => ({
    loading: false,
    loadedForUserId: 'u1',
    vessels: [],
    selectedVesselId: null,
    isAllVessels: false,
    canAccessAllVessels: false,
    getVesselCodeById: () => null,
  }),
}));

import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { useScopeAccess } from '@/app/router/useScopeAccess';

const answerRpcs = (result: (name: string) => RpcResult) => {
  mocks.rpc.mockImplementation(async (name: string) => result(name));
};

describe('RBAC identity read and scope readiness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    usePermissionsStore.getState().reset();
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
    // What getUser() resolves to when /auth/v1/user is unreachable.
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) });
  });

  afterEach(() => {
    usePermissionsStore.getState().reset();
    vi.useRealTimers();
    vi.mocked(console.error).mockRestore();
    mocks.getSession.mockReset();
    mocks.getUser.mockReset();
    mocks.rpc.mockReset();
  });

  it('becomes ready with no fleet reach when the role queries fail (fail closed, not hung)', async () => {
    answerRpcs(() => ({ data: null, error: { message: 'Failed to fetch' } }));
    await act(async () => {
      await usePermissionsStore.getState().loadPermissions();
    });

    const state = usePermissionsStore.getState();
    expect(state).toMatchObject({ loadedFor: 'u1', isInitialized: true, isLoading: false, userRoles: [] });
    expect(state.error).toBeTruthy();

    const { result } = renderHook(() => useScopeAccess());
    expect(result.current.ready).toBe(true);
    expect(result.current.fleetReach).toBe(false);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('becomes ready with fleet reach when the role queries succeed with a fleet-wide role', async () => {
    answerRpcs((name) => ({
      data: name === 'get_user_roles_full' ? [{ role_name: 'fleet_master', is_fleet_wide: true }] : [],
      error: null,
    }));
    await act(async () => {
      await usePermissionsStore.getState().loadPermissions();
    });

    expect(usePermissionsStore.getState()).toMatchObject({ loadedFor: 'u1', isInitialized: true, error: null });

    const { result } = renderHook(() => useScopeAccess());
    expect(result.current.ready).toBe(true);
    expect(result.current.fleetReach).toBe(true);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});
