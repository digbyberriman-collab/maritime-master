/**
 * The fleet operations reports' rules (gap/02 R7, R13, R17, R18; T-248;
 * X5 spec X5-10B). Pure: no React, no Supabase.
 *
 * - Drill interval state and audit state: the TS mirrors of the SQL rules
 *   `fleet_report_drill_interval_state` and `fleet_report_audit_state`
 *   (`20261124041000_fleet_report_ops_sources.sql`). The cases tables of
 *   `supabase/tests/sql/fleet/report_ops_sources.test.sql` (between its
 *   `drill-interval-cases` and `audit-state-cases` markers) are asserted
 *   against both.
 * - The report filters (in the URL, with more status options than the
 *   reference, T-248), the audit period presets, the insurance classes and
 *   the cover-by-vessel matrix, the work list's status chips, tallies, labels
 *   and the export columns.
 *
 * Nothing here invents a number: a vessel the report does not cover has
 * null counts (shown "–"), never 0, and a vessel with no policy of a class
 * says so.
 */
import type { Tone } from '@/components/ui/tones';
import type { ExportColumn } from '@/lib/export';
import type {
  AuditFindingCounts,
  AuditState,
  AuditSurveyRow,
  DrillRowKind,
  InsurancePolicyRow,
  OverdueDrillRow,
  OverdueJobRow,
  ReportVesselCoverage,
  WorkListVesselRow,
} from '../types/db.pending';
import { addDays, daysBetween } from './crewReports';
import type { ReportFilterSpec } from './reportFilters';

const n = (v: number) => v.toLocaleString('en-GB');
const plural = (v: number, one: string, many = `${one}s`) => `${n(v)} ${v === 1 ? one : many}`;

/** A tidy label for a status word the client does not know ("In_Progress" → "In progress"). */
export function tidyWord(value: string | null | undefined): string | null {
  const t = (value ?? '').trim();
  if (t === '') return null;
  const words = t.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The vessel's name for a row, or the words for a row with no vessel. */
export function vesselLabeller(vessels: readonly Pick<ReportVesselCoverage, 'vessel_id' | 'vessel_name'>[], noVessel: string): (id: string | null) => string {
  const byId = new Map(vessels.map((v) => [v.vessel_id, v.vessel_name]));
  return (id) => (id ? byId.get(id) ?? 'Vessel' : noVessel);
}

// ─── R7 overdue drills (SQL mirror) ─────────────────────────────────────

export type DrillIntervalState = 'never' | 'lapsed' | 'due_soon' | 'on_track';

/**
 * fleet_report_drill_interval_state: a required drill type's state on a
 * vessel on a day. never (no drill carried out), lapsed (the due day, last
 * + interval, is before the day), due_soon (within 7 days; the due day
 * counts, 0 left), else on_track; null for no interval or no day.
 */
export function drillIntervalState(
  lastDone: string | null | undefined,
  frequencyDays: number | null | undefined,
  today: string | null | undefined,
): DrillIntervalState | null {
  if (frequencyDays === null || frequencyDays === undefined || !Number.isFinite(frequencyDays) || frequencyDays < 1 || !today) return null;
  if (!lastDone) return 'never';
  const left = daysBetween(today, addDays(lastDone, frequencyDays));
  if (left === null) return null;
  if (left < 0) return 'lapsed';
  if (left <= 7) return 'due_soon';
  return 'on_track';
}

export const DRILL_KINDS: readonly DrillRowKind[] = ['missed', 'lapsed', 'due_soon', 'never'];

export const DRILL_KIND_META: Readonly<Record<DrillRowKind, { label: string; tone: Tone; rule: string }>> = {
  missed: { label: 'Missed', tone: 'danger', rule: 'A scheduled drill that was not carried out by its date.' },
  lapsed: { label: 'Past its interval', tone: 'danger', rule: 'The interval since the last drill of this type carried out has run out.' },
  due_soon: { label: 'Due soon', tone: 'warn', rule: 'The interval runs out within the next 7 days.' },
  never: { label: 'No drill on record', tone: 'neutral', rule: 'No drill of this required type has been carried out on this vessel.' },
};

const DRILL_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  solas_required: 'SOLAS',
  company_required: 'Company',
  voluntary: 'Voluntary',
};

