/**
 * The crew profile's Employment tab: reads and writes (X1-11B; gap/04 C57,
 * C58, W8). The tab itself is gated on
 * hris.employee_records.contracts_employment.view; each read below asks the
 * server again (RLS or the RPC's own gate).
 *
 * Reads:
 * - useProfileTransfers: the person's transfers (crew_transfers_for_profile,
 *   061100), newest first, with the caller's rights on each.
 * - useProfileAppraisals: the person's performance reviews (live
 *   performance_reviews, summary columns only: type, status, period, due,
 *   completed, rating), read-only; they are written in HRIS.
 * - useProfileFamiliarisation: the person's familiarisation records on any
 *   vessel (familiarization_records by profile_id once 061000 is applied;
 *   before that the legacy rows of their login, D-01).
 * The Details sub-tab reuses HRIS's timeline and contracts reads
 * (useEmploymentHistory, useCrewContracts) and the profile's current
 * employment read (useCrewEmployment).
 *
 * Writes:
 * - useEndEmployment: crew_end_employment (W8): the assignment, the terms,
 *   the contract, the planner and the notice in one definer; the answer is
 *   read strictly (lib/employment parseEndEmploymentResult).
 * - useSaveEmploymentTerms: the terms through crew_onboarding_save's terms
 *   path (every key: a save of the same start date replaces the row), then
 *   the active contract's probation length and two notice periods (a direct
 *   crew_contracts update as HRIS's contract editor does, RLS: HR editors,
 *   with the affected rows checked and an audit row). A contract part that
 *   fails after the terms saved is reported as partly saved (D-218), never
 *   as success.
 *
 * Refusals (employmentRefusal): a 42501 shows its STORM sentence
 * (crewRefusalMessage, the D-207 sentences as they are); a 22023 / P0002
 * with a DETAIL shows the DETAIL and names the field its HINT points at.
 * D-01: a missing RPC (PGRST202, or 42883 naming it) is kind 'missing', and
 * each caller has its documented fallback (End employment: the legacy sign
 * off; Transfers: not set up). Nothing is mocked.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isMissingRelation, pendingClient, type NoPending } from '@/integrations/supabase/pending';
import type { Json } from '@/integrations/supabase/types';
import { trainingDb } from '@/modules/training/lib/trainingDb';
import type { CrewEmploymentEndReason, CrewPendingColumns, CrewPendingFunctions, CrewPendingTables } from '../types/db.pending';
import { crewKeys } from './crewKeys';
import { fetchTransfersForProfile, TransferError } from './useTransfers';
import { isMissingRpc } from '../lib/crewListModel';
import { crewRefusalMessage } from '../lib/crewUpdateErrors';
import type { Transfer } from '../lib/transfer';
import type { OnboardingTerms } from '../lib/addCrewSchema';
import { parseEndEmploymentResult, type ContractNoticePatch, type EndEmploymentResult } from '../lib/employment';

const crewDb = pendingClient<CrewPendingTables, NoPending, CrewPendingFunctions>();
const contractsDb = pendingClient<NoPending, NoPending, NoPending, CrewPendingColumns>();

export const END_EMPLOYMENT_RPC = 'crew_end_employment';
export const TERMS_SAVE_RPC = 'crew_onboarding_save';
export const TRANSFERS_FOR_PROFILE_RPC = 'crew_transfers_for_profile';

export const UNREADABLE_ANSWER = 'The server answered in a way STORM could not read. Nothing was assumed; try again.';
/** D-01: crew_end_employment is not applied; the legacy sign-off is offered instead. */
export const END_EMPLOYMENT_UNAVAILABLE =
  'Ending employment with its effects (contract, planner, final hours of rest month, the notice to fleet HR) becomes available once the crew update is applied. Until then Sign off ends the assignment only.';
export const TERMS_UNAVAILABLE = 'Employment terms can be stored once the crew update is applied.';

export interface EmploymentVessel {
  id: string;
  companyId: string | null;
}

const NONE = 'none';

export const employmentKeys = {
  transfers: (companyId: string | null | undefined, profileId: string | null | undefined) =>
    [...crewKeys.company(companyId), 'employment', profileId ?? NONE, 'transfers'] as const,
  appraisals: (companyId: string | null | undefined, profileId: string | null | undefined) =>
    [...crewKeys.company(companyId), 'employment', profileId ?? NONE, 'appraisals'] as const,
  familiarisation: (companyId: string | null | undefined, profileId: string | null | undefined) =>
    [...crewKeys.company(companyId), 'employment', profileId ?? NONE, 'familiarisation'] as const,
};

