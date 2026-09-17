import { differenceInCalendarDays, isValid, parseISO } from 'date-fns';
import { z } from 'zod';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';

/**
 * Pure helpers for Objectives & PDPs (crew_objectives). Everything that
 * needs "today" takes it as a parameter so the maths is unit-testable.
 */

export type CrewObjectiveRow = Tables<'crew_objectives'>;
export type ObjectiveUpdateRow = Tables<'crew_objective_updates'>;

export const OBJECTIVE_CATEGORIES = ['performance', 'development', 'training', 'behaviour', 'certification', 'career'] as const;
export type ObjectiveCategory = (typeof OBJECTIVE_CATEGORIES)[number];

export const OBJECTIVE_STATUSES = ['not_started', 'in_progress', 'achieved', 'missed', 'cancelled'] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];

export const OPEN_OBJECTIVE_STATUSES: readonly ObjectiveStatus[] = ['not_started', 'in_progress'];

export const CATEGORY_LABEL: Record<ObjectiveCategory, string> = {
  performance: 'Performance',
  development: 'Development',
  training: 'Training',
  behaviour: 'Behaviour',
  certification: 'Certification',
  career: 'Career',
};

export const CATEGORY_CLASS: Record<ObjectiveCategory, string> = {
  performance: 'bg-primary/10 text-primary border-primary/20',
  development: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  training: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
  behaviour: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  certification: 'bg-teal-500/10 text-teal-500 border-teal-500/20',
  career: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
};

export const isObjectiveCategory = (value: string | null | undefined): value is ObjectiveCategory =>
  OBJECTIVE_CATEGORIES.includes(value as ObjectiveCategory);

export const isObjectiveStatus = (value: string | null | undefined): value is ObjectiveStatus =>
  OBJECTIVE_STATUSES.includes(value as ObjectiveStatus);

type StatusLike = Pick<CrewObjectiveRow, 'status'>;
type DueLike = Pick<CrewObjectiveRow, 'status' | 'target_date'>;
type WeightLike = Pick<CrewObjectiveRow, 'status' | 'weight' | 'progress_pct'>;

export const isOpenObjective = (o: StatusLike): boolean => OPEN_OBJECTIVE_STATUSES.includes(o.status as ObjectiveStatus);

/** Calendar days from `today` to the target date (negative when in the past); null when there is no valid date. */
export const daysToTarget = (o: Pick<CrewObjectiveRow, 'target_date'>, today: Date = new Date()): number | null => {
  if (!o.target_date) return null;
  const d = parseISO(o.target_date);
  return isValid(d) ? differenceInCalendarDays(d, today) : null;
};

/** An open objective whose target date has passed. */
export const isOverdue = (o: DueLike, today: Date = new Date()): boolean => {
  if (!isOpenObjective(o)) return false;
  const days = daysToTarget(o, today);
  return days !== null && days < 0;
};

/** An open objective due within `withinDays` (inclusive), not yet overdue. */
export const isDueSoon = (o: DueLike, withinDays = 14, today: Date = new Date()): boolean => {
  if (!isOpenObjective(o)) return false;
  const days = daysToTarget(o, today);
  return days !== null && days >= 0 && days <= withinDays;
};

export type ObjectiveTone = 'muted' | 'active' | 'success' | 'danger' | 'warning';

/** Badge tone for an objective: overdue open objectives are flagged even while in progress. */
export const statusTone = (o: DueLike, today: Date = new Date()): ObjectiveTone => {
  if (isOverdue(o, today)) return 'danger';
  switch (o.status as ObjectiveStatus) {
    case 'achieved':
      return 'success';
    case 'missed':
      return 'danger';
    case 'in_progress':
      return 'active';
    case 'cancelled':
      return 'muted';
    case 'not_started':
    default:
      return isDueSoon(o, 14, today) ? 'warning' : 'muted';
  }
};

export const TONE_CLASS: Record<ObjectiveTone, string> = {
  muted: 'bg-muted text-muted-foreground border-border',
  active: 'bg-primary/10 text-primary border-primary/20',
  success: 'bg-green-500/10 text-green-500 border-green-500/20',
  danger: 'bg-destructive/10 text-destructive border-destructive/20',
  warning: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
};

export const statusLabel = (o: DueLike, today: Date = new Date()): string => {
  if (isOverdue(o, today)) return 'Overdue';
  switch (o.status as ObjectiveStatus) {
    case 'not_started':
      return 'Not started';
    case 'in_progress':
      return 'In progress';
    case 'achieved':
      return 'Achieved';
    case 'missed':
      return 'Missed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return o.status;
  }
};

/**
 * Weighted completion of a PDP: Σ(progress × weight) / Σ(weight), rounded to
 * a whole percent. Cancelled objectives are left out; null when nothing counts.
 */
