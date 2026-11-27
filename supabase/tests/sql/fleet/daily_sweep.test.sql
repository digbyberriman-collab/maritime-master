-- The fleet daily sweep (20261124040800_fleet_daily_sweep.sql; gap/02 FD7
-- automatic reminders, X4, TR1 stale digest; D-128, D-162, D-232, D-238,
-- D-249). Two companies. Days are named from M, the Monday of the current
-- week (UTC); versions are published at fixed times before it, so every
-- due day is known whatever day the harness runs on. DRAAK's crew: the
-- Master, two deck crew, an engine crew member, a deck head of department,
-- one who acknowledges, a suspended login and a login-less placement;
-- HYDRA (Safety off) and company B's LEVIATHAN. Proves:
--   - each branch: due in three days (per document version x vessel, the
--     pending logins), became overdue (to the people, then the Master and
--     the covering HoD with the people they cover), the Monday documents
--     digest (overdue by vessel, to the documents editors) and the Monday
--     training digest (waiting more than 7 days at one stage, the legacy
--     fallback included, to the training admins);
--   - the boundaries: a version published today, a due day outside the
--     seven-day window, a due day of today, blocked people, acknowledged
--     people, drafts / approved / voided applications;
--   - Monday-only digests; a rerun the same day sends nothing new; the
--     next day only what became due since; once per version (the log);
--   - the 24-hour rule (any kind): held back inside 24 hours, not after;
--   - a missing notification type is skipped and counted, never raised;
--   - module-off vessels follow emit_notification_event (recorded, fanned
--     out to nobody); outbox rows link to the right scope; tenants never
--     see each other's notices; inactive users get nothing;
--   - the reminder log rows; grants (service role only), the signed-in and
--     out-of-range refusals, and the emitter names (D-238).

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ world

SELECT tests.seed_user('A', 'A.deck1', 'crew');
SELECT tests.seed_assignment('A.deck1', 'A.dra', true, 'Deckhand', '{"department": "Deck"}'::jsonb);
SELECT tests.seed_user('A', 'A.deck2', 'crew');
SELECT tests.seed_assignment('A.deck2', 'A.dra', true, 'Deckhand', '{"department": "Deck"}'::jsonb);
SELECT tests.seed_user('A', 'A.eng1', 'crew');
SELECT tests.seed_assignment('A.eng1', 'A.dra', true, 'Motorman', '{"department": "Engine"}'::jsonb);
SELECT tests.seed_user('A', 'A.hod_deck', 'crew');
SELECT tests.seed_assignment('A.hod_deck', 'A.dra', true, 'Bosun', '{"department": "Deck"}'::jsonb);
INSERT INTO public.user_roles (id, user_id, role, company_id, vessel_id, department, is_active)
VALUES (tests.id('ur:hod_deck'), tests.user_id('A.hod_deck'), 'hod', tests.company_id('A'), tests.vessel_id('A.dra'), 'Deck', true);
SELECT tests.seed_user('A', 'A.acked', 'crew');
SELECT tests.seed_assignment('A.acked', 'A.dra', true, 'Deckhand', '{"department": "Deck"}'::jsonb);
SELECT tests.seed_user('A', 'A.susp', 'crew', 'disabled');
SELECT tests.seed_assignment('A.susp', 'A.dra', true, 'Deckhand', '{"department": "Deck"}'::jsonb);
SELECT tests.seed_profile('A', 'A.nologin', 'crew', 'active', NULL,
  jsonb_build_object('imported_vessel_id', tests.vessel_id('A.dra'), 'is_imported', true, 'position', 'Stewardess', 'department', 'Interior', 'joining_date', current_date - 40));
-- A documents editor whose login is disabled (never a digest recipient).
SELECT tests.seed_user('A', 'A.ed_disabled', 'dpa', 'disabled');
-- Fleet training admin and viewer (RBAC, fleet reach).
SELECT tests.seed_user('A', 'A.trn_admin', 'crew');
SELECT tests.seed_user('A', 'A.trn_viewer', 'crew');
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'shore', vessel_scope = 'all', fleet_access = true, source = 'admin'
WHERE user_id IN (tests.user_id('A.trn_admin'), tests.user_id('A.trn_viewer'));
SELECT tests.seed_role('x509_training_admin', 'fleet');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'training', 'admin', 'fleet' FROM public.roles AS r WHERE r.name = 'x509_training_admin';
SELECT tests.seed_rbac_role('A.trn_admin', 'x509_training_admin');
SELECT tests.seed_role('x509_training_view', 'fleet');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'training', 'view', 'fleet' FROM public.roles AS r WHERE r.name = 'x509_training_view';
SELECT tests.seed_rbac_role('A.trn_viewer', 'x509_training_view');
-- Company B crew.
SELECT tests.seed_user('B', 'B.crew', 'crew');
SELECT tests.seed_assignment('B.crew', 'B.lev', true, 'Deckhand');
-- Safety is off on HYDRA (the vessel page lives under Safety).
INSERT INTO public.vessel_module_settings (vessel_id, company_id, module_key, enabled)
VALUES (tests.vessel_id('A.hyd'), tests.company_id('A'), 'safety', false);

SELECT tests.ok(public.record_is_master(tests.user_id('A.master_dra'), tests.vessel_id('A.dra')), 'setup: the DRAAK Master holds the office');
SELECT tests.ok(public.fleet_hod_covers(tests.user_id('A.hod_deck'), tests.vessel_id('A.dra'), 'Deck')
                AND NOT public.fleet_hod_covers(tests.user_id('A.hod_deck'), tests.vessel_id('A.dra'), 'Engine'), 'setup: the deck HoD covers Deck, not Engine');
SELECT tests.ok(public.fleet_ops_can_for(tests.user_id('A.fleet_manager'), tests.company_id('A'), NULL, 'documents', 'edit')
                AND NOT public.fleet_ops_can_for(tests.user_id('A.ed_disabled'), tests.company_id('A'), NULL, 'documents', 'edit')
                AND NOT public.fleet_ops_can_for(tests.user_id('A.master_dra'), tests.company_id('A'), NULL, 'documents', 'edit'),
                'setup: the fleet manager edits documents; the disabled editor and the Master do not');
