-- The fleet document library (20261124040300_fleet_documents_library.sql;
-- gap/02 FD1, FD2, FD4, FD5, FD10, W1; D-X5-03, D-X5-21, D-X5-23): two
-- companies; A's counted vessels DRAAK, HYDRA, GAME CHANGER, an uncounted
-- vessel and a sold one. Proves:
--   - every cell of the states x actions table of
--     src/modules/documents/lib/fleetDocumentMachine.ts (copied between the
--     machine-table markers below and pinned by fleetDocumentMachine.test.ts),
--     legal and illegal, through the definers, with one event row each;
--   - publish guards (stale updated_at, no file, no targets, a published or
--     superseded version), supersession, the major / minor effect, labels,
--     the one-draft rule and draft replacement;
--   - the taxonomy definers and the delete rules (sections with documents,
--     types in use, admin needed);
--   - visibility: crew of targeted, untargeted, uncounted and future
--     vessels; drafts hidden from readers; withdrawn documents hidden from
--     crew; a vessel-scoped RBAC documents holder without fleet reach reads
--     no library rows; inactive users and company B read nothing;
--   - files: a foreign, removed, misplaced or reused file refused;
--     cross-tenant ids refused;
--   - direct inserts, status updates and deletes refused for every role
--     (authenticated, service role, the owner), events append-only;
--   - grants.

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ world

SELECT tests.seed_vessel('A', 'A.unc', 'UNCOUNTED', 'Active', NULL, NULL, '{"is_counted": false}'::jsonb);
SELECT tests.seed_vessel('A', 'A.arc', 'ARCHIVED', 'Sold');

-- Crew on each vessel (A.master_dra on DRAAK, A.crew_hyd on HYDRA come from the seed).
SELECT tests.seed_user('A', 'A.crew_gam', 'crew');
SELECT tests.seed_assignment('A.crew_gam', 'A.gam', true, 'Deckhand');
SELECT tests.seed_user('A', 'A.crew_unc', 'crew');
SELECT tests.seed_assignment('A.crew_unc', 'A.unc', true, 'Deckhand');

-- Library readers and editors: fleet-wide shore memberships with an RBAC documents role.
SELECT tests.seed_user('A', 'A.doc_viewer', 'crew');
SELECT tests.seed_user('A', 'A.doc_editor', 'crew');
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'shore', vessel_scope = 'all', fleet_access = true, source = 'admin'
WHERE user_id IN (tests.user_id('A.doc_viewer'), tests.user_id('A.doc_editor'));
SELECT tests.seed_role('x5_docs_view', 'fleet');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'documents', 'view', 'fleet' FROM public.roles AS r WHERE r.name = 'x5_docs_view';
SELECT tests.seed_rbac_role('A.doc_viewer', 'x5_docs_view');
SELECT tests.seed_role('x5_docs_edit', 'fleet');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'documents', 'edit', 'fleet' FROM public.roles AS r WHERE r.name = 'x5_docs_edit';
SELECT tests.seed_rbac_role('A.doc_editor', 'x5_docs_edit');

-- A vessel-scoped RBAC documents admin on DRAAK, with no fleet reach.
SELECT tests.seed_user('A', 'A.vessel_docs', 'crew');
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'shore', vessel_scope = 'assigned', fleet_access = false, source = 'admin'
WHERE user_id = tests.user_id('A.vessel_docs');
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT m.id, m.company_id, tests.vessel_id('A.dra') FROM public.account_memberships AS m WHERE m.user_id = tests.user_id('A.vessel_docs');
SELECT tests.seed_role('x5_docs_vessel', 'vessel');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'documents', p::public.permission_level, 'vessel' FROM public.roles AS r, unnest(ARRAY['view', 'edit', 'admin']) AS p
WHERE r.name = 'x5_docs_vessel';
SELECT tests.seed_rbac_role('A.vessel_docs', 'x5_docs_vessel', 'A.dra');

SELECT tests.ok(public.fleet_reach_for(tests.user_id('A.doc_viewer'), tests.company_id('A')) AND public.fleet_reach_for(tests.user_id('A.doc_editor'), tests.company_id('A')),
                'setup: the library reader and editor have fleet reach');
SELECT tests.ok(public.reach_vessel_for(tests.user_id('A.vessel_docs'), tests.vessel_id('A.dra'))
                AND NOT public.reach_vessel_for(tests.user_id('A.vessel_docs'), tests.vessel_id('A.hyd'))
                AND NOT public.fleet_reach_for(tests.user_id('A.vessel_docs'), tests.company_id('A')),
                'setup: the vessel documents admin reaches DRAAK only, with no fleet reach');
SELECT tests.ok(public.reach_vessel_for(tests.user_id('A.master_dra'), tests.vessel_id('A.dra')) AND NOT public.fleet_reach_for(tests.user_id('A.master_dra'), tests.company_id('A'))
                AND public.reach_vessel_for(tests.user_id('A.crew_hyd'), tests.vessel_id('A.hyd')) AND NOT public.fleet_reach_for(tests.user_id('A.crew_hyd'), tests.company_id('A')),
                'setup: the DRAAK master and HYDRA crew reach their vessel only');
SELECT tests.ok(public.fleet_ops_can_for(tests.user_id('A.doc_viewer'), tests.company_id('A'), NULL, 'documents', 'view')
                AND NOT public.fleet_ops_can_for(tests.user_id('A.doc_viewer'), tests.company_id('A'), NULL, 'documents', 'edit')
                AND public.fleet_ops_can_for(tests.user_id('A.doc_editor'), tests.company_id('A'), NULL, 'documents', 'edit')
                AND NOT public.fleet_ops_can_for(tests.user_id('A.doc_editor'), tests.company_id('A'), NULL, 'documents', 'admin')
                AND public.fleet_ops_can_for(tests.user_id('A.fleet_manager'), tests.company_id('A'), NULL, 'documents', 'admin')
                AND NOT public.fleet_ops_can_for(tests.user_id('A.vessel_docs'), tests.company_id('A'), NULL, 'documents', 'view'),
                'setup: viewer view only, editor edit not admin, the fleet manager admin, the vessel admin nothing at fleet level');

