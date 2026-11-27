/**
 * Pending types of the hours-of-rest engine and board (X1-07,
 * supabase/migrations/20261124060700_crew_hor_engine.sql; X1-08,
 * 20261124060800_crew_hor_board.sql; gap/04 C38-C45; DECISIONS D-01,
 * D-X1-6, D-X1-9, D-X1-11, D-X1-14, D-X1-20, D-X1-23).
 *
 * The work-rest tables are live (20260501100000, in `types.ts`); 060700
 * adds columns to four of them and three browser RPCs; 060800 adds the
 * reminder log, the breach reports, the review view fleet operations reads
 * (R9) and the board, statistics, breach, review, reminder and report RPCs.
 * Nothing here is live yet (D-01): the service reads every new column with
 * a fallback to the legacy column list, and calls the RPCs behind one
 * missing-function check (`isEngineMissing` in
 * ../services/workRestService.ts), keeping today's legacy path while they
 * are missing.
 *
 * The harness contract phase (scripts/db/contract-map.json) holds
 * these shapes to the SQL. Mirrored names only; the internal helpers
 * (work_rest_rule_eval, work_rest_month_decide, the gates and the
 * recompute; 060800's member, label, recipient and reminder helpers and
 * the daily sweep) are service-role only and never called from the
 * browser.
 */
import { pendingClient, type PendingColumns, type PendingTable, type PendingView } from '@/integrations/supabase/pending';
import type { Json } from '@/integrations/supabase/types';

/** vessel_work_rest_settings.hod_step (D-X1-11). */
export type WorkRestHodStep = 'off' | 'nudge' | 'required';

/** work_rest_non_conformities.review_outcome (X1-08 writes it; frozen for fleet operations R9). */
export type WorkRestReviewOutcome = 'accepted' | 'correction_requested' | 'dismissed';

/** New columns of vessel_work_rest_settings (C46): margins and serious thresholds in hours, the HoD step. */
export type VesselWorkRestSettingsNewColumns = {
  warning_margin_24h_h: number;
  warning_margin_7d_h: number;
  serious_24h_h: number;
  serious_7d_h: number;
  hod_step: WorkRestHodStep;
  auto_reminders: boolean;
};

/** New columns of work_rest_monthly_submissions (C39, C43): who did each step. Engine only. */
export type WorkRestMonthlySubmissionNewColumns = {
  submitted_by: string | null;
  submitted_on_behalf_by: string | null;
  on_behalf_reason: string | null;
  hod_signed_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  locked_by: string | null;
};

/** New columns of work_rest_non_conformities (C38, C42): the day, vessel, serious flag, deficit, review. */
export type WorkRestNonConformityNewColumns = {
  vessel_id: string | null;
  breach_day: string | null;
  is_serious: boolean;
  deficit_hours: number | null;
  review_outcome: WorkRestReviewOutcome | null;
  review_note: string | null;
  reviewed_by: string | null;
  breach_report_id: string | null;
  superseded_at: string | null;
};

/** New columns of work_rest_signatures (D-X1-6): a reopened month keeps earlier signatures as stale. */
export type WorkRestSignatureNewColumns = {
  stale_at: string | null;
  stale_reason: string | null;
};

export type WorkRestPendingColumns = {
  vessel_work_rest_settings: PendingColumns<VesselWorkRestSettingsNewColumns>;
  work_rest_monthly_submissions: PendingColumns<WorkRestMonthlySubmissionNewColumns>;
  work_rest_non_conformities: PendingColumns<WorkRestNonConformityNewColumns>;
  work_rest_signatures: PendingColumns<WorkRestSignatureNewColumns>;
};

// ---------------------------------------------------------------- 060800 (X1-08)

/** work_rest_reminders.kind: manual from the board, or the daily sweep (C41). */
export type WorkRestReminderKind = 'auto_month_start' | 'sign_off' | 'pre_cutoff' | 'manual';

