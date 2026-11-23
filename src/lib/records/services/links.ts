/**
 * Generic record links (DECISIONS C8; Phase 2 spec §A.13). Both ends must be
 * records of one company the caller can read; the server stamps the scope.
 * A business refusal (22023) is `refused`; a cross-tenant id (42501) throws.
 */
import { recordsDb } from './client';
import { missingOrThrow, refusedOrThrow, type ServiceResult } from './results';
import type { RecordLinkKind, RecordLinkRow } from './db.pending';

export async function fetchRecordLinks(envelopeId: string): Promise<ServiceResult<RecordLinkRow[]>> {
  const { data, error } = await recordsDb
    .from('record_links')
    .select('*')
    .eq('from_envelope_id', envelopeId)
    .is('removed_at', null)
    .order('created_at');
  if (error) return missingOrThrow(error);
  return { status: 'ok', value: data ?? [] };
}

export interface LinkRequest {
  fromEnvelopeId: string;
  toEnvelopeId?: string;
  toEntityType?: string;
  toEntityId?: string;
  kind?: RecordLinkKind;
  note?: string;
}

export async function linkRecords(request: LinkRequest): Promise<ServiceResult<RecordLinkRow>> {
  const { data, error } = await recordsDb.rpc('link_records', {
    p_from_envelope_id: request.fromEnvelopeId,
    p_to_envelope_id: request.toEnvelopeId,
    p_to_entity_type: request.toEntityType,
    p_to_entity_id: request.toEntityId,
    p_link_kind: request.kind,
    p_note: request.note,
  });
  if (error) return refusedOrThrow(error);
  return { status: 'ok', value: data };
}

export async function unlinkRecords(linkId: string): Promise<ServiceResult<RecordLinkRow>> {
  const { data, error } = await recordsDb.rpc('unlink_records', { p_link_id: linkId });
  if (error) return refusedOrThrow(error);
  return { status: 'ok', value: data };
}
