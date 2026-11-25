-- Imported crew get their vessel once a login is linked (D-184; review
-- round 2, create-crew-pending-login-never-assigned): create-crew-member
-- and the CSV import leave the vessel on profiles.imported_vessel_id when
-- there is no login yet; record_invitation_send (the sent branch, and a
-- failed send that links the login) and any other link path (the
-- AFTER UPDATE OF user_id trigger) turn it into one current
-- crew_assignments row through fulfil_imported_assignment(), so vessel
-- reach (D-26) works at the first sign-in. Contract for the edge:
-- fulfil_imported_assignment(p_profile_id, p_actor) -> created | exists |
-- none | not_eligible.

SELECT tests.seed_two_tenants();
SELECT tests.seed_vessel('A', 'A.sold', 'OLD TIMER', 'Sold');
SELECT tests.seed_vessel('A', 'A.archived', 'LAID UP', 'Active', NULL, NULL, '{"lifecycle_status": "archived"}');

-- Imported profiles as create-crew-member writes them: not_invited, no login,
-- is_imported, the vessel waiting on imported_vessel_id, a join date.
CREATE FUNCTION tests.seed_imported(p_key text, p_vessel_key text, p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT tests.seed_profile('A', p_key, 'crew', 'not_invited', NULL,
           jsonb_build_object('is_imported', true, 'imported_vessel_id', tests.vessel_id(p_vessel_key),
                              'joining_date', (current_date - 3)::text, 'position', 'Bosun', 'rank', 'Rating') || p_extra);
$$;
SELECT tests.seed_imported('A.sent_crew', 'A.dra');
SELECT tests.seed_auth_user('A.sent_crew', jsonb_build_object('invited_at', now(), 'email_confirmed_at', NULL));
SELECT tests.seed_imported('A.failed_crew', 'A.dra', '{"position": "  ", "rank": "Deck rating"}');
SELECT tests.seed_auth_user('A.failed_crew', jsonb_build_object('invited_at', now(), 'email_confirmed_at', NULL));
SELECT tests.seed_imported('A.foreign_vessel', 'B.lev');
SELECT tests.seed_auth_user('A.foreign_vessel', jsonb_build_object('invited_at', now(), 'email_confirmed_at', NULL));
SELECT tests.seed_imported('A.sold_vessel', 'A.sold');
SELECT tests.seed_auth_user('A.sold_vessel', jsonb_build_object('invited_at', now(), 'email_confirmed_at', NULL));
SELECT tests.seed_imported('A.archived_vessel', 'A.archived');
SELECT tests.seed_auth_user('A.archived_vessel', jsonb_build_object('invited_at', now(), 'email_confirmed_at', NULL));
-- (linked from the start: the profile row is inserted with its login, so
-- the link trigger does not fire)
SELECT tests.seed_auth_user('A.already_crew');
SELECT tests.seed_profile('A', 'A.already_crew', 'crew', 'active', 'A.already_crew',
                          jsonb_build_object('is_imported', true, 'imported_vessel_id', tests.vessel_id('A.dra')));

-- ------------------------------------------------------------ the sent branch

SELECT tests.as_service();
SELECT tests.is(public.reserve_invitation_attempt(tests.profile_id('A.sent_crew'), tests.user_id('A.fleet_manager')) ->> 'ok', 'true', 'the attempt is reserved');
SELECT tests.is((public.record_invitation_send(tests.profile_id('A.sent_crew'), 'sent', NULL, 'msg-1', tests.user_id('A.fleet_manager'), 'crew', NULL, tests.user_id('A.sent_crew'))).status,
                'sent', 'the invitation is sent and links the login');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT vessel_id, position, join_date, is_current, created_by FROM public.crew_assignments WHERE user_id = %L$q$, tests.user_id('A.sent_crew')),
  format($q$VALUES (%L::uuid, 'Bosun'::text, (current_date - 3), true, %L::uuid)$q$, tests.vessel_id('A.dra'), tests.user_id('A.fleet_manager')),
  'exactly one current assignment: the imported vessel, the position, the join date, the inviter');
SELECT tests.results_eq(format('SELECT r FROM public.reach_vessels_for(%L) AS r', tests.user_id('A.sent_crew')), format('VALUES (%L::uuid)', tests.vessel_id('A.dra')),
                        'the new login reaches the vessel (reach_vessels_for: 1)');
SELECT tests.results_eq(format($q$SELECT is_imported, imported_vessel_id FROM public.profiles WHERE id = %L$q$, tests.profile_id('A.sent_crew')),
                        $q$VALUES (false, NULL::uuid)$q$, 'is_imported is cleared and imported_vessel_id is NULL');
