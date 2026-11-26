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
SELECT tests.throws_like(format($q$UPDATE public.crew_assignments SET is_current = true, leave_date = NULL, end_date = NULL WHERE id = %L$q$, tests.id('assignment:A.master_dra@A.gam')),
                         '42501', 'self_assignment_refused', 'nor revive an ended assignment of their own');
-- The guard decides on the row as stored (review round 4): clearing only
-- leave_date leaves end_date, which the legacy normaliser copies back, so
-- the row would stay ended and grant nothing; it is no self-placement, and
-- rule b still refuses it because the Master does not reach GAME CHANGER.
SELECT tests.throws_like(format($q$UPDATE public.crew_assignments SET is_current = true, leave_date = NULL WHERE id = %L$q$, tests.id('assignment:A.master_dra@A.gam')),
                         '42501', 'assignment_vessel_out_of_reach', 'a half revive (end_date kept) is no self-placement, and the vessel is still out of reach');
SELECT tests.ok((SELECT NOT is_current AND leave_date = current_date - 1 FROM public.crew_assignments WHERE id = tests.id('assignment:A.master_dra@A.gam')),
                'the ended row is unchanged');
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
SELECT tests.seed_user('A', 'A.capt_dra', 'crew');
SELECT tests.seed_assignment('A.capt_dra', 'A.dra', true, 'Chief Officer', '{"rank": "Captain"}');
SELECT tests.seed_user('A', 'A.steward_dra', 'crew');
SELECT tests.seed_assignment('A.steward_dra', 'A.dra', true, 'Steward');
SELECT tests.ok(public.record_is_master(tests.user_id('A.capt_dra'), tests.vessel_id('A.dra')), 'setup: a Captain-rank row on DRAAK holds the Master office');
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
-- Ending the Master office through the dates (review round 4,
-- master-guard-bypass-via-leave-date): the legacy normaliser sets
-- is_current false once leave_date (or end_date, copied into it) has come,
-- and the guard decides on that stored row.
SELECT tests.throws_like(format($q$UPDATE public.crew_assignments SET %s WHERE id = %L$q$, v.set_clause, tests.id(v.row_key)), '42501', 'master_office_change_refused',
                         'the purser cannot end the ' || v.what)
FROM (VALUES ('leave_date = current_date - 1', 'assignment:A.master_dra@A.dra', 'Master row with leave_date yesterday'),
             ('end_date = current_date', 'assignment:A.master_dra@A.dra', 'Master row with end_date today'),
             ('leave_date = current_date - 1', 'assignment:A.capt_dra@A.dra', 'Captain-rank row with leave_date yesterday'),
             ('end_date = current_date', 'assignment:A.capt_dra@A.dra', 'Captain-rank row with end_date today')) AS v(set_clause, row_key, what);
SELECT tests.lives(format($q$UPDATE public.crew_assignments SET leave_date = current_date + 30 WHERE id = %L$q$, tests.id('assignment:A.master_dra@A.dra')),
                   'a future leave date keeps the Master current, so it is no office change');
SELECT tests.lives(format($q$UPDATE public.crew_assignments SET leave_date = NULL, end_date = NULL WHERE id = %L$q$, tests.id('assignment:A.master_dra@A.dra')),
                   'and clearing it again is none either');
SELECT tests.lives(format($q$UPDATE public.crew_assignments SET leave_date = current_date - 1 WHERE id = %L$q$, tests.id('assignment:A.steward_dra@A.dra')),
                   'the purser still ends a non-Master row by its leave date');
-- An already-ended Master row (history) is no appointment: the stored row
-- is not current, so the final rule lets an HR editor record it.
SELECT tests.lives(format($q$INSERT INTO public.crew_assignments (id, vessel_id, user_id, position, join_date, leave_date, is_current) VALUES (%L, %L, %L, 'Master', current_date - 400, current_date - 30, true)$q$,
                          tests.id('ca:deck2_master_history'), tests.vessel_id('A.dra'), tests.user_id('A.deck2_dra')),
                   'the purser records an already-ended Master row');