SELECT tests.ok(public.fleet_ops_can_for(tests.user_id('A.trn_admin'), tests.company_id('A'), NULL, 'training', 'admin')
                AND NOT public.fleet_ops_can_for(tests.user_id('A.trn_viewer'), tests.company_id('A'), NULL, 'training', 'admin'),
                'setup: the training admin administers training; the viewer does not');

CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
GRANT ALL ON ids TO PUBLIC;
CREATE FUNCTION pg_temp.id(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM ids WHERE k = p_key $$;
CREATE TEMP TABLE got (k text PRIMARY KEY, v jsonb NOT NULL) ON COMMIT DROP;
GRANT ALL ON got TO PUBLIC;
-- M: the Monday of this week (UTC); M - 6 >= today - 12 keeps every publish time below in the past.
CREATE TEMP TABLE anchor ON COMMIT DROP AS SELECT date_trunc('week', (now() AT TIME ZONE 'UTC')::date)::date AS m;
GRANT ALL ON anchor TO PUBLIC;
CREATE FUNCTION pg_temp.m(p_offset integer DEFAULT 0) RETURNS date LANGUAGE sql STABLE AS $$ SELECT m + p_offset FROM anchor $$;
CREATE FUNCTION pg_temp.at(p_offset integer, p_hour integer DEFAULT 10) RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT ((m + p_offset)::timestamp + make_interval(hours => p_hour)) AT TIME ZONE 'UTC' FROM anchor $$;
CREATE FUNCTION pg_temp.users(VARIADIC p_keys text[]) RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT array_agg(tests.user_id(k) ORDER BY tests.user_id(k)) FROM unnest(p_keys) AS k $$;
CREATE FUNCTION pg_temp.profiles(VARIADIC p_keys text[]) RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT array_agg(tests.profile_id(k) ORDER BY tests.profile_id(k)) FROM unnest(p_keys) AS k $$;
CREATE FUNCTION pg_temp.sorted(p uuid[]) RETURNS uuid[] LANGUAGE sql IMMUTABLE AS $$ SELECT array_agg(x ORDER BY x) FROM unnest(p) AS x $$;
CREATE FUNCTION pg_temp.ver(p_doc uuid) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_version_id FROM public.fleet_documents WHERE id = p_doc $$;
-- Profile keys, to read rows by person.
CREATE TEMP TABLE who (k text PRIMARY KEY, pid uuid NOT NULL) ON COMMIT DROP;
GRANT ALL ON who TO PUBLIC;
INSERT INTO who SELECT k, tests.profile_id(k) FROM unnest(ARRAY['A.master_dra', 'A.deck1', 'A.deck2', 'A.eng1', 'A.hod_deck', 'A.acked', 'A.susp',
  'A.nologin', 'A.crew_hyd', 'A.fleet_manager', 'B.crew']) AS k;
CREATE FUNCTION pg_temp.who(p uuid) RETURNS text LANGUAGE sql STABLE AS $$ SELECT k FROM who WHERE pid = p $$;
CREATE FUNCTION pg_temp.code(p_vessel text) RETURNS text LANGUAGE sql STABLE AS $$ SELECT code FROM public.vessels WHERE id = tests.vessel_id(p_vessel) $$;
-- The sweep's notification types.
CREATE FUNCTION pg_temp.sweep_types() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['fleet_document_ack_due_soon', 'fleet_document_ack_overdue', 'fleet_document_ack_digest', 'training_applications_stale'] $$;
CREATE FUNCTION pg_temp.outbox_count() RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT count(*) FROM public.notification_outbox WHERE type_key = ANY (pg_temp.sweep_types()) $$;
CREATE FUNCTION pg_temp.log_count() RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT count(*) FROM public.fleet_document_reminders WHERE kind IN ('due_soon', 'overdue', 'digest') $$;
-- Runs the sweep for the day as the service (hr-daily-sweeper) and keeps the answer under p_key.
CREATE FUNCTION pg_temp.sweep(p_key text, p_day date) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v jsonb;
BEGIN
  PERFORM tests.as_service();
  v := public.fleet_ops_daily_sweep(p_day);
  PERFORM tests.reset_role();
  INSERT INTO got VALUES (p_key, v) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
  RETURN v;
END;
$$;

-- A records file stored for the document, a version of it published as the user, then dated to p_at.
CREATE FUNCTION pg_temp.publish(p_company text, p_user text, p_doc uuid, p_key text, p_at timestamptz) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_file uuid;
  v_ver uuid;
BEGIN
  PERFORM tests.reset_role();
  INSERT INTO public.file_objects (id, company_id, vessel_id, bucket, storage_path, module_key, entity_type, entity_id, original_name, mime_type, size_bytes)
  VALUES (tests.id('file:' || p_key), tests.company_id(p_company), NULL, 'records',
          tests.company_id(p_company)::text || '/fleet/documents/fleet_document/' || p_doc::text || '/' || tests.id('obj:' || p_key)::text || '-' || p_key || '.pdf',
          'documents', 'fleet_document', p_doc, p_key || '.pdf', 'application/pdf', 2048)
  RETURNING id INTO v_file;
  PERFORM tests.as_user(tests.user_id(p_user));
  v_ver := (public.fleet_document_add_version(p_doc, v_file)).id;
  PERFORM public.fleet_document_publish(p_doc, v_ver, (SELECT updated_at FROM public.fleet_documents WHERE id = p_doc));
  PERFORM tests.reset_role();
  PERFORM set_config('storm.fleet_tx', 'on', true);
  UPDATE public.fleet_document_versions SET published_at = p_at WHERE id = v_ver;
  PERFORM set_config('storm.fleet_tx', '', true);
  RETURN v_ver;
END;
$$;

-- A training application in a status, written as the definers leave it, waiting since p_stage_at.
CREATE FUNCTION pg_temp.app(p_key text, p_status text, p_stage_at timestamptz, p_applicant text DEFAULT 'A.deck1',
                            p_vessel text DEFAULT 'A.dra', p_company text DEFAULT 'A') RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM set_config('storm.fleet_tx', 'on', true);
  INSERT INTO public.development_applications (company_id, crew_member_id, vessel_id, course_name, course_provider, category, status,
                                               submitted_at, stage_entered_at, course_start_date, course_end_date)
  VALUES (tests.company_id(p_company), tests.user_id(p_applicant), tests.vessel_id(p_vessel), 'Course ' || p_key, 'Sea School',
          'professional', p_status, CASE WHEN p_status <> 'draft' THEN p_stage_at END, p_stage_at, current_date + 20, current_date + 25)
  RETURNING id INTO v_id;
  PERFORM set_config('storm.fleet_tx', '', true);
  INSERT INTO ids VALUES ('app:' || p_key, v_id);
  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------ the copy helpers (pure)

SELECT tests.is(public.fleet_ops_sweep_fit('Mooring notice', 120), 'Mooring notice', 'fit: a short text is kept');
SELECT tests.ok((SELECT length(x) = 120 AND right(x, 1) = '…' FROM (SELECT public.fleet_ops_sweep_fit(repeat('Procedure ', 20), 120) AS x) AS t),
                'fit: a long text is cut to the length with an ellipsis');
SELECT tests.is(public.fleet_ops_sweep_list('Not acknowledged yet: ', '["Crew A", "Crew B"]'::jsonb, ', ', 2, ' and %s more', '. Open it.'),
                'Not acknowledged yet: Crew A, Crew B. Open it.', 'list: every item when they fit');
SELECT tests.is(public.fleet_ops_sweep_list('Not acknowledged yet: ', '["Crew A", "Crew B", "Crew C"]'::jsonb, ', ', 5, ' and %s more', '. Open it.'),
                'Not acknowledged yet: Crew A, Crew B, Crew C and 2 more. Open it.', 'list: "and n more" for the ones not named');
SELECT tests.ok((SELECT length(x) <= 280 AND x = 'Longest waiting: ' || repeat('a', 100) || '; ' || repeat('b', 100) || '; and 1 more. Open Training to follow them up.'
                 FROM (SELECT public.fleet_ops_sweep_list('Longest waiting: ', jsonb_build_array(repeat('a', 100), repeat('b', 100), repeat('c', 100)), '; ', 3,
                                                          '; and %s more', '. Open Training to follow them up.') AS x) AS t),
                'list: long items: fewer named so the body stays within 280 characters and the closing sentence survives');
SELECT tests.ok((SELECT length(x) = 280 AND right(x, 1) = '…'
                 FROM (SELECT public.fleet_ops_sweep_list('Longest waiting: ', jsonb_build_array(repeat('z', 400)), '; ', 1, '; and %s more', '.') AS x) AS t),
                'list: even one item too long: cut to 280 with an ellipsis (the outbox CHECK is never broken)');

-- ------------------------------------------------------------ documents (company A as the fleet manager, B as its admin)

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
INSERT INTO ids SELECT 'sec', (public.fleet_document_section_save(NULL, 'Safety management')).id;
INSERT INTO ids SELECT 'type:policy', (public.fleet_document_type_save(NULL, pg_temp.id('sec'), 'Policy')).id;
INSERT INTO ids SELECT 'type:short', (public.fleet_document_type_save(NULL, pg_temp.id('sec'), 'Short notice', true, 3)).id;
INSERT INTO ids SELECT 'doc:soon', (public.fleet_document_create(pg_temp.id('type:policy'), 'Bridge watchkeeping procedure')).id;
INSERT INTO ids SELECT 'doc:over', (public.fleet_document_create(pg_temp.id('type:policy'), 'Drug and alcohol policy')).id;
INSERT INTO ids SELECT 'doc:old', (public.fleet_document_create(pg_temp.id('type:policy'), 'Garbage management plan')).id;
INSERT INTO ids SELECT 'doc:tue', (public.fleet_document_create(pg_temp.id('type:policy'), 'Bunkering procedure')).id;
INSERT INTO ids SELECT 'doc:today', (public.fleet_document_create(pg_temp.id('type:short'), 'Mooring notice')).id;
SELECT public.fleet_document_set_targets(pg_temp.id('doc:soon'), 'selected', ARRAY[tests.vessel_id('A.dra')]);
SELECT public.fleet_document_set_targets(pg_temp.id('doc:over'), 'selected', ARRAY[tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')]);
SELECT public.fleet_document_set_targets(pg_temp.id('doc:old'), 'selected', ARRAY[tests.vessel_id('A.dra')]);
SELECT public.fleet_document_set_targets(pg_temp.id('doc:tue'), 'selected', ARRAY[tests.vessel_id('A.dra')]);
SELECT public.fleet_document_set_targets(pg_temp.id('doc:today'), 'selected', ARRAY[tests.vessel_id('A.dra')]);
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('B.admin'));
INSERT INTO ids SELECT 'sec:b', (public.fleet_document_section_save(NULL, 'Company policies')).id;
INSERT INTO ids SELECT 'type:b', (public.fleet_document_type_save(NULL, pg_temp.id('sec:b'), 'Policy')).id;
INSERT INTO ids SELECT 'doc:b', (public.fleet_document_create(pg_temp.id('type:b'), 'Company B policy')).id;
SELECT public.fleet_document_set_targets(pg_temp.id('doc:b'), 'selected', ARRAY[tests.vessel_id('B.lev')]);
SELECT tests.reset_role();

-- Due (14 days, 3 for the short notice): soon M+3, over M-1, old M-8, tue M (10:00 UTC), today M+3 but published today.
SELECT pg_temp.publish('A', 'A.fleet_manager', pg_temp.id('doc:soon'), 'soon', pg_temp.at(-11));
SELECT pg_temp.publish('A', 'A.fleet_manager', pg_temp.id('doc:over'), 'over', pg_temp.at(-15));
SELECT pg_temp.publish('A', 'A.fleet_manager', pg_temp.id('doc:old'), 'old', pg_temp.at(-22));
SELECT pg_temp.publish('A', 'A.fleet_manager', pg_temp.id('doc:tue'), 'tue', pg_temp.at(-14));
SELECT pg_temp.publish('A', 'A.fleet_manager', pg_temp.id('doc:today'), 'today', pg_temp.at(0, 1));
SELECT pg_temp.publish('B', 'B.admin', pg_temp.id('doc:b'), 'b', pg_temp.at(-15));
-- One crew member acknowledges the policy.
SELECT tests.as_user(tests.user_id('A.acked'));
SELECT public.fleet_document_acknowledge(pg_temp.ver(pg_temp.id('doc:over')), tests.vessel_id('A.dra'));
SELECT tests.reset_role();


SELECT tests.results_eq(
  format($q$SELECT pg_temp.who(x.profile_id), x.state FROM public.fleet_document_ack_rows(%L, %L, NULL, %L) AS x WHERE x.vessel_id = %L$q$,
         tests.company_id('A'), pg_temp.id('doc:over'), pg_temp.at(0, 0), tests.vessel_id('A.dra')),
  $q$VALUES ('A.master_dra', 'overdue'), ('A.deck1', 'overdue'), ('A.deck2', 'overdue'), ('A.eng1', 'overdue'), ('A.hod_deck', 'overdue'),
            ('A.acked', 'acknowledged'), ('A.susp', 'blocked'), ('A.nologin', 'blocked')$q$,
  'setup: the policy on DRAAK at the start of M, as the state core reads it');
SELECT tests.is((SELECT ((x.due_at AT TIME ZONE 'UTC')::date - pg_temp.m())
                 FROM public.fleet_document_ack_rows(tests.company_id('A'), pg_temp.id('doc:soon'), NULL, pg_temp.at(0, 0)) AS x
                 WHERE x.profile_id = tests.profile_id('A.deck1')), 3, 'setup: the watchkeeping procedure is due on M + 3');
SELECT tests.is(extract(isodow FROM pg_temp.m())::integer, 1, 'setup: M is a Monday');

-- Training applications (A on DRAAK, B on LEVIATHAN), waiting since the times given.
SELECT pg_temp.app('hod10', 'hod_review', pg_temp.at(-10, 0));
SELECT pg_temp.app('final9', 'captain_purser_review', pg_temp.at(-9, 0));
SELECT pg_temp.app('hod5', 'hod_review', pg_temp.at(-5, 0));
SELECT pg_temp.app('legacy12', 'submitted', pg_temp.at(-12, 0));
SELECT pg_temp.app('approved', 'approved', pg_temp.at(-30, 0));
SELECT pg_temp.app('voided', 'voided', pg_temp.at(-30, 0));
SELECT pg_temp.app('draft', 'draft', pg_temp.at(-30, 0));
SELECT pg_temp.app('b8', 'hod_review', pg_temp.at(-8, 0), 'B.crew', 'B.lev', 'B');
-- A row written before 20261124040600: no stage_entered_at, so the stale rule reads submitted_at.
DO $$
BEGIN
  PERFORM set_config('storm.fleet_tx', 'on', true);
  UPDATE public.development_applications SET stage_entered_at = NULL WHERE id = pg_temp.id('app:legacy12');
  PERFORM set_config('storm.fleet_tx', '', true);
END
$$;

-- ------------------------------------------------------------ a missing notification type is skipped, never raised (D-128)

SAVEPOINT missing_types;
DELETE FROM public.notification_types WHERE key = ANY (pg_temp.sweep_types());
SELECT tests.lives($q$SELECT pg_temp.sweep('missing', pg_temp.m())$q$, 'missing types: the sweep runs while its types are not seeded');
SELECT tests.is((SELECT v FROM got WHERE k = 'missing'),
                '{"documents_due_soon": 0, "documents_overdue": 0, "digests": 0, "training_stale": 0, "skipped": 10}'::jsonb,
                'missing types: nothing sent; each due notice counted as skipped (1 due soon, 5 overdue incl. 2 officer copies, 2 digests, 2 training)');
SELECT tests.is(pg_temp.outbox_count(), 0::bigint, 'missing types: no outbox row is claimed');
SELECT tests.is(pg_temp.log_count(), 0::bigint, 'missing types: nothing logged, so the next run sends them');
ROLLBACK TO SAVEPOINT missing_types;

-- ------------------------------------------------------------ the 24-hour rule: someone reminded within 24 hours is held back

SAVEPOINT held;
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT public.fleet_document_remind(pg_temp.id('doc:over'), tests.vessel_id('A.dra'), tests.profile_id('A.deck2'));
SELECT tests.reset_role();
SELECT pg_temp.sweep('held', pg_temp.m());
SELECT tests.is(pg_temp.sorted((SELECT o.must_act_user_ids FROM public.notification_outbox AS o
                                WHERE o.type_key = 'fleet_document_ack_overdue' AND o.record_id = pg_temp.id('doc:over') AND o.vessel_id = tests.vessel_id('A.dra')
                                  AND o.link_path LIKE '%?doc=%')),
                pg_temp.users('A.master_dra', 'A.deck1', 'A.eng1', 'A.hod_deck'),
                '24 h: the person reminded an hour ago is held back from the overdue notice');
SELECT tests.ok((SELECT recipient_profile_ids = pg_temp.profiles('A.master_dra', 'A.deck1', 'A.eng1', 'A.hod_deck') AND skipped_count = 1
                 FROM public.fleet_document_reminders WHERE kind = 'overdue' AND document_id = pg_temp.id('doc:over') AND vessel_id = tests.vessel_id('A.dra')),
                '24 h: the log names the people notified and counts the one held back');
SELECT tests.is((SELECT o.body FROM public.notification_outbox AS o
                 WHERE o.type_key = 'fleet_document_ack_overdue' AND o.record_id = pg_temp.id('doc:over') AND o.must_act_user_ids = ARRAY[tests.user_id('A.master_dra')]),
                'Not acknowledged yet: Crew A.deck1, Crew A.eng1, Crew A.hod_deck. Open the crew view in Safety, Fleet documents to remind them or record a witnessed acknowledgement.',
                '24 h: the Master is not told about the held person either (they come together with a later run)');
SELECT tests.ok(EXISTS (SELECT 1 FROM public.notification_outbox AS o
                        WHERE o.type_key = 'fleet_document_ack_due_soon' AND o.record_id = pg_temp.id('doc:soon')
                          AND tests.user_id('A.deck2') = ANY (o.must_act_user_ids)),
                '24 h: per document: the same person still gets the due-soon reminder of another document');
ROLLBACK TO SAVEPOINT held;

-- Once per version and vessel (the log), apart from the 24-hour rule: an overdue notice logged 25 hours ago
-- for the current version is not sent again; one logged before the version was published (an earlier
-- version) does not count.
SAVEPOINT logged_before;
DO $$
BEGIN
  PERFORM set_config('storm.fleet_tx', 'on', true);
  INSERT INTO public.fleet_document_reminders (company_id, document_id, vessel_id, kind, sent_at, recipient_count, skipped_count, recipient_profile_ids)
  VALUES (tests.company_id('B'), pg_temp.id('doc:b'), tests.vessel_id('B.lev'), 'overdue', now() - interval '25 hours', 1, 0, ARRAY[tests.profile_id('B.crew')]),
         (tests.company_id('A'), pg_temp.id('doc:over'), tests.vessel_id('A.hyd'), 'overdue', pg_temp.at(-16), 1, 0, ARRAY[tests.profile_id('A.crew_hyd')]);
  PERFORM set_config('storm.fleet_tx', '', true);
END
$$;
SELECT pg_temp.sweep('logged', pg_temp.m());
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE type_key = 'fleet_document_ack_overdue' AND record_id = pg_temp.id('doc:b')), 0::bigint,
                'once per version: an overdue notice logged 25 hours ago (outside the 24-hour rule) is not sent again');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE type_key = 'fleet_document_ack_overdue' AND record_id = pg_temp.id('doc:over')
                 AND vessel_id = tests.vessel_id('A.hyd')), 1::bigint,
                'once per version: one logged before the version was published (an earlier version) does not count');
