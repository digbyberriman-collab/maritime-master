/**
 * The routed crew profile's reads (X1-03; gap/04 C16, C19, C21; D-X1-19):
 *
 * - useCrewProfileResolve: the profiles.id behind the URL (a profiles.id or
 *   a legacy login id) through crew_profile_resolve, which answers only for
 *   people the caller may see (P0002 otherwise, shown as "not found");
 * - useCrewProfileSummary: the header (names, position, status on the
 *   vessel, the switcher in rank order, the caller's rights, the open tabs);
 * - useCrewEmployment: the Current employment card (the assignment or the
 *   pending placement, and the employment terms);
 * - useProfileSignature: the person's stored signature (SIG1), for their own
 *   profile.
 *
 * D-01. While 20261124060300 is not applied the RPCs and tables are missing:
 * resolve falls back to a profiles lookup (RLS applies), the summary to a
 * column-limited profiles read (no status, no switcher, tabs decided on the
 * client), the terms to "not set up", and the signature card is not shown
 * (the platform store, PR-X1-I, does not exist yet). Any other error is an
 * error with Retry. Nothing is mocked.
 *
 * Keys carry the company and the vessel (crewKeys), plus the profile.
 */
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import { isMissingRelationError } from '@/shared/lib/notify';
import type {
  CrewAssignmentTermsRow,
  CrewForeignPendingTables,
  CrewPendingFunctions,
  CrewPendingTables,
  CrewProfileSummaryRpcRow,
  UserSignatureImageRow,
} from '../types/db.pending';
import type { RankTier } from '../types/domain';
import type { CrewPlacementKind, CrewStatus, CrewStatusDetail } from '../lib/crewStatus';
import { isMissingRpc } from '../lib/crewListModel';
import { STATUS_CODE_MAP } from '../leaveConstants';
import { crewKeys } from './crewKeys';

const crewDb = pendingClient<CrewPendingTables, NoPending, CrewPendingFunctions>();
const foreignDb = pendingClient<CrewForeignPendingTables>();

export const PROFILE_RESOLVE_RPC = 'crew_profile_resolve';
export const PROFILE_SUMMARY_RPC = 'crew_profile_summary';

