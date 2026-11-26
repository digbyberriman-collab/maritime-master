-- =================================================================
-- FLEET OPERATIONS X5-08: the crew medical status (gap/02 M1, W8;
-- gap/04 C61; DECISIONS C5, D-01, D-04, D-120, D-157, D-199, D-217;
-- X5 spec §2 X5-08, D-X5-08, D-X5-09, D-X5-21, D-X5-22, D-X1-4, D-X1-7;
-- platform-prep plan contracts 1 and 7)
-- Tables: fleet_medical_settings (per company: which fitness assessments
--   count as ENG1, the accepted equivalents, the required vaccines)
-- Functions (browser): fleet_medical_settings_save,
--   fleet_crew_medical_status
-- Functions (service role; the definers above): fleet_medical_vaccine_key,
--   fleet_medical_reasons, fleet_medical_status_of
-- TS mirrors: src/modules/fleet/lib/medicalStatus.ts (the reasons, their
--   order and severity, the status; the reasons table of
--   supabase/tests/sql/fleet/medical_status.test.sql is generated from
--   src/test/fleet/medicalStatus.test.ts and pinned by it),
--   src/modules/fleet/lib/medicalSettingsSchema.ts (the settings rules),
--   src/modules/fleet/types/db.pending.ts (the shapes)
-- =================================================================
--
-- One rolled-up medical status per current crew member (W8), so the fleet
-- medical grid (/fleet/medical) and the vessel Crew Medical page
-- (/v/:code/crew/medical, the same grid for one vessel) read one answer:
--
--   fleet_crew_medical_status(p_vessel_ids, p_status, p_today)
--
-- People: the current crew of the vessels (fleet_current_crew, 040000:
-- current assignments plus login-less placements, D-199), one vessel per
-- person (the vessel they are on before one they are joining, then the
-- latest join, as the expiry source views do), each with their Health
-- subject (hw_people.profile_id; a profile trigger keeps one per profile).
-- Planned joiners (join date after today, D-X1-4) are listed with
-- is_planned and their join date ("Joining <date>").
--
-- What is read (administrative fields only; never a diagnosis, a note, a
-- restriction text, a medication or a screening answer; docs/HEALTH.md,
-- gap/02 pitfall "medical grid"):
--   ENG1           med_fitness_assessments of the company's ENG1 types and
--                  accepted equivalents (fleet_medical_settings; T-185):
--                  type, status, issue and expiry dates. Pending
--                  assessments are not certificates. Plus, when X1's
--                  crew_document_types.is_medical_fitness exists (checked in
--                  information_schema; read through EXECUTE, contract 7), the
--                  crew documents of such a type (code ENG1 counts as ENG1,
--                  every other one as an accepted equivalent).
--   Vaccinations   med_vaccinations: the vaccine name (compared trimmed,
--                  spaces collapsed, in lower case), valid until, the
--                  required flag and whether an exemption is recorded (never
--                  its text). Required = on the company's list or marked
--                  required on any of the person's records of that vaccine.
--   Rest           work_rest_compliance_checks over the last 30 days
--                  (p_today - 29 .. p_today, window_start in UTC), each
--                  check on the vessel of its month, else of the assignment
--                  covering its day (X5-02A's attribution,
--                  fleet_dashboard_hor_crew_days), counted on the vessel the
--                  person is listed on; only for people with a login on a
--                  vessel whose crew and crew_hor modules are on (else not
--                  tracked: NULL). Serious: X1's
--                  work_rest_non_conformities.is_serious when that column
--                  exists (live, not superseded, not dismissed; EXECUTE);
--                  otherwise a failing check with < 4 h rest in a 24-hour or
--                  daily window or < 50 h in a 7-day window (§6.14).
--   Health checks  med_screening_records (status, due and completed dates)
--                  until gap/02 M2's occupational health checks exist:
--                  overdue = still open (invited, in progress) past its due
--                  date; none on file = no record other than cancelled ones.
--   Flags          condition_flag (an active or managed condition that
--                  affects fitness) and allergy_flag (an active allergy),
--                  only where the caller is a clinical viewer on that vessel
--                  (fleet_ops_can medical_clinical view) or the person shares
--                  safety flags (hw_people.consent_share_safety_flags);
--                  otherwise NULL. Never the condition or the allergen.
--
-- Windows come only from expiry_window_rules (C5) through
-- expiry_window_for(): ENG1 at risk = expiry_bucket(expiry, the 'medical'
-- window) = expiring_soon (30 days or fewer, never earlier than the
-- window); booster due = expiry_bucket(valid until, the 'vaccination'
-- window) in (expiring_soon, expiring). Health's hw_settings warning days
-- stay Health's alert lead times (D-X5-08).
--
-- Status (W8; fleet_medical_reasons / fleet_medical_status_of, mirrored by
-- src/modules/fleet/lib/medicalStatus.ts), with the reasons as codes, most
-- severe first and in this order:
--   critical    eng1_missing (with a Health record), eng1_unfit (the latest
--               assessment says unfit or temporarily unfit), eng1_expired,
--               required_vaccine_expired, required_vaccine_missing,
--               serious_rest_breach
--   at_risk     eng1_expiring, booster_due, vaccine_overdue (a vaccine that
--               is not required has expired), rest_noncompliance (any
--               failing check; left out when a serious breach is listed),
--               occ_health_overdue
--   incomplete  no_health_record, eng1_no_expiry (ENG1 on file without an
--               expiry date), no_vaccinations (no vaccination record at
--               all), no_occ_health (no health check on file)
--   ok          none of these
-- The ENG1 on file: the best candidate is a dated one still valid today,
-- else one without a date, else the latest expired one (an assessment
-- recorded as expired counts as expired whatever its date); the latest
-- assessment of the configured types decides "unfit", unless a crew
-- document of a fitness type was issued after it.
--
-- Access (D-04, D-X5-21, D-X5-22): an active caller of the company; the
-- vessels are fleet_counted_vessels_for() (NULL = every counted vessel the
-- caller reaches; explicit ids are reach-checked, 42501
-- vessel_out_of_reach for a foreign or unreached one); then only the
-- vessels where fleet_ops_can medical_fitness view holds (med_fitness_can_view
-- or medical_can_view, the adaptor's domain('fitness') of
-- fleet.operations.fleet_medical.view and vessel.crew.crew_medical.view).
-- Crew without medical access, an inactive caller, no company or no JWT:
-- no rows.
--
-- Settings: fleet_medical_settings (one row per company; none = the
-- defaults: ENG1 counts, no equivalents, no required vaccines). Read by the
-- company's fitness or medical viewers (RLS); written only by
-- fleet_medical_settings_save() (medical admins with fleet reach:
-- fleet_ops_can medical_admin), which returns the stored row.
--
-- Nothing here is live (D-01): the client reads both objects through the
-- pending shim and shows "Fleet medical status is not set up yet" while the
-- RPC is missing, and the defaults read-only while the settings table is.
-- Applying it changes nothing users see today: no live table, policy or
-- function is touched.
--
-- Idempotent (D-12, D-55).

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regprocedure('public.fleet_ops_can_for(uuid,uuid,uuid,text,text)') IS NULL
     OR to_regprocedure('public.fleet_counted_vessels_for(uuid,uuid,uuid[])') IS NULL
     OR to_regprocedure('public.fleet_current_crew(uuid[])') IS NULL
     OR to_regprocedure('public.expiry_bucket(date,integer,date,boolean)') IS NULL
     OR to_regprocedure('public.expiry_window_for(uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040700_fleet_medical_status needs the fleet expiry engine: apply 20261124040000_fleet_expiry_engine.sql first';
  END IF;
  IF to_regprocedure('public.fleet_dashboard_hor_crew_days(uuid,uuid[],date,date)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040700_fleet_medical_status needs the fleet dashboard''s hours-of-rest attribution: apply 20261124040100_fleet_dashboard_kpis.sql first';
  END IF;
  IF to_regprocedure('public.vessel_module_on_internal(uuid,text,date)') IS NULL
     OR to_regprocedure('public.user_is_active(uuid)') IS NULL
     OR to_regprocedure('public.get_user_company_id(uuid)') IS NULL
     OR to_regprocedure('public.med_fitness_can_view(uuid)') IS NULL
     OR to_regprocedure('public.medical_can_view(uuid)') IS NULL
     OR to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040700_fleet_medical_status needs vessel_module_on_internal (20261123000500), the active-aware helpers (20261123010000) and update_updated_at_column()';
  END IF;
  IF to_regclass('public.hw_people') IS NULL OR to_regclass('public.med_fitness_assessments') IS NULL
     OR to_regclass('public.med_vaccinations') IS NULL OR to_regclass('public.med_screening_records') IS NULL
     OR to_regclass('public.med_conditions') IS NULL OR to_regclass('public.med_allergies') IS NULL
     OR to_regclass('public.work_rest_compliance_checks') IS NULL OR to_regclass('public.work_rest_monthly_submissions') IS NULL
     OR to_regclass('public.crew_assignments') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040700_fleet_medical_status needs the live Health, hours-of-rest and crew tables';
  END IF;
END
$$;

-- ---------------------------------------------------------------- fleet_medical_settings (D-X5-08)

CREATE TABLE IF NOT EXISTS public.fleet_medical_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  -- med_fitness_assessments.assessment_type values that are an ENG1.
  eng1_assessment_types text[] NOT NULL DEFAULT '{eng1}',
  -- Other assessment types accepted as equivalent to an ENG1 (T-185).
  eng1_equivalent_types text[] NOT NULL DEFAULT '{}',
  -- Vaccines every crew member must hold, as written by the company.
  required_vaccines text[] NOT NULL DEFAULT '{}',
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fleet_medical_settings
  DROP CONSTRAINT IF EXISTS fleet_medical_settings_eng1_types_check,
  ADD CONSTRAINT fleet_medical_settings_eng1_types_check CHECK (
    cardinality(eng1_assessment_types) BETWEEN 1 AND 7
    AND eng1_assessment_types <@ ARRAY['eng1', 'ml5', 'company', 'return_to_work', 'pre_employment', 'periodic', 'other']::text[]),
  DROP CONSTRAINT IF EXISTS fleet_medical_settings_equivalent_types_check,
  ADD CONSTRAINT fleet_medical_settings_equivalent_types_check CHECK (
    cardinality(eng1_equivalent_types) <= 6
    AND eng1_equivalent_types <@ ARRAY['eng1', 'ml5', 'company', 'return_to_work', 'pre_employment', 'periodic', 'other']::text[]
    AND NOT (eng1_equivalent_types && eng1_assessment_types)),
  DROP CONSTRAINT IF EXISTS fleet_medical_settings_required_vaccines_check,
  ADD CONSTRAINT fleet_medical_settings_required_vaccines_check CHECK (
    cardinality(required_vaccines) <= 40 AND array_position(required_vaccines, NULL) IS NULL);

ALTER TABLE public.fleet_medical_settings ENABLE ROW LEVEL SECURITY;

-- Read: the company's fitness or medical viewers (get_user_company_id() is
-- NULL for an inactive caller, D-157; both helpers are active-aware),
-- computed once per statement. No browser write policy:
-- fleet_medical_settings_save() only.
DROP POLICY IF EXISTS fleet_medical_settings_select ON public.fleet_medical_settings;
CREATE POLICY fleet_medical_settings_select ON public.fleet_medical_settings
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND ((SELECT public.med_fitness_can_view(auth.uid())) OR (SELECT public.medical_can_view(auth.uid())))
  );

