import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useToast } from '@/shared/hooks/use-toast';
import { useMedicalAccess } from '@/modules/auth/hooks/useMedicalAccess';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { canAccessPhysio } from '@/modules/auth/lib/wellnessAccess';

export type PhysioAssessment = Tables<'physio_assessments'>;
export type PhysioAssessmentItem = Tables<'physio_assessment_items'>;
export type PhysioTreatmentPlan = Tables<'physio_treatment_plans'>;
export type PhysioSession = Tables<'physio_sessions'>;
export type RehabProtocolTemplate = Tables<'pt_program_templates'>;

export const PHYSIO_ASSESSMENTS_KEY = ['health', 'physio-assessments'] as const;
export const PHYSIO_ASSESSMENT_ITEMS_KEY = ['health', 'physio-assessment-items'] as const;
export const PHYSIO_PLANS_KEY = ['health', 'physio-treatment-plans'] as const;
export const PHYSIO_SESSIONS_KEY = ['health', 'physio-sessions'] as const;
export const REHAB_TEMPLATES_KEY = ['health', 'physio-rehab-templates'] as const;

export const ASSESSMENT_TYPES = [
  { value: 'initial', label: 'Initial assessment' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'discharge', label: 'Discharge' },
  { value: 'screening', label: 'Screening' },
  { value: 'fms', label: 'Movement screen (FMS)' },
  { value: 'return_to_work', label: 'Return to work' },
] as const;

export const FIT_FOR_DUTY_OPTIONS = [
  { value: 'fit', label: 'Fit for duty' },
  { value: 'light_duties', label: 'Light duties' },
  { value: 'unfit', label: 'Not fit for duty' },
] as const;

export const ASSESSMENT_ITEM_CATEGORIES = [
  { value: 'range_of_motion', label: 'Range of motion' },
  { value: 'strength', label: 'Strength' },
  { value: 'special_test', label: 'Special test' },
  { value: 'posture', label: 'Posture' },
  { value: 'movement_screen', label: 'Movement screen' },
  { value: 'functional', label: 'Functional' },
  { value: 'other', label: 'Other' },
] as const;

export const ASSESSMENT_ITEM_SIDES = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'bilateral', label: 'Bilateral' },
  { value: 'n/a', label: 'Not applicable' },
] as const;

export const PLAN_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'discharged', label: 'Discharged' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export const SESSION_STATUSES = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'Did not attend' },
] as const;

export const assessmentTypeLabel = (value: string | null | undefined): string =>
  ASSESSMENT_TYPES.find((t) => t.value === value)?.label ?? 'Assessment';

export const fitForDutyLabel = (value: string | null | undefined): string =>
  FIT_FOR_DUTY_OPTIONS.find((f) => f.value === value)?.label ?? 'Not recorded';

export const assessmentItemCategoryLabel = (value: string | null | undefined): string =>
  ASSESSMENT_ITEM_CATEGORIES.find((c) => c.value === value)?.label ?? 'Other';

export const assessmentItemSideLabel = (value: string | null | undefined): string =>
  ASSESSMENT_ITEM_SIDES.find((s) => s.value === value)?.label ?? 'Not applicable';

export const planStatusLabel = (value: string | null | undefined): string =>
  PLAN_STATUSES.find((s) => s.value === value)?.label ?? 'Active';

export const sessionStatusLabel = (value: string | null | undefined): string =>
  SESSION_STATUSES.find((s) => s.value === value)?.label ?? 'Completed';

export const fitForDutyTone = (
  value: string | null | undefined,
): 'good' | 'warning' | 'critical' | 'default' => {
  if (value === 'fit') return 'good';
  if (value === 'light_duties') return 'warning';
  if (value === 'unfit') return 'critical';
  return 'default';
};

export const planStatusTone = (
  value: string | null | undefined,
): 'good' | 'warning' | 'critical' | 'default' => {
  if (value === 'active') return 'good';
  if (value === 'on_hold') return 'warning';
  if (value === 'cancelled') return 'critical';
  return 'default';
};

export const sessionStatusTone = (
  value: string | null | undefined,
): 'good' | 'warning' | 'critical' | 'default' => {
  if (value === 'completed') return 'good';
  if (value === 'scheduled') return 'default';
  if (value === 'no_show') return 'critical';
  return 'warning';
};

