import { z } from 'zod';
import { differenceInCalendarDays, getYear, isValid, parseISO } from 'date-fns';
import type { Json, Tables } from '@/integrations/supabase/types';
import { fromMinor, toMinor } from '@/modules/hris/lib/format';

/**
 * Pure helpers for recruitment (vacancies, candidates, applications and
 * interviews). No React, no Supabase — everything here is unit-testable and
 * shared by the hooks, dialogs and pages.
 */

export type VacancyRow = Tables<'vacancies'>;
export type CandidateRow = Tables<'candidates'>;
export type ApplicationRow = Tables<'candidate_applications'>;
export type ApplicationEventRow = Tables<'application_events'>;
export type InterviewRow = Tables<'interviews'>;

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export type PipelineStage =
  | 'applied'
  | 'screening'
  | 'interview'
  | 'reference_check'
  | 'offer'
  | 'accepted'
  | 'hired'
  | 'rejected'
  | 'withdrawn';

export type StageTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

export interface PipelineStageDef {
  key: PipelineStage;
  label: string;
  tone: StageTone;
  /** Terminal stages leave the active pipeline. */
  terminal: boolean;
}

/** Ordered pipeline; the first six are the board columns. */
export const PIPELINE_STAGES: readonly PipelineStageDef[] = [
  { key: 'applied', label: 'Applied', tone: 'neutral', terminal: false },
  { key: 'screening', label: 'Screening', tone: 'info', terminal: false },
  { key: 'interview', label: 'Interview', tone: 'info', terminal: false },
  { key: 'reference_check', label: 'Reference check', tone: 'info', terminal: false },
  { key: 'offer', label: 'Offer', tone: 'warning', terminal: false },
  { key: 'accepted', label: 'Accepted', tone: 'success', terminal: false },
  { key: 'hired', label: 'Hired', tone: 'success', terminal: true },
  { key: 'rejected', label: 'Rejected', tone: 'danger', terminal: true },
  { key: 'withdrawn', label: 'Withdrawn', tone: 'neutral', terminal: true },
] as const;

export const ACTIVE_STAGES: readonly PipelineStage[] = PIPELINE_STAGES.filter((s) => !s.terminal).map((s) => s.key);
export const TERMINAL_STAGES: readonly PipelineStage[] = PIPELINE_STAGES.filter((s) => s.terminal).map((s) => s.key);

const STAGE_INDEX = new Map(PIPELINE_STAGES.map((s, i) => [s.key, i]));

export const isPipelineStage = (value: string | null | undefined): value is PipelineStage => STAGE_INDEX.has(value as PipelineStage);

export const stageDef = (stage: string | null | undefined): PipelineStageDef =>
  PIPELINE_STAGES.find((s) => s.key === stage) ?? PIPELINE_STAGES[0];

export const STAGE_TONE_CLASS: Record<StageTone, string> = {
  neutral: 'bg-muted text-muted-foreground border-border',
  info: 'bg-sky-500/10 text-sky-600 border-sky-500/20 dark:text-sky-400',
  warning: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400',
  success: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400',
  danger: 'bg-destructive/10 text-destructive border-destructive/20',
};

/** Solid colours for the mini pipeline bar (one per active stage). */
export const STAGE_BAR_CLASS: Record<PipelineStage, string> = {
  applied: 'bg-slate-400',
  screening: 'bg-sky-400',
  interview: 'bg-indigo-400',
  reference_check: 'bg-violet-400',
  offer: 'bg-amber-400',
  accepted: 'bg-emerald-400',
  hired: 'bg-emerald-600',
  rejected: 'bg-destructive',
  withdrawn: 'bg-muted-foreground',
};

/**
 * Stages an application can be moved to from `stage` via the UI. Forward
 * moves only (backwards is deliberately not offered so the timeline stays
 * honest), plus reject / withdraw. `hired` is reached through the hire RPC,
 * never by a manual move. Rejected / withdrawn applications can be reopened.
 */
export const nextStages = (stage: string | null | undefined): PipelineStage[] => {
  if (!isPipelineStage(stage)) return [];
  if (stage === 'hired') return [];
  if (stage === 'rejected' || stage === 'withdrawn') return ['applied'];
  const idx = STAGE_INDEX.get(stage) ?? 0;
  const forward = ACTIVE_STAGES.filter((s) => (STAGE_INDEX.get(s) ?? 0) > idx);
  return [...forward, 'rejected', 'withdrawn'];
};

