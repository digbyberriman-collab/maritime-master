-- External viewers read records and change nothing (review round 4,
-- record-engine-external-writes; gap/01 F36, D-123, D-132): an in-window
-- external membership (kind external, vessel_scope assigned, one
-- membership vessel, no fleet access) reaches its vessel, so it reads the
-- vessel's records, but every engine write path asks
-- record_caller_may_write() (reach and no external membership) or a
-- company actor: open, transition, thread post / resolve, sign (verified:
-- not eligible; witnessed: no write access), pass, attach, link, remove an
-- attachment, unlink, and the storage write path. An expired external gets
-- nothing. A crew member of the vessel still writes. Every kind names a
-- capability_path (record_kinds_capability_path_check). Ports scratchpad
-- review-complete/c1_external_writes.sql.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user('A', 'A.ext', 'crew');
SELECT tests.seed_user('A', 'A.ext_old', 'crew');
SELECT tests.seed_user('A', 'A.crew_dra', 'crew');
SELECT tests.seed_assignment('A.crew_dra', 'A.dra', true, 'Deckhand');

-- The profile-synced rows become explicit external memberships on DRAAK:
-- one in its window, one whose window has ended.
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'external', vessel_scope = 'assigned', fleet_access = false, source = 'admin',
    valid_from = CASE WHEN user_id = tests.user_id('A.ext') THEN now() - interval '1 day' ELSE now() - interval '30 days' END,
    valid_until = CASE WHEN user_id = tests.user_id('A.ext') THEN now() + interval '7 days' ELSE now() - interval '1 day' END
WHERE user_id IN (tests.user_id('A.ext'), tests.user_id('A.ext_old'));
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT id, company_id, tests.vessel_id('A.dra') FROM public.account_memberships WHERE user_id IN (tests.user_id('A.ext'), tests.user_id('A.ext_old'));

INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, capability_path, company_step, report_first, decision_kind, allow_reopen, allow_close_as, edit_after_sign, delete_rule, slot_template)
VALUES ('test.note', 'test', 'Note', 'NTE', 'vessel', 'vessel.test.notes', 'none', false, false, false, false, 'allow_with_flag', 'draft_only',
        jsonb_build_array(jsonb_build_object('key', 'author', 'label', 'Author', 'order', 1, 'party', 'vessel', 'allow_witnessed', true)));

CREATE FUNCTION tests.xw_slot(p_env uuid, p_key text) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id FROM public.record_signature_slots WHERE envelope_id = p_env AND cycle = 1 AND slot_key = p_key
$$;
GRANT EXECUTE ON FUNCTION tests.xw_slot(uuid, text) TO PUBLIC;

SELECT tests.ok(public.reach_vessel_for(tests.user_id('A.ext'), tests.vessel_id('A.dra')) AND NOT public.fleet_reach_for(tests.user_id('A.ext'), tests.company_id('A'))
                AND NOT public.is_company_actor(tests.user_id('A.ext'), tests.vessel_id('A.dra')),
                'setup: the in-window external reaches DRAAK, has no fleet reach and is no company actor');
SELECT tests.ok(public.record_user_is_external(tests.user_id('A.ext'), tests.company_id('A')) AND public.record_user_is_external(tests.user_id('A.ext_old'), tests.company_id('A'))
                AND NOT public.record_user_is_external(tests.user_id('A.crew_dra'), tests.company_id('A'))
                AND NOT public.record_user_is_external(tests.user_id('A.ext'), tests.company_id('B'))
                AND NOT public.record_user_is_external(NULL, tests.company_id('A')) AND NOT public.record_user_is_external(tests.user_id('A.ext'), NULL),
                'record_user_is_external: both externals (in or out of window), nobody else, NULL ids false');
