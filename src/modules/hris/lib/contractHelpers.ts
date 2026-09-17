import { z } from 'zod';
import { differenceInCalendarDays, isValid, parseISO } from 'date-fns';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { fromMinor, toMinor } from '@/modules/hris/lib/format';

/**
 * Pure helpers for crew employment contracts (SEAs). No React, no Supabase —
 * everything here is unit-testable and shared by the hooks, dialogs and page.
 */

export type CrewContractRow = Tables<'crew_contracts'>;

export const CONTRACT_TYPES = [
  'permanent',
  'fixed_term',
  'rotational',
  'temporary',
  'freelance',
  'probationary',
  'seasonal',
  'daywork',
] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const CONTRACT_STATUSES = ['draft', 'active', 'expired', 'terminated', 'superseded'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const WAGE_FREQUENCIES = ['monthly', 'daily', 'weekly', 'annual'] as const;
export type WageFrequency = (typeof WAGE_FREQUENCIES)[number];

export const CURRENCY_PRESETS = ['EUR', 'USD', 'GBP', 'AED', 'CHF', 'AUD'] as const;
/** Sentinel used by the currency select to reveal the free-text input. */
export const OTHER_CURRENCY = '__other__';

/** Statuses that count as "no longer in force" and belong in the history table. */
export const HISTORICAL_STATUSES: readonly ContractStatus[] = ['expired', 'terminated', 'superseded'];

const isoDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
};

/** Days from `today` to `value` (negative when in the past). */
export const daysBetween = (value: string | null | undefined, today: Date): number | null => {
  const d = isoDate(value);
  return d ? differenceInCalendarDays(d, today) : null;
};

/**
 * The stored status plus the one derivation the database does not do for us:
 * an `active` contract whose end date has passed is shown as `expired`.
 */
export const deriveContractStatus = (
  contract: Pick<CrewContractRow, 'status' | 'end_date'>,
  today: Date = new Date(),
): ContractStatus => {
  const status = (CONTRACT_STATUSES as readonly string[]).includes(contract.status) ? (contract.status as ContractStatus) : 'draft';
  if (status !== 'active') return status;
  const days = daysBetween(contract.end_date, today);
  return days !== null && days < 0 ? 'expired' : 'active';
};

export const isContractInForce = (contract: Pick<CrewContractRow, 'status' | 'end_date'>, today: Date = new Date()): boolean =>
  deriveContractStatus(contract, today) === 'active';

export type SignatureState = 'unsigned' | 'awaiting_crew' | 'awaiting_company' | 'signed';

export const signatureState = (
  contract: Pick<CrewContractRow, 'signed_by_crew_at' | 'signed_by_company_at'>,
): SignatureState => {
  const crew = Boolean(contract.signed_by_crew_at);
  const company = Boolean(contract.signed_by_company_at);
  if (crew && company) return 'signed';
  if (crew) return 'awaiting_company';
  if (company) return 'awaiting_crew';
  return 'unsigned';
};

export const SIGNATURE_LABEL: Record<SignatureState, string> = {
  unsigned: 'Not signed',
  awaiting_crew: 'Awaiting crew signature',
  awaiting_company: 'Awaiting company signature',
  signed: 'Fully signed',
};

export const STATUS_BADGE_CLASS: Record<ContractStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  active: 'bg-green-500/10 text-green-600 border-green-500/20',
  expired: 'bg-destructive/10 text-destructive border-destructive/20',
  terminated: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  superseded: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
};

/** Newest first: by start_date, then created_at. */
export const sortContractsNewestFirst = <T extends Pick<CrewContractRow, 'start_date' | 'created_at'>>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => {
    if (a.start_date !== b.start_date) return a.start_date < b.start_date ? 1 : -1;
    return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
  });

/**
 * Splits a crew member's contracts into the one shown on the card and the
 * rest. The card prefers the in-force contract, then the newest draft, then
 * whatever is most recent, so a crew member with only history still sees
 * something useful.
 */