ROLLBACK TO SAVEPOINT logged_before;

-- A manual reminder 25 hours ago no longer holds the person back.
DO $$
BEGIN
  PERFORM set_config('storm.fleet_tx', 'on', true);
  INSERT INTO public.fleet_document_reminders (company_id, document_id, vessel_id, profile_id, kind, sent_by, sent_at, recipient_count, skipped_count, recipient_profile_ids)
  VALUES (tests.company_id('A'), pg_temp.id('doc:over'), tests.vessel_id('A.dra'), tests.profile_id('A.deck2'), 'manual', tests.user_id('A.fleet_manager'),
          now() - interval '25 hours', 1, 0, ARRAY[tests.profile_id('A.deck2')]);
  PERFORM set_config('storm.fleet_tx', '', true);
END
$$;

-- ------------------------------------------------------------ Monday M

SELECT pg_temp.sweep('mon', pg_temp.m());
SELECT tests.is((SELECT v FROM got WHERE k = 'mon'),
                '{"documents_due_soon": 1, "documents_overdue": 5, "digests": 2, "training_stale": 2, "skipped": 0}'::jsonb,
                'Monday: 1 due soon, 5 overdue (DRAAK people + Master + HoD, HYDRA, B), 2 documents digests, 2 training digests');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE type_key = 'fleet_document_ack_due_soon'), (SELECT (v ->> 'documents_due_soon')::bigint FROM got WHERE k = 'mon'),
                'Monday: the due-soon count is the outbox rows written');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE type_key = 'fleet_document_ack_overdue'), 5::bigint, 'Monday: the overdue count is the outbox rows written');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE type_key = 'fleet_document_ack_digest'), 2::bigint, 'Monday: one documents digest per company');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE type_key = 'training_applications_stale'), 2::bigint, 'Monday: one training digest per company');

