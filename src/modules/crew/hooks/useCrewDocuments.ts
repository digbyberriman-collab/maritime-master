/**
 * A person's crew documents (X1-04; gap/04 C24, C26, C29; X1-04B's
 * Documents / STCW / Qualifications tabs and /me/documents):
 *
 * - useCrewDocuments: crew_documents_for_profile, every document with the
 *   state the server computed (lib/documentState.ts mirrors the rule), its
 *   type, tab, verification and the caller's rights;
 * - useCrewDocumentRights: crew_document_rights (view, add, change, own,
 *   crew uploads on);
 * - saveCrewDocument / useSaveCrewDocument and deleteCrewDocument /
 *   useDeleteCrewDocument: the two writes, each checked against what the
 *   server returned (no fake success);
 * - useIssuingSuggestions: earlier issuing offices of a type (T-170).
 *
 * D-01. While 20261124060400 is not applied the RPCs are missing (PGRST202,
 * or 42883 naming the function, or a missing catalogue table): the
 * documents hook falls back to the person's legacy crew_certificates rows
 * (by login, explicit columns), read-only, with their state from
 * documentState.ts on the default windows (the stored legacy status is
 * ignored), and says so (catalogueMissing, CATALOGUE_MISSING_NOTICE); a
 * person without a login has no legacy rows. Rights answer 'unknown' (the UI
 * keeps Add off), suggestions are empty, saving refuses with
 * SAVE_UNAVAILABLE_NOTICE. Any other error is thrown (PageError with
 * Retry). Nothing is mocked.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import { isMissingTable } from '@/integrations/supabase/missingRelation';
import type { Json } from '@/integrations/supabase/types';
import { todayDateOnly } from '@/shared/lib/form';
import type {
  CrewDocumentFieldSchema,
  CrewDocumentItemType,
  CrewDocumentRpcRow,
  CrewDocumentSource,
  CrewDocumentTab,
  CrewDocumentVerificationStatus,
  CrewPendingFunctions,
  CrewPendingTables,
} from '../types/db.pending';
import { isMissingRpc } from '../lib/crewListModel';
import { deriveDocumentState, documentStateFromServer, type DocumentStateResult } from '../lib/documentState';
import { itemTypeForCategory, legacyCategoryFor, readFieldSchema, tabForCategory } from '../lib/documentTabs';
import { CATALOGUE_MISSING_NOTICE, SAVE_UNAVAILABLE_NOTICE } from '../lib/crewDocumentSchema';
import { crewDocumentKeys } from './useDocumentTypes';

const crewDb = pendingClient<CrewPendingTables, NoPending, CrewPendingFunctions>();

export const DOCUMENTS_RPC = 'crew_documents_for_profile';
export const RIGHTS_RPC = 'crew_document_rights';
export const SAVE_RPC = 'crew_document_save';
export const DELETE_RPC = 'crew_document_delete';
export const SUGGESTIONS_RPC = 'crew_document_issuing_suggestions';

/** The legacy columns the fallback reads (never select('*'): the row holds personal data). */
export const LEGACY_DOCUMENT_COLUMNS =
  'id, user_id, certificate_type, certificate_name, certificate_number, issuing_authority, issue_date, expiry_date, file_url, file_name, file_size, notes, created_at, updated_at';

/** One crew document as the tabs show it. */
export interface CrewDocumentView {
  id: string;
  profileId: string;
  userId: string | null;
  typeId: string | null;
  typeKey: string | null;
  /** The type's name; for an unclassified legacy row its own name. */
  name: string;
  code: string | null;
  abbreviation: string | null;
  stcwReference: string | null;
  categoryKey: string | null;
  categoryLabel: string | null;
  tab: CrewDocumentTab;
  itemType: CrewDocumentItemType;
  isIdentity: boolean;
  isMedicalFitness: boolean;
  fieldSchema: CrewDocumentFieldSchema;
  number: string | null;
  issuingCountryCode: string | null;
  /** The issuing office (a legacy row's issuing authority). */
  issuingOffice: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  noExpiry: boolean;
  endorsementDueDate: string | null;
  useInCrewReport: boolean;
  details: Json;
  notes: string | null;
  hasFile: boolean;
  filePath: string | null;
  /** A legacy upload's stored reference. */
  fileUrl: string | null;
  fileName: string | null;
  fileMime: string | null;
  fileSize: number | null;
  verificationStatus: CrewDocumentVerificationStatus;
  verifiedBy: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  verificationNote: string | null;
  alertsMuted: boolean;
  mutedAt: string | null;
  mutedReason: string | null;
  source: CrewDocumentSource;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  state: DocumentStateResult;
  canEdit: boolean;
  canDelete: boolean;
  /** A legacy row read while the catalogue is missing (read-only, no type). */
  legacy: boolean;
}

