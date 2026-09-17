import { describe, expect, it } from 'vitest';
import {
  buildBulkDrafts,
  canTransition,
  computeOverallRating,
  computeReviewKpis,
  filterReviews,
  missingRatings,
  parseFollowUps,
  parseRatings,
  ratingDelta,
  ratingsComplete,
  reviewFileName,
  reviewTypeFromPath,
  seedRatings,
  sortReviews,
  statusTone,
  stepIndex,
  DEFAULT_REVIEW_FILTERS,
  NEXT_STATUS,
  REVIEW_TYPES,
  type CompetencyRating,
  type PerformanceReviewRow,
  type ReviewListItem,
} from '@/modules/hris/lib/reviews';

const TODAY = new Date(2026, 8, 17); // 17 Sep 2026

const review = (overrides: Partial<PerformanceReviewRow> = {}): PerformanceReviewRow => ({
  id: overrides.id ?? 'r1',
  company_id: 'co',
  profile_id: 'p1',
  reviewer_profile_id: 'rev',
  cycle_id: null,
  vessel_id: null,
  review_type: 'annual_evaluation',
  period_start: '2026-01-01',
  period_end: '2026-06-30',
  due_date: '2026-09-30',
  status: 'draft',
  ratings: [],
  self_ratings: [],
  overall_rating: null,
  strengths: null,
  development_areas: null,
  training_needs: null,
  career_aspirations: null,
  summary: null,
  reviewer_comments: null,
  employee_comments: null,
  welfare_notes: null,
  follow_up_actions: [],
  next_review_date: null,
  recommend_promotion: null,
  recommend_pay_review: null,
  retain: null,
  submitted_at: null,
  self_assessment_submitted_at: null,
  reviewer_signed_at: null,
  employee_acknowledged_at: null,
  completed_at: null,
  document_path: null,
  created_by: null,
  updated_by: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  ...overrides,
});

const listItem = (overrides: Partial<ReviewListItem> = {}): ReviewListItem => ({
  ...review(overrides),
  crew_name: overrides.crew_name ?? 'Ann Deck',
  reviewer_name: overrides.reviewer_name ?? 'Cap Tain',
  vessel_name: overrides.vessel_name ?? null,
  cycle_name: overrides.cycle_name ?? null,
});

const COMPETENCIES = [
  { id: 'c1', name: 'Safety awareness' },
  { id: 'c2', name: 'Teamwork' },
  { id: 'c3', name: 'Leadership' },
];

describe('reviewTypeFromPath', () => {
  it('maps the three routed paths', () => {
    expect(reviewTypeFromPath('/hris/performance/annual-evaluations')).toBe('annual_evaluation');
    expect(reviewTypeFromPath('/hris/performance/annual-reviews')).toBe('annual_review');
    expect(reviewTypeFromPath('/hris/performance/end-of-rotation/')).toBe('end_of_rotation');
  });

  it('falls back to annual evaluation', () => {
    expect(reviewTypeFromPath('/hris/performance/something-else')).toBe('annual_evaluation');
    expect(reviewTypeFromPath('')).toBe('annual_evaluation');
  });

  it('has labels for every type', () => {
    expect(REVIEW_TYPES.map((t) => t.value)).toEqual(['annual_evaluation', 'annual_review', 'end_of_rotation', 'probation', 'ad_hoc']);
  });
});

describe('computeOverallRating', () => {
  const r = (rating: number | null, id = 'x'): CompetencyRating => ({ competency_id: id, name: id, rating, comment: '' });

  it('returns null for empty or fully unrated lists', () => {
    expect(computeOverallRating([])).toBeNull();
    expect(computeOverallRating(null)).toBeNull();
    expect(computeOverallRating([r(null), r(null)])).toBeNull();
  });

  it('averages to one decimal, ignoring unrated and out-of-range values', () => {
    expect(computeOverallRating([r(4), r(5), r(3)])).toBe(4);
    expect(computeOverallRating([r(4), r(5), r(null)])).toBe(4.5);
    expect(computeOverallRating([r(2), r(3), r(3)])).toBe(2.7);
    expect(computeOverallRating([r(5), r(9), r(0)])).toBe(5);
  });
});

