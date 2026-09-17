import { z } from 'zod';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { calculateGratuitySplit, type GratuityParticipant, type GratuityShare, type GratuitySplitMethod } from '@/modules/hris/lib/payroll/engine';
import { fromMinor, toMinor } from '@/modules/hris/lib/format';

/**
 * Pure helpers for the Gratuities page. Money is integer minor units + ISO
 * currency, mirroring `gratuity_pools` / `gratuity_distributions`
 * (supabase/migrations/20260917120000_hris_phase2_compensation.sql §8, §13).
 */

export type GratuityPoolRow = Tables<'gratuity_pools'>;
export type GratuityDistributionRow = Tables<'gratuity_distributions'>;

export type GratuityPoolStatus = 'draft' | 'calculated' | 'approved' | 'distributed' | 'cancelled';
export type GratuitySource = 'charter' | 'owner' | 'other';
export type GratuityPayoutStatus = 'pending' | 'in_payroll' | 'paid' | 'cancelled';
export type { GratuitySplitMethod };

export const POOL_STATUSES: GratuityPoolStatus[] = ['draft', 'calculated', 'approved', 'distributed', 'cancelled'];
/** The happy-path stepper; `cancelled` is a side exit. */
export const POOL_STATUS_STEPS: GratuityPoolStatus[] = ['draft', 'calculated', 'approved', 'distributed'];
export const GRATUITY_SOURCES: GratuitySource[] = ['charter', 'owner', 'other'];
export const SPLIT_METHODS: GratuitySplitMethod[] = ['equal', 'points', 'days_weighted', 'points_days'];
export const PAYOUT_STATUSES: GratuityPayoutStatus[] = ['pending', 'in_payroll', 'paid', 'cancelled'];

export const SPLIT_METHOD_LABEL: Record<GratuitySplitMethod, string> = {
  equal: 'Equal split',
  points: 'By points',
  days_weighted: 'By days onboard',
  points_days: 'Points × days',
};

export const SPLIT_METHOD_DESCRIPTION: Record<GratuitySplitMethod, string> = {
  equal: 'Every eligible crew member receives the same share.',
  points: 'Shares follow gratuity points (compensation override, then pay grade, then company default).',
  days_weighted: 'Shares follow the number of days onboard during the pool period.',
  points_days: 'Shares follow points multiplied by days onboard.',
};

export const POOL_STATUS_BADGE_CLASS: Record<GratuityPoolStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  calculated: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  approved: 'bg-green-500/10 text-green-500 border-green-500/20',
  distributed: 'bg-primary/10 text-primary border-primary/20',
  cancelled: 'bg-destructive/10 text-destructive border-destructive/20',
};

export const PAYOUT_STATUS_BADGE_CLASS: Record<GratuityPayoutStatus, string> = {
  pending: 'bg-muted text-muted-foreground border-border',
  in_payroll: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  paid: 'bg-green-500/10 text-green-500 border-green-500/20',
  cancelled: 'bg-destructive/10 text-destructive border-destructive/20',
};

export const asPoolStatus = (value: string): GratuityPoolStatus =>
  (POOL_STATUSES as string[]).includes(value) ? (value as GratuityPoolStatus) : 'draft';
export const asSplitMethod = (value: string | null | undefined): GratuitySplitMethod =>
  value && (SPLIT_METHODS as string[]).includes(value) ? (value as GratuitySplitMethod) : 'points_days';
export const asPayoutStatus = (value: string): GratuityPayoutStatus =>
  (PAYOUT_STATUSES as string[]).includes(value) ? (value as GratuityPayoutStatus) : 'pending';

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** Net pool = gross − deductions (never negative). */
export const netAmountMinor = (pool: Pick<GratuityPoolRow, 'gross_amount_minor' | 'deductions_minor'>): number =>
  Math.max(0, (pool.gross_amount_minor ?? 0) - (pool.deductions_minor ?? 0));

/** What a crew member actually receives: calculated share plus manual adjustment; excluded rows get nothing. */
export const finalAmountMinor = (d: Pick<GratuityDistributionRow, 'amount_minor' | 'adjustment_minor' | 'excluded'>): number =>
  d.excluded ? 0 : (d.amount_minor ?? 0) + (d.adjustment_minor ?? 0);

export interface Reconciliation {
  netMinor: number;
  allocatedMinor: number;
  adjustmentsMinor: number;
  finalMinor: number;
  /** finalMinor − netMinor. Zero when the pool is fully and exactly allocated. */
  differenceMinor: number;
  participants: number;
  excluded: number;
}

