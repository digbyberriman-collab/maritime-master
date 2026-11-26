/**
 * Fleet document acknowledgements in the browser (gap/02 FD9, W1; X5 spec
 * X5-05A; `20261124040400_fleet_documents_acknowledgements.sql`):
 *
 * - useVesselFleetDocuments: the documents published to one vessel with
 *   the caller's own state there (`fleet_document_vessel_documents`, one
 *   read for the whole page);
 * - useMyPendingFleetDocuments: the caller's own pending and overdue
 *   acknowledgements on one vessel, or on every vessel whose crew they are
 *   on (`fleet_document_my_pending`; the "To acknowledge" cards);
 * - useAcknowledgeFleetDocument: the one-tap acknowledgement
 *   (`fleet_document_acknowledge`), its row checked before any success;
 * - openFleetDocumentFile: a short-lived signed URL of the records bucket
 *   for the published file (crew of a targeted vessel read it through the
 *   storage read hook, PR-07).
 *
 * X5-05B (gap/02 FD6, FD7, FD8; the readers' side):
 *
 * - useFleetDocumentSummary: counts per document x vessel
 *   (`fleet_document_summary`; the library's Acknowledged column and the
 *   Acknowledgements tab), over the caller's readership;
 * - useFleetDocumentAckStatus: the person rows of one document, or of one
 *   vessel's every document (`fleet_document_ack_status`), over the
 *   caller's readership; rows for anything not asked are dropped;
 * - useVesselSignerRules: who can sign on one vessel (the
 *   `fleet_document_signer_rules` rows the caller may read);
 * - useRecentFleetDocumentReminders: the reminders of one document in the
 *   last 24 hours the caller may read (a hint before a reminder: the
 *   server's own count of who was skipped is the answer);
 * - remind / witness / signer-rule mutations
 *   (`fleet_document_remind`, `fleet_document_acknowledge_witnessed`,
 *   `fleet_document_set_signer_rule`): each answer is checked before any
 *   success (the reminder's jsonb shape, the witnessed row's version,
 *   vessel, person and method, the rule's vessel, type and rule); a
 *   refusal is a sentence (lib/ackAdmin.ts); the acknowledgement keys are
 *   invalidated whatever happened. No copy here says an email was sent
 *   (D-249): reminders are in-app.
 *
 * D-01: a missing RPC is `not_set_up` ("Acknowledgements are not set up
 * yet"), cached and not retried; 42501 vessel_out_of_reach is its own
 * sentence and not retried; any other error is an error with Retry. A row
 * whose state the client does not know is an error, never a guess; nothing
 * is ever replaced by sample rows. Every key carries the company id under
 * the library's prefix, so a library change and an acknowledgement refresh
 * the same caches.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCan } from '@/lib/permissions/useCan';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { fleetReachFor } from '@/app/router/useMembershipReach';
import { LEGACY_REACH } from '@/app/router/ownMembership';
import { isMissingRelationError as isMissingRelation, notify } from '@/shared/lib/notify';
import { RECORD_FILES_BUCKET } from '@/lib/records/services/attachments';
import { fleetDocumentsDb } from '../lib/fleetDocumentsDb';
import { ackRefusal, isAckBlockedReason, isAckMethod, isAckState } from '../lib/ackState';
import {
  SIGNER_RULES,
  crewCapacity,
  parseRemindOutcome,
  remindOutcomeMessage,
  remindRefusal,
  signerRuleRefusal,
  witnessRefusal,
  type CrewCapacity,
  type RemindOutcome,
  type RemindTarget,
} from '../lib/ackAdmin';
import { DOCUMENTS_CAPS } from '../paths';
import type { SignerRuleArgs } from '../lib/acknowledgementSchema';
import type {
  FleetDocumentAckStatusRow,
  FleetDocumentAcknowledgementRow,
  FleetDocumentMyPendingRow,
  FleetDocumentReminderRow,
  FleetDocumentSignerRuleRow,
  FleetDocumentSummaryRow,
  FleetDocumentVesselDocumentRow,
} from '../types/db.pending';
import { fleetDocumentKeys } from './keys';

const NONE = 'none';

/** Vessel ids in a key: sorted, so the same set is the same cache entry; null = every vessel the rows cover. */
const vesselKey = (vesselIds: readonly string[] | null | undefined) => (vesselIds ? [...vesselIds].sort().join(',') : 'all');

