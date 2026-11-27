-- Crew document verification, alerts off, renewal history and the
-- verifier and expiry notices (X1-05,
-- 20261124060500_crew_document_verification.sql; gap/04 C27, C28, C29,
-- C30, W3, W4; DECISIONS D-128, D-232, D-238, D-249; PR-X1-E, PR-X1-K):
--   1. the pure helpers: the expiry notice stage table (TS expiryNoticeStage
--      holds the same rows) and the phrase;
--   2. the verifier rule: a person's role on the vessel, the HoD's own
--      department only, the Master, the Purser's office and fleet reach for
--      every department, a holder outside the HoD tier, other vessel, no
--      approve, inactive, another tenant, one's own documents; the list of
--      verifiers;
--   3. crew_document_review_rights;
--   4. crew_document_verify: every refusal (own document, other department,
--      not permitted, decision, notes, foreign, removed), the stamps, the
--      guard refusing the columns outside the engine;
--   5. crew_document_decided: the owner's login, the personal link, the
--      dedupe, no login no notice, a missing type does not roll back;
--   6. crew_certificates_review_notify: signed-in writes only, the
--      verifiers (the right department), one a day per person and vessel,
--      a material edit returns a verified document to unverified and tells
--      the verifiers, a missing type does not roll back;
--   7. alerts off: the capability, the reason, own documents, the real state
--      kept, unmute, the guard;
--   8. renewal: the gate, versions and their numbering, the old values,
--      verification reset, alerts back on, nothing changed, refusals;
--      versions RLS; TR9 through the version capture, and its fallback;
--   9. the expiry sweep: stages and catch-up, recipients (crew member,
--      HoD of the department, approvers), one digest per recipient and day,
--      once per stage, muted and ended skipped, a replaced document skipped,
--      a missing type counted as failed and retried, the counts;
--  10. the emitters named in their functions (D-238), grants and ACLs.

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ world (A.dra unless named)

SELECT tests.seed_user('A', 'A.chief_stew', 'crew');
SELECT tests.seed_assignment('A.chief_stew', 'A.dra', true, 'Chief Stew');        -- HoD, interior; approves
SELECT tests.seed_user('A', 'A.stew', 'crew');
SELECT tests.seed_assignment('A.stew', 'A.dra', true, 'Second Stew');             -- interior
SELECT tests.seed_user('A', 'A.deckhand', 'crew');
SELECT tests.seed_assignment('A.deckhand', 'A.dra', true, 'Deckhand');            -- deck
SELECT tests.seed_user('A', 'A.chief_officer', 'crew');
SELECT tests.seed_assignment('A.chief_officer', 'A.dra', true, 'Chief Officer');  -- HoD, deck; approves
SELECT tests.seed_user('A', 'A.purser', 'crew');
SELECT tests.seed_assignment('A.purser', 'A.dra', true, 'Purser');                -- Purser's office; approves
SELECT tests.seed_user('A', 'A.bosun', 'crew');
SELECT tests.seed_assignment('A.bosun', 'A.dra', true, 'Bosun');                  -- officer tier; approves
SELECT tests.seed_user('A', 'A.viewer', 'crew');
SELECT tests.seed_assignment('A.viewer', 'A.dra', true, 'Deck Rating');           -- reads documents only
SELECT tests.seed_user('A', 'A.hyd_hod', 'crew');
SELECT tests.seed_assignment('A.hyd_hod', 'A.hyd', true, 'Chief Stew');           -- approves, on another vessel
SELECT tests.seed_user('A', 'A.gone', 'crew');
SELECT tests.seed_assignment('A.gone', 'A.dra', false, 'Deckhand');               -- assignment ended
SELECT tests.seed_profile('A', 'A.pending', 'crew', 'not_invited', NULL,
  jsonb_build_object('is_imported', true, 'imported_vessel_id', tests.vessel_id('A.dra'), 'rank', 'Deckhand'));

-- Vessel-scoped roles (a fleet-scoped role with no vessel would give fleet reach, legacy_fleet_reach).
SELECT tests.seed_role('x15_approve', 'vessel');
SELECT tests.seed_role('x15_view', 'vessel');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, x.k, x.p::public.permission_level, 'vessel'
FROM (VALUES ('x15_approve', 'crew.view_crew_profiles', 'view'), ('x15_approve', 'crew_certificates', 'edit'),
             ('x15_view', 'crew.view_crew_profiles', 'view'), ('x15_view', 'crew_certificates', 'view')) AS x(r, k, p)
JOIN public.roles AS r ON r.name = x.r;
SELECT tests.seed_rbac_role(k, 'x15_approve', 'A.dra')
FROM unnest(ARRAY['A.chief_stew', 'A.chief_officer', 'A.purser', 'A.bosun', 'A.master_dra']) AS k;
SELECT tests.seed_rbac_role('A.hyd_hod', 'x15_approve', 'A.hyd');
SELECT tests.seed_rbac_role('A.viewer', 'x15_view', 'A.dra');

