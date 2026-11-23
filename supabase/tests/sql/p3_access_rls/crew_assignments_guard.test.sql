-- No self-placement through crew_assignments (20261123010300; no
-- self-escalation, proposed D-125): reach comes from current assignments,
-- so an HR editor (a legacy Master, a user_roles captain) can neither place
-- themselves on a vessel nor place anyone on a vessel they do not reach; a
-- users-access admin can, and the service role is not limited.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user('A', 'A.captain', 'crew');                 -- user_roles captain, crew on A.hyd
SELECT tests.seed_user_role('A.captain', 'captain', 'A');
SELECT tests.seed_assignment('A.captain', 'A.hyd', true, 'Captain');
SELECT tests.seed_user('A', 'A.deckhand', 'crew');                -- no assignment yet
SELECT tests.seed_assignment('A.master_dra', 'A.gam', false, 'Master');   -- an ended assignment of the Master

SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.ok(public.hr_can_edit(auth.uid()), 'the Master is an HR editor (the legacy insert policy admits them)');
SELECT tests.ok(NOT public.user_can_reach_vessel(auth.uid(), tests.vessel_id('A.hyd')), 'the Master does not reach HYDRA');
-- a. self-placement
SELECT tests.throws_like(format($q$INSERT INTO public.crew_assignments (vessel_id, user_id, position, join_date, is_current) VALUES (%L, auth.uid(), 'Master', current_date, true)$q$, tests.vessel_id('A.hyd')),
                         '42501', 'self_assignment_refused', 'a Master cannot assign themselves to another vessel');
SELECT tests.throws_like(format($q$INSERT INTO public.crew_assignments (vessel_id, user_id, position, join_date, is_current) VALUES (%L, auth.uid(), 'Master', current_date, true)$q$, tests.vessel_id('A.dra')),
                         '42501', 'self_assignment_refused', 'nor add a second row on their own vessel');
SELECT tests.throws_like(format($q$UPDATE public.crew_assignments SET vessel_id = %L WHERE user_id = auth.uid() AND is_current$q$, tests.vessel_id('A.gam')),
                         '42501', 'self_assignment_refused', 'nor move their own assignment to another vessel');
SELECT tests.throws_like(format($q$UPDATE public.crew_assignments SET is_current = true, leave_date = NULL WHERE id = %L$q$, tests.id('assignment:A.master_dra@A.gam')),
                         '42501', 'self_assignment_refused', 'nor revive an ended assignment of their own');
SELECT tests.lives($q$UPDATE public.crew_assignments SET notes = 'Watch schedule agreed' WHERE user_id = auth.uid() AND is_current$q$, 'an own-row edit that grants no reach and changes no office is still allowed');
-- b. placing someone else needs reach of the vessel
SELECT tests.throws_like(format($q$INSERT INTO public.crew_assignments (vessel_id, user_id, position, join_date, is_current) VALUES (%L, %L, 'Deckhand', current_date, true)$q$, tests.vessel_id('A.hyd'), tests.user_id('A.deckhand')),
                         '42501', 'assignment_vessel_out_of_reach', 'a Master cannot place someone on a vessel they do not reach');
SELECT tests.throws_like(format($q$UPDATE public.crew_assignments SET vessel_id = %L WHERE id = %L$q$, tests.vessel_id('A.dra'), tests.id('assignment:A.crew_hyd@A.hyd')),
                         '42501', 'assignment_vessel_out_of_reach', 'nor pull someone''s row from a vessel they do not reach');
SELECT tests.lives(format($q$INSERT INTO public.crew_assignments (id, vessel_id, user_id, position, join_date, is_current) VALUES (%L, %L, %L, 'Deckhand', current_date, true)$q$, tests.id('ca:deckhand'), tests.vessel_id('A.dra'), tests.user_id('A.deckhand')),
                   'a Master places a deckhand on their own vessel (D-125)');
-- c. re-pointing someone else's row to yourself
SELECT tests.throws_like(format($q$UPDATE public.crew_assignments SET user_id = auth.uid() WHERE id = %L$q$, tests.id('ca:deckhand')),
                         '42501', 'self_assignment_refused', 'nor re-point someone else''s row to themselves');