/** The acknowledgement keys, under the library's company prefix. */
export const fleetDocumentAckKeys = {
  all: (companyId: string | null | undefined) => [...fleetDocumentKeys.company(companyId), 'acks'] as const,
  /** One vessel's documents with the caller's own state. */
  vessel: (companyId: string | null | undefined, vesselId: string | null | undefined) =>
    [...fleetDocumentKeys.company(companyId), 'acks', 'vessel', vesselId ?? NONE] as const,
  /** The caller's own outstanding list, on one vessel or every vessel (`all`). */
  mine: (companyId: string | null | undefined, userId: string | null | undefined, vesselId: string | null | undefined) =>
    [...fleetDocumentKeys.company(companyId), 'acks', 'mine', userId ?? NONE, vesselId ?? 'all'] as const,
  /** Counts per document x vessel over the vessels given (null: all the rows cover). */
  summary: (companyId: string | null | undefined, vesselIds: readonly string[] | null | undefined) =>
    [...fleetDocumentKeys.company(companyId), 'acks', 'summary', vesselKey(vesselIds)] as const,
  /** Person rows of a document (null: every document) on the vessels given (null: all). */
  status: (companyId: string | null | undefined, documentId: string | null | undefined, vesselIds: readonly string[] | null | undefined) =>
    [...fleetDocumentKeys.company(companyId), 'acks', 'status', documentId ?? 'all', vesselKey(vesselIds)] as const,
  /** Who can sign on one vessel. */
  signerRules: (companyId: string | null | undefined, vesselId: string | null | undefined) =>
    [...fleetDocumentKeys.company(companyId), 'acks', 'signer-rules', vesselId ?? NONE] as const,
  /** A document's reminders of the last 24 hours. */
  reminders: (companyId: string | null | undefined, documentId: string | null | undefined) =>
    [...fleetDocumentKeys.company(companyId), 'acks', 'reminders', documentId ?? NONE] as const,
};

export const ACKS_NOT_SET_UP = 'Acknowledgements are not set up yet';
const OUT_OF_REACH = 'You no longer have access to this vessel.';

/** A read error with the sentence the page shows. */
export class FleetDocumentAckError extends Error {
  constructor(
    readonly reason: 'vessel_out_of_reach' | 'not_permitted' | 'unreadable',
    message: string,
  ) {
    super(message);
    this.name = 'FleetDocumentAckError';
  }
}

type PgError = { code?: string; message?: string; details?: string | null } | null | undefined;

function readError(error: PgError): Error | unknown {
  if (error?.code === '42501' && error.message === 'vessel_out_of_reach') return new FleetDocumentAckError('vessel_out_of_reach', OUT_OF_REACH);
  if (error?.code === '42501' && error.message === 'not_permitted') {
    return new FleetDocumentAckError('not_permitted', 'Your account cannot read fleet documents right now. Ask your account admin.');
  }
  return error;
}

const noRetry = (failureCount: number, error: unknown) => !(error instanceof FleetDocumentAckError) && failureCount < 1;

export type AckReadState<T> =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'not_set_up' }
  | { state: 'error'; error: unknown; retry: () => void }
  | { state: 'ready'; data: T; updatedAt: number; refreshing: boolean };

type Answer<T> = { kind: 'not_set_up' } | { kind: 'ok'; data: T };

function toState<T>(
  enabled: boolean,
  query: { isPending: boolean; isError: boolean; error: unknown; data: Answer<T> | undefined; dataUpdatedAt: number; isFetching: boolean; refetch: () => unknown },
): AckReadState<T> {
  if (!enabled) return { state: 'idle' };
  if (query.isPending) return { state: 'loading' };
  if (query.isError) return { state: 'error', error: query.error, retry: () => void query.refetch() };
  if (!query.data || query.data.kind === 'not_set_up') return { state: 'not_set_up' };
  return { state: 'ready', data: query.data.data, updatedAt: query.dataUpdatedAt, refreshing: query.isFetching };
}

// ─── The vessel's documents ─────────────────────────────────────────────