CREATE OR REPLACE FUNCTION pg_temp.ty(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT md5('storm.crew_document_type.' || p_key)::uuid $$;
CREATE OR REPLACE FUNCTION pg_temp.doc_id(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT tests.id('x15doc:' || p_key) $$;
-- A document of the person, as the superuser (no JWT: no notice, no caller rules).
CREATE OR REPLACE FUNCTION pg_temp.doc(p_key text, p_person text, p_type text, p_expiry date, p_country text DEFAULT 'GB')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid := pg_temp.doc_id(p_key);
BEGIN
  INSERT INTO public.crew_certificates (id, user_id, profile_id, certificate_type, certificate_name, certificate_number, issue_date, expiry_date,
                                        document_type_id, issuing_country_code, file_path, status)
  SELECT v_id, p.user_id, p.id, t.name, t.name, 'N-' || p_key, current_date - 400, p_expiry, t.id, p_country,
         p.company_id::text || '/crew/' || p.id::text || '/documents/' || v_id::text || '-scan.pdf', 'Valid'
  FROM public.profiles AS p, public.crew_document_types AS t
  WHERE p.id = tests.profile_id(p_person) AND t.id = pg_temp.ty(p_type);
  RETURN v_id;
END;
$$;
-- The row an RPC returned, captured once (results_eq runs its query twice).
CREATE TEMP TABLE rpc_out (k text PRIMARY KEY, r jsonb) ON COMMIT DROP;
GRANT ALL ON rpc_out TO authenticated, service_role;
CREATE OR REPLACE FUNCTION pg_temp.outbox(p_type text) RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT count(*) FROM public.notification_outbox WHERE type_key = p_type
$$;

SELECT pg_temp.doc('stew_eng1', 'A.stew', 'eng1', current_date + 400);
SELECT pg_temp.doc('stew_pp', 'A.stew', 'passport', current_date + 2000);
SELECT pg_temp.doc('deck_eng1', 'A.deckhand', 'eng1', current_date + 400);
SELECT pg_temp.doc('chief_eng1', 'A.chief_stew', 'eng1', current_date + 400);
SELECT pg_temp.doc('pending_eng1', 'A.pending', 'eng1', current_date + 400);
SELECT pg_temp.doc('stew_removed', 'A.stew', 'visa_uk', current_date + 400);
UPDATE public.crew_certificates SET deleted_at = now() WHERE id = pg_temp.doc_id('stew_removed');
SELECT pg_temp.doc('b_eng1', 'B.admin', 'eng1', current_date + 400);

-- Setup checks (so each answer below is the rule it claims to be).
SELECT tests.ok(public.has_capability_for(tests.user_id('A.chief_stew'), 'vessel.crew.crew_certificates.approve', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.has_capability_for(tests.user_id('A.chief_stew'), 'vessel.crew.expiry_alerts.edit', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.viewer'), 'vessel.crew.crew_certificates.approve', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.viewer'), 'vessel.crew.expiry_alerts.edit', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.has_capability_for(tests.user_id('A.viewer'), 'vessel.crew.crew_certificates.view', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.hyd_hod'), 'vessel.crew.crew_certificates.approve', tests.company_id('A'), tests.vessel_id('A.dra')),
  'setup: the approvers hold approve and expiry alerts on DRAAK; the viewer only reads; the HYDRA head of department does not reach DRAAK');
SELECT tests.ok(NOT public.fleet_reach_for(tests.user_id('A.chief_stew'), tests.company_id('A'))
                AND NOT public.fleet_reach_for(tests.user_id('A.chief_officer'), tests.company_id('A'))
                AND public.record_is_master(tests.user_id('A.master_dra'), tests.vessel_id('A.dra')),
  'setup: the heads of department have no fleet reach; the master holds the office on DRAAK');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox), 0::bigint, 'setup: writes without a JWT sent no notice');

-- ------------------------------------------------------------ 1. pure helpers

CREATE TEMP TABLE stage_case (days_left integer, window_days integer, stage text) ON COMMIT DROP;
INSERT INTO stage_case VALUES
  (300, 270, NULL), (271, 270, NULL), (270, 270, 'window'), (200, 270, 'window'), (31, 270, 'window'),
  (30, 270, 'd30'), (8, 270, 'd30'), (7, 270, 'd7'), (1, 270, 'd7'), (0, 270, 'expiry_day'), (-1, 270, 'expiry_day'),
  (-7, 270, 'expiry_day'), (-8, 270, NULL), (91, 90, NULL), (90, 90, 'window'), (31, 90, 'window'), (30, 90, 'd30'),
  (15, 14, NULL), (14, 14, 'd30'), (7, 14, 'd7'), (6, 5, NULL), (5, 5, 'd7'), (1, 0, NULL), (0, 0, 'expiry_day'),
  (-3, 0, 'expiry_day'), (NULL, 90, NULL), (10, NULL, NULL);
SELECT tests.is_empty($q$SELECT days_left, window_days FROM stage_case WHERE public.crew_document_expiry_stage(days_left, window_days) IS DISTINCT FROM stage$q$,
  'crew_document_expiry_stage: window entry, 30 days, 7 days and the expiry day with 7 days of catch-up, nothing outside the window (the TS stage table)');
SELECT tests.results_eq($q$SELECT public.crew_document_expiry_phrase(d) FROM unnest(ARRAY[12, 1, 0, -1, -3]) AS d$q$,
  $q$VALUES ('expires in 12 days'), ('expires tomorrow'), ('expires today'), ('expired yesterday'), ('expired 3 days ago')$q$,
  'crew_document_expiry_phrase: the days in words');

-- ------------------------------------------------------------ 2. the verifier rule

SELECT tests.results_eq(
  $q$SELECT k, r.position_key, r.rank_tier, r.department_key
     FROM unnest(ARRAY['A.chief_stew', 'A.stew', 'A.deckhand', 'A.chief_officer', 'A.purser', 'A.master_dra']) AS k
     LEFT JOIN LATERAL public.crew_member_role_on(tests.profile_id(k), tests.vessel_id('A.dra')) AS r ON true$q$,
  $q$VALUES ('A.chief_stew', 'chief_stew', 'hod', 'interior'), ('A.stew', 'second_stew', 'officer', 'interior'),
            ('A.deckhand', 'deckhand', 'rating', 'deck'), ('A.chief_officer', 'chief_officer', 'hod', 'deck'),
            ('A.purser', 'purser', 'hod', 'purser_office'), ('A.master_dra', 'master', 'command', 'bridge')$q$,
  'crew_member_role_on: the position, tier and department of each crew member on DRAAK');
SELECT tests.is_empty($q$SELECT 1 FROM public.crew_member_role_on(tests.profile_id('A.crew_hyd'), tests.vessel_id('A.dra'))$q$,
  'crew_member_role_on: nobody for a person not on the vessel''s crew');

CREATE TEMP TABLE verifier_case (caller text, subject text, answer text) ON COMMIT DROP;
INSERT INTO verifier_case VALUES
  ('A.chief_stew', 'A.stew', 'ok'),                     -- HoD, own department
  ('A.chief_stew', 'A.deckhand', 'out_of_department'),  -- HoD, another department
  ('A.chief_officer', 'A.deckhand', 'ok'),
  ('A.chief_officer', 'A.stew', 'out_of_department'),
  ('A.purser', 'A.stew', 'ok'),                         -- the Purser's office decides for every department
  ('A.purser', 'A.deckhand', 'ok'),
  ('A.master_dra', 'A.stew', 'ok'),                     -- the Master too
  ('A.master_dra', 'A.deckhand', 'ok'),
  ('A.fleet_manager', 'A.deckhand', 'ok'),              -- fleet reach
  ('A.bosun', 'A.stew', 'ok'),                          -- outside the HoD tier: not bound to a department
  ('A.master_dra', 'A.pending', 'ok'),                  -- a pending placement is on the vessel
  ('A.viewer', 'A.stew', 'not_permitted'),              -- no approve
  ('A.hyd_hod', 'A.stew', 'not_permitted'),             -- approve, but not on the person's vessel
  ('A.chief_stew', 'A.chief_stew', 'own_document'),
  ('A.master_dra', 'A.master_dra', 'own_document'),
  ('A.disabled', 'A.stew', 'not_permitted'),            -- inactive
  ('B.admin', 'A.stew', 'not_permitted'),               -- another tenant
  ('A.master_dra', 'B.admin', 'not_permitted'),
  ('A.master_dra', 'A.gone', 'not_permitted');          -- no current assignment
SELECT tests.is(public.crew_document_verifier_check(tests.user_id(c.caller), tests.profile_id(c.subject)), c.answer,
                format('verifier rule: %s on %s''s documents: %s', c.caller, c.subject, c.answer))
FROM verifier_case AS c ORDER BY c.caller, c.subject;
SELECT tests.is(public.crew_document_verifier_check(NULL, tests.profile_id('A.stew')), 'not_permitted', 'verifier rule: no user, not permitted');

SELECT tests.results_eq($q$SELECT user_id, vessel_id FROM public.crew_document_verifiers(tests.profile_id('A.stew'))$q$,
  $q$SELECT tests.user_id(k), tests.vessel_id('A.dra') FROM unnest(ARRAY['A.chief_stew', 'A.purser', 'A.bosun', 'A.master_dra', 'A.fleet_manager']) AS k$q$,
  'crew_document_verifiers: the interior HoD, the Purser, the bosun, the Master and fleet reach; not the deck HoD, the viewer, the HYDRA HoD or the person');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM public.crew_document_verifiers(tests.profile_id('A.deckhand')) WHERE user_id = tests.user_id('A.chief_stew'))
                AND EXISTS (SELECT 1 FROM public.crew_document_verifiers(tests.profile_id('A.deckhand')) WHERE user_id = tests.user_id('A.chief_officer')),
  'crew_document_verifiers: the deck HoD verifies the deckhand, the interior HoD does not');
SELECT tests.is_empty($q$SELECT 1 FROM public.crew_document_verifiers(tests.profile_id('A.gone'))$q$, 'crew_document_verifiers: nobody for a person with no current assignment');

-- ------------------------------------------------------------ 3. crew_document_review_rights

SELECT tests.as_user(tests.user_id('A.chief_stew'));
SELECT tests.results_eq(format('SELECT can_verify, verify_block, can_mute, can_renew FROM public.crew_document_review_rights(%L)', tests.profile_id('A.stew')),
  $q$VALUES (true, NULL::text, true, true)$q$, 'review rights: the interior HoD for the stew: verify, alerts and renew');
SELECT tests.results_eq(format('SELECT can_verify, verify_block, can_mute, can_renew FROM public.crew_document_review_rights(%L)', tests.profile_id('A.deckhand')),
  $q$VALUES (false, 'out_of_department'::text, true, true)$q$, 'review rights: the interior HoD for the deckhand: alerts and renew, no verifying (another department)');
