// Data layer for the Hours of Work and Rest module (gap/04 C37-C46;
// DECISIONS D-01, D-X1-9, D-X1-20).
//
// Two paths, one switch:
// - The engine (20261124060700_crew_hor_engine.sql): days are saved, filled
//   and months moved through work_rest_save_day / work_rest_fill_days /
//   work_rest_month_transition; the server computes the breaches and refuses
//   every direct write.
// - The legacy path (today's): direct writes of the day, its blocks, the
//   breaches the browser computed, the month status and the signatures.
//   It runs only while the RPCs are missing. `isEngineMissing` is the one
//   rule that decides (PGRST202, or a 42883 whose message names the called
//   function; D-239): any other error is a real error. Go-live: delete the
//   legacy writers once 060700 is applied (ledger fragment crew.md, row 7).
//
// Reads use the generated types plus the pending columns of 060700; a read
// of the new columns falls back to the legacy column list while they are
// missing.

import type { Database, Json } from '@/integrations/supabase/types';
import { isMissingRelation } from '@/integrations/supabase/pending';
import {
  DailyRecord,
  DEFAULT_RULE_SET,
  DEFAULT_THRESHOLDS,
  NCStatus,
  NonConformity,
  RuleSet,
  SubmissionStatus,
  WorkRestBlock,
} from '../types';
import { parseVesselBoard, type VesselBoard } from '../lib/horBoard';
import {
  workRestDb as db,
  type FillDaysResultJson,
  type RemindResultJson,
  type ReviewBreachResultJson,
  type WorkRestVesselBreachRow,
  type MonthTransitionResultJson,
  type SaveDayResultJson,
  type WorkRestBlockArg,
  type WorkRestMonthActionArg,
  type WorkRestNonConformityNewColumns,
  type WorkRestReviewOutcome,
} from '../types/db.pending';

type Tables = Database['public']['Tables'];
type SubmissionRow = Tables['work_rest_monthly_submissions']['Row'];
type NonConformityRow = Tables['work_rest_non_conformities']['Row'];
type NonConformityUpdate = Tables['work_rest_non_conformities']['Update'];
type SubmissionUpdate = Tables['work_rest_monthly_submissions']['Update'];

// ---------- the engine switch ----------

/** The engine RPCs of 20261124060700, and the board's of 20261124060800 (X1-08). */
export const ENGINE_RPC = {
  saveDay: 'work_rest_save_day',
  fillDays: 'work_rest_fill_days',
  monthTransition: 'work_rest_month_transition',
  vesselBoard: 'work_rest_vessel_board',
  vesselBreaches: 'work_rest_vessel_breaches',
  reviewBreach: 'work_rest_review_breach',
  remind: 'work_rest_remind',
} as const;
export type EngineRpc = (typeof ENGINE_RPC)[keyof typeof ENGINE_RPC];

/**
 * The engine is not in this database yet (D-01, D-239): PostgREST's
 * function schema-cache miss (PGRST202), or Postgres' undefined function
 * (42883) when its message names the called function itself. A 42883
 * raised inside an existing function (a helper it calls is missing) is a
 * real error, as is anything else.
 */
export function isEngineMissing(error: unknown, fn: EngineRpc): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === 'PGRST202') return true;
  return code === '42883' && typeof message === 'string' && message.includes(fn);
}

/** An engine call: applied with its answer, or the engine is missing (take the legacy path). */
export type EngineCall<T> = { applied: true; data: T } | { applied: false };

/** The engine refused (42501 who, 22023 a business rule, P0002 unknown id): its sentence and code. */
export class WorkRestRefusal extends Error {
  readonly code: string;
  readonly refusal: string;
  readonly hint: string | null;
  constructor(code: string, refusal: string, detail: string | null, hint: string | null) {
    super(detail || refusal);
    this.name = 'WorkRestRefusal';
    this.code = code;
    this.refusal = refusal;
    this.hint = hint;
  }
}

const REFUSAL_CODES = new Set(['42501', '22023', 'P0002']);

/** A refusal becomes a WorkRestRefusal (the DETAIL is the sentence to show); anything else is returned as is. */
export function asWorkRestError(error: unknown): unknown {
  if (!error || typeof error !== 'object') return error;
  const e = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  if (typeof e.code === 'string' && REFUSAL_CODES.has(e.code)) {
    return new WorkRestRefusal(
      e.code,
      typeof e.message === 'string' ? e.message : 'refused',
      typeof e.details === 'string' && e.details.trim() ? e.details : null,
      typeof e.hint === 'string' && e.hint.trim() ? e.hint : null,
    );
  }
  return error;
}

function asRecord(value: Json): Record<string, Json | undefined> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The hours-of-rest engine answered in an unexpected shape.');
  return value as Record<string, Json | undefined>;
}

const str = (v: Json | undefined): string => (typeof v === 'string' ? v : '');
const num = (v: Json | undefined): number => (typeof v === 'number' ? v : Number(v ?? 0));

