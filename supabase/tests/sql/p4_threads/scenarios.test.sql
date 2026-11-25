-- Thread scenarios (spec §A.12; gap/08 TH1-TH3): every scenario of
-- record-thread-scenarios.json (generated from threads.ts + whoseMove.ts)
-- replayed through record_post_thread_entry / record_resolve_thread_request
-- gives the same outcome code, whose move (record_whose_move() and the
-- envelope's whose_move column), open requests and follow-up date (as a
-- day offset from current_date) after every step.

\set fx `cat supabase/tests/fixtures/record-thread-scenarios.json`
\set src_threads `sha256sum src/lib/records/threads.ts | cut -c1-64`
\set src_whose `sha256sum src/lib/records/whoseMove.ts | cut -c1-64`
SELECT tests.is((:'fx'::jsonb) -> 'sourceSha256' ->> 'src/lib/records/threads.ts', :'src_threads', 'record-thread-scenarios.json was generated from the current threads.ts');
SELECT tests.is((:'fx'::jsonb) -> 'sourceSha256' ->> 'src/lib/records/whoseMove.ts', :'src_whose', 'and from the current whoseMove.ts');

CREATE TEMP TABLE th_fx ON COMMIT DROP AS SELECT :'fx'::jsonb AS j;
GRANT SELECT ON th_fx TO PUBLIC;

SELECT tests.seed_vessel('SG', 'SG.v', 'M/Y SIGNAL', 'Active', NULL, '2026-01-01T00:00:00Z');
SELECT tests.seed_user('SG', 'SG.crew1', 'crew'), tests.seed_user('SG', 'SG.crew2', 'crew'),
       tests.seed_user('SG', 'SG.admin1', 'dpa'), tests.seed_user('SG', 'SG.admin2', 'dpa');
SELECT tests.seed_assignment(k, 'SG.v', true, 'Deckhand') FROM unnest(ARRAY['SG.crew1', 'SG.crew2']) AS k;
INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, capability_path, company_step, edit_after_sign, delete_rule, allow_reopen, report_first)
VALUES ('test.thread', 'test', 'Thread scenario', 'THR', 'vessel', 'vessel.test.records', 'sign_off', 'allow_with_flag', 'draft_only', true, true);

DO $$
DECLARE
  sc record;
  st jsonb;
  n integer;
  v_env uuid;
  v_result jsonb;
  v_label text;
  v_fu date;
