-- Bounded free text in never-deletable record rows (review round 4,
-- record-free-text-unbounded): a visitor's company and capacity are 120
-- characters at most (record_sign_slot invalid_input; CHECKs on
-- record_signatures, with the on-behalf office 80 and reason 2000), a void
-- reason and decide conditions 2000 (record_transition invalid_input, never
-- truncated; CHECKs on record_envelopes). Ports scratchpad
-- verify-t7/repro.sql and repro2.sql.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user('A', 'A.crew_dra', 'crew');
SELECT tests.seed_assignment('A.crew_dra', 'A.dra', true, 'Deckhand');

INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, capability_path, company_step, edit_after_sign, delete_rule, slot_template)
VALUES
  ('test.vis', 'test', 'Visitor log', 'VIS', 'vessel', 'vessel.test.visits', 'none', 'allow_with_flag', 'draft_only',
   jsonb_build_array(
     jsonb_build_object('key', 'cp1', 'label', 'Visitor 1', 'order', 1, 'party', 'vessel', 'allow_visitor', true, 'required', false),
     jsonb_build_object('key', 'cp2', 'label', 'Visitor 2', 'order', 1, 'party', 'vessel', 'allow_visitor', true, 'required', false),
     jsonb_build_object('key', 'cp3', 'label', 'Visitor 3', 'order', 1, 'party', 'vessel', 'allow_visitor', true, 'required', false),
     -- a required slot, so the record stays open while the visitors sign
     jsonb_build_object('key', 'master', 'label', 'Master', 'order', 2, 'party', 'vessel', 'office_key', 'master'))),
  ('test.dec', 'test', 'Decision', 'DEC', 'vessel', 'vessel.test.decisions', 'sign_off', 'allow_with_flag', 'draft_only',
   jsonb_build_array(jsonb_build_object('key', 'master', 'label', 'Master', 'order', 1, 'party', 'vessel', 'office_key', 'master')));
UPDATE public.record_kinds SET decision_kind = true WHERE key = 'test.dec';

CREATE FUNCTION tests.tb_slot(p_env uuid, p_key text) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id FROM public.record_signature_slots WHERE envelope_id = p_env AND cycle = 1 AND slot_key = p_key
$$;
GRANT EXECUTE ON FUNCTION tests.tb_slot(uuid, text) TO PUBLIC;

-- ------------------------------------------------------------ visitor company and capacity: 120

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.record_open_envelope('test.vis', tests.vessel_id('A.dra'))).id AS vis \gset
SELECT tests.is(public.record_sign_slot(tests.id('sig:tb:over_company'), tests.tb_slot(:'vis', 'cp1'), 'witnessed', NULL,
                  jsonb_build_object('name', 'Visitor', 'company', repeat('c', 121), 'capacity', 'Surveyor')) #>> '{error,code}', 'invalid_input',
                'a 121-character visitor company is refused');
SELECT tests.is(public.record_sign_slot(tests.id('sig:tb:over_capacity'), tests.tb_slot(:'vis', 'cp1'), 'witnessed', NULL,
                  jsonb_build_object('name', 'Visitor', 'company', 'Class', 'capacity', repeat('k', 121))) #>> '{error,message}',
                'Give the visitor''s name, company and capacity (120 characters each at most).', 'a 121-character capacity is refused, with the bound in the copy');
SELECT tests.is(public.record_sign_slot(tests.id('sig:tb:over_name'), tests.tb_slot(:'vis', 'cp1'), 'witnessed', NULL,
                  jsonb_build_object('name', repeat('n', 121), 'company', 'Class', 'capacity', 'Surveyor')) #>> '{error,code}', 'invalid_input',
                'a 121-character name is still refused');
SELECT tests.is(public.record_sign_slot(tests.id('sig:tb:max_company'), tests.tb_slot(:'vis', 'cp1'), 'witnessed', NULL,
                  jsonb_build_object('name', 'Visitor', 'company', repeat('c', 120), 'capacity', 'Surveyor')) ->> 'ok', 'true',
                'a 120-character company is accepted');
