/**
 * The reports module's RPCs (gap/02 R1, R14; X5 spec §2 X5-03A;
 * `20261124040200_fleet_reports_hub.sql`).
 *
 * Written, not applied (D-01). Every call goes through the pending client
 * (../lib/reportsDb.ts); a missing RPC (`isMissingRelation`) means "This
 * report is not set up yet" and the page says so; any other error is an
 * error with Retry. Nothing here is ever replaced by mock numbers.
 *
 * - `fleet_report_trends`: the hub's monthly trends as one jsonb
 *   (`FleetReportTrendsJson`, parsed by ../hooks/useReportsHub.ts).
 * - `fleet_vessel_list`: one row per vessel (the Fleet list report, X5-03B).
 * - The crew reports (X5-10A; `20261124040900_fleet_report_crew_sources.sql`),
 *   each one jsonb parsed by ../hooks/useCrewReports.ts:
 *   - `fleet_report_crew_qualifications` (R5): X1's
 *     `crew_compliance_for_vessels(uuid[])` summary rows for the vessels the
 *     reader may see them on, through a server wrapper that checks
 *     `to_regprocedure` first (`state: 'not_set_up'` while X1's function is
 *     missing). The person rows are X1's frozen columns (platform plan
 *     contract 5; `src/modules/crew/types/db.pending.ts`
 *     `CrewComplianceSummaryDbRow`) less the login id.
 *   - `fleet_report_hours_of_rest` (R9): breaches, serious breach days,
 *     months not submitted, vessels logging, the heat map and people with
 *     repeat breaches over a period of at most 366 days.
 *   - `fleet_report_contracts` (R10 agreements / R11 contracts ending).
 * - The operations reports (X5-10B; `20261124041000_fleet_report_ops_sources.sql`),
 *   each one jsonb parsed by ../hooks/useOpsReports.ts:
 *   - `fleet_report_overdue_drills` (R7): scheduled drills missed, required
 *     drill types past their interval or due within 7 days, and required
 *     types never carried out;
 *   - `fleet_report_insurance` (R13): every policy with the expiry engine's
 *     bucket and window (fleet policies for the fleet-wide read with fleet
 *     reach);
 *   - `fleet_report_audits` (R17): audits and certificate surveys over a
 *     period of at most 731 days, overdue and in-progress audits always;
 *   - `fleet_report_work_list` (R18): jobs per vessel with status chips, and
 *     the overdue jobs.
 *
 * The hub's current-position tiles read the dashboard's
 * `fleet_dashboard_kpis` and the Vessel comparison report reads
 * `fleet_vessel_comparison`, both through the dashboard module's hooks
 * (`@/modules/dashboard/hooks/useFleetDashboard`).
 *
 * Vessels: `p_vessel_ids` NULL = every counted vessel the caller reaches
 * (plus fleet-level corrective actions with fleet reach); explicit ids are
 * reach-checked (42501 `vessel_out_of_reach`) and show those vessels only.
 */
import type { Json } from '@/integrations/supabase/types';

/** A series' server state: `ok` with numbers, or why there are none. */
export type ReportSeriesState = 'ok' | 'no_access' | 'module_off';

type NotCounted = { state: 'no_access' } | { state: 'module_off' };

/** `fleet_report_trends` as parsed. Every array has one entry per month of `months` (or `ahead` for expiries). */
export interface FleetReportTrendsJson {
  vessels: number;
  today: string;
  /** The period's months (`yyyy-mm-01`), oldest first; the last is today's month. */
  months: string[];
  /** The months ahead (`yyyy-mm-01`), starting with today's month. */
  ahead: string[];
  incidents: NotCounted | { state: 'ok'; vessels: number; counts: number[] };
  corrective_actions: NotCounted | { state: 'ok'; vessels: number; opened: number[]; closed: number[] };
  drills: NotCounted | { state: 'ok'; vessels: number; completed: number[]; overdue: number[] };
  expiries: { state: 'no_access' } | { state: 'ok'; vessels: number; expired: number; due: number[] };
}

/** One row of `fleet_vessel_list`. A null count is "–": the caller cannot count it on that vessel. */
export type FleetVesselListRow = {
  vessel_id: string;
  vessel_name: string;
  vessel_code: string | null;
  vessel_type: string | null;
  flag_state: string | null;
  classification_society: string | null;
  imo_number: string | null;
  length_overall: number | null;
  builder: string | null;
  build_year: number | null;
  fleet_group_id: string | null;
  fleet_group_name: string | null;
  is_counted: boolean;
  active_crew: number | null;
  certificates_total: number | null;
  certificates_expired: number | null;
  certificates_expiring: number | null;
};