/** The vessel the profile is seen from (the route's vessel). */
export interface ProfileVessel {
  id: string;
  companyId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a string shaped like a uuid (profiles.id and login ids both are). */
export const isUuid = (value: string | null | undefined): value is string => typeof value === 'string' && UUID.test(value);

const isNotFound = (error: unknown): boolean =>
  !!error && typeof error === 'object' && (error as { code?: unknown }).code === 'P0002';

const retryOnce = (fn: string) => (failureCount: number, error: unknown) =>
  !isMissingRpc(error, fn) && !isNotFound(error) && failureCount < 1;

export const profileKeys = {
  resolve: (vessel: ProfileVessel | null, ref: string) => [...crewKeys.vessel(vessel?.companyId, vessel?.id), 'profile', ref, 'resolve'] as const,
  summary: (vessel: ProfileVessel | null, profileId: string) => [...crewKeys.vessel(vessel?.companyId, vessel?.id), 'profile', profileId, 'summary'] as const,
  employment: (vessel: ProfileVessel | null, profileId: string) => [...crewKeys.vessel(vessel?.companyId, vessel?.id), 'profile', profileId, 'employment'] as const,
  signature: (companyId: string | null | undefined, profileId: string) => [...crewKeys.company(companyId), 'profile', profileId, 'signature'] as const,
};

// ---------------------------------------------------------------- resolve

export type ProfileResolveState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not_found' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'resolved'; profileId: string; source: 'server' | 'fallback' };

interface ResolveResult {
  profileId: string | null;
  source: 'server' | 'fallback';
}

export async function resolveProfileRef(vesselId: string, ref: string): Promise<ResolveResult> {
  if (!isUuid(ref)) return { profileId: null, source: 'server' };
  const { data, error } = await crewDb.rpc(PROFILE_RESOLVE_RPC, { p_vessel_id: vesselId, p_ref: ref });
  if (!error) return { profileId: typeof data === 'string' ? data : null, source: 'server' };
  if (isNotFound(error)) return { profileId: null, source: 'server' };
  if (!isMissingRpc(error, PROFILE_RESOLVE_RPC)) throw error;
  // D-01: the profile by its id, else by its login id (RLS decides what is readable).
  const { data: rows, error: lookupError } = await supabase.from('profiles').select('id, user_id').or(`id.eq.${ref},user_id.eq.${ref}`).limit(2);
  if (lookupError) throw lookupError;
  const hit = (rows ?? []).find((r) => r.id === ref) ?? (rows ?? []).find((r) => r.user_id === ref);
  return { profileId: hit?.id ?? null, source: 'fallback' };
}

/** The profiles.id behind a profile URL. `enabled: false` (a gate still loading or denied) sends nothing. */
export function useCrewProfileResolve(vessel: ProfileVessel | null, ref: string, options: { enabled?: boolean } = {}): ProfileResolveState {
  const enabled = (options.enabled ?? true) && Boolean(vessel?.id) && Boolean(ref);
  const query = useQuery({
    queryKey: profileKeys.resolve(vessel, ref),
    queryFn: () => resolveProfileRef(vessel?.id as string, ref),
    enabled,
    retry: retryOnce(PROFILE_RESOLVE_RPC),
    staleTime: 5 * 60_000,
  });
  if (!enabled) return { status: 'idle' };
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  if (!query.data) return { status: 'loading' };
  if (!query.data.profileId) return { status: 'not_found' };
  return { status: 'resolved', profileId: query.data.profileId, source: query.data.source };
}

// ---------------------------------------------------------------- summary

export interface ProfileNeighbour {
  profileId: string;
  name: string;
}

/** The profile header and the viewer's rights, as the page uses them. */
export interface CrewProfileSummary {
  profileId: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  /** Preferred (else first) name and last name. */
  displayName: string;
  avatarUrl: string | null;
  crewNumber: string | null;
  positionName: string | null;
  positionText: string | null;
  departmentKey: string | null;
  departmentLabel: string | null;
  rankTier: RankTier | null;
  /** On this vessel's crew today (current, planned or pending placement). */
  onVessel: boolean;
  placementKind: CrewPlacementKind | null;
  assignmentId: string | null;
  joinDate: string | null;
  leaveDate: string | null;
  status: CrewStatus | null;
  statusDetail: CrewStatusDetail | null;
  transferVesselId: string | null;
  leaveCode: string | null;
  loginState: 'active' | 'pending_login' | 'disabled';
  prev: ProfileNeighbour | null;
  next: ProfileNeighbour | null;
  memberIndex: number | null;
  memberCount: number | null;
  isOwn: boolean;
  /** May change identity fields. */
  canEdit: boolean;
  /** May change self fields (contact, address, phones, languages, biography). */
  canEditSelf: boolean;
  /** The tabs the server opens to the viewer, or null in the D-01 fallback (the client decides). */
  tabs: string[] | null;
  source: 'server' | 'fallback';
}

export type ProfileSummaryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not_found' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; summary: CrewProfileSummary; refreshing: boolean };

/** "Second Stew Demo" etc.: the preferred (else first) name and the last name. */
export function profileDisplayName(first: string | null | undefined, last: string | null | undefined, preferred?: string | null): string {
  const given = (preferred ?? '').trim() || (first ?? '').trim();
  return [given, (last ?? '').trim()].filter(Boolean).join(' ') || 'Unnamed crew member';
}

const neighbour = (id: string | null, name: string | null): ProfileNeighbour | null => (id ? { profileId: id, name: name ?? 'Crew member' } : null);

export function fromSummaryRow(row: CrewProfileSummaryRpcRow): CrewProfileSummary {
  return {
    profileId: row.profile_id,
    userId: row.user_id,
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    preferredName: row.preferred_name,
    displayName: profileDisplayName(row.first_name, row.last_name, row.preferred_name),
    avatarUrl: row.avatar_url,
    crewNumber: row.crew_number,
    positionName: row.position_name,
    positionText: row.position_text,
    departmentKey: row.department_key,
    departmentLabel: row.department_label,
    rankTier: row.rank_tier,
    onVessel: row.on_vessel,
    placementKind: row.placement_kind,
    assignmentId: row.assignment_id,
    joinDate: row.join_date,
    leaveDate: row.leave_date,
    status: row.status,
    statusDetail: row.status_detail,
    transferVesselId: row.transfer_vessel_id,
    leaveCode: row.leave_code,
    loginState: row.login_state,
    prev: neighbour(row.prev_profile_id, row.prev_name),
    next: neighbour(row.next_profile_id, row.next_name),
    memberIndex: row.member_index,
    memberCount: row.member_count,
    isOwn: row.is_own,
    canEdit: row.can_edit,
    canEditSelf: row.can_edit_self,
    tabs: row.tabs ?? [],
    source: 'server',
  };
}

/** The D-01 header: a column-limited profiles read, read-only, no status and no switcher. */
const FALLBACK_COLUMNS = 'id, user_id, first_name, last_name, preferred_name, avatar_url, position, rank, department, account_status';

export async function fetchProfileSummary(vesselId: string, profileId: string, ownProfileId: string | null): Promise<CrewProfileSummary | null> {
  const { data, error } = await crewDb.rpc(PROFILE_SUMMARY_RPC, { p_profile_id: profileId, p_vessel_id: vesselId });
  if (!error) {
    const row = Array.isArray(data) ? data[0] : null;
    return row ? fromSummaryRow(row) : null;
  }
  if (isNotFound(error)) return null;
  if (!isMissingRpc(error, PROFILE_SUMMARY_RPC)) throw error;
  const { data: profile, error: profileError } = await supabase.from('profiles').select(FALLBACK_COLUMNS).eq('id', profileId).maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return null;
  const disabled = ['disabled', 'deactivated'].includes((profile.account_status ?? '').trim().toLowerCase());
  return {
    profileId: profile.id,
    userId: profile.user_id,
    firstName: profile.first_name ?? '',
    lastName: profile.last_name ?? '',
    preferredName: profile.preferred_name,
    displayName: profileDisplayName(profile.first_name, profile.last_name, profile.preferred_name),
    avatarUrl: profile.avatar_url,
    crewNumber: null,
    positionName: null,
    positionText: (profile.position ?? '').trim() || (profile.rank ?? '').trim() || null,
    departmentKey: null,
    departmentLabel: (profile.department ?? '').trim() || null,
    rankTier: null,
    onVessel: false,
    placementKind: null,
    assignmentId: null,
    joinDate: null,
    leaveDate: null,
    status: null,
    statusDetail: null,
    transferVesselId: null,
    leaveCode: null,
    loginState: profile.user_id ? (disabled ? 'disabled' : 'active') : 'pending_login',
    prev: null,
    next: null,
    memberIndex: null,
    memberCount: null,
    isOwn: profile.id === ownProfileId,
    canEdit: false,
    canEditSelf: false,
    tabs: null,
    source: 'fallback',
  };
}

/** The profile header for `profileId` seen from the vessel. `enabled: false` sends nothing. */
export function useCrewProfileSummary(
  vessel: ProfileVessel | null,
  profileId: string | null,
  options: { enabled?: boolean; ownProfileId?: string | null } = {},
): ProfileSummaryState {
  const enabled = (options.enabled ?? true) && Boolean(vessel?.id) && Boolean(profileId);
  const query = useQuery({
    queryKey: profileKeys.summary(vessel, profileId ?? ''),
    queryFn: () => fetchProfileSummary(vessel?.id as string, profileId as string, options.ownProfileId ?? null),
    enabled,
    retry: retryOnce(PROFILE_SUMMARY_RPC),
    staleTime: 30_000,
  });
  if (!enabled) return { status: 'idle' };
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  if (query.data === undefined) return { status: 'loading' };
  if (query.data === null) return { status: 'not_found' };
  return { status: 'ready', summary: query.data, refreshing: query.isFetching };
}

// ---------------------------------------------------------------- current employment

export interface EmploymentAssignment {
  id: string;
  vesselId: string | null;
  position: string | null;
  rank: string | null;
  department: string | null;
  joinDate: string | null;
  startDate: string | null;
  leaveDate: string | null;
}

export interface EmploymentPlacement {
  vesselId: string;
  position: string | null;
  joinDate: string | null;
}

export interface CurrentEmployment {
  /** The current assignment (this vessel's first, else the latest), or null. */
  assignment: EmploymentAssignment | null;
  /** The pending placement of a person without a login (D-199), or null. */
  placement: EmploymentPlacement | null;
  /** The open employment terms for the assignment's (or placement's) vessel, or null. */
  terms: CrewAssignmentTermsRow | null;
  /** crew_assignment_terms is not applied yet (D-01). */
  termsMissing: boolean;
  /** Labels of the contract types the terms may name (system and company rows). */
  contractTypeLabels: ReadonlyMap<string, string>;
}

export type EmploymentState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; employment: CurrentEmployment };

