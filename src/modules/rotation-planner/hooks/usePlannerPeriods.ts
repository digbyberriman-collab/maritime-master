/**
 * The one period store of a vessel (X1-09; gap/04 C47, C50, W7): the
 * timeline's read and every planner write, on the RPCs of
 * 20261124060900_crew_planner_periods.sql.
 *
 * - usePlannerPeriods(vessel, from, to): planner_vessel_periods (gate
 *   crew_scheduling.view), parsed strictly into PlannerPeriod.
 * - usePlannerPeriodMutations(vessel): upsert (planner_period_upsert),
 *   remove (planner_period_delete), addLeave (planner_add_leave) and toggle
 *   (crew_toggle_onboard). Each refreshes the vessel's planner reads
 *   (periods, manning, requests) and the legacy planner's keys.
 *
 * D-01. While 060900 is not applied the RPCs are missing (PGRST202, a 42883
 * naming the function): the read answers 'not_set_up' and a write throws
 * PlannerNotSetUpError, so the page keeps the legacy planner (X1-09B). A
 * refusal throws PlannerRefusalError with the sentence to show; anything
 * else is thrown as it came. Nothing is mocked.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import { LeaveTypeShapeError } from '../lib/leaveTypes';
import { ManningShapeError } from '../lib/manning';
import {
  PlannerNotSetUpError,
  PlannerRefusalError,
  PlannerShapeError,
  isPlannerRpcMissing,
  parsePlannerPeriodRows,
  periodsPayload,
  plannerErrorOf,
  type PeriodInput,
  type PlannerPeriod,
} from '../lib/periods';
import type {
  CrewToggleOnboardRpcRow,
  PlannerAddLeaveRpcRow,
  PlannerPendingColumns,
  PlannerPendingFunctions,
  PlannerPendingTables,
  PlannerPeriodDbRow,
} from '../types/db.pending';
import { LEGACY_PLANNER_KEY, plannerKeys, type PlannerVesselRef } from './plannerKeys';

const plannerDb = pendingClient<PlannerPendingTables, NoPending, PlannerPendingFunctions, PlannerPendingColumns>();

export const PLANNER_PERIODS_RPC = 'planner_vessel_periods';
export const PERIOD_UPSERT_RPC = 'planner_period_upsert';
export const PERIOD_DELETE_RPC = 'planner_period_delete';
export const ADD_LEAVE_RPC = 'planner_add_leave';
export const TOGGLE_ONBOARD_RPC = 'crew_toggle_onboard';

/** Retry a read once, never a missing RPC, a refusal or an unreadable answer. */
export function noPlannerRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof PlannerNotSetUpError || error instanceof PlannerRefusalError) return false;
  if (error instanceof PlannerShapeError || error instanceof ManningShapeError || error instanceof LeaveTypeShapeError) return false;
  return failureCount < 1;
}

// ---------------------------------------------------------------- the read

/** The vessel's periods touching [from, to]. Throws PlannerNotSetUpError / PlannerRefusalError / the error. */
export async function fetchPlannerPeriods(vesselId: string, from: string, to: string): Promise<PlannerPeriod[]> {
  const { data, error } = await plannerDb.rpc(PLANNER_PERIODS_RPC, { p_vessel_id: vesselId, p_from: from, p_to: to });
  if (error) throw plannerErrorOf(error, PLANNER_PERIODS_RPC);
  return parsePlannerPeriodRows(data ?? []);
}

export type PlannerPeriodsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not_set_up' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; periods: PlannerPeriod[]; refreshing: boolean; refetch: () => void };

/** The vessel's periods for the timeline window. `enabled: false` (a gate loading or denied) sends nothing and answers idle. */
export function usePlannerPeriods(
  vessel: PlannerVesselRef | null,
  from: string,
  to: string,
  options: { enabled?: boolean } = {},
): PlannerPeriodsState {
  const enabled = (options.enabled ?? true) && Boolean(vessel?.id);
  const query = useQuery({
    queryKey: plannerKeys.periods(vessel?.companyId, vessel?.id, from, to),
    queryFn: () => fetchPlannerPeriods(vessel?.id as string, from, to),
    enabled,
    retry: noPlannerRetry,
    staleTime: 30_000,
  });
  if (!enabled) return { status: 'idle' };
  if (query.error) {
    if (query.error instanceof PlannerNotSetUpError || isPlannerRpcMissing(query.error, PLANNER_PERIODS_RPC)) return { status: 'not_set_up' };
    return { status: 'error', error: query.error, retry: () => void query.refetch() };
  }
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', periods: query.data, refreshing: query.isFetching, refetch: () => void query.refetch() };
}

// ---------------------------------------------------------------- the writes

