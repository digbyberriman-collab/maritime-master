import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useToast } from '@/shared/hooks/use-toast';

export type Consultation = Tables<'med_consultations'>;

export interface ConsultationEntry extends Consultation {
  person_name: string | null;
  practitioner_name: string | null;
  vessel_name: string | null;
}

export const CONSULTATIONS_KEY = ['health', 'consultations'] as const;

export const CONSULTATION_TYPES = [
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'screening', label: 'Screening' },
  { value: 'telemedicine', label: 'Telemedicine' },
] as const;

export const CONSULTATION_OUTCOMES = [
  { value: 'resolved', label: 'Resolved' },
  { value: 'monitoring', label: 'Monitoring' },
  { value: 'referred_physio', label: 'Referred to physio' },
  { value: 'referred_shoreside', label: 'Referred shoreside' },
  { value: 'referred_specialist', label: 'Referred to specialist' },
  { value: 'medevac', label: 'Medevac' },
  { value: 'hospitalised', label: 'Hospitalised' },
  { value: 'deceased', label: 'Deceased' },
  { value: 'other', label: 'Other' },
] as const;

export const FIT_FOR_DUTY = [
  { value: 'fit', label: 'Fit for duty' },
  { value: 'light_duties', label: 'Light duties' },
  { value: 'unfit', label: 'Unfit' },
] as const;

export const outcomeLabel = (value: string | null | undefined): string =>
  CONSULTATION_OUTCOMES.find((o) => o.value === value)?.label ?? '—';

export const consultationTypeLabel = (value: string | null | undefined): string =>
  CONSULTATION_TYPES.find((t) => t.value === value)?.label ?? '—';

/** Outcomes that mean the case left the vessel. */
export const ESCALATED_OUTCOMES = ['medevac', 'hospitalised', 'referred_shoreside', 'referred_specialist'];

interface Options {
  personId?: string | null;
  /** Limit to consultations on or after this date (ISO). */
  since?: string | null;
  limit?: number;
}

/**
 * The treatment and consultation log. Every clinical contact on board, with
 * observations, treatment, outcome and whether the person was fit to work
 * afterwards.
 */
export function useConsultations({ personId, since, limit = 200 }: Options = {}) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...CONSULTATIONS_KEY, personId ?? 'all', companyId, since ?? null, limit],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async (): Promise<ConsultationEntry[]> => {
      let request = supabase
        .from('med_consultations')
        .select('*, hw_people(first_name, last_name, preferred_name), hw_practitioners(full_name), vessels(name)')
        .eq('company_id', companyId as string)
        .order('occurred_at', { ascending: false })
        .limit(limit);
      if (personId) request = request.eq('person_id', personId);
      if (since) request = request.gte('occurred_at', since);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const typed = row as Consultation & {
          hw_people?: { first_name: string; last_name: string; preferred_name: string | null } | null;
          hw_practitioners?: { full_name: string } | null;
          vessels?: { name: string } | null;
        };
        const p = typed.hw_people;
        return {
          ...typed,
          person_name: p ? `${p.preferred_name ?? p.first_name} ${p.last_name}` : null,
          practitioner_name: typed.hw_practitioners?.full_name ?? null,
          vessel_name: typed.vessels?.name ?? null,
        };
      });
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: CONSULTATIONS_KEY });
  };

  const save = useMutation({
    mutationFn: async (values: Partial<Consultation> & { person_id?: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase
          .from('med_consultations')
          .update({ ...values, updated_by: user?.id ?? null })
          .eq('id', values.id);
        if (error) throw error;
        return;
      }
      const target = values.person_id ?? personId;
      if (!target) throw new Error('No person selected');
      // consultation_number is filled by a database trigger.
      const { error } = await supabase.from('med_consultations').insert({
        ...values,
        person_id: target,
        company_id: companyId,
        consultation_number: '',
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      } as TablesInsert<'med_consultations'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Consultation recorded' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('med_consultations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Consultation removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  return {
    ...query,
    consultations: query.data ?? [],
    save,
    remove,
    isMutating: save.isPending || remove.isPending,
  };
}
