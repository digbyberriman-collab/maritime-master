-- Crew reference data, positions and position manning (X1-01,
-- 20261124060100_crew_reference_positions.sql; gap/04 C1, C12, C49, C70,
-- C71; DECISIONS C22, D-X1-1, D-X1-2):
--   1. seeds: countries, languages, departments, contract types and the
--      system positions (every vessel role of storm.json with its tier and
--      department, the default access set by tier, the rank order, ids
--      derived from the key), each exactly once;
--   2. crew_position_for parity with the TS mirror on every case of
--      src/test/crew/fixtures/positionCases.json, and the synonym map;
--   3. the alias and manning backfill, unmatched titles, and that a second
--      run adds nothing;
--   4. RLS: reference rows for active users only, positions by scope
--      (system for active users, company rows for members, vessel rows need
--      reach), aliases for members, manning with crew_list.view; inactive
--      callers and anon get nothing; the integrity guards;
--   5. the gate helpers crew_vessel_cap / crew_cap_vessel_ids;
--   6. the RPCs: gates and refusal codes, results, stamps;
--   7. grants (crew_position_for and the other internals not executable by
--      authenticated; anon has nothing), since the platform ACL inventory
--      reads the fragment too.

\set cases `cat src/test/crew/fixtures/positionCases.json`
\set storm `cat docs/permissions/catalogues/storm.json`
CREATE TEMP TABLE fx ON COMMIT DROP AS SELECT :'cases'::jsonb AS cases, :'storm'::jsonb AS storm;
GRANT SELECT ON fx TO PUBLIC;

-- The vessel departments of the PMS catalogue (the shore, platform and external groups are not vessel crew).
CREATE TEMP TABLE storm_roles ON COMMIT DROP AS
SELECT d ->> 'key' AS department_key, r ->> 'key' AS key, r ->> 'tier' AS tier
FROM fx, jsonb_array_elements(storm -> 'departments') AS d, jsonb_array_elements(d -> 'roles') AS r
WHERE d ->> 'key' NOT IN ('shore_ops', 'shore_hr', 'shore_finance', 'shore_legal', 'platform', 'external');
GRANT SELECT ON storm_roles TO PUBLIC;

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ 1. seeds

SELECT tests.ok((SELECT count(*) FROM storm_roles) >= 40, format('storm.json lists %s vessel roles (parser sanity)', (SELECT count(*) FROM storm_roles)));
SELECT tests.is_empty(
  $q$SELECT s.key, s.tier, s.department_key FROM storm_roles AS s
     WHERE NOT EXISTS (SELECT 1 FROM public.positions AS p
                       WHERE p.company_id IS NULL AND p.key = s.key AND p.rank_tier = s.tier AND p.department_key = s.department_key AND p.is_active)$q$,
  'every vessel role key of storm.json is a system position with its tier and department');
SELECT tests.is_empty(
  $q$SELECT DISTINCT s.department_key FROM storm_roles AS s WHERE NOT EXISTS (SELECT 1 FROM public.departments AS d WHERE d.key = s.department_key)$q$,
  'every vessel department of storm.json is a department');
SELECT tests.results_eq(
  'SELECT key FROM public.departments',
  $q$VALUES ('bridge'), ('deck'), ('engineering'), ('interior'), ('galley'), ('purser_office'), ('medical'), ('security'),
            ('dive'), ('media'), ('it_av'), ('spa_wellness'), ('other')$q$,
  'the thirteen departments');
SELECT tests.is((SELECT count(*) FROM public.positions WHERE company_id IS NULL), 100::bigint, 'one hundred system positions');
SELECT tests.is((SELECT count(DISTINCT key) FROM public.positions WHERE company_id IS NULL), 100::bigint, 'each system key once (no duplicate seed after the second pass)');
SELECT tests.is_empty($q$SELECT key FROM public.positions WHERE company_id IS NULL AND id <> md5('storm.position.' || key)::uuid$q$,
  'system position ids are derived from the key');
SELECT tests.is_empty(
  $q$SELECT key FROM public.positions WHERE company_id IS NULL
       AND default_access_set_key IS DISTINCT FROM CASE rank_tier WHEN 'command' THEN 'full_vessel' WHEN 'hod' THEN 'hod' WHEN 'officer' THEN 'officer' ELSE 'crew' END$q$,
  'the default access set follows the tier (command full vessel, hod, officer, rating and trainee crew)');
SELECT tests.is_empty(
  $q$SELECT a.key, b.key FROM public.positions AS a JOIN public.positions AS b ON a.company_id IS NULL AND b.company_id IS NULL
     WHERE array_position(ARRAY['command','hod','officer','rating','trainee'], a.rank_tier) < array_position(ARRAY['command','hod','officer','rating','trainee'], b.rank_tier)
       AND a.sort_order >= b.sort_order$q$,
  'rank order: every tier sorts before the next one');
SELECT tests.is_empty(
  $q$SELECT a.key, b.key FROM public.positions AS a
     JOIN public.positions AS b ON a.company_id IS NULL AND b.company_id IS NULL AND a.rank_tier = b.rank_tier
     JOIN public.departments AS da ON da.key = a.department_key
     JOIN public.departments AS db ON db.key = b.department_key
     WHERE da.sort_order < db.sort_order AND a.sort_order >= b.sort_order$q$,
  'rank order: within a tier, by the department order');
SELECT tests.is((SELECT key FROM public.positions WHERE company_id IS NULL ORDER BY sort_order LIMIT 1), 'master', 'the Master ranks first');
SELECT tests.is((SELECT count(*) FROM public.ref_countries), 250::bigint, 'the ISO 3166-1 countries and Kosovo');
SELECT tests.is((SELECT count(DISTINCT iso3) FROM public.ref_countries), 250::bigint, 'each alpha-3 code once');
SELECT tests.is((SELECT flag_emoji FROM public.ref_countries WHERE iso2 = 'NL'), chr(127475) || chr(127473), 'the flag is built from the regional indicators');
SELECT tests.results_eq(
  $q$SELECT iso2, iso3, demonym, dial_code FROM public.ref_countries WHERE iso2 IN ('GB', 'MT', 'KY', 'US')$q$,
  $q$VALUES ('GB', 'GBR', 'British', '44'), ('MT', 'MLT', 'Maltese', '356'), ('KY', 'CYM', 'Caymanian', '1345'), ('US', 'USA', 'American', '1')$q$,
  'codes, demonym and dial code');