export const VACANCY_STATUSES = ['draft', 'open', 'on_hold', 'filled', 'cancelled'] as const;
export type VacancyStatus = (typeof VACANCY_STATUSES)[number];

export const VACANCY_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type VacancyPriority = (typeof VACANCY_PRIORITIES)[number];

export const VACANCY_STATUS_CLASS: Record<VacancyStatus, string> = {
  draft: STAGE_TONE_CLASS.neutral,
  open: STAGE_TONE_CLASS.success,
  on_hold: STAGE_TONE_CLASS.warning,
  filled: STAGE_TONE_CLASS.info,
  cancelled: STAGE_TONE_CLASS.danger,
};

export const PRIORITY_CLASS: Record<VacancyPriority, string> = {
  low: STAGE_TONE_CLASS.neutral,
  normal: STAGE_TONE_CLASS.info,
  high: STAGE_TONE_CLASS.warning,
  urgent: STAGE_TONE_CLASS.danger,
};

/** Status transitions an HR editor may trigger from the vacancy header. */
export const vacancyTransitions = (status: string): VacancyStatus[] => {
  switch (status) {
    case 'draft':
      return ['open', 'cancelled'];
    case 'open':
      return ['on_hold', 'filled', 'cancelled'];
    case 'on_hold':
      return ['open', 'cancelled'];
    case 'filled':
      return ['open'];
    case 'cancelled':
      return ['draft'];
    default:
      return [];
  }
};

export const CANDIDATE_STATUSES = ['active', 'hired', 'archived', 'do_not_rehire'] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const CANDIDATE_STATUS_CLASS: Record<CandidateStatus, string> = {
  active: STAGE_TONE_CLASS.success,
  hired: STAGE_TONE_CLASS.info,
  archived: STAGE_TONE_CLASS.neutral,
  do_not_rehire: STAGE_TONE_CLASS.danger,
};

export const CANDIDATE_SOURCES = ['direct', 'agency', 'referral', 'website', 'social', 'rehire', 'other'] as const;
export type CandidateSource = (typeof CANDIDATE_SOURCES)[number];

export const INTERVIEW_FORMATS = ['video', 'phone', 'in_person', 'onboard_trial'] as const;
export type InterviewFormat = (typeof INTERVIEW_FORMATS)[number];

export const INTERVIEW_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const INTERVIEW_OUTCOMES = ['strong_yes', 'yes', 'maybe', 'no'] as const;
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];

export const OUTCOME_CLASS: Record<InterviewOutcome, string> = {
  strong_yes: STAGE_TONE_CLASS.success,
  yes: STAGE_TONE_CLASS.success,
  maybe: STAGE_TONE_CLASS.warning,
  no: STAGE_TONE_CLASS.danger,
};

export const EVENT_TYPES = ['note', 'stage_change', 'interview', 'offer', 'email', 'call', 'reference'] as const;
export type ApplicationEventType = (typeof EVENT_TYPES)[number];
/** Event types a user can add by hand (the rest are written by triggers / mutations). */
export const MANUAL_EVENT_TYPES: readonly ApplicationEventType[] = ['note', 'call', 'email', 'reference'];

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const isoDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
};

/** Whole days between `from` and `to` (positive when `to` is later). */
export const daysBetween = (from: string | null | undefined, to: Date): number | null => {
  const d = isoDate(from);
  return d ? differenceInCalendarDays(to, d) : null;
};

/** Days the application has sat in its current stage. */
export const timeInStage = (application: Pick<ApplicationRow, 'stage_changed_at' | 'applied_at'>, now: Date = new Date()): number => {
  const days = daysBetween(application.stage_changed_at ?? application.applied_at, now);
  return days === null ? 0 : Math.max(0, days);
};

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export type StageCounts = Record<PipelineStage, number>;

export const emptyStageCounts = (): StageCounts => ({
  applied: 0,
  screening: 0,
  interview: 0,
  reference_check: 0,
  offer: 0,
  accepted: 0,
  hired: 0,
  rejected: 0,
  withdrawn: 0,
});

export const stageCounts = (applications: readonly Pick<ApplicationRow, 'stage'>[]): StageCounts => {
  const counts = emptyStageCounts();
  for (const a of applications) {
    if (isPipelineStage(a.stage)) counts[a.stage] += 1;
  }
  return counts;
};