SELECT tests.results_eq(format('SELECT can_verify, verify_block, can_mute FROM public.crew_document_review_rights(%L)', tests.profile_id('A.chief_stew')),
  $q$VALUES (false, 'own_document'::text, false)$q$, 'review rights: one''s own documents: no verifying, no alerts off');
SELECT tests.as_user(tests.user_id('A.viewer'));
SELECT tests.results_eq(format('SELECT can_verify, verify_block, can_mute, can_renew FROM public.crew_document_review_rights(%L)', tests.profile_id('A.stew')),
  $q$VALUES (false, 'not_permitted'::text, false, false)$q$, 'review rights: a reader: nothing');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.results_eq(format('SELECT can_verify, verify_block, can_mute, can_renew FROM public.crew_document_review_rights(%L)', tests.profile_id('A.stew')),
  $q$VALUES (false, 'not_permitted'::text, false, false)$q$, 'review rights: a caller who may not read the documents: all false');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(format('SELECT * FROM public.crew_document_review_rights(%L)', tests.profile_id('A.stew')), 'P0002', 'profile_not_found', 'review rights: another tenant''s person: P0002');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws_like(format('SELECT * FROM public.crew_document_review_rights(%L)', tests.profile_id('A.stew')), '42501', 'crew_not_permitted', 'review rights: an inactive caller: 42501');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 4. crew_document_verify

SELECT tests.as_user(tests.user_id('A.stew'));
SELECT tests.throws_like(format('SELECT public.crew_document_verify(%L, %L, NULL)', pg_temp.doc_id('stew_eng1'), 'verified'), '42501', 'own_document',
  'verify: never one''s own documents (even without approve, the refusal names it)');
SELECT tests.throws_like(format($q$UPDATE public.crew_certificates SET verification_status = 'verified' WHERE id = %L$q$, pg_temp.doc_id('stew_eng1')), '42501', 'crew_document_engine_only',
  'verify: the owner cannot write the verification columns directly (060400 guard)');
SELECT tests.as_user(tests.user_id('A.chief_stew'));
SELECT tests.throws_like(format('SELECT public.crew_document_verify(%L, %L, NULL)', pg_temp.doc_id('chief_eng1'), 'verified'), '42501', 'own_document',
  'verify: an approver''s own document is refused (42501 own_document)');
SELECT tests.throws_like(format('SELECT public.crew_document_verify(%L, %L, NULL)', pg_temp.doc_id('deck_eng1'), 'verified'), '42501', 'out_of_department',
  'verify: a head of department and another department''s document (42501 out_of_department)');
SELECT tests.throws_like(format('SELECT public.crew_document_verify(%L, %L, NULL)', pg_temp.doc_id('stew_eng1'), 'approved'), '22023', 'decision_invalid',
  'verify: an unknown decision (22023 decision_invalid)');
SELECT tests.throws_like(format('SELECT public.crew_document_verify(%L, %L, NULL)', pg_temp.doc_id('stew_eng1'), 'unverified'), '22023', 'decision_invalid',
  'verify: unverified is not a decision');
SELECT tests.throws_like(format('SELECT public.crew_document_verify(%L, %L, NULL)', pg_temp.doc_id('stew_eng1'), 'rejected'), '22023', 'note_required',
  'verify: a rejection needs a note');
SELECT tests.throws_like(format('SELECT public.crew_document_verify(%L, %L, %L)', pg_temp.doc_id('stew_eng1'), 'conditionally_approved', '   '), '22023', 'note_required',
  'verify: a conditional approval needs a note (blank is none)');
SELECT tests.throws_like(format('SELECT public.crew_document_verify(%L, %L, %L)', pg_temp.doc_id('stew_eng1'), 'rejected', repeat('x', 2001)), '22023', 'field_invalid',
  'verify: a note of more than 2000 characters');
SELECT tests.throws_like(format('SELECT public.crew_document_verify(%L, %L, NULL)', pg_temp.doc_id('stew_removed'), 'verified'), 'P0002', 'document_not_found',
  'verify: a removed document (P0002)');
SELECT tests.throws_like(format('SELECT public.crew_document_verify(%L, %L, NULL)', pg_temp.doc_id('b_eng1'), 'verified'), 'P0002', 'document_not_found',
  'verify: another tenant''s document (P0002)');
SELECT tests.throws_like(format('SELECT public.crew_document_verify(%L, %L, NULL)', tests.id('nothing'), 'verified'), 'P0002', 'document_not_found',
  'verify: an unknown document (P0002)');
SELECT tests.as_user(tests.user_id('A.viewer'));
SELECT tests.throws_like(format('SELECT public.crew_document_verify(%L, %L, NULL)', pg_temp.doc_id('stew_eng1'), 'verified'), '42501', 'not_permitted',
  'verify: a reader without approve (42501 not_permitted)');
SELECT tests.as_user(tests.user_id('A.hyd_hod'));
SELECT tests.throws_like(format('SELECT public.crew_document_verify(%L, %L, NULL)', pg_temp.doc_id('stew_eng1'), 'verified'), '42501', 'not_permitted',
  'verify: an approver of another vessel (42501 not_permitted)');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws_like(format('SELECT public.crew_document_verify(%L, %L, NULL)', pg_temp.doc_id('stew_eng1'), 'verified'), '42501', 'crew_not_permitted',
  'verify: an inactive caller (42501)');
SELECT tests.reset_role();
SELECT tests.is((SELECT verification_status FROM public.crew_certificates WHERE id = pg_temp.doc_id('stew_eng1')), 'unverified', 'verify: every refusal left the document unverified');

-- ------------------------------------------------------------ 5. crew_document_decided

-- D-128: with crew_document_decided missing, the decision stands and nothing is sent.
SAVEPOINT decided_missing;
DELETE FROM public.notification_types WHERE key = 'crew_document_decided';
SELECT tests.as_user(tests.user_id('A.chief_stew'));
SELECT tests.is((SELECT verification_status FROM public.crew_document_verify(pg_temp.doc_id('stew_pp'), 'verified', NULL)), 'verified',
  'verify: a missing notification type does not roll the decision back (D-128)');
SELECT tests.reset_role();
SELECT tests.is(pg_temp.outbox('crew_document_decided'), 0::bigint, 'verify: and nothing was sent');
ROLLBACK TO SAVEPOINT decided_missing;

SELECT tests.as_user(tests.user_id('A.chief_stew'));
SELECT tests.lives(format($q$INSERT INTO rpc_out SELECT 'verify1', to_jsonb(x) FROM public.crew_document_verify(%L, 'verified', '  ') AS x$q$, pg_temp.doc_id('stew_eng1')),
  'verify: the interior HoD verifies the stew''s document');
SELECT tests.results_eq(
  $q$SELECT r ->> 'verification_status', (r ->> 'verified_by')::uuid, r ->> 'verified_at' IS NOT NULL, r ->> 'verification_note' FROM rpc_out WHERE k = 'verify1'$q$,
  format($q$VALUES ('verified'::text, %L::uuid, true, NULL::text)$q$, tests.user_id('A.chief_stew')),
  'verify: verified, stamped with the reviewer and time; a blank note is none');
SELECT tests.reset_role();
SELECT tests.results_eq(
  $q$SELECT type_key, link_scope, link_path, vessel_id, must_act_user_ids, severity, dedupe_key IS NOT NULL FROM public.notification_outbox WHERE type_key = 'crew_document_decided'$q$,
  format($q$VALUES ('crew_document_decided'::text, 'personal'::text, 'documents'::text, NULL::uuid, ARRAY[%L::uuid], 'success'::text, true)$q$, tests.user_id('A.stew')),
  'decided: one notice to the owner''s login with a personal link to their documents');
