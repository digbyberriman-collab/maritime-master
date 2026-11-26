-- Reach parity (spec §A.3, §E; D-26, D-123, D-136): every user of
-- supabase/tests/fixtures/reach-cases.json gets exactly expected.membership
-- from the public helpers (user_vessel_reach, user_can_reach_vessel,
-- user_has_fleet_reach) and from the internal ones (reach_vessels_for,
-- reach_vessel_for, fleet_reach_for); legacy rows come from the profile
-- sync, explicit memberships are non-legacy rows (tests.seed_reach_world).
-- A crew assignment counts only while crew_assignment_is_current() (D-217;
-- review round 5): the fixture's stale rows (A.master_stale, A.crew_ended)
-- still say is_current but reach nothing. The public helpers answer a
-- users-access viewer only for the users that viewer may view
-- (admin_may_view_user, gap/01 F23 / D-194; review round 5).

\set reach `cat supabase/tests/fixtures/reach-cases.json`
CREATE TEMP TABLE reach_fixture ON COMMIT DROP AS SELECT :'reach'::jsonb AS j;
CREATE TEMP TABLE reach_world ON COMMIT DROP AS SELECT tests.seed_reach_world(j) AS w FROM reach_fixture;
CREATE TEMP TABLE reach_users ON COMMIT DROP AS
  SELECT u ->> 'key' AS key,
         tests.user_id(u ->> 'key') AS uid,
         tests.company_id(u ->> 'company') AS company_id,
         (u -> 'expected' -> 'membership' ->> 'fleetReach')::boolean AS want_fleet,
         ARRAY(SELECT tests.vessel_id(x) FROM jsonb_array_elements_text(u -> 'expected' -> 'membership' -> 'vessels') AS x ORDER BY 1) AS want_vessels,
         (u -> 'membership') IS NOT NULL AND jsonb_typeof(u -> 'membership') = 'object' AS explicit
  FROM reach_fixture CROSS JOIN LATERAL jsonb_array_elements(j -> 'users') AS u;
CREATE TEMP TABLE reach_vessels ON COMMIT DROP AS
  SELECT v ->> 'key' AS key, tests.vessel_id(v ->> 'key') AS id
  FROM reach_fixture CROSS JOIN LATERAL jsonb_array_elements(j -> 'vessels') AS v;
-- the key of a vessel id, for readable diagnostics
CREATE TEMP TABLE reach_keys ON COMMIT DROP AS SELECT id, key FROM reach_vessels;

SELECT tests.is((SELECT count(*) FROM reach_users), 25::bigint, 'the fixture has 25 users');
SELECT tests.is((SELECT count(*) FROM reach_users WHERE explicit), 7::bigint, '7 of them have an explicit (non-legacy) membership');
SELECT tests.is(
  (SELECT count(*) FROM public.account_memberships AS m JOIN reach_users AS u ON u.uid = m.user_id),
  25::bigint, 'every user has exactly one membership');
SELECT tests.is(
  (SELECT count(*) FROM public.account_memberships AS m JOIN reach_users AS u ON u.uid = m.user_id WHERE m.legacy_managed = NOT u.explicit),
  25::bigint, 'legacy-managed exactly for the users without an explicit membership');
SELECT tests.is(
  (SELECT w -> 'skipped' FROM reach_world),
  '[{"user": "A.shore_assigned", "reason": "vessel of another company", "vessel": "B.lev"}]'::jsonb,
  'the one cross-company membership vessel of the fixture cannot be stored');
SELECT tests.throws_like(
  format($q$INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
            SELECT id, company_id, %L FROM public.account_memberships WHERE user_id = %L$q$, tests.vessel_id('B.lev'), tests.user_id('A.shore_assigned')),
  '23514', 'membership_vessel_company_mismatch', 'a membership vessel of another company is refused by the trigger');

-- ------------------------------------------------------------ public helpers (no JWT: the caller rule holds)

SELECT tests.is_empty(
  $q$SELECT u.key, ARRAY(SELECT k.key FROM public.user_vessel_reach(u.uid) AS r JOIN reach_keys AS k ON k.id = r ORDER BY 1) AS got
     FROM reach_users AS u
     WHERE ARRAY(SELECT r FROM public.user_vessel_reach(u.uid) AS r ORDER BY 1) IS DISTINCT FROM u.want_vessels$q$,
  'user_vessel_reach = expected.membership.vessels for all 25 users');