SELECT tests.is(current_setting('storm.access_engine', true), '', 'the engine flag is reset');
-- A second call changes nothing.
SELECT tests.as_service();
SELECT tests.is(public.fulfil_imported_assignment(tests.profile_id('A.sent_crew'), tests.user_id('A.fleet_manager')), 'none', 'a second call returns none');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.crew_assignments WHERE user_id = tests.user_id('A.sent_crew')), 1::bigint, 'and adds nothing');
-- The first sign-in sees the vessel.
SELECT tests.as_user(tests.user_id('A.sent_crew'));
SELECT tests.is(public.record_session_start(), 'active', 'the invitee signs in');
SELECT tests.results_eq('SELECT id FROM public.vessels', format('VALUES (%L::uuid)', tests.vessel_id('A.dra')), 'and sees exactly that vessel');
SELECT tests.reset_role();

-- ------------------------------------------------------------ the send_failed branch that links the login

SELECT tests.as_service();
SELECT tests.is((public.record_invitation_send(tests.profile_id('A.failed_crew'), 'send_failed', 'provider_rejected', NULL, tests.user_id('A.fleet_manager'), 'crew', NULL, tests.user_id('A.failed_crew'))).status,
                'send_failed', 'a failed send that links the login');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT vessel_id, position, join_date, is_current FROM public.crew_assignments WHERE user_id = %L$q$, tests.user_id('A.failed_crew')),
  format($q$VALUES (%L::uuid, 'Deck rating'::text, (current_date - 3), true)$q$, tests.vessel_id('A.dra')),
  'one current assignment too (a blank position falls back to the rank)');
SELECT tests.results_eq(format('SELECT r FROM public.reach_vessels_for(%L) AS r', tests.user_id('A.failed_crew')), format('VALUES (%L::uuid)', tests.vessel_id('A.dra')),
                        'and the linked login reaches the vessel through it (reach_vessels_for: 1)');
SELECT tests.results_eq(format($q$SELECT is_imported, imported_vessel_id, account_status FROM public.profiles WHERE id = %L$q$, tests.profile_id('A.failed_crew')),
                        $q$VALUES (false, NULL::uuid, 'not_invited'::text)$q$, 'is_imported cleared; the failed send did not stamp the profile invited');

-- ------------------------------------------------------------ not eligible: the profile is left as it is

SELECT tests.as_service();
SELECT tests.lives(format($q$SELECT public.record_invitation_send(%L, 'sent', NULL, NULL, %L, 'crew', NULL, %L)$q$, tests.profile_id(k), tests.user_id('A.fleet_manager'), tests.user_id(k)),
                   k || ': the invitation is still sent')
FROM unnest(ARRAY['A.foreign_vessel', 'A.sold_vessel', 'A.archived_vessel']) AS k;
SELECT tests.is(public.fulfil_imported_assignment(tests.profile_id(k)), 'not_eligible', k || ': not_eligible')
FROM unnest(ARRAY['A.foreign_vessel', 'A.sold_vessel', 'A.archived_vessel']) AS k;
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.crew_assignments WHERE user_id = tests.user_id(k)), 0::bigint, k || ': no assignment')
FROM unnest(ARRAY['A.foreign_vessel', 'A.sold_vessel', 'A.archived_vessel']) AS k;
SELECT tests.results_eq(
  format($q$SELECT id, is_imported, imported_vessel_id IS NOT NULL FROM public.profiles WHERE id IN (%L, %L, %L)$q$,
         tests.profile_id('A.foreign_vessel'), tests.profile_id('A.sold_vessel'), tests.profile_id('A.archived_vessel')),
  format($q$VALUES (%L::uuid, true, true), (%L::uuid, true, true), (%L::uuid, true, true)$q$,
         tests.profile_id('A.foreign_vessel'), tests.profile_id('A.sold_vessel'), tests.profile_id('A.archived_vessel')),
  'and the profiles are unchanged (still imported, the vessel still waiting)');

-- ------------------------------------------------------------ an existing crew member is never re-pointed

SELECT tests.seed_assignment('A.already_crew', 'A.hyd', true, 'Deckhand');
SELECT tests.as_service();
SELECT tests.is(public.fulfil_imported_assignment(tests.profile_id('A.already_crew')), 'none', 'a user with a current assignment: none');
SELECT tests.reset_role();
SELECT tests.results_eq(format('SELECT vessel_id FROM public.crew_assignments WHERE user_id = %L', tests.user_id('A.already_crew')), format('VALUES (%L::uuid)', tests.vessel_id('A.hyd')),
                        'no second row (the stale imported vessel never re-points the crew member)');

