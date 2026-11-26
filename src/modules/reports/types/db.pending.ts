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

export type ReportsPendingFunctions = {
  fleet_report_trends: {
    Args: { p_vessel_ids?: string[] | null; p_months?: number; p_today?: string };
    Returns: Json;
  };
  fleet_vessel_list: {
    Args: { p_vessel_ids?: string[] | null; p_today?: string };
    Returns: FleetVesselListRow[];
  };
};
