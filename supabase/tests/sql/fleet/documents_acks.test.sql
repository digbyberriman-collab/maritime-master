-- Fleet document acknowledgements (20261124040400_fleet_documents_acknowledgements.sql;
-- gap/02 FD6, FD7, FD8, FD9, X4, W1; D-X5-04, D-128, D-238, D-249). Two
-- companies; DRAAK's crew: the Master, a deck and an engine crew member, a
-- suspended login, a planned joiner, a deck head of department, a crew
-- member who later leaves and a login-less placement; HYDRA and GAME
-- CHANGER crew; company B. Proves:
--   - the state rule's table (copied between the ack-state-table markers
--     below and pinned by src/test/documents/ackState.test.ts) and due_at;
--   - states per rule through the definers: pending, overdue at a later
--     time, a planned joiner due from the join date, blocked no_login /
--     suspended / not_in_signer_set, acknowledged, not_required history
--     (left the vessel, withdrawn document);
--   - a minor version carries acknowledgements forward, a major one resets;
--   - self and witnessed acknowledgements and their refusals (Master and
--     HoD only, a HoD outside the department refused, not the subject);
--   - signer rules (named people, positions, HoD and above, clear) and who
--     may set them;
--   - readership per role (documents viewer, Master, HoD, the person,
--     another vessel's crew, company B, an inactive user), RLS included;
--   - reminders: who may send, the 24-hour rule, one emit per vessel;
--   - publish: one fleet_document_published per targeted vessel to its
--     pending logins; an emit failure never rolls back the publish, the
--     carried acknowledgements or the reminder call;
--   - the storage read-hook predicate; cross-tenant ids refused; direct
--     writes refused for every role; grants and emitter names.

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ world

SELECT tests.seed_vessel('A', 'A.arc', 'ARCHIVED', 'Sold');

SELECT tests.seed_user('A', 'A.deck1', 'crew');
SELECT tests.seed_assignment('A.deck1', 'A.dra', true, 'Deckhand', '{"department": "Deck"}'::jsonb);
SELECT tests.seed_user('A', 'A.eng1', 'crew');
SELECT tests.seed_assignment('A.eng1', 'A.dra', true, 'Motorman', '{"department": "Engine"}'::jsonb);
SELECT tests.seed_user('A', 'A.susp', 'crew', 'disabled');
SELECT tests.seed_assignment('A.susp', 'A.dra', true, 'Deckhand', '{"department": "Deck"}'::jsonb);
SELECT tests.seed_user('A', 'A.joiner', 'crew');
SELECT tests.seed_assignment('A.joiner', 'A.dra', true, 'Deckhand', jsonb_build_object('department', 'Deck', 'join_date', current_date + 10));
SELECT tests.seed_user('A', 'A.hod_deck', 'crew');
SELECT tests.seed_assignment('A.hod_deck', 'A.dra', true, 'Lead deckhand', '{"department": "Deck"}'::jsonb);
INSERT INTO public.user_roles (id, user_id, role, company_id, vessel_id, department, is_active)
VALUES (tests.id('ur:hod_deck'), tests.user_id('A.hod_deck'), 'hod', tests.company_id('A'), tests.vessel_id('A.dra'), 'Deck', true);
SELECT tests.seed_user('A', 'A.leaver', 'crew');
SELECT tests.seed_assignment('A.leaver', 'A.dra', true, 'Deckhand', '{"department": "Deck"}'::jsonb);
-- A login-less placement on DRAAK (D-199).
SELECT tests.seed_profile('A', 'A.nologin', 'crew', 'active', NULL,
  jsonb_build_object('imported_vessel_id', tests.vessel_id('A.dra'), 'is_imported', true, 'position', 'Stewardess', 'department', 'Interior', 'joining_date', current_date - 3));
SELECT tests.seed_user('A', 'A.crew_gam', 'crew');
SELECT tests.seed_assignment('A.crew_gam', 'A.gam', true, 'Deckhand');
SELECT tests.seed_user('B', 'B.crew', 'crew');
SELECT tests.seed_assignment('B.crew', 'B.lev', true, 'Deckhand');

-- A documents viewer with fleet reach (no edit).
SELECT tests.seed_user('A', 'A.doc_viewer', 'crew');
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'shore', vessel_scope = 'all', fleet_access = true, source = 'admin'
WHERE user_id = tests.user_id('A.doc_viewer');
SELECT tests.seed_role('x5_acks_view', 'fleet');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'documents', 'view', 'fleet' FROM public.roles AS r WHERE r.name = 'x5_acks_view';
SELECT tests.seed_rbac_role('A.doc_viewer', 'x5_acks_view');

SELECT tests.ok(public.record_is_master(tests.user_id('A.master_dra'), tests.vessel_id('A.dra')), 'setup: the DRAAK Master holds the office');
SELECT tests.ok(public.fleet_hod_covers(tests.user_id('A.hod_deck'), tests.vessel_id('A.dra'), 'Deck')
                AND NOT public.fleet_hod_covers(tests.user_id('A.hod_deck'), tests.vessel_id('A.dra'), 'Engine'), 'setup: the deck HoD covers Deck, not Engine');
SELECT tests.ok(public.fleet_ops_can_for(tests.user_id('A.doc_viewer'), tests.company_id('A'), NULL, 'documents', 'view')
                AND NOT public.fleet_ops_can_for(tests.user_id('A.doc_viewer'), tests.company_id('A'), NULL, 'documents', 'edit'), 'setup: the viewer reads the library, no edit');

CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
GRANT ALL ON ids TO PUBLIC;
CREATE FUNCTION pg_temp.id(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM ids WHERE k = p_key $$;
-- Profile keys, to read rows by person.
CREATE TEMP TABLE who (k text PRIMARY KEY, pid uuid NOT NULL) ON COMMIT DROP;
GRANT ALL ON who TO PUBLIC;
INSERT INTO who SELECT k, tests.profile_id(k) FROM unnest(ARRAY['A.master_dra', 'A.deck1', 'A.eng1', 'A.susp', 'A.joiner', 'A.hod_deck', 'A.leaver',
  'A.nologin', 'A.crew_hyd', 'A.crew_gam', 'A.fleet_manager', 'B.crew']) AS k;
CREATE FUNCTION pg_temp.who(p uuid) RETURNS text LANGUAGE sql STABLE AS $$ SELECT k FROM who WHERE pid = p $$;

-- A records file stored for the document (as the service registers it).
CREATE FUNCTION pg_temp.file_for(p_doc uuid, p_key text) RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO public.file_objects (id, company_id, vessel_id, bucket, storage_path, module_key, entity_type, entity_id, original_name, mime_type, size_bytes)
  VALUES (tests.id('file:' || p_key), tests.company_id('A'), NULL, 'records',
          tests.company_id('A')::text || '/fleet/documents/fleet_document/' || p_doc::text || '/' || tests.id('obj:' || p_key)::text || '-' || p_key || '.pdf',
          'documents', 'fleet_document', p_doc, p_key || '.pdf', 'application/pdf', 2048)
  RETURNING id
$$;

-- Publishes a new version (kind given or the type's) of a document as the fleet manager; returns it.
CREATE FUNCTION pg_temp.publish_version(p_doc uuid, p_key text, p_kind text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_file uuid;
  v_ver uuid;
BEGIN
  PERFORM tests.reset_role();
  v_file := pg_temp.file_for(p_doc, p_key);
  PERFORM tests.as_user(tests.user_id('A.fleet_manager'));
  v_ver := (public.fleet_document_add_version(p_doc, v_file, NULL, p_kind)).id;
  PERFORM public.fleet_document_publish(p_doc, v_ver, (SELECT updated_at FROM public.fleet_documents WHERE id = p_doc));
  PERFORM tests.reset_role();
  RETURN v_ver;
END;
$$;

-- ------------------------------------------------------------ the state rule (pure)

CREATE TEMP TABLE ack_case (status text, on_crew boolean, acknowledged boolean, has_login boolean, active boolean, in_set boolean, due text, expected text) ON COMMIT DROP;
INSERT INTO ack_case VALUES
-- ack-state-table:start
  ('published', true, false, true, true, true, 'future', 'pending'),
  ('published', true, false, true, true, true, 'none', 'pending'),
  ('published', true, false, true, true, true, 'past', 'overdue'),
  ('published', true, true, true, true, true, 'past', 'acknowledged'),
  ('published', true, true, false, false, false, 'past', 'acknowledged'),
  ('published', true, false, false, false, true, 'past', 'blocked'),
  ('published', true, false, false, true, true, 'future', 'blocked'),
  ('published', true, false, true, false, true, 'future', 'blocked'),
  ('published', true, false, true, true, false, 'past', 'blocked'),
  ('published', false, true, true, true, true, 'past', 'not_required'),
  ('published', false, false, true, true, true, 'future', 'not_required'),
  ('withdrawn', true, false, true, true, true, 'past', 'not_required'),
  ('withdrawn', true, true, true, true, true, 'future', 'not_required'),
  ('draft', true, false, true, true, true, 'future', 'not_required')
-- ack-state-table:end
;
SELECT tests.is_empty(
  $q$SELECT c.* FROM ack_case AS c
     WHERE public.fleet_document_ack_state(c.status, c.on_crew, c.acknowledged, c.has_login, c.active, c.in_set,
             CASE c.due WHEN 'past' THEN now() - interval '1 day' WHEN 'future' THEN now() + interval '1 day' END, now()) IS DISTINCT FROM c.expected$q$,
  'state rule: every row of the shared table');
SELECT tests.is((SELECT count(*) FROM ack_case), 14::bigint, 'state rule: 14 cases');

CREATE TEMP TABLE blocked_case (has_login boolean, active boolean, in_set boolean, expected text) ON COMMIT DROP;
INSERT INTO blocked_case VALUES
-- ack-blocked-table:start
  (false, false, false, 'no_login'),
  (false, true, true, 'no_login'),
  (true, false, false, 'suspended'),
  (true, false, true, 'suspended'),
  (true, true, false, 'not_in_signer_set'),
  (true, true, true, NULL)
-- ack-blocked-table:end
;
SELECT tests.is_empty($q$SELECT * FROM blocked_case AS c WHERE public.fleet_document_ack_blocked_reason(c.has_login, c.active, c.in_set) IS DISTINCT FROM c.expected$q$,
                      'blocked reason: the first that applies');
SELECT tests.is(public.fleet_document_ack_due_at('2026-11-01T10:00:00Z', date '2026-10-01', 14), '2026-11-15T10:00:00Z'::timestamptz, 'due: joined before publish -> publish + 14 days');
SELECT tests.is(public.fleet_document_ack_due_at('2026-11-01T10:00:00Z', date '2026-11-20', 14), '2026-12-04T00:00:00Z'::timestamptz, 'due: joining after publish -> the join day (00:00 UTC) + 14 days');
SELECT tests.is(public.fleet_document_ack_due_at('2026-11-01T10:00:00Z', NULL, 7), '2026-11-08T10:00:00Z'::timestamptz, 'due: no join date -> publish + days');
SELECT tests.is(public.fleet_document_ack_due_at(NULL, date '2026-11-20', 7), NULL::timestamptz, 'due: no publish time -> none');
SET LOCAL TIME ZONE 'Pacific/Auckland';
SELECT tests.is(public.fleet_document_ack_due_at('2026-03-30T10:00:00Z', NULL, 14), '2026-04-13T10:00:00Z'::timestamptz, 'due: UTC days, whatever the session time zone (DST)');
RESET TIME ZONE;

-- ------------------------------------------------------------ taxonomy and documents (the fleet manager)

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
INSERT INTO ids SELECT 'sec', (public.fleet_document_section_save(NULL, 'Safety management')).id;
INSERT INTO ids SELECT 'type:manual', (public.fleet_document_type_save(NULL, pg_temp.id('sec'), 'Manual')).id;
INSERT INTO ids SELECT 'type:policy', (public.fleet_document_type_save(NULL, pg_temp.id('sec'), 'Policy')).id;
INSERT INTO ids SELECT 'type:notice', (public.fleet_document_type_save(NULL, pg_temp.id('sec'), 'Notice', false)).id;
INSERT INTO ids SELECT 'doc:manual', (public.fleet_document_create(pg_temp.id('type:manual'), 'Safety management manual')).id;
INSERT INTO ids SELECT 'doc:all', (public.fleet_document_create(pg_temp.id('type:policy'), 'Drug and alcohol policy')).id;
INSERT INTO ids SELECT 'doc:info', (public.fleet_document_create(pg_temp.id('type:notice'), 'Garbage management plan')).id;
INSERT INTO ids SELECT 'doc:draft', (public.fleet_document_create(pg_temp.id('type:manual'), 'Draft procedure')).id;
INSERT INTO ids SELECT 'doc:ef', (public.fleet_document_create(pg_temp.id('type:manual'), 'Emit failure manual')).id;
SELECT public.fleet_document_set_targets(pg_temp.id('doc:manual'), 'selected', ARRAY[tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')]);
SELECT public.fleet_document_set_targets(pg_temp.id('doc:all'), 'all_including_future');
SELECT public.fleet_document_set_targets(pg_temp.id('doc:info'), 'selected', ARRAY[tests.vessel_id('A.dra')]);
SELECT public.fleet_document_set_targets(pg_temp.id('doc:draft'), 'selected', ARRAY[tests.vessel_id('A.dra')]);
SELECT public.fleet_document_set_targets(pg_temp.id('doc:ef'), 'selected', ARRAY[tests.vessel_id('A.dra')]);
SELECT tests.reset_role();
INSERT INTO ids SELECT 'file:draft', pg_temp.file_for(pg_temp.id('doc:draft'), 'draft-1');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT public.fleet_document_add_version(pg_temp.id('doc:draft'), pg_temp.id('file:draft'));
SELECT tests.reset_role();

-- ------------------------------------------------------------ an emit failure never rolls anything back (D-128)

SAVEPOINT emit_failure;
DELETE FROM public.notification_types WHERE key IN ('fleet_document_published', 'fleet_document_ack_reminder');
SELECT tests.lives($q$SELECT pg_temp.publish_version(pg_temp.id('doc:ef'), 'ef-1')$q$, 'emit failure: publishing works while the notification type is missing');
SELECT tests.is((SELECT status FROM public.fleet_documents WHERE id = pg_temp.id('doc:ef')), 'published', 'emit failure: the document is published');
SELECT tests.as_user(tests.user_id('A.deck1'));
SELECT tests.lives(format($q$SELECT public.fleet_document_acknowledge(%L, %L)$q$, (SELECT current_version_id FROM public.fleet_documents WHERE id = pg_temp.id('doc:ef')), tests.vessel_id('A.dra')),
                   'emit failure: crew acknowledge');
SELECT tests.reset_role();
SELECT tests.lives($q$SELECT pg_temp.publish_version(pg_temp.id('doc:ef'), 'ef-2', 'minor')$q$, 'emit failure: a minor version publishes');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_acknowledgements AS a JOIN public.fleet_documents AS d ON d.current_version_id = a.version_id
                 WHERE d.id = pg_temp.id('doc:ef') AND a.method = 'carried_forward'), 1::bigint, 'emit failure: the acknowledgement is carried forward all the same');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT public.fleet_document_remind(pg_temp.id('doc:ef'), tests.vessel_id('A.dra')) AS ef_remind \gset
SELECT tests.reset_role();
SELECT tests.ok((:'ef_remind'::jsonb ->> 'sent')::int = 0 AND (:'ef_remind'::jsonb ->> 'failed')::int > 0 AND (:'ef_remind'::jsonb ->> 'reminder_id') IS NULL,
                'emit failure: the reminder reports its failure, claims nobody reminded and logs nothing');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_reminders WHERE document_id = pg_temp.id('doc:ef')), 0::bigint, 'emit failure: no reminder row');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE record_id = pg_temp.id('doc:ef')), 0::bigint, 'emit failure: no outbox row is claimed');
