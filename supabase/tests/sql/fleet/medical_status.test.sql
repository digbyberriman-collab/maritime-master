-- Fleet medical status (20261124040700_fleet_medical_status.sql; gap/02
-- M1, W8; gap/04 C61; X5 spec §2 X5-08, D-X5-08; platform-prep plan
-- contract 7, X5 spec §0.3 agreement 6). Company A's DRAAK carries one
-- crew member per rule; HYDRA and GAME CHANGER (Hours of Rest off) a few
-- more; company B its own. Viewers: the legacy DPA of A (full access:
-- fitness, clinical, medical admin, fleet reach), DRAAK's Master (fitness
-- view on DRAAK only), HYDRA's crew member (no medical access), a disabled
-- user and B's admin. Proves:
--   - every cell of the reasons table of src/test/fleet/medicalStatus.test.ts
--     (copied between the medical-reasons-table markers below and pinned by
--     that test) through fleet_medical_reasons() and fleet_medical_status_of();
--   - each W8 rule end to end through fleet_crew_medical_status(): ENG1
--     missing, expired, at risk, unfit (unless a later fitness document),
--     without a date; equivalents count as ENG1 only once configured; the
--     required vaccines (company list, a record marked required, exempt
--     ones), boosters and an expired vaccine that is not required; rest
--     non-compliance and serious breaches over 30 days, not tracked without
--     a login or with Hours of Rest off; health checks overdue or none; no
--     Health record; planned joiners; one row per person;
--   - the windows come from expiry_window_rules (medical, vaccination);
--   - condition / allergy flags are NULL for a fitness-only viewer unless
--     the person shares safety flags, set for a clinical viewer; no
--     clinical text ever leaves the function;
--   - crew without medical access and an inactive caller get nothing; a
--     vessel out of reach (or of another company) is 42501
--     vessel_out_of_reach; p_status filters and an unknown status is 22023;
--     most severe first;
--   - the guarded X1 branches with and without their columns: crew
--     documents of a medical fitness type count as ENG1 or an equivalent
--     (crew_document_types.is_medical_fitness), and X1's is_serious decides
--     serious breaches (work_rest_non_conformities), else the legacy rule;
--   - fleet_medical_settings: RLS (fitness and medical viewers of the
--     company), no browser write, fleet_medical_settings_save() for medical
--     admins only, its refusals and the stale guard; the CHECKs; grants.

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ the reasons table (copy of src/test/fleet/medicalStatus.test.ts)

CREATE TEMP TABLE reasons_case (
  name text PRIMARY KEY, has_health boolean, eng1 text, req_expired integer, req_missing integer, vac_overdue integer,
  boosters integer, vac_records integer, serious integer, rest integer, occ text, reasons text, status text
) ON COMMIT DROP;
INSERT INTO reasons_case VALUES
-- medical-reasons-table:start
  ('all clear', true, 'valid', 0, 0, 0, 0, 2, 0, 0, 'ok', '', 'ok'),
  ('eng1 expiring within the window but not 30 days', true, 'expiring', 0, 0, 0, 0, 2, 0, 0, 'ok', '', 'ok'),
  ('rest not tracked', true, 'valid', 0, 0, 0, 0, 2, NULL, NULL, 'ok', '', 'ok'),
  ('eng1 missing', true, 'missing', 0, 0, 0, 0, 2, 0, 0, 'ok', 'eng1_missing', 'critical'),
  ('eng1 unfit', true, 'unfit', 0, 0, 0, 0, 2, 0, 0, 'ok', 'eng1_unfit', 'critical'),
  ('eng1 expired', true, 'expired', 0, 0, 0, 0, 2, 0, 0, 'ok', 'eng1_expired', 'critical'),
  ('required vaccine expired', true, 'valid', 1, 0, 0, 0, 2, 0, 0, 'ok', 'required_vaccine_expired', 'critical'),
  ('required vaccine missing', true, 'valid', 0, 2, 0, 0, 2, 0, 0, 'ok', 'required_vaccine_missing', 'critical'),
  ('serious rest breach', true, 'valid', 0, 0, 0, 0, 2, 1, 1, 'ok', 'serious_rest_breach', 'critical'),
  ('serious breach hides plain non-compliance', true, 'valid', 0, 0, 0, 0, 2, 1, 4, 'ok', 'serious_rest_breach', 'critical'),
  ('eng1 expiring within 30 days', true, 'expiring_soon', 0, 0, 0, 0, 2, 0, 0, 'ok', 'eng1_expiring', 'at_risk'),
  ('booster due', true, 'valid', 0, 0, 0, 1, 2, 0, 0, 'ok', 'booster_due', 'at_risk'),
  ('vaccine not required expired', true, 'valid', 0, 0, 1, 0, 2, 0, 0, 'ok', 'vaccine_overdue', 'at_risk'),
  ('rest non-compliance', true, 'valid', 0, 0, 0, 0, 2, 0, 2, 'ok', 'rest_noncompliance', 'at_risk'),
  ('health check overdue', true, 'valid', 0, 0, 0, 0, 2, 0, 0, 'overdue', 'occ_health_overdue', 'at_risk'),
  ('no health record', false, 'missing', NULL, NULL, NULL, NULL, NULL, 0, 0, NULL, 'eng1_missing|no_health_record', 'critical'),
  ('no health record with an expired eng1 document', false, 'expired', NULL, NULL, NULL, NULL, NULL, 0, 0, NULL, 'eng1_expired|no_health_record', 'critical'),
  ('no health record, rest breach', false, 'valid', NULL, NULL, NULL, NULL, NULL, 0, 1, NULL, 'rest_noncompliance|no_health_record', 'at_risk'),
  ('eng1 without expiry', true, 'no_expiry', 0, 0, 0, 0, 2, 0, 0, 'ok', 'eng1_no_expiry', 'incomplete'),
  ('no vaccination record', true, 'valid', 0, 0, 0, 0, 0, 0, 0, 'ok', 'no_vaccinations', 'incomplete'),
  ('no health check on file', true, 'valid', 0, 0, 0, 0, 2, 0, 0, 'none', 'no_occ_health', 'incomplete'),
  ('no vaccinations and a required one missing', true, 'valid', 0, 1, 0, 0, 0, 0, 0, 'ok', 'required_vaccine_missing|no_vaccinations', 'critical'),
  ('critical beats at risk', true, 'expired', 0, 0, 0, 1, 2, 0, 0, 'overdue', 'eng1_expired|booster_due|occ_health_overdue', 'critical'),
  ('at risk beats incomplete', true, 'expiring_soon', 0, 0, 0, 0, 0, 0, 0, 'none', 'eng1_expiring|no_vaccinations|no_occ_health', 'at_risk'),
  ('every critical reason', true, 'expired', 1, 1, 0, 0, 2, 2, 3, 'ok', 'eng1_expired|required_vaccine_expired|required_vaccine_missing|serious_rest_breach', 'critical'),
  ('every at risk reason', true, 'expiring_soon', 0, 0, 1, 2, 2, 0, 1, 'overdue', 'eng1_expiring|booster_due|vaccine_overdue|rest_noncompliance|occ_health_overdue', 'at_risk'),
  ('every incomplete reason with a record', true, 'no_expiry', 0, 0, 0, 0, 0, 0, 0, 'none', 'eng1_no_expiry|no_vaccinations|no_occ_health', 'incomplete'),
  ('unfit and expired vaccines', true, 'unfit', 1, 0, 1, 0, 2, 0, 0, 'ok', 'eng1_unfit|required_vaccine_expired|vaccine_overdue', 'critical'),
  ('missing eng1 and no health check', true, 'missing', 0, 0, 0, 0, 2, 0, 0, 'none', 'eng1_missing|no_occ_health', 'critical'),
  ('zero counts raise nothing', true, 'valid', 0, 0, 0, 0, 2, 0, 0, 'ok', '', 'ok')
