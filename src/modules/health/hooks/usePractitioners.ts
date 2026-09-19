import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useToast } from '@/shared/hooks/use-toast';

export type Practitioner = Tables<'hw_practitioners'>;
export type PractitionerQualification = Tables<'hw_practitioner_qualifications'>;

export interface PractitionerEntry extends Practitioner {
  vessel_name: string | null;
  qualificationCount: number;
  expiringQualifications: number;
}

export const PRACTITIONERS_KEY = ['health', 'practitioners'] as const;
export const PRACTITIONER_QUALS_KEY = ['health', 'practitioner-qualifications'] as const;

export const DISCIPLINES = [
  { value: 'medical', label: 'Medical' },
  { value: 'physio', label: 'Physiotherapy' },
  { value: 'spa', label: 'Spa' },
  { value: 'nutrition', label: 'Nutrition' },
  { value: 'pt', label: 'Personal training' },
] as const;

export const SENIORITIES = [
  { value: 'lead', label: 'Lead' },
  { value: 'senior', label: 'Senior' },
  { value: 'practitioner', label: 'Practitioner' },
  { value: 'assistant', label: 'Assistant' },
  { value: 'trainee', label: 'Trainee' },
] as const;

export const disciplineLabel = (value: string | null | undefined): string =>
  DISCIPLINES.find((d) => d.value === value)?.label ?? 'Other';

const daysUntil = (date: string | null): number | null => {
  if (!date) return null;
  const ms = new Date(`${date}T00:00:00Z`).getTime() - new Date().setUTCHours(0, 0, 0, 0);
  return Math.round(ms / 86_400_000);
};

/**
 * The practitioner roster. One row per person per discipline: this is what
 * grants a ship's medic clinical access and a trainer programme-editing
 * rights, so it is also the table HR maintains when someone joins or leaves.
 */
export function usePractitioners(discipline?: string) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...PRACTITIONERS_KEY, companyId, discipline ?? 'all'],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<PractitionerEntry[]> => {
      let request = supabase
        .from('hw_practitioners')
        .select('*, vessels(name), hw_practitioner_qualifications(id, expiry_date)')
        .eq('company_id', companyId as string)
        .order('full_name');
      if (discipline) request = request.eq('discipline', discipline);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const typed = row as Practitioner & {
          vessels?: { name: string } | null;
          hw_practitioner_qualifications?: { id: string; expiry_date: string | null }[];
        };
        const quals = typed.hw_practitioner_qualifications ?? [];
        return {
          ...typed,
          vessel_name: typed.vessels?.name ?? null,
          qualificationCount: quals.length,
          expiringQualifications: quals.filter((q) => {
            const days = daysUntil(q.expiry_date);
            return days !== null && days <= 90;
          }).length,
        };
      });
    },
  });

  const active = useMemo(() => (query.data ?? []).filter((p) => p.is_active), [query.data]);

  return { ...query, practitioners: query.data ?? [], active };
}

export interface PractitionerFormData {
  profile_id: string | null;
  discipline: string;
  full_name: string;
  role_title: string | null;
  seniority: string | null;
  rank_code: string | null;
  vessel_id: string | null;
  email: string | null;
  phone: string | null;
  specialisms: string[];
  bio: string | null;
  license_number: string | null;
  license_authority: string | null;
  license_expiry: string | null;
  started_on: string | null;
  ended_on: string | null;
  is_active: boolean;
  notes: string | null;
}

export const emptyPractitionerForm = (discipline = 'medical'): PractitionerFormData => ({
  profile_id: null,
  discipline,
  full_name: '',
  role_title: null,
  seniority: 'practitioner',
  rank_code: null,
  vessel_id: null,
  email: null,
  phone: null,
  specialisms: [],
  bio: null,
  license_number: null,
  license_authority: null,
  license_expiry: null,
  started_on: null,
  ended_on: null,
  is_active: true,
  notes: null,
});

const blankToNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
};

export function usePractitionerMutations() {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: PRACTITIONERS_KEY });
    void queryClient.invalidateQueries({ queryKey: PRACTITIONER_QUALS_KEY });
  };

  const toColumns = (values: PractitionerFormData) => ({
    profile_id: values.profile_id || null,
    discipline: values.discipline,
    full_name: values.full_name.trim(),
    role_title: blankToNull(values.role_title),
    seniority: values.seniority || null,
    rank_code: blankToNull(values.rank_code),
    vessel_id: values.vessel_id || null,
    email: blankToNull(values.email),
    phone: blankToNull(values.phone),
    specialisms: values.specialisms,
    bio: blankToNull(values.bio),
    license_number: blankToNull(values.license_number),
    license_authority: blankToNull(values.license_authority),
    license_expiry: values.license_expiry || null,
    started_on: values.started_on || null,
    ended_on: values.ended_on || null,
    is_active: values.is_active,
    notes: blankToNull(values.notes),
  });

  const createPractitioner = useMutation({
    mutationFn: async (values: PractitionerFormData) => {
      if (!companyId) throw new Error('No company on your profile');
      const payload: TablesInsert<'hw_practitioners'> = {
        ...toColumns(values),
        company_id: companyId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      };
      const { data, error } = await supabase.from('hw_practitioners').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      invalidate();
      toast({
        title: 'Added to the roster',
        description: row.profile_id
          ? `${row.full_name} now has ${row.discipline === 'medical' ? 'clinical' : 'wellness'} access.`
          : `${row.full_name} added. Link a crew profile to grant them access.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not add', description: error.message, variant: 'destructive' });
    },
  });

  const updatePractitioner = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: PractitionerFormData }) => {
      const { error } = await supabase
        .from('hw_practitioners')
        .update({ ...toColumns(values), updated_by: user?.id ?? null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const deletePractitioner = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('hw_practitioners').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Removed from the roster' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  return {
    createPractitioner,
    updatePractitioner,
    deletePractitioner,
    isMutating:
      createPractitioner.isPending || updatePractitioner.isPending || deletePractitioner.isPending,
  };
}

/** Qualifications held by one practitioner. */
export function usePractitionerQualifications(practitionerId: string | null | undefined) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...PRACTITIONER_QUALS_KEY, practitionerId ?? null],
    enabled: Boolean(practitionerId),
    staleTime: 30_000,
    queryFn: async (): Promise<PractitionerQualification[]> => {
      const { data, error } = await supabase
        .from('hw_practitioner_qualifications')
        .select('*')
        .eq('practitioner_id', practitionerId as string)
        .order('expiry_date', { nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const saveQualification = useMutation({
    mutationFn: async (values: Partial<PractitionerQualification> & { name: string }) => {
      if (!companyId || !practitionerId) throw new Error('No practitioner selected');
      if (values.id) {
        const { error } = await supabase
          .from('hw_practitioner_qualifications')
          .update({ ...values, verified_by: user?.id ?? null })
          .eq('id', values.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('hw_practitioner_qualifications').insert({
        ...values,
        company_id: companyId,
        practitioner_id: practitionerId,
      } as TablesInsert<'hw_practitioner_qualifications'>);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRACTITIONER_QUALS_KEY });
      void queryClient.invalidateQueries({ queryKey: PRACTITIONERS_KEY });
      toast({ title: 'Qualification saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const deleteQualification = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('hw_practitioner_qualifications').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRACTITIONER_QUALS_KEY });
      void queryClient.invalidateQueries({ queryKey: PRACTITIONERS_KEY });
      toast({ title: 'Qualification removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  return {
    ...query,
    qualifications: query.data ?? [],
    saveQualification,
    deleteQualification,
    isMutating: saveQualification.isPending || deleteQualification.isPending,
  };
}
