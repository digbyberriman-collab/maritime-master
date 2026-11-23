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
  ('admin_action_log', 'has_capability (company-scoped, 20261123010400)'),
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

-- The invitation and sign-in bookkeeping is the engine's (review round 2,
-- profile-invite-bookkeeping-writable; D-174, D-176, D-183): the HR editor
-- writes none of it, on another profile or on their own.
SELECT tests.ok(NOT public.has_capability('admin.access.users_access.admin', tests.company_id('A')), 'the Master is not a users-access admin');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET %s WHERE user_id = %L$q$, c.set_clause, tests.user_id(c.target)), '42501', 'profile_access_columns_locked',
                         format('an HR editor cannot write %s on %s', c.col, c.whose))
FROM (VALUES
  ('invitation_token', $s$invitation_token = 'attackerChosenToken_0123456789'$s$),
  ('invitation_token_expires', $s$invitation_token_expires = now() + interval '1 day'$s$),
  ('invitation_count', $s$invitation_count = 2147483647$s$),
  ('last_invited_at', $s$last_invited_at = now() + interval '50 years'$s$),
  ('invited_at', $s$invited_at = now()$s$),
  ('last_login_at', $s$last_login_at = now()$s$)
) AS v(col, set_clause)
CROSS JOIN (VALUES ('A.crew_hyd', 'another profile'), ('A.master_dra', 'their own row')) AS t(target, whose)
CROSS JOIN LATERAL (SELECT v.col, v.set_clause, t.target, t.whose) AS c
ORDER BY c.whose, c.col;
SELECT tests.reset_role();
SELECT tests.ok((SELECT invitation_token IS NULL AND coalesce(invitation_count, 0) = 0 AND last_login_at IS NULL FROM public.profiles WHERE user_id = tests.user_id('A.crew_hyd')),
                'the bookkeeping of the other profile is unchanged');
-- A signed-in INSERT starts with no token, no sign-in and count 0.
SELECT tests._set_claims(jsonb_build_object('sub', tests.user_id('A.master_dra'), 'role', 'authenticated'));
SELECT tests.throws_like(format($q$INSERT INTO public.profiles (id, email, first_name, last_name, company_id, role, invitation_token, invitation_token_expires) VALUES (%L, 'token-crew@example.test', 'Crew', 'token', %L, 'crew', 'chosenToken_0123456789abcdef', now() + interval '1 day')$q$,
                                tests.id('profile:token_crew'), tests.company_id('A')), '42501', 'profile_access_columns_locked', 'a signed-in INSERT with an invitation token is refused');
SELECT tests.throws_like(format($q$INSERT INTO public.profiles (id, email, first_name, last_name, company_id, role, last_login_at) VALUES (%L, 'login-crew@example.test', 'Crew', 'login', %L, 'crew', now())$q$,
                                tests.id('profile:login_crew'), tests.company_id('A')), '42501', 'profile_access_columns_locked', 'and with a sign-in stamp');
SELECT tests.throws_like(format($q$INSERT INTO public.profiles (id, email, first_name, last_name, company_id, role, invitation_count) VALUES (%L, 'count-crew@example.test', 'Crew', 'count', %L, 'crew', 5)$q$,
                                tests.id('profile:count_crew'), tests.company_id('A')), '42501', 'profile_access_columns_locked', 'and with an invitation count');
SELECT tests.reset_role();
-- The service role (no JWT) and the engine writers still write it.
SELECT tests.as_service();
SELECT tests.lives(format($q$UPDATE public.profiles SET invitation_count = 3, last_invited_at = now() WHERE user_id = %L$q$, tests.user_id('A.colleague')), 'the service role writes the bookkeeping');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.colleague'));
SELECT tests.is(public.record_session_start(), 'active', 'record_session_start (engine) still stamps the sign-in');
SELECT tests.reset_role();
SELECT tests.ok((SELECT last_login_at IS NOT NULL FROM public.profiles WHERE user_id = tests.user_id('A.colleague')), 'and last_login_at is set');

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
SELECT tests.results_eq(
  format($q$SELECT actor_user_id, action_type::text, company_id, before_state ->> 'profile_role', after_state ->> 'profile_role' FROM public.permission_audit_log WHERE target_user_id = %L AND after_state ? 'profile_role'$q$, tests.user_id('A.crew_hyd')),
  format($q$VALUES (%L::uuid, 'role_assigned', %L::uuid, 'crew', 'chief_officer')$q$, tests.user_id('A.fleet_manager'), tests.company_id('A')),
  'the role change wrote one permission_audit_log row (actor, target, old and new role, company)');

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

