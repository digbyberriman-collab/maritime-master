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
-- Review round 6: the cut-off applies to every withdrawal (D-235: the
-- daily sweep and Revoke after a late sign-in; verify-withdraw/repro.sql),
-- and a sent invitation stamps 'invited' unless the person has joined
-- (D-236: a profile left at the 'active' column default;
-- verify-active-expired/probe.sql).

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

-- ------------------------------------------------------------ 6. the cut-off applies to every withdrawal (D-235; review round 6)

-- expire_invitations() (run daily by hr-daily-sweeper) and revoke_invitation()
-- called invitation_withdraw_access() without the cut-off, so a sign-in made
-- after the expiry (a password-reset session that never called
-- record_session_start) kept the membership and turned user_is_active back
-- to true. invitation_withdraw_access() now applies the invitation's own
-- expiry itself. Ports scratchpad verify-withdraw/repro.sql.

-- (a) a sign-in after the expiry, then the daily sweep
SELECT tests.seed_profile('A', 'A.sweep', 'crew', 'not_invited');
SELECT tests.seed_auth_user('A.sweep', jsonb_build_object('invited_at', now() - interval '20 days', 'email_confirmed_at', NULL));
SELECT tests.as_service();
SELECT tests.ok((public.record_invitation_send(tests.profile_id('A.sweep'), 'sent', NULL, 'msg-sweep', tests.user_id('A.fleet_manager'), 'crew', NULL, tests.user_id('A.sweep'))).id IS NOT NULL,
                '(a) setup: a sent invitation that links the login');
SELECT tests.reset_role();
SELECT tests.seed_assignment('A.sweep', 'A.dra');
UPDATE public.user_invitations SET expires_at = now() - interval '13 days', last_sent_at = now() - interval '20 days' WHERE profile_id = tests.profile_id('A.sweep');
UPDATE auth.users SET last_sign_in_at = now() WHERE id = tests.user_id('A.sweep');
SELECT tests.ok(NOT public.user_is_active(tests.user_id('A.sweep')), '(a) before the sweep the late signer is not active');
SELECT tests.as_service();
SELECT tests.is(public.expire_invitations(), 1, '(a) the sweep expires the invitation');
SELECT tests.reset_role();
SELECT tests.is(public.user_is_active(tests.user_id('A.sweep')), false, '(a) after the sweep user_is_active stays false');
SELECT tests.results_eq(
  format($q$SELECT ui.status, p.account_status, m.status
            FROM public.profiles AS p
            JOIN public.account_memberships AS m ON m.user_id = p.user_id AND m.company_id = p.company_id
            JOIN public.user_invitations AS ui ON ui.profile_id = p.id
            WHERE p.id = %L$q$, tests.profile_id('A.sweep')),
  $q$VALUES ('expired'::text, 'not_invited'::text, 'removed'::text)$q$,
  '(a) the invitation is expired, the profile not_invited, the legacy membership removed');
SELECT tests.as_user(tests.user_id('A.sweep'));
SELECT tests.is((SELECT count(*) FROM public.vessels), 0::bigint, '(a) the late signer sees no vessel');
SELECT tests.is(public.record_session_start(), 'disabled', '(a) and record_session_start answers disabled');
SELECT tests.reset_role();

-- (b) a sign-in after the expiry, then an admin's Revoke on the past-expiry live row
SELECT tests.seed_profile('A', 'A.revoke_late', 'crew', 'not_invited');
SELECT tests.seed_auth_user('A.revoke_late', jsonb_build_object('invited_at', now() - interval '20 days', 'email_confirmed_at', NULL));
SELECT tests.as_service();
SELECT tests.ok((public.record_invitation_send(tests.profile_id('A.revoke_late'), 'sent', NULL, 'msg-revoke-late', tests.user_id('A.fleet_manager'), 'crew', NULL, tests.user_id('A.revoke_late'))).id IS NOT NULL,
                '(b) setup: a sent invitation that links the login');
SELECT tests.reset_role();
SELECT tests.seed_assignment('A.revoke_late', 'A.dra');
UPDATE public.user_invitations SET expires_at = now() - interval '13 days', last_sent_at = now() - interval '20 days' WHERE profile_id = tests.profile_id('A.revoke_late');
UPDATE auth.users SET last_sign_in_at = now() WHERE id = tests.user_id('A.revoke_late');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is((public.revoke_invitation((SELECT id FROM public.user_invitations WHERE profile_id = tests.profile_id('A.revoke_late')))).status, 'revoked',
                '(b) the admin revokes the past-expiry live row');
SELECT tests.reset_role();
SELECT tests.is(public.user_is_active(tests.user_id('A.revoke_late')), false, '(b) user_is_active stays false');
SELECT tests.results_eq(
  format($q$SELECT ui.status, p.account_status, m.status
            FROM public.profiles AS p
            JOIN public.account_memberships AS m ON m.user_id = p.user_id AND m.company_id = p.company_id
            JOIN public.user_invitations AS ui ON ui.profile_id = p.id
            WHERE p.id = %L$q$, tests.profile_id('A.revoke_late')),
  $q$VALUES ('revoked'::text, 'not_invited'::text, 'removed'::text)$q$,
  '(b) the invitation is revoked, the profile not_invited, the legacy membership removed');
