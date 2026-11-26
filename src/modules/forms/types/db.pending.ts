/**
 * The form and checklist catalogue by area (gap/02 FC3–FC6, W2; DECISIONS
 * C6, D-173; X5 spec §2 X5-06A, D-X5-13;
 * `20261124040500_fleet_form_templates.sql`).
 *
 * Written, not applied (D-01). Everything new is read through the pending
 * client (../hooks/useFormTemplateMutations.ts, `formsDb`):
 *
 * - `FormsPendingColumns.form_templates`: the catalogue columns on the live
 *   `form_templates` (area, kind, cadence, completion signature, origin,
 *   the Customise source, the typed version label). Read them in a select
 *   of their own, apart from the live columns, so a missing column never
 *   blanks a register (D-X5-20).
 * - `form_template_vessel_settings` (shown / hidden and order per vessel)
 *   and `form_template_events` (the append-only history): RLS read only.
 * - The definers below are the only writers of a template's status,
 *   version and per-vessel settings. Each returns the row it wrote, which
 *   the wrappers check before they report success; refusals are 22023 with
 *   a stable snake_case message (../lib/templateMachine.ts maps them to
 *   sentences), 42501 not_permitted / vessel_out_of_reach, P0002
 *   template_not_found.
 *
 * While the file is not applied, a definer call answers "function not
 * found" (`isMissingRelation`): the template pages then keep today's
 * publish and archive writes as their D-01 fallback (D-X5-20) and nothing
 * else; every other action says it is not set up yet. Never mock rows.
 */
import type { Database, Json } from '@/integrations/supabase/types';
import type { PendingColumns, PendingTable } from '@/integrations/supabase/pending';

export type FormTemplateStatus = 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED' | 'ARCHIVED';
export type FormTemplateArea =
  | 'charter'
  | 'safety'
  | 'technical'
  | 'movement'
  | 'ptw'
  | 'familiarisation'
  | 'crew'
  | 'sms'
  | 'technical_forms';
export type FormTemplateKind = 'form' | 'checklist' | 'register' | 'passage_plan' | 'permit';
export type FormTemplateCadence =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'six_monthly'
  | 'yearly'
  | 'two_yearly'
  | 'five_yearly'
  | 'per_voyage'
  | 'per_charter'
  | 'on_demand';
export type FormTemplateOrigin = 'platform' | 'company';
export type FormTemplateVisibility = 'shown' | 'hidden';
export type FormTemplateEventAction =
  | 'created'
  | 'edited'
  | 'published'
  | 'new_version'
  | 'customised'
  | 'archived'
  | 'draft_deleted'
  | 'area_moved'
  | 'hidden'
  | 'shown'
  | 'reordered';

/** The catalogue columns 040500 adds to the live `form_templates` (D-X5-13, C6). */
export type FormTemplateCatalogueColumns = {
  /** Where crews find it on board; null = Unsorted. */
  area: FormTemplateArea | null;
  form_kind: FormTemplateKind | null;
  /** null = not set. */
  cadence: FormTemplateCadence | null;
  requires_completion_signature: boolean;
  /** platform = a standard template (customised, never versioned by the company). */
  origin: FormTemplateOrigin;
  /** The template a Customise copy was made from. */
  source_template_id: string | null;
  /** The controlled-document number typed at publish (1–40); null shows `v<version>`. */
  version_label: string | null;
};

/** The live `form_templates` row in the generated types. */
export type LiveFormTemplateRow = Database['public']['Tables']['form_templates']['Row'];

/** A `form_templates` row once 040500 is applied: the live columns and the catalogue columns. */
export type FormTemplateRow = LiveFormTemplateRow & FormTemplateCatalogueColumns;

export type FormTemplateVesselSettingRow = {
  template_id: string;
  vessel_id: string;
  company_id: string;
  visibility: FormTemplateVisibility;
  /** 1-based order in its area on the vessel; null = not ordered yet. */
  sort_order: number | null;
  hidden_by: string | null;
  hidden_at: string | null;
  /** Why it is hidden (up to 300); null when shown. */
  reason: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FormTemplateEventRow = {
  id: string;
  company_id: string;
  template_id: string | null;
  vessel_id: string | null;
  actor_user_id: string | null;
  action: FormTemplateEventAction;
  from_status: FormTemplateStatus | null;
  to_status: FormTemplateStatus | null;
  version: number | null;
  comment: string | null;
  payload: Json;
  created_at: string;
};

/** One row of `form_template_run_stats`: a published template on one vessel it targets. */
export type FormTemplateRunStatRow = {
  template_id: string;
  vessel_id: string;
  /** Hidden on the vessel: then nothing is due or overdue. */
  hidden: boolean;
  /** Runs of every version of the template on the vessel. */
  runs: number;
  last_run_at: string | null;
  /** The last run's day (`YYYY-MM-DD`). */
  last_run_on: string | null;
  /** By cadence (lib/cadence.ts); null for event-driven cadences or none. */
  next_due: string | null;
  overdue: boolean;
};

export type FormsPendingColumns = {
  form_templates: PendingColumns<FormTemplateCatalogueColumns>;
};

export type FormsPendingTables = {
  form_template_vessel_settings: PendingTable<FormTemplateVesselSettingRow>;
  form_template_events: PendingTable<FormTemplateEventRow>;
};

export type FormsPendingFunctions = {
  form_template_publish: {
    Args: { p_template_id: string; p_version_label?: string | null; p_expected_updated_at?: string | null };
    Returns: FormTemplateRow;
  };
  form_template_new_version: {
    Args: { p_template_id: string };
    Returns: FormTemplateRow;
  };
  form_template_customise: {
    Args: { p_source_template_id: string };
    Returns: FormTemplateRow;
  };
  form_template_archive: {
    Args: { p_template_id: string; p_reason?: string | null };
    Returns: FormTemplateRow;
  };
  form_template_delete_draft: {
    Args: { p_template_id: string };
    Returns: FormTemplateRow;
  };
  form_template_move_area: {
    Args: { p_template_id: string; p_area: FormTemplateArea };
    Returns: FormTemplateRow;
  };
  form_template_set_visibility: {
    Args: { p_template_id: string; p_vessel_id: string; p_visibility: FormTemplateVisibility; p_reason?: string | null };
    Returns: FormTemplateVesselSettingRow;
  };
  form_template_reorder: {
    Args: { p_vessel_id: string; p_area: FormTemplateArea | null; p_template_ids: string[] };
    Returns: FormTemplateVesselSettingRow[];
  };
  form_template_run_stats: {
    Args: { p_vessel_ids?: string[] | null; p_area?: FormTemplateArea | null; p_today?: string };
    Returns: FormTemplateRunStatRow[];
  };
};
