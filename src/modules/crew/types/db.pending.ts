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
 * Types only: each crew hook builds its client with
 * `pendingClient<CrewPendingTables, NoPending, CrewPendingFunctions>()`.
 *
 * D-01: until the file is applied these relations and functions do not
 * exist. Readers treat a missing relation or function (isMissingRelation)
 * as "not set up yet" (the positions drawer shows its not-set-up state,
 * the pickers fall back to free text); any other error is an error with
 * Retry. Never mock rows.
 */
import type { PendingTable } from '@/integrations/supabase/pending';
import type { Json } from '@/integrations/supabase/types';
import type { AccessSetKey, PositionScope, RankTier } from './domain';
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
};
