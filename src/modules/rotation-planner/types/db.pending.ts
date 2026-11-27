/**
 * Pending tables, columns and RPCs of the planner (X1; DECISIONS D-01;
 * gap/00 D2). Each block mirrors one unapplied migration of block 06; the
 * harness contract phase (scripts/db/contract-map.json) checks every
 * column, CHECK list and argument against the built schema.
 *
 * 20261124060900_crew_planner_periods.sql (X1-09): the leave types (one
 * STORM list for the dialog and the legend, read by every active user), the
 * periods of a leave request and the vessel's leave approval step, the new
 * columns of the one period store (frp_rotation_assignments: person, leave
 * type, end unknown, request, rotation plan, approval, sick on board), of
 * the day codes (crew_leave_entries: the period that wrote a code and the
 * code it replaced) and of the leave requests (the person's profile), and
 * the planner RPCs: the vessel's periods, period upsert and delete, Add
 * leave, the crew's own request, the decision, the leave settings, the
 * On/Off toggle and manning by day. Every write is an RPC; the guards
 * refuse a signed-in direct write of the status, type and approval columns.
 *
 * 20261124061200_crew_import_tenancy.sql (X1-13, D-181, D-X1-17): the
 * company of each staged crew row and imported vessel (crew_import,
 * vessels_import: read by planner viewers of that company only; a row
 * nobody can attribute is the service role's) and crew_import_stage, the
 * browser's only staging write: one outcome per row (staged, or refused
 * with a reason and the field at fault). The redefined live
 * sync_crew_import_to_profiles and the crew_import_active view keep their
 * generated types.
 *
 * Types only: the planner hooks build their client with
 * `pendingClient<PlannerPendingTables, NoPending, PlannerPendingFunctions, PlannerPendingColumns>()`.
 *
 * D-01: until the file is applied these relations, columns and functions do
 * not exist. The hooks treat a missing one as "not set up" (the planner keeps
 * its legacy behaviour, X1-09B); any other error is thrown. Never mock rows.
 */
import type { PendingColumns, PendingTable } from '@/integrations/supabase/pending';
import type { Json, Tables } from '@/integrations/supabase/types';
import type { LeaveBalanceEffect, LeaveDayCode, LeavePolicyFlag, LeaveToneKey } from '../lib/leaveTypes';
import type { ManningBand } from '../lib/manning';
import type { LeaveDecision, LeaveHodStep } from '../lib/periods';

// ---------------------------------------------------------------- 060900 rows

