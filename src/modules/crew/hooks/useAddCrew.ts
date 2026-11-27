/**
 * Add crew member's reads and saves (gap/04 C14, W1; X1-03B).
 *
 * - useContractTypes: the contract types the company may use (STORM's and
 *   its own), for the Employment section.
 * - useVesselHomePort: the vessel's home port, the default place of embarkation.
 * - useDuplicateCheck: crew_find_duplicates before Save (people of the
 *   company with the same email, or the same name).
 * - useAddCrewSave: create-crew-member (through the adminActions wrapper),
 *   then crew_onboarding_save; the outcome part by part (lib/addCrewSchema).
 *   A re-hire (the person exists, on no crew) is one crew_rehire_save call
 *   (D-374): the assignment, the terms, the draft contract and the On board
 *   period, or nothing; missing -> not added (D-01), never a fake success.
 * - useRehirePrefill: the `?rehire=<profileId>` prefill (X1-11B): names,
 *   email, and the last employment terms' position, department, contract
 *   type and leave allowance.
 *
 * D-01. crew_find_duplicates missing: the check is skipped and the page
 * says so. crew_onboarding_save missing: the person is added and the
 * outcome says the employment details were not saved. contract_types
 * missing: the field is not offered. Any other error is an error. Nothing
 * is mocked; every write's answer is checked (a terms save must return its
 * row).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import { isMissingRelationError } from '@/shared/lib/notify';
import { createCrewMember } from '@/modules/auth/services/adminActions';
import type { CrewPendingFunctions, CrewPendingTables, CrewAssignmentTermsRow, CrewRehireSaveResult } from '../types/db.pending';
import type { ReferenceList } from './useReferenceData';
import { crewKeys } from './crewKeys';
import { isMissingRpc } from '../lib/crewListModel';
import { crewRefusalMessage } from '../lib/crewUpdateErrors';
import {
  addCrewResult,
  rehireFailure,
  rehireResult,
  toCreateCrewInput,
  toOnboardingTerms,
  type AddCrewResult,
  type AddCrewValues,
  type DuplicateMatchKind,
  type OnboardingOutcome,
  type RehireOutcome,
} from '../lib/addCrewSchema';

const crewDb = pendingClient<CrewPendingTables, NoPending, CrewPendingFunctions>();

export const FIND_DUPLICATES_RPC = 'crew_find_duplicates';
export const ONBOARDING_SAVE_RPC = 'crew_onboarding_save';
export const REHIRE_SAVE_RPC = 'crew_rehire_save';

export interface AddCrewVessel {
  id: string;
  companyId: string;
}

export const addCrewKeys = {
  homePort: (vessel: AddCrewVessel | null) => [...crewKeys.vessel(vessel?.companyId, vessel?.id), 'home-port'] as const,
  rehire: (vessel: AddCrewVessel | null, profileId: string) => [...crewKeys.vessel(vessel?.companyId, vessel?.id), 'rehire', profileId] as const,
};

const retryUnlessMissing = (failureCount: number, error: unknown) => !isMissingRelationError(error) && failureCount < 1;

// ---------------------------------------------------------------- contract types

export interface ContractTypeOption {
  key: string;
  label: string;
}

export async function fetchContractTypes(companyId: string): Promise<ContractTypeOption[]> {
  const { data, error } = await crewDb
    .from('contract_types')
    .select('key, label, company_id, sort_order')
    .eq('is_active', true)
    .or(`company_id.is.null,company_id.eq.${companyId}`)
    .order('sort_order')
    .order('label');
  if (error) throw error;
  // A company row with STORM's key replaces STORM's row.
  const byKey = new Map<string, ContractTypeOption & { company: boolean }>();
  for (const row of data ?? []) {
    const existing = byKey.get(row.key);
    if (!existing || (!existing.company && row.company_id)) byKey.set(row.key, { key: row.key, label: row.label, company: Boolean(row.company_id) });
  }
  return [...byKey.values()].map(({ key, label }) => ({ key, label }));
}

export function useContractTypes(companyId: string | null, options: { enabled?: boolean } = {}): ReferenceList<ContractTypeOption> {
  const enabled = (options.enabled ?? true) && Boolean(companyId);
  const query = useQuery({
    queryKey: crewKeys.contractTypes(companyId),
    queryFn: () => fetchContractTypes(companyId as string),
    enabled,
    retry: retryUnlessMissing,
    staleTime: 60 * 60_000,
  });
  if (query.error) {
    if (isMissingRelationError(query.error)) return { status: 'missing', items: [] };
    return { status: 'error', items: [], error: query.error, retry: () => void query.refetch() };
  }
  if (!query.data) return { status: 'loading', items: [] };
  return { status: 'ready', items: query.data };
}

// ---------------------------------------------------------------- home port

/** The vessel's home port, or null when none is recorded. `undefined` while loading. */
export function useVesselHomePort(vessel: AddCrewVessel | null): string | null | undefined {
  const query = useQuery({
    queryKey: addCrewKeys.homePort(vessel),
    queryFn: async () => {
      const { data, error } = await supabase.from('vessels').select('id, home_port').eq('id', vessel?.id as string).maybeSingle();
      if (error) throw error;
      return (data?.home_port ?? '').trim() || null;
    },
    enabled: Boolean(vessel?.id),
    retry: 1,
    staleTime: 10 * 60_000,
  });
  if (query.error) return null;
  return query.data;
}

