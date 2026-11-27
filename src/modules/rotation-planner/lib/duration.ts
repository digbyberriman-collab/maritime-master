/**
 * Planner durations and date-only arithmetic (gap/04 C47 "5w 6d", T-27).
 *
 * Dates are date-only strings (`yyyy-MM-dd`, the crew's local calendar
 * day, as the database stores them). Arithmetic runs on the calendar day
 * (UTC midnight of the string), so a daylight-saving change never adds or
 * loses a day. A period's length counts both its first and its last day.
 *
 * Pure: no imports, so the SQL test can load it.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** True for a real calendar date written yyyy-MM-dd. */
export function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DATE_ONLY.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function toUtc(date: string): number {
  if (!isDateOnly(date)) throw new RangeError(`Not a date: ${date}`);
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  const t = new Date(ms);
  const y = String(t.getUTCFullYear()).padStart(4, '0');
  const m = String(t.getUTCMonth() + 1).padStart(2, '0');
  const d = String(t.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The date n days after (or before, for a negative n) a date. */
export function addDays(date: string, n: number): string {
  if (!Number.isInteger(n)) throw new RangeError('Days must be a whole number.');
  return fromUtc(toUtc(date) + n * DAY_MS);
}

/** Whole days from a to b (b - a): 0 for the same day, negative when b is earlier. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

/** Days in a period, counting its first and last day (1 for a one-day period); 0 when the end is before the start. */
export function daysInclusive(start: string, end: string): number {
  const n = daysBetween(start, end) + 1;
  return n > 0 ? n : 0;
}

/** -1, 0 or 1 as dates a and b compare. */
export function compareDates(a: string, b: string): number {
  const d = toUtc(a) - toUtc(b);
  return d < 0 ? -1 : d > 0 ? 1 : 0;
}

/** The later and earlier of two dates. */
export const maxDate = (a: string, b: string): string => (compareDates(a, b) >= 0 ? a : b);
export const minDate = (a: string, b: string): string => (compareDates(a, b) <= 0 ? a : b);

/** Today in the browser's local calendar, yyyy-MM-dd (date-only strings are local, never UTC). */
export function localToday(now: Date = new Date()): string {
  const y = String(now.getFullYear()).padStart(4, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * A number of days in weeks and days, the planner's bar format (T-27):
 * 41 -> "5w 6d", 14 -> "2w", 6 -> "6d", 0 -> "0d". Negative or fractional
 * input is refused.
 */
export function formatWeeksDays(days: number): string {
  if (!Number.isInteger(days) || days < 0) throw new RangeError('Days must be a whole number, zero or more.');
  const w = Math.floor(days / 7);
  const d = days % 7;
  if (w === 0) return `${d}d`;
  return d === 0 ? `${w}w` : `${w}w ${d}d`;
}

/**
 * Reads "5w 6d", "5w", "6d", "5 w 6 d" (any case, either order once each)
 * or a bare number of days back into days; null for anything else.
 */
export function parseWeeksDays(text: string | null | undefined): number | null {
  const s = (text ?? '').trim().toLowerCase();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const m = /^(?:(\d+)\s*w)?\s*(?:(\d+)\s*d)?$/.exec(s);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  return Number(m[1] ?? 0) * 7 + Number(m[2] ?? 0);
}

/** A period's duration label: "5w 6d", or "End unknown" for an open period. */
export function periodDurationLabel(period: { start: string; end: string | null; endUnknown?: boolean }): string {
  if (period.endUnknown || period.end === null) return 'End unknown';
  return formatWeeksDays(daysInclusive(period.start, period.end));
}

/** The planner bar label: the type and the duration ("Rotation leave · 5w 6d"). */
export function periodBarLabel(typeLabel: string, period: { start: string; end: string | null; endUnknown?: boolean }): string {
  return `${typeLabel} · ${periodDurationLabel(period)}`;
}
