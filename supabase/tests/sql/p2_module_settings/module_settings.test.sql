-- vessel_module_settings / company_module_settings (spec §A.5; D-63, D-86,
-- C13, CC-8, CC-9): the column contract, module_enabled() == the TS
-- resolver on every case of module-settings-cases.json, reach-based reads,
-- admin-only writes with company_id stamped from the vessel, isolation,
-- anon, disabled users, ACLs.

\set cases `cat supabase/tests/fixtures/module-settings-cases.json`
\set src_sha `sha256sum src/modules/vessels/lib/moduleSettings.ts | cut -c1-64`
SELECT tests.is((:'cases'::jsonb) -> 'sourceSha256' ->> 'src/modules/vessels/lib/moduleSettings.ts', :'src_sha',
  'the fixture was generated from the current moduleSettings.ts (else regenerate it: node scripts/db/gen-module-settings-fixture.mjs)');
CREATE TEMP TABLE ms_cases ON COMMIT DROP AS
  SELECT ord, e ->> 'name' AS name, e -> 'rows' AS rows, (e ->> 'today') AS today, e ->> 'key' AS key,
         (e ->> 'storable')::boolean AS storable, (e ->> 'expected')::boolean AS expected
  FROM jsonb_array_elements((:'cases'::jsonb) -> 'cases') WITH ORDINALITY AS t(e, ord);

-- ------------------------------------------------------------ the column contract (no jsonb settings, C13)

SELECT tests.results_eq(
  $q$SELECT column_name::text, data_type::text, is_nullable::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vessel_module_settings'$q$,
  $q$VALUES ('vessel_id', 'uuid', 'NO'), ('company_id', 'uuid', 'NO'), ('module_key', 'text', 'NO'), ('enabled', 'boolean', 'NO'), ('enabled_from', 'date', 'YES'),
            ('label_override', 'text', 'YES'), ('updated_by', 'uuid', 'YES'), ('updated_at', 'timestamp with time zone', 'NO'), ('created_at', 'timestamp with time zone', 'NO')$q$,
  'vessel_module_settings has exactly the contract columns (VesselModuleSettingRow; no settings jsonb)');
SELECT tests.results_eq(
  $q$SELECT column_name::text, data_type::text, is_nullable::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'company_module_settings'$q$,
  $q$VALUES ('company_id', 'uuid', 'NO'), ('module_key', 'text', 'NO'), ('enabled', 'boolean', 'NO'), ('enabled_from', 'date', 'YES'),
            ('label_override', 'text', 'YES'), ('updated_by', 'uuid', 'YES'), ('updated_at', 'timestamp with time zone', 'NO'), ('created_at', 'timestamp with time zone', 'NO')$q$,
  'company_module_settings has exactly the contract columns (CompanyModuleSettingRow)');
SELECT tests.ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.vessel_module_settings'::regclass) AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.company_module_settings'::regclass), 'RLS is on for both tables');

-- ------------------------------------------------------------ module_enabled() == resolveModuleSettings (no JWT)

SELECT tests.seed_company('MS');
INSERT INTO public.vessels (id, company_id, name, code)
  SELECT tests.id('ms-vessel:' || ord), tests.company_id('MS'), 'Parity ' || ord,
         'P' || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', (ord / 36)::int + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', (ord % 36)::int + 1, 1)
  FROM ms_cases WHERE storable;
INSERT INTO public.vessel_module_settings (vessel_id, company_id, module_key, enabled, enabled_from, label_override)
  SELECT tests.id('ms-vessel:' || c.ord), tests.company_id('MS'), r ->> 'moduleKey', (r ->> 'enabled')::boolean, (r ->> 'enabledFrom')::date, r ->> 'labelOverride'
  FROM ms_cases AS c CROSS JOIN LATERAL jsonb_array_elements(c.rows) AS r
  WHERE c.storable;
SELECT tests.ok((SELECT count(*) FROM ms_cases WHERE storable) >= 300, 'at least 300 storable parity cases');
SELECT tests.is_empty(
  $q$SELECT ord, name, key, today, expected FROM ms_cases
     WHERE storable AND public.module_enabled(tests.id('ms-vessel:' || ord), key, today::date) IS DISTINCT FROM expected$q$,
  'module_enabled = resolveModuleSettings(...).isModuleOn(key) for every storable case (missing row, enabled false, enabled_from past / today / future, dotted parents, odd keys)');
