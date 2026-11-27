/**
 * The vessel's hours-of-rest report (gap/04 C44, C41, C42; W6; T-142,
 * T-292; X1-08B): the model behind the report page and the breach report
 * dialog. Pure: no React, no Supabase.
 *
 * - The year's months from work_rest_month_stats (`parseMonthStats`, strict:
 *   an answer in another shape is an error, never a guess).
 * - Each month's phase against the vessel's Hours of Rest start date (C45)
 *   and today: a month wholly before the start is not expected; a month
 *   still running is in progress; only months that have ended can be "not
 *   submitted".
 * - The four KPIs (Unreviewed breaches, Serious open, Not submitted,
 *   Awaiting approval) and the month each one opens on the board.
 * - The submission summary of a month ("8 of 10 submitted", "2 not
 *   submitted", "All 10 approved").
 * - The breach report (C42, D-X1-14, D-X1-23): which breaches can go in a
 *   report (reviewed, not reported, the server's rule), the form (RHF +
 *   zod), the server's refusals in words, its answer, and the copy that
 *   says it was shared in STORM (never that an email was sent, D-249).
 * - The reports sent and the reminder log (C41), with the notice that
 *   automatic reminders are not scheduled yet while the vessel has none.
 */
import { z } from 'zod';
import type { Tone } from '@/components/ui/tones';
import { dateOnly } from '@/shared/lib/form';
import type { WorkRestReminderKind, WorkRestVesselBreachRow } from '../types/db.pending';
import { MONTH_NAMES } from './horBoard';

// ---------------------------------------------------------------- the RPCs and the D-01 rule

/** The report's RPCs (20261124060800, X1-08). */
export const REPORT_RPC = {
  monthStats: 'work_rest_month_stats',
  recipients: 'work_rest_breach_report_recipients',
  create: 'work_rest_breach_report_create',
} as const;
export type ReportRpc = (typeof REPORT_RPC)[keyof typeof REPORT_RPC];

/** The page while the statistics (or the report) RPC is not in the database (D-01). */
export const REPORT_NOT_SET_UP = 'The hours of rest report becomes available once the crew update is applied.';

/** The dialog while the recipients or the create RPC is missing (D-01). */
export const BREACH_REPORT_NOT_SET_UP = 'Breach reports become available once the crew update is applied.';

/**
 * The RPC is not in this database yet (D-01, D-239): PostgREST's function
 * schema-cache miss (PGRST202), or Postgres' undefined function (42883)
 * when its message names the called function itself. A 42883 raised by a
 * helper inside an existing function is a real error, as is anything else.
 */
export function isReportRpcMissing(error: unknown, fn: ReportRpc): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === 'PGRST202') return true;
  return code === '42883' && typeof message === 'string' && message.includes(fn);
}

/** The server answered in a shape the page does not know: an error with Retry, never a guess. */
export class ReportShapeError extends Error {
  constructor(what: string) {
    super(`The hours of rest report answered in an unexpected shape (${what}).`);
    this.name = 'ReportShapeError';
  }
}

// ---------------------------------------------------------------- dates

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, '0');

