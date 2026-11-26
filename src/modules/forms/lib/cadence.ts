/**
 * Template cadence: how often a vessel runs a form or checklist, and when
 * the next run is due (gap/02 FC3, FC6, W2 "Runs"; X5 spec §2 X5-06A).
 *
 * Mirrors the SQL of `20261124040500_fleet_form_templates.sql`:
 * - `CADENCES` is `form_templates_cadence_check`;
 * - `nextDue` is `form_template_next_due(cadence, anchor)`: daily +1 day,
 *   weekly +7 days, monthly / quarterly / six-monthly +1 / 3 / 6 months,
 *   yearly / two-yearly / five-yearly +1 / 2 / 5 years; a month or year
 *   step from a day the target month lacks lands on that month's last day
 *   (31 Jan + 1 month = 28 or 29 Feb, as PostgreSQL's date + interval);
 *   none, per voyage, per charter, on demand: no due day;
 * - `runDue` is the next-due and overdue columns of
 *   `form_template_run_stats`: from the last run's day, else from the
 *   day the template was first published; overdue from the day after the
 *   due day; a template hidden on the vessel is never due.
 * The SQL test copies the cases of src/test/forms/cadence.test.ts between
 * its cadence-cases markers, and the TS test reads them back.
 *
 * Days are `YYYY-MM-DD` strings (calendar days, no time zone); the math is
 * on the calendar numbers, never on a local Date, so it cannot drift by a
 * day.
 *
 * Pure: no React, no Supabase.
 */
import type { FormTemplateCadence } from '../types/db.pending';

export type { FormTemplateCadence } from '../types/db.pending';

export const CADENCES = [
  'none',
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'six_monthly',
  'yearly',
  'two_yearly',
  'five_yearly',
  'per_voyage',
  'per_charter',
  'on_demand',
] as const satisfies readonly FormTemplateCadence[];

export const CADENCE_LABELS: Readonly<Record<FormTemplateCadence, string>> = {
  none: 'No set cadence',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  six_monthly: 'Every 6 months',
  yearly: 'Yearly',
  two_yearly: 'Every 2 years',
  five_yearly: 'Every 5 years',
  per_voyage: 'Each voyage',
  per_charter: 'Each charter',
  on_demand: 'When needed',
};

/** Cadences driven by an event (a voyage, a charter, a need) or none: they never fall due by the calendar. */
export const UNSCHEDULED_CADENCES: readonly FormTemplateCadence[] = ['none', 'per_voyage', 'per_charter', 'on_demand'];

type Step = { days: number } | { months: number };

const STEPS: Readonly<Partial<Record<FormTemplateCadence, Step>>> = {
  daily: { days: 1 },
  weekly: { days: 7 },
  monthly: { months: 1 },
  quarterly: { months: 3 },
  six_monthly: { months: 6 },
  yearly: { months: 12 },
  two_yearly: { months: 24 },
  five_yearly: { months: 60 },
};

export const isCadence = (value: unknown): value is FormTemplateCadence =>
  typeof value === 'string' && (CADENCES as readonly string[]).includes(value);

/** The label of a cadence; null when none is set or the value is unknown. */
export function cadenceLabel(cadence: string | null | undefined): string | null {
  return isCadence(cadence) ? CADENCE_LABELS[cadence] : null;
}

/** Whether runs of this cadence fall due by the calendar. */
export function isScheduledCadence(cadence: string | null | undefined): boolean {
  return isCadence(cadence) && STEPS[cadence] !== undefined;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDay(day: string): { y: number; m: number; d: number } {
  const match = DAY.exec(day);
  if (!match) throw new RangeError(`Not a calendar day (YYYY-MM-DD): ${day}`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) throw new RangeError(`Not a calendar day (YYYY-MM-DD): ${day}`);
  return { y, m, d };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');
const formatDay = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

/** `day` plus `n` calendar days. */
export function addDays(day: string, n: number): string {
  const { y, m, d } = parseDay(day);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return formatDay(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** `day` plus `n` months, clamped to the last day of the target month. */
export function addMonths(day: string, n: number): string {
  const { y, m, d } = parseDay(day);
  const index = y * 12 + (m - 1) + n;
  const ty = Math.floor(index / 12);
  const tm = (index % 12) + 1;
  return formatDay(ty, tm, Math.min(d, daysInMonth(ty, tm)));
}

/** The day the next run is due after `anchor` (form_template_next_due); null when the cadence has no calendar step or there is no anchor. */
export function nextDue(cadence: string | null | undefined, anchor: string | null | undefined): string | null {
  if (!anchor || !isCadence(cadence)) return null;
  const step = STEPS[cadence];
  if (!step) return null;
  return 'days' in step ? addDays(anchor, step.days) : addMonths(anchor, step.months);
}

/** Overdue from the day after the due day. Days compare as strings (`YYYY-MM-DD`). */
export function isOverdue(due: string | null | undefined, today: string): boolean {
  parseDay(today);
  return !!due && today > due;
}

export interface RunDueInput {
  cadence: string | null | undefined;
  /** The last run's day, if any. */
  lastRunOn: string | null | undefined;
  /** The day the template (any version) was first published, if ever. */
  firstPublishedOn: string | null | undefined;
  today: string;
  hidden?: boolean;
}

/** The run-statistics answer for one template on one vessel (form_template_run_stats). */
export function runDue(input: RunDueInput): { nextDue: string | null; overdue: boolean } {
  if (input.hidden) return { nextDue: null, overdue: false };
  const due = nextDue(input.cadence, input.lastRunOn || input.firstPublishedOn || null);
  return { nextDue: due, overdue: isOverdue(due, input.today) };
}
