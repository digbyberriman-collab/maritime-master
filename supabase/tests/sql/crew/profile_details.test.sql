-- The crew profile's server side (X1-03, 20261124060300_crew_profile_details.sql;
-- gap/04 C16, C17, C19, C20, C21, W1, T-68; DECISIONS D-X1-2, D-X1-13,
-- D-X1-19, D-199, D-225, D-229, D-233, D-246):
--   1. the pure helpers: crew_phone_split (the cases of
--      src/test/crew/phone.test.ts, which asserts them on the TS mirror) and
--      crew_country_from_text;
--   2. the backfill from profiles (date and place of birth, phone split,
--      nationality to a code, sex, embarkation port), idempotent;
--   3. visibility: crew_profile_visible per persona (own, a crew_profiles.view
--      holder on the vessel with and without the capability, another vessel,
--      a planned joiner and a pending placement, an ended crew member, HR,
--      another tenant, inactive, external) and crew_visible_profile_ids equal
--      to it for every persona;
--   4. RLS on crew_personal_details, crew_languages and crew_assignment_terms
--      (the same matrix; no browser writes; anon nothing);
--   5. crew_profile_resolve: by profiles.id and by a legacy login id, P0002
--      for an invisible, unknown or foreign person and a foreign vessel;
--   6. crew_profile_summary: header, status, the switcher in rank order,
--      rights and tabs; gates;
--   7. crew_personal_details_save: field groups (own self fields, identity
--      locked without an editor, editor on the vessel, HR), merge semantics,
--      names on profiles, refusals (unknown key, invalid values, future
--      birth date, crew number taken, unknown country), the audit row;
--   8. crew_languages_save: replace, rules, gate;
--   9. crew_onboarding_save: gate (create on the vessel; wrong vessel and
--      other company refused), terms rules, the advisory assignment link,
--      second save updates, fill-only personal details;
--  9b. a new employment (an inserted terms row) opens one draft contract
--      and an On board period (D-375): never on the update path, an existing
--      draft or active contract is not duplicated, a later confirmed period
--      skips the period, a tenant contract key maps to rotational, and with
--      planner_period_write missing the period is skipped cleanly;
--  10. crew_find_duplicates: email, name, name and date of birth, the
--      company only, gate;
--  11. integrity guards and the next-of-kin columns (T-68);
--  12. grants (the internals are not executable by authenticated; anon has
--      nothing), since the platform ACL inventory reads the fragment too.

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ 1. pure helpers

-- The same cases as src/test/crew/phone.test.ts (splitLegacyPhone).
CREATE TEMP TABLE phone_case (raw text, dial text, national_number text) ON COMMIT DROP;
INSERT INTO phone_case VALUES
  ('+44 7700 900123', '44', '7700900123'),
  ('+44 (0)7700 900123', '44', '7700900123'),
  ('0044 20 7946 0000', '44', '2079460000'),
  ('+1 876 555 0101', '1876', '5550101'),
  ('+1 (212) 555-0100', '1', '2125550100'),
  ('+33 6 12 34 56 78', '33', '612345678'),
  ('+590 690 12 34 56', '590', '690123456'),
  ('+7 912 345-67-89', '7', '9123456789'),
  ('07700 900123', NULL, '07700900123'),
  ('  612.34.56.78 ', NULL, '612345678'),
  ('+999 1234 5678', NULL, NULL),
  ('+44 12', NULL, NULL),
  ('123', NULL, NULL),
  ('+44 1234 5678 9012 3456 78901', NULL, NULL),
  ('+44 1234 5678 9012 3456 7890', '44', '12345678901234567890'),
  ('', NULL, NULL),
  (NULL, NULL, NULL);
SELECT tests.is_empty(
  $q$SELECT c.raw FROM phone_case AS c
     LEFT JOIN LATERAL public.crew_phone_split(c.raw) AS s ON true
     WHERE s.dial_code IS DISTINCT FROM c.dial OR s.national_number IS DISTINCT FROM c.national_number$q$,
  'crew_phone_split gives the expected dial code and national number for every case (the TS mirror passes the same cases)');
SELECT tests.is((SELECT count(*) FROM public.crew_phone_split('+999 1234 5678')), 0::bigint, 'an unknown dial code: no row (left behind)');

SELECT tests.results_eq(
  $q$SELECT t, public.crew_country_from_text(t) FROM (VALUES ('British'), ('united kingdom'), ('UK'), ('Scottish'), ('Dutch'), ('FRA'), ('fr'),
       ('USA'), ('  american  '), ('Congolese'), ('Martian'), (''), (NULL)) AS x(t)$q$,
  $q$VALUES ('British', 'GB'), ('united kingdom', 'GB'), ('UK', 'GB'), ('Scottish', 'GB'), ('Dutch', 'NL'), ('FRA', 'FR'), ('fr', 'FR'),
       ('USA', 'US'), ('  american  ', 'US'), ('Congolese', NULL::text), ('Martian', NULL), ('', NULL), (NULL, NULL)$q$,
  'crew_country_from_text: name, demonym, codes and common spellings; ambiguous (Congolese) and unknown texts give NULL');

-- ------------------------------------------------------------ world (A.dra unless named)

-- Subjects.
SELECT tests.seed_user('A', 'A.bosun', 'crew');
SELECT tests.seed_assignment('A.bosun', 'A.dra', true, 'Bosun');
SELECT tests.seed_user('A', 'A.joiner', 'crew');
SELECT tests.seed_assignment('A.joiner', 'A.dra', true, 'Deckhand', jsonb_build_object('join_date', current_date + 10, 'start_date', current_date + 10));
SELECT tests.seed_user('A', 'A.ended', 'crew');
SELECT tests.seed_assignment('A.ended', 'A.dra', false, 'Deckhand');
SELECT tests.seed_profile('A', 'A.pending', 'crew', 'not_invited', NULL,
  jsonb_build_object('is_imported', true, 'imported_vessel_id', tests.vessel_id('A.dra'), 'rank', 'Deckhand'));
-- Viewers.
SELECT tests.seed_user('A', 'A.viewer', 'crew');      -- crew.view_crew_profiles, on A.dra
SELECT tests.seed_assignment('A.viewer', 'A.dra', true, 'Second Officer');
SELECT tests.seed_user('A', 'A.lister', 'crew');      -- crew.see_crew_list only, on A.dra
SELECT tests.seed_assignment('A.lister', 'A.dra', true, 'Deckhand');
SELECT tests.seed_user('A', 'A.editor', 'crew');      -- crew.view_ and edit_crew_profiles, on A.dra
SELECT tests.seed_assignment('A.editor', 'A.dra', true, 'Deckhand');
SELECT tests.seed_user('A', 'A.hr', 'crew');          -- RBAC hr edit (shore, no vessel)
SELECT tests.seed_user('A', 'A.hr_viewer', 'crew');   -- RBAC hr view (shore, no vessel)
SELECT tests.seed_user('A', 'A.ext', 'crew');         -- an external viewer of A on A.dra with crew.view_crew_profiles
SELECT tests.seed_user('B', 'B.crew', 'crew', 'active', '{"first_name": "Crew", "email": "shared-name@example.test"}');
SELECT tests.seed_assignment('B.crew', 'B.lev', true, 'Deckhand');

SELECT tests.seed_role('x1p_view', 'vessel');
SELECT tests.seed_role('x1p_list', 'vessel');
SELECT tests.seed_role('x1p_edit', 'vessel');
SELECT tests.seed_role('x1p_hr_edit', 'fleet');
SELECT tests.seed_role('x1p_hr_view', 'fleet');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, x.k, x.p::public.permission_level, 'fleet'
FROM (VALUES ('x1p_view', 'crew.view_crew_profiles', 'view'), ('x1p_list', 'crew.see_crew_list', 'view'),
             ('x1p_edit', 'crew.view_crew_profiles', 'view'), ('x1p_edit', 'crew.edit_crew_profiles', 'edit'),
             ('x1p_hr_edit', 'hr', 'edit'), ('x1p_hr_view', 'hr', 'view')) AS x(r, k, p)
JOIN public.roles AS r ON r.name = x.r;
SELECT tests.seed_rbac_role('A.viewer', 'x1p_view');
SELECT tests.seed_rbac_role('A.lister', 'x1p_list');
SELECT tests.seed_rbac_role('A.editor', 'x1p_edit');
SELECT tests.seed_rbac_role('A.hr', 'x1p_hr_edit');
SELECT tests.seed_rbac_role('A.hr_viewer', 'x1p_hr_view');
SELECT tests.seed_rbac_role('A.ext', 'x1p_view');
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'external', vessel_scope = 'assigned', fleet_access = false, source = 'admin',
    valid_from = now() - interval '1 day', valid_until = now() + interval '7 days'
WHERE user_id = tests.user_id('A.ext');
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT id, company_id, tests.vessel_id('A.dra') FROM public.account_memberships WHERE user_id = tests.user_id('A.ext');

