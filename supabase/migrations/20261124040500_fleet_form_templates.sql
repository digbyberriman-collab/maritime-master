-- =================================================================
-- FLEET OPERATIONS X5-06A: form and checklist templates by area
-- (gap/02 FC3 publish rules, FC4 data, FC5, FC6 data, W2; gap/08 EX7;
-- DECISIONS C6, D-01, D-04, D-55, D-120, D-157, D-173; X5 spec §2 X5-06A,
-- D-X5-13, D-X5-20, D-X5-21, D-X5-23)
-- Live table changed: form_templates (catalogue columns, named CHECKs,
--   backfill, guard and audit triggers, the SELECT policy)
-- Tables: form_template_vessel_settings, form_template_events
-- Functions (browser): form_template_publish, form_template_new_version,
--   form_template_customise, form_template_archive,
--   form_template_delete_draft, form_template_move_area,
--   form_template_set_visibility, form_template_reorder,
--   form_template_run_stats
-- Functions (service role): form_template_legacy_kind,
--   form_template_legacy_area, form_template_targets_vessel,
--   form_template_next_due, form_template_publish_blocker,
--   form_template_gate, form_template_vessel_manager_for,
--   form_template_log
-- Triggers: form_templates_guard, form_templates_audit,
--   form_template_vessel_settings_guard, form_template_events_guard
-- TS mirrors: src/modules/forms/types/db.pending.ts (columns, rows, RPCs);
--   src/modules/forms/lib/templateMachine.ts (the states x actions table,
--   copied between the machine-table markers of
--   supabase/tests/sql/fleet/form_templates.test.sql and pinned by
--   src/test/forms/templateMachine.test.ts), lib/publishChecks.ts
--   (form_template_publish_blocker; the publish-cases markers),
--   lib/cadence.ts (form_template_next_due; the cadence-cases markers),
--   lib/areaModel.ts (the area, kind and cadence lists below)
-- =================================================================
--
-- The fleet's form and checklist catalogue (gap/02 W2, §4.6). A template
-- belongs to an area (where crews find it on board), has a kind, a
-- cadence, a version and a target: every vessel including future ones
-- (vessel_scope FLEET) or the listed vessels (VESSEL_SPECIFIC + vessel_ids;
-- the live columns, D-X5-13: no target_mode column). Runs stay in the live
-- form_submissions (X2 owns run columns) and keep the template id and
-- version they used.
--
-- Area model (C6; lib/areaModel.ts):
--   area       charter | safety | technical | movement | ptw |
--              familiarisation | crew | sms | technical_forms; NULL is
--              "Unsorted" (a template not mapped to an area yet)
--   form_kind  form | checklist | register | passage_plan | permit
--   cadence    none | daily | weekly | monthly | quarterly | six_monthly |
--              yearly | two_yearly | five_yearly | per_voyage |
--              per_charter | on_demand
--   origin     platform (a standard template the platform seeds, service
--              role only) | company
-- Backfill: area and form_kind from form_type and the category name, by
-- the mapping table of form_template_legacy_area / _legacy_kind below; a
-- new row without them gets the same mapping (the legacy builder keeps
-- landing its templates in an area).
--
-- Template lifecycle (lib/templateMachine.ts):
--
--   status \ action  publish                new_version         customise           archive            delete_draft          move_area            set_visibility
--   DRAFT            PUBLISHED              !template_draft     !template_draft     ARCHIVED           (deleted)             DRAFT                !template_not_published
--   PUBLISHED        !already_published     PUBLISHED (+ draft) PUBLISHED (+ copy)  ARCHIVED           !template_published   PUBLISHED            PUBLISHED
--   SUPERSEDED       !template_superseded   !template_superseded SUPERSEDED (+ copy) ARCHIVED          !template_published   !template_superseded !template_not_published
--   ARCHIVED         !template_archived     ARCHIVED (+ draft)  ARCHIVED (+ copy)   !already_archived  !template_archived    !template_archived   !template_not_published
--
--   A template is written as a DRAFT (directly, by the live INSERT and
--   UPDATE policies, or by the definers). Publishing a draft checks it
--   (form_template_publish_blocker: a name, at least one item, no empty
--   section, no unlabelled section or item, a vessel when targeted at
--   selected vessels; and every listed vessel is the company's), takes the
--   typed version label (<= 40, unique in the family) or none ("v<n>"),
--   and supersedes every other PUBLISHED row of its family (same company
--   and template_code): they become SUPERSEDED and keep their runs; their
--   per-vessel settings carry over to the new version. A Customise copy
--   (source_template_id) hides the published version of its source on the
--   copy's vessels when it is published. "Edit" of a published or
--   archived template is form_template_new_version: a new DRAFT with the
--   same template_code, version max + 1, supersedes_template_id set and the
--   content copied (it replaces the legacy "restore", and keeps
--   UNIQUE (company_id, template_code, version)); one open draft per
--   family; a platform template is customised, not versioned. Archiving
--   takes a template out of service everywhere; runs stay readable. Only a
--   never-published DRAFT with no runs is deleted (with its schedules and
--   extraction jobs); anything else is archived.
--
-- Per vessel (FC4): form_template_vessel_settings holds whether a
-- published template is shown or hidden on a vessel it targets (with who,
-- when and why) and its order in its area there. Hidden is not a template
-- status (statusTone form_template 'hidden').
--
-- Rights (gap/02 W2 "Who can act"; D-X5-21):
--   fleet checklist admins   fleet_ops_can(company, NULL, 'checklists',
--                            'admin') (fleet reach plus the adaptor's
--                            fleet.operations.fleet_checklists.admin rule:
--                            DPA, shore management, RBAC ism admin):
--                            every definer, on any vessel
--   vessel managers          the vessel's Master (record_is_master) or
--                            fleet_ops_can(company, vessel, 'checklists',
--                            'edit'): hide, restore and reorder on that
--                            vessel (form_template_vessel_manager_for)
--   run statistics           fleet_ops_can(company, vessel, 'checklists',
--                            'view') or the vessel's Master, per vessel
-- Every definer takes the caller's company (get_user_company_id; NULL for
-- an inactive user, D-157), validates each id against it (an unknown or
-- foreign template is P0002 template_not_found, a foreign or unreached
-- vessel 42501 vessel_out_of_reach), refuses business rules with 22023 and
-- a stable snake_case message (templateMachine.ts maps it to a sentence)
-- and writes one form_template_events row per change (D-X5-23). This closes
-- the D-173 open item: template actions are audited by the server, never
-- by the browser.
--
-- Guard (BEFORE INSERT OR UPDATE OR DELETE on form_templates, every role,
-- the service role and the table owner included): outside the
-- transaction-local flag storm.fleet_tx = 'on' (set only by the definers
-- here)
--   - an insert is a DRAFT, version 1, origin company, with no
--     version_label, published_*, archived_at, supersedes_template_id or
--     source_template_id;
--   - status, version, version_label, published_at / _by, archived_at,
--     supersedes_template_id, origin and source_template_id never change;
--   - a row that is not a DRAFT never changes at all (its content is
--     frozen: publish a new version instead), and a draft of a later
--     version keeps its template_code;
--   - only a never-published DRAFT with no form_submissions is deleted
--     (the live DELETE policy is kept; the guard narrows it).
-- id, company_id, created_by and created_at never change. A referential
-- cascade (the company deleted) passes: it runs one trigger level down
-- (pg_trigger_depth() > 1). Refusals are 42501 form_templates_guarded.
-- The AFTER trigger form_templates_audit writes 'created', 'edited' and
-- 'draft_deleted' events for the direct writes the guard lets through.
--
-- Live behaviour once applied (owner's apply session; ledger row 6):
--   - the template pages publish, archive, restore (now "new version"),
--     duplicate (now "customise") and delete through the definers; while
--     form_template_publish is missing the client keeps today's publish
--     and archive writes as its D-01 fallback (D-X5-20) and nothing else,
--     so the fallback never runs once the guard is live;
--   - a legacy Master no longer publishes, archives or deletes a published
--     template directly (the old policies let them); fleet checklist admins
--     do, through the definers; a Master still writes drafts and manages
--     the order and visibility on their own vessel;
--   - company members also read SUPERSEDED and ARCHIVED templates, so a run
--     of an older version still shows its form (the old SELECT policy
--     showed PUBLISHED rows only);
--   - existing templates get an area (backfill), vessel_scope is
--     normalised to FLEET / VESSEL_SPECIFIC.
--
-- Idempotent (D-12, D-55): columns ADD IF NOT EXISTS, CHECKs and the FK
-- dropped and added, the backfill fills only NULLs and normalises only
-- values outside the CHECK, tables IF NOT EXISTS, indexes IF NOT EXISTS,
-- policies and triggers dropped and created, functions CREATE OR REPLACE.

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regclass('public.form_templates') IS NULL OR to_regclass('public.form_submissions') IS NULL
     OR to_regclass('public.form_categories') IS NULL OR to_regclass('public.form_schedules') IS NULL
     OR to_regclass('public.form_ai_extraction_jobs') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040500_fleet_form_templates needs the live ISM forms tables (form_templates, form_submissions, form_categories, form_schedules, form_ai_extraction_jobs)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'form_templates' AND column_name = 'archived_at')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.form_templates'::regclass AND conname = 'form_templates_status_check') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040500_fleet_form_templates needs form_templates.archived_at (20260428192246) and form_templates_status_check (20260919210000_ism_form_workflow.sql)';
  END IF;
  IF to_regprocedure('public.fleet_ops_can_for(uuid,uuid,uuid,text,text)') IS NULL
     OR to_regprocedure('public.fleet_ops_can(uuid,uuid,text,text)') IS NULL
     OR to_regprocedure('public.fleet_counted_vessels_for(uuid,uuid,uuid[])') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040500_fleet_form_templates needs the fleet access helpers: apply 20261124040000_fleet_expiry_engine.sql first';
  END IF;
  IF to_regprocedure('public.record_is_master(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040500_fleet_form_templates needs record_is_master(): apply 20261123020100_platform_record_signatures.sql first';
  END IF;
  IF to_regprocedure('public.user_is_active(uuid)') IS NULL
     OR to_regprocedure('public.get_user_company_id(uuid)') IS NULL
     OR to_regprocedure('public.user_belongs_to_company(uuid,uuid)') IS NULL
     OR to_regprocedure('public.user_can_reach_vessel(uuid,uuid)') IS NULL
     OR to_regprocedure('public.vessel_in_reachable_state(text,text)') IS NULL
     OR to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040500_fleet_form_templates needs the reach and status helpers (20261123000300, 20261123010000) and update_updated_at_column()';
  END IF;
END
$$;

-- ---------------------------------------------------------------- the area mapping (backfill and new rows)

-- The kind of a legacy template, from its form_type and category name:
--
--   category name contains   form_type                    form_kind
--   'passage'                any                          passage_plan
--   -                        CHECKLIST, INSPECTION        checklist
--   -                        PERMIT_TO_WORK               permit
--   -                        anything else                form
CREATE OR REPLACE FUNCTION public.form_template_legacy_kind(p_form_type text, p_category_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN coalesce(p_category_name, '') ~* 'passage' THEN 'passage_plan'
    WHEN upper(btrim(coalesce(p_form_type, ''))) IN ('CHECKLIST', 'INSPECTION') THEN 'checklist'
    WHEN upper(btrim(coalesce(p_form_type, ''))) = 'PERMIT_TO_WORK' THEN 'permit'
    ELSE 'form'
  END
$$;

-- The area of a legacy template. The category name decides first (the
-- first matching rule, case-insensitive); otherwise the form_type does;
-- otherwise none (NULL, "Unsorted"). Where a rule names two areas, a
-- checklist (form_template_legacy_kind) goes to the first, anything else
-- to the second.
--
--   rule  category name matches                          checklist area   form area
--   1     familiar                                       familiarisation  familiarisation
--   2     permit, ptw                                    ptw              ptw
--   3     passage, movement, navigation, mooring         movement         movement
--   4     charter, guest, trip                           charter          charter
--   5     technical, engine, maintenance, machinery      technical        technical_forms
--   6     crew (a whole word)                            crew             crew
--   7     safety, sms, ism (whole words for sms / ism)   safety           sms
--
--   form_type (no category rule)                         area
--   CHECKLIST                                            safety
--   INSPECTION                                           technical
--   PERMIT_TO_WORK                                       ptw
--   REPORT, MEETING_MINUTES, DRILL_REPORT, HANDOVER,     sms
--   AUDIT_FORM, RISK_ASSESSMENT
--   OTHER, anything else                                 NULL (Unsorted)
CREATE OR REPLACE FUNCTION public.form_template_legacy_area(p_form_type text, p_category_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH rules (rule_order, pattern, checklist_area, form_area) AS (
    VALUES
      (1, 'familiar', 'familiarisation', 'familiarisation'),
      (2, '(permit|ptw)', 'ptw', 'ptw'),
      (3, '(passage|movement|navigation|mooring)', 'movement', 'movement'),
      (4, '(charter|guest|trip)', 'charter', 'charter'),
      (5, '(technical|engine|maintenance|machinery)', 'technical', 'technical_forms'),
      (6, '\mcrew\M', 'crew', 'crew'),
      (7, '(safety|\msms\M|\mism\M)', 'safety', 'sms')
  ),
  types (form_type, area) AS (
    VALUES
      ('CHECKLIST', 'safety'),
      ('INSPECTION', 'technical'),
      ('PERMIT_TO_WORK', 'ptw'),
      ('REPORT', 'sms'),
      ('MEETING_MINUTES', 'sms'),
      ('DRILL_REPORT', 'sms'),
      ('HANDOVER', 'sms'),
      ('AUDIT_FORM', 'sms'),
      ('RISK_ASSESSMENT', 'sms')
  ),
  by_category AS (
    SELECT CASE WHEN public.form_template_legacy_kind(p_form_type, p_category_name) = 'checklist' THEN r.checklist_area ELSE r.form_area END AS area
    FROM rules AS r
    WHERE coalesce(p_category_name, '') ~* r.pattern
    ORDER BY r.rule_order
    LIMIT 1
  )
  SELECT coalesce(
    (SELECT area FROM by_category),
    (SELECT t.area FROM types AS t WHERE t.form_type = upper(btrim(coalesce(p_form_type, '')))))
$$;

-- ---------------------------------------------------------------- form_templates: the catalogue columns (D-X5-13, C6)

ALTER TABLE public.form_templates
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS form_kind text,
  ADD COLUMN IF NOT EXISTS cadence text,
  ADD COLUMN IF NOT EXISTS requires_completion_signature boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS source_template_id uuid,
  ADD COLUMN IF NOT EXISTS version_label text;

-- Backfill and normalisation, before the CHECKs. Under the definer flag so
-- the guard (from pass 1 on a re-run) lets the migration's own writes
-- through; the audit trigger writes no event under it. Fills only NULLs,
-- normalises only values the CHECKs would refuse.
DO $$
DECLARE
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
BEGIN
  PERFORM set_config('storm.fleet_tx', 'on', true);

  -- area and form_kind from form_type and the category name (NULL area: Unsorted).
  UPDATE public.form_templates AS t SET
    area = coalesce(t.area, public.form_template_legacy_area(t.form_type, c.name)),
    form_kind = coalesce(t.form_kind, public.form_template_legacy_kind(t.form_type, c.name))
  FROM (SELECT ft.id, fc.name::text AS name
        FROM public.form_templates AS ft
        LEFT JOIN public.form_categories AS fc ON fc.id = ft.category_id) AS c
  WHERE c.id = t.id
    AND (t.form_kind IS NULL OR (t.area IS NULL AND public.form_template_legacy_area(t.form_type, c.name) IS NOT NULL));

  -- vessel_scope: upper case, the two values the live code reads.
  UPDATE public.form_templates SET vessel_scope = CASE
      WHEN upper(btrim(coalesce(vessel_scope, ''))) IN ('FLEET', 'ALL', 'COMPANY', 'FLEET_WIDE') THEN 'FLEET'
      WHEN upper(btrim(coalesce(vessel_scope, ''))) IN ('VESSEL_SPECIFIC', 'VESSEL', 'VESSELS', 'SPECIFIC', 'SELECTED') THEN 'VESSEL_SPECIFIC'
      WHEN cardinality(array_remove(coalesce(vessel_ids, '{}'::uuid[]), NULL)) > 0 THEN 'VESSEL_SPECIFIC'
      ELSE 'FLEET'
    END
  WHERE vessel_scope IS NULL OR vessel_scope NOT IN ('FLEET', 'VESSEL_SPECIFIC');

  -- Values a client may have written outside the new lists.
  UPDATE public.form_templates SET origin = 'company' WHERE origin NOT IN ('platform', 'company');
  UPDATE public.form_templates SET version_label = left(btrim(version_label), 40)
  WHERE version_label IS NOT NULL AND (version_label <> btrim(version_label) OR length(version_label) > 40);
  UPDATE public.form_templates SET version_label = NULL WHERE version_label = '';

  PERFORM set_config('storm.fleet_tx', v_prev, true);
END
$$;

ALTER TABLE public.form_templates
  DROP CONSTRAINT IF EXISTS form_templates_status_check,
  ADD CONSTRAINT form_templates_status_check CHECK (status IN ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED')),
  DROP CONSTRAINT IF EXISTS form_templates_area_check,
  ADD CONSTRAINT form_templates_area_check CHECK (area IS NULL OR area IN ('charter', 'safety', 'technical', 'movement', 'ptw', 'familiarisation', 'crew', 'sms', 'technical_forms')),
  DROP CONSTRAINT IF EXISTS form_templates_form_kind_check,
  ADD CONSTRAINT form_templates_form_kind_check CHECK (form_kind IS NULL OR form_kind IN ('form', 'checklist', 'register', 'passage_plan', 'permit')),
  DROP CONSTRAINT IF EXISTS form_templates_cadence_check,
  ADD CONSTRAINT form_templates_cadence_check CHECK (cadence IS NULL OR cadence IN ('none', 'daily', 'weekly', 'monthly', 'quarterly', 'six_monthly', 'yearly', 'two_yearly', 'five_yearly', 'per_voyage', 'per_charter', 'on_demand')),
  DROP CONSTRAINT IF EXISTS form_templates_origin_check,
  ADD CONSTRAINT form_templates_origin_check CHECK (origin IN ('platform', 'company')),
  DROP CONSTRAINT IF EXISTS form_templates_version_label_check,
  ADD CONSTRAINT form_templates_version_label_check CHECK (version_label IS NULL OR (version_label = btrim(version_label) AND length(version_label) BETWEEN 1 AND 40)),
  DROP CONSTRAINT IF EXISTS form_templates_vessel_scope_check,
  ADD CONSTRAINT form_templates_vessel_scope_check CHECK (vessel_scope IS NOT NULL AND vessel_scope IN ('FLEET', 'VESSEL_SPECIFIC')),
  -- A Customise copy names the template it was copied from (NO ACTION: a
  -- template that is a source is never deleted while its copy exists;
  -- form_template_delete_draft clears the pointer first).
  DROP CONSTRAINT IF EXISTS form_templates_source_template_id_fkey,
  ADD CONSTRAINT form_templates_source_template_id_fkey FOREIGN KEY (source_template_id) REFERENCES public.form_templates (id);

-- The family of a template (all its versions): one code in one company.
CREATE INDEX IF NOT EXISTS idx_form_templates_family ON public.form_templates (company_id, template_code, version);
CREATE INDEX IF NOT EXISTS idx_form_templates_area ON public.form_templates (company_id, area) WHERE status = 'PUBLISHED';
CREATE INDEX IF NOT EXISTS idx_form_templates_source ON public.form_templates (source_template_id) WHERE source_template_id IS NOT NULL;

COMMENT ON COLUMN public.form_templates.area IS 'Where crews find the template on board (C6; X5-06A): charter | safety | technical | movement | ptw | familiarisation | crew | sms | technical_forms; NULL = Unsorted. Backfilled from form_type and the category (form_template_legacy_area). Changes on a published template only through form_template_move_area.';
COMMENT ON COLUMN public.form_templates.form_kind IS 'What the template is (C6): form | checklist | register | passage_plan | permit. Backfilled from form_type (form_template_legacy_kind).';
COMMENT ON COLUMN public.form_templates.cadence IS 'How often a vessel runs it (gap/02 FC3, FC6): none | daily | weekly | monthly | quarterly | six_monthly | yearly | two_yearly | five_yearly | per_voyage | per_charter | on_demand; NULL = not set. form_template_run_stats derives the next due date from it.';
COMMENT ON COLUMN public.form_templates.requires_completion_signature IS 'A run cannot complete without the completer''s signature (gap/02 W2 Runs; enforced by the run flow, X2).';
COMMENT ON COLUMN public.form_templates.origin IS 'platform (a standard template, seeded by the service role under the definer flag) | company. A platform template is customised, never versioned by the company (gap/02 FC5).';
COMMENT ON COLUMN public.form_templates.source_template_id IS 'The template a Customise copy was made from (gap/02 FC5); publishing the copy hides the source''s published version on the copy''s vessels.';
COMMENT ON COLUMN public.form_templates.version_label IS 'The controlled-document number typed at publish (1-40, unique in the family); NULL shows the version number as v<n> (gap/02 W2).';

-- ---------------------------------------------------------------- form_template_vessel_settings (FC4)

CREATE TABLE IF NOT EXISTS public.form_template_vessel_settings (
  template_id uuid NOT NULL,
  vessel_id uuid NOT NULL,
  company_id uuid NOT NULL,
  visibility text NOT NULL DEFAULT 'shown',
  sort_order integer NULL,
  hidden_by uuid NULL,
  hidden_at timestamptz NULL,
  reason text NULL,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT form_template_vessel_settings_pkey PRIMARY KEY (template_id, vessel_id),
  CONSTRAINT form_template_vessel_settings_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.form_templates (id) ON DELETE CASCADE,
  CONSTRAINT form_template_vessel_settings_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels (id) ON DELETE CASCADE,
  CONSTRAINT form_template_vessel_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies (id) ON DELETE CASCADE
);

ALTER TABLE public.form_template_vessel_settings
  DROP CONSTRAINT IF EXISTS form_template_vessel_settings_visibility_check,
  ADD CONSTRAINT form_template_vessel_settings_visibility_check CHECK (visibility IN ('shown', 'hidden')),
  DROP CONSTRAINT IF EXISTS form_template_vessel_settings_reason_check,
  ADD CONSTRAINT form_template_vessel_settings_reason_check CHECK (reason IS NULL OR (reason = btrim(reason) AND length(reason) BETWEEN 1 AND 300)),
  DROP CONSTRAINT IF EXISTS form_template_vessel_settings_sort_order_check,
  ADD CONSTRAINT form_template_vessel_settings_sort_order_check CHECK (sort_order IS NULL OR sort_order >= 1),
  -- Hidden carries who and when; shown carries neither, nor a reason.
  DROP CONSTRAINT IF EXISTS form_template_vessel_settings_hidden_check,
  ADD CONSTRAINT form_template_vessel_settings_hidden_check CHECK (
    (visibility = 'hidden' AND hidden_at IS NOT NULL)
    OR (visibility = 'shown' AND hidden_by IS NULL AND hidden_at IS NULL AND reason IS NULL));

CREATE INDEX IF NOT EXISTS idx_form_template_vessel_settings_vessel ON public.form_template_vessel_settings (vessel_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_form_template_vessel_settings_company ON public.form_template_vessel_settings (company_id);

-- ---------------------------------------------------------------- form_template_events (D-X5-23, D-173)

-- No foreign key on template_id: the history of a deleted draft is kept.
CREATE TABLE IF NOT EXISTS public.form_template_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  template_id uuid NULL,
  vessel_id uuid NULL,
  actor_user_id uuid NULL,
  action text NOT NULL,
  from_status text NULL,
  to_status text NULL,
  version integer NULL,
  comment text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT form_template_events_pkey PRIMARY KEY (id),
  CONSTRAINT form_template_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies (id) ON DELETE CASCADE
);

ALTER TABLE public.form_template_events
  DROP CONSTRAINT IF EXISTS form_template_events_action_check,
  ADD CONSTRAINT form_template_events_action_check CHECK (action IN (
    'created', 'edited', 'published', 'new_version', 'customised', 'archived', 'draft_deleted',
    'area_moved', 'hidden', 'shown', 'reordered')),
  DROP CONSTRAINT IF EXISTS form_template_events_from_status_check,
  ADD CONSTRAINT form_template_events_from_status_check CHECK (from_status IS NULL OR from_status IN ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED')),
  DROP CONSTRAINT IF EXISTS form_template_events_to_status_check,
  ADD CONSTRAINT form_template_events_to_status_check CHECK (to_status IS NULL OR to_status IN ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED')),
  DROP CONSTRAINT IF EXISTS form_template_events_comment_check,
  ADD CONSTRAINT form_template_events_comment_check CHECK (comment IS NULL OR length(comment) <= 2000),
  DROP CONSTRAINT IF EXISTS form_template_events_payload_check,
  ADD CONSTRAINT form_template_events_payload_check CHECK (jsonb_typeof(payload) = 'object'),
  -- A reorder is about a vessel's area, not one template; hide / show name the vessel.
  DROP CONSTRAINT IF EXISTS form_template_events_subject_check,
  ADD CONSTRAINT form_template_events_subject_check CHECK (
    CASE action
      WHEN 'reordered' THEN template_id IS NULL AND vessel_id IS NOT NULL
      WHEN 'hidden' THEN template_id IS NOT NULL AND vessel_id IS NOT NULL
      WHEN 'shown' THEN template_id IS NOT NULL AND vessel_id IS NOT NULL
      ELSE template_id IS NOT NULL
    END);

CREATE INDEX IF NOT EXISTS idx_form_template_events_company ON public.form_template_events (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_template_events_template ON public.form_template_events (template_id, created_at);

-- ---------------------------------------------------------------- pure helpers (service role; TS mirrors)

-- Whether a template's target covers the vessel: FLEET covers every vessel
-- (the caller restricts to the company's), VESSEL_SPECIFIC the listed ones.
CREATE OR REPLACE FUNCTION public.form_template_targets_vessel(p_vessel_scope text, p_vessel_ids uuid[], p_vessel_id uuid)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_vessel_id IS NOT NULL AND (
    p_vessel_scope = 'FLEET'
    OR (p_vessel_scope = 'VESSEL_SPECIFIC' AND p_vessel_id = ANY (coalesce(p_vessel_ids, '{}'::uuid[]))))
$$;

-- The day a run is next due after p_anchor, by cadence (lib/cadence.ts):
-- daily +1 day, weekly +7 days, monthly / quarterly / six_monthly +1 / 3 / 6
-- months, yearly / two_yearly / five_yearly +1 / 2 / 5 years (a month or
-- year step from a day the target month lacks lands on that month's last
-- day: 31 Jan + 1 month = 28 or 29 Feb); none, per_voyage, per_charter,
-- on_demand, NULL, an unknown cadence or a NULL anchor: none (NULL).
CREATE OR REPLACE FUNCTION public.form_template_next_due(p_cadence text, p_anchor date)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN p_anchor IS NULL THEN NULL ELSE CASE p_cadence
    WHEN 'daily' THEN p_anchor + 1
    WHEN 'weekly' THEN p_anchor + 7
    WHEN 'monthly' THEN (p_anchor + interval '1 month')::date
    WHEN 'quarterly' THEN (p_anchor + interval '3 months')::date
    WHEN 'six_monthly' THEN (p_anchor + interval '6 months')::date
    WHEN 'yearly' THEN (p_anchor + interval '1 year')::date
    WHEN 'two_yearly' THEN (p_anchor + interval '2 years')::date
    WHEN 'five_yearly' THEN (p_anchor + interval '5 years')::date
    ELSE NULL
  END END
$$;

-- The first reason a template cannot be published (lib/publishChecks.ts),
-- in this order; NULL when it may be:
--   name_required       the name is blank
--   no_section          form_schema.fields holds no item (a field that is
--                       not a 'section' header); not an array counts as none
--   empty_section       a 'section' header with no item before the next
--                       header or the end
--   unlabelled_section  a 'section' header with a blank label
--   unlabelled_item     an item with a blank label (an element that is not
--                       an object counts as one)
--   targets_required    VESSEL_SPECIFIC with no vessel listed
-- Items before the first header form a section of their own (no header).
CREATE OR REPLACE FUNCTION public.form_template_publish_blocker(p_template_name text, p_form_schema jsonb, p_vessel_scope text, p_vessel_ids uuid[])
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  e jsonb;
  v_items integer := 0;
  v_in_section boolean := false;
  v_section_items integer := 0;
  v_empty boolean := false;
  v_blank_header boolean := false;
  v_blank_item boolean := false;
BEGIN
  IF btrim(coalesce(p_template_name, '')) = '' THEN
    RETURN 'name_required';
  END IF;
  IF jsonb_typeof(p_form_schema -> 'fields') = 'array' THEN
    FOR e IN SELECT value FROM jsonb_array_elements(p_form_schema -> 'fields') LOOP
      IF jsonb_typeof(e) = 'object' AND lower(btrim(coalesce(e ->> 'type', ''))) = 'section' THEN
        IF v_in_section AND v_section_items = 0 THEN
          v_empty := true;
        END IF;
        v_in_section := true;
        v_section_items := 0;
        IF btrim(coalesce(e ->> 'label', '')) = '' THEN
          v_blank_header := true;
        END IF;
      ELSE
        v_items := v_items + 1;
        v_section_items := v_section_items + 1;
        IF jsonb_typeof(e) <> 'object' OR btrim(coalesce(e ->> 'label', '')) = '' THEN
          v_blank_item := true;
        END IF;
      END IF;
    END LOOP;
    IF v_in_section AND v_section_items = 0 THEN
      v_empty := true;
    END IF;
  END IF;
  IF v_items = 0 THEN
    RETURN 'no_section';
  END IF;
  IF v_empty THEN
    RETURN 'empty_section';
  END IF;
  IF v_blank_header THEN
    RETURN 'unlabelled_section';
  END IF;
  IF v_blank_item THEN
    RETURN 'unlabelled_item';
  END IF;
  IF p_vessel_scope = 'VESSEL_SPECIFIC' AND cardinality(array_remove(coalesce(p_vessel_ids, '{}'::uuid[]), NULL)) = 0 THEN
    RETURN 'targets_required';
  END IF;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------- guards and audit (every role)

CREATE OR REPLACE FUNCTION public.form_templates_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag boolean := coalesce(current_setting('storm.fleet_tx', true), '') = 'on';
  v_category text;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.company_id IS DISTINCT FROM OLD.company_id
                           OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'form_templates_guarded', DETAIL = 'A template never changes its id, company, creator or creation time.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- A referential cascade (the company deleted) runs one trigger level down.
    IF v_flag OR pg_trigger_depth() > 1 THEN
      RETURN OLD;
    END IF;
    IF OLD.status <> 'DRAFT' OR OLD.published_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'form_templates_guarded', DETAIL = 'A template that has been published is archived, never deleted.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.form_submissions AS s WHERE s.template_id = OLD.id) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'form_templates_guarded', DETAIL = 'A template with runs is archived, never deleted.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- The area mapping for a row that names none (the legacy builder).
    IF NEW.area IS NULL OR NEW.form_kind IS NULL THEN
      SELECT fc.name::text INTO v_category FROM public.form_categories AS fc WHERE fc.id = NEW.category_id;
      NEW.form_kind := coalesce(NEW.form_kind, public.form_template_legacy_kind(NEW.form_type, v_category));
      NEW.area := coalesce(NEW.area, public.form_template_legacy_area(NEW.form_type, v_category));
    END IF;
    NEW.vessel_scope := upper(btrim(coalesce(NEW.vessel_scope, 'FLEET')));
    IF v_flag THEN
      RETURN NEW;
    END IF;
    IF NEW.status IS DISTINCT FROM 'DRAFT' OR coalesce(NEW.version, 1) <> 1 OR NEW.version_label IS NOT NULL
       OR NEW.published_at IS NOT NULL OR NEW.published_by IS NOT NULL OR NEW.archived_at IS NOT NULL
       OR NEW.supersedes_template_id IS NOT NULL OR NEW.source_template_id IS NOT NULL
       OR NEW.origin IS DISTINCT FROM 'company' THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'form_templates_guarded', DETAIL = 'A template starts as a company draft at version 1; only form_template_publish() publishes it.';
    END IF;
    NEW.version := 1;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF v_flag THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.version_label IS DISTINCT FROM OLD.version_label
     OR NEW.published_at IS DISTINCT FROM OLD.published_at OR NEW.published_by IS DISTINCT FROM OLD.published_by
     OR NEW.archived_at IS DISTINCT FROM OLD.archived_at OR NEW.supersedes_template_id IS DISTINCT FROM OLD.supersedes_template_id
     OR NEW.origin IS DISTINCT FROM OLD.origin OR NEW.source_template_id IS DISTINCT FROM OLD.source_template_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'form_templates_guarded', DETAIL = 'Only the form_template_* definers change a template''s status or version.';
  END IF;
  IF OLD.status <> 'DRAFT' AND (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'form_templates_guarded', DETAIL = 'A published, superseded or archived template is read-only; start a new version with form_template_new_version().';
  END IF;
  IF OLD.supersedes_template_id IS NOT NULL AND NEW.template_code IS DISTINCT FROM OLD.template_code THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'form_templates_guarded', DETAIL = 'A later version keeps its template''s code.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_form_templates_guard ON public.form_templates;
CREATE TRIGGER trg_form_templates_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.form_templates
  FOR EACH ROW EXECUTE FUNCTION public.form_templates_guard();

-- The history of the direct writes the guard lets through (a draft
-- created, edited or deleted with the live policies). The definers log
-- their own changes, so nothing is written under the flag; a cascade of
-- the deleted company writes nothing.
CREATE OR REPLACE FUNCTION public.form_templates_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed text[];
BEGIN
  IF current_setting('storm.fleet_tx', true) = 'on' OR pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(k ORDER BY k) INTO v_changed
    FROM jsonb_object_keys(to_jsonb(NEW)) AS k
    WHERE k <> 'updated_at' AND (to_jsonb(NEW) -> k) IS DISTINCT FROM (to_jsonb(OLD) -> k);
    IF v_changed IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;
  PERFORM public.form_template_log(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    NULL,
    CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'UPDATE' THEN 'edited' ELSE 'draft_deleted' END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.status END,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.version ELSE NEW.version END,
    NULL,
    CASE TG_OP
      WHEN 'INSERT' THEN jsonb_build_object('template_code', NEW.template_code, 'template_name', NEW.template_name, 'direct', true)
      WHEN 'UPDATE' THEN jsonb_build_object('columns', to_jsonb(v_changed), 'direct', true)
      ELSE jsonb_build_object('template_code', OLD.template_code, 'template_name', OLD.template_name, 'direct', true)
    END);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_form_templates_audit ON public.form_templates;
CREATE TRIGGER trg_form_templates_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.form_templates
  FOR EACH ROW EXECUTE FUNCTION public.form_templates_audit();

-- Settings: written only by the definers (and removed by a cascade of the
-- template, the vessel or the company); a row's template and vessel are of
-- its company.
CREATE OR REPLACE FUNCTION public.form_template_vessel_settings_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND (
       NOT EXISTS (SELECT 1 FROM public.form_templates AS t WHERE t.id = NEW.template_id AND t.company_id = NEW.company_id)
       OR NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = NEW.vessel_id AND v.company_id = NEW.company_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'form_template_vessel_settings_guarded', DETAIL = 'A template''s vessel setting stays inside the template''s company.';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.template_id IS DISTINCT FROM OLD.template_id OR NEW.vessel_id IS DISTINCT FROM OLD.vessel_id
                           OR NEW.company_id IS DISTINCT FROM OLD.company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'form_template_vessel_settings_guarded', DETAIL = 'A vessel setting never moves to another template or vessel.';
  END IF;
  IF current_setting('storm.fleet_tx', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'form_template_vessel_settings_guarded', DETAIL = 'Only form_template_set_visibility() and form_template_reorder() change a template on a vessel.';
END;
$$;

DROP TRIGGER IF EXISTS trg_form_template_vessel_settings_guard ON public.form_template_vessel_settings;
CREATE TRIGGER trg_form_template_vessel_settings_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.form_template_vessel_settings
  FOR EACH ROW EXECUTE FUNCTION public.form_template_vessel_settings_guard();

-- Events: inserted only by the definers and the audit trigger; never
-- updated or deleted (a cascade of the deleted company excepted).
CREATE OR REPLACE FUNCTION public.form_template_events_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_setting('storm.fleet_tx', true) = 'on' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'form_template_events_guarded', DETAIL = 'Template history is written only by the form_template_* definers.';
  END IF;
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'form_template_events_guarded', DETAIL = 'Template history is append-only.';
END;
$$;

DROP TRIGGER IF EXISTS trg_form_template_events_guard ON public.form_template_events;
CREATE TRIGGER trg_form_template_events_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.form_template_events
  FOR EACH ROW EXECUTE FUNCTION public.form_template_events_guard();

DROP TRIGGER IF EXISTS trg_form_template_vessel_settings_updated_at ON public.form_template_vessel_settings;
CREATE TRIGGER trg_form_template_vessel_settings_updated_at
  BEFORE UPDATE ON public.form_template_vessel_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------- RLS

ALTER TABLE public.form_template_vessel_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_template_events ENABLE ROW LEVEL SECURITY;

-- Templates: active members of the company read published, superseded and
-- archived templates (a run of an older version still shows its form);
-- drafts are read by their creator, the legacy template managers and fleet
-- checklist admins (who publish them). Replaces the live
-- "Users can view published templates in their company" (PUBLISHED only).
-- The live INSERT, UPDATE and DELETE policies are kept: the guard narrows
-- them.
DROP POLICY IF EXISTS "Users can view published templates in their company" ON public.form_templates;
DROP POLICY IF EXISTS form_templates_select ON public.form_templates;
CREATE POLICY form_templates_select ON public.form_templates
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND (SELECT public.user_is_active(auth.uid()))
    AND (
      status IN ('PUBLISHED', 'SUPERSEDED', 'ARCHIVED')
      OR created_by = auth.uid()
      OR (SELECT public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'superadmin']::public.app_role[]))
      OR (SELECT public.fleet_ops_can(public.get_user_company_id(auth.uid()), NULL::uuid, 'checklists', 'admin'))
    )
  );

-- Vessel settings: active members of the company who reach the vessel
-- (crew see which forms are hidden on board), and fleet checklist readers.
DROP POLICY IF EXISTS form_template_vessel_settings_select ON public.form_template_vessel_settings;
CREATE POLICY form_template_vessel_settings_select ON public.form_template_vessel_settings
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND (
      public.user_can_reach_vessel(auth.uid(), vessel_id)
      OR (SELECT public.fleet_ops_can(public.get_user_company_id(auth.uid()), NULL::uuid, 'checklists', 'view'))
    )
  );

-- Events: fleet checklist readers; a vessel's events also for checklist
-- readers of that vessel.
DROP POLICY IF EXISTS form_template_events_select ON public.form_template_events;
CREATE POLICY form_template_events_select ON public.form_template_events
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND (
      (SELECT public.fleet_ops_can(public.get_user_company_id(auth.uid()), NULL::uuid, 'checklists', 'view'))
      OR (vessel_id IS NOT NULL AND public.fleet_ops_can(company_id, vessel_id, 'checklists', 'view'))
    )
  );

REVOKE ALL ON public.form_template_vessel_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.form_template_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.form_template_vessel_settings, public.form_template_events TO authenticated;
GRANT ALL ON public.form_template_vessel_settings, public.form_template_events TO service_role;

-- ---------------------------------------------------------------- internal helpers (service role)

-- The caller's company once they are a fleet checklist admin there (an
-- active member with fleet reach and fleet.operations.fleet_checklists.admin,
-- fleet_ops_can_for, D-X5-21); 42501 not_permitted otherwise.
CREATE OR REPLACE FUNCTION public.form_template_gate()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  v_company := public.get_user_company_id(v_uid);
  IF v_company IS NULL OR NOT coalesce(public.fleet_ops_can_for(v_uid, v_company, NULL, 'checklists', 'admin'), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  RETURN v_company;
END;
$$;

-- Whether _user_id may hide, restore and reorder templates on _vessel_id:
-- an active member of the vessel's company who is a fleet checklist admin,
-- the vessel's Master, or holds checklists edit on the vessel (gap/02 W2
-- "Can manage vessel checklists"). Unknown ids, another company, an
-- inactive user: false.
CREATE OR REPLACE FUNCTION public.form_template_vessel_manager_for(_user_id uuid, _company_id uuid, _vessel_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR _company_id IS NULL OR _vessel_id IS NULL THEN
    RETURN false;
  END IF;
  IF NOT coalesce(public.user_is_active(_user_id), false)
     OR NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.user_id = _user_id AND p.company_id = _company_id)
     OR NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = _vessel_id AND v.company_id = _company_id) THEN
    RETURN false;
  END IF;
  RETURN coalesce(public.fleet_ops_can_for(_user_id, _company_id, NULL, 'checklists', 'admin'), false)
      OR coalesce(public.record_is_master(_user_id, _vessel_id), false)
      OR coalesce(public.fleet_ops_can_for(_user_id, _company_id, _vessel_id, 'checklists', 'edit'), false);
END;
$$;

-- One history row (D-X5-23) with the caller as actor. Internal: the
-- definers and the audit trigger.
CREATE OR REPLACE FUNCTION public.form_template_log(
  _company_id uuid,
  _template_id uuid,
  _vessel_id uuid,
  _action text,
  _from_status text,
  _to_status text,
  _version integer,
  _comment text,
  _payload jsonb
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
BEGIN
  PERFORM set_config('storm.fleet_tx', 'on', true);
  INSERT INTO public.form_template_events (company_id, template_id, vessel_id, actor_user_id, action, from_status, to_status, version, comment, payload)
  VALUES (_company_id, _template_id, _vessel_id, auth.uid(), _action, _from_status, _to_status, _version, left(_comment, 2000), coalesce(_payload, '{}'::jsonb));
  PERFORM set_config('storm.fleet_tx', v_prev, true);
END;
$$;

-- ---------------------------------------------------------------- lifecycle definers (fleet checklist admins)

-- Publishes a DRAFT (W2 Draft -> Published): the publish checks
-- (form_template_publish_blocker, then every listed vessel the company's:
-- 22023 invalid_targets), the optional version label (trimmed, 1-40,
-- unique in the family ignoring case: 22023 version_label_too_long |
-- version_label_taken; blank keeps the number, "v<n>") and the optional
-- optimistic check (22023 stale_template). Every other PUBLISHED row of
-- the family becomes SUPERSEDED (runs keep their template and version) and
-- its vessel settings carry over; a Customise copy hides the published
-- version of its source on the copy's vessels. One 'published' event.
-- Refusals by status: already_published | template_superseded |
-- template_archived. Returns the published row.
CREATE OR REPLACE FUNCTION public.form_template_publish(p_template_id uuid, p_version_label text DEFAULT NULL, p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS public.form_templates
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.form_template_gate();
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  t public.form_templates;
  n public.form_templates;
  v_label text := nullif(btrim(coalesce(p_version_label, '')), '');
  v_blocker text;
  v_superseded uuid[];
  v_source public.form_templates;
  v_hidden integer := 0;
BEGIN
  SELECT * INTO t FROM public.form_templates WHERE id = p_template_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'template_not_found';
  END IF;
  IF t.status <> 'DRAFT' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = CASE t.status
      WHEN 'PUBLISHED' THEN 'already_published' WHEN 'SUPERSEDED' THEN 'template_superseded' ELSE 'template_archived' END;
  END IF;
  IF p_expected_updated_at IS NOT NULL AND t.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'stale_template';
  END IF;
  v_blocker := public.form_template_publish_blocker(t.template_name, t.form_schema, t.vessel_scope, t.vessel_ids);
  IF v_blocker IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = v_blocker;
  END IF;
  IF t.vessel_scope = 'VESSEL_SPECIFIC' AND EXISTS (
       SELECT 1 FROM unnest(t.vessel_ids) AS x(id)
       WHERE x.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = x.id AND v.company_id = v_company)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_targets';
  END IF;
  IF v_label IS NOT NULL AND length(v_label) > 40 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'version_label_too_long';
  END IF;

  -- The family, locked so two publishes of one template wait for each other.
  PERFORM 1 FROM public.form_templates WHERE company_id = v_company AND template_code = t.template_code FOR UPDATE;
  IF v_label IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.form_templates AS f
       WHERE f.company_id = v_company AND f.template_code = t.template_code AND f.id <> t.id AND lower(f.version_label) = lower(v_label)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'version_label_taken';
  END IF;

  PERFORM set_config('storm.fleet_tx', 'on', true);
  WITH s AS (
    UPDATE public.form_templates SET status = 'SUPERSEDED'
    WHERE company_id = v_company AND template_code = t.template_code AND id <> t.id AND status = 'PUBLISHED'
    RETURNING id
  )
  SELECT array_agg(id) INTO v_superseded FROM s;

  -- The superseded version's per-vessel settings carry over.
  IF v_superseded IS NOT NULL THEN
    INSERT INTO public.form_template_vessel_settings (template_id, vessel_id, company_id, visibility, sort_order, hidden_by, hidden_at, reason, created_by, updated_by)
    SELECT DISTINCT ON (s.vessel_id) t.id, s.vessel_id, v_company, s.visibility, s.sort_order, s.hidden_by, s.hidden_at, s.reason, v_uid, v_uid
    FROM public.form_template_vessel_settings AS s
    WHERE s.template_id = ANY (v_superseded)
    ORDER BY s.vessel_id, s.updated_at DESC
    ON CONFLICT (template_id, vessel_id) DO NOTHING;
  END IF;

  UPDATE public.form_templates SET
    status = 'PUBLISHED',
    published_at = now(),
    published_by = v_uid,
    version_label = v_label,
    archived_at = NULL
  WHERE id = t.id
  RETURNING * INTO n;

  -- A Customise copy replaces its source on the copy's vessels.
  IF n.source_template_id IS NOT NULL THEN
    SELECT f.* INTO v_source
    FROM public.form_templates AS s
    JOIN public.form_templates AS f ON f.company_id = s.company_id AND f.template_code = s.template_code AND f.status = 'PUBLISHED'
    WHERE s.id = n.source_template_id AND s.company_id = v_company AND f.template_code <> n.template_code
    LIMIT 1;
    IF v_source.id IS NOT NULL THEN
      INSERT INTO public.form_template_vessel_settings AS cur (template_id, vessel_id, company_id, visibility, hidden_by, hidden_at, reason, created_by, updated_by)
      SELECT v_source.id, v.id, v_company, 'hidden', v_uid, now(), left(format('Replaced by %s', n.template_code), 300), v_uid, v_uid
      FROM public.vessels AS v
      WHERE v.company_id = v_company
        AND public.vessel_in_reachable_state(v.lifecycle_status, v.status)
        AND public.form_template_targets_vessel(n.vessel_scope, n.vessel_ids, v.id)
        AND public.form_template_targets_vessel(v_source.vessel_scope, v_source.vessel_ids, v.id)
      ON CONFLICT (template_id, vessel_id) DO UPDATE SET
        visibility = 'hidden', hidden_by = EXCLUDED.hidden_by, hidden_at = EXCLUDED.hidden_at, reason = EXCLUDED.reason, updated_by = EXCLUDED.updated_by
      WHERE cur.visibility <> 'hidden';
      GET DIAGNOSTICS v_hidden = ROW_COUNT;
    END IF;
  END IF;

  PERFORM public.form_template_log(v_company, n.id, NULL, 'published', 'DRAFT', 'PUBLISHED', n.version, NULL,
    jsonb_build_object('version_label', n.version_label, 'superseded_ids', to_jsonb(coalesce(v_superseded, '{}'::uuid[])),
                       'source_template_id', n.source_template_id, 'source_hidden_on', v_hidden,
                       'vessel_scope', n.vessel_scope));
  PERFORM set_config('storm.fleet_tx', v_prev, true);
  RETURN n;
END;
$$;

-- Starts the next version of a PUBLISHED or ARCHIVED template (W2
-- Published -> Draft vN+1; replaces the legacy restore): a DRAFT with the
-- same template_code, version max + 1 of the family, supersedes_template_id
-- set and the content copied; the live version keeps running. Refused for
-- a draft (template_draft), a superseded version (template_superseded), a
-- platform template (platform_template_customise: customise it instead)
-- and when the family already has a draft (draft_exists). One
-- 'new_version' event on the new draft. Returns the draft.
CREATE OR REPLACE FUNCTION public.form_template_new_version(p_template_id uuid)
RETURNS public.form_templates
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.form_template_gate();
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  t public.form_templates;
  n public.form_templates;
  v_next integer;
BEGIN
  SELECT * INTO t FROM public.form_templates WHERE id = p_template_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'template_not_found';
  END IF;
  IF t.status = 'DRAFT' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'template_draft';
  END IF;
  IF t.status = 'SUPERSEDED' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'template_superseded';
  END IF;
  IF t.origin = 'platform' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'platform_template_customise';
  END IF;
  PERFORM 1 FROM public.form_templates WHERE company_id = v_company AND template_code = t.template_code FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.form_templates WHERE company_id = v_company AND template_code = t.template_code AND status = 'DRAFT') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'draft_exists';
  END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v_next FROM public.form_templates WHERE company_id = v_company AND template_code = t.template_code;

  PERFORM set_config('storm.fleet_tx', 'on', true);
  INSERT INTO public.form_templates (
    company_id, template_code, template_name, description, category_id, form_type, vessel_scope, vessel_ids, department_scope,
    version, version_notes, effective_date, supersedes_template_id, source_file_url, source_file_name, source_file_type,
    form_schema, initiation_mode, allow_line_items, has_expiry, expiry_hours, expiry_action, required_signers,
    allow_parallel_signing, review_cycle_days, can_trigger_incident, can_trigger_nc, can_trigger_capa, auto_attach_to_audit,
    status, created_by, area, form_kind, cadence, requires_completion_signature, origin, source_template_id)
  VALUES (
    v_company, t.template_code, t.template_name, t.description, t.category_id, t.form_type, t.vessel_scope, t.vessel_ids, t.department_scope,
    v_next, NULL, NULL, t.id, t.source_file_url, t.source_file_name, t.source_file_type,
    t.form_schema, t.initiation_mode, t.allow_line_items, t.has_expiry, t.expiry_hours, t.expiry_action, t.required_signers,
    t.allow_parallel_signing, t.review_cycle_days, t.can_trigger_incident, t.can_trigger_nc, t.can_trigger_capa, t.auto_attach_to_audit,
    'DRAFT', v_uid, t.area, t.form_kind, t.cadence, t.requires_completion_signature, t.origin, t.source_template_id)
  RETURNING * INTO n;
  PERFORM public.form_template_log(v_company, n.id, NULL, 'new_version', NULL, 'DRAFT', n.version, NULL,
    jsonb_build_object('from_template_id', t.id, 'from_status', t.status, 'from_version', t.version));
  PERFORM set_config('storm.fleet_tx', v_prev, true);
  RETURN n;
END;
$$;

-- Customise (FC5): a company copy of a PUBLISHED, SUPERSEDED or ARCHIVED
-- template as a DRAFT at version 1, origin company, source_template_id
-- the source, code <code>_CUSTOM<n> (the first n not used in the company;
-- the base shortened to keep 50 characters). A draft is refused
-- (template_draft). Publishing the copy hides the source on the copy's
-- vessels. One 'customised' event on the copy. Returns the copy.
CREATE OR REPLACE FUNCTION public.form_template_customise(p_source_template_id uuid)
RETURNS public.form_templates
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.form_template_gate();
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  t public.form_templates;
  n public.form_templates;
  v_n integer := 1;
  v_suffix text;
  v_code text;
BEGIN
  SELECT * INTO t FROM public.form_templates WHERE id = p_source_template_id AND company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'template_not_found';
  END IF;
  IF t.status = 'DRAFT' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'template_draft';
  END IF;
  -- One customise at a time per company, so two copies never pick one code.
  PERFORM pg_advisory_xact_lock(hashtextextended('form_template_customise:' || v_company::text, 0));
  LOOP
    v_suffix := '_CUSTOM' || v_n;
    v_code := left(t.template_code, 50 - length(v_suffix)) || v_suffix;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.form_templates WHERE company_id = v_company AND template_code = v_code);
    v_n := v_n + 1;
  END LOOP;

  PERFORM set_config('storm.fleet_tx', 'on', true);
  INSERT INTO public.form_templates (
    company_id, template_code, template_name, description, category_id, form_type, vessel_scope, vessel_ids, department_scope,
    version, source_file_url, source_file_name, source_file_type,
    form_schema, initiation_mode, allow_line_items, has_expiry, expiry_hours, expiry_action, required_signers,
    allow_parallel_signing, review_cycle_days, can_trigger_incident, can_trigger_nc, can_trigger_capa, auto_attach_to_audit,
    status, created_by, area, form_kind, cadence, requires_completion_signature, origin, source_template_id)
  VALUES (
    v_company, v_code, t.template_name, t.description, t.category_id, t.form_type, t.vessel_scope, t.vessel_ids, t.department_scope,
    1, t.source_file_url, t.source_file_name, t.source_file_type,
    t.form_schema, t.initiation_mode, t.allow_line_items, t.has_expiry, t.expiry_hours, t.expiry_action, t.required_signers,
    t.allow_parallel_signing, t.review_cycle_days, t.can_trigger_incident, t.can_trigger_nc, t.can_trigger_capa, t.auto_attach_to_audit,
    'DRAFT', v_uid, t.area, t.form_kind, t.cadence, t.requires_completion_signature, 'company', t.id)
  RETURNING * INTO n;
  PERFORM public.form_template_log(v_company, n.id, NULL, 'customised', NULL, 'DRAFT', 1, NULL,
    jsonb_build_object('source_template_id', t.id, 'source_code', t.template_code, 'source_origin', t.origin));
  PERFORM set_config('storm.fleet_tx', v_prev, true);
  RETURN n;
END;
$$;

-- Archives a DRAFT, PUBLISHED or SUPERSEDED template (W2 -> Archived): no
-- longer offered anywhere; runs stay readable. Reason optional (trimmed,
-- up to 500: 22023 reason_too_long), kept in the event. An archived one is
-- refused (already_archived). Returns the row.
CREATE OR REPLACE FUNCTION public.form_template_archive(p_template_id uuid, p_reason text DEFAULT NULL)
RETURNS public.form_templates
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := public.form_template_gate();
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  t public.form_templates;
  n public.form_templates;
BEGIN
  SELECT * INTO t FROM public.form_templates WHERE id = p_template_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'template_not_found';
  END IF;
  IF t.status = 'ARCHIVED' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'already_archived';
  END IF;
  IF v_reason IS NOT NULL AND length(v_reason) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reason_too_long';
  END IF;
  PERFORM set_config('storm.fleet_tx', 'on', true);
  UPDATE public.form_templates SET status = 'ARCHIVED', archived_at = now() WHERE id = t.id RETURNING * INTO n;
  PERFORM public.form_template_log(v_company, n.id, NULL, 'archived', t.status, 'ARCHIVED', n.version, v_reason, '{}'::jsonb);
  PERFORM set_config('storm.fleet_tx', v_prev, true);
  RETURN n;
END;
$$;

-- Deletes a DRAFT that was never published and has no runs, with its
-- schedules and AI extraction jobs; pointers of other templates to it
-- (supersedes, source) are cleared. Anything else is archived instead:
-- template_published (published once: PUBLISHED, SUPERSEDED, or a draft
-- with a publish date), template_archived, template_has_runs. One
-- 'draft_deleted' event (kept after the row is gone). Returns the deleted
-- row.
CREATE OR REPLACE FUNCTION public.form_template_delete_draft(p_template_id uuid)
RETURNS public.form_templates
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := public.form_template_gate();
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  t public.form_templates;
  v_schedules integer;
  v_jobs integer;
BEGIN
  SELECT * INTO t FROM public.form_templates WHERE id = p_template_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'template_not_found';
  END IF;
  IF t.status = 'ARCHIVED' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'template_archived';
  END IF;
  IF t.status <> 'DRAFT' OR t.published_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'template_published';
  END IF;
  IF EXISTS (SELECT 1 FROM public.form_submissions AS s WHERE s.template_id = t.id) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'template_has_runs';
  END IF;
  PERFORM set_config('storm.fleet_tx', 'on', true);
  DELETE FROM public.form_ai_extraction_jobs WHERE template_id = t.id;
  GET DIAGNOSTICS v_jobs = ROW_COUNT;
  DELETE FROM public.form_schedules WHERE template_id = t.id;
  GET DIAGNOSTICS v_schedules = ROW_COUNT;
  UPDATE public.form_templates SET supersedes_template_id = NULL WHERE supersedes_template_id = t.id;
  UPDATE public.form_templates SET source_template_id = NULL WHERE source_template_id = t.id;
  DELETE FROM public.form_templates WHERE id = t.id;
  PERFORM public.form_template_log(v_company, t.id, NULL, 'draft_deleted', 'DRAFT', NULL, t.version, NULL,
    jsonb_build_object('template_code', t.template_code, 'template_name', t.template_name, 'schedules_removed', v_schedules, 'extraction_jobs_removed', v_jobs));
  PERFORM set_config('storm.fleet_tx', v_prev, true);
  RETURN t;
END;
$$;

-- Moves a DRAFT or PUBLISHED template to another area without rebuilding
-- it (gap/02 improvement 11); an open draft of its next version moves with
-- it. 22023 invalid_area for a value outside the list (NULL included);
-- template_superseded | template_archived by status. The same area
-- changes nothing and writes no event. Returns the row.
CREATE OR REPLACE FUNCTION public.form_template_move_area(p_template_id uuid, p_area text)
RETURNS public.form_templates
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := public.form_template_gate();
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  t public.form_templates;
  n public.form_templates;
  v_drafts integer := 0;
BEGIN
  SELECT * INTO t FROM public.form_templates WHERE id = p_template_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'template_not_found';
  END IF;
  IF t.status = 'SUPERSEDED' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'template_superseded';
  END IF;
  IF t.status = 'ARCHIVED' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'template_archived';
  END IF;
  IF p_area IS NULL OR p_area NOT IN ('charter', 'safety', 'technical', 'movement', 'ptw', 'familiarisation', 'crew', 'sms', 'technical_forms') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_area';
  END IF;
  IF t.area IS NOT DISTINCT FROM p_area THEN
    RETURN t;
  END IF;
  PERFORM set_config('storm.fleet_tx', 'on', true);
  UPDATE public.form_templates SET area = p_area WHERE id = t.id RETURNING * INTO n;
  UPDATE public.form_templates SET area = p_area
  WHERE company_id = v_company AND supersedes_template_id = t.id AND status = 'DRAFT';
  GET DIAGNOSTICS v_drafts = ROW_COUNT;
  PERFORM public.form_template_log(v_company, n.id, NULL, 'area_moved', t.status, n.status, n.version, NULL,
    jsonb_build_object('from_area', t.area, 'to_area', p_area, 'drafts_moved', v_drafts));
  PERFORM set_config('storm.fleet_tx', v_prev, true);
  RETURN n;
END;
$$;

-- ---------------------------------------------------------------- per-vessel definers (FC4; vessel managers)

-- Shows or hides a PUBLISHED template on a vessel it targets (W2 per
-- vessel Shown <-> Hidden): fleet checklist admins on any vessel, vessel
-- managers on theirs (form_template_vessel_manager_for). The vessel must
-- be the company's, reached and not archived (42501 vessel_out_of_reach).
-- 22023 template_not_published | vessel_not_targeted | invalid_visibility
-- | reason_too_long (trimmed, up to 300; only kept while hidden). An
-- unchanged setting writes no event. Returns the setting.
CREATE OR REPLACE FUNCTION public.form_template_set_visibility(p_template_id uuid, p_vessel_id uuid, p_visibility text, p_reason text DEFAULT NULL)
RETURNS public.form_template_vessel_settings
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.get_user_company_id(auth.uid());
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  t public.form_templates;
  s public.form_template_vessel_settings;
  n public.form_template_vessel_settings;
BEGIN
  IF v_uid IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  SELECT * INTO t FROM public.form_templates WHERE id = p_template_id AND company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'template_not_found';
  END IF;
  IF p_vessel_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'vessel_out_of_reach';
  END IF;
  PERFORM public.fleet_counted_vessels_for(v_uid, v_company, ARRAY[p_vessel_id]);
  IF NOT public.form_template_vessel_manager_for(v_uid, v_company, p_vessel_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  IF t.status <> 'PUBLISHED' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'template_not_published';
  END IF;
  IF NOT public.form_template_targets_vessel(t.vessel_scope, t.vessel_ids, p_vessel_id) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'vessel_not_targeted';
  END IF;
  IF p_visibility IS NULL OR p_visibility NOT IN ('shown', 'hidden') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_visibility';
  END IF;
  IF v_reason IS NOT NULL AND length(v_reason) > 300 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reason_too_long';
  END IF;
  IF p_visibility = 'shown' THEN
    v_reason := NULL;
  END IF;

  SELECT * INTO s FROM public.form_template_vessel_settings WHERE template_id = t.id AND vessel_id = p_vessel_id FOR UPDATE;
  IF FOUND AND s.visibility = p_visibility AND s.reason IS NOT DISTINCT FROM v_reason THEN
    RETURN s;
  END IF;
  IF NOT FOUND AND p_visibility = 'shown' THEN
    -- Shown is the default: nothing to store, nothing changed.
    s.template_id := t.id;
    s.vessel_id := p_vessel_id;
    s.company_id := v_company;
    s.visibility := 'shown';
    RETURN s;
  END IF;

  PERFORM set_config('storm.fleet_tx', 'on', true);
  INSERT INTO public.form_template_vessel_settings AS cur (template_id, vessel_id, company_id, visibility, hidden_by, hidden_at, reason, created_by, updated_by)
  VALUES (t.id, p_vessel_id, v_company, p_visibility,
          CASE WHEN p_visibility = 'hidden' THEN v_uid END,
          CASE WHEN p_visibility = 'hidden' THEN now() END,
          v_reason, v_uid, v_uid)
  ON CONFLICT (template_id, vessel_id) DO UPDATE SET
    visibility = EXCLUDED.visibility,
    hidden_by = CASE WHEN EXCLUDED.visibility = 'hidden' AND cur.visibility = 'hidden' THEN cur.hidden_by ELSE EXCLUDED.hidden_by END,
    hidden_at = CASE WHEN EXCLUDED.visibility = 'hidden' AND cur.visibility = 'hidden' THEN cur.hidden_at ELSE EXCLUDED.hidden_at END,
    reason = EXCLUDED.reason,
    updated_by = EXCLUDED.updated_by
  RETURNING * INTO n;
  PERFORM public.form_template_log(v_company, t.id, p_vessel_id, CASE p_visibility WHEN 'hidden' THEN 'hidden' ELSE 'shown' END,
    t.status, t.status, t.version, v_reason, jsonb_build_object('previous', coalesce(s.visibility, 'shown')));
  PERFORM set_config('storm.fleet_tx', v_prev, true);
  RETURN n;
END;
$$;

-- Orders the published templates of one area on a vessel (W2 "order on
-- vessels"; p_area NULL = Unsorted): p_template_ids must hold every
-- PUBLISHED template of that area targeting the vessel exactly once,
-- hidden ones included (22023 reorder_mismatch; invalid_area for a value
-- outside the list). Fleet checklist admins on any vessel, vessel managers
-- on theirs. One 'reordered' event for the vessel. Returns the settings in
-- the new order.
CREATE OR REPLACE FUNCTION public.form_template_reorder(p_vessel_id uuid, p_area text, p_template_ids uuid[])
RETURNS SETOF public.form_template_vessel_settings
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.get_user_company_id(auth.uid());
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  v_ids uuid[] := coalesce(p_template_ids, '{}'::uuid[]);
  v_expected uuid[];
BEGIN
  IF v_uid IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  IF p_vessel_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'vessel_out_of_reach';
  END IF;
  PERFORM public.fleet_counted_vessels_for(v_uid, v_company, ARRAY[p_vessel_id]);
  IF NOT public.form_template_vessel_manager_for(v_uid, v_company, p_vessel_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  IF p_area IS NOT NULL AND p_area NOT IN ('charter', 'safety', 'technical', 'movement', 'ptw', 'familiarisation', 'crew', 'sms', 'technical_forms') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_area';
  END IF;
  SELECT coalesce(array_agg(t.id ORDER BY t.id), '{}'::uuid[]) INTO v_expected
  FROM public.form_templates AS t
  WHERE t.company_id = v_company AND t.status = 'PUBLISHED' AND t.area IS NOT DISTINCT FROM p_area
    AND public.form_template_targets_vessel(t.vessel_scope, t.vessel_ids, p_vessel_id);
  IF array_position(v_ids, NULL) IS NOT NULL
     OR cardinality(v_ids) <> (SELECT count(DISTINCT x) FROM unnest(v_ids) AS x)
     OR (SELECT coalesce(array_agg(x ORDER BY x), '{}'::uuid[]) FROM unnest(v_ids) AS x) IS DISTINCT FROM v_expected
     OR cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reorder_mismatch';
  END IF;

  PERFORM set_config('storm.fleet_tx', 'on', true);
  INSERT INTO public.form_template_vessel_settings AS cur (template_id, vessel_id, company_id, visibility, sort_order, created_by, updated_by)
  SELECT x.id, p_vessel_id, v_company, 'shown', x.ord::integer, v_uid, v_uid
  FROM unnest(v_ids) WITH ORDINALITY AS x(id, ord)
  ON CONFLICT (template_id, vessel_id) DO UPDATE SET sort_order = EXCLUDED.sort_order, updated_by = EXCLUDED.updated_by
  WHERE cur.sort_order IS DISTINCT FROM EXCLUDED.sort_order;
  PERFORM public.form_template_log(v_company, NULL, p_vessel_id, 'reordered', NULL, NULL, NULL, NULL,
    jsonb_build_object('area', p_area, 'template_ids', to_jsonb(v_ids)));
  PERFORM set_config('storm.fleet_tx', v_prev, true);
  RETURN QUERY
    SELECT s.* FROM public.form_template_vessel_settings AS s
    JOIN unnest(v_ids) WITH ORDINALITY AS x(id, ord) ON x.id = s.template_id
    WHERE s.vessel_id = p_vessel_id
    ORDER BY x.ord;
END;
$$;

-- ---------------------------------------------------------------- run statistics (FC6)

-- Per PUBLISHED template (of p_area, or every area with NULL) and each
-- vessel it targets among the vessels asked for: the runs of the whole
-- family (every version, same template_code) on that vessel, the last run
-- (submitted, else created, time; and its day), the next due day by
-- cadence (form_template_next_due from the last run's day, else from the
-- family's first publish day in UTC; none for event-driven cadences) and
-- whether it is overdue on p_today (the day after the due day onwards). A
-- run is a submission that left the crew member's hands (PENDING_SIGNATURE,
-- SIGNED, AMENDED, ARCHIVED) and is not itself an amendment. hidden: the
-- template is hidden on the vessel (then nothing is due or overdue).
-- Vessels: NULL = every counted vessel the caller reaches and may read
-- checklists on; explicit ids are reach-checked (42501 vessel_out_of_reach)
-- and each needs checklists view or the Master (42501 not_permitted).
-- 22023 invalid_area for an area outside the list.
CREATE OR REPLACE FUNCTION public.form_template_run_stats(p_vessel_ids uuid[] DEFAULT NULL, p_area text DEFAULT NULL, p_today date DEFAULT current_date)
RETURNS TABLE (template_id uuid, vessel_id uuid, hidden boolean, runs bigint, last_run_at timestamptz, last_run_on date, next_due date, overdue boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.get_user_company_id(auth.uid());
  v_vessels uuid[];
  v_today date := coalesce(p_today, current_date);
BEGIN
  IF v_uid IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  IF p_area IS NOT NULL AND p_area NOT IN ('charter', 'safety', 'technical', 'movement', 'ptw', 'familiarisation', 'crew', 'sms', 'technical_forms') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_area';
  END IF;
  SELECT coalesce(array_agg(c.id), '{}'::uuid[]) INTO v_vessels
  FROM public.fleet_counted_vessels_for(v_uid, v_company, p_vessel_ids) AS c(id)
  WHERE coalesce(public.fleet_ops_can_for(v_uid, v_company, c.id, 'checklists', 'view'), false)
     OR coalesce(public.record_is_master(v_uid, c.id), false);
  IF p_vessel_ids IS NOT NULL
     AND cardinality(v_vessels) <> (SELECT count(DISTINCT x) FROM unnest(p_vessel_ids) AS x WHERE x IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;

  RETURN QUERY
  WITH tpl AS (
    SELECT t.id, t.template_code, t.cadence, t.vessel_scope, t.vessel_ids
    FROM public.form_templates AS t
    WHERE t.company_id = v_company AND t.status = 'PUBLISHED' AND (p_area IS NULL OR t.area = p_area)
  ),
  pairs AS (
    SELECT tpl.id AS tid, tpl.template_code, tpl.cadence, v.id AS vid
    FROM tpl
    JOIN unnest(v_vessels) AS v(id) ON public.form_template_targets_vessel(tpl.vessel_scope, tpl.vessel_ids, v.id)
  ),
  family AS (
    SELECT tpl.id AS tid, f.id AS member_id, f.published_at
    FROM tpl
    JOIN public.form_templates AS f ON f.company_id = v_company AND f.template_code = tpl.template_code
  ),
  first_publish AS (
    SELECT family.tid, min(family.published_at) AS first_at FROM family GROUP BY family.tid
  ),
  runs AS (
    SELECT p.tid, p.vid, count(s.id) AS runs,
           max(coalesce(s.submitted_at, s.created_time_utc)) AS last_at,
           max(s.created_date) AS last_on
    FROM pairs AS p
    JOIN family AS fam ON fam.tid = p.tid
    JOIN public.form_submissions AS s ON s.template_id = fam.member_id AND s.vessel_id = p.vid
    WHERE s.amendment_of_id IS NULL AND s.status IN ('PENDING_SIGNATURE', 'SIGNED', 'AMENDED', 'ARCHIVED')
    GROUP BY p.tid, p.vid
  )
  SELECT p.tid,
         p.vid,
         coalesce(st.visibility = 'hidden', false),
         coalesce(r.runs, 0)::bigint,
         r.last_at,
         r.last_on,
         CASE WHEN coalesce(st.visibility = 'hidden', false) THEN NULL
              ELSE public.form_template_next_due(p.cadence, coalesce(r.last_on, (fp.first_at AT TIME ZONE 'UTC')::date)) END,
         CASE WHEN coalesce(st.visibility = 'hidden', false) THEN false
              ELSE coalesce(v_today > public.form_template_next_due(p.cadence, coalesce(r.last_on, (fp.first_at AT TIME ZONE 'UTC')::date)), false) END
  FROM pairs AS p
  LEFT JOIN runs AS r ON r.tid = p.tid AND r.vid = p.vid
  LEFT JOIN first_publish AS fp ON fp.tid = p.tid
  LEFT JOIN public.form_template_vessel_settings AS st ON st.template_id = p.tid AND st.vessel_id = p.vid
  ORDER BY p.tid, p.vid;
END;
$$;

-- ---------------------------------------------------------------- grants

REVOKE ALL ON FUNCTION public.form_template_legacy_kind(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.form_template_legacy_area(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.form_template_targets_vessel(text, uuid[], uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.form_template_next_due(text, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.form_template_publish_blocker(text, jsonb, text, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.form_templates_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.form_templates_audit() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.form_template_vessel_settings_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.form_template_events_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.form_template_gate() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.form_template_vessel_manager_for(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.form_template_log(uuid, uuid, uuid, text, text, text, integer, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.form_template_publish(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.form_template_new_version(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.form_template_customise(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.form_template_archive(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.form_template_delete_draft(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.form_template_move_area(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.form_template_set_visibility(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.form_template_reorder(uuid, text, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.form_template_run_stats(uuid[], text, date) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.form_template_legacy_kind(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.form_template_legacy_area(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.form_template_targets_vessel(text, uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.form_template_next_due(text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.form_template_publish_blocker(text, jsonb, text, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.form_template_gate() TO service_role;
GRANT EXECUTE ON FUNCTION public.form_template_vessel_manager_for(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.form_template_log(uuid, uuid, uuid, text, text, text, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.form_template_publish(uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.form_template_new_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.form_template_customise(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.form_template_archive(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.form_template_delete_draft(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.form_template_move_area(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.form_template_set_visibility(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.form_template_reorder(uuid, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.form_template_run_stats(uuid[], text, date) TO authenticated;

-- ---------------------------------------------------------------- comments

COMMENT ON TABLE public.form_template_vessel_settings IS 'A published template on one vessel it targets (gap/02 FC4, W2): shown | hidden (who, when, why, up to 300) and its order in its area there; no row = shown, unordered. Read: active members of the company who reach the vessel, and fleet checklist readers. Written only by form_template_set_visibility / form_template_reorder (and carried to a new version by form_template_publish); trg_form_template_vessel_settings_guard, every role.';
COMMENT ON TABLE public.form_template_events IS 'Append-only history of the form template catalogue (D-X5-23, D-173): actor, action, from / to status, version, comment, payload; reorders name the vessel, not a template. Read: fleet checklist readers (a vessel''s events also its checklist readers). Inserted only by the form_template_* definers and form_templates_audit, never updated or deleted (trg_form_template_events_guard).';
COMMENT ON FUNCTION public.form_template_legacy_kind(text, text) IS 'The form_kind of a legacy template from its form_type and category name (passage_plan | checklist | permit | form); the backfill and the insert guard use it. Internal.';
COMMENT ON FUNCTION public.form_template_legacy_area(text, text) IS 'The area of a legacy template from its category name (first matching keyword rule) or else its form_type; NULL = Unsorted. The mapping table is in 20261124040500_fleet_form_templates.sql. Internal.';
COMMENT ON FUNCTION public.form_template_targets_vessel(text, uuid[], uuid) IS 'Whether a template target (FLEET, or VESSEL_SPECIFIC with its vessel ids) covers the vessel. Internal.';
COMMENT ON FUNCTION public.form_template_next_due(text, date) IS 'The day a run is next due after the anchor day by cadence (daily, weekly, monthly, quarterly, six_monthly, yearly, two_yearly, five_yearly); NULL for none, per_voyage, per_charter, on_demand or no anchor. Mirror: src/modules/forms/lib/cadence.ts. Internal.';
COMMENT ON FUNCTION public.form_template_publish_blocker(text, jsonb, text, uuid[]) IS 'The first reason a template cannot be published: name_required | no_section | empty_section | unlabelled_section | unlabelled_item | targets_required; NULL when it may. Mirror: src/modules/forms/lib/publishChecks.ts. Internal.';
COMMENT ON FUNCTION public.form_templates_guard() IS 'Trigger: a template''s status, version and lifecycle columns change only inside the form_template_* definers (storm.fleet_tx); it starts as a company draft at version 1; only drafts change; only a never-published draft with no runs is deleted. Fills area / form_kind on insert from the legacy mapping. Every role.';
COMMENT ON FUNCTION public.form_templates_audit() IS 'Trigger: writes created / edited / draft_deleted events for direct template writes (the definers log their own).';
COMMENT ON FUNCTION public.form_template_vessel_settings_guard() IS 'Trigger: template vessel settings are written only by the form_template_* definers (a cascade excepted) and stay inside the template''s company.';
COMMENT ON FUNCTION public.form_template_events_guard() IS 'Trigger: template history is inserted only by the definers and never updated or deleted (a cascade of the deleted company excepted).';
COMMENT ON FUNCTION public.form_template_gate() IS 'The caller''s company once they are a fleet checklist admin there (fleet_ops_can_for checklists admin, fleet reach); 42501 not_permitted otherwise. Internal.';
COMMENT ON FUNCTION public.form_template_vessel_manager_for(uuid, uuid, uuid) IS 'Whether the user may hide, restore and reorder templates on the vessel: an active member of its company who is a fleet checklist admin, the vessel''s Master or holds checklists edit there. Internal.';
COMMENT ON FUNCTION public.form_template_log(uuid, uuid, uuid, text, text, text, integer, text, jsonb) IS 'Writes one form_template_events row with auth.uid() as actor. Internal.';
COMMENT ON FUNCTION public.form_template_publish(uuid, text, timestamptz) IS 'Publishes a draft template after the publish checks; supersedes the family''s published version (settings carried over), takes an optional version label (1-40, unique in the family) and an optional expected updated_at; a Customise copy hides its source on its vessels. Fleet checklist admins.';
COMMENT ON FUNCTION public.form_template_new_version(uuid) IS 'Starts the next version of a published or archived template as a draft (same code, version max + 1, supersedes set, content copied); refused for drafts, superseded versions, platform templates and while the family has a draft. Fleet checklist admins.';
COMMENT ON FUNCTION public.form_template_customise(uuid) IS 'Makes a company draft copy of a published, superseded or archived template (code <code>_CUSTOM<n>, source_template_id set); publishing it hides the source on its vessels. Fleet checklist admins.';
COMMENT ON FUNCTION public.form_template_archive(uuid, text) IS 'Archives a template (optional reason up to 500 in the event); runs stay readable. Fleet checklist admins.';
COMMENT ON FUNCTION public.form_template_delete_draft(uuid) IS 'Deletes a never-published draft with no runs, with its schedules and extraction jobs; anything else is archived instead. Fleet checklist admins.';
COMMENT ON FUNCTION public.form_template_move_area(uuid, text) IS 'Moves a draft or published template (and the draft of its next version) to another area. Fleet checklist admins.';
COMMENT ON FUNCTION public.form_template_set_visibility(uuid, uuid, text, text) IS 'Shows or hides a published template on a vessel it targets (reason up to 300 while hidden). Fleet checklist admins, or the vessel''s Master / checklists editors on their vessel.';
COMMENT ON FUNCTION public.form_template_reorder(uuid, text, uuid[]) IS 'Orders the published templates of one area on a vessel (every one exactly once). Fleet checklist admins, or the vessel''s Master / checklists editors on their vessel.';
COMMENT ON FUNCTION public.form_template_run_stats(uuid[], text, date) IS 'Per published template and targeted vessel: runs of the family, the last run, the next due day by cadence and whether it is overdue (hidden templates are never due). NULL vessels = the counted vessels the caller reads checklists on.';