-- Ids shared across roles: definers return ids, the test keeps them by key.
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
GRANT ALL ON ids TO PUBLIC;
CREATE FUNCTION pg_temp.id(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM ids WHERE k = p_key $$;

-- A records file of company p_company stored for document p_doc (as the service would register it).
CREATE FUNCTION pg_temp.file_for(p_doc uuid, p_key text, p_company text DEFAULT 'A', p_entity_type text DEFAULT 'fleet_document') RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO public.file_objects (id, company_id, vessel_id, bucket, storage_path, module_key, entity_type, entity_id, original_name, mime_type, size_bytes)
  VALUES (tests.id('file:' || p_key), tests.company_id(p_company), NULL, 'records',
          tests.company_id(p_company)::text || '/fleet/documents/' || p_entity_type || '/' || p_doc::text || '/' || tests.id('obj:' || p_key)::text || '-' || p_key || '.pdf',
          'documents', p_entity_type, p_doc, p_key || '.pdf', 'application/pdf', 1024)
  RETURNING id
$$;

-- ------------------------------------------------------------ taxonomy (the fleet manager)

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
INSERT INTO ids SELECT 'sec:safety', (public.fleet_document_section_save(NULL, '  Safety management  ')).id;
INSERT INTO ids SELECT 'sec:ops', (public.fleet_document_section_save(NULL, 'Operations')).id;
INSERT INTO ids SELECT 'sec:empty', (public.fleet_document_section_save(NULL, 'Empty section')).id;
INSERT INTO ids SELECT 'type:manual', (public.fleet_document_type_save(NULL, pg_temp.id('sec:safety'), 'Safety manual')).id;
INSERT INTO ids SELECT 'type:policy', (public.fleet_document_type_save(NULL, pg_temp.id('sec:safety'), 'Policy', false, 30, 'minor', true)).id;
INSERT INTO ids SELECT 'type:procedure', (public.fleet_document_type_save(NULL, pg_temp.id('sec:ops'), 'Procedure')).id;
INSERT INTO ids SELECT 'type:empty', (public.fleet_document_type_save(NULL, pg_temp.id('sec:ops'), 'Unused type')).id;
INSERT INTO ids SELECT 'type:in_empty', (public.fleet_document_type_save(NULL, pg_temp.id('sec:empty'), 'Placeholder')).id;

SELECT tests.results_eq(
  $q$SELECT name, sort_order FROM public.fleet_document_sections ORDER BY sort_order$q$,
  $q$VALUES ('Safety management'::text, 1), ('Operations'::text, 2), ('Empty section'::text, 3)$q$,
  'sections: names trimmed, placed last in turn');
SELECT tests.results_eq(
  $q$SELECT name, ack_required_default, ack_due_days_default, version_kind_default, hide_when_empty, sort_order
     FROM public.fleet_document_types WHERE section_id = pg_temp.id('sec:safety') ORDER BY sort_order$q$,
  $q$VALUES ('Safety manual'::text, true, 14, 'major'::text, false, 1), ('Policy'::text, false, 30, 'minor'::text, true, 2)$q$,
  'types: the table defaults (acknowledge, 14 days, major, shown) unless given');

SELECT tests.throws_like($q$SELECT public.fleet_document_section_save(NULL, 'safety MANAGEMENT')$q$, '22023', 'section_name_taken', 'section: a duplicate name (any case) is refused');
SELECT tests.throws_like($q$SELECT public.fleet_document_section_save(NULL, '   ')$q$, '22023', 'name_required', 'section: a blank name is refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_section_save(NULL, %L)$q$, repeat('x', 81)), '22023', 'name_too_long', 'section: 81 characters are refused');
SELECT tests.throws_like($q$SELECT public.fleet_document_section_save(gen_random_uuid(), 'Ghost')$q$, 'P0002', 'section_not_found', 'section: an unknown id is not found');
SELECT tests.throws_like($q$SELECT public.fleet_document_type_save(NULL, pg_temp.id('sec:safety'), 'safety manual')$q$, '22023', 'type_name_taken', 'type: a duplicate name in the section is refused');
SELECT tests.lives($q$SELECT public.fleet_document_type_save(NULL, pg_temp.id('sec:ops'), 'Safety manual') $q$, 'type: the same name in another section is fine');
SELECT tests.throws_like($q$SELECT public.fleet_document_type_save(NULL, NULL, 'No section')$q$, '22023', 'section_required', 'type: a new type needs a section');
SELECT tests.throws_like($q$SELECT public.fleet_document_type_save(NULL, pg_temp.id('sec:ops'), 'Days', NULL, 0)$q$, '22023', 'invalid_ack_due_days', 'type: 0 days refused');
SELECT tests.throws_like($q$SELECT public.fleet_document_type_save(NULL, pg_temp.id('sec:ops'), 'Days', NULL, 366)$q$, '22023', 'invalid_ack_due_days', 'type: 366 days refused');
SELECT tests.throws_like($q$SELECT public.fleet_document_type_save(NULL, pg_temp.id('sec:ops'), 'Kind', NULL, NULL, 'patch')$q$, '22023', 'invalid_version_kind', 'type: an unknown version kind refused');

-- Rename, no-op, move, reorder.
SELECT tests.is((public.fleet_document_section_save(pg_temp.id('sec:ops'), 'Operations and procedures')).name, 'Operations and procedures', 'section: renamed');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_events WHERE action = 'section_renamed'), 1::bigint, 'section: the rename is one event');
SELECT tests.is((public.fleet_document_section_save(pg_temp.id('sec:ops'), 'Operations and procedures')).name, 'Operations and procedures', 'section: an unchanged name');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_events WHERE action = 'section_renamed'), 1::bigint, 'section: an unchanged name writes no event');
SELECT tests.is((public.fleet_document_type_save(pg_temp.id('type:policy'), pg_temp.id('sec:ops'), NULL, NULL, 21)).sort_order, 4,
                'type: moved to another section (placed last there)');
SELECT tests.results_eq($q$SELECT name, section_id FROM public.fleet_document_types WHERE id = pg_temp.id('type:policy')$q$,
                        format($q$VALUES ('Policy'::text, %L::uuid)$q$, pg_temp.id('sec:ops')), 'type: name kept, section changed');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_events WHERE action = 'type_updated'), 1::bigint, 'type: the change is one event');
SELECT tests.is((SELECT ack_due_days_default FROM public.fleet_document_types WHERE id = pg_temp.id('type:policy')), 21, 'type: the new default stored');
SELECT tests.lives($q$SELECT public.fleet_document_type_save(pg_temp.id('type:policy'), pg_temp.id('sec:safety'), NULL)$q$, 'type: moved back');
SELECT tests.results_eq(
  format($q$SELECT name FROM public.fleet_document_sections_reorder(ARRAY[%L, %L, %L]::uuid[])$q$, pg_temp.id('sec:empty'), pg_temp.id('sec:ops'), pg_temp.id('sec:safety')),
  $q$VALUES ('Empty section'::text), ('Operations and procedures'::text), ('Safety management'::text)$q$,
  'reorder: the sections in the order given');
SELECT tests.throws_like(format($q$SELECT * FROM public.fleet_document_sections_reorder(ARRAY[%L, %L]::uuid[])$q$, pg_temp.id('sec:empty'), pg_temp.id('sec:ops')),
                         '22023', 'reorder_mismatch', 'reorder: a missing section is refused');
SELECT tests.throws_like(format($q$SELECT * FROM public.fleet_document_sections_reorder(ARRAY[%L, %L, %L, %L]::uuid[])$q$, pg_temp.id('sec:empty'), pg_temp.id('sec:ops'), pg_temp.id('sec:safety'), pg_temp.id('sec:ops')),
                         '22023', 'reorder_mismatch', 'reorder: a duplicate is refused');
SELECT tests.throws_like(format($q$SELECT * FROM public.fleet_document_sections_reorder(ARRAY[%L, %L, %L]::uuid[])$q$, pg_temp.id('sec:empty'), pg_temp.id('sec:ops'), gen_random_uuid()),
                         '22023', 'reorder_mismatch', 'reorder: an unknown id is refused');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_events WHERE action = 'sections_reordered'), 1::bigint, 'reorder: one event');

-- ------------------------------------------------------------ the state machine (copy of lib/fleetDocumentMachine.ts)

-- Each cell gets its own document in the cell's state, published (where it
-- is) to DRAAK with a first version, then the action is applied.
CREATE TEMP TABLE machine (state text NOT NULL, action text NOT NULL, outcome text NOT NULL, PRIMARY KEY (state, action)) ON COMMIT DROP;
GRANT ALL ON machine TO PUBLIC;
INSERT INTO machine (state, action, outcome) VALUES
-- machine-table:start
  ('draft', 'edit_details', 'draft'),
  ('draft', 'add_version', 'draft'),
  ('draft', 'set_targets', 'draft'),
  ('draft', 'publish', 'published'),
  ('draft', 'withdraw', '!not_published'),
  ('draft', 'delete_draft', 'deleted'),
  ('published', 'edit_details', 'published'),
  ('published', 'add_version', 'published'),
  ('published', 'set_targets', 'published'),
  ('published', 'publish', 'published'),
  ('published', 'withdraw', 'withdrawn'),
  ('published', 'delete_draft', '!document_published'),
  ('withdrawn', 'edit_details', '!document_withdrawn'),
  ('withdrawn', 'add_version', '!document_withdrawn'),
  ('withdrawn', 'set_targets', '!document_withdrawn'),
  ('withdrawn', 'publish', '!document_withdrawn'),
  ('withdrawn', 'withdraw', '!already_withdrawn'),
  ('withdrawn', 'delete_draft', '!document_withdrawn')
-- machine-table:end
;

SELECT tests.is((SELECT count(*) FROM machine), 18::bigint, 'machine: 3 states x 6 actions');

DO $$
DECLARE
  c record;
  v_doc uuid;
  v_ver uuid;
  v_file uuid;
  v_next_file uuid;
  v_status text;
  v_events_before bigint;
  v_events_after bigint;
  v_got text;
  v_ok boolean;
  v_msg text;