/** Parses work_rest_save_day's answer. */
export function parseSaveDayResult(value: Json): SaveDayResultJson {
  const r = asRecord(value);
  const day = asRecord(r.day ?? {});
  const changes = asRecord(r.changes ?? {});
  const breaches = Array.isArray(r.breaches) ? r.breaches : [];
  return {
    record_id: str(r.record_id),
    submission_id: str(r.submission_id),
    date: str(r.date),
    day: {
      work_minutes: num(day.work_minutes),
      rest_minutes: num(day.rest_minutes),
      longest_rest_minutes: num(day.longest_rest_minutes),
      rest_period_count: num(day.rest_period_count),
      is_compliant: day.is_compliant === true,
    },
    breaches: breaches.map((b) => {
      const x = asRecord(b);
      return {
        id: str(x.id),
        rule_code: str(x.rule_code),
        severity: str(x.severity),
        is_serious: x.is_serious === true,
        measured_value: num(x.measured_value),
        threshold_value: num(x.threshold_value),
        deficit_hours: x.deficit_hours === null || x.deficit_hours === undefined ? null : num(x.deficit_hours),
      };
    }),
    changes: {
      days: num(changes.days),
      inserted: num(changes.inserted),
      updated: num(changes.updated),
      superseded: num(changes.superseded),
      deleted: num(changes.deleted),
    },
  };
}

/** Parses work_rest_fill_days' answer. */
export function parseFillDaysResult(value: Json): FillDaysResultJson {
  const r = asRecord(value);
  const changes = asRecord(r.changes ?? {});
  return {
    filled: num(r.filled),
    dates: Array.isArray(r.dates) ? r.dates.map(str) : [],
    changes: { days: num(changes.days), inserted: num(changes.inserted), updated: num(changes.updated), superseded: num(changes.superseded), deleted: num(changes.deleted) },
  };
}

/** Parses work_rest_month_transition's answer. */
export function parseMonthTransitionResult(value: Json): MonthTransitionResultJson {
  const r = asRecord(value);
  return {
    submission_id: str(r.submission_id),
    status: str(r.status),
    warnings: Array.isArray(r.warnings) ? r.warnings.map(str) : [],
    signature_id: typeof r.signature_id === 'string' ? r.signature_id : null,
  };
}

/** Work blocks as the engine takes them (work only; unmarked time is rest; whole minutes). */
export function engineBlocks(blocks: readonly WorkRestBlock[]): WorkRestBlockArg[] {
  return blocks
    .filter((b) => b.block_type === 'work')
    .map((b) => ({
      block_type: 'work' as const,
      start_minute: Math.round(b.start_minute),
      end_minute: Math.round(b.end_minute),
      category: b.category ?? null,
      notes: b.notes ?? null,
    }))
    .sort((a, b) => a.start_minute - b.start_minute);
}

/** Saves one day through the engine (gate, write, breaches of the week around it). */
export async function saveDay(opts: {
  vesselId: string;
  crewId: string;
  date: string;
  blocks: readonly WorkRestBlock[];
  note?: string | null;
}): Promise<EngineCall<SaveDayResultJson>> {
  const { data, error } = await db.rpc(ENGINE_RPC.saveDay, {
    p_vessel_id: opts.vesselId,
    p_crew_user_id: opts.crewId,
    p_date: opts.date,
    p_blocks: engineBlocks(opts.blocks) as unknown as Json,
    p_note: opts.note ?? null,
  });
  if (error) {
    if (isEngineMissing(error, ENGINE_RPC.saveDay)) return { applied: false };
    throw asWorkRestError(error);
  }
  return { applied: true, data: parseSaveDayResult(data) };
}

/** Copies one recorded day onto other days (at most 31) through the engine. */
export async function fillDays(opts: {
  vesselId: string;
  crewId: string;
  sourceDate: string;
  targetDates: readonly string[];
}): Promise<EngineCall<FillDaysResultJson>> {
  const { data, error } = await db.rpc(ENGINE_RPC.fillDays, {
    p_vessel_id: opts.vesselId,
    p_crew_user_id: opts.crewId,
    p_source_date: opts.sourceDate,
    p_target_dates: [...opts.targetDates],
  });
  if (error) {
    if (isEngineMissing(error, ENGINE_RPC.fillDays)) return { applied: false };
    throw asWorkRestError(error);
  }
  return { applied: true, data: parseFillDaysResult(data) };
}

/** Thrown when a step exists only in the engine (submit on behalf) and the engine is missing. */
export class WorkRestEngineRequired extends Error {
  constructor(message = 'This step becomes available once the hours-of-rest update is applied.') {
    super(message);
    this.name = 'WorkRestEngineRequired';
  }
}

/** The legacy writes each month action stands for while the engine is missing (today's flow). */
const LEGACY_ACTION: Record<Exclude<WorkRestMonthActionArg, 'submit_on_behalf'>, {
  status: SubmissionStatus;
  role: 'crew' | 'hod' | 'captain' | null;
  stamp: keyof SubmissionUpdate | null;
}> = {
  submit: { status: 'submitted', role: 'crew', stamp: 'crew_signed_at' },
  hod_sign: { status: 'hod_signed', role: 'hod', stamp: 'hod_signed_at' },
  // The legacy status list has no 'approved' (060700 adds it): approval stays captain_reviewed.
  approve: { status: 'captain_reviewed', role: 'captain', stamp: 'captain_reviewed_at' },
  lock: { status: 'locked', role: null, stamp: 'locked_at' },
  reopen: { status: 'reopened', role: null, stamp: 'reopened_at' },
};

/**
 * Moves a person's month on a vessel (lib/horMonth.ts rules on the server).
 * While the engine is missing, the legacy writes run instead (needs the
 * month row and the actor; submit on behalf has no legacy form and throws
 * WorkRestEngineRequired).
 */
