import { describe, expect, it } from 'vitest';
import {
  availablePoolYears,
  canApprovePool,
  canCancelPool,
  canDeletePool,
  canMarkDistributed,
  computeGratuityKpis,
  csvFileName,
  emptyPoolFormValues,
  filterPools,
  finalAmountMinor,
  gratuityCsvRows,
  isDistributionLocked,
  isPoolEditable,
  netAmountMinor,
  poolFormSchema,
  poolFormToPayload,
  poolStepIndex,
  poolToFormValues,
  previewAllMethods,
  previewParticipants,
  previewSplit,
  reconcile,
  toCsv,
  type CsvDistribution,
  type GratuityDistributionRow,
  type GratuityPoolRow,
} from '@/modules/hris/lib/gratuities';
import { sumShares } from '@/modules/hris/lib/payroll/engine';

const pool = (overrides: Partial<GratuityPoolRow> = {}): GratuityPoolRow => ({
  id: 'pool-1',
  company_id: 'co',
  vessel_id: 'v1',
  name: 'Med charter, week 32',
  source: 'charter',
  received_date: '2026-08-14',
  period_start: '2026-08-07',
  period_end: '2026-08-14',
  currency: 'EUR',
  gross_amount_minor: 1_000_000,
  deductions_minor: 50_000,
  deductions_note: null,
  split_method: 'points_days',
  status: 'calculated',
  calculated_at: null,
  approved_by: null,
  approved_at: null,
  distributed_at: null,
  notes: null,
  created_by: null,
  updated_by: null,
  created_at: '2026-08-14T00:00:00Z',
  updated_at: '2026-08-14T00:00:00Z',
  ...overrides,
});

const dist = (overrides: Partial<GratuityDistributionRow> = {}): GratuityDistributionRow => ({
  id: overrides.id ?? `d-${overrides.profile_id ?? 'p1'}`,
  pool_id: 'pool-1',
  company_id: 'co',
  profile_id: 'p1',
  days_onboard: 7,
  points: 1,
  weight: 7,
  share_ratio: 0,
  amount_minor: 0,
  adjustment_minor: 0,
  adjustment_reason: null,
  excluded: false,
  exclusion_reason: null,
  payout_status: 'pending',
  paid_at: null,
  payroll_line_id: null,
  created_at: '2026-08-14T00:00:00Z',
  updated_at: '2026-08-14T00:00:00Z',
  ...overrides,
});

describe('money helpers', () => {
  it('net = gross − deductions, never negative', () => {
    expect(netAmountMinor(pool())).toBe(950_000);
    expect(netAmountMinor(pool({ gross_amount_minor: 100, deductions_minor: 500 }))).toBe(0);
  });

  it('final = amount + adjustment, zero when excluded', () => {
    expect(finalAmountMinor(dist({ amount_minor: 1000, adjustment_minor: -250 }))).toBe(750);
    expect(finalAmountMinor(dist({ amount_minor: 1000, adjustment_minor: 500, excluded: true }))).toBe(0);
  });
});

describe('reconcile', () => {
  it('reports zero difference when shares sum to net', () => {
    const rec = reconcile(pool(), [dist({ profile_id: 'p1', amount_minor: 475_000 }), dist({ profile_id: 'p2', amount_minor: 475_000 })]);
    expect(rec.netMinor).toBe(950_000);
    expect(rec.allocatedMinor).toBe(950_000);
    expect(rec.finalMinor).toBe(950_000);
    expect(rec.differenceMinor).toBe(0);
    expect(rec.participants).toBe(2);
    expect(rec.excluded).toBe(0);
  });

  it('surfaces adjustments and exclusions in the difference', () => {
    const rec = reconcile(pool(), [
      dist({ profile_id: 'p1', amount_minor: 950_000, adjustment_minor: 10_000 }),
      dist({ profile_id: 'p2', amount_minor: 0, excluded: true, adjustment_minor: 999 }),
    ]);
    expect(rec.adjustmentsMinor).toBe(10_000);
    expect(rec.finalMinor).toBe(960_000);
    expect(rec.differenceMinor).toBe(10_000);
    expect(rec.excluded).toBe(1);
  });
});

