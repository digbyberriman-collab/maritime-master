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
SELECT tests.seed_auth_user('A.sent_crew');
SELECT tests.seed_imported('A.failed_crew', 'A.dra', '{"position": "  ", "rank": "Deck rating"}');
SELECT tests.seed_auth_user('A.failed_crew');
SELECT tests.seed_imported('A.foreign_vessel', 'B.lev');
SELECT tests.seed_auth_user('A.foreign_vessel');
SELECT tests.seed_imported('A.sold_vessel', 'A.sold');
SELECT tests.seed_auth_user('A.sold_vessel');
SELECT tests.seed_imported('A.archived_vessel', 'A.archived');
SELECT tests.seed_auth_user('A.archived_vessel');
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
