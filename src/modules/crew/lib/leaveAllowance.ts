/**
 * Leave allowance and balance from a person's employment terms (gap/04
 * C55; X1-09B). The terms (crew_assignment_terms, X1-03) carry the
 * allowance as days per year, a ratio of days on to days off, or none.
 * This file turns that into a balance for the profile's Leave balance card.
 * When the terms name no allowance, the card falls back to the vessel's
 * leave policy through the leave calculator (crew/services/leaveCalculator,
 * unchanged); see `allowanceFromTerms`.
 *
 * The two methods count differently:
 *
 * - Days per year accrue with time: the allowance spread over the calendar
 *   year, from the later of 1 January and the terms' start, up to today
 *   (or the terms' end). A day of a type that deducts uses one day
 *   (holiday; medical, crew development and unpaid when the vessel's
 *   policy says so). Rotation leave, travel and the neutral types use
 *   nothing.
 * - A ratio is time for time: every `on` days on board (On board, Sick on
 *   board, PBQ) earn `off` days off, and a day of rotation leave or of a
 *   type that deducts uses one. (gap/04 open question 4 asks which way
 *   rotation leave counts; this is the proposed answer for rotational
 *   terms. Ratio accrual inside the leave calculator and payroll is wave 2.)
 *
 * Both count the current calendar year, as the leave calculator and payroll
 * do (no carry-over on the terms path in wave 1). Days come from the day
 * codes (crew_leave_entries), which the period store writes for every
 * confirmed period (X1-09): a past code is taken, a future code is booked.
 * Pending requests are counted apart and never deducted.
 *
 * Pure: it imports only the planner's pure libraries (duration, leave
 * types); date-only strings throughout.
 */
import { compareDates, daysInclusive, isDateOnly, maxDate, minDate } from '@/modules/rotation-planner/lib/duration';
import {
  LEAVE_TYPES,
  leaveTypeByKey,
  leaveTypeForDayCode,
  resolveBalanceEffect,
  type LeaveBalancePolicy,
  type LeaveType,
} from '@/modules/rotation-planner/lib/leaveTypes';

export const LEAVE_METHODS = ['days_per_year', 'ratio', 'none'] as const;
export type LeaveMethod = (typeof LEAVE_METHODS)[number];

/** The allowance columns of crew_assignment_terms the card reads. */
export interface TermsAllowanceInput {
  leave_method: string | null;
  /** numeric(5,2): PostgREST may answer a number or a numeric string. */
  leave_days_per_year: number | string | null;
  leave_ratio_on: number | null;
  leave_ratio_off: number | null;
  start_date: string | null;
  end_date?: string | null;
}

/** Where the allowance comes from. */
export type LeaveAllowance =
  | { kind: 'days_per_year'; daysPerYear: number }
  | { kind: 'ratio'; on: number; off: number }
  | { kind: 'none' }
  /** The terms name no usable allowance (none recorded, or no terms): the vessel's leave policy decides. */
  | { kind: 'policy'; reason: 'no_terms' | 'no_method' | 'invalid' };

const toNumber = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const isPositiveInt = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;

/**
 * The allowance the terms give, mirroring the terms' CHECK: days per year
 * between 0 and 365, a ratio of two whole numbers above zero, or none.
 * Anything else (no terms, no method, a value outside the CHECK) falls back
 * to the vessel's leave policy, and says why.
 */
export function allowanceFromTerms(terms: TermsAllowanceInput | null | undefined): LeaveAllowance {
  if (!terms) return { kind: 'policy', reason: 'no_terms' };
  switch (terms.leave_method) {
    case 'days_per_year': {
      const days = toNumber(terms.leave_days_per_year);
      if (days === null || days < 0 || days > 365) return { kind: 'policy', reason: 'invalid' };
      return { kind: 'days_per_year', daysPerYear: days };
    }
    case 'ratio':
      if (!isPositiveInt(terms.leave_ratio_on) || !isPositiveInt(terms.leave_ratio_off)) return { kind: 'policy', reason: 'invalid' };
      return { kind: 'ratio', on: terms.leave_ratio_on, off: terms.leave_ratio_off };
    case 'none':
      return { kind: 'none' };
    case null:
    case undefined:
    case '':
      return { kind: 'policy', reason: 'no_method' };
    default:
      return { kind: 'policy', reason: 'invalid' };
  }
}

/** Rounds to two decimals (half away from zero, so 1.005 is 1.01 despite binary floats), never -0. */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-7)) / 100;
  return r === 0 ? 0 : r;
}

