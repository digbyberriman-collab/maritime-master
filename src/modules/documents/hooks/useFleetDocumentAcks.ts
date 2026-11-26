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
 * D-01: a missing RPC is `not_set_up` ("Acknowledgements are not set up
 * yet"), cached and not retried; 42501 vessel_out_of_reach is its own
 * sentence and not retried; any other error is an error with Retry. A row
 * whose state the client does not know is an error, never a guess; nothing
 * is ever replaced by sample rows. Every key carries the company id under
 * the library's prefix, so a library change and an acknowledgement refresh
 * the same caches.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isMissingRelationError as isMissingRelation, notify } from '@/shared/lib/notify';
import { RECORD_FILES_BUCKET } from '@/lib/records/services/attachments';
import { fleetDocumentsDb } from '../lib/fleetDocumentsDb';
import { ackRefusal, isAckBlockedReason, isAckMethod, isAckState } from '../lib/ackState';
import type {
  FleetDocumentAcknowledgementRow,
  FleetDocumentMyPendingRow,
  FleetDocumentVesselDocumentRow,
} from '../types/db.pending';
import { fleetDocumentKeys } from './keys';

const NONE = 'none';

/** The acknowledgement keys, under the library's company prefix. */
export const fleetDocumentAckKeys = {
  all: (companyId: string | null | undefined) => [...fleetDocumentKeys.company(companyId), 'acks'] as const,
  /** One vessel's documents with the caller's own state. */
  vessel: (companyId: string | null | undefined, vesselId: string | null | undefined) =>
    [...fleetDocumentKeys.company(companyId), 'acks', 'vessel', vesselId ?? NONE] as const,
  /** The caller's own outstanding list, on one vessel or every vessel (`all`). */
  mine: (companyId: string | null | undefined, userId: string | null | undefined, vesselId: string | null | undefined) =>
    [...fleetDocumentKeys.company(companyId), 'acks', 'mine', userId ?? NONE, vesselId ?? 'all'] as const,
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