const categoryKey = (category: string | null | undefined) => (category ?? '').trim().toLowerCase();

/** "SOLAS", "Company", "Voluntary"; another category as written, tidied. */
export function drillCategoryLabel(category: string | null | undefined): string {
  return DRILL_CATEGORY_LABELS[categoryKey(category)] ?? tidyWord(category) ?? 'Uncategorised';
}

/** "Every 7 days"; "Every day". */
export function frequencyText(days: number): string {
  return days === 1 ? 'Every day' : `Every ${n(days)} days`;
}

/** "3 days overdue", "Due today", "Due tomorrow", "Due in 5 days"; null without a due day. */
export function dueText(daysOverdue: number | null): string | null {
  if (daysOverdue === null) return null;
  if (daysOverdue > 0) return `${plural(daysOverdue, 'day')} overdue`;
  if (daysOverdue === 0) return 'Due today';
  if (daysOverdue === -1) return 'Due tomorrow';
  return `Due in ${plural(-daysOverdue, 'day')}`;
}

export const DRILL_FILTERS: readonly ReportFilterSpec[] = [
  {
    key: 'show',
    label: 'Show',
    options: [
      { value: 'overdue', label: 'Overdue' },
      { value: 'missed', label: 'Missed' },
      { value: 'lapsed', label: 'Past their interval' },
      { value: 'due-soon', label: 'Due within 7 days' },
      { value: 'never', label: 'No drill on record' },
      { value: 'all', label: 'Everything' },
    ],
    defaultValue: 'overdue',
  },
  {
    key: 'category',
    label: 'Category',
    options: [
      { value: 'all', label: 'Every category' },
      { value: 'solas', label: 'SOLAS' },
      { value: 'company', label: 'Company' },
      { value: 'voluntary', label: 'Voluntary' },
    ],
    defaultValue: 'all',
  },
];

const SHOW_KINDS: Readonly<Record<string, readonly DrillRowKind[]>> = {
  overdue: ['missed', 'lapsed'],
  missed: ['missed'],
  lapsed: ['lapsed'],
  'due-soon': ['due_soon'],
  never: ['never'],
  all: DRILL_KINDS,
};

const CATEGORY_FILTER: Readonly<Record<string, string>> = { solas: 'solas_required', company: 'company_required', voluntary: 'voluntary' };

/** The rows a Show and Category choice keeps, in the server's order (most overdue first). */
export function drillRows(rows: readonly OverdueDrillRow[], show: string, category: string): OverdueDrillRow[] {
  const kinds = SHOW_KINDS[show] ?? SHOW_KINDS.overdue;
  const wanted = CATEGORY_FILTER[category];
  return rows.filter((r) => kinds.includes(r.kind) && (!wanted || categoryKey(r.category) === wanted));
}

export interface DrillTally {
  missed: number;
  lapsed: number;
  due_soon: number;
  never: number;
  /** Vessels with a missed drill or a lapsed interval. */
  vessels_overdue: number;
}

export function tallyDrills(rows: readonly OverdueDrillRow[]): DrillTally {
  const t: DrillTally = { missed: 0, lapsed: 0, due_soon: 0, never: 0, vessels_overdue: 0 };
  const overdue = new Set<string>();
  for (const r of rows) {
    t[r.kind] += 1;
    if (r.kind === 'missed' || r.kind === 'lapsed') overdue.add(r.vessel_id);
  }
  t.vessels_overdue = overdue.size;
  return t;
}

export function drillExportColumns(vesselName: (id: string | null) => string): ExportColumn<OverdueDrillRow>[] {
  return [
    { key: 'vessel', header: 'Vessel', value: (r) => vesselName(r.vessel_id) },
    { key: 'drill_type', header: 'Drill', value: (r) => r.drill_type },
    { key: 'category', header: 'Category', value: (r) => drillCategoryLabel(r.category) },
    { key: 'interval', header: 'Interval (days)', kind: 'number', value: (r) => r.frequency_days },
    { key: 'why', header: 'Why listed', value: (r) => DRILL_KIND_META[r.kind].label },
    { key: 'due_on', header: 'Due', kind: 'date', value: (r) => r.due_on },
    { key: 'days_overdue', header: 'Days overdue', kind: 'number', value: (r) => (r.days_overdue !== null && r.days_overdue > 0 ? r.days_overdue : null) },
    { key: 'last_done_on', header: 'Last carried out', kind: 'date', value: (r) => r.last_done_on },
    { key: 'next_scheduled_on', header: 'Next scheduled', kind: 'date', value: (r) => r.next_scheduled_on },
    { key: 'drill_number', header: 'Drill number', value: (r) => r.drill_number },
    { key: 'status', header: 'Status', value: (r) => tidyWord(r.status) },
    { key: 'solas_reference', header: 'Reference', value: (r) => r.solas_reference },
  ];
}