SELECT tests.results_eq($q$SELECT user_id FROM public.notification_inbox WHERE type_key = 'crew_document_decided'$q$,
  format($q$VALUES (%L::uuid)$q$, tests.user_id('A.stew')), 'decided: it reaches the owner''s inbox');

SELECT tests.as_user(tests.user_id('A.chief_stew'));
SELECT tests.lives(format($q$SELECT public.crew_document_verify(%L, 'verified', 'Checked again')$q$, pg_temp.doc_id('stew_eng1')), 'verify: the same decision again');
SELECT tests.reset_role();
SELECT tests.is(pg_temp.outbox('crew_document_decided'), 1::bigint, 'decided: the same decision on the same day is not sent twice (dedupe)');
SELECT tests.as_user(tests.user_id('A.purser'));
SELECT tests.lives(format($q$INSERT INTO rpc_out SELECT 'verify2', to_jsonb(x) FROM public.crew_document_verify(%L, 'conditionally_approved', 'Valid with corrective lenses. Until 1 Mar 2027.') AS x$q$, pg_temp.doc_id('stew_eng1')),
  'verify: the Purser decides on an interior document');
SELECT tests.results_eq($q$SELECT r ->> 'verification_status', r ->> 'verification_note' FROM rpc_out WHERE k = 'verify2'$q$,
  $q$VALUES ('conditionally_approved'::text, 'Valid with corrective lenses. Until 1 Mar 2027.'::text)$q$,
  'verify: a conditional approval with the condition and until when');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is((SELECT verification_status FROM public.crew_document_verify(pg_temp.doc_id('deck_eng1'), 'rejected', 'The scan is unreadable')), 'rejected',
  'verify: the Master rejects a deck document with a reason');
SELECT tests.is((SELECT verification_status FROM public.crew_document_verify(pg_temp.doc_id('pending_eng1'), 'verified', NULL)), 'verified',
  'verify: a person without a login can have documents verified');
SELECT tests.reset_role();
-- D-371: a rejected document is not re-opened by its subject without edit
-- rights (crew uploads are off on DRAAK here): the direct write that would
-- return it to unverified is refused, and it stays rejected.
SELECT tests.as_user(tests.user_id('A.deckhand'));
SELECT tests.throws_like(format($q$UPDATE public.crew_certificates SET certificate_number = 'RE-OPEN-1' WHERE id = %L$q$, pg_temp.doc_id('deck_eng1')),
  '42501', 'crew_not_permitted', 'rejected: the subject cannot re-open a rejected document by a direct write (uploads off)');
SELECT tests.throws_like(format($q$UPDATE public.crew_certificates SET expiry_date = expiry_date + 30 WHERE id = %L$q$, pg_temp.doc_id('deck_eng1')),
  '42501', 'crew_not_permitted', 'rejected: nor by moving its expiry date');
SELECT tests.reset_role();
SELECT tests.results_eq(format('SELECT verification_status, verification_note FROM public.crew_certificates WHERE id = %L', pg_temp.doc_id('deck_eng1')),
  $q$VALUES ('rejected'::text, 'The scan is unreadable'::text)$q$, 'rejected: the document stays rejected with its reason');
SELECT tests.results_eq(
  $q$SELECT must_act_user_ids[1], severity, body FROM public.notification_outbox WHERE type_key = 'crew_document_decided' ORDER BY created_at, id$q$,
  format($q$VALUES (%L::uuid, 'success'::text, 'Checked against the file and the details you entered.'::text),
                   (%L::uuid, 'warning'::text, 'Valid with corrective lenses. Until 1 Mar 2027.'::text),
                   (%L::uuid, 'warning'::text, 'The scan is unreadable'::text)$q$,
         tests.user_id('A.stew'), tests.user_id('A.stew'), tests.user_id('A.deckhand')),
  'decided: a new decision is a new notice with the note as its body; a person without a login gets none');

-- ------------------------------------------------------------ 6. crew_certificates_review_notify

-- The crew's own legacy writes below need crew uploads on for their vessel
-- (D-371: the guard holds a direct write to crew_document_may_write).
INSERT INTO public.vessel_crew_settings (vessel_id, crew_uploads_enabled) VALUES (tests.vessel_id('A.dra'), true)
ON CONFLICT (vessel_id) DO UPDATE SET crew_uploads_enabled = true;

-- D-128: with crew_document_review_needed missing, an upload still saves.
SAVEPOINT review_missing;
DELETE FROM public.notification_types WHERE key = 'crew_document_review_needed';
SELECT tests.as_user(tests.user_id('A.stew'));
SELECT tests.lives($q$INSERT INTO public.crew_certificates (user_id, certificate_type, certificate_name, expiry_date) VALUES (auth.uid(), 'ENG1 Medical Certificate', 'ENG1 Medical Certificate', current_date + 300)$q$,
  'review notice: with the type missing the upload still saves (D-128)');
SELECT tests.reset_role();
SELECT tests.is(pg_temp.outbox('crew_document_review_needed'), 0::bigint, 'review notice: and nothing was sent');
ROLLBACK TO SAVEPOINT review_missing;

SELECT tests.as_user(tests.user_id('A.stew'));
SELECT tests.lives($q$INSERT INTO public.crew_certificates (id, user_id, certificate_type, certificate_name, expiry_date)
                      VALUES (md5('x15doc:stew_upload')::uuid, auth.uid(), 'ENG1 Medical Certificate', 'ENG1 Medical Certificate', current_date + 300)$q$,
  'review notice: the stew adds a document through the legacy path');
SELECT tests.reset_role();
SELECT tests.results_eq(
  $q$SELECT link_scope, link_path, vessel_id, severity, dedupe_key FROM public.notification_outbox WHERE type_key = 'crew_document_review_needed'$q$,
  format($q$VALUES ('vessel'::text, %L::text, %L::uuid, 'info'::text, %L::text)$q$,
         'crew/people/' || tests.profile_id('A.stew') || '/documents', tests.vessel_id('A.dra'),
         format('crew_document_review_needed:%s:%s:%s', tests.profile_id('A.stew'), tests.vessel_id('A.dra'), to_char(current_date, 'YYYY-MM-DD'))),
  'review notice: one outbox row for the person, the vessel and the day, linked to the document''s tab');
SELECT tests.results_eq($q$SELECT unnest(must_act_user_ids) FROM public.notification_outbox WHERE type_key = 'crew_document_review_needed'$q$,
  $q$SELECT tests.user_id(k) FROM unnest(ARRAY['A.bosun', 'A.chief_stew', 'A.fleet_manager', 'A.master_dra', 'A.purser']) AS k$q$,
  'review notice: to the person''s verifiers (the interior HoD, not the deck HoD)');
SELECT tests.results_eq($q$SELECT user_id FROM public.notification_inbox WHERE type_key = 'crew_document_review_needed'$q$,
  $q$SELECT tests.user_id(k) FROM unnest(ARRAY['A.bosun', 'A.chief_stew', 'A.fleet_manager', 'A.master_dra', 'A.purser']) AS k$q$,
  'review notice: each verifier''s inbox; the writer hears nothing');
SELECT tests.as_user(tests.user_id('A.stew'));
SELECT tests.lives($q$INSERT INTO public.crew_certificates (user_id, certificate_type, certificate_name, expiry_date) VALUES (auth.uid(), 'Food Hygiene Certificate', 'Food Hygiene Certificate', current_date + 900)$q$,
  'review notice: a second upload the same day');
SELECT tests.lives(format($q$UPDATE public.crew_certificates SET certificate_number = 'M-2' WHERE id = %L$q$, md5('x15doc:stew_upload')::uuid),
  'review notice: and a change');
SELECT tests.reset_role();
SELECT tests.is(pg_temp.outbox('crew_document_review_needed'), 1::bigint, 'review notice: each verifier hears of the person once a day');

