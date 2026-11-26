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

// ---------------------------------------------------------------- pending shapes

export type CrewPendingTables = {
  ref_countries: PendingTable<RefCountryRow, 'iso2' | 'iso3' | 'name' | 'sort_name'>;
  ref_languages: PendingTable<RefLanguageRow, 'code' | 'name'>;
  departments: PendingTable<DepartmentRow, 'key' | 'label' | 'sort_order'>;
  contract_types: PendingTable<ContractTypeRow, 'key' | 'label'>;
  positions: PendingTable<PositionRow, 'key' | 'name' | 'department_key' | 'rank_tier'>;
  position_aliases: PendingTable<PositionAliasRow, 'company_id' | 'alias_key' | 'alias_label' | 'position_id'>;
  position_manning: PendingTable<PositionManningRow, 'company_id' | 'vessel_id' | 'position_id'>;
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
};