-- medical-reasons-table:end
;

SELECT tests.is((SELECT count(*) FROM reasons_case), 30::bigint, 'reasons table: 30 cases');
SELECT tests.is_empty($q$
  SELECT name FROM reasons_case
  WHERE public.fleet_medical_reasons(has_health, eng1, req_expired, req_missing, vac_overdue, boosters, vac_records, serious, rest, occ)
        IS DISTINCT FROM (CASE WHEN reasons = '' THEN ARRAY[]::text[] ELSE string_to_array(reasons, '|') END)
$q$, 'reasons table: fleet_medical_reasons answers every case in the order of lib/medicalStatus.ts');
SELECT tests.is_empty($q$
  SELECT name FROM reasons_case
  WHERE public.fleet_medical_status_of(CASE WHEN reasons = '' THEN ARRAY[]::text[] ELSE string_to_array(reasons, '|') END) <> status
$q$, 'reasons table: fleet_medical_status_of answers every case');
SELECT tests.is(public.fleet_medical_status_of(NULL), 'ok', 'fleet_medical_status_of: no reasons is ok');
SELECT tests.is(public.fleet_medical_vaccine_key('  Yellow   Fever '), 'yellow fever', 'fleet_medical_vaccine_key: trimmed, spaces collapsed, lower case');
SELECT tests.ok(public.fleet_medical_vaccine_key('   ') IS NULL AND public.fleet_medical_vaccine_key(NULL) IS NULL, 'fleet_medical_vaccine_key: blank is NULL');

-- ------------------------------------------------------------ world

-- The Health person of a profile (a profile trigger keeps one per profile).
CREATE FUNCTION pg_temp.person(p_key text) RETURNS uuid LANGUAGE sql AS $$
  SELECT h.id FROM public.hw_people AS h WHERE h.profile_id = tests.profile_id(p_key)
$$;

INSERT INTO public.med_screening_templates (id, company_id, name, status, category)
VALUES (tests.id('tpl:check'), tests.company_id('A'), 'Annual health check', 'active', 'occupational');

