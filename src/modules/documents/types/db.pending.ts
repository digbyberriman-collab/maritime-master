/**
 * The fleet document library's tables and RPCs (gap/02 FD1, FD2, FD4,
 * FD5, FD10, W1; X5 spec §2 X5-04A, D-X5-03;
 * `20261124040300_fleet_documents_library.sql`).
 *
 * Written, not applied (D-01). Every read and write goes through the
 * pending client (../lib/fleetDocumentsDb.ts): a missing table or RPC
 * (`isMissingRelation`) means "Fleet documents are not set up yet" and the
 * page says so; any other error is an error with Retry. Nothing here is
 * ever replaced by sample rows.
 *
 * - Read through RLS: sections and types (active members of the company);
 *   documents, versions, targets and events (fleet reach plus the
 *   documents view rule; drafts need edit; published documents and their
 *   published version also for people of a targeted vessel).
 * - Written only through the definers below. Each returns the row it
 *   wrote, which the hooks check before they report success; refusals are
 *   22023 with a stable snake_case message (lib/fleetDocumentMachine.ts
 *   maps them to sentences), 42501 not_permitted / vessel_out_of_reach,
 *   P0002 *_not_found.
 *
 * The live `documents` register (`/fleet/documents/register`) is not
 * touched and keeps its generated types.
 *
 * Acknowledgements (X5-05A; gap/02 FD6-FD9, W1;
 * `20261124040400_fleet_documents_acknowledgements.sql`): the stored
 * acknowledgements, signer rules and reminders (read through RLS: documents
 * viewers with fleet reach, the vessel's Master, the person's HoD, the
 * person), and the RPCs over the one state core (`fleet_document_ack_rows`,
 * mirrored by ../lib/ackState.ts): the vessel's documents with the caller's
 * own state, the status rows, the counts, the caller's pending list, and
 * the writes (acknowledge, witnessed, remind, signer rule). Refusals are
 * 22023 with a stable message (../lib/ackState.ts maps them), 42501
 * not_permitted / vessel_out_of_reach, P0002 *_not_found.
 */
import type { Json } from '@/integrations/supabase/types';
import type { PendingTable } from '@/integrations/supabase/pending';

export type FleetDocumentStatus = 'draft' | 'published' | 'withdrawn';
export type FleetDocumentTargetMode = 'all_including_future' | 'selected';
export type FleetDocumentVersionKind = 'major' | 'minor';
export type FleetDocumentVersionState = 'draft' | 'published' | 'superseded';
export type FleetDocumentEventAction =
  | 'section_created'
  | 'section_renamed'
  | 'sections_reordered'
  | 'section_deleted'
  | 'type_created'
  | 'type_updated'
  | 'type_deleted'
  | 'document_created'
  | 'details_updated'
  | 'version_added'
  | 'version_replaced'
  | 'targets_set'
  | 'published'
  | 'withdrawn'
  | 'draft_deleted';

