-- A crew assignment counts as current only while is_current is set and its
-- leave date (else end date) has not come (review round 5,
-- stale-is-current-keeps-reach; D-217, D-227): crew_assignment_is_current()
-- in every build-out reader, crew_assignment_holds_office() for the Master
-- office (which also waits for the join date). A row that still says
-- is_current after its leave date passed (the legacy normaliser flips the
-- flag only when the row is written) gives no reach, no Master office, no
-- office-slot eligibility and no storage write; touching it is no Master
-- office change; crew_assignments_end_stale() (service role) sweeps the
-- stored flag. Ports scratchpad r4sec/a4_stale_is_current.sql and
-- verify-stale/natural.sql.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user('A', 'A.exmaster', 'crew');
SELECT tests.seed_user('A', 'A.future_master', 'crew');
SELECT tests.seed_user('A', 'A.crew_gam', 'crew');
SELECT tests.seed_assignment('A.crew_gam', 'A.gam', true, 'Deckhand');
-- A non-admin HR editor on GAME CHANGER (a user_roles captain; no users-access admin).
SELECT tests.seed_user('A', 'A.hr_gam', 'crew');
SELECT tests.seed_user_role('A.hr_gam', 'captain', 'A');
SELECT tests.seed_assignment('A.hr_gam', 'A.gam', true, 'Bosun');

-- A Master placement written 25 days ago with a sign-off 5 days ago: the
-- normaliser kept is_current true then (the leave date was ahead). The
-- harness cannot move the clock, so the row is written as it stands today
-- with the normaliser off for this one statement (rolled back with the test).
ALTER TABLE public.crew_assignments DISABLE TRIGGER trg_crew_assignments_normalise_dates;
INSERT INTO public.crew_assignments (id, user_id, vessel_id, position, join_date, start_date, leave_date, end_date, is_current)
VALUES (tests.id('ca:stale-master'), tests.user_id('A.exmaster'), tests.vessel_id('A.gam'), 'Master', current_date - 25, current_date - 25, current_date - 5, current_date - 5, true);
ALTER TABLE public.crew_assignments ENABLE TRIGGER trg_crew_assignments_normalise_dates;
-- A planned Master: is_current true, joining in 30 days (normaliser on).
INSERT INTO public.crew_assignments (id, user_id, vessel_id, position, join_date, start_date, is_current)
VALUES (tests.id('ca:future-master'), tests.user_id('A.future_master'), tests.vessel_id('A.gam'), 'Master', current_date + 30, current_date + 30, true);

SELECT tests.ok((SELECT is_current AND leave_date <= current_date FROM public.crew_assignments WHERE id = tests.id('ca:stale-master')),
                'setup: the stale Master row still says is_current although its leave date has passed');

-- ------------------------------------------------------------ the helpers

SELECT tests.results_eq(
  $q$SELECT n, public.crew_assignment_is_current(c, l, e) FROM (VALUES
       (1, true, NULL::date, NULL::date), (2, false, NULL, NULL), (3, NULL, NULL, NULL),
       (4, true, current_date, NULL), (5, true, current_date + 1, NULL), (6, true, NULL, current_date - 1),
       (7, true, current_date + 1, current_date - 1), (8, true, NULL, current_date + 1)) AS t(n, c, l, e)$q$,
  $q$VALUES (1, true), (2, false), (3, false), (4, false), (5, true), (6, false), (7, true), (8, true)$q$,
  'crew_assignment_is_current: is_current and coalesce(leave, end) not come (D-217)');
SELECT tests.results_eq(
  $q$SELECT n, public.crew_assignment_holds_office(c, j, s, l, e) FROM (VALUES
       (1, true, current_date - 1, NULL::date, NULL::date, NULL::date), (2, true, current_date, NULL, NULL, NULL),
       (3, true, current_date + 1, NULL, NULL, NULL), (4, true, NULL, current_date + 1, NULL, NULL),
       (5, true, NULL, NULL, NULL, NULL), (6, true, current_date - 10, NULL, current_date - 1, NULL)) AS t(n, c, j, s, l, e)$q$,
  $q$VALUES (1, true), (2, true), (3, false), (4, false), (5, true), (6, false)$q$,
  'crew_assignment_holds_office: current and joined (join, else start, has come; D-227)');

-- ------------------------------------------------------------ a stale Master row gives nothing

SELECT tests.ok(NOT public.reach_vessel_for(tests.user_id('A.exmaster'), tests.vessel_id('A.gam')), 'reach_vessel_for: false for the stale Master row');
SELECT tests.ok(NOT (tests.vessel_id('A.gam') IN (SELECT public.reach_vessels_for(tests.user_id('A.exmaster')))), 'reach_vessels_for: the vessel is not in the set');
SELECT tests.ok(NOT public.record_is_master(tests.user_id('A.exmaster'), tests.vessel_id('A.gam')), 'record_is_master: false');
SELECT tests.ok(public.record_is_master(tests.user_id('A.master_dra'), tests.vessel_id('A.dra')), 'control: the current DRAAK Master is the Master');

INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, capability_path, company_step, edit_after_sign, delete_rule, slot_template)
VALUES ('test.stale', 'test', 'Stale test', 'STL', 'vessel', 'vessel.test.stale', 'acknowledge', 'lock', 'draft_only', jsonb_build_array(
  jsonb_build_object('key', 'crew', 'label', 'Crew', 'order', 1, 'party', 'vessel'),
  jsonb_build_object('key', 'master', 'label', 'Master', 'order', 2, 'party', 'vessel', 'office_key', 'master')));
CREATE FUNCTION tests.st_slot(p_env uuid, p_key text) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id FROM public.record_signature_slots WHERE envelope_id = p_env AND cycle = 1 AND slot_key = p_key
$$;
GRANT EXECUTE ON FUNCTION tests.st_slot(uuid, text) TO PUBLIC;
SELECT tests.as_user(tests.user_id('A.crew_gam'));
SELECT (public.record_open_envelope('test.stale', tests.vessel_id('A.gam'), NULL, 'stale office')).id AS env \gset
SELECT tests.is(public.record_sign_slot(tests.id('sig:st:crew'), tests.st_slot(:'env', 'crew'), 'verified') ->> 'ok', 'true', 'setup: the crew member signs the first slot');
SELECT tests.reset_role();
SELECT tests.ok(NOT public.record_slot_eligible(tests.st_slot(:'env', 'master'), tests.profile_id('A.exmaster')),
                'record_slot_eligible: the stale Master row does not hold the Master office slot');
SELECT tests.ok(NOT public.record_slot_eligible(tests.st_slot(:'env', 'master'), tests.profile_id('A.future_master')),
                'nor does a Master row that has not joined yet (D-227)');

SELECT tests.as_user(tests.user_id('A.exmaster'));
SELECT tests.ok(NOT public.user_can_reach_vessel(auth.uid(), tests.vessel_id('A.gam')), 'user_can_reach_vessel: false, signed in as the former Master');
SELECT tests.ok(NOT public.storage_path_allowed('records',
                  tests.company_id('A') || '/' || tests.vessel_id('A.gam') || '/test/stale/' || :'env' || '/00000000-0000-4000-8000-000000000001-a.pdf', true),
                'storage_path_allowed(write): false');
SELECT tests.is((SELECT count(*) FROM public.vessels WHERE id = tests.vessel_id('A.gam')), 0::bigint, 'the vessel row is invisible');
SELECT tests.throws(format($q$SELECT public.record_sign_slot(%L, %L, 'verified')$q$, tests.id('sig:st:ex'), tests.st_slot(:'env', 'master')),
                    '42501', 'record_sign_slot on the Master slot is refused (record_access_denied: no reach)');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.record_signatures WHERE envelope_id = :'env' AND slot_key = 'master'), 0::bigint, 'the Master slot stays unsigned');

-- A planned Master reaches the vessel (legacy reach of a planned rotation)
-- but holds no Master office before the join date (D-227).
SELECT tests.ok(public.reach_vessel_for(tests.user_id('A.future_master'), tests.vessel_id('A.gam')), 'a future-join Master row: reach is true');
SELECT tests.ok(NOT public.record_is_master(tests.user_id('A.future_master'), tests.vessel_id('A.gam')), 'and record_is_master is false');

-- ------------------------------------------------------------ touching a stale Master row is no office change

SELECT tests.as_user(tests.user_id('A.hr_gam'));
SELECT tests.ok(public.hr_can_edit(auth.uid()) AND NOT public.has_capability('admin.access.users_access.admin', tests.company_id('A'), tests.vessel_id('A.gam')),
                'setup: an HR editor of GAME CHANGER who is no users-access admin');
SELECT tests.lives(format($q$UPDATE public.crew_assignments SET notes = 'Signed off' WHERE id = %L$q$, tests.id('ca:stale-master')),
                   'a non-admin UPDATE of notes on the stale Master row is not refused (it holds no office any more)');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT notes, is_current FROM public.crew_assignments WHERE id = %L$q$, tests.id('ca:stale-master')),
                        $q$VALUES ('Signed off'::text, false)$q$, 'the note is stored and the normaliser ends the row on that write');
-- The Master office of a current row is still guarded.
SELECT tests.as_user(tests.user_id('A.hr_gam'));
SELECT tests.throws_like(format($q$UPDATE public.crew_assignments SET position = 'Master' WHERE id = %L$q$, tests.id('assignment:A.crew_gam@A.gam')),
                         '42501', 'master_office_change_refused', 'control: appointing a current Master still needs a users-access admin');