-- A clean record: a valid ENG1, one valid vaccination and a completed health check (each can be left out).
CREATE FUNCTION pg_temp.base(p_key text, p_eng1 boolean DEFAULT true, p_vac boolean DEFAULT true, p_occ boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_eng1 THEN
    INSERT INTO public.med_fitness_assessments (id, company_id, person_id, profile_id, assessment_type, status, issued_on, expires_on, restrictions, notes)
    VALUES (tests.id('fit:' || p_key), tests.company_id('A'), pg_temp.person(p_key), tests.profile_id(p_key), 'eng1', 'fit',
            current_date - 300, current_date + 400, 'secret restriction text', 'secret note text');
  END IF;
  IF p_vac THEN
    INSERT INTO public.med_vaccinations (id, company_id, person_id, vaccine, administered_on, valid_until, notes)
    VALUES (tests.id('vac:' || p_key), tests.company_id('A'), pg_temp.person(p_key), 'Tetanus', current_date - 100, current_date + 1000, 'secret note text');
  END IF;
  IF p_occ THEN
    INSERT INTO public.med_screening_records (id, company_id, template_id, person_id, status, due_on, completed_on, summary, recommendations)
    VALUES (tests.id('scr:' || p_key), tests.company_id('A'), tests.id('tpl:check'), pg_temp.person(p_key), 'reviewed',
            current_date - 40, current_date - 41, 'secret summary text', 'secret recommendation text');
  END IF;
END
$$;

CREATE FUNCTION pg_temp.fit(p_id text, p_key text, p_type text, p_status text, p_issued date, p_expires date) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.med_fitness_assessments (id, company_id, person_id, profile_id, assessment_type, status, issued_on, expires_on)
  VALUES (tests.id(p_id), tests.company_id('A'), pg_temp.person(p_key), tests.profile_id(p_key), p_type, p_status, p_issued, p_expires)
$$;

CREATE FUNCTION pg_temp.vac(p_id text, p_key text, p_vaccine text, p_until date, p_required boolean DEFAULT false, p_exemption text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.med_vaccinations (id, company_id, person_id, vaccine, administered_on, valid_until, is_required, exemption_reason)
  VALUES (tests.id(p_id), tests.company_id('A'), pg_temp.person(p_key), p_vaccine, current_date - 200, p_until, p_required, p_exemption)
$$;

-- DRAAK: one crew member per rule (all with a login, on DRAAK since 30 days ago).
DO $$
DECLARE
  k text;
BEGIN
  FOREACH k IN ARRAY ARRAY['ok', 'missing', 'expired', 'soon', 'equiv', 'unfit', 'unfit_doc', 'noexp', 'vreq', 'vmiss', 'vflag', 'vexempt',
                           'boost', 'voverdue', 'novac', 'occover', 'noocc', 'restnc', 'serious', 'legacy', 'flags', 'flagsok', 'nohealth',
                           'doc', 'doc_eng1', 'two'] LOOP
    PERFORM tests.seed_user('A', 'A.m_' || k, 'crew');
    PERFORM tests.seed_assignment('A.m_' || k, 'A.dra', true, 'Deckhand', '{"department": "Deck"}'::jsonb);
  END LOOP;
END
$$;
-- A planned joiner of DRAAK, someone on DRAAK who is also joining HYDRA, a placement without a login.
SELECT tests.seed_user('A', 'A.m_planned', 'crew');
SELECT tests.seed_assignment('A.m_planned', 'A.dra', true, 'Engineer', jsonb_build_object('join_date', current_date + 10, 'department', 'Engineering'));
SELECT tests.seed_assignment('A.m_two', 'A.hyd', true, 'Deckhand', jsonb_build_object('join_date', current_date + 5));
SELECT tests.seed_profile('A', 'A.m_placed', 'crew', 'active', NULL,
  jsonb_build_object('imported_vessel_id', tests.vessel_id('A.dra'), 'is_imported', true, 'position', 'Stewardess', 'joining_date', current_date - 3));
-- GAME CHANGER (Hours of Rest off) and company B.
SELECT tests.seed_user('A', 'A.m_gam', 'crew');
SELECT tests.seed_assignment('A.m_gam', 'A.gam', true, 'Deckhand');
SELECT tests.seed_user('B', 'B.m_crew', 'crew');
SELECT tests.seed_assignment('B.m_crew', 'B.lev', true, 'Deckhand');
INSERT INTO public.vessel_module_settings (vessel_id, company_id, module_key, enabled)
VALUES (tests.vessel_id('A.gam'), tests.company_id('A'), 'crew_hor', false);

SELECT pg_temp.base(k) FROM unnest(ARRAY['A.m_ok', 'A.m_vmiss', 'A.m_vflag', 'A.m_vexempt', 'A.m_boost', 'A.m_voverdue', 'A.m_restnc', 'A.m_serious',
                                         'A.m_legacy', 'A.m_flags', 'A.m_flagsok', 'A.m_planned', 'A.m_two', 'A.m_placed', 'A.m_gam', 'A.crew_hyd']) AS k;
SELECT pg_temp.base(k, false, true, true) FROM unnest(ARRAY['A.m_missing', 'A.m_expired', 'A.m_soon', 'A.m_equiv', 'A.m_unfit', 'A.m_unfit_doc',
                                                            'A.m_noexp', 'A.m_doc', 'A.m_doc_eng1']) AS k;
SELECT pg_temp.base('A.m_vreq', true, false, true);
SELECT pg_temp.base('A.m_novac', true, false, true);
SELECT pg_temp.base('A.m_occover', true, true, false);
SELECT pg_temp.base('A.m_noocc', true, true, false);
SELECT pg_temp.base('B.m_crew');

-- ENG1 cases.
SELECT pg_temp.fit('f:expired', 'A.m_expired', 'eng1', 'fit', current_date - 700, current_date - 5);
SELECT pg_temp.fit('f:soon', 'A.m_soon', 'eng1', 'fit', current_date - 700, current_date + 25);
SELECT pg_temp.fit('f:equiv', 'A.m_equiv', 'ml5', 'fit', current_date - 100, current_date + 300);
SELECT pg_temp.fit('f:unfit_old', 'A.m_unfit', 'eng1', 'fit', current_date - 300, current_date + 200);
SELECT pg_temp.fit('f:unfit', 'A.m_unfit', 'eng1', 'unfit', current_date - 10, NULL);
SELECT pg_temp.fit('f:unfit_doc', 'A.m_unfit_doc', 'eng1', 'temporarily_unfit', current_date - 10, NULL);
SELECT pg_temp.fit('f:noexp', 'A.m_noexp', 'eng1', 'fit', current_date - 10, NULL);
SELECT pg_temp.fit('f:pending', 'A.m_missing', 'eng1', 'pending', current_date - 1, current_date + 700);
-- Vaccinations.
SELECT pg_temp.vac('v:vreq', 'A.m_vreq', 'Yellow Fever', current_date - 10);
SELECT pg_temp.vac('v:vflag', 'A.m_vflag', 'Hepatitis A', current_date - 1, true);
SELECT pg_temp.vac('v:vexempt', 'A.m_vexempt', 'yellow fever', NULL, false, 'secret exemption text');
SELECT pg_temp.vac('v:boost', 'A.m_boost', 'Typhoid', current_date + 40);
SELECT pg_temp.vac('v:voverdue', 'A.m_voverdue', 'Cholera', current_date - 100);
SELECT pg_temp.vac('v:voverdue_new', 'A.m_voverdue', 'Influenza', current_date - 400);
SELECT pg_temp.vac('v:voverdue_renewed', 'A.m_voverdue', 'influenza ', current_date + 200);
-- Health checks.
INSERT INTO public.med_screening_records (id, company_id, template_id, person_id, status, due_on) VALUES
  (tests.id('scr:occover'), tests.company_id('A'), tests.id('tpl:check'), pg_temp.person('A.m_occover'), 'invited', current_date - 5),
  (tests.id('scr:noocc_cancelled'), tests.company_id('A'), tests.id('tpl:check'), pg_temp.person('A.m_noocc'), 'cancelled', current_date - 5),
  (tests.id('scr:ok_next'), tests.company_id('A'), tests.id('tpl:check'), pg_temp.person('A.m_ok'), 'invited', current_date + 60);
-- Conditions and allergies (names never leave the function).
INSERT INTO public.med_conditions (id, company_id, person_id, condition_name, status, affects_fitness, notes) VALUES
  (tests.id('cond:flags'), tests.company_id('A'), pg_temp.person('A.m_flags'), 'secret condition text', 'managed', true, 'secret note text'),
  (tests.id('cond:flagsok'), tests.company_id('A'), pg_temp.person('A.m_flagsok'), 'secret condition text', 'active', false, NULL);
INSERT INTO public.med_allergies (id, company_id, person_id, allergen, severity, reaction, is_active) VALUES
  (tests.id('alg:flags'), tests.company_id('A'), pg_temp.person('A.m_flags'), 'secret allergen text', 'severe', 'secret reaction text', true),
  (tests.id('alg:flagsok'), tests.company_id('A'), pg_temp.person('A.m_flagsok'), 'secret allergen text', 'mild', NULL, true),
  (tests.id('alg:ok_old'), tests.company_id('A'), pg_temp.person('A.m_ok'), 'secret allergen text', 'mild', NULL, false);
UPDATE public.hw_people SET consent_share_safety_flags = false WHERE profile_id IN (tests.profile_id('A.m_flags'));
UPDATE public.hw_people SET consent_share_safety_flags = true WHERE profile_id IN (tests.profile_id('A.m_flagsok'));
-- No Health record.
DELETE FROM public.hw_people WHERE profile_id = tests.profile_id('A.m_nohealth');

-- Hours of rest (no submission: the vessel comes from the assignment covering the day).
INSERT INTO public.work_rest_compliance_checks (id, crew_id, submission_id, check_window, window_start, window_end, rest_minutes, work_minutes, passes, threshold_minutes)
SELECT tests.id('chk:' || x.k), tests.user_id(x.crew), NULL, x.win,
       ((current_date - x.d)::timestamp AT TIME ZONE 'UTC') + interval '6 hours',
       ((current_date - x.d)::timestamp AT TIME ZONE 'UTC') + interval '30 hours',
       x.rest, 1440 - least(x.rest, 1440), x.passes, x.thr
FROM (VALUES
  ('restnc', 'A.m_restnc', 'rolling_24h', 3, 500, false, 600),     -- non-compliance, not serious
  ('restnc_old', 'A.m_restnc', 'rolling_24h', 40, 100, false, 600), -- outside the 30 days
  ('serious', 'A.m_serious', 'rolling_24h', 2, 200, false, 600),   -- < 4 h in 24 h
  ('legacy', 'A.m_legacy', 'rolling_7d', 4, 2900, false, 4200),    -- < 50 h in 7 days (legacy rule only)
  ('ok_pass', 'A.m_ok', 'rolling_24h', 1, 800, true, 600),         -- rested
  ('ok_dismissed', 'A.m_ok', 'rolling_24h', 5, 500, false, 600),   -- a failing check whose breach X1's review dismissed (D-380)
  ('gam', 'A.m_gam', 'rolling_24h', 2, 200, false, 600)            -- Hours of Rest off on GAME CHANGER
) AS x(k, crew, win, d, rest, passes, thr);

-- ------------------------------------------------------------ X1's columns (contract 7, agreement 6)

-- Record whether this build has them, then make sure both exist: a stub
-- catalogue and the columns when X1's files are not in the build (the
-- harness's --file mode); X1's own tables otherwise. All inside this
-- test's rolled-back transaction.
CREATE TEMP TABLE build_x1 ON COMMIT DROP AS
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'crew_document_types' AND column_name = 'is_medical_fitness') AS docs,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'work_rest_non_conformities' AND column_name = 'is_serious') AS serious;
SELECT tests.ok(true, format('build: X1 crew document catalogue %s, X1 serious flag %s (stubs added when absent)',
                             CASE WHEN docs THEN 'present' ELSE 'absent' END, CASE WHEN serious THEN 'present' ELSE 'absent' END))
FROM build_x1;

DO $$
BEGIN
  IF to_regclass('public.crew_document_types') IS NULL THEN
    CREATE TABLE public.crew_document_types (id uuid PRIMARY KEY, code text, name text, is_medical_fitness boolean NOT NULL DEFAULT false);
    INSERT INTO public.crew_document_types (id, code, name, is_medical_fitness) VALUES
      (md5('storm.crew_document_type.eng1')::uuid, 'ENG1', 'ENG1 seafarer medical certificate', true),
      (md5('storm.crew_document_type.seafarer_medical')::uuid, 'SEA-MED', 'Seafarer medical certificate', true);
  END IF;
  ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS profile_id uuid, ADD COLUMN IF NOT EXISTS company_id uuid,
    ADD COLUMN IF NOT EXISTS document_type_id uuid, ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
  ALTER TABLE public.work_rest_non_conformities ADD COLUMN IF NOT EXISTS vessel_id uuid, ADD COLUMN IF NOT EXISTS breach_day date,
    ADD COLUMN IF NOT EXISTS is_serious boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
    ADD COLUMN IF NOT EXISTS review_outcome text;