ROLLBACK TO SAVEPOINT emit_failure;
SELECT tests.reset_role();
SELECT tests.ok(EXISTS (SELECT 1 FROM public.notification_types WHERE key = 'fleet_document_published'), 'setup restored: the notification type is back');

-- ------------------------------------------------------------ publish: one emit per targeted vessel

INSERT INTO ids SELECT 'ver:manual1', pg_temp.publish_version(pg_temp.id('doc:manual'), 'manual-1');
INSERT INTO ids SELECT 'ver:all1', pg_temp.publish_version(pg_temp.id('doc:all'), 'all-1');
INSERT INTO ids SELECT 'ver:info1', pg_temp.publish_version(pg_temp.id('doc:info'), 'info-1');

SELECT tests.results_eq(
  $q$SELECT v.name, o.dedupe_key = 'fdp:' || pg_temp.id('ver:manual1') || ':' || o.vessel_id, o.link_scope, o.link_path, o.module_key
     FROM public.notification_outbox AS o JOIN public.vessels AS v ON v.id = o.vessel_id
     WHERE o.type_key = 'fleet_document_published' AND o.record_id = pg_temp.id('doc:manual') ORDER BY v.name$q$,
  format($q$VALUES ('HYDRA'::text, true, 'vessel'::text, %L::text, 'safety'::text), ('M/Y DRAAK'::text, true, 'vessel'::text, %1$L::text, 'safety'::text)$q$,
         'safety/fleet-documents?doc=' || pg_temp.id('doc:manual')),
  'publish: one fleet_document_published per targeted vessel, vessel link to the document, module safety');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE type_key = 'fleet_document_published' AND record_id = pg_temp.id('doc:all')), 3::bigint,
                'publish: all vessels including future -> each counted vessel (DRAAK, HYDRA, GAME CHANGER), not the sold one');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE record_id = pg_temp.id('doc:info')), 0::bigint, 'publish: a document that needs no acknowledgement notifies nobody');
