-- =================================================================
-- CREW X1-13: crew import staging tenancy (Phase 3 wave 1, stream X1;
-- gap/04 headline 9 and pitfall "Tenant leak"; DECISIONS D-181, D-192,
-- D-229, D-233, D-X1-17; X1 spec §6 061200)
-- Tables: none new.
-- Columns: crew_import.company_id, vessels_import.company_id (nullable,
--   ON DELETE CASCADE; best-effort backfill, see below)
-- Policies: drops crew_import_read_authenticated and
--   vessels_import_read_authenticated (both live USING (true));
--   creates crew_import_select_company and vessels_import_select_company.
--   The 20261123010500 service-role write policies of crew_import stay as
--   they are (rule §0.2).
-- View: crew_import_active (the live view, redefined in no other
--   build-out file): security invoker, the same columns, grants pinned.
-- Functions:
--   pure      crew_import_vessel_key (the vessel-name key of the backfill)
--   internal  crew_import_company_backfill (service role; run once below,
--             re-runnable)
--   RPC       crew_import_stage (the browser's only staging write)
--   redefined sync_crew_import_to_profiles (the live definer that copies
--             staged rows into profiles: now the caller's company only)
-- TS mirror: src/modules/rotation-planner/types/db.pending.ts (the two
--   columns and crew_import_stage); the dialog stages through
--   src/modules/rotation-planner/hooks/useCrewImportStage.ts.
-- =================================================================
--
-- Why. crew_import and vessels_import (20260428170231) hold the crew
-- roster an Airtable export and the rotation planner's XLSX import stage
-- before it becomes profiles: names, personal and work email addresses,
-- phone numbers, dates of birth, nationalities and next of kin. Both
-- tables have a SELECT policy USING (true) for every signed-in user, so
-- every tenant reads every other tenant's staged crew (gap/04 headline 9).
-- The tables have no company column, so no policy can scope them, and the
-- legacy sync_crew_import_to_profiles() definer copies EVERY staged row
-- into the caller's company (and trusts a client-supplied company id).
-- Since 20261123010500 the browser can no longer write the staging table
-- (D-181: service role only), so the planner import's staging step fails
-- today; D-181 asks for a definer path.
--
-- Tenancy (D-X1-17):
-- * company_id on both tables. Rows that cannot be attributed to exactly
--   one company stay NULL and are readable by the service role only (fail
--   closed): no browser policy matches a NULL company.
-- * Reads: crew_import_select_company / vessels_import_select_company, FOR
--   SELECT TO authenticated, the row's company is the caller's (an active
--   caller: get_user_company_id answers NULL for an inactive one, D-122)
--   and the caller is a planner viewer (frp_can_view, two-valued since
--   20261123010000, D-233). Both are caller-only and hoisted as
--   (SELECT …), so they run once per statement (D-229); the company test
--   equals user_belongs_to_company(auth.uid(), company_id) (one profile
--   per login) without a per-row call.
-- * crew_import_active reads through crew_import's policy (security
--   invoker).
-- * Writes: the service role (the 20261123010500 policies) and the
--   definers below. authenticated keeps SELECT only; anon and PUBLIC
--   nothing.
--
-- crew_import_stage(p_company_id, p_rows) (D-181 staging write path):
-- * Gate: an active signed-in caller (42501 not_signed_in), a company
--   (22023 company_required), the caller's own company (42501
--   company_mismatch: an unknown and a foreign id answer alike), a planner
--   editor (frp_can_edit; 42501 not_permitted); then the rows: a JSON array
--   (22023 rows_not_array) of at most 500 (22023 too_many_rows, the count
--   in HINT).
-- * One outcome per row, in order (row_index from 0): staged (reason
--   created or updated) or refused with a reason and, where one field is
--   at fault, the field:
--     not_an_object; key_missing / key_invalid (airtable_id, the staging
--     key: 1 to 200 characters, a letter or digit first, then letters,
--     digits and . _ : -); duplicate_in_batch (the same key earlier in the
--     list); invalid_value (a field that is not text, or a value that does
--     not convert); field_too_long (text over 200 characters, an email
--     over 320); invalid_email; invalid_crew_id (not a whole number from
--     0 to 999999999999); invalid_date_of_birth (not YYYY-MM-DD between
--     1900-01-01 and today); name_missing (no first, last or full legal
--     name once saved); key_in_use (the key belongs to another company's
--     row or to a row nobody can attribute: it is never claimed);
--     archived (the company's row with that key is archived).
-- * Only these fields are read from a row: airtable_id, crew_id, vessel,
--   first_name, middle_name, last_name, casual_name, full_legal_name,
--   preferred_name, personal_email, work_email, cellular_phone,
--   secondary_phone, date_of_birth, nationality, role, department,
--   repatriation. Anything else (company_id, is_archived, status,
--   vessel_airtable_id, photo_url, …) is ignored. Text is trimmed and an
--   empty string stored as NULL. A new row takes the caller's company; an
--   existing row of that company is updated in the fields the row names
--   (a field left out keeps its value); imported_at is stamped either way.
-- * Each row runs in its own subtransaction: a refusal never undoes the
--   rows before it.
--
-- sync_crew_import_to_profiles(p_company_id) (redefined; body otherwise
-- as 20260916133449_bdd7c207-…): an active caller with the legacy sync
-- roles (unchanged), the caller's own company (a p_company_id naming
-- another company is refused, 42501 company_mismatch, D-233: IS DISTINCT
-- FROM), and only that company's staged rows (company_id = the caller's
-- company, not archived). Before, it copied every tenant's staged crew
-- into the caller's company.
--
-- Backfill (crew_import_company_backfill, best effort, fail closed):
-- * vessels_import: its name names a vessel of exactly one company
--   (crew_import_vessel_key: lower case, spaces collapsed, a leading
--   M/Y, S/Y, R/V, M/V or E/Y dropped).
-- * crew_import: every source below that names a company is collected;
--   the row takes the company only when they all name the same one:
--   the planner import's key (frp-<vessel id>-…: that vessel's company);
--   the profile synced from it (profiles.airtable_id, unique); the
--   Airtable sync map (airtable_sync_map.airtable_record_id); its
--   vessels_import row (vessel_airtable_id, attributed above); its vessel
--   text (the first comma-separated name) naming a vessel of exactly one
--   company. Conflicting or no evidence leaves NULL.
-- * Rows already attributed are never changed, so a re-run (pass 2, or
--   the owner after fixing a sync map) only fills what is still NULL.
--
-- Idempotent (D-12): ADD COLUMN IF NOT EXISTS, the FK dropped before it is
-- added, CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS before every
-- CREATE POLICY, CREATE OR REPLACE for the view and every function, the
-- backfill touches NULL companies only.

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regclass('public.crew_import') IS NULL OR to_regclass('public.vessels_import') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061200_crew_import_tenancy needs crew_import and vessels_import: apply 20260428170231_91a1ab54-4793-4679-9bd3-90fb59e1f364.sql first';
  END IF;
  IF to_regclass('public.airtable_sync_map') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'airtable_id') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061200_crew_import_tenancy needs airtable_sync_map and profiles.airtable_id (20260214203949, 20260428170829)';
  END IF;
  IF to_regprocedure('public.sync_crew_import_to_profiles(uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061200_crew_import_tenancy needs sync_crew_import_to_profiles: apply 20260916133449_bdd7c207-0f2f-46cf-b49b-fc894301a4df.sql first';
  END IF;
  IF to_regprocedure('public.user_is_active(uuid)') IS NULL OR to_regprocedure('public.get_user_company_id(uuid)') IS NULL
     OR to_regprocedure('public.user_belongs_to_company(uuid,uuid)') IS NULL
     OR to_regprocedure('public.frp_can_view(uuid)') IS NULL OR to_regprocedure('public.frp_can_edit(uuid)') IS NULL
     OR coalesce(obj_description('public.frp_can_edit(uuid)'::regprocedure, 'pg_proc'), '') NOT LIKE '%two-valued by 20261123010000%' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061200_crew_import_tenancy needs the active-aware helpers (user_is_active, get_user_company_id, user_belongs_to_company, two-valued frp_can_view / frp_can_edit): apply 20261123000300 and 20261123010000 first';
  END IF;
  -- Before 20261123010500 a captain could write crew_import directly
  -- (crew_import_write_privileged TO authenticated): staging must already
  -- be service-role only when the company column arrives.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'crew_import'
                   AND policyname = 'crew_import_write_privileged' AND roles = ARRAY['service_role']::name[])
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'crew_import'
                   AND policyname = 'crew_import_update_privileged' AND roles = ARRAY['service_role']::name[]) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061200_crew_import_tenancy needs the service-role crew_import write policies: apply 20261123010500_platform_role_scoped_policies.sql first';
  END IF;
