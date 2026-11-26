/**
 * Training programme settings (gap/02 TR10; X5 spec §2 X5-07A, D-X5-06,
 * D-X5-19): the defaults the company's `program_settings` row starts with,
 * the account's category labels and FX overrides read from the row, and
 * the zod schema of `development_settings_save()` (the server's checks, in
 * `20261124040600_fleet_training_core.sql`, are the same).
 *
 * Pure: no React, no Supabase. The policy numbers live here, once, as the
 * column defaults of `program_settings` (`20260611052722`), so the pages
 * read the company's row and fall back to these only when the company has
 * none yet; src/test/development/settingsSchema.test.ts pins them against
 * the migrations.
 */
import { z } from 'zod';
import type { Json } from '@/integrations/supabase/types';
import type { DevCategory } from '../constants';
import type { FinalApprovalMode } from './applicationMachine';

/** The four fixed categories (D-X5-19); clawback exemptions stay on these keys. */
export const DEV_CATEGORIES = ['fleet_organised', 'mandatory', 'professional', 'extracurricular'] as const satisfies readonly DevCategory[];

/** The category words before an account renames them (program_settings.category_labels). */
export const DEFAULT_CATEGORY_LABELS: Readonly<Record<DevCategory, string>> = {
  fleet_organised: 'Company required',
  mandatory: 'Mandatory',
  professional: 'Professional',
  extracurricular: 'Extracurricular',
};

/** The live columns of program_settings the rules engine reads. */
export interface ProgramPolicy {
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

/** The columns 040600 adds (read apart from the live ones, D-X5-20). */
export interface ProgramPolicyExtras {
  final_approval_mode: FinalApprovalMode;
  mileage_rate_per_mile: number | null;
  mileage_rate_per_km: number | null;
  fx_overrides: Readonly<Record<string, number>>;
  category_labels: Readonly<Record<DevCategory, string>>;
}

/** The program_settings column defaults (20260611052722; 040600 for the extras). */
export const PROGRAM_SETTINGS_DEFAULTS: Readonly<ProgramPolicy> = {
  accommodation_cap_per_night_usd: 250,
  food_per_diem_usd: 50,
  professional_split_threshold_usd: 4000,
  clawback_months: 12,
  eligibility_service_days: 90,
  probation_default_days: 180,
  online_neutral_threshold_hours: 24,
  anniversary_window_days: 30,
  business_class_flights_allowed: true,
};

export const PROGRAM_POLICY_EXTRA_DEFAULTS: Readonly<ProgramPolicyExtras> = {
  final_approval_mode: 'both',
  mileage_rate_per_mile: null,
  mileage_rate_per_km: null,
  fx_overrides: {},
  category_labels: DEFAULT_CATEGORY_LABELS,
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The account's labels over the defaults; blank, unknown or over-long entries are ignored. */
export function parseCategoryLabels(value: Json | null | undefined): Record<DevCategory, string> {
  const out: Record<DevCategory, string> = { ...DEFAULT_CATEGORY_LABELS };
  if (!isObject(value)) return out;
  for (const key of DEV_CATEGORIES) {
    const raw = value[key];
    if (typeof raw === 'string' && raw.trim() && raw.trim().length <= 60) out[key] = raw.trim();
  }
  return out;
}

const ISO_CODE = /^[A-Z]{3}$/;

/** FX overrides to USD by ISO code; anything that is not a code and a positive number is ignored. */
export function parseFxOverrides(value: Json | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObject(value)) return out;
  for (const [code, rate] of Object.entries(value)) {
    if (ISO_CODE.test(code) && typeof rate === 'number' && Number.isFinite(rate) && rate > 0 && rate <= 1_000_000) out[code] = rate;
  }
  return out;
}

/** The final approval mode of a settings row (anything unexpected is the default, 'both'). */
export function parseFinalApprovalMode(value: unknown): FinalApprovalMode {
  return value === 'either' ? 'either' : 'both';
}

const money = (max = 1_000_000) => z.coerce.number({ invalid_type_error: 'Enter an amount' }).min(0, 'Must be 0 or more').max(max, `Must be ${max.toLocaleString('en-GB')} or less`);
const wholeNumber = (max: number) =>
  z.coerce.number({ invalid_type_error: 'Enter a whole number' }).int('Enter a whole number').min(0, 'Must be 0 or more').max(max, `Must be ${max} or less`);
const optionalRate = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z.coerce.number({ invalid_type_error: 'Enter a rate' }).min(0, 'Must be 0 or more').max(1000, 'Must be 1000 or less').nullable(),
);

