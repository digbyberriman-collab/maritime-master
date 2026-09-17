import { useMemo } from 'react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { resolvePayrollAccess, type PayrollAccess } from '@/modules/auth/lib/payrollAccess';

export interface UsePayrollAccessResult extends PayrollAccess {
  loading: boolean;
}

/** Finance / payroll access, mirroring the `payroll_can_*` SQL helpers. */
export function usePayrollAccess(): UsePayrollAccessResult {
  const { profile, user } = useAuth();
  const permissions = usePermissionsStore((s) => s.permissions);
  const userRoles = usePermissionsStore((s) => s.userRoles);
  const rbacInitialized = usePermissionsStore((s) => s.isInitialized);
  const rbacLoading = usePermissionsStore((s) => s.isLoading);

  return useMemo(() => {
    const loading = Boolean(user) && (!rbacInitialized || rbacLoading);
    const access = resolvePayrollAccess({
      rbacRoles: userRoles.map((r) => r.role_name).filter(Boolean) as string[],
      financePermission: permissions.find((p) => p.module_key === 'finance') ?? null,
      legacyRole: profile?.role ?? null,
    });
    return { ...access, loading };
  }, [user, rbacInitialized, rbacLoading, userRoles, permissions, profile?.role]);
}
