-- An invitation past its expiry grants nothing (review round 5,
-- expired-invitation-still-accepted; D-228), with no expiry job run:
-- user_is_active() is false for a still-invited profile whose membership
-- was never accepted and whose newest invitation is live, never accepted
-- and past expires_at; record_session_start() expires such rows itself and
-- withdraws the access they opened, counting only sign-in evidence from
-- before the expiry (this sign-in is already in auth.users.last_sign_in_at)
-- or an accepted membership, and answers 'disabled'. An accepted member
-- whose re-invite expired keeps access; revoke still works on a past-expiry
-- live row; a live, unexpired invitation is accepted as before; a resend
-- works again. Ports scratchpad verify-expired/expired_invite.sql.

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ 1. a sent invitation past its expiry

SELECT tests.seed_profile('A', 'A.late', 'crew', 'not_invited');
SELECT tests.seed_auth_user('A.late', jsonb_build_object('invited_at', now() - interval '20 days', 'email_confirmed_at', NULL));
SELECT tests.as_service();
SELECT tests.ok((public.record_invitation_send(tests.profile_id('A.late'), 'sent', NULL, 'msg-late', tests.user_id('A.fleet_manager'), 'crew', NULL, tests.user_id('A.late'))).id IS NOT NULL,
                'setup: a sent invitation that links the invitee''s login');
SELECT tests.reset_role();
SELECT tests.seed_assignment('A.late', 'A.dra');
UPDATE public.user_invitations SET expires_at = now() - interval '13 days', last_sent_at = now() - interval '20 days' WHERE profile_id = tests.profile_id('A.late');
-- The invitee now obtains a session (a password reset, say): auth records
-- the sign-in before the client calls anything.
UPDATE auth.users SET last_sign_in_at = now() WHERE id = tests.user_id('A.late');
SELECT tests.results_eq(
  format($q$SELECT p.account_status, m.status, m.accepted_at IS NULL, ui.status, ui.expires_at < now()
            FROM public.profiles AS p
            JOIN public.account_memberships AS m ON m.user_id = p.user_id AND m.company_id = p.company_id
            JOIN public.user_invitations AS ui ON ui.profile_id = p.id
            WHERE p.id = %L$q$, tests.profile_id('A.late')),
  $q$VALUES ('invited'::text, 'active'::text, true, 'sent'::text, true)$q$,
  'setup: invited profile, active never-accepted membership, a sent invitation past expires_at');

-- Before sign-in: nothing.
SELECT tests.ok(NOT public.user_is_active(tests.user_id('A.late')), 'before sign-in, user_is_active is false (D-228)');
SELECT tests.ok(public.invitation_withdrawn_for(tests.user_id('A.late')), 'and invitation_withdrawn_for answers true for the invited profile');
SELECT tests.as_user(tests.user_id('A.late'));
SELECT tests.is((SELECT count(*) FROM public.vessels), 0::bigint, '0 vessels are visible with the session');
SELECT tests.is((SELECT count(*) FROM public.crew_assignments), 0::bigint, 'and no crew assignment');
SELECT tests.is(public.my_account_status(), 'disabled', 'my_account_status answers disabled');
SELECT tests.is(public.record_session_start(), 'disabled', 'record_session_start answers disabled');
SELECT tests.is(public.my_account_status(), 'disabled', 'and my_account_status still does after it');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT ui.status, ui.accepted_at IS NULL, p.account_status, m.status
            FROM public.profiles AS p
            JOIN public.account_memberships AS m ON m.user_id = p.user_id AND m.company_id = p.company_id
            JOIN public.user_invitations AS ui ON ui.profile_id = p.id
            WHERE p.id = %L$q$, tests.profile_id('A.late')),
  $q$VALUES ('expired'::text, true, 'not_invited'::text, 'removed'::text)$q$,
  'after the sign-in: the invitation reads expired (not accepted), the profile not_invited, the membership removed');
SELECT tests.ok((SELECT last_login_at IS NULL FROM public.profiles WHERE id = tests.profile_id('A.late')), 'and no sign-in was recorded');
SELECT tests.as_service();
SELECT tests.is(public.expire_invitations(), 0, 'a later expire_invitations() finds nothing left to expire');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 2. an accepted member whose re-invite expired

SELECT tests.seed_user('A', 'A.member');
UPDATE public.account_memberships SET accepted_at = now() - interval '60 days' WHERE user_id = tests.user_id('A.member');
SELECT tests.as_service();
SELECT tests.ok((public.record_invitation_send(tests.profile_id('A.member'), 'sent', NULL, 'msg-member', tests.user_id('A.fleet_manager'), 'crew')).id IS NOT NULL,
                'setup: a re-invite is sent to an accepted member');
SELECT tests.reset_role();
-- The profile reads invited again (as an old flow would leave it); the
-- membership was accepted long ago.
UPDATE public.profiles SET account_status = 'invited' WHERE id = tests.profile_id('A.member');
UPDATE public.user_invitations SET expires_at = now() - interval '2 days' WHERE profile_id = tests.profile_id('A.member');
UPDATE auth.users SET last_sign_in_at = now() WHERE id = tests.user_id('A.member');
SELECT tests.ok(public.user_is_active(tests.user_id('A.member')), 'an accepted member stays active although the re-invite expired');
SELECT tests.as_user(tests.user_id('A.member'));
SELECT tests.is(public.record_session_start(), 'active', 'and signs in');
SELECT tests.is(public.my_account_status(), 'active', 'my_account_status agrees');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT ui.status, p.account_status, m.status
            FROM public.profiles AS p
            JOIN public.account_memberships AS m ON m.user_id = p.user_id AND m.company_id = p.company_id
            JOIN public.user_invitations AS ui ON ui.profile_id = p.id
            WHERE p.id = %L$q$, tests.profile_id('A.member')),
  $q$VALUES ('expired'::text, 'active'::text, 'active'::text)$q$,
  'the re-invite is recorded as expired (never accepted past its expiry); the profile and the membership stay active');

