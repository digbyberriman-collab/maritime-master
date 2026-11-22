/**
 * Shared form helpers (gap/00 D5): blank → null, date-only strings in LOCAL
 * time, and zod field builders for React Hook Form + `zodResolver`.
 *
 * Dates: a calendar date ("expires on", "joined on") is stored and sent as a
 * `yyyy-MM-dd` string. Never build it with `toISOString().slice(0, 10)`: that
 * is the UTC date, which is the wrong day for anyone east of UTC after
 * midnight local time or west of UTC in the evening (the Health `fixes.test`
 * bug class). These helpers read and build the local calendar day.
 */
import { z } from 'zod';

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

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** True for a real calendar date written `yyyy-MM-dd` (rejects 2026-02-30). */
export function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DATE_ONLY.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  // Day 0 of the next month is the last day of this one; UTC avoids DST.
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= lastDay;
}

/**
 * The LOCAL calendar day of `date` as `yyyy-MM-dd`, or null for null,
 * undefined or an invalid date.
 */
export function toDateOnly(date: Date | null | undefined): string | null {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * A `yyyy-MM-dd` string as a Date at LOCAL midnight of that day (what date
 * pickers expect), or null when the string is blank or not a real date.
 * Accepts a full ISO timestamp too and keeps only its date part as written.
 */
export function fromDateOnly(value: string | null | undefined): Date | null {
  if (typeof value !== 'string') return null;
  const datePart = value.trim().slice(0, 10);
  if (!isDateOnly(datePart)) return null;
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
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return undefined;
    // Number('') is 0 and Number('1e3') is 1000; accept plain digits only.
    return /^[+-]?\d+(\.\d+)?$/.test(t) ? Number(t) : t;
  }
  return v === null ? undefined : v;
};

/** Required whole number ≥ 1. Accepts numbers or numeric strings from inputs. */
export function positiveInt(message: string = REQUIRED) {
  return z.preprocess(
    toNumberInput,
    z
      .number({ required_error: message, invalid_type_error: 'Enter a whole number' })
      .int('Enter a whole number')
      .positive('Must be 1 or more'),
  );
}

/** Optional whole number ≥ 1: blank → null. */
export function optionalPositiveInt() {
  return z.preprocess(
    (v) => {
      const n = toNumberInput(v);
      return n === undefined ? null : n;
    },
    z.number({ invalid_type_error: 'Enter a whole number' }).int('Enter a whole number').positive('Must be 1 or more').nullable(),
  );
}