-- ------------------------------------------------------------ any other link path (the trigger)

SELECT tests.seed_imported('A.linked_later', 'A.gam', '{"joining_date": null}');
SELECT tests.seed_auth_user('A.linked_later');
SELECT tests.as_service();
UPDATE public.profiles SET user_id = tests.user_id('A.linked_later') WHERE id = tests.profile_id('A.linked_later');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT vessel_id, position, join_date, created_by FROM public.crew_assignments WHERE user_id = %L AND is_current$q$, tests.user_id('A.linked_later')),
  format($q$VALUES (%L::uuid, 'Bosun'::text, current_date, NULL::uuid)$q$, tests.vessel_id('A.gam')),
  'a login linked by the service role (the edge D-01 fallback) is fulfilled by the trigger (today when no join date)');
SELECT tests.is((SELECT is_imported FROM public.profiles WHERE id = tests.profile_id('A.linked_later')), false, 'and the profile is no longer imported');

-- ------------------------------------------------------------ the Master office needs a users-access admin (D-198; review rounds 3 and 4)

-- profile-imported-columns-unguarded (round 3): the engine flag never
-- appoints a Master on its own. A pending profile whose position (else
-- rank) is Master / Captain is fulfilled only for an actor who is a
-- users-access admin of the vessel; otherwise not_eligible, nothing
-- written, the profile still pending.
-- master-placement-stranded-after-link (round 4): a given inviter who is no
-- users-access admin of the pending vessel is refused before anything is
-- reserved, linked or sent (reserve_invitation_attempt master_needs_admin,
-- record_invitation_send 42501 master_needs_admin), so the vessel's
-- users-access admin can still finish the placement.
SELECT tests.seed_imported(k, 'A.dra', jsonb_build_object('position', 'Master'))
FROM unnest(ARRAY['A.master_by_master', 'A.master_by_ops', 'A.master_by_dpa', 'A.master_by_ua']) AS k;
SELECT tests.seed_imported('A.captain_by_rank', 'A.dra', jsonb_build_object('position', ' ', 'rank', 'CAPTAIN'));
SELECT tests.seed_auth_user(k, jsonb_build_object('invited_at', now(), 'email_confirmed_at', NULL))
FROM unnest(ARRAY['A.master_by_master', 'A.master_by_ops', 'A.master_by_dpa', 'A.master_by_ua', 'A.captain_by_rank']) AS k;
-- A vessel-scoped users-access admin: non-legacy admin membership, write, DRAAK only.
SELECT tests.seed_user('A', 'A.ua_dra', 'crew');
UPDATE public.account_memberships SET legacy_managed = false, source = 'admin', kind = 'admin', users_access_level = 'write', vessel_scope = 'assigned', fleet_access = false
WHERE user_id = tests.user_id('A.ua_dra');
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT id, company_id, tests.vessel_id('A.dra') FROM public.account_memberships WHERE user_id = tests.user_id('A.ua_dra');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.master_dra'), 'admin.access.users_access.assign', tests.company_id('A'), tests.vessel_id('A.dra'))
            AND NOT public.has_capability_for(tests.user_id('A.master_dra'), 'admin.access.users_access.admin', tests.company_id('A'), tests.vessel_id('A.dra')),
                'setup: the DRAAK Master may assign on DRAAK (D-125) but is not a users-access admin');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.ua_dra'), 'admin.access.users_access.admin', tests.company_id('A'), tests.vessel_id('A.dra'))
            AND NOT public.admin_scope_all(tests.user_id('A.ua_dra'), tests.company_id('A')),
                'setup: A.ua_dra is a users-access admin of DRAAK only (not an all-vessels admin)');
SELECT tests.as_service();
SELECT tests.is(public.reserve_invitation_attempt(tests.profile_id('A.master_by_master'), tests.user_id('A.master_dra')) ->> 'code', 'master_needs_admin',
                'the DRAAK Master cannot reserve an invitation for a pending Master (master_needs_admin)');
SELECT tests.throws_like(format($q$SELECT public.record_invitation_send(%L, 'sent', NULL, NULL, %L, 'crew', NULL, %L)$q$,
                                tests.profile_id('A.master_by_master'), tests.user_id('A.master_dra'), tests.user_id('A.master_by_master')),
                         '42501', 'master_needs_admin', 'nor record a send for one (42501 master_needs_admin)');
