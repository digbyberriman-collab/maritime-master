-- =================================================================
-- CREW X1-01: reference data, positions and position manning (Phase 3
-- wave 1, stream X1; gap/04 C1, C12, C49, C70, C71; DECISIONS C22,
-- D-X1-1, D-X1-2, D-X1-16; X1 spec §6 060100)
-- Tables: ref_countries, ref_languages, departments, contract_types
--   (global reference data), positions, position_aliases, position_manning
-- Gate helpers (every later X1 file uses them): crew_vessel_cap(),
--   crew_cap_vessel_ids(); internal crew_vessel_gate()
-- Position matching: crew_position_synonym() (pure), crew_position_for()
--   (internal), crew_positions_backfill() (service role; the seed)
-- RPCs: crew_positions_for_vessel(), crew_vessel_unmatched_titles(),
--   crew_position_create(), crew_vessel_positions_save(),
--   crew_position_alias_set()
-- TS mirror: src/modules/crew/types/db.pending.ts (tables and RPCs);
--   src/modules/crew/lib/positions.ts (crew_position_for and the synonym
--   map). Parity cases: src/test/crew/fixtures/positionCases.json, asserted
--   by src/test/crew/positions.test.ts and by
--   supabase/tests/sql/crew/reference_positions.test.sql
-- =================================================================
--
-- Why. Crew titles are free text today (crew_assignments.position / rank,
-- profiles.position / rank, crew_contracts.position) and six modules keep
-- their own department lists (gap/04 C70). This file gives STORM one
-- catalogue:
--
-- * departments: the vessel departments of the PMS catalogue
--   (docs/permissions/catalogues/storm.json) plus security and other.
-- * positions: system rows (company_id NULL; about 100, STORM-authored per
--   DECISIONS C22: every vessel role of storm.json with its tier, plus
--   yacht positions written fresh), company rows and vessel rows, each
--   with a department, a rank tier and a default access set (a PMS access
--   set key; X6 adds the foreign key when access_sets exists, D-X1-1). The
--   key is record_normalise_office(name) for new rows, so the D-132 office
--   source keeps working; system rows keep the storm.json role keys.
-- * position_aliases: per-company mappings of a legacy title to a
--   position (D-X1-2: legacy titles stay where they are, on the shared
--   tables, and are mapped here).
-- * position_manning: per vessel, the positions listed on it, their rank
--   order on that vessel and the manning minimum / optional maximum
--   (gap/04 C12, C49; D-X1-16: the maximum is colour only).
-- * ref_countries (ISO 3166-1, with demonym, dial code and flag) and
--   ref_languages (ISO 639): public standards, for the profile and
--   document pickers of later slices (gap/04 C71).
-- * contract_types: system rows permanent / rotational / temporary
--   (company rows arrive with the employment slices).
--
-- Matching a title to a position (crew_position_for, mirrored in TS):
-- normalise the title (record_normalise_office), then among the active
-- positions visible on the vessel (its own rows, then the company's, then
-- the system rows) take the one whose key or normalised name is the title;
-- else the company's alias for the title (the key of the position it
-- names, by the same precedence); else the fixed synonym map (captain -> master, chief mate ->
-- chief officer, stewardess -> steward, …) applied to the keys. Anything
-- else stays unmatched and is listed in the positions drawer.
--
-- Access. Reference tables read for any active signed-in user (USING
-- (true) is refused by the build-out rules, D-55); positions read by row
-- scope (system rows for active users, company rows for members, vessel
-- rows for members who reach the vessel); aliases for company members;
-- manning for members holding vessel.crew.crew_list.view on the vessel
-- (crew_cap_vessel_ids, hoisted once per statement, D-229). There is no
-- browser write policy: positions, manning and aliases change only
-- through the RPCs below, gated by vessel.crew.crew_compliance.admin
-- (the vessel's, or the company-level answer for company-wide rows).
-- Reference data changes only by migration or the service role.
--
-- Idempotent (D-12): every seed is ON CONFLICT DO NOTHING and the alias
-- and manning backfill only adds missing rows.

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regprocedure('public.user_is_active(uuid)') IS NULL
     OR to_regprocedure('public.reach_vessel_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.reach_vessels_for(uuid)') IS NULL
     OR to_regprocedure('public.user_vessel_reach(uuid)') IS NULL
     OR to_regprocedure('public.crew_assignment_is_current(boolean,date,date)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060100_crew_reference_positions needs the reach helpers: apply 20261123000300_platform_account_memberships.sql first';
  END IF;
  IF to_regprocedure('public.has_capability_for(uuid,text,uuid,uuid)') IS NULL
     OR position('vessel.crew.crew_compliance.admin' IN pg_get_functiondef('public.has_capability_for(uuid,text,uuid,uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060100_crew_reference_positions needs has_capability_for() with the crew keys: apply 20261123000400_platform_capabilities.sql (platform prep PP1) first';
  END IF;
  IF to_regprocedure('public.user_belongs_to_company(uuid,uuid)') IS NULL
     OR position('user_is_active' IN pg_get_functiondef('public.user_belongs_to_company(uuid,uuid)'::regprocedure)) = 0
     OR to_regprocedure('public.get_user_company_id(uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060100_crew_reference_positions needs the active-aware company helpers: apply 20261123010000_platform_user_status.sql first';
  END IF;
  IF to_regprocedure('public.vessel_company_of(uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060100_crew_reference_positions needs vessel_company_of(): apply 20261123010500_platform_role_scoped_policies.sql first';
  END IF;
  IF to_regprocedure('public.record_normalise_office(text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060100_crew_reference_positions needs record_normalise_office(): apply 20261123020100_platform_record_signatures.sql first';
  END IF;
  IF to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060100_crew_reference_positions needs update_updated_at_column() (legacy 20260125143210)';
  END IF;
END
$$;

-- ---------------------------------------------------------------- tables

CREATE TABLE IF NOT EXISTS public.ref_countries (
  iso2 text NOT NULL,
  iso3 text NOT NULL,
  name text NOT NULL,
  demonym text NULL,
  dial_code text NULL,
  flag_emoji text NULL,
  sort_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ref_countries_pkey PRIMARY KEY (iso2),
  CONSTRAINT ref_countries_iso3_key UNIQUE (iso3),
  CONSTRAINT ref_countries_iso2_check CHECK (iso2 ~ '^[A-Z]{2}$'),
  CONSTRAINT ref_countries_iso3_check CHECK (iso3 ~ '^[A-Z]{3}$'),
  CONSTRAINT ref_countries_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT ref_countries_demonym_check CHECK (demonym IS NULL OR length(btrim(demonym)) BETWEEN 1 AND 80),
  CONSTRAINT ref_countries_dial_code_check CHECK (dial_code IS NULL OR dial_code ~ '^[0-9]{1,4}$'),
  CONSTRAINT ref_countries_sort_name_check CHECK (length(btrim(sort_name)) BETWEEN 1 AND 80)
);

CREATE TABLE IF NOT EXISTS public.ref_languages (
  code text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 1000,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ref_languages_pkey PRIMARY KEY (code),
  CONSTRAINT ref_languages_code_check CHECK (code ~ '^[a-z]{2,3}$'),
  CONSTRAINT ref_languages_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 60)
);

CREATE TABLE IF NOT EXISTS public.departments (
  key text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT departments_pkey PRIMARY KEY (key),
  CONSTRAINT departments_key_check CHECK (key ~ '^[a-z][a-z0-9_]*$' AND length(key) <= 40),
  CONSTRAINT departments_label_check CHECK (length(btrim(label)) BETWEEN 1 AND 60),
  CONSTRAINT departments_sort_order_check CHECK (sort_order BETWEEN 0 AND 999)
);

CREATE TABLE IF NOT EXISTS public.contract_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NULL,
  key text NOT NULL,
  label text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 1000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_types_pkey PRIMARY KEY (id),
  CONSTRAINT contract_types_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT contract_types_key_check CHECK (key ~ '^[a-z][a-z0-9_]*$' AND length(key) <= 40),
  CONSTRAINT contract_types_label_check CHECK (length(btrim(label)) BETWEEN 1 AND 60),
  CONSTRAINT contract_types_system_check CHECK (is_system = (company_id IS NULL)),
  CONSTRAINT contract_types_sort_order_check CHECK (sort_order BETWEEN 0 AND 99999)
);
CREATE UNIQUE INDEX IF NOT EXISTS contract_types_scope_key
  ON public.contract_types ((coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)), key);

CREATE TABLE IF NOT EXISTS public.positions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NULL,
  vessel_id uuid NULL,
  key text NOT NULL,
  name text NOT NULL,
  department_key text NOT NULL,
  rank_tier text NOT NULL,
  default_access_set_key text NULL,
  stcw_capacity text NULL,
  sort_order integer NOT NULL DEFAULT 90000,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT positions_pkey PRIMARY KEY (id),
  CONSTRAINT positions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT positions_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE,
  CONSTRAINT positions_department_key_fkey FOREIGN KEY (department_key) REFERENCES public.departments(key),
  CONSTRAINT positions_key_check CHECK (key ~ '^[a-z][a-z0-9_]*$' AND length(key) <= 80),
  CONSTRAINT positions_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT positions_rank_tier_check CHECK (rank_tier IN ('command', 'hod', 'officer', 'rating', 'trainee')),
  CONSTRAINT positions_default_access_set_key_check CHECK (default_access_set_key IN ('full_vessel', 'hod', 'officer', 'crew', 'view_only')),
  CONSTRAINT positions_stcw_capacity_check CHECK (stcw_capacity IS NULL OR length(btrim(stcw_capacity)) BETWEEN 1 AND 60),
  CONSTRAINT positions_sort_order_check CHECK (sort_order BETWEEN 0 AND 999999),
  CONSTRAINT positions_vessel_needs_company CHECK (vessel_id IS NULL OR company_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS positions_scope_key
  ON public.positions ((coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)), (coalesce(vessel_id, '00000000-0000-0000-0000-000000000000'::uuid)), key);
CREATE INDEX IF NOT EXISTS positions_company_idx ON public.positions (company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS positions_vessel_idx ON public.positions (vessel_id) WHERE vessel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS positions_key_idx ON public.positions (key);

CREATE TABLE IF NOT EXISTS public.position_aliases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  alias_key text NOT NULL,
  alias_label text NOT NULL,
  position_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT position_aliases_pkey PRIMARY KEY (id),
  CONSTRAINT position_aliases_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT position_aliases_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE CASCADE,
  CONSTRAINT position_aliases_company_alias_key UNIQUE (company_id, alias_key),
  CONSTRAINT position_aliases_alias_key_check CHECK (alias_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$' AND length(alias_key) <= 120),
  CONSTRAINT position_aliases_alias_label_check CHECK (length(btrim(alias_label)) BETWEEN 1 AND 120),
  CONSTRAINT position_aliases_source_check CHECK (source IN ('backfill', 'manual'))
);
CREATE INDEX IF NOT EXISTS position_aliases_position_idx ON public.position_aliases (position_id);

CREATE TABLE IF NOT EXISTS public.position_manning (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  vessel_id uuid NOT NULL,
  position_id uuid NOT NULL,
  sort_order integer NULL,
  is_listed boolean NOT NULL DEFAULT true,
  min_on_board integer NOT NULL DEFAULT 0,
  max_on_board integer NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT position_manning_pkey PRIMARY KEY (id),
  CONSTRAINT position_manning_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT position_manning_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE,
  CONSTRAINT position_manning_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE CASCADE,
  CONSTRAINT position_manning_vessel_position_key UNIQUE (vessel_id, position_id),
  CONSTRAINT position_manning_sort_order_check CHECK (sort_order IS NULL OR sort_order BETWEEN 0 AND 999999),
  CONSTRAINT position_manning_min_check CHECK (min_on_board BETWEEN 0 AND 500),
  CONSTRAINT position_manning_max_check CHECK (max_on_board IS NULL OR (max_on_board >= min_on_board AND max_on_board <= 500))
);
CREATE INDEX IF NOT EXISTS position_manning_position_idx ON public.position_manning (position_id);
CREATE INDEX IF NOT EXISTS position_manning_company_idx ON public.position_manning (company_id);

COMMENT ON TABLE public.ref_countries IS 'ISO 3166-1 countries (and Kosovo, XK, as used for nationality) with demonym, international dial code and flag (gap/04 C71). Global reference data: read by any active signed-in user, written only by migrations and the service role.';
COMMENT ON TABLE public.ref_languages IS 'ISO 639 languages for crew language skills (gap/04 C71; proficiency lives on crew_languages, X1-03). Global reference data: read by any active signed-in user, written only by migrations and the service role.';
COMMENT ON TABLE public.departments IS 'The vessel departments (gap/04 C70; the PMS catalogue''s vessel departments plus security and other). Global: read by any active signed-in user, written only by migrations and the service role. One list for every module (DECISIONS C22).';
COMMENT ON TABLE public.contract_types IS 'Crew contract types: system rows (company_id NULL: permanent, rotational, temporary) and, from the employment slices, company rows. Read by active users (system rows) and company members (their rows); written only by migrations, the service role and X1 definers.';
COMMENT ON TABLE public.positions IS 'Crew positions (DECISIONS C22, D-X1-1): system rows (company_id NULL; STORM-authored), company rows and vessel rows, each with a department, rank tier and default access set. A vessel row beats a company row beats a system row with the same key. Read by row scope; written only through crew_position_create() and the service role.';
COMMENT ON TABLE public.position_aliases IS 'Per-company mapping of a legacy free-text title (normalised with record_normalise_office) to a position (D-X1-2). Backfilled from crew_assignments, profiles and crew_contracts; set through crew_position_alias_set(). Read by company members.';
COMMENT ON TABLE public.position_manning IS 'Per vessel: the positions listed on it, their rank order on that vessel, and the manning minimum and optional maximum (gap/04 C12, C49; D-X1-16). Read with vessel.crew.crew_list.view on the vessel; written only through crew_vessel_positions_save() and crew_position_create().';

-- ---------------------------------------------------------------- integrity guards (every writer, the service role included)

-- A vessel position belongs to the vessel's company.
CREATE OR REPLACE FUNCTION public.positions_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  IF NEW.vessel_id IS NOT NULL THEN
    SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = NEW.vessel_id;
    IF NEW.company_id IS DISTINCT FROM v_company THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'position_scope_mismatch',
        DETAIL = 'A vessel position must belong to the vessel''s company.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- A manning row belongs to its vessel's company and names a position that
-- is visible on that vessel (a system row, a row of the same company, or
-- a row of this vessel).
CREATE OR REPLACE FUNCTION public.position_manning_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = NEW.vessel_id;
  IF NEW.company_id IS DISTINCT FROM v_company OR NOT EXISTS (
    SELECT 1 FROM public.positions AS p
    WHERE p.id = NEW.position_id
      AND (p.company_id IS NULL OR (p.company_id = v_company AND (p.vessel_id IS NULL OR p.vessel_id = NEW.vessel_id)))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'position_manning_scope_mismatch',
      DETAIL = 'A manning row must name a position of the vessel''s company or a STORM position.';
  END IF;
  RETURN NEW;
END;
$$;

-- An alias names a STORM position or one of its own company.
CREATE OR REPLACE FUNCTION public.position_aliases_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.positions AS p
    WHERE p.id = NEW.position_id AND (p.company_id IS NULL OR p.company_id = NEW.company_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'position_alias_scope_mismatch',
      DETAIL = 'An alias must name a position of its own company or a STORM position.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS positions_scope_guard ON public.positions;
CREATE TRIGGER positions_scope_guard BEFORE INSERT OR UPDATE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.positions_scope_guard();
DROP TRIGGER IF EXISTS position_manning_scope_guard ON public.position_manning;
CREATE TRIGGER position_manning_scope_guard BEFORE INSERT OR UPDATE ON public.position_manning
  FOR EACH ROW EXECUTE FUNCTION public.position_manning_scope_guard();
DROP TRIGGER IF EXISTS position_aliases_scope_guard ON public.position_aliases;
CREATE TRIGGER position_aliases_scope_guard BEFORE INSERT OR UPDATE ON public.position_aliases
  FOR EACH ROW EXECUTE FUNCTION public.position_aliases_scope_guard();

DROP TRIGGER IF EXISTS update_ref_countries_updated_at ON public.ref_countries;
CREATE TRIGGER update_ref_countries_updated_at BEFORE UPDATE ON public.ref_countries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_ref_languages_updated_at ON public.ref_languages;
CREATE TRIGGER update_ref_languages_updated_at BEFORE UPDATE ON public.ref_languages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_departments_updated_at ON public.departments;
CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_contract_types_updated_at ON public.contract_types;
CREATE TRIGGER update_contract_types_updated_at BEFORE UPDATE ON public.contract_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_positions_updated_at ON public.positions;
CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_position_aliases_updated_at ON public.position_aliases;
CREATE TRIGGER update_position_aliases_updated_at BEFORE UPDATE ON public.position_aliases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_position_manning_updated_at ON public.position_manning;
CREATE TRIGGER update_position_manning_updated_at BEFORE UPDATE ON public.position_manning
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------- gate helpers (X1 spec §3)

-- The caller holds p_key on the vessel: signed in, active, a member of
-- the vessel's company (vessel_company_of answers NULL for anyone else,
-- an inactive caller included) and has_capability_for(), which also asks
-- for reach to the vessel. False for an unknown or foreign vessel and
-- without a JWT. Text-first, so the D-233 inventory needs no probe for
-- it; definers and policies call it as `crew_vessel_cap(key, vessel)`.
CREATE OR REPLACE FUNCTION public.crew_vessel_cap(p_key text, p_vessel_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
BEGIN
  IF v_uid IS NULL OR p_key IS NULL OR p_vessel_id IS NULL THEN
    RETURN false;
  END IF;
  v_company := public.vessel_company_of(p_vessel_id);
  IF v_company IS NULL THEN
    RETURN false;
  END IF;
  RETURN coalesce(public.has_capability_for(v_uid, p_key, v_company, p_vessel_id), false);
END;
$$;

-- Caller-only set (D-229): the vessels of the caller's company that the
-- caller reaches and holds p_key on. Empty without a JWT and for an
-- inactive caller (get_user_company_id answers NULL). Policies use it as
-- `vessel_id IN (SELECT public.crew_cap_vessel_ids('<key>'))`, computed
-- once per statement.
CREATE OR REPLACE FUNCTION public.crew_cap_vessel_ids(p_key text)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
BEGIN
  IF v_uid IS NULL OR p_key IS NULL THEN
    RETURN;
  END IF;
  v_company := public.get_user_company_id(v_uid);
  IF v_company IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT r.vessel_id
    FROM public.reach_vessels_for(v_uid) AS r(vessel_id)
    JOIN public.vessels AS v ON v.id = r.vessel_id AND v.company_id = v_company
    WHERE public.has_capability_for(v_uid, p_key, v_company, r.vessel_id);
END;
$$;

-- The X1 RPC gate (internal): a signed-in caller, a known vessel (P0002
-- otherwise) and p_key on it (42501 with the given sentence otherwise).
-- Returns the vessel's company. Definers call it with the vessel id the
-- client passed; the company comes from the vessel row, never from the
-- client.
CREATE OR REPLACE FUNCTION public.crew_vessel_gate(p_key text, p_vessel_id uuid, p_detail text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
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
  IF NOT public.crew_vessel_cap(p_key, p_vessel_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted',
      DETAIL = coalesce(p_detail, 'You don''t have permission to do that.');
  END IF;
  RETURN v_company;
END;
$$;

-- ---------------------------------------------------------------- position matching

-- The fixed synonym map (normalised title -> system position key). Pure;
-- mirrored by POSITION_SYNONYMS in src/modules/crew/lib/positions.ts and
-- covered case by case in positionCases.json.
CREATE OR REPLACE FUNCTION public.crew_position_synonym(p_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT s.target
  FROM (VALUES
    ('captain', 'master'),
    ('skipper', 'master'),
    ('first_officer', 'chief_officer'),
    ('chief_mate', 'chief_officer'),
    ('first_mate', 'chief_officer'),
    ('mate', 'chief_officer'),
    ('2nd_officer', 'second_officer'),
    ('second_mate', 'second_officer'),
    ('3rd_officer', 'third_officer'),
    ('third_mate', 'third_officer'),
    ('oow', 'officer_of_the_watch'),
    ('boatswain', 'bosun'),
    ('able_seaman', 'ab_seaman'),
    ('able_bodied_seaman', 'ab_seaman'),
    ('ab', 'ab_seaman'),
    ('ordinary_seaman', 'os_seaman'),
    ('os', 'os_seaman'),
    ('2nd_engineer', 'second_engineer'),
    ('3rd_engineer', 'third_engineer'),
    ('4th_engineer', 'fourth_engineer'),
    ('electro_technical_officer', 'eto'),
    ('electrotechnical_officer', 'eto'),
    ('electro_technical_rating', 'electrician'),
    ('etr', 'electrician'),
    ('chief_stewardess', 'chief_stew'),
    ('chief_steward', 'chief_stew'),
    ('chief_steward_ess', 'chief_stew'),
    ('stewardess', 'steward'),
    ('stew', 'steward'),
    ('steward_ess', 'steward'),
    ('second_stewardess', 'second_stew'),
    ('second_steward', 'second_stew'),
    ('2nd_stew', 'second_stew'),
    ('third_stewardess', 'third_stew'),
    ('third_steward', 'third_stew'),
    ('3rd_stew', 'third_stew'),
    ('junior_stewardess', 'junior_stew'),
    ('junior_steward', 'junior_stew'),
    ('head_of_housekeeping', 'head_housekeeper'),
    ('chef', 'head_chef'),
    ('second_chef', 'sous_chef'),
    ('ship_s_doctor', 'ships_doctor'),
    ('doctor', 'ships_doctor'),
    ('av_technician', 'av_it_technician'),
    ('it_officer', 'av_it_officer'),
    ('masseuse', 'massage_therapist'),
    ('masseur', 'massage_therapist'),
    ('beautician', 'beauty_therapist')
  ) AS s(alias, target)
  WHERE s.alias = p_key
$$;

-- The position a free-text title holds on a vessel of a company, or NULL
-- (internal; mirrored by resolvePositionFor in lib/positions.ts):
--   1. an active position visible on the vessel whose key or normalised
--      name is the normalised title: the vessel's row, then the
--      company's, then the system row;
--   2. else the company's alias for the title: the key of the position it
--      names, by rule 1's precedence (so a vessel's or the company's own
--      row with that key still wins over STORM's, and an alias to another
--      vessel's row resolves only where that key is visible);
--   3. else the fixed synonym map's key, by rule 1's precedence.
CREATE OR REPLACE FUNCTION public.crew_position_for(p_company uuid, p_vessel uuid, p_title text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_key text := public.record_normalise_office(p_title);
  v_syn text;
  v_id uuid;
BEGIN
  IF v_key IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT p.id INTO v_id
  FROM public.positions AS p
  WHERE p.is_active
    AND (p.company_id IS NULL OR (p.company_id = p_company AND (p.vessel_id IS NULL OR p.vessel_id = p_vessel)))
    AND (p.key = v_key OR public.record_normalise_office(p.name) = v_key)
  ORDER BY (p.vessel_id IS NULL), (p.company_id IS NULL), (p.key <> v_key), p.id
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  SELECT p.id INTO v_id
  FROM public.position_aliases AS a
  JOIN public.positions AS t ON t.id = a.position_id
  JOIN public.positions AS p ON p.key = t.key
  WHERE a.company_id = p_company AND a.alias_key = v_key AND p.is_active
    AND (p.company_id IS NULL OR (p.company_id = p_company AND (p.vessel_id IS NULL OR p.vessel_id = p_vessel)))
  ORDER BY (p.vessel_id IS NULL), (p.company_id IS NULL), p.id
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  v_syn := public.crew_position_synonym(v_key);
  IF v_syn IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT p.id INTO v_id
  FROM public.positions AS p
  WHERE p.is_active
    AND (p.company_id IS NULL OR (p.company_id = p_company AND (p.vessel_id IS NULL OR p.vessel_id = p_vessel)))
    AND p.key = v_syn
  ORDER BY (p.vessel_id IS NULL), (p.company_id IS NULL), p.id
  LIMIT 1;
  RETURN v_id;
END;
$$;

-- The seed of aliases and listed positions (service role; the migration
-- runs it once and it only adds missing rows):
--   * per company, every distinct normalised legacy title
--     (crew_assignments.position / rank, profiles.position / rank,
--     crew_contracts.position) that names no position of the company or
--     STORM directly but maps through the synonym map becomes a
--     'backfill' alias of that STORM position; unmatched titles stay
--     unmatched (the positions drawer lists them);
--   * per vessel, every position a current assignment holds is listed
--     (minimum 0, no maximum).
-- Returns the number of rows added: {"aliases": n, "manning": n}.
CREATE OR REPLACE FUNCTION public.crew_positions_backfill()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_aliases integer;
  v_manning integer;
BEGIN
  WITH titles AS (
    SELECT v.company_id, ca.position AS title FROM public.crew_assignments AS ca JOIN public.vessels AS v ON v.id = ca.vessel_id
    UNION ALL
    SELECT v.company_id, ca.rank FROM public.crew_assignments AS ca JOIN public.vessels AS v ON v.id = ca.vessel_id
    UNION ALL
    SELECT p.company_id, p.position FROM public.profiles AS p WHERE p.company_id IS NOT NULL
    UNION ALL
    SELECT p.company_id, p.rank FROM public.profiles AS p WHERE p.company_id IS NOT NULL
    UNION ALL
    SELECT c.company_id, c.position FROM public.crew_contracts AS c
  ),
  keyed AS (
    SELECT t.company_id, public.record_normalise_office(t.title) AS alias_key, min(left(btrim(t.title), 120)) AS alias_label
    FROM titles AS t
    WHERE t.company_id IS NOT NULL AND public.record_normalise_office(t.title) IS NOT NULL
    GROUP BY t.company_id, public.record_normalise_office(t.title)
  )
  INSERT INTO public.position_aliases (company_id, alias_key, alias_label, position_id, source)
  SELECT k.company_id, k.alias_key, k.alias_label, s.id, 'backfill'
  FROM keyed AS k
  JOIN public.positions AS s ON s.company_id IS NULL AND s.is_active AND s.key = public.crew_position_synonym(k.alias_key)
  WHERE length(k.alias_key) <= 120
    AND NOT EXISTS (
      SELECT 1 FROM public.positions AS x
      WHERE x.vessel_id IS NULL AND (x.company_id IS NULL OR x.company_id = k.company_id)
        AND (x.key = k.alias_key OR public.record_normalise_office(x.name) = k.alias_key)
    )
  ON CONFLICT (company_id, alias_key) DO NOTHING;
  GET DIAGNOSTICS v_aliases = ROW_COUNT;

  INSERT INTO public.position_manning (company_id, vessel_id, position_id, is_listed, min_on_board)
  SELECT DISTINCT h.company_id, h.vessel_id, h.position_id, true, 0
  FROM (
    SELECT v.company_id, v.id AS vessel_id,
           coalesce(public.crew_position_for(v.company_id, v.id, ca.position), public.crew_position_for(v.company_id, v.id, ca.rank)) AS position_id
    FROM public.crew_assignments AS ca
    JOIN public.vessels AS v ON v.id = ca.vessel_id
    WHERE ca.is_current AND public.crew_assignment_is_current(ca.is_current, ca.leave_date, ca.end_date)
  ) AS h
  WHERE h.position_id IS NOT NULL
  ON CONFLICT (vessel_id, position_id) DO NOTHING;
  GET DIAGNOSTICS v_manning = ROW_COUNT;

  RETURN jsonb_build_object('aliases', v_aliases, 'manning', v_manning);
END;
$$;

-- ---------------------------------------------------------------- RPCs

-- The positions visible on a vessel (one per key: the vessel's row, else
-- the company's, else STORM's; active only), with the vessel's listing,
-- rank order, manning range and the number of current assignments that
-- hold each (titles mapped through crew_position_for). Listed positions
-- first, in the vessel's rank order. Gate: vessel.crew.crew_list.view.
CREATE OR REPLACE FUNCTION public.crew_positions_for_vessel(p_vessel_id uuid)
RETURNS TABLE (
  position_id uuid,
  scope text,
  key text,
  name text,
  department_key text,
  department_label text,
  department_sort integer,
  rank_tier text,
  default_access_set_key text,
  stcw_capacity text,
  base_sort_order integer,
  sort_order integer,
  is_listed boolean,
  min_on_board integer,
  max_on_board integer,
  holder_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_company uuid;
BEGIN
  v_company := public.crew_vessel_gate('vessel.crew.crew_list.view', p_vessel_id, 'You can''t see the crew of this vessel.');
  RETURN QUERY
  WITH held AS (
    SELECT coalesce(public.crew_position_for(v_company, p_vessel_id, ca.position),
                    public.crew_position_for(v_company, p_vessel_id, ca.rank)) AS pid
    FROM public.crew_assignments AS ca
    WHERE ca.vessel_id = p_vessel_id AND ca.is_current
      AND public.crew_assignment_is_current(ca.is_current, ca.leave_date, ca.end_date)
  ),
  counts AS (
    SELECT h.pid, count(*)::integer AS n FROM held AS h WHERE h.pid IS NOT NULL GROUP BY h.pid
  ),
  visible AS (
    SELECT DISTINCT ON (p.key) p.id, p.company_id, p.vessel_id, p.key, p.name, p.department_key, p.rank_tier,
           p.default_access_set_key, p.stcw_capacity, p.sort_order
    FROM public.positions AS p
    WHERE p.is_active
      AND (p.company_id IS NULL OR (p.company_id = v_company AND (p.vessel_id IS NULL OR p.vessel_id = p_vessel_id)))
    ORDER BY p.key, (p.vessel_id IS NULL), (p.company_id IS NULL), p.id
  )
  SELECT v.id,
         CASE WHEN v.company_id IS NULL THEN 'system' WHEN v.vessel_id IS NULL THEN 'company' ELSE 'vessel' END,
         v.key, v.name, v.department_key, d.label, d.sort_order, v.rank_tier, v.default_access_set_key, v.stcw_capacity,
         v.sort_order, coalesce(pm.sort_order, v.sort_order), coalesce(pm.is_listed, false), coalesce(pm.min_on_board, 0),
         pm.max_on_board, coalesce(c.n, 0)
  FROM visible AS v
  JOIN public.departments AS d ON d.key = v.department_key
  LEFT JOIN public.position_manning AS pm ON pm.vessel_id = p_vessel_id AND pm.position_id = v.id
  LEFT JOIN counts AS c ON c.pid = v.id
  ORDER BY coalesce(pm.is_listed, false) DESC, coalesce(pm.sort_order, v.sort_order), v.name, v.id;
END;
$$;

-- The titles of current assignments on the vessel that map to no
-- position (by position, then by rank), grouped by their normalised form,
-- most-held first. The drawer's "Unmatched titles" mapper reads it. Gate:
-- vessel.crew.crew_list.view.
CREATE OR REPLACE FUNCTION public.crew_vessel_unmatched_titles(p_vessel_id uuid)
RETURNS TABLE (title text, title_key text, holder_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_company uuid;
BEGIN
  v_company := public.crew_vessel_gate('vessel.crew.crew_list.view', p_vessel_id, 'You can''t see the crew of this vessel.');
  RETURN QUERY
  WITH cur AS (
    SELECT coalesce(nullif(btrim(ca.position), ''), nullif(btrim(ca.rank), '')) AS t, ca.position AS pos, ca.rank AS rnk
    FROM public.crew_assignments AS ca
    WHERE ca.vessel_id = p_vessel_id AND ca.is_current
      AND public.crew_assignment_is_current(ca.is_current, ca.leave_date, ca.end_date)
  ),
  unmatched AS (
    SELECT c.t, public.record_normalise_office(c.t) AS k
    FROM cur AS c
    WHERE public.record_normalise_office(c.t) IS NOT NULL
      AND public.crew_position_for(v_company, p_vessel_id, c.pos) IS NULL
      AND public.crew_position_for(v_company, p_vessel_id, c.rnk) IS NULL
  )
  SELECT min(u.t), u.k, count(*)::integer
  FROM unmatched AS u
  GROUP BY u.k
  ORDER BY count(*) DESC, min(u.t);
END;
$$;

-- A new position for this vessel (p_vessel_only, the default: needs
-- vessel.crew.crew_compliance.admin on the vessel) or for the whole
-- company (needs the company-level answer of the same key). The key is
-- record_normalise_office(name); a position with that key or name (or a
-- synonym of one) already visible there is refused (22023
-- position_exists), so a vessel lists the existing one instead. When the
-- caller administers the vessel the new position is listed on it at once.
-- Returns the row.
CREATE OR REPLACE FUNCTION public.crew_position_create(
  p_vessel_id uuid,
  p_name text,
  p_department_key text,
  p_rank_tier text,
  p_default_access_set_key text DEFAULT NULL,
  p_vessel_only boolean DEFAULT true
)
RETURNS public.positions
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_vessel_only boolean := coalesce(p_vessel_only, true);
  v_company uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_key text;
  v_access text;
  v_existing text;
  v_dept_sort integer;
  v_vessel_admin boolean;
  v_row public.positions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  IF p_vessel_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'vessel_required';
  END IF;
  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = p_vessel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'vessel_not_found', DETAIL = 'This vessel could not be found.';
  END IF;
  v_vessel_admin := public.crew_vessel_cap('vessel.crew.crew_compliance.admin', p_vessel_id);
  IF v_vessel_only THEN
    IF NOT v_vessel_admin THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'positions_not_permitted',
        DETAIL = 'Only a crew compliance administrator of this vessel can add positions to it.';
    END IF;
  ELSIF NOT public.has_capability_for(v_uid, 'vessel.crew.crew_compliance.admin', v_company, NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'positions_not_permitted',
      DETAIL = 'Only a company-wide crew compliance administrator can add a position for the whole company.';
  END IF;

  IF length(v_name) < 1 OR length(v_name) > 80 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'position_name_invalid',
      DETAIL = 'Give the position a name of 1 to 80 characters.';
  END IF;
  v_key := public.record_normalise_office(v_name);
  IF v_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'position_name_invalid',
      DETAIL = 'Give the position a name with letters in it.';
  END IF;
  SELECT d.sort_order INTO v_dept_sort FROM public.departments AS d WHERE d.key = p_department_key AND d.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'department_unknown', DETAIL = 'Choose a department.';
  END IF;
  IF p_rank_tier IS NULL OR p_rank_tier NOT IN ('command', 'hod', 'officer', 'rating', 'trainee') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'rank_tier_invalid', DETAIL = 'Choose a rank tier.';
  END IF;
  v_access := coalesce(p_default_access_set_key,
    CASE p_rank_tier WHEN 'command' THEN 'full_vessel' WHEN 'hod' THEN 'hod' WHEN 'officer' THEN 'officer' ELSE 'crew' END);
  IF v_access NOT IN ('full_vessel', 'hod', 'officer', 'crew', 'view_only') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'access_set_invalid', DETAIL = 'Choose a default access set.';
  END IF;

  -- Already there: an active position with this key, name or synonym that
  -- the new row would sit beside (STORM's, the company's, and for a vessel
  -- row the vessel's), or any row of the same scope with this key.
  SELECT p.name INTO v_existing
  FROM public.positions AS p
  WHERE (
      p.is_active
      AND (p.company_id IS NULL OR (p.company_id = v_company AND (p.vessel_id IS NULL OR (v_vessel_only AND p.vessel_id = p_vessel_id))))
      AND (p.key = v_key OR p.key = public.crew_position_synonym(v_key) OR public.record_normalise_office(p.name) = v_key)
    ) OR (
      p.company_id = v_company AND p.key = v_key
      AND p.vessel_id IS NOT DISTINCT FROM (CASE WHEN v_vessel_only THEN p_vessel_id END)
    )
  ORDER BY (p.vessel_id IS NULL), (p.company_id IS NULL)
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'position_exists',
      DETAIL = format('A position called "%s" already exists. List it on this vessel instead.', v_existing);
  END IF;
  -- A key starts with a letter ("2nd Engineer" is a synonym of Second
  -- Engineer and was refused above as existing).
  IF v_key !~ '^[a-z][a-z0-9_]*$' OR length(v_key) > 80 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'position_name_invalid',
      DETAIL = 'Start the position name with a letter, for example "Second Engineer".';
  END IF;

  BEGIN
    INSERT INTO public.positions (company_id, vessel_id, key, name, department_key, rank_tier, default_access_set_key, sort_order, created_by, updated_by)
    VALUES (v_company, CASE WHEN v_vessel_only THEN p_vessel_id END, v_key, v_name, p_department_key, p_rank_tier, v_access,
            (CASE p_rank_tier WHEN 'command' THEN 1 WHEN 'hod' THEN 2 WHEN 'officer' THEN 3 WHEN 'rating' THEN 4 ELSE 5 END) * 10000 + v_dept_sort * 10 + 9,
            v_uid, v_uid)
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'position_exists',
      DETAIL = format('A position called "%s" already exists. List it on this vessel instead.', v_name);
  END;

  IF v_vessel_admin THEN
    INSERT INTO public.position_manning (company_id, vessel_id, position_id, is_listed, min_on_board, updated_by)
    VALUES (v_company, p_vessel_id, v_row.id, true, 0, v_uid)
    ON CONFLICT (vessel_id, position_id) DO UPDATE SET is_listed = true, updated_by = EXCLUDED.updated_by;
  END IF;
  RETURN v_row;
END;
$$;

-- Save the vessel's positions in one transaction: p_rows is an array of
-- {position_id, sort_order, is_listed, min_on_board, max_on_board}; each
-- position must be active and visible on the vessel (22023
-- position_unknown) and 0 <= min <= max <= 500 when a maximum is given
-- (22023 manning_range_invalid). Positions not in p_rows are left as they
-- are. Returns the number of rows written (the client checks it equals
-- the rows it sent). Gate: vessel.crew.crew_compliance.admin.
CREATE OR REPLACE FUNCTION public.crew_vessel_positions_save(p_vessel_id uuid, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_count integer;
  v_n integer;
BEGIN
  v_company := public.crew_vessel_gate('vessel.crew.crew_compliance.admin', p_vessel_id,
    'Only a crew compliance administrator of this vessel can change its positions and manning.');
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 500
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) AS e WHERE jsonb_typeof(e) <> 'object') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'rows_invalid';
  END IF;
  v_count := jsonb_array_length(p_rows);
  IF v_count = 0 THEN
    RETURN 0;
  END IF;

  BEGIN
    IF EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_rows) AS r(position_id uuid, sort_order integer, is_listed boolean, min_on_board integer, max_on_board integer)
      WHERE r.position_id IS NULL
    ) OR (
      SELECT count(DISTINCT r.position_id) FROM jsonb_to_recordset(p_rows) AS r(position_id uuid)
    ) <> v_count THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'rows_invalid';
    END IF;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datatype_mismatch THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'rows_invalid';
  END;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_rows) AS r(position_id uuid)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.positions AS p
      WHERE p.id = r.position_id AND p.is_active
        AND (p.company_id IS NULL OR (p.company_id = v_company AND (p.vessel_id IS NULL OR p.vessel_id = p_vessel_id)))
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'position_unknown',
      DETAIL = 'One of these positions is not available on this vessel.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_rows) AS r(sort_order integer, min_on_board integer, max_on_board integer)
    WHERE coalesce(r.min_on_board, 0) NOT BETWEEN 0 AND 500
       OR (r.max_on_board IS NOT NULL AND (r.max_on_board < coalesce(r.min_on_board, 0) OR r.max_on_board > 500))
       OR (r.sort_order IS NOT NULL AND r.sort_order NOT BETWEEN 0 AND 999999)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'manning_range_invalid',
      DETAIL = 'The minimum on board must be 0 to 500, and a maximum no lower than the minimum.';
  END IF;

  INSERT INTO public.position_manning (company_id, vessel_id, position_id, sort_order, is_listed, min_on_board, max_on_board, updated_by)
  SELECT v_company, p_vessel_id, r.position_id, r.sort_order, coalesce(r.is_listed, true), coalesce(r.min_on_board, 0), r.max_on_board, v_uid
  FROM jsonb_to_recordset(p_rows) AS r(position_id uuid, sort_order integer, is_listed boolean, min_on_board integer, max_on_board integer)
  ON CONFLICT (vessel_id, position_id) DO UPDATE
    SET sort_order = EXCLUDED.sort_order,
        is_listed = EXCLUDED.is_listed,
        min_on_board = EXCLUDED.min_on_board,
        max_on_board = EXCLUDED.max_on_board,
        updated_by = EXCLUDED.updated_by;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- Map a job title to a position for the vessel's company (an alias). The
-- position must be active and visible on the vessel (22023
-- position_unknown); a title that already names a position needs no alias
-- (22023 alias_is_position). Creating an alias needs
-- vessel.crew.crew_compliance.admin on the vessel; re-pointing one that
-- exists changes it for every vessel of the company, so it needs the
-- company-level answer (42501 otherwise). Returns the row.
CREATE OR REPLACE FUNCTION public.crew_position_alias_set(p_vessel_id uuid, p_alias text, p_position_id uuid)
RETURNS public.position_aliases
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_label text := btrim(coalesce(p_alias, ''));
  v_key text;
  v_current uuid;
  v_row public.position_aliases;
BEGIN
  v_company := public.crew_vessel_gate('vessel.crew.crew_compliance.admin', p_vessel_id,
    'Only a crew compliance administrator of this vessel can map job titles to positions.');
  v_key := public.record_normalise_office(v_label);
  IF length(v_label) > 120 OR v_key IS NULL OR length(v_key) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'alias_invalid', DETAIL = 'Give a job title of 1 to 120 characters.';
  END IF;
  IF p_position_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.positions AS p
    WHERE p.id = p_position_id AND p.is_active
      AND (p.company_id IS NULL OR (p.company_id = v_company AND (p.vessel_id IS NULL OR p.vessel_id = p_vessel_id)))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'position_unknown', DETAIL = 'This position is not available on this vessel.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.positions AS p
    WHERE p.is_active
      AND (p.company_id IS NULL OR (p.company_id = v_company AND (p.vessel_id IS NULL OR p.vessel_id = p_vessel_id)))
      AND (p.key = v_key OR public.record_normalise_office(p.name) = v_key)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'alias_is_position', DETAIL = 'This job title already names a position.';
  END IF;

  SELECT a.position_id INTO v_current
  FROM public.position_aliases AS a
  WHERE a.company_id = v_company AND a.alias_key = v_key
  FOR UPDATE;
  IF FOUND AND v_current IS DISTINCT FROM p_position_id
     AND NOT coalesce(public.has_capability_for(v_uid, 'vessel.crew.crew_compliance.admin', v_company, NULL), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'alias_change_not_permitted',
      DETAIL = 'This job title is already mapped for the whole company. Only a company-wide crew compliance administrator can change it.';
  END IF;

  INSERT INTO public.position_aliases (company_id, alias_key, alias_label, position_id, source, created_by, updated_by)
  VALUES (v_company, v_key, v_label, p_position_id, 'manual', v_uid, v_uid)
  ON CONFLICT (company_id, alias_key) DO UPDATE
    SET position_id = EXCLUDED.position_id,
        alias_label = EXCLUDED.alias_label,
        source = 'manual',
        updated_by = EXCLUDED.updated_by
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------- RLS

ALTER TABLE public.ref_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ref_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.position_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.position_manning ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ref_countries_select_active ON public.ref_countries;
CREATE POLICY ref_countries_select_active ON public.ref_countries
  FOR SELECT TO authenticated
  USING ((SELECT public.user_is_active((SELECT auth.uid()))));

DROP POLICY IF EXISTS ref_languages_select_active ON public.ref_languages;
CREATE POLICY ref_languages_select_active ON public.ref_languages
  FOR SELECT TO authenticated
  USING ((SELECT public.user_is_active((SELECT auth.uid()))));

DROP POLICY IF EXISTS departments_select_active ON public.departments;
CREATE POLICY departments_select_active ON public.departments
  FOR SELECT TO authenticated
  USING ((SELECT public.user_is_active((SELECT auth.uid()))));

DROP POLICY IF EXISTS contract_types_select_scoped ON public.contract_types;
CREATE POLICY contract_types_select_scoped ON public.contract_types
  FOR SELECT TO authenticated
  USING (
    (SELECT public.user_is_active((SELECT auth.uid())))
    AND (company_id IS NULL OR public.user_belongs_to_company((SELECT auth.uid()), company_id))
  );

DROP POLICY IF EXISTS positions_select_scoped ON public.positions;
CREATE POLICY positions_select_scoped ON public.positions
  FOR SELECT TO authenticated
  USING (
    (SELECT public.user_is_active((SELECT auth.uid())))
    AND (
      company_id IS NULL
      OR (vessel_id IS NULL AND public.user_belongs_to_company((SELECT auth.uid()), company_id))
      OR (vessel_id IS NOT NULL
          AND public.user_belongs_to_company((SELECT auth.uid()), company_id)
          AND vessel_id IN (SELECT public.user_vessel_reach((SELECT auth.uid()))))
    )
  );

DROP POLICY IF EXISTS position_aliases_select_company ON public.position_aliases;
CREATE POLICY position_aliases_select_company ON public.position_aliases
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company((SELECT auth.uid()), company_id));

DROP POLICY IF EXISTS position_manning_select_crew_list ON public.position_manning;
CREATE POLICY position_manning_select_crew_list ON public.position_manning
  FOR SELECT TO authenticated
  USING (
    public.user_belongs_to_company((SELECT auth.uid()), company_id)
    AND vessel_id IN (SELECT public.crew_cap_vessel_ids('vessel.crew.crew_list.view'))
  );

-- ---------------------------------------------------------------- grants

-- Reads only for the browser (writes go through the RPCs); nothing for anon.
REVOKE ALL ON TABLE public.ref_countries, public.ref_languages, public.departments, public.contract_types,
  public.positions, public.position_aliases, public.position_manning FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ref_countries, public.ref_languages, public.departments, public.contract_types,
  public.positions, public.position_aliases, public.position_manning TO authenticated;
GRANT ALL ON TABLE public.ref_countries, public.ref_languages, public.departments, public.contract_types,
  public.positions, public.position_aliases, public.position_manning TO service_role;

-- Trigger functions: nobody.
REVOKE ALL ON FUNCTION public.positions_scope_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.position_manning_scope_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.position_aliases_scope_guard() FROM PUBLIC, anon, authenticated, service_role;

-- Policy helpers (policies call them as the caller) and the browser RPCs.
REVOKE ALL ON FUNCTION public.crew_vessel_cap(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_vessel_cap(text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_cap_vessel_ids(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_cap_vessel_ids(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_positions_for_vessel(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_positions_for_vessel(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_vessel_unmatched_titles(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_vessel_unmatched_titles(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_position_create(uuid, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_position_create(uuid, text, text, text, text, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_vessel_positions_save(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_vessel_positions_save(uuid, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_position_alias_set(uuid, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_position_alias_set(uuid, text, uuid) TO authenticated, service_role;

-- Internal: definers (as owner) and the service role.
REVOKE ALL ON FUNCTION public.crew_vessel_gate(text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_vessel_gate(text, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.crew_position_synonym(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_position_synonym(text) TO service_role;
REVOKE ALL ON FUNCTION public.crew_position_for(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_position_for(uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.crew_positions_backfill() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_positions_backfill() TO service_role;

COMMENT ON FUNCTION public.crew_vessel_cap(text, uuid) IS 'X1 gate: the caller (signed in, active, a member of the vessel''s company) holds the capability key on the vessel (has_capability_for, reach included). False without a JWT and for an unknown or foreign vessel. Policies and X1 definers call it.';
COMMENT ON FUNCTION public.crew_cap_vessel_ids(text) IS 'X1 caller-only set (D-229): the vessels of the caller''s company the caller reaches and holds the key on; empty without a JWT or for an inactive caller. Policies use vessel_id IN (SELECT crew_cap_vessel_ids(key)).';
COMMENT ON FUNCTION public.crew_vessel_gate(text, uuid, text) IS 'X1 RPC gate (internal): signed in, known vessel (P0002), the key on it (42501 with the given DETAIL); returns the vessel''s company.';
COMMENT ON FUNCTION public.crew_position_synonym(text) IS 'The fixed synonym map of position titles (normalised title -> system position key); mirrored by POSITION_SYNONYMS in src/modules/crew/lib/positions.ts.';
COMMENT ON FUNCTION public.crew_position_for(uuid, uuid, text) IS 'The position a free-text title holds on a vessel of a company: key or normalised name (vessel row, company row, system row), then the key of the company alias, then the synonym map, each by that precedence; NULL when unmatched. Internal; mirrored by resolvePositionFor in src/modules/crew/lib/positions.ts.';
COMMENT ON FUNCTION public.crew_positions_backfill() IS 'Seed (service role, idempotent): backfill aliases for legacy titles that map through the synonym map, and list on each vessel the positions its current assignments hold. Returns the rows added.';
COMMENT ON FUNCTION public.crew_positions_for_vessel(uuid) IS 'The positions visible on a vessel (one per key, active), with its listing, rank order, manning range and holder counts. Gate: vessel.crew.crew_list.view.';
COMMENT ON FUNCTION public.crew_vessel_unmatched_titles(uuid) IS 'Titles of current assignments on the vessel that map to no position, grouped by normalised form. Gate: vessel.crew.crew_list.view.';
COMMENT ON FUNCTION public.crew_position_create(uuid, text, text, text, text, boolean) IS 'Create a vessel position (vessel.crew.crew_compliance.admin on the vessel) or a company position (the company-level answer); 22023 position_exists when one with that key, name or synonym is already visible; lists it on the vessel when the caller administers it. Returns the row.';
COMMENT ON FUNCTION public.crew_vessel_positions_save(uuid, jsonb) IS 'Save a vessel''s listed positions, rank order and manning range in one transaction (vessel.crew.crew_compliance.admin); 22023 rows_invalid / position_unknown / manning_range_invalid. Returns the rows written.';
COMMENT ON FUNCTION public.crew_position_alias_set(uuid, text, uuid) IS 'Map a job title to a position for the vessel''s company (vessel.crew.crew_compliance.admin; re-pointing an existing alias needs the company-level answer). Returns the alias row.';

-- ---------------------------------------------------------------- seeds (STORM wording, D-07; public standards)

INSERT INTO public.departments (key, label, sort_order)
VALUES
  ('bridge', 'Bridge', 10),
  ('deck', 'Deck', 20),
  ('engineering', 'Engineering', 30),
  ('interior', 'Interior', 40),
  ('galley', 'Galley', 50),
  ('purser_office', 'Purser''s Office', 60),
  ('medical', 'Medical', 70),
  ('security', 'Security', 80),
  ('dive', 'Dive', 90),
  ('media', 'Media', 100),
  ('it_av', 'IT & AV', 110),
  ('spa_wellness', 'Spa & Wellness', 120),
  ('other', 'Other', 900)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.ref_countries (iso2, iso3, name, demonym, dial_code, sort_name, flag_emoji)
SELECT s.iso2, s.iso3, s.name, s.demonym, s.dial_code, s.sort_name,
       chr(127397 + ascii(substr(s.iso2, 1, 1))) || chr(127397 + ascii(substr(s.iso2, 2, 1)))
FROM (VALUES
  ('AD', 'AND', 'Andorra', 'Andorran', '376', 'Andorra'),
  ('AE', 'ARE', 'United Arab Emirates', 'Emirati', '971', 'United Arab Emirates'),
  ('AF', 'AFG', 'Afghanistan', 'Afghan', '93', 'Afghanistan'),
  ('AG', 'ATG', 'Antigua and Barbuda', 'Antiguan and Barbudan', '1268', 'Antigua and Barbuda'),
  ('AI', 'AIA', 'Anguilla', 'Anguillan', '1264', 'Anguilla'),
  ('AL', 'ALB', 'Albania', 'Albanian', '355', 'Albania'),
  ('AM', 'ARM', 'Armenia', 'Armenian', '374', 'Armenia'),
  ('AO', 'AGO', 'Angola', 'Angolan', '244', 'Angola'),
  ('AQ', 'ATA', 'Antarctica', NULL, '672', 'Antarctica'),
  ('AR', 'ARG', 'Argentina', 'Argentine', '54', 'Argentina'),
  ('AS', 'ASM', 'American Samoa', 'American Samoan', '1684', 'American Samoa'),
  ('AT', 'AUT', 'Austria', 'Austrian', '43', 'Austria'),
  ('AU', 'AUS', 'Australia', 'Australian', '61', 'Australia'),
  ('AW', 'ABW', 'Aruba', 'Aruban', '297', 'Aruba'),
  ('AX', 'ALA', 'Åland Islands', 'Ålander', '358', 'Aland Islands'),
  ('AZ', 'AZE', 'Azerbaijan', 'Azerbaijani', '994', 'Azerbaijan'),
  ('BA', 'BIH', 'Bosnia and Herzegovina', 'Bosnian', '387', 'Bosnia and Herzegovina'),
  ('BB', 'BRB', 'Barbados', 'Barbadian', '1246', 'Barbados'),
  ('BD', 'BGD', 'Bangladesh', 'Bangladeshi', '880', 'Bangladesh'),
  ('BE', 'BEL', 'Belgium', 'Belgian', '32', 'Belgium'),
  ('BF', 'BFA', 'Burkina Faso', 'Burkinabé', '226', 'Burkina Faso'),
  ('BG', 'BGR', 'Bulgaria', 'Bulgarian', '359', 'Bulgaria'),
  ('BH', 'BHR', 'Bahrain', 'Bahraini', '973', 'Bahrain'),
  ('BI', 'BDI', 'Burundi', 'Burundian', '257', 'Burundi'),
  ('BJ', 'BEN', 'Benin', 'Beninese', '229', 'Benin'),
  ('BL', 'BLM', 'Saint Barthélemy', 'Barthélemois', '590', 'Saint Barthelemy'),
  ('BM', 'BMU', 'Bermuda', 'Bermudian', '1441', 'Bermuda'),
  ('BN', 'BRN', 'Brunei Darussalam', 'Bruneian', '673', 'Brunei Darussalam'),
  ('BO', 'BOL', 'Bolivia', 'Bolivian', '591', 'Bolivia'),
  ('BQ', 'BES', 'Bonaire, Sint Eustatius and Saba', 'Dutch Caribbean', '599', 'Bonaire, Sint Eustatius and Saba'),
  ('BR', 'BRA', 'Brazil', 'Brazilian', '55', 'Brazil'),
  ('BS', 'BHS', 'Bahamas', 'Bahamian', '1242', 'Bahamas'),
  ('BT', 'BTN', 'Bhutan', 'Bhutanese', '975', 'Bhutan'),
  ('BV', 'BVT', 'Bouvet Island', NULL, NULL, 'Bouvet Island'),
  ('BW', 'BWA', 'Botswana', 'Motswana', '267', 'Botswana'),
  ('BY', 'BLR', 'Belarus', 'Belarusian', '375', 'Belarus'),
  ('BZ', 'BLZ', 'Belize', 'Belizean', '501', 'Belize'),
  ('CA', 'CAN', 'Canada', 'Canadian', '1', 'Canada'),
  ('CC', 'CCK', 'Cocos (Keeling) Islands', 'Cocos Islander', '61', 'Cocos (Keeling) Islands'),
  ('CD', 'COD', 'Democratic Republic of the Congo', 'Congolese', '243', 'Democratic Republic of the Congo'),
  ('CF', 'CAF', 'Central African Republic', 'Central African', '236', 'Central African Republic'),
  ('CG', 'COG', 'Republic of the Congo', 'Congolese', '242', 'Republic of the Congo'),
  ('CH', 'CHE', 'Switzerland', 'Swiss', '41', 'Switzerland'),
  ('CI', 'CIV', 'Côte d''Ivoire', 'Ivorian', '225', 'Cote d''Ivoire'),
  ('CK', 'COK', 'Cook Islands', 'Cook Islander', '682', 'Cook Islands'),
  ('CL', 'CHL', 'Chile', 'Chilean', '56', 'Chile'),
  ('CM', 'CMR', 'Cameroon', 'Cameroonian', '237', 'Cameroon'),
  ('CN', 'CHN', 'China', 'Chinese', '86', 'China'),
  ('CO', 'COL', 'Colombia', 'Colombian', '57', 'Colombia'),
  ('CR', 'CRI', 'Costa Rica', 'Costa Rican', '506', 'Costa Rica'),
  ('CU', 'CUB', 'Cuba', 'Cuban', '53', 'Cuba'),
  ('CV', 'CPV', 'Cabo Verde', 'Cabo Verdean', '238', 'Cabo Verde'),
  ('CW', 'CUW', 'Curaçao', 'Curaçaoan', '599', 'Curacao'),
  ('CX', 'CXR', 'Christmas Island', 'Christmas Islander', '61', 'Christmas Island'),
  ('CY', 'CYP', 'Cyprus', 'Cypriot', '357', 'Cyprus'),
  ('CZ', 'CZE', 'Czechia', 'Czech', '420', 'Czechia'),
  ('DE', 'DEU', 'Germany', 'German', '49', 'Germany'),
  ('DJ', 'DJI', 'Djibouti', 'Djiboutian', '253', 'Djibouti'),
  ('DK', 'DNK', 'Denmark', 'Danish', '45', 'Denmark'),
  ('DM', 'DMA', 'Dominica', 'Dominican', '1767', 'Dominica'),
  ('DO', 'DOM', 'Dominican Republic', 'Dominican', '1809', 'Dominican Republic'),
  ('DZ', 'DZA', 'Algeria', 'Algerian', '213', 'Algeria'),
  ('EC', 'ECU', 'Ecuador', 'Ecuadorian', '593', 'Ecuador'),
  ('EE', 'EST', 'Estonia', 'Estonian', '372', 'Estonia'),
  ('EG', 'EGY', 'Egypt', 'Egyptian', '20', 'Egypt'),
  ('EH', 'ESH', 'Western Sahara', 'Sahrawi', '212', 'Western Sahara'),
  ('ER', 'ERI', 'Eritrea', 'Eritrean', '291', 'Eritrea'),
  ('ES', 'ESP', 'Spain', 'Spanish', '34', 'Spain'),
  ('ET', 'ETH', 'Ethiopia', 'Ethiopian', '251', 'Ethiopia'),
  ('FI', 'FIN', 'Finland', 'Finnish', '358', 'Finland'),
  ('FJ', 'FJI', 'Fiji', 'Fijian', '679', 'Fiji'),
  ('FK', 'FLK', 'Falkland Islands', 'Falkland Islander', '500', 'Falkland Islands'),
  ('FM', 'FSM', 'Micronesia', 'Micronesian', '691', 'Micronesia'),
  ('FO', 'FRO', 'Faroe Islands', 'Faroese', '298', 'Faroe Islands'),
  ('FR', 'FRA', 'France', 'French', '33', 'France'),
  ('GA', 'GAB', 'Gabon', 'Gabonese', '241', 'Gabon'),
  ('GB', 'GBR', 'United Kingdom', 'British', '44', 'United Kingdom'),
  ('GD', 'GRD', 'Grenada', 'Grenadian', '1473', 'Grenada'),
  ('GE', 'GEO', 'Georgia', 'Georgian', '995', 'Georgia'),
  ('GF', 'GUF', 'French Guiana', 'French Guianese', '594', 'French Guiana'),
  ('GG', 'GGY', 'Guernsey', 'Guernsey', '44', 'Guernsey'),
  ('GH', 'GHA', 'Ghana', 'Ghanaian', '233', 'Ghana'),
  ('GI', 'GIB', 'Gibraltar', 'Gibraltarian', '350', 'Gibraltar'),
  ('GL', 'GRL', 'Greenland', 'Greenlandic', '299', 'Greenland'),
  ('GM', 'GMB', 'Gambia', 'Gambian', '220', 'Gambia'),
  ('GN', 'GIN', 'Guinea', 'Guinean', '224', 'Guinea'),
  ('GP', 'GLP', 'Guadeloupe', 'Guadeloupean', '590', 'Guadeloupe'),
  ('GQ', 'GNQ', 'Equatorial Guinea', 'Equatorial Guinean', '240', 'Equatorial Guinea'),
  ('GR', 'GRC', 'Greece', 'Greek', '30', 'Greece'),
  ('GS', 'SGS', 'South Georgia and the South Sandwich Islands', NULL, '500', 'South Georgia and the South Sandwich Islands'),
  ('GT', 'GTM', 'Guatemala', 'Guatemalan', '502', 'Guatemala'),
  ('GU', 'GUM', 'Guam', 'Guamanian', '1671', 'Guam'),
  ('GW', 'GNB', 'Guinea-Bissau', 'Bissau-Guinean', '245', 'Guinea-Bissau'),
  ('GY', 'GUY', 'Guyana', 'Guyanese', '592', 'Guyana'),
  ('HK', 'HKG', 'Hong Kong', 'Hong Konger', '852', 'Hong Kong'),
  ('HM', 'HMD', 'Heard Island and McDonald Islands', NULL, NULL, 'Heard Island and McDonald Islands'),
  ('HN', 'HND', 'Honduras', 'Honduran', '504', 'Honduras'),
  ('HR', 'HRV', 'Croatia', 'Croatian', '385', 'Croatia'),
  ('HT', 'HTI', 'Haiti', 'Haitian', '509', 'Haiti'),
  ('HU', 'HUN', 'Hungary', 'Hungarian', '36', 'Hungary'),
  ('ID', 'IDN', 'Indonesia', 'Indonesian', '62', 'Indonesia'),
  ('IE', 'IRL', 'Ireland', 'Irish', '353', 'Ireland'),
  ('IL', 'ISR', 'Israel', 'Israeli', '972', 'Israel'),
  ('IM', 'IMN', 'Isle of Man', 'Manx', '44', 'Isle of Man'),
  ('IN', 'IND', 'India', 'Indian', '91', 'India'),
  ('IO', 'IOT', 'British Indian Ocean Territory', NULL, '246', 'British Indian Ocean Territory'),
  ('IQ', 'IRQ', 'Iraq', 'Iraqi', '964', 'Iraq'),
  ('IR', 'IRN', 'Iran', 'Iranian', '98', 'Iran'),
  ('IS', 'ISL', 'Iceland', 'Icelandic', '354', 'Iceland'),
  ('IT', 'ITA', 'Italy', 'Italian', '39', 'Italy'),
  ('JE', 'JEY', 'Jersey', 'Jersey', '44', 'Jersey'),
  ('JM', 'JAM', 'Jamaica', 'Jamaican', '1876', 'Jamaica'),
  ('JO', 'JOR', 'Jordan', 'Jordanian', '962', 'Jordan'),
  ('JP', 'JPN', 'Japan', 'Japanese', '81', 'Japan'),
  ('KE', 'KEN', 'Kenya', 'Kenyan', '254', 'Kenya'),
  ('KG', 'KGZ', 'Kyrgyzstan', 'Kyrgyz', '996', 'Kyrgyzstan'),
  ('KH', 'KHM', 'Cambodia', 'Cambodian', '855', 'Cambodia'),
  ('KI', 'KIR', 'Kiribati', 'I-Kiribati', '686', 'Kiribati'),
  ('KM', 'COM', 'Comoros', 'Comoran', '269', 'Comoros'),
  ('KN', 'KNA', 'Saint Kitts and Nevis', 'Kittitian and Nevisian', '1869', 'Saint Kitts and Nevis'),
  ('KP', 'PRK', 'North Korea', 'North Korean', '850', 'North Korea'),
  ('KR', 'KOR', 'South Korea', 'South Korean', '82', 'South Korea'),
  ('KW', 'KWT', 'Kuwait', 'Kuwaiti', '965', 'Kuwait'),
  ('KY', 'CYM', 'Cayman Islands', 'Caymanian', '1345', 'Cayman Islands'),
  ('KZ', 'KAZ', 'Kazakhstan', 'Kazakh', '7', 'Kazakhstan'),
  ('LA', 'LAO', 'Laos', 'Lao', '856', 'Laos'),
  ('LB', 'LBN', 'Lebanon', 'Lebanese', '961', 'Lebanon'),
  ('LC', 'LCA', 'Saint Lucia', 'Saint Lucian', '1758', 'Saint Lucia'),
  ('LI', 'LIE', 'Liechtenstein', 'Liechtensteiner', '423', 'Liechtenstein'),
  ('LK', 'LKA', 'Sri Lanka', 'Sri Lankan', '94', 'Sri Lanka'),
  ('LR', 'LBR', 'Liberia', 'Liberian', '231', 'Liberia'),
  ('LS', 'LSO', 'Lesotho', 'Mosotho', '266', 'Lesotho'),
  ('LT', 'LTU', 'Lithuania', 'Lithuanian', '370', 'Lithuania'),
  ('LU', 'LUX', 'Luxembourg', 'Luxembourgish', '352', 'Luxembourg'),
  ('LV', 'LVA', 'Latvia', 'Latvian', '371', 'Latvia'),
  ('LY', 'LBY', 'Libya', 'Libyan', '218', 'Libya'),
  ('MA', 'MAR', 'Morocco', 'Moroccan', '212', 'Morocco'),
  ('MC', 'MCO', 'Monaco', 'Monegasque', '377', 'Monaco'),
  ('MD', 'MDA', 'Moldova', 'Moldovan', '373', 'Moldova'),
  ('ME', 'MNE', 'Montenegro', 'Montenegrin', '382', 'Montenegro'),
  ('MF', 'MAF', 'Saint Martin (French part)', 'Saint-Martinois', '590', 'Saint Martin (French part)'),
  ('MG', 'MDG', 'Madagascar', 'Malagasy', '261', 'Madagascar'),
  ('MH', 'MHL', 'Marshall Islands', 'Marshallese', '692', 'Marshall Islands'),
  ('MK', 'MKD', 'North Macedonia', 'Macedonian', '389', 'North Macedonia'),
  ('ML', 'MLI', 'Mali', 'Malian', '223', 'Mali'),
  ('MM', 'MMR', 'Myanmar', 'Burmese', '95', 'Myanmar'),
  ('MN', 'MNG', 'Mongolia', 'Mongolian', '976', 'Mongolia'),
  ('MO', 'MAC', 'Macao', 'Macanese', '853', 'Macao'),
  ('MP', 'MNP', 'Northern Mariana Islands', 'Northern Mariana Islander', '1670', 'Northern Mariana Islands'),
  ('MQ', 'MTQ', 'Martinique', 'Martinican', '596', 'Martinique'),
  ('MR', 'MRT', 'Mauritania', 'Mauritanian', '222', 'Mauritania'),
  ('MS', 'MSR', 'Montserrat', 'Montserratian', '1664', 'Montserrat'),
  ('MT', 'MLT', 'Malta', 'Maltese', '356', 'Malta'),
  ('MU', 'MUS', 'Mauritius', 'Mauritian', '230', 'Mauritius'),
  ('MV', 'MDV', 'Maldives', 'Maldivian', '960', 'Maldives'),
  ('MW', 'MWI', 'Malawi', 'Malawian', '265', 'Malawi'),
  ('MX', 'MEX', 'Mexico', 'Mexican', '52', 'Mexico'),
  ('MY', 'MYS', 'Malaysia', 'Malaysian', '60', 'Malaysia'),
  ('MZ', 'MOZ', 'Mozambique', 'Mozambican', '258', 'Mozambique'),
  ('NA', 'NAM', 'Namibia', 'Namibian', '264', 'Namibia'),
  ('NC', 'NCL', 'New Caledonia', 'New Caledonian', '687', 'New Caledonia'),
  ('NE', 'NER', 'Niger', 'Nigerien', '227', 'Niger'),
  ('NF', 'NFK', 'Norfolk Island', 'Norfolk Islander', '672', 'Norfolk Island'),
  ('NG', 'NGA', 'Nigeria', 'Nigerian', '234', 'Nigeria'),
  ('NI', 'NIC', 'Nicaragua', 'Nicaraguan', '505', 'Nicaragua'),
  ('NL', 'NLD', 'Netherlands', 'Dutch', '31', 'Netherlands'),
  ('NO', 'NOR', 'Norway', 'Norwegian', '47', 'Norway'),
  ('NP', 'NPL', 'Nepal', 'Nepali', '977', 'Nepal'),
  ('NR', 'NRU', 'Nauru', 'Nauruan', '674', 'Nauru'),
  ('NU', 'NIU', 'Niue', 'Niuean', '683', 'Niue'),
  ('NZ', 'NZL', 'New Zealand', 'New Zealander', '64', 'New Zealand'),
  ('OM', 'OMN', 'Oman', 'Omani', '968', 'Oman'),
  ('PA', 'PAN', 'Panama', 'Panamanian', '507', 'Panama'),
  ('PE', 'PER', 'Peru', 'Peruvian', '51', 'Peru'),
  ('PF', 'PYF', 'French Polynesia', 'French Polynesian', '689', 'French Polynesia'),
  ('PG', 'PNG', 'Papua New Guinea', 'Papua New Guinean', '675', 'Papua New Guinea'),
  ('PH', 'PHL', 'Philippines', 'Filipino', '63', 'Philippines'),
  ('PK', 'PAK', 'Pakistan', 'Pakistani', '92', 'Pakistan'),
  ('PL', 'POL', 'Poland', 'Polish', '48', 'Poland'),
  ('PM', 'SPM', 'Saint Pierre and Miquelon', 'Saint-Pierrais', '508', 'Saint Pierre and Miquelon'),
  ('PN', 'PCN', 'Pitcairn Islands', 'Pitcairn Islander', '64', 'Pitcairn Islands'),
  ('PR', 'PRI', 'Puerto Rico', 'Puerto Rican', '1787', 'Puerto Rico'),
  ('PS', 'PSE', 'Palestine', 'Palestinian', '970', 'Palestine'),
  ('PT', 'PRT', 'Portugal', 'Portuguese', '351', 'Portugal'),
  ('PW', 'PLW', 'Palau', 'Palauan', '680', 'Palau'),
  ('PY', 'PRY', 'Paraguay', 'Paraguayan', '595', 'Paraguay'),
  ('QA', 'QAT', 'Qatar', 'Qatari', '974', 'Qatar'),
  ('RE', 'REU', 'Réunion', 'Réunionese', '262', 'Reunion'),
  ('RO', 'ROU', 'Romania', 'Romanian', '40', 'Romania'),
  ('RS', 'SRB', 'Serbia', 'Serbian', '381', 'Serbia'),
  ('RU', 'RUS', 'Russia', 'Russian', '7', 'Russia'),
  ('RW', 'RWA', 'Rwanda', 'Rwandan', '250', 'Rwanda'),
  ('SA', 'SAU', 'Saudi Arabia', 'Saudi', '966', 'Saudi Arabia'),
  ('SB', 'SLB', 'Solomon Islands', 'Solomon Islander', '677', 'Solomon Islands'),
  ('SC', 'SYC', 'Seychelles', 'Seychellois', '248', 'Seychelles'),
  ('SD', 'SDN', 'Sudan', 'Sudanese', '249', 'Sudan'),
  ('SE', 'SWE', 'Sweden', 'Swedish', '46', 'Sweden'),
  ('SG', 'SGP', 'Singapore', 'Singaporean', '65', 'Singapore'),
  ('SH', 'SHN', 'Saint Helena, Ascension and Tristan da Cunha', 'Saint Helenian', '290', 'Saint Helena, Ascension and Tristan da Cunha'),
  ('SI', 'SVN', 'Slovenia', 'Slovenian', '386', 'Slovenia'),
  ('SJ', 'SJM', 'Svalbard and Jan Mayen', 'Norwegian', '47', 'Svalbard and Jan Mayen'),
  ('SK', 'SVK', 'Slovakia', 'Slovak', '421', 'Slovakia'),
  ('SL', 'SLE', 'Sierra Leone', 'Sierra Leonean', '232', 'Sierra Leone'),
  ('SM', 'SMR', 'San Marino', 'Sammarinese', '378', 'San Marino'),
  ('SN', 'SEN', 'Senegal', 'Senegalese', '221', 'Senegal'),
  ('SO', 'SOM', 'Somalia', 'Somali', '252', 'Somalia'),
  ('SR', 'SUR', 'Suriname', 'Surinamese', '597', 'Suriname'),
  ('SS', 'SSD', 'South Sudan', 'South Sudanese', '211', 'South Sudan'),
  ('ST', 'STP', 'São Tomé and Príncipe', 'Santomean', '239', 'Sao Tome and Principe'),
  ('SV', 'SLV', 'El Salvador', 'Salvadoran', '503', 'El Salvador'),
  ('SX', 'SXM', 'Sint Maarten (Dutch part)', 'Sint Maartener', '1721', 'Sint Maarten (Dutch part)'),
  ('SY', 'SYR', 'Syria', 'Syrian', '963', 'Syria'),
  ('SZ', 'SWZ', 'Eswatini', 'Swazi', '268', 'Eswatini'),
  ('TC', 'TCA', 'Turks and Caicos Islands', 'Turks and Caicos Islander', '1649', 'Turks and Caicos Islands'),
  ('TD', 'TCD', 'Chad', 'Chadian', '235', 'Chad'),
  ('TF', 'ATF', 'French Southern Territories', NULL, '262', 'French Southern Territories'),
  ('TG', 'TGO', 'Togo', 'Togolese', '228', 'Togo'),
  ('TH', 'THA', 'Thailand', 'Thai', '66', 'Thailand'),
  ('TJ', 'TJK', 'Tajikistan', 'Tajik', '992', 'Tajikistan'),
  ('TK', 'TKL', 'Tokelau', 'Tokelauan', '690', 'Tokelau'),
  ('TL', 'TLS', 'Timor-Leste', 'Timorese', '670', 'Timor-Leste'),
  ('TM', 'TKM', 'Turkmenistan', 'Turkmen', '993', 'Turkmenistan'),
  ('TN', 'TUN', 'Tunisia', 'Tunisian', '216', 'Tunisia'),
  ('TO', 'TON', 'Tonga', 'Tongan', '676', 'Tonga'),
  ('TR', 'TUR', 'Türkiye', 'Turkish', '90', 'Turkiye'),
  ('TT', 'TTO', 'Trinidad and Tobago', 'Trinidadian and Tobagonian', '1868', 'Trinidad and Tobago'),
  ('TV', 'TUV', 'Tuvalu', 'Tuvaluan', '688', 'Tuvalu'),
  ('TW', 'TWN', 'Taiwan', 'Taiwanese', '886', 'Taiwan'),
  ('TZ', 'TZA', 'Tanzania', 'Tanzanian', '255', 'Tanzania'),
  ('UA', 'UKR', 'Ukraine', 'Ukrainian', '380', 'Ukraine'),
  ('UG', 'UGA', 'Uganda', 'Ugandan', '256', 'Uganda'),
  ('UM', 'UMI', 'United States Minor Outlying Islands', NULL, NULL, 'United States Minor Outlying Islands'),
  ('US', 'USA', 'United States', 'American', '1', 'United States'),
  ('UY', 'URY', 'Uruguay', 'Uruguayan', '598', 'Uruguay'),
  ('UZ', 'UZB', 'Uzbekistan', 'Uzbek', '998', 'Uzbekistan'),
  ('VA', 'VAT', 'Holy See', 'Vatican', '379', 'Holy See'),
  ('VC', 'VCT', 'Saint Vincent and the Grenadines', 'Vincentian', '1784', 'Saint Vincent and the Grenadines'),
  ('VE', 'VEN', 'Venezuela', 'Venezuelan', '58', 'Venezuela'),
  ('VG', 'VGB', 'British Virgin Islands', 'British Virgin Islander', '1284', 'British Virgin Islands'),
  ('VI', 'VIR', 'United States Virgin Islands', 'US Virgin Islander', '1340', 'United States Virgin Islands'),
  ('VN', 'VNM', 'Viet Nam', 'Vietnamese', '84', 'Viet Nam'),
  ('VU', 'VUT', 'Vanuatu', 'Ni-Vanuatu', '678', 'Vanuatu'),
  ('WF', 'WLF', 'Wallis and Futuna', 'Wallisian and Futunan', '681', 'Wallis and Futuna'),
  ('WS', 'WSM', 'Samoa', 'Samoan', '685', 'Samoa'),
  ('XK', 'XKX', 'Kosovo', 'Kosovar', '383', 'Kosovo'),
  ('YE', 'YEM', 'Yemen', 'Yemeni', '967', 'Yemen'),
  ('YT', 'MYT', 'Mayotte', 'Mahoran', '262', 'Mayotte'),
  ('ZA', 'ZAF', 'South Africa', 'South African', '27', 'South Africa'),
  ('ZM', 'ZMB', 'Zambia', 'Zambian', '260', 'Zambia'),
  ('ZW', 'ZWE', 'Zimbabwe', 'Zimbabwean', '263', 'Zimbabwe')
) AS s(iso2, iso3, name, demonym, dial_code, sort_name)
ON CONFLICT (iso2) DO NOTHING;

INSERT INTO public.ref_languages (code, name, sort_order)
VALUES
  ('en', 'English', 10),
  ('af', 'Afrikaans', 1000),
  ('sq', 'Albanian', 1000),
  ('am', 'Amharic', 1000),
  ('ar', 'Arabic', 1000),
  ('hy', 'Armenian', 1000),
  ('az', 'Azerbaijani', 1000),
  ('eu', 'Basque', 1000),
  ('be', 'Belarusian', 1000),
  ('bn', 'Bengali', 1000),
  ('bs', 'Bosnian', 1000),
  ('bg', 'Bulgarian', 1000),
  ('my', 'Burmese', 1000),
  ('yue', 'Cantonese', 1000),
  ('ca', 'Catalan', 1000),
  ('zh', 'Chinese (Mandarin)', 1000),
  ('hr', 'Croatian', 1000),
  ('cs', 'Czech', 1000),
  ('da', 'Danish', 1000),
  ('nl', 'Dutch', 1000),
  ('et', 'Estonian', 1000),
  ('fj', 'Fijian', 1000),
  ('fil', 'Filipino', 1000),
  ('fi', 'Finnish', 1000),
  ('fr', 'French', 1000),
  ('gl', 'Galician', 1000),
  ('ka', 'Georgian', 1000),
  ('de', 'German', 1000),
  ('el', 'Greek', 1000),
  ('gu', 'Gujarati', 1000),
  ('ht', 'Haitian Creole', 1000),
  ('ha', 'Hausa', 1000),
  ('he', 'Hebrew', 1000),
  ('hi', 'Hindi', 1000),
  ('hu', 'Hungarian', 1000),
  ('is', 'Icelandic', 1000),
  ('ig', 'Igbo', 1000),
  ('id', 'Indonesian', 1000),
  ('ga', 'Irish', 1000),
  ('it', 'Italian', 1000),
  ('ja', 'Japanese', 1000),
  ('kn', 'Kannada', 1000),
  ('kk', 'Kazakh', 1000),
  ('km', 'Khmer', 1000),
  ('ko', 'Korean', 1000),
  ('ku', 'Kurdish', 1000),
  ('ky', 'Kyrgyz', 1000),
  ('lo', 'Lao', 1000),
  ('lv', 'Latvian', 1000),
  ('lt', 'Lithuanian', 1000),
  ('lb', 'Luxembourgish', 1000),
  ('mk', 'Macedonian', 1000),
  ('mg', 'Malagasy', 1000),
  ('ms', 'Malay', 1000),
  ('ml', 'Malayalam', 1000),
  ('mt', 'Maltese', 1000),
  ('mi', 'Maori', 1000),
  ('mr', 'Marathi', 1000),
  ('mn', 'Mongolian', 1000),
  ('ne', 'Nepali', 1000),
  ('no', 'Norwegian', 1000),
  ('fa', 'Persian', 1000),
  ('pl', 'Polish', 1000),
  ('pt', 'Portuguese', 1000),
  ('pa', 'Punjabi', 1000),
  ('ro', 'Romanian', 1000),
  ('ru', 'Russian', 1000),
  ('sm', 'Samoan', 1000),
  ('sr', 'Serbian', 1000),
  ('si', 'Sinhala', 1000),
  ('sk', 'Slovak', 1000),
  ('sl', 'Slovenian', 1000),
  ('so', 'Somali', 1000),
  ('es', 'Spanish', 1000),
  ('sw', 'Swahili', 1000),
  ('sv', 'Swedish', 1000),
  ('tl', 'Tagalog', 1000),
  ('ta', 'Tamil', 1000),
  ('te', 'Telugu', 1000),
  ('th', 'Thai', 1000),
  ('ti', 'Tigrinya', 1000),
  ('to', 'Tongan', 1000),
  ('tr', 'Turkish', 1000),
  ('uk', 'Ukrainian', 1000),
  ('ur', 'Urdu', 1000),
  ('uz', 'Uzbek', 1000),
  ('vi', 'Vietnamese', 1000),
  ('cy', 'Welsh', 1000),
  ('xh', 'Xhosa', 1000),
  ('yo', 'Yoruba', 1000),
  ('zu', 'Zulu', 1000)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.contract_types (id, company_id, key, label, is_system, sort_order)
SELECT md5('storm.contract_type.' || s.key)::uuid, NULL, s.key, s.label, true, s.sort_order
FROM (VALUES
  ('permanent', 'Permanent', 10),
  ('rotational', 'Rotational', 20),
  ('temporary', 'Temporary', 30)
) AS s(key, label, sort_order)
ON CONFLICT DO NOTHING;

-- System positions: every vessel role of the PMS catalogue
-- (docs/permissions/catalogues/storm.json) with its tier, plus yacht
-- positions written fresh. Ids are derived from the key, so every database
-- carries the same ids. Rank order: command first, then tier, then the
-- department's order. Default access set by tier: command full_vessel,
-- hod hod, officer officer, rating and trainee crew.
INSERT INTO public.positions (id, company_id, vessel_id, key, name, department_key, rank_tier, default_access_set_key, stcw_capacity, sort_order)
SELECT md5('storm.position.' || s.key)::uuid, NULL, NULL, s.key, s.name, s.department_key, s.rank_tier,
       CASE s.rank_tier WHEN 'command' THEN 'full_vessel' WHEN 'hod' THEN 'hod' WHEN 'officer' THEN 'officer' ELSE 'crew' END,
       s.stcw_capacity, s.sort_order
FROM (VALUES
  ('master', 'Master', 'bridge', 'command', 'STCW II/2 (Master)', 10101),
  ('relief_master', 'Relief Master', 'bridge', 'command', 'STCW II/2 (Master)', 10102),
  ('staff_captain', 'Staff Captain', 'bridge', 'hod', 'STCW II/2', 20101),
  ('second_officer', 'Second Officer', 'bridge', 'officer', 'STCW II/1 (OOW)', 30101),
  ('third_officer', 'Third Officer', 'bridge', 'officer', 'STCW II/1 (OOW)', 30102),
  ('navigation_officer', 'Navigation Officer', 'bridge', 'officer', 'STCW II/1 (OOW)', 30103),
  ('officer_of_the_watch', 'Officer of the Watch', 'bridge', 'officer', 'STCW II/1 (OOW)', 30104),
  ('deck_officer', 'Deck Officer', 'bridge', 'officer', NULL, 30105),
  ('safety_officer', 'Safety Officer', 'bridge', 'officer', NULL, 30106),
  ('junior_officer', 'Junior Officer', 'bridge', 'officer', NULL, 30107),
  ('deck_cadet', 'Deck Cadet', 'bridge', 'trainee', NULL, 50101),
  ('chief_officer', 'Chief Officer', 'deck', 'hod', 'STCW II/2 (Chief Mate)', 20201),
  ('bosun', 'Bosun', 'deck', 'officer', 'STCW II/5', 30201),
  ('second_bosun', 'Second Bosun', 'deck', 'rating', 'STCW II/5', 40201),
  ('lead_deckhand', 'Lead Deckhand', 'deck', 'rating', NULL, 40202),
  ('ab_seaman', 'AB Seaman', 'deck', 'rating', 'STCW II/5', 40203),
  ('deckhand', 'Deckhand', 'deck', 'rating', NULL, 40204),
  ('deck_rating', 'Deck Rating', 'deck', 'rating', 'STCW II/4', 40205),
  ('tender_driver', 'Tender Driver', 'deck', 'rating', NULL, 40206),
  ('deck_engineer', 'Deck/Engineer', 'deck', 'rating', NULL, 40207),
  ('deck_stew', 'Deck/Stew', 'deck', 'rating', NULL, 40208),
  ('watersports_instructor', 'Watersports Instructor', 'deck', 'rating', NULL, 40209),
  ('carpenter', 'Carpenter', 'deck', 'rating', NULL, 40210),
  ('shipwright', 'Shipwright', 'deck', 'rating', NULL, 40211),
  ('junior_deckhand', 'Junior Deckhand', 'deck', 'trainee', NULL, 50201),
  ('os_seaman', 'OS Seaman', 'deck', 'trainee', 'STCW II/4', 50202),
  ('chief_engineer', 'Chief Engineer', 'engineering', 'hod', 'STCW III/2', 20301),
  ('sole_engineer', 'Sole Engineer', 'engineering', 'hod', NULL, 20302),
  ('second_engineer', 'Second Engineer', 'engineering', 'officer', 'STCW III/2', 30301),
  ('third_engineer', 'Third Engineer', 'engineering', 'officer', 'STCW III/1', 30302),
  ('fourth_engineer', 'Fourth Engineer', 'engineering', 'officer', 'STCW III/1', 30303),
  ('eto', 'ETO', 'engineering', 'officer', 'STCW III/6', 30304),
  ('junior_engineer', 'Junior Engineer', 'engineering', 'officer', NULL, 30305),
  ('electrician', 'Electrician', 'engineering', 'rating', 'STCW III/7', 40301),
  ('motorman', 'Motorman', 'engineering', 'rating', 'STCW III/5', 40302),
  ('oiler', 'Oiler', 'engineering', 'rating', 'STCW III/4', 40303),
  ('engine_rating', 'Engine Rating', 'engineering', 'rating', 'STCW III/4', 40304),
  ('fitter', 'Fitter', 'engineering', 'rating', NULL, 40305),
  ('hvac_technician', 'HVAC Technician', 'engineering', 'rating', NULL, 40306),
  ('wiper', 'Wiper', 'engineering', 'trainee', NULL, 50301),
  ('engine_cadet', 'Engine Cadet', 'engineering', 'trainee', NULL, 50302),
  ('interior_manager', 'Interior Manager', 'interior', 'hod', NULL, 20401),
  ('chief_stew', 'Chief Stew', 'interior', 'hod', NULL, 20402),
  ('head_housekeeper', 'Head Housekeeper', 'interior', 'officer', NULL, 30401),
  ('head_of_service', 'Head of Service', 'interior', 'officer', NULL, 30402),
  ('second_stew', 'Second Stew', 'interior', 'officer', NULL, 30403),
  ('third_stew', 'Third Stew', 'interior', 'rating', NULL, 40401),
  ('steward', 'Steward', 'interior', 'rating', NULL, 40402),
  ('service_stew', 'Service Stew', 'interior', 'rating', NULL, 40403),
  ('housekeeper', 'Housekeeper', 'interior', 'rating', NULL, 40404),
  ('laundry', 'Laundry', 'interior', 'rating', NULL, 40405),
  ('butler', 'Butler', 'interior', 'rating', NULL, 40406),
  ('sommelier', 'Sommelier', 'interior', 'rating', NULL, 40407),
  ('florist', 'Florist', 'interior', 'rating', NULL, 40408),
  ('nanny', 'Nanny', 'interior', 'rating', NULL, 40409),
  ('junior_stew', 'Junior Stew', 'interior', 'trainee', NULL, 50401),
  ('executive_chef', 'Executive Chef', 'galley', 'hod', NULL, 20501),
  ('head_chef', 'Head Chef', 'galley', 'hod', NULL, 20502),
  ('sous_chef', 'Sous Chef', 'galley', 'officer', NULL, 30501),
  ('crew_chef', 'Crew Chef', 'galley', 'officer', NULL, 30502),
  ('pastry_chef', 'Pastry Chef', 'galley', 'rating', NULL, 40501),
  ('chef_de_partie', 'Chef de Partie', 'galley', 'rating', NULL, 40502),
  ('cook', 'Cook', 'galley', 'rating', NULL, 40503),
  ('galley_hand', 'Galley Hand', 'galley', 'trainee', NULL, 50501),
  ('purser', 'Purser', 'purser_office', 'hod', NULL, 20601),
  ('assistant_purser', 'Assistant Purser', 'purser_office', 'officer', NULL, 30601),
  ('guest_services_manager', 'Guest Services Manager', 'purser_office', 'officer', NULL, 30602),
  ('admin_assistant', 'Admin Assistant', 'purser_office', 'officer', NULL, 30603),
  ('ships_doctor', 'Ship''s Doctor', 'medical', 'hod', NULL, 20701),
  ('medic', 'Medic', 'medical', 'officer', NULL, 30701),
  ('nurse', 'Nurse', 'medical', 'officer', NULL, 30702),
  ('paramedic', 'Paramedic', 'medical', 'officer', NULL, 30703),
  ('head_of_security', 'Head of Security', 'security', 'hod', NULL, 20801),
  ('security_officer', 'Security Officer', 'security', 'officer', NULL, 30801),
  ('close_protection_officer', 'Close Protection Officer', 'security', 'officer', NULL, 30802),
  ('dive_manager', 'Dive Manager', 'dive', 'hod', NULL, 20901),
  ('dive_instructor', 'Dive Instructor', 'dive', 'officer', NULL, 30901),
  ('submarine_pilot', 'Submarine Pilot', 'dive', 'officer', NULL, 30902),
  ('divemaster', 'Divemaster', 'dive', 'rating', NULL, 40901),
  ('media_lead', 'Media Lead', 'media', 'hod', NULL, 21001),
  ('photographer', 'Photographer', 'media', 'rating', NULL, 41001),
  ('videographer', 'Videographer', 'media', 'rating', NULL, 41002),
  ('drone_pilot', 'Drone Pilot', 'media', 'rating', NULL, 41003),
  ('av_it_officer', 'AV/IT Officer', 'it_av', 'hod', NULL, 21101),
  ('network_engineer', 'Network Engineer', 'it_av', 'officer', NULL, 31101),
  ('av_it_technician', 'AV/IT Technician', 'it_av', 'rating', NULL, 41101),
  ('spa_manager', 'Spa Manager', 'spa_wellness', 'hod', NULL, 21201),
  ('physiotherapist', 'Physiotherapist', 'spa_wellness', 'officer', NULL, 31201),
  ('personal_trainer', 'Personal Trainer', 'spa_wellness', 'officer', NULL, 31202),
  ('therapist', 'Therapist', 'spa_wellness', 'rating', NULL, 41201),
  ('beauty_therapist', 'Beauty Therapist', 'spa_wellness', 'rating', NULL, 41202),
  ('massage_therapist', 'Massage Therapist', 'spa_wellness', 'rating', NULL, 41203),
  ('yoga_instructor', 'Yoga Instructor', 'spa_wellness', 'rating', NULL, 41204),
  ('hairdresser', 'Hairdresser', 'spa_wellness', 'rating', NULL, 41205),
  ('helicopter_pilot', 'Helicopter Pilot', 'other', 'officer', NULL, 39001),
  ('aviation_engineer', 'Aviation Engineer', 'other', 'officer', NULL, 39002),
  ('project_manager', 'Project Manager', 'other', 'officer', NULL, 39003),
  ('relief_crew', 'Relief Crew', 'other', 'rating', NULL, 49001),
  ('day_worker', 'Day Worker', 'other', 'rating', NULL, 49002),
  ('tutor', 'Tutor', 'other', 'rating', NULL, 49003)
) AS s(key, name, department_key, rank_tier, stcw_capacity, sort_order)
ON CONFLICT DO NOTHING;

-- Aliases for legacy titles and listed positions per vessel.
SELECT public.crew_positions_backfill();
