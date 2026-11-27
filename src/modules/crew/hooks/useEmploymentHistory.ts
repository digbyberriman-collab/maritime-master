/**
 * The vessel's employment history (X1-11B; gap/04 C59, W8): every ended
 * assignment on the vessel, newest end first, through
 * crew_vessel_employment_history (061100; gate
 * hris.employee_records.contracts_employment.view with reach, no external
 * viewer), optionally narrowed to one department; and the re-hire start
 * through crew_rehire_prefill (gate vessel.crew.crew_profiles.create).
 *
 * D-01. While 061100 is not applied the history RPC is missing: the page
 * says so (PageEmpty), never an empty history. A 42501 is "no access".
 * Any other error is an error with Retry. Re-hire: with the prefill RPC
 * missing, Add crew reads the legacy prefill itself (useRehirePrefill), so
 * Re-hire still opens it.
 *
 * The re-hire prefill is read before Add crew opens so that a person who is
 * on a crew today is stopped here with the reason (they are transferred or
 * edited there, not re-hired), and so Add crew opens already filled: the
 * answer is put in Add crew's own query (addCrewKeys.rehire) in the shape
 * useRehirePrefill reads.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import type { CrewPendingFunctions, CrewPendingTables } from '../types/db.pending';
import { crewKeys } from './crewKeys';
import { addCrewKeys } from './useAddCrew';
import { EmploymentError, employmentRefusal } from './useEmployment';
import { parseRehirePrefill, toEmploymentHistoryRow, type EmploymentHistoryRow, type RehirePrefillAnswer } from '../lib/employment';

const crewDb = pendingClient<CrewPendingTables, NoPending, CrewPendingFunctions>();

export const EMPLOYMENT_HISTORY_RPC = 'crew_vessel_employment_history';
export const REHIRE_PREFILL_RPC = 'crew_rehire_prefill';

export const HISTORY_NOT_SET_UP = 'The vessel’s employment history becomes available once the crew update is applied.';

export interface HistoryVessel {
  id: string;
  companyId: string;
}

export const employmentHistoryKeys = {
  vessel: (vessel: HistoryVessel | null, departmentKey: string | null) =>
    [...crewKeys.vessel(vessel?.companyId, vessel?.id), 'employment-history', departmentKey ?? 'all'] as const,
};

export async function fetchVesselEmploymentHistory(vesselId: string, departmentKey: string | null): Promise<EmploymentHistoryRow[]> {
  const { data, error } = await crewDb.rpc(EMPLOYMENT_HISTORY_RPC, { p_vessel_id: vesselId, p_department_key: departmentKey });
  if (error) throw employmentRefusal(error, EMPLOYMENT_HISTORY_RPC, HISTORY_NOT_SET_UP);
  if (!Array.isArray(data)) throw new EmploymentError('error', 'The employment history could not be read. Try again.', 'unreadable');
  const rows = data.map(toEmploymentHistoryRow);
  // The server narrows by the same key it returns (department_key); keeping
  // only matching rows here makes the page and its counters agree with the
  // chosen department whatever answered.
  return departmentKey ? rows.filter((r) => r.departmentKey === departmentKey) : rows;
}

export type EmploymentHistoryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not_set_up' }
  | { status: 'denied'; message: string }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; rows: EmploymentHistoryRow[]; refreshing: boolean };

/** The vessel's ended assignments; reads nothing until enabled (the page's gate). */
export function useVesselEmploymentHistory(vessel: HistoryVessel | null, departmentKey: string | null, enabled = true): EmploymentHistoryState {
  const on = enabled && Boolean(vessel?.id);
  const query = useQuery({
    queryKey: employmentHistoryKeys.vessel(vessel, departmentKey),
    queryFn: () => fetchVesselEmploymentHistory(vessel?.id as string, departmentKey),
    enabled: on,
    retry: (count, error) => !(error instanceof EmploymentError && error.kind !== 'error') && count < 1,
    staleTime: 30_000,
  });
  if (!on) return { status: 'idle' };
  if (query.error) {
    const e = query.error;
    if (e instanceof EmploymentError && e.kind === 'missing') return { status: 'not_set_up' };
    if (e instanceof EmploymentError && (e.kind === 'denied' || e.kind === 'not_found')) return { status: 'denied', message: e.message };
    return { status: 'error', error: e, retry: () => void query.refetch() };
  }
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', rows: query.data, refreshing: query.isFetching };
}

// ---------------------------------------------------------------- re-hire

/** crew_rehire_prefill's answer, or null while the RPC is not applied (Add crew then reads the legacy prefill). */
export async function fetchServerRehirePrefill(vesselId: string, profileId: string): Promise<RehirePrefillAnswer | null> {
  const { data, error } = await crewDb.rpc(REHIRE_PREFILL_RPC, { p_profile_id: profileId, p_vessel_id: vesselId });
  if (error) {
    const e = employmentRefusal(error, REHIRE_PREFILL_RPC);
    if (e.kind === 'missing') return null;
    throw e;
  }
  const answer = parseRehirePrefill(data);
  if (!answer || answer.profileId !== profileId) throw new EmploymentError('error', 'The re-hire details could not be read. Try again.', 'unreadable');
  return answer;
}

export type RehireStart =
  /** Open Add crew (prefilled when the server answered). */
  | { kind: 'open' }
  /** Stopped here: the person is on a crew today, or the caller may not add crew. */
  | { kind: 'blocked'; message: string };

/**
 * Reads the re-hire prefill, puts it where Add crew's `?rehire=` reads it,
 * and says whether Add crew should open. Never throws for a refusal.
 */
export function useRehireStart(vessel: HistoryVessel | null) {
  const queryClient = useQueryClient();
  return async (profileId: string): Promise<RehireStart> => {
    if (!vessel) return { kind: 'blocked', message: 'Choose a vessel first.' };
    let answer: RehirePrefillAnswer | null;
    try {
      answer = await fetchServerRehirePrefill(vessel.id, profileId);
    } catch (e) {
      return { kind: 'blocked', message: e instanceof Error ? e.message : 'The re-hire details could not be read. Try again.' };
    }
    if (!answer) return { kind: 'open' };
    if (answer.current) {
      return {
        kind: 'blocked',
        message:
          answer.current.vesselId === vessel.id
            ? `${answer.displayName} is on this vessel’s crew already.`
            : `${answer.displayName} is on ${answer.current.vesselName ?? 'another vessel'}’s crew now. Transfer them instead of re-hiring.`,
      };
    }
    queryClient.setQueryData(addCrewKeys.rehire(vessel, profileId), {
      profileId: answer.profileId,
      displayName: answer.displayName,
      values: answer.values,
    });
    return { kind: 'open' };
  };
}