/** Sum of finals vs net pool. A non-zero difference is expected when adjustments exist, and should be surfaced. */
export function reconcile(
  pool: Pick<GratuityPoolRow, 'gross_amount_minor' | 'deductions_minor'>,
  distributions: Pick<GratuityDistributionRow, 'amount_minor' | 'adjustment_minor' | 'excluded'>[],
): Reconciliation {
  const netMinor = netAmountMinor(pool);
  const included = distributions.filter((d) => !d.excluded);
  const allocatedMinor = included.reduce((s, d) => s + (d.amount_minor ?? 0), 0);
  const adjustmentsMinor = included.reduce((s, d) => s + (d.adjustment_minor ?? 0), 0);
  const finalMinor = distributions.reduce((s, d) => s + finalAmountMinor(d), 0);
  return {
    netMinor,
    allocatedMinor,
    adjustmentsMinor,
    finalMinor,
    differenceMinor: finalMinor - netMinor,
    participants: included.length,
    excluded: distributions.length - included.length,
  };
}

// ---------------------------------------------------------------------------
// Preview (client-side mirror of gratuity_calculate_pool)
// ---------------------------------------------------------------------------

type PreviewSource = Pick<GratuityDistributionRow, 'profile_id' | 'days_onboard' | 'points' | 'excluded' | 'created_at'>;

/** Distribution rows → engine participants. `overrides` lets the UI simulate exclusion toggles before persisting. */
export function previewParticipants(distributions: PreviewSource[], overrides: Record<string, boolean> = {}): GratuityParticipant[] {
  return distributions.map((d) => ({
    profileId: d.profile_id,
    daysOnboard: d.days_onboard ?? 0,
    points: Number(d.points ?? 0),
    excluded: overrides[d.profile_id] ?? Boolean(d.excluded),
    createdAt: d.created_at ?? '',
  }));
}

/** Preview shares keyed by profile id for a given method. */
export function previewSplit(netMinor: number, method: GratuitySplitMethod, participants: GratuityParticipant[]): Map<string, GratuityShare> {
  return new Map(calculateGratuitySplit(netMinor, method, participants).map((s) => [s.profileId, s]));
}

/** Preview every method at once (one column per method in the picker). */
export function previewAllMethods(netMinor: number, participants: GratuityParticipant[]): Record<GratuitySplitMethod, Map<string, GratuityShare>> {
  return {
    equal: previewSplit(netMinor, 'equal', participants),
    points: previewSplit(netMinor, 'points', participants),
    days_weighted: previewSplit(netMinor, 'days_weighted', participants),
    points_days: previewSplit(netMinor, 'points_days', participants),
  };
}

// ---------------------------------------------------------------------------
// Status / permission helpers
// ---------------------------------------------------------------------------

export const isPoolEditable = (status: string): boolean => status === 'draft' || status === 'calculated';
export const canCalculatePool = (status: string): boolean => isPoolEditable(status);
export const canApprovePool = (status: string): boolean => status === 'calculated';
export const canMarkDistributed = (status: string): boolean => status === 'approved';
export const canCancelPool = (status: string): boolean => status !== 'distributed' && status !== 'cancelled';
export const canDeletePool = (status: string): boolean => status === 'draft';
/** Row actions (exclude / adjust) are only meaningful before payroll has paid the share. */
export const isDistributionLocked = (d: Pick<GratuityDistributionRow, 'payout_status'>, poolStatus: string): boolean =>
  d.payout_status === 'paid' || d.payout_status === 'in_payroll' || poolStatus === 'distributed' || poolStatus === 'cancelled';

/** Index of a status on the stepper (−1 for cancelled). */
export const poolStepIndex = (status: string): number => POOL_STATUS_STEPS.indexOf(status as GratuityPoolStatus);

// ---------------------------------------------------------------------------
// List filtering / KPIs
// ---------------------------------------------------------------------------

export interface GratuityPoolFilters {
  vesselId: string | 'all';
  status: GratuityPoolStatus | 'all';
  year: number | 'all';
}

export const poolYear = (pool: Pick<GratuityPoolRow, 'received_date'>): number => Number(pool.received_date.slice(0, 4));

export const DEFAULT_POOL_FILTERS: GratuityPoolFilters = { vesselId: 'all', status: 'all', year: new Date().getFullYear() };

export function filterPools<T extends Pick<GratuityPoolRow, 'vessel_id' | 'status' | 'received_date'>>(pools: T[], filters: GratuityPoolFilters): T[] {
  return pools.filter(
    (p) =>
      (filters.vesselId === 'all' || p.vessel_id === filters.vesselId) &&
      (filters.status === 'all' || p.status === filters.status) &&
      (filters.year === 'all' || poolYear(p) === filters.year),
  );
}

/** Years present in the data (desc), always including the current year. */
export function availablePoolYears(pools: Pick<GratuityPoolRow, 'received_date'>[], now = new Date()): number[] {
  const years = new Set<number>([now.getFullYear(), ...pools.map(poolYear)]);
  return Array.from(years).sort((a, b) => b - a);
}

