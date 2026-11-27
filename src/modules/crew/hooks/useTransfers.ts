/**
 * The controlled transfer between vessels (X1-11; gap/04 C58, W9). Reads
 * and writes 20261124061100_crew_transfers_employment.sql through the
 * pending client:
 *
 * - useTransferOptions: transfer_crew_options (the wizard's start: the
 *   destinations the caller may transfer to with their positions and
 *   approval flag, the person's open transfer, and why the person cannot be
 *   transferred from here);
 * - useTransferDetail: transfer_crew_detail (one transfer, the ?transfer=
 *   deep link of crew_transfer_submitted);
 * - useTransferSteps: start, review, acknowledge, submit, decide, cancel and
 *   complete. Every step answers the transfer as the server now holds it
 *   (parseTransfer); an answer that cannot be read is an error, never a
 *   success.
 *
 * Refusals (transferRefusal): a 42501 shows its STORM sentence as is
 * (crewRefusalMessage; the D-207 sentences, D-225); a 22023 / P0002 with a
 * DETAIL shows the DETAIL and names the field its HINT points at.
 *
 * D-01. While the file is not applied the RPCs are missing (PGRST202, or
 * 42883 naming the function): the options answer 'missing' and the crew
 * list and profile keep the documented fallback, the legacy transfer form
 * (TransferCrewModal's LegacyTransferForm). Any other error is an error
 * with Retry. Nothing is mocked.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import type { Json } from '@/integrations/supabase/types';
import type { CrewPendingFunctions, CrewPendingTables } from '../types/db.pending';
import { crewKeys } from './crewKeys';
import { crewRefusalMessage } from '../lib/crewUpdateErrors';
import { isMissingRpc } from '../lib/crewListModel';
import { parseTransfer, parseTransferList, parseTransferOptions, type Transfer, type TransferOptions } from '../lib/transfer';
import { transferFieldFor, type TransferDetailsValues } from '../lib/transferSchema';

const crewDb = pendingClient<CrewPendingTables, NoPending, CrewPendingFunctions>();

export const TRANSFER_RPCS = {
  options: 'transfer_crew_options',
  start: 'transfer_crew_start',
  review: 'transfer_crew_review',
  acknowledge: 'transfer_crew_acknowledge',
  submit: 'transfer_crew_submit',
  decide: 'transfer_crew_decide',
  cancel: 'transfer_crew_cancel',
  complete: 'transfer_crew',
  detail: 'transfer_crew_detail',
  forProfile: 'crew_transfers_for_profile',
} as const;

/** The D-01 notice while the transfer server is not applied. */
export const TRANSFER_UNAVAILABLE_NOTICE =
  'Reviewed transfers become available once the crew update is applied. Until then the transfer below ends the current assignment and opens the new one directly.';

export const UNREADABLE_ANSWER = 'The server answered in a way STORM could not read. Nothing was assumed; try again.';

export const transferKeys = {
  options: (companyId: string | null | undefined, vesselId: string | null | undefined, profileId: string | null | undefined) =>
    [...crewKeys.vessel(companyId, vesselId), 'transfer-options', profileId ?? 'none'] as const,
  detail: (companyId: string | null | undefined, transferId: string | null | undefined) =>
    [...crewKeys.company(companyId), 'transfer', transferId ?? 'none'] as const,
  forProfile: (companyId: string | null | undefined, profileId: string | null | undefined) =>
    [...crewKeys.company(companyId), 'transfers-of', profileId ?? 'none'] as const,
};

// ---------------------------------------------------------------- refusals

interface PostgrestLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
}

export type TransferRefusalKind = 'refused' | 'denied' | 'not_found' | 'missing' | 'error';

