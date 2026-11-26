/**
 * Endorsement state (gap/06 C5; gap/02 R3, W9 "endorsements overdue"): the
 * TS mirror of SQL `expiry_endorsement_state(p_due_on, p_today,
 * p_window_days DEFAULT 30)` in `20261124040000_fleet_expiry_engine.sql`.
 *
 *   overdue  the due date has passed
 *   due      from `windowDays` (default 30) before the due date through the
 *            due date itself (valid through the date, as expiry is, D-31)
 *   null     no due date, or the due date is further away
 *
 * A negative or fractional window is refused (SQL raises 22023
 * invalid_window).
 */
import { daysBetween, toCalendarDate, type DateInput } from '@/lib/records/dates';

export const ENDORSEMENT_STATES = ['overdue', 'due'] as const;
export type EndorsementState = (typeof ENDORSEMENT_STATES)[number];

/** The default endorsement window (days before the due date). */
export const DEFAULT_ENDORSEMENT_WINDOW_DAYS = 30;

/** UI labels (gap/06 C3 tile names). */
export const ENDORSEMENT_STATE_LABELS: Readonly<Record<EndorsementState, string>> = {
  overdue: 'Endorsement overdue',
  due: 'Endorsement due',
};

export interface EndorsementInput {
  /** `yyyy-MM-dd` (or a Date, read as its local day). Null or blank = no endorsement due. */
  dueOn: DateInput | null | undefined;
  /** Today's date, passed in so the result is reproducible. */
  today: DateInput;
  /** Days before the due date that count as due; null or undefined = 30. */
  windowDays?: number | null;
}

function normaliseWindow(windowDays: number | null | undefined): number {
  if (windowDays === null || windowDays === undefined) return DEFAULT_ENDORSEMENT_WINDOW_DAYS;
  if (!Number.isInteger(windowDays) || windowDays < 0) {
    throw new RangeError(`windowDays must be a whole number of days ≥ 0, got ${windowDays}`);
  }
  return windowDays;
}

const isBlank = (v: DateInput | null | undefined) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

export function endorsementState(input: EndorsementInput): EndorsementState | null {
  const windowDays = normaliseWindow(input.windowDays);
  if (isBlank(input.dueOn)) return null;
  const days = daysBetween(toCalendarDate(input.today), toCalendarDate(input.dueOn as DateInput));
  if (days < 0) return 'overdue';
  if (days <= windowDays) return 'due';
  return null;
}

export function isEndorsementState(value: unknown): value is EndorsementState {
  return typeof value === 'string' && (ENDORSEMENT_STATES as readonly string[]).includes(value);
}