/** `yyyy-MM-dd` of a real calendar day. */
export function isDay(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DAY_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

export const firstDayOf = (year: number, month: number): string => `${year}-${pad(month)}-01`;
export const lastDayOf = (year: number, month: number): string =>
  `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;

/** Days from `from` to `to` (both `yyyy-MM-dd`): 0 for the same day, negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const t = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((t(to) - t(from)) / 86_400_000);
}

/** "3 Nov 2026". */
export function shortDate(day: string): string {
  return `${Number(day.slice(8, 10))} ${MONTH_NAMES[Number(day.slice(5, 7)) - 1].slice(0, 3)} ${day.slice(0, 4)}`;
}

/** "1 Oct to 31 Oct 2026", "1 Dec 2026 to 15 Jan 2027", "3 Nov 2026" for one day. */
export function periodText(from: string, to: string): string {
  if (from === to) return shortDate(from);
  if (from.slice(0, 4) === to.slice(0, 4)) return `${shortDate(from).slice(0, -5)} to ${shortDate(to)}`;
  return `${shortDate(from)} to ${shortDate(to)}`;
}

/** The local calendar day of a timestamp, `yyyy-MM-dd`. */
export function localDayOf(timestamp: string): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return timestamp.slice(0, 10);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------------------------------------------------------------- the year in the URL

export const REPORT_YEAR_MIN = 2000;

/** `?year=` as a year from 2000 up to the current one; anything else is the current year. */
export function parseReportYear(param: string | null | undefined, currentYear: number): number {
  if (!param || !/^\d{4}$/.test(param)) return currentYear;
  const year = Number(param);
  return year >= REPORT_YEAR_MIN && year <= currentYear ? year : currentYear;
}

// ---------------------------------------------------------------- month statistics

/** One month of work_rest_month_stats, in the page's words. */
export interface MonthStats {
  month: number;
  crew: number;
  daysLogged: number;
  breachDays: number;
  unreviewed: number;
  seriousOpen: number;
  awaitingCorrection: number;
  notSubmitted: number;
  awaitingApproval: number;
  approved: number;
  locked: number;
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/**
 * work_rest_month_stats' rows, oldest month first. Strict: an array of
 * objects with a month 1-12 (each once) and whole, non-negative counts;
 * the months by state never add up to more than the crew.
 */
export function parseMonthStats(value: unknown): MonthStats[] {
  if (!Array.isArray(value)) throw new ReportShapeError('not a list of months');
  const seen = new Set<number>();
  const rows = value.map((raw, i) => {
    if (!raw || typeof raw !== 'object') throw new ReportShapeError(`row ${i + 1}`);
    const r = raw as Record<string, unknown>;
    const month = r.period_month;
    if (typeof month !== 'number' || !Number.isInteger(month) || month < 1 || month > 12 || seen.has(month)) {
      throw new ReportShapeError(`row ${i + 1} month`);
    }
    seen.add(month);
    const count = (column: string): number => {
      const v = r[column];
      if (!isCount(v)) throw new ReportShapeError(`row ${i + 1} ${column}`);
      return v;
    };
    const stats: MonthStats = {
      month,
      crew: count('crew'),
      daysLogged: count('days_logged'),
      breachDays: count('breach_days'),
      unreviewed: count('unreviewed'),
      seriousOpen: count('serious_open'),
      awaitingCorrection: count('awaiting_correction'),
      notSubmitted: count('not_submitted'),
      awaitingApproval: count('awaiting_approval'),
      approved: count('approved'),
      locked: count('locked'),
    };
    if (stats.notSubmitted + stats.awaitingApproval + stats.approved + stats.locked > stats.crew) {
      throw new ReportShapeError(`row ${i + 1} states`);
    }
    return stats;
  });
  return rows.sort((a, b) => a.month - b.month);
}

/** Where a month stands for the report (C45: before the start date nothing is expected). */
export type MonthPhase = 'before_start' | 'ended' | 'current' | 'future';

export interface ReportContext {
  year: number;
  /** Today, `yyyy-MM-dd` (local). */
  today: string;
  /** The vessel's Hours of Rest start date (vessel_module_settings crew_hor enabled_from), if any. */
  horFrom: string | null;
}

export function monthPhase(month: number, ctx: ReportContext): MonthPhase {
  const first = firstDayOf(ctx.year, month);
  const last = lastDayOf(ctx.year, month);
  if (ctx.horFrom && last < ctx.horFrom) return 'before_start';
  if (last < ctx.today) return 'ended';
  if (first <= ctx.today) return 'current';
  return 'future';
}

/** The month's submissions in one line, with the pill's tone (never colour alone: the label says it). */
export interface SubmissionSummary {
  state: 'not_expected' | 'no_crew' | 'complete' | 'in_progress' | 'missing' | 'awaiting';
  label: string;
  tone: Tone;
  /** "6 approved · 2 awaiting approval" (the non-zero parts the label does not already say). */
  detail: string;
}

const plural = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`;

export function submissionSummary(row: MonthStats, phase: MonthPhase): SubmissionSummary {
  const approved = row.approved + row.locked;
  const submitted = approved + row.awaitingApproval;
  const parts = [
    approved ? `${approved} approved` : null,
    row.awaitingApproval ? `${row.awaitingApproval} awaiting approval` : null,
    row.notSubmitted ? `${row.notSubmitted} not submitted` : null,
  ].filter((p): p is string => p !== null);
  // The breakdown says what the label does not: never the label again.
  const detailBeside = (label: string) => parts.filter((p) => p !== label).join(' · ');
  if (phase === 'before_start') return { state: 'not_expected', label: 'Before hours of rest started', tone: 'neutral', detail: '' };
  if (row.crew === 0) return { state: 'no_crew', label: 'Nobody on board', tone: 'neutral', detail: '' };
  if (approved === row.crew) return { state: 'complete', label: row.crew === 1 ? 'Approved' : `All ${row.crew} approved`, tone: 'ok', detail: '' };
  if (phase === 'current' || phase === 'future') {
    return { state: 'in_progress', label: `In progress: ${submitted} of ${row.crew} submitted`, tone: 'info', detail: detailBeside('') };
  }
  if (row.notSubmitted > 0) {
    const label = `${row.notSubmitted} not submitted`;
    return { state: 'missing', label, tone: 'warn', detail: detailBeside(label) };
  }
  const label = `${row.awaitingApproval} awaiting approval`;
  return { state: 'awaiting', label, tone: 'signal', detail: detailBeside(label) };
}

/** One row of the By month table. */
export interface MonthRow extends MonthStats {
  label: string;
  phase: MonthPhase;
  submission: SubmissionSummary;
}

/** The By month table: newest month first. */
export function monthRows(rows: readonly MonthStats[], ctx: ReportContext): MonthRow[] {
  return [...rows]
    .sort((a, b) => b.month - a.month)
    .map((r) => {
      const phase = monthPhase(r.month, ctx);
      return { ...r, label: MONTH_NAMES[r.month - 1], phase, submission: submissionSummary(r, phase) };
    });
}

/** The four KPIs, and the month each opens on the board (the latest month that has some). */
export interface ReportKpis {
  unreviewed: number;
  awaitingCorrection: number;
  seriousOpen: number;
  /** Crew months not submitted, in months that have ended and were expected. */
  notSubmitted: number;
  /** How many ended, expected months have something not submitted. */
  notSubmittedMonths: number;
  /** At least one expected month has ended this year. */
  anyMonthEnded: boolean;
  awaitingApproval: number;
  targets: {
    unreviewed: number | null;
    seriousOpen: number | null;
    notSubmitted: number | null;
    awaitingApproval: number | null;
  };
}

export function reportKpis(rows: readonly MonthStats[], ctx: ReportContext): ReportKpis {
  const latest = (pick: (r: MonthStats) => boolean): number | null =>
    rows.filter(pick).reduce<number | null>((m, r) => (m === null || r.month > m ? r.month : m), null);
  const expected = rows.filter((r) => monthPhase(r.month, ctx) !== 'before_start');
  const ended = expected.filter((r) => monthPhase(r.month, ctx) === 'ended');
  const sum = (list: readonly MonthStats[], pick: (r: MonthStats) => number) => list.reduce((n, r) => n + pick(r), 0);
  return {
    unreviewed: sum(rows, (r) => r.unreviewed),
    awaitingCorrection: sum(rows, (r) => r.awaitingCorrection),
    seriousOpen: sum(rows, (r) => r.seriousOpen),
    notSubmitted: sum(ended, (r) => r.notSubmitted),
    notSubmittedMonths: ended.filter((r) => r.notSubmitted > 0).length,
    anyMonthEnded: ended.length > 0,
    awaitingApproval: sum(expected, (r) => r.awaitingApproval),
    targets: {
      unreviewed: latest((r) => r.unreviewed + r.awaitingCorrection > 0),
      seriousOpen: latest((r) => r.seriousOpen > 0),
      notSubmitted: latest((r) => r.notSubmitted > 0 && monthPhase(r.month, ctx) === 'ended'),
      awaitingApproval: latest((r) => r.awaitingApproval > 0 && monthPhase(r.month, ctx) !== 'before_start'),
    },
  };
}

/** The year has months with data: false for a year before the vessel had anyone on board. */
export const hasAnyCrew = (rows: readonly MonthStats[]): boolean => rows.some((r) => r.crew > 0);

// ---------------------------------------------------------------- people

export interface NamedPerson {
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
}

/** "Bosun Example", the preferred first name first; "Crew member" when the profile has no name. */
export function personName(p: NamedPerson | null | undefined): string {
  if (!p) return 'Crew member';
  const first = p.preferred_name?.trim() || p.first_name?.trim() || '';
  return [first, p.last_name?.trim() || ''].filter(Boolean).join(' ') || 'Crew member';
}

// ---------------------------------------------------------------- the breach report (C42, D-X1-14, D-X1-23)

/** Reviewed outcomes and the legacy reviewed states a report may include (the server's rule). */
const REPORTABLE_LEGACY_STATUSES: ReadonlySet<string> = new Set(['justified', 'accepted_by_captain', 'dismissed', 'corrected']);

/**
 * A breach can go in a breach report: it is reviewed (accepted or
 * dismissed, or reviewed under the legacy states) and in no report yet.
 * Open breaches and ones waiting on a correction cannot.
 */
export function isReportableBreach(b: Pick<WorkRestVesselBreachRow, 'review_outcome' | 'status' | 'breach_report_id'>): boolean {
  if (b.breach_report_id) return false;
  if (b.review_outcome === 'accepted' || b.review_outcome === 'dismissed') return true;
  return b.review_outcome === null && REPORTABLE_LEGACY_STATUSES.has(b.status ?? '');
}

/** The breaches the dialog offers for a period: reportable, in the period, by day then name. */
export function reportableBreaches<T extends Pick<WorkRestVesselBreachRow, 'review_outcome' | 'status' | 'breach_report_id' | 'breach_day' | 'last_name' | 'first_name' | 'nc_id'>>(
  rows: readonly T[],
  from: string,
  to: string,
): T[] {
  const name = (r: T) => `${r.last_name ?? ''} ${r.first_name ?? ''}`.trim().toLowerCase();
  return rows
    .filter((r) => isReportableBreach(r) && r.breach_day !== null && r.breach_day >= from && r.breach_day <= to)
    .sort((a, b) => (a.breach_day ?? '').localeCompare(b.breach_day ?? '') || name(a).localeCompare(name(b)) || a.nc_id.localeCompare(b.nc_id));
}

/** The server's limits (work_rest_breach_report_create). */
export const BREACH_REPORT_LIMITS = { maxDays: 366, maxBreaches: 500, maxRecipients: 50, notesMax: 2000 } as const;

/** The breach report form (RHF + zod); the server checks every rule again. */
export const breachReportSchema = z
  .object({
    from: dateOnly('Choose the start date.'),
    to: dateOnly('Choose the end date.'),
    ncIds: z
      .array(z.string().min(1))
      .min(1, 'Choose the breaches to report.')
      .max(BREACH_REPORT_LIMITS.maxBreaches, `Report at most ${BREACH_REPORT_LIMITS.maxBreaches} breaches at a time.`),
    recipientIds: z
      .array(z.string().min(1))
      .min(1, 'Choose who receives the report.')
      .max(BREACH_REPORT_LIMITS.maxRecipients, `Send a report to at most ${BREACH_REPORT_LIMITS.maxRecipients} people.`),
    notes: z.string().max(BREACH_REPORT_LIMITS.notesMax, `Keep the notes to ${BREACH_REPORT_LIMITS.notesMax} characters.`),
  })
  .superRefine((v, ctx) => {
    if (v.to < v.from) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'The end date is before the start date.' });
    } else if (daysBetween(v.from, v.to) > BREACH_REPORT_LIMITS.maxDays) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'Choose a period of one year or less.' });
    }
  });
