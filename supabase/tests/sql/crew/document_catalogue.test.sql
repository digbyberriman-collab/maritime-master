-- The crew document catalogue and crew-document server (X1-04,
-- 20261124060400_crew_document_catalogue.sql; gap/04 C23, C26, C29, C34, W3;
-- gap/02 TR9; DECISIONS C5, D-31, D-X1-3, D-X1-18; platform plan contracts
-- 3, 4, 7, 8):
--   1. the seed: counts, tabs, STORM ids and wording, item types, medical
--      fitness, satisfaction rules (combined, supersedes, equivalents) and
--      their chains, the legacy map against every MARITIME_CERTIFICATE_TYPES
--      string of the TS source, the normaliser, the scope guards;
--   2. the backfill: person and company, the type (legacy map, name, none),
--      passports from profiles and from travel documents, the crew-report
--      flag and the mirror into profiles, visas, a second run adds nothing;
--   3. a person without a login holds a document;
--   4. the guard: verification reset by a legacy-style UPDATE of the number,
--      verification / alerts / new columns refused outside the engine, hard
--      delete of a reviewed document refused, the subject locked, dates,
--      company scope, a legacy row with reversed dates still changes;
--   5. RLS: who reads whose documents (own, crew_profiles + crew_certificates
--      viewers of the vessel, profile-only viewers, another vessel's crew,
--      the legacy master, HR, externals, inactive, another tenant, anon); the
--      set equals the predicate; the RESTRICTIVE tenant pin;
--   6. crew_documents_for_profile: gates, states (not uploaded, missing
--      date, the EXP1 / D-31 boundary table on windows 90, 270, 14 and 0,
--      endorsement, alerts off, no expiry), rights;
--   7. crew_document_save: rights (editor, own uploads on and off, other
--      vessel, other tenant, inactive), the field schema and every refusal,
--      the one-passport rule, the file path, the tick, verification reset,
--      a no-login person, the passport mirror as the signed-in person;
--   8. crew_document_delete: the uploader's 24 hours, the editor's reason,
--      the passport flag cleared;
--   9. crew_document_issuing_suggestions and crew_document_rights;
--  10. crew_document_record_from_source (TR9): create, idempotence, renew,
--      an older completion, no expiry, company and caller checks, refusals;
--  11. the expiry source view and its registry rows, through X5's engine;
--  12. the storage predicates and 20261124000100's gate;
--  13. vessel_crew_settings;
--  14. grants.

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ world (A.dra unless named)

SELECT tests.seed_user('A', 'A.bosun', 'crew');
SELECT tests.seed_assignment('A.bosun', 'A.dra', true, 'Bosun');
SELECT tests.seed_profile('A', 'A.pending', 'crew', 'not_invited', NULL,
  jsonb_build_object('is_imported', true, 'imported_vessel_id', tests.vessel_id('A.dra'), 'rank', 'Deckhand'));
SELECT tests.seed_user('A', 'A.viewer', 'crew');        -- crew_profiles.view + crew_certificates.view
SELECT tests.seed_assignment('A.viewer', 'A.dra', true, 'Second Officer');
SELECT tests.seed_user('A', 'A.profile_only', 'crew');  -- crew_profiles.view only
SELECT tests.seed_assignment('A.profile_only', 'A.dra', true, 'Deckhand');
SELECT tests.seed_user('A', 'A.editor', 'crew');        -- crew_profiles.view + crew_certificates edit
SELECT tests.seed_assignment('A.editor', 'A.dra', true, 'Chief Officer');
SELECT tests.seed_user('A', 'A.hr', 'crew');            -- HR edit (shore)
SELECT tests.seed_user('A', 'A.hr_viewer', 'crew');     -- HR view (shore)
SELECT tests.seed_user('A', 'A.ext', 'crew');           -- external viewer on A.dra, crew_profiles + crew_certificates view
SELECT tests.seed_user('B', 'B.crew', 'crew');
SELECT tests.seed_assignment('B.crew', 'B.lev', true, 'Deckhand');

SELECT tests.seed_role('x1d_view', 'vessel');
SELECT tests.seed_role('x1d_profile', 'vessel');
SELECT tests.seed_role('x1d_edit', 'vessel');
SELECT tests.seed_role('x1d_hr_edit', 'fleet');
SELECT tests.seed_role('x1d_hr_view', 'fleet');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, x.k, x.p::public.permission_level, 'fleet'
FROM (VALUES ('x1d_view', 'crew.view_crew_profiles', 'view'), ('x1d_view', 'crew_certificates', 'view'),
             ('x1d_profile', 'crew.view_crew_profiles', 'view'),
             ('x1d_edit', 'crew.view_crew_profiles', 'view'), ('x1d_edit', 'crew_certificates', 'edit'),
             ('x1d_hr_edit', 'hr', 'edit'), ('x1d_hr_view', 'hr', 'view')) AS x(r, k, p)
JOIN public.roles AS r ON r.name = x.r;
SELECT tests.seed_rbac_role('A.viewer', 'x1d_view');
SELECT tests.seed_rbac_role('A.profile_only', 'x1d_profile');
SELECT tests.seed_rbac_role('A.editor', 'x1d_edit');
SELECT tests.seed_rbac_role('A.hr', 'x1d_hr_edit');
SELECT tests.seed_rbac_role('A.hr_viewer', 'x1d_hr_view');
SELECT tests.seed_rbac_role('A.ext', 'x1d_view');
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'external', vessel_scope = 'assigned', fleet_access = false, source = 'admin',
    valid_from = now() - interval '1 day', valid_until = now() + interval '7 days'
WHERE user_id = tests.user_id('A.ext');
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT id, company_id, tests.vessel_id('A.dra') FROM public.account_memberships WHERE user_id = tests.user_id('A.ext');

CREATE TEMP TABLE t_type ON COMMIT DROP AS SELECT key, id FROM public.crew_document_types WHERE company_id IS NULL;
GRANT SELECT ON t_type TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.ty(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT md5('storm.crew_document_type.' || p_key)::uuid $$;

-- Setup checks (so each answer below is the rule it claims to be).
SELECT tests.ok(public.has_capability_for(tests.user_id('A.viewer'), 'vessel.crew.crew_certificates.view', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.has_capability_for(tests.user_id('A.viewer'), 'vessel.crew.crew_profiles.view', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.viewer'), 'vessel.crew.crew_certificates.create', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.viewer'), 'vessel.crew.crew_certificates.view', tests.company_id('A'), tests.vessel_id('A.hyd')),
                'setup: A.viewer reads documents on A.dra only and adds none');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.profile_only'), 'vessel.crew.crew_profiles.view', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.profile_only'), 'vessel.crew.crew_certificates.view', tests.company_id('A'), tests.vessel_id('A.dra')),
                'setup: A.profile_only sees profiles on A.dra but holds no crew_certificates.view');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.editor'), 'vessel.crew.crew_certificates.create', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.has_capability_for(tests.user_id('A.editor'), 'vessel.crew.crew_certificates.edit', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.hr_can_edit(tests.user_id('A.editor')),
                'setup: A.editor adds and changes documents on A.dra (not HR)');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.bosun'), 'vessel.crew.crew_certificates.view_own', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.bosun'), 'vessel.crew.crew_certificates.view', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.bosun'), 'vessel.crew.crew_certificates.create', tests.company_id('A'), tests.vessel_id('A.dra')),
                'setup: the bosun holds view_own on A.dra only');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.master_dra'), 'vessel.crew.crew_certificates.view', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.has_capability_for(tests.user_id('A.master_dra'), 'vessel.crew.crew_profiles.view', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.master_dra'), 'vessel.crew.crew_certificates.create', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.hr_can_edit(tests.user_id('A.master_dra')),
                'setup: the legacy master holds crew_certificates.view on A.dra (the crew nav rule) and is a legacy HR editor (hr_can_edit), so reads the company''s documents');
SELECT tests.ok(public.hr_can_edit(tests.user_id('A.hr')) AND public.hr_can_view(tests.user_id('A.hr_viewer')) AND NOT public.hr_can_edit(tests.user_id('A.hr_viewer')),
                'setup: A.hr edits HR records, A.hr_viewer views them');
SELECT tests.ok(public.record_user_is_external(tests.user_id('A.ext'), tests.company_id('A'))
                AND public.has_capability_for(tests.user_id('A.ext'), 'vessel.crew.crew_certificates.view', tests.company_id('A'), tests.vessel_id('A.dra')),
                'setup: the external viewer holds the capability on A.dra (so the refusals below are the external rule)');

-- ------------------------------------------------------------ 1. the seed

SELECT tests.is((SELECT count(*) FROM public.crew_document_categories), 37::bigint, 'seed: 37 categories');
SELECT tests.results_eq($q$SELECT tab, count(*) FROM public.crew_document_categories GROUP BY tab$q$,
  $q$VALUES ('documents', 9::bigint), ('stcw', 10::bigint), ('qualifications', 18::bigint)$q$, 'every category sits on one of the three tabs');
SELECT tests.is((SELECT count(*) FROM public.crew_document_types WHERE company_id IS NULL), 206::bigint, 'seed: 206 system document types');
SELECT tests.is_empty($q$SELECT key FROM public.crew_document_types WHERE company_id IS NULL AND id <> md5('storm.crew_document_type.' || key)::uuid$q$,
  'system type ids are md5(''storm.crew_document_type.'' || key): the same on every database and in the fixtures');
SELECT tests.is_empty($q$SELECT c.key FROM public.crew_document_categories AS c WHERE NOT EXISTS (SELECT 1 FROM public.crew_document_types AS t WHERE t.category_key = c.key)$q$,
  'every category holds at least one type');
SELECT tests.is_empty($q$SELECT name FROM public.crew_document_types WHERE company_id IS NULL GROUP BY name HAVING count(*) > 1$q$, 'system type names are unique');
SELECT tests.is_empty($q$SELECT name FROM public.crew_document_types WHERE name ~* '\m(padi|rya|iyt|pya|mca|ssi)\M' OR abbreviation ~* '\m(padi|rya|iyt|pya)\M'$q$,
  'STORM wording: no school or regulator brand names in the catalogue (D-07)');
SELECT tests.results_eq($q$SELECT DISTINCT expiry_item_type FROM public.crew_document_types$q$,
  $q$VALUES ('passport'), ('visa'), ('crew_document'), ('crew_qualification'), ('medical'), ('work_authorisation')$q$,
  'item types are X5''s vocabulary (contract 4: medical, not medical_certificate), every one used');
SELECT tests.is((SELECT count(*) FROM public.crew_document_types WHERE is_medical_fitness), 15::bigint, 'ENG1 and 14 accepted equivalents are medical fitness types');
SELECT tests.ok((SELECT is_medical_fitness AND expiry_item_type = 'medical' FROM public.crew_document_types WHERE key = 'eng1')
                AND NOT (SELECT is_medical_fitness FROM public.crew_document_types WHERE key = 'ml5'),
                'ENG1 is medical fitness, the small-vessel ML5 is not');
SELECT tests.is_empty($q$SELECT key FROM public.crew_document_types WHERE expiry_item_type = 'passport' AND NOT is_identity$q$, 'passports are identity documents');
SELECT tests.is((SELECT tab FROM public.crew_document_categories WHERE key = (SELECT category_key FROM public.crew_document_types WHERE key = 'seafarer_medical_malta')),
                'documents', 'a non-ENG1 medical certificate is filed under Documents, never Qualifications (T-185)');
SELECT tests.is((SELECT field_schema FROM public.crew_document_types WHERE key = 'coc_master_yacht_3000'),
                '{"capacity": "required", "limitations": "optional", "issuing_office": "optional"}'::jsonb,
                'a certificate of competency asks for its capacity (required), limitations and issuing office');
SELECT tests.throws_like($q$INSERT INTO public.crew_document_types (category_key, key, name, expiry_item_type, field_schema) VALUES ('stcw_basic', 'bad_schema', 'Bad', 'crew_qualification', '{"colour": "optional"}')$q$,
  '23514', '%field_schema%', 'field_schema refuses an unknown field');