-- Setup checks (so each answer below is the rule it claims to be).
SELECT tests.ok(public.has_capability_for(tests.user_id('A.viewer'), 'vessel.crew.crew_profiles.view', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.viewer'), 'vessel.crew.crew_profiles.view', tests.company_id('A'), tests.vessel_id('A.hyd'))
                AND NOT public.has_capability_for(tests.user_id('A.viewer'), 'vessel.crew.crew_profiles.edit', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.hr_can_view(tests.user_id('A.viewer')),
                'setup: A.viewer holds crew_profiles.view on A.dra only, no edit, no HR');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.lister'), 'vessel.crew.crew_list.view', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.lister'), 'vessel.crew.crew_profiles.view', tests.company_id('A'), tests.vessel_id('A.dra')),
                'setup: A.lister holds crew_list.view on A.dra but not crew_profiles.view');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.editor'), 'vessel.crew.crew_profiles.edit', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.editor'), 'vessel.crew.crew_profiles.create', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.hr_can_edit(tests.user_id('A.editor')),
                'setup: A.editor holds crew_profiles.edit on A.dra (not create, not HR)');
SELECT tests.ok(public.hr_can_edit(tests.user_id('A.hr')) AND NOT public.has_capability_for(tests.user_id('A.hr'), 'vessel.crew.crew_profiles.view', tests.company_id('A'), tests.vessel_id('A.dra')),
                'setup: A.hr is a legacy HR editor with no vessel reach');
SELECT tests.ok(public.hr_can_view(tests.user_id('A.hr_viewer')) AND NOT public.hr_can_edit(tests.user_id('A.hr_viewer')),
                'setup: A.hr_viewer views HR records, edits none');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.ext'), 'vessel.crew.crew_profiles.view', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.record_user_is_external(tests.user_id('A.ext'), tests.company_id('A')),
                'setup: the external viewer holds crew_profiles.view on A.dra (so the refusals below are the external rule)');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.fleet_manager'), 'vessel.crew.crew_profiles.create', tests.company_id('A'), tests.vessel_id('A.dra')),
                'setup: the fleet manager may add crew to A.dra');

-- ------------------------------------------------------------ 2. backfill

UPDATE public.profiles SET date_of_birth = DATE '1990-04-12', place_of_birth = '  Valletta ', nationality = 'British', gender = 'Male',
       phone = '+44 7700 900123', embarkation_port = 'Palma'
WHERE id = tests.profile_id('A.bosun');
UPDATE public.profiles SET nationality = 'Congolese', phone = 'call the office', gender = 'n/a', date_of_birth = current_date + 1
WHERE id = tests.profile_id('A.crew_hyd');
UPDATE public.profiles SET nationality = 'Dutch' WHERE id = tests.profile_id('A.pending');
DELETE FROM public.crew_personal_details;
SELECT tests.is(public.crew_profile_details_backfill(), 2, 'the backfill adds a row for each profile with something to carry over (bosun, pending)');
SELECT tests.results_eq(
  $q$SELECT date_of_birth, place_of_birth, nationality_code, sex, place_of_embarkation, phone_dial_code, phone_number, company_id
     FROM public.crew_personal_details WHERE profile_id = tests.profile_id('A.bosun')$q$,
  $q$VALUES (DATE '1990-04-12', 'Valletta', 'GB', 'male', 'Palma', '44', '7700900123', tests.company_id('A'))$q$,
  'the bosun''s row: birth date and place (trimmed), nationality code, sex, embarkation port, phone split into dial code and number');
SELECT tests.is((SELECT nationality_code FROM public.crew_personal_details WHERE profile_id = tests.profile_id('A.pending')), 'NL',
  'a pending placement (no login) is backfilled too');
SELECT tests.is((SELECT count(*) FROM public.crew_personal_details WHERE profile_id = tests.profile_id('A.crew_hyd')), 0::bigint,
  'nothing readable (ambiguous nationality, unreadable phone, unknown gender, a birth date in the future): no row');
SELECT tests.is(public.crew_profile_details_backfill(), 0, 'a second run adds nothing');
UPDATE public.crew_personal_details SET place_of_birth = 'Mdina' WHERE profile_id = tests.profile_id('A.bosun');
SELECT tests.is(public.crew_profile_details_backfill(), 0, 'and never touches an existing row');
SELECT tests.is((SELECT place_of_birth FROM public.crew_personal_details WHERE profile_id = tests.profile_id('A.bosun')), 'Mdina', 'the edited value stays');

-- Rows for the RLS matrix (as the superuser).
INSERT INTO public.crew_personal_details (profile_id, company_id, biography) VALUES
  (tests.profile_id('A.joiner'), tests.company_id('A'), 'Joins next week.'),
  (tests.profile_id('A.ended'), tests.company_id('A'), 'Left last month.'),
  (tests.profile_id('A.crew_hyd'), tests.company_id('A'), 'On HYDRA.'),
  (tests.profile_id('A.viewer'), tests.company_id('A'), 'Second officer.'),
  (tests.profile_id('B.crew'), tests.company_id('B'), 'On LEVIATHAN.');
INSERT INTO public.crew_languages (company_id, profile_id, slot, language_code, proficiency) VALUES
  (tests.company_id('A'), tests.profile_id('A.bosun'), 1, 'en', NULL),
  (tests.company_id('A'), tests.profile_id('A.crew_hyd'), 1, 'fr', NULL),
  (tests.company_id('B'), tests.profile_id('B.crew'), 1, 'es', NULL);
INSERT INTO public.crew_assignment_terms (id, company_id, profile_id, vessel_id, assignment_id, start_date, contract_type_key, leave_method, leave_days_per_year) VALUES
  (tests.id('terms:bosun'), tests.company_id('A'), tests.profile_id('A.bosun'), tests.vessel_id('A.dra'), tests.id('assignment:A.bosun@A.dra'), current_date - 30, 'permanent', 'days_per_year', 30),
  (tests.id('terms:b'), tests.company_id('B'), tests.profile_id('B.crew'), tests.vessel_id('B.lev'), NULL, current_date - 30, NULL, NULL, NULL);
INSERT INTO public.crew_assignment_terms (id, company_id, profile_id, vessel_id, assignment_id, start_date, contract_type_key, leave_method, leave_ratio_on, leave_ratio_off) VALUES
  (tests.id('terms:hyd'), tests.company_id('A'), tests.profile_id('A.crew_hyd'), tests.vessel_id('A.hyd'), tests.id('assignment:A.crew_hyd@A.hyd'), current_date - 30, 'rotational', 'ratio', 1, 1);

-- ------------------------------------------------------------ 3. visibility

CREATE TEMP TABLE subject_profile ON COMMIT DROP AS
SELECT tests.profile_id(k) AS id, k FROM unnest(ARRAY['A.bosun', 'A.joiner', 'A.pending', 'A.ended', 'A.crew_hyd', 'A.viewer', 'A.lister', 'B.crew']) AS k;
GRANT SELECT ON subject_profile TO authenticated;
CREATE TEMP TABLE visibility_case (persona text, subject text, visible boolean) ON COMMIT DROP;
INSERT INTO visibility_case
SELECT x.persona, s.k, s.k = ANY (x.sees)
FROM subject_profile AS s,
     (VALUES ('A.fleet_manager', ARRAY['A.bosun', 'A.joiner', 'A.pending', 'A.ended', 'A.crew_hyd', 'A.viewer', 'A.lister']),
             ('A.viewer', ARRAY['A.bosun', 'A.joiner', 'A.pending', 'A.viewer', 'A.lister']),
             ('A.editor', ARRAY['A.bosun', 'A.joiner', 'A.pending', 'A.viewer', 'A.lister']),
             ('A.lister', ARRAY['A.lister']),
             ('A.crew_hyd', ARRAY['A.crew_hyd']),
             ('A.hr', ARRAY['A.bosun', 'A.joiner', 'A.pending', 'A.ended', 'A.crew_hyd', 'A.viewer', 'A.lister']),
             ('A.hr_viewer', ARRAY['A.bosun', 'A.joiner', 'A.pending', 'A.ended', 'A.crew_hyd', 'A.viewer', 'A.lister']),
             ('A.ext', ARRAY[]::text[]),
             ('A.disabled', ARRAY[]::text[]),
             ('B.admin', ARRAY['B.crew'])) AS x(persona, sees);
