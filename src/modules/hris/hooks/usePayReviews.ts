import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json, Tables, TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePayrollAccess } from '@/modules/auth/hooks/usePayrollAccess';
import { useToast } from '@/shared/hooks/use-toast';
import {
  filterReviews,
  sortReviewsNewestFirst,
  type PayReviewFilters,
  type PayReviewListItem,
  type PayReviewReason,
  type PayReviewRow,
} from '@/modules/hris/lib/payReviewHelpers';

export const PAY_REVIEWS_KEY = ['hris', 'pay-reviews'] as const;
export const COMPENSATION_KEY = ['hris', 'compensation'] as const;

export type CrewCompensationRow = Tables<'crew_compensation'>;

type ProfileJoin = {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  rank: string | null;
  department: string | null;
  avatar_url: string | null;
} | null;

const REVIEW_SELECT = '*, profiles!pay_reviews_profile_id_fkey(id, user_id, first_name, last_name, preferred_name, rank, department, avatar_url)';

const mapReview = (raw: unknown): PayReviewListItem => {
  const { profiles, ...rest } = raw as PayReviewRow & { profiles: ProfileJoin };
  const first = profiles?.preferred_name || profiles?.first_name || '';
  return {
    ...rest,
    crew_name: `${first} ${profiles?.last_name ?? ''}`.trim() || 'Unknown crew',
    crew_user_id: profiles?.user_id ?? null,
    rank: profiles?.rank ?? null,
    department: profiles?.department ?? null,
    avatar_url: profiles?.avatar_url ?? null,
  };
};

/** Company-wide reviews (filters applied client-side; the full list feeds the KPIs). */
export function useCompanyPayReviews(filters: PayReviewFilters) {
  const { profile } = useAuth();
  const access = usePayrollAccess();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...PAY_REVIEWS_KEY, 'company', companyId],
    enabled: Boolean(companyId) && !access.loading && access.canView,
    queryFn: async (): Promise<PayReviewListItem[]> => {
      const { data, error } = await supabase
        .from('pay_reviews')
        .select(REVIEW_SELECT)
        .eq('company_id', companyId as string)
        .order('review_date', { ascending: false });
      if (error) throw error;
      return sortReviewsNewestFirst((data ?? []).map(mapReview));
    },
  });
  const all = useMemo(() => query.data ?? [], [query.data]);
  const reviews = useMemo(() => filterReviews(all, filters), [all, filters]);
  return { ...query, all, reviews };
}

/** Reviews for one crew member (profiles.id), newest first. */
export function useCrewPayReviews(profileId: string | null) {
  const access = usePayrollAccess();
  const query = useQuery({
    queryKey: [...PAY_REVIEWS_KEY, 'crew', profileId],
    enabled: Boolean(profileId) && !access.loading && access.canView,
    queryFn: async (): Promise<PayReviewListItem[]> => {
      const { data, error } = await supabase.from('pay_reviews').select(REVIEW_SELECT).eq('profile_id', profileId as string);
      if (error) throw error;
      return sortReviewsNewestFirst((data ?? []).map(mapReview));
    },
  });
  return { ...query, reviews: query.data ?? [] };
}