export type BreachReportValues = z.infer<typeof breachReportSchema>;

/** A period the breach list may be read for (the server refuses more than a year, or an inverted range). */
export function isReadableRange(from: unknown, to: unknown): boolean {
  return isDay(from) && isDay(to) && to >= from && daysBetween(from, to) <= BREACH_REPORT_LIMITS.maxDays;
}

/** What the dialog says once the report is created: shared in STORM, never "emailed" (D-249). */
export function sharedText(people: number): string {
  return `Report shared in STORM with ${plural(people, 'person', 'people')}`;
}

/** The server's refusals of a breach report, in words (its DETAIL says the same; this is the fallback). */
export const REPORT_REFUSAL_TEXT: Readonly<Record<string, string>> = {
  crew_not_permitted: 'Only the final approver sends hours of rest breach reports.',
  range_required: 'Choose the period of the report.',
  range_invalid: 'The end date is before the start date.',
  range_too_long: 'Choose a period of one year or less.',
  breaches_required: 'Choose the breaches to report.',
  too_many_breaches: 'Report at most 500 breaches at a time.',
  recipients_required: 'Choose who receives the report.',
  too_many_recipients: 'Send a report to at most 50 people.',
  notes_too_long: 'Keep the notes to 2000 characters.',
  breach_not_on_vessel: 'Report breaches of this vessel only.',
  breach_out_of_range: 'Every breach must fall in the period of the report.',
  breach_superseded: 'A breach no longer applies: its record was corrected.',
  breach_not_reviewed: 'Review every breach before you report it.',
  breach_already_reported: 'A breach is already in another breach report.',
  recipient_not_allowed: 'Send breach reports to the fleet HR or the DPA of the company only.',
};

