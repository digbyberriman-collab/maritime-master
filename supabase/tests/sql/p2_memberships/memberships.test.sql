-- account_memberships / account_membership_vessels (spec §A.3): the
-- backfill (flags = the sync rule), the profile sync trigger, constraints,
-- RLS (own row, admin read, no client writes, disabled users, anon),
-- record_session_start() / my_account_status(), and an idempotent re-run.

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ the profile sync on insert

SELECT tests.results_eq(
  $q$SELECT p.last_name, m.kind, m.status, m.legacy_managed, m.vessel_scope, m.is_dpa, m.manages_admins, m.fleet_access, m.source, m.profile_id = p.id
     FROM public.account_memberships AS m JOIN public.profiles AS p ON p.user_id = m.user_id
     WHERE m.company_id IN (tests.company_id('A'), tests.company_id('B'))$q$,
  $q$VALUES ('A.fleet_manager', 'admin', 'active', true, 'all', true, true, true, 'profile_sync', true),
            ('A.master_dra', 'crew', 'active', true, 'assigned', false, false, false, 'profile_sync', true),
            ('A.crew_hyd', 'crew', 'active', true, 'assigned', false, false, false, 'profile_sync', true),
            ('A.disabled', 'crew', 'disabled', true, 'assigned', false, false, false, 'profile_sync', true),
            ('B.admin', 'admin', 'active', true, 'all', true, true, true, 'profile_sync', true)$q$,
  'a profile with a login gets its legacy-managed membership from the sync trigger (dpa -> admin, all vessels, DPA flags; others crew)');
SELECT tests.ok((SELECT disabled_at IS NOT NULL FROM public.account_memberships WHERE user_id = tests.user_id('A.disabled')), 'a disabled profile''s membership is disabled with disabled_at');
SELECT tests.seed_profile('A', 'A.imported', 'crew', 'not_invited', NULL);
SELECT tests.is((SELECT count(*) FROM public.account_memberships WHERE profile_id = tests.profile_id('A.imported')), 0::bigint, 'an imported profile without a login gets no membership in Phase 2');

-- ------------------------------------------------------------ the backfill (re-run of the file on profiles the sync did not see)

ALTER TABLE public.profiles DISABLE TRIGGER trg_profiles_sync_membership;
SELECT tests.seed_user('C', 'C.dpa', 'dpa');
SELECT tests.seed_user('C', 'C.shore', 'shore_management');
SELECT tests.seed_user('C', 'C.master', 'master');
SELECT tests.seed_user('C', 'C.invited', 'crew', 'invited');
SELECT tests.seed_user('C', 'C.off', 'crew', 'disabled');
SELECT tests.seed_user('C', 'C.rbac', 'crew');
SELECT tests.seed_rbac_role('C.rbac', 'fleet_master');
SELECT tests.seed_auth_user('C.nocompany');
SELECT tests.seed_profile(NULL, 'C.nocompany', 'crew', 'active', 'C.nocompany');
SELECT tests.is((SELECT count(*) FROM public.account_memberships WHERE company_id = tests.company_id('C')), 0::bigint, 'before the backfill company C has no membership');

\i supabase/migrations/20261123000300_platform_account_memberships.sql

SELECT tests.results_eq(
  $q$SELECT p.last_name, m.kind, m.status, m.legacy_managed, m.vessel_scope, m.is_dpa, m.manages_admins, m.fleet_access, m.source
     FROM public.account_memberships AS m JOIN public.profiles AS p ON p.id = m.profile_id
     WHERE m.company_id = tests.company_id('C')$q$,
  $q$VALUES ('C.dpa', 'admin', 'active', true, 'all', true, true, true, 'backfill'),
            ('C.shore', 'admin', 'active', true, 'all', false, false, true, 'backfill'),
            ('C.master', 'crew', 'active', true, 'assigned', false, false, false, 'backfill'),
            ('C.invited', 'crew', 'active', true, 'assigned', false, false, false, 'backfill'),
            ('C.off', 'crew', 'disabled', true, 'assigned', false, false, false, 'backfill'),
            ('C.rbac', 'crew', 'active', true, 'assigned', false, false, true, 'backfill')$q$,
  'the backfill gives every profile with a login and a company one legacy-managed membership (fleet_access = D-26 fleet reach)');
