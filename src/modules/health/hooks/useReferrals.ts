import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useToast } from '@/shared/hooks/use-toast';

export type Referral = Tables<'hw_referrals'>;

/**
 * Mirrors `hw_referrals_clinical_notes_clinical_only`: clinical background may
 * only travel between clinical disciplines, because RLS cannot mask a column
 * and the whole row reaches whoever sits at either end of the referral.
 */
const CLINICAL_FROM = ['medical', 'physio'];
const CLINICAL_TO = ['medical', 'physio', 'specialist', 'shoreside'];
export const clinicalReferral = (from?: string | null, to?: string | null) =>
  !!from && !!to && CLINICAL_FROM.includes(from) && CLINICAL_TO.includes(to);
export type ExpiryItem = Tables<'hw_expiry_items'>;

export interface ReferralEntry extends Referral {
  person_name: string | null;
  practitioner_name: string | null;
}

export const REFERRALS_KEY = ['health', 'referrals'] as const;
export const EXPIRY_ITEMS_KEY = ['health', 'expiry-items'] as const;

export const FROM_DISCIPLINES = [
  { value: 'medical', label: 'Medical' },
  { value: 'physio', label: 'Physiotherapy' },
  { value: 'pt', label: 'Personal training' },
  { value: 'nutrition', label: 'Nutrition' },
  { value: 'spa', label: 'Spa' },
  { value: 'hr', label: 'HR' },
  { value: 'self', label: 'Self-referral' },
] as const;

export const TO_DISCIPLINES = [
  { value: 'medical', label: 'Medical' },
  { value: 'physio', label: 'Physiotherapy' },
  { value: 'pt', label: 'Personal training' },
  { value: 'nutrition', label: 'Nutrition' },
  { value: 'spa', label: 'Spa' },
  { value: 'shoreside', label: 'Shoreside clinic' },
  { value: 'specialist', label: 'Specialist' },
] as const;

export const URGENCIES = [
  { value: 'routine', label: 'Routine' },
  { value: 'soon', label: 'Soon' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'emergency', label: 'Emergency' },
] as const;

export const REFERRAL_STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export const disciplineName = (value: string | null | undefined): string =>
  [...FROM_DISCIPLINES, ...TO_DISCIPLINES].find((d) => d.value === value)?.label ?? '—';

export const referralStatusLabel = (value: string | null | undefined): string =>
  REFERRAL_STATUSES.find((s) => s.value === value)?.label ?? '—';

/**
 * Referrals between disciplines: medic to physio, physio to trainer, trainer
 * back to the medic. Row access follows the two disciplines named on the
 * referral, so a physio sees what was sent to them without gaining clinical
 * access to everything else.
 */
export function useReferrals(options: { personId?: string | null; toDiscipline?: string | null; openOnly?: boolean } = {}) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;
  const { personId, toDiscipline, openOnly } = options;

  const query = useQuery({
    queryKey: [...REFERRALS_KEY, companyId, personId ?? 'all', toDiscipline ?? 'all', Boolean(openOnly)],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async (): Promise<ReferralEntry[]> => {
      let request = supabase
        .from('hw_referrals')
        .select('*, hw_people(first_name, last_name, preferred_name), hw_practitioners(full_name)')
        .eq('company_id', companyId as string)
        .order('created_at', { ascending: false });
      if (personId) request = request.eq('person_id', personId);
      if (toDiscipline) request = request.eq('to_discipline', toDiscipline);
      if (openOnly) request = request.in('status', ['open', 'accepted']);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const typed = row as Referral & {
          hw_people?: { first_name: string; last_name: string; preferred_name: string | null } | null;
          hw_practitioners?: { full_name: string } | null;
        };
        const p = typed.hw_people;
        return {
          ...typed,
          person_name: p ? `${p.preferred_name ?? p.first_name} ${p.last_name}` : null,
          practitioner_name: typed.hw_practitioners?.full_name ?? null,
        };
      });
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: REFERRALS_KEY });
  };

  const save = useMutation({
    mutationFn: async (values: Partial<Referral> & { person_id?: string; reason?: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      // The row is readable by the practitioner at either end, so the database
      // only accepts clinical notes when both ends are clinical. Mirror that
      // here rather than letting a constraint violation reach the user.
      const scrubbed = { ...values };
      if (scrubbed.clinical_notes && !clinicalReferral(scrubbed.from_discipline, scrubbed.to_discipline)) {
        scrubbed.clinical_notes = null;
      }
      if (scrubbed.id) {
        const { error } = await supabase.from('hw_referrals').update(scrubbed).eq('id', scrubbed.id);
        if (error) throw error;
        return;
      }
      const target = scrubbed.person_id ?? personId;
      if (!target) throw new Error('No person selected');
      const { error } = await supabase.from('hw_referrals').insert({
        ...scrubbed,
        person_id: target,
        company_id: companyId,
        referred_by: user?.id ?? null,
      } as TablesInsert<'hw_referrals'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Referral saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const respond = useMutation({
    mutationFn: async (input: { id: string; status: string; response_notes?: string | null; outcome?: string | null }) => {
      const now = new Date().toISOString();
      // Only the fields the responder actually supplied are written, so
      // re-responding to a referral does not wipe the notes or the outcome it
      // already carries. completed_at is stamped on completion and cleared
      // only when the referral leaves the completed state.
      const patch: Record<string, unknown> = { status: input.status, responded_at: now };
      if (input.response_notes !== undefined) patch.response_notes = input.response_notes ?? null;
      if (input.outcome !== undefined) patch.outcome = input.outcome ?? null;
      patch.completed_at = input.status === 'completed' ? now : null;
      const { error } = await supabase.from('hw_referrals').update(patch).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Referral updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not update', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('hw_referrals').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Referral removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  const summary = useMemo(() => {
    const rows = query.data ?? [];
    return {
      total: rows.length,
      open: rows.filter((r) => r.status === 'open').length,
      urgent: rows.filter((r) => (r.urgency === 'urgent' || r.urgency === 'emergency') && r.status === 'open').length,
      completed: rows.filter((r) => r.status === 'completed').length,
    };
  }, [query.data]);

  return {
    ...query,
    referrals: query.data ?? [],
    summary,
    save,
    respond,
    remove,
    isMutating: save.isPending || respond.isPending || remove.isPending,
  };
}

/**
 * Every upcoming health date in one list, from the `hw_expiry_items` view:
 * fitness certificates, vaccinations, practitioner licences, medical stores,
 * equipment and kit checks, protocol reviews and outstanding screenings.
 */
export function useHealthExpiryItems(withinDays = 90) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...EXPIRY_ITEMS_KEY, companyId, withinDays],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<ExpiryItem[]> => {
      const { data, error } = await supabase
        .from('hw_expiry_items')
        .select('*')
        .eq('company_id', companyId as string)
        .lte('days_remaining', withinDays)
        .order('days_remaining', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const grouped = useMemo(() => {
    const rows = query.data ?? [];
    const map = new Map<string, ExpiryItem[]>();
    for (const row of rows) {
      const key = row.item_type ?? 'other';
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return map;
  }, [query.data]);

  const summary = useMemo(() => {
    const rows = query.data ?? [];
    return {
      total: rows.length,
      overdue: rows.filter((r) => (r.days_remaining ?? 0) < 0).length,
      within30: rows.filter((r) => (r.days_remaining ?? 0) >= 0 && (r.days_remaining ?? 0) <= 30).length,
    };
  }, [query.data]);

  return { ...query, items: query.data ?? [], grouped, summary };
}
