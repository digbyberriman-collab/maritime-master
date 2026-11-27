/**
 * The vessel crew dashboard read (gap/04 C2; X1-10B): crew_vessel_dashboard
 * (20261124061000, through the training module's pending client), one
 * jsonb with a section per tile, each answered only for its own read
 * capability (lib/dashboardModel.ts parses it).
 *
 * The page turns the state into DashboardQuery for the tiles:
 *   loading, not set up (D-01: the RPC is missing; every tile says "not
 *   enabled", never 0), error (each tile's error with Try again), ready.
 * A 42501 is "denied": the page shows AccessDenied, as its own gate does.
 * An answer that is not the contract is an error (never a partial guess).
 */
import { useQuery } from '@tanstack/react-query';
import { isMissingRelation } from '@/integrations/supabase/missingRelation';
import { trainingRpc } from '@/modules/training/lib/trainingDb';
import { crewKeys } from './crewKeys';
import { DashboardShapeError, parseCrewDashboard, type CrewDashboard, type DashboardQuery } from '../lib/dashboardModel';

export const DASHBOARD_RPC = 'crew_vessel_dashboard';

/** Keys of the dashboard read, under the vessel (crewKeys.vessel). */
export const crewDashboardKeys = {
  vessel: (companyId: string | null | undefined, vesselId: string | null | undefined) => [...crewKeys.vessel(companyId, vesselId), 'dashboard'] as const,
};

/** 061000 is not applied (D-01). */
export class CrewDashboardNotSetUp extends Error {
  constructor() {
    super('The crew dashboard becomes available once the crew update is applied.');
    this.name = 'CrewDashboardNotSetUp';
  }
}

const codeOf = (error: unknown): string | null =>
  error !== null && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string' ? ((error as { code: string }).code) : null;

const retryOnce = (failureCount: number, error: unknown): boolean =>
  !(error instanceof CrewDashboardNotSetUp) && !(error instanceof DashboardShapeError) && codeOf(error) !== '42501' && codeOf(error) !== 'P0002' && failureCount < 1;

async function fetchDashboard(vesselId: string): Promise<CrewDashboard> {
  const { data, error } = await trainingRpc(DASHBOARD_RPC, { p_vessel_id: vesselId });
  if (error) {
    if (isMissingRelation(error)) throw new CrewDashboardNotSetUp();
    throw error;
  }
  return parseCrewDashboard(data);
}

export type CrewDashboardState =
  | { status: 'idle' }
  | { status: 'denied' }
  | { status: 'query'; query: DashboardQuery; error: unknown; retry: () => void; refreshing: boolean };

export function useCrewDashboard(vessel: { id: string; companyId: string } | null, enabled: boolean): CrewDashboardState {
  const on = enabled && Boolean(vessel);
  const query = useQuery({
    queryKey: crewDashboardKeys.vessel(vessel?.companyId, vessel?.id),
    queryFn: () => fetchDashboard(vessel?.id as string),
    enabled: on,
    retry: retryOnce,
    staleTime: 60_000,
  });
  const retry = () => void query.refetch();
  if (!on) return { status: 'idle' };
  if (query.error) {
    if (codeOf(query.error) === '42501') return { status: 'denied' };
    const notSetUp = query.error instanceof CrewDashboardNotSetUp;
    return { status: 'query', query: { status: notSetUp ? 'not_set_up' : 'error' }, error: query.error, retry, refreshing: query.isFetching };
  }
  if (!query.data) return { status: 'query', query: { status: 'loading' }, error: null, retry, refreshing: query.isFetching };
  return { status: 'query', query: { status: 'ready', dashboard: query.data }, error: null, retry, refreshing: query.isFetching };
}
