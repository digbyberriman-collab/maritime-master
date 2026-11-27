-- Crew import staging tenancy (X1-13, 20261124061200_crew_import_tenancy.sql;
-- gap/04 headline 9; DECISIONS D-181, D-X1-17):
--   1. the schema: company_id on crew_import and vessels_import (FK,
--      index), the two USING (true) read policies gone, the scoped ones in
--      place, crew_import_active a security-invoker view;
--   2. the backfill: vessels_import by a name of exactly one company;
--      crew_import when every source names the same company (the planner
--      key, the synced profile, the Airtable sync map, the vessels_import
--      row, the vessel text); conflicting, ambiguous and missing evidence
--      stays NULL; a re-run changes nothing;
--   3. reads: a planner viewer sees their company's rows only, through
--      crew_import, crew_import_active and vessels_import; another tenant,
--      a member without planner view, an inactive user and anon see
--      nothing; unattributed rows are the service role's only; the browser
--      writes nothing directly;
--   4. crew_import_stage: the gate (inactive, company, own company,
--      unknown company, planner edit, anon), the row cap (500 accepted,
--      501 refused), the per-row outcomes (created, updated, and every
--      refusal), what it writes and what it never touches (another
--      tenant's row, an unattributed row, the ignored fields);
--   5. sync_crew_import_to_profiles: only the caller's company's staged
--      rows become profiles; another company's id, a planner editor
--      without the sync roles and an inactive caller are refused;
--   6. grants.

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ world

SELECT tests.seed_user('A', 'A.x113_planner', 'crew');
SELECT tests.seed_user_role('A.x113_planner', 'captain', 'A');      -- planner editor and legacy sync role
SELECT tests.seed_user('A', 'A.x113_viewer', 'crew');
SELECT tests.seed_user_role('A.x113_viewer', 'crew', 'A');          -- planner viewer only
SELECT tests.seed_user('A', 'A.x113_hod', 'crew');
SELECT tests.seed_user_role('A.x113_hod', 'hod', 'A');              -- planner editor without the sync roles
SELECT tests.seed_user('A', 'A.x113_none', 'crew');                 -- a member with no planner access
SELECT tests.seed_user('A', 'A.x113_off', 'crew', 'disabled');
SELECT tests.seed_user_role('A.x113_off', 'captain', 'A');          -- would edit, but inactive
SELECT tests.seed_user('B', 'B.x113_planner', 'crew');
SELECT tests.seed_user_role('B.x113_planner', 'captain', 'B');

SELECT tests.seed_vessel('A', 'A.twin', 'TWIN STAR');
SELECT tests.seed_vessel('B', 'B.twin', 'Twin Star');

SELECT tests.ok(public.frp_can_edit(tests.user_id('A.x113_planner')) AND public.frp_can_edit(tests.user_id('A.x113_hod'))
                AND public.frp_can_edit(tests.user_id('B.x113_planner')),
  'setup: the planners and the head of department are planner editors');
SELECT tests.ok(public.frp_can_view(tests.user_id('A.x113_viewer')) AND NOT public.frp_can_edit(tests.user_id('A.x113_viewer')),
  'setup: the viewer views the planner and does not edit it');
SELECT tests.ok(NOT public.frp_can_view(tests.user_id('A.x113_none')) AND NOT public.frp_can_view(tests.user_id('A.x113_off')),
  'setup: the plain member and the inactive captain are no planner viewers');

-- A profile of B synced from an Airtable row, and one of B that contradicts a planner key of A.
SELECT tests.seed_profile('B', 'B.x113_synced', 'crew', 'not_invited', NULL, '{"airtable_id": "rec-x113-prof-b"}'::jsonb);
SELECT tests.seed_profile('B', 'B.x113_conflict', 'crew', 'not_invited', NULL,
  jsonb_build_object('airtable_id', 'frp-' || tests.vessel_id('A.dra') || '-x113-conflict'));
INSERT INTO public.airtable_sync_map (company_id, profile_user_id, airtable_record_id)
VALUES (tests.company_id('A'), tests.id('x113:map-user'), 'rec-x113-map-a');

INSERT INTO public.vessels_import (airtable_id, name) VALUES
  ('vi-x113-dra', 'Draak'), ('vi-x113-lev', 'Leviathan'), ('vi-x113-twin', 'Twin Star'), ('vi-x113-none', 'Nowhere');

INSERT INTO public.crew_import (airtable_id, first_name, last_name, vessel, vessel_airtable_id, personal_email, date_of_birth, is_archived) VALUES
  ('frp-' || tests.vessel_id('A.dra') || '-x113-new', 'Bosun', 'x113a', NULL, NULL, 'bosun.x113a@example.test', DATE '1985-03-04', false),
  ('rec-x113-prof-b', 'Cook', 'x113b', NULL, NULL, NULL, NULL, false),
  ('rec-x113-map-a', 'Steward', 'x113c', NULL, NULL, 'steward.x113c@example.test', NULL, false),
  ('rec-x113-vref-b', 'Engineer', 'x113d', NULL, 'vi-x113-lev', NULL, NULL, false),
  ('rec-x113-vtext-a', 'Deckhand', 'x113e', 'Draak, Hydra', NULL, NULL, NULL, false),
  ('frp-' || tests.vessel_id('A.dra') || '-x113-conflict', 'Mate', 'x113f', NULL, NULL, NULL, NULL, false),
  ('rec-x113-twin', 'Chef', 'x113g', 'Twin Star', 'vi-x113-twin', NULL, NULL, false),
  ('rec-x113-orphan', 'Purser', 'x113h', NULL, NULL, NULL, NULL, false),
  ('rec-x113-arch-a', 'Officer', 'x113i', 'M/Y DRAAK', NULL, NULL, NULL, true);

CREATE TEMP TABLE outj (k text PRIMARY KEY, j jsonb) ON COMMIT DROP;
GRANT ALL ON outj TO PUBLIC;
CREATE TEMP TABLE staged (k text, row_index integer, staging_key text, outcome text, reason text, field text) ON COMMIT DROP;
GRANT ALL ON staged TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.co(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT company_id FROM public.crew_import WHERE airtable_id = p_key
$$;
CREATE OR REPLACE FUNCTION pg_temp.vco(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT company_id FROM public.vessels_import WHERE airtable_id = p_key
$$;

-- ------------------------------------------------------------ 1. schema

SELECT tests.ok((SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'company_id'
                 AND table_name IN ('crew_import', 'vessels_import') AND is_nullable = 'YES' AND data_type = 'uuid') = 2,
  'crew_import and vessels_import have a nullable company_id');
SELECT tests.ok((SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND confdeltype = 'c' AND confrelid = 'public.companies'::regclass
                 AND conname IN ('crew_import_company_id_fkey', 'vessels_import_company_id_fkey')) = 2,
  'both company columns reference companies, ON DELETE CASCADE');
SELECT tests.ok(to_regclass('public.crew_import_company_idx') IS NOT NULL AND to_regclass('public.vessels_import_company_idx') IS NOT NULL,
  'both company columns are indexed');
SELECT tests.is_empty($q$SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('crew_import', 'vessels_import')
                        AND policyname IN ('crew_import_read_authenticated', 'vessels_import_read_authenticated')$q$,
  'the two USING (true) read policies are gone');
SELECT tests.is_empty($q$SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('crew_import', 'vessels_import')
                        AND btrim(coalesce(qual, '')) = 'true' AND roles <> ARRAY['service_role']::name[]$q$,
  'no browser policy on the staging tables is USING (true)');
SELECT tests.results_eq(
  $q$SELECT tablename::text, policyname::text, cmd::text, roles::text FROM pg_policies
     WHERE schemaname = 'public' AND tablename IN ('crew_import', 'vessels_import') ORDER BY 1, 2$q$,
  $q$VALUES ('crew_import', 'crew_import_select_company', 'SELECT', '{authenticated}'),
            ('crew_import', 'crew_import_update_privileged', 'UPDATE', '{service_role}'),
            ('crew_import', 'crew_import_write_privileged', 'INSERT', '{service_role}'),
            ('vessels_import', 'vessels_import_select_company', 'SELECT', '{authenticated}')$q$,
  'the staging policies: one scoped read each, the service-role writes of 20261123010500 untouched');
SELECT tests.ok((SELECT qual FROM pg_policies WHERE tablename = 'crew_import' AND policyname = 'crew_import_select_company')
                  ~ 'company_id IS NOT NULL' AND
                (SELECT qual FROM pg_policies WHERE tablename = 'crew_import' AND policyname = 'crew_import_select_company')
                  ~ 'SELECT (public\.)?get_user_company_id\(\( SELECT auth\.uid\(\)' AND
                (SELECT qual FROM pg_policies WHERE tablename = 'crew_import' AND policyname = 'crew_import_select_company')
                  ~ 'SELECT (public\.)?frp_can_view\(\( SELECT auth\.uid\(\)',
  'the read policy hoists the caller''s company and the planner view check (D-229)');
SELECT tests.ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.crew_import'::regclass)
                AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.vessels_import'::regclass), 'RLS stays on');
SELECT tests.ok((SELECT coalesce(reloptions @> ARRAY['security_invoker=true'], false) FROM pg_class WHERE oid = 'public.crew_import_active'::regclass),
  'crew_import_active is a security-invoker view');
SELECT tests.is((SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'crew_import_active'), 39::bigint,
  'crew_import_active keeps its 39 live columns (no company column added)');

-- ------------------------------------------------------------ 2. backfill

SELECT tests.ok(public.crew_import_vessel_key('M/Y  DRAAK ') = 'draak' AND public.crew_import_vessel_key('Draak') = 'draak'
                AND public.crew_import_vessel_key('R/V Dagon') = 'dagon' AND public.crew_import_vessel_key('  ') IS NULL
                AND public.crew_import_vessel_key(NULL) IS NULL AND public.crew_import_vessel_key('MY') = 'my',
  'the vessel-name key: case, spaces and a leading M/Y or R/V do not matter; blank is NULL');

INSERT INTO outj SELECT 'backfill1', public.crew_import_company_backfill();
SELECT tests.is((SELECT (j ->> 'vessels_import_attributed')::int FROM outj WHERE k = 'backfill1'), 2, 'backfill: two vessels_import rows attributed');
SELECT tests.is((SELECT (j ->> 'crew_import_attributed')::int FROM outj WHERE k = 'backfill1'), 6, 'backfill: six crew_import rows attributed');
SELECT tests.results_eq(
  $q$SELECT pg_temp.vco('vi-x113-dra'), pg_temp.vco('vi-x113-lev'), pg_temp.vco('vi-x113-twin'), pg_temp.vco('vi-x113-none')$q$,
  format($q$VALUES (%L::uuid, %L::uuid, NULL::uuid, NULL::uuid)$q$, tests.company_id('A'), tests.company_id('B')),
  'vessels_import: by a vessel name of exactly one company; a name of two companies and an unknown name stay NULL');
SELECT tests.results_eq(
  format($q$SELECT pg_temp.co(%L), pg_temp.co('rec-x113-prof-b'), pg_temp.co('rec-x113-map-a'), pg_temp.co('rec-x113-vref-b'),
                   pg_temp.co('rec-x113-vtext-a'), pg_temp.co('rec-x113-arch-a')$q$, 'frp-' || tests.vessel_id('A.dra') || '-x113-new'),
  format($q$VALUES (%1$L::uuid, %2$L::uuid, %1$L::uuid, %2$L::uuid, %1$L::uuid, %1$L::uuid)$q$, tests.company_id('A'), tests.company_id('B')),
  'crew_import: the planner key, the synced profile, the sync map, the vessels_import row and the vessel text each attribute');
SELECT tests.results_eq(
  format($q$SELECT pg_temp.co(%L), pg_temp.co('rec-x113-twin'), pg_temp.co('rec-x113-orphan')$q$, 'frp-' || tests.vessel_id('A.dra') || '-x113-conflict'),
  $q$VALUES (NULL::uuid, NULL::uuid, NULL::uuid)$q$,
  'crew_import: evidence for two companies, an ambiguous vessel and no evidence leave the row unattributed (fail closed)');
INSERT INTO outj SELECT 'backfill2', public.crew_import_company_backfill();
SELECT tests.ok((SELECT (j ->> 'crew_import_attributed')::int = 0 AND (j ->> 'vessels_import_attributed')::int = 0 FROM outj WHERE k = 'backfill2'),
  'backfill: a re-run attributes nothing more');
UPDATE public.crew_import SET company_id = tests.company_id('B') WHERE airtable_id = 'rec-x113-map-a';
SELECT public.crew_import_company_backfill();
SELECT tests.is(pg_temp.co('rec-x113-map-a'), tests.company_id('B'), 'backfill: an attributed row is never changed');
UPDATE public.crew_import SET company_id = tests.company_id('A') WHERE airtable_id = 'rec-x113-map-a';

-- ------------------------------------------------------------ 3. reads

SELECT tests.as_user(tests.user_id('A.x113_viewer'));
SELECT tests.results_eq($q$SELECT airtable_id FROM public.crew_import WHERE airtable_id LIKE '%x113%' ORDER BY 1$q$,
  format($q$VALUES (%L), ('rec-x113-arch-a'), ('rec-x113-map-a'), ('rec-x113-vtext-a')$q$, 'frp-' || tests.vessel_id('A.dra') || '-x113-new'),
  'a planner viewer of A reads A''s staged rows, the archived one included');
SELECT tests.results_eq($q$SELECT airtable_id FROM public.crew_import_active WHERE airtable_id LIKE '%x113%' ORDER BY 1$q$,
  format($q$VALUES (%L), ('rec-x113-map-a'), ('rec-x113-vtext-a')$q$, 'frp-' || tests.vessel_id('A.dra') || '-x113-new'),
  'through crew_import_active: the same rows, without the archived one');
SELECT tests.results_eq($q$SELECT airtable_id FROM public.vessels_import WHERE airtable_id LIKE 'vi-x113%' ORDER BY 1$q$,
  $q$VALUES ('vi-x113-dra')$q$, 'vessels_import: A''s vessel only');
SELECT tests.is_empty(format($q$SELECT 1 FROM public.crew_import WHERE company_id IS DISTINCT FROM %L$q$, tests.company_id('A')),
  'the viewer reads no row of another company and no unattributed row');

SELECT tests.as_user(tests.user_id('B.x113_planner'));
SELECT tests.results_eq($q$SELECT airtable_id FROM public.crew_import WHERE airtable_id LIKE '%x113%' ORDER BY 1$q$,
  $q$VALUES ('rec-x113-prof-b'), ('rec-x113-vref-b')$q$, 'another tenant reads its own staged rows only');
SELECT tests.is_empty(format($q$SELECT 1 FROM public.crew_import WHERE company_id = %L OR company_id IS NULL$q$, tests.company_id('A')),
  'another tenant reads nothing of A from crew_import, and no unattributed row');
SELECT tests.is_empty(format($q$SELECT 1 FROM public.crew_import_active WHERE airtable_id IN ('rec-x113-map-a', 'rec-x113-vtext-a', 'rec-x113-orphan', %L)$q$,
                             'frp-' || tests.vessel_id('A.dra') || '-x113-new'),
  'another tenant reads nothing of A from crew_import_active');
SELECT tests.is_empty($q$SELECT 1 FROM public.vessels_import WHERE airtable_id IN ('vi-x113-dra', 'vi-x113-twin', 'vi-x113-none')$q$,
  'another tenant reads nothing of A from vessels_import, and no unattributed vessel');

SELECT tests.as_user(tests.user_id('A.x113_none'));
SELECT tests.is_empty($q$SELECT 1 FROM public.crew_import$q$, 'a member without planner view reads no staged row');
SELECT tests.is_empty($q$SELECT 1 FROM public.vessels_import$q$, 'nor an imported vessel');
SELECT tests.as_user(tests.user_id('A.x113_off'));
SELECT tests.is_empty($q$SELECT 1 FROM public.crew_import$q$, 'an inactive captain reads no staged row');
SELECT tests.is_empty($q$SELECT 1 FROM public.crew_import_active$q$, 'nor through the view');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is_empty($q$SELECT 1 FROM public.crew_import$q$, 'a disabled member reads nothing');
SELECT tests.as_anon();
SELECT tests.denied($q$SELECT * FROM public.crew_import$q$, 'anon reads no staged row');
SELECT tests.denied($q$SELECT * FROM public.crew_import_active$q$, 'anon reads nothing through the view');
SELECT tests.denied($q$SELECT * FROM public.vessels_import$q$, 'anon reads no imported vessel');

SELECT tests.as_service();
SELECT tests.is((SELECT count(*) FROM public.crew_import WHERE airtable_id LIKE '%x113%'), 9::bigint, 'the service role reads every staged row');
SELECT tests.is((SELECT count(*) FROM public.crew_import WHERE airtable_id LIKE '%x113%' AND company_id IS NULL), 3::bigint,
  'the unattributed rows are the service role''s');
SELECT tests.is((SELECT count(*) FROM public.vessels_import WHERE airtable_id LIKE 'vi-x113%' AND company_id IS NULL), 2::bigint,
  'and the unattributed vessels');

SELECT tests.as_user(tests.user_id('A.x113_planner'));
SELECT tests.denied($q$INSERT INTO public.crew_import (airtable_id, first_name) VALUES ('x113-direct', 'Direct')$q$,
  'a planner editor cannot insert a staged row directly');
SELECT tests.denied($q$UPDATE public.crew_import SET first_name = 'Changed' WHERE airtable_id = 'rec-x113-map-a'$q$,
  'nor update one');
SELECT tests.denied($q$DELETE FROM public.crew_import WHERE airtable_id = 'rec-x113-map-a'$q$, 'nor delete one');
SELECT tests.denied($q$INSERT INTO public.vessels_import (airtable_id, name) VALUES ('vi-x113-direct', 'Direct')$q$,
  'nor insert an imported vessel');
SELECT tests.reset_role();
SELECT tests.is((SELECT first_name FROM public.crew_import WHERE airtable_id = 'rec-x113-map-a'), 'Steward', 'the refused direct writes changed nothing');

-- ------------------------------------------------------------ 4. crew_import_stage

-- the gate
SELECT tests.as_user(tests.user_id('A.x113_viewer'));
SELECT tests.throws_like(format($q$SELECT * FROM public.crew_import_stage(%L, '[]'::jsonb)$q$, tests.company_id('A')), '42501', 'not_permitted',
  'a planner viewer cannot stage');
SELECT tests.as_user(tests.user_id('A.x113_none'));
SELECT tests.throws_like(format($q$SELECT * FROM public.crew_import_stage(%L, '[]'::jsonb)$q$, tests.company_id('A')), '42501', 'not_permitted',
  'a member without planner access cannot stage');
SELECT tests.as_user(tests.user_id('A.x113_off'));
SELECT tests.throws_like(format($q$SELECT * FROM public.crew_import_stage(%L, '[]'::jsonb)$q$, tests.company_id('A')), '42501', 'not_signed_in',
  'an inactive captain cannot stage');
SELECT tests.as_user(tests.user_id('A.x113_planner'));
SELECT tests.throws_like(format($q$SELECT * FROM public.crew_import_stage(%L, '[]'::jsonb)$q$, tests.company_id('B')), '42501', 'company_mismatch',
  'a planner of A cannot stage for company B');
SELECT tests.throws_like(format($q$SELECT * FROM public.crew_import_stage(%L, '[]'::jsonb)$q$, gen_random_uuid()), '42501', 'company_mismatch',
  'an unknown company id answers like a foreign one');
SELECT tests.throws_like($q$SELECT * FROM public.crew_import_stage(NULL, '[]'::jsonb)$q$, '22023', 'company_required', 'a company is required');
SELECT tests.throws_like(format($q$SELECT * FROM public.crew_import_stage(%L, '{"airtable_id": "x"}'::jsonb)$q$, tests.company_id('A')), '22023', 'rows_not_array',
  'the rows must be a list');
SELECT tests.throws_like(format($q$SELECT * FROM public.crew_import_stage(%L, NULL)$q$, tests.company_id('A')), '22023', 'rows_not_array',
  'a missing list is refused');
SELECT tests.throws_like(format($q$SELECT * FROM public.crew_import_stage(%L, (SELECT jsonb_agg('{}'::jsonb) FROM generate_series(1, 501)))$q$, tests.company_id('A')),
  '22023', 'too_many_rows', 'at most 500 rows: 501 are refused');
SELECT tests.is((SELECT count(*) FROM public.crew_import_stage(tests.company_id('A'), (SELECT jsonb_agg('{}'::jsonb) FROM generate_series(1, 500))) AS s
                 WHERE s.outcome = 'refused' AND s.reason = 'key_missing'), 500::bigint,
  '500 rows are accepted (each answered; these have no key)');
SELECT tests.is_empty(format($q$SELECT * FROM public.crew_import_stage(%L, '[]'::jsonb)$q$, tests.company_id('A')), 'an empty list answers no row');
SELECT tests.as_anon();
SELECT tests.throws(format($q$SELECT * FROM public.crew_import_stage(%L, '[]'::jsonb)$q$, tests.company_id('A')), '42501', 'anon cannot call it');

-- the outcomes
SELECT tests.as_user(tests.user_id('A.x113_planner'));
INSERT INTO staged
SELECT 'main', s.* FROM public.crew_import_stage(tests.company_id('A'), jsonb_build_array(
  jsonb_build_object('airtable_id', ' frp-' || tests.vessel_id('A.dra') || '-x113-s1 ', 'first_name', ' Deck ', 'last_name', 'Hand',
                     'personal_email', 'deck.hand.x113@example.test', 'date_of_birth', '1990-05-01', 'crew_id', '42', 'vessel', '',
                     'company_id', tests.company_id('B'), 'is_archived', true, 'status', 'disabled', 'photo_url', 'https://example.test/x.png'),
  jsonb_build_object('airtable_id', 'frp-' || tests.vessel_id('A.dra') || '-x113-new', 'role', 'Bosun'),
  jsonb_build_object('airtable_id', 'rec-x113-prof-b', 'first_name', 'Taken'),
  jsonb_build_object('airtable_id', 'rec-x113-orphan', 'first_name', 'Claimed'),
  jsonb_build_object('airtable_id', 'frp-' || tests.vessel_id('A.dra') || '-x113-s1', 'first_name', 'Twice'),
  jsonb_build_object('first_name', 'No key'),
  jsonb_build_object('airtable_id', 'bad key!', 'first_name', 'X'),
  jsonb_build_object('airtable_id', 'x113-noname', 'role', 'Cook'),
  jsonb_build_object('airtable_id', 'x113-dob', 'first_name', 'X', 'date_of_birth', '1990-02-30'),
  jsonb_build_object('airtable_id', 'x113-mail', 'first_name', 'X', 'personal_email', 'not an email'),
  jsonb_build_object('airtable_id', 'x113-long', 'first_name', repeat('x', 201)),
  to_jsonb('just text'::text),
  jsonb_build_object('airtable_id', 'rec-x113-arch-a', 'first_name', 'Back'),
  jsonb_build_object('airtable_id', 'x113-cid', 'first_name', 'X', 'crew_id', '12a'),
  jsonb_build_object('airtable_id', 'x113-type', 'first_name', 42),
  jsonb_build_object('airtable_id', 'x113-future', 'first_name', 'X', 'date_of_birth', to_char(current_date + 1, 'YYYY-MM-DD')),
  jsonb_build_object('airtable_id', 'x113-cid2', 'first_name', 'X', 'crew_id', 1.5)
)) AS s;
SELECT tests.results_eq(
  $q$SELECT row_index, staging_key, outcome, reason, field FROM staged WHERE k = 'main' ORDER BY row_index$q$,
  format($q$VALUES
    (0, %1$L, 'staged', 'created', NULL),
    (1, %2$L, 'staged', 'updated', NULL),
    (2, 'rec-x113-prof-b', 'refused', 'key_in_use', 'airtable_id'),
    (3, 'rec-x113-orphan', 'refused', 'key_in_use', 'airtable_id'),
    (4, %1$L, 'refused', 'duplicate_in_batch', 'airtable_id'),
    (5, NULL, 'refused', 'key_missing', 'airtable_id'),
    (6, 'bad key!', 'refused', 'key_invalid', 'airtable_id'),
    (7, 'x113-noname', 'refused', 'name_missing', NULL),
    (8, 'x113-dob', 'refused', 'invalid_date_of_birth', 'date_of_birth'),
    (9, 'x113-mail', 'refused', 'invalid_email', 'personal_email'),
    (10, 'x113-long', 'refused', 'field_too_long', 'first_name'),
    (11, NULL, 'refused', 'not_an_object', NULL),
    (12, 'rec-x113-arch-a', 'refused', 'archived', NULL),
    (13, 'x113-cid', 'refused', 'invalid_crew_id', 'crew_id'),
    (14, 'x113-type', 'refused', 'invalid_value', 'first_name'),
    (15, 'x113-future', 'refused', 'invalid_date_of_birth', 'date_of_birth'),
    (16, 'x113-cid2', 'refused', 'invalid_crew_id', 'crew_id')$q$,
    'frp-' || tests.vessel_id('A.dra') || '-x113-s1', 'frp-' || tests.vessel_id('A.dra') || '-x113-new'),
  'one outcome per row, in order: created, updated, and each refusal with its reason and field');

SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT company_id, first_name, last_name, personal_email, date_of_birth, crew_id, vessel, is_archived, status, photo_url, imported_at > now() - interval '1 minute'
            FROM public.crew_import WHERE airtable_id = %L$q$, 'frp-' || tests.vessel_id('A.dra') || '-x113-s1'),
  format($q$VALUES (%L::uuid, 'Deck', 'Hand', 'deck.hand.x113@example.test', DATE '1990-05-01', 42::numeric, NULL::text, false, NULL::text, NULL::text, true)$q$,
         tests.company_id('A')),
  'the new row: the caller''s company (a company_id in the row is ignored), trimmed text, blank as NULL, the ignored fields untouched');
SELECT tests.results_eq(
  format($q$SELECT company_id, first_name, last_name, role, personal_email, date_of_birth FROM public.crew_import WHERE airtable_id = %L$q$,
         'frp-' || tests.vessel_id('A.dra') || '-x113-new'),
  format($q$VALUES (%L::uuid, 'Bosun', 'x113a', 'Bosun', 'bosun.x113a@example.test', DATE '1985-03-04')$q$, tests.company_id('A')),
  'the updated row: only the fields the row names change');
SELECT tests.results_eq(
  $q$SELECT airtable_id, company_id::text, first_name FROM public.crew_import WHERE airtable_id IN ('rec-x113-prof-b', 'rec-x113-orphan', 'rec-x113-arch-a') ORDER BY 1$q$,
  format($q$VALUES ('rec-x113-arch-a', %L, 'Officer'), ('rec-x113-orphan', NULL, 'Purser'), ('rec-x113-prof-b', %L, 'Cook')$q$,
         tests.company_id('A'), tests.company_id('B')),
  'another tenant''s row, the unattributed row and the archived row are untouched');
SELECT tests.is_empty($q$SELECT 1 FROM public.crew_import WHERE airtable_id IN ('x113-noname', 'x113-dob', 'x113-mail', 'x113-long', 'x113-cid', 'x113-type', 'x113-future', 'x113-cid2', 'bad key!')$q$,
  'refused rows write nothing');

-- B stages its own row with the same name as A's: the key decides, never the name.
SELECT tests.as_user(tests.user_id('B.x113_planner'));
INSERT INTO staged
SELECT 'b', s.* FROM public.crew_import_stage(tests.company_id('B'), jsonb_build_array(
  jsonb_build_object('airtable_id', 'frp-' || tests.vessel_id('A.dra') || '-x113-s1', 'first_name', 'Hijack'),
  jsonb_build_object('airtable_id', 'frp-' || tests.vessel_id('B.lev') || '-x113-b1', 'first_name', 'Deck', 'last_name', 'Hand'))) AS s;
SELECT tests.results_eq($q$SELECT row_index, outcome, reason FROM staged WHERE k = 'b' ORDER BY row_index$q$,
  $q$VALUES (0, 'refused', 'key_in_use'), (1, 'staged', 'created')$q$,
  'another tenant cannot take over A''s key; its own row is created');
SELECT tests.reset_role();
SELECT tests.is((SELECT first_name FROM public.crew_import WHERE airtable_id = 'frp-' || tests.vessel_id('A.dra') || '-x113-s1'), 'Deck',
  'A''s row keeps its values');

-- ------------------------------------------------------------ 5. sync_crew_import_to_profiles

SELECT tests.as_user(tests.user_id('A.x113_planner'));
SELECT tests.throws_like(format($q$SELECT public.sync_crew_import_to_profiles(%L)$q$, tests.company_id('B')), '42501', 'company_mismatch',
  'the sync refuses another company''s id');
SELECT tests.as_user(tests.user_id('A.x113_hod'));
SELECT tests.throws_like($q$SELECT public.sync_crew_import_to_profiles(NULL)$q$, '42501', 'Insufficient permissions to sync crew',
  'a planner editor without the legacy sync roles cannot sync');
SELECT tests.as_user(tests.user_id('A.x113_off'));
SELECT tests.throws_like($q$SELECT public.sync_crew_import_to_profiles(NULL)$q$, '42501', 'Insufficient permissions to sync crew',
  'an inactive captain cannot sync');
SELECT tests.as_anon();
SELECT tests.throws($q$SELECT public.sync_crew_import_to_profiles(NULL)$q$, '42501', 'anon cannot sync');

SELECT tests.as_user(tests.user_id('A.x113_planner'));
INSERT INTO outj SELECT 'syncA', public.sync_crew_import_to_profiles(tests.company_id('A'));
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT (j ->> 'inserted')::int, (j ->> 'updated')::int, (j ->> 'skipped')::int FROM outj WHERE k = 'syncA'$q$,
  $q$VALUES (4, 0, 0)$q$, 'A''s sync handles A''s four unarchived staged rows, nothing else');