SELECT tests.reset_role();
SELECT tests.ok((SELECT is_current AND leave_date IS NULL AND end_date IS NULL FROM public.crew_assignments WHERE id = tests.id('assignment:A.master_dra@A.dra')),
                'the DRAAK Master row is unchanged (current, no leave or end date)');
SELECT tests.ok(public.record_is_master(tests.user_id('A.master_dra'), tests.vessel_id('A.dra')) AND public.record_is_master(tests.user_id('A.capt_dra'), tests.vessel_id('A.dra')),
                'record_is_master stays t for the Master and the Captain-rank holder');
SELECT tests.ok((SELECT NOT is_current FROM public.crew_assignments WHERE id = tests.id('assignment:A.steward_dra@A.dra')), 'the steward row is ended');
SELECT tests.ok((SELECT NOT is_current FROM public.crew_assignments WHERE id = tests.id('ca:deck2_master_history'))
                AND NOT public.record_is_master(tests.user_id('A.deck2_dra'), tests.vessel_id('A.dra')),
                'the ended Master row is stored ended and makes nobody Master');
-- A users-access admin of the vessel may make every one of these edits.
SAVEPOINT master_dates;
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format($q$UPDATE public.crew_assignments SET %s WHERE id = %L$q$, v.set_clause, tests.id(v.row_key)), 'a users-access admin ends the ' || v.what)
FROM (VALUES ('leave_date = current_date - 1', 'assignment:A.master_dra@A.dra', 'Master row with leave_date yesterday'),
             ('leave_date = current_date - 1', 'assignment:A.capt_dra@A.dra', 'Captain-rank row with leave_date yesterday')) AS v(set_clause, row_key, what);
SELECT tests.reset_role();
SELECT tests.ok(NOT public.record_is_master(tests.user_id('A.master_dra'), tests.vessel_id('A.dra')) AND NOT public.record_is_master(tests.user_id('A.capt_dra'), tests.vessel_id('A.dra')),
                'the admin''s leave dates ended both Master offices');
ROLLBACK TO SAVEPOINT master_dates;
SAVEPOINT master_dates;
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format($q$UPDATE public.crew_assignments SET %s WHERE id = %L$q$, v.set_clause, tests.id(v.row_key)), 'a users-access admin ends the ' || v.what)
FROM (VALUES ('end_date = current_date', 'assignment:A.master_dra@A.dra', 'Master row with end_date today'),
             ('end_date = current_date', 'assignment:A.capt_dra@A.dra', 'Captain-rank row with end_date today')) AS v(set_clause, row_key, what);
SELECT tests.reset_role();
SELECT tests.ok(NOT public.record_is_master(tests.user_id('A.master_dra'), tests.vessel_id('A.dra')) AND NOT public.record_is_master(tests.user_id('A.capt_dra'), tests.vessel_id('A.dra')),
                'the admin''s end dates ended both Master offices');
