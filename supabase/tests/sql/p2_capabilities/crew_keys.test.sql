-- Crew keys of has_capability_for / has_capability (Phase 3 wave 1,
-- platform prep PP1; X1 spec §5; D-04): parity with the client adaptor on
-- every persona of supabase/tests/fixtures/capability-cases.json (generated
-- from src/lib/permissions/adaptor.ts by scripts/db/gen-capability-cases.mjs),
-- on the persona's own vessel and at company level; false on a vessel out
-- of reach (unless the persona reaches it), a foreign vessel, another
-- tenant, an unknown key or for an inactive persona; the vessel-scoped RBAC
-- narrowing; grants unchanged.

\set cases `cat supabase/tests/fixtures/capability-cases.json`
\set fresh `node scripts/db/gen-capability-cases.mjs --check >/dev/null 2>&1 && echo fresh || echo stale`
SELECT tests.is(:'fresh', 'fresh',
  'capability-cases.json is what the current adaptor generates (else regenerate it: node scripts/db/gen-capability-cases.mjs)');

CREATE TEMP TABLE cap_fixture ON COMMIT DROP AS SELECT :'cases'::jsonb AS doc;

SELECT tests.seed_two_tenants();
SELECT tests.seed_role('superadmin', 'fleet');

-- The personas' module permission rows are exactly the fixture's: their
-- RBAC roles' own role_permissions are removed (rolled back with the test).
DELETE FROM public.role_permissions
WHERE role_id IN (
  SELECT ro.id FROM public.roles AS ro
  WHERE ro.name IN (SELECT DISTINCT jsonb_array_elements_text(e -> 'roles') FROM cap_fixture, jsonb_array_elements(doc -> 'personas') AS e)
);

DO $$
DECLARE
  e jsonb;
  r text;
  pm jsonb;
  d text;
BEGIN
  FOR e IN SELECT x FROM cap_fixture, jsonb_array_elements(doc -> 'personas') AS x LOOP
    PERFORM tests.seed_user('A', e ->> 'key', (e ->> 'legacyRole')::public.user_role);
    PERFORM tests.seed_assignment(e ->> 'key', 'A.dra', true, 'Crew');
    FOR r IN SELECT jsonb_array_elements_text(e -> 'roles') LOOP
      PERFORM tests.seed_rbac_role(e ->> 'key', r);
      PERFORM tests.seed_user_role(e ->> 'key', r::public.app_role, 'A');
    END LOOP;
    FOR pm IN SELECT jsonb_array_elements(e -> 'permissions') LOOP
      INSERT INTO public.user_permission_overrides (user_id, module_key, permission, is_granted, scope, created_by, reason)
      VALUES (tests.user_id(e ->> 'key'), pm ->> 'module', (pm ->> 'level')::public.permission_level, true, 'vessel',
              tests.user_id('A.fleet_manager'), 'Capability parity case');
    END LOOP;
    FOR d IN SELECT jsonb_array_elements_text(e -> 'disciplines') LOOP
      INSERT INTO public.hw_practitioners (company_id, profile_id, discipline, full_name, is_active)
      VALUES (tests.company_id('A'), tests.profile_id(e ->> 'key'), d, 'Practitioner ' || (e ->> 'key'), true);
    END LOOP;
  END LOOP;
END
$$;

CREATE TEMP TABLE cap_personas ON COMMIT DROP AS
SELECT e ->> 'key' AS persona,
       e ->> 'legacyRole' AS legacy_role,
       ARRAY(SELECT jsonb_array_elements_text(e -> 'roles') ORDER BY 1) AS roles,
       ARRAY(SELECT (pm ->> 'module') || ':' || (pm ->> 'level') FROM jsonb_array_elements(e -> 'permissions') AS pm ORDER BY 1) AS perms,
       ARRAY(SELECT jsonb_array_elements_text(e -> 'disciplines') ORDER BY 1) AS disciplines
FROM cap_fixture, jsonb_array_elements(doc -> 'personas') AS e;

CREATE TEMP TABLE cap_cases ON COMMIT DROP AS
SELECT c.persona, k.key, (f.doc -> 'granted' -> c.persona) ? k.key AS want
FROM cap_personas AS c
CROSS JOIN cap_fixture AS f
CROSS JOIN LATERAL jsonb_array_elements_text(f.doc -> 'crewKeys') AS k(key);

SELECT tests.is((SELECT count(*) FROM cap_cases), ((SELECT doc -> 'counts' ->> 'cases' FROM cap_fixture))::bigint, 'one case per persona and crew key');
SELECT tests.ok((SELECT count(*) FILTER (WHERE want) FROM cap_cases) > 500 AND (SELECT count(*) FILTER (WHERE NOT want) FROM cap_cases) > 500,
  'the matrix holds both answers in volume');

