import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useToast } from '@/shared/hooks/use-toast';

export type ScreeningTemplate = Tables<'med_screening_templates'>;
export type ScreeningQuestion = Tables<'med_screening_questions'>;
export type ScreeningRecord = Tables<'med_screening_records'>;
export type ScreeningAnswer = Tables<'med_screening_answers'>;

export const SCREENING_TEMPLATES_KEY = ['health', 'screening-templates'] as const;
export const SCREENING_QUESTIONS_KEY = ['health', 'screening-questions'] as const;
export const SCREENING_RECORDS_KEY = ['health', 'screening-records'] as const;
export const SCREENING_ANSWERS_KEY = ['health', 'screening-answers'] as const;

export const SCREENING_CATEGORIES = [
  { value: 'general', label: 'General health' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'posture', label: 'Posture and movement' },
  { value: 'nutrition', label: 'Nutrition' },
  { value: 'mental_health', label: 'Mental health' },
  { value: 'cardiovascular', label: 'Cardiovascular' },
  { value: 'musculoskeletal', label: 'Musculoskeletal' },
  { value: 'occupational', label: 'Occupational' },
  { value: 'other', label: 'Other' },
] as const;

export const ANSWER_TYPES = [
  { value: 'scale', label: 'Scale (1-5)' },
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'number', label: 'Number' },
  { value: 'text', label: 'Free text' },
  { value: 'single_choice', label: 'Single choice' },
  { value: 'multi_choice', label: 'Multiple choice' },
  { value: 'date', label: 'Date' },
] as const;