export class TransferError extends Error {
  readonly kind: TransferRefusalKind;
  readonly code: string | null;
  readonly field: keyof TransferDetailsValues | null;
  readonly hint: string | null;
  constructor(kind: TransferRefusalKind, message: string, code: string | null = null, hint: string | null = null) {
    super(message);
    this.name = 'TransferError';
    this.kind = kind;
    this.code = code;
    this.hint = hint;
    this.field = transferFieldFor(hint);
  }
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** A server error as the wizard shows it (never a raw code). */
export function transferRefusal(error: unknown, rpc: string): TransferError {
  if (error instanceof TransferError) return error;
  if (isMissingRpc(error, rpc)) return new TransferError('missing', TRANSFER_UNAVAILABLE_NOTICE, 'missing');
  const e = (error ?? {}) as PostgrestLike;
  const code = text(e.code);
  const detail = text(e.details);
  const hint = text(e.hint);
  const reason = text(e.message);
  if (code === '42501') return new TransferError('denied', crewRefusalMessage(error), reason, hint);
  if (code === 'P0002') return new TransferError('not_found', detail ?? 'This transfer could not be found.', reason, hint);
  if (code === '22023' && detail) return new TransferError('refused', detail, reason, hint);
  return new TransferError('error', crewRefusalMessage(error), reason ?? code, hint);
}

// ---------------------------------------------------------------- reads

export interface TransferVessel {
  id: string;
  companyId: string | null;
}

export type TransferOptionsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'denied'; message: string }
  | { status: 'not_found'; message: string }
  | { status: 'error'; error: TransferError; retry: () => void }
  | { status: 'ready'; options: TransferOptions; refreshing: boolean; refresh: () => void };

export async function fetchTransferOptions(profileId: string, vesselId: string): Promise<TransferOptions> {
  const { data, error } = await crewDb.rpc(TRANSFER_RPCS.options, { p_profile_id: profileId, p_from_vessel_id: vesselId });
  if (error) throw transferRefusal(error, TRANSFER_RPCS.options);
  const options = parseTransferOptions(data);
  if (!options) throw new TransferError('error', UNREADABLE_ANSWER, 'unreadable');
  return options;
}

/** The wizard's options for a person on the route vessel; reads nothing until enabled. */
export function useTransferOptions(vessel: TransferVessel | null, profileId: string | null, enabled = true): TransferOptionsState {
  const on = enabled && Boolean(vessel?.id) && Boolean(profileId);
  const query = useQuery({
    queryKey: transferKeys.options(vessel?.companyId, vessel?.id, profileId),
    queryFn: () => fetchTransferOptions(profileId as string, vessel?.id as string),
    enabled: on,
    retry: (count, error) => !(error instanceof TransferError && error.kind !== 'error') && count < 1,
    staleTime: 15_000,
  });
  if (!on) return { status: 'idle' };
  if (query.error) {
    const e = transferRefusal(query.error, TRANSFER_RPCS.options);
    if (e.kind === 'missing') return { status: 'missing' };
    if (e.kind === 'denied') return { status: 'denied', message: e.message };
    if (e.kind === 'not_found') return { status: 'not_found', message: e.message };
    return { status: 'error', error: e, retry: () => void query.refetch() };
  }
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', options: query.data, refreshing: query.isFetching, refresh: () => void query.refetch() };
}

export type TransferDetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'not_found'; message: string }
  | { status: 'error'; error: TransferError; retry: () => void }
  | { status: 'ready'; transfer: Transfer };

export async function fetchTransferDetail(transferId: string): Promise<Transfer> {
  const { data, error } = await crewDb.rpc(TRANSFER_RPCS.detail, { p_transfer_id: transferId });
  if (error) throw transferRefusal(error, TRANSFER_RPCS.detail);
  const transfer = parseTransfer(data);
  if (!transfer) throw new TransferError('error', UNREADABLE_ANSWER, 'unreadable');
  return transfer;
}

/** One transfer (the deep link); reads nothing without an id. */
export function useTransferDetail(companyId: string | null, transferId: string | null): TransferDetailState {
  const on = Boolean(transferId);
  const query = useQuery({
    queryKey: transferKeys.detail(companyId, transferId),
    queryFn: () => fetchTransferDetail(transferId as string),
    enabled: on,
    retry: (count, error) => !(error instanceof TransferError && error.kind !== 'error') && count < 1,
  });
  if (!on) return { status: 'idle' };
  if (query.error) {
    const e = transferRefusal(query.error, TRANSFER_RPCS.detail);
    if (e.kind === 'missing') return { status: 'missing' };
    if (e.kind === 'not_found' || e.kind === 'denied') return { status: 'not_found', message: e.message };
    return { status: 'error', error: e, retry: () => void query.refetch() };
  }
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', transfer: query.data };
}

/** A person's transfers (X1-11B's Transfers list). */
export async function fetchTransfersForProfile(profileId: string): Promise<Transfer[]> {
  const { data, error } = await crewDb.rpc(TRANSFER_RPCS.forProfile, { p_profile_id: profileId });
  if (error) throw transferRefusal(error, TRANSFER_RPCS.forProfile);
  if (!Array.isArray(data)) throw new TransferError('error', UNREADABLE_ANSWER, 'unreadable');
  return parseTransferList(data);
}