const TERMS_COLUMNS =
  'id, company_id, profile_id, vessel_id, assignment_id, position_id, department_key, start_date, date_joining_vessel, review_date, contract_type_key, leave_method, leave_days_per_year, leave_ratio_on, leave_ratio_off, place_of_embarkation, end_date, end_reason, end_notes, created_by, updated_by, created_at, updated_at';

export async function fetchCurrentEmployment(vesselId: string, profile: Pick<CrewProfileSummary, 'profileId' | 'userId'>): Promise<CurrentEmployment> {
  let assignment: EmploymentAssignment | null = null;
  let placement: EmploymentPlacement | null = null;
  if (profile.userId) {
    const { data, error } = await supabase
      .from('crew_assignments')
      .select('id, vessel_id, position, rank, department, join_date, start_date, leave_date, end_date')
      .eq('user_id', profile.userId)
      .eq('is_current', true)
      .order('join_date', { ascending: false });
    if (error) throw error;
    const rows = data ?? [];
    const row = rows.find((r) => r.vessel_id === vesselId) ?? rows[0] ?? null;
    if (row) {
      assignment = {
        id: row.id,
        vesselId: row.vessel_id,
        position: row.position,
        rank: row.rank,
        department: row.department,
        joinDate: row.join_date,
        startDate: row.start_date,
        leaveDate: row.leave_date ?? row.end_date,
      };
    }
  }
  if (!assignment) {
    const { data, error } = await supabase
      .from('profiles')
      .select('imported_vessel_id, is_imported, joining_date, position, rank')
      .eq('id', profile.profileId)
      .maybeSingle();
    if (error) throw error;
    if (data?.is_imported && data.imported_vessel_id) {
      placement = { vesselId: data.imported_vessel_id, position: (data.position ?? '').trim() || (data.rank ?? '').trim() || null, joinDate: data.joining_date };
    }
  }

  let terms: CrewAssignmentTermsRow | null = null;
  let termsMissing = false;
  const termsVessel = assignment?.vesselId ?? placement?.vesselId ?? null;
  if (termsVessel) {
    const { data, error } = await crewDb
      .from('crew_assignment_terms')
      .select(TERMS_COLUMNS)
      .eq('profile_id', profile.profileId)
      .eq('vessel_id', termsVessel)
      .is('end_date', null)
      .order('start_date', { ascending: false })
      .limit(1);
    if (error) {
      if (!isMissingRelationError(error)) throw error;
      termsMissing = true;
    } else {
      terms = data?.[0] ?? null;
    }
  }

  const contractTypeLabels = new Map<string, string>();
  if (terms?.contract_type_key) {
    const { data, error } = await crewDb.from('contract_types').select('key, label').eq('key', terms.contract_type_key);
    if (error && !isMissingRelationError(error)) throw error;
    for (const row of data ?? []) contractTypeLabels.set(row.key, row.label);
  }
  return { assignment, placement, terms, termsMissing, contractTypeLabels };
}