/** 0-10 numeric rating scale, worded the way a physio would say it back. */
export const painLabel = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return 'Not recorded';
  if (value === 0) return 'No pain';
  if (value <= 3) return 'Mild';
  if (value <= 6) return 'Moderate';
  if (value <= 8) return 'Severe';
  return 'Worst imaginable';
};

export const painTone = (
  value: number | null | undefined,
): 'good' | 'warning' | 'critical' | 'default' => {
  if (value === null || value === undefined) return 'default';
  if (value <= 3) return 'good';
  if (value <= 6) return 'warning';
  return 'critical';
};

export interface PhysioAssessmentEntry extends PhysioAssessment {
  person_name: string | null;
  practitioner_name: string | null;
  hasRedFlags: boolean;
  isUnfit: boolean;
}

export interface PhysioTreatmentPlanEntry extends PhysioTreatmentPlan {
  person_name: string | null;
  practitioner_name: string | null;
  assessment_label: string | null;
  isOverdueForReview: boolean;
  daysToReview: number | null;
}

export interface PhysioSessionEntry extends PhysioSession {
  person_name: string | null;
  practitioner_name: string | null;
  plan_title: string | null;
  painDelta: number | null;
}

/** A draft findings row before it is written to `physio_assessment_items`. */
export interface AssessmentItemDraft {
  id?: string;
  category: string;
  label: string;
  side: string;
  value_numeric: number | null;
  value_text: string | null;
  unit: string | null;
  normal_range: string | null;
  is_flagged: boolean;
  notes: string | null;
}

export const emptyAssessmentItem = (category = 'range_of_motion'): AssessmentItemDraft => ({
  category,
  label: '',
  side: 'n/a',
  value_numeric: null,
  value_text: null,
  unit: null,
  normal_range: null,
  is_flagged: false,
  notes: null,
});

/**
 * Offered when an assessment has no findings yet. These are the measures a
 * physio takes on almost every musculoskeletal presentation, so starting from
 * them is faster than typing each label on a tablet at sea.
 */
export const STARTER_ASSESSMENT_ITEMS: AssessmentItemDraft[] = [
  { category: 'range_of_motion', label: 'Shoulder flexion', side: 'left', value_numeric: null, value_text: null, unit: 'deg', normal_range: '0 to 180', is_flagged: false, notes: null },
  { category: 'range_of_motion', label: 'Shoulder flexion', side: 'right', value_numeric: null, value_text: null, unit: 'deg', normal_range: '0 to 180', is_flagged: false, notes: null },
  { category: 'range_of_motion', label: 'Hip internal rotation', side: 'left', value_numeric: null, value_text: null, unit: 'deg', normal_range: '0 to 45', is_flagged: false, notes: null },
  { category: 'range_of_motion', label: 'Hip internal rotation', side: 'right', value_numeric: null, value_text: null, unit: 'deg', normal_range: '0 to 45', is_flagged: false, notes: null },
  { category: 'range_of_motion', label: 'Cervical rotation', side: 'bilateral', value_numeric: null, value_text: null, unit: 'deg', normal_range: '0 to 80', is_flagged: false, notes: null },
  { category: 'special_test', label: 'Straight leg raise', side: 'left', value_numeric: null, value_text: null, unit: 'deg', normal_range: '70 to 90', is_flagged: false, notes: null },
  { category: 'special_test', label: 'Straight leg raise', side: 'right', value_numeric: null, value_text: null, unit: 'deg', normal_range: '70 to 90', is_flagged: false, notes: null },
  { category: 'movement_screen', label: 'Single leg squat', side: 'bilateral', value_numeric: null, value_text: null, unit: null, normal_range: 'No valgus collapse', is_flagged: false, notes: null },
  { category: 'strength', label: 'Grip strength', side: 'left', value_numeric: null, value_text: null, unit: 'kg', normal_range: null, is_flagged: false, notes: null },
  { category: 'strength', label: 'Grip strength', side: 'right', value_numeric: null, value_text: null, unit: 'kg', normal_range: null, is_flagged: false, notes: null },
  { category: 'posture', label: 'Standing posture', side: 'n/a', value_numeric: null, value_text: null, unit: null, normal_range: null, is_flagged: false, notes: null },
  { category: 'functional', label: 'Sit to stand in 30 seconds', side: 'n/a', value_numeric: null, value_text: null, unit: 'reps', normal_range: '12 or more', is_flagged: false, notes: null },
];

