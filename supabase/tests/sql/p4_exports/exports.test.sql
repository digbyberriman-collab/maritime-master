-- Export jobs (spec §A.14; gap/08 EX1, EX3, EX4; C10): the machine (every
-- legal and illegal pair), output requirements, a client can never set
-- ready (no grant, no transition, the guard holds for the service role
-- too), request / log / cancel rules, events and notifications,
-- requester-only reads and the admin read, isolation, anon denied.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user('A', 'A.crew_dra', 'crew');
SELECT tests.seed_assignment('A.crew_dra', 'A.dra', true, 'Deckhand');

SELECT tests.company_id('A') AS ca, tests.vessel_id('A.dra') AS dra, tests.vessel_id('A.hyd') AS hyd, tests.vessel_id('B.lev') AS lev \gset

-- helpers (rolled back with the file)
CREATE FUNCTION tests.full_patch() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('storage_path', 'exports/test.csv', 'size_bytes', 10, 'sha256', repeat('a', 64), 'error_code', 'builder_failed')
$$;
-- A server job of the crew member, moved along legal steps to p_status.
CREATE FUNCTION tests.export_job_at(p_status text, p_key text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id uuid := tests.id('export:' || p_key);
  v_step text;
BEGIN
  INSERT INTO public.export_jobs (id, company_id, vessel_id, requested_by, kind, generated_by, source_key)
  VALUES (v_id, tests.company_id('A'), tests.vessel_id('A.dra'), tests.user_id('A.crew_dra'), 'csv', 'server', 'test.matrix');
  FOREACH v_step IN ARRAY CASE p_status
      WHEN 'requested' THEN '{}'::text[] WHEN 'running' THEN '{running}'::text[] WHEN 'ready' THEN '{running,ready}'::text[]
      WHEN 'failed' THEN '{failed}'::text[] WHEN 'cancelled' THEN '{cancelled}'::text[]
      WHEN 'expired' THEN '{running,ready,expired}'::text[] WHEN 'purged' THEN '{running,ready,expired,purged}'::text[] END LOOP
    PERFORM public.export_job_transition(v_id, v_step, CASE v_step
      WHEN 'ready' THEN tests.full_patch() - 'error_code' WHEN 'failed' THEN jsonb_build_object('error_code', 'builder_failed') ELSE '{}'::jsonb END);
  END LOOP;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION tests.full_patch(), tests.export_job_at(text, text) TO PUBLIC;

-- ------------------------------------------------------------ the machine: every pair

SELECT tests.as_service();
SELECT CASE WHEN legal
  THEN tests.lives(format('SELECT public.export_job_transition(%L, %L, %L)', tests.export_job_at(f, f || '>' || t), t, tests.full_patch()),
                   format('legal: %s -> %s', f, t))
  ELSE tests.throws_like(format('SELECT public.export_job_transition(%L, %L, %L)', tests.export_job_at(f, f || '>' || t), t, tests.full_patch()),
                   '22023', 'export_transition_invalid', format('illegal: %s -> %s', f, t))
  END
FROM unnest(ARRAY['requested', 'running', 'ready', 'failed', 'cancelled', 'expired', 'purged']) AS f,
     unnest(ARRAY['requested', 'running', 'ready', 'failed', 'cancelled', 'expired', 'purged', 'bogus']) AS t,
     LATERAL (SELECT (f, t) IN (('requested', 'running'), ('requested', 'failed'), ('requested', 'cancelled'),
                                ('running', 'ready'), ('running', 'failed'), ('ready', 'expired'), ('expired', 'purged')) AS legal) AS l;
SELECT tests.is((SELECT count(*) FROM public.export_jobs WHERE source_key = 'test.matrix'), 56::bigint, 'the 56 pairs ran on their own jobs');
SELECT tests.results_eq(
  $q$SELECT status, count(*) FROM public.export_jobs WHERE source_key = 'test.matrix' AND id IN (
       SELECT tests.id('export:' || f || '>' || t) FROM (VALUES ('requested', 'running'), ('requested', 'failed'), ('requested', 'cancelled'),
         ('running', 'ready'), ('running', 'failed'), ('ready', 'expired'), ('expired', 'purged')) AS v(f, t))
     GROUP BY status ORDER BY status$q$,
  $q$VALUES ('cancelled'::text, 1::bigint), ('expired', 1), ('failed', 2), ('purged', 1), ('ready', 1), ('running', 1)$q$,
  'every legal pair landed on its target status');

-- Output requirements and stamps.
SELECT tests.export_job_at('requested', 'out:1') AS j1, tests.export_job_at('running', 'out:2') AS j2 \gset
SELECT tests.throws_like(format($q$SELECT public.export_job_transition(%L, 'ready')$q$, :'j2'), '22023', 'export_output_required', 'ready needs a path, size and sha256');
SELECT tests.throws_like(format($q$SELECT public.export_job_transition(%L, 'ready', '{"storage_path": "x", "size_bytes": 1}')$q$, :'j2'), '22023', 'export_output_required', 'ready needs the sha256 too');
SELECT tests.throws_like(format($q$SELECT public.export_job_transition(%L, 'failed')$q$, :'j1'), '22023', 'error_code_required', 'failed needs an error code');
SELECT tests.throws_like(format($q$SELECT public.export_job_transition(%L, 'failed', '{"error_code": "Bad Code"}')$q$, :'j1'), '22023', 'patch_invalid', 'an error code is snake_case');
SELECT tests.throws_like(format($q$SELECT public.export_job_transition(%L, 'running', '{"status": "ready"}')$q$, :'j1'), '22023', 'patch_invalid', 'the patch cannot carry the status (or any other key)');
SELECT tests.throws_like(format($q$SELECT public.export_job_transition(%L, 'ready', '{"storage_path": "x", "size_bytes": "big", "sha256": "%s"}')$q$, :'j2', repeat('a', 64)), '22023', 'patch_invalid', 'a malformed size is refused');
SELECT tests.throws_like(format($q$SELECT public.export_job_transition(%L, 'ready', '{"storage_path": "x", "size_bytes": 5, "sha256": "nothex"}')$q$, :'j2'), '22023', 'patch_invalid', 'a malformed sha256 is refused');
SELECT tests.throws_like(format($q$SELECT public.export_job_transition(%L, 'running')$q$, tests.id('export:nowhere')), 'P0002', 'export_not_found', 'an unknown job is P0002');
SELECT tests.lives(format($q$SELECT public.export_job_transition(%L, 'running')$q$, :'j1'), 'requested -> running');
SELECT tests.lives(format($q$SELECT public.export_job_transition(%L, 'ready', %L)$q$, :'j1', jsonb_build_object('storage_path', 'exports/j1.csv', 'size_bytes', 42, 'sha256', repeat('b', 64), 'row_count', 3)), 'running -> ready with its output');
SELECT tests.lives(format($q$SELECT public.export_job_transition(%L, 'failed', '{"error_code": "builder_timeout"}')$q$, :'j2'), 'running -> failed with a code');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT status, storage_path, size_bytes, sha256, row_count, started_at IS NOT NULL, completed_at IS NOT NULL FROM public.export_jobs WHERE id = %L$q$, :'j1'),
  format($q$VALUES ('ready'::text, 'exports/j1.csv'::text, 42::bigint, %L::text, 3, true, true)$q$, repeat('b', 64)), 'ready: output, started and completed');
