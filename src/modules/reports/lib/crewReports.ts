/**
 * The fleet crew reports' rules (gap/02 R5, R9, R10, R11; T-248, T-292;
 * X5 spec X5-10A). Pure: no React, no Supabase.
 *
 * - Agreement state and contract end bucket: the TS mirrors of the SQL
 *   rules `fleet_report_agreement_state`, `fleet_report_agreement_awaiting`
 *   and `fleet_report_contract_bucket`
 *   (`20261124040900_fleet_report_crew_sources.sql`). The cases tables of
 *   `supabase/tests/sql/fleet/report_crew_sources.test.sql` (between its
 *   `agreement-cases` and `bucket-cases` markers) are asserted against both.
 * - The report filters (in the URL, with more status options than the
 *   reference, T-248), the hours-of-rest period presets and heat-map grain,
 *   the crew-qualification view ("Required by position" by default, or all
 *   crew), tallies, labels and the export columns.
 *
 * Nothing here invents a number: a vessel the report does not cover has
 * null counts (shown "–"), never 0.
 */
import type { Tone } from '@/components/ui/tones';
import type { ExportColumn } from '@/lib/export';
import { fromDateOnly, toDateOnly } from '@/shared/lib/form';
import type {
  AgreementAwaiting,
  AgreementState,
  ContractBucket,
  ContractReportRow,
  CrewComplianceStatus,
  CrewQualificationIssue,
  CrewQualificationRow,
  HoursOfRestEmergingRow,
  HoursOfRestHeatCell,
  HoursOfRestVesselRow,
  ReportVesselCoverage,
} from '../types/db.pending';
import type { ReportFilterSpec } from './reportFilters';

const n = (v: number) => v.toLocaleString('en-GB');
const plural = (v: number, one: string, many = `${one}s`) => `${n(v)} ${v === 1 ? one : many}`;

// ─── Dates (calendar days, never moved by the time zone) ────────────────

const DAY_MS = 86_400_000;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whole days from `from` to `to` (yyyy-MM-dd); null when either is not a day. */
export function daysBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  const a = from ? DAY.exec(from) : null;
  const b = to ? DAY.exec(to) : null;
  if (!a || !b) return null;
  const ta = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const tb = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  return Math.round((tb - ta) / DAY_MS);
}

/** The day `days` after `day` (yyyy-MM-dd). */
export function addDays(day: string, days: number): string {
  const m = DAY.exec(day);
  if (!m) return day;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const SHORT_DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'narrow' });
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short' });

/** "30 Nov 2026"; null for none. */
export function formatDay(value: string | null | undefined): string | null {
  const date = fromDateOnly(value);
  return date ? DAY_FORMAT.format(date) : null;
}

/** "30 Nov"; null for none. */
export function formatShortDay(value: string | null | undefined): string | null {
  const date = fromDateOnly(value);
  return date ? SHORT_DAY.format(date) : null;
}

/** A timestamp's local calendar day as "30 Nov 2026"; null for none. */
export function formatStamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : DAY_FORMAT.format(date);
}

// ─── Agreements and contract end dates (SQL mirrors) ────────────────────

export interface AgreementInput {
  status: string;
  seaReference: string | null;
  signedByCrew: boolean;
  signedByCompany: boolean;
}

/** fleet_report_agreement_state: signed (both parties), draft (a draft with no SEA reference and no signature), else not yet signed. */
export function agreementState(input: AgreementInput): AgreementState {
  if (input.signedByCrew && input.signedByCompany) return 'signed';
  const noReference = (input.seaReference ?? '').trim() === '';
  if (input.status === 'draft' && noReference && !input.signedByCrew && !input.signedByCompany) return 'draft';
  return 'not_signed';
}

/** fleet_report_agreement_awaiting: who a not-yet-signed agreement waits for; null when signed or a draft. */
export function agreementAwaiting(input: AgreementInput): AgreementAwaiting | null {
  if (agreementState(input) !== 'not_signed') return null;
  if (!input.signedByCrew && !input.signedByCompany) return 'both';
  return input.signedByCrew ? 'company' : 'crew';
}