/** A row with every state field the client knows, else the read is unreadable (never a guess). */
function checkVesselRow(row: FleetDocumentVesselDocumentRow): FleetDocumentVesselDocumentRow {
  const known =
    typeof row.document_id === 'string' &&
    typeof row.version_id === 'string' &&
    typeof row.title === 'string' &&
    (row.state === null || isAckState(row.state)) &&
    (row.blocked_reason === null || isAckBlockedReason(row.blocked_reason)) &&
    (row.method === null || isAckMethod(row.method));
  if (!known) throw new FleetDocumentAckError('unreadable', 'The fleet documents came back in a form this page does not know. Refresh to try again.');
  return row;
}

export async function fetchVesselFleetDocuments(vesselId: string): Promise<Answer<FleetDocumentVesselDocumentRow[]>> {
  const { data, error } = await fleetDocumentsDb.rpc('fleet_document_vessel_documents', { p_vessel_id: vesselId });
  if (error) {
    if (isMissingRelation(error)) return { kind: 'not_set_up' };
    throw readError(error);
  }
  return { kind: 'ok', data: (data ?? []).map(checkVesselRow) };
}

export function useVesselFleetDocuments(
  companyId: string | null | undefined,
  vesselId: string | null | undefined,
  options: { enabled?: boolean } = {},
): AckReadState<FleetDocumentVesselDocumentRow[]> {
  const enabled = (options.enabled ?? true) && Boolean(companyId) && Boolean(vesselId);
  const query = useQuery({
    queryKey: fleetDocumentAckKeys.vessel(companyId, vesselId),
    queryFn: () => fetchVesselFleetDocuments(vesselId as string),
    enabled,
    staleTime: 30_000,
    retry: noRetry,
  });
  return toState(enabled, query);
}

// ─── The caller's own outstanding list ──────────────────────────────────

function checkPendingRow(row: FleetDocumentMyPendingRow): FleetDocumentMyPendingRow {
  if (typeof row.document_id !== 'string' || typeof row.vessel_id !== 'string' || (row.state !== 'pending' && row.state !== 'overdue')) {
    throw new FleetDocumentAckError('unreadable', 'Your documents to acknowledge came back in a form this page does not know. Refresh to try again.');
  }
  return row;
}

export async function fetchMyPendingFleetDocuments(vesselId: string | null): Promise<Answer<FleetDocumentMyPendingRow[]>> {
  const { data, error } = await fleetDocumentsDb.rpc('fleet_document_my_pending', { p_vessel_id: vesselId });
  if (error) {
    if (isMissingRelation(error)) return { kind: 'not_set_up' };
    throw readError(error);
  }
  return { kind: 'ok', data: (data ?? []).map(checkPendingRow) };
}

export function useMyPendingFleetDocuments(
  companyId: string | null | undefined,
  userId: string | null | undefined,
  vesselId: string | null,
  options: { enabled?: boolean } = {},
): AckReadState<FleetDocumentMyPendingRow[]> {
  const enabled = (options.enabled ?? true) && Boolean(companyId) && Boolean(userId);
  const query = useQuery({
    queryKey: fleetDocumentAckKeys.mine(companyId, userId, vesselId),
    queryFn: () => fetchMyPendingFleetDocuments(vesselId),
    enabled,
    staleTime: 60_000,
    retry: noRetry,
  });
  return toState(enabled, query);
}

// ─── Acknowledge ────────────────────────────────────────────────────────

/** A refusal (or a failed check) with the sentence to show; `settled` refusals mean the screen was only stale. */
export class FleetDocumentAckRefusalError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FleetDocumentAckRefusalError';
  }

  /** The person's state is already what they wanted (acknowledged, or nothing to do): say so, not an error. */
  get settled(): boolean {
    return this.code === 'already_acknowledged' || this.code === 'not_required';
  }
}

const NOT_RECORDED = 'Your acknowledgement was not recorded. Refresh the page and try again.';

export interface AcknowledgeInput {
  versionId: string;
  vesselId: string;
  /** For the toast. */
  title: string;
  versionLabel: string;
}

