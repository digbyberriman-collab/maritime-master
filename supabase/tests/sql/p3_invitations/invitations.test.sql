-- Honest invitations (spec §A.9; D-121, D-146): send_failed never stamps
-- the profile invited, sent does; one live row per profile; attempt numbers
-- are reserved before a send (reserve_invitation_attempt: cooldowns,
-- monotonic across revoke and re-invite) and never counted twice; a
-- provider duplicate never downgrades a sent row; inviter and login checks;
-- revoke needs users-access admin; revoke and expiry withdraw the access a
-- never-accepted invitation opened, a re-invite restores it; company
-- isolation; ACLs; expire_invitations; record_session_start() accepts the
-- caller's live invitation by user id and by profile (D2 followup); the
-- legacy backfill (pending + legacy_unverified, accepted after a sign-in by
-- either profiles.last_login_at or auth last_sign_in_at), idempotent.

SELECT tests.seed_two_tenants();
SELECT tests.seed_profile('A', 'A.newbie', 'crew', 'not_invited');       -- imported crew, no login yet
SELECT tests.seed_auth_user('A.newbie');                                  -- the login generateLink created
SELECT tests.seed_profile('A', 'A.imported', 'crew', 'not_invited');
SELECT tests.seed_user('A', 'A.active_crew', 'crew', 'active');

-- ------------------------------------------------------------ record_invitation_send

SELECT tests.as_service();
SELECT tests.throws_like(format($q$SELECT public.record_invitation_send(%L, 'send_failed', NULL)$q$, tests.profile_id('A.newbie')), '22023', 'error_code_invalid', 'send_failed needs an error code');
SELECT tests.throws_like(format($q$SELECT public.record_invitation_send(%L, 'send_failed', 'Provider said: bounced for crew@example.test')$q$, tests.profile_id('A.newbie')), '22023', 'error_code_invalid', 'provider text is not a code');
SELECT tests.throws_like(format($q$SELECT public.record_invitation_send(%L, 'delivered')$q$, tests.profile_id('A.newbie')), '22023', 'outcome_invalid', 'only sent / send_failed');
SELECT tests.throws_like(format($q$SELECT public.record_invitation_send(%L, 'sent', NULL, NULL, NULL, 'captain')$q$, tests.profile_id('A.newbie')), '22023', 'kind_invalid', 'kind from the membership vocabulary');
SELECT tests.throws_like(format($q$SELECT public.record_invitation_send(%L, 'sent')$q$, tests.id('profile:nobody')), 'P0002', 'profile_not_found', 'unknown profile');
SELECT tests.throws_like(format($q$SELECT public.record_invitation_send(%L, 'sent', NULL, NULL, %L)$q$, tests.profile_id('A.newbie'), tests.user_id('B.admin')), '42501', 'inviter_not_member', 'an inviter of another company is refused');
SELECT tests.throws_like(format($q$SELECT public.record_invitation_send(%L, 'sent', NULL, NULL, %L)$q$, tests.profile_id('A.newbie'), tests.user_id('A.disabled')), '42501', 'inviter_not_member', 'a disabled inviter is refused');
SELECT tests.throws_like(format($q$SELECT public.record_invitation_send(%L, 'sent', NULL, NULL, NULL, 'crew', NULL, %L)$q$, tests.profile_id('A.newbie'), tests.user_id('A.crew_hyd')), '23505', 'user_linked_elsewhere', 'a login that belongs to another profile is refused');

-- A failed send: recorded, the profile is NOT stamped invited.
SELECT tests.lives(format($q$SELECT public.record_invitation_send(%L, 'send_failed', 'provider_rejected', NULL, %L, 'crew', NULL, %L)$q$,
  tests.profile_id('A.newbie'), tests.user_id('A.fleet_manager'), tests.user_id('A.newbie')), 'a failed send is recorded');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT status, send_attempts, last_error_code, last_sent_at IS NULL, last_attempt_at IS NOT NULL, invited_by, user_id FROM public.user_invitations WHERE profile_id = %L$q$, tests.profile_id('A.newbie')),
  format($q$VALUES ('send_failed'::text, 1, 'provider_rejected'::text, true, true, %L::uuid, %L::uuid)$q$, tests.user_id('A.fleet_manager'), tests.user_id('A.newbie')),
  'send_failed row: attempts 1, the code, no last_sent_at');