/**
 * A refusal in one sentence: the server's DETAIL when it gave one, else the
 * known sentence for its message, else null (the caller's generic wording).
 */
export function reportRefusalText(refusal: string, detail: string | null): string | null {
  const d = detail?.trim();
  if (d && !/^[a-z0-9_]+$/.test(d)) return d;
  return REPORT_REFUSAL_TEXT[refusal] ?? null;
}

/** Refusals whose HINT names the breach or the recipient at fault. */
export const REFUSALS_NAMING_A_BREACH: ReadonlySet<string> = new Set([
  'breach_not_on_vessel',
  'breach_out_of_range',
  'breach_superseded',
  'breach_not_reviewed',
  'breach_already_reported',
]);

/** work_rest_breach_report_create's answer. */
export interface BreachReportCreated {
  reportId: string;
  reference: string;
  breachCount: number;
  recipientCount: number;
}

export function parseBreachReportCreated(value: unknown): BreachReportCreated {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ReportShapeError('breach report answer');
  const r = value as Record<string, unknown>;
  if (typeof r.report_id !== 'string' || !r.report_id || typeof r.reference !== 'string' || !r.reference) {
    throw new ReportShapeError('breach report id');
  }
  if (!isCount(r.nc_count) || r.nc_count < 1 || !isCount(r.recipient_count) || r.recipient_count < 1) {
    throw new ReportShapeError('breach report counts');
  }
  return { reportId: r.report_id, reference: r.reference, breachCount: r.nc_count, recipientCount: r.recipient_count };
}