export const RECORD_STATUSES = [
  { value: 'invited', label: 'Invited' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'actioned', label: 'Actioned' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export const RISK_BANDS = [
  { value: 'low', label: 'Low' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high', label: 'High' },
  { value: 'very_high', label: 'Very high' },
] as const;

export const screeningCategoryLabel = (value: string | null | undefined): string =>
  SCREENING_CATEGORIES.find((c) => c.value === value)?.label ?? 'Other';

export const recordStatusLabel = (value: string | null | undefined): string =>
  RECORD_STATUSES.find((s) => s.value === value)?.label ?? '—';

/** Templates and their questions. */
export function useScreeningTemplates() {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...SCREENING_TEMPLATES_KEY, companyId],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<ScreeningTemplate[]> => {
      const { data, error } = await supabase
        .from('med_screening_templates')
        .select('*')
        .eq('company_id', companyId as string)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: SCREENING_TEMPLATES_KEY });
    void queryClient.invalidateQueries({ queryKey: SCREENING_QUESTIONS_KEY });
  };

  const save = useMutation({
    mutationFn: async (values: Partial<ScreeningTemplate> & { name: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase
          .from('med_screening_templates')
          .update({ ...values, updated_by: user?.id ?? null })
          .eq('id', values.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('med_screening_templates').insert({
        ...values,
        company_id: companyId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      } as TablesInsert<'med_screening_templates'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Template saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const seedDefault = useMutation({
    mutationFn: async (): Promise<string> => {
      if (!companyId) throw new Error('No company on your profile');
      const { data, error } = await supabase.rpc('med_seed_screening_template', {
        p_company_id: companyId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      invalidate();
      toast({
        title: 'Default appraisal created',
        description: 'Edit the questions to match your programme.',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not create the template', description: error.message, variant: 'destructive' });
    },
  });

  const active = useMemo(() => (query.data ?? []).filter((t) => t.status === 'active'), [query.data]);

  return {
    ...query,
    templates: query.data ?? [],
    active,
    save,
    seedDefault,
    isMutating: save.isPending || seedDefault.isPending,
  };
}

export function useScreeningQuestions(templateId: string | null | undefined) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...SCREENING_QUESTIONS_KEY, templateId ?? null],
    enabled: Boolean(templateId),
    staleTime: 60_000,
    queryFn: async (): Promise<ScreeningQuestion[]> => {
      const { data, error } = await supabase
        .from('med_screening_questions')
        .select('*')
        .eq('template_id', templateId as string)
        .order('position');
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (values: Partial<ScreeningQuestion> & { prompt: string }) => {
      if (!companyId || !templateId) throw new Error('No template selected');
      if (values.id) {
        const { error } = await supabase.from('med_screening_questions').update(values).eq('id', values.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('med_screening_questions').insert({
        ...values,
        company_id: companyId,
        template_id: templateId,
      } as TablesInsert<'med_screening_questions'>);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SCREENING_QUESTIONS_KEY });
      toast({ title: 'Question saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('med_screening_questions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SCREENING_QUESTIONS_KEY });
      toast({ title: 'Question removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  const sections = useMemo(() => {
    const map = new Map<string, ScreeningQuestion[]>();
    for (const q of query.data ?? []) {
      map.set(q.section, [...(map.get(q.section) ?? []), q]);
    }
    return Array.from(map.entries());
  }, [query.data]);

  return {
    ...query,
    questions: query.data ?? [],
    sections,
    save,
    remove,
    isMutating: save.isPending || remove.isPending,
  };
}

export interface ScreeningRecordEntry extends ScreeningRecord {
  person_name: string | null;
  template_name: string | null;
  /** From the template, so the record is scored the way its author meant. */
  scoring_mode: string;
}

export function useScreeningRecords(options: { personId?: string | null; templateId?: string | null } = {}) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;
  const { personId, templateId } = options;

  const query = useQuery({
    queryKey: [...SCREENING_RECORDS_KEY, companyId, personId ?? 'all', templateId ?? 'all'],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async (): Promise<ScreeningRecordEntry[]> => {
      let request = supabase
        .from('med_screening_records')
        .select(
          '*, hw_people(first_name, last_name, preferred_name), med_screening_templates(name, scoring_mode)',
        )
        .eq('company_id', companyId as string)
        .order('due_on', { ascending: true, nullsFirst: false });
      if (personId) request = request.eq('person_id', personId);
      if (templateId) request = request.eq('template_id', templateId);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const typed = row as ScreeningRecord & {
          hw_people?: { first_name: string; last_name: string; preferred_name: string | null } | null;
          med_screening_templates?: { name: string; scoring_mode: string } | null;
        };
        const p = typed.hw_people;
        return {
          ...typed,
          person_name: p ? `${p.preferred_name ?? p.first_name} ${p.last_name}` : null,
          template_name: typed.med_screening_templates?.name ?? null,
          scoring_mode: typed.med_screening_templates?.scoring_mode ?? 'sum',
        };
      });
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: SCREENING_RECORDS_KEY });
  };

  const save = useMutation({
    mutationFn: async (values: Partial<ScreeningRecord> & { person_id?: string; template_id?: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase.from('med_screening_records').update(values).eq('id', values.id);
        if (error) throw error;
        return;
      }
      if (!values.person_id || !values.template_id) throw new Error('Person and template are required');
      const { error } = await supabase.from('med_screening_records').insert({
        ...values,
        company_id: companyId,
      } as TablesInsert<'med_screening_records'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Screening saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  /** Invite several people to the same screening in one go. */
  const invite = useMutation({
    mutationFn: async (input: { templateId: string; personIds: string[]; dueOn: string | null }) => {
      if (!companyId) throw new Error('No company on your profile');
      if (!input.personIds.length) throw new Error('Nobody selected');
      const today = new Date().toISOString().slice(0, 10);
      const rows: TablesInsert<'med_screening_records'>[] = input.personIds.map((personId) => ({
        company_id: companyId,
        template_id: input.templateId,
        person_id: personId,
        status: 'invited',
        invited_on: today,
        due_on: input.dueOn,
      }));
      const { error } = await supabase.from('med_screening_records').insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count) => {
      invalidate();
      toast({ title: `${count} ${count === 1 ? 'person' : 'people'} invited` });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not invite', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('med_screening_records').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Screening removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  const summary = useMemo(() => {
    const rows = query.data ?? [];
    return {
      total: rows.length,
      outstanding: rows.filter((r) => r.status === 'invited' || r.status === 'in_progress').length,
      awaitingReview: rows.filter((r) => r.status === 'submitted').length,
      highRisk: rows.filter((r) => r.risk_band === 'high' || r.risk_band === 'very_high').length,
    };
  }, [query.data]);

  return {
    ...query,
    records: query.data ?? [],
    summary,
    save,
    invite,
    remove,
    isMutating: save.isPending || invite.isPending || remove.isPending,
  };
}

/**
 * The answers to one screening, plus the scoring the template asks for.
 * Scoring is done here rather than in the database so a medic can see the
 * number move as they work through the form.
 */
export function useScreeningAnswers(recordId: string | null | undefined) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...SCREENING_ANSWERS_KEY, recordId ?? null],
    enabled: Boolean(recordId),
    staleTime: 15_000,
    queryFn: async (): Promise<ScreeningAnswer[]> => {
      const { data, error } = await supabase
        .from('med_screening_answers')
        .select('*')
        .eq('record_id', recordId as string);
      if (error) throw error;
      return data ?? [];
    },
  });

  const byQuestion = useMemo(() => {
    const map = new Map<string, ScreeningAnswer>();
    for (const a of query.data ?? []) map.set(a.question_id, a);
    return map;
  }, [query.data]);

  const saveAnswer = useMutation({
    mutationFn: async (values: Partial<ScreeningAnswer> & { question_id: string }) => {
      if (!companyId || !recordId) throw new Error('No screening selected');
      const { error } = await supabase.from('med_screening_answers').upsert(
        {
          ...values,
          company_id: companyId,
          record_id: recordId,
          answered_at: new Date().toISOString(),
        } as TablesInsert<'med_screening_answers'>,
        { onConflict: 'record_id,question_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SCREENING_ANSWERS_KEY });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save that answer', description: error.message, variant: 'destructive' });
    },
  });

  return { ...query, answers: query.data ?? [], byQuestion, saveAnswer, isMutating: saveAnswer.isPending };
}

/**
 * Scores a set of answers against its questions. `scale` and `number`
 * answers contribute value × weight; a `yes_no` answered yes contributes the
 * weight. Free text never scores.
 */
export function scoreScreening(
  questions: ScreeningQuestion[],
  answers: Map<string, ScreeningAnswer>,
  mode: string,
): { total: number; answered: number; flagged: number } {
  let total = 0;
  let answered = 0;
  let flagged = 0;

  for (const q of questions) {
    const a = answers.get(q.id);
    if (!a) continue;
    const hasValue =
      a.value_numeric !== null ||
      (a.value_text !== null && a.value_text !== '') ||
      a.value_options.length > 0 ||
      a.value_date !== null;
    if (hasValue) answered += 1;
    if (a.is_flagged) flagged += 1;

    if (q.answer_type === 'scale' || q.answer_type === 'number') {
      if (a.value_numeric !== null) total += a.value_numeric * q.weight;
    } else if (q.answer_type === 'yes_no') {
      if (a.value_numeric === 1) total += q.weight;
    }
  }

  if (mode === 'average' && answered > 0) {
    return { total: Math.round((total / answered) * 100) / 100, answered, flagged };
  }
  if (mode === 'none') return { total: 0, answered, flagged };
  return { total: Math.round(total * 100) / 100, answered, flagged };
}

/**
 * The band a total score falls in, using the default 0-15-30-45 thresholds.
 * An unscored template (`scoring_mode = 'none'`) has no band at all: banding
 * its zero as "low" would put a clinical judgement on the record that nobody
 * made.
 */
export const riskBandFor = (score: number, mode: string): string | null =>
  mode === 'none' ? null : riskBandForScore(score);

export const riskBandForScore = (score: number): string => {
  if (score <= 15) return 'low';
  if (score <= 30) return 'moderate';
  if (score <= 45) return 'high';
  return 'very_high';
};