SELECT tests.results_eq(
  format($q$SELECT account_status, coalesce(invitation_count, 0), last_invited_at IS NULL, invited_at IS NULL, user_id FROM public.profiles WHERE id = %L$q$, tests.profile_id('A.newbie')),
  format($q$VALUES ('not_invited'::text, 0, true, true, %L::uuid)$q$, tests.user_id('A.newbie')),
  'send_failed never stamps the profile invited (only the login is linked)');
SELECT tests.is(current_setting('storm.access_engine', true), '', 'the engine flag is reset');

-- The resend works: the same live row, attempt 2 (reserved 30 s after the
-- failed attempt), the profile is invited.
SELECT tests.as_service();
SELECT tests.is(public.reserve_invitation_attempt(tests.profile_id('A.newbie')) ->> 'code', 'cooldown', 'a retry within 30 s of a failed attempt is a cooldown');
SELECT tests.ok((public.reserve_invitation_attempt(tests.profile_id('A.newbie')) ->> 'retry_after_seconds')::integer BETWEEN 1 AND 30, 'the wait after a failed attempt is at most 30 s');
SELECT tests.reset_role();
UPDATE public.user_invitations SET last_attempt_at = now() - interval '31 seconds' WHERE profile_id = tests.profile_id('A.newbie');
SELECT tests.as_service();
SELECT public.reserve_invitation_attempt(tests.profile_id('A.newbie')) AS newbie_reservation \gset
SELECT tests.is(:'newbie_reservation'::jsonb,
                jsonb_build_object('ok', true, 'attempt', 2, 'invitation_id', (SELECT id FROM public.user_invitations WHERE profile_id = tests.profile_id('A.newbie'))),
                'after 30 s the retry is reserved: attempt 2 on the live row');
SELECT tests.lives(format($q$SELECT public.record_invitation_send(%L, 'sent', NULL, 'msg-0001', %L)$q$, tests.profile_id('A.newbie'), tests.user_id('A.fleet_manager')), 'a successful resend is recorded');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT status, send_attempts, last_error_code IS NULL, last_sent_at IS NOT NULL, provider_message_id, expires_at > now() + interval '6 days' FROM public.user_invitations WHERE profile_id = %L$q$, tests.profile_id('A.newbie')),
  $q$VALUES ('sent'::text, 2, true, true, 'msg-0001'::text, true)$q$,
  'sent row: attempt 2 (recorded, not counted again), no error code, last_sent_at, provider id, expires in 7 days');
SELECT tests.results_eq(
  format($q$SELECT account_status, invitation_count, last_invited_at IS NOT NULL, invited_at IS NOT NULL FROM public.profiles WHERE id = %L$q$, tests.profile_id('A.newbie')),
  $q$VALUES ('invited'::text, 1, true, true)$q$,
  'sent stamps the profile invited, counts it, dates it');
SELECT tests.ok((SELECT membership_id IS NOT NULL FROM public.user_invitations WHERE profile_id = tests.profile_id('A.newbie')), 'the invitation points at the synced membership');
-- A provider duplicate (the same key twice) never downgrades a sent row.
SELECT tests.as_service();
SELECT tests.lives(format($q$SELECT public.record_invitation_send(%L, 'send_failed', 'provider_duplicate')$q$, tests.profile_id('A.newbie')), 'a provider_duplicate outcome is recorded');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT status, send_attempts, last_error_code IS NULL, last_sent_at IS NOT NULL, provider_message_id FROM public.user_invitations WHERE profile_id = %L$q$, tests.profile_id('A.newbie')),
  $q$VALUES ('sent'::text, 2, true, true, 'msg-0001'::text)$q$,
  'provider_duplicate on a sent row keeps it sent (status, last_sent_at, message id, no error code)');
