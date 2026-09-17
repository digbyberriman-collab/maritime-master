import { describe, expect, it } from 'vitest';
import { changePct, computeReviewKpis, filterReviews, formatPct, sortReviewsNewestFirst, type PayReviewRow } from './payReviewHelpers';

const review = (over: Partial<PayReviewRow>): PayReviewRow => ({
  id: 'r',
  company_id: 'c',
  profile_id: 'p',
  review_date: '2026-06-01',
  effective_date: '2026-07-01',
  previous_compensation_id: null,
  new_compensation_id: null,
  currency: 'EUR',
  previous_base_minor: 500_000,
  proposed_base_minor: 550_000,
  change_pct: 10,
  reason: 'annual',
  justification: null,
  comparator_notes: null,
  status: 'proposed',
  proposed_by: null,
  approved_by: null,
  approved_at: null,
  applied_at: null,
  notes: null,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  ...over,
});

describe('changePct', () => {
  it('mirrors the generated column (4 decimals, null when previous is 0)', () => {
    expect(changePct(500_000, 550_000)).toBe(10);
    expect(changePct(300_000, 310_000)).toBe(3.3333);
    expect(changePct(500_000, 450_000)).toBe(-10);
    expect(changePct(0, 100)).toBeNull();
  });

  it('formats with a sign', () => {
    expect(formatPct(10)).toBe('+10.0%');
    expect(formatPct(-2.5)).toBe('-2.5%');
    expect(formatPct(null)).toBe('—');
  });
});

describe('filters, sorting and KPIs', () => {
  const rows = [
    review({ id: '1', status: 'proposed' }),
    review({ id: '2', status: 'approved', reason: 'promotion' }),
    review({ id: '3', status: 'applied', applied_at: '2026-03-02T00:00:00Z', change_pct: 5, review_date: '2026-02-01' }),
    review({ id: '4', status: 'applied', applied_at: '2026-04-02T00:00:00Z', change_pct: 15, review_date: '2026-03-01' }),
    review({ id: '5', status: 'applied', applied_at: '2025-04-02T00:00:00Z', change_pct: 99, review_date: '2025-03-01' }),
    review({ id: '6', status: 'rejected', review_date: '2025-12-01' }),
  ];

  it('filters by status, reason and year', () => {
    expect(filterReviews(rows, { status: 'applied', reason: 'all', year: 'all' }).map((r) => r.id)).toEqual(['3', '4', '5']);
    expect(filterReviews(rows, { status: 'all', reason: 'promotion', year: 'all' }).map((r) => r.id)).toEqual(['2']);
    expect(filterReviews(rows, { status: 'all', reason: 'all', year: 2025 }).map((r) => r.id)).toEqual(['5', '6']);
  });

  it('sorts newest review date first', () => {
    expect(sortReviewsNewestFirst(rows).map((r) => r.id)).toEqual(['1', '2', '4', '3', '6', '5']);
  });

  it('computes the cycle KPIs for a year', () => {
    const k = computeReviewKpis(rows, 2026);
    expect(k.proposed).toBe(1);
    expect(k.approvedAwaitingApply).toBe(1);
    expect(k.appliedThisYear).toBe(2);
    expect(k.averageIncreasePct).toBe(10);
    expect(computeReviewKpis([], 2026).averageIncreasePct).toBeNull();
  });
});