export const activeApplicationCount = (counts: StageCounts): number => ACTIVE_STAGES.reduce((sum, s) => sum + counts[s], 0);

export interface VacancyProgress {
  hired: number;
  headcount: number;
  remaining: number;
  /** 0–100 */
  pct: number;
  /** Applications in offer or accepted — likely to convert. */
  inOffer: number;
}

export const vacancyProgress = (
  vacancy: Pick<VacancyRow, 'headcount'>,
  applications: readonly Pick<ApplicationRow, 'stage'>[],
): VacancyProgress => {
  const headcount = Math.max(1, vacancy.headcount ?? 1);
  const counts = stageCounts(applications);
  const hired = counts.hired;
  return {
    hired,
    headcount,
    remaining: Math.max(0, headcount - hired),
    pct: Math.min(100, Math.round((hired / headcount) * 100)),
    inOffer: counts.offer + counts.accepted,
  };
};

/** Sort for board columns and lists: newest stage change first. */
export const sortByStageChanged = <T extends Pick<ApplicationRow, 'stage_changed_at'>>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => (b.stage_changed_at ?? '').localeCompare(a.stage_changed_at ?? ''));

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export interface MatchReason {
  key: 'rank' | 'department' | 'certificates' | 'availability';
  label: string;
  met: boolean;
  /** Share of this criterion's weight earned (0–1). */
  earned: number;
  weight: number;
}

export interface MatchResult {
  /** 0–100, or null when the vacancy defines nothing to match against. */
  score: number | null;
  reasons: MatchReason[];
}