// ─── R13 insurance ──────────────────────────────────────────────────────

export type PolicyClass = 'pi' | 'hull' | 'crew' | 'war' | 'pollution' | 'other';

export const POLICY_CLASSES: readonly PolicyClass[] = ['pi', 'hull', 'crew', 'war', 'pollution', 'other'];

/** The classes the cover matrix always shows, so missing cover is visible (gap/02 R13: P&I, H&M, crew medical). */
export const CORE_POLICY_CLASSES: readonly PolicyClass[] = ['pi', 'hull', 'crew'];

export const POLICY_CLASS_LABELS: Readonly<Record<PolicyClass, string>> = {
  pi: 'P&I',
  hull: 'Hull and machinery',
  crew: 'Crew and medical',
  war: 'War and piracy',
  pollution: 'Pollution',
  other: 'Other cover',
};

/** The class of a policy type as written (the live policy_type is free text). */
export function policyClass(policyType: string | null | undefined): PolicyClass {
  const t = (policyType ?? '').toLowerCase();
  if (/\bp\s*(?:&|and)\s*i\b|protection|indemnity/.test(t)) return 'pi';
  if (/\bhull\b|\bh\s*&\s*m\b|machinery/.test(t)) return 'hull';
  if (/crew|medical|employer/.test(t)) return 'crew';
  if (/\bwar\b|piracy|terror|kidnap|ransom/.test(t)) return 'war';
  if (/pollution|\boil\b|\bclc\b|bunker/.test(t)) return 'pollution';
  return 'other';
}

const coverWords = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && w !== 'and');

/**
 * The class to show under a policy type, or null when the type already says
 * it ("P&I" under "P&I", "Hull and machinery" under "Hull & Machinery").
 */
export function policyClassNote(policyType: string | null | undefined): string | null {
  const label = POLICY_CLASS_LABELS[policyClass(policyType)];
  const typeWords = coverWords(policyType ?? '');
  if (typeWords.length === 0) return label;
  const labelWords = new Set(coverWords(label));
  return typeWords.every((w) => labelWords.has(w)) ? null : label;
}

export const INSURANCE_FILTERS: readonly ReportFilterSpec[] = [
  {
    key: 'status',
    label: 'Status',
    options: [
      { value: 'all', label: 'Every policy' },
      { value: 'due', label: 'Expired or due' },
      { value: 'expired', label: 'Expired' },
      { value: 'expiring_soon', label: 'Within 30 days' },
      { value: 'expiring', label: 'In warning window' },
      { value: 'valid', label: 'In force' },
    ],
    defaultValue: 'all',
  },
  {
    key: 'type',
    label: 'Cover',
    options: [{ value: 'all', label: 'Every cover' }, ...POLICY_CLASSES.map((c) => ({ value: c, label: POLICY_CLASS_LABELS[c] }))],
    defaultValue: 'all',
  },
];

const DUE_BUCKETS: ReadonlySet<string> = new Set(['expired', 'expiring_soon', 'expiring']);
const BUCKET_FILTERS: ReadonlySet<string> = new Set(['expired', 'expiring_soon', 'expiring', 'valid']);

/** The policies a Status and Cover choice keeps, in the server's order (most urgent first). */
export function insuranceRows(rows: readonly InsurancePolicyRow[], status: string, type: string): InsurancePolicyRow[] {
  return rows.filter((r) => {
    const statusOk =
      status === 'due' ? DUE_BUCKETS.has(r.bucket) : BUCKET_FILTERS.has(status) ? r.bucket === status : true;
    return statusOk && (type === 'all' || !POLICY_CLASSES.includes(type as PolicyClass) || policyClass(r.policy_type) === type);
  });
}