/** One reminder sent (the board's "Reminded <date> by <role>" line, the report's reminder log). */
export type WorkRestReminderRow = {
  id: string;
  company_id: string;
  vessel_id: string;
  profile_id: string;
  crew_user_id: string;
  period_year: number;
  period_month: number;
  kind: WorkRestReminderKind;
  sent_by: string | null;
  /** The sender's role on the vessel ("Chief Stew", "Fleet office"); null for an automatic reminder. */
  sent_by_role_label: string | null;
  /** The vessel's day it was sent on (YYYY-MM-DD). */
  sent_on: string;
  sent_at: string;
  /** In-app only (D-249): always 'in_app' (CHECK channel IN ('in_app')). */
  channel: string;
  created_at: string;
  updated_at: string;
};

/** One consolidated breach report (C42, D-X1-14); no stored PDF in wave 1 (D-X1-23). */
export type WorkRestBreachReportRow = {
  id: string;
  company_id: string;
  vessel_id: string;
  /** HORBR-<vessel code>-<year>-<nnn> (format_reference). */
  reference: string;
  period_from: string;
  period_to: string;
  nc_ids: string[];
  recipient_user_ids: string[];
  file_path: string | null;
  notes: string | null;
  sent_by: string | null;
  sent_at: string;
  created_at: string;
  updated_at: string;
};

/** work_rest_breach_reviews (security invoker; fleet operations R9). View columns read as nullable. */
export type WorkRestBreachReviewViewRow = {
  nc_id: string | null;
  vessel_id: string | null;
  crew_id: string | null;
  window_start: string | null;
  window_end: string | null;
  is_serious: boolean | null;
  deficit_hours: number | null;
  review_outcome: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  breach_report_id: string | null;
  superseded_at: string | null;
  breach_day: string | null;
  rule_code: string | null;
  severity: string | null;
};

export type WorkRestPendingTables = {
  work_rest_reminders: PendingTable<WorkRestReminderRow, 'vessel_id' | 'crew_user_id' | 'period_year' | 'period_month' | 'kind' | 'sent_on'>;
  work_rest_breach_reports: PendingTable<
    WorkRestBreachReportRow,
    'vessel_id' | 'reference' | 'period_from' | 'period_to' | 'nc_ids' | 'recipient_user_ids'
  >;
};

export type WorkRestPendingViews = {
  work_rest_breach_reviews: PendingView<WorkRestBreachReviewViewRow>;
};

/** One row of work_rest_month_stats (one month of the year). */
export type WorkRestMonthStatsRow = {
  period_month: number;
  crew: number;
  days_logged: number;
  breach_days: number;
  unreviewed: number;
  serious_open: number;
  awaiting_correction: number;
  not_submitted: number;
  awaiting_approval: number;
  approved: number;
  locked: number;
};

/** One row of work_rest_vessel_breaches (a live breach of the vessel). */
export type WorkRestVesselBreachRow = {
  nc_id: string;
  profile_id: string;
  crew_user_id: string;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  position_name: string | null;
  department_key: string | null;
  department_label: string | null;
  submission_id: string | null;
  month_status: string | null;
  breach_day: string | null;
  rule_code: string;
  rule_description: string | null;
  severity: string;
  is_serious: boolean;
  measured_value: number | null;
  threshold_value: number | null;
  deficit_hours: number | null;
  window_start: string | null;
  window_end: string | null;
  status: string | null;
  review_outcome: WorkRestReviewOutcome | null;
  review_note: string | null;
  reviewed_by: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  breach_report_id: string | null;
  /** The caller may review it (not their own; their department, or the final approver). */
  can_review: boolean;
};

/** One possible breach report recipient (D-X1-14). */
export type WorkRestReportRecipientRow = {
  user_id: string;
  profile_id: string;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  kind: 'dpa' | 'fleet_hr';
};

/** One work period as the RPCs take it (minutes from the vessel's local midnight). */
export type WorkRestBlockArg = {
  block_type?: 'work';
  start_minute: number;
  end_minute: number;
  category?: string | null;
  notes?: string | null;
};

/** The month actions work_rest_month_transition takes (lib/horMonth.ts MONTH_ACTIONS). */
export type WorkRestMonthActionArg = 'submit' | 'submit_on_behalf' | 'hod_sign' | 'approve' | 'lock' | 'reopen';

