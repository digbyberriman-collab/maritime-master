import { useMemo } from 'react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { resolveHrAccess, type HrAccess } from '@/modules/auth/lib/hrAccess';

export interface UseHrAccessResult extends HrAccess {
  /** True until RBAC has loaded; callers should not grant while loading. */
  loading: boolean;
}

/**
 * Resolves the current user's HR access level from RBAC (preferred) with a
 * legacy `profiles.role` fallback. Mirrors the `hr_can_*` SQL helpers.
 */
export function useHrAccess(): UseHrAccessResult {
  const { profile, user } = useAuth();
  const permissions = usePermissionsStore((s) => s.permissions);
  const userRoles = usePermissionsStore((s) => s.userRoles);
  const rbacInitialized = usePermissionsStore((s) => s.isInitialized);
  const rbacLoading = usePermissionsStore((s) => s.isLoading);

  return useMemo(() => {
    const loading = Boolean(user) && (!rbacInitialized || rbacLoading);
    const access = resolveHrAccess({
      rbacInitialized,
      rbacRoles: userRoles.map((r) => r.role_name).filter(Boolean) as string[],
      hrPermission: permissions.find((p) => p.module_key === 'hr') ?? null,
      legacyRole: profile?.role ?? null,
    });
    return { ...access, loading };
  }, [user, rbacInitialized, rbacLoading, userRoles, permissions, profile?.role]);
}
