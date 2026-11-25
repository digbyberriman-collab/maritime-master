-- Notification outbox and inbox (spec §A.15; gap/03 C1, C9, C11, C12;
-- gap/08 NO1-NO3, NO6, §N; D-62; proposed D-127, D-128; CC-16): no
-- authenticated emit (rule 5); a crew member's action notifies colleagues
-- and company actors (the internal reach functions answer inside their
-- transaction); cross-tenant, disabled, no-reach users and the actor never
-- receive; dedupe; preferences and type defaults; caller and input
-- validation; inbox column grants and own-row RLS; mark_all_read; the
-- fan-out failure path (attempts = 1, caller not rolled back) and the
-- retry processor; an emit failure keeps the engine transition; one event
-- per transition with the right audience, severity, title and link;
-- export notifications; title truncation; seeds; realtime publication.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user('A', 'A.crew_dra', 'crew');
SELECT tests.seed_assignment('A.crew_dra', 'A.dra', true, 'Deckhand');
SELECT tests.seed_user('A', 'A.crew_dra2', 'crew');
SELECT tests.seed_assignment('A.crew_dra2', 'A.dra', true, 'Bosun');
SELECT tests.seed_assignment('A.disabled', 'A.dra', true, 'Deckhand');

SELECT tests.company_id('A') AS ca, tests.company_id('B') AS cb, tests.vessel_id('A.dra') AS dra, tests.vessel_id('A.hyd') AS hyd,
       tests.vessel_id('B.lev') AS lev,
       tests.user_id('A.crew_dra') AS u_crew, tests.user_id('A.crew_dra2') AS u_crew2, tests.user_id('A.master_dra') AS u_master,
       tests.user_id('A.fleet_manager') AS u_fm, tests.user_id('A.crew_hyd') AS u_hyd, tests.user_id('A.disabled') AS u_dis,
       tests.user_id('B.admin') AS u_b \gset

INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, capability_path, company_step, report_first, decision_kind, allow_reopen, allow_close_as, edit_after_sign, delete_rule, slot_template)
VALUES
  ('test.permit', 'test', 'Permit to work', 'PTW', 'vessel', 'vessel.test.records', 'sign_off', false, false, true, true, 'lock', 'never_after_submit',
   jsonb_build_array(
     jsonb_build_object('key', 'prepared_by', 'label', 'Prepared by', 'order', 1, 'party', 'vessel', 'named_profile_ids', jsonb_build_array(tests.profile_id('A.crew_dra'))),
     jsonb_build_object('key', 'checked_by', 'label', 'Checked by', 'order', 2, 'party', 'vessel', 'named_profile_ids', jsonb_build_array(tests.profile_id('A.crew_dra2'))),
     jsonb_build_object('key', 'company_review', 'label', 'Company review', 'order', 3, 'party', 'company'))),
  ('test.fleet_review', 'test', 'Fleet review', 'FRV', 'fleet', 'fleet.test.records', 'sign_off', false, false, false, false, 'lock', 'draft_only', '[]'::jsonb);

-- helpers (rolled back with the file)
CREATE FUNCTION tests.emit(p_type text, p_company uuid, p_title text, p_scope text, p_vessel uuid DEFAULT NULL,
                           p_must uuid[] DEFAULT '{}', p_audience text[] DEFAULT '{}', p_dedupe text DEFAULT NULL,
                           p_path text DEFAULT NULL, p_workspace text DEFAULT NULL, p_body text DEFAULT NULL, p_severity text DEFAULT 'info',
                           p_envelope uuid DEFAULT NULL)
RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  -- A definer calling emit inside the current session (auth.uid() stays the caller's).
  SELECT public.emit_notification_event(p_type_key := p_type, p_company_id := p_company, p_title := p_title, p_link_scope := p_scope,
    p_vessel_id := p_vessel, p_body := p_body, p_severity := p_severity, p_link_path := p_path, p_link_workspace := p_workspace,
    p_envelope_id := p_envelope, p_must_act_user_ids := p_must, p_audience := p_audience, p_dedupe_key := p_dedupe)
$$;
CREATE FUNCTION tests.recipients(p_outbox uuid) RETURNS uuid[] LANGUAGE sql SECURITY DEFINER AS $$
  SELECT coalesce(array_agg(user_id ORDER BY user_id), '{}') FROM public.notification_inbox WHERE outbox_id = p_outbox
$$;
CREATE FUNCTION tests.uids(VARIADIC p uuid[]) RETURNS uuid[] LANGUAGE sql IMMUTABLE AS $$ SELECT array_agg(x ORDER BY x) FROM unnest(p) AS x $$;
CREATE FUNCTION tests.event_outbox(p_env uuid, p_action text, p_to text DEFAULT NULL) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT o.id FROM public.record_events AS ev JOIN public.notification_outbox AS o ON o.dedupe_key = 'event:' || ev.id::text
  WHERE ev.envelope_id = p_env AND ev.action = p_action AND (p_to IS NULL OR ev.to_status = p_to)
  ORDER BY ev.created_at DESC LIMIT 1
$$;
CREATE FUNCTION tests.slot_of(p_env uuid, p_key text) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT sl.id FROM public.record_signature_slots AS sl JOIN public.record_envelopes AS e ON e.id = sl.envelope_id
  WHERE sl.envelope_id = p_env AND sl.cycle = e.current_cycle AND sl.slot_key = p_key
$$;
GRANT EXECUTE ON FUNCTION tests.emit(text, uuid, text, text, uuid, uuid[], text[], text, text, text, text, text, uuid), tests.recipients(uuid),
  tests.uids(uuid[]), tests.event_outbox(uuid, text, text), tests.slot_of(uuid, text) TO PUBLIC;

-- ------------------------------------------------------------ seeds and grants

SELECT tests.is((SELECT count(*) FROM public.notification_types WHERE category = 'Records' AND key IN (
  'signature_requested', 'signature_reminder', 'signatures_stale', 'record_submitted_to_company', 'record_acknowledged', 'record_decision',
  'record_returned', 'record_closed', 'record_reopened', 'record_update_posted', 'status_request_posted', 'status_request_due',
  'status_request_overdue', 'record_voided', 'export_ready', 'export_failed', 'personal_data_exported', 'invitation_accepted', 'invitation_bounced')), 19::bigint,
  'the 19 engine notification types are seeded (category Records)');
SELECT tests.ok((SELECT bool_and(cadence IN ('realtime', 'daily', 'weekly') AND length(name) > 0 AND description IS NOT NULL) FROM public.notification_types WHERE category = 'Records'),
  'seeded types use the live cadence vocabulary and have STORM copy');
SELECT tests.as_user(:'u_fm');
SELECT tests.throws(format($q$SELECT public.emit_notification_event('record_closed', %L, 'Title', 'fleet')$q$, :'ca'), '42501', 'authenticated cannot execute emit_notification_event (rule 5)');
SELECT tests.throws(format($q$SELECT public.notification_fan_out(%L)$q$, tests.id('x')), '42501', 'authenticated cannot execute notification_fan_out');
SELECT tests.throws(format($q$SELECT * FROM public.notification_recipients(%L)$q$, tests.id('x')), '42501', 'authenticated cannot execute notification_recipients');
SELECT tests.throws('SELECT public.process_notification_outbox()', '42501', 'authenticated cannot execute process_notification_outbox');
SELECT tests.throws('SELECT * FROM public.notification_outbox', '42501', 'authenticated cannot read the outbox');
SELECT tests.as_anon();
SELECT tests.throws(format($q$SELECT public.emit_notification_event('record_closed', %L, 'Title', 'fleet')$q$, :'ca'), '42501', 'anon cannot execute emit_notification_event');
SELECT tests.throws('SELECT public.notification_inbox_mark_all_read()', '42501', 'anon cannot execute notification_inbox_mark_all_read');
SELECT tests.denied('SELECT * FROM public.notification_inbox', 'anon reads no inbox row');
SELECT tests.reset_role();

-- ------------------------------------------------------------ audience inside a crew member's transaction

SELECT tests.as_user(:'u_crew');
SELECT tests.emit('record_update_posted', :'ca', 'New update on PTW-DRA-2026-001', 'vessel', :'dra',
  ARRAY[:'u_b', :'u_hyd', :'u_dis', :'u_crew']::uuid[], ARRAY['vessel_members', 'owner_admins'], 'test:aud:1', 'safety/permits?tab=open', NULL, 'Permit to work') AS ob1 \gset
SELECT tests.reset_role();
SELECT tests.is(tests.recipients(:'ob1'), tests.uids(:'u_crew2', :'u_master', :'u_fm'),
  'vessel members (colleague, Master) and the company actor receive; never the actor, company B, a disabled user or someone without reach');
SELECT tests.results_eq(format($q$SELECT company_id, vessel_id, type_key, title, body, severity, link_scope, link_vessel_code, link_path, actor_user_id, processed_at IS NOT NULL, attempts, last_error
                                FROM public.notification_outbox WHERE id = %L$q$, :'ob1'),
  format($q$VALUES (%L::uuid, %L::uuid, 'record_update_posted'::text, 'New update on PTW-DRA-2026-001'::text, 'Permit to work'::text, 'info'::text, 'vessel'::text, 'DRA'::text,
                    'safety/permits?tab=open'::text, %L::uuid, true, 0, NULL::text)$q$, :'ca', :'dra', :'u_crew'),
  'the outbox row: the vessel''s stored code, the actor, processed inline');
SELECT tests.is((SELECT count(*) FROM public.notification_inbox AS i JOIN public.notification_outbox AS o ON o.id = i.outbox_id
                 WHERE i.outbox_id = :'ob1' AND (i.title, i.body, i.severity, i.link_scope, i.link_vessel_code, i.link_path, i.company_id, i.vessel_id, i.type_key)
                       IS NOT DISTINCT FROM (o.title, o.body, o.severity, o.link_scope, o.link_vessel_code, o.link_path, o.company_id, o.vessel_id, o.type_key)), 3::bigint,
  'fan-out copies title, body, severity and the link fields');
SELECT tests.as_user(:'u_crew');
SELECT tests.is(tests.emit('record_update_posted', :'ca', 'Again', 'vessel', :'dra', '{}', ARRAY['vessel_members'], 'test:aud:1'), :'ob1'::uuid, 'dedupe: the same key returns the existing id');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.notification_inbox WHERE outbox_id = :'ob1'), 3::bigint, 'and fans out nothing again');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE dedupe_key = 'test:aud:1'), 1::bigint, 'one outbox row per dedupe key');

