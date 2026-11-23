-- Disabled users get nothing (spec §A.7; CC-6, CC-7, CC-10; D-122):
-- the disabled-user matrix (profile disabled, profile deactivated,
-- membership disabled, membership removed, auth ban in force) over live
-- tables guarded by the redefined helpers, an inline profiles subquery and
-- has_any_role, the own profile row included; my_account_status() still
-- answers; the seven helpers deny; re-enabling restores; the privileged
-- profile columns guard; set_membership_status (W7 guards) and
-- auth_user_id_for_email; ACLs (rule 5).

SELECT tests.seed_two_tenants();

-- Every persona below sits on A.hyd and holds a user_roles dpa row of
-- company A, so without the active check they would read everything.
SELECT tests.seed_user('A', 'A.colleague', 'crew');
SELECT tests.seed_user('A', 'A.deact', 'crew');
SELECT tests.seed_user('A', 'A.mem_off', 'crew');
SELECT tests.seed_user('A', 'A.removed', 'crew');
SELECT tests.seed_user('A', 'A.banned', 'crew');
SELECT tests.seed_user('A', 'A.ban_over', 'crew');
SELECT tests.seed_assignment(k, 'A.hyd', true, 'Deckhand'),
       tests.seed_user_role(k, 'dpa', 'A')
FROM unnest(ARRAY['A.colleague', 'A.disabled', 'A.deact', 'A.mem_off', 'A.removed', 'A.banned', 'A.ban_over']) AS k;

-- Isolate one condition per persona (the profile sync would also disable
-- the membership of a disabled profile; put it back to active).
UPDATE public.account_memberships SET status = 'active', disabled_at = NULL WHERE user_id = tests.user_id('A.disabled');
ALTER TABLE public.profiles DROP CONSTRAINT profiles_account_status_check;
UPDATE public.profiles SET account_status = 'deactivated' WHERE user_id = tests.user_id('A.deact');
ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_status_check CHECK (account_status = ANY (ARRAY['active'::text, 'disabled'::text, 'invited'::text, 'not_invited'::text])) NOT VALID;
UPDATE public.account_memberships SET status = 'active', disabled_at = NULL WHERE user_id = tests.user_id('A.deact');
UPDATE public.account_memberships SET status = 'disabled', disabled_at = now() WHERE user_id = tests.user_id('A.mem_off');
UPDATE public.account_memberships SET status = 'removed', removed_at = now() WHERE user_id = tests.user_id('A.removed');
UPDATE auth.users SET banned_until = now() + interval '1 day' WHERE id = tests.user_id('A.banned');
UPDATE auth.users SET banned_until = now() - interval '1 minute' WHERE id = tests.user_id('A.ban_over');

SELECT tests.is((SELECT account_status FROM public.profiles WHERE user_id = tests.user_id('A.disabled')), 'disabled', 'A.disabled: profile disabled');
SELECT tests.is((SELECT status FROM public.account_memberships WHERE user_id = tests.user_id('A.disabled')), 'active', 'A.disabled: membership active (one condition only)');
SELECT tests.is((SELECT account_status FROM public.profiles WHERE user_id = tests.user_id('A.deact')), 'deactivated', 'A.deact: profile deactivated');
SELECT tests.ok(NOT public.user_is_active(tests.user_id(k)), k || ' is not active')
FROM unnest(ARRAY['A.disabled', 'A.deact', 'A.mem_off', 'A.removed', 'A.banned']) AS k;
SELECT tests.ok(public.user_is_active(tests.user_id(k)), k || ' is active')
FROM unnest(ARRAY['A.colleague', 'A.ban_over']) AS k;