// ─── Crew reports (X5-10A) ──────────────────────────────────────────────

/** How a report covers a vessel: `ok`, or why it shows no numbers there. */
export type ReportVesselState = 'ok' | 'no_access' | 'module_off';

/** One vessel of a crew report's read and whether the report counts it. */
export interface ReportVesselCoverage {
  vessel_id: string;
  vessel_name: string;
  vessel_code: string | null;
  state: ReportVesselState;
}

/** A person's compliance status (X1's crew_compliance_status_decide; statusTone `crew_compliance`). */
export type CrewComplianceStatus = 'complete' | 'expiring' | 'missing' | 'expired';

/** One unmet requirement behind a person's status, worst first (X1's issues). */
export interface CrewQualificationIssue {
  row_id: string;
  label: string;
  tab: string;
  state: string;
  reason: string | null;
}

/**
 * One person of `fleet_report_crew_qualifications` (R5): X1's frozen summary
 * columns (contract 5) less `user_id`. Counts are requirement rows: `met`
 * includes expiring rows; the per-tab pairs are met of required.
 */
export interface CrewQualificationRow {
  vessel_id: string;
  profile_id: string;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  position_name: string | null;
  position_text: string | null;
  department_key: string | null;
  rank_tier: string | null;
  sort_order: number | null;
  /** 'assignment' | 'planned' | 'pending_placement' (X1's crew_vessel_members). */
  placement_kind: string;
  required: number;
  met: number;
  expiring: number;
  expired: number;
  missing: number;
  conditional: number;
  muted: number;
  docs_required: number;
  docs_met: number;
  stcw_required: number;
  stcw_met: number;
  quals_required: number;
  quals_met: number;
  fam_required: number;
  fam_met: number;
  status: CrewComplianceStatus;
  next_expiry: string | null;
  issues: CrewQualificationIssue[];
}

/** `fleet_report_crew_qualifications` as parsed. */
export interface FleetReportCrewQualificationsJson {
  /** `not_set_up` while X1's requirement engine is not in the database (no rows then). */
  state: 'ok' | 'not_set_up';
  today: string;
  vessels: ReportVesselCoverage[];
  rows: CrewQualificationRow[];
}

/** Where the hours-of-rest breaches come from: X1's breach review, or the legacy compliance checks. */
export type HoursOfRestSource = 'breach_review' | 'compliance_checks';

/** One vessel of `fleet_report_hours_of_rest`; every number is null where the vessel is not covered. */
export interface HoursOfRestVesselRow extends ReportVesselCoverage {
  crew_logging: number | null;
  crew_days: number | null;
  breach_days: number | null;
  serious_days: number | null;
  unreviewed: number | null;
  months_not_submitted: number | null;
  /** Breach days per 100 crew-days logged (one decimal); null when nothing was logged. */
  rate_per_100: number | null;
  last_entry: string | null;
}

/** One vessel-day of the heat map (days with nothing logged, breached or unreviewed are left out). */
export interface HoursOfRestHeatCell {
  vessel_id: string;
  day: string;
  logged: number;
  breaches: number;
  serious: number;
  unreviewed: number;
}

/** A person with breaches on two or more days of the period (emerging issues). */
export interface HoursOfRestEmergingRow {
  profile_id: string;
  person_name: string | null;
  position: string | null;
  vessel_id: string | null;
  breach_days: number;
  serious_days: number;
  unreviewed: number;
  last_breach: string;
}

export interface HoursOfRestTotals {
  vessels_covered: number;
  vessels_logging: number;
  crew_days: number;
  breach_days: number;
  serious_days: number;
  unreviewed: number;
  months_not_submitted: number;
  rate_per_100: number | null;
}

/** `fleet_report_hours_of_rest` as parsed. */
export interface FleetReportHoursOfRestJson {
  vessels: number;
  from: string;
  to: string;
  today: string;
  /** null for an empty answer (no company). */
  source: HoursOfRestSource | null;
  /** null when no vessel is covered: never zeros. */
  totals: HoursOfRestTotals | null;
  per_vessel: HoursOfRestVesselRow[];
  heat: HoursOfRestHeatCell[];
  emerging: { total: number; rows: HoursOfRestEmergingRow[] };
}