DROP TRIGGER IF EXISTS trg_fleet_medical_settings_updated_at ON public.fleet_medical_settings;
CREATE TRIGGER trg_fleet_medical_settings_updated_at
  BEFORE UPDATE ON public.fleet_medical_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON public.fleet_medical_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fleet_medical_settings TO authenticated;
GRANT ALL ON public.fleet_medical_settings TO service_role;

-- ---------------------------------------------------------------- pure rules (TS: lib/medicalStatus.ts)

-- A vaccine name as it is compared: trimmed, runs of white space as one
-- space, lower case; NULL for a blank name.
CREATE OR REPLACE FUNCTION public.fleet_medical_vaccine_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT nullif(lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g')), '')
$$;

-- The W8 reasons of one person, most severe first, in the fixed order of
-- the header (medicalReasons() in lib/medicalStatus.ts). Counts that are
-- NULL (not known: no Health record, rest not tracked) raise nothing.
CREATE OR REPLACE FUNCTION public.fleet_medical_reasons(
  p_has_health_record boolean,
  p_eng1_state text,
  p_required_expired integer,
  p_required_missing integer,
  p_vaccine_overdue integer,
  p_boosters_due integer,
  p_vaccination_records integer,
  p_serious_rest integer,
  p_rest_noncompliant integer,
  p_occ_state text
)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN p_eng1_state = 'missing' AND coalesce(p_has_health_record, false) THEN 'eng1_missing' END,
    CASE WHEN p_eng1_state = 'unfit' THEN 'eng1_unfit' END,
    CASE WHEN p_eng1_state = 'expired' THEN 'eng1_expired' END,
    CASE WHEN coalesce(p_required_expired, 0) > 0 THEN 'required_vaccine_expired' END,
    CASE WHEN coalesce(p_required_missing, 0) > 0 THEN 'required_vaccine_missing' END,
    CASE WHEN coalesce(p_serious_rest, 0) > 0 THEN 'serious_rest_breach' END,
    CASE WHEN p_eng1_state = 'expiring_soon' THEN 'eng1_expiring' END,
    CASE WHEN coalesce(p_boosters_due, 0) > 0 THEN 'booster_due' END,
    CASE WHEN coalesce(p_vaccine_overdue, 0) > 0 THEN 'vaccine_overdue' END,
    CASE WHEN coalesce(p_rest_noncompliant, 0) > 0 AND coalesce(p_serious_rest, 0) = 0 THEN 'rest_noncompliance' END,
    CASE WHEN p_occ_state = 'overdue' THEN 'occ_health_overdue' END,
    CASE WHEN NOT coalesce(p_has_health_record, false) THEN 'no_health_record' END,
    CASE WHEN p_eng1_state = 'no_expiry' THEN 'eng1_no_expiry' END,
    CASE WHEN coalesce(p_has_health_record, false) AND coalesce(p_vaccination_records, 0) = 0 THEN 'no_vaccinations' END,
    CASE WHEN coalesce(p_has_health_record, false) AND p_occ_state = 'none' THEN 'no_occ_health' END
  ]::text[], NULL)