/** Calls the definer and checks the row it returns: this version, this vessel, signed by the caller. */
export async function acknowledgeFleetDocument(input: AcknowledgeInput, userId: string): Promise<FleetDocumentAcknowledgementRow> {
  if (!input.versionId || !input.vesselId) throw new FleetDocumentAckRefusalError('not_recorded', NOT_RECORDED);
  const { data, error } = await fleetDocumentsDb.rpc('fleet_document_acknowledge', { p_version_id: input.versionId, p_vessel_id: input.vesselId });
  if (error) {
    if (isMissingRelation(error)) throw new FleetDocumentAckRefusalError('not_set_up', `${ACKS_NOT_SET_UP}, so nothing was recorded.`);
    const sentence = ackRefusal(error.message, (error as PgError)?.details ?? null);
    if (sentence) throw new FleetDocumentAckRefusalError(error.message, sentence);
    throw error;
  }
  const row = data as FleetDocumentAcknowledgementRow | null;
  if (!row || row.version_id !== input.versionId || row.vessel_id !== input.vesselId || row.method !== 'self' || row.user_id !== userId) {
    throw new FleetDocumentAckRefusalError('not_recorded', NOT_RECORDED);
  }
  return row;
}

export function useAcknowledgeFleetDocument(companyId: string | null | undefined, userId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AcknowledgeInput) => {
      if (!userId) throw new FleetDocumentAckRefusalError('not_recorded', NOT_RECORDED);
      return acknowledgeFleetDocument(input, userId);
    },
    onSuccess: (_row, input) => {
      notify.success('Acknowledged', { description: `${input.title}, version ${input.versionLabel}.` });
    },
    onError: (error) => {
      if (error instanceof FleetDocumentAckRefusalError && error.settled) notify.info(error.message);
      else if (error instanceof FleetDocumentAckRefusalError) notify.error(new Error(error.message), { title: 'Not acknowledged' });
      else notify.error(error, { title: 'Not acknowledged' });
    },
    onSettled: () => {
      // A refusal can mean the screen was stale: refresh the acknowledgement reads either way.
      void queryClient.invalidateQueries({ queryKey: fleetDocumentAckKeys.all(companyId) });
    },
  });
}

// ─── Open the file ──────────────────────────────────────────────────────

/** Five minutes: long enough to open, short enough not to share. */
export const FLEET_DOCUMENT_URL_TTL_SECONDS = 300;

/** A signed URL of the published file in the private records bucket (D-X5-17). */
export async function fleetDocumentFileUrl(storagePath: string): Promise<string> {
  const { data, error } = await fleetDocumentsDb.storage.from(RECORD_FILES_BUCKET).createSignedUrl(storagePath, FLEET_DOCUMENT_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw error ?? new Error('The document could not be opened.');
  return data.signedUrl;
}

/**
 * Opens the file in a new tab. The tab is opened at once, inside the tap,
 * so a browser does not block it, then pointed at the signed URL; on a
 * failure it is closed again and the caller gets the error.
 */
export async function openFleetDocumentFile(storagePath: string, win: Pick<Window, 'open'> = window): Promise<void> {
  const tab = win.open('', '_blank');
  try {
    const url = await fleetDocumentFileUrl(storagePath);
    if (tab) {
      tab.opener = null;
      tab.location.replace(url);
    } else {
      win.open(url, '_blank', 'noopener,noreferrer');
    }
  } catch (error) {
    tab?.close();
    throw error;
  }
}

// ─── Readers: counts and person rows (X5-05B) ───────────────────────────

const UNREADABLE = 'The acknowledgements came back in a form this page does not know. Refresh to try again.';

function checkSummaryRow(row: FleetDocumentSummaryRow): FleetDocumentSummaryRow {
  const counts = [row.acknowledged, row.pending, row.overdue, row.blocked, row.can_sign];
  const known =
    typeof row.document_id === 'string' &&
    typeof row.version_id === 'string' &&
    typeof row.vessel_id === 'string' &&
    counts.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0);
  if (!known) throw new FleetDocumentAckError('unreadable', UNREADABLE);
  return row;
}

export async function fetchFleetDocumentSummary(vesselIds: readonly string[] | null): Promise<Answer<FleetDocumentSummaryRow[]>> {
  const { data, error } = await fleetDocumentsDb.rpc('fleet_document_summary', { p_vessel_ids: vesselIds ? [...vesselIds] : null });
  if (error) {
    if (isMissingRelation(error)) return { kind: 'not_set_up' };
    throw readError(error);
  }
  const wanted = vesselIds ? new Set(vesselIds) : null;
  return { kind: 'ok', data: (data ?? []).map(checkSummaryRow).filter((r) => !wanted || wanted.has(r.vessel_id)) };
}