export type CrewDocumentsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: unknown; retry: () => void }
  | {
      status: 'ready';
      source: 'server' | 'fallback';
      /** The catalogue is not applied yet (D-01): the rows are legacy, read-only; Add is off. */
      catalogueMissing: boolean;
      readOnly: boolean;
      /** The sentence the tabs show while the catalogue is missing. */
      notice: string | null;
      documents: CrewDocumentView[];
    };

export interface CrewDocumentsResult {
  source: 'server' | 'fallback';
  documents: CrewDocumentView[];
}

/** Not live yet (D-01): the RPC, or the catalogue behind it, is missing. */
const notApplied = (error: unknown, fn: string) => isMissingRpc(error, fn) || isMissingTable(error);

export function documentFromServer(row: CrewDocumentRpcRow): CrewDocumentView {
  return {
    id: row.id,
    profileId: row.profile_id,
    userId: row.user_id,
    typeId: row.document_type_id,
    typeKey: row.type_key,
    name: row.type_name ?? row.legacy_name ?? row.legacy_type ?? 'Document',
    code: row.type_code,
    abbreviation: row.type_abbreviation,
    stcwReference: row.stcw_reference,
    categoryKey: row.category_key,
    categoryLabel: row.category_label,
    tab: row.tab,
    itemType: row.expiry_item_type,
    isIdentity: row.is_identity,
    isMedicalFitness: row.is_medical_fitness,
    fieldSchema: readFieldSchema(row.field_schema),
    number: row.number,
    issuingCountryCode: row.issuing_country_code,
    issuingOffice: row.issuing_office ?? row.issuing_authority,
    issueDate: row.issue_date,
    expiryDate: row.expiry_date,
    noExpiry: row.no_expiry,
    endorsementDueDate: row.endorsement_due_date,
    useInCrewReport: row.use_in_crew_report,
    details: row.details,
    notes: row.notes,
    hasFile: row.has_file,
    filePath: row.file_path,
    fileUrl: row.file_url,
    fileName: row.file_name,
    fileMime: row.file_mime,
    fileSize: row.file_size,
    verificationStatus: row.verification_status,
    verifiedBy: row.verified_by,
    verifiedByName: row.verified_by_name,
    verifiedAt: row.verified_at,
    verificationNote: row.verification_note,
    alertsMuted: row.alerts_muted,
    mutedAt: row.muted_at,
    mutedReason: row.muted_reason,
    source: row.source,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    state: documentStateFromServer(row),
    canEdit: row.can_edit,
    canDelete: row.can_delete,
    legacy: false,
  };
}

