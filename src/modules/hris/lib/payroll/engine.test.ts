import { describe, expect, it } from 'vitest';
import {
  basePeriodMinor,
  calculateGratuitySplit,
  calculatePayrollLine,
  gratuityWeight,
  sumShares,
  type DayCounts,
} from './engine';

const fullMonth: DayCounts = { daysInPeriod: 30, daysOnboard: 30, daysLeavePaid: 0, daysTravel: 0, daysUnpaid: 0 };

describe('basePeriodMinor', () => {
  it('converts annual and weekly to a monthly base', () => {
    expect(basePeriodMinor(1_200_000, 'annual', 30)).toBe(100_000);
    expect(basePeriodMinor(10_000, 'weekly', 30)).toBe(43_333); // 10,000 * 52 / 12 = 43,333.33
    expect(basePeriodMinor(500_000, 'monthly', 30)).toBe(500_000);
    expect(basePeriodMinor(20_000, 'daily', 30)).toBe(600_000);
  });
});

describe('calculatePayrollLine (salaried)', () => {
  it('pays the full monthly base for a full month onboard', () => {
    const r = calculatePayrollLine({ baseSalaryMinor: 500_000, payFrequency: 'monthly', allowances: [] }, fullMonth);
    expect(r.daysPaid).toBe(30);
    expect(r.prorationRatio).toBe(1);
    expect(r.proratedBaseMinor).toBe(500_000);
    expect(r.netMinor).toBe(500_000);
  });

  it('pays rotational leave (time-for-time) in full: leave days are paid days', () => {
    const r = calculatePayrollLine(
      { baseSalaryMinor: 500_000, payFrequency: 'monthly', allowances: [] },
      { daysInPeriod: 30, daysOnboard: 15, daysLeavePaid: 15, daysTravel: 0, daysUnpaid: 0 },
    );
    expect(r.daysPaid).toBe(30);
    expect(r.proratedBaseMinor).toBe(500_000);
  });

  it('prorates unpaid leave days', () => {
    const r = calculatePayrollLine(
      { baseSalaryMinor: 300_000, payFrequency: 'monthly', allowances: [] },
      { daysInPeriod: 30, daysOnboard: 20, daysLeavePaid: 0, daysTravel: 0, daysUnpaid: 10 },
    );
    expect(r.daysPaid).toBe(20);
    expect(r.proratedBaseMinor).toBe(200_000);
  });

  it('treats travel days as unpaid when the company setting says so', () => {
    const days: DayCounts = { daysInPeriod: 31, daysOnboard: 28, daysLeavePaid: 0, daysTravel: 3, daysUnpaid: 0 };
    const paid = calculatePayrollLine({ baseSalaryMinor: 310_000, payFrequency: 'monthly', allowances: [] }, days);
    const unpaid = calculatePayrollLine({ baseSalaryMinor: 310_000, payFrequency: 'monthly', allowances: [] }, days, 0, {
      travelDaysPaid: false,
      roundingMinor: 1,
    });
    expect(paid.proratedBaseMinor).toBe(310_000);
    expect(unpaid.daysPaid).toBe(28);
    expect(unpaid.proratedBaseMinor).toBe(280_000);
  });

  it('prorates recurring allowances by default and leaves fixed ones alone', () => {
    const r = calculatePayrollLine(
      {
        baseSalaryMinor: 300_000,
        payFrequency: 'monthly',
        allowances: [
          { name: 'Uniform', amount_minor: 3_000 },
          { name: 'Phone', amount_minor: 5_000, prorate: false },
          { name: 'One-off bonus', amount_minor: 99_999, recurring: false },
        ],
      },
      { daysInPeriod: 30, daysOnboard: 15, daysLeavePaid: 0, daysTravel: 0, daysUnpaid: 15 },
    );
    expect(r.allowanceDetail).toEqual([
      { name: 'Uniform', amount_minor: 1_500 },
      { name: 'Phone', amount_minor: 5_000 },
    ]);
    expect(r.allowancesMinor).toBe(6_500);
    expect(r.grossMinor).toBe(150_000 + 6_500);
  });

  it('adds gratuity to gross and rounds net down to the configured unit', () => {
    const r = calculatePayrollLine({ baseSalaryMinor: 123_456, payFrequency: 'monthly', allowances: [] }, fullMonth, 7_777, {
      travelDaysPaid: true,
      roundingMinor: 100,
    });
    expect(r.grossMinor).toBe(131_233);
    expect(r.netMinor).toBe(131_200);
  });
});