SELECT tests.is((SELECT sort_name FROM public.ref_countries WHERE iso2 = 'CI'), 'Cote d''Ivoire', 'sort names fold accents');
SELECT tests.ok((SELECT count(*) FROM public.ref_languages) >= 53, format('%s languages (at least 53)', (SELECT count(*) FROM public.ref_languages)));
SELECT tests.is((SELECT code FROM public.ref_languages ORDER BY sort_order, name LIMIT 1), 'en', 'English sorts first');
SELECT tests.results_eq(
  'SELECT key, is_system FROM public.contract_types WHERE company_id IS NULL',
  $q$VALUES ('permanent', true), ('rotational', true), ('temporary', true)$q$,
  'three system contract types');

-- ------------------------------------------------------------ 2. crew_position_for parity (positionCases.json)

-- The fixture world, in companies A and B of seed_two_tenants().
SELECT tests.is_empty(
  $q$SELECT s ->> 'key' FROM fx, jsonb_array_elements(cases -> 'system') AS s
     WHERE NOT EXISTS (SELECT 1 FROM public.positions AS p WHERE p.company_id IS NULL AND p.key = s ->> 'key' AND p.name = s ->> 'name' AND p.is_active)$q$,
  'every STORM position the parity cases rely on is seeded with that key and name');
INSERT INTO public.positions (id, company_id, vessel_id, key, name, department_key, rank_tier, default_access_set_key, is_active)
SELECT tests.id('pos:' || (e ->> 'ref')), tests.company_id(e ->> 'company'),
       CASE WHEN e ->> 'vessel' IS NULL THEN NULL ELSE tests.vessel_id((e ->> 'company') || '.' || (e ->> 'vessel')) END,
       e ->> 'key', e ->> 'name', 'deck', 'rating', 'crew', (e ->> 'active')::boolean
FROM fx, jsonb_array_elements(cases -> 'positions') AS e;
INSERT INTO public.position_aliases (company_id, alias_key, alias_label, position_id, source)
SELECT tests.company_id(a ->> 'company'), a ->> 'alias', a ->> 'label',
       CASE WHEN a ->> 'position' LIKE 'system:%'
            THEN (SELECT p.id FROM public.positions AS p WHERE p.company_id IS NULL AND p.key = substr(a ->> 'position', 8))
            ELSE tests.id('pos:' || (a ->> 'position')) END,
       'manual'
FROM fx, jsonb_array_elements(cases -> 'aliases') AS a;

CREATE TEMP TABLE parity ON COMMIT DROP AS
SELECT c ->> 'title' AS title, c ->> 'company' AS company, c ->> 'vessel' AS vessel, c ->> 'why' AS why,
       CASE WHEN c ->> 'expect' IS NULL THEN NULL
            WHEN c ->> 'expect' LIKE 'system:%' THEN (SELECT p.id FROM public.positions AS p WHERE p.company_id IS NULL AND p.key = substr(c ->> 'expect', 8))
            ELSE tests.id('pos:' || (c ->> 'expect')) END AS want
FROM fx, jsonb_array_elements(cases -> 'cases') AS c;
SELECT tests.ok((SELECT count(*) FROM parity) >= 70, format('%s parity cases', (SELECT count(*) FROM parity)));
SELECT tests.is_empty(
  $q$SELECT title, company, vessel, why FROM parity
     WHERE public.crew_position_for(tests.company_id(company), tests.vessel_id(company || '.' || vessel), title) IS DISTINCT FROM want$q$,
  'crew_position_for gives the expected position for every case of positionCases.json (the TS mirror passes the same cases)');
SELECT tests.is(
  (SELECT count(*) FROM regexp_matches(pg_get_functiondef('public.crew_position_synonym(text)'::regprocedure), '\(''[a-z0-9_]+'', ''[a-z0-9_]+''\)', 'g')),
  (SELECT count(*) FROM parity WHERE why LIKE 'synonym % -> %'),
  'the SQL synonym map has exactly the entries the synonym cases cover (the TS test pins TS = cases)');
SELECT tests.is(public.crew_position_synonym('captain'), 'master', 'crew_position_synonym: captain is the Master');
SELECT tests.is(public.crew_position_synonym('master'), NULL::text, 'crew_position_synonym: a key is no synonym');
SELECT tests.is(public.crew_position_for(NULL, NULL, 'Bosun'), md5('storm.position.bosun')::uuid, 'without a company only STORM rows match');

-- ------------------------------------------------------------ 3. backfill, unmatched titles, second run

SAVEPOINT backfill;
SELECT tests.seed_user('A', 'A.chief_mate', 'crew');
SELECT tests.seed_user('A', 'A.bosun_dra', 'crew');
SELECT tests.seed_user('A', 'A.ab_dra', 'crew');
SELECT tests.seed_user('A', 'A.welder_dra', 'crew');
SELECT tests.seed_user('A', 'A.stew_dra', 'crew');
SELECT tests.seed_user('A', 'A.old_bosun', 'crew');
SELECT tests.seed_user('B', 'B.chief_mate', 'crew');
SELECT tests.seed_assignment('A.chief_mate', 'A.dra', true, 'Chief Mate');
SELECT tests.seed_assignment('A.bosun_dra', 'A.dra', true, 'Bosun');
SELECT tests.seed_assignment('A.ab_dra', 'A.dra', true, 'AB');
SELECT tests.seed_assignment('A.welder_dra', 'A.dra', true, 'Underwater Welder');
SELECT tests.seed_assignment('A.stew_dra', 'A.dra', true, 'Crew', '{"rank": "Second Stewardess"}');
SELECT tests.seed_assignment('A.old_bosun', 'A.dra', false, 'Boatswain');
SELECT tests.seed_assignment('B.chief_mate', 'B.lev', true, 'Chief Mate');
UPDATE public.profiles SET position = 'Skipper' WHERE id = tests.profile_id('A.ab_dra');
INSERT INTO public.crew_contracts (company_id, profile_id, start_date, position)
VALUES (tests.company_id('A'), tests.profile_id('A.welder_dra'), current_date - 30, 'First Mate');

SELECT tests.is(public.crew_positions_backfill() -> 'aliases', '7'::jsonb,
  'the backfill adds an alias per company for every legacy title that maps only through the synonym map (A: chief_mate, ab, second_stewardess, skipper, boatswain, first_mate; B: chief_mate)');
