import { differenceInCalendarDays, isValid, parseISO } from 'date-fns';
import type { Json, Tables, TablesInsert } from '@/integrations/supabase/types';

/**
 * Pure helpers for the Performance Reviews area. No React, no Supabase
 * client — everything here is unit-testable and shared by the hooks, the
 * detail view and the PDF export.
 */

export type PerformanceReviewRow = Tables<'performance_reviews'>;
export type ReviewCycleRow = Tables<'performance_review_cycles'>;
export type CompetencyRow = Tables<'performance_competencies'>;

export type ReviewType = 'annual_evaluation' | 'annual_review' | 'end_of_rotation' | 'probation' | 'ad_hoc';
export type ReviewStatus = 'draft' | 'self_assessment' | 'in_review' | 'awaiting_acknowledgement' | 'completed' | 'cancelled';
export type CycleStatus = 'draft' | 'open' | 'closed';
export type FollowUpOwner = 'reviewer' | 'employee' | 'hr';

export interface ReviewTypeMeta {
  value: ReviewType;
  label: string;
  /** Page title when this type is the route's default. */
  pageTitle: string;
  description: string;
}

export const REVIEW_TYPES: ReviewTypeMeta[] = [
  {
    value: 'annual_evaluation',
    label: 'Annual evaluation',
    pageTitle: 'Annual Evaluations',
    description: 'Formal yearly competency evaluation with self-assessment and sign-off.',
  },
  {
    value: 'annual_review',
    label: 'Annual review',
    pageTitle: 'Annual Reviews',
    description: 'Yearly career and development conversation.',
  },
  {
    value: 'end_of_rotation',
    label: 'End of rotation',
    pageTitle: 'End of Rotation Catch-ups',
    description: 'Short catch-up at the end of each rotation.',
  },
  {
    value: 'probation',
    label: 'Probation review',
    pageTitle: 'Probation Reviews',
    description: 'Review before the probation period ends.',
  },
  {
    value: 'ad_hoc',
    label: 'Ad hoc review',
    pageTitle: 'Ad hoc Reviews',
    description: 'Any other review outside the regular cadence.',
  },
];

export const REVIEW_TYPE_VALUES = REVIEW_TYPES.map((t) => t.value) as ReviewType[];

export const REVIEW_TYPE_LABEL: Record<ReviewType, string> = Object.fromEntries(REVIEW_TYPES.map((t) => [t.value, t.label])) as Record<
  ReviewType,
  string
>;

export const isReviewType = (value: string | null | undefined): value is ReviewType =>
  Boolean(value) && REVIEW_TYPE_VALUES.includes(value as ReviewType);

export const reviewTypeLabel = (value: string | null | undefined): string =>
  isReviewType(value) ? REVIEW_TYPE_LABEL[value] : value ? value.replace(/_/g, ' ') : 'Review';

/** Route segment → default review type. Unknown paths fall back to the annual evaluation. */
export const reviewTypeFromPath = (pathname: string): ReviewType => {
  const last = pathname.replace(/\/+$/, '').split('/').pop() ?? '';
  if (last === 'annual-reviews') return 'annual_review';
  if (last === 'end-of-rotation') return 'end_of_rotation';
  return 'annual_evaluation';
};

export const pageTitleForType = (type: ReviewType | 'all'): string =>
  type === 'all' ? 'Performance Reviews' : REVIEW_TYPES.find((t) => t.value === type)?.pageTitle ?? 'Performance Reviews';

// ---------------------------------------------------------------------------
// Statuses & transitions
// ---------------------------------------------------------------------------

export const REVIEW_STATUSES: ReviewStatus[] = ['draft', 'self_assessment', 'in_review', 'awaiting_acknowledgement', 'completed', 'cancelled'];

/** The linear happy path shown in the status stepper. */
export const REVIEW_STEPS: ReviewStatus[] = ['draft', 'self_assessment', 'in_review', 'awaiting_acknowledgement', 'completed'];

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  draft: 'Draft',
  self_assessment: 'Self-assessment',
  in_review: 'In review',
  awaiting_acknowledgement: 'Awaiting acknowledgement',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const isReviewStatus = (value: string | null | undefined): value is ReviewStatus =>
  Boolean(value) && REVIEW_STATUSES.includes(value as ReviewStatus);

export const statusLabel = (value: string | null | undefined): string => (isReviewStatus(value) ? STATUS_LABEL[value] : value ?? '—');

export type StatusTone = 'muted' | 'info' | 'warning' | 'success' | 'destructive';

export const statusTone = (status: string | null | undefined): StatusTone => {
  switch (status) {
    case 'self_assessment':
    case 'in_review':
      return 'info';
    case 'awaiting_acknowledgement':
      return 'warning';
    case 'completed':
      return 'success';
    case 'cancelled':
      return 'destructive';
    default:
      return 'muted';
  }
};

