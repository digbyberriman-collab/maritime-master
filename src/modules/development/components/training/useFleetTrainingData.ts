/**
 * Data of Fleet › Training and the vessel Crew Training register (gap/02
 * TR1–TR3, TR5, TR7, TR8, TR10; gap/04 C62; X5-07B; D-01, D-X5-20).
 *
 * Reads:
 * - the applications a register shows: the live columns in one select
 *   (company, and for the vessel page its vessel; drafts and voided ones
 *   left out), and the 040600 `stage_entered_at` in a select of its own, so
 *   a database without 040600 still shows the register (D-X5-20) and the
 *   stale rule falls back to the older dates;
 * - the expense claims' approved reimbursements (USD columns) for the
 *   overview;
 * - the catalogue: the live course columns, and the 040600 rule columns
 *   apart (`rulesSetUp` false while they are missing: the rule fields and
 *   the catalogue actions then read "Not set up yet", because the course
 *   definers ship in the same file);
 * - the programme settings row (live columns with its `updated_at`); the
 *   040600 policy columns come from usePolicyExtras;
 * - one application's history (`development_application_events`) with the
 *   actors' names in one more read.
 *
 * Writes go through the definers only (`development_course_save`,
 * `_archive`, `_promote`, `development_settings_save`): the returned row
 * is checked before anything says "saved"; a refusal reads as its
 * sentence; a missing RPC is "not set up yet", never a fake success.
 *
 * Every key carries the company (and the vessel or application), and the
 * application keys start with the families invalidateApplicationQueries
 * refreshes after a transition.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import type { Json } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { isMissingRelation } from '@/integrations/supabase/pending';
import { notify } from '@/shared/lib/notify';
import { developmentDb } from '../../hooks/developmentDb';
import { courseRefusalMessage, toCoursePayload, type CourseValues } from '../../lib/courseSchema';
import { settingsRefusalMessage, toSettingsPayload, type ProgramSettingsValues, type ProgramPolicy } from '../../lib/settingsSchema';
import type { DevelopmentApplicationEventAction, DevelopmentCourseRuleColumns } from '../../types/db.pending';
import type { ApplicationActor, ApplicationStatus } from '../../lib/applicationMachine';
import {
  FLEET_APPLICATION_COLUMNS,
  FLEET_APPLICATION_CREW_EMBED,
  countsInFleetRegister,
  type FleetApplicationRow,
} from './fleetTrainingModel';

// ─── keys ─────────────────────────────────────────────────────────────────

export const fleetTrainingKeys = {
  /** Under 'fleet-development-applications' / 'crew-training-all', so transitions refresh them. */
  register: (companyId: string | null, vesselId: string | null) =>
    vesselId ? (['crew-training-all', companyId, vesselId] as const) : (['fleet-development-applications', companyId, 'register'] as const),
  stages: (companyId: string | null, vesselId: string | null) => ['development-application-lifecycle', companyId, vesselId ?? 'fleet', 'stages'] as const,
  expenses: (companyId: string | null) => ['fleet-development-expenses', companyId, 'totals'] as const,
  catalogue: (companyId: string | null) => ['development-courses', companyId, 'catalogue-admin'] as const,
  settingsRow: (companyId: string | null) => ['development-program-settings', companyId, 'row'] as const,
  events: (applicationId: string | null) => ['development-application-lifecycle', applicationId, 'events'] as const,
};

/** A read's state: loading, an error with Retry, or the data with its freshness. */
export type ReadState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: unknown; retry: () => void }
  | ({ status: 'ready'; updatedAt: number; refreshing: boolean; retry: () => void } & T);

const NOT_SET_UP = 'This part of Training is not set up yet, so nothing was changed.';

/** An error the page shows as its sentence (refusals, not set up, unconfirmed). */
export class TrainingWriteError extends Error {
  constructor(message: string, readonly notSetUp = false) {
    super(message);
    this.name = 'TrainingWriteError';
  }
}

// ─── applications ─────────────────────────────────────────────────────────

type StageRow = { id: string; stage_entered_at: string | null };

export interface RegisterData {
  rows: FleetApplicationRow[];
  /** stage_entered_at could be read (040600 applied). */
  stagesSetUp: boolean;
}

