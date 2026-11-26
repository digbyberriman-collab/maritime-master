-- personal_data_exported reaches the company's DPA (D-238; gap/08 §N;
-- review round 6, seeded-notification-types-no-emitter): a second AFTER
-- INSERT trigger on record_events (trg_record_events_personal_data) emits
-- it for an export_job event logged (a browser export) or made ready (a
-- server export) whose payload says contains_personal_data. Audience dpa,
-- a fleet link with no vessel (no module-off rule applies), never the
-- actor, never another company. A non-personal export notifies nobody; a
-- server export that moves to ready still sends export_ready to its
-- requester as well.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user('A', 'A.crew_dra', 'crew');
SELECT tests.seed_assignment('A.crew_dra', 'A.dra', true, 'Deckhand');
SELECT tests.seed_user('A', 'A.crew_dra2', 'crew');
SELECT tests.seed_assignment('A.crew_dra2', 'A.dra', true, 'Bosun');
SELECT tests.seed_user('B', 'B.crew', 'crew');
SELECT tests.seed_assignment('B.crew', 'B.lev', true, 'Deckhand');
-- A second DPA of A, who exports personal data themselves below.
SELECT tests.seed_user('A', 'A.dpa2', 'dpa');

CREATE TEMP TABLE pde_people (k text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO pde_people VALUES ('A.fleet_manager'), ('A.dpa2'), ('A.master_dra'), ('A.crew_dra'), ('A.crew_dra2'), ('A.crew_hyd'), ('A.disabled'), ('B.admin'), ('B.crew');
GRANT SELECT ON pde_people TO PUBLIC;
CREATE FUNCTION tests.pde_inbox(p_job uuid, p_type text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(pp.k, ',' ORDER BY pp.k), '')
  FROM public.notification_inbox AS i
  JOIN pde_people AS pp ON tests.user_id(pp.k) = i.user_id
  WHERE i.type_key = p_type AND i.payload ->> 'export_job_id' = p_job::text
$$;

SELECT tests.ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.record_events'::regclass AND tgname = 'trg_record_events_personal_data' AND NOT tgisinternal),
                'trg_record_events_personal_data is installed on record_events');
SELECT tests.ok(EXISTS (SELECT 1 FROM public.notification_types WHERE key = 'personal_data_exported' AND category = 'Records'), 'the type is seeded (D-164)');

-- ------------------------------------------------------------ 1. a personal browser export: the DPA only

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.log_client_export('csv', 'crew.roster', '{}', true, 12, tests.vessel_id('A.dra'))).id AS job1 \gset
SELECT tests.reset_role();
SELECT tests.is(tests.pde_inbox(:'job1', 'personal_data_exported'), 'A.dpa2,A.fleet_manager', 'a personal client export reaches the company''s DPAs only');
SELECT tests.results_eq(
  format($q$SELECT o.title, o.body, o.link_scope, o.vessel_id IS NULL, o.module_key IS NULL, o.audience, o.actor_user_id = %L, o.dedupe_key LIKE 'pde:%%'
            FROM public.notification_outbox AS o WHERE o.type_key = 'personal_data_exported' AND o.payload ->> 'export_job_id' = %L$q$,
         tests.user_id('A.crew_dra'), :'job1'),
  $q$VALUES ('Personal data exported'::text, 'CSV file · crew.roster'::text, 'fleet'::text, true, true, ARRAY['dpa']::text[], true, true)$q$,
  'one outbox row: no names in the title, the kind and source in the body, a fleet link, audience dpa, the actor recorded');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox AS o, jsonb_object_keys(o.payload) AS key
                 WHERE o.type_key = 'personal_data_exported' AND o.payload ->> 'export_job_id' = :'job1'
                   AND key NOT IN ('event_id', 'export_job_id', 'kind', 'generated_by')), 0::bigint,
                'the payload carries ids and codes only (event_id, export_job_id, kind, generated_by)');
SELECT tests.is((SELECT count(*) FROM public.notification_inbox WHERE payload ->> 'export_job_id' = :'job1' AND user_id IN (tests.user_id('A.crew_dra'), tests.user_id('B.admin'), tests.user_id('B.crew'), tests.user_id('A.crew_dra2'))),
                0::bigint, 'not the actor, not other members, not company B');
-- The DPA reads it in their own inbox.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is((SELECT count(*) FROM public.notification_inbox WHERE type_key = 'personal_data_exported' AND payload ->> 'export_job_id' = :'job1'), 1::bigint, 'the DPA reads the notice in their inbox');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is((SELECT count(*) FROM public.notification_inbox WHERE type_key = 'personal_data_exported'), 0::bigint, 'company B''s DPA has none');
SELECT tests.reset_role();

