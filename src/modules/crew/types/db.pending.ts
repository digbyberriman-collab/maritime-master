/**
 * Pending tables and RPCs of the crew module (X1; DECISIONS D-01; gap/00
 * D2). Each block mirrors one unapplied migration of block 06; the harness
 * contract phase (scripts/db/contract-map.d/crew.json) checks every column,
 * CHECK list and argument against the built schema.
 *
 * 20261124060100_crew_reference_positions.sql (X1-01): the global
 * reference tables (countries, languages, departments, contract types),
 * positions, aliases and position manning, and the positions RPCs. The
 * browser only reads the tables; every write is an RPC.
 *
 * 20261124060200_crew_vessel_list.sql (X1-02): crew_movements and
 * crew_transfers (the table only; its writers arrive with X1-11), and the
 * two list RPCs crew_vessel_list (the vessel crew list on a day, derived
 * status, invitation state) and crew_vessel_movements. The browser reads
 * through the RPCs; the tables are read-only for it as well.
 *
 * 20261124060300_crew_profile_details.sql (X1-03): crew_personal_details,
 * crew_languages and crew_assignment_terms (read through RLS: the people
 * who may see the person), the new next-of-kin phone columns (T-68), and
 * the profile RPCs (resolve, summary, the two saves, onboarding and the
 * duplicate check). Every write is an RPC.
 *
 * `CrewForeignPendingTables` is not this module's: the platform signature
 * store (SIG1, PR-X1-I) that the profile's signature card reads. It is not
 * in the contract map, because no build-out file defines it yet; the
 * platform's own pending file takes it over when its migration is written.
 *
 * Types only: each crew hook builds its client with
 * `pendingClient<CrewPendingTables, NoPending, CrewPendingFunctions>()`.
 *
 * D-01: until the file is applied these relations and functions do not
 * exist. Readers treat a missing relation or function (isMissingRelation)
 * as "not set up yet" (the positions drawer shows its not-set-up state,
 * the pickers fall back to free text); any other error is an error with
 * Retry. Never mock rows.
 */
import type { PendingColumns, PendingTable } from '@/integrations/supabase/pending';
import type { Json } from '@/integrations/supabase/types';
import type { AccessSetKey, LanguageProficiency, PositionScope, RankTier } from './domain';
import type { CrewPlacementKind, CrewStatus, CrewStatusDetail } from '../lib/crewStatus';

// ---------------------------------------------------------------- 060100 rows