/**
 * The applications of the company (fleet page) or of one vessel (vessel
 * page) the reader may see (RLS decides), drafts and voided ones left out.
 */
export function useTrainingRegister(companyId: string | null, vesselId: string | null = null, enabled = true): ReadState<RegisterData> {
  const live = useQuery({
    queryKey: fleetTrainingKeys.register(companyId, vesselId),
    enabled: enabled && Boolean(companyId),
    queryFn: async (): Promise<FleetApplicationRow[]> => {
      let query = supabase
        .from('development_applications')
        .select(`${FLEET_APPLICATION_COLUMNS.join(', ')}, ${FLEET_APPLICATION_CREW_EMBED}`)
        .eq('company_id', companyId as string)
        .neq('status', 'voided')
        .neq('status', 'draft');
      if (vesselId) query = query.eq('vessel_id', vesselId);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as FleetApplicationRow[]).filter((r) => countsInFleetRegister(r.status));
    },
  });
  const stages = useQuery({
    queryKey: fleetTrainingKeys.stages(companyId, vesselId),
    enabled: enabled && Boolean(companyId),
    queryFn: async (): Promise<{ setUp: boolean; byId: Map<string, string | null> }> => {
      let query = developmentDb
        .from('development_applications')
        .select('id, stage_entered_at')
        .eq('company_id', companyId as string)
        .neq('status', 'voided')
        .neq('status', 'draft');
      if (vesselId) query = query.eq('vessel_id', vesselId);
      const { data, error } = await query;
      if (error) {
        if (isMissingRelation(error)) return { setUp: false, byId: new Map() };
        throw error;
      }
      return { setUp: true, byId: new Map(((data ?? []) as StageRow[]).map((r) => [r.id, r.stage_entered_at] as const)) };
    },
  });

  const retry = () => {
    void live.refetch();
    void stages.refetch();
  };
  if (live.isError) return { status: 'error', error: live.error, retry };
  if (stages.isError) return { status: 'error', error: stages.error, retry };
  if (!live.data || !stages.data) return { status: 'loading' };
  const byId = stages.data.byId;
  const rows = live.data.map((r) => ({ ...r, stage_entered_at: byId.get(r.id) ?? null }));
  return {
    status: 'ready',
    rows,
    stagesSetUp: stages.data.setUp,
    updatedAt: Math.min(live.dataUpdatedAt, stages.dataUpdatedAt),
    refreshing: live.isFetching || stages.isFetching,
    retry,
  };
}

// ─── expense claims (overview) ────────────────────────────────────────────

export interface ExpenseTotals {
  /** Approved, paid or part-paid reimbursements, in USD (the only currency the claims are kept in). */
  reimbursedUsd: number;
  /** Claims submitted or under review. */
  pendingClaims: number;
}

const SPENT_EXPENSE = ['approved', 'paid', 'partially_paid'];
const PENDING_EXPENSE = ['submitted', 'under_review'];

export function useExpenseTotals(companyId: string | null, enabled = true): ReadState<{ totals: ExpenseTotals }> {
  const q = useQuery({
    queryKey: fleetTrainingKeys.expenses(companyId),
    enabled: enabled && Boolean(companyId),
    queryFn: async (): Promise<ExpenseTotals> => {
      const { data, error } = await supabase
        .from('development_expenses')
        .select('id, status, approved_reimbursement_usd, actual_total_usd')
        .eq('company_id', companyId as string);
      if (error) throw error;
      const rows = data ?? [];
      return {
        reimbursedUsd: rows
          .filter((e) => SPENT_EXPENSE.includes(e.status))
          .reduce((sum, e) => sum + Number(e.approved_reimbursement_usd ?? e.actual_total_usd ?? 0), 0),
        pendingClaims: rows.filter((e) => PENDING_EXPENSE.includes(e.status)).length,
      };
    },
  });
  if (q.isError) return { status: 'error', error: q.error, retry: () => void q.refetch() };
  if (!q.data) return { status: 'loading' };
  return { status: 'ready', totals: q.data, updatedAt: q.dataUpdatedAt, refreshing: q.isFetching, retry: () => void q.refetch() };
}

// ─── catalogue ────────────────────────────────────────────────────────────