-- (1a) due in three days: the pending logins of DRAAK, never the blocked or the version published today
CREATE TEMP TABLE o_soon ON COMMIT DROP AS
  SELECT * FROM public.notification_outbox WHERE type_key = 'fleet_document_ack_due_soon' AND record_id = pg_temp.id('doc:soon');
SELECT tests.is((SELECT count(*) FROM o_soon), 1::bigint, 'due soon: one notice for the document version on DRAAK');
SELECT tests.is((SELECT pg_temp.sorted(must_act_user_ids) FROM o_soon),
                pg_temp.users('A.master_dra', 'A.deck1', 'A.deck2', 'A.eng1', 'A.hod_deck', 'A.acked'),
                'due soon: must-act = the pending people with a login (not the suspended login, not the placement without one)');
SELECT tests.ok((SELECT link_scope = 'vessel' AND link_vessel_code = pg_temp.code('A.dra') AND vessel_id = tests.vessel_id('A.dra')
                        AND link_path = 'safety/fleet-documents?doc=' || pg_temp.id('doc:soon')::text AND module_key = 'safety'
                        AND record_ref = 'v1' AND severity = 'info'
                        AND dedupe_key = format('fleet_document_ack_due_soon:%s:%s:%s', pg_temp.ver(pg_temp.id('doc:soon')), tests.vessel_id('A.dra'), to_char(pg_temp.m(), 'YYYY-MM-DD'))
                 FROM o_soon), 'due soon: links to the document on the vessel''s Fleet documents page (module safety), deduped per version, vessel and day');