SELECT tests.throws_like($q$INSERT INTO public.crew_document_types (category_key, key, name, expiry_item_type) VALUES ('stcw_basic', 'bad_item', 'Bad', 'medical_certificate')$q$,
  '23514', '%expiry_item_type%', 'expiry_item_type refuses medical_certificate (contract 4)');
SELECT tests.throws_like($q$INSERT INTO public.crew_document_types (category_key, key, name, expiry_item_type, endorsement_interval_months) VALUES ('stcw_basic', 'bad_endorse', 'Bad', 'crew_qualification', 12)$q$,
  '23514', '%endorsement%', 'an endorsement interval needs the endorsement date field');

SELECT tests.is((SELECT count(*) FROM public.crew_document_type_satisfies WHERE company_id IS NULL), 107::bigint, 'seed: 107 system satisfaction rules');
SELECT tests.results_eq(
  $q$SELECT st.key, s.kind FROM public.crew_document_type_satisfies AS s JOIN public.crew_document_types AS st ON st.id = s.satisfies_type_id
     WHERE s.type_id = md5('storm.crew_document_type.stcw_basic_safety')::uuid$q$,
  $q$VALUES ('stcw_pst', 'component'), ('stcw_fpff', 'component'), ('stcw_efa', 'component'), ('stcw_pssr', 'component')$q$,
  'the combined STCW basic certificate covers PST, FPFF, EFA and PSSR (T-159)');
SELECT tests.ok(EXISTS (SELECT 1 FROM public.crew_document_type_satisfies WHERE type_id = md5('storm.crew_document_type.stcw_sso')::uuid
                        AND satisfies_type_id = md5('storm.crew_document_type.stcw_pdsd')::uuid AND kind = 'supersedes'),
                'a ship security officer certificate supersedes PDSD (T-53)');
SELECT tests.is((SELECT count(*) FROM public.crew_document_type_satisfies AS s JOIN public.crew_document_types AS t ON t.id = s.type_id
                 WHERE s.satisfies_type_id = md5('storm.crew_document_type.eng1')::uuid AND s.kind = 'equivalent' AND t.is_medical_fitness),
                14::bigint, 'every accepted seafarer medical counts as ENG1 (T-185, T-326)');
SELECT tests.results_eq(
  $q$SELECT t.key, s.depth FROM public.crew_document_type_satisfiers(md5('storm.crew_document_type.coc_oow_deck_unlimited')::uuid, NULL) AS s
     JOIN public.crew_document_types AS t ON t.id = s.type_id$q$,
  $q$VALUES ('coc_chief_mate_unlimited', 1), ('coc_master_unlimited', 2)$q$,
  'satisfiers follow chains: the master''s certificate covers the officer of the watch''s through the chief mate''s');
SELECT tests.ok((SELECT bool_and(s.type_id <> md5('storm.crew_document_type.stcw_efa')::uuid)
                 FROM public.crew_document_type_satisfiers(md5('storm.crew_document_type.stcw_efa')::uuid, NULL) AS s)
                AND (SELECT count(*) FROM public.crew_document_type_satisfiers(md5('storm.crew_document_type.stcw_efa')::uuid, NULL)) = 4,
                'EFA is satisfied by BST, medical first aid, medical care and the captain''s medical, never by itself (no loop)');

-- The legacy map holds every MARITIME_CERTIFICATE_TYPES string of the TS source.
\set legacy_ts `node -e "const s=require('fs').readFileSync('src/modules/certificates/hooks/useCrewCertificates.ts','utf8');const a=s.indexOf('MARITIME_CERTIFICATE_TYPES = [');const b=s.indexOf('\n];',a);const body=s.slice(a,b);const out=[];for(const g of body.matchAll(/types:\s*\[([\s\S]*?)\]/g)){for(const m of g[1].matchAll(/'([^']+)'/g))out.push(m[1]);}console.log(JSON.stringify(out));"`
CREATE TEMP TABLE legacy_ts ON COMMIT DROP AS SELECT x AS label FROM jsonb_array_elements_text(:'legacy_ts'::jsonb) AS x;
SELECT tests.is((SELECT count(*) FROM legacy_ts), 41::bigint, 'the TS source lists 41 legacy certificate strings');
SELECT tests.is((SELECT count(*) FROM public.crew_document_type_legacy_map WHERE company_id IS NULL), 41::bigint, 'seed: 41 legacy mappings');
SELECT tests.is_empty($q$SELECT label FROM legacy_ts WHERE public.crew_document_legacy_key(label) NOT IN (SELECT legacy_key FROM public.crew_document_type_legacy_map WHERE company_id IS NULL)$q$,
  'every legacy string of the certificates module maps to a type');
SELECT tests.results_eq(
  $q$SELECT m.legacy_label, t.key FROM public.crew_document_type_legacy_map AS m JOIN public.crew_document_types AS t ON t.id = m.document_type_id
     WHERE m.legacy_label IN ('STCW Basic Safety Training (VI/1)', 'Master 3000 GT', 'Seamans Book', 'Drug & Alcohol Test', 'Other')$q$,
  $q$VALUES ('STCW Basic Safety Training (VI/1)', 'stcw_basic_safety'), ('Master 3000 GT', 'coc_master_yacht_3000'), ('Seamans Book', 'seafarer_discharge_book'),
            ('Drug & Alcohol Test', 'drug_alcohol_test'), ('Other', 'other_certificate')$q$,
  'legacy strings map to their types (Master 3000 GT is the yacht certificate)');
SELECT tests.results_eq(
  $q$SELECT t, public.crew_document_legacy_key(t) FROM (VALUES ('Drug & Alcohol Test'), ('  HUET (Helicopter Underwater Escape Training) '), ('Electro-Technical Officer'),
       ('OICEW'), ('---'), (''), (NULL)) AS x(t)$q$,
  $q$VALUES ('Drug & Alcohol Test', 'drug_and_alcohol_test'), ('  HUET (Helicopter Underwater Escape Training) ', 'huet_helicopter_underwater_escape_training'),
       ('Electro-Technical Officer', 'electro_technical_officer'), ('OICEW', 'oicew'), ('---', NULL::text), ('', NULL), (NULL, NULL)$q$,
  'crew_document_legacy_key: lower case, & as and, runs of other characters one underscore, blank NULL (TS legacyDocumentKey)');

-- Scope guards.
INSERT INTO public.crew_document_types (id, company_id, category_key, key, name, expiry_item_type, is_active)
VALUES (tests.id('type:B.own'), tests.company_id('B'), 'other_qualifications', 'b_own_course', 'B course', 'crew_qualification', true),
       (tests.id('type:A.retired'), tests.company_id('A'), 'other_qualifications', 'a_retired_course', 'A retired course', 'crew_qualification', false);
SELECT tests.throws_like(format($q$INSERT INTO public.crew_document_type_satisfies (company_id, type_id, satisfies_type_id, kind) VALUES (%L, %L, %L, 'supersedes')$q$,
  tests.company_id('A'), tests.id('type:B.own'), pg_temp.ty('stcw_pst')), '23514', 'crew_document_rule_scope_mismatch',
  'a company rule cannot use another company''s type');
SELECT tests.throws_like(format($q$INSERT INTO public.crew_document_type_satisfies (company_id, type_id, satisfies_type_id, kind) VALUES (NULL, %L, %L, 'supersedes')$q$,
  tests.id('type:B.own'), pg_temp.ty('stcw_pst')), '23514', 'crew_document_rule_scope_mismatch', 'nor a system rule');
SELECT tests.throws_like(format($q$INSERT INTO public.crew_document_type_legacy_map (company_id, legacy_key, document_type_id) VALUES (%L, 'b_course', %L)$q$,
  tests.company_id('A'), tests.id('type:B.own')), '23514', 'crew_document_legacy_scope_mismatch', 'a company mapping cannot point at another company''s type');
SELECT tests.throws_like(format($q$UPDATE public.crew_document_types SET company_id = %L WHERE key = 'stcw_pst'$q$, tests.company_id('A')), '23514',
  'crew_document_type_scope_locked', 'a system type never becomes a company''s');
SELECT tests.throws($q$INSERT INTO public.crew_document_type_satisfies (type_id, satisfies_type_id, kind) VALUES (md5('storm.crew_document_type.stcw_pst')::uuid, md5('storm.crew_document_type.stcw_pst')::uuid, 'supersedes')$q$,
  '23514', 'a type never satisfies itself');

-- ------------------------------------------------------------ 2. the backfill

-- Legacy rows, written the legacy way (the login only; no JWT).
INSERT INTO public.crew_certificates (id, user_id, certificate_type, certificate_name, certificate_number, issue_date, expiry_date, file_url) VALUES
  (tests.id('cert:bst'), tests.user_id('A.bosun'), 'STCW Basic Safety Training (VI/1)', 'Basic safety', 'BST-1', current_date - 400, current_date + 1400, 'a/crew/legacy/bst.pdf'),
  (tests.id('cert:eng1'), tests.user_id('A.bosun'), 'Medical', 'ENG1 Medical Certificate', 'M-1', current_date - 100, current_date + 600, 'a/crew/legacy/eng1.pdf'),
  (tests.id('cert:pssr'), tests.user_id('A.bosun'), 'Course', 'PSSR', 'PS-1', current_date - 900, NULL, 'a/crew/legacy/pssr.pdf'),
  (tests.id('cert:odd'), tests.user_id('A.bosun'), 'Misc', 'An unknown course', NULL, NULL, NULL, NULL),
  (tests.id('cert:pass'), tests.user_id('A.bosun'), 'Passport', 'Passport', 'P 1234567', current_date - 1000, current_date + 500, 'a/crew/legacy/pass.pdf');
-- The guard already did the subject and the legacy-map type on insert; clear them to prove the backfill does both.
ALTER TABLE public.crew_certificates DISABLE TRIGGER trg_crew_certificates_guard;
UPDATE public.crew_certificates SET profile_id = NULL, company_id = NULL, document_type_id = NULL
WHERE id IN (tests.id('cert:bst'), tests.id('cert:eng1'), tests.id('cert:pssr'), tests.id('cert:odd'), tests.id('cert:pass'));
ALTER TABLE public.crew_certificates ENABLE TRIGGER trg_crew_certificates_guard;
UPDATE public.profiles SET passport_number = 'P1234567', passport_expiry = current_date + 500, passport_country = 'British' WHERE id = tests.profile_id('A.bosun');
UPDATE public.profiles SET passport_number = 'H7654321', passport_expiry = current_date + 300, passport_country = 'Malta',
       visa_expiry = current_date + 100, visa_status = 'Schengen C, multiple entry' WHERE id = tests.profile_id('A.crew_hyd');
-- A travel document of type passport (the live CHECK has no 'passport'; relaxed inside this rolled-back test).
ALTER TABLE public.crew_travel_documents DROP CONSTRAINT crew_travel_documents_document_type_check;
INSERT INTO public.crew_travel_documents (id, company_id, crew_member_id, document_type, original_filename, original_file_path, valid_from, valid_until, extracted_data)
VALUES (tests.id('travel:master'), tests.company_id('A'), tests.user_id('A.master_dra'), 'passport', 'passport.pdf', 'travel/passport.pdf',
        current_date - 100, current_date + 1000, '{"document_number": "M1112223", "issuing_country": "Netherlands"}');

SELECT tests.is(public.crew_document_catalogue_backfill(),
  '{"subjects": 5, "mapped": 3, "matched": 1, "profile_passports": 1, "flagged": 1, "travel_passports": 1, "travel_flagged": 1, "profile_visas": 1}'::jsonb,
  'the backfill: 5 subjects, 3 types from the legacy map, 1 by name, 1 passport from a profile, 1 flag, 1 travel passport and its flag, 1 visa');