SELECT tests.as_service();
SELECT tests.is(public.reserve_invitation_attempt(tests.profile_id('A.newbie')) ->> 'code', 'cooldown', 'within 5 minutes of a send the next attempt is a cooldown');
SELECT tests.ok((public.reserve_invitation_attempt(tests.profile_id('A.newbie')) ->> 'retry_after_seconds')::integer BETWEEN 270 AND 300, 'the wait after a send is about 5 minutes');
SELECT tests.reset_role();
UPDATE public.user_invitations SET last_sent_at = now() - interval '6 minutes', last_attempt_at = now() - interval '6 minutes' WHERE profile_id = tests.profile_id('A.newbie');
SELECT tests.as_service();
SELECT tests.is(public.reserve_invitation_attempt(tests.profile_id('A.newbie')) ->> 'attempt', '3', 'attempt 3 is reserved after the cooldown');
SELECT tests.lives(format($q$SELECT public.record_invitation_send(%L, 'send_failed', 'provider_unavailable')$q$, tests.profile_id('A.newbie')), 'a later failed resend');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT status, send_attempts, last_error_code, last_sent_at IS NOT NULL, provider_message_id IS NULL FROM public.user_invitations WHERE profile_id = %L$q$, tests.profile_id('A.newbie')),
  $q$VALUES ('send_failed'::text, 3, 'provider_unavailable'::text, true, true)$q$,
  'attempt 3: send_failed again, the last successful send date is kept');
SELECT tests.is((SELECT account_status FROM public.profiles WHERE id = tests.profile_id('A.newbie')), 'invited', 'a failed resend does not undo the earlier successful one');
SELECT tests.is((SELECT count(*) FROM public.user_invitations WHERE profile_id = tests.profile_id('A.newbie')), 1::bigint, 'one row per profile while it is live');
SELECT tests.throws(format($q$INSERT INTO public.user_invitations (company_id, profile_id, status) VALUES (%L, %L, 'pending')$q$, tests.company_id('A'), tests.profile_id('A.newbie')), '23505', 'a second live row is impossible (user_invitations_live_key)');

-- An active user re-invited stays active.
SELECT tests.as_service();
SELECT tests.lives(format($q$SELECT public.record_invitation_send(%L, 'sent')$q$, tests.profile_id('A.active_crew')), 'sent to an active user');
SELECT tests.reset_role();
SELECT tests.is((SELECT account_status FROM public.profiles WHERE id = tests.profile_id('A.active_crew')), 'active', 'an active profile is never set back to invited');

-- ------------------------------------------------------------ reserve_invitation_attempt (D-146)

SELECT tests.seed_profile('A', 'A.reserve', 'crew', 'not_invited', NULL, jsonb_build_object('invitation_count', 2));
SELECT tests.as_service();
SELECT tests.is(public.reserve_invitation_attempt(tests.id('profile:nobody')), '{"ok": false, "code": "not_found"}'::jsonb, 'unknown profile: not_found');
SELECT tests.is(public.reserve_invitation_attempt(tests.profile_id('A.disabled')), '{"ok": false, "code": "disabled"}'::jsonb, 'disabled profile: disabled');
SELECT tests.throws_like(format($q$SELECT public.reserve_invitation_attempt(%L, NULL, 'captain')$q$, tests.profile_id('A.reserve')), '22023', 'kind_invalid', 'kind from the membership vocabulary');
SELECT tests.is(public.reserve_invitation_attempt(tests.profile_id('A.reserve'), tests.user_id('B.admin')) ->> 'attempt', '3', 'the first reservation creates the live row; attempt = invitation_count + 1');
SELECT tests.is(public.reserve_invitation_attempt(tests.profile_id('A.reserve')) ->> 'code', 'cooldown', 'two reservations in a row: the second is a cooldown (one send for a double click)');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT status, send_attempts, last_attempt_at IS NOT NULL, invited_by IS NULL, expires_at > now() + interval '6 days' FROM public.user_invitations WHERE profile_id = %L$q$, tests.profile_id('A.reserve')),
  $q$VALUES ('pending'::text, 3, true, true, true)$q$,
  'the reserved live row: pending, attempt 3 stamped, an inviter of another company not kept, 7-day expiry');
SELECT tests.is((SELECT account_status FROM public.profiles WHERE id = tests.profile_id('A.reserve')), 'not_invited', 'a reservation never stamps the profile');
-- Revoke, then re-invite: the numbers continue.
SELECT id AS reserve_invitation FROM public.user_invitations WHERE profile_id = tests.profile_id('A.reserve') \gset
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format('SELECT public.revoke_invitation(%L)', :'reserve_invitation'), 'the reserved invitation is revoked');
SELECT tests.as_service();
SELECT tests.is(public.reserve_invitation_attempt(tests.profile_id('A.reserve')) ->> 'attempt', '4', 'a re-invite after a revoke reserves attempt 4 (monotonic across rows)');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT status, send_attempts FROM public.user_invitations WHERE profile_id = %L$q$, tests.profile_id('A.reserve')),
  $q$VALUES ('revoked'::text, 3), ('pending'::text, 4)$q$,
  'the revoked row keeps 3, the new live row has 4');