const norm = (value: string | null | undefined): string => (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const MATCH_WEIGHTS = { rank: 35, department: 20, certificates: 30, availability: 15 } as const;

/**
 * How well a candidate fits a vacancy. Only the criteria the vacancy defines
 * count, so a vacancy with no requirements yields `score: null` rather than
 * a misleading 100.
 */
export const candidateMatchScore = (
  candidate: Pick<CandidateRow, 'rank' | 'department' | 'certificates' | 'available_from'>,
  vacancy: Pick<VacancyRow, 'rank' | 'department' | 'required_certificates' | 'start_date'>,
): MatchResult => {
  const reasons: MatchReason[] = [];

  if (vacancy.rank) {
    const met = norm(candidate.rank) === norm(vacancy.rank);
    reasons.push({
      key: 'rank',
      label: met ? `Rank matches (${vacancy.rank})` : `Rank differs: ${candidate.rank || 'not recorded'} vs ${vacancy.rank}`,
      met,
      earned: met ? 1 : 0,
      weight: MATCH_WEIGHTS.rank,
    });
  }

  if (vacancy.department) {
    const met = norm(candidate.department) === norm(vacancy.department);
    reasons.push({
      key: 'department',
      label: met ? `Department matches (${vacancy.department})` : `Department differs: ${candidate.department || 'not recorded'} vs ${vacancy.department}`,
      met,
      earned: met ? 1 : 0,
      weight: MATCH_WEIGHTS.department,
    });
  }

  const required = (vacancy.required_certificates ?? []).map((c) => c.trim()).filter(Boolean);
  if (required.length) {
    const held = new Set((candidate.certificates ?? []).map(norm));
    const missing = required.filter((c) => !held.has(norm(c)));
    const covered = required.length - missing.length;
    const met = missing.length === 0;
    reasons.push({
      key: 'certificates',
      label: met
        ? `All ${required.length} required certificate${required.length === 1 ? '' : 's'} held`
        : `${covered} of ${required.length} certificates held (missing: ${missing.join(', ')})`,
      met,
      earned: covered / required.length,
      weight: MATCH_WEIGHTS.certificates,
    });
  }

  if (vacancy.start_date) {
    if (!candidate.available_from) {
      reasons.push({ key: 'availability', label: 'Availability not recorded', met: false, earned: 0.5, weight: MATCH_WEIGHTS.availability });
    } else {
      const start = isoDate(vacancy.start_date);
      const available = isoDate(candidate.available_from);
      const late = start && available ? differenceInCalendarDays(available, start) : 0;
      const met = late <= 0;
      reasons.push({
        key: 'availability',
        label: met ? 'Available before the start date' : `Available ${late} day${late === 1 ? '' : 's'} after the start date`,
        met,
        earned: met ? 1 : 0,
        weight: MATCH_WEIGHTS.availability,
      });
    }
  }

  const total = reasons.reduce((sum, r) => sum + r.weight, 0);
  if (total === 0) return { score: null, reasons };
  const earned = reasons.reduce((sum, r) => sum + r.weight * r.earned, 0);
  return { score: Math.round((earned / total) * 100), reasons };
};

export type MatchTone = 'strong' | 'good' | 'weak' | 'poor' | 'none';

export const matchTone = (score: number | null): MatchTone => {
  if (score === null) return 'none';
  if (score >= 80) return 'strong';
  if (score >= 60) return 'good';
  if (score >= 40) return 'weak';
  return 'poor';
};

export const MATCH_TONE_CLASS: Record<MatchTone, string> = {
  strong: STAGE_TONE_CLASS.success,
  good: STAGE_TONE_CLASS.info,
  weak: STAGE_TONE_CLASS.warning,
  poor: STAGE_TONE_CLASS.danger,
  none: STAGE_TONE_CLASS.neutral,
};

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

const VESSEL_PREFIX = /^(m\/?y|s\/?y|m\/?v|s\/?v|r\/?v|mv|my|sy|sv)\b\s*/i;

/**
 * Human-readable vacancy reference such as `DRA-0004` (first three letters
 * of the vessel name, ignoring `M/Y`-style prefixes) or `VAC-0004` when the
 * vacancy is not tied to a vessel.
 */
export const buildReference = (vessel: { name: string } | string | null | undefined, seq: number): string => {
  const name = typeof vessel === 'string' ? vessel : vessel?.name ?? '';
  const letters = name.replace(VESSEL_PREFIX, '').replace(/[^a-z]/gi, '').toUpperCase();
  const code = letters.length >= 3 ? letters.slice(0, 3) : letters.padEnd(3, 'X');
  const prefix = letters.length === 0 ? 'VAC' : code;
  return `${prefix}-${String(Math.max(1, Math.floor(seq))).padStart(4, '0')}`;
};

// ---------------------------------------------------------------------------
// KPIs & filters
// ---------------------------------------------------------------------------

export interface VacancyKpis {
  openVacancies: number;
  urgent: number;
  offersOut: number;
  hiredThisYear: number;
  /** Mean days from opened (or created) to filled for vacancies filled this year; null when none. */
  avgDaysToFill: number | null;
}

export const computeVacancyKpis = (
  vacancies: readonly Pick<VacancyRow, 'status' | 'priority' | 'opened_at' | 'created_at' | 'filled_at'>[],
  applications: readonly Pick<ApplicationRow, 'stage' | 'stage_changed_at'>[],
  today: Date = new Date(),
): VacancyKpis => {
  const year = getYear(today);
  const open = vacancies.filter((v) => v.status === 'open');
  const filled = vacancies.filter((v) => v.status === 'filled' && v.filled_at);
  const durations = filled
    .map((v) => {
      const start = isoDate(v.opened_at ?? v.created_at);
      const end = isoDate(v.filled_at);
      return start && end ? differenceInCalendarDays(end, start) : null;
    })
    .filter((d): d is number => d !== null && d >= 0);
  return {
    openVacancies: open.length,
    urgent: open.filter((v) => v.priority === 'urgent').length,
    offersOut: applications.filter((a) => a.stage === 'offer').length,
    hiredThisYear: applications.filter((a) => {
      if (a.stage !== 'hired') return false;
      const d = isoDate(a.stage_changed_at);
      return d ? getYear(d) === year : false;
    }).length,
    avgDaysToFill: durations.length ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : null,
  };
};

export interface VacancyFilters {
  status: VacancyStatus | 'all' | 'active';
  vesselId: string | 'all' | 'none';
  department: string | 'all';
  priority: VacancyPriority | 'all';
  search: string;
}

export const DEFAULT_VACANCY_FILTERS: VacancyFilters = { status: 'active', vesselId: 'all', department: 'all', priority: 'all', search: '' };

export const filterVacancies = <T extends VacancyRow & { vessel_name: string | null }>(rows: readonly T[], f: VacancyFilters): T[] => {
  const q = f.search.trim().toLowerCase();
  return rows.filter((v) => {
    if (f.status === 'active') {
      if (v.status !== 'open' && v.status !== 'on_hold' && v.status !== 'draft') return false;
    } else if (f.status !== 'all' && v.status !== f.status) return false;
    if (f.vesselId === 'none' ? v.vessel_id !== null : f.vesselId !== 'all' && v.vessel_id !== f.vesselId) return false;
    if (f.department !== 'all' && v.department !== f.department) return false;
    if (f.priority !== 'all' && v.priority !== f.priority) return false;
    if (q) {
      const hay = [v.title, v.reference, v.rank, v.department, v.vessel_name].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
};

export interface CandidateFilters {
  status: CandidateStatus | 'all';
  rank: string | 'all';
  department: string | 'all';
  source: CandidateSource | 'all';
  search: string;
}

export const DEFAULT_CANDIDATE_FILTERS: CandidateFilters = { status: 'active', rank: 'all', department: 'all', source: 'all', search: '' };

export const filterCandidates = <T extends CandidateRow>(rows: readonly T[], f: CandidateFilters): T[] => {
  const q = f.search.trim().toLowerCase();
  return rows.filter((c) => {
    if (f.status !== 'all' && c.status !== f.status) return false;
    if (f.rank !== 'all' && c.rank !== f.rank) return false;
    if (f.department !== 'all' && c.department !== f.department) return false;
    if (f.source !== 'all' && c.source !== f.source) return false;
    if (q) {
      const hay = [c.first_name, c.last_name, c.preferred_name, c.email, c.rank, c.department, c.nationality, c.agency_name, ...(c.certificates ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
};

export const candidateName = (c: Pick<CandidateRow, 'first_name' | 'last_name' | 'preferred_name'>): string =>
  `${c.preferred_name || c.first_name} ${c.last_name}`.trim();

export const candidateInitials = (c: Pick<CandidateRow, 'first_name' | 'last_name'>): string =>
  `${c.first_name?.[0] ?? ''}${c.last_name?.[0] ?? ''}`.toUpperCase();

// ---------------------------------------------------------------------------
// Scorecards
// ---------------------------------------------------------------------------

export interface ScorecardRow {
  competency: string;
  /** 1–5, or null when not rated. */
  score: number | null;
  comment: string;
}

export const DEFAULT_COMPETENCIES = [
  'Technical knowledge',
  'Safety awareness',
  'Communication',
  'Teamwork',
  'Guest service & attitude',
  'Leadership potential',
] as const;

export const emptyScorecard = (): ScorecardRow[] => DEFAULT_COMPETENCIES.map((competency) => ({ competency, score: null, comment: '' }));

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads a stored `interviews.scorecard` JSON array defensively. */
export const parseScorecard = (json: Json | null | undefined): ScorecardRow[] => {
  if (!Array.isArray(json)) return [];
  return json.flatMap((item) => {
    if (!isRecord(item) || typeof item.competency !== 'string') return [];
    const raw = item.score;
    const score = typeof raw === 'number' && raw >= 1 && raw <= 5 ? Math.round(raw) : null;
    return [{ competency: item.competency, score, comment: typeof item.comment === 'string' ? item.comment : '' }];
  });
};

export const scorecardToJson = (rows: readonly ScorecardRow[]): Json =>
  rows.filter((r) => r.competency.trim()).map((r) => ({ competency: r.competency.trim(), score: r.score, comment: r.comment.trim() }));

/** Mean of rated rows, to one decimal; null when nothing is rated. */
export const scorecardAverage = (rows: readonly ScorecardRow[]): number | null => {
  const rated = rows.filter((r): r is ScorecardRow & { score: number } => typeof r.score === 'number');
  if (!rated.length) return null;
  return Math.round((rated.reduce((s, r) => s + r.score, 0) / rated.length) * 10) / 10;
};

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

const optionalText = z.string().trim().max(2000).optional().or(z.literal(''));
const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional().or(z.literal(''));
const money = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .refine((v) => !v || toMinor(v) !== null, 'Enter a valid amount');
const currency = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .or(z.literal(''))
  .refine((v) => !v || /^[A-Z]{3}$/.test(v), 'Use a 3-letter ISO code');

/** "a, b, c" or newline-separated → trimmed unique list. */
export const splitList = (value: string | null | undefined): string[] => {
  const seen = new Set<string>();
  return (value ?? '')
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s && !seen.has(s.toLowerCase()) && (seen.add(s.toLowerCase()), true));
};

export const joinList = (values: readonly string[] | null | undefined): string => (values ?? []).join(', ');

export const vacancyFormSchema = z
  .object({
    title: z.string().trim().min(2, 'Title is required').max(160),
    reference: z.string().trim().max(40).optional().or(z.literal('')),
    vessel_id: z.string().optional().or(z.literal('')),
    department: z.string().optional().or(z.literal('')),
    rank: z.string().optional().or(z.literal('')),
    pay_grade_id: z.string().optional().or(z.literal('')),
    contract_type: z.string().min(1, 'Contract type is required'),
    rotation_pattern: optionalText,
    start_date: optionalDate,
    end_date: optionalDate,
    headcount: z.coerce.number().int().min(1, 'At least one position').max(50),
    salary_currency: currency,
    salary_min: money,
    salary_max: money,
    priority: z.enum(VACANCY_PRIORITIES),
    status: z.enum(['draft', 'open']),
    hiring_manager_profile_id: z.string().optional().or(z.literal('')),
    replaces_profile_id: z.string().optional().or(z.literal('')),
    required_certificates: z.string().max(4000).optional().or(z.literal('')),
    description: z.string().max(8000).optional().or(z.literal('')),
    requirements: z.string().max(8000).optional().or(z.literal('')),
    notes: z.string().max(4000).optional().or(z.literal('')),
  })
  .superRefine((v, ctx) => {
    if (v.start_date && v.end_date && v.end_date < v.start_date) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['end_date'], message: 'End date must be after the start date' });
    }
    const min = toMinor(v.salary_min || null);
    const max = toMinor(v.salary_max || null);
    if (min !== null && max !== null && max < min) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['salary_max'], message: 'Maximum must be at least the minimum' });
    }
    if ((min !== null || max !== null) && !v.salary_currency) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['salary_currency'], message: 'Choose a currency for the salary range' });
    }
  });