SELECT tests.is((SELECT title || ' | ' || body FROM o_soon),
                'Acknowledgement due in three days: Bridge watchkeeping procedure | Due on ' || to_char(pg_temp.m(3), 'DD Mon YYYY') || '. Open it in Safety, Fleet documents, read it and acknowledge it.',
                'due soon: the copy names the document and the due day (in-app, no email)');
SELECT tests.is((SELECT count(*) FROM public.notification_inbox AS i JOIN o_soon ON o_soon.id = i.outbox_id), 6::bigint, 'due soon: fanned out to the six of them');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE type_key = 'fleet_document_ack_due_soon' AND record_id = pg_temp.id('doc:today')), 0::bigint,
                'due soon: a version published today (due on M + 3 too) gets no reminder on the day it was published');

-- (1b) overdue: the people, then their Master and their HoD; HYDRA (Safety off) recorded but fanned out to nobody
SELECT tests.is(pg_temp.sorted((SELECT o.must_act_user_ids FROM public.notification_outbox AS o
                                WHERE o.type_key = 'fleet_document_ack_overdue' AND o.record_id = pg_temp.id('doc:over') AND o.vessel_id = tests.vessel_id('A.dra')
                                  AND o.link_path LIKE '%?doc=%')),
                pg_temp.users('A.master_dra', 'A.deck1', 'A.deck2', 'A.eng1', 'A.hod_deck'),
                'overdue: to the overdue people (the acknowledged and the blocked are not)');
