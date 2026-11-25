-- Record engine integration (spec §A.10-§A.12; D-30, D-32, D-48, D-51,
-- D-132): files 10-12 together. open -> the vessel signs -> awaiting
-- company close -> crew acknowledge refused (wrong_party) -> the company
-- acknowledges -> sign-off with an open request refused (open_requests) ->
-- reply + resolve -> sign-off closes (company signature, snapshot); remove
-- company signature and reopen; D-30 Return to vessel from submitted /
-- acknowledged / awaiting company close (vessel signatures superseded,
-- cycle 2); close-as rules; D-32 void by delete rule; impersonation;
-- version conflict; payload rules; isolation; fleet records.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user('A', 'A.crew_dra', 'crew');
SELECT tests.seed_assignment('A.crew_dra', 'A.dra', true, 'Deckhand');
SELECT tests.seed_user('A', 'A.off_dra', 'crew');
SELECT tests.seed_assignment('A.off_dra', 'A.dra', true, 'Deckhand');

INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, capability_path, company_step, report_first, decision_kind, allow_reopen, allow_close_as, edit_after_sign, delete_rule, slot_template)
VALUES
  ('test.permit', 'test', 'Permit to work', 'PTW', 'vessel', 'vessel.test.records', 'sign_off', false, false, true, true, 'lock', 'never_after_submit',
   jsonb_build_array(
     jsonb_build_object('key', 'prepared_by', 'label', 'Prepared by', 'order', 1, 'party', 'vessel', 'named_profile_ids', jsonb_build_array(tests.profile_id('A.crew_dra'))),
     jsonb_build_object('key', 'master', 'label', 'Master', 'order', 2, 'party', 'vessel', 'office_key', 'master'),
     jsonb_build_object('key', 'company_review', 'label', 'Company review', 'order', 3, 'party', 'company'))),
  ('test.incident', 'test', 'Incident', 'INC', 'vessel', 'vessel.test.records', 'acknowledge', true, false, true, true, 'allow_with_flag', 'never_after_submit',
   jsonb_build_array(jsonb_build_object('key', 'final_review', 'label', 'Final review', 'order', 1, 'party', 'vessel', 'office_key', 'master'))),
  ('test.note', 'test', 'Note', 'NTE', 'vessel', 'vessel.test.records', 'none', false, false, false, false, 'allow_with_flag', 'draft_only',
   jsonb_build_array(jsonb_build_object('key', 'author', 'label', 'Author', 'order', 1, 'party', 'vessel'))),
  ('test.loose', 'test', 'Loose', 'LSE', 'vessel', 'vessel.test.records', 'none', false, false, false, false, 'allow_with_flag', 'free', '[]'::jsonb),
  ('test.fleet_review', 'test', 'Fleet review', 'FRV', 'fleet', 'fleet.test.records', 'sign_off', false, false, false, false, 'lock', 'draft_only', '[]'::jsonb);

-- helpers for this file (rolled back with it)
CREATE FUNCTION tests.slot_of(p_env uuid, p_key text) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT sl.id FROM public.record_signature_slots AS sl JOIN public.record_envelopes AS e ON e.id = sl.envelope_id
  WHERE sl.envelope_id = p_env AND sl.cycle = e.current_cycle AND sl.slot_key = p_key
$$;
CREATE FUNCTION tests.env_status(p_env uuid) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$ SELECT status FROM public.record_envelopes WHERE id = p_env $$;
CREATE FUNCTION tests.code_of(p_result jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN (p_result ->> 'ok')::boolean THEN 'ok' ELSE p_result #>> '{error,code}' END $$;
GRANT EXECUTE ON FUNCTION tests.slot_of(uuid, text), tests.env_status(uuid), tests.code_of(jsonb) TO PUBLIC;

-- ------------------------------------------------------------ the main flow on a permit

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.record_open_envelope('test.permit', tests.vessel_id('A.dra'), tests.id('permit:flow'))).id AS permit \gset
SELECT tests.reset_role();
SELECT tests.as_service();
SELECT public.record_set_section_digests(:'permit', jsonb_build_object('*', repeat('1', 64)));
SELECT tests.reset_role();

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.is(tests.code_of(public.record_sign_slot(tests.id('sig:flow:1'), tests.slot_of(:'permit', 'prepared_by'), 'verified')), 'ok', 'crew sign the first slot');
SELECT tests.is(tests.env_status(:'permit'), 'in_review', 'the first vessel signature puts it in review');
SELECT tests.is(tests.code_of(public.record_sign_slot(tests.id('sig:flow:x'), tests.slot_of(:'permit', 'master'), 'verified')), 'not_eligible', 'crew are not the Master (office slot)');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is(tests.code_of(public.record_sign_slot(tests.id('sig:flow:2'), tests.slot_of(:'permit', 'master'), 'verified')), 'ok', 'the Master of this vessel signs the Master slot');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT status, whose_move, submitted_at IS NOT NULL FROM public.record_envelopes WHERE id = %L$q$, :'permit'),
  $q$VALUES ('awaiting_company_close'::text, 'company'::text, true)$q$, 'the last vessel slot hands it to the company (submitted, company''s move)');