-- A material edit returns a verified document to unverified and tells the verifiers (T-139, T-163).
UPDATE public.crew_certificates SET verification_status = 'verified', verified_by = tests.user_id('A.chief_officer'), verified_at = now()
WHERE id = pg_temp.doc_id('deck_eng1');
SELECT tests.as_user(tests.user_id('A.deckhand'));
SELECT tests.lives(format($q$UPDATE public.crew_certificates SET notes = 'Kept in the ship''s office' WHERE id = %L$q$, pg_temp.doc_id('deck_eng1')),
  'reset: a change of the notes only');
SELECT tests.reset_role();
SELECT tests.is((SELECT verification_status FROM public.crew_certificates WHERE id = pg_temp.doc_id('deck_eng1')), 'verified',
  'reset: a non-material change keeps the verification');
SELECT tests.as_user(tests.user_id('A.deckhand'));
SELECT tests.lives(format($q$UPDATE public.crew_certificates SET expiry_date = current_date + 500 WHERE id = %L$q$, pg_temp.doc_id('deck_eng1')),
  'reset: the owner changes the expiry date');
SELECT tests.reset_role();
SELECT tests.results_eq(format('SELECT verification_status, verified_by, verified_at FROM public.crew_certificates WHERE id = %L', pg_temp.doc_id('deck_eng1')),
  $q$VALUES ('unverified'::text, NULL::uuid, NULL::timestamptz)$q$, 'reset: a material edit returns the verified document to unverified');
SELECT tests.results_eq(
  format($q$SELECT unnest(must_act_user_ids) FROM public.notification_outbox WHERE type_key = 'crew_document_review_needed' AND dedupe_key LIKE %L$q$,
         'crew_document_review_needed:' || tests.profile_id('A.deckhand') || ':%'),
  $q$SELECT tests.user_id(k) FROM unnest(ARRAY['A.bosun', 'A.chief_officer', 'A.fleet_manager', 'A.master_dra', 'A.purser']) AS k$q$,
  'reset: the deckhand''s verifiers are told (the deck HoD, not the interior HoD)');
UPDATE public.crew_certificates SET verification_status = 'verified', verified_by = tests.user_id('A.purser'), verified_at = now()
WHERE id = pg_temp.doc_id('stew_pp');
SELECT tests.as_user(tests.user_id('A.chief_officer'));
SELECT tests.lives(format($q$SELECT public.crew_document_save(%L, %L, NULL, '{"number": "M-DECK-2"}'::jsonb)$q$, pg_temp.doc_id('stew_pp'), tests.profile_id('A.stew')),
  'reset: an editor changes the verified passport''s number through crew_document_save');
SELECT tests.reset_role();
SELECT tests.is((SELECT verification_status FROM public.crew_certificates WHERE id = pg_temp.doc_id('stew_pp')), 'unverified',
  'reset: the save''s material change returns it to unverified too');

-- ------------------------------------------------------------ 7. alerts off

SELECT tests.as_user(tests.user_id('A.viewer'));
SELECT tests.throws_like(format('SELECT public.crew_document_mute(%L, %L)', pg_temp.doc_id('stew_eng1'), 'Renewal booked'), '42501', 'not_permitted',
  'alerts off: needs vessel.crew.expiry_alerts.edit (42501)');
SELECT tests.as_user(tests.user_id('A.chief_stew'));
SELECT tests.throws_like(format('SELECT public.crew_document_mute(%L, %L)', pg_temp.doc_id('chief_eng1'), 'Renewal booked'), '42501', 'own_document',
  'alerts off: never on one''s own documents');
SELECT tests.throws_like(format('SELECT public.crew_document_mute(%L, %L)', pg_temp.doc_id('stew_eng1'), '  '), '22023', 'reason_required',
  'alerts off: a reason is required');
SELECT tests.throws_like(format('SELECT public.crew_document_mute(%L, %L)', pg_temp.doc_id('stew_eng1'), repeat('r', 501)), '22023', 'field_invalid',
  'alerts off: a reason of at most 500 characters');
SELECT tests.throws_like(format('SELECT public.crew_document_mute(%L, %L)', pg_temp.doc_id('b_eng1'), 'x'), 'P0002', 'document_not_found',
  'alerts off: another tenant''s document (P0002)');
SELECT tests.lives(format($q$INSERT INTO rpc_out SELECT 'mute', to_jsonb(x) FROM public.crew_document_mute(%L, ' Renewal booked ') AS x$q$, pg_temp.doc_id('deck_eng1')),
  'alerts off: the interior HoD turns off a deck document''s alerts (alerts are not bound to a department)');
SELECT tests.results_eq($q$SELECT (r ->> 'alerts_muted')::boolean, (r ->> 'muted_by')::uuid, r ->> 'muted_at' IS NOT NULL, r ->> 'muted_reason' FROM rpc_out WHERE k = 'mute'$q$,
  format($q$VALUES (true, %L::uuid, true, 'Renewal booked'::text)$q$, tests.user_id('A.chief_stew')),
  'alerts off: with who, when and why (the reason trimmed)');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.chief_officer'));
SELECT tests.results_eq(format('SELECT state, alerts_muted, muted_reason FROM public.crew_documents_for_profile(%L) WHERE id = %L', tests.profile_id('A.deckhand'), pg_temp.doc_id('deck_eng1')),
  $q$VALUES ('valid'::text, true, 'Renewal booked'::text)$q$, 'alerts off: the document keeps its real state');
SELECT tests.as_user(tests.user_id('A.deckhand'));
SELECT tests.throws_like(format($q$UPDATE public.crew_certificates SET alerts_muted = false, muted_at = NULL WHERE id = %L$q$, pg_temp.doc_id('deck_eng1')), '42501', 'crew_document_engine_only',
  'alerts off: the owner cannot turn them back on directly (060400 guard)');
SELECT tests.as_user(tests.user_id('A.bosun'));
SELECT tests.lives(format($q$INSERT INTO rpc_out SELECT 'unmute', to_jsonb(x) FROM public.crew_document_unmute(%L) AS x$q$, pg_temp.doc_id('deck_eng1')),
  'alerts on: the bosun turns them back on');
SELECT tests.results_eq($q$SELECT (r ->> 'alerts_muted')::boolean, r ->> 'muted_by', r ->> 'muted_at', r ->> 'muted_reason' FROM rpc_out WHERE k = 'unmute'$q$,
  $q$VALUES (false, NULL::text, NULL::text, NULL::text)$q$, 'alerts on: who, when and why are cleared');
SELECT tests.is((SELECT alerts_muted FROM public.crew_document_unmute(pg_temp.doc_id('deck_eng1'))), false, 'alerts on: a document whose alerts are on is returned unchanged');
SELECT tests.as_user(tests.user_id('A.viewer'));
SELECT tests.throws_like(format('SELECT public.crew_document_unmute(%L)', pg_temp.doc_id('deck_eng1')), '42501', 'not_permitted', 'alerts on: the same gate');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 8. renewal

SELECT tests.as_user(tests.user_id('A.viewer'));
SELECT tests.throws_like(format($q$SELECT public.crew_document_renew(%L, '{"expiry_date": "2031-01-01"}'::jsonb)$q$, pg_temp.doc_id('stew_eng1')), '42501', 'crew_not_permitted',
  'renew: needs the right to change the person''s documents');
SELECT tests.as_user(tests.user_id('A.chief_stew'));
SELECT tests.throws_like(format($q$SELECT public.crew_document_renew(%L, '{"number": "M-9"}'::jsonb)$q$, pg_temp.doc_id('stew_eng1')), '22023', 'field_required',
  'renew: a new expiry date or the No-expiry tick is required');
SELECT tests.throws_like(format($q$SELECT public.crew_document_renew(%L, '{"expiry_date": "2031-01-01"}'::jsonb)$q$, pg_temp.doc_id('b_eng1')), 'P0002', 'document_not_found',
  'renew: another tenant''s document (P0002)');