GRANT SELECT ON visibility_case TO authenticated;
DO $$
DECLARE p text; r record; v boolean; v_missing bigint; v_extra bigint;
BEGIN
  FOR p IN SELECT DISTINCT persona FROM visibility_case ORDER BY persona LOOP
    PERFORM tests.as_user(tests.user_id(p));
    FOR r IN SELECT c.subject, c.visible, s.id FROM visibility_case AS c JOIN subject_profile AS s ON s.k = c.subject WHERE c.persona = p ORDER BY c.subject LOOP
      v := public.crew_profile_visible(r.id);
      PERFORM tests.is(v, r.visible, format('crew_profile_visible as %s: %s is %s', p, r.subject, CASE WHEN r.visible THEN 'visible' ELSE 'not visible' END));
    END LOOP;
    -- The set equals the boolean over every subject (and nothing beyond the persona's own and the subjects).
    SELECT count(*) INTO v_missing FROM subject_profile AS s
    WHERE public.crew_profile_visible(s.id) AND s.id NOT IN (SELECT public.crew_visible_profile_ids());
    SELECT count(*) INTO v_extra FROM subject_profile AS s
    WHERE NOT public.crew_profile_visible(s.id) AND s.id IN (SELECT public.crew_visible_profile_ids());
    PERFORM tests.ok(v_missing = 0 AND v_extra = 0, format('crew_visible_profile_ids as %s equals crew_profile_visible over the subjects', p));
  END LOOP;
END
$$;
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.ext'));
SELECT tests.ok(public.crew_profile_visible(tests.profile_id('A.ext')), 'an external viewer sees their own profile');
SELECT tests.results_eq($q$SELECT public.crew_visible_profile_ids()$q$, $q$VALUES (tests.profile_id('A.ext'))$q$, 'and only that');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.ok(NOT public.crew_profile_visible(tests.profile_id('A.disabled')), 'an inactive caller does not even see their own profile');
SELECT tests.is_empty($q$SELECT public.crew_visible_profile_ids()$q$, 'and the set is empty');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.ok(NOT public.crew_profile_visible(tests.id('profile:nobody')) AND NOT public.crew_profile_visible(NULL), 'unknown and NULL ids: not visible');
SELECT tests.reset_role();
SELECT tests.ok(NOT public.crew_profile_visible(tests.profile_id('A.bosun')), 'without a JWT: not visible');
SELECT tests.is_empty($q$SELECT public.crew_visible_profile_ids()$q$, 'and the set is empty');
SELECT tests.results_eq(
  $q$SELECT s FROM public.crew_profile_structural_vessels(tests.profile_id('A.joiner')) AS s
     UNION ALL SELECT s FROM public.crew_profile_structural_vessels(tests.profile_id('A.pending')) AS s$q$,
  $q$VALUES (tests.vessel_id('A.dra')), (tests.vessel_id('A.dra'))$q$,
  'structural set: a planned joiner and a pending placement belong to A.dra');
SELECT tests.is_empty($q$SELECT * FROM public.crew_profile_structural_vessels(tests.profile_id('A.ended'))$q$, 'an ended crew member has no structural vessel');

-- ------------------------------------------------------------ 4. RLS

SELECT tests.as_user(tests.user_id('A.viewer'));
SELECT tests.results_eq($q$SELECT profile_id FROM public.crew_personal_details ORDER BY profile_id$q$,
  $q$SELECT tests.profile_id(k) FROM unnest(ARRAY['A.bosun', 'A.joiner', 'A.pending', 'A.viewer']) AS k ORDER BY 1$q$,
  'details: a crew_profiles.view holder on A.dra reads A.dra''s crew (current, planned, pending) and their own; not the ended, not HYDRA''s');
SELECT tests.results_eq($q$SELECT profile_id FROM public.crew_languages$q$, $q$VALUES (tests.profile_id('A.bosun'))$q$, 'languages: the same rule');
SELECT tests.results_eq($q$SELECT id FROM public.crew_assignment_terms$q$, $q$VALUES (tests.id('terms:bosun'))$q$, 'terms: A.dra''s only');
SELECT tests.as_user(tests.user_id('A.lister'));
SELECT tests.is_empty($q$SELECT * FROM public.crew_personal_details$q$, 'without crew_profiles.view a crew-list holder reads no one''s details (and has none of their own)');
SELECT tests.is_empty($q$SELECT * FROM public.crew_assignment_terms$q$, 'nor terms');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.results_eq($q$SELECT profile_id FROM public.crew_personal_details$q$, $q$VALUES (tests.profile_id('A.crew_hyd'))$q$, 'a crew member reads their own details');
SELECT tests.results_eq($q$SELECT language_code FROM public.crew_languages$q$, $q$VALUES ('fr')$q$, 'and their own languages');
SELECT tests.results_eq($q$SELECT id FROM public.crew_assignment_terms$q$, $q$VALUES (tests.id('terms:hyd'))$q$, 'and their own terms');
SELECT tests.as_user(tests.user_id('A.hr'));
SELECT tests.results_eq($q$SELECT count(*) FROM public.crew_personal_details$q$, $q$VALUES (6::bigint)$q$, 'a legacy HR editor reads every A row (and none of B)');
SELECT tests.results_eq($q$SELECT id FROM public.crew_assignment_terms ORDER BY id$q$,
  $q$SELECT unnest(ARRAY[tests.id('terms:bosun'), tests.id('terms:hyd')]) ORDER BY 1$q$, 'and every A terms row');
SELECT tests.as_user(tests.user_id('A.ext'));
SELECT tests.is_empty($q$SELECT * FROM public.crew_personal_details$q$, 'an external viewer reads no details');
SELECT tests.is_empty($q$SELECT * FROM public.crew_assignment_terms$q$, 'nor terms, although the capability answers true on A.dra');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is_empty($q$SELECT * FROM public.crew_personal_details$q$, 'an inactive caller reads nothing');
SELECT tests.is_empty($q$SELECT * FROM public.crew_languages$q$, 'no languages');
SELECT tests.is_empty($q$SELECT * FROM public.crew_assignment_terms$q$, 'no terms');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.results_eq($q$SELECT profile_id FROM public.crew_personal_details$q$, $q$VALUES (tests.profile_id('B.crew'))$q$, 'another tenant reads only its own rows');
SELECT tests.results_eq($q$SELECT id FROM public.crew_assignment_terms$q$, $q$VALUES (tests.id('terms:b'))$q$, 'and its own terms');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.denied(format($q$INSERT INTO public.crew_personal_details (profile_id, company_id) VALUES (%L, %L)$q$, tests.profile_id('A.lister'), tests.company_id('A')),
  'the browser cannot insert details (no grant)');
SELECT tests.denied(format($q$UPDATE public.crew_personal_details SET biography = 'x' WHERE profile_id = %L$q$, tests.profile_id('A.bosun')), 'nor update them');
SELECT tests.denied(format($q$DELETE FROM public.crew_languages WHERE profile_id = %L$q$, tests.profile_id('A.bosun')), 'nor delete languages');
SELECT tests.denied(format($q$UPDATE public.crew_assignment_terms SET review_date = current_date WHERE id = %L$q$, tests.id('terms:bosun')), 'nor update terms');
SELECT tests.as_anon();
SELECT tests.denied('SELECT * FROM public.crew_personal_details', 'anon reads no details (no grant)');
SELECT tests.denied('SELECT * FROM public.crew_languages', 'no languages');
SELECT tests.denied('SELECT * FROM public.crew_assignment_terms', 'no terms');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 5. crew_profile_resolve

SELECT tests.as_user(tests.user_id('A.viewer'));
SELECT tests.is(public.crew_profile_resolve(tests.vessel_id('A.dra'), tests.profile_id('A.bosun')), tests.profile_id('A.bosun'), 'resolve: a profiles.id answers itself');
SELECT tests.is(public.crew_profile_resolve(tests.vessel_id('A.dra'), tests.user_id('A.bosun')), tests.profile_id('A.bosun'),
  'resolve: a legacy login id answers the profiles.id (D-X1-19)');
SELECT tests.is(public.crew_profile_resolve(tests.vessel_id('A.hyd'), tests.user_id('A.bosun')), tests.profile_id('A.bosun'),
  'the vessel is only the page''s scope: the same person resolves from another vessel of the company');
SELECT tests.throws_like(format('SELECT public.crew_profile_resolve(%L, %L)', tests.vessel_id('A.dra'), tests.user_id('A.crew_hyd')), 'P0002', 'profile_not_found',
  'an invisible person (HYDRA''s crew) by login id: P0002, the mapping does not leak');
SELECT tests.throws_like(format('SELECT public.crew_profile_resolve(%L, %L)', tests.vessel_id('A.dra'), tests.profile_id('A.crew_hyd')), 'P0002', 'profile_not_found',
  'nor by profile id');
SELECT tests.throws_like(format('SELECT public.crew_profile_resolve(%L, %L)', tests.vessel_id('A.dra'), tests.id('profile:nobody')), 'P0002', 'profile_not_found',
  'an unknown id: the same P0002');
SELECT tests.throws_like(format('SELECT public.crew_profile_resolve(%L, %L)', tests.vessel_id('A.dra'), tests.profile_id('B.crew')), 'P0002', 'profile_not_found',
  'another tenant''s person: P0002');
SELECT tests.throws_like(format('SELECT public.crew_profile_resolve(%L, %L)', tests.vessel_id('B.lev'), tests.profile_id('A.bosun')), 'P0002', 'vessel_not_found',
  'another tenant''s vessel: P0002 vessel_not_found');
SELECT tests.throws_like(format('SELECT public.crew_profile_resolve(NULL, %L)', tests.profile_id('A.bosun')), '22023', 'ref_required', 'no vessel: 22023');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is(public.crew_profile_resolve(tests.vessel_id('A.hyd'), tests.user_id('A.crew_hyd')), tests.profile_id('A.crew_hyd'), 'anyone resolves their own login id');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws(format('SELECT public.crew_profile_resolve(%L, %L)', tests.vessel_id('A.dra'), tests.profile_id('A.disabled')), 'P0002',
  'an inactive caller resolves nothing (not even themselves)');
SELECT tests.as_anon();
SELECT tests.denied(format('SELECT public.crew_profile_resolve(%L, %L)', tests.vessel_id('A.dra'), tests.profile_id('A.bosun')), 'anon cannot call crew_profile_resolve');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 6. crew_profile_summary

UPDATE public.crew_personal_details SET crew_number = 'DRA-0042' WHERE profile_id = tests.profile_id('A.bosun');
INSERT INTO public.crew_leave_entries (crew_id, date, status_code, company_id, vessel_id) VALUES
  (tests.user_id('A.bosun'), current_date, 'F', tests.company_id('A'), tests.vessel_id('A.dra'));
CREATE TEMP TABLE dra_members ON COMMIT DROP AS SELECT count(*)::integer AS n FROM public.crew_vessel_members(tests.vessel_id('A.dra'), current_date);
GRANT SELECT ON dra_members TO authenticated;
SELECT tests.is((SELECT n FROM dra_members), 7, 'setup: A.dra''s crew today is the master, the bosun, the joiner, the pending placement and the three viewers');
SELECT tests.as_user(tests.user_id('A.viewer'));
SELECT tests.results_eq(
  $q$SELECT profile_id, user_id, crew_number, position_name, department_key, rank_tier, on_vessel, placement_kind, status, leave_code, login_state, is_own, can_edit, can_edit_self
     FROM public.crew_profile_summary(tests.profile_id('A.bosun'), tests.vessel_id('A.dra'))$q$,
  $q$VALUES (tests.profile_id('A.bosun'), tests.user_id('A.bosun'), 'DRA-0042', 'Bosun', 'deck', 'officer', true, 'assignment', 'on_board', 'F', 'active', false, false, false)$q$,
  'the bosun seen by a viewer: crew number, catalogue position and department, on board today (day code F), no edit rights');
SELECT tests.results_eq(
  $q$SELECT on_vessel, placement_kind, status, status_detail, login_state FROM public.crew_profile_summary(tests.profile_id('A.pending'), tests.vessel_id('A.dra'))$q$,
  $q$VALUES (true, 'pending_placement', 'pending', 'pending_placement', 'pending_login')$q$,
  'a pending placement: Pending, pending login (D-199, D-225)');
SELECT tests.results_eq(
  $q$SELECT status, status_detail FROM public.crew_profile_summary(tests.profile_id('A.joiner'), tests.vessel_id('A.dra'))$q$,
  $q$VALUES ('pending', 'planned')$q$, 'a planned joiner: Pending (D-X1-4)');
SELECT tests.is((SELECT member_count FROM public.crew_profile_summary(tests.profile_id('A.bosun'), tests.vessel_id('A.dra'))),
  (SELECT n FROM dra_members),
  'the switcher counts the vessel''s crew a crew_profiles.view holder may see (all of them)');
SELECT tests.is(
  (SELECT s2.prev_profile_id FROM public.crew_profile_summary(tests.profile_id('A.bosun'), tests.vessel_id('A.dra')) AS s1,
          LATERAL public.crew_profile_summary(s1.next_profile_id, tests.vessel_id('A.dra')) AS s2),
  tests.profile_id('A.bosun'), 'next then previous lands back on the same person');
SELECT tests.results_eq(
  $q$SELECT member_index, prev_profile_id IS NULL, next_profile_id IS NOT NULL FROM public.crew_profile_summary(tests.profile_id('A.master_dra'), tests.vessel_id('A.dra'))$q$,
  $q$VALUES (1, true, true)$q$, 'the Master comes first in the rank order: no previous, a next');
SELECT tests.is((SELECT tabs FROM public.crew_profile_summary(tests.profile_id('A.bosun'), tests.vessel_id('A.dra'))),
  ARRAY['personal', 'contact', 'documents', 'stcw', 'qualifications', 'training', 'activity'],
  'tabs for a viewer without hours-of-rest, employment or medical rights');
SELECT tests.results_eq(
  $q$SELECT on_vessel, status IS NULL, member_index IS NULL, position_name FROM public.crew_profile_summary(tests.profile_id('A.bosun'), tests.vessel_id('A.hyd'))$q$,
  $q$VALUES (false, true, true, 'Bosun')$q$,
  'seen from another vessel: not on its crew, no status, no switcher, the title still maps');
SELECT tests.throws_like(format('SELECT * FROM public.crew_profile_summary(%L, %L)', tests.profile_id('A.crew_hyd'), tests.vessel_id('A.dra')), 'P0002', 'profile_not_found',
  'an invisible person: P0002');
SELECT tests.throws_like(format('SELECT * FROM public.crew_profile_summary(%L, %L)', tests.profile_id('A.bosun'), tests.vessel_id('B.lev')), 'P0002', 'vessel_not_found',
  'a foreign vessel: P0002');
SELECT tests.as_user(tests.user_id('A.bosun'));
SELECT tests.results_eq(
  $q$SELECT is_own, can_edit, can_edit_self, member_count, prev_profile_id, next_profile_id, 'hours-of-rest' = ANY (tabs)
     FROM public.crew_profile_summary(tests.profile_id('A.bosun'), tests.vessel_id('A.dra'))$q$,
  $q$VALUES (true, false, true, 1, NULL::uuid, NULL::uuid, true)$q$,
  'own profile: self edit only, the switcher shows nobody else, the own hours of rest tab');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.results_eq(
  $q$SELECT can_edit, can_edit_self, tabs @> ARRAY['hours-of-rest', 'employment', 'medical'] FROM public.crew_profile_summary(tests.profile_id('A.bosun'), tests.vessel_id('A.dra'))$q$,
  $q$VALUES (true, true, true)$q$, 'the fleet manager edits and opens every tab');
SELECT tests.as_user(tests.user_id('A.ext'));
SELECT tests.throws_like(format('SELECT * FROM public.crew_profile_summary(%L, %L)', tests.profile_id('A.bosun'), tests.vessel_id('A.dra')), 'P0002', 'profile_not_found',
  'an external viewer: P0002');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws(format('SELECT * FROM public.crew_profile_summary(%L, %L)', tests.profile_id('A.bosun'), tests.vessel_id('A.dra')), 'P0002', 'an inactive caller: P0002');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 7. crew_personal_details_save

-- Own profile: self fields yes, identity fields no.
SELECT tests.as_user(tests.user_id('A.bosun'));
SELECT tests.results_eq(
  format($q$SELECT city, country_code, repatriation_airport, mobile_dial_code, mobile_number, height_cm, place_of_birth
            FROM public.crew_personal_details_save(%L, '{"city": "  Antibes ", "country_code": "fr", "repatriation_airport": "nce", "mobile_dial_code": "+33", "mobile_number": "6  12 34 56 78", "height_cm": 182}'::jsonb)$q$,
         tests.profile_id('A.bosun')),
  $q$VALUES ('Antibes', 'FR', 'NCE', '33', '6 12 34 56 78', 182, 'Mdina')$q$,
  'own self fields save, normalised (trimmed, codes upper-cased, dial code without +, spaces collapsed); untouched fields stay (merge)');
SELECT tests.throws_like(format($q$SELECT public.crew_personal_details_save(%L, '{"date_of_birth": "1991-01-01"}'::jsonb)$q$, tests.profile_id('A.bosun')),
  '42501', 'crew_identity_locked', 'own identity fields need an editor');
SELECT tests.throws_like(format($q$SELECT public.crew_personal_details_save(%L, '{"city": "Nice", "first_name": "X"}'::jsonb)$q$, tests.profile_id('A.bosun')),
  '42501', 'crew_identity_locked', 'a mixed payload with one identity field is refused as a whole');
SELECT tests.is((SELECT city FROM public.crew_personal_details WHERE profile_id = tests.profile_id('A.bosun')), 'Antibes', 'nothing of the refused payload was written');
SELECT tests.throws_like(format($q$SELECT public.crew_personal_details_save(%L, '{"company_id": "x"}'::jsonb)$q$, tests.profile_id('A.bosun')),
  '22023', 'field_unknown', 'an unknown key (company_id) is refused');
SELECT tests.throws_like(format($q$SELECT public.crew_personal_details_save(%L, '{}'::jsonb)$q$, tests.profile_id('A.bosun')), '22023', 'nothing_to_save', 'an empty payload: 22023');
SELECT tests.throws_like(format($q$SELECT public.crew_personal_details_save(%L, '[1]'::jsonb)$q$, tests.profile_id('A.bosun')), '22023', 'payload_invalid', 'a non-object payload: 22023');
SELECT tests.throws_like(format($q$SELECT public.crew_personal_details_save(%L, '{"city": "Nice"}'::jsonb)$q$, tests.profile_id('A.crew_hyd')),
  'P0002', 'profile_not_found', 'someone else''s profile the caller cannot see: P0002');
-- Field refusals carry the field in HINT.
DO $$
DECLARE v_state text; v_msg text; v_hint text; c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
      ('{"height_cm": 300}', 'field_invalid', 'height_cm'),
      ('{"weight_kg": 10}', 'field_invalid', 'weight_kg'),
      ('{"repatriation_airport": "Nice"}', 'field_invalid', 'repatriation_airport'),
      ('{"mobile_dial_code": "33", "mobile_number": null}', 'field_invalid', 'mobile_number'),
      ('{"phone_number": "12"}', 'field_invalid', 'phone_number'),
      ('{"country_code": "ZZ"}', 'country_unknown', 'country_code'),
      ('{"marital_status": "complicated"}', 'field_invalid', 'marital_status'),
      ('{"height_cm": "tall"}', 'field_invalid', NULL)
    ) AS x(payload, msg, hint) LOOP
    v_state := NULL; v_msg := NULL; v_hint := NULL;
    BEGIN
      PERFORM public.crew_personal_details_save(tests.profile_id('A.bosun'), c.payload::jsonb);
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_hint = PG_EXCEPTION_HINT;
    END;
    PERFORM tests.ok(v_state = '22023' AND v_msg = c.msg AND nullif(v_hint, '') IS NOT DISTINCT FROM c.hint,
      format('%s: 22023 %s with hint %s (got %s %s %s)', c.payload, c.msg, coalesce(c.hint, 'none'), v_state, v_msg, v_hint));
  END LOOP;