/** Who a report may go to (D-X1-14). */
export const RECIPIENT_KIND_LABEL: Readonly<Record<'dpa' | 'fleet_hr', string>> = {
  dpa: 'DPA',
  fleet_hr: 'Fleet HR',
};

// ---------------------------------------------------------------- breach reports sent

/** One breach report sent, as the page lists it. */
export interface SentReport {
  id: string;
  reference: string;
  periodFrom: string;
  periodTo: string;
  ncIds: string[];
  recipientIds: string[];
  notes: string | null;
  sentBy: string | null;
  /** The sender's name, when their profile could be read. */
  sentByName: string | null;
  sentAt: string;
}

/** "3 breaches · shared in STORM with 2 people". */
export function sentReportLine(r: Pick<SentReport, 'ncIds' | 'recipientIds'>): string {
  return `${plural(r.ncIds.length, 'breach', 'breaches')} · shared in STORM with ${plural(r.recipientIds.length, 'person', 'people')}`;
}

/** "Sent 26 Nov 2026 by Demo Master", or without the name when it is not known. */
export function sentByLine(r: Pick<SentReport, 'sentAt' | 'sentByName'>): string {
  const on = shortDate(localDayOf(r.sentAt));
  return r.sentByName ? `Sent ${on} by ${r.sentByName}` : `Sent ${on}`;
}

