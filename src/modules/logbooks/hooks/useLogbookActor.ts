import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { fetchUserRoles } from '../lib/logbookApi';
import { resolveCapacity, canWrite as canWriteRule, isReadOnlyRole, type CrewCapacity } from '../lib/roles';
import type { LogbookBook } from '../lib/catalog';
import type { TemplateSection } from '../lib/templates';

export interface LogbookActor {
  userId: string | null;
  companyId: string | null;
  vesselId: string | null;
  name: string;
  roles: string[];
  capacity: CrewCapacity | null;
  isMaster: boolean;
  readOnly: boolean;
  loading: boolean;
  canWrite: (book: LogbookBook | undefined, section: TemplateSection | undefined) => boolean;
}

/** The signed-in user's logbook capacity, resolved from RBAC roles and the legacy profile role. */
export function useLogbookActor(): LogbookActor {
  const { user, profile } = useAuth();
  const { selectedVessel } = useVessel();
  const userId = user?.id ?? null;

  const rolesQuery = useQuery({
    queryKey: ['logbook-user-roles', userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchUserRoles(userId!),
  });

  return useMemo(() => {
    const rbac = rolesQuery.data ?? [];
    const roles = [...rbac, profile?.role ?? null].filter((r): r is string => Boolean(r));
    const capacity = resolveCapacity(rbac, profile?.role);
    const name = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || profile?.email || 'Unknown';
    return {
      userId,
      companyId: profile?.company_id ?? null,
      vesselId: selectedVessel?.id ?? null,
      name,
      roles,
      capacity,
      isMaster: capacity === 'master',
      readOnly: isReadOnlyRole(roles),
      loading: rolesQuery.isLoading,
      canWrite: (book, section) => canWriteRule(capacity, book, section),
    };
  }, [rolesQuery.data, rolesQuery.isLoading, profile, userId, selectedVessel?.id]);
}