SELECT tests.results_eq(
  $q$SELECT a.alias_key, p.key, a.source FROM public.position_aliases AS a JOIN public.positions AS p ON p.id = a.position_id
     WHERE a.company_id = tests.company_id('A') AND a.source = 'backfill'$q$,
  $q$VALUES ('chief_mate', 'chief_officer', 'backfill'), ('ab', 'ab_seaman', 'backfill'), ('second_stewardess', 'second_stew', 'backfill'),
            ('skipper', 'master', 'backfill'), ('boatswain', 'bosun', 'backfill'), ('first_mate', 'chief_officer', 'backfill')$q$,
  'company A''s backfilled aliases name STORM positions (assignments, ranks, profiles and contracts all count)');
SELECT tests.is((SELECT count(*) FROM public.position_aliases WHERE company_id = tests.company_id('A') AND alias_key IN ('bosun', 'master', 'underwater_welder', 'deckhand', 'crew')),
  0::bigint, 'no alias for a title that names a position directly, nor for an unmatched one');
SELECT tests.is((SELECT count(*) FROM public.position_aliases WHERE company_id = tests.company_id('B') AND alias_key = 'chief_mate'), 1::bigint,
  'company B gets its own alias');
SELECT tests.results_eq(
  $q$SELECT position_id, is_listed, min_on_board, max_on_board FROM public.position_manning WHERE vessel_id = tests.vessel_id('A.dra')$q$,
  $q$VALUES (md5('storm.position.master')::uuid, true, 0, NULL::integer), (md5('storm.position.chief_officer')::uuid, true, 0, NULL),
            (tests.id('pos:A.dra.bosun'), true, 0, NULL), (md5('storm.position.ab_seaman')::uuid, true, 0, NULL),
            (md5('storm.position.second_stew')::uuid, true, 0, NULL)$q$,
  'the positions current assignments hold on A.dra are listed (the vessel''s own Bosun row; not the ended assignment, not the unmatched title)');
SELECT tests.is((SELECT count(*) FROM public.position_manning WHERE vessel_id = tests.vessel_id('A.hyd') AND position_id = md5('storm.position.deckhand')::uuid), 1::bigint,
  'the Deckhand of A.hyd is listed on A.hyd');
SELECT tests.is(public.crew_positions_backfill(), '{"aliases": 0, "manning": 0}'::jsonb, 'a second run adds nothing (no duplicate alias or manning row)');

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.results_eq(
  $q$SELECT title, title_key, holder_count FROM public.crew_vessel_unmatched_titles(tests.vessel_id('A.dra'))$q$,
  $q$VALUES ('Underwater Welder', 'underwater_welder', 1)$q$,
  'crew_vessel_unmatched_titles lists the one title of A.dra that maps to no position');
SELECT tests.is(
  (SELECT holder_count FROM public.crew_positions_for_vessel(tests.vessel_id('A.dra')) WHERE key = 'chief_officer'), 1,
  'crew_positions_for_vessel counts the holder of a title mapped through an alias');
SELECT tests.is(
  (SELECT holder_count FROM public.crew_positions_for_vessel(tests.vessel_id('A.dra')) WHERE key = 'second_stew'), 1,
  'and the holder of a rank (the position title unmatched)');
SELECT tests.reset_role();
ROLLBACK TO SAVEPOINT backfill;

-- ------------------------------------------------------------ 4. RLS

-- A company contract type and manning rows on two vessels of A and one of B.
INSERT INTO public.contract_types (company_id, key, label, is_system) VALUES (tests.company_id('A'), 'seasonal', 'Seasonal', false);
INSERT INTO public.position_manning (company_id, vessel_id, position_id, min_on_board) VALUES
  (tests.company_id('A'), tests.vessel_id('A.dra'), md5('storm.position.master')::uuid, 1),
  (tests.company_id('A'), tests.vessel_id('A.hyd'), md5('storm.position.deckhand')::uuid, 2),
  (tests.company_id('B'), tests.vessel_id('B.lev'), md5('storm.position.master')::uuid, 1);

-- Reference tables: active users only.
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is((SELECT count(*) FROM public.ref_countries), 250::bigint, 'an active crew member reads the countries');
SELECT tests.ok((SELECT count(*) FROM public.ref_languages) >= 53 AND (SELECT count(*) FROM public.departments) = 13, 'and the languages and departments');
SELECT tests.results_eq('SELECT key FROM public.contract_types', $q$VALUES ('permanent'), ('rotational'), ('temporary'), ('seasonal')$q$,
  'contract types: the system rows and their own company''s');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is((SELECT count(*) FROM public.contract_types WHERE key = 'seasonal'), 0::bigint, 'another company''s contract type is not visible');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is_empty('SELECT * FROM public.ref_countries', 'an inactive user reads no country');
SELECT tests.is_empty('SELECT * FROM public.ref_languages', 'no language');
SELECT tests.is_empty('SELECT * FROM public.departments', 'no department');
SELECT tests.is_empty('SELECT * FROM public.contract_types', 'no contract type');
SELECT tests.is_empty('SELECT * FROM public.positions', 'no position, not even a system row');
SELECT tests.is_empty('SELECT * FROM public.position_aliases', 'no alias');
SELECT tests.is_empty('SELECT * FROM public.position_manning', 'no manning row');
SELECT tests.as_anon();
SELECT tests.denied('SELECT * FROM public.ref_countries', 'anon reads no country (no grant)');
SELECT tests.denied('SELECT * FROM public.positions', 'anon reads no position');
SELECT tests.denied('SELECT * FROM public.position_manning', 'anon reads no manning row');

-- Positions by scope.
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is((SELECT count(*) FROM public.positions WHERE company_id IS NULL), 100::bigint, 'system rows: every active user');
SELECT tests.results_eq(
  $q$SELECT id FROM public.positions WHERE company_id IS NOT NULL$q$,
  $q$SELECT tests.id('pos:' || r) FROM unnest(ARRAY['A.co.bosun', 'A.co.yacht_manager', 'A.co.night_watchman', 'A.co.deck_hand_lead', 'A.hyd.aerial_photographer']) AS r$q$,
  'company rows for members; vessel rows only of the vessel they reach (A.hyd), not A.dra''s');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.results_eq(
  $q$SELECT id FROM public.positions WHERE vessel_id IS NOT NULL$q$,
  $q$SELECT tests.id('pos:' || r) FROM unnest(ARRAY['A.dra.bosun', 'A.dra.tender_captain']) AS r$q$,
  'the DRAAK master sees the vessel rows of A.dra only');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.results_eq($q$SELECT id FROM public.positions WHERE company_id IS NOT NULL$q$, $q$VALUES (tests.id('pos:B.co.deck_supervisor'))$q$,
  'another company sees only its own company rows');