SELECT tests.results_eq(format($q$SELECT status, error_code, completed_at IS NOT NULL FROM public.export_jobs WHERE id = %L$q$, :'j2'),
  $q$VALUES ('failed'::text, 'builder_timeout'::text, true)$q$, 'failed: the code and the end time');
SELECT tests.results_eq(format($q$SELECT action, from_status, to_status, party, notification_type, entity_type FROM public.record_events WHERE entity_id = %L ORDER BY created_at, action$q$, :'j1'),
  $q$VALUES ('export.ready'::text, 'running'::text, 'ready'::text, 'system'::text, 'export_ready'::text, 'export_job'::text),
            ('export.running', 'requested', 'running', 'system', NULL, 'export_job')$q$,
  'one event per step; ready notifies export_ready (party system for the service role)');
SELECT tests.is((SELECT notification_type FROM public.record_events WHERE entity_id = :'j2' AND action = 'export.failed'), 'export_failed', 'failed notifies export_failed');
SELECT tests.ok((SELECT bool_and(NOT (payload ? 'params')) FROM public.record_events WHERE entity_type = 'export_job'), 'export events never carry the params');

-- The guard holds for every role (only the machine moves a job).
SELECT tests.as_service();
SELECT tests.throws_like(format($q$UPDATE public.export_jobs SET status = 'ready', completed_at = now() WHERE id = %L$q$, tests.export_job_at('requested', 'guard:1')), '42501', 'export_status_is_server_owned', 'the service role cannot set a status directly');
SELECT tests.throws_like(format($q$UPDATE public.export_jobs SET params = '{"x": 1}' WHERE id = %L$q$, :'j1'), '42501', 'export_status_is_server_owned', 'nor change any other column');
SELECT tests.throws_like(format($q$DELETE FROM public.export_jobs WHERE id = %L$q$, :'j1'), '42501', 'export_status_is_server_owned', 'nor delete a job');
SELECT tests.throws_like(format($q$INSERT INTO public.export_jobs (company_id, requested_by, kind, generated_by, source_key, status, completed_at) VALUES (%L, %L, 'csv', 'server', 'test.x', 'ready', now())$q$, :'ca', tests.user_id('A.crew_dra')), '42501', 'export_status_is_server_owned', 'nor insert a ready job');
SELECT tests.lives(format($q$INSERT INTO public.export_jobs (company_id, requested_by, kind, generated_by, source_key) VALUES (%L, %L, 'csv', 'server', 'test.service')$q$, :'ca', tests.user_id('A.crew_dra')), 'the service role may queue a requested job');
SELECT tests.reset_role();