END
$$;

-- ---------------------------------------------------------------- the company columns

ALTER TABLE public.crew_import ADD COLUMN IF NOT EXISTS company_id uuid NULL;
ALTER TABLE public.crew_import DROP CONSTRAINT IF EXISTS crew_import_company_id_fkey;
ALTER TABLE public.crew_import ADD CONSTRAINT crew_import_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS crew_import_company_idx ON public.crew_import (company_id);

ALTER TABLE public.vessels_import ADD COLUMN IF NOT EXISTS company_id uuid NULL;
ALTER TABLE public.vessels_import DROP CONSTRAINT IF EXISTS vessels_import_company_id_fkey;
ALTER TABLE public.vessels_import ADD CONSTRAINT vessels_import_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS vessels_import_company_idx ON public.vessels_import (company_id);

COMMENT ON COLUMN public.crew_import.company_id IS
  'The company the staged row belongs to (20261124061200, D-X1-17). NULL: not attributable to exactly one company; such a row is readable by the service role only. Set by crew_import_stage (the caller''s company) or by crew_import_company_backfill; never by the browser.';
COMMENT ON COLUMN public.vessels_import.company_id IS
  'The company the imported vessel belongs to (20261124061200, D-X1-17). NULL: its name names no vessel of exactly one company; readable by the service role only.';