SELECT tests.is((SELECT count(*) FROM public.account_memberships WHERE user_id = tests.user_id('C.nocompany')), 0::bigint, 'a profile without a company gets no membership');
SELECT tests.is(
  (SELECT string_agg(tgname::text || ':' || tgenabled::text, ',') FROM pg_trigger WHERE tgname = 'trg_profiles_sync_membership'),
  'trg_profiles_sync_membership:O', 'the re-run recreates the sync trigger, enabled');

CREATE TEMP TABLE backfilled ON COMMIT DROP AS
  SELECT user_id, profile_id, kind, status, legacy_managed, fleet_access, vessel_scope, is_dpa, manages_admins, disabled_at IS NOT NULL AS disabled
  FROM public.account_memberships WHERE company_id = tests.company_id('C');
-- Fire the sync for each backfilled profile without changing anything.
UPDATE public.profiles SET role = role WHERE company_id = tests.company_id('C');
SELECT tests.results_eq(
  $q$SELECT user_id, profile_id, kind, status, legacy_managed, fleet_access, vessel_scope, is_dpa, manages_admins, disabled_at IS NOT NULL
     FROM public.account_memberships WHERE company_id = tests.company_id('C')$q$,
  $q$SELECT * FROM backfilled$q$,
  'the stored flags of every backfilled row equal what the sync computes');
SELECT tests.is((SELECT count(*) FROM public.account_memberships WHERE company_id = tests.company_id('C') AND source = 'backfill'), 6::bigint, 'a later sync keeps source = backfill');

\i supabase/migrations/20261123000300_platform_account_memberships.sql
SELECT tests.is((SELECT count(*) FROM public.account_memberships WHERE company_id = tests.company_id('C')), 6::bigint, 'running the file again adds no duplicate row');
SELECT tests.is((SELECT count(*) FROM (SELECT company_id, user_id FROM public.account_memberships WHERE user_id IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1) AS d), 0::bigint, 'never two memberships of one user in one company');

-- ------------------------------------------------------------ the sync on role, status, company and login changes

UPDATE public.profiles SET role = 'dpa' WHERE id = tests.profile_id('A.crew_hyd');
SELECT tests.results_eq(
  format($q$SELECT kind, vessel_scope, is_dpa, manages_admins, fleet_access FROM public.account_memberships WHERE user_id = %L$q$, tests.user_id('A.crew_hyd')),
  $q$VALUES ('admin', 'all', true, true, true)$q$, 'crew -> dpa: the legacy row becomes an all-vessel admin with the DPA flags');
UPDATE public.profiles SET role = 'shore_management' WHERE id = tests.profile_id('A.crew_hyd');
SELECT tests.results_eq(
  format($q$SELECT kind, vessel_scope, is_dpa, manages_admins, fleet_access FROM public.account_memberships WHERE user_id = %L$q$, tests.user_id('A.crew_hyd')),
  $q$VALUES ('admin', 'all', false, false, true)$q$, 'dpa -> shore_management: admin without the DPA flags');
UPDATE public.profiles SET role = 'crew' WHERE id = tests.profile_id('A.crew_hyd');
SELECT tests.results_eq(
  format($q$SELECT kind, vessel_scope, is_dpa, fleet_access FROM public.account_memberships WHERE user_id = %L$q$, tests.user_id('A.crew_hyd')),
  $q$VALUES ('crew', 'assigned', false, false)$q$, 'back to crew');

UPDATE public.profiles SET account_status = 'disabled' WHERE id = tests.profile_id('A.crew_hyd');
SELECT tests.results_eq(
  format($q$SELECT status, disabled_at IS NOT NULL FROM public.account_memberships WHERE user_id = %L$q$, tests.user_id('A.crew_hyd')),
  $q$VALUES ('disabled', true)$q$, 'account_status disabled -> membership disabled');
