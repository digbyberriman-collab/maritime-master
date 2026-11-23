-- Server capability check (spec §A.4; CC-5, CC-11, CC-14; D-04, D-125):
-- personas x the seven keys x own company / other company / own vessel /
-- foreign vessel, the user_roles company rule, ranks, user_company_for_admin,
-- is_company_actor, and the ACLs (rule 5).

SELECT tests.seed_two_tenants();
-- legacy personas
SELECT tests.seed_user('A', 'A.shore', 'shore_management');
SELECT tests.seed_user('A', 'A.ur_dpa_own', 'crew');
SELECT tests.seed_user_role('A.ur_dpa_own', 'dpa', 'A');
SELECT tests.seed_user('A', 'A.ur_super_null', 'crew');
SELECT tests.seed_user_role('A.ur_super_null', 'superadmin', NULL);
SELECT tests.seed_user('A', 'A.ur_dpa_other', 'crew');
SELECT tests.seed_user_role('A.ur_dpa_other', 'dpa', 'B');
SELECT tests.seed_user('A', 'A.ur_expired', 'crew');
SELECT tests.seed_user_role('A.ur_expired', 'dpa', 'A', true, now() - interval '1 day');
SELECT tests.seed_user('A', 'A.ur_inactive', 'crew');
SELECT tests.seed_user_role('A.ur_inactive', 'dpa', 'A', false);
SELECT tests.seed_user('A', 'A.rbac_dpa', 'crew');
SELECT tests.seed_rbac_role('A.rbac_dpa', 'dpa');
SELECT tests.seed_user('A', 'A.settings_admin', 'crew');
INSERT INTO public.user_permission_overrides (user_id, module_key, permission, is_granted, created_by, reason)
VALUES (tests.user_id('A.settings_admin'), 'settings', 'admin', true, tests.user_id('A.fleet_manager'), 'Test grant');
-- non-legacy memberships (X6 shapes)
SELECT tests.seed_user('A', 'A.owner', 'crew');
SELECT tests.seed_user('A', 'A.ua_read', 'crew');
SELECT tests.seed_user('A', 'A.ua_write_all', 'crew');
SELECT tests.seed_user('A', 'A.ua_write_hyd', 'crew');
SELECT tests.seed_user('A', 'A.dpa_flag', 'crew');
SELECT tests.seed_user('A', 'A.shore_member', 'crew');
UPDATE public.account_memberships SET legacy_managed = false, source = 'admin', kind = 'owner', vessel_scope = 'all', fleet_access = true WHERE user_id = tests.user_id('A.owner');
UPDATE public.account_memberships SET legacy_managed = false, source = 'admin', kind = 'admin', users_access_level = 'read' WHERE user_id = tests.user_id('A.ua_read');
UPDATE public.account_memberships SET legacy_managed = false, source = 'admin', kind = 'admin', users_access_level = 'write', vessel_scope = 'all', fleet_access = true WHERE user_id = tests.user_id('A.ua_write_all');
UPDATE public.account_memberships SET legacy_managed = false, source = 'admin', kind = 'admin', users_access_level = 'write' WHERE user_id = tests.user_id('A.ua_write_hyd');
UPDATE public.account_memberships SET legacy_managed = false, source = 'admin', kind = 'admin', is_dpa = true WHERE user_id = tests.user_id('A.dpa_flag');
UPDATE public.account_memberships SET legacy_managed = false, source = 'admin', kind = 'shore', users_access_level = 'write', fleet_access = true WHERE user_id = tests.user_id('A.shore_member');
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
  SELECT id, company_id, tests.vessel_id('A.hyd') FROM public.account_memberships WHERE user_id IN (tests.user_id('A.ua_read'), tests.user_id('A.ua_write_hyd'), tests.user_id('A.shore_member'));

-- ------------------------------------------------------------ the matrix (no JWT: has_capability_for)

