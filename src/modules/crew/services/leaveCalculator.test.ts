import { describe, it, expect } from 'vitest';
import {
  calculateAccruedDays,
  calculateLeaveBreakdown,
  DEFAULT_LEAVE_POLICY,
  findNextLeaveBlock,
  overlapsAny,
  resolveAccrualAnchor,
} from './leaveCalculator';

describe('leaveCalculator.resolveAccrualAnchor', () => {
  it('prefers employment_start_date', () => {
    const anchor = resolveAccrualAnchor(
      {
        user_id: 'u',
        employment_start_date: '2024-03-01',
        contract_start_date: '2025-01-01',
      },
      '2025-06-01',
    );
    expect(anchor?.toISOString().substring(0, 10)).toBe('2024-03-01');
  });

  it('falls back to contract start, then join date', () => {
    expect(resolveAccrualAnchor({ user_id: 'u' }, '2025-06-01')?.toISOString().substring(0, 10)).toBe('2025-06-01');
  });

  it('returns null when no dates provided', () => {
    expect(resolveAccrualAnchor({ user_id: 'u' })).toBeNull();
  });
});

describe('leaveCalculator.calculateAccruedDays', () => {
  it('returns 0 when anchor is in the future', () => {
    const accrued = calculateAccruedDays(
      new Date('2026-08-01'),
      new Date('2026-05-01'),
      DEFAULT_LEAVE_POLICY,
    );
    expect(accrued).toBe(0);
  });

  it('accrues 5 days/month for full months under monthly accrual', () => {
    const accrued = calculateAccruedDays(
      new Date('2026-01-01'),
      new Date('2026-04-30'),
      DEFAULT_LEAVE_POLICY, // 5 days/month
    );
    // Jan + Feb + Mar + Apr = 4 months = 20 days
    expect(accrued).toBe(20);
  });

  it('pro-rates partial first/last months', () => {
    const accrued = calculateAccruedDays(
      new Date('2026-01-15'),
      new Date('2026-03-15'),
      { ...DEFAULT_LEAVE_POLICY, rounding: 'none' },
    );
    // Jan: ~17/31 of month, Feb: full, Mar: 15/31
    // ~ (17/31 + 1 + 15/31) * 5 ≈ 10.16
    expect(accrued).toBeGreaterThan(10);
    expect(accrued).toBeLessThan(11);
  });

  it('clamps anchor to start of year when older than year', () => {
    const accrued = calculateAccruedDays(
      new Date('2024-01-01'),
      new Date('2026-04-30'),
      DEFAULT_LEAVE_POLICY,
      new Date('2026-01-01'),
    );
    // Should only count from Jan 2026 onward (4 months)
    expect(accrued).toBe(20);
  });
});

describe('leaveCalculator.calculateLeaveBreakdown', () => {
  it('produces accurate balance with carryover, taken, and booked', () => {
    const result = calculateLeaveBreakdown({
      profile: { user_id: 'u', employment_start_date: '2026-01-01' },
      policy: DEFAULT_LEAVE_POLICY,
      entries: [
        { date: '2026-02-10', status_code: 'L' },
        { date: '2026-02-11', status_code: 'L' },
        { date: '2026-02-12', status_code: 'L' },
      ],
      requests: [
        { start_date: '2026-12-01', end_date: '2026-12-05', status: 'approved', leave_type: 'L' },
      ],
      carryover: 10,
      adjustments: [],
      asOf: new Date('2026-04-30'),
    });

    expect(result.accrued).toBe(20);    // 4 months × 5
    expect(result.taken).toBe(3);
    expect(result.booked).toBe(5);      // future approved
    expect(result.carryover).toBe(10);
    expect(result.remaining).toBe(20 + 10 - 3 - 5); // 22
  });

  it('does not deduct sick leave by default', () => {
    const result = calculateLeaveBreakdown({
      profile: { user_id: 'u', employment_start_date: '2026-01-01' },
      policy: DEFAULT_LEAVE_POLICY,
      entries: [{ date: '2026-02-10', status_code: 'M' }],
      requests: [],
      carryover: 0,
      adjustments: [],
      asOf: new Date('2026-04-30'),
    });
    expect(result.taken).toBe(0);
  });

  it('respects sick_affects_balance policy override', () => {
    const result = calculateLeaveBreakdown({
      profile: { user_id: 'u', employment_start_date: '2026-01-01' },
      policy: { ...DEFAULT_LEAVE_POLICY, sickAffectsBalance: true },
      entries: [{ date: '2026-02-10', status_code: 'M' }],
      requests: [],
      carryover: 0,
      adjustments: [],
      asOf: new Date('2026-04-30'),
    });
    expect(result.taken).toBe(1);
  });

  it('warns when no anchor available', () => {
    const result = calculateLeaveBreakdown({
      profile: { user_id: 'u' },
      policy: DEFAULT_LEAVE_POLICY,
      entries: [],
      requests: [],
      carryover: 0,
      adjustments: [],
      asOf: new Date('2026-04-30'),
    });
    expect(result.notes.some((n) => n.includes('No employment'))).toBe(true);
    expect(result.accrued).toBe(0);
  });

  it('applies manual adjustments to remaining', () => {
    const result = calculateLeaveBreakdown({
      profile: { user_id: 'u', employment_start_date: '2026-01-01' },
      policy: DEFAULT_LEAVE_POLICY,
      entries: [],
      requests: [],
      carryover: 0,
      adjustments: [{ adjustment_days: 7, effective_date: '2026-02-01' }],
      asOf: new Date('2026-04-30'),
    });
    expect(result.adjustments).toBe(7);
    expect(result.remaining).toBe(20 + 7);
  });
});

describe('leaveCalculator.findNextLeaveBlock', () => {
  it('returns the next contiguous leave block from entries', () => {
    const result = findNextLeaveBlock(
      [
        { date: '2026-05-10', status_code: 'L' },
        { date: '2026-05-11', status_code: 'L' },
        { date: '2026-05-12', status_code: 'L' },
        { date: '2026-06-01', status_code: 'L' },
      ],
      [],
      new Date('2026-05-01'),
    );
    expect(result.startDate).toBe('2026-05-10');
    expect(result.endDate).toBe('2026-05-12');
    expect(result.source).toBe('entry');
  });

  it('falls back to approved requests when no entries match', () => {
    const result = findNextLeaveBlock(
      [],
      [{ start_date: '2026-07-15', end_date: '2026-07-25', status: 'approved', leave_type: 'L' }],
      new Date('2026-05-01'),
    );
    expect(result.source).toBe('request');
    expect(result.startDate).toBe('2026-07-15');
  });
});

describe('leaveCalculator.overlapsAny', () => {
  it('detects overlap', () => {
    expect(
      overlapsAny('2026-05-10', '2026-05-15', [
        { start_date: '2026-05-12', end_date: '2026-05-20' },
      ]),
    ).toBe(true);
  });

  it('detects non-overlap', () => {
    expect(
      overlapsAny('2026-05-10', '2026-05-15', [
        { start_date: '2026-05-20', end_date: '2026-05-25' },
      ]),
    ).toBe(false);
  });
});