SELECT tests.ok(NOT public.record_caller_may_write(tests.user_id('A.ext'), tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.record_caller_may_write(tests.user_id('A.crew_dra'), tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.record_caller_may_write(tests.user_id('A.crew_dra'), tests.company_id('A'), tests.vessel_id('A.hyd'))
                AND NOT public.record_caller_may_write(NULL, tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.record_caller_may_write(tests.user_id('A.crew_dra'), NULL, tests.vessel_id('A.dra'))
                AND public.record_caller_may_write(tests.user_id('A.fleet_manager'), tests.company_id('A'), NULL),
                'record_caller_may_write: crew of the vessel yes, the external no, another vessel no, NULL ids no, fleet reach for a fleet record');

-- The crew member's records on DRAAK, a request from the company on the
-- first, and a registered file of it.
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.record_open_envelope('test.note', tests.vessel_id('A.dra'), NULL, 'crew note')).id AS crew_env \gset
SELECT (public.record_open_envelope('test.note', tests.vessel_id('A.dra'), NULL, 'second note')).id AS crew_env2 \gset
SELECT tests.company_id('A') || '/' || tests.vessel_id('A.dra') || '/test/note/' || :'crew_env' || '/00000000-0000-4000-8000-000000000001-evidence.pdf' AS fpath \gset
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('records', :'fpath', auth.uid(), jsonb_build_object('size', 1234, 'mimetype', 'application/pdf'));
SELECT (public.register_file_object('records', :'fpath', 'evidence.pdf', 'application/pdf', 1234)).id AS file_id \gset
SELECT (public.attach_record_file(:'file_id', :'crew_env2')).id AS attachment_id \gset
SELECT (public.link_records(:'crew_env2', :'crew_env')).id AS link_id \gset
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(public.record_post_thread_entry(tests.id('entry:xw:req'), :'crew_env', 'status_updates', 'request', 'Send the photos', NULL, current_date + 7) ->> 'ok', 'true',
                'setup: the company asks the vessel for an update');
SELECT tests.reset_role();

-- ------------------------------------------------------------ the in-window external reads and writes nothing

SELECT tests.as_user(tests.user_id('A.ext'));
SELECT tests.ok(public.record_readable(tests.company_id('A'), tests.vessel_id('A.dra')), 'the external may read DRAAK records');
SELECT tests.is((SELECT count(*) FROM public.record_envelopes WHERE id = :'crew_env'), 1::bigint, 'and sees the crew member''s envelope');
SELECT tests.throws_like(format($q$SELECT public.record_open_envelope('test.note', %L, NULL, 'ext note')$q$, tests.vessel_id('A.dra')),
                         '42501', 'record_access_denied', 'record_open_envelope: 42501');
SELECT tests.is(public.record_transition(:'crew_env', 'submit') #>> '{error,code}', 'no_write_access', 'record_transition submit: no_write_access');
SELECT tests.is(public.record_transition(:'crew_env', 'void', '{"reason": "not mine"}') #>> '{error,code}', 'no_write_access', 'record_transition void: no_write_access');
SELECT tests.is(public.record_transition(:'crew_env', 'void', '{"reason": "not mine"}') #>> '{error,message}', 'You can view this record but not change it.', 'with the view-only copy');
SELECT tests.throws_like(format($q$SELECT public.record_post_thread_entry(%L, %L, 'status_updates', 'update', 'Posted by an external viewer')$q$, tests.id('entry:xw:1'), :'crew_env'),
                         '42501', 'record_access_denied', 'record_post_thread_entry: 42501');
SELECT tests.throws_like(format($q$SELECT public.record_post_thread_entry(%L, %L, 'status_updates', 'reply', 'A reply', NULL, NULL, %L)$q$, tests.id('entry:xw:2'), :'crew_env', tests.id('entry:xw:req')),
                         '42501', 'record_access_denied', 'nor a reply to the request');
SELECT tests.throws_like(format($q$SELECT public.record_resolve_thread_request(%L, 'done')$q$, tests.id('entry:xw:req')),
                         '42501', 'record_access_denied', 'record_resolve_thread_request: 42501');
SELECT tests.is(public.record_sign_slot(tests.id('sig:xw:1'), tests.xw_slot(:'crew_env', 'author'), 'verified') #>> '{error,code}', 'not_eligible', 'record_sign_slot verified: not_eligible');
SELECT tests.is(public.record_sign_slot(tests.id('sig:xw:2'), tests.xw_slot(:'crew_env', 'author'), 'witnessed', tests.profile_id('A.crew_dra')) #>> '{error,code}', 'no_write_access',
                'record_sign_slot witnessed: no_write_access');
SELECT tests.is(public.record_pass_slot(tests.xw_slot(:'crew_env', 'author'), tests.profile_id('A.crew_dra')) #>> '{error,code}', 'no_write_access', 'record_pass_slot: no_write_access');
SELECT tests.is(public.record_cancel_pass(tests.xw_slot(:'crew_env', 'author')) #>> '{error,code}', 'no_write_access', 'record_cancel_pass: no_write_access');
SELECT tests.is(public.record_resign_slot(tests.id('sig:xw:3'), tests.xw_slot(:'crew_env', 'author')) #>> '{error,code}', 'no_write_access', 'record_resign_slot: no_write_access');
SELECT tests.throws_like(format('SELECT public.attach_record_file(%L, %L)', :'file_id', :'crew_env'), '42501', 'record_access_denied', 'attach_record_file: 42501');
SELECT tests.throws_like(format('SELECT public.link_records(%L, %L)', :'crew_env', :'crew_env2'), '42501', 'record_access_denied', 'link_records: 42501');
SELECT tests.throws_like(format('SELECT public.remove_record_attachment(%L)', :'attachment_id'), '22023', 'not_allowed', 'remove_record_attachment: not_allowed');
SELECT tests.throws_like(format('SELECT public.unlink_records(%L)', :'link_id'), '22023', 'not_allowed', 'unlink_records: not_allowed');
SELECT tests.ok(NOT public.storage_path_allowed('records', :'fpath', true), 'storage_path_allowed: no write for the external');
SELECT tests.ok(public.storage_path_allowed('records', :'fpath', false), 'storage_path_allowed: read is still allowed');
SELECT tests.throws(format($q$INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES ('records', %L, auth.uid(), '{}'::jsonb)$q$,
                           replace(:'fpath', '000000000001-evidence', '000000000002-ext')), '42501', 'so the records_insert storage policy refuses an upload');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT status, whose_move FROM public.record_envelopes WHERE id = %L$q$, :'crew_env'), $q$VALUES ('open'::text, 'vessel'::text)$q$,
                        'the crew member''s envelope is still open');
SELECT tests.is((SELECT count(*) FROM public.record_thread_entries WHERE author_user_id = tests.user_id('A.ext')), 0::bigint, '0 thread entries by the external');
SELECT tests.is((SELECT count(*) FROM public.record_signatures WHERE tests.user_id('A.ext') IN (signer_user_id, witness_user_id)), 0::bigint, '0 signatures by the external');
SELECT tests.is((SELECT count(*) FROM public.record_envelopes WHERE opened_by = tests.user_id('A.ext')), 0::bigint, '0 envelopes opened by the external');
SELECT tests.is((SELECT count(*) FROM public.record_attachments WHERE removed_at IS NULL AND id = :'attachment_id'), 1::bigint, 'the attachment is still live');
SELECT tests.is((SELECT count(*) FROM public.record_links WHERE removed_at IS NULL AND id = :'link_id'), 1::bigint, 'and the link');

-- ------------------------------------------------------------ the expired external gets nothing

SELECT tests.as_user(tests.user_id('A.ext_old'));
SELECT tests.ok(NOT public.record_readable(tests.company_id('A'), tests.vessel_id('A.dra')), 'the expired external may not read');
SELECT tests.is_empty(format('SELECT 1 FROM public.record_envelopes WHERE id = %L', :'crew_env'), 'and sees no envelope');
SELECT tests.throws(q.sql, '42501', 'expired external: ' || q.what)
FROM (VALUES
  ('open', format($q$SELECT public.record_open_envelope('test.note', %L)$q$, tests.vessel_id('A.dra'))),
  ('transition', format($q$SELECT public.record_transition(%L, 'submit')$q$, :'crew_env')),
  ('post', format($q$SELECT public.record_post_thread_entry(%L, %L, 'status_updates', 'update', 'x')$q$, tests.id('entry:xw:old'), :'crew_env')),
  ('resolve', format($q$SELECT public.record_resolve_thread_request(%L, 'done')$q$, tests.id('entry:xw:req'))),
  ('sign', format($q$SELECT public.record_sign_slot(%L, %L, 'verified')$q$, tests.id('sig:xw:old'), tests.xw_slot(:'crew_env', 'author'))),
  ('pass', format($q$SELECT public.record_pass_slot(%L, %L)$q$, tests.xw_slot(:'crew_env', 'author'), tests.profile_id('A.crew_dra'))),
  ('attach', format('SELECT public.attach_record_file(%L, %L)', :'file_id', :'crew_env')),
  ('link', format('SELECT public.link_records(%L, %L)', :'crew_env', :'crew_env2')),
  ('remove attachment', format('SELECT public.remove_record_attachment(%L)', :'attachment_id')),
  ('unlink', format('SELECT public.unlink_records(%L)', :'link_id')),
  ('register a file', format($q$SELECT public.register_file_object('records', %L, 'evidence.pdf', 'application/pdf', 1234)$q$, :'fpath'))
) AS q(what, sql);
SELECT tests.ok(NOT public.storage_path_allowed('records', :'fpath', true) AND NOT public.storage_path_allowed('records', :'fpath', false), 'storage_path_allowed: nothing');
SELECT tests.reset_role();

-- ------------------------------------------------------------ control: the crew member writes

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.is(public.record_post_thread_entry(tests.id('entry:xw:crew'), :'crew_env', 'status_updates', 'reply', 'Photos attached', NULL, NULL, tests.id('entry:xw:req')) ->> 'ok', 'true',
                'the crew member replies to the request');
SELECT tests.is(public.record_post_thread_entry(tests.id('entry:xw:crew2'), :'crew_env', 'status_updates', 'update', 'Done on deck') ->> 'ok', 'true', 'and posts an update');
SELECT tests.ok(public.storage_path_allowed('records', :'fpath', true), 'and may write the storage path');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(public.record_resolve_thread_request(tests.id('entry:xw:req'), 'done') ->> 'ok', 'true', 'the company marks its request done');
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.is(public.record_sign_slot(tests.id('sig:xw:crew'), tests.xw_slot(:'crew_env', 'author'), 'verified') ->> 'ok', 'true', 'and signs the author slot');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT status, closed_by_kind, closed_by_user_id FROM public.record_envelopes WHERE id = %L$q$, :'crew_env'),
                        format($q$VALUES ('closed'::text, 'vessel'::text, %L::uuid)$q$, tests.user_id('A.crew_dra')),
                        'which closes the record as the vessel, by the crew member');
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.ok((public.record_open_envelope('test.note', tests.vessel_id('A.dra'), NULL, 'third note')).id IS NOT NULL, 'and opens a new record');
SELECT tests.reset_role();

-- ------------------------------------------------------------ signature removal is a write path too (review round 5)

-- record-signature-write-gate-incomplete (D-214): record_remove_signature
-- asks record_caller_may_write() or a company actor right after the
-- impersonation check, so an external viewer removes nothing: (i) not as
-- "the Master" through a current Master crew_assignments row (and
-- record_is_master() is false for an external, defence in depth), (ii) not
-- their own signature after they became an external. The signature stays
-- live, the envelope status and version are unchanged and no
-- signature.removed / signature.status_stepped_back event is logged. Ports
-- scratchpad r4sec/a1_external_remove_signature.sql and
-- a1b_external_signer_removes.sql.
SELECT tests.seed_user('A', 'A.ext_master', 'crew');
SELECT tests.seed_assignment('A.ext_master', 'A.dra', true, 'Master');
SELECT tests.seed_user('A', 'A.crew2_dra', 'crew');
SELECT tests.seed_assignment('A.crew2_dra', 'A.dra', true, 'Deckhand');
SELECT tests.seed_user('A', 'A.signer_dra', 'crew');
SELECT tests.seed_assignment('A.signer_dra', 'A.dra', true, 'Deckhand');
INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, capability_path, company_step, edit_after_sign, delete_rule, slot_template)
VALUES ('test.ext', 'test', 'External test', 'EXT', 'vessel', 'vessel.test.ext', 'acknowledge', 'lock', 'draft_only', jsonb_build_array(
          jsonb_build_object('key', 'crew', 'label', 'Crew', 'order', 1, 'party', 'vessel'),
          jsonb_build_object('key', 'crew2', 'label', 'Crew 2', 'order', 2, 'party', 'vessel'))),
       ('test.ext2', 'test', 'External test 2', 'EXU', 'vessel', 'vessel.test.ext', 'acknowledge', 'lock', 'draft_only', jsonb_build_array(
          jsonb_build_object('key', 'crew', 'label', 'Crew', 'order', 1, 'party', 'vessel')));

-- (i) Two crew signatures on a test.ext record: awaiting the company.
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.record_open_envelope('test.ext', tests.vessel_id('A.dra'), NULL, 'two-slot record')).id AS env_i \gset
SELECT tests.is(public.record_sign_slot(tests.id('sig:xw:i1'), tests.xw_slot(:'env_i', 'crew'), 'verified') ->> 'ok', 'true', 'setup (i): the crew member signs the first slot');
SELECT tests.as_user(tests.user_id('A.crew2_dra'));
SELECT tests.is(public.record_sign_slot(tests.id('sig:xw:i2'), tests.xw_slot(:'env_i', 'crew2'), 'verified') ->> 'ok', 'true', 'setup (i): a second crew member signs the second slot');
SELECT tests.reset_role();
SELECT status AS env_i_status, version AS env_i_version FROM public.record_envelopes WHERE id = :'env_i' \gset
SELECT tests.is(:'env_i_status'::text, 'awaiting_company_close', 'setup (i): the record awaits the company');

-- (ii) The signer of a test.ext2 record ...
SELECT tests.as_user(tests.user_id('A.signer_dra'));
SELECT (public.record_open_envelope('test.ext2', tests.vessel_id('A.dra'), NULL, 'one-slot record')).id AS env_ii \gset
SELECT tests.is(public.record_sign_slot(tests.id('sig:xw:ii'), tests.xw_slot(:'env_ii', 'crew'), 'verified') ->> 'ok', 'true', 'setup (ii): the crew member signs');
SELECT tests.reset_role();
SELECT status AS env_ii_status, version AS env_ii_version FROM public.record_envelopes WHERE id = :'env_ii' \gset

-- ... leaves the vessel and is kept on as an external viewer of DRAAK; the
-- Master-row external is an in-window external of DRAAK too.
UPDATE public.crew_assignments SET is_current = false, leave_date = current_date WHERE user_id = tests.user_id('A.signer_dra');
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'external', vessel_scope = 'assigned', fleet_access = false, source = 'admin',
    valid_from = now() - interval '1 day', valid_until = now() + interval '30 days'
WHERE user_id IN (tests.user_id('A.ext_master'), tests.user_id('A.signer_dra'));
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT id, company_id, tests.vessel_id('A.dra') FROM public.account_memberships WHERE user_id IN (tests.user_id('A.ext_master'), tests.user_id('A.signer_dra'));
SELECT tests.ok(EXISTS (SELECT 1 FROM public.crew_assignments WHERE user_id = tests.user_id('A.ext_master') AND vessel_id = tests.vessel_id('A.dra') AND is_current AND position = 'Master'),
                'setup (i): the external still has a current Master crew_assignments row on DRAAK');
SELECT tests.ok(NOT public.record_is_master(tests.user_id('A.ext_master'), tests.vessel_id('A.dra')),
                'record_is_master: false for an external, whatever their crew_assignments row says (defence in depth)');
SELECT tests.ok(public.record_is_master(tests.user_id('A.master_dra'), tests.vessel_id('A.dra')), 'control: the DRAAK Master is still the Master');

SELECT tests.as_user(tests.user_id('A.ext_master'));
SELECT tests.ok(public.record_readable(tests.company_id('A'), tests.vessel_id('A.dra')), '(i) the Master-row external may read the record');
SELECT tests.is(public.record_transition(:'env_i', 'submit') #>> '{error,code}', 'no_write_access', '(i) record_transition: no_write_access');
SELECT tests.is(public.record_remove_signature(tests.id('sig:xw:i2'), 'external removes') #>> '{error,code}', 'no_write_access',
                '(i) record_remove_signature of the later crew signature: no_write_access');
SELECT tests.is(public.record_remove_signature(tests.id('sig:xw:i2'), 'external removes') #>> '{error,message}', 'You can view this record but not change it.', '(i) with the view-only copy');
SELECT tests.is(public.record_remove_signature(tests.id('sig:xw:i1'), 'external removes') #>> '{error,code}', 'no_write_access',
                '(i) record_remove_signature of the first crew signature: no_write_access');
SELECT tests.reset_role();

SELECT tests.as_user(tests.user_id('A.signer_dra'));
SELECT tests.ok(public.record_readable(tests.company_id('A'), tests.vessel_id('A.dra')), '(ii) the converted signer may read the record');
SELECT tests.is(public.record_remove_signature(tests.id('sig:xw:ii'), 'gone') #>> '{error,code}', 'no_write_access',
                '(ii) record_remove_signature of their own signature: no_write_access');
SELECT tests.reset_role();

SELECT tests.is((SELECT count(*) FROM public.record_signatures WHERE id IN (tests.id('sig:xw:i1'), tests.id('sig:xw:i2'), tests.id('sig:xw:ii')) AND removed_at IS NULL AND superseded_at IS NULL),
                3::bigint, 'every signature is still live (removed_at NULL)');
SELECT tests.results_eq(format($q$SELECT status, version FROM public.record_envelopes WHERE id = %L$q$, :'env_i'),
                        format($q$VALUES (%L::text, %s::integer)$q$, :'env_i_status', :'env_i_version'), '(i) the envelope status and version are unchanged');
SELECT tests.results_eq(format($q$SELECT status, version FROM public.record_envelopes WHERE id = %L$q$, :'env_ii'),
                        format($q$VALUES (%L::text, %s::integer)$q$, :'env_ii_status', :'env_ii_version'), '(ii) the envelope status and version are unchanged');
SELECT tests.is((SELECT count(*) FROM public.record_events WHERE envelope_id IN (:'env_i', :'env_ii') AND action IN ('signature.removed', 'signature.status_stepped_back')),
                0::bigint, 'no signature.removed or signature.status_stepped_back event');

-- Control: the crew signer (write access) still removes their signature.
SELECT tests.as_user(tests.user_id('A.crew2_dra'));
SELECT tests.is(public.record_remove_signature(tests.id('sig:xw:i2'), 'signed too early') ->> 'ok', 'true', 'control: the crew signer removes their own signature');
SELECT tests.reset_role();
SELECT tests.is((SELECT status FROM public.record_envelopes WHERE id = :'env_i'), 'in_review', 'control: the status steps back to in_review');

-- ------------------------------------------------------------ every kind names its capability path

SELECT tests.throws_like($q$INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, company_step, edit_after_sign, delete_rule)
  VALUES ('test.no_cap', 'test', 'No capability', 'NOC', 'vessel', 'none', 'lock', 'draft_only')$q$,
  '23514', '%record_kinds_capability_path_check%', 'a kind without a capability_path is refused (23514)');
SELECT tests.throws_like($q$INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, capability_path, company_step, edit_after_sign, delete_rule)
  VALUES ('test.bad_cap', 'test', 'Bad capability', 'BCP', 'vessel', 'vessel.test', 'none', 'lock', 'draft_only')$q$,
  '23514', '%record_kinds_capability_path_check%', 'and so is a malformed one');

-- ------------------------------------------------------------ ACLs

SELECT tests.ok(has_function_privilege('service_role', f, 'EXECUTE') AND NOT has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE'),
                f || ': service role only')
FROM unnest(ARRAY['public.record_user_is_external(uuid,uuid)', 'public.record_caller_may_write(uuid,uuid,uuid)']) AS f;
SELECT tests.ok((SELECT prosecdef AND proconfig @> ARRAY['search_path=public'] FROM pg_proc WHERE oid = f::regprocedure), f || ': SECURITY DEFINER with search_path')
FROM unnest(ARRAY['public.record_user_is_external(uuid,uuid)', 'public.record_caller_may_write(uuid,uuid,uuid)']) AS f;