/** Counts per document x vessel over the vessels given (null: every vessel the caller's rows cover). */
export function useFleetDocumentSummary(
  companyId: string | null | undefined,
  vesselIds: readonly string[] | null,
  options: { enabled?: boolean } = {},
): AckReadState<FleetDocumentSummaryRow[]> {
  const enabled = (options.enabled ?? true) && Boolean(companyId);
  const query = useQuery({
    queryKey: fleetDocumentAckKeys.summary(companyId, vesselIds),
    queryFn: () => fetchFleetDocumentSummary(vesselIds),
    enabled,
    staleTime: 30_000,
    retry: noRetry,
  });
  return toState(enabled, query);
}

function checkStatusRow(row: FleetDocumentAckStatusRow): FleetDocumentAckStatusRow {
  const known =
    typeof row.document_id === 'string' &&
    typeof row.version_id === 'string' &&
    typeof row.vessel_id === 'string' &&
    typeof row.profile_id === 'string' &&
    typeof row.has_login === 'boolean' &&
    typeof row.on_crew === 'boolean' &&
    isAckState(row.state) &&
    (row.blocked_reason === null || isAckBlockedReason(row.blocked_reason)) &&
    (row.method === null || isAckMethod(row.method));
  if (!known) throw new FleetDocumentAckError('unreadable', UNREADABLE);
  return row;
}

export interface AckStatusScope {
  /** One document, or null for every document. */
  documentId: string | null;
  /** The vessels, or null for every vessel the rows cover. */
  vesselIds: readonly string[] | null;
}

export async function fetchFleetDocumentAckStatus(scope: AckStatusScope): Promise<Answer<FleetDocumentAckStatusRow[]>> {
  const { data, error } = await fleetDocumentsDb.rpc('fleet_document_ack_status', {
    p_document_id: scope.documentId,
    p_vessel_ids: scope.vesselIds ? [...scope.vesselIds] : null,
  });
  if (error) {
    if (isMissingRelation(error)) return { kind: 'not_set_up' };
    if (error.code === 'P0002' && error.message === 'document_not_found') {
      throw new FleetDocumentAckError('unreadable', 'This document is no longer in the library. Refresh to see the current documents.');
    }
    throw readError(error);
  }
  const vessels = scope.vesselIds ? new Set(scope.vesselIds) : null;
  return {
    kind: 'ok',
    data: (data ?? [])
      .map(checkStatusRow)
      .filter((r) => (!scope.documentId || r.document_id === scope.documentId) && (!vessels || vessels.has(r.vessel_id))),
  };
}

/** The person rows of a document or a vessel, over the caller's readership (the server filters; history rows included). */
export function useFleetDocumentAckStatus(
  companyId: string | null | undefined,
  scope: AckStatusScope,
  options: { enabled?: boolean } = {},
): AckReadState<FleetDocumentAckStatusRow[]> {
  const enabled = (options.enabled ?? true) && Boolean(companyId) && (scope.vesselIds === null || scope.vesselIds.length > 0);
  const query = useQuery({
    queryKey: fleetDocumentAckKeys.status(companyId, scope.documentId, scope.vesselIds),
    queryFn: () => fetchFleetDocumentAckStatus(scope),
    enabled,
    staleTime: 30_000,
    retry: noRetry,
  });
  return toState(enabled, query);
}

// ─── Who can sign: the vessel's rules ───────────────────────────────────

export type VesselSignerRule = Pick<FleetDocumentSignerRuleRow, 'id' | 'vessel_id' | 'type_id' | 'rule' | 'positions' | 'profile_ids' | 'updated_at'>;

const SIGNER_RULE_COLUMNS = 'id, vessel_id, type_id, rule, positions, profile_ids, updated_at';

function checkRule(row: VesselSignerRule): VesselSignerRule {
  const known =
    typeof row.id === 'string' &&
    (SIGNER_RULES as readonly string[]).includes(row.rule) &&
    Array.isArray(row.positions) &&
    Array.isArray(row.profile_ids);
  if (!known) throw new FleetDocumentAckError('unreadable', 'Who can sign came back in a form this page does not know. Refresh to try again.');
  return row;
}

