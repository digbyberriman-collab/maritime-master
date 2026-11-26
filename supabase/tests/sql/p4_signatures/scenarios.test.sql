-- Signature scenarios (spec §A.11; D-48, D-51): every scenario of
-- record-signature-scenarios.json (generated from signatures.ts composed
-- with companyStep.ts) replayed through record_sign_slot / record_pass_slot
-- / record_cancel_pass / record_remove_signature / record_resign_slot /
-- record_transition / record_set_section_digests gives the same outcome
-- code, slot states, stale flags, envelope status and cycle after every
-- step. Eligibility is by named profiles only, so SQL and TS agree.

\set fx `cat supabase/tests/fixtures/record-signature-scenarios.json`
\set src_sha `sha256sum src/lib/records/signatures.ts | cut -c1-64`
SELECT tests.is((:'fx'::jsonb) -> 'sourceSha256' ->> 'src/lib/records/signatures.ts', :'src_sha',
  'record-signature-scenarios.json was generated from the current signatures.ts (else: node scripts/db/gen-record-fixtures.mjs)');

CREATE TEMP TABLE sig_fx ON COMMIT DROP AS SELECT :'fx'::jsonb AS j;
GRANT SELECT ON sig_fx TO PUBLIC;

-- The world: company SG, vessel SG.v, crew 1-3 and the Master on board,
-- two company actors (legacy DPA), and SG.reader, an in-window external
-- viewer of SG.v (D-214: reads the record, never writes). The reader is a
-- crew profile whose profile-synced membership becomes kind external,
-- vessel_scope assigned, an open window and one membership vessel row for
-- SG.v (as p4_registry/external_writes.test.sql), so record_readable() is
-- true and record_caller_may_write() false.
SELECT tests.seed_vessel('SG', 'SG.v', 'M/Y SIGNAL', 'Active', NULL, '2026-01-01T00:00:00Z');
SELECT tests.seed_user('SG', k, CASE (sig.j #>> ARRAY['world', 'people', k, 'role']) WHEN 'admin' THEN 'dpa' WHEN 'master' THEN 'master' WHEN 'external' THEN 'crew' ELSE 'crew' END::public.user_role)
FROM sig_fx AS sig, jsonb_object_keys(sig.j #> '{world,people}') AS k;
SELECT tests.seed_assignment(k, 'SG.v', true, CASE WHEN k = 'SG.master' THEN 'Master' ELSE 'Deckhand' END)
FROM unnest(ARRAY['SG.crew1', 'SG.crew2', 'SG.crew3', 'SG.master']) AS k;
UPDATE public.account_memberships AS m
SET legacy_managed = false, kind = 'external', vessel_scope = 'assigned', fleet_access = false, source = 'admin',
    valid_from = now() - interval '1 day', valid_until = now() + interval '30 days'
FROM sig_fx AS sig, jsonb_object_keys(sig.j #> '{world,people}') AS k
WHERE sig.j #>> ARRAY['world', 'people', k, 'role'] = 'external' AND m.user_id = tests.user_id(k);
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT m.id, m.company_id, tests.vessel_id('SG.v') FROM public.account_memberships AS m WHERE m.kind = 'external' AND m.user_id = tests.user_id('SG.reader');
SELECT tests.ok(public.record_user_is_external(tests.user_id('SG.reader'), tests.company_id('SG'))
                AND public.reach_vessel_for(tests.user_id('SG.reader'), tests.vessel_id('SG.v'))
                AND NOT public.record_caller_may_write(tests.user_id('SG.reader'), tests.company_id('SG'), tests.vessel_id('SG.v'))
                AND NOT public.is_company_actor(tests.user_id('SG.reader'), tests.vessel_id('SG.v')),
                'setup: SG.reader is an in-window external of SG.v: reaches it, may not write, is no company actor');
SELECT tests.as_user(tests.user_id('SG.reader'));
SELECT tests.ok(public.record_readable(tests.company_id('SG'), tests.vessel_id('SG.v')), 'setup: SG.reader may read SG.v records');
SELECT tests.reset_role();

-- One kind per scenario (snake_case slot template from the TS slots).
CREATE TEMP TABLE sig_scenarios ON COMMIT DROP AS
SELECT ord, s ->> 'name' AS name, s AS scenario, 'test.sig_' || ord AS kind_key, 'SIG' || ord AS prefix
FROM sig_fx, jsonb_array_elements(j -> 'scenarios') WITH ORDINALITY AS x(s, ord);
GRANT SELECT ON sig_scenarios TO PUBLIC;
INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, capability_path, enveloped, company_step, report_first, decision_kind,
                                 allow_reopen, allow_close_as, edit_after_sign, delete_rule, slot_template)
SELECT kind_key, 'test', 'Scenario ' || name, prefix, 'vessel', 'vessel.test.records', true,
       scenario #>> '{kind,companyStep}', (scenario #>> '{kind,reportFirst}')::boolean, (scenario #>> '{kind,decisionKind}')::boolean,
       (scenario #>> '{kind,allowReopen}')::boolean, (scenario #>> '{kind,allowCloseAs}')::boolean, 'allow_with_flag', scenario #>> '{kind,deleteRule}',
       (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'key', sl ->> 'key', 'label', sl ->> 'label', 'order', (sl ->> 'order')::integer, 'party', sl ->> 'party',
          'required', sl -> 'required', 'office_key', sl -> 'officeKey', 'named_profile_ids', sl -> 'namedProfileIds',
          'covers_sections', sl -> 'coversSections', 'allow_witnessed', sl -> 'allowWitnessed', 'allow_visitor', sl -> 'allowVisitor',
          'allow_on_behalf', sl -> 'allowOnBehalf', 'on_behalf_reason_required', sl -> 'onBehalfReasonRequired', 'distinct_from', sl -> 'distinctFrom')) ORDER BY o)
        FROM jsonb_array_elements(scenario -> 'slots') WITH ORDINALITY AS y(sl, o))
FROM sig_scenarios;
SELECT tests.is((SELECT count(*) FROM public.record_kinds WHERE key LIKE 'test.sig\_%'), (SELECT count(*) FROM sig_scenarios), 'every scenario kind passes record_kinds_slot_template_check');

-- Replay every step.
CREATE TEMP TABLE sig_envelopes (name text PRIMARY KEY, envelope_id uuid) ON COMMIT DROP;
GRANT ALL ON sig_envelopes TO PUBLIC;
DO $$
DECLARE
  sc record;
  st jsonb;
  n integer;
  v_env uuid;
  v_slot uuid;
  v_result jsonb;
  v_claims jsonb;
  v_label text;
  v_got_states jsonb;
  v_got_stale jsonb;
  v_status text;
  v_cycle integer;
  v_sig uuid;
BEGIN
  FOR sc IN SELECT * FROM sig_scenarios ORDER BY ord LOOP
    PERFORM tests.as_user(tests.user_id(sc.scenario ->> 'creator'));
    v_env := (public.record_open_envelope(sc.kind_key, tests.vessel_id('SG.v'), NULL, 'Scenario ' || sc.name)).id;
    PERFORM tests.reset_role();
    INSERT INTO sig_envelopes VALUES (sc.name, v_env);
    n := 0;
    FOR st IN SELECT value FROM jsonb_array_elements(sc.scenario -> 'steps') LOOP
      n := n + 1;
      v_label := format('%s #%s %s %s %s', sc.name, n, st ->> 'op', coalesce(st ->> 'actor', ''), coalesce(st ->> 'slot', st ->> 'action', ''));
      v_result := NULL;
      SELECT current_cycle INTO v_cycle FROM public.record_envelopes WHERE id = v_env;
      SELECT id INTO v_slot FROM public.record_signature_slots WHERE envelope_id = v_env AND cycle = v_cycle AND slot_key = st ->> 'slot';
      v_claims := CASE WHEN (st ->> 'impersonating')::boolean THEN '{"app_metadata": {"impersonating": true}}'::jsonb ELSE '{}'::jsonb END;
      IF st ->> 'op' = 'set_digests' THEN
        PERFORM tests.as_service();
        PERFORM public.record_set_section_digests(v_env, st -> 'digests');
      ELSE
        PERFORM tests.as_user(tests.user_id(st ->> 'actor'), v_claims);
        IF st ->> 'op' = 'sign' THEN
          v_result := public.record_sign_slot(
            tests.id(format('signature:%s:%s', sc.name, st ->> 'ref')), v_slot, st ->> 'method',
            CASE WHEN st #>> '{signer,profile}' IS NOT NULL THEN tests.profile_id(st #>> '{signer,profile}') END,
            CASE WHEN st #>> '{signer,visitor}' IS NOT NULL THEN jsonb_build_object('name', st #>> '{signer,visitor}', 'company', 'Class society', 'capacity', 'Surveyor', 'kind', coalesce(st #>> '{signer,kind}', 'visitor')) END,
            NULL, st ->> 'reason');
        ELSIF st ->> 'op' = 'resign' THEN
          v_result := public.record_resign_slot(tests.id(format('signature:%s:%s', sc.name, st ->> 'ref')), v_slot);
        ELSIF st ->> 'op' = 'remove' THEN
          v_sig := (st ->> 'signatureId')::uuid;
          v_result := public.record_remove_signature(v_sig, st ->> 'reason');
        ELSIF st ->> 'op' = 'pass' THEN
          v_result := public.record_pass_slot(v_slot, tests.profile_id(st ->> 'to'));
        ELSIF st ->> 'op' = 'cancel' THEN
          v_result := public.record_cancel_pass(v_slot);
        ELSIF st ->> 'op' = 'transition' THEN
          v_result := public.record_transition(v_env, st ->> 'action',
            jsonb_strip_nulls(jsonb_build_object('reason', st ->> 'reason', 'decision', st ->> 'decision', 'conditions', st ->> 'conditions')));
        ELSE
          RAISE EXCEPTION 'unknown step %', st ->> 'op';
        END IF;
      END IF;
      PERFORM tests.reset_role();

      IF st ? 'expected' THEN
        PERFORM tests.is(
          CASE WHEN (v_result ->> 'ok')::boolean THEN 'ok' ELSE v_result #>> '{error,code}' END,
          CASE WHEN (st #>> '{expected,ok}')::boolean THEN 'ok' ELSE st #>> '{expected,code}' END,
          v_label || ': outcome');
      END IF;
      SELECT status, current_cycle INTO v_status, v_cycle FROM public.record_envelopes WHERE id = v_env;
      SELECT jsonb_object_agg(slot_key, state), coalesce(jsonb_object_agg(slot_key, stale) FILTER (WHERE live_signature_id IS NOT NULL), '{}'::jsonb)
        INTO v_got_states, v_got_stale
      FROM public.record_signature_slot_states WHERE envelope_id = v_env AND cycle = v_cycle;
      PERFORM tests.is(v_status, st #>> '{after,status}', v_label || ': envelope status');
      PERFORM tests.is(v_cycle, (st #>> '{after,cycle}')::integer, v_label || ': cycle');
      PERFORM tests.is(v_got_states, st #> '{after,states}', v_label || ': slot states');
      PERFORM tests.is(v_got_stale, st #> '{after,stale}', v_label || ': stale flags');
    END LOOP;
  END LOOP;
END
$$;

-- The external reader changed nothing (D-214): no signature, pass, removal
-- or step-back by SG.reader.
SELECT tests.is((SELECT count(*) FROM public.record_signatures AS s JOIN sig_envelopes AS e ON e.envelope_id = s.envelope_id
                 WHERE e.name = 'external_reader_changes_nothing' AND (tests.user_id('SG.reader') IN (s.signer_user_id, s.witness_user_id) OR s.removed_by = tests.user_id('SG.reader'))),
                0::bigint, 'external_reader_changes_nothing: no signature signed, witnessed or removed by the reader');
SELECT tests.is((SELECT count(*) FROM public.record_events AS ev JOIN sig_envelopes AS e ON e.envelope_id = ev.envelope_id
                 WHERE e.name = 'external_reader_changes_nothing' AND ev.actor_user_id = tests.user_id('SG.reader')),
                0::bigint, 'external_reader_changes_nothing: no record event by the reader');

-- Composition checks the scenarios rely on.
SELECT tests.is((SELECT count(*) FROM public.record_signatures AS s JOIN sig_envelopes AS e ON e.envelope_id = s.envelope_id
                 WHERE e.name = 'return_to_vessel_new_cycle' AND s.cycle = 1 AND s.party = 'vessel' AND s.superseded_at IS NOT NULL), 3::bigint,
  'D-30: return to vessel superseded the three cycle-1 vessel signatures');
SELECT tests.is((SELECT count(*) FROM public.record_signature_slots AS s JOIN sig_envelopes AS e ON e.envelope_id = s.envelope_id
                 WHERE e.name = 'return_to_vessel_new_cycle' AND s.cycle = 2), 4::bigint, 'cycle 2 has its own four slots');
SELECT tests.ok((SELECT bool_and(s.removed_at IS NOT NULL) FROM public.record_signatures AS s JOIN sig_envelopes AS e ON e.envelope_id = s.envelope_id
                 WHERE e.name = 'company_sign_off_and_lock' AND s.party = 'company' AND s.decision = 'signed_off'
                   AND s.signed_at < (SELECT max(signed_at) FROM public.record_signatures WHERE envelope_id = e.envelope_id AND decision = 'signed_off')),
  'remove_company_signature removed the first sign-off decision');
SELECT tests.is((SELECT count(*) FROM public.record_signatures AS s JOIN sig_envelopes AS e ON e.envelope_id = s.envelope_id
                 WHERE e.name = 'company_sign_off_and_lock' AND s.decision = 'signed_off' AND s.removed_at IS NULL AND s.slot_key = 'company_review'), 1::bigint,
  'the second sign-off signed the company slot');
SELECT tests.is((SELECT company_decision FROM public.record_envelopes AS r JOIN sig_envelopes AS e ON e.envelope_id = r.id WHERE e.name = 'decision_kind_not_approved'),
  'approved_with_conditions', 'the decision is recorded on the envelope');
SELECT tests.is((SELECT decision_conditions FROM public.record_envelopes AS r JOIN sig_envelopes AS e ON e.envelope_id = r.id WHERE e.name = 'decision_kind_not_approved'),
  'Fire watch for one hour', 'with its conditions');
SELECT tests.ok((SELECT bool_and(s.integrity_hash ~ '^[0-9a-f]{64}$' AND s.integrity_hash = public.record_signature_hash(s.record_digest, s.slot_id, s.signer_profile_id, s.signer_name, s.signed_at, s.image_sha256))
                 FROM public.record_signatures AS s JOIN sig_envelopes AS e ON e.envelope_id = s.envelope_id),
  'every integrity hash recomputes (SIG16)');
SELECT tests.ok((SELECT bool_and(s.integrity_hash <> public.record_signature_hash(s.record_digest, s.slot_id, s.signer_profile_id, s.signer_name || ' (edited)', s.signed_at, s.image_sha256))
                 FROM public.record_signatures AS s JOIN sig_envelopes AS e ON e.envelope_id = s.envelope_id),
  'and binds the stored signer name: another name gives another hash, company signatures included (D-209)');
SELECT tests.ok((SELECT count(*) > 0 AND bool_and(s.signer_profile_id IS NOT NULL AND s.signer_name IS NOT NULL)
                 FROM public.record_signatures AS s JOIN sig_envelopes AS e ON e.envelope_id = s.envelope_id
                 WHERE s.party = 'company'),
  'the company signatures (record_engine_apply) carry both the profile id and the stored name');
SELECT tests.ok((SELECT bool_and(s.signer_kind = 'visitor' AND s.signer_profile_id IS NULL AND s.visitor_company IS NOT NULL AND s.witness_profile_id = tests.profile_id('SG.crew1'))
                 FROM public.record_signatures AS s JOIN sig_envelopes AS e ON e.envelope_id = s.envelope_id
                 WHERE e.name = 'witnessed_rules' AND s.slot_key = 'visitor_ack'),
  'a visitor signature carries the visitor and the witness');
SELECT tests.is((SELECT count(*) FROM public.record_events AS ev JOIN sig_envelopes AS e ON e.envelope_id = ev.envelope_id
                 WHERE e.name = 'order_and_waiting' AND ev.action = 'signature.slot_opened' AND ev.notification_type = 'signature_requested'), 2::bigint,
  'signing opens the next slots and asks their signers (signature_requested)');
SELECT tests.ok((SELECT payload -> 'must_act_user_ids' = jsonb_build_array(tests.user_id('SG.master'))
                 FROM public.record_events AS ev JOIN sig_envelopes AS e ON e.envelope_id = ev.envelope_id
                 WHERE e.name = 'order_and_waiting' AND ev.action = 'signature.slot_opened' AND ev.payload ->> 'slot_key' = 'master'),
  'the opened Master slot names the Master as must-act');
SELECT tests.is((SELECT count(*) FROM public.record_snapshots AS sn JOIN sig_envelopes AS e ON e.envelope_id = sn.envelope_id WHERE e.name = 'company_sign_off_and_lock'), 3::bigint,
  'snapshots: submitted (vessel complete), closed (sign-off), closed again');
