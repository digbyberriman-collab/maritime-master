-- Form and checklist templates by area (20261124040500_fleet_form_templates.sql;
-- gap/02 FC3, FC4, FC5, FC6, W2; DECISIONS C6, D-173; X5 spec §2 X5-06A,
-- D-X5-13, D-X5-20, D-X5-23): two companies; A's vessels DRAAK, HYDRA,
-- GAME CHANGER. Proves:
--   - every cell of the states x actions table of
--     src/modules/forms/lib/templateMachine.ts (copied between the
--     machine-table markers below and pinned by templateMachine.test.ts),
--     legal and illegal, through the definers, with one event row each;
--   - the publish blockers of lib/publishChecks.ts (the publish-cases
--     markers, pinned by publishChecks.test.ts), version labels, the stale
--     check and foreign targets;
--   - supersede (runs keep their version, settings carry over), new version
--     from published and archived, one draft per family, platform
--     templates are customised, customise codes and the copy hiding its
--     source on the same vessels;
--   - archive versus delete, with and without runs;
--   - per-vessel rights (fleet admin, the Master, a vessel checklist
--     editor, crew, another company, an inactive user), hide / restore /
--     reorder and their refusals;
--   - run statistics: runs of the family, next due by cadence (the
--     cadence-cases markers, pinned by cadence.test.ts), overdue, hidden,
--     what counts as a run, vessel and access refusals;
--   - the guard refuses non-draft inserts, status and content changes of
--     published rows and deletes for every role (a legacy Master, the
--     service role, the owner), and the audit trigger logs direct writes;
--   - events append-only, RLS (templates incl. superseded / archived for
--     crew, settings, events), the backfill mapping (the migration re-run
--     over legacy rows), the vessel_scope CHECK, grants.

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ world

-- A fleet checklist admin (RBAC ism admin, fleet-wide) and reader (ism view).
SELECT tests.seed_user('A', 'A.ck_admin', 'crew');
SELECT tests.seed_user('A', 'A.ck_viewer', 'crew');
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'shore', vessel_scope = 'all', fleet_access = true, source = 'admin'
WHERE user_id IN (tests.user_id('A.ck_admin'), tests.user_id('A.ck_viewer'));
SELECT tests.seed_role('x6a_ism_admin', 'fleet');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'ism', 'admin', 'fleet' FROM public.roles AS r WHERE r.name = 'x6a_ism_admin';
SELECT tests.seed_rbac_role('A.ck_admin', 'x6a_ism_admin');
SELECT tests.seed_role('x6a_ism_view', 'fleet');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'ism', 'view', 'fleet' FROM public.roles AS r WHERE r.name = 'x6a_ism_view';
SELECT tests.seed_rbac_role('A.ck_viewer', 'x6a_ism_view');

-- A vessel checklist editor on DRAAK (ism edit on the vessel, no fleet reach).
SELECT tests.seed_user('A', 'A.ck_editor_dra', 'crew');
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'shore', vessel_scope = 'assigned', fleet_access = false, source = 'admin'
WHERE user_id = tests.user_id('A.ck_editor_dra');
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT m.id, m.company_id, tests.vessel_id('A.dra') FROM public.account_memberships AS m WHERE m.user_id = tests.user_id('A.ck_editor_dra');
SELECT tests.seed_role('x6a_ism_vessel', 'vessel');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'ism', 'edit', 'vessel' FROM public.roles AS r WHERE r.name = 'x6a_ism_vessel';
SELECT tests.seed_rbac_role('A.ck_editor_dra', 'x6a_ism_vessel', 'A.dra');

-- An inactive legacy DPA.
SELECT tests.seed_user('A', 'A.dpa_off', 'dpa', 'disabled');

SELECT tests.ok(public.fleet_ops_can_for(tests.user_id('A.fleet_manager'), tests.company_id('A'), NULL, 'checklists', 'admin')
                AND public.fleet_ops_can_for(tests.user_id('A.ck_admin'), tests.company_id('A'), NULL, 'checklists', 'admin')
                AND NOT public.fleet_ops_can_for(tests.user_id('A.ck_viewer'), tests.company_id('A'), NULL, 'checklists', 'admin')
                AND public.fleet_ops_can_for(tests.user_id('A.ck_viewer'), tests.company_id('A'), NULL, 'checklists', 'view')
                AND NOT public.fleet_ops_can_for(tests.user_id('A.master_dra'), tests.company_id('A'), NULL, 'checklists', 'admin')
                AND NOT public.fleet_ops_can_for(tests.user_id('A.ck_editor_dra'), tests.company_id('A'), NULL, 'checklists', 'admin')
                AND NOT public.fleet_ops_can_for(tests.user_id('A.dpa_off'), tests.company_id('A'), NULL, 'checklists', 'admin'),
                'setup: the fleet manager and the ism admin are fleet checklist admins; the viewer, the master, the vessel editor and the inactive DPA are not');