END
$$;
SELECT tests.reset_role();

-- Another person: a viewer may not change anything; an editor on the vessel may change everything.
SELECT tests.as_user(tests.user_id('A.viewer'));
SELECT tests.throws_like(format($q$SELECT public.crew_personal_details_save(%L, '{"city": "Nice"}'::jsonb)$q$, tests.profile_id('A.bosun')),
  '42501', 'crew_profile_edit_refused', 'a viewer cannot change someone else''s self fields');
SELECT tests.throws_like(format($q$SELECT public.crew_personal_details_save(%L, '{"title": "mr"}'::jsonb)$q$, tests.profile_id('A.bosun')),
  '42501', 'crew_identity_locked', 'nor identity fields');
SELECT tests.as_user(tests.user_id('A.editor'));
SELECT tests.results_eq(
  format($q$SELECT title, sex, date_of_birth, nationality_code, dual_nationality_code, crew_number, work_email, city
            FROM public.crew_personal_details_save(%L, '{"title": "mr", "sex": "male", "date_of_birth": "1990-04-12", "nationality_code": "gb", "dual_nationality_code": "MT", "crew_number": "DRA-0043", "work_email": " Bosun@Example.TEST ", "city": "Nice", "first_name": "  Ship ", "preferred_name": ""}'::jsonb)$q$,
         tests.profile_id('A.bosun')),
  $q$VALUES ('mr', 'male', DATE '1990-04-12', 'GB', 'MT', 'DRA-0043', 'bosun@example.test', 'Nice')$q$,
  'an editor on the vessel saves identity and self fields together');