SELECT tests.is((SELECT count(*) FROM public.record_snapshots WHERE envelope_id = :'permit' AND reason = 'submitted'), 1::bigint, 'a submitted snapshot');
SELECT tests.is((SELECT notification_type FROM public.record_events WHERE envelope_id = :'permit' AND action = 'vessel_sign' AND to_status = 'awaiting_company_close'), 'record_submitted_to_company', 'event vessel_sign notifies the company');

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.is(tests.code_of(public.record_transition(:'permit', 'acknowledge')), 'wrong_party', 'crew cannot acknowledge (wrong_party)');
SELECT tests.is(tests.code_of(public.record_transition(:'permit', 'vessel_sign')), 'invalid_action', 'vessel_sign is never a client action');
SELECT tests.is(tests.code_of(public.record_transition(:'permit', 'sign_off', '{"openRequests": 0}')), 'invalid_input', 'guards never come from the payload');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is(tests.code_of(public.record_transition(:'permit', 'sign_off')), 'wrong_party', 'the Master is not the company');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(tests.code_of(public.record_transition(:'permit', 'acknowledge', '{}', 99)), 'version_conflict', 'a stale expected version is refused');
SELECT tests.is(tests.code_of(public.record_transition(:'permit', 'acknowledge', '{}', (SELECT version FROM public.record_envelopes WHERE id = :'permit'))), 'ok', 'the company acknowledges the cycle');
SELECT tests.is(tests.code_of(public.record_transition(:'permit', 'acknowledge')), 'already_acknowledged', 'once per cycle');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT status, company_acknowledged, acknowledged_cycle, company_ack_by FROM public.record_envelopes WHERE id = %L$q$, :'permit'),
  format($q$VALUES ('awaiting_company_close'::text, true, 1, %L::uuid)$q$, tests.user_id('A.fleet_manager')), 'acknowledged: cycle 1, by the company actor');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is(tests.code_of(public.record_remove_signature(tests.id('sig:flow:2'), 'Wrong sheet')), 'company_acknowledged', 'D-51: the acknowledged cycle''s vessel signatures are locked');

-- A request blocks the sign-off until it is resolved.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(tests.code_of(public.record_post_thread_entry(tests.id('entry:flow:r1'), :'permit', 'status_updates', 'request', 'Send the gas readings', NULL, current_date + 2)), 'ok', 'the company asks for something');
SELECT tests.reset_role();
SELECT tests.is((SELECT whose_move FROM public.record_envelopes WHERE id = :'permit'), 'vessel', 'an open request makes it the vessel''s move');
SELECT tests.is((SELECT follow_up_due FROM public.record_envelopes WHERE id = :'permit'), current_date + 2, 'the request drives the follow-up date');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(tests.code_of(public.record_transition(:'permit', 'sign_off')), 'open_requests', 'sign-off with an open request is refused (open_requests)');
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.is(tests.code_of(public.record_post_thread_entry(tests.id('entry:flow:p1'), :'permit', 'status_updates', 'reply', 'Readings attached', NULL, NULL, tests.id('entry:flow:r1'))), 'ok', 'the vessel replies');
SELECT tests.is(tests.code_of(public.record_resolve_thread_request(tests.id('entry:flow:r1'), 'done')), 'wrong_party', 'the vessel cannot mark it done');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(tests.code_of(public.record_resolve_thread_request(tests.id('entry:flow:r1'), 'done', 'Thanks')), 'ok', 'the company marks it done');
SELECT tests.is(tests.code_of(public.record_transition(:'permit', 'sign_off')), 'ok', 'sign-off closes');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT status, closed_by_kind, whose_move, closed_by_user_id, version FROM public.record_envelopes WHERE id = %L$q$, :'permit'),
  format($q$VALUES ('closed'::text, 'company_sign_off'::text, 'none'::text, %L::uuid, 5)$q$, tests.user_id('A.fleet_manager')), 'closed by the company sign-off (version 1 + 4 engine steps)');