-- ------------------------------------------------------------ the client API

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.request_export('register_pdf', 'safety.incidents:register', '{"status": "open"}', false, :'dra')).id AS r1 \gset
SELECT tests.results_eq(format($q$SELECT company_id, vessel_id, requested_by, kind, generated_by, source_key, status, contains_personal_data, completed_at IS NULL FROM public.export_jobs WHERE id = %L$q$, :'r1'),
  format($q$VALUES (%L::uuid, %L::uuid, %L::uuid, 'register_pdf'::text, 'server'::text, 'safety.incidents:register'::text, 'requested'::text, false, true)$q$, :'ca', :'dra', tests.user_id('A.crew_dra')),
  'request_export queues a server job (requested; no fake completion)');
SELECT tests.results_eq(format($q$SELECT action, module_key, party, to_status FROM public.record_events WHERE entity_id = %L$q$, :'r1'),
  $q$VALUES ('export.requested'::text, 'safety'::text, 'vessel'::text, 'requested'::text)$q$, 'event export.requested in the source key''s module');
SELECT tests.is((public.request_export('gdpr_subject', 'hris.employee:subject', '{}', false, :'dra')).contains_personal_data, true, 'a GDPR subject export always contains personal data');
SELECT tests.throws_like($q$SELECT public.request_export('pdf', 'safety.x')$q$, '42501', 'export_access_denied', 'a fleet-wide export needs fleet reach (crew have none)');
SELECT tests.throws_like(format($q$SELECT public.request_export('pdf', 'safety.x', '{}', false, %L)$q$, :'dra'), '22023', 'export_kind_invalid', 'an unknown kind is refused');
SELECT tests.throws_like(format($q$SELECT public.request_export('csv', 'Safety X', '{}', false, %L)$q$, :'dra'), '22023', 'source_key_invalid', 'a malformed source key is refused');
SELECT tests.throws_like(format($q$SELECT public.request_export('csv', 'safety.x', '[1]', false, %L)$q$, :'dra'), '22023', 'params_invalid', 'params must be an object');
SELECT tests.throws_like(format($q$SELECT public.request_export('csv', 'safety.x', %L, false, %L)$q$, jsonb_build_object('blob', repeat('x', 9000)), :'dra'), '22023', 'params_too_large', 'params are bounded');
SELECT tests.throws_like(format($q$SELECT public.request_export('csv', 'safety.x', '{}', false, %L)$q$, :'hyd'), '42501', 'export_access_denied', 'no export of a vessel the caller does not reach');
SELECT tests.throws_like(format($q$SELECT public.request_export('csv', 'safety.x', '{}', false, %L)$q$, :'lev'), '42501', 'export_access_denied', 'no export of another company''s vessel');
SELECT (public.log_client_export('csv', 'crew.roster', '{}', true, 12, :'dra')).id AS c1 \gset
SELECT tests.results_eq(format($q$SELECT generated_by, status, row_count, contains_personal_data, completed_at IS NOT NULL FROM public.export_jobs WHERE id = %L$q$, :'c1'),
  $q$VALUES ('client'::text, 'ready'::text, 12, true, true)$q$, 'log_client_export: a browser export logged ready before the download (EX4)');
