import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { useToast } from '@/shared/hooks/use-toast';
import { useHrCrewDirectory } from '@/modules/hris/hooks/useHrCrewDirectory';
import {
  auditObjectiveSnapshot,
  filterObjectives,
  sortObjectives,
  type CrewObjectiveRow,
  type ObjectiveFilters,
  type ObjectiveSearchable,
  type ObjectiveStatus,
  type ObjectiveUpdateRow,
  type ObjectiveWritePayload,
} from '@/modules/hris/lib/objectives';

export const OBJECTIVES_KEY = ['hris', 'objectives'] as const;
export const PERFORMANCE_DUE_ITEMS_KEY = ['hris', 'performance-due-items'] as const;
export const DEVELOPMENT_COURSES_KEY = ['hris', 'development-courses'] as const;
export const DEVELOPMENT_APPLICATIONS_KEY = ['hris', 'development-applications'] as const;

export type PerformanceDueItem = Tables<'hr_performance_due_items'>;

type ProfileJoin = {
  user_id: string | null;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  avatar_url: string | null;
  rank: string | null;
} | null;
type OwnerJoin = { first_name: string; last_name: string; preferred_name: string | null } | null;
type CourseJoin = { name: string } | null;
type ApplicationJoin = { application_number: string; course_name: string } | null;

/** Objective with subject / owner / linked course names resolved. */
export interface Objective extends ObjectiveSearchable {
  crew_user_id: string | null;
  crew_avatar_url: string | null;
  crew_rank: string | null;
  course_name: string | null;
  application_label: string | null;
}

export interface ObjectiveUpdate extends ObjectiveUpdateRow {
  author_name: string | null;
}

export interface ObjectiveDetail {
  objective: Objective;
  updates: ObjectiveUpdate[];
}

export interface DevelopmentCourseOption {
  id: string;
  name: string;
  category: string;
  department: string;
  status: string;
}

export interface DevelopmentApplicationOption {
  id: string;
  application_number: string;
  course_name: string;
  status: string;
  crew_member_id: string;
}

const OBJECTIVE_SELECT =
  '*, subject:profiles!crew_objectives_profile_id_fkey(user_id, first_name, last_name, preferred_name, avatar_url, rank), owner:profiles!crew_objectives_owner_profile_id_fkey(first_name, last_name, preferred_name), course:development_courses!crew_objectives_linked_course_id_fkey(name), application:development_applications!crew_objectives_linked_application_id_fkey(application_number, course_name)';

type RawObjective = CrewObjectiveRow & { subject: ProfileJoin; owner: OwnerJoin; course: CourseJoin; application: ApplicationJoin };

const displayName = (p: { first_name: string; last_name: string; preferred_name: string | null } | null): string | null => {
  if (!p) return null;
  const first = p.preferred_name || p.first_name || '';
  return `${first} ${p.last_name ?? ''}`.trim() || null;
};

const shapeObjective = (raw: RawObjective): Objective => {
  const { subject, owner, course, application, ...rest } = raw;
  return {
    ...rest,
    crew_name: displayName(subject) ?? 'Unknown crew',
    crew_user_id: subject?.user_id ?? null,
    crew_avatar_url: subject?.avatar_url ?? null,
    crew_rank: subject?.rank ?? null,
    owner_name: displayName(owner),
    course_name: course?.name ?? null,
    application_label: application ? `${application.application_number} · ${application.course_name}` : null,
  };
};

const fetchObjectives = async (companyId: string, scope: { profileId?: string | null; mine?: string | null }): Promise<Objective[]> => {
  let query = supabase.from('crew_objectives').select(OBJECTIVE_SELECT).eq('company_id', companyId);
  if (scope.profileId) query = query.eq('profile_id', scope.profileId);
  if (scope.mine) query = query.or(`profile_id.eq.${scope.mine},owner_profile_id.eq.${scope.mine}`);
  const { data, error } = await query.order('target_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return sortObjectives(((data ?? []) as unknown as RawObjective[]).map(shapeObjective));
};

/**
 * Objectives, either company-wide (HR viewers) or scoped to one crew member
 * via `filters.crewId` (readable by the subject and the owner too, per RLS).
 * The fetch is cached per scope and the other filters apply client-side.
 */
export function useObjectives(filters: ObjectiveFilters) {
  const { profile } = useAuth();
  const access = useHrAccess();
  const directory = useHrCrewDirectory({ includeInactive: true });
  const companyId = profile?.company_id ?? null;
  const scopedProfile = filters.crewId !== 'all' ? filters.crewId : null;

  const query = useQuery({
    queryKey: [...OBJECTIVES_KEY, 'list', companyId, scopedProfile],
    enabled: Boolean(companyId) && !access.loading && (Boolean(scopedProfile) || access.canView),
    queryFn: () => fetchObjectives(companyId as string, { profileId: scopedProfile }),
  });

  const vesselOfProfile = useCallback(
    (profileId: string) => directory.all.find((e) => e.id === profileId)?.vessel_id ?? null,
    [directory.all],
  );

  const all = useMemo(() => query.data ?? [], [query.data]);
  const objectives = useMemo(() => filterObjectives(all, { ...filters, crewId: 'all' }, vesselOfProfile), [all, filters, vesselOfProfile]);
  return { ...query, all, objectives };
}

/** Objectives where I am the subject or the owner (mentor / HOD). */
export function useMyObjectives() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...OBJECTIVES_KEY, 'mine', companyId, profile?.id ?? null],
    enabled: Boolean(companyId && profile?.id),
    queryFn: () => fetchObjectives(companyId as string, { mine: profile?.id ?? null }),
  });
  const all = useMemo(() => query.data ?? [], [query.data]);
  const own = useMemo(() => all.filter((o) => o.profile_id === profile?.id), [all, profile?.id]);
  const mentoring = useMemo(() => all.filter((o) => o.profile_id !== profile?.id && o.owner_profile_id === profile?.id), [all, profile?.id]);
  return { ...query, all, own, mentoring };
}

