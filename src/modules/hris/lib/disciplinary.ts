import { addMonths, differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';
import { z } from 'zod';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';

/**
 * Pure helpers for Disciplinary Matters (disciplinary_records). Anything
 * date-sensitive takes `today` so it can be unit-tested deterministically.
 */

export type DisciplinaryRecordRow = Tables<'disciplinary_records'>;
export type DisciplinarySelfRow = Tables<'disciplinary_records_self'>;

export const DISCIPLINARY_CATEGORIES = ['conduct', 'safety', 'performance', 'attendance', 'substance', 'harassment', 'damage', 'other'] as const;
export type DisciplinaryCategory = (typeof DISCIPLINARY_CATEGORIES)[number];

export const DISCIPLINARY_SEVERITIES = ['minor', 'serious', 'gross'] as const;
export type DisciplinarySeverity = (typeof DISCIPLINARY_SEVERITIES)[number];

export const DISCIPLINARY_STAGES = [
  'investigation',
  'no_action',
  'verbal_warning',
  'written_warning',
  'final_warning',
  'suspension',
  'demotion',
  'dismissal',
] as const;
export type DisciplinaryStage = (typeof DISCIPLINARY_STAGES)[number];

export const APPEAL_STATUSES = ['none', 'lodged', 'upheld', 'overturned'] as const;
export type AppealStatus = (typeof APPEAL_STATUSES)[number];

export const RECORD_STATUSES = ['open', 'closed', 'expired', 'overturned'] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

/** Stages that constitute a warning on file. */
export const WARNING_STAGES: readonly DisciplinaryStage[] = ['verbal_warning', 'written_warning', 'final_warning'];

/** Progressive-discipline ladder, lowest rung first. */
export const PROGRESSIVE_LADDER: readonly DisciplinaryStage[] = ['verbal_warning', 'written_warning', 'final_warning', 'dismissal'];

/** Typical "live until" period for each warning stage, in months. */
export const DEFAULT_EXPIRY_MONTHS: Partial<Record<DisciplinaryStage, number>> = {
  verbal_warning: 6,
  written_warning: 12,
  final_warning: 24,
};

export const STAGE_LABEL: Record<DisciplinaryStage, string> = {
  investigation: 'Investigation',
  no_action: 'No action',
  verbal_warning: 'Verbal warning',
  written_warning: 'Written warning',
  final_warning: 'Final written warning',
  suspension: 'Suspension',
  demotion: 'Demotion',
  dismissal: 'Dismissal',
};

export const SEVERITY_LABEL: Record<DisciplinarySeverity, string> = {
  minor: 'Minor',
  serious: 'Serious',
  gross: 'Gross misconduct',
};

export const isStage = (v: string | null | undefined): v is DisciplinaryStage => DISCIPLINARY_STAGES.includes(v as DisciplinaryStage);
export const isSeverity = (v: string | null | undefined): v is DisciplinarySeverity => DISCIPLINARY_SEVERITIES.includes(v as DisciplinarySeverity);
export const isCategory = (v: string | null | undefined): v is DisciplinaryCategory => DISCIPLINARY_CATEGORIES.includes(v as DisciplinaryCategory);
export const isWarningStage = (v: string | null | undefined): boolean => WARNING_STAGES.includes(v as DisciplinaryStage);

const toDate = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  const d = typeof value === 'string' ? parseISO(value) : value;
  return isValid(d) ? d : null;
};

/** Suggested expiry for a stage, counted from `from` (usually the outcome date). Null for stages that do not lapse. */
export const defaultExpiryDate = (stage: string | null | undefined, from: string | Date): string | null => {
  const months = isStage(stage) ? DEFAULT_EXPIRY_MONTHS[stage] : undefined;
  const start = toDate(from);
  if (!months || !start) return null;
  return format(addMonths(start, months), 'yyyy-MM-dd');
};

/** Statutory-style retention: minor = 2 years, serious/gross = 7 years (mirrors the DB trigger). */
export const retentionYears = (severity: string | null | undefined): number => (severity === 'minor' ? 2 : 7);

// ---------------------------------------------------------------------------
// Tones
// ---------------------------------------------------------------------------

export type DisciplinaryTone = 'muted' | 'info' | 'warning' | 'danger' | 'success';

export const TONE_CLASS: Record<DisciplinaryTone, string> = {
  muted: 'bg-muted text-muted-foreground border-border',
  info: 'bg-primary/10 text-primary border-primary/20',
  warning: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  danger: 'bg-destructive/10 text-destructive border-destructive/20',
  success: 'bg-green-500/10 text-green-500 border-green-500/20',
};

