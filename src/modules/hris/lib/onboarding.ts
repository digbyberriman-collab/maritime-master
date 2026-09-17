import { differenceInCalendarDays, isValid, parseISO, startOfQuarter } from 'date-fns';
import type { Json, Tables } from '@/integrations/supabase/types';

/**
 * Pure helpers for the HR onboarding (induction) page. No React, no
 * Supabase: everything here is unit-testable and shared between the hooks
 * and the components.
 */

export type OnboardingItemRow = Tables<'onboarding_items'>;
export type OnboardingRecordRow = Tables<'onboarding_records'>;
export type OnboardingTemplateRow = Tables<'onboarding_templates'>;

export type OnboardingOwner = 'hr' | 'finance' | 'vessel' | 'employee' | 'buddy';
export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'cancelled';

export const ONBOARDING_OWNERS: readonly OnboardingOwner[] = ['hr', 'finance', 'vessel', 'employee', 'buddy'];
export const ONBOARDING_STATUSES: readonly OnboardingStatus[] = ['not_started', 'in_progress', 'completed', 'cancelled'];

export const OWNER_LABELS: Record<OnboardingOwner, string> = {
  hr: 'HR',
  finance: 'Finance',
  vessel: 'Vessel',
  employee: 'Employee',
  buddy: 'Buddy',
};

export const STATUS_LABELS: Record<OnboardingStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const isOnboardingOwner = (value: unknown): value is OnboardingOwner =>
  typeof value === 'string' && (ONBOARDING_OWNERS as readonly string[]).includes(value);

export const isOnboardingStatus = (value: unknown): value is OnboardingStatus =>
  typeof value === 'string' && (ONBOARDING_STATUSES as readonly string[]).includes(value);

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export interface TemplateItem {
  title: string;
  owner: OnboardingOwner;
  /** Days relative to the start date; negative = before joining. */
  due_offset_days: number;
  required: boolean;
}

export interface TemplateSection {
  section: string;
  items: TemplateItem[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const toInt = (value: unknown, fallback: number): number => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : fallback;
};

/** Tolerant parse of `onboarding_templates.sections` (jsonb) into typed sections. Malformed entries are dropped. */
export const parseTemplateSections = (json: Json | unknown): TemplateSection[] => {
  if (!Array.isArray(json)) return [];
  const sections: TemplateSection[] = [];
  for (const raw of json) {
    if (!isRecord(raw)) continue;
    const name = typeof raw.section === 'string' ? raw.section.trim() : '';
    const items: TemplateItem[] = [];
    if (Array.isArray(raw.items)) {
      for (const item of raw.items) {
        if (!isRecord(item)) continue;
        const title = typeof item.title === 'string' ? item.title.trim() : '';
        if (!title) continue;
        items.push({
          title,
          owner: isOnboardingOwner(item.owner) ? item.owner : 'hr',
          due_offset_days: toInt(item.due_offset_days, 0),
          required: typeof item.required === 'boolean' ? item.required : true,
        });
      }
    }
    sections.push({ section: name || 'General', items });
  }
  return sections;
};

/** Serialise typed sections back to the jsonb shape the `onboarding_start` RPC reads. */
export const serialiseTemplateSections = (sections: TemplateSection[]): Json =>
  sections.map((s) => ({
    section: s.section,
    items: s.items.map((i) => ({ title: i.title, owner: i.owner, due_offset_days: i.due_offset_days, required: i.required })),
  }));

export interface TemplateDraft {
  name: string;
  sections: TemplateSection[];
}

/** Returns a list of human-readable problems; empty when the draft is valid. */
export const validateTemplate = (draft: TemplateDraft): string[] => {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push('Template name is required.');
  if (draft.sections.length === 0) errors.push('Add at least one section.');
  const seenSections = new Set<string>();
  draft.sections.forEach((section, sIdx) => {
    const label = section.section.trim() || `Section ${sIdx + 1}`;
    if (!section.section.trim()) errors.push(`Section ${sIdx + 1} needs a name.`);
    const key = section.section.trim().toLowerCase();
    if (key && seenSections.has(key)) errors.push(`Duplicate section name "${section.section.trim()}".`);
    seenSections.add(key);
    if (section.items.length === 0) errors.push(`"${label}" has no items.`);
    section.items.forEach((item, iIdx) => {
      if (!item.title.trim()) errors.push(`"${label}" item ${iIdx + 1} needs a title.`);
      if (!isOnboardingOwner(item.owner)) errors.push(`"${label}" item ${iIdx + 1} has an unknown owner.`);
      if (!Number.isInteger(item.due_offset_days)) errors.push(`"${label}" item ${iIdx + 1} due offset must be a whole number of days.`);
      if (Math.abs(item.due_offset_days) > 365) errors.push(`"${label}" item ${iIdx + 1} due offset must be within ±365 days.`);
    });
  });
  return errors;
};

export const countTemplateItems = (sections: TemplateSection[]): { total: number; required: number } =>
  sections.reduce(
    (acc, s) => {
      acc.total += s.items.length;
      acc.required += s.items.filter((i) => i.required).length;
      return acc;
    },
    { total: 0, required: 0 },
  );

/** Starting point for a new template in the editor. */
export const DEFAULT_TEMPLATE_SECTIONS: TemplateSection[] = [
  {
    section: 'Before joining',
    items: [
      { title: 'Signed employment contract / SEA on file', owner: 'hr', due_offset_days: -7, required: true },
      { title: 'Passport, visa and medical certificate verified', owner: 'hr', due_offset_days: -7, required: true },
      { title: 'Next of kin recorded', owner: 'hr', due_offset_days: -3, required: true },
      { title: 'Bank details received', owner: 'finance', due_offset_days: -3, required: true },
      { title: 'Login invitation sent', owner: 'hr', due_offset_days: -2, required: true },
    ],
  },
  {
    section: 'First day',
    items: [
      { title: 'Cabin, uniform and equipment issued', owner: 'vessel', due_offset_days: 0, required: true },
      { title: 'ISM familiarisation started', owner: 'vessel', due_offset_days: 0, required: true },
    ],
  },
  {
    section: 'First month',
    items: [
      { title: 'Required reading acknowledged', owner: 'employee', due_offset_days: 14, required: true },
      { title: '30-day check-in with HOD', owner: 'vessel', due_offset_days: 30, required: true },
    ],
  },
];

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export interface ItemSectionGroup {
  section: string;
  items: OnboardingItemRow[];
  total: number;
  done: number;
  requiredTotal: number;
  requiredDone: number;
  overdue: number;
}

const parseDay = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
};

