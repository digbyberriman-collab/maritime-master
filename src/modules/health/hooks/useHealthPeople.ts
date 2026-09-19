import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useToast } from '@/shared/hooks/use-toast';

export type HealthPerson = Tables<'hw_people'>;

export interface HealthPersonEntry extends HealthPerson {
  fullName: string;
  displayName: string;
  vessel_name: string | null;
  /** Non-crew subjects (guests, owner's party) have no profile. */
  isCrew: boolean;
}

export const HEALTH_PEOPLE_KEY = ['health', 'people'] as const;

export const PERSON_TYPES = [
  { value: 'crew', label: 'Crew' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'shoreside', label: 'Shoreside' },
  { value: 'guest', label: 'Guest' },
  { value: 'owner', label: "Owner's party" },
  { value: 'family', label: 'Family' },
  { value: 'visitor', label: 'Visitor' },
  { value: 'other', label: 'Other' },
] as const;

export const personTypeLabel = (value: string | null | undefined): string =>
  PERSON_TYPES.find((t) => t.value === value)?.label ?? 'Other';

const decorate = (
  row: HealthPerson & { vessels?: { name: string } | null },
): HealthPersonEntry => {
  const fullName = `${row.first_name} ${row.last_name}`.trim();
  return {
    ...row,
    fullName,
    displayName: row.preferred_name ? `${row.preferred_name} ${row.last_name}` : fullName,
    vessel_name: row.vessels?.name ?? null,
    isCrew: Boolean(row.profile_id),
  };
};

/**
 * The health subject directory: every person the section can treat, train or
 * book. Crew rows are kept in step with `profiles` by a database trigger;
 * guests and the owner's party exist only here, because they must never get
 * a login.
 */
export function useHealthPeople(options: { includeInactive?: boolean } = {}) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...HEALTH_PEOPLE_KEY, companyId],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<HealthPersonEntry[]> => {
      const { data, error } = await supabase
        .from('hw_people')
        .select('*, vessels(name)')
        .eq('company_id', companyId as string)
        .order('last_name')
        .order('first_name');
      if (error) throw error;
      return (data ?? []).map((row) => decorate(row as never));
    },
  });

  const entries = useMemo(() => {
    const all = query.data ?? [];
    return options.includeInactive ? all : all.filter((p) => p.is_active);
  }, [query.data, options.includeInactive]);

  return { ...query, entries, all: query.data ?? [] };
}

export interface HealthPersonFormData {
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  person_type: string;
  date_of_birth: string | null;
  gender: string | null;
  nationality: string | null;
  email: string | null;
  phone: string | null;
  vessel_id: string | null;
  cabin: string | null;
  language: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  consent_share_safety_flags: boolean;
  arrived_on: string | null;
  departed_on: string | null;
  is_active: boolean;
  notes: string | null;
}

export const emptyPersonForm = (): HealthPersonFormData => ({
  first_name: '',
  last_name: '',
  preferred_name: null,
  person_type: 'guest',
  date_of_birth: null,
  gender: null,
  nationality: null,
  email: null,
  phone: null,
  vessel_id: null,
  cabin: null,
  language: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  consent_share_safety_flags: true,
  arrived_on: null,
  departed_on: null,
  is_active: true,
  notes: null,
});

const blankToNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
};

/** Create and update non-crew subjects. Crew rows come from `profiles`. */
export function useHealthPersonMutations() {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: HEALTH_PEOPLE_KEY });
  };

  const toColumns = (values: HealthPersonFormData) => ({
    first_name: values.first_name.trim(),
    last_name: values.last_name.trim(),
    preferred_name: blankToNull(values.preferred_name),
    person_type: values.person_type,
    date_of_birth: values.date_of_birth || null,
    gender: blankToNull(values.gender),
    nationality: blankToNull(values.nationality),
    email: blankToNull(values.email),
    phone: blankToNull(values.phone),
    vessel_id: values.vessel_id || null,
    cabin: blankToNull(values.cabin),
    language: blankToNull(values.language),
    emergency_contact_name: blankToNull(values.emergency_contact_name),
    emergency_contact_phone: blankToNull(values.emergency_contact_phone),
    consent_share_safety_flags: values.consent_share_safety_flags,
    arrived_on: values.arrived_on || null,
    departed_on: values.departed_on || null,
    is_active: values.is_active,
    notes: blankToNull(values.notes),
  });

  const createPerson = useMutation({
    mutationFn: async (values: HealthPersonFormData): Promise<HealthPerson> => {
      if (!companyId) throw new Error('No company on your profile');
      const payload: TablesInsert<'hw_people'> = {
        ...toColumns(values),
        company_id: companyId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      };
      const { data, error } = await supabase.from('hw_people').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      invalidate();
      toast({ title: 'Person added', description: `${row.first_name} ${row.last_name} can now be booked and treated.` });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not add that person', description: error.message, variant: 'destructive' });
    },
  });

  const updatePerson = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: HealthPersonFormData }) => {
      const { error } = await supabase
        .from('hw_people')
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

  return {
    createPerson,
    updatePerson,
    isMutating: createPerson.isPending || updatePerson.isPending,
  };
}
