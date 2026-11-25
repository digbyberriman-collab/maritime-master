-- An invitation adopts only a login STORM created (review round 3,
-- invite-adopts-foreign-login; D-205): invitation_login_state() (service
-- role) answers, first match wins, unknown | linked | linked_elsewhere |
-- email_mismatch | storm_invited | unused_orphan | foreign, and
-- record_invitation_send() links p_user_id to a profile without a login
-- only when the answer is storm_invited (42501 login_email_mismatch,
-- login_not_invited otherwise; nothing written). Ports scratchpad
-- r2sec/s3_prehijack.sql: an outsider self-registers with the address of a
-- DPA the company is about to invite and never becomes that DPA.

SELECT tests.seed_two_tenants();
-- Profiles about to be invited (no login yet).
SELECT tests.seed_profile('A', 'A.new_dpa', 'dpa', 'not_invited', NULL);
SELECT tests.seed_profile('A', k, 'crew', 'not_invited', NULL)
FROM unnest(ARRAY['A.p_invited', 'A.p_carried', 'A.p_orphan', 'A.p_google', 'A.p_mismatch', 'A.p_nomail', 'A.p_linked_other']) AS k;
-- The logins. Addresses are the profile's unless said otherwise.
-- The outsider: self-registered with the DPA's address, a password, confirmed, signed in, never invited.
SELECT tests.seed_auth_user('X.outsider', jsonb_build_object('email', tests.email('A.new_dpa'), 'encrypted_password', '$2a$10$outsiderchosenpasswordhashxxxxxxxxxxxxxxxxxxxxxxxxxx',
                                                             'email_confirmed_at', now() - interval '2 days', 'last_sign_in_at', now() - interval '2 days', 'invited_at', NULL));
-- What generateLink('invite') creates: invited_at, unconfirmed, no password, never signed in.
SELECT tests.seed_auth_user('A.p_invited', jsonb_build_object('invited_at', now(), 'email_confirmed_at', NULL));
-- A login an earlier invitation row of the profile already carries (confirmed, with a password).
SELECT tests.seed_auth_user('A.p_carried', jsonb_build_object('encrypted_password', '$2a$10$carriedpasswordhashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'));
INSERT INTO public.user_invitations (company_id, profile_id, user_id, kind, status, send_attempts)
VALUES (tests.company_id('A'), tests.profile_id('A.p_carried'), tests.user_id('A.p_carried'), 'crew', 'revoked', 1);
-- An unconfirmed, never-signed-in self-registration (no invited_at).
SELECT tests.seed_auth_user('A.p_orphan', jsonb_build_object('email_confirmed_at', NULL));
-- An invite login that also has a non-email identity (signed up through another provider).
SELECT tests.seed_auth_user('A.p_google', jsonb_build_object('invited_at', now(), 'email_confirmed_at', NULL));
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
VALUES ('google-sub-p-google', tests.user_id('A.p_google'), jsonb_build_object('sub', 'google-sub-p-google', 'email', tests.email('A.p_google')), 'google', now(), now());
-- An invite-shaped login with another address than the profile's.
SELECT tests.seed_auth_user('X.mismatch', jsonb_build_object('email', 'someone-else@example.test', 'invited_at', now(), 'email_confirmed_at', NULL));
-- An invite-shaped login with no address.
SELECT tests.seed_auth_user('X.nomail', jsonb_build_object('email', NULL, 'invited_at', now(), 'email_confirmed_at', NULL));

-- ------------------------------------------------------------ invitation_login_state