SELECT tests.ok(public.form_template_vessel_manager_for(tests.user_id('A.master_dra'), tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.form_template_vessel_manager_for(tests.user_id('A.master_dra'), tests.company_id('A'), tests.vessel_id('A.hyd'))
                AND public.form_template_vessel_manager_for(tests.user_id('A.ck_editor_dra'), tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.form_template_vessel_manager_for(tests.user_id('A.ck_editor_dra'), tests.company_id('A'), tests.vessel_id('A.hyd'))
                AND NOT public.form_template_vessel_manager_for(tests.user_id('A.crew_hyd'), tests.company_id('A'), tests.vessel_id('A.hyd'))
                AND public.form_template_vessel_manager_for(tests.user_id('A.ck_admin'), tests.company_id('A'), tests.vessel_id('A.gam'))
                AND NOT public.form_template_vessel_manager_for(tests.user_id('A.dpa_off'), tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.form_template_vessel_manager_for(tests.user_id('B.admin'), tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.form_template_vessel_manager_for(tests.user_id('A.fleet_manager'), tests.company_id('A'), tests.vessel_id('B.lev')),
                'setup: vessel managers: the DRAAK master and editor on DRAAK only, the admin anywhere; crew, inactive, foreign never');

CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
GRANT ALL ON ids TO PUBLIC;
CREATE FUNCTION pg_temp.id(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM ids WHERE k = p_key $$;
-- What a definer returned, kept by key (results_eq runs its query twice, so a definer is never called inside one).
CREATE TEMP TABLE got (k text PRIMARY KEY, v jsonb NOT NULL) ON COMMIT DROP;
GRANT ALL ON got TO PUBLIC;

-- A draft written directly (as the live INSERT policy lets a template manager), as the superuser.
CREATE FUNCTION pg_temp.draft(
  p_code text,
  p_area text DEFAULT 'safety',
  p_scope text DEFAULT 'FLEET',
  p_vessels uuid[] DEFAULT NULL,
  p_cadence text DEFAULT NULL,
  p_schema jsonb DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_company text DEFAULT 'A',
  p_creator text DEFAULT NULL
) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.form_templates (company_id, template_code, template_name, form_type, vessel_scope, vessel_ids, form_schema, area, cadence, created_by)
  VALUES (tests.company_id(p_company), p_code, coalesce(p_name, 'Template ' || p_code), 'CHECKLIST', p_scope, p_vessels,
          coalesce(p_schema, '{"fields": [{"id": "s1", "type": "section", "label": "Deck"}, {"id": "f1", "type": "checkbox", "label": "Lifejackets stowed"}]}'::jsonb),
          p_area, p_cadence, tests.user_id(coalesce(p_creator, CASE WHEN p_company = 'A' THEN 'A.fleet_manager' ELSE 'B.admin' END)))
  RETURNING id
$$;

-- A run of the template on the vessel, p_days_ago days back (as the run flow stores it), as the superuser.
CREATE FUNCTION pg_temp.run(p_template uuid, p_vessel text, p_days_ago integer DEFAULT 0, p_status text DEFAULT 'SIGNED', p_amendment_of uuid DEFAULT NULL)
RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.form_submissions (template_id, template_version, company_id, vessel_id, form_data, created_date, created_time_utc, status, submitted_at, amendment_of_id)
  SELECT t.id, t.version, t.company_id, tests.vessel_id(p_vessel), '{}'::jsonb, current_date - p_days_ago, now() - make_interval(days => p_days_ago), p_status,
         CASE WHEN p_status IN ('PENDING_SIGNATURE', 'SIGNED', 'AMENDED', 'ARCHIVED') THEN now() - make_interval(days => p_days_ago) END,
         p_amendment_of
  FROM public.form_templates AS t WHERE t.id = p_template
  RETURNING id
$$;

-- The template's events with this action.
CREATE FUNCTION pg_temp.events(p_template uuid, p_action text DEFAULT NULL) RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT count(*) FROM public.form_template_events WHERE template_id = p_template AND (p_action IS NULL OR action = p_action)
$$;


-- ------------------------------------------------------------ grants

SELECT tests.ok(NOT has_function_privilege('anon', 'public.form_template_publish(uuid,text,timestamptz)', 'EXECUTE')
                AND NOT has_function_privilege('anon', 'public.form_template_run_stats(uuid[],text,date)', 'EXECUTE'),
                'grants: anon executes nothing');
SELECT tests.ok(has_function_privilege('authenticated', 'public.form_template_publish(uuid,text,timestamptz)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.form_template_new_version(uuid)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.form_template_customise(uuid)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.form_template_archive(uuid,text)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.form_template_delete_draft(uuid)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.form_template_move_area(uuid,text)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.form_template_set_visibility(uuid,uuid,text,text)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.form_template_reorder(uuid,text,uuid[])', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.form_template_run_stats(uuid[],text,date)', 'EXECUTE'),
                'grants: the browser executes the nine definers');
SELECT tests.ok(NOT has_function_privilege('authenticated', 'public.form_template_gate()', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.form_template_vessel_manager_for(uuid,uuid,uuid)', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.form_template_log(uuid,uuid,uuid,text,text,text,integer,text,jsonb)', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.form_template_publish_blocker(text,jsonb,text,uuid[])', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.form_template_next_due(text,date)', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.form_template_legacy_area(text,text)', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.form_templates_guard()', 'EXECUTE')
                AND has_function_privilege('service_role', 'public.form_template_gate()', 'EXECUTE'),
                'grants: the internal helpers and triggers are not browser-executable');
SELECT tests.ok(has_table_privilege('authenticated', 'public.form_template_vessel_settings', 'SELECT')
                AND NOT has_table_privilege('authenticated', 'public.form_template_vessel_settings', 'INSERT')
                AND NOT has_table_privilege('authenticated', 'public.form_template_vessel_settings', 'UPDATE')
                AND NOT has_table_privilege('authenticated', 'public.form_template_events', 'INSERT')
                AND NOT has_table_privilege('authenticated', 'public.form_template_events', 'DELETE')
                AND NOT has_table_privilege('anon', 'public.form_template_events', 'SELECT'),
                'grants: settings and events are read-only for the browser, nothing for anon');

-- ------------------------------------------------------------ the area mapping and the backfill

SELECT tests.results_eq(
  $q$SELECT public.form_template_legacy_area(ft, cat), public.form_template_legacy_kind(ft, cat)
     FROM (VALUES
       ('CHECKLIST', NULL), ('INSPECTION', NULL), ('PERMIT_TO_WORK', NULL), ('REPORT', NULL), ('MEETING_MINUTES', NULL),
       ('DRILL_REPORT', NULL), ('HANDOVER', NULL), ('AUDIT_FORM', NULL), ('RISK_ASSESSMENT', NULL), ('OTHER', NULL),
       ('checklist', 'Engine room rounds'), ('REPORT', 'Engine room'), ('CHECKLIST', 'Familiarisation'), ('REPORT', 'Hot work permits'),
       ('CHECKLIST', 'Passage planning'), ('CHECKLIST', 'Guest arrival'), ('INSPECTION', 'Crew welfare'), ('CHECKLIST', 'Crewing'),
       ('DRILL_REPORT', 'Safety drills'), ('CHECKLIST', 'Safety rounds'), ('MEETING_MINUTES', 'ISM meetings'), ('OTHER', 'General')
     ) AS v(ft, cat)$q$,
  $q$VALUES ('safety'::text, 'checklist'::text), ('technical', 'checklist'), ('ptw', 'permit'), ('sms', 'form'), ('sms', 'form'),
            ('sms', 'form'), ('sms', 'form'), ('sms', 'form'), ('sms', 'form'), (NULL, 'form'),
            ('technical', 'checklist'), ('technical_forms', 'form'), ('familiarisation', 'checklist'), ('ptw', 'form'),
            ('movement', 'passage_plan'), ('charter', 'checklist'), ('crew', 'checklist'), ('safety', 'checklist'),
            ('sms', 'form'), ('safety', 'checklist'), ('sms', 'form'), (NULL, 'form')$q$,
  'mapping: form_type alone, then the category keyword rules (checklists vs forms, whole words for crew / ism)');

-- Legacy rows as the live table holds them today (no area or kind; any
-- vessel_scope spelling), then the migration re-run over them.
ALTER TABLE public.form_templates DROP CONSTRAINT form_templates_vessel_scope_check;
ALTER TABLE public.form_templates DISABLE TRIGGER trg_form_templates_guard;
ALTER TABLE public.form_templates DISABLE TRIGGER trg_form_templates_audit;
INSERT INTO public.form_categories (id, company_id, name) VALUES (tests.id('cat:engine'), tests.company_id('A'), 'Engine room');
INSERT INTO public.form_templates (id, company_id, template_code, template_name, form_type, category_id, vessel_scope, vessel_ids, status, area, form_kind)
VALUES
  (tests.id('legacy:1'), tests.company_id('A'), 'LEG1', 'Legacy checklist', 'CHECKLIST', NULL, 'fleet', NULL, 'PUBLISHED', NULL, NULL),
  (tests.id('legacy:2'), tests.company_id('A'), 'LEG2', 'Legacy engine report', 'REPORT', tests.id('cat:engine'), 'Vessel', ARRAY[tests.vessel_id('A.dra')], 'PUBLISHED', NULL, NULL),
  (tests.id('legacy:3'), tests.company_id('A'), 'LEG3', 'Legacy other', 'OTHER', NULL, NULL, ARRAY[tests.vessel_id('A.hyd')], 'DRAFT', NULL, NULL),
  (tests.id('legacy:4'), tests.company_id('A'), 'LEG4', 'Legacy permit', 'PERMIT_TO_WORK', NULL, NULL, NULL, 'ARCHIVED', NULL, NULL),
  (tests.id('legacy:5'), tests.company_id('A'), 'LEG5', 'Legacy set area', 'CHECKLIST', NULL, 'VESSEL_SPECIFIC', ARRAY[tests.vessel_id('A.gam')], 'PUBLISHED', 'crew', NULL);
ALTER TABLE public.form_templates ENABLE TRIGGER trg_form_templates_guard;
ALTER TABLE public.form_templates ENABLE TRIGGER trg_form_templates_audit;
\i supabase/migrations/20261124040500_fleet_form_templates.sql
SELECT tests.results_eq(
  $q$SELECT template_code, area, form_kind, vessel_scope FROM public.form_templates WHERE template_code LIKE 'LEG%' ORDER BY template_code$q$,
  $q$VALUES ('LEG1'::text, 'safety'::text, 'checklist'::text, 'FLEET'::text),
            ('LEG2', 'technical_forms', 'form', 'VESSEL_SPECIFIC'),
            ('LEG3', NULL, 'form', 'VESSEL_SPECIFIC'),
            ('LEG4', 'ptw', 'permit', 'FLEET'),
            ('LEG5', 'crew', 'checklist', 'VESSEL_SPECIFIC')$q$,
  'backfill: area and kind filled (a set area kept, an unmapped type Unsorted), vessel_scope normalised (NULL with vessels: VESSEL_SPECIFIC)');
SELECT tests.is((SELECT count(*) FROM public.form_template_events WHERE template_id IN (SELECT id FROM public.form_templates WHERE template_code LIKE 'LEG%')),
                0::bigint, 'backfill: the migration writes no history');
SELECT tests.ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'form_templates_vessel_scope_check' AND conrelid = 'public.form_templates'::regclass),
                'backfill: the re-run put the vessel_scope CHECK back');
DELETE FROM public.form_templates WHERE template_code LIKE 'LEG%' AND status = 'DRAFT';
SELECT set_config('storm.fleet_tx', 'on', true);
DELETE FROM public.form_templates WHERE template_code LIKE 'LEG%';
SELECT set_config('storm.fleet_tx', '', true);

-- ------------------------------------------------------------ CHECKs

SELECT tests.throws($q$SELECT pg_temp.draft('CHK_AREA', 'galley')$q$, '23514', 'check: an area outside the list is refused');
SELECT tests.throws($q$SELECT pg_temp.draft('CHK_CAD', 'safety', 'FLEET', NULL, 'hourly')$q$, '23514', 'check: a cadence outside the list is refused');
SELECT tests.throws($q$SELECT pg_temp.draft('CHK_SCOPE', 'safety', 'SOME')$q$, '23514', 'check: a vessel_scope outside FLEET / VESSEL_SPECIFIC is refused');
SELECT tests.lives($q$SELECT pg_temp.draft('CHK_LOWER', 'safety', 'vessel_specific', ARRAY[tests.vessel_id('A.dra')])$q$, 'check: a lower-case vessel_scope is normalised on insert');
SELECT tests.is((SELECT vessel_scope FROM public.form_templates WHERE template_code = 'CHK_LOWER'), 'VESSEL_SPECIFIC', 'check: stored upper case');
SELECT tests.throws($q$UPDATE public.form_templates SET vessel_scope = 'fleet' WHERE template_code = 'CHK_LOWER'$q$, '23514', 'check: an update to an unknown spelling is refused');
SELECT tests.throws($q$UPDATE public.form_templates SET form_kind = 'memo' WHERE template_code = 'CHK_LOWER'$q$, '23514', 'check: a kind outside the list is refused');
SELECT tests.lives($q$SELECT pg_temp.draft('CHK_DEFAULT', NULL)$q$, 'check: a row with no area is written');
SELECT tests.results_eq($q$SELECT area, form_kind, origin, requires_completion_signature, version FROM public.form_templates WHERE template_code = 'CHK_DEFAULT'$q$,
                        $q$VALUES ('safety'::text, 'checklist'::text, 'company'::text, false, 1)$q$,
                        'insert: area and kind from the legacy mapping when none is given; origin company, no signature, version 1');

-- ------------------------------------------------------------ the guard (every role)

-- The drafts are the legacy Master's own (they read them, so their writes reach the guard).
INSERT INTO ids VALUES
  ('g:pub', pg_temp.draft('G_PUB')),
  ('g:draft', pg_temp.draft('G_DRAFT', 'safety', 'FLEET', NULL, NULL, NULL, NULL, 'A', 'A.master_dra')),
  ('g:runs', pg_temp.draft('G_RUNS', 'safety', 'FLEET', NULL, NULL, NULL, NULL, 'A', 'A.master_dra'));
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT public.form_template_publish(pg_temp.id('g:pub'));
SELECT tests.reset_role();
SELECT pg_temp.run(pg_temp.id('g:runs'), 'A.dra');

-- As the legacy Master (the live policies let them write templates), the fleet manager, the service role and the owner.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('master', 'A.master_dra'), ('dpa', 'A.fleet_manager'), ('service', NULL), ('owner', NULL)) AS v(label, user_key) LOOP
    IF r.label = 'service' THEN
      PERFORM tests.as_service();
    ELSIF r.label = 'owner' THEN
      PERFORM tests.reset_role();
    ELSE
      PERFORM tests.as_user(tests.user_id(r.user_key));
    END IF;
    PERFORM tests.throws_like(format($q$INSERT INTO public.form_templates (company_id, template_code, template_name, form_type, status, created_by) VALUES (%L, %L, 'Seeded', 'CHECKLIST', 'PUBLISHED', %L)$q$,
                                     tests.company_id('A'), 'G_INS_PUB_' || r.label, coalesce(tests.user_id(r.user_key), tests.user_id('A.fleet_manager'))),
                              '42501', 'form_templates_guarded', format('guard (%s): an insert as PUBLISHED is refused', r.label));
    PERFORM tests.throws_like(format($q$INSERT INTO public.form_templates (company_id, template_code, template_name, form_type, version, created_by) VALUES (%L, %L, 'Seeded', 'CHECKLIST', 2, %L)$q$,
                                     tests.company_id('A'), 'G_INS_V2_' || r.label, coalesce(tests.user_id(r.user_key), tests.user_id('A.fleet_manager'))),
                              '42501', 'form_templates_guarded', format('guard (%s): an insert at version 2 is refused', r.label));
    PERFORM tests.throws_like(format($q$INSERT INTO public.form_templates (company_id, template_code, template_name, form_type, origin, created_by) VALUES (%L, %L, 'Seeded', 'CHECKLIST', 'platform', %L)$q$,
                                     tests.company_id('A'), 'G_INS_PLAT_' || r.label, coalesce(tests.user_id(r.user_key), tests.user_id('A.fleet_manager'))),
                              '42501', 'form_templates_guarded', format('guard (%s): an insert as a platform template is refused', r.label));
    PERFORM tests.throws_like(format($q$INSERT INTO public.form_templates (company_id, template_code, template_name, form_type, published_at, created_by) VALUES (%L, %L, 'Seeded', 'CHECKLIST', now(), %L)$q$,
                                     tests.company_id('A'), 'G_INS_DATE_' || r.label, coalesce(tests.user_id(r.user_key), tests.user_id('A.fleet_manager'))),
                              '42501', 'form_templates_guarded', format('guard (%s): an insert with a publish date is refused', r.label));
    PERFORM tests.throws_like(format($q$UPDATE public.form_templates SET status = 'PUBLISHED' WHERE id = %L$q$, pg_temp.id('g:draft')),
                              '42501', 'form_templates_guarded', format('guard (%s): a draft is not published by an update', r.label));
    PERFORM tests.throws_like(format($q$UPDATE public.form_templates SET status = 'ARCHIVED', archived_at = now() WHERE id = %L$q$, pg_temp.id('g:pub')),
                              '42501', 'form_templates_guarded', format('guard (%s): a published template is not archived by an update', r.label));
    PERFORM tests.throws_like(format($q$UPDATE public.form_templates SET version = 7 WHERE id = %L$q$, pg_temp.id('g:draft')),
                              '42501', 'form_templates_guarded', format('guard (%s): the version is not changed by an update', r.label));
    PERFORM tests.throws_like(format($q$UPDATE public.form_templates SET template_name = 'Rewritten' WHERE id = %L$q$, pg_temp.id('g:pub')),
                              '42501', 'form_templates_guarded', format('guard (%s): a published template''s content is frozen', r.label));
    PERFORM tests.throws_like(format($q$UPDATE public.form_templates SET form_schema = '{"fields": []}' WHERE id = %L$q$, pg_temp.id('g:pub')),
                              '42501', 'form_templates_guarded', format('guard (%s): a published template''s items are frozen', r.label));
    PERFORM tests.throws_like(format($q$DELETE FROM public.form_templates WHERE id = %L$q$, pg_temp.id('g:pub')),
                              '42501', 'form_templates_guarded', format('guard (%s): a published template is not deleted', r.label));
    PERFORM tests.throws_like(format($q$DELETE FROM public.form_templates WHERE id = %L$q$, pg_temp.id('g:runs')),
                              '42501', 'form_templates_guarded', format('guard (%s): a draft with runs is not deleted', r.label));
    PERFORM tests.lives(format($q$UPDATE public.form_templates SET description = 'Checked by %s' WHERE id = %L$q$, r.label, pg_temp.id('g:draft')),
                        format('guard (%s): a draft''s content is edited', r.label));
  END LOOP;
  PERFORM tests.reset_role();
END
$$;
SELECT tests.is((SELECT status FROM public.form_templates WHERE id = pg_temp.id('g:pub')), 'PUBLISHED', 'guard: the published template is unchanged');
SELECT tests.is((SELECT description FROM public.form_templates WHERE id = pg_temp.id('g:draft')), 'Checked by owner', 'guard: the draft edits went through');

-- The Master writes and deletes their own never-published draft directly (the live policies); each direct write is in the history.
SELECT tests.as_user(tests.user_id('A.master_dra'));
INSERT INTO public.form_templates (id, company_id, template_code, template_name, form_type, created_by)
VALUES (tests.id('g:master'), tests.company_id('A'), 'G_MASTER', 'Master''s draft', 'CHECKLIST', tests.user_id('A.master_dra'));
UPDATE public.form_templates SET template_name = 'Master''s draft, edited', cadence = 'weekly' WHERE id = tests.id('g:master');
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT action, actor_user_id, payload -> 'columns' FROM public.form_template_events WHERE template_id = tests.id('g:master') ORDER BY created_at, action$q$,
                        format($q$VALUES ('created'::text, %L::uuid, NULL::jsonb), ('edited', %L::uuid, '["cadence", "template_name"]'::jsonb)$q$, tests.user_id('A.master_dra'), tests.user_id('A.master_dra')),
                        'audit: a direct insert and edit are logged with the actor and the changed columns');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.lives($q$DELETE FROM public.form_templates WHERE id = tests.id('g:master')$q$, 'guard: the master deletes their never-published draft directly');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.form_template_events WHERE template_id = tests.id('g:master') AND action = 'draft_deleted'), 1::bigint,
                'audit: the direct delete is logged and the history survives the row');
