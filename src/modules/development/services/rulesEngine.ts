// Crew Development - Rules Engine
// Pure functions: category-matrix cost calculator + eligibility checks.
// All policy values come from `program_settings` (admin-editable) with sensible fallbacks.

import type { DevCategory, DevFormat } from '@/modules/development/constants';
import {
  ACCOMMODATION_CAP_PER_NIGHT,
  FOOD_PER_DIEM_FLEET_ORGANISED,
  PROFESSIONAL_THRESHOLD,
  ELIGIBILITY_MONTHS,
} from '@/modules/development/constants';

export interface ProgramSettings {
  accommodation_cap_per_night_usd: number;
  food_per_diem_usd: number;
  professional_split_threshold_usd: number;
  clawback_months: number;
  eligibility_service_days: number;
  probation_default_days: number;
  online_neutral_threshold_hours: number;
  anniversary_window_days: number;
  business_class_flights_allowed: boolean;
}

export const DEFAULT_SETTINGS: ProgramSettings = {
  accommodation_cap_per_night_usd: ACCOMMODATION_CAP_PER_NIGHT,
  food_per_diem_usd: FOOD_PER_DIEM_FLEET_ORGANISED,
  professional_split_threshold_usd: PROFESSIONAL_THRESHOLD,
  clawback_months: 12,
  eligibility_service_days: 90,
  probation_default_days: 90,
  online_neutral_threshold_hours: 4,
  anniversary_window_days: 30,
};

// ---------- Category Matrix ----------

export interface CostInput {
  category: DevCategory;
  format?: DevFormat | null;
  durationDays: number;
  tuitionUsd: number;
  travelUsd: number;
  accommodationNights: number;
  accommodationNightlyRateUsd: number;
  foodPerDiemUsd?: number;
  durationHours?: number;
  over4kRule?: boolean;
}

export interface CostBreakdown {
  tuition: number;
  travel: number;
  accommodation: number;
  accommodationCappedFromUsd: number;
  food: number;
  perDiemUsed: number;
  total: number;
  isOverSplitThreshold: boolean;
  appliesSplitPayment: boolean;
  isOnlineShort: boolean;
  neutralDaysEligible: number;
  notes: string[];
}

/**
 * Category reimbursement matrix:
 *  - Inkfish Required (fleet_organised) → 100% tuition/travel/accom/food
 *  - Mandatory          → 100% tuition + travel/accom/food
 *  - Professional       → 100% tuition (with split-payment if > threshold), travel/accom/food
 *  - Extracurricular    → tuition not reimbursed; travel/accom/food only if vessel approves
 */
export function calculateCosts(input: CostInput, settings: ProgramSettings): CostBreakdown {
  const notes: string[] = [];

  const cap = settings.accommodation_cap_per_night_usd;
  const nightlyAsked = Math.max(0, input.accommodationNightlyRateUsd || 0);
  const nightlyApplied = Math.min(nightlyAsked, cap);
  const accommodation = (input.accommodationNights || 0) * nightlyApplied;
  if (nightlyAsked > cap) {
    notes.push(`Accommodation rate capped at $${cap}/night (asked $${nightlyAsked}).`);
  }

  const perDiemUsed = input.foodPerDiemUsd ?? settings.food_per_diem_usd;
  const food = (input.durationDays || 0) * perDiemUsed;

  let tuition = input.tuitionUsd || 0;
  if (input.category === 'extracurricular') {
    if (tuition > 0) {
      notes.push('Extracurricular: tuition is not reimbursed by default.');
    }
    tuition = 0;
  }

  const travel = input.travelUsd || 0;
  const total = tuition + travel + accommodation + food;

  const isOverSplitThreshold = total > settings.professional_split_threshold_usd;
  const appliesSplitPayment =
    isOverSplitThreshold && (input.over4kRule === true || input.category === 'professional');
  if (appliesSplitPayment) {
    notes.push(
      `Over $${settings.professional_split_threshold_usd.toLocaleString()} — 50/50 split payment applies.`,
    );
  }

  // Online-short rule: short online courses (≤ threshold hours) accrue 0 neutral days
  const isOnlineShort =
    (input.format === 'online' || input.format === 'online_in_person') &&
    typeof input.durationHours === 'number' &&
    input.durationHours <= settings.online_neutral_threshold_hours;

  const neutralDaysEligible = isOnlineShort ? 0 : input.durationDays || 0;
  if (isOnlineShort) {
    notes.push(
      `Short online course (≤${settings.online_neutral_threshold_hours}h) — no neutral days accrued.`,
    );
  }

  return {
    tuition,
    travel,
    accommodation,
    accommodationCappedFromUsd: nightlyAsked,
    food,
    perDiemUsed,
    total,
    isOverSplitThreshold,
    appliesSplitPayment,
    isOnlineShort,
    neutralDaysEligible,
    notes,
  };
}

// ---------- Eligibility ----------

export interface EligibilityInput {
  contractStartDate?: string | null;
  probationEndDate?: string | null;
  lastApprovedCourseEndDate?: string | null;
  courseStartDate?: string | null;
}

export interface EligibilityWarning {
  code: 'service' | 'probation' | 'anniversary' | 'no-service-date';
  severity: 'warning' | 'info';
  message: string;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Eligibility is informational — never blocks submission. Returns warnings that
 * are shown to applicant/HOD/Captain so they can be acknowledged or overridden.
 */
export function checkEligibility(
  input: EligibilityInput,
  settings: ProgramSettings,
): EligibilityWarning[] {
  const warnings: EligibilityWarning[] = [];
  const today = new Date();
  const refDate = input.courseStartDate ? new Date(input.courseStartDate) : today;

  // Service days check
  if (!input.contractStartDate) {
    warnings.push({
      code: 'no-service-date',
      severity: 'info',
      message: 'No contract start date on file — service-eligibility cannot be verified.',
    });
  } else {
    const start = new Date(input.contractStartDate);
    const served = daysBetween(start, refDate);
    if (served < settings.eligibility_service_days) {
      warnings.push({
        code: 'service',
        severity: 'warning',
        message: `Crew has ${Math.max(0, served)} days of service — below ${settings.eligibility_service_days}-day eligibility threshold.`,
      });
    }
  }

  // Probation check
  if (input.probationEndDate) {
    const probationEnd = new Date(input.probationEndDate);
    if (refDate < probationEnd) {
      warnings.push({
        code: 'probation',
        severity: 'warning',
        message: `Crew is still on probation until ${input.probationEndDate}.`,
      });
    }
  }

  // 30-day course anniversary
  if (input.lastApprovedCourseEndDate) {
    const last = new Date(input.lastApprovedCourseEndDate);
    const sinceLast = daysBetween(last, refDate);
    if (sinceLast < settings.anniversary_window_days) {
      warnings.push({
        code: 'anniversary',
        severity: 'warning',
        message: `Only ${sinceLast} days since last approved course (minimum ${settings.anniversary_window_days}).`,
      });
    }
  }

  return warnings;
}

// Re-export legacy constant for any caller still importing the old name
export { ELIGIBILITY_MONTHS };