SELECT tests.throws_like(format($q$SELECT public.crew_document_renew(%L, '{"expiry_date": "2031-01-01", "reason": 5}'::jsonb)$q$, pg_temp.doc_id('stew_eng1')), '22023', 'field_invalid',
  'renew: a reason that is not text');
SELECT tests.throws_like(format($q$SELECT public.crew_document_renew(%L, jsonb_build_object('expiry_date', (current_date + 800)::text, 'issue_date', (current_date + 10)::text))$q$, pg_temp.doc_id('stew_eng1')),
  '22023', 'field_invalid', 'renew: the save''s field rules apply (an issue date in the future is refused)');
SELECT tests.is((SELECT count(*) FROM public.crew_document_versions WHERE crew_document_id = pg_temp.doc_id('stew_eng1')), 0::bigint, 'renew: a refused renewal keeps no version');

SELECT tests.reset_role();
UPDATE public.crew_certificates SET file_url = 'legacy/eng1.pdf', alerts_muted = true, muted_at = now(), muted_reason = 'Renewal booked'
WHERE id = pg_temp.doc_id('stew_eng1');
-- (the legacy file reference is a material change, so the conditional approval is set again)
UPDATE public.crew_certificates SET verification_status = 'conditionally_approved', verified_by = tests.user_id('A.purser'), verified_at = now(),
       verification_note = 'Valid with corrective lenses. Until 1 Mar 2027.'
WHERE id = pg_temp.doc_id('stew_eng1');
SELECT tests.as_user(tests.user_id('A.chief_stew'));
SELECT tests.lives(
  format($q$INSERT INTO rpc_out SELECT 'renew1', to_jsonb(x)
            FROM public.crew_document_renew(%L, jsonb_build_object('number', 'M-NEW', 'issue_date', (current_date - 1)::text, 'expiry_date', (current_date + 800)::text, 'reason', 'Renewed at the clinic')) AS x$q$,
         pg_temp.doc_id('stew_eng1')),
  'renew: the interior HoD renews the stew''s medical certificate');
SELECT tests.results_eq(
  $q$SELECT r ->> 'certificate_number', (r ->> 'issue_date')::date, (r ->> 'expiry_date')::date, r ->> 'file_path', r ->> 'file_url', r ->> 'verification_status', r ->> 'verified_by', (r ->> 'alerts_muted')::boolean
     FROM rpc_out WHERE k = 'renew1'$q$,
  $q$VALUES ('M-NEW'::text, current_date - 1, current_date + 800, NULL::text, NULL::text, 'unverified'::text, NULL::text, false)$q$,
  'renew: the new values, the old file gone, verification reset, alerts back on');
SELECT tests.results_eq(
  format($q$SELECT version_no, number, issue_date, expiry_date, file_path IS NOT NULL, file_url, verification_status, verification_note, reason, replaced_by, profile_id, company_id
            FROM public.crew_document_versions WHERE crew_document_id = %L$q$, pg_temp.doc_id('stew_eng1')),
  format($q$VALUES (1, 'N-stew_eng1'::text, current_date - 400, current_date + 400, true, 'legacy/eng1.pdf'::text, 'conditionally_approved'::text,
                    'Valid with corrective lenses. Until 1 Mar 2027.'::text, 'Renewed at the clinic'::text, %L::uuid, %L::uuid, %L::uuid)$q$,
         tests.user_id('A.chief_stew'), tests.profile_id('A.stew'), tests.company_id('A')),
  'renew: version 1 keeps the old number, dates, file, verification and the reason, with who replaced it');
SELECT tests.throws_like(
  format($q$SELECT public.crew_document_renew(%L, jsonb_build_object('number', 'M-NEW', 'issue_date', (current_date - 1)::text, 'expiry_date', (current_date + 800)::text))$q$, pg_temp.doc_id('stew_eng1')),
  '22023', 'renewal_unchanged', 'renew: nothing material changed (22023 renewal_unchanged)');
SELECT tests.is((SELECT certificate_number FROM public.crew_document_renew(pg_temp.doc_id('stew_eng1'), jsonb_build_object('no_expiry', true, 'number', 'M-LIFE'))), 'M-LIFE',
  'renew: again, with no expiry');
SELECT tests.reset_role();
SELECT tests.results_eq(format('SELECT version_no, number, reason FROM public.crew_document_versions WHERE crew_document_id = %L ORDER BY version_no', pg_temp.doc_id('stew_eng1')),
  $q$VALUES (1, 'N-stew_eng1'::text, 'Renewed at the clinic'::text), (2, 'M-NEW'::text, 'Renewed'::text)$q$,
  'renew: versions are numbered per document; a refused renewal took no number');
SELECT tests.results_eq(format('SELECT expiry_date, no_expiry, issuing_country_code FROM public.crew_certificates WHERE id = %L', pg_temp.doc_id('stew_eng1')),
  $q$VALUES (NULL::date, true, 'GB'::text)$q$, 'renew: the tick clears the date; the issuing country stays');
SELECT tests.ok(EXISTS (SELECT 1 FROM public.notification_outbox WHERE type_key = 'crew_document_review_needed'
                        AND dedupe_key = format('crew_document_review_needed:%s:%s:%s', tests.profile_id('A.stew'), tests.vessel_id('A.dra'), to_char(current_date, 'YYYY-MM-DD'))),
  'renew: a renewal leaves the document unverified for the verifiers (deduped with today''s notice)');

-- Versions read with the document's visibility.
SELECT tests.as_user(tests.user_id('A.stew'));
SELECT tests.is((SELECT count(*) FROM public.crew_document_versions), 2::bigint, 'versions: the person reads their own');
SELECT tests.throws(format($q$INSERT INTO public.crew_document_versions (crew_document_id, version_no) VALUES (%L, 9)$q$, pg_temp.doc_id('stew_eng1')), '42501',
  'versions: no browser writes (no grant)');
SELECT tests.as_user(tests.user_id('A.viewer'));
SELECT tests.is((SELECT count(*) FROM public.crew_document_versions WHERE profile_id = tests.profile_id('A.stew')), 2::bigint, 'versions: a reader of the person''s documents on the vessel');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is_empty('SELECT 1 FROM public.crew_document_versions', 'versions: crew of another vessel read none');
SELECT tests.as_user(tests.user_id('A.deckhand'));
SELECT tests.is_empty('SELECT 1 FROM public.crew_document_versions', 'versions: another crew member without the capabilities reads none');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is_empty('SELECT 1 FROM public.crew_document_versions', 'versions: another tenant reads none');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is_empty('SELECT 1 FROM public.crew_document_versions', 'versions: an inactive user reads none');
SELECT tests.as_anon();
SELECT tests.denied('SELECT * FROM public.crew_document_versions', 'versions: anon reads none');
SELECT tests.reset_role();
UPDATE public.crew_certificates SET deleted_at = now() WHERE id = pg_temp.doc_id('stew_eng1');
SELECT tests.as_user(tests.user_id('A.stew'));
SELECT tests.is_empty('SELECT 1 FROM public.crew_document_versions', 'versions: the versions of a removed document are hidden with it');
SELECT tests.reset_role();
UPDATE public.crew_certificates SET deleted_at = NULL WHERE id = pg_temp.doc_id('stew_eng1');
SELECT tests.throws_like(format($q$INSERT INTO public.crew_document_versions (crew_document_id, version_no, company_id) VALUES (%L, 9, %L)$q$, pg_temp.doc_id('stew_eng1'), tests.company_id('B')),
  '23514', 'crew_document_version_scope_mismatch', 'versions: a version belongs to its document''s company (any writer)');
SELECT tests.throws_like(format($q$UPDATE public.crew_document_versions SET version_no = 7 WHERE crew_document_id = %L AND version_no = 1$q$, pg_temp.doc_id('stew_eng1')),
  '23514', 'crew_document_version_locked', 'versions: a version keeps its number');