export const pickCurrentContract = <T extends CrewContractRow>(rows: readonly T[], today: Date = new Date()) => {
  const sorted = sortContractsNewestFirst(rows);
  const current =
    sorted.find((c) => deriveContractStatus(c, today) === 'active') ??
    sorted.find((c) => c.status === 'draft') ??
    sorted[0] ??
    null;
  return { current, history: sorted.filter((c) => c !== current) };
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ContractDateInput {
  start_date: string;
  end_date?: string | null;
  probation_end_date?: string | null;
}

export interface ContractDateIssue {
  field: 'start_date' | 'end_date' | 'probation_end_date';
  message: string;
}

/** Cross-field date rules: end ≥ start, probation between start and end. */
export const validateContractDates = (input: ContractDateInput): ContractDateIssue[] => {
  const issues: ContractDateIssue[] = [];
  const start = isoDate(input.start_date);
  if (!start) {
    issues.push({ field: 'start_date', message: 'Start date is required' });
    return issues;
  }
  const end = isoDate(input.end_date);
  if (input.end_date && !end) issues.push({ field: 'end_date', message: 'End date is not a valid date' });
  if (end && end < start) issues.push({ field: 'end_date', message: 'End date must be on or after the start date' });

  const probation = isoDate(input.probation_end_date);
  if (input.probation_end_date && !probation) {
    issues.push({ field: 'probation_end_date', message: 'Probation end is not a valid date' });
  }
  if (probation) {
    if (probation < start) issues.push({ field: 'probation_end_date', message: 'Probation must end on or after the start date' });
    else if (end && probation > end) issues.push({ field: 'probation_end_date', message: 'Probation must end on or before the end date' });
  }
  return issues;
};

const optionalText = z.string().trim().max(500).optional().or(z.literal(''));
const optionalDate = z.string().optional().or(z.literal(''));

export const contractFormSchema = z
  .object({
    contract_type: z.enum(CONTRACT_TYPES),
    status: z.enum(['draft', 'active']),
    contract_number: optionalText,
    vessel_id: z.string().optional().or(z.literal('')),
    position: optionalText,
    department: optionalText,
    rank: optionalText,
    start_date: z.string().min(1, 'Start date is required'),
    end_date: optionalDate,
    probation_end_date: optionalDate,
    rotation_pattern: optionalText,
    notice_period_days: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((v) => !v || /^\d{1,4}$/.test(v), 'Notice period must be a whole number of days'),
    sea_reference: optionalText,
    flag_state: optionalText,
    governing_law: optionalText,
    wage_currency: z.string().optional().or(z.literal('')),
    wage_currency_other: z.string().optional().or(z.literal('')),
    base_wage: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((v) => !v || (Number.isFinite(Number(v)) && Number(v) >= 0), 'Wage must be a non-negative number'),
    wage_frequency: z.enum(WAGE_FREQUENCIES).optional().or(z.literal('')),
    signed_by_crew_at: optionalDate,
    signed_by_company_at: optionalDate,
    notes: z.string().trim().max(4000).optional().or(z.literal('')),
  })
  .superRefine((values, ctx) => {
    const dates: ContractDateInput = {
      start_date: values.start_date ?? '',
      end_date: values.end_date,
      probation_end_date: values.probation_end_date,
    };
    for (const issue of validateContractDates(dates)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [issue.field], message: issue.message });
    }
    const currency = resolveCurrency(values.wage_currency, values.wage_currency_other);
    if (values.wage_currency === OTHER_CURRENCY && !currency) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['wage_currency_other'], message: 'Enter a 3-letter ISO currency code' });
    }
    if (values.base_wage && !currency) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['wage_currency'], message: 'Choose a currency for the wage' });
    }
  });

export type ContractFormValues = z.infer<typeof contractFormSchema>;

/** Picks the currency from the select, or the free-text field when "Other" is chosen. */
export const resolveCurrency = (selected: string | undefined, other: string | undefined): string | null => {
  const code = selected === OTHER_CURRENCY ? other : selected;
  const normalised = (code ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalised) ? normalised : null;
};

const nullIfEmpty = (value: string | undefined): string | null => {
  const v = (value ?? '').trim();
  return v ? v : null;
};

/** A date input value → ISO timestamp (midnight local) for timestamptz columns. */
const dateToTimestamp = (value: string | undefined): string | null => {
  const v = nullIfEmpty(value);
  if (!v) return null;
  const d = parseISO(v);
  return isValid(d) ? d.toISOString() : null;
};

