/**
 * React Query hooks over the record-engine services (Phase 2 spec §B.6;
 * MASTER-PROMPT §4 "Data"). Every query key comes from `recordKeys` and
 * carries the ids it was read for; every mutation invalidates
 * `recordKeys.envelope(id)` when it settles (refused, failed or done), so
 * the page re-reads what the server now holds instead of guessing.
 *
 * The hooks return the services' `ServiceResult` as data: `missing` (the
 * engine is not live yet, D-01) and `refused` (a business rule) are answers,
 * not errors; anything else is thrown by the service and is the query's or
 * mutation's error (the page's error state with Retry). No hook writes a
 * status: transitions name an action and the server decides.
 *
 * Export jobs poll with `exportPollInterval` while `requested` or
 * `running`, and stop at a terminal status: no timed fake completion.
 */
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { Json } from '@/integrations/supabase/types';
import { recordKeys } from './keys';
import type { ServiceResult } from './results';
import { fetchEnvelope, fetchEnvelopeByEntity, fetchRecordEvents } from './envelopes';
import { transitionRecord, type TransitionRequest } from './transitions';
import {
  cancelRecordSlotPass,
  fetchSlotStates,
  passRecordSlot,
  reSignRecordSlot,
  removeRecordSignature,
  signRecordSlot,
  type SignSlotRequest,
} from './signatures';
import { fetchThreadEntries, postThreadEntry, resolveThreadRequest, type PostEntryRequest } from './threads';
import { fetchAttachments, removeRecordAttachment, uploadRecordFile, type UploadRecordFileRequest } from './attachments';
import { fetchRecordLinks, linkRecords, unlinkRecords, type LinkRequest } from './links';
import { cancelExportJob, exportPollInterval, fetchExportJob, requestExport, type ExportRequest } from './exports';
import type { ExportJobRow, ThreadKind } from './db.pending';

/** Record reads stay fresh briefly; mutations invalidate them, so this only spares re-mount refetches. */
export const RECORD_STALE_MS = 15_000;

const enabledFor = (...ids: (string | null | undefined)[]) => ids.every((id) => typeof id === 'string' && id.length > 0);

// ─── Reads ────────────────────────────────────────────────────────────────

export function useEnvelope(envelopeId: string | null | undefined) {
  return useQuery({
    queryKey: recordKeys.envelope(envelopeId ?? ''),
    queryFn: () => fetchEnvelope(envelopeId as string),
    enabled: enabledFor(envelopeId),
    staleTime: RECORD_STALE_MS,
  });
}

export function useEnvelopeByEntity(kindKey: string | null | undefined, entityId: string | null | undefined) {
  return useQuery({
    queryKey: recordKeys.envelopeByEntity(kindKey ?? '', entityId ?? ''),
    queryFn: () => fetchEnvelopeByEntity(kindKey as string, entityId as string),
    enabled: enabledFor(kindKey, entityId),
    staleTime: RECORD_STALE_MS,
  });
}

export function useRecordEvents(envelopeId: string | null | undefined) {
  return useQuery({
    queryKey: recordKeys.events(envelopeId ?? ''),
    queryFn: () => fetchRecordEvents(envelopeId as string),
    enabled: enabledFor(envelopeId),
    staleTime: RECORD_STALE_MS,
  });
}

/** The slot states of one cycle (the envelope's `current_cycle`), or of every cycle when `cycle` is omitted. */
export function useSlotStates(envelopeId: string | null | undefined, cycle?: number) {
  return useQuery({
    queryKey: recordKeys.slots(envelopeId ?? '', cycle ?? 'current'),
    queryFn: () => fetchSlotStates(envelopeId as string, cycle),
    enabled: enabledFor(envelopeId),
    staleTime: RECORD_STALE_MS,
  });
}

export function useThread(envelopeId: string | null | undefined, kind: ThreadKind) {
  return useQuery({
    queryKey: recordKeys.thread(envelopeId ?? '', kind),
    queryFn: () => fetchThreadEntries(envelopeId as string, kind),
    enabled: enabledFor(envelopeId),
    staleTime: RECORD_STALE_MS,
  });
}

export function useAttachments(envelopeId: string | null | undefined) {
  return useQuery({
    queryKey: recordKeys.attachments(envelopeId ?? ''),
    queryFn: () => fetchAttachments(envelopeId as string),
    enabled: enabledFor(envelopeId),
    staleTime: RECORD_STALE_MS,
  });
}

export function useRecordLinks(envelopeId: string | null | undefined) {
  return useQuery({
    queryKey: recordKeys.links(envelopeId ?? ''),
    queryFn: () => fetchRecordLinks(envelopeId as string),
    enabled: enabledFor(envelopeId),
    staleTime: RECORD_STALE_MS,
  });
}