SELECT tests.is(public.record_sign_slot(tests.id('sig:tb:max_capacity'), tests.tb_slot(:'vis', 'cp2'), 'witnessed', NULL,
                  jsonb_build_object('name', 'Visitor', 'company', 'Class', 'capacity', repeat('k', 120))) ->> 'ok', 'true',
                'a 120-character capacity is accepted');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT slot_key, length(visitor_company), length(visitor_capacity) FROM public.record_signatures WHERE envelope_id = %L ORDER BY slot_key$q$, :'vis'),
                        $q$VALUES ('cp1'::text, 120, 8), ('cp2', 5, 120)$q$, 'stored in full, nothing truncated');
SELECT tests.is((SELECT count(*) FROM public.record_signatures WHERE id IN (tests.id('sig:tb:over_company'), tests.id('sig:tb:over_capacity'), tests.id('sig:tb:over_name'))), 0::bigint,
                'nothing written for a refusal');
-- A direct oversize write (inside the engine flag, as superuser) meets the CHECKs.
SELECT set_config('storm.record_engine', 'on', true);
SELECT tests.throws_like(format($q$INSERT INTO public.record_signatures (id, envelope_id, slot_id, company_id, vessel_id, cycle, slot_key, party, signer_name, signer_kind,
    visitor_company, visitor_capacity, method, witness_profile_id, record_digest, record_version, integrity_hash)
  VALUES (gen_random_uuid(), %L, %L, %L, %L, 1, 'cp3', 'vessel', 'Visitor', 'visitor', %L, 'Surveyor', 'witnessed', %L, '', 1, %L)$q$,
    :'vis', tests.tb_slot(:'vis', 'cp3'), tests.company_id('A'), tests.vessel_id('A.dra'), repeat('c', 121), tests.profile_id('A.crew_dra'), repeat('0', 64)),
  '23514', '%record_signatures_visitor_company_check%', 'record_signatures: visitor_company over 120 (23514)');
SELECT tests.throws_like(format($q$INSERT INTO public.record_signatures (id, envelope_id, slot_id, company_id, vessel_id, cycle, slot_key, party, signer_name, signer_kind,
    visitor_company, visitor_capacity, method, witness_profile_id, record_digest, record_version, integrity_hash)
  VALUES (gen_random_uuid(), %L, %L, %L, %L, 1, 'cp3', 'vessel', 'Visitor', 'visitor', 'Class', %L, 'witnessed', %L, '', 1, %L)$q$,
    :'vis', tests.tb_slot(:'vis', 'cp3'), tests.company_id('A'), tests.vessel_id('A.dra'), repeat('k', 121), tests.profile_id('A.crew_dra'), repeat('0', 64)),
  '23514', '%record_signatures_visitor_capacity_check%', 'record_signatures: visitor_capacity over 120 (23514)');
SELECT tests.throws_like(format($q$INSERT INTO public.record_signatures (id, envelope_id, slot_id, company_id, vessel_id, cycle, slot_key, party, signer_name, signer_kind,
    method, on_behalf_of_office, record_digest, record_version, integrity_hash)
  VALUES (gen_random_uuid(), %L, %L, %L, %L, 1, 'cp3', 'vessel', 'Crew', 'crew', 'on_behalf', %L, '', 1, %L)$q$,
    :'vis', tests.tb_slot(:'vis', 'cp3'), tests.company_id('A'), tests.vessel_id('A.dra'), repeat('o', 81), repeat('0', 64)),
  '23514', '%record_signatures_on_behalf_of_office_check%', 'record_signatures: on_behalf_of_office over 80 (23514)');
SELECT tests.throws_like(format($q$INSERT INTO public.record_signatures (id, envelope_id, slot_id, company_id, vessel_id, cycle, slot_key, party, signer_name, signer_kind,
    method, on_behalf_reason, record_digest, record_version, integrity_hash)
  VALUES (gen_random_uuid(), %L, %L, %L, %L, 1, 'cp3', 'vessel', 'Crew', 'crew', 'on_behalf', %L, '', 1, %L)$q$,
    :'vis', tests.tb_slot(:'vis', 'cp3'), tests.company_id('A'), tests.vessel_id('A.dra'), repeat('r', 2001), repeat('0', 64)),
  '23514', '%record_signatures_on_behalf_reason_check%', 'record_signatures: on_behalf_reason over 2000 (23514)');
