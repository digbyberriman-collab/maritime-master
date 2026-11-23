/**
 * Record-engine tables, views and RPCs (gap/08 REG, SIG, TH, AU, UPL, EXP;
 * DECISIONS C7–C10, G7, D-30, D-32, D-48, D-50, D-51). Phase 2 contract:
 * these shapes mirror the SQL in the Phase 2 spec §A.10–§A.14 exactly:
 *
 *   20261123020000_platform_record_registry.sql
 *     record_kinds, record_envelopes, record_events, record_snapshots,
 *     record_open_envelope(), record_transition_decide(), record_transition()
 *   20261123020100_platform_record_signatures.sql
 *     record_signature_slots, record_signatures, record_signature_slot_states,
 *     record_sign_slot(), record_pass_slot(), record_cancel_pass(),
 *     record_remove_signature(), record_resign_slot()
 *   20261123020200_platform_record_threads.sql
 *     record_threads, record_thread_entries, record_post_thread_entry(),
 *     record_resolve_thread_request()
 *   20261123020300_platform_record_files.sql
 *     file_objects, record_attachments, record_links, register_file_object(),
 *     attach_record_file(), remove_record_attachment(), link_records(),
 *     unlink_records()
 *   20261123020400_platform_export_jobs.sql
 *     export_jobs, request_export(), log_client_export(), cancel_export_job()
 *
 * The client never writes a status (MASTER-PROMPT §4): every status change
 * goes through `record_transition` or a wrapper, and no table here has an
 * insert or update policy for `authenticated`. Reads go through
 * `recordsDb` (./client.ts) and classify a missing relation as "engine not
 * set up yet" (D-01).
 */
import type { PendingTable, PendingView } from '@/integrations/supabase/pending';
import type { Json } from '@/integrations/supabase/types';
import type { CompanyStep, DeleteRule, EditAfterSign, EnvelopeStatus, Party, WhoseMove } from '../types';
import type { ClosedAs, ClosedBy, CompanyDecision, EnvelopeAction } from '../companyStep';
import type { SignatureMethod, SignerKind, SlotState } from '../signatures';
import type { RequestState, ThreadEntryType } from '../threads';

export type RecordScope = 'vessel' | 'fleet';
export type EventParty = Party | 'system';

export type RecordKindRow = {
  key: string;
  module_key: string;
  label: string;
  ref_prefix: string;
  scope: RecordScope;
  route_pattern: string | null;
  capability_path: string | null;
  enveloped: boolean;
  company_step: CompanyStep;
  report_first: boolean;
  decision_kind: boolean;
  allow_reopen: boolean;
  allow_close_as: boolean;
  edit_after_sign: EditAfterSign;
  delete_rule: DeleteRule;
  /** Array of slot definitions in snake_case (spec §A.10 "slot template"). */
  slot_template: Json;
  /** Kind-specific status vocabulary (no SQL IN CHECK: kinds define their own). */
  statuses: string[] | null;
  snapshot_on: string[];
  sensitive_fields: string[];
  personal_data: boolean;
  legal_privilege: boolean;
  allow_late_evidence: boolean;
  retention_years: number | null;
  pdf_template_key: string | null;
  created_at: string;
  updated_at: string;
};

export type RecordEnvelopeRow = {
  id: string;
  company_id: string;
  vessel_id: string | null;
  module_key: string;
  kind_key: string;
  entity_id: string | null;
  reference: string;
  title: string | null;
  status: EnvelopeStatus;
  whose_move: WhoseMove;
  closed_by_kind: ClosedBy | null;
  closed_as: ClosedAs | null;
  duplicate_of_envelope_id: string | null;
  company_decision: CompanyDecision | null;
  decision_conditions: string | null;
  company_acknowledged: boolean;
  company_ack_by: string | null;
  company_ack_at: string | null;
  initial_report_acknowledged: boolean;
  current_cycle: number;
  acknowledged_cycle: number | null;
  submitted_by: string | null;
  submitted_at: string | null;
  closed_by_user_id: string | null;
  closed_at: string | null;
  section_digests: Json;
  content_digest: string | null;
  last_update_at: string | null;
  follow_up_due: string | null;
  version: number;
  opened_by: string | null;
  opened_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  legal_hold: boolean;
  created_at: string;
  updated_at: string;
};