SELECT tests.ok(NOT has_function_privilege(r, 'public.reserve_invitation_attempt(uuid,uuid,text)', 'EXECUTE'), r || ' cannot execute reserve_invitation_attempt')
FROM unnest(ARRAY['anon', 'authenticated']) AS r;
SELECT tests.ok(has_function_privilege('service_role', 'public.reserve_invitation_attempt(uuid,uuid,text)', 'EXECUTE'), 'service_role executes reserve_invitation_attempt');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws(format('SELECT public.reserve_invitation_attempt(%L)', tests.profile_id('A.imported')), '42501', 'a browser session cannot reserve an attempt (even an admin)');
SELECT tests.reset_role();

-- ------------------------------------------------------------ reads (RLS)

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.ok((SELECT count(*) FROM public.user_invitations) >= 2, 'the users-access admin reads company A''s invitations');
SELECT tests.denied(format($q$UPDATE public.user_invitations SET status = 'accepted' WHERE profile_id = %L RETURNING id$q$, tests.profile_id('A.newbie')), 'not even the admin writes the table directly');
SELECT tests.throws(format($q$INSERT INTO public.user_invitations (company_id, profile_id) VALUES (%L, %L)$q$, tests.company_id('A'), tests.profile_id('A.imported')), '42501', 'no direct insert');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is_empty('SELECT 1 FROM public.user_invitations', 'company B cannot read A''s invitations');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is_empty('SELECT 1 FROM public.user_invitations', 'crew read no invitations');
SELECT tests.as_anon();
SELECT tests.denied('SELECT * FROM public.user_invitations', 'anon reads nothing');
SELECT tests.reset_role();

-- ------------------------------------------------------------ revoke_invitation

SELECT id AS newbie_invitation FROM public.user_invitations WHERE profile_id = tests.profile_id('A.newbie') \gset
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(format('SELECT public.revoke_invitation(%L)', :'newbie_invitation'), '42501', 'not_permitted', 'a Master cannot revoke');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(format('SELECT public.revoke_invitation(%L)', :'newbie_invitation'), '42501', 'not_permitted', 'company B''s admin cannot revoke an A invitation');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format('SELECT public.revoke_invitation(%L)', tests.id('invitation:nope')), 'P0002', 'invitation_not_found', 'unknown id');
SELECT tests.lives(format('SELECT public.revoke_invitation(%L)', :'newbie_invitation'), 'the admin revokes a live invitation');
SELECT tests.throws_like(format('SELECT public.revoke_invitation(%L)', :'newbie_invitation'), 'P0002', 'invitation_not_live', 'a revoked invitation is not live');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws_like(format('SELECT public.revoke_invitation(%L)', tests.id('invitation:nope')), '42501', 'not_permitted', 'a disabled caller is refused first');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT status, revoked_by, revoked_at IS NOT NULL FROM public.user_invitations WHERE profile_id = %L$q$, tests.profile_id('A.newbie')),
  format($q$VALUES ('revoked'::text, %L::uuid, true)$q$, tests.user_id('A.fleet_manager')),
  'revoked with who and when');
SELECT tests.is((SELECT account_status FROM public.profiles WHERE id = tests.profile_id('A.newbie')), 'not_invited', 'the never-signed-in invitee is not invited any more');
SELECT tests.is((SELECT status FROM public.account_memberships WHERE user_id = tests.user_id('A.newbie')), 'removed', 'and the never-accepted membership is removed');
SELECT tests.as_service();
SELECT tests.lives(format($q$SELECT public.record_invitation_send(%L, 'sent')$q$, tests.profile_id('A.newbie')), 'after a revoke a new invitation starts');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT status, send_attempts FROM public.user_invitations WHERE profile_id = %L$q$, tests.profile_id('A.newbie')),
  $q$VALUES ('revoked'::text, 3), ('sent'::text, 4)$q$,
  'the revoked row stays; the new live row continues the numbers (no reservation: the next one)');

-- ------------------------------------------------------------ revoke withdraws the access (gap/01 W2 row 8)

