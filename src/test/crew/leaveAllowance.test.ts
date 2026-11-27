/**
 * The leave allowance and balance from the employment terms (gap/04 C55;
 * X1-09B; crew/lib/leaveAllowance.ts): every method and every refusal of
 * the terms' allowance, the ratio arithmetic over a grid, the effect of
 * every leave type under both methods and every policy, and the balance of
 * the year (accrual with time or with days on board, taken, booked,
 * pending, the terms' window, leap years, duplicates).
 */
import { describe, expect, it } from 'vitest';
import {
  allowanceFromTerms,
  allowanceSourceText,
  calendarYear,
  dayEffectOfCode,
  dayEffectOfType,
  daysText,
  monthlyFromYearly,
  ratioDaysPerYear,
  ratioEarned,
  round2,
  termsBalance,
  type DayCodeEntry,
  type TermsAllowanceInput,
} from '@/modules/crew/lib/leaveAllowance';
import { LEAVE_DAY_CODES, LEAVE_TYPES, type LeaveBalancePolicy } from '@/modules/rotation-planner/lib/leaveTypes';
import { addDays } from '@/modules/rotation-planner/lib/duration';

const terms = (over: Partial<TermsAllowanceInput>): TermsAllowanceInput => ({
  leave_method: 'days_per_year',
  leave_days_per_year: 30,
  leave_ratio_on: null,
  leave_ratio_off: null,
  start_date: '2026-01-01',
  end_date: null,
  ...over,
});

const NO_FLAGS: LeaveBalancePolicy = { sickAffectsBalance: false, trainingAffectsBalance: false, unpaidAffectsBalance: false };
const ALL_POLICIES: LeaveBalancePolicy[] = [false, true].flatMap((sick) =>
  [false, true].flatMap((training) => [false, true].map((unpaid) => ({ sickAffectsBalance: sick, trainingAffectsBalance: training, unpaidAffectsBalance: unpaid }))),
);

/** Consecutive day codes from `start`, one per day. */
const run = (start: string, days: number, code: string): DayCodeEntry[] => Array.from({ length: days }, (_, i) => ({ date: addDays(start, i), code }));

describe('allowanceFromTerms', () => {
  it('falls back to the policy without terms', () => {
    expect(allowanceFromTerms(null)).toEqual({ kind: 'policy', reason: 'no_terms' });
    expect(allowanceFromTerms(undefined)).toEqual({ kind: 'policy', reason: 'no_terms' });
  });

  it('falls back to the policy when the terms name no method', () => {
    for (const method of [null, '']) {
      expect(allowanceFromTerms(terms({ leave_method: method }))).toEqual({ kind: 'policy', reason: 'no_method' });
    }
  });

  it('refuses an unknown method as invalid', () => {
    expect(allowanceFromTerms(terms({ leave_method: 'monthly' }))).toEqual({ kind: 'policy', reason: 'invalid' });
  });

  it('reads days per year as a number or a numeric string, 0 to 365', () => {
    for (const [value, days] of [
      [30, 30],
      ['30', 30],
      ['22.50', 22.5],
      [0, 0],
      [365, 365],
      ['0.25', 0.25],
    ] as const) {
      expect(allowanceFromTerms(terms({ leave_days_per_year: value }))).toEqual({ kind: 'days_per_year', daysPerYear: days });
    }
  });

  it('refuses days per year outside the CHECK or not a number', () => {
    for (const value of [null, '', -1, 365.01, 400, 'thirty', Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(allowanceFromTerms(terms({ leave_days_per_year: value as number | string | null }))).toEqual({ kind: 'policy', reason: 'invalid' });
    }
  });

  it('reads a ratio of two whole numbers above zero', () => {
    for (let on = 1; on <= 6; on++) {
      for (let off = 1; off <= 6; off++) {
        expect(allowanceFromTerms(terms({ leave_method: 'ratio', leave_ratio_on: on, leave_ratio_off: off }))).toEqual({ kind: 'ratio', on, off });
      }
    }
  });

  it('refuses a ratio with a missing, zero, negative or fractional side', () => {
    const bad: Array<[number | null, number | null]> = [
      [null, 1],
      [1, null],
      [0, 1],
      [1, 0],
      [-2, 1],
      [2, -1],
      [1.5, 1],
      [1, 0.5],
    ];
    for (const [on, off] of bad) {
      expect(allowanceFromTerms(terms({ leave_method: 'ratio', leave_ratio_on: on, leave_ratio_off: off }))).toEqual({ kind: 'policy', reason: 'invalid' });
    }
  });

  it('reads none', () => {
    expect(allowanceFromTerms(terms({ leave_method: 'none', leave_days_per_year: null }))).toEqual({ kind: 'none' });
  });
});

describe('ratio arithmetic', () => {
  it('gives the off share of the year', () => {
    expect(ratioDaysPerYear(1, 1)).toBe(182.5);
    expect(ratioDaysPerYear(2, 1)).toBe(121.67);
    expect(ratioDaysPerYear(1, 2)).toBe(243.33);
    expect(ratioDaysPerYear(3, 3)).toBe(182.5);
  });

  it('earns off days in proportion to days on board, over a grid', () => {
    for (let on = 1; on <= 6; on++) {
      for (let off = 1; off <= 6; off++) {
        for (let days = 0; days <= 30; days++) {
          expect(ratioEarned(days, on, off)).toBe(round2((days * off) / on));
        }
      }
    }
    expect(ratioEarned(14, 2, 1)).toBe(7);
    expect(ratioEarned(10, 3, 1)).toBe(3.33);
  });

  it('refuses a bad ratio or a bad count', () => {
    expect(() => ratioDaysPerYear(0, 1)).toThrow(RangeError);
    expect(() => ratioDaysPerYear(1, 1.5)).toThrow(RangeError);
    expect(() => ratioEarned(5, 0, 1)).toThrow(RangeError);
    expect(() => ratioEarned(-1, 1, 1)).toThrow(RangeError);
    expect(() => ratioEarned(1.5, 1, 1)).toThrow(RangeError);
  });

  it('spreads days per year over the months', () => {
    expect(monthlyFromYearly(30)).toBe(2.5);
    expect(monthlyFromYearly(25)).toBe(2.08);
    expect(monthlyFromYearly(0)).toBe(0);
  });

  it('rounds half away from zero to two decimals and never answers -0', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(-1.005)).toBe(-1.01);
    expect(Object.is(round2(-0.001), 0)).toBe(true);
    expect(round2(Number.NaN)).toBe(0);
  });
});