SELECT tests.results_eq($q$SELECT alias_key FROM public.position_aliases$q$, $q$VALUES ('night_guard')$q$, 'aliases: only its own company''s');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is((SELECT count(*) FROM public.position_aliases), (SELECT count(*) FROM fx, jsonb_array_elements(cases -> 'aliases') AS a WHERE a ->> 'company' = 'A'),
  'a member reads every alias of the company');

-- Manning: vessels where the caller holds crew_list.view.
SELECT tests.is_empty('SELECT * FROM public.position_manning', 'manning: a crew member without crew_list.view reads none, even on their vessel');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.results_eq('SELECT vessel_id FROM public.position_manning', $q$VALUES (tests.vessel_id('A.dra'))$q$,
  'the DRAAK master reads A.dra''s manning only (A.hyd is out of reach)');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.results_eq('SELECT vessel_id FROM public.position_manning', $q$VALUES (tests.vessel_id('A.dra')), (tests.vessel_id('A.hyd'))$q$,
  'the fleet manager reads every vessel of the company, none of another');

-- No browser writes.
SELECT tests.denied(format($q$INSERT INTO public.positions (company_id, key, name, department_key, rank_tier) VALUES (%L, 'x_pos', 'X', 'deck', 'rating')$q$, tests.company_id('A')),
  'the browser cannot insert a position (no grant)');
SELECT tests.denied(format($q$UPDATE public.position_manning SET min_on_board = 9 WHERE vessel_id = %L$q$, tests.vessel_id('A.dra')),
  'nor update manning');
SELECT tests.denied(format($q$DELETE FROM public.position_aliases WHERE company_id = %L$q$, tests.company_id('A')), 'nor delete an alias');
SELECT tests.denied($q$UPDATE public.ref_countries SET name = 'x' WHERE iso2 = 'NL'$q$, 'nor change reference data');
SELECT tests.reset_role();

-- Integrity guards (every writer).
SELECT tests.throws(format($q$INSERT INTO public.positions (company_id, vessel_id, key, name, department_key, rank_tier) VALUES (%L, %L, 'x_pos', 'X', 'deck', 'rating')$q$,
  tests.company_id('B'), tests.vessel_id('A.dra')), '23514', 'a vessel position must belong to the vessel''s company');
SELECT tests.throws(format($q$INSERT INTO public.position_manning (company_id, vessel_id, position_id) VALUES (%L, %L, %L)$q$,
  tests.company_id('A'), tests.vessel_id('A.dra'), tests.id('pos:B.co.deck_supervisor')), '23514', 'a manning row cannot name another company''s position');
SELECT tests.throws(format($q$INSERT INTO public.position_manning (company_id, vessel_id, position_id) VALUES (%L, %L, %L)$q$,
  tests.company_id('A'), tests.vessel_id('A.dra'), tests.id('pos:A.hyd.aerial_photographer')), '23514', 'nor another vessel''s row');
SELECT tests.throws(format($q$INSERT INTO public.position_manning (company_id, vessel_id, position_id) VALUES (%L, %L, %L)$q$,
  tests.company_id('B'), tests.vessel_id('A.dra'), md5('storm.position.cook')::uuid), '23514', 'a manning row belongs to its vessel''s company');
SELECT tests.throws(format($q$INSERT INTO public.position_aliases (company_id, alias_key, alias_label, position_id) VALUES (%L, 'x_alias', 'X', %L)$q$,
  tests.company_id('A'), tests.id('pos:B.co.deck_supervisor')), '23514', 'an alias cannot name another company''s position');
SELECT tests.throws(format($q$INSERT INTO public.position_manning (company_id, vessel_id, position_id, min_on_board, max_on_board) VALUES (%L, %L, %L, 3, 2)$q$,
  tests.company_id('A'), tests.vessel_id('A.dra'), md5('storm.position.cook')::uuid), '23514', 'the maximum is never below the minimum (CHECK)');

-- ------------------------------------------------------------ 5. gate helpers

-- A vessel administrator of A.dra only: crew_certificates admin (crew_compliance follows it) and reach to A.dra alone.
SELECT tests.seed_user('A', 'A.admin_dra', 'crew');
SELECT tests.seed_assignment('A.admin_dra', 'A.dra', true, 'Purser');
INSERT INTO public.user_permission_overrides (user_id, module_key, permission, is_granted, scope, created_by, reason)
VALUES (tests.user_id('A.admin_dra'), 'crew_certificates', 'admin'::public.permission_level, true, 'vessel', tests.user_id('A.fleet_manager'), 'Crew compliance administrator (test)');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.admin_dra'), 'vessel.crew.crew_compliance.admin', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.admin_dra'), 'vessel.crew.crew_compliance.admin', tests.company_id('A'), tests.vessel_id('A.hyd')),
  'setup: the A.dra administrator holds crew_compliance.admin on A.dra, not on A.hyd');

SELECT tests.is(public.crew_vessel_cap('vessel.crew.crew_list.view', tests.vessel_id('A.dra')), false, 'crew_vessel_cap: false without a JWT');
SELECT tests.is((SELECT count(*) FROM public.crew_cap_vessel_ids('vessel.crew.crew_list.view')), 0::bigint, 'crew_cap_vessel_ids: empty without a JWT');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is(public.crew_vessel_cap('vessel.crew.crew_list.view', tests.vessel_id('A.dra')), true, 'the DRAAK master sees the crew list of A.dra');
SELECT tests.is(public.crew_vessel_cap('vessel.crew.crew_list.view', tests.vessel_id('A.hyd')), false, 'not of A.hyd (no reach)');
SELECT tests.is(public.crew_vessel_cap('vessel.crew.crew_list.view', tests.vessel_id('B.lev')), false, 'not of another company''s vessel');
SELECT tests.is(public.crew_vessel_cap('vessel.crew.crew_list.view', tests.id('vessel:nowhere')), false, 'not of an unknown vessel');
SELECT tests.is(public.crew_vessel_cap('vessel.crew.crew_compliance.admin', tests.vessel_id('A.dra')), false, 'the master does not administer crew compliance');
SELECT tests.is(public.crew_vessel_cap('vessel.crew.not_a_key.view', tests.vessel_id('A.dra')), false, 'an unknown key is false');
SELECT tests.results_eq($q$SELECT * FROM public.crew_cap_vessel_ids('vessel.crew.crew_list.view')$q$, $q$VALUES (tests.vessel_id('A.dra'))$q$,
  'crew_cap_vessel_ids: the master''s vessels holding the key');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.results_eq($q$SELECT * FROM public.crew_cap_vessel_ids('vessel.crew.crew_compliance.admin')$q$,
  $q$VALUES (tests.vessel_id('A.dra')), (tests.vessel_id('A.hyd')), (tests.vessel_id('A.gam'))$q$, 'the fleet manager administers every vessel of the company');
