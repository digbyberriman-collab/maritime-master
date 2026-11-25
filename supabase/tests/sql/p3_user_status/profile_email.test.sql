-- The address an invitation goes to is an access column (review round 3,
-- profile-email-unguarded; D-121, D-206): profiles_guard_access_columns
-- (20261123010000) treats an email change on a profile with no login, a
-- live invitation or a login without sign-in evidence as an access change:
--   - an administrator target (old or new role dpa / shore_management, or
--     user_is_admin_target): an all-vessels users-access admin
--     (profile_access_columns_locked) who manages admins
--     (manages_admins_required);
--   - anyone else: a users-access admin who may act on the person;
--   - every allowed such change writes one permission_audit_log row
--     (scope_changed, high impact) with the sha256 of the old and new
--     address, never the address.
-- A signed-in person changing their own address is not limited here.
-- Ports scratchpad verify-email/repro.sql and repro2.sql.

SELECT tests.seed_two_tenants();
-- A DPA profile a manager of admins created, not invited yet, no login.
SELECT tests.seed_profile('A', 'A.new_dpa', 'dpa', 'not_invited', NULL);
-- Pending crew waiting for a login on DRAAK and on HYDRA.
SELECT tests.seed_profile('A', 'A.new_crew', 'crew', 'not_invited', NULL, jsonb_build_object('is_imported', true, 'imported_vessel_id', tests.vessel_id('A.dra')));
SELECT tests.seed_profile('A', 'A.pend_hyd', 'crew', 'not_invited', NULL, jsonb_build_object('is_imported', true, 'imported_vessel_id', tests.vessel_id('A.hyd')));
-- A user_roles captain (HR editor), a HYDRA-only admin and an all-vessels admin who does not manage admins.
SELECT tests.seed_user('A', 'A.captain', 'crew');
SELECT tests.seed_user_role('A.captain', 'captain', 'A');
SELECT tests.seed_user('A', 'A.ua_hyd', 'crew');
SELECT tests.seed_user('A', 'A.ua_all', 'crew');
UPDATE public.account_memberships SET legacy_managed = false, source = 'admin', kind = 'admin', users_access_level = 'write'
WHERE user_id IN (tests.user_id('A.ua_hyd'), tests.user_id('A.ua_all'));
UPDATE public.account_memberships SET vessel_scope = 'all' WHERE user_id = tests.user_id('A.ua_all');
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT id, company_id, tests.vessel_id('A.hyd') FROM public.account_memberships WHERE user_id = tests.user_id('A.ua_hyd');
SELECT tests.seed_user_role(k, 'purser', 'A') FROM unnest(ARRAY['A.ua_hyd', 'A.ua_all']) AS k;
-- A signed-in crew member (auth records the sign-in) and an invitee who has not signed in yet.
SELECT tests.seed_auth_user('A.signed_in', jsonb_build_object('last_sign_in_at', now() - interval '3 days'));
SELECT tests.seed_profile('A', 'A.signed_in', 'crew', 'active', 'A.signed_in');
SELECT tests.seed_user('A', 'A.not_yet', 'crew', 'invited');

SELECT tests.ok(public.hr_can_edit(tests.user_id(k)), k || ': an HR editor (setup)')
FROM unnest(ARRAY['A.master_dra', 'A.captain', 'A.ua_hyd', 'A.ua_all']) AS k;

-- ------------------------------------------------------------ repro: HR editors cannot re-point an invitation

SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(format($q$UPDATE public.profiles SET email = 'master-second-mailbox@example.test' WHERE id = %L$q$, tests.profile_id('A.new_dpa')),
                         '42501', 'profile_access_columns_locked', 'the legacy Master cannot re-point the DPA profile''s address');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET email = 'master-third-mailbox@example.test' WHERE id = %L$q$, tests.profile_id('A.new_crew')),
                         '42501', 'profile_access_columns_locked', 'nor a pending crew member''s on their own vessel');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET email = 'master-fourth-mailbox@example.test' WHERE id = %L$q$, tests.profile_id('A.not_yet')),
                         '42501', 'profile_access_columns_locked', 'nor an invitee''s who has not signed in yet');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.captain'));
SELECT tests.throws_like(format($q$UPDATE public.profiles SET email = 'captain-mailbox@example.test' WHERE id = %L$q$, tests.profile_id('A.new_dpa')),
                         '42501', 'profile_access_columns_locked', 'a user_roles captain cannot either');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.ua_hyd'));
SELECT tests.throws_like(format($q$UPDATE public.profiles SET email = 'hyd-admin-mailbox@example.test' WHERE id = %L$q$, tests.profile_id('A.new_dpa')),
                         '42501', 'profile_access_columns_locked', 'a HYDRA-only admin cannot change a DPA target''s address');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET email = 'hyd-admin-mailbox@example.test' WHERE id = %L$q$, tests.profile_id('A.new_crew')),
                         '42501', 'profile_access_columns_locked', 'nor a DRAAK pending crew member''s');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.ua_all'));
SELECT tests.throws_like(format($q$UPDATE public.profiles SET email = 'all-admin-mailbox@example.test' WHERE id = %L$q$, tests.profile_id('A.new_dpa')),
                         '42501', 'manages_admins_required', 'an all-vessels admin who does not manage admins: manages_admins_required');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET email = 'all-admin-mailbox@example.test', role = 'shore_management' WHERE id = %L$q$, tests.profile_id('A.pend_hyd')),
                         '42501', 'manages_admins_required', 'a new administrator role counts as an administrator target');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT id, email FROM public.profiles WHERE id IN (%L, %L, %L)$q$, tests.profile_id('A.new_dpa'), tests.profile_id('A.new_crew'), tests.profile_id('A.not_yet')),
  format($q$VALUES (%L::uuid, %L::text), (%L::uuid, %L::text), (%L::uuid, %L::text)$q$,
         tests.profile_id('A.new_dpa'), tests.email('A.new_dpa'), tests.profile_id('A.new_crew'), tests.email('A.new_crew'), tests.profile_id('A.not_yet'), tests.email('A.not_yet')),
  'every address is unchanged');