const COURSE_LIVE_COLUMNS =
  'id, catalogue_number, name, department, sub_section, category, format, duration_description, renewal_period, reimbursement_summary, notes, contact_person, over_4k_rule, requires_fleet_doctor_agreement, tags, status, updated_at';
const COURSE_RULE_COLUMNS =
  'id, valid_for_months, renew_from_months, applies_to_departments, applies_to_positions, is_mandatory, renewal_note, pathway, origin, proposed_by, proposed_from_application_id, qualification_label, qualification_document_type_id';

export interface CatalogueCourse {
  id: string;
  catalogue_number: number | null;
  name: string;
  department: string;
  sub_section: string | null;
  category: string;
  format: string | null;
  duration_description: string | null;
  renewal_period: string | null;
  reimbursement_summary: string | null;
  notes: string | null;
  contact_person: string | null;
  over_4k_rule: boolean | null;
  requires_fleet_doctor_agreement: boolean | null;
  tags: string[] | null;
  status: string;
  updated_at: string | null;
  /** The 040600 rules, or null while they are not set up. */
  rules: DevelopmentCourseRuleColumns | null;
}

export interface CatalogueData {
  courses: CatalogueCourse[];
  /** The rule columns (and so the course definers) are in the database. */
  rulesSetUp: boolean;
}

export function useCatalogueAdmin(companyId: string | null, enabled = true): ReadState<CatalogueData> {
  const q = useQuery({
    queryKey: fleetTrainingKeys.catalogue(companyId),
    enabled: enabled && Boolean(companyId),
    queryFn: async (): Promise<CatalogueData> => {
      const [live, rules] = await Promise.all([
        supabase.from('development_courses').select(COURSE_LIVE_COLUMNS).eq('company_id', companyId as string).order('category').order('name'),
        developmentDb.from('development_courses').select(COURSE_RULE_COLUMNS).eq('company_id', companyId as string),
      ]);
      if (live.error) throw live.error;
      let rulesSetUp = true;
      let byId = new Map<string, DevelopmentCourseRuleColumns>();
      if (rules.error) {
        if (!isMissingRelation(rules.error)) throw rules.error;
        rulesSetUp = false;
      } else {
        byId = new Map(((rules.data ?? []) as Array<DevelopmentCourseRuleColumns & { id: string }>).map(({ id, ...r }) => [id, r] as const));
      }
      const courses = ((live.data ?? []) as Array<Omit<CatalogueCourse, 'rules'>>).map((c) => ({ ...c, rules: byId.get(c.id) ?? null }));
      return { courses, rulesSetUp };
    },
  });
  if (q.isError) return { status: 'error', error: q.error, retry: () => void q.refetch() };
  if (!q.data) return { status: 'loading' };
  return { status: 'ready', ...q.data, updatedAt: q.dataUpdatedAt, refreshing: q.isFetching, retry: () => void q.refetch() };
}

/** The sentence for a failed catalogue write (definer refusal, missing RPC, anything else). */
function courseWriteError(error: PostgrestError | null): TrainingWriteError {
  if (isMissingRelation(error)) return new TrainingWriteError(NOT_SET_UP, true);
  return new TrainingWriteError(courseRefusalMessage(error) ?? error?.message ?? 'The catalogue did not change. Try again.');
}

type SavedCourse = { id?: string | null; company_id?: string | null; name?: string | null };

/** A row back from a course definer that is this company's course (and, for an edit, the course edited). */
function confirmCourse(data: unknown, companyId: string, expectedId: string | null): SavedCourse {
  const row = (Array.isArray(data) ? data[0] : data) as SavedCourse | null;
  if (!row || typeof row.id !== 'string' || row.company_id !== companyId || (expectedId && row.id !== expectedId)) {
    throw new TrainingWriteError('The catalogue did not confirm the change. Reload it to see where it stands.');
  }
  return row;
}

function useCatalogueInvalidate(companyId: string | null) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['development-courses', companyId] });
    void queryClient.invalidateQueries({ queryKey: ['fleet-development-applications', companyId] });
  };
}