SELECT tests.as_user(tests.user_id('A.admin_dra'));
SELECT tests.results_eq($q$SELECT * FROM public.crew_cap_vessel_ids('vessel.crew.crew_compliance.admin')$q$, $q$VALUES (tests.vessel_id('A.dra'))$q$,
  'the A.dra administrator administers A.dra only');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is((SELECT count(*) FROM public.crew_cap_vessel_ids('vessel.crew.crew_list.view')), 0::bigint, 'a crew member holds the key nowhere');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is(public.crew_vessel_cap('vessel.crew.crew_list.view', tests.vessel_id('A.dra')), false, 'an inactive caller: false (D-233)');
SELECT tests.is((SELECT count(*) FROM public.crew_cap_vessel_ids('vessel.crew.crew_list.view')), 0::bigint, 'an inactive caller: empty');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is(public.crew_vessel_cap('vessel.crew.crew_list.view', tests.vessel_id('A.dra')), false, 'another company''s administrator: false on A.dra');

-- ------------------------------------------------------------ 6. RPCs

-- crew_positions_for_vessel
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.ok((SELECT count(*) FROM public.crew_positions_for_vessel(tests.vessel_id('A.dra'))) >= 100, 'the master reads the positions of A.dra');
SELECT tests.is((SELECT count(*) FROM public.crew_positions_for_vessel(tests.vessel_id('A.dra')) WHERE key = 'bosun'), 1::bigint, 'one row per key');
SELECT tests.results_eq(
  $q$SELECT position_id, scope FROM public.crew_positions_for_vessel(tests.vessel_id('A.dra')) WHERE key IN ('bosun', 'night_watchman', 'tender_captain', 'cook', 'aerial_photographer', 'yacht_manager')$q$,
  $q$VALUES (tests.id('pos:A.dra.bosun'), 'vessel'), (tests.id('pos:A.co.night_watchman'), 'company'), (tests.id('pos:A.dra.tender_captain'), 'vessel'),
            (md5('storm.position.cook')::uuid, 'system')$q$,
  'the vessel row beats the company row beats the system row; another vessel''s rows and inactive rows are left out');
SELECT tests.results_eq(
  $q$SELECT key, is_listed, min_on_board, holder_count FROM public.crew_positions_for_vessel(tests.vessel_id('A.dra')) LIMIT 1$q$,
  $q$VALUES ('master', true, 1, 1)$q$,
  'listed positions first, with the manning minimum and the holder count (the master''s own assignment)');
SELECT tests.is((SELECT sort_order FROM public.crew_positions_for_vessel(tests.vessel_id('A.dra')) WHERE key = 'cook'),
  (SELECT sort_order FROM public.positions WHERE id = md5('storm.position.cook')::uuid), 'without an override the vessel sort order is the base order');
SELECT tests.throws_like($q$SELECT * FROM public.crew_positions_for_vessel(tests.vessel_id('A.hyd'))$q$, '42501', 'crew_not_permitted', 'not on a vessel out of reach (42501)');
SELECT tests.throws_like($q$SELECT * FROM public.crew_positions_for_vessel(tests.id('vessel:nowhere'))$q$, 'P0002', 'vessel_not_found', 'an unknown vessel (P0002)');
SELECT tests.throws_like('SELECT * FROM public.crew_positions_for_vessel(NULL)', '22023', 'vessel_required', 'no vessel (22023)');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.throws_like($q$SELECT * FROM public.crew_positions_for_vessel(tests.vessel_id('A.hyd'))$q$, '42501', 'crew_not_permitted', 'not without crew_list.view, even on the caller''s vessel');
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_unmatched_titles(tests.vessel_id('A.hyd'))$q$, '42501', 'crew_not_permitted', 'unmatched titles: the same gate');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like($q$SELECT * FROM public.crew_positions_for_vessel(tests.vessel_id('A.dra'))$q$, '42501', 'crew_not_permitted', 'not on another company''s vessel');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws_like($q$SELECT * FROM public.crew_positions_for_vessel(tests.vessel_id('A.dra'))$q$, '42501', 'crew_not_permitted', 'not for an inactive caller');
SELECT tests.reset_role();
SELECT tests.throws_like($q$SELECT * FROM public.crew_positions_for_vessel(tests.vessel_id('A.dra'))$q$, '42501', 'not_signed_in', 'not without a JWT');

-- crew_position_create
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like($q$SELECT * FROM public.crew_position_create(tests.vessel_id('A.dra'), 'Tender Operator', 'deck', 'rating')$q$, '42501', 'positions_not_permitted',
  'a position needs crew_compliance.admin on the vessel');
SELECT tests.throws_like($q$SELECT * FROM public.crew_position_create(tests.vessel_id('A.dra'), 'Tender Operator', 'deck', 'rating', NULL, false)$q$, '42501', 'positions_not_permitted',
  'a company-wide position needs the company-level key');
SELECT tests.as_user(tests.user_id('A.admin_dra'));
SELECT tests.lives($q$SELECT * FROM public.crew_position_create(tests.vessel_id('A.dra'), '  Tender Operator ', 'deck', 'rating')$q$, 'the A.dra administrator adds a position to A.dra');
SELECT tests.reset_role();
SELECT tests.results_eq(
  $q$SELECT company_id, vessel_id, key, name, rank_tier, default_access_set_key, created_by, updated_by FROM public.positions WHERE key = 'tender_operator'$q$,
  $q$VALUES (tests.company_id('A'), tests.vessel_id('A.dra'), 'tender_operator', 'Tender Operator', 'rating', 'crew', tests.user_id('A.admin_dra'), tests.user_id('A.admin_dra'))$q$,
  'a vessel row: the key is the normalised name, the access set follows the tier, the caller is stamped');
SELECT tests.is((SELECT is_listed FROM public.position_manning WHERE vessel_id = tests.vessel_id('A.dra') AND position_id = (SELECT id FROM public.positions WHERE key = 'tender_operator')),
  true, 'and it is listed on the vessel at once');