-- Fleet reach audience and the DPA audience (no vessel: personal link).
SELECT tests.as_user(:'u_crew');
SELECT tests.emit('record_closed', :'ca', 'Fleet notice', 'personal', NULL, '{}', ARRAY['fleet_reach', 'dpa'], 'test:aud:2') AS ob2 \gset
SELECT tests.reset_role();
SELECT tests.is(tests.recipients(:'ob2'), tests.uids(:'u_fm'), 'fleet reach and DPA audiences: the fleet manager (dpa) only');
-- A fleet link reaches only fleet reach or company actors, even for must-act users.
SELECT tests.as_service();
SELECT tests.emit('record_closed', :'ca', 'Fleet record', 'fleet', NULL, ARRAY[:'u_crew', :'u_fm']::uuid[], '{}', 'test:aud:3') AS ob3 \gset
SELECT tests.reset_role();
SELECT tests.is(tests.recipients(:'ob3'), tests.uids(:'u_fm'), 'a fleet link drops a must-act user without fleet reach');
SELECT tests.is((SELECT actor_user_id FROM public.notification_outbox WHERE id = :'ob3'), NULL::uuid, 'the service role emits with no actor');
-- A personal link has no reach filter, so only the active check keeps a disabled must-act user out.
SELECT tests.as_service();
SELECT tests.emit('export_ready', :'ca', 'Personal', 'personal', NULL, ARRAY[:'u_dis', :'u_crew2', :'u_b']::uuid[], '{}', 'test:aud:4') AS ob3b \gset
SELECT tests.reset_role();
SELECT tests.is(tests.recipients(:'ob3b'), tests.uids(:'u_crew2'), 'a personal notification never reaches a disabled user or another company');

-- Preferences: in-app off removes a user; a type that is off by default needs an explicit opt-in.
INSERT INTO public.user_notification_preferences (user_id, notification_type_key, in_app_enabled) VALUES (:'u_master', 'record_update_posted', false);
SELECT tests.as_user(:'u_crew');
SELECT tests.emit('record_update_posted', :'ca', 'Prefs', 'vessel', :'dra', '{}', ARRAY['vessel_members'], 'test:pref:1') AS ob4 \gset
SELECT tests.reset_role();
SELECT tests.is(tests.recipients(:'ob4'), tests.uids(:'u_crew2', :'u_fm'), 'in_app_enabled = false is respected');
UPDATE public.notification_types SET default_enabled = false WHERE key = 'signature_reminder';
INSERT INTO public.user_notification_preferences (user_id, notification_type_key, in_app_enabled) VALUES (:'u_crew2', 'signature_reminder', true);
SELECT tests.as_user(:'u_crew');
SELECT tests.emit('signature_reminder', :'ca', 'Reminder', 'vessel', :'dra', '{}', ARRAY['vessel_members'], 'test:pref:2') AS ob5 \gset
SELECT tests.reset_role();
SELECT tests.is(tests.recipients(:'ob5'), tests.uids(:'u_crew2'), 'a type off by default reaches only users who opted in');
UPDATE public.notification_types SET default_enabled = true WHERE key = 'signature_reminder';
DELETE FROM public.user_notification_preferences WHERE user_id = :'u_master';

-- ------------------------------------------------------------ caller and input validation