/** The crew member's active compensation row (base, currency, effective from). */
export function useActiveCompensation(profileId: string | null) {
  const query = useQuery({
    queryKey: [...COMPENSATION_KEY, 'active', profileId],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<CrewCompensationRow | null> => {
      const { data, error } = await supabase
        .from('crew_compensation')
        .select('*')
        .eq('profile_id', profileId as string)
        .eq('status', 'active')
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  return { ...query, compensation: query.data ?? null };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface PayReviewPayload {
  review_date: string;
  effective_date: string;
  currency: string;
  previous_base_minor: number;
  proposed_base_minor: number;
  reason: PayReviewReason;
  justification: string | null;
  comparator_notes: string | null;
  notes?: string | null;
}

export interface CreateReviewArgs {
  profileId: string;
  previousCompensationId: string | null;
  payload: PayReviewPayload;
}

export interface UpdateReviewArgs {
  review: PayReviewRow;
  payload: Partial<PayReviewPayload>;
}

const snapshot = (r: Partial<PayReviewRow>): Json => ({
  status: r.status ?? null,
  currency: r.currency ?? null,
  previous_base_minor: r.previous_base_minor ?? null,
  proposed_base_minor: r.proposed_base_minor ?? null,
  effective_date: r.effective_date ?? null,
  reason: r.reason ?? null,
  new_compensation_id: r.new_compensation_id ?? null,
});

export function usePayReviewMutations() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const companyId = profile?.company_id ?? null;

  const audit = useCallback(
    async (action: string, entityId: string, oldValues: Partial<PayReviewRow> | null, newValues: Partial<PayReviewRow> | null) => {
      const { error } = await supabase.from('audit_logs').insert({
        entity_type: 'pay_review',
        entity_id: entityId,
        action,
        actor_user_id: user?.id ?? null,
        actor_email: user?.email ?? null,
        actor_role: profile?.role ?? null,
        old_values: oldValues ? snapshot(oldValues) : null,
        new_values: newValues ? snapshot(newValues) : null,
      });
      if (error) console.warn('pay_review audit log failed', error);
    },
    [profile?.role, user?.email, user?.id],
  );

  const invalidate = useCallback(
    (withCompensation = false) => {
      void queryClient.invalidateQueries({ queryKey: PAY_REVIEWS_KEY });
      if (withCompensation) void queryClient.invalidateQueries({ queryKey: COMPENSATION_KEY });
    },
    [queryClient],
  );

  const fail = useCallback(
    (title: string) => (error: unknown) => {
      toast({ title, description: error instanceof Error ? error.message : 'Unexpected error', variant: 'destructive' });
    },
    [toast],
  );

  const updateRow = useCallback(async (id: string, patch: TablesUpdate<'pay_reviews'>): Promise<PayReviewRow> => {
    const { data, error } = await supabase.from('pay_reviews').update(patch).eq('id', id).select('*').single();
    if (error) throw error;
    return data;
  }, []);

  const create = useMutation({
    mutationFn: async ({ profileId, previousCompensationId, payload }: CreateReviewArgs): Promise<PayReviewRow> => {
      if (!companyId) throw new Error('No company on the current profile');
      const { data, error } = await supabase
        .from('pay_reviews')
        .insert({
          ...payload,
          company_id: companyId,
          profile_id: profileId,
          previous_compensation_id: previousCompensationId,
          status: 'proposed',
          proposed_by: user?.id ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      await audit('CREATE', data.id, null, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Pay review proposed', description: 'It is now waiting for approval.' });
    },
    onError: fail('Could not create pay review'),
  });

  const update = useMutation({
    mutationFn: async ({ review, payload }: UpdateReviewArgs): Promise<PayReviewRow> => {
      const data = await updateRow(review.id, payload);
      await audit('UPDATE', review.id, review, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Pay review updated' });
    },
    onError: fail('Could not update pay review'),
  });

  const approve = useMutation({
    mutationFn: async (review: PayReviewRow): Promise<PayReviewRow> => {
      const data = await updateRow(review.id, { status: 'approved', approved_by: user?.id ?? null, approved_at: new Date().toISOString() });
      await audit('APPROVE', review.id, review, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Pay review approved', description: 'Apply it to create the new compensation record.' });
    },
    onError: fail('Could not approve pay review'),
  });

  const reject = useMutation({
    mutationFn: async ({ review, reason }: { review: PayReviewRow; reason: string | null }): Promise<PayReviewRow> => {
      const notes = reason ? `${review.notes ? `${review.notes}\n` : ''}Rejected: ${reason}` : review.notes;
      const data = await updateRow(review.id, { status: 'rejected', approved_by: null, approved_at: null, notes });
      await audit('REJECT', review.id, review, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Pay review rejected' });
    },
    onError: fail('Could not reject pay review'),
  });

  const apply = useMutation({
    mutationFn: async (review: PayReviewRow): Promise<string> => {
      const { data, error } = await supabase.rpc('pay_review_apply', { p_review_id: review.id });
      if (error) throw error;
      await audit('APPLY', review.id, review, { ...review, status: 'applied', new_compensation_id: data });
      return data;
    },
    onSuccess: () => {
      invalidate(true);
      toast({ title: 'Pay review applied', description: 'A new active compensation record has been created.' });
    },
    onError: fail('Could not apply pay review'),
  });

  const remove = useMutation({
    mutationFn: async (review: PayReviewRow): Promise<void> => {
      if (review.status === 'applied') throw new Error('Applied reviews cannot be deleted');
      const { error } = await supabase.from('pay_reviews').delete().eq('id', review.id);
      if (error) throw error;
      await audit('DELETE', review.id, review, null);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Pay review deleted' });
    },
    onError: fail('Could not delete pay review'),
  });

  return { create, update, approve, reject, apply, remove };
}