-- ------------------------------------------------------------ the seeded state is the fixture's snapshot

SELECT tests.is_empty(
  $q$SELECT c.persona
     FROM cap_personas AS c
     WHERE ARRAY(SELECT DISTINCT g.role_name FROM public.get_user_roles_full(tests.user_id(c.persona)) AS g ORDER BY 1) IS DISTINCT FROM c.roles
        OR ARRAY(SELECT DISTINCT g.module_key || ':' || g.permission FROM public.get_user_rbac_permissions(tests.user_id(c.persona)) AS g ORDER BY 1) IS DISTINCT FROM c.perms
        OR (SELECT p.role::text FROM public.profiles AS p WHERE p.user_id = tests.user_id(c.persona)) IS DISTINCT FROM c.legacy_role
        OR ARRAY(SELECT DISTINCT h.discipline FROM public.hw_practitioners AS h WHERE h.profile_id = tests.profile_id(c.persona) AND h.is_active ORDER BY 1) IS DISTINCT FROM c.disciplines
        OR ARRAY(SELECT DISTINCT ur.role::text FROM public.user_roles AS ur WHERE ur.user_id = tests.user_id(c.persona) AND ur.is_active AND ur.vessel_id IS NULL ORDER BY 1) IS DISTINCT FROM c.roles
        OR NOT public.reach_vessel_for(tests.user_id(c.persona), tests.vessel_id('A.dra'))$q$,
  'every persona''s stored access state (RBAC roles, permission rows, legacy role, practitioner disciplines, user_roles, reach of A.dra) is the fixture snapshot');

-- ------------------------------------------------------------ parity (no JWT: has_capability_for)

SELECT tests.is_empty(
  $q$SELECT persona, key, want FROM cap_cases
     WHERE public.has_capability_for(tests.user_id(persona), key, tests.company_id('A'), tests.vessel_id('A.dra')) IS DISTINCT FROM want$q$,
  'has_capability_for equals the adaptor for every persona and crew key on the persona''s own vessel');
SELECT tests.is_empty(
  $q$SELECT persona, key, want FROM cap_cases
     WHERE public.has_capability_for(tests.user_id(persona), key, tests.company_id('A')) IS DISTINCT FROM want$q$,
  'with no vessel (company level) has_capability_for equals the adaptor too');

-- ------------------------------------------------------------ the same answers through has_capability, signed in

-- The cases are read before each role switch: the browser role cannot read the temp tables.
DO $$
DECLARE
  v_persona text;
  v_cases jsonb;
  c jsonb;
  v_got boolean;
  v_bad text[] := ARRAY[]::text[];
BEGIN
  FOR v_persona IN SELECT persona FROM cap_personas ORDER BY persona LOOP
    SELECT jsonb_agg(jsonb_build_object('key', key, 'want', want)) INTO v_cases FROM cap_cases WHERE persona = v_persona;
    PERFORM tests.as_user(tests.user_id(v_persona));
    FOR c IN SELECT e FROM jsonb_array_elements(v_cases) AS e LOOP
      v_got := public.has_capability(c ->> 'key', tests.company_id('A'), tests.vessel_id('A.dra'));
      IF v_got IS DISTINCT FROM (c ->> 'want')::boolean THEN
        v_bad := v_bad || format('%s %s', v_persona, c ->> 'key');
      END IF;
    END LOOP;
    PERFORM tests.reset_role();
  END LOOP;
  PERFORM tests.is(v_bad, ARRAY[]::text[], 'has_capability, called by each persona on its own vessel, gives the adaptor''s answer');
END
$$;

-- ------------------------------------------------------------ reach, foreign vessels and other tenants

SELECT tests.ok(
  (SELECT count(*) FROM cap_cases WHERE want AND NOT public.reach_vessel_for(tests.user_id(persona), tests.vessel_id('A.gam'))) > 100,
  'many granted cases belong to personas who do not reach A.gam');
SELECT tests.is_empty(
  $q$SELECT persona, key FROM cap_cases
     WHERE public.has_capability_for(tests.user_id(persona), key, tests.company_id('A'), tests.vessel_id('A.gam'))
           IS DISTINCT FROM (want AND public.reach_vessel_for(tests.user_id(persona), tests.vessel_id('A.gam')))$q$,
  'on another vessel of the company a crew key holds only where the persona reaches it (fleet reach keeps the own-vessel answer)');