/** fleet_report_contract_bucket: ended (before today), d30, d60, d90 (the end day counts as 0 days); null otherwise. */
export function contractBucket(endDate: string | null | undefined, today: string | null | undefined): ContractBucket | null {
  const days = daysBetween(today, endDate);
  if (days === null) return null;
  if (days < 0) return 'ended';
  if (days <= 30) return 'd30';
  if (days <= 60) return 'd60';
  if (days <= 90) return 'd90';
  return null;
}

export const AGREEMENT_STATES: readonly AgreementState[] = ['draft', 'not_signed', 'signed'];

export const AGREEMENT_STATE_META: Readonly<Record<AgreementState, { label: string; tone: Tone }>> = {
  draft: { label: 'Draft', tone: 'neutral' },
  not_signed: { label: 'Not yet signed', tone: 'warn' },
  signed: { label: 'Signed', tone: 'ok' },
};

export const AWAITING_LABELS: Readonly<Record<AgreementAwaiting, string>> = {
  crew: 'Awaiting the crew member',
  company: 'Awaiting the company',
  both: 'Awaiting both signatures',
};

export const CONTRACT_BUCKETS: readonly ContractBucket[] = ['ended', 'd30', 'd60', 'd90'];

export const CONTRACT_BUCKET_META: Readonly<Record<ContractBucket, { label: string; tone: Tone }>> = {
  ended: { label: 'Ended, still active', tone: 'danger' },
  d30: { label: 'Within 30 days', tone: 'orange' },
  d60: { label: 'In 31 to 60 days', tone: 'warn' },
  d90: { label: 'In 61 to 90 days', tone: 'neutral' },
};

const CONTRACT_TYPE_LABELS: Readonly<Record<string, string>> = {
  permanent: 'Permanent',
  fixed_term: 'Fixed term',
  rotational: 'Rotational',
  temporary: 'Temporary',
  freelance: 'Freelance',
  probationary: 'Probationary',
  seasonal: 'Seasonal',
  daywork: 'Daywork',
};

/** "Fixed term" for fixed_term; an unknown type is shown as written, tidied. */
export function contractTypeLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  return CONTRACT_TYPE_LABELS[type] ?? type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** "Ended 3 days ago", "Ends today", "Ends tomorrow", "Ends in 20 days"; null without an end date. */
export function endsText(daysLeft: number | null): string | null {
  if (daysLeft === null) return null;
  if (daysLeft < 0) return `Ended ${plural(-daysLeft, 'day')} ago`;
  if (daysLeft === 0) return 'Ends today';
  if (daysLeft === 1) return 'Ends tomorrow';
  return `Ends in ${plural(daysLeft, 'day')}`;
}

/** The person's name, or the words for a missing one (never invented). */
export function personLabel(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  return trimmed === '' ? 'Name not recorded' : trimmed;
}

// ─── Filters (URL; more status options than the reference, T-248) ────────

export const CREW_QUALIFICATION_FILTERS: readonly ReportFilterSpec[] = [
  {
    key: 'show',
    label: 'Show',
    options: [
      { value: 'required', label: 'Required by position' },
      { value: 'all', label: 'All crew' },
    ],
    defaultValue: 'required',
  },
  {
    key: 'status',
    label: 'Status',
    options: [
      { value: 'all', label: 'Every status' },
      { value: 'needs-action', label: 'Missing or expired' },
      { value: 'expired', label: 'Expired' },
      { value: 'missing', label: 'Missing' },
      { value: 'expiring', label: 'Expiring' },
      { value: 'complete', label: 'Complete' },
    ],
    defaultValue: 'all',
  },
];

export const HOURS_OF_REST_FILTERS: readonly ReportFilterSpec[] = [
  {
    key: 'period',
    label: 'Period',
    options: [
      { value: 'last-7', label: 'Last 7 days' },
      { value: 'last-30', label: 'Last 30 days' },
      { value: 'last-90', label: 'Last 90 days' },
      { value: 'this-month', label: 'This month' },
      { value: 'last-month', label: 'Last month' },
      { value: 'last-12-months', label: 'Last 12 months' },
    ],
    defaultValue: 'last-30',
  },
  {
    key: 'show',
    label: 'Show',
    options: [
      { value: 'all', label: 'All vessels' },
      { value: 'breaches', label: 'With breaches' },
      { value: 'serious', label: 'With serious breaches' },
      { value: 'unreviewed', label: 'With unreviewed breaches' },
      { value: 'not-submitted', label: 'With months not submitted' },
      { value: 'not-logging', label: 'Not logging' },
    ],
    defaultValue: 'all',
  },
];