/** The days off a ratio gives over a whole year: the off share of 365 days (1:1 is 182.5). */
export function ratioDaysPerYear(on: number, off: number): number {
  if (!isPositiveInt(on) || !isPositiveInt(off)) throw new RangeError('A ratio needs two whole numbers above zero.');
  return round2((365 * off) / (on + off));
}

/** The days off earned by days on board under a ratio (2:1 earns one day off per two on board). */
export function ratioEarned(onBoardDays: number, on: number, off: number): number {
  if (!isPositiveInt(on) || !isPositiveInt(off)) throw new RangeError('A ratio needs two whole numbers above zero.');
  if (!Number.isInteger(onBoardDays) || onBoardDays < 0) throw new RangeError('Days on board must be a whole number, zero or more.');
  return round2((onBoardDays * off) / on);
}

/** "2.50" a month for 30 days a year (the Add crew hint, gap/04 W1). */
export const monthlyFromYearly = (daysPerYear: number): number => round2(daysPerYear / 12);

/** What a day does to a balance under a method. */
export type DayEffect = 'earn' | 'use' | 'neutral';

/**
 * The effect of one day of a leave type under a method and the vessel's
 * policy flags:
 * - days per year: a type that deducts (resolveBalanceEffect) uses a day;
 *   everything else is neutral (the allowance accrues with time, not with
 *   days on board).
 * - ratio: a type that counts on board, or accrues (On board, Sick on board,
 *   PBQ), earns; rotation leave and a type that deducts use; the rest
 *   (travel, emergency, compassionate, paid parental, neutral, other) are
 *   neutral.
 */
export function dayEffectOfType(type: Pick<LeaveType, 'key' | 'balanceEffect' | 'policyFlag' | 'countsOnBoard'>, method: 'days_per_year' | 'ratio', policy: LeaveBalancePolicy): DayEffect {
  const effect = resolveBalanceEffect(type, policy);
  if (method === 'days_per_year') return effect === 'deducts' ? 'use' : 'neutral';
  if (type.countsOnBoard || effect === 'accrues') return 'earn';
  if (type.key === 'rotation' || effect === 'deducts') return 'use';
  return 'neutral';
}

/** The effect of a day code (F reads On board; an unknown code is neutral). */
export function dayEffectOfCode(code: string, method: 'days_per_year' | 'ratio', policy: LeaveBalancePolicy, types: readonly LeaveType[] = LEAVE_TYPES): DayEffect {
  const type = leaveTypeForDayCode(code, types);
  return type ? dayEffectOfType(type, method, policy) : 'neutral';
}

/** One day code of the person (crew_leave_entries). */
export interface DayCodeEntry {
  date: string;
  code: string;
}

/** One period of a pending leave request (crew_leave_request_periods, or a legacy request's own range). */
export interface PendingPeriod {
  leaveTypeKey: string;
  start: string;
  /** null: end unknown. */
  end: string | null;
}

export interface TermsBalanceInput {
  allowance: Extract<LeaveAllowance, { kind: 'days_per_year' | 'ratio' }>;
  /** The terms' start and end (the allowance applies between them). */
  termsStart: string | null;
  termsEnd: string | null;
  entries: readonly DayCodeEntry[];
  pending: readonly PendingPeriod[];
  /** Today, date-only (local). */
  today: string;
  policy: LeaveBalancePolicy;
  types?: readonly LeaveType[];
}

export interface TermsBalance {
  method: 'days_per_year' | 'ratio';
  /** The counted span: 1 January (or the terms' start) to 31 December (or the terms' end). */
  from: string;
  to: string;
  /** Days earned up to today. */
  accrued: number;
  /** Days used up to today. */
  taken: number;
  /** Days booked after today (confirmed periods' day codes). */
  booked: number;
  /** Days of pending requests that would use the balance (not deducted). */
  pending: number;
  /** A pending period has no end: counted to the end of the year. */
  pendingOpenEnded: boolean;
  /** accrued - taken - booked. */
  remaining: number;
  /** Ratio: the days on board up to today that earned time off. */
  onBoardDays: number;
  /** The whole year's allowance at this rate (days per year, or the ratio's share of the year). */
  yearAllowance: number;
  /** The terms ended before this year or start after it: nothing is counted. */
  outsideTerms: boolean;
}