SELECT tests.results_eq(
  $q$SELECT cc.id, cc.profile_id, cc.company_id, t.key FROM public.crew_certificates AS cc LEFT JOIN public.crew_document_types AS t ON t.id = cc.document_type_id
     WHERE cc.id IN (tests.id('cert:bst'), tests.id('cert:eng1'), tests.id('cert:pssr'), tests.id('cert:odd'), tests.id('cert:pass'))$q$,
  $q$VALUES (tests.id('cert:bst'), tests.profile_id('A.bosun'), tests.company_id('A'), 'stcw_basic_safety'),
            (tests.id('cert:eng1'), tests.profile_id('A.bosun'), tests.company_id('A'), 'eng1'),
            (tests.id('cert:pssr'), tests.profile_id('A.bosun'), tests.company_id('A'), 'stcw_pssr'),
            (tests.id('cert:odd'), tests.profile_id('A.bosun'), tests.company_id('A'), NULL::text),
            (tests.id('cert:pass'), tests.profile_id('A.bosun'), tests.company_id('A'), 'passport')$q$,
  'person and company from the login; the type from the legacy map (type, then name), an exact abbreviation, or left for review');
SELECT tests.ok((SELECT use_in_crew_report FROM public.crew_certificates WHERE id = tests.id('cert:pass'))
                AND NOT EXISTS (SELECT 1 FROM public.crew_certificates WHERE profile_id = tests.profile_id('A.bosun') AND source = 'import'),
                'the bosun''s legacy passport certificate is the profile''s passport (number without spaces): flagged, no second document');
SELECT tests.results_eq(
  $q$SELECT certificate_number, expiry_date, issuing_country_code, use_in_crew_report, source, document_type_id FROM public.crew_certificates
     WHERE profile_id = tests.profile_id('A.crew_hyd') AND external_ref = 'profile:passport'$q$,
  $q$VALUES ('H7654321', current_date + 300, 'MT', true, 'import', md5('storm.crew_document_type.passport')::uuid)$q$,
  'a passport typed on the profile becomes a flagged passport document');
SELECT tests.results_eq($q$SELECT passport_number, passport_country FROM public.profiles WHERE id = tests.profile_id('A.crew_hyd')$q$,
  $q$VALUES ('H7654321', 'Malta')$q$, 'and the mirror leaves the profile as it was (same number, same country)');
SELECT tests.results_eq(
  $q$SELECT certificate_number, issue_date, expiry_date, issuing_country_code, use_in_crew_report FROM public.crew_certificates WHERE profile_id = tests.profile_id('A.master_dra')$q$,
  $q$VALUES ('M1112223', current_date - 100, current_date + 1000, 'NL', true)$q$,
  'a travel document of type passport becomes the master''s flagged passport');
SELECT tests.results_eq($q$SELECT passport_number, passport_expiry, passport_country FROM public.profiles WHERE id = tests.profile_id('A.master_dra')$q$,
  $q$VALUES ('M1112223', current_date + 1000, 'Netherlands')$q$, 'and is mirrored into the master''s empty profile passport columns (C26)');
SELECT tests.results_eq($q$SELECT expiry_date, details ->> 'visa_type', document_type_id FROM public.crew_certificates WHERE profile_id = tests.profile_id('A.crew_hyd') AND external_ref = 'profile:visa'$q$,
  $q$VALUES (current_date + 100, 'Schengen C, multiple entry', md5('storm.crew_document_type.visa')::uuid)$q$, 'a visa date on the profile becomes a visa document');
SELECT tests.is(public.crew_document_catalogue_backfill(),
  '{"subjects": 0, "mapped": 0, "matched": 0, "profile_passports": 0, "flagged": 0, "travel_passports": 0, "travel_flagged": 0, "profile_visas": 0}'::jsonb,
  'a second run adds nothing');

-- ------------------------------------------------------------ 3. a person without a login

INSERT INTO public.crew_certificates (id, profile_id, certificate_type, certificate_name, expiry_date, document_type_id, file_url)
VALUES (tests.id('cert:pending'), tests.profile_id('A.pending'), 'Medical', 'ENG1', current_date + 200, pg_temp.ty('eng1'), 'a/crew/legacy/p.pdf');
SELECT tests.results_eq($q$SELECT user_id, company_id FROM public.crew_certificates WHERE id = tests.id('cert:pending')$q$,
  $q$VALUES (NULL::uuid, tests.company_id('A'))$q$, 'a person without a login holds a document (user_id NULL, company filled)');
SELECT tests.throws_like($q$INSERT INTO public.crew_certificates (certificate_type, certificate_name) VALUES ('x', 'y')$q$, '23514', 'crew_document_subject_unknown',
  'a document with neither a person nor a login is refused');
SELECT tests.ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.crew_certificates'::regclass AND conname = 'crew_certificates_subject_check' AND convalidated)
                AND NOT (SELECT attnotnull FROM pg_attribute WHERE attrelid = 'public.crew_certificates'::regclass AND attname = 'user_id'),
                'user_id is nullable, with the validated subject CHECK');

-- ------------------------------------------------------------ 4. the guard

UPDATE public.crew_certificates SET verification_status = 'verified', verified_by = tests.user_id('A.fleet_manager'), verified_at = now(), verification_note = 'Checked'
WHERE id = tests.id('cert:bst');
SELECT tests.as_user(tests.user_id('A.hr'));
SELECT tests.lives(format($q$UPDATE public.crew_certificates SET certificate_number = 'BST-2' WHERE id = %L$q$, tests.id('cert:bst')),
  'the certificates module''s legacy writer (an HR editor) changes the number');
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT certificate_number, verification_status, verified_by, verified_at, verification_note FROM public.crew_certificates WHERE id = tests.id('cert:bst')$q$,
  $q$VALUES ('BST-2', 'unverified', NULL::uuid, NULL::timestamptz, NULL::text)$q$, 'a material change returns the verified document to unverified (C27, T-139)');
UPDATE public.crew_certificates SET verification_status = 'verified', verified_by = tests.user_id('A.fleet_manager'), verified_at = now() WHERE id = tests.id('cert:eng1');
SELECT tests.as_user(tests.user_id('A.hr'));
SELECT tests.lives(format($q$UPDATE public.crew_certificates SET notes = 'Seen by HR' WHERE id = %L$q$, tests.id('cert:eng1')), 'a non-material change by the legacy writer');
SELECT tests.throws_like(format($q$UPDATE public.crew_certificates SET verification_status = 'verified' WHERE id = %L$q$, tests.id('cert:bst')), '42501', 'crew_document_engine_only',
  'verification is never set by a signed-in writer outside the engine');
SELECT tests.throws_like(format($q$UPDATE public.crew_certificates SET alerts_muted = true, muted_at = now() WHERE id = %L$q$, tests.id('cert:bst')), '42501', 'crew_document_engine_only',
  'nor alerts off');
SELECT tests.throws_like(format($q$UPDATE public.crew_certificates SET deleted_at = now() WHERE id = %L$q$, tests.id('cert:bst')), '42501', 'crew_document_engine_only',
  'nor the removal columns');
SELECT tests.throws_like(format($q$UPDATE public.crew_certificates SET use_in_crew_report = false WHERE id = %L$q$, tests.id('cert:pass')), '42501', 'crew_document_engine_only',
  'nor any other new column (the crew-report flag)');
SELECT tests.throws_like(format($q$INSERT INTO public.crew_certificates (user_id, certificate_type, certificate_name, source) VALUES (%L, 'x', 'y', 'training')$q$, tests.user_id('A.bosun')),
  '42501', 'crew_document_engine_only', 'a legacy insert cannot claim a source');
SELECT tests.lives(format($q$INSERT INTO public.crew_certificates (id, user_id, certificate_type, certificate_name, expiry_date) VALUES (%L, %L, 'STCW Medical Care (VI/4)', 'Medical care', current_date + 900)$q$,
  tests.id('cert:hr_legacy'), tests.user_id('A.bosun')), 'a plain legacy insert lives');
SELECT tests.throws_like(format($q$UPDATE public.crew_certificates SET user_id = %L WHERE id = %L$q$, tests.user_id('A.viewer'), tests.id('cert:hr_legacy')), '42501',
  'crew_document_subject_locked', 'a document never moves to another person');
SELECT tests.throws_like(format($q$DELETE FROM public.crew_certificates WHERE id = %L$q$, tests.id('cert:eng1')), '42501', 'crew_document_delete_refused',
  'a reviewed document is never hard-deleted by a legacy writer');
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT profile_id, company_id, document_type_id, verification_status FROM public.crew_certificates WHERE id = tests.id('cert:hr_legacy')$q$,
  $q$VALUES (tests.profile_id('A.bosun'), tests.company_id('A'), md5('storm.crew_document_type.stcw_medical_care')::uuid, 'unverified')$q$,
  'the guard filled the person, company and type of the legacy insert');
SELECT tests.is((SELECT verification_status FROM public.crew_certificates WHERE id = tests.id('cert:eng1')), 'verified', 'the notes change kept the verification');
SELECT tests.as_user(tests.user_id('A.hr'));
SELECT tests.lives(format($q$DELETE FROM public.crew_certificates WHERE id = %L$q$, tests.id('cert:hr_legacy')), 'an unreviewed legacy row may still be deleted the legacy way');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws(format($q$INSERT INTO public.crew_certificates (user_id, certificate_type, certificate_name) VALUES (%L, 'x', 'y')$q$, tests.user_id('A.bosun')),
  '42501', 'another tenant cannot write a document for A''s crew');
SELECT tests.reset_role();
SELECT tests.throws_like(format($q$INSERT INTO public.crew_certificates (profile_id, company_id, certificate_type, certificate_name) VALUES (%L, %L, 'x', 'y')$q$,
  tests.profile_id('A.bosun'), tests.company_id('B')), '23514', 'crew_document_scope_mismatch', 'a document belongs to its person''s company (every writer)');
SELECT tests.throws_like(format($q$INSERT INTO public.crew_certificates (profile_id, certificate_type, certificate_name, issue_date, expiry_date) VALUES (%L, 'x', 'y', current_date, current_date - 1)$q$,
  tests.profile_id('A.bosun')), '22023', 'crew_document_dates_invalid', 'an expiry before the issue date is refused');
-- A live row written before this file with reversed dates still changes (no CHECK; the rule bites on new dates only).
ALTER TABLE public.crew_certificates DISABLE TRIGGER trg_crew_certificates_guard;
INSERT INTO public.crew_certificates (id, user_id, profile_id, company_id, certificate_type, certificate_name, issue_date, expiry_date)
VALUES (tests.id('cert:reversed'), tests.user_id('A.bosun'), tests.profile_id('A.bosun'), tests.company_id('A'), 'Misc', 'Old row', current_date, current_date - 10);
ALTER TABLE public.crew_certificates ENABLE TRIGGER trg_crew_certificates_guard;
SELECT tests.as_user(tests.user_id('A.hr'));
SELECT tests.lives(format($q$UPDATE public.crew_certificates SET certificate_number = NULL, notes = NULL WHERE id = %L$q$, tests.id('cert:reversed')),
  'a legacy row with reversed dates can still be changed (anonymisation clears it)');
SELECT tests.reset_role();
DELETE FROM public.crew_certificates WHERE id = tests.id('cert:reversed');

-- B's crew document (for the matrix).
INSERT INTO public.crew_certificates (id, user_id, certificate_type, certificate_name, expiry_date) VALUES (tests.id('cert:b'), tests.user_id('B.crew'), 'Passport', 'Passport', current_date + 50);

-- ------------------------------------------------------------ 5. RLS

