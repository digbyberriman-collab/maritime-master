import { z } from 'zod';
import { addDays, addMonths, format, isValid, parseISO, startOfMonth, startOfYear } from 'date-fns';
import type { Json, Tables, TablesInsert } from '@/integrations/supabase/types';
import { fromMinor, toMinor } from '@/modules/hris/lib/format';
import type { Allowance, PayFrequency } from '@/modules/hris/lib/payroll/engine';
import { CURRENCY_PRESETS, OTHER_CURRENCY, resolveCurrency } from '@/modules/hris/lib/contractHelpers';

/**
 * Pure helpers for the compensation area (salaries, allowances, bank details,
 * pay grades, FX rates and pay periods). No React, no Supabase — everything is
 * unit-testable and shared by the hooks, dialogs and pages.
 *
 * Money is integer minor units (cents) + ISO-4217 code, matching the schema in
 * supabase/migrations/20260917120000_hris_phase2_compensation.sql.
 */

export type CrewCompensationRow = Tables<'crew_compensation'>;
export type PayGradeRow = Tables<'pay_grades'>;
export type BankDetailRow = Tables<'crew_bank_details'>;
export type FxRateRow = Tables<'fx_rates'>;
export type PayPeriodRow = Tables<'pay_periods'>;
export type HrCompanySettingsRow = Tables<'hr_company_settings'>;

export type { Allowance, PayFrequency };
export { CURRENCY_PRESETS, OTHER_CURRENCY, resolveCurrency };

export const PAY_FREQUENCIES = ['monthly', 'daily', 'weekly', 'annual'] as const;
export const COMPENSATION_STATUSES = ['draft', 'active', 'superseded'] as const;
export type CompensationStatus = (typeof COMPENSATION_STATUSES)[number];

export const PAY_PERIOD_TYPES = ['calendar_month', 'four_weekly', 'rotation'] as const;
export const GRATUITY_METHODS = ['equal', 'points', 'days_weighted', 'points_days'] as const;
export const ROUNDING_OPTIONS = [1, 5, 10, 100] as const;
export const PAY_PERIOD_STATUSES = ['open', 'locked', 'closed'] as const;
export type PayPeriodStatus = (typeof PAY_PERIOD_STATUSES)[number];

export const GRATUITY_METHOD_LABEL: Record<(typeof GRATUITY_METHODS)[number], string> = {
  equal: 'Equal split',
  points: 'By gratuity points',
  days_weighted: 'By days onboard',
  points_days: 'Points × days onboard',
};

export const STATUS_BADGE_CLASS: Record<CompensationStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  active: 'bg-green-500/10 text-green-600 border-green-500/20',
  superseded: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
};

export const PERIOD_STATUS_BADGE_CLASS: Record<PayPeriodStatus, string> = {
  open: 'bg-green-500/10 text-green-600 border-green-500/20',
  locked: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  closed: 'bg-muted text-muted-foreground border-border',
};

/** Postgres ROUND() on numeric rounds half away from zero. */
const roundHalfAway = (n: number): number => (n < 0 ? -Math.round(-n) : Math.round(n));

const isPayFrequency = (value: string | null | undefined): value is PayFrequency =>
  (PAY_FREQUENCIES as readonly string[]).includes(value ?? '');

export const asPayFrequency = (value: string | null | undefined): PayFrequency => (isPayFrequency(value) ? value : 'monthly');

export const asCompensationStatus = (value: string | null | undefined): CompensationStatus =>
  (COMPENSATION_STATUSES as readonly string[]).includes(value ?? '') ? (value as CompensationStatus) : 'draft';

export const asPeriodStatus = (value: string | null | undefined): PayPeriodStatus =>
  (PAY_PERIOD_STATUSES as readonly string[]).includes(value ?? '') ? (value as PayPeriodStatus) : 'open';

// ---------------------------------------------------------------------------
// Allowances
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Safely reads the `allowances` jsonb column. Malformed entries are dropped. */
export const parseAllowances = (value: Json | null | undefined): Allowance[] => {
  if (!Array.isArray(value)) return [];
  const out: Allowance[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const amount = typeof item.amount_minor === 'number' ? item.amount_minor : Number(item.amount_minor);
    if (!name || !Number.isFinite(amount)) continue;
    out.push({
      name,
      amount_minor: Math.round(amount),
      taxable: typeof item.taxable === 'boolean' ? item.taxable : undefined,
      recurring: typeof item.recurring === 'boolean' ? item.recurring : undefined,
      prorate: typeof item.prorate === 'boolean' ? item.prorate : undefined,
    });
  }
  return out;
};

export interface AllowanceIssue {
  index: number;
  field: 'name' | 'amount_minor';
  message: string;
}