export const severityTone = (severity: string | null | undefined): DisciplinaryTone => {
  switch (severity) {
    case 'gross':
      return 'danger';
    case 'serious':
      return 'warning';
    case 'minor':
      return 'info';
    default:
      return 'muted';
  }
};

export const stageTone = (stage: string | null | undefined): DisciplinaryTone => {
  switch (stage) {
    case 'investigation':
      return 'info';
    case 'no_action':
      return 'success';
    case 'verbal_warning':
      return 'warning';
    case 'written_warning':
    case 'final_warning':
    case 'suspension':
    case 'demotion':
    case 'dismissal':
      return 'danger';
    default:
      return 'muted';
  }
};

export const appealTone = (appeal: string | null | undefined): DisciplinaryTone => {
  switch (appeal) {
    case 'lodged':
      return 'warning';
    case 'upheld':
      return 'muted';
    case 'overturned':
      return 'success';
    default:
      return 'muted';
  }
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

type LifecycleLike = Pick<DisciplinaryRecordRow, 'stage' | 'status' | 'expiry_date' | 'appeal_status'>;

export const daysToExpiry = (r: Pick<DisciplinaryRecordRow, 'expiry_date'>, today: Date = new Date()): number | null => {
  const d = toDate(r.expiry_date);
  return d ? differenceInCalendarDays(d, today) : null;
};

/** Expired by date or by status (the nightly job may not have run yet). */
export const hasLapsed = (r: Pick<DisciplinaryRecordRow, 'status' | 'expiry_date'>, today: Date = new Date()): boolean => {
  if (r.status === 'expired') return true;
  const days = daysToExpiry(r, today);
  return days !== null && days < 0;
};

/** A warning that still counts: warning stage, not overturned, not lapsed. */
export const isLiveWarning = (r: LifecycleLike, today: Date = new Date()): boolean =>
  isWarningStage(r.stage) &&
  r.status !== 'overturned' &&
  r.appeal_status !== 'overturned' &&
  (r.status === 'open' || r.status === 'closed') &&
  !hasLapsed(r, today);

export const countLiveWarnings = (records: readonly LifecycleLike[], today: Date = new Date()): number =>
  records.filter((r) => isLiveWarning(r, today)).length;

export type LifecycleState = 'investigating' | 'live' | 'open' | 'closed' | 'expired' | 'overturned';

/** Display state that combines stage, status and expiry. */
export const lifecycleState = (r: LifecycleLike, today: Date = new Date()): LifecycleState => {
  if (r.status === 'overturned' || r.appeal_status === 'overturned') return 'overturned';
  if (hasLapsed(r, today)) return 'expired';
  if (r.stage === 'investigation' && r.status === 'open') return 'investigating';
  if (isLiveWarning(r, today)) return 'live';
  return r.status === 'open' ? 'open' : 'closed';
};

export const LIFECYCLE_LABEL: Record<LifecycleState, string> = {
  investigating: 'Under investigation',
  live: 'Live',
  open: 'Open',
  closed: 'Closed',
  expired: 'Expired',
  overturned: 'Overturned',
};

export const lifecycleTone = (state: LifecycleState): DisciplinaryTone => {
  switch (state) {
    case 'live':
      return 'danger';
    case 'investigating':
    case 'open':
      return 'info';
    case 'overturned':
      return 'success';
    case 'expired':
    case 'closed':
    default:
      return 'muted';
  }
};

// ---------------------------------------------------------------------------
// Progressive discipline
// ---------------------------------------------------------------------------

const ladderIndex = (stage: string | null | undefined): number => PROGRESSIVE_LADDER.indexOf(stage as DisciplinaryStage);

/** Minimum rung by severity: minor starts at verbal, serious at written, gross at final. */
const SEVERITY_FLOOR: Record<DisciplinarySeverity, number> = { minor: 0, serious: 1, gross: 2 };

/**
 * Next rung on the ladder given the warnings currently live for the crew
 * member and the severity of the new matter. Escalates one step above the
 * highest live warning, never below the severity floor, capped at dismissal.
 */
export const suggestNextStage = (liveWarnings: readonly LifecycleLike[], severity: string | null | undefined, today: Date = new Date()): DisciplinaryStage => {
  const highest = liveWarnings.filter((r) => isLiveWarning(r, today)).reduce((max, r) => Math.max(max, ladderIndex(r.stage)), -1);
  const floor = isSeverity(severity) ? SEVERITY_FLOOR[severity] : 0;
  const next = Math.min(PROGRESSIVE_LADDER.length - 1, Math.max(highest + 1, floor));
  return PROGRESSIVE_LADDER[next];
};

export interface LadderRung<T extends LifecycleLike> {
  stage: DisciplinaryStage;
  /** A live warning at this rung. */
  live: T | null;
  /** The most recent record ever issued at this rung (live or not). */
  latest: T | null;
}

/** The progressive-discipline ladder with the crew member's records placed on it. */
export const escalationLadder = <T extends LifecycleLike & { incident_date: string }>(records: readonly T[], today: Date = new Date()): LadderRung<T>[] =>
  PROGRESSIVE_LADDER.map((stage) => {
    const atStage = records.filter((r) => r.stage === stage).sort((a, b) => b.incident_date.localeCompare(a.incident_date));
    return {
      stage,
      live: atStage.find((r) => isLiveWarning(r, today) || (stage === 'dismissal' && r.status !== 'overturned')) ?? null,
      latest: atStage[0] ?? null,
    };
  });

// ---------------------------------------------------------------------------
// KPIs & filters
// ---------------------------------------------------------------------------

export interface DisciplinaryKpis {
  openCases: number;
  liveWarnings: number;
  expiring30: number;
  appealsLodged: number;
}

export const computeDisciplinaryKpis = (records: readonly LifecycleLike[], today: Date = new Date()): DisciplinaryKpis => {
  let openCases = 0;
  let liveWarnings = 0;
  let expiring30 = 0;
  let appealsLodged = 0;
  for (const r of records) {
    if (r.status === 'open') openCases += 1;
    if (isLiveWarning(r, today)) {
      liveWarnings += 1;
      const days = daysToExpiry(r, today);
      if (days !== null && days <= 30) expiring30 += 1;
    }
    if (r.appeal_status === 'lodged') appealsLodged += 1;
  }
  return { openCases, liveWarnings, expiring30, appealsLodged };
};

export interface DisciplinaryFilters {
  search: string;
  status: RecordStatus | 'all' | 'live';
  severity: DisciplinarySeverity | 'all';
  category: DisciplinaryCategory | 'all';
  stage: DisciplinaryStage | 'all';
  vesselId: string;
  /** Four-digit year of the incident date, or `all`. */
  year: string;
  crewId: string;
}

export const DEFAULT_DISCIPLINARY_FILTERS: DisciplinaryFilters = {
  search: '',
  status: 'all',
  severity: 'all',
  category: 'all',
  stage: 'all',
  vesselId: 'all',
  year: 'all',
  crewId: 'all',
};

export interface DisciplinarySearchable extends DisciplinaryRecordRow {
  crew_name: string;
  issued_by_name: string | null;
  incident_number: string | null;
}

export const filterDisciplinaryRecords = <T extends DisciplinarySearchable>(rows: readonly T[], filters: DisciplinaryFilters, today: Date = new Date()): T[] => {
  const q = filters.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (filters.status === 'live' ? !isLiveWarning(r, today) : filters.status !== 'all' && r.status !== filters.status) return false;
    if (filters.severity !== 'all' && r.severity !== filters.severity) return false;
    if (filters.category !== 'all' && r.category !== filters.category) return false;
    if (filters.stage !== 'all' && r.stage !== filters.stage) return false;
    if (filters.crewId !== 'all' && r.profile_id !== filters.crewId) return false;
    if (filters.vesselId !== 'all' && (filters.vesselId === 'none' ? r.vessel_id !== null : r.vessel_id !== filters.vesselId)) return false;
    if (filters.year !== 'all' && !r.incident_date.startsWith(filters.year)) return false;
    if (q) {
      const hay = [r.crew_name, r.description, r.outcome, r.category, r.stage, r.incident_number, r.issued_by_name].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
};

/** Newest incident first. */
export const sortRecordsNewestFirst = <T extends Pick<DisciplinaryRecordRow, 'incident_date' | 'created_at'>>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => b.incident_date.localeCompare(a.incident_date) || b.created_at.localeCompare(a.created_at));

/** Distinct incident years present in the records, newest first. */
export const incidentYears = (rows: readonly Pick<DisciplinaryRecordRow, 'incident_date'>[]): string[] =>
  Array.from(new Set(rows.map((r) => r.incident_date.slice(0, 4)))).sort((a, b) => b.localeCompare(a));

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

const optionalText = z.string().optional().or(z.literal(''));
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker');
const optionalDate = z
  .string()
  .optional()
  .or(z.literal(''))
  .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use the date picker');

export const caseFormSchema = z
  .object({
    profile_id: z.string().min(1, 'Select the crew member'),
    vessel_id: z.string().optional().or(z.literal('')),
    incident_id: z.string().optional().or(z.literal('')),
    incident_date: dateString,
    category: z.enum(DISCIPLINARY_CATEGORIES),
    severity: z.enum(DISCIPLINARY_SEVERITIES),
    stage: z.enum(DISCIPLINARY_STAGES),
    description: z.string().trim().min(1, 'Describe the matter').max(8000),
    outcome: optionalText,
    outcome_date: optionalDate,
    expiry_date: optionalDate,
    issued_by_profile_id: z.string().optional().or(z.literal('')),
    investigation_notes: optionalText,
    witness_statements: optionalText,
  })
  .refine((v) => !v.expiry_date || !v.outcome_date || v.expiry_date >= v.outcome_date, {
    message: 'Expiry must be on or after the outcome date',
    path: ['expiry_date'],
  })
  .refine((v) => !v.outcome_date || v.outcome_date >= v.incident_date, {
    message: 'Outcome cannot pre-date the incident',
    path: ['outcome_date'],
  });

export type CaseFormValues = z.infer<typeof caseFormSchema>;

export type DisciplinaryWritePayload = Omit<
  TablesInsert<'disciplinary_records'>,
  'id' | 'company_id' | 'profile_id' | 'created_by' | 'updated_by' | 'created_at' | 'updated_at' | 'status' | 'appeal_status' | 'appeal_notes' | 'document_path' | 'document_name' | 'acknowledged_by_crew_at'
>;

const nullIfEmpty = (v: string | undefined): string | null => (v && v.trim() ? v.trim() : null);

export const emptyCaseFormValues = (defaults: Partial<CaseFormValues> = {}, today: Date = new Date()): CaseFormValues => ({
  profile_id: '',
  vessel_id: '',
  incident_id: '',
  incident_date: format(today, 'yyyy-MM-dd'),
  category: 'conduct',
  severity: 'minor',
  stage: 'investigation',
  description: '',
  outcome: '',
  outcome_date: '',
  expiry_date: '',
  issued_by_profile_id: '',
  investigation_notes: '',
  witness_statements: '',
  ...defaults,
});

export const recordToCaseFormValues = (r: DisciplinaryRecordRow): CaseFormValues => ({
  profile_id: r.profile_id,
  vessel_id: r.vessel_id ?? '',
  incident_id: r.incident_id ?? '',
  incident_date: r.incident_date,
  category: isCategory(r.category) ? r.category : 'other',
  severity: isSeverity(r.severity) ? r.severity : 'minor',
  stage: isStage(r.stage) ? r.stage : 'investigation',
  description: r.description,
  outcome: r.outcome ?? '',
  outcome_date: r.outcome_date ?? '',
  expiry_date: r.expiry_date ?? '',
  issued_by_profile_id: r.issued_by_profile_id ?? '',
  investigation_notes: r.investigation_notes ?? '',
  witness_statements: r.witness_statements ?? '',
});

export const caseFormToPayload = (v: CaseFormValues): DisciplinaryWritePayload => ({
  vessel_id: nullIfEmpty(v.vessel_id),
  incident_id: nullIfEmpty(v.incident_id),
  incident_date: v.incident_date,
  category: v.category,
  severity: v.severity,
  stage: v.stage,
  description: v.description.trim(),
  outcome: nullIfEmpty(v.outcome),
  outcome_date: nullIfEmpty(v.outcome_date),
  expiry_date: nullIfEmpty(v.expiry_date),
  issued_by_profile_id: nullIfEmpty(v.issued_by_profile_id),
  investigation_notes: nullIfEmpty(v.investigation_notes),
  witness_statements: nullIfEmpty(v.witness_statements),
});

/**
 * Audit snapshot: structured fields only. The investigation file is
 * restricted, so only its presence is recorded, never its contents.
 */
export const auditDisciplinarySnapshot = (r: Partial<DisciplinaryRecordRow>): Record<string, string | number | boolean | null> => ({
  profile_id: r.profile_id ?? null,
  vessel_id: r.vessel_id ?? null,
  incident_id: r.incident_id ?? null,
  incident_date: r.incident_date ?? null,
  category: r.category ?? null,
  severity: r.severity ?? null,
  stage: r.stage ?? null,
  status: r.status ?? null,
  outcome_date: r.outcome_date ?? null,
  expiry_date: r.expiry_date ?? null,
  appeal_status: r.appeal_status ?? null,
  issued_by_profile_id: r.issued_by_profile_id ?? null,
  document_name: r.document_name ?? null,
  acknowledged_by_crew_at: r.acknowledged_by_crew_at ?? null,
  has_investigation_notes: Boolean(r.investigation_notes),
  has_witness_statements: Boolean(r.witness_statements),
});
