/**
 * Envelope and audit-event reads (Phase 2 spec §B.6). RLS decides what the
 * caller may see (company + vessel reach or fleet reach); these only select.
 */
import { recordsDb } from './client';
import { missingOrThrow, type ServiceResult } from './results';
import type { RecordEnvelopeRow, RecordEventRow } from './db.pending';

export type EnvelopeSummary = Pick<
  RecordEnvelopeRow,
  | 'id' | 'company_id' | 'vessel_id' | 'module_key' | 'kind_key' | 'entity_id' | 'reference' | 'title' | 'status' | 'whose_move'
  | 'closed_by_kind' | 'closed_as' | 'company_decision' | 'company_acknowledged' | 'initial_report_acknowledged' | 'current_cycle'
  | 'acknowledged_cycle' | 'version' | 'last_update_at' | 'follow_up_due' | 'voided_at' | 'opened_at' | 'updated_at'
>;

const ENVELOPE_COLUMNS =
  'id, company_id, vessel_id, module_key, kind_key, entity_id, reference, title, status, whose_move, closed_by_kind, closed_as, company_decision, company_acknowledged, initial_report_acknowledged, current_cycle, acknowledged_cycle, version, last_update_at, follow_up_due, voided_at, opened_at, updated_at';

/** One envelope by id; `ok` with null when RLS hides it or it does not exist. */
export async function fetchEnvelope(envelopeId: string): Promise<ServiceResult<EnvelopeSummary | null>> {
  const { data, error } = await recordsDb.from('record_envelopes').select(ENVELOPE_COLUMNS).eq('id', envelopeId).maybeSingle();
  if (error) return missingOrThrow(error);
  return { status: 'ok', value: data };
}

/** The envelope of a domain row (unique per kind and entity). */
export async function fetchEnvelopeByEntity(kindKey: string, entityId: string): Promise<ServiceResult<EnvelopeSummary | null>> {
  const { data, error } = await recordsDb
    .from('record_envelopes')
    .select(ENVELOPE_COLUMNS)
    .eq('kind_key', kindKey)
    .eq('entity_id', entityId)
    .maybeSingle();
  if (error) return missingOrThrow(error);
  return { status: 'ok', value: data };
}

export type RecordEventSummary = Pick<
  RecordEventRow,
  'id' | 'action' | 'party' | 'actor_user_id' | 'from_status' | 'to_status' | 'cycle' | 'reason' | 'payload' | 'created_at'
>;

/** The record's activity trail, newest first (append-only, trigger and RPC written). */
export async function fetchRecordEvents(envelopeId: string, limit = 200): Promise<ServiceResult<RecordEventSummary[]>> {
  const { data, error } = await recordsDb
    .from('record_events')
    .select('id, action, party, actor_user_id, from_status, to_status, cycle, reason, payload, created_at')
    .eq('envelope_id', envelopeId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return missingOrThrow(error);
  return { status: 'ok', value: data ?? [] };
}