export const AGREEMENT_FILTERS: readonly ReportFilterSpec[] = [
  {
    key: 'state',
    label: 'Agreement',
    options: [
      { value: 'all', label: 'Every state' },
      { value: 'draft', label: 'Draft' },
      { value: 'not-signed', label: 'Not yet signed' },
      { value: 'awaiting-crew', label: 'Awaiting the crew member' },
      { value: 'awaiting-company', label: 'Awaiting the company' },
      { value: 'signed', label: 'Signed' },
    ],
    defaultValue: 'all',
  },
];

export const CONTRACT_ENDING_FILTERS: readonly ReportFilterSpec[] = [
  {
    key: 'window',
    label: 'Ending',
    options: [
      { value: 'all', label: 'Ended or due' },
      { value: 'ended', label: 'Ended, still active' },
      { value: 'd30', label: 'Within 30 days' },
      { value: 'd60', label: 'Within 60 days' },
      { value: 'd90', label: 'Within 90 days' },
    ],
    defaultValue: 'all',
  },
  {
    key: 'renewal',
    label: 'Renewal',
    options: [
      { value: 'all', label: 'With or without' },
      { value: 'none', label: 'No renewal drafted' },
      { value: 'drafted', label: 'Renewal drafted' },
    ],
    defaultValue: 'all',
  },
];

// ─── Vessel coverage ─────────────────────────────────────────────────────

/** Why a vessel shows no numbers, in words. */
export function coverageReason(state: ReportVesselCoverage['state'], moduleName: string): string | null {
  if (state === 'no_access') return 'you cannot see this on this vessel';
  if (state === 'module_off') return `${moduleName} is switched off on this vessel`;
  return null;
}

/** The vessels a report does not count, with the reason (for the "Not covered" note). */
export function notCovered(vessels: readonly ReportVesselCoverage[]): ReportVesselCoverage[] {
  return vessels.filter((v) => v.state !== 'ok');
}

// ─── R5 crew qualifications ──────────────────────────────────────────────

/** The page while the RPC or X1's requirement engine is missing (D-01; never zeros). */
export const CREW_QUALIFICATIONS_NOT_SET_UP = 'Crew qualification requirements are not set up yet';

export const COMPLIANCE_STATUS_ORDER: readonly CrewComplianceStatus[] = ['expired', 'missing', 'expiring', 'complete'];

const PLACEMENT_LABELS: Readonly<Record<string, string>> = {
  planned: 'Joining',
  pending_placement: 'Pending placement',
};

/** A chip for how the person is on the list ("Joining", "Pending placement"); null for an assignment. */
export function placementLabel(kind: string | null | undefined): string | null {
  return kind ? PLACEMENT_LABELS[kind] ?? null : null;
}

/** The person's name as the crew list writes it: preferred (else first) name and last name. */
export function crewPersonName(row: Pick<CrewQualificationRow, 'first_name' | 'last_name' | 'preferred_name'>): string {
  const first = (row.preferred_name ?? '').trim() || (row.first_name ?? '').trim();
  return personLabel([first, (row.last_name ?? '').trim()].filter(Boolean).join(' '));
}

/** The position title, else the free-text one; null for none. */
export function crewPosition(row: Pick<CrewQualificationRow, 'position_name' | 'position_text'>): string | null {
  const v = (row.position_name ?? '').trim() || (row.position_text ?? '').trim();
  return v === '' ? null : v;
}

/** "2 of 3"; null when nothing is required in that tab (shown "–" with "Nothing required"). */
export function tabPair(met: number, required: number): string | null {
  return required > 0 ? `${n(met)} of ${n(required)}` : null;
}

/** The first `max` unmet requirements by name, and how many more there are. */
export function issuesSummary(issues: readonly CrewQualificationIssue[], max = 2): { shown: string[]; more: number } {
  const labels = issues.map((i) => i.label.trim()).filter(Boolean);
  return { shown: labels.slice(0, max), more: Math.max(0, labels.length - max) };
}

