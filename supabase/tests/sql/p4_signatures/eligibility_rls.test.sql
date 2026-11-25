-- Slot eligibility and signature access (spec §A.11; D-48, D-132): office
-- slots are filled by the office holder on THIS vessel (a Master of HYDRA
-- never fills a DRAAK Master slot), offices match whatever their spelling,
-- named slots admit only their people, company slots company actors,
-- vessel slots without an office anyone who reaches the vessel; another
-- company's or a disabled profile never; on-behalf refused; RLS isolation
-- of slots, signatures and the view; direct writes refused; ACLs.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user('A', 'A.master_hyd', 'master');
SELECT tests.seed_assignment('A.master_hyd', 'A.hyd', true, 'Master');
SELECT tests.seed_user('A', 'A.chief_dra', 'chief_officer');
SELECT tests.seed_assignment('A.chief_dra', 'A.dra', true, 'Chief Officer');
SELECT tests.seed_user('A', 'A.crew_dra', 'crew');
SELECT tests.seed_assignment('A.crew_dra', 'A.dra', true, 'Deckhand');
SELECT tests.seed_user('A', 'A.ex_master', 'master');
SELECT tests.seed_assignment('A.ex_master', 'A.dra', false, 'Master');

INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, capability_path, company_step, edit_after_sign, delete_rule, slot_template)
VALUES ('test.offices', 'test', 'Offices', 'OFF', 'vessel', 'vessel.test.records', 'sign_off', 'lock', 'draft_only', jsonb_build_array(
  jsonb_build_object('key', 'anyone', 'label', 'Anyone on board', 'order', 1, 'party', 'vessel', 'required', false),
  jsonb_build_object('key', 'chief', 'label', 'Chief Officer', 'order', 1, 'party', 'vessel', 'office_key', 'chief_officer', 'required', false),
  jsonb_build_object('key', 'named', 'label', 'Named', 'order', 1, 'party', 'vessel', 'named_profile_ids', jsonb_build_array(tests.profile_id('A.crew_dra')), 'required', false),
  jsonb_build_object('key', 'master', 'label', 'Master', 'order', 2, 'party', 'vessel', 'office_key', 'Master', 'allow_on_behalf', true),
  jsonb_build_object('key', 'company', 'label', 'Company', 'order', 3, 'party', 'company')));

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.record_open_envelope('test.offices', tests.vessel_id('A.dra'))).id AS env \gset
SELECT tests.reset_role();
CREATE FUNCTION tests.slot(p_env uuid, p_key text) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id FROM public.record_signature_slots WHERE envelope_id = p_env AND cycle = 1 AND slot_key = p_key
$$;
GRANT EXECUTE ON FUNCTION tests.slot(uuid, text) TO PUBLIC;

-- ------------------------------------------------------------ record_slot_eligible

CREATE TEMP TABLE elig (slot text, person text, want boolean) ON COMMIT DROP;
INSERT INTO elig VALUES
  ('master', 'A.master_dra', true), ('master', 'A.master_hyd', false), ('master', 'A.ex_master', false), ('master', 'A.crew_dra', false), ('master', 'B.admin', false),
  ('chief', 'A.chief_dra', true), ('chief', 'A.master_dra', false),
  ('named', 'A.crew_dra', true), ('named', 'A.chief_dra', false), ('named', 'A.fleet_manager', false),
  ('anyone', 'A.crew_dra', true), ('anyone', 'A.master_dra', true), ('anyone', 'A.fleet_manager', true), ('anyone', 'A.crew_hyd', false), ('anyone', 'A.disabled', false), ('anyone', 'B.admin', false),
  ('company', 'A.fleet_manager', true), ('company', 'A.master_dra', false), ('company', 'A.crew_dra', false), ('company', 'B.admin', false);
