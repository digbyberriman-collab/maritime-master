/**
 * The fleet expiry engine and fleet access helpers (gap/02 X2, X3; DECISIONS
 * C5, D-31; X5 spec §2 X5-01A; `20261124040000_fleet_expiry_engine.sql`).
 *
 * Written, not applied (D-01). Every read goes through the pending client;
 * a missing table or RPC (`isMissingRelation`) means "not set up yet" and
 * the page shows its not-set-up state; any other error is an error with
 * Retry. Nothing here is ever replaced by mock rows.
 *
 * - `expiry_window_rules`: the company's warning windows (read by active
 *   members; written only through `set_expiry_window_rule` /
 *   `clear_expiry_window_rule`).
 * - `fleet_expiry_items` / `fleet_expiry_summary`: the caller's fleet expiry
 *   list and its counts, over the counted vessels they reach (NULL vessel
 *   ids) or explicit, reach-checked ids (42501 `vessel_out_of_reach`).
 * - `fleet_ops_can`: the server side of the fleet area gates
 *   (../lib/fleetOpsAccess.ts mirrors its rules).
 * - The pure engine (`expiry_bucket`, `expiry_days_remaining`,
 *   `expiry_endorsement_state`, `expiry_default_window`, `expiry_window_for`)
 *   mirrors `@/lib/records/expiry`, ../lib/endorsement.ts and
 *   ../lib/expiryWindows.ts; the client computes the same answers locally.
 *
 * The item types and the `expiry_bucket` / `expiry_window_for` signatures
 * are frozen at the X5-01A merge (X1 builds on them).
 *
 * The crew medical status (gap/02 M1, W8; gap/04 C61; D-X5-08; X5-08,
 * `20261124040700_fleet_medical_status.sql`), written, not applied:
 *
 * - `fleet_medical_settings`: the company's ENG1 types, accepted
 *   equivalents and required vaccines (read by its fitness and medical
 *   viewers; no row = the defaults; written only through
 *   `fleet_medical_settings_save`, medical admins with fleet reach).
 * - `fleet_crew_medical_status`: one row per current crew member of the
 *   vessels the caller may read medical fitness on, most severe first, with
 *   the reasons (../lib/medicalStatus.ts mirrors the rules). Dates and
 *   states only; the condition / allergy flags are NULL unless the caller is
 *   a clinical viewer on that vessel or the person shares safety flags.
 */
import type { PendingTable } from '@/integrations/supabase/pending';
import type { ExpiryBucket } from '@/lib/records/expiry';
import type { ExpiryItemType } from '../lib/expiryWindows';
import type { EndorsementState } from '../lib/endorsement';
import type { FleetOpsArea, FleetOpsLevel } from '../lib/fleetOpsAccess';
import type { Eng1State, MedicalReason, MedicalStatus, OccHealthState } from '../lib/medicalStatus';
import type { Json } from '@/integrations/supabase/types';

export type ExpiryWindowRuleRow = {
  id: string;
  company_id: string;
  item_type: ExpiryItemType;
  certificate_type_id: string | null;
  warn_days: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Where an expiry item's deep link points (`link_rel` is relative to that scope's root). */
export type ExpiryLinkScope = 'vessel' | 'fleet' | 'workspace';

/** One row of `fleet_expiry_items` (most urgent first; `total_count` = every match). */
export type FleetExpiryItemRow = {
  source_key: string;
  item_type: string;
  record_id: string;
  vessel_id: string | null;
  vessel_name: string | null;
  vessel_code: string | null;
  profile_id: string | null;
  person_name: string | null;
  label: string;
  detail: string | null;
  expires_on: string | null;
  days_remaining: number | null;
  bucket: ExpiryBucket;
  window_days: number;
  endorsement_due_on: string | null;
  endorsement_state: EndorsementState | null;
  alerts_muted: boolean;
  link_scope: ExpiryLinkScope;
  link_rel: string;
  total_count: number;
};

/** One row of `fleet_expiry_summary` (`vessel_id` only with `p_by_vessel`; muted items only in `muted_count`). */
export type FleetExpirySummaryRow = {
  source_key: string;
  item_type: string;
  vessel_id: string | null;
  bucket: ExpiryBucket;
  endorsement_state: EndorsementState | null;
  item_count: number;
  muted_count: number;
};

