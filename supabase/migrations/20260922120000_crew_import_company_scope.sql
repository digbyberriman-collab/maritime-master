-- =================================================================
-- crew_import / vessels_import: company-scoped row level security
-- =================================================================
-- 20260428170231 created crew_import and vessels_import with
--   FOR SELECT TO authenticated USING (true)
-- and no company_id column at all, so any signed-in user of any
-- company could read every company's staged crew import data (full
-- legal name, DOB, nationality, personal contact, next-of-kin).
-- 20260916133246 added INSERT/UPDATE policies gated on role only,
-- still with no company scoping -- and the actively-used import path
-- (src/modules/rotation-planner/components/ImportDialog.tsx) upserts
-- into crew_import keyed only on a global-unique airtable_id, so two
-- companies importing crew can collide on that key. Worse,
-- sync_crew_import_to_profiles() is SECURITY DEFINER and scans the
-- *entire* crew_import table with no company filter, so it can
-- promote another company's staged rows into the calling company's
-- profiles -- RLS alone would not have stopped that even after
-- fixing the policies below, so the function itself is corrected too.
--
-- This migration:
--   1. adds company_id to both tables,
--   2. best-effort backfills it from data already in the schema
--      (crew_import rows already synced to a profile inherit that
--      profile's company; vessels_import rows referenced by exactly
--      one now-tagged company's crew_import rows inherit that
--      company). Anything left NULL cannot be resolved from existing
--      data and stays inaccessible under the new scoped policies --
--      the safe default is "nobody can see it" rather than guessing
--      an owner, until a human triages it.
--   3. replaces crew_import's global UNIQUE(airtable_id) with
--      UNIQUE(company_id, airtable_id), since airtable_id is only
--      meant to be unique per company's own import batch,
--   4. replaces the USING(true)/role-only policies with
--      company-scoped ones, adds an explicit anon deny,
--   5. adds a BEFORE INSERT trigger that fills company_id from the
--      caller when omitted, mirroring the nb_set_company_id()
--      pattern already used for New Build,
--   6. adds a company_id filter to sync_crew_import_to_profiles()'s
--      scan so the SECURITY DEFINER function can no longer read
--      across tenants regardless of RLS.
-- =================================================================

-- ---------------------------------------------------------------
-- 1. Schema: add company_id
-- ---------------------------------------------------------------
ALTER TABLE public.vessels_import ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.crew_import ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS crew_import_company_idx ON public.crew_import (company_id);
CREATE INDEX IF NOT EXISTS vessels_import_company_idx ON public.vessels_import (company_id);

-- ---------------------------------------------------------------
-- 2. Best-effort backfill from data already in the schema
-- ---------------------------------------------------------------

-- crew_import rows that were already promoted to a profile (matched
-- by airtable_id in sync_crew_import_to_profiles) inherit that
-- profile's company -- this is a real, confirmed association, not a
-- guess.
UPDATE public.crew_import ci
SET company_id = p.company_id
FROM public.profiles p
WHERE ci.company_id IS NULL
  AND ci.airtable_id IS NOT NULL
  AND p.airtable_id = ci.airtable_id;

-- vessels_import rows referenced by exactly one company's
-- now-tagged crew_import rows inherit that company. A vessel
-- referenced by more than one distinct company (would only happen if
-- two companies' crew data both cited the same vessel_airtable_id,
-- which the app never does today) is deliberately left NULL rather
-- than guessed.
UPDATE public.vessels_import vi
SET company_id = resolved.company_id
FROM (
  SELECT ci.vessel_airtable_id, MIN(ci.company_id) AS company_id
  FROM public.crew_import ci
  WHERE ci.vessel_airtable_id IS NOT NULL
    AND ci.company_id IS NOT NULL
  GROUP BY ci.vessel_airtable_id
  HAVING COUNT(DISTINCT ci.company_id) = 1
) resolved
WHERE vi.company_id IS NULL
  AND vi.airtable_id = resolved.vessel_airtable_id;

-- ---------------------------------------------------------------
-- 3. Re-scope the uniqueness constraint on crew_import
-- ---------------------------------------------------------------
ALTER TABLE public.crew_import DROP CONSTRAINT IF EXISTS crew_import_airtable_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS crew_import_company_airtable_key
  ON public.crew_import (company_id, airtable_id);

-- ---------------------------------------------------------------
-- 4. Company-scoped RLS
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "crew_import_read_authenticated" ON public.crew_import;
DROP POLICY IF EXISTS "crew_import_write_privileged" ON public.crew_import;
DROP POLICY IF EXISTS "crew_import_update_privileged" ON public.crew_import;

CREATE POLICY "crew_import_company_select" ON public.crew_import
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "crew_import_company_insert" ON public.crew_import
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','fleet_master','captain','purser']::app_role[])
    AND (company_id IS NULL OR public.user_belongs_to_company(auth.uid(), company_id))
  );

CREATE POLICY "crew_import_company_update" ON public.crew_import
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','fleet_master','captain','purser']::app_role[])
    AND public.user_belongs_to_company(auth.uid(), company_id)
  )
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','fleet_master','captain','purser']::app_role[])
    AND public.user_belongs_to_company(auth.uid(), company_id)
  );

CREATE POLICY "crew_import_anon_deny" ON public.crew_import
  FOR ALL TO anon USING (false);

DROP POLICY IF EXISTS "vessels_import_read_authenticated" ON public.vessels_import;

CREATE POLICY "vessels_import_company_select" ON public.vessels_import
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "vessels_import_anon_deny" ON public.vessels_import
  FOR ALL TO anon USING (false);

-- ---------------------------------------------------------------
-- 5. Auto-fill company_id on insert (defense in depth alongside the
--    client sending it explicitly)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crew_import_set_company_id()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.company_id := public.get_user_company_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.crew_import_set_company_id() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_crew_import_set_company_id ON public.crew_import;
CREATE TRIGGER trg_crew_import_set_company_id
  BEFORE INSERT ON public.crew_import
  FOR EACH ROW EXECUTE FUNCTION public.crew_import_set_company_id();

-- ---------------------------------------------------------------
-- 6. Stop sync_crew_import_to_profiles() reading across tenants
--    (SECURITY DEFINER bypasses RLS, so the policy fix above alone
--    does not close this)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_crew_import_to_profiles(p_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  r record;
  v_email text;
  v_vessel_id uuid;
  v_profile_id uuid;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','fleet_master','captain','purser']::app_role[]) THEN
    RAISE EXCEPTION 'Insufficient permissions to sync crew';
  END IF;

  v_company_id := COALESCE(p_company_id, public.get_user_company_id(auth.uid()));
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company context for crew sync';
  END IF;

  FOR r IN
    SELECT * FROM public.crew_import
    WHERE is_archived IS NOT TRUE
      AND company_id = v_company_id
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

-- Verification (run after applying):
--   SELECT policyname, qual FROM pg_policies
--   WHERE tablename IN ('crew_import','vessels_import') AND qual = 'true';
--   must return no rows.
--   SELECT count(*) FROM crew_import WHERE company_id IS NULL; -- rows still needing manual triage