SELECT tests.throws_like(format($q$SELECT public.record_invitation_send(%L, 'send_failed', 'provider_rejected', NULL, %L, 'crew', NULL, %L)$q$,
                                tests.profile_id('A.master_by_master'), tests.user_id('A.master_dra'), tests.user_id('A.master_by_master')),
                         '42501', 'master_needs_admin', 'nor a failed send that would link the login');
SELECT tests.is(public.reserve_invitation_attempt(tests.profile_id('A.captain_by_rank'), tests.user_id('A.master_dra')) ->> 'code', 'master_needs_admin',
                'a rank of CAPTAIN (blank position) counts as the Master office too');
SELECT tests.is((public.record_invitation_send(tests.profile_id('A.master_by_ops'), 'sent', NULL, NULL, NULL, 'crew', NULL, tests.user_id('A.master_by_ops'))).status,
                'sent', 'a send with no inviter (service / ops) keeps today''s behaviour');
SELECT tests.is((public.record_invitation_send(tests.profile_id('A.captain_by_rank'), 'sent', NULL, NULL, NULL, 'crew', NULL, tests.user_id('A.captain_by_rank'))).status,
                'sent', 'a pending profile whose rank says Captain, no inviter');
SELECT tests.is(public.fulfil_imported_assignment(tests.profile_id(v.k), v.actor), 'not_eligible', v.k || ': fulfil without a users-access admin answers not_eligible')
FROM (VALUES ('A.master_by_ops', NULL::uuid), ('A.captain_by_rank', tests.user_id('A.master_dra'))) AS v(k, actor);
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT is_imported, imported_vessel_id, position, user_id IS NOT NULL FROM public.profiles WHERE id = %L$q$, tests.profile_id('A.master_by_master')),
  format($q$VALUES (true, %L::uuid, 'Master'::text, false)$q$, tests.vessel_id('A.dra')),
  'the refused profile stays pending and unlinked (imported, the vessel waiting, the position kept, no login)');
SELECT tests.is((SELECT count(*) FROM public.user_invitations WHERE profile_id = tests.profile_id('A.master_by_master')), 0::bigint,
                'and nothing was reserved or recorded for it');
SELECT tests.as_service();
SELECT tests.ok(public.admin_may_act_on_user(tests.user_id('A.ua_dra'), NULL, tests.company_id('A'), tests.profile_id('A.master_by_master')),
                'so the DRAAK users-access admin can still act on the refused placement');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.crew_assignments WHERE user_id = tests.user_id(k)), 0::bigint, k || ': no assignment (no Master row)')
FROM unnest(ARRAY['A.master_by_master', 'A.master_by_ops', 'A.captain_by_rank']) AS k;
SELECT tests.ok(NOT public.record_is_master(tests.user_id(k), tests.vessel_id('A.dra')), k || ': record_is_master stays f')
FROM unnest(ARRAY['A.master_by_master', 'A.master_by_ops', 'A.captain_by_rank']) AS k;
SELECT tests.results_eq(
  format($q$SELECT is_imported, imported_vessel_id, position, user_id IS NOT NULL FROM public.profiles WHERE id = %L$q$, tests.profile_id('A.master_by_ops')),
  format($q$VALUES (true, %L::uuid, 'Master'::text, true)$q$, tests.vessel_id('A.dra')),
  'the no-inviter send left a linked, unfulfilled Master placement (imported, the vessel waiting, the login linked)');
-- That linked, unfulfilled placement (a NULL inviter: service role, ops)
-- is left to an all-vessels admin (admin_scope_all): admin_may_act_on_user
-- counts imported_vessel_id only for a target without a login (D-204), so
-- the DRAAK-only admin no longer reaches it. Documented, not widened.
SELECT tests.as_service();
SELECT tests.ok(public.admin_may_act_on_user(tests.user_id('A.fleet_manager'), tests.user_id('A.master_by_ops'), tests.company_id('A'), tests.profile_id('A.master_by_ops')),
                'the stranded placement: the fleet manager (admin_scope_all) may act on it');
SELECT tests.ok(NOT public.admin_may_act_on_user(tests.user_id('A.ua_dra'), tests.user_id('A.master_by_ops'), tests.company_id('A'), tests.profile_id('A.master_by_ops')),
                'the stranded placement: the DRAAK-only admin may not');
SELECT tests.is(public.reserve_invitation_attempt(tests.profile_id('A.master_by_ops'), tests.user_id('A.ua_dra')) ->> 'code', 'forbidden',
                'and so cannot resend it (forbidden)');
