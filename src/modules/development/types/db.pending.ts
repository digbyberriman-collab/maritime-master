/**
 * Training core (gap/02 TR4–TR6, TR9, TR10, W3; X5 spec §2 X5-07A,
 * D-X5-05, D-X5-06, D-X5-19, D-X5-20, D-X5-25;
 * `20261124040600_fleet_training_core.sql`).
 *
 * Written, not applied (D-01). Everything new is read through the pending
 * client (`../hooks/developmentDb.ts`, `developmentDb`):
 *
 * - `DevelopmentPendingColumns`: the catalogue rule columns on the live
 *   `development_courses`, the lifecycle columns on the live
 *   `development_applications` and the policy columns on the live
 *   `program_settings`. Read them in a select of their own, apart from the
 *   live columns, so a missing column never blanks a page (D-X5-20).
 * - `development_application_events`: the append-only history (RLS read:
 *   whoever can read the application).
 * - The definers below are the only writers of an application's status
 *   and of the catalogue and settings. `development_transition` answers a
 *   jsonb the wrappers check (`parseTransitionResult`) before they report
 *   success; refusals are 22023 with a stable snake_case message
 *   (../lib/applicationMachine.ts maps them to sentences), 42501
 *   not_permitted, P0002 application_not_found.
 *
 * While the file is not applied, a definer call answers "function not
 * found" (`isMissingRelation`): the applicant's submit and cancel of a
 * draft then keep today's direct writes as their D-01 fallback (D-X5-20);
 * every other action says it is not set up yet. Never mock rows.
 */
import type { Database, Json } from '@/integrations/supabase/types';
import type { PendingColumns, PendingTable } from '@/integrations/supabase/pending';
import type { ApplicationActor, ApplicationStatus, FinalApprovalMode } from '../lib/applicationMachine';

export type { ApplicationActor, ApplicationStatus, FinalApprovalMode } from '../lib/applicationMachine';

export type DevelopmentCourseOrigin = 'catalogue' | 'proposed';

/** The actions development_application_events records (the transitions, creation, a course promotion). */
export type DevelopmentApplicationEventAction =
  | 'created'
  | 'submit'
  | 'hod_approve'
  | 'hod_return'
  | 'final_approve'
  | 'final_approve_discretionary'
  | 'return'
  | 'reject'
  | 'cancel'
  | 'enrol'
  | 'complete'
  | 'reimburse'
  | 'close'
  | 'void'
  | 'edit_fields'
  | 'course_promoted';

/** The catalogue rule columns 040600 adds to the live `development_courses` (TR7, TR8, TR9). */
export type DevelopmentCourseRuleColumns = {
  /** 1–600 months; null = the qualification never expires. */
  valid_for_months: number | null;
  /** 0 ≤ renew_from_months < valid_for_months. */
  renew_from_months: number | null;
  /** Empty = every department. */
  applies_to_departments: string[];
  /** Empty = every position. */
  applies_to_positions: string[];
  is_mandatory: boolean;
  renewal_note: string | null;
  pathway: string | null;
  origin: DevelopmentCourseOrigin;
  proposed_by: string | null;
  proposed_from_application_id: string | null;
  /** The qualification as text (the legacy fallback, D-X5-05). */
  qualification_label: string | null;
  /** X1's crew document type a completion records (platform-prep plan contract 3). */
  qualification_document_type_id: string | null;
};

/** The lifecycle columns 040600 adds to the live `development_applications` (TR4–TR6, TR9). */
export type DevelopmentApplicationLifecycleColumns = {
  rejected_at: string | null;
  rejected_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  /** The crew_certificates row completion wrote. */
  qualification_record_id: string | null;
  /** When the application entered its current status ("awaiting approval > 7 days"). */
  stage_entered_at: string | null;
};

/** The policy columns 040600 adds to the live `program_settings` (TR10, D-X5-06, D-X5-19). */
export type ProgramSettingsPolicyColumns = {
  final_approval_mode: FinalApprovalMode;
  mileage_rate_per_mile: number | null;
  mileage_rate_per_km: number | null;
  /** `{ "EUR": 1.08 }`: rate to USD by ISO 4217 code. */
  fx_overrides: Json;
  /** `{ "fleet_organised": "Company required" }`: the account's category labels. */
  category_labels: Json;
  updated_by: string | null;
};

/** The live rows in the generated types. */
export type LiveDevelopmentCourseRow = Database['public']['Tables']['development_courses']['Row'];
export type LiveDevelopmentApplicationRow = Database['public']['Tables']['development_applications']['Row'];
export type LiveProgramSettingsRow = Database['public']['Tables']['program_settings']['Row'];

/** Rows once 040600 is applied: the live columns and the new ones. */
export type DevelopmentCourseRow = LiveDevelopmentCourseRow & DevelopmentCourseRuleColumns;
export type DevelopmentApplicationRow = LiveDevelopmentApplicationRow & DevelopmentApplicationLifecycleColumns;
export type ProgramSettingsRow = LiveProgramSettingsRow & ProgramSettingsPolicyColumns;

export type DevelopmentApplicationEventRow = {
  id: string;
  company_id: string;
  vessel_id: string;
  application_id: string;
  actor_user_id: string | null;
  actor_profile_id: string | null;
  actor_role: ApplicationActor | null;
  action: DevelopmentApplicationEventAction;
  from_status: ApplicationStatus | null;
  to_status: ApplicationStatus | null;
  comment: string | null;
  /** edit_fields: `{ column: { from, to } }`. */
  field_diff: Json | null;
  payload: Json;
  created_at: string;
};

export type DevelopmentPendingColumns = {
  development_courses: PendingColumns<DevelopmentCourseRuleColumns>;
  development_applications: PendingColumns<DevelopmentApplicationLifecycleColumns>;
  program_settings: PendingColumns<ProgramSettingsPolicyColumns>;
};

export type DevelopmentPendingTables = {
  development_application_events: PendingTable<DevelopmentApplicationEventRow>;
};

export type DevelopmentPendingFunctions = {
  /** Answers `{ id, status, from_status, action, actor_role, event_id, updated_at, stage_entered_at, qualification_record_id, notified }`. */
  development_transition: {
    Args: { p_application_id: string; p_action: string; p_payload?: Json; p_expected_updated_at?: string | null };
    Returns: Json;
  };
  development_course_save: {
    Args: { p_course: Json };
    Returns: DevelopmentCourseRow;
  };
  development_course_archive: {
    Args: { p_course_id: string; p_archived?: boolean };
    Returns: DevelopmentCourseRow;
  };
  development_settings_save: {
    Args: { p_settings: Json };
    Returns: ProgramSettingsRow;
  };
  development_course_promote: {
    Args: { p_application_id: string };
    Returns: DevelopmentCourseRow;
  };
};
