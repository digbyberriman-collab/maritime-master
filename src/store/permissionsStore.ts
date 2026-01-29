import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { 
  ModulePermission, 
  Role, 
  UserRole, 
  Module, 
  PermissionLevel 
} from '@/types/permissions';

interface PermissionsState {
  permissions: ModulePermission[];
  userRoles: UserRole[];
  modules: Module[];
  roles: Role[];
  currentVesselId: string | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  hasFleetAccess: boolean;
  primaryRole: Role | null;
  
  loadPermissions: () => Promise<void>;
  setCurrentVessel: (vesselId: string | null) => void;
  hasPermission: (moduleKey: string, permission?: PermissionLevel) => boolean;
  canView: (moduleKey: string) => boolean;
  canEdit: (moduleKey: string) => boolean;
  canAdmin: (moduleKey: string) => boolean;
  getVisibleModules: () => Module[];
  hasRole: (roleName: string) => boolean;
  getRestrictions: (moduleKey: string) => Record<string, boolean>;
  reset: () => void;
}

// Role priority order (higher priority first)
const ROLE_PRIORITY = [
  'dpa', 
  'fleet_master', 
  'captain', 
  'chief_officer', 
  'chief_engineer', 
  'purser', 
  'hod', 
  'officer', 
  'crew', 
  'auditor',
  'employer_api'
];

export const usePermissionsStore = create<PermissionsState>((set, get) => ({
  permissions: [],
  userRoles: [],
  modules: [],
  roles: [],
  currentVesselId: null,
  isLoading: false,
  isInitialized: false,
  error: null,
  hasFleetAccess: false,
  primaryRole: null,

  loadPermissions: async () => {
    const { isLoading, isInitialized } = get();
    
    // Prevent duplicate loads
    if (isLoading) return;
    
    set({ isLoading: true, error: null });
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        set({ 
          permissions: [],
          userRoles: [],
          hasFleetAccess: false,
          primaryRole: null,
          isLoading: false,
          isInitialized: true,
        });
        return;
      }

      // Fetch all data in parallel
      const [modulesRes, rolesRes, userRolesRes, permissionsRes] = await Promise.all([
        supabase.from('modules').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('roles').select('*'),
        supabase.rpc('get_user_roles_full', { p_user_id: user.id }),
        supabase.rpc('get_user_permissions_full', { p_user_id: user.id }),
      ]);

      if (modulesRes.error) throw modulesRes.error;
      if (rolesRes.error) throw rolesRes.error;
      if (userRolesRes.error) throw userRolesRes.error;
      if (permissionsRes.error) throw permissionsRes.error;

      const userRoles = (userRolesRes.data ?? []) as UserRole[];
      const hasFleetAccess = userRoles.some((ur) => ur.is_fleet_wide);
      
      // Determine primary role by priority
      const primaryRoleName = userRoles
        .map((ur) => ur.role_name)
        .sort((a, b) => ROLE_PRIORITY.indexOf(a) - ROLE_PRIORITY.indexOf(b))[0];
      
      const primaryRole = (rolesRes.data as Role[])?.find(
        (r) => r.name === primaryRoleName
      ) ?? null;

      set({
        modules: (modulesRes.data ?? []) as Module[],
        roles: (rolesRes.data ?? []) as Role[],
        userRoles,
        permissions: (permissionsRes.data ?? []) as ModulePermission[],
        hasFleetAccess,
        primaryRole,
        isLoading: false,
        isInitialized: true,
      });
    } catch (error) {
      console.error('Failed to load permissions:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load permissions',
        isLoading: false,
        isInitialized: true,
      });
    }
  },

  setCurrentVessel: (vesselId) => set({ currentVesselId: vesselId }),

  hasPermission: (moduleKey, permission = 'view') => {
    const { permissions } = get();
    const perm = permissions.find(p => p.module_key === moduleKey);
    
    if (!perm) return false;
    
    switch (permission) {
      case 'view': return perm.can_view;
      case 'edit': return perm.can_edit;
      case 'admin': return perm.can_admin;
      default: return false;
    }
  },

  canView: (moduleKey) => get().hasPermission(moduleKey, 'view'),
  canEdit: (moduleKey) => get().hasPermission(moduleKey, 'edit'),
  canAdmin: (moduleKey) => get().hasPermission(moduleKey, 'admin'),

  getVisibleModules: () => {
    const { modules, permissions } = get();
    const viewableKeys = new Set(
      permissions.filter(p => p.can_view).map(p => p.module_key)
    );
    return modules.filter(m => viewableKeys.has(m.key));
  },

  hasRole: (roleName) => {
    return get().userRoles.some(ur => ur.role_name === roleName);
  },

  getRestrictions: (moduleKey) => {
    const perm = get().permissions.find(p => p.module_key === moduleKey);
    return perm?.restrictions ?? {};
  },

  reset: () => {
    set({
      permissions: [],
      userRoles: [],
      modules: [],
      roles: [],
      currentVesselId: null,
      isLoading: false,
      isInitialized: false,
      error: null,
      hasFleetAccess: false,
      primaryRole: null,
    });
  },
}));
