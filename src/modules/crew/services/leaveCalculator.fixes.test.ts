import { describe, expect, it } from 'vitest';
import { calculateLeaveBreakdown, DEFAULT_LEAVE_POLICY } from './leaveCalculator';

const asOf = new Date('2026-06-15T00:00:00Z');

const base = {
  policy: { ...DEFAULT_LEAVE_POLICY, rounding: 'none' as const },
  entries: [],
  requests: [],
  carryover: 0,
  adjustments: [],
  asOf,
};

describe('leaveCalculator per-crew entitlement override', () => {
  it('spreads a per-crew annual entitlement across the year under monthly accrual', () => {
    const withPolicy = calculateLeaveBreakdown({
      ...base,
      profile: { user_id: 'u', employment_start_date: '2026-01-01' },
    });
    const withOverride = calculateLeaveBreakdown({
      ...base,
      profile: { user_id: 'u', employment_start_date: '2026-01-01', annual_leave_entitlement: 120 },
    });
    // Policy: 5 days/month. Override: 120/12 = 10 days/month.
    expect(withOverride.monthlyAccrualDays).toBeCloseTo(10, 5);
    expect(withOverride.accrued).toBeGreaterThan(withPolicy.accrued);
    expect(withOverride.accrued / withPolicy.accrued).toBeCloseTo(2, 3);
  });
});

describe('leaveCalculator in-progress requests', () => {
  it('counts only the remaining days of an approved request that straddles asOf', () => {
    const result = calculateLeaveBreakdown({
      ...base,
      profile: { user_id: 'u', employment_start_date: '2026-01-01' },
      requests: [{ start_date: '2026-06-10', end_date: '2026-06-20', status: 'approved', leave_type: 'L' }],
    });
    // 16th..20th inclusive = 5 days still to come
    expect(result.booked).toBe(5);
  });

  it('counts a fully future approved request in full', () => {
    const result = calculateLeaveBreakdown({
      ...base,
      profile: { user_id: 'u', employment_start_date: '2026-01-01' },
      requests: [{ start_date: '2026-07-01', end_date: '2026-07-10', status: 'approved', leave_type: 'L' }],
    });
    expect(result.booked).toBe(10);
  });

  it('ignores requests that ended before asOf (their days come from entries)', () => {
    const result = calculateLeaveBreakdown({
      ...base,
      profile: { user_id: 'u', employment_start_date: '2026-01-01' },
      requests: [{ start_date: '2026-05-01', end_date: '2026-05-10', status: 'approved', leave_type: 'L' }],
    });
    expect(result.booked).toBe(0);
  });

  it('handles pending straddling requests the same way', () => {
    const result = calculateLeaveBreakdown({
      ...base,
      profile: { user_id: 'u', employment_start_date: '2026-01-01' },
      requests: [{ start_date: '2026-06-14', end_date: '2026-06-17', status: 'pending', leave_type: 'L' }],
    });
    expect(result.pending).toBe(2);
  });
});
