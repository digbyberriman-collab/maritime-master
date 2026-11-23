-- Record registry (spec §A.10; D-32, D-132): record_kinds catalogue and its
-- slot-template CHECK, record_open_envelope (reference, cycle-1 slots,
-- idempotent on kind + entity, access), the status guard (refused for
-- authenticated AND service_role), append-only events and snapshots,
-- isolation (company B, crew of another vessel, disabled users, anon),
-- the vessel code lock by a real envelope (D2 followup), ACLs.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user('A', 'A.crew_dra', 'crew');
SELECT tests.seed_assignment('A.crew_dra', 'A.dra', true, 'Deckhand');
SELECT tests.seed_user('A', 'A.off_dra', 'crew');
SELECT tests.seed_assignment('A.off_dra', 'A.dra', true, 'Deckhand');
UPDATE public.account_memberships SET status = 'disabled' WHERE user_id = tests.user_id('A.off_dra');

INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, route_pattern, company_step, allow_reopen, allow_close_as, edit_after_sign, delete_rule, slot_template)
VALUES
  ('test.permit', 'test', 'Permit to work', 'PTW', 'vessel', '/v/:vesselCode/safety/permits/:id', 'sign_off', true, true, 'lock', 'never_after_submit',
   jsonb_build_array(
     jsonb_build_object('key', 'prepared_by', 'label', 'Prepared by', 'order', 1, 'party', 'vessel', 'named_profile_ids', jsonb_build_array(tests.profile_id('A.crew_dra'))),
     jsonb_build_object('key', 'master', 'label', 'Master', 'order', 2, 'party', 'vessel', 'office_key', 'master'),
     jsonb_build_object('key', 'company_review', 'label', 'Company review', 'order', 3, 'party', 'company'))),
  ('test.fleet_review', 'test', 'Fleet review', 'FRV', 'fleet', '/fleet/reviews/:id', 'sign_off', false, false, 'lock', 'draft_only', '[]'::jsonb);

-- ------------------------------------------------------------ record_kinds

SELECT tests.throws_like($q$INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, company_step, edit_after_sign, delete_rule, slot_template)
  VALUES ('test.bad1', 'test', 'Bad', 'BADA', 'vessel', 'none', 'lock', 'draft_only', '[{"key":"company","label":"Company","order":1,"party":"company"}]')$q$,
  '23514', '%record_kinds_slot_template_check%', 'company slots need a company step');
SELECT tests.throws_like($q$INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, company_step, edit_after_sign, delete_rule, slot_template)
  VALUES ('test.bad2', 'test', 'Bad', 'BADB', 'vessel', 'sign_off', 'lock', 'draft_only', '[{"key":"a","label":"A","order":1,"party":"vessel"},{"key":"a","label":"A","order":2,"party":"vessel"}]')$q$,
  '23514', '%record_kinds_slot_template_check%', 'duplicate slot keys');
SELECT tests.throws_like($q$INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, company_step, edit_after_sign, delete_rule, slot_template)
  VALUES ('test.bad3', 'test', 'Bad', 'BADC', 'vessel', 'sign_off', 'lock', 'draft_only', '[{"key":"a","label":"A","order":0.5,"party":"vessel"}]')$q$,
  '23514', '%record_kinds_slot_template_check%', 'orders are whole numbers >= 1');
SELECT tests.throws_like($q$INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, company_step, edit_after_sign, delete_rule, slot_template)
  VALUES ('test.bad4', 'test', 'Bad', 'BADD', 'vessel', 'sign_off', 'lock', 'draft_only', '[{"key":"c","label":"C","order":1,"party":"company","allow_visitor":true}]')$q$,
  '23514', '%record_kinds_slot_template_check%', 'no visitors on company slots');
SELECT tests.throws_like($q$INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, company_step, edit_after_sign, delete_rule, slot_template)
  VALUES ('test.bad5', 'test', 'Bad', 'BADE', 'vessel', 'sign_off', 'lock', 'draft_only', '[{"key":"a","label":"A","order":1,"party":"vessel","distinct_from":["ghost"]}]')$q$,
  '23514', '%record_kinds_slot_template_check%', 'distinct_from names a known slot or creator');