/** Calendar days from `today` to the item's due date (negative = past). Null when undated. */
export const itemDaysUntilDue = (item: Pick<OnboardingItemRow, 'due_date'>, today: Date = new Date()): number | null => {
  const due = parseDay(item.due_date);
  return due ? differenceInCalendarDays(due, today) : null;
};

/** An open item whose due date is strictly before today. */
export const isItemOverdue = (item: Pick<OnboardingItemRow, 'completed' | 'due_date'>, today: Date = new Date()): boolean => {
  if (item.completed) return false;
  const days = itemDaysUntilDue(item, today);
  return days !== null && days < 0;
};

export type ItemTone = 'done' | 'overdue' | 'due_soon' | 'upcoming' | 'undated';

export const itemTone = (item: Pick<OnboardingItemRow, 'completed' | 'due_date'>, today: Date = new Date()): ItemTone => {
  if (item.completed) return 'done';
  const days = itemDaysUntilDue(item, today);
  if (days === null) return 'undated';
  if (days < 0) return 'overdue';
  if (days <= 3) return 'due_soon';
  return 'upcoming';
};

export const countOverdueItems = (items: readonly Pick<OnboardingItemRow, 'completed' | 'due_date'>[], today: Date = new Date()): number =>
  items.filter((i) => isItemOverdue(i, today)).length;

/** Groups items by section in first-seen `sort_order` order, keeping items sorted within each section. */
export const groupItemsBySection = (items: readonly OnboardingItemRow[], today: Date = new Date()): ItemSectionGroup[] => {
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  const groups = new Map<string, ItemSectionGroup>();
  for (const item of sorted) {
    const key = item.section || 'General';
    let group = groups.get(key);
    if (!group) {
      group = { section: key, items: [], total: 0, done: 0, requiredTotal: 0, requiredDone: 0, overdue: 0 };
      groups.set(key, group);
    }
    group.items.push(item);
    group.total += 1;
    if (item.completed) group.done += 1;
    if (item.required) {
      group.requiredTotal += 1;
      if (item.completed) group.requiredDone += 1;
    }
    if (isItemOverdue(item, today)) group.overdue += 1;
  }
  return Array.from(groups.values());
};