-- Columns: persona, key, company, vessel (NULL = none), expected.
CREATE TEMP TABLE cap_cases (persona text, key text, company text, vessel text, want boolean) ON COMMIT DROP;
INSERT INTO cap_cases
SELECT p.persona, k.key, 'A', NULL,
  CASE k.key
    WHEN 'admin.access.users_access.view' THEN p.persona IN ('A.fleet_manager', 'A.shore', 'A.ur_dpa_own', 'A.ur_super_null', 'A.rbac_dpa', 'A.settings_admin', 'A.owner', 'A.ua_read', 'A.ua_write_all', 'A.ua_write_hyd')
    WHEN 'admin.access.users_access.assign' THEN p.persona IN ('A.fleet_manager', 'A.shore', 'A.ur_dpa_own', 'A.ur_super_null', 'A.rbac_dpa', 'A.settings_admin', 'A.owner', 'A.ua_write_all', 'A.ua_write_hyd')
    WHEN 'admin.access.users_access.admin' THEN p.persona IN ('A.fleet_manager', 'A.shore', 'A.ur_dpa_own', 'A.ur_super_null', 'A.rbac_dpa', 'A.settings_admin', 'A.owner', 'A.ua_write_all', 'A.ua_write_hyd')
    WHEN 'admin.access.roles_permissions.admin' THEN false
    WHEN 'admin.access.permission_audit_log.view' THEN p.persona IN ('A.fleet_manager', 'A.shore', 'A.ur_dpa_own', 'A.ur_super_null', 'A.rbac_dpa', 'A.settings_admin', 'A.owner', 'A.dpa_flag')
    WHEN 'fleet.operations.vessels.view' THEN p.persona IN ('A.fleet_manager', 'A.shore', 'A.rbac_dpa', 'A.owner', 'A.ua_write_all', 'A.shore_member')
    WHEN 'fleet.operations.vessels.admin' THEN p.persona IN ('A.fleet_manager', 'A.shore', 'A.ur_dpa_own', 'A.ur_super_null', 'A.rbac_dpa', 'A.settings_admin', 'A.owner', 'A.ua_write_all')
    ELSE false
  END
FROM (VALUES ('A.fleet_manager'), ('A.shore'), ('A.master_dra'), ('A.crew_hyd'), ('A.disabled'), ('A.ur_dpa_own'), ('A.ur_super_null'),
             ('A.ur_dpa_other'), ('A.ur_expired'), ('A.ur_inactive'), ('A.rbac_dpa'), ('A.settings_admin'), ('A.owner'), ('A.ua_read'),
             ('A.ua_write_all'), ('A.ua_write_hyd'), ('A.dpa_flag'), ('A.shore_member')) AS p(persona)
CROSS JOIN (VALUES ('admin.access.users_access.view'), ('admin.access.users_access.assign'), ('admin.access.users_access.admin'),
                   ('admin.access.roles_permissions.admin'), ('admin.access.permission_audit_log.view'),
                   ('fleet.operations.vessels.view'), ('fleet.operations.vessels.admin'), ('fleet.operations.vessels.delete'), ('')) AS k(key);