export type RecordEventRow = {
  id: string;
  company_id: string;
  vessel_id: string | null;
  module_key: string;
  kind_key: string | null;
  envelope_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  reference: string | null;
  action: string;
  party: EventParty;
  actor_user_id: string | null;
  impersonator_user_id: string | null;
  /** Envelope statuses for envelope events; other engines' own statuses (export jobs) otherwise: no SQL IN CHECK. */
  from_status: string | null;
  to_status: string | null;
  cycle: number | null;
  reason: string | null;
  payload: Json;
  notification_type: string | null;
  created_at: string;
};

export type SnapshotReason = 'submitted' | 'decision' | 'closed' | 'reopened' | 'review_started' | 'voided';

export type RecordSnapshotRow = {
  id: string;
  envelope_id: string;
  company_id: string;
  vessel_id: string | null;
  seq: number;
  reason: SnapshotReason;
  payload: Json;
  sha256: string;
  created_by: string | null;
  created_at: string;
};

export type RecordSignatureSlotRow = {
  id: string;
  envelope_id: string;
  company_id: string;
  vessel_id: string | null;
  cycle: number;
  slot_key: string;
  label: string;
  order_no: number;
  party: Party;
  required: boolean;
  office_key: string | null;
  named_profile_ids: string[];
  covers_sections: string[] | null;
  allow_witnessed: boolean;
  allow_visitor: boolean;
  allow_on_behalf: boolean;
  on_behalf_reason_required: boolean;
  distinct_from: string[];
  passed_to_profile_id: string | null;
  passed_at: string | null;
  passed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CompanySignatureDecision = 'acknowledged' | 'approved' | 'approved_with_conditions' | 'not_approved' | 'signed_off';

export type RecordSignatureRow = {
  id: string;
  envelope_id: string;
  slot_id: string | null;
  company_id: string;
  vessel_id: string | null;
  cycle: number;
  slot_key: string | null;
  party: Party;
  signer_user_id: string | null;
  signer_profile_id: string | null;
  signer_name: string;
  signer_kind: SignerKind;
  visitor_company: string | null;
  visitor_capacity: string | null;
  method: SignatureMethod;
  witness_profile_id: string | null;
  witness_user_id: string | null;
  on_behalf_of_office: string | null;
  on_behalf_reason: string | null;
  decision: CompanySignatureDecision | null;
  comment: string | null;
  image_path: string | null;
  image_sha256: string | null;
  record_digest: string;
  record_version: number;
  integrity_hash: string;
  signed_at: string;
  impersonator_user_id: string | null;
  removed_at: string | null;
  removed_by: string | null;
  removal_reason: string | null;
  superseded_at: string | null;
  created_at: string;
};

/** `record_signature_slot_states` (security_invoker view): a slot of any cycle with its derived state. */
export type RecordSignatureSlotStateRow = {
  slot_id: string;
  envelope_id: string;
  company_id: string;
  vessel_id: string | null;
  cycle: number;
  slot_key: string;
  label: string;
  order_no: number;
  party: Party;
  required: boolean;
  state: SlotState;
  live_signature_id: string | null;
  stale: boolean;
  passed_to_profile_id: string | null;
  passed_at: string | null;
};

export type ThreadKind = 'status_updates' | 'company_review';

export type RecordThreadRow = {
  id: string;
  envelope_id: string;
  company_id: string;
  vessel_id: string | null;
  kind: ThreadKind;
  created_at: string;
  updated_at: string;
};

export type RecordThreadEntryRow = {
  id: string;
  thread_id: string;
  envelope_id: string;
  company_id: string;
  vessel_id: string | null;
  entry_type: ThreadEntryType;
  party: EventParty;
  author_user_id: string | null;
  author_profile_id: string | null;
  body: string;
  follow_up_due: string | null;
  request_due: string | null;
  request_state: RequestState | null;
  request_resolved_by: string | null;
  request_resolved_at: string | null;
  resolution_note: string | null;
  /** Array of `{ from, to, reason, changedAt, changedBy }` (threads.ts `DueChange`). */
  due_history: Json;
  parent_id: string | null;
  replaces_id: string | null;
  created_at: string;
  updated_at: string;
};

export type FileSource = 'upload' | 'generated' | 'import' | 'email';

/**
 * The record file types (SQL CHECK `file_objects_mime_type_check`, the
 * `records` bucket's allowed types and upload-policy.json `mimeTypes`).
 */
export type RecordFileMimeType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/heic'
  | 'image/heif'
  | 'image/gif'
  | 'application/msword'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/vnd.ms-excel'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type FileObjectRow = {
  id: string;
  company_id: string;
  vessel_id: string | null;
  bucket: string;
  storage_path: string;
  module_key: string;
  entity_type: string;
  entity_id: string;
  original_name: string;
  mime_type: RecordFileMimeType;
  size_bytes: number;
  sha256: string | null;
  width: number | null;
  height: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
  source: FileSource;
  removed_at: string | null;
  removed_by: string | null;
  removal_reason: string | null;
  legal_hold: boolean;
  created_at: string;
  updated_at: string;
};