export type FleetDocumentSectionRow = {
  id: string;
  company_id: string;
  name: string;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FleetDocumentTypeRow = {
  id: string;
  company_id: string;
  section_id: string;
  name: string;
  sort_order: number;
  ack_required_default: boolean;
  ack_due_days_default: number;
  version_kind_default: FleetDocumentVersionKind;
  hide_when_empty: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FleetDocumentRow = {
  id: string;
  company_id: string;
  type_id: string;
  title: string;
  description: string | null;
  status: FleetDocumentStatus;
  target_mode: FleetDocumentTargetMode;
  ack_required: boolean;
  ack_due_days: number;
  current_version_id: string | null;
  published_at: string | null;
  published_by: string | null;
  withdrawn_at: string | null;
  withdrawn_by: string | null;
  withdrawn_reason: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FleetDocumentVersionRow = {
  id: string;
  company_id: string;
  document_id: string;
  version_no: number;
  version_label: string;
  version_kind: FleetDocumentVersionKind;
  /** Date-only `yyyy-MM-dd`. */
  effective_date: string;
  file_object_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  state: FleetDocumentVersionState;
  change_summary: string | null;
  published_at: string | null;
  published_by: string | null;
  superseded_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FleetDocumentVesselTargetRow = {
  document_id: string;
  vessel_id: string;
  company_id: string;
  added_by: string | null;
  added_at: string;
  created_at: string;
  updated_at: string;
};

export type FleetDocumentEventRow = {
  id: string;
  company_id: string;
  document_id: string | null;
  version_id: string | null;
  vessel_id: string | null;
  actor_user_id: string | null;
  action: FleetDocumentEventAction;
  from_status: FleetDocumentStatus | null;
  to_status: FleetDocumentStatus | null;
  comment: string | null;
  payload: Json;
  created_at: string;
};

/** One person's acknowledgement state (`fleet_document_ack_rows`; ../lib/ackState.ts). */
export type FleetDocumentAckState = 'pending' | 'overdue' | 'blocked' | 'acknowledged' | 'not_required';
/** Why someone cannot sign, first reason first. */
export type FleetDocumentAckBlockedReason = 'no_login' | 'suspended' | 'not_in_signer_set';
export type FleetDocumentAckMethod = 'self' | 'witnessed' | 'carried_forward';
export type FleetDocumentSignerRuleKind = 'all_crew_with_login' | 'hod_and_above' | 'positions' | 'named_people';
export type FleetDocumentReminderKind = 'manual' | 'due_soon' | 'overdue' | 'digest';

export type FleetDocumentAcknowledgementRow = {
  id: string;
  company_id: string;
  document_id: string;
  version_id: string;
  vessel_id: string;
  profile_id: string;
  user_id: string | null;
  method: FleetDocumentAckMethod;
  witnessed_by_profile_id: string | null;
  carried_from_version_id: string | null;
  recorded_by: string | null;
  acknowledged_at: string;
  request_meta: Json;
  created_at: string;
};

export type FleetDocumentSignerRuleRow = {
  id: string;
  company_id: string;
  vessel_id: string;
  type_id: string | null;
  rule: FleetDocumentSignerRuleKind;
  positions: string[];
  profile_ids: string[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FleetDocumentReminderRow = {
  id: string;
  company_id: string;
  document_id: string;
  vessel_id: string | null;
  profile_id: string | null;
  kind: FleetDocumentReminderKind;
  sent_by: string | null;
  sent_at: string;
  recipient_count: number;
  skipped_count: number;
  recipient_profile_ids: string[];
  created_at: string;
};

/**
 * One document published to the vessel (`fleet_document_vessel_documents`),
 * with its published version and the caller's own state there. `state` is
 * null when the caller is not on the vessel's crew (`caller_on_crew`) or the
 * document needs no acknowledgement (`ack_required` false).
 */
export type FleetDocumentVesselDocumentRow = {
  document_id: string;
  section_id: string;
  section_name: string;
  section_order: number;
  type_id: string;
  type_name: string;
  type_order: number;
  title: string;
  description: string | null;
  ack_required: boolean;
  ack_due_days: number;
  version_id: string;
  version_no: number;
  version_label: string;
  version_kind: FleetDocumentVersionKind;
  /** Date-only `yyyy-MM-dd`. */
  effective_date: string;
  published_at: string;
  change_summary: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  caller_on_crew: boolean;
  state: FleetDocumentAckState | null;
  due_at: string | null;
  blocked_reason: FleetDocumentAckBlockedReason | null;
  acknowledged_at: string | null;
  method: FleetDocumentAckMethod | null;
};

/** One person x current version x vessel (`fleet_document_ack_status`), over the caller's readership. */
export type FleetDocumentAckStatusRow = {
  document_id: string;
  version_id: string;
  vessel_id: string;
  profile_id: string;
  person_name: string | null;
  position: string | null;
  department: string | null;
  has_login: boolean;
  /** False for history rows (someone who left, a vessel no longer targeted). */
  on_crew: boolean;
  is_planned: boolean;
  join_date: string | null;
  state: FleetDocumentAckState;
  due_at: string | null;
  blocked_reason: FleetDocumentAckBlockedReason | null;
  acknowledged_at: string | null;
  method: FleetDocumentAckMethod | null;
};

/** Counts per document x vessel (`fleet_document_summary`); `can_sign` = pending + overdue. */
export type FleetDocumentSummaryRow = {
  document_id: string;
  version_id: string;
  vessel_id: string;
  acknowledged: number;
  pending: number;
  overdue: number;
  blocked: number;
  can_sign: number;
};

/** One of the caller's own outstanding acknowledgements (`fleet_document_my_pending`). */
export type FleetDocumentMyPendingRow = {
  document_id: string;
  version_id: string;
  vessel_id: string;
  vessel_name: string;
  vessel_code: string | null;
  title: string;
  section: string;
  type_name: string;
  version_label: string;
  due_at: string | null;
  state: 'pending' | 'overdue';
};

export type DocumentsPendingTables = {
  fleet_document_sections: PendingTable<FleetDocumentSectionRow>;
  fleet_document_types: PendingTable<FleetDocumentTypeRow>;
  fleet_documents: PendingTable<FleetDocumentRow>;
  fleet_document_versions: PendingTable<FleetDocumentVersionRow>;
  fleet_document_vessel_targets: PendingTable<FleetDocumentVesselTargetRow>;
  fleet_document_events: PendingTable<FleetDocumentEventRow>;
  fleet_document_acknowledgements: PendingTable<FleetDocumentAcknowledgementRow>;
  fleet_document_signer_rules: PendingTable<FleetDocumentSignerRuleRow>;
  fleet_document_reminders: PendingTable<FleetDocumentReminderRow>;
};

export type DocumentsPendingFunctions = {
  fleet_document_section_save: {
    Args: { p_id: string | null; p_name: string };
    Returns: FleetDocumentSectionRow;
  };
  fleet_document_sections_reorder: {
    Args: { p_ids: string[] };
    Returns: FleetDocumentSectionRow[];
  };
  fleet_document_section_delete: {
    Args: { p_id: string };
    Returns: FleetDocumentSectionRow;
  };
  fleet_document_type_save: {
    Args: {
      p_id: string | null;
      p_section_id: string | null;
      p_name: string | null;
      p_ack_required_default?: boolean | null;
      p_ack_due_days_default?: number | null;
      p_version_kind_default?: FleetDocumentVersionKind | null;
      p_hide_when_empty?: boolean | null;
    };
    Returns: FleetDocumentTypeRow;
  };
  fleet_document_type_delete: {
    Args: { p_id: string };
    Returns: FleetDocumentTypeRow;
  };
  fleet_document_create: {
    Args: {
      p_type_id: string;
      p_title: string;
      p_description?: string | null;
      p_ack_required?: boolean | null;
      p_ack_due_days?: number | null;
    };
    Returns: FleetDocumentRow;
  };
  fleet_document_update: {
    Args: {
      p_document_id: string;
      p_expected_updated_at: string;
      p_type_id?: string | null;
      p_title?: string | null;
      p_description?: string | null;
      p_ack_required?: boolean | null;
      p_ack_due_days?: number | null;
    };
    Returns: FleetDocumentRow;
  };
  fleet_document_add_version: {
    Args: {
      p_document_id: string;
      p_file_object_id: string;
      p_version_label?: string | null;
      p_version_kind?: FleetDocumentVersionKind | null;
      p_effective_date?: string | null;
      p_change_summary?: string | null;
    };
    Returns: FleetDocumentVersionRow;
  };
  fleet_document_set_targets: {
    Args: { p_document_id: string; p_target_mode: FleetDocumentTargetMode; p_vessel_ids?: string[] | null };
    Returns: FleetDocumentRow;
  };
  fleet_document_publish: {
    Args: { p_document_id: string; p_version_id: string; p_expected_updated_at: string };
    Returns: FleetDocumentRow;
  };
  fleet_document_withdraw: {
    Args: { p_document_id: string; p_reason: string };
    Returns: FleetDocumentRow;
  };
  fleet_document_delete_draft: {
    Args: { p_document_id: string };
    Returns: FleetDocumentRow;
  };
  // ─── acknowledgements (20261124040400) ───
  fleet_document_vessel_documents: {
    Args: { p_vessel_id: string };
    Returns: FleetDocumentVesselDocumentRow[];
  };
  fleet_document_ack_status: {
    Args: { p_document_id?: string | null; p_vessel_ids?: string[] | null };
    Returns: FleetDocumentAckStatusRow[];
  };
  fleet_document_summary: {
    Args: { p_vessel_ids?: string[] | null };
    Returns: FleetDocumentSummaryRow[];
  };
  fleet_document_my_pending: {
    Args: { p_vessel_id?: string | null };
    Returns: FleetDocumentMyPendingRow[];
  };
  fleet_document_acknowledge: {
    Args: { p_version_id: string; p_vessel_id: string };
    Returns: FleetDocumentAcknowledgementRow;
  };
  fleet_document_acknowledge_witnessed: {
    Args: { p_version_id: string; p_vessel_id: string; p_profile_id: string };
    Returns: FleetDocumentAcknowledgementRow;
  };
  /** `{ reminder_id: string | null, sent, skipped, failed, vessels }`. */
  fleet_document_remind: {
    Args: { p_document_id: string; p_vessel_id?: string | null; p_profile_id?: string | null };
    Returns: Json;
  };
  /** A NULL rule removes the rule; the answer is the removed rule (all fields null when there was none). */
  fleet_document_set_signer_rule: {
    Args: {
      p_vessel_id: string;
      p_type_id: string | null;
      p_rule: FleetDocumentSignerRuleKind | null;
      p_positions?: string[] | null;
      p_profile_ids?: string[] | null;
    };
    Returns: FleetDocumentSignerRuleRow;
  };
};