/** Creates (no existing) or updates a course through development_course_save. */
export function useSaveCourse(companyId: string | null) {
  const invalidate = useCatalogueInvalidate(companyId);
  return useMutation({
    mutationFn: async ({ values, existing }: { values: CourseValues; existing: { id: string; updated_at: string | null } | null }) => {
      if (!companyId) throw new TrainingWriteError('Your company is not known yet. Reload and try again.');
      const { data, error } = await developmentDb.rpc('development_course_save', { p_course: toCoursePayload(values, existing) as Json });
      if (error) throw courseWriteError(error);
      return confirmCourse(data, companyId, existing?.id ?? null);
    },
    onSuccess: (row, { existing }) => {
      invalidate();
      notify.success(existing ? 'Course saved' : 'Course added to the catalogue', { description: row.name ?? undefined });
    },
  });
}

/** Archives (or restores) a course through development_course_archive. */
export function useArchiveCourse(companyId: string | null) {
  const invalidate = useCatalogueInvalidate(companyId);
  return useMutation({
    mutationFn: async ({ courseId, archived }: { courseId: string; archived: boolean }) => {
      if (!companyId) throw new TrainingWriteError('Your company is not known yet. Reload and try again.');
      const { data, error } = await developmentDb.rpc('development_course_archive', { p_course_id: courseId, p_archived: archived });
      if (error) throw courseWriteError(error);
      const row = confirmCourse(data, companyId, courseId) as SavedCourse & { status?: string | null };
      if (row.status !== (archived ? 'archived' : 'active')) throw new TrainingWriteError('The catalogue did not confirm the change. Reload it to see where it stands.');
      return row;
    },
    onSuccess: (_row, { archived }) => {
      invalidate();
      notify.success(archived ? 'Course archived' : 'Course restored');
    },
    onError: (err: unknown) => notify.error(err, { title: 'Nothing was changed' }),
  });
}

/** Adds a crew member's proposed course to the catalogue (development_course_promote, TR8). */
export function usePromoteProposal(companyId: string | null) {
  const invalidate = useCatalogueInvalidate(companyId);
  return useMutation({
    mutationFn: async ({ applicationId }: { applicationId: string }) => {
      if (!companyId) throw new TrainingWriteError('Your company is not known yet. Reload and try again.');
      const { data, error } = await developmentDb.rpc('development_course_promote', { p_application_id: applicationId });
      if (error) throw courseWriteError(error);
      const row = confirmCourse(data, companyId, null) as SavedCourse & { proposed_from_application_id?: string | null };
      if (row.proposed_from_application_id !== applicationId) throw new TrainingWriteError('The catalogue did not confirm the change. Reload it to see where it stands.');
      return row;
    },
    onSuccess: (row) => {
      invalidate();
      notify.success('Added to the catalogue', { description: row.name ?? undefined });
    },
    onError: (err: unknown) => notify.error(err, { title: 'Nothing was changed' }),
  });
}

// ─── programme settings ───────────────────────────────────────────────────

const SETTINGS_LIVE_COLUMNS =
  'id, accommodation_cap_per_night_usd, food_per_diem_usd, professional_split_threshold_usd, clawback_months, eligibility_service_days, probation_default_days, online_neutral_threshold_hours, anniversary_window_days, business_class_flights_allowed, updated_at';

export interface SettingsRow extends ProgramPolicy {
  id: string;
  updated_at: string;
}

/** The company's settings row, or null when it has none yet (the column defaults then apply). */
export function useSettingsRow(companyId: string | null, enabled = true): ReadState<{ row: SettingsRow | null }> {
  const q = useQuery({
    queryKey: fleetTrainingKeys.settingsRow(companyId),
    enabled: enabled && Boolean(companyId),
    queryFn: async (): Promise<SettingsRow | null> => {
      const { data, error } = await supabase.from('program_settings').select(SETTINGS_LIVE_COLUMNS).eq('company_id', companyId as string).maybeSingle();
      if (error) throw error;
      return (data as SettingsRow | null) ?? null;
    },
  });
  if (q.isError) return { status: 'error', error: q.error, retry: () => void q.refetch() };
  if (q.data === undefined) return { status: 'loading' };
  return { status: 'ready', row: q.data, updatedAt: q.dataUpdatedAt, refreshing: q.isFetching, retry: () => void q.refetch() };
}

