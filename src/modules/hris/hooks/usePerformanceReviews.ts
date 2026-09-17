import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { useToast } from '@/shared/hooks/use-toast';
import { removeCrewDocument, uploadCrewDocument } from '@/lib/storage/crewDocuments';
import {
  buildBulkDrafts,
  canTransition,
  computeOverallRating,
  filterReviews,
  missingRatings,
  parseRatings,
  personName,
  ratingsComplete,
  ratingsToJson,
  reviewAuditSnapshot,
  sortReviews,
  type BulkDraftOptions,
  type CompetencyRating,
  type CompetencyRow,
  type PerformanceReviewRow,
  type ReviewCycleRow,
  type ReviewFilters,
  type ReviewListItem,
} from '@/modules/hris/lib/reviews';

export type { CompetencyRow, PerformanceReviewRow, ReviewCycleRow } from '@/modules/hris/lib/reviews';
export type DueItemRow = Tables<'hr_performance_due_items'>;
export type DueItemType = 'review' | 'objective' | 'warning';

/** Profile columns joined onto a review for the subject and the reviewer. */
export interface ReviewPerson {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  rank: string | null;
  position: string | null;
  department: string | null;
  avatar_url: string | null;
}

/** A review with subject, reviewer, vessel and cycle joined in. */
export interface PerformanceReview extends ReviewListItem {
  subject: ReviewPerson | null;
  reviewer: ReviewPerson | null;
}

export const REVIEWS_KEY = ['hris', 'reviews'] as const;

const REVIEW_SELECT =
  '*, vessels(name), performance_review_cycles(name), subject:profiles!performance_reviews_profile_id_fkey(id, user_id, first_name, last_name, preferred_name, rank, position, department, avatar_url), reviewer:profiles!performance_reviews_reviewer_profile_id_fkey(id, user_id, first_name, last_name, preferred_name, rank, position, department, avatar_url)';

type RawReview = PerformanceReviewRow & {
  vessels: { name: string } | null;
  performance_review_cycles: { name: string } | null;
  subject: ReviewPerson | null;
  reviewer: ReviewPerson | null;
};

const shapeReview = (raw: unknown): PerformanceReview => {
  const { vessels, performance_review_cycles, subject, reviewer, ...rest } = raw as RawReview;
  return {
    ...rest,
    subject,
    reviewer,
    crew_name: personName(subject) || 'Unknown crew',
    reviewer_name: reviewer ? personName(reviewer) || null : null,
    vessel_name: vessels?.name ?? null,
    cycle_name: performance_review_cycles?.name ?? null,
  };
};

const shapeAll = (rows: unknown[] | null): PerformanceReview[] => sortReviews((rows ?? []).map(shapeReview));

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

