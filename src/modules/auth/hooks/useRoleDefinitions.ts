/**
 * The global role definitions (`roles`, `role_permissions`) and the module
 * catalogue, read only (Phase 2 spec §A.8, proposed D-124): every company
 * shares these rows, so tenants may look but never write. Migration file 8
 * freezes both tables to the service role and makes `log_permission_change`
 * service-only; access changes for one person go through Users & Access and
 * are audited by triggers.
 *
 * Any read error is thrown (the page shows its error state with Retry):
 * an empty matrix is never shown for a failed read.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AuditLogEntry, Module, PermissionLevel, Role, RolePermission } from '../types';

export interface RoleDefinitions {
  roles: Role[];
  modules: Module[];
  permissions: RolePermission[];
}

export const roleDefinitionKeys = {
  all: ['rbac', 'role-definitions'] as const,
  history: ['rbac', 'permission-history'] as const,
};

export function useRoleDefinitions() {
  return useQuery({
    queryKey: roleDefinitionKeys.all,
    queryFn: async (): Promise<RoleDefinitions> => {
      const [rolesRes, modulesRes, permsRes] = await Promise.all([
        supabase.from('roles').select('*').order('display_name'),
        supabase.from('modules').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('role_permissions').select('*'),
      ]);
      if (rolesRes.error) throw rolesRes.error;
      if (modulesRes.error) throw modulesRes.error;
      if (permsRes.error) throw permsRes.error;
      return {
        roles: (rolesRes.data ?? []) as Role[],
        modules: (modulesRes.data ?? []) as Module[],
        permissions: (permsRes.data ?? []) as RolePermission[],
      };
    },
  });
}

export function roleHas(permissions: readonly RolePermission[], roleId: string, moduleKey: string, level: PermissionLevel): boolean {
  return permissions.some((p) => p.role_id === roleId && p.module_key === moduleKey && p.permission === level);
}

/** The permission change history (`permission_audit_log`; RLS decides who reads it). */
export function usePermissionHistory() {
  return useQuery({
    queryKey: roleDefinitionKeys.history,
    queryFn: async (): Promise<AuditLogEntry[]> => {
      const { data, error } = await supabase.from('permission_audit_log').select('*').order('timestamp_utc', { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as AuditLogEntry[];
    },
  });
}
