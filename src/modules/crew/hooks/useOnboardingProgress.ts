/**
 * Onboarding progress reads (gap/04 C18; X1-10B): crew_onboarding_progress
 * (20261124061000, through the training module's pending client) for the
 * vessel's recent joiners (the crew dashboard's Onboarding card) or for one
 * person (the profile's Onboarding card). The server decides every check
 * and gates the read: crew list access on the vessel, or the caller's own
 * row with view_own. The browser only shows the answer (lib/onboarding.ts).
 *
 * States: idle (not asked: gate closed or no vessel), loading, not set up
 * (D-01: the RPC is missing), denied (42501), error with retry, ready.
 * Nothing is mocked.
 */
import { useQuery } from '@tanstack/react-query';
import { isMissingRelation } from '@/integrations/supabase/missingRelation';
import { trainingRpc } from '@/modules/training/lib/trainingDb';
import { crewKeys } from './crewKeys';
import { OnboardingShapeError, parseOnboardingRows, type OnboardingPerson } from '../lib/onboarding';
import { DASHBOARD_JOINER_DAYS } from '../lib/dashboardModel';

export const ONBOARDING_RPC = 'crew_onboarding_progress';

export const ONBOARDING_NOT_SET_UP_NOTICE = 'Onboarding progress becomes available once the crew update is applied.';

const NONE = 'none';

/** Keys of the onboarding reads, under the vessel (crewKeys.vessel). */
export const onboardingKeys = {
  vessel: (companyId: string | null | undefined, vesselId: string | null | undefined) => [...crewKeys.vessel(companyId, vesselId), 'onboarding'] as const,
  joiners: (companyId: string | null | undefined, vesselId: string | null | undefined, days: number) =>
    [...onboardingKeys.vessel(companyId, vesselId), 'joiners', days] as const,
  person: (companyId: string | null | undefined, vesselId: string | null | undefined, profileId: string | null | undefined) =>
    [...onboardingKeys.vessel(companyId, vesselId), 'person', profileId ?? NONE] as const,
};

/** 061000 is not applied (D-01). */
export class OnboardingNotSetUp extends Error {
  constructor() {
    super(ONBOARDING_NOT_SET_UP_NOTICE);
    this.name = 'OnboardingNotSetUp';
  }
}

const codeOf = (error: unknown): string | null =>
  error !== null && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string' ? ((error as { code: string }).code) : null;

export const isOnboardingDenied = (error: unknown): boolean => codeOf(error) === '42501';

const retryOnce = (failureCount: number, error: unknown): boolean =>
  !(error instanceof OnboardingNotSetUp) && !(error instanceof OnboardingShapeError) && codeOf(error) !== '42501' && codeOf(error) !== 'P0002' && failureCount < 1;

export interface OnboardingVessel {
  id: string;
  companyId: string;
}

async function fetchOnboarding(vesselId: string, profileId: string | null, days: number): Promise<OnboardingPerson[]> {
  const { data, error } = await trainingRpc(ONBOARDING_RPC, { p_vessel_id: vesselId, p_profile_id: profileId, p_days: days });
  if (error) {
    if (isMissingRelation(error)) throw new OnboardingNotSetUp();
    throw error;
  }
  return parseOnboardingRows(data);
}

export type OnboardingListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not_set_up' }
  | { status: 'denied' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; people: OnboardingPerson[]; refreshing: boolean };

export type PersonOnboardingState =
  | Exclude<OnboardingListState, { status: 'ready' }>
  /** `person` is null when the server has no onboarding row for them on this vessel (not on its crew today). */
  | { status: 'ready'; person: OnboardingPerson | null; refreshing: boolean };

type QueryLike<T> = { data: T | undefined; error: unknown; isFetching: boolean; refetch: () => unknown };

function stateOf<T>(enabled: boolean, query: QueryLike<T>): Exclude<OnboardingListState, { status: 'ready' }> | { status: 'ready'; data: T; refreshing: boolean } {
  if (!enabled) return { status: 'idle' };
  if (query.error) {
    if (query.error instanceof OnboardingNotSetUp) return { status: 'not_set_up' };
    if (isOnboardingDenied(query.error)) return { status: 'denied' };
    return { status: 'error', error: query.error, retry: () => void query.refetch() };
  }
  if (query.data === undefined) return { status: 'loading' };
  return { status: 'ready', data: query.data, refreshing: query.isFetching };
}

/** The vessel's joiners of the last `days` days (and those still to join), latest first. */
export function useVesselOnboarding(vessel: OnboardingVessel | null, opts: { enabled: boolean; days?: number }): OnboardingListState {
  const days = opts.days ?? DASHBOARD_JOINER_DAYS;
  const enabled = opts.enabled && Boolean(vessel);
  const query = useQuery({
    queryKey: onboardingKeys.joiners(vessel?.companyId, vessel?.id, days),
    queryFn: () => fetchOnboarding(vessel?.id as string, null, days),
    enabled,
    retry: retryOnce,
    staleTime: 60_000,
  });
  const s = stateOf(enabled, query);
  return s.status === 'ready' ? { status: 'ready', people: s.data, refreshing: s.refreshing } : s;
}

/**
 * One person's onboarding on the vessel, whatever their join date. The
 * answer is kept to the person asked for, so a wider answer never shows
 * someone else's checks.
 */
export function usePersonOnboarding(vessel: OnboardingVessel | null, profileId: string | null, enabled: boolean): PersonOnboardingState {
  const on = enabled && Boolean(vessel) && Boolean(profileId);
  const query = useQuery({
    queryKey: onboardingKeys.person(vessel?.companyId, vessel?.id, profileId),
    queryFn: async () => {
      const rows = await fetchOnboarding(vessel?.id as string, profileId, DASHBOARD_JOINER_DAYS);
      return rows.find((r) => r.profileId === profileId) ?? null;
    },
    enabled: on,
    retry: retryOnce,
    staleTime: 60_000,
  });
  const s = stateOf(on, query);
  return s.status === 'ready' ? { status: 'ready', person: s.data, refreshing: s.refreshing } : s;
}