SELECT tests.results_eq(format($q$SELECT slot_key, party, decision, signer_user_id FROM public.record_signatures WHERE envelope_id = %L AND party = 'company'$q$, :'permit'),
  format($q$VALUES ('company_review'::text, 'company'::text, 'signed_off'::text, %L::uuid)$q$, tests.user_id('A.fleet_manager')), 'the company signature fills the company slot');
SELECT tests.is((SELECT count(*) FROM public.record_snapshots WHERE envelope_id = :'permit' AND reason = 'closed'), 1::bigint, 'a closed snapshot');
SELECT tests.ok((SELECT bool_and(sha256 = encode(sha256(convert_to(payload::text, 'UTF8')), 'hex')) FROM public.record_snapshots WHERE envelope_id = :'permit'), 'snapshot hashes match their payload');
SELECT tests.ok((SELECT jsonb_array_length(payload -> 'signatures') = 3 FROM public.record_snapshots WHERE envelope_id = :'permit' AND reason = 'closed'), 'the closed snapshot holds the cycle''s three signatures');
SELECT tests.results_eq(format($q$SELECT action, from_status, to_status FROM public.record_events WHERE envelope_id = %L AND from_status IS NOT NULL$q$, :'permit'),
  $q$VALUES ('vessel_sign'::text, 'open'::text, 'in_review'::text), ('vessel_sign', 'in_review', 'awaiting_company_close'), ('acknowledge', 'awaiting_company_close', 'awaiting_company_close'), ('sign_off', 'awaiting_company_close', 'closed')$q$,
  'one event per transition, from -> to');

-- Remove the company signature, then reopen.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(tests.code_of(public.record_transition(:'permit', 'remove_company_signature')), 'reason_required', 'removing the company signature needs a reason');
SELECT tests.is(tests.code_of(public.record_transition(:'permit', 'remove_company_signature', '{"reason": "Signed too early"}')), 'ok', 'the company removes its signature');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT status, closed_by_kind IS NULL, closed_at IS NULL FROM public.record_envelopes WHERE id = %L$q$, :'permit'),
  $q$VALUES ('awaiting_company_close'::text, true, true)$q$, 'back to awaiting company close');
SELECT tests.ok((SELECT removed_at IS NOT NULL AND removal_reason = 'Signed too early' FROM public.record_signatures WHERE envelope_id = :'permit' AND decision = 'signed_off'), 'the decision row is removed with the reason');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(tests.code_of(public.record_transition(:'permit', 'sign_off')), 'ok', 'signed off again');
SELECT tests.is(tests.code_of(public.record_transition(:'permit', 'reopen', '{"reason": "New gas readings"}')), 'ok', 'reopened');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT status, current_cycle, company_acknowledged, acknowledged_cycle IS NULL FROM public.record_envelopes WHERE id = %L$q$, :'permit'),
  $q$VALUES ('in_review'::text, 2, false, true)$q$, 'reopen: in review, cycle 2, unacknowledged');
SELECT tests.is((SELECT count(*) FROM public.record_signature_slots WHERE envelope_id = :'permit' AND cycle = 2), 3::bigint, 'cycle 2 slots');

-- ------------------------------------------------------------ D-30: Return to vessel

-- From awaiting_company_close (an incident whose final review is signed after the initial report).
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.record_open_envelope('test.incident', tests.vessel_id('A.dra'))).id AS inc1 \gset
SELECT tests.is(tests.code_of(public.record_transition(:'inc1', 'submit')), 'ok', 'the vessel submits the initial report');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(tests.code_of(public.record_transition(:'inc1', 'close_as', '{"closedAs": "after_review"}')), 'invalid_transition', 'close as after review from submitted is refused');
SELECT tests.is(tests.code_of(public.record_transition(:'inc1', 'acknowledge')), 'ok', 'the company acknowledges the initial report');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT status, initial_report_acknowledged, acknowledged_cycle IS NULL FROM public.record_envelopes WHERE id = %L$q$, :'inc1'),
  $q$VALUES ('acknowledged'::text, true, true)$q$, 'acknowledged initial report: no cycle lock');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is(tests.code_of(public.record_sign_slot(tests.id('sig:inc1:1'), tests.slot_of(:'inc1', 'final_review'), 'verified')), 'ok', 'the Master signs the final review');