SELECT tests.as_user(:'u_hyd');
SELECT tests.throws_like(format($q$SELECT tests.emit('record_closed', %L, 'T', 'vessel', %L)$q$, :'ca', :'dra'), '42501', 'notification_emit_denied', 'a caller without reach to the vessel cannot emit for it');
SELECT tests.ok(tests.emit('record_closed', :'ca', 'Fleet-level', 'personal') IS NOT NULL, 'a fleet-level event: any active member of the company');
SELECT tests.as_user(:'u_b');
SELECT tests.throws_like(format($q$SELECT tests.emit('record_closed', %L, 'T', 'personal')$q$, :'ca'), '42501', 'notification_emit_denied', 'company B cannot emit for company A');
SELECT tests.as_user(:'u_dis');
SELECT tests.throws_like(format($q$SELECT tests.emit('record_closed', %L, 'T', 'personal')$q$, :'ca'), '42501', 'notification_emit_denied', 'a disabled user cannot emit');
SELECT tests.as_user(:'u_fm');
SELECT tests.throws_like(format($q$SELECT tests.emit('no_such_type', %L, 'T', 'personal')$q$, :'ca'), '22023', 'unknown_notification_type', 'an unknown type is refused');
SELECT tests.throws_like(format($q$SELECT tests.emit('record_closed', %L, 'T', 'personal')$q$, tests.id('company:nowhere')), '22023', 'company_invalid', 'an unknown company is refused');
SELECT tests.throws_like(format($q$SELECT tests.emit('record_closed', %L, 'T', 'vessel', %L)$q$, :'ca', :'lev'), '22023', 'vessel_invalid', 'a vessel of another company is refused');
SELECT tests.throws_like(format($q$SELECT tests.emit('record_closed', %L, 'T', 'vessel')$q$, :'ca'), '22023', 'link_invalid', 'a vessel link needs a vessel');
SELECT tests.throws_like(format($q$SELECT tests.emit('record_closed', %L, 'T', 'workspace')$q$, :'ca'), '22023', 'link_invalid', 'a workspace link needs a workspace');
SELECT tests.throws_like(format($q$SELECT tests.emit('record_closed', %L, 'T', 'personal', NULL, '{}', '{}', NULL, NULL, 'hris')$q$, :'ca'), '22023', 'link_invalid', 'a workspace only with the workspace scope');
SELECT tests.throws_like(format($q$SELECT tests.emit('record_closed', %L, 'T', 'workspace', NULL, '{}', '{}', NULL, NULL, 'payroll')$q$, :'ca'), '22023', 'link_invalid', 'an unknown workspace is refused');
SELECT tests.ok(tests.emit('record_closed', :'ca', 'HR', 'workspace', NULL, '{}', '{}', NULL, 'people/123', 'hris') IS NOT NULL, 'a workspace link with a path');
SELECT tests.throws_like(format($q$SELECT tests.emit('record_closed', %L, 'T', 'fleet', NULL, '{}', '{}', NULL, %L)$q$, :'ca', p), '22023', 'link_invalid', format('an unsafe path is refused: %s', label))
FROM (VALUES ('/fleet/x', 'leading slash'), ('a/../b', '..'), ('a//b', '//'), (E'a\\b', 'backslash'), ('https://evil.example', 'scheme'),
             ('javascript:alert(1)', 'javascript scheme'), ('a/%2e%2e/b', '%2e'), ('a/%2E/b', '%2E'), (E'a\nb', 'control character'), (repeat('a', 501), 'too long')) AS v(p, label);
SELECT tests.throws_like(format($q$SELECT tests.emit('record_closed', %L, %L, 'personal')$q$, :'ca', repeat('t', 121)), '22023', 'title_invalid', 'a title over 120 characters is refused');
SELECT tests.throws_like(format($q$SELECT tests.emit('record_closed', %L, '   ', 'personal')$q$, :'ca'), '22023', 'title_invalid', 'a blank title is refused');
SELECT tests.throws_like(format($q$SELECT tests.emit('record_closed', %L, 'T', 'personal', NULL, '{}', '{}', NULL, NULL, NULL, %L)$q$, :'ca', repeat('b', 281)), '22023', 'body_too_long', 'a body over 280 characters is refused');
SELECT tests.throws_like(format($q$SELECT tests.emit('record_closed', %L, 'T', 'personal', NULL, '{}', ARRAY['everyone'])$q$, :'ca'), '22023', 'audience_invalid', 'an unknown audience is refused');
SELECT tests.throws_like(format($q$SELECT tests.emit('record_closed', %L, 'T', 'personal', NULL, '{}', '{}', NULL, NULL, NULL, NULL, 'urgent')$q$, :'ca'), '22023', 'severity_invalid', 'an unknown severity is refused');
SELECT tests.reset_role();

-- ------------------------------------------------------------ the inbox: own rows, column grants, mark all read