SELECT tests.is((SELECT action || ':' || coalesce(notification_type, '-') FROM public.record_events WHERE entity_id = :'c1'), 'export.logged:-', 'event export.logged, no notification');
SELECT tests.throws_like(format($q$SELECT public.log_client_export('csv', 'crew.roster', '{}', false, -1, %L)$q$, :'dra'), '22023', 'row_count_invalid', 'a negative row count is refused');
SELECT tests.throws(format($q$SELECT public.export_job_transition(%L, 'running')$q$, :'r1'), '42501', 'authenticated cannot execute export_job_transition (a client can never set ready)');
SELECT tests.throws(format($q$UPDATE public.export_jobs SET status = 'ready' WHERE id = %L$q$, :'r1'), '42501', 'no direct update by the client');
SELECT tests.throws(format($q$INSERT INTO public.export_jobs (company_id, requested_by, kind, generated_by, source_key) VALUES (%L, %L, 'csv', 'server', 'x.y')$q$, :'ca', tests.user_id('A.crew_dra')), '42501', 'no direct insert by the client');

-- cancel: requester only, requested only.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format($q$SELECT public.cancel_export_job(%L)$q$, :'r1'), '42501', 'export_access_denied', 'an admin cannot cancel someone else''s export');
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.is((public.cancel_export_job(:'r1')).status, 'cancelled', 'the requester cancels a queued export');
SELECT tests.is((public.cancel_export_job(:'r1')).status, 'cancelled', 'cancelling again returns it unchanged');
SELECT tests.results_eq(format($q$SELECT action, from_status, to_status, party FROM public.record_events WHERE entity_id = %L AND action = 'export.cancelled'$q$, :'r1'),
  $q$VALUES ('export.cancelled'::text, 'requested'::text, 'cancelled'::text, 'vessel'::text)$q$, 'event export.cancelled by the vessel side');
SELECT tests.throws_like(format($q$SELECT public.cancel_export_job(%L)$q$, :'c1'), '22023', 'export_not_cancellable', 'a client export cannot be cancelled');
SELECT tests.throws_like(format($q$SELECT public.cancel_export_job(%L)$q$, tests.export_job_at('running', 'cancel:running')), '22023', 'export_not_cancellable', 'a running export cannot be cancelled');
SELECT tests.throws_like(format($q$SELECT public.cancel_export_job(%L)$q$, tests.id('export:nowhere')), 'P0002', 'export_not_found', 'an unknown job is P0002');
SELECT tests.as_user(tests.user_id('A.crew_dra'), '{"app_metadata": {"impersonating": "true"}}');
SELECT tests.throws_like(format($q$SELECT public.request_export('csv', 'safety.x', '{}', false, %L)$q$, :'dra'), '22023', 'impersonating', 'no export while impersonating');