export interface GratuityKpis {
  poolsThisYear: number;
  /** Net received per currency (non-cancelled pools this year). */
  receivedByCurrency: Record<string, number>;
  /** Net of distributed pools per currency (this year). */
  distributedByCurrency: Record<string, number>;
  pendingApproval: number;
}

export function computeGratuityKpis(pools: Pick<GratuityPoolRow, 'status' | 'received_date' | 'currency' | 'gross_amount_minor' | 'deductions_minor'>[], year: number): GratuityKpis {
  const thisYear = pools.filter((p) => poolYear(p) === year && p.status !== 'cancelled');
  const add = (acc: Record<string, number>, p: (typeof pools)[number]) => {
    acc[p.currency] = (acc[p.currency] ?? 0) + netAmountMinor(p);
    return acc;
  };
  return {
    poolsThisYear: thisYear.length,
    receivedByCurrency: thisYear.reduce(add, {} as Record<string, number>),
    distributedByCurrency: thisYear.filter((p) => p.status === 'distributed').reduce(add, {} as Record<string, number>),
    pendingApproval: pools.filter((p) => p.status === 'calculated').length,
  };
}

// ---------------------------------------------------------------------------
// Pool form
// ---------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const money = z
  .string()
  .trim()
  .refine((v) => v === '' || toMinor(v) !== null, 'Enter a valid amount')
  .refine((v) => v === '' || (toMinor(v) ?? 0) >= 0, 'Amount cannot be negative');

export const poolFormSchema = z
  .object({
    vessel_id: z.string().min(1, 'Choose a vessel'),
    name: z.string().trim().min(2, 'Give the pool a name').max(200),
    source: z.enum(['charter', 'owner', 'other']),
    received_date: isoDate,
    period_start: isoDate,
    period_end: isoDate,
    currency: z.string().trim().toUpperCase().length(3, 'ISO currency code'),
    gross_amount: z.string().trim().refine((v) => toMinor(v) !== null && (toMinor(v) ?? 0) >= 0, 'Enter the gross amount'),
    deductions: money,
    deductions_note: z.string().trim().max(500).optional().or(z.literal('')),
    split_method: z.enum(['equal', 'points', 'days_weighted', 'points_days']),
    notes: z.string().trim().max(2000).optional().or(z.literal('')),
  })
  .refine((v) => v.period_end >= v.period_start, { path: ['period_end'], message: 'Period end must be on or after the start' })
  .refine((v) => (toMinor(v.deductions) ?? 0) <= (toMinor(v.gross_amount) ?? 0), {
    path: ['deductions'],
    message: 'Deductions cannot exceed the gross amount',
  });

export type PoolFormValues = z.infer<typeof poolFormSchema>;

export interface PoolFormDefaults {
  currency?: string;
  split_method?: GratuitySplitMethod;
  vessel_id?: string;
}