-- ------------------------------------------------------------ 3. revoke on a past-expiry live row

SELECT tests.seed_profile('A', 'A.late2', 'crew', 'not_invited');
SELECT tests.seed_auth_user('A.late2', jsonb_build_object('invited_at', now() - interval '20 days', 'email_confirmed_at', NULL));
SELECT tests.as_service();
SELECT tests.ok((public.record_invitation_send(tests.profile_id('A.late2'), 'sent', NULL, 'msg-late2', tests.user_id('A.fleet_manager'), 'crew', NULL, tests.user_id('A.late2'))).id IS NOT NULL,
                'setup: a second sent invitation');
SELECT tests.reset_role();
UPDATE public.user_invitations SET expires_at = now() - interval '13 days' WHERE profile_id = tests.profile_id('A.late2');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is((public.revoke_invitation((SELECT id FROM public.user_invitations WHERE profile_id = tests.profile_id('A.late2')))).status, 'revoked',
                'revoke_invitation on a past-expiry live row still returns revoked');
SELECT tests.as_user(tests.user_id('A.late2'));
SELECT tests.is(public.record_session_start(), 'disabled', 'and the invitee gets nothing');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 4. a live, unexpired invitation is accepted at sign-in

SELECT tests.seed_profile('A', 'A.fresh', 'crew', 'not_invited');
SELECT tests.seed_auth_user('A.fresh', jsonb_build_object('invited_at', now() - interval '1 day', 'email_confirmed_at', NULL));
SELECT tests.as_service();
SELECT tests.ok((public.record_invitation_send(tests.profile_id('A.fresh'), 'sent', NULL, 'msg-fresh', tests.user_id('A.fleet_manager'), 'crew', NULL, tests.user_id('A.fresh'))).id IS NOT NULL,
                'setup: a fresh invitation (expires in 7 days)');
SELECT tests.reset_role();
UPDATE auth.users SET last_sign_in_at = now() WHERE id = tests.user_id('A.fresh');
SELECT tests.ok(public.user_is_active(tests.user_id('A.fresh')), 'a live, unexpired invitation keeps the invitee active');
SELECT tests.as_user(tests.user_id('A.fresh'));
SELECT tests.is(public.record_session_start(), 'active', 'and the sign-in is accepted');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT ui.status, ui.accepted_at IS NOT NULL, p.account_status, m.accepted_at IS NOT NULL
            FROM public.profiles AS p
            JOIN public.account_memberships AS m ON m.user_id = p.user_id AND m.company_id = p.company_id
            JOIN public.user_invitations AS ui ON ui.profile_id = p.id
            WHERE p.id = %L$q$, tests.profile_id('A.fresh')),
  $q$VALUES ('accepted'::text, true, 'active'::text, true)$q$,
  'the invitation is accepted, the profile active, the membership accepted');

-- ------------------------------------------------------------ 5. resending a past-expiry invitation works again

SELECT tests.seed_profile('A', 'A.resend', 'crew', 'not_invited');
SELECT tests.seed_auth_user('A.resend', jsonb_build_object('invited_at', now() - interval '20 days', 'email_confirmed_at', NULL));
SELECT tests.as_service();
SELECT tests.ok((public.record_invitation_send(tests.profile_id('A.resend'), 'sent', NULL, 'msg-resend-1', tests.user_id('A.fleet_manager'), 'crew', NULL, tests.user_id('A.resend'))).id IS NOT NULL,
                'setup: a first invitation');
SELECT tests.reset_role();
UPDATE public.user_invitations SET expires_at = now() - interval '13 days' WHERE profile_id = tests.profile_id('A.resend');
SELECT tests.ok(NOT public.user_is_active(tests.user_id('A.resend')), 'past its expiry the invitee is not active');
SELECT tests.as_service();
SELECT tests.ok((public.record_invitation_send(tests.profile_id('A.resend'), 'sent', NULL, 'msg-resend-2', tests.user_id('A.fleet_manager'), 'crew', now() + interval '7 days')).expires_at > now(),
                'an admin resends: the live invitation carries a new expiry');
SELECT tests.reset_role();
SELECT tests.ok(public.user_is_active(tests.user_id('A.resend')), 'so the invitee is active again');
SELECT tests.as_user(tests.user_id('A.resend'));
SELECT tests.is(public.record_session_start(), 'active', 'and the sign-in is accepted');
SELECT tests.reset_role();
SELECT tests.is((SELECT status FROM public.user_invitations WHERE profile_id = tests.profile_id('A.resend') ORDER BY created_at DESC, id DESC LIMIT 1), 'accepted',
                'the resent invitation is accepted');

-- ------------------------------------------------------------ the evidence cut-off and its ACL

SELECT tests.ok(to_regprocedure('public.invitation_withdraw_access(uuid,timestamptz)') IS NOT NULL AND to_regprocedure('public.invitation_withdraw_access(uuid)') IS NULL,
                'invitation_withdraw_access takes the evidence cut-off (one overload)');
SELECT tests.ok(NOT has_function_privilege('authenticated', 'public.invitation_withdraw_access(uuid,timestamptz)', 'EXECUTE')
                AND NOT has_function_privilege('service_role', 'public.invitation_withdraw_access(uuid,timestamptz)', 'EXECUTE'),
                'and stays internal (no grant)');
SELECT tests.ok(EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'user_invitations' AND indexname = 'idx_user_invitations_profile_newest'),
                'the newest-invitation lookup has its index');
