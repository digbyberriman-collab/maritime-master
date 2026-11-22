import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { usePermissionsStore, RBAC_RETRY_DELAYS_MS } from '@/modules/auth/store/permissionsStore';
import { supabase } from '@/integrations/supabase/client';

// Mock supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
      getSession: vi.fn(),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

describe('permissionsStore', () => {
  beforeEach(() => {
    usePermissionsStore.getState().reset();
  });

  describe('initial state', () => {
    it('should have empty permissions', () => {
      const state = usePermissionsStore.getState();
      expect(state.permissions).toEqual([]);
      expect(state.userRoles).toEqual([]);
      expect(state.modules).toEqual([]);
      expect(state.roles).toEqual([]);
    });

    it('should not be loading initially', () => {
      expect(usePermissionsStore.getState().isLoading).toBe(false);
    });

    it('should not be initialized initially', () => {
      expect(usePermissionsStore.getState().isInitialized).toBe(false);
    });

    it('should have no fleet access', () => {
      expect(usePermissionsStore.getState().hasFleetAccess).toBe(false);
    });

    it('should have no primary role', () => {
      expect(usePermissionsStore.getState().primaryRole).toBeNull();
    });

    it('should have no error', () => {
      expect(usePermissionsStore.getState().error).toBeNull();
    });

    it("should hold nobody's roles", () => {
      expect(usePermissionsStore.getState().loadedFor).toBeNull();
    });
  });

  describe('setCurrentVessel', () => {
    it('should update currentVesselId', () => {
      usePermissionsStore.getState().setCurrentVessel('vessel-123');
      expect(usePermissionsStore.getState().currentVesselId).toBe('vessel-123');
    });

    it('should allow setting to null', () => {
      usePermissionsStore.getState().setCurrentVessel('vessel-123');
      usePermissionsStore.getState().setCurrentVessel(null);
      expect(usePermissionsStore.getState().currentVesselId).toBeNull();
    });
  });

  describe('hasPermission', () => {
    it('should return false when no permissions are loaded', () => {
      expect(usePermissionsStore.getState().hasPermission('crew')).toBe(false);
    });

    it('should check view permission by default', () => {
      usePermissionsStore.setState({
        permissions: [
          { module_key: 'crew', can_view: true, can_edit: false, can_admin: false } as any,
        ],
      });
      expect(usePermissionsStore.getState().hasPermission('crew')).toBe(true);
      expect(usePermissionsStore.getState().hasPermission('crew', 'view')).toBe(true);
    });

    it('should check edit permission', () => {
      usePermissionsStore.setState({
        permissions: [
          { module_key: 'crew', can_view: true, can_edit: true, can_admin: false } as any,
        ],
      });
      expect(usePermissionsStore.getState().hasPermission('crew', 'edit')).toBe(true);
    });

    it('should check admin permission', () => {
      usePermissionsStore.setState({
        permissions: [
          { module_key: 'crew', can_view: true, can_edit: true, can_admin: true } as any,
        ],
      });
      expect(usePermissionsStore.getState().hasPermission('crew', 'admin')).toBe(true);
    });

    it('should return false for unknown permission level', () => {
      usePermissionsStore.setState({
        permissions: [
          { module_key: 'crew', can_view: true, can_edit: true, can_admin: true } as any,
        ],
      });
      expect(usePermissionsStore.getState().hasPermission('crew', 'unknown' as any)).toBe(false);
    });
  });

  describe('canView / canEdit / canAdmin', () => {
    beforeEach(() => {
      usePermissionsStore.setState({
        permissions: [
          { module_key: 'crew', can_view: true, can_edit: true, can_admin: false } as any,
          { module_key: 'incidents', can_view: true, can_edit: false, can_admin: false } as any,
        ],
      });
    });

    it('canView should return true when permission exists', () => {
      expect(usePermissionsStore.getState().canView('crew')).toBe(true);
      expect(usePermissionsStore.getState().canView('incidents')).toBe(true);
    });

    it('canEdit should check edit permission', () => {
      expect(usePermissionsStore.getState().canEdit('crew')).toBe(true);
      expect(usePermissionsStore.getState().canEdit('incidents')).toBe(false);
    });

    it('canAdmin should check admin permission', () => {
      expect(usePermissionsStore.getState().canAdmin('crew')).toBe(false);
    });
  });

  describe('getVisibleModules', () => {
    it('should return only modules that the user can view', () => {
      usePermissionsStore.setState({
        modules: [
          { key: 'crew', name: 'Crew' } as any,
          { key: 'incidents', name: 'Incidents' } as any,
          { key: 'documents', name: 'Documents' } as any,
        ],
        permissions: [
          { module_key: 'crew', can_view: true, can_edit: false, can_admin: false } as any,
          { module_key: 'incidents', can_view: false, can_edit: false, can_admin: false } as any,
          { module_key: 'documents', can_view: true, can_edit: false, can_admin: false } as any,
        ],
      });

      const visible = usePermissionsStore.getState().getVisibleModules();
      expect(visible).toHaveLength(2);
      expect(visible.map((m: any) => m.key)).toEqual(['crew', 'documents']);
    });

    it('should return empty array when no permissions', () => {
      usePermissionsStore.setState({
        modules: [{ key: 'crew', name: 'Crew' } as any],
        permissions: [],
      });

      expect(usePermissionsStore.getState().getVisibleModules()).toEqual([]);
    });
  });

  describe('hasRole', () => {
    it('should return true when user has the role', () => {
      usePermissionsStore.setState({
        userRoles: [{ role_name: 'dpa' } as any],
      });
      expect(usePermissionsStore.getState().hasRole('dpa')).toBe(true);
    });

    it('should return false when user does not have the role', () => {
      usePermissionsStore.setState({
        userRoles: [{ role_name: 'crew' } as any],
      });
      expect(usePermissionsStore.getState().hasRole('dpa')).toBe(false);
    });
  });

  describe('getRestrictions', () => {
    it('should return restrictions for a module', () => {
      usePermissionsStore.setState({
        permissions: [
          { module_key: 'crew', can_view: true, restrictions: { vessel_only: true } } as any,
        ],
      });

      const restrictions = usePermissionsStore.getState().getRestrictions('crew');
      expect(restrictions).toEqual({ vessel_only: true });
    });

    it('should return empty object when no restrictions', () => {
      usePermissionsStore.setState({
        permissions: [
          { module_key: 'crew', can_view: true } as any,
        ],
      });

      const restrictions = usePermissionsStore.getState().getRestrictions('crew');
      expect(restrictions).toEqual({});
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      usePermissionsStore.setState({
        permissions: [{ module_key: 'crew' } as any],
        userRoles: [{ role_name: 'dpa' } as any],
        isInitialized: true,
        hasFleetAccess: true,
        currentVesselId: 'vessel-1',
      });

      usePermissionsStore.getState().reset();

      const state = usePermissionsStore.getState();
      expect(state.permissions).toEqual([]);
      expect(state.userRoles).toEqual([]);
      expect(state.isInitialized).toBe(false);
      expect(state.hasFleetAccess).toBe(false);
      expect(state.currentVesselId).toBeNull();
    });
  });

  // D-41: one user's roles are never presented as another's.
  describe('loadPermissions across users', () => {
    type GetUser = typeof supabase.auth.getUser;
    type GetSession = typeof supabase.auth.getSession;
    type Rpc = typeof supabase.rpc;
    const getUser = vi.mocked(supabase.auth.getUser);
    const getSession = vi.mocked(supabase.auth.getSession);
    const rpc = vi.mocked(supabase.rpc);
    let signedIn: string | null = 'uA';
    const holds = new Map<string, Promise<void>>();
    const rolesOf: Record<string, { role_name: string; is_fleet_wide: boolean }[]> = {
      uA: [{ role_name: 'dpa', is_fleet_wide: true }],
      uB: [{ role_name: 'crew', is_fleet_wide: false }],
    };
    /** Hold one user's RPCs back until the returned function is called. */
    const hold = (userId: string) => {
      let release = () => {};
      holds.set(userId, new Promise<void>((resolve) => { release = resolve; }));
      return () => release();
    };
    /** Let every pending promise chain run. */
    const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
    const store = () => usePermissionsStore.getState();
    const roleNames = () => store().userRoles.map((r) => r.role_name);

    beforeEach(() => {
      signedIn = 'uA';
      holds.clear();
      getSession.mockImplementation((async () => ({
        data: { session: signedIn ? { user: { id: signedIn } } : null },
        error: null,
      })) as unknown as GetSession);
      // The shape getUser() resolves to when /auth/v1/user is unreachable. The
      // store must not ask it: an outage would pass for a sign-out.
      getUser.mockImplementation((async () => ({
        data: { user: null },
        error: new AuthRetryableFetchError('Failed to fetch', 0),
      })) as unknown as GetUser);
      rpc.mockImplementation((async (name: string, args: { p_user_id: string }) => {
        await holds.get(args.p_user_id);
        return { data: name === 'get_user_roles_full' ? rolesOf[args.p_user_id] ?? [] : [], error: null };
      }) as unknown as Rpc);
    });

    afterEach(() => {
      expect(getUser).not.toHaveBeenCalled();
      getUser.mockReset();
      getSession.mockReset();
      rpc.mockReset();
      rpc.mockResolvedValue({ data: [], error: null } as never);
    });

    it("loads the signed-in user's roles and records whose they are", async () => {
      await store().loadPermissions();
      expect(store()).toMatchObject({ loadedFor: 'uA', isInitialized: true, isLoading: false, hasFleetAccess: true, error: null });
      expect(roleNames()).toEqual(['dpa']);
    });

    it('records nobody when no one is signed in', async () => {
      signedIn = null;
      await store().loadPermissions();
      expect(store()).toMatchObject({ loadedFor: null, isInitialized: true, isLoading: false, hasFleetAccess: false });
      expect(roleNames()).toEqual([]);
    });

    it('dedupes a second load for the same user while one is in flight', async () => {
      const release = hold('uA');
      const first = store().loadPermissions();
      await flush();
      const second = store().loadPermissions();
      await flush();
      release();
      await Promise.all([first, second]);
      // One load is one pair of RPCs.
      expect(rpc).toHaveBeenCalledTimes(2);
      expect(store()).toMatchObject({ loadedFor: 'uA', isLoading: false, isInitialized: true });
    });

    it("discards a load for A that finishes after a switch to B, and loads B's instead", async () => {
      const seen: { loadedFor: string | null; roles: string[]; isLoading: boolean }[] = [];
      const unsubscribe = usePermissionsStore.subscribe((s) => {
        seen.push({ loadedFor: s.loadedFor, roles: s.userRoles.map((r) => r.role_name), isLoading: s.isLoading });
      });
      try {
        const release = hold('uA');
        const load = store().loadPermissions();
        await flush();
        expect(store().isLoading).toBe(true);

        signedIn = 'uB';
        release();
        await load;

        expect(store()).toMatchObject({ loadedFor: 'uB', isInitialized: true, isLoading: false, hasFleetAccess: false });
        expect(roleNames()).toEqual(['crew']);
        expect(rpc).toHaveBeenCalledWith('get_user_roles_full', { p_user_id: 'uB' });
        // A's roles were never written, and the store stayed loading until B's landed.
        expect(seen.some((s) => s.roles.includes('dpa') || s.loadedFor === 'uA')).toBe(false);
        expect(seen.filter((s) => !s.isLoading).every((s) => s.loadedFor === 'uB')).toBe(true);
      } finally {
        unsubscribe();
      }
    });

    it('lets a load for another user supersede the one in flight', async () => {
      const release = hold('uA');
      const forA = store().loadPermissions();
      await flush();
      signedIn = 'uB';
      await store().loadPermissions();
      expect(store()).toMatchObject({ loadedFor: 'uB', isLoading: false });

      release();
      await forA;
      expect(store()).toMatchObject({ loadedFor: 'uB', isLoading: false, hasFleetAccess: false });
      expect(roleNames()).toEqual(['crew']);
    });

    it('reset() invalidates a load in flight', async () => {
      const release = hold('uA');
      const load = store().loadPermissions();
      await flush();
      store().reset();
      release();
      await load;
      await flush();
      expect(store()).toMatchObject({ loadedFor: null, isInitialized: false, isLoading: false, hasFleetAccess: false });
      expect(roleNames()).toEqual([]);
    });

    it('reset() while the user is still being resolved drops the call', async () => {
      let resolveUser: () => void = () => {};
      getSession.mockImplementationOnce((() => new Promise((resolve) => {
        resolveUser = () => resolve({ data: { session: { user: { id: 'uA' } } }, error: null });
      })) as unknown as GetSession);
      const load = store().loadPermissions();
      store().reset();
      resolveUser();
      await load;
      await flush();
      expect(store()).toMatchObject({ loadedFor: null, isInitialized: false, isLoading: false });
      expect(rpc).not.toHaveBeenCalled();
    });

    // A read that fails is never a sign-out, and never an unbounded wait
    // (D-04 fail closed; D-54).
    describe('when a read fails', () => {
      type RpcResult = { data: unknown; error: { message: string } | null };
      const failing: RpcResult = { data: null, error: { message: 'Failed to fetch' } };
      /** Answer the role RPCs with `answer()`, or with u1's roles when it returns null. */
      const rpcAnswers = (answer: () => RpcResult | null) => {
        rpc.mockImplementation((async (name: string) =>
          answer() ?? { data: name === 'get_user_roles_full' ? [{ role_name: 'fleet_master', is_fleet_wide: true }] : [], error: null }
        ) as unknown as Rpc);
      };
      const loads = () => rpc.mock.calls.length / 2;

      beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        signedIn = 'u1';
      });

      afterEach(() => {
        store().reset();
        vi.useRealTimers();
        vi.mocked(console.error).mockRestore();
      });

      it('reads the identity from the stored session, so a failing getUser() is not a sign-out', async () => {
        rpcAnswers(() => null);
        await store().loadPermissions();
        expect(store()).toMatchObject({ loadedFor: 'u1', isInitialized: true, isLoading: false, error: null });
        expect(roleNames()).toEqual(['fleet_master']);
        expect(getSession).toHaveBeenCalled();
      });

      it('commits no roles for the session user, with an error, when the role queries fail', async () => {
        rpcAnswers(() => failing);
        await store().loadPermissions();
        expect(store()).toMatchObject({ loadedFor: 'u1', isInitialized: true, isLoading: false, hasFleetAccess: false });
        expect(store().error).toBeTruthy();
        expect(store().userRoles).toEqual([]);
      });

      it('retries after the first delay and lands the roles once the queries recover', async () => {
        let down = true;
        rpcAnswers(() => (down ? failing : null));
        await store().loadPermissions();
        expect(store().error).toBeTruthy();

        down = false;
        await vi.advanceTimersByTimeAsync(RBAC_RETRY_DELAYS_MS[0]);
        expect(store()).toMatchObject({ loadedFor: 'u1', isLoading: false, hasFleetAccess: true, error: null });
        expect(roleNames()).toEqual(['fleet_master']);
        expect(vi.getTimerCount()).toBe(0);
      });

      it('gives up after the bounded retries, and a manual load still works and restores the budget', async () => {
        let down = true;
        rpcAnswers(() => (down ? failing : null));
        await store().loadPermissions();
        const total = RBAC_RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0);
        await vi.advanceTimersByTimeAsync(total * 10);
        expect(loads()).toBe(1 + RBAC_RETRY_DELAYS_MS.length);
        expect(vi.getTimerCount()).toBe(0);
        expect(store()).toMatchObject({ loadedFor: 'u1', isLoading: false, isInitialized: true });
        expect(store().error).toBeTruthy();

        // Out of retries: a manual load (a shell Retry button) still runs...
        down = false;
        await store().loadPermissions();
        expect(store()).toMatchObject({ loadedFor: 'u1', hasFleetAccess: true, error: null });

        // ...and its success restores the retry budget.
        down = true;
        await store().loadPermissions();
        const before = loads();
        await vi.advanceTimersByTimeAsync(total * 10);
        expect(loads() - before).toBe(RBAC_RETRY_DELAYS_MS.length);
      });

      it('reset() cancels a pending retry', async () => {
        rpcAnswers(() => failing);
        await store().loadPermissions();
        expect(vi.getTimerCount()).toBe(1);
        store().reset();
        rpc.mockClear();
        await vi.advanceTimersByTimeAsync(RBAC_RETRY_DELAYS_MS[0] * 10);
        expect(rpc).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
      });

      it("keeps the user's own roles when a refresh cannot read the session, and never commits a sign-out", async () => {
        rpcAnswers(() => null);
        await store().loadPermissions();
        expect(store()).toMatchObject({ loadedFor: 'u1', hasFleetAccess: true });

        const seen: (string | null)[] = [];
        const unsubscribe = usePermissionsStore.subscribe((s) => { seen.push(s.loadedFor); });
        try {
          getSession.mockResolvedValueOnce({
            data: { session: null },
            error: new AuthRetryableFetchError('x', 0),
          } as unknown as Awaited<ReturnType<GetSession>>);
          rpc.mockClear();
          await store().loadPermissions();

          expect(store()).toMatchObject({ loadedFor: 'u1', isLoading: false, isInitialized: true, hasFleetAccess: true });
          expect(store().error).toBeTruthy();
          expect(roleNames()).toEqual(['fleet_master']);
          expect(seen).not.toContain(null);
          // Nothing was loaded for "nobody".
          expect(rpc).not.toHaveBeenCalled();
        } finally {
          unsubscribe();
        }

        // The retry reads the session again and refreshes the same user.
        await vi.advanceTimersByTimeAsync(RBAC_RETRY_DELAYS_MS[0]);
        expect(store()).toMatchObject({ loadedFor: 'u1', hasFleetAccess: true, error: null });
      });

      it('writes for the user read at the start when only the re-read before the write fails', async () => {
        rpcAnswers(() => null);
        getSession
          .mockResolvedValueOnce({ data: { session: { user: { id: 'u1' } } }, error: null } as unknown as Awaited<ReturnType<GetSession>>)
          .mockResolvedValueOnce({ data: { session: null }, error: new AuthRetryableFetchError('x', 0) } as unknown as Awaited<ReturnType<GetSession>>);
        await store().loadPermissions();
        expect(store()).toMatchObject({ loadedFor: 'u1', isLoading: false, hasFleetAccess: true, error: null });
        expect(loads()).toBe(1);
      });
    });
  });
});