SELECT tests.is((SELECT count(*) FROM public.permission_audit_log WHERE action_type = 'scope_changed'), 0::bigint, 'and nothing was audited');
-- The rest of the repro: the login the second mailbox would get is never adopted.
SELECT tests.seed_auth_user('X.master_second', jsonb_build_object('email', 'master-second-mailbox@example.test', 'invited_at', now(), 'email_confirmed_at', NULL));
SELECT tests.as_service();
SELECT tests.throws_like(format($q$SELECT public.record_invitation_send(%L, 'sent', NULL, NULL, %L, 'admin', NULL, %L)$q$, tests.profile_id('A.new_dpa'), tests.user_id('A.fleet_manager'), tests.user_id('X.master_second')),
                         '42501', 'login_email_mismatch', 'the second mailbox''s login is not the DPA profile''s address (D-205)');
SELECT tests.reset_role();
SELECT tests.ok(NOT public.user_manages_admins_for(tests.user_id('X.master_second'), tests.company_id('A')), 'and it is no manager of admins');

-- ------------------------------------------------------------ the rightful changes, audited

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format($q$UPDATE public.profiles SET email = 'dpa-corrected@example.test' WHERE id = %L$q$, tests.profile_id('A.new_dpa')),
                   'the fleet manager (an all-vessels admin who manages admins) corrects the DPA profile''s address');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT actor_user_id, action_type::text, is_high_impact, company_id, target_user_id,
                   before_state ->> 'profile_id', before_state ->> 'field', before_state ->> 'email_sha256',
                   after_state ->> 'field', after_state ->> 'email_sha256', after_state ->> 'via'
            FROM public.permission_audit_log WHERE action_type = 'scope_changed' AND before_state ->> 'profile_id' = %L$q$, tests.profile_id('A.new_dpa')),
  format($q$VALUES (%L::uuid, 'scope_changed'::text, true, %L::uuid, NULL::uuid, %L::text, 'email'::text, %L::text, 'email'::text, %L::text, 'profiles'::text)$q$,
         tests.user_id('A.fleet_manager'), tests.company_id('A'), tests.profile_id('A.new_dpa'),
         encode(sha256(convert_to(tests.email('A.new_dpa'), 'UTF8')), 'hex'), encode(sha256(convert_to('dpa-corrected@example.test', 'UTF8')), 'hex')),
  'exactly one audit row: actor, high impact, company, the profile, the hashes of the old and new address');
SELECT tests.is_empty($q$SELECT 1 FROM public.permission_audit_log WHERE action_type = 'scope_changed' AND (before_state::text LIKE '%@%' OR after_state::text LIKE '%@%')$q$,
                      'no address is in the audit row');
SELECT tests.as_user(tests.user_id('A.ua_hyd'));
SELECT tests.lives(format($q$UPDATE public.profiles SET email = 'hydra-pending-corrected@example.test' WHERE id = %L$q$, tests.profile_id('A.pend_hyd')),
                   'the HYDRA admin corrects a HYDRA pending crew member''s address');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.permission_audit_log WHERE action_type = 'scope_changed' AND before_state ->> 'profile_id' = tests.profile_id('A.pend_hyd')::text AND actor_user_id = tests.user_id('A.ua_hyd')),
                1::bigint, 'and that change is audited too');
-- A live invitation makes a signed-in login's address an access column too.
SELECT tests.as_service();
SELECT public.record_invitation_send(tests.profile_id('A.signed_in'), 'sent', NULL, NULL, tests.user_id('A.fleet_manager'));
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.signed_in'));
SELECT tests.throws_like(format($q$UPDATE public.profiles SET email = 'crew-new-address@example.test' WHERE id = %L$q$, tests.profile_id('A.signed_in')),
                         '42501', 'profile_access_columns_locked', 'with a live invitation, even your own address waits for an admin');
SELECT tests.reset_role();
UPDATE public.user_invitations SET status = 'accepted', accepted_at = now() WHERE profile_id = tests.profile_id('A.signed_in');
-- A signed-in person's own address change (no live invitation) is not limited.
SELECT tests.as_user(tests.user_id('A.signed_in'));
SELECT tests.lives(format($q$UPDATE public.profiles SET email = 'crew-new-address@example.test' WHERE id = %L$q$, tests.profile_id('A.signed_in')),
                   'a signed-in user changes their own profile address');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.permission_audit_log WHERE action_type = 'scope_changed' AND before_state ->> 'profile_id' = tests.profile_id('A.signed_in')::text), 0::bigint,
                'and that is not audited as an access change');
-- The service role and the engine flag are not limited.
SELECT tests.as_service();
SELECT tests.lives(format($q$UPDATE public.profiles SET email = 'service-set@example.test' WHERE id = %L$q$, tests.profile_id('A.new_crew')), 'the service role changes an address');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT set_config('storm.access_engine', 'on', true);
SELECT tests.lives(format($q$UPDATE public.profiles SET email = 'engine-set@example.test' WHERE id = %L$q$, tests.profile_id('A.new_crew')), 'storm.access_engine lets an engine definer change it');
SELECT set_config('storm.access_engine', '', true);
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.permission_audit_log WHERE action_type = 'scope_changed' AND before_state ->> 'profile_id' = tests.profile_id('A.new_crew')::text), 0::bigint,
                'neither writes an access audit row (they are not session changes)');