/** The Current employment card's data. */
export function useCrewEmployment(vessel: ProfileVessel | null, profile: Pick<CrewProfileSummary, 'profileId' | 'userId'> | null): EmploymentState {
  const enabled = Boolean(vessel?.id) && Boolean(profile?.profileId);
  const query = useQuery({
    queryKey: profileKeys.employment(vessel, profile?.profileId ?? ''),
    queryFn: () => fetchCurrentEmployment(vessel?.id as string, profile as Pick<CrewProfileSummary, 'profileId' | 'userId'>),
    enabled,
    retry: 1,
    staleTime: 60_000,
  });
  if (!enabled) return { status: 'idle' };
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', employment: query.data };
}

// ---------------------------------------------------------------- stored signature (SIG1)

export type SignatureState =
  | { status: 'idle' }
  | { status: 'loading' }
  /** user_signature_images is not built yet (PR-X1-I): the card is not shown. */
  | { status: 'missing' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; signature: Pick<UserSignatureImageRow, 'id' | 'created_at'> | null };

/** The person's active stored signature (gap/08 SIG1), if any. */
export function useProfileSignature(companyId: string | null | undefined, profileId: string | null, options: { enabled?: boolean } = {}): SignatureState {
  const enabled = (options.enabled ?? true) && Boolean(profileId);
  const query = useQuery({
    queryKey: profileKeys.signature(companyId, profileId ?? ''),
    queryFn: async () => {
      const { data, error } = await foreignDb
        .from('user_signature_images')
        .select('id, created_at')
        .eq('profile_id', profileId as string)
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) {
        if (isMissingRelationError(error)) return { missing: true as const, signature: null };
        throw error;
      }
      return { missing: false as const, signature: data?.[0] ?? null };
    },
    enabled,
    retry: (failureCount, error) => !isMissingRelationError(error) && failureCount < 1,
    staleTime: 5 * 60_000,
  });
  if (!enabled) return { status: 'idle' };
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  if (!query.data) return { status: 'loading' };
  if (query.data.missing) return { status: 'missing' };
  return { status: 'ready', signature: query.data.signature };
}