SELECT tests.ok((SELECT sort_order FROM public.positions WHERE key = 'tender_operator') BETWEEN 40000 AND 49999, 'it ranks with the other ratings');
SELECT tests.as_user(tests.user_id('A.admin_dra'));
SELECT tests.throws_like($q$SELECT * FROM public.crew_position_create(tests.vessel_id('A.dra'), 'Tender operator', 'deck', 'rating')$q$, '22023', 'position_exists', 'the same key again: position_exists');
SELECT tests.throws_like($q$SELECT * FROM public.crew_position_create(tests.vessel_id('A.dra'), 'Cook', 'galley', 'rating')$q$, '22023', 'position_exists', 'a STORM position''s key: position_exists');
SELECT tests.throws_like($q$SELECT * FROM public.crew_position_create(tests.vessel_id('A.dra'), 'Captain', 'bridge', 'command')$q$, '22023', 'position_exists', 'a synonym of a STORM position: position_exists');
SELECT tests.throws_like($q$SELECT * FROM public.crew_position_create(tests.vessel_id('A.dra'), 'Night watchman', 'deck', 'rating')$q$, '22023', 'position_exists', 'a company position''s key: position_exists');
SELECT tests.throws_like($q$SELECT * FROM public.crew_position_create(tests.vessel_id('A.dra'), '2nd Engineer', 'engineering', 'officer')$q$, '22023', 'position_exists', 'a digit-first synonym: position_exists');
SELECT tests.throws_like($q$SELECT * FROM public.crew_position_create(tests.vessel_id('A.dra'), '3D Artist', 'media', 'rating')$q$, '22023', 'position_name_invalid', 'a key must start with a letter');
SELECT tests.throws_like($q$SELECT * FROM public.crew_position_create(tests.vessel_id('A.dra'), '   ', 'deck', 'rating')$q$, '22023', 'position_name_invalid', 'a blank name');
SELECT tests.throws_like(format('SELECT * FROM public.crew_position_create(%L, %L, ''deck'', ''rating'')', tests.vessel_id('A.dra'), repeat('x', 81)), '22023', 'position_name_invalid', 'a name over 80 characters');
SELECT tests.throws_like($q$SELECT * FROM public.crew_position_create(tests.vessel_id('A.dra'), 'Gardener', 'garden', 'rating')$q$, '22023', 'department_unknown', 'an unknown department');
SELECT tests.throws_like($q$SELECT * FROM public.crew_position_create(tests.vessel_id('A.dra'), 'Gardener', 'deck', 'captain')$q$, '22023', 'rank_tier_invalid', 'an unknown rank tier');
SELECT tests.throws_like($q$SELECT * FROM public.crew_position_create(tests.vessel_id('A.dra'), 'Gardener', 'deck', 'rating', 'full_fleet')$q$, '22023', 'access_set_invalid', 'an access set a position cannot default to');
SELECT tests.throws_like($q$SELECT * FROM public.crew_position_create(tests.vessel_id('A.hyd'), 'Gardener', 'deck', 'rating')$q$, '42501', 'positions_not_permitted', 'not on a vessel the administrator does not reach');
SELECT tests.throws_like($q$SELECT * FROM public.crew_position_create(tests.id('vessel:nowhere'), 'Gardener', 'deck', 'rating')$q$, 'P0002', 'vessel_not_found', 'an unknown vessel');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives($q$SELECT * FROM public.crew_position_create(tests.vessel_id('A.hyd'), 'Gardener', 'other', 'rating', 'view_only', false)$q$, 'the fleet manager adds a company-wide position');
SELECT tests.results_eq($q$SELECT company_id, vessel_id, default_access_set_key FROM public.positions WHERE key = 'gardener'$q$,
  $q$VALUES (tests.company_id('A'), NULL::uuid, 'view_only')$q$, 'a company row with the access set given');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is((SELECT count(*) FROM public.crew_positions_for_vessel(tests.vessel_id('A.dra')) WHERE key = 'gardener'), 1::bigint, 'a company position is visible on every vessel of the company');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like($q$SELECT * FROM public.crew_position_create(tests.vessel_id('A.dra'), 'Gardener Two', 'other', 'rating')$q$, '42501', 'positions_not_permitted', 'another company''s administrator: refused on A''s vessel');
SELECT tests.throws_like($q$SELECT * FROM public.crew_position_create(tests.vessel_id('A.dra'), 'Gardener Two', 'other', 'rating', NULL, false)$q$, '42501', 'positions_not_permitted', 'and for A''s company');
SELECT tests.is_empty($q$SELECT 1 FROM public.positions WHERE key = 'gardener_two'$q$, 'nothing was created for B');

-- crew_vessel_positions_save
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(format($q$SELECT public.crew_vessel_positions_save(%L, '[]'::jsonb)$q$, tests.vessel_id('A.dra')), '42501', 'crew_not_permitted', 'saving needs crew_compliance.admin');
SELECT tests.as_user(tests.user_id('A.admin_dra'));
SELECT tests.is(public.crew_vessel_positions_save(tests.vessel_id('A.dra'), '[]'::jsonb), 0, 'an empty save writes nothing');
SELECT tests.is(public.crew_vessel_positions_save(tests.vessel_id('A.dra'), jsonb_build_array(
    jsonb_build_object('position_id', md5('storm.position.master')::uuid, 'sort_order', 10, 'is_listed', true, 'min_on_board', 1, 'max_on_board', 1),
    jsonb_build_object('position_id', tests.id('pos:A.dra.bosun'), 'sort_order', 20, 'is_listed', true, 'min_on_board', 1, 'max_on_board', NULL),
    jsonb_build_object('position_id', md5('storm.position.cook')::uuid, 'sort_order', 30, 'is_listed', true, 'min_on_board', 0, 'max_on_board', 2),
    jsonb_build_object('position_id', tests.id('pos:A.co.night_watchman'), 'sort_order', NULL, 'is_listed', false, 'min_on_board', 0, 'max_on_board', NULL))),
  4, 'a save of four rows returns 4 (the affected count the client checks)');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.results_eq(
  $q$SELECT key, sort_order, is_listed, min_on_board, max_on_board FROM public.crew_positions_for_vessel(tests.vessel_id('A.dra')) WHERE key IN ('master', 'bosun', 'cook', 'night_watchman')$q$,
  $q$VALUES ('master', 10, true, 1, 1), ('bosun', 20, true, 1, NULL::integer), ('cook', 30, true, 0, 2),
            ('night_watchman', (SELECT sort_order FROM public.positions WHERE id = tests.id('pos:A.co.night_watchman')), false, 0, NULL)$q$,
  'the vessel''s rank order, listing and manning are stored (read back by the DRAAK master)');