END
$$;

SELECT tests.ok((SELECT count(*) FROM public.crew_document_types
                 WHERE id IN (md5('storm.crew_document_type.eng1')::uuid, md5('storm.crew_document_type.seafarer_medical')::uuid) AND is_medical_fitness) = 2,
                'setup: the ENG1 and seafarer medical document types are medical fitness types');

-- Medical fitness documents: an equivalent, an ENG1, one issued after an unfit assessment, a removed one.
INSERT INTO public.crew_certificates (id, user_id, profile_id, company_id, document_type_id, certificate_type, certificate_name, issue_date, expiry_date, status, deleted_at) VALUES
  (tests.id('cc:doc'), tests.user_id('A.m_doc'), tests.profile_id('A.m_doc'), tests.company_id('A'), md5('storm.crew_document_type.seafarer_medical')::uuid,
   'Medical', 'Seafarer medical certificate', current_date - 30, current_date + 300, 'Valid', NULL),
  (tests.id('cc:doc_eng1'), tests.user_id('A.m_doc_eng1'), tests.profile_id('A.m_doc_eng1'), tests.company_id('A'), md5('storm.crew_document_type.eng1')::uuid,
   'Medical', 'ENG1', current_date - 30, current_date + 300, 'Valid', NULL),
  (tests.id('cc:unfit_doc'), tests.user_id('A.m_unfit_doc'), tests.profile_id('A.m_unfit_doc'), tests.company_id('A'), md5('storm.crew_document_type.seafarer_medical')::uuid,
   'Medical', 'Seafarer medical certificate', current_date - 2, current_date + 700, 'Valid', NULL),
  (tests.id('cc:missing_removed'), tests.user_id('A.m_missing'), tests.profile_id('A.m_missing'), tests.company_id('A'), md5('storm.crew_document_type.eng1')::uuid,
   'Medical', 'ENG1', current_date - 30, current_date + 300, 'Valid', now());

-- X1's serious flag: the < 4 h day of A.m_serious is a live serious breach; the 7-day one of A.m_legacy is not flagged.
INSERT INTO public.work_rest_non_conformities (id, crew_id, rule_code, rule_description, severity, window_start, window_end, measured_value, threshold_value, status,
                                               vessel_id, breach_day, is_serious, superseded_at, review_outcome) VALUES
  (tests.id('nc:serious'), tests.user_id('A.m_serious'), 'REST_24H_MIN', 'Rest below the minimum in 24 hours', 'critical',
   ((current_date - 2)::timestamp AT TIME ZONE 'UTC'), ((current_date - 1)::timestamp AT TIME ZONE 'UTC'), 3.3, 10, 'open',
   tests.vessel_id('A.dra'), current_date - 2, true, NULL, NULL),
  (tests.id('nc:serious_old'), tests.user_id('A.m_restnc'), 'REST_24H_MIN', 'Rest below the minimum in 24 hours', 'critical',
   ((current_date - 3)::timestamp AT TIME ZONE 'UTC'), ((current_date - 2)::timestamp AT TIME ZONE 'UTC'), 3.0, 10, 'open',
   tests.vessel_id('A.dra'), current_date - 3, true, now(), NULL),
  (tests.id('nc:legacy'), tests.user_id('A.m_legacy'), 'REST_7D_MIN', 'Rest below the minimum in 7 days', 'high',
   ((current_date - 10)::timestamp AT TIME ZONE 'UTC'), ((current_date - 3)::timestamp AT TIME ZONE 'UTC'), 48.3, 77, 'open',
   tests.vessel_id('A.dra'), current_date - 4, false, NULL, NULL),
  -- D-380: breach days come from X1's breach review. A.m_restnc: the live
  -- (not serious) breach of its failing-check day, a periods-only breach
  -- with no failing check, and a 40-day-old one outside the window.
  (tests.id('nc:restnc'), tests.user_id('A.m_restnc'), 'REST_24H_MIN', 'Rest below the minimum in 24 hours', 'high',
   ((current_date - 3)::timestamp AT TIME ZONE 'UTC'), ((current_date - 2)::timestamp AT TIME ZONE 'UTC'), 8.3, 10, 'open',
   tests.vessel_id('A.dra'), current_date - 3, false, NULL, NULL),
  (tests.id('nc:restnc_periods'), tests.user_id('A.m_restnc'), 'REST_PERIODS_MAX', 'Rest in more than two periods', 'medium',
   ((current_date - 7)::timestamp AT TIME ZONE 'UTC'), ((current_date - 6)::timestamp AT TIME ZONE 'UTC'), 3, 2, 'open',
   tests.vessel_id('A.dra'), current_date - 7, false, NULL, NULL),
  (tests.id('nc:restnc_old'), tests.user_id('A.m_restnc'), 'REST_24H_MIN', 'Rest below the minimum in 24 hours', 'high',
   ((current_date - 40)::timestamp AT TIME ZONE 'UTC'), ((current_date - 39)::timestamp AT TIME ZONE 'UTC'), 1.7, 10, 'open',
   tests.vessel_id('A.dra'), current_date - 40, false, NULL, NULL),
  -- A.m_ok: the failing check's breach was dismissed in X1's review.
  (tests.id('nc:ok_dismissed'), tests.user_id('A.m_ok'), 'REST_24H_MIN', 'Rest below the minimum in 24 hours', 'high',
   ((current_date - 5)::timestamp AT TIME ZONE 'UTC'), ((current_date - 4)::timestamp AT TIME ZONE 'UTC'), 8.3, 10, 'dismissed',
   tests.vessel_id('A.dra'), current_date - 5, false, NULL, 'dismissed');

-- ------------------------------------------------------------ snapshots