/** An agreement's state (gap/02 R10; SQL fleet_report_agreement_state). */
export type AgreementState = 'draft' | 'not_signed' | 'signed';
/** Who a not-yet-signed agreement waits for. */
export type AgreementAwaiting = 'crew' | 'company' | 'both';
/** A contract end date's bucket (gap/02 R11; SQL fleet_report_contract_bucket). */
export type ContractBucket = 'ended' | 'd30' | 'd60' | 'd90';

/** One contract of `fleet_report_contracts` (wages and terms are never sent). */
export interface ContractReportRow {
  contract_id: string;
  profile_id: string;
  person_name: string | null;
  position: string | null;
  department: string | null;
  /** The person's current vessel, else the contract's own; null = no current vessel. */
  vessel_id: string | null;
  contract_type: string;
  contract_number: string | null;
  sea_reference: string | null;
  status: string;
  start_date: string;
  end_date: string | null;
  signed_by_crew_at: string | null;
  signed_by_company_at: string | null;
  agreement_state: AgreementState;
  awaiting: AgreementAwaiting | null;
  days_left: number | null;
  bucket: ContractBucket | null;
  renewal_drafted: boolean;
}

/** `fleet_report_contracts` as parsed. */
export interface FleetReportContractsJson {
  mode: string;
  today: string;
  vessels: Array<ReportVesselCoverage & { state: 'ok' | 'no_access' }>;
  /** Contracts of people with no current vessel are listed (a fleet-wide read with fleet reach). */
  unassigned: boolean;
  rows: ContractReportRow[];
}

// ─── Operations reports (X5-10B) ────────────────────────────────────────

/** Why a drill row is listed (gap/02 R7; SQL fleet_report_drill_interval_state for the interval kinds). */
export type DrillRowKind = 'missed' | 'lapsed' | 'due_soon' | 'never';

/**
 * One row of `fleet_report_overdue_drills`: a scheduled drill missed
 * (`drill_id` set), or a required drill type's interval on a vessel
 * (`lapsed`, `due_soon`, `never`). `days_overdue` is today − the due day
 * (negative while still due; null for `never`).
 */
export interface OverdueDrillRow {
  kind: DrillRowKind;
  vessel_id: string;
  drill_type_id: string;
  drill_type: string;
  /** SOLAS_Required, Company_Required or Voluntary (the live drill_types.category). */
  category: string;
  /** The interval in days (drill_types.minimum_frequency). */
  frequency_days: number;
  solas_reference: string | null;
  drill_id: string | null;
  drill_number: string | null;
  /** The missed drill's live status; null for an interval row. */
  status: string | null;
  due_on: string | null;
  days_overdue: number | null;
  last_done_on: string | null;
  next_scheduled_on: string | null;
}

/** `fleet_report_overdue_drills` as parsed. */
export interface FleetReportOverdueDrillsJson {
  today: string;
  /** The active required drill types the interval rows are checked against. */
  required_types: number;
  vessels: ReportVesselCoverage[];
  rows: OverdueDrillRow[];
}

/** One policy of `fleet_report_insurance` (amounts, contacts and notes are never sent). */
export interface InsurancePolicyRow {
  policy_id: string;
  /** null = a fleet policy. */
  vessel_id: string | null;
  policy_type: string | null;
  insurer: string | null;
  policy_number: string | null;
  coverage_start: string | null;
  coverage_end: string | null;
  days_remaining: number | null;
  /** The expiry engine's bucket (expired, expiring_soon, expiring, valid). */
  bucket: string;
  window_days: number;
  status: string | null;
  certificate_on_file: boolean;
}

/** `fleet_report_insurance` as parsed. */
export interface FleetReportInsuranceJson {
  today: string;
  vessels: Array<ReportVesselCoverage & { state: 'ok' | 'no_access' }>;
  /** Fleet policies are listed (the fleet-wide read with fleet reach). */
  fleet_level: boolean;
  rows: InsurancePolicyRow[];
}

/** An audit's or survey's state (gap/02 R17; SQL fleet_report_audit_state). */
export type AuditState = 'due' | 'overdue' | 'in_progress' | 'done' | 'cancelled';
export type AuditRowKind = 'audit' | 'certificate_survey';