SELECT tests.is_empty(
  $q$SELECT u.key FROM reach_users AS u WHERE public.user_has_fleet_reach(u.uid) IS DISTINCT FROM u.want_fleet$q$,
  'user_has_fleet_reach = expected.membership.fleetReach for all 25 users');
SELECT tests.is_empty(
  $q$SELECT u.key FROM reach_users AS u WHERE public.user_has_fleet_reach(u.uid, u.company_id) IS DISTINCT FROM u.want_fleet$q$,
  'user_has_fleet_reach in the user''s own company = expected for all 25 users');
SELECT tests.is_empty(
  $q$SELECT u.key FROM reach_users AS u
     WHERE public.user_has_fleet_reach(u.uid, CASE WHEN u.company_id = tests.company_id('A') THEN tests.company_id('B') ELSE tests.company_id('A') END)$q$,
  'nobody has fleet reach in the other company');
SELECT tests.is_empty(
  $q$SELECT u.key, v.key FROM reach_users AS u CROSS JOIN reach_vessels AS v
     WHERE public.user_can_reach_vessel(u.uid, v.id) IS DISTINCT FROM (v.id = ANY (u.want_vessels))$q$,
  'user_can_reach_vessel matches the expected reach for every user x vessel (25 x 6)');

-- ------------------------------------------------------------ internal helpers

SELECT tests.is_empty(
  $q$SELECT u.key FROM reach_users AS u
     WHERE ARRAY(SELECT r FROM public.reach_vessels_for(u.uid) AS r ORDER BY 1) IS DISTINCT FROM u.want_vessels$q$,
  'reach_vessels_for = expected.membership.vessels for all 25 users');
SELECT tests.is_empty(
  $q$SELECT u.key FROM reach_users AS u WHERE public.fleet_reach_for(u.uid) IS DISTINCT FROM u.want_fleet OR public.fleet_reach_for(u.uid, u.company_id) IS DISTINCT FROM u.want_fleet$q$,
  'fleet_reach_for = expected.membership.fleetReach for all 25 users (with and without the company)');
SELECT tests.is_empty(
  $q$SELECT u.key, v.key FROM reach_users AS u CROSS JOIN reach_vessels AS v
     WHERE public.reach_vessel_for(u.uid, v.id) IS DISTINCT FROM (v.id = ANY (u.want_vessels))$q$,
  'reach_vessel_for (the EXISTS form) matches reach_vessels_for for every user x vessel');
SELECT tests.ok(NOT public.reach_vessel_for(tests.user_id('A.dpa'), NULL) AND NOT public.reach_vessel_for(NULL, tests.vessel_id('A.dra')), 'NULL ids reach nothing');
SELECT tests.is((SELECT count(*) FROM public.user_vessel_reach(NULL)), 0::bigint, 'user_vessel_reach(NULL) is empty');

-- ------------------------------------------------------------ each user, signed in, asking about themselves

DO $$
DECLARE
  v_rows record;
  v_users jsonb;
  u jsonb;
  v_got uuid[];
  v_fleet boolean;
  v_can boolean;
  v_bad text[] := ARRAY[]::text[];
BEGIN
  SELECT jsonb_agg(jsonb_build_object('key', key, 'uid', uid, 'want_fleet', want_fleet, 'want', to_jsonb(want_vessels))) INTO v_users FROM reach_users;
  FOR u IN SELECT e FROM jsonb_array_elements(v_users) AS e LOOP
    PERFORM tests.as_user((u ->> 'uid')::uuid);
    v_got := ARRAY(SELECT r FROM public.user_vessel_reach((u ->> 'uid')::uuid) AS r ORDER BY 1);
    v_fleet := public.user_has_fleet_reach((u ->> 'uid')::uuid);
    PERFORM tests.reset_role();
    IF v_got IS DISTINCT FROM ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(u -> 'want') AS x ORDER BY 1)
       OR v_fleet IS DISTINCT FROM (u ->> 'want_fleet')::boolean THEN
      v_bad := v_bad || (u ->> 'key');
    END IF;
  END LOOP;
  PERFORM tests.is(v_bad, ARRAY[]::text[], 'signed in as themselves, all 25 users get exactly their expected reach and fleet reach');
END
$$;

-- ------------------------------------------------------------ the caller rule and the internal layer (CC-3)