-- Fleet exports and other callers.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT (public.request_export('xlsx', 'fleet.vessels:register')).id AS fl1 \gset
SELECT tests.is((SELECT vessel_id FROM public.export_jobs WHERE id = :'fl1'), NULL::uuid, 'the fleet manager requests a fleet-wide export');
SELECT tests.is((SELECT party FROM public.record_events WHERE entity_id = :'fl1'), 'company', 'a company actor''s request is the company side');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws(format($q$SELECT public.request_export('csv', 'safety.x', '{}', false, %L)$q$, :'dra'), '42501', 'company B cannot export company A''s vessel');
SELECT (public.request_export('csv', 'safety.x', '{}', false, :'lev')).id AS b1 \gset
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws(format($q$SELECT public.request_export('csv', 'safety.x', '{}', false, %L)$q$, :'dra'), '42501', 'a disabled user cannot export');
SELECT tests.as_anon();
SELECT tests.throws(format($q$SELECT public.request_export('csv', 'safety.x', '{}', false, %L)$q$, :'dra'), '42501', 'anon cannot execute request_export');
SELECT tests.throws(format($q$SELECT public.cancel_export_job(%L)$q$, :'r1'), '42501', 'anon cannot execute cancel_export_job');
SELECT tests.denied('SELECT * FROM public.export_jobs', 'anon reads no export job');
SELECT tests.reset_role();

-- ------------------------------------------------------------ reads

-- A job of the disabled user (queued while they were active).
INSERT INTO public.export_jobs (company_id, requested_by, kind, generated_by, source_key, vessel_id)
VALUES (:'ca', tests.user_id('A.disabled'), 'csv', 'server', 'test.disabled', :'dra');

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.ok((SELECT bool_and(requested_by = tests.user_id('A.crew_dra')) FROM public.export_jobs), 'the requester reads only their own jobs');
SELECT tests.is((SELECT count(*) FROM public.export_jobs WHERE id IN (:'r1', :'c1')), 2::bigint, 'including their client and server exports');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is((SELECT count(*) FROM public.export_jobs), 0::bigint, 'a colleague on the same vessel reads none of them');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is((SELECT count(*) FROM public.export_jobs), (SELECT count(*) FROM public.export_jobs WHERE company_id = tests.company_id('A')), 'the company admin (audit-log reader) reads every company A job');
SELECT tests.ok((SELECT count(*) FROM public.export_jobs WHERE requested_by = tests.user_id('A.crew_dra')) > 0, 'other people''s jobs included');
SELECT tests.is((SELECT count(*) FROM public.export_jobs WHERE id = :'b1'), 0::bigint, 'but never company B''s');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is((SELECT count(*) FROM public.export_jobs WHERE company_id = tests.company_id('A')), 0::bigint, 'company B reads no company A job');
SELECT tests.is((SELECT count(*) FROM public.export_jobs WHERE id = :'b1'), 1::bigint, 'company B reads its own');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is((SELECT count(*) FROM public.export_jobs), 0::bigint, 'a disabled requester reads not even their own job');
SELECT tests.reset_role();

-- ------------------------------------------------------------ export events follow the export_jobs audience

-- record_events_select (record_readable) admits every member with reach;
-- the RESTRICTIVE record_events_export_job_audience narrows export events
-- to the export_jobs audience. Four readers of a vessel-A.dra export by the
-- Master and of one ordinary record event on A.dra.
SELECT tests.seed_user('A', 'A.fleet_master', 'crew');
SELECT tests.seed_rbac_role('A.fleet_master', 'fleet_master');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT (public.request_export('gdpr_subject', 'hr.subject:' || tests.user_id('A.crew_hyd'), '{}', true, tests.vessel_id('A.dra'))).id AS master_job \gset
SELECT tests.reset_role();
INSERT INTO public.record_events (id, company_id, vessel_id, module_key, entity_type, entity_id, action, party)
VALUES (tests.id('event:note'), tests.company_id('A'), tests.vessel_id('A.dra'), 'safety', 'test_note', tests.id('note:1'), 'test.noted', 'vessel');
CREATE TEMP TABLE export_audience (user_key text, export_events bigint, other_events bigint) ON COMMIT DROP;
GRANT INSERT, SELECT ON export_audience TO authenticated;
DO $$
DECLARE k text;
BEGIN
  FOREACH k IN ARRAY ARRAY['A.master_dra', 'A.crew_dra', 'A.fleet_master', 'A.fleet_manager'] LOOP
    PERFORM tests.as_user(tests.user_id(k));
    INSERT INTO export_audience
    SELECT k,
           (SELECT count(*) FROM public.record_events WHERE entity_type = 'export_job' AND entity_id = (SELECT id FROM public.export_jobs WHERE source_key = 'hr.subject:' || tests.user_id('A.crew_hyd') AND requested_by = tests.user_id('A.master_dra') LIMIT 1)),
           (SELECT count(*) FROM public.record_events WHERE id = tests.id('event:note'));
  END LOOP;