$$;

-- The status of a set of reasons: its most severe level, else ok
-- (medicalStatusOf() in lib/medicalStatus.ts).
CREATE OR REPLACE FUNCTION public.fleet_medical_status_of(p_reasons text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN coalesce(p_reasons, '{}'::text[]) && ARRAY['eng1_missing', 'eng1_unfit', 'eng1_expired', 'required_vaccine_expired',
                                                     'required_vaccine_missing', 'serious_rest_breach']::text[] THEN 'critical'
    WHEN coalesce(p_reasons, '{}'::text[]) && ARRAY['eng1_expiring', 'booster_due', 'vaccine_overdue', 'rest_noncompliance',
                                                     'occ_health_overdue']::text[] THEN 'at_risk'
    WHEN coalesce(p_reasons, '{}'::text[]) && ARRAY['no_health_record', 'eng1_no_expiry', 'no_vaccinations', 'no_occ_health']::text[] THEN 'incomplete'
    ELSE 'ok'
  END
$$;

-- ---------------------------------------------------------------- settings (browser)

-- Save the caller's company medical settings (gap/02 M1; D-X5-08). Medical
-- admins with fleet reach only (fleet_ops_can medical_admin; 42501
-- not_permitted otherwise, also for an inactive caller or no company).
-- p_settings is an object with any of:
--   eng1_assessment_types   assessment types that are an ENG1 (one or more)
--   eng1_equivalent_types   assessment types accepted as equivalent
--   required_vaccines       vaccine names (1 to 80 characters each, 40 at
--                           most, the same name twice counts once)
--   expected_updated_at     the updated_at the caller read (NULL = no row
--                           yet): refused when the stored row differs
-- Keys left out keep their stored (or default) value. Refusals, 22023:
-- invalid_settings (not an object, or a value of the wrong type),
-- unknown_setting, invalid_assessment_type, eng1_types_required,
-- eng1_types_overlap, invalid_vaccine, too_many_vaccines, stale_settings.
-- Returns the stored row.
CREATE OR REPLACE FUNCTION public.fleet_medical_settings_save(p_settings jsonb)
RETURNS public.fleet_medical_settings
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  c_types CONSTANT text[] := ARRAY['eng1', 'ml5', 'company', 'return_to_work', 'pre_employment', 'periodic', 'other'];
  v_current public.fleet_medical_settings;
  v_found boolean;
  v_types text[];
  v_equivs text[];
  v_vaccines text[];
  v_key text;
  v_value jsonb;
  v_name text;
  v_seen text[] := ARRAY[]::text[];
  v_expected timestamptz;
  v_row public.fleet_medical_settings;
BEGIN
  v_company := public.get_user_company_id(v_uid);
  IF v_uid IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  IF NOT public.fleet_ops_can_for(v_uid, v_company, NULL, 'medical_admin', 'admin') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  IF p_settings IS NULL OR jsonb_typeof(p_settings) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_settings';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_settings) LOOP
    IF v_key NOT IN ('eng1_assessment_types', 'eng1_equivalent_types', 'required_vaccines', 'expected_updated_at') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unknown_setting', DETAIL = format('unknown setting %s', v_key);
    END IF;
  END LOOP;

  SELECT * INTO v_current FROM public.fleet_medical_settings AS s WHERE s.company_id = v_company FOR UPDATE;
  v_found := FOUND;

  IF p_settings ? 'expected_updated_at' THEN
    v_value := p_settings -> 'expected_updated_at';
    IF jsonb_typeof(v_value) = 'null' THEN
      v_expected := NULL;
    ELSIF jsonb_typeof(v_value) = 'string' THEN
      BEGIN
        v_expected := (v_value #>> '{}')::timestamptz;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_settings', DETAIL = 'expected_updated_at is not a time';
      END;
    ELSE
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_settings', DETAIL = 'expected_updated_at is not a time';
    END IF;
    IF (CASE WHEN v_found THEN v_current.updated_at END) IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'stale_settings';
    END IF;
  END IF;

  v_types := CASE WHEN v_found THEN v_current.eng1_assessment_types ELSE ARRAY['eng1']::text[] END;
  v_equivs := CASE WHEN v_found THEN v_current.eng1_equivalent_types ELSE ARRAY[]::text[] END;
  v_vaccines := CASE WHEN v_found THEN v_current.required_vaccines ELSE ARRAY[]::text[] END;

  FOREACH v_key IN ARRAY ARRAY['eng1_assessment_types', 'eng1_equivalent_types'] LOOP
    IF p_settings ? v_key THEN
      v_value := p_settings -> v_key;
      IF jsonb_typeof(v_value) <> 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_value) AS e WHERE jsonb_typeof(e) <> 'string') THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_settings', DETAIL = format('%s must be a list of names', v_key);
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_value) AS e WHERE btrim(e) <> ALL (c_types)) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_assessment_type';
      END IF;
      -- In the canonical order of the assessment types, each once.
      IF v_key = 'eng1_assessment_types' THEN
        v_types := ARRAY(SELECT t FROM unnest(c_types) WITH ORDINALITY AS c(t, ord)
                         WHERE t IN (SELECT btrim(e) FROM jsonb_array_elements_text(v_value) AS e) ORDER BY ord);
      ELSE
        v_equivs := ARRAY(SELECT t FROM unnest(c_types) WITH ORDINALITY AS c(t, ord)
                          WHERE t IN (SELECT btrim(e) FROM jsonb_array_elements_text(v_value) AS e) ORDER BY ord);
      END IF;
    END IF;
  END LOOP;
  IF cardinality(v_types) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'eng1_types_required';
  END IF;
  IF v_types && v_equivs THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'eng1_types_overlap';
  END IF;

  IF p_settings ? 'required_vaccines' THEN
    v_value := p_settings -> 'required_vaccines';
    IF jsonb_typeof(v_value) <> 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_value) AS e WHERE jsonb_typeof(e) <> 'string') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_settings', DETAIL = 'required_vaccines must be a list of names';
    END IF;
    v_vaccines := ARRAY[]::text[];
    FOR v_name IN SELECT regexp_replace(btrim(e), '\s+', ' ', 'g') FROM jsonb_array_elements_text(v_value) WITH ORDINALITY AS x(e, ord) ORDER BY ord LOOP
      IF length(v_name) < 1 OR length(v_name) > 80 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_vaccine', DETAIL = 'a vaccine name is 1 to 80 characters';
      END IF;
      IF public.fleet_medical_vaccine_key(v_name) = ANY (v_seen) THEN
        CONTINUE;
      END IF;
      v_seen := v_seen || public.fleet_medical_vaccine_key(v_name);
      v_vaccines := v_vaccines || v_name;
    END LOOP;
    IF cardinality(v_vaccines) > 40 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'too_many_vaccines';
    END IF;
  END IF;

  INSERT INTO public.fleet_medical_settings AS s (company_id, eng1_assessment_types, eng1_equivalent_types, required_vaccines, updated_by)
  VALUES (v_company, v_types, v_equivs, v_vaccines, v_uid)
  ON CONFLICT (company_id) DO UPDATE
    SET eng1_assessment_types = EXCLUDED.eng1_assessment_types,
        eng1_equivalent_types = EXCLUDED.eng1_equivalent_types,
        required_vaccines = EXCLUDED.required_vaccines,
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
  RETURNING s.* INTO v_row;
  IF v_row.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'settings_not_saved';
  END IF;
  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------- the status (browser)