-- Each read is stored per viewer and label, then checked as the superuser.
CREATE TEMP TABLE snap (label text NOT NULL, ord bigint NOT NULL, r jsonb NOT NULL) ON COMMIT DROP;
GRANT ALL ON snap TO PUBLIC;
CREATE FUNCTION pg_temp.row_of(p_label text, p_key text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT s.r FROM snap AS s WHERE s.label = p_label AND s.r ->> 'profile_id' = tests.profile_id(p_key)::text
$$;
CREATE FUNCTION pg_temp.reasons_of(p_label text, p_key text) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(x, '|' ORDER BY n) FROM jsonb_array_elements_text(pg_temp.row_of(p_label, p_key) -> 'reasons') WITH ORDINALITY AS t(x, n)
$$;

-- Read as a user (the role switch lasts until reset_role, inside this function's caller transaction).
CREATE FUNCTION pg_temp.take(p_label text, p_user text, p_vessels uuid[] DEFAULT NULL, p_status text[] DEFAULT NULL) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  v_n bigint;
BEGIN
  PERFORM tests.as_user(tests.user_id(p_user));
  INSERT INTO snap SELECT p_label, r.ordinality, to_jsonb(r) - 'ordinality'
  FROM public.fleet_crew_medical_status(p_vessels, p_status) WITH ORDINALITY AS r;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM tests.reset_role();
  RETURN v_n;
END
$$;

SELECT pg_temp.take('defaults', 'A.fleet_manager');

-- ------------------------------------------------------------ W8 rules with the defaults (no settings row, default windows, X1's columns present)

-- (person, status, reasons) as the fleet manager reads them.
CREATE TEMP TABLE want (k text PRIMARY KEY, status text NOT NULL, reasons text NOT NULL) ON COMMIT DROP;
INSERT INTO want VALUES
  ('A.m_ok', 'ok', ''),
  ('A.m_missing', 'critical', 'eng1_missing'),
  ('A.m_expired', 'critical', 'eng1_expired'),
  ('A.m_soon', 'at_risk', 'eng1_expiring'),
  ('A.m_equiv', 'critical', 'eng1_missing'),
  ('A.m_unfit', 'critical', 'eng1_unfit'),
  ('A.m_unfit_doc', 'ok', ''),
  ('A.m_noexp', 'incomplete', 'eng1_no_expiry'),
  ('A.m_vreq', 'at_risk', 'vaccine_overdue'),
  ('A.m_vmiss', 'ok', ''),
  ('A.m_vflag', 'critical', 'required_vaccine_expired'),
  ('A.m_vexempt', 'ok', ''),
  ('A.m_boost', 'at_risk', 'booster_due'),
  ('A.m_voverdue', 'at_risk', 'vaccine_overdue'),
  ('A.m_novac', 'incomplete', 'no_vaccinations'),
  ('A.m_occover', 'at_risk', 'occ_health_overdue'),
  ('A.m_noocc', 'incomplete', 'no_occ_health'),
  ('A.m_restnc', 'at_risk', 'rest_noncompliance'),
  ('A.m_serious', 'critical', 'serious_rest_breach'),
  ('A.m_legacy', 'at_risk', 'rest_noncompliance'),
  ('A.m_flags', 'ok', ''),
  ('A.m_flagsok', 'ok', ''),
  ('A.m_nohealth', 'critical', 'eng1_missing|no_health_record'),
  ('A.m_doc', 'ok', ''),
  ('A.m_doc_eng1', 'ok', ''),
  ('A.m_two', 'ok', ''),
  ('A.m_planned', 'ok', ''),
  ('A.m_placed', 'ok', ''),
  ('A.m_gam', 'ok', ''),
  ('A.crew_hyd', 'ok', ''),
  ('A.master_dra', 'critical', 'eng1_missing|no_vaccinations|no_occ_health');

SELECT tests.is(pg_temp.row_of('defaults', w.k) ->> 'status', w.status, format('defaults: %s is %s', w.k, w.status)) FROM want AS w ORDER BY w.k;
SELECT tests.is(coalesce(pg_temp.reasons_of('defaults', w.k), ''), w.reasons, format('defaults: %s has the reasons [%s]', w.k, w.reasons)) FROM want AS w ORDER BY w.k;
SELECT tests.is((SELECT count(*) FROM snap WHERE label = 'defaults'), (SELECT count(*) FROM want), 'defaults: one row per current crew member of A''s counted vessels, nobody else');
SELECT tests.is((SELECT count(DISTINCT r ->> 'profile_id') FROM snap WHERE label = 'defaults'), (SELECT count(*) FROM snap WHERE label = 'defaults'), 'defaults: nobody is listed twice');
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_two') ->> 'vessel_id', tests.vessel_id('A.dra')::text, 'one vessel per person: on DRAAK before the vessel they are joining');
SELECT tests.ok(NOT (pg_temp.row_of('defaults', 'A.m_two') ->> 'is_planned')::boolean, 'one vessel per person: listed as on board');
SELECT tests.ok(pg_temp.row_of('defaults', 'B.m_crew') IS NULL, 'company B''s crew are never listed for A');

-- ENG1 details.
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_ok') ->> 'eng1_state', 'valid', 'ENG1: a fit ENG1 a year out is valid');
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_ok') ->> 'eng1_expires_on', (current_date + 400)::text, 'ENG1: its expiry date');
SELECT tests.ok(NOT (pg_temp.row_of('defaults', 'A.m_ok') ->> 'eng1_is_equivalent')::boolean, 'ENG1: an ENG1 assessment is not an equivalent');
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_soon') ->> 'eng1_state', 'expiring_soon', 'ENG1: 25 days out is ≤ 30 d with the default medical window');
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_expired') ->> 'eng1_state', 'expired', 'ENG1: past its date is expired');
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_missing') ->> 'eng1_state', 'missing', 'ENG1: a pending assessment and a removed document are not on file');
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_equiv') ->> 'eng1_state', 'missing', 'ENG1: an ML5 does not count until the company accepts it');
SELECT tests.ok(pg_temp.row_of('defaults', 'A.m_unfit') ->> 'eng1_expires_on' IS NULL AND pg_temp.row_of('defaults', 'A.m_unfit') ->> 'eng1_is_equivalent' IS NULL,
                'ENG1: assessed unfit shows no date of the older certificate');
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_noexp') ->> 'eng1_state', 'no_expiry', 'ENG1: on file without an expiry date');
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_doc') ->> 'eng1_state', 'valid', 'X1 branch present: a seafarer medical document counts');
SELECT tests.ok((pg_temp.row_of('defaults', 'A.m_doc') ->> 'eng1_is_equivalent')::boolean, 'X1 branch present: a seafarer medical document is an accepted equivalent');
SELECT tests.ok(NOT (pg_temp.row_of('defaults', 'A.m_doc_eng1') ->> 'eng1_is_equivalent')::boolean, 'X1 branch present: an ENG1 document is an ENG1');
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_unfit_doc') ->> 'eng1_expires_on', (current_date + 700)::text,
                'X1 branch present: a fitness document issued after an unfit assessment is the ENG1 on file');

-- Vaccinations.
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_voverdue') -> 'vaccines_valid', '2'::jsonb, 'vaccines: the renewed influenza (same name, other spacing) and tetanus are valid');
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_voverdue') -> 'vaccines_expired', '1'::jsonb, 'vaccines: cholera has expired');
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_vexempt') -> 'vaccines_valid', '2'::jsonb, 'vaccines: an exemption counts as valid');
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_boost') -> 'boosters_due', '1'::jsonb, 'vaccines: a vaccine 40 days out is inside the default vaccination window');
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_vmiss') -> 'vaccines_missing', '0'::jsonb, 'vaccines: nothing is missing while the company requires none');
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_novac') -> 'vaccines_valid', '0'::jsonb, 'vaccines: none recorded');

-- Rest.
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_restnc') -> 'rest_noncompliant_30d', '2'::jsonb,
                'rest: two breach days in 30 days from X1''s breach review: the failing-check day and a periods-only day (no failing check); the 40-day-old one is out (D-380)');
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_ok') -> 'rest_noncompliant_30d', '0'::jsonb,
                'rest: a breach X1''s review dismissed counts 0, though its failing check is still there (D-380)');
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_restnc') -> 'serious_rest_breach_30d', '0'::jsonb, 'rest: a superseded serious breach does not count');
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_serious') -> 'serious_rest_breach_30d', '1'::jsonb, 'X1 branch present: X1''s serious flag decides');
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_legacy') -> 'serious_rest_breach_30d', '0'::jsonb, 'X1 branch present: a 7-day breach X1 does not flag is not serious');
SELECT tests.ok((pg_temp.row_of('defaults', 'A.m_ok') ->> 'rest_tracked')::boolean AND pg_temp.row_of('defaults', 'A.m_ok') -> 'rest_noncompliant_30d' = '0'::jsonb,
                'rest: tracked and clean for a rested crew member');
SELECT tests.ok(NOT (pg_temp.row_of('defaults', 'A.m_placed') ->> 'rest_tracked')::boolean AND pg_temp.row_of('defaults', 'A.m_placed') -> 'rest_noncompliant_30d' = 'null'::jsonb,
                'rest: not tracked for a placement without a login');
SELECT tests.ok(NOT (pg_temp.row_of('defaults', 'A.m_gam') ->> 'rest_tracked')::boolean AND pg_temp.row_of('defaults', 'A.m_gam') -> 'serious_rest_breach_30d' = 'null'::jsonb,
                'rest: not tracked where Hours of Rest is off (its breach is not counted)');