-- Data in company A for every guarded table.
INSERT INTO public.alerts (id, alert_type, severity_color, title, company_id, vessel_id)
VALUES (tests.id('alert:A'), 'certificate_expiry', 'ORANGE', 'Certificate expires soon', tests.company_id('A'), tests.vessel_id('A.hyd'));
INSERT INTO public.activity_log (id, company_id, vessel_id, activity_type, title)
VALUES (tests.id('activity:A'), tests.company_id('A'), tests.vessel_id('A.hyd'), 'drill_completed', 'Fire drill completed');
INSERT INTO public.admin_action_log (id, actor_user_id, action_type, target_user_id)
VALUES (tests.id('admin_log:A'), tests.user_id('A.fleet_manager'), 'RESET_ACCOUNT', tests.user_id('A.crew_hyd'));
INSERT INTO public.crew_certificates (id, user_id, certificate_type, certificate_name)
VALUES (tests.id('cert:A'), tests.user_id('A.colleague'), 'STCW', 'Basic safety training');
INSERT INTO public.vessel_module_settings (vessel_id, company_id, module_key, enabled)
VALUES (tests.vessel_id('A.hyd'), tests.company_id('A'), 'safety', true);
SELECT tests.seed_profile('A', 'A.invited_crew', 'crew', 'invited');
INSERT INTO public.user_invitations (company_id, profile_id, status) VALUES (tests.company_id('A'), tests.profile_id('A.invited_crew'), 'pending');
INSERT INTO public.permission_audit_log (actor_user_id, actor_role, action_type, company_id, target_user_id)
VALUES (tests.user_id('A.fleet_manager'), 'dpa', 'role_assigned', tests.company_id('A'), tests.user_id('A.colleague'));

-- ------------------------------------------------------------ the matrix

CREATE TEMP TABLE guarded (tbl text, guard text) ON COMMIT DROP;
INSERT INTO guarded VALUES
  ('vessels', 'vessels_select (reach)'),
  ('profiles', 'own row + user_belongs_to_company'),
  ('companies', 'user_belongs_to_company'),
  ('crew_assignments', 'user_belongs_to_company subquery'),
  ('alerts', 'user_belongs_to_company'),
  ('activity_log', 'inline profiles subquery'),
  ('admin_action_log', 'has_any_role'),
  ('crew_certificates', 'inline profiles EXISTS + user_belongs_to_company'),
  ('vessel_module_settings', 'reach helpers'),
  ('account_memberships', 'own row + user_is_active'),
  ('user_invitations', 'has_capability (file 9)'),
  ('permission_audit_log', 'has_capability (file 8)');
GRANT SELECT ON guarded TO authenticated;

-- An active colleague reads every one of them.
SELECT tests.as_user(tests.user_id('A.colleague'));
DO $$
DECLARE t record; n bigint;
BEGIN
  FOR t IN SELECT * FROM guarded ORDER BY tbl LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t.tbl) INTO n;
    PERFORM tests.ok(n > 0, format('active colleague reads %s (%s): %s row(s)', t.tbl, t.guard, n));
  END LOOP;
END
$$;
SELECT tests.is((SELECT count(*) FROM public.profiles WHERE user_id = auth.uid()), 1::bigint, 'active colleague reads their own profile row');