SELECT tests.ok(NOT public.user_is_active(tests.user_id('A.crew_hyd')), 'the disabled user is not active');
UPDATE public.profiles SET account_status = 'active' WHERE id = tests.profile_id('A.crew_hyd');
SELECT tests.results_eq(
  format($q$SELECT status, disabled_at IS NULL FROM public.account_memberships WHERE user_id = %L$q$, tests.user_id('A.crew_hyd')),
  $q$VALUES ('active', true)$q$, 'account_status active again -> membership active, disabled_at cleared');
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_status_check;
UPDATE public.profiles SET account_status = 'Deactivated' WHERE id = tests.profile_id('A.crew_hyd');
SELECT tests.is((SELECT status FROM public.account_memberships WHERE user_id = tests.user_id('A.crew_hyd')), 'disabled', 'a deactivated profile (any case) is a disabled membership');
SELECT tests.ok(NOT public.user_is_active(tests.user_id('A.crew_hyd')), 'and the user is not active');
UPDATE public.profiles SET account_status = NULL WHERE id = tests.profile_id('A.crew_hyd');
SELECT tests.ok(public.user_is_active(tests.user_id('A.crew_hyd')), 'a NULL account_status counts as active');

UPDATE public.profiles SET company_id = tests.company_id('B') WHERE id = tests.profile_id('A.master_dra');
SELECT tests.results_eq(
  format($q$SELECT company_id = %L, status, removed_at IS NOT NULL, profile_id IS NOT NULL FROM public.account_memberships WHERE user_id = %L$q$, tests.company_id('B'), tests.user_id('A.master_dra')),
  $q$VALUES (false, 'removed', true, true), (true, 'active', false, true)$q$,
  'a company change removes the old legacy row and creates the new one');
SELECT tests.ok(public.user_is_active(tests.user_id('A.master_dra')), 'the moved user is active in the new company (the removed row is in the old one)');
SELECT tests.is((SELECT count(*) FROM public.reach_vessels_for(tests.user_id('A.master_dra'))), 0::bigint, 'and no longer reaches the old company''s vessel');
UPDATE public.profiles SET company_id = tests.company_id('A') WHERE id = tests.profile_id('A.master_dra');
SELECT tests.results_eq(
  format($q$SELECT company_id = %L, status, removed_at IS NULL FROM public.account_memberships WHERE user_id = %L$q$, tests.company_id('A'), tests.user_id('A.master_dra')),
  $q$VALUES (true, 'active', true), (false, 'removed', false)$q$,
  'moving back reinstates the old row and removes the other');
SELECT tests.results_eq(
  format($q$SELECT r FROM public.reach_vessels_for(%L) AS r$q$, tests.user_id('A.master_dra')),
  format($q$VALUES (%L::uuid)$q$, tests.vessel_id('A.dra')), 'and the reach is back');

SELECT tests.seed_user('A', 'A.relogin', 'crew');
SELECT tests.seed_auth_user('A.new_login');
UPDATE public.profiles SET user_id = tests.user_id('A.new_login') WHERE id = tests.profile_id('A.relogin');
SELECT tests.results_eq(
  format($q$SELECT user_id = %L, status, profile_id IS NOT NULL FROM public.account_memberships WHERE user_id IN (%L, %L)$q$,
         tests.user_id('A.new_login'), tests.user_id('A.new_login'), tests.user_id('A.relogin')),
  $q$VALUES (true, 'active', true), (false, 'removed', false)$q$,
  'a new login on a profile: the old login''s row is removed (and frees the profile), the new one gets the profile');

-- A non-legacy row is never touched by the sync.
UPDATE public.account_memberships SET legacy_managed = false, kind = 'shore', vessel_scope = 'assigned', is_dpa = false, manages_admins = false, fleet_access = false, source = 'admin'
  WHERE user_id = tests.user_id('A.fleet_manager');
UPDATE public.profiles SET role = 'crew', account_status = 'disabled' WHERE id = tests.profile_id('A.fleet_manager');
SELECT tests.results_eq(
  format($q$SELECT kind, status, legacy_managed, source FROM public.account_memberships WHERE user_id = %L$q$, tests.user_id('A.fleet_manager')),
  $q$VALUES ('shore', 'active', false, 'admin')$q$,
  'a non-legacy membership keeps its values whatever the profile does');
UPDATE public.profiles SET role = 'dpa', account_status = 'active' WHERE id = tests.profile_id('A.fleet_manager');
UPDATE public.account_memberships SET legacy_managed = true WHERE user_id = tests.user_id('A.fleet_manager');
UPDATE public.profiles SET role = 'dpa' WHERE id = tests.profile_id('A.fleet_manager');

-- ------------------------------------------------------------ constraints