/** One objective with its progress notes, newest first. */
export function useObjective(id: string | null) {
  return useQuery({
    queryKey: [...OBJECTIVES_KEY, 'detail', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<ObjectiveDetail> => {
      const [{ data: row, error }, { data: updates, error: uErr }] = await Promise.all([
        supabase.from('crew_objectives').select(OBJECTIVE_SELECT).eq('id', id as string).single(),
        supabase.from('crew_objective_updates').select('*').eq('objective_id', id as string).order('created_at', { ascending: false }),
      ]);
      if (error) throw error;
      if (uErr) throw uErr;
      const authorIds = Array.from(new Set((updates ?? []).map((u) => u.created_by).filter((v): v is string => Boolean(v))));
      const names = new Map<string, string>();
      if (authorIds.length) {
        const { data: authors, error: aErr } = await supabase.from('profiles').select('user_id, first_name, last_name, preferred_name').in('user_id', authorIds);
        if (aErr) throw aErr;
        for (const a of authors ?? []) {
          if (a.user_id) names.set(a.user_id, displayName(a) ?? '');
        }
      }
      return {
        objective: shapeObjective(row as unknown as RawObjective),
        updates: (updates ?? []).map((u) => ({ ...u, author_name: u.created_by ? names.get(u.created_by) ?? null : null })),
      };
    },
  });
}

/** Objective rows from the `hr_performance_due_items` view, soonest first (includes overdue). */
export function useObjectiveDueItems(withinDays = 14) {
  const { profile } = useAuth();
  const access = useHrAccess();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...PERFORMANCE_DUE_ITEMS_KEY, 'objective', companyId, withinDays],
    enabled: Boolean(companyId) && !access.loading && access.canView,
    queryFn: async (): Promise<PerformanceDueItem[]> => {
      const { data, error } = await supabase
        .from('hr_performance_due_items')
        .select('*')
        .eq('company_id', companyId as string)
        .eq('item_type', 'objective')
        .lte('days_remaining', withinDays)
        .order('due_date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  return { ...query, items: query.data ?? [] };
}

/** Active development courses for the "link to course" picker. */
export function useDevelopmentCourses() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...DEVELOPMENT_COURSES_KEY, companyId],
    enabled: Boolean(companyId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DevelopmentCourseOption[]> => {
      const { data, error } = await supabase
        .from('development_courses')
        .select('id, name, category, department, status')
        .eq('company_id', companyId as string)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
  return { ...query, courses: query.data ?? [] };
}

/** Development applications of one crew member (by profiles.user_id) for the link picker. */
export function useDevelopmentApplications(crewUserId: string | null) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...DEVELOPMENT_APPLICATIONS_KEY, companyId, crewUserId],
    enabled: Boolean(companyId && crewUserId),
    staleTime: 60_000,
    queryFn: async (): Promise<DevelopmentApplicationOption[]> => {
      const { data, error } = await supabase
        .from('development_applications')
        .select('id, application_number, course_name, status, crew_member_id')
        .eq('company_id', companyId as string)
        .eq('crew_member_id', crewUserId as string)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return { ...query, applications: query.data ?? [] };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface CreateObjectiveArgs {
  profileId: string;
  payload: ObjectiveWritePayload;
}

export interface UpdateObjectiveArgs {
  objective: CrewObjectiveRow;
  payload: Partial<ObjectiveWritePayload>;
}

export interface AddObjectiveUpdateArgs {
  objective: CrewObjectiveRow;
  note: string;
  progress_pct?: number | null;
}

export interface SetObjectiveStatusArgs {
  objective: CrewObjectiveRow;
  status: ObjectiveStatus;
}

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

export function useObjectiveMutations() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const companyId = profile?.company_id ?? null;

  const audit = useCallback(
    async (action: AuditAction, entityId: string, oldValues: Partial<CrewObjectiveRow> | null, newValues: Partial<CrewObjectiveRow> | null) => {
      const { error } = await supabase.from('audit_logs').insert({
        entity_type: 'crew_objective',
        entity_id: entityId,
        action,
        actor_user_id: user?.id ?? null,
        actor_email: user?.email ?? null,
        actor_role: profile?.role ?? null,
        old_values: oldValues ? auditObjectiveSnapshot(oldValues) : null,
        new_values: newValues ? auditObjectiveSnapshot(newValues) : null,
      });
      if (error) console.warn('crew_objective audit log failed', error);
    },
    [profile?.role, user?.email, user?.id],
  );

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: OBJECTIVES_KEY });
    void queryClient.invalidateQueries({ queryKey: PERFORMANCE_DUE_ITEMS_KEY });
  }, [queryClient]);

  const fail = useCallback(
    (title: string) => (error: unknown) => {
      toast({ title, description: error instanceof Error ? error.message : 'Unexpected error', variant: 'destructive' });
    },
    [toast],
  );

  const updateRow = useCallback(
    async (id: string, patch: TablesUpdate<'crew_objectives'>): Promise<CrewObjectiveRow> => {
      const { data, error } = await supabase
        .from('crew_objectives')
        .update({ ...patch, updated_by: user?.id ?? null })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    [user?.id],
  );

  const create = useMutation({
    mutationFn: async ({ profileId, payload }: CreateObjectiveArgs): Promise<CrewObjectiveRow> => {
      if (!companyId) throw new Error('No company on the current profile');
      const { data, error } = await supabase
        .from('crew_objectives')
        .insert({ ...payload, company_id: companyId, profile_id: profileId, created_by: user?.id ?? null, updated_by: user?.id ?? null })
        .select('*')
        .single();
      if (error) throw error;
      await audit('CREATE', data.id, null, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Objective created' });
    },
    onError: fail('Could not create objective'),
  });

  const update = useMutation({
    mutationFn: async ({ objective, payload }: UpdateObjectiveArgs): Promise<CrewObjectiveRow> => {
      const data = await updateRow(objective.id, payload);
      await audit('UPDATE', objective.id, objective, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Objective updated' });
    },
    onError: fail('Could not update objective'),
  });

  const addUpdate = useMutation({
    mutationFn: async ({ objective, note, progress_pct }: AddObjectiveUpdateArgs): Promise<ObjectiveUpdateRow> => {
      if (!companyId) throw new Error('No company on the current profile');
      const { data, error } = await supabase
        .from('crew_objective_updates')
        .insert({
          objective_id: objective.id,
          company_id: companyId,
          note: note.trim(),
          progress_pct: progress_pct ?? null,
          created_by: user?.id ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      // The DB trigger rolls progress up to the objective; mirror it in the audit trail.
      if (progress_pct !== null && progress_pct !== undefined && progress_pct !== objective.progress_pct) {
        await audit('UPDATE', objective.id, objective, {
          ...objective,
          progress_pct,
          status: progress_pct >= 100 ? 'achieved' : progress_pct > 0 && objective.status === 'not_started' ? 'in_progress' : objective.status,
        });
      }
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Update added' });
    },
    onError: fail('Could not add update'),
  });

  const setStatus = useMutation({
    mutationFn: async ({ objective, status }: SetObjectiveStatusArgs): Promise<CrewObjectiveRow> => {
      const patch: TablesUpdate<'crew_objectives'> = { status };
      if (status === 'achieved') {
        patch.progress_pct = 100;
        patch.completed_at = objective.completed_at ?? new Date().toISOString();
      } else if (status === 'in_progress' || status === 'not_started') {
        patch.completed_at = null;
        if (status === 'in_progress' && objective.progress_pct >= 100) patch.progress_pct = 90;
        if (status === 'not_started') patch.progress_pct = 0;
      }
      const data = await updateRow(objective.id, patch);
      await audit('UPDATE', objective.id, objective, data);
      return data;
    },
    onSuccess: (data) => {
      invalidate();
      const label: Record<string, string> = {
        achieved: 'Objective marked achieved',
        missed: 'Objective marked missed',
        cancelled: 'Objective cancelled',
        in_progress: 'Objective reopened',
        not_started: 'Objective reset',
      };
      toast({ title: label[data.status] ?? 'Objective updated' });
    },
    onError: fail('Could not change status'),
  });

  const remove = useMutation({
    mutationFn: async (objective: CrewObjectiveRow): Promise<void> => {
      const { error } = await supabase.from('crew_objectives').delete().eq('id', objective.id);
      if (error) throw error;
      await audit('DELETE', objective.id, objective, null);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Objective deleted' });
    },
    onError: fail('Could not delete objective'),
  });

  return { create, update, addUpdate, setStatus, remove };
}