// ---------------------------------------------------------------- the steps

export interface StartTransferArgs {
  p_profile_id: string;
  p_from_vessel_id: string;
  p_to_vessel_id: string;
  p_to_position_id: string | null;
  p_sign_off_date: string;
  p_sign_on_date: string;
  p_notes: string | null;
}

export type TransferStep =
  | { step: 'start'; args: StartTransferArgs }
  | { step: 'review'; transferId: string }
  | { step: 'acknowledge'; transferId: string; items: ReadonlyArray<{ key: string; acknowledged: true; note?: string }> }
  | { step: 'submit'; transferId: string }
  | { step: 'decide'; transferId: string; decision: 'approve' | 'decline'; reason: string | null }
  | { step: 'cancel'; transferId: string; reason: string | null }
  | { step: 'complete'; transferId: string };

async function call(step: TransferStep): Promise<{ data: unknown; error: unknown; rpc: string }> {
  switch (step.step) {
    case 'start': {
      const r = await crewDb.rpc(TRANSFER_RPCS.start, step.args);
      return { data: r.data, error: r.error, rpc: TRANSFER_RPCS.start };
    }
    case 'review': {
      const r = await crewDb.rpc(TRANSFER_RPCS.review, { p_transfer_id: step.transferId });
      return { data: r.data, error: r.error, rpc: TRANSFER_RPCS.review };
    }
    case 'acknowledge': {
      const r = await crewDb.rpc(TRANSFER_RPCS.acknowledge, { p_transfer_id: step.transferId, p_items: step.items as unknown as Json });
      return { data: r.data, error: r.error, rpc: TRANSFER_RPCS.acknowledge };
    }
    case 'submit': {
      const r = await crewDb.rpc(TRANSFER_RPCS.submit, { p_transfer_id: step.transferId });
      return { data: r.data, error: r.error, rpc: TRANSFER_RPCS.submit };
    }
    case 'decide': {
      const r = await crewDb.rpc(TRANSFER_RPCS.decide, { p_transfer_id: step.transferId, p_decision: step.decision, p_reason: step.reason });
      return { data: r.data, error: r.error, rpc: TRANSFER_RPCS.decide };
    }
    case 'cancel': {
      const r = await crewDb.rpc(TRANSFER_RPCS.cancel, { p_transfer_id: step.transferId, p_reason: step.reason });
      return { data: r.data, error: r.error, rpc: TRANSFER_RPCS.cancel };
    }
    case 'complete': {
      const r = await crewDb.rpc(TRANSFER_RPCS.complete, { p_transfer_id: step.transferId });
      return { data: r.data, error: r.error, rpc: TRANSFER_RPCS.complete };
    }
  }
}

/** Runs one step; the answer must be the transfer (an id that matches when the step names one). */
export async function runTransferStep(step: TransferStep): Promise<Transfer> {
  const { data, error, rpc } = await call(step);
  if (error) throw transferRefusal(error, rpc);
  const transfer = parseTransfer(data);
  if (!transfer || (step.step !== 'start' && transfer.id !== step.transferId)) {
    throw new TransferError('error', UNREADABLE_ANSWER, 'unreadable');
  }
  return transfer;
}

/** The wizard's writes. Each success refreshes the vessel's crew lists and the person's options. */
export function useTransferSteps(vessel: TransferVessel | null, profileId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runTransferStep,
    onSuccess: (transfer) => {
      queryClient.setQueryData(transferKeys.detail(vessel?.companyId, transfer.id), transfer);
      void queryClient.invalidateQueries({ queryKey: transferKeys.options(vessel?.companyId, vessel?.id, profileId) });
      void queryClient.invalidateQueries({ queryKey: transferKeys.forProfile(vessel?.companyId, profileId) });
      if (transfer.status === 'completed' || transfer.status === 'scheduled' || transfer.status === 'cancelled') {
        void queryClient.invalidateQueries({ queryKey: crewKeys.vessel(vessel?.companyId, transfer.fromVessel.id) });
        void queryClient.invalidateQueries({ queryKey: crewKeys.vessel(vessel?.companyId, transfer.toVessel.id) });
        void queryClient.invalidateQueries({ queryKey: ['crew'] });
      }
    },
  });
}