describe('preview', () => {
  const rows = [
    dist({ profile_id: 'p1', days_onboard: 10, points: 2, created_at: '2026-08-01T00:00:00Z' }),
    dist({ profile_id: 'p2', days_onboard: 5, points: 1, created_at: '2026-08-02T00:00:00Z' }),
    dist({ profile_id: 'p3', days_onboard: 5, points: 1, excluded: true, created_at: '2026-08-03T00:00:00Z' }),
  ];

  it('maps distributions to engine participants and honours overrides', () => {
    const participants = previewParticipants(rows, { p3: false, p1: true });
    expect(participants.map((p) => p.excluded)).toEqual([true, false, false]);
    expect(participants[0]).toMatchObject({ profileId: 'p1', daysOnboard: 10, points: 2, createdAt: '2026-08-01T00:00:00Z' });
  });

  it('splits exactly under every method', () => {
    const participants = previewParticipants(rows);
    const all = previewAllMethods(950_001, participants);
    for (const method of ['equal', 'points', 'days_weighted', 'points_days'] as const) {
      const shares = Array.from(all[method].values());
      expect(sumShares(shares)).toBe(950_001);
      expect(all[method].get('p3')?.amountMinor).toBe(0);
    }
    expect(previewSplit(1000, 'equal', participants).get('p1')?.amountMinor).toBe(500);
    expect(previewSplit(1000, 'points_days', participants).get('p1')?.amountMinor).toBe(800);
  });
});

describe('status gates', () => {
  it('follows the pool lifecycle', () => {
    expect(isPoolEditable('draft')).toBe(true);
    expect(isPoolEditable('calculated')).toBe(true);
    expect(isPoolEditable('approved')).toBe(false);
    expect(canApprovePool('calculated')).toBe(true);
    expect(canApprovePool('draft')).toBe(false);
    expect(canMarkDistributed('approved')).toBe(true);
    expect(canCancelPool('distributed')).toBe(false);
    expect(canCancelPool('cancelled')).toBe(false);
    expect(canDeletePool('draft')).toBe(true);
    expect(canDeletePool('calculated')).toBe(false);
    expect(poolStepIndex('approved')).toBe(2);
    expect(poolStepIndex('cancelled')).toBe(-1);
  });

  it('locks distributions once payroll has them or the pool is closed', () => {
    expect(isDistributionLocked(dist({ payout_status: 'paid' }), 'approved')).toBe(true);
    expect(isDistributionLocked(dist({ payout_status: 'in_payroll' }), 'approved')).toBe(true);
    expect(isDistributionLocked(dist(), 'distributed')).toBe(true);
    expect(isDistributionLocked(dist(), 'calculated')).toBe(false);
  });
});

