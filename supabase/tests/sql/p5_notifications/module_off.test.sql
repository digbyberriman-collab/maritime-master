-- Switching a module off on a vessel removes its notifications there
-- (review round 5, notify-ignores-module-off; gap/01 W6, D-162):
-- notification_recipients() asks vessel_module_on_internal() (the
-- module_enabled() rule without the caller clause) for an event with a
-- vessel and a module key, so an off module fans out zero inbox rows and
-- the outbox row is still marked processed (nothing is claimed as
-- delivered). Parents count (technical off suppresses technical.jobs), a
-- future enabled_from suppresses and today's allows, another vessel with
-- the module on still notifies, a company actor without vessel reach still
-- notifies when the module is on (the internal variant, not the caller's),
-- and a personal-scope link (export_ready) still reaches its requester.
-- The record-engine path (record_events -> record_event_notify) follows.
-- Ports scratchpad review-complete/module_off_notify.sql and
-- verify-modoff/record_event_path.sql.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user('A', 'A.crew_dra', 'crew');
SELECT tests.seed_assignment('A.crew_dra', 'A.dra', true, 'Deckhand');
SELECT tests.seed_user('A', 'A.crew_hyd2', 'crew');
SELECT tests.seed_assignment('A.crew_hyd2', 'A.hyd', true, 'Deckhand');
-- A company actor without vessel reach: a crew profile with a user_roles dpa
-- row of its own company (legacy_user_admin) and no assignment.
SELECT tests.seed_user('A', 'A.office_dpa', 'crew');
SELECT tests.seed_user_role('A.office_dpa', 'dpa', 'A');

INSERT INTO public.vessel_module_settings (vessel_id, company_id, module_key, enabled, enabled_from) VALUES
  (tests.vessel_id('A.dra'), tests.company_id('A'), 'safety', false, NULL),
  (tests.vessel_id('A.dra'), tests.company_id('A'), 'technical', false, NULL),
  (tests.vessel_id('A.dra'), tests.company_id('A'), 'charter', true, current_date + 10),
  (tests.vessel_id('A.dra'), tests.company_id('A'), 'voyage', true, current_date);

CREATE FUNCTION tests.mo_emit(p_type text, p_scope text, p_vessel uuid, p_module text, p_dedupe text,
                              p_must uuid[] DEFAULT '{}', p_audience text[] DEFAULT ARRAY['vessel_members', 'owner_admins'])
RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  -- A definer calling emit inside the current session (auth.uid() stays the caller's).
  SELECT public.emit_notification_event(p_type_key := p_type, p_company_id := tests.company_id('A'), p_title := 'Module gate probe',
    p_link_scope := p_scope, p_vessel_id := p_vessel, p_must_act_user_ids := p_must, p_audience := p_audience,
    p_dedupe_key := p_dedupe, p_module_key := p_module)
$$;
CREATE FUNCTION tests.mo_rows(p_outbox uuid) RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$
  SELECT count(*) FROM public.notification_inbox WHERE outbox_id = p_outbox
$$;
GRANT EXECUTE ON FUNCTION tests.mo_emit(text, text, uuid, text, text, uuid[], text[]), tests.mo_rows(uuid) TO PUBLIC;

SELECT tests.ok(NOT public.module_enabled(tests.vessel_id('A.dra'), 'safety') AND NOT public.vessel_module_on_internal(tests.vessel_id('A.dra'), 'safety'),
                'setup: safety is off on DRAAK');

-- ------------------------------------------------------------ (a) module off: no inbox row, the outbox row processed

SELECT tests.as_service();
SELECT tests.mo_emit('record_update_posted', 'vessel', tests.vessel_id('A.dra'), 'safety', 'mo:a') AS ob_a \gset
SELECT tests.reset_role();
SELECT tests.is(tests.mo_rows(:'ob_a'), 0::bigint, '(a) an event of a module that is off on the vessel fans out 0 inbox rows');
SELECT tests.ok((SELECT processed_at IS NOT NULL AND last_error IS NULL FROM public.notification_outbox WHERE id = :'ob_a'), '(a) and the outbox row is marked processed, with no error');

-- ------------------------------------------------------------ (b) a parent off suppresses its children

SELECT tests.as_service();
SELECT tests.mo_emit('record_update_posted', 'vessel', tests.vessel_id('A.dra'), 'technical.jobs', 'mo:b') AS ob_b \gset
SELECT tests.reset_role();
SELECT tests.is(tests.mo_rows(:'ob_b'), 0::bigint, '(b) technical off suppresses technical.jobs');

-- ------------------------------------------------------------ (c) enabled_from: in the future suppresses, today allows

SELECT tests.as_service();
SELECT tests.mo_emit('record_update_posted', 'vessel', tests.vessel_id('A.dra'), 'charter', 'mo:c1') AS ob_c1 \gset
SELECT tests.mo_emit('record_update_posted', 'vessel', tests.vessel_id('A.dra'), 'voyage', 'mo:c2') AS ob_c2 \gset
SELECT tests.reset_role();
SELECT tests.is(tests.mo_rows(:'ob_c1'), 0::bigint, '(c) a module on from a future date notifies nobody yet');
SELECT tests.ok(tests.mo_rows(:'ob_c2') >= 2, format('(c) a module on from today notifies (%s rows)', tests.mo_rows(:'ob_c2')));

-- ------------------------------------------------------------ (d) another vessel with the module on still notifies

SELECT tests.as_service();
SELECT tests.mo_emit('record_update_posted', 'vessel', tests.vessel_id('A.hyd'), 'safety', 'mo:d') AS ob_d \gset
SELECT tests.reset_role();
SELECT tests.ok(tests.mo_rows(:'ob_d') >= 1, format('(d) safety on HYDRA still notifies (%s rows)', tests.mo_rows(:'ob_d')));
SELECT tests.ok((SELECT bool_or(user_id = tests.user_id('A.crew_hyd2')) FROM public.notification_inbox WHERE outbox_id = :'ob_d'),
                '(d) including HYDRA''s crew');

-- ------------------------------------------------------------ (e) a company actor without reach emits: the internal rule decides

SELECT tests.ok(public.is_company_actor(tests.user_id('A.office_dpa'), tests.vessel_id('A.hyd'))
                AND NOT public.reach_vessel_for(tests.user_id('A.office_dpa'), tests.vessel_id('A.hyd'))
                AND NOT public.fleet_reach_for(tests.user_id('A.office_dpa'), tests.company_id('A')),
                'setup: the office DPA is a company actor for HYDRA without reach to it');
SELECT tests.as_user(tests.user_id('A.office_dpa'));
SELECT tests.ok(NOT public.module_enabled(tests.vessel_id('A.hyd'), 'safety'), 'setup: for that caller the caller-scoped module_enabled() says no (no reach)');
SELECT tests.mo_emit('record_update_posted', 'vessel', tests.vessel_id('A.hyd'), 'safety', 'mo:e', '{}', ARRAY['vessel_members']) AS ob_e \gset
SELECT tests.reset_role();
SELECT tests.ok((SELECT bool_or(user_id = tests.user_id('A.crew_hyd2')) FROM public.notification_inbox WHERE outbox_id = :'ob_e'),
                '(e) the module is on for HYDRA, so its crew are notified (vessel_module_on_internal, not the emitter''s view)');

-- ------------------------------------------------------------ (f) a personal-scope link reaches its requester

SELECT tests.as_service();
SELECT tests.mo_emit('export_ready', 'personal', tests.vessel_id('A.dra'), 'safety', 'mo:f', ARRAY[tests.user_id('A.crew_dra')], '{}') AS ob_f \gset
SELECT tests.reset_role();
SELECT tests.results_eq(format('SELECT user_id FROM public.notification_inbox WHERE outbox_id = %L', :'ob_f'),
                        format('VALUES (%L::uuid)', tests.user_id('A.crew_dra')),
                        '(f) a personal-scope export_ready on a vessel whose module is off still reaches the requester');

-- ------------------------------------------------------------ the record-engine path and the controls

SELECT set_config('storm.record_engine', 'on', true);
INSERT INTO public.record_events (company_id, vessel_id, module_key, action, party, notification_type, reference)
VALUES (tests.company_id('A'), tests.vessel_id('A.dra'), 'safety', 'thread.update', 'company', 'record_update_posted', 'SAF-DRA-2026-0002'),
       (tests.company_id('A'), tests.vessel_id('A.dra'), 'chartering', 'thread.update', 'company', 'record_update_posted', 'CHA-DRA-2026-0001');
SELECT set_config('storm.record_engine', '', true);
SELECT tests.is((SELECT count(*) FROM public.notification_inbox AS i JOIN public.notification_outbox AS o ON o.id = i.outbox_id
                 WHERE o.module_key = 'safety' AND o.vessel_id = tests.vessel_id('A.dra') AND o.dedupe_key LIKE 'event:%'),
                0::bigint, 'a record event of the off module notifies nobody (record_event_notify)');
SELECT tests.ok((SELECT count(*) FROM public.notification_inbox AS i JOIN public.notification_outbox AS o ON o.id = i.outbox_id
                 WHERE o.module_key = 'chartering' AND o.vessel_id = tests.vessel_id('A.dra') AND o.dedupe_key LIKE 'event:%') >= 2,
                'control: the same event of a module that is on still notifies (DPA and Master)');
SELECT tests.as_service();
SELECT tests.mo_emit('record_update_posted', 'vessel', tests.vessel_id('A.dra'), NULL, 'mo:nokey') AS ob_nokey \gset
SELECT tests.mo_emit('record_update_posted', 'fleet', NULL, 'safety', 'mo:fleet', '{}', ARRAY['fleet_reach']) AS ob_fleet \gset
SELECT tests.reset_role();
SELECT tests.ok(tests.mo_rows(:'ob_nokey') >= 2, 'control: an event without a module key is not gated');
SELECT tests.ok(tests.mo_rows(:'ob_fleet') >= 1, 'control: a fleet event (no vessel) is not gated');