-- The real shape: an imported profile, the login generateLink created, a
-- sent invitation linking it, a vessel assignment.
SELECT tests.seed_profile('A', 'A.revokee', 'crew', 'not_invited');
SELECT tests.seed_auth_user('A.revokee');
SELECT tests.as_service();
SELECT tests.is((public.record_invitation_send(tests.profile_id('A.revokee'), 'sent', NULL, 'msg-1', tests.user_id('A.fleet_manager'), 'crew', NULL, tests.user_id('A.revokee'))).status, 'sent', 'the invitation is sent');
SELECT tests.reset_role();
SELECT tests.seed_assignment('A.revokee', 'A.dra');
SELECT tests.results_eq(
  format($q$SELECT p.account_status, m.status, m.legacy_managed FROM public.profiles AS p JOIN public.account_memberships AS m ON m.user_id = p.user_id WHERE p.id = %L$q$, tests.profile_id('A.revokee')),
  $q$VALUES ('invited'::text, 'active'::text, true)$q$,
  'after the send: profile invited, legacy membership active');
SELECT id AS revokee_invitation FROM public.user_invitations WHERE profile_id = tests.profile_id('A.revokee') AND status = 'sent' \gset
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is((public.revoke_invitation(:'revokee_invitation')).status, 'revoked', 'the admin revokes it (same return shape)');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT p.account_status, m.status, m.removed_at IS NOT NULL FROM public.profiles AS p JOIN public.account_memberships AS m ON m.user_id = p.user_id WHERE p.id = %L$q$, tests.profile_id('A.revokee')),
  $q$VALUES ('not_invited'::text, 'removed'::text, true)$q$,
  'after the revoke: profile not_invited, membership removed');
SELECT tests.as_user(tests.user_id('A.revokee'));
SELECT tests.is(public.record_session_start(), 'disabled', 'the revoked invitee (link already emailed, or a password reset) signs in: disabled');
SELECT tests.is(public.my_account_status(), 'disabled', 'my_account_status: disabled');
SELECT tests.ok(NOT public.user_is_active(auth.uid()), 'user_is_active is false');
SELECT tests.is_empty('SELECT 1 FROM public.vessels', 'the revoked invitee reads no vessel');
SELECT tests.is_empty('SELECT 1 FROM public.profiles', 'nor any profile');
SELECT tests.ok(NOT public.user_can_reach_vessel(auth.uid(), tests.vessel_id('A.dra')), 'nor reaches the assigned vessel');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT p.account_status, m.status FROM public.profiles AS p JOIN public.account_memberships AS m ON m.user_id = p.user_id WHERE p.id = %L$q$, tests.profile_id('A.revokee')),
  $q$VALUES ('not_invited'::text, 'removed'::text)$q$,
  'the sign-in attempt changed nothing');
-- A later profile update never brings the removed membership back.
UPDATE public.profiles SET role = 'chief_officer' WHERE id = tests.profile_id('A.revokee');
SELECT tests.is((SELECT status FROM public.account_memberships WHERE user_id = tests.user_id('A.revokee')), 'removed', 'the profile sync keeps a removed membership removed');
UPDATE public.profiles SET role = 'crew' WHERE id = tests.profile_id('A.revokee');
-- A re-invite restores it; the sign-in then works.
SELECT tests.as_service();
SELECT tests.is((public.record_invitation_send(tests.profile_id('A.revokee'), 'sent', NULL, 'msg-2', tests.user_id('A.fleet_manager'))).status, 'sent', 'the re-invite is sent');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT p.account_status, m.status, m.removed_at IS NULL FROM public.profiles AS p JOIN public.account_memberships AS m ON m.user_id = p.user_id WHERE p.id = %L$q$, tests.profile_id('A.revokee')),
  $q$VALUES ('invited'::text, 'active'::text, true)$q$,
  'the re-invite: profile invited, membership active again');
