/**
 * The vessel crew list (X1-02; gap/04 C3, C4, C7; D-X1-8): one read of
 * `crew_vessel_list(vessel, day)` (the server decides who is on the list,
 * their status and invitation state, behind one gate).
 *
 * D-01. Until 20261124060200 is applied the RPC is missing (PGRST202, or a
 * 42883 naming it): the hook answers `fallback`, and the page shows the
 * documented basic list (the legacy useCrew rows of the vessel, mapped by
 * crewListModel, with today's leave-planner codes from
 * `useFallbackLeaveCodes`) and a notice. Any other error is `error` with a
 * retry. Nothing is mocked.
 *
 * Keys carry the company and vessel ids (crewKeys) and the day, so a vessel
 * switch or another as-at day never shares a cache entry.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import type { CrewPendingFunctions, CrewPendingTables } from '../types/db.pending';
import { fromRpcRow, isMissingRpc, type CrewListRow } from '../lib/crewListModel';
import { crewKeys } from './crewKeys';
import { isMissingRelationError } from '@/shared/lib/notify';
import { accountStateOf, invitationCell, type InvitationCell } from '@/modules/users-access/lib/invitationStatus';
import {
  CREW_MEMBER_ASSIGNMENT_COLUMNS,
  CREW_MEMBER_PROFILE_COLUMNS,
  toCrewMember,
  type CrewMember,
} from './useCrew';

const crewDb = pendingClient<CrewPendingTables, NoPending, CrewPendingFunctions>();

export const CREW_LIST_RPC = 'crew_vessel_list';

/** The vessel a list is for: its id and its company (the route's vessel). */
export interface CrewListVessel {
  id: string;
  companyId: string;
}

export type VesselCrewListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'fallback' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; rows: CrewListRow[]; refreshing: boolean; refetch: () => void };

export const crewListKey = (vessel: CrewListVessel | null, onDate: string) =>
  [...crewKeys.vessel(vessel?.companyId, vessel?.id), 'list', onDate] as const;

/** The list on a day; throws whatever the server said (the hook classifies it). */
export async function fetchVesselCrewList(vesselId: string, onDate: string): Promise<CrewListRow[]> {
  const { data, error } = await crewDb.rpc(CREW_LIST_RPC, { p_vessel_id: vesselId, p_on: onDate });
  if (error) throw error;
  return (data ?? []).map(fromRpcRow);
}

const retryUnlessMissing = (failureCount: number, error: unknown) => !isMissingRpc(error, CREW_LIST_RPC) && failureCount < 1;

/**
 * The vessel's crew list on `onDate` (yyyy-MM-dd). `enabled: false` (a gate
 * still loading or denied) sends no request and answers `idle`.
 */
export function useVesselCrewList(
  vessel: CrewListVessel | null,
  onDate: string,
  options: { enabled?: boolean } = {},
): VesselCrewListState {
  const enabled = (options.enabled ?? true) && Boolean(vessel?.id);
  const query = useQuery({
    queryKey: crewListKey(vessel, onDate),
    queryFn: () => fetchVesselCrewList(vessel?.id as string, onDate),
    enabled,
    retry: retryUnlessMissing,
    staleTime: 30_000,
  });
  if (!enabled) return { status: 'idle' };
  if (query.error) {
    if (isMissingRpc(query.error, CREW_LIST_RPC)) return { status: 'fallback' };
    return { status: 'error', error: query.error, retry: () => void query.refetch() };
  }
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', rows: query.data, refreshing: query.isFetching, refetch: () => void query.refetch() };
}

// ---------------------------------------------------------------- the D-01 fallback's day codes

export type FallbackLeaveCodesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; byUserId: ReadonlyMap<string, string> };

/**
 * Today's leave-planner code (crew_leave_entries, a live table) for each
 * login of the basic list, so the fallback can say On leave / On board the
 * way the server would. One query for all of them (no N+1).
 */
export function useFallbackLeaveCodes(
  companyId: string | null | undefined,
  userIds: readonly string[],
  today: string,
  options: { enabled?: boolean } = {},
): FallbackLeaveCodesState {
  const ids = [...new Set(userIds)].sort();
  const enabled = (options.enabled ?? true) && Boolean(companyId);
  const query = useQuery({
    queryKey: [...crewKeys.company(companyId), 'leave-codes', today, ids.join(',')] as const,
    queryFn: async (): Promise<ReadonlyMap<string, string>> => {
      if (ids.length === 0) return new Map();
      const { data, error } = await supabase
        .from('crew_leave_entries')
        .select('crew_id, status_code')
        .eq('company_id', companyId as string)
        .eq('date', today)
        .in('crew_id', ids);
      if (error) throw error;
      return new Map((data ?? []).map((row) => [row.crew_id, row.status_code]));
    },
    enabled,
    staleTime: 60_000,
  });
  if (!enabled) return { status: 'idle' };
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', byUserId: query.data };
}

// ---------------------------------------------------------------- crew numbers (D-272)

