import { differenceInCalendarDays, isValid, parseISO } from 'date-fns';
import { z } from 'zod';
import type { Tables } from '@/integrations/supabase/types';

/**
 * Pure helpers for Compliance & Right to Work: per-crew compliance status,
 * the company matrix, CSV export and the "which authorisations does this
 * itinerary need" heuristic.
 */

export type WorkAuthorisationRow = Tables<'crew_work_authorisations'>;
export type HrExpiryItemRow = Tables<'hr_expiry_items'>;

export type AuthorisationType = 'visa' | 'work_permit' | 'residence_permit' | 'seamans_book' | 'flag_endorsement' | 'schengen' | 'b1_b2' | 'c1_d' | 'other';
export type AuthorisationStatus = 'valid' | 'pending' | 'expired' | 'revoked';
export type AuthorisationEntries = 'single' | 'multiple';

export const AUTHORISATION_TYPES: readonly AuthorisationType[] = ['visa', 'work_permit', 'residence_permit', 'seamans_book', 'flag_endorsement', 'schengen', 'b1_b2', 'c1_d', 'other'];
export const AUTHORISATION_STATUSES: readonly AuthorisationStatus[] = ['valid', 'pending', 'expired', 'revoked'];

export const AUTHORISATION_TYPE_LABELS: Record<AuthorisationType, string> = {
  visa: 'Visa',
  work_permit: 'Work permit',
  residence_permit: 'Residence permit',
  seamans_book: "Seaman's book",
  flag_endorsement: 'Flag endorsement',
  schengen: 'Schengen visa',
  b1_b2: 'US B1/B2',
  c1_d: 'US C1/D',
  other: 'Other',
};

export const AUTHORISATION_STATUS_LABELS: Record<AuthorisationStatus, string> = {
  valid: 'Valid',
  pending: 'Pending',
  expired: 'Expired',
  revoked: 'Revoked',
};

export const isAuthorisationType = (v: unknown): v is AuthorisationType => typeof v === 'string' && (AUTHORISATION_TYPES as readonly string[]).includes(v);
export const authorisationTypeLabel = (v: string): string => (isAuthorisationType(v) ? AUTHORISATION_TYPE_LABELS[v] : v.replace(/_/g, ' '));

// ---------------------------------------------------------------------------
// Compliance status
// ---------------------------------------------------------------------------

/** Ordered from worst to best. `missing` is the least severe: absence is a data gap, not a lapse. */
export type ComplianceStatus = 'expired' | 'critical' | 'warning' | 'ok' | 'missing';

export const COMPLIANCE_ORDER: readonly ComplianceStatus[] = ['expired', 'critical', 'warning', 'ok', 'missing'];
const RANK: Record<ComplianceStatus, number> = { expired: 0, critical: 1, warning: 2, ok: 3, missing: 4 };

export const COMPLIANCE_LABELS: Record<ComplianceStatus, string> = {
  expired: 'Expired',
  critical: 'Expires within 30 days',
  warning: 'Expires within 90 days',
  ok: 'Valid',
  missing: 'Not recorded',
};

export const CRITICAL_DAYS = 30;
export const WARNING_DAYS = 90;

export const statusFromDays = (days: number | null | undefined): ComplianceStatus => {
  if (days === null || days === undefined || !Number.isFinite(days)) return 'missing';
  if (days < 0) return 'expired';
  if (days <= CRITICAL_DAYS) return 'critical';
  if (days <= WARNING_DAYS) return 'warning';
  return 'ok';
};

export const daysUntilDate = (value: string | null | undefined, today: Date = new Date()): number | null => {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? differenceInCalendarDays(d, today) : null;
};

export const statusFromDate = (value: string | null | undefined, today: Date = new Date()): ComplianceStatus => statusFromDays(daysUntilDate(value, today));

/** Worst of the given statuses; `missing` when the list is empty. */
export const worstStatus = (statuses: readonly ComplianceStatus[]): ComplianceStatus => {
  if (statuses.length === 0) return 'missing';
  return statuses.reduce((worst, s) => (RANK[s] < RANK[worst] ? s : worst), statuses[0]);
};

export const compareStatus = (a: ComplianceStatus, b: ComplianceStatus): number => RANK[a] - RANK[b];

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

export type MatrixColumn = 'passport' | 'visa' | 'medical' | 'authorisations' | 'certificates';
export const MATRIX_COLUMNS: readonly MatrixColumn[] = ['passport', 'visa', 'medical', 'authorisations', 'certificates'];
export const MATRIX_COLUMN_LABELS: Record<MatrixColumn, string> = {
  passport: 'Passport',
  visa: 'Visa',
  medical: 'Medical',
  authorisations: 'Authorisations',
  certificates: 'Certificates',
};