SELECT tests.reset_role();
SELECT tests.is(tests.env_status(:'inc1'), 'awaiting_company_close', 'final review signed: awaiting company close');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(tests.code_of(public.record_transition(:'inc1', 'return_to_vessel')), 'reason_required', 'Return to vessel needs a reason');
SELECT tests.is(tests.code_of(public.record_transition(:'inc1', 'return_to_vessel', '{"reason": "Add the witness statements"}')), 'ok', 'D-30: returned from awaiting company close');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT status, current_cycle, whose_move FROM public.record_envelopes WHERE id = %L$q$, :'inc1'),
  $q$VALUES ('info_requested'::text, 2, 'vessel'::text)$q$, 'info requested, cycle 2, the vessel''s move');
SELECT tests.ok((SELECT superseded_at IS NOT NULL FROM public.record_signatures WHERE id = tests.id('sig:inc1:1')), 'the cycle-1 vessel signature is superseded');
SELECT tests.is((SELECT notification_type FROM public.record_events WHERE envelope_id = :'inc1' AND action = 'return_to_vessel'), 'record_returned', 'event record_returned');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is(tests.code_of(public.record_sign_slot(tests.id('sig:inc1:2'), tests.slot_of(:'inc1', 'final_review'), 'verified')), 'ok', 'the Master signs cycle 2');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(tests.code_of(public.record_transition(:'inc1', 'acknowledge')), 'ok', 'the company acknowledges and closes (acknowledge step)');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT status, closed_by_kind, acknowledged_cycle FROM public.record_envelopes WHERE id = %L$q$, :'inc1'),
  $q$VALUES ('closed'::text, 'company_acknowledge'::text, 2)$q$, 'closed by the acknowledgement of cycle 2');

-- From submitted (a vessel signature made while submitted is superseded too).
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.record_open_envelope('test.incident', tests.vessel_id('A.dra'))).id AS inc2 \gset
SELECT tests.is(tests.code_of(public.record_transition(:'inc2', 'submit')), 'ok', 'submitted');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is(tests.code_of(public.record_sign_slot(tests.id('sig:inc2:1'), tests.slot_of(:'inc2', 'final_review'), 'verified')), 'ok', 'a final-review signature while submitted');
SELECT tests.reset_role();
SELECT tests.is(tests.env_status(:'inc2'), 'submitted', 'signing does not move a submitted record');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(tests.code_of(public.record_transition(:'inc2', 'return_to_vessel', '{"reason": "Wrong vessel time zone"}')), 'ok', 'D-30: returned from submitted');
SELECT tests.reset_role();
SELECT tests.ok((SELECT superseded_at IS NOT NULL FROM public.record_signatures WHERE id = tests.id('sig:inc2:1')), 'superseded');
SELECT tests.is((SELECT current_cycle FROM public.record_envelopes WHERE id = :'inc2'), 2, 'cycle 2');

-- From acknowledged.
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.record_open_envelope('test.incident', tests.vessel_id('A.dra'))).id AS inc3 \gset
SELECT tests.is(tests.code_of(public.record_transition(:'inc3', 'submit')), 'ok', 'submitted');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(tests.code_of(public.record_transition(:'inc3', 'acknowledge')), 'ok', 'acknowledged');
SELECT tests.is(tests.code_of(public.record_transition(:'inc3', 'return_to_vessel', '{"reason": "More detail"}')), 'ok', 'D-30: returned from acknowledged');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT status, current_cycle, company_acknowledged, initial_report_acknowledged FROM public.record_envelopes WHERE id = %L$q$, :'inc3'),
  $q$VALUES ('info_requested'::text, 2, false, true)$q$, 'the new cycle starts unacknowledged; the initial-report history is kept');