SELECT tests.as_user(:'u_crew2');
SELECT tests.ok((SELECT bool_and(user_id = :'u_crew2'::uuid) FROM public.notification_inbox), 'a user reads only their own inbox rows');
SELECT tests.is((SELECT count(*) FROM public.notification_inbox), 4::bigint, 'the colleague has four rows (two updates, one reminder, one personal)');
SELECT tests.lives(format($q$UPDATE public.notification_inbox SET read_at = now() WHERE outbox_id = %L$q$, :'ob1'), 'mark one read (read_at)');
SELECT tests.lives(format($q$UPDATE public.notification_inbox SET archived_at = now() WHERE outbox_id = %L$q$, :'ob5'), 'archive one (archived_at)');
SELECT tests.throws(format($q$UPDATE public.notification_inbox SET title = 'Changed' WHERE outbox_id = %L$q$, :'ob1'), '42501', 'no other column is writable (column grant)');
SELECT tests.throws(format($q$UPDATE public.notification_inbox SET user_id = %L WHERE outbox_id = %L$q$, :'u_crew', :'ob1'), '42501', 'user_id is not writable');
SELECT tests.throws(format($q$INSERT INTO public.notification_inbox (outbox_id, user_id, company_id, type_key, title, severity, link_scope) VALUES (%L, %L, %L, 'record_closed', 'x', 'info', 'personal')$q$, :'ob1', :'u_crew2', :'ca'), '42501', 'no insert into the inbox');
SELECT tests.throws(format($q$DELETE FROM public.notification_inbox WHERE outbox_id = %L$q$, :'ob1'), '42501', 'no delete from the inbox');
SELECT tests.denied(format($q$UPDATE public.notification_inbox SET read_at = now() WHERE user_id = %L RETURNING id$q$, :'u_master'), 'another user''s rows are not updatable');
SELECT tests.is(public.notification_inbox_mark_all_read(now() - interval '1 day'), 0, 'mark all read before yesterday: nothing');
SELECT tests.is(public.notification_inbox_mark_all_read(), 2, 'mark all read: the two unread, unarchived rows');
SELECT tests.is(public.notification_inbox_mark_all_read(), 0, 'again: nothing left');
SELECT tests.is((SELECT count(*) FROM public.notification_inbox WHERE read_at IS NULL), 1::bigint, 'the archived row stays unread');
SELECT tests.as_user(:'u_master');
SELECT tests.is((SELECT count(*) FROM public.notification_inbox WHERE read_at IS NOT NULL), 0::bigint, 'the colleague''s mark-all-read touched only their own rows');
SELECT tests.as_user(:'u_dis');
SELECT tests.is((SELECT count(*) FROM public.notification_inbox), 0::bigint, 'a disabled user reads no inbox row');
SELECT tests.is(public.notification_inbox_mark_all_read(), 0, 'a disabled user marks nothing');
SELECT tests.as_user(:'u_b');
SELECT tests.is((SELECT count(*) FROM public.notification_inbox), 0::bigint, 'company B reads nothing of company A');
SELECT tests.reset_role();

-- ------------------------------------------------------------ fan-out failure path and the retry processor

CREATE FUNCTION tests.inbox_refuses() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'test_inbox_down'; END $$;
CREATE TRIGGER test_inbox_refuses BEFORE INSERT ON public.notification_inbox FOR EACH ROW EXECUTE FUNCTION tests.inbox_refuses();

SELECT tests.as_user(:'u_crew');
SELECT tests.emit('record_update_posted', :'ca', 'Will fail', 'vessel', :'dra', '{}', ARRAY['vessel_members'], 'test:fail:1') AS ob6 \gset
SELECT tests.ok(:'ob6' IS NOT NULL, 'emit returns the outbox id although the fan-out failed (the caller is not rolled back)');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT processed_at IS NULL, attempts, last_error FROM public.notification_outbox WHERE id = %L$q$, :'ob6'),
  $q$VALUES (true, 1, 'fan_out_p0001'::text)$q$, 'the failed fan-out leaves the row unprocessed: attempts 1, a code');
SELECT tests.is((SELECT count(*) FROM public.notification_inbox WHERE outbox_id = :'ob6'), 0::bigint, 'no inbox row was written');

-- An engine action during the outage still commits.
SELECT tests.as_user(:'u_crew');
SELECT (public.record_open_envelope('test.permit', :'dra', tests.id('notify:outage'))).id AS env_out \gset
SELECT tests.is((public.record_post_thread_entry(tests.id('notify:outage:e1'), :'env_out', 'status_updates', 'update', 'Work started')) ->> 'ok', 'true', 'a thread post during the inbox outage succeeds');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT attempts, processed_at IS NULL FROM public.notification_outbox WHERE id = tests.event_outbox(%L, 'thread.update')$q$, :'env_out'),
  $q$VALUES (1, true)$q$, 'its notification waits in the outbox (attempts 1)');

SELECT tests.as_service();
SELECT tests.is(public.process_notification_outbox(), 0, 'the processor cannot deliver while the inbox refuses');
SELECT tests.reset_role();
SELECT tests.is((SELECT attempts FROM public.notification_outbox WHERE id = :'ob6'), 2, 'a failed retry counts an attempt');
DROP TRIGGER test_inbox_refuses ON public.notification_inbox;
UPDATE public.notification_outbox SET attempts = 5 WHERE id = tests.event_outbox(:'env_out', 'thread.update');
SELECT tests.as_service();
SELECT tests.is(public.process_notification_outbox(), 1, 'the processor delivers the retryable row');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT processed_at IS NOT NULL, attempts, last_error FROM public.notification_outbox WHERE id = %L$q$, :'ob6'),
  $q$VALUES (true, 2, NULL::text)$q$, 'delivered on retry; the attempts stay as history');