SELECT tests.results_eq(
  format($q$SELECT airtable_id FROM public.profiles WHERE company_id = %L AND airtable_id LIKE '%%x113%%' ORDER BY 1$q$, tests.company_id('A')),
  format($q$VALUES (%L), (%L), ('rec-x113-map-a'), ('rec-x113-vtext-a')$q$,
         'frp-' || tests.vessel_id('A.dra') || '-x113-new', 'frp-' || tests.vessel_id('A.dra') || '-x113-s1'),
  'A''s profiles come from A''s staged rows only');
SELECT tests.is_empty(format($q$SELECT 1 FROM public.profiles WHERE company_id = %L
                                 AND (airtable_id IN ('rec-x113-vref-b', 'rec-x113-orphan', 'rec-x113-twin') OR last_name IN ('x113b', 'x113d', 'x113f', 'x113g', 'x113h'))$q$,
                             tests.company_id('A')),
  'no row of company B and no unattributed row became a profile of A (the leak of the legacy sync)');
SELECT tests.is((SELECT count(*) FROM public.profiles WHERE company_id = tests.company_id('B') AND last_name IN ('x113a', 'x113c', 'x113e')), 0::bigint,
  'and nothing of A went to B');

SELECT tests.as_user(tests.user_id('B.x113_planner'));
INSERT INTO outj SELECT 'syncB', public.sync_crew_import_to_profiles(NULL);
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT (j ->> 'inserted')::int, (j ->> 'updated')::int, (j ->> 'skipped')::int FROM outj WHERE k = 'syncB'$q$,
  $q$VALUES (2, 1, 0)$q$, 'B''s sync: its synced profile updated, its two other staged rows added');