SELECT tests.throws(format($q$INSERT INTO public.account_memberships (company_id, user_id, kind) VALUES (%L, %L, 'boss')$q$, tests.company_id('B'), tests.user_id('A.crew_hyd')), '23514', 'kind outside the five kinds is refused');
SELECT tests.throws(format($q$INSERT INTO public.account_memberships (company_id, user_id, kind, status) VALUES (%L, %L, 'crew', 'gone')$q$, tests.company_id('B'), tests.user_id('A.crew_hyd')), '23514', 'status outside invited / active / disabled / removed is refused');
SELECT tests.throws(format($q$INSERT INTO public.account_memberships (company_id, kind) VALUES (%L, 'crew')$q$, tests.company_id('B')), '23514', 'a membership needs a user or a profile');
SELECT tests.throws(format($q$INSERT INTO public.account_memberships (company_id, user_id, kind) VALUES (%L, %L, 'external')$q$, tests.company_id('B'), tests.user_id('A.crew_hyd')), '23514', 'an external membership needs valid_until (C17)');
SELECT tests.throws(format($q$INSERT INTO public.account_memberships (company_id, user_id, kind, valid_until, fleet_access) VALUES (%L, %L, 'external', now() + interval '1 day', true)$q$, tests.company_id('B'), tests.user_id('A.crew_hyd')), '23514', 'an external membership has no fleet access');
SELECT tests.throws(format($q$INSERT INTO public.account_memberships (company_id, user_id, kind, valid_until, vessel_scope) VALUES (%L, %L, 'external', now() + interval '1 day', 'all')$q$, tests.company_id('B'), tests.user_id('A.crew_hyd')), '23514', 'an external membership reaches assigned vessels only');
SELECT tests.throws(format($q$INSERT INTO public.account_memberships (company_id, user_id, kind) VALUES (%L, %L, 'owner')$q$, tests.company_id('B'), tests.user_id('A.crew_hyd')), '23514', 'an owner has fleet access and all vessels');
SELECT tests.lives(format($q$INSERT INTO public.account_memberships (company_id, profile_id, kind, vessel_scope, fleet_access) VALUES (%L, %L, 'owner', 'all', true)$q$, tests.company_id('A'), tests.profile_id('A.imported')), 'one owner per company');
SELECT tests.seed_auth_user('A.owner2');
SELECT tests.throws_like(format($q$INSERT INTO public.account_memberships (company_id, user_id, kind, vessel_scope, fleet_access) VALUES (%L, %L, 'owner', 'all', true)$q$, tests.company_id('A'), tests.user_id('A.owner2')), '23505', '%account_memberships_one_owner_key%', 'a second owner of the same company is refused');
SELECT tests.throws(format($q$INSERT INTO public.account_memberships (company_id, user_id, kind, is_dpa) VALUES (%L, %L, 'crew', true)$q$, tests.company_id('B'), tests.user_id('A.crew_hyd')), '23514', 'only an owner or admin can be the DPA (C19)');
SELECT tests.throws(format($q$INSERT INTO public.account_memberships (company_id, user_id, kind, valid_from, valid_until) VALUES (%L, %L, 'crew', now(), now() - interval '1 day')$q$, tests.company_id('B'), tests.user_id('A.crew_hyd')), '23514', 'a window must end after it starts');
SELECT tests.throws(format($q$INSERT INTO public.account_memberships (company_id, user_id, kind, users_access_level) VALUES (%L, %L, 'admin', 'all')$q$, tests.company_id('B'), tests.user_id('A.crew_hyd')), '23514', 'users_access_level outside none / read / write is refused');
SELECT tests.throws(format($q$INSERT INTO public.account_memberships (company_id, user_id, kind, source) VALUES (%L, %L, 'crew', 'browser')$q$, tests.company_id('B'), tests.user_id('A.crew_hyd')), '23514', 'source outside the five sources is refused');
SELECT tests.throws(format($q$UPDATE public.account_memberships SET disabled_reason = repeat('x', 501) WHERE user_id = %L$q$, tests.user_id('A.disabled')), '23514', 'a disable reason over 500 characters is refused');

-- membership vessels: company from the membership, vessel of the same company only
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
  SELECT id, tests.company_id('B'), tests.vessel_id('A.gam') FROM public.account_memberships WHERE user_id = tests.user_id('A.master_dra') AND company_id = tests.company_id('A');