-- One row per current crew member of the vessels the caller may read
-- medical fitness on (header), most severe first: status, then the number
-- of reasons, then vessel and name. p_status keeps only those statuses
-- (22023 invalid_status for an unknown one); p_today is the day the dates
-- are judged on (default today).
CREATE OR REPLACE FUNCTION public.fleet_crew_medical_status(
  p_vessel_ids uuid[] DEFAULT NULL,
  p_status text[] DEFAULT NULL,
  p_today date DEFAULT current_date
)
RETURNS TABLE (
  profile_id uuid, person_name text, vessel_id uuid, vessel_name text, vessel_code text, "position" text, department text,
  is_planned boolean, join_date date, has_health_record boolean,
  eng1_state text, eng1_expires_on date, eng1_is_equivalent boolean,
  vaccines_valid integer, vaccines_expired integer, vaccines_missing integer, boosters_due integer,
  rest_tracked boolean, rest_noncompliant_30d integer, serious_rest_breach_30d integer,
  occ_health_state text, occ_health_due_on date,
  condition_flag boolean, allergy_flag boolean,
  status text, reasons text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_today date := coalesce(p_today, current_date);
  v_vessels uuid[];
  v_gated uuid[];
  v_clinical uuid[];
  v_hor uuid[];
  v_types text[] := ARRAY['eng1']::text[];
  v_equivs text[] := ARRAY[]::text[];
  v_required text[] := ARRAY[]::text[];
  v_settings public.fleet_medical_settings;
  v_med_window integer;
  v_vac_window integer;
  v_profiles uuid[];
  v_users uuid[];
  v_docs jsonb := '[]'::jsonb;
  v_serious jsonb;
BEGIN
  IF p_status IS NOT NULL AND EXISTS (
       SELECT 1 FROM unnest(p_status) AS s WHERE s IS NULL OR s NOT IN ('critical', 'at_risk', 'incomplete', 'ok')) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_status';
  END IF;
  IF v_uid IS NULL OR NOT coalesce(public.user_is_active(v_uid), false) THEN
    RETURN;
  END IF;
  v_company := public.get_user_company_id(v_uid);
  IF v_company IS NULL THEN
    RETURN;
  END IF;

  -- The vessels (42501 vessel_out_of_reach for an explicit id out of reach), then the medical gate per vessel.
  v_vessels := ARRAY(SELECT f.id FROM public.fleet_counted_vessels_for(v_uid, v_company, p_vessel_ids) AS f(id));
  v_gated := ARRAY(SELECT x FROM unnest(v_vessels) AS x WHERE public.fleet_ops_can_for(v_uid, v_company, x, 'medical_fitness', 'view'));
  IF cardinality(v_gated) = 0 THEN
    RETURN;
  END IF;
  v_clinical := ARRAY(SELECT x FROM unnest(v_gated) AS x WHERE public.fleet_ops_can_for(v_uid, v_company, x, 'medical_clinical', 'view'));
  v_hor := ARRAY(SELECT x FROM unnest(v_gated) AS x
                 WHERE coalesce(public.vessel_module_on_internal(x, 'crew', v_today), false)
                   AND coalesce(public.vessel_module_on_internal(x, 'crew_hor', v_today), false));

  SELECT * INTO v_settings FROM public.fleet_medical_settings AS s WHERE s.company_id = v_company;
  IF FOUND THEN
    v_types := v_settings.eng1_assessment_types;
    v_equivs := v_settings.eng1_equivalent_types;
    v_required := ARRAY(SELECT DISTINCT public.fleet_medical_vaccine_key(x) FROM unnest(v_settings.required_vaccines) AS x
                        WHERE public.fleet_medical_vaccine_key(x) IS NOT NULL);
  END IF;
  v_med_window := public.expiry_window_for(v_company, 'medical');
  v_vac_window := public.expiry_window_for(v_company, 'vaccination');

  SELECT coalesce(array_agg(DISTINCT c.profile_id), ARRAY[]::uuid[]),
         coalesce(array_agg(DISTINCT c.user_id) FILTER (WHERE c.user_id IS NOT NULL), ARRAY[]::uuid[])
  INTO v_profiles, v_users
  FROM public.fleet_current_crew(v_gated) AS c;

  -- X1's medical fitness documents (contract 7), only when the catalogue column exists.
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'crew_document_types' AND column_name = 'is_medical_fitness')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'crew_document_types' AND column_name = 'code')
     AND (SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'crew_certificates'
            AND column_name IN ('document_type_id', 'profile_id', 'company_id', 'deleted_at')) = 4 THEN
    EXECUTE $x$
      SELECT coalesce(jsonb_agg(jsonb_build_object('profile_id', d.profile_id, 'expires_on', d.expiry_date,
                                                   'issued_on', d.issue_date, 'is_eng1', d.is_eng1)), '[]'::jsonb)
      FROM (SELECT cc.profile_id, cc.expiry_date, cc.issue_date,
                   translate(btrim(coalesce(t.code, '')), 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') = 'ENG1' AS is_eng1
            FROM public.crew_certificates AS cc
            JOIN public.crew_document_types AS t ON t.id = cc.document_type_id
            WHERE t.is_medical_fitness AND cc.deleted_at IS NULL
              AND cc.company_id = $1 AND cc.profile_id = ANY ($2)) AS d
    $x$ INTO v_docs USING v_company, v_profiles;
  END IF;

  -- X1's serious breach flag (agreement 6), only when its columns exist; otherwise the legacy rule below.
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'work_rest_non_conformities'
        AND column_name IN ('is_serious', 'superseded_at', 'vessel_id', 'breach_day', 'review_outcome')) = 5 THEN
    EXECUTE $x$
      SELECT coalesce(jsonb_agg(jsonb_build_object('crew_id', n.crew_id, 'vessel_id', n.vessel_id, 'days', n.days)), '[]'::jsonb)
      FROM (SELECT x.crew_id, x.vessel_id, count(DISTINCT x.breach_day)::integer AS days
            FROM public.work_rest_non_conformities AS x
            WHERE x.crew_id = ANY ($1) AND x.vessel_id = ANY ($2)
              AND x.is_serious AND x.superseded_at IS NULL
              AND x.status <> 'dismissed' AND x.review_outcome IS DISTINCT FROM 'dismissed'
              AND x.breach_day BETWEEN $3 - 29 AND $3
            GROUP BY x.crew_id, x.vessel_id) AS n
    $x$ INTO v_serious USING v_users, v_hor, v_today;
  END IF;

  RETURN QUERY
    WITH crew_all AS (
      SELECT c.vessel_id AS c_vessel, c.profile_id AS c_profile, c.user_id AS c_user, c."position" AS c_position,
             c.department AS c_department, c.join_date AS c_join, c.is_planned AS c_planned
      FROM public.fleet_current_crew(v_gated) AS c
      JOIN public.profiles AS p ON p.id = c.profile_id AND p.company_id = v_company
    ),
    crew AS (
      SELECT DISTINCT ON (a.c_profile) a.*
      FROM crew_all AS a
      ORDER BY a.c_profile, a.c_planned, a.c_join DESC NULLS LAST, a.c_vessel
    ),
    person AS (
      SELECT cr.c_profile AS pe_profile, h.id AS pe_person, h.consent_share_safety_flags AS pe_consent
      FROM crew AS cr
      JOIN public.hw_people AS h ON h.profile_id = cr.c_profile AND h.company_id = v_company
    ),
    -- Fitness assessments of the configured types (never pending): type, status and dates only.
    fitness AS (
      SELECT cr.c_profile AS f_profile, m.assessment_type AS f_type, m.status AS f_status, m.issued_on AS f_issued,
             m.expires_on AS f_expires, m.created_at AS f_created
      FROM crew AS cr
      LEFT JOIN person AS pe ON pe.pe_profile = cr.c_profile
      JOIN public.med_fitness_assessments AS m
        ON m.company_id = v_company AND (m.profile_id = cr.c_profile OR m.person_id = pe.pe_person)
      WHERE m.assessment_type = ANY (v_types || v_equivs) AND m.status <> 'pending'
    ),
    latest_fit AS (
      SELECT DISTINCT ON (f.f_profile) f.f_profile AS l_profile, f.f_status AS l_status,
             coalesce(f.f_issued, f.f_created::date) AS l_issued
      FROM fitness AS f
      ORDER BY f.f_profile, f.f_issued DESC NULLS LAST, f.f_created DESC
    ),
    docs AS (
      SELECT d.profile_id AS d_profile, d.expires_on AS d_expires, d.issued_on AS d_issued, coalesce(d.is_eng1, false) AS d_eng1
      FROM jsonb_to_recordset(v_docs) AS d(profile_id uuid, expires_on date, issued_on date, is_eng1 boolean)
    ),
    candidates AS (
      SELECT f.f_profile AS k_profile,
             CASE WHEN f.f_status = 'expired' THEN least(coalesce(f.f_expires, v_today - 1), v_today - 1) ELSE f.f_expires END AS k_eff,
             f.f_expires AS k_shown,
             (f.f_type <> ALL (v_types)) AS k_equivalent
      FROM fitness AS f
      WHERE f.f_status IN ('fit', 'fit_with_restrictions', 'expired')
      UNION ALL
      SELECT d.d_profile, d.d_expires, d.d_expires, NOT d.d_eng1
      FROM docs AS d
    ),
    best AS (
      SELECT DISTINCT ON (k.k_profile) k.k_profile AS b_profile, k.k_eff AS b_eff, k.k_shown AS b_shown, k.k_equivalent AS b_equivalent
      FROM candidates AS k
      ORDER BY k.k_profile,
               CASE WHEN k.k_eff >= v_today THEN 0 WHEN k.k_eff IS NULL THEN 1 ELSE 2 END,
               k.k_eff DESC NULLS LAST,
               k.k_equivalent
    ),
    eng1 AS (
      SELECT cr.c_profile AS e_profile,
             CASE
               WHEN lf.l_status IN ('unfit', 'temporarily_unfit')
                    AND NOT EXISTS (SELECT 1 FROM docs AS d WHERE d.d_profile = cr.c_profile AND d.d_issued > lf.l_issued) THEN 'unfit'
               WHEN b.b_profile IS NULL THEN 'missing'
               WHEN b.b_eff IS NULL THEN 'no_expiry'
               ELSE public.expiry_bucket(b.b_eff, v_med_window, v_today)
             END AS e_state,
             b.b_shown AS e_expires,
             b.b_equivalent AS e_equivalent
      FROM crew AS cr
      LEFT JOIN latest_fit AS lf ON lf.l_profile = cr.c_profile
      LEFT JOIN best AS b ON b.b_profile = cr.c_profile
    ),
    vac AS (
      SELECT pe.pe_profile AS v_profile, public.fleet_medical_vaccine_key(x.vaccine) AS v_key, x.valid_until AS v_until,
             coalesce(x.is_required, false) AS v_flagged, nullif(btrim(coalesce(x.exemption_reason, '')), '') IS NOT NULL AS v_exempt,
             x.administered_on AS v_given, x.created_at AS v_created
      FROM person AS pe
      JOIN public.med_vaccinations AS x ON x.person_id = pe.pe_person AND x.company_id = v_company
    ),
    vac_best AS (
      SELECT DISTINCT ON (x.v_profile, x.v_key) x.v_profile AS vb_profile, x.v_key AS vb_key, x.v_until AS vb_until, x.v_exempt AS vb_exempt,
             (bool_or(x.v_flagged) OVER (PARTITION BY x.v_profile, x.v_key) OR x.v_key = ANY (v_required)) AS vb_required
      FROM vac AS x
      WHERE x.v_key IS NOT NULL
      ORDER BY x.v_profile, x.v_key, x.v_exempt DESC, (x.v_until IS NULL) DESC, x.v_until DESC, x.v_given DESC NULLS LAST, x.v_created DESC
    ),
    vac_counts AS (
      SELECT pe.pe_profile AS vc_profile,
             (SELECT count(*) FROM vac AS x WHERE x.v_profile = pe.pe_profile)::integer AS vc_records,
             count(vb.vb_key) FILTER (WHERE vb.vb_exempt OR vb.vb_until IS NULL OR vb.vb_until >= v_today)::integer AS vc_valid,
             count(vb.vb_key) FILTER (WHERE NOT vb.vb_exempt AND vb.vb_until < v_today)::integer AS vc_expired,
             count(vb.vb_key) FILTER (WHERE NOT vb.vb_exempt AND vb.vb_until < v_today AND vb.vb_required)::integer AS vc_required_expired,
             count(vb.vb_key) FILTER (WHERE NOT vb.vb_exempt AND vb.vb_until >= v_today
                                        AND public.expiry_bucket(vb.vb_until, v_vac_window, v_today) IN ('expiring_soon', 'expiring'))::integer AS vc_boosters,
             (SELECT count(*) FROM unnest(v_required) AS r(k)
              WHERE NOT EXISTS (SELECT 1 FROM vac_best AS b2 WHERE b2.vb_profile = pe.pe_profile AND b2.vb_key = r.k))::integer AS vc_missing
      FROM person AS pe
      LEFT JOIN vac_best AS vb ON vb.vb_profile = pe.pe_profile
      GROUP BY pe.pe_profile
    ),
    occ AS (
      SELECT pe.pe_profile AS o_profile,
             count(s.id) FILTER (WHERE s.status <> 'cancelled')::integer AS o_records,
             count(s.id) FILTER (WHERE s.status IN ('invited', 'in_progress') AND s.completed_on IS NULL AND s.due_on < v_today)::integer AS o_overdue,
             min(s.due_on) FILTER (WHERE s.status IN ('invited', 'in_progress') AND s.completed_on IS NULL) AS o_due
      FROM person AS pe
      LEFT JOIN public.med_screening_records AS s ON s.person_id = pe.pe_person AND s.company_id = v_company
      GROUP BY pe.pe_profile
    ),
    -- Breach days per person and vessel (X5-02A's attribution).
    rest AS (
      SELECT h.crew_id AS r_user, h.vessel_id AS r_vessel, count(DISTINCT h.on_day) FILTER (WHERE h.breach)::integer AS r_days
      FROM public.fleet_dashboard_hor_crew_days(v_company, v_hor, v_today - 29, v_today) AS h
      WHERE h.crew_id = ANY (v_users)
      GROUP BY h.crew_id, h.vessel_id
    ),
    -- Serious breach days: X1's flag when it exists, else the legacy thresholds on the failing checks.
    serious AS (
      SELECT s.crew_id AS s_user, s.vessel_id AS s_vessel, s.days AS s_days
      FROM jsonb_to_recordset(coalesce(v_serious, '[]'::jsonb)) AS s(crew_id uuid, vessel_id uuid, days integer)
      WHERE v_serious IS NOT NULL
      UNION ALL
      SELECT k.crew_id, k.vessel_id, count(DISTINCT k.on_day)::integer
      FROM (
        SELECT c.crew_id,
               (c.window_start AT TIME ZONE 'UTC')::date AS on_day,
               coalesce(sub.vessel_id, (
                 SELECT ca.vessel_id FROM public.crew_assignments AS ca
                 WHERE ca.user_id = c.crew_id
                   AND (coalesce(ca.join_date, ca.start_date) IS NULL OR coalesce(ca.join_date, ca.start_date) <= (c.window_start AT TIME ZONE 'UTC')::date)
                   AND (coalesce(ca.leave_date, ca.end_date) IS NULL OR coalesce(ca.leave_date, ca.end_date) >= (c.window_start AT TIME ZONE 'UTC')::date)
                 ORDER BY coalesce(ca.join_date, ca.start_date) DESC NULLS LAST, ca.id
                 LIMIT 1)) AS vessel_id
        FROM public.work_rest_compliance_checks AS c
        LEFT JOIN public.work_rest_monthly_submissions AS sub ON sub.id = c.submission_id
        WHERE v_serious IS NULL
          AND c.crew_id = ANY (v_users)
          AND NOT c.passes
          AND ((c.check_window IN ('rolling_24h', 'daily') AND c.rest_minutes < 240)
               OR (c.check_window = 'rolling_7d' AND c.rest_minutes < 3000))
          AND c.window_start >= ((v_today - 29)::timestamp AT TIME ZONE 'UTC')
          AND c.window_start < ((v_today + 1)::timestamp AT TIME ZONE 'UTC')
      ) AS k
      WHERE k.vessel_id = ANY (v_hor)
      GROUP BY k.crew_id, k.vessel_id
    ),
    -- Condition and allergy flags, only where the caller may see them (clinical viewer on the vessel, or consent).
    flags AS (
      SELECT pe.pe_profile AS g_profile,
             EXISTS (SELECT 1 FROM public.med_conditions AS mc
                     WHERE mc.person_id = pe.pe_person AND mc.company_id = v_company
                       AND mc.status IN ('active', 'managed') AND mc.affects_fitness) AS g_condition,
             EXISTS (SELECT 1 FROM public.med_allergies AS ma
                     WHERE ma.person_id = pe.pe_person AND ma.company_id = v_company AND ma.is_active) AS g_allergy
      FROM person AS pe
      JOIN crew AS cr ON cr.c_profile = pe.pe_profile
      WHERE cr.c_vessel = ANY (v_clinical) OR coalesce(pe.pe_consent, false)
    ),
    facts AS (
      SELECT cr.c_profile, cr.c_vessel, cr.c_user, cr.c_position, cr.c_department, cr.c_join, cr.c_planned,
             (pe.pe_person IS NOT NULL) AS x_health,
             e.e_state, e.e_expires, e.e_equivalent,
             CASE WHEN pe.pe_person IS NOT NULL THEN coalesce(vc.vc_valid, 0) END AS x_valid,
             CASE WHEN pe.pe_person IS NOT NULL THEN coalesce(vc.vc_expired, 0) END AS x_expired,
             CASE WHEN pe.pe_person IS NOT NULL THEN coalesce(vc.vc_required_expired, 0) END AS x_required_expired,
             CASE WHEN pe.pe_person IS NOT NULL THEN coalesce(vc.vc_missing, cardinality(v_required)) END AS x_missing,
             CASE WHEN pe.pe_person IS NOT NULL THEN coalesce(vc.vc_boosters, 0) END AS x_boosters,
             CASE WHEN pe.pe_person IS NOT NULL THEN coalesce(vc.vc_records, 0) END AS x_records,
             (cr.c_user IS NOT NULL AND cr.c_vessel = ANY (v_hor)) AS x_rest_tracked,
             CASE WHEN cr.c_user IS NOT NULL AND cr.c_vessel = ANY (v_hor)
                  THEN coalesce((SELECT r.r_days FROM rest AS r WHERE r.r_user = cr.c_user AND r.r_vessel = cr.c_vessel), 0) END AS x_rest,
             CASE WHEN cr.c_user IS NOT NULL AND cr.c_vessel = ANY (v_hor)
                  THEN coalesce((SELECT sum(s.s_days) FROM serious AS s WHERE s.s_user = cr.c_user AND s.s_vessel = cr.c_vessel), 0)::integer END AS x_serious,
             CASE WHEN pe.pe_person IS NULL THEN NULL
                  WHEN coalesce(o.o_records, 0) = 0 THEN 'none'
                  WHEN coalesce(o.o_overdue, 0) > 0 THEN 'overdue'
                  ELSE 'ok' END AS x_occ,
             o.o_due AS x_occ_due,
             g.g_condition, g.g_allergy
      FROM crew AS cr
      LEFT JOIN person AS pe ON pe.pe_profile = cr.c_profile
      LEFT JOIN eng1 AS e ON e.e_profile = cr.c_profile
      LEFT JOIN vac_counts AS vc ON vc.vc_profile = cr.c_profile
      LEFT JOIN occ AS o ON o.o_profile = cr.c_profile
      LEFT JOIN flags AS g ON g.g_profile = cr.c_profile
    ),
    judged AS (
      SELECT f.*,
             public.fleet_medical_reasons(f.x_health, f.e_state, f.x_required_expired, f.x_missing,
                                          f.x_expired - f.x_required_expired, f.x_boosters, f.x_records,
                                          f.x_serious, f.x_rest, f.x_occ) AS j_reasons
      FROM facts AS f
    ),
    rated AS (
      SELECT j.*, public.fleet_medical_status_of(j.j_reasons) AS j_status
      FROM judged AS j
    )
    SELECT r.c_profile,
           coalesce(nullif(btrim(coalesce(nullif(btrim(p.preferred_name), ''), p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Crew member')::text,
           r.c_vessel, v.name::text, v.code::text, r.c_position::text, r.c_department::text,
           coalesce(r.c_planned, false), r.c_join, r.x_health,
           r.e_state, CASE WHEN r.e_state = 'unfit' THEN NULL ELSE r.e_expires END,
           CASE WHEN r.e_state IN ('unfit', 'missing') THEN NULL ELSE r.e_equivalent END,
           r.x_valid, r.x_expired, r.x_missing, r.x_boosters,
           r.x_rest_tracked, r.x_rest, r.x_serious,
           r.x_occ, r.x_occ_due,
           r.g_condition, r.g_allergy,
           r.j_status, r.j_reasons
    FROM rated AS r
    JOIN public.profiles AS p ON p.id = r.c_profile
    JOIN public.vessels AS v ON v.id = r.c_vessel
    WHERE p_status IS NULL OR r.j_status = ANY (p_status)
    ORDER BY CASE r.j_status WHEN 'critical' THEN 0 WHEN 'at_risk' THEN 1 WHEN 'incomplete' THEN 2 ELSE 3 END,
             cardinality(r.j_reasons) DESC,
             v.name, 2, r.c_profile;
END;
$$;

-- ---------------------------------------------------------------- grants and comments

REVOKE ALL ON FUNCTION public.fleet_medical_vaccine_key(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_medical_reasons(boolean, text, integer, integer, integer, integer, integer, integer, integer, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_medical_status_of(text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_medical_settings_save(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_crew_medical_status(uuid[], text[], date) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.fleet_medical_vaccine_key(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_medical_reasons(boolean, text, integer, integer, integer, integer, integer, integer, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_medical_status_of(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_medical_settings_save(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_crew_medical_status(uuid[], text[], date) TO authenticated;

COMMENT ON TABLE public.fleet_medical_settings IS 'Per-company rules of the fleet medical status (gap/02 M1, W8; D-X5-08): which fitness assessment types count as an ENG1, which are accepted as equivalent (T-185) and which vaccines every crew member must hold. No row = the defaults (ENG1 only, no equivalents, no required vaccines). The warning windows are expiry_window_rules (medical, vaccination; C5), not here. Read by the company''s fitness and medical viewers; written only by fleet_medical_settings_save().';
COMMENT ON COLUMN public.fleet_medical_settings.eng1_assessment_types IS 'med_fitness_assessments.assessment_type values that are an ENG1 (one or more).';
COMMENT ON COLUMN public.fleet_medical_settings.eng1_equivalent_types IS 'Assessment types accepted as equivalent to an ENG1 (T-185); never also in eng1_assessment_types.';
COMMENT ON COLUMN public.fleet_medical_settings.required_vaccines IS 'Vaccines every crew member must hold, as the company writes them (compared trimmed, spaces collapsed, in lower case; 40 at most).';
COMMENT ON FUNCTION public.fleet_medical_vaccine_key(text) IS 'A vaccine name as the medical status compares it: trimmed, white space collapsed, lower case; NULL when blank. Internal (service role; the medical definers).';
COMMENT ON FUNCTION public.fleet_medical_reasons(boolean, text, integer, integer, integer, integer, integer, integer, integer, text) IS 'The W8 reasons of one crew member, most severe first in a fixed order (critical: eng1_missing, eng1_unfit, eng1_expired, required_vaccine_expired, required_vaccine_missing, serious_rest_breach; at risk: eng1_expiring, booster_due, vaccine_overdue, rest_noncompliance, occ_health_overdue; incomplete: no_health_record, eng1_no_expiry, no_vaccinations, no_occ_health). Mirrored by src/modules/fleet/lib/medicalStatus.ts. Internal (service role).';
COMMENT ON FUNCTION public.fleet_medical_status_of(text[]) IS 'The medical status of a set of W8 reasons: critical, at_risk, incomplete (the most severe level present) or ok. Mirrored by src/modules/fleet/lib/medicalStatus.ts. Internal (service role).';
COMMENT ON FUNCTION public.fleet_medical_settings_save(jsonb) IS 'Saves the caller''s company medical settings (eng1_assessment_types, eng1_equivalent_types, required_vaccines; keys left out keep their value; expected_updated_at refuses a stale write) for medical admins with fleet reach (fleet_ops_can medical_admin; 42501 not_permitted). 22023 invalid_settings, unknown_setting, invalid_assessment_type, eng1_types_required, eng1_types_overlap, invalid_vaccine, too_many_vaccines, stale_settings. Returns the stored row.';
COMMENT ON FUNCTION public.fleet_crew_medical_status(uuid[], text[], date) IS 'The fleet medical status (gap/02 M1, W8; gap/04 C61): one row per current crew member (planned joiners flagged) of the caller''s counted vessels (NULL) or the explicit, reach-checked ids (42501 vessel_out_of_reach) where fleet_ops_can medical_fitness view holds: ENG1 (configured types, equivalents, X1''s medical fitness documents when they exist) with the medical window, vaccinations valid / expired / missing and boosters with the vaccination window, rest non-compliance and serious breaches over 30 days (NULL when not tracked), health checks from screening due dates, condition / allergy flags only for clinical viewers or with consent (else NULL), status critical / at_risk / incomplete / ok and its reasons, most severe first. Dates and states only, never clinical text. p_status filters (22023 invalid_status). Inactive caller, no company or no JWT: no row.';
