/**
 * Pending types of the hours-of-rest engine (X1-07,
 * supabase/migrations/20261124060700_crew_hor_engine.sql; gap/04 C38, C39,
 * C43, C45, C46; DECISIONS D-01, D-X1-6, D-X1-9, D-X1-11, D-X1-20).
 *
 * The work-rest tables are live (20260501100000, in `types.ts`); 060700
 * adds columns to four of them and three browser RPCs. Nothing here is
 * live yet (D-01): the service reads every new column with a fallback to
 * the legacy column list, and calls the RPCs behind one missing-function
 * check (`isEngineMissing` in ../services/workRestService.ts), keeping
 * today's legacy path while they are missing.
 *
 * The harness contract phase (scripts/db/contract-map.d/crew.json) holds
 * these shapes to the SQL. Mirrored names only; the engine's internal
 * helpers (work_rest_rule_eval, work_rest_month_decide, the gates and the
 * recompute) are service-role only and never called from the browser.
 */
import { pendingClient, type NoPending, type PendingColumns } from '@/integrations/supabase/pending';
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

/** The client for the work-rest tables, their new columns and the engine RPCs. */
export const workRestDb = pendingClient<NoPending, NoPending, WorkRestPendingFunctions, WorkRestPendingColumns>();