/** The poll interval for a job query's current answer: only while the server says requested / running. */
export function exportJobRefetchInterval(data: ServiceResult<Pick<ExportJobRow, 'status'> | null> | undefined): number | false {
  return data?.status === 'ok' && data.value ? exportPollInterval(data.value.status) : false;
}

/** One export job, polled until the server reports a terminal status (ready, failed, cancelled, expired, purged). */
export function useExportJob(jobId: string | null | undefined) {
  return useQuery({
    queryKey: recordKeys.exportJob(jobId ?? ''),
    queryFn: () => fetchExportJob(jobId as string),
    enabled: enabledFor(jobId),
    refetchInterval: (query) => exportJobRefetchInterval(query.state.data),
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────

/** A mutation whose settling (any outcome) invalidates the envelope's queries. */
function useEnvelopeMutation<TVariables, TResult>(envelopeId: string, run: (variables: TVariables) => Promise<TResult>, extraKeys: QueryKey[] = []) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSettled: async () => {
      await Promise.all([recordKeys.envelope(envelopeId), ...extraKeys].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });
}

export function useTransitionRecord(envelopeId: string) {
  return useEnvelopeMutation(envelopeId, (request: Omit<TransitionRequest, 'envelopeId'>) => transitionRecord({ ...request, envelopeId }));
}

export function useSignRecordSlot(envelopeId: string) {
  return useEnvelopeMutation(envelopeId, (request: SignSlotRequest): Promise<ServiceResult<Json>> => signRecordSlot(request));
}

export function usePassRecordSlot(envelopeId: string) {
  return useEnvelopeMutation(envelopeId, ({ slotId, toProfileId }: { slotId: string; toProfileId: string }) => passRecordSlot(slotId, toProfileId));
}

export function useCancelRecordSlotPass(envelopeId: string) {
  return useEnvelopeMutation(envelopeId, (slotId: string) => cancelRecordSlotPass(slotId));
}

export function useRemoveRecordSignature(envelopeId: string) {
  return useEnvelopeMutation(envelopeId, ({ signatureId, reason }: { signatureId: string; reason?: string }) => removeRecordSignature(signatureId, reason));
}

export function useReSignRecordSlot(envelopeId: string) {
  return useEnvelopeMutation(envelopeId, ({ signatureId, slotId }: { signatureId: string; slotId: string }) => reSignRecordSlot(signatureId, slotId));
}

export function usePostThreadEntry(envelopeId: string) {
  return useEnvelopeMutation(envelopeId, (request: Omit<PostEntryRequest, 'envelopeId'>) => postThreadEntry({ ...request, envelopeId }));
}

export function useResolveThreadRequest(envelopeId: string) {
  return useEnvelopeMutation(
    envelopeId,
    ({ requestId, resolution, note, newDue }: { requestId: string; resolution: 'done' | 'cancelled' | 'change_date'; note?: string; newDue?: string }) =>
      resolveThreadRequest(requestId, resolution, { note, newDue }),
  );
}

export function useUploadRecordFile(envelopeId: string) {
  return useEnvelopeMutation(envelopeId, (request: Omit<UploadRecordFileRequest, 'envelopeId'>) => uploadRecordFile({ ...request, envelopeId }));
}

export function useRemoveRecordAttachment(envelopeId: string) {
  return useEnvelopeMutation(envelopeId, ({ attachmentId, reason }: { attachmentId: string; reason?: string }) => removeRecordAttachment(attachmentId, reason));
}

/** Links touch both ends: the other envelope's queries are invalidated too. */
export function useLinkRecords(envelopeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: Omit<LinkRequest, 'fromEnvelopeId'>) => linkRecords({ ...request, fromEnvelopeId: envelopeId }),
    onSettled: async (_data, _error, request) => {
      const keys: QueryKey[] = [recordKeys.envelope(envelopeId)];
      if (request.toEnvelopeId) keys.push(recordKeys.envelope(request.toEnvelopeId));
      await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });
}

export function useUnlinkRecords(envelopeId: string) {
  return useEnvelopeMutation(envelopeId, (linkId: string) => unlinkRecords(linkId));
}

/** Request a server export; the caller then follows the job with `useExportJob(job.id)`. */
export function useRequestExport(userId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: ExportRequest) => requestExport(request),
    onSettled: async () => {
      if (userId) await queryClient.invalidateQueries({ queryKey: recordKeys.myExports(userId) });
    },
  });
}

export function useCancelExportJob(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cancelExportJob(jobId),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: recordKeys.exportJob(jobId) });
    },
  });
}