SELECT tests.throws_like($q$UPDATE public.form_templates SET company_id = tests.company_id('B') WHERE template_code = 'G_DRAFT'$q$,
                         '42501', 'form_templates_guarded', 'guard: a template never moves company');

-- ------------------------------------------------------------ the state machine (copy of lib/templateMachine.ts)

CREATE TEMP TABLE machine (state text NOT NULL, action text NOT NULL, outcome text NOT NULL, PRIMARY KEY (state, action)) ON COMMIT DROP;
GRANT ALL ON machine TO PUBLIC;
INSERT INTO machine (state, action, outcome) VALUES
-- machine-table:start
  ('DRAFT', 'publish', 'PUBLISHED'),
  ('DRAFT', 'new_version', '!template_draft'),
  ('DRAFT', 'customise', '!template_draft'),
  ('DRAFT', 'archive', 'ARCHIVED'),
  ('DRAFT', 'delete_draft', 'deleted'),
  ('DRAFT', 'move_area', 'DRAFT'),
  ('DRAFT', 'set_visibility', '!template_not_published'),
  ('PUBLISHED', 'publish', '!already_published'),
  ('PUBLISHED', 'new_version', 'PUBLISHED'),
  ('PUBLISHED', 'customise', 'PUBLISHED'),
  ('PUBLISHED', 'archive', 'ARCHIVED'),
  ('PUBLISHED', 'delete_draft', '!template_published'),
  ('PUBLISHED', 'move_area', 'PUBLISHED'),
  ('PUBLISHED', 'set_visibility', 'PUBLISHED'),
  ('SUPERSEDED', 'publish', '!template_superseded'),
  ('SUPERSEDED', 'new_version', '!template_superseded'),
  ('SUPERSEDED', 'customise', 'SUPERSEDED'),
  ('SUPERSEDED', 'archive', 'ARCHIVED'),
  ('SUPERSEDED', 'delete_draft', '!template_published'),
  ('SUPERSEDED', 'move_area', '!template_superseded'),
  ('SUPERSEDED', 'set_visibility', '!template_not_published'),
  ('ARCHIVED', 'publish', '!template_archived'),
  ('ARCHIVED', 'new_version', 'ARCHIVED'),
  ('ARCHIVED', 'customise', 'ARCHIVED'),
  ('ARCHIVED', 'archive', '!already_archived'),
  ('ARCHIVED', 'delete_draft', '!template_archived'),
  ('ARCHIVED', 'move_area', '!template_archived'),
  ('ARCHIVED', 'set_visibility', '!template_not_published')
-- machine-table:end
;

SELECT tests.is((SELECT count(*) FROM machine), 28::bigint, 'machine: 4 states x 7 actions');

DO $$
DECLARE
  c record;
  v_code text;
  v_id uuid;
  v_new uuid;
  v_got text;
  v_before bigint;
  v_after bigint;
  v_created bigint;
BEGIN
  FOR c IN SELECT * FROM machine ORDER BY state, action LOOP
    PERFORM tests.reset_role();
    v_code := 'M_' || left(c.state, 3) || '_' || upper(c.action);
    v_id := pg_temp.draft(v_code);
    PERFORM tests.as_user(tests.user_id('A.fleet_manager'));
    IF c.state IN ('PUBLISHED', 'SUPERSEDED', 'ARCHIVED') THEN
      PERFORM public.form_template_publish(v_id);
    END IF;
    IF c.state = 'SUPERSEDED' THEN
      v_new := (public.form_template_new_version(v_id)).id;
      PERFORM public.form_template_publish(v_new);
    END IF;
    IF c.state = 'ARCHIVED' THEN
      PERFORM public.form_template_archive(v_id, 'Out of use');
    END IF;
    v_before := (SELECT count(*) FROM public.form_template_events WHERE company_id = tests.company_id('A'));
    v_created := (SELECT count(*) FROM public.form_templates WHERE company_id = tests.company_id('A'));
    BEGIN
      CASE c.action
        WHEN 'publish' THEN PERFORM public.form_template_publish(v_id);
        WHEN 'new_version' THEN PERFORM public.form_template_new_version(v_id);
        WHEN 'customise' THEN PERFORM public.form_template_customise(v_id);
        WHEN 'archive' THEN PERFORM public.form_template_archive(v_id, 'No longer used');
        WHEN 'delete_draft' THEN PERFORM public.form_template_delete_draft(v_id);
        WHEN 'move_area' THEN PERFORM public.form_template_move_area(v_id, 'charter');
        WHEN 'set_visibility' THEN PERFORM public.form_template_set_visibility(v_id, tests.vessel_id('A.dra'), 'hidden', 'Not carried on board');
      END CASE;
      v_got := coalesce((SELECT status FROM public.form_templates WHERE id = v_id), 'deleted');
    EXCEPTION WHEN OTHERS THEN
      v_got := '!' || SQLERRM;
      IF SQLSTATE <> '22023' THEN
        v_got := v_got || ' (' || SQLSTATE || ')';
      END IF;
    END;
    v_after := (SELECT count(*) FROM public.form_template_events WHERE company_id = tests.company_id('A'));
    PERFORM tests.is(v_got, c.outcome, format('machine: %s + %s -> %s', c.state, c.action, c.outcome));
    IF left(c.outcome, 1) = '!' THEN
      PERFORM tests.is(v_after - v_before, 0::bigint, format('machine: %s + %s refused writes no event', c.state, c.action));
    ELSE
      PERFORM tests.is(v_after - v_before, 1::bigint, format('machine: %s + %s writes one event', c.state, c.action));
    END IF;
    IF c.action IN ('new_version', 'customise') AND left(c.outcome, 1) <> '!' THEN
      PERFORM tests.is((SELECT count(*) FROM public.form_templates WHERE company_id = tests.company_id('A')) - v_created, 1::bigint,
                       format('machine: %s + %s adds one draft', c.state, c.action));
    END IF;
  END LOOP;
  PERFORM tests.reset_role();
