import { useMemo } from 'react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { usePractitionerDisciplines } from '@/modules/auth/hooks/usePractitionerDisciplines';
import { useMedicalAccess } from '@/modules/auth/hooks/useMedicalAccess';
import { resolveWellnessAccess, type WellnessAccess } from '@/modules/auth/lib/wellnessAccess';

export interface UseWellnessAccessResult extends WellnessAccess {
  loading: boolean;
}

/**
 * Resolves the current user's spa / nutrition / physio / training access.
 * Mirrors the `wellness_can_*` SQL helpers.
 */
export function useWellnessAccess(): UseWellnessAccessResult {
  const { profile, user } = useAuth();
  const permissions = usePermissionsStore((s) => s.permissions);
  const userRoles = usePermissionsStore((s) => s.userRoles);
  const rbacInitialized = usePermissionsStore((s) => s.isInitialized);
  const rbacLoading = usePermissionsStore((s) => s.isLoading);
  const practitioners = usePractitionerDisciplines();
  const medical = useMedicalAccess();

  return useMemo(() => {
    const loading =
      Boolean(user) && (!rbacInitialized || rbacLoading || practitioners.loading || medical.loading);
    const access = resolveWellnessAccess({
      rbacInitialized,
      rbacRoles: userRoles.map((r) => r.role_name).filter(Boolean) as string[],
      wellnessPermission: permissions.find((p) => p.module_key === 'wellness') ?? null,
      legacyRole: profile?.role ?? null,
      practitionerDisciplines: practitioners.disciplines,
      medical,
    });
    return { ...access, loading };
  }, [
    user,
    rbacInitialized,
    rbacLoading,
    userRoles,
    permissions,
    profile?.role,
    practitioners.disciplines,
    practitioners.loading,
    medical,
  ]);
}