SELECT tests.results_eq(
  format($q$SELECT first_name, preferred_name FROM public.profiles WHERE id = %L$q$, tests.profile_id('A.bosun')),
  $q$VALUES ('Ship', NULL::text)$q$, 'the names are written to profiles (trimmed; blank preferred name cleared)');
SELECT tests.throws_like(format($q$SELECT public.crew_personal_details_save(%L, '{"first_name": " "}'::jsonb)$q$, tests.profile_id('A.bosun')),
  '22023', 'field_invalid', 'a blank first name is refused');
SELECT tests.throws_like(format($q$SELECT public.crew_personal_details_save(%L, '{"date_of_birth": "%s"}'::jsonb)$q$, tests.profile_id('A.bosun'), current_date + 1),
  '22023', 'field_invalid', 'a date of birth in the future is refused');
SELECT tests.throws_like(format($q$SELECT public.crew_personal_details_save(%L, '{"date_of_birth": "1899-12-31"}'::jsonb)$q$, tests.profile_id('A.bosun')),
  '22023', 'field_invalid', 'before 1900 too');
SELECT tests.throws_like(format($q$SELECT public.crew_personal_details_save(%L, '{"crew_number": "dra-0043"}'::jsonb)$q$, tests.profile_id('A.pending')),
  '22023', 'crew_number_taken', 'a crew number already used in the company (any letter case): 22023 crew_number_taken');
SELECT tests.lives(format($q$SELECT public.crew_personal_details_save(%L, '{"crew_number": "DRA-0050", "biography": "Joins from the yard."}'::jsonb)$q$, tests.profile_id('A.pending')),
  'an editor writes a pending placement''s details (no login, D-199)');
SELECT tests.throws_like(format($q$SELECT public.crew_personal_details_save(%L, '{"city": "Nice"}'::jsonb)$q$, tests.profile_id('A.crew_hyd')),
  'P0002', 'profile_not_found', 'the editor of A.dra cannot reach HYDRA''s crew');
SELECT tests.reset_role();
SELECT tests.ok((SELECT changed_fields ? 'title' AND changed_fields ? 'first_name' AND changed_fields ? 'city' AND NOT (changed_fields ? 'height_cm')
                        AND actor_user_id = tests.user_id('A.editor') AND old_values IS NULL
                 FROM public.audit_logs WHERE entity_type = 'crew_profile' AND entity_id = tests.profile_id('A.bosun') AND actor_user_id = tests.user_id('A.editor')
                 ORDER BY "timestamp" DESC NULLS LAST LIMIT 1),
  'the save writes one audit row listing the fields that changed (names only, no values)');
SELECT tests.is((SELECT updated_by FROM public.crew_personal_details WHERE profile_id = tests.profile_id('A.bosun')), tests.user_id('A.editor'),
  'and stamps updated_by on the server (D-230)');
SELECT tests.is((SELECT count(*) FROM public.audit_logs WHERE entity_type = 'crew_profile' AND entity_id = tests.profile_id('A.pending') AND action = 'UPDATE'), 1::bigint,
  'one audit row for the pending placement''s save');

-- HR edits anyone in the company; another tenant reaches no one.
SELECT tests.as_user(tests.user_id('A.hr'));
SELECT tests.is((SELECT residency_country_code FROM public.crew_personal_details_save(tests.profile_id('A.crew_hyd'), '{"residency_country_code": "es"}'::jsonb)), 'ES',
  'a legacy HR editor changes HYDRA''s crew member (no vessel reach needed)');
SELECT tests.is((SELECT profile_id FROM public.crew_personal_details_save(tests.profile_id('A.ended'), '{"marital_status": "married", "has_children": "yes"}'::jsonb)), tests.profile_id('A.ended'),
  'and a former crew member');
SELECT tests.as_user(tests.user_id('A.hr_viewer'));
SELECT tests.throws_like(format($q$SELECT public.crew_personal_details_save(%L, '{"city": "Nice"}'::jsonb)$q$, tests.profile_id('A.crew_hyd')),
  '42501', 'crew_profile_edit_refused', 'an HR viewer sees but does not edit');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(format($q$SELECT public.crew_personal_details_save(%L, '{"city": "Nice"}'::jsonb)$q$, tests.profile_id('A.bosun')),
  'P0002', 'profile_not_found', 'another tenant''s admin: P0002');
SELECT tests.as_user(tests.user_id('A.ext'));
SELECT tests.is((SELECT city FROM public.crew_personal_details_save(tests.profile_id('A.ext'), '{"city": "Genoa"}'::jsonb)), 'Genoa',
  'an external viewer may keep their own contact details');
SELECT tests.throws_like(format($q$SELECT public.crew_personal_details_save(%L, '{"city": "Nice"}'::jsonb)$q$, tests.profile_id('A.bosun')),
  'P0002', 'profile_not_found', 'but nobody else''s');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws(format($q$SELECT public.crew_personal_details_save(%L, '{"city": "Nice"}'::jsonb)$q$, tests.profile_id('A.disabled')), 'P0002',
  'an inactive caller cannot even save their own');
SELECT tests.as_anon();
SELECT tests.denied(format($q$SELECT public.crew_personal_details_save(%L, '{"city": "Nice"}'::jsonb)$q$, tests.profile_id('A.bosun')), 'anon cannot call the save');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 8. crew_languages_save

SELECT tests.as_user(tests.user_id('A.bosun'));
SELECT tests.results_eq(
  format($q$SELECT slot, language_code, proficiency FROM public.crew_languages_save(%L,
            '[{"slot": 1, "language_code": "MT"}, {"slot": 2, "language_code": "en", "proficiency": "fluent"}, {"slot": 3, "language_code": "it", "proficiency": "basic"}]'::jsonb)$q$,
         tests.profile_id('A.bosun')),
  $q$VALUES (1, 'mt', NULL::text), (2, 'en', 'fluent'), (3, 'it', 'basic')$q$,
  'the person replaces their languages in one go (the earlier English mother tongue is gone)');
DO $$
DECLARE v_state text; v_msg text; c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
      ('[{"slot": 2, "language_code": "en", "proficiency": "fluent"}]', 'mother_tongue_required'),
      ('[{"slot": 1, "language_code": "en", "proficiency": "fluent"}]', 'languages_invalid'),
      ('[{"slot": 1, "language_code": "en"}, {"slot": 2, "language_code": "fr"}]', 'proficiency_required'),
      ('[{"slot": 1, "language_code": "en"}, {"slot": 2, "language_code": "en", "proficiency": "basic"}]', 'languages_invalid'),
      ('[{"slot": 1, "language_code": "en"}, {"slot": 1, "language_code": "fr"}]', 'languages_invalid'),
      ('[{"slot": 5, "language_code": "en"}]', 'languages_invalid'),
      ('[{"language_code": "en"}]', 'languages_invalid'),
      ('[{"slot": 1, "language_code": "xx"}]', 'language_unknown'),
      ('[{"slot": 1, "language_code": "en", "level": 3}]', 'field_unknown'),
      ('[{"slot": 1, "language_code": "en"}, {"slot": 2, "language_code": "fr", "proficiency": "basic"}, {"slot": 3, "language_code": "de", "proficiency": "basic"}, {"slot": 4, "language_code": "it", "proficiency": "basic"}, {"slot": 4, "language_code": "es", "proficiency": "basic"}]', 'too_many_languages'),
      ('{"slot": 1}', 'languages_invalid')
    ) AS x(rows, msg) LOOP
    v_state := NULL; v_msg := NULL;
    BEGIN
      PERFORM public.crew_languages_save(tests.profile_id('A.bosun'), c.rows::jsonb);
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    END;
    PERFORM tests.ok(v_state = '22023' AND v_msg = c.msg, format('languages %s: 22023 %s (got %s %s)', c.rows, c.msg, v_state, v_msg));
  END LOOP;
