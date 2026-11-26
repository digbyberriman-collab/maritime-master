/**
 * The fleet dashboard's RPCs (gap/02 D1, D3, D4, D6, D7, W9; X5 spec §2
 * X5-02A; `20261124040100_fleet_dashboard_kpis.sql`).
 *
 * Written, not applied (D-01). Every call goes through the pending client
 * (../hooks/useFleetDashboard.ts); a missing RPC (`isMissingRelation`)
 * means "not set up yet" and the tiles and lists say so; any other error is
 * an error with Retry. Nothing here is ever replaced by mock numbers.
 *
 * - `fleet_dashboard_kpis`: the KPI row as one jsonb (`FleetDashboardKpisJson`).
 * - `fleet_dashboard_panels`: the ranked lists as one jsonb (`FleetDashboardPanelsJson`).
 * - `fleet_vessel_comparison`: one row per vessel; a NULL group = "–".
 *
 * Vessels: `p_vessel_ids` NULL = every counted vessel the caller reaches
 * plus fleet-level items (with fleet reach); explicit ids are reach-checked
 * (42501 `vessel_out_of_reach`) and show those vessels only.
 *
 * The jsonb answers are typed `Json` here (the contract checker compares
 * the SQL `jsonb` with it); the hook parses them into the shapes below and
 * treats anything else as an error, never a guess.
 */
import type { Json } from '@/integrations/supabase/types';

/** A tile's server state: `ok` with numbers, or why there are none. */
export type FleetTileState = 'ok' | 'no_access' | 'module_off';

export type FleetDocumentsTileJson =
  | { state: 'no_access' }
  | {
      state: 'ok';
      value: number;
      /** Vessels whose expiry items the caller may count. */
      vessels: number;
      parts: {
        expired_vessel_certificates: number;
        expired_crew_documents: number;
        expired_crew_qualifications: number;
        endorsements_overdue: number;
        expiring: number;
      };
    };

export type FleetHoursOfRestTileJson =
  | { state: 'no_access' }
  | { state: 'module_off'; vessels_off: number }
  | {
      state: 'ok';
      value: number;
      breach_days: number;
      near_threshold: number;
      crew_without_entries: number;
      vessels_logging: number;
      vessels_off: number;
    };

export type FleetSafetyTileJson =
  | { state: 'no_access' }
  | { state: 'module_off' }
  | {
      state: 'ok';
      value: number;
      vessels: number;
      /** null: the caller cannot count corrective actions on any vessel shown. */
      open_corrective_actions: number | null;
      overdue_corrective_actions: number | null;
      /** null: the caller cannot count drills on any vessel shown. */
      overdue_drills: number | null;
    };

export type FleetTechnicalTileJson =
  | { state: 'no_access' }
  | { state: 'module_off' }
  | { state: 'ok'; value: number; vessels: number; overdue_jobs: number; pending_approval: number; open_jobs: number };

/** `fleet_dashboard_kpis` as parsed. */
export interface FleetDashboardKpisJson {
  vessels: number;
  today: string;
  tiles: {
    documents: FleetDocumentsTileJson;
    hours_of_rest: FleetHoursOfRestTileJson;
    safety: FleetSafetyTileJson;
    technical: FleetTechnicalTileJson;
    leave: { state: 'not_enabled' };
    finance: { state: 'hidden' };
  };
}

/** One ranked-list part of `fleet_dashboard_panels`. */
export type FleetPanelJson<Item> =
  | { state: 'no_access' }
  | { state: 'module_off' }
  | { state: 'not_tracked' }
  | { state: 'ok'; total: number; items: Item[] };

export interface FleetPanelVessel {
  vessel_id: string | null;
  vessel_name: string | null;
  vessel_code: string | null;
}

export interface FleetExpiryPanelItem extends FleetPanelVessel {
  source_key: string;
  item_type: string;
  record_id: string;
  person_name: string | null;
  label: string;
  detail: string | null;
  expires_on: string | null;
  days_remaining: number | null;
  bucket: string;
  endorsement_due_on: string | null;
  endorsement_state: string | null;
  link_scope: 'vessel' | 'fleet' | 'workspace';
  link_rel: string;
}

export interface FleetCorrectiveActionPanelItem extends FleetPanelVessel {
  id: string;
  action_number: string;
  description: string;
  action_type: string;
  status: string;
  due_date: string;
  days_overdue: number;
  source: 'incident' | 'audit_finding' | 'none';
  source_id: string | null;
}

export interface FleetDrillPanelItem extends FleetPanelVessel {
  id: string;
  drill_number: string;
  drill_type: string | null;
  scheduled_on: string;
  days_overdue: number;
}

export interface FleetHessPanelItem extends FleetPanelVessel {
  next_due_on: string;
  days_remaining: number;
}

export interface FleetInsurancePanelItem extends FleetPanelVessel {
  record_id: string;
  label: string;
  detail: string | null;
  expires_on: string;
  days_remaining: number | null;
  bucket: string;
  link_scope: 'vessel' | 'fleet' | 'workspace';
  link_rel: string;
}

export interface FleetSurveyPanelItem extends FleetPanelVessel {
  kind: 'audit' | 'certificate_survey';
  id: string;
  reference: string | null;
  label: string;
  status: string | null;
  due_on: string;
  days_remaining: number;
}

export interface FleetWorkListVessel {
  vessel_id: string;
  vessel_name: string;
  vessel_code: string | null;
  open: number;
  overdue: number;
  pending_approval: number;
}

/** `fleet_dashboard_panels` as parsed. */
export interface FleetDashboardPanelsJson {
  vessels: number;
  today: string;
  expiry:
    | { state: 'no_access' }
    | {
        state: 'ok';
        groups: Record<'vessel_certificates' | 'crew_documents' | 'crew_qualifications', { total: number; items: FleetExpiryPanelItem[] }>;
      };
  corrective_actions:
    | { state: 'no_access' }
    | { state: 'module_off' }
    | { state: 'ok'; total: number; overdue: number; items: FleetCorrectiveActionPanelItem[] };
  overdue_drills: FleetPanelJson<FleetDrillPanelItem>;
  hess: FleetPanelJson<FleetHessPanelItem>;
  insurance: FleetPanelJson<FleetInsurancePanelItem>;
  surveys: FleetPanelJson<FleetSurveyPanelItem>;
  work_list: { state: 'no_access' } | { state: 'module_off' } | { state: 'ok'; vessels: FleetWorkListVessel[] };
}

/** One row of `fleet_vessel_comparison` (groups as jsonb; NULL = "–"). */
export type FleetVesselComparisonRow = {
  vessel_id: string;
  vessel_name: string;
  vessel_code: string;
  documents: Json;
  safety: Json;
  technical: Json;
  insurance: Json;
  hours_of_rest: Json;
};

export type DashboardPendingFunctions = {
  fleet_dashboard_kpis: {
    Args: { p_vessel_ids?: string[] | null; p_today?: string };
    Returns: Json;
  };
  fleet_dashboard_panels: {
    Args: { p_vessel_ids?: string[] | null; p_limit?: number; p_today?: string };
    Returns: Json;
  };
  fleet_vessel_comparison: {
    Args: { p_vessel_ids?: string[] | null; p_today?: string };
    Returns: FleetVesselComparisonRow[];
  };
};