-- Health checks, the Health record, planned joiners, placements.
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_occover') ->> 'occ_health_due_on', (current_date - 5)::text, 'health checks: the overdue due date');
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_ok') ->> 'occ_health_state', 'ok', 'health checks: a completed check and one due later are ok');
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_ok') ->> 'occ_health_due_on', (current_date + 60)::text, 'health checks: the next due date');
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_noocc') ->> 'occ_health_state', 'none', 'health checks: a cancelled one is none on file');
SELECT tests.ok(NOT (pg_temp.row_of('defaults', 'A.m_nohealth') ->> 'has_health_record')::boolean
                AND pg_temp.row_of('defaults', 'A.m_nohealth') -> 'vaccines_valid' = 'null'::jsonb
                AND pg_temp.row_of('defaults', 'A.m_nohealth') -> 'occ_health_state' = 'null'::jsonb
                AND pg_temp.row_of('defaults', 'A.m_nohealth') -> 'condition_flag' = 'null'::jsonb,
                'no Health record: nothing health-side is guessed');
-- No ENG1 and no Health subject record (the hw_people row deleted): the
-- missing ENG1 is critical all the same (gap/02 W8, D-385), so the person
-- is listed under the Critical filter, most severe first.
SELECT tests.ok(pg_temp.row_of('defaults', 'A.m_nohealth') ->> 'eng1_state' = 'missing'
                AND pg_temp.row_of('defaults', 'A.m_nohealth') ->> 'status' = 'critical',
                'no Health record: a missing ENG1 is critical');
SELECT pg_temp.take('critical_only', 'A.fleet_manager', NULL, ARRAY['critical']);
SELECT tests.ok(pg_temp.row_of('critical_only', 'A.m_nohealth') IS NOT NULL
                AND pg_temp.reasons_of('critical_only', 'A.m_nohealth') = 'eng1_missing|no_health_record',
                'no Health record: the person appears under p_status => critical');
SELECT tests.is((SELECT count(*) FROM snap WHERE label = 'critical_only' AND r ->> 'status' <> 'critical'), 0::bigint,
                'the Critical filter returns critical rows only');
SELECT tests.ok((pg_temp.row_of('defaults', 'A.m_planned') ->> 'is_planned')::boolean
                AND pg_temp.row_of('defaults', 'A.m_planned') ->> 'join_date' = (current_date + 10)::text
                AND pg_temp.row_of('defaults', 'A.m_planned') ->> 'department' = 'Engineering',
                'planned joiner: flagged with the join date');
SELECT tests.ok(pg_temp.row_of('defaults', 'A.m_placed') ->> 'position' = 'Stewardess' AND pg_temp.row_of('defaults', 'A.m_placed') ->> 'vessel_code' IS NOT DISTINCT FROM (SELECT code FROM public.vessels WHERE id = tests.vessel_id('A.dra')),
                'placement without a login: listed with its position on its vessel');
SELECT tests.is(pg_temp.row_of('defaults', 'A.m_ok') ->> 'person_name', 'Crew A.m_ok', 'the name comes from the profile');

-- Flags for a clinical viewer.
SELECT tests.ok((pg_temp.row_of('defaults', 'A.m_flags') ->> 'condition_flag')::boolean AND (pg_temp.row_of('defaults', 'A.m_flags') ->> 'allergy_flag')::boolean,
                'flags: a clinical viewer sees the condition affecting fitness and the allergy, consent or not');
SELECT tests.ok(NOT (pg_temp.row_of('defaults', 'A.m_flagsok') ->> 'condition_flag')::boolean AND (pg_temp.row_of('defaults', 'A.m_flagsok') ->> 'allergy_flag')::boolean,
                'flags: a condition that does not affect fitness raises no flag');
SELECT tests.ok(NOT (pg_temp.row_of('defaults', 'A.m_ok') ->> 'allergy_flag')::boolean, 'flags: an inactive allergy raises no flag');

-- Never clinical text, most severe first.
SELECT tests.is_empty($q$SELECT label FROM snap WHERE r::text ILIKE '%secret%'$q$, 'no restriction, note, condition, allergen, reaction, exemption or screening text leaves the function');
SELECT tests.is_empty($q$
  WITH s AS (
    SELECT ord, CASE r ->> 'status' WHEN 'critical' THEN 0 WHEN 'at_risk' THEN 1 WHEN 'incomplete' THEN 2 ELSE 3 END AS rank,
           jsonb_array_length(r -> 'reasons') AS n
    FROM snap WHERE label = 'defaults'
  )
  SELECT a.ord FROM s AS a JOIN s AS b ON b.ord = a.ord + 1
  WHERE b.rank < a.rank OR (b.rank = a.rank AND b.n > a.n)
$q$, 'order: most severe first, then the most reasons');
SELECT tests.is_empty($q$SELECT label FROM snap WHERE label = 'defaults' AND r ->> 'status' <> public.fleet_medical_status_of(ARRAY(SELECT jsonb_array_elements_text(r -> 'reasons')))$q$,
                      'every row''s status is the status of its reasons');

-- ------------------------------------------------------------ a fitness-only viewer: DRAAK's Master

SELECT tests.ok(pg_temp.take('master', 'A.master_dra') > 0, 'the Master reads DRAAK''s crew');
SELECT tests.is_empty($q$SELECT r FROM snap WHERE label = 'master' AND r ->> 'vessel_id' <> tests.vessel_id('A.dra')::text$q$,
                      'the Master reads DRAAK only (fitness view on the vessels they reach)');
SELECT tests.is((SELECT count(*) FROM snap WHERE label = 'master'), (SELECT count(*) FROM snap WHERE label = 'defaults' AND r ->> 'vessel_id' = tests.vessel_id('A.dra')::text),
                'the Master reads every DRAAK crew member');
SELECT tests.ok(pg_temp.row_of('master', 'A.m_flags') -> 'condition_flag' = 'null'::jsonb AND pg_temp.row_of('master', 'A.m_flags') -> 'allergy_flag' = 'null'::jsonb,
                'flags: NULL for a fitness-only viewer when the person does not share safety flags');
SELECT tests.ok((pg_temp.row_of('master', 'A.m_flagsok') ->> 'allergy_flag')::boolean AND NOT (pg_temp.row_of('master', 'A.m_flagsok') ->> 'condition_flag')::boolean,
                'flags: shared with a fitness-only viewer when the person consents');
SELECT tests.is(pg_temp.row_of('master', 'A.m_serious') ->> 'status', 'critical', 'the Master sees the same status');

-- ------------------------------------------------------------ who gets nothing, and vessels out of reach

SELECT tests.is(pg_temp.take('crew', 'A.crew_hyd'), 0::bigint, 'crew without medical access get nothing');
SELECT tests.is(pg_temp.take('crew_hyd_explicit', 'A.crew_hyd', ARRAY[tests.vessel_id('A.hyd')]), 0::bigint, 'crew without medical access get nothing for their own vessel either');
SELECT tests.is(pg_temp.take('disabled', 'A.disabled'), 0::bigint, 'an inactive caller gets nothing');
SELECT tests.is(pg_temp.take('b_admin', 'B.admin'), 1::bigint, 'B''s admin reads B''s crew only');
SELECT tests.is((SELECT r ->> 'profile_id' FROM snap WHERE label = 'b_admin'), tests.profile_id('B.m_crew')::text, 'B''s admin reads B''s crew member');

SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(format('SELECT * FROM public.fleet_crew_medical_status(ARRAY[%L]::uuid[])', tests.vessel_id('A.hyd')), '42501', 'vessel_out_of_reach',
                         'a vessel the caller does not reach: 42501 vessel_out_of_reach');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(format('SELECT * FROM public.fleet_crew_medical_status(ARRAY[%L]::uuid[])', tests.vessel_id('A.dra')), '42501', 'vessel_out_of_reach',
                         'another company''s vessel: 42501 vessel_out_of_reach');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format('SELECT * FROM public.fleet_crew_medical_status(ARRAY[%L]::uuid[])', tests.vessel_id('B.lev')), '42501', 'vessel_out_of_reach',
                         'the fleet manager names B''s vessel: 42501 vessel_out_of_reach');