SELECT tests.results_eq(
  $q$SELECT pg_temp.who(p.id) FROM public.notification_outbox AS o, unnest(o.must_act_user_ids) AS u JOIN public.profiles AS p ON p.user_id = u
     WHERE o.type_key = 'fleet_document_published' AND o.record_id = pg_temp.id('doc:manual') AND o.vessel_id = tests.vessel_id('A.dra') ORDER BY 1$q$,
  $q$VALUES ('A.deck1'::text), ('A.eng1'::text), ('A.hod_deck'::text), ('A.joiner'::text), ('A.leaver'::text), ('A.master_dra'::text)$q$,
  'publish: DRAAK''s pending logins are the must-act users (not the suspended login, not the placement without one)');
SELECT tests.ok(EXISTS (SELECT 1 FROM public.notification_inbox AS i WHERE i.user_id = tests.user_id('A.deck1') AND i.type_key = 'fleet_document_published' AND i.record_id = pg_temp.id('doc:manual'))
                AND NOT EXISTS (SELECT 1 FROM public.notification_inbox AS i WHERE i.user_id = tests.user_id('A.fleet_manager') AND i.type_key = 'fleet_document_published'),
                'publish: the crew get it in their inbox; the publisher does not');
SELECT tests.ok((SELECT bool_and(o.body NOT ILIKE '%email%') FROM public.notification_outbox AS o WHERE o.type_key = 'fleet_document_published'), 'publish: the copy never promises an email (D-249)');

-- ------------------------------------------------------------ states per rule

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.results_eq(
  $q$SELECT pg_temp.who(s.profile_id), v.name, s.state, s.blocked_reason, s.has_login, s.on_crew
     FROM public.fleet_document_ack_status(pg_temp.id('doc:manual')) AS s JOIN public.vessels AS v ON v.id = s.vessel_id ORDER BY 2, 1$q$,
  $q$VALUES ('A.crew_hyd'::text, 'HYDRA'::text, 'pending'::text, NULL::text, true, true),
            ('A.deck1', 'M/Y DRAAK', 'pending', NULL, true, true),
            ('A.eng1', 'M/Y DRAAK', 'pending', NULL, true, true),
            ('A.hod_deck', 'M/Y DRAAK', 'pending', NULL, true, true),
            ('A.joiner', 'M/Y DRAAK', 'pending', NULL, true, true),
            ('A.leaver', 'M/Y DRAAK', 'pending', NULL, true, true),
            ('A.master_dra', 'M/Y DRAAK', 'pending', NULL, true, true),
            ('A.nologin', 'M/Y DRAAK', 'blocked', 'no_login', false, true),
            ('A.susp', 'M/Y DRAAK', 'blocked', 'suspended', true, true)$q$,
  'states: every targeted crew member pending; no login and a suspended login blocked with the reason');
SELECT tests.is((SELECT due_at FROM public.fleet_document_ack_status(pg_temp.id('doc:manual')) WHERE profile_id = tests.profile_id('A.deck1')),
                (SELECT published_at FROM public.fleet_document_versions WHERE id = pg_temp.id('ver:manual1')) + interval '14 days',
                'due: crew on board at publication -> publish + 14 days');
SELECT tests.is((SELECT due_at FROM public.fleet_document_ack_status(pg_temp.id('doc:manual')) WHERE profile_id = tests.profile_id('A.joiner')),
                ((current_date + 10)::timestamp AT TIME ZONE 'UTC') + interval '14 days',
                'due: the planned joiner is pending and due 14 days after the join date');
SELECT tests.is((SELECT is_planned FROM public.fleet_document_ack_status(pg_temp.id('doc:manual')) WHERE profile_id = tests.profile_id('A.joiner')), true, 'states: the planned joiner is flagged');
SELECT tests.reset_role();
SELECT tests.results_eq(
  $q$SELECT pg_temp.who(r.profile_id), r.state FROM public.fleet_document_ack_rows(tests.company_id('A'), pg_temp.id('doc:manual'), ARRAY[tests.vessel_id('A.dra')], now() + interval '15 days') AS r
     WHERE pg_temp.who(r.profile_id) IN ('A.deck1', 'A.joiner') ORDER BY 1$q$,
  $q$VALUES ('A.deck1'::text, 'overdue'::text), ('A.joiner'::text, 'pending'::text)$q$,
  'overdue: 15 days on, the crew are overdue; the joiner is still pending');
SELECT tests.is((SELECT r.state FROM public.fleet_document_ack_rows(tests.company_id('A'), pg_temp.id('doc:manual'), ARRAY[tests.vessel_id('A.dra')], now() + interval '25 days') AS r
                 WHERE r.profile_id = tests.profile_id('A.joiner')), 'overdue', 'overdue: 25 days on, the joiner too');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_ack_rows(tests.company_id('A'), pg_temp.id('doc:info'), NULL, now())), 0::bigint, 'states: a document without acknowledgement has no rows');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_ack_rows(tests.company_id('A'), pg_temp.id('doc:draft'), NULL, now())), 0::bigint, 'states: a draft has no rows');
SELECT tests.is((SELECT count(DISTINCT r.vessel_id) FROM public.fleet_document_ack_rows(tests.company_id('A'), pg_temp.id('doc:all'), NULL, now()) AS r), 3::bigint,
                'states: all vessels including future covers DRAAK, HYDRA and GAME CHANGER (not the sold vessel)');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_ack_rows(tests.company_id('B'), pg_temp.id('doc:manual'), NULL, now())), 0::bigint, 'states: another company''s core answers nothing for A''s document');

-- ------------------------------------------------------------ the vessel page and the pending card

SELECT tests.as_user(tests.user_id('A.deck1'));
SELECT tests.results_eq(
  $q$SELECT title, ack_required, version_label, state, caller_on_crew, section_name, type_name, file_name FROM public.fleet_document_vessel_documents(tests.vessel_id('A.dra'))$q$,
  $q$VALUES ('Safety management manual'::text, true, 'v1'::text, 'pending'::text, true, 'Safety management'::text, 'Manual'::text, 'manual-1.pdf'::text),
            ('Drug and alcohol policy', true, 'v1', 'pending', true, 'Safety management', 'Policy', 'all-1.pdf'),
            ('Garbage management plan', false, 'v1', NULL, true, 'Safety management', 'Notice', 'info-1.pdf')$q$,
  'vessel page: the published documents by section and type, the caller''s own state (none for a document without acknowledgement), never drafts');
SELECT tests.results_eq($q$SELECT title, state FROM public.fleet_document_my_pending() ORDER BY title$q$,
                        $q$VALUES ('Drug and alcohol policy'::text, 'pending'::text), ('Safety management manual'::text, 'pending'::text)$q$,
                        'my pending: the caller''s two outstanding documents');
SELECT tests.throws_like(format($q$SELECT * FROM public.fleet_document_vessel_documents(%L)$q$, tests.vessel_id('A.hyd')), '42501', 'vessel_out_of_reach', 'vessel page: a vessel the crew member does not reach');
SELECT tests.throws_like(format($q$SELECT * FROM public.fleet_document_my_pending(%L)$q$, tests.vessel_id('A.hyd')), '42501', 'vessel_out_of_reach', 'my pending: another vessel refused');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.results_eq($q$SELECT DISTINCT caller_on_crew, state FROM public.fleet_document_vessel_documents(tests.vessel_id('A.dra'))$q$,
                        $q$VALUES (false, NULL::text)$q$, 'vessel page: a fleet manager sees the documents, with no state of their own');
SELECT tests.is_empty($q$SELECT * FROM public.fleet_document_my_pending()$q$, 'my pending: nothing for someone on no crew');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(format($q$SELECT * FROM public.fleet_document_vessel_documents(%L)$q$, tests.vessel_id('A.dra')), '42501', 'vessel_out_of_reach', 'vessel page: company B refused');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws_like($q$SELECT * FROM public.fleet_document_my_pending()$q$, '42501', 'not_permitted', 'my pending: an inactive user refused');

