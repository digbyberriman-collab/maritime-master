/**
 * A vessel's positions (X1-01; gap/04 C12, C49): the catalogue as the
 * vessel sees it (crew_positions_for_vessel), the titles of its crew that
 * map to no position (crew_vessel_unmatched_titles), and the three writes
 * (one save of rank order and manning, a new position, a title mapping).
 *
 * D-01: while 20261124060100 is not applied both RPCs are missing; the
 * hook answers `not-set-up` (the drawer shows "Positions are not set up
 * yet", pickers fall back to free text). Any other error is `error` with a
 * retry. Nothing is mocked. Writes check what the server says it wrote
 * (affected count, returned row) and throw otherwise.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isMissingRelationError } from '@/shared/lib/notify';
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import type {
  CrewPendingFunctions, CrewPendingTables, CrewPositionSaveRow, CrewUnmatchedTitleRpcRow, CrewVesselPositionRpcRow, PositionAliasRow, PositionRow,
} from '../types/db.pending';
import type { AccessSetKey, RankTier, UnmatchedTitle, VesselPosition } from '../types/domain';
import { crewKeys } from './crewKeys';

/** The crew module's client typed with its pending tables and RPCs (D-01). */
const crewDb = pendingClient<CrewPendingTables, NoPending, CrewPendingFunctions>();

/** The vessel a positions query is for: its id and its company (from the route's vessel). */
export interface PositionsVessel {
  id: string;
  companyId: string;
}

export type PositionsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not-set-up' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; positions: VesselPosition[]; unmatched: UnmatchedTitle[]; refreshing: boolean };

export const toVesselPosition = (row: CrewVesselPositionRpcRow): VesselPosition => ({
  positionId: row.position_id,
  scope: row.scope,
  key: row.key,
  name: row.name,
  departmentKey: row.department_key,
  departmentLabel: row.department_label,
  departmentSort: row.department_sort,
  rankTier: row.rank_tier,
  defaultAccessSetKey: row.default_access_set_key,
  stcwCapacity: row.stcw_capacity,
  baseSortOrder: row.base_sort_order,
  sortOrder: row.sort_order,
  isListed: row.is_listed,
  minOnBoard: row.min_on_board,
  maxOnBoard: row.max_on_board,
  holderCount: row.holder_count,
});

export const toUnmatchedTitle = (row: CrewUnmatchedTitleRpcRow): UnmatchedTitle => ({
  title: row.title,
  titleKey: row.title_key,
  holderCount: row.holder_count,
});

/** A missing RPC is "not set up" (D-01): never retried. Other errors get one retry. */
const retryUnlessMissing = (failureCount: number, error: unknown) =>
  !isMissingRelationError(error) && failureCount < 1;

export async function fetchVesselPositions(vesselId: string): Promise<VesselPosition[]> {
  const { data, error } = await crewDb.rpc('crew_positions_for_vessel', { p_vessel_id: vesselId });
  if (error) throw error;
  return (data ?? []).map(toVesselPosition);
}

export async function fetchUnmatchedTitles(vesselId: string): Promise<UnmatchedTitle[]> {
  const { data, error } = await crewDb.rpc('crew_vessel_unmatched_titles', { p_vessel_id: vesselId });
  if (error) throw error;
  return (data ?? []).map(toUnmatchedTitle);
}

/**
 * The vessel's positions and unmatched titles. `enabled: false` (a gate
 * still loading or denied) sends no request and answers `idle`.
 */