export async function fetchVesselSignerRules(vesselId: string): Promise<Answer<VesselSignerRule[]>> {
  const { data, error } = await fleetDocumentsDb.from('fleet_document_signer_rules').select(SIGNER_RULE_COLUMNS).eq('vessel_id', vesselId);
  if (error) {
    if (isMissingRelation(error)) return { kind: 'not_set_up' };
    throw readError(error);
  }
  return { kind: 'ok', data: ((data ?? []) as VesselSignerRule[]).map(checkRule).filter((r) => r.vessel_id === vesselId) };
}

export function useVesselSignerRules(
  companyId: string | null | undefined,
  vesselId: string | null | undefined,
  options: { enabled?: boolean } = {},
): AckReadState<VesselSignerRule[]> {
  const enabled = (options.enabled ?? true) && Boolean(companyId) && Boolean(vesselId);
  const query = useQuery({
    queryKey: fleetDocumentAckKeys.signerRules(companyId, vesselId),
    queryFn: () => fetchVesselSignerRules(vesselId as string),
    enabled,
    staleTime: 60_000,
    retry: noRetry,
  });
  return toState(enabled, query);
}

// ─── Recent reminders (the 24-hour rule, before sending) ────────────────

export type RecentReminder = Pick<FleetDocumentReminderRow, 'id' | 'document_id' | 'vessel_id' | 'kind' | 'sent_at' | 'recipient_profile_ids'>;

/** The 24 hours the rate limit looks back over. */
export const REMIND_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function fetchRecentFleetDocumentReminders(documentId: string, now: Date = new Date()): Promise<Answer<RecentReminder[]>> {
  const since = new Date(now.getTime() - REMIND_WINDOW_MS).toISOString();
  const { data, error } = await fleetDocumentsDb
    .from('fleet_document_reminders')
    .select('id, document_id, vessel_id, kind, sent_at, recipient_profile_ids')
    .eq('document_id', documentId)
    .gte('sent_at', since)
    .order('sent_at', { ascending: false })
    .limit(200);
  if (error) {
    if (isMissingRelation(error)) return { kind: 'not_set_up' };
    throw readError(error);
  }
  const rows = ((data ?? []) as RecentReminder[]).filter(
    (r) => r.document_id === documentId && Array.isArray(r.recipient_profile_ids) && Date.parse(r.sent_at) >= Date.parse(since),
  );
  return { kind: 'ok', data: rows };
}

/** The reminders of one document in the last 24 hours that the caller may read (the log's RLS). */
export function useRecentFleetDocumentReminders(
  companyId: string | null | undefined,
  documentId: string | null | undefined,
  options: { enabled?: boolean } = {},
): AckReadState<RecentReminder[]> {
  const enabled = (options.enabled ?? true) && Boolean(companyId) && Boolean(documentId);
  const query = useQuery({
    queryKey: fleetDocumentAckKeys.reminders(companyId, documentId),
    queryFn: () => fetchRecentFleetDocumentReminders(documentId as string),
    enabled,
    staleTime: 15_000,
    retry: noRetry,
  });
  return toState(enabled, query);
}

/** The profiles reminded about the document in the last 24 hours, in the reminders the caller can read. */
export function recentlyReminded(reminders: readonly RecentReminder[]): Set<string> {
  return new Set(reminders.flatMap((r) => r.recipient_profile_ids));
}

// ─── Writes: remind, witness, who can sign (X5-05B) ─────────────────────

const NOT_CONFIRMED_REMINDER = 'STORM could not confirm the reminder. Check the list before sending it again.';
const NOT_RECORDED_WITNESS = 'The witnessed acknowledgement was not recorded. Refresh the list and try again.';
const NOT_SAVED_RULE = 'Who can sign was not saved. Refresh and try again.';

type RpcError = { code?: string; message: string; details?: string | null };

/** A definer's error as a refusal with a sentence, or the error itself when it is not one we know. */
function refusalFrom(error: RpcError, sentence: (code: string, detail: string | null) => string | null, notSetUp: string): unknown {
  if (isMissingRelation(error)) return new FleetDocumentAckRefusalError('not_set_up', notSetUp);
  const text = sentence(error.message, error.details ?? null);
  return text ? new FleetDocumentAckRefusalError(error.message, text) : error;
}