CREATE TEMP TABLE subject ON COMMIT DROP AS
SELECT tests.profile_id(k) AS id, k FROM unnest(ARRAY['A.bosun', 'A.pending', 'A.master_dra', 'A.crew_hyd', 'A.viewer', 'A.profile_only', 'B.crew']) AS k;
GRANT SELECT ON subject TO PUBLIC;
CREATE TEMP TABLE read_case (persona text, sees text[]) ON COMMIT DROP;
INSERT INTO read_case VALUES
  ('A.bosun', ARRAY['A.bosun']),
  ('A.viewer', ARRAY['A.bosun', 'A.pending', 'A.master_dra', 'A.viewer', 'A.profile_only']),
  ('A.editor', ARRAY['A.bosun', 'A.pending', 'A.master_dra', 'A.viewer', 'A.profile_only']),
  ('A.master_dra', ARRAY['A.bosun', 'A.pending', 'A.master_dra', 'A.crew_hyd', 'A.viewer', 'A.profile_only']),
  ('A.profile_only', ARRAY['A.profile_only']),
  ('A.crew_hyd', ARRAY['A.crew_hyd']),
  ('A.hr', ARRAY['A.bosun', 'A.pending', 'A.master_dra', 'A.crew_hyd', 'A.viewer', 'A.profile_only']),
  ('A.hr_viewer', ARRAY['A.bosun', 'A.pending', 'A.master_dra', 'A.crew_hyd', 'A.viewer', 'A.profile_only']),
  ('A.fleet_manager', ARRAY['A.bosun', 'A.pending', 'A.master_dra', 'A.crew_hyd', 'A.viewer', 'A.profile_only']),
  ('A.ext', ARRAY[]::text[]),
  ('A.disabled', ARRAY[]::text[]),
  ('B.admin', ARRAY['B.crew']);
GRANT SELECT ON read_case TO PUBLIC;
DO $$
DECLARE c record; s record; v boolean; v_set boolean;
BEGIN
  FOR c IN SELECT * FROM read_case ORDER BY persona LOOP
    PERFORM tests.as_user(tests.user_id(c.persona));
    FOR s IN SELECT * FROM subject ORDER BY k LOOP
      RESET ROLE;  -- the predicate is service-role only: evaluate it as the definer would, with the persona's JWT
      v := public.crew_document_file_readable(tests.user_id(c.persona), s.id);
      PERFORM tests.as_user(tests.user_id(c.persona));
      v_set := s.id IN (SELECT public.crew_document_visible_profile_ids());
      PERFORM tests.is(v, s.k = ANY (c.sees), format('crew_document_file_readable(%s, %s) is %s', c.persona, s.k, s.k = ANY (c.sees)));
      PERFORM tests.is(v_set, v, format('crew_document_visible_profile_ids as %s agrees on %s', c.persona, s.k));
    END LOOP;
  END LOOP;
END
$$;
SELECT tests.reset_role();
-- The rows each persona reads (people with documents: bosun, pending, master, crew_hyd, B.crew).
SELECT tests.as_user(tests.user_id('A.bosun'));
SELECT tests.results_eq($q$SELECT DISTINCT profile_id FROM public.crew_certificates$q$, $q$VALUES (tests.profile_id('A.bosun'))$q$, 'a crew member reads their own documents only');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.results_eq($q$SELECT DISTINCT profile_id FROM public.crew_certificates$q$, $q$VALUES (tests.profile_id('A.crew_hyd'))$q$,
  'a crew member of the same company no longer reads another person''s documents (the company-wide read is gone)');
SELECT tests.as_user(tests.user_id('A.profile_only'));
SELECT tests.is_empty($q$SELECT * FROM public.crew_certificates$q$, 'seeing profiles without crew_certificates.view reads no documents');
SELECT tests.as_user(tests.user_id('A.viewer'));
SELECT tests.results_eq($q$SELECT DISTINCT profile_id FROM public.crew_certificates$q$,
  $q$VALUES (tests.profile_id('A.bosun')), (tests.profile_id('A.pending')), (tests.profile_id('A.master_dra'))$q$,
  'a viewer of A.dra reads A.dra''s crew, the no-login person included, not HYDRA''s');
SELECT tests.as_user(tests.user_id('A.hr_viewer'));
SELECT tests.results_eq($q$SELECT DISTINCT profile_id FROM public.crew_certificates$q$,
  $q$VALUES (tests.profile_id('A.bosun')), (tests.profile_id('A.pending')), (tests.profile_id('A.master_dra')), (tests.profile_id('A.crew_hyd'))$q$,
  'an HR viewer reads every A person''s documents, none of B');
SELECT tests.as_user(tests.user_id('A.ext'));
SELECT tests.is_empty($q$SELECT * FROM public.crew_certificates$q$, 'an external viewer reads none, although the capability answers true on A.dra');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is_empty($q$SELECT * FROM public.crew_certificates$q$, 'an inactive caller reads nothing');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.results_eq($q$SELECT id FROM public.crew_certificates$q$, $q$VALUES (tests.id('cert:b'))$q$, 'another tenant reads only its own');
SELECT tests.as_user(tests.user_id('A.hr'));
SELECT tests.denied(format($q$UPDATE public.crew_certificates SET notes = 'x' WHERE id = %L RETURNING id$q$, tests.id('cert:b')), 'the tenant pin: an A editor changes no B document');
SELECT tests.denied(format($q$DELETE FROM public.crew_certificates WHERE id = %L RETURNING id$q$, tests.id('cert:b')), 'nor deletes one');
SELECT tests.as_anon();
SELECT tests.denied('SELECT * FROM public.crew_certificates', 'anon reads no document');
SELECT tests.reset_role();
SELECT tests.results_eq(
  $q$SELECT policyname, permissive, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'crew_certificates' AND policyname LIKE 'crew_documents_%'$q$,
  $q$VALUES ('crew_documents_select_scoped'::name, 'PERMISSIVE', 'SELECT'), ('crew_documents_tenant_pin'::name, 'RESTRICTIVE', 'ALL')$q$,
  'the scoped read and the RESTRICTIVE tenant pin');
SELECT tests.is_empty($q$SELECT policyname FROM pg_policies WHERE tablename = 'crew_certificates' AND policyname = 'Users can view crew certificates in their company'$q$,
  'the company-wide legacy read is dropped');
SELECT tests.is((SELECT count(*) FROM pg_policies WHERE tablename = 'crew_certificates' AND policyname LIKE 'Crew or HR can %'), 3::bigint, 'the legacy write policies stay');

-- ------------------------------------------------------------ 6. crew_documents_for_profile

-- Windows: a 14-day rule for advanced fire fighting, a zero window for fast rescue boats.
INSERT INTO public.expiry_window_rules (company_id, item_type, certificate_type_id, warn_days) VALUES
  (tests.company_id('A'), 'crew_qualification', pg_temp.ty('stcw_aff'), 14),
  (tests.company_id('A'), 'crew_qualification', pg_temp.ty('stcw_frb'), 0);
-- EXP1, the shared boundary table (D-31), relative to today: one document of the bosun per row.
CREATE TEMP TABLE exp1 (label text, window_days integer, bucket text, days integer) ON COMMIT DROP;
INSERT INTO exp1 VALUES
  ('a year overdue', 90, 'expired', -365),
  ('the day after the expiry date', 90, 'expired', -1),
  ('the expiry date itself', 90, 'expiring_soon', 0),
  ('the day before the expiry date', 90, 'expiring_soon', 1),
  ('last day of the 30-day tier', 90, 'expiring_soon', 30),
  ('first day past the 30-day tier', 90, 'expiring', 31),
  ('last day of the window', 90, 'expiring', 90),
  ('first day past the window', 90, 'valid', 91),
  ('passport, last day of 270', 270, 'expiring', 270),
  ('passport, past 270', 270, 'valid', 271),
  ('14-day window, last day', 14, 'expiring_soon', 14),
  ('14-day window, past it', 14, 'valid', 15),
  ('zero window, expiry date', 0, 'expiring_soon', 0),
  ('zero window, the day after', 0, 'expired', -1);
GRANT SELECT ON exp1 TO PUBLIC;
\set exp1_ts `node -e "const s=require('fs').readFileSync('src/test/lib/records/expiry.test.ts','utf8');const b=s.slice(s.indexOf('const EXPIRY_BUCKET_FIXTURE'));const e=b.indexOf('];');const re=/[{] case: '([^']+)', expiresOn: '([0-9-]+)', windowDays: ([0-9]+), today: TODAY, bucket: '([a-z_]+)', days: (-?[0-9]+) [}]/g;const out=[];let m;const body=b.slice(0,e);while((m=re.exec(body))!==null){out.push([m[1],Number(m[3]),m[4],Number(m[5])]);}console.log(JSON.stringify(out));"`
SELECT tests.results_eq($q$SELECT label, window_days, bucket, days FROM exp1$q$,
  format($q$SELECT x ->> 0, (x ->> 1)::integer, x ->> 2, (x ->> 3)::integer FROM jsonb_array_elements(%L::jsonb) AS x$q$, :'exp1_ts'),
  'the boundary rows here are the EXP1 fixture of src/test/lib/records/expiry.test.ts (D-31)');
INSERT INTO public.crew_certificates (profile_id, certificate_type, certificate_name, document_type_id, expiry_date, file_url, issuing_country_code)
SELECT tests.profile_id('A.bosun'), 'EXP1', 'EXP1 ' || e.label,
       CASE e.window_days WHEN 90 THEN pg_temp.ty('stcw_pst') WHEN 270 THEN pg_temp.ty('passport') WHEN 14 THEN pg_temp.ty('stcw_aff') ELSE pg_temp.ty('stcw_frb') END,
       current_date + e.days, 'a/crew/legacy/exp1.pdf', CASE WHEN e.window_days = 270 THEN 'GB' END
FROM exp1 AS e;
-- State fixtures: a file without a date or tick, a ticked one, an endorsement due and overdue, alerts off.
INSERT INTO public.crew_certificates (id, profile_id, certificate_type, certificate_name, document_type_id, expiry_date, no_expiry, endorsement_due_date, file_url, alerts_muted, muted_at) VALUES
  (tests.id('cert:nodate'), tests.profile_id('A.bosun'), 'S', 'State: no date', pg_temp.ty('stcw_fpff'), NULL, false, NULL, 'a/crew/legacy/x.pdf', false, NULL),
  (tests.id('cert:tick'), tests.profile_id('A.bosun'), 'S', 'State: no expiry', pg_temp.ty('stcw_efa'), NULL, true, NULL, 'a/crew/legacy/x.pdf', false, NULL),
  (tests.id('cert:endorse_due'), tests.profile_id('A.bosun'), 'S', 'State: endorsement due', pg_temp.ty('flag_endorsement'), current_date + 900, false, current_date + 10, 'a/crew/legacy/x.pdf', false, NULL),
  (tests.id('cert:endorse_late'), tests.profile_id('A.bosun'), 'S', 'State: endorsement overdue', pg_temp.ty('flag_endorsement_malta'), current_date + 900, false, current_date - 3, 'a/crew/legacy/x.pdf', false, NULL),
  (tests.id('cert:muted'), tests.profile_id('A.bosun'), 'S', 'State: alerts off', pg_temp.ty('stcw_crowd_management'), current_date - 5, false, NULL, 'a/crew/legacy/x.pdf', true, now());

SELECT tests.as_user(tests.user_id('A.bosun'));
SELECT tests.results_eq(
  $q$SELECT legacy_name, window_days, bucket, days_remaining, state FROM public.crew_documents_for_profile(tests.profile_id('A.bosun')) WHERE legacy_name LIKE 'EXP1 %'$q$,
  $q$SELECT 'EXP1 ' || label, window_days, bucket, days, bucket FROM exp1$q$,
  'every EXP1 boundary row reads its bucket and days through the type''s window (90, passport 270, a 14-day and a zero rule)');
SELECT tests.results_eq(
  $q$SELECT legacy_name, bucket, state, endorsement_state, alerts_muted FROM public.crew_documents_for_profile(tests.profile_id('A.bosun'))
     WHERE legacy_name LIKE 'State: %' OR id IN (tests.id('cert:odd'), tests.id('cert:pssr'))$q$,
  $q$VALUES ('State: no date', NULL::text, 'missing_date', NULL::text, false), ('State: no expiry', 'no_expiry', 'no_expiry', NULL, false),
            ('State: endorsement due', 'valid', 'valid', 'due', false), ('State: endorsement overdue', 'valid', 'valid', 'overdue', false),
            ('State: alerts off', 'expired', 'expired', NULL, true),
            ('An unknown course', NULL, 'not_uploaded', NULL, false), ('PSSR', NULL, 'missing_date', NULL, false)$q$,
  'states: no file is not_uploaded, a missing date without the tick is missing_date (never valid), the tick is no_expiry, endorsements due and overdue, alerts off keeps the real state');
