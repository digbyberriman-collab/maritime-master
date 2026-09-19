import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useToast } from '@/shared/hooks/use-toast';
import { useHealthPeople } from '@/modules/health/hooks/useHealthPeople';

export type PtProgram = Tables<'pt_programs'>;
export type PtProgramSession = Tables<'pt_program_sessions'>;
export type PtSessionItem = Tables<'pt_session_items'>;
export type PtSetLog = Tables<'pt_set_logs'>;
export type PtAppointment = Tables<'pt_appointments'>;
export type HwMeasurement = Tables<'hw_measurements'>;
export type TrainingGoal = Tables<'nut_goals'>;

export const PT_PROGRAMS_KEY = ['health', 'pt-programs'] as const;
export const PT_SESSIONS_KEY = ['health', 'pt-sessions'] as const;
export const PT_SET_LOGS_KEY = ['health', 'pt-set-logs'] as const;
export const PT_APPOINTMENTS_KEY = ['health', 'pt-appointments'] as const;
export const HW_MEASUREMENTS_KEY = ['health', 'measurements'] as const;
export const TRAINING_GOALS_KEY = ['health', 'training-goals'] as const;

export const PROGRAM_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export const SESSION_STATUSES = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'missed', label: 'Missed' },
] as const;

export const APPOINTMENT_TYPES = [
  { value: 'one_to_one', label: 'One to one' },
  { value: 'group', label: 'Small group' },
  { value: 'class', label: 'Class' },
  { value: 'assessment', label: 'Assessment' },
  { value: 'rehab', label: 'Rehabilitation' },
  { value: 'consultation', label: 'Consultation' },
] as const;

export const APPOINTMENT_STATUSES = [
  { value: 'requested', label: 'Requested' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No show' },
] as const;

export const MEASUREMENT_SOURCES = [
  { value: 'self', label: 'Self recorded' },
  { value: 'pt', label: 'Personal trainer' },
  { value: 'physio', label: 'Physiotherapist' },
  { value: 'nutrition', label: 'Nutritionist' },
  { value: 'medical', label: 'Medical' },
  { value: 'spa', label: 'Spa' },
] as const;

/** Appointment types that do not name one athlete. */
export const GROUP_APPOINTMENT_TYPES = ['group', 'class'];

const labelFrom = (
  options: readonly { value: string; label: string }[],
  value: string | null | undefined,
  fallback = '—',
): string => options.find((o) => o.value === value)?.label ?? fallback;

export const programStatusLabel = (value: string | null | undefined): string =>
  labelFrom(PROGRAM_STATUSES, value);
export const sessionStatusLabel = (value: string | null | undefined): string =>
  labelFrom(SESSION_STATUSES, value);
export const appointmentTypeLabel = (value: string | null | undefined): string =>
  labelFrom(APPOINTMENT_TYPES, value);
export const appointmentStatusLabel = (value: string | null | undefined): string =>
  labelFrom(APPOINTMENT_STATUSES, value);
export const measurementSourceLabel = (value: string | null | undefined): string =>
  labelFrom(MEASUREMENT_SOURCES, value, 'Self recorded');

export type PtTone = 'default' | 'good' | 'warning' | 'critical';

export const programStatusTone = (value: string | null | undefined): PtTone => {
  if (value === 'active') return 'good';
  if (value === 'paused') return 'warning';
  if (value === 'cancelled') return 'critical';
  return 'default';
};

export const sessionStatusTone = (value: string | null | undefined): PtTone => {
  if (value === 'completed') return 'good';
  if (value === 'in_progress') return 'warning';
  if (value === 'missed') return 'critical';
  return 'default';
};

export const appointmentStatusTone = (value: string | null | undefined): PtTone => {
  if (value === 'completed') return 'good';
  if (value === 'cancelled' || value === 'no_show') return 'critical';
  if (value === 'requested') return 'warning';
  return 'default';
};

/** Adherence is amber below 80 per cent and red below 50. */
export const adherenceTone = (pct: number | null): PtTone => {
  if (pct === null) return 'default';
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'warning';
  return 'critical';
};

export const todayIsoDate = (): string => format(new Date(), 'yyyy-MM-dd');

/** Monday of the week containing `date`, as an ISO date. */
export const weekStartIso = (date: Date | string = new Date()): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
};

export const addDaysIsoDate = (iso: string, days: number): string =>
  format(addDays(parseISO(iso), days), 'yyyy-MM-dd');

/** One set's work: reps times load. Timed and distance work counts as zero. */
export const setVolume = (log: Pick<PtSetLog, 'reps' | 'weight_kg'>): number =>
  (log.reps ?? 0) * (log.weight_kg ?? 0);

/** Epley: 1RM ≈ weight × (1 + reps / 30). Only meaningful for loaded reps. */
export const estimated1RM = (
  weightKg: number | null | undefined,
  reps: number | null | undefined,
): number | null => {
  if (!weightKg || !reps || reps <= 0) return null;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
};

const blankToNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
};

const personLabel = (
  p: { first_name: string; last_name: string; preferred_name: string | null } | null | undefined,
): string | null => (p ? `${p.preferred_name ?? p.first_name} ${p.last_name}` : null);

export interface ProgramSessionSummary {
  id: string;
  status: string;
  scheduled_on: string | null;
  completed_at: string | null;
  week_number: number;
  day_number: number;
  title: string;
}

