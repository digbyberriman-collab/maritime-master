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
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isMissingRelation } from '@/integrations/supabase/pending';
import { useCapability } from '@/lib/permissions/useCan';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { authDb } from '@/modules/auth/services/accessDb';
import type { AuditLogEntry, Module, PermissionLevel, Role, RolePermission } from '../types';

export interface RoleDefinitions {
  roles: Role[];
  modules: Module[];
  permissions: RolePermission[];
}

/**
 * The capability `permission_audit_log_select` checks (migration file 8):
 * full admin, an `is_dpa` membership or the legacy DPA role of the row's
 * company (D-124).
 */
export const PERMISSION_AUDIT_VIEW = 'admin.access.permission_audit_log.view';

export const roleDefinitionKeys = {
  all: ['rbac', 'role-definitions'] as const,
  history: ['rbac', 'permission-history'] as const,
  historyFor: (userId: string, companyId: string) => ['rbac', 'permission-history', userId, companyId] as const,
  auditGate: (userId: string, companyId: string) => ['capability', PERMISSION_AUDIT_VIEW, userId, companyId] as const,
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

// ─── Permission change history ────────────────────────────────────────────

/** What the database answered: the capability, or "the RPC is not live yet". */
export type PermissionAuditAnswer = 'granted' | 'denied' | 'rpc-missing';

/**
 * Asks `has_capability(PERMISSION_AUDIT_VIEW, company)` through the pending
 * shim. A missing function (`isMissingRelation`: PGRST202, 42883, …) answers
 * `rpc-missing`; any other error throws.
 */
export async function fetchPermissionAuditAnswer(companyId: string): Promise<PermissionAuditAnswer> {
  const { data, error } = await authDb.rpc('has_capability', { p_key: PERMISSION_AUDIT_VIEW, p_company_id: companyId });
  if (error) {
    if (isMissingRelation(error)) return 'rpc-missing';
    throw error;
  }
  return data === true ? 'granted' : 'denied';
}

export interface PermissionAuditGate {
  status: 'loading' | 'allowed' | 'denied' | 'error';
  /** The failed check, when `status` is `error`. */
  error: unknown;
  /** Asks the database again (the error state's Retry). */
  retry: () => void;
}

/**
 * May the signed-in person read the permission change history? (D-240;
 * D-04, D-124, non-negotiable 9.)
 *
 * The log's RLS returns an empty list, not an error, to anyone it filters
 * out, so an empty read cannot tell "nothing changed" from "you may not
 * see it". The page asks the database the policy's own question first and
 * reads the log only on a yes:
 *
 * - `has_capability` true: `allowed`; false: `denied`.
 * - The function is not live yet (D-01): the `useCan` adaptor decides
 *   (D-04: full access, i.e. RBAC superadmin / DPA or legacy DPA / shore
 *   management, else the RBAC `settings` module); `loading` while it
 *   loads. RLS stays the real control.
 * - No signed-in user or no company, once auth has resolved: `denied`.
 * - Any other error: `error`, with `retry` (never a silent denial, never an
 *   empty history).
 */
export function usePermissionAuditGate(): PermissionAuditGate {
  const { user, profile, loading: authLoading, profileResolved } = useAuth();
  const userId = user?.id ?? null;
  const companyId = profile?.company_id ?? null;
  const enabled = Boolean(userId && companyId);
  const adaptor = useCapability(PERMISSION_AUDIT_VIEW);

  const query = useQuery({
    queryKey: roleDefinitionKeys.auditGate(userId ?? '', companyId ?? ''),
    queryFn: () => fetchPermissionAuditAnswer(companyId ?? ''),
    enabled,
  });
  const { refetch } = query;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  if (!enabled) {
    // Still loading only while the session or the profile is unknown.
    const loading = Boolean(authLoading) || (Boolean(userId) && profileResolved === false);
    return { status: loading ? 'loading' : 'denied', error: null, retry };
  }
  if (query.isPending) return { status: 'loading', error: null, retry };
  if (query.isError) return { status: 'error', error: query.error, retry };

  switch (query.data) {
    case 'granted':
      return { status: 'allowed', error: null, retry };
    case 'rpc-missing':
      // D-01: files 4 and 8 unapplied; the interim adaptor decides (D-04).
      if (adaptor.status === 'loading') return { status: 'loading', error: null, retry };
      return { status: adaptor.allowed ? 'allowed' : 'denied', error: null, retry };
    default:
      return { status: 'denied', error: null, retry };
  }
}

/**
 * The permission change history (`permission_audit_log`, newest 100).
 * Pass `enabled` from `usePermissionAuditGate`: the log is read only for a
 * caller the gate allowed, so an RLS-filtered empty list is never shown as
 * "nothing changed".
 */
export function usePermissionHistory({ enabled }: { enabled: boolean }) {
  const { user, profile } = useAuth();
  return useQuery({
    queryKey: roleDefinitionKeys.historyFor(user?.id ?? '', profile?.company_id ?? ''),
    queryFn: async (): Promise<AuditLogEntry[]> => {
      const { data, error } = await supabase.from('permission_audit_log').select('*').order('timestamp_utc', { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as AuditLogEntry[];
    },
    enabled,
  });
}