/** Name required and unique (case-insensitive); amount a non-negative integer. */
export const validateAllowances = (allowances: readonly Allowance[]): AllowanceIssue[] => {
  const issues: AllowanceIssue[] = [];
  const seen = new Set<string>();
  allowances.forEach((a, index) => {
    const name = a.name.trim();
    if (!name) issues.push({ index, field: 'name', message: 'Allowance name is required' });
    else if (seen.has(name.toLowerCase())) issues.push({ index, field: 'name', message: 'Allowance names must be unique' });
    seen.add(name.toLowerCase());
    if (!Number.isInteger(a.amount_minor) || a.amount_minor < 0) {
      issues.push({ index, field: 'amount_minor', message: 'Amount must be zero or more' });
    }
  });
  return issues;
};

/** Sum of allowances per pay period; `recurring` is treated as true when unset. */
export const sumAllowancesMinor = (allowances: readonly Allowance[], options: { recurringOnly?: boolean } = {}): number =>
  allowances.reduce((sum, a) => {
    if (options.recurringOnly && a.recurring === false) return sum;
    return sum + a.amount_minor;
  }, 0);

/** Allowances as the jsonb value the row expects. */
export const allowancesToJson = (allowances: readonly Allowance[]): Json =>
  allowances.map((a) => ({
    name: a.name.trim(),
    amount_minor: a.amount_minor,
    taxable: a.taxable ?? true,
    recurring: a.recurring ?? true,
    prorate: a.prorate ?? true,
  }));

// ---------------------------------------------------------------------------
// Cost maths
// ---------------------------------------------------------------------------

/** Base pay expressed per year: monthly ×12, weekly ×52, daily ×365, annual ×1. */
export const annualisedBaseMinor = (baseMinor: number, frequency: PayFrequency): number => {
  switch (frequency) {
    case 'annual':
      return baseMinor;
    case 'weekly':
      return baseMinor * 52;
    case 'daily':
      return baseMinor * 365;
    default:
      return baseMinor * 12;
  }
};

/** Base pay expressed per month (rounded half away from zero, as Postgres does). */
export const monthlyEquivalentMinor = (baseMinor: number, frequency: PayFrequency): number =>
  frequency === 'monthly' ? baseMinor : roundHalfAway(annualisedBaseMinor(baseMinor, frequency) / 12);

export interface CostBreakdown {
  monthlyBaseMinor: number;
  monthlyAllowancesMinor: number;
  monthlyTotalMinor: number;
  annualBaseMinor: number;
  annualAllowancesMinor: number;
  annualTotalMinor: number;
}

/**
 * Cost of a compensation package. Allowances are per pay period: recurring
 * ones count every month, one-off ones once a year.
 */
export const compensationCost = (
  comp: Pick<CrewCompensationRow, 'base_salary_minor' | 'pay_frequency'> & { allowances: readonly Allowance[] | Json },
): CostBreakdown => {
  const frequency = asPayFrequency(comp.pay_frequency);
  // Accepts either the raw jsonb value or an already-parsed list.
  const allowances = parseAllowances(comp.allowances as unknown as Json);
  const recurring = sumAllowancesMinor(allowances, { recurringOnly: true });
  const oneOff = sumAllowancesMinor(allowances) - recurring;
  const annualBaseMinor = annualisedBaseMinor(comp.base_salary_minor, frequency);
  const monthlyBaseMinor = monthlyEquivalentMinor(comp.base_salary_minor, frequency);
  const annualAllowancesMinor = recurring * 12 + oneOff;
  return {
    monthlyBaseMinor,
    monthlyAllowancesMinor: recurring,
    monthlyTotalMinor: monthlyBaseMinor + recurring,
    annualBaseMinor,
    annualAllowancesMinor,
    annualTotalMinor: annualBaseMinor + annualAllowancesMinor,
  };
};

/** Converts minor units with an FX rate, rounding to whole minor units. */
export const convertMinor = (minor: number, rate: number | null | undefined): number => roundHalfAway(minor * (rate ?? 1));

// ---------------------------------------------------------------------------
// IBAN / masking
// ---------------------------------------------------------------------------

export const normaliseIban = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, '').toUpperCase();

/** ISO 13616 shape (country, check digits, 11–30 BBAN chars) plus the mod-97 checksum. */
export const isValidIban = (value: string | null | undefined): boolean => {
  const iban = normaliseIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
};

export const isValidSwiftBic = (value: string | null | undefined): boolean =>
  /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test((value ?? '').replace(/\s+/g, '').toUpperCase());

/** Keeps the first and last few characters, replaces the rest with bullets. */
export const maskSecret = (value: string | null | undefined, first = 4, last = 4): string => {
  const raw = (value ?? '').replace(/\s+/g, '');
  if (!raw) return '';
  if (raw.length <= first + last) return '•'.repeat(raw.length);
  return `${raw.slice(0, first)}${'•'.repeat(raw.length - first - last)}${raw.slice(-last)}`;
};

