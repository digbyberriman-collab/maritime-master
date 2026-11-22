import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { 
  ModulePermission, 
  Role, 
  UserRole, 
  Module, 
  PermissionLevel 
} from '@/modules/auth/types';

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
  /**
   * The user (auth user id) whose roles and permissions the store holds, or
   * null when it holds nobody's. A switch to another account keeps
   * `isInitialized` set, so readers that must only ever act on the signed-in
   * user's own roles compare this with that user's id (D-41).
   */
  loadedFor: string | null;
  
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
  'superadmin',
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

type RawPermission = {
  module_key: string;
  permission: PermissionLevel;
  scope: ModulePermission['scope'];
  restrictions: Record<string, boolean> | null;
};

const permissionIncludes = (actual: PermissionLevel, required: PermissionLevel) => {
  if (actual === 'admin') return true;
  if (actual === 'edit') return required === 'view' || required === 'edit';
  return required === 'view';
};

/** Nobody's roles: what a signed-out user, or a failed first load, holds. */
const NO_ROLES = {
  permissions: [] as ModulePermission[],
  userRoles: [] as UserRole[],
  hasFleetAccess: false,
  primaryRole: null as Role | null,
};

/*
 * One user's roles must never be presented as another's (D-41; fail closed,
 * D-04). Every load takes a ticket from `loadSeq`; a newer load or reset()
 * supersedes it, and a superseded load never writes. `resetEpoch` moves only
 * on reset(), so a call still resolving its user when the store is reset is
 * dropped outright. `inFlight` is the latest load and the user it is for.
 */
let loadSeq = 0;
let resetEpoch = 0;
let inFlight: { seq: number; userId: string | null } | null = null;

/** The signed-in user's id as Supabase reports it now; null if none or unreadable. */
const currentAuthUserId = async (): Promise<string | null> => {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch (error) {
    console.error('Failed to read the signed-in user:', error);
    return null;
  }
};

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
  loadedFor: null,

  loadPermissions: async () => {
    const epoch = resetEpoch;
    set({ isLoading: true, error: null });

    const userId = await currentAuthUserId();
    // Reset while the user was being resolved (a sign-out): this call is void.
    if (epoch !== resetEpoch) return;
    // Already loading this user's roles: that load answers this call too.
    if (inFlight && inFlight.userId === userId) return;

    // A load still running for another user is superseded by this one, which
    // is its re-run for the user signed in now: it can no longer write.
    loadSeq += 1;
    const seq = loadSeq;
    inFlight = { seq, userId };
    set({ isLoading: true, error: null });
    const live = () => seq === loadSeq;
    const settle = () => {
      if (inFlight?.seq === seq) inFlight = null;
    };

    // Write the result only while this load is the latest and its user is
    // still the signed-in one. A user who changed under the load (no reset
    // in between) gets a fresh load; isLoading stays true until it lands.
    const commit = async (patch: Partial<PermissionsState>): Promise<void> => {
      if (!live()) return settle();
      const stillSignedIn = await currentAuthUserId();
      if (!live()) return settle();
      settle();
      if (stillSignedIn !== userId) {
        await get().loadPermissions();
        return;
      }
      set({ ...patch, loadedFor: userId, isLoading: false, isInitialized: true });
    };

    if (!userId) {
      await commit({ ...NO_ROLES });
      return;
    }

    let result: Partial<PermissionsState>;
    try {
      // Fetch all data in parallel
      const [modulesRes, rolesRes, userRolesRes, permissionsRes] = await Promise.all([
        supabase.from('modules').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('roles').select('*'),
        supabase.rpc('get_user_roles_full', { p_user_id: userId }),
        supabase.rpc('get_user_rbac_permissions', { p_user_id: userId }),
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
        .sort((a, b) => {
          const aIndex = ROLE_PRIORITY.indexOf(a);
          const bIndex = ROLE_PRIORITY.indexOf(b);
          return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) -
            (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
        })[0];
      
      const primaryRole = (rolesRes.data as Role[])?.find(
        (r) => r.name === primaryRoleName
      ) ?? null;

      const modules = (modulesRes.data ?? []) as Module[];
      const moduleNames = new Map(modules.map((module) => [module.key, module.name]));
      const permissionsByModule = new Map<string, ModulePermission>();

      ((permissionsRes.data ?? []) as RawPermission[]).forEach((permissionRow) => {
        const existing = permissionsByModule.get(permissionRow.module_key) ?? {
          module_key: permissionRow.module_key,
          module_name: moduleNames.get(permissionRow.module_key) ?? permissionRow.module_key,
          can_view: false,
          can_edit: false,
          can_admin: false,
          scope: permissionRow.scope,
          restrictions: permissionRow.restrictions ?? {},
        };

        existing.can_view = existing.can_view || permissionIncludes(permissionRow.permission, 'view');
        existing.can_edit = existing.can_edit || permissionIncludes(permissionRow.permission, 'edit');
        existing.can_admin = existing.can_admin || permissionIncludes(permissionRow.permission, 'admin');
        existing.scope = existing.scope ?? permissionRow.scope;
        existing.restrictions = { ...(existing.restrictions ?? {}), ...(permissionRow.restrictions ?? {}) };
        permissionsByModule.set(permissionRow.module_key, existing);
      });

      result = {
        modules,
        roles: (rolesRes.data ?? []) as Role[],
        userRoles,
        permissions: Array.from(permissionsByModule.values()),
        hasFleetAccess,
        primaryRole,
      };
    } catch (error) {
      if (live()) console.error('Failed to load permissions:', error);
      result = {
        error: error instanceof Error ? error.message : 'Failed to load permissions',
        // A failed refresh keeps this user's own roles; anyone else's go.
        ...(get().loadedFor === userId ? {} : NO_ROLES),
      };
    }
    await commit(result);
  },

  setCurrentVessel: (vesselId) => set({ currentVesselId: vesselId }),

  hasPermission: (moduleKey, permission = 'view') => {
    const { permissions } = get();
    const perm = permissions.find(p => p.module_key === moduleKey);
    
    if (!perm) return false;
    
    switch (permission) {
      case 'view': return perm.can_view || perm.can_edit || perm.can_admin;
      case 'edit': return perm.can_edit || perm.can_admin;
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
      permissions.filter(p => p.can_view || p.can_edit || p.can_admin).map(p => p.module_key)
    );
    return modules.filter(m => viewableKeys.has(m.key));
  },

  hasRole: (roleName) => {
    const normalizedRole = roleName.toLowerCase().replace(/\s+/g, '_');
    return get().userRoles.some(ur =>
      ur.role_name?.toLowerCase() === normalizedRole ||
      ur.role_display_name?.toLowerCase().replace(/\s+/g, '_') === normalizedRole
    );
  },

  getRestrictions: (moduleKey) => {
    const perm = get().permissions.find(p => p.module_key === moduleKey);
    return perm?.restrictions ?? {};
  },

  reset: () => {
    // Any load still in flight is for the previous user: it must not write.
    loadSeq += 1;
    resetEpoch += 1;
    inFlight = null;
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
      loadedFor: null,
    });
  },
}));