export interface MatrixCellItem {
  label: string;
  dueDate: string | null;
  days: number | null;
  status: ComplianceStatus;
}

export interface MatrixCell {
  status: ComplianceStatus;
  items: MatrixCellItem[];
  /** Soonest days remaining across items, null when none dated. */
  soonestDays: number | null;
}

export interface MatrixDirectoryEntry {
  id: string;
  user_id: string | null;
  displayName: string;
  rank: string | null;
  department: string | null;
  vessel_id: string | null;
  vessel_name: string | null;
  nationality: string | null;
}

export interface MatrixRow {
  profileId: string;
  userId: string | null;
  name: string;
  rank: string | null;
  department: string | null;
  vesselId: string | null;
  vesselName: string | null;
  nationality: string | null;
  cells: Record<MatrixColumn, MatrixCell>;
  /** Worst status across the selected columns. */
  overall: ComplianceStatus;
  /** Soonest expiry across all columns. */
  soonestDays: number | null;
  /** No lapses, nothing due within 90 days, passport and medical recorded. */
  fullyCompliant: boolean;
}

const emptyCell = (): MatrixCell => ({ status: 'missing', items: [], soonestDays: null });

const cellFromItems = (items: MatrixCellItem[]): MatrixCell => {
  if (items.length === 0) return emptyCell();
  const sorted = [...items].sort((a, b) => (a.days ?? Number.POSITIVE_INFINITY) - (b.days ?? Number.POSITIVE_INFINITY));
  const dated = sorted.filter((i) => i.days !== null);
  return { status: worstStatus(sorted.map((i) => i.status)), items: sorted, soonestDays: dated.length ? dated[0].days : null };
};

const EXPIRY_TYPE_TO_COLUMN: Record<string, MatrixColumn> = {
  passport: 'passport',
  visa: 'visa',
  medical: 'medical',
  certificate: 'certificates',
  work_authorisation: 'authorisations',
};

export interface BuildMatrixInput {
  directory: readonly MatrixDirectoryEntry[];
  /** hr_expiry_items rows for passport / visa / medical / certificate / work_authorisation. */
  expiryItems: readonly Pick<HrExpiryItemRow, 'item_type' | 'profile_id' | 'label' | 'due_date' | 'days_remaining'>[];
  /** Authorisations that have no expiry (open-ended) still count as valid. */
  authorisations: readonly Pick<WorkAuthorisationRow, 'profile_id' | 'authorisation_type' | 'country' | 'expiry_date' | 'status'>[];
  /** Which columns feed the overall status (default: all). */
  columns?: readonly MatrixColumn[];
  today?: Date;
}