-- vessel_module_on_internal() (review round 5, notify-ignores-module-off;
-- D-162) is the same rule without the caller clause: with no JWT it equals
-- module_enabled() and the resolver on every storable case, so the two can
-- never drift.
SELECT tests.is_empty(
  $q$SELECT ord, name, key, today, expected FROM ms_cases
     WHERE storable AND (public.vessel_module_on_internal(tests.id('ms-vessel:' || ord), key, today::date) IS DISTINCT FROM expected
                         OR public.vessel_module_on_internal(tests.id('ms-vessel:' || ord), key, today::date)
                            IS DISTINCT FROM public.module_enabled(tests.id('ms-vessel:' || ord), key, today::date))$q$,
  'vessel_module_on_internal = module_enabled = the resolver for every storable case (no JWT)');
SELECT tests.ok(NOT public.vessel_module_on_internal(NULL, 'crew_hor') AND NOT public.vessel_module_on_internal(tests.id('ms-vessel:nobody'), 'crew_hor')
                AND NOT public.vessel_module_on_internal(tests.id('ms-vessel:1'), NULL) AND NOT public.vessel_module_on_internal(tests.id('ms-vessel:1'), 'crew_hor', NULL),
                'vessel_module_on_internal: an unknown vessel, a NULL key or a NULL date is false');
SELECT tests.ok(NOT has_function_privilege('authenticated', 'public.vessel_module_on_internal(uuid,text,date)', 'EXECUTE')
                AND NOT has_function_privilege('service_role', 'public.vessel_module_on_internal(uuid,text,date)', 'EXECUTE')
                AND NOT has_function_privilege('anon', 'public.vessel_module_on_internal(uuid,text,date)', 'EXECUTE'),
                'vessel_module_on_internal is granted to nobody (definers call it)');
-- The other cases hold strings a date column never returns: the TS branch for them is unreachable from server data.
-- pg_temp.is_date is pg_input_is_valid(v, 'date') for PostgreSQL 15 too (that function is 16+; the harness floor
-- is 15). The file runs in a transaction that is rolled back, so the helper never outlives it. The casts sit in a
-- CASE behind it: the planner orders plain AND quals by cost, so they could otherwise run first and raise.
CREATE FUNCTION pg_temp.is_date(v text) RETURNS boolean LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM v::date;
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END
$f$;
SELECT tests.is_empty(
  $q$SELECT c.name, r ->> 'enabledFrom' AS v FROM ms_cases AS c CROSS JOIN LATERAL jsonb_array_elements(c.rows) AS r
     WHERE NOT c.storable AND r ->> 'enabledFrom' IS NOT NULL
       AND CASE WHEN pg_temp.is_date(r ->> 'enabledFrom')
                THEN (r ->> 'enabledFrom')::date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'
                     AND (r ->> 'enabledFrom')::date::text = r ->> 'enabledFrom'
                ELSE false END$q$,
  'no non-storable case value is a YYYY-MM-DD a date column can return (garbage, timestamps, year 10000, impossible days are refused or normalised)');
SELECT tests.ok((SELECT count(*) FROM ms_cases WHERE NOT storable) >= 10, 'the fixture pins at least 10 malformed-date cases');
SELECT tests.throws(format($q$INSERT INTO public.vessel_module_settings (vessel_id, module_key, enabled_from) VALUES (%L, 'crew_hor', 'infinity')$q$, tests.id('ms-vessel:1')), '23514', 'enabled_from infinity is refused (it would read back as a non-date)');
SELECT tests.throws(format($q$INSERT INTO public.vessel_module_settings (vessel_id, module_key, enabled_from) VALUES (%L, 'crew_hor', '10000-01-01')$q$, tests.id('ms-vessel:1')), '23514', 'a year past 9999 is refused');
SELECT tests.throws(format($q$INSERT INTO public.vessel_module_settings (vessel_id, module_key, enabled_from) VALUES (%L, 'crew_hor', '2026-11-24 BC')$q$, tests.id('ms-vessel:1')), '23514', 'a BC date is refused');
SELECT tests.throws(format($q$INSERT INTO public.vessel_module_settings (vessel_id, module_key) VALUES (%L, 'Crew_Hor')$q$, tests.id('ms-vessel:1')), '23514', 'a module key outside dotted snake_case is refused');
SELECT tests.throws(format($q$INSERT INTO public.vessel_module_settings (vessel_id, module_key, label_override) VALUES (%L, 'crew_x', '   ')$q$, tests.id('ms-vessel:1')), '23514', 'a blank label override is refused');
SELECT tests.throws(format($q$INSERT INTO public.vessel_module_settings (vessel_id, module_key, label_override) VALUES (%L, 'crew_x', repeat('L', 41))$q$, tests.id('ms-vessel:1')), '23514', 'a label override over 40 characters is refused');
SELECT tests.throws_like($q$INSERT INTO public.vessel_module_settings (vessel_id, module_key) VALUES (gen_random_uuid(), 'crew_x')$q$, '23503', 'vessel_not_found', 'a setting for an unknown vessel is refused');
SELECT tests.ok(NOT public.module_enabled(gen_random_uuid(), 'crew_hor'), 'module_enabled of an unknown vessel is false');
SELECT tests.ok(NOT public.module_enabled(tests.id('ms-vessel:1'), NULL), 'module_enabled of a NULL key is false');
SELECT tests.ok(NOT public.module_enabled(tests.id('ms-vessel:1'), 'crew_hor', NULL), 'module_enabled on a NULL date is false');