-- A withdrawn invitee is re-invited, not enabled (review round 2,
-- enable-after-revoke-inconsistent-status): after a sent invitation is
-- revoked, or expires, set_membership_status('active') is refused and
-- changes nothing.
SELECT tests.seed_auth_user('A.withdrawn_rv');
SELECT tests.seed_profile('A', 'A.withdrawn_rv', 'crew', 'not_invited', 'A.withdrawn_rv');
SELECT tests.seed_auth_user('A.withdrawn_ex');
SELECT tests.seed_profile('A', 'A.withdrawn_ex', 'crew', 'not_invited', 'A.withdrawn_ex');
SELECT tests.as_service();
SELECT public.record_invitation_send(tests.profile_id(k), 'sent', NULL, 'msg-w', tests.user_id('A.fleet_manager')) FROM unnest(ARRAY['A.withdrawn_rv', 'A.withdrawn_ex']) AS k;
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT public.revoke_invitation(ui.id) FROM public.user_invitations AS ui WHERE ui.profile_id = tests.profile_id('A.withdrawn_rv');
SELECT tests.reset_role();
UPDATE public.user_invitations SET expires_at = now() - interval '1 minute' WHERE profile_id = tests.profile_id('A.withdrawn_ex');
SELECT tests.as_service();
SELECT tests.ok(public.expire_invitations() >= 1, 'the second invitee''s invitation expires');
SELECT tests.throws_like(format($q$SELECT public.set_membership_status(%L, 'active', %L)$q$, tests.user_id(k), tests.user_id('A.fleet_manager')), '42501', 'invitation_withdrawn',
                         k || ': enabling a withdrawn invitee is refused (re-invite instead)')
FROM unnest(ARRAY['A.withdrawn_rv', 'A.withdrawn_ex']) AS k;
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT p.account_status, m.status, public.user_is_active(p.user_id) FROM public.profiles AS p JOIN public.account_memberships AS m ON m.user_id = p.user_id WHERE p.id IN (%L, %L)$q$,
         tests.profile_id('A.withdrawn_rv'), tests.profile_id('A.withdrawn_ex')),
  $q$VALUES ('not_invited'::text, 'removed'::text, false), ('not_invited'::text, 'removed'::text, false)$q$,
  'both stay not_invited with the membership removed and inactive');
SELECT tests.is((SELECT count(*) FROM public.admin_action_log WHERE action_type = 'TOGGLE_ACCESS' AND target_user_id IN (tests.user_id('A.withdrawn_rv'), tests.user_id('A.withdrawn_ex'))), 0::bigint,
                'and no TOGGLE_ACCESS row was written');

-- The W7 last-manager checks are serialised per company (review round 2,
-- last-manager-guard-race; scripts/db/test/last-manager-race.test.mjs
-- races two sessions): every path that can remove a manager of admins
-- takes lock_company_admin_managers() first.
SELECT tests.ok(position('lock_company_admin_managers(' IN pg_get_functiondef(f::regprocedure)) > 0, f || ' takes lock_company_admin_managers()')
FROM unnest(ARRAY['public.set_membership_status(uuid,text,uuid,text)', 'public.profiles_guard_access_columns()', 'public.hr_anonymize_profile(uuid,text)']) AS f;
SELECT tests.ok(position('pg_advisory_xact_lock' IN pg_get_functiondef('public.lock_company_admin_managers(uuid)'::regprocedure)) > 0, 'lock_company_admin_managers is a transaction-level advisory lock');
SELECT tests.ok(NOT has_function_privilege(r, 'public.lock_company_admin_managers(uuid)', 'EXECUTE'), 'lock_company_admin_managers is not executable by ' || r)
FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r;

-- ------------------------------------------------------------ W7 through a direct profiles UPDATE (no bypass of set_membership_status)

-- A.shore (shore_management, rank 80) is a users-access admin who does not
-- manage admins: the HR policy lets them UPDATE company profiles, the guard
-- does not let them touch access columns or administrators.
SELECT tests.seed_user('A', 'A.shore2', 'shore_management');
SELECT tests.ok(NOT public.user_manages_admins_for(tests.user_id('A.shore'), tests.company_id('A')) AND public.has_capability_for(tests.user_id('A.shore'), 'admin.access.users_access.admin', tests.company_id('A')),
                'A.shore: users-access admin, not a manager of admins');