/** Masked IBAN grouped in fours for readability, e.g. `GB29 •••• •••• •••• •••• 1234`. */
export const maskIban = (value: string | null | undefined): string => {
  const masked = maskSecret(normaliseIban(value), 4, 4);
  return masked.replace(/(.{4})(?=.)/g, '$1 ');
};

/** Display form of a full IBAN, grouped in fours. */
export const formatIban = (value: string | null | undefined): string => normaliseIban(value).replace(/(.{4})(?=.)/g, '$1 ');

export const maskAccountNumber = (value: string | null | undefined): string => maskSecret(value, 0, 4);

// ---------------------------------------------------------------------------
// Ordering / picking
// ---------------------------------------------------------------------------

/** Newest first: by effective_from, then created_at. */
export const sortCompensationNewestFirst = <T extends Pick<CrewCompensationRow, 'effective_from' | 'created_at'>>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => {
    if (a.effective_from !== b.effective_from) return a.effective_from < b.effective_from ? 1 : -1;
    return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
  });

/** The active package first, else the newest draft, else the newest of anything. */
export const pickCurrentCompensation = <T extends CrewCompensationRow>(rows: readonly T[]) => {
  const sorted = sortCompensationNewestFirst(rows);
  const current = sorted.find((r) => r.status === 'active') ?? sorted.find((r) => r.status === 'draft') ?? sorted[0] ?? null;
  return { current, history: sorted.filter((r) => r !== current) };
};

// ---------------------------------------------------------------------------
// Compensation form
// ---------------------------------------------------------------------------

const optionalText = z.string().trim().max(500).optional().or(z.literal(''));
const optionalDate = z.string().optional().or(z.literal(''));
const majorAmount = (message: string) =>
  z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || (Number.isFinite(Number(v)) && Number(v) >= 0), message);

export const allowanceFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  amount: z.string().refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, 'Amount must be zero or more'),
  taxable: z.boolean(),
  recurring: z.boolean(),
  prorate: z.boolean(),
});
export type AllowanceFormValues = z.infer<typeof allowanceFormSchema>;

export const compensationFormSchema = z
  .object({
    status: z.enum(['draft', 'active']),
    pay_grade_id: z.string().optional().or(z.literal('')),
    currency: z.string().optional().or(z.literal('')),
    currency_other: z.string().optional().or(z.literal('')),
    base_salary: z.string().min(1, 'Base salary is required').refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, 'Base salary must be zero or more'),
    pay_frequency: z.enum(PAY_FREQUENCIES),
    allowances: z.array(allowanceFormSchema),
    gratuity_eligible: z.boolean(),
    gratuity_points: majorAmount('Gratuity points must be zero or more'),
    effective_from: z.string().min(1, 'Effective from is required'),
    effective_to: optionalDate,
    reason: optionalText,
    notes: z.string().trim().max(4000).optional().or(z.literal('')),
  })
  .superRefine((values, ctx) => {
    if (!resolveCurrency(values.currency, values.currency_other)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [values.currency === OTHER_CURRENCY ? 'currency_other' : 'currency'],
        message: 'Enter a 3-letter ISO currency code',
      });
    }
    const from = parseISO(values.effective_from);
    if (!isValid(from)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['effective_from'], message: 'Effective from is not a valid date' });
    if (values.effective_to) {
      const to = parseISO(values.effective_to);
      if (!isValid(to)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['effective_to'], message: 'Effective to is not a valid date' });
      else if (isValid(from) && to < from) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['effective_to'], message: 'Effective to must be on or after effective from' });
      }
    }
    const seen = new Set<string>();
    values.allowances.forEach((a, index) => {
      const key = a.name.trim().toLowerCase();
      if (seen.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['allowances', index, 'name'], message: 'Allowance names must be unique' });
      seen.add(key);
    });
  });

export type CompensationFormValues = z.infer<typeof compensationFormSchema>;

const nullIfEmpty = (value: string | undefined): string | null => {
  const v = (value ?? '').trim();
  return v ? v : null;
};

export const todayIso = (today: Date = new Date()): string => format(today, 'yyyy-MM-dd');

export const emptyCompensationFormValues = (defaults: Partial<CompensationFormValues> = {}): CompensationFormValues => ({
  status: 'draft',
  pay_grade_id: '',
  currency: 'EUR',
  currency_other: '',
  base_salary: '',
  pay_frequency: 'monthly',
  allowances: [],
  gratuity_eligible: true,
  gratuity_points: '',
  effective_from: todayIso(),
  effective_to: '',
  reason: '',
  notes: '',
  ...defaults,
});

const currencyToForm = (code: string | null | undefined): Pick<CompensationFormValues, 'currency' | 'currency_other'> => {
  const currency = (code ?? '').trim().toUpperCase();
  const preset = (CURRENCY_PRESETS as readonly string[]).includes(currency);
  return { currency: currency ? (preset ? currency : OTHER_CURRENCY) : 'EUR', currency_other: currency && !preset ? currency : '' };
};

