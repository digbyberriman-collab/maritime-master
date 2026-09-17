import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json, Tables, TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { toast } from '@/shared/hooks/use-toast';
import {
  buildRecentMovements,
  buildTimeline,
  computeServiceSummary,
  diffAssignment,
  rankChangesFromAudit,
  type AssignmentPatch,
  type AssignmentRecord,
  type ContractRecord,
  type EmploymentEvent,
  type MovementRow,
  type RankChangeRecord,
  type ServiceSummary,
} from '@/modules/hris/lib/employmentHistory';

export const EMPLOYMENT_HISTORY_KEY = ['hris', 'employment-history'] as const;
export const RECENT_MOVEMENTS_KEY = ['hris', 'recent-movements'] as const;

type ProfileRow = Pick<
  Tables<'profiles'>,
  'id' | 'user_id' | 'first_name' | 'last_name' | 'preferred_name' | 'rank' | 'position' | 'status' | 'account_status' | 'company_id' | 'updated_at'
>;

type AssignmentRow = Tables<'crew_assignments'> & { vessels: { name: string } | null };
type ContractRow = Tables<'crew_contracts'> & { vessels: { name: string } | null };
type AuditRow = Pick<Tables<'audit_logs'>, 'id' | 'timestamp' | 'actor_email' | 'old_values' | 'new_values' | 'entity_type' | 'entity_id'>;

export interface EmploymentHistoryData {
  profile: ProfileRow | null;
  /** False for imported crew without an auth account (no crew_assignments possible). */
  hasAccount: boolean;
  assignments: AssignmentRecord[];
  contracts: ContractRecord[];
  rankChanges: RankChangeRecord[];
}

const toAssignmentRecord = (row: AssignmentRow): AssignmentRecord => ({
  id: row.id,
  vessel_id: row.vessel_id,
  vessel_name: row.vessels?.name ?? null,
  position: row.position,
  rank: row.rank,
  department: row.department,
  join_date: row.join_date ?? row.start_date ?? '',
  leave_date: row.leave_date ?? row.end_date ?? null,
  is_current: row.is_current,
  end_reason: row.end_reason,
  notes: row.notes,
  created_at: row.created_at,
});

const toContractRecord = (row: ContractRow): ContractRecord => ({
  id: row.id,
  contract_type: row.contract_type,
  contract_number: row.contract_number,
  position: row.position,
  rank: row.rank,
  vessel_id: row.vessel_id,
  vessel_name: row.vessels?.name ?? null,
  start_date: row.start_date,
  end_date: row.end_date,
  probation_end_date: row.probation_end_date,
  status: row.status,
  terminated_at: row.terminated_at,
  termination_reason: row.termination_reason,
});

/**
 * Everything the Employment History page needs for one crew member, keyed on
 * profiles.id. Assignments live on profiles.user_id, so imported crew without
 * an account come back with `hasAccount: false` and an empty assignment list.
 */