describe('the effect of a day', () => {
  /** The expected effect per type key: days per year, then ratio (no policy flag on). */
  const EXPECTED: Record<string, ['use' | 'neutral', 'earn' | 'use' | 'neutral']> = {
    on_board: ['neutral', 'earn'],
    sick_on_board: ['neutral', 'earn'],
    rotation: ['neutral', 'use'],
    holiday: ['use', 'use'],
    medical: ['neutral', 'neutral'],
    emergency: ['neutral', 'neutral'],
    crew_development: ['neutral', 'neutral'],
    paid_parental: ['neutral', 'neutral'],
    compassionate: ['neutral', 'neutral'],
    unpaid: ['neutral', 'neutral'],
    travel: ['neutral', 'neutral'],
    neutral: ['neutral', 'neutral'],
    pbq: ['neutral', 'earn'],
    other: ['neutral', 'neutral'],
  };

  it('covers every leave type', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(LEAVE_TYPES.map((t) => t.key).sort());
  });

  it('matches the table under every policy (a policy type uses a day only with its flag on)', () => {
    for (const policy of ALL_POLICIES) {
      for (const type of LEAVE_TYPES) {
        const [perYear, ratio] = EXPECTED[type.key];
        const flagOn =
          (type.policyFlag === 'sick_affects_balance' && policy.sickAffectsBalance) ||
          (type.policyFlag === 'training_affects_balance' && policy.trainingAffectsBalance) ||
          (type.policyFlag === 'unpaid_affects_balance' && policy.unpaidAffectsBalance);
        expect(dayEffectOfType(type, 'days_per_year', policy), `${type.key} per year`).toBe(flagOn ? 'use' : perYear);
        expect(dayEffectOfType(type, 'ratio', policy), `${type.key} ratio`).toBe(flagOn ? 'use' : ratio);
      }
    }
  });

  it('reads every day code (F is On board) and an unknown code as neutral', () => {
    for (const code of LEAVE_DAY_CODES) {
      for (const method of ['days_per_year', 'ratio'] as const) {
        expect(['earn', 'use', 'neutral']).toContain(dayEffectOfCode(code, method, NO_FLAGS));
      }
    }
    expect(dayEffectOfCode('F', 'ratio', NO_FLAGS)).toBe('earn');
    expect(dayEffectOfCode('f', 'ratio', NO_FLAGS)).toBe('earn');
    expect(dayEffectOfCode('R', 'ratio', NO_FLAGS)).toBe('use');
    expect(dayEffectOfCode('L', 'days_per_year', NO_FLAGS)).toBe('use');
    expect(dayEffectOfCode('ZZ', 'ratio', NO_FLAGS)).toBe('neutral');
    expect(dayEffectOfCode('', 'days_per_year', NO_FLAGS)).toBe('neutral');
  });
});

