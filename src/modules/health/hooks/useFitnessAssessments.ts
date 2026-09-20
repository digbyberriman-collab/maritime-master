import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useToast } from '@/shared/hooks/use-toast';
import { fitnessStateOf, type FitnessState } from '@/modules/health/lib/format';

export type FitnessAssessment = Tables<'med_fitness_assessments'>;
export type FitnessStatusRow = Tables<'hw_fitness_status'>;

export const FITNESS_KEY = ['health', 'fitness-assessments'] as const;
export const FITNESS_STATUS_KEY = ['health', 'fitness-status'] as const;

export const ASSESSMENT_TYPES = [
  { value: 'eng1', label: 'ENG1' },
  { value: 'ml5', label: 'ML5' },
  { value: 'company', label: 'Company medical' },
  { value: 'return_to_work', label: 'Return to work' },
  { value: 'pre_employment', label: 'Pre-employment' },
  { value: 'periodic', label: 'Periodic' },
  { value: 'other', label: 'Other' },
] as const;

export const FITNESS_STATUSES = [
  { value: 'fit', label: 'Fit for duty' },
  { value: 'fit_with_restrictions', label: 'Fit with restrictions' },
  { value: 'temporarily_unfit', label: 'Temporarily unfit' },
  { value: 'unfit', label: 'Unfit' },
  { value: 'pending', label: 'Pending' },
  { value: 'expired', label: 'Expired' },
] as const;

export const assessmentTypeLabel = (value: string | null | undefined): string =>
  ASSESSMENT_TYPES.find((t) => t.value === value)?.label ?? (value ?? '—').toUpperCase();

export const fitnessStatusLabel = (value: string | null | undefined): string =>
  FITNESS_STATUSES.find((s) => s.value === value)?.label ?? '—';

/**
 * Fitness to work. Deliberately not clinical: this is the table captains and
 * HR read to know whether someone can legally sail, so it carries status,
 * restrictions and dates and nothing more.
 */
export function useFitnessAssessments(personId?: string | null) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...FITNESS_KEY, personId ?? 'all', companyId],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async (): Promise<FitnessAssessment[]> => {
      let request = supabase
        .from('med_fitness_assessments')
        .select('*')
        .eq('company_id', companyId as string)
        .order('issued_on', { ascending: false, nullsFirst: false });
      if (personId) request = request.eq('person_id', personId);
      const { data, error } = await request;
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: FITNESS_KEY });
    void queryClient.invalidateQueries({ queryKey: FITNESS_STATUS_KEY });
  };

  const save = useMutation({
    mutationFn: async (values: Partial<FitnessAssessment> & { person_id?: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase
          .from('med_fitness_assessments')
          .update({ ...values, updated_by: user?.id ?? null })
          .eq('id', values.id);
        if (error) throw error;
        return;
      }
      const target = values.person_id ?? personId;
      if (!target) throw new Error('No person selected');
      const { error } = await supabase.from('med_fitness_assessments').insert({
        ...values,
        person_id: target,
        company_id: companyId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      } as TablesInsert<'med_fitness_assessments'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({
        title: 'Fitness record saved',
        description: 'The crew list and certificate alerts have been updated.',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('med_fitness_assessments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Fitness record removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  const current = useMemo(() => {
    const rows = query.data ?? [];
    if (!personId) return null;
    return rows[0] ?? null;
  }, [query.data, personId]);

  return {
    ...query,
    assessments: query.data ?? [],
    current,
    save,
    remove,
    isMutating: save.isPending || remove.isPending,
  };
}

export interface FitnessStatusEntry extends FitnessStatusRow {
  state: FitnessState;
}

/**
 * One row per person with their current certificate, from the
 * `hw_fitness_status` view. This is what the bridge and HR see.
 */
export function useFitnessStatus() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...FITNESS_STATUS_KEY, companyId],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<FitnessStatusEntry[]> => {
      const { data, error } = await supabase
        .from('hw_fitness_status')
        .select('*')
        .eq('company_id', companyId as string);
      if (error) throw error;
      return (data ?? []).map((row) => ({ ...row, state: fitnessStateOf(row.fitness_state) }));
    },
  });

  const summary = useMemo(() => {
    const rows = query.data ?? [];
    const count = (state: FitnessState) => rows.filter((r) => r.state === state).length;
    return {
      total: rows.length,
      valid: count('valid'),
      restricted: count('restricted'),
      expiring: count('expiring'),
      expired: count('expired'),
      unfit: count('unfit'),
      unknown: count('unknown'),
      /** Anyone who should not be sailing, or should be watched. */
      needsAttention: count('expired') + count('unfit') + count('expiring'),
    };
  }, [query.data]);

  return { ...query, rows: query.data ?? [], summary };
}