SELECT tests.results_eq(
  $q$SELECT tab, category_key, type_name, verification_status, has_file, can_edit, can_delete FROM public.crew_documents_for_profile(tests.profile_id('A.bosun')) WHERE id = tests.id('cert:eng1')$q$,
  $q$VALUES ('documents', 'medical_fitness', 'ENG1 seafarer medical certificate', 'verified', true, false, false)$q$,
  'a row carries its type, category and tab, the verification, the file and the caller''s rights (the bosun changes nothing)');
SELECT tests.is((SELECT tab FROM public.crew_documents_for_profile(tests.profile_id('A.bosun')) WHERE id = tests.id('cert:odd')), 'qualifications',
  'an unclassified legacy row sits on Qualifications');
SELECT tests.as_user(tests.user_id('A.viewer'));
SELECT tests.ok((SELECT count(*) FROM public.crew_documents_for_profile(tests.profile_id('A.bosun'))) >= 20, 'a viewer of the vessel reads the bosun''s documents');
SELECT tests.results_eq($q$SELECT verified_by_name FROM public.crew_documents_for_profile(tests.profile_id('A.bosun')) WHERE id = tests.id('cert:eng1')$q$,
  $q$VALUES ('DPA A.fleet_manager')$q$, 'the reviewer''s name comes with the verification ("Reviewed by <name>")');
SELECT tests.as_user(tests.user_id('A.editor'));
SELECT tests.is((SELECT bool_and(can_edit AND can_delete) FROM public.crew_documents_for_profile(tests.profile_id('A.bosun'))), true, 'an editor may change and remove each one');
SELECT tests.as_user(tests.user_id('A.profile_only'));
SELECT tests.throws_like(format('SELECT * FROM public.crew_documents_for_profile(%L)', tests.profile_id('A.bosun')), '42501', 'crew_not_permitted',
  'seeing the profile without crew_certificates.view: 42501');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.throws_like(format('SELECT * FROM public.crew_documents_for_profile(%L)', tests.profile_id('A.bosun')), '42501', 'crew_not_permitted',
  'another vessel''s crew member: 42501');
SELECT tests.as_user(tests.user_id('A.ext'));
SELECT tests.throws_like(format('SELECT * FROM public.crew_documents_for_profile(%L)', tests.profile_id('A.bosun')), '42501', 'crew_not_permitted', 'an external viewer: 42501');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws_like(format('SELECT * FROM public.crew_documents_for_profile(%L)', tests.profile_id('A.disabled')), '42501', 'crew_not_permitted',
  'an inactive caller, even for their own profile: 42501');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(format('SELECT * FROM public.crew_documents_for_profile(%L)', tests.profile_id('A.bosun')), 'P0002', 'profile_not_found', 'another tenant''s person: P0002');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format('SELECT * FROM public.crew_documents_for_profile(%L)', tests.id('profile:nobody')), 'P0002', 'profile_not_found', 'an unknown person: P0002');
SELECT tests.as_anon();
SELECT tests.throws(format('SELECT * FROM public.crew_documents_for_profile(%L)', tests.profile_id('A.bosun')), '42501', 'anon cannot call it');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 7. crew_document_save