SELECT tests.is(
  (SELECT mv.company_id FROM public.account_membership_vessels AS mv JOIN public.account_memberships AS m ON m.id = mv.membership_id WHERE m.user_id = tests.user_id('A.master_dra') AND mv.vessel_id = tests.vessel_id('A.gam')),
  tests.company_id('A'), 'a membership vessel''s company_id is stamped from the membership (a client value is overwritten)');
SELECT tests.throws_like(
  format($q$INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id) SELECT id, company_id, %L FROM public.account_memberships WHERE user_id = %L AND company_id = %L$q$,
         tests.vessel_id('B.lev'), tests.user_id('A.master_dra'), tests.company_id('A')),
  '23514', 'membership_vessel_company_mismatch', 'a vessel of another company is refused');
SELECT tests.throws_like(
  format($q$INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id) VALUES (gen_random_uuid(), %L, %L)$q$, tests.company_id('A'), tests.vessel_id('A.gam')),
  '23503', 'membership_not_found', 'an unknown membership is refused');
SELECT tests.throws(
  format($q$INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id, valid_from, valid_until) SELECT id, company_id, %L, now(), now() - interval '1 hour' FROM public.account_memberships WHERE user_id = %L AND company_id = %L$q$,
         tests.vessel_id('A.hyd'), tests.user_id('A.master_dra'), tests.company_id('A')),
  '23514', 'a membership vessel window must end after it starts');

-- ------------------------------------------------------------ RLS and grants

SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.results_eq(
  $q$SELECT user_id, company_id, status FROM public.account_memberships$q$,
  format($q$VALUES (%L::uuid, %L::uuid, 'active'), (%L::uuid, %L::uuid, 'removed')$q$, tests.user_id('A.master_dra'), tests.company_id('A'), tests.user_id('A.master_dra'), tests.company_id('B')),
  'a crew member reads only their own memberships (the active one and the removed one of the company they left)');
SELECT tests.is((SELECT count(*) FROM public.account_membership_vessels), 1::bigint, 'and only their own membership vessels');
SELECT tests.denied(format($q$INSERT INTO public.account_memberships (company_id, user_id, kind) VALUES (%L, %L, 'admin')$q$, tests.company_id('A'), tests.user_id('A.master_dra')), 'a user cannot insert a membership (no client writes)');
SELECT tests.denied(format($q$UPDATE public.account_memberships SET kind = 'admin', vessel_scope = 'all', fleet_access = true WHERE user_id = %L$q$, tests.user_id('A.master_dra')), 'a user cannot change their own membership (no self-escalation)');
SELECT tests.denied(format($q$DELETE FROM public.account_memberships WHERE user_id = %L$q$, tests.user_id('A.master_dra')), 'a user cannot delete a membership');
SELECT tests.denied(format($q$INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id) SELECT id, company_id, %L FROM public.account_memberships WHERE user_id = %L$q$, tests.vessel_id('A.hyd'), tests.user_id('A.master_dra')), 'a user cannot add a vessel to their own membership');
SELECT tests.reset_role();

SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.denied('SELECT * FROM public.account_memberships', 'a disabled user reads no membership, not even their own');
SELECT tests.denied('SELECT * FROM public.account_membership_vessels', 'nor membership vessels');

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is((SELECT count(*) FROM public.account_memberships WHERE company_id = tests.company_id('B')), 0::bigint, 'a company-A admin reads none of company B''s memberships');
SELECT tests.ok((SELECT count(*) FROM public.account_memberships WHERE company_id = tests.company_id('A')) >= 5, 'a company-A users-access admin reads company A''s memberships (admin read policy, file 4)');
SELECT tests.ok((SELECT count(*) FROM public.account_membership_vessels) >= 1, 'and their membership vessels');
SELECT tests.denied(format($q$UPDATE public.account_memberships SET status = 'disabled' WHERE user_id = %L$q$, tests.user_id('A.master_dra')), 'even an admin cannot write memberships directly (definers only)');

SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is((SELECT count(*) FROM public.account_memberships WHERE company_id = tests.company_id('A')), 0::bigint, 'a company-B admin reads none of company A''s memberships');
SELECT tests.is((SELECT count(*) FROM public.account_membership_vessels WHERE company_id = tests.company_id('A')), 0::bigint, 'nor its membership vessels');