SELECT tests.throws_like($q$SELECT * FROM public.fleet_crew_medical_status(NULL, ARRAY['urgent'])$q$, '22023', 'invalid_status', 'an unknown status filter: 22023 invalid_status');
SELECT tests.reset_role();
SELECT tests.as_anon();
SELECT tests.throws($q$SELECT * FROM public.fleet_crew_medical_status()$q$, '42501', 'anon cannot call fleet_crew_medical_status');
SELECT tests.reset_role();

SELECT pg_temp.take('critical', 'A.fleet_manager', NULL, ARRAY['critical']);
SELECT tests.is((SELECT count(*) FROM snap WHERE label = 'critical'), (SELECT count(*) FROM snap WHERE label = 'defaults' AND r ->> 'status' = 'critical'),
                'p_status: the critical ones, all of them');
SELECT tests.is_empty($q$SELECT r FROM snap WHERE label = 'critical' AND r ->> 'status' <> 'critical'$q$, 'p_status: nothing else');
SELECT pg_temp.take('dra_only', 'A.fleet_manager', ARRAY[tests.vessel_id('A.dra')]);
SELECT tests.is((SELECT count(*) FROM snap WHERE label = 'dra_only'), (SELECT count(*) FROM snap WHERE label = 'defaults' AND r ->> 'vessel_id' = tests.vessel_id('A.dra')::text),
                'explicit vessel ids: that vessel''s crew only');

-- ------------------------------------------------------------ settings: RLS, the definer, its refusals

SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is((SELECT count(*) FROM public.fleet_medical_settings), 0::bigint, 'settings: no row yet (the defaults apply)');
SELECT tests.throws_like($q$SELECT public.fleet_medical_settings_save('{"required_vaccines": ["Yellow fever"]}'::jsonb)$q$, '42501', 'not_permitted',
                         'settings: a fitness viewer who is not a medical admin cannot save');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.throws_like($q$SELECT public.fleet_medical_settings_save('{}'::jsonb)$q$, '42501', 'not_permitted', 'settings: crew cannot save');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws_like($q$SELECT public.fleet_medical_settings_save('{}'::jsonb)$q$, '42501', 'not_permitted', 'settings: an inactive caller cannot save');
SELECT tests.reset_role();

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like($q$SELECT public.fleet_medical_settings_save('[]'::jsonb)$q$, '22023', 'invalid_settings', 'save: not an object');
SELECT tests.throws_like($q$SELECT public.fleet_medical_settings_save('{"warn_days": 30}'::jsonb)$q$, '22023', 'unknown_setting', 'save: an unknown key');
SELECT tests.throws_like($q$SELECT public.fleet_medical_settings_save('{"eng1_assessment_types": "eng1"}'::jsonb)$q$, '22023', 'invalid_settings', 'save: types must be a list');
SELECT tests.throws_like($q$SELECT public.fleet_medical_settings_save('{"eng1_assessment_types": ["eng2"]}'::jsonb)$q$, '22023', 'invalid_assessment_type', 'save: an unknown assessment type');
SELECT tests.throws_like($q$SELECT public.fleet_medical_settings_save('{"eng1_assessment_types": []}'::jsonb)$q$, '22023', 'eng1_types_required', 'save: at least one ENG1 type');
SELECT tests.throws_like($q$SELECT public.fleet_medical_settings_save('{"eng1_equivalent_types": ["eng1"]}'::jsonb)$q$, '22023', 'eng1_types_overlap', 'save: a type cannot be ENG1 and an equivalent');
SELECT tests.throws_like($q$SELECT public.fleet_medical_settings_save('{"required_vaccines": ["  "]}'::jsonb)$q$, '22023', 'invalid_vaccine', 'save: a blank vaccine');
SELECT tests.throws_like(format('SELECT public.fleet_medical_settings_save(%L::jsonb)', jsonb_build_object('required_vaccines', jsonb_build_array(repeat('x', 81)))),
                         '22023', 'invalid_vaccine', 'save: a vaccine name over 80 characters');
SELECT tests.throws_like(format('SELECT public.fleet_medical_settings_save(%L::jsonb)', jsonb_build_object('required_vaccines', (SELECT jsonb_agg('Vaccine ' || g) FROM generate_series(1, 41) AS g))),
                         '22023', 'too_many_vaccines', 'save: more than 40 vaccines');
SELECT tests.throws_like($q$SELECT public.fleet_medical_settings_save('{"expected_updated_at": "2000-01-01T00:00:00Z"}'::jsonb)$q$, '22023', 'stale_settings',
                         'save: a stale expected_updated_at when there is no row yet');
SELECT tests.is((public.fleet_medical_settings_save('{"eng1_equivalent_types": ["ml5"], "required_vaccines": ["Yellow  fever", "yellow FEVER"], "expected_updated_at": null}'::jsonb)).required_vaccines,
                ARRAY['Yellow fever']::text[], 'save: the vaccines trimmed, spaces collapsed, the same name once');
SELECT tests.reset_role();

SELECT tests.is((SELECT eng1_assessment_types FROM public.fleet_medical_settings WHERE company_id = tests.company_id('A')), ARRAY['eng1']::text[], 'save: a key left out keeps its value (ENG1)');
SELECT tests.is((SELECT eng1_equivalent_types FROM public.fleet_medical_settings WHERE company_id = tests.company_id('A')), ARRAY['ml5']::text[], 'save: ML5 accepted as equivalent');
SELECT tests.is((SELECT updated_by FROM public.fleet_medical_settings WHERE company_id = tests.company_id('A')), tests.user_id('A.fleet_manager'), 'save: stamped with the caller');

SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is((SELECT count(*) FROM public.fleet_medical_settings), 1::bigint, 'RLS: a fitness viewer of the company reads the settings');
SELECT tests.denied($q$UPDATE public.fleet_medical_settings SET required_vaccines = '{}'$q$, 'RLS: a fitness viewer cannot write them directly');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is((SELECT count(*) FROM public.fleet_medical_settings), 0::bigint, 'RLS: crew without medical access read nothing');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is((SELECT count(*) FROM public.fleet_medical_settings), 0::bigint, 'RLS: an inactive caller reads nothing');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is((SELECT count(*) FROM public.fleet_medical_settings), 0::bigint, 'RLS: another company reads nothing');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.denied(format($q$INSERT INTO public.fleet_medical_settings (company_id) VALUES (%L)$q$, tests.company_id('B')), 'no browser insert, even for a medical admin');
SELECT tests.denied($q$DELETE FROM public.fleet_medical_settings$q$, 'no browser delete');
SELECT tests.throws_like($q$SELECT public.fleet_medical_settings_save('{"expected_updated_at": null}'::jsonb)$q$, '22023', 'stale_settings',
                         'save: expected_updated_at null while a row exists is stale');
SELECT tests.lives(format('SELECT public.fleet_medical_settings_save(%L::jsonb)',
                          jsonb_build_object('expected_updated_at', (SELECT updated_at FROM public.fleet_medical_settings WHERE company_id = tests.company_id('A'))::text)),
                   'save: the updated_at the caller read is accepted');
SELECT tests.reset_role();

SELECT tests.throws($q$UPDATE public.fleet_medical_settings SET eng1_equivalent_types = '{eng1}' WHERE company_id = $q$ || quote_literal(tests.company_id('A')), '23514',
                    'CHECK: a type cannot be ENG1 and an equivalent (even for the owner)');