/** The calendar year of a date-only string: its first and last day. */
export function calendarYear(day: string): { start: string; end: string } {
  if (!isDateOnly(day)) throw new RangeError(`Not a date: ${day}`);
  const y = day.slice(0, 4);
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

const inRange = (day: string, from: string, to: string): boolean => compareDates(day, from) >= 0 && compareDates(day, to) <= 0;

/**
 * The balance of the current calendar year on the terms' allowance. Day
 * codes outside the year or the terms are ignored; a date written twice
 * counts once (the last entry wins).
 */
export function termsBalance(input: TermsBalanceInput): TermsBalance {
  const { allowance, today, policy } = input;
  const types = input.types ?? LEAVE_TYPES;
  if (!isDateOnly(today)) throw new RangeError(`Not a date: ${today}`);
  const year = calendarYear(today);
  const from = input.termsStart && isDateOnly(input.termsStart) ? maxDate(year.start, input.termsStart) : year.start;
  const to = input.termsEnd && isDateOnly(input.termsEnd) ? minDate(year.end, input.termsEnd) : year.end;
  const method = allowance.kind;
  const yearAllowance = method === 'days_per_year' ? round2(allowance.daysPerYear) : ratioDaysPerYear(allowance.on, allowance.off);
  const outsideTerms = compareDates(to, from) < 0;
  const empty: TermsBalance = {
    method,
    from,
    to,
    accrued: 0,
    taken: 0,
    booked: 0,
    pending: 0,
    pendingOpenEnded: false,
    remaining: 0,
    onBoardDays: 0,
    yearAllowance,
    outsideTerms,
  };
  if (outsideTerms) return empty;

  const byDate = new Map<string, string>();
  for (const e of input.entries) {
    if (!isDateOnly(e.date) || !inRange(e.date, from, to)) continue;
    byDate.set(e.date, e.code);
  }

  let taken = 0;
  let booked = 0;
  let onBoardDays = 0;
  for (const [date, code] of byDate) {
    const effect = dayEffectOfCode(code, method, policy, types);
    const past = compareDates(date, today) <= 0;
    if (effect === 'use') {
      if (past) taken += 1;
      else booked += 1;
    } else if (effect === 'earn' && past) {
      onBoardDays += 1;
    }
  }

  let accrued = 0;
  if (method === 'days_per_year') {
    const elapsedTo = minDate(today, to);
    const elapsed = compareDates(elapsedTo, from) < 0 ? 0 : daysInclusive(from, elapsedTo);
    accrued = round2((allowance.daysPerYear * elapsed) / daysInclusive(year.start, year.end));
  } else {
    accrued = ratioEarned(onBoardDays, allowance.on, allowance.off);
  }

  let pending = 0;
  let pendingOpenEnded = false;
  for (const p of input.pending) {
    const type = leaveTypeByKey(p.leaveTypeKey, types);
    if (!type || dayEffectOfType(type, method, policy) !== 'use' || !isDateOnly(p.start)) continue;
    if (p.end === null) pendingOpenEnded = true;
    const pEnd = p.end !== null && isDateOnly(p.end) ? p.end : to;
    const s = maxDate(p.start, from);
    const e = minDate(pEnd, to);
    if (compareDates(e, s) < 0) continue;
    pending += daysInclusive(s, e);
  }

  return {
    method,
    from,
    to,
    accrued,
    taken,
    booked,
    pending,
    pendingOpenEnded,
    remaining: round2(accrued - taken - booked),
    onBoardDays,
    yearAllowance,
    outsideTerms,
  };
}

/** A number of days as the card says it: "12.5 days", "1 day", "0 days", "-3 days". */
export function daysText(n: number): string {
  const r = round2(n);
  const shown = Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, '');
  return `${shown} ${Math.abs(r) === 1 ? 'day' : 'days'}`;
}

/** The allowance in words, with where it comes from (the card names its source). */
export function allowanceSourceText(allowance: LeaveAllowance): string {
  switch (allowance.kind) {
    case 'days_per_year':
      return `Employment terms: ${daysText(allowance.daysPerYear)} a year (${monthlyFromYearly(allowance.daysPerYear).toFixed(2)} a month)`;
    case 'ratio':
      return `Employment terms: ${allowance.on}:${allowance.off} on/off rotation, time for time`;
    case 'none':
      return 'Employment terms: no leave allowance';
    case 'policy':
      return allowance.reason === 'invalid'
        ? "The employment terms' allowance could not be read, so the vessel's leave policy applies"
        : "The vessel's leave policy (the employment terms name no allowance)";
  }
}