-- ------------------------------------------------------------ close-as, duplicates

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.record_open_envelope('test.incident', tests.vessel_id('A.dra'))).id AS inc4 \gset
SELECT tests.is(tests.code_of(public.record_transition(:'inc4', 'submit')), 'ok', 'submitted');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT (public.record_open_envelope('test.incident', tests.vessel_id('B.lev'))).id AS inc_b \gset
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(tests.code_of(public.record_transition(:'inc4', 'close_as', jsonb_build_object('closedAs', 'duplicate'))), 'duplicate_required', 'a duplicate needs the record it duplicates');
SELECT tests.is(tests.code_of(public.record_transition(:'inc4', 'close_as', jsonb_build_object('closedAs', 'duplicate', 'duplicateOf', :'inc_b'))), 'invalid_duplicate', 'never a record of another company');
SELECT tests.is(tests.code_of(public.record_transition(:'inc4', 'close_as', jsonb_build_object('closedAs', 'duplicate', 'duplicateOf', 'not-a-uuid'))), 'invalid_duplicate', 'nor a non-record');
SELECT tests.is(tests.code_of(public.record_transition(:'inc4', 'close_as', jsonb_build_object('closedAs', 'duplicate', 'duplicateOf', :'inc4'))), 'invalid_duplicate', 'nor itself');
SELECT tests.is(tests.code_of(public.record_transition(:'inc4', 'close_as', jsonb_build_object('closedAs', 'duplicate', 'duplicateOf', :'inc3'))), 'ok', 'closed as a duplicate of a company record');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT status, closed_by_kind, closed_as, duplicate_of_envelope_id FROM public.record_envelopes WHERE id = %L$q$, :'inc4'),
  format($q$VALUES ('closed'::text, 'company_close_as'::text, 'duplicate'::text, %L::uuid)$q$, :'inc3'), 'closed as duplicate, linked');

-- ------------------------------------------------------------ D-32: void by delete rule

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.record_open_envelope('test.permit', tests.vessel_id('A.dra'))).id AS permit2 \gset
SELECT (public.record_open_envelope('test.note', tests.vessel_id('A.dra'))).id AS note1 \gset
SELECT (public.record_open_envelope('test.loose', tests.vessel_id('A.dra'))).id AS loose1 \gset
SELECT tests.is(tests.code_of(public.record_transition(:'permit2', 'void', '{"reason": "Raised twice"}')), 'wrong_party', 'never_after_submit: the vessel cannot void');
SELECT tests.is(tests.code_of(public.record_transition(:'note1', 'void')), 'reason_required', 'draft_only: a reason first');
SELECT tests.is(tests.code_of(public.record_transition(:'note1', 'void', '{"reason": "Raised twice"}')), 'ok', 'draft_only: the vessel voids');
SELECT tests.is(tests.code_of(public.record_transition(:'loose1', 'void', '{"reason": "x"}')), 'not_for_kind', 'free: deleted, not voided');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(tests.code_of(public.record_transition(:'permit2', 'void', '{"reason": "Raised twice"}')), 'ok', 'never_after_submit: the company voids');
SELECT tests.is(tests.code_of(public.record_transition(:'permit2', 'reopen', '{"reason": "x"}')), 'voided', 'a void record stays void');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT status, void_reason, voided_by, whose_move FROM public.record_envelopes WHERE id = %L$q$, :'permit2'),
  format($q$VALUES ('void'::text, 'Raised twice'::text, %L::uuid, 'none'::text)$q$, tests.user_id('A.fleet_manager')), 'void: reason, who, none''s move');
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.is(tests.code_of(public.record_sign_slot(tests.id('sig:void:1'), tests.slot_of(:'permit2', 'prepared_by'), 'verified')), 'not_open', 'a void record takes no signature');
SELECT tests.is(tests.code_of(public.record_post_thread_entry(tests.id('entry:void:1'), :'permit2', 'status_updates', 'update', 'Late note')), 'record_closed', 'nor an update');
SELECT tests.reset_role();