/** Builds one row per directory entry. */
export const buildMatrix = (input: BuildMatrixInput): MatrixRow[] => {
  const today = input.today ?? new Date();
  const columns = input.columns && input.columns.length ? input.columns : MATRIX_COLUMNS;
  const perProfile = new Map<string, Record<MatrixColumn, MatrixCellItem[]>>();
  const bucket = (profileId: string): Record<MatrixColumn, MatrixCellItem[]> => {
    let b = perProfile.get(profileId);
    if (!b) {
      b = { passport: [], visa: [], medical: [], authorisations: [], certificates: [] };
      perProfile.set(profileId, b);
    }
    return b;
  };

  for (const item of input.expiryItems) {
    if (!item.profile_id || !item.item_type) continue;
    const column = EXPIRY_TYPE_TO_COLUMN[item.item_type];
    if (!column) continue;
    const days = item.days_remaining ?? daysUntilDate(item.due_date, today);
    bucket(item.profile_id)[column].push({ label: item.label ?? column, dueDate: item.due_date, days, status: statusFromDays(days) });
  }

  // Authorisations without an expiry (or whose row isn't in the feed) still appear.
  const seenAuth = new Set<string>();
  for (const b of perProfile.values()) for (const i of b.authorisations) seenAuth.add(`${i.label}|${i.dueDate ?? ''}`);
  for (const a of input.authorisations) {
    if (a.status === 'revoked') continue;
    const label = `${a.authorisation_type} · ${a.country}`;
    const key = `${label}|${a.expiry_date ?? ''}`;
    if (a.status === 'expired') {
      bucket(a.profile_id).authorisations.push({ label, dueDate: a.expiry_date, days: daysUntilDate(a.expiry_date, today) ?? -1, status: 'expired' });
      continue;
    }
    if (seenAuth.has(key)) continue;
    const days = daysUntilDate(a.expiry_date, today);
    bucket(a.profile_id).authorisations.push({ label, dueDate: a.expiry_date, days, status: a.expiry_date ? statusFromDays(days) : 'ok' });
  }

  return input.directory.map((e) => {
    const b = perProfile.get(e.id) ?? { passport: [], visa: [], medical: [], authorisations: [], certificates: [] };
    const cells: Record<MatrixColumn, MatrixCell> = {
      passport: cellFromItems(b.passport),
      visa: cellFromItems(b.visa),
      medical: cellFromItems(b.medical),
      authorisations: cellFromItems(b.authorisations),
      certificates: cellFromItems(b.certificates),
    };
    const considered = columns.map((c) => cells[c].status);
    const overall = worstStatus(considered);
    const dated = columns.map((c) => cells[c].soonestDays).filter((d): d is number => d !== null);
    const soonestDays = dated.length ? Math.min(...dated) : null;
    const fullyCompliant =
      cells.passport.status === 'ok' &&
      cells.medical.status === 'ok' &&
      MATRIX_COLUMNS.every((c) => cells[c].status === 'ok' || cells[c].status === 'missing');
    return {
      profileId: e.id,
      userId: e.user_id,
      name: e.displayName,
      rank: e.rank,
      department: e.department,
      vesselId: e.vessel_id,
      vesselName: e.vessel_name,
      nationality: e.nationality,
      cells,
      overall,
      soonestDays,
      fullyCompliant,
    };
  });
};

export interface MatrixFilters {
  vesselId: string | 'all';
  department: string | 'all';
  /** Columns that feed the overall status and the withinDays filter. */
  columns: MatrixColumn[];
  /** Only crew with something due within N days (or already expired); null = everyone. */
  withinDays: number | null;
  /** Only crew with this overall status; 'all' = everyone. */
  status: ComplianceStatus | 'all';
  search: string;
}

export const DEFAULT_MATRIX_FILTERS: MatrixFilters = { vesselId: 'all', department: 'all', columns: [...MATRIX_COLUMNS], withinDays: null, status: 'all', search: '' };

export const filterMatrix = (rows: readonly MatrixRow[], filters: MatrixFilters): MatrixRow[] => {
  const q = filters.search.trim().toLowerCase();
  const columns = filters.columns.length ? filters.columns : MATRIX_COLUMNS;
  return rows.filter((r) => {
    if (filters.vesselId !== 'all' && r.vesselId !== filters.vesselId) return false;
    if (filters.department !== 'all' && (r.department ?? '').toLowerCase() !== filters.department.toLowerCase()) return false;
    if (q && !`${r.name} ${r.rank ?? ''} ${r.vesselName ?? ''} ${r.nationality ?? ''}`.toLowerCase().includes(q)) return false;
    const overall = worstStatus(columns.map((c) => r.cells[c].status));
    if (filters.status !== 'all' && overall !== filters.status) return false;
    if (filters.withinDays !== null) {
      const dated = columns.map((c) => r.cells[c].soonestDays).filter((d): d is number => d !== null);
      if (dated.length === 0 || Math.min(...dated) > filters.withinDays) return false;
    }
    return true;
  });
};

/** Worst first, then soonest expiry, then name. */
export const sortByWorst = (rows: readonly MatrixRow[]): MatrixRow[] =>
  [...rows].sort((a, b) => compareStatus(a.overall, b.overall) || (a.soonestDays ?? Number.POSITIVE_INFINITY) - (b.soonestDays ?? Number.POSITIVE_INFINITY) || a.name.localeCompare(b.name));

export interface RtwKpis {
  fullyCompliant: number;
  expired: number;
  within30: number;
  within90: number;
  missingPassportOrMedical: number;
}