-- The vessel-scoped users-access admin invites a pending Master: sent, and
-- the Master assignment is created.
SELECT tests.is(public.reserve_invitation_attempt(tests.profile_id('A.master_by_ua'), tests.user_id('A.ua_dra')) ->> 'ok', 'true',
                'the DRAAK users-access admin reserves an invitation for a pending Master');
SELECT tests.is((public.record_invitation_send(tests.profile_id('A.master_by_ua'), 'sent', NULL, 'msg-ua', tests.user_id('A.ua_dra'), 'crew', NULL, tests.user_id('A.master_by_ua'))).status,
                'sent', 'and sends it');
-- The fleet manager (a users-access admin of DRAAK) appoints the Master.
SELECT tests.is((public.record_invitation_send(tests.profile_id('A.master_by_dpa'), 'sent', NULL, NULL, tests.user_id('A.fleet_manager'), 'crew', NULL, tests.user_id('A.master_by_dpa'))).status,
                'sent', 'the fleet manager invites the pending Master');
SELECT tests.is(public.fulfil_imported_assignment(tests.profile_id('A.master_by_ops'), tests.user_id('A.fleet_manager')), 'created',
                'and finishes the stranded placement the no-inviter send left');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT user_id, position, is_current, created_by FROM public.crew_assignments WHERE vessel_id = %L AND user_id IN (%L, %L, %L) ORDER BY user_id$q$,
         tests.vessel_id('A.dra'), tests.user_id('A.master_by_dpa'), tests.user_id('A.master_by_ops'), tests.user_id('A.master_by_ua')),
  format($q$SELECT * FROM (VALUES (%L::uuid, 'Master'::text, true, %L::uuid), (%L::uuid, 'Master'::text, true, %L::uuid), (%L::uuid, 'Master'::text, true, %L::uuid)) AS t ORDER BY 1$q$,
         tests.user_id('A.master_by_dpa'), tests.user_id('A.fleet_manager'), tests.user_id('A.master_by_ops'), tests.user_id('A.fleet_manager'),
         tests.user_id('A.master_by_ua'), tests.user_id('A.ua_dra')),
  'a users-access admin of the vessel gets the Master rows written (the fleet manager, the DRAAK-only admin)');
SELECT tests.ok(public.record_is_master(tests.user_id('A.master_by_dpa'), tests.vessel_id('A.dra')) AND public.record_is_master(tests.user_id('A.master_by_ua'), tests.vessel_id('A.dra')),
                'record_is_master is t for both appointments');
SELECT tests.results_eq(format($q$SELECT is_imported, imported_vessel_id FROM public.profiles WHERE id = %L$q$, tests.profile_id('A.master_by_ua')),
                        $q$VALUES (false, NULL::uuid)$q$, 'the DRAAK admin''s invitee is no longer pending');
SELECT tests.ok(position('master_needs_admin' IN pg_get_functiondef('public.record_invitation_send(uuid,text,text,text,uuid,text,timestamptz,uuid)'::regprocedure)) > 0
            AND position('master_needs_admin' IN pg_get_functiondef('public.reserve_invitation_attempt(uuid,uuid,text)'::regprocedure)) > 0,
                'both functions carry the master_needs_admin check (ledger query O)');

-- ------------------------------------------------------------ unknown ids and ACLs

SELECT tests.as_service();
SELECT tests.is(public.fulfil_imported_assignment(tests.id('profile:nobody')), 'none', 'an unknown profile: none');
SELECT tests.is(public.fulfil_imported_assignment(NULL), 'none', 'a NULL profile: none');
SELECT tests.reset_role();
SELECT tests.ok(NOT has_function_privilege(r, 'public.fulfil_imported_assignment(uuid,uuid)', 'EXECUTE'), r || ' cannot execute fulfil_imported_assignment')
FROM unnest(ARRAY['anon', 'authenticated']) AS r;
SELECT tests.ok(has_function_privilege('service_role', 'public.fulfil_imported_assignment(uuid,uuid)', 'EXECUTE'), 'service_role executes fulfil_imported_assignment');
SELECT tests.ok(NOT has_function_privilege(r, 'public.profiles_fulfil_imported_assignment()', 'EXECUTE'), 'the trigger function is not executable by ' || r)
FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r;
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws(format('SELECT public.fulfil_imported_assignment(%L)', tests.profile_id('A.foreign_vessel')), '42501', 'a browser session cannot call it (even an admin)');
SELECT tests.reset_role();