export function usePositions(vessel: PositionsVessel | null, options: { enabled?: boolean } = {}): PositionsState {
  const enabled = (options.enabled ?? true) && Boolean(vessel?.id);
  const positions = useQuery({
    queryKey: crewKeys.positions(vessel?.companyId, vessel?.id),
    queryFn: () => fetchVesselPositions(vessel?.id as string),
    enabled,
    retry: retryUnlessMissing,
    staleTime: 60_000,
  });
  const unmatched = useQuery({
    queryKey: crewKeys.unmatchedTitles(vessel?.companyId, vessel?.id),
    queryFn: () => fetchUnmatchedTitles(vessel?.id as string),
    enabled,
    retry: retryUnlessMissing,
    staleTime: 60_000,
  });

  if (!enabled) return { status: 'idle' };
  const firstError = positions.error ?? unmatched.error;
  if (firstError) {
    if (isMissingRelationError(firstError)) return { status: 'not-set-up' };
    return {
      status: 'error',
      error: firstError,
      retry: () => {
        void positions.refetch();
        void unmatched.refetch();
      },
    };
  }
  if (!positions.data || !unmatched.data) return { status: 'loading' };
  return {
    status: 'ready',
    positions: positions.data,
    unmatched: unmatched.data,
    refreshing: positions.isFetching || unmatched.isFetching,
  };
}

/** Thrown when the server wrote fewer rows than were sent: never reported as saved. */
export class PositionsSaveIncompleteError extends Error {
  constructor(readonly sent: number, readonly written: number) {
    super(`Only ${written} of ${sent} positions were saved. Reload and try again.`);
    this.name = 'PositionsSaveIncompleteError';
  }
}

const invalidateVessel = (queryClient: ReturnType<typeof useQueryClient>, vessel: PositionsVessel | null) =>
  queryClient.invalidateQueries({ queryKey: crewKeys.vessel(vessel?.companyId, vessel?.id) });

/** One save of the vessel's listed positions, rank order and manning (crew_vessel_positions_save). */
export function useSaveVesselPositions(vessel: PositionsVessel | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: CrewPositionSaveRow[]): Promise<number> => {
      if (!vessel) throw new Error('Open a vessel first.');
      const { data, error } = await crewDb.rpc('crew_vessel_positions_save', { p_vessel_id: vessel.id, p_rows: rows });
      if (error) throw error;
      const written = typeof data === 'number' ? data : 0;
      if (written !== rows.length) throw new PositionsSaveIncompleteError(rows.length, written);
      return written;
    },
    onSettled: () => invalidateVessel(queryClient, vessel),
  });
}

export interface NewPositionInput {
  name: string;
  departmentKey: string;
  rankTier: RankTier;
  defaultAccessSetKey: AccessSetKey;
  vesselOnly: boolean;
}

/** A new position for the vessel or the company (crew_position_create); resolves to the created row. */
export function useCreatePosition(vessel: PositionsVessel | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewPositionInput): Promise<PositionRow> => {
      if (!vessel) throw new Error('Open a vessel first.');
      const { data, error } = await crewDb.rpc('crew_position_create', {
        p_vessel_id: vessel.id,
        p_name: input.name,
        p_department_key: input.departmentKey,
        p_rank_tier: input.rankTier,
        p_default_access_set_key: input.defaultAccessSetKey,
        p_vessel_only: input.vesselOnly,
      });
      if (error) throw error;
      if (!data || typeof data !== 'object' || !('id' in data)) throw new Error('The position was not created. Reload and try again.');
      return data;
    },
    onSettled: () => invalidateVessel(queryClient, vessel),
  });
}

/** Map a job title to a position for the vessel's company (crew_position_alias_set). */
export function useSetPositionAlias(vessel: PositionsVessel | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string; positionId: string }): Promise<PositionAliasRow> => {
      if (!vessel) throw new Error('Open a vessel first.');
      const { data, error } = await crewDb.rpc('crew_position_alias_set', {
        p_vessel_id: vessel.id,
        p_alias: input.title,
        p_position_id: input.positionId,
      });
      if (error) throw error;
      if (!data || typeof data !== 'object' || data.position_id !== input.positionId) {
        throw new Error('The title was not mapped. Reload and try again.');
      }
      return data;
    },
    onSettled: () => invalidateVessel(queryClient, vessel),
  });
}