SELECT tests.as_user(tests.user_id('A.admin_dra'));
SELECT tests.throws_like(format($q$SELECT public.crew_vessel_positions_save(%L, '{}'::jsonb)$q$, tests.vessel_id('A.dra')), '22023', 'rows_invalid', 'rows must be an array');
SELECT tests.throws_like(format($q$SELECT public.crew_vessel_positions_save(%L, '[1]'::jsonb)$q$, tests.vessel_id('A.dra')), '22023', 'rows_invalid', 'of objects');
SELECT tests.throws_like(format($q$SELECT public.crew_vessel_positions_save(%L, '[{"position_id": "not-a-uuid"}]'::jsonb)$q$, tests.vessel_id('A.dra')), '22023', 'rows_invalid', 'with a uuid position id');
SELECT tests.throws_like(format($q$SELECT public.crew_vessel_positions_save(%L, %L::jsonb)$q$, tests.vessel_id('A.dra'),
  jsonb_build_array(jsonb_build_object('position_id', md5('storm.position.cook')::uuid, 'min_on_board', 'two'))), '22023', 'rows_invalid', 'and whole-number minimums');
SELECT tests.throws_like(format($q$SELECT public.crew_vessel_positions_save(%L, %L::jsonb)$q$, tests.vessel_id('A.dra'),
  jsonb_build_array(jsonb_build_object('position_id', md5('storm.position.cook')::uuid), jsonb_build_object('position_id', md5('storm.position.cook')::uuid))),
  '22023', 'rows_invalid', 'each position once');
SELECT tests.throws_like(format($q$SELECT public.crew_vessel_positions_save(%L, %L::jsonb)$q$, tests.vessel_id('A.dra'),
  jsonb_build_array(jsonb_build_object('position_id', md5('storm.position.cook')::uuid, 'min_on_board', 3, 'max_on_board', 2))), '22023', 'manning_range_invalid', 'a maximum below the minimum');
SELECT tests.throws_like(format($q$SELECT public.crew_vessel_positions_save(%L, %L::jsonb)$q$, tests.vessel_id('A.dra'),
  jsonb_build_array(jsonb_build_object('position_id', md5('storm.position.cook')::uuid, 'min_on_board', -1))), '22023', 'manning_range_invalid', 'a negative minimum');
SELECT tests.throws_like(format($q$SELECT public.crew_vessel_positions_save(%L, %L::jsonb)$q$, tests.vessel_id('A.dra'),
  jsonb_build_array(jsonb_build_object('position_id', md5('storm.position.cook')::uuid, 'min_on_board', 0, 'max_on_board', 501))), '22023', 'manning_range_invalid', 'a maximum over 500');
SELECT tests.throws_like(format($q$SELECT public.crew_vessel_positions_save(%L, %L::jsonb)$q$, tests.vessel_id('A.dra'),
  jsonb_build_array(jsonb_build_object('position_id', tests.id('pos:B.co.deck_supervisor')))), '22023', 'position_unknown', 'another company''s position');
SELECT tests.throws_like(format($q$SELECT public.crew_vessel_positions_save(%L, %L::jsonb)$q$, tests.vessel_id('A.dra'),
  jsonb_build_array(jsonb_build_object('position_id', tests.id('pos:A.hyd.aerial_photographer')))), '22023', 'position_unknown', 'another vessel''s position');
SELECT tests.throws_like(format($q$SELECT public.crew_vessel_positions_save(%L, %L::jsonb)$q$, tests.vessel_id('A.dra'),
  jsonb_build_array(jsonb_build_object('position_id', tests.id('pos:A.co.yacht_manager')))), '22023', 'position_unknown', 'an inactive position');
SELECT tests.throws_like(format($q$SELECT public.crew_vessel_positions_save(%L, %L::jsonb)$q$, tests.vessel_id('A.dra'),
  jsonb_build_array(jsonb_build_object('position_id', md5('storm.position.deckhand')::uuid, 'min_on_board', 5),
                    jsonb_build_object('position_id', tests.id('pos:B.co.deck_supervisor')))), '22023', 'position_unknown', 'one bad row refuses the whole save');
SELECT tests.is((SELECT count(*) FROM public.position_manning WHERE vessel_id = tests.vessel_id('A.dra') AND position_id = md5('storm.position.deckhand')::uuid), 0::bigint,
  'and nothing of it was written');
SELECT tests.throws_like(format($q$SELECT public.crew_vessel_positions_save(%L, '[]'::jsonb)$q$, tests.vessel_id('A.hyd')), '42501', 'crew_not_permitted', 'not on a vessel the administrator does not administer');

-- crew_position_alias_set
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(format($q$SELECT * FROM public.crew_position_alias_set(%L, 'Underwater Welder', %L)$q$, tests.vessel_id('A.dra'), md5('storm.position.deckhand')::uuid),
  '42501', 'crew_not_permitted', 'mapping a title needs crew_compliance.admin');
SELECT tests.as_user(tests.user_id('A.admin_dra'));
SELECT tests.lives(format($q$SELECT * FROM public.crew_position_alias_set(%L, ' Underwater Welder ', %L)$q$, tests.vessel_id('A.dra'), md5('storm.position.deckhand')::uuid),
  'the administrator maps a title to a position');
SELECT tests.reset_role();
SELECT tests.results_eq(
  $q$SELECT company_id, alias_label, position_id, source, created_by FROM public.position_aliases WHERE alias_key = 'underwater_welder'$q$,
  $q$VALUES (tests.company_id('A'), 'Underwater Welder', md5('storm.position.deckhand')::uuid, 'manual', tests.user_id('A.admin_dra'))$q$,
  'the alias is stored for the vessel''s company, stamped');
SELECT tests.is(public.crew_position_for(tests.company_id('A'), tests.vessel_id('A.hyd'), 'Underwater Welder'), md5('storm.position.deckhand')::uuid,
  'and it maps the title on every vessel of the company');
SELECT tests.as_user(tests.user_id('A.admin_dra'));
SELECT tests.lives(format($q$SELECT * FROM public.crew_position_alias_set(%L, 'Underwater Welder', %L)$q$, tests.vessel_id('A.dra'), tests.id('pos:A.dra.tender_captain')),
  'an administrator holding the company-level answer re-points it');
-- D-376: an administrator through a role bound to DRAAK (vessel scope) is
-- no company-wide administrator: no company position, no re-point; their
-- own vessel's positions and new titles stay theirs.
SELECT tests.reset_role();
SELECT tests.seed_role('x11_vessel_admin', 'vessel');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'crew_certificates', 'admin', 'vessel' FROM public.roles AS r WHERE r.name = 'x11_vessel_admin';
SELECT tests.seed_user('A', 'A.vbadmin', 'crew');
SELECT tests.seed_assignment('A.vbadmin', 'A.dra', true, 'Third Officer');
SELECT tests.seed_rbac_role('A.vbadmin', 'x11_vessel_admin', 'A.dra');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.vbadmin'), 'vessel.crew.crew_compliance.admin', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_company_capability_for(tests.user_id('A.vbadmin'), 'vessel.crew.crew_compliance.admin', tests.company_id('A')),
                'setup: A.vbadmin administers DRAAK through a vessel-bound role, not the company');
