-- =================================================================
-- CREW X1-06: the crew requirement engine: requirement rows per vessel
-- (groups x positions), their options and the satisfaction closure,
-- the compliance status of every crew member, the views fleet
-- operations reads, and the configuration RPCs
-- (Phase 3 wave 1, stream X1; gap/04 C5, C33, C34, C36, W5; gap/02 R5
-- and V4 (crew side); DECISIONS D-01, D-31, D-55, D-120, D-229, D-233,
-- D-X1-3, D-X1-12, D-X1-22; X1 spec §6 060600; platform plan §1
-- contract 5)
-- Tables: crew_requirement_rows (per vessel: a group, a label, a kind,
--   a seed key for the bulk sets), crew_requirement_options (the document
--   types or familiarisation templates that satisfy a row; any one does),
--   crew_requirement_positions (the ticked cells: row x position)
-- Columns: vessel_crew_settings.requirements_seeded_at (the seed ran for
--   the vessel; it never seeds that vessel again)
-- Internal (service role and the definers below): the engine
--   crew_requirement_status_for(), crew_compliance_summary_for(),
--   crew_requirement_row_satisfiers(), the views
--   crew_requirement_status_internal and crew_compliance_summary_internal,
--   the pure rules crew_requirement_tab(), crew_requirement_group_for_category(),
--   crew_compliance_status_decide(), crew_compliance_dot(), the bulk set
--   crew_requirement_set_add(), the held-by counts
--   crew_requirement_held_by() and the seed crew_requirements_seed()
-- Public contract for fleet operations (X5 agreement 5, D-X1-22): the
--   definer SRFs crew_requirement_status_rows() / crew_compliance_summary_rows()
--   behind the security-invoker views crew_requirement_status and
--   crew_compliance_summary, and crew_compliance_for_vessels(uuid[]) (R5)
-- RPCs: crew_vessel_compliance(), crew_vessel_requirement_status(),
--   crew_compliance_for_vessels(), crew_requirements_config(),
--   crew_requirement_row_save(), crew_requirement_row_delete(),
--   crew_requirement_cell_set(), crew_requirement_row_bulk(),
--   crew_requirements_add_stcw_basic(), crew_vessel_set_passenger(),
--   crew_vessel_settings_save(), crew_document_type_create(),
--   crew_document_type_satisfies_save()
-- In place on X1-04's table (unapplied, DDL only): the pair key of
--   crew_document_type_satisfies becomes one pair per scope (STORM's and
--   each company's), so two companies can each accept the same equivalent
-- TS mirror: src/modules/crew/types/db.pending.ts (tables, views, RPCs);
--   src/modules/crew/lib/compliance.ts (the engine, row for row; the cases
--   of src/test/crew/fixtures/complianceCases.json are asserted by
--   src/test/crew/compliance.test.ts and
--   supabase/tests/sql/crew/compliance_parity.test.sql)
-- =================================================================
--
-- Why. Crew documents have a catalogue, a computed state and a
-- verification (060400, 060500), but nothing says which documents a
-- position needs on a vessel: training_matrix (vessel x rank -> course
-- ids) has no UI and the training page uses training_courses.is_mandatory
-- for everyone. This file adds the requirement configuration of gap/04 W5
-- and the engine that says, for every crew member and requirement, whether
-- it is met, and why not.
--
-- Who is evaluated. The crew of the vessel by crew_vessel_members() (a
-- current or planned assignment, or a pending placement; D-227, D-X1-4):
-- occasional workers and visitors are never on it (gap/02 V4). The
-- person's position is crew_position_for() of the assignment's position
-- title, else its rank (crew_vessel_list's rule). The rows required of a
-- person are the rows ticked for that position on that vessel. A person
-- whose title maps to no position, or whose position has no ticks, has
-- nothing required (0 of 0, Complete).
--
-- What satisfies a document row (C34; T-53, T-159, T-326):
--   * the satisfier types are the row's options and every type that
--     reaches an option through crew_document_type_satisfies (STORM's rules
--     and the company's), followed through chains of at most five rules,
--     each type once at its shortest depth (cycle safe); each satisfier
--     records how it got there: 'option' (it is one), or the kind of the
--     rule next to the option ('component' of a combined certificate,
--     'supersedes', 'equivalent'), and the option it satisfies;
--   * a document of a satisfier type counts unless it is rejected or
--     removed; the best one is the latest expiry: "No expiry" first, then
--     the latest date, then a document with no date (missing data, D-31);
--     a not-expired one always beats an expired one; then an unconditional
--     one, then the shortest rule chain;
--   * state: met (the best is valid, has no expiry or has a missing date),
--     expiring (the best is inside its window: expiry_bucket expiring or
--     expiring_soon on expiry_window_for), expired (only expired
--     satisfiers), missing (none). Flags on a satisfied row: conditional
--     (conditionally approved: counts, amber, W4), muted (alerts off: still
--     counts; an expiring row with alerts off raises nothing, C28),
--     missing_date (the date is missing: counts, amber, never Valid,
--     D-31), has_file (a record without a scan still counts; the profile
--     shows Not uploaded);
--   * every missing cell explains itself: 'rejected' (a satisfier is held
--     but was rejected), 'not_linked' (the person holds a document of the
--     same category as an option, which no rule links to it: "nearest:
--     combined basic safety certificate, not linked"), 'none'; the nearest
--     document is named. Every met cell names its document and the rule.
-- A familiarisation row (C36) is met by a completed familiarization_records
-- row of one of its templates on the vessel, matched on the person's
-- profile or their login (X1-10, 20261124061000, edited this file in place
-- for the profile and for fleet-wide templates, rule §0.2; people without a
-- login hold records by profile only). An open record reads 'in_progress'.
--
-- The tab of a row: familiarisation for a familiarisation row, else the tab
-- of its first option's category (T-185: the tab belongs to the type),
-- else its group's (crew_requirement_tab).
--
-- Summary per person (W5 §4): met (met or expiring) of required, the same
-- per tab (documents, stcw, qualifications, familiarisation), the counts
-- per state, status complete, else the worst of expired > missing >
-- expiring (an expiring row with alerts off does not count), next_expiry
-- (the earliest expiry of a satisfied row), the two compliance dots of the
-- crew list (C5: documents; STCW and qualifications): none (nothing
-- required), danger (expired or missing), warn (expiring with alerts on,
-- conditional, a missing date), ok; and the issues behind them, worst
-- first, for the tooltip.
--
-- Gates (one per call, never per row; D-229). Reads need
-- vessel.crew.crew_compliance.view on the vessel, and no external viewer
-- (D-X1-3; X1-02's rule until has_capability_for excludes them
-- centrally); a person may read their own rows with
-- vessel.crew.crew_certificates.view_own (the profile's "Missing required"
-- block). crew_compliance_for_vessels refuses the whole call with 42501
-- vessel_out_of_reach when any id is unknown, foreign or not reached
-- (platform plan contract 5). Writes need vessel.crew.crew_compliance.admin
-- on the vessel; tenant document types and company satisfaction rules need
-- the company-level answer of the same key. Unknown ids: P0002; business
-- refusals: 22023 with a machine message (and HINT naming the field).
--
-- Seed (crew_requirements_seed, once per vessel, marked in
-- vessel_crew_settings.requirements_seeded_at): the vessel's
-- training_matrix rows (rank -> position, course -> document type through
-- the legacy map, then an exact name, code or abbreviation), one row per
-- type with the ranks' positions ticked; else the STCW basic set (PST,
-- FPFF, EFA, PSSR) ticked for every listed position.
--
-- Nothing here is live (D-01): the client reads every object through the
-- pending shim; while the RPCs are missing the compliance page says
-- "Crew compliance becomes available once the crew update is applied" and
-- the crew list dots stay a dash.
--
-- Idempotent (D-12): IF NOT EXISTS, DROP ... IF EXISTS before each policy,
-- trigger and constraint, CREATE OR REPLACE for every function and view,
-- bulk inserts ON CONFLICT, the seed marked per vessel.

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regprocedure('public.crew_vessel_gate(text,uuid,text)') IS NULL
     OR to_regprocedure('public.crew_vessel_cap(text,uuid)') IS NULL
     OR to_regprocedure('public.crew_cap_vessel_ids(text)') IS NULL
     OR to_regprocedure('public.crew_position_for(uuid,uuid,text)') IS NULL
     OR to_regclass('public.positions') IS NULL
     OR to_regclass('public.position_manning') IS NULL
     OR to_regclass('public.departments') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060600_crew_compliance needs the crew gate helpers and positions: apply 20261124060100_crew_reference_positions.sql first';
  END IF;
  IF to_regprocedure('public.crew_vessel_members(uuid,date)') IS NULL
     OR to_regprocedure('public.crew_caller_is_external()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060600_crew_compliance needs crew_vessel_members() and crew_caller_is_external(): apply 20261124060200_crew_vessel_list.sql first';
  END IF;
  IF to_regclass('public.crew_document_types') IS NULL
     OR to_regclass('public.crew_document_categories') IS NULL
     OR to_regclass('public.crew_document_type_satisfies') IS NULL
     OR to_regclass('public.vessel_crew_settings') IS NULL
     OR to_regprocedure('public.crew_document_legacy_key(text)') IS NULL
     OR to_regprocedure('public.crew_document_type_for_legacy(uuid,text,text)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'crew_certificates' AND column_name = 'verification_status') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060600_crew_compliance needs the crew document catalogue: apply 20261124060400_crew_document_catalogue.sql first';
  END IF;
  IF to_regprocedure('public.expiry_bucket(date,integer,date,boolean)') IS NULL
     OR to_regprocedure('public.expiry_window_for(uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060600_crew_compliance needs the fleet expiry engine: apply 20261124040000_fleet_expiry_engine.sql first';
  END IF;
  IF to_regclass('public.familiarization_records') IS NULL
     OR to_regclass('public.familiarization_templates') IS NULL
     OR to_regclass('public.training_matrix') IS NULL
     OR to_regclass('public.training_courses') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060600_crew_compliance needs the live training and familiarisation tables';
  END IF;
  IF to_regprocedure('public.has_capability_for(uuid,text,uuid,uuid)') IS NULL
     OR to_regprocedure('public.user_belongs_to_company(uuid,uuid)') IS NULL
     OR to_regprocedure('public.get_user_company_id(uuid)') IS NULL
     OR to_regprocedure('public.my_profile_id()') IS NULL
     OR to_regprocedure('public.user_is_active(uuid)') IS NULL
     OR to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060600_crew_compliance needs the platform capability and tenancy helpers: apply 20261123000300 to 20261123010000 first';
  END IF;
END
$$;

-- ---------------------------------------------------------------- tables

-- A requirement on a vessel (gap/04 W5 §1): one row of the configuration
-- matrix, in a group, with a label and a kind (a document or a
-- familiarisation). seed_key names the rows the bulk sets and the seed
-- create (stcw_basic.pst, stcw_passenger.crowd, training_matrix.<type
-- key>), one per vessel, so a bulk add never adds a row twice.
CREATE TABLE IF NOT EXISTS public.crew_requirement_rows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  vessel_id uuid NOT NULL,
  group_key text NOT NULL,
  label text NOT NULL,
  kind text NOT NULL DEFAULT 'document',
  sort_order integer NOT NULL DEFAULT 1000,
  seed_key text NULL,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_requirement_rows_pkey PRIMARY KEY (id),
  CONSTRAINT crew_requirement_rows_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT crew_requirement_rows_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE,
  CONSTRAINT crew_requirement_rows_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  CONSTRAINT crew_requirement_rows_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  CONSTRAINT crew_requirement_rows_group_key_check CHECK (group_key IN (
    'stcw_basic', 'survival_craft', 'advanced_training', 'medical', 'security', 'stcw_passenger',
    'coc_gmdss', 'deck_engineering', 'navigation_safety', 'documents', 'familiarisation', 'custom')),
  CONSTRAINT crew_requirement_rows_label_check CHECK (length(btrim(label)) BETWEEN 1 AND 120),
  CONSTRAINT crew_requirement_rows_kind_check CHECK (kind IN ('document', 'familiarisation')),
  -- A familiarisation row sits in the familiarisation group, and only there.
  CONSTRAINT crew_requirement_rows_kind_group_check CHECK ((kind = 'familiarisation') = (group_key = 'familiarisation')),
  CONSTRAINT crew_requirement_rows_sort_order_check CHECK (sort_order BETWEEN 0 AND 999999),
  CONSTRAINT crew_requirement_rows_seed_key_check CHECK (seed_key IS NULL OR (seed_key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$' AND length(seed_key) <= 120)),
  CONSTRAINT crew_requirement_rows_vessel_seed_key UNIQUE (vessel_id, seed_key)
);
CREATE INDEX IF NOT EXISTS crew_requirement_rows_vessel_idx ON public.crew_requirement_rows (vessel_id, sort_order);
CREATE INDEX IF NOT EXISTS crew_requirement_rows_company_idx ON public.crew_requirement_rows (company_id);

-- What satisfies a row (any one option does): a document type, or a
-- familiarisation template. vessel_id and company_id are the row's (filled
-- and checked by the scope guard), so the read policy needs no join.
CREATE TABLE IF NOT EXISTS public.crew_requirement_options (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  vessel_id uuid NOT NULL,
  row_id uuid NOT NULL,
  document_type_id uuid NULL,
  familiarization_template_id uuid NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_requirement_options_pkey PRIMARY KEY (id),
  CONSTRAINT crew_requirement_options_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT crew_requirement_options_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE,
  CONSTRAINT crew_requirement_options_row_id_fkey FOREIGN KEY (row_id) REFERENCES public.crew_requirement_rows(id) ON DELETE CASCADE,
  CONSTRAINT crew_requirement_options_document_type_id_fkey FOREIGN KEY (document_type_id) REFERENCES public.crew_document_types(id) ON DELETE CASCADE,
  CONSTRAINT crew_requirement_options_template_id_fkey FOREIGN KEY (familiarization_template_id) REFERENCES public.familiarization_templates(id) ON DELETE CASCADE,
  CONSTRAINT crew_requirement_options_one_check CHECK (num_nonnulls(document_type_id, familiarization_template_id) = 1),
  CONSTRAINT crew_requirement_options_sort_order_check CHECK (sort_order BETWEEN 0 AND 9999),
  CONSTRAINT crew_requirement_options_row_type_key UNIQUE (row_id, document_type_id),
  CONSTRAINT crew_requirement_options_row_template_key UNIQUE (row_id, familiarization_template_id)
);
CREATE INDEX IF NOT EXISTS crew_requirement_options_vessel_idx ON public.crew_requirement_options (vessel_id);
CREATE INDEX IF NOT EXISTS crew_requirement_options_type_idx ON public.crew_requirement_options (document_type_id) WHERE document_type_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crew_requirement_options_template_idx ON public.crew_requirement_options (familiarization_template_id) WHERE familiarization_template_id IS NOT NULL;

-- A ticked cell: the row is required of the position on the row's vessel.
CREATE TABLE IF NOT EXISTS public.crew_requirement_positions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  vessel_id uuid NOT NULL,
  row_id uuid NOT NULL,
  position_id uuid NOT NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_requirement_positions_pkey PRIMARY KEY (id),
  CONSTRAINT crew_requirement_positions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT crew_requirement_positions_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE,
  CONSTRAINT crew_requirement_positions_row_id_fkey FOREIGN KEY (row_id) REFERENCES public.crew_requirement_rows(id) ON DELETE CASCADE,
  CONSTRAINT crew_requirement_positions_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE CASCADE,
  CONSTRAINT crew_requirement_positions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  CONSTRAINT crew_requirement_positions_row_position_key UNIQUE (row_id, position_id)
);
CREATE INDEX IF NOT EXISTS crew_requirement_positions_position_idx ON public.crew_requirement_positions (position_id);
CREATE INDEX IF NOT EXISTS crew_requirement_positions_vessel_position_idx ON public.crew_requirement_positions (vessel_id, position_id);

-- The seed ran for this vessel (crew_requirements_seed): never again, so a
-- configuration an administrator cleared stays cleared.
ALTER TABLE public.vessel_crew_settings ADD COLUMN IF NOT EXISTS requirements_seeded_at timestamptz NULL;
COMMENT ON COLUMN public.vessel_crew_settings.requirements_seeded_at IS 'When crew_requirements_seed() (20261124060600) seeded this vessel''s requirement rows; a seeded vessel is never seeded again.';

-- X1-04's pair key let only one company accept a given pair of types: one
-- pair per scope instead (STORM's rows and each company's). DDL on an X1
-- table of an earlier, unapplied file; no object is redefined (rule §0.2).
ALTER TABLE public.crew_document_type_satisfies DROP CONSTRAINT IF EXISTS crew_document_type_satisfies_pair_key;
CREATE UNIQUE INDEX IF NOT EXISTS crew_document_type_satisfies_scope_pair_key
  ON public.crew_document_type_satisfies ((coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)), type_id, satisfies_type_id);

-- The engine's document lookups (gap/04 implementation notes, performance).
CREATE INDEX IF NOT EXISTS crew_certificates_profile_document_type_idx ON public.crew_certificates (profile_id, document_type_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS familiarization_records_vessel_template_idx ON public.familiarization_records (vessel_id, template_id, user_id);
-- The two columns the engine below reads, added bare (X1-10's
-- 20261124061000 owns them: their FKs, backfill and CHECKs). Here because
-- the SQL functions of this file are checked when they are created, and a
-- later file may not redefine them (rule §0.2).
ALTER TABLE public.familiarization_records ADD COLUMN IF NOT EXISTS profile_id uuid NULL;
ALTER TABLE public.familiarization_templates ADD COLUMN IF NOT EXISTS company_id uuid NULL;

-- ---------------------------------------------------------------- integrity guards (every writer, the service role included)

-- A row belongs to its vessel's company and stays on its vessel; a row
-- that changes kind keeps no option of the other kind.
CREATE OR REPLACE FUNCTION public.crew_requirement_rows_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = NEW.vessel_id;
  IF NEW.company_id IS NULL THEN
    NEW.company_id := v_company;
  END IF;
  IF v_company IS NULL OR NEW.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_requirement_scope_mismatch',
      DETAIL = 'A requirement belongs to its vessel''s company.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.vessel_id IS DISTINCT FROM OLD.vessel_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_requirement_vessel_locked',
        DETAIL = 'A requirement stays on its vessel.';
    END IF;
    IF NEW.kind IS DISTINCT FROM OLD.kind AND EXISTS (
      SELECT 1 FROM public.crew_requirement_options AS o
      WHERE o.row_id = NEW.id
        AND ((NEW.kind = 'document' AND o.familiarization_template_id IS NOT NULL)
          OR (NEW.kind = 'familiarisation' AND o.document_type_id IS NOT NULL))
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_requirement_option_kind_mismatch',
        DETAIL = 'Remove the options of the other kind first.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- An option carries its row's vessel and company, matches the row's kind,
-- and names a document type of STORM or the row's company, or a
-- familiarisation template of a vessel of the row's company.
CREATE OR REPLACE FUNCTION public.crew_requirement_options_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  SELECT r.company_id, r.vessel_id, r.kind INTO v_row FROM public.crew_requirement_rows AS r WHERE r.id = NEW.row_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'crew_requirement_row_missing';
  END IF;
  IF NEW.company_id IS NULL THEN
    NEW.company_id := v_row.company_id;
  END IF;
  IF NEW.vessel_id IS NULL THEN
    NEW.vessel_id := v_row.vessel_id;
  END IF;
  IF NEW.company_id IS DISTINCT FROM v_row.company_id OR NEW.vessel_id IS DISTINCT FROM v_row.vessel_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_requirement_scope_mismatch',
      DETAIL = 'An option belongs to its requirement''s vessel.';
  END IF;
  IF (v_row.kind = 'document' AND NEW.document_type_id IS NULL)
     OR (v_row.kind = 'familiarisation' AND NEW.familiarization_template_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_requirement_option_kind_mismatch',
      DETAIL = 'A document requirement takes document types; a familiarisation requirement takes familiarisation templates.';
  END IF;
  IF NEW.document_type_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.crew_document_types AS t
    WHERE t.id = NEW.document_type_id AND (t.company_id IS NULL OR t.company_id = v_row.company_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_requirement_type_scope_mismatch',
      DETAIL = 'A requirement names document types of STORM or its own company.';
  END IF;
  -- A vessel template of the company, or a fleet-wide one (vessel_id NULL,
  -- company_id set; X1-10).
  IF NEW.familiarization_template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.familiarization_templates AS ft
    LEFT JOIN public.vessels AS v ON v.id = ft.vessel_id
    WHERE ft.id = NEW.familiarization_template_id AND coalesce(v.company_id, ft.company_id) = v_row.company_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_requirement_template_scope_mismatch',
      DETAIL = 'A requirement names familiarisation templates of its own company.';
  END IF;
  RETURN NEW;
END;
$$;

-- A tick carries its row's vessel and company and names a position visible
-- on that vessel (STORM's, the company's, or the vessel's own).
CREATE OR REPLACE FUNCTION public.crew_requirement_positions_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  SELECT r.company_id, r.vessel_id INTO v_row FROM public.crew_requirement_rows AS r WHERE r.id = NEW.row_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'crew_requirement_row_missing';
  END IF;
  IF NEW.company_id IS NULL THEN
    NEW.company_id := v_row.company_id;
  END IF;
  IF NEW.vessel_id IS NULL THEN
    NEW.vessel_id := v_row.vessel_id;
  END IF;
  IF NEW.company_id IS DISTINCT FROM v_row.company_id OR NEW.vessel_id IS DISTINCT FROM v_row.vessel_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_requirement_scope_mismatch',
      DETAIL = 'A ticked position belongs to its requirement''s vessel.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.positions AS p
    WHERE p.id = NEW.position_id
      AND (p.company_id IS NULL OR (p.company_id = v_row.company_id AND (p.vessel_id IS NULL OR p.vessel_id = v_row.vessel_id)))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_requirement_position_scope_mismatch',
      DETAIL = 'A requirement ticks positions of STORM, its company or its vessel.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crew_requirement_rows_scope_guard ON public.crew_requirement_rows;
CREATE TRIGGER trg_crew_requirement_rows_scope_guard
  BEFORE INSERT OR UPDATE ON public.crew_requirement_rows
  FOR EACH ROW EXECUTE FUNCTION public.crew_requirement_rows_scope_guard();
DROP TRIGGER IF EXISTS trg_crew_requirement_options_scope_guard ON public.crew_requirement_options;
CREATE TRIGGER trg_crew_requirement_options_scope_guard
  BEFORE INSERT OR UPDATE ON public.crew_requirement_options
  FOR EACH ROW EXECUTE FUNCTION public.crew_requirement_options_scope_guard();
DROP TRIGGER IF EXISTS trg_crew_requirement_positions_scope_guard ON public.crew_requirement_positions;
CREATE TRIGGER trg_crew_requirement_positions_scope_guard
  BEFORE INSERT OR UPDATE ON public.crew_requirement_positions
  FOR EACH ROW EXECUTE FUNCTION public.crew_requirement_positions_scope_guard();

DROP TRIGGER IF EXISTS trg_crew_requirement_rows_updated_at ON public.crew_requirement_rows;
CREATE TRIGGER trg_crew_requirement_rows_updated_at
  BEFORE UPDATE ON public.crew_requirement_rows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_crew_requirement_options_updated_at ON public.crew_requirement_options;
CREATE TRIGGER trg_crew_requirement_options_updated_at
  BEFORE UPDATE ON public.crew_requirement_options
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_crew_requirement_positions_updated_at ON public.crew_requirement_positions;
CREATE TRIGGER trg_crew_requirement_positions_updated_at
  BEFORE UPDATE ON public.crew_requirement_positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------- RLS

ALTER TABLE public.crew_requirement_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_requirement_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_requirement_positions ENABLE ROW LEVEL SECURITY;

-- Read with vessel.crew.crew_compliance.view on the vessel, hoisted
-- (D-229: the caller-only sets run once per statement); no external
-- viewer; an inactive caller gets nothing (the set is empty). No browser
-- write policy: every write is one of the RPCs below.
DROP POLICY IF EXISTS crew_requirement_rows_select_scoped ON public.crew_requirement_rows;
CREATE POLICY crew_requirement_rows_select_scoped ON public.crew_requirement_rows
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company((SELECT auth.uid()), company_id)
         AND vessel_id IN (SELECT public.crew_cap_vessel_ids('vessel.crew.crew_compliance.view'))
         AND NOT (SELECT public.crew_caller_is_external()));
DROP POLICY IF EXISTS crew_requirement_options_select_scoped ON public.crew_requirement_options;
CREATE POLICY crew_requirement_options_select_scoped ON public.crew_requirement_options
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company((SELECT auth.uid()), company_id)
         AND vessel_id IN (SELECT public.crew_cap_vessel_ids('vessel.crew.crew_compliance.view'))
         AND NOT (SELECT public.crew_caller_is_external()));
DROP POLICY IF EXISTS crew_requirement_positions_select_scoped ON public.crew_requirement_positions;
CREATE POLICY crew_requirement_positions_select_scoped ON public.crew_requirement_positions
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company((SELECT auth.uid()), company_id)
         AND vessel_id IN (SELECT public.crew_cap_vessel_ids('vessel.crew.crew_compliance.view'))
         AND NOT (SELECT public.crew_caller_is_external()));

-- ---------------------------------------------------------------- pure rules (TS lib/compliance.ts holds the same tables)

-- The tab of a requirement: familiarisation for a familiarisation row; else
-- the tab of its first option's category (T-185); else its group's.
CREATE OR REPLACE FUNCTION public.crew_requirement_tab(p_kind text, p_group_key text, p_option_tab text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_kind = 'familiarisation' THEN 'familiarisation'
    WHEN p_option_tab IN ('documents', 'stcw', 'qualifications') THEN p_option_tab
    WHEN p_group_key = 'documents' THEN 'documents'
    WHEN p_group_key IN ('stcw_basic', 'survival_craft', 'advanced_training', 'medical', 'security', 'stcw_passenger', 'navigation_safety') THEN 'stcw'
    ELSE 'qualifications'
  END
$$;

-- The group a document category's requirement goes in (the seed and the
-- add dialog's default): STCW VI/1 to VI/6 and V by their part, medical
-- fitness and health with medical, certificates of competency and radio as
-- CoC / GMDSS, ratings and specialist deck and engine tickets as deck and
-- engineering, navigation and offshore safety, identity documents as
-- documents, the rest custom.
CREATE OR REPLACE FUNCTION public.crew_requirement_group_for_category(p_category_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_category_key = 'stcw_basic' THEN 'stcw_basic'
    WHEN p_category_key = 'stcw_survival_craft' THEN 'survival_craft'
    WHEN p_category_key IN ('stcw_fire', 'stcw_special_ships', 'stcw_leadership', 'stcw_engineering') THEN 'advanced_training'
    WHEN p_category_key IN ('stcw_medical', 'medical_fitness', 'health_records') THEN 'medical'
    WHEN p_category_key IN ('stcw_security', 'security_services') THEN 'security'
    WHEN p_category_key = 'stcw_passenger' THEN 'stcw_passenger'
    WHEN p_category_key IN ('coc_deck', 'coc_deck_yacht', 'coc_engineering', 'coc_engineering_yacht', 'coc_electro', 'radio', 'flag_endorsements') THEN 'coc_gmdss'
    WHEN p_category_key IN ('ratings', 'dynamic_positioning', 'tenders_watersports', 'diving', 'technical_trades') THEN 'deck_engineering'
    WHEN p_category_key IN ('stcw_navigation', 'helicopter_offshore') THEN 'navigation_safety'
    WHEN p_category_key IN ('passports', 'seafarer_identity', 'visas', 'work_permits', 'identity_other', 'licences', 'other_documents') THEN 'documents'
    ELSE 'custom'
  END
$$;

-- A person's compliance status from the counts (W5 §4): the worst of
-- expired > missing > expiring (with alerts on), else complete.
CREATE OR REPLACE FUNCTION public.crew_compliance_status_decide(p_expired integer, p_missing integer, p_expiring_open integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN coalesce(p_expired, 0) > 0 THEN 'expired'
    WHEN coalesce(p_missing, 0) > 0 THEN 'missing'
    WHEN coalesce(p_expiring_open, 0) > 0 THEN 'expiring'
    ELSE 'complete'
  END
$$;

-- A compliance dot of the crew list (C5): none (nothing required on its
-- tabs), danger (a row expired or missing), warn (expiring with alerts on,
-- conditionally approved, or a missing date), ok.
CREATE OR REPLACE FUNCTION public.crew_compliance_dot(p_required integer, p_bad integer, p_warn integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN coalesce(p_required, 0) = 0 THEN 'none'
    WHEN coalesce(p_bad, 0) > 0 THEN 'danger'
    WHEN coalesce(p_warn, 0) > 0 THEN 'warn'
    ELSE 'ok'
  END
$$;

-- ---------------------------------------------------------------- the engine (internal)

-- The satisfier types of every document requirement on the vessels (C34):
-- each row's options, and every type that reaches an option through the
-- satisfaction rules of STORM and of the row's company, through chains of
-- at most five rules, cycle safe, each type once per row at its shortest
-- depth. kind is 'option' (depth 0), else the kind of the rule next to the
-- option; via_option_type_id is the option it satisfies. Ties: the
-- shortest depth, then the first option (sort order), then the kind
-- (alphabetically). TS satisfierClosure() is the same rule.
CREATE OR REPLACE FUNCTION public.crew_requirement_row_satisfiers(p_vessel_ids uuid[])
RETURNS TABLE (row_id uuid, type_id uuid, kind text, depth integer, via_option_type_id uuid, option_sort integer)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH RECURSIVE
  opt AS (
    SELECT o.id, o.row_id, o.document_type_id, o.sort_order, r.company_id
    FROM public.crew_requirement_options AS o
    JOIN public.crew_requirement_rows AS r ON r.id = o.row_id
    WHERE r.vessel_id = ANY (p_vessel_ids) AND o.document_type_id IS NOT NULL
  ),
  roots AS (
    SELECT DISTINCT o.company_id, o.document_type_id AS root FROM opt AS o
  ),
  chain (company_id, root, type_id, kind, depth, path) AS (
    SELECT r.company_id, r.root, r.root, 'option'::text, 0, ARRAY[r.root]
    FROM roots AS r
    UNION ALL
    SELECT c.company_id, c.root, s.type_id, CASE WHEN c.depth = 0 THEN s.kind ELSE c.kind END, c.depth + 1, c.path || s.type_id
    FROM chain AS c
    JOIN public.crew_document_type_satisfies AS s
      ON s.satisfies_type_id = c.type_id AND (s.company_id IS NULL OR s.company_id = c.company_id)
    WHERE c.depth < 5 AND NOT (s.type_id = ANY (c.path))
  ),
  shortest AS (
    SELECT DISTINCT ON (c.company_id, c.root, c.type_id) c.company_id, c.root, c.type_id, c.kind, c.depth
    FROM chain AS c
    ORDER BY c.company_id, c.root, c.type_id, c.depth, c.kind COLLATE "C"
  )
  SELECT DISTINCT ON (o.row_id, s.type_id) o.row_id, s.type_id, s.kind, s.depth, o.document_type_id, o.sort_order
  FROM opt AS o
  JOIN shortest AS s ON s.company_id = o.company_id AND s.root = o.document_type_id
  ORDER BY o.row_id, s.type_id, s.depth, o.sort_order, o.id, s.kind COLLATE "C"
$$;

-- The requirement status of every crew member on the vessels on a day
-- (gap/04 W5 §2-§3): one row per person and required requirement, with
-- the satisfying document (or familiarisation record), how it satisfies,
-- the flags and, for a missing row, why. p_profile_id narrows it to one
-- person. Internal: the definers below call it with vessel ids they gated
-- themselves; the service role reads it through
-- crew_requirement_status_internal. TS evaluateRequirement() mirrors it.
CREATE OR REPLACE FUNCTION public.crew_requirement_status_for(p_vessel_ids uuid[], p_on date DEFAULT current_date, p_profile_id uuid DEFAULT NULL)
RETURNS TABLE (
  company_id uuid,
  vessel_id uuid,
  profile_id uuid,
  user_id uuid,
  position_id uuid,
  placement_kind text,
  row_id uuid,
  group_key text,
  row_label text,
  row_kind text,
  tab text,
  row_sort integer,
  state text,
  satisfying_document_id uuid,
  satisfying_record_id uuid,
  satisfying_type_id uuid,
  satisfying_name text,
  satisfied_via text,
  via_option_type_id uuid,
  next_expiry date,
  no_expiry boolean,
  bucket text,
  days_remaining integer,
  verification_status text,
  is_conditional boolean,
  is_muted boolean,
  missing_date boolean,
  has_file boolean,
  gap_reason text,
  nearest_document_id uuid,
  nearest_record_id uuid,
  nearest_type_id uuid,
  nearest_name text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH
  vsl AS MATERIALIZED (
    SELECT v.id, v.company_id FROM public.vessels AS v WHERE v.id = ANY (p_vessel_ids)
  ),
  crew AS MATERIALIZED (
    SELECT vs.company_id, vs.id AS vessel_id, m.profile_id, m.user_id, m.placement_kind, m.position_text, m.rank_text
    FROM vsl AS vs
    CROSS JOIN LATERAL public.crew_vessel_members(vs.id, coalesce(p_on, current_date)) AS m
    WHERE p_profile_id IS NULL OR m.profile_id = p_profile_id
  ),
  -- The position of each distinct title on each vessel, matched once
  -- (crew_position_for: the position title, else the rank).
  titles AS MATERIALIZED (
    SELECT t.company_id, t.vessel_id, t.position_text, t.rank_text,
           coalesce(public.crew_position_for(t.company_id, t.vessel_id, t.position_text),
                    public.crew_position_for(t.company_id, t.vessel_id, t.rank_text)) AS position_id
    FROM (SELECT DISTINCT c.company_id, c.vessel_id, c.position_text, c.rank_text FROM crew AS c) AS t
  ),
  mem AS MATERIALIZED (
    SELECT c.company_id, c.vessel_id, c.profile_id, c.user_id, c.placement_kind, ti.position_id
    FROM crew AS c
    JOIN titles AS ti ON ti.vessel_id = c.vessel_id
      AND ti.position_text IS NOT DISTINCT FROM c.position_text AND ti.rank_text IS NOT DISTINCT FROM c.rank_text
  ),
  opt AS MATERIALIZED (
    SELECT o.id, o.row_id, o.document_type_id, o.familiarization_template_id, o.sort_order,
           t.category_key, cat.tab AS type_tab
    FROM public.crew_requirement_options AS o
    JOIN public.crew_requirement_rows AS r ON r.id = o.row_id
    LEFT JOIN public.crew_document_types AS t ON t.id = o.document_type_id
    LEFT JOIN public.crew_document_categories AS cat ON cat.key = t.category_key
    WHERE r.vessel_id = ANY (p_vessel_ids)
  ),
  sat AS MATERIALIZED (
    SELECT * FROM public.crew_requirement_row_satisfiers(p_vessel_ids)
  ),
  -- Per row: its tab, the categories of its document options and its
  -- satisfier types (for the nearest-document search of a missing row).
  rws AS MATERIALIZED (
    SELECT r.id, r.vessel_id, r.group_key, r.label, r.kind, r.sort_order,
           public.crew_requirement_tab(r.kind, r.group_key,
             (SELECT o.type_tab FROM opt AS o WHERE o.row_id = r.id AND o.document_type_id IS NOT NULL ORDER BY o.sort_order, o.id LIMIT 1)) AS tab,
           ARRAY(SELECT DISTINCT o.category_key FROM opt AS o WHERE o.row_id = r.id AND o.category_key IS NOT NULL) AS cats,
           ARRAY(SELECT s.type_id FROM sat AS s WHERE s.row_id = r.id) AS sat_types
    FROM public.crew_requirement_rows AS r
    WHERE r.vessel_id = ANY (p_vessel_ids)
  ),
  req AS MATERIALIZED (
    SELECT m.company_id, m.vessel_id, m.profile_id, m.user_id, m.position_id, m.placement_kind,
           r.id AS row_id, r.group_key, r.label, r.kind, r.tab, r.sort_order, r.cats, r.sat_types
    FROM mem AS m
    JOIN public.crew_requirement_positions AS rp ON rp.vessel_id = m.vessel_id AND rp.position_id = m.position_id
    JOIN rws AS r ON r.id = rp.row_id
  ),
  -- The expiry window of every satisfier type, once per company and type.
  win AS MATERIALIZED (
    SELECT x.company_id, x.type_id, public.expiry_window_for(x.company_id, x.expiry_item_type, x.type_id) AS window_days
    FROM (SELECT DISTINCT r.company_id, s.type_id, t.expiry_item_type
          FROM sat AS s
          JOIN public.crew_requirement_rows AS r ON r.id = s.row_id
          JOIN public.crew_document_types AS t ON t.id = s.type_id) AS x
  ),
  -- Every document of a satisfier type the person holds, per required row
  -- (crew_certificates_profile_document_type_idx).
  raw AS MATERIALIZED (
    SELECT q.vessel_id, q.profile_id, q.row_id, cc.id AS doc_id, cc.document_type_id, t.name AS type_name,
           s.kind AS via, s.depth, s.via_option_type_id, cc.expiry_date, cc.no_expiry, w.window_days,
           (cc.expiry_date IS NULL AND NOT cc.no_expiry) AS no_date,
           CASE WHEN cc.no_expiry THEN 0 WHEN cc.expiry_date IS NOT NULL THEN 1 ELSE 2 END AS expiry_class,
           cc.verification_status, cc.alerts_muted,
           (cc.file_path IS NOT NULL OR nullif(btrim(cc.file_url), '') IS NOT NULL) AS has_file
    FROM req AS q
    JOIN sat AS s ON s.row_id = q.row_id
    -- Per required row, a probe on (profile_id, document_type_id) for each satisfier type.
    CROSS JOIN LATERAL (
      SELECT c.id, c.document_type_id, c.expiry_date, c.no_expiry, c.verification_status, c.alerts_muted, c.file_path, c.file_url
      FROM public.crew_certificates AS c
      WHERE c.profile_id = q.profile_id AND c.document_type_id = s.type_id AND c.deleted_at IS NULL
      OFFSET 0
    ) AS cc
    JOIN public.crew_document_types AS t ON t.id = cc.document_type_id
    JOIN win AS w ON w.company_id = q.company_id AND w.type_id = s.type_id
    WHERE q.kind = 'document'
  ),
  -- The expiry bucket (X5's expiry_bucket, the one rule) once per distinct
  -- date, window and tick; a missing date has none.
  buckets AS MATERIALIZED (
    SELECT x.expiry_key, x.window_days, x.no_expiry,
           public.expiry_bucket(x.expiry_date, x.window_days, coalesce(p_on, current_date), x.no_expiry) AS bucket
    FROM (SELECT DISTINCT r.expiry_date, coalesce(r.expiry_date, 'infinity'::date) AS expiry_key, r.window_days, r.no_expiry
          FROM raw AS r WHERE NOT r.no_date) AS x
  ),
  cand AS MATERIALIZED (
    SELECT r.*, bk.bucket AS doc_bucket
    FROM raw AS r
    LEFT JOIN buckets AS bk
      ON NOT r.no_date AND bk.expiry_key = coalesce(r.expiry_date, 'infinity'::date)
     AND bk.window_days = r.window_days AND bk.no_expiry = r.no_expiry
  ),
  best AS (
    SELECT DISTINCT ON (c.vessel_id, c.profile_id, c.row_id) c.*
    FROM cand AS c
    WHERE c.verification_status <> 'rejected'
    ORDER BY c.vessel_id, c.profile_id, c.row_id,
             coalesce(c.doc_bucket = 'expired', false), c.expiry_class, c.expiry_date DESC NULLS LAST,
             (c.verification_status = 'conditionally_approved'), c.depth, c.doc_id
  ),
  rejected AS (
    SELECT DISTINCT ON (c.vessel_id, c.profile_id, c.row_id) c.*
    FROM cand AS c
    WHERE c.verification_status = 'rejected'
    ORDER BY c.vessel_id, c.profile_id, c.row_id, c.expiry_class, c.expiry_date DESC NULLS LAST, c.depth, c.doc_id
  ),
  fam AS (
    SELECT DISTINCT ON (q.vessel_id, q.profile_id, q.row_id) q.vessel_id, q.profile_id, q.row_id,
           fr.id AS record_id, ft.template_name, coalesce(lower(fr.status) = 'completed', false) AS done
    FROM req AS q
    JOIN opt AS o ON o.row_id = q.row_id AND o.familiarization_template_id IS NOT NULL
    JOIN public.familiarization_records AS fr
      ON fr.template_id = o.familiarization_template_id AND fr.vessel_id = q.vessel_id
     AND (fr.profile_id = q.profile_id OR fr.user_id = q.user_id)
    JOIN public.familiarization_templates AS ft ON ft.id = fr.template_id
    WHERE q.kind = 'familiarisation'
    ORDER BY q.vessel_id, q.profile_id, q.row_id, coalesce(lower(fr.status) = 'completed', false) DESC,
             fr.actual_completion_date DESC NULLS LAST, o.sort_order, fr.id
  ),
  decided AS (
    SELECT q.*, b.doc_id, b.document_type_id, b.type_name, b.via, b.via_option_type_id, b.expiry_date, b.no_expiry AS b_no_expiry,
           b.no_date, b.doc_bucket, b.verification_status, b.alerts_muted, b.has_file AS b_has_file,
           f.record_id, f.template_name, f.done,
           rj.doc_id AS rj_doc, rj.document_type_id AS rj_type, rj.type_name AS rj_name,
           CASE
             WHEN q.kind = 'familiarisation' THEN CASE WHEN coalesce(f.done, false) THEN 'met' ELSE 'missing' END
             WHEN b.doc_id IS NULL THEN 'missing'
             WHEN b.doc_bucket = 'expired' THEN 'expired'
             WHEN b.doc_bucket IN ('expiring', 'expiring_soon') THEN 'expiring'
             ELSE 'met'
           END AS st
    FROM req AS q
    LEFT JOIN best AS b ON b.vessel_id = q.vessel_id AND b.profile_id = q.profile_id AND b.row_id = q.row_id
    LEFT JOIN fam AS f ON f.vessel_id = q.vessel_id AND f.profile_id = q.profile_id AND f.row_id = q.row_id
    LEFT JOIN rejected AS rj ON rj.vessel_id = q.vessel_id AND rj.profile_id = q.profile_id AND rj.row_id = q.row_id
  )
  SELECT d.company_id, d.vessel_id, d.profile_id, d.user_id, d.position_id, d.placement_kind,
         d.row_id, d.group_key, d.label, d.kind, d.tab, d.sort_order,
         d.st,
         d.doc_id,
         CASE WHEN d.kind = 'familiarisation' AND d.done THEN d.record_id END,
         d.document_type_id,
         CASE WHEN d.kind = 'familiarisation' THEN CASE WHEN d.done THEN d.template_name END ELSE d.type_name END,
         CASE WHEN d.kind = 'familiarisation' THEN CASE WHEN d.done THEN 'familiarisation' END ELSE d.via END,
         d.via_option_type_id,
         CASE WHEN d.b_no_expiry THEN NULL ELSE d.expiry_date END,
         coalesce(d.b_no_expiry, false),
         d.doc_bucket,
         CASE WHEN d.expiry_date IS NULL OR coalesce(d.b_no_expiry, false) THEN NULL ELSE d.expiry_date - coalesce(p_on, current_date) END,
         d.verification_status,
         coalesce(d.verification_status = 'conditionally_approved', false),
         coalesce(d.alerts_muted, false),
         coalesce(d.no_date, false),
         d.b_has_file,
         CASE WHEN d.st <> 'missing' THEN NULL
              WHEN d.kind = 'familiarisation' THEN CASE WHEN d.record_id IS NOT NULL THEN 'in_progress' ELSE 'none' END
              WHEN d.rj_doc IS NOT NULL THEN 'rejected'
              WHEN nr.doc_id IS NOT NULL THEN 'not_linked'
              ELSE 'none' END,
         CASE WHEN d.st <> 'missing' OR d.kind = 'familiarisation' THEN NULL ELSE coalesce(d.rj_doc, nr.doc_id) END,
         CASE WHEN d.st = 'missing' AND d.kind = 'familiarisation' THEN d.record_id END,
         CASE WHEN d.st <> 'missing' OR d.kind = 'familiarisation' THEN NULL ELSE coalesce(d.rj_type, nr.document_type_id) END,
         CASE WHEN d.st <> 'missing' THEN NULL
              WHEN d.kind = 'familiarisation' THEN d.template_name
              ELSE coalesce(d.rj_name, nr.type_name) END
  FROM decided AS d
  -- The nearest held document of a missing row with no rejected satisfier:
  -- one of the same category as an option, which no rule links to it.
  LEFT JOIN LATERAL (
    SELECT cc.id AS doc_id, cc.document_type_id, t.name AS type_name
    FROM public.crew_certificates AS cc
    JOIN public.crew_document_types AS t ON t.id = cc.document_type_id
    WHERE d.st = 'missing' AND d.kind = 'document' AND d.rj_doc IS NULL
      AND cc.profile_id = d.profile_id AND cc.deleted_at IS NULL
      AND cc.verification_status <> 'rejected'
      AND t.category_key = ANY (d.cats)
      AND NOT (cc.document_type_id = ANY (d.sat_types))
    ORDER BY CASE WHEN cc.no_expiry THEN 0 WHEN cc.expiry_date IS NOT NULL THEN 1 ELSE 2 END,
             cc.expiry_date DESC NULLS LAST, t.key COLLATE "C", cc.id
    LIMIT 1
  ) AS nr ON true
  ORDER BY d.vessel_id, d.profile_id, d.sort_order, d.row_id
$$;

-- The compliance summary of every crew member on the vessels on a day (W5
-- §4): one row per person of crew_vessel_members(), with nothing required
-- reading 0 of 0 and complete. The person's names, position, department
-- and the vessel's rank order are included for the list, the compliance
-- page and the fleet report (R5). Internal; TS summariseCompliance()
-- mirrors the counts, status, dots and issues.
CREATE OR REPLACE FUNCTION public.crew_compliance_summary_for(p_vessel_ids uuid[], p_on date DEFAULT current_date, p_profile_id uuid DEFAULT NULL)
RETURNS TABLE (
  company_id uuid,
  vessel_id uuid,
  profile_id uuid,
  user_id uuid,
  first_name text,
  last_name text,
  preferred_name text,
  position_id uuid,
  position_name text,
  position_text text,
  department_key text,
  rank_tier text,
  sort_order integer,
  placement_kind text,
  required integer,
  met integer,
  expiring integer,
  expired integer,
  missing integer,
  conditional integer,
  muted integer,
  docs_required integer,
  docs_met integer,
  stcw_required integer,
  stcw_met integer,
  quals_required integer,
  quals_met integer,
  fam_required integer,
  fam_met integer,
  status text,
  next_expiry date,
  dot_documents text,
  dot_qualifications text,
  issues jsonb
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH
  st AS (
    SELECT s.*,
           CASE
             WHEN s.state = 'expired' THEN 'expired'
             WHEN s.state = 'missing' THEN 'missing'
             WHEN s.state = 'expiring' AND NOT s.is_muted THEN 'expiring'
             WHEN s.state IN ('met', 'expiring') AND s.is_conditional THEN 'conditional'
             WHEN s.state IN ('met', 'expiring') AND s.missing_date THEN 'missing_date'
           END AS issue,
           (s.state IN ('met', 'expiring')) AS ok
    FROM public.crew_requirement_status_for(p_vessel_ids, p_on, p_profile_id) AS s
  ),
  agg AS (
    SELECT st.vessel_id, st.profile_id,
           (array_agg(st.position_id))[1] AS position_id,
           count(*)::integer AS required,
           count(*) FILTER (WHERE st.ok)::integer AS met,
           count(*) FILTER (WHERE st.state = 'expiring')::integer AS expiring,
           count(*) FILTER (WHERE st.state = 'expired')::integer AS expired,
           count(*) FILTER (WHERE st.state = 'missing')::integer AS missing,
           count(*) FILTER (WHERE st.ok AND st.is_conditional)::integer AS conditional,
           count(*) FILTER (WHERE st.state <> 'missing' AND st.is_muted)::integer AS muted,
           count(*) FILTER (WHERE st.issue = 'expiring')::integer AS expiring_open,
           count(*) FILTER (WHERE st.tab = 'documents')::integer AS docs_required,
           count(*) FILTER (WHERE st.tab = 'documents' AND st.ok)::integer AS docs_met,
           count(*) FILTER (WHERE st.tab = 'stcw')::integer AS stcw_required,
           count(*) FILTER (WHERE st.tab = 'stcw' AND st.ok)::integer AS stcw_met,
           count(*) FILTER (WHERE st.tab = 'qualifications')::integer AS quals_required,
           count(*) FILTER (WHERE st.tab = 'qualifications' AND st.ok)::integer AS quals_met,
           count(*) FILTER (WHERE st.tab = 'familiarisation')::integer AS fam_required,
           count(*) FILTER (WHERE st.tab = 'familiarisation' AND st.ok)::integer AS fam_met,
           count(*) FILTER (WHERE st.tab = 'documents' AND st.issue IN ('expired', 'missing'))::integer AS docs_bad,
           count(*) FILTER (WHERE st.tab = 'documents' AND st.issue IN ('expiring', 'conditional', 'missing_date'))::integer AS docs_warn,
           count(*) FILTER (WHERE st.tab IN ('stcw', 'qualifications') AND st.issue IN ('expired', 'missing'))::integer AS quals_bad,
           count(*) FILTER (WHERE st.tab IN ('stcw', 'qualifications') AND st.issue IN ('expiring', 'conditional', 'missing_date'))::integer AS quals_warn,
           min(st.next_expiry) FILTER (WHERE st.ok) AS next_expiry,
           coalesce(jsonb_agg(jsonb_build_object('row_id', st.row_id, 'label', st.row_label, 'tab', st.tab, 'state', st.state, 'reason', st.issue)
                              ORDER BY CASE st.issue WHEN 'expired' THEN 0 WHEN 'missing' THEN 1 WHEN 'expiring' THEN 2 WHEN 'conditional' THEN 3 ELSE 4 END,
                                       st.row_sort, st.row_id)
                    FILTER (WHERE st.issue IS NOT NULL), '[]'::jsonb) AS issues
    FROM st
    GROUP BY st.vessel_id, st.profile_id
  ),
  mem AS (
    SELECT vs.company_id, vs.id AS vessel_id, m.*
    FROM public.vessels AS vs
    CROSS JOIN LATERAL public.crew_vessel_members(vs.id, coalesce(p_on, current_date)) AS m
    WHERE vs.id = ANY (p_vessel_ids) AND (p_profile_id IS NULL OR m.profile_id = p_profile_id)
  ),
  placed AS (
    SELECT m.*,
           a.required, a.met, a.expiring, a.expired, a.missing, a.conditional, a.muted, a.expiring_open,
           a.docs_required, a.docs_met, a.stcw_required, a.stcw_met, a.quals_required, a.quals_met, a.fam_required, a.fam_met,
           a.docs_bad, a.docs_warn, a.quals_bad, a.quals_warn, a.next_expiry, a.issues,
           coalesce(a.position_id,
                    public.crew_position_for(m.company_id, m.vessel_id, m.position_text),
                    public.crew_position_for(m.company_id, m.vessel_id, m.rank_text)) AS pid
    FROM mem AS m
    LEFT JOIN agg AS a ON a.vessel_id = m.vessel_id AND a.profile_id = m.profile_id
  )
  SELECT pl.company_id, pl.vessel_id, pl.profile_id, pl.user_id,
         p.first_name, p.last_name, p.preferred_name,
         pos.id, pos.name, coalesce(pl.position_text, pl.rank_text), dep.key, pos.rank_tier,
         CASE WHEN pos.id IS NULL THEN NULL ELSE coalesce(pm.sort_order, pos.sort_order) END,
         pl.placement_kind,
         coalesce(pl.required, 0), coalesce(pl.met, 0), coalesce(pl.expiring, 0), coalesce(pl.expired, 0), coalesce(pl.missing, 0),
         coalesce(pl.conditional, 0), coalesce(pl.muted, 0),
         coalesce(pl.docs_required, 0), coalesce(pl.docs_met, 0), coalesce(pl.stcw_required, 0), coalesce(pl.stcw_met, 0),
         coalesce(pl.quals_required, 0), coalesce(pl.quals_met, 0), coalesce(pl.fam_required, 0), coalesce(pl.fam_met, 0),
         public.crew_compliance_status_decide(pl.expired, pl.missing, pl.expiring_open),
         pl.next_expiry,
         public.crew_compliance_dot(pl.docs_required, pl.docs_bad, pl.docs_warn),
         public.crew_compliance_dot(coalesce(pl.stcw_required, 0) + coalesce(pl.quals_required, 0), pl.quals_bad, pl.quals_warn),
         coalesce(pl.issues, '[]'::jsonb)
  FROM placed AS pl
  JOIN public.profiles AS p ON p.id = pl.profile_id
  LEFT JOIN public.positions AS pos ON pos.id = pl.pid
  LEFT JOIN public.position_manning AS pm ON pm.vessel_id = pl.vessel_id AND pm.position_id = pos.id
  LEFT JOIN LATERAL (
    SELECT d.key
    FROM public.departments AS d
    WHERE d.key = pos.department_key
       OR (pos.department_key IS NULL AND d.is_active
           AND (d.key = public.record_normalise_office(pl.department_text)
                OR public.record_normalise_office(d.label) = public.record_normalise_office(pl.department_text)))
    ORDER BY (d.key = pos.department_key) DESC NULLS LAST, d.sort_order
    LIMIT 1
  ) AS dep ON true
  ORDER BY pl.vessel_id, CASE WHEN pos.id IS NULL THEN NULL ELSE coalesce(pm.sort_order, pos.sort_order) END NULLS LAST,
           lower(p.last_name), lower(p.first_name), pl.profile_id
$$;

-- The held-by counts of the configuration matrix ("N options · held by
-- X"): per requirement, the crew of the vessel today (any position) who
-- hold a satisfier that counts (not rejected, removed or expired), or, for
-- a familiarisation requirement, a completed record of one of its
-- templates on the vessel. Internal.
CREATE OR REPLACE FUNCTION public.crew_requirement_held_by(p_vessel_id uuid, p_on date DEFAULT current_date)
RETURNS TABLE (row_id uuid, held_by integer)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH
  mem AS (
    SELECT m.profile_id, m.user_id FROM public.crew_vessel_members(p_vessel_id, coalesce(p_on, current_date)) AS m
  ),
  doc_held AS (
    SELECT s.row_id, cc.profile_id
    FROM public.crew_requirement_row_satisfiers(ARRAY[p_vessel_id]) AS s
    JOIN public.crew_certificates AS cc ON cc.document_type_id = s.type_id
    WHERE cc.deleted_at IS NULL
      AND cc.verification_status <> 'rejected'
      AND cc.profile_id IN (SELECT mem.profile_id FROM mem)
      AND (cc.no_expiry OR cc.expiry_date IS NULL OR cc.expiry_date >= coalesce(p_on, current_date))
  ),
  fam_held AS (
    SELECT o.row_id, mem.profile_id
    FROM public.crew_requirement_options AS o
    JOIN public.familiarization_records AS fr ON fr.template_id = o.familiarization_template_id AND fr.vessel_id = p_vessel_id
    JOIN mem ON (mem.profile_id = fr.profile_id OR mem.user_id = fr.user_id)
    WHERE o.vessel_id = p_vessel_id AND o.familiarization_template_id IS NOT NULL
      AND lower(fr.status) = 'completed'
  )
  SELECT r.id, count(DISTINCT h.profile_id)::integer
  FROM public.crew_requirement_rows AS r
  LEFT JOIN (SELECT * FROM doc_held UNION ALL SELECT * FROM fam_held) AS h ON h.row_id = r.id
  WHERE r.vessel_id = p_vessel_id
  GROUP BY r.id
$$;

-- ---------------------------------------------------------------- internal views (the service role's; not readable by the browser)

-- Every vessel, today. The service role's read of the engine (reports,
-- maintenance); the browser reads the gated views further down. Security
-- invoker like every build-out view (zz_platform/acl): only the service
-- role may select them and execute the engine, so a reader who is not the
-- service role gets 42501, never rows; their row types are the return
-- types of the definers below.
CREATE OR REPLACE VIEW public.crew_requirement_status_internal WITH (security_invoker = true) AS
  SELECT * FROM public.crew_requirement_status_for(ARRAY(SELECT v.id FROM public.vessels AS v), current_date, NULL);

CREATE OR REPLACE VIEW public.crew_compliance_summary_internal WITH (security_invoker = true) AS
  SELECT * FROM public.crew_compliance_summary_for(ARRAY(SELECT v.id FROM public.vessels AS v), current_date, NULL);

-- ---------------------------------------------------------------- the public contract (X5 agreement 5, D-X1-22)

-- The rows of the vessels where the caller holds
-- vessel.crew.crew_compliance.view (crew_cap_vessel_ids: reach, company,
-- active), today; nothing for an external viewer or without a JWT. The
-- security-invoker views below select from these, so a reader sees exactly
-- their vessels whatever the view is joined with.
CREATE OR REPLACE FUNCTION public.crew_requirement_status_rows()
RETURNS SETOF public.crew_requirement_status_internal
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  IF auth.uid() IS NULL OR public.crew_caller_is_external() THEN
    RETURN;
  END IF;
  v_ids := ARRAY(SELECT x FROM public.crew_cap_vessel_ids('vessel.crew.crew_compliance.view') AS x);
  IF cardinality(v_ids) = 0 THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM public.crew_requirement_status_for(v_ids, current_date, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.crew_compliance_summary_rows()
RETURNS SETOF public.crew_compliance_summary_internal
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  IF auth.uid() IS NULL OR public.crew_caller_is_external() THEN
    RETURN;
  END IF;
  v_ids := ARRAY(SELECT x FROM public.crew_cap_vessel_ids('vessel.crew.crew_compliance.view') AS x);
  IF cardinality(v_ids) = 0 THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM public.crew_compliance_summary_for(v_ids, current_date, NULL);
END;
$$;

CREATE OR REPLACE VIEW public.crew_requirement_status WITH (security_invoker = true) AS
  SELECT * FROM public.crew_requirement_status_rows();

CREATE OR REPLACE VIEW public.crew_compliance_summary WITH (security_invoker = true) AS
  SELECT * FROM public.crew_compliance_summary_rows();

-- ---------------------------------------------------------------- read RPCs (one gate per call)

-- The compliance summary of the vessel's crew today (the crew list dots,
-- the compliance page). Gate: vessel.crew.crew_compliance.view on the
-- vessel (crew_vessel_gate: P0002 unknown vessel, 42501 otherwise), no
-- external viewer.
CREATE OR REPLACE FUNCTION public.crew_vessel_compliance(p_vessel_id uuid)
RETURNS SETOF public.crew_compliance_summary_internal
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.crew_vessel_gate('vessel.crew.crew_compliance.view', p_vessel_id, 'You can''t see crew compliance on this vessel.');
  IF public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'You can''t see crew compliance on this vessel.';
  END IF;
  RETURN QUERY SELECT * FROM public.crew_compliance_summary_for(ARRAY[p_vessel_id], current_date, NULL);
END;
$$;

-- The requirement status rows of the vessel's crew today, or of one
-- person (the profile's "Missing required" block, the add dialog's
-- "Missing for current role"). Gate: vessel.crew.crew_compliance.view on
-- the vessel and no external viewer; or the caller's own rows with
-- vessel.crew.crew_certificates.view_own there. P0002 for an unknown
-- vessel or a person outside the vessel's company; a person who is not on
-- the vessel's crew has no rows.
CREATE OR REPLACE FUNCTION public.crew_vessel_requirement_status(p_vessel_id uuid, p_profile_id uuid DEFAULT NULL)
RETURNS SETOF public.crew_requirement_status_internal
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_view boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  IF p_vessel_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'vessel_required';
  END IF;
  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = p_vessel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'vessel_not_found', DETAIL = 'This vessel could not be found.';
  END IF;
  v_view := public.crew_vessel_cap('vessel.crew.crew_compliance.view', p_vessel_id) AND NOT public.crew_caller_is_external();
  IF NOT v_view THEN
    IF p_profile_id IS NULL OR p_profile_id IS DISTINCT FROM public.my_profile_id()
       OR NOT public.crew_vessel_cap('vessel.crew.crew_certificates.view_own', p_vessel_id) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'You can''t see crew compliance on this vessel.';
    END IF;
  END IF;
  IF p_profile_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = p_profile_id AND p.company_id = v_company) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'profile_not_found', DETAIL = 'This crew member could not be found.';
  END IF;
  RETURN QUERY SELECT * FROM public.crew_requirement_status_for(ARRAY[p_vessel_id], current_date, p_profile_id);
END;
$$;

-- The compliance summaries of several vessels today (fleet report R5,
-- platform plan contract 5; the columns are frozen in
-- src/modules/crew/types/db.pending.ts). Every id must be a vessel of the
-- caller's company that the caller reaches and holds
-- vessel.crew.crew_compliance.view on; any other id (unknown, foreign,
-- unreached, NULL) refuses the whole call with 42501 vessel_out_of_reach,
-- so the answer never says which ids exist. No external viewer. An empty
-- list answers no rows; more than 500 ids: 22023 too_many_vessels.
CREATE OR REPLACE FUNCTION public.crew_compliance_for_vessels(p_vessel_ids uuid[])
RETURNS SETOF public.crew_compliance_summary_internal
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed uuid[];
  v_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  IF p_vessel_ids IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'vessels_required';
  END IF;
  IF cardinality(p_vessel_ids) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'too_many_vessels', DETAIL = 'Choose at most 500 vessels.';
  END IF;
  IF cardinality(p_vessel_ids) = 0 THEN
    RETURN;
  END IF;
  IF public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'vessel_out_of_reach', DETAIL = 'You can''t see crew compliance on one or more of these vessels.';
  END IF;
  v_allowed := ARRAY(SELECT x FROM public.crew_cap_vessel_ids('vessel.crew.crew_compliance.view') AS x);
  IF EXISTS (SELECT 1 FROM unnest(p_vessel_ids) AS i(id) WHERE i.id IS NULL OR NOT (i.id = ANY (v_allowed))) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'vessel_out_of_reach', DETAIL = 'You can''t see crew compliance on one or more of these vessels.';
  END IF;
  v_ids := ARRAY(SELECT DISTINCT i.id FROM unnest(p_vessel_ids) AS i(id));
  RETURN QUERY SELECT * FROM public.crew_compliance_summary_for(v_ids, current_date, NULL);
END;
$$;

-- The vessel's requirement configuration (Compliance > Configuration):
-- the caller's rights, the typed settings, the positions (the listed ones
-- and any ticked one), the rows with their options, ticks and held-by
-- counts, and the vessel's familiarisation templates. Gate:
-- vessel.crew.crew_compliance.view, no external viewer. One jsonb object
-- (TS RequirementsConfigJson).
CREATE OR REPLACE FUNCTION public.crew_requirements_config(p_vessel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_settings jsonb;
  v_positions jsonb;
  v_rows jsonb;
  v_templates jsonb;
BEGIN
  v_company := public.crew_vessel_gate('vessel.crew.crew_compliance.view', p_vessel_id, 'You can''t see crew compliance on this vessel.');
  IF public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'You can''t see crew compliance on this vessel.';
  END IF;

  SELECT jsonb_build_object(
           'is_passenger_ship', coalesce(s.is_passenger_ship, false),
           'crew_uploads_enabled', coalesce(s.crew_uploads_enabled, false),
           'transfer_requires_fleet_approval', coalesce(s.transfer_requires_fleet_approval, false),
           'requirements_seeded_at', s.requirements_seeded_at,
           'updated_at', s.updated_at)
    INTO v_settings
  FROM (SELECT 1) AS one
  LEFT JOIN public.vessel_crew_settings AS s ON s.vessel_id = p_vessel_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'position_id', x.id, 'key', x.key, 'name', x.name, 'department_key', x.department_key,
           'department_label', x.department_label, 'department_sort', x.department_sort, 'rank_tier', x.rank_tier,
           'sort_order', x.sort_order, 'is_listed', x.is_listed)
         ORDER BY x.is_listed DESC, x.sort_order, x.name, x.id), '[]'::jsonb)
    INTO v_positions
  FROM (
    SELECT p.id, p.key, p.name, p.department_key, d.label AS department_label, d.sort_order AS department_sort, p.rank_tier,
           coalesce(pm.sort_order, p.sort_order) AS sort_order, coalesce(pm.is_listed, false) AS is_listed
    FROM public.positions AS p
    JOIN public.departments AS d ON d.key = p.department_key
    LEFT JOIN public.position_manning AS pm ON pm.vessel_id = p_vessel_id AND pm.position_id = p.id
    WHERE p.is_active
      AND (p.company_id IS NULL OR (p.company_id = v_company AND (p.vessel_id IS NULL OR p.vessel_id = p_vessel_id)))
      AND (coalesce(pm.is_listed, false)
           OR EXISTS (SELECT 1 FROM public.crew_requirement_positions AS rp WHERE rp.vessel_id = p_vessel_id AND rp.position_id = p.id))
  ) AS x;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'group_key', r.group_key, 'label', r.label, 'kind', r.kind, 'sort_order', r.sort_order, 'seed_key', r.seed_key,
           'tab', public.crew_requirement_tab(r.kind, r.group_key, (
             SELECT cat.tab FROM public.crew_requirement_options AS o
             JOIN public.crew_document_types AS t ON t.id = o.document_type_id
             JOIN public.crew_document_categories AS cat ON cat.key = t.category_key
             WHERE o.row_id = r.id ORDER BY o.sort_order, o.id LIMIT 1)),
           'options', coalesce((
             SELECT jsonb_agg(jsonb_build_object(
                      'id', o.id, 'document_type_id', o.document_type_id, 'familiarization_template_id', o.familiarization_template_id,
                      'sort_order', o.sort_order, 'name', coalesce(t.name, ft.template_name), 'code', t.code, 'abbreviation', t.abbreviation,
                      'category_key', t.category_key, 'tab', cat.tab, 'is_company_type', t.company_id IS NOT NULL)
                    ORDER BY o.sort_order, o.id)
             FROM public.crew_requirement_options AS o
             LEFT JOIN public.crew_document_types AS t ON t.id = o.document_type_id
             LEFT JOIN public.crew_document_categories AS cat ON cat.key = t.category_key
             LEFT JOIN public.familiarization_templates AS ft ON ft.id = o.familiarization_template_id
             WHERE o.row_id = r.id), '[]'::jsonb),
           'position_ids', coalesce((
             SELECT jsonb_agg(rp.position_id ORDER BY rp.position_id) FROM public.crew_requirement_positions AS rp WHERE rp.row_id = r.id), '[]'::jsonb),
           'held_by', coalesce(h.held_by, 0))
         ORDER BY r.sort_order, r.label, r.id), '[]'::jsonb)
    INTO v_rows
  FROM public.crew_requirement_rows AS r
  LEFT JOIN public.crew_requirement_held_by(p_vessel_id, current_date) AS h ON h.row_id = r.id
  WHERE r.vessel_id = p_vessel_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', ft.id, 'name', ft.template_name, 'is_active', ft.is_active)
                            ORDER BY ft.is_active DESC, ft.template_name, ft.id), '[]'::jsonb)
    INTO v_templates
  FROM public.familiarization_templates AS ft
  WHERE ft.vessel_id = p_vessel_id OR (ft.vessel_id IS NULL AND ft.company_id = v_company);

  RETURN jsonb_build_object(
    'vessel_id', p_vessel_id,
    'company_id', v_company,
    'can_admin', coalesce(public.crew_vessel_cap('vessel.crew.crew_compliance.admin', p_vessel_id), false),
    'can_admin_company', coalesce(public.has_capability_for(auth.uid(), 'vessel.crew.crew_compliance.admin', v_company, NULL), false),
    'settings', v_settings,
    'positions', v_positions,
    'rows', v_rows,
    'templates', v_templates);
END;
$$;

-- ---------------------------------------------------------------- bulk sets (internal)

-- Ensures the rows of a STORM set exist on the vessel and are ticked for
-- every position listed there (position_manning.is_listed, active):
--   stcw_basic      PST, FPFF, EFA, PSSR (STCW A-VI/1; "Add STCW basic set")
--   stcw_passenger  crowd management, crisis management and human
--                   behaviour, passenger service safety (STCW A-V/2; the
--                   "Passenger ship?" toggle)
-- by seed_key, so it never adds a row twice; a row an administrator
-- edited keeps its options. Returns the rows and ticks it added.
CREATE OR REPLACE FUNCTION public.crew_requirement_set_add(p_vessel_id uuid, p_set text, p_actor uuid)
RETURNS TABLE (rows_added integer, cells_added integer)
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_company uuid;
  v_item record;
  v_row_id uuid;
  v_rows integer := 0;
  v_cells integer := 0;
  v_n integer;
BEGIN
  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = p_vessel_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'vessel_not_found';
  END IF;
  IF p_set NOT IN ('stcw_basic', 'stcw_passenger') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'requirement_set_unknown';
  END IF;
  FOR v_item IN
    SELECT x.code, x.type_key, x.n, t.id AS type_id, t.name, cat.sort_order AS cat_sort
    FROM (VALUES
      ('stcw_basic', 'pst', 'stcw_pst', 1), ('stcw_basic', 'fpff', 'stcw_fpff', 2),
      ('stcw_basic', 'efa', 'stcw_efa', 3), ('stcw_basic', 'pssr', 'stcw_pssr', 4),
      ('stcw_passenger', 'crowd', 'stcw_crowd_management', 1), ('stcw_passenger', 'crisis', 'stcw_crisis_management', 2),
      ('stcw_passenger', 'safety', 'stcw_passenger_service_safety', 3)
    ) AS x(set_key, code, type_key, n)
    JOIN public.crew_document_types AS t ON t.company_id IS NULL AND t.key = x.type_key
    JOIN public.crew_document_categories AS cat ON cat.key = t.category_key
    WHERE x.set_key = p_set
    ORDER BY x.n
  LOOP
    v_row_id := NULL;
    INSERT INTO public.crew_requirement_rows (company_id, vessel_id, group_key, label, kind, sort_order, seed_key, created_by, updated_by)
    VALUES (v_company, p_vessel_id, p_set, v_item.name, 'document', v_item.cat_sort * 10 + v_item.n, p_set || '.' || v_item.code, p_actor, p_actor)
    ON CONFLICT (vessel_id, seed_key) DO NOTHING
    RETURNING id INTO v_row_id;
    IF v_row_id IS NOT NULL THEN
      v_rows := v_rows + 1;
      INSERT INTO public.crew_requirement_options (company_id, vessel_id, row_id, document_type_id, sort_order)
      VALUES (v_company, p_vessel_id, v_row_id, v_item.type_id, 0)
      ON CONFLICT (row_id, document_type_id) DO NOTHING;
    ELSE
      SELECT r.id INTO v_row_id FROM public.crew_requirement_rows AS r
      WHERE r.vessel_id = p_vessel_id AND r.seed_key = p_set || '.' || v_item.code;
    END IF;
    INSERT INTO public.crew_requirement_positions (company_id, vessel_id, row_id, position_id, created_by)
    SELECT v_company, p_vessel_id, v_row_id, pm.position_id, p_actor
    FROM public.position_manning AS pm
    JOIN public.positions AS p ON p.id = pm.position_id AND p.is_active
    WHERE pm.vessel_id = p_vessel_id AND pm.is_listed
    ON CONFLICT (row_id, position_id) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_cells := v_cells + v_n;
  END LOOP;
  RETURN QUERY SELECT v_rows, v_cells;
END;
$$;

-- ---------------------------------------------------------------- write RPCs (vessel.crew.crew_compliance.admin on the vessel)

-- The write gate: crew_compliance.admin on the vessel (P0002 unknown
-- vessel, 42501 otherwise) and no external viewer. Returns the company.
CREATE OR REPLACE FUNCTION public.crew_requirement_admin_gate(p_vessel_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  v_company := public.crew_vessel_gate('vessel.crew.crew_compliance.admin', p_vessel_id,
    'Only a crew compliance administrator of this vessel can change its requirements.');
  IF public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted',
      DETAIL = 'Only a crew compliance administrator of this vessel can change its requirements.';
  END IF;
  RETURN v_company;
END;
$$;

-- Creates (p_row_id NULL) or changes a requirement of the vessel.
-- p_payload: {group_key, label, kind?, sort_order?, options?: [{document_type_id}
-- | {familiarization_template_id}], position_ids?: [uuid]}. options replace
-- the row's options (1 to 20, required on create; document types of STORM
-- or the company, active; templates of a vessel of the company);
-- position_ids replace its ticks (positions visible on the vessel). A
-- familiarisation requirement is in the familiarisation group. Refusals:
-- P0002 requirement_not_found; 22023 payload_invalid, group_invalid,
-- label_invalid, kind_invalid, kind_group_mismatch, sort_order_invalid,
-- options_required, options_too_many, option_invalid,
-- document_type_unknown, template_unknown, positions_invalid,
-- position_unknown (HINT names the field). Returns the row.
CREATE OR REPLACE FUNCTION public.crew_requirement_row_save(p_vessel_id uuid, p_row_id uuid, p_payload jsonb)
RETURNS public.crew_requirement_rows
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_old public.crew_requirement_rows;
  v_row public.crew_requirement_rows;
  v_group text;
  v_label text;
  v_kind text;
  v_sort integer;
  v_opt jsonb;
  v_opt_types uuid[] := ARRAY[]::uuid[];
  v_opt_templates uuid[] := ARRAY[]::uuid[];
  v_positions uuid[];
  v_id uuid;
  v_el jsonb;
  v_i integer := 0;
BEGIN
  v_company := public.crew_requirement_admin_gate(p_vessel_id);
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'payload_invalid';
  END IF;
  IF p_row_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.crew_requirement_rows AS r WHERE r.id = p_row_id AND r.vessel_id = p_vessel_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'requirement_not_found', DETAIL = 'This requirement could not be found on the vessel.';
    END IF;
  END IF;

  v_group := coalesce(nullif(btrim(p_payload->>'group_key'), ''), v_old.group_key);
  v_kind := coalesce(nullif(btrim(p_payload->>'kind'), ''), CASE WHEN v_group = 'familiarisation' THEN 'familiarisation' END, v_old.kind, 'document');
  IF v_group IS NULL AND v_kind = 'familiarisation' THEN
    v_group := 'familiarisation';
  END IF;
  IF v_group IS NULL OR v_group NOT IN ('stcw_basic', 'survival_craft', 'advanced_training', 'medical', 'security', 'stcw_passenger',
                                        'coc_gmdss', 'deck_engineering', 'navigation_safety', 'documents', 'familiarisation', 'custom') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'group_invalid', DETAIL = 'Choose a requirement group.', HINT = 'group_key';
  END IF;
  IF v_kind NOT IN ('document', 'familiarisation') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'kind_invalid', HINT = 'kind';
  END IF;
  IF (v_kind = 'familiarisation') <> (v_group = 'familiarisation') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'kind_group_mismatch',
      DETAIL = 'A familiarisation requirement goes in the Familiarisation group, and only there.', HINT = 'group_key';
  END IF;
  v_label := coalesce(btrim(p_payload->>'label'), v_old.label);
  IF v_label IS NULL OR length(v_label) < 1 OR length(v_label) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'label_invalid', DETAIL = 'Give the requirement a name of 1 to 120 characters.', HINT = 'label';
  END IF;
  IF p_payload ? 'sort_order' AND jsonb_typeof(p_payload->'sort_order') <> 'null' THEN
    IF jsonb_typeof(p_payload->'sort_order') <> 'number' OR (p_payload->>'sort_order') !~ '^[0-9]{1,6}$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'sort_order_invalid', HINT = 'sort_order';
    END IF;
    v_sort := (p_payload->>'sort_order')::integer;
  ELSE
    v_sort := coalesce(v_old.sort_order,
      (SELECT least(coalesce(max(r.sort_order), 0) + 10, 999999) FROM public.crew_requirement_rows AS r WHERE r.vessel_id = p_vessel_id));
  END IF;

  -- Options (in order, duplicates dropped).
  IF p_payload ? 'options' THEN
    v_opt := p_payload->'options';
    IF jsonb_typeof(v_opt) <> 'array' OR jsonb_array_length(v_opt) = 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'options_required', DETAIL = 'Choose at least one document or familiarisation that satisfies it.', HINT = 'options';
    END IF;
    IF jsonb_array_length(v_opt) > 20 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'options_too_many', DETAIL = 'A requirement takes at most 20 options.', HINT = 'options';
    END IF;
    FOR v_el IN SELECT e FROM jsonb_array_elements(v_opt) AS e LOOP
      BEGIN
        IF jsonb_typeof(v_el) <> 'object' THEN
          RAISE EXCEPTION USING ERRCODE = '22P02';
        END IF;
        IF v_kind = 'document' THEN
          v_id := (v_el->>'document_type_id')::uuid;
          IF v_id IS NULL OR v_el ? 'familiarization_template_id' THEN
            RAISE EXCEPTION USING ERRCODE = '22P02';
          END IF;
          IF NOT (v_id = ANY (v_opt_types)) THEN
            v_opt_types := v_opt_types || v_id;
          END IF;
        ELSE
          v_id := (v_el->>'familiarization_template_id')::uuid;
          IF v_id IS NULL OR v_el ? 'document_type_id' THEN
            RAISE EXCEPTION USING ERRCODE = '22P02';
          END IF;
          IF NOT (v_id = ANY (v_opt_templates)) THEN
            v_opt_templates := v_opt_templates || v_id;
          END IF;
        END IF;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'option_invalid',
          DETAIL = CASE WHEN v_kind = 'document' THEN 'Each option is a document type.' ELSE 'Each option is a familiarisation.' END, HINT = 'options';
      END;
    END LOOP;
    IF EXISTS (
      SELECT 1 FROM unnest(v_opt_types) AS x(id)
      WHERE NOT EXISTS (SELECT 1 FROM public.crew_document_types AS t
                        WHERE t.id = x.id AND t.is_active AND (t.company_id IS NULL OR t.company_id = v_company))
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'document_type_unknown', DETAIL = 'One of the document types is not in the catalogue.', HINT = 'options';
    END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(v_opt_templates) AS x(id)
      WHERE NOT EXISTS (SELECT 1 FROM public.familiarization_templates AS ft JOIN public.vessels AS v ON v.id = ft.vessel_id
                        WHERE ft.id = x.id AND v.company_id = v_company)
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'template_unknown', DETAIL = 'One of the familiarisations could not be found.', HINT = 'options';
    END IF;
  ELSIF p_row_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'options_required', DETAIL = 'Choose at least one document or familiarisation that satisfies it.', HINT = 'options';
  ELSIF v_kind IS DISTINCT FROM v_old.kind THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'options_required', DETAIL = 'Choose the options of the new kind.', HINT = 'options';
  END IF;

  -- Positions.
  IF p_payload ? 'position_ids' THEN
    IF jsonb_typeof(p_payload->'position_ids') <> 'array' OR jsonb_array_length(p_payload->'position_ids') > 500 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'positions_invalid', HINT = 'position_ids';
    END IF;
    BEGIN
      v_positions := ARRAY(SELECT DISTINCT e::uuid FROM jsonb_array_elements_text(p_payload->'position_ids') AS e);
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'positions_invalid', HINT = 'position_ids';
    END;
    IF EXISTS (
      SELECT 1 FROM unnest(v_positions) AS x(id)
      WHERE x.id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.positions AS p
        WHERE p.id = x.id AND p.is_active
          AND (p.company_id IS NULL OR (p.company_id = v_company AND (p.vessel_id IS NULL OR p.vessel_id = p_vessel_id))))
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'position_unknown', DETAIL = 'One of the positions is not one of this vessel''s.', HINT = 'position_ids';
    END IF;
  END IF;

  -- Write: options of the old kind go first, so the row may change kind.
  IF p_payload ? 'options' AND p_row_id IS NOT NULL THEN
    DELETE FROM public.crew_requirement_options AS o WHERE o.row_id = p_row_id;
  END IF;
  IF p_row_id IS NULL THEN
    INSERT INTO public.crew_requirement_rows (company_id, vessel_id, group_key, label, kind, sort_order, created_by, updated_by)
    VALUES (v_company, p_vessel_id, v_group, v_label, v_kind, v_sort, v_uid, v_uid)
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.crew_requirement_rows AS r
    SET group_key = v_group, label = v_label, kind = v_kind, sort_order = v_sort, updated_by = v_uid
    WHERE r.id = p_row_id
    RETURNING * INTO v_row;
  END IF;
  IF p_payload ? 'options' THEN
    INSERT INTO public.crew_requirement_options (company_id, vessel_id, row_id, document_type_id, sort_order)
    SELECT v_company, p_vessel_id, v_row.id, x.id, (x.n - 1)::integer
    FROM unnest(v_opt_types) WITH ORDINALITY AS x(id, n);
    INSERT INTO public.crew_requirement_options (company_id, vessel_id, row_id, familiarization_template_id, sort_order)
    SELECT v_company, p_vessel_id, v_row.id, x.id, (x.n - 1)::integer
    FROM unnest(v_opt_templates) WITH ORDINALITY AS x(id, n);
  END IF;
  IF v_positions IS NOT NULL THEN
    DELETE FROM public.crew_requirement_positions AS rp WHERE rp.row_id = v_row.id AND NOT (rp.position_id = ANY (v_positions));
    INSERT INTO public.crew_requirement_positions (company_id, vessel_id, row_id, position_id, created_by)
    SELECT v_company, p_vessel_id, v_row.id, x.id, v_uid FROM unnest(v_positions) AS x(id)
    ON CONFLICT (row_id, position_id) DO NOTHING;
  END IF;
  RETURN v_row;
END;
$$;

-- Removes a requirement of the vessel (its options and ticks go with it).
-- P0002 requirement_not_found. Returns its id.
CREATE OR REPLACE FUNCTION public.crew_requirement_row_delete(p_vessel_id uuid, p_row_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.crew_requirement_admin_gate(p_vessel_id);
  DELETE FROM public.crew_requirement_rows AS r WHERE r.id = p_row_id AND r.vessel_id = p_vessel_id RETURNING r.id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'requirement_not_found', DETAIL = 'This requirement could not be found on the vessel.';
  END IF;
  RETURN v_id;
END;
$$;

-- Sets matrix cells in one transaction (the configuration's staged
-- edits): p_cells is an array of {row_id, position_id, required}; each row
-- on the vessel (P0002 requirement_not_found), each position visible there
-- (22023 position_unknown), each cell once (22023 cells_duplicate), 1 to
-- 2000 cells (22023 cells_required / cells_too_many / cells_invalid).
-- Returns the number of cells applied (the client checks it is the number
-- it sent).
CREATE OR REPLACE FUNCTION public.crew_requirement_cell_set(p_vessel_id uuid, p_cells jsonb)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_el jsonb;
  v_rows uuid[] := ARRAY[]::uuid[];
  v_positions uuid[] := ARRAY[]::uuid[];
  v_required boolean[] := ARRAY[]::boolean[];
BEGIN
  v_company := public.crew_requirement_admin_gate(p_vessel_id);
  IF p_cells IS NULL OR jsonb_typeof(p_cells) <> 'array' OR jsonb_array_length(p_cells) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'cells_required', HINT = 'cells';
  END IF;
  IF jsonb_array_length(p_cells) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'cells_too_many', DETAIL = 'Save at most 2000 cells at once.', HINT = 'cells';
  END IF;
  FOR v_el IN SELECT e FROM jsonb_array_elements(p_cells) AS e LOOP
    BEGIN
      IF jsonb_typeof(v_el) <> 'object' OR jsonb_typeof(v_el->'required') IS DISTINCT FROM 'boolean'
         OR (v_el->>'row_id') IS NULL OR (v_el->>'position_id') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22P02';
      END IF;
      v_rows := v_rows || (v_el->>'row_id')::uuid;
      v_positions := v_positions || (v_el->>'position_id')::uuid;
      v_required := v_required || (v_el->>'required')::boolean;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'cells_invalid',
        DETAIL = 'Each cell names a requirement, a position and whether it is required.', HINT = 'cells';
    END;
  END LOOP;
  IF EXISTS (SELECT 1 FROM unnest(v_rows, v_positions) AS c(row_id, position_id) GROUP BY c.row_id, c.position_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'cells_duplicate', DETAIL = 'Each cell is sent once.', HINT = 'cells';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_rows) AS c(row_id)
             WHERE NOT EXISTS (SELECT 1 FROM public.crew_requirement_rows AS r WHERE r.id = c.row_id AND r.vessel_id = p_vessel_id)) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'requirement_not_found', DETAIL = 'A requirement could not be found on the vessel.';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_positions) AS c(position_id)
             WHERE NOT EXISTS (SELECT 1 FROM public.positions AS p
                               WHERE p.id = c.position_id AND p.is_active
                                 AND (p.company_id IS NULL OR (p.company_id = v_company AND (p.vessel_id IS NULL OR p.vessel_id = p_vessel_id))))) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'position_unknown', DETAIL = 'One of the positions is not one of this vessel''s.', HINT = 'cells';
  END IF;
  DELETE FROM public.crew_requirement_positions AS rp
  USING unnest(v_rows, v_positions, v_required) AS c(row_id, position_id, required)
  WHERE NOT c.required AND rp.row_id = c.row_id AND rp.position_id = c.position_id;
  INSERT INTO public.crew_requirement_positions (company_id, vessel_id, row_id, position_id, created_by)
  SELECT v_company, p_vessel_id, c.row_id, c.position_id, v_uid
  FROM unnest(v_rows, v_positions, v_required) AS c(row_id, position_id, required)
  WHERE c.required
  ON CONFLICT (row_id, position_id) DO NOTHING;
  RETURN cardinality(v_rows);
END;
$$;

-- A row's bulk action: 'require_all' ticks every position listed on the
-- vessel, 'clear_all' removes every tick (22023 action_invalid; P0002
-- requirement_not_found). Returns the number of ticked positions after.
CREATE OR REPLACE FUNCTION public.crew_requirement_row_bulk(p_vessel_id uuid, p_row_id uuid, p_action text)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_n integer;
BEGIN
  v_company := public.crew_requirement_admin_gate(p_vessel_id);
  IF p_action IS NULL OR p_action NOT IN ('require_all', 'clear_all') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'action_invalid', HINT = 'action';
  END IF;
  PERFORM 1 FROM public.crew_requirement_rows AS r WHERE r.id = p_row_id AND r.vessel_id = p_vessel_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'requirement_not_found', DETAIL = 'This requirement could not be found on the vessel.';
  END IF;
  IF p_action = 'clear_all' THEN
    DELETE FROM public.crew_requirement_positions AS rp WHERE rp.row_id = p_row_id;
  ELSE
    INSERT INTO public.crew_requirement_positions (company_id, vessel_id, row_id, position_id, created_by)
    SELECT v_company, p_vessel_id, p_row_id, pm.position_id, v_uid
    FROM public.position_manning AS pm
    JOIN public.positions AS p ON p.id = pm.position_id AND p.is_active
    WHERE pm.vessel_id = p_vessel_id AND pm.is_listed
    ON CONFLICT (row_id, position_id) DO NOTHING;
  END IF;
  SELECT count(*)::integer INTO v_n FROM public.crew_requirement_positions AS rp WHERE rp.row_id = p_row_id;
  RETURN v_n;
END;
$$;

-- "Add STCW basic set (all positions)" (W5 §1): PST, FPFF, EFA and PSSR,
-- ticked for every listed position; rows already there gain the missing
-- ticks. Returns the rows and ticks added.
CREATE OR REPLACE FUNCTION public.crew_requirements_add_stcw_basic(p_vessel_id uuid)
RETURNS TABLE (rows_added integer, cells_added integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.crew_requirement_admin_gate(p_vessel_id);
  RETURN QUERY SELECT s.rows_added, s.cells_added FROM public.crew_requirement_set_add(p_vessel_id, 'stcw_basic', auth.uid()) AS s;
END;
$$;

-- "Passenger ship?" (W5 §1, C13): records the vessel flag and adds the
-- STCW V/2 rows (crowd management, crisis management and human behaviour,
-- passenger service safety) ticked for every listed position, or removes
-- them (by seed key). 22023 value_required for a NULL. Returns the flag and
-- the rows added and removed.
CREATE OR REPLACE FUNCTION public.crew_vessel_set_passenger(p_vessel_id uuid, p_on boolean)
RETURNS TABLE (is_passenger_ship boolean, rows_added integer, rows_removed integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_added integer := 0;
  v_removed integer := 0;
BEGIN
  v_company := public.crew_requirement_admin_gate(p_vessel_id);
  IF p_on IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'value_required', HINT = 'is_passenger_ship';
  END IF;
  INSERT INTO public.vessel_crew_settings (vessel_id, company_id, is_passenger_ship, updated_by)
  VALUES (p_vessel_id, v_company, p_on, v_uid)
  ON CONFLICT (vessel_id) DO UPDATE SET is_passenger_ship = EXCLUDED.is_passenger_ship, updated_by = EXCLUDED.updated_by;
  IF p_on THEN
    SELECT s.rows_added INTO v_added FROM public.crew_requirement_set_add(p_vessel_id, 'stcw_passenger', v_uid) AS s;
  ELSE
    DELETE FROM public.crew_requirement_rows AS r
    WHERE r.vessel_id = p_vessel_id AND r.seed_key IN ('stcw_passenger.crowd', 'stcw_passenger.crisis', 'stcw_passenger.safety');
    GET DIAGNOSTICS v_removed = ROW_COUNT;
  END IF;
  RETURN QUERY SELECT p_on, coalesce(v_added, 0), v_removed;
END;
$$;

-- The vessel's crew settings (C13, D-X1-12): p_patch sets
-- crew_uploads_enabled and / or transfer_requires_fleet_approval
-- (booleans). 22023 patch_empty, setting_unknown (HINT the key),
-- setting_invalid; the passenger flag has its own RPC (22023
-- use_passenger_toggle). Returns the settings row.
CREATE OR REPLACE FUNCTION public.crew_vessel_settings_save(p_vessel_id uuid, p_patch jsonb)
RETURNS public.vessel_crew_settings
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_key text;
  v_row public.vessel_crew_settings;
BEGIN
  v_company := public.crew_requirement_admin_gate(p_vessel_id);
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'patch_empty';
  END IF;
  FOR v_key IN SELECT k FROM jsonb_object_keys(p_patch) AS k LOOP
    IF v_key = 'is_passenger_ship' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'use_passenger_toggle',
        DETAIL = 'Set the passenger ship flag with its own switch: it also adds or removes the STCW V/2 requirements.', HINT = v_key;
    END IF;
    IF v_key NOT IN ('crew_uploads_enabled', 'transfer_requires_fleet_approval') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'setting_unknown', HINT = v_key;
    END IF;
    IF jsonb_typeof(p_patch->v_key) <> 'boolean' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'setting_invalid', HINT = v_key;
    END IF;
  END LOOP;
  INSERT INTO public.vessel_crew_settings AS s (vessel_id, company_id, crew_uploads_enabled, transfer_requires_fleet_approval, updated_by)
  VALUES (p_vessel_id, v_company,
          coalesce((p_patch->>'crew_uploads_enabled')::boolean, false),
          coalesce((p_patch->>'transfer_requires_fleet_approval')::boolean, false),
          v_uid)
  ON CONFLICT (vessel_id) DO UPDATE SET
    crew_uploads_enabled = CASE WHEN p_patch ? 'crew_uploads_enabled' THEN EXCLUDED.crew_uploads_enabled ELSE s.crew_uploads_enabled END,
    transfer_requires_fleet_approval = CASE WHEN p_patch ? 'transfer_requires_fleet_approval' THEN EXCLUDED.transfer_requires_fleet_approval ELSE s.transfer_requires_fleet_approval END,
    updated_by = EXCLUDED.updated_by
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------- company-level writes (the company-level crew_compliance.admin)

-- The company-level gate: a signed-in, active caller of a company, no
-- external viewer, holding vessel.crew.crew_compliance.admin at company
-- level (has_capability_for with no vessel). Returns the company.
CREATE OR REPLACE FUNCTION public.crew_compliance_company_gate(p_detail text)
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
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  v_company := public.get_user_company_id(v_uid);
  IF v_company IS NULL OR public.crew_caller_is_external()
     OR NOT coalesce(public.has_capability_for(v_uid, 'vessel.crew.crew_compliance.admin', v_company, NULL), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = p_detail;
  END IF;
  RETURN v_company;
END;
$$;

-- A document type of the caller's company (gap/04 C23, C33 "Add
-- qualification"): in an active category, a name of 1 to 120 characters
-- (22023 name_invalid), an optional code (A-Z, 0-9 and '-', up to 24;
-- 22023 code_invalid) and abbreviation (up to 24; 22023
-- abbreviation_invalid), default validity 0 to 240 months (22023
-- validity_invalid), an optional STCW reference (up to 60; 22023
-- reference_invalid). Refused when a type of STORM or the company already
-- has the name, key or code (22023 document_type_exists, DETAIL naming
-- it). The expiry item type follows the category (passports, visas, work
-- permits, medical, other documents; else a qualification). Returns the
-- row.
CREATE OR REPLACE FUNCTION public.crew_document_type_create(
  p_category_key text,
  p_name text,
  p_code text DEFAULT NULL,
  p_abbreviation text DEFAULT NULL,
  p_default_validity_months integer DEFAULT NULL,
  p_stcw_reference text DEFAULT NULL
)
RETURNS public.crew_document_types
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_code text := nullif(upper(btrim(coalesce(p_code, ''))), '');
  v_abbr text := nullif(btrim(coalesce(p_abbreviation, '')), '');
  v_ref text := nullif(btrim(coalesce(p_stcw_reference, '')), '');
  v_key text;
  v_cat record;
  v_item text;
  v_existing text;
  v_row public.crew_document_types;
BEGIN
  v_company := public.crew_compliance_company_gate('Only a company-wide crew compliance administrator can add document types.');
  SELECT c.key, c.tab INTO v_cat FROM public.crew_document_categories AS c WHERE c.key = p_category_key AND c.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'category_unknown', DETAIL = 'Choose a category.', HINT = 'category_key';
  END IF;
  IF length(v_name) < 1 OR length(v_name) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'name_invalid', DETAIL = 'Give the document type a name of 1 to 120 characters.', HINT = 'name';
  END IF;
  v_key := public.crew_document_legacy_key(v_name);
  IF v_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'name_invalid', DETAIL = 'Give the document type a name with letters or digits in it.', HINT = 'name';
  END IF;
  IF v_key !~ '^[a-z]' THEN
    v_key := 'type_' || v_key;
  END IF;
  v_key := rtrim(left(v_key, 63), '_');
  IF length(v_key) < 2 THEN
    v_key := v_key || '_type';
  END IF;
  IF v_code IS NOT NULL AND v_code !~ '^[A-Z0-9][A-Z0-9-]{0,23}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'code_invalid', DETAIL = 'A code has up to 24 letters, digits and dashes.', HINT = 'code';
  END IF;
  IF v_abbr IS NOT NULL AND length(v_abbr) > 24 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'abbreviation_invalid', DETAIL = 'An abbreviation has up to 24 characters.', HINT = 'abbreviation';
  END IF;
  IF p_default_validity_months IS NOT NULL AND (p_default_validity_months < 0 OR p_default_validity_months > 240) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'validity_invalid', DETAIL = 'A default validity is 0 to 240 months.', HINT = 'default_validity_months';
  END IF;
  IF v_ref IS NOT NULL AND length(v_ref) > 60 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reference_invalid', DETAIL = 'A reference has up to 60 characters.', HINT = 'stcw_reference';
  END IF;
  SELECT t.name INTO v_existing
  FROM public.crew_document_types AS t
  WHERE (t.company_id IS NULL OR t.company_id = v_company)
    AND (t.key = v_key
         OR public.crew_document_legacy_key(t.name) = public.crew_document_legacy_key(v_name)
         OR (v_code IS NOT NULL AND upper(t.code) = v_code))
  ORDER BY (t.company_id IS NULL), t.sort_order, t.id
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'document_type_exists',
      DETAIL = format('A document type called "%s" already exists. Use it instead.', v_existing), HINT = 'name';
  END IF;
  v_item := CASE p_category_key
    WHEN 'passports' THEN 'passport'
    WHEN 'visas' THEN 'visa'
    WHEN 'work_permits' THEN 'work_authorisation'
    WHEN 'medical_fitness' THEN 'medical'
    WHEN 'health_records' THEN 'medical'
    WHEN 'seafarer_identity' THEN 'crew_document'
    WHEN 'identity_other' THEN 'crew_document'
    WHEN 'licences' THEN 'crew_document'
    WHEN 'other_documents' THEN 'crew_document'
    ELSE 'crew_qualification'
  END;
  BEGIN
    INSERT INTO public.crew_document_types (company_id, category_key, key, name, code, abbreviation, stcw_reference, field_schema,
                                            default_validity_months, expiry_item_type, is_identity, is_medical_fitness, is_active,
                                            sort_order, created_by, updated_by)
    VALUES (v_company, p_category_key, v_key, v_name, v_code, v_abbr, v_ref, '{"issuing_office":"optional"}'::jsonb,
            p_default_validity_months, v_item, v_item = 'passport', false, true, 900, v_uid, v_uid)
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'document_type_exists',
      DETAIL = format('A document type called "%s" already exists. Use it instead.', v_name), HINT = 'name';
  END;
  RETURN v_row;
END;
$$;

-- A satisfaction rule of the caller's company (C34; the equivalence
-- drawer): holding p_type_id satisfies a requirement for
-- p_satisfies_type_id as a component, a higher certificate (supersedes) or
-- an accepted equivalent. Both types are STORM's or the company's (22023
-- document_type_unknown for any other); 22023 rule_self, kind_invalid;
-- adding a pair STORM already has: 22023 rule_exists; adding the
-- company's own pair again changes its kind. p_remove removes the
-- company's rule for the pair (P0002 rule_not_found; STORM's rules stay:
-- 22023 system_rule_locked). Returns the rule id.
CREATE OR REPLACE FUNCTION public.crew_document_type_satisfies_save(p_type_id uuid, p_satisfies_type_id uuid, p_kind text DEFAULT NULL, p_remove boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_id uuid;
  v_known integer;
BEGIN
  v_company := public.crew_compliance_company_gate('Only a company-wide crew compliance administrator can change which documents count for others.');
  SELECT count(*)::integer INTO v_known FROM public.crew_document_types AS t
  WHERE t.id IN (p_type_id, p_satisfies_type_id) AND (t.company_id IS NULL OR t.company_id = v_company);
  IF p_type_id IS NULL OR p_satisfies_type_id IS NULL
     OR v_known < (CASE WHEN p_type_id = p_satisfies_type_id THEN 1 ELSE 2 END) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'document_type_unknown', DETAIL = 'Choose two document types of the catalogue.';
  END IF;
  IF p_type_id = p_satisfies_type_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'rule_self', DETAIL = 'A document type always counts for itself.';
  END IF;
  IF coalesce(p_remove, false) THEN
    DELETE FROM public.crew_document_type_satisfies AS s
    WHERE s.company_id = v_company AND s.type_id = p_type_id AND s.satisfies_type_id = p_satisfies_type_id
    RETURNING s.id INTO v_id;
    IF v_id IS NULL THEN
      IF EXISTS (SELECT 1 FROM public.crew_document_type_satisfies AS s
                 WHERE s.company_id IS NULL AND s.type_id = p_type_id AND s.satisfies_type_id = p_satisfies_type_id) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'system_rule_locked', DETAIL = 'This rule is part of STORM''s catalogue and stays.';
      END IF;
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'rule_not_found', DETAIL = 'This rule could not be found.';
    END IF;
    RETURN v_id;
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('supersedes', 'component', 'equivalent') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'kind_invalid', HINT = 'kind';
  END IF;
  IF EXISTS (SELECT 1 FROM public.crew_document_type_satisfies AS s
             WHERE s.company_id IS NULL AND s.type_id = p_type_id AND s.satisfies_type_id = p_satisfies_type_id) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'rule_exists', DETAIL = 'STORM already counts this document for the other one.';
  END IF;
  INSERT INTO public.crew_document_type_satisfies AS s (company_id, type_id, satisfies_type_id, kind, created_by)
  VALUES (v_company, p_type_id, p_satisfies_type_id, p_kind, v_uid)
  ON CONFLICT ((coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)), type_id, satisfies_type_id)
  DO UPDATE SET kind = EXCLUDED.kind
  RETURNING s.id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------- seed (once per vessel; service role)

-- Seeds each vessel not seeded yet (W5,
-- gap/04 implementation notes): its training_matrix rows (rank ->
-- crew_position_for; each course id -> a document type through the legacy
-- map on the course name and code, else an exact name, code or
-- abbreviation of a type of STORM or the company), one row per type with
-- the ranks' positions ticked (seed_key training_matrix.<type key>);
-- without any mapped course, the STCW basic set for the listed positions;
-- a vessel that already has requirement rows is left as it is. Marks every
-- vessel it looked at (vessel_crew_settings.requirements_seeded_at), so a
-- second run adds nothing and a configuration cleared later stays cleared.
-- Returns the counts.
CREATE OR REPLACE FUNCTION public.crew_requirements_seed()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v record;
  t record;
  v_row_id uuid;
  v_seeded integer := 0;
  v_marked integer := 0;
  v_matrix integer := 0;
  v_basic integer := 0;
  v_rows integer := 0;
  v_cells integer := 0;
  v_n integer;
  v_any boolean;
  v_set record;
BEGIN
  FOR v IN
    SELECT vs.id, vs.company_id
    FROM public.vessels AS vs
    WHERE vs.company_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.vessel_crew_settings AS s WHERE s.vessel_id = vs.id AND s.requirements_seeded_at IS NOT NULL)
    ORDER BY vs.id
  LOOP
    -- A vessel already configured by hand is only marked.
    IF EXISTS (SELECT 1 FROM public.crew_requirement_rows AS r WHERE r.vessel_id = v.id) THEN
      INSERT INTO public.vessel_crew_settings AS s (vessel_id, company_id, requirements_seeded_at)
      VALUES (v.id, v.company_id, now())
      ON CONFLICT (vessel_id) DO UPDATE SET requirements_seeded_at = coalesce(s.requirements_seeded_at, EXCLUDED.requirements_seeded_at);
      v_marked := v_marked + 1;
      CONTINUE;
    END IF;
    v_any := false;
    FOR t IN
      WITH course AS (
        SELECT m.rank, tc.course_name, tc.course_code
        FROM public.training_matrix AS m
        CROSS JOIN LATERAL jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(m.required_courses) = 'array' THEN m.required_courses ELSE '[]'::jsonb END) AS c(course_id)
        JOIN public.training_courses AS tc ON tc.id::text = lower(btrim(c.course_id))
        WHERE m.vessel_id = v.id
      ),
      mapped AS (
        SELECT c.rank,
               coalesce(
                 public.crew_document_type_for_legacy(v.company_id, c.course_name, c.course_code),
                 (SELECT dt.id FROM public.crew_document_types AS dt
                  WHERE dt.is_active AND (dt.company_id IS NULL OR dt.company_id = v.company_id)
                    AND (lower(dt.name) = lower(btrim(c.course_name))
                         OR (dt.code IS NOT NULL AND upper(dt.code) = upper(btrim(coalesce(c.course_code, ''))))
                         OR (dt.abbreviation IS NOT NULL AND lower(dt.abbreviation) IN (lower(btrim(c.course_name)), lower(btrim(coalesce(c.course_code, ''))))))
                  ORDER BY (dt.company_id IS NULL), dt.sort_order, dt.id
                  LIMIT 1)) AS type_id
        FROM course AS c
      )
      SELECT dt.id AS type_id, dt.key, dt.name, dt.category_key, cat.sort_order AS cat_sort, dt.sort_order AS type_sort,
             array_remove(array_agg(DISTINCT public.crew_position_for(v.company_id, v.id, mp.rank)), NULL) AS position_ids
      FROM mapped AS mp
      JOIN public.crew_document_types AS dt ON dt.id = mp.type_id
      JOIN public.crew_document_categories AS cat ON cat.key = dt.category_key
      GROUP BY dt.id, dt.key, dt.name, dt.category_key, cat.sort_order, dt.sort_order
      ORDER BY cat.sort_order, dt.sort_order, dt.key
    LOOP
      v_any := true;
      v_row_id := NULL;
      INSERT INTO public.crew_requirement_rows (company_id, vessel_id, group_key, label, kind, sort_order, seed_key)
      VALUES (v.company_id, v.id, public.crew_requirement_group_for_category(t.category_key), t.name, 'document',
              least(t.cat_sort * 100 + t.type_sort, 999999), 'training_matrix.' || t.key)
      ON CONFLICT (vessel_id, seed_key) DO NOTHING
      RETURNING id INTO v_row_id;
      IF v_row_id IS NOT NULL THEN
        v_rows := v_rows + 1;
        INSERT INTO public.crew_requirement_options (company_id, vessel_id, row_id, document_type_id, sort_order)
        VALUES (v.company_id, v.id, v_row_id, t.type_id, 0)
        ON CONFLICT (row_id, document_type_id) DO NOTHING;
        INSERT INTO public.crew_requirement_positions (company_id, vessel_id, row_id, position_id)
        SELECT v.company_id, v.id, v_row_id, p FROM unnest(t.position_ids) AS p
        ON CONFLICT (row_id, position_id) DO NOTHING;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_cells := v_cells + v_n;
      END IF;
    END LOOP;
    IF v_any THEN
      v_matrix := v_matrix + 1;
    ELSE
      SELECT s.rows_added, s.cells_added INTO v_set FROM public.crew_requirement_set_add(v.id, 'stcw_basic', NULL) AS s;
      v_rows := v_rows + coalesce(v_set.rows_added, 0);
      v_cells := v_cells + coalesce(v_set.cells_added, 0);
      v_basic := v_basic + 1;
    END IF;
    INSERT INTO public.vessel_crew_settings AS s (vessel_id, company_id, requirements_seeded_at)
    VALUES (v.id, v.company_id, now())
    ON CONFLICT (vessel_id) DO UPDATE SET requirements_seeded_at = coalesce(s.requirements_seeded_at, EXCLUDED.requirements_seeded_at);
    v_seeded := v_seeded + 1;
  END LOOP;
  RETURN jsonb_build_object('vessels', v_seeded, 'already_configured', v_marked, 'from_training_matrix', v_matrix, 'stcw_basic', v_basic, 'rows', v_rows, 'cells', v_cells);
END;
$$;

-- ---------------------------------------------------------------- grants

REVOKE ALL ON public.crew_requirement_rows, public.crew_requirement_options, public.crew_requirement_positions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.crew_requirement_rows, public.crew_requirement_options, public.crew_requirement_positions TO authenticated;
GRANT ALL ON public.crew_requirement_rows, public.crew_requirement_options, public.crew_requirement_positions TO service_role;

-- Internal views: every vessel; the service role only.
REVOKE ALL ON public.crew_requirement_status_internal, public.crew_compliance_summary_internal FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.crew_requirement_status_internal, public.crew_compliance_summary_internal TO service_role;
-- The public views: security invoker over the gated SRFs.
REVOKE ALL ON public.crew_requirement_status, public.crew_compliance_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.crew_requirement_status, public.crew_compliance_summary TO authenticated, service_role;

-- Browser RPCs (and the SRFs the public views call as the invoker).
REVOKE ALL ON FUNCTION public.crew_requirement_status_rows() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_requirement_status_rows() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_compliance_summary_rows() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_compliance_summary_rows() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_vessel_compliance(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_vessel_compliance(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_vessel_requirement_status(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_vessel_requirement_status(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_compliance_for_vessels(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_compliance_for_vessels(uuid[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_requirements_config(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_requirements_config(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_requirement_row_save(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_requirement_row_save(uuid, uuid, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_requirement_row_delete(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_requirement_row_delete(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_requirement_cell_set(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_requirement_cell_set(uuid, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_requirement_row_bulk(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_requirement_row_bulk(uuid, uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_requirements_add_stcw_basic(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_requirements_add_stcw_basic(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_vessel_set_passenger(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_vessel_set_passenger(uuid, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_vessel_settings_save(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_vessel_settings_save(uuid, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_document_type_create(text, text, text, text, integer, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_type_create(text, text, text, text, integer, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_document_type_satisfies_save(uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_type_satisfies_save(uuid, uuid, text, boolean) TO authenticated, service_role;

-- Internal: the service role and the definers above only.
REVOKE ALL ON FUNCTION public.crew_requirement_tab(text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_requirement_tab(text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.crew_requirement_group_for_category(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_requirement_group_for_category(text) TO service_role;
REVOKE ALL ON FUNCTION public.crew_compliance_status_decide(integer, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_compliance_status_decide(integer, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.crew_compliance_dot(integer, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_compliance_dot(integer, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.crew_requirement_row_satisfiers(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_requirement_row_satisfiers(uuid[]) TO service_role;
REVOKE ALL ON FUNCTION public.crew_requirement_status_for(uuid[], date, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_requirement_status_for(uuid[], date, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_compliance_summary_for(uuid[], date, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_compliance_summary_for(uuid[], date, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_requirement_held_by(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_requirement_held_by(uuid, date) TO service_role;
REVOKE ALL ON FUNCTION public.crew_requirement_set_add(uuid, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_requirement_set_add(uuid, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_requirement_admin_gate(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_requirement_admin_gate(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_compliance_company_gate(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_compliance_company_gate(text) TO service_role;
REVOKE ALL ON FUNCTION public.crew_requirements_seed() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_requirements_seed() TO service_role;
-- Trigger functions: no grant.
REVOKE ALL ON FUNCTION public.crew_requirement_rows_scope_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_requirement_options_scope_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_requirement_positions_scope_guard() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON TABLE public.crew_requirement_rows IS 'Crew requirements per vessel (gap/04 C33, W5; X1-06): one row of the configuration matrix, in a W5 group, with a label and a kind (document or familiarisation); seed_key names the rows of the bulk sets and the seed (unique per vessel). Read with vessel.crew.crew_compliance.view on the vessel (no external viewer); written only through the crew_requirement_* RPCs (vessel.crew.crew_compliance.admin).';
COMMENT ON TABLE public.crew_requirement_options IS 'What satisfies a crew requirement (gap/04 C33, C34, C36): a document type of STORM or the company, or a familiarisation template of the company; any one option does, and the satisfaction rules (crew_document_type_satisfies) add their satisfiers. Carries the row''s vessel and company. Read with the row''s visibility; written only through crew_requirement_row_save() and the bulk sets.';
COMMENT ON TABLE public.crew_requirement_positions IS 'The ticked cells of the crew requirement matrix (gap/04 C33): the requirement applies to the position on the requirement''s vessel. Read with the row''s visibility; written only through crew_requirement_row_save(), crew_requirement_cell_set(), crew_requirement_row_bulk() and the bulk sets.';
COMMENT ON VIEW public.crew_requirement_status_internal IS 'Internal (service role): crew_requirement_status_for() over every vessel, today. The browser reads crew_requirement_status (gated) or crew_vessel_requirement_status().';
COMMENT ON VIEW public.crew_compliance_summary_internal IS 'Internal (service role): crew_compliance_summary_for() over every vessel, today. The browser reads crew_compliance_summary (gated) or crew_vessel_compliance() / crew_compliance_for_vessels().';
COMMENT ON VIEW public.crew_requirement_status IS 'Crew requirement status (gap/04 W5; X5 agreement 5, D-X1-22): security invoker over crew_requirement_status_rows(), so a reader sees only the vessels where they hold vessel.crew.crew_compliance.view (no external viewer, nothing when inactive). One row per crew member and required requirement: state met / expiring / expired / missing, the satisfying document or record and how it satisfies, the flags and, for a missing row, the reason and the nearest document.';
COMMENT ON VIEW public.crew_compliance_summary IS 'Crew compliance summary (gap/04 W5 §4; X5 agreement 5, D-X1-22): security invoker over crew_compliance_summary_rows(), the vessels where the reader holds vessel.crew.crew_compliance.view. One row per crew member: met of required overall and per tab, the state counts, status (complete / expiring / missing / expired), next expiry, the two crew list dots and the issues behind them.';
COMMENT ON FUNCTION public.crew_requirement_tab(text, text, text) IS 'Pure (TS requirementTab): familiarisation for a familiarisation requirement, else its first option''s tab, else its group''s (documents; STCW for the STCW, medical, security and navigation groups; qualifications otherwise).';
COMMENT ON FUNCTION public.crew_requirement_group_for_category(text) IS 'Pure (TS requirementGroupForCategory): the requirement group of a document category (the seed and the add dialog''s default).';
COMMENT ON FUNCTION public.crew_compliance_status_decide(integer, integer, integer) IS 'Pure (TS complianceStatus): expired > missing > expiring (alerts on) > complete.';
COMMENT ON FUNCTION public.crew_compliance_dot(integer, integer, integer) IS 'Pure (TS complianceDot): none (nothing required), danger (expired or missing), warn (expiring with alerts on, conditional, missing date), ok.';
COMMENT ON FUNCTION public.crew_requirement_row_satisfiers(uuid[]) IS 'Internal (TS satisfierClosure): per document requirement of the vessels, every satisfier type: the options (depth 0) and the types that reach them through STORM''s and the company''s rules, at most five steps, cycle safe, the shortest depth, with the kind of the rule next to the option and the option it satisfies.';
COMMENT ON FUNCTION public.crew_requirement_status_for(uuid[], date, uuid) IS 'Internal engine (gap/04 W5 §2-§3; TS evaluateRequirement): per crew member of the vessels (crew_vessel_members) and requirement ticked for their position, the state (met / expiring / expired / missing), the best satisfying document (latest expiry, not rejected or removed) or completed familiarisation record, how it satisfies, the flags (conditional, muted, missing date, file) and, when missing, the reason (rejected, not_linked, in_progress, none) with the nearest document. Callers gate.';
COMMENT ON FUNCTION public.crew_compliance_summary_for(uuid[], date, uuid) IS 'Internal engine (gap/04 W5 §4; TS summariseCompliance): per crew member of the vessels, their names, position and department, met of required overall and per tab, the state counts, status, next expiry, the two crew list dots and the issues behind them. Callers gate.';
COMMENT ON FUNCTION public.crew_requirement_held_by(uuid, date) IS 'Internal: per requirement of the vessel, the crew members today (any position) holding a satisfier that counts, or a completed familiarisation record (the configuration''s "held by").';
COMMENT ON FUNCTION public.crew_requirement_set_add(uuid, text, uuid) IS 'Internal: ensures the STCW basic (PST, FPFF, EFA, PSSR) or STCW V/2 passenger (crowd, crisis, passenger safety) rows on the vessel by seed key, ticked for every listed position. Returns the rows and ticks added.';
COMMENT ON FUNCTION public.crew_requirement_admin_gate(uuid) IS 'Internal: the write gate of the requirement RPCs: vessel.crew.crew_compliance.admin on the vessel (P0002 unknown vessel, 42501), no external viewer. Returns the vessel''s company.';
COMMENT ON FUNCTION public.crew_compliance_company_gate(text) IS 'Internal: the company-level write gate (tenant document types, company satisfaction rules): an active caller of a company, no external viewer, vessel.crew.crew_compliance.admin at company level (42501 with the given sentence). Returns the company.';
COMMENT ON FUNCTION public.crew_requirements_seed() IS 'Seed (service role; run once by 20261124060600): each vessel never seeded and with no requirement rows gets its training_matrix requirements (course -> document type, rank -> position), else the STCW basic set for its listed positions; the vessel is marked in vessel_crew_settings.requirements_seeded_at. Returns the counts.';
COMMENT ON FUNCTION public.crew_requirement_status_rows() IS 'The requirement status rows of the vessels where the caller holds vessel.crew.crew_compliance.view, today; nothing for an external viewer, without a JWT or when inactive. Read through the security-invoker view crew_requirement_status.';
COMMENT ON FUNCTION public.crew_compliance_summary_rows() IS 'The compliance summaries of the vessels where the caller holds vessel.crew.crew_compliance.view, today; nothing for an external viewer, without a JWT or when inactive. Read through the security-invoker view crew_compliance_summary.';
COMMENT ON FUNCTION public.crew_vessel_compliance(uuid) IS 'The compliance summary of the vessel''s crew today (gap/04 C5, C35): vessel.crew.crew_compliance.view (P0002 unknown vessel, 42501), no external viewer.';
COMMENT ON FUNCTION public.crew_vessel_requirement_status(uuid, uuid) IS 'The requirement status rows of the vessel''s crew today, or of one person: vessel.crew.crew_compliance.view (no external viewer), or one''s own rows with vessel.crew.crew_certificates.view_own; P0002 unknown vessel or a person of another company.';
COMMENT ON FUNCTION public.crew_compliance_for_vessels(uuid[]) IS 'Fleet report R5 (platform plan contract 5): the compliance summaries of the vessels; every id must be one the caller holds vessel.crew.crew_compliance.view on, else the whole call is refused (42501 vessel_out_of_reach); no external viewer; 22023 vessels_required (NULL), too_many_vessels (over 500); an empty list answers nothing. Columns frozen in src/modules/crew/types/db.pending.ts.';
COMMENT ON FUNCTION public.crew_requirements_config(uuid) IS 'The vessel''s requirement configuration (gap/04 C33): can_admin, can_admin_company, the typed settings, the positions (listed or ticked), the rows with options, ticks and held-by counts, the vessel''s familiarisation templates. vessel.crew.crew_compliance.view, no external viewer.';
COMMENT ON FUNCTION public.crew_requirement_row_save(uuid, uuid, jsonb) IS 'Creates or changes a crew requirement of the vessel (group, label, kind, sort order; options replace the options; position_ids replace the ticks). vessel.crew.crew_compliance.admin. P0002 requirement_not_found; 22023 refusals with HINT naming the field. Returns the row.';
COMMENT ON FUNCTION public.crew_requirement_row_delete(uuid, uuid) IS 'Removes a crew requirement of the vessel with its options and ticks. vessel.crew.crew_compliance.admin. P0002 requirement_not_found. Returns its id.';
COMMENT ON FUNCTION public.crew_requirement_cell_set(uuid, jsonb) IS 'Sets requirement matrix cells of the vessel in one transaction ([{row_id, position_id, required}], 1 to 2000, each once). vessel.crew.crew_compliance.admin. P0002 requirement_not_found; 22023 cells_required / cells_too_many / cells_invalid / cells_duplicate / position_unknown. Returns the number of cells applied.';
COMMENT ON FUNCTION public.crew_requirement_row_bulk(uuid, uuid, text) IS 'A requirement''s bulk action: require_all (every listed position) or clear_all. vessel.crew.crew_compliance.admin. Returns the number of ticked positions after.';
COMMENT ON FUNCTION public.crew_requirements_add_stcw_basic(uuid) IS 'Add STCW basic set (all positions): PST, FPFF, EFA, PSSR ticked for every listed position, by seed key. vessel.crew.crew_compliance.admin. Returns the rows and ticks added.';
COMMENT ON FUNCTION public.crew_vessel_set_passenger(uuid, boolean) IS 'Passenger ship? (gap/04 C13, C33): records vessel_crew_settings.is_passenger_ship and adds (on) or removes (off) the STCW V/2 requirements by seed key. vessel.crew.crew_compliance.admin. Returns the flag and the rows added and removed.';
COMMENT ON FUNCTION public.crew_vessel_settings_save(uuid, jsonb) IS 'Saves the vessel''s crew settings (gap/04 C13, D-X1-12): crew_uploads_enabled, transfer_requires_fleet_approval. vessel.crew.crew_compliance.admin. 22023 patch_empty / setting_unknown / setting_invalid / use_passenger_toggle. Returns the settings row.';
COMMENT ON FUNCTION public.crew_document_type_create(text, text, text, text, integer, text) IS 'Adds a document type of the caller''s company (gap/04 C23, C33): the company-level vessel.crew.crew_compliance.admin; 22023 category_unknown / name_invalid / code_invalid / abbreviation_invalid / validity_invalid / reference_invalid / document_type_exists. Returns the row.';
COMMENT ON FUNCTION public.crew_document_type_satisfies_save(uuid, uuid, text, boolean) IS 'Adds, changes or removes a satisfaction rule of the caller''s company (gap/04 C34): the company-level vessel.crew.crew_compliance.admin; 22023 document_type_unknown / rule_self / kind_invalid / rule_exists / system_rule_locked; P0002 rule_not_found. Returns the rule id.';
COMMENT ON FUNCTION public.crew_requirement_rows_scope_guard() IS 'Trigger: a requirement carries its vessel''s company (filled; 23514 crew_requirement_scope_mismatch), stays on its vessel (23514 crew_requirement_vessel_locked) and changes kind only without options of the other kind (23514 crew_requirement_option_kind_mismatch).';
COMMENT ON FUNCTION public.crew_requirement_options_scope_guard() IS 'Trigger: an option carries its requirement''s vessel and company (filled; 23514), matches its kind, and names a document type of STORM or the company, or a familiarisation template of the company (23514).';
COMMENT ON FUNCTION public.crew_requirement_positions_scope_guard() IS 'Trigger: a tick carries its requirement''s vessel and company (filled; 23514) and names a position of STORM, the company or the vessel (23514 crew_requirement_position_scope_mismatch).';

-- ---------------------------------------------------------------- seed (once per vessel; idempotent)

SELECT public.crew_requirements_seed();