/** A legacy crew_certificates row (the D-01 fallback), with the columns LEGACY_DOCUMENT_COLUMNS reads. */
export interface LegacyDocumentRow {
  id: string;
  user_id: string;
  certificate_type: string;
  certificate_name: string;
  certificate_number: string | null;
  issuing_authority: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A legacy row in the tabs' shape: the tab and the window from its legacy
 * string (passports 270 days, the rest 90), the state from documentState.ts
 * (a missing date reads missing_date: the legacy rows have no "No expiry"
 * tick), the stored status ignored, nothing editable.
 */
export function documentFromLegacy(row: LegacyDocumentRow, profileId: string, today: string): CrewDocumentView {
  const categoryKey = legacyCategoryFor(row.certificate_type, row.certificate_name);
  const itemType = itemTypeForCategory(categoryKey);
  const hasFile = Boolean(row.file_url && row.file_url.trim() !== '');
  return {
    id: row.id,
    profileId,
    userId: row.user_id,
    typeId: null,
    typeKey: null,
    name: row.certificate_name || row.certificate_type || 'Document',
    code: null,
    abbreviation: null,
    stcwReference: null,
    categoryKey,
    categoryLabel: null,
    tab: tabForCategory(categoryKey),
    itemType,
    isIdentity: itemType === 'passport',
    isMedicalFitness: false,
    fieldSchema: {},
    number: row.certificate_number,
    issuingCountryCode: null,
    issuingOffice: row.issuing_authority,
    issueDate: row.issue_date,
    expiryDate: row.expiry_date,
    noExpiry: false,
    endorsementDueDate: null,
    useInCrewReport: false,
    details: {},
    notes: row.notes,
    hasFile,
    filePath: null,
    fileUrl: row.file_url,
    fileName: row.file_name,
    fileMime: null,
    fileSize: row.file_size,
    verificationStatus: 'unverified',
    verifiedBy: null,
    verifiedByName: null,
    verifiedAt: null,
    verificationNote: null,
    alertsMuted: false,
    mutedAt: null,
    mutedReason: null,
    source: 'manual',
    createdBy: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    state: deriveDocumentState({ hasFile, expiryDate: row.expiry_date, noExpiry: false, itemType, today }),
    canEdit: false,
    canDelete: false,
    legacy: true,
  };
}

/**
 * The person's documents: the RPC, else (D-01) their legacy rows by login.
 * `userId` is the person's login (null for a person without one); `today`
 * for the fallback's state (local date-only).
 */
export async function fetchCrewDocuments(profileId: string, userId: string | null, today: string = todayDateOnly()): Promise<CrewDocumentsResult> {
  const { data, error } = await crewDb.rpc(DOCUMENTS_RPC, { p_profile_id: profileId });
  if (!error) return { source: 'server', documents: (data ?? []).map(documentFromServer) };
  if (!notApplied(error, DOCUMENTS_RPC)) throw error;
  if (!userId) return { source: 'fallback', documents: [] };
  const { data: rows, error: legacyError } = await supabase
    .from('crew_certificates')
    .select(LEGACY_DOCUMENT_COLUMNS)
    .eq('user_id', userId)
    .order('expiry_date', { ascending: true, nullsFirst: false });
  if (legacyError) throw legacyError;
  return { source: 'fallback', documents: (rows ?? []).map((r) => documentFromLegacy(r, profileId, today)) };
}

const retryOnce = (fn: string) => (failureCount: number, error: unknown) => {
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
  return !notApplied(error, fn) && code !== '42501' && code !== 'P0002' && failureCount < 1;
};

export interface CrewDocumentsOptions {
  /** The person's company (the cache key). */
  companyId: string | null | undefined;
  /** The person's login, for the D-01 fallback (null: a person without a login). */
  userId?: string | null;
  /** False while a gate is loading or denied: nothing is sent. */
  enabled?: boolean;
}

/** A person's documents. 42501 / P0002 come back as an error state (the page shows AccessDenied / not found). */
export function useCrewDocuments(profileId: string | null | undefined, options: CrewDocumentsOptions): CrewDocumentsState {
  const enabled = (options.enabled ?? true) && Boolean(profileId) && Boolean(options.companyId);
  const userId = options.userId ?? null;
  const query = useQuery({
    queryKey: [...crewDocumentKeys.person(options.companyId, profileId), 'list', userId ?? 'no-login'] as const,
    queryFn: () => fetchCrewDocuments(profileId as string, userId),
    enabled,
    retry: retryOnce(DOCUMENTS_RPC),
    staleTime: 60_000,
  });
  if (!enabled) return { status: 'idle' };
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  if (!query.data) return { status: 'loading' };
  const fallback = query.data.source === 'fallback';
  return {
    status: 'ready',
    source: query.data.source,
    catalogueMissing: fallback,
    readOnly: fallback,
    notice: fallback ? CATALOGUE_MISSING_NOTICE : null,
    documents: query.data.documents,
  };
}

// ---------------------------------------------------------------- rights

export interface CrewDocumentRights {
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
  isOwn: boolean;
  uploadsEnabled: boolean;
}

export type CrewDocumentRightsState =
  | { status: 'idle' }
  | { status: 'loading' }
  /** The RPC is not applied (D-01): the UI keeps Add off. */
  | { status: 'unknown' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; rights: CrewDocumentRights };

class RightsNotApplied extends Error {}

export async function fetchCrewDocumentRights(profileId: string): Promise<CrewDocumentRights> {
  const { data, error } = await crewDb.rpc(RIGHTS_RPC, { p_profile_id: profileId });
  if (error) {
    if (notApplied(error, RIGHTS_RPC)) throw new RightsNotApplied();
    throw error;
  }
  const row = (data ?? [])[0];
  return {
    canView: Boolean(row?.can_view),
    canAdd: Boolean(row?.can_add),
    canEdit: Boolean(row?.can_edit),
    isOwn: Boolean(row?.is_own),
    uploadsEnabled: Boolean(row?.uploads_enabled),
  };
}

export function useCrewDocumentRights(profileId: string | null | undefined, options: { companyId: string | null | undefined; enabled?: boolean }): CrewDocumentRightsState {
  const enabled = (options.enabled ?? true) && Boolean(profileId) && Boolean(options.companyId);
  const query = useQuery({
    queryKey: crewDocumentKeys.rights(options.companyId, profileId),
    queryFn: () => fetchCrewDocumentRights(profileId as string),
    enabled,
    retry: (failureCount, error) => !(error instanceof RightsNotApplied) && failureCount < 1,
    staleTime: 5 * 60_000,
  });
  if (!enabled) return { status: 'idle' };
  if (query.error instanceof RightsNotApplied) return { status: 'unknown' };
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', rights: query.data };
}

// ---------------------------------------------------------------- writes

/** A write the server did not do: not applied yet, refused, or nothing came back. */
export class CrewDocumentWriteError extends Error {
  /** What the server answered (the error, or the unexpected data). */
  readonly answer: unknown;
  /** The RPC is not applied yet (D-01). */
  readonly notApplied: boolean;
  constructor(message: string, answer: unknown, notApplied = false) {
    super(message);
    this.name = 'CrewDocumentWriteError';
    this.answer = answer;
    this.notApplied = notApplied;
  }
}

export interface SaveCrewDocumentInput {
  /** Null to add a document. */
  id: string | null;
  profileId: string;
  /** Required to add; on a change null keeps the document's type. */
  documentTypeId: string | null;
  payload: Record<string, Json>;
}

/**
 * Saves a document through crew_document_save and returns the stored id.
 * The server must answer with the row (and, on a change, the same id);
 * anything else is an error, never a quiet success. A refusal is thrown as
 * the server sent it (crewDocumentRefusal reads it).
 */
export async function saveCrewDocument(input: SaveCrewDocumentInput): Promise<string> {
  const { data, error } = await crewDb.rpc(SAVE_RPC, {
    p_id: input.id,
    p_profile_id: input.profileId,
    p_document_type_id: input.documentTypeId,
    p_payload: input.payload,
  });
  if (error) {
    if (notApplied(error, SAVE_RPC)) throw new CrewDocumentWriteError(SAVE_UNAVAILABLE_NOTICE, error, true);
    throw error;
  }
  const id = data?.id ?? null;
  if (!id || (input.id && id !== input.id)) throw new CrewDocumentWriteError('The document was not saved. Try again.', data);
  return id;
}

/** Removes a document (soft) and returns its id; the same checks as saveCrewDocument. */
export async function deleteCrewDocument(id: string, reason: string | null): Promise<string> {
  const { data, error } = await crewDb.rpc(DELETE_RPC, { p_id: id, p_reason: reason });
  if (error) {
    if (notApplied(error, DELETE_RPC)) throw new CrewDocumentWriteError(SAVE_UNAVAILABLE_NOTICE, error, true);
    throw error;
  }
  if (data !== id) throw new CrewDocumentWriteError('The document was not removed. Try again.', data);
  return id;
}

/** Save mutation: refreshes the person's documents and rights after a confirmed write. */
export function useSaveCrewDocument(companyId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveCrewDocument,
    onSuccess: (_id, input) => queryClient.invalidateQueries({ queryKey: crewDocumentKeys.person(companyId, input.profileId) }),
  });
}

