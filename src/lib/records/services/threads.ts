/**
 * Status-update and company-review threads (gap/08 §D, TH1–TH3; Phase 2
 * spec §A.12). Entries are append-only; the server decides the party
 * (company actor or vessel member) and recomputes whose move.
 */
import type { Json } from '@/integrations/supabase/types';
import type { ThreadEntryType } from '../threads';
import { recordsDb } from './client';
import { fromRpcResult, missingOrThrow, type ServiceResult } from './results';
import type { RecordThreadEntryRow, ThreadKind } from './db.pending';

export type ThreadEntrySummary = Pick<
  RecordThreadEntryRow,
  | 'id' | 'entry_type' | 'party' | 'author_profile_id' | 'body' | 'follow_up_due' | 'request_due' | 'request_state'
  | 'request_resolved_at' | 'resolution_note' | 'due_history' | 'parent_id' | 'replaces_id' | 'created_at'
>;

export async function fetchThreadEntries(envelopeId: string, kind: ThreadKind): Promise<ServiceResult<ThreadEntrySummary[]>> {
  const { data: thread, error: threadError } = await recordsDb
    .from('record_threads')
    .select('id')
    .eq('envelope_id', envelopeId)
    .eq('kind', kind)
    .maybeSingle();
  if (threadError) return missingOrThrow(threadError);
  if (!thread) return { status: 'ok', value: [] };
  const { data, error } = await recordsDb
    .from('record_thread_entries')
    .select('id, entry_type, party, author_profile_id, body, follow_up_due, request_due, request_state, request_resolved_at, resolution_note, due_history, parent_id, replaces_id, created_at')
    .eq('thread_id', thread.id)
    .order('created_at');
  if (error) return missingOrThrow(error);
  return { status: 'ok', value: data ?? [] };
}

export interface PostEntryRequest {
  /** Client-generated uuid (idempotent retry). */
  entryId: string;
  envelopeId: string;
  threadKind: ThreadKind;
  entryType: Exclude<ThreadEntryType, 'system'>;
  body: string;
  followUpDue?: string;
  requestDue?: string;
  parentId?: string;
  replacesId?: string;
}

export async function postThreadEntry(request: PostEntryRequest): Promise<ServiceResult<Json>> {
  const { data, error } = await recordsDb.rpc('record_post_thread_entry', {
    p_entry_id: request.entryId,
    p_envelope_id: request.envelopeId,
    p_thread_kind: request.threadKind,
    p_entry_type: request.entryType,
    p_body: request.body,
    p_follow_up_due: request.followUpDue,
    p_request_due: request.requestDue,
    p_parent_id: request.parentId,
    p_replaces_id: request.replacesId,
  });
  if (error) return missingOrThrow(error);
  return fromRpcResult<Json>(data);
}

export async function resolveThreadRequest(
  requestId: string,
  resolution: 'done' | 'cancelled' | 'change_date',
  options: { note?: string; newDue?: string } = {},
): Promise<ServiceResult<Json>> {
  const { data, error } = await recordsDb.rpc('record_resolve_thread_request', {
    p_request_id: requestId,
    p_resolution: resolution,
    p_note: options.note,
    p_new_due: options.newDue,
  });
  if (error) return missingOrThrow(error);
  return fromRpcResult<Json>(data);
}
