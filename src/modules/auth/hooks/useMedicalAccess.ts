import { useMemo } from 'react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { usePractitionerDisciplines } from '@/modules/auth/hooks/usePractitionerDisciplines';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import {
  resolveFitnessAccess,
  resolveMedicalAccess,
  type MedicalAccess,
} from '@/modules/auth/lib/medicalAccess';

export interface UseMedicalAccessResult extends MedicalAccess {
  /** True until RBAC and the practitioner roster have loaded. */
  loading: boolean;
  /** Fitness to work: status, restrictions and expiry. Not clinical. */
  canViewFitness: boolean;
}

/**
 * Resolves the current user's clinical access. Mirrors the `medical_can_*`
 * SQL helpers, so what the UI offers matches what RLS will return.
 */
export function useMedicalAccess(): UseMedicalAccessResult {
  const { profile, user } = useAuth();
  const permissions = usePermissionsStore((s) => s.permissions);
  const userRoles = usePermissionsStore((s) => s.userRoles);
  const rbacInitialized = usePermissionsStore((s) => s.isInitialized);
  const rbacLoading = usePermissionsStore((s) => s.isLoading);
  const practitioners = usePractitionerDisciplines();
  const hr = useHrAccess();

  return useMemo(() => {
    const loading =
      Boolean(user) && (!rbacInitialized || rbacLoading || practitioners.loading || hr.loading);
    const rbacRoles = userRoles.map((r) => r.role_name).filter(Boolean) as string[];
    const access = resolveMedicalAccess({
      rbacInitialized,
      rbacRoles,
      medicalPermission: permissions.find((p) => p.module_key === 'medical') ?? null,
      legacyRole: profile?.role ?? null,
      practitionerDisciplines: practitioners.disciplines,
    });
    const canViewFitness = resolveFitnessAccess({
      medical: access,
      hrCanView: hr.canView,
      rbacRoles,
    });
    return { ...access, loading, canViewFitness };
  }, [
    user,
    rbacInitialized,
    rbacLoading,
    userRoles,
    permissions,
    profile?.role,
    practitioners.disciplines,
    practitioners.loading,
    hr.canView,
    hr.loading,
  ]);
}