-- A DPA's own personal export goes to the other DPA, never back to the actor.
SELECT tests.as_user(tests.user_id('A.dpa2'));
SELECT (public.log_client_export('xlsx', 'hr.people:register', '{}', true, 3)).id AS job_dpa \gset
SELECT tests.reset_role();
SELECT tests.is(tests.pde_inbox(:'job_dpa', 'personal_data_exported'), 'A.fleet_manager', 'a DPA''s own personal export notifies the other DPA, not the actor');

-- ------------------------------------------------------------ 2. a non-personal export: nobody

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.log_client_export('csv', 'safety.drills:register', '{}', false, 4, tests.vessel_id('A.dra'))).id AS job2 \gset
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE payload ->> 'export_job_id' = :'job2'), 0::bigint, 'a non-personal client export emits nothing');
SELECT tests.is((SELECT count(*) FROM public.notification_inbox WHERE payload ->> 'export_job_id' = :'job2'), 0::bigint, 'and reaches nobody');

-- ------------------------------------------------------------ 3. a server export moved to ready: the requester and the DPA

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.request_export('csv', 'crew.roster', '{}', true, tests.vessel_id('A.dra'))).id AS job3 \gset
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE payload ->> 'export_job_id' = :'job3'), 0::bigint, 'a queued (requested) export notifies nobody yet');
SELECT tests.as_service();
SELECT public.export_job_transition(:'job3', 'running');
SELECT public.export_job_transition(:'job3', 'ready', jsonb_build_object('storage_path', 'exports/r6.csv', 'size_bytes', 5, 'sha256', repeat('d', 64)));
SELECT tests.reset_role();
SELECT tests.is(tests.pde_inbox(:'job3', 'personal_data_exported'), 'A.dpa2,A.fleet_manager', 'the ready server export sends personal_data_exported to the DPAs');
SELECT tests.is((SELECT string_agg(pp.k, ',' ORDER BY pp.k) FROM public.notification_inbox AS i JOIN public.record_events AS ev ON i.payload ->> 'event_id' = ev.id::text
                 JOIN pde_people AS pp ON tests.user_id(pp.k) = i.user_id
                 WHERE i.type_key = 'export_ready' AND ev.entity_id = :'job3'),
                'A.crew_dra', 'and export_ready to the requester only');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE type_key = 'personal_data_exported' AND payload ->> 'export_job_id' = :'job3'), 1::bigint,
                'one DPA notice for the job (export.running is not a trigger action)');
SELECT tests.is((SELECT body FROM public.notification_outbox WHERE type_key = 'personal_data_exported' AND payload ->> 'export_job_id' = :'job3'), 'CSV file · crew.roster',
                'the body labels the kind as export_ready does');

-- ------------------------------------------------------------ 4. a module switched off on the vessel does not silence it

INSERT INTO public.vessel_module_settings (vessel_id, company_id, module_key, enabled) VALUES (tests.vessel_id('A.dra'), tests.company_id('A'), 'crew', false)
ON CONFLICT DO NOTHING;
UPDATE public.vessel_module_settings SET enabled = false WHERE vessel_id = tests.vessel_id('A.dra') AND module_key = 'crew';
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT (public.log_client_export('csv', 'crew.roster', '{}', true, 2, tests.vessel_id('A.dra'))).id AS job4 \gset
SELECT tests.reset_role();
SELECT tests.is(tests.pde_inbox(:'job4', 'personal_data_exported'), 'A.dpa2', 'with the crew module off on DRAAK the DPA is still told (fleet link, no module key)');

-- ------------------------------------------------------------ 5. the trigger never rolls back the export, and is granted to nobody

SELECT tests.ok(NOT has_function_privilege(r, 'public.record_event_notify_personal_data()', 'EXECUTE'), 'record_event_notify_personal_data is not executable by ' || r)
FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r;
SELECT tests.ok(position('notification_emit_failed' IN pg_get_functiondef('public.record_event_notify_personal_data()'::regprocedure)) > 0,
                'an emit failure becomes a WARNING (CC-16)');
-- A failing emit (the outbox refuses the row) keeps the export.
SAVEPOINT pde_fail;
ALTER TABLE public.notification_outbox ADD CONSTRAINT r6_refuse_pde CHECK (type_key <> 'personal_data_exported') NOT VALID;
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.lives(format($q$SELECT public.log_client_export('csv', 'crew.roster', '{}', true, 1, %L)$q$, tests.vessel_id('A.dra')), 'with the emit failing, the export is still logged');
SELECT tests.reset_role();
SELECT tests.ok((SELECT count(*) FROM public.export_jobs WHERE requested_by = tests.user_id('A.crew_dra') AND row_count = 1) = 1, 'and its job row exists');
ROLLBACK TO SAVEPOINT pde_fail;