export interface PtProgramEntry extends PtProgram {
  person_name: string | null;
  trainer_name: string | null;
  template_name: string | null;
  sessions: ProgramSessionSummary[];
  totalSessions: number;
  completedSessions: number;
  completionPct: number;
  /** Completed over scheduled in the last 28 days, or null with nothing due. */
  adherencePct: number | null;
  nextSession: ProgramSessionSummary | null;
  lastCompletedOn: string | null;
}

const decorateProgram = (row: unknown): PtProgramEntry => {
  const typed = row as PtProgram & {
    hw_people?: { first_name: string; last_name: string; preferred_name: string | null } | null;
    hw_practitioners?: { full_name: string } | null;
    pt_program_templates?: { name: string } | null;
    pt_program_sessions?: ProgramSessionSummary[];
  };
  const sessions = [...(typed.pt_program_sessions ?? [])].sort(
    (a, b) => a.week_number - b.week_number || a.day_number - b.day_number,
  );
  const completed = sessions.filter((s) => s.status === 'completed');
  const today = todayIsoDate();
  const windowStart = addDaysIsoDate(today, -28);
  const due = sessions.filter(
    (s) => s.scheduled_on && s.scheduled_on >= windowStart && s.scheduled_on <= today,
  );
  const dueCompleted = due.filter((s) => s.status === 'completed');
  const upcoming = sessions.find(
    (s) => s.status !== 'completed' && s.status !== 'skipped' && (!s.scheduled_on || s.scheduled_on >= today),
  );
  const lastCompleted = completed
    .map((s) => s.completed_at ?? s.scheduled_on)
    .filter(Boolean)
    .sort()
    .pop() as string | undefined;

  return {
    ...typed,
    person_name: personLabel(typed.hw_people),
    trainer_name: typed.hw_practitioners?.full_name ?? null,
    template_name: typed.pt_program_templates?.name ?? null,
    sessions,
    totalSessions: sessions.length,
    completedSessions: completed.length,
    completionPct: sessions.length ? Math.round((completed.length / sessions.length) * 100) : 0,
    adherencePct: due.length ? Math.round((dueCompleted.length / due.length) * 100) : null,
    nextSession: upcoming ?? null,
    lastCompletedOn: lastCompleted ?? null,
  };
};

const PROGRAM_SELECT =
  '*, hw_people(first_name, last_name, preferred_name), hw_practitioners(full_name), pt_program_templates(name), pt_program_sessions(id, status, scheduled_on, completed_at, week_number, day_number, title)';

export interface ProgramFilters {
  personId?: string | null;
  trainerId?: string | null;
  templateId?: string | null;
  statuses?: string[];
}

export interface AssignTemplateInput {
  personId: string;
  templateId: string;
  startDate: string;
  trainerId?: string | null;
  name?: string | null;
  physioPlanId?: string | null;
}

/**
 * Assigned programmes. Assigning snapshots the template into sessions and
 * items, so editing the template afterwards never rewrites an athlete's plan.
 */
