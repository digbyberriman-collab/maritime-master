import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';

/**
 * Lightweight crew directory for HRIS pickers and lists. One row per
 * profile in the company (including imported crew without a login), with
 * the current vessel assignment joined in.
 */
export interface HrCrewDirectoryEntry {
  /** profiles.id — the HRIS employee key. */
  id: string;
  /** profiles.user_id — null for imported crew who have not been invited. */
  user_id: string | null;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  email: string;
  rank: string | null;
  position: string | null;
  department: string | null;
  status: string | null;
  account_status: string | null;
  avatar_url: string | null;
  nationality: string | null;
  is_imported: boolean;
  vessel_id: string | null;
  vessel_name: string | null;
  assignment_position: string | null;
  fullName: string;
  displayName: string;
}

export const HR_CREW_DIRECTORY_KEY = ['hris', 'crew-directory'] as const;

export function useHrCrewDirectory(options: { includeInactive?: boolean } = {}) {
  const { profile } = useAuth();
  const access = useHrAccess();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...HR_CREW_DIRECTORY_KEY, companyId, access.level],
    enabled: Boolean(companyId) && !access.loading,
    staleTime: 60_000,
    queryFn: async (): Promise<HrCrewDirectoryEntry[]> => {
      // Self-service users only ever see themselves.
      let profilesQuery = supabase
        .from('profiles')
        .select('id, user_id, first_name, last_name, preferred_name, email, rank, position, department, status, account_status, avatar_url, nationality, is_imported')
        .eq('company_id', companyId as string)
        .order('last_name')
        .order('first_name');
      if (!access.canView) {
        profilesQuery = profilesQuery.eq('id', profile?.id ?? '');
      }
      const { data: profiles, error } = await profilesQuery;
      if (error) throw error;

      const userIds = (profiles ?? []).map((p) => p.user_id).filter((u): u is string => Boolean(u));
      let assignments: { user_id: string; vessel_id: string; position: string; vessels: { name: string } | null }[] = [];
      if (userIds.length) {
        const { data: rows, error: aErr } = await supabase
          .from('crew_assignments')
          .select('user_id, vessel_id, position, vessels(name)')
          .in('user_id', userIds)
          .eq('is_current', true);
        if (aErr) throw aErr;
        assignments = (rows ?? []) as unknown as typeof assignments;
      }
      const byUser = new Map(assignments.map((a) => [a.user_id, a]));

      return (profiles ?? []).map((p) => {
        const a = p.user_id ? byUser.get(p.user_id) : undefined;
        const fullName = `${p.first_name} ${p.last_name}`.trim();
        return {
          ...p,
          is_imported: Boolean(p.is_imported),
          vessel_id: a?.vessel_id ?? null,
          vessel_name: a?.vessels?.name ?? null,
          assignment_position: a?.position ?? null,
          fullName,
          displayName: p.preferred_name ? `${p.preferred_name} ${p.last_name}` : fullName,
        };
      });
    },
  });

  const entries = useMemo(() => {
    const all = query.data ?? [];
    if (options.includeInactive) return all;
    return all.filter((e) => (e.status ?? 'active') !== 'inactive' && e.account_status !== 'deactivated');
  }, [query.data, options.includeInactive]);

  return { ...query, entries, all: query.data ?? [] };
}