/** One row of `fleet_medical_settings` (one per company). */
export type FleetMedicalSettingsRow = {
  company_id: string;
  eng1_assessment_types: string[];
  eng1_equivalent_types: string[];
  required_vaccines: string[];
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** What `fleet_medical_settings_save` takes (as jsonb): any of the three lists, and the `updated_at` read (null = no row yet). */
export type FleetMedicalSettingsPayload = {
  eng1_assessment_types?: string[];
  eng1_equivalent_types?: string[];
  required_vaccines?: string[];
  expected_updated_at?: string | null;
};

/** One row of `fleet_crew_medical_status` (most severe first). */
export type FleetCrewMedicalStatusRow = {
  profile_id: string;
  person_name: string;
  vessel_id: string;
  vessel_name: string;
  vessel_code: string | null;
  position: string | null;
  department: string | null;
  is_planned: boolean;
  join_date: string | null;
  has_health_record: boolean;
  eng1_state: Eng1State;
  eng1_expires_on: string | null;
  eng1_is_equivalent: boolean | null;
  /** NULL without a Health record (not known). */
  vaccines_valid: number | null;
  vaccines_expired: number | null;
  vaccines_missing: number | null;
  boosters_due: number | null;
  rest_tracked: boolean;
  /** NULL when rest is not tracked (no login, or Hours of Rest off on the vessel). */
  rest_noncompliant_30d: number | null;
  serious_rest_breach_30d: number | null;
  /** NULL without a Health record. */
  occ_health_state: OccHealthState | null;
  occ_health_due_on: string | null;
  /** NULL when the caller may not see the flag. */
  condition_flag: boolean | null;
  allergy_flag: boolean | null;
  status: MedicalStatus;
  reasons: MedicalReason[];
};

export type FleetPendingTables = {
  expiry_window_rules: PendingTable<ExpiryWindowRuleRow, 'company_id' | 'item_type' | 'warn_days'>;
  fleet_medical_settings: PendingTable<FleetMedicalSettingsRow, 'company_id'>;
};

export type FleetPendingFunctions = {
  expiry_days_remaining: { Args: { p_expires_on: string | null; p_today: string | null }; Returns: number | null };
  expiry_bucket: {
    Args: { p_expires_on: string | null; p_window_days: number | null; p_today: string | null; p_no_expiry?: boolean };
    Returns: ExpiryBucket;
  };
  expiry_endorsement_state: {
    Args: { p_due_on: string | null; p_today: string | null; p_window_days?: number | null };
    Returns: EndorsementState | null;
  };
  expiry_default_window: { Args: { p_item_type: string | null }; Returns: number };
  expiry_window_for: {
    Args: { p_company_id: string; p_item_type: ExpiryItemType | null; p_certificate_type_id?: string | null };
    Returns: number;
  };
  set_expiry_window_rule: {
    Args: { p_item_type: ExpiryItemType; p_certificate_type_id: string | null; p_warn_days: number };
    Returns: ExpiryWindowRuleRow;
  };
  clear_expiry_window_rule: { Args: { p_rule_id: string }; Returns: void };
  fleet_ops_can: {
    Args: { _company_id: string; _vessel_id: string | null; _area: FleetOpsArea; _level: FleetOpsLevel };
    Returns: boolean;
  };
  fleet_expiry_items: {
    Args: {
      p_vessel_ids?: string[] | null;
      p_sources?: string[] | null;
      p_buckets?: ExpiryBucket[] | null;
      p_search?: string | null;
      p_include_unassigned?: boolean;
      p_limit?: number;
      p_offset?: number;
      p_today?: string;
    };
    Returns: FleetExpiryItemRow[];
  };
  fleet_expiry_summary: {
    Args: { p_vessel_ids?: string[] | null; p_by_vessel?: boolean; p_today?: string };
    Returns: FleetExpirySummaryRow[];
  };
  fleet_medical_settings_save: {
    Args: { p_settings: Json };
    Returns: FleetMedicalSettingsRow;
  };
  fleet_crew_medical_status: {
    Args: { p_vessel_ids?: string[] | null; p_status?: MedicalStatus[] | null; p_today?: string };
    Returns: FleetCrewMedicalStatusRow[];
  };
};
