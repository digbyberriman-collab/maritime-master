import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { toast } from 'sonner';
import type { AppRole, UserRole, PermissionContext } from '@/modules/auth/lib/types';
import { PERMISSION_MATRIX, SCOPE_MATRIX, roleHasPermission } from '@/modules/auth/lib/rbacMatrix';
import { AUDIT_MODE_RULES, isModuleAllowed, isActionAllowed } from '@/modules/auth/lib/auditModeRules';

// Helper functions
function hasFleetAccess(roles: AppRole[]): boolean {
  const fleetRoles: AppRole[] = ['superadmin', 'dpa', 'fleet_master'];
  return roles.some((role) => fleetRoles.includes(role));
}

function isAuditor(roles: AppRole[]): boolean {
  const auditorRoles: AppRole[] = ['auditor_flag', 'auditor_class'];
  return roles.some((role) => auditorRoles.includes(role));
}

function isExternalUser(roles: AppRole[]): boolean {
  const externalRoles: AppRole[] = ['auditor_flag', 'auditor_class', 'travel_agent', 'employer_api'];
  return roles.some((role) => externalRoles.includes(role));
}

function getHighestRole(roles: AppRole[]): AppRole | null {
  const roleOrder: AppRole[] = [
    'superadmin', 'dpa', 'fleet_master', 'captain', 'purser',
    'chief_officer', 'chief_engineer', 'hod', 'officer', 'crew',
    'auditor_flag', 'auditor_class', 'travel_agent', 'employer_api',
  ];
  for (const role of roleOrder) {
    if (roles.includes(role)) return role;
  }
  return null;
}

function getEffectivePermissions(roles: AppRole[]): Record<string, string[]> {
  const permissions: Record<string, string[]> = {};
  for (const [module, actions] of Object.entries(PERMISSION_MATRIX)) {
    const allowedActions: string[] = [];
    for (const [action, allowedRoles] of Object.entries(actions as Record<string, AppRole[]>)) {
      for (const role of roles) {
        if (allowedRoles.includes(role)) {
          if (AUDIT_MODE_RULES[role]) {
            if (!isModuleAllowed(role, module) || !isActionAllowed(role, action)) continue;
          }
          if (!allowedActions.includes(action)) allowedActions.push(action);
        }
      }
    }
    if (allowedActions.length > 0) permissions[module] = allowedActions;
  }
  return permissions;
}

function mapLegacyRole(legacyRole: string): AppRole {
  const mapping: Record<string, AppRole> = {
    master: 'captain',
    shore_management: 'dpa',
    chief_engineer: 'chief_engineer',
    chief_officer: 'chief_officer',
    crew: 'crew',
    dpa: 'dpa',
  };
  return mapping[legacyRole.toLowerCase()] || 'crew';
}

function checkPermission(
  roles: AppRole[],
  module: keyof typeof PERMISSION_MATRIX,
  action: string,
  context?: PermissionContext
): boolean {
  for (const role of roles) {
    if (AUDIT_MODE_RULES[role]) {
      if (!isModuleAllowed(role, module)) continue;
      if (!isActionAllowed(role, action)) continue;
    }
    if (roleHasPermission(role, module, action)) {
      if (context && !checkContextRestrictions(role, module, action, context)) continue;
      return true;
    }
  }
  return false;
}

function checkContextRestrictions(
  role: AppRole,
  module: keyof typeof PERMISSION_MATRIX,
  action: string,
  context: PermissionContext
): boolean {
  const scope = SCOPE_MATRIX[role];

  if (module === 'crew') {
    const selfOnlyActions = ['edit_own_limited', 'view_salary', 'view_medical'];
    if (selfOnlyActions.includes(action) && role === 'crew') {
      if (!context.isSelf && context.targetUserId !== context.userId) return false;
    }
  }

  if (scope.vessel !== 'full' && scope.fleet !== 'full') {
    if (['captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer'].includes(role)) {
      if (context.targetVesselId && context.vesselId !== context.targetVesselId) return false;
    }
  }

  if (scope.department === 'full' && scope.vessel !== 'full') {
    if (['chief_officer', 'chief_engineer', 'hod'].includes(role)) {
      if (role === 'chief_officer' && context.targetDepartment && context.targetDepartment !== 'Deck') return false;
      if (role === 'chief_engineer' && context.targetDepartment && context.targetDepartment !== 'Engine') return false;
      if (role === 'hod' && context.targetDepartment && context.department !== context.targetDepartment) return false;
    }
  }

  return true;
}