/** Reminds the outstanding people of a published document (in-app); the answer is checked. */
export async function remindFleetDocument(target: RemindTarget): Promise<RemindOutcome> {
  if (!target.documentId || (target.scope !== 'all' && !target.vesselId) || (target.scope === 'person' && !target.profileId)) {
    throw new FleetDocumentAckRefusalError('not_recorded', 'Choose who to remind.');
  }
  const { data, error } = await fleetDocumentsDb.rpc('fleet_document_remind', {
    p_document_id: target.documentId,
    p_vessel_id: target.scope === 'all' ? null : target.vesselId,
    p_profile_id: target.scope === 'person' ? target.profileId : null,
  });
  if (error) throw refusalFrom(error, (code) => remindRefusal(code), `${ACKS_NOT_SET_UP}, so nobody was reminded.`);
  const outcome = parseRemindOutcome(data);
  if (!outcome) throw new FleetDocumentAckRefusalError('not_confirmed', NOT_CONFIRMED_REMINDER);
  return outcome;
}

export function useRemindFleetDocument(companyId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (target: RemindTarget) => remindFleetDocument(target),
    onSuccess: (outcome) => {
      const message = remindOutcomeMessage(outcome);
      notify[message.tone](message.title, { description: message.description });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: fleetDocumentAckKeys.all(companyId) });
    },
  });
}

export interface WitnessInput {
  versionId: string;
  vesselId: string;
  profileId: string;
  /** For the toast and the refusal sentences. */
  personName: string;
  title: string;
  versionLabel: string;
}

/** Records a witnessed acknowledgement and checks the row: this version, vessel and person, method witnessed, a witness named. */
export async function witnessFleetDocument(input: WitnessInput): Promise<FleetDocumentAcknowledgementRow> {
  if (!input.versionId || !input.vesselId || !input.profileId) throw new FleetDocumentAckRefusalError('not_recorded', NOT_RECORDED_WITNESS);
  const { data, error } = await fleetDocumentsDb.rpc('fleet_document_acknowledge_witnessed', {
    p_version_id: input.versionId,
    p_vessel_id: input.vesselId,
    p_profile_id: input.profileId,
  });
  if (error) throw refusalFrom(error, (code, detail) => witnessRefusal(code, detail, input.personName), `${ACKS_NOT_SET_UP}, so nothing was recorded.`);
  const row = data as FleetDocumentAcknowledgementRow | null;
  if (
    !row ||
    typeof row.id !== 'string' ||
    row.version_id !== input.versionId ||
    row.vessel_id !== input.vesselId ||
    row.profile_id !== input.profileId ||
    row.method !== 'witnessed' ||
    !row.witnessed_by_profile_id
  ) {
    throw new FleetDocumentAckRefusalError('not_recorded', NOT_RECORDED_WITNESS);
  }
  return row;
}

export function useWitnessFleetDocument(companyId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WitnessInput) => witnessFleetDocument(input),
    onSuccess: (_row, input) => {
      notify.success(`Recorded for ${input.personName}`, {
        description: `${input.title}, version ${input.versionLabel}: acknowledged on a shared device, with you as the witness.`,
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: fleetDocumentAckKeys.all(companyId) });
    },
  });
}

const sameSet = (a: readonly string[] | null | undefined, b: readonly string[] | null | undefined) => {
  const x = new Set((a ?? []).map((v) => v.toLowerCase()));
  const y = new Set((b ?? []).map((v) => v.toLowerCase()));
  return x.size === y.size && [...x].every((v) => y.has(v));
};

/** The signer rule as stored, or null when the default now applies (a removed rule, or none to remove). */
export type SignerRuleSaved = { kind: 'saved'; rule: FleetDocumentSignerRuleRow } | { kind: 'default' };

/**
 * Sets (or with a NULL rule removes) who can sign on a vessel, for every
 * document type or one, and checks the answer: the rule written for this
 * vessel, type, rule and lists; for a removal, the removed rule of this
 * vessel and type, or an empty answer when there was none.
 */
