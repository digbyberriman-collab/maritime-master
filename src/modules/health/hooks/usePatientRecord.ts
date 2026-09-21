import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useToast } from '@/shared/hooks/use-toast';

export type PatientRecord = Tables<'med_patient_records'>;
export type Allergy = Tables<'med_allergies'>;

/** Clinical order for `med_allergies.severity`; anything unknown sorts last. */
const SEVERITY_ORDER = ['mild', 'moderate', 'severe', 'anaphylaxis'];
const severityRank = (value: string | null | undefined) =>
  SEVERITY_ORDER.indexOf(String(value ?? '').toLowerCase());
export type Condition = Tables<'med_conditions'>;
export type Medication = Tables<'med_medications'>;
export type Vaccination = Tables<'med_vaccinations'>;

export const PATIENT_RECORD_KEY = ['health', 'patient-record'] as const;
export const ALLERGIES_KEY = ['health', 'allergies'] as const;
export const CONDITIONS_KEY = ['health', 'conditions'] as const;
export const MEDICATIONS_KEY = ['health', 'medications'] as const;
export const VACCINATIONS_KEY = ['health', 'vaccinations'] as const;

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'] as const;

export const ALLERGY_TYPES = [
  { value: 'food', label: 'Food' },
  { value: 'drug', label: 'Drug' },
  { value: 'environmental', label: 'Environmental' },
  { value: 'insect', label: 'Insect sting' },
  { value: 'latex', label: 'Latex' },
  { value: 'other', label: 'Other' },
] as const;

export const ALLERGY_SEVERITIES = [
  { value: 'mild', label: 'Mild' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'severe', label: 'Severe' },
  { value: 'anaphylaxis', label: 'Anaphylaxis' },
] as const;

export const CONDITION_CATEGORIES = [
  { value: 'cardiac', label: 'Cardiac' },
  { value: 'respiratory', label: 'Respiratory' },
  { value: 'musculoskeletal', label: 'Musculoskeletal' },
  { value: 'neurological', label: 'Neurological' },
  { value: 'endocrine', label: 'Endocrine' },
  { value: 'mental_health', label: 'Mental health' },
  { value: 'dermatological', label: 'Dermatological' },
  { value: 'gastrointestinal', label: 'Gastrointestinal' },
  { value: 'other', label: 'Other' },
] as const;

export const MEDICATION_ROUTES = [
  { value: 'oral', label: 'Oral' },
  { value: 'topical', label: 'Topical' },
  { value: 'injection', label: 'Injection' },
  { value: 'inhaled', label: 'Inhaled' },
  { value: 'nasal', label: 'Nasal' },
  { value: 'rectal', label: 'Rectal' },
  { value: 'ophthalmic', label: 'Ophthalmic' },
  { value: 'other', label: 'Other' },
] as const;

/**
 * Vaccinations a yacht typically requires or recommends. Used to prompt for
 * what is missing rather than to enforce anything: the requirement depends
 * on flag, trading area and the owner's itinerary.
 */
export const COMMON_VACCINES = [
  'Yellow fever',
  'Hepatitis A',
  'Hepatitis B',
  'Tetanus / diphtheria',
  'Typhoid',
  'Polio',
  'Rabies',
  'Japanese encephalitis',
  'Meningococcal ACWY',
  'Cholera',
  'Measles, mumps and rubella',
  'Influenza',
  'COVID-19',
] as const;

const useCompanyId = () => {
  const { profile } = useAuth();
  return profile?.company_id ?? null;
};