export function usePtPrograms(filters: ProgramFilters = {}) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;
  const { personId = null, trainerId = null, templateId = null, statuses } = filters;
  const statusKey = statuses?.join(',') ?? 'all';

  const query = useQuery({
    queryKey: [...PT_PROGRAMS_KEY, companyId, personId, trainerId, templateId, statusKey],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async (): Promise<PtProgramEntry[]> => {
      let request = supabase
        .from('pt_programs')
        .select(PROGRAM_SELECT)
        .eq('company_id', companyId as string)
        .order('start_date', { ascending: false });
      if (personId) request = request.eq('person_id', personId);
      if (trainerId) request = request.eq('trainer_id', trainerId);
      if (templateId) request = request.eq('template_id', templateId);
      if (statuses?.length) request = request.in('status', statuses);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map(decorateProgram);
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: PT_PROGRAMS_KEY });
    void queryClient.invalidateQueries({ queryKey: PT_SESSIONS_KEY });
  };

  const assignTemplate = useMutation({
    mutationFn: async (input: AssignTemplateInput): Promise<string> => {
      const { data, error } = await supabase.rpc('pt_assign_template', {
        p_person_id: input.personId,
        p_template_id: input.templateId,
        p_start_date: input.startDate,
        ...(input.trainerId ? { p_trainer_id: input.trainerId } : {}),
        ...(input.name?.trim() ? { p_name: input.name.trim() } : {}),
        ...(input.physioPlanId ? { p_physio_plan_id: input.physioPlanId } : {}),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      invalidate();
      toast({
        title: 'Programme assigned',
        description: 'The template has been copied into the athlete’s plan. Editing the template later will not change it.',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not assign', description: error.message, variant: 'destructive' });
    },
  });

  const save = useMutation({
    mutationFn: async (values: Partial<PtProgram> & { name: string; person_id?: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase
          .from('pt_programs')
          .update({ ...values, updated_by: user?.id ?? null })
          .eq('id', values.id);
        if (error) throw error;
        return;
      }
      if (!values.person_id) throw new Error('No athlete selected');
      const { error } = await supabase.from('pt_programs').insert({
        ...values,
        company_id: companyId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      } as TablesInsert<'pt_programs'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Programme saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('pt_programs')
        .update({ status, updated_by: user?.id ?? null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_result, variables) => {
      invalidate();
      toast({ title: `Programme ${programStatusLabel(variables.status).toLowerCase()}` });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not update', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pt_programs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Programme deleted' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' });
    },
  });

  const summary = useMemo(() => {
    const rows = query.data ?? [];
    const withAdherence = rows.filter((r) => r.adherencePct !== null);
    const today = todayIsoDate();
    const soon = addDaysIsoDate(today, 14);
    return {
      total: rows.length,
      active: rows.filter((r) => r.status === 'active').length,
      paused: rows.filter((r) => r.status === 'paused').length,
      completed: rows.filter((r) => r.status === 'completed').length,
      endingSoon: rows.filter(
        (r) => r.status === 'active' && r.end_date && r.end_date >= today && r.end_date <= soon,
      ).length,
      averageAdherence: withAdherence.length
        ? Math.round(
            withAdherence.reduce((sum, r) => sum + (r.adherencePct ?? 0), 0) / withAdherence.length,
          )
        : null,
    };
  }, [query.data]);

  return {
    ...query,
    programs: query.data ?? [],
    summary,
    assignTemplate,
    save,
    setStatus,
    remove,
    isMutating: assignTemplate.isPending || save.isPending || setStatus.isPending || remove.isPending,
  };
}

export interface SessionEntry extends PtProgramSession {
  items: PtSessionItem[];
}

export interface ProgramWeek {
  week: number;
  sessions: SessionEntry[];
}

export interface AddSessionItemInput {
  session_id: string;
  exercise_id?: string | null;
  exercise_name: string;
  block?: string | null;
  prescribed_sets?: number | null;
  prescribed_reps?: string | null;
  prescribed_load?: string | null;
  tempo?: string | null;
  rest_seconds?: number | null;
  rpe?: number | null;
  duration_seconds?: number | null;
  distance_m?: number | null;
  notes?: string | null;
}

/**
 * One programme's sessions with their items. These rows are the athlete's own
 * snapshot: editing them changes this programme only, never the template.
 */
export function useProgramSessions(programId: string | null | undefined) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...PT_SESSIONS_KEY, 'program', programId ?? null],
    enabled: Boolean(programId),
    staleTime: 15_000,
    queryFn: async (): Promise<SessionEntry[]> => {
      const { data, error } = await supabase
        .from('pt_program_sessions')
        .select('*, pt_session_items(*)')
        .eq('program_id', programId as string);
      if (error) throw error;
      return ((data ?? []) as (PtProgramSession & { pt_session_items?: PtSessionItem[] })[])
        .map((session) => ({
          ...session,
          items: [...(session.pt_session_items ?? [])].sort((a, b) => a.position - b.position),
        }))
        .sort((a, b) => a.week_number - b.week_number || a.day_number - b.day_number);
    },
  });

  const sessions = useMemo(() => query.data ?? [], [query.data]);

  const weeks = useMemo<ProgramWeek[]>(() => {
    const map = new Map<number, SessionEntry[]>();
    for (const session of sessions)
      map.set(session.week_number, [...(map.get(session.week_number) ?? []), session]);
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([week, weekSessions]) => ({ week, sessions: weekSessions }));
  }, [sessions]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: PT_SESSIONS_KEY });
    void queryClient.invalidateQueries({ queryKey: PT_PROGRAMS_KEY });
  };

  const fail = (title: string) => (error: Error) =>
    toast({ title, description: error.message, variant: 'destructive' });

  const updateSession = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<PtProgramSession> }) => {
      const { error } = await supabase.from('pt_program_sessions').update(values).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Session saved' });
    },
    onError: fail('Could not save the session'),
  });

  const addItem = useMutation({
    mutationFn: async (input: AddSessionItemInput) => {
      if (!companyId) throw new Error('No company on your profile');
      const session = sessions.find((s) => s.id === input.session_id);
      const position = session?.items.length
        ? Math.max(...session.items.map((i) => i.position)) + 1
        : 0;
      const { error } = await supabase.from('pt_session_items').insert({
        company_id: companyId,
        session_id: input.session_id,
        exercise_id: input.exercise_id ?? null,
        exercise_name: input.exercise_name,
        position,
        block: blankToNull(input.block),
        prescribed_sets: input.prescribed_sets ?? null,
        prescribed_reps: blankToNull(input.prescribed_reps),
        prescribed_load: blankToNull(input.prescribed_load),
        tempo: blankToNull(input.tempo),
        rest_seconds: input.rest_seconds ?? null,
        rpe: input.rpe ?? null,
        duration_seconds: input.duration_seconds ?? null,
        distance_m: input.distance_m ?? null,
        notes: blankToNull(input.notes),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Exercise added to this session only' });
    },
    onError: fail('Could not add the exercise'),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<PtSessionItem> }) => {
      const { error } = await supabase.from('pt_session_items').update(values).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Prescription saved' });
    },
    onError: fail('Could not save'),
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pt_session_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Exercise removed' });
    },
    onError: fail('Could not remove'),
  });

  const moveItem = useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: 'up' | 'down' }) => {
      const session = sessions.find((s) => s.items.some((i) => i.id === id));
      if (!session) throw new Error('That exercise is no longer in the session');
      const index = session.items.findIndex((i) => i.id === id);
      const swapWith = direction === 'up' ? index - 1 : index + 1;
      if (swapWith < 0 || swapWith >= session.items.length) return;
      const a = session.items[index];
      const b = session.items[swapWith];
      const { error: errorA } = await supabase
        .from('pt_session_items')
        .update({ position: b.position })
        .eq('id', a.id);
      if (errorA) throw errorA;
      const { error: errorB } = await supabase
        .from('pt_session_items')
        .update({ position: a.position })
        .eq('id', b.id);
      if (errorB) throw errorB;
    },
    onSuccess: () => invalidate(),
    onError: fail('Could not reorder'),
  });

  return {
    ...query,
    sessions,
    weeks,
    updateSession,
    addItem,
    updateItem,
    removeItem,
    moveItem,
    isMutating:
      updateSession.isPending ||
      addItem.isPending ||
      updateItem.isPending ||
      removeItem.isPending ||
      moveItem.isPending,
  };
}

