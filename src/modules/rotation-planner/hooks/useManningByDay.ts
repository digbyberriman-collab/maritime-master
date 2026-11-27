/**
 * Manning by day of a vessel (X1-09; gap/04 C47, C48, W7; D-X1-16):
 * vessel_manning_by_day (gate crew_scheduling.view), one row per day and
 * position with aboard, qualified (today's crew compliance, projected by the
 * earliest expiry), the minimum and maximum and the band. Parsed strictly
 * (lib/manning.ts) with the On board totals and the critical spans the
 * timeline lists as manning gaps.
 *
 * D-01. While 060900 is not applied the RPC is missing: 'not_set_up' (the
 * legacy planner has no manning row). Any other error is an error state.
 */
import { useQuery } from '@tanstack/react-query';
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import { buildManningGapItems, type ManningGapItem } from '../lib/conflicts';
import { manningTotals, parseManningRows, type ManningDayRow, type ManningDayTotal } from '../lib/manning';
import { PlannerNotSetUpError, isPlannerRpcMissing, plannerErrorOf } from '../lib/periods';
import type { PlannerPendingColumns, PlannerPendingFunctions, PlannerPendingTables } from '../types/db.pending';
import { plannerKeys, type PlannerVesselRef } from './plannerKeys';
import { noPlannerRetry } from './usePlannerPeriods';

const plannerDb = pendingClient<PlannerPendingTables, NoPending, PlannerPendingFunctions, PlannerPendingColumns>();

export const MANNING_BY_DAY_RPC = 'vessel_manning_by_day';

/** The vessel's manning rows for [from, to] (at most 400 days). Throws PlannerNotSetUpError / PlannerRefusalError / the error. */
export async function fetchManningByDay(vesselId: string, from: string, to: string): Promise<ManningDayRow[]> {
  const { data, error } = await plannerDb.rpc(MANNING_BY_DAY_RPC, { p_vessel_id: vesselId, p_from: from, p_to: to });
  if (error) throw plannerErrorOf(error, MANNING_BY_DAY_RPC);
  return parseManningRows(data ?? []);
}

export type ManningByDayState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not_set_up' }
  | { status: 'error'; error: unknown; retry: () => void }
  | {
      status: 'ready';
      rows: ManningDayRow[];
      totals: ManningDayTotal[];
      gaps: ManningGapItem[];
      refreshing: boolean;
      refetch: () => void;
    };

/** Manning of the timeline window. `enabled: false` sends nothing and answers idle. */
export function useManningByDay(
  vessel: PlannerVesselRef | null,
  from: string,
  to: string,
  options: { enabled?: boolean } = {},
): ManningByDayState {
  const enabled = (options.enabled ?? true) && Boolean(vessel?.id);
  const query = useQuery({
    queryKey: plannerKeys.manning(vessel?.companyId, vessel?.id, from, to),
    queryFn: async () => {
      const rows = await fetchManningByDay(vessel?.id as string, from, to);
      return { rows, totals: manningTotals(rows), gaps: buildManningGapItems(rows, { from, to }) };
    },
    enabled,
    retry: noPlannerRetry,
    staleTime: 60_000,
  });
  if (!enabled) return { status: 'idle' };
  if (query.error) {
    if (query.error instanceof PlannerNotSetUpError || isPlannerRpcMissing(query.error, MANNING_BY_DAY_RPC)) return { status: 'not_set_up' };
    return { status: 'error', error: query.error, retry: () => void query.refetch() };
  }
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', ...query.data, refreshing: query.isFetching, refetch: () => void query.refetch() };
}