const personName = (
  p: { first_name: string; last_name: string; preferred_name: string | null } | null | undefined,
): string | null => (p ? `${p.preferred_name ?? p.first_name} ${p.last_name}` : null);

const daysBetweenToday = (date: string | null): number | null => {
  if (!date) return null;
  const ms = new Date(`${date}T00:00:00Z`).getTime() - new Date().setUTCHours(0, 0, 0, 0);
  return Math.round(ms / 86_400_000);
};

const hasText = (value: string | null | undefined): boolean => Boolean(value && value.trim());

/**
 * Physiotherapy records are clinical: medical staff, an active physio, a
 * wellness admin, or the subject reading their own file. Mirrors the
 * `physio_*` RLS policies so the UI only offers what the database allows.
 */
export function usePhysioAccess() {
  const medical = useMedicalAccess();
  const wellness = useWellnessAccess();

  return useMemo(() => {
    const loading = medical.loading || wellness.loading;
    return {
      loading,
      medical,
      wellness,
      canView: canAccessPhysio(medical, wellness, 'view'),
      canEdit: canAccessPhysio(medical, wellness, 'edit'),
    };
  }, [medical, wellness]);
}

const useCompanyId = () => {
  const { profile } = useAuth();
  return profile?.company_id ?? null;
};

export interface AssessmentFilters {
  personId?: string | null;
  practitionerId?: string | null;
  assessmentType?: string | null;
  from?: string | null;
  to?: string | null;
  /** Skip the query entirely, for a reader with no physio access. */
  enabled?: boolean;
}

/** Physiotherapy assessments across the company, or for one subject. */
export function usePhysioAssessments(filters: AssessmentFilters = {}) {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { personId, practitionerId, assessmentType, from, to, enabled = true } = filters;

  const query = useQuery({
    queryKey: [
      ...PHYSIO_ASSESSMENTS_KEY,
      companyId,
      personId ?? 'all',
      practitionerId ?? 'all',
      assessmentType ?? 'all',
      from ?? 'any',
      to ?? 'any',
    ],
    enabled: Boolean(companyId) && enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<PhysioAssessmentEntry[]> => {
      let request = supabase
        .from('physio_assessments')
        .select('*, hw_people(first_name, last_name, preferred_name), hw_practitioners(full_name)')
        .eq('company_id', companyId as string)
        .order('assessed_on', { ascending: false });
      if (personId) request = request.eq('person_id', personId);
      if (practitionerId) request = request.eq('practitioner_id', practitionerId);
      if (assessmentType) request = request.eq('assessment_type', assessmentType);
      if (from) request = request.gte('assessed_on', from);
      if (to) request = request.lte('assessed_on', to);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const typed = row as PhysioAssessment & {
          hw_people?: { first_name: string; last_name: string; preferred_name: string | null } | null;
          hw_practitioners?: { full_name: string } | null;
        };
        return {
          ...typed,
          person_name: personName(typed.hw_people),
          practitioner_name: typed.hw_practitioners?.full_name ?? null,
          hasRedFlags: hasText(typed.red_flags),
          isUnfit: typed.fit_for_duty === 'unfit',
        };
      });
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: PHYSIO_ASSESSMENTS_KEY });
  };

  const save = useMutation({
    mutationFn: async (
      values: Partial<PhysioAssessment> & { person_id?: string },
    ): Promise<string> => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase
          .from('physio_assessments')
          .update({ ...values, updated_by: user?.id ?? null })
          .eq('id', values.id);
        if (error) throw error;
        return values.id;
      }
      const target = values.person_id ?? personId;
      if (!target) throw new Error('No person selected');
      const { data, error } = await supabase
        .from('physio_assessments')
        .insert({
          ...values,
          person_id: target,
          company_id: companyId,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        } as TablesInsert<'physio_assessments'>)
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Assessment saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('physio_assessments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: PHYSIO_ASSESSMENT_ITEMS_KEY });
      toast({ title: 'Assessment removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  const summary = useMemo(() => {
    const rows = query.data ?? [];
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 30);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    return {
      total: rows.length,
      redFlags: rows.filter((r) => r.hasRedFlags).length,
      unfit: rows.filter((r) => r.isUnfit).length,
      lightDuties: rows.filter((r) => r.fit_for_duty === 'light_duties').length,
      last30: rows.filter((r) => r.assessed_on >= cutoffIso).length,
      averagePain: (() => {
        const scored = rows.filter((r) => r.pain_score !== null);
        if (!scored.length) return null;
        const total = scored.reduce((sum, r) => sum + (r.pain_score ?? 0), 0);
        return Math.round((total / scored.length) * 10) / 10;
      })(),
    };
  }, [query.data]);

  return {
    ...query,
    assessments: query.data ?? [],
    summary,
    save,
    remove,
    isMutating: save.isPending || remove.isPending,
  };
}