END
$$;
SELECT tests.is((SELECT count(*) FROM public.crew_languages WHERE profile_id = tests.profile_id('A.bosun')), 3::bigint, 'a refused save leaves the three languages');
SELECT tests.is((SELECT count(*) FROM public.crew_languages_save(tests.profile_id('A.bosun'), '[]'::jsonb)), 0::bigint, 'an empty list clears them');
SELECT tests.as_user(tests.user_id('A.viewer'));
SELECT tests.throws_like(format($q$SELECT public.crew_languages_save(%L, '[]'::jsonb)$q$, tests.profile_id('A.bosun')), '42501', 'crew_profile_edit_refused',
  'a viewer cannot change someone else''s languages');
SELECT tests.as_user(tests.user_id('A.editor'));
SELECT tests.is((SELECT count(*) FROM public.crew_languages_save(tests.profile_id('A.bosun'), '[{"slot": 1, "language_code": "en"}]'::jsonb)), 1::bigint,
  'an editor on the vessel can');
SELECT tests.as_user(tests.user_id('A.lister'));
SELECT tests.throws_like(format($q$SELECT public.crew_languages_save(%L, '[]'::jsonb)$q$, tests.profile_id('A.bosun')), 'P0002', 'profile_not_found',
  'a crew-list holder who cannot see the person: P0002');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.audit_logs WHERE entity_type = 'crew_profile' AND entity_id = tests.profile_id('A.bosun') AND changed_fields = '["languages"]'::jsonb), 3::bigint,
  'one audit row per languages save that changed something');

-- ------------------------------------------------------------ 9. crew_onboarding_save

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.results_eq(
  format($q$SELECT vessel_id, assignment_id, position_id, department_key, start_date, date_joining_vessel, contract_type_key, leave_method, leave_days_per_year, place_of_embarkation
            FROM public.crew_onboarding_save(%L, %L, jsonb_build_object('start_date', current_date + 1, 'date_joining_vessel', current_date + 3, 'position_id', md5('storm.position.deckhand'), 'department_key', 'deck',
                 'contract_type_key', 'rotational', 'leave_method', 'days_per_year', 'leave_days_per_year', 30, 'place_of_embarkation', 'Palma'),
                 '{"nationality_code": "NL", "place_of_birth": "Rotterdam"}'::jsonb)$q$,
         tests.profile_id('A.pending'), tests.vessel_id('A.dra')),
  format($q$VALUES (%L::uuid, NULL::uuid, md5('storm.position.deckhand')::uuid, 'deck', current_date + 1, current_date + 3, 'rotational', 'days_per_year', 30.00::numeric, 'Palma')$q$, tests.vessel_id('A.dra')),
  'onboarding a pending placement: the terms row (no assignment yet to link)');
SELECT tests.is((SELECT place_of_birth FROM public.crew_personal_details WHERE profile_id = tests.profile_id('A.pending')), 'Rotterdam', 'and the personal details are filled');
SELECT tests.results_eq(
  format($q$SELECT assignment_id, leave_method, leave_ratio_on, leave_ratio_off, review_date FROM public.crew_onboarding_save(%L, %L,
            jsonb_build_object('start_date', current_date - 30, 'leave_method', 'ratio', 'leave_ratio_on', 2, 'leave_ratio_off', 1, 'review_date', current_date + 60))$q$,
         tests.profile_id('A.bosun'), tests.vessel_id('A.dra')),
  format($q$VALUES (%L::uuid, 'ratio', 2, 1, current_date + 60)$q$, tests.id('assignment:A.bosun@A.dra')),
  'a second save on the same start date updates the row, linked to the current assignment (advisory)');
SELECT tests.is((SELECT count(*) FROM public.crew_assignment_terms WHERE profile_id = tests.profile_id('A.bosun')), 1::bigint, 'still one terms row for the bosun on A.dra');
SELECT tests.throws_like(format($q$SELECT public.crew_onboarding_save(%L, %L, jsonb_build_object('start_date', current_date))$q$, tests.profile_id('A.bosun'), tests.vessel_id('A.hyd')),
  '42501', 'crew_onboarding_refused', 'the wrong vessel: the bosun is not on HYDRA''s crew');
SELECT tests.throws_like(format($q$SELECT public.crew_onboarding_save(%L, %L, jsonb_build_object('start_date', current_date))$q$, tests.profile_id('B.crew'), tests.vessel_id('A.dra')),
  '42501', 'crew_onboarding_refused', 'another company''s person');
SELECT tests.throws_like(format($q$SELECT public.crew_onboarding_save(%L, %L, jsonb_build_object('start_date', current_date))$q$, tests.profile_id('A.ended'), tests.vessel_id('A.dra')),
  '42501', 'crew_onboarding_refused', 'an ended crew member');
SELECT tests.throws_like(format($q$SELECT public.crew_onboarding_save(%L, %L, jsonb_build_object('start_date', current_date))$q$, tests.profile_id('A.bosun'), tests.vessel_id('B.lev')),
  '42501', 'crew_not_permitted', 'another tenant''s vessel: 42501');
SELECT tests.throws_like(format($q$SELECT public.crew_onboarding_save(%L, %L, jsonb_build_object('start_date', current_date))$q$, tests.profile_id('A.bosun'), tests.id('vessel:nowhere')),
  'P0002', 'vessel_not_found', 'an unknown vessel: P0002');
DO $$
DECLARE v_state text; v_msg text; c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
      (jsonb_build_object('review_date', current_date), 'start_date_required'),
      (jsonb_build_object('start_date', current_date, 'review_date', current_date - 1), 'field_invalid'),
      (jsonb_build_object('start_date', current_date, 'date_joining_vessel', current_date - 1), 'field_invalid'),
      (jsonb_build_object('start_date', current_date, 'leave_method', 'days_per_year'), 'leave_allowance_invalid'),
      (jsonb_build_object('start_date', current_date, 'leave_method', 'ratio', 'leave_ratio_on', 1), 'leave_allowance_invalid'),
      (jsonb_build_object('start_date', current_date, 'leave_days_per_year', 30), 'leave_allowance_invalid'),
      (jsonb_build_object('start_date', current_date, 'leave_method', 'days_per_year', 'leave_days_per_year', 400), 'field_invalid'),
      (jsonb_build_object('start_date', current_date, 'leave_method', 'monthly'), 'field_invalid'),
      (jsonb_build_object('start_date', current_date, 'contract_type_key', 'seasonal'), 'contract_type_unknown'),
      (jsonb_build_object('start_date', current_date, 'department_key', 'kitchen'), 'department_unknown'),
      (jsonb_build_object('start_date', current_date, 'position_id', tests.id('position:nowhere')), 'position_unknown'),
      (jsonb_build_object('start_date', 'soon'), 'field_invalid'),
      (jsonb_build_object('start_date', current_date, 'end_date', current_date), 'field_unknown')
    ) AS x(terms, msg) LOOP
    v_state := NULL; v_msg := NULL;
    BEGIN
      PERFORM public.crew_onboarding_save(tests.profile_id('A.pending'), tests.vessel_id('A.dra'), c.terms);
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    END;
    PERFORM tests.ok(v_state = '22023' AND v_msg = c.msg, format('terms %s: 22023 %s (got %s %s)', c.terms, c.msg, v_state, v_msg));
  END LOOP;
END
$$;
SELECT tests.as_user(tests.user_id('A.editor'));
SELECT tests.throws_like(format($q$SELECT public.crew_onboarding_save(%L, %L, jsonb_build_object('start_date', current_date))$q$, tests.profile_id('A.pending'), tests.vessel_id('A.dra')),
  '42501', 'crew_not_permitted', 'crew_profiles.edit is not crew_profiles.create: refused');
SELECT tests.as_user(tests.user_id('A.ext'));
SELECT tests.throws(format($q$SELECT public.crew_onboarding_save(%L, %L, jsonb_build_object('start_date', current_date))$q$, tests.profile_id('A.pending'), tests.vessel_id('A.dra')), '42501',
  'an external viewer: 42501');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws(format($q$SELECT public.crew_onboarding_save(%L, %L, jsonb_build_object('start_date', current_date))$q$, tests.profile_id('A.pending'), tests.vessel_id('A.dra')), '42501',
  'an inactive caller: 42501');
SELECT tests.reset_role();
-- Fill-only (a creator who is not an editor): blanks yes, recorded identity values no.
SELECT tests._set_claims(jsonb_build_object('sub', tests.user_id('A.fleet_manager'), 'role', 'authenticated'));
SELECT tests.is((SELECT title FROM public.crew_personal_details_apply(tests.profile_id('A.pending'), '{"title": "ms", "nationality_code": "NL"}'::jsonb, tests.user_id('A.fleet_manager'), true)), 'ms',
  'fill-only: a blank identity field is filled, an unchanged one passes');