SELECT tests.throws($q$UPDATE public.fleet_medical_settings SET eng1_assessment_types = '{}' WHERE company_id = $q$ || quote_literal(tests.company_id('A')), '23514',
                    'CHECK: at least one ENG1 type');
SELECT tests.throws($q$UPDATE public.fleet_medical_settings SET eng1_assessment_types = '{eng2}' WHERE company_id = $q$ || quote_literal(tests.company_id('A')), '23514',
                    'CHECK: known assessment types only');

-- ------------------------------------------------------------ the settings applied

SELECT pg_temp.take('settings', 'A.fleet_manager');
SELECT tests.is(pg_temp.row_of('settings', 'A.m_equiv') ->> 'eng1_state', 'valid', 'equivalents: an accepted ML5 counts as ENG1');
SELECT tests.ok((pg_temp.row_of('settings', 'A.m_equiv') ->> 'eng1_is_equivalent')::boolean, 'equivalents: and says it is an equivalent');
SELECT tests.is(pg_temp.reasons_of('settings', 'A.m_vreq'), 'required_vaccine_expired', 'required list: an expired yellow fever is a required vaccine expired');
SELECT tests.is(pg_temp.reasons_of('settings', 'A.m_vmiss'), 'required_vaccine_missing', 'required list: no yellow fever on file is a required vaccine missing');
SELECT tests.is(pg_temp.row_of('settings', 'A.m_vmiss') -> 'vaccines_missing', '1'::jsonb, 'required list: one missing');
SELECT tests.is(pg_temp.row_of('settings', 'A.m_vexempt') ->> 'status', 'ok', 'required list: an exemption satisfies it');
SELECT tests.is(pg_temp.reasons_of('settings', 'A.m_nohealth'), 'eng1_missing|no_health_record', 'required list: not judged without a Health record (the missing ENG1 still is, D-385)');
SELECT tests.is(pg_temp.reasons_of('settings', 'A.m_novac'), 'required_vaccine_missing|no_vaccinations', 'required list: with no vaccination at all, both');

-- ------------------------------------------------------------ windows from expiry_window_rules (C5)

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives($q$SELECT public.fleet_medical_settings_save('{"required_vaccines": []}'::jsonb)$q$, 'save: no required vaccines again');
SELECT tests.reset_role();
INSERT INTO public.expiry_window_rules (company_id, item_type, warn_days) VALUES
  (tests.company_id('A'), 'medical', 20),
  (tests.company_id('A'), 'vaccination', 30);
SELECT pg_temp.take('windows', 'A.fleet_manager');
SELECT tests.is(pg_temp.row_of('windows', 'A.m_soon') ->> 'eng1_state', 'valid', 'windows: with a 20-day medical window, 25 days out is valid');
SELECT tests.is(pg_temp.row_of('windows', 'A.m_soon') ->> 'status', 'ok', 'windows: and no longer at risk');
SELECT tests.is(pg_temp.row_of('windows', 'A.m_boost') -> 'boosters_due', '0'::jsonb, 'windows: with a 30-day vaccination window, 40 days out is no booster due');
SELECT tests.is(pg_temp.row_of('windows', 'A.m_vmiss') ->> 'status', 'ok', 'settings: an empty required list requires nothing');

-- ------------------------------------------------------------ the guarded X1 branches without their columns

ALTER TABLE public.crew_document_types RENAME COLUMN is_medical_fitness TO is_medical_fitness_x5hidden;
ALTER TABLE public.work_rest_non_conformities RENAME COLUMN is_serious TO is_serious_x5hidden;
SELECT pg_temp.take('no_x1', 'A.fleet_manager');
ALTER TABLE public.crew_document_types RENAME COLUMN is_medical_fitness_x5hidden TO is_medical_fitness;
ALTER TABLE public.work_rest_non_conformities RENAME COLUMN is_serious_x5hidden TO is_serious;

SELECT tests.is(pg_temp.reasons_of('no_x1', 'A.m_doc'), 'eng1_missing', 'X1 branch absent: crew documents are not read');
SELECT tests.is(pg_temp.reasons_of('no_x1', 'A.m_doc_eng1'), 'eng1_missing', 'X1 branch absent: not even an ENG1 document');
SELECT tests.is(pg_temp.reasons_of('no_x1', 'A.m_unfit_doc'), 'eng1_unfit', 'X1 branch absent: the unfit assessment stands');
SELECT tests.is(pg_temp.reasons_of('no_x1', 'A.m_serious'), 'serious_rest_breach', 'X1 branch absent: < 4 h in 24 h is serious by the legacy rule');
SELECT tests.is(pg_temp.reasons_of('no_x1', 'A.m_legacy'), 'serious_rest_breach', 'X1 branch absent: < 50 h in 7 days is serious by the legacy rule');
SELECT tests.is(pg_temp.reasons_of('no_x1', 'A.m_restnc'), 'rest_noncompliance', 'X1 branch absent: 8 h 20 min in 24 h is not serious');
SELECT tests.is(pg_temp.row_of('no_x1', 'A.m_gam') -> 'serious_rest_breach_30d', 'null'::jsonb, 'X1 branch absent: still not tracked where Hours of Rest is off');
SELECT pg_temp.take('x1_back', 'A.fleet_manager');
SELECT tests.is(pg_temp.reasons_of('x1_back', 'A.m_legacy'), 'rest_noncompliance', 'X1 branch back: X1''s flag decides again');
SELECT tests.is(pg_temp.row_of('x1_back', 'A.m_doc') ->> 'eng1_state', 'valid', 'X1 branch back: documents count again');

-- ------------------------------------------------------------ grants

SELECT tests.ok(has_function_privilege('authenticated', 'public.fleet_crew_medical_status(uuid[],text[],date)', 'EXECUTE')
                AND NOT has_function_privilege('anon', 'public.fleet_crew_medical_status(uuid[],text[],date)', 'EXECUTE'),
                'grants: fleet_crew_medical_status for authenticated, not anon');
SELECT tests.ok(has_function_privilege('authenticated', 'public.fleet_medical_settings_save(jsonb)', 'EXECUTE')
                AND NOT has_function_privilege('anon', 'public.fleet_medical_settings_save(jsonb)', 'EXECUTE'),
                'grants: fleet_medical_settings_save for authenticated, not anon');
SELECT tests.ok(NOT has_function_privilege('authenticated', 'public.fleet_medical_reasons(boolean,text,integer,integer,integer,integer,integer,integer,integer,text)', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.fleet_medical_status_of(text[])', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.fleet_medical_vaccine_key(text)', 'EXECUTE')
                AND has_function_privilege('service_role', 'public.fleet_medical_reasons(boolean,text,integer,integer,integer,integer,integer,integer,integer,text)', 'EXECUTE'),
                'grants: the pure rules are service role only');
SELECT tests.ok(has_table_privilege('authenticated', 'public.fleet_medical_settings', 'SELECT')
                AND NOT has_table_privilege('authenticated', 'public.fleet_medical_settings', 'INSERT')
                AND NOT has_table_privilege('authenticated', 'public.fleet_medical_settings', 'UPDATE')
                AND NOT has_table_privilege('authenticated', 'public.fleet_medical_settings', 'DELETE')
                AND NOT has_table_privilege('anon', 'public.fleet_medical_settings', 'SELECT'),
                'grants: fleet_medical_settings is read-only for authenticated, nothing for anon');
SELECT tests.ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.fleet_medical_settings'::regclass), 'fleet_medical_settings has RLS on');
SELECT tests.ok(obj_description('public.fleet_medical_settings'::regclass, 'pg_class') IS NOT NULL, 'fleet_medical_settings has a comment');