-- With a vessel: admin keys need the vessel in reach unless full admin;
-- a legacy master may assign for a vessel they reach; vessel view by reach.
INSERT INTO cap_cases VALUES
  ('A.ua_read', 'admin.access.users_access.view', 'A', 'A.hyd', true),
  ('A.ua_read', 'admin.access.users_access.view', 'A', 'A.dra', false),
  ('A.ua_write_hyd', 'admin.access.users_access.admin', 'A', 'A.hyd', true),
  ('A.ua_write_hyd', 'admin.access.users_access.admin', 'A', 'A.dra', false),
  ('A.ua_write_hyd', 'admin.access.users_access.assign', 'A', 'A.dra', false),
  ('A.ua_write_all', 'admin.access.users_access.admin', 'A', 'A.dra', true),
  ('A.fleet_manager', 'admin.access.users_access.admin', 'A', 'A.gam', true),
  ('A.owner', 'admin.access.users_access.admin', 'A', 'A.gam', true),
  ('A.master_dra', 'admin.access.users_access.assign', 'A', 'A.dra', true),
  ('A.master_dra', 'admin.access.users_access.assign', 'A', 'A.hyd', false),
  ('A.master_dra', 'admin.access.users_access.admin', 'A', 'A.dra', false),
  ('A.master_dra', 'admin.access.users_access.view', 'A', 'A.dra', false),
  ('A.master_dra', 'fleet.operations.vessels.view', 'A', 'A.dra', true),
  ('A.master_dra', 'fleet.operations.vessels.view', 'A', 'A.hyd', false),
  ('A.crew_hyd', 'fleet.operations.vessels.view', 'A', 'A.hyd', true),
  ('A.crew_hyd', 'fleet.operations.vessels.admin', 'A', 'A.hyd', false),
  ('A.shore_member', 'fleet.operations.vessels.view', 'A', 'A.dra', true),
  ('A.shore_member', 'admin.access.users_access.admin', 'A', 'A.hyd', false),
  ('A.disabled', 'fleet.operations.vessels.view', 'A', 'A.dra', false),
  -- a foreign vessel (company B's) under company A: always false
  ('A.fleet_manager', 'admin.access.users_access.admin', 'A', 'B.lev', false),
  ('A.fleet_manager', 'fleet.operations.vessels.view', 'A', 'B.lev', false),
  ('A.owner', 'fleet.operations.vessels.admin', 'A', 'B.lev', false),
  -- the other company: nothing, even for full admins (CC-5 for user_roles rows naming B)
  ('A.fleet_manager', 'admin.access.users_access.view', 'B', NULL, false),
  ('A.fleet_manager', 'fleet.operations.vessels.admin', 'B', NULL, false),
  ('A.fleet_manager', 'fleet.operations.vessels.view', 'B', 'B.lev', false),
  ('A.ur_dpa_other', 'admin.access.users_access.admin', 'B', NULL, false),
  ('A.ur_dpa_other', 'admin.access.users_access.view', 'B', NULL, false),
  ('A.ur_super_null', 'admin.access.users_access.admin', 'B', NULL, false),
  ('B.admin', 'admin.access.users_access.admin', 'B', NULL, true),
  ('B.admin', 'admin.access.users_access.admin', 'A', NULL, false),
  ('B.admin', 'fleet.operations.vessels.view', 'B', 'B.lev', true),
  ('B.admin', 'fleet.operations.vessels.admin', 'A', NULL, false);

SELECT tests.ok((SELECT count(*) FROM cap_cases) > 180, 'the capability matrix has more than 180 cases');
SELECT tests.is_empty(
  $q$SELECT persona, key, company, vessel, want
     FROM cap_cases
     WHERE public.has_capability_for(tests.user_id(persona), key, tests.company_id(company), CASE WHEN vessel IS NULL THEN NULL ELSE tests.vessel_id(vessel) END) IS DISTINCT FROM want$q$,
  'has_capability_for matches the matrix for every persona, key, company and vessel');
SELECT tests.ok(NOT public.has_capability_for(NULL, 'fleet.operations.vessels.view', tests.company_id('A')), 'a NULL user has no capability');
SELECT tests.ok(NOT public.has_capability_for(tests.user_id('A.fleet_manager'), 'fleet.operations.vessels.view', NULL), 'a NULL company gives no capability');
SELECT tests.ok(NOT public.has_capability_for(tests.user_id('A.fleet_manager'), 'admin.access.users_access.admin', tests.company_id('A'), gen_random_uuid()), 'an unknown vessel id gives no capability');
SELECT tests.ok(NOT public.has_capability_for(tests.user_id('A.fleet_manager'), 'admin.access.users_access.admin', gen_random_uuid()), 'an unknown company id gives no capability');

-- ------------------------------------------------------------ the same answers through has_capability, signed in

DO $$
DECLARE
  v_cases jsonb;
  c jsonb;
  v_got boolean;
  v_bad text[] := ARRAY[]::text[];
BEGIN
  SELECT jsonb_agg(to_jsonb(cc)) INTO v_cases FROM cap_cases AS cc WHERE cc.key <> '';
  FOR c IN SELECT e FROM jsonb_array_elements(v_cases) AS e LOOP
    PERFORM tests.as_user(tests.user_id(c ->> 'persona'));
    v_got := public.has_capability(c ->> 'key', tests.company_id(c ->> 'company'),
                                   CASE WHEN c ->> 'vessel' IS NULL THEN NULL ELSE tests.vessel_id(c ->> 'vessel') END);
    PERFORM tests.reset_role();
    IF v_got IS DISTINCT FROM (c ->> 'want')::boolean THEN
      v_bad := v_bad || format('%s %s %s %s', c ->> 'persona', c ->> 'key', c ->> 'company', coalesce(c ->> 'vessel', '-'));
    END IF;
  END LOOP;
  PERFORM tests.is(v_bad, ARRAY[]::text[], 'has_capability, called by each persona, gives the matrix answer');
END
$$;
SELECT tests.ok(NOT public.has_capability('fleet.operations.vessels.view', tests.company_id('A')), 'has_capability without a caller is false');
SELECT tests.as_service();
SELECT tests.ok(NOT public.has_capability('fleet.operations.vessels.view', tests.company_id('A')), 'has_capability for the service role (no user) is false');
SELECT tests.reset_role();

-- ------------------------------------------------------------ the user_roles company rule (CC-5)

SELECT tests.ok(NOT public.legacy_user_admin(tests.user_id('A.ur_dpa_other')), 'a user_roles dpa row naming company B does not make a company-A user an admin');
SELECT tests.ok(public.legacy_user_admin(tests.user_id('A.ur_dpa_own')), 'a user_roles dpa row of the user''s own company does');
SELECT tests.ok(public.legacy_user_admin(tests.user_id('A.ur_super_null')), 'a user_roles superadmin row without a company does');
SELECT tests.ok(NOT public.legacy_user_admin(tests.user_id('A.ur_expired')) AND NOT public.legacy_user_admin(tests.user_id('A.ur_inactive')), 'expired and inactive user_roles rows do not count');
SELECT tests.ok(NOT public.legacy_user_admin(tests.user_id('A.disabled')), 'a disabled user is never an admin');
UPDATE public.profiles SET account_status = 'disabled' WHERE id = tests.profile_id('A.fleet_manager');
SELECT tests.ok(NOT public.has_capability_for(tests.user_id('A.fleet_manager'), 'admin.access.users_access.admin', tests.company_id('A')), 'a disabled DPA has no capability');
UPDATE public.profiles SET account_status = 'active' WHERE id = tests.profile_id('A.fleet_manager');

-- ------------------------------------------------------------ ranks

SELECT tests.results_eq(
  $q$SELECT n, public.role_rank(n) FROM unnest(ARRAY['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer', 'auditor', 'employer_api', 'crew', 'legal_counsel', 'nobody', NULL]) AS n$q$,
  $q$VALUES ('superadmin', 100), ('dpa', 90), ('fleet_master', 80), ('captain', 60), ('purser', 50), ('chief_officer', 50), ('chief_engineer', 50), ('hod', 40), ('officer', 30), ('auditor', 20), ('employer_api', 20), ('crew', 10), ('legal_counsel', 0), ('nobody', 0), (NULL, 0)$q$,
  'role_rank orders superadmin > dpa > fleet_master > captain > purser / chief officer / chief engineer > hod > officer > auditor / employer_api > crew > anything else');
SELECT tests.results_eq(
  $q$SELECT k, public.user_role_rank(tests.user_id(k)) FROM unnest(ARRAY['A.fleet_manager', 'A.shore', 'A.master_dra', 'A.crew_hyd', 'A.rbac_dpa', 'A.disabled']) AS k$q$,
  $q$VALUES ('A.fleet_manager', 90), ('A.shore', 80), ('A.master_dra', 60), ('A.crew_hyd', 10), ('A.rbac_dpa', 90), ('A.disabled', 0)$q$,
  'user_role_rank: the highest of the RBAC roles and the legacy profile role; 0 for a disabled user');

-- ------------------------------------------------------------ user_company_for_admin

SELECT tests.is(public.user_company_for_admin(tests.user_id('A.disabled')), tests.company_id('A'), 'no JWT: the target''s company');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(public.user_company_for_admin(tests.user_id('A.disabled')), tests.company_id('A'), 'a company-A caller gets a disabled colleague''s company (admins still fix disabled users)');
SELECT tests.is(public.user_company_for_admin(tests.user_id('B.admin')), NULL::uuid, 'a company-A caller gets nothing for a company-B user');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is(public.user_company_for_admin(tests.user_id('A.crew_hyd')), NULL::uuid, 'a disabled caller gets nothing');
SELECT tests.reset_role();

-- ------------------------------------------------------------ is_company_actor (W10 interim)

SELECT tests.results_eq(
  $q$SELECT k, v, public.is_company_actor(tests.user_id(k), CASE WHEN v IS NULL THEN NULL ELSE tests.vessel_id(v) END)
     FROM (VALUES ('A.fleet_manager', 'A.dra'), ('A.fleet_manager', NULL), ('A.owner', 'A.gam'), ('A.ua_write_all', 'A.dra'),
                  ('A.ua_write_hyd', 'A.hyd'), ('A.ua_write_hyd', 'A.dra'), ('A.ua_write_hyd', NULL), ('A.dpa_flag', 'A.dra'),
                  ('A.shore_member', 'A.hyd'), ('A.master_dra', 'A.dra'), ('A.crew_hyd', 'A.hyd'), ('A.crew_hyd', NULL),
                  ('A.disabled', 'A.dra'), ('A.fleet_manager', 'B.lev'), ('A.ur_dpa_other', 'A.dra'), ('B.admin', 'B.lev'), ('B.admin', 'A.dra')) AS t(k, v)$q$,
  $q$VALUES ('A.fleet_manager', 'A.dra', true), ('A.fleet_manager', NULL, true), ('A.owner', 'A.gam', true), ('A.ua_write_all', 'A.dra', true),
            ('A.ua_write_hyd', 'A.hyd', true), ('A.ua_write_hyd', 'A.dra', false), ('A.ua_write_hyd', NULL, true), ('A.dpa_flag', 'A.dra', false),
            ('A.shore_member', 'A.hyd', false), ('A.master_dra', 'A.dra', false), ('A.crew_hyd', 'A.hyd', false), ('A.crew_hyd', NULL, false),
            ('A.disabled', 'A.dra', false), ('A.fleet_manager', 'B.lev', false), ('A.ur_dpa_other', 'A.dra', false), ('B.admin', 'B.lev', true), ('B.admin', 'A.dra', false)$q$,
  'is_company_actor: full admins and admins reaching the vessel act as the company; shore staff, masters and crew never; no foreign vessels');
SELECT tests.ok(NOT public.is_company_actor(NULL), 'a NULL user is not the company');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.ok(public.is_company_actor(tests.user_id('A.fleet_manager'), tests.vessel_id('A.dra')), 'a definer evaluating a colleague of the caller''s company gets the truth');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.ok(NOT public.is_company_actor(tests.user_id('A.fleet_manager'), tests.vessel_id('A.dra')), 'a caller asking about a user of another company gets false');
SELECT tests.reset_role();

-- ------------------------------------------------------------ ACLs (rule 5)

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws($q$SELECT public.has_capability_for(auth.uid(), 'admin.access.users_access.admin', tests.company_id('A'))$q$, '42501', 'authenticated cannot execute has_capability_for');
SELECT tests.throws($q$SELECT public.legacy_user_admin(auth.uid())$q$, '42501', 'authenticated cannot execute legacy_user_admin');
SELECT tests.throws($q$SELECT public.role_rank('dpa')$q$, '42501', 'authenticated cannot execute role_rank');
SELECT tests.throws($q$SELECT public.user_role_rank(auth.uid())$q$, '42501', 'authenticated cannot execute user_role_rank');
SELECT tests.throws($q$SELECT public.reach_vessel_for(auth.uid(), tests.vessel_id('A.dra'))$q$, '42501', 'authenticated cannot execute reach_vessel_for');
SELECT tests.throws($q$SELECT * FROM public.reach_vessels_for(auth.uid())$q$, '42501', 'authenticated cannot execute reach_vessels_for');
SELECT tests.throws($q$SELECT public.fleet_reach_for(auth.uid())$q$, '42501', 'authenticated cannot execute fleet_reach_for');
SELECT tests.lives($q$SELECT public.has_capability('admin.access.users_access.view', tests.company_id('A'))$q$, 'authenticated can execute has_capability');
SELECT tests.lives($q$SELECT public.is_company_actor(auth.uid())$q$, 'authenticated can execute is_company_actor (vessel optional, CC-11)');
SELECT tests.lives($q$SELECT public.user_company_for_admin(auth.uid())$q$, 'authenticated can execute user_company_for_admin');
SELECT tests.as_anon();
SELECT tests.throws($q$SELECT public.has_capability('admin.access.users_access.view', tests.company_id('A'))$q$, '42501', 'anon cannot execute has_capability');
SELECT tests.throws($q$SELECT public.is_company_actor(tests.user_id('A.fleet_manager'), tests.vessel_id('A.dra'))$q$, '42501', 'anon cannot execute is_company_actor');
SELECT tests.throws($q$SELECT public.user_company_for_admin(tests.user_id('A.fleet_manager'))$q$, '42501', 'anon cannot execute user_company_for_admin');
SELECT tests.reset_role();
SELECT tests.results_eq(
  $q$SELECT p.oid::regprocedure::text, coalesce(string_agg(a.grantee::regrole::text, ',' ORDER BY a.grantee::regrole::text) FILTER (WHERE a.grantee <> p.proowner), '')
     FROM pg_proc AS p CROSS JOIN LATERAL aclexplode(p.proacl) AS a
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('legacy_user_admin', 'role_rank', 'user_role_rank', 'has_capability', 'has_capability_for', 'user_company_for_admin', 'is_company_actor')
     GROUP BY 1$q$,
  $q$VALUES ('legacy_user_admin(uuid)', 'service_role'), ('role_rank(text)', 'service_role'), ('user_role_rank(uuid)', 'service_role'),
            ('has_capability(text,uuid,uuid)', 'authenticated,service_role'), ('has_capability_for(uuid,text,uuid,uuid)', 'service_role'),
            ('user_company_for_admin(uuid)', 'authenticated,service_role'), ('is_company_actor(uuid,uuid)', 'authenticated,service_role')$q$,
  'EXECUTE grants are exactly the spec''s');
SELECT tests.is((SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('has_capability', 'is_company_actor')), 2::bigint, 'one has_capability and one is_company_actor (no stray overloads)');
