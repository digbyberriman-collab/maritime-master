import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { useHrCrewDirectory, type HrCrewDirectoryEntry } from '@/modules/hris/hooks/useHrCrewDirectory';

/**
 * Shared "which crew member am I looking at" state for HRIS pages, kept in
 * the `?crew=<profiles.id>` search param so it survives navigation between
 * Personal Details → Contracts → Documents, and so pages can be deep-linked.
 * Self-service users are pinned to their own profile.
 */
export function useSelectedCrew() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();
  const access = useHrAccess();
  const directory = useHrCrewDirectory({ includeInactive: true });

  const selfOnly = !access.loading && !access.canView;
  const requested = searchParams.get('crew');
  const profileId = selfOnly ? profile?.id ?? null : requested;

  const setProfileId = useCallback((id: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set('crew', id);
      else next.delete('crew');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Pin self-service users to themselves.
  useEffect(() => {
    if (selfOnly && profile?.id && requested !== profile.id) setProfileId(profile.id);
  }, [selfOnly, profile?.id, requested, setProfileId]);

  const entry: HrCrewDirectoryEntry | null = useMemo(
    () => directory.all.find((e) => e.id === profileId) ?? null,
    [directory.all, profileId],
  );

  return {
    profileId,
    entry,
    setProfileId,
    selfOnly,
    isOwnRecord: Boolean(profile?.id && profileId === profile.id),
    access,
    directoryLoading: directory.isLoading,
  };
}