-- ------------------------------------------------------------ acknowledge (self)

SELECT tests.as_user(tests.user_id('A.deck1'));
-- A write is called once (results_eq runs its query more than once) and its row read back.
INSERT INTO ids SELECT 'ack:deck1', (public.fleet_document_acknowledge(pg_temp.id('ver:manual1'), tests.vessel_id('A.dra'))).id;
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT method, user_id = %L::uuid, profile_id = %L::uuid, recorded_by = %1$L::uuid, witnessed_by_profile_id IS NULL, request_meta ->> 'state'
            FROM public.fleet_document_acknowledgements WHERE id = pg_temp.id('ack:deck1')$q$, tests.user_id('A.deck1'), tests.profile_id('A.deck1')),
  $q$VALUES ('self'::text, true, true, true, true, 'pending'::text)$q$,
  'acknowledge: a self acknowledgement by the caller, for themselves');
SELECT tests.as_user(tests.user_id('A.deck1'));
SELECT tests.throws_like(format($q$SELECT public.fleet_document_acknowledge(%L, %L)$q$, pg_temp.id('ver:manual1'), tests.vessel_id('A.dra')), '22023', 'already_acknowledged', 'acknowledge: twice is refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_acknowledge(%L, %L)$q$, pg_temp.id('ver:info1'), tests.vessel_id('A.dra')), '22023', 'not_required', 'acknowledge: a document that needs none');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_acknowledge(%L, %L)$q$, pg_temp.id('ver:manual1'), tests.vessel_id('A.hyd')), '42501', 'vessel_out_of_reach', 'acknowledge: a vessel the caller does not reach');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_acknowledge(%L, %L)$q$, gen_random_uuid(), tests.vessel_id('A.dra')), 'P0002', 'version_not_found', 'acknowledge: an unknown version');
SELECT tests.is((SELECT state FROM public.fleet_document_vessel_documents(tests.vessel_id('A.dra')) WHERE title = 'Safety management manual'), 'acknowledged', 'vessel page: the state follows');
SELECT tests.results_eq($q$SELECT title FROM public.fleet_document_my_pending()$q$, $q$VALUES ('Drug and alcohol policy'::text)$q$, 'my pending: the acknowledged document is gone');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.lives(format($q$SELECT public.fleet_document_acknowledge(%L, %L)$q$, pg_temp.id('ver:manual1'), tests.vessel_id('A.hyd')), 'acknowledge: HYDRA crew on HYDRA');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_acknowledge(%L, %L)$q$, pg_temp.id('ver:manual1'), tests.vessel_id('A.dra')), '42501', 'vessel_out_of_reach', 'acknowledge: HYDRA crew on DRAAK refused');
SELECT tests.as_user(tests.user_id('A.leaver'));
SELECT tests.lives(format($q$SELECT public.fleet_document_acknowledge(%L, %L)$q$, pg_temp.id('ver:manual1'), tests.vessel_id('A.dra')), 'acknowledge: the leaver acknowledges before leaving');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format($q$SELECT public.fleet_document_acknowledge(%L, %L)$q$, pg_temp.id('ver:manual1'), tests.vessel_id('A.dra')), '22023', 'not_required', 'acknowledge: someone not on the crew');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(format($q$SELECT public.fleet_document_acknowledge(%L, %L)$q$, pg_temp.id('ver:manual1'), tests.vessel_id('A.dra')), 'P0002', 'version_not_found', 'acknowledge: company B never sees A''s version');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws_like(format($q$SELECT public.fleet_document_acknowledge(%L, %L)$q$, pg_temp.id('ver:manual1'), tests.vessel_id('A.dra')), '42501', 'not_permitted', 'acknowledge: an inactive user refused');
SELECT tests.reset_role();

-- ------------------------------------------------------------ witnessed (Master and HoD, on a shared device)

SELECT tests.as_user(tests.user_id('A.master_dra'));
INSERT INTO ids SELECT 'ack:nologin', (public.fleet_document_acknowledge_witnessed(pg_temp.id('ver:manual1'), tests.vessel_id('A.dra'), tests.profile_id('A.nologin'))).id;
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT method, user_id IS NULL, witnessed_by_profile_id = %L::uuid, recorded_by = %L::uuid, request_meta ->> 'blocked_reason', request_meta ->> 'witness_role'
            FROM public.fleet_document_acknowledgements WHERE id = pg_temp.id('ack:nologin')$q$,
         tests.profile_id('A.master_dra'), tests.user_id('A.master_dra')),
  $q$VALUES ('witnessed'::text, true, true, true, 'no_login'::text, 'master'::text)$q$,
  'witnessed: the Master records the placement without a login, as witness');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.lives(format($q$SELECT public.fleet_document_acknowledge_witnessed(%L, %L, %L)$q$, pg_temp.id('ver:manual1'), tests.vessel_id('A.dra'), tests.profile_id('A.susp')),
                   'witnessed: and a crew member whose login is suspended');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_acknowledge_witnessed(%L, %L, %L)$q$, pg_temp.id('ver:manual1'), tests.vessel_id('A.dra'), tests.profile_id('A.master_dra')),
                         '22023', 'witness_is_subject', 'witnessed: not for oneself');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_acknowledge_witnessed(%L, %L, %L)$q$, pg_temp.id('ver:manual1'), tests.vessel_id('A.dra'), tests.profile_id('A.deck1')),
                         '22023', 'already_acknowledged', 'witnessed: someone who already acknowledged');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_acknowledge_witnessed(%L, %L, %L)$q$, pg_temp.id('ver:manual1'), tests.vessel_id('A.dra'), tests.profile_id('A.crew_hyd')),
                         '22023', 'not_required', 'witnessed: someone not on DRAAK''s crew');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_acknowledge_witnessed(%L, %L, %L)$q$, pg_temp.id('ver:manual1'), tests.vessel_id('A.dra'), tests.profile_id('B.crew')),
                         'P0002', 'profile_not_found', 'witnessed: a person of company B');
SELECT tests.as_user(tests.user_id('A.hod_deck'));
INSERT INTO ids SELECT 'ack:hod', (public.fleet_document_acknowledge_witnessed(pg_temp.id('ver:all1'), tests.vessel_id('A.dra'), tests.profile_id('A.deck1'))).id;
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT method, request_meta ->> 'witness_role' FROM public.fleet_document_acknowledgements WHERE id = pg_temp.id('ack:hod')$q$,
                        $q$VALUES ('witnessed'::text, 'hod'::text)$q$, 'witnessed: the deck HoD for a deck crew member');
SELECT tests.as_user(tests.user_id('A.hod_deck'));
SELECT tests.throws_like(format($q$SELECT public.fleet_document_acknowledge_witnessed(%L, %L, %L)$q$, pg_temp.id('ver:manual1'), tests.vessel_id('A.dra'), tests.profile_id('A.eng1')),
                         '42501', 'not_permitted', 'witnessed: a HoD outside the person''s department is refused');
SELECT tests.as_user(tests.user_id('A.deck1'));
SELECT tests.throws_like(format($q$SELECT public.fleet_document_acknowledge_witnessed(%L, %L, %L)$q$, pg_temp.id('ver:manual1'), tests.vessel_id('A.dra'), tests.profile_id('A.eng1')),
                         '42501', 'not_permitted', 'witnessed: crew may not witness');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format($q$SELECT public.fleet_document_acknowledge_witnessed(%L, %L, %L)$q$, pg_temp.id('ver:manual1'), tests.vessel_id('A.dra'), tests.profile_id('A.eng1')),
                         '42501', 'not_permitted', 'witnessed: the fleet manager is not on board, so not a witness');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(format($q$SELECT public.fleet_document_acknowledge_witnessed(%L, %L, %L)$q$, pg_temp.id('ver:manual1'), tests.vessel_id('A.dra'), tests.profile_id('A.eng1')),
                         'P0002', 'version_not_found', 'witnessed: company B refused');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.results_eq(
  $q$SELECT pg_temp.who(s.profile_id), s.state, s.method FROM public.fleet_document_ack_status(pg_temp.id('doc:manual'), ARRAY[tests.vessel_id('A.dra')]) AS s
     WHERE pg_temp.who(s.profile_id) IN ('A.deck1', 'A.nologin', 'A.susp') ORDER BY 1$q$,
  $q$VALUES ('A.deck1'::text, 'acknowledged'::text, 'self'::text), ('A.nologin', 'acknowledged', 'witnessed'), ('A.susp', 'acknowledged', 'witnessed')$q$,
  'states: acknowledged wins over a blocked reason');