/** The rows the view shows: "Required by position" keeps people whose position requires something; then the status filter. */
export function qualificationRows(
  rows: readonly CrewQualificationRow[],
  vessels: readonly ReportVesselCoverage[],
  show: string,
  status: string,
): CrewQualificationRow[] {
  const vesselName = new Map(vessels.map((v) => [v.vessel_id, v.vessel_name]));
  const rank = (s: CrewComplianceStatus) => COMPLIANCE_STATUS_ORDER.indexOf(s);
  return rows
    .filter((r) => (show === 'all' ? true : r.required > 0))
    .filter((r) => {
      if (status === 'all') return true;
      if (status === 'needs-action') return r.status === 'missing' || r.status === 'expired';
      return r.status === status;
    })
    .slice()
    .sort(
      (a, b) =>
        rank(a.status) - rank(b.status) ||
        (vesselName.get(a.vessel_id) ?? '').localeCompare(vesselName.get(b.vessel_id) ?? '', 'en-GB') ||
        (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER) ||
        crewPersonName(a).localeCompare(crewPersonName(b), 'en-GB'),
    );
}

export interface QualificationTally {
  people: number;
  complete: number;
  expiring: number;
  missing: number;
  expired: number;
}

/** People per status, over the given rows. */
export function tallyQualifications(rows: readonly CrewQualificationRow[]): QualificationTally {
  const t: QualificationTally = { people: rows.length, complete: 0, expiring: 0, missing: 0, expired: 0 };
  for (const r of rows) t[r.status] += 1;
  return t;
}

/** Covered vessels whose crew have nothing required (no requirements set up there yet). */
export function vesselsWithoutRequirements(
  rows: readonly CrewQualificationRow[],
  vessels: readonly ReportVesselCoverage[],
): ReportVesselCoverage[] {
  return vessels.filter((v) => {
    if (v.state !== 'ok') return false;
    const crew = rows.filter((r) => r.vessel_id === v.vessel_id);
    return crew.length > 0 && crew.every((r) => r.required === 0);
  });
}

export function qualificationExportColumns(vesselName: (id: string) => string): ExportColumn<CrewQualificationRow>[] {
  return [
    { key: 'vessel', header: 'Vessel', value: (r) => vesselName(r.vessel_id) },
    { key: 'person', header: 'Crew member', value: (r) => crewPersonName(r) },
    { key: 'position', header: 'Position', value: (r) => crewPosition(r) },
    { key: 'status', header: 'Status', value: (r) => COMPLIANCE_STATUS_LABELS[r.status] },
    { key: 'met', header: 'Met', kind: 'number', value: (r) => r.met },
    { key: 'required', header: 'Required', kind: 'number', value: (r) => r.required },
    { key: 'documents', header: 'Documents', value: (r) => tabPair(r.docs_met, r.docs_required) },
    { key: 'stcw', header: 'STCW', value: (r) => tabPair(r.stcw_met, r.stcw_required) },
    { key: 'qualifications', header: 'Qualifications', value: (r) => tabPair(r.quals_met, r.quals_required) },
    { key: 'familiarisation', header: 'Familiarisation', value: (r) => tabPair(r.fam_met, r.fam_required) },
    { key: 'next_expiry', header: 'Next expiry', kind: 'date', value: (r) => r.next_expiry },
    { key: 'issues', header: 'Not met', width: 48, value: (r) => r.issues.map((i) => i.label).join('; ') },
  ];
}

export const COMPLIANCE_STATUS_LABELS: Readonly<Record<CrewComplianceStatus, string>> = {
  complete: 'Complete',
  expiring: 'Expiring',
  missing: 'Missing',
  expired: 'Expired',
};

// ─── R9 hours of rest ────────────────────────────────────────────────────

export type HorPeriod = 'last-7' | 'last-30' | 'last-90' | 'this-month' | 'last-month' | 'last-12-months';