export type RecordAttachmentRow = {
  id: string;
  file_id: string;
  company_id: string;
  vessel_id: string | null;
  envelope_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  section_key: string | null;
  caption: string | null;
  version_of: string | null;
  sort_order: number;
  added_by: string | null;
  added_at: string;
  removed_at: string | null;
  removed_by: string | null;
  removal_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type RecordLinkKind = 'related' | 'duplicate_of' | 'follow_up' | 'caused_by' | 'parent';

export type RecordLinkRow = {
  id: string;
  company_id: string;
  /** Denormalised from the `from` envelope by trigger (RLS reads through `record_readable`). */
  vessel_id: string | null;
  from_envelope_id: string;
  to_envelope_id: string | null;
  to_entity_type: string | null;
  to_entity_id: string | null;
  link_kind: RecordLinkKind;
  note: string | null;
  created_by: string | null;
  created_at: string;
  removed_at: string | null;
  removed_by: string | null;
  updated_at: string;
};

export type ExportKind = 'record_pdf' | 'register_pdf' | 'csv' | 'xlsx' | 'zip' | 'compliance_pack' | 'gdpr_subject' | 'ics';
export type ExportStatus = 'requested' | 'running' | 'ready' | 'failed' | 'cancelled' | 'expired' | 'purged';
export type ExportGeneratedBy = 'client' | 'server';

export type ExportJobRow = {
  id: string;
  company_id: string;
  vessel_id: string | null;
  requested_by: string;
  kind: ExportKind;
  generated_by: ExportGeneratedBy;
  source_key: string;
  params: Json;
  contains_personal_data: boolean;
  status: ExportStatus;
  storage_path: string | null;
  size_bytes: number | null;
  sha256: string | null;
  row_count: number | null;
  error_code: string | null;
  link_expires_at: string | null;
  purge_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** What every record RPC returns (spec §A.10 "RPC result envelope"). */
export type RecordRpcResult<T = Json> =
  | { ok: true; value: T; error?: undefined }
  | { ok: false; value?: undefined; error: { code: string; message: string } };

export type RecordsPendingTables = {
  record_kinds: PendingTable<RecordKindRow, 'key' | 'module_key' | 'label' | 'ref_prefix' | 'scope' | 'company_step' | 'edit_after_sign' | 'delete_rule'>;
  record_envelopes: PendingTable<RecordEnvelopeRow, 'company_id' | 'module_key' | 'kind_key' | 'reference'>;
  record_events: PendingTable<RecordEventRow, 'company_id' | 'module_key' | 'action' | 'party'>;
  record_snapshots: PendingTable<RecordSnapshotRow, 'envelope_id' | 'company_id' | 'seq' | 'reason' | 'payload' | 'sha256'>;
  record_signature_slots: PendingTable<RecordSignatureSlotRow, 'envelope_id' | 'company_id' | 'cycle' | 'slot_key' | 'label' | 'order_no' | 'party'>;
  record_signatures: PendingTable<RecordSignatureRow, 'id' | 'envelope_id' | 'company_id' | 'cycle' | 'party' | 'signer_name' | 'signer_kind' | 'method' | 'record_digest' | 'record_version' | 'integrity_hash'>;
  record_threads: PendingTable<RecordThreadRow, 'envelope_id' | 'company_id' | 'kind'>;
  record_thread_entries: PendingTable<RecordThreadEntryRow, 'thread_id' | 'envelope_id' | 'company_id' | 'entry_type' | 'party' | 'body'>;
  file_objects: PendingTable<FileObjectRow, 'company_id' | 'bucket' | 'storage_path' | 'module_key' | 'entity_type' | 'entity_id' | 'original_name' | 'mime_type' | 'size_bytes'>;
  record_attachments: PendingTable<RecordAttachmentRow, 'file_id' | 'company_id'>;
  record_links: PendingTable<RecordLinkRow, 'company_id' | 'from_envelope_id' | 'link_kind'>;
  export_jobs: PendingTable<ExportJobRow, 'company_id' | 'requested_by' | 'kind' | 'generated_by' | 'source_key'>;
};

export type RecordsPendingViews = {
  record_signature_slot_states: PendingView<RecordSignatureSlotStateRow>;
};

/** Visitor / contractor signing through the witnessed pad (`p_visitor`). */
export type SignatureVisitorInput = { name: string; company: string; capacity: string; kind?: 'visitor' | 'contractor' };

export type RecordsPendingFunctions = {
  record_open_envelope: {
    Args: { p_kind_key: string; p_vessel_id?: string; p_entity_id?: string; p_title?: string };
    Returns: RecordEnvelopeRow;
  };
  record_transition_decide: { Args: { p_state: Json; p_input: Json }; Returns: Json };
  record_transition: {
    Args: { p_envelope_id: string; p_action: Exclude<EnvelopeAction, 'vessel_sign'>; p_payload?: Json; p_expected_version?: number };
    Returns: Json;
  };
  record_sign_slot: {
    Args: {
      p_signature_id: string;
      p_slot_id: string;
      p_method: SignatureMethod;
      p_signer_profile_id?: string;
      p_visitor?: Json;
      p_on_behalf_of_office?: string;
      p_reason?: string;
      p_image_path?: string;
      p_expected_version?: number;
    };
    Returns: Json;
  };
  record_pass_slot: { Args: { p_slot_id: string; p_to_profile_id: string }; Returns: Json };
  record_cancel_pass: { Args: { p_slot_id: string }; Returns: Json };
  record_remove_signature: { Args: { p_signature_id: string; p_reason?: string }; Returns: Json };
  record_resign_slot: { Args: { p_signature_id: string; p_slot_id: string }; Returns: Json };
  record_post_thread_entry: {
    Args: {
      p_entry_id: string;
      p_envelope_id: string;
      p_thread_kind: ThreadKind;
      p_entry_type: Exclude<ThreadEntryType, 'system'>;
      p_body: string;
      p_follow_up_due?: string;
      p_request_due?: string;
      p_parent_id?: string;
      p_replaces_id?: string;
    };
    Returns: Json;
  };
  record_resolve_thread_request: {
    Args: { p_request_id: string; p_resolution: 'done' | 'cancelled' | 'change_date'; p_note?: string; p_new_due?: string };
    Returns: Json;
  };
  register_file_object: {
    Args: { p_bucket: string; p_path: string; p_original_name: string; p_mime_type: string; p_size_bytes: number; p_sha256?: string };
    Returns: FileObjectRow;
  };
  attach_record_file: {
    Args: { p_file_id: string; p_envelope_id?: string; p_section_key?: string; p_caption?: string; p_version_of?: string };
    Returns: RecordAttachmentRow;
  };
  remove_record_attachment: { Args: { p_attachment_id: string; p_reason?: string }; Returns: RecordAttachmentRow };
  link_records: {
    Args: { p_from_envelope_id: string; p_to_envelope_id?: string; p_to_entity_type?: string; p_to_entity_id?: string; p_link_kind?: RecordLinkKind; p_note?: string };
    Returns: RecordLinkRow;
  };
  unlink_records: { Args: { p_link_id: string }; Returns: RecordLinkRow };
  request_export: {
    Args: { p_kind: ExportKind; p_source_key: string; p_params?: Json; p_contains_personal_data?: boolean; p_vessel_id?: string };
    Returns: ExportJobRow;
  };
  log_client_export: {
    Args: { p_kind: ExportKind; p_source_key: string; p_params?: Json; p_contains_personal_data?: boolean; p_row_count?: number; p_vessel_id?: string };
    Returns: ExportJobRow;
  };
  cancel_export_job: { Args: { p_job_id: string }; Returns: ExportJobRow };
};