export const weightedCompletion = (objectives: readonly WeightLike[]): number | null => {
  let num = 0;
  let den = 0;
  for (const o of objectives) {
    if (o.status === 'cancelled') continue;
    const w = Math.max(0, o.weight);
    num += Math.min(100, Math.max(0, o.progress_pct)) * w;
    den += w;
  }
  if (den === 0) return null;
  return Math.round(num / den);
};

export type StatusCounts = Record<ObjectiveStatus, number>;

export const countByStatus = (objectives: readonly StatusLike[]): StatusCounts => {
  const counts: StatusCounts = { not_started: 0, in_progress: 0, achieved: 0, missed: 0, cancelled: 0 };
  for (const o of objectives) {
    if (isObjectiveStatus(o.status)) counts[o.status] += 1;
  }
  return counts;
};

export interface CategoryGroup<T> {
  category: ObjectiveCategory;
  objectives: T[];
}

/** Groups objectives by category in the canonical order, skipping empty categories. Unknown categories fall under `performance`. */
export const groupByCategory = <T extends Pick<CrewObjectiveRow, 'category'>>(objectives: readonly T[]): CategoryGroup<T>[] => {
  const buckets = new Map<ObjectiveCategory, T[]>();
  for (const o of objectives) {
    const key: ObjectiveCategory = isObjectiveCategory(o.category) ? o.category : 'performance';
    buckets.set(key, [...(buckets.get(key) ?? []), o]);
  }
  return OBJECTIVE_CATEGORIES.filter((c) => buckets.has(c)).map((c) => ({ category: c, objectives: buckets.get(c) ?? [] }));
};

/** Open first (overdue at the top), then by target date, then most recently updated. */
export const sortObjectives = <T extends CrewObjectiveRow>(objectives: readonly T[], today: Date = new Date()): T[] =>
  [...objectives].sort((a, b) => {
    const openA = isOpenObjective(a) ? 0 : 1;
    const openB = isOpenObjective(b) ? 0 : 1;
    if (openA !== openB) return openA - openB;
    const overdueA = isOverdue(a, today) ? 0 : 1;
    const overdueB = isOverdue(b, today) ? 0 : 1;
    if (overdueA !== overdueB) return overdueA - overdueB;
    const da = a.target_date ?? '9999-12-31';
    const db = b.target_date ?? '9999-12-31';
    if (da !== db) return da.localeCompare(db);
    return b.updated_at.localeCompare(a.updated_at);
  });

export interface ObjectiveKpis {
  open: number;
  dueSoon: number;
  overdue: number;
  achievedThisYear: number;
  /** Mean weighted completion across crew members who have at least one counted objective; null when nobody does. */
  avgPdpCompletion: number | null;
}

export const computeObjectiveKpis = (
  objectives: readonly Pick<CrewObjectiveRow, 'status' | 'target_date' | 'weight' | 'progress_pct' | 'profile_id' | 'completed_at' | 'updated_at'>[],
  today: Date = new Date(),
): ObjectiveKpis => {
  const year = today.getFullYear();
  const byProfile = new Map<string, WeightLike[]>();
  let open = 0;
  let dueSoon = 0;
  let overdue = 0;
  let achievedThisYear = 0;
  for (const o of objectives) {
    if (isOpenObjective(o)) open += 1;
    if (isDueSoon(o, 14, today)) dueSoon += 1;
    if (isOverdue(o, today)) overdue += 1;
    if (o.status === 'achieved') {
      const stamp = o.completed_at ?? o.updated_at;
      const d = parseISO(stamp);
      if (isValid(d) && d.getFullYear() === year) achievedThisYear += 1;
    }
    byProfile.set(o.profile_id, [...(byProfile.get(o.profile_id) ?? []), o]);
  }
  const completions = Array.from(byProfile.values())
    .map((rows) => weightedCompletion(rows))
    .filter((v): v is number => v !== null);
  const avgPdpCompletion = completions.length ? Math.round(completions.reduce((s, v) => s + v, 0) / completions.length) : null;
  return { open, dueSoon, overdue, achievedThisYear, avgPdpCompletion };
};

// ---------------------------------------------------------------------------
// Filters (company overview)
// ---------------------------------------------------------------------------

export interface ObjectiveFilters {
  search: string;
  /** `open` = not started + in progress. */
  status: ObjectiveStatus | 'all' | 'open' | 'overdue';
  category: ObjectiveCategory | 'all';
  /** Vessel of the subject's current assignment; `none` = unassigned. */
  vesselId: string;
  /** Owner (mentor / HOD) profile id, or `all`. */
  ownerId: string;
  /** Subject profile id, or `all`. */
  crewId: string;
}

export const DEFAULT_OBJECTIVE_FILTERS: ObjectiveFilters = {
  search: '',
  status: 'open',
  category: 'all',
  vesselId: 'all',
  ownerId: 'all',
  crewId: 'all',
};

export interface ObjectiveSearchable extends CrewObjectiveRow {
  crew_name: string;
  owner_name: string | null;
}