-- A definer that evaluates another user from inside a crew member's
-- transaction, as notification recipients and slot eligibility will.
CREATE FUNCTION tests.zz_probe_reach(p_user uuid, p_vessel uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT public.reach_vessel_for(p_user, p_vessel) $$;
CREATE FUNCTION tests.zz_probe_fleet(p_user uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT public.fleet_reach_for(p_user, NULL) $$;
GRANT EXECUTE ON FUNCTION tests.zz_probe_reach(uuid, uuid), tests.zz_probe_fleet(uuid) TO authenticated;

SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.ok(tests.zz_probe_reach(tests.user_id('A.dpa'), tests.vessel_id('A.hyd')), 'inside a crew session, a definer calling reach_vessel_for(<colleague>, v) gets the truth');
SELECT tests.ok(tests.zz_probe_fleet(tests.user_id('A.dpa')), 'inside a crew session, a definer calling fleet_reach_for(<colleague>) gets the truth');
SELECT tests.ok(NOT public.user_can_reach_vessel(tests.user_id('A.dpa'), tests.vessel_id('A.hyd')), 'while user_can_reach_vessel(<colleague>, v) answers false (caller rule)');
SELECT tests.is((SELECT count(*) FROM public.user_vessel_reach(tests.user_id('A.dpa'))), 0::bigint, 'and user_vessel_reach(<colleague>) is empty for a crew member');
SELECT tests.ok(NOT public.user_has_fleet_reach(tests.user_id('A.dpa')), 'and user_has_fleet_reach(<colleague>) is false');
SELECT tests.throws($q$SELECT public.reach_vessel_for(tests.user_id('A.dpa'), tests.vessel_id('A.hyd'))$q$, '42501', 'authenticated cannot call reach_vessel_for directly');
SELECT tests.throws($q$SELECT * FROM public.reach_vessels_for(tests.user_id('A.dpa'))$q$, '42501', 'authenticated cannot call reach_vessels_for directly');
SELECT tests.throws($q$SELECT public.fleet_reach_for(tests.user_id('A.dpa'))$q$, '42501', 'authenticated cannot call fleet_reach_for directly');
SELECT tests.throws($q$SELECT public.legacy_fleet_reach(tests.user_id('A.dpa'))$q$, '42501', 'authenticated cannot call legacy_fleet_reach');
SELECT tests.throws($q$SELECT public.legacy_all_vessels(tests.user_id('A.dpa'))$q$, '42501', 'authenticated cannot call legacy_all_vessels');

-- A users-access viewer of the target's company gets the truth (has_capability, file 4).
SELECT tests.as_user(tests.user_id('A.dpa'));
SELECT tests.results_eq(
  format($q$SELECT r FROM public.user_vessel_reach(%L) AS r$q$, tests.user_id('A.master_dra')),
  format($q$VALUES (%L::uuid)$q$, tests.vessel_id('A.dra')),
  'a company admin (users-access viewer) sees a colleague''s reach');
SELECT tests.ok(public.user_can_reach_vessel(tests.user_id('A.master_dra'), tests.vessel_id('A.dra')), 'and whether the colleague reaches a vessel');
SELECT tests.ok(public.user_has_fleet_reach(tests.user_id('A.rbac_fleet_master')), 'and a colleague''s fleet reach');

-- The fixture's stale assignments (D-217): stored is_current, date passed.
SELECT tests.reset_role();
SELECT tests.ok((SELECT bool_and(ca.is_current) FROM public.crew_assignments AS ca
                 WHERE ca.user_id IN (tests.user_id('A.master_stale'), tests.user_id('A.crew_ended'))),
                'setup: the stale fixture rows are stored is_current (seeded with the normaliser off)');
SELECT tests.ok(NOT public.reach_vessel_for(tests.user_id('A.master_stale'), tests.vessel_id('A.dra'))
                AND NOT public.reach_vessel_for(tests.user_id('A.crew_ended'), tests.vessel_id('A.hyd'))
                AND public.reach_vessel_for(tests.user_id('A.crew_signing_off'), tests.vessel_id('A.gam')),
                'a leave date (or, without one, an end date) that has come ends reach; one in 2099 does not');
SELECT tests.ok(NOT public.record_is_master(tests.user_id('A.master_stale'), tests.vessel_id('A.dra')), 'the stale Master row holds no Master office');

-- A vessel-scoped users-access viewer (review round 5,
-- reach-helpers-ignore-f23-scope; gap/01 F23): a read-level admin
-- membership limited to DRAAK gets answers only about the users of the
-- vessels they reach, as admin_may_view_user() decides for every other
-- admin read. Seeded as scratchpad verify-reach/probe.sql.
SELECT tests.seed_user('A', 'A.vadmin', 'crew');
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'admin', users_access_level = 'read', vessel_scope = 'assigned', fleet_access = false, source = 'admin'
WHERE user_id = tests.user_id('A.vadmin');
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT id, company_id, tests.vessel_id('A.dra') FROM public.account_memberships WHERE user_id = tests.user_id('A.vadmin');
-- A crew member of HYDRA (outside the viewer's scope) for the probe.
SELECT tests.seed_user('A', 'A.crew_hyd_v', 'crew');
SELECT tests.seed_assignment('A.crew_hyd_v', 'A.hyd', true, 'Deckhand');
SELECT tests.as_user(tests.user_id('A.vadmin'));
SELECT tests.ok(public.has_capability('admin.access.users_access.view', tests.company_id('A')), 'setup: the vessel-scoped viewer holds users_access.view in the company');
SELECT tests.is((SELECT count(*) FROM public.user_vessel_reach(tests.user_id('A.crew_hyd_v'))), 0::bigint,
                'user_vessel_reach of a HYDRA crew member is empty for a DRAAK-scoped viewer');
SELECT tests.is((SELECT count(*) FROM public.user_vessel_reach(tests.user_id('A.dpa'))), 0::bigint,
                'and of a fleet-wide user (DPA: needs a full admin)');
SELECT tests.ok(NOT public.user_can_reach_vessel(tests.user_id('A.crew_hyd_v'), tests.vessel_id('A.hyd')), 'user_can_reach_vessel(HYDRA crew, HYDRA) is false for them');
SELECT tests.ok(NOT public.user_has_fleet_reach(tests.user_id('A.dpa')), 'user_has_fleet_reach(DPA) is false for them');
SELECT tests.ok(NOT public.user_has_fleet_reach(tests.user_id('A.dpa'), tests.company_id('A')), 'also in the company');
SELECT tests.results_eq(
  format($q$SELECT r FROM public.user_vessel_reach(%L) AS r$q$, tests.user_id('A.master_dra')),
  format($q$VALUES (%L::uuid)$q$, tests.vessel_id('A.dra')),
  'the in-scope colleague (the DRAAK Master) still returns DRAAK');
SELECT tests.ok(public.user_can_reach_vessel(tests.user_id('A.master_dra'), tests.vessel_id('A.dra')), 'and user_can_reach_vessel answers for them');
SELECT tests.is((SELECT count(*) FROM public.user_vessel_reach(tests.user_id('B.dpa'))), 0::bigint, 'a company-B user: nothing');
SELECT tests.is((SELECT count(*) FROM public.user_vessel_reach(tests.id('user:nobody'))), 0::bigint, 'an unknown id: nothing');
-- Back to the company admin for the tenant-isolation checks below.
SELECT tests.as_user(tests.user_id('A.dpa'));

-- ------------------------------------------------------------ tenant isolation

SELECT tests.is((SELECT count(*) FROM public.user_vessel_reach(tests.user_id('B.dpa'))), 0::bigint, 'a company-A admin gets nothing for a company-B user');
SELECT tests.ok(NOT public.user_has_fleet_reach(tests.user_id('B.dpa')), 'nor their fleet reach');
SELECT tests.ok(NOT public.user_can_reach_vessel(tests.user_id('A.dpa'), tests.vessel_id('B.lev')), 'a company-A user reaches no company-B vessel');
SELECT tests.ok(NOT public.user_is_active(tests.user_id('B.dpa')), 'user_is_active of a user of another company answers false (no cross-tenant probing)');
SELECT tests.ok(public.user_is_active(tests.user_id('A.master_dra')), 'user_is_active of an active colleague answers true');
SELECT tests.ok(NOT public.user_is_active(tests.user_id('A.disabled_dpa')), 'user_is_active of a disabled colleague answers false');
SELECT tests.as_user(tests.user_id('B.dpa'));
SELECT tests.is((SELECT count(*) FROM public.user_vessel_reach(tests.user_id('A.dpa'))), 0::bigint, 'a company-B admin gets nothing for a company-A user');
SELECT tests.ok(NOT public.user_has_fleet_reach(tests.user_id('B.dpa'), tests.company_id('A')), 'a company-B admin has no fleet reach in company A');
SELECT tests.ok(NOT public.user_can_reach_vessel(tests.user_id('B.dpa'), tests.vessel_id('A.dra')), 'a company-B admin reaches no company-A vessel');
SELECT tests.reset_role();
SELECT tests.ok(NOT public.reach_vessel_for(tests.user_id('B.crew_cross'), tests.vessel_id('A.dra')), 'a crew assignment to another company''s vessel gives no reach (internal helper, no JWT)');

-- ------------------------------------------------------------ disabled, removed, banned

SELECT tests.is_empty(
  $q$SELECT key FROM reach_users WHERE key IN ('A.disabled_dpa', 'A.deactivated_crew', 'A.removed_admin') AND public.user_is_active(uid)$q$,
  'disabled, deactivated and removed-membership users are not active');
SELECT tests.as_user(tests.user_id('A.disabled_dpa'));
SELECT tests.is(public.my_account_status(), 'disabled', 'my_account_status() tells a disabled user why');
SELECT tests.is((SELECT count(*) FROM public.user_vessel_reach(tests.user_id('A.disabled_dpa'))), 0::bigint, 'a disabled DPA reaches nothing, even asking about themselves');
SELECT tests.as_user(tests.user_id('A.removed_admin'));
SELECT tests.is(public.my_account_status(), 'disabled', 'a removed membership reads as disabled');
SELECT tests.reset_role();
UPDATE auth.users SET banned_until = now() + interval '1 day' WHERE id = tests.user_id('A.master_dra');
SELECT tests.ok(NOT public.user_is_active(tests.user_id('A.master_dra')), 'an auth ban in force makes the user inactive');
SELECT tests.is((SELECT count(*) FROM public.reach_vessels_for(tests.user_id('A.master_dra'))), 0::bigint, 'a banned user reaches nothing');
UPDATE auth.users SET banned_until = now() - interval '1 minute' WHERE id = tests.user_id('A.master_dra');
SELECT tests.ok(public.user_is_active(tests.user_id('A.master_dra')), 'an expired ban does not count');

-- ------------------------------------------------------------ anon

SELECT tests.as_anon();
SELECT tests.throws($q$SELECT public.user_is_active(tests.user_id('A.dpa'))$q$, '42501', 'anon cannot execute user_is_active');
SELECT tests.throws($q$SELECT * FROM public.user_vessel_reach(tests.user_id('A.dpa'))$q$, '42501', 'anon cannot execute user_vessel_reach');
SELECT tests.throws($q$SELECT public.user_can_reach_vessel(tests.user_id('A.dpa'), tests.vessel_id('A.dra'))$q$, '42501', 'anon cannot execute user_can_reach_vessel');
SELECT tests.throws($q$SELECT public.user_has_fleet_reach(tests.user_id('A.dpa'))$q$, '42501', 'anon cannot execute user_has_fleet_reach');
SELECT tests.throws($q$SELECT public.my_account_status()$q$, '42501', 'anon cannot execute my_account_status');
SELECT tests.throws($q$SELECT public.record_session_start()$q$, '42501', 'anon cannot execute record_session_start');
SELECT tests.throws($q$SELECT * FROM public.reach_vessels_for(tests.user_id('A.dpa'))$q$, '42501', 'anon cannot execute reach_vessels_for');
SELECT tests.throws($q$SELECT public.vessel_in_reachable_state('active', 'Active')$q$, '42501', 'anon cannot execute vessel_in_reachable_state');
SELECT tests.reset_role();

-- ------------------------------------------------------------ the status rule

SELECT tests.results_eq(
  $q$SELECT n, public.vessel_in_reachable_state(l, s) FROM (VALUES ('active', 'Active', 1), ('archived', 'Active', 2), ('active', 'Sold', 3), ('active', NULL, 4), (NULL, 'Active', 5), ('inactive', 'In Refit', 6)) AS t(l, s, n)$q$,
  $q$VALUES (1, true), (2, false), (3, false), (4, false), (5, true), (6, true)$q$,
  'vessel_in_reachable_state: not archived, status set and not Sold (legacy parity)');