-- ------------------------------------------------------------ history: a crew member leaves

SELECT tests.reset_role();
UPDATE public.crew_assignments SET is_current = false, leave_date = current_date - 1 WHERE id = tests.id('assignment:A.leaver@A.dra');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.results_eq(
  $q$SELECT s.state, s.on_crew, s.acknowledged_at IS NOT NULL, s.method FROM public.fleet_document_ack_status(pg_temp.id('doc:manual')) AS s WHERE s.profile_id = tests.profile_id('A.leaver')$q$,
  $q$VALUES ('not_required'::text, false, true, 'self'::text)$q$,
  'history: an acknowledgement of someone who left is not_required, kept with its time');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_ack_status(pg_temp.id('doc:all')) AS s WHERE s.profile_id = tests.profile_id('A.leaver')), 0::bigint,
                'history: a document they never acknowledged no longer lists them');

-- ------------------------------------------------------------ signer rules (FD8)

SELECT tests.as_user(tests.user_id('A.deck1'));
SELECT tests.throws_like(format($q$SELECT public.fleet_document_set_signer_rule(%L, NULL, 'hod_and_above')$q$, tests.vessel_id('A.dra')), '42501', 'not_permitted', 'signers: crew may not choose');
SELECT tests.as_user(tests.user_id('A.doc_viewer'));
SELECT tests.throws_like(format($q$SELECT public.fleet_document_set_signer_rule(%L, NULL, 'hod_and_above')$q$, tests.vessel_id('A.dra')), '42501', 'not_permitted', 'signers: a documents viewer may not choose');
SELECT tests.as_user(tests.user_id('A.master_dra'));
INSERT INTO ids SELECT 'rule:named', (public.fleet_document_set_signer_rule(tests.vessel_id('A.dra'), pg_temp.id('type:manual'), 'named_people', NULL,
                                                                           ARRAY[tests.profile_id('A.eng1'), tests.profile_id('A.eng1')])).id;
SELECT tests.results_eq(
  format($q$SELECT rule, positions, profile_ids = ARRAY[%L::uuid], type_id = %L::uuid, created_by = auth.uid() FROM public.fleet_document_signer_rules WHERE id = pg_temp.id('rule:named')$q$,
         tests.profile_id('A.eng1'), pg_temp.id('type:manual')),
  $q$VALUES ('named_people'::text, '{}'::text[], true, true, true)$q$,
  'signers: the Master names the people for manuals on DRAAK (duplicates dropped; readable by the Master)');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_set_signer_rule(%L, NULL, 'hod_and_above')$q$, tests.vessel_id('A.hyd')), '42501', 'vessel_out_of_reach', 'signers: the DRAAK Master cannot choose for HYDRA');
SELECT tests.as_user(tests.user_id('A.hod_deck'));
SELECT tests.throws_like(format($q$SELECT public.fleet_document_set_signer_rule(%L, NULL, 'hod_and_above')$q$, tests.vessel_id('A.dra')), '42501', 'not_permitted', 'signers: a HoD may not choose (the Master does)');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.results_eq(
  $q$SELECT pg_temp.who(s.profile_id), s.state, s.blocked_reason FROM public.fleet_document_ack_status(pg_temp.id('doc:manual'), ARRAY[tests.vessel_id('A.dra')]) AS s
     WHERE s.on_crew ORDER BY 1$q$,
  $q$VALUES ('A.deck1'::text, 'acknowledged'::text, NULL::text), ('A.eng1', 'pending', NULL), ('A.hod_deck', 'blocked', 'not_in_signer_set'),
            ('A.joiner', 'blocked', 'not_in_signer_set'), ('A.master_dra', 'blocked', 'not_in_signer_set'), ('A.nologin', 'acknowledged', NULL), ('A.susp', 'acknowledged', NULL)$q$,
  'signers: outside the named people is blocked (not_in_signer_set); acknowledgements made stay');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_ack_status(pg_temp.id('doc:all'), ARRAY[tests.vessel_id('A.dra')]) AS s WHERE s.state = 'blocked' AND s.blocked_reason = 'not_in_signer_set'),
                0::bigint, 'signers: a rule for manuals leaves the policy type alone');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(format($q$SELECT public.fleet_document_acknowledge(%L, %L)$q$, pg_temp.id('ver:manual1'), tests.vessel_id('A.dra')), '22023', 'blocked', 'acknowledge: outside the signer set is refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_acknowledge_witnessed(%L, %L, %L)$q$, pg_temp.id('ver:manual1'), tests.vessel_id('A.dra'), tests.profile_id('A.joiner')),
                         '22023', 'blocked', 'witnessed: never for someone outside the signer set');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is((public.fleet_document_set_signer_rule(tests.vessel_id('A.dra'), pg_temp.id('type:manual'), 'positions', ARRAY['  Master ', 'motorman', ''])).positions,
                ARRAY['Master', 'motorman'], 'signers: positions trimmed, blanks dropped, replacing the named people');
SELECT tests.results_eq(
  $q$SELECT pg_temp.who(s.profile_id), s.state FROM public.fleet_document_ack_status(pg_temp.id('doc:manual'), ARRAY[tests.vessel_id('A.dra')]) AS s
     WHERE pg_temp.who(s.profile_id) IN ('A.master_dra', 'A.eng1', 'A.hod_deck') ORDER BY 1$q$,
  $q$VALUES ('A.eng1'::text, 'pending'::text), ('A.hod_deck', 'blocked'), ('A.master_dra', 'pending')$q$,
  'signers: positions match the position by office name (case and spacing ignored)');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_signer_rules WHERE vessel_id = tests.vessel_id('A.dra')), 1::bigint, 'signers: one rule per vessel and type');
SELECT tests.lives(format($q$SELECT public.fleet_document_set_signer_rule(%L, NULL, 'hod_and_above')$q$, tests.vessel_id('A.dra')), 'signers: HoD and above for every other type');
SELECT tests.results_eq(
  $q$SELECT pg_temp.who(s.profile_id), s.state FROM public.fleet_document_ack_status(pg_temp.id('doc:all'), ARRAY[tests.vessel_id('A.dra')]) AS s
     WHERE pg_temp.who(s.profile_id) IN ('A.master_dra', 'A.eng1', 'A.hod_deck', 'A.deck1') ORDER BY 1$q$,
  $q$VALUES ('A.deck1'::text, 'acknowledged'::text), ('A.eng1', 'blocked'), ('A.hod_deck', 'pending'), ('A.master_dra', 'pending')$q$,
  'signers: HoD and above lets the Master (by office) and the HoD (by role) sign; a motorman is blocked');
SELECT tests.is((SELECT blocked_reason FROM public.fleet_document_ack_status(pg_temp.id('doc:manual'), ARRAY[tests.vessel_id('A.dra')]) WHERE profile_id = tests.profile_id('A.hod_deck')),
                'not_in_signer_set', 'signers: the type rule beats the every-type rule');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_set_signer_rule(%L, NULL, 'captains')$q$, tests.vessel_id('A.dra')), '22023', 'invalid_rule', 'signers: an unknown rule');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_set_signer_rule(%L, NULL, 'positions', ARRAY['  '])$q$, tests.vessel_id('A.dra')), '22023', 'positions_required', 'signers: positions need one');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_set_signer_rule(%L, NULL, 'positions', ARRAY[%L])$q$, tests.vessel_id('A.dra'), repeat('p', 81)), '22023', 'position_too_long', 'signers: an 81-character position');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_set_signer_rule(%L, NULL, 'hod_and_above', ARRAY['Master'])$q$, tests.vessel_id('A.dra')), '22023', 'positions_not_expected', 'signers: positions only for the positions rule');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_set_signer_rule(%L, NULL, 'named_people')$q$, tests.vessel_id('A.dra')), '22023', 'people_required', 'signers: named people need one');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_set_signer_rule(%L, NULL, 'hod_and_above', NULL, ARRAY[%L]::uuid[])$q$, tests.vessel_id('A.dra'), tests.profile_id('A.deck1')),
                         '22023', 'people_not_expected', 'signers: people only for the named rule');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_set_signer_rule(%L, NULL, 'named_people', NULL, ARRAY[%L]::uuid[])$q$, tests.vessel_id('A.dra'), tests.profile_id('B.crew')),
                         'P0002', 'profile_not_found', 'signers: a person of company B');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_set_signer_rule(%L, %L, 'hod_and_above')$q$, tests.vessel_id('A.dra'), gen_random_uuid()), 'P0002', 'type_not_found', 'signers: an unknown type');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_set_signer_rule(%L, NULL, 'hod_and_above')$q$, tests.vessel_id('B.lev')), '42501', 'vessel_out_of_reach', 'signers: company B''s vessel');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_set_signer_rule(%L, NULL, 'hod_and_above')$q$, tests.vessel_id('A.arc')), '22023', 'vessel_archived', 'signers: a sold vessel');