export const filterObjectives = <T extends ObjectiveSearchable>(
  rows: readonly T[],
  filters: ObjectiveFilters,
  vesselOfProfile: (profileId: string) => string | null,
  today: Date = new Date(),
): T[] => {
  const q = filters.search.trim().toLowerCase();
  return rows.filter((o) => {
    if (filters.status === 'open' && !isOpenObjective(o)) return false;
    if (filters.status === 'overdue' && !isOverdue(o, today)) return false;
    if (filters.status !== 'all' && filters.status !== 'open' && filters.status !== 'overdue' && o.status !== filters.status) return false;
    if (filters.category !== 'all' && o.category !== filters.category) return false;
    if (filters.ownerId !== 'all' && o.owner_profile_id !== filters.ownerId) return false;
    if (filters.crewId !== 'all' && o.profile_id !== filters.crewId) return false;
    if (filters.vesselId !== 'all') {
      const v = vesselOfProfile(o.profile_id);
      if (filters.vesselId === 'none' ? v !== null : v !== filters.vesselId) return false;
    }
    if (q) {
      const hay = [o.title, o.description, o.measure, o.crew_name, o.owner_name, o.category].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
};

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

const optionalText = z.string().optional().or(z.literal(''));
const optionalDate = z
  .string()
  .optional()
  .or(z.literal(''))
  .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use the date picker');

export const objectiveFormSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Keep the title under 200 characters'),
  category: z.enum(OBJECTIVE_CATEGORIES),
  description: optionalText,
  measure: optionalText,
  target_date: optionalDate,
  weight: z
    .string()
    .min(1, 'Weight is required')
    .refine((v) => /^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 10, 'Weight must be between 1 and 10'),
  owner_profile_id: z.string().optional().or(z.literal('')),
  linked_course_id: z.string().optional().or(z.literal('')),
  linked_application_id: z.string().optional().or(z.literal('')),
  review_id: z.string().optional().or(z.literal('')),
  notes: optionalText,
});

export type ObjectiveFormValues = z.infer<typeof objectiveFormSchema>;

export type ObjectiveWritePayload = Omit<
  TablesInsert<'crew_objectives'>,
  'id' | 'company_id' | 'profile_id' | 'created_by' | 'updated_by' | 'created_at' | 'updated_at' | 'progress_pct' | 'status' | 'completed_at'
>;

const nullIfEmpty = (v: string | undefined): string | null => (v && v.trim() ? v.trim() : null);

export const emptyObjectiveFormValues = (defaults: Partial<ObjectiveFormValues> = {}): ObjectiveFormValues => ({
  title: '',
  category: 'performance',
  description: '',
  measure: '',
  target_date: '',
  weight: '5',
  owner_profile_id: '',
  linked_course_id: '',
  linked_application_id: '',
  review_id: '',
  notes: '',
  ...defaults,
});

export const objectiveToFormValues = (o: CrewObjectiveRow): ObjectiveFormValues => ({
  title: o.title,
  category: isObjectiveCategory(o.category) ? o.category : 'performance',
  description: o.description ?? '',
  measure: o.measure ?? '',
  target_date: o.target_date ?? '',
  weight: String(o.weight),
  owner_profile_id: o.owner_profile_id ?? '',
  linked_course_id: o.linked_course_id ?? '',
  linked_application_id: o.linked_application_id ?? '',
  review_id: o.review_id ?? '',
  notes: o.notes ?? '',
});

export const formValuesToObjectivePayload = (v: ObjectiveFormValues): ObjectiveWritePayload => ({
  title: v.title.trim(),
  category: v.category,
  description: nullIfEmpty(v.description),
  measure: nullIfEmpty(v.measure),
  target_date: nullIfEmpty(v.target_date),
  weight: Number(v.weight),
  owner_profile_id: nullIfEmpty(v.owner_profile_id),
  linked_course_id: nullIfEmpty(v.linked_course_id),
  linked_application_id: nullIfEmpty(v.linked_application_id),
  review_id: nullIfEmpty(v.review_id),
  notes: nullIfEmpty(v.notes),
});

/** HR admins may delete anything; the creator may delete an objective nobody has started. */
export const canDeleteObjective = (
  o: Pick<CrewObjectiveRow, 'status' | 'created_by'>,
  actor: { canAdmin: boolean; userId: string | null | undefined },
): boolean => actor.canAdmin || (Boolean(actor.userId) && o.created_by === actor.userId && o.status === 'not_started');

/** Fields worth keeping in the audit trail (no free-text blobs). */
export const auditObjectiveSnapshot = (o: Partial<CrewObjectiveRow>): Record<string, string | number | null> => ({
  title: o.title ?? null,
  category: o.category ?? null,
  status: o.status ?? null,
  progress_pct: o.progress_pct ?? null,
  weight: o.weight ?? null,
  target_date: o.target_date ?? null,
  owner_profile_id: o.owner_profile_id ?? null,
  review_id: o.review_id ?? null,
  linked_course_id: o.linked_course_id ?? null,
  linked_application_id: o.linked_application_id ?? null,
  completed_at: o.completed_at ?? null,
});