SELECT tests.as_user(tests.user_id('A.revoke_late'));
SELECT tests.is(public.record_session_start(), 'disabled', '(b) record_session_start answers disabled');
SELECT tests.reset_role();

-- (c) controls: a sign-in before the expiry survives the sweep; revoking an
-- unexpired live invitation after a sign-in keeps the access (gap/01 W2 row 8).
SELECT tests.seed_profile('A', 'A.early', 'crew', 'not_invited');
SELECT tests.seed_auth_user('A.early', jsonb_build_object('invited_at', now() - interval '20 days', 'email_confirmed_at', NULL));
SELECT tests.as_service();
SELECT tests.ok((public.record_invitation_send(tests.profile_id('A.early'), 'sent', NULL, 'msg-early', tests.user_id('A.fleet_manager'), 'crew', NULL, tests.user_id('A.early'))).id IS NOT NULL,
                '(c) setup: a sent invitation that links the login');
SELECT tests.reset_role();
UPDATE public.user_invitations SET expires_at = now() - interval '13 days' WHERE profile_id = tests.profile_id('A.early');
UPDATE auth.users SET last_sign_in_at = now() - interval '15 days' WHERE id = tests.user_id('A.early');
SELECT tests.as_service();
SELECT tests.is(public.expire_invitations(), 1, '(c) the sweep expires the early signer''s invitation');
SELECT tests.reset_role();
SELECT tests.is(public.user_is_active(tests.user_id('A.early')), true, '(c) a sign-in from before the expiry keeps the access');
SELECT tests.is((SELECT m.status FROM public.account_memberships AS m WHERE m.user_id = tests.user_id('A.early')), 'active', '(c) and the membership');

SELECT tests.seed_profile('A', 'A.revoke_live', 'crew', 'not_invited');
SELECT tests.seed_auth_user('A.revoke_live', jsonb_build_object('invited_at', now() - interval '1 day', 'email_confirmed_at', NULL));
SELECT tests.as_service();
SELECT tests.ok((public.record_invitation_send(tests.profile_id('A.revoke_live'), 'sent', NULL, 'msg-revoke-live', tests.user_id('A.fleet_manager'), 'crew', NULL, tests.user_id('A.revoke_live'))).id IS NOT NULL,
                '(c) setup: a fresh invitation that links the login');
SELECT tests.reset_role();
UPDATE auth.users SET last_sign_in_at = now() WHERE id = tests.user_id('A.revoke_live');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is((public.revoke_invitation((SELECT id FROM public.user_invitations WHERE profile_id = tests.profile_id('A.revoke_live')))).status, 'revoked',
                '(c) the admin revokes the unexpired live invitation after the sign-in');
SELECT tests.reset_role();
SELECT tests.is(public.user_is_active(tests.user_id('A.revoke_live')), true, '(c) the signed-in invitee keeps the access (W2 row 8)');
SELECT tests.is((SELECT m.status FROM public.account_memberships AS m WHERE m.user_id = tests.user_id('A.revoke_live')), 'active', '(c) and the membership');

-- ------------------------------------------------------------ 7. a profile at the column default reads active (D-236; review round 6)

-- profiles.account_status defaults to 'active', so an importer- or
-- webhook-created profile reads active without ever signing in; the sent
-- invitation kept it active and D-228 (scoped to a profile still invited)
-- never applied. A sent invitation now stamps 'invited' unless the person
-- has joined. Ports scratchpad verify-active-expired/probe.sql.
DO $$
DECLARE v_saved jsonb := tests._suspend_claims();
BEGIN
  INSERT INTO public.profiles (id, user_id, email, first_name, last_name, company_id, role)
  VALUES (tests.profile_id('A.dflt'), NULL, tests.email('A.dflt'), 'Crew', 'A.dflt', tests.company_id('A'), 'crew'),
         (tests.profile_id('A.dflt2'), NULL, tests.email('A.dflt2'), 'Crew', 'A.dflt2', tests.company_id('A'), 'crew');
  PERFORM tests._restore_claims(v_saved);
END
$$;
SELECT tests.seed_auth_user(k, jsonb_build_object('invited_at', now() - interval '20 days', 'email_confirmed_at', NULL)) FROM unnest(ARRAY['A.dflt', 'A.dflt2']) AS k;
SELECT tests.is((SELECT string_agg(account_status, ',') FROM public.profiles WHERE id IN (tests.profile_id('A.dflt'), tests.profile_id('A.dflt2'))), 'active,active',
                'setup: two profiles inserted without account_status read active');
SELECT tests.as_service();
SELECT tests.ok((public.record_invitation_send(tests.profile_id(k), 'sent', NULL, 'msg-' || k, tests.user_id('A.fleet_manager'), 'crew', NULL, tests.user_id(k))).id IS NOT NULL,
                'setup: ' || k || ' is invited and its login linked')