/** Remove mutation. */
export function useDeleteCrewDocument(companyId: string | null | undefined, profileId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string | null }) => deleteCrewDocument(id, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: crewDocumentKeys.person(companyId, profileId) }),
  });
}

// ---------------------------------------------------------------- issuing suggestions

export interface IssuingSuggestion {
  office: string;
  uses: number;
}

/** Earlier issuing offices of a type; none while the RPC is not applied. */
export async function fetchIssuingSuggestions(documentTypeId: string): Promise<IssuingSuggestion[]> {
  const { data, error } = await crewDb.rpc(SUGGESTIONS_RPC, { p_document_type_id: documentTypeId });
  if (error) {
    if (notApplied(error, SUGGESTIONS_RPC)) return [];
    throw error;
  }
  return (data ?? []).map((r) => ({ office: r.issuing_office, uses: r.uses }));
}

/** Suggestions for the issuing office field (T-170). Errors leave the field without suggestions (it stays free text). */
export function useIssuingSuggestions(documentTypeId: string | null | undefined, options: { companyId: string | null | undefined; enabled?: boolean }) {
  const enabled = (options.enabled ?? true) && Boolean(documentTypeId) && Boolean(options.companyId);
  const query = useQuery({
    queryKey: crewDocumentKeys.suggestions(options.companyId, documentTypeId),
    queryFn: () => fetchIssuingSuggestions(documentTypeId as string),
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });
  return { suggestions: query.data ?? [], loading: enabled && query.isLoading, error: query.error ?? null };
}