CREATE OR REPLACE FUNCTION pg_temp.save(p_id uuid, p_profile text, p_type text, p_payload jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.crew_document_save(%L, %L, %L, %L)', p_id, tests.profile_id(p_profile), CASE WHEN p_type IS NULL THEN NULL ELSE pg_temp.ty(p_type) END, p_payload)
$$;
SELECT tests.as_user(tests.user_id('A.editor'));
SELECT tests.throws_like(pg_temp.save(NULL, 'A.bosun', 'passport', '{"number": "X9", "issue_date": "2024-01-01", "expiry_date": "2034-01-01"}'), '22023', 'field_required',
  'a passport needs its issuing country');
SELECT tests.throws_like(pg_temp.save(NULL, 'A.bosun', 'passport', '{"number": "X9", "issuing_country_code": "gb", "expiry_date": "2034-01-01"}'), '22023', 'field_required',
  'and its issue date');
SELECT tests.throws_like(pg_temp.save(NULL, 'A.bosun', 'passport', '{"number": "X9", "issuing_country_code": "GB", "issue_date": "2024-01-01", "expiry_date": "2034-01-01", "use_in_crew_report": true}'),
  '22023', 'crew_report_passport_exists', 'one crew-report passport per person');
SELECT tests.throws_like(pg_temp.save(NULL, 'A.bosun', 'stcw_pst', '{"colour": "red", "expiry_date": "2030-01-01"}'), '22023', 'field_unknown', 'an unknown field is refused');
SELECT tests.throws_like(pg_temp.save(NULL, 'A.bosun', 'stcw_pst', '{"visa_type": "C", "expiry_date": "2030-01-01"}'), '22023', 'field_unknown', 'and a field this type does not have');
SELECT tests.throws_like(pg_temp.save(NULL, 'A.bosun', 'coc_master_yacht_3000', '{"expiry_date": "2030-01-01"}'), '22023', 'field_required', 'a certificate of competency needs its capacity');
SELECT tests.throws_like(pg_temp.save(NULL, 'A.bosun', 'visa_schengen', '{"entries": "triple", "expiry_date": "2030-01-01"}'), '22023', 'field_invalid', 'entries are single, double or multiple');
SELECT tests.throws_like(pg_temp.save(NULL, 'A.bosun', 'stcw_pst', '{"issue_date": "2026-02-30", "expiry_date": "2030-01-01"}'), '22023', 'field_invalid', 'an unreadable date');
SELECT tests.throws_like(pg_temp.save(NULL, 'A.bosun', 'stcw_pst', '{"issue_date": "2025-01-01", "expiry_date": "2024-01-01"}'), '22023', 'field_invalid', 'an expiry before the issue date');
SELECT tests.throws_like(pg_temp.save(NULL, 'A.bosun', 'stcw_pst', jsonb_build_object('issue_date', current_date + 1, 'expiry_date', current_date + 900)), '22023', 'field_invalid',
  'an issue date in the future');
SELECT tests.throws_like(pg_temp.save(NULL, 'A.bosun', 'stcw_pst', '{"no_expiry": true, "expiry_date": "2030-01-01"}'), '22023', 'field_invalid', 'the tick and an expiry date together');
SELECT tests.throws_like(pg_temp.save(NULL, 'A.bosun', 'stcw_pst', '{"number": "P-1"}'), '22023', 'field_required', 'neither an expiry date nor the tick');
SELECT tests.throws_like(pg_temp.save(NULL, 'A.bosun', 'stcw_pst', jsonb_build_object('expiry_date', '2030-01-01', 'file_path',
  tests.company_id('A')::text || '/crew/' || tests.profile_id('A.viewer')::text || '/documents/' || gen_random_uuid()::text || '-pst.pdf')), '22023', 'file_path_invalid',
  'a file of another person''s folder');
SELECT tests.throws_like(pg_temp.save(NULL, 'A.bosun', 'stcw_pst', '"not an object"'::jsonb), '22023', 'payload_invalid', 'a payload that is not an object');
SELECT tests.throws_like(format('SELECT public.crew_document_save(NULL, %L, %L, %L)', tests.profile_id('A.bosun'), tests.id('type:B.own'), '{"no_expiry": true}'), 'P0002',
  'document_type_not_found', 'another company''s type');
SELECT tests.throws_like(format('SELECT public.crew_document_save(NULL, %L, %L, %L)', tests.profile_id('A.bosun'), tests.id('type:A.retired'), '{"no_expiry": true}'), '22023',
  'document_type_inactive', 'an inactive type');
SELECT tests.throws_like(format('SELECT public.crew_document_save(NULL, %L, NULL, %L)', tests.profile_id('A.bosun'), '{"no_expiry": true}'), '22023', 'field_required', 'no type');
-- A good save, with a file of the person's folder.
CREATE TEMP TABLE saved (k text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT ALL ON saved TO PUBLIC;
INSERT INTO saved
SELECT 'pst', (public.crew_document_save(NULL, tests.profile_id('A.bosun'), pg_temp.ty('stcw_pst'), jsonb_build_object(
  'number', ' PST-77 ', 'issue_date', current_date - 30, 'expiry_date', current_date + 1800, 'issuing_office', 'Training Centre North',
  'file_path', tests.company_id('A')::text || '/crew/' || tests.profile_id('A.bosun')::text || '/documents/' || '0b1c2d3e-0000-4000-8000-000000000001-pst.pdf',
  'file_name', 'pst.pdf', 'file_size', 1200, 'file_mime', 'application/pdf'))).id;
SELECT tests.results_eq(
  $q$SELECT certificate_number, certificate_type, issuing_office, issuing_authority, user_id, company_id, created_by, verification_status, source
     FROM public.crew_certificates WHERE id = (SELECT id FROM saved WHERE k = 'pst')$q$,
  $q$VALUES ('PST-77', 'Personal survival techniques', 'Training Centre North', 'Training Centre North', tests.user_id('A.bosun'), tests.company_id('A'),
            tests.user_id('A.editor'), 'unverified', 'manual')$q$,
  'an editor adds a document: trimmed values, the type''s name for legacy readers, the issuing office, the person, company and author');
SELECT tests.is((SELECT has_file FROM public.crew_documents_for_profile(tests.profile_id('A.bosun')) WHERE id = (SELECT id FROM saved WHERE k = 'pst')), true, 'with its file');
-- Edits: the tick clears the date, a date clears the tick; a material change resets verification, a note does not; a type change keeps only its fields.
SELECT tests.lives(format('SELECT public.crew_document_save(%L, %L, NULL, %L)', (SELECT id FROM saved WHERE k = 'pst'), tests.profile_id('A.bosun'), '{"no_expiry": true}'),
  'ticking No expiry');
SELECT tests.results_eq($q$SELECT expiry_date, no_expiry FROM public.crew_certificates WHERE id = (SELECT id FROM saved WHERE k = 'pst')$q$,
  $q$VALUES (NULL::date, true)$q$, 'the tick clears the expiry date');
SELECT tests.lives(format('SELECT public.crew_document_save(%L, %L, NULL, %L)', (SELECT id FROM saved WHERE k = 'pst'), tests.profile_id('A.bosun'), jsonb_build_object('expiry_date', current_date + 1700)),
  'giving an expiry date');
SELECT tests.results_eq($q$SELECT expiry_date, no_expiry FROM public.crew_certificates WHERE id = (SELECT id FROM saved WHERE k = 'pst')$q$,
  $q$VALUES (current_date + 1700, false)$q$, 'a date clears the tick');
SELECT tests.reset_role();
UPDATE public.crew_certificates SET verification_status = 'verified', verified_at = now() WHERE id = (SELECT id FROM saved WHERE k = 'pst');
SELECT tests.as_user(tests.user_id('A.editor'));
SELECT tests.lives(format('SELECT public.crew_document_save(%L, %L, NULL, %L)', (SELECT id FROM saved WHERE k = 'pst'), tests.profile_id('A.bosun'), '{"notes": "Original seen"}'), 'a note');
SELECT tests.is((SELECT verification_status FROM public.crew_certificates WHERE id = (SELECT id FROM saved WHERE k = 'pst')), 'verified', 'a note keeps the verification');
SELECT tests.lives(format('SELECT public.crew_document_save(%L, %L, NULL, %L)', (SELECT id FROM saved WHERE k = 'pst'), tests.profile_id('A.bosun'), '{"number": "PST-78"}'), 'a new number');
SELECT tests.is((SELECT verification_status FROM public.crew_certificates WHERE id = (SELECT id FROM saved WHERE k = 'pst')), 'unverified', 'a new number resets it');
SELECT tests.lives(format('SELECT public.crew_document_save(%L, %L, %L, %L)', (SELECT id FROM saved WHERE k = 'pst'), tests.profile_id('A.bosun'), pg_temp.ty('stcw_pssr'), '{}'),
  'changing the type to one without an issuing office');
SELECT tests.results_eq($q$SELECT certificate_type, issuing_office FROM public.crew_certificates WHERE id = (SELECT id FROM saved WHERE k = 'pst')$q$,
  $q$VALUES ('Personal safety and social responsibilities', 'Training Centre North')$q$, 'the PSSR type keeps the office (it has the field)');
INSERT INTO saved
SELECT 'coc', (public.crew_document_save(NULL, tests.profile_id('A.bosun'), pg_temp.ty('coc_master_yacht_3000'),
  jsonb_build_object('capacity', 'Master', 'limitations', 'Yachts only', 'expiry_date', current_date + 1000))).id;
SELECT tests.lives(format('SELECT public.crew_document_save(%L, %L, %L, %L)', (SELECT id FROM saved WHERE k = 'coc'), tests.profile_id('A.bosun'), pg_temp.ty('stcw_pst'), '{}'),
  'a certificate of competency retyped as PST');
SELECT tests.is((SELECT details FROM public.crew_certificates WHERE id = (SELECT id FROM saved WHERE k = 'coc')), '{}'::jsonb, 'drops the fields PST does not have');
-- A person without a login.
INSERT INTO saved SELECT 'pending', (public.crew_document_save(NULL, tests.profile_id('A.pending'), pg_temp.ty('stcw_pssr'), '{"no_expiry": true}')).id;
SELECT tests.results_eq($q$SELECT user_id, profile_id, no_expiry FROM public.crew_certificates WHERE id = (SELECT id FROM saved WHERE k = 'pending')$q$,
  $q$VALUES (NULL::uuid, tests.profile_id('A.pending'), true)$q$, 'an editor adds a document for a person without a login');
-- Move the crew-report flag: off on the legacy passport, on a new one; the profile follows.
SELECT tests.lives(format('SELECT public.crew_document_save(%L, %L, NULL, %L)', tests.id('cert:pass'), tests.profile_id('A.bosun'),
  '{"use_in_crew_report": false, "issuing_country_code": "GB", "issue_date": "2016-05-01"}'), 'the legacy passport is no longer the crew-report one');
SELECT tests.results_eq($q$SELECT passport_number, passport_expiry, passport_country FROM public.profiles WHERE id = tests.profile_id('A.bosun')$q$,
  $q$VALUES (NULL::text, NULL::date, NULL::text)$q$, 'with no crew-report passport left the profile passport columns are cleared');
INSERT INTO saved SELECT 'passport', (public.crew_document_save(NULL, tests.profile_id('A.bosun'), pg_temp.ty('passport'), jsonb_build_object(
  'number', 'X9000001', 'issuing_country_code', 'IE', 'issue_date', '2024-03-01', 'expiry_date', current_date + 3000, 'use_in_crew_report', true))).id;
SELECT tests.results_eq($q$SELECT passport_number, passport_expiry, passport_country FROM public.profiles WHERE id = tests.profile_id('A.bosun')$q$,
  $q$VALUES ('X9000001', current_date + 3000, 'Ireland')$q$, 'the new crew-report passport is mirrored into the profile');
SELECT tests.throws_like(pg_temp.save(NULL, 'A.bosun', 'stcw_pst', '{"use_in_crew_report": true, "expiry_date": "2030-01-01"}'), '22023', 'field_invalid',
  'only a passport can be the crew-report one');
-- Who may save.
SELECT tests.as_user(tests.user_id('A.bosun'));
SELECT tests.throws_like(pg_temp.save(NULL, 'A.bosun', 'stcw_pst', '{"expiry_date": "2030-01-01"}'), '42501', 'crew_not_permitted', 'crew uploads off: the person adds nothing');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.throws_like(pg_temp.save(NULL, 'A.bosun', 'stcw_pst', '{"expiry_date": "2030-01-01"}'), '42501', 'crew_not_permitted', 'another vessel''s crew member: 42501');
SELECT tests.as_user(tests.user_id('A.viewer'));
SELECT tests.throws_like(pg_temp.save((SELECT id FROM saved WHERE k = 'pst'), 'A.bosun', NULL, '{"notes": "x"}'), '42501', 'crew_not_permitted', 'a viewer changes nothing');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(pg_temp.save(NULL, 'A.bosun', 'stcw_pst', '{"expiry_date": "2030-01-01"}'), 'P0002', 'profile_not_found', 'another tenant''s person: P0002');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws_like(pg_temp.save(NULL, 'A.disabled', 'stcw_pst', '{"expiry_date": "2030-01-01"}'), '42501', 'crew_not_permitted', 'an inactive caller: 42501');
SELECT tests.as_user(tests.user_id('A.hr'));
SELECT tests.lives(pg_temp.save(NULL, 'A.crew_hyd', 'stcw_pst', jsonb_build_object('expiry_date', current_date + 800)), 'a legacy HR editor adds for anyone of the company');
SELECT tests.reset_role();
INSERT INTO public.vessel_crew_settings (vessel_id, crew_uploads_enabled) VALUES (tests.vessel_id('A.dra'), true);
SELECT tests.as_user(tests.user_id('A.bosun'));
INSERT INTO saved SELECT 'own', (public.crew_document_save(NULL, tests.profile_id('A.bosun'), pg_temp.ty('stcw_fpff'), jsonb_build_object('expiry_date', current_date + 1500))).id;
SELECT tests.is((SELECT created_by FROM public.crew_certificates WHERE id = (SELECT id FROM saved WHERE k = 'own')), tests.user_id('A.bosun'), 'crew uploads on: the person adds their own');
SELECT tests.throws_like(pg_temp.save(NULL, 'A.viewer', 'stcw_pst', '{"expiry_date": "2030-01-01"}'), '42501', 'crew_not_permitted', 'but nobody else''s');
SELECT tests.lives(format('SELECT public.crew_document_save(%L, %L, NULL, %L)', (SELECT id FROM saved WHERE k = 'passport'), tests.profile_id('A.bosun'), '{"number": "X9000002"}'),
  'the person changes their own crew-report passport');
SELECT tests.reset_role();
SELECT tests.is((SELECT passport_number FROM public.profiles WHERE id = tests.profile_id('A.bosun')), 'X9000002',
  'the mirror writes their profile under their own session (the profiles guards leave these columns free)');
SELECT tests.as_anon();
SELECT tests.throws(pg_temp.save(NULL, 'A.bosun', 'stcw_pst', '{"expiry_date": "2030-01-01"}'), '42501', 'anon cannot save');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 8. crew_document_delete

SELECT tests.as_user(tests.user_id('A.bosun'));
SELECT tests.is(public.crew_document_delete((SELECT id FROM saved WHERE k = 'own')), (SELECT id FROM saved WHERE k = 'own'), 'the uploader removes their document within 24 hours, no reason needed');
SELECT tests.is_empty($q$SELECT * FROM public.crew_certificates WHERE id = (SELECT id FROM saved WHERE k = 'own')$q$, 'a removed document is hidden from the browser');
SELECT tests.is_empty($q$SELECT * FROM public.crew_documents_for_profile(tests.profile_id('A.bosun')) WHERE id = (SELECT id FROM saved WHERE k = 'own')$q$, 'and from the list');
SELECT tests.throws_like(format('SELECT public.crew_document_delete(%L)', (SELECT id FROM saved WHERE k = 'own')), 'P0002', 'document_not_found', 'removing it again: P0002');
INSERT INTO saved SELECT 'own2', (public.crew_document_save(NULL, tests.profile_id('A.bosun'), pg_temp.ty('stcw_aff'), jsonb_build_object('expiry_date', current_date + 1500))).id;
SELECT tests.throws_like(format('SELECT public.crew_document_delete(%L)', tests.id('cert:eng1')), '42501', 'crew_document_delete_refused', 'someone else''s upload: refused');
SELECT tests.reset_role();
UPDATE public.crew_certificates SET created_at = now() - interval '25 hours' WHERE id = (SELECT id FROM saved WHERE k = 'own2');
SELECT tests.as_user(tests.user_id('A.bosun'));
SELECT tests.throws_like(format('SELECT public.crew_document_delete(%L)', (SELECT id FROM saved WHERE k = 'own2')), '42501', 'crew_document_delete_refused',
  'after 24 hours the uploader can no longer remove it');
SELECT tests.as_user(tests.user_id('A.editor'));
SELECT tests.throws_like(format('SELECT public.crew_document_delete(%L)', tests.id('cert:eng1')), '22023', 'reason_required', 'an editor gives a reason');
SELECT tests.is(public.crew_document_delete(tests.id('cert:eng1'), 'Replaced by the new certificate'), tests.id('cert:eng1'), 'and removes it');
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT deleted_by, deleted_reason, deleted_at IS NOT NULL FROM public.crew_certificates WHERE id = tests.id('cert:eng1')$q$,
  $q$VALUES (tests.user_id('A.editor'), 'Replaced by the new certificate', true)$q$, 'the removal is kept with who, when and why');
SELECT tests.as_user(tests.user_id('A.editor'));
SELECT tests.is(public.crew_document_delete((SELECT id FROM saved WHERE k = 'passport'), 'Wrong number'), (SELECT id FROM saved WHERE k = 'passport'), 'removing the crew-report passport');
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT passport_number, passport_expiry, use_in_crew_report FROM public.profiles AS p JOIN public.crew_certificates AS c ON c.id = (SELECT id FROM saved WHERE k = 'passport')
                           WHERE p.id = tests.profile_id('A.bosun')$q$,
  $q$VALUES (NULL::text, NULL::date, false)$q$, 'takes its flag and clears the profile''s passport columns');
SELECT tests.as_user(tests.user_id('A.editor'));
SELECT tests.throws_like(format('SELECT public.crew_document_delete(%L, %L)', tests.id('cert:b'), 'x'), 'P0002', 'document_not_found', 'another tenant''s document: P0002');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 9. suggestions and rights

UPDATE public.crew_certificates SET issuing_office = 'training centre north' WHERE id = tests.id('cert:bst');
INSERT INTO public.crew_certificates (profile_id, certificate_type, certificate_name, document_type_id, expiry_date, issuing_office) VALUES
  (tests.profile_id('A.crew_hyd'), 'x', 'x', pg_temp.ty('stcw_basic_safety'), current_date + 10, 'Training Centre North'),
  (tests.profile_id('A.viewer'), 'x', 'x', pg_temp.ty('stcw_basic_safety'), current_date + 10, 'South Academy'),
  (tests.profile_id('B.crew'), 'x', 'x', pg_temp.ty('stcw_basic_safety'), current_date + 10, 'Elsewhere Institute');
INSERT INTO public.crew_certificates (profile_id, certificate_type, certificate_name, document_type_id, expiry_date, issuing_office)
SELECT tests.profile_id('A.viewer'), 'x', 'x', pg_temp.ty('stcw_fpff'), current_date + 10, 'Office ' || g FROM generate_series(1, 25) AS g;
SELECT tests.as_user(tests.user_id('A.editor'));
SELECT tests.results_eq(format('SELECT lower(issuing_office), uses FROM public.crew_document_issuing_suggestions(%L)', pg_temp.ty('stcw_basic_safety')),
  $q$VALUES ('training centre north', 2), ('south academy', 1)$q$, 'issuing offices of the company for the type, most used first, case folded (T-170)');