/** Saves the settings through development_settings_save (the stale guard on the row's updated_at). */
export function useSaveSettings(companyId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ values, expectedUpdatedAt }: { values: ProgramSettingsValues; expectedUpdatedAt: string | null }) => {
      if (!companyId) throw new TrainingWriteError('Your company is not known yet. Reload and try again.');
      const { data, error } = await developmentDb.rpc('development_settings_save', { p_settings: toSettingsPayload(values, expectedUpdatedAt) as Json });
      if (error) {
        if (isMissingRelation(error)) throw new TrainingWriteError(NOT_SET_UP, true);
        throw new TrainingWriteError(settingsRefusalMessage(error) ?? error.message ?? 'The settings did not change. Try again.');
      }
      const row = (Array.isArray(data) ? data[0] : data) as { company_id?: string | null } | null;
      if (!row || row.company_id !== companyId) throw new TrainingWriteError('The settings did not confirm the change. Reload them to see where they stand.');
      return row;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['development-program-settings', companyId] });
      notify.success('Programme settings saved');
    },
  });
}

// ─── one application's history (TR5) ─────────────────────────────────────

export interface ApplicationEvent {
  id: string;
  action: DevelopmentApplicationEventAction;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus | null;
  actorRole: ApplicationActor | null;
  /** The actor's name, or null when it cannot be read. */
  actorName: string | null;
  comment: string | null;
  /** edit_fields: `{ column: { from, to } }`. */
  fieldDiff: Record<string, { from: unknown; to: unknown }> | null;
  createdAt: string;
}

type EventRow = {
  id: string;
  action: DevelopmentApplicationEventAction;
  from_status: ApplicationStatus | null;
  to_status: ApplicationStatus | null;
  actor_role: ApplicationActor | null;
  actor_profile_id: string | null;
  comment: string | null;
  field_diff: Json | null;
  created_at: string;
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The diff of an edit_fields event; anything malformed is dropped, never shown as a change. */
export function parseFieldDiff(value: Json | null | undefined): Record<string, { from: unknown; to: unknown }> | null {
  if (!isObject(value)) return null;
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, change] of Object.entries(value)) {
    if (isObject(change) && 'from' in change && 'to' in change) out[key] = { from: change.from, to: change.to };
  }
  return Object.keys(out).length ? out : null;
}

export type EventsState =
  | { status: 'loading' }
  | { status: 'not_set_up' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; events: ApplicationEvent[] };

export function useApplicationEvents(applicationId: string | null, enabled = true): EventsState {
  const q = useQuery({
    queryKey: fleetTrainingKeys.events(applicationId),
    enabled: enabled && Boolean(applicationId),
    queryFn: async (): Promise<ApplicationEvent[] | 'not_set_up'> => {
      const { data, error } = await developmentDb
        .from('development_application_events')
        .select('id, action, from_status, to_status, actor_role, actor_profile_id, comment, field_diff, created_at')
        .eq('application_id', applicationId as string)
        .order('created_at', { ascending: true });
      if (error) {
        if (isMissingRelation(error)) return 'not_set_up';
        throw error;
      }
      const rows = (data ?? []) as EventRow[];
      const ids = [...new Set(rows.map((r) => r.actor_profile_id).filter((id): id is string => Boolean(id)))];
      const names = new Map<string, string>();
      if (ids.length) {
        const people = await supabase.from('profiles').select('id, first_name, last_name').in('id', ids);
        // A name that cannot be read is shown as such; the history itself still shows.
        for (const p of people.data ?? []) {
          const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
          if (name) names.set(p.id, name);
        }
      }
      return rows.map((r) => ({
        id: r.id,
        action: r.action,
        fromStatus: r.from_status,
        toStatus: r.to_status,
        actorRole: r.actor_role,
        actorName: r.actor_profile_id ? names.get(r.actor_profile_id) ?? null : null,
        comment: r.comment,
        fieldDiff: parseFieldDiff(r.field_diff),
        createdAt: r.created_at,
      }));
    },
  });
  if (q.isError) return { status: 'error', error: q.error, retry: () => void q.refetch() };
  if (q.data === undefined) return { status: 'loading' };
  if (q.data === 'not_set_up') return { status: 'not_set_up' };
  return { status: 'ready', events: q.data };
}