export type VacancyFormValues = z.infer<typeof vacancyFormSchema>;

export const emptyVacancyFormValues = (defaults: Partial<VacancyFormValues> = {}): VacancyFormValues => ({
  title: '',
  reference: '',
  vessel_id: '',
  department: '',
  rank: '',
  pay_grade_id: '',
  contract_type: 'rotational',
  rotation_pattern: '',
  start_date: '',
  end_date: '',
  headcount: 1,
  salary_currency: '',
  salary_min: '',
  salary_max: '',
  priority: 'normal',
  status: 'draft',
  hiring_manager_profile_id: '',
  replaces_profile_id: '',
  required_certificates: '',
  description: '',
  requirements: '',
  notes: '',
  ...defaults,
});

export const vacancyToFormValues = (v: VacancyRow): VacancyFormValues => ({
  title: v.title,
  reference: v.reference ?? '',
  vessel_id: v.vessel_id ?? '',
  department: v.department ?? '',
  rank: v.rank ?? '',
  pay_grade_id: v.pay_grade_id ?? '',
  contract_type: v.contract_type,
  rotation_pattern: v.rotation_pattern ?? '',
  start_date: v.start_date ?? '',
  end_date: v.end_date ?? '',
  headcount: v.headcount,
  salary_currency: v.salary_currency ?? '',
  salary_min: fromMinor(v.salary_min_minor),
  salary_max: fromMinor(v.salary_max_minor),
  priority: (VACANCY_PRIORITIES as readonly string[]).includes(v.priority) ? (v.priority as VacancyPriority) : 'normal',
  status: v.status === 'open' ? 'open' : 'draft',
  hiring_manager_profile_id: v.hiring_manager_profile_id ?? '',
  replaces_profile_id: v.replaces_profile_id ?? '',
  required_certificates: joinList(v.required_certificates),
  description: v.description ?? '',
  requirements: v.requirements ?? '',
  notes: v.notes ?? '',
});