// ---------------------------------------------------------------- text for the profile cards

/** "12 Mar 2026" for a date-only string (local day), or null. */
export function formatDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return y && m && d ? format(new Date(y, m - 1, d), 'd MMM yyyy') : null;
}

/** Leave allowance in words: "30 days a year (2.50 a month)", "2:1 on/off", "No leave allowance". */
export function leaveAllowanceText(terms: Pick<CrewAssignmentTermsRow, 'leave_method' | 'leave_days_per_year' | 'leave_ratio_on' | 'leave_ratio_off'>): string | null {
  switch (terms.leave_method) {
    case 'days_per_year': {
      const days = Number(terms.leave_days_per_year ?? 0);
      const shown = Number.isInteger(days) ? String(days) : days.toFixed(2);
      return `${shown} days a year (${(days / 12).toFixed(2)} a month)`;
    }
    case 'ratio':
      return terms.leave_ratio_on && terms.leave_ratio_off ? `${terms.leave_ratio_on}:${terms.leave_ratio_off} on/off rotation` : null;
    case 'none':
      return 'No leave allowance';
    default:
      return null;
  }
}

/** Why the status holds, in words (as the crew list says it). */
export function profileStatusDetail(summary: CrewProfileSummary, vesselName: (id: string) => string | null, today: string): string | null {
  switch (summary.statusDetail) {
    case 'planned':
      return formatDay(summary.joinDate) ? `Joins ${formatDay(summary.joinDate)}` : 'Joins later';
    case 'pending_placement': {
      const expected = summary.joinDate && summary.joinDate.slice(0, 10) > today ? formatDay(summary.joinDate) : null;
      return expected ? `Expected ${expected}, once their login is linked` : 'Joins once their login is linked';
    }
    case 'leave': {
      const code = summary.leaveCode ?? '';
      const label = STATUS_CODE_MAP[code]?.label;
      return label ? `${label} (${code})` : code ? `Leave code ${code}` : 'On leave today';
    }
    case 'transfer_in': {
      const name = summary.transferVesselId ? vesselName(summary.transferVesselId) : null;
      return name ? `Transferring in from ${name}` : 'Transferring in';
    }
    case 'transfer_out': {
      const name = summary.transferVesselId ? vesselName(summary.transferVesselId) : null;
      return name ? `Transferring out to ${name}` : 'Transferring out';
    }
    default:
      return null;
  }
}
