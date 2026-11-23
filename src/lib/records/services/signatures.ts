/**
 * Signature slots and signing (gap/08 §B; DECISIONS D-48, D-51; Phase 2 spec
 * §A.11). Reads the derived slot states from `record_signature_slot_states`;
 * every write is an RPC with a client-generated id (idempotent retries).
 * On-behalf signing is refused by the server until D-48's predicate exists.
 */
import type { Json } from '@/integrations/supabase/types';
import type { SignatureMethod } from '../signatures';
import { recordsDb } from './client';
import { fromRpcResult, missingOrThrow, type ServiceResult } from './results';
import type { RecordSignatureSlotStateRow, SignatureVisitorInput } from './db.pending';

export async function fetchSlotStates(envelopeId: string, cycle?: number): Promise<ServiceResult<RecordSignatureSlotStateRow[]>> {
  let query = recordsDb
    .from('record_signature_slot_states')
    .select('slot_id, envelope_id, company_id, vessel_id, cycle, slot_key, label, order_no, party, required, state, live_signature_id, stale, passed_to_profile_id, passed_at')
    .eq('envelope_id', envelopeId);
  if (cycle !== undefined) query = query.eq('cycle', cycle);
  const { data, error } = await query.order('cycle').order('order_no');
  if (error) return missingOrThrow(error);
  return { status: 'ok', value: data ?? [] };
}

export interface SignSlotRequest {
  /** Client-generated uuid; re-sending it after a dropped response is a no-op. */
  signatureId: string;
  slotId: string;
  method: SignatureMethod;
  /** Witnessed: the crew member signing on this device. */
  signerProfileId?: string;
  /** Witnessed: a visitor or contractor (slots that allow it). */
  visitor?: SignatureVisitorInput;
  onBehalfOfOffice?: string;
  reason?: string;
  imagePath?: string;
  expectedVersion?: number;
}

export async function signRecordSlot(request: SignSlotRequest): Promise<ServiceResult<Json>> {
  const { data, error } = await recordsDb.rpc('record_sign_slot', {
    p_signature_id: request.signatureId,
    p_slot_id: request.slotId,
    p_method: request.method,
    p_signer_profile_id: request.signerProfileId,
    p_visitor: request.visitor as Json | undefined,
    p_on_behalf_of_office: request.onBehalfOfOffice,
    p_reason: request.reason,
    p_image_path: request.imagePath,
    p_expected_version: request.expectedVersion,
  });
  if (error) return missingOrThrow(error);
  return fromRpcResult<Json>(data);
}

export async function passRecordSlot(slotId: string, toProfileId: string): Promise<ServiceResult<Json>> {
  const { data, error } = await recordsDb.rpc('record_pass_slot', { p_slot_id: slotId, p_to_profile_id: toProfileId });
  if (error) return missingOrThrow(error);
  return fromRpcResult<Json>(data);
}

export async function cancelRecordSlotPass(slotId: string): Promise<ServiceResult<Json>> {
  const { data, error } = await recordsDb.rpc('record_cancel_pass', { p_slot_id: slotId });
  if (error) return missingOrThrow(error);
  return fromRpcResult<Json>(data);
}

export async function removeRecordSignature(signatureId: string, reason?: string): Promise<ServiceResult<Json>> {
  const { data, error } = await recordsDb.rpc('record_remove_signature', { p_signature_id: signatureId, p_reason: reason });
  if (error) return missingOrThrow(error);
  return fromRpcResult<Json>(data);
}

/** Re-sign a stale signature: `signatureId` is the NEW row's client-generated id. */
export async function reSignRecordSlot(signatureId: string, slotId: string): Promise<ServiceResult<Json>> {
  const { data, error } = await recordsDb.rpc('record_resign_slot', { p_signature_id: signatureId, p_slot_id: slotId });
  if (error) return missingOrThrow(error);
  return fromRpcResult<Json>(data);
}