export const allowanceToFormValues = (a: Allowance): AllowanceFormValues => ({
  name: a.name,
  amount: fromMinor(a.amount_minor),
  taxable: a.taxable ?? true,
  recurring: a.recurring ?? true,
  prorate: a.prorate ?? true,
});

export const emptyAllowanceFormValues = (): AllowanceFormValues => ({ name: '', amount: '', taxable: true, recurring: true, prorate: true });

/** Maps a stored package into form values (money shown in major units). */
export const compensationToFormValues = (row: CrewCompensationRow): CompensationFormValues =>
  emptyCompensationFormValues({
    status: row.status === 'active' ? 'active' : 'draft',
    pay_grade_id: row.pay_grade_id ?? '',
    ...currencyToForm(row.currency),
    base_salary: fromMinor(row.base_salary_minor),
    pay_frequency: asPayFrequency(row.pay_frequency),
    allowances: parseAllowances(row.allowances).map(allowanceToFormValues),
    gratuity_eligible: row.gratuity_eligible,
    gratuity_points: row.gratuity_points === null ? '' : String(row.gratuity_points),
    effective_from: row.effective_from,
    effective_to: row.effective_to ?? '',
    reason: row.reason ?? '',
    notes: row.notes ?? '',
  });

/** The column subset a form write produces (everything except ids/audit columns). */
export type CompensationWritePayload = Omit<
  TablesInsert<'crew_compensation'>,
  'id' | 'company_id' | 'profile_id' | 'created_by' | 'updated_by' | 'created_at' | 'updated_at' | 'approved_by' | 'approved_at'
>;

/** Maps validated form values into a row payload (money converted to minor units). */
export const formValuesToCompensationPayload = (values: CompensationFormValues): CompensationWritePayload => {
  const allowances: Allowance[] = values.allowances.map((a) => ({
    name: a.name.trim(),
    amount_minor: toMinor(a.amount) ?? 0,
    taxable: a.taxable,
    recurring: a.recurring,
    prorate: a.prorate,
  }));
  return {
    status: values.status,
    pay_grade_id: nullIfEmpty(values.pay_grade_id),
    currency: resolveCurrency(values.currency, values.currency_other) ?? 'EUR',
    base_salary_minor: toMinor(values.base_salary) ?? 0,
    pay_frequency: values.pay_frequency,
    allowances: allowancesToJson(allowances),
    gratuity_eligible: values.gratuity_eligible,
    gratuity_points: values.gratuity_points ? Number(values.gratuity_points) : null,
    effective_from: values.effective_from,
    effective_to: nullIfEmpty(values.effective_to),
    reason: nullIfEmpty(values.reason),
    notes: nullIfEmpty(values.notes),
  };
};

/**
 * Form values a pay grade prescribes: currency, base (daily rate when the
 * frequency is daily and the grade has one, else the monthly base) and
 * gratuity points. Only fields the grade actually defines are returned.
 */
export const gradeDefaults = (
  grade: Pick<PayGradeRow, 'currency' | 'monthly_base_minor' | 'daily_rate_minor' | 'gratuity_points'>,
  frequency: PayFrequency,
): Partial<CompensationFormValues> => {
  const out: Partial<CompensationFormValues> = { ...currencyToForm(grade.currency), gratuity_points: String(grade.gratuity_points) };
  if (frequency === 'daily' && grade.daily_rate_minor !== null) {
    out.base_salary = fromMinor(grade.daily_rate_minor);
    out.pay_frequency = 'daily';
  } else if (grade.monthly_base_minor > 0) {
    out.base_salary = fromMinor(grade.monthly_base_minor);
    out.pay_frequency = 'monthly';
  }
  return out;
};

// ---------------------------------------------------------------------------
// Bank details form
// ---------------------------------------------------------------------------

export const bankDetailFormSchema = z
  .object({
    account_holder: z.string().trim().min(1, 'Account holder is required').max(200),
    bank_name: optionalText,
    bank_country: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((v) => !v || /^[A-Za-z]{2}$/.test(v.trim()), 'Use the 2-letter ISO country code'),
    iban: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((v) => !v || isValidIban(v), 'IBAN is not valid (check the country, length and digits)'),
    swift_bic: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((v) => !v || isValidSwiftBic(v), 'SWIFT/BIC must be 8 or 11 characters'),
    account_number: optionalText,
    sort_code: optionalText,
    routing_number: optionalText,
    currency: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((v) => !v || /^[A-Za-z]{3}$/.test(v.trim()), 'Use the 3-letter ISO currency code'),
    is_primary: z.boolean(),
    notes: z.string().trim().max(2000).optional().or(z.literal('')),
  })
  .superRefine((values, ctx) => {
    if (!values.iban?.trim() && !values.account_number?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['iban'], message: 'Enter an IBAN or an account number' });
    }
  });