SELECT tests.throws_like($q$INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, company_step, report_first, edit_after_sign, delete_rule)
  VALUES ('test.bad6', 'test', 'Bad', 'BADF', 'vessel', 'none', true, 'lock', 'draft_only')$q$, '23514', '%record_kinds_report_first_step%', 'report-first kinds go to the company');
SELECT tests.throws_like($q$INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, route_pattern, company_step, edit_after_sign, delete_rule)
  VALUES ('test.bad7', 'test', 'Bad', 'BADG', 'vessel', '/safety/x/:id', 'none', 'lock', 'draft_only')$q$, '23514', '%record_kinds_route_pattern_check%', 'vessel records live under /v/:vesselCode/');
SELECT tests.throws_like($q$INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, company_step, edit_after_sign, delete_rule)
  VALUES ('other.kind', 'test', 'Bad', 'BADH', 'vessel', 'none', 'lock', 'draft_only')$q$, '23514', '%record_kinds_module_key_check%', 'module_key is the key''s first segment');
SELECT tests.ok(public.record_slot_template_valid('[]', 'none'), 'an empty template is valid');
SELECT tests.ok(NOT public.record_slot_template_valid('{}', 'none'), 'a template is an array');
SELECT tests.ok((SELECT provolatile = 'i' FROM pg_proc WHERE oid = 'public.record_slot_template_valid(jsonb,text)'::regprocedure), 'the CHECK function is IMMUTABLE');

SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is((SELECT count(*) FROM public.record_kinds WHERE key LIKE 'test.%'), 2::bigint, 'an active user reads the catalogue');
SELECT tests.throws($q$INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, company_step, edit_after_sign, delete_rule) VALUES ('test.mine', 'test', 'Mine', 'MINE', 'vessel', 'none', 'lock', 'free')$q$, '42501', 'tenants cannot add kinds');
SELECT tests.denied($q$UPDATE public.record_kinds SET label = 'x' WHERE key = 'test.permit' RETURNING key$q$, 'tenants cannot change kinds');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is_empty('SELECT 1 FROM public.record_kinds', 'a disabled user reads no kind');
SELECT tests.as_anon();
SELECT tests.denied('SELECT * FROM public.record_kinds', 'anon reads no kind');
SELECT tests.reset_role();

-- ------------------------------------------------------------ record_open_envelope

SELECT tests.as_user(tests.user_id('A.crew_dra'));
-- An entity-bound envelope from a session needs the domain flag (a domain
-- definer that verified the entity sets it); the browser call is refused.
SELECT tests.throws_like(format($q$SELECT public.record_open_envelope('test.permit', %L, %L)$q$, tests.vessel_id('A.dra'), tests.id('permit:1')),
                         '22023', 'entity_unverified', 'a browser call with an entity id is refused');
SELECT tests.is((SELECT count(*) FROM public.record_envelopes WHERE entity_id = tests.id('permit:1')), 0::bigint, 'and opens nothing');
SELECT set_config('storm.record_domain', 'on', true);
CREATE TEMP TABLE env ON COMMIT DROP AS SELECT * FROM public.record_open_envelope('test.permit', tests.vessel_id('A.dra'), tests.id('permit:1'), '  Hot work, engine room  ');
SELECT set_config('storm.record_domain', '', true);
GRANT SELECT ON env TO PUBLIC;
SELECT tests.reset_role();
SELECT tests.results_eq(
  'SELECT status, whose_move, current_cycle, version, module_key, title, company_id, vessel_id, opened_by FROM env',
  format($q$VALUES ('open'::text, 'vessel'::text, 1, 1, 'test'::text, 'Hot work, engine room'::text, %L::uuid, %L::uuid, %L::uuid)$q$, tests.company_id('A'), tests.vessel_id('A.dra'), tests.user_id('A.crew_dra')),
  'opened: open, vessel''s move, cycle 1, version 1, the title trimmed, the opener');
