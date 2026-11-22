/**
 * Calendar-day arithmetic for the record engines.
 *
 * Dates here are `yyyy-MM-dd` strings (or a Date, read as its LOCAL calendar
 * day). Day differences are computed on the calendar numbers through UTC, so
 * daylight-saving changes and the machine's time zone never move a day.
 *
 * Two ways to turn input into a calendar day:
 *
 * - `toCalendarDate` is for date columns (`expires_on`, a record's numbering
 *   date). A string keeps its own first ten characters, so a stored date
 *   never moves with the viewer's time zone. Do not feed it a `timestamptz`
 *   when you mean "the day it happened here": it would give the UTC day.
 * - `localCalendarDate` is for instants (`moved_at`, `created_at`). A
 *   timestamp string is read as an instant and becomes the viewer's LOCAL
 *   day, the same basis as `new Date()`, so "days since" ages agree with the
 *   clock on the wall.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export type DateInput = string | Date;

/** True for a real calendar date written `yyyy-MM-dd`. */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DATE_ONLY.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

function localDay(input: Date): string {
  if (Number.isNaN(input.getTime())) throw new RangeError('Invalid date');
  const y = String(input.getFullYear()).padStart(4, '0');
  const m = String(input.getMonth() + 1).padStart(2, '0');
  const d = String(input.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * `yyyy-MM-dd` for a Date's LOCAL calendar day, or the first ten characters
 * of a string (a date column, or the UTC date part of an ISO timestamp). For
 * the local day of a timestamp use `localCalendarDate`.
 */
export function toCalendarDate(input: DateInput): string {
  if (input instanceof Date) return localDay(input);
  const datePart = String(input).trim().slice(0, 10);
  if (!isCalendarDate(datePart)) throw new RangeError(`Not a calendar date: ${String(input)}`);
  return datePart;
}

/** Days since 1970-01-01 for a calendar date. */
export function dayNumber(input: DateInput): number {
  const [y, m, d] = toCalendarDate(input).split('-').map(Number);
  const utc = new Date(0);
  utc.setUTCFullYear(y, m - 1, d);
  return Math.round(utc.getTime() / 86_400_000);
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: DateInput, to: DateInput): number {
  return dayNumber(to) - dayNumber(from);
}

/** Milliseconds for an ISO timestamp; throws on garbage so ordering bugs surface. */
export function instant(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new RangeError(`Not a timestamp: ${iso}`);
  return t;
}

/**
 * The viewer's LOCAL calendar day of an instant, as `yyyy-MM-dd`. A pure
 * `yyyy-MM-dd` string is already a calendar day and passes through; any other
 * string is parsed as a timestamp (throws on garbage or an impossible
 * `yyyy-MM-dd`), and a Date gives its local day. Use it when an age is measured against `new Date()`.
 */
export function localCalendarDate(input: DateInput): string {
  if (input instanceof Date) return localDay(input);
  const text = String(input).trim();
  if (isCalendarDate(text)) return text;
  // Date.parse rolls "2026-02-30" over to 2 March; a date-shaped string must be a real day.
  if (DATE_ONLY.test(text)) throw new RangeError(`Not a calendar date: ${text}`);
  return localDay(new Date(instant(text)));
}
