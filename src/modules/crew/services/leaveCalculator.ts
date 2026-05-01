/**
 * Leave Calculator
 *
 * Pure functions for crew leave accrual and balance projection.
 * No DB / React dependencies — easy to unit test.
 */

import {
  differenceInCalendarDays,
  differenceInCalendarMonths,
  endOfMonth,
  isAfter,
  isBefore,
  parseISO,
  startOfMonth,
  startOfYear,
} from 'date-fns';

export type AccrualMethod = 'monthly' | 'daily' | 'rotation' | 'contract';
export type RoundingMethod = 'none' | 'half' | 'whole';

export interface LeavePolicy {
  defaultAnnualEntitlement: number;
  accrualMethod: AccrualMethod;
  monthlyAccrualDays: number;
  proRata: boolean;
  rounding: RoundingMethod;
  bookedDeducts: boolean;
  sickAffectsBalance: boolean;
  trainingAffectsBalance: boolean;
  unpaidAffectsBalance: boolean;
  defaultRotation?: string | null;
}

export const DEFAULT_LEAVE_POLICY: LeavePolicy = {
  defaultAnnualEntitlement: 60,
  accrualMethod: 'monthly',
  monthlyAccrualDays: 5,
  proRata: true,
  rounding: 'half',
  bookedDeducts: true,
  sickAffectsBalance: false,
  trainingAffectsBalance: false,
  unpaidAffectsBalance: false,
  defaultRotation: null,
};

export interface CrewProfileLite {
  user_id: string;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  employment_start_date?: string | null;
  annual_leave_entitlement?: number | null;
  leave_accrual_method?: AccrualMethod | null;
  rotation_pattern?: string | null;
}

export interface LeaveEntryLite {
  date: string;          // 'yyyy-MM-dd'
  status_code: string;   // F, Q, L, T, CD, M, PPL, CL, N, U, R
}

export interface LeaveRequestLite {
  start_date: string;
  end_date: string;
  status: string;        // pending | approved | declined | cancelled | draft | completed
  leave_type: string;
}

export interface BalanceAdjustment {
  adjustment_days: number;
  effective_date: string;
}

export interface AccrualBreakdown {
  /** Total annual entitlement (per-crew override or policy default). */
  annualEntitlement: number;
  /** Days accrued from the anchor date up to `asOf`. */
  accrued: number;
  /** Days taken (status code L, plus any other deducting types per policy). */
  taken: number;
  /** Days booked (approved, future) — counts only if policy.bookedDeducts. */
  booked: number;
  /** Days requested but pending. */
  pending: number;
  /** Carryover from previous year. */
  carryover: number;
  /** Manual adjustments. */
  adjustments: number;
  /** Final remaining = accrued + carryover + adjustments - taken - booked. */
  remaining: number;
  /** Days of accrual that occur each month under the active policy. */
  monthlyAccrualDays: number;
  /** Anchor date used for accrual (employment / contract / fallback). */
  accrualAnchor: string | null;
  /** Notes for explanation in UI. */
  notes: string[];
}

/* ---------- helpers --------------------------------------------------------- */

const round = (value: number, method: RoundingMethod): number => {
  if (!Number.isFinite(value)) return 0;
  switch (method) {
    case 'whole':
      return Math.round(value);
    case 'half':
      return Math.round(value * 2) / 2;
    case 'none':
    default:
      return Math.round(value * 100) / 100;
  }
};