END
$$;

-- ------------------------------------------------------------ publish blockers (copy of the cases in src/test/forms/publishChecks.test.ts)

CREATE TEMP TABLE publish_cases (label text PRIMARY KEY, template_name text, form_schema jsonb, vessel_scope text, vessel_count integer, outcome text) ON COMMIT DROP;
GRANT ALL ON publish_cases TO PUBLIC;
INSERT INTO publish_cases VALUES
-- publish-cases:start
  ('flat_items', 'Deck rounds', '{"fields": [{"type": "checkbox", "label": "Lifejackets stowed"}, {"type": "yes_no", "label": "Hatches closed"}]}', 'FLEET', 0, 'ok'),
  ('sections', 'Engine rounds', '{"fields": [{"type": "section", "label": "Engine room"}, {"type": "number", "label": "Oil pressure"}, {"type": "section", "label": "Steering"}, {"type": "checkbox", "label": "Gear tested"}]}', 'FLEET', 0, 'ok'),
  ('leading_items', 'Bridge checks', '{"fields": [{"type": "checkbox", "label": "Radar on"}, {"type": "section", "label": "Comms"}, {"type": "checkbox", "label": "VHF tested"}]}', 'FLEET', 0, 'ok'),
  ('blank_name', '   ', '{"fields": [{"type": "checkbox", "label": "Lifejackets stowed"}]}', 'FLEET', 0, 'name_required'),
  ('no_fields', 'Empty form', '{"fields": []}', 'FLEET', 0, 'no_section'),
  ('fields_not_array', 'Odd form', '{"fields": {}}', 'FLEET', 0, 'no_section'),
  ('headers_only', 'Headers only', '{"fields": [{"type": "section", "label": "Deck"}, {"type": "SECTION", "label": "Engine"}]}', 'FLEET', 0, 'no_section'),
  ('empty_middle', 'Gap', '{"fields": [{"type": "section", "label": "Deck"}, {"type": "section", "label": "Engine"}, {"type": "checkbox", "label": "Oil checked"}]}', 'FLEET', 0, 'empty_section'),
  ('empty_last', 'Trailing header', '{"fields": [{"type": "checkbox", "label": "Oil checked"}, {"type": "section", "label": "Later"}]}', 'FLEET', 0, 'empty_section'),
  ('blank_header', 'Unnamed section', '{"fields": [{"type": "section", "label": " "}, {"type": "checkbox", "label": "Oil checked"}]}', 'FLEET', 0, 'unlabelled_section'),
  ('blank_item', 'Unnamed item', '{"fields": [{"type": "section", "label": "Deck"}, {"type": "checkbox", "label": ""}]}', 'FLEET', 0, 'unlabelled_item'),
  ('missing_label', 'No label key', '{"fields": [{"type": "checkbox"}]}', 'FLEET', 0, 'unlabelled_item'),
  ('not_object', 'Stray value', '{"fields": ["Lifejackets"]}', 'FLEET', 0, 'unlabelled_item'),
  ('empty_beats_blank', 'Two problems', '{"fields": [{"type": "section", "label": "Deck"}, {"type": "section", "label": "Engine"}, {"type": "checkbox", "label": ""}]}', 'FLEET', 0, 'empty_section'),
  ('selected_none', 'Selected vessels', '{"fields": [{"type": "checkbox", "label": "Lifejackets stowed"}]}', 'VESSEL_SPECIFIC', 0, 'targets_required'),
  ('selected_one', 'Selected vessels', '{"fields": [{"type": "checkbox", "label": "Lifejackets stowed"}]}', 'VESSEL_SPECIFIC', 1, 'ok')
-- publish-cases:end
;

SELECT tests.is((SELECT count(*) FROM publish_cases), 16::bigint, 'publish: 16 cases');
SELECT tests.is_empty(
  $q$SELECT label FROM publish_cases
     WHERE coalesce(public.form_template_publish_blocker(template_name, form_schema, vessel_scope,
                    CASE WHEN vessel_count > 0 THEN ARRAY[tests.vessel_id('A.dra')] ELSE '{}'::uuid[] END), 'ok') <> outcome$q$,
  'publish: form_template_publish_blocker answers every case');

DO $$
DECLARE
  c record;
  v_id uuid;
  v_got text;
BEGIN
  FOR c IN SELECT * FROM publish_cases ORDER BY label LOOP
    PERFORM tests.reset_role();
    v_id := pg_temp.draft('P_' || upper(c.label), 'safety', c.vessel_scope,
                          CASE WHEN c.vessel_count > 0 THEN ARRAY[tests.vessel_id('A.dra')] ELSE NULL END,
                          NULL, c.form_schema, c.template_name);
    PERFORM tests.as_user(tests.user_id('A.ck_admin'));
    BEGIN
      PERFORM public.form_template_publish(v_id);
      v_got := 'ok';
    EXCEPTION WHEN OTHERS THEN
      v_got := CASE WHEN SQLSTATE = '22023' THEN SQLERRM ELSE SQLERRM || ' (' || SQLSTATE || ')' END;
    END;
    PERFORM tests.is(v_got, c.outcome, format('publish: %s -> %s', c.label, c.outcome));
    IF c.outcome <> 'ok' THEN
      PERFORM tests.is((SELECT status FROM public.form_templates WHERE id = v_id), 'DRAFT', format('publish: %s stays a draft', c.label));
    END IF;
  END LOOP;
  PERFORM tests.reset_role();
END
$$;

-- Foreign vessels, labels, the stale check.
INSERT INTO ids VALUES
  ('p:foreign', pg_temp.draft('P_FOREIGN', 'safety', 'VESSEL_SPECIFIC', ARRAY[tests.vessel_id('A.dra'), tests.vessel_id('B.lev')])),
  ('p:label', pg_temp.draft('P_LABEL')),
  ('p:stale', pg_temp.draft('P_STALE'));
SELECT tests.as_user(tests.user_id('A.ck_admin'));
SELECT tests.throws_like(format($q$SELECT public.form_template_publish(%L)$q$, pg_temp.id('p:foreign')), '22023', 'invalid_targets', 'publish: a vessel of another company is refused');
SELECT tests.throws_like(format($q$SELECT public.form_template_publish(%L, %L)$q$, pg_temp.id('p:label'), repeat('x', 41)), '22023', 'version_label_too_long', 'publish: a 41-character label is refused');
SELECT tests.throws_like(format($q$SELECT public.form_template_publish(%L, NULL, now() - interval '1 day')$q$, pg_temp.id('p:stale')), '22023', 'stale_template', 'publish: a stale updated_at is refused');
SELECT tests.is((public.form_template_publish(pg_temp.id('p:stale'), '  ', (SELECT updated_at FROM public.form_templates WHERE id = pg_temp.id('p:stale')))).status, 'PUBLISHED',
                'publish: the current updated_at goes through; a blank label is none');
SELECT tests.is((SELECT version_label FROM public.form_templates WHERE id = pg_temp.id('p:stale')), NULL::text, 'publish: no label stored when blank (shown as v1)');
INSERT INTO got SELECT 'p:label', to_jsonb(r) FROM public.form_template_publish(pg_temp.id('p:label'), '  SMS-CL-001 Rev 4 ') AS r;
SELECT tests.results_eq($q$SELECT v ->> 'status', (v ->> 'version')::integer, v ->> 'version_label', (v ->> 'published_by')::uuid FROM got WHERE k = 'p:label'$q$,
                        format($q$VALUES ('PUBLISHED'::text, 1, 'SMS-CL-001 Rev 4'::text, %L::uuid)$q$, tests.user_id('A.ck_admin')),
                        'publish: the typed label (trimmed), the version kept, the publisher stamped');
SELECT tests.is((SELECT count(*) FROM public.form_template_events WHERE template_id = pg_temp.id('p:label') AND action = 'published' AND actor_user_id = tests.user_id('A.ck_admin')
                 AND payload ->> 'version_label' = 'SMS-CL-001 Rev 4'), 1::bigint, 'publish: one event with the label and the actor');
SELECT tests.reset_role();

-- ------------------------------------------------------------ versions: supersede, settings carry over, runs keep their version