describe('ratingsComplete / missingRatings', () => {
  const rated = (ids: string[]): CompetencyRating[] => ids.map((id) => ({ competency_id: id, name: id, rating: 3, comment: '' }));

  it('requires every competency to be rated', () => {
    expect(ratingsComplete(rated(['c1', 'c2', 'c3']), COMPETENCIES)).toBe(true);
    expect(ratingsComplete(rated(['c1', 'c2']), COMPETENCIES)).toBe(false);
    expect(ratingsComplete([], COMPETENCIES)).toBe(false);
  });

  it('is false when there are no competencies to rate', () => {
    expect(ratingsComplete(rated(['c1']), [])).toBe(false);
  });

  it('ignores invalid ratings', () => {
    const bad: CompetencyRating[] = [...rated(['c1', 'c2']), { competency_id: 'c3', name: 'c3', rating: 7, comment: '' }];
    expect(ratingsComplete(bad, COMPETENCIES)).toBe(false);
    expect(missingRatings(bad, COMPETENCIES).map((c) => c.id)).toEqual(['c3']);
  });
});

describe('seedRatings', () => {
  it('produces one row per competency in framework order and keeps existing values', () => {
    const existing: CompetencyRating[] = [{ competency_id: 'c2', name: 'Teamwork', rating: 4, comment: 'Solid' }];
    const rows = seedRatings(existing, COMPETENCIES);
    expect(rows.map((r) => r.competency_id)).toEqual(['c1', 'c2', 'c3']);
    expect(rows[1]).toEqual({ competency_id: 'c2', name: 'Teamwork', rating: 4, comment: 'Solid' });
    expect(rows[0].rating).toBeNull();
  });

  it('keeps ratings for retired competencies at the end', () => {
    const existing: CompetencyRating[] = [{ competency_id: 'old', name: 'Retired', rating: 2, comment: '' }];
    const rows = seedRatings(existing, COMPETENCIES);
    expect(rows).toHaveLength(4);
    expect(rows[3].competency_id).toBe('old');
  });
});

describe('parseRatings / parseFollowUps', () => {
  it('parses valid rows and drops garbage', () => {
    const parsed = parseRatings([
      { competency_id: 'c1', name: 'Safety', rating: '4', comment: 'ok' },
      { competency_id: 'c2', rating: 11 },
      { name: 'no id' },
      'nope',
      null,
    ]);
    expect(parsed).toEqual([
      { competency_id: 'c1', name: 'Safety', rating: 4, comment: 'ok' },
      { competency_id: 'c2', name: '', rating: null, comment: '' },
    ]);
    expect(parseRatings(null)).toEqual([]);
    expect(parseRatings({ not: 'array' })).toEqual([]);
  });

  it('normalises follow-up actions', () => {
    expect(parseFollowUps([{ action: 'Book course', owner: 'hr', due_date: '2026-12-01', done: 1 }, { action: 'x', owner: 'bogus' }])).toEqual([
      { action: 'Book course', owner: 'hr', due_date: '2026-12-01', done: false },
      { action: 'x', owner: 'reviewer', due_date: null, done: false },
    ]);
  });
});

describe('transitions & tone', () => {
  it('follows the workflow table', () => {
    expect(canTransition('draft', 'self_assessment')).toBe(true);
    expect(canTransition('draft', 'in_review')).toBe(true);
    expect(canTransition('self_assessment', 'in_review')).toBe(true);
    expect(canTransition('in_review', 'awaiting_acknowledgement')).toBe(true);
    expect(canTransition('awaiting_acknowledgement', 'completed')).toBe(true);
    expect(canTransition('in_review', 'completed')).toBe(false);
    expect(canTransition('completed', 'cancelled')).toBe(false);
    expect(canTransition('bogus', 'cancelled')).toBe(false);
    expect(NEXT_STATUS.cancelled).toEqual([]);
  });

  it('exposes a tone per status and a stepper index', () => {
    expect(statusTone('draft')).toBe('muted');
    expect(statusTone('in_review')).toBe('info');
    expect(statusTone('awaiting_acknowledgement')).toBe('warning');
    expect(statusTone('completed')).toBe('success');
    expect(statusTone('cancelled')).toBe('destructive');
    expect(stepIndex('awaiting_acknowledgement')).toBe(3);
    expect(stepIndex('cancelled')).toBe(0);
  });
});

describe('buildBulkDrafts', () => {
  const cycle = {
    id: 'cy1',
    company_id: 'co',
    review_type: 'end_of_rotation',
    period_start: '2026-03-01',
    period_end: '2026-06-30',
    due_date: '2026-07-15',
    vessel_id: 'v1',
  };

  it('creates one draft per unique crew member inheriting the cycle', () => {
    const drafts = buildBulkDrafts(cycle, ['p1', 'p2', 'p1'], { reviewerProfileId: 'rev', createdBy: 'u1', vesselByProfile: { p2: 'v2' } });
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      company_id: 'co',
      profile_id: 'p1',
      cycle_id: 'cy1',
      review_type: 'end_of_rotation',
      period_start: '2026-03-01',
      period_end: '2026-06-30',
      due_date: '2026-07-15',
      vessel_id: 'v1',
      reviewer_profile_id: 'rev',
      status: 'draft',
      created_by: 'u1',
    });
    expect(drafts[1].vessel_id).toBe('v2');
  });

  it('returns nothing for an empty selection', () => {
    expect(buildBulkDrafts(cycle, [])).toEqual([]);
  });
});