SELECT tests.as_user(tests.user_id('A.revokee'));
SELECT tests.is(public.record_session_start(), 'active', 'after the re-invite the sign-in returns active');
SELECT tests.ok((SELECT count(*) FROM public.vessels) = 1, 'and the invitee reads their vessel');
SELECT tests.reset_role();
SELECT tests.is((SELECT status FROM public.account_memberships WHERE user_id = tests.user_id('A.revokee')), 'active', 'the membership is active');
SELECT tests.is((SELECT count(*) FROM public.user_invitations WHERE profile_id = tests.profile_id('A.revokee') AND status = 'accepted'), 1::bigint, 'the new invitation is accepted');
-- set_membership_status (admin-actions) can also enable a removed membership.
SELECT tests.seed_auth_user('A.revokee2');
SELECT tests.seed_profile('A', 'A.revokee2', 'crew', 'not_invited', 'A.revokee2');
SELECT tests.as_service();
SELECT public.record_invitation_send(tests.profile_id('A.revokee2'), 'sent');
SELECT tests.reset_role();
SELECT id AS revokee2_invitation FROM public.user_invitations WHERE profile_id = tests.profile_id('A.revokee2') \gset
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT public.revoke_invitation(:'revokee2_invitation');
SELECT tests.as_service();
SELECT tests.throws_like(format($q$SELECT public.set_membership_status(%L, 'disabled', %L, 'x')$q$, tests.user_id('A.revokee2'), tests.user_id('A.fleet_manager')), '42501', 'membership_removed', 'a removed membership cannot be disabled');
SELECT tests.is((public.set_membership_status(tests.user_id('A.revokee2'), 'active', tests.user_id('A.fleet_manager'))).status, 'active', 'an admin enabling it restores a removed membership');
SELECT tests.reset_role();
SELECT tests.ok(public.user_is_active(tests.user_id('A.revokee2')), 'the user is active again');

-- ------------------------------------------------------------ expire_invitations

UPDATE public.user_invitations SET expires_at = now() - interval '1 minute' WHERE profile_id = tests.profile_id('A.active_crew');
SELECT tests.as_service();
SELECT tests.is(public.expire_invitations(), 1, 'one live invitation past its date expires');
SELECT tests.is(public.expire_invitations(), 0, 'a second run expires nothing');
SELECT tests.reset_role();
SELECT tests.is((SELECT status FROM public.user_invitations WHERE profile_id = tests.profile_id('A.active_crew')), 'expired', 'status expired');
SELECT tests.ok(public.user_is_active(tests.user_id('A.active_crew')) AND (SELECT account_status FROM public.profiles WHERE id = tests.profile_id('A.active_crew')) = 'active',
                'an active user whose re-invite expired stays active');
-- Expiry withdraws the access of a never-accepted invitation, like a revoke.
SELECT tests.seed_profile('A', 'A.expiree', 'crew', 'not_invited');
SELECT tests.seed_auth_user('A.expiree');
SELECT tests.as_service();
SELECT public.record_invitation_send(tests.profile_id('A.expiree'), 'sent', NULL, 'msg-3', tests.user_id('A.fleet_manager'), 'crew', NULL, tests.user_id('A.expiree'));
SELECT tests.reset_role();
SELECT tests.seed_assignment('A.expiree', 'A.dra');
UPDATE public.user_invitations SET expires_at = now() - interval '1 minute' WHERE profile_id = tests.profile_id('A.expiree');
SELECT tests.as_service();
SELECT tests.is(public.expire_invitations(), 1, 'the invitee''s invitation expires');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT p.account_status, m.status FROM public.profiles AS p JOIN public.account_memberships AS m ON m.user_id = p.user_id WHERE p.id = %L$q$, tests.profile_id('A.expiree')),
  $q$VALUES ('not_invited'::text, 'removed'::text)$q$,
  'after the expiry: profile not_invited, membership removed');
SELECT tests.as_user(tests.user_id('A.expiree'));
SELECT tests.is(public.record_session_start(), 'disabled', 'the expired invitee signs in: disabled');
SELECT tests.is(public.my_account_status(), 'disabled', 'my_account_status: disabled');
SELECT tests.ok(NOT public.user_is_active(auth.uid()), 'user_is_active is false');
SELECT tests.is_empty('SELECT 1 FROM public.vessels', 'no vessel');
SELECT tests.is_empty('SELECT 1 FROM public.profiles', 'no profile');
SELECT tests.reset_role();
SELECT tests.is((SELECT status FROM public.user_invitations WHERE profile_id = tests.profile_id('A.expiree')), 'expired', 'the expired row is not accepted by the attempt');

-- ------------------------------------------------------------ record_session_start accepts (file 3 + file 9)

SELECT tests.seed_user('A', 'A.invitee', 'crew', 'invited');
SELECT tests.as_service();
SELECT tests.lives(format($q$SELECT public.record_invitation_send(%L, 'sent', NULL, NULL, %L)$q$, tests.profile_id('A.invitee'), tests.user_id('A.fleet_manager')), 'invite a user with a login');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.invitee'));
SELECT tests.is(public.record_session_start(), 'active', 'the invitee signs in');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT status, accepted_at IS NOT NULL FROM public.user_invitations WHERE profile_id = %L$q$, tests.profile_id('A.invitee')),
  $q$VALUES ('accepted'::text, true)$q$,
  'record_session_start() accepts the live invitation by user id');