export type BankDetailFormValues = z.infer<typeof bankDetailFormSchema>;

export const emptyBankDetailFormValues = (defaults: Partial<BankDetailFormValues> = {}): BankDetailFormValues => ({
  account_holder: '',
  bank_name: '',
  bank_country: '',
  iban: '',
  swift_bic: '',
  account_number: '',
  sort_code: '',
  routing_number: '',
  currency: '',
  is_primary: true,
  notes: '',
  ...defaults,
});

export const bankDetailToFormValues = (row: BankDetailRow): BankDetailFormValues =>
  emptyBankDetailFormValues({
    account_holder: row.account_holder,
    bank_name: row.bank_name ?? '',
    bank_country: row.bank_country ?? '',
    iban: formatIban(row.iban),
    swift_bic: row.swift_bic ?? '',
    account_number: row.account_number ?? '',
    sort_code: row.sort_code ?? '',
    routing_number: row.routing_number ?? '',
    currency: row.currency ?? '',
    is_primary: row.is_primary,
    notes: row.notes ?? '',
  });

export type BankDetailWritePayload = Omit<
  TablesInsert<'crew_bank_details'>,
  'id' | 'company_id' | 'profile_id' | 'created_by' | 'updated_by' | 'created_at' | 'updated_at' | 'verified_at' | 'verified_by'
>;

export const formValuesToBankDetailPayload = (values: BankDetailFormValues): BankDetailWritePayload => ({
  account_holder: values.account_holder.trim(),
  bank_name: nullIfEmpty(values.bank_name),
  bank_country: nullIfEmpty(values.bank_country)?.toUpperCase() ?? null,
  iban: values.iban?.trim() ? normaliseIban(values.iban) : null,
  swift_bic: nullIfEmpty(values.swift_bic)?.replace(/\s+/g, '').toUpperCase() ?? null,
  account_number: nullIfEmpty(values.account_number),
  sort_code: nullIfEmpty(values.sort_code),
  routing_number: nullIfEmpty(values.routing_number),
  currency: nullIfEmpty(values.currency)?.toUpperCase() ?? null,
  is_primary: values.is_primary,
  notes: nullIfEmpty(values.notes),
});

// ---------------------------------------------------------------------------
// Company overview
// ---------------------------------------------------------------------------

export interface CompensationOverviewRow {
  profile_id: string;
  user_id: string | null;
  crew_name: string;
  rank: string | null;
  department: string | null;
  vessel_id: string | null;
  vessel_name: string | null;
  compensation: (CrewCompensationRow & { pay_grade_code: string | null; pay_grade_name: string | null }) | null;
}

export interface DepartmentAverage {
  department: string;
  crew: number;
  /** Average monthly package (base + recurring allowances) in the default currency. */
  averageMonthlyMinor: number;
}

export interface PayrollKpis {
  withCompensation: number;
  missingCompensation: number;
  /** Monthly base + recurring allowances across all active packages, in the default currency. */
  monthlyCostMinor: number;
  /** Currencies for which no FX rate to the default currency was found (counted at 1:1). */
  unconvertedCurrencies: string[];
  byDepartment: DepartmentAverage[];
}

/** KPIs for the overview. `rates` maps currency → rate into `defaultCurrency`. */
export const computePayrollKpis = (
  rows: readonly CompensationOverviewRow[],
  rates: ReadonlyMap<string, number | null>,
  defaultCurrency: string,
): PayrollKpis => {
  let withCompensation = 0;
  let monthlyCostMinor = 0;
  const unconverted = new Set<string>();
  const departments = new Map<string, { crew: number; total: number }>();

  for (const row of rows) {
    if (!row.compensation) continue;
    withCompensation += 1;
    const cost = compensationCost(row.compensation);
    const currency = row.compensation.currency.toUpperCase();
    let rate = 1;
    if (currency !== defaultCurrency.toUpperCase()) {
      const found = rates.get(currency);
      if (found === null || found === undefined) unconverted.add(currency);
      else rate = found;
    }
    const converted = convertMinor(cost.monthlyTotalMinor, rate);
    monthlyCostMinor += converted;
    const dept = row.department?.trim() || 'Unassigned';
    const bucket = departments.get(dept) ?? { crew: 0, total: 0 };
    bucket.crew += 1;
    bucket.total += converted;
    departments.set(dept, bucket);
  }

  const byDepartment = Array.from(departments.entries())
    .map(([department, { crew, total }]) => ({ department, crew, averageMonthlyMinor: roundHalfAway(total / crew) }))
    .sort((a, b) => b.averageMonthlyMinor - a.averageMonthlyMinor);

  return {
    withCompensation,
    missingCompensation: rows.length - withCompensation,
    monthlyCostMinor,
    unconvertedCurrencies: Array.from(unconverted).sort(),
    byDepartment,
  };
};