describe('ratingDelta', () => {
  it('returns reviewer minus self, null when either is missing', () => {
    expect(ratingDelta(3, 4)).toBe(1);
    expect(ratingDelta(5, 3)).toBe(-2);
    expect(ratingDelta(null, 3)).toBeNull();
    expect(ratingDelta(3, undefined)).toBeNull();
  });
});

describe('filterReviews / sortReviews', () => {
  const rows = [
    listItem({ id: 'a', status: 'completed', completed_at: '2026-05-01T00:00:00Z', due_date: '2026-04-30' }),
    listItem({ id: 'b', status: 'in_review', review_type: 'end_of_rotation', vessel_id: 'v1', vessel_name: 'Draak', due_date: '2026-10-01' }),
    listItem({ id: 'c', status: 'awaiting_acknowledgement', cycle_id: 'cy1', crew_name: 'Bob Sea', due_date: '2026-09-20' }),
  ];

  it('hides terminal reviews by default and applies each filter', () => {
    expect(filterReviews(rows, DEFAULT_REVIEW_FILTERS).map((r) => r.id)).toEqual(['b', 'c']);
    expect(filterReviews(rows, { ...DEFAULT_REVIEW_FILTERS, status: 'all' })).toHaveLength(3);
    expect(filterReviews(rows, { ...DEFAULT_REVIEW_FILTERS, type: 'end_of_rotation' }).map((r) => r.id)).toEqual(['b']);
    expect(filterReviews(rows, { ...DEFAULT_REVIEW_FILTERS, vesselId: 'v1' }).map((r) => r.id)).toEqual(['b']);
    expect(filterReviews(rows, { ...DEFAULT_REVIEW_FILTERS, cycleId: 'cy1' }).map((r) => r.id)).toEqual(['c']);
    expect(filterReviews(rows, { ...DEFAULT_REVIEW_FILTERS, search: 'bob' }).map((r) => r.id)).toEqual(['c']);
    expect(filterReviews(rows, { ...DEFAULT_REVIEW_FILTERS, search: 'draak' }).map((r) => r.id)).toEqual(['b']);
  });

  it('sorts newest due date first', () => {
    expect(sortReviews(rows).map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('computeReviewKpis', () => {
  it('counts due soon, overdue, awaiting states and this year completions', () => {
    const kpis = computeReviewKpis(
      [
        review({ id: '1', status: 'in_review', due_date: '2026-09-25', reviewer_profile_id: 'me' }),
        review({ id: '2', status: 'draft', due_date: '2026-09-01', reviewer_profile_id: 'me' }),
        review({ id: '3', status: 'awaiting_acknowledgement', due_date: '2026-12-01' }),
        review({ id: '4', status: 'completed', completed_at: '2026-03-03T00:00:00Z', overall_rating: 4 }),
        review({ id: '5', status: 'completed', completed_at: '2026-06-03T00:00:00Z', overall_rating: 3 }),
        review({ id: '6', status: 'completed', completed_at: '2025-06-03T00:00:00Z', overall_rating: 1 }),
        review({ id: '7', status: 'cancelled', due_date: '2026-09-01', reviewer_profile_id: 'me' }),
      ],
      'me',
      TODAY,
    );
    expect(kpis).toEqual({ dueSoon: 1, overdue: 1, awaitingAcknowledgement: 1, awaitingMe: 2, completedThisYear: 2, averageOverall: 3.5 });
  });

  it('handles an empty list', () => {
    expect(computeReviewKpis([], null, TODAY)).toEqual({ dueSoon: 0, overdue: 0, awaitingAcknowledgement: 0, awaitingMe: 0, completedThisYear: 0, averageOverall: null });
  });
});

describe('reviewFileName', () => {
  it('builds a safe slugged file name', () => {
    expect(reviewFileName({ review_type: 'annual_evaluation', period_end: '2026-06-30', due_date: null }, 'Ánn O’Deck')).toBe(
      'review-annual-evaluation-ann-o-deck-2026-06-30.pdf',
    );
  });
});