/** The days a period preset covers on `today` (yyyy-MM-dd, inclusive; at most 366 days). */
export function horPeriodRange(period: string, today: string): { from: string; to: string } {
  const m = DAY.exec(today);
  if (!m) return { from: today, to: today };
  const year = Number(m[1]);
  const month = Number(m[2]);
  const firstOfMonth = `${m[1]}-${m[2]}-01`;
  switch (period) {
    case 'last-7':
      return { from: addDays(today, -6), to: today };
    case 'last-90':
      return { from: addDays(today, -89), to: today };
    case 'this-month':
      return { from: firstOfMonth, to: today };
    case 'last-month': {
      const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
      const from = `${prev.y}-${String(prev.m).padStart(2, '0')}-01`;
      return { from, to: addDays(firstOfMonth, -1) };
    }
    case 'last-12-months':
      return { from: addDays(today, -364), to: today };
    default:
      return { from: addDays(today, -29), to: today };
  }
}

export type HeatGrain = 'day' | 'week' | 'month';
export type HeatMeasure = 'breaches' | 'serious' | 'unreviewed';

export interface HeatColumn {
  id: string;
  /** First and last day of the column (inclusive). */
  from: string;
  to: string;
  label: string;
  sublabel?: string;
  /** Full words for the tooltip and the cell labels. */
  title: string;
}

/** The heat map's columns for a period: days up to 5 weeks, weeks up to 4 months, else months. */
export function heatColumns(from: string, to: string): { grain: HeatGrain; columns: HeatColumn[] } {
  const span = (daysBetween(from, to) ?? 0) + 1;
  if (span <= 0) return { grain: 'day', columns: [] };
  if (span <= 35) {
    const columns: HeatColumn[] = [];
    for (let i = 0; i < span; i += 1) {
      const day = addDays(from, i);
      const date = fromDateOnly(day) as Date;
      columns.push({
        id: day,
        from: day,
        to: day,
        label: String(date.getDate()),
        sublabel: date.getDate() === 1 || i === 0 ? MONTH.format(date) : WEEKDAY.format(date),
        title: formatDay(day) ?? day,
      });
    }
    return { grain: 'day', columns };
  }
  if (span <= 124) {
    const columns: HeatColumn[] = [];
    // Weeks end on the period's last day, so the latest week is whole.
    for (let end = to; (daysBetween(from, end) ?? -1) >= 0; end = addDays(end, -7)) {
      const start = (daysBetween(from, addDays(end, -6)) ?? 0) >= 0 ? addDays(end, -6) : from;
      columns.unshift({
        id: start,
        from: start,
        to: end,
        label: formatShortDay(start) ?? start,
        sublabel: 'week',
        title: `${formatDay(start)} to ${formatDay(end)}`,
      });
    }
    return { grain: 'week', columns };
  }
  const columns: HeatColumn[] = [];
  let cursor = from;
  while ((daysBetween(cursor, to) ?? -1) >= 0) {
    const date = fromDateOnly(cursor) as Date;
    const next = toDateOnly(new Date(date.getFullYear(), date.getMonth() + 1, 1)) as string;
    const end = (daysBetween(next, to) ?? -1) >= 0 ? addDays(next, -1) : to;
    columns.push({
      id: cursor,
      from: cursor,
      to: end,
      label: MONTH.format(date),
      sublabel: String(date.getFullYear()).slice(2),
      title: `${formatDay(cursor)} to ${formatDay(end)}`,
    });
    cursor = next;
  }
  return { grain: 'month', columns };
}

/** The heat map shows what the Show filter asks about. */
export function heatMeasureFor(show: string): HeatMeasure {
  if (show === 'serious') return 'serious';
  if (show === 'unreviewed') return 'unreviewed';
  return 'breaches';
}

export const HEAT_MEASURE_LABELS: Readonly<Record<HeatMeasure, string>> = {
  breaches: 'Crew in breach',
  serious: 'Crew in serious breach',
  unreviewed: 'Unreviewed breaches',
};

/** The level thresholds per grain: [first "few" value, first "many" value]. */
export const HEAT_LEVELS: Readonly<Record<HeatGrain, readonly [number, number]>> = {
  day: [1, 3],
  week: [1, 5],
  month: [1, 10],
};

export type HeatLevel = 'none' | 'few' | 'many';

export type HeatCellValue =
  | { kind: 'not_covered' }
  | { kind: 'no_entries' }
  | { kind: 'value'; value: number; serious: number; logged: number; level: HeatLevel };

/** vessel id → day → cell. */
export type HeatIndex = ReadonlyMap<string, ReadonlyMap<string, HoursOfRestHeatCell>>;