/** Columns an editor may set on a vacancy (everything but ids, timestamps and actor fields). */
export type VacancyWritePayload = Pick<
  VacancyRow,
  | 'title'
  | 'reference'
  | 'vessel_id'
  | 'department'
  | 'rank'
  | 'pay_grade_id'
  | 'contract_type'
  | 'rotation_pattern'
  | 'start_date'
  | 'end_date'
  | 'headcount'
  | 'salary_currency'
  | 'salary_min_minor'
  | 'salary_max_minor'
  | 'priority'
  | 'status'
  | 'hiring_manager_profile_id'
  | 'replaces_profile_id'
  | 'required_certificates'
  | 'description'
  | 'requirements'
  | 'notes'
>;

const nullable = (value: string | undefined): string | null => (value && value.trim() ? value.trim() : null);

export const vacancyFormToPayload = (v: VacancyFormValues): VacancyWritePayload => ({
  title: v.title.trim(),
  reference: nullable(v.reference),
  vessel_id: nullable(v.vessel_id),
  department: nullable(v.department),
  rank: nullable(v.rank),
  pay_grade_id: nullable(v.pay_grade_id),
  contract_type: v.contract_type,
  rotation_pattern: nullable(v.rotation_pattern),
  start_date: nullable(v.start_date),
  end_date: nullable(v.end_date),
  headcount: v.headcount,
  salary_currency: nullable(v.salary_currency),
  salary_min_minor: toMinor(v.salary_min || null),
  salary_max_minor: toMinor(v.salary_max || null),
  priority: v.priority,
  status: v.status,
  hiring_manager_profile_id: nullable(v.hiring_manager_profile_id),
  replaces_profile_id: nullable(v.replaces_profile_id),
  required_certificates: splitList(v.required_certificates),
  description: nullable(v.description),
  requirements: nullable(v.requirements),
  notes: nullable(v.notes),
});