SELECT tests.is(public.record_slot_eligible(tests.slot(:'env', slot), tests.profile_id(person)), want, format('%s eligible for %s: %s', person, slot, want))
FROM elig ORDER BY slot, person;
SELECT tests.ok(NOT public.record_slot_eligible(tests.slot(:'env', 'anyone'), tests.id('profile:nobody')), 'an unknown profile is not eligible');
SELECT tests.ok(NOT public.record_slot_eligible(tests.id('slot:nobody'), tests.profile_id('A.crew_dra')), 'an unknown slot admits nobody');
SELECT tests.is(public.record_normalise_office('  Chief  Officer '), 'chief_officer', 'offices normalise to snake_case');
-- Inside a crew member's session the internal check still answers for others (rule 12).
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.is(tests.slot(:'env', 'master') IS NOT NULL, true, 'setup');
SELECT tests.reset_role();

-- ------------------------------------------------------------ signing through the RPC

SELECT tests.as_service();
SELECT public.record_set_section_digests(:'env', jsonb_build_object('*', repeat('c', 64)));
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.is(public.record_sign_slot(tests.id('sig:e:1'), tests.slot(:'env', 'named'), 'verified') ->> 'ok', 'true', 'the named crew member signs');
SELECT tests.as_user(tests.user_id('A.master_hyd'));
SELECT tests.throws(format($q$SELECT public.record_sign_slot(%L, %L, 'verified')$q$, tests.id('sig:e:2'), tests.slot(:'env', 'master')), '42501', 'the Master of another vessel cannot even read the record');
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.is(public.record_sign_slot(tests.id('sig:e:3'), tests.slot(:'env', 'master'), 'on_behalf', NULL, NULL, 'master', 'Master ashore') #>> '{error,code}', 'not_eligible', 'D-48: on-behalf is refused even where the slot allows it');
SELECT tests.is(public.record_sign_slot(tests.id('sig:e:4'), tests.slot(:'env', 'master'), 'witnessed', tests.profile_id('A.master_hyd')) #>> '{error,code}', 'not_eligible', 'a witnessed Master of another vessel is not eligible');
SELECT tests.is(public.record_sign_slot(tests.id('sig:e:5'), tests.slot(:'env', 'master'), 'witnessed', tests.profile_id('B.admin')) #>> '{error,code}', 'not_eligible', 'nor a profile of another company');
SELECT tests.is(public.record_sign_slot(tests.id('sig:e:6'), tests.slot(:'env', 'master'), 'witnessed', tests.profile_id('A.master_dra')) ->> 'ok', 'true', 'the Master of this vessel signs, witnessed by crew');
SELECT tests.is(public.record_sign_slot(tests.id('sig:e:7'), tests.slot(:'env', 'company'), 'verified') #>> '{error,code}', 'not_eligible', 'crew cannot sign the company slot');
SELECT tests.is(public.record_sign_slot(tests.id('sig:e:8'), tests.slot(:'env', 'master'), 'teleported') #>> '{error,code}', 'slot_signed', 'a signed slot first (the method is checked after the state)');
SELECT tests.is(public.record_sign_slot(tests.id('sig:e:9'), tests.slot(:'env', 'anyone'), 'teleported') #>> '{error,code}', 'invalid_input', 'an unknown method is invalid_input');
SELECT tests.is(public.record_sign_slot(tests.id('sig:e:10'), tests.slot(:'env', 'anyone'), 'verified', NULL, NULL, NULL, NULL, NULL, 99) #>> '{error,code}', 'version_conflict', 'an expected version that moved is refused');
SELECT tests.is(public.record_sign_slot(NULL, tests.slot(:'env', 'anyone'), 'verified') #>> '{error,code}', 'invalid_input', 'a signature needs its id');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(public.record_sign_slot(tests.id('sig:e:11'), tests.slot(:'env', 'company'), 'verified') ->> 'ok', 'true', 'a company actor signs the company slot');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT slot_key, method, signer_kind, signer_profile_id, witness_profile_id FROM public.record_signatures WHERE envelope_id = %L ORDER BY signed_at$q$, :'env'),
  format($q$VALUES ('named'::text, 'verified'::text, 'crew'::text, %L::uuid, NULL::uuid), ('master', 'witnessed', 'crew', %L::uuid, %L::uuid), ('company', 'verified', 'shore', %L::uuid, NULL::uuid)$q$,
    tests.profile_id('A.crew_dra'), tests.profile_id('A.master_dra'), tests.profile_id('A.crew_dra'), tests.profile_id('A.fleet_manager')),
  'the rows record method, signer kind, signer and witness');
SELECT tests.ok((SELECT bool_and(record_digest = public.record_digest_of(jsonb_build_object('*', repeat('c', 64)), NULL) AND record_version >= 1) FROM public.record_signatures WHERE envelope_id = :'env'),
  'record_digest is the server''s digest of the covered content');

-- ------------------------------------------------------------ RLS and direct writes

SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is((SELECT count(*) FROM public.record_signature_slot_states WHERE envelope_id = :'env'), 5::bigint, 'the Master reads the five slot states');
SELECT tests.is((SELECT state FROM public.record_signature_slot_states WHERE envelope_id = :'env' AND slot_key = 'company'), 'signed', 'with their derived state');
SELECT tests.throws(format($q$INSERT INTO public.record_signatures (id, envelope_id, company_id, cycle, party, signer_name, signer_kind, method, decision, record_digest, record_version, integrity_hash)
  VALUES (gen_random_uuid(), %L, %L, 1, 'company', 'Forged', 'shore', 'verified', 'signed_off', 'x', 1, %L)$q$, :'env', tests.company_id('A'), repeat('0', 64)), '42501', 'no direct insert of a signature');
SELECT tests.throws(format($q$UPDATE public.record_signature_slots SET passed_to_profile_id = %L, passed_at = now() WHERE envelope_id = %L$q$, tests.profile_id('A.crew_dra'), :'env'), '42501', 'no direct pass');
SELECT tests.throws(format($q$UPDATE public.record_signatures SET removed_at = now() WHERE envelope_id = %L$q$, :'env'), '42501', 'no direct removal');
SELECT set_config('tests.env', :'env', false);
DO $$
DECLARE p text; t text;
BEGIN
  FOREACH p IN ARRAY ARRAY['A.master_hyd', 'A.crew_hyd', 'B.admin', 'A.disabled'] LOOP
    PERFORM tests.as_user(tests.user_id(p));
    FOREACH t IN ARRAY ARRAY['record_signature_slots', 'record_signatures', 'record_signature_slot_states'] LOOP
      PERFORM tests.is_empty(format('SELECT 1 FROM public.%I WHERE envelope_id = %L', t, current_setting('tests.env')), format('%s reads nothing of %s', p, t));
    END LOOP;
  END LOOP;
END
$$;
SELECT tests.reset_role();
SELECT tests.as_anon();
SELECT tests.denied('SELECT * FROM public.record_signatures', 'anon reads no signature');
SELECT tests.reset_role();
-- The engine flag lets a removal through once; never a second time, never an edit.
SELECT set_config('storm.record_engine', 'on', true);
SELECT tests.lives(format($q$UPDATE public.record_signatures SET removed_at = now(), removed_by = %L WHERE id = %L$q$, tests.user_id('A.fleet_manager'), tests.id('sig:e:11')), 'inside the engine a removal is recorded');
SELECT tests.throws_like(format($q$UPDATE public.record_signatures SET removed_at = now() + interval '1 hour' WHERE id = %L$q$, tests.id('sig:e:11')), '42501', 'record_history_is_append_only', 'once');
SELECT tests.throws_like(format($q$UPDATE public.record_signatures SET signer_name = 'Someone else' WHERE id = %L$q$, tests.id('sig:e:1')), '42501', 'record_history_is_append_only', 'never an edit, even inside the engine');
SELECT set_config('storm.record_engine', '', true);
SELECT tests.is(public.record_instantiate_slots(:'env', 1), 0, 'record_instantiate_slots is idempotent per cycle');

-- ------------------------------------------------------------ the witness never removes alone (review round 4, witness-removes-signature)

-- gap/08 §B: the signer, the Master for vessel slots, a company actor for
-- company slots. The Master slot above was signed by the Master, witnessed
-- by the deckhand (sig:e:6); a reason is given in case the record is submitted.
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.is(public.record_remove_signature(tests.id('sig:e:6'), 'Changed my mind') #>> '{error,code}', 'not_allowed',
                'the witness of the crew-witnessed Master signature cannot remove it');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is(public.record_remove_signature(tests.id('sig:e:6'), 'Signed the wrong revision') ->> 'ok', 'true', 'the Master (the signer) removes it');
SELECT tests.reset_role();
SELECT tests.ok((SELECT removed_at IS NOT NULL AND removed_by = tests.user_id('A.master_dra') FROM public.record_signatures WHERE id = tests.id('sig:e:6')),
                'removed by the Master, not the witness');

-- ------------------------------------------------------------ company slots are never witnessed (review round 4, company-slot-witnessed-forgery)

SELECT tests.ok(NOT public.record_slot_template_valid('[{"key":"company","label":"Company","order":1,"party":"company","allow_witnessed":true}]', 'sign_off'),
                'the template validator refuses a witnessed company slot');
SELECT tests.ok(public.record_slot_template_valid('[{"key":"company","label":"Company","order":1,"party":"company","allow_witnessed":false}]', 'sign_off'),
                'an explicit allow_witnessed false is fine');
SELECT tests.throws_like($q$INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, capability_path, company_step, edit_after_sign, delete_rule, slot_template)
  VALUES ('test.cw_bad', 'test', 'Bad', 'CWB', 'vessel', 'vessel.test.records', 'sign_off', 'lock', 'draft_only', '[{"key":"company","label":"Company","order":1,"party":"company","allow_witnessed":true}]')$q$,
  '23514', '%record_kinds_slot_template_check%', 'so a kind cannot register one');
INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, capability_path, company_step, edit_after_sign, delete_rule, slot_template)
VALUES ('test.cw', 'test', 'Company witness', 'CWT', 'vessel', 'vessel.test.records', 'sign_off', 'lock', 'draft_only', jsonb_build_array(
  jsonb_build_object('key', 'crew', 'label', 'Crew', 'order', 1, 'party', 'vessel', 'required', false),
  jsonb_build_object('key', 'company', 'label', 'Company', 'order', 2, 'party', 'company')));
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.record_open_envelope('test.cw', tests.vessel_id('A.dra'))).id AS cw_env \gset
SELECT tests.reset_role();
SELECT tests.ok((SELECT NOT allow_witnessed FROM public.record_signature_slots WHERE id = tests.slot(:'cw_env', 'company')), 'the instantiated company slot does not allow witnessing');
SELECT tests.throws_like(format($q$INSERT INTO public.record_signature_slots (envelope_id, company_id, vessel_id, cycle, slot_key, label, order_no, party, allow_witnessed)
  VALUES (%L, %L, %L, 1, 'forged', 'Forged', 3, 'company', true)$q$, :'cw_env', tests.company_id('A'), tests.vessel_id('A.dra')),
  '23514', '%record_signature_slots_company_party_check%', 'a direct company slot carrying the flag is refused (CHECK)');
SELECT set_config('storm.record_engine', 'on', true);
SELECT tests.throws_like(format($q$UPDATE public.record_signature_slots SET allow_witnessed = true WHERE id = %L$q$, tests.slot(:'cw_env', 'company')),
  '23514', '%record_signature_slots_company_party_check%', 'and so is setting it on one, even under the engine flag');
SELECT set_config('storm.record_engine', '', true);
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.is(public.record_sign_slot(tests.id('sig:cw:1'), tests.slot(:'cw_env', 'company'), 'witnessed', tests.profile_id('A.fleet_manager')) #>> '{error,code}', 'method_not_allowed',
                'a deckhand cannot sign the company slot witnessed in the fleet manager''s name');
SELECT tests.reset_role();
-- Defence in depth: even a slot row that carries the flag (the CHECK
-- dropped inside a savepoint) is refused by record_sign_slot.
SAVEPOINT company_witness;
ALTER TABLE public.record_signature_slots DROP CONSTRAINT record_signature_slots_company_party_check;
UPDATE public.record_signature_slots SET allow_witnessed = true WHERE id = tests.slot(:'cw_env', 'company');
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.is(public.record_sign_slot(tests.id('sig:cw:2'), tests.slot(:'cw_env', 'company'), 'witnessed', tests.profile_id('A.fleet_manager')) #>> '{error,code}', 'method_not_allowed',
                'record_sign_slot refuses a witnessed company signature whatever the row says');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.record_signatures WHERE envelope_id = :'cw_env'), 0::bigint, 'no signature was written');
ROLLBACK TO SAVEPOINT company_witness;
SELECT tests.ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'record_signature_slots_company_party_check'
                          AND pg_get_constraintdef(oid) LIKE '%allow_witnessed%'), 'the CHECK is back and covers allow_witnessed');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(public.record_sign_slot(tests.id('sig:cw:3'), tests.slot(:'cw_env', 'company'), 'verified') ->> 'ok', 'true', 'the company actor signs it on their own account');