SELECT tests.ok((SELECT reference ~ ('^PTW-' || (SELECT code FROM public.vessels WHERE id = tests.vessel_id('A.dra')) || '-' || to_char(current_date, 'YYYY') || '-001$') FROM env),
  'the reference is PTW-<vessel code>-<year>-001 (format_reference)');
SELECT tests.is((SELECT count(*) FROM public.record_signature_slots WHERE envelope_id = (SELECT id FROM env) AND cycle = 1), 3::bigint, 'the three cycle-1 slots are instantiated');
SELECT tests.results_eq(
  format('SELECT slot_key, order_no, party, required, allow_witnessed FROM public.record_signature_slots WHERE envelope_id = %L', (SELECT id FROM env)),
  $q$VALUES ('prepared_by'::text, 1, 'vessel'::text, true, true), ('master', 2, 'vessel', true, true), ('company_review', 3, 'company', true, false)$q$,
  'template defaults: required, witnessed on vessel slots only');
SELECT tests.is((SELECT count(*) FROM public.record_events WHERE envelope_id = (SELECT id FROM env) AND action = 'created' AND party = 'vessel'), 1::bigint, 'event created');
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT set_config('storm.record_domain', 'on', true);
SELECT tests.is((public.record_open_envelope('test.permit', tests.vessel_id('A.dra'), tests.id('permit:1'))).id, (SELECT id FROM env), 'idempotent on (kind, entity): the same envelope (with the domain flag the call works)');
-- The idempotent branch never hands back an envelope of another vessel.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format($q$SELECT public.record_open_envelope('test.permit', %L, %L, 'real')$q$, tests.vessel_id('A.hyd'), tests.id('permit:1')),
                         '22023', 'envelope_scope_mismatch', 'the same entity asked for on another vessel is refused (not the DRAAK envelope)');
SELECT set_config('storm.record_domain', '', true);
-- A second company cannot pre-bind an entity id: its browser call is refused,
-- so the id stays free for its real owner. (Inside a savepoint: the extra
-- envelopes are rolled back so the counts below stay as they were.)
SAVEPOINT entity_checks;
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(format($q$SELECT public.record_open_envelope('test.permit', %L, %L)$q$, tests.vessel_id('B.lev'), tests.id('a-entity-2')),
                         '22023', 'entity_unverified', 'company B cannot pre-bind an entity id from a session');
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT set_config('storm.record_domain', 'on', true);
SELECT tests.ok((public.record_open_envelope('test.permit', tests.vessel_id('A.dra'), tests.id('a-entity-2'))).company_id = tests.company_id('A'), 'its owner opens it');
SELECT set_config('storm.record_domain', '', true);
SELECT tests.reset_role();
-- The service role (no JWT) is trusted with entity ids.
SELECT tests.as_service();
SELECT tests.ok((public.record_open_envelope('test.permit', tests.vessel_id('A.dra'), tests.id('svc-entity'))).id IS NOT NULL, 'the service role opens an entity-bound envelope without the flag');
ROLLBACK TO SAVEPOINT entity_checks;
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.record_envelopes WHERE kind_key = 'test.permit'), 1::bigint, 'no second envelope, no second reference');
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.ok((public.record_open_envelope('test.permit', tests.vessel_id('A.dra'))).reference LIKE '%-002', 'a second permit takes the next number');
SELECT tests.throws_like($q$SELECT public.record_open_envelope('test.nope', NULL)$q$, '22023', 'record_kind_unknown', 'unknown kind');
SELECT tests.throws_like($q$SELECT public.record_open_envelope('test.permit', NULL)$q$, '22023', 'vessel_required', 'a vessel kind needs a vessel');
SELECT tests.throws_like(format($q$SELECT public.record_open_envelope('test.permit', %L)$q$, tests.vessel_id('A.hyd')), '42501', 'record_access_denied', 'crew cannot open a record on a vessel they do not reach');
SELECT tests.throws_like(format($q$SELECT public.record_open_envelope('test.permit', %L)$q$, tests.vessel_id('B.lev')), '42501', 'record_access_denied', 'nor on another company''s vessel');
SELECT tests.throws_like($q$SELECT public.record_open_envelope('test.fleet_review', NULL)$q$, '42501', 'record_access_denied', 'crew cannot open a fleet record');
SELECT tests.throws_like(format($q$SELECT public.record_open_envelope('test.permit', %L, NULL, %L)$q$, tests.vessel_id('A.dra'), repeat('x', 201)), '22023', 'title_too_long', 'titles stay within 200 characters');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(format($q$SELECT public.record_open_envelope('test.permit', %L, %L)$q$, tests.vessel_id('A.dra'), tests.id('permit:1')), '42501', 'record_access_denied', 'company B cannot open (or fetch) A''s envelope through the idempotency key');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
CREATE TEMP TABLE fleet_env ON COMMIT DROP AS SELECT * FROM public.record_open_envelope('test.fleet_review', NULL, NULL, 'Annual review');
GRANT SELECT ON fleet_env TO PUBLIC;
SELECT tests.ok((SELECT vessel_id IS NULL AND company_id = tests.company_id('A') AND reference ~ ('^FRV-' || to_char(current_date, 'YYYY') || '-001$') FROM fleet_env),
  'a fleet record: no vessel, the fleet reference form');