SELECT tests.is((SELECT account_status FROM public.profiles WHERE id = tests.profile_id('A.invitee')), 'active', 'and the profile is active');
-- By profile: a live row that has no user id yet.
SELECT tests.seed_user('A', 'A.invitee2', 'crew', 'invited');
INSERT INTO public.user_invitations (id, company_id, profile_id, user_id, status, send_attempts)
VALUES (tests.id('invitation:by_profile'), tests.company_id('A'), tests.profile_id('A.invitee2'), NULL, 'sent', 1);
SELECT tests.as_user(tests.user_id('A.invitee2'));
SELECT tests.is(public.record_session_start(), 'active', 'the second invitee signs in');
SELECT tests.reset_role();
SELECT tests.is((SELECT status FROM public.user_invitations WHERE id = tests.id('invitation:by_profile')), 'accepted', 'record_session_start() accepts the live invitation by profile');
-- A disabled invitee accepts nothing.
SELECT tests.seed_user('A', 'A.invitee3', 'crew', 'invited');
INSERT INTO public.user_invitations (id, company_id, profile_id, user_id, status) VALUES (tests.id('invitation:disabled'), tests.company_id('A'), tests.profile_id('A.invitee3'), tests.user_id('A.invitee3'), 'sent');
UPDATE public.account_memberships SET status = 'disabled' WHERE user_id = tests.user_id('A.invitee3');
SELECT tests.as_user(tests.user_id('A.invitee3'));
SELECT tests.is(public.record_session_start(), 'disabled', 'a disabled invitee is told so');
SELECT tests.reset_role();
SELECT tests.is((SELECT status FROM public.user_invitations WHERE id = tests.id('invitation:disabled')), 'sent', 'and accepts nothing');

-- ------------------------------------------------------------ ACLs (rule 5)

SELECT tests.ok(NOT has_function_privilege(r, 'public.record_invitation_send(uuid,text,text,text,uuid,text,timestamptz,uuid)', 'EXECUTE'), r || ' cannot execute record_invitation_send')
FROM unnest(ARRAY['anon', 'authenticated']) AS r;
SELECT tests.ok(NOT has_function_privilege(r, 'public.expire_invitations()', 'EXECUTE'), r || ' cannot execute expire_invitations')
FROM unnest(ARRAY['anon', 'authenticated']) AS r;
SELECT tests.ok(has_function_privilege('authenticated', 'public.revoke_invitation(uuid)', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.revoke_invitation(uuid)', 'EXECUTE'), 'revoke_invitation: authenticated, not anon');
SELECT tests.ok(NOT has_table_privilege('anon', 'public.user_invitations', 'SELECT') AND NOT has_table_privilege('authenticated', 'public.user_invitations', 'INSERT')
            AND NOT has_table_privilege('authenticated', 'public.user_invitations', 'UPDATE'), 'table grants: read-only for authenticated, nothing for anon');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws(format($q$SELECT public.record_invitation_send(%L, 'sent')$q$, tests.profile_id('A.imported')), '42501', 'a browser session cannot record a send (even an admin)');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.user_invitations WHERE profile_id = tests.profile_id('A.imported')), 0::bigint, 'nothing was recorded');

-- ------------------------------------------------------------ backfill (re-run the file on legacy rows)