// ---------------------------------------------------------------- duplicate check

export interface CrewDuplicate {
  profileId: string;
  name: string;
  vesselId: string | null;
  vesselName: string | null;
  matchKind: DuplicateMatchKind;
}

export type DuplicateCheck =
  | { status: 'clear' }
  | { status: 'matches'; matches: CrewDuplicate[] }
  /** crew_find_duplicates is not applied (D-01): the check was skipped. */
  | { status: 'unavailable' };

export async function findDuplicates(vesselId: string, values: Pick<AddCrewValues, 'email' | 'firstName' | 'lastName'>): Promise<DuplicateCheck> {
  const { data, error } = await crewDb.rpc(FIND_DUPLICATES_RPC, {
    p_vessel_id: vesselId,
    p_email: values.email.trim(),
    p_first: values.firstName.trim(),
    p_last: values.lastName.trim(),
  });
  if (error) {
    if (isMissingRpc(error, FIND_DUPLICATES_RPC)) return { status: 'unavailable' };
    throw error;
  }
  const matches = (data ?? []).map((row) => ({
    profileId: row.profile_id,
    name: [row.first_name, row.last_name].map((s) => (s ?? '').trim()).filter(Boolean).join(' ') || 'Unnamed crew member',
    vesselId: row.vessel_id,
    vesselName: row.vessel_name,
    matchKind: row.match_kind,
  }));
  return matches.length ? { status: 'matches', matches } : { status: 'clear' };
}

// ---------------------------------------------------------------- the save

/** Thrown when the terms save answered without the row it should have written. */
export class OnboardingNotConfirmedError extends Error {
  constructor() {
    super('The server did not confirm the employment details');
  }
}

export async function saveOnboarding(vesselId: string, profileId: string, values: AddCrewValues, context: { positionsFromCatalogue: boolean; departmentsAvailable: boolean }): Promise<OnboardingOutcome> {
  const { data, error } = await crewDb.rpc(ONBOARDING_SAVE_RPC, {
    p_profile_id: profileId,
    p_vessel_id: vesselId,
    p_terms: toOnboardingTerms(values, context),
  });
  if (error) {
    if (isMissingRpc(error, ONBOARDING_SAVE_RPC)) return { status: 'missing' };
    return { status: 'failed', message: crewRefusalMessage(error) };
  }
  const row = (Array.isArray(data) ? data[0] : data) as CrewAssignmentTermsRow | null | undefined;
  if (!row || row.profile_id !== profileId) return { status: 'failed', message: new OnboardingNotConfirmedError().message };
  return { status: 'saved' };
}

/** The re-hire (D-374): one definer writes the assignment, the terms linked to it, the draft contract and the On board period. */
export async function saveRehire(vesselId: string, profileId: string, values: AddCrewValues, context: { positionsFromCatalogue: boolean; departmentsAvailable: boolean }): Promise<RehireOutcome> {
  const { data, error } = await crewDb.rpc(REHIRE_SAVE_RPC, {
    p_profile_id: profileId,
    p_vessel_id: vesselId,
    p_terms: toOnboardingTerms(values, context),
  });
  if (error) {
    if (isMissingRpc(error, REHIRE_SAVE_RPC)) return { status: 'missing' };
    return rehireFailure(error, crewRefusalMessage(error));
  }
  const row = (Array.isArray(data) ? data[0] : data) as CrewRehireSaveResult | null | undefined;
  if (!row || typeof row.assignment_id !== 'string' || !row.assignment_id) {
    return { status: 'failed', message: 'The server did not confirm the re-hire', retry: true };
  }
  return { status: 'saved', assignmentId: row.assignment_id, contractId: row.contract_id ?? null, periodId: row.period_id ?? null };
}