export type CrewNumbersState =
  | { status: 'idle' }
  | { status: 'loading' }
  /** crew_personal_details is not applied yet (D-01): no numbers, nothing to say. */
  | { status: 'missing' }
  /** Any other failure: no numbers; the list still shows, with a quiet notice. */
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; byProfileId: ReadonlyMap<string, string | null> };

export const crewNumbersKey = (companyId: string | null | undefined, vesselId: string | null | undefined, profileIds: readonly string[]) =>
  [...crewKeys.vessel(companyId, vesselId), 'crew-numbers', [...new Set(profileIds)].sort().join(',')] as const;

const MISSING = Symbol('crew_personal_details missing');

/**
 * The crew numbers of the people on a list (gap/04 C3; D-272): one batched
 * read of crew_personal_details for all of them (no N+1), merged into the
 * rows by profile id (crewListModel.withCrewNumbers). RLS decides which
 * rows come back (crew_personal_details_select_visible). Never breaks the
 * list: the table missing (D-01) leaves the numbers out silently; any other
 * error leaves them out with a notice and a retry.
 */
export function useCrewNumbers(
  companyId: string | null | undefined,
  vesselId: string | null | undefined,
  profileIds: readonly string[],
  options: { enabled?: boolean } = {},
): CrewNumbersState {
  const ids = [...new Set(profileIds)].sort();
  const enabled = (options.enabled ?? true) && Boolean(companyId && vesselId) && ids.length > 0;
  const query = useQuery({
    queryKey: crewNumbersKey(companyId, vesselId, ids),
    queryFn: async (): Promise<ReadonlyMap<string, string | null> | typeof MISSING> => {
      const { data, error } = await crewDb.from('crew_personal_details').select('profile_id, crew_number').in('profile_id', ids);
      if (error) {
        if (isMissingRelationError(error)) return MISSING;
        throw error;
      }
      return new Map((data ?? []).map((row) => [row.profile_id, row.crew_number] as const));
    },
    enabled,
    retry: (failureCount) => failureCount < 1,
    staleTime: 60_000,
  });
  if (!enabled) return { status: 'idle' };
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  if (query.data === undefined) return { status: 'loading' };
  if (query.data === MISSING) return { status: 'missing' };
  return { status: 'ready', byProfileId: query.data };
}

// ---------------------------------------------------------------- one person, for the legacy dialogs

/**
 * The full CrewMember of one profile, for the edit form (FullCrewEditModal
 * takes the legacy shape until X1-03's profile page replaces it): the
 * profile's columns, its current assignment with the vessel, else its
 * pending placement. Throws when the profile cannot be read.
 */
export async function fetchCrewMemberForEdit(profileId: string): Promise<CrewMember> {
  const { data: profile, error } = await supabase.from('profiles').select(CREW_MEMBER_PROFILE_COLUMNS).eq('id', profileId).maybeSingle();
  if (error) throw error;
  if (!profile) throw new Error('This crew member could not be found.');
  let assignment = null;
  if (profile.user_id) {
    const { data, error: assignmentError } = await supabase
      .from('crew_assignments')
      .select(CREW_MEMBER_ASSIGNMENT_COLUMNS)
      .eq('user_id', profile.user_id)
      .eq('is_current', true)
      .order('join_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    assignment = data ?? null;
  }
  let importedVessel: { id: string; name: string } | null = null;
  if (!assignment && profile.is_imported && profile.imported_vessel_id) {
    const { data, error: vesselError } = await supabase.from('vessels').select('id, name').eq('id', profile.imported_vessel_id).maybeSingle();
    if (vesselError) throw vesselError;
    importedVessel = data ?? null;
  }
  return toCrewMember(profile, assignment, importedVessel);
}

/** The edit form's CrewMember, loaded when the dialog opens (and only then). */
export function useCrewMemberForEdit(companyId: string | null | undefined, profileId: string | null) {
  return useQuery({
    queryKey: [...crewKeys.company(companyId), 'member', profileId ?? 'none'] as const,
    queryFn: () => fetchCrewMemberForEdit(profileId as string),
    enabled: Boolean(profileId),
    staleTime: 0,
    retry: false,
  });
}

// ---------------------------------------------------------------- invitation cell

/**
 * The invitation cell of a list row (the Users & Access rules), from the
 * newest invitation row crew_vessel_list returned. Kept here, beside the
 * list it reads, so the pure model stays free of the auth services.
 */
export function crewInvitationCell(row: CrewListRow, now: Date = new Date()): InvitationCell {
  const account = accountStateOf(row.accountStatus, Boolean(row.userId));
  const invitation = row.invitation
    ? {
        id: row.invitation.id,
        profile_id: row.profileId,
        status: row.invitation.status,
        send_attempts: 0,
        last_attempt_at: null,
        last_sent_at: row.invitation.lastSentAt,
        last_error_code: row.invitation.lastErrorCode,
        expires_at: row.invitation.expiresAt,
        accepted_at: null,
        revoked_at: null,
      }
    : undefined;
  return invitationCell(account, invitation, 'table', now);
}