BEGIN
  FOR c IN SELECT * FROM machine ORDER BY state, action LOOP
    PERFORM tests.as_user(tests.user_id('A.fleet_manager'));
    v_doc := (public.fleet_document_create(pg_temp.id('type:manual'), 'Machine ' || c.state || ' ' || c.action)).id;
    PERFORM tests.reset_role();
    v_file := pg_temp.file_for(v_doc, 'm-' || c.state || '-' || c.action || '-1');
    v_next_file := pg_temp.file_for(v_doc, 'm-' || c.state || '-' || c.action || '-2');
    PERFORM tests.as_user(tests.user_id('A.fleet_manager'));
    v_ver := (public.fleet_document_add_version(v_doc, v_file)).id;
    PERFORM public.fleet_document_set_targets(v_doc, 'selected', ARRAY[tests.vessel_id('A.dra')]);
    IF c.state IN ('published', 'withdrawn') THEN
      PERFORM public.fleet_document_publish(v_doc, v_ver, (SELECT updated_at FROM public.fleet_documents WHERE id = v_doc));
    END IF;
    IF c.state = 'withdrawn' THEN
      PERFORM public.fleet_document_withdraw(v_doc, 'Replaced by the new manual');
    END IF;
    -- A published document needs a new draft version to publish again.
    IF c.state = 'published' AND c.action = 'publish' THEN
      v_ver := (public.fleet_document_add_version(v_doc, v_next_file, NULL, 'minor')).id;
    END IF;
    v_events_before := (SELECT count(*) FROM public.fleet_document_events WHERE document_id = v_doc);
    BEGIN
      CASE c.action
        WHEN 'edit_details' THEN
          PERFORM public.fleet_document_update(v_doc, (SELECT updated_at FROM public.fleet_documents WHERE id = v_doc), NULL, 'Renamed ' || c.state);
        WHEN 'add_version' THEN
          IF c.state = 'withdrawn' THEN
            PERFORM public.fleet_document_add_version(v_doc, v_next_file);
          ELSE
            PERFORM public.fleet_document_add_version(v_doc, v_next_file, 'Rev B');
          END IF;
        WHEN 'set_targets' THEN
          PERFORM public.fleet_document_set_targets(v_doc, 'selected', ARRAY[tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')]);
        WHEN 'publish' THEN
          PERFORM public.fleet_document_publish(v_doc, v_ver, (SELECT updated_at FROM public.fleet_documents WHERE id = v_doc));
        WHEN 'withdraw' THEN
          PERFORM public.fleet_document_withdraw(v_doc, 'No longer in use');
        WHEN 'delete_draft' THEN
          PERFORM public.fleet_document_delete_draft(v_doc);
      END CASE;
      v_status := (SELECT status FROM public.fleet_documents WHERE id = v_doc);
      v_got := coalesce(v_status, 'deleted');
    EXCEPTION WHEN OTHERS THEN
      v_got := '!' || SQLERRM;
      IF SQLSTATE <> '22023' THEN
        v_got := v_got || ' (' || SQLSTATE || ')';
      END IF;
    END;
    v_events_after := (SELECT count(*) FROM public.fleet_document_events WHERE document_id = v_doc);
    PERFORM tests.is(v_got, c.outcome, format('machine: %s + %s -> %s', c.state, c.action, c.outcome));
    IF left(c.outcome, 1) = '!' THEN
      PERFORM tests.is(v_events_after - v_events_before, 0::bigint, format('machine: %s + %s refused writes no event', c.state, c.action));
    ELSE
      PERFORM tests.is(v_events_after - v_events_before, 1::bigint, format('machine: %s + %s writes one event', c.state, c.action));
    END IF;
  END LOOP;
  PERFORM tests.reset_role();
END
$$;

-- ------------------------------------------------------------ one document's life (FD4)

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
INSERT INTO ids SELECT 'doc:sms', (public.fleet_document_create(pg_temp.id('type:manual'), '  Safety Management Manual ', '  The company SMS  ')).id;
SELECT tests.results_eq(
  $q$SELECT title, description, status, target_mode, ack_required, ack_due_days, current_version_id IS NULL FROM public.fleet_documents WHERE id = pg_temp.id('doc:sms')$q$,
  $q$VALUES ('Safety Management Manual'::text, 'The company SMS'::text, 'draft'::text, 'selected'::text, true, 14, true)$q$,
  'create: a trimmed draft with the type''s acknowledgement defaults, selected mode, no version');
INSERT INTO ids SELECT 'doc:policy', (public.fleet_document_create(pg_temp.id('type:policy'), 'Drug and alcohol policy', '', NULL, 7)).id;
SELECT tests.results_eq($q$SELECT description IS NULL, ack_required, ack_due_days FROM public.fleet_documents WHERE id = pg_temp.id('doc:policy')$q$,
                        $q$VALUES (true, false, 7)$q$, 'create: a blank description is none; the type''s ack default and an override');
SELECT tests.throws_like($q$SELECT public.fleet_document_create(pg_temp.id('type:manual'), '  ')$q$, '22023', 'title_required', 'create: a blank title is refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_create(pg_temp.id('type:manual'), %L)$q$, repeat('t', 161)), '22023', 'title_too_long', 'create: 161 characters refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_create(pg_temp.id('type:manual'), 'Long', %L)$q$, repeat('d', 2001)), '22023', 'description_too_long', 'create: a 2001-character description refused');
SELECT tests.throws_like($q$SELECT public.fleet_document_create(gen_random_uuid(), 'No type')$q$, 'P0002', 'type_not_found', 'create: an unknown type');

-- Publish guards on a draft without a version or targets.
SELECT tests.reset_role();
SELECT pg_temp.file_for(pg_temp.id('doc:sms'), 'sms-1') AS f1, pg_temp.file_for(pg_temp.id('doc:sms'), 'sms-2') AS f2,
       pg_temp.file_for(pg_temp.id('doc:sms'), 'sms-3') AS f3, pg_temp.file_for(pg_temp.id('doc:policy'), 'policy-1') AS fp,
       pg_temp.file_for(pg_temp.id('doc:sms'), 'sms-removed') AS frm, pg_temp.file_for(pg_temp.id('doc:sms'), 'sms-other-entity', 'A', 'form_template') AS fent,
       pg_temp.file_for(tests.id('B:doc'), 'b-file', 'B') AS fb \gset
UPDATE public.file_objects SET removed_at = now() WHERE id = :'frm';
SELECT tests.as_user(tests.user_id('A.fleet_manager'));

SELECT tests.throws_like(format($q$SELECT public.fleet_document_add_version(%L, %L)$q$, pg_temp.id('doc:sms'), :'fb'), 'P0002', 'file_not_found', 'version: another company''s file is not found');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_add_version(%L, %L)$q$, pg_temp.id('doc:sms'), :'frm'), '22023', 'file_removed', 'version: a removed file is refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_add_version(%L, %L)$q$, pg_temp.id('doc:sms'), :'fent'), '22023', 'file_not_for_document', 'version: a file stored for another entity type is refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_add_version(%L, %L)$q$, pg_temp.id('doc:sms'), :'fp'), '22023', 'file_not_for_document', 'version: a file of another document is refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_add_version(%L, %L, %L)$q$, pg_temp.id('doc:sms'), :'f1', repeat('l', 41)), '22023', 'version_label_too_long', 'version: a 41-character label refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_add_version(%L, %L, NULL, NULL, NULL, %L)$q$, pg_temp.id('doc:sms'), :'f1', repeat('s', 1001)), '22023', 'change_summary_too_long', 'version: a 1001-character summary refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_add_version(%L, %L, NULL, 'patch')$q$, pg_temp.id('doc:sms'), :'f1'), '22023', 'invalid_version_kind', 'version: an unknown kind refused');

INSERT INTO ids SELECT 'ver:sms1', (public.fleet_document_add_version(pg_temp.id('doc:sms'), :'f1', NULL, NULL, date '2026-11-20', 'First issue')).id;
SELECT tests.results_eq(
  $q$SELECT version_no, version_label, version_kind, effective_date, state, file_name, size_bytes, change_summary FROM public.fleet_document_versions WHERE id = pg_temp.id('ver:sms1')$q$,
  $q$VALUES (1, 'v1'::text, 'major'::text, date '2026-11-20', 'draft'::text, 'sms-1.pdf'::text, 1024::bigint, 'First issue'::text)$q$,
  'version: number 1, label v1, the type''s kind, the date, the file''s name and size copied');