// ---------------------------------------------------------------- refusals

export type EmploymentErrorKind = 'refused' | 'denied' | 'not_found' | 'missing' | 'error';

export class EmploymentError extends Error {
  readonly kind: EmploymentErrorKind;
  readonly code: string | null;
  readonly hint: string | null;
  constructor(kind: EmploymentErrorKind, message: string, code: string | null = null, hint: string | null = null) {
    super(message);
    this.name = 'EmploymentError';
    this.kind = kind;
    this.code = code;
    this.hint = hint;
  }
}

interface PostgrestLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** A server error as the Employment tab shows it (never a raw code). */
export function employmentRefusal(error: unknown, rpc: string | null, missingSentence = UNREADABLE_ANSWER): EmploymentError {
  if (error instanceof EmploymentError) return error;
  if (rpc && isMissingRpc(error, rpc)) return new EmploymentError('missing', missingSentence, 'missing');
  const e = (error ?? {}) as PostgrestLike;
  const code = text(e.code);
  const detail = text(e.details);
  const hint = text(e.hint);
  const reason = text(e.message);
  if (code === '42501') return new EmploymentError('denied', crewRefusalMessage(error), reason, hint);
  if (code === 'P0002') return new EmploymentError('not_found', detail ?? 'This crew member could not be found.', reason, hint);
  if (code === '22023' && detail) return new EmploymentError('refused', detail, reason, hint);
  return new EmploymentError('error', crewRefusalMessage(error), reason ?? code, hint);
}

const retryOnce = (failureCount: number, error: unknown) =>
  !(error instanceof EmploymentError && error.kind !== 'error') && !(error instanceof TransferError && error.kind !== 'error') && failureCount < 1;

// ---------------------------------------------------------------- transfers

export type ProfileTransfersState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'denied'; message: string }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; transfers: Transfer[] };

/** The person's transfers (crew_transfers_for_profile); reads nothing until enabled. */
export function useProfileTransfers(companyId: string | null, profileId: string | null, enabled = true): ProfileTransfersState {
  const on = enabled && Boolean(profileId);
  const query = useQuery({
    queryKey: employmentKeys.transfers(companyId, profileId),
    queryFn: () => fetchTransfersForProfile(profileId as string),
    enabled: on,
    retry: retryOnce,
    staleTime: 30_000,
  });
  if (!on) return { status: 'idle' };
  if (query.error) {
    const e = query.error;
    if (e instanceof TransferError && e.kind === 'missing') return { status: 'missing' };
    if (e instanceof TransferError && (e.kind === 'denied' || e.kind === 'not_found')) return { status: 'denied', message: e.message };
    return { status: 'error', error: e, retry: () => void query.refetch() };
  }
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', transfers: query.data };
}

// ---------------------------------------------------------------- appraisals (read-only; HRIS writes them)

export interface ProfileAppraisal {
  id: string;
  reviewType: string;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
  completedAt: string | null;
  overallRating: number | null;
  vesselId: string | null;
  createdAt: string;
}

export const APPRAISAL_COLUMNS = 'id, review_type, status, period_start, period_end, due_date, completed_at, overall_rating, vessel_id, created_at';

export async function fetchProfileAppraisals(profileId: string): Promise<ProfileAppraisal[]> {
  const { data, error } = await supabase
    .from('performance_reviews')
    .select(APPRAISAL_COLUMNS)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    reviewType: r.review_type,
    status: r.status,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    dueDate: r.due_date,
    completedAt: r.completed_at,
    overallRating: r.overall_rating,
    vesselId: r.vessel_id,
    createdAt: r.created_at,
  }));
}

export type ListState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; items: T[]; legacy?: boolean };

/** The person's appraisals; reads nothing until enabled (the appraisal gate). */
export function useProfileAppraisals(companyId: string | null, profileId: string | null, enabled = true): ListState<ProfileAppraisal> {
  const on = enabled && Boolean(profileId);
  const query = useQuery({
    queryKey: employmentKeys.appraisals(companyId, profileId),
    queryFn: () => fetchProfileAppraisals(profileId as string),
    enabled: on,
    retry: 1,
    staleTime: 60_000,
  });
  if (!on) return { status: 'idle' };
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', items: query.data };
}

// ---------------------------------------------------------------- familiarisation records of the person

