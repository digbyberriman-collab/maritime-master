/**
 * The vessel hours-of-rest board (gap/04 C40, C41, C43; X1-08): the
 * month's board from work_rest_vessel_board, and the board's writes (the
 * month's sign-off steps through work_rest_month_transition, Remind through
 * work_rest_remind). Keys come from workRestKeys and carry the vessel and
 * the month; every write refreshes the vessel's keys (the board, its
 * breaches and the people's months).
 *
 * D-01: while the board RPC is missing the query answers `{applied: false}`
 * and the page shows the legacy overview; any other error is a real error
 * (a WorkRestRefusal for a 42501, which the page shows as no access).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crewRefusalMessage } from '@/modules/crew/lib/crewUpdateErrors';
import { BOARD_REFUSAL_TEXT, BoardShapeError, type VesselBoard } from '../lib/horBoard';
import { MONTH_REFUSAL_TEXT } from '../lib/horMonth';
import {
  fetchVesselBoard,
  remindCrew,
  transitionMonth,
  WorkRestEngineRequired,
  WorkRestRefusal,
  type EngineCall,
} from '../services/workRestService';
import type { RemindResultJson, WorkRestMonthActionArg } from '../types/db.pending';
import { workRestKeys } from './workRestKeys';

/**
 * One sentence for a refused or failed board write: the server's own DETAIL
 * where it gave one, else the board's or the month machine's sentence for
 * the refusal, else the generic crew wording.
 */
export function boardErrorText(error: unknown): string {
  if (error instanceof WorkRestEngineRequired) return error.message;
  if (error instanceof WorkRestRefusal) {
    const known = BOARD_REFUSAL_TEXT[error.refusal] ?? (MONTH_REFUSAL_TEXT as Readonly<Record<string, string>>)[error.refusal];
    const sentence = error.message !== error.refusal ? error.message : known ?? error.message;
    return crewRefusalMessage({ code: error.code, details: sentence, message: sentence });
  }
  return crewRefusalMessage(error);
}

/** Refusals and a malformed answer do not get better by asking again. */
export const retryBoardRead = (failures: number, error: unknown): boolean =>
  !(error instanceof WorkRestRefusal) && !(error instanceof BoardShapeError) && failures < 1;

export function useVesselBoard(opts: { vesselId: string | null; year: number; month: number; enabled?: boolean }) {
  const { vesselId, year, month } = opts;
  return useQuery<EngineCall<VesselBoard>>({
    queryKey: vesselId ? workRestKeys.board(vesselId, year, month) : [...workRestKeys.all, 'board', 'no-vessel', year, month],
    queryFn: () => {
      if (!vesselId) throw new Error('No vessel.');
      return fetchVesselBoard({ vesselId, year, month });
    },
    enabled: Boolean(vesselId) && (opts.enabled ?? true),
    retry: retryBoardRead,
    staleTime: 30_000,
  });
}

export interface BoardMonthActionInput {
  crewId: string;
  year: number;
  month: number;
  action: WorkRestMonthActionArg;
  reason?: string | null;
}

/** A sign-off step on a crew member's month from the board (HoD sign, approve, lock, reopen, submit on behalf). */
export function useBoardMonthAction(vesselId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BoardMonthActionInput) => {
      const out = await transitionMonth({
        vesselId,
        crewId: input.crewId,
        year: input.year,
        month: input.month,
        action: input.action,
        reason: input.reason ?? null,
      });
      if (out.mode !== 'engine') throw new Error('The month did not move.');
      return out.result;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: workRestKeys.vessel(vesselId) }),
  });
}

export interface RemindInput {
  crewIds: readonly string[];
  year: number;
  month: number;
}

/** Reminds crew of a month (one manual reminder per person and vessel a day). */
export function useRemindCrew(vesselId: string) {
  const qc = useQueryClient();
  return useMutation<RemindResultJson, unknown, RemindInput>({
    mutationFn: (input) => remindCrew({ vesselId, crewIds: input.crewIds, year: input.year, month: input.month }),
    onSettled: () => qc.invalidateQueries({ queryKey: workRestKeys.vessel(vesselId) }),
  });
}