ROLLBACK TO SAVEPOINT master_dates;
SELECT tests.ok(public.record_is_master(tests.user_id('A.master_dra'), tests.vessel_id('A.dra')), 'setup restored: the DRAAK Master is Master again');
-- The guard stays BEFORE (review round 4): a vessel-scoped users-access
-- admin (non-legacy, DRAAK only) placing themselves on HYDRA is refused,
-- because their own new row never counts toward the reach that their
-- users_access.admin capability is scoped by.
SELECT tests.seed_user('A', 'A.ua_dra', 'crew');
SELECT tests.seed_rbac_role('A.ua_dra', 'purser', 'A.dra');
UPDATE public.account_memberships SET legacy_managed = false, source = 'admin', kind = 'admin', users_access_level = 'write', vessel_scope = 'assigned', fleet_access = false
WHERE user_id = tests.user_id('A.ua_dra');
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT id, company_id, tests.vessel_id('A.dra') FROM public.account_memberships WHERE user_id = tests.user_id('A.ua_dra');
SELECT tests.as_user(tests.user_id('A.ua_dra'));
SELECT tests.ok(public.hr_can_edit(auth.uid())
                AND public.has_capability('admin.access.users_access.admin', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability('admin.access.users_access.admin', tests.company_id('A'), tests.vessel_id('A.hyd')),
                'setup: a DRAAK-only users-access admin who is an HR editor');
SELECT tests.throws_like(format($q$INSERT INTO public.crew_assignments (vessel_id, user_id, position, join_date, is_current) VALUES (%L, auth.uid(), 'Deckhand', current_date, true)$q$, tests.vessel_id('A.hyd')),
                         '42501', 'self_assignment_refused', 'a DRAAK-only admin cannot place themselves on HYDRA (their new row grants no reach in the check)');
SELECT tests.lives(format($q$INSERT INTO public.crew_assignments (id, vessel_id, user_id, position, join_date, is_current) VALUES (%L, %L, auth.uid(), 'Supernumerary', current_date, true)$q$, tests.id('ca:ua_dra'), tests.vessel_id('A.dra')),
                   'but joins DRAAK, which they administer');
SELECT tests.reset_role();
SELECT tests.ok(NOT public.reach_vessel_for(tests.user_id('A.ua_dra'), tests.vessel_id('A.hyd')), 'the DRAAK-only admin still does not reach HYDRA');
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

-- ------------------------------------------------------------ DELETE (review round 3, crew-assignment-delete-unguarded)

-- The legacy "HR managers can delete crew assignments" policy admits every
-- vessel an HR viewer sees; the guard's rules b (the caller reaches the
-- row's vessel, or holds fleet reach / users-access admin there) and e (a
-- current Master row needs users-access admin of the vessel) apply to a
-- DELETE too. Ports scratchpad frr/repro/r1_ca_delete.sql and
-- r2sec/s2_assign_delete.sql.
-- (the service-role HYDRA row of the DRAAK Master above is removed first,
-- so the Master is again an HR editor who does not reach HYDRA)
DELETE FROM public.crew_assignments WHERE user_id = tests.user_id('A.master_dra') AND vessel_id = tests.vessel_id('A.hyd');
SELECT tests.seed_user('A', 'A.master_hyd', 'crew');
SELECT tests.seed_assignment('A.master_hyd', 'A.hyd', true, 'Master');
SELECT tests.seed_user('A', 'A.cook_dra', 'crew');
SELECT tests.seed_assignment('A.cook_dra', 'A.dra', true, 'Cook');
SELECT tests.ok(public.record_is_master(tests.user_id('A.master_hyd'), tests.vessel_id('A.hyd'))
            AND public.record_is_master(tests.user_id('A.master_dra'), tests.vessel_id('A.dra'))
            AND public.reach_vessel_for(tests.user_id('A.crew_hyd'), tests.vessel_id('A.hyd'))
            AND NOT public.reach_vessel_for(tests.user_id('A.master_dra'), tests.vessel_id('A.hyd')), 'setup: Masters of HYDRA and DRAAK, HYDRA crew reaches HYDRA, the DRAAK Master does not');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(format('DELETE FROM public.crew_assignments WHERE id = %L', tests.id('assignment:A.crew_hyd@A.hyd')), '42501', 'assignment_vessel_out_of_reach',
                         'the DRAAK Master cannot delete HYDRA''s Deckhand row');
SELECT tests.throws_like(format('DELETE FROM public.crew_assignments WHERE id = %L', tests.id('assignment:A.master_hyd@A.hyd')), '42501', 'assignment_vessel_out_of_reach',
                         'nor HYDRA''s Master row');
SELECT tests.throws_like(format('DELETE FROM public.crew_assignments WHERE vessel_id = %L', tests.vessel_id('A.hyd')), '42501', 'assignment_vessel_out_of_reach',
                         'nor every HYDRA row at once');
SELECT tests.throws_like(format('DELETE FROM public.crew_assignments WHERE id = %L', tests.id('assignment:A.master_dra@A.dra')), '42501', 'master_office_change_refused',
                         'nor the current DRAAK Master row (own vessel, no users-access admin)');