export type LeaveTypeRow = {
  key: string;
  label: string;
  day_code: LeaveDayCode;
  tone_key: LeaveToneKey;
  balance_effect: LeaveBalanceEffect;
  policy_flag: LeavePolicyFlag | null;
  counts_on_board: boolean;
  is_leave: boolean;
  needs_approval: boolean;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CrewLeaveRequestPeriodRow = {
  id: string;
  company_id: string;
  request_id: string;
  leave_type_key: string;
  start_date: string;
  end_date: string | null;
  end_unknown: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CrewLeaveSettingsRow = {
  vessel_id: string;
  company_id: string;
  hod_step: LeaveHodStep;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** New columns of the period store (frp_rotation_assignments). */
export type FrpRotationAssignmentNewColumns = {
  profile_id: string | null;
  leave_type_key: string | null;
  end_unknown: boolean;
  request_id: string | null;
  rotation_plan_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  is_sick_on_board: boolean;
};

/** New columns of the day codes (crew_leave_entries): the period that wrote the code and the code it replaced. */
export type CrewLeaveEntryNewColumns = {
  source_period_id: string | null;
  replaced_code: LeaveDayCode | null;
};

/** New column of the leave requests: the person's profile. */
export type CrewLeaveRequestNewColumns = {
  profile_id: string | null;
};

/** A planner period as the store holds it (the generated row and the new columns). */
export type PlannerPeriodDbRow = Tables<'frp_rotation_assignments'> & FrpRotationAssignmentNewColumns;

/** A leave request row with its new column. */
export type CrewLeaveRequestDbRow = Tables<'crew_leave_requests'> & CrewLeaveRequestNewColumns;

/** One period of planner_vessel_periods (the timeline's read). */
export type PlannerVesselPeriodRpcRow = {
  id: string;
  vessel_id: string | null;
  profile_id: string | null;
  crew_user_id: string | null;
  crew_name_raw: string | null;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  leave_type_key: string | null;
  status: string;
  start_date: string;
  end_date: string;
  end_unknown: boolean;
  /** The day before the next period for an end-unknown period; null while none follows. */
  effective_end: string | null;
  request_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  is_sick_on_board: boolean;
  notes: string | null;
  version: number;
  updated_at: string;
};

/** One row of vessel_manning_by_day (parseManningRows reads it). */
export type VesselManningByDayRpcRow = {
  day: string;
  position_id: string | null;
  position_key: string | null;
  position_name: string | null;
  department_key: string | null;
  sort_order: number | null;
  aboard: number;
  qualified: number;
  min_on_board: number;
  max_on_board: number | null;
  short_by: number;
  band: ManningBand;
};

/** planner_add_leave's one row: the request (null for approved leave of a person without a login), its status, the periods written. */
export type PlannerAddLeaveRpcRow = {
  request_id: string | null;
  status: 'approved' | 'pending';
  period_ids: string[];
};

/** crew_toggle_onboard's one row. */
export type CrewToggleOnboardRpcRow = {
  direction: 'off' | 'on';
  period_id: string | null;
  movement_id: string | null;
};

/** One period of a request or Add leave, as p_periods carries it (snake case, date-only strings). */
export type PlannerPeriodPayload = {
  leave_type_key: string;
  start_date: string;
  end_date: string | null;
  end_unknown: boolean;
};

// ---------------------------------------------------------------- 061200 rows

/** The new column of the staging tables (crew_import, vessels_import): NULL when no single company could be attributed. */
export type CrewImportTenancyColumns = {
  company_id: string | null;
};

/** What crew_import_stage did with one row. */
export type CrewImportStageOutcome = 'staged' | 'refused';

/** Why: created / updated for a staged row, the refusal otherwise (src/modules/rotation-planner/hooks/useCrewImportStage.ts words them). */
export type CrewImportStageReason =
  | 'created'
  | 'updated'
  | 'not_an_object'
  | 'key_missing'
  | 'key_invalid'
  | 'duplicate_in_batch'
  | 'invalid_value'
  | 'field_too_long'
  | 'invalid_email'
  | 'invalid_crew_id'
  | 'invalid_date_of_birth'
  | 'name_missing'
  | 'key_in_use'
  | 'archived';

/** One row of crew_import_stage's answer, in the order of p_rows (row_index from 0). */
export type CrewImportStageRpcRow = {
  row_index: number;
  /** The trimmed staging key (airtable_id); null when the row had none. */
  staging_key: string | null;
  outcome: CrewImportStageOutcome;
  reason: string | null;
  /** The field at fault for a refusal that concerns one field. */
  field: string | null;
};

/**
 * One staged crew row as p_rows carries it. Only these fields are read; a
 * field left out keeps its stored value on an existing row; '' and null
 * store NULL. date_of_birth is a date-only string (YYYY-MM-DD).
 */
export type CrewImportStageRowPayload = {
  airtable_id: string;
  crew_id?: number | null;
  vessel?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  casual_name?: string | null;
  full_legal_name?: string | null;
  preferred_name?: string | null;
  personal_email?: string | null;
  work_email?: string | null;
  cellular_phone?: string | null;
  secondary_phone?: string | null;
  date_of_birth?: string | null;
  nationality?: string | null;
  role?: string | null;
  department?: string | null;
  repatriation?: string | null;
};

// ---------------------------------------------------------------- pending shapes

export type PlannerPendingTables = {
  leave_types: PendingTable<LeaveTypeRow, 'key' | 'label' | 'day_code' | 'tone_key' | 'balance_effect' | 'sort_order'>;
  crew_leave_request_periods: PendingTable<CrewLeaveRequestPeriodRow, 'company_id' | 'request_id' | 'leave_type_key' | 'start_date'>;
  crew_leave_settings: PendingTable<CrewLeaveSettingsRow, 'vessel_id' | 'company_id'>;
};

/** New columns of live tables (D-133). */
export type PlannerPendingColumns = {
  frp_rotation_assignments: PendingColumns<FrpRotationAssignmentNewColumns>;
  crew_leave_entries: PendingColumns<CrewLeaveEntryNewColumns>;
  crew_leave_requests: PendingColumns<CrewLeaveRequestNewColumns>;
  crew_import: PendingColumns<CrewImportTenancyColumns>;
  vessels_import: PendingColumns<CrewImportTenancyColumns>;
};

export type PlannerPendingFunctions = {
  planner_vessel_periods: { Args: { p_vessel_id: string; p_from: string; p_to: string }; Returns: PlannerVesselPeriodRpcRow[] };
  planner_period_upsert: {
    Args: {
      p_vessel_id: string;
      p_id: string | null;
      p_profile_id: string;
      p_leave_type_key: string;
      p_start: string;
      p_end: string | null;
      p_end_unknown?: boolean;
      p_notes?: string | null;
      p_replace?: boolean;
      p_expected_version?: number | null;
    };
    Returns: PlannerPeriodDbRow;
  };
  planner_period_delete: { Args: { p_vessel_id: string; p_id: string }; Returns: string };
  planner_add_leave: {
    Args: { p_vessel_id: string; p_profile_id: string; p_periods: Json; p_note?: string | null; p_replace?: boolean };
    Returns: PlannerAddLeaveRpcRow[];
  };
  crew_leave_request_submit: { Args: { p_vessel_id: string; p_periods: Json; p_note?: string | null }; Returns: CrewLeaveRequestDbRow };
  crew_leave_request_decide: {
    Args: { p_request_id: string; p_decision: LeaveDecision; p_reason?: string | null; p_replace?: boolean };
    Returns: CrewLeaveRequestDbRow;
  };
  planner_leave_settings_save: { Args: { p_vessel_id: string; p_hod_step: LeaveHodStep }; Returns: CrewLeaveSettingsRow };
  crew_toggle_onboard: {
    Args: {
      p_vessel_id: string;
      p_profile_id: string;
      p_direction: 'off' | 'on';
      p_leave_type_key?: string;
      p_start?: string;
      p_end?: string | null;
      p_end_unknown?: boolean | null;
    };
    Returns: CrewToggleOnboardRpcRow[];
  };
  vessel_manning_by_day: { Args: { p_vessel_id: string; p_from: string; p_to: string }; Returns: VesselManningByDayRpcRow[] };
  crew_import_stage: { Args: { p_company_id: string; p_rows: Json }; Returns: CrewImportStageRpcRow[] };
};