SELECT tests.reset_role();

-- ------------------------------------------------------------ an HR editor cannot make themselves the Master (review round 2)

-- crew-assignment-office-self-promotion: the purser (RBAC purser on DRAAK,
-- an HR editor) cannot retitle their own assignment as Master, so the
-- Master office and its slot stay out of reach (20261123010300).
SELECT tests.seed_user('A', 'A.purser_dra', 'crew');
SELECT tests.seed_rbac_role('A.purser_dra', 'purser', 'A.dra');
SELECT tests.seed_assignment('A.purser_dra', 'A.dra', true, 'Purser');
SELECT tests.as_user(tests.user_id('A.purser_dra'));
SELECT tests.throws(format($q$UPDATE public.crew_assignments SET position = 'Master' WHERE user_id = auth.uid() AND vessel_id = %L$q$, tests.vessel_id('A.dra')), '42501',
                    'the purser''s own position Master is refused');
SELECT tests.throws(format($q$UPDATE public.crew_assignments SET rank = 'Captain' WHERE user_id = auth.uid() AND vessel_id = %L$q$, tests.vessel_id('A.dra')), '42501',
                    'and so is their own rank Captain');
SELECT tests.reset_role();
SELECT tests.ok(NOT public.record_is_master(tests.user_id('A.purser_dra'), tests.vessel_id('A.dra')), 'record_is_master stays false for the purser');
SELECT tests.ok(NOT public.record_slot_eligible(tests.slot(:'env', 'master'), tests.profile_id('A.purser_dra')), 'and record_slot_eligible for the Master slot stays false');