SELECT tests.is((SELECT storage_path FROM public.fleet_document_versions WHERE id = pg_temp.id('ver:sms1')),
                (SELECT storage_path FROM public.file_objects WHERE id = :'f1'), 'version: the storage path copied for crew');
-- A second add while a draft exists replaces the draft.
SELECT tests.is((public.fleet_document_add_version(pg_temp.id('doc:sms'), :'f2', 'Issue 1', NULL, date '2026-11-21')).id, pg_temp.id('ver:sms1'),
                'version: adding while a draft exists replaces that draft');
SELECT tests.results_eq($q$SELECT version_no, version_label, file_object_id, change_summary IS NULL FROM public.fleet_document_versions WHERE document_id = pg_temp.id('doc:sms')$q$,
                        format($q$VALUES (1, 'Issue 1'::text, %L::uuid, true)$q$, :'f2'), 'version: one draft, its file and label replaced');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_events WHERE document_id = pg_temp.id('doc:sms') AND action IN ('version_added', 'version_replaced')), 2::bigint,
                'version: one event for the add and one for the replace');

SELECT tests.throws_like(format($q$SELECT public.fleet_document_publish(%L, %L, %L)$q$, pg_temp.id('doc:sms'), pg_temp.id('ver:sms1'), (SELECT updated_at FROM public.fleet_documents WHERE id = pg_temp.id('doc:sms'))),
                         '22023', 'targets_required', 'publish: a selected document without targets is refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_set_targets(%L, 'selected', '{}'::uuid[])$q$, pg_temp.id('doc:sms')), '22023', 'targets_required', 'targets: selected with no vessel refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_set_targets(%L, 'selected', ARRAY[%L]::uuid[])$q$, pg_temp.id('doc:sms'), tests.vessel_id('B.lev')),
                         '42501', 'vessel_out_of_reach', 'targets: another company''s vessel refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_set_targets(%L, 'selected', ARRAY[%L]::uuid[])$q$, pg_temp.id('doc:sms'), tests.vessel_id('A.arc')),
                         '22023', 'vessel_archived', 'targets: a sold vessel refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_set_targets(%L, 'all_including_future', ARRAY[%L]::uuid[])$q$, pg_temp.id('doc:sms'), tests.vessel_id('A.dra')),
                         '22023', 'vessels_not_expected', 'targets: all vessels with a list refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_set_targets(%L, 'some')$q$, pg_temp.id('doc:sms')), '22023', 'invalid_target_mode', 'targets: an unknown mode refused');
SELECT tests.is((public.fleet_document_set_targets(pg_temp.id('doc:sms'), 'selected', ARRAY[tests.vessel_id('A.dra'), tests.vessel_id('A.unc'), NULL, tests.vessel_id('A.dra')])).target_mode,
                'selected', 'targets: DRAAK and the uncounted vessel (duplicates and NULLs ignored)');
SELECT tests.results_eq($q$SELECT v.name FROM public.fleet_document_vessel_targets AS t JOIN public.vessels AS v ON v.id = t.vessel_id WHERE t.document_id = pg_temp.id('doc:sms') ORDER BY v.name$q$,
                        $q$VALUES ('M/Y DRAAK'::text), ('UNCOUNTED'::text)$q$, 'targets: two rows');
SELECT tests.lives(format($q$SELECT public.fleet_document_set_targets(%L, 'selected', ARRAY[%L, %L]::uuid[])$q$, pg_temp.id('doc:sms'), tests.vessel_id('A.unc'), tests.vessel_id('A.dra')),
                   'targets: the same set again');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_events WHERE document_id = pg_temp.id('doc:sms') AND action = 'targets_set'), 1::bigint, 'targets: an unchanged set writes no event');

-- Stale and file guards, then the first publish.
SELECT tests.throws_like(format($q$SELECT public.fleet_document_publish(%L, %L, NULL)$q$, pg_temp.id('doc:sms'), pg_temp.id('ver:sms1')), '22023', 'expected_updated_at_required', 'publish: the last seen updated_at is required');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_publish(%L, %L, %L)$q$, pg_temp.id('doc:sms'), pg_temp.id('ver:sms1'), now() - interval '1 hour'),
                         '22023', 'stale_document', 'publish: a stale updated_at is refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_publish(%L, %L, %L)$q$, pg_temp.id('doc:sms'), gen_random_uuid(), (SELECT updated_at FROM public.fleet_documents WHERE id = pg_temp.id('doc:sms'))),
                         'P0002', 'version_not_found', 'publish: an unknown version');
SELECT tests.reset_role();
UPDATE public.file_objects SET removed_at = now() WHERE id = :'f2';
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format($q$SELECT public.fleet_document_publish(%L, %L, %L)$q$, pg_temp.id('doc:sms'), pg_temp.id('ver:sms1'), (SELECT updated_at FROM public.fleet_documents WHERE id = pg_temp.id('doc:sms'))),
                         '22023', 'file_missing', 'publish: a removed file is refused');
SELECT tests.reset_role();
UPDATE public.file_objects SET removed_at = NULL WHERE id = :'f2';
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
INSERT INTO ids SELECT 'pub:sms1', (public.fleet_document_publish(pg_temp.id('doc:sms'), pg_temp.id('ver:sms1'), (SELECT updated_at FROM public.fleet_documents WHERE id = pg_temp.id('doc:sms')))).current_version_id;
SELECT tests.results_eq($q$SELECT status, current_version_id FROM public.fleet_documents WHERE id = pg_temp.id('doc:sms')$q$,
                        format($q$VALUES ('published'::text, %L::uuid)$q$, pg_temp.id('ver:sms1')),
                        'publish: published with version 1 current');
SELECT tests.is(pg_temp.id('pub:sms1'), pg_temp.id('ver:sms1'), 'publish: the returned row names the current version');
SELECT tests.is((SELECT payload ->> 'ack_effect' FROM public.fleet_document_events WHERE document_id = pg_temp.id('doc:sms') AND action = 'published'), 'fresh', 'publish: the first version needs fresh acknowledgements');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_publish(%L, %L, %L)$q$, pg_temp.id('doc:sms'), pg_temp.id('ver:sms1'), (SELECT updated_at FROM public.fleet_documents WHERE id = pg_temp.id('doc:sms'))),
                         '22023', 'version_already_published', 'publish: the published version again is refused');