INSERT INTO ids VALUES ('v:1', pg_temp.draft('V_ROUNDS', 'technical', 'FLEET', NULL, 'weekly'));
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT public.form_template_publish(pg_temp.id('v:1'), 'Rev A');
SELECT public.form_template_set_visibility(pg_temp.id('v:1'), tests.vessel_id('A.hyd'), 'hidden', 'Engine rounds kept in the paper log');
SELECT public.form_template_reorder(tests.vessel_id('A.dra'), 'technical', ARRAY[pg_temp.id('v:1')]);
SELECT tests.reset_role();
INSERT INTO ids SELECT 'run:v1', pg_temp.run(pg_temp.id('v:1'), 'A.dra', 3);
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
INSERT INTO ids SELECT 'v:2', (public.form_template_new_version(pg_temp.id('v:1'))).id;
SELECT tests.results_eq(
  format($q$SELECT template_code, version, status, supersedes_template_id, version_label, published_at IS NULL, area, cadence, form_schema = (SELECT form_schema FROM public.form_templates WHERE id = %L)
            FROM public.form_templates WHERE id = %L$q$, pg_temp.id('v:1'), pg_temp.id('v:2')),
  format($q$VALUES ('V_ROUNDS'::text, 2, 'DRAFT'::text, %L::uuid, NULL::text, true, 'technical'::text, 'weekly'::text, true)$q$, pg_temp.id('v:1')),
  'new version: same code, version 2, a draft superseding v1, no label or publish date, area, cadence and items copied');
SELECT tests.is((SELECT status FROM public.form_templates WHERE id = pg_temp.id('v:1')), 'PUBLISHED', 'new version: the live version keeps running');
SELECT tests.throws_like(format($q$SELECT public.form_template_new_version(%L)$q$, pg_temp.id('v:1')), '22023', 'draft_exists', 'new version: one open draft per family');
SELECT tests.lives(format($q$UPDATE public.form_templates SET template_name = 'Engine rounds (revised)' WHERE id = %L$q$, pg_temp.id('v:2')), 'new version: the draft is edited');
SELECT tests.throws_like(format($q$UPDATE public.form_templates SET template_code = 'V_OTHER' WHERE id = %L$q$, pg_temp.id('v:2')),
                         '42501', 'form_templates_guarded', 'new version: the draft keeps the family code');
SELECT tests.throws_like(format($q$SELECT public.form_template_publish(%L, 'rev a')$q$, pg_temp.id('v:2')), '22023', 'version_label_taken', 'publish: a label already used in the family (any case) is refused');
SELECT tests.is((public.form_template_publish(pg_temp.id('v:2'), 'Rev B')).status, 'PUBLISHED', 'supersede: v2 published');
SELECT tests.results_eq($q$SELECT version, status FROM public.form_templates WHERE template_code = 'V_ROUNDS' ORDER BY version$q$,
                        $q$VALUES (1, 'SUPERSEDED'::text), (2, 'PUBLISHED'::text)$q$, 'supersede: v1 superseded, v2 published');
SELECT tests.is((SELECT payload -> 'superseded_ids' ->> 0 FROM public.form_template_events WHERE template_id = pg_temp.id('v:2') AND action = 'published')::uuid,
                pg_temp.id('v:1'), 'supersede: the event names the superseded version');
SELECT tests.results_eq(format($q$SELECT vessel_id, visibility, sort_order, reason FROM public.form_template_vessel_settings WHERE template_id = %L ORDER BY sort_order NULLS LAST$q$, pg_temp.id('v:2')),
                        format($q$VALUES (%L::uuid, 'shown'::text, 1, NULL::text), (%L::uuid, 'hidden'::text, NULL::integer, 'Engine rounds kept in the paper log'::text)$q$,
                               tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')),
                        'supersede: the order on DRAAK and the hidden setting on HYDRA carry over to v2');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT template_id, template_version FROM public.form_submissions WHERE id = %L$q$, pg_temp.id('run:v1')),
                        format($q$VALUES (%L::uuid, 1)$q$, pg_temp.id('v:1')), 'supersede: the run keeps the version it used');

-- An archived template starts again as a new draft (the old "restore").
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT public.form_template_archive(pg_temp.id('v:2'), 'Replaced by the planned maintenance system');
SELECT tests.is((SELECT archived_at IS NOT NULL FROM public.form_templates WHERE id = pg_temp.id('v:2')), true, 'archive: the archive time is stamped');
SELECT tests.is((SELECT comment FROM public.form_template_events WHERE template_id = pg_temp.id('v:2') AND action = 'archived'), 'Replaced by the planned maintenance system',
                'archive: the reason is in the event');
INSERT INTO ids SELECT 'v:3', (public.form_template_new_version(pg_temp.id('v:2'))).id;
SELECT tests.results_eq(format($q$SELECT version, status, supersedes_template_id, template_name FROM public.form_templates WHERE id = %L$q$, pg_temp.id('v:3')),
                        format($q$VALUES (3, 'DRAFT'::text, %L::uuid, 'Engine rounds (revised)'::text)$q$, pg_temp.id('v:2')),
                        'new version from archived: version 3, superseding the archived one, its content copied');
SELECT tests.throws_like(format($q$SELECT public.form_template_new_version(%L)$q$, pg_temp.id('v:1')), '22023', 'template_superseded', 'new version: not from a superseded version');
SELECT public.form_template_publish(pg_temp.id('v:3'));
SELECT tests.results_eq($q$SELECT version, status FROM public.form_templates WHERE template_code = 'V_ROUNDS' ORDER BY version$q$,
                        $q$VALUES (1, 'SUPERSEDED'::text), (2, 'ARCHIVED'::text), (3, 'PUBLISHED'::text)$q$,
                        'new version from archived: publishing it leaves the archived one archived; UNIQUE (code, version) holds');
SELECT tests.throws_like(format($q$SELECT public.form_template_archive(%L, %L)$q$, pg_temp.id('v:3'), repeat('r', 501)), '22023', 'reason_too_long', 'archive: a 501-character reason is refused');
SELECT tests.reset_role();

-- ------------------------------------------------------------ customise (FC5)

SELECT set_config('storm.fleet_tx', 'on', true);
INSERT INTO public.form_templates (id, company_id, template_code, template_name, form_type, vessel_scope, form_schema, area, origin, status, published_at)
VALUES (tests.id('c:std'), tests.company_id('A'), 'STD_FIRE', 'Fire patrol', 'CHECKLIST', 'FLEET',
        '{"fields": [{"type": "checkbox", "label": "Galley checked"}]}', 'safety', 'platform', 'PUBLISHED', now()),
       (tests.id('c:long'), tests.company_id('A'), repeat('L', 50), 'Long code', 'CHECKLIST', 'FLEET',
        '{"fields": [{"type": "checkbox", "label": "Done"}]}', 'safety', 'platform', 'PUBLISHED', now());
SELECT set_config('storm.fleet_tx', '', true);
SELECT tests.as_user(tests.user_id('A.ck_admin'));
SELECT tests.throws_like($q$SELECT public.form_template_new_version(tests.id('c:std'))$q$, '22023', 'platform_template_customise', 'customise: a platform template is customised, not versioned');
INSERT INTO ids SELECT 'c:copy1', (public.form_template_customise(tests.id('c:std'))).id;
INSERT INTO ids SELECT 'c:copy2', (public.form_template_customise(tests.id('c:std'))).id;
SELECT tests.results_eq(format($q$SELECT template_code, template_name, status, version, origin, source_template_id, area FROM public.form_templates WHERE id IN (%L, %L) ORDER BY template_code$q$,
                               pg_temp.id('c:copy1'), pg_temp.id('c:copy2')),
                        format($q$VALUES ('STD_FIRE_CUSTOM1'::text, 'Fire patrol'::text, 'DRAFT'::text, 1, 'company'::text, %L::uuid, 'safety'::text),
                                         ('STD_FIRE_CUSTOM2', 'Fire patrol', 'DRAFT', 1, 'company', %L::uuid, 'safety')$q$, tests.id('c:std'), tests.id('c:std')),
                        'customise: company drafts named <code>_CUSTOM<n>, linked to the source, content copied');
SELECT tests.is((public.form_template_customise(tests.id('c:long'))).template_code, repeat('L', 42) || '_CUSTOM1', 'customise: a 50-character code is shortened to keep 50');
SELECT tests.throws_like(format($q$SELECT public.form_template_customise(%L)$q$, pg_temp.id('c:copy1')), '22023', 'template_draft', 'customise: not from a draft');
SELECT tests.reset_role();
-- The legacy UPDATE policy lets the DPA edit the draft (an RBAC-only admin does not: X5-06B followup).
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
UPDATE public.form_templates SET vessel_scope = 'VESSEL_SPECIFIC', vessel_ids = ARRAY[tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')] WHERE id = pg_temp.id('c:copy1');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.ck_admin'));
SELECT public.form_template_publish(pg_temp.id('c:copy1'));
SELECT tests.results_eq($q$SELECT vessel_id, visibility, reason FROM public.form_template_vessel_settings WHERE template_id = tests.id('c:std') ORDER BY vessel_id$q$,
                        format($q$SELECT x, 'hidden'::text, 'Replaced by STD_FIRE_CUSTOM1'::text FROM unnest(ARRAY[%L, %L]::uuid[]) AS x ORDER BY x$q$, tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')),
                        'customise: publishing the copy hides the standard on the copy''s vessels (DRAAK, HYDRA), not on GAME CHANGER');
SELECT tests.is((SELECT (payload ->> 'source_hidden_on')::integer FROM public.form_template_events WHERE template_id = pg_temp.id('c:copy1') AND action = 'published'), 2,
                'customise: the publish event counts the vessels it hid the source on');
SELECT tests.reset_role();

-- ------------------------------------------------------------ archive versus delete (W2 delete rules)

INSERT INTO ids VALUES ('d:clean', pg_temp.draft('D_CLEAN')), ('d:runs', pg_temp.draft('D_RUNS')), ('d:pub', pg_temp.draft('D_PUB'));
INSERT INTO public.form_schedules (company_id, template_id, schedule_name, recurrence_type, recurrence_config, start_date)
VALUES (tests.company_id('A'), pg_temp.id('d:clean'), 'Weekly', 'WEEKLY', '{}', current_date);
SELECT pg_temp.run(pg_temp.id('d:runs'), 'A.dra', 1, 'DRAFT');
SELECT tests.as_user(tests.user_id('A.ck_admin'));
SELECT public.form_template_publish(pg_temp.id('d:pub'));
SELECT tests.reset_role();
SELECT pg_temp.run(pg_temp.id('d:pub'), 'A.hyd', 1);
SELECT tests.as_user(tests.user_id('A.ck_admin'));
SELECT tests.is((public.form_template_delete_draft(pg_temp.id('d:clean'))).template_code, 'D_CLEAN', 'delete: a never-published draft with no runs is deleted, the row returned');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.form_templates WHERE id = pg_temp.id('d:clean')), 0::bigint, 'delete: the row is gone');
SELECT tests.is((SELECT count(*) FROM public.form_schedules WHERE template_id = pg_temp.id('d:clean')), 0::bigint, 'delete: its schedules are removed');
SELECT tests.results_eq(format($q$SELECT action, (payload ->> 'schedules_removed')::integer FROM public.form_template_events WHERE template_id = %L AND action = 'draft_deleted'$q$, pg_temp.id('d:clean')),
                        $q$VALUES ('draft_deleted'::text, 1)$q$, 'delete: the history row is kept');
