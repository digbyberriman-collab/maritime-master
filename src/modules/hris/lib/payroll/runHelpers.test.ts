import { describe, expect, it } from 'vitest';
import {
  buildRunNumber,
  computePayrollKpis,
  filterRuns,
  nextRunSequence,
  parseBreakdown,
  recomputeLine,
  runNumberPrefix,
  runToCsv,
  totalRun,
  vesselCode,
  type CsvLine,
  type PayrollRunListItem,
} from './runHelpers';
import { payslipFileName } from './payslip';

describe('run numbers', () => {
  it('derives a short vessel code and falls back to CO', () => {
    expect(vesselCode('M/Y Sea Breeze')).toBe('SEAB');
    expect(vesselCode('Draak')).toBe('DRAA');
    expect(vesselCode('MY Ocean-9')).toBe('OCEA');
    expect(vesselCode(null)).toBe('CO');
    expect(vesselCode('   ')).toBe('CO');
  });

  it('builds PR-<code>-<yyyymm>-<n> with the next free sequence', () => {
    expect(runNumberPrefix('Draak', '2026-09-01')).toBe('PR-DRAA-202609');
    expect(nextRunSequence([], 'PR-DRAA-202609')).toBe(1);
    expect(nextRunSequence(['PR-DRAA-202609-1', 'PR-DRAA-202609-3', 'PR-DRAA-202608-9', 'PR-CO-202609-2'], 'PR-DRAA-202609')).toBe(4);
    expect(buildRunNumber({ vesselName: null, periodStart: '2026-01-15', existingRunNumbers: ['PR-CO-202601-1'] })).toBe('PR-CO-202601-2');
  });
});

describe('recomputeLine', () => {
  const base = { prorated_base_minor: 400_000, allowances_minor: 20_000, gratuity_minor: 15_000, fx_rate_to_run: null };

  it('mirrors the SQL: gross = base + allowances + gratuity + other; net = gross - deductions', () => {
    const r = recomputeLine({ ...base, other_earnings_minor: 5_000, deductions_minor: 12_345 }, 1);
    expect(r.gross_minor).toBe(440_000);
    expect(r.net_minor).toBe(427_655);
    expect(r.net_run_currency_minor).toBeNull();
  });

  it('floors net to the rounding unit and converts to the run currency', () => {
    const r = recomputeLine({ ...base, other_earnings_minor: 0, deductions_minor: 1, fx_rate_to_run: 1.1 }, 100);
    expect(r.gross_minor).toBe(435_000);
    expect(r.net_minor).toBe(434_900);
    expect(r.net_run_currency_minor).toBe(478_390);
  });

  it('treats a zero rounding unit as 1', () => {
    expect(recomputeLine({ ...base, other_earnings_minor: 0, deductions_minor: 0 }, 0).net_minor).toBe(435_000);
  });
});

describe('totalRun', () => {
  it('ignores excluded lines and uses run-currency nets', () => {
    const t = totalRun([
      { status: 'calculated', gross_minor: 100_000, deductions_minor: 10_000, net_minor: 90_000, net_run_currency_minor: null, fx_rate_to_run: null },
      { status: 'adjusted', gross_minor: 200_000, deductions_minor: 0, net_minor: 200_000, net_run_currency_minor: 220_000, fx_rate_to_run: 1.1 },
      { status: 'excluded', gross_minor: 999_999, deductions_minor: 999, net_minor: 999_000, net_run_currency_minor: null, fx_rate_to_run: null },
    ]);
    expect(t.headcount).toBe(2);
    expect(t.total_gross_minor).toBe(100_000 + 220_000);
    expect(t.total_deductions_minor).toBe(10_000);
    expect(t.total_net_minor).toBe(90_000 + 220_000);
  });
});

describe('parseBreakdown', () => {
  it('tolerates missing or malformed json', () => {
    expect(parseBreakdown(null).allowances).toEqual([]);
    expect(parseBreakdown('nonsense').days.onboard).toBe(0);
    const b = parseBreakdown({ allowances: [{ name: 'Uniform', amount_minor: 1000 }, 'junk'], days: { onboard: 20, unpaid: 2 }, travel_days_paid: false });
    expect(b.allowances).toEqual([{ name: 'Uniform', amount_minor: 1000 }]);
    expect(b.days).toEqual({ onboard: 20, leave: 0, travel: 0, unpaid: 2, unknown: 0 });
    expect(b.travel_days_paid).toBe(false);
  });
});

