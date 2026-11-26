/**
 * Crew document reviews (X1-05; gap/04 C27, C28, C30): what the caller may
 * do about a person's documents, the earlier versions of each document, and
 * the four writes.
 *
 * - useDocumentReviewRights: crew_document_review_rights (verify, and why
 *   not; alerts off and on; renew). One row per person.
 * - useDocumentVersions: crew_document_versions of the person (RLS: the
 *   document's own visibility), newest first per document, with the names
 *   of who replaced and who had reviewed each version.
 * - verifyCrewDocument / muteCrewDocument / unmuteCrewDocument /
 *   renewCrewDocument and their mutations: each checked against what the
 *   server answered (the same document, in the state asked for), never a
 *   quiet success. A refusal is thrown as the server sent it
 *   (crewDocumentRefusal reads it).
 *
 * D-01. While 20261124060500 is not applied the RPCs and the versions table
 * are missing (PGRST202, a 42883 naming the function, a missing relation):
 * the rights answer 'not_applied' (the tabs keep the badges read-only and
 * hide verify, alerts off and renew behind REVIEW_UNAVAILABLE_NOTICE), the
 * versions answer 'not_applied', and a write refuses with that notice. Any
 * other error is an error state with Retry. Nothing is mocked.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import { isMissingTable } from '@/integrations/supabase/missingRelation';
import type { Json } from '@/integrations/supabase/types';
import type {
  CrewDocumentDecision,
  CrewDocumentStoredRow,
  CrewDocumentVersionRow,
  CrewDocumentVerifyBlock,
  CrewPendingFunctions,
  CrewPendingTables,
} from '../types/db.pending';
import { isMissingRpc } from '../lib/crewListModel';
import { CrewDocumentWriteError } from './useCrewDocuments';
import { crewDocumentKeys } from './useDocumentTypes';

const crewDb = pendingClient<CrewPendingTables, NoPending, CrewPendingFunctions>();

export const REVIEW_RIGHTS_RPC = 'crew_document_review_rights';
export const VERIFY_RPC = 'crew_document_verify';
export const MUTE_RPC = 'crew_document_mute';
export const UNMUTE_RPC = 'crew_document_unmute';
export const RENEW_RPC = 'crew_document_renew';

/** While 20261124060500 is not applied (D-01): the badges stay read-only. */
export const REVIEW_UNAVAILABLE_NOTICE = 'Verifying, turning alerts off and renewing documents become available once the crew update is applied.';

/** The version columns the drawer reads (never select('*')). */
export const VERSION_COLUMNS =
  'id, crew_document_id, version_no, number, issue_date, expiry_date, no_expiry, issuing_country_code, issuing_office, file_path, file_url, file_name, file_mime, verification_status, verified_by, verified_at, verification_note, reason, replaced_at, replaced_by';

const NAME_COLUMNS = 'user_id, first_name, last_name, preferred_name';

export const crewDocumentReviewKeys = {
  rights: (companyId: string | null | undefined, profileId: string | null | undefined) =>
    [...crewDocumentKeys.person(companyId, profileId), 'review', 'rights'] as const,
  versions: (companyId: string | null | undefined, profileId: string | null | undefined) =>
    [...crewDocumentKeys.person(companyId, profileId), 'review', 'versions'] as const,
};

/** The RPC or the table is not applied yet (D-01). */
class ReviewNotApplied extends Error {}

const notApplied = (error: unknown, fn: string) => isMissingRpc(error, fn) || isMissingTable(error);

const noRetry = (failureCount: number, error: unknown) => {
  if (error instanceof ReviewNotApplied) return false;
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
  return code !== '42501' && code !== 'P0002' && failureCount < 1;
};

// ---------------------------------------------------------------- rights

export interface DocumentReviewRights {
  canVerify: boolean;
  /** Why the caller may not verify (null when they may). */
  verifyBlock: CrewDocumentVerifyBlock | null;
  canMute: boolean;
  canRenew: boolean;
}

export type DocumentReviewRightsState =
  | { status: 'idle' }
  | { status: 'loading' }
  /** 20261124060500 is not applied (D-01): verify, alerts off and renew stay hidden. */
  | { status: 'not_applied' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; rights: DocumentReviewRights };

export async function fetchDocumentReviewRights(profileId: string): Promise<DocumentReviewRights> {
  const { data, error } = await crewDb.rpc(REVIEW_RIGHTS_RPC, { p_profile_id: profileId });
  if (error) {
    if (notApplied(error, REVIEW_RIGHTS_RPC)) throw new ReviewNotApplied();
    throw error;
  }
  const row = (data ?? [])[0];
  return {
    canVerify: Boolean(row?.can_verify),
    verifyBlock: row?.can_verify ? null : row?.verify_block ?? 'not_permitted',
    canMute: Boolean(row?.can_mute),
    canRenew: Boolean(row?.can_renew),
  };
}