export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  muted: 'bg-muted text-muted-foreground border-border',
  info: 'bg-primary/10 text-primary border-primary/20',
  warning: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  success: 'bg-green-500/10 text-green-600 border-green-500/20',
  destructive: 'bg-destructive/10 text-destructive border-destructive/20',
};

/** Allowed status transitions (initiated from the UI). */
export const NEXT_STATUS: Record<ReviewStatus, ReviewStatus[]> = {
  draft: ['self_assessment', 'in_review', 'cancelled'],
  self_assessment: ['in_review', 'cancelled'],
  in_review: ['awaiting_acknowledgement', 'cancelled'],
  awaiting_acknowledgement: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export const canTransition = (from: string | null | undefined, to: ReviewStatus): boolean =>
  isReviewStatus(from) && NEXT_STATUS[from].includes(to);

export const isTerminalStatus = (status: string | null | undefined): boolean => status === 'completed' || status === 'cancelled';

/** Index of a status on the stepper; cancelled reviews sit on the step they were cancelled from (unknown → 0). */
export const stepIndex = (status: string | null | undefined): number => {
  const idx = REVIEW_STEPS.indexOf(status as ReviewStatus);
  return idx === -1 ? 0 : idx;
};

/** Reviewer-side fields are editable in these states. */
export const reviewerCanEditIn = (status: string | null | undefined): boolean =>
  status === 'draft' || status === 'self_assessment' || status === 'in_review';

// ---------------------------------------------------------------------------
// Ratings
// ---------------------------------------------------------------------------

export interface CompetencyRating {
  competency_id: string;
  name: string;
  /** 1–5, or null while unrated. */
  rating: number | null;
  comment: string;
}

export interface FollowUpAction {
  action: string;
  owner: FollowUpOwner;
  due_date: string | null;
  done: boolean;
}

export const FOLLOW_UP_OWNERS: { value: FollowUpOwner; label: string }[] = [
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'employee', label: 'Crew member' },
  { value: 'hr', label: 'HR' },
];

export const RATING_SCALE: { value: number; label: string }[] = [
  { value: 1, label: 'Unsatisfactory' },
  { value: 2, label: 'Needs improvement' },
  { value: 3, label: 'Meets expectations' },
  { value: 4, label: 'Exceeds expectations' },
  { value: 5, label: 'Outstanding' },
];

export const ratingLabel = (rating: number | null | undefined): string => {
  if (rating === null || rating === undefined) return 'Not rated';
  const rounded = Math.round(rating);
  return RATING_SCALE.find((r) => r.value === rounded)?.label ?? 'Not rated';
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const toRating = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  if (n < 1 || n > 5) return null;
  return n;
};

/** Defensive parse of the `ratings` / `self_ratings` jsonb column. */
export const parseRatings = (json: Json | null | undefined): CompetencyRating[] => {
  if (!Array.isArray(json)) return [];
  const out: CompetencyRating[] = [];
  for (const item of json) {
    if (!isRecord(item)) continue;
    const competency_id = typeof item.competency_id === 'string' ? item.competency_id : null;
    if (!competency_id) continue;
    out.push({
      competency_id,
      name: typeof item.name === 'string' ? item.name : '',
      rating: toRating(item.rating),
      comment: typeof item.comment === 'string' ? item.comment : '',
    });
  }
  return out;
};

/** Defensive parse of the `follow_up_actions` jsonb column. */
export const parseFollowUps = (json: Json | null | undefined): FollowUpAction[] => {
  if (!Array.isArray(json)) return [];
  const out: FollowUpAction[] = [];
  for (const item of json) {
    if (!isRecord(item)) continue;
    const owner = item.owner === 'employee' || item.owner === 'hr' ? item.owner : 'reviewer';
    out.push({
      action: typeof item.action === 'string' ? item.action : '',
      owner,
      due_date: typeof item.due_date === 'string' && item.due_date ? item.due_date : null,
      done: item.done === true,
    });
  }
  return out;
};

/** Serialise ratings for storage: unrated rows are kept (rating null) so comments survive. */
export const ratingsToJson = (ratings: CompetencyRating[]): Json =>
  ratings.map((r) => ({ competency_id: r.competency_id, name: r.name, rating: r.rating, comment: r.comment }));

export const followUpsToJson = (actions: FollowUpAction[]): Json =>
  actions.map((a) => ({ action: a.action, owner: a.owner, due_date: a.due_date, done: a.done }));

/**
 * Mean of the rated competencies, one decimal place. Null when nothing is
 * rated. Out-of-range values are ignored.
 */