const run = (over: Partial<PayrollRunListItem>): PayrollRunListItem => ({
  id: 'r',
  company_id: 'c',
  vessel_id: null,
  pay_period_id: 'p',
  run_number: 'PR-CO-202609-1',
  currency: 'EUR',
  status: 'draft',
  headcount: 0,
  total_gross_minor: 0,
  total_deductions_minor: 0,
  total_net_minor: 0,
  calculated_at: null,
  submitted_by: null,
  submitted_at: null,
  approved_by: null,
  approved_at: null,
  paid_at: null,
  notes: null,
  created_by: null,
  updated_by: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  vessel_name: null,
  period_label: 'Sep 2026',
  period_start: '2026-09-01',
  period_end: '2026-09-30',
  ...over,
});

describe('filters and KPIs', () => {
  const runs = [
    run({ id: '1', status: 'draft' }),
    run({ id: '2', status: 'calculated', vessel_id: 'v1' }),
    run({ id: '3', status: 'pending_approval' }),
    run({ id: '4', status: 'paid', total_net_minor: 1_000_00, period_start: '2026-03-01' }),
    run({ id: '5', status: 'paid', total_net_minor: 500_00, currency: 'USD', period_start: '2025-12-01' }),
  ];

  it('filters by vessel, status and year', () => {
    expect(filterRuns(runs, { vesselId: 'company', status: 'all', year: 'all' }).map((r) => r.id)).toEqual(['1', '3', '4', '5']);
    expect(filterRuns(runs, { vesselId: 'v1', status: 'all', year: 'all' }).map((r) => r.id)).toEqual(['2']);
    expect(filterRuns(runs, { vesselId: 'all', status: 'paid', year: 2025 }).map((r) => r.id)).toEqual(['5']);
  });

  it('counts drafts, approvals and paid totals for the year per currency', () => {
    const k = computePayrollKpis(runs, 2026);
    expect(k.draftRuns).toBe(2);
    expect(k.awaitingApproval).toBe(1);
    expect(k.paidThisYear.runs).toBe(1);
    expect(k.paidThisYear.byCurrency).toEqual({ EUR: 100_000 });
  });
});

describe('payslipFileName', () => {
  it('slugifies run number and crew name', () => {
    expect(payslipFileName('PR-DRAA-202609-1', 'José Ångström-Smith')).toBe('payslip-pr-draa-202609-1-jose-angstrom-smith.pdf');
    expect(payslipFileName('', '')).toBe('payslip-run-crew.pdf');
  });
});

describe('runToCsv', () => {
  it('quotes cells with commas and writes major units', () => {
    const line = {
      id: 'l', run_id: 'r', company_id: 'c', profile_id: 'p', compensation_id: null, pay_grade_id: null, vessel_id: null,
      currency: 'EUR', pay_frequency: 'monthly', days_in_period: 30, days_onboard: 30, days_leave_paid: 0, days_travel: 0, days_unpaid: 0, days_paid: 30,
      proration_ratio: 1, base_period_minor: 500_000, prorated_base_minor: 500_000, allowances_minor: 0, gratuity_minor: 0, other_earnings_minor: 0,
      deductions_minor: 0, gross_minor: 500_000, net_minor: 500_000, fx_rate_to_run: null, net_run_currency_minor: null, breakdown: {}, status: 'calculated',
      payslip_path: null, payslip_generated_at: null, notes: 'late, adjusted', created_at: '', updated_at: '',
      crew_name: 'Doe, Jane', rank: 'Chef', department: 'Interior',
    } satisfies CsvLine;
    const csv = runToCsv({ run_number: 'PR-CO-202609-1', currency: 'EUR' }, [line]);
    const [header, row] = csv.split('\n');
    expect(header.startsWith('Run,Crew,Rank')).toBe(true);
    expect(row).toContain('"Doe, Jane"');
    expect(row).toContain('5000.00');
    expect(row.endsWith('"late, adjusted"')).toBe(true);
  });
});
