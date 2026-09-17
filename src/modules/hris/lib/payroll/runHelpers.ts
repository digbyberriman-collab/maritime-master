/**
 * Pure helpers for payroll runs and lines. No Supabase or React in here so
 * everything can be unit-tested; the hooks in usePayroll.ts call these.
 *
 * Money is integer minor units. The gross/net recompute mirrors the SQL in
 * payroll_calculate_run (gross = prorated base + allowances + gratuity +
 * other earnings; net = gross - deductions floored to rounding_minor).
 */
import type { Json, Tables } from '@/integrations/supabase/types';

export type PayrollRunRow = Tables<'payroll_runs'>;
export type PayrollLineRow = Tables<'payroll_lines'>;
export type PayPeriodRow = Tables<'pay_periods'>;

export type PayrollRunStatus = 'draft' | 'calculated' | 'pending_approval' | 'approved' | 'paid' | 'cancelled';
export type PayrollLineStatus = 'calculated' | 'adjusted' | 'excluded' | 'paid';

export const RUN_STATUSES: PayrollRunStatus[] = ['draft', 'calculated', 'pending_approval', 'approved', 'paid', 'cancelled'];
/** Happy-path order for the status stepper (cancelled sits outside it). */
export const RUN_STEPS: PayrollRunStatus[] = ['draft', 'calculated', 'pending_approval', 'approved', 'paid'];

export const RUN_STATUS_BADGE_CLASS: Record<PayrollRunStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  calculated: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  pending_approval: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  approved: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  paid: 'bg-green-500/10 text-green-500 border-green-500/20',
  cancelled: 'bg-destructive/10 text-destructive border-destructive/20',
};

export const LINE_STATUS_BADGE_CLASS: Record<PayrollLineStatus, string> = {
  calculated: 'bg-muted text-muted-foreground border-border',
  adjusted: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  excluded: 'bg-destructive/10 text-destructive border-destructive/20',
  paid: 'bg-green-500/10 text-green-500 border-green-500/20',
};

export const asRunStatus = (value: string | null | undefined): PayrollRunStatus =>
  (RUN_STATUSES as string[]).includes(value ?? '') ? (value as PayrollRunStatus) : 'draft';

export const asLineStatus = (value: string | null | undefined): PayrollLineStatus =>
  (['calculated', 'adjusted', 'excluded', 'paid'] as string[]).includes(value ?? '') ? (value as PayrollLineStatus) : 'calculated';

// ---------------------------------------------------------------------------
// Run numbers: PR-<vesselcode|CO>-<yyyymm>-<n>
// ---------------------------------------------------------------------------