export interface SetLogInput {
  session_item_id: string;
  person_id: string;
  set_number: number;
  reps?: number | null;
  weight_kg?: number | null;
  duration_seconds?: number | null;
  distance_m?: number | null;
  rpe?: number | null;
  completed?: boolean;
  notes?: string | null;
}

export interface CompleteSessionInput {
  id: string;
  session_rpe?: number | null;
  duration_minutes?: number | null;
  athlete_notes?: string | null;
}

/**
 * The workout logger's data: one session, its items and every set logged
 * against them. Logging a set moves the session to in progress in the
 * database, so the status here is never written by the client.
 */
export function useWorkoutSession(sessionId: string | null | undefined) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...PT_SESSIONS_KEY, 'workout', sessionId ?? null],
    enabled: Boolean(sessionId),
    staleTime: 5_000,
    queryFn: async (): Promise<SessionEntry | null> => {
      const { data, error } = await supabase
        .from('pt_program_sessions')
        .select('*, pt_session_items(*)')
        .eq('id', sessionId as string)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const typed = data as PtProgramSession & { pt_session_items?: PtSessionItem[] };
      return {
        ...typed,
        items: [...(typed.pt_session_items ?? [])].sort((a, b) => a.position - b.position),
      };
    },
  });

  const itemIds = useMemo(() => (query.data?.items ?? []).map((i) => i.id), [query.data]);

  const logsQuery = useQuery({
    queryKey: [...PT_SET_LOGS_KEY, 'session', sessionId ?? null, itemIds.join(',')],
    enabled: itemIds.length > 0,
    staleTime: 5_000,
    queryFn: async (): Promise<PtSetLog[]> => {
      const { data, error } = await supabase
        .from('pt_set_logs')
        .select('*')
        .in('session_item_id', itemIds)
        .order('set_number');
      if (error) throw error;
      return data ?? [];
    },
  });

  const logsByItem = useMemo(() => {
    const map = new Map<string, PtSetLog[]>();
    for (const log of logsQuery.data ?? [])
      map.set(log.session_item_id, [...(map.get(log.session_item_id) ?? []), log]);
    for (const [, logs] of map) logs.sort((a, b) => a.set_number - b.set_number);
    return map;
  }, [logsQuery.data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: PT_SET_LOGS_KEY });
    void queryClient.invalidateQueries({ queryKey: PT_SESSIONS_KEY });
    void queryClient.invalidateQueries({ queryKey: PT_PROGRAMS_KEY });
  };

  const logSet = useMutation({
    mutationFn: async (input: SetLogInput) => {
      if (!companyId) throw new Error('No company on your profile');
      const { error } = await supabase.from('pt_set_logs').upsert(
        {
          company_id: companyId,
          session_item_id: input.session_item_id,
          person_id: input.person_id,
          set_number: input.set_number,
          reps: input.reps ?? null,
          weight_kg: input.weight_kg ?? null,
          duration_seconds: input.duration_seconds ?? null,
          distance_m: input.distance_m ?? null,
          rpe: input.rpe ?? null,
          completed: input.completed ?? true,
          notes: blankToNull(input.notes),
          logged_by: user?.id ?? null,
        },
        { onConflict: 'session_item_id,set_number' },
      );
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (error: Error) => {
      toast({ title: 'Could not save that set', description: error.message, variant: 'destructive' });
    },
  });

  const removeSet = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pt_set_logs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (error: Error) => {
      toast({ title: 'Could not remove that set', description: error.message, variant: 'destructive' });
    },
  });

  const completeSession = useMutation({
    mutationFn: async (input: CompleteSessionInput) => {
      const { error } = await supabase
        .from('pt_program_sessions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          session_rpe: input.session_rpe ?? null,
          duration_minutes: input.duration_minutes ?? null,
          athlete_notes: blankToNull(input.athlete_notes),
        })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Session logged', description: 'Nice work. It is on your record.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not complete the session', description: error.message, variant: 'destructive' });
    },
  });

  const totalVolume = useMemo(
    () => (logsQuery.data ?? []).reduce((sum, log) => sum + setVolume(log), 0),
    [logsQuery.data],
  );

  return {
    session: query.data ?? null,
    items: query.data?.items ?? [],
    logsByItem,
    totalVolume,
    isLoading: query.isLoading || logsQuery.isLoading,
    isError: query.isError || logsQuery.isError,
    error: query.error ?? logsQuery.error,
    logSet,
    removeSet,
    completeSession,
    isMutating: logSet.isPending || removeSet.isPending || completeSession.isPending,
  };
}

export interface SetLogEntry extends PtSetLog {
  exercise_name: string;
  session_id: string | null;
  volume: number;
  oneRepMax: number | null;
}

export interface ExerciseBest {
  exercise_name: string;
  heaviestKg: number | null;
  heaviestReps: number | null;
  best1RM: number | null;
  bestSessionVolume: number;
  lastLoggedAt: string | null;
  totalSets: number;
}

/**
 * One person's recent set logs with the exercise they belong to. Serves the
 * progress charts, the personal bests and "what did I lift last time".
 */