export interface InsuranceTally {
  total: number;
  expired: number;
  expiring_soon: number;
  expiring: number;
  valid: number;
  fleet: number;
}

export function tallyInsurance(rows: readonly InsurancePolicyRow[]): InsuranceTally {
  const t: InsuranceTally = { total: rows.length, expired: 0, expiring_soon: 0, expiring: 0, valid: 0, fleet: 0 };
  for (const r of rows) {
    if (r.bucket === 'expired') t.expired += 1;
    else if (r.bucket === 'expiring_soon') t.expiring_soon += 1;
    else if (r.bucket === 'expiring') t.expiring += 1;
    else if (r.bucket === 'valid') t.valid += 1;
    if (!r.vessel_id) t.fleet += 1;
  }
  return t;
}

/** One cell of the cover matrix: the vessel's own cover of a class, the fleet's, or none. */
export type CoverCell =
  | { kind: 'none' }
  | { kind: 'vessel' | 'fleet'; policy: InsurancePolicyRow; count: number };

/** The row id the cover matrix uses for the fleet's own policies. */
export const FLEET_COVER_ROW = 'fleet';

export interface CoverMatrix {
  /** Covered vessels (and the fleet when its policies are listed), by name. */
  rows: Array<{ id: string; label: string; code: string | null }>;
  classes: PolicyClass[];
  cell: (rowId: string, policyClass: PolicyClass) => CoverCell;
}

const latestEnd = (a: InsurancePolicyRow, b: InsurancePolicyRow) => ((a.coverage_end ?? '') >= (b.coverage_end ?? '') ? a : b);

/**
 * Cover by vessel (gap/02 R13; an improvement on a flat list): one row per
 * covered vessel, one column per class (P&I, hull and machinery and crew
 * always, the others when a policy has them). A cell is the policy of that
 * class ending last on the vessel (the cover in force, or the latest one);
 * with none of its own, the fleet's policy of the class; else "none".
 */
export function coverMatrix(
  rows: readonly InsurancePolicyRow[],
  vessels: readonly ReportVesselCoverage[],
  fleetLevel: boolean,
): CoverMatrix {
  const own = new Map<string, Map<PolicyClass, InsurancePolicyRow[]>>();
  const fleet = new Map<PolicyClass, InsurancePolicyRow[]>();
  const seen = new Set<PolicyClass>(CORE_POLICY_CLASSES);
  for (const r of rows) {
    const c = policyClass(r.policy_type);
    seen.add(c);
    if (!r.vessel_id) {
      fleet.set(c, [...(fleet.get(c) ?? []), r]);
      continue;
    }
    const byClass = own.get(r.vessel_id) ?? new Map<PolicyClass, InsurancePolicyRow[]>();
    byClass.set(c, [...(byClass.get(c) ?? []), r]);
    own.set(r.vessel_id, byClass);
  }
  const matrixRows = vessels.filter((v) => v.state === 'ok').map((v) => ({ id: v.vessel_id, label: v.vessel_name, code: v.vessel_code }));
  if (fleetLevel && fleet.size > 0) matrixRows.push({ id: FLEET_COVER_ROW, label: 'Fleet policies', code: null });
  const cell = (rowId: string, c: PolicyClass): CoverCell => {
    const list = rowId === FLEET_COVER_ROW ? fleet.get(c) : own.get(rowId)?.get(c);
    if (list?.length) return { kind: rowId === FLEET_COVER_ROW ? 'fleet' : 'vessel', policy: list.reduce(latestEnd), count: list.length };
    const shared = rowId === FLEET_COVER_ROW ? undefined : fleet.get(c);
    if (shared?.length) return { kind: 'fleet', policy: shared.reduce(latestEnd), count: shared.length };
    return { kind: 'none' };
  };
  return { rows: matrixRows, classes: POLICY_CLASSES.filter((c) => seen.has(c)), cell };
}

/** "No P&I policy" for a vessel with none of a core class. */
export function missingCover(matrix: CoverMatrix): Array<{ vessel: string; cover: string }> {
  const out: Array<{ vessel: string; cover: string }> = [];
  for (const row of matrix.rows) {
    if (row.id === FLEET_COVER_ROW) continue;
    for (const c of CORE_POLICY_CLASSES) if (matrix.cell(row.id, c).kind === 'none') out.push({ vessel: row.label, cover: POLICY_CLASS_LABELS[c] });
  }
  return out;
}

