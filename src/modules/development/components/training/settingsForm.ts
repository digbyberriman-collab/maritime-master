/**
 * The programme settings form of Fleet › Training › Settings (gap/02
 * TR10; X5-07B; D-X5-06, D-X5-19). Pure: the form's zod schema, its
 * starting values from the company's row (or the column defaults when it
 * has none) and the conversion to the payload of
 * `development_settings_save` (lib/settingsSchema.ts validates it again,
 * the server once more).
 *
 * The form keeps the exchange-rate overrides as rows (code, rate) so they
 * can be added and removed; the payload is the `{ "EUR": 1.08 }` object.
 * Only the fields that changed are sent (a partial save keeps the rest),
 * so a save never rewrites a value nobody touched.
 */
import { z } from 'zod';
import type { DevCategory } from '../../constants';
import {
  DEFAULT_CATEGORY_LABELS,
  DEV_CATEGORIES,
  PROGRAM_POLICY_EXTRA_DEFAULTS,
  PROGRAM_SETTINGS_DEFAULTS,
  programSettingsSchema,
  type ProgramPolicy,
  type ProgramPolicyExtras,
  type ProgramSettingsValues,
} from '../../lib/settingsSchema';

const amount = (max: number, message = 'Enter an amount') =>
  z.coerce.number({ invalid_type_error: message }).min(0, 'Must be 0 or more').max(max, `Must be ${max.toLocaleString('en-GB')} or less`);
const days = (max: number) => z.coerce.number({ invalid_type_error: 'Enter a whole number' }).int('Enter a whole number').min(0, 'Must be 0 or more').max(max, `Must be ${max} or less`);
const optionalRate = z.preprocess(
  (v) => (v === '' || v === undefined || v === null ? null : v),
  z.coerce.number({ invalid_type_error: 'Enter a rate' }).min(0, 'Must be 0 or more').max(1000, 'Must be 1000 or less').nullable(),
);

export const fxRowSchema = z.object({
  code: z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v), z.string().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code')),
  rate: z.coerce.number({ invalid_type_error: 'Enter a rate' }).positive('Must be more than 0').max(1_000_000, 'Must be 1,000,000 or less'),
});

export const settingsFormSchema = z
  .object({
    final_approval_mode: z.enum(['both', 'either']),
    mileage_rate_per_mile: optionalRate,
    mileage_rate_per_km: optionalRate,
    fx: z.array(fxRowSchema).max(50, 'Up to 50 currencies'),
    category_labels: z.object(
      Object.fromEntries(DEV_CATEGORIES.map((k) => [k, z.string().trim().min(1, 'Give the category a name').max(60, 'Keep it to 60 characters or fewer')])) as Record<
        DevCategory,
        z.ZodString
      >,
    ),
    accommodation_cap_per_night_usd: amount(1_000_000),
    food_per_diem_usd: amount(1_000_000),
    professional_split_threshold_usd: amount(1_000_000),
    clawback_months: days(120),
    eligibility_service_days: days(3650),
    probation_default_days: days(3650),
    online_neutral_threshold_hours: amount(1000, 'Enter a number of hours'),
    anniversary_window_days: days(3650),
    business_class_flights_allowed: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.fx.forEach((row, i) => {
      if (seen.has(row.code)) ctx.addIssue({ code: 'custom', path: ['fx', i, 'code'], message: 'This currency is already listed' });
      seen.add(row.code);
    });
  });

export type SettingsFormInput = z.input<typeof settingsFormSchema>;
export type SettingsFormValues = z.output<typeof settingsFormSchema>;

/** The form's starting values: the company's row and policy columns, or their defaults. */
export function settingsFormDefaults(policy: ProgramPolicy | null, extras: ProgramPolicyExtras | null): SettingsFormValues {
  const p = policy ?? PROGRAM_SETTINGS_DEFAULTS;
  const e = extras ?? PROGRAM_POLICY_EXTRA_DEFAULTS;
  return {
    final_approval_mode: e.final_approval_mode,
    mileage_rate_per_mile: e.mileage_rate_per_mile,
    mileage_rate_per_km: e.mileage_rate_per_km,
    fx: Object.entries(e.fx_overrides)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, rate]) => ({ code, rate })),
    category_labels: { ...DEFAULT_CATEGORY_LABELS, ...e.category_labels },
    accommodation_cap_per_night_usd: Number(p.accommodation_cap_per_night_usd),
    food_per_diem_usd: Number(p.food_per_diem_usd),
    professional_split_threshold_usd: Number(p.professional_split_threshold_usd),
    clawback_months: Number(p.clawback_months),
    eligibility_service_days: Number(p.eligibility_service_days),
    probation_default_days: Number(p.probation_default_days),
    online_neutral_threshold_hours: Number(p.online_neutral_threshold_hours),
    anniversary_window_days: Number(p.anniversary_window_days),
    business_class_flights_allowed: Boolean(p.business_class_flights_allowed),
  };
}

const sameFx = (a: SettingsFormValues['fx'], b: SettingsFormValues['fx']) => {
  const key = (rows: SettingsFormValues['fx']) => JSON.stringify([...rows].sort((x, y) => x.code.localeCompare(y.code)).map((r) => [r.code, r.rate]));
  return key(a) === key(b);
};
type Labels = Partial<Record<DevCategory, string>>;
const sameLabels = (a: Labels, b: Labels) => DEV_CATEGORIES.every((k) => (a[k] ?? '').trim() === (b[k] ?? '').trim());

/**
 * The payload of the fields that changed from `initial`, validated by the
 * server's schema mirror; null when nothing changed.
 */
export function changedSettings(values: SettingsFormValues, initial: SettingsFormValues): ProgramSettingsValues | null {
  const out: Record<string, unknown> = {};
  const plain = [
    'final_approval_mode',
    'mileage_rate_per_mile',
    'mileage_rate_per_km',
    'accommodation_cap_per_night_usd',
    'food_per_diem_usd',
    'professional_split_threshold_usd',
    'clawback_months',
    'eligibility_service_days',
    'probation_default_days',
    'online_neutral_threshold_hours',
    'anniversary_window_days',
    'business_class_flights_allowed',
  ] as const;
  for (const key of plain) if (values[key] !== initial[key]) out[key] = values[key];
  if (!sameFx(values.fx, initial.fx)) out.fx_overrides = Object.fromEntries(values.fx.map((r) => [r.code, r.rate]));
  if (!sameLabels(values.category_labels, initial.category_labels)) {
    out.category_labels = Object.fromEntries(DEV_CATEGORIES.map((k) => [k, (values.category_labels[k] ?? '').trim()]));
  }
  if (!Object.keys(out).length) return null;
  return programSettingsSchema.parse(out);
}

/** The fields that only exist once 040600 is applied (D-01: shown "Not set up yet" until then). */
export const POLICY_EXTRA_FIELDS = ['final_approval_mode', 'mileage_rate_per_mile', 'mileage_rate_per_km', 'fx', 'category_labels'] as const;