SELECT tests.is((SELECT count(*) FROM public.crew_document_issuing_suggestions(pg_temp.ty('stcw_fpff'))), 20::bigint, 'at most 20');
SELECT tests.throws_like(format('SELECT * FROM public.crew_document_issuing_suggestions(%L)', tests.id('type:B.own')), 'P0002', 'document_type_not_found', 'another company''s type: P0002');
SELECT tests.as_user(tests.user_id('A.bosun'));
SELECT tests.ok((SELECT count(*) FROM public.crew_document_issuing_suggestions(pg_temp.ty('stcw_basic_safety'))) = 2, 'a person with crew uploads on gets suggestions');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.throws_like(format('SELECT * FROM public.crew_document_issuing_suggestions(%L)', pg_temp.ty('stcw_basic_safety')), '42501', 'crew_not_permitted',
  'a crew member who may add nothing: 42501');

SELECT tests.as_user(tests.user_id('A.bosun'));
SELECT tests.results_eq(format('SELECT * FROM public.crew_document_rights(%L)', tests.profile_id('A.bosun')), $q$VALUES (true, true, true, true, true)$q$,
  'rights, the person with crew uploads on: view, add, change, own, uploads on');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.results_eq(format('SELECT * FROM public.crew_document_rights(%L)', tests.profile_id('A.crew_hyd')), $q$VALUES (true, false, false, true, false)$q$,
  'HYDRA has crew uploads off: the person only views');
SELECT tests.as_user(tests.user_id('A.viewer'));
SELECT tests.results_eq(format('SELECT * FROM public.crew_document_rights(%L)', tests.profile_id('A.bosun')), $q$VALUES (true, false, false, false, true)$q$, 'a viewer views');
SELECT tests.as_user(tests.user_id('A.editor'));
SELECT tests.results_eq(format('SELECT * FROM public.crew_document_rights(%L)', tests.profile_id('A.bosun')), $q$VALUES (true, true, true, false, true)$q$, 'an editor adds and changes');
SELECT tests.as_user(tests.user_id('A.profile_only'));
SELECT tests.results_eq(format('SELECT * FROM public.crew_document_rights(%L)', tests.profile_id('A.bosun')), $q$VALUES (false, false, false, false, true)$q$,
  'seeing the profile only: nothing');
SELECT tests.as_user(tests.user_id('A.ext'));
SELECT tests.results_eq(format('SELECT can_view, can_add FROM public.crew_document_rights(%L)', tests.profile_id('A.bosun')), $q$VALUES (false, false)$q$, 'an external viewer: nothing');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(format('SELECT * FROM public.crew_document_rights(%L)', tests.profile_id('A.bosun')), 'P0002', 'profile_not_found', 'another tenant''s person: P0002');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 10. crew_document_record_from_source (TR9)

CREATE TEMP TABLE tr9 (k text PRIMARY KEY, id uuid) ON COMMIT DROP;
INSERT INTO tr9 SELECT 'r1', public.crew_document_record_from_source(tests.profile_id('A.crew_hyd'), pg_temp.ty('stcw_pscrb'), current_date - 10, current_date + 1800, 'training', tests.id('ref:1'));
SELECT tests.results_eq(
  $q$SELECT document_type_id, issue_date, expiry_date, no_expiry, source, external_ref, details -> 'source_refs', user_id, company_id FROM public.crew_certificates WHERE id = (SELECT id FROM tr9 WHERE k = 'r1')$q$,
  $q$VALUES (md5('storm.crew_document_type.stcw_pscrb')::uuid, current_date - 10, current_date + 1800, false, 'training', tests.id('ref:1')::text,
            jsonb_build_array('training:' || tests.id('ref:1')::text), tests.user_id('A.crew_hyd'), tests.company_id('A'))$q$,
  'TR9: a completed course creates the person''s qualification with the course''s expiry');
SELECT tests.is(public.crew_document_record_from_source(tests.profile_id('A.crew_hyd'), pg_temp.ty('stcw_pscrb'), current_date - 10, current_date + 1800, 'training', tests.id('ref:1')),
  (SELECT id FROM tr9 WHERE k = 'r1'), 'the same completion again returns the same document');
SELECT tests.is((SELECT count(*) FROM public.crew_certificates WHERE profile_id = tests.profile_id('A.crew_hyd') AND document_type_id = pg_temp.ty('stcw_pscrb')), 1::bigint, 'and adds nothing (idempotent)');
UPDATE public.crew_certificates SET verification_status = 'verified', verified_at = now(), certificate_number = 'PS-OLD', file_url = 'a/crew/legacy/pscrb.pdf'
WHERE id = (SELECT id FROM tr9 WHERE k = 'r1');
SELECT tests.is(public.crew_document_record_from_source(tests.profile_id('A.crew_hyd'), pg_temp.ty('stcw_pscrb'), current_date, current_date + 1900, 'training', tests.id('ref:2')),
  (SELECT id FROM tr9 WHERE k = 'r1'), 'a later completion renews the same document');
SELECT tests.results_eq(
  $q$SELECT expiry_date, certificate_number, file_url, verification_status, external_ref, jsonb_array_length(details -> 'source_refs')
     FROM public.crew_certificates WHERE id = (SELECT id FROM tr9 WHERE k = 'r1')$q$,
  $q$VALUES (current_date + 1900, NULL::text, NULL::text, 'unverified', tests.id('ref:2')::text, 2)$q$,
  'new dates, no number or file for the new period, verification reset, both references recorded');
-- The replaced values: X1-05's version row once 20261124060500 is built (it
-- edits this function in place), else details.replaced.
CREATE OR REPLACE FUNCTION pg_temp.tr9_replaced(p_id uuid) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE
  v text;
BEGIN
  IF to_regclass('public.crew_document_versions') IS NOT NULL THEN
    EXECUTE 'SELECT number || ''|'' || expiry_date::text FROM public.crew_document_versions WHERE crew_document_id = $1 ORDER BY version_no DESC LIMIT 1'
      INTO v USING p_id;
  ELSE
    SELECT (cc.details -> 'replaced' ->> 'number') || '|' || (cc.details -> 'replaced' ->> 'expiry_date') INTO v FROM public.crew_certificates AS cc WHERE cc.id = p_id;
  END IF;
  RETURN v;
END;
$f$;
SELECT tests.is(pg_temp.tr9_replaced((SELECT id FROM tr9 WHERE k = 'r1')), 'PS-OLD|' || (current_date + 1800)::text,
  'the old number and expiry are kept (a crew_document_versions row with X1-05, else details.replaced)');
SELECT tests.is(public.crew_document_record_from_source(tests.profile_id('A.crew_hyd'), pg_temp.ty('stcw_pscrb'), current_date - 400, current_date + 100, 'training', tests.id('ref:3')),
  (SELECT id FROM tr9 WHERE k = 'r1'), 'an older completion is recorded on the same document');
SELECT tests.results_eq($q$SELECT expiry_date, jsonb_array_length(details -> 'source_refs') FROM public.crew_certificates WHERE id = (SELECT id FROM tr9 WHERE k = 'r1')$q$,
  $q$VALUES (current_date + 1900, 3)$q$, 'and changes no date');
INSERT INTO tr9 SELECT 'nx', public.crew_document_record_from_source(tests.profile_id('A.pending'), pg_temp.ty('stcw_psa'), current_date - 1, NULL, 'training', tests.id('ref:4'));
SELECT tests.results_eq($q$SELECT no_expiry, expiry_date, user_id FROM public.crew_certificates WHERE id = (SELECT id FROM tr9 WHERE k = 'nx')$q$,
  $q$VALUES (true, NULL::date, NULL::uuid)$q$, 'a course without a validity gives a no-expiry document, a person without a login included');
SELECT tests.throws_like(format('SELECT public.crew_document_record_from_source(%L, %L, current_date, current_date + 10, %L, %L)', tests.profile_id('A.bosun'), tests.id('type:B.own'), 'training', tests.id('ref:5')),
  'P0002', 'document_type_not_found', 'another company''s type: P0002');
SELECT tests.throws_like(format('SELECT public.crew_document_record_from_source(%L, %L, current_date, current_date + 10, %L, %L)', tests.id('profile:nobody'), pg_temp.ty('stcw_pst'), 'training', tests.id('ref:5')),
  'P0002', 'profile_not_found', 'an unknown person: P0002');
SELECT tests.throws_like(format('SELECT public.crew_document_record_from_source(%L, %L, current_date, current_date + 10, %L, %L)', tests.profile_id('A.bosun'), pg_temp.ty('stcw_pst'), 'manual', tests.id('ref:5')),
  '22023', 'source_invalid', 'the source is training, import or registry');
SELECT tests.throws_like(format('SELECT public.crew_document_record_from_source(%L, %L, current_date, current_date + 10, %L, NULL)', tests.profile_id('A.bosun'), pg_temp.ty('stcw_pst'), 'training'),
  '22023', 'source_ref_required', 'a reference is required');
SELECT tests.throws_like(format('SELECT public.crew_document_record_from_source(%L, %L, current_date, current_date - 10, %L, %L)', tests.profile_id('A.bosun'), pg_temp.ty('stcw_pst'), 'training', tests.id('ref:5')),
  '22023', 'field_invalid', 'an expiry before the issue date');
-- Under a JWT (X5's definer runs as owner with the caller's JWT): the caller must be active and of the person's company.
SELECT tests.as_user(tests.user_id('B.admin'));
RESET ROLE;
SELECT tests.throws_like(format('SELECT public.crew_document_record_from_source(%L, %L, current_date, current_date + 10, %L, %L)', tests.profile_id('A.bosun'), pg_temp.ty('stcw_pst'), 'training', tests.id('ref:6')),
  '42501', 'crew_not_permitted', 'a caller of another company: 42501');
SELECT tests.as_user(tests.user_id('A.disabled'));
RESET ROLE;
SELECT tests.throws_like(format('SELECT public.crew_document_record_from_source(%L, %L, current_date, current_date + 10, %L, %L)', tests.profile_id('A.bosun'), pg_temp.ty('stcw_pst'), 'training', tests.id('ref:6')),
  '42501', 'crew_not_permitted', 'an inactive caller: 42501');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
RESET ROLE;
SELECT tests.lives(format('SELECT public.crew_document_record_from_source(%L, %L, current_date, current_date + 10, %L, %L)', tests.profile_id('A.bosun'), pg_temp.ty('stcw_pst'), 'training', tests.id('ref:6')),
  'a caller of the person''s company: recorded');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws(format('SELECT public.crew_document_record_from_source(%L, %L, current_date, current_date + 10, %L, %L)', tests.profile_id('A.bosun'), pg_temp.ty('stcw_pst'), 'training', tests.id('ref:7')),
  '42501', 'the browser cannot call it (service role only)');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 11. the expiry source

SELECT tests.results_eq(
  $q$SELECT source_key, item_type, view_name, read_area, owner_doc, is_active FROM public.expiry_sources WHERE source_key IN ('crew_documents', 'crew_certificates_legacy', 'profile_identity_legacy')$q$,
  $q$VALUES ('crew_documents', 'crew_document', 'expiry_src_crew_documents', 'crew_documents', 'gap/04', true),
            ('crew_certificates_legacy', 'crew_qualification', 'expiry_src_crew_certificates', 'crew_documents', 'gap/02', false),
            ('profile_identity_legacy', 'passport', 'expiry_src_profile_identity', 'crew_documents', 'gap/02', false)$q$,
  'the crew documents source is registered and X5''s two legacy crew sources are inactive');
SELECT tests.results_eq(
  $q$SELECT attname::text FROM pg_attribute WHERE attrelid = 'public.expiry_src_crew_documents'::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attnum$q$,
  $q$VALUES ('source_key'), ('item_type'), ('record_id'), ('company_id'), ('vessel_id'), ('profile_id'), ('label'), ('detail'), ('certificate_type_id'),
            ('expires_on'), ('no_expiry'), ('endorsement_due_on'), ('alerts_muted'), ('link_scope'), ('link_rel')$q$,
  'the view has X5''s source contract columns, in order');