SELECT tests.is((public.fleet_document_set_signer_rule(tests.vessel_id('A.dra'), NULL, NULL)).rule, 'hod_and_above', 'signers: a NULL rule removes it and returns the removed rule');
SELECT tests.is((public.fleet_document_set_signer_rule(tests.vessel_id('A.dra'), pg_temp.id('type:manual'), NULL)).rule, 'positions', 'signers: and the type rule');
SELECT tests.is((public.fleet_document_set_signer_rule(tests.vessel_id('A.dra'), pg_temp.id('type:manual'), NULL)).id, NULL::uuid, 'signers: removing nothing returns nothing');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_ack_status(pg_temp.id('doc:manual'), ARRAY[tests.vessel_id('A.dra')]) WHERE blocked_reason = 'not_in_signer_set'), 0::bigint,
                'signers: without a rule everyone with a login signs again');

-- ------------------------------------------------------------ readership (RPCs and RLS)

SELECT tests.as_user(tests.user_id('A.deck1'));
SELECT tests.is((SELECT array_agg(DISTINCT pg_temp.who(profile_id)) FROM public.fleet_document_ack_status()), ARRAY['A.deck1'], 'readers: crew read their own rows only');
SELECT tests.is((SELECT array_agg(DISTINCT pg_temp.who(profile_id)) FROM public.fleet_document_acknowledgements), ARRAY['A.deck1'], 'readers (RLS): crew read their own acknowledgements only');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is((SELECT array_agg(DISTINCT vessel_id) FROM public.fleet_document_ack_status(pg_temp.id('doc:manual'))), ARRAY[tests.vessel_id('A.dra')], 'readers: the Master reads their vessel''s rows, not HYDRA''s');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_ack_status(pg_temp.id('doc:manual'))), 8::bigint, 'readers: every DRAAK row (history included)');
SELECT tests.is((SELECT array_agg(DISTINCT vessel_id) FROM public.fleet_document_acknowledgements), ARRAY[tests.vessel_id('A.dra')], 'readers (RLS): the Master reads DRAAK''s acknowledgements');
SELECT tests.as_user(tests.user_id('A.hod_deck'));
SELECT tests.results_eq($q$SELECT DISTINCT pg_temp.who(profile_id) FROM public.fleet_document_ack_status(pg_temp.id('doc:manual')) ORDER BY 1$q$,
                        $q$VALUES ('A.deck1'::text), ('A.hod_deck'), ('A.joiner'), ('A.leaver'), ('A.susp')$q$,
                        'readers: the deck HoD reads the Deck department on DRAAK');
SELECT tests.results_eq($q$SELECT DISTINCT pg_temp.who(profile_id) FROM public.fleet_document_acknowledgements ORDER BY 1$q$,
                        $q$VALUES ('A.deck1'::text), ('A.leaver'), ('A.susp')$q$, 'readers (RLS): and their acknowledgements');
SELECT tests.as_user(tests.user_id('A.doc_viewer'));
SELECT tests.is((SELECT count(DISTINCT vessel_id) FROM public.fleet_document_ack_status(pg_temp.id('doc:manual'))), 2::bigint, 'readers: a documents viewer with fleet reach reads every vessel');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.throws_like(format($q$SELECT * FROM public.fleet_document_ack_status(%L, ARRAY[%L]::uuid[])$q$, pg_temp.id('doc:manual'), tests.vessel_id('A.dra')),
                         '42501', 'vessel_out_of_reach', 'readers: HYDRA crew cannot ask about DRAAK');
SELECT tests.is((SELECT array_agg(DISTINCT pg_temp.who(profile_id)) FROM public.fleet_document_acknowledgements), ARRAY['A.crew_hyd'], 'readers (RLS): HYDRA crew read their own only');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(format($q$SELECT * FROM public.fleet_document_ack_status(%L)$q$, pg_temp.id('doc:manual')), 'P0002', 'document_not_found', 'readers: company B cannot name A''s document');
SELECT tests.is_empty($q$SELECT * FROM public.fleet_document_ack_status()$q$, 'readers: company B reads nothing of A');
SELECT tests.is_empty($q$SELECT * FROM public.fleet_document_acknowledgements$q$, 'readers (RLS): company B reads no acknowledgement of A');
SELECT tests.is_empty($q$SELECT * FROM public.fleet_document_summary()$q$, 'readers: company B counts nothing of A');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws_like($q$SELECT * FROM public.fleet_document_ack_status()$q$, '42501', 'not_permitted', 'readers: an inactive user refused');
SELECT tests.is_empty($q$SELECT * FROM public.fleet_document_acknowledgements$q$, 'readers (RLS): an inactive user reads nothing');
SELECT tests.as_anon();
SELECT tests.denied($q$SELECT * FROM public.fleet_document_acknowledgements$q$, 'readers: anon is denied');

-- Summary counts.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.results_eq(
  $q$SELECT v.name, s.acknowledged, s.pending, s.overdue, s.blocked, s.can_sign
     FROM public.fleet_document_summary() AS s JOIN public.vessels AS v ON v.id = s.vessel_id WHERE s.document_id = pg_temp.id('doc:manual') ORDER BY 1$q$,
  $q$VALUES ('HYDRA'::text, 1::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint), ('M/Y DRAAK', 3, 4, 0, 0, 4)$q$,
  'summary: per vessel, acknowledged / pending / overdue / blocked / can sign (history not counted)');
SELECT tests.as_user(tests.user_id('A.hod_deck'));
SELECT tests.results_eq(
  $q$SELECT s.acknowledged, s.pending FROM public.fleet_document_summary() AS s WHERE s.document_id = pg_temp.id('doc:manual')$q$,
  $q$VALUES (2::bigint, 2::bigint)$q$, 'summary: a HoD counts their department only');

-- ------------------------------------------------------------ reminders (FD7)

SELECT tests.as_user(tests.user_id('A.deck1'));
SELECT tests.throws_like(format($q$SELECT public.fleet_document_remind(%L, %L)$q$, pg_temp.id('doc:manual'), tests.vessel_id('A.dra')), '42501', 'not_permitted', 'remind: crew may not');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(format($q$SELECT public.fleet_document_remind(%L)$q$, pg_temp.id('doc:manual')), '22023', 'vessel_required', 'remind: the Master names their vessel');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_remind(%L, %L)$q$, pg_temp.id('doc:manual'), tests.vessel_id('A.hyd')), '42501', 'vessel_out_of_reach', 'remind: not another vessel');
SELECT public.fleet_document_remind(pg_temp.id('doc:manual'), tests.vessel_id('A.dra')) AS remind1 \gset
SELECT tests.results_eq(format($q$SELECT (%1$L::jsonb ->> 'sent')::int, (%1$L::jsonb ->> 'skipped')::int, (%1$L::jsonb ->> 'failed')::int, (%1$L::jsonb ->> 'vessels')::int$q$, :'remind1'),
                        $q$VALUES (3, 0, 0, 1)$q$,
                        'remind: the Master reminds DRAAK''s outstanding logins (engine, HoD, joiner), not themselves');
SELECT tests.reset_role();
SELECT tests.results_eq(
  $q$SELECT pg_temp.who(p.id) FROM public.notification_outbox AS o, unnest(o.must_act_user_ids) AS u JOIN public.profiles AS p ON p.user_id = u
     WHERE o.type_key = 'fleet_document_ack_reminder' AND o.record_id = pg_temp.id('doc:manual') ORDER BY 1$q$,
  $q$VALUES ('A.eng1'::text), ('A.hod_deck'), ('A.joiner')$q$,
  'remind: one fleet_document_ack_reminder for the vessel, to those three');
SELECT tests.results_eq(
  format($q$SELECT kind, sent_by = %L::uuid, vessel_id = %L::uuid, recipient_count, skipped_count FROM public.fleet_document_reminders WHERE id = %L$q$,
         tests.user_id('A.master_dra'), tests.vessel_id('A.dra'), :'remind1'::jsonb ->> 'reminder_id'),
  $q$VALUES ('manual'::text, true, true, 3, 0)$q$, 'remind: logged with sender, vessel and counts');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT public.fleet_document_remind(pg_temp.id('doc:manual'), tests.vessel_id('A.dra')) AS remind2 \gset