describe('list helpers', () => {
  const pools = [
    pool({ id: 'a', vessel_id: 'v1', status: 'calculated', received_date: '2026-03-01' }),
    pool({ id: 'b', vessel_id: 'v2', status: 'distributed', received_date: '2026-05-01', gross_amount_minor: 200_000, deductions_minor: 0 }),
    pool({ id: 'c', vessel_id: 'v1', status: 'cancelled', received_date: '2025-12-01' }),
    pool({ id: 'd', vessel_id: 'v1', status: 'approved', received_date: '2026-06-01', currency: 'USD', gross_amount_minor: 100_000, deductions_minor: 0 }),
  ];

  it('filters by vessel, status and year', () => {
    expect(filterPools(pools, { vesselId: 'all', status: 'all', year: 'all' }).map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(filterPools(pools, { vesselId: 'v1', status: 'all', year: 2026 }).map((p) => p.id)).toEqual(['a', 'd']);
    expect(filterPools(pools, { vesselId: 'all', status: 'cancelled', year: 'all' }).map((p) => p.id)).toEqual(['c']);
  });

  it('lists years newest first including the current one', () => {
    expect(availablePoolYears(pools, new Date(2027, 0, 1))).toEqual([2027, 2026, 2025]);
  });

  it('computes KPIs per currency', () => {
    const kpis = computeGratuityKpis(pools, 2026);
    expect(kpis.poolsThisYear).toBe(3);
    expect(kpis.receivedByCurrency).toEqual({ EUR: 950_000 + 200_000, USD: 100_000 });
    expect(kpis.distributedByCurrency).toEqual({ EUR: 200_000 });
    expect(kpis.pendingApproval).toBe(1);
  });
});

describe('pool form', () => {
  it('seeds defaults from company settings', () => {
    const v = emptyPoolFormValues({ currency: 'USD', split_method: 'equal', vessel_id: 'v9' }, new Date(2026, 8, 17));
    expect(v).toMatchObject({ currency: 'USD', split_method: 'equal', vessel_id: 'v9', received_date: '2026-09-17', period_start: '2026-09-01', period_end: '2026-09-17' });
  });

  it('round-trips a pool through the form', () => {
    const values = poolToFormValues(pool({ deductions_note: 'Agent fee' }));
    expect(values.gross_amount).toBe('10000.00');
    expect(values.deductions).toBe('500.00');
    const payload = poolFormToPayload(values);
    expect(payload).toMatchObject({ gross_amount_minor: 1_000_000, deductions_minor: 50_000, deductions_note: 'Agent fee', notes: null, currency: 'EUR' });
  });

  it('validates period order and deductions ceiling', () => {
    const base = { ...emptyPoolFormValues(), vessel_id: 'v1', name: 'Pool', gross_amount: '100' };
    expect(poolFormSchema.safeParse(base).success).toBe(true);
    expect(poolFormSchema.safeParse({ ...base, period_end: '2000-01-01' }).success).toBe(false);
    expect(poolFormSchema.safeParse({ ...base, deductions: '150' }).success).toBe(false);
    expect(poolFormSchema.safeParse({ ...base, deductions: '-1' }).success).toBe(false);
    expect(poolFormSchema.safeParse({ ...base, vessel_id: '' }).success).toBe(false);
  });
});

describe('csv export', () => {
  const rows: CsvDistribution[] = [
    { ...dist({ profile_id: 'p1', amount_minor: 60_000, adjustment_minor: 1_000, share_ratio: 0.6, weight: 6 }), crew_name: 'Ada "Cap" Lovelace', rank: 'Captain', department: 'Deck' },
    { ...dist({ profile_id: 'p2', amount_minor: 40_000, share_ratio: 0.4, weight: 4, excluded: true, exclusion_reason: 'On leave, mid-period' }), crew_name: 'Bob', rank: null, department: null },
  ];

  it('builds one row per distribution plus a totals row', () => {
    const out = gratuityCsvRows(pool({ gross_amount_minor: 100_000, deductions_minor: 0 }), 'MY Test', rows);
    expect(out).toHaveLength(4);
    expect(out[1]).toEqual([
      'Med charter, week 32', 'MY Test', '2026-08-07', '2026-08-14', 'EUR', 'Ada "Cap" Lovelace', 'Captain', 'Deck',
      '7', '1', '6', '60.00', '600.00', '10.00', '', '610.00', 'no', '', 'pending',
    ]);
    expect(out[2][15]).toBe('0.00');
    expect(out[2][16]).toBe('yes');
    expect(out[3][5]).toBe('TOTAL');
    expect(out[3][15]).toBe('610.00');
    expect(out[3][17]).toContain('difference -390.00');
  });

  it('escapes quotes and commas', () => {
    const csv = toCsv([['a', 'b,c', 'say "hi"']]);
    expect(csv).toBe('a,"b,c","say ""hi"""');
  });

  it('derives a safe file name', () => {
    expect(csvFileName(pool())).toBe('gratuities-med-charter-week-32-2026-08-14.csv');
  });
});