BEGIN
  FOR sc IN SELECT ord, s FROM th_fx, jsonb_array_elements(j -> 'scenarios') WITH ORDINALITY AS x(s, ord) ORDER BY ord LOOP
    PERFORM tests.as_user(tests.user_id('SG.crew1'));
    v_env := (public.record_open_envelope('test.thread', tests.vessel_id('SG.v'), tests.id('thread-entity:' || (sc.s ->> 'name')), 'Thread ' || (sc.s ->> 'name'))).id;
    PERFORM tests.reset_role();
    -- The scenario's starting status (test setup through the engine flag).
    PERFORM set_config('storm.record_engine', 'on', true);
    UPDATE public.record_envelopes SET status = sc.s ->> 'status' WHERE id = v_env;
    UPDATE public.record_envelopes SET whose_move = public.record_whose_move(v_env) WHERE id = v_env;
    PERFORM set_config('storm.record_engine', '', true);
    n := 0;
    FOR st IN SELECT value FROM jsonb_array_elements(sc.s -> 'steps') LOOP
      n := n + 1;
      v_label := format('%s #%s %s %s', sc.s ->> 'name', n, st ->> 'op', coalesce(st ->> 'actor', st ->> 'status', ''));
      v_result := NULL;
      IF st ->> 'op' = 'set_status' THEN
        PERFORM set_config('storm.record_engine', 'on', true);
        UPDATE public.record_envelopes SET status = st ->> 'status' WHERE id = v_env;
        UPDATE public.record_envelopes SET whose_move = public.record_whose_move(v_env) WHERE id = v_env;
        PERFORM set_config('storm.record_engine', '', true);
      ELSE
        PERFORM tests.as_user(tests.user_id(st ->> 'actor'));
        IF st ->> 'op' IN ('update', 'request', 'reply') THEN
          v_result := public.record_post_thread_entry(
            tests.id(format('entry:%s:%s', sc.s ->> 'name', st ->> 'ref')), v_env, 'status_updates', st ->> 'op', coalesce(st ->> 'body', 'Update from the bridge'),
            CASE WHEN st ? 'followUpOffset' THEN current_date + (st ->> 'followUpOffset')::integer END,
            CASE WHEN st ? 'dueOffset' THEN current_date + (st ->> 'dueOffset')::integer END,
            CASE WHEN st ->> 'op' = 'reply' THEN tests.id(format('entry:%s:%s', sc.s ->> 'name', st ->> 'target')) END);
        ELSIF st ->> 'op' = 'edit' THEN
          v_result := public.record_post_thread_entry(
            tests.id(format('entry:%s:%s', sc.s ->> 'name', st ->> 'ref')), v_env, 'status_updates', 'update', coalesce(st ->> 'body', ''),
            NULL, NULL, NULL, tests.id(format('entry:%s:%s', sc.s ->> 'name', st ->> 'target')));
        ELSIF st ->> 'op' IN ('done', 'cancel', 'change_date') THEN
          v_result := public.record_resolve_thread_request(
            tests.id(format('entry:%s:%s', sc.s ->> 'name', st ->> 'target')),
            CASE st ->> 'op' WHEN 'cancel' THEN 'cancelled' ELSE st ->> 'op' END,
            st ->> 'note',
            CASE WHEN st ? 'dueOffset' THEN current_date + (st ->> 'dueOffset')::integer END);
        ELSE
          RAISE EXCEPTION 'unknown step %', st ->> 'op';
        END IF;
        PERFORM tests.reset_role();
      END IF;
      IF st ? 'expected' THEN
        PERFORM tests.is(
          CASE WHEN (v_result ->> 'ok')::boolean THEN 'ok' ELSE v_result #>> '{error,code}' END,
          CASE WHEN (st #>> '{expected,ok}')::boolean THEN 'ok' ELSE st #>> '{expected,code}' END,
          v_label || ': outcome');
      END IF;
      PERFORM tests.is(public.record_whose_move(v_env), st #>> '{after,whoseMove}', v_label || ': whose move');
      PERFORM tests.is((SELECT whose_move FROM public.record_envelopes WHERE id = v_env), st #>> '{after,whoseMove}', v_label || ': envelope.whose_move kept in step');
      SELECT follow_up_due INTO v_fu FROM public.record_envelopes WHERE id = v_env;
      PERFORM tests.is(v_fu - current_date, (st #>> '{after,followUpOffset}')::integer, v_label || ': follow-up date');
      PERFORM tests.is(public.record_open_requests(v_env), (st #>> '{after,openRequests}')::integer, v_label || ': open requests');
      PERFORM tests.is((SELECT count(*)::integer FROM public.record_thread_entries WHERE envelope_id = v_env), (st #>> '{after,entries}')::integer, v_label || ': entries');
    END LOOP;
  END LOOP;
END
$$;

-- What the fixtures leave implicit.
SELECT tests.ok((SELECT bool_and(last_update_at IS NOT NULL) FROM public.record_envelopes WHERE kind_key = 'test.thread' AND id IN (SELECT envelope_id FROM public.record_thread_entries)),
  'every envelope with entries has last_update_at');
SELECT tests.ok((SELECT due_history = jsonb_build_array(jsonb_build_object('from', to_char(current_date + 5, 'YYYY-MM-DD'), 'to', to_char(current_date + 9, 'YYYY-MM-DD'),
                   'reason', 'Supplier delay', 'changedAt', due_history #>> '{0,changedAt}', 'changedBy', tests.profile_id('SG.admin1')))
                 FROM public.record_thread_entries WHERE id = tests.id('entry:change_due_and_follow_up:r1')),
  'change_date appends {from, to, reason, changedAt, changedBy} to due_history');
SELECT tests.is((SELECT body FROM public.record_thread_entries WHERE id = tests.id('entry:bodies:u2')), repeat('y', 5000), 'bodies are stored trimmed');
SELECT tests.ok((SELECT replaces_id = tests.id('entry:edits:e1') AND follow_up_due = current_date + 4 FROM public.record_thread_entries WHERE id = tests.id('entry:edits:e4')),
  'an edit replaces the newest version and keeps its follow-up date');
SELECT tests.is((SELECT count(*) FROM public.record_events WHERE action LIKE 'thread.%' AND notification_type = 'status_request_posted'),
  (SELECT count(*) FROM public.record_thread_entries WHERE entry_type = 'request'), 'each request emits status_request_posted');
