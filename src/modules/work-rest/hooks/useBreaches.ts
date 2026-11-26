/**
 * The vessel's breach review (gap/04 C42, W6; X1-08): the live breaches of
 * a range from work_rest_vessel_breaches, and the review through
 * work_rest_review_breach (accepted with a justification,
 * correction_requested reopening the month, dismissed after a
 * correction). Keys sit under the vessel's (workRestKeys.vessel) so a
 * review refreshes the board, the breach list and the months together.
 *
 * D-01: while the breach RPC is missing the query answers `{applied:
 * false}` and the panel says the review is not set up yet; any other error
 * is a real error.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listVesselBreaches, reviewBreach, type EngineCall } from '../services/workRestService';
import type { ReviewBreachResultJson, WorkRestReviewOutcome, WorkRestVesselBreachRow } from '../types/db.pending';
import { retryBoardRead } from './useVesselBoard';
import { workRestKeys } from './workRestKeys';

/** The breach list of a vessel and range (the vessel's key first, so its writes refresh it). */
export const breachKeys = {
  list: (vesselId: string, from: string, to: string, onlyOpen: boolean) =>
    [...workRestKeys.vessel(vesselId), 'breaches', from, to, onlyOpen] as const,
};

export function useVesselBreaches(opts: { vesselId: string | null; from: string; to: string; onlyOpen?: boolean; enabled?: boolean }) {
  const { vesselId, from, to } = opts;
  const onlyOpen = opts.onlyOpen ?? false;
  return useQuery<EngineCall<WorkRestVesselBreachRow[]>>({
    queryKey: vesselId ? breachKeys.list(vesselId, from, to, onlyOpen) : [...workRestKeys.all, 'breaches', 'no-vessel', from, to, onlyOpen],
    queryFn: () => {
      if (!vesselId) throw new Error('No vessel.');
      return listVesselBreaches({ vesselId, from, to, onlyOpen });
    },
    enabled: Boolean(vesselId) && (opts.enabled ?? true),
    retry: retryBoardRead,
    staleTime: 30_000,
  });
}

export interface ReviewInput {
  ncId: string;
  outcome: WorkRestReviewOutcome;
  note?: string | null;
}

/** Reviews one breach; the vessel's board, breaches and months refresh afterwards (also after a refusal). */
export function useReviewBreach(vesselId: string) {
  const qc = useQueryClient();
  return useMutation<ReviewBreachResultJson, unknown, ReviewInput>({
    mutationFn: (input) => reviewBreach({ ncId: input.ncId, outcome: input.outcome, note: input.note ?? null }),
    onSettled: () => qc.invalidateQueries({ queryKey: workRestKeys.vessel(vesselId) }),
  });
}