-- Version 2 (minor) supersedes version 1; version 3 (major) supersedes version 2.
SELECT tests.throws_like(format($q$SELECT public.fleet_document_add_version(%L, %L)$q$, pg_temp.id('doc:sms'), :'f2'), '22023', 'file_in_use', 'version: a file another version uses is refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_add_version(%L, %L, 'issue 1')$q$, pg_temp.id('doc:sms'), :'f3'), '22023', 'version_label_taken', 'version: a label the document already has (any case) is refused');
INSERT INTO ids SELECT 'ver:sms2', (public.fleet_document_add_version(pg_temp.id('doc:sms'), :'f3', NULL, 'minor')).id;
SELECT tests.results_eq($q$SELECT version_no, version_label, version_kind, state FROM public.fleet_document_versions WHERE id = pg_temp.id('ver:sms2')$q$,
                        $q$VALUES (2, 'v2'::text, 'minor'::text, 'draft'::text)$q$, 'version: number 2 labelled v2, minor, a draft beside the published one');
SELECT tests.lives(format($q$SELECT public.fleet_document_publish(%L, %L, %L)$q$, pg_temp.id('doc:sms'), pg_temp.id('ver:sms2'), (SELECT updated_at FROM public.fleet_documents WHERE id = pg_temp.id('doc:sms'))),
                   'publish: version 2');
SELECT tests.results_eq($q$SELECT version_no, state, superseded_at IS NOT NULL FROM public.fleet_document_versions WHERE document_id = pg_temp.id('doc:sms') ORDER BY version_no$q$,
                        $q$VALUES (1, 'superseded'::text, true), (2, 'published'::text, false)$q$, 'publish: version 1 superseded, version 2 published');
SELECT tests.is((SELECT payload ->> 'ack_effect' FROM public.fleet_document_events WHERE document_id = pg_temp.id('doc:sms') AND action = 'published' AND version_id = pg_temp.id('ver:sms2')),
                'carry_forward', 'publish: a minor version carries acknowledgements forward');
SELECT tests.is((SELECT payload ->> 'superseded_version_id' FROM public.fleet_document_events WHERE version_id = pg_temp.id('ver:sms2') AND action = 'published'),
                pg_temp.id('ver:sms1')::text, 'publish: the event names the superseded version');
SELECT tests.reset_role();
SELECT pg_temp.file_for(pg_temp.id('doc:sms'), 'sms-4') AS f4 \gset
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
INSERT INTO ids SELECT 'ver:sms3', (public.fleet_document_add_version(pg_temp.id('doc:sms'), :'f4', 'Rev 3', 'major')).id;
SELECT tests.throws_like(format($q$SELECT public.fleet_document_publish(%L, %L, %L)$q$, pg_temp.id('doc:sms'), pg_temp.id('ver:sms1'), (SELECT updated_at FROM public.fleet_documents WHERE id = pg_temp.id('doc:sms'))),
                         '22023', 'version_superseded', 'publish: a superseded version is refused');
SELECT tests.lives(format($q$SELECT public.fleet_document_publish(%L, %L, %L)$q$, pg_temp.id('doc:sms'), pg_temp.id('ver:sms3'), (SELECT updated_at FROM public.fleet_documents WHERE id = pg_temp.id('doc:sms'))),
                   'publish: version 3');
SELECT tests.is((SELECT payload ->> 'ack_effect' FROM public.fleet_document_events WHERE version_id = pg_temp.id('ver:sms3') AND action = 'published'), 'reset', 'publish: a major version resets acknowledgements');
SELECT tests.results_eq($q$SELECT state, count(*) FROM public.fleet_document_versions WHERE document_id = pg_temp.id('doc:sms') GROUP BY state ORDER BY state$q$,
                        $q$VALUES ('published'::text, 1::bigint), ('superseded'::text, 2::bigint)$q$, 'publish: one published, two superseded');
-- The policy document needs no acknowledgement: 'none'.
SELECT tests.lives(format($q$SELECT public.fleet_document_add_version(%L, %L)$q$, pg_temp.id('doc:policy'), :'fp'), 'policy: a version');
SELECT tests.lives(format($q$SELECT public.fleet_document_set_targets(%L, 'all_including_future')$q$, pg_temp.id('doc:policy')), 'policy: all vessels including future ones');
SELECT tests.lives(format($q$SELECT public.fleet_document_publish(%L, (SELECT id FROM public.fleet_document_versions WHERE document_id = %L), %L)$q$,
                          pg_temp.id('doc:policy'), pg_temp.id('doc:policy'), (SELECT updated_at FROM public.fleet_documents WHERE id = pg_temp.id('doc:policy'))),
                   'policy: published to all vessels with no targets');
SELECT tests.is((SELECT payload ->> 'ack_effect' FROM public.fleet_document_events WHERE document_id = pg_temp.id('doc:policy') AND action = 'published'), 'none', 'publish: no acknowledgement needed: none');
SELECT tests.is((SELECT (payload ->> 'version_kind') FROM public.fleet_document_events WHERE document_id = pg_temp.id('doc:policy') AND action = 'published'), 'minor', 'version: the type''s minor default applied');

-- Details of a published document; a stale edit.
SELECT tests.throws_like(format($q$SELECT public.fleet_document_update(%L, %L, NULL, 'Late')$q$, pg_temp.id('doc:sms'), now() - interval '1 day'), '22023', 'stale_document', 'update: a stale updated_at is refused');
SELECT tests.is((public.fleet_document_update(pg_temp.id('doc:sms'), (SELECT updated_at FROM public.fleet_documents WHERE id = pg_temp.id('doc:sms')), NULL, NULL, '')).description, NULL::text,
                'update: '''' clears the description of a published document');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_update(%L, %L, %L)$q$, pg_temp.id('doc:sms'), (SELECT updated_at FROM public.fleet_documents WHERE id = pg_temp.id('doc:sms')), gen_random_uuid()),
                         'P0002', 'type_not_found', 'update: an unknown type');

-- A draft to keep (for the visibility checks) and one to delete with its files.
INSERT INTO ids SELECT 'doc:draft', (public.fleet_document_create(pg_temp.id('type:procedure'), 'Draft procedure')).id;
SELECT tests.lives(format($q$SELECT public.fleet_document_set_targets(%L, 'selected', ARRAY[%L]::uuid[])$q$, pg_temp.id('doc:draft'), tests.vessel_id('A.dra')), 'draft: targets DRAAK');
INSERT INTO ids SELECT 'doc:gone', (public.fleet_document_create(pg_temp.id('type:procedure'), 'Mistake')).id;
SELECT tests.reset_role();
SELECT pg_temp.file_for(pg_temp.id('doc:draft'), 'draft-1') AS fd1, pg_temp.file_for(pg_temp.id('doc:gone'), 'gone-1') AS fg1 \gset
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format($q$SELECT public.fleet_document_add_version(%L, %L)$q$, pg_temp.id('doc:draft'), :'fd1'), 'draft: a version');
SELECT tests.lives(format($q$SELECT public.fleet_document_add_version(%L, %L)$q$, pg_temp.id('doc:gone'), :'fg1'), 'gone: a version');
SELECT tests.lives(format($q$SELECT public.fleet_document_set_targets(%L, 'selected', ARRAY[%L]::uuid[])$q$, pg_temp.id('doc:gone'), tests.vessel_id('A.dra')), 'gone: targets');
SELECT tests.is((public.fleet_document_delete_draft(pg_temp.id('doc:gone'))).id, pg_temp.id('doc:gone'), 'delete: a never-published draft is deleted (row returned)');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.fleet_documents WHERE id = pg_temp.id('doc:gone'))
                + (SELECT count(*) FROM public.fleet_document_versions WHERE document_id = pg_temp.id('doc:gone'))
                + (SELECT count(*) FROM public.fleet_document_vessel_targets WHERE document_id = pg_temp.id('doc:gone')), 0::bigint,
                'delete: the document, its version and targets are gone');
SELECT tests.results_eq(format($q$SELECT removed_at IS NOT NULL, removal_reason FROM public.file_objects WHERE id = %L$q$, :'fg1'),
                        $q$VALUES (true, 'draft_deleted'::text)$q$, 'delete: its file is soft-removed');
SELECT tests.results_eq($q$SELECT action, to_status FROM public.fleet_document_events WHERE document_id = pg_temp.id('doc:gone') ORDER BY created_at, action$q$,
                        $q$SELECT * FROM (VALUES ('document_created'::text, 'draft'::text), ('draft_deleted'::text, NULL::text), ('targets_set'::text, 'draft'::text), ('version_added'::text, 'draft'::text)) AS x(a, b) ORDER BY 1$q$,
                        'delete: the history stays');

-- Withdraw rules.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
INSERT INTO ids SELECT 'doc:wd', (public.fleet_document_create(pg_temp.id('type:procedure'), 'Old procedure')).id;
SELECT tests.reset_role();
SELECT pg_temp.file_for(pg_temp.id('doc:wd'), 'wd-1') AS fw1 \gset
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format($q$SELECT public.fleet_document_add_version(%L, %L)$q$, pg_temp.id('doc:wd'), :'fw1'), 'withdraw: a version');
SELECT tests.lives(format($q$SELECT public.fleet_document_set_targets(%L, 'selected', ARRAY[%L, %L]::uuid[])$q$, pg_temp.id('doc:wd'), tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')), 'withdraw: targets');
SELECT tests.lives(format($q$SELECT public.fleet_document_publish(%L, (SELECT id FROM public.fleet_document_versions WHERE document_id = %L), %L)$q$,
                          pg_temp.id('doc:wd'), pg_temp.id('doc:wd'), (SELECT updated_at FROM public.fleet_documents WHERE id = pg_temp.id('doc:wd'))),
                   'withdraw: published first');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_withdraw(%L, '   ')$q$, pg_temp.id('doc:wd')), '22023', 'reason_required', 'withdraw: a blank reason is refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_withdraw(%L, %L)$q$, pg_temp.id('doc:wd'), repeat('r', 501)), '22023', 'reason_too_long', 'withdraw: 501 characters refused');
INSERT INTO ids SELECT 'wd:returned', (public.fleet_document_withdraw(pg_temp.id('doc:wd'), '  Superseded by the new procedure ')).id;
SELECT tests.is(pg_temp.id('wd:returned'), pg_temp.id('doc:wd'), 'withdraw: the document row is returned');
SELECT tests.results_eq($q$SELECT status, withdrawn_reason, withdrawn_at IS NOT NULL FROM public.fleet_documents WHERE id = pg_temp.id('doc:wd')$q$,
                        $q$VALUES ('withdrawn'::text, 'Superseded by the new procedure'::text, true)$q$, 'withdraw: withdrawn with the trimmed reason');
SELECT tests.is((SELECT comment FROM public.fleet_document_events WHERE document_id = pg_temp.id('doc:wd') AND action = 'withdrawn'), 'Superseded by the new procedure', 'withdraw: the reason is the event comment');

-- ------------------------------------------------------------ taxonomy delete rules

SELECT tests.throws_like(format($q$SELECT public.fleet_document_type_delete(%L)$q$, pg_temp.id('type:manual')), '22023', 'type_in_use', 'type delete: a type holding documents is refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_type_delete(%L)$q$, pg_temp.id('type:procedure')), '22023', 'type_in_use', 'type delete: a type holding only a withdrawn document is refused too');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_section_delete(%L)$q$, pg_temp.id('sec:safety')), '22023', 'section_in_use', 'section delete: a section whose types hold documents is refused');
SELECT tests.is((public.fleet_document_type_delete(pg_temp.id('type:empty'))).name, 'Unused type', 'type delete: an empty type is deleted');
SELECT tests.is((public.fleet_document_section_delete(pg_temp.id('sec:empty'))).name, 'Empty section', 'section delete: a section with only empty types is deleted');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_types WHERE id = pg_temp.id('type:in_empty')), 0::bigint, 'section delete: its empty types go with it');
SELECT tests.is((SELECT (payload ->> 'types_deleted')::integer FROM public.fleet_document_events WHERE action = 'section_deleted'), 1, 'section delete: the event counts the types');
SELECT tests.throws_like($q$SELECT public.fleet_document_type_delete(gen_random_uuid())$q$, 'P0002', 'type_not_found', 'type delete: an unknown id');

-- The editor (edit, not admin) cannot delete; the viewer cannot write; the vessel admin has no fleet reach.
SELECT tests.as_user(tests.user_id('A.doc_editor'));
INSERT INTO ids SELECT 'type:editor', (public.fleet_document_type_save(NULL, pg_temp.id('sec:ops'), 'Editor type')).id;
SELECT tests.throws_like(format($q$SELECT public.fleet_document_type_delete(%L)$q$, pg_temp.id('type:editor')), '42501', 'not_permitted', 'editor: deleting a type needs admin');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_section_delete(%L)$q$, pg_temp.id('sec:ops')), '42501', 'not_permitted', 'editor: deleting a section needs admin');
SELECT tests.lives(format($q$SELECT public.fleet_document_create(%L, 'Editor document')$q$, pg_temp.id('type:editor')), 'editor: creates documents');
SELECT tests.as_user(tests.user_id('A.doc_viewer'));
SELECT tests.throws_like(format($q$SELECT public.fleet_document_create(%L, 'Viewer document')$q$, pg_temp.id('type:editor')), '42501', 'not_permitted', 'viewer: cannot create');
SELECT tests.throws_like($q$SELECT public.fleet_document_section_save(NULL, 'Viewer section')$q$, '42501', 'not_permitted', 'viewer: cannot add a section');
SELECT tests.as_user(tests.user_id('A.vessel_docs'));
SELECT tests.throws_like($q$SELECT public.fleet_document_section_save(NULL, 'Vessel section')$q$, '42501', 'not_permitted', 'vessel admin without fleet reach: cannot add a section');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_set_targets(%L, 'all_including_future')$q$, pg_temp.id('doc:draft')), '42501', 'not_permitted', 'vessel admin without fleet reach: cannot target');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws_like($q$SELECT public.fleet_document_section_save(NULL, 'Disabled section')$q$, '42501', 'not_permitted', 'inactive: refused');

-- Cross-tenant: company B's administrator acts on nothing of A.
SELECT tests.as_user(tests.user_id('B.admin'));
INSERT INTO ids SELECT 'B:sec', (public.fleet_document_section_save(NULL, 'Safety management')).id;
SELECT tests.ok(pg_temp.id('B:sec') IS NOT NULL, 'company B: its own section of the same name');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_section_save(%L, 'Taken over')$q$, pg_temp.id('sec:safety')), 'P0002', 'section_not_found', 'company B: A''s section is not found');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_type_save(NULL, %L, 'Foreign')$q$, pg_temp.id('sec:safety')), 'P0002', 'section_not_found', 'company B: cannot add a type to A''s section');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_create(%L, 'Foreign')$q$, pg_temp.id('type:manual')), 'P0002', 'type_not_found', 'company B: cannot create in A''s type');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_withdraw(%L, 'Foreign')$q$, pg_temp.id('doc:sms')), 'P0002', 'document_not_found', 'company B: cannot withdraw A''s document');
SELECT tests.throws_like(format($q$SELECT public.fleet_document_delete_draft(%L)$q$, pg_temp.id('doc:draft')), 'P0002', 'document_not_found', 'company B: cannot delete A''s draft');
SELECT tests.throws_like(format($q$SELECT * FROM public.fleet_document_sections_reorder(ARRAY[%L, %L]::uuid[])$q$, pg_temp.id('B:sec'), pg_temp.id('sec:safety')),
                         '22023', 'reorder_mismatch', 'company B: A''s section in a reorder is refused');
SELECT tests.is((SELECT count(*) FROM public.fleet_documents), 0::bigint, 'company B: reads no document of A');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_sections), 1::bigint, 'company B: reads only its own section');
SELECT tests.reset_role();

-- ------------------------------------------------------------ visibility

-- Library state now: doc:sms published v3 to DRAAK + UNCOUNTED; doc:policy
-- published to all vessels including future ones; doc:wd withdrawn
-- (DRAAK, HYDRA); the machine documents
-- (DRAAK; the published and withdrawn ones published) and the editor's draft.
-- doc:draft is a draft targeting DRAAK.
CREATE TEMP TABLE vis (who text, k text) ON COMMIT DROP;
GRANT ALL ON vis TO PUBLIC;
DO $$
DECLARE p text;
BEGIN
  FOR p IN SELECT unnest(ARRAY['A.fleet_manager', 'A.doc_editor', 'A.doc_viewer', 'A.vessel_docs', 'A.master_dra', 'A.crew_hyd', 'A.crew_gam', 'A.crew_unc', 'A.disabled', 'B.admin']) LOOP
    PERFORM tests.as_user(tests.user_id(p));
    INSERT INTO vis SELECT p, i.k FROM public.fleet_documents AS d JOIN ids AS i ON i.id = d.id WHERE i.k IN ('doc:sms', 'doc:policy', 'doc:wd', 'doc:draft');
  END LOOP;
  PERFORM tests.reset_role();
END
$$;
SELECT tests.results_eq($q$SELECT k FROM vis WHERE who = 'A.fleet_manager' ORDER BY k$q$, $q$VALUES ('doc:draft'::text), ('doc:policy'), ('doc:sms'), ('doc:wd')$q$, 'visibility: the fleet manager reads every state');
SELECT tests.results_eq($q$SELECT k FROM vis WHERE who = 'A.doc_editor' ORDER BY k$q$, $q$VALUES ('doc:draft'::text), ('doc:policy'), ('doc:sms'), ('doc:wd')$q$, 'visibility: an editor reads drafts too');
SELECT tests.results_eq($q$SELECT k FROM vis WHERE who = 'A.doc_viewer' ORDER BY k$q$, $q$VALUES ('doc:policy'::text), ('doc:sms'), ('doc:wd')$q$, 'visibility: a reader sees published and withdrawn, never drafts');
SELECT tests.results_eq($q$SELECT k FROM vis WHERE who = 'A.master_dra' ORDER BY k$q$, $q$VALUES ('doc:policy'::text), ('doc:sms')$q$, 'visibility: DRAAK crew see what is published to DRAAK or to all vessels; not the withdrawn or the draft');
SELECT tests.results_eq($q$SELECT k FROM vis WHERE who = 'A.crew_hyd' ORDER BY k$q$, $q$VALUES ('doc:policy'::text)$q$, 'visibility: HYDRA crew (untargeted by the manual; the withdrawn one gone) see the all-vessels policy only');
SELECT tests.results_eq($q$SELECT k FROM vis WHERE who = 'A.crew_gam' ORDER BY k$q$, $q$VALUES ('doc:policy'::text)$q$, 'visibility: GAME CHANGER crew see the all-vessels policy');
SELECT tests.results_eq($q$SELECT k FROM vis WHERE who = 'A.crew_unc' ORDER BY k$q$, $q$VALUES ('doc:sms'::text)$q$, 'visibility: the uncounted vessel''s crew see what targets it explicitly, not the all-vessels policy');
SELECT tests.results_eq($q$SELECT k FROM vis WHERE who = 'A.vessel_docs' ORDER BY k$q$, $q$VALUES ('doc:policy'::text), ('doc:sms')$q$,
                        'visibility: the vessel documents admin without fleet reach reads no library rows beyond what DRAAK crew see');
SELECT tests.is_empty($q$SELECT k FROM vis WHERE who IN ('A.disabled', 'B.admin')$q$, 'visibility: an inactive user and company B read nothing');

-- The vessel admin reads no draft, no withdrawn document, no target or event; DRAAK crew read the published version only.
SELECT tests.as_user(tests.user_id('A.vessel_docs'));
SELECT tests.is((SELECT count(*) FROM public.fleet_documents WHERE status <> 'published'), 0::bigint, 'vessel admin: no draft or withdrawn document of the library');
SELECT tests.is_empty($q$SELECT * FROM public.fleet_document_vessel_targets$q$, 'vessel admin: no targets');
SELECT tests.is_empty($q$SELECT * FROM public.fleet_document_events$q$, 'vessel admin: no history');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.results_eq($q$SELECT version_label, state FROM public.fleet_document_versions WHERE document_id = pg_temp.id('doc:sms')$q$,
                        $q$VALUES ('Rev 3'::text, 'published'::text)$q$, 'crew: the published version only, never the superseded ones');
SELECT tests.is_empty($q$SELECT * FROM public.fleet_document_versions WHERE state <> 'published'$q$, 'crew: no draft or superseded version anywhere');
SELECT tests.is_empty($q$SELECT * FROM public.fleet_document_vessel_targets$q$, 'crew: no targets');
SELECT tests.is_empty($q$SELECT * FROM public.fleet_document_events$q$, 'crew: no history');
SELECT tests.ok((SELECT count(*) FROM public.fleet_document_sections) >= 2 AND (SELECT count(*) FROM public.fleet_document_types) >= 2, 'crew: the taxonomy is readable (grouping)');
SELECT tests.is(public.fleet_document_visible(tests.user_id('A.crew_hyd'), pg_temp.id('doc:policy')), false, 'visible(): a signed-in caller cannot ask about another person');
SELECT tests.is(public.fleet_document_visible(tests.user_id('A.master_dra'), pg_temp.id('doc:sms')), true, 'visible(): about oneself');
SELECT tests.as_user(tests.user_id('A.doc_viewer'));
SELECT tests.is((SELECT count(*) FROM public.fleet_document_versions WHERE state = 'draft'), 0::bigint, 'reader: no draft version (not even of a published document)');
SELECT tests.ok((SELECT count(*) FROM public.fleet_document_versions WHERE state = 'superseded') >= 2, 'reader: superseded versions (history)');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_vessel_targets WHERE document_id = pg_temp.id('doc:draft')), 0::bigint, 'reader: no targets of a draft');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_events WHERE document_id = pg_temp.id('doc:draft')), 0::bigint, 'reader: no history of a draft');
SELECT tests.ok((SELECT count(*) FROM public.fleet_document_events WHERE document_id = pg_temp.id('doc:sms')) > 0
                AND (SELECT count(*) FROM public.fleet_document_events WHERE document_id IS NULL) > 0, 'reader: the history of published documents and of the taxonomy');
SELECT tests.as_user(tests.user_id('A.doc_editor'));
SELECT tests.ok((SELECT count(*) FROM public.fleet_document_events WHERE document_id = pg_temp.id('doc:draft')) > 0, 'editor: the history of a draft');
SELECT tests.is((SELECT count(*) FROM public.fleet_document_vessel_targets WHERE document_id = pg_temp.id('doc:draft')), 1::bigint, 'editor: the targets of a draft');
SELECT tests.ok((SELECT count(*) FROM public.fleet_document_versions WHERE state = 'draft') > 0, 'editor: draft versions');

-- A vessel added after publishing (all including future): its crew see the policy.
SELECT tests.reset_role();
SELECT tests.seed_vessel('A', 'A.new', 'NEWBUILD', 'Active');
SELECT tests.seed_user('A', 'A.crew_new', 'crew');
SELECT tests.seed_assignment('A.crew_new', 'A.new', true, 'Deckhand');
SELECT tests.as_user(tests.user_id('A.crew_new'));
SELECT tests.results_eq($q$SELECT title FROM public.fleet_documents$q$, $q$VALUES ('Drug and alcohol policy'::text)$q$, 'visibility: a vessel added after publishing gets the all-vessels document');
SELECT tests.reset_role();

-- A vessel sold after targeting no longer opens the document to its crew.
UPDATE public.vessels SET status = 'Sold' WHERE id = tests.vessel_id('A.unc');
SELECT tests.as_user(tests.user_id('A.crew_unc'));
SELECT tests.is_empty($q$SELECT * FROM public.fleet_documents$q$, 'visibility: a sold vessel''s crew see nothing');
SELECT tests.reset_role();
UPDATE public.vessels SET status = 'Active' WHERE id = tests.vessel_id('A.unc');

-- ------------------------------------------------------------ direct writes (every role)

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.denied(format($q$INSERT INTO public.fleet_document_sections (company_id, name) VALUES (%L, 'Direct')$q$, tests.company_id('A')), 'authenticated: no section insert');
SELECT tests.denied(format($q$UPDATE public.fleet_documents SET status = 'withdrawn' WHERE id = %L$q$, pg_temp.id('doc:sms')), 'authenticated: no status update');
SELECT tests.denied(format($q$DELETE FROM public.fleet_documents WHERE id = %L$q$, pg_temp.id('doc:draft')), 'authenticated: no delete, even of a draft');
SELECT tests.denied(format($q$INSERT INTO public.fleet_document_vessel_targets (document_id, vessel_id, company_id) VALUES (%L, %L, %L)$q$, pg_temp.id('doc:sms'), tests.vessel_id('A.hyd'), tests.company_id('A')),
                    'authenticated: no target insert');
SELECT tests.denied($q$UPDATE public.fleet_document_versions SET state = 'published' WHERE state = 'draft'$q$, 'authenticated: no version state update');
SELECT tests.denied($q$DELETE FROM public.fleet_document_events$q$, 'authenticated: no event delete');
SELECT tests.denied(format($q$INSERT INTO public.fleet_document_events (company_id, action, payload) VALUES (%L, 'section_created', '{}')$q$, tests.company_id('A')), 'authenticated: no event insert');
SELECT tests.as_anon();
SELECT tests.denied($q$SELECT * FROM public.fleet_documents$q$, 'anon: reads no document');
SELECT tests.denied($q$SELECT * FROM public.fleet_document_sections$q$, 'anon: reads no section');
SELECT tests.throws($q$SELECT public.fleet_document_section_save(NULL, 'Anon')$q$, '42501', 'anon: cannot call a definer');

-- The service role and the owner (superuser) bypass RLS; the guards still hold.
DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT unnest(ARRAY['service', 'owner']) LOOP
    IF r = 'service' THEN PERFORM tests.as_service(); ELSE PERFORM tests.reset_role(); END IF;
    PERFORM tests.throws_like(format($q$INSERT INTO public.fleet_documents (company_id, type_id, title, status) VALUES (%L, %L, 'Direct', 'published')$q$, tests.company_id('A'), pg_temp.id('type:manual')),
                              '42501', 'fleet_documents_guarded', r || ': an insert with a non-initial status is refused');
    PERFORM tests.throws_like(format($q$UPDATE public.fleet_documents SET status = 'withdrawn' WHERE id = %L$q$, pg_temp.id('doc:sms')),
                              '42501', 'fleet_documents_guarded', r || ': a status update is refused');
    PERFORM tests.throws_like(format($q$UPDATE public.fleet_documents SET title = 'Edited in place' WHERE id = %L$q$, pg_temp.id('doc:sms')),
                              '42501', 'fleet_documents_guarded', r || ': a content change of a published document is refused');
    PERFORM tests.throws_like(format($q$DELETE FROM public.fleet_documents WHERE id = %L$q$, pg_temp.id('doc:sms')),
                              '42501', 'fleet_documents_guarded', r || ': deleting a published document is refused');
    PERFORM tests.throws_like(format($q$UPDATE public.fleet_documents SET current_version_id = NULL WHERE id = %L$q$, pg_temp.id('doc:wd')),
                              '42501', 'fleet_documents_guarded', r || ': moving the current version is refused');
    PERFORM tests.throws_like($q$UPDATE public.fleet_document_versions SET state = 'published', published_at = now() WHERE state = 'draft'$q$,
                              '42501', 'fleet_document_versions_guarded', r || ': a version state update is refused');
    PERFORM tests.throws_like(format($q$UPDATE public.fleet_document_versions SET version_label = 'Edited' WHERE id = %L$q$, pg_temp.id('ver:sms3')),
                              '42501', 'fleet_document_versions_guarded', r || ': a published version is read-only');
    PERFORM tests.throws_like(format($q$DELETE FROM public.fleet_document_versions WHERE id = %L$q$, pg_temp.id('ver:sms1')),
                              '42501', 'fleet_document_versions_guarded', r || ': a superseded version is kept');
    PERFORM tests.throws_like(format($q$INSERT INTO public.fleet_document_vessel_targets (document_id, vessel_id, company_id) VALUES (%L, %L, %L)$q$, pg_temp.id('doc:sms'), tests.vessel_id('A.hyd'), tests.company_id('A')),
                              '42501', 'fleet_document_vessel_targets_guarded', r || ': a target insert is refused');
    PERFORM tests.throws_like(format($q$DELETE FROM public.fleet_document_vessel_targets WHERE document_id = %L$q$, pg_temp.id('doc:sms')),
                              '42501', 'fleet_document_vessel_targets_guarded', r || ': a target delete is refused');
    PERFORM tests.throws_like(format($q$INSERT INTO public.fleet_document_events (company_id, action, payload) VALUES (%L, 'section_created', '{}')$q$, tests.company_id('A')),
                              '42501', 'fleet_document_events_guarded', r || ': an event insert is refused');
    PERFORM tests.throws_like($q$UPDATE public.fleet_document_events SET comment = 'rewritten'$q$, '42501', 'fleet_document_events_guarded', r || ': events are never updated');
    PERFORM tests.throws_like($q$DELETE FROM public.fleet_document_events$q$, '42501', 'fleet_document_events_guarded', r || ': events are never deleted');
  END LOOP;
  PERFORM tests.reset_role();
END
$$;
-- A foreign vessel or a misplaced file never gets in, even inside the definers' flag.
SELECT set_config('storm.fleet_tx', 'on', true);
SELECT tests.throws_like(format($q$INSERT INTO public.fleet_document_vessel_targets (document_id, vessel_id, company_id) VALUES (%L, %L, %L)$q$, pg_temp.id('doc:sms'), tests.vessel_id('B.lev'), tests.company_id('A')),
                         '42501', 'fleet_document_vessel_targets_guarded', 'guard: a target vessel of another company is refused even with the flag');
SELECT tests.throws_like(format($q$UPDATE public.fleet_document_versions SET file_object_id = %L WHERE id = (SELECT id FROM public.fleet_document_versions WHERE document_id = %L)$q$, :'fb', pg_temp.id('doc:draft')),
                         '42501', 'fleet_document_versions_guarded', 'guard: a file of another company is refused even with the flag');
SELECT set_config('storm.fleet_tx', '', true);

-- A referential cascade passes: deleting a vessel removes its target rows.
SELECT tests.seed_vessel('A', 'A.tmp', 'TEMPORARY', 'Active');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format($q$SELECT public.fleet_document_set_targets(%L, 'selected', ARRAY[%L, %L]::uuid[])$q$, pg_temp.id('doc:draft'), tests.vessel_id('A.dra'), tests.vessel_id('A.tmp')),
                   'cascade: the draft also targets a temporary vessel');
SELECT tests.as_service();
SELECT tests.lives(format($q$DELETE FROM public.vessels WHERE id = %L$q$, tests.vessel_id('A.tmp')), 'cascade: a vessel with targets can be deleted');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT vessel_id FROM public.fleet_document_vessel_targets WHERE document_id = %L$q$, pg_temp.id('doc:draft')),
                        format($q$VALUES (%L::uuid)$q$, tests.vessel_id('A.dra')), 'cascade: its target row went with it, the others stay');

-- ------------------------------------------------------------ grants

SELECT tests.ok(has_function_privilege('authenticated', p, 'EXECUTE') AND NOT has_function_privilege('anon', p, 'EXECUTE'), 'grant: authenticated may call ' || p)
FROM unnest(ARRAY[
  'public.fleet_document_section_save(uuid,text)', 'public.fleet_document_sections_reorder(uuid[])', 'public.fleet_document_section_delete(uuid)',
  'public.fleet_document_type_save(uuid,uuid,text,boolean,integer,text,boolean)', 'public.fleet_document_type_delete(uuid)',
  'public.fleet_document_create(uuid,text,text,boolean,integer)', 'public.fleet_document_update(uuid,timestamptz,uuid,text,text,boolean,integer)',
  'public.fleet_document_add_version(uuid,uuid,text,text,date,text)', 'public.fleet_document_set_targets(uuid,text,uuid[])',
  'public.fleet_document_publish(uuid,uuid,timestamptz)', 'public.fleet_document_withdraw(uuid,text)', 'public.fleet_document_delete_draft(uuid)',
  'public.fleet_document_visible(uuid,uuid)']) AS p;
SELECT tests.ok(NOT has_function_privilege('authenticated', p, 'EXECUTE') AND NOT has_function_privilege('anon', p, 'EXECUTE'), 'grant: internal ' || p)
FROM unnest(ARRAY['public.fleet_document_gate(text)', 'public.fleet_document_log(uuid,uuid,uuid,text,text,text,text,jsonb)',
                  'public.fleet_documents_guard()', 'public.fleet_document_versions_guard()', 'public.fleet_document_vessel_targets_guard()',
                  'public.fleet_document_events_guard()']) AS p;
SELECT tests.ok(has_table_privilege('authenticated', t, 'SELECT') AND NOT has_table_privilege('authenticated', t, 'INSERT')
                AND NOT has_table_privilege('authenticated', t, 'UPDATE') AND NOT has_table_privilege('authenticated', t, 'DELETE')
                AND NOT has_table_privilege('anon', t, 'SELECT'), 'grant: ' || t || ' is read-only for authenticated, nothing for anon')
FROM unnest(ARRAY['public.fleet_document_sections', 'public.fleet_document_types', 'public.fleet_documents', 'public.fleet_document_versions',
                  'public.fleet_document_vessel_targets', 'public.fleet_document_events']) AS t;
SELECT tests.ok((SELECT relrowsecurity FROM pg_class WHERE oid = t::regclass), 'rls: on for ' || t)
FROM unnest(ARRAY['public.fleet_document_sections', 'public.fleet_document_types', 'public.fleet_documents', 'public.fleet_document_versions',
                  'public.fleet_document_vessel_targets', 'public.fleet_document_events']) AS t;
SELECT tests.is_empty($q$SELECT policyname FROM pg_policies WHERE tablename LIKE 'fleet_document%' AND cmd <> 'SELECT'$q$, 'rls: no write policy on any library table');