/** The clinical summary for one subject: blood group, history, alerts. */
export function usePatientRecord(personId: string | null | undefined) {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...PATIENT_RECORD_KEY, personId ?? null],
    enabled: Boolean(personId),
    staleTime: 30_000,
    queryFn: async (): Promise<PatientRecord | null> => {
      const { data, error } = await supabase
        .from('med_patient_records')
        .select('*')
        .eq('person_id', personId as string)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  const save = useMutation({
    mutationFn: async (values: TablesUpdate<'med_patient_records'>) => {
      if (!companyId || !personId) throw new Error('No person selected');
      const existing = query.data;
      if (existing) {
        const { error } = await supabase
          .from('med_patient_records')
          .update({ ...values, updated_by: user?.id ?? null })
          .eq('id', existing.id);
        if (error) throw error;
        return;
      }
      const payload: TablesInsert<'med_patient_records'> = {
        ...values,
        company_id: companyId,
        person_id: personId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      };
      const { error } = await supabase.from('med_patient_records').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PATIENT_RECORD_KEY });
      toast({ title: 'Medical record saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  return { ...query, record: query.data ?? null, save, isMutating: save.isPending };
}

interface ListOptions {
  /** Omit the person to read the whole company (for company-wide screens). */
  personId?: string | null;
  activeOnly?: boolean;
}

/** Allergies. Wellness staff can read these when the subject consents. */
export function useAllergies({ personId, activeOnly = false }: ListOptions = {}) {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...ALLERGIES_KEY, personId ?? 'all', companyId, activeOnly],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async (): Promise<Allergy[]> => {
      let request = supabase
        .from('med_allergies')
        .select('*')
        .eq('company_id', companyId as string)
        .order('allergen');
      if (personId) request = request.eq('person_id', personId);
      if (activeOnly) request = request.eq('is_active', true);
      const { data, error } = await request;
      if (error) throw error;
      // severity is a text column, so ordering it in the database is
      // alphabetical and puts anaphylaxis below mild. This is a safety list
      // read by the galley and the spa: the worst has to be at the top.
      return [...(data ?? [])].sort(
        (a, b) => severityRank(b.severity) - severityRank(a.severity) || a.allergen.localeCompare(b.allergen),
      );
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ALLERGIES_KEY });
  };

  const save = useMutation({
    mutationFn: async (values: Partial<Allergy> & { allergen: string; person_id?: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase
          .from('med_allergies')
          .update({ ...values, updated_by: user?.id ?? null })
          .eq('id', values.id);
        if (error) throw error;
        return;
      }
      const target = values.person_id ?? personId;
      if (!target) throw new Error('No person selected');
      const { error } = await supabase.from('med_allergies').insert({
        ...values,
        person_id: target,
        company_id: companyId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      } as TablesInsert<'med_allergies'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Allergy saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('med_allergies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Allergy removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  return {
    ...query,
    allergies: query.data ?? [],
    save,
    remove,
    isMutating: save.isPending || remove.isPending,
  };
}

/** Long-term conditions. */
export function useConditions({ personId, activeOnly = false }: ListOptions = {}) {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...CONDITIONS_KEY, personId ?? 'all', companyId, activeOnly],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async (): Promise<Condition[]> => {
      let request = supabase
        .from('med_conditions')
        .select('*')
        .eq('company_id', companyId as string)
        .order('diagnosed_on', { ascending: false, nullsFirst: false });
      if (personId) request = request.eq('person_id', personId);
      if (activeOnly) request = request.in('status', ['active', 'managed']);
      const { data, error } = await request;
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: CONDITIONS_KEY });
  };

  const save = useMutation({
    mutationFn: async (values: Partial<Condition> & { condition_name: string; person_id?: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase
          .from('med_conditions')
          .update({ ...values, updated_by: user?.id ?? null })
          .eq('id', values.id);
        if (error) throw error;
        return;
      }
      const target = values.person_id ?? personId;
      if (!target) throw new Error('No person selected');
      const { error } = await supabase.from('med_conditions').insert({
        ...values,
        person_id: target,
        company_id: companyId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      } as TablesInsert<'med_conditions'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Condition saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('med_conditions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Condition removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  return {
    ...query,
    conditions: query.data ?? [],
    save,
    remove,
    isMutating: save.isPending || remove.isPending,
  };
}

/** Regular and short-course medication. */
export function useMedications({ personId, activeOnly = false }: ListOptions = {}) {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...MEDICATIONS_KEY, personId ?? 'all', companyId, activeOnly],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async (): Promise<Medication[]> => {
      let request = supabase
        .from('med_medications')
        .select('*')
        .eq('company_id', companyId as string)
        .order('is_active', { ascending: false })
        .order('medication_name');
      if (personId) request = request.eq('person_id', personId);
      if (activeOnly) request = request.eq('is_active', true);
      const { data, error } = await request;
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: MEDICATIONS_KEY });
  };

  const save = useMutation({
    mutationFn: async (values: Partial<Medication> & { medication_name: string; person_id?: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase
          .from('med_medications')
          .update({ ...values, updated_by: user?.id ?? null })
          .eq('id', values.id);
        if (error) throw error;
        return;
      }
      const target = values.person_id ?? personId;
      if (!target) throw new Error('No person selected');
      const { error } = await supabase.from('med_medications').insert({
        ...values,
        person_id: target,
        company_id: companyId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      } as TablesInsert<'med_medications'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Medication saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('med_medications').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Medication removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  return {
    ...query,
    medications: query.data ?? [],
    save,
    remove,
    isMutating: save.isPending || remove.isPending,
  };
}

/** Vaccinations and immunisations. */
export function useVaccinations({ personId }: ListOptions = {}) {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...VACCINATIONS_KEY, personId ?? 'all', companyId],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async (): Promise<Vaccination[]> => {
      let request = supabase
        .from('med_vaccinations')
        .select('*')
        .eq('company_id', companyId as string)
        .order('administered_on', { ascending: false, nullsFirst: false });
      if (personId) request = request.eq('person_id', personId);
      const { data, error } = await request;
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: VACCINATIONS_KEY });
  };

  const save = useMutation({
    mutationFn: async (values: Partial<Vaccination> & { vaccine: string; person_id?: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase
          .from('med_vaccinations')
          .update({ ...values, updated_by: user?.id ?? null })
          .eq('id', values.id);
        if (error) throw error;
        return;
      }
      const target = values.person_id ?? personId;
      if (!target) throw new Error('No person selected');
      const { error } = await supabase.from('med_vaccinations').insert({
        ...values,
        person_id: target,
        company_id: companyId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      } as TablesInsert<'med_vaccinations'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Vaccination saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('med_vaccinations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Vaccination removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  return {
    ...query,
    vaccinations: query.data ?? [],
    save,
    remove,
    isMutating: save.isPending || remove.isPending,
  };
}