-- ------------------------------------------------------------ reads, writes, isolation

SELECT tests.seed_two_tenants();
INSERT INTO public.vessel_module_settings (vessel_id, company_id, module_key, enabled) VALUES
  (tests.vessel_id('A.dra'), tests.company_id('A'), 'charter', false),
  (tests.vessel_id('A.hyd'), tests.company_id('A'), 'charter', true),
  (tests.vessel_id('A.hyd'), tests.company_id('A'), 'crew_hor', false),
  (tests.vessel_id('B.lev'), tests.company_id('B'), 'charter', false);
INSERT INTO public.company_module_settings (company_id, module_key, enabled) VALUES
  (tests.company_id('A'), 'crew_hor', true),
  (tests.company_id('A'), 'charter', true),
  (tests.company_id('B'), 'charter', false);

SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.results_eq($q$SELECT vessel_id, module_key FROM public.vessel_module_settings$q$,
  format($q$VALUES (%L::uuid, 'charter'), (%L::uuid, 'crew_hor')$q$, tests.vessel_id('A.hyd'), tests.vessel_id('A.hyd')),
  'crew read their own vessel''s settings and not another vessel''s');
SELECT tests.ok(NOT public.module_enabled(tests.vessel_id('A.hyd'), 'crew_hor'), 'module_enabled answers for a vessel the caller reaches');
SELECT tests.ok(NOT public.module_enabled(tests.vessel_id('A.gam'), 'crew_hor'), 'module_enabled is false for a vessel the caller does not reach');
SELECT tests.is((SELECT count(*) FROM public.company_module_settings), 2::bigint, 'active members read their company''s defaults');
SELECT tests.denied(format($q$INSERT INTO public.vessel_module_settings (vessel_id, module_key, enabled) VALUES (%L, 'safety', false)$q$, tests.vessel_id('A.hyd')), 'crew cannot insert a setting');
SELECT tests.denied(format($q$UPDATE public.vessel_module_settings SET enabled = true WHERE vessel_id = %L RETURNING *$q$, tests.vessel_id('A.hyd')), 'crew cannot update a setting');
SELECT tests.denied(format($q$DELETE FROM public.vessel_module_settings WHERE vessel_id = %L RETURNING *$q$, tests.vessel_id('A.hyd')), 'crew cannot delete a setting');
SELECT tests.denied(format($q$INSERT INTO public.company_module_settings (company_id, module_key) VALUES (%L, 'safety')$q$, tests.company_id('A')), 'crew cannot write a company default');

SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.results_eq($q$SELECT vessel_id FROM public.vessel_module_settings$q$, format($q$VALUES (%L::uuid)$q$, tests.vessel_id('A.dra')), 'a master reads their vessel''s settings only');
SELECT tests.denied(format($q$UPDATE public.vessel_module_settings SET enabled = true WHERE vessel_id = %L RETURNING *$q$, tests.vessel_id('A.dra')), 'a master (not a fleet admin) cannot change their vessel''s settings');

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is((SELECT count(*) FROM public.vessel_module_settings), 3::bigint, 'fleet reach reads every vessel of the company, none of company B');
SELECT tests.ok(public.module_enabled(tests.vessel_id('A.gam'), 'crew_hor'), 'with fleet reach module_enabled answers for any company vessel');
SELECT tests.lives(format($q$INSERT INTO public.vessel_module_settings (vessel_id, company_id, module_key, enabled, label_override) VALUES (%L, %L, 'charter', true, 'Trip')$q$, tests.vessel_id('A.gam'), tests.company_id('B')), 'a fleet admin writes a setting');
SELECT tests.results_eq(
  format($q$SELECT company_id, updated_by FROM public.vessel_module_settings WHERE vessel_id = %L AND module_key = 'charter'$q$, tests.vessel_id('A.gam')),
  format($q$VALUES (%L::uuid, %L::uuid)$q$, tests.company_id('A'), tests.user_id('A.fleet_manager')),
  'company_id is stamped from the vessel even when the client sends another company''s id; updated_by is the caller');