SELECT tests.is_empty(
  $q$SELECT persona, key FROM cap_cases
     WHERE public.has_capability_for(tests.user_id(persona), key, tests.company_id('A'), tests.vessel_id('B.lev'))
        OR public.has_capability_for(tests.user_id(persona), key, tests.company_id('A'), gen_random_uuid())
        OR public.has_capability_for(tests.user_id(persona), key, tests.company_id('B'))
        OR public.has_capability_for(tests.user_id(persona), key, tests.company_id('B'), tests.vessel_id('B.lev'))
        OR public.has_capability_for(tests.user_id(persona), key, gen_random_uuid())
        OR public.has_capability_for(tests.user_id(persona), key, NULL, tests.vessel_id('A.dra'))$q$,
  'a foreign vessel, an unknown vessel, another tenant, an unknown company or no company: never a crew key');
SELECT tests.ok(public.has_capability_for(tests.user_id('B.admin'), 'vessel.crew.crew_list.view', tests.company_id('B'), tests.vessel_id('B.lev')),
  'company B''s DPA holds a crew key on a company B vessel');
SELECT tests.ok(NOT public.has_capability_for(tests.user_id('B.admin'), 'vessel.crew.crew_list.view', tests.company_id('A'), tests.vessel_id('A.dra'))
  AND NOT public.has_capability_for(tests.user_id('B.admin'), 'vessel.crew.crew_list.view', tests.company_id('B'), tests.vessel_id('A.dra')),
  'company B''s DPA holds no crew key in company A or on a company A vessel');
SELECT tests.ok(NOT public.has_capability_for(NULL, 'vessel.crew.crew_list.view', tests.company_id('A'), tests.vessel_id('A.dra')), 'a NULL user holds no crew key');

-- ------------------------------------------------------------ unknown keys

SELECT tests.is_empty(
  $q$SELECT k.key
     FROM cap_fixture AS f, jsonb_array_elements_text(f.doc -> 'catalogueKeys') AS k(key)
     WHERE NOT (f.doc -> 'crewKeys') ? k.key
       AND NOT (f.doc -> 'adminKeys') ? k.key
       AND (public.has_capability_for(tests.user_id('A.cap_legacy_dpa'), k.key, tests.company_id('A'), tests.vessel_id('A.dra'))
            OR public.has_capability_for(tests.user_id('A.cap_legacy_dpa'), k.key, tests.company_id('A')))$q$,
  'every other catalogue key is false even for a legacy DPA (the server answers exactly the crew and admin keys)');
SELECT tests.is_empty(
  $q$SELECT k FROM unnest(ARRAY['', 'vessel.crew.crew_list', 'vessel.crew.crew_list.delete', 'VESSEL.CREW.CREW_LIST.VIEW', 'vessel.crew.crew_list.view ',
                                'health.personnel_medical.fitness_to_work.view', 'vessel.crew.crew_medical.view', 'vessel.crew.crew_training.view',
                                'vessel.crew.unknown.view', 'hris.leave_rotation.leave_requests.view']) AS k
     WHERE public.has_capability_for(tests.user_id('A.cap_legacy_dpa'), k, tests.company_id('A'), tests.vessel_id('A.dra'))$q$,
  'malformed, unanswered (fitness_to_work, X5''s crew_medical / crew_training) and unknown keys are false');
SELECT tests.ok(NOT public.has_capability_for(tests.user_id('A.cap_legacy_dpa'), NULL, tests.company_id('A')), 'a NULL key is false');

-- ------------------------------------------------------------ a vessel-scoped RBAC row counts on its vessel only

SELECT tests.seed_user('A', 'A.cap_bound', 'crew');
SELECT tests.seed_assignment('A.cap_bound', 'A.dra', true, 'Crew');
SELECT tests.seed_assignment('A.cap_bound', 'A.hyd', true, 'Crew');
SELECT tests.seed_role('cap_bound_vessel_role', 'vessel');
SELECT tests.seed_role('cap_bound_fleet_role', 'vessel');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
VALUES ((SELECT id FROM public.roles WHERE name = 'cap_bound_vessel_role'), 'crew_roster', 'edit', 'vessel'),
       ((SELECT id FROM public.roles WHERE name = 'cap_bound_fleet_role'), 'crew_certificates', 'edit', 'fleet');