-- The verify-csr controls hold.
SELECT tests.throws(format($q$INSERT INTO public.crew_assignments (vessel_id, user_id, position, join_date, is_current) VALUES (%L, auth.uid(), 'Master', current_date, true)$q$, tests.vessel_id('B.lev')),
                    '42501', 'nor on another company''s vessel');
SELECT tests.ok(NOT public.user_can_reach_vessel(auth.uid(), tests.vessel_id('A.hyd')) AND NOT public.user_can_reach_vessel(auth.uid(), tests.vessel_id('A.gam')), 'the Master''s reach is unchanged');
SELECT tests.ok(NOT public.has_capability('admin.access.users_access.assign', tests.company_id('A'), tests.vessel_id('A.hyd')), 'and so is the assign capability');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.crew_assignments WHERE user_id = tests.user_id('A.master_dra') AND is_current), 1::bigint, 'the Master still has exactly one current assignment');

-- A user_roles captain (HR editor through has_any_role).
SELECT tests.as_user(tests.user_id('A.captain'));
SELECT tests.ok(public.hr_can_edit(auth.uid()), 'the captain is an HR editor');
SELECT tests.throws_like(format($q$INSERT INTO public.crew_assignments (vessel_id, user_id, position, join_date, is_current) VALUES (%L, auth.uid(), 'Captain', current_date, true)$q$, tests.vessel_id('A.dra')),
                         '42501', 'self_assignment_refused', 'a captain cannot assign themselves to another vessel');
SELECT tests.throws_like(format($q$UPDATE public.crew_assignments SET vessel_id = %L WHERE user_id = auth.uid() AND is_current$q$, tests.vessel_id('A.gam')),
                         '42501', 'self_assignment_refused', 'nor move their own assignment');
SELECT tests.reset_role();

-- Crew (no HR edit) are refused by the legacy policy as before.
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.throws(format($q$INSERT INTO public.crew_assignments (vessel_id, user_id, position, join_date, is_current) VALUES (%L, auth.uid(), 'Deckhand', current_date, true)$q$, tests.vessel_id('A.dra')),
                    '42501', 'crew cannot insert an assignment');
SELECT tests.reset_role();

-- A users-access admin (the DPA) may join a vessel as crew and place anyone.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format($q$INSERT INTO public.crew_assignments (id, vessel_id, user_id, position, join_date, is_current) VALUES (%L, %L, auth.uid(), 'Supernumerary', current_date, true)$q$, tests.id('ca:fm'), tests.vessel_id('A.hyd')),
                   'an admin self-join is allowed');
SELECT tests.lives(format($q$UPDATE public.crew_assignments SET vessel_id = %L WHERE id = %L$q$, tests.vessel_id('A.gam'), tests.id('ca:deckhand')), 'the admin moves an assignment between company vessels');
SELECT tests.reset_role();

-- Offices (review round 2, crew-assignment-office-self-promotion): the
-- signature offices read crew_assignments.position / rank (D-132 interim),
-- so an HR editor never retitles their own row, and only a users-access
-- admin of the vessel appoints, removes or moves a Master.
SELECT tests.seed_user('A', 'A.purser_dra', 'crew');
SELECT tests.seed_rbac_role('A.purser_dra', 'purser', 'A.dra');
SELECT tests.seed_assignment('A.purser_dra', 'A.dra', true, 'Purser');
SELECT tests.seed_user('A', 'A.deck_dra', 'crew');
SELECT tests.seed_assignment('A.deck_dra', 'A.dra', true, 'Deckhand');
SELECT tests.seed_user('A', 'A.deck2_dra', 'crew');
SELECT tests.as_user(tests.user_id('A.purser_dra'));
SELECT tests.ok(public.hr_can_edit(auth.uid()) AND NOT public.has_capability('admin.access.users_access.admin', tests.company_id('A'), tests.vessel_id('A.dra')),
                'the purser is an HR editor, not a users-access admin');
