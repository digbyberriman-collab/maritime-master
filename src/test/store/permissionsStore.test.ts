import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePermissionsStore } from '@/store/permissionsStore';

// Mock supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
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
});