/** Short upper-case code for a vessel name ("M/Y Sea Breeze" → "SEAB"). Company-wide runs use "CO". */
export const vesselCode = (vesselName: string | null | undefined): string => {
  if (!vesselName) return 'CO';
  const cleaned = vesselName
    .replace(/^\s*(m\/?y|s\/?y|m\/?v|mv|my|sy)\b\.?\s*/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();
  return cleaned.slice(0, 4) || 'CO';
};

export const runNumberPrefix = (vesselName: string | null | undefined, periodStart: string): string => {
  const yyyymm = periodStart.slice(0, 7).replace('-', '');
  return `PR-${vesselCode(vesselName)}-${yyyymm}`;
};

/** Next free sequence for a prefix given the run numbers already in use. */
export const nextRunSequence = (existingRunNumbers: string[], prefix: string): number => {
  let max = 0;
  for (const rn of existingRunNumbers) {
    if (!rn.startsWith(`${prefix}-`)) continue;
    const n = Number(rn.slice(prefix.length + 1));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max + 1;
};

export const buildRunNumber = (args: { vesselName: string | null | undefined; periodStart: string; existingRunNumbers: string[] }): string => {
  const prefix = runNumberPrefix(args.vesselName, args.periodStart);
  return `${prefix}-${nextRunSequence(args.existingRunNumbers, prefix)}`;
};

// ---------------------------------------------------------------------------
// Line recompute + run totals (client-side mirror of the SQL)
// ---------------------------------------------------------------------------

export interface LineMoney {
  prorated_base_minor: number;
  allowances_minor: number;
  gratuity_minor: number;
  other_earnings_minor: number;
  deductions_minor: number;
  fx_rate_to_run: number | null;
}

export interface RecomputedLine {
  gross_minor: number;
  net_minor: number;
  net_run_currency_minor: number | null;
}

/** Postgres ROUND() on numeric rounds half away from zero. */
const roundHalfAway = (n: number): number => (n < 0 ? -Math.round(-n) : Math.round(n));

export const recomputeLine = (line: LineMoney, roundingMinor: number): RecomputedLine => {
  const rounding = Math.max(roundingMinor || 1, 1);
  const gross = line.prorated_base_minor + line.allowances_minor + line.gratuity_minor + line.other_earnings_minor;
  const net = Math.floor((gross - line.deductions_minor) / rounding) * rounding;
  const fx = line.fx_rate_to_run;
  return {
    gross_minor: gross,
    net_minor: net,
    net_run_currency_minor: fx === null || fx === undefined ? null : roundHalfAway(net * fx),
  };
}

export interface RunTotals {
  headcount: number;
  total_gross_minor: number;
  total_deductions_minor: number;
  total_net_minor: number;
}

type TotalsInput = Pick<PayrollLineRow, 'status' | 'gross_minor' | 'deductions_minor' | 'net_minor' | 'net_run_currency_minor' | 'fx_rate_to_run'>;

/** Totals in the run currency; excluded lines are ignored (same as the SQL). */
export const totalRun = (lines: TotalsInput[]): RunTotals => {
  const active = lines.filter((l) => l.status !== 'excluded');
  const toRun = (minor: number, fx: number | null) => (fx === null ? minor : roundHalfAway(minor * fx));
  return {
    headcount: active.length,
    total_gross_minor: active.reduce((s, l) => s + toRun(l.gross_minor, l.fx_rate_to_run), 0),
    total_deductions_minor: active.reduce((s, l) => s + toRun(l.deductions_minor, l.fx_rate_to_run), 0),
    total_net_minor: active.reduce((s, l) => s + (l.net_run_currency_minor ?? l.net_minor), 0),
  };
};

// ---------------------------------------------------------------------------
// Breakdown JSON
// ---------------------------------------------------------------------------

export interface LineBreakdown {
  allowances: { name: string; amount_minor: number }[];
  days: { onboard: number; leave: number; travel: number; unpaid: number; unknown: number };
  travel_days_paid: boolean;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

export const parseBreakdown = (json: Json | null | undefined): LineBreakdown => {
  const obj = json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, Json | undefined>) : {};
  const rawAllow = Array.isArray(obj.allowances) ? obj.allowances : [];
  const allowances = rawAllow
    .map((a) => {
      if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
      const rec = a as Record<string, Json | undefined>;
      return { name: typeof rec.name === 'string' ? rec.name : 'Allowance', amount_minor: num(rec.amount_minor) };
    })
    .filter((a): a is { name: string; amount_minor: number } => a !== null);
  const rawDays = obj.days && typeof obj.days === 'object' && !Array.isArray(obj.days) ? (obj.days as Record<string, Json | undefined>) : {};
  return {
    allowances,
    days: {
      onboard: num(rawDays.onboard),
      leave: num(rawDays.leave),
      travel: num(rawDays.travel),
      unpaid: num(rawDays.unpaid),
      unknown: num(rawDays.unknown),
    },
    travel_days_paid: obj.travel_days_paid !== false,
  };
};

// ---------------------------------------------------------------------------
// List filters + KPIs
// ---------------------------------------------------------------------------

export interface PayrollRunFilters {
  vesselId: 'all' | 'company' | string;
  status: 'all' | PayrollRunStatus;
  year: 'all' | number;
}

export const DEFAULT_RUN_FILTERS: PayrollRunFilters = { vesselId: 'all', status: 'all', year: 'all' };

export interface PayrollRunListItem extends PayrollRunRow {
  vessel_name: string | null;
  period_label: string | null;
  period_start: string | null;
  period_end: string | null;
}

export const runYear = (run: Pick<PayrollRunListItem, 'period_start' | 'created_at'>): number =>
  Number((run.period_start ?? run.created_at).slice(0, 4));

export const filterRuns = (runs: PayrollRunListItem[], filters: PayrollRunFilters): PayrollRunListItem[] =>
  runs.filter((r) => {
    if (filters.vesselId === 'company' && r.vessel_id) return false;
    if (filters.vesselId !== 'all' && filters.vesselId !== 'company' && r.vessel_id !== filters.vesselId) return false;
    if (filters.status !== 'all' && r.status !== filters.status) return false;
    if (filters.year !== 'all' && runYear(r) !== filters.year) return false;
    return true;
  });

export interface PayrollKpis {
  draftRuns: number;
  awaitingApproval: number;
  paidThisYear: { totalNetMinor: number; runs: number; byCurrency: Record<string, number> };
}

export const computePayrollKpis = (runs: PayrollRunListItem[], year: number): PayrollKpis => {
  const paid = runs.filter((r) => r.status === 'paid' && runYear(r) === year);
  const byCurrency: Record<string, number> = {};
  for (const r of paid) byCurrency[r.currency] = (byCurrency[r.currency] ?? 0) + r.total_net_minor;
  return {
    draftRuns: runs.filter((r) => r.status === 'draft' || r.status === 'calculated').length,
    awaitingApproval: runs.filter((r) => r.status === 'pending_approval').length,
    paidThisYear: { totalNetMinor: paid.reduce((s, r) => s + r.total_net_minor, 0), runs: paid.length, byCurrency },
  };
};

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

export interface CsvLine extends PayrollLineRow {
  crew_name: string;
  rank: string | null;
  department: string | null;
}

const csvCell = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const major = (minor: number | null | undefined): string => (minor === null || minor === undefined ? '' : (minor / 100).toFixed(2));

export const runToCsv = (run: Pick<PayrollRunRow, 'run_number' | 'currency'>, lines: CsvLine[]): string => {
  const header = [
    'Run', 'Crew', 'Rank', 'Department', 'Status', 'Currency', 'Frequency',
    'Days in period', 'Days onboard', 'Days leave', 'Days travel', 'Days unpaid', 'Days paid', 'Proration',
    'Base period', 'Prorated base', 'Allowances', 'Gratuity', 'Other earnings', 'Gross', 'Deductions', 'Net',
    `FX to ${run.currency}`, `Net (${run.currency})`, 'Notes',
  ];
  const rows = lines.map((l) => [
    run.run_number, l.crew_name, l.rank, l.department, l.status, l.currency, l.pay_frequency,
    l.days_in_period, l.days_onboard, l.days_leave_paid, l.days_travel, l.days_unpaid, l.days_paid, Number(l.proration_ratio).toFixed(4),
    major(l.base_period_minor), major(l.prorated_base_minor), major(l.allowances_minor), major(l.gratuity_minor), major(l.other_earnings_minor),
    major(l.gross_minor), major(l.deductions_minor), major(l.net_minor),
    l.fx_rate_to_run === null ? '' : Number(l.fx_rate_to_run).toFixed(6), major(l.net_run_currency_minor), l.notes,
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
};

export const downloadTextFile = (content: string, fileName: string, mime = 'text/csv;charset=utf-8'): void => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