export type WorkRestPendingFunctions = {
  /** Saves one day and computes the breaches of the week around it; returns SaveDayResultJson. */
  work_rest_save_day: {
    Args: { p_vessel_id: string; p_crew_user_id: string; p_date: string; p_blocks: Json; p_note?: string | null };
    Returns: Json;
  };
  /** Copies one recorded day onto up to 31 days, all or nothing; returns FillDaysResultJson. */
  work_rest_fill_days: {
    Args: { p_vessel_id: string; p_crew_user_id: string; p_source_date: string; p_target_dates: string[] };
    Returns: Json;
  };
  /** Moves a person's month on a vessel; returns MonthTransitionResultJson. */
  work_rest_month_transition: {
    Args: {
      p_vessel_id: string;
      p_crew_user_id: string;
      p_year: number;
      p_month: number;
      p_action: string;
      p_reason?: string | null;
      p_signature_text?: string | null;
    };
    Returns: Json;
  };
  /** The vessel's board for a month; returns VesselBoardJson (lib/horBoard.ts parseVesselBoard). */
  work_rest_vessel_board: { Args: { p_vessel_id: string; p_year: number; p_month: number }; Returns: Json };
  /** One row per month of the year up to the current month (the report page, X1-08B). */
  work_rest_month_stats: { Args: { p_vessel_id: string; p_year: number }; Returns: WorkRestMonthStatsRow[] };
  /** The vessel's live breaches in a range of at most a year. */
  work_rest_vessel_breaches: {
    Args: { p_vessel_id: string; p_from: string; p_to: string; p_only_open?: boolean };
    Returns: WorkRestVesselBreachRow[];
  };
  /** Reviews one breach; returns ReviewBreachResultJson. */
  work_rest_review_breach: { Args: { p_nc_id: string; p_outcome: string; p_note?: string | null }; Returns: Json };
  /** Reminds crew of a month; returns RemindResultJson. */
  work_rest_remind: { Args: { p_vessel_id: string; p_crew_user_ids: string[]; p_year: number; p_month: number }; Returns: Json };
  /** The company's fleet HR and DPA a breach report may go to. */
  work_rest_breach_report_recipients: { Args: { p_vessel_id: string }; Returns: WorkRestReportRecipientRow[] };
  /** Creates a breach report; returns BreachReportResultJson. */
  work_rest_breach_report_create: {
    Args: {
      p_vessel_id: string;
      p_from: string;
      p_to: string;
      p_nc_ids: string[];
      p_recipient_user_ids: string[];
      p_notes?: string | null;
    };
    Returns: Json;
  };
};

/** The jsonb work_rest_save_day answers. */
export type SaveDayResultJson = {
  record_id: string;
  submission_id: string;
  date: string;
  day: {
    work_minutes: number;
    rest_minutes: number;
    longest_rest_minutes: number;
    rest_period_count: number;
    is_compliant: boolean;
  };
  breaches: Array<{
    id: string;
    rule_code: string;
    severity: string;
    is_serious: boolean;
    measured_value: number;
    threshold_value: number;
    deficit_hours: number | null;
  }>;
  changes: { days: number; inserted?: number; updated?: number; superseded?: number; deleted?: number };
};

/** The jsonb work_rest_fill_days answers. */
export type FillDaysResultJson = {
  filled: number;
  dates: string[];
  changes: SaveDayResultJson['changes'];
};

/** The jsonb work_rest_month_transition answers. */
export type MonthTransitionResultJson = {
  submission_id: string;
  status: string;
  warnings: string[];
  signature_id: string | null;
};

/** The jsonb work_rest_review_breach answers. */
export type ReviewBreachResultJson = {
  nc_id: string;
  review_outcome: WorkRestReviewOutcome;
  status: string;
  month_status: string | null;
  reopened: boolean;
};

/** The jsonb work_rest_remind answers. */
export type RemindResultJson = {
  sent: number;
  sent_to: string[];
  skipped: Array<{ user_id: string; reason: 'reminder_rate_limited' | 'month_closed' }>;
  sent_on: string;
  by_label: string | null;
};

/** The jsonb work_rest_breach_report_create answers. */
export type BreachReportResultJson = {
  report_id: string;
  reference: string;
  nc_count: number;
  recipient_count: number;
};

/** The client for the work-rest tables, their new columns, the board tables and view, and the engine and board RPCs. */
export const workRestDb = pendingClient<WorkRestPendingTables, WorkRestPendingViews, WorkRestPendingFunctions, WorkRestPendingColumns>();