SELECT tests.as_user(tests.user_id('A.vbadmin'));
SELECT tests.throws_like($q$SELECT * FROM public.crew_position_create(tests.vessel_id('A.dra'), 'Hull Inspector Probe', 'deck', 'officer', NULL, false)$q$, '42501', 'positions_not_permitted',
  'a vessel-bound administrator cannot add a company-wide position');
SELECT tests.throws_like(format($q$SELECT * FROM public.crew_position_alias_set(%L, 'Underwater Welder', %L)$q$, tests.vessel_id('A.dra'), md5('storm.position.deckhand')::uuid),
  '42501', 'alias_change_not_permitted', 'nor re-point a title mapped for the whole company');
SELECT tests.lives($q$SELECT * FROM public.crew_position_create(tests.vessel_id('A.dra'), 'Hull Inspector Probe', 'deck', 'officer')$q$,
  'but still adds a position to DRAAK (p_vessel_only)');
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT vessel_id FROM public.positions WHERE key = 'hull_inspector_probe'$q$, $q$VALUES (tests.vessel_id('A.dra'))$q$,
  'the vessel-bound administrator''s position is DRAAK''s, never the company''s');
SELECT tests.is((SELECT position_id FROM public.position_aliases WHERE alias_key = 'underwater_welder' AND company_id = tests.company_id('A')), tests.id('pos:A.dra.tender_captain'),
  'and the company alias still points where the company administrator put it');
SELECT tests.as_user(tests.user_id('A.admin_dra'));
SELECT tests.throws_like(format($q$SELECT * FROM public.crew_position_alias_set(%L, 'Master', %L)$q$, tests.vessel_id('A.dra'), md5('storm.position.deckhand')::uuid),
  '22023', 'alias_is_position', 'a title that names a position needs no alias');
SELECT tests.throws_like(format($q$SELECT * FROM public.crew_position_alias_set(%L, '  ', %L)$q$, tests.vessel_id('A.dra'), md5('storm.position.deckhand')::uuid),
  '22023', 'alias_invalid', 'a blank title');
SELECT tests.throws_like(format($q$SELECT * FROM public.crew_position_alias_set(%L, 'Gate Keeper', %L)$q$, tests.vessel_id('A.dra'), tests.id('pos:B.co.deck_supervisor')),
  '22023', 'position_unknown', 'another company''s position');
SELECT tests.throws_like(format($q$SELECT * FROM public.crew_position_alias_set(%L, 'Gate Keeper', %L)$q$, tests.vessel_id('A.dra'), tests.id('pos:A.hyd.aerial_photographer')),
  '22023', 'position_unknown', 'another vessel''s position');
SELECT tests.throws_like(format($q$SELECT * FROM public.crew_position_alias_set(%L, 'Gate Keeper', NULL)$q$, tests.vessel_id('A.dra')),
  '22023', 'position_unknown', 'no position');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(format($q$SELECT * FROM public.crew_position_alias_set(%L, 'Gate Keeper', %L)$q$, tests.vessel_id('A.dra'), md5('storm.position.deckhand')::uuid),
  '42501', 'crew_not_permitted', 'another company''s administrator cannot map A''s titles');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws_like(format($q$SELECT * FROM public.crew_position_alias_set(%L, 'Gate Keeper', %L)$q$, tests.vessel_id('A.dra'), md5('storm.position.deckhand')::uuid),
  '42501', 'crew_not_permitted', 'nor an inactive caller');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 7. grants

SELECT tests.is_empty(
  $q$SELECT p.oid::regprocedure::text FROM pg_proc AS p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('crew_vessel_cap', 'crew_cap_vessel_ids', 'crew_vessel_gate', 'crew_position_synonym', 'crew_position_for', 'crew_positions_backfill',
                         'crew_positions_for_vessel', 'crew_vessel_unmatched_titles', 'crew_position_create', 'crew_vessel_positions_save', 'crew_position_alias_set',
                         'positions_scope_guard', 'position_manning_scope_guard', 'position_aliases_scope_guard')
       AND (has_function_privilege('anon', p.oid, 'EXECUTE')
            OR EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))$q$,
  'no function of this file is executable by anon or PUBLIC');
SELECT tests.ok(NOT has_function_privilege('authenticated', 'public.crew_position_for(uuid,uuid,text)', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.crew_vessel_gate(text,uuid,text)', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.crew_position_synonym(text)', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.crew_positions_backfill()', 'EXECUTE'),
  'the internals (crew_position_for, crew_vessel_gate, crew_position_synonym, crew_positions_backfill) are not executable by authenticated');
SELECT tests.ok(has_function_privilege('authenticated', 'public.crew_vessel_cap(text,uuid)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.crew_cap_vessel_ids(text)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.crew_positions_for_vessel(uuid)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.crew_position_create(uuid,text,text,text,text,boolean)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.crew_vessel_positions_save(uuid,jsonb)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.crew_position_alias_set(uuid,text,uuid)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.crew_vessel_unmatched_titles(uuid)', 'EXECUTE'),
  'the gate helpers and the RPCs are executable by authenticated');
SELECT tests.is_empty(
  $q$SELECT c.relname FROM pg_class AS c
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relname IN ('ref_countries', 'ref_languages', 'departments', 'contract_types', 'positions', 'position_aliases', 'position_manning')
       AND (has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
            OR has_table_privilege('authenticated', c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
            OR NOT has_table_privilege('authenticated', c.oid, 'SELECT')
            OR NOT c.relrowsecurity)$q$,
  'every table: RLS on, SELECT only for authenticated, nothing for anon');
SELECT tests.is_empty(
  $q$SELECT p.oid::regprocedure::text FROM pg_proc AS p
     WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
       AND p.proname IN ('crew_vessel_cap', 'crew_cap_vessel_ids', 'crew_vessel_gate', 'crew_positions_for_vessel', 'crew_vessel_unmatched_titles',
                         'crew_position_create', 'crew_vessel_positions_save', 'crew_position_alias_set')
       AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) AS c WHERE c = 'search_path=public')$q$,
  'every definer of this file pins search_path = public');