/**
 * The structured findings on one assessment. Rows are written as a set: the
 * editor holds a draft list, and saving reconciles it against what is stored
 * so `position` always matches the order the physio put them in.
 */
export function usePhysioAssessmentItems(assessmentId: string | null | undefined) {
  const companyId = useCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...PHYSIO_ASSESSMENT_ITEMS_KEY, assessmentId ?? null],
    enabled: Boolean(assessmentId),
    staleTime: 30_000,
    queryFn: async (): Promise<PhysioAssessmentItem[]> => {
      const { data, error } = await supabase
        .from('physio_assessment_items')
        .select('*')
        .eq('assessment_id', assessmentId as string)
        .order('position', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const syncItems = useMutation({
    mutationFn: async (input: {
      assessmentId: string;
      items: AssessmentItemDraft[];
      removedIds?: string[];
    }) => {
      if (!companyId) throw new Error('No company on your profile');

      if (input.removedIds?.length) {
        const { error } = await supabase
          .from('physio_assessment_items')
          .delete()
          .in('id', input.removedIds);
        if (error) throw error;
      }

      const rows = input.items.filter((item) => item.label.trim().length > 0);
      const updates = rows
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => Boolean(item.id));
      for (const { item, index } of updates) {
        const { error } = await supabase
          .from('physio_assessment_items')
          .update({
            category: item.category,
            label: item.label.trim(),
            side: item.side,
            value_numeric: item.value_numeric,
            value_text: item.value_text,
            unit: item.unit,
            normal_range: item.normal_range,
            is_flagged: item.is_flagged,
            notes: item.notes,
            position: index,
          })
          .eq('id', item.id as string);
        if (error) throw error;
      }

      const inserts = rows
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => !item.id)
        .map(({ item, index }) => ({
          company_id: companyId,
          assessment_id: input.assessmentId,
          category: item.category,
          label: item.label.trim(),
          side: item.side,
          value_numeric: item.value_numeric,
          value_text: item.value_text,
          unit: item.unit,
          normal_range: item.normal_range,
          is_flagged: item.is_flagged,
          notes: item.notes,
          position: index,
        })) as TablesInsert<'physio_assessment_items'>[];
      if (inserts.length) {
        const { error } = await supabase.from('physio_assessment_items').insert(inserts);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PHYSIO_ASSESSMENT_ITEMS_KEY });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save the findings', description: error.message, variant: 'destructive' });
    },
  });

  // Memoised so callers can put `items` in an effect's dependency list without
  // a fresh empty array re-firing it on every render while the query loads.
  const items = useMemo(() => query.data ?? [], [query.data]);

  const flaggedCount = useMemo(
    () => items.filter((item) => item.is_flagged).length,
    [items],
  );

  return { ...query, items, flaggedCount, syncItems, isMutating: syncItems.isPending };
}

export interface PlanFilters {
  personId?: string | null;
  status?: string | null;
  practitionerId?: string | null;
  enabled?: boolean;
}