export function usePersonSetLogs(personId: string | null | undefined, limit = 1500) {
  const query = useQuery({
    queryKey: [...PT_SET_LOGS_KEY, 'person', personId ?? null, limit],
    enabled: Boolean(personId),
    staleTime: 30_000,
    queryFn: async (): Promise<SetLogEntry[]> => {
      const { data, error } = await supabase
        .from('pt_set_logs')
        .select('*, pt_session_items(exercise_name, session_id)')
        .eq('person_id', personId as string)
        .order('logged_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((row) => {
        const typed = row as PtSetLog & {
          pt_session_items?: { exercise_name: string; session_id: string } | null;
        };
        return {
          ...typed,
          exercise_name: typed.pt_session_items?.exercise_name ?? 'Exercise',
          session_id: typed.pt_session_items?.session_id ?? null,
          volume: setVolume(typed),
          oneRepMax: estimated1RM(typed.weight_kg, typed.reps),
        };
      });
    },
  });

  const logs = useMemo(() => query.data ?? [], [query.data]);

  const bests = useMemo<ExerciseBest[]>(() => {
    const byExercise = new Map<string, SetLogEntry[]>();
    for (const log of logs) {
      if (!log.completed) continue;
      byExercise.set(log.exercise_name, [...(byExercise.get(log.exercise_name) ?? []), log]);
    }
    return Array.from(byExercise.entries())
      .map(([name, rows]) => {
        const loaded = rows.filter((r) => (r.weight_kg ?? 0) > 0);
        const heaviest = loaded.reduce<SetLogEntry | null>(
          (best, row) => (!best || (row.weight_kg ?? 0) > (best.weight_kg ?? 0) ? row : best),
          null,
        );
        const best1RM = loaded.reduce<number | null>(
          (best, row) => (row.oneRepMax !== null && (best === null || row.oneRepMax > best) ? row.oneRepMax : best),
          null,
        );
        const volumeBySession = new Map<string, number>();
        for (const row of rows) {
          const key = row.session_id ?? row.id;
          volumeBySession.set(key, (volumeBySession.get(key) ?? 0) + row.volume);
        }
        return {
          exercise_name: name,
          heaviestKg: heaviest?.weight_kg ?? null,
          heaviestReps: heaviest?.reps ?? null,
          best1RM,
          bestSessionVolume: Math.round(Math.max(0, ...volumeBySession.values())),
          lastLoggedAt: rows.map((r) => r.logged_at).sort().pop() ?? null,
          totalSets: rows.length,
        };
      })
      .sort((a, b) => (b.best1RM ?? 0) - (a.best1RM ?? 0) || a.exercise_name.localeCompare(b.exercise_name));
  }, [logs]);

  /** Volume per ISO week, oldest first, for the training-load trend. */
  const volumeByWeek = useMemo(() => {
    const map = new Map<string, number>();
    for (const log of logs) {
      const week = weekStartIso(log.logged_at);
      map.set(week, (map.get(week) ?? 0) + log.volume);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, volume]) => ({ week, volume: Math.round(volume) }));
  }, [logs]);

  /** The most recent set logged for an exercise, excluding the session in hand. */
  const previousFor = useMemo(
    () =>
      (exerciseName: string, excludeSessionId?: string | null): SetLogEntry[] => {
        const candidates = logs.filter(
          (log) => log.exercise_name === exerciseName && log.session_id !== excludeSessionId,
        );
        if (!candidates.length) return [];
        const mostRecentSession = candidates[0].session_id;
        return candidates
          .filter((log) => log.session_id === mostRecentSession)
          .sort((a, b) => a.set_number - b.set_number);
      },
    [logs],
  );

  return { ...query, logs, bests, volumeByWeek, previousFor };
}

export interface PtAppointmentEntry extends PtAppointment {
  person_name: string | null;
  trainer_name: string | null;
  program_session_title: string | null;
}

export interface AppointmentFilters {
  /** Inclusive ISO date, e.g. 2026-09-14. */
  from?: string | null;
  /** Exclusive ISO date. */
  to?: string | null;
  trainerId?: string | null;
  personId?: string | null;
  includeCancelled?: boolean;
}

export interface AppointmentConflict {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
}