const timestampToDate = (value: string | null): string => {
  if (!value) return '';
  const d = parseISO(value);
  return isValid(d) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
};

export const emptyContractFormValues = (defaults: Partial<ContractFormValues> = {}): ContractFormValues => ({
  contract_type: 'rotational',
  status: 'draft',
  contract_number: '',
  vessel_id: '',
  position: '',
  department: '',
  rank: '',
  start_date: '',
  end_date: '',
  probation_end_date: '',
  rotation_pattern: '',
  notice_period_days: '',
  sea_reference: '',
  flag_state: '',
  governing_law: '',
  wage_currency: 'EUR',
  wage_currency_other: '',
  base_wage: '',
  wage_frequency: 'monthly',
  signed_by_crew_at: '',
  signed_by_company_at: '',
  notes: '',
  ...defaults,
});

/** Maps a stored contract into form values (money shown in major units). */
export const contractToFormValues = (contract: CrewContractRow): ContractFormValues => {
  const currency = contract.wage_currency?.trim().toUpperCase() ?? '';
  const preset = (CURRENCY_PRESETS as readonly string[]).includes(currency);
  return emptyContractFormValues({
    contract_type: (CONTRACT_TYPES as readonly string[]).includes(contract.contract_type) ? (contract.contract_type as ContractType) : 'rotational',
    status: contract.status === 'active' ? 'active' : 'draft',
    contract_number: contract.contract_number ?? '',
    vessel_id: contract.vessel_id ?? '',
    position: contract.position ?? '',
    department: contract.department ?? '',
    rank: contract.rank ?? '',
    start_date: contract.start_date,
    end_date: contract.end_date ?? '',
    probation_end_date: contract.probation_end_date ?? '',
    rotation_pattern: contract.rotation_pattern ?? '',
    notice_period_days: contract.notice_period_days === null ? '' : String(contract.notice_period_days),
    sea_reference: contract.sea_reference ?? '',
    flag_state: contract.flag_state ?? '',
    governing_law: contract.governing_law ?? '',
    wage_currency: currency ? (preset ? currency : OTHER_CURRENCY) : 'EUR',
    wage_currency_other: currency && !preset ? currency : '',
    base_wage: fromMinor(contract.base_wage_minor),
    wage_frequency: (WAGE_FREQUENCIES as readonly string[]).includes(contract.wage_frequency ?? '')
      ? (contract.wage_frequency as WageFrequency)
      : 'monthly',
    signed_by_crew_at: timestampToDate(contract.signed_by_crew_at),
    signed_by_company_at: timestampToDate(contract.signed_by_company_at),
    notes: contract.notes ?? '',
  });
};

/** The column subset a form write produces (everything except ids/audit columns). */
export type ContractWritePayload = Omit<
  TablesInsert<'crew_contracts'>,
  'id' | 'company_id' | 'profile_id' | 'created_by' | 'updated_by' | 'created_at' | 'updated_at' | 'document_path' | 'document_name' | 'supersedes_contract_id' | 'termination_reason' | 'terminated_at'
>;

/** Maps validated form values into a row payload (money converted to minor units). */
export const formValuesToPayload = (values: ContractFormValues): ContractWritePayload => {
  const currency = resolveCurrency(values.wage_currency, values.wage_currency_other);
  const wageMinor = values.base_wage ? toMinor(values.base_wage) : null;
  return {
    contract_type: values.contract_type,
    status: values.status,
    contract_number: nullIfEmpty(values.contract_number),
    vessel_id: nullIfEmpty(values.vessel_id),
    position: nullIfEmpty(values.position),
    department: nullIfEmpty(values.department),
    rank: nullIfEmpty(values.rank),
    start_date: values.start_date,
    end_date: nullIfEmpty(values.end_date),
    probation_end_date: nullIfEmpty(values.probation_end_date),
    rotation_pattern: nullIfEmpty(values.rotation_pattern),
    notice_period_days: values.notice_period_days ? Number(values.notice_period_days) : null,
    sea_reference: nullIfEmpty(values.sea_reference),
    flag_state: nullIfEmpty(values.flag_state),
    governing_law: nullIfEmpty(values.governing_law),
    wage_currency: currency,
    base_wage_minor: wageMinor,
    wage_frequency: wageMinor === null ? null : values.wage_frequency || null,
    signed_by_crew_at: dateToTimestamp(values.signed_by_crew_at),
    signed_by_company_at: dateToTimestamp(values.signed_by_company_at),
    notes: nullIfEmpty(values.notes),
  };
};