-- ------------------------------------------------------------ impersonation, access, isolation

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.record_open_envelope('test.permit', tests.vessel_id('A.dra'))).id AS permit3 \gset
SELECT tests.as_user(tests.user_id('A.fleet_manager'), '{"app_metadata": {"impersonating": true}}');
SELECT tests.is(tests.code_of(public.record_transition(:'permit3', 'void', '{"reason": "x"}')), 'impersonating', 'a login-as session cannot transition');
SELECT tests.as_user(tests.user_id('A.crew_dra'), '{"app_metadata": {"impersonating": "true"}}');
SELECT tests.is(tests.code_of(public.record_sign_slot(tests.id('sig:imp:1'), tests.slot_of(:'permit3', 'prepared_by'), 'verified')), 'impersonating', 'nor sign');
SELECT tests.is(tests.code_of(public.record_post_thread_entry(tests.id('entry:imp:1'), :'permit3', 'status_updates', 'update', 'x')), 'impersonating', 'nor post');
SELECT tests.as_user(tests.user_id('A.crew_dra'), '{"app_metadata": {"impersonating": false}}');
SELECT tests.is(tests.code_of(public.record_sign_slot(tests.id('sig:imp:2'), tests.slot_of(:'permit3', 'prepared_by'), 'verified')), 'ok', 'impersonating false is a normal session');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws(format($q$SELECT public.record_transition(%L, 'void', '{"reason": "x"}')$q$, :'permit3'), '42501', 'company B cannot transition A''s record');
SELECT tests.throws(format($q$SELECT public.record_sign_slot(%L, %L, 'verified')$q$, tests.id('sig:b:1'), tests.slot_of(:'permit3', 'master')), '42501', 'nor sign on it');
SELECT tests.throws(format($q$SELECT public.record_post_thread_entry(%L, %L, 'status_updates', 'update', 'x')$q$, tests.id('entry:b:1'), :'permit3'), '42501', 'nor post on it');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.throws(format($q$SELECT public.record_transition(%L, 'submit')$q$, :'permit3'), '42501', 'crew of another vessel cannot touch it');
SELECT tests.is_empty(format('SELECT 1 FROM public.record_envelopes WHERE id = %L', :'permit3'), 'nor read it');
SELECT tests.reset_role();
UPDATE public.account_memberships SET status = 'disabled' WHERE user_id = tests.user_id('A.off_dra');
SELECT tests.as_user(tests.user_id('A.off_dra'));
SELECT tests.throws(format($q$SELECT public.record_transition(%L, 'void', '{"reason": "x"}')$q$, :'permit3'), '42501', 'a disabled user cannot transition');
SELECT tests.is_empty('SELECT 1 FROM public.record_envelopes', 'nor read any record');
SELECT tests.is_empty('SELECT 1 FROM public.record_thread_entries', 'nor any thread entry');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws(format($q$SELECT public.record_transition(%L, 'void')$q$, tests.id('record:nope')), 'P0002', 'an unknown record id is P0002');
SELECT tests.reset_role();

-- ------------------------------------------------------------ fleet records (CC-15)

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT (public.record_open_envelope('test.fleet_review', NULL, NULL, 'Annual review')).id AS fleet1 \gset
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(tests.code_of(public.record_transition(:'fleet1', 'sign_off')), 'invalid_transition', 'a fleet record starts open (nothing to sign off yet)');
SELECT tests.is(tests.code_of(public.record_transition(:'fleet1', 'void', '{"reason": "Duplicate"}')), 'ok', 'the company voids a fleet record');
SELECT tests.reset_role();
SELECT tests.is((SELECT party FROM public.record_events WHERE envelope_id = :'fleet1' AND action = 'void'), 'company', 'the party of a fleet-record action by a company actor is company');

-- ------------------------------------------------------------ the status guard still holds after all of it

SELECT tests.as_service();
SELECT tests.throws_like(format($q$UPDATE public.record_envelopes SET status = 'open' WHERE id = %L$q$, :'permit'), '42501', 'record_status_is_server_owned', 'service_role still cannot write a status');
SELECT tests.throws_like(format($q$UPDATE public.record_signatures SET removed_at = now() WHERE envelope_id = %L$q$, :'permit'), '42501', 'record_status_is_server_owned', 'nor remove a signature outside the engine');
SELECT tests.throws_like(format($q$DELETE FROM public.record_signatures WHERE envelope_id = %L$q$, :'permit'), '42501', 'record_history_is_append_only', 'nor delete one');
SELECT tests.throws_like(format($q$UPDATE public.record_thread_entries SET request_state = 'open' WHERE envelope_id = %L$q$, :'permit'), '42501', 'record_status_is_server_owned', 'nor reopen a request outside the engine');
SELECT tests.throws_like(format($q$UPDATE public.record_thread_entries SET body = 'rewritten' WHERE envelope_id = %L$q$, :'permit'), '42501', 'record_history_is_append_only', 'nor rewrite an entry');
SELECT tests.reset_role();
SELECT tests.is(current_setting('storm.record_engine', true), '', 'the engine flag is reset after every call');
SELECT tests.is((SELECT count(*) FROM public.record_envelopes AS e WHERE e.whose_move IS DISTINCT FROM public.record_whose_move(e.id)), 0::bigint, 'every envelope''s whose_move equals record_whose_move()');
