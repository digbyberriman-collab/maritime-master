import { useAuth } from '@/modules/auth/contexts/AuthContext';

/**
 * The disciplines the signed-in user practises in, read from
 * `hw_practitioners` by the auth provider. This is what makes a ship's medic
 * a medic: clinical access follows the practitioner roster, not the rank, so
 * it cannot be resolved from RBAC alone.
 *
 * The lookup lives in `AuthContext` rather than here so that
 * `canAccessModule('health')` and the access hooks read the same answer.
 */
export function usePractitionerDisciplines(): { disciplines: string[]; loading: boolean } {
  const { practitionerDisciplines, practitionerDisciplinesLoaded, user } = useAuth();
  return {
    disciplines: practitionerDisciplines,
    loading: Boolean(user) && !practitionerDisciplinesLoaded,
  };
}