export interface OverviewFilters {
  search: string;
  vesselId: 'all' | 'none' | string;
  department: 'all' | string;
  coverage: 'all' | 'with' | 'missing';
}

export const DEFAULT_OVERVIEW_FILTERS: OverviewFilters = { search: '', vesselId: 'all', department: 'all', coverage: 'all' };

export const filterOverviewRows = (rows: readonly CompensationOverviewRow[], filters: OverviewFilters): CompensationOverviewRow[] => {
  const search = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.vesselId === 'none' ? row.vessel_id !== null : filters.vesselId !== 'all' && row.vessel_id !== filters.vesselId) return false;
    if (filters.department !== 'all' && (row.department?.trim() || 'Unassigned') !== filters.department) return false;
    if (filters.coverage === 'with' && !row.compensation) return false;
    if (filters.coverage === 'missing' && row.compensation) return false;
    if (search) {
      const hay = [row.crew_name, row.rank, row.department, row.vessel_name, row.compensation?.pay_grade_code, row.compensation?.pay_grade_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
};

// ---------------------------------------------------------------------------
// FX rates
// ---------------------------------------------------------------------------

export const fxPairKey = (base: string, quote: string): string => `${base.toUpperCase()}/${quote.toUpperCase()}`;

/** Newest first: by valid_from, then created_at. */
export const sortFxRatesNewestFirst = <T extends Pick<FxRateRow, 'valid_from' | 'created_at'>>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => {
    if (a.valid_from !== b.valid_from) return a.valid_from < b.valid_from ? 1 : -1;
    return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
  });

/** The rate in force per pair on `onDate` (latest valid_from ≤ onDate). */
export const currentFxRates = <T extends Pick<FxRateRow, 'base_currency' | 'quote_currency' | 'valid_from' | 'created_at'>>(
  rows: readonly T[],
  onDate: string = todayIso(),
): Map<string, T> => {
  const current = new Map<string, T>();
  for (const row of sortFxRatesNewestFirst(rows)) {
    if (row.valid_from > onDate) continue;
    const key = fxPairKey(row.base_currency, row.quote_currency);
    if (!current.has(key)) current.set(key, row);
  }
  return current;
};

export const fxRateFormSchema = z
  .object({
    base_currency: z.string().trim().refine((v) => /^[A-Za-z]{3}$/.test(v), 'Use a 3-letter ISO code'),
    quote_currency: z.string().trim().refine((v) => /^[A-Za-z]{3}$/.test(v), 'Use a 3-letter ISO code'),
    rate: z.string().refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, 'Rate must be greater than zero'),
    valid_from: z.string().min(1, 'Valid from is required'),
    source: optionalText,
  })
  .superRefine((values, ctx) => {
    if (values.base_currency.toUpperCase() === values.quote_currency.toUpperCase()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['quote_currency'], message: 'Base and quote must differ' });
    }
  });
export type FxRateFormValues = z.infer<typeof fxRateFormSchema>;

export const emptyFxRateFormValues = (defaults: Partial<FxRateFormValues> = {}): FxRateFormValues => ({
  base_currency: 'USD',
  quote_currency: 'EUR',
  rate: '',
  valid_from: todayIso(),
  source: '',
  ...defaults,
});

export type FxRateWritePayload = Omit<TablesInsert<'fx_rates'>, 'id' | 'company_id' | 'created_by' | 'created_at'>;

export const formValuesToFxRatePayload = (values: FxRateFormValues): FxRateWritePayload => ({
  base_currency: values.base_currency.trim().toUpperCase(),
  quote_currency: values.quote_currency.trim().toUpperCase(),
  rate: Number(values.rate),
  valid_from: values.valid_from,
  source: nullIfEmpty(values.source),
});

// ---------------------------------------------------------------------------
// Pay grades
// ---------------------------------------------------------------------------

export const payGradeFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Code is required')
    .max(20)
    .refine((v) => /^[A-Za-z0-9_-]+$/.test(v), 'Letters, numbers, dash and underscore only'),
  name: z.string().trim().min(1, 'Name is required').max(120),
  department: optionalText,
  rank: optionalText,
  grade_level: z.string().refine((v) => /^\d{1,3}$/.test(v), 'Level must be a whole number'),
  step: z.string().refine((v) => /^\d{1,3}$/.test(v), 'Step must be a whole number'),
  currency: z.string().optional().or(z.literal('')),
  currency_other: z.string().optional().or(z.literal('')),
  monthly_base: majorAmount('Monthly base must be zero or more'),
  daily_rate: majorAmount('Daily rate must be zero or more'),
  gratuity_points: z.string().refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, 'Gratuity points must be zero or more'),
  is_active: z.boolean(),
  effective_from: z.string().min(1, 'Effective from is required'),
  effective_to: optionalDate,
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
}).superRefine((values, ctx) => {
  if (!resolveCurrency(values.currency, values.currency_other)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [values.currency === OTHER_CURRENCY ? 'currency_other' : 'currency'],
      message: 'Enter a 3-letter ISO currency code',
    });
  }
  if (values.effective_to && values.effective_to < values.effective_from) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['effective_to'], message: 'Effective to must be on or after effective from' });
  }
});
export type PayGradeFormValues = z.infer<typeof payGradeFormSchema>;