SELECT tests.as_user(tests.user_id('A.shore'));
SELECT tests.throws_like(format($q$UPDATE public.profiles SET account_status = 'disabled' WHERE user_id = %L$q$, tests.user_id('A.fleet_manager')), '42501', 'profile_access_columns_locked', 'shore management cannot disable the DPA through profiles');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET account_status = 'disabled' WHERE user_id = %L$q$, tests.user_id('A.colleague')), '42501', 'profile_access_columns_locked', 'nor anyone (account_status goes through admin-actions / set_membership_status)');
SELECT tests.throws(format($q$UPDATE public.profiles SET role = 'dpa' WHERE user_id = %L$q$, tests.user_id('A.crew_hyd')), '42501', 'shore management cannot set role dpa on crew');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET role = 'dpa' WHERE user_id = %L$q$, tests.user_id('A.crew_hyd')), '42501', 'manages_admins_required', '(manages_admins_required)');
SELECT tests.throws(format($q$UPDATE public.profiles SET role = 'crew' WHERE user_id = %L$q$, tests.user_id('A.fleet_manager')), '42501', 'shore management cannot demote the DPA');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET role = 'master' WHERE user_id = %L$q$, tests.user_id('A.shore2')), '42501', 'manages_admins_required', 'nor change another administrator''s role');
SELECT tests.throws_like(format($q$SELECT public.hr_anonymize_profile(%L, 'Erasure request')$q$, tests.profile_id('A.fleet_manager')), '42501', 'manages_admins_required', 'hr_anonymize_profile on the DPA by shore management is refused');
SELECT tests.lives(format($q$UPDATE public.profiles SET role = 'chief_engineer' WHERE user_id = %L$q$, tests.user_id('A.crew_hyd')), 'shore management still changes a crew member''s role (rank 50)');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT role::text, account_status FROM public.profiles WHERE user_id = %L$q$, tests.user_id('A.fleet_manager')),
  $q$VALUES ('dpa', 'active')$q$, 'the DPA is untouched');
SELECT tests.is((SELECT role::text FROM public.profiles WHERE user_id = tests.user_id('A.shore2')), 'shore_management', 'the other administrator is untouched');
-- The rank cap: A.colleague (crew profile, rank 10, a users-access admin
-- through a user_roles dpa row of A) cannot give a role ranked above 10.
SELECT tests.as_user(tests.user_id('A.colleague'));
SELECT tests.ok(public.has_capability('admin.access.users_access.admin', tests.company_id('A')), 'A.colleague is a users-access admin (rank 10)');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET role = 'master' WHERE user_id = %L$q$, tests.user_id('A.crew_hyd')), '42501', 'rank_exceeded', 'never a role ranked above your own (master 60 > 10)');
SELECT tests.lives(format($q$UPDATE public.profiles SET role = 'crew' WHERE user_id = %L$q$, tests.user_id('A.crew_hyd')), 'a role at your own rank is fine (crew)');
SELECT tests.reset_role();
-- INSERT of an administrator profile: users-access admin, manager of admins, rank.
SELECT tests._set_claims(jsonb_build_object('sub', tests.user_id('A.shore'), 'role', 'authenticated'));
SELECT tests.throws_like(format($q$INSERT INTO public.profiles (id, email, first_name, last_name, company_id, role) VALUES (%L, 'shore-dpa@example.test', 'DPA', 'by-shore', %L, 'dpa')$q$, tests.id('profile:shore_dpa'), tests.company_id('A')), '42501', 'manages_admins_required', 'shore management cannot create a dpa profile');
SELECT tests.reset_role();
-- The DPA (a manager of admins) changes a shore management user's role; audited.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format($q$UPDATE public.profiles SET role = 'master' WHERE user_id = %L$q$, tests.user_id('A.shore2')), 'the DPA changes a shore management user''s role');
SELECT tests.reset_role();
SELECT tests.is((SELECT role::text FROM public.profiles WHERE user_id = tests.user_id('A.shore2')), 'master', 'it stuck');
SELECT tests.is((SELECT count(*) FROM public.permission_audit_log WHERE target_user_id = tests.user_id('A.shore2') AND actor_user_id = tests.user_id('A.fleet_manager')
                 AND before_state ->> 'profile_role' = 'shore_management' AND after_state ->> 'profile_role' = 'master'), 1::bigint, 'one audit row for it');