export const computeRtwKpis = (rows: readonly MatrixRow[]): RtwKpis => {
  let expired = 0;
  let within30 = 0;
  let within90 = 0;
  for (const r of rows) {
    for (const c of MATRIX_COLUMNS) {
      for (const i of r.cells[c].items) {
        if (i.status === 'expired') expired += 1;
        else if (i.status === 'critical') within30 += 1;
        else if (i.status === 'warning') within90 += 1;
      }
    }
  }
  return {
    fullyCompliant: rows.filter((r) => r.fullyCompliant).length,
    expired,
    within30,
    within90,
    missingPassportOrMedical: rows.filter((r) => r.cells.passport.status === 'missing' || r.cells.medical.status === 'missing').length,
  };
};

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const csvEscape = (value: string | number | null | undefined): string => {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const cellSummary = (cell: MatrixCell): string => {
  if (cell.items.length === 0) return 'Not recorded';
  return cell.items.map((i) => `${i.label}${i.dueDate ? ` (${i.dueDate})` : ''}`).join('; ');
};

export const matrixToCsv = (rows: readonly MatrixRow[]): string => {
  const header = ['Crew', 'Rank', 'Department', 'Vessel', 'Nationality', 'Overall', ...MATRIX_COLUMNS.flatMap((c) => [`${MATRIX_COLUMN_LABELS[c]} status`, `${MATRIX_COLUMN_LABELS[c]} detail`])];
  const lines = rows.map((r) =>
    [
      r.name,
      r.rank,
      r.department,
      r.vesselName,
      r.nationality,
      COMPLIANCE_LABELS[r.overall],
      ...MATRIX_COLUMNS.flatMap((c) => [COMPLIANCE_LABELS[r.cells[c].status], cellSummary(r.cells[c])]),
    ]
      .map(csvEscape)
      .join(','),
  );
  return [header.map(csvEscape).join(','), ...lines].join('\r\n');
};

// ---------------------------------------------------------------------------
// Required-for-itinerary heuristic
// ---------------------------------------------------------------------------

export type ItineraryRegion = 'us' | 'schengen' | 'uk' | 'caribbean' | 'australia';

export const ITINERARY_REGION_LABELS: Record<ItineraryRegion, string> = {
  us: 'United States',
  schengen: 'Schengen area',
  uk: 'United Kingdom',
  caribbean: 'Caribbean',
  australia: 'Australia',
};

export interface RequiredAuthorisationRule {
  region: ItineraryRegion;
  /** Any one of these satisfies the rule. */
  anyOf: AuthorisationType[];
  /** Nationalities (lower-case fragments) that do not need it. */
  exemptNationalities: string[];
  note: string;
}

const EU_NATIONALITIES = [
  'austria', 'belgi', 'bulgar', 'croat', 'cypr', 'czech', 'danish', 'denmark', 'eston', 'finn', 'finland', 'french', 'france', 'german', 'greek', 'greece',
  'hungar', 'iceland', 'irish', 'ireland', 'ital', 'latvi', 'liechtenstein', 'lithuan', 'luxembourg', 'malt', 'dutch', 'netherlands', 'norw', 'polish', 'poland',
  'portug', 'roman', 'slovak', 'sloven', 'spanish', 'spain', 'swed', 'swiss', 'switzerland',
];

/** Simple configurable table. Match is a case-insensitive substring against the nationality string. */
export const REQUIRED_AUTHORISATION_RULES: readonly RequiredAuthorisationRule[] = [
  { region: 'us', anyOf: ['b1_b2', 'c1_d'], exemptNationalities: ['american', 'united states', 'usa', 'u.s.'], note: 'US B1/B2 or C1/D visa for crew joining or working in US waters.' },
  { region: 'schengen', anyOf: ['schengen', 'residence_permit'], exemptNationalities: EU_NATIONALITIES, note: 'Schengen visa (or EU residence permit) for non-EU/EEA nationals.' },
  { region: 'uk', anyOf: ['visa', 'residence_permit', 'work_permit'], exemptNationalities: ['british', 'united kingdom', 'uk', 'irish', 'ireland'], note: 'UK visa or permission for non-UK/Irish nationals working in UK waters.' },
  { region: 'australia', anyOf: ['visa', 'work_permit'], exemptNationalities: ['australian', 'australia'], note: 'Australian Maritime Crew Visa (or equivalent) for foreign crew.' },
  { region: 'caribbean', anyOf: ['seamans_book'], exemptNationalities: [], note: "A seaman's book is normally sufficient for crew movements in the Caribbean." },
];

export const nationalityMatches = (nationality: string | null | undefined, fragments: readonly string[]): boolean => {
  const n = (nationality ?? '').trim().toLowerCase();
  if (!n) return false;
  return fragments.some((f) => n.includes(f));
};

export interface RequiredAuthorisationResult {
  rule: RequiredAuthorisationRule;
  required: boolean;
  /** The authorisation that satisfies it, when one is valid. */
  satisfiedBy: Pick<WorkAuthorisationRow, 'authorisation_type' | 'country' | 'expiry_date' | 'status'> | null;
  status: 'ok' | 'missing' | 'exempt' | 'lapsed';
}

export const requiredAuthorisationsFor = (input: {
  regions: readonly ItineraryRegion[];
  nationality: string | null | undefined;
  authorisations: readonly Pick<WorkAuthorisationRow, 'authorisation_type' | 'country' | 'expiry_date' | 'status'>[];
  rules?: readonly RequiredAuthorisationRule[];
  today?: Date;
}): RequiredAuthorisationResult[] => {
  const rules = input.rules ?? REQUIRED_AUTHORISATION_RULES;
  const today = input.today ?? new Date();
  return input.regions
    .map((region) => rules.find((r) => r.region === region))
    .filter((r): r is RequiredAuthorisationRule => Boolean(r))
    .map((rule) => {
      if (nationalityMatches(input.nationality, rule.exemptNationalities)) return { rule, required: false, satisfiedBy: null, status: 'exempt' as const };
      const candidates = input.authorisations.filter((a) => (rule.anyOf as string[]).includes(a.authorisation_type));
      const live = candidates.find((a) => a.status === 'valid' && (!a.expiry_date || (daysUntilDate(a.expiry_date, today) ?? -1) >= 0));
      if (live) return { rule, required: true, satisfiedBy: live, status: 'ok' as const };
      if (candidates.length) return { rule, required: true, satisfiedBy: candidates[0], status: 'lapsed' as const };
      return { rule, required: true, satisfiedBy: null, status: 'missing' as const };
    });
};

// ---------------------------------------------------------------------------
// Form schema
// ---------------------------------------------------------------------------

const optionalText = z.string().trim().max(200).optional().or(z.literal(''));
const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional().or(z.literal(''));

export const authorisationFormSchema = z
  .object({
    authorisation_type: z.enum(['visa', 'work_permit', 'residence_permit', 'seamans_book', 'flag_endorsement', 'schengen', 'b1_b2', 'c1_d', 'other']),
    country: z.string().trim().min(1, 'Country is required').max(100),
    reference_number: optionalText,
    issued_date: optionalDate,
    expiry_date: optionalDate,
    entries: z.enum(['single', 'multiple', 'none']),
    status: z.enum(['valid', 'pending', 'expired', 'revoked']),
    notes: z.string().trim().max(2000).optional().or(z.literal('')),
  })
  .refine((v) => !v.issued_date || !v.expiry_date || v.expiry_date >= v.issued_date, { message: 'Expiry must be on or after the issue date', path: ['expiry_date'] });

export type AuthorisationFormValues = z.infer<typeof authorisationFormSchema>;

export interface AuthorisationPayload {
  authorisation_type: AuthorisationType;
  country: string;
  reference_number: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  entries: AuthorisationEntries | null;
  status: AuthorisationStatus;
  notes: string | null;
}

export const authorisationFormToPayload = (v: AuthorisationFormValues): AuthorisationPayload => ({
  authorisation_type: v.authorisation_type,
  country: v.country.trim(),
  reference_number: v.reference_number?.trim() || null,
  issued_date: v.issued_date || null,
  expiry_date: v.expiry_date || null,
  entries: v.entries === 'none' ? null : v.entries,
  status: v.status,
  notes: v.notes?.trim() || null,
});

export const authorisationToFormValues = (row: WorkAuthorisationRow | null | undefined): AuthorisationFormValues => ({
  authorisation_type: isAuthorisationType(row?.authorisation_type) ? row.authorisation_type : 'visa',
  country: row?.country ?? '',
  reference_number: row?.reference_number ?? '',
  issued_date: row?.issued_date ?? '',
  expiry_date: row?.expiry_date ?? '',
  entries: row?.entries === 'single' || row?.entries === 'multiple' ? row.entries : 'none',
  status: (AUTHORISATION_STATUSES as readonly string[]).includes(row?.status ?? '') ? (row?.status as AuthorisationStatus) : 'valid',
  notes: row?.notes ?? '',
});

/** Effective status of an authorisation row, letting the date override a stale 'valid'. */
export const authorisationEffectiveStatus = (row: Pick<WorkAuthorisationRow, 'status' | 'expiry_date'>, today: Date = new Date()): ComplianceStatus | 'pending' | 'revoked' => {
  if (row.status === 'revoked') return 'revoked';
  if (row.status === 'pending') return 'pending';
  if (row.status === 'expired') return 'expired';
  if (!row.expiry_date) return 'ok';
  return statusFromDate(row.expiry_date, today);
};