export interface AddCrewSaveContext {
  /** The chosen position's canonical name (D-X1-2), or null for a typed title (D-01). */
  positionName: string | null;
  positionsFromCatalogue: boolean;
  departmentsAvailable: boolean;
  /** A re-hire: the person exists; crew_rehire_save writes the assignment and the terms (D-374). */
  rehireProfileId?: string | null;
}

/** Add the person, then their employment terms on this vessel; resolve with the outcome, never throw for a refusal. */
export function useAddCrewSave(vessel: AddCrewVessel) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ values, context }: { values: AddCrewValues; context: AddCrewSaveContext }): Promise<AddCrewResult> => {
      const terms = { positionsFromCatalogue: context.positionsFromCatalogue, departmentsAvailable: context.departmentsAvailable };
      if (context.rehireProfileId) {
        return rehireResult(await saveRehire(vessel.id, context.rehireProfileId, values, terms), context.rehireProfileId);
      }
      const created = await createCrewMember(toCreateCrewInput(values, { vesselId: vessel.id, positionName: context.positionName }));
      const profileId =
        created.kind === 'created' || created.kind === 'created_invite_failed' || created.kind === 'created_assignment_failed' ? created.profileId : null;
      const onboarding = profileId ? await saveOnboarding(vessel.id, profileId, values, terms) : null;
      return addCrewResult(created, onboarding);
    },
    onSettled: (result) => {
      if (result && result.kind !== 'not_added') {
        void queryClient.invalidateQueries({ queryKey: crewKeys.vessel(vessel.companyId, vessel.id) });
        void queryClient.invalidateQueries({ queryKey: ['crew'] });
      }
    },
  });
}

// ---------------------------------------------------------------- re-hire prefill (X1-11B)

export type RehirePrefillState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not_found' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; profileId: string; displayName: string; values: Partial<AddCrewValues> };

interface RehirePrefill {
  profileId: string;
  displayName: string;
  values: Partial<AddCrewValues>;
}

export async function fetchRehirePrefill(companyId: string, profileId: string): Promise<RehirePrefill | null> {
  const { data: person, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, preferred_name, email, company_id')
    .eq('id', profileId)
    .maybeSingle();
  if (error) throw error;
  if (!person || person.company_id !== companyId) return null;
  const values: Partial<AddCrewValues> = {
    firstName: person.first_name ?? '',
    lastName: person.last_name ?? '',
    email: person.email ?? '',
  };
  const terms = await crewDb
    .from('crew_assignment_terms')
    .select('position_id, department_key, contract_type_key, leave_method, leave_days_per_year, leave_ratio_on, leave_ratio_off, place_of_embarkation, start_date')
    .eq('profile_id', profileId)
    .order('start_date', { ascending: false })
    .limit(1);
  if (terms.error && !isMissingRelationError(terms.error)) throw terms.error;
  const last = terms.data?.[0];
  if (last) {
    if (last.position_id) values.positionId = last.position_id;
    if (last.department_key) values.departmentKey = last.department_key;
    if (last.contract_type_key) values.contractTypeKey = last.contract_type_key;
    if (last.place_of_embarkation) values.placeOfEmbarkation = last.place_of_embarkation;
    if (last.leave_method) {
      values.leaveMethod = last.leave_method;
      values.leaveDaysPerYear = last.leave_days_per_year === null ? '' : String(Number(last.leave_days_per_year));
      values.leaveRatioOn = last.leave_ratio_on === null ? '' : String(last.leave_ratio_on);
      values.leaveRatioOff = last.leave_ratio_off === null ? '' : String(last.leave_ratio_off);
    }
  }
  const given = (person.preferred_name ?? '').trim() || (person.first_name ?? '').trim();
  return { profileId: person.id, displayName: [given, (person.last_name ?? '').trim()].filter(Boolean).join(' ') || 'Crew member', values };
}

/** The `?rehire=` prefill. `profileId` null (a plain Add crew) answers `idle` and reads nothing. */
export function useRehirePrefill(vessel: AddCrewVessel | null, profileId: string | null): RehirePrefillState {
  const enabled = Boolean(vessel?.companyId) && Boolean(profileId);
  const query = useQuery({
    queryKey: addCrewKeys.rehire(vessel, profileId ?? ''),
    queryFn: () => fetchRehirePrefill(vessel?.companyId as string, profileId as string),
    enabled,
    retry: 1,
    staleTime: 60_000,
  });
  if (!enabled) return { status: 'idle' };
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  if (query.data === undefined) return { status: 'loading' };
  if (query.data === null) return { status: 'not_found' };
  return { status: 'ready', ...query.data };
}