-- Every disabled variant reads nothing, the own profile row included.
DO $$
DECLARE p text; t record;
BEGIN
  FOREACH p IN ARRAY ARRAY['A.disabled', 'A.deact', 'A.mem_off', 'A.removed', 'A.banned'] LOOP
    PERFORM tests.as_user(tests.user_id(p));
    FOR t IN SELECT * FROM guarded ORDER BY tbl LOOP
      PERFORM tests.is_empty(format('SELECT 1 FROM public.%I', t.tbl), format('%s reads no row of %s (%s)', p, t.tbl, t.guard));
    END LOOP;
    PERFORM tests.is_empty('SELECT 1 FROM public.profiles WHERE user_id = auth.uid()', p || ' does not read their own profile row');
    PERFORM tests.is(public.my_account_status(), 'disabled', p || ': my_account_status() still answers disabled');
    PERFORM tests.is(public.record_session_start(), 'disabled', p || ': record_session_start() answers disabled');
    PERFORM tests.is(public.get_user_company_id(auth.uid()), NULL::uuid, p || ': get_user_company_id is NULL');
    PERFORM tests.is(public.my_profile_id(), NULL::uuid, p || ': my_profile_id is NULL');
    PERFORM tests.is(public.current_user_company_id(), NULL::uuid, p || ': current_user_company_id is NULL');
    PERFORM tests.ok(NOT public.has_role(auth.uid(), 'dpa'), p || ': has_role(dpa) is false despite the user_roles row');
    PERFORM tests.ok(NOT public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa']::public.app_role[]), p || ': has_any_role is false');
    PERFORM tests.is(public.legacy_profile_role(auth.uid()), NULL::text, p || ': legacy_profile_role is NULL');
    PERFORM tests.ok(NOT public.user_belongs_to_company(auth.uid(), tests.company_id('A')), p || ': user_belongs_to_company is false');
    PERFORM tests.ok(NOT coalesce(public.hr_can_view(auth.uid()), false), p || ': hr_can_view (built on the helpers) is not true');
  END LOOP;
END
$$;
SELECT tests.reset_role();

-- An ended ban is no ban.
SELECT tests.as_user(tests.user_id('A.ban_over'));
SELECT tests.ok((SELECT count(*) FROM public.vessels) > 0, 'an expired auth ban does not block reads');
SELECT tests.is(public.my_account_status(), 'active', 'expired ban: my_account_status() active');
SELECT tests.reset_role();

-- The active user's own view of the helpers is unchanged.
SELECT tests.as_user(tests.user_id('A.colleague'));
SELECT tests.is(public.get_user_company_id(auth.uid()), tests.company_id('A'), 'active: get_user_company_id');
SELECT tests.is(public.my_profile_id(), tests.profile_id('A.colleague'), 'active: my_profile_id');
SELECT tests.is(public.current_user_company_id(), tests.company_id('A'), 'active: current_user_company_id (user_roles)');
SELECT tests.ok(public.has_role(auth.uid(), 'dpa'), 'active: has_role(dpa)');
SELECT tests.is(public.legacy_profile_role(auth.uid()), 'crew', 'active: legacy_profile_role');
-- Asked about a disabled colleague, the helpers answer "not active" too.
SELECT tests.ok(NOT public.user_belongs_to_company(tests.user_id('A.disabled'), tests.company_id('A')), 'a disabled colleague does not belong (asked by an active member)');
SELECT tests.ok(NOT public.has_role(tests.user_id('A.disabled'), 'dpa'), 'has_role of a disabled colleague is false');
-- Across companies the helpers never answer.
SELECT tests.ok(NOT public.user_belongs_to_company(tests.user_id('B.admin'), tests.company_id('B')), 'no cross-tenant probing through user_belongs_to_company');
SELECT tests.is(public.get_user_company_id(tests.user_id('B.admin')), NULL::uuid, 'no cross-tenant probing through get_user_company_id');
SELECT tests.reset_role();

-- Re-enabling restores access.
UPDATE public.profiles SET account_status = 'active' WHERE user_id = tests.user_id('A.disabled');
UPDATE public.account_memberships SET status = 'active' WHERE user_id = tests.user_id('A.mem_off');
UPDATE auth.users SET banned_until = NULL WHERE id = tests.user_id('A.banned');
DO $$
DECLARE p text;
BEGIN
  FOREACH p IN ARRAY ARRAY['A.disabled', 'A.mem_off', 'A.banned'] LOOP
    PERFORM tests.as_user(tests.user_id(p));
    PERFORM tests.ok((SELECT count(*) FROM public.vessels) > 0, p || ' re-enabled: reads vessels again');
    PERFORM tests.is((SELECT count(*) FROM public.profiles WHERE user_id = auth.uid()), 1::bigint, p || ' re-enabled: reads their own profile');
    PERFORM tests.ok((SELECT count(*) FROM public.activity_log) > 0, p || ' re-enabled: the inline-subquery table is readable');
    PERFORM tests.is(public.my_account_status(), 'active', p || ' re-enabled: my_account_status() active');
  END LOOP;
END
$$;
SELECT tests.reset_role();

-- ------------------------------------------------------------ privileged profile columns (CC-6)

SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.throws_like(format($q$UPDATE public.profiles SET role = 'dpa' WHERE user_id = %L$q$, tests.user_id('A.crew_hyd')), '42501', 'profile_access_columns_locked', 'a user cannot make themselves dpa');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET account_status = 'invited' WHERE user_id = %L$q$, tests.user_id('A.crew_hyd')), '42501', 'profile_access_columns_locked', 'a user cannot change their own account_status');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET company_id = %L WHERE user_id = %L$q$, tests.company_id('B'), tests.user_id('A.crew_hyd')), '42501', 'profile_access_columns_locked', 'a user cannot move themselves to another company');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET user_id = %L WHERE user_id = %L$q$, tests.user_id('A.colleague'), tests.user_id('A.crew_hyd')), '42501', 'profile_access_columns_locked', 'a user cannot change the login of their profile');
SELECT tests.lives(format($q$UPDATE public.profiles SET phone = '+00 000' WHERE user_id = %L$q$, tests.user_id('A.crew_hyd')), 'a user still edits their own ordinary columns');
SELECT tests.is((SELECT role::text FROM public.profiles WHERE user_id = tests.user_id('A.crew_hyd')), 'crew', 'role unchanged');