SELECT tests.is(tests.recipients(:'ob6'), tests.uids(:'u_crew2', :'u_master', :'u_fm'), 'the retry fans out to the same audience (actor removed)');
SELECT tests.is((SELECT processed_at FROM public.notification_outbox WHERE id = tests.event_outbox(:'env_out', 'thread.update')), NULL::timestamptz, 'a row at 5 attempts is not retried');
SELECT tests.as_service();
SELECT tests.is(public.process_notification_outbox(), 0, 'nothing left to process');
SELECT tests.reset_role();
SELECT tests.throws_like(format($q$UPDATE public.notification_outbox SET title = 'Changed' WHERE id = %L$q$, :'ob6'), '42501', 'notification_outbox_is_append_only', 'the outbox is append-only except its processing state');

-- ------------------------------------------------------------ an emit failure keeps the engine transition

DELETE FROM public.notification_types WHERE key = 'record_submitted_to_company';
SELECT tests.as_user(:'u_crew');
SELECT (public.record_open_envelope('test.permit', :'dra', tests.id('notify:emitfail'))).id AS env_fail \gset
SELECT tests.is((public.record_sign_slot(tests.id('notify:emitfail:s1'), tests.slot_of(:'env_fail', 'prepared_by'), 'verified')) ->> 'ok', 'true', 'crew sign the first slot');
SELECT tests.as_user(:'u_crew2');
SELECT tests.is((public.record_sign_slot(tests.id('notify:emitfail:s2'), tests.slot_of(:'env_fail', 'checked_by'), 'verified')) ->> 'ok', 'true', 'the colleague signs the last vessel slot while the type is missing');
SELECT tests.reset_role();
SELECT tests.is((SELECT status FROM public.record_envelopes WHERE id = :'env_fail'), 'awaiting_company_close', 'the transition committed although its notification failed (WARNING, CC-16)');
SELECT tests.is((SELECT count(*) FROM public.record_events WHERE envelope_id = :'env_fail' AND notification_type = 'record_submitted_to_company'), 1::bigint, 'the event row stays');
SELECT tests.is(tests.event_outbox(:'env_fail', 'vessel_sign', 'awaiting_company_close'), NULL::uuid, 'and nothing is claimed as sent (no outbox row)');
INSERT INTO public.notification_types (key, name, category, cadence, description, default_enabled, sort_order)
VALUES ('record_submitted_to_company', 'Record submitted to the company', 'Records', 'realtime', 'A vessel record is ready for the company', true, 310);

-- ------------------------------------------------------------ one event per transition, with the right audience

SELECT tests.as_user(:'u_crew');
SELECT (public.record_open_envelope('test.permit', :'dra', tests.id('notify:flow'))).id AS env \gset
SELECT reference AS env_ref FROM public.record_envelopes WHERE id = :'env' \gset
SELECT tests.is((public.record_sign_slot(tests.id('notify:flow:s1'), tests.slot_of(:'env', 'prepared_by'), 'verified')) ->> 'ok', 'true', 'crew sign: the next named slot opens');
SELECT tests.reset_role();
SELECT tests.is(tests.recipients(tests.event_outbox(:'env', 'signature.slot_opened')), tests.uids(:'u_crew2'),
  'signature_requested reaches the colleague named on the next slot (internal reach inside the crew member''s transaction)');
SELECT tests.results_eq(format($q$SELECT severity, title, link_scope, link_vessel_code, record_kind, record_id, record_ref, envelope_id FROM public.notification_outbox WHERE id = %L$q$, tests.event_outbox(:'env', 'signature.slot_opened')),
  format($q$VALUES ('warning'::text, %L::text, 'vessel'::text, 'DRA'::text, 'test.permit'::text, %L::uuid, %L::text, %L::uuid)$q$,
         'Your signature is requested on ' || :'env_ref', tests.id('notify:flow'), :'env_ref', :'env'),
  'signature_requested: warning, the reference in the title, a vessel link to the record (kind + entity id)');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE envelope_id = :'env'), 1::bigint, 'the first signature (in review) emits only the request');
SELECT tests.as_user(:'u_crew2');
SELECT tests.is((public.record_sign_slot(tests.id('notify:flow:s2'), tests.slot_of(:'env', 'checked_by'), 'verified')) ->> 'ok', 'true', 'the colleague signs the last vessel slot');
SELECT tests.reset_role();
SELECT tests.is(tests.recipients(tests.event_outbox(:'env', 'vessel_sign', 'awaiting_company_close')), tests.uids(:'u_fm'),
  'record_submitted_to_company reaches the company actors only');
SELECT tests.results_eq(format($q$SELECT severity, title FROM public.notification_outbox WHERE id = %L$q$, tests.event_outbox(:'env', 'vessel_sign', 'awaiting_company_close')),
  format($q$VALUES ('warning'::text, %L::text)$q$, :'env_ref' || ' submitted to the company'), 'submitted: warning, "<ref> submitted to the company"');