END
$$;
SELECT tests.reset_role();
SELECT tests.ok(public.fleet_reach_for(tests.user_id('A.fleet_master'), tests.company_id('A'))
                AND NOT public.has_capability_for(tests.user_id('A.fleet_master'), 'admin.access.permission_audit_log.view', tests.company_id('A')),
                'A.fleet_master: fleet reach, no audit capability');
SELECT tests.is((SELECT count(*) FROM public.record_events WHERE entity_id = :'master_job' AND action = 'export.requested'), 1::bigint, 'the export logged one export.requested event');
SELECT tests.results_eq(
  'SELECT user_key, export_events, other_events FROM export_audience',
  $q$VALUES ('A.master_dra', 1::bigint, 1::bigint), ('A.crew_dra', 0, 1), ('A.fleet_master', 0, 1), ('A.fleet_manager', 1, 1)$q$,
  'export events visible / other events visible: the requester 1/1, the deckhand 0/1, fleet_master without the audit capability 0/1, the fleet manager 1/1');
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.is_empty($q$SELECT 1 FROM public.record_events WHERE entity_type = 'export_job' AND payload ->> 'requested_by' IS DISTINCT FROM auth.uid()::text$q$, 'the deckhand reads no export event of anyone else');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is_empty(format($q$SELECT 1 FROM public.record_events WHERE entity_id = %L$q$, :'master_job'), 'company B reads none of them');
SELECT tests.reset_role();

-- ------------------------------------------------------------ a deleted user or vessel leaves an anonymised job (review round 4)

-- export-jobs-block-user-delete: requested_by and vessel_id are ON DELETE
-- SET NULL and export_jobs_guard lets exactly that referential SET NULL
-- through, so one logged export no longer makes the login (GDPR erasure)
-- or the vessel undeletable. Nobody cancels an orphaned job; any other
-- change is still refused; export_ready on it notifies nobody. Ports
-- scratchpad r3sec/t6_export_job_blocks_user_delete.sql and
-- verify-export-del/v.sql.
SELECT tests.seed_user('A', 'A.leaver', 'crew');
SELECT tests.seed_assignment('A.leaver', 'A.dra', true, 'Deckhand');
SELECT tests.seed_vessel('A', 'A.old', 'OLD HULL');
SELECT tests.as_user(tests.user_id('A.leaver'));
SELECT (public.log_client_export('csv', 'crew.roster', '{}'::jsonb, true, 12, tests.vessel_id('A.dra'))).id AS leaver_logged \gset
SELECT (public.request_export('csv', 'crew.roster', '{}'::jsonb, false, tests.vessel_id('A.dra'))).id AS leaver_job \gset
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT (public.log_client_export('csv', 'fleet.vessels', '{}'::jsonb, false, 3, tests.vessel_id('A.old'))).id AS old_vessel_job \gset
SELECT tests.reset_role();
SELECT tests.ok((SELECT is_nullable = 'YES' FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'export_jobs' AND column_name = 'requested_by'),
                'export_jobs.requested_by is nullable');
SELECT tests.ok((SELECT confdeltype = 'n' FROM pg_constraint WHERE conname = 'export_jobs_requested_by_fkey'), 'export_jobs_requested_by_fkey is ON DELETE SET NULL');
SELECT tests.lives(format('DELETE FROM auth.users WHERE id = %L', tests.user_id('A.leaver')), 'the requester''s login is deleted after a logged and a requested export');
SELECT tests.results_eq(format($q$SELECT id, requested_by, status FROM public.export_jobs WHERE id IN (%L, %L)$q$, :'leaver_logged', :'leaver_job'),
                        format($q$VALUES (%L::uuid, NULL::uuid, 'ready'::text), (%L::uuid, NULL::uuid, 'requested'::text)$q$, :'leaver_logged', :'leaver_job'),
                        'both jobs remain, requested_by NULL');