-- An HR editor (the Master: hr_can_edit) passes the company-profiles policy but not the guard.
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.ok(public.hr_can_edit(auth.uid()), 'the Master is an HR editor');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET role = 'dpa' WHERE user_id = %L$q$, tests.user_id('A.crew_hyd')), '42501', 'profile_access_columns_locked', 'an HR editor cannot set anyone''s role to dpa');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET account_status = 'disabled' WHERE user_id = %L$q$, tests.user_id('A.crew_hyd')), '42501', 'profile_access_columns_locked', 'an HR editor cannot change an account status');

-- A users-access admin changes another user's role in their company, never their own.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format($q$UPDATE public.profiles SET role = 'chief_officer' WHERE user_id = %L$q$, tests.user_id('A.crew_hyd')), 'a users-access admin changes a colleague''s role');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET role = 'crew' WHERE user_id = %L$q$, tests.user_id('A.fleet_manager')), '42501', 'profile_access_columns_locked', 'a users-access admin cannot change their own role');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET company_id = %L WHERE user_id = %L$q$, tests.company_id('B'), tests.user_id('A.crew_hyd')), '42501', 'profile_access_columns_locked', 'nobody moves a profile to another company from a session');
-- With the engine flag (this phase's definers) the guard steps aside.
SELECT set_config('storm.access_engine', 'on', true);
SELECT tests.lives(format($q$UPDATE public.profiles SET last_login_at = now(), account_status = 'active' WHERE user_id = %L$q$, tests.user_id('A.fleet_manager')), 'storm.access_engine lets an engine definer change a guarded column');
SELECT set_config('storm.access_engine', '', true);
SELECT tests.reset_role();
SELECT tests.is((SELECT role::text FROM public.profiles WHERE user_id = tests.user_id('A.crew_hyd')), 'chief_officer', 'the admin''s role change stuck');

-- The service role (no JWT) changes anything.
SELECT tests.as_service();
SELECT tests.lives(format($q$UPDATE public.profiles SET role = 'crew', account_status = 'active' WHERE user_id = %L$q$, tests.user_id('A.crew_hyd')), 'the service role changes role and status');
SELECT tests.reset_role();

-- INSERT: an administrator profile needs users-access admin in its company.
SELECT tests._set_claims(jsonb_build_object('sub', tests.user_id('A.master_dra'), 'role', 'authenticated'));
SELECT tests.throws_like(format($q$INSERT INTO public.profiles (id, email, first_name, last_name, company_id, role) VALUES (%L, 'new-dpa@example.test', 'DPA', 'new', %L, 'dpa')$q$, tests.id('profile:new_dpa'), tests.company_id('A')), '42501', 'profile_access_columns_locked', 'a non-admin session cannot create a dpa profile');
SELECT tests.lives(format($q$INSERT INTO public.profiles (id, email, first_name, last_name, company_id, role) VALUES (%L, 'new-crew@example.test', 'Crew', 'new', %L, 'crew')$q$, tests.id('profile:new_crew'), tests.company_id('A')), 'a crew profile needs no admin');
SELECT tests._set_claims(jsonb_build_object('sub', tests.user_id('A.fleet_manager'), 'role', 'authenticated'));
SELECT tests.lives(format($q$INSERT INTO public.profiles (id, email, first_name, last_name, company_id, role) VALUES (%L, 'new-shore@example.test', 'Shore', 'new', %L, 'shore_management')$q$, tests.id('profile:new_shore'), tests.company_id('A')), 'a users-access admin creates an administrator profile in their company');
SELECT tests.throws_like(format($q$INSERT INTO public.profiles (id, email, first_name, last_name, company_id, role) VALUES (%L, 'other-dpa@example.test', 'DPA', 'other', %L, 'dpa')$q$, tests.id('profile:other_dpa'), tests.company_id('B')), '42501', 'profile_access_columns_locked', 'not in another company');
SELECT tests.reset_role();

-- ------------------------------------------------------------ set_membership_status (W7)

SELECT tests.seed_user('A', 'A.shore', 'shore_management');
SELECT tests.seed_user('A', 'A.owner', 'crew');
UPDATE public.account_memberships SET legacy_managed = false, source = 'admin', kind = 'owner', vessel_scope = 'all', fleet_access = true WHERE user_id = tests.user_id('A.owner');
-- Company C: the only manager of admins is a crew member with a user_roles dpa row.
SELECT tests.seed_user('C', 'C.only_manager', 'crew');
SELECT tests.seed_user_role('C.only_manager', 'dpa', 'C');
SELECT tests.seed_user('C', 'C.shore', 'shore_management');

SELECT tests.as_service();
SELECT tests.throws_like(format($q$SELECT public.set_membership_status(%L, 'disabled', NULL, 'Left')$q$, tests.user_id('A.crew_hyd')), '22023', 'actor_required', 'the actor is required');
SELECT tests.throws_like(format($q$SELECT public.set_membership_status(%L, 'banned', %L, 'Left')$q$, tests.user_id('A.crew_hyd'), tests.user_id('A.fleet_manager')), '22023', 'status_invalid', 'only active / disabled');
SELECT tests.throws_like(format($q$SELECT public.set_membership_status(%L, 'disabled', %L, NULL)$q$, tests.user_id('A.crew_hyd'), tests.user_id('A.fleet_manager')), '22023', 'reason_required', 'disabling needs a reason');
SELECT tests.throws_like(format($q$SELECT public.set_membership_status(%L, 'disabled', %L, '   ')$q$, tests.user_id('A.crew_hyd'), tests.user_id('A.fleet_manager')), '22023', 'reason_required', 'a blank reason is no reason');
SELECT tests.throws_like(format($q$SELECT public.set_membership_status(%L, 'disabled', %L, 'Testing')$q$, tests.user_id('A.fleet_manager'), tests.user_id('A.fleet_manager')), '42501', 'self_change_refused', 'no self-disable');
SELECT tests.throws_like(format($q$SELECT public.set_membership_status(%L, 'disabled', %L, 'Testing')$q$, tests.user_id('A.owner'), tests.user_id('A.fleet_manager')), '42501', 'owner_membership_locked', 'the owner membership is untouchable');
SELECT tests.throws_like(format($q$SELECT public.set_membership_status(%L, 'disabled', %L, 'Testing')$q$, tests.user_id('A.crew_hyd'), tests.user_id('B.admin')), '42501', 'not_permitted', 'an admin of company B cannot act on a company A user');
SELECT tests.throws_like(format($q$SELECT public.set_membership_status(%L, 'disabled', %L, 'Testing')$q$, tests.user_id('A.colleague'), tests.user_id('A.master_dra')), '42501', 'not_permitted', 'a non-admin cannot act');
SELECT tests.throws_like(format($q$SELECT public.set_membership_status(%L, 'disabled', %L, 'Testing')$q$, tests.id('user:nobody'), tests.user_id('A.fleet_manager')), '42501', 'not_permitted', 'an unknown target is refused (fail closed)');
SELECT tests.throws_like(format($q$SELECT public.set_membership_status(%L, 'disabled', %L, 'Testing')$q$, tests.user_id('A.fleet_manager'), tests.user_id('A.shore')), '42501', 'manages_admins_required', 'an admin who does not manage admins cannot disable a DPA');
SELECT tests.throws_like(format($q$SELECT public.set_membership_status(%L, 'disabled', %L, 'Testing')$q$, tests.user_id('C.only_manager'), tests.user_id('C.shore')), '42501', 'last_manager_of_admins', 'never the last manager of admins');
SELECT tests.reset_role();

-- The happy path: the DPA turns a crew member's access off, then on.
SELECT tests.as_service();
SELECT tests.lives(format($q$SELECT public.set_membership_status(%L, 'disabled', %L, '  Left the vessel  ')$q$, tests.user_id('A.crew_hyd'), tests.user_id('A.fleet_manager')), 'the DPA disables a crew member with a reason');
SELECT tests.reset_role();
SELECT tests.is((SELECT status FROM public.account_memberships WHERE user_id = tests.user_id('A.crew_hyd')), 'disabled', 'membership disabled');
SELECT tests.is((SELECT disabled_by FROM public.account_memberships WHERE user_id = tests.user_id('A.crew_hyd')), tests.user_id('A.fleet_manager'), 'disabled_by is the actor');
SELECT tests.is((SELECT disabled_reason FROM public.account_memberships WHERE user_id = tests.user_id('A.crew_hyd')), 'Left the vessel', 'disabled_reason trimmed');
SELECT tests.ok((SELECT disabled_at IS NOT NULL FROM public.account_memberships WHERE user_id = tests.user_id('A.crew_hyd')), 'disabled_at stamped');
SELECT tests.is((SELECT account_status FROM public.profiles WHERE user_id = tests.user_id('A.crew_hyd')), 'disabled', 'the legacy account_status mirrors it');
SELECT tests.ok(NOT public.user_is_active(tests.user_id('A.crew_hyd')), 'the user is no longer active');
SELECT tests.is((SELECT count(*) FROM public.admin_action_log WHERE action_type = 'TOGGLE_ACCESS' AND target_user_id = tests.user_id('A.crew_hyd') AND actor_user_id = tests.user_id('A.fleet_manager') AND reason = 'Left the vessel'), 1::bigint, 'one TOGGLE_ACCESS row');
SELECT tests.is((SELECT after_json ->> 'membership_status' FROM public.admin_action_log WHERE action_type = 'TOGGLE_ACCESS' AND target_user_id = tests.user_id('A.crew_hyd')), 'disabled', 'the log row records the new status');
SELECT tests.ok((SELECT NOT (before_json::text || after_json::text ~ '@') FROM public.admin_action_log WHERE action_type = 'TOGGLE_ACCESS' AND target_user_id = tests.user_id('A.crew_hyd')), 'the log row carries no email address');
SELECT tests.is(current_setting('storm.access_engine', true), '', 'the engine flag is reset after the call');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is_empty('SELECT 1 FROM public.vessels', 'the disabled crew member reads nothing');
SELECT tests.reset_role();

SELECT tests.as_service();
SELECT tests.lives(format($q$SELECT public.set_membership_status(%L, 'active', %L)$q$, tests.user_id('A.crew_hyd'), tests.user_id('A.fleet_manager')), 'enabling needs no reason');
SELECT tests.reset_role();
SELECT tests.is((SELECT status FROM public.account_memberships WHERE user_id = tests.user_id('A.crew_hyd')), 'active', 'membership active again');
SELECT tests.ok((SELECT disabled_at IS NULL AND disabled_by IS NULL AND disabled_reason IS NULL FROM public.account_memberships WHERE user_id = tests.user_id('A.crew_hyd')), 'disabled_* cleared');
SELECT tests.is((SELECT account_status FROM public.profiles WHERE user_id = tests.user_id('A.crew_hyd')), 'active', 'account_status active again');
SELECT tests.ok(public.user_is_active(tests.user_id('A.crew_hyd')), 'active again');

-- Enabling keeps an invited profile invited (it becomes active at the first sign-in).
SELECT tests.seed_user('A', 'A.invitee', 'crew', 'invited');
SELECT tests.as_service();
SELECT tests.lives(format($q$SELECT public.set_membership_status(%L, 'active', %L)$q$, tests.user_id('A.invitee'), tests.user_id('A.fleet_manager')), 'enable an invited user');
SELECT tests.reset_role();
SELECT tests.is((SELECT account_status FROM public.profiles WHERE user_id = tests.user_id('A.invitee')), 'invited', 'an invited profile stays invited');

-- A non-legacy admin membership needs a manager of admins too; the DPA may.
SELECT tests.seed_user('A', 'A.ua_admin', 'crew');
UPDATE public.account_memberships SET legacy_managed = false, source = 'admin', kind = 'admin', users_access_level = 'write', vessel_scope = 'all', fleet_access = true WHERE user_id = tests.user_id('A.ua_admin');
SELECT tests.as_service();
SELECT tests.throws_like(format($q$SELECT public.set_membership_status(%L, 'disabled', %L, 'Testing')$q$, tests.user_id('A.ua_admin'), tests.user_id('A.shore')), '42501', 'manages_admins_required', 'a non-DPA admin cannot disable an admin membership');
SELECT tests.lives(format($q$SELECT public.set_membership_status(%L, 'disabled', %L, 'Role ended')$q$, tests.user_id('A.ua_admin'), tests.user_id('A.fleet_manager')), 'the DPA can');
SELECT tests.reset_role();
SELECT tests.is((SELECT status FROM public.account_memberships WHERE user_id = tests.user_id('A.ua_admin')), 'disabled', 'non-legacy membership disabled');

-- ------------------------------------------------------------ auth_user_id_for_email

SELECT tests.as_service();
SELECT tests.is(public.auth_user_id_for_email('  ' || upper(tests.email('A.crew_hyd')) || ' '), tests.user_id('A.crew_hyd'), 'auth_user_id_for_email: case-insensitive, trimmed');
SELECT tests.is(public.auth_user_id_for_email('nobody@example.test'), NULL::uuid, 'auth_user_id_for_email: unknown address -> NULL');
SELECT tests.is(public.auth_user_id_for_email(NULL), NULL::uuid, 'auth_user_id_for_email: NULL -> NULL');
SELECT tests.is(public.auth_user_id_for_email('   '), NULL::uuid, 'auth_user_id_for_email: blank -> NULL');
SELECT tests.reset_role();

-- ------------------------------------------------------------ ACLs (rule 5)

SELECT tests.ok(NOT has_function_privilege('authenticated', 'public.set_membership_status(uuid,text,uuid,text)', 'EXECUTE'), 'authenticated cannot execute set_membership_status');
SELECT tests.ok(NOT has_function_privilege('authenticated', 'public.auth_user_id_for_email(text)', 'EXECUTE'), 'authenticated cannot execute auth_user_id_for_email');
SELECT tests.ok(NOT has_function_privilege('authenticated', 'public.user_manages_admins_for(uuid,uuid)', 'EXECUTE'), 'authenticated cannot execute user_manages_admins_for');
SELECT tests.ok(has_function_privilege('service_role', 'public.set_membership_status(uuid,text,uuid,text)', 'EXECUTE'), 'service_role executes set_membership_status');
SELECT tests.ok(NOT has_function_privilege('anon', f, 'EXECUTE') AND has_function_privilege('authenticated', f, 'EXECUTE') AND has_function_privilege('service_role', f, 'EXECUTE'),
                f || ': authenticated + service_role only (no PUBLIC, no anon)')
FROM unnest(ARRAY['public.user_belongs_to_company(uuid,uuid)', 'public.get_user_company_id(uuid)', 'public.my_profile_id()', 'public.current_user_company_id()',
                  'public.has_role(uuid,public.app_role)', 'public.has_any_role(uuid,public.app_role[])', 'public.legacy_profile_role(uuid)']) AS f;
SELECT tests.ok(NOT EXISTS (
  SELECT 1 FROM pg_proc AS p, aclexplode(p.proacl) AS a
  WHERE p.oid = ANY (ARRAY['public.user_belongs_to_company(uuid,uuid)'::regprocedure, 'public.has_role(uuid,public.app_role)'::regprocedure, 'public.has_any_role(uuid,public.app_role[])'::regprocedure])
    AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'), 'the redefined helpers are not granted to PUBLIC any more');
SELECT tests.ok(NOT has_function_privilege('authenticated', 'public.profiles_guard_access_columns()', 'EXECUTE')
            AND NOT has_function_privilege('service_role', 'public.profiles_guard_access_columns()', 'EXECUTE'), 'the trigger function is granted to nobody');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws(format($q$SELECT public.set_membership_status(%L, 'disabled', %L, 'x')$q$, tests.user_id('A.colleague'), tests.user_id('A.fleet_manager')), '42501', 'a browser session cannot call set_membership_status');
SELECT tests.reset_role();
SELECT tests.as_anon();
SELECT tests.throws('SELECT public.user_belongs_to_company(NULL, NULL)', '42501', 'anon cannot execute user_belongs_to_company');
SELECT tests.reset_role();
SELECT tests.ok((SELECT prosecdef AND proconfig @> ARRAY['search_path=public'] FROM pg_proc WHERE oid = f::regprocedure), f || ': SECURITY DEFINER with search_path')
FROM unnest(ARRAY['public.set_membership_status(uuid,text,uuid,text)', 'public.auth_user_id_for_email(text)', 'public.profiles_guard_access_columns()',
                  'public.user_manages_admins_for(uuid,uuid)', 'public.user_belongs_to_company(uuid,uuid)', 'public.has_any_role(uuid,public.app_role[])']) AS f;