/** Active competencies of the company's rating framework, in framework order. */
export function useCompetencies() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...REVIEWS_KEY, 'competencies', companyId],
    enabled: Boolean(companyId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CompetencyRow[]> => {
      const { data, error } = await supabase
        .from('performance_competencies')
        .select('*')
        .eq('company_id', companyId as string)
        .eq('is_active', true)
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
  return { ...query, competencies: query.data ?? [] };
}

/** Review cycles of the company, newest due date first. */
export function useReviewCycles() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...REVIEWS_KEY, 'cycles', companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<ReviewCycleRow[]> => {
      const { data, error } = await supabase
        .from('performance_review_cycles')
        .select('*')
        .eq('company_id', companyId as string)
        .order('due_date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const byId = useMemo(() => new Map((query.data ?? []).map((c) => [c.id, c])), [query.data]);
  return {
    ...query,
    cycles: query.data ?? [],
    openCycles: (query.data ?? []).filter((c) => c.status === 'open'),
    cycleName: (id: string | null | undefined) => (id ? byId.get(id)?.name ?? null : null),
  };
}

export type CyclePayload = Pick<TablesInsert<'performance_review_cycles'>, 'name' | 'review_type' | 'period_start' | 'period_end' | 'due_date' | 'vessel_id' | 'notes' | 'status'>;

export function useReviewCycleMutations() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const companyId = profile?.company_id ?? null;

  const invalidate = useCallback(() => void queryClient.invalidateQueries({ queryKey: [...REVIEWS_KEY, 'cycles'] }), [queryClient]);
  const fail = useCallback(
    (title: string) => (error: unknown) => toast({ title, description: error instanceof Error ? error.message : 'Unexpected error', variant: 'destructive' }),
    [toast],
  );

  const setStatus = useCallback(async (cycle: ReviewCycleRow, status: 'open' | 'closed' | 'draft'): Promise<ReviewCycleRow> => {
    const { data, error } = await supabase.from('performance_review_cycles').update({ status }).eq('id', cycle.id).select('*').single();
    if (error) throw error;
    return data;
  }, []);

  const create = useMutation({
    mutationFn: async (payload: CyclePayload): Promise<ReviewCycleRow> => {
      if (!companyId) throw new Error('No company on the current profile');
      const { data, error } = await supabase
        .from('performance_review_cycles')
        .insert({ ...payload, company_id: companyId, created_by: user?.id ?? null })
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Cycle created' });
    },
    onError: fail('Could not create cycle'),
  });

  const close = useMutation({
    mutationFn: (cycle: ReviewCycleRow) => setStatus(cycle, 'closed'),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Cycle closed' });
    },
    onError: fail('Could not close cycle'),
  });

  const reopen = useMutation({
    mutationFn: (cycle: ReviewCycleRow) => setStatus(cycle, 'open'),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Cycle reopened' });
    },
    onError: fail('Could not reopen cycle'),
  });

  return { create, close, reopen };
}

// ---------------------------------------------------------------------------
// Review lists
// ---------------------------------------------------------------------------

/** Every review the company has (HR viewers). Feeds the KPI tiles and the filtered table. */
export function useCompanyReviews() {
  const { profile } = useAuth();
  const access = useHrAccess();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...REVIEWS_KEY, 'company', companyId],
    enabled: Boolean(companyId) && !access.loading && access.canView,
    queryFn: async (): Promise<PerformanceReview[]> => {
      const { data, error } = await supabase.from('performance_reviews').select(REVIEW_SELECT).eq('company_id', companyId as string);
      if (error) throw error;
      return shapeAll(data);
    },
  });
  return { ...query, all: query.data ?? [] };
}

/** Company reviews filtered client-side (type, status, vessel, cycle, crew, search). */
export function useReviews(filters: ReviewFilters) {
  const company = useCompanyReviews();
  const reviews = useMemo(() => filterReviews(company.all, filters), [company.all, filters]);
  return { ...company, reviews };
}

/** Reviews for one crew member (profiles.id). RLS hides drafts from the subject. */
export function useCrewReviews(profileId: string | null) {
  const query = useQuery({
    queryKey: [...REVIEWS_KEY, 'crew', profileId],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<PerformanceReview[]> => {
      const { data, error } = await supabase.from('performance_reviews').select(REVIEW_SELECT).eq('profile_id', profileId as string);
      if (error) throw error;
      return shapeAll(data);
    },
  });
  return { ...query, reviews: query.data ?? [] };
}

/** The current user's own reviews (as the subject). */
export function useMyReviews() {
  const { profile } = useAuth();
  const result = useCrewReviews(profile?.id ?? null);
  const awaitingMe = useMemo(
    () => result.reviews.filter((r) => r.status === 'self_assessment' || r.status === 'awaiting_acknowledgement'),
    [result.reviews],
  );
  return { ...result, awaitingMe };
}

/** Reviews where the current user is the reviewer. */
export function useReviewsConducting() {
  const { profile } = useAuth();
  const myProfileId = profile?.id ?? null;
  const query = useQuery({
    queryKey: [...REVIEWS_KEY, 'conducting', myProfileId],
    enabled: Boolean(myProfileId),
    queryFn: async (): Promise<PerformanceReview[]> => {
      const { data, error } = await supabase.from('performance_reviews').select(REVIEW_SELECT).eq('reviewer_profile_id', myProfileId as string);
      if (error) throw error;
      return shapeAll(data);
    },
  });
  const awaiting = useMemo(() => (query.data ?? []).filter((r) => r.status === 'draft' || r.status === 'in_review'), [query.data]);
  return { ...query, reviews: query.data ?? [], awaiting };
}