SELECT tests.results_eq(format($q$SELECT (%1$L::jsonb ->> 'sent')::int, (%1$L::jsonb ->> 'skipped')::int$q$, :'remind2'),
                        $q$VALUES (0, 3)$q$, 'remind: within 24 hours everyone is skipped, and counted');
SELECT tests.as_user(tests.user_id('A.hod_deck'));
SELECT public.fleet_document_remind(pg_temp.id('doc:all'), tests.vessel_id('A.dra'), tests.profile_id('A.eng1')) AS remind3 \gset
SELECT tests.results_eq(format($q$SELECT (%1$L::jsonb ->> 'sent')::int, (%1$L::jsonb ->> 'skipped')::int, (%1$L::jsonb ->> 'reminder_id') IS NULL$q$, :'remind3'),
                        $q$VALUES (0, 0, true)$q$, 'remind: a HoD reaches nobody outside their department (nothing logged)');
SELECT public.fleet_document_remind(pg_temp.id('doc:all'), tests.vessel_id('A.dra')) AS remind4 \gset
SELECT tests.results_eq(format($q$SELECT (%1$L::jsonb ->> 'sent')::int, (%1$L::jsonb ->> 'reminder_id') IS NULL$q$, :'remind4'),
                        $q$VALUES (1, false)$q$, 'remind: the HoD reminds the Deck crew outstanding on the policy (the joiner)');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT public.fleet_document_remind(pg_temp.id('doc:all')) AS remind5 \gset
SELECT tests.results_eq(format($q$SELECT (%1$L::jsonb ->> 'sent')::int, (%1$L::jsonb ->> 'skipped')::int, (%1$L::jsonb ->> 'vessels')::int$q$, :'remind5'),
                        $q$VALUES (5, 1, 3)$q$, 'remind: an editor reminds every vessel (DRAAK, HYDRA, GAME CHANGER); the joiner, reminded by the HoD, is skipped');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_remind(%L)$q$, pg_temp.id('doc:info')), '22023', 'ack_not_required', 'remind: a document without acknowledgement');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_remind(%L)$q$, pg_temp.id('doc:draft')), '22023', 'not_published', 'remind: a draft');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_remind(%L, NULL, %L)$q$, pg_temp.id('doc:manual'), tests.profile_id('B.crew')), 'P0002', 'profile_not_found', 'remind: a person of company B');
SELECT tests.as_user(tests.user_id('A.doc_viewer'));
SELECT tests.throws_like(format($q$SELECT public.fleet_document_remind(%L)$q$, pg_temp.id('doc:manual')), '42501', 'not_permitted', 'remind: a documents viewer (no edit) may not');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(format($q$SELECT public.fleet_document_remind(%L)$q$, pg_temp.id('doc:manual')), 'P0002', 'document_not_found', 'remind: company B refused');
SELECT tests.reset_role();
SELECT tests.ok((SELECT bool_and(o.body NOT ILIKE '%email%') FROM public.notification_outbox AS o WHERE o.type_key = 'fleet_document_ack_reminder'), 'remind: the copy never promises an email (D-249)');

-- ------------------------------------------------------------ minor versions carry forward, major ones reset

INSERT INTO ids SELECT 'ver:manual2', pg_temp.publish_version(pg_temp.id('doc:manual'), 'manual-2', 'minor');
SELECT tests.results_eq(
  $q$SELECT pg_temp.who(a.profile_id), a.method, a.carried_from_version_id = pg_temp.id('ver:manual1'), a.acknowledged_at = o.acknowledged_at
     FROM public.fleet_document_acknowledgements AS a
     JOIN public.fleet_document_acknowledgements AS o ON o.version_id = pg_temp.id('ver:manual1') AND o.vessel_id = a.vessel_id AND o.profile_id = a.profile_id
     WHERE a.version_id = pg_temp.id('ver:manual2') ORDER BY 1$q$,
  $q$VALUES ('A.crew_hyd'::text, 'carried_forward'::text, true, true), ('A.deck1', 'carried_forward', true, true), ('A.leaver', 'carried_forward', true, true),
            ('A.nologin', 'carried_forward', true, true), ('A.susp', 'carried_forward', true, true)$q$,
  'minor: every acknowledgement of the superseded version is carried forward with its time');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.results_eq(
  $q$SELECT pg_temp.who(s.profile_id), s.state, s.version_id = pg_temp.id('ver:manual2') FROM public.fleet_document_ack_status(pg_temp.id('doc:manual')) AS s
     WHERE pg_temp.who(s.profile_id) IN ('A.deck1', 'A.eng1') ORDER BY 1$q$,
  $q$VALUES ('A.deck1'::text, 'acknowledged'::text, true), ('A.eng1', 'pending', true)$q$,
  'minor: acknowledged stays acknowledged on the new version; pending stays pending');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE type_key = 'fleet_document_published' AND dedupe_key LIKE 'fdp:' || pg_temp.id('ver:manual2') || ':%'), 1::bigint,
                'minor: only DRAAK (people still pending) is notified of the new version; HYDRA has nobody pending');
INSERT INTO ids SELECT 'ver:manual3', pg_temp.publish_version(pg_temp.id('doc:manual'), 'manual-3', 'major');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_acknowledgements WHERE version_id = pg_temp.id('ver:manual3')), 0::bigint, 'major: nothing is carried forward');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.results_eq(
  $q$SELECT DISTINCT s.state FROM public.fleet_document_ack_status(pg_temp.id('doc:manual')) AS s WHERE s.on_crew AND s.has_login AND s.profile_id <> tests.profile_id('A.susp')$q$,
  $q$VALUES ('pending'::text)$q$, 'major: everyone signs again');
SELECT tests.as_user(tests.user_id('A.deck1'));
SELECT tests.throws_like(format($q$SELECT public.fleet_document_acknowledge(%L, %L)$q$, pg_temp.id('ver:manual1'), tests.vessel_id('A.dra')), '22023', 'not_required', 'acknowledge: a superseded version is not required');
SELECT tests.lives(format($q$SELECT public.fleet_document_acknowledge(%L, %L)$q$, pg_temp.id('ver:manual3'), tests.vessel_id('A.dra')), 'acknowledge: the new major version');

-- ------------------------------------------------------------ withdrawn documents

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT public.fleet_document_withdraw(pg_temp.id('doc:all'), 'Replaced by the new policy');
SELECT tests.results_eq($q$SELECT DISTINCT state FROM public.fleet_document_ack_status(pg_temp.id('doc:all'))$q$, $q$VALUES ('not_required'::text)$q$,
                        'withdrawn: every row is not_required (history, by id)');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_ack_status() WHERE document_id = pg_temp.id('doc:all')), 0::bigint, 'withdrawn: not in the current rows');
SELECT tests.as_user(tests.user_id('A.eng1'));
SELECT tests.throws_like(format($q$SELECT public.fleet_document_acknowledge(%L, %L)$q$, pg_temp.id('ver:all1'), tests.vessel_id('A.dra')), '22023', 'not_required', 'withdrawn: acknowledging is not required');
SELECT tests.is_empty(format($q$SELECT * FROM public.fleet_document_my_pending() WHERE document_id = %L$q$, pg_temp.id('doc:all')), 'withdrawn: gone from the pending card');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format($q$SELECT public.fleet_document_remind(%L)$q$, pg_temp.id('doc:all')), '22023', 'not_published', 'withdrawn: no reminders');

-- ------------------------------------------------------------ files: the storage read hook (PR-07)

SELECT tests.reset_role();
SELECT v.storage_path AS manual_path FROM public.fleet_document_versions AS v WHERE v.id = pg_temp.id('ver:manual3') \gset
SELECT v.storage_path AS draft_path FROM public.fleet_document_versions AS v WHERE v.document_id = pg_temp.id('doc:draft') \gset
SELECT tests.ok(public.fleet_document_file_readable(tests.user_id('A.deck1'), pg_temp.id('doc:manual')), 'files: DRAAK crew read a document published to DRAAK');
SELECT tests.ok(public.fleet_document_file_readable(tests.user_id('A.crew_gam'), pg_temp.id('doc:manual')) IS FALSE, 'files: GAME CHANGER crew do not (not targeted)');
SELECT tests.ok(public.fleet_document_file_readable(tests.user_id('A.deck1'), pg_temp.id('doc:draft')) IS FALSE, 'files: crew never read a draft');
SELECT tests.ok(public.fleet_document_file_readable(tests.user_id('A.fleet_manager'), pg_temp.id('doc:draft')), 'files: an editor reads a draft');
SELECT tests.ok(public.fleet_document_file_readable(tests.user_id('A.doc_viewer'), pg_temp.id('doc:draft')) IS FALSE
                AND public.fleet_document_file_readable(tests.user_id('A.doc_viewer'), pg_temp.id('doc:all')), 'files: a viewer reads non-drafts (a withdrawn one too), not drafts');