SELECT tests.lives(format($q$UPDATE public.vessel_module_settings SET enabled_from = DATE '2030-01-01' WHERE vessel_id = %L AND module_key = 'charter'$q$, tests.vessel_id('A.gam')), 'a fleet admin updates a setting');
SELECT tests.ok(NOT public.module_enabled(tests.vessel_id('A.gam'), 'charter'), 'enabled_from in the future switches the module off');
SELECT tests.lives(format($q$DELETE FROM public.vessel_module_settings WHERE vessel_id = %L AND module_key = 'charter'$q$, tests.vessel_id('A.gam')), 'a fleet admin deletes a setting');
SELECT tests.ok(public.module_enabled(tests.vessel_id('A.gam'), 'charter'), 'no row: on again');
SELECT tests.denied(format($q$INSERT INTO public.vessel_module_settings (vessel_id, module_key, enabled) VALUES (%L, 'safety', false)$q$, tests.vessel_id('B.lev')), 'a company-A admin cannot write a company-B vessel''s setting (stamped company B fails WITH CHECK)');
SELECT tests.denied(format($q$UPDATE public.vessel_module_settings SET enabled = true WHERE vessel_id = %L RETURNING *$q$, tests.vessel_id('B.lev')), 'nor update one');
SELECT tests.lives(format($q$INSERT INTO public.company_module_settings (company_id, module_key, enabled) VALUES (%L, 'safety', false)$q$, tests.company_id('A')), 'a fleet admin writes a company default');
SELECT tests.denied(format($q$INSERT INTO public.company_module_settings (company_id, module_key, enabled) VALUES (%L, 'safety', false)$q$, tests.company_id('B')), 'but not for another company');
SELECT tests.ok(public.module_enabled(tests.vessel_id('A.gam'), 'safety'), 'a company default does not change module_enabled in Phase 2 (vessel rows only, CC-9)');
SELECT tests.ok(public.module_enabled(tests.vessel_id('A.dra'), 'crew_hor'), 'nor does the company crew_hor row');

SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.results_eq($q$SELECT vessel_id FROM public.vessel_module_settings$q$, format($q$VALUES (%L::uuid)$q$, tests.vessel_id('B.lev')), 'company B reads only its own vessel settings');
SELECT tests.is((SELECT count(*) FROM public.company_module_settings WHERE company_id = tests.company_id('A')), 0::bigint, 'company B reads none of company A''s defaults');
SELECT tests.ok(NOT public.module_enabled(tests.vessel_id('A.dra'), 'crew_hor'), 'module_enabled is false for another company''s vessel');

SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.denied('SELECT * FROM public.vessel_module_settings', 'a disabled user reads no vessel setting');
SELECT tests.denied('SELECT * FROM public.company_module_settings', 'a disabled user reads no company default');

SELECT tests.as_anon();
SELECT tests.denied('SELECT * FROM public.vessel_module_settings', 'anon reads no vessel setting');
SELECT tests.denied('SELECT * FROM public.company_module_settings', 'anon reads no company default');
SELECT tests.throws(format($q$SELECT public.module_enabled(%L, 'crew_hor')$q$, tests.vessel_id('A.dra')), '42501', 'anon cannot execute module_enabled');
SELECT tests.reset_role();

SELECT tests.ok(NOT has_table_privilege('anon', 'public.vessel_module_settings', 'SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon', 'public.company_module_settings', 'SELECT,INSERT,UPDATE,DELETE'), 'anon holds no privilege on either table');
SELECT tests.results_eq(
  $q$SELECT p.oid::regprocedure::text, coalesce(string_agg(a.grantee::regrole::text, ',' ORDER BY a.grantee::regrole::text) FILTER (WHERE a.grantee <> p.proowner), '')
     FROM pg_proc AS p CROSS JOIN LATERAL aclexplode(p.proacl) AS a
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('module_enabled', 'vessel_module_settings_stamp', 'company_module_settings_stamp')
     GROUP BY 1$q$,
  $q$VALUES ('module_enabled(uuid,text,date)', 'authenticated,service_role'), ('vessel_module_settings_stamp()', ''), ('company_module_settings_stamp()', '')$q$,
  'EXECUTE grants: module_enabled for authenticated and service_role; the trigger functions for nobody');