-- TR9 renewals version through the capture.
SELECT pg_temp.doc('stew_pst', 'A.stew', 'stcw_pst', current_date + 100);
UPDATE public.crew_certificates SET verification_status = 'verified', verified_at = now(), alerts_muted = true, muted_at = now(), muted_reason = 'Course booked'
WHERE id = pg_temp.doc_id('stew_pst');
SELECT tests.is(public.crew_document_record_from_source(tests.profile_id('A.stew'), pg_temp.ty('stcw_pst'), current_date, current_date + 1800, 'training', tests.id('x15ref:1')),
  pg_temp.doc_id('stew_pst'), 'TR9: a later completion renews the person''s document');
SELECT tests.results_eq(
  format($q$SELECT expiry_date, certificate_number, verification_status, alerts_muted, details ? 'replaced' FROM public.crew_certificates WHERE id = %L$q$, pg_temp.doc_id('stew_pst')),
  $q$VALUES (current_date + 1800, NULL::text, 'unverified'::text, false, false)$q$,
  'TR9: new dates, no number, verification reset, alerts back on, nothing in details.replaced');
SELECT tests.results_eq(format('SELECT version_no, number, expiry_date, verification_status, reason FROM public.crew_document_versions WHERE crew_document_id = %L', pg_temp.doc_id('stew_pst')),
  $q$VALUES (1, 'N-stew_pst'::text, current_date + 100, 'verified'::text, 'Renewed from training'::text)$q$,
  'TR9: the replaced values are version 1 (060400 edited in place)');
SAVEPOINT tr9_fallback;
ALTER FUNCTION public.crew_document_version_capture(uuid, text, uuid) RENAME TO crew_document_version_capture_off;
SELECT tests.lives(format($q$SELECT public.crew_document_record_from_source(%L, %L, current_date, current_date + 2000, 'training', %L)$q$,
                          tests.profile_id('A.stew'), pg_temp.ty('stcw_pst'), tests.id('x15ref:2')),
  'TR9: before 060500 is applied the renewal still works');
SELECT tests.results_eq(format($q$SELECT details -> 'replaced' ->> 'expiry_date', (SELECT count(*) FROM public.crew_document_versions WHERE crew_document_id = %1$L)
                                  FROM public.crew_certificates WHERE id = %1$L$q$, pg_temp.doc_id('stew_pst')),
  $q$VALUES ((current_date + 1800)::text, 1::bigint)$q$, 'TR9: and keeps the replaced values in details.replaced, as before');
ROLLBACK TO SAVEPOINT tr9_fallback;

-- ------------------------------------------------------------ 9. the expiry sweep

SELECT pg_temp.doc('stew_visa_window', 'A.stew', 'passport', current_date + 270, 'FR');  -- passport window 270: entry
SELECT pg_temp.doc('stew_efa_d30', 'A.stew', 'stcw_efa', current_date + 30);
SELECT pg_temp.doc('deck_pst_d7', 'A.deckhand', 'stcw_pst', current_date + 7);
SELECT pg_temp.doc('deck_visa_today', 'A.deckhand', 'visa_uk', current_date);
SELECT pg_temp.doc('deck_us_late', 'A.deckhand', 'visa_us_crew', current_date - 3);                   -- catch-up
SELECT pg_temp.doc('deck_esta_old', 'A.deckhand', 'visa_us_esta', current_date - 30);                 -- too long ago
SELECT pg_temp.doc('deck_bst_far', 'A.deckhand', 'stcw_basic_safety', current_date + 200);            -- outside the window
SELECT pg_temp.doc('deck_food_next', 'A.deckhand', 'food_hygiene_level_2', current_date + 31);        -- window today, d30 tomorrow
SELECT pg_temp.doc('stew_efa_old', 'A.stew', 'stcw_efa', current_date + 5, 'FR');                     -- (another country: its own item)
SELECT pg_temp.doc('chief_muted', 'A.chief_stew', 'stcw_pst', current_date + 7);
UPDATE public.crew_certificates SET alerts_muted = true, muted_at = now(), muted_reason = 'Course booked' WHERE id = pg_temp.doc_id('chief_muted');
SELECT pg_temp.doc('gone_pst', 'A.gone', 'stcw_pst', current_date + 7);
SELECT pg_temp.doc('stew_pp_old', 'A.stew', 'visa_schengen', current_date + 7);                       -- replaced by a newer one
SELECT pg_temp.doc('stew_pp_new', 'A.stew', 'visa_schengen', current_date + 700);

-- A missing type: every digest fails, nothing is recorded, nothing rolls back.
SAVEPOINT sweep_missing;
DELETE FROM public.notification_types WHERE key = 'crew_document_expiring';
SELECT tests.as_service();
SELECT tests.ok((public.crew_document_expiry_sweep() ->> 'failed')::integer > 0, 'sweep: a missing type counts its digests as failed (no exception)');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.crew_document_expiry_notices), 0::bigint, 'sweep: and records nothing, so the next run tries again');
ROLLBACK TO SAVEPOINT sweep_missing;

SELECT tests.as_service();
CREATE TEMP TABLE sweep_run (k text PRIMARY KEY, answer jsonb) ON COMMIT DROP;
GRANT ALL ON sweep_run TO service_role;
INSERT INTO sweep_run SELECT 'first', public.crew_document_expiry_sweep();
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT (answer ->> 'due')::int, (answer ->> 'muted')::int, (answer ->> 'ended')::int, (answer ->> 'failed')::int, (answer ->> 'already_sent')::int FROM sweep_run WHERE k = 'first'$q$,
  $q$VALUES (7, 1, 1, 0, 0)$q$, 'sweep: 7 documents due today, 1 muted and 1 of an ended assignment skipped, no failure');
SELECT tests.results_eq(
  $q$SELECT d.k, n.stage FROM public.crew_document_expiry_notices AS n
     JOIN (SELECT k, pg_temp.doc_id(k) AS id FROM unnest(ARRAY['stew_visa_window', 'stew_efa_d30', 'deck_pst_d7', 'deck_visa_today', 'deck_us_late', 'stew_efa_old', 'deck_food_next']) AS k) AS d ON d.id = n.crew_document_id
     WHERE n.recipient_user_id = tests.user_id('A.master_dra')$q$,
  $q$VALUES ('stew_visa_window', 'window'), ('stew_efa_d30', 'd30'), ('deck_pst_d7', 'd7'), ('deck_visa_today', 'expiry_day'), ('deck_us_late', 'expiry_day'),
            ('stew_efa_old', 'd7'), ('deck_food_next', 'window')$q$,
  'sweep: the stages (window entry, 30 days, 7 days, the expiry day and its catch-up); none for a document outside the window, long expired, muted, of an ended assignment or replaced');
SELECT tests.results_eq(
  $q$SELECT link_scope, link_path, vessel_id, must_act_user_ids, severity FROM public.notification_outbox
     WHERE type_key = 'crew_document_expiring' AND dedupe_key = format('crew_document_expiring:me:%s:%s', tests.user_id('A.stew'), to_char(current_date, 'YYYY-MM-DD'))$q$,
  format($q$VALUES ('personal'::text, 'documents'::text, NULL::uuid, ARRAY[%L::uuid], 'warning'::text)$q$, tests.user_id('A.stew')),
  'sweep: the crew member''s digest links to their own documents');
SELECT tests.results_eq(
  $q$SELECT jsonb_array_length(payload -> 'documents'), title FROM public.notification_outbox
     WHERE type_key = 'crew_document_expiring' AND dedupe_key = format('crew_document_expiring:me:%s:%s', tests.user_id('A.stew'), to_char(current_date, 'YYYY-MM-DD'))$q$,
  $q$VALUES (3, '3 of your documents need renewing'::text)$q$, 'sweep: one digest for all of the person''s documents due today');