/** The trainer's diary. */
export function usePtAppointments(filters: AppointmentFilters = {}) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;
  const { from = null, to = null, trainerId = null, personId = null, includeCancelled = true } = filters;

  const query = useQuery({
    queryKey: [...PT_APPOINTMENTS_KEY, companyId, from, to, trainerId, personId, includeCancelled],
    enabled: Boolean(companyId),
    staleTime: 15_000,
    queryFn: async (): Promise<PtAppointmentEntry[]> => {
      let request = supabase
        .from('pt_appointments')
        .select(
          '*, hw_people(first_name, last_name, preferred_name), hw_practitioners(full_name), pt_program_sessions(title)',
        )
        .eq('company_id', companyId as string)
        .order('starts_at');
      // The range is given as local dates, so convert local midnight to the
      // instant the column actually holds.
      if (from) request = request.gte('starts_at', new Date(`${from}T00:00:00`).toISOString());
      if (to) request = request.lt('starts_at', new Date(`${to}T00:00:00`).toISOString());
      if (trainerId) request = request.eq('trainer_id', trainerId);
      if (personId) request = request.eq('person_id', personId);
      if (!includeCancelled) request = request.neq('status', 'cancelled');
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const typed = row as PtAppointment & {
          hw_people?: { first_name: string; last_name: string; preferred_name: string | null } | null;
          hw_practitioners?: { full_name: string } | null;
          pt_program_sessions?: { title: string } | null;
        };
        return {
          ...typed,
          person_name: personLabel(typed.hw_people),
          trainer_name: typed.hw_practitioners?.full_name ?? null,
          program_session_title: typed.pt_program_sessions?.title ?? null,
        };
      });
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: PT_APPOINTMENTS_KEY });
  };

  const save = useMutation({
    mutationFn: async (values: Partial<PtAppointment> & { starts_at: string; ends_at: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      if (new Date(values.ends_at) <= new Date(values.starts_at)) {
        throw new Error('The session has to finish after it starts');
      }
      if (values.id) {
        const { error } = await supabase
          .from('pt_appointments')
          .update({ ...values, updated_by: user?.id ?? null })
          .eq('id', values.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('pt_appointments').insert({
        ...values,
        company_id: companyId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      } as TablesInsert<'pt_appointments'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Session saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('pt_appointments')
        .update({ status, updated_by: user?.id ?? null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_result, variables) => {
      invalidate();
      toast({ title: `Session ${appointmentStatusLabel(variables.status).toLowerCase()}` });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not update', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pt_appointments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Session removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  /**
   * Double bookings are checked here rather than in the database: there is no
   * exclusion constraint on pt_appointments, so the warning is advisory and
   * only covers the appointments currently loaded.
   */
  const findConflicts = useMemo(
    () =>
      (input: { trainerId: string | null; startsAt: string; endsAt: string; ignoreId?: string | null }): AppointmentConflict[] => {
        if (!input.trainerId || !input.startsAt || !input.endsAt) return [];
        const start = new Date(input.startsAt).getTime();
        const end = new Date(input.endsAt).getTime();
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
        return (query.data ?? [])
          .filter(
            (a) =>
              a.trainer_id === input.trainerId &&
              a.id !== input.ignoreId &&
              a.status !== 'cancelled' &&
              new Date(a.starts_at).getTime() < end &&
              new Date(a.ends_at).getTime() > start,
          )
          .map((a) => ({
            id: a.id,
            title: a.title ?? appointmentTypeLabel(a.session_type),
            starts_at: a.starts_at,
            ends_at: a.ends_at,
          }));
      },
    [query.data],
  );

  return {
    ...query,
    appointments: query.data ?? [],
    save,
    setStatus,
    remove,
    findConflicts,
    isMutating: save.isPending || setStatus.isPending || remove.isPending,
  };
}

/** Shared body metrics. Nutrition, physio and PT all write to this table. */
export function useMeasurements(personId: string | null | undefined, limit = 120) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...HW_MEASUREMENTS_KEY, personId ?? null, limit],
    enabled: Boolean(personId),
    staleTime: 60_000,
    queryFn: async (): Promise<HwMeasurement[]> => {
      const { data, error } = await supabase
        .from('hw_measurements')
        .select('*')
        .eq('person_id', personId as string)
        .order('measured_on', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });

  const measurements = useMemo(() => query.data ?? [], [query.data]);
  const chronological = useMemo(
    () => [...measurements].sort((a, b) => a.measured_on.localeCompare(b.measured_on)),
    [measurements],
  );
  const latest = measurements[0] ?? null;

  const save = useMutation({
    mutationFn: async (values: Partial<HwMeasurement>) => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase.from('hw_measurements').update(values).eq('id', values.id);
        if (error) throw error;
        return;
      }
      if (!personId) throw new Error('No athlete selected');
      const { error } = await supabase.from('hw_measurements').insert({
        ...values,
        person_id: personId,
        company_id: companyId,
        recorded_by: user?.id ?? null,
      } as TablesInsert<'hw_measurements'>);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: HW_MEASUREMENTS_KEY });
      toast({ title: 'Measurements recorded' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not record', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('hw_measurements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: HW_MEASUREMENTS_KEY });
      toast({ title: 'Measurement removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  return { ...query, measurements, chronological, latest, save, remove, isMutating: save.isPending || remove.isPending };
}

/**
 * Personal goals. `nut_goals` is the shared wellness goals table: it is
 * written by nutrition, physio and training alike, and an athlete can set
 * their own.
 */
export function useTrainingGoals(options: { personId?: string | null; openOnly?: boolean } = {}) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;
  const { personId = null, openOnly = false } = options;

  const query = useQuery({
    queryKey: [...TRAINING_GOALS_KEY, companyId, personId, openOnly],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<TrainingGoal[]> => {
      let request = supabase
        .from('nut_goals')
        .select('*')
        .eq('company_id', companyId as string)
        .order('target_date', { nullsFirst: false });
      if (personId) request = request.eq('person_id', personId);
      if (openOnly) request = request.eq('status', 'active');
      const { data, error } = await request;
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (values: Partial<TrainingGoal> & { title: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase.from('nut_goals').update(values).eq('id', values.id);
        if (error) throw error;
        return;
      }
      const target = values.person_id ?? personId;
      if (!target) throw new Error('No athlete selected');
      const { error } = await supabase.from('nut_goals').insert({
        ...values,
        person_id: target,
        company_id: companyId,
        created_by: user?.id ?? null,
      } as TablesInsert<'nut_goals'>);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TRAINING_GOALS_KEY });
      toast({ title: 'Goal saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save the goal', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('nut_goals').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TRAINING_GOALS_KEY });
      toast({ title: 'Goal removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  return { ...query, goals: query.data ?? [], save, remove, isMutating: save.isPending || remove.isPending };
}

export interface AthleteRosterEntry {
  personId: string;
  name: string;
  vesselName: string | null;
  rank: string | null;
  personType: string;
  isCrew: boolean;
  activeProgram: PtProgramEntry | null;
  programCount: number;
  adherencePct: number | null;
  lastSessionOn: string | null;
  nextAppointmentAt: string | null;
  appointmentCount: number;
  latestMeasurement: HwMeasurement | null;
  openGoals: number;
  /** No logged session in 14 days while on an active programme. */
  isStale: boolean;
}

/**
 * Everyone who trains: anyone with a programme or a booked session, decorated
 * with the numbers the roster shows.
 */
export function useAthleteRoster() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const directory = useHealthPeople();
  const programs = usePtPrograms();
  const appointments = usePtAppointments({
    from: addDaysIsoDate(todayIsoDate(), -90),
    to: addDaysIsoDate(todayIsoDate(), 90),
    includeCancelled: false,
  });
  const goals = useTrainingGoals({ openOnly: true });

  const measurementsQuery = useQuery({
    queryKey: [...HW_MEASUREMENTS_KEY, 'roster', companyId],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<HwMeasurement[]> => {
      const { data, error } = await supabase
        .from('hw_measurements')
        .select('*')
        .eq('company_id', companyId as string)
        .order('measured_on', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const entries = useMemo<AthleteRosterEntry[]>(() => {
    const now = new Date().toISOString();
    const staleBefore = addDaysIsoDate(todayIsoDate(), -14);
    const byPerson = new Map<string, AthleteRosterEntry>();

    const ensure = (personId: string): AthleteRosterEntry | null => {
      const existing = byPerson.get(personId);
      if (existing) return existing;
      const person = directory.all.find((p) => p.id === personId);
      if (!person) return null;
      const entry: AthleteRosterEntry = {
        personId,
        name: person.displayName,
        vesselName: person.vessel_name,
        rank: person.rank,
        personType: person.person_type,
        isCrew: person.isCrew,
        activeProgram: null,
        programCount: 0,
        adherencePct: null,
        lastSessionOn: null,
        nextAppointmentAt: null,
        appointmentCount: 0,
        latestMeasurement: null,
        openGoals: 0,
        isStale: false,
      };
      byPerson.set(personId, entry);
      return entry;
    };

    for (const program of programs.programs) {
      const entry = ensure(program.person_id);
      if (!entry) continue;
      entry.programCount += 1;
      if (!entry.activeProgram && (program.status === 'active' || program.status === 'paused')) {
        entry.activeProgram = program;
        entry.adherencePct = program.adherencePct;
      }
      if (program.lastCompletedOn && (!entry.lastSessionOn || program.lastCompletedOn > entry.lastSessionOn)) {
        entry.lastSessionOn = program.lastCompletedOn;
      }
    }

    for (const appointment of appointments.appointments) {
      if (!appointment.person_id) continue;
      const entry = ensure(appointment.person_id);
      if (!entry) continue;
      entry.appointmentCount += 1;
      if (appointment.starts_at >= now && (!entry.nextAppointmentAt || appointment.starts_at < entry.nextAppointmentAt)) {
        entry.nextAppointmentAt = appointment.starts_at;
      }
    }

    for (const measurement of measurementsQuery.data ?? []) {
      const entry = byPerson.get(measurement.person_id);
      if (!entry) continue;
      if (!entry.latestMeasurement || measurement.measured_on > entry.latestMeasurement.measured_on) {
        entry.latestMeasurement = measurement;
      }
    }

    for (const goal of goals.goals) {
      const entry = byPerson.get(goal.person_id);
      if (entry) entry.openGoals += 1;
    }

    for (const entry of byPerson.values()) {
      entry.isStale =
        entry.activeProgram?.status === 'active' &&
        (!entry.lastSessionOn || entry.lastSessionOn.slice(0, 10) < staleBefore);
    }

    return Array.from(byPerson.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [directory.all, programs.programs, appointments.appointments, measurementsQuery.data, goals.goals]);

  return {
    entries,
    isLoading:
      directory.isLoading || programs.isLoading || appointments.isLoading || measurementsQuery.isLoading,
    isError: directory.isError || programs.isError || appointments.isError,
    error: directory.error ?? programs.error ?? appointments.error,
    summary: {
      total: entries.length,
      onProgramme: entries.filter((e) => e.activeProgram?.status === 'active').length,
      stale: entries.filter((e) => e.isStale).length,
    },
  };
}

export interface AthleteTrainingWeek {
  weekStart: string;
  sessions: SessionEntry[];
}

/**
 * The signed-in athlete's own view: their current programme, this week's
 * sessions and today's session.
 */
export function useAthleteTraining(personId: string | null | undefined) {
  const programs = usePtPrograms({ personId, statuses: ['active', 'paused'] });
  const currentProgram = programs.programs[0] ?? null;
  const sessions = useProgramSessions(currentProgram?.id ?? null);

  const today = todayIsoDate();
  const weekStart = weekStartIso();
  const weekEnd = addDaysIsoDate(weekStart, 7);

  const thisWeek = useMemo(
    () =>
      sessions.sessions.filter(
        (s) => s.scheduled_on && s.scheduled_on >= weekStart && s.scheduled_on < weekEnd,
      ),
    [sessions.sessions, weekStart, weekEnd],
  );

  const todaySession = useMemo(
    () => sessions.sessions.find((s) => s.scheduled_on === today) ?? null,
    [sessions.sessions, today],
  );

  const nextSession = useMemo(
    () =>
      sessions.sessions.find(
        (s) => s.status !== 'completed' && s.status !== 'skipped' && (!s.scheduled_on || s.scheduled_on >= today),
      ) ?? null,
    [sessions.sessions, today],
  );

  return {
    program: currentProgram,
    programs: programs.programs,
    sessions: sessions.sessions,
    weeks: sessions.weeks,
    thisWeek,
    todaySession,
    nextSession,
    weekStart,
    isLoading: programs.isLoading || sessions.isLoading,
    isError: programs.isError || sessions.isError,
    error: programs.error ?? sessions.error,
  };
}

export interface PtDashboardData {
  loading: boolean;
  error: unknown;
  today: PtAppointmentEntry[];
  week: PtAppointmentEntry[];
  weekStart: string;
  activePrograms: number;
  pausedPrograms: number;
  athletesTrainingThisWeek: number;
  sessionsScheduledThisWeek: number;
  sessionsCompletedThisWeek: number;
  adherencePct: number | null;
  endingSoon: PtProgramEntry[];
  staleAthletes: AthleteRosterEntry[];
}

/** Everything the trainer's dashboard puts on screen. */
export function usePtDashboard(): PtDashboardData {
  const weekStart = weekStartIso();
  const weekEnd = addDaysIsoDate(weekStart, 7);
  const today = todayIsoDate();

  const appointments = usePtAppointments({ from: weekStart, to: weekEnd, includeCancelled: false });
  const programs = usePtPrograms({ statuses: ['active', 'paused'] });
  const roster = useAthleteRoster();

  const todayAppointments = useMemo(
    () => appointments.appointments.filter((a) => a.starts_at.slice(0, 10) === today),
    [appointments.appointments, today],
  );

  const weekSessions = useMemo(() => {
    const rows = programs.programs.flatMap((p) => p.sessions.map((s) => ({ program: p, session: s })));
    return rows.filter(
      (row) => row.session.scheduled_on && row.session.scheduled_on >= weekStart && row.session.scheduled_on < weekEnd,
    );
  }, [programs.programs, weekStart, weekEnd]);

  const completedThisWeek = weekSessions.filter((row) => row.session.status === 'completed').length;

  const endingSoon = useMemo(() => {
    const limit = addDaysIsoDate(today, 14);
    return programs.programs
      .filter((p) => p.status === 'active' && p.end_date && p.end_date >= today && p.end_date <= limit)
      .sort((a, b) => (a.end_date ?? '').localeCompare(b.end_date ?? ''));
  }, [programs.programs, today]);

  return {
    loading: appointments.isLoading || programs.isLoading || roster.isLoading,
    error: appointments.error ?? programs.error ?? roster.error,
    today: todayAppointments,
    week: appointments.appointments,
    weekStart,
    activePrograms: programs.programs.filter((p) => p.status === 'active').length,
    pausedPrograms: programs.programs.filter((p) => p.status === 'paused').length,
    athletesTrainingThisWeek: new Set(weekSessions.map((row) => row.program.person_id)).size,
    sessionsScheduledThisWeek: weekSessions.length,
    sessionsCompletedThisWeek: completedThisWeek,
    adherencePct: weekSessions.length ? Math.round((completedThisWeek / weekSessions.length) * 100) : null,
    endingSoon,
    staleAthletes: roster.entries.filter((e) => e.isStale),
  };
}

export type AthletePreferences = Tables<'nut_profiles'>;

export const ATHLETE_PREFERENCES_KEY = ['health', 'athlete-preferences'] as const;

export const TRAINING_GOAL_TYPES = [
  { value: 'maintain', label: 'Maintain' },
  { value: 'lose_fat', label: 'Lose body fat' },
  { value: 'gain_muscle', label: 'Build muscle' },
  { value: 'performance', label: 'Performance' },
  { value: 'medical', label: 'Medical' },
  { value: 'recovery', label: 'Recovery' },
] as const;

export const ACTIVITY_LEVELS = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very active' },
] as const;

export const trainingGoalTypeLabel = (value: string | null | undefined): string =>
  labelFrom(TRAINING_GOAL_TYPES, value, 'Maintain');
export const activityLevelLabel = (value: string | null | undefined): string =>
  labelFrom(ACTIVITY_LEVELS, value, 'Moderate');

/**
 * The athlete's own preferences. These live on `nut_profiles`, the one
 * per-person wellness profile the schema has, so goal and activity level are
 * shared with Nutrition rather than recorded twice. The row also tells us
 * whether they have a nutrition profile to link to.
 */
export function useAthletePreferences(personId: string | null | undefined) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...ATHLETE_PREFERENCES_KEY, personId ?? null],
    enabled: Boolean(personId),
    staleTime: 60_000,
    queryFn: async (): Promise<AthletePreferences | null> => {
      const { data, error } = await supabase
        .from('nut_profiles')
        .select('*')
        .eq('person_id', personId as string)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  const save = useMutation({
    mutationFn: async (values: Partial<AthletePreferences>) => {
      if (!companyId || !personId) throw new Error('No athlete selected');
      if (query.data?.id) {
        const { error } = await supabase
          .from('nut_profiles')
          .update({ ...values, updated_by: user?.id ?? null })
          .eq('id', query.data.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('nut_profiles').insert({
        ...values,
        person_id: personId,
        company_id: companyId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      } as TablesInsert<'nut_profiles'>);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ATHLETE_PREFERENCES_KEY });
      toast({ title: 'Preferences saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  return {
    ...query,
    preferences: query.data ?? null,
    hasNutritionProfile: Boolean(query.data),
    save,
    isMutating: save.isPending,
  };
}