const POLICY_STATUS_LABELS: Readonly<Record<string, string>> = {
  active: 'Active',
  expired: 'Expired',
  pending_renewal: 'Renewal pending',
  cancelled: 'Cancelled',
};

export function policyStatusLabel(status: string | null | undefined): string | null {
  const key = (status ?? '').trim().toLowerCase();
  return POLICY_STATUS_LABELS[key] ?? tidyWord(status);
}

export function insuranceExportColumns(vesselName: (id: string | null) => string): ExportColumn<InsurancePolicyRow>[] {
  return [
    { key: 'vessel', header: 'Vessel', value: (r) => vesselName(r.vessel_id) },
    { key: 'cover', header: 'Cover', value: (r) => POLICY_CLASS_LABELS[policyClass(r.policy_type)] },
    { key: 'policy_type', header: 'Policy type', value: (r) => r.policy_type },
    { key: 'insurer', header: 'Insurer', value: (r) => r.insurer },
    { key: 'policy_number', header: 'Policy number', value: (r) => r.policy_number },
    { key: 'coverage_start', header: 'Cover from', kind: 'date', value: (r) => r.coverage_start },
    { key: 'coverage_end', header: 'Cover ends', kind: 'date', value: (r) => r.coverage_end },
    { key: 'days_remaining', header: 'Days left', kind: 'number', value: (r) => r.days_remaining },
    { key: 'bucket', header: 'Expiry', value: (r) => EXPIRY_BUCKET_WORDS[r.bucket] ?? r.bucket },
    { key: 'window_days', header: 'Warning window (days)', kind: 'number', value: (r) => r.window_days },
    { key: 'status', header: 'Status', value: (r) => policyStatusLabel(r.status) },
    { key: 'certificate_on_file', header: 'Certificate on file', kind: 'boolean', value: (r) => r.certificate_on_file },
  ];
}

const EXPIRY_BUCKET_WORDS: Readonly<Record<string, string>> = {
  expired: 'Expired',
  expiring_soon: 'Within 30 days',
  expiring: 'Within the warning window',
  valid: 'In force',
  no_expiry: 'No end date',
};

// ─── R17 audits and surveys (SQL mirror) ────────────────────────────────

/**
 * fleet_report_audit_state: cancelled, done (Completed / Closed),
 * in_progress, overdue (any other status, or none, dated before the day),
 * else due. Status words compare case-insensitively with spaces and dashes
 * as underscores.
 */
export function auditState(status: string | null | undefined, on: string | null | undefined, today: string | null | undefined): AuditState {
  const st = (status ?? '').trim().replace(/[\s-]+/g, '_').toLowerCase();
  if (st === 'cancelled' || st === 'canceled') return 'cancelled';
  if (st === 'completed' || st === 'closed') return 'done';
  if (st === 'in_progress') return 'in_progress';
  const days = daysBetween(today, on);
  if (days !== null && days < 0) return 'overdue';
  return 'due';
}