SELECT tests.ok((SELECT link_scope = 'vessel' AND link_vessel_code = pg_temp.code('A.dra') AND module_key = 'safety' AND severity = 'warning'
                        AND title = 'Acknowledgement overdue: Drug and alcohol policy'
                        AND link_path = 'safety/fleet-documents?doc=' || pg_temp.id('doc:over')::text
                 FROM public.notification_outbox WHERE type_key = 'fleet_document_ack_overdue' AND record_id = pg_temp.id('doc:over')
                   AND vessel_id = tests.vessel_id('A.dra') AND link_path LIKE '%?doc=%'), 'overdue: the person''s notice links to the document');
SELECT tests.results_eq(
  format($q$SELECT pg_temp.who(p.id), o.body, o.link_path, o.title FROM public.notification_outbox AS o
            JOIN public.profiles AS p ON p.user_id = o.must_act_user_ids[1]
            WHERE o.type_key = 'fleet_document_ack_overdue' AND o.record_id = %L AND o.vessel_id = %L AND o.link_path = 'safety/fleet-documents?view=crew'$q$,
         pg_temp.id('doc:over'), tests.vessel_id('A.dra')),
  $q$VALUES ('A.master_dra', 'Not acknowledged yet: Crew A.deck1, Crew A.deck2, Crew A.eng1 and 1 more. Open the crew view in Safety, Fleet documents to remind them or record a witnessed acknowledgement.',
             'safety/fleet-documents?view=crew', 'Crew acknowledgement overdue: Drug and alcohol policy'),
            ('A.hod_deck', 'Not acknowledged yet: Crew A.deck1, Crew A.deck2. Open the crew view in Safety, Fleet documents to remind them or record a witnessed acknowledgement.',
             'safety/fleet-documents?view=crew', 'Crew acknowledgement overdue: Drug and alcohol policy')$q$,
  'overdue: one copy per officer: the Master for everyone but himself, the deck HoD for the deck crew only, each on the crew view');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox AS o WHERE o.type_key = 'fleet_document_ack_overdue' AND o.link_path = 'safety/fleet-documents?view=crew'
                 AND cardinality(o.must_act_user_ids) <> 1), 0::bigint, 'overdue: each officer''s copy names one officer (names stay within what they may read)');
SELECT tests.ok((SELECT o.processed_at IS NOT NULL AND o.link_vessel_code = pg_temp.code('A.hyd') AND o.must_act_user_ids = ARRAY[tests.user_id('A.crew_hyd')]
                        AND NOT EXISTS (SELECT 1 FROM public.notification_inbox AS i WHERE i.outbox_id = o.id)
                 FROM public.notification_outbox AS o WHERE o.type_key = 'fleet_document_ack_overdue' AND o.vessel_id = tests.vessel_id('A.hyd')),
                'overdue: HYDRA has Safety off: the notice is recorded and reaches nobody (emit_notification_event''s rule)');
SELECT tests.is((SELECT count(*) FROM public.notification_inbox AS i JOIN public.notification_outbox AS o ON o.id = i.outbox_id
                 WHERE o.type_key = 'fleet_document_ack_overdue' AND o.vessel_id = tests.vessel_id('A.dra')), 7::bigint,
                'overdue: on DRAAK five people and two officers are told');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE type_key = 'fleet_document_ack_overdue' AND record_id IN (pg_temp.id('doc:old'), pg_temp.id('doc:tue'))), 0::bigint,
                'overdue: not for a due day before the seven-day window (M - 8), nor for one due today (M, not overdue at the start of the day)');
SELECT tests.ok((SELECT o.company_id = tests.company_id('B') AND o.must_act_user_ids = ARRAY[tests.user_id('B.crew')] AND o.link_vessel_code = pg_temp.code('B.lev')
                 FROM public.notification_outbox AS o WHERE o.type_key = 'fleet_document_ack_overdue' AND o.record_id = pg_temp.id('doc:b')),
                'overdue: company B''s policy notifies B''s crew on LEVIATHAN');