export interface PeriodUpsertInput {
  /** null or absent: a new period. */
  id?: string | null;
  profileId: string;
  leaveTypeKey: string;
  start: string;
  /** null with endUnknown. */
  end: string | null;
  endUnknown: boolean;
  notes?: string | null;
  /** Trim, split or remove the person's overlapping rotation leave. */
  replace?: boolean;
  /** The version the caller read (22023 period_changed when it moved on). */
  expectedVersion?: number | null;
}

/** planner_period_upsert: the saved period row. */
export async function upsertPlannerPeriod(vesselId: string, input: PeriodUpsertInput): Promise<PlannerPeriodDbRow> {
  const { data, error } = await plannerDb.rpc(PERIOD_UPSERT_RPC, {
    p_vessel_id: vesselId,
    p_id: input.id ?? null,
    p_profile_id: input.profileId,
    p_leave_type_key: input.leaveTypeKey,
    p_start: input.start,
    p_end: input.endUnknown ? null : input.end,
    p_end_unknown: input.endUnknown,
    p_notes: input.notes ?? null,
    p_replace: input.replace ?? false,
    p_expected_version: input.expectedVersion ?? null,
  });
  if (error) throw plannerErrorOf(error, PERIOD_UPSERT_RPC);
  if (!data) throw new Error('The planner saved nothing.');
  return data;
}

/** planner_period_delete: the id of the removed period. */
export async function deletePlannerPeriod(vesselId: string, id: string): Promise<string> {
  const { data, error } = await plannerDb.rpc(PERIOD_DELETE_RPC, { p_vessel_id: vesselId, p_id: id });
  if (error) throw plannerErrorOf(error, PERIOD_DELETE_RPC);
  if (typeof data !== 'string') throw new Error('The planner removed nothing.');
  return data;
}

export interface AddLeaveInput {
  profileId: string;
  periods: readonly PeriodInput[];
  note?: string | null;
  replace?: boolean;
}

/** planner_add_leave: the request (approved for an approver's crew, pending for their own leave) and the periods written. */
export async function addPlannerLeave(vesselId: string, input: AddLeaveInput): Promise<PlannerAddLeaveRpcRow> {
  const { data, error } = await plannerDb.rpc(ADD_LEAVE_RPC, {
    p_vessel_id: vesselId,
    p_profile_id: input.profileId,
    p_periods: periodsPayload(input.periods),
    p_note: input.note ?? null,
    p_replace: input.replace ?? false,
  });
  if (error) throw plannerErrorOf(error, ADD_LEAVE_RPC);
  const row = Array.isArray(data) ? data[0] : undefined;
  if (!row) throw new Error('The planner added no leave.');
  return row;
}

export interface ToggleOnboardInput {
  profileId: string;
  direction: 'off' | 'on';
  /** Off: the type of time off (default rotation leave). */
  leaveTypeKey?: string;
  /** The day the toggle takes effect (default today on the server). */
  start?: string;
  /** Off: the last day off, or endUnknown. */
  end?: string | null;
  endUnknown?: boolean | null;
}

/** crew_toggle_onboard: the period written or ended and the crew movement recorded. */
export async function toggleOnboard(vesselId: string, input: ToggleOnboardInput): Promise<CrewToggleOnboardRpcRow> {
  const { data, error } = await plannerDb.rpc(TOGGLE_ONBOARD_RPC, {
    p_vessel_id: vesselId,
    p_profile_id: input.profileId,
    p_direction: input.direction,
    ...(input.leaveTypeKey !== undefined ? { p_leave_type_key: input.leaveTypeKey } : {}),
    ...(input.start !== undefined ? { p_start: input.start } : {}),
    ...(input.end !== undefined ? { p_end: input.end } : {}),
    ...(input.endUnknown !== undefined ? { p_end_unknown: input.endUnknown } : {}),
  });
  if (error) throw plannerErrorOf(error, TOGGLE_ONBOARD_RPC);
  const row = Array.isArray(data) ? data[0] : undefined;
  if (!row) throw new Error('The planner changed nothing.');
  return row;
}

/** The planner writes of one vessel; each refreshes the vessel's planner reads and the legacy planner. */
export function usePlannerPeriodMutations(vessel: PlannerVesselRef | null) {
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
  const upsert = useMutation({ mutationFn: (input: PeriodUpsertInput) => upsertPlannerPeriod(vesselId(), input), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => deletePlannerPeriod(vesselId(), id), onSuccess: refresh });
  const addLeave = useMutation({ mutationFn: (input: AddLeaveInput) => addPlannerLeave(vesselId(), input), onSuccess: refresh });
  const toggle = useMutation({ mutationFn: (input: ToggleOnboardInput) => toggleOnboard(vesselId(), input), onSuccess: refresh });
  return { upsert, remove, addLeave, toggle };
}