FROM unnest(ARRAY['A.dflt', 'A.dflt2']) AS k;
SELECT tests.reset_role();
SELECT tests.is((SELECT account_status FROM public.profiles WHERE id = tests.profile_id('A.dflt')), 'invited', 'the sent invitation stamps invited: the person never joined (D-236)');
SELECT tests.seed_assignment(k, 'A.dra') FROM unnest(ARRAY['A.dflt', 'A.dflt2']) AS k;
UPDATE public.user_invitations SET expires_at = now() - interval '13 days', last_sent_at = now() - interval '20 days'
 WHERE profile_id IN (tests.profile_id('A.dflt'), tests.profile_id('A.dflt2'));

-- A.dflt signs in now.
UPDATE auth.users SET last_sign_in_at = now() WHERE id = tests.user_id('A.dflt');
SELECT tests.is(public.user_is_active(tests.user_id('A.dflt')), false, 'default-active invitee past its expiry: user_is_active is false');
SELECT tests.as_user(tests.user_id('A.dflt'));
SELECT tests.is((SELECT count(*) FROM public.vessels), 0::bigint, 'and sees no vessel');
SELECT tests.is(public.record_session_start(), 'disabled', 'record_session_start answers disabled');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT ui.status, p.account_status, m.status, p.last_login_at IS NULL
            FROM public.profiles AS p
            JOIN public.account_memberships AS m ON m.user_id = p.user_id AND m.company_id = p.company_id
            JOIN public.user_invitations AS ui ON ui.profile_id = p.id
            WHERE p.id = %L$q$, tests.profile_id('A.dflt')),
  $q$VALUES ('expired'::text, 'not_invited'::text, 'removed'::text, true)$q$,
  'the invitation expired, the profile not_invited, the membership removed, no sign-in recorded');

-- A.dflt2: the daily sweep alone withdraws it.
SELECT tests.as_service();
SELECT tests.is(public.expire_invitations(), 1, 'the sweep expires the second default-active invitation');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT ui.status, p.account_status, m.status
            FROM public.profiles AS p
            JOIN public.account_memberships AS m ON m.user_id = p.user_id AND m.company_id = p.company_id
            JOIN public.user_invitations AS ui ON ui.profile_id = p.id
            WHERE p.id = %L$q$, tests.profile_id('A.dflt2')),
  $q$VALUES ('expired'::text, 'not_invited'::text, 'removed'::text)$q$,
  'expire_invitations() alone withdraws it: not_invited, membership removed');
UPDATE auth.users SET last_sign_in_at = now() WHERE id = tests.user_id('A.dflt2');
SELECT tests.is(public.user_is_active(tests.user_id('A.dflt2')), false, 'a later sign-in finds nothing');
SELECT tests.as_user(tests.user_id('A.dflt2'));
SELECT tests.is(public.record_session_start(), 'disabled', 'and record_session_start answers disabled');
SELECT tests.reset_role();

-- Joined people stay active on a re-send: a sign-in on the profile, a
-- sign-in on the login, or an accepted membership.
SELECT tests.seed_user('A', 'A.joined_profile');
SELECT tests.seed_user('A', 'A.joined_login');
SELECT tests.seed_user('A', 'A.joined_member');
UPDATE public.profiles SET last_login_at = now() - interval '30 days' WHERE id = tests.profile_id('A.joined_profile');
UPDATE auth.users SET last_sign_in_at = now() - interval '30 days' WHERE id = tests.user_id('A.joined_login');
UPDATE public.account_memberships SET accepted_at = now() - interval '30 days' WHERE user_id = tests.user_id('A.joined_member');
SELECT tests.as_service();
SELECT tests.ok((public.record_invitation_send(tests.profile_id(k), 'sent', NULL, 'msg-' || k, tests.user_id('A.fleet_manager'), 'crew')).id IS NOT NULL, 'setup: a re-send to ' || k)
FROM unnest(ARRAY['A.joined_profile', 'A.joined_login', 'A.joined_member']) AS k;
SELECT tests.reset_role();
SELECT tests.is((SELECT account_status FROM public.profiles WHERE id = tests.profile_id(k)), 'active', k || ' stays active on a re-send (D-236)')
FROM unnest(ARRAY['A.joined_profile', 'A.joined_login', 'A.joined_member']) AS k;
-- A disabled profile keeps its status.
SELECT tests.seed_profile('A', 'A.off_invitee', 'crew', 'disabled');
SELECT tests.as_service();
SELECT tests.ok((public.record_invitation_send(tests.profile_id('A.off_invitee'), 'send_failed', 'smtp_down', NULL, tests.user_id('A.fleet_manager'), 'crew')).id IS NOT NULL,
                'setup: a failed send to a disabled profile');
SELECT tests.reset_role();
SELECT tests.is((SELECT account_status FROM public.profiles WHERE id = tests.profile_id('A.off_invitee')), 'disabled', 'a disabled profile is never stamped invited');
