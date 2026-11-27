/**
 * The leave types (X1-09; gap/04 C51, W7): one STORM list for the Add leave
 * dialog, the request form, the On/Off toggle and the legend, read from
 * leave_types (RLS: every active user) in its order.
 *
 * D-01. While 060900 is not applied the table is missing: the hook answers
 * 'not_set_up' with the built-in list (LEAVE_TYPES, the mirror of the
 * migration's seed, pinned by the SQL test), so the legend can still show
 * the codes the legacy planner paints; nothing is written with it. Any
 * other error, or a row that is not the seed's shape, is an error state.
 */
import { useQuery } from '@tanstack/react-query';
import { isMissingRelation, pendingClient, type NoPending } from '@/integrations/supabase/pending';
import { LEAVE_TYPES, LEAVE_TYPE_COLUMNS, parseLeaveTypeRows, type LeaveType } from '../lib/leaveTypes';
import type { PlannerPendingColumns, PlannerPendingFunctions, PlannerPendingTables } from '../types/db.pending';
import { plannerKeys } from './plannerKeys';
import { noPlannerRetry } from './usePlannerPeriods';

const plannerDb = pendingClient<PlannerPendingTables, NoPending, PlannerPendingFunctions, PlannerPendingColumns>();

/** The table is not there yet (D-01): the hook's not-set-up answer. */
export class LeaveTypesNotSetUp extends Error {
  constructor() {
    super('Leave types are not set up on this database yet.');
    this.name = 'LeaveTypesNotSetUp';
  }
}

/** Every leave type (active and inactive) in its order. Throws LeaveTypesNotSetUp while the table is missing. */
export async function fetchLeaveTypes(): Promise<LeaveType[]> {
  const { data, error } = await plannerDb.from('leave_types').select(LEAVE_TYPE_COLUMNS).order('sort_order').order('key');
  if (error) {
    if (isMissingRelation(error)) throw new LeaveTypesNotSetUp();
    throw error;
  }
  return parseLeaveTypeRows(data ?? []);
}

export type LeaveTypesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not_set_up'; types: readonly LeaveType[] }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; types: LeaveType[] };

export function useLeaveTypes(companyId: string | null | undefined, options: { enabled?: boolean } = {}): LeaveTypesState {
  const enabled = (options.enabled ?? true) && Boolean(companyId);
  const query = useQuery({
    queryKey: plannerKeys.leaveTypes(companyId),
    queryFn: fetchLeaveTypes,
    enabled,
    retry: (count, error) => !(error instanceof LeaveTypesNotSetUp) && noPlannerRetry(count, error),
    staleTime: 10 * 60_000,
  });
  if (!enabled) return { status: 'idle' };
  if (query.error) {
    if (query.error instanceof LeaveTypesNotSetUp) return { status: 'not_set_up', types: LEAVE_TYPES };
    return { status: 'error', error: query.error, retry: () => void query.refetch() };
  }
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', types: query.data };
}