SELECT tests.results_eq(
  $q$SELECT link_scope, link_path, vessel_id, severity, jsonb_array_length(payload -> 'documents') FROM public.notification_outbox
     WHERE type_key = 'crew_document_expiring' AND must_act_user_ids = ARRAY[tests.user_id('A.chief_officer')]$q$,
  format($q$VALUES ('vessel'::text, 'crew/compliance'::text, %L::uuid, 'critical'::text, 4)$q$, tests.vessel_id('A.dra')),
  'sweep: the deck HoD''s digest holds the deckhand''s four documents (an expired one makes it critical), linked to the vessel''s compliance page');
SELECT tests.results_eq(
  $q$SELECT jsonb_array_length(payload -> 'documents') FROM public.notification_outbox
     WHERE type_key = 'crew_document_expiring' AND must_act_user_ids = ARRAY[tests.user_id('A.chief_stew')]$q$,
  $q$VALUES (3)$q$, 'sweep: the interior HoD''s digest holds only the stew''s three (the department rule)');
SELECT tests.results_eq(
  $q$SELECT jsonb_array_length(payload -> 'documents') FROM public.notification_outbox
     WHERE type_key = 'crew_document_expiring' AND must_act_user_ids = ARRAY[tests.user_id('A.master_dra')]$q$,
  $q$VALUES (7)$q$, 'sweep: the Master''s digest holds every due document on the vessel');
SELECT tests.is_empty($q$SELECT 1 FROM public.notification_outbox WHERE type_key = 'crew_document_expiring'
                        AND (must_act_user_ids && ARRAY[tests.user_id('A.viewer'), tests.user_id('A.gone'), tests.user_id('A.hyd_hod'), tests.user_id('A.chief_stew')]
                             AND link_scope = 'personal')$q$,
  'sweep: no personal digest for a reader, an ended assignment, another vessel or a muted document''s owner');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE type_key = 'crew_document_expiring'
                 AND dedupe_key = format('crew_document_expiring:me:%s:%s', tests.user_id('A.deckhand'), to_char(current_date, 'YYYY-MM-DD'))), 1::bigint,
  'sweep: the deckhand gets their own digest');
SELECT tests.ok(EXISTS (SELECT 1 FROM public.notification_inbox WHERE type_key = 'crew_document_expiring' AND user_id = tests.user_id('A.stew'))
                AND EXISTS (SELECT 1 FROM public.notification_inbox WHERE type_key = 'crew_document_expiring' AND user_id = tests.user_id('A.chief_officer')),
  'sweep: the digests reach the inboxes');

SELECT tests.as_service();
INSERT INTO sweep_run SELECT 'again', public.crew_document_expiry_sweep();
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT (answer ->> 'digests')::int, (answer ->> 'notices')::int FROM sweep_run WHERE k = 'again'$q$,
  $q$VALUES (0, 0)$q$, 'sweep: a second run the same day sends nothing (each recipient once per stage)');

UPDATE public.crew_certificates SET alerts_muted = false, muted_at = NULL, muted_reason = NULL WHERE id = pg_temp.doc_id('chief_muted');
SELECT tests.as_service();
INSERT INTO sweep_run SELECT 'tomorrow', public.crew_document_expiry_sweep(current_date + 1);
SELECT tests.reset_role();
SELECT tests.results_eq(
  $q$SELECT d.k, n.stage FROM public.crew_document_expiry_notices AS n
     JOIN (SELECT k, pg_temp.doc_id(k) AS id FROM unnest(ARRAY['deck_food_next', 'chief_muted', 'deck_pst_d7']) AS k) AS d ON d.id = n.crew_document_id
     WHERE n.recipient_user_id = tests.user_id('A.master_dra') AND n.notified_on = current_date + 1$q$,
  $q$VALUES ('deck_food_next', 'd30'), ('chief_muted', 'd7')$q$,
  'sweep: the next day only what reached a new stage, and the document whose alerts came back on');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE type_key = 'crew_document_expiring'
                 AND dedupe_key LIKE format('crew_document_expiring:%%:%s:%s', tests.user_id('A.master_dra'), to_char(current_date + 1, 'YYYY-MM-DD'))), 1::bigint,
  'sweep: one digest per recipient and day');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE type_key = 'crew_document_expiring'
                 AND dedupe_key = format('crew_document_expiring:me:%s:%s', tests.user_id('A.chief_stew'), to_char(current_date + 1, 'YYYY-MM-DD'))), 1::bigint,
  'sweep: the HoD hears of their own document in their personal digest');

-- ------------------------------------------------------------ 10. emitters, grants

SELECT tests.ok(position('''crew_document_review_needed''' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.crew_certificates_review_notify()'::regprocedure)) > 0,
  'emitter: crew_certificates_review_notify emits crew_document_review_needed (D-238: live)');
SELECT tests.ok(position('''crew_document_decided''' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.crew_document_verify(uuid,text,text)'::regprocedure)) > 0,
  'emitter: crew_document_verify emits crew_document_decided (live)');
SELECT tests.ok(position('''crew_document_expiring''' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.crew_document_expiry_sweep(date)'::regprocedure)) > 0,
  'emitter: crew_document_expiry_sweep emits crew_document_expiring (live)');
SELECT tests.ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_crew_certificates_review_notify' AND tgrelid = 'public.crew_certificates'::regclass AND NOT tgisinternal),
  'the review notice trigger is on crew_certificates');

SELECT tests.ok(has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE'), 'grants: the browser calls ' || f)
FROM unnest(ARRAY['public.crew_document_review_rights(uuid)', 'public.crew_document_verify(uuid, text, text)', 'public.crew_document_mute(uuid, text)',
                  'public.crew_document_unmute(uuid)', 'public.crew_document_renew(uuid, jsonb)']) AS f;
SELECT tests.ok(NOT has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE')
                AND has_function_privilege('service_role', f, 'EXECUTE'), 'grants: service role only: ' || f)
FROM unnest(ARRAY['public.crew_document_expiry_sweep(date)', 'public.crew_document_verifiers(uuid)', 'public.crew_document_verifier_check(uuid, uuid)',
                  'public.crew_document_verifier_on(uuid, uuid, uuid)', 'public.crew_document_mute_check(uuid, uuid)', 'public.crew_member_role_on(uuid, uuid)',
                  'public.crew_document_version_capture(uuid, text, uuid)', 'public.crew_document_expiry_stage(integer, integer)',
                  'public.crew_document_expiry_phrase(integer)', 'public.crew_document_expiry_due(date)']) AS f;
SELECT tests.ok(NOT has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE')
                AND NOT has_function_privilege('service_role', f, 'EXECUTE'), 'grants: trigger function, no grant: ' || f)
FROM unnest(ARRAY['public.crew_certificates_review_notify()', 'public.crew_document_versions_scope_guard()', 'public.crew_document_expiry_notices_scope_guard()']) AS f;
SELECT tests.ok(has_table_privilege('authenticated', 'public.crew_document_versions', 'SELECT')
                AND NOT has_table_privilege('authenticated', 'public.crew_document_versions', 'INSERT')
                AND NOT has_table_privilege('authenticated', 'public.crew_document_versions', 'UPDATE')
                AND NOT has_table_privilege('authenticated', 'public.crew_document_versions', 'DELETE')
                AND NOT has_table_privilege('anon', 'public.crew_document_versions', 'SELECT'),
  'grants: versions are read-only for the browser and closed to anon');
SELECT tests.ok(NOT has_table_privilege('authenticated', 'public.crew_document_expiry_notices', 'SELECT')
                AND NOT has_table_privilege('anon', 'public.crew_document_expiry_notices', 'SELECT')
                AND has_table_privilege('service_role', 'public.crew_document_expiry_notices', 'INSERT'),
  'grants: the sweep''s bookkeeping is service only');
SELECT tests.ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.crew_document_versions'::regclass)
                AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.crew_document_expiry_notices'::regclass),
  'RLS is on for both new tables');