export const computeOverallRating = (ratings: CompetencyRating[] | null | undefined): number | null => {
  if (!ratings?.length) return null;
  const values = ratings.map((r) => toRating(r.rating)).filter((r): r is number => r !== null);
  if (!values.length) return null;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.round(mean * 10) / 10;
};

/** True when every listed competency has a valid rating. Empty competency list → false. */
export const ratingsComplete = (
  ratings: CompetencyRating[] | null | undefined,
  competencies: Pick<CompetencyRow, 'id'>[] | null | undefined,
): boolean => {
  if (!competencies?.length) return false;
  const byId = new Map((ratings ?? []).map((r) => [r.competency_id, r]));
  return competencies.every((c) => toRating(byId.get(c.id)?.rating) !== null);
};

/** Competencies that are still unrated (for the "3 left" hint). */
export const missingRatings = (
  ratings: CompetencyRating[] | null | undefined,
  competencies: Pick<CompetencyRow, 'id' | 'name'>[],
): Pick<CompetencyRow, 'id' | 'name'>[] => {
  const byId = new Map((ratings ?? []).map((r) => [r.competency_id, r]));
  return competencies.filter((c) => toRating(byId.get(c.id)?.rating) === null);
};

/**
 * Builds the working list for the ratings grid: one row per active
 * competency (framework order), keeping any existing rating/comment, plus
 * any stored ratings whose competency has since been retired (so history is
 * never silently dropped).
 */
export const seedRatings = (
  existing: CompetencyRating[] | null | undefined,
  competencies: Pick<CompetencyRow, 'id' | 'name'>[],
): CompetencyRating[] => {
  const byId = new Map((existing ?? []).map((r) => [r.competency_id, r]));
  const rows = competencies.map<CompetencyRating>((c) => {
    const found = byId.get(c.id);
    return { competency_id: c.id, name: c.name, rating: found?.rating ?? null, comment: found?.comment ?? '' };
  });
  const known = new Set(competencies.map((c) => c.id));
  for (const r of existing ?? []) {
    if (!known.has(r.competency_id)) rows.push({ ...r });
  }
  return rows;
};

/** Reviewer minus self rating; null when either side is unrated. */
export const ratingDelta = (self: number | null | undefined, reviewer: number | null | undefined): number | null => {
  const s = toRating(self);
  const r = toRating(reviewer);
  if (s === null || r === null) return null;
  return Math.round((r - s) * 10) / 10;
};

// ---------------------------------------------------------------------------
// Cycles → bulk drafts
// ---------------------------------------------------------------------------

export interface BulkDraftOptions {
  reviewerProfileId?: string | null;
  createdBy?: string | null;
  /** Vessel per crew member (falls back to the cycle's vessel). */
  vesselByProfile?: Record<string, string | null | undefined>;
}

type CycleForDrafts = Pick<ReviewCycleRow, 'id' | 'company_id' | 'review_type' | 'period_start' | 'period_end' | 'due_date' | 'vessel_id'>;

/** One draft review per crew member, inheriting the cycle's type, period and due date. Duplicate ids are collapsed. */
export const buildBulkDrafts = (cycle: CycleForDrafts, crewIds: string[], options: BulkDraftOptions = {}): TablesInsert<'performance_reviews'>[] => {
  const unique = Array.from(new Set(crewIds.filter(Boolean)));
  return unique.map((profile_id) => ({
    company_id: cycle.company_id,
    profile_id,
    cycle_id: cycle.id,
    review_type: cycle.review_type,
    period_start: cycle.period_start,
    period_end: cycle.period_end,
    due_date: cycle.due_date,
    vessel_id: options.vesselByProfile?.[profile_id] ?? cycle.vessel_id ?? null,
    reviewer_profile_id: options.reviewerProfileId ?? null,
    status: 'draft',
    ratings: [],
    self_ratings: [],
    follow_up_actions: [],
    created_by: options.createdBy ?? null,
    updated_by: options.createdBy ?? null,
  }));
};

// ---------------------------------------------------------------------------
// Filtering & KPIs
// ---------------------------------------------------------------------------

export interface ReviewFilters {
  type: ReviewType | 'all';
  status: ReviewStatus | 'all' | 'open';
  vesselId: string | 'all';
  cycleId: string | 'all';
  crewId: string | null;
  search: string;
}

export const DEFAULT_REVIEW_FILTERS: ReviewFilters = { type: 'all', status: 'open', vesselId: 'all', cycleId: 'all', crewId: null, search: '' };

export interface ReviewListItem extends PerformanceReviewRow {
  crew_name: string;
  reviewer_name: string | null;
  vessel_name: string | null;
  cycle_name: string | null;
}