SELECT tests.as_user(tests.user_id('A.ck_admin'));
SELECT tests.throws_like(format($q$SELECT public.form_template_delete_draft(%L)$q$, pg_temp.id('d:runs')), '22023', 'template_has_runs', 'delete: a draft with a run (even a draft run) is refused');
SELECT tests.is((public.form_template_archive(pg_temp.id('d:runs'))).status, 'ARCHIVED', 'delete: that draft is archived instead');
SELECT tests.throws_like(format($q$SELECT public.form_template_delete_draft(%L)$q$, pg_temp.id('d:pub')), '22023', 'template_published', 'delete: a published template is refused');
SELECT tests.is((public.form_template_archive(pg_temp.id('d:pub'))).status, 'ARCHIVED', 'archive: a published template with runs is archived');
SELECT tests.throws_like($q$SELECT public.form_template_delete_draft(gen_random_uuid())$q$, 'P0002', 'template_not_found', 'delete: an unknown id is not found');
SELECT tests.reset_role();
-- The run of the archived template still shows its form to the crew (RLS).
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is((SELECT count(*) FROM public.form_templates WHERE id = pg_temp.id('d:pub')), 1::bigint, 'rls: crew read an archived template (their run still shows its form)');
SELECT tests.is((SELECT count(*) FROM public.form_templates WHERE id = pg_temp.id('v:1')), 1::bigint, 'rls: crew read a superseded version');
SELECT tests.is((SELECT count(*) FROM public.form_templates WHERE id = pg_temp.id('g:draft')), 0::bigint, 'rls: crew do not read someone else''s draft');
SELECT tests.reset_role();

-- ------------------------------------------------------------ rights: who may run the definers

INSERT INTO ids VALUES ('r:draft', pg_temp.draft('R_DRAFT')), ('r:pub', pg_temp.draft('R_PUB', 'safety', 'VESSEL_SPECIFIC', ARRAY[tests.vessel_id('A.dra'), tests.vessel_id('A.gam')]));
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT public.form_template_publish(pg_temp.id('r:pub'));
SELECT tests.reset_role();
INSERT INTO ids SELECT 'r:b', pg_temp.draft('R_B', 'safety', 'FLEET', NULL, NULL, NULL, NULL, 'B');

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('A.master_dra'), ('A.ck_editor_dra'), ('A.ck_viewer'), ('A.crew_hyd'), ('A.disabled'), ('A.dpa_off')) AS v(user_key) LOOP
    PERFORM tests.as_user(tests.user_id(r.user_key));
    PERFORM tests.throws_like(format($q$SELECT public.form_template_publish(%L)$q$, pg_temp.id('r:draft')), '42501', 'not_permitted', format('rights: %s does not publish', r.user_key));
    PERFORM tests.throws_like(format($q$SELECT public.form_template_new_version(%L)$q$, pg_temp.id('r:pub')), '42501', 'not_permitted', format('rights: %s does not start a version', r.user_key));
    PERFORM tests.throws_like(format($q$SELECT public.form_template_customise(%L)$q$, pg_temp.id('r:pub')), '42501', 'not_permitted', format('rights: %s does not customise', r.user_key));
    PERFORM tests.throws_like(format($q$SELECT public.form_template_archive(%L)$q$, pg_temp.id('r:pub')), '42501', 'not_permitted', format('rights: %s does not archive', r.user_key));
    PERFORM tests.throws_like(format($q$SELECT public.form_template_delete_draft(%L)$q$, pg_temp.id('r:draft')), '42501', 'not_permitted', format('rights: %s does not delete', r.user_key));
    PERFORM tests.throws_like(format($q$SELECT public.form_template_move_area(%L, 'crew')$q$, pg_temp.id('r:pub')), '42501', 'not_permitted', format('rights: %s does not move areas', r.user_key));
  END LOOP;
  PERFORM tests.reset_role();
END
$$;
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(format($q$SELECT public.form_template_publish(%L)$q$, pg_temp.id('r:draft')), 'P0002', 'template_not_found', 'rights: B''s admin does not find A''s draft');
SELECT tests.throws_like(format($q$SELECT public.form_template_archive(%L)$q$, pg_temp.id('r:pub')), 'P0002', 'template_not_found', 'rights: B''s admin does not find A''s template');
SELECT tests.throws_like(format($q$SELECT public.form_template_customise(%L)$q$, pg_temp.id('r:pub')), 'P0002', 'template_not_found', 'rights: B''s admin does not copy A''s template');
SELECT tests.throws_like(format($q$SELECT public.form_template_set_visibility(%L, %L, 'hidden')$q$, pg_temp.id('r:pub'), tests.vessel_id('B.lev')), 'P0002', 'template_not_found',
                         'rights: another company''s template is not found');
SELECT tests.is((public.form_template_publish(pg_temp.id('r:b'))).status, 'PUBLISHED', 'rights: B''s admin publishes B''s own draft');
SELECT tests.reset_role();

-- Per vessel: hide, restore, reorder.
SELECT tests.as_user(tests.user_id('A.master_dra'));
INSERT INTO got SELECT 'vis:hide', to_jsonb(r) FROM public.form_template_set_visibility(pg_temp.id('r:pub'), tests.vessel_id('A.dra'), 'hidden', '  Not carried on this vessel ') AS r;
SELECT tests.results_eq($q$SELECT v ->> 'visibility', (v ->> 'hidden_by')::uuid, v ->> 'reason', v ->> 'hidden_at' IS NOT NULL FROM got WHERE k = 'vis:hide'$q$,
                        format($q$VALUES ('hidden'::text, %L::uuid, 'Not carried on this vessel'::text, true)$q$, tests.user_id('A.master_dra')),
                        'visibility: the DRAAK master hides a template on DRAAK, with who, when and why');
SELECT tests.is(pg_temp.events(pg_temp.id('r:pub'), 'hidden'), 1::bigint, 'visibility: one hidden event');
SELECT tests.is((public.form_template_set_visibility(pg_temp.id('r:pub'), tests.vessel_id('A.dra'), 'hidden', 'Not carried on this vessel')).visibility, 'hidden', 'visibility: the same setting again');
SELECT tests.is(pg_temp.events(pg_temp.id('r:pub'), 'hidden'), 1::bigint, 'visibility: an unchanged setting writes no event');
SELECT tests.throws_like(format($q$SELECT public.form_template_set_visibility(%L, %L, 'hidden')$q$, pg_temp.id('r:pub'), tests.vessel_id('A.gam')), '42501', 'vessel_out_of_reach',
                         'visibility: the DRAAK master cannot reach GAME CHANGER');
SELECT tests.throws_like(format($q$SELECT public.form_template_set_visibility(%L, %L, 'hidden')$q$, pg_temp.id('r:draft'), tests.vessel_id('A.dra')), '22023', 'template_not_published',
                         'visibility: a draft is not shown or hidden');
SELECT tests.throws_like(format($q$SELECT public.form_template_set_visibility(%L, %L, 'gone')$q$, pg_temp.id('r:pub'), tests.vessel_id('A.dra')), '22023', 'invalid_visibility',
                         'visibility: an unknown value is refused');
SELECT tests.throws_like(format($q$SELECT public.form_template_set_visibility(%L, %L, 'hidden', %L)$q$, pg_temp.id('r:pub'), tests.vessel_id('A.dra'), repeat('w', 301)), '22023', 'reason_too_long',
                         'visibility: a 301-character reason is refused');
INSERT INTO got SELECT 'vis:show', to_jsonb(r) FROM public.form_template_set_visibility(pg_temp.id('r:pub'), tests.vessel_id('A.dra'), 'shown', 'ignored') AS r;
SELECT tests.results_eq($q$SELECT v ->> 'visibility', v ->> 'hidden_by', v ->> 'hidden_at', v ->> 'reason' FROM got WHERE k = 'vis:show'$q$,
                        $q$VALUES ('shown'::text, NULL::text, NULL::text, NULL::text)$q$,
                        'visibility: restored, the who / when / why cleared');
SELECT tests.is(pg_temp.events(pg_temp.id('r:pub'), 'shown'), 1::bigint, 'visibility: one shown event');
SELECT tests.reset_role();

SELECT tests.as_user(tests.user_id('A.ck_editor_dra'));
SELECT tests.is((public.form_template_set_visibility(pg_temp.id('r:pub'), tests.vessel_id('A.dra'), 'hidden')).visibility, 'hidden', 'visibility: the DRAAK checklist editor hides on DRAAK');
SELECT tests.throws_like(format($q$SELECT public.form_template_set_visibility(%L, %L, 'hidden')$q$, pg_temp.id('r:pub'), tests.vessel_id('A.hyd')), '42501', 'vessel_out_of_reach',
                         'visibility: the DRAAK editor does not reach HYDRA');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.throws_like(format($q$SELECT public.form_template_set_visibility(%L, %L, 'hidden')$q$, pg_temp.id('v:3'), tests.vessel_id('A.hyd')), '42501', 'not_permitted',
                         'visibility: crew of HYDRA are not vessel managers');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws_like(format($q$SELECT public.form_template_set_visibility(%L, %L, 'hidden')$q$, pg_temp.id('r:pub'), tests.vessel_id('A.dra')), '42501', 'not_permitted',
                         'visibility: an inactive user is refused');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.ck_admin'));