// ---------------------------------------------------------------------------
// Overview KPIs
// ---------------------------------------------------------------------------

export interface ExpiryItemLike {
  item_type: string | null;
  profile_id: string | null;
  days_remaining: number | null;
}

export interface ContractKpis {
  activeContracts: number;
  expiring30: number;
  expiring90: number;
  missingContract: number;
  probationEnding30: number;
}

/**
 * Overview tile numbers. `crewProfileIds` is the set of crew in the directory
 * (active people), used to find who has no in-force contract at all.
 */
export const computeContractKpis = (
  contracts: readonly Pick<CrewContractRow, 'status' | 'end_date' | 'profile_id' | 'probation_end_date'>[],
  crewProfileIds: readonly string[],
  today: Date = new Date(),
): ContractKpis => {
  const inForce = contracts.filter((c) => deriveContractStatus(c, today) === 'active');
  const covered = new Set(inForce.map((c) => c.profile_id));
  const within = (value: string | null, max: number) => {
    const d = daysBetween(value, today);
    return d !== null && d >= 0 && d <= max;
  };
  return {
    activeContracts: inForce.length,
    expiring30: inForce.filter((c) => within(c.end_date, 30)).length,
    expiring90: inForce.filter((c) => within(c.end_date, 90)).length,
    missingContract: crewProfileIds.filter((id) => !covered.has(id)).length,
    probationEnding30: inForce.filter((c) => within(c.probation_end_date, 30)).length,
  };
};

export interface CompanyContractFilters {
  status: ContractStatus | 'all';
  vesselId: string | 'all' | 'none';
  expiringWithinDays: number | null;
  search: string;
}

export const DEFAULT_CONTRACT_FILTERS: CompanyContractFilters = {
  status: 'all',
  vesselId: 'all',
  expiringWithinDays: null,
  search: '',
};

/** Client-side filter for the company contracts table. */
export const filterCompanyContracts = <T extends CrewContractRow & { crew_name: string; vessel_name: string | null }>(
  rows: readonly T[],
  filters: CompanyContractFilters,
  today: Date = new Date(),
): T[] => {
  const needle = filters.search.trim().toLowerCase();
  return rows.filter((c) => {
    if (filters.status !== 'all' && deriveContractStatus(c, today) !== filters.status) return false;
    if (filters.vesselId === 'none' && c.vessel_id) return false;
    if (filters.vesselId !== 'all' && filters.vesselId !== 'none' && c.vessel_id !== filters.vesselId) return false;
    if (filters.expiringWithinDays !== null) {
      const d = daysBetween(c.end_date, today);
      if (d === null || d > filters.expiringWithinDays || deriveContractStatus(c, today) !== 'active') return false;
    }
    if (needle) {
      const hay = [c.crew_name, c.vessel_name, c.contract_number, c.position, c.rank, c.sea_reference, c.contract_type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
};

/** Fields worth recording in audit_logs old/new values. */
export const auditSnapshot = (contract: Partial<CrewContractRow>): Record<string, string | number | null> => ({
  contract_type: contract.contract_type ?? null,
  contract_number: contract.contract_number ?? null,
  status: contract.status ?? null,
  vessel_id: contract.vessel_id ?? null,
  start_date: contract.start_date ?? null,
  end_date: contract.end_date ?? null,
  probation_end_date: contract.probation_end_date ?? null,
  position: contract.position ?? null,
  rank: contract.rank ?? null,
  wage_currency: contract.wage_currency ?? null,
  base_wage_minor: contract.base_wage_minor ?? null,
  wage_frequency: contract.wage_frequency ?? null,
  terminated_at: contract.terminated_at ?? null,
  termination_reason: contract.termination_reason ?? null,
  document_name: contract.document_name ?? null,
});