SELECT tests.throws_like(format($q$UPDATE public.crew_assignments SET %s WHERE user_id = auth.uid() AND is_current$q$, v.set_clause), '42501', 'self_office_change_refused', 'the purser cannot set their own ' || v.what)
FROM (VALUES ($s$position = 'Master'$s$, 'position Master'), ($s$rank = 'Captain'$s$, 'rank Captain'), ($s$position = 'Chief Engineer'$s$, 'position Chief Engineer')) AS v(set_clause, what);
SELECT tests.throws_like(format($q$UPDATE public.crew_assignments SET rank = 'Captain' WHERE id = %L$q$, tests.id('assignment:A.deck_dra@A.dra')), '42501', 'master_office_change_refused',
                         'nor set rank Captain on a deckhand');
SELECT tests.throws_like(format($q$INSERT INTO public.crew_assignments (vessel_id, user_id, position, join_date, is_current) VALUES (%L, %L, 'Master', current_date, true)$q$, tests.vessel_id('A.dra'), tests.user_id('A.deck2_dra')),
                         '42501', 'master_office_change_refused', 'nor place a colleague as Master');
SELECT tests.throws_like(format($q$UPDATE public.crew_assignments SET position = 'Deckhand' WHERE id = %L$q$, tests.id('assignment:A.master_dra@A.dra')), '42501', 'master_office_change_refused',
                         'nor remove the real Master');
SELECT tests.lives(format($q$UPDATE public.crew_assignments SET position = 'Bosun' WHERE id = %L$q$, tests.id('assignment:A.deck_dra@A.dra')), 'an HR editor still retitles a deckhand (no office of their own, not Master)');
SELECT tests.reset_role();
SELECT tests.ok(NOT public.record_is_master(tests.user_id('A.purser_dra'), tests.vessel_id('A.dra')) AND NOT public.record_is_master(tests.user_id('A.deck_dra'), tests.vessel_id('A.dra')),
                'nobody new is Master of DRAAK');
-- A users-access admin of the vessel may.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format($q$UPDATE public.crew_assignments SET position = 'Master' WHERE id = %L$q$, tests.id('ca:fm')), 'a users-access admin changes their own office');
SELECT tests.lives(format($q$UPDATE public.crew_assignments SET rank = 'Captain' WHERE id = %L$q$, tests.id('assignment:A.deck_dra@A.dra')), 'and appoints a Captain');
SELECT tests.reset_role();

-- The service role (admin-actions, create-crew-member) is not limited.
SELECT tests.as_service();
SELECT tests.lives(format($q$INSERT INTO public.crew_assignments (vessel_id, user_id, position, join_date, is_current) VALUES (%L, %L, 'Master', current_date, true)$q$, tests.vessel_id('A.hyd'), tests.user_id('A.master_dra')),
                   'the service role writes any assignment');
SELECT tests.lives(format($q$UPDATE public.crew_assignments SET rank = 'Master' WHERE id = %L$q$, tests.id('assignment:A.purser_dra@A.dra')), 'and any office');
SELECT tests.reset_role();
SELECT tests.ok(public.reach_vessel_for(tests.user_id('A.master_dra'), tests.vessel_id('A.hyd')), 'and that one grants reach');

-- With the engine flag (this phase's definers) the guard steps aside.
SELECT tests.as_user(tests.user_id('A.captain'));
SELECT set_config('storm.access_engine', 'on', true);
SELECT tests.lives(format($q$UPDATE public.crew_assignments SET position = 'Relief captain' WHERE id = %L$q$, tests.id('assignment:A.captain@A.hyd')), 'storm.access_engine lets an engine definer write');
SELECT set_config('storm.access_engine', '', true);
SELECT tests.reset_role();

SELECT tests.ok(NOT has_function_privilege(r, 'public.crew_assignments_guard()', 'EXECUTE'), 'the guard is not executable by ' || r)
FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r;
SELECT tests.ok((SELECT prosecdef AND proconfig @> ARRAY['search_path=public'] FROM pg_proc WHERE oid = 'public.crew_assignments_guard()'::regprocedure), 'the guard is SECURITY DEFINER with search_path');