export async function setVesselSignerRule(args: SignerRuleArgs): Promise<SignerRuleSaved> {
  if (!args.p_vessel_id) throw new FleetDocumentAckRefusalError('not_recorded', NOT_SAVED_RULE);
  const { data, error } = await fleetDocumentsDb.rpc('fleet_document_set_signer_rule', {
    p_vessel_id: args.p_vessel_id,
    p_type_id: args.p_type_id,
    p_rule: args.p_rule,
    p_positions: args.p_positions,
    p_profile_ids: args.p_profile_ids,
  });
  if (error) throw refusalFrom(error, (code) => signerRuleRefusal(code), `${ACKS_NOT_SET_UP}, so nothing was saved.`);
  const row = data as FleetDocumentSignerRuleRow | null;
  if (args.p_rule === null) {
    const none = !row || row.id === null || row.id === undefined;
    if (none || (row.vessel_id === args.p_vessel_id && (row.type_id ?? null) === args.p_type_id)) return { kind: 'default' };
    throw new FleetDocumentAckRefusalError('not_recorded', NOT_SAVED_RULE);
  }
  const ok =
    !!row &&
    typeof row.id === 'string' &&
    row.vessel_id === args.p_vessel_id &&
    (row.type_id ?? null) === args.p_type_id &&
    row.rule === args.p_rule &&
    sameSet(row.positions, args.p_positions) &&
    sameSet(row.profile_ids, args.p_profile_ids);
  if (!ok) throw new FleetDocumentAckRefusalError('not_recorded', NOT_SAVED_RULE);
  return { kind: 'saved', rule: row };
}

export function useSetVesselSignerRule(companyId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: SignerRuleArgs) => setVesselSignerRule(args),
    onSettled: () => {
      // The rule decides who is blocked: every acknowledgement read changes with it.
      void queryClient.invalidateQueries({ queryKey: fleetDocumentAckKeys.all(companyId) });
    },
  });
}

// ─── The caller's capacity on a vessel (a hint; the definers decide) ────

/**
 * What the caller may do in a vessel's crew view (lib/ackAdmin.ts
 * crewCapacity): from their own RBAC roles (only once the permissions
 * store holds this user's roles; fail closed until then), the legacy
 * profile role, fleet reach (VesselContext's reach rules) and the library's
 * documents keys. The server checks every action again and refuses in
 * words; the screen only offers what it would likely allow.
 */
export function useVesselAckCapacity(vesselId: string | null, onCrew: boolean): CrewCapacity {
  const { user, profile } = useAuth();
  const vessel = useVessel({ optional: true });
  const rbacLoadedFor = usePermissionsStore((s) => s.loadedFor);
  const rbacInitialized = usePermissionsStore((s) => s.isInitialized);
  const userRoles = usePermissionsStore((s) => s.userRoles);
  const hasFleetWideRole = usePermissionsStore((s) => s.hasFleetAccess);
  const documentsView = useCan(DOCUMENTS_CAPS.view);
  const documentsEdit = useCan(DOCUMENTS_CAPS.edit);
  const documentsAdmin = useCan(DOCUMENTS_CAPS.admin);
  const userId = user?.id ?? null;
  const ownRoles = userId !== null && rbacInitialized && rbacLoadedFor === userId;
  const reach = vessel?.reach ?? LEGACY_REACH;
  const canAccessAllVessels = vessel?.canAccessAllVessels ?? false;
  const fleetReach = vessel
    ? fleetReachFor(reach, {
        canAccessAllVessels,
        hasFleetWideRole: ownRoles && hasFleetWideRole,
        rbacRoles: ownRoles ? (userRoles ?? []).map((r) => r.role_name) : [],
      })
    : false;
  const legacyRole = profile?.role ?? null;
  return useMemo(
    () =>
      vesselId
        ? crewCapacity({
            vesselId,
            roles: ownRoles ? userRoles ?? [] : [],
            rolesKnown: ownRoles,
            legacyRole,
            onCrew,
            fleetReach,
            documentsView,
            documentsEdit,
            documentsAdmin,
          })
        : crewCapacity({
            vesselId: '',
            roles: [],
            rolesKnown: false,
            legacyRole: null,
            onCrew: false,
            fleetReach: false,
            documentsView: false,
            documentsEdit: false,
            documentsAdmin: false,
          }),
    [vesselId, ownRoles, userRoles, legacyRole, onCrew, fleetReach, documentsView, documentsEdit, documentsAdmin],
  );
}