SELECT tests.lives(format('DELETE FROM public.crew_assignments WHERE id = %L', tests.id('assignment:A.cook_dra@A.dra')), 'a non-Master DRAAK row is still deleted (legacy HR administration)');
SELECT tests.reset_role();
SELECT tests.ok(public.record_is_master(tests.user_id('A.master_hyd'), tests.vessel_id('A.hyd')), 'r1 / s2: record_is_master(HYDRA Master) stays t');
SELECT tests.ok(public.reach_vessel_for(tests.user_id('A.crew_hyd'), tests.vessel_id('A.hyd')), 'r1 / s2: HYDRA crew still reach HYDRA');
SELECT tests.ok(public.record_is_master(tests.user_id('A.master_dra'), tests.vessel_id('A.dra')), 'the DRAAK Master row is still there');
SELECT tests.is((SELECT count(*) FROM public.crew_assignments WHERE vessel_id = tests.vessel_id('A.hyd') AND user_id IN (tests.user_id('A.master_hyd'), tests.user_id('A.crew_hyd'))), 2::bigint,
                'HYDRA keeps both rows');
SELECT tests.is((SELECT count(*) FROM public.crew_assignments WHERE id = tests.id('assignment:A.cook_dra@A.dra')), 0::bigint, 'the cook''s row is gone');
-- A users-access admin of the vessel removes a Master.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format('DELETE FROM public.crew_assignments WHERE id = %L', tests.id('assignment:A.master_hyd@A.hyd')), 'a users-access admin deletes a Master row');
SELECT tests.reset_role();
SELECT tests.ok(NOT public.record_is_master(tests.user_id('A.master_hyd'), tests.vessel_id('A.hyd')), 'and the office is gone');
-- The service role, no JWT and the engine flag are not limited.
SELECT tests.as_service();
SELECT tests.lives(format('DELETE FROM public.crew_assignments WHERE id = %L', tests.id('assignment:A.master_dra@A.gam')), 'the service role deletes any row');
SELECT tests.reset_role();
SELECT tests.lives(format('DELETE FROM public.crew_assignments WHERE id = %L', tests.id('assignment:A.purser_dra@A.dra')), 'no JWT (a migration) deletes any row');
SELECT tests.as_user(tests.user_id('A.captain'));
SELECT set_config('storm.access_engine', 'on', true);
SELECT tests.lives(format('DELETE FROM public.crew_assignments WHERE id = %L', tests.id('assignment:A.master_dra@A.dra')), 'storm.access_engine lets an engine definer delete a Master row');
SELECT set_config('storm.access_engine', '', true);
SELECT tests.reset_role();
-- A vessel delete (RLS-checked: vessels admin) cascades to its assignments.
SELECT tests.seed_vessel('A', 'A.scrap', 'OLD HULL');
SELECT tests.seed_user('A', 'A.scrap_master', 'crew');
SELECT tests.seed_assignment('A.scrap_master', 'A.scrap', true, 'Master');
SELECT tests.seed_assignment('A.deckhand', 'A.scrap', true, 'Deckhand');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format('DELETE FROM public.vessels WHERE id = %L', tests.vessel_id('A.scrap')), 'the fleet manager deletes a vessel with assignments (a Master row included)');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.crew_assignments WHERE vessel_id = tests.vessel_id('A.scrap')), 0::bigint, 'its assignments cascaded');
-- A profile delete (here from a session that does not reach the vessel)
-- cascades too: the parent row is already gone.
SELECT tests.seed_user('A', 'A.leaver_hyd', 'crew');
SELECT tests.seed_assignment('A.leaver_hyd', 'A.hyd', true, 'Master');
SELECT tests._set_claims(jsonb_build_object('sub', tests.user_id('A.master_dra'), 'role', 'authenticated'));
SELECT tests.lives(format('DELETE FROM public.profiles WHERE id = %L', tests.profile_id('A.leaver_hyd')), 'a profile delete cascades to its assignments');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.crew_assignments WHERE user_id = tests.user_id('A.leaver_hyd')), 0::bigint, 'its assignments are gone');
SELECT tests.ok((SELECT (tgtype & 8) <> 0 FROM pg_trigger WHERE tgrelid = 'public.crew_assignments'::regclass AND tgname = 'trg_crew_assignments_guard'), 'the guard fires on DELETE');
SELECT tests.ok((SELECT (tgtype & 2) <> 0 FROM pg_trigger WHERE tgrelid = 'public.crew_assignments'::regclass AND tgname = 'trg_crew_assignments_guard'), 'the guard is a BEFORE trigger (review round 4)');
SELECT tests.ok(position('v_new_current' IN pg_get_functiondef('public.crew_assignments_guard()'::regprocedure)) > 0, 'the guard decides on the stored is_current (review round 4)');

