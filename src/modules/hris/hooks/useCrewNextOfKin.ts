import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { useToast } from '@/shared/hooks/use-toast';

export type NextOfKin = Tables<'crew_next_of_kin'>;

export const NEXT_OF_KIN_RELATIONSHIPS = ['Spouse/Partner', 'Parent', 'Child', 'Sibling', 'Friend', 'Other'] as const;

/** Values collected by the form; the hook adds ids, actors and timestamps. */
export interface NextOfKinFormData {
  full_name: string;
  relationship: string;
  phone_primary: string | null;
  phone_secondary: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  language: string | null;
  is_primary: boolean;
  is_emergency_contact: boolean;
  notes: string | null;
  /** GDPR: the contact has agreed to their details being held. */
  consent: boolean;
}

export const NEXT_OF_KIN_KEY = ['hris', 'next-of-kin'] as const;
export const NEXT_OF_KIN_COVERAGE_KEY = ['hris', 'next-of-kin', 'coverage'] as const;

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

const auditSnapshot = (row: Partial<NextOfKin>) => ({
  full_name: row.full_name ?? null,
  relationship: row.relationship ?? null,
  phone_primary: row.phone_primary ?? null,
  email: row.email ?? null,
  is_primary: row.is_primary ?? null,
  is_emergency_contact: row.is_emergency_contact ?? null,
});

const emptyToNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
};

const toColumns = (values: NextOfKinFormData, existingConsentAt: string | null) => ({
  full_name: values.full_name.trim(),
  relationship: values.relationship.trim(),
  phone_primary: emptyToNull(values.phone_primary),
  phone_secondary: emptyToNull(values.phone_secondary),
  email: emptyToNull(values.email),
  address_line1: emptyToNull(values.address_line1),
  address_line2: emptyToNull(values.address_line2),
  city: emptyToNull(values.city),
  postal_code: emptyToNull(values.postal_code),
  country: emptyToNull(values.country),
  language: emptyToNull(values.language),
  is_primary: values.is_primary,
  is_emergency_contact: values.is_emergency_contact,
  notes: emptyToNull(values.notes),
  consent_obtained_at: values.consent ? existingConsentAt ?? new Date().toISOString() : null,
});

/**
 * Next of kin / emergency contacts for one crew member, keyed on
 * `profiles.id` so imported crew without a login are covered. Writes are
 * audited to `audit_logs` with entity_type `crew_next_of_kin`; the primary
 * contact is mirrored to `profiles.emergency_contact_*` by a DB trigger.
 */