-- The DPA anonymises a leaver: the W7 guards pass, the account is disabled under the engine flag, logged.
SELECT tests.seed_user('A', 'A.leaver', 'crew');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format($q$SELECT public.hr_anonymize_profile(%L, '   ')$q$, tests.profile_id('A.leaver')), '22023', 'reason_required', 'anonymising needs a reason');
SELECT tests.lives(format($q$SELECT public.hr_anonymize_profile(%L, 'Erasure request')$q$, tests.profile_id('A.leaver')), 'the DPA anonymises a leaver');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT p.account_status, m.status FROM public.profiles AS p JOIN public.account_memberships AS m ON m.user_id = p.user_id WHERE p.id = %L$q$, tests.profile_id('A.leaver')),
  $q$VALUES ('disabled'::text, 'disabled'::text)$q$, 'the anonymised account is disabled (profile and membership)');
SELECT tests.is((SELECT count(*) FROM public.admin_action_log WHERE action_type = 'TOGGLE_ACCESS' AND target_crew_id = tests.profile_id('A.leaver') AND actor_user_id = tests.user_id('A.fleet_manager')
                 AND reason = 'Erasure request' AND after_json ->> 'via' = 'hr_anonymize_profile'), 1::bigint, 'and logged as TOGGLE_ACCESS with the reason');
SELECT tests.is(current_setting('storm.access_engine', true), '', 'the engine flag is reset after the call');

-- ------------------------------------------------------------ membership window (C17): outside it the user is not active

SELECT tests.seed_user('A', 'A.ext_expired', 'crew');
SELECT tests.seed_user('A', 'A.ext_future', 'crew');
SELECT tests.seed_user('A', 'A.ext_window', 'crew');
UPDATE public.account_memberships SET legacy_managed = false, source = 'admin', kind = 'external', vessel_scope = 'assigned', fleet_access = false,
       valid_from = now() - interval '30 days', valid_until = now() - interval '1 day'
WHERE user_id = tests.user_id('A.ext_expired');
UPDATE public.account_memberships SET legacy_managed = false, source = 'admin', kind = 'external', vessel_scope = 'assigned', fleet_access = false,
       valid_from = now() + interval '1 day', valid_until = now() + interval '30 days'
WHERE user_id = tests.user_id('A.ext_future');
UPDATE public.account_memberships SET legacy_managed = false, source = 'admin', kind = 'external', vessel_scope = 'assigned', fleet_access = false,
       valid_from = now() - interval '1 day', valid_until = now() + interval '7 days'
WHERE user_id = tests.user_id('A.ext_window');
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT id, company_id, tests.vessel_id('A.dra') FROM public.account_memberships WHERE user_id IN (tests.user_id('A.ext_expired'), tests.user_id('A.ext_future'), tests.user_id('A.ext_window'));
DO $$
DECLARE p text;
BEGIN
  FOREACH p IN ARRAY ARRAY['A.ext_expired', 'A.ext_future'] LOOP
    PERFORM tests.as_user(tests.user_id(p));
    PERFORM tests.ok(NOT public.user_is_active(auth.uid()), p || ': user_is_active is false outside the window');
    PERFORM tests.ok(NOT public.user_belongs_to_company(auth.uid(), tests.company_id('A')), p || ': user_belongs_to_company is false');
    PERFORM tests.is_empty('SELECT 1 FROM public.profiles', p || ': reads no profile');
    PERFORM tests.is_empty('SELECT 1 FROM public.companies', p || ': reads no company');
    PERFORM tests.is(public.my_account_status(), 'disabled', p || ': my_account_status() disabled');
    PERFORM tests.is(public.record_session_start(), 'disabled', p || ': record_session_start() disabled');
  END LOOP;
END
$$;
SELECT tests.as_user(tests.user_id('A.ext_window'));
SELECT tests.ok(public.user_is_active(auth.uid()), 'an in-window external user is active');
SELECT tests.ok(public.user_belongs_to_company(auth.uid(), tests.company_id('A')), 'and belongs to the company');
SELECT tests.is(public.my_account_status(), 'active', 'my_account_status() active');
SELECT tests.results_eq('SELECT id FROM public.vessels', format('VALUES (%L::uuid)', tests.vessel_id('A.dra')), 'and reads the assigned vessel');
SELECT tests.reset_role();

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