SELECT tests.seed_profile('A', 'A.legacy_pending', 'crew', 'invited', NULL, jsonb_build_object('last_invited_at', now() - interval '2 days', 'invitation_count', 3));
SELECT tests.seed_profile('A', 'A.legacy_token', 'dpa', 'invited', NULL, jsonb_build_object('last_invited_at', now() - interval '1 day', 'invitation_token_expires', now() + interval '30 days'));
SELECT tests.seed_user('A', 'A.legacy_signed_in', 'crew', 'invited', jsonb_build_object('last_login_at', now() - interval '3 hours', 'last_invited_at', now() - interval '4 days'));
-- The real legacy shape: accepted through the auth link (auth last_sign_in_at
-- yesterday), profile still 'invited', last_login_at never written.
SELECT tests.seed_auth_user('A.legacy_link_accepted', jsonb_build_object('last_sign_in_at', now() - interval '1 day'));
SELECT tests.seed_profile('A', 'A.legacy_link_accepted', 'crew', 'invited', 'A.legacy_link_accepted', jsonb_build_object('last_invited_at', now() - interval '60 days'));
-- A legacy invitee with a login who never signed in.
SELECT tests.seed_user('A', 'A.legacy_never', 'crew', 'invited', jsonb_build_object('last_invited_at', now() - interval '60 days'));
\i supabase/migrations/20261123010200_platform_user_invitations.sql
\i supabase/migrations/20261123010200_platform_user_invitations.sql
SELECT tests.results_eq(
  format($q$SELECT status, send_attempts, last_error_code, last_sent_at IS NOT NULL, expires_at::date FROM public.user_invitations WHERE profile_id = %L$q$, tests.profile_id('A.legacy_pending')),
  $q$VALUES ('pending'::text, 3, 'legacy_unverified'::text, true, (now() - interval '2 days' + interval '7 days')::date)$q$,
  'a legacy invited profile: pending, legacy_unverified, attempts from invitation_count, expiry from last_invited_at');
SELECT tests.results_eq(
  format($q$SELECT status, kind, expires_at::date FROM public.user_invitations WHERE profile_id = %L$q$, tests.profile_id('A.legacy_token')),
  $q$VALUES ('pending'::text, 'admin'::text, (now() + interval '30 days')::date)$q$,
  'the token expiry wins; an admin profile is an admin invitation');
SELECT tests.results_eq(
  format($q$SELECT status, last_error_code IS NULL, accepted_at IS NOT NULL FROM public.user_invitations WHERE profile_id = %L$q$, tests.profile_id('A.legacy_signed_in')),
  $q$VALUES ('accepted'::text, true, true)$q$,
  'a legacy invited profile that has signed in: accepted');
SELECT tests.results_eq(
  format($q$SELECT status, last_error_code IS NULL, accepted_at::date FROM public.user_invitations WHERE profile_id = %L$q$, tests.profile_id('A.legacy_link_accepted')),
  $q$VALUES ('accepted'::text, true, (now() - interval '1 day')::date)$q$,
  'a legacy invitee who signed in through the auth link (last_login_at NULL): accepted at the auth sign-in');
SELECT tests.results_eq(
  format($q$SELECT status, last_error_code FROM public.user_invitations WHERE profile_id = %L$q$, tests.profile_id('A.legacy_never')),
  $q$VALUES ('pending'::text, 'legacy_unverified'::text)$q$,
  'a legacy invitee with a login who never signed in: pending, legacy_unverified');
SELECT tests.is((SELECT count(*) FROM public.user_invitations WHERE profile_id IN (tests.profile_id('A.legacy_pending'), tests.profile_id('A.legacy_token'), tests.profile_id('A.legacy_signed_in'), tests.profile_id('A.legacy_link_accepted'), tests.profile_id('A.legacy_never'))), 5::bigint, 'two re-runs add no duplicates');
-- The expiry job leaves the accepted legacy user alone (and active).
SELECT tests.as_service();
SELECT public.expire_invitations();
SELECT tests.reset_role();
SELECT tests.is((SELECT status FROM public.user_invitations WHERE profile_id = tests.profile_id('A.legacy_link_accepted')), 'accepted', 'expire_invitations() leaves the accepted legacy row accepted');
SELECT tests.as_user(tests.user_id('A.legacy_link_accepted'));
SELECT tests.is(public.my_account_status(), 'active', 'the legacy user who signed in stays active');
SELECT tests.is(public.record_session_start(), 'active', 'and signs in');
SELECT tests.reset_role();
SELECT tests.is((SELECT status FROM public.user_invitations WHERE profile_id = tests.profile_id('A.legacy_never')), 'expired', 'the never-signed-in legacy invitation expires');
SELECT tests.results_eq(
  format($q$SELECT p.account_status, m.status FROM public.profiles AS p JOIN public.account_memberships AS m ON m.user_id = p.user_id WHERE p.id = %L$q$, tests.profile_id('A.legacy_never')),
  $q$VALUES ('not_invited'::text, 'removed'::text)$q$,
  'and its access is withdrawn');
SELECT tests.is((SELECT count(*) FROM public.user_invitations WHERE profile_id = tests.profile_id('A.newbie')), 2::bigint, 'profiles that already have rows are left alone');
