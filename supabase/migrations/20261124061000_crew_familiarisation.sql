-- =================================================================
-- CREW X1-10: familiarisation per vessel and position, record sign-off,
-- and the onboarding-progress and crew dashboard reads
-- (Phase 3 wave 1, stream X1; gap/04 C63, C36, W11, C18, C2; T-15,
-- T-121, T-134; DECISIONS C21, D-X1-4, D-X1-6, D-X1-24, D-01, D-128,
-- D-229, D-230, D-238; X1 spec §6 061000)
-- Tables: familiarization_template_positions (the positions a template is
--   required for; vessel_id NULL for every vessel of a fleet template)
-- Columns: familiarization_templates (company, code, description, due
--   within days, the two signature flags, scope fleet / vessel, the vessel
--   variant's fleet template, a linked form template, updated_at / _by;
--   vessel_id becomes NULL for a fleet template), familiarization_records
--   (company, profile, due date, the signature flags it was opened with,
--   crew and supervisor signatures, reopen reason / by / at, created_by;
--   user_id becomes NULL for a person without a login, status widened to
--   open / in_progress / awaiting_signatures / completed)
-- Functions: pure rules (familiarisation_status_decide,
--   familiarisation_overdue, familiarisation_action_check,
--   familiarisation_actor_decide); internals (familiarisation_sections_
--   normalise, familiarisation_supervisor_scope, familiarisation_vessel_
--   templates, familiarisation_required_templates,
--   familiarisation_member_position, familiarisation_open_record,
--   familiarisation_notify_assigned, familiarisation_record_recompute,
--   familiarisation_requirement_sync, familiarisation_open_required,
--   familiarisation_record_json, familiarisation_record_gate,
--   familiarisation_template_json, crew_onboarding_rows); RPCs
--   (familiarisation_template_save, familiarisation_start,
--   familiarisation_tick, familiarisation_sign, familiarisation_reopen,
--   familiarisation_delete, familiarisation_vessel_overview,
--   familiarisation_record_detail, crew_onboarding_progress,
--   crew_vessel_dashboard)
-- Triggers: familiarization_templates_guard (company, code, scope; engine
--   only for signed-in writers), familiarization_records_status_guard
--   (subject and company filled, legacy statuses mapped; status, signer,
--   reopen and subject columns only under the engine flag),
--   familiarization_checklist_items_guard (engine only for signed-in
--   writers), familiarization_items_recompute (a record's status follows
--   its items, replacing the legacy trg_recompute_familiarization_progress),
--   familiarization_template_positions_scope_guard,
--   familiarisation_required_on_terms (AFTER INSERT on
--   crew_assignment_terms: Add Crew and transfers open the required
--   familiarisations)
-- TS mirror: src/modules/training/types/db.pending.ts; the pure rules in
--   src/modules/crew/lib/familiarisation.ts (supabase/tests/sql/crew/
--   familiarisation.test.sql evaluates the TS functions through
--   scripts/db/lib/load-ts.mjs and compares them with the SQL rules case
--   by case)
-- =================================================================
--
-- Why. Familiarisation today is three legacy tables written straight from
-- the browser by any company member (20260125230014: FOR ALL policies on
-- the company), with no codes, no description, no due rule per template,
-- no required positions, no signatures, and a start that ignores the chosen
-- template (FamiliarizationTab always copies DEFAULT_FAMILIARIZATION_
-- SECTIONS, gap/04 C63). The legacy trigger
-- trg_recompute_familiarization_progress (20260917100000) marks a record
-- Completed at 100 per cent of its items, so nobody signs anything.
--
-- What this file does (gap/04 W11):
--   * Templates are fleet-wide (vessel_id NULL; FAM-2026-001) or per vessel
--     (FAM-DRA-2026-001). Codes come from format_reference('FAM', company,
--     vessel) (C21, D-X1-24), never max()+1, unique per company. A vessel
--     template may be the vessel's variant of a fleet template (T-134):
--     while it is active, the fleet template is not required on that vessel.
--     The STORM 24-hour and two-week presets (T-15) are client presets of
--     the editor, saved as ordinary fleet templates.
--   * A template names the positions it is required for
--     (familiarization_template_positions). Saving it keeps one
--     familiarisation requirement row per vessel it applies to
--     (crew_requirement_rows seed_key familiarisation.<template id>), so
--     Crew Compliance counts the completed records in Met (C36).
--   * A record copies the chosen template's sections into its checklist
--     items (the C63 bug fix), snapshots the two signature flags, and is due
--     join date + due_within_days. Status (familiarisation_status_decide):
--     open (nothing ticked) -> in_progress (first tick) ->
--     awaiting_signatures (every item ticked) -> completed (the required
--     signatures present). Overdue is computed: past due and not completed.
--   * Sign-off is an attestation on the record (D-X1-6, wave 1): the crew
--     member signs their own record (needs a login, view_own on the vessel);
--     the supervisor needs familiarisation.approve on the vessel and the
--     person's department (the Master, a command-tier position and fleet
--     reach supervise every department), never their own record.
--   * Reopen (reason required) by a supervisor of the person's department:
--     a completed record, or one with a signature, goes back to awaiting
--     signatures with its signatures cleared. Delete: only an open record
--     with nothing ticked (started by mistake), familiarisation.create.
--   * Add Crew and transfers insert crew_assignment_terms; the AFTER INSERT
--     trigger opens every familiarisation required of the person's position
--     on that vessel (people without a login too: user_id is nullable now)
--     and sends familiarisation_assigned to their login when there is one.
--     The trigger never fails the insert (exception-wrapped, D-128).
--   * crew_onboarding_progress (the eight onboarding checks per recent
--     joiner, gap/04 C18) and crew_vessel_dashboard (the crew dashboard
--     KPIs and cards, C2) are written and tested here for X1-10B.
--
-- Who (gap/04 W11; X1 spec §5): read a vessel's familiarisation with
-- vessel.crew.familiarisation.view (the person: their own record with
-- view_own); start and delete with .create; tick another person's items
-- and edit vessel templates with .edit (fleet templates: the company-wide
-- answer, has_company_capability_for, and fleet reach or an admin of every
-- vessel, admin_scope_all; D-376); supervise and reopen with
-- .approve and the department rule. External viewers see only their own
-- records. The dashboard and onboarding reads need
-- vessel.crew.crew_list.view (the person: their own onboarding row); each
-- dashboard section is answered only for its own read capability.
--
-- RLS: the six legacy FOR ALL / SELECT policies of the three legacy tables
-- (company-wide read and write) are dropped. Reads: templates of the
-- caller's company (fleet templates, and vessel templates of vessels the
-- caller reads familiarisation on); records of those vessels, the caller's
-- own records and legacy HR viewers; items through their record. No
-- browser write policy: every write is a definer (D-X1-6), and the guards
-- refuse a signed-in direct write that is not the engine's.
--
-- Rule §0.2: 20261124060600 (X1-06, unapplied) is edited in place in the
-- same commit so the requirement engine matches records by profile_id as
-- well as user_id and accepts fleet templates; it adds the two bare columns
-- (familiarization_records.profile_id, familiarization_templates.company_id)
-- its SQL functions read, and this file completes them (FKs, backfill,
-- CHECKs).
--
-- Idempotent (D-12): IF NOT EXISTS, DROP ... IF EXISTS before each policy,
-- trigger and constraint, CREATE OR REPLACE for every function, backfills
-- only where the column is still empty.

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regprocedure('public.crew_vessel_gate(text,uuid,text)') IS NULL
     OR to_regprocedure('public.crew_vessel_cap(text,uuid)') IS NULL
     OR to_regprocedure('public.crew_cap_vessel_ids(text)') IS NULL
     OR to_regprocedure('public.crew_position_for(uuid,uuid,text)') IS NULL
     OR to_regclass('public.positions') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061000_crew_familiarisation needs the crew gate helpers and positions: apply 20261124060100_crew_reference_positions.sql first';
  END IF;
  IF to_regprocedure('public.crew_vessel_members(uuid,date)') IS NULL
     OR to_regprocedure('public.crew_caller_is_external()') IS NULL
     OR to_regprocedure('public.crew_vessel_list(uuid,date)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061000_crew_familiarisation needs crew_vessel_members() and crew_vessel_list(): apply 20261124060200_crew_vessel_list.sql first';
  END IF;
  IF to_regclass('public.crew_assignment_terms') IS NULL OR to_regclass('public.crew_personal_details') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061000_crew_familiarisation needs crew_assignment_terms and crew_personal_details: apply 20261124060300_crew_profile_details.sql first';
  END IF;
  IF to_regclass('public.crew_document_types') IS NULL OR to_regprocedure('public.crew_member_role_on(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061000_crew_familiarisation needs the crew documents and crew_member_role_on(): apply 20261124060400 and 20261124060500 first';
  END IF;
  IF to_regclass('public.crew_requirement_rows') IS NULL
     OR to_regprocedure('public.crew_compliance_summary_for(uuid[],date,uuid)') IS NULL
     OR to_regprocedure('public.crew_requirement_status_for(uuid[],date,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061000_crew_familiarisation needs the requirement engine: apply 20261124060600_crew_compliance.sql first';
  END IF;
  IF to_regprocedure('public.work_rest_hor_on(uuid,date)') IS NULL OR to_regclass('public.work_rest_non_conformities') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061000_crew_familiarisation needs the hours-of-rest engine: apply 20261124060700_crew_hor_engine.sql first';
  END IF;
  IF to_regprocedure('public.has_capability_for(uuid,text,uuid,uuid)') IS NULL
     OR to_regprocedure('public.format_reference(text,uuid,uuid,date)') IS NULL
     OR to_regprocedure('public.emit_notification_event(text,uuid,text,text,uuid,text,text,text,text,text,uuid,text,uuid,uuid[],text[],jsonb,text,text)') IS NULL
     OR to_regprocedure('public.record_is_master(uuid,uuid)') IS NULL
     OR to_regprocedure('public.fleet_reach_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.is_company_actor(uuid,uuid)') IS NULL
     OR to_regprocedure('public.admin_scope_all(uuid,uuid)') IS NULL
     OR to_regprocedure('public.has_company_capability_for(uuid,text,uuid)') IS NULL
     OR to_regprocedure('public.expiry_bucket(date,integer,date,boolean)') IS NULL
     OR to_regprocedure('public.expiry_window_for(uuid,text,uuid)') IS NULL
     OR position('user_is_active' IN pg_get_functiondef('public.get_user_company_id(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061000_crew_familiarisation needs the platform capability, reference, notification, record, reach and expiry helpers: apply 20261123000400 to 20261123030000 and 20261124040000 first';
  END IF;
  IF to_regclass('public.familiarization_templates') IS NULL OR to_regclass('public.familiarization_records') IS NULL
     OR to_regclass('public.familiarization_checklist_items') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061000_crew_familiarisation needs the legacy familiarisation tables (20260125230014)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notification_types WHERE key = 'familiarisation_assigned') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061000_crew_familiarisation needs the familiarisation_assigned notification type: apply 20261124030100_platform_stream_notification_types.sql first';
  END IF;
END
$$;

-- ---------------------------------------------------------------- templates (gap/04 W11; data model "Familiarisation template")

ALTER TABLE public.familiarization_templates ADD COLUMN IF NOT EXISTS company_id uuid NULL;
ALTER TABLE public.familiarization_templates ADD COLUMN IF NOT EXISTS code text NULL;
ALTER TABLE public.familiarization_templates ADD COLUMN IF NOT EXISTS description text NULL;
ALTER TABLE public.familiarization_templates ADD COLUMN IF NOT EXISTS due_within_days integer NULL;
ALTER TABLE public.familiarization_templates ADD COLUMN IF NOT EXISTS requires_crew_signature boolean NOT NULL DEFAULT true;
ALTER TABLE public.familiarization_templates ADD COLUMN IF NOT EXISTS requires_supervisor_signature boolean NOT NULL DEFAULT true;
ALTER TABLE public.familiarization_templates ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'vessel';
ALTER TABLE public.familiarization_templates ADD COLUMN IF NOT EXISTS variant_of uuid NULL;
ALTER TABLE public.familiarization_templates ADD COLUMN IF NOT EXISTS form_template_id uuid NULL;
ALTER TABLE public.familiarization_templates ADD COLUMN IF NOT EXISTS updated_by uuid NULL;
ALTER TABLE public.familiarization_templates ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
-- A fleet template belongs to no vessel.
ALTER TABLE public.familiarization_templates ALTER COLUMN vessel_id DROP NOT NULL;

-- Backfill (legacy templates are vessel templates of their vessel's company).
UPDATE public.familiarization_templates AS t
SET company_id = v.company_id
FROM public.vessels AS v
WHERE t.company_id IS NULL AND v.id = t.vessel_id;
UPDATE public.familiarization_templates SET due_within_days = least(greatest(coalesce(total_duration_days, 14), 0), 365)
WHERE due_within_days IS NULL;
UPDATE public.familiarization_templates SET template_name = 'Familiarisation'
WHERE template_name IS NULL OR btrim(template_name) = '';
UPDATE public.familiarization_templates SET template_name = left(btrim(template_name), 120)
WHERE length(btrim(template_name)) > 120 OR template_name <> btrim(template_name);
UPDATE public.familiarization_templates SET sections = '[]'::jsonb
WHERE sections IS NULL OR jsonb_typeof(sections) <> 'array';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.familiarization_templates WHERE company_id IS NULL) THEN
    ALTER TABLE public.familiarization_templates ALTER COLUMN company_id SET NOT NULL;
  END IF;
END
$$;

ALTER TABLE public.familiarization_templates DROP CONSTRAINT IF EXISTS familiarization_templates_company_id_fkey;
ALTER TABLE public.familiarization_templates ADD CONSTRAINT familiarization_templates_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.familiarization_templates VALIDATE CONSTRAINT familiarization_templates_company_id_fkey;
ALTER TABLE public.familiarization_templates DROP CONSTRAINT IF EXISTS familiarization_templates_variant_of_fkey;
ALTER TABLE public.familiarization_templates ADD CONSTRAINT familiarization_templates_variant_of_fkey
  FOREIGN KEY (variant_of) REFERENCES public.familiarization_templates(id) ON DELETE SET NULL;
ALTER TABLE public.familiarization_templates DROP CONSTRAINT IF EXISTS familiarization_templates_form_template_id_fkey;
DO $$
BEGIN
  IF to_regclass('public.form_templates') IS NOT NULL THEN
    ALTER TABLE public.familiarization_templates ADD CONSTRAINT familiarization_templates_form_template_id_fkey
      FOREIGN KEY (form_template_id) REFERENCES public.form_templates(id) ON DELETE SET NULL;
  END IF;
END
$$;
ALTER TABLE public.familiarization_templates DROP CONSTRAINT IF EXISTS familiarization_templates_updated_by_fkey;
ALTER TABLE public.familiarization_templates ADD CONSTRAINT familiarization_templates_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

ALTER TABLE public.familiarization_templates DROP CONSTRAINT IF EXISTS familiarization_templates_scope_check;
ALTER TABLE public.familiarization_templates ADD CONSTRAINT familiarization_templates_scope_check
  CHECK (scope IN ('fleet', 'vessel')) NOT VALID;
ALTER TABLE public.familiarization_templates VALIDATE CONSTRAINT familiarization_templates_scope_check;
-- A fleet template has no vessel; a vessel template has one.
ALTER TABLE public.familiarization_templates DROP CONSTRAINT IF EXISTS familiarization_templates_scope_vessel_check;
ALTER TABLE public.familiarization_templates ADD CONSTRAINT familiarization_templates_scope_vessel_check
  CHECK ((scope = 'fleet') = (vessel_id IS NULL)) NOT VALID;
ALTER TABLE public.familiarization_templates VALIDATE CONSTRAINT familiarization_templates_scope_vessel_check;
-- Only a vessel template is a variant, and never of itself.
ALTER TABLE public.familiarization_templates DROP CONSTRAINT IF EXISTS familiarization_templates_variant_check;
ALTER TABLE public.familiarization_templates ADD CONSTRAINT familiarization_templates_variant_check
  CHECK (variant_of IS NULL OR (scope = 'vessel' AND variant_of <> id)) NOT VALID;
ALTER TABLE public.familiarization_templates VALIDATE CONSTRAINT familiarization_templates_variant_check;
ALTER TABLE public.familiarization_templates DROP CONSTRAINT IF EXISTS familiarization_templates_code_check;
ALTER TABLE public.familiarization_templates ADD CONSTRAINT familiarization_templates_code_check
  CHECK (code IS NULL OR code ~ '^FAM-([A-Z0-9]{2,8}-)?[0-9]{4}-[0-9]{3,}$') NOT VALID;
ALTER TABLE public.familiarization_templates VALIDATE CONSTRAINT familiarization_templates_code_check;
ALTER TABLE public.familiarization_templates DROP CONSTRAINT IF EXISTS familiarization_templates_name_check;
ALTER TABLE public.familiarization_templates ADD CONSTRAINT familiarization_templates_name_check
  CHECK (length(btrim(template_name)) BETWEEN 1 AND 120) NOT VALID;
ALTER TABLE public.familiarization_templates VALIDATE CONSTRAINT familiarization_templates_name_check;
ALTER TABLE public.familiarization_templates DROP CONSTRAINT IF EXISTS familiarization_templates_description_check;
ALTER TABLE public.familiarization_templates ADD CONSTRAINT familiarization_templates_description_check
  CHECK (description IS NULL OR length(btrim(description)) BETWEEN 1 AND 2000) NOT VALID;
ALTER TABLE public.familiarization_templates VALIDATE CONSTRAINT familiarization_templates_description_check;
ALTER TABLE public.familiarization_templates DROP CONSTRAINT IF EXISTS familiarization_templates_due_within_days_check;
ALTER TABLE public.familiarization_templates ADD CONSTRAINT familiarization_templates_due_within_days_check
  CHECK (due_within_days IS NULL OR due_within_days BETWEEN 0 AND 365) NOT VALID;
ALTER TABLE public.familiarization_templates VALIDATE CONSTRAINT familiarization_templates_due_within_days_check;
ALTER TABLE public.familiarization_templates DROP CONSTRAINT IF EXISTS familiarization_templates_sections_check;
ALTER TABLE public.familiarization_templates ADD CONSTRAINT familiarization_templates_sections_check
  CHECK (jsonb_typeof(sections) = 'array') NOT VALID;
ALTER TABLE public.familiarization_templates VALIDATE CONSTRAINT familiarization_templates_sections_check;

-- One code per company (C21); one active variant of a fleet template per vessel.
CREATE UNIQUE INDEX IF NOT EXISTS familiarization_templates_company_code_key
  ON public.familiarization_templates (company_id, code) WHERE code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS familiarization_templates_vessel_variant_key
  ON public.familiarization_templates (vessel_id, variant_of) WHERE variant_of IS NOT NULL AND is_active;
CREATE INDEX IF NOT EXISTS familiarization_templates_company_idx ON public.familiarization_templates (company_id, vessel_id);

-- Codes for legacy templates, in the order they were made (format_reference;
-- the year is the template's own). Idempotent: only templates without one.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT t.id, t.company_id, t.vessel_id, coalesce(t.created_at::date, current_date) AS made_on
    FROM public.familiarization_templates AS t
    WHERE t.code IS NULL AND t.company_id IS NOT NULL
    ORDER BY t.created_at NULLS LAST, t.id
  LOOP
    UPDATE public.familiarization_templates
    SET code = public.format_reference('FAM', r.company_id, r.vessel_id, r.made_on)
    WHERE id = r.id;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------- required positions (gap/04 C36, C63)

CREATE TABLE IF NOT EXISTS public.familiarization_template_positions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  template_id uuid NOT NULL,
  position_id uuid NOT NULL,
  vessel_id uuid NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT familiarization_template_positions_pkey PRIMARY KEY (id),
  CONSTRAINT familiarization_template_positions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT familiarization_template_positions_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.familiarization_templates(id) ON DELETE CASCADE,
  CONSTRAINT familiarization_template_positions_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE CASCADE,
  CONSTRAINT familiarization_template_positions_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE,
  CONSTRAINT familiarization_template_positions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS familiarization_template_positions_key
  ON public.familiarization_template_positions (template_id, position_id, (coalesce(vessel_id, '00000000-0000-0000-0000-000000000000'::uuid)));
CREATE INDEX IF NOT EXISTS familiarization_template_positions_position_idx ON public.familiarization_template_positions (position_id);
CREATE INDEX IF NOT EXISTS familiarization_template_positions_company_idx ON public.familiarization_template_positions (company_id);
ALTER TABLE public.familiarization_template_positions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------- records (gap/04 W11; data model "Familiarisation record")

ALTER TABLE public.familiarization_records ADD COLUMN IF NOT EXISTS company_id uuid NULL;
ALTER TABLE public.familiarization_records ADD COLUMN IF NOT EXISTS profile_id uuid NULL;
ALTER TABLE public.familiarization_records ADD COLUMN IF NOT EXISTS due_date date NULL;
ALTER TABLE public.familiarization_records ADD COLUMN IF NOT EXISTS requires_crew_signature boolean NOT NULL DEFAULT true;
ALTER TABLE public.familiarization_records ADD COLUMN IF NOT EXISTS requires_supervisor_signature boolean NOT NULL DEFAULT true;
ALTER TABLE public.familiarization_records ADD COLUMN IF NOT EXISTS crew_signed_at timestamptz NULL;
ALTER TABLE public.familiarization_records ADD COLUMN IF NOT EXISTS crew_signed_by uuid NULL;
ALTER TABLE public.familiarization_records ADD COLUMN IF NOT EXISTS supervisor_signed_at timestamptz NULL;
ALTER TABLE public.familiarization_records ADD COLUMN IF NOT EXISTS supervisor_signed_by uuid NULL;
ALTER TABLE public.familiarization_records ADD COLUMN IF NOT EXISTS reopened_reason text NULL;
ALTER TABLE public.familiarization_records ADD COLUMN IF NOT EXISTS reopened_by uuid NULL;
ALTER TABLE public.familiarization_records ADD COLUMN IF NOT EXISTS reopened_at timestamptz NULL;
ALTER TABLE public.familiarization_records ADD COLUMN IF NOT EXISTS created_by uuid NULL;
-- People without a login hold records too (no-login joiners, D-199):
-- otherwise the terms trigger below would fail Add Crew.
ALTER TABLE public.familiarization_records ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.familiarization_records ALTER COLUMN status SET DEFAULT 'open';

-- Backfill: the profile of the login, the company of the vessel, the due
-- date from the legacy target, the signature flags of the template.
UPDATE public.familiarization_records AS fr
SET profile_id = p.id
FROM public.profiles AS p
WHERE fr.profile_id IS NULL AND fr.user_id IS NOT NULL AND p.user_id = fr.user_id;
UPDATE public.familiarization_records AS fr
SET company_id = v.company_id
FROM public.vessels AS v
WHERE fr.company_id IS NULL AND v.id = fr.vessel_id;
UPDATE public.familiarization_records SET due_date = target_completion_date WHERE due_date IS NULL;
-- Legacy records keep the default flags (both signatures): a legacy
-- completed record stays completed; once reopened it waits for both.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.familiarization_records WHERE company_id IS NULL) THEN
    ALTER TABLE public.familiarization_records ALTER COLUMN company_id SET NOT NULL;
  END IF;
END
$$;

ALTER TABLE public.familiarization_records DROP CONSTRAINT IF EXISTS familiarization_records_company_id_fkey;
ALTER TABLE public.familiarization_records ADD CONSTRAINT familiarization_records_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.familiarization_records VALIDATE CONSTRAINT familiarization_records_company_id_fkey;
ALTER TABLE public.familiarization_records DROP CONSTRAINT IF EXISTS familiarization_records_profile_id_fkey;
ALTER TABLE public.familiarization_records ADD CONSTRAINT familiarization_records_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.familiarization_records VALIDATE CONSTRAINT familiarization_records_profile_id_fkey;
ALTER TABLE public.familiarization_records DROP CONSTRAINT IF EXISTS familiarization_records_crew_signed_by_fkey;
ALTER TABLE public.familiarization_records ADD CONSTRAINT familiarization_records_crew_signed_by_fkey
  FOREIGN KEY (crew_signed_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public.familiarization_records DROP CONSTRAINT IF EXISTS familiarization_records_supervisor_signed_by_fkey;
ALTER TABLE public.familiarization_records ADD CONSTRAINT familiarization_records_supervisor_signed_by_fkey
  FOREIGN KEY (supervisor_signed_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public.familiarization_records DROP CONSTRAINT IF EXISTS familiarization_records_reopened_by_fkey;
ALTER TABLE public.familiarization_records ADD CONSTRAINT familiarization_records_reopened_by_fkey
  FOREIGN KEY (reopened_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public.familiarization_records DROP CONSTRAINT IF EXISTS familiarization_records_created_by_fkey;
ALTER TABLE public.familiarization_records ADD CONSTRAINT familiarization_records_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

-- A record names its person (by login, profile or both).
ALTER TABLE public.familiarization_records DROP CONSTRAINT IF EXISTS familiarization_records_subject_check;
ALTER TABLE public.familiarization_records ADD CONSTRAINT familiarization_records_subject_check
  CHECK (user_id IS NOT NULL OR profile_id IS NOT NULL) NOT VALID;
ALTER TABLE public.familiarization_records VALIDATE CONSTRAINT familiarization_records_subject_check;
ALTER TABLE public.familiarization_records DROP CONSTRAINT IF EXISTS familiarization_records_reopened_reason_check;
ALTER TABLE public.familiarization_records ADD CONSTRAINT familiarization_records_reopened_reason_check
  CHECK (reopened_reason IS NULL OR length(btrim(reopened_reason)) BETWEEN 1 AND 2000) NOT VALID;
ALTER TABLE public.familiarization_records VALIDATE CONSTRAINT familiarization_records_reopened_reason_check;
ALTER TABLE public.familiarization_records DROP CONSTRAINT IF EXISTS familiarization_records_signature_pair_check;
ALTER TABLE public.familiarization_records ADD CONSTRAINT familiarization_records_signature_pair_check
  CHECK ((crew_signed_at IS NULL) = (crew_signed_by IS NULL) AND (supervisor_signed_at IS NULL) = (supervisor_signed_by IS NULL)) NOT VALID;
ALTER TABLE public.familiarization_records VALIDATE CONSTRAINT familiarization_records_signature_pair_check;

-- The guard below maps legacy statuses on every write; the indexes the
-- engine and the reads use.
CREATE INDEX IF NOT EXISTS familiarization_records_profile_idx ON public.familiarization_records (profile_id, vessel_id);
CREATE INDEX IF NOT EXISTS familiarization_records_company_vessel_idx ON public.familiarization_records (company_id, vessel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS familiarization_checklist_items_record_idx ON public.familiarization_checklist_items (familiarization_id, item_order);
CREATE INDEX IF NOT EXISTS familiarization_template_records_idx ON public.familiarization_records (template_id, vessel_id, profile_id);

-- ---------------------------------------------------------------- pure rules (TS mirrors in src/modules/crew/lib/familiarisation.ts)

-- The status of a record (gap/04 W11): nothing ticked is open, some ticked
-- in progress, every item ticked awaiting the required signatures, then
-- completed. A record without items is open. Mirrors decideStatus().
CREATE OR REPLACE FUNCTION public.familiarisation_status_decide(
  p_total integer, p_done integer, p_requires_crew boolean, p_crew_signed boolean, p_requires_supervisor boolean, p_supervisor_signed boolean
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN coalesce(p_total, 0) <= 0 OR coalesce(p_done, 0) <= 0 THEN 'open'
    WHEN p_done < p_total THEN 'in_progress'
    WHEN (coalesce(p_requires_crew, true) AND NOT coalesce(p_crew_signed, false))
      OR (coalesce(p_requires_supervisor, true) AND NOT coalesce(p_supervisor_signed, false)) THEN 'awaiting_signatures'
    ELSE 'completed'
  END
$$;

-- Overdue is computed, never stored: past the due date and not completed.
-- Mirrors isOverdue().
CREATE OR REPLACE FUNCTION public.familiarisation_overdue(p_status text, p_due date, p_today date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT coalesce(p_status, '') <> 'completed' AND p_due IS NOT NULL AND p_today IS NOT NULL AND p_due < p_today
$$;

-- Whether a record's state allows an action; 'ok' or the refusal code
-- (22023 in the definers). Actions: tick (tick or untick an item), sign_crew,
-- sign_supervisor, reopen, delete. Mirrors checkAction().
CREATE OR REPLACE FUNCTION public.familiarisation_action_check(
  p_action text, p_status text, p_done integer, p_crew_signed boolean, p_supervisor_signed boolean,
  p_requires_crew boolean, p_requires_supervisor boolean
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE p_action
    WHEN 'tick' THEN CASE
      WHEN p_status = 'completed' THEN 'record_completed'
      WHEN coalesce(p_crew_signed, false) OR coalesce(p_supervisor_signed, false) THEN 'record_signed'
      ELSE 'ok' END
    WHEN 'sign_crew' THEN CASE
      WHEN NOT coalesce(p_requires_crew, true) THEN 'signature_not_required'
      WHEN p_status = 'completed' THEN 'record_completed'
      WHEN p_status IS DISTINCT FROM 'awaiting_signatures' THEN 'items_open'
      WHEN coalesce(p_crew_signed, false) THEN 'already_signed'
      ELSE 'ok' END
    WHEN 'sign_supervisor' THEN CASE
      WHEN NOT coalesce(p_requires_supervisor, true) THEN 'signature_not_required'
      WHEN p_status = 'completed' THEN 'record_completed'
      WHEN p_status IS DISTINCT FROM 'awaiting_signatures' THEN 'items_open'
      WHEN coalesce(p_supervisor_signed, false) THEN 'already_signed'
      ELSE 'ok' END
    WHEN 'reopen' THEN CASE
      WHEN p_status = 'completed' THEN 'ok'
      WHEN p_status = 'awaiting_signatures' AND (coalesce(p_crew_signed, false) OR coalesce(p_supervisor_signed, false)) THEN 'ok'
      ELSE 'not_reopenable' END
    WHEN 'delete' THEN CASE
      WHEN p_status = 'open' AND coalesce(p_done, 0) = 0
           AND NOT coalesce(p_crew_signed, false) AND NOT coalesce(p_supervisor_signed, false) THEN 'ok'
      ELSE 'not_deletable' END
    ELSE 'action_unknown'
  END
$$;

-- Whether the caller may take an action on a record, from what they are:
-- p_own (the record is the caller's), p_has_login (the person has a login),
-- the capabilities on the record's vessel (view_own, edit, create, approve)
-- and the supervisor scope (familiarisation_supervisor_scope: ok,
-- out_of_department, own_record, not_permitted). 'ok', 'not_permitted',
-- 'own_record', 'out_of_department' or 'no_login' (42501 in the definers).
-- Mirrors decideActor().
CREATE OR REPLACE FUNCTION public.familiarisation_actor_decide(
  p_action text, p_own boolean, p_has_login boolean, p_view_own boolean, p_can_edit boolean, p_can_create boolean, p_supervisor_scope text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE p_action
    WHEN 'tick' THEN CASE
      WHEN coalesce(p_can_edit, false) THEN 'ok'
      WHEN coalesce(p_own, false) AND coalesce(p_view_own, false) THEN 'ok'
      ELSE 'not_permitted' END
    WHEN 'sign_crew' THEN CASE
      WHEN NOT coalesce(p_own, false) THEN 'not_permitted'
      WHEN NOT coalesce(p_has_login, false) THEN 'no_login'
      WHEN NOT coalesce(p_view_own, false) THEN 'not_permitted'
      ELSE 'ok' END
    WHEN 'sign_supervisor' THEN CASE
      WHEN coalesce(p_own, false) THEN 'own_record'
      WHEN coalesce(p_supervisor_scope, 'not_permitted') = 'ok' THEN 'ok'
      WHEN p_supervisor_scope IN ('out_of_department', 'own_record') THEN p_supervisor_scope
      ELSE 'not_permitted' END
    WHEN 'reopen' THEN CASE
      WHEN coalesce(p_own, false) THEN 'own_record'
      WHEN coalesce(p_supervisor_scope, 'not_permitted') = 'ok' THEN 'ok'
      WHEN p_supervisor_scope IN ('out_of_department', 'own_record') THEN p_supervisor_scope
      ELSE 'not_permitted' END
    WHEN 'delete' THEN CASE
      WHEN coalesce(p_can_create, false) THEN 'ok'
      ELSE 'not_permitted' END
    ELSE 'not_permitted'
  END
$$;

-- ---------------------------------------------------------------- internal helpers

-- The sections of a template, checked and normalised: a jsonb array of 1 to
-- 30 objects {section_name (1-120), checklist_items [1-60 texts of 1-300],
-- required_days? (0-365)}, names unique (any case); texts trimmed of ASCII
-- whitespace. Raises 22023 with a
-- sentence and HINT naming the section (1-based). Mirrors
-- normaliseSections() / templateSchema in lib/familiarisation.ts.
CREATE OR REPLACE FUNCTION public.familiarisation_sections_normalise(p_sections jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_section jsonb;
  v_items jsonb;
  v_item jsonb;
  v_name text;
  v_text text;
  v_list jsonb;
  v_days integer;
  v_names text[] := ARRAY[]::text[];
  v_i integer := 0;
  -- The whitespace JavaScript's String.prototype.trim removes in ASCII (TS mirror trimText).
  v_ws text := E' \t\n\r\f' || chr(11);
BEGIN
  IF p_sections IS NULL OR jsonb_typeof(p_sections) <> 'array' OR jsonb_array_length(p_sections) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'sections_required', DETAIL = 'Add at least one section with one item.', HINT = 'sections';
  END IF;
  IF jsonb_array_length(p_sections) > 30 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'too_many_sections', DETAIL = 'A template has at most 30 sections.', HINT = 'sections';
  END IF;
  FOR v_section IN SELECT x FROM jsonb_array_elements(p_sections) AS x LOOP
    v_i := v_i + 1;
    IF jsonb_typeof(v_section) <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'section_invalid', DETAIL = format('Section %s could not be read.', v_i), HINT = 'sections.' || v_i;
    END IF;
    v_name := CASE WHEN jsonb_typeof(v_section -> 'section_name') = 'string' THEN btrim(v_section ->> 'section_name', v_ws) ELSE '' END;
    IF v_name = '' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'section_name_required', DETAIL = format('Name section %s.', v_i), HINT = 'sections.' || v_i;
    END IF;
    IF length(v_name) > 120 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'section_name_too_long', DETAIL = format('The name of section %s is longer than 120 characters.', v_i), HINT = 'sections.' || v_i;
    END IF;
    IF lower(v_name) = ANY (v_names) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'section_duplicate', DETAIL = format('Two sections are called %s.', v_name), HINT = 'sections.' || v_i;
    END IF;
    v_names := v_names || lower(v_name);
    v_items := v_section -> 'checklist_items';
    IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'section_items_required', DETAIL = format('Add at least one item to %s.', v_name), HINT = 'sections.' || v_i;
    END IF;
    IF jsonb_array_length(v_items) > 60 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'too_many_items', DETAIL = format('%s has more than 60 items.', v_name), HINT = 'sections.' || v_i;
    END IF;
    v_list := '[]'::jsonb;
    FOR v_item IN SELECT x FROM jsonb_array_elements(v_items) AS x LOOP
      IF jsonb_typeof(v_item) <> 'string' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'item_invalid', DETAIL = format('An item of %s could not be read.', v_name), HINT = 'sections.' || v_i;
      END IF;
      v_text := btrim(v_item #>> '{}', v_ws);
      IF v_text = '' OR length(v_text) > 300 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'item_invalid',
          DETAIL = format('Each item of %s needs 1 to 300 characters.', v_name), HINT = 'sections.' || v_i;
      END IF;
      v_list := v_list || to_jsonb(v_text);
    END LOOP;
    v_days := NULL;
    IF v_section ? 'required_days' AND jsonb_typeof(v_section -> 'required_days') <> 'null' THEN
      IF jsonb_typeof(v_section -> 'required_days') <> 'number' OR (v_section ->> 'required_days')::numeric <> trunc((v_section ->> 'required_days')::numeric)
         OR (v_section ->> 'required_days')::numeric NOT BETWEEN 0 AND 365 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'section_days_invalid', DETAIL = format('Days for %s are a whole number from 0 to 365.', v_name), HINT = 'sections.' || v_i;
      END IF;
      v_days := (v_section ->> 'required_days')::integer;
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('section_name', v_name, 'checklist_items', v_list, 'required_days', v_days)));
  END LOOP;
  RETURN v_out;
END;
$$;

-- Who may supervise (sign as supervisor, reopen) p_profile's familiarisation
-- on p_vessel (gap/04 W11, X1 spec §3 department scope): 'ok',
-- 'out_of_department', 'own_record' or 'not_permitted' (no
-- vessel.crew.familiarisation.approve there). The Master of the vessel,
-- a command-tier position and fleet reach supervise every department;
-- anyone else only their own department (both departments known and the
-- same). Internal.
CREATE OR REPLACE FUNCTION public.familiarisation_supervisor_scope(p_user uuid, p_profile uuid, p_vessel uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_me uuid;
  v_tier text;
  v_department text;
  v_subject_department text;
BEGIN
  IF p_user IS NULL OR p_profile IS NULL OR p_vessel IS NULL THEN
    RETURN 'not_permitted';
  END IF;
  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = p_vessel;
  IF v_company IS NULL
     OR NOT coalesce(public.has_capability_for(p_user, 'vessel.crew.familiarisation.approve', v_company, p_vessel), false) THEN
    RETURN 'not_permitted';
  END IF;
  SELECT p.id INTO v_me FROM public.profiles AS p WHERE p.user_id = p_user;
  IF v_me IS NOT DISTINCT FROM p_profile THEN
    RETURN 'own_record';
  END IF;
  IF coalesce(public.record_is_master(p_user, p_vessel), false) OR coalesce(public.fleet_reach_for(p_user, v_company), false) THEN
    RETURN 'ok';
  END IF;
  SELECT r.rank_tier, r.department_key INTO v_tier, v_department FROM public.crew_member_role_on(v_me, p_vessel) AS r;
  IF v_tier = 'command' THEN
    RETURN 'ok';
  END IF;
  SELECT r.department_key INTO v_subject_department FROM public.crew_member_role_on(p_profile, p_vessel) AS r;
  IF v_department IS NOT NULL AND v_subject_department IS NOT NULL AND v_department = v_subject_department THEN
    RETURN 'ok';
  END IF;
  RETURN 'out_of_department';
END;
$$;

-- The active templates that apply on a vessel: its own, and the company's
-- fleet templates without an active variant on it (T-134). Internal.
CREATE OR REPLACE FUNCTION public.familiarisation_vessel_templates(p_vessel_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT t.id
  FROM public.vessels AS v
  JOIN public.familiarization_templates AS t ON t.company_id = v.company_id AND t.is_active
  WHERE v.id = p_vessel_id
    AND (t.vessel_id = v.id
         OR (t.scope = 'fleet' AND t.vessel_id IS NULL
             AND NOT EXISTS (SELECT 1 FROM public.familiarization_templates AS x
                             WHERE x.variant_of = t.id AND x.vessel_id = v.id AND x.is_active)))
$$;

-- The templates required of a position on a vessel: the applicable
-- templates naming the position for every vessel or for this one. Internal.
CREATE OR REPLACE FUNCTION public.familiarisation_required_templates(p_vessel_id uuid, p_position_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT a.id
  FROM public.familiarisation_vessel_templates(p_vessel_id) AS a(id)
  WHERE p_position_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.familiarization_template_positions AS tp
                WHERE tp.template_id = a.id AND tp.position_id = p_position_id
                  AND (tp.vessel_id IS NULL OR tp.vessel_id = p_vessel_id))
$$;

-- A person's position on a vessel's crew today (the crew list entry's
-- titles matched through crew_position_for: the position, else the rank);
-- NULL when they are not on its crew or no title matches. Internal.
CREATE OR REPLACE FUNCTION public.familiarisation_member_position(p_vessel_id uuid, p_profile_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(public.crew_position_for(v.company_id, v.id, m.position_text), public.crew_position_for(v.company_id, v.id, m.rank_text))
  FROM public.vessels AS v
  CROSS JOIN LATERAL public.crew_vessel_members(v.id, current_date) AS m
  WHERE v.id = p_vessel_id AND m.profile_id = p_profile_id
  LIMIT 1
$$;

-- The record's status (and the legacy completion columns) from its items
-- and signatures; returns the status. Every writer reaches it (the item
-- trigger, sign, reopen); it sets the engine flag for its own update.
-- Internal.
CREATE OR REPLACE FUNCTION public.familiarisation_record_recompute(p_record_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total integer;
  v_done integer;
  v_rec public.familiarization_records%ROWTYPE;
  v_status text;
BEGIN
  SELECT * INTO v_rec FROM public.familiarization_records WHERE id = p_record_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT count(*)::integer, (count(*) FILTER (WHERE i.completed))::integer INTO v_total, v_done
  FROM public.familiarization_checklist_items AS i WHERE i.familiarization_id = p_record_id;
  v_status := public.familiarisation_status_decide(v_total, v_done, v_rec.requires_crew_signature, v_rec.crew_signed_at IS NOT NULL,
                                                   v_rec.requires_supervisor_signature, v_rec.supervisor_signed_at IS NOT NULL);
  PERFORM set_config('storm.crew_engine', 'on', true);
  UPDATE public.familiarization_records
  SET status = v_status,
      completion_percentage = CASE WHEN v_total = 0 THEN 0 ELSE round(v_done::numeric * 100 / v_total)::integer END,
      actual_completion_date = CASE WHEN v_status = 'completed' THEN coalesce(actual_completion_date, current_date) END
  WHERE id = p_record_id
    AND (status IS DISTINCT FROM v_status
         OR completion_percentage IS DISTINCT FROM CASE WHEN v_total = 0 THEN 0 ELSE round(v_done::numeric * 100 / v_total)::integer END
         OR (v_status = 'completed') <> (actual_completion_date IS NOT NULL));
  RETURN v_status;
END;
$$;

-- Tells the person (their login, when they have one) that a familiarisation
-- was opened for them (familiarisation_assigned, vessel link to the record).
-- Never raises (D-128): a missing type or fan-out problem logs a warning.
-- Internal.
CREATE OR REPLACE FUNCTION public.familiarisation_notify_assigned(p_record_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r record;
  v_id uuid;
BEGIN
  SELECT fr.id, fr.company_id, fr.vessel_id, fr.due_date, p.user_id, t.template_name, t.code, v.name AS vessel_name
  INTO r
  FROM public.familiarization_records AS fr
  JOIN public.profiles AS p ON p.id = fr.profile_id
  JOIN public.vessels AS v ON v.id = fr.vessel_id
  LEFT JOIN public.familiarization_templates AS t ON t.id = fr.template_id
  WHERE fr.id = p_record_id;
  IF NOT FOUND OR r.user_id IS NULL THEN
    RETURN NULL;
  END IF;
  BEGIN
    v_id := public.emit_notification_event(
      p_type_key => 'familiarisation_assigned',
      p_company_id => r.company_id,
      p_title => left(format('Familiarisation: %s', coalesce(r.template_name, 'checklist')), 120),
      p_link_scope => 'vessel',
      p_vessel_id => r.vessel_id,
      p_body => left(format('Complete %s on %s%s.', coalesce(r.template_name, 'your familiarisation'), r.vessel_name,
                            CASE WHEN r.due_date IS NOT NULL THEN ' by ' || to_char(r.due_date, 'FMDD Mon YYYY') ELSE '' END), 280),
      p_severity => 'info',
      p_link_path => 'crew/familiarisation/' || r.id::text,
      p_record_ref => r.code,
      p_must_act_user_ids => ARRAY[r.user_id],
      p_payload => jsonb_build_object('record_id', r.id, 'vessel_id', r.vessel_id, 'due_date', r.due_date),
      p_dedupe_key => 'familiarisation_assigned:' || r.id::text,
      p_module_key => 'crew');
  EXCEPTION WHEN others THEN
    RAISE WARNING 'familiarisation_notify_assigned: familiarisation_assigned not sent (%): %', SQLSTATE, SQLERRM;
    v_id := NULL;
  END;
  RETURN v_id;
END;
$$;

-- Opens a record of a template for a person on a vessel: the template's
-- sections become the checklist items (the C63 fix), the signature flags
-- are copied, due = p_due_from (default the join date) + due_within_days.
-- Returns the record id, or NULL when the person already has a live (not
-- completed) record of it there: at most one, checked under a transaction
-- advisory lock on (template, vessel, person), so two openers never race
-- (the "ON CONFLICT DO NOTHING" of the spec without a unique index that
-- legacy duplicate rows could break). Internal: the definers check who and
-- what first.
CREATE OR REPLACE FUNCTION public.familiarisation_open_record(p_template_id uuid, p_profile_id uuid, p_vessel_id uuid, p_join date, p_actor uuid, p_due_from date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_t public.familiarization_templates%ROWTYPE;
  v_company uuid;
  v_user uuid;
  v_join date := coalesce(p_join, current_date);
  v_due date;
  v_id uuid;
  v_section jsonb;
  v_item jsonb;
  v_si integer := 0;
  v_ii integer;
BEGIN
  SELECT * INTO v_t FROM public.familiarization_templates WHERE id = p_template_id;
  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = p_vessel_id;
  SELECT p.user_id INTO v_user FROM public.profiles AS p WHERE p.id = p_profile_id AND p.company_id = v_company;
  IF v_t.id IS NULL OR v_company IS NULL OR v_t.company_id IS DISTINCT FROM v_company OR NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_due := coalesce(p_due_from, v_join) + coalesce(v_t.due_within_days, v_t.total_duration_days, 14);
  PERFORM pg_advisory_xact_lock(hashtextextended('familiarisation:' || p_template_id::text || ':' || p_vessel_id::text || ':' || p_profile_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.familiarization_records AS x
             WHERE x.template_id = p_template_id AND x.vessel_id = p_vessel_id AND x.profile_id = p_profile_id AND x.status <> 'completed') THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('storm.crew_engine', 'on', true);
  INSERT INTO public.familiarization_records AS fr (
    company_id, profile_id, user_id, vessel_id, template_id, join_date, target_completion_date, due_date, status,
    completion_percentage, requires_crew_signature, requires_supervisor_signature, created_by
  ) VALUES (
    v_company, p_profile_id, v_user, p_vessel_id, p_template_id, v_join, v_due, v_due, 'open',
    0, v_t.requires_crew_signature, v_t.requires_supervisor_signature, p_actor
  )
  RETURNING fr.id INTO v_id;
  FOR v_section IN SELECT x FROM jsonb_array_elements(coalesce(v_t.sections, '[]'::jsonb)) AS x LOOP
    v_si := v_si + 1;
    v_ii := 0;
    FOR v_item IN SELECT x FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_section -> 'checklist_items') = 'array' THEN v_section -> 'checklist_items' ELSE '[]'::jsonb END) AS x LOOP
      v_ii := v_ii + 1;
      INSERT INTO public.familiarization_checklist_items (familiarization_id, section_name, item_text, item_order, completed)
      VALUES (v_id, left(btrim(coalesce(v_section ->> 'section_name', 'Checklist')), 120), left(btrim(v_item #>> '{}'), 300),
              v_si * 1000 + v_ii, false);
    END LOOP;
  END LOOP;
  PERFORM public.familiarisation_record_recompute(v_id);
  RETURN v_id;
END;
$$;

-- Keeps Crew Compliance in step with a template's required positions (C36):
-- one familiarisation requirement row per vessel the template applies to
-- (seed_key familiarisation.<template id>), its option the template, its
-- ticks the template's positions for every vessel or for that one. A
-- vessel the template no longer applies to (inactive, no positions, a
-- variant replaces it) loses the row. Internal.
CREATE OR REPLACE FUNCTION public.familiarisation_requirement_sync(p_template_id uuid, p_actor uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_t public.familiarization_templates%ROWTYPE;
  v_seed text := 'familiarisation.' || replace(p_template_id::text, '-', '_');
  v_vessel uuid;
  v_row uuid;
  v_n integer := 0;
  v_want uuid[];
BEGIN
  SELECT * INTO v_t FROM public.familiarization_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    DELETE FROM public.crew_requirement_rows WHERE seed_key = v_seed;
    RETURN 0;
  END IF;
  SELECT coalesce(array_agg(v.id), ARRAY[]::uuid[]) INTO v_want
  FROM public.vessels AS v
  WHERE v.company_id = v_t.company_id
    AND v_t.id IN (SELECT public.familiarisation_vessel_templates(v.id))
    AND EXISTS (SELECT 1 FROM public.familiarization_template_positions AS tp
                WHERE tp.template_id = v_t.id AND (tp.vessel_id IS NULL OR tp.vessel_id = v.id));
  DELETE FROM public.crew_requirement_rows AS r WHERE r.seed_key = v_seed AND NOT (r.vessel_id = ANY (v_want));
  FOREACH v_vessel IN ARRAY v_want LOOP
    INSERT INTO public.crew_requirement_rows AS r (company_id, vessel_id, group_key, label, kind, sort_order, seed_key, created_by, updated_by)
    VALUES (v_t.company_id, v_vessel, 'familiarisation', left(btrim(v_t.template_name), 120), 'familiarisation', 5000, v_seed, p_actor, p_actor)
    ON CONFLICT (vessel_id, seed_key) DO UPDATE SET label = EXCLUDED.label, updated_by = EXCLUDED.updated_by
    RETURNING r.id INTO v_row;
    INSERT INTO public.crew_requirement_options (row_id, familiarization_template_id, sort_order)
    VALUES (v_row, v_t.id, 0)
    ON CONFLICT (row_id, familiarization_template_id) DO NOTHING;
    DELETE FROM public.crew_requirement_positions AS rp
    WHERE rp.row_id = v_row
      AND rp.position_id NOT IN (SELECT tp.position_id FROM public.familiarization_template_positions AS tp
                                 WHERE tp.template_id = v_t.id AND (tp.vessel_id IS NULL OR tp.vessel_id = v_vessel));
    INSERT INTO public.crew_requirement_positions (row_id, position_id, created_by)
    SELECT DISTINCT v_row, tp.position_id, p_actor
    FROM public.familiarization_template_positions AS tp
    WHERE tp.template_id = v_t.id AND (tp.vessel_id IS NULL OR tp.vessel_id = v_vessel)
    ON CONFLICT (row_id, position_id) DO NOTHING;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

-- Opens every familiarisation required of a person's position on a vessel
-- (W11: joining or transfer), from the joining date. The position is the
-- given one, else the person's crew list position there. A person with an
-- open record of a template, or one completed on that vessel in the last
-- 12 months, gets none (ON CONFLICT DO NOTHING on the live record). Sends
-- familiarisation_assigned to their login when there is one. Returns the
-- number of records opened. Internal (the terms trigger; no browser grant).
CREATE OR REPLACE FUNCTION public.familiarisation_open_required(p_profile_id uuid, p_vessel_id uuid, p_position_id uuid, p_join date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_position uuid := coalesce(p_position_id, public.familiarisation_member_position(p_vessel_id, p_profile_id));
  v_template uuid;
  v_id uuid;
  v_n integer := 0;
BEGIN
  IF p_profile_id IS NULL OR p_vessel_id IS NULL OR v_position IS NULL THEN
    RETURN 0;
  END IF;
  FOR v_template IN SELECT t.id FROM public.familiarisation_required_templates(p_vessel_id, v_position) AS t(id) LOOP
    IF EXISTS (SELECT 1 FROM public.familiarization_records AS fr
               WHERE fr.template_id = v_template AND fr.vessel_id = p_vessel_id AND fr.profile_id = p_profile_id
                 AND fr.status = 'completed' AND coalesce(fr.actual_completion_date, fr.updated_at::date) > current_date - 365) THEN
      CONTINUE;
    END IF;
    v_id := public.familiarisation_open_record(v_template, p_profile_id, p_vessel_id, coalesce(p_join, current_date), auth.uid());
    IF v_id IS NOT NULL THEN
      v_n := v_n + 1;
      PERFORM public.familiarisation_notify_assigned(v_id);
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;

-- A record as the record page reads it: the record, the person, the
-- template, the items in order, the counts and overdue, and (with
-- p_with_rights) what the caller may do, from the same rules the definers
-- apply (familiarisation_action_check and familiarisation_actor_decide).
-- Internal.
CREATE OR REPLACE FUNCTION public.familiarisation_record_json(p_record_id uuid, p_with_rights boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  r record;
  v_items jsonb;
  v_total integer;
  v_done integer;
  v_rights jsonb := NULL;
  v_own boolean;
  v_view_own boolean;
  v_edit boolean;
  v_create boolean;
  v_scope text;
  v_any_signed boolean;
BEGIN
  SELECT fr.*, p.first_name, p.last_name, p.preferred_name, p.avatar_url, p.user_id AS person_user_id,
         t.template_name, t.code AS template_code, t.description AS template_description, t.scope AS template_scope,
         v.name AS vessel_name,
         cs.first_name AS crew_signer_first, cs.last_name AS crew_signer_last,
         ss.first_name AS supervisor_first, ss.last_name AS supervisor_last,
         ro.first_name AS reopened_first, ro.last_name AS reopened_last
  INTO r
  FROM public.familiarization_records AS fr
  JOIN public.vessels AS v ON v.id = fr.vessel_id
  LEFT JOIN public.profiles AS p ON p.id = fr.profile_id
  LEFT JOIN public.familiarization_templates AS t ON t.id = fr.template_id
  LEFT JOIN public.profiles AS cs ON cs.user_id = fr.crew_signed_by
  LEFT JOIN public.profiles AS ss ON ss.user_id = fr.supervisor_signed_by
  LEFT JOIN public.profiles AS ro ON ro.user_id = fr.reopened_by
  WHERE fr.id = p_record_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'section_name', i.section_name, 'item_text', i.item_text, 'item_order', i.item_order,
           'completed', i.completed, 'completed_date', i.completed_date, 'notes', i.notes,
           'completed_by_name', nullif(btrim(concat_ws(' ', cb.first_name, cb.last_name)), ''))
         ORDER BY i.item_order, i.id), '[]'::jsonb),
         count(*)::integer, (count(*) FILTER (WHERE i.completed))::integer
  INTO v_items, v_total, v_done
  FROM public.familiarization_checklist_items AS i
  LEFT JOIN public.profiles AS cb ON cb.user_id = i.completed_by_id
  WHERE i.familiarization_id = p_record_id;
  v_any_signed := r.crew_signed_at IS NOT NULL OR r.supervisor_signed_at IS NOT NULL;
  IF p_with_rights THEN
    v_own := r.profile_id IS NOT DISTINCT FROM public.my_profile_id() AND r.profile_id IS NOT NULL;
    v_view_own := coalesce(public.crew_vessel_cap('vessel.crew.familiarisation.view_own', r.vessel_id), false);
    v_edit := coalesce(public.crew_vessel_cap('vessel.crew.familiarisation.edit', r.vessel_id), false) AND NOT public.crew_caller_is_external();
    v_create := coalesce(public.crew_vessel_cap('vessel.crew.familiarisation.create', r.vessel_id), false) AND NOT public.crew_caller_is_external();
    v_scope := CASE WHEN public.crew_caller_is_external() THEN 'not_permitted' ELSE public.familiarisation_supervisor_scope(v_uid, r.profile_id, r.vessel_id) END;
    v_rights := jsonb_build_object(
      'tick', CASE WHEN public.familiarisation_actor_decide('tick', v_own, r.person_user_id IS NOT NULL, v_view_own, v_edit, v_create, v_scope) <> 'ok'
                   THEN public.familiarisation_actor_decide('tick', v_own, r.person_user_id IS NOT NULL, v_view_own, v_edit, v_create, v_scope)
                   ELSE public.familiarisation_action_check('tick', r.status, v_done, r.crew_signed_at IS NOT NULL, r.supervisor_signed_at IS NOT NULL,
                                                            r.requires_crew_signature, r.requires_supervisor_signature) END,
      'sign_crew', CASE WHEN public.familiarisation_actor_decide('sign_crew', v_own, r.person_user_id IS NOT NULL, v_view_own, v_edit, v_create, v_scope) <> 'ok'
                        THEN public.familiarisation_actor_decide('sign_crew', v_own, r.person_user_id IS NOT NULL, v_view_own, v_edit, v_create, v_scope)
                        ELSE public.familiarisation_action_check('sign_crew', r.status, v_done, r.crew_signed_at IS NOT NULL, r.supervisor_signed_at IS NOT NULL,
                                                                 r.requires_crew_signature, r.requires_supervisor_signature) END,
      'sign_supervisor', CASE WHEN public.familiarisation_actor_decide('sign_supervisor', v_own, r.person_user_id IS NOT NULL, v_view_own, v_edit, v_create, v_scope) <> 'ok'
                              THEN public.familiarisation_actor_decide('sign_supervisor', v_own, r.person_user_id IS NOT NULL, v_view_own, v_edit, v_create, v_scope)
                              ELSE public.familiarisation_action_check('sign_supervisor', r.status, v_done, r.crew_signed_at IS NOT NULL, r.supervisor_signed_at IS NOT NULL,
                                                                       r.requires_crew_signature, r.requires_supervisor_signature) END,
      'reopen', CASE WHEN public.familiarisation_actor_decide('reopen', v_own, r.person_user_id IS NOT NULL, v_view_own, v_edit, v_create, v_scope) <> 'ok'
                     THEN public.familiarisation_actor_decide('reopen', v_own, r.person_user_id IS NOT NULL, v_view_own, v_edit, v_create, v_scope)
                     ELSE public.familiarisation_action_check('reopen', r.status, v_done, r.crew_signed_at IS NOT NULL, r.supervisor_signed_at IS NOT NULL,
                                                              r.requires_crew_signature, r.requires_supervisor_signature) END,
      'delete', CASE WHEN public.familiarisation_actor_decide('delete', v_own, r.person_user_id IS NOT NULL, v_view_own, v_edit, v_create, v_scope) <> 'ok'
                     THEN public.familiarisation_actor_decide('delete', v_own, r.person_user_id IS NOT NULL, v_view_own, v_edit, v_create, v_scope)
                     ELSE public.familiarisation_action_check('delete', r.status, v_done, r.crew_signed_at IS NOT NULL, r.supervisor_signed_at IS NOT NULL,
                                                              r.requires_crew_signature, r.requires_supervisor_signature) END,
      'is_own', v_own);
  END IF;
  RETURN jsonb_build_object(
    'id', r.id,
    'company_id', r.company_id,
    'vessel_id', r.vessel_id,
    'vessel_name', r.vessel_name,
    'template_id', r.template_id,
    'template_code', r.template_code,
    'template_name', coalesce(r.template_name, 'Familiarisation'),
    'template_description', r.template_description,
    'template_scope', r.template_scope,
    'profile_id', r.profile_id,
    'user_id', r.user_id,
    'person', jsonb_build_object('first_name', r.first_name, 'last_name', r.last_name, 'preferred_name', r.preferred_name,
                                 'avatar_url', r.avatar_url, 'has_login', r.person_user_id IS NOT NULL),
    'status', r.status,
    'join_date', r.join_date,
    'due_date', coalesce(r.due_date, r.target_completion_date),
    'overdue', public.familiarisation_overdue(r.status, coalesce(r.due_date, r.target_completion_date), current_date),
    'completed_on', r.actual_completion_date,
    'items_total', v_total,
    'items_done', v_done,
    'requires_crew_signature', r.requires_crew_signature,
    'requires_supervisor_signature', r.requires_supervisor_signature,
    'crew_signed_at', r.crew_signed_at,
    'crew_signed_by_name', nullif(btrim(concat_ws(' ', r.crew_signer_first, r.crew_signer_last)), ''),
    'supervisor_signed_at', r.supervisor_signed_at,
    'supervisor_signed_by_name', nullif(btrim(concat_ws(' ', r.supervisor_first, r.supervisor_last)), ''),
    'reopened_at', r.reopened_at,
    'reopened_reason', r.reopened_reason,
    'reopened_by_name', nullif(btrim(concat_ws(' ', r.reopened_first, r.reopened_last)), ''),
    'created_at', r.created_at,
    'updated_at', r.updated_at,
    'items', v_items,
    'rights', v_rights);
END;
$$;

-- The record of a write RPC: a signed-in, active caller; the record exists
-- and the caller may see it (familiarisation.view on its vessel, not an
-- external viewer; or their own with view_own), else P0002 so no id leaks.
-- Locks the record row and returns it. Internal.
CREATE OR REPLACE FUNCTION public.familiarisation_record_gate(p_record_id uuid)
RETURNS public.familiarization_records
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rec public.familiarization_records%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  IF NOT coalesce(public.user_is_active(v_uid), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'Your account is not active.';
  END IF;
  SELECT * INTO v_rec FROM public.familiarization_records WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND
     OR v_rec.company_id IS DISTINCT FROM public.get_user_company_id(v_uid)
     OR NOT ((coalesce(public.crew_vessel_cap('vessel.crew.familiarisation.view', v_rec.vessel_id), false) AND NOT public.crew_caller_is_external())
             OR (v_rec.profile_id IS NOT DISTINCT FROM public.my_profile_id() AND v_rec.profile_id IS NOT NULL
                 AND coalesce(public.crew_vessel_cap('vessel.crew.familiarisation.view_own', v_rec.vessel_id), false))) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'record_not_found', DETAIL = 'This familiarisation record could not be found.';
  END IF;
  RETURN v_rec;
END;
$$;

-- A template as the page reads it (the overview's entries and the save's
-- answer). Internal.
CREATE OR REPLACE FUNCTION public.familiarisation_template_json(p_template_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', t.id, 'code', t.code, 'name', t.template_name, 'description', t.description, 'scope', t.scope,
    'vessel_id', t.vessel_id, 'variant_of', t.variant_of, 'due_within_days', t.due_within_days,
    'requires_crew_signature', t.requires_crew_signature, 'requires_supervisor_signature', t.requires_supervisor_signature,
    'is_active', t.is_active, 'form_template_id', t.form_template_id, 'sections', coalesce(t.sections, '[]'::jsonb),
    'item_count', (SELECT coalesce(sum(CASE WHEN jsonb_typeof(s -> 'checklist_items') = 'array' THEN jsonb_array_length(s -> 'checklist_items') ELSE 0 END), 0)::integer
                   FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.sections) = 'array' THEN t.sections ELSE '[]'::jsonb END) AS s),
    'position_ids', coalesce((SELECT jsonb_agg(DISTINCT tp.position_id) FROM public.familiarization_template_positions AS tp
                              WHERE tp.template_id = t.id AND tp.vessel_id IS NOT DISTINCT FROM t.vessel_id), '[]'::jsonb),
    'updated_at', t.updated_at)
  FROM public.familiarization_templates AS t
  WHERE t.id = p_template_id
$$;

-- ---------------------------------------------------------------- guards (every writer; engine-only for signed-in writers)

-- familiarization_templates (BEFORE INSERT / UPDATE / DELETE).
-- * Every writer: the company follows the vessel (a vessel template) and
--   must equal it; the scope follows the vessel (no vessel = fleet); a
--   variant names an active fleet template of the company; the code is
--   allocated once (format_reference) and never changes, nor do the
--   company, the scope and the vessel; updated_at / updated_by stamped.
-- * A signed-in writer without storm.crew_engine = 'on' writes nothing
--   (42501 familiarisation_engine_only): templates are saved through
--   familiarisation_template_save. The service role and no-JWT
--   maintenance are exempt (D-132 style).
CREATE OR REPLACE FUNCTION public.familiarization_templates_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_signed boolean := auth.uid() IS NOT NULL;
  v_engine boolean := coalesce(current_setting('storm.crew_engine', true), '') = 'on';
  v_company uuid;
BEGIN
  IF v_signed AND NOT v_engine THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'familiarisation_engine_only',
      DETAIL = 'Familiarisation templates are saved in STORM''s familiarisation pages.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NEW.vessel_id IS NOT NULL THEN
    SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = NEW.vessel_id;
    NEW.company_id := coalesce(NEW.company_id, v_company);
    IF v_company IS NULL OR NEW.company_id IS DISTINCT FROM v_company THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'familiarisation_template_scope_mismatch',
        DETAIL = 'A vessel template belongs to its vessel''s company.';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.scope IS DISTINCT FROM 'vessel' THEN
      NEW.scope := 'vessel';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.scope := 'fleet';
  END IF;
  IF NEW.company_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.companies AS c WHERE c.id = NEW.company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'familiarisation_template_scope_mismatch',
      DETAIL = 'A familiarisation template belongs to a company.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.scope IS DISTINCT FROM OLD.scope
       OR NEW.vessel_id IS DISTINCT FROM OLD.vessel_id
       OR (OLD.code IS NOT NULL AND NEW.code IS DISTINCT FROM OLD.code) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'familiarisation_template_scope_locked',
        DETAIL = 'A template keeps its company, scope, vessel and code.';
    END IF;
  END IF;
  IF NEW.variant_of IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.variant_of IS DISTINCT FROM OLD.variant_of) AND NOT EXISTS (
    SELECT 1 FROM public.familiarization_templates AS f
    WHERE f.id = NEW.variant_of AND f.company_id = NEW.company_id AND f.scope = 'fleet'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'familiarisation_variant_invalid',
      DETAIL = 'A vessel variant names a fleet template of its own company.';
  END IF;
  IF NEW.code IS NULL THEN
    NEW.code := public.format_reference('FAM', NEW.company_id, NEW.vessel_id, current_date);
  END IF;
  NEW.updated_at := now();
  IF v_signed THEN
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

-- familiarization_records (BEFORE INSERT / UPDATE / DELETE).
-- * Every writer: the profile follows the login and the login the profile;
--   the company follows the vessel; the person, the vessel and the
--   template belong to that company (23514 familiarisation_record_scope_
--   mismatch); legacy statuses are mapped (Not_Started -> open,
--   In_Progress / Overdue -> in_progress, Completed -> completed); the due
--   date and the legacy target follow each other.
-- * A signed-in writer without storm.crew_engine = 'on' inserts and deletes
--   nothing and changes no status, completion, signature, reopen, subject,
--   vessel, template or flag column (42501 familiarisation_engine_only).
--   The service role and no-JWT maintenance are exempt.
CREATE OR REPLACE FUNCTION public.familiarization_records_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_signed boolean := auth.uid() IS NOT NULL;
  v_engine boolean := coalesce(current_setting('storm.crew_engine', true), '') = 'on';
  v_company uuid;
  v_profile_company uuid;
  v_profile_user uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF v_signed AND NOT v_engine THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'familiarisation_engine_only',
        DETAIL = 'A familiarisation record started by mistake is deleted on its record page.';
    END IF;
    RETURN OLD;
  END IF;
  IF v_signed AND NOT v_engine THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'familiarisation_engine_only',
        DETAIL = 'Familiarisation records are started in STORM''s familiarisation pages.';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.completion_percentage IS DISTINCT FROM OLD.completion_percentage
       OR NEW.actual_completion_date IS DISTINCT FROM OLD.actual_completion_date
       OR NEW.crew_signed_at IS DISTINCT FROM OLD.crew_signed_at OR NEW.crew_signed_by IS DISTINCT FROM OLD.crew_signed_by
       OR NEW.supervisor_signed_at IS DISTINCT FROM OLD.supervisor_signed_at OR NEW.supervisor_signed_by IS DISTINCT FROM OLD.supervisor_signed_by
       OR NEW.reopened_reason IS DISTINCT FROM OLD.reopened_reason OR NEW.reopened_by IS DISTINCT FROM OLD.reopened_by
       OR NEW.reopened_at IS DISTINCT FROM OLD.reopened_at
       OR NEW.profile_id IS DISTINCT FROM OLD.profile_id OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.vessel_id IS DISTINCT FROM OLD.vessel_id
       OR NEW.template_id IS DISTINCT FROM OLD.template_id
       OR NEW.requires_crew_signature IS DISTINCT FROM OLD.requires_crew_signature
       OR NEW.requires_supervisor_signature IS DISTINCT FROM OLD.requires_supervisor_signature
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'familiarisation_engine_only',
        DETAIL = 'A familiarisation record moves on through its checklist and its signatures.';
    END IF;
  END IF;

  -- Legacy statuses (the old trigger and the legacy page wrote these).
  NEW.status := CASE lower(btrim(coalesce(NEW.status, '')))
    WHEN 'not_started' THEN 'open'
    WHEN '' THEN 'open'
    WHEN 'in_progress' THEN 'in_progress'
    WHEN 'overdue' THEN 'in_progress'
    WHEN 'completed' THEN 'completed'
    ELSE NEW.status
  END;

  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = NEW.vessel_id;
  NEW.company_id := coalesce(NEW.company_id, v_company);
  IF NEW.profile_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT p.id INTO NEW.profile_id FROM public.profiles AS p WHERE p.user_id = NEW.user_id;
  END IF;
  IF NEW.profile_id IS NOT NULL THEN
    SELECT p.company_id, p.user_id INTO v_profile_company, v_profile_user FROM public.profiles AS p WHERE p.id = NEW.profile_id;
    IF NEW.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM v_profile_user THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'familiarisation_record_scope_mismatch',
        DETAIL = 'A familiarisation record names one person.';
    END IF;
    NEW.user_id := coalesce(NEW.user_id, v_profile_user);
  END IF;
  IF v_company IS NULL OR NEW.company_id IS DISTINCT FROM v_company
     OR (NEW.profile_id IS NOT NULL AND v_profile_company IS DISTINCT FROM v_company)
     OR (NEW.template_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.familiarization_templates AS t WHERE t.id = NEW.template_id AND t.company_id = v_company)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'familiarisation_record_scope_mismatch',
      DETAIL = 'A familiarisation record names a person, a vessel and a template of one company.';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.due_date := coalesce(NEW.due_date, NEW.target_completion_date);
    NEW.target_completion_date := coalesce(NEW.target_completion_date, NEW.due_date);
  ELSIF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    NEW.target_completion_date := coalesce(NEW.due_date, NEW.target_completion_date);
  ELSIF NEW.target_completion_date IS DISTINCT FROM OLD.target_completion_date THEN
    NEW.due_date := NEW.target_completion_date;
  END IF;
  RETURN NEW;
END;
$$;

-- familiarization_checklist_items (BEFORE INSERT / UPDATE / DELETE): a
-- signed-in writer without the engine flag writes nothing (42501
-- familiarisation_engine_only); items are ticked through
-- familiarisation_tick. The service role and no-JWT maintenance are exempt.
CREATE OR REPLACE FUNCTION public.familiarization_checklist_items_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND current_setting('storm.crew_engine', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'familiarisation_engine_only',
      DETAIL = 'Familiarisation items are ticked on the record page.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- A record's status follows its items for every writer (AFTER INSERT /
-- UPDATE OF completed / DELETE on familiarization_checklist_items; replaces
-- the legacy trg_recompute_familiarization_progress, which marked a record
-- Completed at 100 per cent without any signature).
CREATE OR REPLACE FUNCTION public.familiarization_items_recompute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.familiarisation_record_recompute(coalesce(NEW.familiarization_id, OLD.familiarization_id));
  RETURN NULL;
END;
$$;

-- familiarization_template_positions (BEFORE INSERT / UPDATE): the company
-- is the template's; the vessel row is the template's vessel for a vessel
-- template (or NULL), any vessel of the company for a fleet template (or
-- NULL); the position is visible there (STORM's, the company's, or the
-- vessel's own).
CREATE OR REPLACE FUNCTION public.familiarization_template_positions_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.familiarization_templates%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM public.familiarization_templates WHERE id = NEW.template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'familiarisation_position_scope_mismatch', DETAIL = 'The template could not be found.';
  END IF;
  NEW.company_id := coalesce(NEW.company_id, v_t.company_id);
  IF v_t.scope = 'vessel' THEN
    NEW.vessel_id := coalesce(NEW.vessel_id, v_t.vessel_id);
  END IF;
  IF NEW.company_id IS DISTINCT FROM v_t.company_id
     OR (v_t.scope = 'vessel' AND NEW.vessel_id IS DISTINCT FROM v_t.vessel_id)
     OR (NEW.vessel_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = NEW.vessel_id AND v.company_id = v_t.company_id))
     OR NOT EXISTS (SELECT 1 FROM public.positions AS pos
                    WHERE pos.id = NEW.position_id
                      AND (pos.company_id IS NULL OR pos.company_id = v_t.company_id)
                      AND (pos.vessel_id IS NULL OR pos.vessel_id = NEW.vessel_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'familiarisation_position_scope_mismatch',
      DETAIL = 'A required position is one the template''s vessel or company can see.';
  END IF;
  RETURN NEW;
END;
$$;

-- Add Crew and transfers (crew_assignment_terms AFTER INSERT): open the
-- familiarisations the new position needs on the vessel (W11), from the
-- joining date. Never fails the insert (D-128): any problem is a warning.
CREATE OR REPLACE FUNCTION public.familiarisation_required_on_terms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.familiarisation_open_required(NEW.profile_id, NEW.vessel_id, NEW.position_id,
                                                 coalesce(NEW.date_joining_vessel, NEW.start_date));
  EXCEPTION WHEN others THEN
    RAISE WARNING 'familiarisation_required_on_terms: required familiarisations not opened (%): %', SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

-- The legacy progress trigger is replaced (its statuses are mapped above).
DROP TRIGGER IF EXISTS trg_recompute_familiarization_progress ON public.familiarization_checklist_items;
DROP FUNCTION IF EXISTS public.recompute_familiarization_progress();

DROP TRIGGER IF EXISTS familiarization_templates_guard ON public.familiarization_templates;
CREATE TRIGGER familiarization_templates_guard BEFORE INSERT OR UPDATE OR DELETE ON public.familiarization_templates
  FOR EACH ROW EXECUTE FUNCTION public.familiarization_templates_guard();
DROP TRIGGER IF EXISTS familiarization_records_status_guard ON public.familiarization_records;
CREATE TRIGGER familiarization_records_status_guard BEFORE INSERT OR UPDATE OR DELETE ON public.familiarization_records
  FOR EACH ROW EXECUTE FUNCTION public.familiarization_records_status_guard();
DROP TRIGGER IF EXISTS familiarization_checklist_items_guard ON public.familiarization_checklist_items;
CREATE TRIGGER familiarization_checklist_items_guard BEFORE INSERT OR UPDATE OR DELETE ON public.familiarization_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.familiarization_checklist_items_guard();
DROP TRIGGER IF EXISTS familiarization_items_recompute ON public.familiarization_checklist_items;
CREATE TRIGGER familiarization_items_recompute AFTER INSERT OR UPDATE OF completed OR DELETE ON public.familiarization_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.familiarization_items_recompute();
DROP TRIGGER IF EXISTS familiarization_template_positions_scope_guard ON public.familiarization_template_positions;
CREATE TRIGGER familiarization_template_positions_scope_guard BEFORE INSERT OR UPDATE ON public.familiarization_template_positions
  FOR EACH ROW EXECUTE FUNCTION public.familiarization_template_positions_scope_guard();
DROP TRIGGER IF EXISTS trg_familiarization_template_positions_updated_at ON public.familiarization_template_positions;
CREATE TRIGGER trg_familiarization_template_positions_updated_at BEFORE UPDATE ON public.familiarization_template_positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS familiarisation_required_on_terms ON public.crew_assignment_terms;
CREATE TRIGGER familiarisation_required_on_terms AFTER INSERT ON public.crew_assignment_terms
  FOR EACH ROW EXECUTE FUNCTION public.familiarisation_required_on_terms();

-- Legacy statuses of existing records: completed stays completed (signed off
-- under the old rules); every other record takes the status its items give
-- (the flags it was opened with, no signatures yet). The engine flag lets
-- this maintenance pass the guard in a signed-in apply session too.
DO $$
DECLARE
  r record;
BEGIN
  PERFORM set_config('storm.crew_engine', 'on', true);
  UPDATE public.familiarization_records SET status = 'completed' WHERE lower(status) = 'completed' AND status <> 'completed';
  FOR r IN SELECT id FROM public.familiarization_records WHERE status NOT IN ('open', 'in_progress', 'awaiting_signatures', 'completed') LOOP
    PERFORM public.familiarisation_record_recompute(r.id);
  END LOOP;
  PERFORM set_config('storm.crew_engine', 'off', true);
END
$$;

ALTER TABLE public.familiarization_records DROP CONSTRAINT IF EXISTS familiarization_records_status_check;
ALTER TABLE public.familiarization_records ADD CONSTRAINT familiarization_records_status_check
  CHECK (status IN ('open', 'in_progress', 'awaiting_signatures', 'completed')) NOT VALID;
ALTER TABLE public.familiarization_records VALIDATE CONSTRAINT familiarization_records_status_check;
-- One live (not completed) record of a template per person and vessel is
-- kept by familiarisation_open_record (advisory lock + check), not by a
-- unique index: legacy rows may hold duplicates and the apply must not fail.

-- ---------------------------------------------------------------- RPCs: templates

-- Creates or updates a template (gap/04 C63, W11; T-15, T-134).
-- p_vessel_id is the vessel the caller works from (the company and, for a
-- vessel template, its vessel). p_payload keys: name, description, scope
-- (create only: vessel | fleet), due_within_days (0-365),
-- requires_crew_signature, requires_supervisor_signature, sections (see
-- familiarisation_sections_normalise), position_ids (positions visible on
-- the vessel; a fleet template takes STORM's and the company's), is_active,
-- variant_of (create only, a vessel template: an active fleet template of
-- the company), form_template_id (a form template of the company).
-- Gate: a vessel template needs familiarisation.edit on its vessel; a fleet
-- template the company-level edit answer and fleet reach (or acting for
-- the company). Refusals: 42501 with a sentence, P0002 template_not_found,
-- 22023 field_unknown / name_required / ... with HINT naming the field.
-- Returns the template (familiarisation_template_json).
CREATE OR REPLACE FUNCTION public.familiarisation_template_save(p_vessel_id uuid, p_template_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_old public.familiarization_templates%ROWTYPE;
  v_id uuid := p_template_id;
  v_key text;
  v_scope text;
  v_name text;
  v_desc text;
  v_due integer;
  v_crew boolean;
  v_sup boolean;
  v_sections jsonb;
  v_active boolean;
  v_variant uuid;
  v_form uuid;
  v_positions uuid[];
  v_bad uuid;
  v_tpl_vessel uuid;
  v_parent uuid;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'payload_invalid', DETAIL = 'The template could not be read.';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_payload) LOOP
    IF v_key NOT IN ('name', 'description', 'scope', 'due_within_days', 'requires_crew_signature', 'requires_supervisor_signature',
                     'sections', 'position_ids', 'is_active', 'variant_of', 'form_template_id') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_unknown', DETAIL = format('%s is not a template field.', v_key), HINT = v_key;
    END IF;
  END LOOP;
  v_company := public.crew_vessel_gate('vessel.crew.familiarisation.view', p_vessel_id, 'Seeing familiarisation templates needs familiarisation access on this vessel.');
  IF public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'External viewers cannot change familiarisation templates.';
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.familiarization_templates WHERE id = v_id AND company_id = v_company FOR UPDATE;
    IF NOT FOUND OR (v_old.vessel_id IS NOT NULL AND v_old.vessel_id <> p_vessel_id) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'template_not_found', DETAIL = 'This template could not be found on this vessel.';
    END IF;
    v_scope := v_old.scope;
    IF p_payload ? 'scope' AND (p_payload ->> 'scope') IS DISTINCT FROM v_scope THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'scope_locked', DETAIL = 'A template keeps its scope; make a new one instead.', HINT = 'scope';
    END IF;
    IF p_payload ? 'variant_of' AND nullif(p_payload ->> 'variant_of', '')::uuid IS DISTINCT FROM v_old.variant_of THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'variant_locked', DETAIL = 'A variant keeps the fleet template it replaces.', HINT = 'variant_of';
    END IF;
  ELSE
    v_scope := coalesce(nullif(btrim(p_payload ->> 'scope'), ''), 'vessel');
    IF v_scope NOT IN ('vessel', 'fleet') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'scope_invalid', DETAIL = 'A template is for this vessel or for the whole fleet.', HINT = 'scope';
    END IF;
  END IF;

  -- Who: a vessel template is the vessel's; a fleet template the company's.
  IF v_scope = 'vessel' THEN
    IF NOT coalesce(public.crew_vessel_cap('vessel.crew.familiarisation.edit', p_vessel_id), false) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted',
        DETAIL = 'Changing this vessel''s familiarisation templates needs familiarisation edit access on the vessel.';
    END IF;
  ELSIF NOT (coalesce(public.has_company_capability_for(v_uid, 'vessel.crew.familiarisation.edit', v_company), false)
             AND (coalesce(public.fleet_reach_for(v_uid, v_company), false) OR coalesce(public.admin_scope_all(v_uid, v_company), false))) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted',
      DETAIL = 'Fleet-wide familiarisation templates are kept by the fleet office.';
  END IF;

  v_name := CASE WHEN p_payload ? 'name' THEN btrim(coalesce(p_payload ->> 'name', '')) ELSE v_old.template_name END;
  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'name_required', DETAIL = 'Name the template.', HINT = 'name';
  END IF;
  IF length(v_name) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'name_too_long', DETAIL = 'A template name has at most 120 characters.', HINT = 'name';
  END IF;
  v_desc := CASE WHEN p_payload ? 'description' THEN nullif(btrim(coalesce(p_payload ->> 'description', '')), '') ELSE v_old.description END;
  IF v_desc IS NOT NULL AND length(v_desc) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'description_too_long', DETAIL = 'A description has at most 2,000 characters.', HINT = 'description';
  END IF;
  IF p_payload ? 'due_within_days' THEN
    IF jsonb_typeof(p_payload -> 'due_within_days') <> 'number' OR (p_payload ->> 'due_within_days')::numeric <> trunc((p_payload ->> 'due_within_days')::numeric)
       OR (p_payload ->> 'due_within_days')::numeric NOT BETWEEN 0 AND 365 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'due_invalid', DETAIL = 'Due within is a whole number of days from 0 to 365.', HINT = 'due_within_days';
    END IF;
    v_due := (p_payload ->> 'due_within_days')::integer;
  ELSE
    v_due := coalesce(v_old.due_within_days, 14);
  END IF;
  FOR v_key IN SELECT unnest(ARRAY['requires_crew_signature', 'requires_supervisor_signature', 'is_active']) LOOP
    IF p_payload ? v_key AND jsonb_typeof(p_payload -> v_key) <> 'boolean' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = format('%s is yes or no.', v_key), HINT = v_key;
    END IF;
  END LOOP;
  v_crew := coalesce((p_payload ->> 'requires_crew_signature')::boolean, v_old.requires_crew_signature, true);
  v_sup := coalesce((p_payload ->> 'requires_supervisor_signature')::boolean, v_old.requires_supervisor_signature, true);
  v_active := coalesce((p_payload ->> 'is_active')::boolean, v_old.is_active, true);
  IF p_payload ? 'sections' OR v_id IS NULL THEN
    v_sections := public.familiarisation_sections_normalise(p_payload -> 'sections');
  ELSE
    v_sections := v_old.sections;
  END IF;

  IF v_id IS NULL AND nullif(p_payload ->> 'variant_of', '') IS NOT NULL THEN
    IF v_scope <> 'vessel' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'variant_invalid', DETAIL = 'Only a vessel template is a variant.', HINT = 'variant_of';
    END IF;
    BEGIN
      v_variant := (p_payload ->> 'variant_of')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'variant_invalid', DETAIL = 'Choose a fleet template.', HINT = 'variant_of';
    END;
    IF NOT EXISTS (SELECT 1 FROM public.familiarization_templates AS f
                   WHERE f.id = v_variant AND f.company_id = v_company AND f.scope = 'fleet' AND f.is_active) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'variant_invalid', DETAIL = 'Choose an active fleet template of your company.', HINT = 'variant_of';
    END IF;
    IF EXISTS (SELECT 1 FROM public.familiarization_templates AS x
               WHERE x.variant_of = v_variant AND x.vessel_id = p_vessel_id AND x.is_active) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'variant_exists', DETAIL = 'This vessel already has its own version of that template.', HINT = 'variant_of';
    END IF;
  ELSE
    v_variant := v_old.variant_of;
  END IF;

  IF p_payload ? 'form_template_id' THEN
    IF jsonb_typeof(p_payload -> 'form_template_id') = 'null' OR nullif(p_payload ->> 'form_template_id', '') IS NULL THEN
      v_form := NULL;
    ELSE
      BEGIN
        v_form := (p_payload ->> 'form_template_id')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'form_template_invalid', DETAIL = 'Choose a form of your company.', HINT = 'form_template_id';
      END;
      IF to_regclass('public.form_templates') IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.form_templates AS f WHERE f.id = v_form AND f.company_id = v_company) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'form_template_invalid', DETAIL = 'Choose a form of your company.', HINT = 'form_template_id';
      END IF;
    END IF;
  ELSE
    v_form := v_old.form_template_id;
  END IF;

  v_tpl_vessel := CASE WHEN v_scope = 'vessel' THEN p_vessel_id END;
  IF p_payload ? 'position_ids' THEN
    IF jsonb_typeof(p_payload -> 'position_ids') <> 'array' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'positions_invalid', DETAIL = 'The required positions could not be read.', HINT = 'position_ids';
    END IF;
    BEGIN
      SELECT coalesce(array_agg(DISTINCT x::uuid), ARRAY[]::uuid[]) INTO v_positions FROM jsonb_array_elements_text(p_payload -> 'position_ids') AS x;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'positions_invalid', DETAIL = 'The required positions could not be read.', HINT = 'position_ids';
    END;
    SELECT x INTO v_bad FROM unnest(v_positions) AS x
    WHERE NOT EXISTS (SELECT 1 FROM public.positions AS pos
                      WHERE pos.id = x AND pos.is_active
                        AND (pos.company_id IS NULL OR pos.company_id = v_company)
                        AND (pos.vessel_id IS NULL OR pos.vessel_id = v_tpl_vessel))
    LIMIT 1;
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'position_unknown',
        DETAIL = 'A required position is not available for this template.', HINT = 'position_ids';
    END IF;
  END IF;

  PERFORM set_config('storm.crew_engine', 'on', true);
  IF v_id IS NULL THEN
    INSERT INTO public.familiarization_templates (
      company_id, vessel_id, scope, template_name, description, due_within_days, total_duration_days,
      requires_crew_signature, requires_supervisor_signature, sections, applicable_ranks, is_active, variant_of,
      form_template_id, created_by
    ) VALUES (
      v_company, v_tpl_vessel, v_scope, v_name, v_desc, v_due, greatest(v_due, 1),
      v_crew, v_sup, v_sections, '{}', v_active, v_variant, v_form, v_uid
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.familiarization_templates
    SET template_name = v_name, description = v_desc, due_within_days = v_due, total_duration_days = greatest(v_due, 1),
        requires_crew_signature = v_crew, requires_supervisor_signature = v_sup, sections = v_sections, is_active = v_active,
        form_template_id = v_form
    WHERE id = v_id;
  END IF;

  IF p_payload ? 'position_ids' THEN
    DELETE FROM public.familiarization_template_positions AS tp
    WHERE tp.template_id = v_id AND tp.vessel_id IS NOT DISTINCT FROM v_tpl_vessel AND NOT (tp.position_id = ANY (v_positions));
    INSERT INTO public.familiarization_template_positions (company_id, template_id, position_id, vessel_id, created_by)
    SELECT v_company, v_id, x, v_tpl_vessel, v_uid FROM unnest(v_positions) AS x
    ON CONFLICT DO NOTHING;
  END IF;

  PERFORM public.familiarisation_requirement_sync(v_id, v_uid);
  v_parent := coalesce(v_variant, v_old.variant_of);
  IF v_parent IS NOT NULL THEN
    PERFORM public.familiarisation_requirement_sync(v_parent, v_uid);
  END IF;
  IF v_scope = 'fleet' THEN
    -- A fleet template's variants follow it (their rows hide or show it).
    PERFORM public.familiarisation_requirement_sync(x.id, v_uid)
    FROM public.familiarization_templates AS x WHERE x.variant_of = v_id;
  END IF;
  RETURN public.familiarisation_template_json(v_id);
END;
$$;

-- ---------------------------------------------------------------- RPCs: records

-- Starts a familiarisation for a person of the vessel's crew from a
-- template that applies on the vessel (manual New, W11): the template's own
-- sections become the items (C63), due = joining date + due within.
-- Gate: familiarisation.create on the vessel, no external viewer. Refusals:
-- P0002 template_not_found / person_not_found, 22023 template_inactive,
-- not_on_vessel, template_empty, record_exists (HINT the open record id).
-- Returns the record (familiarisation_record_json).
CREATE OR REPLACE FUNCTION public.familiarisation_start(p_template_id uuid, p_profile_id uuid, p_vessel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_t public.familiarization_templates%ROWTYPE;
  v_join date;
  v_existing uuid;
  v_id uuid;
BEGIN
  v_company := public.crew_vessel_gate('vessel.crew.familiarisation.create', p_vessel_id,
    'Starting a familiarisation needs familiarisation create access on this vessel.');
  IF public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'External viewers cannot start a familiarisation.';
  END IF;
  SELECT * INTO v_t FROM public.familiarization_templates WHERE id = p_template_id AND company_id = v_company;
  IF NOT FOUND OR (v_t.vessel_id IS NOT NULL AND v_t.vessel_id <> p_vessel_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'template_not_found', DETAIL = 'This template could not be found on this vessel.';
  END IF;
  IF NOT v_t.is_active OR p_template_id NOT IN (SELECT public.familiarisation_vessel_templates(p_vessel_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'template_inactive', DETAIL = 'This template is not in use on this vessel.';
  END IF;
  IF jsonb_typeof(v_t.sections) <> 'array' OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_t.sections) AS s
    WHERE jsonb_typeof(s -> 'checklist_items') = 'array' AND jsonb_array_length(s -> 'checklist_items') > 0) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'template_empty', DETAIL = 'This template has no items to tick yet.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = p_profile_id AND p.company_id = v_company) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'person_not_found', DETAIL = 'This crew member could not be found.';
  END IF;
  SELECT m.join_date INTO v_join FROM public.crew_vessel_members(p_vessel_id, current_date) AS m WHERE m.profile_id = p_profile_id LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'not_on_vessel', DETAIL = 'This person is not on the vessel''s crew.';
  END IF;
  SELECT fr.id INTO v_existing FROM public.familiarization_records AS fr
  WHERE fr.template_id = p_template_id AND fr.vessel_id = p_vessel_id AND fr.profile_id = p_profile_id AND fr.status <> 'completed';
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'record_exists', DETAIL = 'This person already has this familiarisation open.', HINT = v_existing::text;
  END IF;
  -- A late start is due from today, not from a joining date long past.
  v_id := public.familiarisation_open_record(p_template_id, p_profile_id, p_vessel_id, coalesce(v_join, current_date), v_uid,
                                             greatest(coalesce(v_join, current_date), current_date));
  IF v_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'record_exists', DETAIL = 'This person already has this familiarisation open.';
  END IF;
  PERFORM public.familiarisation_notify_assigned(v_id);
  RETURN public.familiarisation_record_json(v_id);
END;
$$;

-- Ticks or unticks an item (p_note: an optional note, at most 500
-- characters). The person ticks their own (view_own on the vessel); anyone
-- else needs familiarisation.edit. Refusals: P0002 item_not_found, 42501
-- not_permitted, 22023 record_completed / record_signed / note_too_long.
-- The status follows (familiarization_items_recompute). Returns the record.
CREATE OR REPLACE FUNCTION public.familiarisation_tick(p_item_id uuid, p_done boolean, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_record uuid;
  v_rec public.familiarization_records%ROWTYPE;
  v_done integer;
  v_own boolean;
  v_check text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF p_done IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'done_required', DETAIL = 'Say whether the item is done.';
  END IF;
  IF v_note IS NOT NULL AND length(v_note) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'note_too_long', DETAIL = 'A note has at most 500 characters.', HINT = 'note';
  END IF;
  SELECT i.familiarization_id INTO v_record FROM public.familiarization_checklist_items AS i WHERE i.id = p_item_id;
  IF v_record IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'item_not_found', DETAIL = 'This checklist item could not be found.';
  END IF;
  v_rec := public.familiarisation_record_gate(v_record);
  v_own := v_rec.profile_id IS NOT NULL AND v_rec.profile_id IS NOT DISTINCT FROM public.my_profile_id();
  v_check := public.familiarisation_actor_decide('tick', v_own, v_rec.user_id IS NOT NULL,
               coalesce(public.crew_vessel_cap('vessel.crew.familiarisation.view_own', v_rec.vessel_id), false),
               coalesce(public.crew_vessel_cap('vessel.crew.familiarisation.edit', v_rec.vessel_id), false) AND NOT public.crew_caller_is_external(),
               false, NULL);
  IF v_check <> 'ok' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = v_check,
      DETAIL = 'Ticking someone else''s familiarisation needs familiarisation edit access on the vessel.';
  END IF;
  SELECT (count(*) FILTER (WHERE i.completed))::integer INTO v_done FROM public.familiarization_checklist_items AS i WHERE i.familiarization_id = v_record;
  v_check := public.familiarisation_action_check('tick', v_rec.status, v_done, v_rec.crew_signed_at IS NOT NULL, v_rec.supervisor_signed_at IS NOT NULL,
                                                 v_rec.requires_crew_signature, v_rec.requires_supervisor_signature);
  IF v_check = 'record_completed' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = v_check, DETAIL = 'This familiarisation is completed. Reopen it to change the checklist.';
  ELSIF v_check = 'record_signed' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = v_check, DETAIL = 'This familiarisation has a signature. Reopen it to change the checklist.';
  END IF;
  PERFORM set_config('storm.crew_engine', 'on', true);
  UPDATE public.familiarization_checklist_items
  SET completed = p_done,
      completed_date = CASE WHEN p_done THEN coalesce(CASE WHEN completed THEN completed_date END, current_date) END,
      completed_by_id = CASE WHEN p_done THEN coalesce(CASE WHEN completed THEN completed_by_id END, v_uid) END,
      notes = CASE WHEN p_note IS NULL THEN notes ELSE v_note END
  WHERE id = p_item_id;
  RETURN public.familiarisation_record_json(v_record);
END;
$$;

-- Signs a record (attestation, D-X1-6): p_as 'crew' (the person, on their
-- own record, with a login and view_own on the vessel) or 'supervisor'
-- (familiarisation.approve on the vessel and the person's department, never
-- their own). Every item must be ticked first. Completes the record when
-- the required signatures are there. Refusals: P0002 record_not_found,
-- 42501 not_permitted / no_login / own_record / out_of_department, 22023
-- as_invalid / items_open / already_signed / signature_not_required /
-- record_completed. Returns the record.
CREATE OR REPLACE FUNCTION public.familiarisation_sign(p_record_id uuid, p_as text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rec public.familiarization_records%ROWTYPE;
  v_action text;
  v_own boolean;
  v_scope text;
  v_check text;
  v_done integer;
BEGIN
  IF p_as IS NULL OR p_as NOT IN ('crew', 'supervisor') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'as_invalid', DETAIL = 'Sign as the crew member or as the supervisor.';
  END IF;
  v_action := 'sign_' || p_as;
  v_rec := public.familiarisation_record_gate(p_record_id);
  v_own := v_rec.profile_id IS NOT NULL AND v_rec.profile_id IS NOT DISTINCT FROM public.my_profile_id();
  v_scope := CASE WHEN public.crew_caller_is_external() THEN 'not_permitted' ELSE public.familiarisation_supervisor_scope(v_uid, v_rec.profile_id, v_rec.vessel_id) END;
  v_check := public.familiarisation_actor_decide(v_action, v_own, v_rec.user_id IS NOT NULL,
               coalesce(public.crew_vessel_cap('vessel.crew.familiarisation.view_own', v_rec.vessel_id), false), false, false, v_scope);
  IF v_check <> 'ok' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = v_check,
      DETAIL = CASE v_check
        WHEN 'no_login' THEN 'The crew member signs once they have a sign-in.'
        WHEN 'own_record' THEN 'You cannot supervise your own familiarisation.'
        WHEN 'out_of_department' THEN 'You supervise familiarisation in your own department only.'
        ELSE CASE WHEN p_as = 'crew' THEN 'Only the crew member signs their own familiarisation.'
                  ELSE 'Signing as supervisor needs familiarisation approval on this vessel.' END
      END;
  END IF;
  SELECT (count(*) FILTER (WHERE i.completed))::integer INTO v_done FROM public.familiarization_checklist_items AS i WHERE i.familiarization_id = p_record_id;
  v_check := public.familiarisation_action_check(v_action, v_rec.status, v_done, v_rec.crew_signed_at IS NOT NULL, v_rec.supervisor_signed_at IS NOT NULL,
                                                 v_rec.requires_crew_signature, v_rec.requires_supervisor_signature);
  IF v_check <> 'ok' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = v_check,
      DETAIL = CASE v_check
        WHEN 'items_open' THEN 'Tick every item before signing.'
        WHEN 'already_signed' THEN 'This signature is already there.'
        WHEN 'signature_not_required' THEN 'This familiarisation does not need that signature.'
        ELSE 'This familiarisation is completed.'
      END;
  END IF;
  PERFORM set_config('storm.crew_engine', 'on', true);
  IF p_as = 'crew' THEN
    UPDATE public.familiarization_records SET crew_signed_at = now(), crew_signed_by = v_uid WHERE id = p_record_id;
  ELSE
    UPDATE public.familiarization_records SET supervisor_signed_at = now(), supervisor_signed_by = v_uid WHERE id = p_record_id;
  END IF;
  PERFORM public.familiarisation_record_recompute(p_record_id);
  RETURN public.familiarisation_record_json(p_record_id);
END;
$$;

-- Reopens a completed record, or one with a signature, with a reason (1 to
-- 2,000 characters): its signatures are cleared and it waits for them again
-- (the ticks stay; untick what has to be done again). A supervisor of the
-- person's department (familiarisation.approve; the Master, command tier and
-- fleet reach for every department), never on their own. Refusals: P0002,
-- 42501 not_permitted / own_record / out_of_department, 22023
-- reason_required / reason_too_long / not_reopenable. Returns the record.
CREATE OR REPLACE FUNCTION public.familiarisation_reopen(p_record_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rec public.familiarization_records%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_own boolean;
  v_scope text;
  v_check text;
  v_done integer;
BEGIN
  v_rec := public.familiarisation_record_gate(p_record_id);
  v_own := v_rec.profile_id IS NOT NULL AND v_rec.profile_id IS NOT DISTINCT FROM public.my_profile_id();
  v_scope := CASE WHEN public.crew_caller_is_external() THEN 'not_permitted' ELSE public.familiarisation_supervisor_scope(v_uid, v_rec.profile_id, v_rec.vessel_id) END;
  v_check := public.familiarisation_actor_decide('reopen', v_own, v_rec.user_id IS NOT NULL, false, false, false, v_scope);
  IF v_check <> 'ok' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = v_check,
      DETAIL = CASE v_check
        WHEN 'own_record' THEN 'You cannot reopen your own familiarisation.'
        WHEN 'out_of_department' THEN 'You reopen familiarisation in your own department only.'
        ELSE 'Reopening a familiarisation needs familiarisation approval on this vessel.'
      END;
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reason_required', DETAIL = 'Say why it is reopened.', HINT = 'reason';
  END IF;
  IF length(v_reason) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reason_too_long', DETAIL = 'A reason has at most 2,000 characters.', HINT = 'reason';
  END IF;
  SELECT (count(*) FILTER (WHERE i.completed))::integer INTO v_done FROM public.familiarization_checklist_items AS i WHERE i.familiarization_id = p_record_id;
  v_check := public.familiarisation_action_check('reopen', v_rec.status, v_done, v_rec.crew_signed_at IS NOT NULL, v_rec.supervisor_signed_at IS NOT NULL,
                                                 v_rec.requires_crew_signature, v_rec.requires_supervisor_signature);
  IF v_check <> 'ok' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = v_check, DETAIL = 'Only a completed familiarisation, or one with a signature, is reopened.';
  END IF;
  PERFORM set_config('storm.crew_engine', 'on', true);
  UPDATE public.familiarization_records
  SET crew_signed_at = NULL, crew_signed_by = NULL, supervisor_signed_at = NULL, supervisor_signed_by = NULL,
      reopened_reason = v_reason, reopened_by = v_uid, reopened_at = now()
  WHERE id = p_record_id;
  PERFORM public.familiarisation_record_recompute(p_record_id);
  RETURN public.familiarisation_record_json(p_record_id);
END;
$$;

-- Deletes a record started by mistake: open, nothing ticked, no signature
-- (W11). Gate: familiarisation.create on its vessel, no external viewer.
-- Refusals: P0002, 42501 not_permitted, 22023 not_deletable. Returns the id.
CREATE OR REPLACE FUNCTION public.familiarisation_delete(p_record_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.familiarization_records%ROWTYPE;
  v_check text;
  v_done integer;
  v_n integer;
BEGIN
  v_rec := public.familiarisation_record_gate(p_record_id);
  v_check := public.familiarisation_actor_decide('delete', false, v_rec.user_id IS NOT NULL, false, false,
               coalesce(public.crew_vessel_cap('vessel.crew.familiarisation.create', v_rec.vessel_id), false) AND NOT public.crew_caller_is_external(), NULL);
  IF v_check <> 'ok' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = v_check, DETAIL = 'Deleting a familiarisation needs familiarisation create access on the vessel.';
  END IF;
  SELECT (count(*) FILTER (WHERE i.completed))::integer INTO v_done FROM public.familiarization_checklist_items AS i WHERE i.familiarization_id = p_record_id;
  v_check := public.familiarisation_action_check('delete', v_rec.status, v_done, v_rec.crew_signed_at IS NOT NULL, v_rec.supervisor_signed_at IS NOT NULL,
                                                 v_rec.requires_crew_signature, v_rec.requires_supervisor_signature);
  IF v_check <> 'ok' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = v_check, DETAIL = 'Only an open familiarisation with nothing ticked is deleted.';
  END IF;
  PERFORM set_config('storm.crew_engine', 'on', true);
  DELETE FROM public.familiarization_records WHERE id = p_record_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'record_not_found', DETAIL = 'This familiarisation record could not be found.';
  END IF;
  RETURN p_record_id;
END;
$$;

-- ---------------------------------------------------------------- RPCs: reads

-- The vessel's familiarisation (gap/04 C63; the page's one read): the
-- templates that apply on the vessel (and the vessel's inactive ones), each
-- with its code, positions, sections and, for the current crew (members of
-- crew_vessel_members, planned and pending joiners included, D-X1-4),
-- completed (holds a completed record), in progress, overdue and missing
-- (required of their position and not completed); the records (the latest
-- 12, or all with p_all, at most 500) with the person, counts and overdue;
-- the crew a record can be started for; and what the caller may do.
-- Gate: familiarisation.view on the vessel, no external viewer (P0002
-- unknown vessel, 42501). Browser RPC.
CREATE OR REPLACE FUNCTION public.familiarisation_vessel_overview(p_vessel_id uuid, p_all boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_templates jsonb;
  v_records jsonb;
  v_total integer;
  v_members jsonb;
  v_can_create boolean;
  v_can_edit boolean;
  v_can_edit_fleet boolean;
BEGIN
  v_company := public.crew_vessel_gate('vessel.crew.familiarisation.view', p_vessel_id,
    'Seeing this vessel''s familiarisation needs familiarisation access on the vessel.');
  IF public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'External viewers see only their own familiarisation.';
  END IF;
  v_can_create := coalesce(public.crew_vessel_cap('vessel.crew.familiarisation.create', p_vessel_id), false);
  v_can_edit := coalesce(public.crew_vessel_cap('vessel.crew.familiarisation.edit', p_vessel_id), false);
  -- The fleet office (D-376): the company-wide answer, and fleet reach or
  -- an admin of every vessel (admin_scope_all); a vessel-limited admin is
  -- not the fleet office.
  v_can_edit_fleet := coalesce(public.has_company_capability_for(v_uid, 'vessel.crew.familiarisation.edit', v_company), false)
                      AND (coalesce(public.fleet_reach_for(v_uid, v_company), false) OR coalesce(public.admin_scope_all(v_uid, v_company), false));

  WITH mem AS MATERIALIZED (
    SELECT m.profile_id, m.user_id, m.placement_kind, m.join_date,
           coalesce(public.crew_position_for(v_company, p_vessel_id, m.position_text), public.crew_position_for(v_company, p_vessel_id, m.rank_text)) AS position_id
    FROM public.crew_vessel_members(p_vessel_id, current_date) AS m
  ),
  tpl AS MATERIALIZED (
    SELECT t.* FROM public.familiarization_templates AS t
    WHERE t.company_id = v_company
      AND (t.id IN (SELECT public.familiarisation_vessel_templates(p_vessel_id))
           OR (t.vessel_id = p_vessel_id AND NOT t.is_active)
           OR (t.scope = 'fleet' AND t.vessel_id IS NULL))
  ),
  req AS (
    SELECT DISTINCT t.id AS template_id, mm.profile_id
    FROM tpl AS t
    JOIN public.familiarization_template_positions AS tp ON tp.template_id = t.id AND (tp.vessel_id IS NULL OR tp.vessel_id = p_vessel_id)
    JOIN mem AS mm ON mm.position_id = tp.position_id
    WHERE t.id IN (SELECT public.familiarisation_vessel_templates(p_vessel_id))
  ),
  rec AS (
    SELECT fr.template_id, fr.profile_id, fr.status, public.familiarisation_overdue(fr.status, coalesce(fr.due_date, fr.target_completion_date), current_date) AS overdue
    FROM public.familiarization_records AS fr
    WHERE fr.vessel_id = p_vessel_id AND fr.profile_id IN (SELECT mm.profile_id FROM mem AS mm)
  ),
  counts AS (
    SELECT t.id,
           (SELECT count(DISTINCT r.profile_id) FROM rec AS r WHERE r.template_id = t.id AND r.status = 'completed')::integer AS completed,
           (SELECT count(DISTINCT r.profile_id) FROM rec AS r WHERE r.template_id = t.id AND r.status <> 'completed')::integer AS in_progress,
           (SELECT count(DISTINCT r.profile_id) FROM rec AS r WHERE r.template_id = t.id AND r.overdue)::integer AS overdue,
           (SELECT count(*) FROM req AS q WHERE q.template_id = t.id
              AND NOT EXISTS (SELECT 1 FROM rec AS r WHERE r.template_id = t.id AND r.profile_id = q.profile_id AND r.status = 'completed'))::integer AS missing,
           (SELECT count(*) FROM req AS q WHERE q.template_id = t.id)::integer AS required
    FROM tpl AS t
  )
  SELECT coalesce(jsonb_agg(public.familiarisation_template_json(t.id) || jsonb_build_object(
           'applies', t.id IN (SELECT public.familiarisation_vessel_templates(p_vessel_id)),
           'replaced_by_variant', t.scope = 'fleet' AND EXISTS (SELECT 1 FROM public.familiarization_templates AS x WHERE x.variant_of = t.id AND x.vessel_id = p_vessel_id AND x.is_active),
           'completed', c.completed, 'in_progress', c.in_progress, 'overdue', c.overdue, 'missing', c.missing, 'required', c.required)
         ORDER BY t.is_active DESC, (t.scope = 'fleet') DESC, t.code NULLS LAST, t.template_name, t.id), '[]'::jsonb)
  INTO v_templates
  FROM tpl AS t
  JOIN counts AS c ON c.id = t.id;

  SELECT count(*)::integer INTO v_total FROM public.familiarization_records AS fr WHERE fr.vessel_id = p_vessel_id;

  SELECT coalesce(jsonb_agg(x.j ORDER BY x.sort_at DESC, x.id), '[]'::jsonb)
  INTO v_records
  FROM (
    SELECT fr.id, greatest(fr.updated_at, fr.created_at) AS sort_at,
           jsonb_build_object(
             'id', fr.id, 'template_id', fr.template_id, 'template_code', t.code, 'template_name', coalesce(t.template_name, 'Familiarisation'),
             'profile_id', fr.profile_id, 'first_name', p.first_name, 'last_name', p.last_name, 'preferred_name', p.preferred_name,
             'has_login', p.user_id IS NOT NULL,
             'status', fr.status, 'join_date', fr.join_date, 'due_date', coalesce(fr.due_date, fr.target_completion_date),
             'overdue', public.familiarisation_overdue(fr.status, coalesce(fr.due_date, fr.target_completion_date), current_date),
             'items_total', (SELECT count(*) FROM public.familiarization_checklist_items AS i WHERE i.familiarization_id = fr.id)::integer,
             'items_done', (SELECT count(*) FILTER (WHERE i.completed) FROM public.familiarization_checklist_items AS i WHERE i.familiarization_id = fr.id)::integer,
             'crew_signed_at', fr.crew_signed_at, 'supervisor_signed_at', fr.supervisor_signed_at,
             'requires_crew_signature', fr.requires_crew_signature, 'requires_supervisor_signature', fr.requires_supervisor_signature,
             'completed_on', fr.actual_completion_date, 'created_at', fr.created_at, 'updated_at', fr.updated_at) AS j
    FROM public.familiarization_records AS fr
    LEFT JOIN public.profiles AS p ON p.id = fr.profile_id
    LEFT JOIN public.familiarization_templates AS t ON t.id = fr.template_id
    WHERE fr.vessel_id = p_vessel_id
    ORDER BY greatest(fr.updated_at, fr.created_at) DESC, fr.id
    LIMIT CASE WHEN coalesce(p_all, false) THEN 500 ELSE 12 END
  ) AS x;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'profile_id', m.profile_id, 'first_name', p.first_name, 'last_name', p.last_name, 'preferred_name', p.preferred_name,
           'has_login', p.user_id IS NOT NULL, 'placement_kind', m.placement_kind, 'join_date', m.join_date,
           'position_id', m.position_id, 'position_name', pos.name)
         ORDER BY coalesce(pos.sort_order, 100000), p.last_name, p.first_name, m.profile_id), '[]'::jsonb)
  INTO v_members
  FROM (SELECT mm.profile_id, mm.placement_kind, mm.join_date,
               coalesce(public.crew_position_for(v_company, p_vessel_id, mm.position_text), public.crew_position_for(v_company, p_vessel_id, mm.rank_text)) AS position_id
        FROM public.crew_vessel_members(p_vessel_id, current_date) AS mm) AS m
  JOIN public.profiles AS p ON p.id = m.profile_id
  LEFT JOIN public.positions AS pos ON pos.id = m.position_id;

  RETURN jsonb_build_object(
    'vessel_id', p_vessel_id,
    'company_id', v_company,
    'today', current_date,
    'can_create', v_can_create,
    'can_edit_templates', v_can_edit,
    'can_edit_fleet_templates', v_can_edit_fleet,
    'templates', v_templates,
    'records', v_records,
    'records_total', v_total,
    'members', CASE WHEN v_can_create THEN v_members ELSE '[]'::jsonb END);
END;
$$;

-- One record for its page (gap/04 W11): the record, the person, the
-- template, the items and what the caller may do (rights: 'ok' or the
-- refusal code of each action). Gate: familiarisation.view on its vessel
-- (no external viewer), or the caller's own record with view_own; P0002
-- otherwise, so no id leaks. Browser RPC.
CREATE OR REPLACE FUNCTION public.familiarisation_record_detail(p_record_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rec public.familiarization_records%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  IF NOT coalesce(public.user_is_active(v_uid), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'Your account is not active.';
  END IF;
  SELECT * INTO v_rec FROM public.familiarization_records WHERE id = p_record_id;
  IF NOT FOUND
     OR v_rec.company_id IS DISTINCT FROM public.get_user_company_id(v_uid)
     OR NOT ((coalesce(public.crew_vessel_cap('vessel.crew.familiarisation.view', v_rec.vessel_id), false) AND NOT public.crew_caller_is_external())
             OR (v_rec.profile_id IS NOT NULL AND v_rec.profile_id IS NOT DISTINCT FROM public.my_profile_id()
                 AND coalesce(public.crew_vessel_cap('vessel.crew.familiarisation.view_own', v_rec.vessel_id), false))) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'record_not_found', DETAIL = 'This familiarisation record could not be found.';
  END IF;
  RETURN public.familiarisation_record_json(p_record_id);
END;
$$;

-- ---------------------------------------------------------------- onboarding progress and the crew dashboard (for X1-10B; gap/04 C18, C2)

-- The eight onboarding checks of a vessel's joiners (gap/04 W1 "Onboarding
-- progress"): photo, signature (unknown while the platform signature store
-- user_signature_images is missing, PR-X1-I), personal details (title, date
-- of birth, nationality, place of birth), contact (address, a phone, a next
-- of kin), passport (a valid passport flagged for the crew report), medical
-- (a valid medical fitness document), STCW basic (every STCW basic
-- requirement row of the person met; unknown when none is configured) and
-- contract (an active crew contract). Each check: {key, state pass | fail |
-- unknown, detail}. Plus the person's familiarisations on the vessel.
-- Joiners: crew_vessel_members joined in the last p_days (1-365) or still
-- to join; one person with p_profile_id (whatever their join date).
-- Internal (crew_onboarding_progress, crew_vessel_dashboard).
CREATE OR REPLACE FUNCTION public.crew_onboarding_rows(p_vessel_id uuid, p_profile_id uuid, p_days integer)
RETURNS TABLE (
  profile_id uuid, user_id uuid, first_name text, last_name text, preferred_name text, avatar_url text,
  position_name text, department_key text, placement_kind text, join_date date,
  checks jsonb, passed integer, known integer, percent integer,
  fam_required integer, fam_completed integer, familiarisation jsonb, is_open boolean
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_company uuid;
  v_sig_readable boolean := false;
  v_signed uuid[] := ARRAY[]::uuid[];
BEGIN
  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = p_vessel_id;
  IF v_company IS NULL THEN
    RETURN;
  END IF;
  -- The platform signature store (SIG1, PR-X1-I) does not exist yet: the
  -- check reads unknown. Once it exists with a user_id column, a stored
  -- signature of the person's login passes (read dynamically, so this file
  -- needs nothing of it).
  IF to_regclass('public.user_signature_images') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns AS c
    WHERE c.table_schema = 'public' AND c.table_name = 'user_signature_images' AND c.column_name = 'user_id') THEN
    v_sig_readable := true;
    EXECUTE 'SELECT coalesce(array_agg(DISTINCT s.user_id), ARRAY[]::uuid[]) FROM public.user_signature_images AS s
             JOIN public.profiles AS p ON p.user_id = s.user_id WHERE p.company_id = $1'
      INTO v_signed USING v_company;
  END IF;
  RETURN QUERY
  WITH mem AS MATERIALIZED (
    SELECT m.profile_id, m.user_id, m.placement_kind, m.join_date, m.position_text, m.rank_text, m.department_text,
           coalesce(public.crew_position_for(v_company, p_vessel_id, m.position_text), public.crew_position_for(v_company, p_vessel_id, m.rank_text)) AS position_id
    FROM public.crew_vessel_members(p_vessel_id, current_date) AS m
    WHERE (p_profile_id IS NOT NULL AND m.profile_id = p_profile_id)
       OR (p_profile_id IS NULL AND (m.placement_kind IN ('planned', 'pending_placement')
                                     OR m.join_date IS NULL OR m.join_date >= current_date - least(greatest(coalesce(p_days, 90), 1), 365)))
  ),
  stcw AS (
    SELECT s.profile_id,
           count(*)::integer AS n,
           (count(*) FILTER (WHERE s.state IN ('met', 'expiring')))::integer AS ok
    FROM public.crew_requirement_status_for(ARRAY[p_vessel_id], current_date, p_profile_id) AS s
    WHERE s.group_key = 'stcw_basic' AND s.profile_id IN (SELECT mm.profile_id FROM mem AS mm)
    GROUP BY s.profile_id
  ),
  docs AS (
    SELECT cc.profile_id,
           bool_or(t.expiry_item_type = 'passport' AND cc.use_in_crew_report) AS passport,
           bool_or(t.is_medical_fitness) AS medical
    FROM public.crew_certificates AS cc
    JOIN public.crew_document_types AS t ON t.id = cc.document_type_id
    WHERE cc.profile_id IN (SELECT mm.profile_id FROM mem AS mm)
      AND cc.deleted_at IS NULL AND cc.verification_status <> 'rejected'
      AND (cc.no_expiry OR cc.expiry_date >= current_date)
    GROUP BY cc.profile_id
  ),
  fam AS (
    SELECT fr.profile_id,
           jsonb_agg(jsonb_build_object('record_id', fr.id, 'template_id', fr.template_id, 'template_code', t.code,
                                        'template_name', coalesce(t.template_name, 'Familiarisation'), 'status', fr.status,
                                        'due_date', coalesce(fr.due_date, fr.target_completion_date),
                                        'overdue', public.familiarisation_overdue(fr.status, coalesce(fr.due_date, fr.target_completion_date), current_date))
                     ORDER BY coalesce(fr.due_date, fr.target_completion_date), t.template_name, fr.id) AS list
    FROM public.familiarization_records AS fr
    LEFT JOIN public.familiarization_templates AS t ON t.id = fr.template_id
    WHERE fr.vessel_id = p_vessel_id AND fr.profile_id IN (SELECT mm.profile_id FROM mem AS mm)
    GROUP BY fr.profile_id
  ),
  famreq AS (
    SELECT mm.profile_id,
           count(*)::integer AS required,
           (count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.familiarization_records AS fr
                                           WHERE fr.template_id = rt.id AND fr.vessel_id = p_vessel_id AND fr.profile_id = mm.profile_id
                                             AND fr.status = 'completed')))::integer AS completed
    FROM mem AS mm
    CROSS JOIN LATERAL public.familiarisation_required_templates(p_vessel_id, mm.position_id) AS rt(id)
    GROUP BY mm.profile_id
  ),
  base AS (
    SELECT mm.*, p.first_name, p.last_name, p.preferred_name, p.avatar_url, pos.name AS position_name,
           coalesce(pos.department_key, (SELECT d.key FROM public.departments AS d
                                          WHERE d.is_active AND mm.department_text IS NOT NULL
                                            AND (d.key = public.record_normalise_office(mm.department_text)
                                                 OR public.record_normalise_office(d.label) = public.record_normalise_office(mm.department_text))
                                          ORDER BY d.sort_order LIMIT 1)) AS department_key,
           (nullif(btrim(coalesce(p.avatar_url, '')), '') IS NOT NULL) AS c_photo,
           (cpd.title IS NOT NULL AND coalesce(cpd.date_of_birth, p.date_of_birth) IS NOT NULL
            AND (cpd.nationality_code IS NOT NULL OR nullif(btrim(coalesce(p.nationality, '')), '') IS NOT NULL)
            AND nullif(btrim(coalesce(cpd.place_of_birth, p.place_of_birth, '')), '') IS NOT NULL) AS c_personal,
           (cpd.address_line1 IS NOT NULL
            AND (cpd.phone_number IS NOT NULL OR cpd.mobile_number IS NOT NULL OR nullif(btrim(coalesce(p.phone, '')), '') IS NOT NULL)
            AND EXISTS (SELECT 1 FROM public.crew_next_of_kin AS k WHERE k.profile_id = mm.profile_id)) AS c_contact,
           coalesce(dc.passport, false) AS c_passport,
           coalesce(dc.medical, false) AS c_medical,
           st.n AS stcw_n, st.ok AS stcw_ok,
           EXISTS (SELECT 1 FROM public.crew_contracts AS cn
                   WHERE cn.profile_id = mm.profile_id AND cn.status = 'active'
                     AND (cn.end_date IS NULL OR cn.end_date >= current_date)) AS c_contract,
           coalesce(f.list, '[]'::jsonb) AS fam_list,
           coalesce(fq.required, 0) AS fam_required, coalesce(fq.completed, 0) AS fam_completed
    FROM mem AS mm
    JOIN public.profiles AS p ON p.id = mm.profile_id
    LEFT JOIN public.positions AS pos ON pos.id = mm.position_id
    LEFT JOIN public.crew_personal_details AS cpd ON cpd.profile_id = mm.profile_id
    LEFT JOIN docs AS dc ON dc.profile_id = mm.profile_id
    LEFT JOIN stcw AS st ON st.profile_id = mm.profile_id
    LEFT JOIN fam AS f ON f.profile_id = mm.profile_id
    LEFT JOIN famreq AS fq ON fq.profile_id = mm.profile_id
  ),
  checked AS (
    SELECT b.*,
           jsonb_build_array(
             jsonb_build_object('key', 'photo', 'state', CASE WHEN b.c_photo THEN 'pass' ELSE 'fail' END),
             CASE WHEN NOT v_sig_readable THEN jsonb_build_object('key', 'signature', 'state', 'unknown', 'detail', 'not_set_up')
                  ELSE jsonb_build_object('key', 'signature', 'state', CASE WHEN b.user_id = ANY (v_signed) THEN 'pass' ELSE 'fail' END) END,
             jsonb_build_object('key', 'personal', 'state', CASE WHEN b.c_personal THEN 'pass' ELSE 'fail' END),
             jsonb_build_object('key', 'contact', 'state', CASE WHEN b.c_contact THEN 'pass' ELSE 'fail' END),
             jsonb_build_object('key', 'passport', 'state', CASE WHEN b.c_passport THEN 'pass' ELSE 'fail' END),
             jsonb_build_object('key', 'medical', 'state', CASE WHEN b.c_medical THEN 'pass' ELSE 'fail' END),
             CASE WHEN coalesce(b.stcw_n, 0) = 0 THEN jsonb_build_object('key', 'stcw_basic', 'state', 'unknown', 'detail', 'not_configured')
                  ELSE jsonb_build_object('key', 'stcw_basic', 'state', CASE WHEN b.stcw_ok = b.stcw_n THEN 'pass' ELSE 'fail' END,
                                          'detail', format('%s of %s', b.stcw_ok, b.stcw_n)) END,
             jsonb_build_object('key', 'contract', 'state', CASE WHEN b.c_contract THEN 'pass' ELSE 'fail' END)) AS checks_j
    FROM base AS b
  ),
  scored AS (
    SELECT c.*,
           (SELECT count(*) FROM jsonb_array_elements(c.checks_j) AS e WHERE e ->> 'state' = 'pass')::integer AS n_pass,
           (SELECT count(*) FROM jsonb_array_elements(c.checks_j) AS e WHERE e ->> 'state' <> 'unknown')::integer AS n_known
    FROM checked AS c
  )
  SELECT s.profile_id, s.user_id, s.first_name, s.last_name, s.preferred_name, s.avatar_url,
         s.position_name, s.department_key, s.placement_kind, s.join_date,
         s.checks_j, s.n_pass, s.n_known,
         CASE WHEN s.n_known = 0 THEN 0 ELSE round(s.n_pass::numeric * 100 / s.n_known)::integer END,
         s.fam_required, s.fam_completed, s.fam_list,
         (s.n_pass < s.n_known OR s.fam_completed < s.fam_required)
  FROM scored AS s
  ORDER BY s.join_date DESC NULLS LAST, s.last_name, s.first_name, s.profile_id;
END;
$$;

-- The vessel's joiners and their onboarding (gap/04 C18; X1-10B's card and
-- dashboard): crew_onboarding_rows for the vessel, the last p_days (default
-- 90, 1-365), or one person. Gate: vessel.crew.crew_list.view on the
-- vessel (no external viewer), or the caller's own row (p_profile_id their
-- own profile, on the vessel's crew). P0002 unknown vessel, 42501, 22023
-- days_invalid. Browser RPC.
CREATE OR REPLACE FUNCTION public.crew_onboarding_progress(p_vessel_id uuid, p_profile_id uuid DEFAULT NULL, p_days integer DEFAULT 90)
RETURNS TABLE (
  profile_id uuid, user_id uuid, first_name text, last_name text, preferred_name text, avatar_url text,
  position_name text, department_key text, placement_kind text, join_date date,
  checks jsonb, passed integer, known integer, percent integer,
  fam_required integer, fam_completed integer, familiarisation jsonb, is_open boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  IF p_vessel_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'vessel_required';
  END IF;
  IF p_days IS NOT NULL AND p_days NOT BETWEEN 1 AND 365 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'days_invalid', DETAIL = 'Look back 1 to 365 days.';
  END IF;
  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = p_vessel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'vessel_not_found', DETAIL = 'This vessel could not be found.';
  END IF;
  IF NOT ((coalesce(public.crew_vessel_cap('vessel.crew.crew_list.view', p_vessel_id), false) AND NOT public.crew_caller_is_external())
          OR (p_profile_id IS NOT NULL AND p_profile_id IS NOT DISTINCT FROM public.my_profile_id()
              AND coalesce(public.crew_vessel_cap('vessel.crew.crew_profiles.view_own', p_vessel_id), false))) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted',
      DETAIL = 'Seeing the crew''s onboarding needs crew list access on this vessel.';
  END IF;
  RETURN QUERY SELECT * FROM public.crew_onboarding_rows(p_vessel_id, p_profile_id, p_days);
END;
$$;

-- The vessel crew dashboard (gap/04 C2; X1-10B): one jsonb with a section
-- per tile, each answered only for its own read capability on the vessel
-- ({allowed: false} otherwise; {enabled: false} when the vessel has hours
-- of rest off):
--   crewing (crew_list.view): on board, total, pending, on leave, on
--     transfer, ashore (crew_vessel_list today);
--   compliance (crew_compliance.view): the people by worst status
--     (complete, expiring, missing, expired) and the total;
--   onboarding (crew_list.view): joiners of the last 90 days and the open
--     ones, with their percent and familiarisations (the card's people);
--   documents (crew_certificates.view): the current crew's latest
--     documents expired or expiring in their window (alerts off not
--     counted), and the people with them (worst first, at most 20);
--   hours_of_rest (hours_of_rest.view): open (unreviewed, not superseded)
--     breaches on the vessel and last month's months not submitted by the
--     crew assigned then, with the people (at most 20).
-- Gate: crew_list.view on the vessel, no external viewer (P0002, 42501).
-- Browser RPC.
CREATE OR REPLACE FUNCTION public.crew_vessel_dashboard(p_vessel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_crewing jsonb;
  v_compliance jsonb;
  v_onboarding jsonb;
  v_documents jsonb;
  v_hor jsonb;
  v_prev date := (date_trunc('month', current_date) - interval '1 month')::date;
  v_prev_end date := (date_trunc('month', current_date) - interval '1 day')::date;
BEGIN
  v_company := public.crew_vessel_gate('vessel.crew.crew_list.view', p_vessel_id, 'The crew dashboard needs crew list access on this vessel.');
  IF public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'The crew dashboard needs crew list access on this vessel.';
  END IF;

  SELECT jsonb_build_object('allowed', true,
           'total', count(*)::integer,
           'on_board', (count(*) FILTER (WHERE l.status = 'on_board'))::integer,
           'on_leave', (count(*) FILTER (WHERE l.status = 'on_leave'))::integer,
           'pending', (count(*) FILTER (WHERE l.status = 'pending'))::integer,
           'on_transfer', (count(*) FILTER (WHERE l.status = 'on_transfer'))::integer,
           'ashore', (count(*) FILTER (WHERE l.status = 'ashore'))::integer)
  INTO v_crewing
  FROM public.crew_vessel_list(p_vessel_id, current_date) AS l;

  IF coalesce(public.crew_vessel_cap('vessel.crew.crew_compliance.view', p_vessel_id), false) THEN
    SELECT jsonb_build_object('allowed', true,
             'total', count(*)::integer,
             'complete', (count(*) FILTER (WHERE s.status = 'complete'))::integer,
             'expiring', (count(*) FILTER (WHERE s.status = 'expiring'))::integer,
             'missing', (count(*) FILTER (WHERE s.status = 'missing'))::integer,
             'expired', (count(*) FILTER (WHERE s.status = 'expired'))::integer)
    INTO v_compliance
    FROM public.crew_compliance_summary_for(ARRAY[p_vessel_id], current_date, NULL) AS s;
  ELSE
    v_compliance := jsonb_build_object('allowed', false);
  END IF;

  SELECT jsonb_build_object('allowed', true,
           'joiners', count(*)::integer,
           'open', (count(*) FILTER (WHERE o.is_open))::integer,
           'people', coalesce(jsonb_agg(jsonb_build_object(
                        'profile_id', o.profile_id, 'first_name', o.first_name, 'last_name', o.last_name, 'preferred_name', o.preferred_name,
                        'position_name', o.position_name, 'placement_kind', o.placement_kind, 'join_date', o.join_date,
                        'percent', o.percent, 'passed', o.passed, 'known', o.known,
                        'fam_required', o.fam_required, 'fam_completed', o.fam_completed, 'familiarisation', o.familiarisation)
                      ORDER BY o.join_date DESC NULLS LAST, o.last_name, o.profile_id) FILTER (WHERE o.is_open), '[]'::jsonb))
  INTO v_onboarding
  FROM public.crew_onboarding_rows(p_vessel_id, NULL, 90) AS o;

  IF coalesce(public.crew_vessel_cap('vessel.crew.crew_certificates.view', p_vessel_id), false) THEN
    WITH mem AS (
      SELECT m.profile_id FROM public.crew_vessel_members(p_vessel_id, current_date) AS m
    ),
    latest AS (
      SELECT DISTINCT ON (cc.profile_id, coalesce(cc.document_type_id::text, 'legacy:' || coalesce(lower(btrim(cc.certificate_type)), '') || ':' || coalesce(lower(btrim(cc.certificate_name)), '')),
                          coalesce(cc.issuing_country_code, ''))
             cc.id, cc.profile_id, cc.expiry_date, cc.no_expiry, cc.alerts_muted,
             coalesce(t.expiry_item_type, 'crew_qualification') AS item_type, cc.document_type_id
      FROM public.crew_certificates AS cc
      LEFT JOIN public.crew_document_types AS t ON t.id = cc.document_type_id
      WHERE cc.profile_id IN (SELECT mem.profile_id FROM mem) AND cc.deleted_at IS NULL AND cc.verification_status <> 'rejected'
      ORDER BY cc.profile_id, coalesce(cc.document_type_id::text, 'legacy:' || coalesce(lower(btrim(cc.certificate_type)), '') || ':' || coalesce(lower(btrim(cc.certificate_name)), '')),
               coalesce(cc.issuing_country_code, ''), cc.no_expiry DESC, cc.expiry_date DESC NULLS LAST, cc.updated_at DESC, cc.id
    ),
    bucketed AS (
      SELECT l.profile_id, l.expiry_date,
             public.expiry_bucket(l.expiry_date, public.expiry_window_for(v_company, l.item_type, l.document_type_id), current_date, l.no_expiry) AS bucket
      FROM latest AS l
      WHERE NOT l.alerts_muted AND (l.no_expiry OR l.expiry_date IS NOT NULL)
    ),
    per AS (
      SELECT b.profile_id,
             (count(*) FILTER (WHERE b.bucket = 'expired'))::integer AS expired,
             (count(*) FILTER (WHERE b.bucket IN ('expiring', 'expiring_soon')))::integer AS expiring,
             min(b.expiry_date) FILTER (WHERE b.bucket IN ('expired', 'expiring', 'expiring_soon')) AS next_expiry
      FROM bucketed AS b
      GROUP BY b.profile_id
      HAVING count(*) FILTER (WHERE b.bucket IN ('expired', 'expiring', 'expiring_soon')) > 0
    )
    SELECT jsonb_build_object('allowed', true,
             'expired', coalesce(sum(per.expired), 0)::integer,
             'expiring', coalesce(sum(per.expiring), 0)::integer,
             'people', coalesce((SELECT jsonb_agg(x.j ORDER BY x.expired DESC, x.next_expiry, x.profile_id)
                                 FROM (SELECT pr.profile_id, pr.expired, pr.next_expiry,
                                              jsonb_build_object('profile_id', pr.profile_id, 'first_name', p.first_name, 'last_name', p.last_name,
                                                                 'preferred_name', p.preferred_name, 'expired', pr.expired, 'expiring', pr.expiring,
                                                                 'next_expiry', pr.next_expiry) AS j
                                       FROM per AS pr JOIN public.profiles AS p ON p.id = pr.profile_id
                                       ORDER BY pr.expired DESC, pr.next_expiry, pr.profile_id
                                       LIMIT 20) AS x), '[]'::jsonb))
    INTO v_documents
    FROM per;
  ELSE
    v_documents := jsonb_build_object('allowed', false);
  END IF;

  IF NOT coalesce(public.crew_vessel_cap('vessel.crew.hours_of_rest.view', p_vessel_id), false) THEN
    v_hor := jsonb_build_object('allowed', false);
  ELSIF NOT coalesce(public.work_rest_hor_on(p_vessel_id, current_date), false) THEN
    v_hor := jsonb_build_object('allowed', true, 'enabled', false);
  ELSE
    WITH breaches AS (
      SELECT p.id AS profile_id, count(*)::integer AS n
      FROM public.work_rest_non_conformities AS nc
      JOIN public.profiles AS p ON p.user_id = nc.crew_id
      WHERE nc.vessel_id = p_vessel_id AND nc.superseded_at IS NULL AND nc.review_outcome IS NULL
      GROUP BY p.id
    ),
    due AS (
      SELECT DISTINCT p.id AS profile_id
      FROM public.crew_assignments AS ca
      JOIN public.profiles AS p ON p.user_id = ca.user_id AND p.company_id = v_company
      WHERE ca.vessel_id = p_vessel_id
        AND coalesce(ca.join_date, ca.start_date) IS NOT NULL AND coalesce(ca.join_date, ca.start_date) <= v_prev_end
        AND CASE WHEN coalesce(ca.leave_date, ca.end_date) IS NOT NULL THEN coalesce(ca.leave_date, ca.end_date) >= v_prev
                 ELSE coalesce(ca.is_current, false) END
        AND public.work_rest_hor_on(p_vessel_id, v_prev_end)
        AND NOT EXISTS (SELECT 1 FROM public.work_rest_monthly_submissions AS s
                        WHERE s.crew_id = ca.user_id AND s.vessel_id = p_vessel_id
                          AND s.period_year = extract(year FROM v_prev)::integer AND s.period_month = extract(month FROM v_prev)::integer
                          AND s.status NOT IN ('draft', 'reopened'))
    ),
    people AS (
      SELECT coalesce(b.profile_id, d.profile_id) AS profile_id, coalesce(b.n, 0) AS open_breaches, d.profile_id IS NOT NULL AS unsubmitted
      FROM breaches AS b FULL OUTER JOIN due AS d ON d.profile_id = b.profile_id
    )
    SELECT jsonb_build_object('allowed', true, 'enabled', true,
             'open_breaches', coalesce(sum(pp.open_breaches), 0)::integer,
             'unsubmitted', (count(*) FILTER (WHERE pp.unsubmitted))::integer,
             'month', to_char(v_prev, 'YYYY-MM'),
             'people', coalesce((SELECT jsonb_agg(x.j ORDER BY x.open_breaches DESC, x.last_name, x.profile_id)
                                 FROM (SELECT q.profile_id, q.open_breaches, pr.last_name,
                                              jsonb_build_object('profile_id', q.profile_id, 'first_name', pr.first_name, 'last_name', pr.last_name,
                                                                 'preferred_name', pr.preferred_name, 'open_breaches', q.open_breaches,
                                                                 'unsubmitted', q.unsubmitted) AS j
                                       FROM people AS q JOIN public.profiles AS pr ON pr.id = q.profile_id
                                       ORDER BY q.open_breaches DESC, pr.last_name, q.profile_id
                                       LIMIT 20) AS x), '[]'::jsonb))
    INTO v_hor
    FROM people AS pp;
  END IF;

  RETURN jsonb_build_object(
    'vessel_id', p_vessel_id,
    'today', current_date,
    'crewing', v_crewing,
    'compliance', v_compliance,
    'onboarding', v_onboarding,
    'documents', v_documents,
    'hours_of_rest', v_hor);
END;
$$;

-- ---------------------------------------------------------------- RLS

-- The legacy policies (20260125230014) let every company member read and
-- write every familiarisation of the company. They go; reads are scoped
-- (hoisted, D-229) and there is no browser write policy.
DROP POLICY IF EXISTS "Users can view familiarization templates in their company" ON public.familiarization_templates;
DROP POLICY IF EXISTS "Users can manage familiarization templates in their company" ON public.familiarization_templates;
DROP POLICY IF EXISTS "Users can view familiarization records in their company" ON public.familiarization_records;
DROP POLICY IF EXISTS "Users can manage familiarization records in their company" ON public.familiarization_records;
DROP POLICY IF EXISTS "Users can view checklist items in their company" ON public.familiarization_checklist_items;
DROP POLICY IF EXISTS "Users can manage checklist items in their company" ON public.familiarization_checklist_items;

-- Templates: the caller's company; fleet templates for every active member,
-- vessel templates for familiarisation viewers of that vessel.
DROP POLICY IF EXISTS familiarization_templates_select_scoped ON public.familiarization_templates;
CREATE POLICY familiarization_templates_select_scoped ON public.familiarization_templates
  FOR SELECT TO authenticated
  USING (company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
         AND (vessel_id IS NULL OR vessel_id IN (SELECT public.crew_cap_vessel_ids('vessel.crew.familiarisation.view'))));

-- Records: the caller's company; the vessels they read familiarisation on
-- (no external viewer), legacy HR viewers, or their own records on a vessel
-- they reach.
DROP POLICY IF EXISTS familiarization_records_select_scoped ON public.familiarization_records;
CREATE POLICY familiarization_records_select_scoped ON public.familiarization_records
  FOR SELECT TO authenticated
  USING (company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
         AND ((NOT (SELECT public.crew_caller_is_external())
               AND (vessel_id IN (SELECT public.crew_cap_vessel_ids('vessel.crew.familiarisation.view'))
                    OR (SELECT public.hr_can_view((SELECT auth.uid())))))
              OR (profile_id = (SELECT public.my_profile_id())
                  AND vessel_id IN (SELECT public.crew_cap_vessel_ids('vessel.crew.familiarisation.view_own')))));

-- Items: through their record (the records policy applies to the
-- subquery), for an active caller (checked here too, once per statement).
DROP POLICY IF EXISTS familiarization_checklist_items_select_scoped ON public.familiarization_checklist_items;
CREATE POLICY familiarization_checklist_items_select_scoped ON public.familiarization_checklist_items
  FOR SELECT TO authenticated
  USING ((SELECT public.user_is_active((SELECT auth.uid())))
         AND familiarization_id IN (SELECT fr.id FROM public.familiarization_records AS fr));

-- Required positions: company members; a vessel-bound row for those who reach the vessel.
DROP POLICY IF EXISTS familiarization_template_positions_select_scoped ON public.familiarization_template_positions;
CREATE POLICY familiarization_template_positions_select_scoped ON public.familiarization_template_positions
  FOR SELECT TO authenticated
  USING (company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
         AND (vessel_id IS NULL OR vessel_id IN (SELECT public.user_vessel_reach((SELECT auth.uid())))));

-- ---------------------------------------------------------------- grants

REVOKE ALL ON public.familiarization_template_positions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.familiarization_template_positions TO authenticated;
GRANT ALL ON public.familiarization_template_positions TO service_role;

-- Browser RPCs.
REVOKE ALL ON FUNCTION public.familiarisation_template_save(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.familiarisation_start(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.familiarisation_tick(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.familiarisation_sign(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.familiarisation_reopen(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.familiarisation_delete(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.familiarisation_vessel_overview(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.familiarisation_record_detail(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crew_onboarding_progress(uuid, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crew_vessel_dashboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.familiarisation_template_save(uuid, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_start(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_tick(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_sign(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_reopen(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_delete(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_vessel_overview(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_record_detail(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_onboarding_progress(uuid, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_vessel_dashboard(uuid) TO authenticated, service_role;

-- Pure rules and internals: service role only (the definers call them as owner).
REVOKE ALL ON FUNCTION public.familiarisation_status_decide(integer, integer, boolean, boolean, boolean, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.familiarisation_overdue(text, date, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.familiarisation_action_check(text, text, integer, boolean, boolean, boolean, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.familiarisation_actor_decide(text, boolean, boolean, boolean, boolean, boolean, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.familiarisation_sections_normalise(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.familiarisation_supervisor_scope(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.familiarisation_vessel_templates(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.familiarisation_required_templates(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.familiarisation_member_position(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.familiarisation_record_recompute(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.familiarisation_notify_assigned(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.familiarisation_open_record(uuid, uuid, uuid, date, uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.familiarisation_requirement_sync(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.familiarisation_open_required(uuid, uuid, uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.familiarisation_record_json(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.familiarisation_record_gate(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.familiarisation_template_json(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_onboarding_rows(uuid, uuid, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_status_decide(integer, integer, boolean, boolean, boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_overdue(text, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_action_check(text, text, integer, boolean, boolean, boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_actor_decide(text, boolean, boolean, boolean, boolean, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_sections_normalise(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_supervisor_scope(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_vessel_templates(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_required_templates(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_member_position(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_record_recompute(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_notify_assigned(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_open_record(uuid, uuid, uuid, date, uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_requirement_sync(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_open_required(uuid, uuid, uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_record_json(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_record_gate(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.familiarisation_template_json(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.crew_onboarding_rows(uuid, uuid, integer) TO service_role;
-- Trigger functions: no grant.
REVOKE ALL ON FUNCTION public.familiarization_templates_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.familiarization_records_status_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.familiarization_checklist_items_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.familiarization_items_recompute() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.familiarization_template_positions_scope_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.familiarisation_required_on_terms() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON TABLE public.familiarization_template_positions IS 'The positions a familiarisation template is required for (X1-10; gap/04 C36, C63, W11): vessel_id NULL for every vessel of a fleet template (and a vessel template''s own vessel otherwise). Saving a template keeps one familiarisation requirement row per vessel it applies to, so Crew Compliance counts the completed records in Met. Read: company members (a vessel-bound row: those who reach the vessel); written by familiarisation_template_save only.';
COMMENT ON COLUMN public.familiarization_templates.code IS 'FAM-<vessel code>-<year>-<nnn> for a vessel template, FAM-<year>-<nnn> for a fleet template (C21, D-X1-24): allocated once by format_reference(''FAM'', company, vessel), unique per company, never changed.';
COMMENT ON COLUMN public.familiarization_templates.scope IS 'fleet (vessel_id NULL: every vessel of the company) or vessel (vessel_id set).';
COMMENT ON COLUMN public.familiarization_templates.variant_of IS 'The fleet template this vessel template replaces on its vessel while active (T-134).';
COMMENT ON COLUMN public.familiarization_templates.due_within_days IS 'A record is due this many days after the person joins (0-365).';
COMMENT ON COLUMN public.familiarization_templates.form_template_id IS 'An optional company form (form_templates) linked to the template; not filled from the familiarisation pages in wave 1.';
COMMENT ON COLUMN public.familiarization_records.status IS 'open | in_progress | awaiting_signatures | completed (familiarisation_status_decide: items ticked, then the required signatures). Overdue is computed (familiarisation_overdue). Written by the X1 engine only (familiarization_records_status_guard).';
COMMENT ON COLUMN public.familiarization_records.profile_id IS 'The person (profiles.id); user_id is their login, NULL for a person without one (no-login joiners hold records too).';
COMMENT ON COLUMN public.familiarization_records.requires_crew_signature IS 'The template''s crew signature flag when the record was opened (later template changes leave the record''s rule alone).';
COMMENT ON COLUMN public.familiarization_records.crew_signed_at IS 'The crew member''s signature (an attestation, D-X1-6; wave 2 moves it to the signature engine).';
COMMENT ON COLUMN public.familiarization_records.supervisor_signed_at IS 'The supervisor''s signature (familiarisation.approve and the person''s department; D-X1-6).';
COMMENT ON COLUMN public.familiarization_records.reopened_reason IS 'Why a supervisor reopened the record (its signatures were cleared).';

COMMENT ON FUNCTION public.familiarisation_status_decide(integer, integer, boolean, boolean, boolean, boolean) IS 'Pure (gap/04 W11): the status of a record from its item counts and signatures: open, in_progress, awaiting_signatures, completed. Mirrors decideStatus() in src/modules/crew/lib/familiarisation.ts.';
COMMENT ON FUNCTION public.familiarisation_overdue(text, date, date) IS 'Pure: overdue is past the due date and not completed (never stored). Mirrors isOverdue().';
COMMENT ON FUNCTION public.familiarisation_action_check(text, text, integer, boolean, boolean, boolean, boolean) IS 'Pure: whether a record''s state allows tick / sign_crew / sign_supervisor / reopen / delete: ok or the 22023 refusal code. Mirrors checkAction().';
COMMENT ON FUNCTION public.familiarisation_actor_decide(text, boolean, boolean, boolean, boolean, boolean, text) IS 'Pure: whether the caller may take an action from who they are (own record, login, view_own, edit, create, the supervisor scope): ok or the 42501 refusal code. Mirrors decideActor().';
COMMENT ON FUNCTION public.familiarisation_sections_normalise(jsonb) IS 'Internal: a template''s sections checked and normalised (1-30 sections, 1-60 items of 1-300 characters, unique names); 22023 with HINT sections.<n>.';
COMMENT ON FUNCTION public.familiarisation_supervisor_scope(uuid, uuid, uuid) IS 'Internal: ok, out_of_department, own_record or not_permitted: who may sign as supervisor and reopen (familiarisation.approve; the Master, command tier and fleet reach for every department, anyone else their own department).';
COMMENT ON FUNCTION public.familiarisation_vessel_templates(uuid) IS 'Internal: the active templates that apply on a vessel (its own, and fleet templates without an active variant there).';
COMMENT ON FUNCTION public.familiarisation_required_templates(uuid, uuid) IS 'Internal: the applicable templates naming a position for every vessel or for this one.';
COMMENT ON FUNCTION public.familiarisation_member_position(uuid, uuid) IS 'Internal: a person''s position on a vessel''s crew today (crew_position_for on the position title, else the rank).';
COMMENT ON FUNCTION public.familiarisation_record_recompute(uuid) IS 'Internal: a record''s status and completion columns from its items and signatures.';
COMMENT ON FUNCTION public.familiarisation_notify_assigned(uuid) IS 'Internal: sends familiarisation_assigned to the person''s login (vessel link to the record); never raises (D-128).';
COMMENT ON FUNCTION public.familiarisation_open_record(uuid, uuid, uuid, date, uuid, date) IS 'Internal: opens a record of a template for a person on a vessel, copying the template''s sections into the items (the C63 fix); NULL when an open record exists.';
COMMENT ON FUNCTION public.familiarisation_requirement_sync(uuid, uuid) IS 'Internal: one familiarisation requirement row per vessel the template applies to (seed_key familiarisation.<id>), ticked for its positions (C36).';
COMMENT ON FUNCTION public.familiarisation_open_required(uuid, uuid, uuid, date) IS 'Internal (the crew_assignment_terms trigger): opens the familiarisations required of the person''s position on the vessel and tells their login (familiarisation_assigned). Returns the number opened.';
COMMENT ON FUNCTION public.familiarisation_record_json(uuid, boolean) IS 'Internal: a record for its page, with the caller''s rights from the definers'' own rules.';
COMMENT ON FUNCTION public.familiarisation_record_gate(uuid) IS 'Internal: the record of a write RPC, locked, for a caller who may see it (P0002 otherwise).';
COMMENT ON FUNCTION public.familiarisation_template_json(uuid) IS 'Internal: a template for the page (code, scope, sections, positions, counts of items).';
COMMENT ON FUNCTION public.crew_onboarding_rows(uuid, uuid, integer) IS 'Internal: the eight onboarding checks and the familiarisations of a vessel''s joiners (gap/04 C18; the signature check reads unknown while user_signature_images is missing).';
COMMENT ON FUNCTION public.familiarisation_template_save(uuid, uuid, jsonb) IS 'Creates or updates a familiarisation template (X1-10; gap/04 C63, W11, T-15, T-134): name, description, due within, signatures, sections, required positions, active, vessel variant. Vessel template: familiarisation.edit on the vessel; fleet template: the company-wide edit answer (has_company_capability_for, D-376) and fleet reach or an admin of every vessel (admin_scope_all). Browser RPC.';
COMMENT ON FUNCTION public.familiarisation_start(uuid, uuid, uuid) IS 'Starts a familiarisation from the chosen template for a person of the vessel''s crew (X1-10; the C63 fix). Gate: familiarisation.create. Browser RPC.';
COMMENT ON FUNCTION public.familiarisation_tick(uuid, boolean, text) IS 'Ticks or unticks a familiarisation item (the person, or familiarisation.edit); the status follows. Browser RPC.';
COMMENT ON FUNCTION public.familiarisation_sign(uuid, text) IS 'Signs a familiarisation as the crew member (own record, a login) or the supervisor (familiarisation.approve, same department); completes it when the required signatures are there (D-X1-6). Browser RPC.';
COMMENT ON FUNCTION public.familiarisation_reopen(uuid, text) IS 'Reopens a completed or signed familiarisation with a reason (supervisor of the department); clears the signatures. Browser RPC.';
COMMENT ON FUNCTION public.familiarisation_delete(uuid) IS 'Deletes a familiarisation started by mistake (open, nothing ticked; familiarisation.create). Browser RPC.';
COMMENT ON FUNCTION public.familiarisation_vessel_overview(uuid, boolean) IS 'The vessel''s familiarisation page in one read (X1-10; gap/04 C63): templates with completed / in progress / overdue / missing counts, the latest or all records, the crew to start one for and the caller''s rights. Gate: familiarisation.view. Browser RPC.';
COMMENT ON FUNCTION public.familiarisation_record_detail(uuid) IS 'One familiarisation record with its items and the caller''s rights (X1-10). Gate: familiarisation.view on its vessel, or the caller''s own record with view_own (P0002 otherwise). Browser RPC.';
COMMENT ON FUNCTION public.crew_onboarding_progress(uuid, uuid, integer) IS 'The eight onboarding checks per recent joiner of a vessel, or one person (X1-10 for X1-10B; gap/04 C18). Gate: crew_list.view, or the caller''s own row. Browser RPC.';
COMMENT ON FUNCTION public.crew_vessel_dashboard(uuid) IS 'The vessel crew dashboard''s KPIs and cards (X1-10 for X1-10B; gap/04 C2): crewing, compliance, onboarding, documents, hours of rest, each for its own read capability. Gate: crew_list.view. Browser RPC.';