export function indexHeat(cells: readonly HoursOfRestHeatCell[]): HeatIndex {
  const out = new Map<string, Map<string, HoursOfRestHeatCell>>();
  for (const c of cells) {
    let days = out.get(c.vessel_id);
    if (!days) {
      days = new Map();
      out.set(c.vessel_id, days);
    }
    days.set(c.day, c);
  }
  return out;
}

/** One heat-map cell: the column's sum of the measure, its serious part and the crew-days logged. */
export function heatCell(
  index: HeatIndex,
  vessel: Pick<HoursOfRestVesselRow, 'vessel_id' | 'state'>,
  column: Pick<HeatColumn, 'from' | 'to'>,
  measure: HeatMeasure,
  grain: HeatGrain,
): HeatCellValue {
  if (vessel.state !== 'ok') return { kind: 'not_covered' };
  const days = index.get(vessel.vessel_id);
  let value = 0;
  let serious = 0;
  let logged = 0;
  const span = (daysBetween(column.from, column.to) ?? 0) + 1;
  for (let i = 0; i < span; i += 1) {
    const cell = days?.get(addDays(column.from, i));
    if (!cell) continue;
    value += measure === 'serious' ? cell.serious : measure === 'unreviewed' ? cell.unreviewed : cell.breaches;
    serious += cell.serious;
    logged += cell.logged;
  }
  if (value === 0 && logged === 0) return { kind: 'no_entries' };
  const [few, many] = HEAT_LEVELS[grain];
  const level: HeatLevel = value >= many ? 'many' : value >= few ? 'few' : 'none';
  return { kind: 'value', value, serious, logged, level };
}

/** The legend's entries for a grain, each with the glyph the cells use (never colour alone). */
export function heatLegend(grain: HeatGrain, measure: HeatMeasure): Array<{ key: string; glyph: string; label: string }> {
  const [few, many] = HEAT_LEVELS[grain];
  const unit = grain === 'day' ? 'a day' : grain === 'week' ? 'a week' : 'a month';
  const what = HEAT_MEASURE_LABELS[measure].toLowerCase();
  return [
    { key: 'no_entries', glyph: '·', label: 'No entries' },
    { key: 'none', glyph: '0', label: measure === 'unreviewed' ? 'Nothing to review' : 'Logged, no breach' },
    { key: 'few', glyph: String(few), label: `${few === many - 1 ? n(few) : `${n(few)} to ${n(many - 1)}`} ${what} ${unit}` },
    { key: 'many', glyph: `${n(many)}+`, label: `${n(many)} or more ${what} ${unit}` },
    ...(measure === 'breaches' ? [{ key: 'serious', glyph: '!', label: 'Includes a serious breach' }] : []),
    { key: 'not_covered', glyph: '–', label: 'Not covered' },
  ];
}

/** The vessels the Show filter keeps (the table and the heat map rows). */
export function horVesselRows(rows: readonly HoursOfRestVesselRow[], show: string): HoursOfRestVesselRow[] {
  const ok = (r: HoursOfRestVesselRow) => r.state === 'ok';
  switch (show) {
    case 'breaches':
      return rows.filter((r) => ok(r) && (r.breach_days ?? 0) > 0);
    case 'serious':
      return rows.filter((r) => ok(r) && (r.serious_days ?? 0) > 0);
    case 'unreviewed':
      return rows.filter((r) => ok(r) && (r.unreviewed ?? 0) > 0);
    case 'not-submitted':
      return rows.filter((r) => ok(r) && (r.months_not_submitted ?? 0) > 0);
    case 'not-logging':
      return rows.filter((r) => ok(r) && (r.crew_days ?? 0) === 0);
    default:
      return [...rows];
  }
}