/** The caller's review rights for a person's documents. False while `enabled` is false (a gate loading or denied): nothing is sent. */
export function useDocumentReviewRights(
  profileId: string | null | undefined,
  options: { companyId: string | null | undefined; enabled?: boolean },
): DocumentReviewRightsState {
  const enabled = (options.enabled ?? true) && Boolean(profileId) && Boolean(options.companyId);
  const query = useQuery({
    queryKey: crewDocumentReviewKeys.rights(options.companyId, profileId),
    queryFn: () => fetchDocumentReviewRights(profileId as string),
    enabled,
    retry: noRetry,
    staleTime: 5 * 60_000,
  });
  if (!enabled) return { status: 'idle' };
  if (query.error instanceof ReviewNotApplied) return { status: 'not_applied' };
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', rights: query.data };
}

// ---------------------------------------------------------------- versions

/** One earlier version of a document, as the history drawer shows it. */
export interface CrewDocumentVersion {
  id: string;
  documentId: string;
  versionNo: number;
  number: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  noExpiry: boolean;
  issuingCountryCode: string | null;
  issuingOffice: string | null;
  /** A stored file (a storage path, or a legacy reference). */
  hasFile: boolean;
  filePath: string | null;
  /** A legacy upload's stored reference. */
  fileUrl: string | null;
  fileName: string | null;
  fileMime: string | null;
  verificationStatus: CrewDocumentVersionRow['verification_status'];
  verifiedByName: string | null;
  verifiedAt: string | null;
  verificationNote: string | null;
  reason: string | null;
  replacedAt: string;
  replacedByName: string | null;
}

export interface CrewDocumentVersions {
  /** Per document id, newest first. */
  byDocument: ReadonlyMap<string, readonly CrewDocumentVersion[]>;
  /** The names could not be read (they show as not available, never invented). */
  namesUnavailable: boolean;
}

export type DocumentVersionsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not_applied' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; versions: CrewDocumentVersions };

type VersionRow = Pick<
  CrewDocumentVersionRow,
  | 'id' | 'crew_document_id' | 'version_no' | 'number' | 'issue_date' | 'expiry_date' | 'no_expiry' | 'issuing_country_code' | 'issuing_office'
  | 'file_path' | 'file_url' | 'file_name' | 'file_mime' | 'verification_status' | 'verified_by' | 'verified_at' | 'verification_note' | 'reason'
  | 'replaced_at' | 'replaced_by'
>;

interface NameRow {
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
}

const displayName = (p: NameRow): string | null => {
  const first = p.preferred_name?.trim() || p.first_name?.trim() || '';
  const name = [first, p.last_name?.trim() ?? ''].filter(Boolean).join(' ');
  return name || null;
};

/** Group version rows per document, newest first, with the names resolved. */
export function groupVersions(rows: readonly VersionRow[], names: ReadonlyMap<string, string>): Map<string, CrewDocumentVersion[]> {
  const out = new Map<string, CrewDocumentVersion[]>();
  for (const r of rows) {
    const list = out.get(r.crew_document_id) ?? [];
    list.push({
      id: r.id,
      documentId: r.crew_document_id,
      versionNo: r.version_no,
      number: r.number,
      issueDate: r.issue_date,
      expiryDate: r.expiry_date,
      noExpiry: r.no_expiry,
      issuingCountryCode: r.issuing_country_code,
      issuingOffice: r.issuing_office,
      hasFile: Boolean(r.file_path || (r.file_url && r.file_url.trim() !== '')),
      filePath: r.file_path,
      fileUrl: r.file_url,
      fileName: r.file_name,
      fileMime: r.file_mime,
      verificationStatus: r.verification_status,
      verifiedByName: r.verified_by ? names.get(r.verified_by) ?? null : null,
      verifiedAt: r.verified_at,
      verificationNote: r.verification_note,
      reason: r.reason,
      replacedAt: r.replaced_at,
      replacedByName: r.replaced_by ? names.get(r.replaced_by) ?? null : null,
    });
    out.set(r.crew_document_id, list);
  }
  for (const list of out.values()) list.sort((a, b) => b.versionNo - a.versionNo);
  return out;
}

/** The person's document versions (one select for every document), then one names select. */
export async function fetchDocumentVersions(profileId: string): Promise<CrewDocumentVersions> {
  const { data, error } = await crewDb
    .from('crew_document_versions')
    .select(VERSION_COLUMNS)
    .eq('profile_id', profileId)
    .order('version_no', { ascending: false });
  if (error) {
    if (isMissingTable(error)) throw new ReviewNotApplied();
    throw error;
  }
  const rows = (data ?? []) as VersionRow[];
  const ids = Array.from(new Set(rows.flatMap((r) => [r.replaced_by, r.verified_by]).filter((v): v is string => Boolean(v))));
  const names = new Map<string, string>();
  let namesUnavailable = false;
  if (ids.length > 0) {
    const people = await crewDb.from('profiles').select(NAME_COLUMNS).in('user_id', ids);
    if (people.error) namesUnavailable = true;
    for (const p of (people.data ?? []) as NameRow[]) {
      const name = displayName(p);
      if (p.user_id && name) names.set(p.user_id, name);
    }
  }
  return { byDocument: groupVersions(rows, names), namesUnavailable };
}