SELECT tests.is((SELECT count(*) FROM public.record_events WHERE entity_type = 'export_job' AND entity_id IN (:'leaver_logged', :'leaver_job')), 2::bigint, 'and their events remain');
SELECT tests.is((SELECT count(*) FROM public.record_events WHERE entity_type = 'export_job' AND entity_id IN (:'leaver_logged', :'leaver_job') AND actor_user_id IS NOT NULL), 0::bigint,
                'with actor_user_id NULL');
SELECT tests.as_service();
SELECT tests.lives(format('DELETE FROM public.vessels WHERE id = %L', tests.vessel_id('A.old')), 'the service role deletes a vessel with a logged export');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT vessel_id, requested_by FROM public.export_jobs WHERE id = %L$q$, :'old_vessel_job'),
                        format($q$VALUES (NULL::uuid, %L::uuid)$q$, tests.user_id('A.fleet_manager')), 'the job remains with vessel_id NULL (the requester kept)');
-- Nobody cancels the orphaned job.
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.throws_like(format('SELECT public.cancel_export_job(%L)', :'leaver_job'), '42501', 'export_access_denied', 'another active user cannot cancel the orphaned job');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format('SELECT public.cancel_export_job(%L)', :'leaver_job'), '42501', 'export_access_denied', 'nor an admin of the company');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws(format('SELECT public.cancel_export_job(%L)', :'leaver_job'), '42501', 'nor a company B user');
SELECT tests.reset_role();
SELECT tests.is((SELECT status FROM public.export_jobs WHERE id = :'leaver_job'), 'requested', 'the orphaned job is still requested');
-- Any other change outside the engine is still refused, the service role included.
SELECT tests.as_service();
SELECT tests.throws_like(format($q$UPDATE public.export_jobs SET status = 'ready' WHERE id = %L$q$, :'leaver_job'), '42501', 'export_status_is_server_owned', 'a non-referential status update is refused');
SELECT tests.throws_like(format($q$UPDATE public.export_jobs SET requested_by = %L WHERE id = %L$q$, tests.user_id('A.crew_dra'), :'leaver_job'), '42501', 'export_status_is_server_owned',
                         'so is pointing the orphaned job at another user');
SELECT tests.throws_like(format($q$UPDATE public.export_jobs SET vessel_id = %L WHERE id = %L$q$, tests.vessel_id('A.hyd'), :'old_vessel_job'), '42501', 'export_status_is_server_owned',
                         'or at another vessel');
SELECT tests.throws_like(format($q$UPDATE public.export_jobs SET requested_by = NULL, row_count = 99 WHERE id = %L$q$, :'old_vessel_job'), '42501', 'export_status_is_server_owned',
                         'and a SET NULL that carries another change');
SELECT tests.throws_like(format('DELETE FROM public.export_jobs WHERE id = %L', :'leaver_job'), '42501', 'export_status_is_server_owned', 'and a job is never deleted');
-- The machine still moves it; export_ready on an orphaned job notifies nobody.
SELECT tests.lives(format($q$SELECT public.export_job_transition(%L, 'running')$q$, :'leaver_job'), 'the builder starts the orphaned job');
SELECT tests.lives(format($q$SELECT public.export_job_transition(%L, 'ready', %L::jsonb)$q$, :'leaver_job', tests.full_patch() - 'error_code'),
                   'and finishes it without an error');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.record_events WHERE entity_id = :'leaver_job' AND action = 'export.ready' AND notification_type = 'export_ready'), 1::bigint,
                'the export.ready event is logged with its notification type');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE type_key = 'export_ready' AND payload ->> 'entity_id' = :'leaver_job'), 0::bigint,
                'but no outbox row (no requester: array_remove drops the NULL)');
SELECT tests.is((SELECT count(*) FROM public.notification_inbox WHERE type_key = 'export_ready' AND payload ->> 'entity_id' = :'leaver_job'), 0::bigint, 'and no inbox row');