SELECT tests.throws_like(format($q$SELECT public.record_open_envelope('test.fleet_review', %L)$q$, tests.vessel_id('A.dra')), '22023', 'fleet_record_has_no_vessel', 'a fleet record has no vessel');
SELECT tests.as_user(tests.user_id('A.off_dra'));
SELECT tests.throws_like(format($q$SELECT public.record_open_envelope('test.permit', %L)$q$, tests.vessel_id('A.dra')), '42501', 'record_access_denied', 'a disabled user cannot open a record');
SELECT tests.reset_role();

-- ------------------------------------------------------------ reads (RLS)

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.ok((SELECT count(*) FROM public.record_envelopes) = 2, 'crew on the vessel read its records (not the fleet record)');
SELECT tests.ok((SELECT count(*) FROM public.record_events) >= 2, 'and their events');
SELECT tests.ok((SELECT count(*) FROM public.record_signature_slots) = 6, 'and their slots');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.ok((SELECT count(*) FROM public.record_envelopes) = 2, 'the Master reads the vessel''s records');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.ok((SELECT count(*) FROM public.record_envelopes) = 3, 'fleet reach reads every record of the company, fleet records included');
DO $$
DECLARE p text; t text;
BEGIN
  FOREACH p IN ARRAY ARRAY['A.crew_hyd', 'B.admin', 'A.disabled', 'A.off_dra'] LOOP
    PERFORM tests.as_user(tests.user_id(p));
    FOREACH t IN ARRAY ARRAY['record_envelopes', 'record_events', 'record_snapshots', 'record_signature_slots', 'record_signatures', 'record_signature_slot_states', 'record_threads', 'record_thread_entries'] LOOP
      PERFORM tests.is_empty(format('SELECT 1 FROM public.%I WHERE company_id = %L', t, tests.company_id('A')), format('%s reads no row of %s', p, t));
    END LOOP;
  END LOOP;
END
$$;
SELECT tests.as_anon();
SELECT tests.denied('SELECT * FROM public.record_envelopes', 'anon reads no envelope');
SELECT tests.denied('SELECT * FROM public.record_signature_slot_states', 'anon reads no slot state');
SELECT tests.reset_role();