SELECT tests.reset_role();

-- ------------------------------------------------------------ the date line (normaliser on)

-- verify-stale/natural.sql: a Master row written west of the date line with
-- a sign-off tomorrow is stored is_current (correct there); east of the
-- date line, at the same instant, the calendar day has reached the leave
-- date. The read side follows the calendar day, not the stored flag.
SELECT current_setting('TimeZone') AS tz0 \gset
SELECT tests.seed_user('A', 'A.dateline', 'crew');
SELECT set_config('TimeZone', 'Etc/GMT+12', true);
INSERT INTO public.crew_assignments (id, user_id, vessel_id, position, join_date, start_date, leave_date, end_date, is_current)
VALUES (tests.id('ca:dateline'), tests.user_id('A.dateline'), tests.vessel_id('A.hyd'), 'Master', current_date - 25, current_date - 25, current_date + 1, current_date + 1, true);
SELECT tests.ok((SELECT is_current FROM public.crew_assignments WHERE id = tests.id('ca:dateline')), 'west of the date line the row is stored current');
SELECT tests.ok(public.reach_vessel_for(tests.user_id('A.dateline'), tests.vessel_id('A.hyd')) AND public.record_is_master(tests.user_id('A.dateline'), tests.vessel_id('A.hyd')),
                'and reaches the vessel as its Master there');
SELECT set_config('TimeZone', 'Etc/GMT-14', true);
SELECT tests.ok((SELECT is_current AND leave_date <= current_date FROM public.crew_assignments WHERE id = tests.id('ca:dateline')),
                'east of the date line the leave date has come while the stored flag still says current');
SELECT tests.ok(NOT public.reach_vessel_for(tests.user_id('A.dateline'), tests.vessel_id('A.hyd')), 'reach_vessel_for follows the calendar day: false');
SELECT tests.ok(NOT public.record_is_master(tests.user_id('A.dateline'), tests.vessel_id('A.hyd')), 'record_is_master: false');
SELECT tests.as_user(tests.user_id('A.dateline'));
SELECT tests.is((SELECT count(*) FROM public.vessels WHERE id = tests.vessel_id('A.hyd')), 0::bigint, 'and the vessel row is invisible to them');
SELECT tests.reset_role();

-- ------------------------------------------------------------ the daily sweep (service role)

SELECT count(*) AS stale_n FROM public.crew_assignments WHERE is_current AND coalesce(leave_date, end_date) <= current_date \gset
SELECT count(*) AS current_n FROM public.crew_assignments WHERE is_current \gset
SELECT tests.ok(:'stale_n'::integer >= 1, format('setup: %s stale row(s) still say is_current (the date-line row east of the line)', :'stale_n'));
SELECT tests.as_user(tests.user_id('A.crew_gam'));
SELECT tests.throws($q$SELECT public.crew_assignments_end_stale()$q$, '42501', 'crew_assignments_end_stale: 42501 for a crew JWT');
SELECT tests.reset_role();
SELECT tests.as_service();
SELECT public.crew_assignments_end_stale() AS ended \gset
SELECT tests.reset_role();
SELECT tests.is(:'ended'::integer, :'stale_n'::integer, 'run as the service role it ends exactly the stale rows and returns their count');
SELECT tests.is((SELECT count(*) FROM public.crew_assignments WHERE is_current AND coalesce(leave_date, end_date) <= current_date), 0::bigint, 'no stale row is left');
SELECT tests.is((SELECT count(*) FROM public.crew_assignments WHERE is_current), (:'current_n'::integer - :'stale_n'::integer)::bigint, 'every other current row is untouched');
SELECT tests.ok((SELECT NOT is_current FROM public.crew_assignments WHERE id = tests.id('ca:dateline')), 'the date-line row is ended');
SELECT set_config('TimeZone', :'tz0', true);
SELECT tests.as_service();
SELECT tests.is(public.crew_assignments_end_stale(), 0, 'a second sweep ends nothing');
SELECT tests.reset_role();

SELECT tests.ok(has_function_privilege('service_role', 'public.crew_assignments_end_stale()', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.crew_assignments_end_stale()', 'EXECUTE')
                AND NOT has_function_privilege('anon', 'public.crew_assignments_end_stale()', 'EXECUTE'),
                'crew_assignments_end_stale: service role only');
SELECT tests.ok(NOT has_function_privilege('authenticated', 'public.crew_assignment_is_current(boolean,date,date)', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.crew_assignment_holds_office(boolean,date,date,date,date)', 'EXECUTE'),
                'the predicate helpers are granted to nobody (definers call them)');