-- ------------------------------------------------------------ the Master office moves with the join date (D-237; review round 6)

-- record_is_master() and the office slots read crew_assignment_holds_office()
-- (D-227: the join date, else the start date, must have come), but the
-- guard decided Master before / after on crew_assignment_is_current() only,
-- so an HR editor who is no users-access admin moved the office by editing
-- join_date / start_date: a planned relief Master's join date brought to
-- today, the sitting Master's pushed out. Rule f: on a row that is a
-- current Master / Captain row before or after the update, a changed
-- coalesce(join_date, start_date) needs users-access admin of the vessel,
-- the caller's own row included. Ports scratchpad verify-mojd/repro.sql
-- and repro2.sql (on GAME CHANGER, which the rows above leave alone).
SELECT tests.seed_user('A', 'A.sitting_gam', 'crew');
SELECT tests.seed_assignment('A.sitting_gam', 'A.gam', true, 'Master', jsonb_build_object('join_date', current_date - 30));
SELECT tests.seed_user('A', 'A.relief_gam', 'crew');
SELECT tests.seed_assignment('A.relief_gam', 'A.gam', true, 'Master', jsonb_build_object('join_date', current_date + 30));
SELECT tests.seed_user('A', 'A.capt_plan_gam', 'crew');
SELECT tests.seed_assignment('A.capt_plan_gam', 'A.gam', true, 'Chief Officer', jsonb_build_object('rank', 'Captain', 'join_date', NULL, 'start_date', current_date + 30));
SELECT tests.seed_user('A', 'A.relief_self_gam', 'master');
SELECT tests.seed_assignment('A.relief_self_gam', 'A.gam', true, 'Master', jsonb_build_object('join_date', current_date + 30));
SELECT tests.seed_user('A', 'A.purser_gam', 'crew');
SELECT tests.seed_rbac_role('A.purser_gam', 'purser', 'A.gam');
SELECT tests.seed_assignment('A.purser_gam', 'A.gam', true, 'Purser');
SELECT tests.seed_user('A', 'A.cook_gam', 'crew');
SELECT tests.seed_assignment('A.cook_gam', 'A.gam', true, 'Cook', jsonb_build_object('join_date', current_date - 10));
SELECT tests.seed_user('A', 'A.old_master_gam', 'crew');
SELECT tests.seed_assignment('A.old_master_gam', 'A.gam', false, 'Master', jsonb_build_object('join_date', current_date - 400));
SELECT tests.ok(public.record_is_master(tests.user_id('A.sitting_gam'), tests.vessel_id('A.gam'))
                AND NOT public.record_is_master(tests.user_id('A.relief_gam'), tests.vessel_id('A.gam'))
                AND NOT public.record_is_master(tests.user_id('A.capt_plan_gam'), tests.vessel_id('A.gam'))
                AND NOT public.record_is_master(tests.user_id('A.relief_self_gam'), tests.vessel_id('A.gam')),
                'setup: the sitting GAME CHANGER Master holds the office; the planned reliefs do not yet');

SELECT tests.as_user(tests.user_id('A.purser_gam'));
SELECT tests.ok(public.hr_can_edit(auth.uid()) AND NOT public.has_capability('admin.access.users_access.admin', tests.company_id('A'), tests.vessel_id('A.gam')),
                'setup: the GAME CHANGER purser is an HR editor, not a users-access admin');
SELECT tests.throws_like(format($q$UPDATE public.crew_assignments SET %s WHERE id = %L$q$, v.set_clause, tests.id(v.row_key)), '42501', 'master_office_change_refused',
                         'the purser cannot ' || v.what)
FROM (VALUES ('join_date = current_date', 'assignment:A.relief_gam@A.gam', 'bring the planned relief Master''s join date to today'),
             ('join_date = current_date + 60', 'assignment:A.sitting_gam@A.gam', 'push the sitting Master''s join date out'),
             ('join_date = NULL, start_date = current_date', 'assignment:A.capt_plan_gam@A.gam', 'start a planned Captain-rank row today through the start date'),
             ('start_date = current_date, join_date = current_date', 'assignment:A.capt_plan_gam@A.gam', 'set both dates to today on the planned Captain-rank row')) AS v(set_clause, row_key, what);
