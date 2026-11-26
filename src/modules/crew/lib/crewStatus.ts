/**
 * A crew member's status on a vessel on a day (gap/04 W2, C4; X1 spec §6
 * 060200). The exact mirror of `crew_status_decide()` in
 * supabase/migrations/20261124060200_crew_vessel_list.sql: both are pinned
 * case by case by src/test/crew/fixtures/crewStatusCases.json (the vitest
 * suite and the SQL test read the same file).
 *
 * First match wins:
 *   on_transfer  a scheduled transfer covers the day;
 *   pending      planned (joins later) or a pending placement (no login yet);
 *   on_leave     the day's leave-planner code is not F (on board) or T
 *                (travel day); codes are trimmed and upper-cased, an empty
 *                code is no code;
 *   ashore       the last In/Out board event of the day is "out" (the board
 *                is P2, so wave 1 always passes nothing);
 *   on_board     otherwise.
 *
 * Pure: no client, no React.
 */

/** How a person is on a vessel's list (crew_vessel_members). */
export const CREW_PLACEMENT_KINDS = ['assignment', 'planned', 'pending_placement'] as const;
export type CrewPlacementKind = (typeof CREW_PLACEMENT_KINDS)[number];

/** The derived statuses, in decision order (statusTone domain `crew_status`). */
export const CREW_STATUSES = ['on_transfer', 'pending', 'on_leave', 'ashore', 'on_board'] as const;
export type CrewStatus = (typeof CREW_STATUSES)[number];

/** Why a status holds, as crew_vessel_list's `status_detail` codes it. */
export type CrewStatusDetail = 'transfer_in' | 'transfer_out' | 'planned' | 'pending_placement' | 'leave';

/** Leave-planner day codes that do not take a person off the vessel. */
export const ON_BOARD_DAY_CODES: readonly string[] = ['F', 'T'];

export interface CrewStatusInput {
  transferActive: boolean | null | undefined;
  placementKind: string | null | undefined;
  leaveCode: string | null | undefined;
  inOutLast: string | null | undefined;
}

/** A day code as the server compares it: trimmed, upper case; empty is none. */
export function normaliseDayCode(code: string | null | undefined): string | null {
  const value = (code ?? '').trim().toUpperCase();
  return value === '' ? null : value;
}

/** True for a day code that means the person is on leave (any code but F and T). */
export function isLeaveDayCode(code: string | null | undefined): boolean {
  const value = normaliseDayCode(code);
  return value !== null && !ON_BOARD_DAY_CODES.includes(value);
}

export function crewStatusDecide({ transferActive, placementKind, leaveCode, inOutLast }: CrewStatusInput): CrewStatus {
  if (transferActive === true) return 'on_transfer';
  if (placementKind === 'planned' || placementKind === 'pending_placement') return 'pending';
  if (isLeaveDayCode(leaveCode)) return 'on_leave';
  if ((inOutLast ?? '').trim().toLowerCase() === 'out') return 'ashore';
  return 'on_board';
}

/** Counted as aboard for the crew list report (FAL 5): on board, or ashore for the day. */
export function isAboard(status: CrewStatus): boolean {
  return status === 'on_board' || status === 'ashore';
}