SELECT tests.as_service();
SELECT tests.is(public.invitation_login_state(v.p, v.u), v.want, v.what)
FROM (VALUES
  (NULL::uuid, tests.user_id('A.p_invited'), 'unknown', 'a NULL profile: unknown'),
  (tests.profile_id('A.p_invited'), NULL::uuid, 'unknown', 'a NULL login: unknown'),
  (tests.id('profile:nobody'), tests.user_id('A.p_invited'), 'unknown', 'an unknown profile: unknown'),
  (tests.profile_id('A.p_invited'), tests.id('user:nobody'), 'unknown', 'an unknown login: unknown'),
  (tests.profile_id('A.crew_hyd'), tests.user_id('A.crew_hyd'), 'linked', 'the profile''s own login: linked'),
  (tests.profile_id('A.crew_hyd'), tests.user_id('A.p_invited'), 'linked_elsewhere', 'a profile with another login: linked_elsewhere'),
  (tests.profile_id('A.p_linked_other'), tests.user_id('A.crew_hyd'), 'linked_elsewhere', 'a login another profile carries: linked_elsewhere'),
  (tests.profile_id('A.p_mismatch'), tests.user_id('X.mismatch'), 'email_mismatch', 'another address: email_mismatch'),
  (tests.profile_id('A.p_nomail'), tests.user_id('X.nomail'), 'email_mismatch', 'a login with no address: email_mismatch'),
  (tests.profile_id('A.p_invited'), tests.user_id('A.p_invited'), 'storm_invited', 'an untouched invite login: storm_invited'),
  (tests.profile_id('A.p_carried'), tests.user_id('A.p_carried'), 'storm_invited', 'a login an earlier invitation of the profile carries: storm_invited'),
  (tests.profile_id('A.p_orphan'), tests.user_id('A.p_orphan'), 'unused_orphan', 'unconfirmed, never signed in, never invited: unused_orphan'),
  (tests.profile_id('A.p_google'), tests.user_id('A.p_google'), 'unused_orphan', 'an invite login with a non-email identity is not storm_invited (unconfirmed: unused_orphan)'),
  (tests.profile_id('A.new_dpa'), tests.user_id('X.outsider'), 'foreign', 'the confirmed, signed-in, self-registered outsider: foreign')
) AS v(p, u, want, what);
-- An address that differs only in case and spaces is the same address.
SELECT tests.reset_role();
UPDATE public.profiles SET email = '  ' || upper(email) || ' ' WHERE id = tests.profile_id('A.p_invited');
SELECT tests.as_service();
SELECT tests.is(public.invitation_login_state(tests.profile_id('A.p_invited'), tests.user_id('A.p_invited')), 'storm_invited', 'addresses compare lower(btrim(...))');
-- A confirmed google login is foreign.
SELECT tests.reset_role();
UPDATE auth.users SET email_confirmed_at = now() WHERE id = tests.user_id('A.p_google');
SELECT tests.as_service();
SELECT tests.is(public.invitation_login_state(tests.profile_id('A.p_google'), tests.user_id('A.p_google')), 'foreign', 'a confirmed login with a non-email identity: foreign');
SELECT tests.reset_role();

-- ------------------------------------------------------------ s3: the outsider never becomes the DPA

SELECT tests.as_user(tests.user_id('X.outsider'));
SELECT tests.is(public.record_session_start(), 'no_profile', 'setup: the outsider''s self-registered login has no profile');
SELECT tests.reset_role();
SELECT tests.as_service();
SELECT tests.is(public.auth_user_id_for_email(tests.email('A.new_dpa')), tests.user_id('X.outsider'), 'setup: the address lookup finds the outsider''s login');
SELECT tests.throws_like(format($q$SELECT public.record_invitation_send(%L, 'sent', NULL, NULL, %L, 'admin', NULL, %L)$q$,
                                tests.profile_id('A.new_dpa'), tests.user_id('A.fleet_manager'), tests.user_id('X.outsider')),
                         '42501', 'login_not_invited', 'record_invitation_send refuses to link the outsider''s login to the DPA profile');
SELECT tests.throws_like(format($q$SELECT public.record_invitation_send(%L, 'send_failed', 'provider_rejected', NULL, %L, 'admin', NULL, %L)$q$,
                                tests.profile_id('A.new_dpa'), tests.user_id('A.fleet_manager'), tests.user_id('X.outsider')),
                         '42501', 'login_not_invited', 'a failed send cannot link it either');
SELECT tests.reset_role();
SELECT tests.is((SELECT user_id FROM public.profiles WHERE id = tests.profile_id('A.new_dpa')), NULL::uuid, 'the DPA profile still has no login');
SELECT tests.is((SELECT account_status FROM public.profiles WHERE id = tests.profile_id('A.new_dpa')), 'not_invited', 'and is still not invited');
SELECT tests.is((SELECT count(*) FROM public.user_invitations WHERE profile_id = tests.profile_id('A.new_dpa')), 0::bigint, 'no invitation row was written');
SELECT tests.as_user(tests.user_id('X.outsider'));
SELECT tests.is(public.record_session_start(), 'no_profile', 'the outsider still has no profile');
SELECT tests.ok(NOT public.has_capability('admin.access.users_access.admin', tests.company_id('A')), 'and is no admin of company A');
SELECT tests.is_empty('SELECT 1 FROM public.profiles', 'and reads no profile');
SELECT tests.reset_role();