export interface ProfileFamiliarisationRecord {
  id: string;
  templateName: string;
  vesselId: string;
  vesselName: string | null;
  status: string;
  joinDate: string | null;
  dueDate: string | null;
  completedOn: string | null;
  percent: number | null;
  crewSignedAt: string | null;
  supervisorSignedAt: string | null;
}

const FAM_COLUMNS_NEW =
  'id, template_id, vessel_id, status, join_date, target_completion_date, due_date, completion_percentage, actual_completion_date, crew_signed_at, supervisor_signed_at, familiarization_templates(name), vessels(name)';
const FAM_COLUMNS_LEGACY =
  'id, template_id, vessel_id, status, join_date, target_completion_date, completion_percentage, actual_completion_date, familiarization_templates(name), vessels(name)';

type FamRow = {
  id: string;
  vessel_id: string;
  status: string;
  join_date: string | null;
  target_completion_date: string | null;
  due_date?: string | null;
  completion_percentage: number | null;
  actual_completion_date: string | null;
  crew_signed_at?: string | null;
  supervisor_signed_at?: string | null;
  familiarization_templates: { name: string | null } | { name: string | null }[] | null;
  vessels: { name: string | null } | { name: string | null }[] | null;
};

const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

const toFamRecord = (r: FamRow): ProfileFamiliarisationRecord => ({
  id: r.id,
  templateName: one(r.familiarization_templates)?.name?.trim() || 'Familiarisation',
  vesselId: r.vessel_id,
  vesselName: one(r.vessels)?.name ?? null,
  status: r.status,
  joinDate: r.join_date,
  dueDate: r.due_date ?? r.target_completion_date ?? null,
  completedOn: r.actual_completion_date,
  percent: typeof r.completion_percentage === 'number' ? r.completion_percentage : null,
  crewSignedAt: r.crew_signed_at ?? null,
  supervisorSignedAt: r.supervisor_signed_at ?? null,
});

/**
 * The person's familiarisation records on any vessel the caller may see
 * (RLS). By profile once 061000 is applied; before that (the profile_id
 * column missing, D-01) the legacy rows of their login, and none for a
 * person without one.
 */
export async function fetchProfileFamiliarisation(profile: { profileId: string; userId: string | null }): Promise<{ items: ProfileFamiliarisationRecord[]; legacy: boolean }> {
  const current = await trainingDb
    .from('familiarization_records')
    .select(FAM_COLUMNS_NEW)
    .eq('profile_id', profile.profileId)
    .order('join_date', { ascending: false })
    .limit(100);
  if (!current.error) return { items: ((current.data ?? []) as unknown as FamRow[]).map(toFamRecord), legacy: false };
  if (!isMissingRelation(current.error)) throw current.error;
  if (!profile.userId) return { items: [], legacy: true };
  const legacy = await supabase
    .from('familiarization_records')
    .select(FAM_COLUMNS_LEGACY)
    .eq('user_id', profile.userId)
    .order('join_date', { ascending: false })
    .limit(100);
  if (legacy.error) throw legacy.error;
  return { items: ((legacy.data ?? []) as unknown as FamRow[]).map(toFamRecord), legacy: true };
}

export function useProfileFamiliarisation(
  companyId: string | null,
  profile: { profileId: string; userId: string | null } | null,
  enabled = true,
): ListState<ProfileFamiliarisationRecord> {
  const on = enabled && Boolean(profile?.profileId);
  const query = useQuery({
    queryKey: employmentKeys.familiarisation(companyId, profile?.profileId),
    queryFn: () => fetchProfileFamiliarisation(profile as { profileId: string; userId: string | null }),
    enabled: on,
    retry: 1,
    staleTime: 60_000,
  });
  if (!on) return { status: 'idle' };
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', items: query.data.items, legacy: query.data.legacy };
}

// ---------------------------------------------------------------- end employment (W8)

export interface EndEmploymentArgs {
  p_profile_id: string;
  p_vessel_id: string;
  p_end_date: string;
  p_reason: CrewEmploymentEndReason;
  p_notes: string | null;
}

/** Runs crew_end_employment; the answer must be readable and name the end date and reason sent. */
export async function runEndEmployment(args: EndEmploymentArgs): Promise<EndEmploymentResult> {
  const { data, error } = await crewDb.rpc(END_EMPLOYMENT_RPC, args);
  if (error) throw employmentRefusal(error, END_EMPLOYMENT_RPC, END_EMPLOYMENT_UNAVAILABLE);
  const result = parseEndEmploymentResult(data);
  if (!result || result.endDate !== args.p_end_date || result.reason !== args.p_reason) {
    throw new EmploymentError('error', UNREADABLE_ANSWER, 'unreadable');
  }
  return result;
}