SELECT tests.results_eq(
  $q$SELECT item_type, label, detail, vessel_id, expires_on, link_scope, link_rel FROM public.expiry_src_crew_documents WHERE profile_id = tests.profile_id('A.crew_hyd') AND item_type IN ('passport', 'visa')$q$,
  $q$VALUES ('passport', 'Passport', 'Malta', tests.vessel_id('A.hyd'), current_date + 300, 'vessel', 'crew/people/' || tests.profile_id('A.crew_hyd')::text || '/documents'),
            ('visa', 'Visa', NULL::text, tests.vessel_id('A.hyd'), current_date + 100, 'vessel', 'crew/people/' || tests.profile_id('A.crew_hyd')::text || '/documents')$q$,
  'a passport and a visa document: the person''s vessel, the issuing country (never the number), a link to their Documents tab');
SELECT tests.is_empty($q$SELECT * FROM public.expiry_src_crew_documents WHERE record_id IN (tests.id('cert:nodate'), tests.id('cert:odd'), tests.id('cert:eng1'))$q$,
  'a missing date and a removed document are no expiry items');
SELECT tests.is((SELECT count(*) FROM public.expiry_src_crew_documents WHERE profile_id = tests.profile_id('A.bosun') AND certificate_type_id = pg_temp.ty('stcw_pst')), 1::bigint,
  'the latest document of a type per person and issuing country');
SELECT tests.is((SELECT expires_on FROM public.expiry_src_crew_documents WHERE profile_id = tests.profile_id('A.bosun') AND certificate_type_id = pg_temp.ty('stcw_pst')),
  current_date + 1000, '(the latest of the bosun''s PST documents: the retyped certificate)');
SELECT tests.is((SELECT link_rel FROM public.expiry_src_crew_documents WHERE profile_id = tests.profile_id('A.bosun') AND certificate_type_id = pg_temp.ty('stcw_pst')),
  'crew/people/' || tests.profile_id('A.bosun')::text || '/stcw', 'an STCW certificate links to the STCW tab');
UPDATE public.profiles SET passport_expiry = current_date + 40, passport_country = 'Spain' WHERE id = tests.profile_id('A.fleet_manager');
SELECT tests.results_eq($q$SELECT record_id, item_type, expires_on FROM public.expiry_src_crew_documents WHERE profile_id = tests.profile_id('A.fleet_manager')$q$,
  $q$VALUES (tests.profile_id('A.fleet_manager'), 'passport', current_date + 40)$q$, 'a passport date on a profile with no passport document stays an expiry item');
SELECT tests.ok(
  (SELECT count(*) FROM public.fleet_expiry_rows_for(tests.user_id('A.fleet_manager'), tests.company_id('A'), NULL, NULL, true, current_date) WHERE source_key = 'crew_documents') > 10
  AND NOT EXISTS (SELECT 1 FROM public.fleet_expiry_rows_for(tests.user_id('A.fleet_manager'), tests.company_id('A'), NULL, NULL, true, current_date)
                  WHERE source_key IN ('crew_certificates_legacy', 'profile_identity_legacy')),
  'X5''s engine reads crew documents through the new source and no longer through the legacy two');
INSERT INTO public.crew_certificates (id, profile_id, certificate_type, certificate_name, document_type_id, expiry_date)
VALUES (tests.id('cert:viewer_aff'), tests.profile_id('A.viewer'), 'x', 'x', pg_temp.ty('stcw_aff'), current_date + 15),
       (tests.id('cert:viewer_frb'), tests.profile_id('A.viewer'), 'x', 'x', pg_temp.ty('stcw_frb'), current_date);
SELECT tests.results_eq(
  $q$SELECT record_id, window_days, bucket, days_remaining FROM public.fleet_expiry_rows_for(tests.user_id('A.fleet_manager'), tests.company_id('A'), NULL, ARRAY['crew_documents'], true, current_date)
     WHERE record_id IN (tests.id('cert:viewer_aff'), tests.id('cert:viewer_frb'))$q$,
  $q$VALUES (tests.id('cert:viewer_aff'), 14, 'valid', 15), (tests.id('cert:viewer_frb'), 0, 'expiring_soon', 0)$q$,
  'and applies the type''s window rules (14 days, zero) as crew_documents_for_profile does');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.denied('SELECT * FROM public.expiry_src_crew_documents', 'the browser does not read the source view');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 12. the storage predicates

CREATE OR REPLACE FUNCTION pg_temp.doc_path(p_profile text) RETURNS text LANGUAGE sql AS $$
  SELECT tests.company_id('A')::text || '/crew/' || tests.profile_id(p_profile)::text || '/documents/' || '0b1c2d3e-0000-4000-8000-0000000000aa-scan.pdf'
$$;
CREATE TEMP TABLE storage_case (persona text, subject text, can_read boolean, can_write boolean) ON COMMIT DROP;
INSERT INTO storage_case VALUES
  ('A.bosun', 'A.bosun', true, true), ('A.bosun', 'A.viewer', false, false),
  ('A.viewer', 'A.bosun', true, false), ('A.editor', 'A.bosun', true, true), ('A.editor', 'A.pending', true, true),
  ('A.crew_hyd', 'A.bosun', false, false), ('A.crew_hyd', 'A.crew_hyd', true, false),
  ('A.hr', 'A.crew_hyd', true, true), ('A.ext', 'A.bosun', false, false), ('A.disabled', 'A.disabled', false, false);
GRANT SELECT ON storage_case TO PUBLIC;
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT * FROM storage_case ORDER BY persona, subject LOOP
    PERFORM tests.is(public.crew_document_file_readable(tests.user_id(c.persona), tests.profile_id(c.subject)), c.can_read,
                     format('crew_document_file_readable(%s, %s) is %s', c.persona, c.subject, c.can_read));
    PERFORM tests.is(public.crew_document_file_writable(tests.user_id(c.persona), tests.profile_id(c.subject)), c.can_write,
                     format('crew_document_file_writable(%s, %s) is %s', c.persona, c.subject, c.can_write));
    PERFORM tests.as_user(tests.user_id(c.persona));
    PERFORM tests.is(public.storage_crew_document_allowed(pg_temp.doc_path(c.subject), false), c.can_read,
                     format('the documents bucket gate lets %s read %s''s files: %s', c.persona, c.subject, c.can_read));
    PERFORM tests.is(public.storage_crew_document_allowed(pg_temp.doc_path(c.subject), true), c.can_write,
                     format('and write: %s', c.can_write));
    PERFORM tests.reset_role();
  END LOOP;
END
$$;
SELECT tests.ok(NOT public.crew_document_file_readable(NULL, tests.profile_id('A.bosun')) AND NOT public.crew_document_file_writable(tests.user_id('A.hr'), NULL)
                AND NOT public.crew_document_may_write(tests.user_id('A.hr'), tests.profile_id('A.bosun'), 'approve'),
                'NULL ids and unknown actions: false');
SELECT tests.ok(NOT public.crew_document_file_readable(tests.user_id('B.admin'), tests.profile_id('A.bosun')) AND NOT public.crew_document_file_writable(tests.user_id('B.admin'), tests.profile_id('A.bosun')),
                'another tenant: false');

-- ------------------------------------------------------------ 13. vessel_crew_settings

SELECT tests.results_eq($q$SELECT company_id, crew_uploads_enabled, is_passenger_ship, transfer_requires_fleet_approval FROM public.vessel_crew_settings WHERE vessel_id = tests.vessel_id('A.dra')$q$,
  $q$VALUES (tests.company_id('A'), true, false, false)$q$, 'the settings row carries its vessel''s company (filled) and defaults to off');
SELECT tests.throws_like(format($q$INSERT INTO public.vessel_crew_settings (vessel_id, company_id) VALUES (%L, %L)$q$, tests.vessel_id('A.hyd'), tests.company_id('B')), '23514',
  'vessel_crew_settings_scope_mismatch', 'never another company''s');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.results_eq($q$SELECT vessel_id FROM public.vessel_crew_settings$q$, $q$VALUES (tests.vessel_id('A.dra'))$q$, 'read with the crew list of the vessel (the master)');
SELECT tests.as_user(tests.user_id('A.bosun'));
SELECT tests.is_empty($q$SELECT * FROM public.vessel_crew_settings$q$, 'not by a crew member without it');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.denied(format($q$UPDATE public.vessel_crew_settings SET crew_uploads_enabled = false WHERE vessel_id = %L$q$, tests.vessel_id('A.dra')),
  'no browser write (X1-06''s definer writes)');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is_empty($q$SELECT * FROM public.vessel_crew_settings$q$, 'another tenant reads none');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 14. grants

SELECT tests.ok(has_function_privilege('authenticated', 'public.crew_documents_for_profile(uuid)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.crew_document_rights(uuid)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.crew_document_save(uuid, uuid, uuid, jsonb)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.crew_document_delete(uuid, text)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.crew_document_issuing_suggestions(uuid)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.crew_document_visible_profile_ids()', 'EXECUTE'),
                'the browser RPCs and the RLS set are executable by authenticated');
SELECT tests.is_empty($q$
  SELECT f FROM unnest(ARRAY['public.crew_document_record_from_source(uuid, uuid, date, date, text, uuid)', 'public.crew_document_file_readable(uuid, uuid)',
    'public.crew_document_file_writable(uuid, uuid)', 'public.crew_document_may_write(uuid, uuid, text)', 'public.crew_document_type_satisfiers(uuid, uuid)',
    'public.crew_document_type_for_legacy(uuid, text, text)', 'public.crew_document_legacy_key(text)', 'public.crew_document_passport_mirror(uuid, boolean)',
    'public.crew_document_catalogue_backfill()']) AS f
  WHERE has_function_privilege('authenticated', f, 'EXECUTE') OR NOT has_function_privilege('service_role', f, 'EXECUTE')$q$,
  'the internals are the service role''s only (TR9 and the storage predicates included)');
SELECT tests.is_empty($q$
  SELECT f FROM unnest(ARRAY['public.crew_certificates_guard()', 'public.crew_certificates_passport_sync()', 'public.crew_document_types_scope_guard()',
    'public.crew_document_type_satisfies_scope_guard()', 'public.crew_document_type_legacy_map_scope_guard()', 'public.vessel_crew_settings_scope_guard()']) AS f
  WHERE has_function_privilege('authenticated', f, 'EXECUTE') OR has_function_privilege('service_role', f, 'EXECUTE')$q$,
  'trigger functions are executable by nobody');
SELECT tests.is_empty($q$
  SELECT f FROM pg_proc AS p, LATERAL (SELECT p.oid::regprocedure::text AS f) AS x
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'crew_document%' AND has_function_privilege('anon', p.oid, 'EXECUTE')$q$,
  'anon executes no crew document function');
SELECT tests.is_empty($q$
  SELECT r FROM unnest(ARRAY['public.crew_document_categories', 'public.crew_document_types', 'public.crew_document_type_satisfies', 'public.crew_document_type_legacy_map',
    'public.vessel_crew_settings', 'public.expiry_src_crew_documents']) AS r
  WHERE has_table_privilege('anon', r, 'SELECT, INSERT, UPDATE, DELETE')$q$, 'anon holds nothing on the new relations');
SELECT tests.ok(NOT has_table_privilege('authenticated', 'public.crew_document_type_legacy_map', 'SELECT')
                AND NOT has_table_privilege('authenticated', 'public.expiry_src_crew_documents', 'SELECT')
                AND NOT has_table_privilege('authenticated', 'public.crew_document_types', 'INSERT')
                AND has_table_privilege('authenticated', 'public.crew_document_types', 'SELECT'),
                'authenticated reads the catalogue, writes none of it, and reads neither the legacy map nor the source view');
SELECT tests.as_user(tests.user_id('A.bosun'));
SELECT tests.results_eq($q$SELECT count(*) FROM public.crew_document_types$q$, $q$VALUES (207::bigint)$q$, 'an active user reads the system types and their company''s (the retired one included)');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is_empty($q$SELECT * FROM public.crew_document_categories$q$, 'an inactive user reads no category');
SELECT tests.is_empty($q$SELECT * FROM public.crew_document_types$q$, 'no type');
SELECT tests.reset_role();