-- (1c) the Monday documents digest
SELECT tests.ok((SELECT o.link_scope = 'fleet' AND o.vessel_id IS NULL AND o.link_vessel_code IS NULL AND o.link_path = 'documents?tab=acknowledgements'
                        AND o.module_key IS NULL AND o.must_act_user_ids = ARRAY[tests.user_id('A.fleet_manager')]
                        AND o.title = '12 overdue acknowledgements on 2 vessels'
                        AND o.body = 'M/Y DRAAK 11, HYDRA 1. Open Documents, Acknowledgements to see who is overdue and remind them.'
                        AND o.dedupe_key = 'fleet_document_ack_digest:' || to_char(pg_temp.m(), 'YYYY-MM-DD')
                        AND (o.payload ->> 'overdue')::int = 12 AND jsonb_array_length(o.payload -> 'vessels') = 2
                        AND (o.payload -> 'vessels' -> 0 ->> 'vessel_code') = pg_temp.code('A.dra') AND (o.payload -> 'vessels' -> 0 ->> 'people')::int = 6
                 FROM public.notification_outbox AS o WHERE o.type_key = 'fleet_document_ack_digest' AND o.company_id = tests.company_id('A')),
                'digest: Fleet Documents, Acknowledgements, to the documents editors: overdue at the start of M by vessel (HYDRA counted although its Safety is off)');
SELECT tests.is((SELECT count(*) FROM public.notification_inbox AS i JOIN public.notification_outbox AS o ON o.id = i.outbox_id
                 WHERE o.type_key = 'fleet_document_ack_digest' AND i.user_id IN (tests.user_id('A.ed_disabled'), tests.user_id('A.master_dra'))), 0::bigint,
                'digest: never to a disabled editor or to a Master without the documents edit right');
SELECT tests.ok((SELECT o.must_act_user_ids = ARRAY[tests.user_id('B.admin')] AND o.title = '1 overdue acknowledgement on 1 vessel'
                 FROM public.notification_outbox AS o WHERE o.type_key = 'fleet_document_ack_digest' AND o.company_id = tests.company_id('B')),
                'digest: company B''s digest goes to B''s editor, about B''s vessel');

-- (2) the Monday training digest
SELECT tests.ok((SELECT o.link_scope = 'fleet' AND o.link_path = 'training/overview' AND o.vessel_id IS NULL
                        AND pg_temp.sorted(o.must_act_user_ids) = pg_temp.users('A.fleet_manager', 'A.trn_admin')
                        AND o.title = '3 training applications waiting more than 7 days'
                        AND (o.payload ->> 'stale')::int = 3
                        AND o.dedupe_key = 'training_applications_stale:' || to_char(pg_temp.m(), 'YYYY-MM-DD')
                 FROM public.notification_outbox AS o WHERE o.type_key = 'training_applications_stale' AND o.company_id = tests.company_id('A')),
                'training: Fleet Training overview, to the training admins (not the viewer): three waiting more than 7 days');
SELECT tests.is((SELECT array_agg(e ->> 'application_id' ORDER BY ord) FROM public.notification_outbox AS o,
                 jsonb_array_elements(o.payload -> 'applications') WITH ORDINALITY AS a(e, ord)
                 WHERE o.type_key = 'training_applications_stale' AND o.company_id = tests.company_id('A')),
                ARRAY[pg_temp.id('app:legacy12')::text, pg_temp.id('app:hod10')::text, pg_temp.id('app:final9')::text],
                'training: longest waiting first; the legacy row through submitted_at; not the one waiting 5 days, the approved, the voided or the draft');
SELECT tests.ok((SELECT o.body LIKE 'Longest waiting: % Course legacy12, 12 days with the head of department; % Course hod10, 10 days with the head of department; % Course final9, 9 days at the final approval. Open Training to follow them up.'
                 FROM public.notification_outbox AS o WHERE o.type_key = 'training_applications_stale' AND o.company_id = tests.company_id('A')),
                'training: the copy names the number, course, days and stage of the longest waiting');
SELECT tests.ok((SELECT o.must_act_user_ids = ARRAY[tests.user_id('B.admin')] AND (o.payload ->> 'stale')::int = 1
                 FROM public.notification_outbox AS o WHERE o.type_key = 'training_applications_stale' AND o.company_id = tests.company_id('B')),
                'training: company B''s digest is B''s own');
SELECT tests.is((SELECT count(*) FROM public.notification_inbox AS i JOIN public.notification_outbox AS o ON o.id = i.outbox_id
                 WHERE o.type_key = 'training_applications_stale' AND i.user_id = tests.user_id('A.trn_viewer')), 0::bigint, 'training: the viewer gets nothing');

-- tenants never see each other's notices
SELECT tests.is((SELECT count(*) FROM public.notification_inbox AS i JOIN public.profiles AS p ON p.user_id = i.user_id
                 WHERE i.type_key = ANY (pg_temp.sweep_types()) AND p.company_id IS DISTINCT FROM i.company_id), 0::bigint,
                'tenants: every inbox row goes to a member of its company');

-- the reminder log
SELECT tests.results_eq(
  $q$SELECT r.kind, (SELECT k FROM ids WHERE id = r.document_id), (SELECT name FROM public.vessels WHERE id = r.vessel_id), r.recipient_count, r.skipped_count, r.sent_by IS NULL
     FROM public.fleet_document_reminders AS r WHERE r.kind IN ('due_soon', 'overdue', 'digest')$q$,
  $q$VALUES ('due_soon', 'doc:soon', 'M/Y DRAAK', 6, 0, true), ('overdue', 'doc:over', 'M/Y DRAAK', 5, 0, true), ('overdue', 'doc:over', 'HYDRA', 1, 0, true),
            ('overdue', 'doc:b', 'LEVIATHAN', 1, 0, true), ('digest', 'doc:over', NULL, 0, 0, true), ('digest', 'doc:old', NULL, 0, 0, true),
            ('digest', 'doc:b', NULL, 0, 0, true)$q$,
  'log: one row per send (no sender: the sweep); a digest row per document it reports, naming no crew profile');
SELECT tests.ok((SELECT recipient_profile_ids = pg_temp.profiles('A.master_dra', 'A.deck1', 'A.deck2', 'A.eng1', 'A.hod_deck')
                 FROM public.fleet_document_reminders WHERE kind = 'overdue' AND document_id = pg_temp.id('doc:over') AND vessel_id = tests.vessel_id('A.dra')),
                'log: the overdue row names the people (the 25-hour-old manual reminder no longer held anyone back)');