export type RefCountryRow = {
  iso2: string;
  iso3: string;
  name: string;
  demonym: string | null;
  dial_code: string | null;
  flag_emoji: string | null;
  sort_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RefLanguageRow = {
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type DepartmentRow = {
  key: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ContractTypeRow = {
  id: string;
  company_id: string | null;
  key: string;
  label: string;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type PositionRow = {
  id: string;
  company_id: string | null;
  vessel_id: string | null;
  key: string;
  name: string;
  department_key: string;
  rank_tier: RankTier;
  default_access_set_key: AccessSetKey | null;
  stcw_capacity: string | null;
  sort_order: number;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PositionAliasRow = {
  id: string;
  company_id: string;
  alias_key: string;
  alias_label: string;
  position_id: string;
  source: 'backfill' | 'manual';
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PositionManningRow = {
  id: string;
  company_id: string;
  vessel_id: string;
  position_id: string;
  sort_order: number | null;
  is_listed: boolean;
  min_on_board: number;
  max_on_board: number | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** One row of crew_positions_for_vessel (RETURNS TABLE). */
export type CrewVesselPositionRpcRow = {
  position_id: string;
  scope: PositionScope;
  key: string;
  name: string;
  department_key: string;
  department_label: string;
  department_sort: number;
  rank_tier: RankTier;
  default_access_set_key: AccessSetKey | null;
  stcw_capacity: string | null;
  base_sort_order: number;
  sort_order: number;
  is_listed: boolean;
  min_on_board: number;
  max_on_board: number | null;
  holder_count: number;
};

/** One row of crew_vessel_unmatched_titles (RETURNS TABLE). */
export type CrewUnmatchedTitleRpcRow = {
  title: string;
  title_key: string;
  holder_count: number;
};

/** One element of crew_vessel_positions_save's p_rows. */
export type CrewPositionSaveRow = {
  position_id: string;
  sort_order: number | null;
  is_listed: boolean;
  min_on_board: number;
  max_on_board: number | null;
};

// ---------------------------------------------------------------- 060200 rows

export type CrewMovementKind = 'embark' | 'disembark' | 'transfer_out' | 'transfer_in';
export type CrewMovementSource = 'manual' | 'planner' | 'transfer' | 'toggle' | 'assignment';

export type CrewMovementRow = {
  id: string;
  company_id: string;
  vessel_id: string;
  profile_id: string;
  kind: CrewMovementKind;
  occurred_on: string;
  occurred_at: string | null;
  port: string | null;
  source: CrewMovementSource;
  source_id: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CrewTransferStatus = 'draft' | 'review' | 'pending_approval' | 'scheduled' | 'completed' | 'cancelled';

export type CrewTransferRow = {
  id: string;
  company_id: string;
  profile_id: string;
  user_id: string | null;
  from_vessel_id: string;
  to_vessel_id: string;
  from_assignment_id: string | null;
  to_assignment_id: string | null;
  from_position_id: string | null;
  to_position_id: string | null;
  same_role: boolean;
  sign_off_date: string;
  sign_on_date: string;
  status: CrewTransferStatus;
  requires_approval: boolean;
  review_items: Json;
  gaps_snapshot: Json | null;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  decline_reason: string | null;
  completed_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  compliant_on_destination_at: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** A user_invitations status as crew_vessel_list returns it (the stored status of the newest row). */
export type CrewInvitationStatus = 'pending' | 'sent' | 'send_failed' | 'accepted' | 'expired' | 'revoked';

/** One row of crew_vessel_list (RETURNS TABLE). */
export type CrewVesselListRpcRow = {
  profile_id: string;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  avatar_url: string | null;
  /** Only with vessel.crew.crew_profiles.view on the vessel (or the caller's own row). */
  email: string | null;
  position_id: string | null;
  position_name: string | null;
  position_text: string | null;
  department_key: string | null;
  department_label: string | null;
  rank_tier: RankTier | null;
  sort_order: number | null;
  assignment_id: string | null;
  placement_kind: CrewPlacementKind;
  join_date: string | null;
  leave_date: string | null;
  status: CrewStatus;
  status_detail: CrewStatusDetail | null;
  transfer_vessel_id: string | null;
  leave_code: string | null;
  travel_today: boolean;
  login_state: 'active' | 'pending_login' | 'disabled';
  account_status: string | null;
  invitation_id: string | null;
  invitation_status: CrewInvitationStatus | null;
  invitation_expires_at: string | null;
  invitation_last_sent_at: string | null;
  invitation_last_error_code: string | null;
  nationality: string | null;
  is_master_office: boolean;
};

/** One row of crew_vessel_movements (RETURNS TABLE). movement_id is null for an event derived from an assignment. */
export type CrewVesselMovementRpcRow = {
  movement_id: string | null;
  profile_id: string;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  position_text: string | null;
  kind: CrewMovementKind;
  occurred_on: string;
  occurred_at: string | null;
  port: string | null;
  source: CrewMovementSource;
  source_id: string | null;
  notes: string | null;
};

// ---------------------------------------------------------------- 060300 rows

export type CrewTitle = 'mr' | 'mrs' | 'ms' | 'miss' | 'dr' | 'capt' | 'mx';
export type CrewSex = 'male' | 'female' | 'other' | 'undisclosed';
export type CrewMaritalStatus =
  | 'single'
  | 'married'
  | 'living_with_partner'
  | 'divorced'
  | 'widowed'
  | 'separated'
  | 'domestic_partnership'
  | 'undisclosed';
export type CrewHasChildren = 'yes' | 'no' | 'undisclosed';
export type CrewLeaveMethod = 'days_per_year' | 'ratio' | 'none';
export type CrewEndReason =
  | 'contract_end'
  | 'resignation'
  | 'dismissal'
  | 'medical'
  | 'end_of_temporary_contract'
  | 'transfer_to_another_employer'
  | 'retirement'
  | 'transfer'
  | 'other';

export type CrewPersonalDetailsRow = {
  profile_id: string;
  company_id: string;
  crew_number: string | null;
  title: CrewTitle | null;
  middle_name: string | null;
  work_email: string | null;
  sex: CrewSex | null;
  date_of_birth: string | null;
  place_of_birth: string | null;
  nationality_code: string | null;
  dual_nationality_code: string | null;
  residency_country_code: string | null;
  place_of_embarkation: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  marital_status: CrewMaritalStatus | null;
  has_children: CrewHasChildren | null;
  biography: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string | null;
  repatriation_airport: string | null;
  phone_dial_code: string | null;
  phone_number: string | null;
  mobile_dial_code: string | null;
  mobile_number: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CrewLanguageRow = {
  id: string;
  company_id: string;
  profile_id: string;
  /** 1 = mother tongue, 2-4 further languages. */
  slot: number;
  language_code: string;
  /** Null for the mother tongue (slot 1), set for slots 2-4. */
  proficiency: LanguageProficiency | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CrewAssignmentTermsRow = {
  id: string;
  company_id: string;
  profile_id: string;
  vessel_id: string;
  /** Advisory link to the current crew_assignments row (D-X1-2). */
  assignment_id: string | null;
  position_id: string | null;
  department_key: string | null;
  start_date: string;
  date_joining_vessel: string | null;
  review_date: string | null;
  contract_type_key: string | null;
  leave_method: CrewLeaveMethod | null;
  leave_days_per_year: number | null;
  leave_ratio_on: number | null;
  leave_ratio_off: number | null;
  place_of_embarkation: string | null;
  end_date: string | null;
  end_reason: CrewEndReason | null;
  end_notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** New columns of the live crew_next_of_kin (T-68: dial code + national number). */
export type CrewNextOfKinNewColumns = {
  phone_dial_code: string | null;
  mobile_dial_code: string | null;
  mobile_number: string | null;
  country_code: string | null;
};

/** The tabs a profile can have (X1 spec §4), in the server's spelling. */
export type CrewProfileTabKey =
  | 'personal'
  | 'contact'
  | 'documents'
  | 'stcw'
  | 'qualifications'
  | 'training'
  | 'hours-of-rest'
  | 'employment'
  | 'medical'
  | 'activity';

/** The one row of crew_profile_summary (RETURNS TABLE). */
export type CrewProfileSummaryRpcRow = {
  profile_id: string;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  avatar_url: string | null;
  crew_number: string | null;
  position_id: string | null;
  position_name: string | null;
  position_text: string | null;
  department_key: string | null;
  department_label: string | null;
  rank_tier: RankTier | null;
  /** On this vessel's crew today (current, planned or pending placement). */
  on_vessel: boolean;
  placement_kind: CrewPlacementKind | null;
  assignment_id: string | null;
  join_date: string | null;
  leave_date: string | null;
  status: CrewStatus | null;
  status_detail: CrewStatusDetail | null;
  transfer_vessel_id: string | null;
  leave_code: string | null;
  login_state: 'active' | 'pending_login' | 'disabled';
  prev_profile_id: string | null;
  prev_name: string | null;
  next_profile_id: string | null;
  next_name: string | null;
  /** 1-based place in the vessel's rank order among the people the caller may see. */
  member_index: number | null;
  member_count: number | null;
  is_own: boolean;
  /** May change identity fields (names, birth, nationalities, crew number). */
  can_edit: boolean;
  /** May change self fields (contact, address, phones, languages, biography). */
  can_edit_self: boolean;
  tabs: string[];
};

/** One row of crew_find_duplicates (RETURNS TABLE). */
export type CrewDuplicateRpcRow = {
  profile_id: string;
  first_name: string | null;
  last_name: string | null;
  vessel_id: string | null;
  vessel_name: string | null;
  match_kind: 'email' | 'name_dob' | 'name';
};

/** One element of crew_languages_save's p_rows. */
export type CrewLanguageSaveRow = {
  slot: number;
  language_code: string;
  proficiency: LanguageProficiency | null;
};

// ---------------------------------------------------------------- the platform signature store (SIG1; not this module's)

/** user_signature_images (gap/08 SIG1, PR-X1-I): not written yet; the profile card reads it and stays hidden while it is missing. */
export type UserSignatureImageRow = {
  id: string;
  profile_id: string;
  storage_path: string;
  sha256: string;
  width: number | null;
  height: number | null;
  created_at: string;
  revoked_at: string | null;
};

export type CrewForeignPendingTables = {
  user_signature_images: PendingTable<UserSignatureImageRow, 'profile_id' | 'storage_path' | 'sha256'>;
};

// ---------------------------------------------------------------- pending shapes

export type CrewPendingTables = {
  ref_countries: PendingTable<RefCountryRow, 'iso2' | 'iso3' | 'name' | 'sort_name'>;
  ref_languages: PendingTable<RefLanguageRow, 'code' | 'name'>;
  departments: PendingTable<DepartmentRow, 'key' | 'label' | 'sort_order'>;
  contract_types: PendingTable<ContractTypeRow, 'key' | 'label'>;
  positions: PendingTable<PositionRow, 'key' | 'name' | 'department_key' | 'rank_tier'>;
  position_aliases: PendingTable<PositionAliasRow, 'company_id' | 'alias_key' | 'alias_label' | 'position_id'>;
  position_manning: PendingTable<PositionManningRow, 'company_id' | 'vessel_id' | 'position_id'>;
  crew_movements: PendingTable<CrewMovementRow, 'company_id' | 'vessel_id' | 'profile_id' | 'kind' | 'occurred_on'>;
  crew_transfers: PendingTable<
    CrewTransferRow,
    'company_id' | 'profile_id' | 'from_vessel_id' | 'to_vessel_id' | 'sign_off_date' | 'sign_on_date'
  >;
  crew_personal_details: PendingTable<CrewPersonalDetailsRow, 'profile_id' | 'company_id'>;
  crew_languages: PendingTable<CrewLanguageRow, 'company_id' | 'profile_id' | 'slot' | 'language_code'>;
  crew_assignment_terms: PendingTable<CrewAssignmentTermsRow, 'company_id' | 'profile_id' | 'vessel_id' | 'start_date'>;
};

/** New columns of live tables (D-133). */
export type CrewPendingColumns = {
  crew_next_of_kin: PendingColumns<CrewNextOfKinNewColumns>;
};

export type CrewPendingFunctions = {
  crew_positions_for_vessel: { Args: { p_vessel_id: string }; Returns: CrewVesselPositionRpcRow[] };
  crew_vessel_unmatched_titles: { Args: { p_vessel_id: string }; Returns: CrewUnmatchedTitleRpcRow[] };
  crew_position_create: {
    Args: {
      p_vessel_id: string;
      p_name: string;
      p_department_key: string;
      p_rank_tier: RankTier;
      p_default_access_set_key?: AccessSetKey;
      p_vessel_only?: boolean;
    };
    Returns: PositionRow;
  };
  crew_vessel_positions_save: { Args: { p_vessel_id: string; p_rows: Json }; Returns: number };
  crew_position_alias_set: { Args: { p_vessel_id: string; p_alias: string; p_position_id: string }; Returns: PositionAliasRow };
  crew_vessel_list: { Args: { p_vessel_id: string; p_on?: string }; Returns: CrewVesselListRpcRow[] };
  crew_vessel_movements: { Args: { p_vessel_id: string; p_from: string; p_to: string }; Returns: CrewVesselMovementRpcRow[] };
  crew_profile_resolve: { Args: { p_vessel_id: string; p_ref: string }; Returns: string };
  crew_profile_summary: { Args: { p_profile_id: string; p_vessel_id: string }; Returns: CrewProfileSummaryRpcRow[] };
  crew_personal_details_save: { Args: { p_profile_id: string; p_payload: Json }; Returns: CrewPersonalDetailsRow };
  crew_languages_save: { Args: { p_profile_id: string; p_rows: Json }; Returns: CrewLanguageRow[] };
  crew_onboarding_save: {
    Args: { p_profile_id: string; p_vessel_id: string; p_terms: Json; p_personal?: Json };
    Returns: CrewAssignmentTermsRow;
  };
  crew_find_duplicates: {
    Args: { p_vessel_id: string; p_email: string; p_first: string; p_last: string; p_dob?: string };
    Returns: CrewDuplicateRpcRow[];
  };
};