export interface AuditFindingCounts {
  total: number;
  /** Not Closed. */
  open: number;
  major: number;
  minor: number;
  observations: number;
}

/** One row of `fleet_report_audits`: an audit, or a vessel certificate's next survey. */
export interface AuditSurveyRow {
  kind: AuditRowKind;
  id: string;
  /** null = a company audit. */
  vessel_id: string | null;
  reference: string | null;
  /** The audit type, or the certificate's name. */
  title: string | null;
  /** The audit scope, or the certificate type. */
  scope: string | null;
  /** The audit's live status; null for a survey. */
  status: string | null;
  state: AuditState;
  outcome: string | null;
  scheduled_on: string | null;
  started_on: string | null;
  ended_on: string | null;
  /** The row's date: the actual start, else the scheduled day (a survey's due day). */
  on_date: string | null;
  /** on_date − today. */
  days: number | null;
  /** The external organisation, or a certificate's issuing authority. */
  auditor_org: string | null;
  auditor_name: string | null;
  lead_auditor: string | null;
  /** null for a survey. */
  findings: AuditFindingCounts | null;
}

export interface AuditVesselCoverage extends ReportVesselCoverage {
  /** Certificate surveys follow the certificates rule, not Safety. */
  surveys_state: 'ok' | 'no_access';
}

/** `fleet_report_audits` as parsed. */
export interface FleetReportAuditsJson {
  from: string;
  to: string;
  today: string;
  vessels: AuditVesselCoverage[];
  /** Company audits are listed (the fleet-wide read with fleet reach). */
  fleet_level: boolean;
  rows: AuditSurveyRow[];
}

/** One vessel of `fleet_report_work_list`; every number is null where the vessel is not covered. */
export interface WorkListVesselRow extends ReportVesselCoverage {
  open: number | null;
  overdue: number | null;
  pending_approval: number | null;
  /** Open, not overdue, due within 30 days. */
  due_30: number | null;
  /** High or urgent, open. */
  high_priority: number | null;
  completed_30: number | null;
  /** Open jobs by chip: overdue, pending_approval, then the live status of the rest. */
  statuses: Record<string, number> | null;
}

export interface WorkListTotals {
  vessels_covered: number;
  open: number;
  overdue: number;
  pending_approval: number;
  due_30: number;
  high_priority: number;
  completed_30: number;
}

/** One overdue job (most overdue first). */
export interface OverdueJobRow {
  job_id: string;
  vessel_id: string;
  task_number: string | null;
  task_name: string;
  equipment_name: string | null;
  priority: string | null;
  status: string | null;
  due_date: string;
  days_overdue: number;
}

/** `fleet_report_work_list` as parsed. */
export interface FleetReportWorkListJson {
  today: string;
  vessels: WorkListVesselRow[];
  /** null when no vessel is covered: never zeros. */
  totals: WorkListTotals | null;
  /** At most 200 rows, with the total. */
  overdue: { total: number; rows: OverdueJobRow[] };
}

export type ReportsPendingFunctions = {
  fleet_report_trends: {
    Args: { p_vessel_ids?: string[] | null; p_months?: number; p_today?: string };
    Returns: Json;
  };
  fleet_vessel_list: {
    Args: { p_vessel_ids?: string[] | null; p_today?: string };
    Returns: FleetVesselListRow[];
  };
  fleet_report_crew_qualifications: {
    Args: { p_vessel_ids?: string[] | null };
    Returns: Json;
  };
  fleet_report_hours_of_rest: {
    Args: { p_vessel_ids?: string[] | null; p_from?: string | null; p_to?: string | null; p_today?: string };
    Returns: Json;
  };
  fleet_report_contracts: {
    Args: { p_vessel_ids?: string[] | null; p_mode?: 'agreements' | 'ending'; p_today?: string };
    Returns: Json;
  };
  fleet_report_overdue_drills: {
    Args: { p_vessel_ids?: string[] | null; p_today?: string };
    Returns: Json;
  };
  fleet_report_insurance: {
    Args: { p_vessel_ids?: string[] | null; p_today?: string };
    Returns: Json;
  };
  fleet_report_audits: {
    Args: { p_vessel_ids?: string[] | null; p_from?: string | null; p_to?: string | null; p_today?: string };
    Returns: Json;
  };
  fleet_report_work_list: {
    Args: { p_vessel_ids?: string[] | null; p_today?: string };
    Returns: Json;
  };
};
