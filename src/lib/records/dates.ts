/**
 * Calendar-day arithmetic for the record engines.
 *
 * Dates here are `yyyy-MM-dd` strings (or a Date, read as its LOCAL calendar
 * day). Day differences are computed on the calendar numbers through UTC, so
 * daylight-saving changes and the machine's time zone never move a day.
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

/** `yyyy-MM-dd` for a Date's LOCAL calendar day, or the string itself (date part of an ISO timestamp). */
export function toCalendarDate(input: DateInput): string {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new RangeError('Invalid date');
    const y = String(input.getFullYear()).padStart(4, '0');
    const m = String(input.getMonth() + 1).padStart(2, '0');
    const d = String(input.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
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