/** Mirrors `onboarding_recompute()`: percentage of required items completed. */
export const completionPercent = (items: readonly Pick<OnboardingItemRow, 'completed' | 'required'>[]): number => {
  const required = items.filter((i) => i.required);
  if (required.length === 0) return 0;
  return Math.round((required.filter((i) => i.completed).length / required.length) * 100);
};

export interface ItemPermissionContext {
  canEdit: boolean;
  isSubject: boolean;
  isBuddy: boolean;
}

/** Mirrors the `onboarding_items_write` RLS policy. */
export const canCompleteItem = (item: Pick<OnboardingItemRow, 'owner'>, ctx: ItemPermissionContext): boolean => {
  if (ctx.canEdit) return true;
  if (item.owner === 'employee' && ctx.isSubject) return true;
  if (item.owner === 'buddy' && ctx.isBuddy) return true;
  return false;
};

/** The next `sort_order` for an ad-hoc item. */
export const nextSortOrder = (items: readonly Pick<OnboardingItemRow, 'sort_order'>[]): number =>
  items.reduce((max, i) => Math.max(max, i.sort_order), 0) + 1;

// ---------------------------------------------------------------------------
// Readiness (stitched read-only checks)
// ---------------------------------------------------------------------------

export interface ReadinessCheck {
  key: string;
  label: string;
  /** True when satisfied. */
  ok: boolean;
  /** True when we could not determine the state (e.g. no permission to read the source). */
  unknown?: boolean;
  detail: string;
  /** Deep link into the HRIS page that fixes it. */
  link?: string;
  /** Inline action key handled by the page (e.g. 'send_invitation'). */
  action?: 'send_invitation';
}

/** Percentage of known checks that pass; 0 when nothing is known. */
export const computeReadinessScore = (checks: readonly Pick<ReadinessCheck, 'ok' | 'unknown'>[]): number => {
  const known = checks.filter((c) => !c.unknown);
  if (known.length === 0) return 0;
  return Math.round((known.filter((c) => c.ok).length / known.length) * 100);
};

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export interface JoinerSourceContract {
  profile_id: string;
  start_date: string;
  status: string;
  vessel_id: string | null;
}

export interface JoinerSourceAssignment {
  user_id: string;
  join_date: string;
  vessel_id: string;
}

export interface JoinerDirectoryEntry {
  id: string;
  user_id: string | null;
  displayName: string;
  rank: string | null;
  department: string | null;
  vessel_id: string | null;
  vessel_name: string | null;
}

export type JoinerSource = 'onboarding' | 'contract' | 'assignment';

export interface JoinerRow {
  profileId: string;
  name: string;
  rank: string | null;
  department: string | null;
  vesselId: string | null;
  vesselName: string | null;
  startDate: string;
  daysUntilStart: number;
  source: JoinerSource;
  record: OnboardingRecordRow | null;
  status: OnboardingStatus | null;
  completionPct: number | null;
  buddyProfileId: string | null;
}

export interface JoinerWindow {
  /** Days back from today to include recent joiners (default 30). */
  pastDays: number;
  /** Days ahead from today (default 30). */
  futureDays: number;
}

export const DEFAULT_JOINER_WINDOW: JoinerWindow = { pastDays: 30, futureDays: 30 };

const withinWindow = (date: string, today: Date, window: JoinerWindow): number | null => {
  const d = parseDay(date);
  if (!d) return null;
  const days = differenceInCalendarDays(d, today);
  return days >= -window.pastDays && days <= window.futureDays ? days : null;
};

/**
 * One row per crew member with a start date in the window, merging three
 * sources in priority order: onboarding record > contract start > crew
 * assignment join date. Open onboarding records are always included even
 * when their start date has drifted out of the window.
 */