/** The person's document versions. Missing table (D-01): 'not_applied'. */
export function useDocumentVersions(
  profileId: string | null | undefined,
  options: { companyId: string | null | undefined; enabled?: boolean },
): DocumentVersionsState {
  const enabled = (options.enabled ?? true) && Boolean(profileId) && Boolean(options.companyId);
  const query = useQuery({
    queryKey: crewDocumentReviewKeys.versions(options.companyId, profileId),
    queryFn: () => fetchDocumentVersions(profileId as string),
    enabled,
    retry: noRetry,
    staleTime: 60_000,
  });
  if (!enabled) return { status: 'idle' };
  if (query.error instanceof ReviewNotApplied) return { status: 'not_applied' };
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', versions: query.data };
}

// ---------------------------------------------------------------- writes

/** The server's answer must be the document asked about, in the state asked for; otherwise the write is not a success. */
function checkAnswer(id: string, data: CrewDocumentStoredRow | null | undefined, ok: (row: CrewDocumentStoredRow) => boolean, failure: string): CrewDocumentStoredRow {
  if (!data || data.id !== id || !ok(data)) throw new CrewDocumentWriteError(failure, data);
  return data;
}

function rethrow(error: unknown, fn: string): never {
  if (notApplied(error, fn)) throw new CrewDocumentWriteError(REVIEW_UNAVAILABLE_NOTICE, error, true);
  throw error;
}

export interface VerifyCrewDocumentInput {
  id: string;
  decision: CrewDocumentDecision;
  /** Required for a conditional approval or a rejection (crewDocumentRefusal maps the server's note_required). */
  note: string | null;
}

/** Records a verification decision; the answer must carry the decision. */
export async function verifyCrewDocument(input: VerifyCrewDocumentInput): Promise<CrewDocumentStoredRow> {
  const note = input.note?.trim() ? input.note.trim() : null;
  const { data, error } = await crewDb.rpc(VERIFY_RPC, { p_id: input.id, p_decision: input.decision, p_note: note });
  if (error) rethrow(error, VERIFY_RPC);
  return checkAnswer(input.id, data, (row) => row.verification_status === input.decision, 'The decision was not recorded. Try again.');
}

/** Turns a document's alerts off with a reason; the answer must say they are off. */
export async function muteCrewDocument(input: { id: string; reason: string }): Promise<CrewDocumentStoredRow> {
  const { data, error } = await crewDb.rpc(MUTE_RPC, { p_id: input.id, p_reason: input.reason.trim() });
  if (error) rethrow(error, MUTE_RPC);
  return checkAnswer(input.id, data, (row) => row.alerts_muted === true, 'Alerts were not turned off. Try again.');
}

/** Turns a document's alerts back on; the answer must say they are on. */
export async function unmuteCrewDocument(id: string): Promise<CrewDocumentStoredRow> {
  const { data, error } = await crewDb.rpc(UNMUTE_RPC, { p_id: id });
  if (error) rethrow(error, UNMUTE_RPC);
  return checkAnswer(id, data, (row) => row.alerts_muted === false, 'Alerts were not turned back on. Try again.');
}

export interface RenewCrewDocumentInput {
  id: string;
  /** crew_document_save's keys (all of the new period's values), plus an optional 'reason' for the version. */
  payload: Record<string, Json>;
}

/** Renews a document: the old values become a version; the answer must be the same document, back to unverified. */
export async function renewCrewDocument(input: RenewCrewDocumentInput): Promise<CrewDocumentStoredRow> {
  const { data, error } = await crewDb.rpc(RENEW_RPC, { p_id: input.id, p_payload: input.payload });
  if (error) rethrow(error, RENEW_RPC);
  return checkAnswer(input.id, data, (row) => row.verification_status === 'unverified', 'The document was not renewed. Try again.');
}

/** The four writes, each refreshing the person's documents, rights and versions after a confirmed answer. */
export function useDocumentReviewActions(companyId: string | null | undefined, profileId: string | null | undefined) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: crewDocumentKeys.person(companyId, profileId) });
  const verify = useMutation({ mutationFn: verifyCrewDocument, onSuccess: refresh });
  const mute = useMutation({ mutationFn: muteCrewDocument, onSuccess: refresh });
  const unmute = useMutation({ mutationFn: unmuteCrewDocument, onSuccess: refresh });
  const renew = useMutation({ mutationFn: renewCrewDocument, onSuccess: refresh });
  return { verify, mute, unmute, renew };
}