export async function transitionMonth(opts: {
  vesselId: string;
  crewId: string;
  year: number;
  month: number;
  action: WorkRestMonthActionArg;
  reason?: string | null;
  signatureText?: string | null;
  legacy?: { submissionId: string; actorId: string };
}): Promise<{ mode: 'engine'; result: MonthTransitionResultJson } | { mode: 'legacy'; status: SubmissionStatus }> {
  const { data, error } = await db.rpc(ENGINE_RPC.monthTransition, {
    p_vessel_id: opts.vesselId,
    p_crew_user_id: opts.crewId,
    p_year: opts.year,
    p_month: opts.month,
    p_action: opts.action,
    p_reason: opts.reason ?? null,
    p_signature_text: opts.signatureText ?? null,
  });
  if (!error) return { mode: 'engine', result: parseMonthTransitionResult(data) };
  if (!isEngineMissing(error, ENGINE_RPC.monthTransition)) throw asWorkRestError(error);

  if (opts.action === 'submit_on_behalf' || !opts.legacy) throw new WorkRestEngineRequired();
  const step = LEGACY_ACTION[opts.action];
  const now = new Date().toISOString();
  if (step.role) {
    await signSubmission({ submissionId: opts.legacy.submissionId, signerId: opts.legacy.actorId, signerRole: step.role });
  }
  const patch: SubmissionUpdate = {};
  if (opts.action === 'submit') patch.submitted_at = now;
  if (step.stamp) Object.assign(patch, { [step.stamp]: now });
  if (opts.action === 'reopen') {
    patch.reopened_by = opts.legacy.actorId;
    patch.reopen_reason = opts.reason ?? null;
  }
  await updateSubmissionStatus(opts.legacy.submissionId, step.status, patch);
  await logAudit({
    submissionId: opts.legacy.submissionId,
    crewId: opts.crewId,
    actorId: opts.legacy.actorId,
    actorRole: step.role,
    action: `month_${opts.action}`,
    metadata: opts.reason ? { reason: opts.reason } : undefined,
  });
  return { mode: 'legacy', status: step.status };
}

// ---------- Submissions ----------

