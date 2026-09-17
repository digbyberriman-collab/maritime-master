/**
 * Pure helpers for pay reviews (no React / Supabase) so the KPI maths and
 * the change-% preview can be unit-tested.
 */
import type { Tables } from '@/integrations/supabase/types';

export type PayReviewRow = Tables<'pay_reviews'>;
export type PayReviewStatus = 'proposed' | 'approved' | 'rejected' | 'applied';
export type PayReviewReason = 'annual' | 'promotion' | 'market' | 'retention' | 'correction' | 'other';

export const REVIEW_STATUSES: PayReviewStatus[] = ['proposed', 'approved', 'rejected', 'applied'];
export const REVIEW_REASONS: PayReviewReason[] = ['annual', 'promotion', 'market', 'retention', 'correction', 'other'];

export const REVIEW_STATUS_BADGE_CLASS: Record<PayReviewStatus, string> = {
  proposed: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  approved: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  rejected: 'bg-destructive/10 text-destructive border-destructive/20',
  applied: 'bg-green-500/10 text-green-500 border-green-500/20',
};

export const asReviewStatus = (value: string | null | undefined): PayReviewStatus =>
  (REVIEW_STATUSES as string[]).includes(value ?? '') ? (value as PayReviewStatus) : 'proposed';

/** Mirrors the generated column: ROUND(((proposed - previous) / previous) * 100, 4), NULL when previous <= 0. */
export const changePct = (previousMinor: number, proposedMinor: number): number | null => {
  if (!(previousMinor > 0)) return null;
  return Math.round(((proposedMinor - previousMinor) / previousMinor) * 100 * 10_000) / 10_000;
};

export const formatPct = (pct: number | null | undefined, digits = 1): string => {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(digits)}%`;
};

export interface PayReviewListItem extends PayReviewRow {
  crew_name: string;
  crew_user_id: string | null;
  rank: string | null;
  department: string | null;
  avatar_url: string | null;
}

export interface PayReviewFilters {
  status: 'all' | PayReviewStatus;
  reason: 'all' | PayReviewReason;
  year: 'all' | number;
}

export const DEFAULT_REVIEW_FILTERS: PayReviewFilters = { status: 'all', reason: 'all', year: 'all' };

export const reviewYear = (r: Pick<PayReviewRow, 'review_date'>): number => Number(r.review_date.slice(0, 4));

export const filterReviews = <T extends PayReviewRow>(reviews: T[], filters: PayReviewFilters): T[] =>
  reviews.filter((r) => {
    if (filters.status !== 'all' && r.status !== filters.status) return false;
    if (filters.reason !== 'all' && r.reason !== filters.reason) return false;
    if (filters.year !== 'all' && reviewYear(r) !== filters.year) return false;
    return true;
  });

export interface PayReviewKpis {
  proposed: number;
  approvedAwaitingApply: number;
  appliedThisYear: number;
  /** Mean change % across reviews applied this year (null when none has a %). */
  averageIncreasePct: number | null;
}

export const computeReviewKpis = (reviews: PayReviewRow[], year: number): PayReviewKpis => {
  const appliedThisYear = reviews.filter((r) => r.status === 'applied' && Number((r.applied_at ?? r.effective_date).slice(0, 4)) === year);
  const pcts = appliedThisYear.map((r) => r.change_pct).filter((p): p is number => typeof p === 'number' && Number.isFinite(p));
  return {
    proposed: reviews.filter((r) => r.status === 'proposed').length,
    approvedAwaitingApply: reviews.filter((r) => r.status === 'approved').length,
    appliedThisYear: appliedThisYear.length,
    averageIncreasePct: pcts.length ? Math.round((pcts.reduce((s, p) => s + p, 0) / pcts.length) * 100) / 100 : null,
  };
};

/** Newest review first (by review date, then created). */
export const sortReviewsNewestFirst = <T extends PayReviewRow>(reviews: T[]): T[] =>
  [...reviews].sort((a, b) => b.review_date.localeCompare(a.review_date) || b.created_at.localeCompare(a.created_at));