SELECT tests.seed_rbac_role('A.cap_bound', 'cap_bound_vessel_role', 'A.hyd');
SELECT tests.seed_rbac_role('A.cap_bound', 'cap_bound_fleet_role', 'A.hyd');
SELECT tests.results_eq(
  $q$SELECT k, v, public.has_capability_for(tests.user_id('A.cap_bound'), k, tests.company_id('A'), CASE WHEN v IS NULL THEN NULL ELSE tests.vessel_id(v) END)
     FROM (VALUES ('vessel.crew.crew_profiles.edit', 'A.hyd'), ('vessel.crew.crew_profiles.edit', 'A.dra'), ('vessel.crew.crew_profiles.edit', NULL),
                  ('vessel.crew.crew_certificates.edit', 'A.hyd'), ('vessel.crew.crew_certificates.edit', 'A.dra')) AS t(k, v)$q$,
  $q$VALUES ('vessel.crew.crew_profiles.edit', 'A.hyd', true), ('vessel.crew.crew_profiles.edit', 'A.dra', false), ('vessel.crew.crew_profiles.edit', NULL, true),
            ('vessel.crew.crew_certificates.edit', 'A.hyd', true), ('vessel.crew.crew_certificates.edit', 'A.dra', true)$q$,
  'a vessel-scoped permission of a role bound to A.hyd counts on A.hyd and at company level, not on A.dra; a fleet-scoped one counts everywhere (the user_has_permission vessel rule)');

-- ------------------------------------------------------------ grants unchanged (rule 5)

SELECT tests.results_eq(
  $q$SELECT p.oid::regprocedure::text, coalesce(string_agg(a.grantee::regrole::text, ',' ORDER BY a.grantee::regrole::text) FILTER (WHERE a.grantee <> p.proowner), '')
     FROM pg_proc AS p CROSS JOIN LATERAL aclexplode(p.proacl) AS a
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('has_capability', 'has_capability_for')
     GROUP BY 1$q$,
  $q$VALUES ('has_capability(text,uuid,uuid)', 'authenticated,service_role'), ('has_capability_for(uuid,text,uuid,uuid)', 'service_role')$q$,
  'has_capability and has_capability_for keep their grants (authenticated + service role; service role only)');
SELECT tests.is((SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('has_capability', 'has_capability_for')), 2::bigint,
  'one has_capability and one has_capability_for (no stray overloads)');
SELECT tests.as_user(tests.user_id('A.cap_legacy_dpa'));
SELECT tests.throws($q$SELECT public.has_capability_for(auth.uid(), 'vessel.crew.crew_list.view', tests.company_id('A'), tests.vessel_id('A.dra'))$q$, '42501',
  'authenticated still cannot execute has_capability_for');
SELECT tests.reset_role();
SELECT tests.as_anon();
SELECT tests.throws($q$SELECT public.has_capability('vessel.crew.crew_list.view', tests.company_id('A'), tests.vessel_id('A.dra'))$q$, '42501',
  'anon cannot execute has_capability');
SELECT tests.reset_role();
SELECT tests.ok(NOT public.has_capability('vessel.crew.crew_list.view', tests.company_id('A'), tests.vessel_id('A.dra')), 'has_capability without a caller is false');

-- ------------------------------------------------------------ inactive personas (last: it disables every persona)

UPDATE public.profiles SET account_status = 'disabled' WHERE user_id IN (SELECT tests.user_id(persona) FROM cap_personas);
SELECT tests.is_empty(
  $q$SELECT persona, key FROM cap_cases
     WHERE public.has_capability_for(tests.user_id(persona), key, tests.company_id('A'), tests.vessel_id('A.dra'))
        OR public.has_capability_for(tests.user_id(persona), key, tests.company_id('A'))$q$,
  'an inactive persona holds no crew key, on its vessel or at company level');
DO $$
DECLARE
  v_persona text;
  v_keys text[];
  v_key text;
  v_bad text[] := ARRAY[]::text[];
BEGIN
  SELECT ARRAY(SELECT jsonb_array_elements_text(doc -> 'crewKeys')) INTO v_keys FROM cap_fixture;
  FOREACH v_persona IN ARRAY ARRAY['A.cap_legacy_dpa', 'A.cap_rbac_superadmin', 'A.cap_legacy_master', 'A.cap_legacy_crew', 'A.cap_medic'] LOOP
    PERFORM tests.as_user(tests.user_id(v_persona));
    FOREACH v_key IN ARRAY v_keys LOOP
      IF public.has_capability(v_key, tests.company_id('A'), tests.vessel_id('A.dra')) THEN
        v_bad := v_bad || format('%s %s', v_persona, v_key);
      END IF;
    END LOOP;
    PERFORM tests.reset_role();
  END LOOP;
  PERFORM tests.is(v_bad, ARRAY[]::text[], 'a disabled persona signed in gets false from has_capability for every crew key (view_own included)');
END
$$;