SELECT tests.as_user(:'u_crew2');
SELECT tests.is((public.record_post_thread_entry(tests.id('notify:flow:e1'), :'env', 'status_updates', 'update', 'Isolation in place')) ->> 'ok', 'true', 'the vessel posts an update');
SELECT tests.as_user(:'u_fm');
SELECT tests.is((public.record_post_thread_entry(tests.id('notify:flow:e2'), :'env', 'status_updates', 'update', 'Noted')) ->> 'ok', 'true', 'the company posts an update');
SELECT tests.reset_role();
SELECT tests.is(tests.recipients((SELECT o.id FROM public.record_events AS ev JOIN public.notification_outbox AS o ON o.dedupe_key = 'event:' || ev.id::text
                                  WHERE ev.envelope_id = :'env' AND ev.action = 'thread.update' AND ev.party = 'vessel')), tests.uids(:'u_fm'),
  'a vessel update reaches the company actors');
SELECT tests.is(tests.recipients((SELECT o.id FROM public.record_events AS ev JOIN public.notification_outbox AS o ON o.dedupe_key = 'event:' || ev.id::text
                                  WHERE ev.envelope_id = :'env' AND ev.action = 'thread.update' AND ev.party = 'company')), tests.uids(:'u_crew', :'u_crew2', :'u_master'),
  'a company update reaches the vessel''s members (not other vessels, not the poster)');

SELECT tests.as_user(:'u_fm');
SELECT tests.is((public.record_transition(:'env', 'acknowledge')) ->> 'ok', 'true', 'the company acknowledges');
SELECT tests.reset_role();
SELECT tests.is(tests.recipients(tests.event_outbox(:'env', 'acknowledge')), tests.uids(:'u_crew', :'u_crew2'), 'record_acknowledged: the opener and the cycle''s signers');
SELECT tests.is((SELECT severity FROM public.notification_outbox WHERE id = tests.event_outbox(:'env', 'acknowledge')), 'info', 'acknowledged: info');

SELECT tests.as_user(:'u_fm');
SELECT tests.is((public.record_post_thread_entry(tests.id('notify:flow:r1'), :'env', 'status_updates', 'request', 'Send the gas readings', NULL, current_date + 2)) ->> 'ok', 'true', 'the company asks for an update');
SELECT tests.reset_role();
SELECT tests.is(tests.recipients(tests.event_outbox(:'env', 'thread.request')), tests.uids(:'u_crew'), 'status_request_posted: the opener');
SELECT tests.results_eq(format($q$SELECT type_key, severity FROM public.notification_outbox WHERE id = %L$q$, tests.event_outbox(:'env', 'thread.request')),
  $q$VALUES ('status_request_posted'::text, 'warning'::text)$q$, 'request: warning');

SELECT tests.as_user(:'u_fm');
SELECT tests.is((public.record_transition(:'env', 'return_to_vessel', '{"reason": "Readings missing"}')) ->> 'ok', 'true', 'the company returns the record (D-30)');
SELECT tests.reset_role();
SELECT tests.is(tests.recipients(tests.event_outbox(:'env', 'return_to_vessel')), tests.uids(:'u_crew', :'u_crew2'), 'record_returned: the opener and the vessel signers of the returned cycle');
SELECT tests.results_eq(format($q$SELECT severity, title FROM public.notification_outbox WHERE id = %L$q$, tests.event_outbox(:'env', 'return_to_vessel')),
  format($q$VALUES ('warning'::text, %L::text)$q$, :'env_ref' || ' returned to the vessel'), 'returned: warning, "<ref> returned to the vessel" (no names)');

SELECT tests.is(
  (SELECT count(*) FROM public.record_events WHERE envelope_id = :'env' AND notification_type IS NOT NULL
     AND NOT (notification_type = 'signature_requested' AND payload -> 'must_act_user_ids' = '[]'::jsonb)),
  (SELECT count(*) FROM public.notification_outbox WHERE envelope_id = :'env'),
  'exactly one outbox row per notifying event of the record (a slot with nobody named emits nothing)');
SELECT tests.is((SELECT count(*) FROM public.record_events WHERE envelope_id = :'env' AND notification_type = 'signature_requested' AND payload -> 'must_act_user_ids' = '[]'::jsonb), 1::bigint,
  'the company slot that opened names nobody, so its request reaches no one');
SELECT tests.is((SELECT count(DISTINCT dedupe_key) FROM public.notification_outbox WHERE envelope_id = :'env'), (SELECT count(*) FROM public.notification_outbox WHERE envelope_id = :'env'),
  'each keyed by its event');
SELECT tests.is((SELECT count(*) FROM public.notification_inbox WHERE user_id IN (:'u_b', :'u_hyd', :'u_dis') AND company_id = :'ca'), 0::bigint,
  'company B, other-vessel crew and the disabled user received nothing');

