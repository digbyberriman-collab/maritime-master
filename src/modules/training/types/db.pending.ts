/**
 * Pending tables, columns and RPCs of familiarisation (X1-10; DECISIONS
 * D-01; gap/00 D2). Mirrors the unapplied migration
 * 20261124061000_crew_familiarisation.sql; the harness contract phase
 * (scripts/db/contract-map.d/crew.json) checks every column, CHECK list and
 * argument against the built schema.
 *
 * - familiarization_template_positions: the positions a template is
 *   required for (vessel_id NULL for every vessel of a fleet template).
 *   Read through RLS; written only by familiarisation_template_save.
 * - New columns of the legacy familiarization_templates (company, code,
 *   description, due within days, the two signature flags, scope fleet /
 *   vessel, the vessel variant's fleet template, a linked form, updated
 *   at / by; vessel_id becomes nullable for a fleet template) and
 *   familiarization_records (company, profile, due date, the signature
 *   flags it was opened with, the signatures, the reopen reason / by / at,
 *   created by; user_id becomes nullable for a person without a login; the
 *   status widens to open | in_progress | awaiting_signatures | completed).
 * - The RPCs: the vessel overview and one record (the pages' reads), the
 *   template save, start, tick, sign, reopen and delete, and the two reads
 *   X1-10B builds on (crew_onboarding_progress, crew_vessel_dashboard; the
 *   crew module's pending file is not this slice's, so they are declared
 *   here).
 *
 * The browser never writes these tables directly: the guards refuse a
 * signed-in write outside the X1 engine (42501 familiarisation_engine_only).
 *
 * D-01: until the file is applied these relations, columns and functions do
 * not exist. The familiarisation route then falls back to the legacy
 * familiarisation tab (with the C63 fix on the client) under an info strip;
 * any other error is an error with Retry. Never mock rows.
 */
import type { PendingColumns, PendingTable } from '@/integrations/supabase/pending';
import type { Json, Tables } from '@/integrations/supabase/types';

// ---------------------------------------------------------------- 061000 rows

export type FamiliarisationScope = 'fleet' | 'vessel';
export type FamiliarisationStatusDb = 'open' | 'in_progress' | 'awaiting_signatures' | 'completed';

export type FamiliarizationTemplatePositionRow = {
  id: string;
  company_id: string;
  template_id: string;
  position_id: string;
  vessel_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** New columns of familiarization_templates. */
export type FamiliarizationTemplateNewColumns = {
  company_id: string;
  code: string | null;
  description: string | null;
  due_within_days: number | null;
  requires_crew_signature: boolean;
  requires_supervisor_signature: boolean;
  scope: FamiliarisationScope;
  variant_of: string | null;
  form_template_id: string | null;
  updated_by: string | null;
  updated_at: string;
};

/** New columns of familiarization_records. */
export type FamiliarizationRecordNewColumns = {
  company_id: string;
  profile_id: string | null;
  due_date: string | null;
  requires_crew_signature: boolean;
  requires_supervisor_signature: boolean;
  crew_signed_at: string | null;
  crew_signed_by: string | null;
  supervisor_signed_at: string | null;
  supervisor_signed_by: string | null;
  reopened_reason: string | null;
  reopened_by: string | null;
  reopened_at: string | null;
  created_by: string | null;
};

/** A template as the store holds it once 061000 is applied (vessel_id null for a fleet template). */
export type FamiliarizationTemplateDbRow = Omit<Tables<'familiarization_templates'>, 'vessel_id'> & {
  vessel_id: string | null;
} & FamiliarizationTemplateNewColumns;

/** A record as the store holds it once 061000 is applied (user_id null for a person without a login). */
export type FamiliarizationRecordDbRow = Omit<Tables<'familiarization_records'>, 'user_id' | 'status'> & {
  user_id: string | null;
  status: FamiliarisationStatusDb;
} & FamiliarizationRecordNewColumns;

/** One row of crew_onboarding_progress (X1-10B reads it; `checks` and `familiarisation` are jsonb arrays). */
export type CrewOnboardingProgressRpcRow = {
  profile_id: string;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  avatar_url: string | null;
  position_name: string | null;
  department_key: string | null;
  placement_kind: string;
  join_date: string | null;
  checks: Json;
  passed: number;
  known: number;
  percent: number;
  fam_required: number;
  fam_completed: number;
  familiarisation: Json;
  is_open: boolean;
};

// ---------------------------------------------------------------- pending shapes

export type TrainingPendingTables = {
  familiarization_template_positions: PendingTable<FamiliarizationTemplatePositionRow, 'company_id' | 'template_id' | 'position_id'>;
};

/** New columns of live tables (D-133). */
export type TrainingPendingColumns = {
  familiarization_templates: PendingColumns<FamiliarizationTemplateNewColumns>;
  familiarization_records: PendingColumns<FamiliarizationRecordNewColumns>;
};

export type TrainingPendingFunctions = {
  familiarisation_vessel_overview: { Args: { p_vessel_id: string; p_all?: boolean }; Returns: Json };
  familiarisation_record_detail: { Args: { p_record_id: string }; Returns: Json };
  familiarisation_template_save: { Args: { p_vessel_id: string; p_template_id: string | null; p_payload: Json }; Returns: Json };
  familiarisation_start: { Args: { p_template_id: string; p_profile_id: string; p_vessel_id: string }; Returns: Json };
  familiarisation_tick: { Args: { p_item_id: string; p_done: boolean; p_note?: string | null }; Returns: Json };
  familiarisation_sign: { Args: { p_record_id: string; p_as: 'crew' | 'supervisor' }; Returns: Json };
  familiarisation_reopen: { Args: { p_record_id: string; p_reason: string }; Returns: Json };
  familiarisation_delete: { Args: { p_record_id: string }; Returns: string };
  crew_onboarding_progress: {
    Args: { p_vessel_id: string; p_profile_id?: string | null; p_days?: number };
    Returns: CrewOnboardingProgressRpcRow[];
  };
  crew_vessel_dashboard: { Args: { p_vessel_id: string }; Returns: Json };
};