export function useEmploymentHistory(profileId: string | null) {
  const { profile, user } = useAuth();
  const access = useHrAccess();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...EMPLOYMENT_HISTORY_KEY, profileId],
    enabled: Boolean(profileId) && Boolean(companyId) && !access.loading,
    staleTime: 30_000,
    queryFn: async (): Promise<EmploymentHistoryData> => {
      const { data: p, error: pErr } = await supabase
        .from('profiles')
        .select('id, user_id, first_name, last_name, preferred_name, rank, position, status, account_status, company_id, updated_at')
        .eq('id', profileId as string)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!p) return { profile: null, hasAccount: false, assignments: [], contracts: [], rankChanges: [] };

      const contractsPromise = supabase
        .from('crew_contracts')
        .select('*, vessels(name)')
        .eq('profile_id', p.id)
        .order('start_date', { ascending: false });

      const assignmentsPromise = p.user_id
        ? supabase
            .from('crew_assignments')
            .select('*, vessels(name)')
            .eq('user_id', p.user_id)
            .order('join_date', { ascending: false })
        : Promise.resolve({ data: [] as unknown[], error: null });

      // Rank / position changes are logged against the profile: the legacy
      // crew module writes entity_type 'crew_profile' keyed on user_id, HRIS
      // writes 'crew_profile' keyed on profiles.id (same set as
      // PROFILE_AUDIT_ENTITY_TYPES in useHrProfile.ts). audit_logs RLS may
      // return nothing for some roles; the timeline then has no rank events.
      const auditIds = [p.id, p.user_id].filter((x): x is string => Boolean(x));
      const auditPromise = supabase
        .from('audit_logs')
        .select('id, timestamp, actor_email, old_values, new_values, entity_type, entity_id')
        .in('entity_type', ['crew_profile', 'profile', 'crew_member'])
        .in('entity_id', auditIds)
        .order('timestamp', { ascending: false })
        .limit(200);

      const [contractsRes, assignmentsRes, auditRes] = await Promise.all([contractsPromise, assignmentsPromise, auditPromise]);
      if (contractsRes.error) throw contractsRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;
      // Audit failures should never block the page.
      const auditRows: AuditRow[] = auditRes.error ? [] : ((auditRes.data ?? []) as AuditRow[]);

      return {
        profile: p,
        hasAccount: Boolean(p.user_id),
        assignments: ((assignmentsRes.data ?? []) as AssignmentRow[]).map(toAssignmentRecord),
        contracts: ((contractsRes.data ?? []) as ContractRow[]).map(toContractRecord),
        rankChanges: rankChangesFromAudit(auditRows),
      };
    },
  });

  const today = useMemo(() => new Date(), []);

  const timeline: EmploymentEvent[] = useMemo(() => {
    if (!query.data) return [];
    const p = query.data.profile;
    const deactivatedAt =
      p && (p.account_status === 'deactivated' || p.account_status === 'disabled' || (p.status ?? '').toLowerCase() === 'inactive')
        ? p.updated_at
        : null;
    return buildTimeline({
      assignments: query.data.assignments,
      contracts: query.data.contracts,
      rankChanges: query.data.rankChanges,
      deactivatedAt,
    });
  }, [query.data]);

  const summary: ServiceSummary | null = useMemo(
    () => (query.data ? computeServiceSummary(query.data.assignments, query.data.contracts, today) : null),
    [query.data, today],
  );

  const updateAssignment = useMutation({
    mutationFn: async ({ assignment, patch }: { assignment: AssignmentRecord; patch: AssignmentPatch }) => {
      const { changed, oldValues, newValues } = diffAssignment(assignment, patch);
      if (Object.keys(changed).length === 0) return { unchanged: true };

      const update: TablesUpdate<'crew_assignments'> = {
        ...changed,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      };
      // Keep both date conventions in step (the DB trigger does too, but only
      // fills nulls; an explicit edit must overwrite the twin column).
      if (changed.join_date !== undefined) update.start_date = changed.join_date;
      if (changed.leave_date !== undefined) {
        update.end_date = changed.leave_date;
        if (changed.leave_date === null) update.is_current = true;
      }

      const { data, error } = await supabase
        .from('crew_assignments')
        .update(update)
        .eq('id', assignment.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('No changes were saved. You may not have permission to edit crew assignments.');
      }

      const { error: auditError } = await supabase.from('audit_logs').insert({
        entity_type: 'crew_assignment',
        entity_id: assignment.id,
        action: 'UPDATE',
        actor_user_id: user?.id ?? null,
        actor_email: profile?.email ?? null,
        actor_role: profile?.role ?? null,
        changed_fields: Object.fromEntries(Object.keys(changed).map((k) => [k, true])) as Json,
        old_values: oldValues as Json,
        new_values: newValues as Json,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });
      if (auditError) console.error('Failed to log assignment audit:', auditError);
      return { unchanged: false };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: EMPLOYMENT_HISTORY_KEY });
      queryClient.invalidateQueries({ queryKey: RECENT_MOVEMENTS_KEY });
      queryClient.invalidateQueries({ queryKey: ['hris', 'crew-directory'] });
      queryClient.invalidateQueries({ queryKey: ['crew'] });
      queryClient.invalidateQueries({ queryKey: ['crew-changes'] });
      if (!result.unchanged) toast({ title: 'Assignment updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not update assignment', description: error.message, variant: 'destructive' });
    },
  });

  return {
    data: query.data ?? null,
    profile: query.data?.profile ?? null,
    hasAccount: query.data?.hasAccount ?? false,
    assignments: query.data?.assignments ?? [],
    contracts: query.data?.contracts ?? [],
    timeline,
    summary,
    today,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    updateAssignment,
  };
}

type MovementRowRaw = Tables<'crew_assignments'> & {
  vessels: { name: string } | null;
  profiles: { id: string; first_name: string; last_name: string; company_id: string | null } | null;
};

/** Company-wide joins, sign-offs and transfers in the last `windowDays`. */
export function useRecentMovements(windowDays = 30) {
  const { profile } = useAuth();
  const access = useHrAccess();
  const companyId = profile?.company_id ?? null;
  const today = useMemo(() => new Date(), []);

  const query = useQuery({
    queryKey: [...RECENT_MOVEMENTS_KEY, companyId, windowDays],
    enabled: Boolean(companyId) && !access.loading && access.canView,
    staleTime: 60_000,
    queryFn: async (): Promise<MovementRow[]> => {
      const since = new Date(today.getFullYear(), today.getMonth(), today.getDate() - windowDays);
      const sinceIso = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;
      const { data, error } = await supabase
        .from('crew_assignments')
        .select('*, vessels(name), profiles!crew_assignments_user_id_fkey!inner(id, first_name, last_name, company_id)')
        .eq('profiles.company_id', companyId as string)
        .or(`join_date.gte.${sinceIso},leave_date.gte.${sinceIso}`)
        .order('join_date', { ascending: false })
        .limit(500);
      if (error) throw error;
      const rows = ((data ?? []) as unknown as MovementRowRaw[]).map((row) => ({
        ...toAssignmentRecord(row),
        crewName: `${row.profiles?.first_name ?? ''} ${row.profiles?.last_name ?? ''}`.trim() || 'Unknown crew',
        profileId: row.profiles?.id ?? null,
      }));
      return buildRecentMovements(rows, today, windowDays);
    },
  });

  return { movements: query.data ?? [], isLoading: query.isLoading, error: query.error };
}
