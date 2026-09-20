import { useMemo } from 'react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { resolveLegalAccess, type LegalAccess } from '@/modules/auth/lib/legalAccess';

export interface UseLegalAccessResult extends LegalAccess {
  /** True until RBAC has loaded; callers should not show team controls while loading. */
  loading: boolean;
}

/**
 * Legal team access, mirroring the `legal_can_*` SQL helpers. The server
 * policies are the real boundary; this only decides which controls render.
 */
export function useLegalAccess(): UseLegalAccessResult {
  const { profile, user } = useAuth();
  const permissions = usePermissionsStore((s) => s.permissions);
  const userRoles = usePermissionsStore((s) => s.userRoles);
  const rbacInitialized = usePermissionsStore((s) => s.isInitialized);
  const rbacLoading = usePermissionsStore((s) => s.isLoading);

  return useMemo(() => {
    const loading = Boolean(user) && (!rbacInitialized || rbacLoading);
    const access = resolveLegalAccess({
      signedIn: Boolean(user),
      rbacInitialized,
      rbacRoles: userRoles.map((r) => r.role_name).filter(Boolean) as string[],
      legalPermission: permissions.find((p) => p.module_key === 'legal') ?? null,
      legacyRole: profile?.role ?? null,
    });
    return { ...access, loading };
  }, [user, rbacInitialized, rbacLoading, userRoles, permissions, profile?.role]);
}