export const emptyPayGradeFormValues = (defaults: Partial<PayGradeFormValues> = {}): PayGradeFormValues => ({
  code: '',
  name: '',
  department: '',
  rank: '',
  grade_level: '1',
  step: '1',
  currency: 'EUR',
  currency_other: '',
  monthly_base: '',
  daily_rate: '',
  gratuity_points: '1',
  is_active: true,
  effective_from: todayIso(),
  effective_to: '',
  notes: '',
  ...defaults,
});

export const payGradeToFormValues = (row: PayGradeRow): PayGradeFormValues =>
  emptyPayGradeFormValues({
    code: row.code,
    name: row.name,
    department: row.department ?? '',
    rank: row.rank ?? '',
    grade_level: String(row.grade_level),
    step: String(row.step),
    ...currencyToForm(row.currency),
    monthly_base: fromMinor(row.monthly_base_minor),
    daily_rate: row.daily_rate_minor === null ? '' : fromMinor(row.daily_rate_minor),
    gratuity_points: String(row.gratuity_points),
    is_active: row.is_active,
    effective_from: row.effective_from,
    effective_to: row.effective_to ?? '',
    notes: row.notes ?? '',
  });

export type PayGradeWritePayload = Omit<TablesInsert<'pay_grades'>, 'id' | 'company_id' | 'created_by' | 'updated_by' | 'created_at' | 'updated_at'>;

export const formValuesToPayGradePayload = (values: PayGradeFormValues): PayGradeWritePayload => ({
  code: values.code.trim().toUpperCase(),
  name: values.name.trim(),
  department: nullIfEmpty(values.department),
  rank: nullIfEmpty(values.rank),
  grade_level: Number(values.grade_level),
  step: Number(values.step),
  currency: resolveCurrency(values.currency, values.currency_other) ?? 'EUR',
  monthly_base_minor: toMinor(values.monthly_base) ?? 0,
  daily_rate_minor: values.daily_rate ? toMinor(values.daily_rate) : null,
  gratuity_points: Number(values.gratuity_points),
  is_active: values.is_active,
  effective_from: values.effective_from,
  effective_to: nullIfEmpty(values.effective_to),
  notes: nullIfEmpty(values.notes),
});

/** Department, then level (high → low), then step, then code. */
export const sortPayGrades = <T extends Pick<PayGradeRow, 'department' | 'grade_level' | 'step' | 'code'>>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => {
    const da = a.department ?? '';
    const db = b.department ?? '';
    if (da !== db) return da.localeCompare(db);
    if (a.grade_level !== b.grade_level) return b.grade_level - a.grade_level;
    if (a.step !== b.step) return a.step - b.step;
    return a.code.localeCompare(b.code);
  });

// ---------------------------------------------------------------------------
// Company settings form
// ---------------------------------------------------------------------------

export const companySettingsFormSchema = z.object({
  default_currency: z.string().optional().or(z.literal('')),
  default_currency_other: z.string().optional().or(z.literal('')),
  pay_period_type: z.enum(PAY_PERIOD_TYPES),
  pay_cutoff_day: z.string().refine((v) => /^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 28, 'Cut-off day must be between 1 and 28'),
  pay_day_of_month: z.string().refine((v) => /^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 31, 'Pay day must be between 1 and 31'),
  unpaid_leave_codes: z.array(z.string()),
  travel_days_paid: z.boolean(),
  gratuity_default_method: z.enum(GRATUITY_METHODS),
  gratuity_default_points: z.string().refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, 'Points must be zero or more'),
  rounding_minor: z.enum(['1', '5', '10', '100']),
  payslip_footer: z.string().trim().max(2000).optional().or(z.literal('')),
}).superRefine((values, ctx) => {
  if (!resolveCurrency(values.default_currency, values.default_currency_other)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [values.default_currency === OTHER_CURRENCY ? 'default_currency_other' : 'default_currency'],
      message: 'Enter a 3-letter ISO currency code',
    });
  }
});
export type CompanySettingsFormValues = z.infer<typeof companySettingsFormSchema>;

/** Defaults matching the table defaults, used before the row exists. */
export const defaultCompanySettings = (companyId: string): HrCompanySettingsRow => ({
  company_id: companyId,
  default_currency: 'EUR',
  pay_period_type: 'calendar_month',
  pay_cutoff_day: 25,
  pay_day_of_month: 28,
  unpaid_leave_codes: ['U'],
  travel_days_paid: true,
  gratuity_default_method: 'points_days',
  gratuity_default_points: 1,
  rounding_minor: 1,
  payslip_footer: null,
  updated_by: null,
  updated_at: new Date(0).toISOString(),
});