describe('termsBalance: days per year', () => {
  const base = {
    allowance: { kind: 'days_per_year' as const, daysPerYear: 36.5 },
    termsStart: '2025-06-01',
    termsEnd: null,
    pending: [],
    policy: NO_FLAGS,
  };

  it('accrues with the days of the year elapsed, counting today', () => {
    const b = termsBalance({ ...base, entries: [], today: '2026-01-10' });
    // 10 of 365 days of 36.5 days.
    expect(b).toMatchObject({ method: 'days_per_year', from: '2026-01-01', to: '2026-12-31', accrued: 1, taken: 0, booked: 0, remaining: 1, yearAllowance: 36.5 });
  });

  it('accrues from the terms start when it falls inside the year', () => {
    const b = termsBalance({ ...base, termsStart: '2026-03-01', entries: [], today: '2026-03-10' });
    expect(b.from).toBe('2026-03-01');
    expect(b.accrued).toBe(1);
  });

  it('stops at the terms end', () => {
    const b = termsBalance({ ...base, termsStart: '2026-01-01', termsEnd: '2026-01-20', entries: [], today: '2026-06-01' });
    expect(b.to).toBe('2026-01-20');
    expect(b.accrued).toBe(2);
  });

  it('divides by 366 in a leap year', () => {
    const b = termsBalance({ ...base, allowance: { kind: 'days_per_year', daysPerYear: 36.6 }, termsStart: '2028-01-01', entries: [], today: '2028-01-10' });
    expect(b.accrued).toBe(1);
  });

  it('counts deducting days as taken up to today and booked after it', () => {
    const entries = [...run('2026-02-01', 5, 'L'), ...run('2026-02-10', 3, 'L'), ...run('2026-02-06', 4, 'F'), ...run('2026-02-13', 2, 'R')];
    const b = termsBalance({ ...base, entries, today: '2026-02-11' });
    expect(b.taken).toBe(7);
    expect(b.booked).toBe(1);
    // 42 days elapsed of 365 at 36.5 a year = 4.2
    expect(b.accrued).toBe(4.2);
    expect(b.remaining).toBe(round2(4.2 - 7 - 1));
  });

  it('reads policy days by the flag', () => {
    const entries = [...run('2026-01-02', 2, 'M'), ...run('2026-01-05', 1, 'CD'), ...run('2026-01-06', 3, 'U')];
    expect(termsBalance({ ...base, entries, today: '2026-01-31' }).taken).toBe(0);
    expect(termsBalance({ ...base, entries, today: '2026-01-31', policy: { ...NO_FLAGS, sickAffectsBalance: true } }).taken).toBe(2);
    expect(termsBalance({ ...base, entries, today: '2026-01-31', policy: { sickAffectsBalance: true, trainingAffectsBalance: true, unpaidAffectsBalance: true } }).taken).toBe(6);
  });

  it('ignores codes outside the year or the terms, and counts a date once', () => {
    const entries = [
      { date: '2025-12-31', code: 'L' },
      { date: '2027-01-01', code: 'L' },
      { date: '2026-01-05', code: 'L' },
      { date: '2026-01-05', code: 'L' },
      { date: 'not a date', code: 'L' },
    ];
    expect(termsBalance({ ...base, entries, today: '2026-06-01' }).taken).toBe(1);
    expect(termsBalance({ ...base, termsStart: '2026-01-10', entries, today: '2026-06-01' }).taken).toBe(0);
  });

  it('lets the last entry of a date win', () => {
    const entries = [
      { date: '2026-01-05', code: 'L' },
      { date: '2026-01-05', code: 'F' },
    ];
    expect(termsBalance({ ...base, entries, today: '2026-06-01' }).taken).toBe(0);
  });

  it('counts pending days that would use the balance, in the year only', () => {
    const b = termsBalance({
      ...base,
      entries: [],
      today: '2026-11-01',
      pending: [
        { leaveTypeKey: 'holiday', start: '2026-12-20', end: '2027-01-05' },
        { leaveTypeKey: 'rotation', start: '2026-11-10', end: '2026-11-20' },
        { leaveTypeKey: 'unknown_type', start: '2026-11-10', end: '2026-11-20' },
      ],
    });
    expect(b.pending).toBe(12);
    expect(b.pendingOpenEnded).toBe(false);
  });

  it('counts an open-ended pending period to the end of the year and says so', () => {
    const b = termsBalance({ ...base, entries: [], today: '2026-12-01', pending: [{ leaveTypeKey: 'holiday', start: '2026-12-25', end: null }] });
    expect(b.pending).toBe(7);
    expect(b.pendingOpenEnded).toBe(true);
  });

  it('counts nothing when the terms lie outside the year', () => {
    const before = termsBalance({ ...base, termsStart: '2024-01-01', termsEnd: '2025-03-01', entries: run('2026-01-01', 5, 'L'), today: '2026-06-01' });
    expect(before).toMatchObject({ outsideTerms: true, accrued: 0, taken: 0, booked: 0, remaining: 0 });
    const after = termsBalance({ ...base, termsStart: '2027-02-01', entries: [], today: '2026-06-01' });
    expect(after.outsideTerms).toBe(true);
  });

  it('counts nothing before the terms start this year (accrual not yet begun)', () => {
    const b = termsBalance({ ...base, termsStart: '2026-07-01', entries: [], today: '2026-06-01' });
    expect(b.outsideTerms).toBe(false);
    expect(b.accrued).toBe(0);
  });

  it('refuses a bad today', () => {
    expect(() => termsBalance({ ...base, entries: [], today: '1 June' })).toThrow(RangeError);
  });
});