SELECT tests.throws_like(format($q$SELECT public.form_template_set_visibility(%L, %L, 'hidden')$q$, pg_temp.id('r:pub'), tests.vessel_id('A.hyd')), '22023', 'vessel_not_targeted',
                         'visibility: HYDRA is not one of the template''s vessels');
SELECT tests.throws_like(format($q$SELECT public.form_template_set_visibility(%L, %L, 'hidden')$q$, pg_temp.id('r:pub'), tests.vessel_id('B.lev')), '42501', 'vessel_out_of_reach',
                         'visibility: a vessel of another company is out of reach');
SELECT tests.reset_role();

-- Reorder: the safety templates targeting DRAAK, hidden ones included.
CREATE TEMP TABLE dra_safety ON COMMIT DROP AS
SELECT id FROM public.form_templates
WHERE company_id = tests.company_id('A') AND status = 'PUBLISHED' AND area = 'safety'
  AND public.form_template_targets_vessel(vessel_scope, vessel_ids, tests.vessel_id('A.dra'));
SELECT tests.reset_role();
GRANT SELECT ON dra_safety TO PUBLIC;
SELECT tests.ok((SELECT count(*) FROM dra_safety) >= 3, 'reorder: setup has several safety templates on DRAAK');
SELECT tests.as_user(tests.user_id('A.master_dra'));
INSERT INTO got SELECT 'reorder', jsonb_agg(jsonb_build_array(r.template_id, r.sort_order))
FROM public.form_template_reorder(tests.vessel_id('A.dra'), 'safety', (SELECT array_agg(id ORDER BY id DESC) FROM dra_safety)) AS r;
SELECT tests.is((SELECT v FROM got WHERE k = 'reorder'),
                (SELECT jsonb_agg(jsonb_build_array(id, n) ORDER BY n) FROM (SELECT id, row_number() OVER (ORDER BY id DESC) AS n FROM dra_safety) AS x),
                'reorder: the master orders DRAAK''s safety templates; the settings come back in that order');
SELECT tests.is((SELECT visibility FROM public.form_template_vessel_settings WHERE template_id = pg_temp.id('r:pub') AND vessel_id = tests.vessel_id('A.dra')), 'hidden',
                'reorder: a hidden template keeps its visibility');
SELECT tests.is((SELECT count(*) FROM public.form_template_events WHERE action = 'reordered' AND vessel_id = tests.vessel_id('A.dra') AND template_id IS NULL
                 AND payload ->> 'area' = 'safety'), 1::bigint, 'reorder: one event for the vessel''s area');
SELECT tests.throws_like(format($q$SELECT * FROM public.form_template_reorder(%L, 'safety', (SELECT (array_agg(id))[1:1] FROM dra_safety))$q$, tests.vessel_id('A.dra')),
                         '22023', 'reorder_mismatch', 'reorder: a missing template is refused');
SELECT tests.throws_like(format($q$SELECT * FROM public.form_template_reorder(%L, 'safety', (SELECT array_agg(id) || (array_agg(id))[1] FROM dra_safety))$q$, tests.vessel_id('A.dra')),
                         '22023', 'reorder_mismatch', 'reorder: a duplicate is refused');
SELECT tests.throws_like(format($q$SELECT * FROM public.form_template_reorder(%L, 'safety', (SELECT array_agg(id) || %L::uuid FROM dra_safety))$q$, tests.vessel_id('A.dra'), pg_temp.id('v:3')),
                         '22023', 'reorder_mismatch', 'reorder: a template of another area is refused');
SELECT tests.throws_like(format($q$SELECT * FROM public.form_template_reorder(%L, 'galley', '{}')$q$, tests.vessel_id('A.dra')), '22023', 'invalid_area', 'reorder: an unknown area is refused');
SELECT tests.throws_like(format($q$SELECT * FROM public.form_template_reorder(%L, 'safety', '{}')$q$, tests.vessel_id('A.hyd')), '42501', 'vessel_out_of_reach', 'reorder: the master does not reach HYDRA');
SELECT tests.reset_role();

-- Move an area: the published template and the draft of its next version move together.
SELECT tests.as_user(tests.user_id('A.ck_admin'));
INSERT INTO ids SELECT 'm:next', (public.form_template_new_version(pg_temp.id('r:pub'))).id;
SELECT tests.is((public.form_template_move_area(pg_temp.id('r:pub'), 'movement')).area, 'movement', 'move: the published template moves to Movement');
SELECT tests.is((SELECT area FROM public.form_templates WHERE id = pg_temp.id('m:next')), 'movement', 'move: the open draft of its next version moves with it');
SELECT tests.is((SELECT (payload ->> 'drafts_moved')::integer FROM public.form_template_events WHERE template_id = pg_temp.id('r:pub') AND action = 'area_moved'), 1, 'move: one event, counting the moved draft');
SELECT tests.is((public.form_template_move_area(pg_temp.id('r:pub'), 'movement')).area, 'movement', 'move: the same area again');
SELECT tests.is(pg_temp.events(pg_temp.id('r:pub'), 'area_moved'), 1::bigint, 'move: an unchanged area writes no event');
SELECT tests.throws_like(format($q$SELECT public.form_template_move_area(%L, NULL)$q$, pg_temp.id('r:pub')), '22023', 'invalid_area', 'move: no area is refused (Unsorted is not a target)');
SELECT tests.throws_like(format($q$SELECT public.form_template_move_area(%L, 'galley')$q$, pg_temp.id('r:pub')), '22023', 'invalid_area', 'move: an unknown area is refused');
SELECT tests.reset_role();

-- ------------------------------------------------------------ run statistics (FC6) and cadence (copy of the cases in src/test/forms/cadence.test.ts)

CREATE TEMP TABLE cadence_cases (cadence text, anchor date, next_due date) ON COMMIT DROP;
INSERT INTO cadence_cases VALUES
-- cadence-cases:start
  ('daily', '2026-11-26', '2026-11-27'),
  ('daily', '2026-12-31', '2027-01-01'),
  ('weekly', '2026-11-26', '2026-12-03'),
  ('monthly', '2026-01-31', '2026-02-28'),
  ('monthly', '2028-01-31', '2028-02-29'),
  ('monthly', '2026-11-26', '2026-12-26'),
  ('quarterly', '2026-11-30', '2027-02-28'),
  ('six_monthly', '2026-08-31', '2027-02-28'),
  ('yearly', '2028-02-29', '2029-02-28'),
  ('two_yearly', '2026-11-26', '2028-11-26'),
  ('five_yearly', '2024-02-29', '2029-02-28'),
  ('none', '2026-11-26', NULL),
  ('per_voyage', '2026-11-26', NULL),
  ('per_charter', '2026-11-26', NULL),
  ('on_demand', '2026-11-26', NULL),
  (NULL, '2026-11-26', NULL),
  ('weekly', NULL, NULL)
-- cadence-cases:end
;
SELECT tests.is_empty($q$SELECT cadence, anchor FROM cadence_cases WHERE public.form_template_next_due(cadence, anchor) IS DISTINCT FROM next_due$q$,
                      'cadence: form_template_next_due answers every case');

INSERT INTO ids VALUES
  ('s:weekly', pg_temp.draft('S_WEEKLY', 'crew', 'FLEET', NULL, 'weekly')),
  ('s:monthly', pg_temp.draft('S_MONTHLY', 'crew', 'VESSEL_SPECIFIC', ARRAY[tests.vessel_id('A.dra')], 'monthly')),
  ('s:daily', pg_temp.draft('S_DAILY', 'crew', 'FLEET', NULL, 'daily')),
  ('s:voyage', pg_temp.draft('S_VOYAGE', 'crew', 'FLEET', NULL, 'per_voyage'));
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT public.form_template_publish(pg_temp.id('s:weekly')), public.form_template_publish(pg_temp.id('s:monthly')),
       public.form_template_publish(pg_temp.id('s:daily')), public.form_template_publish(pg_temp.id('s:voyage'));
SELECT public.form_template_set_visibility(pg_temp.id('s:weekly'), tests.vessel_id('A.gam'), 'hidden');
SELECT tests.reset_role();
-- Weekly on DRAAK: a signed run 10 days ago and one pending signature 9 days ago (the last); not runs: a draft, an in-progress, a rejected one, an amendment.
SELECT pg_temp.run(pg_temp.id('s:weekly'), 'A.dra', 10, 'SIGNED');
INSERT INTO ids SELECT 'run:last', pg_temp.run(pg_temp.id('s:weekly'), 'A.dra', 9, 'PENDING_SIGNATURE');
SELECT pg_temp.run(pg_temp.id('s:weekly'), 'A.dra', 1, 'DRAFT'), pg_temp.run(pg_temp.id('s:weekly'), 'A.dra', 1, 'IN_PROGRESS'),
       pg_temp.run(pg_temp.id('s:weekly'), 'A.dra', 1, 'REJECTED'), pg_temp.run(pg_temp.id('s:weekly'), 'A.dra', 1, 'SIGNED', pg_temp.id('run:last'));
-- Weekly on HYDRA: a run 2 days ago on an older version (counted for the family).
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
INSERT INTO ids SELECT 's:weekly2', (public.form_template_new_version(pg_temp.id('s:weekly'))).id;
SELECT tests.reset_role();
SELECT pg_temp.run(pg_temp.id('s:weekly'), 'A.hyd', 2, 'SIGNED');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT public.form_template_publish(pg_temp.id('s:weekly2'));
SELECT tests.reset_role();
-- Monthly on DRAAK: a run 10 days ago.
SELECT pg_temp.run(pg_temp.id('s:monthly'), 'A.dra', 10, 'SIGNED');