/** Reviews the current user still has to write (reviewer = me, status draft or in review). */
export function useReviewsAwaitingMe() {
  const conducting = useReviewsConducting();
  return { ...conducting, reviews: conducting.awaiting };
}

/** One review with joins. */
export function useReview(id: string | null) {
  const query = useQuery({
    queryKey: [...REVIEWS_KEY, 'detail', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<PerformanceReview | null> => {
      const { data, error } = await supabase.from('performance_reviews').select(REVIEW_SELECT).eq('id', id as string).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      // Welfare notes live in a side table only HR editors and the reviewer can read;
      // for everyone else the query returns nothing and the field stays null.
      const { data: welfare } = await supabase
        .from('performance_review_welfare_notes')
        .select('notes')
        .eq('review_id', id as string)
        .maybeSingle();
      return shapeReview({ ...data, welfare_notes: welfare?.notes ?? null });
    },
  });
  return { ...query, review: query.data ?? null };
}

interface DueItemsOptions {
  itemTypes: DueItemType[];
  /** Only items due within this many days (overdue included). Omit for everything with a due date. */
  withinDays?: number;
}

/** Performance due dates from `hr_performance_due_items`, soonest first. */
export function useDueItems({ itemTypes, withinDays }: DueItemsOptions) {
  const { profile } = useAuth();
  const access = useHrAccess();
  const companyId = profile?.company_id ?? null;
  const typesKey = [...itemTypes].sort().join(',');
  const query = useQuery({
    queryKey: [...REVIEWS_KEY, 'due-items', companyId, typesKey, withinDays ?? 'all'],
    enabled: Boolean(companyId) && !access.loading && itemTypes.length > 0,
    queryFn: async (): Promise<DueItemRow[]> => {
      let q = supabase
        .from('hr_performance_due_items')
        .select('*')
        .eq('company_id', companyId as string)
        .in('item_type', itemTypes)
        .order('due_date', { ascending: true });
      if (withinDays !== undefined) q = q.lte('days_remaining', withinDays);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  return { ...query, items: query.data ?? [] };
}

// ---------------------------------------------------------------------------
// Evidence (read-only): drill performance ratings and open objectives
// ---------------------------------------------------------------------------

export interface DrillRatingEvidence {
  id: string;
  drill_id: string;
  drill_number: string;
  drill_name: string | null;
  date: string | null;
  vessel_id: string | null;
  performance_rating: number;
  station_assignment: string | null;
  comments: string | null;
}

export interface ObjectiveEvidence {
  id: string;
  title: string;
  status: string;
  progress_pct: number;
  target_date: string | null;
  category: string;
}

type RawDrillParticipant = {
  id: string;
  drill_id: string;
  performance_rating: number | null;
  station_assignment: string | null;
  comments: string | null;
  drills: {
    drill_number: string;
    drill_date_actual: string | null;
    drill_date_scheduled: string;
    vessel_id: string;
    drill_types: { drill_name: string } | null;
  } | null;
};

interface EvidenceArgs {
  /** Subject's profiles.user_id (drill participants are keyed on auth user). */
  userId: string | null | undefined;
  /** Subject's profiles.id. */
  profileId: string | null | undefined;
  periodStart: string | null | undefined;
  periodEnd: string | null | undefined;
}

export function useReviewEvidence({ userId, profileId, periodStart, periodEnd }: EvidenceArgs) {
  const drills = useQuery({
    queryKey: [...REVIEWS_KEY, 'evidence', 'drills', userId, periodStart ?? null, periodEnd ?? null],
    enabled: Boolean(userId),
    queryFn: async (): Promise<DrillRatingEvidence[]> => {
      const { data, error } = await supabase
        .from('drill_participants')
        .select('id, drill_id, performance_rating, station_assignment, comments, drills(drill_number, drill_date_actual, drill_date_scheduled, vessel_id, drill_types(drill_name))')
        .eq('user_id', userId as string)
        .not('performance_rating', 'is', null);
      if (error) throw error;
      const rows = ((data ?? []) as unknown as RawDrillParticipant[])
        .map<DrillRatingEvidence | null>((p) => {
          if (p.performance_rating === null) return null;
          const date = p.drills?.drill_date_actual ?? p.drills?.drill_date_scheduled ?? null;
          const day = date ? date.slice(0, 10) : null;
          if (periodStart && day && day < periodStart) return null;
          if (periodEnd && day && day > periodEnd) return null;
          return {
            id: p.id,
            drill_id: p.drill_id,
            drill_number: p.drills?.drill_number ?? '—',
            drill_name: p.drills?.drill_types?.drill_name ?? null,
            date,
            vessel_id: p.drills?.vessel_id ?? null,
            performance_rating: p.performance_rating,
            station_assignment: p.station_assignment,
            comments: p.comments,
          };
        })
        .filter((r): r is DrillRatingEvidence => r !== null);
      return rows.sort((a, b) => (a.date ?? '') < (b.date ?? '') ? 1 : -1);
    },
  });

  const objectives = useQuery({
    queryKey: [...REVIEWS_KEY, 'evidence', 'objectives', profileId],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<ObjectiveEvidence[]> => {
      const { data, error } = await supabase
        .from('crew_objectives')
        .select('id, title, status, progress_pct, target_date, category')
        .eq('profile_id', profileId as string)
        .in('status', ['not_started', 'in_progress'])
        .order('target_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const drillAverage = useMemo(() => {
    const rows = drills.data ?? [];
    if (!rows.length) return null;
    return Math.round((rows.reduce((s, r) => s + r.performance_rating, 0) / rows.length) * 10) / 10;
  }, [drills.data]);

  return { drills: drills.data ?? [], drillsLoading: drills.isLoading, drillAverage, objectives: objectives.data ?? [], objectivesLoading: objectives.isLoading };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export type ReviewCreatePayload = Omit<TablesInsert<'performance_reviews'>, 'company_id' | 'created_by' | 'updated_by' | 'id'>;

export interface CreateBulkArgs extends BulkDraftOptions {
  cycle: ReviewCycleRow;
  crewIds: string[];
}

export type ReviewPatch = TablesUpdate<'performance_reviews'> & { welfare_notes?: string | null };

export interface UpdateReviewArgs {
  review: PerformanceReviewRow;
  patch: ReviewPatch;
}

export interface SignAndSendArgs {
  review: PerformanceReviewRow;
  /** Reviewer ratings as shown in the grid (unsaved edits included). */
  ratings: CompetencyRating[];
  competencies: Pick<CompetencyRow, 'id' | 'name'>[];
  /** Any other unsaved edits (narrative, follow-up) to persist in the same write. */
  patch?: TablesUpdate<'performance_reviews'>;
}

export interface SelfAssessmentArgs {
  reviewId: string;
  selfRatings: CompetencyRating[];
  comments: string;
}

export interface AcknowledgeArgs {
  reviewId: string;
  comments?: string;
}

export interface UploadReviewDocumentArgs {
  review: PerformanceReviewRow;
  file: File;
  /** profiles.user_id when the crew member has a login, else profiles.id. */
  crewUserId: string;
}

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'SEND_SELF_ASSESSMENT' | 'START_REVIEW' | 'SIGN' | 'CANCEL' | 'SELF_ASSESSMENT_SUBMITTED' | 'ACKNOWLEDGED';

export function useReviewMutations() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const companyId = profile?.company_id ?? null;

  const audit = useCallback(
    async (action: AuditAction, entityId: string, oldValues: Partial<PerformanceReviewRow> | null, newValues: Partial<PerformanceReviewRow> | null) => {
      const { error } = await supabase.from('audit_logs').insert({
        entity_type: 'performance_review',
        entity_id: entityId,
        action,
        actor_user_id: user?.id ?? null,
        actor_email: user?.email ?? null,
        actor_role: profile?.role ?? null,
        old_values: oldValues ? reviewAuditSnapshot(oldValues) : null,
        new_values: newValues ? reviewAuditSnapshot(newValues) : null,
      });
      if (error) console.warn('performance_review audit log failed', error);
    },
    [profile?.role, user?.email, user?.id],
  );

  const invalidate = useCallback(() => void queryClient.invalidateQueries({ queryKey: REVIEWS_KEY }), [queryClient]);

  const fail = useCallback(
    (title: string) => (error: unknown) => toast({ title, description: error instanceof Error ? error.message : 'Unexpected error', variant: 'destructive' }),
    [toast],
  );

  const updateRow = useCallback(
    async (id: string, patch: ReviewPatch): Promise<PerformanceReviewRow> => {
      const { welfare_notes, ...rowPatch } = patch;
      const next = { ...rowPatch, updated_by: user?.id ?? null };
      // Keep the stored overall in step with the ratings.
      if (rowPatch.ratings !== undefined) next.overall_rating = computeOverallRating(parseRatings(rowPatch.ratings));
      const { data, error } = await supabase.from('performance_reviews').update(next).eq('id', id).select('*').single();
      if (error) throw error;
      if (welfare_notes !== undefined) {
        const { error: wErr } = await supabase
          .from('performance_review_welfare_notes')
          .upsert({ review_id: id, company_id: data.company_id, notes: welfare_notes, updated_by: user?.id ?? null, updated_at: new Date().toISOString() });
        if (wErr) throw wErr;
      }
      return { ...data, welfare_notes: welfare_notes ?? null };
    },
    [user?.id],
  );

  const create = useMutation({
    mutationFn: async (payload: ReviewCreatePayload): Promise<PerformanceReviewRow> => {
      if (!companyId) throw new Error('No company on the current profile');
      const { data, error } = await supabase
        .from('performance_reviews')
        .insert({ ...payload, company_id: companyId, created_by: user?.id ?? null, updated_by: user?.id ?? null })
        .select('*')
        .single();
      if (error) throw error;
      await audit('CREATE', data.id, null, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Review created', description: 'Saved as a draft. Send it for self-assessment or start the review when ready.' });
    },
    onError: fail('Could not create review'),
  });

  const createBulk = useMutation({
    mutationFn: async ({ cycle, crewIds, ...options }: CreateBulkArgs): Promise<PerformanceReviewRow[]> => {
      const drafts = buildBulkDrafts(cycle, crewIds, { createdBy: user?.id ?? null, ...options });
      if (!drafts.length) throw new Error('Select at least one crew member');
      const { data, error } = await supabase.from('performance_reviews').insert(drafts).select('*');
      if (error) throw error;
      await Promise.all((data ?? []).map((row) => audit('CREATE', row.id, null, row)));
      return data ?? [];
    },
    onSuccess: (rows) => {
      invalidate();
      toast({ title: `${rows.length} draft review${rows.length === 1 ? '' : 's'} created` });
    },
    onError: fail('Could not create reviews'),
  });

  const update = useMutation({
    mutationFn: async ({ review, patch }: UpdateReviewArgs): Promise<PerformanceReviewRow> => {
      const data = await updateRow(review.id, patch);
      await audit('UPDATE', review.id, review, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Review saved' });
    },
    onError: fail('Could not save review'),
  });

  const sendForSelfAssessment = useMutation({
    mutationFn: async (review: PerformanceReviewRow): Promise<PerformanceReviewRow> => {
      if (!canTransition(review.status, 'self_assessment')) throw new Error('This review cannot be sent for self-assessment from its current state');
      if (!review.reviewer_profile_id) throw new Error('Assign a reviewer before sending the review');
      const data = await updateRow(review.id, { status: 'self_assessment' });
      await audit('SEND_SELF_ASSESSMENT', review.id, review, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Sent for self-assessment', description: 'The crew member can now rate themselves.' });
    },
    onError: fail('Could not send for self-assessment'),
  });

  const startReview = useMutation({
    mutationFn: async (review: PerformanceReviewRow): Promise<PerformanceReviewRow> => {
      if (!canTransition(review.status, 'in_review')) throw new Error('This review cannot be started from its current state');
      if (!review.reviewer_profile_id) throw new Error('Assign a reviewer before starting the review');
      const data = await updateRow(review.id, { status: 'in_review' });
      await audit('START_REVIEW', review.id, review, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Review started' });
    },
    onError: fail('Could not start review'),
  });

  const signAndSend = useMutation({
    mutationFn: async ({ review, ratings, competencies, patch }: SignAndSendArgs): Promise<PerformanceReviewRow> => {
      if (!canTransition(review.status, 'awaiting_acknowledgement')) throw new Error('Start the review before signing it');
      if (!ratingsComplete(ratings, competencies)) {
        const missing = missingRatings(ratings, competencies).map((c) => c.name);
        throw new Error(`Rate every competency before signing. Missing: ${missing.join(', ')}`);
      }
      const now = new Date().toISOString();
      const data = await updateRow(review.id, {
        ...patch,
        ratings: ratingsToJson(ratings),
        status: 'awaiting_acknowledgement',
        reviewer_signed_at: now,
        submitted_at: review.submitted_at ?? now,
      });
      await audit('SIGN', review.id, review, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Signed and sent to crew', description: 'The crew member has been asked to acknowledge the review.' });
    },
    onError: fail('Could not sign review'),
  });

  const cancel = useMutation({
    mutationFn: async (review: PerformanceReviewRow): Promise<PerformanceReviewRow> => {
      if (!canTransition(review.status, 'cancelled')) throw new Error('This review can no longer be cancelled');
      const data = await updateRow(review.id, { status: 'cancelled' });
      await audit('CANCEL', review.id, review, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Review cancelled' });
    },
    onError: fail('Could not cancel review'),
  });

  const submitSelfAssessment = useMutation({
    mutationFn: async ({ reviewId, selfRatings, comments }: SelfAssessmentArgs): Promise<void> => {
      const { error } = await supabase.rpc('performance_review_submit_self_assessment', {
        p_review_id: reviewId,
        p_self_ratings: ratingsToJson(selfRatings),
        p_employee_comments: comments.trim() || null,
      });
      if (error) throw error;
      await audit('SELF_ASSESSMENT_SUBMITTED', reviewId, null, { status: 'in_review' });
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Self-assessment submitted', description: 'Your reviewer will complete the review next.' });
    },
    onError: fail('Could not submit self-assessment'),
  });

  const acknowledge = useMutation({
    mutationFn: async ({ reviewId, comments }: AcknowledgeArgs): Promise<void> => {
      const { error } = await supabase.rpc('performance_review_acknowledge', {
        p_review_id: reviewId,
        p_employee_comments: comments?.trim() || null,
      });
      if (error) throw error;
      await audit('ACKNOWLEDGED', reviewId, null, { status: 'completed' });
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Review acknowledged', description: 'Thank you — the review is now complete.' });
    },
    onError: fail('Could not acknowledge review'),
  });

  const uploadDocument = useMutation({
    mutationFn: async ({ review, file, crewUserId }: UploadReviewDocumentArgs): Promise<PerformanceReviewRow> => {
      if (!companyId) throw new Error('No company on the current profile');
      const uploaded = await uploadCrewDocument({ file, companyId, crewUserId, kind: 'evaluations' });
      const data = await updateRow(review.id, { document_path: uploaded.path });
      if (review.document_path && review.document_path !== uploaded.path) {
        await removeCrewDocument(review.document_path).catch((err: unknown) => console.warn('old review document not removed', err));
      }
      await audit('UPDATE', review.id, review, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Document attached', description: 'The review PDF has been filed with the crew member\'s records.' });
    },
    onError: fail('Could not attach document'),
  });

  const remove = useMutation({
    mutationFn: async (review: PerformanceReviewRow): Promise<void> => {
      if (review.status !== 'draft') throw new Error('Only draft reviews can be deleted; cancel it instead');
      const { error } = await supabase.from('performance_reviews').delete().eq('id', review.id);
      if (error) throw error;
      if (review.document_path) {
        await removeCrewDocument(review.document_path).catch((err: unknown) => console.warn('review document not removed', err));
      }
      await audit('DELETE', review.id, review, null);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Draft deleted' });
    },
    onError: fail('Could not delete review'),
  });

  return { create, createBulk, update, sendForSelfAssessment, startReview, signAndSend, cancel, submitSelfAssessment, acknowledge, uploadDocument, remove };
}