export const candidateFormSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(80),
  last_name: z.string().trim().min(1, 'Last name is required').max(80),
  preferred_name: z.string().trim().max(80).optional().or(z.literal('')),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  nationality: z.string().trim().max(80).optional().or(z.literal('')),
  date_of_birth: optionalDate,
  current_location: z.string().trim().max(120).optional().or(z.literal('')),
  home_airport: z.string().trim().max(80).optional().or(z.literal('')),
  rank: z.string().optional().or(z.literal('')),
  department: z.string().optional().or(z.literal('')),
  years_experience: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 60), 'Enter years between 0 and 60'),
  source: z.enum(CANDIDATE_SOURCES),
  agency_name: z.string().trim().max(120).optional().or(z.literal('')),
  referred_by_profile_id: z.string().optional().or(z.literal('')),
  linkedin_url: z.string().trim().url('Enter a full URL').optional().or(z.literal('')),
  certificates: z.string().max(4000).optional().or(z.literal('')),
  languages: z.string().max(1000).optional().or(z.literal('')),
  salary_expectation_currency: currency,
  salary_expectation: money,
  available_from: optionalDate,
  rating: z.enum(['', '1', '2', '3', '4', '5']),
  gdpr_consent: z.boolean(),
  gdpr_retention_until: optionalDate,
  notes: z.string().max(8000).optional().or(z.literal('')),
});

export type CandidateFormValues = z.infer<typeof candidateFormSchema>;

export const emptyCandidateFormValues = (defaults: Partial<CandidateFormValues> = {}): CandidateFormValues => ({
  first_name: '',
  last_name: '',
  preferred_name: '',
  email: '',
  phone: '',
  nationality: '',
  date_of_birth: '',
  current_location: '',
  home_airport: '',
  rank: '',
  department: '',
  years_experience: '',
  source: 'direct',
  agency_name: '',
  referred_by_profile_id: '',
  linkedin_url: '',
  certificates: '',
  languages: '',
  salary_expectation_currency: '',
  salary_expectation: '',
  available_from: '',
  rating: '',
  gdpr_consent: false,
  gdpr_retention_until: '',
  notes: '',
  ...defaults,
});

export const candidateToFormValues = (c: CandidateRow): CandidateFormValues => ({
  first_name: c.first_name,
  last_name: c.last_name,
  preferred_name: c.preferred_name ?? '',
  email: c.email ?? '',
  phone: c.phone ?? '',
  nationality: c.nationality ?? '',
  date_of_birth: c.date_of_birth ?? '',
  current_location: c.current_location ?? '',
  home_airport: c.home_airport ?? '',
  rank: c.rank ?? '',
  department: c.department ?? '',
  years_experience: c.years_experience === null ? '' : String(c.years_experience),
  source: (CANDIDATE_SOURCES as readonly string[]).includes(c.source) ? (c.source as CandidateSource) : 'other',
  agency_name: c.agency_name ?? '',
  referred_by_profile_id: c.referred_by_profile_id ?? '',
  linkedin_url: c.linkedin_url ?? '',
  certificates: joinList(c.certificates),
  languages: joinList(c.languages),
  salary_expectation_currency: c.salary_expectation_currency ?? '',
  salary_expectation: fromMinor(c.salary_expectation_minor),
  available_from: c.available_from ?? '',
  rating: c.rating ? (String(c.rating) as CandidateFormValues['rating']) : '',
  gdpr_consent: Boolean(c.gdpr_consent_at),
  gdpr_retention_until: c.gdpr_retention_until ?? '',
  notes: c.notes ?? '',
});

