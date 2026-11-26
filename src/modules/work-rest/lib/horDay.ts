/**
 * The state of one hours-of-rest day for one crew member on one vessel
 * (gap/04 C38, C45, W6). Pure; the board (X1-08) and the personal month
 * (X1-07B) draw their calendars from it, with the `hor_day` vocabulary of
 * the status registry.
 *
 * Base state, first match wins:
 *   not_expected  the vessel's Hours of Rest is off that day (the `crew` or
 *                 `crew_hor` module off, or the day before its start date,
 *                 C45), the day is outside every assignment to the vessel,
 *                 or the day is still to come
 *   approved      entered, and the month is approved or locked
 *   submitted     entered, and the month is submitted or HoD-signed
 *   entered       a record exists (an all-rest day is an entry)
 *   leave         no entry, and the planner's day code is leave (any code
 *                 but F on board and T travel; entry optional)
 *   not_entered   expected and not entered
 * Overlays on entered days: breach (a non-conformity belongs to the day)
 * and warning (no breach, rest within the warning margin).
 */
import type { ModuleSettingsState } from '@/modules/vessels/lib/moduleSettings';
import { normaliseMonthStatus } from './horMonth';

export type HorDayState = 'not_expected' | 'not_entered' | 'entered' | 'submitted' | 'approved' | 'leave';

export type NotExpectedReason = 'hor_off' | 'before_start' | 'not_assigned' | 'future';

export interface HorAssignmentSpan {
  /** First day aboard (join date, else start date). */
  from: string | null;
  /** Last day aboard, inclusive (leave date, else end date); null while current. */
  to: string | null;
}

/** When Hours of Rest runs on the vessel: off, or on from a date (from null: on with no start date). */
export interface HorStart {
  off: boolean;
  /** Always null while off. */
  from: string | null;
}

export interface HorDayInput {
  /** YYYY-MM-DD */
  date: string;
  /** The vessel's today (YYYY-MM-DD). */
  today: string;
  start: HorStart;
  assignments: readonly HorAssignmentSpan[];
  /** crew_leave_entries.status_code for the day, if any. */
  leaveCode?: string | null;
  hasRecord: boolean;
  /** The status of the person's month on this vessel (null: no month row yet). */
  monthStatus?: string | null;
  /** Overlays from the engine (DaySummary.breach / .warning). */
  breach?: boolean;
  warning?: boolean;
}

export interface HorDay {
  state: HorDayState;
  reason: NotExpectedReason | null;
  breach: boolean;
  warning: boolean;
}

/** Codes that are not leave: on board (F) and travel day (T); an empty code is no code. */
export function isLeaveCode(code: string | null | undefined): boolean {
  const c = (code ?? '').trim().toUpperCase();
  return c.length > 0 && c !== 'F' && c !== 'T';
}

/** Whether an assignment covers the day (both ends inclusive; an open end runs on). */
export function assignmentCovers(span: HorAssignmentSpan, date: string): boolean {
  if (span.from && date < span.from.slice(0, 10)) return false;
  if (span.to && date > span.to.slice(0, 10)) return false;
  return Boolean(span.from || span.to);
}

const OFF: HorStart = { off: true, from: null };

/**
 * When Hours of Rest runs on a vessel, from its module settings: off while
 * the settings load or failed (fail closed), off when `crew` or `crew_hor`
 * is switched off, else on from the later of their start dates (null when
 * neither has one). A missing table means on with no start (D-01, D-63).
 */
export function horStartFrom(state: ModuleSettingsState): HorStart {
  if (state.status !== 'ready') return OFF;
  let from: string | null = null;
  for (const key of ['crew', 'crew_hor']) {
    const s = state.settings.get(key);
    if (!s) continue;
    if (!s.enabled) return OFF;
    const d = s.enabledFrom && /^\d{4}-\d{2}-\d{2}/.test(s.enabledFrom) ? s.enabledFrom.slice(0, 10) : null;
    if (d && (from === null || d > from)) from = d;
  }
  return { off: false, from };
}

/** Why a day is not expected, or null when it is. */
export function notExpectedReason(input: Pick<HorDayInput, 'date' | 'today' | 'start' | 'assignments'>): NotExpectedReason | null {
  const start = input.start;
  if (start.off) return 'hor_off';
  if (start.from && input.date < start.from) return 'before_start';
  if (input.date > input.today) return 'future';
  if (!input.assignments.some((a) => assignmentCovers(a, input.date))) return 'not_assigned';
  return null;
}

export function horDayState(input: HorDayInput): HorDay {
  const reason = notExpectedReason(input);
  if (reason) return { state: 'not_expected', reason, breach: false, warning: false };
  if (input.hasRecord) {
    const month = normaliseMonthStatus(input.monthStatus ?? 'draft');
    const state: HorDayState =
      month === 'approved' || month === 'locked' ? 'approved' : month === 'submitted' || month === 'hod_signed' ? 'submitted' : 'entered';
    const breach = Boolean(input.breach);
    return { state, reason: null, breach, warning: !breach && Boolean(input.warning) };
  }
  if (isLeaveCode(input.leaveCode)) return { state: 'leave', reason: null, breach: false, warning: false };
  return { state: 'not_entered', reason: null, breach: false, warning: false };
}

/** Every day of a month, YYYY-MM-DD. */
export function monthDays(year: number, month: number): string[] {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return Array.from({ length: last }, (_, i) => `${year}-${mm}-${String(i + 1).padStart(2, '0')}`);
}

/** Expected days without an entry (the month's "not entered" count). */
export function missingDays(days: readonly HorDay[]): number {
  return days.filter((d) => d.state === 'not_entered').length;
}