// Fetch user roles from database
export function useUserRoles(userId?: string) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;

  return useQuery({
    queryKey: ['user-roles', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return [];

      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', targetUserId)
        .eq('is_active', true);

      if (error) throw error;

      // Cast to proper type
      return (data || []).map((role) => ({
        ...role,
        role: role.role as AppRole,
      })) as UserRole[];
    },
    enabled: !!targetUserId,
  });
}

// Get active roles as AppRole array
export function useActiveRoles() {
  const { data: userRoles = [], isLoading } = useUserRoles();
  const { profile } = useAuth();

  // Combine database roles with legacy profile role
  const roles: AppRole[] = userRoles.map((r) => r.role);

  // Add legacy role from profile if exists and not already in roles
  if (profile?.role) {
    const legacyRole = mapLegacyRole(profile.role);
    if (!roles.includes(legacyRole)) {
      roles.push(legacyRole);
    }
  }

  return { roles, isLoading };
}

// Permission check hook
export function useHasPermission(
  module: keyof typeof PERMISSION_MATRIX,
  action: string,
  context?: PermissionContext
) {
  const { roles, isLoading } = useActiveRoles();

  return {
    hasPermission: !isLoading && checkPermission(roles, module, action, context),
    isLoading,
  };
}

// Multiple permission checks
export function usePermissions() {
  const { roles, isLoading } = useActiveRoles();
  const { user, profile } = useAuth();

  const check = (
    module: keyof typeof PERMISSION_MATRIX,
    action: string,
    context?: PermissionContext
  ) => {
    if (isLoading) return false;
    return checkPermission(roles, module, action, context);
  };

  return {
    roles,
    isLoading,
    check,
    hasFleetAccess: () => hasFleetAccess(roles),
    isAuditor: () => isAuditor(roles),
    isExternal: () => isExternalUser(roles),
    highestRole: getHighestRole(roles),
    effectivePermissions: getEffectivePermissions(roles),
    userId: user?.id,
    companyId: profile?.company_id,
  };
}

// Assign role mutation
export function useAssignRole() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      targetUserId,
      role,
      vesselId,
      department,
      expiresAt,
    }: {
      targetUserId: string;
      role: AppRole;
      vesselId?: string;
      department?: string;
      expiresAt?: string;
    }) => {
      if (!user || !profile?.company_id) {
        throw new Error('Not authenticated');
      }

      const { data, error } = await supabase
        .from('user_roles')
        .insert({
          user_id: targetUserId,
          role,
          company_id: profile.company_id,
          vessel_id: vesselId || null,
          department: department || null,
          granted_by: user.id,
          expires_at: expiresAt || null,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['user-roles', variables.targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['user-roles'] });
      toast.success('Role assigned successfully');
    },
    onError: (error) => {
      toast.error(`Failed to assign role: ${error.message}`);
    },
  });
}

// Revoke role mutation
export function useRevokeRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase
        .from('user_roles')
        .update({ is_active: false })
        .eq('id', roleId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-roles'] });
      toast.success('Role revoked');
    },
    onError: (error) => {
      toast.error(`Failed to revoke role: ${error.message}`);
    },
  });
}

// Get all roles in company
export function useCompanyRoles() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['company-roles', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      const { data, error } = await supabase
        .from('user_roles')
        .select(`
          *,
          user:profiles!user_roles_user_id_fkey(first_name, last_name, email),
          vessel:vessels(name)
        `)
        .eq('company_id', profile.company_id)
        .eq('is_active', true);

      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id,
  });
}
