// Leave accrual calculator.
//
// Calculates entitlement / accrued / taken / booked / remaining from
// real data (employment dates, leave entries, approved-but-future
// requests) and a configurable LeavePolicy.
//
// Pure / deterministic — testable without Supabase access.

import {
  differenceInCalendarDays,
  endOfMonth,
  isAfter,
  isBefore,
  isWithinInterval,
  max as maxDate,
  min as minDate,
  parseISO,
  startOfMonth,
} from 'date-fns';

export interface LeavePolicy {
  annual_entitlement_days: number;
  accrual_method: 'monthly' | 'daily' | 'contract' | 'rotation';
  rounding_step: number; // 0 = none, 0.5 = half-day, 1 = full-day
  booked_deducts_available: boolean;
  sick_affects_balance: boolean;
  training_affects_balance: boolean;
  unpaid_affects_balance: boolean;
  prorate_partial_months: boolean;
}

export const DEFAULT_LEAVE_POLICY: LeavePolicy = {
  annual_entitlement_days: 28,
  accrual_method: 'monthly',
  rounding_step: 0,
  booked_deducts_available: true,
  sick_affects_balance: false,
  training_affects_balance: false,
  unpaid_affects_balance: false,
  prorate_partial_months: true,
};

export interface CalculatorInput {
  /** Date to calculate "as of"; usually today. */
  asOf: Date;

  /** Earliest day the calculator should accrue from. */
  employmentStart: Date | null;
  /** Optional contract start that overrides employment start for accrual. */
  contractStart?: Date | null;
  /** Date crew leave or contract ended (caps accrual). */
  employmentEnd?: Date | null;
  contractEnd?: Date | null;

  /** Carry-over balance (days) brought into the accrual year. */
  carryoverDays: number;

  /** Calendar leave entries (one row per day, status_code) for the YTD year. */
  entries: { date: string; status_code: string }[];

  /** Approved leave requests that fall partly or wholly in the future. */
  bookedRequests: { start_date: string; end_date: string; status: string; leave_type: string }[];

  policy: LeavePolicy;

  /** Year being calculated (e.g. 2026). */
  year: number;
}

export interface CalculatorResult {
  entitlement: number;     // pro-rated annual entitlement based on dates
  accrued: number;         // days earned by asOf
  taken: number;           // L (and other affecting codes) used YTD
  booked: number;          // future approved-but-not-yet-taken leave days
  available: number;       // accrued + carryover − taken (− booked if policy)
  remaining: number;       // entitlement + carryover − taken − booked
  carryover: number;
  monthly_accrual: number;
  notes: string[];         // human-readable annotations
  next_leave_start?: string;
  next_leave_end?: string;
}

const DAY_MS = 86400000;

function toDate(d: string | Date): Date {
  return typeof d === 'string' ? parseISO(d) : d;
}

function round(value: number, step: number): number {
  if (step <= 0) return Math.round(value * 100) / 100; // 2dp default
  return Math.round(value / step) * step;
}

/**
 * Days an employee was actively employed within [from, to].
 * Handles mid-month joiners and leavers.
 */
function activeDaysWithin(
  start: Date | null,
  end: Date | null,
  from: Date,
  to: Date
): number {
  if (!start) return 0;
  const s = maxDate([start, from]);
  const cap = end ? minDate([end, to]) : to;
  if (!isAfter(cap, s) && +s !== +cap) return 0;
  return Math.max(0, differenceInCalendarDays(cap, s) + 1);
}

/**
 * Pro-rata entitlement for the calendar year:
 *   entitlement * (active_days_in_year / days_in_year)
 */
export function calculateEntitlement(input: CalculatorInput): number {
  const yearStart = new Date(input.year, 0, 1);
  const yearEnd = new Date(input.year, 11, 31);
  const start = input.contractStart ?? input.employmentStart;
  const end = input.contractEnd ?? input.employmentEnd ?? null;
  if (!start) return input.policy.annual_entitlement_days;

  if (!input.policy.prorate_partial_months) {
    return input.policy.annual_entitlement_days;
  }

  const activeDays = activeDaysWithin(start, end, yearStart, yearEnd);
  const yearDays = 365 + (input.year % 4 === 0 && (input.year % 100 !== 0 || input.year % 400 === 0) ? 1 : 0);
  const ent = (input.policy.annual_entitlement_days * activeDays) / yearDays;
  return round(ent, input.policy.rounding_step);
}

/**
 * Days accrued by asOf:
 *   monthly: entitlement * (months_active / 12), partial month pro-rated
 *   daily:   entitlement * (active_days_through_asOf / year_days)
 *   contract: full annual entitlement once contract starts
 *   rotation: same as daily for now (rotation-specific maths handled by
 *             external rotation engine; this is a safe fallback)
 */