-- The manual Remind dialogs read the sweep's rows: the people just told are held for 24 hours.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT public.fleet_document_remind(pg_temp.id('doc:over'), tests.vessel_id('A.dra')) AS remind_after \gset
SELECT tests.reset_role();
SELECT tests.ok((:'remind_after'::jsonb ->> 'sent')::int = 0 AND (:'remind_after'::jsonb ->> 'skipped')::int = 5,
                'log: a manual reminder right after the sweep skips the five people it just told (one reminder per 24 hours, any kind)');

-- ------------------------------------------------------------ a second run the same day sends nothing new

SELECT pg_temp.outbox_count() AS outbox_before, pg_temp.log_count() AS log_before \gset
SELECT pg_temp.sweep('mon_again', pg_temp.m());
SELECT tests.is((SELECT v FROM got WHERE k = 'mon_again'),
                '{"documents_due_soon": 0, "documents_overdue": 0, "digests": 0, "training_stale": 0, "skipped": 0}'::jsonb, 'rerun: nothing new');
SELECT tests.is(pg_temp.outbox_count(), :'outbox_before'::bigint, 'rerun: no outbox row added');
SELECT tests.is(pg_temp.log_count(), :'log_before'::bigint, 'rerun: no log row added');

-- ------------------------------------------------------------ Tuesday M + 1: what became overdue since; no digests

SELECT pg_temp.sweep('tue', pg_temp.m(1));
SELECT tests.is((SELECT v FROM got WHERE k = 'tue'),
                '{"documents_due_soon": 0, "documents_overdue": 3, "digests": 0, "training_stale": 0, "skipped": 0}'::jsonb,
                'Tuesday: only the procedure due on Monday (its people, the Master, the HoD); no digests on a Tuesday');
SELECT tests.is(pg_temp.sorted((SELECT o.must_act_user_ids FROM public.notification_outbox AS o
                                WHERE o.type_key = 'fleet_document_ack_overdue' AND o.record_id = pg_temp.id('doc:tue') AND o.link_path LIKE '%?doc=%')),
                pg_temp.users('A.master_dra', 'A.deck1', 'A.deck2', 'A.eng1', 'A.hod_deck', 'A.acked'),
                'Tuesday: the procedure''s overdue people');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE type_key = 'fleet_document_ack_overdue' AND record_id IN (pg_temp.id('doc:over'), pg_temp.id('doc:b'))),
                5::bigint, 'Tuesday: the policy''s overdue notices are not sent again (once per version and vessel, from the log)');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE type_key IN ('fleet_document_ack_digest', 'training_applications_stale')), 4::bigint,
                'Tuesday: the digests are Monday''s only');

-- ------------------------------------------------------------ grants and refusals

SELECT tests.ok((SELECT bool_and(NOT has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE')
                                 AND has_function_privilege('service_role', f, 'EXECUTE'))
                 FROM unnest(ARRAY['public.fleet_ops_daily_sweep(date)', 'public.fleet_ops_sweep_fit(text,integer)',
                                   'public.fleet_ops_sweep_list(text,jsonb,text,integer,text,text)']::regprocedure[]) AS f),
                'grants: EXECUTE for the service role only (the sweep and its copy helpers)');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws($q$SELECT public.fleet_ops_daily_sweep()$q$, '42501', 'grants: a signed-in user cannot run the sweep');
SELECT tests.reset_role();
SELECT tests.as_anon();
SELECT tests.throws($q$SELECT public.fleet_ops_daily_sweep()$q$, '42501', 'grants: anon cannot run the sweep');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.fleet_manager'), '{"role": "service_role"}'::jsonb);
SELECT tests.throws_like($q$SELECT public.fleet_ops_daily_sweep()$q$, '42501', 'sweep_service_only', 'refusal: a service call carrying a user''s identity is refused');
SELECT tests.reset_role();
SELECT tests.as_service();
SELECT tests.throws_like(format($q$SELECT public.fleet_ops_daily_sweep(%L::date)$q$, (now() AT TIME ZONE 'UTC')::date + 30), '22023', 'sweep_day_out_of_range',
                         'refusal: a day more than 7 days from today');
SELECT tests.reset_role();
SAVEPOINT default_day;
SELECT tests.as_service();
SELECT tests.lives($q$SELECT public.fleet_ops_daily_sweep()$q$, 'default: the sweeper''s call with no argument runs for today');
SELECT tests.reset_role();
ROLLBACK TO SAVEPOINT default_day;
SELECT tests.ok((SELECT p.prosecdef AND 'search_path=public' = ANY (p.proconfig) FROM pg_proc AS p WHERE p.oid = 'public.fleet_ops_daily_sweep(date)'::regprocedure),
                'grants: SECURITY DEFINER with search_path set');
SELECT tests.ok(obj_description('public.fleet_ops_daily_sweep(date)'::regprocedure, 'pg_proc') LIKE 'The fleet daily sweep%', 'grants: commented');

-- D-238: the types documents/module.ts and development/module.ts declare live are emitted here, every emit guarded.
SELECT tests.ok((SELECT bool_and(position('''' || t || '''' IN p.prosrc) > 0)
                 FROM unnest(pg_temp.sweep_types()) AS t, pg_proc AS p WHERE p.oid = 'public.fleet_ops_daily_sweep(date)'::regprocedure),
                'emitters: fleet_ops_daily_sweep emits fleet_document_ack_due_soon, _overdue, _digest and training_applications_stale');
SELECT tests.ok((SELECT (length(p.prosrc) - length(replace(p.prosrc, 'EXCEPTION WHEN others', ''))) / length('EXCEPTION WHEN others') = 5
                        AND (length(p.prosrc) - length(replace(p.prosrc, 'public.emit_notification_event(', ''))) / length('public.emit_notification_event(') = 5
                 FROM pg_proc AS p WHERE p.oid = 'public.fleet_ops_daily_sweep(date)'::regprocedure),
                'emitters: each of the five emits sits in its own exception block (D-128)');