export type CandidateWritePayload = Pick<
  CandidateRow,
  | 'first_name'
  | 'last_name'
  | 'preferred_name'
  | 'email'
  | 'phone'
  | 'nationality'
  | 'date_of_birth'
  | 'current_location'
  | 'home_airport'
  | 'rank'
  | 'department'
  | 'years_experience'
  | 'source'
  | 'agency_name'
  | 'referred_by_profile_id'
  | 'linkedin_url'
  | 'certificates'
  | 'languages'
  | 'salary_expectation_currency'
  | 'salary_expectation_minor'
  | 'available_from'
  | 'rating'
  | 'gdpr_consent_at'
  | 'gdpr_retention_until'
  | 'notes'
>;

/**
 * Form → row. `gdpr_consent_at` is only stamped when consent is newly given
 * (pass the existing value to keep the original timestamp) and cleared when
 * consent is withdrawn.
 */
export const candidateFormToPayload = (
  v: CandidateFormValues,
  options: { existingConsentAt?: string | null; now?: Date } = {},
): CandidateWritePayload => {
  const now = options.now ?? new Date();
  const gdpr_consent_at = v.gdpr_consent ? options.existingConsentAt ?? now.toISOString() : null;
  return {
    first_name: v.first_name.trim(),
    last_name: v.last_name.trim(),
    preferred_name: nullable(v.preferred_name),
    email: nullable(v.email)?.toLowerCase() ?? null,
    phone: nullable(v.phone),
    nationality: nullable(v.nationality),
    date_of_birth: nullable(v.date_of_birth),
    current_location: nullable(v.current_location),
    home_airport: nullable(v.home_airport),
    rank: nullable(v.rank),
    department: nullable(v.department),
    years_experience: v.years_experience ? Math.round(Number(v.years_experience) * 10) / 10 : null,
    source: v.source,
    agency_name: v.source === 'agency' ? nullable(v.agency_name) : null,
    referred_by_profile_id: v.source === 'referral' ? nullable(v.referred_by_profile_id) : null,
    linkedin_url: nullable(v.linkedin_url),
    certificates: splitList(v.certificates),
    languages: splitList(v.languages),
    salary_expectation_currency: nullable(v.salary_expectation_currency),
    salary_expectation_minor: toMinor(v.salary_expectation || null),
    available_from: nullable(v.available_from),
    rating: v.rating ? Number(v.rating) : null,
    gdpr_consent_at,
    gdpr_retention_until: nullable(v.gdpr_retention_until),
    notes: nullable(v.notes),
  };
};

export const offerFormSchema = z.object({
  offer_currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a 3-letter ISO code'),
  offer_base: z.string().trim().min(1, 'Enter the monthly base').refine((v) => toMinor(v) !== null, 'Enter a valid amount'),
  offer_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a start date'),
});
export type OfferFormValues = z.infer<typeof offerFormSchema>;

export const interviewFormSchema = z.object({
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
  scheduled_time: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a time'),
  duration_minutes: z.coerce.number().int().min(10).max(480),
  format: z.enum(INTERVIEW_FORMATS),
  location: z.string().trim().max(200).optional().or(z.literal('')),
  interviewer_profile_ids: z.array(z.string()).min(1, 'Add at least one interviewer'),
});
export type InterviewFormValues = z.infer<typeof interviewFormSchema>;

/** Local date + time → ISO string for `interviews.scheduled_at`. */
export const combineDateTime = (date: string, time: string): string => {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
};

/** Snapshot suitable for `audit_logs.old_values` / `new_values`. */
export const toAuditJson = (value: object | null | undefined): Json | null => (value ? (JSON.parse(JSON.stringify(value)) as Json) : null);