/** Treatment plans: what is being worked on, by whom and until when. */
export function usePhysioTreatmentPlans(filters: PlanFilters = {}) {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { personId, status, practitionerId, enabled = true } = filters;

  const query = useQuery({
    queryKey: [
      ...PHYSIO_PLANS_KEY,
      companyId,
      personId ?? 'all',
      status ?? 'all',
      practitionerId ?? 'all',
    ],
    enabled: Boolean(companyId) && enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<PhysioTreatmentPlanEntry[]> => {
      let request = supabase
        .from('physio_treatment_plans')
        .select(
          '*, hw_people(first_name, last_name, preferred_name), hw_practitioners(full_name), physio_assessments(assessed_on, assessment_type)',
        )
        .eq('company_id', companyId as string)
        .order('start_date', { ascending: false });
      if (personId) request = request.eq('person_id', personId);
      if (status) request = request.eq('status', status);
      if (practitionerId) request = request.eq('practitioner_id', practitionerId);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const typed = row as PhysioTreatmentPlan & {
          hw_people?: { first_name: string; last_name: string; preferred_name: string | null } | null;
          hw_practitioners?: { full_name: string } | null;
          physio_assessments?: { assessed_on: string; assessment_type: string } | null;
        };
        const days = daysBetweenToday(typed.review_date);
        return {
          ...typed,
          person_name: personName(typed.hw_people),
          practitioner_name: typed.hw_practitioners?.full_name ?? null,
          assessment_label: typed.physio_assessments
            ? `${assessmentTypeLabel(typed.physio_assessments.assessment_type)} · ${typed.physio_assessments.assessed_on}`
            : null,
          daysToReview: days,
          isOverdueForReview: days !== null && days < 0 && typed.status === 'active',
        };
      });
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: PHYSIO_PLANS_KEY });
  };

  const save = useMutation({
    mutationFn: async (values: Partial<PhysioTreatmentPlan> & { person_id?: string; title?: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase
          .from('physio_treatment_plans')
          .update({ ...values, updated_by: user?.id ?? null })
          .eq('id', values.id);
        if (error) throw error;
        return;
      }
      const target = values.person_id ?? personId;
      if (!target) throw new Error('No person selected');
      const { error } = await supabase.from('physio_treatment_plans').insert({
        ...values,
        person_id: target,
        company_id: companyId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      } as TablesInsert<'physio_treatment_plans'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Treatment plan saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const discharge = useMutation({
    mutationFn: async (input: { id: string; discharge_summary: string; end_date: string }) => {
      const { error } = await supabase
        .from('physio_treatment_plans')
        .update({
          status: 'discharged',
          discharge_summary: input.discharge_summary,
          end_date: input.end_date,
          updated_by: user?.id ?? null,
        })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Discharged', description: 'The plan is closed and the summary is on file.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not discharge', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('physio_treatment_plans').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: PHYSIO_SESSIONS_KEY });
      toast({ title: 'Plan removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  const summary = useMemo(() => {
    const rows = query.data ?? [];
    return {
      total: rows.length,
      active: rows.filter((r) => r.status === 'active').length,
      onHold: rows.filter((r) => r.status === 'on_hold').length,
      discharged: rows.filter((r) => r.status === 'discharged' || r.status === 'completed').length,
      reviewOverdue: rows.filter((r) => r.isOverdueForReview).length,
    };
  }, [query.data]);

  return {
    ...query,
    plans: query.data ?? [],
    summary,
    save,
    discharge,
    remove,
    isMutating: save.isPending || discharge.isPending || remove.isPending,
  };
}

export interface SessionFilters {
  personId?: string | null;
  planId?: string | null;
  practitionerId?: string | null;
  status?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
  enabled?: boolean;
}

/** The session log: every hands-on contact, scheduled or done. */
export function usePhysioSessions(filters: SessionFilters = {}) {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    personId,
    planId,
    practitionerId,
    status,
    from,
    to,
    limit = 400,
    enabled = true,
  } = filters;

  const query = useQuery({
    queryKey: [
      ...PHYSIO_SESSIONS_KEY,
      companyId,
      personId ?? 'all',
      planId ?? 'all',
      practitionerId ?? 'all',
      status ?? 'all',
      from ?? 'any',
      to ?? 'any',
      limit,
    ],
    enabled: Boolean(companyId) && enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<PhysioSessionEntry[]> => {
      let request = supabase
        .from('physio_sessions')
        .select(
          '*, hw_people(first_name, last_name, preferred_name), hw_practitioners(full_name), physio_treatment_plans(title)',
        )
        .eq('company_id', companyId as string)
        .order('session_date', { ascending: false })
        .limit(limit);
      if (personId) request = request.eq('person_id', personId);
      if (planId) request = request.eq('plan_id', planId);
      if (practitionerId) request = request.eq('practitioner_id', practitionerId);
      if (status) request = request.eq('status', status);
      if (from) request = request.gte('session_date', from);
      if (to) request = request.lte('session_date', to);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const typed = row as PhysioSession & {
          hw_people?: { first_name: string; last_name: string; preferred_name: string | null } | null;
          hw_practitioners?: { full_name: string } | null;
          physio_treatment_plans?: { title: string } | null;
        };
        return {
          ...typed,
          person_name: personName(typed.hw_people),
          practitioner_name: typed.hw_practitioners?.full_name ?? null,
          plan_title: typed.physio_treatment_plans?.title ?? null,
          painDelta:
            typed.pain_before !== null && typed.pain_after !== null
              ? typed.pain_after - typed.pain_before
              : null,
        };
      });
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: PHYSIO_SESSIONS_KEY });
  };

  const save = useMutation({
    mutationFn: async (values: Partial<PhysioSession> & { person_id?: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase
          .from('physio_sessions')
          .update({ ...values, updated_by: user?.id ?? null })
          .eq('id', values.id);
        if (error) throw error;
        return;
      }
      const target = values.person_id ?? personId;
      if (!target) throw new Error('No person selected');
      const { error } = await supabase.from('physio_sessions').insert({
        ...values,
        person_id: target,
        company_id: companyId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      } as TablesInsert<'physio_sessions'>);
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

  const complete = useMutation({
    mutationFn: async (input: {
      id: string;
      treatment_given?: string | null;
      pain_before?: number | null;
      pain_after?: number | null;
    }) => {
      const { error } = await supabase
        .from('physio_sessions')
        .update({
          status: 'completed',
          treatment_given: input.treatment_given ?? undefined,
          pain_before: input.pain_before ?? undefined,
          pain_after: input.pain_after ?? undefined,
          updated_by: user?.id ?? null,
        })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Session marked complete' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not update', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('physio_sessions').delete().eq('id', id);
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

  const summary = useMemo(() => {
    const rows = query.data ?? [];
    const weekAgo = new Date();
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
    const weekIso = weekAgo.toISOString().slice(0, 10);
    const improved = rows.filter((r) => r.painDelta !== null && r.painDelta < 0);
    return {
      total: rows.length,
      thisWeek: rows.filter((r) => r.session_date >= weekIso).length,
      scheduled: rows.filter((r) => r.status === 'scheduled').length,
      completed: rows.filter((r) => r.status === 'completed').length,
      didNotAttend: rows.filter((r) => r.status === 'no_show').length,
      improvedCount: improved.length,
      averagePainDrop: improved.length
        ? Math.round((improved.reduce((sum, r) => sum + Math.abs(r.painDelta ?? 0), 0) / improved.length) * 10) / 10
        : null,
    };
  }, [query.data]);

  return {
    ...query,
    sessions: query.data ?? [],
    summary,
    save,
    complete,
    remove,
    isMutating: save.isPending || complete.isPending || remove.isPending,
  };
}

/**
 * Names for the people behind `referred_by` and similar columns, which hold a
 * `profiles.user_id` rather than a joinable health record. Read only.
 */
export function useProfileNames(userIds: (string | null)[]) {
  const ids = useMemo(
    () => Array.from(new Set(userIds.filter((id): id is string => Boolean(id)))).sort(),
    [userIds],
  );

  const query = useQuery({
    queryKey: ['health', 'physio-profile-names', ids.join(',')],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ user_id: string | null; first_name: string; last_name: string }[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .in('user_id', ids);
      if (error) throw error;
      return data ?? [];
    },
  });

  const byUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of query.data ?? []) {
      if (row.user_id) map.set(row.user_id, `${row.first_name} ${row.last_name}`.trim());
    }
    return map;
  }, [query.data]);

  return { byUserId, isLoading: query.isLoading };
}

/**
 * Rehabilitation programme templates from the shared training library. Read
 * only here: the library itself is owned by the personal training module, and
 * `physio_treatment_plans.protocol_template_id` has no foreign key yet, so the
 * names are matched client side rather than embedded in the plan query.
 */
export function useRehabProtocolTemplates() {
  const companyId = useCompanyId();

  const query = useQuery({
    queryKey: [...REHAB_TEMPLATES_KEY, companyId],
    enabled: Boolean(companyId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RehabProtocolTemplate[]> => {
      const { data, error } = await supabase
        .from('pt_program_templates')
        .select('*')
        .eq('company_id', companyId as string)
        .eq('is_rehab', true)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const byId = useMemo(() => {
    const map = new Map<string, RehabProtocolTemplate>();
    for (const row of query.data ?? []) map.set(row.id, row);
    return map;
  }, [query.data]);

  return { ...query, templates: query.data ?? [], byId };
}