COMMENT ON TABLE public.crew_import IS
  'Crew staging rows from the Airtable export and the rotation planner''s XLSX import, before sync_crew_import_to_profiles turns them into profiles. Personal data. Since 20261124061200: one company per row (company_id; NULL rows are service-role only), read by planner viewers of that company, written by the service role and crew_import_stage (D-181, D-X1-17).';
COMMENT ON TABLE public.vessels_import IS
  'Vessels named by the Airtable export, keyed on their Airtable id (crew_import.vessel_airtable_id). Since 20261124061200: one company per row (company_id; NULL rows are service-role only), read by planner viewers of that company, written by the service role only.';

-- ---------------------------------------------------------------- backfill (best effort, fail closed)

CREATE OR REPLACE FUNCTION public.crew_import_vessel_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT nullif(
    regexp_replace(
      regexp_replace(lower(btrim(coalesce(p_name, ''))), '\s+', ' ', 'g'),
      '^(m/y|m\.y\.|my|s/y|s\.y\.|sy|r/v|r\.v\.|rv|m/v|m\.v\.|mv|e/y|ey) ', ''),
    '')
$$;

CREATE OR REPLACE FUNCTION public.crew_import_company_backfill()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vessels integer := 0;
  v_crew integer := 0;
BEGIN
  -- vessels_import: the name names a vessel of exactly one company.
  WITH cand AS (
    SELECT vi.id, array_agg(DISTINCT v.company_id) AS companies
    FROM public.vessels_import AS vi
    JOIN public.vessels AS v
      ON v.company_id IS NOT NULL
     AND public.crew_import_vessel_key(v.name) = public.crew_import_vessel_key(vi.name)
    WHERE vi.company_id IS NULL
    GROUP BY vi.id
  )
  UPDATE public.vessels_import AS vi
  SET company_id = c.companies[1]
  FROM cand AS c
  WHERE vi.id = c.id AND cardinality(c.companies) = 1;
  GET DIAGNOSTICS v_vessels = ROW_COUNT;

  -- crew_import: every source that names a company; exactly one company wins.
  WITH open_rows AS (
    SELECT c.id, c.airtable_id, c.vessel_airtable_id, c.vessel
    FROM public.crew_import AS c
    WHERE c.company_id IS NULL
  ),
  src AS (
    -- the planner import's key: frp-<vessel id>-…
    SELECT o.id, v.company_id
    FROM open_rows AS o
    JOIN public.vessels AS v
      ON v.id::text = substring(o.airtable_id FROM '^frp-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-')
    WHERE v.company_id IS NOT NULL
    UNION ALL
    -- the profile synced from the row (profiles.airtable_id is unique)
    SELECT o.id, p.company_id
    FROM open_rows AS o
    JOIN public.profiles AS p ON p.airtable_id = o.airtable_id
    WHERE p.company_id IS NOT NULL
    UNION ALL
    -- the Airtable sync map
    SELECT o.id, m.company_id
    FROM open_rows AS o
    JOIN public.airtable_sync_map AS m ON m.airtable_record_id = o.airtable_id
    UNION ALL
    -- its vessels_import row
    SELECT o.id, vi.company_id
    FROM open_rows AS o
    JOIN public.vessels_import AS vi ON vi.airtable_id = o.vessel_airtable_id
    WHERE vi.company_id IS NOT NULL
    UNION ALL
    -- its vessel text names a vessel of exactly one company
    SELECT o.id, x.company_id
    FROM open_rows AS o
    CROSS JOIN LATERAL (
      SELECT (array_agg(DISTINCT v.company_id))[1] AS company_id, count(DISTINCT v.company_id) AS n
      FROM public.vessels AS v
      WHERE v.company_id IS NOT NULL
        AND public.crew_import_vessel_key(v.name) = public.crew_import_vessel_key(split_part(o.vessel, ',', 1))
    ) AS x
    WHERE x.n = 1
  ),
  agg AS (
    SELECT s.id, array_agg(DISTINCT s.company_id) AS companies
    FROM src AS s
    GROUP BY s.id
  )
  UPDATE public.crew_import AS c
  SET company_id = a.companies[1]
  FROM agg AS a
  WHERE c.id = a.id AND c.company_id IS NULL AND cardinality(a.companies) = 1;
  GET DIAGNOSTICS v_crew = ROW_COUNT;

  RETURN jsonb_build_object(
    'vessels_import_attributed', v_vessels,
    'vessels_import_unattributed', (SELECT count(*) FROM public.vessels_import WHERE company_id IS NULL),
    'crew_import_attributed', v_crew,
    'crew_import_unattributed', (SELECT count(*) FROM public.crew_import WHERE company_id IS NULL));