SELECT tests.throws_like(format($q$SELECT public.crew_personal_details_apply(%L, '{"place_of_birth": "Delft"}'::jsonb, %L, true)$q$, tests.profile_id('A.pending'), tests.user_id('A.fleet_manager')),
  '42501', 'crew_identity_locked', 'fill-only: a recorded identity value cannot be overwritten');
SELECT tests.lives(format($q$SELECT public.crew_personal_details_apply(%L, '{"city": "Delft"}'::jsonb, %L, true)$q$, tests.profile_id('A.pending'), tests.user_id('A.fleet_manager')),
  'fill-only: self fields are not restricted');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 9b. a new employment opens a draft contract and an On board period (D-375)
-- crew_onboarding_terms_write: only an inserted terms row opens them; the
-- update path (the Employment tab's edit) opens neither.
SELECT tests.is((SELECT count(*) FROM public.crew_contracts WHERE profile_id = tests.profile_id('A.pending'))::integer, 1,
                'the first onboarding save of the pending placement opened one contract');
SELECT tests.results_eq(
  format($q$SELECT vessel_id, contract_type, position, department, start_date, status, created_by FROM public.crew_contracts WHERE profile_id = %L$q$, tests.profile_id('A.pending')),
  format($q$VALUES (%L::uuid, 'rotational', 'Deckhand', 'Deck', current_date + 1, 'draft', %L::uuid)$q$, tests.vessel_id('A.dra'), tests.user_id('A.fleet_manager')),
  'a draft on the vessel: the contract type, the position name, the department label and the start date of the terms');
SELECT tests.results_eq(
  format($q$SELECT vessel_id, leave_type_key, start_date, end_unknown, status::text FROM public.frp_rotation_assignments WHERE profile_id = %L$q$, tests.profile_id('A.pending')),
  format($q$VALUES (%L::uuid, 'on_board', current_date + 3, true, 'confirmed')$q$, tests.vessel_id('A.dra')),
  'and one On board period from the date joining the vessel, end unknown');
SELECT tests.is((SELECT count(*) FROM public.crew_contracts WHERE profile_id = tests.profile_id('A.bosun'))::integer, 0,
                'the bosun''s second save (the update path) opened no contract');
SELECT tests.is((SELECT count(*) FROM public.frp_rotation_assignments WHERE profile_id = tests.profile_id('A.bosun'))::integer, 0,
                'and no period');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format($q$SELECT public.crew_onboarding_save(%L, %L, jsonb_build_object('start_date', current_date + 1, 'leave_method', 'none'))$q$,
                          tests.profile_id('A.pending'), tests.vessel_id('A.dra')),
  'the pending placement''s terms saved again on the same start date');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.crew_contracts WHERE profile_id = tests.profile_id('A.pending'))::integer, 1,
                'an edit of the same start date opens no second contract');
SELECT tests.is((SELECT count(*) FROM public.frp_rotation_assignments WHERE profile_id = tests.profile_id('A.pending'))::integer, 1,
                'nor a second period');

-- A new start date for someone with an active contract on the vessel: no second contract.
INSERT INTO public.crew_contracts (id, company_id, profile_id, vessel_id, contract_type, start_date, status)
VALUES (tests.id('x375:contract:viewer'), tests.company_id('A'), tests.profile_id('A.viewer'), tests.vessel_id('A.dra'), 'permanent', current_date - 400, 'active');
-- The helper is internal (definers and the service role): called here without a JWT.
CREATE TEMP TABLE x375_w1 ON COMMIT DROP AS
SELECT w.inserted, w.contract_id, w.period_id
FROM public.crew_onboarding_terms_write(tests.company_id('A'), tests.profile_id('A.viewer'), tests.vessel_id('A.dra'), NULL,
                                        jsonb_build_object('start_date', current_date + 2, 'contract_type_key', 'temporary'), tests.user_id('A.fleet_manager')) AS w;
SELECT tests.ok((SELECT inserted AND contract_id IS NULL AND period_id IS NOT NULL FROM x375_w1),
                'the helper''s answer: a new row, no contract (an active one exists), a period');
SELECT tests.results_eq(
  format($q$SELECT id, status FROM public.crew_contracts WHERE profile_id = %L$q$, tests.profile_id('A.viewer')),
  format($q$VALUES (%L::uuid, 'active')$q$, tests.id('x375:contract:viewer')),
  'an existing active contract is not duplicated');
-- A confirmed period on or after the joining day: the On board period is skipped (the planner would refuse the overlap).
CREATE TEMP TABLE x375_w2 ON COMMIT DROP AS
SELECT w.inserted, w.contract_id, w.period_id
FROM public.crew_onboarding_terms_write(tests.company_id('A'), tests.profile_id('A.viewer'), tests.vessel_id('A.dra'), NULL,
                                        jsonb_build_object('start_date', current_date + 9), tests.user_id('A.fleet_manager')) AS w;
SELECT tests.ok((SELECT inserted AND contract_id IS NULL AND period_id IS NULL FROM x375_w2),
                'a later start while the On board period runs: no second contract, no overlapping period');
SELECT tests.is((SELECT count(*) FROM public.frp_rotation_assignments WHERE profile_id = tests.profile_id('A.viewer'))::integer, 1,
                'one period for the viewer');

-- A tenant's own contract type key maps to rotational; a STORM key that crew_contracts allows is kept.
INSERT INTO public.contract_types (company_id, key, label) VALUES (tests.company_id('A'), 'x375_relief', 'Relief');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format($q$SELECT public.crew_onboarding_save(%L, %L, jsonb_build_object('start_date', current_date + 4, 'contract_type_key', 'x375_relief'))$q$,
                          tests.profile_id('A.lister'), tests.vessel_id('A.dra')),
  'the lister''s terms with the tenant key');
SELECT tests.lives(format($q$SELECT public.crew_onboarding_save(%L, %L, jsonb_build_object('start_date', current_date + 4, 'contract_type_key', 'permanent'))$q$,
                          tests.profile_id('A.editor'), tests.vessel_id('A.dra')),
  'the editor''s terms with the permanent key');
SELECT tests.reset_role();
SELECT tests.is((SELECT contract_type FROM public.crew_contracts WHERE profile_id = tests.profile_id('A.lister')), 'rotational', 'tenant key x375_relief: rotational');
SELECT tests.is((SELECT contract_type FROM public.crew_contracts WHERE profile_id = tests.profile_id('A.editor')), 'permanent', 'permanent stays permanent');
SELECT tests.is((SELECT position FROM public.crew_contracts WHERE profile_id = tests.profile_id('A.editor')), NULL, 'no position chosen: the contract names none');

-- The planner engine not applied (planner_period_write missing): the period is skipped cleanly, the contract still opens.
SAVEPOINT x375_no_planner;
ALTER FUNCTION public.planner_period_write(uuid, uuid, uuid, uuid, text, date, date, boolean, text, boolean, uuid, boolean, uuid) RENAME TO planner_period_write_x375;
SELECT tests.ok(to_regprocedure('public.planner_period_write(uuid,uuid,uuid,uuid,text,date,date,boolean,text,boolean,uuid,boolean,uuid)') IS NULL,
                'simulated: planner_period_write is not there');
CREATE TEMP TABLE x375_w3 ON COMMIT DROP AS
SELECT w.inserted, w.contract_id, w.period_id
FROM public.crew_onboarding_terms_write(tests.company_id('A'), tests.profile_id('A.joiner'), tests.vessel_id('A.dra'), NULL,
                                        jsonb_build_object('start_date', current_date + 6), tests.user_id('A.fleet_manager')) AS w;
SELECT tests.ok((SELECT inserted AND contract_id IS NOT NULL AND period_id IS NULL FROM x375_w3),
                'without the planner engine: a new row and a contract, no period');
SELECT tests.is((SELECT count(*) FROM public.frp_rotation_assignments WHERE profile_id = tests.profile_id('A.joiner'))::integer, 0, 'no period was written');
ROLLBACK TO SAVEPOINT x375_no_planner;
SELECT tests.ok(to_regprocedure('public.planner_period_write(uuid,uuid,uuid,uuid,text,date,date,boolean,text,boolean,uuid,boolean,uuid)') IS NOT NULL,
                'planner_period_write is back');
SELECT tests.ok(current_setting('storm.crew_engine', true) IS DISTINCT FROM 'on', 'the helper restored storm.crew_engine after the period write');

-- ------------------------------------------------------------ 10. crew_find_duplicates

UPDATE public.profiles SET email = 'shared-name@example.test' WHERE id = tests.profile_id('A.joiner');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.results_eq(
  format($q$SELECT profile_id, vessel_id, vessel_name, match_kind FROM public.crew_find_duplicates(%L, ' Shared-Name@Example.TEST ', NULL, NULL)$q$, tests.vessel_id('A.dra')),
  format($q$VALUES (%L::uuid, %L::uuid, 'M/Y DRAAK', 'email')$q$, tests.profile_id('A.joiner'), tests.vessel_id('A.dra')),
  'the same email in the company (case and spaces ignored), with the vessel; not B''s person with that email');
SELECT tests.results_eq(
  format($q$SELECT profile_id, match_kind FROM public.crew_find_duplicates(%L, NULL, 'crew', 'a.crew_hyd')$q$, tests.vessel_id('A.dra')),
  format($q$VALUES (%L::uuid, 'name')$q$, tests.profile_id('A.crew_hyd')),
  'the same name, no date of birth given: name');