/** Every read that an end of employment changes. */
function invalidateEmployment(queryClient: ReturnType<typeof useQueryClient>, vessel: EmploymentVessel | null, profileId: string | null) {
  void queryClient.invalidateQueries({ queryKey: crewKeys.vessel(vessel?.companyId, vessel?.id) });
  void queryClient.invalidateQueries({ queryKey: [...crewKeys.company(vessel?.companyId), 'employment', profileId ?? NONE] });
  void queryClient.invalidateQueries({ queryKey: ['crew'] });
  void queryClient.invalidateQueries({ queryKey: ['hris'] });
}

export function useEndEmployment(vessel: EmploymentVessel | null, profileId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runEndEmployment,
    onSuccess: () => invalidateEmployment(queryClient, vessel, profileId),
  });
}

// ---------------------------------------------------------------- employment terms + the contract's periods (C57)

export interface TermsSaveInput {
  profileId: string;
  vesselId: string;
  /** The full p_terms, or null when the terms part did not change. */
  terms: OnboardingTerms | null;
  /** The contract's periods, or null when that part did not change. */
  contract: { id: string; before: ContractNoticePatch; patch: ContractNoticePatch } | null;
  actor: { userId: string | null; email: string | null; role: string | null };
}

export type TermsSaveOutcome =
  | { kind: 'saved'; terms: boolean; contract: boolean }
  /** The terms were saved and the contract part was refused: say so, keep the dialog's entries (D-218). */
  | { kind: 'partly_saved'; contractError: string };

export const CONTRACT_NOT_CHANGED = 'The contract was not changed. You may not have HR edit access to this contract.';
export const CONTRACT_COLUMNS_MISSING = 'The probation and notice periods can be stored once the crew update is applied.';

async function saveContractPeriods(input: NonNullable<TermsSaveInput['contract']>, actor: TermsSaveInput['actor']): Promise<void> {
  const { data, error } = await contractsDb
    .from('crew_contracts')
    .update({ ...input.patch, updated_by: actor.userId })
    .eq('id', input.id)
    .select('id');
  if (error) {
    if (isMissingRelation(error)) throw new EmploymentError('missing', CONTRACT_COLUMNS_MISSING, 'missing');
    throw employmentRefusal(error, null);
  }
  if (!data || data.length === 0) throw new EmploymentError('denied', CONTRACT_NOT_CHANGED, 'no_rows');
  // The same audit trail as HRIS's contract editor; a failed audit never fails the save.
  const { error: auditError } = await supabase.from('audit_logs').insert({
    entity_type: 'crew_contract',
    entity_id: input.id,
    action: 'UPDATE',
    actor_user_id: actor.userId,
    actor_email: actor.email,
    actor_role: actor.role,
    old_values: input.before as unknown as Json,
    new_values: input.patch as unknown as Json,
  });
  if (auditError) console.warn('crew_contract audit log failed', auditError);
}

/** Saves the terms, then the contract's periods; refusals before anything is saved throw, a later one is a partial outcome. */
export async function saveEmploymentTerms(input: TermsSaveInput): Promise<TermsSaveOutcome> {
  if (input.terms) {
    const { data, error } = await crewDb.rpc(TERMS_SAVE_RPC, {
      p_profile_id: input.profileId,
      p_vessel_id: input.vesselId,
      p_terms: input.terms as unknown as Json,
    });
    if (error) throw employmentRefusal(error, TERMS_SAVE_RPC, TERMS_UNAVAILABLE);
    const row = data as unknown as { id?: unknown; start_date?: unknown } | null;
    if (!row || typeof row.id !== 'string' || row.start_date !== input.terms.start_date) {
      throw new EmploymentError('error', UNREADABLE_ANSWER, 'unreadable');
    }
  }
  if (input.contract) {
    try {
      await saveContractPeriods(input.contract, input.actor);
    } catch (e) {
      if (input.terms) return { kind: 'partly_saved', contractError: e instanceof Error ? e.message : crewRefusalMessage(e) };
      throw e;
    }
  }
  return { kind: 'saved', terms: Boolean(input.terms), contract: Boolean(input.contract) };
}

export function useSaveEmploymentTerms(vessel: EmploymentVessel | null, profileId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveEmploymentTerms,
    onSettled: (outcome) => {
      if (outcome) invalidateEmployment(queryClient, vessel, profileId);
    },
  });
}