export function useCrewNextOfKin(profileId: string | null | undefined) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...NEXT_OF_KIN_KEY, profileId ?? null],
    enabled: Boolean(profileId),
    staleTime: 30_000,
    queryFn: async (): Promise<NextOfKin[]> => {
      const { data, error } = await supabase
        .from('crew_next_of_kin')
        .select('*')
        .eq('profile_id', profileId as string)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const contacts = useMemo(() => query.data ?? [], [query.data]);
  const primary = useMemo(() => contacts.find((c) => c.is_primary) ?? null, [contacts]);
  const others = useMemo(() => contacts.filter((c) => !c.is_primary), [contacts]);

  const writeAudit = async (action: AuditAction, entityId: string, oldValues: Partial<NextOfKin> | null, newValues: Partial<NextOfKin> | null) => {
    try {
      const { error } = await supabase.from('audit_logs').insert({
        entity_type: 'crew_next_of_kin',
        entity_id: entityId,
        action,
        actor_user_id: user?.id ?? null,
        actor_email: user?.email ?? null,
        actor_role: profile?.role ?? null,
        old_values: oldValues ? auditSnapshot(oldValues) : null,
        new_values: newValues ? auditSnapshot(newValues) : null,
      });
      if (error) throw error;
    } catch (err) {
      // The record write already succeeded; do not fail the user's action over the log.
      console.warn('[crew_next_of_kin] audit log insert failed', err);
    }
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [...NEXT_OF_KIN_KEY, profileId ?? null] });
    queryClient.invalidateQueries({ queryKey: [...NEXT_OF_KIN_COVERAGE_KEY, companyId] });
  };

  /** Clears the primary flag on every other contact so the partial unique index is satisfied. */
  const demoteOthers = async (exceptId: string | null) => {
    let q = supabase.from('crew_next_of_kin').update({ is_primary: false, updated_by: user?.id ?? null }).eq('profile_id', profileId as string).eq('is_primary', true);
    if (exceptId) q = q.neq('id', exceptId);
    const { error } = await q;
    if (error) throw error;
  };

  const createContact = useMutation({
    mutationFn: async (values: NextOfKinFormData): Promise<NextOfKin> => {
      if (!profileId || !companyId) throw new Error('No crew member selected');
      const makePrimary = values.is_primary || contacts.length === 0;
      if (makePrimary) await demoteOthers(null);
      const insert: TablesInsert<'crew_next_of_kin'> = {
        ...toColumns({ ...values, is_primary: makePrimary }, null),
        company_id: companyId,
        profile_id: profileId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      };
      const { data, error } = await supabase.from('crew_next_of_kin').insert(insert).select('*').single();
      if (error) throw error;
      await writeAudit('CREATE', data.id, null, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Contact added', description: 'Next of kin details saved.' });
    },
    onError: (error: Error) => toast({ title: 'Could not add contact', description: error.message, variant: 'destructive' }),
  });

  const updateContact = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: NextOfKinFormData }): Promise<NextOfKin> => {
      const existing = contacts.find((c) => c.id === id) ?? null;
      if (values.is_primary) await demoteOthers(id);
      const { data, error } = await supabase
        .from('crew_next_of_kin')
        .update({ ...toColumns(values, existing?.consent_obtained_at ?? null), updated_by: user?.id ?? null })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      await writeAudit('UPDATE', id, existing, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Contact updated' });
    },
    onError: (error: Error) => toast({ title: 'Could not update contact', description: error.message, variant: 'destructive' }),
  });

  const deleteContact = useMutation({
    mutationFn: async (contact: NextOfKin): Promise<void> => {
      const { error } = await supabase.from('crew_next_of_kin').delete().eq('id', contact.id);
      if (error) throw error;
      await writeAudit('DELETE', contact.id, contact, null);
      // Keep someone as primary so the ICE view and the profile mirror stay useful.
      if (contact.is_primary) {
        const next = contacts.filter((c) => c.id !== contact.id).sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
        if (next) {
          const { error: promoteError } = await supabase
            .from('crew_next_of_kin')
            .update({ is_primary: true, updated_by: user?.id ?? null })
            .eq('id', next.id);
          if (promoteError) throw promoteError;
        }
      }
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Contact removed' });
    },
    onError: (error: Error) => toast({ title: 'Could not remove contact', description: error.message, variant: 'destructive' }),
  });

  const setPrimary = useMutation({
    mutationFn: async (contact: NextOfKin): Promise<void> => {
      await demoteOthers(contact.id);
      const { error } = await supabase
        .from('crew_next_of_kin')
        .update({ is_primary: true, updated_by: user?.id ?? null })
        .eq('id', contact.id);
      if (error) throw error;
      await writeAudit('UPDATE', contact.id, contact, { ...contact, is_primary: true });
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Primary contact updated' });
    },
    onError: (error: Error) => toast({ title: 'Could not set primary contact', description: error.message, variant: 'destructive' }),
  });

  return {
    ...query,
    contacts,
    primary,
    others,
    createContact,
    updateContact,
    deleteContact,
    setPrimary,
    isMutating: createContact.isPending || updateContact.isPending || deleteContact.isPending || setPrimary.isPending,
  };
}

/**
 * Set of `profiles.id` in the company that have at least one next-of-kin
 * row. HR uses it to chase crew with nobody recorded.
 */
export function useNextOfKinCoverage() {
  const { profile } = useAuth();
  const access = useHrAccess();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...NEXT_OF_KIN_COVERAGE_KEY, companyId],
    enabled: Boolean(companyId) && !access.loading && access.canView,
    staleTime: 60_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('crew_next_of_kin')
        .select('profile_id')
        .eq('company_id', companyId as string);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.profile_id));
    },
  });

  return { ...query, coveredProfileIds: query.data ?? new Set<string>() };
}