SELECT tests.as_anon();
SELECT tests.denied('SELECT * FROM public.account_memberships', 'anon reads no membership');
SELECT tests.denied('SELECT * FROM public.account_membership_vessels', 'anon reads no membership vessel');
SELECT tests.as_service();
SELECT tests.ok((SELECT count(*) FROM public.account_memberships) >= 10, 'the service role reads every membership');
SELECT tests.reset_role();

SELECT tests.ok(NOT has_table_privilege('anon', 'public.account_memberships', 'SELECT,INSERT,UPDATE,DELETE'), 'anon holds no privilege on account_memberships');
SELECT tests.ok(NOT has_table_privilege('authenticated', 'public.account_memberships', 'INSERT,UPDATE,DELETE'), 'authenticated holds no write privilege on account_memberships');
SELECT tests.ok(NOT has_table_privilege('authenticated', 'public.account_membership_vessels', 'INSERT,UPDATE,DELETE'), 'authenticated holds no write privilege on account_membership_vessels');
SELECT tests.ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.account_memberships'::regclass) AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.account_membership_vessels'::regclass), 'RLS is on for both tables');

-- ------------------------------------------------------------ my_account_status() and record_session_start()

SELECT tests.seed_user('A', 'A.invitee', 'crew', 'invited');
SELECT tests.seed_auth_user('A.no_profile');
SELECT tests.is(public.my_account_status(), 'no_profile', 'without a JWT there is no caller profile');
SELECT tests.is(public.record_session_start(), 'no_profile', 'record_session_start without a JWT writes nothing');

SELECT tests.as_user(tests.user_id('A.invitee'));
SELECT tests.is(public.my_account_status(), 'active', 'an invited user is active (only disabled / deactivated deny)');
SELECT tests.is(public.record_session_start(), 'active', 'record_session_start answers active');
SELECT tests.is(auth.uid(), tests.user_id('A.invitee'), 'the caller''s claims are intact after record_session_start');
SELECT tests.is(current_setting('storm.access_engine', true), '', 'storm.access_engine is reset before it returns');
SELECT tests.reset_role();
SELECT tests.ok((SELECT tgname IS NOT NULL FROM pg_trigger WHERE tgname = 'trg_profiles_guard_privileged_columns'), 'the legacy privileged-column guard is live in this database');
SELECT tests.results_eq(
  format($q$SELECT account_status, last_login_at IS NOT NULL FROM public.profiles WHERE id = %L$q$, tests.profile_id('A.invitee')),
  $q$VALUES ('active'::text, true)$q$, 'the first sign-in moves invited -> active and records last_login_at, despite the legacy guard (CC-19)');
SELECT tests.results_eq(
  format($q$SELECT status, accepted_at IS NOT NULL, last_active_at IS NOT NULL FROM public.account_memberships WHERE user_id = %L$q$, tests.user_id('A.invitee')),
  $q$VALUES ('active', true, true)$q$, 'and the membership''s accepted_at and last_active_at');

UPDATE public.profiles SET last_login_at = now() - interval '1 minute' WHERE id = tests.profile_id('A.invitee');
SELECT tests.as_user(tests.user_id('A.invitee'));
SELECT public.record_session_start();
SELECT tests.reset_role();
SELECT tests.is((SELECT last_login_at FROM public.profiles WHERE id = tests.profile_id('A.invitee')), now() - interval '1 minute', 'a sign-in within 5 minutes does not rewrite last_login_at');
UPDATE public.profiles SET last_login_at = now() - interval '10 minutes' WHERE id = tests.profile_id('A.invitee');
SELECT tests.as_user(tests.user_id('A.invitee'));
SELECT public.record_session_start();
SELECT tests.reset_role();
SELECT tests.is((SELECT last_login_at FROM public.profiles WHERE id = tests.profile_id('A.invitee')), now(), 'a sign-in after 5 minutes rewrites last_login_at');

SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is(public.my_account_status(), 'disabled', 'my_account_status tells a disabled user');
SELECT tests.is(public.record_session_start(), 'disabled', 'record_session_start answers disabled');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT last_login_at IS NULL FROM public.profiles WHERE id = %L$q$, tests.profile_id('A.disabled')),
  $q$VALUES (true)$q$, 'and writes nothing for them');
