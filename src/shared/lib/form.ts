/**
 * Shared form helpers (gap/00 D5): blank → null, date-only strings in LOCAL
 * time, and zod field builders for React Hook Form + `zodResolver`.
 *
 * Dates: a calendar date ("expires on", "joined on") is stored and sent as a
 * `yyyy-MM-dd` string. Never build it with `toISOString().slice(0, 10)`: that
 * is the UTC date, which is the wrong day for anyone east of UTC after
 * midnight local time or west of UTC in the evening (the Health `fixes.test`
 * bug class). These helpers read and build the local calendar day, on top of
 * the one date-only primitive in `@/lib/records/dates`.
 */
import { z } from 'zod';
import { isCalendarDate, toCalendarDate } from '@/lib/records/dates';

// ─── Blank → null ─────────────────────────────────────────────────────────

/**
 * `''`, whitespace-only strings, `undefined` and `null` become `null`; other
 * strings are trimmed; every other value is returned unchanged.
 */
export function blankToNull(value: string): string | null;
export function blankToNull(value: null | undefined): null;
export function blankToNull<T>(value: T): T | null;
export function blankToNull(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  return value;
}

/** `blankToNull` over the string fields of a form payload (non-strings untouched). */
export function blankFieldsToNull<T extends Record<string, unknown>>(values: T): { [K in keyof T]: T[K] extends string ? string | null : T[K] } {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    out[key] = typeof value === 'string' || value === undefined ? blankToNull(value) : value;
  }
  return out as { [K in keyof T]: T[K] extends string ? string | null : T[K] };
}

// ─── Date-only (local) ────────────────────────────────────────────────────

/** True for a real calendar date written `yyyy-MM-dd` (rejects 2026-02-30). Alias of `isCalendarDate`. */
export const isDateOnly: (value: unknown) => value is string = isCalendarDate;

/**
 * The LOCAL calendar day of `date` as `yyyy-MM-dd`, or null for null,
 * undefined or an invalid date (`toCalendarDate` without the throw).
 */
export function toDateOnly(date: Date | null | undefined): string | null {
  return date instanceof Date && !Number.isNaN(date.getTime()) ? toCalendarDate(date) : null;
}

/**
 * A `yyyy-MM-dd` string as a Date at LOCAL midnight of that day (what date
 * pickers expect), or null when the string is blank or not a real date.
 * Accepts a full ISO timestamp too and keeps only its date part as written.
 */
export function fromDateOnly(value: string | null | undefined): Date | null {
  if (typeof value !== 'string') return null;
  const datePart = value.trim().slice(0, 10);
  if (!isCalendarDate(datePart)) return null;
  const [y, m, d] = datePart.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  // Years 0–99 would be mapped to 1900–1999 by the constructor.
  date.setFullYear(y);
  return date;
}

/** Today's LOCAL calendar day as `yyyy-MM-dd`. */
export function todayDateOnly(now: Date = new Date()): string {
  return toDateOnly(now) as string;
}

// ─── zod field helpers ────────────────────────────────────────────────────

const REQUIRED = 'Required';

/** Optional text: blank → null, otherwise trimmed (max length optional). */
export function optionalText(max?: number, message?: string) {
  const base = max ? z.string().max(max, message ?? `Keep it to ${max} characters or fewer`) : z.string();
  return z.preprocess((v) => blankToNull(v), base.nullable());
}

/** Required text: trimmed; blank is an error. */
export function requiredText(message: string = REQUIRED, max?: number) {
  let base = z.string({ required_error: message, invalid_type_error: message }).min(1, message);
  if (max) base = base.max(max, `Keep it to ${max} characters or fewer`);
  return z.preprocess((v) => (typeof v === 'string' ? v.trim() : v === null ? undefined : v), base);
}

const toDateOnlyInput = (v: unknown): unknown => {
  if (v instanceof Date) return toDateOnly(v) ?? 'invalid';
  if (typeof v === 'string') return v.trim();
  return v;
};

/**
 * Required date-only field. Accepts a `yyyy-MM-dd` string or a Date from a
 * picker (converted with the LOCAL day). Output: `yyyy-MM-dd`.
 */
export function dateOnly(message: string = REQUIRED) {
  return z.preprocess(
    (v) => {
      const out = toDateOnlyInput(v);
      return out === '' || out === null ? undefined : out;
    },
    z
      .string({ required_error: message, invalid_type_error: message })
      .refine(isDateOnly, { message: 'Enter a valid date' }),
  );
}

/** Optional date-only field: blank → null; otherwise as `dateOnly()`. */
export function optionalDateOnly() {
  return z.preprocess(
    (v) => blankToNull(toDateOnlyInput(v)),
    z.string().refine(isDateOnly, { message: 'Enter a valid date' }).nullable(),
  );
}

const toNumberInput = (v: unknown): unknown => {
  // React Hook Form's `valueAsNumber` gives NaN for an empty input: that is blank.
  if (typeof v === 'number' && Number.isNaN(v)) return undefined;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return undefined;
    // Number('') is 0 and Number('1e3') is 1000; accept plain digits only.
    return /^[+-]?\d+(\.\d+)?$/.test(t) ? Number(t) : t;
  }
  return v === null ? undefined : v;
};

/** The largest value of a Postgres `integer` (int4) column: the default ceiling. */
export const INT4_MAX = 2147483647;

/** The ceiling actually applied: a whole number ≥ 1 the browser still holds exactly. */
const ceiling = (max: number) => Math.min(Math.max(1, Math.floor(max)), Number.MAX_SAFE_INTEGER);

/**
 * Required whole number from 1 to `max` (default `INT4_MAX`; raise it for a
 * bigint column, up to `Number.MAX_SAFE_INTEGER`). Accepts numbers or numeric
 * strings from inputs; a digit string too long to hold exactly fails the
 * ceiling. Blank (including NaN from `valueAsNumber`) reports `message`.
 */
export function positiveInt(message: string = REQUIRED, max: number = INT4_MAX) {
  const top = ceiling(max);
  return z.preprocess(
    toNumberInput,
    z
      .number({ required_error: message, invalid_type_error: 'Enter a whole number' })
      .int('Enter a whole number')
      .positive('Must be 1 or more')
      .max(top, `Must be ${top} or less`),
  );
}

/** Optional whole number from 1 to `max` (default `INT4_MAX`): blank or NaN → null. */
export function optionalPositiveInt(max: number = INT4_MAX) {
  const top = ceiling(max);
  return z.preprocess(
    (v) => {
      const n = toNumberInput(v);
      return n === undefined ? null : n;
    },
    z
      .number({ invalid_type_error: 'Enter a whole number' })
      .int('Enter a whole number')
      .positive('Must be 1 or more')
      .max(top, `Must be ${top} or less`)
      .nullable(),
  );
}