SELECT set_config('storm.record_engine', '', true);

-- ------------------------------------------------------------ void reason: 2000

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.record_open_envelope('test.vis', tests.vessel_id('A.dra'))).id AS void1 \gset
SELECT (public.record_open_envelope('test.vis', tests.vessel_id('A.dra'))).id AS void2 \gset
SELECT tests.is(public.record_transition(:'void1', 'void', jsonb_build_object('reason', repeat('r', 2001))) #>> '{error,code}', 'invalid_input', 'a 2001-character void reason is refused');
SELECT tests.is(public.record_transition(:'void1', 'void', jsonb_build_object('reason', repeat('r', 2001))) #>> '{error,message}', 'Keep the reason and conditions to 2000 characters.',
                'with the bound in the copy');
SELECT tests.is(public.record_transition(:'void2', 'void', jsonb_build_object('reason', repeat('r', 2000))) ->> 'ok', 'true', 'a 2000-character void reason is accepted');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT status, length(void_reason) FROM public.record_envelopes WHERE id IN (%L, %L) ORDER BY status$q$, :'void1', :'void2'),
                        $q$VALUES ('open'::text, NULL::integer), ('void', 2000)$q$, 'the refused one is untouched, the accepted one stored in full');
SELECT set_config('storm.record_engine', 'on', true);
SELECT tests.throws_like(format($q$UPDATE public.record_envelopes SET void_reason = %L WHERE id = %L$q$, repeat('r', 2001), :'void2'),
                         '23514', '%record_envelopes_void_reason_check%', 'record_envelopes: void_reason over 2000 (23514), even inside the engine');
SELECT tests.throws_like(format($q$UPDATE public.record_envelopes SET decision_conditions = %L WHERE id = %L$q$, repeat('c', 2001), :'void2'),
                         '23514', '%record_envelopes_decision_conditions_check%', 'record_envelopes: decision_conditions over 2000 (23514)');
SELECT set_config('storm.record_engine', '', true);

-- ------------------------------------------------------------ decide conditions: 2000

SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT (public.record_open_envelope('test.dec', tests.vessel_id('A.dra'))).id AS dec \gset
SELECT tests.is(public.record_sign_slot(tests.id('sig:tb:master'), tests.tb_slot(:'dec', 'master'), 'verified') ->> 'ok', 'true', 'the Master signs the decision record');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(public.record_transition(:'dec', 'acknowledge') ->> 'ok', 'true', 'the company acknowledges');
SELECT tests.is(public.record_transition(:'dec', 'decide', jsonb_build_object('decision', 'approved_with_conditions', 'conditions', repeat('c', 2001))) #>> '{error,code}', 'invalid_input',
                '2001-character decide conditions are refused');
SELECT tests.is(public.record_transition(:'dec', 'decide', jsonb_build_object('decision', 'approved_with_conditions', 'conditions', repeat('c', 2000))) ->> 'ok', 'true',
                '2000-character conditions are accepted');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT status, company_decision, length(decision_conditions) FROM public.record_envelopes WHERE id = %L$q$, :'dec'),
                        $q$VALUES ('closed'::text, 'approved_with_conditions'::text, 2000)$q$, 'stored in full');

-- ------------------------------------------------------------ the CHECKs are named and allow NULL

SELECT tests.is((SELECT count(*) FROM pg_constraint WHERE conname IN (
  'record_signatures_visitor_company_check', 'record_signatures_visitor_capacity_check', 'record_signatures_on_behalf_of_office_check',
  'record_signatures_on_behalf_reason_check', 'record_envelopes_void_reason_check', 'record_envelopes_decision_conditions_check')), 6::bigint, 'the six length CHECKs exist');
SELECT tests.ok(bool_and(pg_get_constraintdef(oid) LIKE '%IS NULL%'), 'each allows NULL')
FROM pg_constraint WHERE conname IN (
  'record_signatures_visitor_company_check', 'record_signatures_visitor_capacity_check', 'record_signatures_on_behalf_of_office_check',
  'record_signatures_on_behalf_reason_check', 'record_envelopes_void_reason_check', 'record_envelopes_decision_conditions_check');