-- ------------------------------------------------------------ the status guard (D-132)

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws(format($q$UPDATE public.record_envelopes SET status = 'closed' WHERE id = %L$q$, (SELECT id FROM env)), '42501', 'authenticated: no UPDATE privilege on envelopes');
SELECT tests.throws(format($q$INSERT INTO public.record_envelopes (company_id, module_key, kind_key, reference) VALUES (%L, 'test', 'test.fleet_review', 'X')$q$, tests.company_id('A')), '42501', 'authenticated: no INSERT');
SELECT tests.as_service();
SELECT tests.throws_like(format($q$UPDATE public.record_envelopes SET status = 'closed' WHERE id = %L$q$, (SELECT id FROM env)), '42501', 'record_status_is_server_owned', 'service_role: a direct status change is refused');
SELECT tests.throws_like(format($q$UPDATE public.record_envelopes SET version = version + 1 WHERE id = %L$q$, (SELECT id FROM env)), '42501', 'record_status_is_server_owned', 'service_role: nor a version bump');
SELECT tests.throws_like(format($q$UPDATE public.record_envelopes SET current_cycle = 2, acknowledged_cycle = 1 WHERE id = %L$q$, (SELECT id FROM env)), '42501', 'record_status_is_server_owned', 'service_role: nor a cycle change');
SELECT tests.throws_like(format($q$DELETE FROM public.record_envelopes WHERE id = %L$q$, (SELECT id FROM env)), '42501', 'record_status_is_server_owned', 'service_role: no delete');
SELECT tests.throws_like(format($q$INSERT INTO public.record_envelopes (company_id, module_key, kind_key, reference, status) VALUES (%L, 'test', 'test.fleet_review', 'FAKE-1', 'closed')$q$, tests.company_id('A')), '42501', 'record_status_is_server_owned', 'service_role: a record cannot be created closed');
SELECT tests.lives(format($q$UPDATE public.record_envelopes SET title = 'Hot work, engine room (rev)' WHERE id = %L$q$, (SELECT id FROM env)), 'service_role: non-status columns may change');
SELECT tests.reset_role();
SELECT tests.throws_like(format($q$UPDATE public.record_envelopes SET status = 'void', voided_at = now() WHERE id = %L$q$, (SELECT id FROM env)), '42501', 'record_status_is_server_owned', 'the SQL editor too (no JWT, no flag)');
SELECT set_config('storm.record_engine', 'on', true);
SELECT tests.lives(format($q$UPDATE public.record_envelopes SET whose_move = 'vessel' WHERE id = %L$q$, (SELECT id FROM env)), 'with the engine flag the guard steps aside');
SELECT set_config('storm.record_engine', '', true);

-- ------------------------------------------------------------ append-only history

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['authenticated', 'service_role', 'superuser'] LOOP
    IF r = 'authenticated' THEN PERFORM tests.as_user(tests.user_id('A.fleet_manager'));
    ELSIF r = 'service_role' THEN PERFORM tests.as_service();
    ELSE PERFORM tests.reset_role();
    END IF;
    PERFORM tests.throws(format($q$UPDATE public.record_events SET reason = 'edited' WHERE envelope_id = %L$q$, (SELECT id FROM env)), '42501', r || ': record_events UPDATE refused');
    PERFORM tests.throws(format($q$DELETE FROM public.record_events WHERE envelope_id = %L$q$, (SELECT id FROM env)), '42501', r || ': record_events DELETE refused');
    IF r = 'authenticated' THEN
      PERFORM tests.throws(format($q$INSERT INTO public.record_events (company_id, module_key, action, party) VALUES (%L, 'test', 'forged', 'company')$q$, tests.company_id('A')), '42501', r || ': no INSERT into record_events');
    END IF;
  END LOOP;
END
$$;
SELECT tests.reset_role();
SELECT tests.ok(NOT has_table_privilege('authenticated', 'public.record_events', 'INSERT') AND NOT has_table_privilege('authenticated', 'public.record_events', 'UPDATE')
            AND NOT has_table_privilege('authenticated', 'public.record_snapshots', 'INSERT'), 'authenticated has SELECT only on events and snapshots');
SELECT set_config('storm.record_purge', 'on', true);
SELECT tests.lives(format($q$UPDATE public.record_events SET reason = 'purged' WHERE envelope_id = %L$q$, (SELECT id FROM env)), 'only a purge job (storm.record_purge) may change history');
SELECT set_config('storm.record_purge', '', true);

-- ------------------------------------------------------------ the vessel code lock by a real envelope (file 1, D2 followup)

DELETE FROM public.reference_counters WHERE scope LIKE '%' || tests.vessel_id('A.dra')::text || '%';
SELECT tests.throws_like(format($q$UPDATE public.vessels SET code = 'DRX' WHERE id = %L$q$, tests.vessel_id('A.dra')), '23514', 'vessel_code_locked', 'a vessel with a record envelope keeps its code (no reference counter needed)');
SELECT tests.lives(format($q$UPDATE public.vessels SET code = 'GMX' WHERE id = %L$q$, tests.vessel_id('A.gam')), 'a vessel without records may still be re-coded');

