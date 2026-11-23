/**
 * The only way a record's status changes from the client: name the action,
 * the server decides (MASTER-PROMPT §4; gap/08 REG3; Phase 2 spec §A.10).
 * The client never writes `status`.
 */
import type { Json } from '@/integrations/supabase/types';
import type { ClosedAs, CompanyDecision, EnvelopeAction } from '../companyStep';
import { recordsDb } from './client';
import { fromRpcResult, missingOrThrow, type ServiceResult } from './results';
import type { EnvelopeSummary } from './envelopes';

/** Free-text and choice inputs of `record_transition`; the server derives every guard itself. */
export type TransitionPayload = {
  reason?: string;
  decision?: CompanyDecision;
  conditions?: string;
  closedAs?: ClosedAs;
  /** Envelope id of the record this one duplicates (`close_as duplicate`). */
  duplicateOf?: string;
};

export interface TransitionRequest {
  envelopeId: string;
  /** Every action except `vessel_sign`, which only `record_sign_slot` runs. */
  action: Exclude<EnvelopeAction, 'vessel_sign'>;
  payload?: TransitionPayload;
  /** Optimistic concurrency (SV6): refused with `version_conflict` when the envelope moved on. */
  expectedVersion?: number;
}

export interface TransitionValue {
  envelope: EnvelopeSummary;
  effects: string[];
  notification: string | null;
}

export async function transitionRecord(request: TransitionRequest): Promise<ServiceResult<TransitionValue>> {
  const { data, error } = await recordsDb.rpc('record_transition', {
    p_envelope_id: request.envelopeId,
    p_action: request.action,
    p_payload: (request.payload ?? {}) as Json,
    p_expected_version: request.expectedVersion,
  });
  if (error) return missingOrThrow(error);
  return fromRpcResult<TransitionValue>(data);
}