/**
 * The rows of a report's PDF, rebuilt from the breaches it stored
 * (D-X1-23): the breaches still on record, in day order, and how many of
 * its ids are no longer listed (a record corrected after the report).
 */
export function reportBreachRows<T extends Pick<WorkRestVesselBreachRow, 'nc_id' | 'breach_day' | 'last_name' | 'first_name'>>(
  report: Pick<SentReport, 'ncIds'>,
  rows: readonly T[],
): { rows: T[]; missing: number } {
  const wanted = new Set(report.ncIds);
  const found = rows.filter((r) => wanted.has(r.nc_id));
  const unique = [...new Map(found.map((r) => [r.nc_id, r])).values()];
  const name = (r: T) => `${r.last_name ?? ''} ${r.first_name ?? ''}`.trim().toLowerCase();
  unique.sort((a, b) => (a.breach_day ?? '').localeCompare(b.breach_day ?? '') || name(a).localeCompare(name(b)) || a.nc_id.localeCompare(b.nc_id));
  return { rows: unique, missing: wanted.size - unique.length };
}

// ---------------------------------------------------------------- the reminder log (C41)

/** One reminder sent, as the report page lists it. */
export interface ReminderEntry {
  id: string;
  profileId: string;
  crewName: string;
  periodYear: number;
  periodMonth: number;
  kind: WorkRestReminderKind;
  byLabel: string | null;
  sentOn: string;
  sentAt: string;
}

export const REMINDER_KIND_LABEL: Readonly<Record<WorkRestReminderKind, string>> = {
  manual: 'Reminder',
  auto_month_start: 'Month start',
  sign_off: 'Sign-off day',
  pre_cutoff: 'Before the cut-off',
};

/** "Reminded by Chief Officer", "Sent automatically: month start". */
export function reminderWho(e: Pick<ReminderEntry, 'kind' | 'byLabel'>): string {
  if (e.kind !== 'manual') return `Sent automatically: ${REMINDER_KIND_LABEL[e.kind].toLowerCase()}`;
  return e.byLabel ? `Reminded by ${e.byLabel}` : 'Reminded by an approver';
}

/** "October 2026": the month the reminder was about. */
export const reminderMonth = (e: Pick<ReminderEntry, 'periodYear' | 'periodMonth'>): string => `${MONTH_NAMES[e.periodMonth - 1]} ${e.periodYear}`;

/** The notice while no automatic reminder was ever sent for the vessel (PR-X1-K schedules the sweep). */
export const AUTO_REMINDERS_NOT_SCHEDULED = 'Automatic reminders are not scheduled yet';

export function autoRemindersNotice(vesselHasAutomatic: boolean): string | null {
  return vesselHasAutomatic ? null : AUTO_REMINDERS_NOT_SCHEDULED;
}

/** The page's path relative to the vessel (the crew manifest's route: `${CREW_PATHS.hoursOfRest}/report`). */
export const HOR_REPORT_PATH = 'crew/hours-of-rest/report';