const todayIso = (now = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

export function emptyPoolFormValues(defaults: PoolFormDefaults = {}, now = new Date()): PoolFormValues {
  const today = todayIso(now);
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  return {
    vessel_id: defaults.vessel_id ?? '',
    name: '',
    source: 'charter',
    received_date: today,
    period_start: firstOfMonth,
    period_end: today,
    currency: defaults.currency ?? 'EUR',
    gross_amount: '',
    deductions: '',
    deductions_note: '',
    split_method: defaults.split_method ?? 'points_days',
    notes: '',
  };
}

export function poolToFormValues(pool: GratuityPoolRow): PoolFormValues {
  return {
    vessel_id: pool.vessel_id,
    name: pool.name,
    source: (GRATUITY_SOURCES as string[]).includes(pool.source) ? (pool.source as GratuitySource) : 'other',
    received_date: pool.received_date,
    period_start: pool.period_start,
    period_end: pool.period_end,
    currency: pool.currency,
    gross_amount: fromMinor(pool.gross_amount_minor),
    deductions: pool.deductions_minor ? fromMinor(pool.deductions_minor) : '',
    deductions_note: pool.deductions_note ?? '',
    split_method: asSplitMethod(pool.split_method),
    notes: pool.notes ?? '',
  };
}

/** Columns the form is allowed to write (everything else is managed by workflow actions). */
export type PoolWritePayload = Pick<
  TablesInsert<'gratuity_pools'>,
  'vessel_id' | 'name' | 'source' | 'received_date' | 'period_start' | 'period_end' | 'currency' | 'gross_amount_minor' | 'deductions_minor' | 'deductions_note' | 'split_method' | 'notes'
>;

export function poolFormToPayload(values: PoolFormValues): PoolWritePayload {
  return {
    vessel_id: values.vessel_id,
    name: values.name.trim(),
    source: values.source,
    received_date: values.received_date,
    period_start: values.period_start,
    period_end: values.period_end,
    currency: values.currency.toUpperCase(),
    gross_amount_minor: toMinor(values.gross_amount) ?? 0,
    deductions_minor: toMinor(values.deductions) ?? 0,
    deductions_note: values.deductions_note?.trim() || null,
    split_method: values.split_method,
    notes: values.notes?.trim() || null,
  };
}

// ---------------------------------------------------------------------------
// Audit snapshots
// ---------------------------------------------------------------------------

export type AuditValues = Record<string, string | number | boolean | null>;

export const poolAuditSnapshot = (pool: Partial<GratuityPoolRow>): AuditValues => ({
  name: pool.name ?? null,
  vessel_id: pool.vessel_id ?? null,
  source: pool.source ?? null,
  status: pool.status ?? null,
  received_date: pool.received_date ?? null,
  period_start: pool.period_start ?? null,
  period_end: pool.period_end ?? null,
  currency: pool.currency ?? null,
  gross_amount_minor: pool.gross_amount_minor ?? null,
  deductions_minor: pool.deductions_minor ?? null,
  split_method: pool.split_method ?? null,
  approved_by: pool.approved_by ?? null,
  approved_at: pool.approved_at ?? null,
  distributed_at: pool.distributed_at ?? null,
});

export const distributionAuditSnapshot = (d: Partial<GratuityDistributionRow>): AuditValues => ({
  pool_id: d.pool_id ?? null,
  profile_id: d.profile_id ?? null,
  amount_minor: d.amount_minor ?? null,
  adjustment_minor: d.adjustment_minor ?? null,
  adjustment_reason: d.adjustment_reason ?? null,
  excluded: d.excluded ?? null,
  exclusion_reason: d.exclusion_reason ?? null,
  payout_status: d.payout_status ?? null,
  paid_at: d.paid_at ?? null,
});

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

export interface CsvDistribution extends Pick<
  GratuityDistributionRow,
  'profile_id' | 'days_onboard' | 'points' | 'weight' | 'share_ratio' | 'amount_minor' | 'adjustment_minor' | 'adjustment_reason' | 'excluded' | 'exclusion_reason' | 'payout_status'
> {
  crew_name: string;
  rank: string | null;
  department: string | null;
}

export const GRATUITY_CSV_HEADER = [
  'Pool',
  'Vessel',
  'Period start',
  'Period end',
  'Currency',
  'Crew',
  'Rank',
  'Department',
  'Days onboard',
  'Points',
  'Weight',
  'Share %',
  'Amount',
  'Adjustment',
  'Adjustment reason',
  'Final',
  'Excluded',
  'Exclusion reason',
  'Payout status',
] as const;

const major = (minor: number): string => (minor / 100).toFixed(2);

/** One row per distribution, money in major units, followed by a totals row. */
export function gratuityCsvRows(pool: GratuityPoolRow, vesselName: string | null, distributions: CsvDistribution[]): string[][] {
  const rows: string[][] = [[...GRATUITY_CSV_HEADER]];
  for (const d of distributions) {
    rows.push([
      pool.name,
      vesselName ?? '',
      pool.period_start,
      pool.period_end,
      pool.currency,
      d.crew_name,
      d.rank ?? '',
      d.department ?? '',
      String(d.days_onboard ?? 0),
      String(Number(d.points ?? 0)),
      String(Number(d.weight ?? 0)),
      (Number(d.share_ratio ?? 0) * 100).toFixed(2),
      major(d.amount_minor ?? 0),
      major(d.adjustment_minor ?? 0),
      d.adjustment_reason ?? '',
      major(finalAmountMinor(d)),
      d.excluded ? 'yes' : 'no',
      d.exclusion_reason ?? '',
      d.payout_status,
    ]);
  }
  const rec = reconcile(pool, distributions);
  rows.push([
    pool.name,
    vesselName ?? '',
    pool.period_start,
    pool.period_end,
    pool.currency,
    'TOTAL',
    '',
    '',
    '',
    '',
    '',
    '',
    major(rec.allocatedMinor),
    major(rec.adjustmentsMinor),
    '',
    major(rec.finalMinor),
    '',
    `Net pool ${major(rec.netMinor)}; difference ${major(rec.differenceMinor)}`,
    '',
  ]);
  return rows;
}

const csvCell = (value: string): string => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export const toCsv = (rows: string[][]): string => rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

export const csvFileName = (pool: Pick<GratuityPoolRow, 'name' | 'period_end'>): string =>
  `gratuities-${pool.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pool'}-${pool.period_end}.csv`;