SELECT tests.results_eq(
  format($q$SELECT profile_id, match_kind FROM public.crew_find_duplicates(%L, NULL, 'Ship', 'A.bosun', DATE '1990-04-12')$q$, tests.vessel_id('A.dra')),
  format($q$VALUES (%L::uuid, 'name_dob')$q$, tests.profile_id('A.bosun')),
  'the same name and date of birth: name_dob');
SELECT tests.is_empty(format($q$SELECT * FROM public.crew_find_duplicates(%L, NULL, 'Ship', 'A.bosun', DATE '1980-01-01')$q$, tests.vessel_id('A.dra')),
  'the same name with another recorded date of birth: no match');
SELECT tests.is_empty(format($q$SELECT * FROM public.crew_find_duplicates(%L, NULL, 'Crew', 'B.crew')$q$, tests.vessel_id('A.dra')), 'another company''s people are never returned');
SELECT tests.is_empty(format($q$SELECT * FROM public.crew_find_duplicates(%L, NULL, 'Crew', NULL)$q$, tests.vessel_id('A.dra')), 'a first name alone is no query');
SELECT tests.as_user(tests.user_id('A.viewer'));
SELECT tests.throws_like(format($q$SELECT * FROM public.crew_find_duplicates(%L, 'x@example.test', NULL, NULL)$q$, tests.vessel_id('A.dra')), '42501', 'crew_not_permitted',
  'without crew_profiles.create: 42501');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(format($q$SELECT * FROM public.crew_find_duplicates(%L, 'shared-name@example.test', NULL, NULL)$q$, tests.vessel_id('A.dra')), '42501', 'crew_not_permitted',
  'another tenant''s vessel: 42501');
SELECT tests.is((SELECT count(*) FROM public.crew_find_duplicates(tests.vessel_id('B.lev'), 'shared-name@example.test', NULL, NULL)), 1::bigint,
  'B''s admin finds only B''s person on B''s vessel');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 11. integrity guards and next-of-kin columns

SELECT tests.throws(format($q$INSERT INTO public.crew_personal_details (profile_id, company_id) VALUES (%L, %L)$q$, tests.profile_id('A.lister'), tests.company_id('B')),
  '23514', 'details must name a person of their own company');
SELECT tests.throws(format($q$INSERT INTO public.crew_languages (company_id, profile_id, slot, language_code) VALUES (%L, %L, 1, 'en')$q$, tests.company_id('B'), tests.profile_id('A.lister')),
  '23514', 'languages too');
SELECT tests.throws(format($q$INSERT INTO public.crew_assignment_terms (company_id, profile_id, vessel_id, start_date) VALUES (%L, %L, %L, current_date)$q$,
  tests.company_id('A'), tests.profile_id('A.lister'), tests.vessel_id('B.lev')), '23514', 'terms name a vessel of their own company');
SELECT tests.throws(format($q$INSERT INTO public.crew_assignment_terms (company_id, profile_id, vessel_id, assignment_id, start_date) VALUES (%L, %L, %L, %L, current_date)$q$,
  tests.company_id('A'), tests.profile_id('A.lister'), tests.vessel_id('A.dra'), tests.id('assignment:A.bosun@A.dra')), '23514', 'and link only the person''s own assignment');
SELECT tests.throws(format($q$INSERT INTO public.crew_languages (company_id, profile_id, slot, language_code, proficiency) VALUES (%L, %L, 1, 'en', 'fluent')$q$,
  tests.company_id('A'), tests.profile_id('A.lister')), '23514', 'a mother tongue carries no proficiency (CHECK)');
SELECT tests.throws(format($q$INSERT INTO public.crew_assignment_terms (company_id, profile_id, vessel_id, start_date, leave_method) VALUES (%L, %L, %L, current_date, 'ratio')$q$,
  tests.company_id('A'), tests.profile_id('A.lister'), tests.vessel_id('A.dra')), '23514', 'a ratio needs both parts (CHECK)');
SELECT tests.throws(format($q$INSERT INTO public.crew_assignment_terms (company_id, profile_id, vessel_id, start_date, end_reason) VALUES (%L, %L, %L, current_date, 'resignation')$q$,
  tests.company_id('A'), tests.profile_id('A.lister'), tests.vessel_id('A.dra')), '23514', 'an end reason needs an end date (CHECK)');
INSERT INTO public.crew_next_of_kin (id, company_id, profile_id, full_name, relationship, phone_primary, phone_dial_code, mobile_dial_code, mobile_number, country_code)
VALUES (tests.id('nok:bosun'), tests.company_id('A'), tests.profile_id('A.bosun'), 'Next Of Kin', 'Parent', '7700 900456', '44', '44', '7700 900789', 'GB');
SELECT tests.results_eq(format($q$SELECT phone_dial_code, mobile_number, country_code FROM public.crew_next_of_kin WHERE id = %L$q$, tests.id('nok:bosun')),
  $q$VALUES ('44', '7700 900789', 'GB')$q$, 'next of kin keeps the dial codes, the mobile and the country code (T-68)');
SELECT tests.throws(format($q$UPDATE public.crew_next_of_kin SET phone_dial_code = '+44' WHERE id = %L$q$, tests.id('nok:bosun')), '23514', 'a next-of-kin dial code is digits only');
SELECT tests.throws(format($q$UPDATE public.crew_next_of_kin SET mobile_number = '+44 7700' WHERE id = %L$q$, tests.id('nok:bosun')), '23514', 'the mobile is the national number only');
SELECT tests.throws(format($q$UPDATE public.crew_next_of_kin SET country_code = 'ZZ' WHERE id = %L$q$, tests.id('nok:bosun')), '23503', 'the country is a known code');

-- ------------------------------------------------------------ 12. grants

SELECT tests.ok(NOT has_function_privilege('authenticated', 'public.crew_profile_structural_vessels(uuid)', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.crew_profile_can_edit(uuid)', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.crew_personal_field_groups()', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.crew_personal_details_apply(uuid, jsonb, uuid, boolean)', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.crew_onboarding_terms_write(uuid, uuid, uuid, uuid, jsonb, uuid)', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.crew_phone_split(text)', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.crew_country_from_text(text)', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.crew_profile_details_backfill()', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.crew_personal_details_scope_guard()', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.crew_languages_scope_guard()', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.crew_assignment_terms_scope_guard()', 'EXECUTE'),
  'the internals, the seed and the trigger functions are not executable by authenticated');
SELECT tests.ok(has_function_privilege('authenticated', 'public.crew_profile_resolve(uuid, uuid)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.crew_profile_summary(uuid, uuid)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.crew_personal_details_save(uuid, jsonb)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.crew_languages_save(uuid, jsonb)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.crew_onboarding_save(uuid, uuid, jsonb, jsonb)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.crew_find_duplicates(uuid, text, text, text, date)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.crew_profile_visible(uuid)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.crew_visible_profile_ids()', 'EXECUTE'),
  'the RPCs and the policy helpers are executable by authenticated');
SELECT tests.is_empty(
  $q$SELECT p.oid::regprocedure::text FROM pg_proc AS p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('crew_profile_visible', 'crew_visible_profile_ids', 'crew_profile_structural_vessels', 'crew_profile_can_edit',
                         'crew_personal_field_groups', 'crew_personal_details_apply', 'crew_onboarding_terms_write', 'crew_phone_split', 'crew_country_from_text',
                         'crew_profile_resolve', 'crew_profile_summary', 'crew_personal_details_save', 'crew_languages_save',
                         'crew_onboarding_save', 'crew_find_duplicates', 'crew_profile_details_backfill',
                         'crew_personal_details_scope_guard', 'crew_languages_scope_guard', 'crew_assignment_terms_scope_guard')
       AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('public', p.oid, 'EXECUTE'))$q$,
  'anon and PUBLIC execute nothing of this file');
SELECT tests.is_empty(
  $q$SELECT c.relname FROM pg_class AS c
     WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('crew_personal_details', 'crew_languages', 'crew_assignment_terms')
       AND (has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
            OR has_table_privilege('authenticated', c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
            OR NOT has_table_privilege('authenticated', c.oid, 'SELECT')
            OR NOT c.relrowsecurity)$q$,
  'the three tables: RLS on, SELECT only for authenticated, nothing for anon');
SELECT tests.is_empty(
  $q$SELECT p.oid::regprocedure::text FROM pg_proc AS p
     WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
       AND p.proname IN ('crew_profile_visible', 'crew_visible_profile_ids', 'crew_profile_can_edit', 'crew_profile_resolve', 'crew_profile_summary',
                         'crew_personal_details_save', 'crew_languages_save', 'crew_onboarding_save', 'crew_find_duplicates', 'crew_profile_details_backfill',
                         'crew_personal_details_scope_guard', 'crew_languages_scope_guard', 'crew_assignment_terms_scope_guard')
       AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) AS c WHERE c = 'search_path=public')$q$,
  'every definer of this file pins search_path = public');
SELECT tests.is((SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prosecdef
                 AND proname IN ('crew_profile_structural_vessels', 'crew_personal_field_groups', 'crew_personal_details_apply', 'crew_onboarding_terms_write', 'crew_phone_split', 'crew_country_from_text')), 0::bigint,
  'the pure helpers and the internal writer are not definers (they run as their caller, a gated definer)');