-- Decisions: not approved is a warning.
INSERT INTO public.record_events (company_id, vessel_id, module_key, kind_key, envelope_id, reference, action, party, cycle, payload, notification_type)
SELECT company_id, vessel_id, module_key, kind_key, id, reference, 'decide', 'company', current_cycle, '{"decision": "not_approved"}', 'record_decision'
FROM public.record_envelopes WHERE id = :'env' RETURNING id AS ev_dec \gset
SELECT tests.results_eq(format($q$SELECT severity, title FROM public.notification_outbox WHERE dedupe_key = %L$q$, 'event:' || :'ev_dec'),
  format($q$VALUES ('warning'::text, %L::text)$q$, :'env_ref' || ' not approved by the company'), 'a not-approved decision is a warning');

-- Titles are cut to the CHECK limits instead of failing the event.
INSERT INTO public.record_events (company_id, vessel_id, module_key, kind_key, envelope_id, reference, action, party, cycle, notification_type)
SELECT company_id, vessel_id, module_key, kind_key, id, repeat('R', 200), 'test.long', 'system', current_cycle, 'record_closed'
FROM public.record_envelopes WHERE id = :'env' RETURNING id AS ev_long \gset
SELECT tests.results_eq(format($q$SELECT length(title), left(title, 3), length(record_ref) FROM public.notification_outbox WHERE dedupe_key = %L$q$, 'event:' || :'ev_long'),
  $q$VALUES (120, 'RRR'::text, 120)$q$, 'a long reference is cut to 120 characters, not refused');

-- Fleet records link to the Fleet view.
SELECT tests.as_user(:'u_fm');
SELECT (public.record_open_envelope('test.fleet_review')).id AS fenv \gset
SELECT tests.reset_role();
INSERT INTO public.record_events (company_id, module_key, kind_key, envelope_id, reference, action, party, cycle, notification_type)
SELECT company_id, module_key, kind_key, id, reference, 'void', 'company', 1, 'record_voided' FROM public.record_envelopes WHERE id = :'fenv' RETURNING id AS ev_void \gset
SELECT tests.results_eq(format($q$SELECT link_scope, link_vessel_code, record_kind, audience FROM public.notification_outbox WHERE dedupe_key = %L$q$, 'event:' || :'ev_void'),
  $q$VALUES ('fleet'::text, NULL::text, 'test.fleet_review'::text, ARRAY['owner_admins']::text[])$q$, 'a fleet record''s notification links to the Fleet view');
SELECT tests.is(tests.recipients((SELECT id FROM public.notification_outbox WHERE dedupe_key = 'event:' || :'ev_void')), tests.uids(:'u_fm'), 'record_voided: company actors and the opener');

-- ------------------------------------------------------------ export notifications

SELECT tests.as_user(:'u_crew');
SELECT (public.request_export('csv', 'safety.incidents:register', '{}', false, :'dra')).id AS job \gset
SELECT tests.reset_role();
SELECT tests.as_service();
SELECT public.export_job_transition(:'job', 'running');
SELECT public.export_job_transition(:'job', 'ready', jsonb_build_object('storage_path', 'exports/a.csv', 'size_bytes', 5, 'sha256', repeat('c', 64)));
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT o.type_key, o.severity, o.link_scope, o.title, o.body, o.record_kind FROM public.notification_outbox AS o JOIN public.record_events AS ev ON o.dedupe_key = 'event:' || ev.id::text WHERE ev.entity_id = %L$q$, :'job'),
  $q$VALUES ('export_ready'::text, 'info'::text, 'personal'::text, 'Your export is ready'::text, 'CSV file · safety.incidents:register'::text, NULL::text)$q$,
  'export_ready: one personal notification');
SELECT tests.is(tests.recipients((SELECT o.id FROM public.notification_outbox AS o JOIN public.record_events AS ev ON o.dedupe_key = 'event:' || ev.id::text WHERE ev.entity_id = :'job')),
  tests.uids(:'u_crew'), 'export_ready reaches the requester only');
SELECT tests.as_user(:'u_crew');
SELECT (public.request_export('xlsx', 'crew.roster', '{}', false, :'dra')).id AS job2 \gset
SELECT tests.reset_role();
SELECT tests.as_service();
SELECT public.export_job_transition(:'job2', 'failed', '{"error_code": "builder_missing"}');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT o.type_key, o.severity FROM public.notification_outbox AS o JOIN public.record_events AS ev ON o.dedupe_key = 'event:' || ev.id::text WHERE ev.entity_id = %L$q$, :'job2'),
  $q$VALUES ('export_failed'::text, 'warning'::text)$q$, 'export_failed: a warning to the requester');

-- ------------------------------------------------------------ realtime

SELECT tests.ok(
  NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
  OR EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notification_inbox'),
  'the inbox is in the supabase_realtime publication (when it exists)');
SELECT tests.ok(EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'), 'the harness has the publication (the check above is not vacuous)');