export function calculateAccrued(input: CalculatorInput): number {
  const yearStart = new Date(input.year, 0, 1);
  const start = input.contractStart ?? input.employmentStart;
  const end = input.contractEnd ?? input.employmentEnd ?? null;
  if (!start) return 0;

  const cap = end ? minDate([end, input.asOf]) : input.asOf;
  if (!isAfter(cap, yearStart) && +cap !== +yearStart) return 0;

  const policy = input.policy;
  const ent = policy.annual_entitlement_days;

  if (policy.accrual_method === 'contract') {
    // Full entitlement once contract starts in the year
    return start <= cap ? ent : 0;
  }

  if (policy.accrual_method === 'monthly') {
    const monthly = ent / 12;
    let total = 0;
    for (let m = 0; m < 12; m++) {
      const monthStart = startOfMonth(new Date(input.year, m, 1));
      const monthEnd = endOfMonth(monthStart);
      const active = activeDaysWithin(start, end, monthStart, minDate([monthEnd, input.asOf]));
      const monthLen = differenceInCalendarDays(monthEnd, monthStart) + 1;
      if (active === 0) continue;
      if (policy.prorate_partial_months) {
        total += monthly * (active / monthLen);
      } else if (active === monthLen) {
        total += monthly;
      }
      if (monthEnd > input.asOf) break;
    }
    return round(total, policy.rounding_step);
  }

  // daily / rotation fallback
  const yearDays = 365 + (input.year % 4 === 0 && (input.year % 100 !== 0 || input.year % 400 === 0) ? 1 : 0);
  const active = activeDaysWithin(start, end, yearStart, cap);
  const accrued = (ent * active) / yearDays;
  return round(accrued, policy.rounding_step);
}

/**
 * Categorise a status code into the buckets the policy cares about.
 */
function entryAffectsBalance(code: string, policy: LeavePolicy): boolean {
  // Primary deduction code is 'L' (Leave Used). Other categories may or
  // may not deduct depending on policy.
  if (code === 'L') return true;
  if (code === 'M' && policy.sick_affects_balance) return true;
  if (code === 'CD' && policy.training_affects_balance) return true;
  if (code === 'U' && policy.unpaid_affects_balance) return true;
  // T/F/Q/R/PPL/CL/N do not deduct in any case
  return false;
}

export function calculateLeave(input: CalculatorInput): CalculatorResult {
  const notes: string[] = [];
  const policy = input.policy;

  const entitlement = calculateEntitlement(input);
  const accrued = calculateAccrued(input);
  const monthly_accrual = policy.annual_entitlement_days / 12;

  // Taken: deducting entries in the YTD up to asOf
  let taken = 0;
  for (const e of input.entries) {
    const d = toDate(e.date);
    if (d > input.asOf) continue;
    if (entryAffectsBalance(e.status_code, policy)) taken += 1;
  }
  taken = round(taken, policy.rounding_step);

  // Booked: approved/hod_reviewed/requested-but-future leave
  let booked = 0;
  for (const r of input.bookedRequests) {
    if (!['approved', 'hod_reviewed', 'requested', 'pending'].includes(r.status)) continue;
    if (!entryAffectsBalance(r.leave_type, policy)) continue;
    const start = toDate(r.start_date);
    const end = toDate(r.end_date);
    // Count only days strictly after asOf so we don't double-count taken.
    const effectiveStart = maxDate([start, new Date(input.asOf.getTime() + DAY_MS)]);
    if (isAfter(effectiveStart, end)) continue;
    booked += differenceInCalendarDays(end, effectiveStart) + 1;
  }
  booked = round(booked, policy.rounding_step);

  const carryover = round(input.carryoverDays || 0, policy.rounding_step);

  const available = round(
    accrued + carryover - taken - (policy.booked_deducts_available ? booked : 0),
    policy.rounding_step
  );
  const remaining = round(entitlement + carryover - taken - booked, policy.rounding_step);

  if (remaining < 0) notes.push('Negative remaining balance — review allocations.');
  if (accrued < taken) notes.push('Taken exceeds accrued — running ahead of accrual.');

  // Next leave dates from booked requests
  const futureRequests = [...input.bookedRequests]
    .filter((r) => ['approved', 'hod_reviewed'].includes(r.status))
    .map((r) => ({ start: toDate(r.start_date), end: toDate(r.end_date) }))
    .filter((r) => isAfter(r.end, input.asOf))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const next = futureRequests[0];

  return {
    entitlement,
    accrued,
    taken,
    booked,
    available,
    remaining,
    carryover,
    monthly_accrual: round(monthly_accrual, policy.rounding_step),
    notes,
    next_leave_start: next?.start.toISOString().slice(0, 10),
    next_leave_end: next?.end.toISOString().slice(0, 10),
  };
}

/**
 * Detect overlapping approved leave requests for a single crew member.
 * Returns the IDs of any conflicting pairs.
 */
export function detectOverlaps(
  requests: Array<{ id: string; start_date: string; end_date: string; status: string }>
): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const active = requests.filter((r) =>
    ['approved', 'hod_reviewed', 'requested', 'pending'].includes(r.status)
  );
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const aStart = toDate(a.start_date);
      const aEnd = toDate(a.end_date);
      const bStart = toDate(b.start_date);
      const bEnd = toDate(b.end_date);
      if (
        isWithinInterval(bStart, { start: aStart, end: aEnd }) ||
        isWithinInterval(aStart, { start: bStart, end: bEnd })
      ) {
        out.push([a.id, b.id]);
      }
    }
  }
  return out;
}