describe('calculatePayrollLine (daily)', () => {
  it('pays daily rate × onboard days (plus travel when paid)', () => {
    const days: DayCounts = { daysInPeriod: 30, daysOnboard: 12, daysLeavePaid: 10, daysTravel: 2, daysUnpaid: 6 };
    const r = calculatePayrollLine({ baseSalaryMinor: 25_000, payFrequency: 'daily', allowances: [] }, days);
    expect(r.daysPaid).toBe(14);
    expect(r.proratedBaseMinor).toBe(350_000);
    const noTravel = calculatePayrollLine({ baseSalaryMinor: 25_000, payFrequency: 'daily', allowances: [] }, days, 0, {
      travelDaysPaid: false,
      roundingMinor: 1,
    });
    expect(noTravel.proratedBaseMinor).toBe(300_000);
  });
});

describe('gratuity split', () => {
  const crew = [
    { profileId: 'capt', daysOnboard: 30, points: 2.0, createdAt: '1' },
    { profileId: 'co', daysOnboard: 30, points: 1.6, createdAt: '2' },
    { profileId: 'dh', daysOnboard: 15, points: 1.0, createdAt: '3' },
    { profileId: 'stw', daysOnboard: 0, points: 1.0, createdAt: '4' },
  ];

  it('weights per method', () => {
    expect(gratuityWeight('equal', 2, 30)).toBe(1);
    expect(gratuityWeight('points', 2, 30)).toBe(2);
    expect(gratuityWeight('days_weighted', 2, 30)).toBe(30);
    expect(gratuityWeight('points_days', 2, 30)).toBe(60);
  });

  it('splits equally among crew with onboard days and always sums to the pool', () => {
    const shares = calculateGratuitySplit(100_001, 'equal', crew);
    const active = shares.filter((s) => !s.excluded);
    expect(active).toHaveLength(3);
    expect(sumShares(shares)).toBe(100_001);
    expect(shares.find((s) => s.profileId === 'stw')?.amountMinor).toBe(0);
    // floor(33333.67) = 33333 each, remainder 2 to the first largest weight (tie → earliest)
    expect(shares.find((s) => s.profileId === 'capt')?.amountMinor).toBe(33_335);
  });

  it('points × days weighting favours senior crew with more days', () => {
    const shares = calculateGratuitySplit(1_000_000, 'points_days', crew);
    const byId = Object.fromEntries(shares.map((s) => [s.profileId, s]));
    // weights: 60, 48, 15 → total 123
    expect(byId.capt.weight).toBe(60);
    expect(byId.co.weight).toBe(48);
    expect(byId.dh.weight).toBe(15);
    expect(byId.capt.amountMinor).toBeGreaterThan(byId.co.amountMinor);
    expect(byId.co.amountMinor).toBeGreaterThan(byId.dh.amountMinor);
    expect(sumShares(shares)).toBe(1_000_000);
  });

  it('honours manual exclusions', () => {
    const shares = calculateGratuitySplit(90_000, 'equal', [
      ...crew.slice(0, 2),
      { profileId: 'dh', daysOnboard: 15, points: 1, excluded: true },
    ]);
    expect(shares.find((s) => s.profileId === 'dh')?.amountMinor).toBe(0);
    expect(sumShares(shares)).toBe(90_000);
    expect(shares.find((s) => s.profileId === 'capt')?.amountMinor).toBe(45_000);
  });

  it('returns zeros when nobody is eligible', () => {
    const shares = calculateGratuitySplit(50_000, 'points', [{ profileId: 'x', daysOnboard: 0, points: 1 }]);
    expect(sumShares(shares)).toBe(0);
  });
});