const asEnum = <T extends readonly string[]>(options: T, value: string, fallback: T[number]): T[number] =>
  (options as readonly string[]).includes(value) ? (value as T[number]) : fallback;

export const companySettingsToFormValues = (row: HrCompanySettingsRow): CompanySettingsFormValues => {
  const { currency, currency_other } = currencyToForm(row.default_currency);
  return {
    default_currency: currency,
    default_currency_other: currency_other,
    pay_period_type: asEnum(PAY_PERIOD_TYPES, row.pay_period_type, 'calendar_month'),
    pay_cutoff_day: String(row.pay_cutoff_day),
    pay_day_of_month: String(row.pay_day_of_month),
    unpaid_leave_codes: [...row.unpaid_leave_codes],
    travel_days_paid: row.travel_days_paid,
    gratuity_default_method: asEnum(GRATUITY_METHODS, row.gratuity_default_method, 'points_days'),
    gratuity_default_points: String(row.gratuity_default_points),
    rounding_minor: asEnum(['1', '5', '10', '100'] as const, String(row.rounding_minor), '1'),
    payslip_footer: row.payslip_footer ?? '',
  };
};

export type CompanySettingsWritePayload = Omit<TablesInsert<'hr_company_settings'>, 'company_id' | 'updated_by' | 'updated_at'>;

export const formValuesToCompanySettingsPayload = (values: CompanySettingsFormValues): CompanySettingsWritePayload => ({
  default_currency: resolveCurrency(values.default_currency, values.default_currency_other) ?? 'EUR',
  pay_period_type: values.pay_period_type,
  pay_cutoff_day: Number(values.pay_cutoff_day),
  pay_day_of_month: Number(values.pay_day_of_month),
  unpaid_leave_codes: values.unpaid_leave_codes,
  travel_days_paid: values.travel_days_paid,
  gratuity_default_method: values.gratuity_default_method,
  gratuity_default_points: Number(values.gratuity_default_points),
  rounding_minor: Number(values.rounding_minor),
  payslip_footer: nullIfEmpty(values.payslip_footer),
});

// ---------------------------------------------------------------------------
// Pay periods
// ---------------------------------------------------------------------------

export interface GeneratedPeriod {
  period_type: 'calendar_month' | 'four_weekly';
  label: string;
  start_date: string;
  end_date: string;
}

export interface GeneratePeriodsInput {
  year: number;
  type: 'calendar_month' | 'four_weekly';
  /** Four-weekly only: the first period starts here (defaults to 1 Jan of `year`). */
  startDate?: string;
}

/**
 * The periods of a year. Calendar months are the twelve months; four-weekly
 * periods run 28 days each from `startDate` for as long as they start within
 * the year.
 */
export const generatePeriods = ({ year, type, startDate }: GeneratePeriodsInput): GeneratedPeriod[] => {
  const out: GeneratedPeriod[] = [];
  if (type === 'calendar_month') {
    for (let m = 0; m < 12; m += 1) {
      const start = startOfMonth(new Date(year, m, 1));
      const end = addDays(addMonths(start, 1), -1);
      out.push({ period_type: type, label: format(start, 'MMMM yyyy'), start_date: format(start, 'yyyy-MM-dd'), end_date: format(end, 'yyyy-MM-dd') });
    }
    return out;
  }
  const parsed = startDate ? parseISO(startDate) : null;
  let start = parsed && isValid(parsed) ? parsed : startOfYear(new Date(year, 0, 1));
  let n = 1;
  while (start.getFullYear() === year) {
    const end = addDays(start, 27);
    out.push({
      period_type: type,
      label: `${year} P${String(n).padStart(2, '0')} (${format(start, 'dd MMM')} – ${format(end, 'dd MMM')})`,
      start_date: format(start, 'yyyy-MM-dd'),
      end_date: format(end, 'yyyy-MM-dd'),
    });
    start = addDays(end, 1);
    n += 1;
  }
  return out;
};

/** Drops generated periods whose start date already exists for the same scope. */
export const skipExistingPeriods = (generated: readonly GeneratedPeriod[], existingStartDates: readonly string[]): GeneratedPeriod[] => {
  const existing = new Set(existingStartDates);
  return generated.filter((p) => !existing.has(p.start_date));
};

/** Which status transitions the Lock / Unlock / Close buttons may perform. */
export const periodTransitions = (status: string): { canLock: boolean; canUnlock: boolean; canClose: boolean } => {
  const s = asPeriodStatus(status);
  return { canLock: s === 'open', canUnlock: s === 'locked', canClose: s === 'open' || s === 'locked' };
};

/** Row → plain JSON for audit_logs. */
export const auditJson = (value: unknown): Json => JSON.parse(JSON.stringify(value ?? null)) as Json;