/** "37.5"; null when nothing was logged. */
export function rateText(rate: number | null): string | null {
  return rate === null ? null : rate.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export const HOR_SOURCE_TEXT = {
  breach_review:
    'Breaches are the ones the hours-of-rest engine records, on the day they belong to; serious means below the vessel’s serious threshold (4 h in 24 h or 50 h in 7 days by default). Unreviewed breaches have no review outcome yet.',
  compliance_checks:
    'Breaches are days with a failing rest check; serious means less than 4 h of rest in 24 h or 50 h in 7 days. Unreviewed breaches are the open ones.',
} as const;

export function horVesselExportColumns(): ExportColumn<HoursOfRestVesselRow>[] {
  const covered = (r: HoursOfRestVesselRow, v: number | null) => (r.state === 'ok' ? v : null);
  return [
    { key: 'vessel', header: 'Vessel', value: (r) => r.vessel_name },
    { key: 'covered', header: 'Covered', value: (r) => (r.state === 'ok' ? 'Yes' : r.state === 'module_off' ? 'Hours of rest off' : 'No access') },
    { key: 'crew_logging', header: 'Crew logging', kind: 'number', value: (r) => covered(r, r.crew_logging) },
    { key: 'crew_days', header: 'Crew-days logged', kind: 'number', value: (r) => covered(r, r.crew_days) },
    { key: 'breach_days', header: 'Breach days', kind: 'number', value: (r) => covered(r, r.breach_days) },
    { key: 'serious_days', header: 'Serious breach days', kind: 'number', value: (r) => covered(r, r.serious_days) },
    { key: 'unreviewed', header: 'Unreviewed breaches', kind: 'number', value: (r) => covered(r, r.unreviewed) },
    { key: 'months_not_submitted', header: 'Months not submitted', kind: 'number', value: (r) => covered(r, r.months_not_submitted) },
    { key: 'rate_per_100', header: 'Breaches per 100 crew-days', kind: 'number', value: (r) => covered(r, r.rate_per_100) },
    { key: 'last_entry', header: 'Last entry', kind: 'date', value: (r) => r.last_entry },
  ];
}

/** "and 3 more" text for a list cut at `shown` of `total`; null when nothing is left out. */
export function moreText(shown: number, total: number): string | null {
  return total > shown ? `and ${n(total - shown)} more` : null;
}

export function emergingVessel(row: HoursOfRestEmergingRow, vessels: readonly ReportVesselCoverage[]): ReportVesselCoverage | null {
  return vessels.find((v) => v.vessel_id === row.vessel_id) ?? null;
}

// ─── R10 agreements / R11 contracts ending ───────────────────────────────

export interface AgreementTally {
  total: number;
  draft: number;
  not_signed: number;
  signed: number;
  awaiting_crew: number;
  awaiting_company: number;
  awaiting_both: number;
}

/** The agreement rows (draft and active contracts) the state filter keeps, most to do first. */
export function agreementRows(rows: readonly ContractReportRow[], state: string): ContractReportRow[] {
  const order: Record<AgreementState, number> = { not_signed: 0, draft: 1, signed: 2 };
  return rows
    .filter((r) => r.status === 'draft' || r.status === 'active')
    .filter((r) => {
      switch (state) {
        case 'draft':
          return r.agreement_state === 'draft';
        case 'not-signed':
          return r.agreement_state === 'not_signed';
        case 'awaiting-crew':
          return r.awaiting === 'crew' || r.awaiting === 'both';
        case 'awaiting-company':
          return r.awaiting === 'company' || r.awaiting === 'both';
        case 'signed':
          return r.agreement_state === 'signed';
        default:
          return true;
      }
    })
    .slice()
    .sort((a, b) => order[a.agreement_state] - order[b.agreement_state] || personLabel(a.person_name).localeCompare(personLabel(b.person_name), 'en-GB'));
}

export function tallyAgreements(rows: readonly ContractReportRow[]): AgreementTally {
  const t: AgreementTally = { total: 0, draft: 0, not_signed: 0, signed: 0, awaiting_crew: 0, awaiting_company: 0, awaiting_both: 0 };
  for (const r of rows) {
    if (r.status !== 'draft' && r.status !== 'active') continue;
    t.total += 1;
    t[r.agreement_state] += 1;
    if (r.awaiting === 'crew') t.awaiting_crew += 1;
    else if (r.awaiting === 'company') t.awaiting_company += 1;
    else if (r.awaiting === 'both') t.awaiting_both += 1;
  }
  return t;
}

export interface EndingTally {
  total: number;
  ended: number;
  d30: number;
  d60: number;
  d90: number;
  renewals: number;
}

/** Active contracts with an end bucket, by the window and renewal filters, soonest first. */
export function endingRows(rows: readonly ContractReportRow[], window: string, renewal: string): ContractReportRow[] {
  return rows
    .filter((r) => r.status === 'active' && r.bucket !== null)
    .filter((r) => {
      const days = r.days_left ?? Number.MAX_SAFE_INTEGER;
      switch (window) {
        case 'ended':
          return r.bucket === 'ended';
        case 'd30':
          return days >= 0 && days <= 30;
        case 'd60':
          return days >= 0 && days <= 60;
        case 'd90':
          return days >= 0 && days <= 90;
        default:
          return true;
      }
    })
    .filter((r) => (renewal === 'none' ? !r.renewal_drafted : renewal === 'drafted' ? r.renewal_drafted : true))
    .slice()
    .sort((a, b) => (a.days_left ?? 0) - (b.days_left ?? 0) || personLabel(a.person_name).localeCompare(personLabel(b.person_name), 'en-GB'));
}

export function tallyEnding(rows: readonly ContractReportRow[]): EndingTally {
  const t: EndingTally = { total: 0, ended: 0, d30: 0, d60: 0, d90: 0, renewals: 0 };
  for (const r of rows) {
    if (r.status !== 'active' || r.bucket === null) continue;
    t.total += 1;
    t[r.bucket] += 1;
    if (r.renewal_drafted) t.renewals += 1;
  }
  return t;
}

export function agreementExportColumns(vesselName: (id: string | null) => string): ExportColumn<ContractReportRow>[] {
  return [
    { key: 'person', header: 'Crew member', value: (r) => personLabel(r.person_name) },
    { key: 'position', header: 'Position', value: (r) => r.position },
    { key: 'vessel', header: 'Vessel', value: (r) => vesselName(r.vessel_id) },
    { key: 'agreement', header: 'Agreement', value: (r) => AGREEMENT_STATE_META[r.agreement_state].label },
    { key: 'awaiting', header: 'Awaiting', value: (r) => (r.awaiting ? AWAITING_LABELS[r.awaiting] : null) },
    { key: 'sea_reference', header: 'SEA reference', value: (r) => r.sea_reference },
    { key: 'contract_number', header: 'Contract', value: (r) => r.contract_number },
    { key: 'contract_type', header: 'Type', value: (r) => contractTypeLabel(r.contract_type) },
    { key: 'start_date', header: 'Starts', kind: 'date', value: (r) => r.start_date },
    { key: 'end_date', header: 'Ends', kind: 'date', value: (r) => r.end_date },
    { key: 'signed_by_crew', header: 'Signed by the crew member', kind: 'date', value: (r) => r.signed_by_crew_at },
    { key: 'signed_by_company', header: 'Signed by the company', kind: 'date', value: (r) => r.signed_by_company_at },
  ];
}

export function endingExportColumns(vesselName: (id: string | null) => string): ExportColumn<ContractReportRow>[] {
  return [
    { key: 'person', header: 'Crew member', value: (r) => personLabel(r.person_name) },
    { key: 'position', header: 'Position', value: (r) => r.position },
    { key: 'vessel', header: 'Vessel', value: (r) => vesselName(r.vessel_id) },
    { key: 'end_date', header: 'Ends', kind: 'date', value: (r) => r.end_date },
    { key: 'days_left', header: 'Days left', kind: 'number', value: (r) => r.days_left },
    { key: 'bucket', header: 'Window', value: (r) => (r.bucket ? CONTRACT_BUCKET_META[r.bucket].label : null) },
    { key: 'renewal', header: 'Renewal drafted', value: (r) => (r.renewal_drafted ? 'Yes' : 'No') },
    { key: 'contract_number', header: 'Contract', value: (r) => r.contract_number },
    { key: 'contract_type', header: 'Type', value: (r) => contractTypeLabel(r.contract_type) },
    { key: 'agreement', header: 'Agreement', value: (r) => AGREEMENT_STATE_META[r.agreement_state].label },
  ];
}

/** A vessel's name for the contract reports; "No current vessel" for an unassigned contract. */
export function contractVesselName(vessels: readonly ReportVesselCoverage[]): (id: string | null) => string {
  const names = new Map(vessels.map((v) => [v.vessel_id, v.vessel_name]));
  return (id) => (id === null ? 'No current vessel' : names.get(id) ?? 'Vessel not listed');
}