describe('termsBalance: ratio (time for time)', () => {
  const base = { allowance: { kind: 'ratio' as const, on: 2, off: 1 }, termsStart: '2026-01-01', termsEnd: null, pending: [], policy: NO_FLAGS };

  it('earns from days on board up to today and uses rotation leave', () => {
    const entries = [...run('2026-01-01', 28, 'F'), ...run('2026-01-29', 10, 'R'), ...run('2026-02-08', 2, 'R')];
    const b = termsBalance({ ...base, entries, today: '2026-02-05' });
    expect(b.onBoardDays).toBe(28);
    expect(b.accrued).toBe(14);
    expect(b.taken).toBe(8);
    expect(b.booked).toBe(4);
    expect(b.remaining).toBe(2);
    expect(b.yearAllowance).toBe(121.67);
  });

  it('earns from sick on board and PBQ, never from future days on board', () => {
    const entries = [...run('2026-03-01', 3, 'Q'), ...run('2026-03-04', 3, 'F'), ...run('2026-03-20', 10, 'F')];
    const b = termsBalance({ ...base, allowance: { kind: 'ratio', on: 1, off: 1 }, entries, today: '2026-03-10' });
    expect(b.onBoardDays).toBe(6);
    expect(b.accrued).toBe(6);
  });

  it('uses holiday and, by policy, medical days; travel uses nothing', () => {
    const entries = [...run('2026-04-01', 2, 'L'), ...run('2026-04-03', 2, 'M'), ...run('2026-04-05', 3, 'T')];
    expect(termsBalance({ ...base, entries, today: '2026-04-30' }).taken).toBe(2);
    expect(termsBalance({ ...base, entries, today: '2026-04-30', policy: { ...NO_FLAGS, sickAffectsBalance: true } }).taken).toBe(4);
  });

  it('counts pending rotation leave', () => {
    const b = termsBalance({ ...base, entries: [], today: '2026-04-30', pending: [{ leaveTypeKey: 'rotation', start: '2026-05-01', end: '2026-05-14' }] });
    expect(b.pending).toBe(14);
  });
});

describe('words', () => {
  it('says a number of days', () => {
    expect(daysText(0)).toBe('0 days');
    expect(daysText(1)).toBe('1 day');
    expect(daysText(-1)).toBe('-1 day');
    expect(daysText(12.5)).toBe('12.5 days');
    expect(daysText(4.25)).toBe('4.25 days');
    expect(daysText(121.666)).toBe('121.67 days');
  });

  it('names where the allowance comes from', () => {
    expect(allowanceSourceText({ kind: 'days_per_year', daysPerYear: 30 })).toBe('Employment terms: 30 days a year (2.50 a month)');
    expect(allowanceSourceText({ kind: 'ratio', on: 2, off: 1 })).toBe('Employment terms: 2:1 on/off rotation, time for time');
    expect(allowanceSourceText({ kind: 'none' })).toBe('Employment terms: no leave allowance');
    expect(allowanceSourceText({ kind: 'policy', reason: 'no_terms' })).toMatch(/vessel's leave policy/);
    expect(allowanceSourceText({ kind: 'policy', reason: 'invalid' })).toMatch(/could not be read/);
  });

  it('gives a calendar year', () => {
    expect(calendarYear('2026-07-04')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(() => calendarYear('2026-02-30')).toThrow(RangeError);
  });
});