SELECT tests.is((SELECT accepted_at FROM public.account_memberships WHERE user_id = tests.user_id('A.disabled')), NULL::timestamptz, 'nor on their membership');

SELECT tests.as_user(tests.user_id('A.no_profile'));
SELECT tests.is(public.my_account_status(), 'no_profile', 'a login without a profile is no_profile');
SELECT tests.is(public.record_session_start(), 'no_profile', 'record_session_start answers no_profile');
SELECT tests.reset_role();

DO $$
BEGIN
  IF to_regclass('public.user_invitations') IS NULL THEN
    -- 20261123010200_platform_user_invitations.sql is not in this database:
    -- stand in for its table to check the cross-file branch.
    CREATE TABLE public.user_invitations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, profile_id uuid, status text, accepted_at timestamptz);
    INSERT INTO public.user_invitations (user_id, profile_id, status) VALUES
      (NULL, tests.profile_id('A.relogin'), 'sent'),
      (tests.user_id('A.new_login'), NULL, 'send_failed'),
      (NULL, tests.profile_id('A.relogin'), 'revoked');
    PERFORM tests.as_user(tests.user_id('A.new_login'));
    PERFORM public.record_session_start();
    PERFORM tests.reset_role();
    PERFORM tests.is(
      (SELECT string_agg(status || ':' || (accepted_at IS NOT NULL)::text, ',' ORDER BY status) FROM public.user_invitations),
      'accepted:true,accepted:true,revoked:false',
      'record_session_start accepts the caller''s live invitations by profile and by user id, and leaves a revoked one');
  ELSE
    PERFORM tests.ok(true, 'user_invitations exists: acceptance is covered by the invitation tests # SKIP');
  END IF;
END
$$;

-- ------------------------------------------------------------ function privileges (rule 5)

SELECT tests.results_eq(
  $q$SELECT p.oid::regprocedure::text, coalesce(string_agg(a.grantee::regrole::text, ',' ORDER BY a.grantee::regrole::text) FILTER (WHERE a.grantee <> p.proowner), '')
     FROM pg_proc AS p CROSS JOIN LATERAL aclexplode(p.proacl) AS a
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('user_is_active', 'my_account_status', 'record_session_start', 'legacy_all_vessels', 'legacy_fleet_reach',
                         'vessel_in_reachable_state', 'reach_vessels_for', 'reach_vessel_for', 'fleet_reach_for', 'user_vessel_reach',
                         'user_can_reach_vessel', 'user_has_fleet_reach', 'account_membership_vessels_company', 'account_memberships_sync_from_profile')
     GROUP BY 1$q$,
  $q$VALUES ('user_is_active(uuid)', 'authenticated,service_role'), ('my_account_status()', 'authenticated'), ('record_session_start()', 'authenticated'),
            ('legacy_all_vessels(uuid)', 'service_role'), ('legacy_fleet_reach(uuid)', 'service_role'),
            ('vessel_in_reachable_state(text,text)', 'authenticated,service_role'), ('reach_vessels_for(uuid)', 'service_role'),
            ('reach_vessel_for(uuid,uuid)', 'service_role'), ('fleet_reach_for(uuid,uuid)', 'service_role'),
            ('user_vessel_reach(uuid)', 'authenticated,service_role'), ('user_can_reach_vessel(uuid,uuid)', 'authenticated,service_role'),
            ('user_has_fleet_reach(uuid,uuid)', 'authenticated,service_role'), ('account_membership_vessels_company()', ''),
            ('account_memberships_sync_from_profile()', '')$q$,
  'EXECUTE grants are exactly the spec''s (internal helpers service role only; trigger functions nobody)');
SELECT tests.is_empty(
  $q$SELECT p.oid::regprocedure FROM pg_proc AS p
     WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
       AND p.proname IN ('user_is_active', 'my_account_status', 'record_session_start', 'legacy_all_vessels', 'legacy_fleet_reach', 'reach_vessels_for',
                         'reach_vessel_for', 'fleet_reach_for', 'user_vessel_reach', 'user_can_reach_vessel', 'user_has_fleet_reach',
                         'account_membership_vessels_company', 'account_memberships_sync_from_profile')
       AND NOT coalesce(p.proconfig @> ARRAY['search_path=public'], false)$q$,
  'every definer of this file pins search_path = public');