export const AUDIT_STATE_META: Readonly<Record<AuditState, { label: string; tone: Tone }>> = {
  overdue: { label: 'Overdue', tone: 'danger' },
  in_progress: { label: 'In progress', tone: 'signal' },
  due: { label: 'Due', tone: 'info' },
  done: { label: 'Done', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

const AUDIT_TYPE_LABELS: Readonly<Record<string, string>> = {
  internal: 'Internal audit',
  external_initial: 'External audit (initial)',
  external_annual: 'External audit (annual)',
  external_intermediate: 'External audit (intermediate)',
  external_renewal: 'External audit (renewal)',
};

/** "External audit (annual)" for External_Annual; another type tidied. */
export function auditTypeLabel(type: string | null | undefined): string {
  const key = (type ?? '').trim().toLowerCase();
  return AUDIT_TYPE_LABELS[key] ?? tidyWord(type) ?? 'Audit';
}

const AUDIT_OUTCOMES: Readonly<Record<string, { label: string; tone: Tone }>> = {
  satisfactory: { label: 'Satisfactory', tone: 'ok' },
  satisfactory_with_observations: { label: 'Satisfactory with observations', tone: 'info' },
  major_nc: { label: 'Major non-conformity', tone: 'danger' },
  certificate_withdrawn: { label: 'Certificate withdrawn', tone: 'danger' },
};

export function auditOutcome(outcome: string | null | undefined): { label: string; tone: Tone } | null {
  const key = (outcome ?? '').trim().toLowerCase();
  if (!key) return null;
  return AUDIT_OUTCOMES[key] ?? { label: tidyWord(outcome) ?? key, tone: 'neutral' };
}

/** Who carries it out: the organisation and name, else the lead auditor; a survey's issuing authority. */
export function auditorText(row: Pick<AuditSurveyRow, 'kind' | 'auditor_org' | 'auditor_name' | 'lead_auditor'>): string | null {
  if (row.kind === 'certificate_survey') return row.auditor_org;
  const external = [row.auditor_org, row.auditor_name].filter((s): s is string => Boolean(s)).join(' · ');
  if (external) return external;
  return row.lead_auditor ? `${row.lead_auditor} (lead auditor)` : null;
}

/** "None", "3, 2 open"; null for a survey (no findings are recorded against it). */
export function findingsText(findings: AuditFindingCounts | null): string | null {
  if (!findings) return null;
  if (findings.total === 0) return 'None';
  return findings.open > 0 ? `${n(findings.total)}, ${n(findings.open)} open` : `${n(findings.total)}, all closed`;
}

/** "20 days overdue", "Today", "In 30 days", "Started 10 days ago"; null for done or cancelled. */
export function auditWhenText(state: AuditState, days: number | null): string | null {
  if (days === null) return null;
  if (state === 'overdue') return `${plural(-days, 'day')} overdue`;
  if (state === 'in_progress') return days < 0 ? `Started ${plural(-days, 'day')} ago` : days === 0 ? 'Started today' : null;
  if (state === 'due') return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${plural(days, 'day')}`;
  return null;
}

export type AuditPeriod = 'default' | 'next-90' | 'next-12-months' | 'last-90' | 'last-12-months' | 'this-year' | 'last-year';

/** The period's first and last day for a preset on a day (the default: 365 days back to 90 days ahead, the SQL default). */
export function auditPeriodRange(period: string, today: string): { from: string; to: string } {
  const year = Number(today.slice(0, 4));
  switch (period) {
    case 'next-90':
      return { from: today, to: addDays(today, 90) };
    case 'next-12-months':
      return { from: today, to: addDays(today, 365) };
    case 'last-90':
      return { from: addDays(today, -90), to: today };
    case 'last-12-months':
      return { from: addDays(today, -365), to: today };
    case 'this-year':
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    case 'last-year':
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    default:
      return { from: addDays(today, -365), to: addDays(today, 90) };
  }
}

export const AUDIT_FILTERS: readonly ReportFilterSpec[] = [
  {
    key: 'period',
    label: 'Period',
    options: [
      { value: 'default', label: 'Recent and upcoming' },
      { value: 'next-90', label: 'Next 90 days' },
      { value: 'next-12-months', label: 'Next 12 months' },
      { value: 'last-90', label: 'Last 90 days' },
      { value: 'last-12-months', label: 'Last 12 months' },
      { value: 'this-year', label: 'This year' },
      { value: 'last-year', label: 'Last year' },
    ],
    defaultValue: 'default',
  },
  {
    key: 'kind',
    label: 'Show',
    options: [
      { value: 'all', label: 'Audits and surveys' },
      { value: 'audits', label: 'Audits' },
      { value: 'surveys', label: 'Certificate surveys' },
    ],
    defaultValue: 'all',
  },
  {
    key: 'state',
    label: 'Status',
    options: [
      { value: 'all', label: 'Every status' },
      { value: 'open', label: 'Open' },
      { value: 'overdue', label: 'Overdue' },
      { value: 'in-progress', label: 'In progress' },
      { value: 'due', label: 'Due' },
      { value: 'done', label: 'Done' },
      { value: 'findings', label: 'With open findings' },
    ],
    defaultValue: 'all',
  },
];

const OPEN_STATES: ReadonlySet<AuditState> = new Set(['due', 'in_progress', 'overdue']);

/** The rows a Show and Status choice keeps, in the server's order (overdue first). */
export function auditRows(rows: readonly AuditSurveyRow[], kind: string, state: string): AuditSurveyRow[] {
  return rows.filter((r) => {
    const kindOk = kind === 'audits' ? r.kind === 'audit' : kind === 'surveys' ? r.kind === 'certificate_survey' : true;
    const stateOk =
      state === 'open'
        ? OPEN_STATES.has(r.state)
        : state === 'overdue'
          ? r.state === 'overdue'
          : state === 'in-progress'
            ? r.state === 'in_progress'
            : state === 'due'
              ? r.state === 'due'
              : state === 'done'
                ? r.state === 'done'
                : state === 'findings'
                  ? (r.findings?.open ?? 0) > 0
                  : true;
    return kindOk && stateOk;
  });
}

export interface AuditTally {
  overdue: number;
  in_progress: number;
  due: number;
  done: number;
  surveys_due: number;
  open_findings: number;
  major_findings: number;
}

export function tallyAudits(rows: readonly AuditSurveyRow[]): AuditTally {
  const t: AuditTally = { overdue: 0, in_progress: 0, due: 0, done: 0, surveys_due: 0, open_findings: 0, major_findings: 0 };
  for (const r of rows) {
    if (r.state === 'overdue') t.overdue += 1;
    else if (r.state === 'in_progress') t.in_progress += 1;
    else if (r.state === 'due') t.due += 1;
    else if (r.state === 'done') t.done += 1;
    if (r.kind === 'certificate_survey' && (r.state === 'due' || r.state === 'overdue')) t.surveys_due += 1;
    if (r.findings) {
      t.open_findings += r.findings.open;
      t.major_findings += r.findings.major;
    }
  }
  return t;
}

export function auditExportColumns(vesselName: (id: string | null) => string): ExportColumn<AuditSurveyRow>[] {
  return [
    { key: 'date', header: 'Date', kind: 'date', value: (r) => r.on_date },
    { key: 'vessel', header: 'Vessel', value: (r) => vesselName(r.vessel_id) },
    { key: 'kind', header: 'Kind', value: (r) => (r.kind === 'audit' ? 'Audit' : 'Certificate survey') },
    { key: 'title', header: 'Audit or certificate', value: (r) => (r.kind === 'audit' ? auditTypeLabel(r.title) : r.title) },
    { key: 'scope', header: 'Scope', value: (r) => r.scope },
    { key: 'reference', header: 'Reference', value: (r) => r.reference },
    { key: 'state', header: 'Status', value: (r) => AUDIT_STATE_META[r.state].label },
    { key: 'outcome', header: 'Outcome', value: (r) => auditOutcome(r.outcome)?.label ?? null },
    { key: 'scheduled_on', header: 'Scheduled', kind: 'date', value: (r) => r.scheduled_on },
    { key: 'started_on', header: 'Started', kind: 'date', value: (r) => r.started_on },
    { key: 'ended_on', header: 'Ended', kind: 'date', value: (r) => r.ended_on },
    { key: 'auditor', header: 'Auditor or surveyor', value: (r) => auditorText(r) },
    { key: 'findings_total', header: 'Findings', kind: 'number', value: (r) => r.findings?.total ?? null },
    { key: 'findings_open', header: 'Open findings', kind: 'number', value: (r) => r.findings?.open ?? null },
    { key: 'findings_major', header: 'Major non-conformities', kind: 'number', value: (r) => r.findings?.major ?? null },
  ];
}

// ─── R18 work list ──────────────────────────────────────────────────────

const CHIP_META: Readonly<Record<string, { label: string; tone: Tone; order: number }>> = {
  overdue: { label: 'Overdue', tone: 'danger', order: 0 },
  pending_approval: { label: 'Awaiting approval', tone: 'purple', order: 1 },
  in_progress: { label: 'In progress', tone: 'signal', order: 2 },
  scheduled: { label: 'Scheduled', tone: 'info', order: 3 },
  pending: { label: 'Pending', tone: 'neutral', order: 4 },
  open: { label: 'Open', tone: 'neutral', order: 5 },
};

export interface WorkChip {
  key: string;
  label: string;
  tone: Tone;
  count: number;
}

/** A vessel's status chips, overdue first, then awaiting approval, then the live statuses; empty for none. */
export function workChips(statuses: Readonly<Record<string, number>> | null): WorkChip[] {
  if (!statuses) return [];
  return Object.entries(statuses)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => {
      const meta = CHIP_META[key];
      const chip: WorkChip = { key, count, label: meta?.label ?? tidyWord(key) ?? key, tone: meta?.tone ?? 'neutral' };
      return { chip, order: meta?.order ?? 9 };
    })
    .sort((a, b) => a.order - b.order || a.chip.label.localeCompare(b.chip.label))
    .map((x) => x.chip);
}

export const WORK_FILTERS: readonly ReportFilterSpec[] = [
  {
    key: 'show',
    label: 'Show',
    options: [
      { value: 'all', label: 'Every vessel' },
      { value: 'overdue', label: 'With overdue jobs' },
      { value: 'approval', label: 'Awaiting approval' },
    ],
    defaultValue: 'all',
  },
  {
    key: 'priority',
    label: 'Overdue jobs',
    options: [
      { value: 'all', label: 'Every priority' },
      { value: 'high', label: 'High or urgent' },
    ],
    defaultValue: 'all',
  },
];

/** The vessels a Show choice keeps: most overdue first, then awaiting approval, then open; vessels not covered last. */
export function workVesselRows(rows: readonly WorkListVesselRow[], show: string): WorkListVesselRow[] {
  const kept = rows.filter((r) => (show === 'overdue' ? (r.overdue ?? 0) > 0 : show === 'approval' ? (r.pending_approval ?? 0) > 0 : true));
  const rank = (r: WorkListVesselRow) => (r.state === 'ok' ? 0 : 1);
  return [...kept].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (b.overdue ?? 0) - (a.overdue ?? 0) ||
      (b.pending_approval ?? 0) - (a.pending_approval ?? 0) ||
      (b.open ?? 0) - (a.open ?? 0) ||
      a.vessel_name.localeCompare(b.vessel_name),
  );
}

const HIGH_PRIORITIES: ReadonlySet<string> = new Set(['high', 'urgent', 'critical']);

export function isHighPriority(priority: string | null | undefined): boolean {
  return HIGH_PRIORITIES.has((priority ?? '').trim().toLowerCase());
}

/** The overdue jobs a priority choice keeps, in the server's order (most overdue first). */
export function overdueJobRows(rows: readonly OverdueJobRow[], priority: string): OverdueJobRow[] {
  return priority === 'high' ? rows.filter((r) => isHighPriority(r.priority)) : [...rows];
}

export function priorityTone(priority: string | null | undefined): Tone {
  const p = (priority ?? '').trim().toLowerCase();
  if (p === 'urgent' || p === 'critical') return 'danger';
  if (p === 'high') return 'orange';
  return 'neutral';
}

export function workVesselExportColumns(): ExportColumn<WorkListVesselRow>[] {
  const covered = (pick: (r: WorkListVesselRow) => number | null) => (r: WorkListVesselRow) => (r.state === 'ok' ? pick(r) : null);
  return [
    { key: 'vessel', header: 'Vessel', value: (r) => r.vessel_name },
    { key: 'covered', header: 'Covered', value: (r) => (r.state === 'ok' ? 'Yes' : r.state === 'module_off' ? 'Jobs switched off' : 'No access') },
    { key: 'open', header: 'Open jobs', kind: 'number', value: covered((r) => r.open) },
    { key: 'overdue', header: 'Overdue', kind: 'number', value: covered((r) => r.overdue) },
    { key: 'pending_approval', header: 'Awaiting approval', kind: 'number', value: covered((r) => r.pending_approval) },
    { key: 'due_30', header: 'Due within 30 days', kind: 'number', value: covered((r) => r.due_30) },
    { key: 'high_priority', header: 'High or urgent', kind: 'number', value: covered((r) => r.high_priority) },
    { key: 'completed_30', header: 'Completed in the last 30 days', kind: 'number', value: covered((r) => r.completed_30) },
    {
      key: 'statuses',
      header: 'Open jobs by status',
      value: (r) => (r.state === 'ok' ? workChips(r.statuses).map((c) => `${c.label} ${c.count}`).join('; ') || 'None' : null),
    },
  ];
}