export interface MonthlySubmission {
  id: string;
  crew_id: string;
  vessel_id: string;
  period_year: number;
  period_month: number;
  status: SubmissionStatus;
  rule_set_id?: string | null;
  total_work_hours?: number | null;
  total_rest_hours?: number | null;
  open_non_conformities?: number | null;
  is_compliant?: boolean | null;
  submitted_at?: string | null;
  crew_signed_at?: string | null;
  hod_signed_at?: string | null;
  captain_reviewed_at?: string | null;
  locked_at?: string | null;
  reopened_at?: string | null;
  reopened_by?: string | null;
  reopen_reason?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const SUBMISSION_COLUMNS =
  'id, crew_id, vessel_id, period_year, period_month, status, rule_set_id, total_work_hours, total_rest_hours, open_non_conformities, is_compliant, submitted_at, crew_signed_at, hod_signed_at, captain_reviewed_at, locked_at, reopened_at, reopened_by, reopen_reason, created_at, updated_at';

const toSubmission = (row: SubmissionRow): MonthlySubmission => ({ ...row, status: row.status as SubmissionStatus });

/**
 * The person's month on the vessel (one per person and vessel, D-X1-20),
 * created as a blank draft when missing (the engine's guard allows that).
 * While the per-person unique of the legacy schema is in force, a month of
 * the person on another vessel answers instead (one month per person).
 */
export async function getOrCreateSubmission(opts: {
  crewId: string;
  vesselId: string;
  year: number;
  month: number;
}): Promise<MonthlySubmission> {
  const { data: existing, error: fetchErr } = await db
    .from('work_rest_monthly_submissions')
    .select(SUBMISSION_COLUMNS)
    .eq('crew_id', opts.crewId)
    .eq('vessel_id', opts.vesselId)
    .eq('period_year', opts.year)
    .eq('period_month', opts.month)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (existing) return toSubmission(existing);

  const { data: created, error: insertErr } = await db
    .from('work_rest_monthly_submissions')
    .insert({
      crew_id: opts.crewId,
      vessel_id: opts.vesselId,
      period_year: opts.year,
      period_month: opts.month,
      status: 'draft',
    })
    .select(SUBMISSION_COLUMNS)
    .single();
  if (!insertErr) return toSubmission(created);
  if (insertErr.code !== '23505') throw asWorkRestError(insertErr);

  // The legacy unique (crew_id, period_year, period_month): the person's one month, on whichever vessel.
  const { data: legacy, error: legacyErr } = await db
    .from('work_rest_monthly_submissions')
    .select(SUBMISSION_COLUMNS)
    .eq('crew_id', opts.crewId)
    .eq('period_year', opts.year)
    .eq('period_month', opts.month)
    .maybeSingle();
  if (legacyErr) throw legacyErr;
  if (!legacy) throw insertErr;
  return toSubmission(legacy);
}

export type VesselSubmissionRow = MonthlySubmission & {
  profiles: { first_name: string | null; last_name: string | null; rank: string | null; department: string | null; hod_user_id: string | null; employment_status: string | null } | null;
};

export async function listVesselSubmissions(opts: {
  vesselId: string;
  year: number;
  month: number;
  department?: string | null;
}): Promise<VesselSubmissionRow[]> {
  const { data, error } = await db
    .from('work_rest_monthly_submissions')
    .select(`${SUBMISSION_COLUMNS}, profiles!work_rest_monthly_submissions_crew_id_fkey (first_name, last_name, rank, department, hod_user_id, employment_status)`)
    .eq('vessel_id', opts.vesselId)
    .eq('period_year', opts.year)
    .eq('period_month', opts.month);
  if (error) throw error;
  const rows: VesselSubmissionRow[] = (data ?? []).map((r) => ({ ...r, status: r.status as SubmissionStatus }));
  return opts.department ? rows.filter((r) => r.profiles?.department === opts.department) : rows;
}

/** Legacy writer (refused once 060700 is applied: months move through transitionMonth). */
export async function updateSubmissionStatus(
  submissionId: string,
  status: SubmissionStatus,
  patch: Omit<SubmissionUpdate, 'status'> = {},
): Promise<MonthlySubmission> {
  const { data, error } = await db
    .from('work_rest_monthly_submissions')
    .update({ ...patch, status })
    .eq('id', submissionId)
    .select(SUBMISSION_COLUMNS)
    .single();
  if (error) throw asWorkRestError(error);
  return toSubmission(data);
}

// ---------- Vessel month matrix ----------

export interface VesselMonthCrewRow {
  crew_id: string;
  crew_name: string;
  rank: string;
  department: string;
  /** rest hours keyed by day-of-month (1..31). Null when no entry. */
  rest_by_day: Record<number, number | null>;
  /** compliance flag keyed by day-of-month (1..31). */
  compliant_by_day: Record<number, boolean | null>;
  avg_rest: number | null;
  logged_pct: number;
  status: 'compliant' | 'review' | 'non_compliant' | 'no_data';
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const monthBounds = (year: number, month: number) => {
  const lastDay = new Date(year, month, 0).getDate();
  return { start: `${year}-${pad2(month)}-01`, end: `${year}-${pad2(month)}-${pad2(lastDay)}`, lastDay };
};

/**
 * An assignment covers some day of start..end (YYYY-MM-DD): joined (join
 * date, else start date) on or before end, and left (leave date, else end
 * date, inclusive) on or after start, or still current with no end. A row
 * that is not current and has no end covers nothing. The rule of the
 * engine's work_rest_assignment_on and the board's membership (T-144).
 */
export function assignmentOverlapsMonth(
  a: { join_date: string | null; start_date: string | null; leave_date: string | null; end_date: string | null; is_current: boolean | null },
  start: string,
  end: string,
): boolean {
  const joined = (a.join_date ?? a.start_date)?.slice(0, 10) ?? null;
  if (!joined || joined > end) return false;
  const left = (a.leave_date ?? a.end_date)?.slice(0, 10) ?? null;
  return left ? left >= start : Boolean(a.is_current);
}

/**
 * The legacy vessel overview (the board's documented fallback while
 * work_rest_vessel_board is missing, X1-08): everyone assigned to the
 * vessel on any day of the month (ended and transferred-out people
 * included; T-144), with their day records of the month on this vessel.
 */
export async function listVesselMonthMatrix(opts: {
  vesselId: string;
  year: number;
  month: number;
}): Promise<VesselMonthCrewRow[]> {
  const { start, end, lastDay } = monthBounds(opts.year, opts.month);
  const { data: assignments, error: aErr } = await db
    .from('crew_assignments')
    .select('user_id, position, join_date, start_date, leave_date, end_date, is_current')
    .eq('vessel_id', opts.vesselId);
  if (aErr) throw aErr;
  const inMonth = (assignments ?? []).filter((a) => assignmentOverlapsMonth(a, start, end));
  const userIds = Array.from(new Set(inMonth.map((a) => a.user_id)));
  if (!userIds.length) return [];

  const { data: profiles, error: pErr } = await db
    .from('profiles')
    .select('user_id, first_name, last_name, rank, department')
    .in('user_id', userIds);
  if (pErr) throw pErr;

  const { data: records, error: rErr } = await db
    .from('work_rest_records')
    .select('crew_id, record_date, total_rest_minutes, is_compliant')
    .eq('vessel_id', opts.vesselId)
    .gte('record_date', start)
    .lte('record_date', end);
  if (rErr) throw rErr;

  const byCrew = new Map<string, NonNullable<typeof records>>();
  for (const r of records ?? []) {
    const list = byCrew.get(r.crew_id) ?? [];
    list.push(r);
    byCrew.set(r.crew_id, list);
  }

  return (profiles ?? []).flatMap((p) => {
    if (!p.user_id) return [];
    const recs = byCrew.get(p.user_id) ?? [];
    const rest_by_day: Record<number, number | null> = {};
    const compliant_by_day: Record<number, boolean | null> = {};
    for (let d = 1; d <= lastDay; d++) {
      rest_by_day[d] = null;
      compliant_by_day[d] = null;
    }
    let total = 0;
    let count = 0;
    let hasNonCompliant = false;
    for (const r of recs) {
      const d = Number(r.record_date.split('-')[2]);
      const hours = (r.total_rest_minutes ?? 0) / 60;
      rest_by_day[d] = hours;
      compliant_by_day[d] = r.is_compliant;
      total += hours;
      count += 1;
      if (r.is_compliant === false) hasNonCompliant = true;
    }
    const logged_pct = Math.round((count / lastDay) * 100);
    const avg_rest = count > 0 ? total / count : null;
    let status: VesselMonthCrewRow['status'] = 'no_data';
    if (count === 0) status = 'no_data';
    else if (hasNonCompliant) status = 'non_compliant';
    else if (logged_pct < 50) status = 'review';
    else status = 'compliant';
    return [{
      crew_id: p.user_id,
      crew_name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
      rank: p.rank ?? '',
      department: (p.department ?? 'OTHER').toUpperCase(),
      rest_by_day,
      compliant_by_day,
      avg_rest,
      logged_pct,
      status,
    }];
  });
}

// ---------- The vessel board and breach review (X1-08, 20261124060800) ----------

/**
 * The vessel's board for a month (work_rest_vessel_board), or
 * `{applied: false}` while the board RPC is missing (D-01: the legacy
 * overview is the documented fallback). A refusal is a WorkRestRefusal
 * (42501: not this viewer's board); an answer in an unexpected shape throws.
 */
export async function fetchVesselBoard(opts: { vesselId: string; year: number; month: number }): Promise<EngineCall<VesselBoard>> {
  const { data, error } = await db.rpc(ENGINE_RPC.vesselBoard, { p_vessel_id: opts.vesselId, p_year: opts.year, p_month: opts.month });
  if (error) {
    if (isEngineMissing(error, ENGINE_RPC.vesselBoard)) return { applied: false };
    throw asWorkRestError(error);
  }
  return { applied: true, data: parseVesselBoard(data) };
}

/** The vessel's live breaches in a range (at most a year), or `{applied: false}` while the RPC is missing. */
export async function listVesselBreaches(opts: {
  vesselId: string;
  from: string;
  to: string;
  onlyOpen?: boolean;
}): Promise<EngineCall<WorkRestVesselBreachRow[]>> {
  const { data, error } = await db.rpc(ENGINE_RPC.vesselBreaches, {
    p_vessel_id: opts.vesselId,
    p_from: opts.from,
    p_to: opts.to,
    p_only_open: opts.onlyOpen ?? false,
  });
  if (error) {
    if (isEngineMissing(error, ENGINE_RPC.vesselBreaches)) return { applied: false };
    throw asWorkRestError(error);
  }
  return { applied: true, data: (data ?? []).map((r) => ({ ...r, measured_value: numOrNull(r.measured_value), threshold_value: numOrNull(r.threshold_value), deficit_hours: numOrNull(r.deficit_hours) })) };
}

const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

/** Parses work_rest_review_breach's answer. */
export function parseReviewBreachResult(value: Json): ReviewBreachResultJson {
  const r = asRecord(value);
  const outcome = str(r.review_outcome);
  if (outcome !== 'accepted' && outcome !== 'correction_requested' && outcome !== 'dismissed') {
    throw new Error('The hours-of-rest engine answered in an unexpected shape.');
  }
  return {
    nc_id: str(r.nc_id),
    review_outcome: outcome,
    status: str(r.status),
    month_status: typeof r.month_status === 'string' ? r.month_status : null,
    reopened: r.reopened === true,
  };
}

/**
 * Reviews one breach through the engine (accepted with a justification,
 * correction_requested reopening the month, dismissed after a correction).
 * There is no legacy review: while the RPC is missing it throws
 * WorkRestEngineRequired (the panel says the review is not set up yet).
 */
export async function reviewBreach(opts: { ncId: string; outcome: WorkRestReviewOutcome; note?: string | null }): Promise<ReviewBreachResultJson> {
  const { data, error } = await db.rpc(ENGINE_RPC.reviewBreach, { p_nc_id: opts.ncId, p_outcome: opts.outcome, p_note: opts.note ?? null });
  if (error) {
    if (isEngineMissing(error, ENGINE_RPC.reviewBreach)) throw new WorkRestEngineRequired('Breach review becomes available once the hours-of-rest update is applied.');
    throw asWorkRestError(error);
  }
  return parseReviewBreachResult(data);
}

/** Parses work_rest_remind's answer. */
export function parseRemindResult(value: Json): RemindResultJson {
  const r = asRecord(value);
  const skipped = Array.isArray(r.skipped) ? r.skipped : [];
  return {
    sent: num(r.sent),
    sent_to: Array.isArray(r.sent_to) ? r.sent_to.map(str) : [],
    skipped: skipped.map((x) => {
      const o = asRecord(x);
      const reason = str(o.reason) === 'month_closed' ? ('month_closed' as const) : ('reminder_rate_limited' as const);
      return { user_id: str(o.user_id), reason };
    }),
    sent_on: str(r.sent_on),
    by_label: typeof r.by_label === 'string' ? r.by_label : null,
  };
}

/** Reminds crew of a month (one manual reminder per person and vessel a day); WorkRestEngineRequired while the RPC is missing. */
export async function remindCrew(opts: { vesselId: string; crewIds: readonly string[]; year: number; month: number }): Promise<RemindResultJson> {
  const { data, error } = await db.rpc(ENGINE_RPC.remind, {
    p_vessel_id: opts.vesselId,
    p_crew_user_ids: [...opts.crewIds],
    p_year: opts.year,
    p_month: opts.month,
  });
  if (error) {
    if (isEngineMissing(error, ENGINE_RPC.remind)) throw new WorkRestEngineRequired('Reminders become available once the hours-of-rest update is applied.');
    throw asWorkRestError(error);
  }
  return parseRemindResult(data);
}

// ---------- Records & blocks ----------

const RECORD_COLUMNS =
  'id, submission_id, crew_id, vessel_id, record_date, notes, total_work_minutes, total_rest_minutes, longest_rest_minutes, rest_period_count, is_compliant';
const BLOCK_COLUMNS = 'id, record_id, crew_id, block_type, category, start_minute, end_minute, notes';
type BlockRow = Pick<Tables['work_rest_blocks']['Row'], 'id' | 'record_id' | 'crew_id' | 'block_type' | 'category' | 'start_minute' | 'end_minute' | 'notes'>;

/** The person's day records from..to (inclusive), every vessel's, with their blocks. */
export async function loadRecordsBetween(crewId: string, from: string, to: string): Promise<DailyRecord[]> {
  const { data: records, error: e1 } = await db
    .from('work_rest_records')
    .select(RECORD_COLUMNS)
    .eq('crew_id', crewId)
    .gte('record_date', from)
    .lte('record_date', to);
  if (e1) throw e1;

  const recordIds = (records ?? []).map((r) => r.id);
  let blocks: BlockRow[] = [];
  if (recordIds.length) {
    const { data, error } = await db.from('work_rest_blocks').select(BLOCK_COLUMNS).in('record_id', recordIds);
    if (error) throw error;
    blocks = data ?? [];
  }

  return (records ?? [])
    .map((r) => ({
      id: r.id,
      submission_id: r.submission_id ?? undefined,
      crew_id: r.crew_id,
      vessel_id: r.vessel_id,
      record_date: r.record_date,
      notes: r.notes,
      total_work_minutes: r.total_work_minutes ?? undefined,
      total_rest_minutes: r.total_rest_minutes ?? undefined,
      longest_rest_minutes: r.longest_rest_minutes ?? undefined,
      rest_period_count: r.rest_period_count ?? undefined,
      is_compliant: r.is_compliant,
      blocks: blocks
        .filter((b) => b.record_id === r.id)
        .map((b) => ({
          id: b.id,
          record_id: b.record_id,
          crew_id: b.crew_id,
          block_type: b.block_type === 'rest' ? ('rest' as const) : ('work' as const),
          category: b.category,
          start_minute: b.start_minute,
          end_minute: b.end_minute,
          notes: b.notes,
        })),
    }))
    .sort((a, b) => a.record_date.localeCompare(b.record_date));
}

/** The person's day records of one month (every vessel's). */
export async function loadMonthRecords(crewId: string, year: number, month: number): Promise<DailyRecord[]> {
  const { start, end } = monthBounds(year, month);
  return loadRecordsBetween(crewId, start, end);
}

/** The six days before a month: the context of its first week's 7-day windows. */
export function monthContextRange(year: number, month: number): { from: string; to: string } {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const from = new Date(first);
  from.setUTCDate(from.getUTCDate() - 6);
  const to = new Date(first);
  to.setUTCDate(to.getUTCDate() - 1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** Legacy writer (refused once 060700 is applied: days are saved through saveDay). */
export async function upsertDayRecord(opts: {
  submissionId: string;
  crewId: string;
  vesselId: string;
  date: string;
  blocks: WorkRestBlock[];
  notes?: string | null;
  summary: {
    work_minutes: number;
    rest_minutes: number;
    longest_rest_minutes: number;
    rest_period_count: number;
    is_compliant: boolean;
  };
}): Promise<string> {
  const { data: existing, error: findErr } = await db
    .from('work_rest_records')
    .select('id')
    .eq('crew_id', opts.crewId)
    .eq('record_date', opts.date)
    .maybeSingle();
  if (findErr) throw findErr;

  const values = {
    submission_id: opts.submissionId,
    vessel_id: opts.vesselId,
    notes: opts.notes ?? null,
    total_work_minutes: opts.summary.work_minutes,
    total_rest_minutes: opts.summary.rest_minutes,
    longest_rest_minutes: opts.summary.longest_rest_minutes,
    rest_period_count: opts.summary.rest_period_count,
    is_compliant: opts.summary.is_compliant,
  };
  let recordId: string;
  if (existing?.id) {
    recordId = existing.id;
    const { error } = await db.from('work_rest_records').update(values).eq('id', recordId);
    if (error) throw asWorkRestError(error);
  } else {
    const { data, error } = await db
      .from('work_rest_records')
      .insert({ ...values, crew_id: opts.crewId, record_date: opts.date })
      .select('id')
      .single();
    if (error) throw asWorkRestError(error);
    recordId = data.id;
  }

  const { error: delErr } = await db.from('work_rest_blocks').delete().eq('record_id', recordId);
  if (delErr) throw asWorkRestError(delErr);
  const rows = engineBlocks(opts.blocks).map((b) => ({
    record_id: recordId,
    crew_id: opts.crewId,
    block_type: 'work',
    category: b.category ?? null,
    start_minute: b.start_minute,
    end_minute: b.end_minute,
    notes: b.notes ?? null,
  }));
  if (rows.length) {
    const { error } = await db.from('work_rest_blocks').insert(rows);
    if (error) throw asWorkRestError(error);
  }
  return recordId;
}

// ---------- Non-conformities ----------

/** A breach row as the UI reads it; the 060700 columns are null / false until it is applied. */
export type NonConformityListRow = NonConformityRow & WorkRestNonConformityNewColumns;

const NC_LEGACY_COLUMNS =
  'id, crew_id, submission_id, rule_code, rule_description, severity, window_start, window_end, measured_value, threshold_value, suggested_correction, status, justification, reviewer_id, reviewed_at, created_at, updated_at';
const NC_COLUMNS = `${NC_LEGACY_COLUMNS}, vessel_id, breach_day, is_serious, deficit_hours, review_outcome, review_note, reviewed_by, breach_report_id, superseded_at`;
const NC_NEW_DEFAULTS: WorkRestNonConformityNewColumns = {
  vessel_id: null,
  breach_day: null,
  is_serious: false,
  deficit_hours: null,
  review_outcome: null,
  review_note: null,
  reviewed_by: null,
  breach_report_id: null,
  superseded_at: null,
};

/**
 * The month's breaches, oldest window first. Superseded ones (a reviewed
 * breach whose record was corrected) are left out unless asked for. Reads
 * the 060700 columns, and the legacy column list while they are missing.
 */
export async function listNonConformities(submissionId: string, opts: { includeSuperseded?: boolean } = {}): Promise<NonConformityListRow[]> {
  const full = await db
    .from('work_rest_non_conformities')
    .select(NC_COLUMNS)
    .eq('submission_id', submissionId)
    .order('window_start', { ascending: true });
  if (!full.error) {
    const rows: NonConformityListRow[] = full.data ?? [];
    return opts.includeSuperseded ? rows : rows.filter((r) => !r.superseded_at);
  }
  if (!isMissingRelation(full.error)) throw full.error;
  const legacy = await db
    .from('work_rest_non_conformities')
    .select(NC_LEGACY_COLUMNS)
    .eq('submission_id', submissionId)
    .order('window_start', { ascending: true });
  if (legacy.error) throw legacy.error;
  return (legacy.data ?? []).map((r) => ({ ...r, ...NC_NEW_DEFAULTS }));
}

/** Legacy writer: replaces the month's open breaches with the browser's (refused once 060700 is applied). */
export async function replaceMonthNonConformities(
  submissionId: string,
  crewId: string,
  ncs: NonConformity[],
): Promise<NonConformityRow[]> {
  const { error: delErr } = await db
    .from('work_rest_non_conformities')
    .delete()
    .eq('submission_id', submissionId)
    .eq('status', 'open');
  if (delErr) throw asWorkRestError(delErr);

  if (ncs.length === 0) return [];
  const rows = ncs.map((n) => ({
    submission_id: submissionId,
    crew_id: crewId,
    rule_code: n.rule_code,
    rule_description: n.rule_description,
    severity: n.severity,
    window_start: n.window_start,
    window_end: n.window_end,
    measured_value: n.measured_value,
    threshold_value: n.threshold_value,
    suggested_correction: n.suggested_correction ?? null,
    status: 'open' satisfies NCStatus,
  }));
  const { data, error } = await db.from('work_rest_non_conformities').insert(rows).select(NC_LEGACY_COLUMNS);
  if (error) throw asWorkRestError(error);
  return data ?? [];
}

/** Legacy review writer (X1-08's work_rest_review_breach replaces it; refused once 060700 is applied). */
export async function updateNonConformity(
  id: string,
  patch: Pick<NonConformityUpdate, 'status' | 'justification' | 'reviewer_id' | 'reviewed_at'>,
): Promise<NonConformityRow> {
  const { data, error } = await db
    .from('work_rest_non_conformities')
    .update(patch)
    .eq('id', id)
    .select(NC_LEGACY_COLUMNS)
    .single();
  if (error) throw asWorkRestError(error);
  return data;
}

export type { WorkRestReviewOutcome };

// ---------- Signatures ----------

/** Legacy writer (refused once 060700 is applied: transitionMonth signs). */
export async function signSubmission(opts: {
  submissionId: string;
  signerId: string;
  signerRole: 'crew' | 'hod' | 'captain' | 'purser' | 'dpa';
  payload?: Record<string, Json>;
}) {
  const { data, error } = await db
    .from('work_rest_signatures')
    .insert({
      submission_id: opts.submissionId,
      signer_id: opts.signerId,
      signer_role: opts.signerRole,
      signature_method: 'electronic',
      signature_payload: opts.payload ?? null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    })
    .select('id, submission_id, signer_id, signer_role, signature_method, signed_at')
    .single();
  if (error) throw asWorkRestError(error);
  return data;
}

const SIGNATURE_COLUMNS = 'id, submission_id, signer_id, signer_role, signature_method, signature_payload, signed_at';
const SIGNER = 'profiles!work_rest_signatures_signer_id_fkey (first_name, last_name, email, rank)';

export type SignatureListRow = {
  id: string;
  submission_id: string;
  signer_id: string;
  signer_role: string;
  signature_method: string;
  signature_payload: Json | null;
  /** Always set (the column defaults to now()); a row without a time is not a signature and is left out. */
  signed_at: string;
  stale_at: string | null;
  stale_reason: string | null;
  profiles: { first_name: string | null; last_name: string | null; email: string; rank: string | null } | null;
};

/**
 * The month's signatures, oldest first. Stale ones (signed before a reopen)
 * are left out unless asked for. Reads stale_at, and the legacy columns
 * while it is missing.
 */
export async function listSignatures(submissionId: string, opts: { includeStale?: boolean } = {}): Promise<SignatureListRow[]> {
  const full = await db
    .from('work_rest_signatures')
    .select(`${SIGNATURE_COLUMNS}, stale_at, stale_reason, ${SIGNER}`)
    .eq('submission_id', submissionId)
    .order('signed_at', { ascending: true });
  if (!full.error) {
    const rows = (full.data ?? []).flatMap((r) => (r.signed_at ? [{ ...r, signed_at: r.signed_at }] : []));
    return opts.includeStale ? rows : rows.filter((r) => !r.stale_at);
  }
  if (!isMissingRelation(full.error)) throw full.error;
  const legacy = await db
    .from('work_rest_signatures')
    .select(`${SIGNATURE_COLUMNS}, ${SIGNER}`)
    .eq('submission_id', submissionId)
    .order('signed_at', { ascending: true });
  if (legacy.error) throw legacy.error;
  return (legacy.data ?? []).flatMap((r) => (r.signed_at ? [{ ...r, signed_at: r.signed_at, stale_at: null, stale_reason: null }] : []));
}

// ---------- Notes ----------

export async function addNote(opts: {
  submissionId?: string | null;
  recordId?: string | null;
  blockId?: string | null;
  authorId: string;
  body: string;
}) {
  const { data, error } = await db
    .from('work_rest_notes')
    .insert({
      submission_id: opts.submissionId ?? null,
      record_id: opts.recordId ?? null,
      block_id: opts.blockId ?? null,
      author_id: opts.authorId,
      body: opts.body,
    })
    .select('id, submission_id, record_id, block_id, author_id, body, created_at')
    .single();
  if (error) throw error;
  return data;
}

// ---------- Audit log ----------

/**
 * Legacy audit writer, best effort (never blocks the UI). Once 060700 is
 * applied the engine writes the audit rows and refuses this one, which is
 * then only a warning in the console.
 */
export async function logAudit(entry: {
  submissionId?: string | null;
  crewId?: string | null;
  actorId: string;
  actorRole?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  oldValue?: Json;
  newValue?: Json;
  metadata?: Record<string, Json>;
}): Promise<void> {
  try {
    const { error } = await db.from('work_rest_audit_log').insert({
      submission_id: entry.submissionId ?? null,
      crew_id: entry.crewId ?? null,
      actor_id: entry.actorId,
      actor_role: entry.actorRole ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      old_value: entry.oldValue ?? null,
      new_value: entry.newValue ?? null,
      metadata: entry.metadata ?? null,
    });
    if (error) console.warn('[work-rest] audit log failed:', error.message);
  } catch (e) {
    console.warn('[work-rest] audit log failed:', e);
  }
}

export async function listAuditLog(submissionId: string) {
  const { data, error } = await db
    .from('work_rest_audit_log')
    .select('id, submission_id, crew_id, actor_id, actor_role, action, entity_type, entity_id, old_value, new_value, metadata, created_at, profiles!work_rest_audit_log_actor_id_fkey (first_name, last_name, email)')
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ---------- Rule sets / vessel settings ----------

type RuleSetRow = Pick<
  Tables['work_rest_rule_sets']['Row'],
  'id' | 'name' | 'min_rest_per_24h' | 'min_rest_per_7d' | 'max_rest_periods_per_24h' | 'min_long_rest_block' | 'max_interval_between_rest'
>;
const RULE_SET_COLUMNS = 'id, name, min_rest_per_24h, min_rest_per_7d, max_rest_periods_per_24h, min_long_rest_block, max_interval_between_rest';

const ruleSetOf = (rs: RuleSetRow): RuleSet => ({
  id: rs.id,
  name: rs.name,
  min_rest_per_24h: Number(rs.min_rest_per_24h),
  min_rest_per_7d: Number(rs.min_rest_per_7d),
  max_rest_periods_per_24h: rs.max_rest_periods_per_24h,
  min_long_rest_block: Number(rs.min_long_rest_block),
  max_interval_between_rest: Number(rs.max_interval_between_rest),
});

/** The vessel's margins and serious thresholds (060700), the defaults while the columns are missing or unset. */
async function loadThresholds(vesselId: string): Promise<Pick<RuleSet, 'warning_margin_24h' | 'warning_margin_7d' | 'serious_24h' | 'serious_7d'>> {
  const { data, error } = await db
    .from('vessel_work_rest_settings')
    .select('warning_margin_24h_h, warning_margin_7d_h, serious_24h_h, serious_7d_h')
    .eq('vessel_id', vesselId)
    .maybeSingle();
  if (error && !isMissingRelation(error)) throw error;
  return {
    warning_margin_24h: data ? Number(data.warning_margin_24h_h) : DEFAULT_THRESHOLDS.warning_margin_24h,
    warning_margin_7d: data ? Number(data.warning_margin_7d_h) : DEFAULT_THRESHOLDS.warning_margin_7d,
    serious_24h: data ? Number(data.serious_24h_h) : DEFAULT_THRESHOLDS.serious_24h,
    serious_7d: data ? Number(data.serious_7d_h) : DEFAULT_THRESHOLDS.serious_7d,
  };
}

/** The vessel's rule set (its own, else the default), with the vessel's margins and serious thresholds. */
export async function loadEffectiveRuleSet(vesselId: string): Promise<RuleSet> {
  const thresholds = await loadThresholds(vesselId);
  const { data: vs, error: vsErr } = await db
    .from('vessel_work_rest_settings')
    .select('rule_set_id')
    .eq('vessel_id', vesselId)
    .maybeSingle();
  if (vsErr) throw vsErr;

  if (vs?.rule_set_id) {
    const { data: rs, error } = await db.from('work_rest_rule_sets').select(RULE_SET_COLUMNS).eq('id', vs.rule_set_id).maybeSingle();
    if (error) throw error;
    if (rs) return { ...ruleSetOf(rs), ...thresholds };
  }

  const { data: defaults, error } = await db
    .from('work_rest_rule_sets')
    .select(RULE_SET_COLUMNS)
    .eq('is_default', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (defaults) return { ...ruleSetOf(defaults), ...thresholds };
  return { ...DEFAULT_RULE_SET, ...thresholds };
}
