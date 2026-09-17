import { describe, expect, it } from 'vitest';
import {
  categoryMix,
  csvCell,
  expiryForecast,
  fileSlug,
  forecastTypes,
  headcountOn,
  headcountTrend,
  isOnboardOn,
  isoDay,
  joinersLeavers,
  lastMonths,
  leaveByMonth,
  monthRange,
  nextMonths,
  reviewCompletion,
  sectionsToCsv,
  statusCounts,
  tenureBucket,
  tenureDistribution,
  toCsv,
  turnoverRate,
  type AssignmentLike,
} from '@/modules/hris/lib/reports';

const TODAY = new Date(2026, 8, 17); // 17 Sep 2026

const a = (user_id: string, join_date: string, leave_date: string | null = null, vessel_id = 'v1'): AssignmentLike => ({
  user_id,
  vessel_id,
  join_date,
  leave_date,
});

describe('date helpers', () => {
  it('isoDay trims timestamps and formats dates', () => {
    expect(isoDay('2026-03-04T10:00:00Z')).toBe('2026-03-04');
    expect(isoDay(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(isoDay(null)).toBeNull();
    expect(isoDay('bad')).toBeNull();
  });

  it('monthRange is inclusive and lastMonths / nextMonths anchor correctly', () => {
    const months = monthRange(new Date(2026, 0, 15), new Date(2026, 2, 1));
    expect(months.map((m) => m.key)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(months[0]).toEqual({ key: '2026-01', label: 'Jan 26', first: '2026-01-01' });
    expect(lastMonths(TODAY, 12).map((m) => m.key)).toEqual([
      '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
    ]);
    expect(nextMonths(TODAY, 6).map((m) => m.key)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02']);
  });
});

describe('headcount', () => {
  const rows = [
    a('u1', '2025-01-10'),
    a('u2', '2025-06-01', '2026-02-15'),
    a('u3', '2026-03-01'),
    a('u3', '2024-01-01', '2024-12-31'), // same crew, earlier stint — must not double count
  ];

  it('isOnboardOn treats join and leave days as inclusive', () => {
    expect(isOnboardOn(a('u', '2026-01-01', '2026-01-31'), '2026-01-01')).toBe(true);
    expect(isOnboardOn(a('u', '2026-01-01', '2026-01-31'), '2026-01-31')).toBe(true);
    expect(isOnboardOn(a('u', '2026-01-01', '2026-01-31'), '2026-02-01')).toBe(false);
    expect(isOnboardOn(a('u', '2026-01-02'), '2026-01-01')).toBe(false);
  });

  it('counts distinct crew on the 1st of each month', () => {
    expect(headcountOn(rows, '2026-01-01')).toBe(2);
    const trend = headcountTrend(rows, monthRange(new Date(2026, 0, 1), new Date(2026, 3, 1)));
    expect(trend.map((p) => p.headcount)).toEqual([2, 2, 2, 2]); // u2 leaves mid-Feb, u3 joins 1 Mar
  });

  it('joiners and leavers per month', () => {
    const points = joinersLeavers(rows, monthRange(new Date(2026, 1, 1), new Date(2026, 2, 1)));
    expect(points).toEqual([
      { month: '2026-02', label: 'Feb 26', joiners: 0, leavers: 1 },
      { month: '2026-03', label: 'Mar 26', joiners: 1, leavers: 0 },
    ]);
  });

  it('turnover is rolling 12-month leavers over average headcount', () => {
    const steady = [a('u1', '2020-01-01'), a('u2', '2020-01-01'), a('u3', '2020-01-01'), a('u4', '2020-01-01', '2026-06-30')];
    const [point] = turnoverRate(steady, monthRange(new Date(2026, 8, 1), new Date(2026, 8, 1)));
    expect(point.leavers12m).toBe(1);
    // Oct 25 – Jun 26 = 9 months at 4, Jul–Sep 26 = 3 months at 3 → 45/12 = 3.75
    expect(point.avgHeadcount).toBe(3.8);
    expect(point.ratePct).toBe(26.7);
    expect(turnoverRate([], monthRange(new Date(2026, 8, 1), new Date(2026, 8, 1)))[0].ratePct).toBe(0);
  });
});

describe('tenure', () => {
  it('buckets by days', () => {
    expect(tenureBucket(0)).toBe('< 6 months');
    expect(tenureBucket(181)).toBe('< 6 months');
    expect(tenureBucket(182)).toBe('6–12 months');
    expect(tenureBucket(364)).toBe('6–12 months');
    expect(tenureBucket(365)).toBe('1–2 years');
    expect(tenureBucket(729)).toBe('1–2 years');
    expect(tenureBucket(730)).toBe('2–5 years');
    expect(tenureBucket(1825)).toBe('2–5 years');
    expect(tenureBucket(1826)).toBe('5+ years');
  });

  it('uses earliest join date and only counts currently onboard crew', () => {
    const rows = [
      a('u1', '2026-08-01'), // 47 days → < 6 months
      a('u2', '2025-03-01', '2025-12-31'),
      a('u2', '2026-01-15'), // earliest join 2025-03-01 → 1–2 years
      a('u3', '2015-01-01', '2026-01-01'), // left → excluded
    ];
    const dist = tenureDistribution(rows, TODAY);
    expect(dist).toEqual([
      { bucket: '< 6 months', count: 1 },
      { bucket: '6–12 months', count: 0 },
      { bucket: '1–2 years', count: 1 },
      { bucket: '2–5 years', count: 0 },
      { bucket: '5+ years', count: 0 },
    ]);
  });
});

describe('expiry forecast', () => {
  it('counts by month and type, ignoring items outside the window', () => {
    const items = [
      { item_type: 'contract', due_date: '2026-10-05' },
      { item_type: 'contract', due_date: '2026-10-20' },
      { item_type: 'passport', due_date: '2026-11-01' },
      { item_type: 'medical', due_date: '2027-06-01' },
      { item_type: 'visa', due_date: '2026-08-01' },
    ];
    const months = nextMonths(TODAY, 3);
    const points = expiryForecast(items, months);
    expect(points.map((p) => p.total)).toEqual([0, 2, 1]);
    expect(points[1].counts).toEqual({ contract: 2 });
    expect(points[2].counts).toEqual({ passport: 1 });
    expect(forecastTypes(points)).toEqual(['contract', 'passport']);
  });
});

describe('mixes and statuses', () => {
  it('categoryMix sorts descending, groups blanks and tops out with Other', () => {
    const rows = [{ n: 'British' }, { n: 'British' }, { n: 'Dutch' }, { n: null }, { n: '' }, { n: 'French' }];
    expect(categoryMix(rows, (r) => r.n)).toEqual([
      { name: 'British', count: 2 },
      { name: 'Unknown', count: 2 },
      { name: 'Dutch', count: 1 },
      { name: 'French', count: 1 },
    ]);
    expect(categoryMix(rows, (r) => r.n, { top: 2 })).toEqual([
      { name: 'British', count: 2 },
      { name: 'Unknown', count: 2 },
      { name: 'Other', count: 2 },
    ]);
  });

  it('statusCounts respects the preferred order', () => {
    const rows = [{ status: 'Completed' }, { status: 'In_Progress' }, { status: 'In_Progress' }, { status: 'Overdue' }];
    expect(statusCounts(rows, ['Not_Started', 'In_Progress', 'Completed', 'Overdue']).map((p) => p.name)).toEqual([
      'In_Progress', 'Completed', 'Overdue',
    ]);
  });
});

describe('reviews', () => {
  it('splits completed vs outstanding vs overdue by type for the year', () => {
    const reviews = [
      { review_type: 'annual_evaluation', status: 'completed', due_date: '2026-03-01', completed_at: '2026-03-05T00:00:00Z' },
      { review_type: 'annual_evaluation', status: 'in_review', due_date: '2026-08-01', completed_at: null },
      { review_type: 'annual_evaluation', status: 'draft', due_date: '2026-12-01', completed_at: null },
      { review_type: 'end_of_rotation', status: 'cancelled', due_date: '2026-05-01', completed_at: null },
      { review_type: 'end_of_rotation', status: 'completed', due_date: '2025-11-01', completed_at: '2025-11-10T00:00:00Z' },
      { review_type: 'probation', status: 'self_assessment', due_date: '2027-01-01', completed_at: null },
    ];
    expect(reviewCompletion(reviews, 2026, TODAY)).toEqual([
      { type: 'annual_evaluation', completed: 1, outstanding: 2, overdue: 1 },
    ]);
  });
});

describe('leave', () => {
  it('buckets by start month and status', () => {
    const months = monthRange(new Date(2026, 0, 1), new Date(2026, 1, 1));
    const points = leaveByMonth(
      [
        { start_date: '2026-01-03', status: 'approved' },
        { start_date: '2026-01-20', status: 'pending' },
        { start_date: '2026-02-01', status: 'declined' },
        { start_date: '2026-03-01', status: 'approved' },
      ],
      months,
    );
    expect(points).toEqual([
      { month: '2026-01', label: 'Jan 26', pending: 1, approved: 1, declined: 0 },
      { month: '2026-02', label: 'Feb 26', pending: 0, approved: 0, declined: 1 },
    ]);
  });
});

describe('csv', () => {
  it('escapes cells and joins sections', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');
    expect(csvCell(3)).toBe('3');
    expect(toCsv(['A', 'B'], [[1, 'x'], [null, 'y,z']])).toBe('A,B\n1,x\n,"y,z"');
    expect(sectionsToCsv([{ title: 'One', headers: ['A'], rows: [[1]] }, { title: 'Two', headers: ['B'], rows: [] }])).toBe('One\nA\n1\n\nTwo\nB');
    expect(fileSlug('Headcount trend (12m)')).toBe('headcount-trend-12m');
  });
});