export const mergeJoinerSources = (input: {
  records: readonly OnboardingRecordRow[];
  contracts: readonly JoinerSourceContract[];
  assignments: readonly JoinerSourceAssignment[];
  directory: readonly JoinerDirectoryEntry[];
  vesselName?: (id: string | null) => string | null;
  today?: Date;
  window?: JoinerWindow;
}): JoinerRow[] => {
  const today = input.today ?? new Date();
  const window = input.window ?? DEFAULT_JOINER_WINDOW;
  const byProfile = new Map(input.directory.map((e) => [e.id, e]));
  const byUser = new Map(input.directory.filter((e) => e.user_id).map((e) => [e.user_id as string, e]));
  const rows = new Map<string, JoinerRow>();
  const vesselName = input.vesselName ?? (() => null);

  const base = (entry: JoinerDirectoryEntry, startDate: string, days: number, source: JoinerSource, vesselId: string | null): JoinerRow => ({
    profileId: entry.id,
    name: entry.displayName,
    rank: entry.rank,
    department: entry.department,
    vesselId: vesselId ?? entry.vessel_id,
    vesselName: (vesselId ? vesselName(vesselId) : null) ?? entry.vessel_name ?? vesselName(entry.vessel_id),
    startDate,
    daysUntilStart: days,
    source,
    record: null,
    status: null,
    completionPct: null,
    buddyProfileId: null,
  });

  // 1. Onboarding records (latest per profile wins).
  const latestRecords = [...input.records].sort((a, b) => b.start_date.localeCompare(a.start_date));
  for (const r of latestRecords) {
    if (rows.has(r.profile_id)) continue;
    const entry = byProfile.get(r.profile_id);
    if (!entry) continue;
    const days = withinWindow(r.start_date, today, window);
    const open = r.status === 'not_started' || r.status === 'in_progress';
    if (days === null && !open) continue;
    const d = parseDay(r.start_date);
    rows.set(r.profile_id, {
      ...base(entry, r.start_date, days ?? (d ? differenceInCalendarDays(d, today) : 0), 'onboarding', r.vessel_id),
      record: r,
      status: isOnboardingStatus(r.status) ? r.status : null,
      completionPct: r.completion_pct,
      buddyProfileId: r.buddy_profile_id,
    });
  }

  // 2. Contracts starting in the window (active or draft).
  for (const c of input.contracts) {
    if (rows.has(c.profile_id)) continue;
    if (c.status !== 'active' && c.status !== 'draft') continue;
    const entry = byProfile.get(c.profile_id);
    if (!entry) continue;
    const days = withinWindow(c.start_date, today, window);
    if (days === null) continue;
    rows.set(c.profile_id, base(entry, c.start_date, days, 'contract', c.vessel_id));
  }

  // 3. Assignments joining in the window.
  for (const a of input.assignments) {
    const entry = byUser.get(a.user_id);
    if (!entry || rows.has(entry.id)) continue;
    const days = withinWindow(a.join_date, today, window);
    if (days === null) continue;
    rows.set(entry.id, base(entry, a.join_date, days, 'assignment', a.vessel_id));
  }

  return Array.from(rows.values()).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name));
};

export interface OnboardingKpis {
  joinersNext30: number;
  inProgress: number;
  overdueItems: number;
  completedThisQuarter: number;
}

export const computeOnboardingKpis = (input: {
  joiners: readonly JoinerRow[];
  records: readonly OnboardingRecordRow[];
  openItems: readonly Pick<OnboardingItemRow, 'completed' | 'due_date' | 'record_id'>[];
  today?: Date;
}): OnboardingKpis => {
  const today = input.today ?? new Date();
  const quarterStart = startOfQuarter(today);
  const activeRecordIds = new Set(input.records.filter((r) => r.status === 'in_progress' || r.status === 'not_started').map((r) => r.id));
  return {
    joinersNext30: input.joiners.filter((j) => j.daysUntilStart >= 0 && j.daysUntilStart <= 30).length,
    inProgress: input.records.filter((r) => r.status === 'in_progress').length,
    overdueItems: input.openItems.filter((i) => activeRecordIds.has(i.record_id) && isItemOverdue(i, today)).length,
    completedThisQuarter: input.records.filter((r) => {
      if (r.status !== 'completed') return false;
      const done = r.completed_at ? new Date(r.completed_at) : null;
      return done !== null && isValid(done) && done >= quarterStart;
    }).length,
  };
};

export interface JoinerFilters {
  status: OnboardingStatus | 'all' | 'none';
  vesselId: string | 'all';
  search: string;
}

export const DEFAULT_JOINER_FILTERS: JoinerFilters = { status: 'all', vesselId: 'all', search: '' };

export const filterJoiners = (rows: readonly JoinerRow[], filters: JoinerFilters): JoinerRow[] => {
  const q = filters.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (filters.vesselId !== 'all' && r.vesselId !== filters.vesselId) return false;
    if (filters.status === 'none' && r.record) return false;
    if (filters.status !== 'all' && filters.status !== 'none' && r.status !== filters.status) return false;
    if (q && !`${r.name} ${r.rank ?? ''} ${r.vesselName ?? ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
};
