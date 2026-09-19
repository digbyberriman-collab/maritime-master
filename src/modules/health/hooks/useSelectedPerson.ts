import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useMedicalAccess } from '@/modules/auth/hooks/useMedicalAccess';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { useHealthPeople, type HealthPersonEntry } from '@/modules/health/hooks/useHealthPeople';

/**
 * Shared "which person am I looking at" state for health pages, kept in the
 * `?person=<hw_people.id>` search param so it survives navigation between
 * Patients → Allergies → Medications, and so pages can be deep-linked.
 *
 * Self-service users are pinned to their own record. `scope` decides which
 * resolver does the pinning: clinical pages use medical access, the rest use
 * wellness access.
 */
export function useSelectedPerson(scope: 'medical' | 'wellness' = 'medical') {
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();
  const medical = useMedicalAccess();
  const wellness = useWellnessAccess();
  const directory = useHealthPeople({ includeInactive: true });

  const access = scope === 'medical' ? medical : wellness;
  const loading = access.loading;
  const selfOnly = !loading && !access.canView;

  const myPerson = useMemo(
    () => directory.all.find((p) => p.profile_id === profile?.id) ?? null,
    [directory.all, profile?.id],
  );

  const requested = searchParams.get('person');
  const personId = selfOnly ? myPerson?.id ?? null : requested;

  const setPersonId = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set('person', id);
          else next.delete('person');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Pin self-service users to their own record.
  useEffect(() => {
    if (selfOnly && myPerson?.id && requested !== myPerson.id) setPersonId(myPerson.id);
  }, [selfOnly, myPerson?.id, requested, setPersonId]);

  const person: HealthPersonEntry | null = useMemo(
    () => directory.all.find((p) => p.id === personId) ?? null,
    [directory.all, personId],
  );

  return {
    personId,
    person,
    setPersonId,
    selfOnly,
    myPerson,
    isOwnRecord: Boolean(myPerson?.id && personId === myPerson.id),
    medical,
    wellness,
    access,
    directoryLoading: directory.isLoading,
  };
}