/** `development_settings_save(p_settings)`: every key optional (a partial save keeps the rest). */
export const programSettingsSchema = z
  .object({
    accommodation_cap_per_night_usd: money(),
    food_per_diem_usd: money(),
    professional_split_threshold_usd: money(),
    clawback_months: wholeNumber(120),
    eligibility_service_days: wholeNumber(3650),
    probation_default_days: wholeNumber(3650),
    online_neutral_threshold_hours: money(1000),
    anniversary_window_days: wholeNumber(3650),
    business_class_flights_allowed: z.boolean(),
    final_approval_mode: z.enum(['both', 'either']),
    mileage_rate_per_mile: optionalRate,
    mileage_rate_per_km: optionalRate,
    fx_overrides: z
      .record(z.string().regex(ISO_CODE, 'Use a three-letter currency code'), z.coerce.number().positive('Must be more than 0').max(1_000_000))
      .refine((r) => Object.keys(r).length <= 50, 'Up to 50 currencies'),
    category_labels: z.object(
      Object.fromEntries(
        DEV_CATEGORIES.map((k) => [k, z.string().trim().min(1, 'Give the category a name').max(60, 'Keep it to 60 characters or fewer')]),
      ) as Record<DevCategory, z.ZodString>,
    ),
  })
  .partial()
  .strict();

export type ProgramSettingsInput = z.input<typeof programSettingsSchema>;
export type ProgramSettingsValues = z.output<typeof programSettingsSchema>;

/** The payload of development_settings_save (values already parsed by the schema). */
export function toSettingsPayload(values: ProgramSettingsValues, expectedUpdatedAt?: string | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) if (value !== undefined) out[key] = value;
  if (expectedUpdatedAt) out.expected_updated_at = expectedUpdatedAt;
  return out;
}

const SETTING_FIELD_WORDS: Readonly<Record<string, string>> = {
  accommodation_cap_per_night_usd: 'the accommodation cap',
  food_per_diem_usd: 'the food per diem',
  professional_split_threshold_usd: 'the split-payment threshold',
  clawback_months: 'the clawback window',
  eligibility_service_days: 'the service days before eligibility',
  probation_default_days: 'the probation length',
  online_neutral_threshold_hours: 'the online hours per neutral day',
  anniversary_window_days: 'the days between courses',
  business_class_flights_allowed: 'business class flights',
  final_approval_mode: 'the final approval rule',
  mileage_rate_per_mile: 'the rate per mile',
  mileage_rate_per_km: 'the rate per kilometre',
  fx_overrides: 'the exchange-rate overrides',
  category_labels: 'the category names',
};

/** A sentence for a development_settings_save refusal (message + hint), or null when it is not one. */
export function settingsRefusalMessage(error: { message?: string | null; hint?: string | null } | null | undefined): string | null {
  const code = error?.message?.trim();
  if (!code) return null;
  const field = error?.hint ? SETTING_FIELD_WORDS[error.hint] ?? 'a setting' : 'a setting';
  switch (code) {
    case 'not_permitted':
      return 'Only training admins change the programme settings.';
    case 'stale_settings':
      return 'Someone changed these settings since you opened them. Reload and try again.';
    case 'field_invalid':
      return `Check ${field}: the value is not allowed.`;
    case 'field_unknown':
      return 'One of the settings is not known.';
    default:
      return null;
  }
}