-- ------------------------------------------------------------ the other refusals

SELECT tests.as_service();
SELECT tests.throws_like(format($q$SELECT public.record_invitation_send(%L, 'sent', NULL, NULL, %L, 'crew', NULL, %L)$q$, tests.profile_id(v.p), tests.user_id('A.fleet_manager'), tests.user_id(v.u)),
                         '42501', v.code, v.what)
FROM (VALUES
  ('A.p_orphan', 'A.p_orphan', 'login_not_invited', 'an unconfirmed, never-signed-in login without invited_at is not adopted'),
  ('A.p_google', 'A.p_google', 'login_not_invited', 'a login with a non-email identity is not adopted'),
  ('A.p_mismatch', 'X.mismatch', 'login_email_mismatch', 'a login with another address is refused'),
  ('A.p_nomail', 'X.nomail', 'login_email_mismatch', 'a login with no address is refused')
) AS v(p, u, code, what);
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.profiles WHERE id IN (tests.profile_id('A.p_orphan'), tests.profile_id('A.p_google'), tests.profile_id('A.p_mismatch'), tests.profile_id('A.p_nomail')) AND user_id IS NOT NULL),
                0::bigint, 'none of them got a login');
SELECT tests.is((SELECT count(*) FROM public.user_invitations WHERE profile_id IN (tests.profile_id('A.p_orphan'), tests.profile_id('A.p_google'), tests.profile_id('A.p_mismatch'), tests.profile_id('A.p_nomail'))),
                0::bigint, 'and no invitation row was written');

-- ------------------------------------------------------------ the logins STORM created are adopted

SELECT tests.as_service();
SELECT tests.is((public.record_invitation_send(tests.profile_id('A.p_invited'), 'sent', NULL, 'msg-inv', tests.user_id('A.fleet_manager'), 'crew', NULL, tests.user_id('A.p_invited'))).status,
                'sent', 'a STORM-invited login is adopted');
SELECT tests.is((public.record_invitation_send(tests.profile_id('A.p_carried'), 'sent', NULL, 'msg-car', tests.user_id('A.fleet_manager'), 'crew', NULL, tests.user_id('A.p_carried'))).status,
                'sent', 'a login an earlier invitation of the profile carries is adopted');
SELECT tests.is(public.invitation_login_state(tests.profile_id('A.p_invited'), tests.user_id('A.p_invited')), 'linked', 'once linked the answer is linked');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT id, user_id FROM public.profiles WHERE id IN (%L, %L)$q$, tests.profile_id('A.p_invited'), tests.profile_id('A.p_carried')),
  format($q$VALUES (%L::uuid, %L::uuid), (%L::uuid, %L::uuid)$q$, tests.profile_id('A.p_invited'), tests.user_id('A.p_invited'), tests.profile_id('A.p_carried'), tests.user_id('A.p_carried')),
  'both profiles carry their login');
-- A profile that already has its login is not asked again (a resend).
SELECT tests.as_service();
SELECT tests.lives(format($q$SELECT public.record_invitation_send(%L, 'sent', NULL, NULL, %L, 'crew', NULL, %L)$q$, tests.profile_id('A.crew_hyd'), tests.user_id('A.fleet_manager'), tests.user_id('A.crew_hyd')),
                   'a resend to a profile that already has the login');
SELECT tests.reset_role();

-- ------------------------------------------------------------ ACLs

SELECT tests.ok(NOT has_function_privilege(r, 'public.invitation_login_state(uuid,uuid)', 'EXECUTE'), r || ' cannot execute invitation_login_state')
FROM unnest(ARRAY['anon', 'authenticated']) AS r;
SELECT tests.ok(has_function_privilege('service_role', 'public.invitation_login_state(uuid,uuid)', 'EXECUTE'), 'service_role executes invitation_login_state');
SELECT tests.as_user(tests.user_id('X.outsider'));
SELECT tests.throws(format('SELECT public.invitation_login_state(%L, %L)', tests.profile_id('A.new_dpa'), tests.user_id('X.outsider')), '42501', 'a browser session cannot ask it');
SELECT tests.reset_role();
