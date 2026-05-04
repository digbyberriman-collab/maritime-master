import { describe, expect, it } from 'vitest';
import {
  calculateLeave,
  calculateEntitlement,
  calculateAccrued,
  detectOverlaps,
  DEFAULT_LEAVE_POLICY,
  LeavePolicy,
} from '@/modules/leave/lib/leaveCalculator';

const POLICY = DEFAULT_LEAVE_POLICY;

const mkInput = (overrides: Partial<Parameters<typeof calculateLeave>[0]> = {}) => ({
  asOf: new Date(2026, 11, 31), // 31 Dec 2026
  employmentStart: new Date(2026, 0, 1),
  contractStart: null,
  employmentEnd: null,
  contractEnd: null,
  carryoverDays: 0,
  entries: [],
  bookedRequests: [],
  policy: POLICY,
  year: 2026,
  ...overrides,
});

describe('leave calculator', () => {
  it('full year of employment accrues full entitlement', () => {
    const r = calculateLeave(mkInput());
    expect(r.entitlement).toBe(28);
    expect(r.accrued).toBeCloseTo(28, 1);
    expect(r.taken).toBe(0);
    expect(r.remaining).toBe(28);
  });

  it('mid-year joiner accrues pro-rata', () => {
    const r = calculateLeave(
      mkInput({
        employmentStart: new Date(2026, 6, 1), // 1 Jul 2026
        asOf: new Date(2026, 11, 31),
      })
    );
    // Roughly half entitlement
    expect(r.entitlement).toBeGreaterThan(13);
    expect(r.entitlement).toBeLessThan(15);
    expect(r.accrued).toBeGreaterThan(13);
    expect(r.accrued).toBeLessThan(15);
  });

  it('mid-month joiner is pro-rated within the month', () => {
    // Joined 16 Jan, so January is half-active
    const r = calculateLeave(
      mkInput({
        employmentStart: new Date(2026, 0, 16),
        asOf: new Date(2026, 0, 31),
      })
    );
    // 16 days out of 31 in Jan ⇒ ~0.5 of monthly accrual (28/12 ≈ 2.33)
    expect(r.accrued).toBeGreaterThan(1.0);
    expect(r.accrued).toBeLessThan(1.5);
  });

  it('mid-year leaver caps accrual', () => {
    const r = calculateLeave(
      mkInput({
        employmentStart: new Date(2026, 0, 1),
        employmentEnd: new Date(2026, 5, 30), // 30 Jun 2026
        asOf: new Date(2026, 11, 31),
      })
    );
    expect(r.entitlement).toBeGreaterThan(13);
    expect(r.entitlement).toBeLessThan(15);
    expect(r.accrued).toBeLessThan(15);
  });

  it('approved leave deducts from balance', () => {
    const r = calculateLeave(
      mkInput({
        asOf: new Date(2026, 11, 31),
        entries: [
          { date: '2026-03-01', status_code: 'L' },
          { date: '2026-03-02', status_code: 'L' },
          { date: '2026-03-03', status_code: 'L' },
        ],
      })
    );
    expect(r.taken).toBe(3);
    expect(r.remaining).toBe(28 - 3);
  });

  it('rejected requests do not deduct', () => {
    const r = calculateLeave(
      mkInput({
        bookedRequests: [
          { start_date: '2027-01-01', end_date: '2027-01-05', status: 'rejected', leave_type: 'L' },
        ],
      })
    );
    expect(r.booked).toBe(0);
    expect(r.remaining).toBe(28);
  });

  it('cancelled requests do not deduct', () => {
    const r = calculateLeave(
      mkInput({
        bookedRequests: [
          { start_date: '2027-01-01', end_date: '2027-01-05', status: 'cancelled', leave_type: 'L' },
        ],
      })
    );
    expect(r.booked).toBe(0);
    expect(r.remaining).toBe(28);
  });

  it('approved future leave counts as booked', () => {
    const r = calculateLeave(
      mkInput({
        asOf: new Date(2026, 5, 1),
        bookedRequests: [
          { start_date: '2026-08-01', end_date: '2026-08-05', status: 'approved', leave_type: 'L' },
        ],
      })
    );
    expect(r.booked).toBe(5);
    expect(r.next_leave_start).toBe('2026-08-01');
  });

  it('booked deducts from available when policy requires', () => {
    const r = calculateLeave(
      mkInput({
        asOf: new Date(2026, 5, 1),
        bookedRequests: [
          { start_date: '2026-08-01', end_date: '2026-08-05', status: 'approved', leave_type: 'L' },
        ],
      })
    );
    const r2 = calculateLeave(
      mkInput({
        asOf: new Date(2026, 5, 1),
        bookedRequests: [
          { start_date: '2026-08-01', end_date: '2026-08-05', status: 'approved', leave_type: 'L' },
        ],
        policy: { ...POLICY, booked_deducts_available: false },
      })
    );
    expect(r2.available - r.available).toBeCloseTo(5, 1);
  });

  it('sick leave does not deduct unless policy says so', () => {
    const base = calculateLeave(
      mkInput({
        entries: [
          { date: '2026-03-01', status_code: 'M' },
          { date: '2026-03-02', status_code: 'M' },
        ],
      })
    );
    expect(base.taken).toBe(0);

    const includesSick = calculateLeave(
      mkInput({
        entries: [
          { date: '2026-03-01', status_code: 'M' },
          { date: '2026-03-02', status_code: 'M' },
        ],
        policy: { ...POLICY, sick_affects_balance: true },
      })
    );
    expect(includesSick.taken).toBe(2);
  });

  it('carryover is added to remaining', () => {
    const r = calculateLeave(mkInput({ carryoverDays: 10 }));
    expect(r.carryover).toBe(10);
    expect(r.remaining).toBe(28 + 10);
  });

  it('contract method gives full entitlement once contract starts', () => {
    const policy: LeavePolicy = { ...POLICY, accrual_method: 'contract' };
    const r = calculateLeave(
      mkInput({
        employmentStart: new Date(2026, 5, 15),
        asOf: new Date(2026, 5, 16),
        policy,
      })
    );
    expect(r.accrued).toBe(28);
  });

  it('detects overlapping requests', () => {
    const overlaps = detectOverlaps([
      { id: 'a', start_date: '2026-04-01', end_date: '2026-04-10', status: 'approved' },
      { id: 'b', start_date: '2026-04-05', end_date: '2026-04-15', status: 'pending' },
      { id: 'c', start_date: '2026-05-01', end_date: '2026-05-05', status: 'approved' },
    ]);
    expect(overlaps).toEqual([['a', 'b']]);
  });

  it('rounding step rounds to nearest half-day', () => {
    const policy: LeavePolicy = { ...POLICY, rounding_step: 0.5 };
    const r = calculateLeave(
      mkInput({
        employmentStart: new Date(2026, 0, 16),
        asOf: new Date(2026, 0, 31),
        policy,
      })
    );
    expect(r.accrued % 0.5).toBe(0);
  });

  it('handles null employment + contract dates without throwing', () => {
    const r = calculateLeave(
      mkInput({
        employmentStart: null,
        contractStart: null,
        employmentEnd: null,
        contractEnd: null,
      })
    );
    expect(r.accrued).toBe(0);
    expect(r.taken).toBe(0);
    expect(r.booked).toBe(0);
    // entitlement falls back to full policy entitlement
    expect(r.entitlement).toBe(28);
  });

  it('uses contract_start when employment_start missing', () => {
    const r = calculateLeave(
      mkInput({
        employmentStart: null,
        contractStart: new Date(2026, 0, 1),
        asOf: new Date(2026, 11, 31),
      })
    );
    expect(r.accrued).toBeCloseTo(28, 1);
  });

  it('counts entries even when employment dates are null', () => {
    // Crew profile may be missing dates but calendar entries still recorded.
    const r = calculateLeave(
      mkInput({
        employmentStart: null,
        contractStart: null,
        entries: [
          { date: '2026-03-01', status_code: 'L' },
          { date: '2026-03-02', status_code: 'L' },
        ],
      })
    );
    expect(r.taken).toBe(2);
  });

  it('booked future leave with null employment dates still surfaces', () => {
    const r = calculateLeave(
      mkInput({
        employmentStart: null,
        contractStart: null,
        asOf: new Date(2026, 5, 1),
        bookedRequests: [
          { start_date: '2026-08-01', end_date: '2026-08-05', status: 'approved', leave_type: 'L' },
        ],
      })
    );
    expect(r.booked).toBe(5);
    expect(r.next_leave_start).toBe('2026-08-01');
  });
});