-- ------------------------------------------------------------ ACLs (rule 5)

SELECT tests.ok(has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE') AND NOT has_function_privilege('service_role', f, 'EXECUTE'), f || ': authenticated only')
FROM unnest(ARRAY['public.record_sign_slot(uuid,uuid,text,uuid,jsonb,text,text,text,integer)', 'public.record_pass_slot(uuid,uuid)', 'public.record_cancel_pass(uuid)',
                  'public.record_remove_signature(uuid,text)', 'public.record_resign_slot(uuid,uuid)']) AS f;
SELECT tests.ok(NOT has_function_privilege('authenticated', f, 'EXECUTE') AND has_function_privilege('service_role', f, 'EXECUTE'), f || ': service role only')
FROM unnest(ARRAY['public.record_slot_eligible(uuid,uuid)', 'public.record_instantiate_slots(uuid,integer)', 'public.record_vessel_completion(uuid)',
                  'public.record_slot_state(uuid)', 'public.record_is_master(uuid,uuid)', 'public.record_signature_hash(text,uuid,uuid,text,timestamptz,text)']) AS f;
SELECT tests.ok(NOT has_table_privilege('anon', 'public.record_signature_slot_states', 'SELECT') AND has_table_privilege('authenticated', 'public.record_signature_slot_states', 'SELECT'),
  'the view: authenticated reads, anon nothing');
SELECT tests.ok((SELECT 'security_invoker=true' = ANY (reloptions) FROM pg_class WHERE oid = 'public.record_signature_slot_states'::regclass), 'the view is security_invoker');