export const filterReviews = <T extends ReviewListItem>(reviews: T[], filters: ReviewFilters): T[] => {
  const search = filters.search.trim().toLowerCase();
  return reviews.filter((r) => {
    if (filters.type !== 'all' && r.review_type !== filters.type) return false;
    if (filters.status === 'open') {
      if (isTerminalStatus(r.status)) return false;
    } else if (filters.status !== 'all' && r.status !== filters.status) return false;
    if (filters.vesselId !== 'all' && (r.vessel_id ?? '') !== filters.vesselId) return false;
    if (filters.cycleId !== 'all' && (r.cycle_id ?? '') !== filters.cycleId) return false;
    if (filters.crewId && r.profile_id !== filters.crewId) return false;
    if (search) {
      const hay = [r.crew_name, r.reviewer_name, r.vessel_name, r.cycle_name, reviewTypeLabel(r.review_type)].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
};

/** Newest first by due date, then created. */
export const sortReviews = <T extends PerformanceReviewRow>(reviews: T[]): T[] =>
  [...reviews].sort((a, b) => {
    const ad = a.due_date ?? a.period_end ?? a.created_at;
    const bd = b.due_date ?? b.period_end ?? b.created_at;
    if (ad !== bd) return ad < bd ? 1 : -1;
    return a.created_at < b.created_at ? 1 : -1;
  });

export interface ReviewKpis {
  dueSoon: number;
  overdue: number;
  awaitingAcknowledgement: number;
  awaitingMe: number;
  completedThisYear: number;
  averageOverall: number | null;
}

const daysFromToday = (value: string | null | undefined, today: Date): number | null => {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? differenceInCalendarDays(d, today) : null;
};

export const computeReviewKpis = (reviews: PerformanceReviewRow[], myProfileId: string | null, today = new Date()): ReviewKpis => {
  let dueSoon = 0;
  let overdue = 0;
  let awaitingAcknowledgement = 0;
  let awaitingMe = 0;
  let completedThisYear = 0;
  const ratings: number[] = [];
  const year = today.getFullYear();

  for (const r of reviews) {
    if (!isTerminalStatus(r.status)) {
      const days = daysFromToday(r.due_date, today);
      if (days !== null && days < 0) overdue += 1;
      else if (days !== null && days <= 14) dueSoon += 1;
      if (r.status === 'awaiting_acknowledgement') awaitingAcknowledgement += 1;
      if (myProfileId && r.reviewer_profile_id === myProfileId && (r.status === 'draft' || r.status === 'in_review')) awaitingMe += 1;
    }
    if (r.status === 'completed') {
      const completed = r.completed_at ? parseISO(r.completed_at) : null;
      if (completed && isValid(completed) && completed.getFullYear() === year) {
        completedThisYear += 1;
        if (typeof r.overall_rating === 'number') ratings.push(r.overall_rating);
      }
    }
  }
  const averageOverall = ratings.length ? Math.round((ratings.reduce((s, v) => s + v, 0) / ratings.length) * 10) / 10 : null;
  return { dueSoon, overdue, awaitingAcknowledgement, awaitingMe, completedThisYear, averageOverall };
};

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** Subset of columns worth recording in audit_logs (never welfare notes). */
export const reviewAuditSnapshot = (review: Partial<PerformanceReviewRow>): Record<string, string | number | boolean | null> => ({
  profile_id: review.profile_id ?? null,
  reviewer_profile_id: review.reviewer_profile_id ?? null,
  cycle_id: review.cycle_id ?? null,
  vessel_id: review.vessel_id ?? null,
  review_type: review.review_type ?? null,
  status: review.status ?? null,
  period_start: review.period_start ?? null,
  period_end: review.period_end ?? null,
  due_date: review.due_date ?? null,
  overall_rating: review.overall_rating ?? null,
  recommend_promotion: review.recommend_promotion ?? null,
  recommend_pay_review: review.recommend_pay_review ?? null,
  retain: review.retain ?? null,
  next_review_date: review.next_review_date ?? null,
  reviewer_signed_at: review.reviewer_signed_at ?? null,
  employee_acknowledged_at: review.employee_acknowledged_at ?? null,
  completed_at: review.completed_at ?? null,
  document_path: review.document_path ?? null,
});

const slug = (s: string): string =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

/** review-<type>-<crew>-<period end or today>.pdf */
export const reviewFileName = (review: Pick<PerformanceReviewRow, 'review_type' | 'period_end' | 'due_date'>, crewName: string): string => {
  const stamp = review.period_end ?? review.due_date ?? new Date().toISOString().slice(0, 10);
  return `review-${slug(review.review_type) || 'review'}-${slug(crewName) || 'crew'}-${stamp}.pdf`;
};

/** Display name from a profile join (preferred name first). */
export const personName = (p: { first_name?: string | null; last_name?: string | null; preferred_name?: string | null } | null | undefined): string => {
  if (!p) return '';
  const first = p.preferred_name || p.first_name || '';
  return `${first} ${p.last_name ?? ''}`.trim();
};