END;
$$;

SELECT public.crew_import_company_backfill();

-- ---------------------------------------------------------------- read policies (the leak)

DROP POLICY IF EXISTS "crew_import_read_authenticated" ON public.crew_import;
DROP POLICY IF EXISTS crew_import_select_company ON public.crew_import;
CREATE POLICY crew_import_select_company ON public.crew_import
  FOR SELECT TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
    AND (SELECT public.frp_can_view((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS "vessels_import_read_authenticated" ON public.vessels_import;
DROP POLICY IF EXISTS vessels_import_select_company ON public.vessels_import;
CREATE POLICY vessels_import_select_company ON public.vessels_import
  FOR SELECT TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
    AND (SELECT public.frp_can_view((SELECT auth.uid())))
  );

ALTER TABLE public.crew_import ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vessels_import ENABLE ROW LEVEL SECURITY;

-- Grants: the browser reads (RLS decides what), never writes; anon nothing.
REVOKE ALL ON TABLE public.crew_import FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.crew_import FROM authenticated;
GRANT SELECT ON TABLE public.crew_import TO authenticated;
GRANT ALL ON TABLE public.crew_import TO service_role;
REVOKE ALL ON TABLE public.vessels_import FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.vessels_import FROM authenticated;
GRANT SELECT ON TABLE public.vessels_import TO authenticated;
GRANT ALL ON TABLE public.vessels_import TO service_role;

-- ---------------------------------------------------------------- crew_import_active (the live view)

-- The live column list, unchanged (types.ts): the company column is not
-- added, so the view's shape stays the generated one. Security invoker:
-- crew_import's policy decides what a caller sees through it.
CREATE OR REPLACE VIEW public.crew_import_active
WITH (security_invoker = true)
AS
SELECT c.id, c.airtable_id, c.crew_id, c.vessel_airtable_id, c.vessel, c.first_name, c.middle_name, c.last_name,
       c.casual_name, c.full_legal_name, c.preferred_name, c.personal_email, c.krakenfleet_email, c.work_email,
       c.cellular_phone, c.whatsapp_signal, c.secondary_phone, c.date_of_birth, c.nationality, c.nationality_secondary,
       c.home_city, c.home_airport, c.repatriation, c.role, c.department, c.department_secondary, c.rotational_position,
       c.crew_type, c.is_temporary, c.status, c.is_archived, c.rotational_partner, c.couple, c.next_of_kin_name,
       c.next_of_kin_phone, c.photo_url, c.created, c.last_modified, c.imported_at
FROM public.crew_import AS c
WHERE c.is_archived = false;

ALTER VIEW public.crew_import_active SET (security_invoker = true);
REVOKE ALL ON TABLE public.crew_import_active FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.crew_import_active TO authenticated;
GRANT SELECT ON TABLE public.crew_import_active TO service_role;
COMMENT ON VIEW public.crew_import_active IS
  'The staged crew rows that are not archived (security invoker: crew_import''s company policy applies, 20261124061200).';

-- ---------------------------------------------------------------- crew_import_stage (D-181: the staging write path)

CREATE OR REPLACE FUNCTION public.crew_import_stage(p_company_id uuid, p_rows jsonb)
RETURNS TABLE (row_index integer, staging_key text, outcome text, reason text, field text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_text_fields constant text[] := ARRAY['vessel', 'first_name', 'middle_name', 'last_name', 'casual_name', 'full_legal_name',
    'preferred_name', 'cellular_phone', 'secondary_phone', 'nationality', 'role', 'department', 'repatriation'];
  v_email_fields constant text[] := ARRAY['personal_email', 'work_email'];
  v_seen text[] := ARRAY[]::text[];
  v_row jsonb;
  v_ord bigint;
  v_key text;
  v_clean jsonb;
  v_doc jsonb;
  v_f text;
  v_v jsonb;
  v_s text;
  v_max integer;
  v_n numeric;
  v_d date;
  v_existing_id uuid;
  v_existing_company uuid;
  v_existing_archived boolean;
  v_id uuid;
  v_count integer;
BEGIN
  IF v_uid IS NULL OR NOT coalesce(public.user_is_active(v_uid), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in',
      DETAIL = 'Sign in with an active account to stage crew.';
  END IF;
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'company_required',
      DETAIL = 'Choose the company to stage crew for.';
  END IF;
  IF NOT public.user_belongs_to_company(v_uid, p_company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'company_mismatch',
      DETAIL = 'You can only stage crew for your own company.';
  END IF;
  IF NOT public.frp_can_edit(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted',
      DETAIL = 'Staging crew needs edit access to the rotation planner.';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'rows_not_array',
      DETAIL = 'The crew rows must be a list.';
  END IF;
  v_count := jsonb_array_length(p_rows);
  IF v_count > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'too_many_rows',
      DETAIL = 'Stage at most 500 crew at a time.', HINT = v_count::text;
  END IF;

  FOR v_row, v_ord IN SELECT e.value, e.ord FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS e(value, ord) LOOP
    row_index := (v_ord - 1)::integer;
    staging_key := NULL;
    outcome := 'refused';
    reason := NULL;
    field := NULL;

    <<one_row>>
    BEGIN
      IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' THEN
        reason := 'not_an_object';
        EXIT one_row;
      END IF;

      -- the staging key
      IF jsonb_typeof(v_row -> 'airtable_id') IS DISTINCT FROM 'string' OR btrim(v_row ->> 'airtable_id') = '' THEN
        reason := 'key_missing';
        field := 'airtable_id';
        EXIT one_row;
      END IF;
      v_key := btrim(v_row ->> 'airtable_id');
      staging_key := v_key;
      IF length(v_key) > 200 OR v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' THEN
        reason := 'key_invalid';
        field := 'airtable_id';
        EXIT one_row;
      END IF;
      IF v_key = ANY (v_seen) THEN
        reason := 'duplicate_in_batch';
        field := 'airtable_id';
        EXIT one_row;
      END IF;
      v_seen := v_seen || v_key;

      -- the fields this definer reads (everything else is ignored)
      v_clean := '{}'::jsonb;
      FOREACH v_f IN ARRAY v_text_fields || v_email_fields LOOP
        CONTINUE WHEN NOT (v_row ? v_f);
        v_v := v_row -> v_f;
        IF jsonb_typeof(v_v) = 'null' THEN
          v_clean := v_clean || jsonb_build_object(v_f, NULL);
          CONTINUE;
        END IF;
        IF jsonb_typeof(v_v) IS DISTINCT FROM 'string' THEN
          reason := 'invalid_value';
          field := v_f;
          EXIT;
        END IF;
        v_s := nullif(btrim(v_v #>> '{}'), '');
        v_max := 200;
        IF v_f = ANY (v_email_fields) THEN
          v_max := 320;
        END IF;
        IF v_s IS NOT NULL AND length(v_s) > v_max THEN
          reason := 'field_too_long';
          field := v_f;
          EXIT;
        END IF;
        IF v_s IS NOT NULL AND v_f = ANY (v_email_fields) AND v_s !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
          reason := 'invalid_email';
          field := v_f;
          EXIT;
        END IF;
        v_clean := v_clean || jsonb_build_object(v_f, v_s);
      END LOOP;
      EXIT one_row WHEN reason IS NOT NULL;

      IF v_row ? 'crew_id' THEN
        v_v := v_row -> 'crew_id';
        IF jsonb_typeof(v_v) = 'null' OR (jsonb_typeof(v_v) = 'string' AND btrim(v_v #>> '{}') = '') THEN
          v_clean := v_clean || jsonb_build_object('crew_id', NULL);
        ELSIF jsonb_typeof(v_v) = 'number' OR (jsonb_typeof(v_v) = 'string' AND btrim(v_v #>> '{}') ~ '^[0-9]{1,12}$') THEN
          v_n := btrim(v_v #>> '{}')::numeric;
          IF v_n < 0 OR v_n > 999999999999 OR v_n <> trunc(v_n) THEN
            reason := 'invalid_crew_id';
            field := 'crew_id';
            EXIT one_row;
          END IF;
          v_clean := v_clean || jsonb_build_object('crew_id', v_n);
        ELSE
          reason := 'invalid_crew_id';
          field := 'crew_id';
          EXIT one_row;
        END IF;
      END IF;

      IF v_row ? 'date_of_birth' THEN
        v_v := v_row -> 'date_of_birth';
        IF jsonb_typeof(v_v) = 'null' OR (jsonb_typeof(v_v) = 'string' AND btrim(v_v #>> '{}') = '') THEN
          v_clean := v_clean || jsonb_build_object('date_of_birth', NULL);
        ELSIF jsonb_typeof(v_v) = 'string' AND btrim(v_v #>> '{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
          BEGIN
            v_d := to_date(btrim(v_v #>> '{}'), 'YYYY-MM-DD');
          EXCEPTION WHEN others THEN
            v_d := NULL;
          END;
          IF v_d IS NULL OR to_char(v_d, 'YYYY-MM-DD') <> btrim(v_v #>> '{}') OR v_d < DATE '1900-01-01' OR v_d > current_date THEN
            reason := 'invalid_date_of_birth';
            field := 'date_of_birth';
            EXIT one_row;
          END IF;
          v_clean := v_clean || jsonb_build_object('date_of_birth', to_char(v_d, 'YYYY-MM-DD'));
        ELSE
          reason := 'invalid_date_of_birth';
          field := 'date_of_birth';
          EXIT one_row;
        END IF;
      END IF;

      -- the row with that key, whoever holds it
      SELECT c.id, c.company_id, c.is_archived, to_jsonb(c)
        INTO v_existing_id, v_existing_company, v_existing_archived, v_doc
      FROM public.crew_import AS c
      WHERE c.airtable_id = v_key
      FOR UPDATE;

      IF v_existing_id IS NOT NULL THEN
        IF v_existing_company IS DISTINCT FROM p_company_id THEN
          reason := 'key_in_use';
          field := 'airtable_id';
          EXIT one_row;
        END IF;
        IF coalesce(v_existing_archived, false) THEN
          reason := 'archived';
          EXIT one_row;
        END IF;
        v_doc := v_doc || v_clean;
        IF coalesce(nullif(btrim(v_doc ->> 'first_name'), ''), nullif(btrim(v_doc ->> 'last_name'), ''), nullif(btrim(v_doc ->> 'full_legal_name'), '')) IS NULL THEN
          reason := 'name_missing';
          EXIT one_row;
        END IF;
        UPDATE public.crew_import AS c SET
          crew_id = r.crew_id, vessel = r.vessel, first_name = r.first_name, middle_name = r.middle_name,
          last_name = r.last_name, casual_name = r.casual_name, full_legal_name = r.full_legal_name,
          preferred_name = r.preferred_name, personal_email = r.personal_email, work_email = r.work_email,
          cellular_phone = r.cellular_phone, secondary_phone = r.secondary_phone, date_of_birth = r.date_of_birth,
          nationality = r.nationality, role = r.role, department = r.department, repatriation = r.repatriation,
          imported_at = now()
        FROM jsonb_populate_record(NULL::public.crew_import, v_doc) AS r
        WHERE c.id = v_existing_id AND c.company_id = p_company_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count <> 1 THEN
          reason := 'key_in_use';
          field := 'airtable_id';
          EXIT one_row;
        END IF;
        outcome := 'staged';
        reason := 'updated';
      ELSE
        IF coalesce(nullif(btrim(v_clean ->> 'first_name'), ''), nullif(btrim(v_clean ->> 'last_name'), ''), nullif(btrim(v_clean ->> 'full_legal_name'), '')) IS NULL THEN
          reason := 'name_missing';
          EXIT one_row;
        END IF;
        v_id := NULL;
        INSERT INTO public.crew_import AS c (
          airtable_id, company_id, crew_id, vessel, first_name, middle_name, last_name, casual_name, full_legal_name,
          preferred_name, personal_email, work_email, cellular_phone, secondary_phone, date_of_birth, nationality,
          role, department, repatriation, imported_at)
        SELECT v_key, p_company_id, r.crew_id, r.vessel, r.first_name, r.middle_name, r.last_name, r.casual_name,
               r.full_legal_name, r.preferred_name, r.personal_email, r.work_email, r.cellular_phone, r.secondary_phone,
               r.date_of_birth, r.nationality, r.role, r.department, r.repatriation, now()
        FROM jsonb_populate_record(NULL::public.crew_import, v_clean) AS r
        ON CONFLICT (airtable_id) DO NOTHING
        RETURNING c.id INTO v_id;
        IF v_id IS NULL THEN
          -- another session staged the key between the lookup and the insert
          reason := 'key_in_use';
          field := 'airtable_id';
          EXIT one_row;
        END IF;
        outcome := 'staged';
        reason := 'created';
      END IF;
    EXCEPTION
      WHEN unique_violation THEN
        outcome := 'refused';
        reason := 'key_in_use';
        field := 'airtable_id';
      WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
        outcome := 'refused';
        reason := 'invalid_value';
    END;

    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;

-- ---------------------------------------------------------------- sync_crew_import_to_profiles (the caller's company only)

-- Body of 20260916133449_bdd7c207-… with the active-caller check first,
-- the company pinned to the caller's (a p_company_id naming another
-- company is refused, IS DISTINCT FROM: D-233) and the loop limited to
-- that company's staged rows. The legacy role gate and the matching and
-- copying rules are unchanged; the profile guards of 20261123010000 still
-- decide every profile write.
CREATE OR REPLACE FUNCTION public.sync_crew_import_to_profiles(p_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
  r record;
  v_email text;
  v_vessel_id uuid;
  v_profile_id uuid;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
BEGIN
  IF v_uid IS NULL OR NOT coalesce(public.user_is_active(v_uid), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Insufficient permissions to sync crew';
  END IF;
  IF NOT public.has_any_role(v_uid, ARRAY['superadmin','dpa','fleet_master','captain','purser']::app_role[]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Insufficient permissions to sync crew';
  END IF;

  v_company_id := public.get_user_company_id(v_uid);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No company context for crew sync';
  END IF;
  IF p_company_id IS NOT NULL AND p_company_id IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'company_mismatch',
      DETAIL = 'You can only add staged crew to your own company.';
  END IF;

  FOR r IN
    SELECT * FROM public.crew_import
    WHERE company_id = v_company_id
      AND is_archived IS NOT TRUE
    ORDER BY imported_at NULLS LAST
  LOOP
    IF COALESCE(NULLIF(TRIM(r.first_name), ''), NULLIF(TRIM(r.last_name), ''), NULLIF(TRIM(r.full_legal_name), '')) IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_email := LOWER(TRIM(COALESCE(
      NULLIF(TRIM(r.work_email), ''),
      NULLIF(TRIM(r.krakenfleet_email), ''),
      NULLIF(TRIM(r.personal_email), '')
    )));

    SELECT v.id INTO v_vessel_id
    FROM public.vessels v
    WHERE v.company_id = v_company_id
      AND LOWER(TRIM(v.name)) = LOWER(TRIM(COALESCE(r.vessel, '')))
    LIMIT 1;

    v_profile_id := NULL;

    IF r.airtable_id IS NOT NULL THEN
      SELECT p.id INTO v_profile_id FROM public.profiles p
      WHERE p.company_id = v_company_id AND p.airtable_id = r.airtable_id LIMIT 1;
    END IF;

    IF v_profile_id IS NULL AND v_email IS NOT NULL THEN
      SELECT p.id INTO v_profile_id FROM public.profiles p
      WHERE p.company_id = v_company_id AND LOWER(p.email) = v_email LIMIT 1;
    END IF;

    IF v_profile_id IS NULL THEN
      SELECT p.id INTO v_profile_id FROM public.profiles p
      WHERE p.company_id = v_company_id
        AND LOWER(TRIM(COALESCE(p.first_name, ''))) = LOWER(TRIM(COALESCE(r.first_name, '')))
        AND LOWER(TRIM(COALESCE(p.last_name, ''))) = LOWER(TRIM(COALESCE(r.last_name, '')))
      LIMIT 1;
    END IF;

    IF v_profile_id IS NOT NULL THEN
      UPDATE public.profiles p SET
        first_name = COALESCE(NULLIF(TRIM(r.first_name), ''), p.first_name),
        last_name = COALESCE(NULLIF(TRIM(r.last_name), ''), p.last_name),
        preferred_name = COALESCE(NULLIF(TRIM(r.preferred_name), ''), NULLIF(TRIM(r.casual_name), ''), p.preferred_name),
        rank = COALESCE(NULLIF(TRIM(r.role), ''), p.rank),
        department = COALESCE(NULLIF(TRIM(r.department), ''), p.department),
        nationality = COALESCE(NULLIF(TRIM(r.nationality), ''), p.nationality),
        phone = COALESCE(NULLIF(TRIM(r.cellular_phone), ''), NULLIF(TRIM(r.secondary_phone), ''), p.phone),
        date_of_birth = COALESCE(r.date_of_birth, p.date_of_birth),
        status = COALESCE(NULLIF(TRIM(r.status), ''), p.status),
        airtable_id = COALESCE(r.airtable_id, p.airtable_id),
        imported_vessel_id = COALESCE(v_vessel_id, p.imported_vessel_id),
        updated_at = now()
      WHERE p.id = v_profile_id;
      v_updated := v_updated + 1;
    ELSE
      INSERT INTO public.profiles (
        user_id, email, first_name, last_name, company_id, role, rank, department,
        nationality, phone, date_of_birth, preferred_name, status, account_status,
        is_imported, airtable_id, imported_vessel_id
      ) VALUES (
        NULL,
        COALESCE(v_email, 'imported.' || REPLACE(gen_random_uuid()::text, '-', '') || '@no-email.local'),
        COALESCE(NULLIF(TRIM(r.first_name), ''), SPLIT_PART(COALESCE(r.full_legal_name, 'Crew'), ' ', 1)),
        COALESCE(NULLIF(TRIM(r.last_name), ''), NULLIF(TRIM(SPLIT_PART(COALESCE(r.full_legal_name, ''), ' ', 2)), ''), 'Member'),
        v_company_id,
        'crew'::user_role,
        NULLIF(TRIM(r.role), ''),
        NULLIF(TRIM(r.department), ''),
        NULLIF(TRIM(r.nationality), ''),
        COALESCE(NULLIF(TRIM(r.cellular_phone), ''), NULLIF(TRIM(r.secondary_phone), '')),
        r.date_of_birth,
        COALESCE(NULLIF(TRIM(r.preferred_name), ''), NULLIF(TRIM(r.casual_name), '')),
        COALESCE(NULLIF(TRIM(r.status), ''), 'active'),
        'not_invited',
        true,
        r.airtable_id,
        v_vessel_id
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'skipped', v_skipped);
END;
$$;

-- ---------------------------------------------------------------- grants (rule 5) and comments

REVOKE ALL ON FUNCTION public.crew_import_vessel_key(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_import_vessel_key(text) TO service_role;
REVOKE ALL ON FUNCTION public.crew_import_company_backfill() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_import_company_backfill() TO service_role;
REVOKE ALL ON FUNCTION public.crew_import_stage(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_import_stage(uuid, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_crew_import_to_profiles(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_crew_import_to_profiles(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.crew_import_vessel_key(text) IS
  'Pure (20261124061200): the vessel-name key of the staging backfill (lower case, spaces collapsed, a leading M/Y, S/Y, R/V, M/V or E/Y dropped); NULL for a blank name.';
COMMENT ON FUNCTION public.crew_import_company_backfill() IS
  'Service role (20261124061200, D-X1-17): attributes staged rows whose company_id is still NULL. vessels_import by its name (a vessel of exactly one company); crew_import when every source that names a company names the same one (the frp-<vessel id> key, the synced profile, airtable_sync_map, its vessels_import row, its vessel text). Never changes an attributed row; returns the counts.';
COMMENT ON FUNCTION public.crew_import_stage(uuid, jsonb) IS
  'Browser RPC (20261124061200, D-181, D-X1-17): stages up to 500 crew rows into crew_import for the caller''s company. Active caller (42501 not_signed_in), company given (22023 company_required) and the caller''s own (42501 company_mismatch), planner editor (frp_can_edit; 42501 not_permitted), a JSON array (22023 rows_not_array) of at most 500 (22023 too_many_rows). One outcome per row: staged (created / updated) or refused (not_an_object, key_missing, key_invalid, duplicate_in_batch, invalid_value, field_too_long, invalid_email, invalid_crew_id, invalid_date_of_birth, name_missing, key_in_use, archived), with the field at fault. Reads only the whitelisted fields; never claims a key held by another company or by an unattributed row.';
COMMENT ON FUNCTION public.sync_crew_import_to_profiles(uuid) IS
  'Live definer redefined by 20261124061200 (D-X1-17, D-233): an active caller with the legacy sync roles (superadmin, dpa, fleet_master, captain, purser), the caller''s own company only (a p_company_id naming another company: 42501 company_mismatch), and only that company''s staged, unarchived crew_import rows become or update profiles; the matching and copying rules of 20260916133449 are unchanged.';