-- ------------------------------------------------------------ ACLs (rule 5)

SELECT tests.ok(has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE'), f || ': authenticated, not anon')
FROM unnest(ARRAY['public.record_open_envelope(text,uuid,uuid,text)', 'public.record_transition(uuid,text,jsonb,integer)', 'public.record_readable(uuid,uuid)',
                  'public.record_transition_decide(jsonb,jsonb)', 'public.record_vessel_signatures_locked(jsonb,integer)']) AS f;
SELECT tests.ok(NOT has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE') AND has_function_privilege('service_role', f, 'EXECUTE'), f || ': service role only')
FROM unnest(ARRAY['public.record_engine_apply(uuid,text,text,jsonb,jsonb)', 'public.record_whose_move(uuid)', 'public.record_set_section_digests(uuid,jsonb)',
                  'public.record_slot_digest(uuid,text[])', 'public.record_log_event(uuid,text,text,jsonb,text,text)', 'public.record_state_of(uuid)',
                  'public.record_open_requests(uuid)', 'public.record_vessel_slots_complete(uuid)', 'public.record_stale_required(uuid)',
                  'public.record_caller_reaches(uuid,uuid,uuid)', 'public.record_impersonating()']) AS f;
SELECT tests.ok(NOT has_function_privilege(r, f, 'EXECUTE'), f || ' (trigger) not executable by ' || r)
FROM unnest(ARRAY['public.record_envelopes_guard()', 'public.record_append_only_guard()']) AS f, unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r;
SELECT tests.ok(NOT has_function_privilege('service_role', 'public.record_transition(uuid,text,jsonb,integer)', 'EXECUTE'), 'record_transition is for signed-in users (a party is needed)');
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.throws(format($q$SELECT public.record_set_section_digests(%L, '{"*":"%s"}')$q$, (SELECT id FROM env), repeat('a', 64)), '42501', 'a browser session cannot set digests (stale signatures would hide)');
SELECT tests.throws(format($q$SELECT public.record_log_event(%L, 'forged', 'company')$q$, (SELECT id FROM env)), '42501', 'nor write events');
SELECT tests.reset_role();
SELECT tests.as_service();
SELECT tests.throws_like(format($q$SELECT public.record_set_section_digests(%L, '{"*":"not-hex"}')$q$, (SELECT id FROM env)), '22023', 'section_digests_invalid', 'digests are sha256 hex');
SELECT tests.lives(format($q$SELECT public.record_set_section_digests(%L, '{"*":"%s","hazards":"%s"}')$q$, (SELECT id FROM env), repeat('a', 64), repeat('b', 64)), 'the service role sets digests');
SELECT tests.reset_role();
SELECT tests.ok((SELECT content_digest ~ '^[0-9a-f]{64}$' AND section_digests ? 'hazards' FROM public.record_envelopes WHERE id = (SELECT id FROM env)), 'merged, with a content digest');
SELECT tests.is(public.record_slot_digest((SELECT id FROM env), NULL), public.record_digest_of((SELECT section_digests FROM public.record_envelopes WHERE id = (SELECT id FROM env)), ARRAY['*']), 'record_slot_digest = record_digest_of the * section');
SELECT tests.is(public.record_digest_of('{}', NULL), '', 'no digest known: empty');
SELECT tests.is(public.record_digest_of(jsonb_build_object('*', repeat('a', 64)), NULL), encode(sha256(convert_to('*:' || repeat('a', 64), 'UTF8')), 'hex'), 'the digest rule (sha256 of the key:digest lines)');
SELECT tests.ok((SELECT bool_and(prosecdef AND proconfig @> ARRAY['search_path=public']) FROM pg_proc
                 WHERE pronamespace = 'public'::regnamespace AND prosecdef AND proname LIKE 'record\_%'), 'every record definer sets search_path');
