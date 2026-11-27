/**
 * Leave requests of a vessel and the vessel's leave approval step (X1-09;
 * gap/04 C52, W7; D-X1-10).
 *
 * - useLeaveRequests(vessel, { statuses }): crew_leave_requests of the
 *   vessel with their periods (crew_leave_request_periods), newest first.
 *   A request from before 060900 has no period rows: its one period is its
 *   own range and type.
 * - useLeaveSettings(vessel): the vessel's HoD step (crew_leave_settings;
 *   no row: 'nudge', the default).
 * - useLeaveRequestMutations(vessel): submit (crew_leave_request_submit, the
 *   caller's own multi-period request), decide (crew_leave_request_decide:
 *   hod_review, approve, decline, cancel) and saveSettings
 *   (planner_leave_settings_save). Each refreshes the vessel's planner reads
 *   (an approval writes periods) and the legacy planner's keys.
 *
 * D-01. While 060900 is not applied the periods table, the profile_id
 * column, the settings table or the RPCs are missing: the reads answer
 * 'not_set_up' (the legacy LeaveRequestsPage keeps working) and a write
 * throws PlannerNotSetUpError. A refusal throws PlannerRefusalError with the
 * sentence to show; anything else is thrown as it came.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isMissingRelation, pendingClient, type NoPending } from '@/integrations/supabase/pending';
import { leaveTypeForDayCode } from '../lib/leaveTypes';
import {
  LEAVE_HOD_STEPS,
  PlannerNotSetUpError,
  PlannerShapeError,
  parseLeaveRequestRows,
  periodsPayload,
  plannerErrorOf,
  type LeaveDecision,
  type LeaveHodStep,
  type LeaveRequest,
  type LeaveRequestStatus,
  type PeriodInput,
} from '../lib/periods';
import type {
  CrewLeaveRequestDbRow,
  CrewLeaveSettingsRow,
  PlannerPendingColumns,
  PlannerPendingFunctions,
  PlannerPendingTables,
} from '../types/db.pending';
import { LEGACY_PLANNER_KEY, plannerKeys, type PlannerVesselRef } from './plannerKeys';
import { noPlannerRetry } from './usePlannerPeriods';

const plannerDb = pendingClient<PlannerPendingTables, NoPending, PlannerPendingFunctions, PlannerPendingColumns>();

export const LEAVE_SUBMIT_RPC = 'crew_leave_request_submit';
export const LEAVE_DECIDE_RPC = 'crew_leave_request_decide';
export const LEAVE_SETTINGS_RPC = 'planner_leave_settings_save';

/** The columns the planner reads of a leave request (explicit list; profile_id is 060900's). */
export const LEAVE_REQUEST_COLUMNS =
  'id, company_id, vessel_id, crew_id, profile_id, leave_type, start_date, end_date, status, notes, submitted_at, hod_reviewed_at, hod_reviewed_by, reviewed_at, reviewed_by, cancellation_reason';
export const LEAVE_REQUEST_PERIOD_COLUMNS = 'id, request_id, leave_type_key, start_date, end_date, end_unknown, sort_order';

/** The vessel's leave step when it has no settings row. */
export const DEFAULT_HOD_STEP: LeaveHodStep = 'nudge';

/** The legacy day code of a request without periods, as a leave type key. */
const legacyTypeKey = (code: string): string | null => leaveTypeForDayCode(code)?.key ?? null;

// ---------------------------------------------------------------- reads

/** The vessel's requests with their periods (newest first), optionally of some statuses. Throws PlannerNotSetUpError while 060900 is missing. */
export async function fetchLeaveRequests(vessel: PlannerVesselRef, statuses: readonly LeaveRequestStatus[] = []): Promise<LeaveRequest[]> {
  let q = plannerDb
    .from('crew_leave_requests')
    .select(LEAVE_REQUEST_COLUMNS)
    .eq('company_id', vessel.companyId)
    .eq('vessel_id', vessel.id);
  if (statuses.length > 0) q = q.in('status', [...statuses]);
  const { data: requests, error } = await q.order('submitted_at', { ascending: false }).order('id');
  if (error) {
    if (isMissingRelation(error)) throw new PlannerNotSetUpError('crew_leave_requests.profile_id');
    throw error;
  }
  const ids = (requests ?? []).map((r) => r.id);
  if (ids.length === 0) return [];
  const { data: periods, error: periodsError } = await plannerDb
    .from('crew_leave_request_periods')
    .select(LEAVE_REQUEST_PERIOD_COLUMNS)
    .in('request_id', ids)
    .order('request_id')
    .order('sort_order');
  if (periodsError) {
    if (isMissingRelation(periodsError)) throw new PlannerNotSetUpError('crew_leave_request_periods');
    throw periodsError;
  }
  return parseLeaveRequestRows(requests ?? [], periods ?? [], legacyTypeKey);
}

/** The vessel's HoD step ('nudge' without a settings row). Throws PlannerNotSetUpError while the table is missing. */
export async function fetchLeaveSettings(vessel: PlannerVesselRef): Promise<LeaveHodStep> {
  const { data, error } = await plannerDb
    .from('crew_leave_settings')
    .select('vessel_id, hod_step')
    .eq('company_id', vessel.companyId)
    .eq('vessel_id', vessel.id)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) throw new PlannerNotSetUpError('crew_leave_settings');
    throw error;
  }
  if (!data) return DEFAULT_HOD_STEP;
  if (!(LEAVE_HOD_STEPS as readonly string[]).includes(data.hod_step)) throw new PlannerShapeError('The leave settings have an unknown step.', data);
  return data.hod_step;
}

