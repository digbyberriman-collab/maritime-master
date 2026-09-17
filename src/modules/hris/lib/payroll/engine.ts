/**
 * Client-side mirror of the SQL compensation engine
 * (supabase/migrations/20260917120000_hris_phase2_compensation.sql:
 * payroll_calculate_run and gratuity_calculate_pool).
 *
 * Used for previews, what-if calculations and tests. The database function
 * remains the source of truth for persisted payroll lines; keep both in sync.
 *
 * All money is integer minor units (cents). Never use floats for money here.
 */

export type PayFrequency = 'monthly' | 'daily' | 'weekly' | 'annual';
export type GratuitySplitMethod = 'equal' | 'points' | 'days_weighted' | 'points_days';

export interface DayCounts {
  daysInPeriod: number;
  daysOnboard: number;
  daysLeavePaid: number;
  daysTravel: number;
  daysUnpaid: number;
  daysUnknown?: number;
}

export interface Allowance {
  name: string;
  amount_minor: number;
  taxable?: boolean;
  recurring?: boolean;
  prorate?: boolean;
}

export interface CompensationInput {
  baseSalaryMinor: number;
  payFrequency: PayFrequency;
  allowances: Allowance[];
}

export interface PayrollSettings {
  travelDaysPaid: boolean;
  /** Round net down to a multiple of this many minor units (1 = no rounding). */
  roundingMinor: number;
}

export interface PayrollLineResult {
  daysPaid: number;
  prorationRatio: number;
  basePeriodMinor: number;
  proratedBaseMinor: number;
  allowancesMinor: number;
  allowanceDetail: { name: string; amount_minor: number }[];
  gratuityMinor: number;
  grossMinor: number;
  netMinor: number;
}

export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = { travelDaysPaid: true, roundingMinor: 1 };

/** Postgres ROUND() on numeric rounds half away from zero. */
const roundHalfAway = (n: number): number => (n < 0 ? -Math.round(-n) : Math.round(n));

/** Monthly-equivalent base for salaried frequencies. */
export function basePeriodMinor(baseSalaryMinor: number, frequency: PayFrequency, daysInPeriod: number): number {
  switch (frequency) {
    case 'annual':
      return roundHalfAway(baseSalaryMinor / 12);
    case 'weekly':
      return roundHalfAway((baseSalaryMinor * 52) / 12);
    case 'daily':
      return baseSalaryMinor * daysInPeriod;
    default:
      return baseSalaryMinor;
  }
}

export function calculatePayrollLine(
  comp: CompensationInput,
  days: DayCounts,
  gratuityMinor = 0,
  settings: PayrollSettings = DEFAULT_PAYROLL_SETTINGS,
): PayrollLineResult {
  const daysIn = days.daysInPeriod;
  let daysPaid: number;
  let ratio: number;
  let prorated: number;
  const basePeriod = basePeriodMinor(comp.baseSalaryMinor, comp.payFrequency, daysIn);

  if (comp.payFrequency === 'daily') {
    daysPaid = days.daysOnboard + (settings.travelDaysPaid ? days.daysTravel : 0);
    ratio = daysIn > 0 ? daysPaid / daysIn : 0;
    prorated = comp.baseSalaryMinor * daysPaid;
  } else {
    daysPaid = daysIn - days.daysUnpaid - (settings.travelDaysPaid ? 0 : days.daysTravel);
    ratio = daysIn > 0 ? daysPaid / daysIn : 0;
    prorated = roundHalfAway(basePeriod * ratio);
  }

  const allowanceDetail = comp.allowances
    .filter((a) => a.recurring ?? true)
    .map((a) => ({
      name: a.name,
      amount_minor: (a.prorate ?? true) ? roundHalfAway((a.amount_minor ?? 0) * ratio) : a.amount_minor ?? 0,
    }));
  const allowances = allowanceDetail.reduce((sum, a) => sum + a.amount_minor, 0);

  const gross = prorated + allowances + gratuityMinor;
  const rounding = Math.max(settings.roundingMinor, 1);
  const net = Math.floor(gross / rounding) * rounding;

  return {
    daysPaid,
    prorationRatio: ratio,
    basePeriodMinor: basePeriod,
    proratedBaseMinor: prorated,
    allowancesMinor: allowances,
    allowanceDetail,
    gratuityMinor,
    grossMinor: gross,
    netMinor: net,
  };
}

export interface GratuityParticipant {
  profileId: string;
  daysOnboard: number;
  points: number;
  excluded?: boolean;
  /** Tie-break for the rounding remainder (earlier wins). */
  createdAt?: string;
}

export interface GratuityShare {
  profileId: string;
  daysOnboard: number;
  points: number;
  weight: number;
  shareRatio: number;
  amountMinor: number;
  excluded: boolean;
}

export function gratuityWeight(method: GratuitySplitMethod, points: number, daysOnboard: number): number {
  switch (method) {
    case 'equal':
      return 1;
    case 'points':
      return points;
    case 'days_weighted':
      return daysOnboard;
    default:
      return points * daysOnboard;
  }
}

/**
 * Splits `netMinor` across participants. Amounts are floored per share and the
 * remainder goes to the largest weight so the shares sum to the pool exactly.
 */
export function calculateGratuitySplit(
  netMinor: number,
  method: GratuitySplitMethod,
  participants: GratuityParticipant[],
): GratuityShare[] {
  const eligible = participants.filter((p) => !p.excluded && p.daysOnboard > 0);
  const weights = new Map(eligible.map((p) => [p.profileId, gratuityWeight(method, p.points, p.daysOnboard)]));
  const totalWeight = Array.from(weights.values()).reduce((a, b) => a + b, 0);

  const shares: GratuityShare[] = participants.map((p) => {
    const excluded = Boolean(p.excluded) || p.daysOnboard <= 0;
    const weight = excluded ? 0 : weights.get(p.profileId) ?? 0;
    const ratio = excluded || totalWeight === 0 ? 0 : weight / totalWeight;
    return {
      profileId: p.profileId,
      daysOnboard: p.daysOnboard,
      points: p.points,
      weight,
      shareRatio: ratio,
      amountMinor: excluded || totalWeight === 0 ? 0 : Math.floor(netMinor * ratio),
      excluded,
    };
  });

  const allocated = shares.reduce((sum, s) => sum + s.amountMinor, 0);
  if (allocated < netMinor && totalWeight > 0) {
    const order = [...participants].filter((p) => !p.excluded && p.daysOnboard > 0);
    const largest = order
      .map((p) => ({ id: p.profileId, w: weights.get(p.profileId) ?? 0, c: p.createdAt ?? '' }))
      .sort((a, b) => b.w - a.w || a.c.localeCompare(b.c))[0];
    const target = shares.find((s) => s.profileId === largest.id);
    if (target) target.amountMinor += netMinor - allocated;
  }
  return shares;
}

/** Sum of shares equals the pool net (invariant used by tests and UI). */
export const sumShares = (shares: GratuityShare[]): number => shares.reduce((s, x) => s + x.amountMinor, 0);