SELECT tests.is((SELECT first_name FROM public.profiles WHERE id = tests.profile_id('B.x113_synced')), 'Cook', 'B''s own profile is the one updated');

-- ------------------------------------------------------------ 6. grants

SELECT tests.ok(has_function_privilege('authenticated', f, 'EXECUTE') AND has_function_privilege('service_role', f, 'EXECUTE')
                AND NOT has_function_privilege('anon', f, 'EXECUTE'), 'browser RPC: ' || f)
FROM unnest(ARRAY['public.crew_import_stage(uuid, jsonb)', 'public.sync_crew_import_to_profiles(uuid)']) AS f;
SELECT tests.ok(NOT has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE')
                AND has_function_privilege('service_role', f, 'EXECUTE'), 'internal: ' || f)
FROM unnest(ARRAY['public.crew_import_company_backfill()', 'public.crew_import_vessel_key(text)']) AS f;
SELECT tests.ok((SELECT prosecdef AND proconfig::text LIKE '%search_path=public%' FROM pg_proc WHERE oid = f::regprocedure), 'definer with search_path: ' || f)
FROM unnest(ARRAY['public.crew_import_stage(uuid, jsonb)', 'public.sync_crew_import_to_profiles(uuid)', 'public.crew_import_company_backfill()']) AS f;
SELECT tests.ok(has_table_privilege('authenticated', t, 'SELECT') AND NOT has_table_privilege('authenticated', t, 'INSERT')
                AND NOT has_table_privilege('authenticated', t, 'UPDATE') AND NOT has_table_privilege('authenticated', t, 'DELETE')
                AND NOT has_table_privilege('authenticated', t, 'TRUNCATE')
                AND NOT has_table_privilege('anon', t, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
  'relation: read only for the browser, nothing for anon: ' || t)
FROM unnest(ARRAY['public.crew_import', 'public.vessels_import', 'public.crew_import_active']) AS t;
SELECT tests.ok(has_table_privilege('service_role', t, 'SELECT') AND has_table_privilege('service_role', t, 'INSERT')
                AND has_table_privilege('service_role', t, 'UPDATE') AND has_table_privilege('service_role', t, 'DELETE'),
  'the service role keeps full access: ' || t)
FROM unnest(ARRAY['public.crew_import', 'public.vessels_import']) AS t;