export type LeaveRequestsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not_set_up' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; requests: LeaveRequest[]; refreshing: boolean; refetch: () => void };

export function useLeaveRequests(
  vessel: PlannerVesselRef | null,
  options: { statuses?: readonly LeaveRequestStatus[]; enabled?: boolean } = {},
): LeaveRequestsState {
  const statuses = [...(options.statuses ?? [])].sort();
  const enabled = (options.enabled ?? true) && Boolean(vessel?.id) && Boolean(vessel?.companyId);
  const query = useQuery({
    queryKey: [...plannerKeys.leaveRequests(vessel?.companyId, vessel?.id), statuses.join(',') || 'all'] as const,
    queryFn: () => fetchLeaveRequests(vessel as PlannerVesselRef, statuses),
    enabled,
    retry: noPlannerRetry,
    staleTime: 30_000,
  });
  if (!enabled) return { status: 'idle' };
  if (query.error) {
    if (query.error instanceof PlannerNotSetUpError) return { status: 'not_set_up' };
    return { status: 'error', error: query.error, retry: () => void query.refetch() };
  }
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', requests: query.data, refreshing: query.isFetching, refetch: () => void query.refetch() };
}

export type LeaveSettingsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not_set_up' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; hodStep: LeaveHodStep };

export function useLeaveSettings(vessel: PlannerVesselRef | null, options: { enabled?: boolean } = {}): LeaveSettingsState {
  const enabled = (options.enabled ?? true) && Boolean(vessel?.id) && Boolean(vessel?.companyId);
  const query = useQuery({
    queryKey: plannerKeys.leaveSettings(vessel?.companyId, vessel?.id),
    queryFn: () => fetchLeaveSettings(vessel as PlannerVesselRef),
    enabled,
    retry: noPlannerRetry,
    staleTime: 5 * 60_000,
  });
  if (!enabled) return { status: 'idle' };
  if (query.error) {
    if (query.error instanceof PlannerNotSetUpError) return { status: 'not_set_up' };
    return { status: 'error', error: query.error, retry: () => void query.refetch() };
  }
  if (query.data === undefined) return { status: 'loading' };
  return { status: 'ready', hodStep: query.data };
}

// ---------------------------------------------------------------- writes

export interface LeaveSubmitInput {
  periods: readonly PeriodInput[];
  note?: string | null;
}

/** crew_leave_request_submit: the caller's own request on the vessel (pending). */
export async function submitLeaveRequest(vesselId: string, input: LeaveSubmitInput): Promise<CrewLeaveRequestDbRow> {
  const { data, error } = await plannerDb.rpc(LEAVE_SUBMIT_RPC, {
    p_vessel_id: vesselId,
    p_periods: periodsPayload(input.periods),
    p_note: input.note ?? null,
  });
  if (error) throw plannerErrorOf(error, LEAVE_SUBMIT_RPC);
  if (!data) throw new Error('The leave request was not saved.');
  return data;
}

export interface LeaveDecideInput {
  requestId: string;
  decision: LeaveDecision;
  reason?: string | null;
  /** Approve: trim, split or remove overlapping rotation leave. */
  replace?: boolean;
}

/** crew_leave_request_decide: the request after the decision. */
export async function decideLeaveRequest(input: LeaveDecideInput): Promise<CrewLeaveRequestDbRow> {
  const { data, error } = await plannerDb.rpc(LEAVE_DECIDE_RPC, {
    p_request_id: input.requestId,
    p_decision: input.decision,
    p_reason: input.reason ?? null,
    p_replace: input.replace ?? false,
  });
  if (error) throw plannerErrorOf(error, LEAVE_DECIDE_RPC);
  if (!data) throw new Error('The leave request was not changed.');
  return data;
}

/** planner_leave_settings_save: the vessel's HoD step. */
export async function saveLeaveSettings(vesselId: string, hodStep: LeaveHodStep): Promise<CrewLeaveSettingsRow> {
  const { data, error } = await plannerDb.rpc(LEAVE_SETTINGS_RPC, { p_vessel_id: vesselId, p_hod_step: hodStep });
  if (error) throw plannerErrorOf(error, LEAVE_SETTINGS_RPC);
  if (!data) throw new Error('The leave settings were not saved.');
  return data;
}

export function useLeaveRequestMutations(vessel: PlannerVesselRef | null) {
  const qc = useQueryClient();
  const vesselId = (): string => {
    if (!vessel?.id) throw new Error('Choose a vessel first.');
    return vessel.id;
  };
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: plannerKeys.vessel(vessel?.companyId, vessel?.id) }),
      qc.invalidateQueries({ queryKey: LEGACY_PLANNER_KEY }),
    ]);
  };
  const submit = useMutation({ mutationFn: (input: LeaveSubmitInput) => submitLeaveRequest(vesselId(), input), onSuccess: refresh });
  const decide = useMutation({ mutationFn: decideLeaveRequest, onSuccess: refresh });
  const saveSettings = useMutation({ mutationFn: (hodStep: LeaveHodStep) => saveLeaveSettings(vesselId(), hodStep), onSuccess: refresh });
  return { submit, decide, saveSettings };
}
