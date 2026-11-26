/**
 * A vessel's crew movements in a date range (X1-02; gap/04 C9):
 * `crew_vessel_movements(vessel, from, to)`, the stored embark / disembark
 * / transfer events plus the joins and departures derived from assignment
 * dates (the server de-duplicates them).
 *
 * D-01: while 20261124060200 is not applied the RPC is missing (PGRST202,
 * or a 42883 naming it) and the hook answers `not-set-up` (the Movements
 * tab shows its PageEmpty). Any other error is `error` with a retry; a
 * range the server refuses (22023) comes back as that error. Nothing is
 * mocked.
 */
import { useQuery } from '@tanstack/react-query';
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import type { CrewPendingFunctions, CrewPendingTables } from '../types/db.pending';
import { fromMovementRow, isMissingRpc, type CrewMovement, type MovementRange } from '../lib/crewListModel';
import { crewKeys } from './crewKeys';
import type { CrewListVessel } from './useVesselCrewList';

const crewDb = pendingClient<CrewPendingTables, NoPending, CrewPendingFunctions>();

export const CREW_MOVEMENTS_RPC = 'crew_vessel_movements';

export type CrewMovementsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not-set-up' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; movements: CrewMovement[]; refreshing: boolean };

export const crewMovementsKey = (vessel: CrewListVessel | null, range: MovementRange) =>
  [...crewKeys.vessel(vessel?.companyId, vessel?.id), 'movements', range.from, range.to] as const;

export async function fetchCrewMovements(vesselId: string, range: MovementRange): Promise<CrewMovement[]> {
  const { data, error } = await crewDb.rpc(CREW_MOVEMENTS_RPC, { p_vessel_id: vesselId, p_from: range.from, p_to: range.to });
  if (error) throw error;
  return (data ?? []).map(fromMovementRow);
}

/** `enabled: false` (a gate loading or denied, the tab not open) sends no request and answers `idle`. */
export function useCrewMovements(
  vessel: CrewListVessel | null,
  range: MovementRange,
  options: { enabled?: boolean } = {},
): CrewMovementsState {
  const enabled = (options.enabled ?? true) && Boolean(vessel?.id);
  const query = useQuery({
    queryKey: crewMovementsKey(vessel, range),
    queryFn: () => fetchCrewMovements(vessel?.id as string, range),
    enabled,
    retry: (failureCount, error) => !isMissingRpc(error, CREW_MOVEMENTS_RPC) && failureCount < 1,
    staleTime: 60_000,
  });
  if (!enabled) return { status: 'idle' };
  if (query.error) {
    if (isMissingRpc(query.error, CREW_MOVEMENTS_RPC)) return { status: 'not-set-up' };
    return { status: 'error', error: query.error, retry: () => void query.refetch() };
  }
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', movements: query.data, refreshing: query.isFetching };
}