SELECT tests.ok(public.fleet_document_file_readable(tests.user_id('A.susp'), pg_temp.id('doc:manual')) IS FALSE, 'files: a suspended login reads nothing');
SELECT tests.ok(public.fleet_document_file_readable(tests.user_id('B.admin'), pg_temp.id('doc:manual')) IS FALSE, 'files: company B reads nothing');
SELECT tests.ok(public.fleet_document_file_readable(tests.user_id('A.deck1'), gen_random_uuid()) IS FALSE AND public.fleet_document_file_readable(NULL, pg_temp.id('doc:manual')) IS FALSE,
                'files: unknown ids answer false');
SELECT tests.as_user(tests.user_id('A.deck1'));
SELECT tests.ok(public.storage_path_allowed('records', :'manual_path', false), 'files: through storage_path_allowed, DRAAK crew open the published file');
SELECT tests.ok(NOT public.storage_path_allowed('records', :'draft_path', false), 'files: and never the draft''s');
SELECT tests.ok(NOT public.storage_path_allowed('records', :'manual_path', true), 'files: reading never grants writing');
SELECT tests.as_user(tests.user_id('A.crew_gam'));
SELECT tests.ok(NOT public.storage_path_allowed('records', :'manual_path', false), 'files: untargeted crew cannot open it');
SELECT tests.reset_role();

-- ------------------------------------------------------------ direct writes are refused for every role

SELECT tests.as_user(tests.user_id('A.deck1'));
SELECT tests.throws(format($q$INSERT INTO public.fleet_document_acknowledgements (company_id, document_id, version_id, vessel_id, profile_id, user_id, method)
                              VALUES (%L, %L, %L, %L, %L, auth.uid(), 'self')$q$, tests.company_id('A'), pg_temp.id('doc:manual'), pg_temp.id('ver:manual3'), tests.vessel_id('A.dra'), tests.profile_id('A.eng1')),
                    '42501', 'writes: crew cannot insert an acknowledgement (no grant)');
SELECT tests.throws(format($q$INSERT INTO public.fleet_document_signer_rules (company_id, vessel_id, rule) VALUES (%L, %L, 'hod_and_above')$q$, tests.company_id('A'), tests.vessel_id('A.dra')),
                    '42501', 'writes: nor a signer rule');
SELECT tests.as_service();
SELECT tests.throws_like(format($q$INSERT INTO public.fleet_document_acknowledgements (company_id, document_id, version_id, vessel_id, profile_id, user_id, method)
                                   VALUES (%L, %L, %L, %L, %L, %L, 'self')$q$, tests.company_id('A'), pg_temp.id('doc:manual'), pg_temp.id('ver:manual3'), tests.vessel_id('A.dra'),
                                   tests.profile_id('A.eng1'), tests.user_id('A.eng1')),
                         '42501', 'fleet_document_acknowledgements_guarded', 'writes: the service role inserts only through the definers');
SELECT tests.throws_like($q$UPDATE public.fleet_document_acknowledgements SET acknowledged_at = now() - interval '1 year'$q$, '42501', 'fleet_document_acknowledgements_guarded', 'writes: the service role never edits one');
SELECT tests.throws_like($q$DELETE FROM public.fleet_document_acknowledgements$q$, '42501', 'fleet_document_acknowledgements_guarded', 'writes: or deletes one');
SELECT tests.throws_like(format($q$INSERT INTO public.fleet_document_signer_rules (company_id, vessel_id, rule) VALUES (%L, %L, 'hod_and_above')$q$, tests.company_id('A'), tests.vessel_id('A.hyd')),
                         '42501', 'fleet_document_signer_rules_guarded', 'writes: the service role sets signers only through the definer');
SELECT tests.throws_like($q$UPDATE public.fleet_document_reminders SET recipient_count = 0, recipient_profile_ids = '{}'$q$, '42501', 'fleet_document_reminders_guarded', 'writes: the reminder log is append-only');
SELECT tests.reset_role();
SELECT tests.throws_like($q$DELETE FROM public.fleet_document_reminders$q$, '42501', 'fleet_document_reminders_guarded', 'writes: even for the owner');
SELECT tests.throws_like(format($q$UPDATE public.fleet_document_acknowledgements SET profile_id = %L WHERE profile_id = %L$q$, tests.profile_id('A.eng1'), tests.profile_id('A.deck1')),
                         '42501', 'fleet_document_acknowledgements_guarded', 'writes: the owner never moves an acknowledgement to someone else');

-- ------------------------------------------------------------ grants and emitters

SELECT tests.ok(
  (SELECT bool_and(has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE'))
   FROM unnest(ARRAY['public.fleet_document_vessel_documents(uuid)', 'public.fleet_document_ack_status(uuid,uuid[])', 'public.fleet_document_summary(uuid[])',
                     'public.fleet_document_my_pending(uuid)', 'public.fleet_document_acknowledge(uuid,uuid)', 'public.fleet_document_acknowledge_witnessed(uuid,uuid,uuid)',
                     'public.fleet_document_remind(uuid,uuid,uuid)', 'public.fleet_document_set_signer_rule(uuid,uuid,text,text[],uuid[])',
                     'public.fleet_document_ack_reader_for(uuid,uuid,uuid)']::regprocedure[]) AS f),
  'grants: the browser RPCs and the RLS helper are executable by authenticated, not anon');
SELECT tests.ok(
  (SELECT bool_and(NOT has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE'))
   FROM unnest(ARRAY['public.fleet_document_ack_rows(uuid,uuid,uuid[],timestamptz)', 'public.fleet_document_file_readable(uuid,uuid)',
                     'public.fleet_document_in_signer_set(uuid,uuid,uuid,uuid,text,text)', 'public.fleet_document_is_senior(uuid,uuid,uuid,text,text)',
                     'public.fleet_document_vessel_pairs(uuid,uuid,uuid[])', 'public.fleet_document_ack_state(text,boolean,boolean,boolean,boolean,boolean,timestamptz,timestamptz)',
                     'public.fleet_documents_after_publish()', 'public.fleet_document_acknowledgements_guard()']::regprocedure[]) AS f),
  'grants: the state core, the file predicate, the helpers and the triggers are internal');
SELECT tests.ok(has_function_privilege('service_role', 'public.fleet_document_file_readable(uuid,uuid)', 'EXECUTE'), 'grants: the file predicate is the service''s');
SELECT tests.ok((SELECT bool_and(c.relrowsecurity) FROM pg_class AS c WHERE c.oid IN ('public.fleet_document_acknowledgements'::regclass, 'public.fleet_document_signer_rules'::regclass, 'public.fleet_document_reminders'::regclass)),
                'grants: RLS is on for the three tables');
SELECT tests.ok(NOT has_table_privilege('authenticated', 'public.fleet_document_acknowledgements', 'INSERT')
                AND NOT has_table_privilege('authenticated', 'public.fleet_document_signer_rules', 'UPDATE')
                AND NOT has_table_privilege('authenticated', 'public.fleet_document_reminders', 'DELETE')
                AND has_table_privilege('authenticated', 'public.fleet_document_acknowledgements', 'SELECT'), 'grants: the browser reads, never writes');
-- D-238: the types this file emits are live in documents/module.ts; their emitters name them.
SELECT tests.ok(position('''fleet_document_published''' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.fleet_documents_after_publish()'::regprocedure)) > 0,
                'emitters: fleet_documents_after_publish emits fleet_document_published');
SELECT tests.ok(position('''fleet_document_ack_reminder''' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.fleet_document_remind(uuid,uuid,uuid)'::regprocedure)) > 0,
                'emitters: fleet_document_remind emits fleet_document_ack_reminder');
SELECT tests.ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_fleet_documents_after_publish' AND tgrelid = 'public.fleet_documents'::regclass AND NOT tgisinternal),
                'emitters: the publish trigger is on fleet_documents');
SELECT tests.ok(
  (SELECT bool_and(position('BEGIN' IN s) > 0 AND position('EXCEPTION WHEN others' IN s) > 0)
   FROM (SELECT prosrc AS s FROM pg_proc WHERE oid IN ('public.fleet_documents_after_publish()'::regprocedure, 'public.fleet_document_remind(uuid,uuid,uuid)'::regprocedure)) AS x),
  'emitters: every emit is guarded (D-128)');