SELECT tests.as_user(tests.user_id('A.ck_viewer'));
SELECT tests.results_eq(
  $q$SELECT t.template_code, v.name, s.hidden, s.runs, s.last_run_on, s.next_due, s.overdue
     FROM public.form_template_run_stats(NULL, 'crew', current_date) AS s
     JOIN public.form_templates AS t ON t.id = s.template_id
     JOIN public.vessels AS v ON v.id = s.vessel_id
     ORDER BY t.template_code, v.name$q$,
  $q$VALUES
     ('S_DAILY'::text, 'GAME CHANGER'::text, false, 0::bigint, NULL::date, current_date + 1, false),
     ('S_DAILY', 'HYDRA', false, 0, NULL, current_date + 1, false),
     ('S_DAILY', 'M/Y DRAAK', false, 0, NULL, current_date + 1, false),
     ('S_MONTHLY', 'M/Y DRAAK', false, 1, current_date - 10, ((current_date - 10) + interval '1 month')::date, false),
     ('S_VOYAGE', 'GAME CHANGER', false, 0, NULL, NULL, false),
     ('S_VOYAGE', 'HYDRA', false, 0, NULL, NULL, false),
     ('S_VOYAGE', 'M/Y DRAAK', false, 0, NULL, NULL, false),
     ('S_WEEKLY', 'GAME CHANGER', true, 0, NULL, NULL, false),
     ('S_WEEKLY', 'HYDRA', false, 1, current_date - 2, current_date + 5, false),
     ('S_WEEKLY', 'M/Y DRAAK', false, 2, current_date - 9, current_date - 2, true)$q$,
  'run stats: per published template x targeted vessel; family runs, the last run, next due by cadence (never run: from the first publish), overdue, hidden, event-driven cadences');
SELECT tests.is((SELECT overdue FROM public.form_template_run_stats(NULL, 'crew', current_date + 2) WHERE template_id = pg_temp.id('s:daily') AND vessel_id = tests.vessel_id('A.hyd')),
                true, 'run stats: a never-run daily checklist is overdue two days after publishing');
SELECT tests.is((SELECT count(*) FROM public.form_template_run_stats(ARRAY[tests.vessel_id('A.hyd')], 'crew', current_date)), 3::bigint,
                'run stats: explicit vessels limit the rows');
SELECT tests.throws_like($q$SELECT * FROM public.form_template_run_stats(ARRAY[tests.vessel_id('B.lev')])$q$, '42501', 'vessel_out_of_reach', 'run stats: another company''s vessel is out of reach');
SELECT tests.throws_like($q$SELECT * FROM public.form_template_run_stats(NULL, 'galley')$q$, '22023', 'invalid_area', 'run stats: an unknown area is refused');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is((SELECT count(*) FROM public.form_template_run_stats(ARRAY[tests.vessel_id('A.dra')], 'crew', current_date)), 4::bigint, 'run stats: the DRAAK master reads DRAAK');
SELECT tests.throws_like($q$SELECT * FROM public.form_template_run_stats(ARRAY[tests.vessel_id('A.hyd')])$q$, '42501', 'vessel_out_of_reach', 'run stats: the DRAAK master does not reach HYDRA');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.throws_like($q$SELECT * FROM public.form_template_run_stats(ARRAY[tests.vessel_id('A.hyd')])$q$, '42501', 'not_permitted', 'run stats: crew without checklists access are refused an explicit vessel');
SELECT tests.is((SELECT count(*) FROM public.form_template_run_stats()), 0::bigint, 'run stats: crew without checklists access read no vessel');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws_like($q$SELECT * FROM public.form_template_run_stats()$q$, '42501', 'not_permitted', 'run stats: an inactive user is refused');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is((SELECT count(*) FROM public.form_template_run_stats(NULL, 'crew')), 0::bigint, 'run stats: company B sees none of A''s templates');
SELECT tests.reset_role();

-- ------------------------------------------------------------ settings and events: direct writes refused for every role, RLS

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('dpa', 'A.fleet_manager'), ('service', NULL), ('owner', NULL)) AS v(label, user_key) LOOP
    IF r.label = 'service' THEN
      PERFORM tests.as_service();
    ELSIF r.label = 'owner' THEN
      PERFORM tests.reset_role();
    ELSE
      PERFORM tests.as_user(tests.user_id(r.user_key));
    END IF;
    IF r.label = 'dpa' THEN
      PERFORM tests.denied(format($q$INSERT INTO public.form_template_vessel_settings (template_id, vessel_id, company_id, visibility) VALUES (%L, %L, %L, 'shown') RETURNING *$q$,
                                  pg_temp.id('v:3'), tests.vessel_id('A.hyd'), tests.company_id('A')), 'settings (dpa): no direct insert');
      PERFORM tests.denied($q$UPDATE public.form_template_vessel_settings SET visibility = 'shown', hidden_by = NULL, hidden_at = NULL, reason = NULL RETURNING *$q$, 'settings (dpa): no direct update');
      PERFORM tests.denied($q$DELETE FROM public.form_template_events RETURNING *$q$, 'events (dpa): no direct delete');
      PERFORM tests.denied(format($q$INSERT INTO public.form_template_events (company_id, template_id, action) VALUES (%L, %L, 'published') RETURNING *$q$,
                                  tests.company_id('A'), pg_temp.id('v:3')), 'events (dpa): no direct insert');
    ELSE
      PERFORM tests.throws_like(format($q$INSERT INTO public.form_template_vessel_settings (template_id, vessel_id, company_id, visibility) VALUES (%L, %L, %L, 'shown')$q$,
                                       pg_temp.id('v:3'), tests.vessel_id('A.hyd'), tests.company_id('A')),
                                '42501', 'form_template_vessel_settings_guarded', format('settings (%s): no direct insert', r.label));
      PERFORM tests.throws_like($q$UPDATE public.form_template_vessel_settings SET sort_order = 9$q$, '42501', 'form_template_vessel_settings_guarded', format('settings (%s): no direct update', r.label));
      PERFORM tests.throws_like($q$DELETE FROM public.form_template_vessel_settings$q$, '42501', 'form_template_vessel_settings_guarded', format('settings (%s): no direct delete', r.label));
      PERFORM tests.throws_like(format($q$INSERT INTO public.form_template_events (company_id, template_id, action) VALUES (%L, %L, 'published')$q$, tests.company_id('A'), pg_temp.id('v:3')),
                                '42501', 'form_template_events_guarded', format('events (%s): no direct insert', r.label));
      PERFORM tests.throws_like($q$UPDATE public.form_template_events SET comment = 'rewritten'$q$, '42501', 'form_template_events_guarded', format('events (%s): never updated', r.label));
      PERFORM tests.throws_like($q$DELETE FROM public.form_template_events$q$, '42501', 'form_template_events_guarded', format('events (%s): never deleted', r.label));
    END IF;
  END LOOP;
  PERFORM tests.reset_role();
END
$$;
SELECT set_config('storm.fleet_tx', 'on', true);
SELECT tests.throws_like(format($q$INSERT INTO public.form_template_vessel_settings (template_id, vessel_id, company_id, visibility) VALUES (%L, %L, %L, 'shown')$q$,
                                pg_temp.id('v:3'), tests.vessel_id('B.lev'), tests.company_id('A')),
                         '42501', 'form_template_vessel_settings_guarded', 'settings: even under the flag a vessel of another company is refused');
SELECT set_config('storm.fleet_tx', '', true);

SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is((SELECT count(*) FROM public.form_template_vessel_settings WHERE vessel_id = tests.vessel_id('A.hyd')) > 0, true, 'rls: HYDRA crew read HYDRA''s settings');
SELECT tests.is((SELECT count(*) FROM public.form_template_vessel_settings WHERE vessel_id <> tests.vessel_id('A.hyd')), 0::bigint, 'rls: HYDRA crew read no other vessel''s settings');
SELECT tests.is((SELECT count(*) FROM public.form_template_events), 0::bigint, 'rls: crew read no template history');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is((SELECT count(*) FROM public.form_template_events WHERE vessel_id IS NULL), 0::bigint, 'rls: the DRAAK master reads no fleet-level history');
SELECT tests.is((SELECT count(*) FROM public.form_template_events WHERE vessel_id = tests.vessel_id('A.dra')) > 0, true, 'rls: the DRAAK master reads DRAAK''s history');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.ck_viewer'));
SELECT tests.is((SELECT count(*) FROM public.form_template_events) = (SELECT count(*) FROM public.form_template_events WHERE company_id = tests.company_id('A')), true,
                'rls: the fleet checklist reader reads only company A''s history');
SELECT tests.ok((SELECT count(*) FROM public.form_template_events) > 10 AND (SELECT count(*) FROM public.form_template_vessel_settings) > 3,
                'rls: the fleet checklist reader reads the history and every vessel''s settings');
SELECT tests.is((SELECT count(*) FROM public.form_templates WHERE status = 'DRAFT'), 0::bigint, 'rls: a checklist viewer reads no drafts');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.ck_admin'));
SELECT tests.ok((SELECT count(*) FROM public.form_templates WHERE status = 'DRAFT' AND created_by <> tests.user_id('A.ck_admin')) > 0,
                'rls: a fleet checklist admin reads other people''s drafts (to publish them)');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is((SELECT count(*) FROM public.form_templates WHERE company_id = tests.company_id('A')), 0::bigint, 'rls: company B reads none of A''s templates');
SELECT tests.is((SELECT count(*) FROM public.form_template_vessel_settings), 0::bigint, 'rls: company B reads none of A''s settings');
SELECT tests.is((SELECT count(*) FROM public.form_template_events WHERE company_id = tests.company_id('A')), 0::bigint, 'rls: company B reads none of A''s history');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is((SELECT count(*) FROM public.form_templates), 0::bigint, 'rls: an inactive user reads no template');
SELECT tests.is((SELECT count(*) FROM public.form_template_vessel_settings), 0::bigint, 'rls: an inactive user reads no setting');
SELECT tests.reset_role();
SELECT tests.as_anon();
SELECT tests.denied($q$SELECT * FROM public.form_template_vessel_settings$q$, 'rls: anon reads no setting');
SELECT tests.reset_role();