const parseDate = (s?: string | null): Date | null => {
  if (!s) return null;
  // Accept both 'yyyy-MM-dd' and ISO strings.
  const d = s.length <= 10 ? parseISO(`${s}T00:00:00`) : parseISO(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const codeAffectsBalance = (
  code: string,
  policy: LeavePolicy,
): 'taken' | 'neutral' | 'accrual' => {
  switch (code) {
    case 'L':
      return 'taken';
    case 'M':
      return policy.sickAffectsBalance ? 'taken' : 'neutral';
    case 'CD':
      return policy.trainingAffectsBalance ? 'taken' : 'neutral';
    case 'U':
      return policy.unpaidAffectsBalance ? 'taken' : 'neutral';
    case 'F':
    case 'Q':
      // F/Q are tracked separately as accrued days on board (legacy STORM model)
      return 'accrual';
    default:
      return 'neutral';
  }
};

/* ---------- accrual --------------------------------------------------------- */

/**
 * Pick the accrual anchor date. Priority:
 *   1. employment_start_date
 *   2. contract_start_date
 *   3. earliest crew_assignment join_date (caller may pass via override)
 */
export const resolveAccrualAnchor = (
  profile: CrewProfileLite,
  fallbackJoinDate?: string | null,
): Date | null => {
  return (
    parseDate(profile.employment_start_date) ||
    parseDate(profile.contract_start_date) ||
    parseDate(fallbackJoinDate ?? null)
  );
};

/**
 * Calculate days accrued from `anchor` up to `asOf` under the policy.
 * Handles partial months pro-rata.
 */
export const calculateAccruedDays = (
  anchor: Date | null,
  asOf: Date,
  policy: LeavePolicy,
  yearStart?: Date,
): number => {
  if (!anchor || isAfter(anchor, asOf)) return 0;

  // For per-year balances, clamp anchor to the start of the calendar year
  // when the anchor pre-dates the year — accrual resets each calendar year.
  const effectiveAnchor =
    yearStart && isBefore(anchor, yearStart) ? yearStart : anchor;
  if (isAfter(effectiveAnchor, asOf)) return 0;

  switch (policy.accrualMethod) {
    case 'daily': {
      const days = differenceInCalendarDays(asOf, effectiveAnchor) + 1;
      const dailyRate = policy.defaultAnnualEntitlement / 365;
      return round(days * dailyRate, policy.rounding);
    }
    case 'rotation':
    case 'monthly': {
      // Whole months elapsed
      const wholeMonths = Math.max(
        0,
        differenceInCalendarMonths(startOfMonth(asOf), startOfMonth(effectiveAnchor)),
      );
      // Pro-rata for partial month at start
      const startMonthEnd = endOfMonth(effectiveAnchor);
      const startMonthDays =
        differenceInCalendarDays(startMonthEnd, effectiveAnchor) + 1;
      const startMonthTotalDays =
        differenceInCalendarDays(startMonthEnd, startOfMonth(effectiveAnchor)) + 1;
      const startFraction = policy.proRata
        ? startMonthDays / startMonthTotalDays
        : 1;

      // Pro-rata for partial month at end
      const endMonthStart = startOfMonth(asOf);
      const endMonthDays = differenceInCalendarDays(asOf, endMonthStart) + 1;
      const endMonthTotalDays =
        differenceInCalendarDays(endOfMonth(asOf), endMonthStart) + 1;
      const endFraction = policy.proRata
        ? endMonthDays / endMonthTotalDays
        : 1;

      let totalFractions: number;
      if (wholeMonths === 0) {
        // Same calendar month — only pro-rate the slice between anchor & asOf
        const sameMonthDays =
          differenceInCalendarDays(asOf, effectiveAnchor) + 1;
        totalFractions = policy.proRata
          ? sameMonthDays / startMonthTotalDays
          : 1;
      } else {
        // wholeMonths counts months strictly between start month and end month;
        // we add the partial first month and the partial last month explicitly.
        const innerMonths = Math.max(0, wholeMonths - 1);
        totalFractions = startFraction + innerMonths + endFraction;
      }

      return round(totalFractions * policy.monthlyAccrualDays, policy.rounding);
    }
    case 'contract': {
      // Linear over the contract: anchor → contract end (or asOf if no end)
      // We can only guess contract length here, so treat the same as daily.
      const days = differenceInCalendarDays(asOf, effectiveAnchor) + 1;
      const dailyRate = policy.defaultAnnualEntitlement / 365;
      return round(days * dailyRate, policy.rounding);
    }
  }
};

/* ---------- main breakdown -------------------------------------------------- */

export interface CalculateInput {
  profile: CrewProfileLite;
  policy: LeavePolicy;
  entries: LeaveEntryLite[];           // YEAR worth of entries
  requests: LeaveRequestLite[];        // pending / approved future
  carryover: number;
  adjustments: BalanceAdjustment[];
  asOf: Date;
  fallbackJoinDate?: string | null;
}

export const calculateLeaveBreakdown = (input: CalculateInput): AccrualBreakdown => {
  const {
    profile,
    policy,
    entries,
    requests,
    carryover,
    adjustments,
    asOf,
    fallbackJoinDate,
  } = input;

  const notes: string[] = [];
  const annualEntitlement =
    profile.annual_leave_entitlement ?? policy.defaultAnnualEntitlement;

  // Use per-crew accrual override when present
  const effectivePolicy: LeavePolicy = {
    ...policy,
    accrualMethod: profile.leave_accrual_method ?? policy.accrualMethod,
    defaultAnnualEntitlement: annualEntitlement,
    monthlyAccrualDays:
      profile.leave_accrual_method === 'monthly' || profile.leave_accrual_method === 'rotation'
        ? policy.monthlyAccrualDays
        : policy.monthlyAccrualDays,
  };

  const anchor = resolveAccrualAnchor(profile, fallbackJoinDate);
  if (!anchor) {
    notes.push('No employment / contract start date — accrual cannot be calculated.');
  }

  const yearStart = startOfYear(asOf);
  const accrued = calculateAccruedDays(anchor, asOf, effectivePolicy, yearStart);

  // Tally taken from entries (only those up to & including asOf)
  let taken = 0;
  for (const e of entries) {
    const d = parseDate(e.date);
    if (!d || isAfter(d, asOf)) continue;
    if (codeAffectsBalance(e.status_code, effectivePolicy) === 'taken') {
      taken += 1;
    }
  }

  // Booked = approved future requests (after asOf)
  let booked = 0;
  let pending = 0;
  for (const r of requests) {
    const start = parseDate(r.start_date);
    const end = parseDate(r.end_date);
    if (!start || !end) continue;
    const days = differenceInCalendarDays(end, start) + 1;
    const future = isAfter(start, asOf);

    if (r.status === 'approved' && future && policy.bookedDeducts) {
      booked += days;
    } else if (r.status === 'pending' && future) {
      pending += days;
    }
  }

  const adjTotal = adjustments
    .filter((a) => {
      const d = parseDate(a.effective_date);
      return d ? !isAfter(d, asOf) : true;
    })
    .reduce((sum, a) => sum + (a.adjustment_days ?? 0), 0);

  const remaining = round(
    accrued + carryover + adjTotal - taken - booked,
    effectivePolicy.rounding,
  );

  if (effectivePolicy.proRata && anchor && isAfter(anchor, yearStart)) {
    notes.push(
      `Pro-rata accrual from ${anchor.toISOString().substring(0, 10)} (mid-year start).`,
    );
  }
  if (profile.contract_end_date) {
    const ce = parseDate(profile.contract_end_date);
    if (ce && isBefore(ce, asOf)) {
      notes.push('Contract end date has passed — accrual stopped at end date.');
    }
  }

  return {
    annualEntitlement,
    accrued,
    taken,
    booked,
    pending,
    carryover,
    adjustments: adjTotal,
    remaining,
    monthlyAccrualDays: effectivePolicy.monthlyAccrualDays,
    accrualAnchor: anchor ? anchor.toISOString().substring(0, 10) : null,
    notes,
  };
};

/* ---------- next leave projection ------------------------------------------ */

/**
 * Find the soonest upcoming leave block (approved or pending) for a crew member,
 * given that crew's calendar entries and request list.
 */
export const findNextLeaveBlock = (
  entries: LeaveEntryLite[],
  requests: LeaveRequestLite[],
  asOf: Date,
): { startDate: string | null; endDate: string | null; source: 'entry' | 'request' | null } => {
  // 1. Look at calendar entries (status code L) with the earliest future date.
  const futureLeaveEntries = entries
    .filter((e) => e.status_code === 'L')
    .map((e) => ({ ...e, parsed: parseDate(e.date) }))
    .filter((e) => e.parsed && !isBefore(e.parsed, asOf))
    .sort((a, b) => a.parsed!.getTime() - b.parsed!.getTime());

  if (futureLeaveEntries.length > 0) {
    // Walk forward to find the contiguous block
    let start = futureLeaveEntries[0].date;
    let end = start;
    for (let i = 1; i < futureLeaveEntries.length; i++) {
      const prev = parseDate(futureLeaveEntries[i - 1].date)!;
      const cur = parseDate(futureLeaveEntries[i].date)!;
      if (differenceInCalendarDays(cur, prev) === 1) {
        end = futureLeaveEntries[i].date;
      } else {
        break;
      }
    }
    return { startDate: start, endDate: end, source: 'entry' };
  }

  // 2. Otherwise look at approved future requests.
  const futureApproved = requests
    .filter((r) => (r.status === 'approved' || r.status === 'pending'))
    .map((r) => ({ ...r, parsed: parseDate(r.start_date) }))
    .filter((r) => r.parsed && !isBefore(r.parsed, asOf))
    .sort((a, b) => a.parsed!.getTime() - b.parsed!.getTime());

  if (futureApproved.length > 0) {
    return {
      startDate: futureApproved[0].start_date,
      endDate: futureApproved[0].end_date,
      source: 'request',
    };
  }

  return { startDate: null, endDate: null, source: null };
};

/* ---------- overlap detection ---------------------------------------------- */

export const overlapsAny = (
  start: string,
  end: string,
  others: { start_date: string; end_date: string }[],
): boolean => {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e) return false;
  return others.some((o) => {
    const os = parseDate(o.start_date);
    const oe = parseDate(o.end_date);
    if (!os || !oe) return false;
    return !(isBefore(e, os) || isAfter(s, oe));
  });
};