SELECT tests.lives(format($q$UPDATE public.crew_assignments SET join_date = current_date - 5 WHERE id = %L$q$, tests.id('assignment:A.cook_gam@A.gam')),
                   'a join date edit on a non-Master row stays open to HR');
SELECT tests.lives(format($q$UPDATE public.crew_assignments SET join_date = current_date - 500 WHERE id = %L$q$, tests.id('assignment:A.old_master_gam@A.gam')),
                   'and on an ended Master row (history)');
SELECT tests.as_user(tests.user_id('A.relief_self_gam'));
SELECT tests.ok(public.hr_can_edit(auth.uid()) AND NOT public.has_capability('admin.access.users_access.admin', tests.company_id('A'), tests.vessel_id('A.gam')),
                'setup: the planned relief Master is an HR editor (legacy master role), not a users-access admin');
SELECT tests.throws_like(format($q$UPDATE public.crew_assignments SET join_date = current_date WHERE id = %L$q$, tests.id('assignment:A.relief_self_gam@A.gam')), '42501', 'master_office_change_refused',
                         'a planned relief Master cannot bring their own join date forward');
SELECT tests.reset_role();
SELECT tests.ok(public.record_is_master(tests.user_id('A.sitting_gam'), tests.vessel_id('A.gam'))
                AND NOT public.record_is_master(tests.user_id('A.relief_gam'), tests.vessel_id('A.gam'))
                AND NOT public.record_is_master(tests.user_id('A.capt_plan_gam'), tests.vessel_id('A.gam'))
                AND NOT public.record_is_master(tests.user_id('A.relief_self_gam'), tests.vessel_id('A.gam')),
                'record_is_master is unchanged after the refusals');
SELECT tests.results_eq(
  format($q$SELECT id, coalesce(join_date, start_date) FROM public.crew_assignments WHERE id IN (%L, %L, %L)$q$,
         tests.id('assignment:A.relief_gam@A.gam'), tests.id('assignment:A.sitting_gam@A.gam'), tests.id('assignment:A.relief_self_gam@A.gam')),
  format($q$VALUES (%L::uuid, current_date + 30), (%L::uuid, current_date - 30), (%L::uuid, current_date + 30)$q$,
         tests.id('assignment:A.relief_gam@A.gam'), tests.id('assignment:A.sitting_gam@A.gam'), tests.id('assignment:A.relief_self_gam@A.gam')),
  'the Master rows keep their join dates');
-- A users-access admin of the vessel may make each of these edits.
SAVEPOINT master_join;
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format($q$UPDATE public.crew_assignments SET %s WHERE id = %L$q$, v.set_clause, tests.id(v.row_key)), 'a users-access admin may ' || v.what)
FROM (VALUES ('join_date = current_date', 'assignment:A.relief_gam@A.gam', 'bring the relief Master''s join date to today'),
             ('join_date = current_date + 60', 'assignment:A.sitting_gam@A.gam', 'push the sitting Master''s join date out'),
             ('join_date = NULL, start_date = current_date', 'assignment:A.capt_plan_gam@A.gam', 'start the planned Captain-rank row today'),
             ('join_date = current_date', 'assignment:A.relief_self_gam@A.gam', 'bring the other relief''s join date to today')) AS v(set_clause, row_key, what);
SELECT tests.reset_role();
SELECT tests.ok(public.record_is_master(tests.user_id('A.relief_gam'), tests.vessel_id('A.gam'))
                AND NOT public.record_is_master(tests.user_id('A.sitting_gam'), tests.vessel_id('A.gam'))
                AND public.record_is_master(tests.user_id('A.capt_plan_gam'), tests.vessel_id('A.gam')),
                'the admin''s date edits moved the office');
ROLLBACK TO SAVEPOINT master_join;
SELECT tests.ok(position('join_date' IN pg_get_functiondef('public.crew_assignments_guard()'::regprocedure)) > 0, 'the guard reads the join date (D-237)');
