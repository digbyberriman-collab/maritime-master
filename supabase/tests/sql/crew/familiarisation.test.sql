-- Familiarisation per vessel and position (X1-10,
-- 20261124061000_crew_familiarisation.sql; gap/04 C63, C36, W11, C18, C2;
-- T-15, T-134; DECISIONS C21, D-X1-6, D-X1-24, D-128):
--   1. parity with the TS mirrors (src/modules/crew/lib/familiarisation.ts,
--      loaded through scripts/db/lib/load-ts.mjs): decideStatus,
--      isOverdue, checkAction, decideActor, normaliseSections and the
--      legacy status mapping, case by case;
--   2. templates: codes from format_reference (FAM-<vessel>-<year>-nnn,
--      fleet FAM-<year>-nnn), unique per company and never max()+1; the
--      save's gates (vessel edit; fleet: company-level edit and fleet
--      reach), refusals with HINT, the positions, the requirement row kept
--      in step (C36), vessel variants replacing a fleet template (T-134);
--   3. start copies the chosen template's sections (not the default
--      sections, the C63 bug), due date = join + due within, refusals;
--   4. ticks: own and editor, the status machine;
--   5. sign rules: the crew member on their own record (a login), the
--      supervisor with approve in the person's department (the Master for
--      every department), never their own; completion on the required
--      signatures;
--   6. reopen and delete rules;
--   7. required records opened on a crew_assignment_terms insert (Add
--      Crew, transfer) for a person without a login (the insert succeeds)
--      and for a login (familiarisation_assigned sent);
--   8. the guards: signed-in direct writes refused, legacy statuses mapped;
--   9. the reads: overview counts, record detail and its rights, RLS
--      (another tenant, no reach, inactive, external, anon);
--  10. the requirement engine counts a completed record by profile;
--  11. the onboarding and dashboard RPC gates and shapes;
--  12. the familiarisation_assigned emitter, grants.

\set parity `node --input-type=module -e "const lt0=await import('./scripts/db/lib/load-ts.mjs'); const f='src/modules/crew/lib/familiarisation.ts'; const r=await lt0.loadTs([f]); const F=r.modules[f]; const tf=[true,false]; const st=[]; for (let t=0;t<=3;t++) for (let d=0;d<=t+1;d++) for (const a of tf) for (const b of tf) for (const c of tf) for (const e of tf) st.push([t,d,a,b,c,e,F.decideStatus(t,d,a,b,c,e)]); st.push([null,null,null,null,null,null,F.decideStatus(null,null,null,null,null,null)]); st.push([2,2,null,null,null,null,F.decideStatus(2,2,null,null,null,null)]); const days=['2026-03-04','2026-03-05','2026-03-06',null]; const od=[]; for (const s of ['open','in_progress','awaiting_signatures','completed',null]) for (const du of days) for (const td of ['2026-03-05',null]) od.push([s,du,td,F.isOverdue(s,du,td)]); const ac=[]; for (const x of ['tick','sign_crew','sign_supervisor','reopen','delete','bogus']) for (const s of ['open','in_progress','awaiting_signatures','completed','draft',null]) for (const d of [0,1,null]) for (const a of tf) for (const b of tf) for (const c of [true,false,null]) for (const e of [true,false,null]) ac.push([x,s,d,a,b,c,e,F.checkAction(x,s,d,a,b,c,e)]); const at=[]; for (const x of ['tick','sign_crew','sign_supervisor','reopen','delete','bogus']) for (const o of [true,false,null]) for (const l of tf) for (const v of tf) for (const e of tf) for (const c of tf) for (const sc of ['ok','out_of_department','own_record','not_permitted',null]) at.push([x,o,l,v,e,c,sc,F.decideActor(x,o,l,v,e,c,sc)]); const secCases=[null,[],'x',[{section_name:'A',checklist_items:['a']}],[{section_name:'  Deck  ',checklist_items:['  one ','two'],required_days:3}],[{section_name:'A',checklist_items:['a']},{section_name:'a',checklist_items:['b']}],[{section_name:'',checklist_items:['a']}],[{section_name:5,checklist_items:['a']}],[{section_name:'A',checklist_items:[]}],[{section_name:'A',checklist_items:['']}],[{section_name:'A',checklist_items:[3]}],[{section_name:'A',checklist_items:['a'],required_days:1.5}],[{section_name:'A',checklist_items:['a'],required_days:-1}],[{section_name:'A',checklist_items:['a'],required_days:366}],[{section_name:'A',checklist_items:['a'],required_days:null}],[{section_name:'x'.repeat(121),checklist_items:['a']}],[{section_name:'A',checklist_items:['y'.repeat(301)]}],[{section_name:'A',checklist_items:['y'.repeat(300)]}],Array.from({length:31},(_,i)=>({section_name:'S'+i,checklist_items:['a']})),[{section_name:'A',checklist_items:Array.from({length:61},(_,i)=>'i'+i)}],[1],[{section_name:'\t Tabbed \n',checklist_items:['\tx\n']}]]; const sec=secCases.map(c=>[c,F.normaliseSections(c)]); const legacy=['Not_Started','In_Progress','Overdue','Completed','open','in_progress','awaiting_signatures','completed',''].map(x=>[x,F.mapLegacyStatus(x)]); process.stdout.write(JSON.stringify([st,od,ac,at,sec,legacy]));"`
CREATE TEMP TABLE px ON COMMIT DROP AS SELECT :'parity'::jsonb AS j;
GRANT SELECT ON px TO PUBLIC;

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ world (A.dra unless named)

SELECT tests.seed_role('x110_fam_view', 'vessel');
SELECT tests.seed_role('x110_fam_edit', 'vessel');
SELECT tests.seed_role('x110_crew_list', 'vessel');
SELECT tests.seed_role('x110_list_flag', 'vessel');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, x.k, x.p::public.permission_level, 'vessel'
FROM (VALUES ('x110_fam_view', 'training', 'view'), ('x110_fam_edit', 'training', 'edit'),
             ('x110_crew_list', 'crew_roster', 'view'), ('x110_list_flag', 'crew.see_crew_list', 'view')) AS x(r, k, p)
JOIN public.roles AS r ON r.name = x.r;

CREATE OR REPLACE FUNCTION pg_temp.crew(p_key text, p_vessel text, p_position text, p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM tests.seed_user('A', p_key, 'crew');
  PERFORM tests.seed_assignment(p_key, p_vessel, true, p_position, p_extra);
END;
$$;
SELECT pg_temp.crew('A.x110_chief_stew', 'A.dra', 'Chief Stewardess', '{"department": "Interior"}');
SELECT pg_temp.crew('A.x110_stew', 'A.dra', 'Second Stewardess', '{"department": "Interior"}');
SELECT pg_temp.crew('A.x110_officer', 'A.dra', 'Chief Officer');
SELECT pg_temp.crew('A.x110_deck', 'A.dra', 'Deckhand');
SELECT pg_temp.crew('A.x110_deck2', 'A.dra', 'Deckhand');
SELECT pg_temp.crew('A.x110_viewer', 'A.dra', 'Deckhand');
SELECT pg_temp.crew('A.x110_ext', 'A.dra', 'Deckhand');
SELECT pg_temp.crew('A.x110_listonly', 'A.dra', 'Deckhand');
SELECT pg_temp.crew('A.x110_hyd', 'A.hyd', 'Deckhand');
SELECT tests.seed_profile('A', 'A.x110_ghost', 'crew', 'not_invited', NULL,
  jsonb_build_object('is_imported', true, 'imported_vessel_id', tests.vessel_id('A.dra'), 'rank', 'Deckhand'));
SELECT tests.seed_assignment('A.disabled', 'A.dra', true, 'Deckhand');
SELECT tests.seed_user('B', 'B.x110_crew', 'crew');
SELECT tests.seed_assignment('B.x110_crew', 'B.lev', true, 'Deckhand');
SELECT tests.seed_rbac_role('A.x110_chief_stew', 'x110_fam_edit', 'A.dra');
SELECT tests.seed_rbac_role('A.x110_officer', 'x110_fam_edit', 'A.dra');
SELECT tests.seed_rbac_role('A.master_dra', 'x110_fam_edit', 'A.dra');
SELECT tests.seed_rbac_role('A.x110_viewer', 'x110_fam_view', 'A.dra');
SELECT tests.seed_rbac_role('A.x110_viewer', 'x110_crew_list', 'A.dra');
SELECT tests.seed_rbac_role('A.x110_ext', 'x110_fam_edit', 'A.dra');
SELECT tests.seed_rbac_role('A.x110_listonly', 'x110_list_flag', 'A.dra');
SELECT tests.seed_rbac_role('A.x110_ext', 'x110_crew_list', 'A.dra');
SELECT tests.seed_rbac_role('A.disabled', 'x110_fam_edit', 'A.dra');
SELECT tests.seed_rbac_role('A.x110_hyd', 'x110_fam_edit', 'A.hyd');
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'external', vessel_scope = 'assigned', fleet_access = false, source = 'admin',
    valid_from = now() - interval '1 day', valid_until = now() + interval '7 days'
WHERE user_id = tests.user_id('A.x110_ext');
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT id, company_id, tests.vessel_id('A.dra') FROM public.account_memberships WHERE user_id = tests.user_id('A.x110_ext');

CREATE OR REPLACE FUNCTION pg_temp.pos(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT md5('storm.position.' || p_key)::uuid $$;
CREATE TEMP TABLE out_ids (k text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT ALL ON out_ids TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.oid(p_k text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM out_ids WHERE k = p_k $$;
GRANT EXECUTE ON FUNCTION pg_temp.oid(text) TO PUBLIC;
-- The engine flag is transaction-local: reset it before each guard check.
CREATE OR REPLACE FUNCTION pg_temp.engine_off() RETURNS void LANGUAGE sql AS $$ SELECT set_config('storm.crew_engine', 'off', true) $$;
GRANT EXECUTE ON FUNCTION pg_temp.engine_off() TO PUBLIC;
-- The items of a record as "section|text|done" in order.
CREATE OR REPLACE FUNCTION pg_temp.items(p_record uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT string_agg(i.section_name || '|' || i.item_text || '|' || i.completed::text, ';' ORDER BY i.item_order)
  FROM public.familiarization_checklist_items AS i WHERE i.familiarization_id = p_record
$$;
CREATE OR REPLACE FUNCTION pg_temp.item_id(p_record uuid, p_n integer) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT i.id FROM public.familiarization_checklist_items AS i WHERE i.familiarization_id = p_record ORDER BY i.item_order OFFSET p_n - 1 LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION pg_temp.item_id(uuid, integer) TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.status(p_record uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT status FROM public.familiarization_records WHERE id = p_record
$$;

-- Setup checks (so each refusal below is the one it claims to be).
SELECT tests.ok(public.has_capability_for(tests.user_id('A.x110_chief_stew'), 'vessel.crew.familiarisation.approve', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.has_capability_for(tests.user_id('A.x110_chief_stew'), 'vessel.crew.familiarisation.edit', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT coalesce(public.fleet_reach_for(tests.user_id('A.x110_chief_stew'), tests.company_id('A')), false),
  'setup: the Chief Stew edits and approves familiarisation on DRAAK, without fleet reach');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.x110_viewer'), 'vessel.crew.familiarisation.view', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.x110_viewer'), 'vessel.crew.familiarisation.edit', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.x110_stew'), 'vessel.crew.familiarisation.view', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.has_capability_for(tests.user_id('A.x110_stew'), 'vessel.crew.familiarisation.view_own', tests.company_id('A'), tests.vessel_id('A.dra')),
  'setup: the viewer reads familiarisation only; the stew has view_own only');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.fleet_manager'), 'vessel.crew.familiarisation.edit', tests.company_id('A'), NULL)
                AND (coalesce(public.fleet_reach_for(tests.user_id('A.fleet_manager'), tests.company_id('A')), false)
                     OR coalesce(public.is_company_actor(tests.user_id('A.fleet_manager'), NULL), false)),
  'setup: the fleet manager keeps fleet templates');
SELECT tests.is(public.familiarisation_supervisor_scope(tests.user_id('A.x110_chief_stew'), tests.profile_id('A.x110_stew'), tests.vessel_id('A.dra')), 'ok',
  'setup: the Chief Stew supervises the stew (Interior)');
SELECT tests.is(public.familiarisation_supervisor_scope(tests.user_id('A.x110_officer'), tests.profile_id('A.x110_stew'), tests.vessel_id('A.dra')), 'out_of_department',
  'setup: the Chief Officer (Deck) does not supervise the stew');
SELECT tests.is(public.familiarisation_supervisor_scope(tests.user_id('A.master_dra'), tests.profile_id('A.x110_stew'), tests.vessel_id('A.dra')), 'ok',
  'setup: the Master supervises every department');
SELECT tests.is(public.familiarisation_supervisor_scope(tests.user_id('A.x110_chief_stew'), tests.profile_id('A.x110_chief_stew'), tests.vessel_id('A.dra')), 'own_record',
  'setup: nobody supervises themselves');
SELECT tests.is(public.familiarisation_supervisor_scope(tests.user_id('A.x110_viewer'), tests.profile_id('A.x110_deck'), tests.vessel_id('A.dra')), 'not_permitted',
  'setup: a viewer supervises nobody');

-- ------------------------------------------------------------ 1. parity with the TS mirrors

SELECT tests.is(
  (SELECT count(*) FROM jsonb_array_elements((SELECT j -> 0 FROM px)) AS c
   WHERE public.familiarisation_status_decide((c ->> 0)::integer, (c ->> 1)::integer, (c ->> 2)::boolean, (c ->> 3)::boolean, (c ->> 4)::boolean, (c ->> 5)::boolean)
         IS DISTINCT FROM c ->> 6),
  0::bigint, 'familiarisation_status_decide equals decideStatus on every case');
SELECT tests.ok((SELECT jsonb_array_length(j -> 0) FROM px) >= 220, 'decideStatus cases cover every count and flag');
SELECT tests.is(
  (SELECT count(*) FROM jsonb_array_elements((SELECT j -> 1 FROM px)) AS c
   WHERE public.familiarisation_overdue(c ->> 0, (c ->> 1)::date, (c ->> 2)::date) IS DISTINCT FROM (c ->> 3)::boolean),
  0::bigint, 'familiarisation_overdue equals isOverdue on every case');
SELECT tests.is(
  (SELECT count(*) FROM jsonb_array_elements((SELECT j -> 2 FROM px)) AS c
   WHERE public.familiarisation_action_check(c ->> 0, c ->> 1, (c ->> 2)::integer, (c ->> 3)::boolean, (c ->> 4)::boolean, (c ->> 5)::boolean, (c ->> 6)::boolean)
         IS DISTINCT FROM c ->> 7),
  0::bigint, 'familiarisation_action_check equals checkAction on every case');
SELECT tests.is(
  (SELECT count(*) FROM jsonb_array_elements((SELECT j -> 3 FROM px)) AS c
   WHERE public.familiarisation_actor_decide(c ->> 0, (c ->> 1)::boolean, (c ->> 2)::boolean, (c ->> 3)::boolean, (c ->> 4)::boolean, (c ->> 5)::boolean, c ->> 6)
         IS DISTINCT FROM c ->> 7),
  0::bigint, 'familiarisation_actor_decide equals decideActor on every case');
CREATE OR REPLACE FUNCTION pg_temp.sections_sql(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN jsonb_build_object('ok', true, 'sections', public.familiarisation_sections_normalise(p));
EXCEPTION WHEN invalid_parameter_value THEN
  RETURN jsonb_build_object('ok', false, 'problem', SQLERRM);
END;
$$;
SELECT tests.is(
  (SELECT count(*) FROM jsonb_array_elements((SELECT j -> 4 FROM px)) AS c
   WHERE pg_temp.sections_sql(c -> 0)
         IS DISTINCT FROM CASE WHEN (c -> 1 ->> 'ok')::boolean THEN c -> 1 ELSE jsonb_build_object('ok', false, 'problem', c -> 1 ->> 'problem') END),
  0::bigint, 'familiarisation_sections_normalise equals normaliseSections on every case (normalised sections, or the same refusal)');
-- The legacy mapping (the record guard), through rows written as maintenance.
INSERT INTO public.familiarization_templates (id, vessel_id, template_name, sections)
VALUES (tests.id('tpl:legacy'), tests.vessel_id('A.dra'), 'Legacy induction', '[{"section_name":"Old","checklist_items":["a"]}]');
CREATE OR REPLACE FUNCTION pg_temp.legacy_map(p_status text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  INSERT INTO public.familiarization_records (id, user_id, vessel_id, template_id, join_date, target_completion_date, status)
  VALUES (tests.id('legacy:' || p_status), tests.user_id('A.x110_deck2'), tests.vessel_id('A.dra'), tests.id('tpl:legacy'),
          current_date - 10, current_date + 4, p_status)
  RETURNING status INTO v;
  DELETE FROM public.familiarization_records WHERE id = tests.id('legacy:' || p_status);
  RETURN v;
END;
$$;
SELECT tests.is(
  (SELECT count(*) FROM jsonb_array_elements((SELECT j -> 5 FROM px)) AS c
   WHERE c ->> 0 <> '' AND pg_temp.legacy_map(c ->> 0) IS DISTINCT FROM c ->> 1),
  0::bigint, 'the record guard maps legacy statuses as mapLegacyStatus does');

-- ------------------------------------------------------------ 2. templates

SELECT tests.as_user(tests.user_id('A.x110_chief_stew'));
INSERT INTO out_ids SELECT 'tpl_int', (public.familiarisation_template_save(tests.vessel_id('A.dra'), NULL, jsonb_build_object(
  'name', '  Interior induction ', 'description', 'Interior department familiarisation', 'due_within_days', 7,
  'sections', jsonb_build_array(jsonb_build_object('section_name', 'Guest areas', 'checklist_items', jsonb_build_array('Laundry', 'Pantry')),
                                jsonb_build_object('section_name', 'Safety', 'checklist_items', jsonb_build_array('Muster'))),
  'position_ids', jsonb_build_array(pg_temp.pos('second_stew'), pg_temp.pos('steward')))) ->> 'id')::uuid;
INSERT INTO out_ids SELECT 'tpl_deck', (public.familiarisation_template_save(tests.vessel_id('A.dra'), NULL, jsonb_build_object(
  'name', 'Deck induction', 'due_within_days', 10, 'requires_crew_signature', false,
  'sections', jsonb_build_array(jsonb_build_object('section_name', 'Mooring', 'checklist_items', jsonb_build_array('Lines', 'Fenders'))),
  'position_ids', jsonb_build_array(pg_temp.pos('deckhand')))) ->> 'id')::uuid;
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT code, template_name, scope, vessel_id = %L, company_id = %L, due_within_days, requires_crew_signature, requires_supervisor_signature, created_by = %L
            FROM public.familiarization_templates WHERE id IN (%L, %L) ORDER BY code$q$,
         tests.vessel_id('A.dra'), tests.company_id('A'), tests.user_id('A.x110_chief_stew'), pg_temp.oid('tpl_int'), pg_temp.oid('tpl_deck')),
  format($q$VALUES (%L, 'Interior induction', 'vessel', true, true, 7, true, true, true), (%L, 'Deck induction', 'vessel', true, true, 10, false, true, true)$q$,
         (SELECT code FROM public.familiarization_templates WHERE id = pg_temp.oid('tpl_int')),
         (SELECT code FROM public.familiarization_templates WHERE id = pg_temp.oid('tpl_deck'))),
  'vessel templates are saved with their fields (the name trimmed)');
SELECT tests.ok((SELECT t.code ~ ('^FAM-' || upper(v.code) || '-' || to_char(current_date, 'YYYY') || '-[0-9]{3}$')
                 FROM public.familiarization_templates AS t JOIN public.vessels AS v ON v.id = t.vessel_id WHERE t.id = pg_temp.oid('tpl_int')),
  'a vessel template code is FAM-<vessel code>-<year>-nnn (C21, D-X1-24)');
SELECT tests.is(
  (SELECT substring((SELECT code FROM public.familiarization_templates WHERE id = pg_temp.oid('tpl_deck')) FROM '[0-9]{3,}$')::integer
        - substring((SELECT code FROM public.familiarization_templates WHERE id = pg_temp.oid('tpl_int')) FROM '[0-9]{3,}$')::integer),
  1, 'the next vessel template takes the next number of the counter');
SELECT tests.ok(EXISTS (SELECT 1 FROM public.reference_counters AS c
                        WHERE c.scope = public.reference_counter_scope('FAM', tests.company_id('A'), tests.vessel_id('A.dra'), current_date, false)),
  'the numbers come from format_reference''s counter (reference_counters), never max()+1');
SELECT tests.is((SELECT sections FROM public.familiarization_templates WHERE id = pg_temp.oid('tpl_int')),
  '[{"section_name": "Guest areas", "checklist_items": ["Laundry", "Pantry"]}, {"section_name": "Safety", "checklist_items": ["Muster"]}]'::jsonb,
  'the sections are stored normalised');
SELECT tests.results_eq(
  format($q$SELECT position_id, vessel_id = %L FROM public.familiarization_template_positions WHERE template_id = %L ORDER BY position_id$q$,
         tests.vessel_id('A.dra'), pg_temp.oid('tpl_int')),
  format($q$SELECT x, true FROM unnest(ARRAY[%L, %L]::uuid[]) AS x ORDER BY x$q$, pg_temp.pos('second_stew'), pg_temp.pos('steward')),
  'the required positions are stored on the template''s vessel');
-- C36: one familiarisation requirement row per vessel, ticked for the positions.
SELECT tests.results_eq(
  format($q$SELECT r.group_key, r.kind, r.label, (SELECT count(*) FROM public.crew_requirement_positions AS rp WHERE rp.row_id = r.id)::integer,
                   EXISTS (SELECT 1 FROM public.crew_requirement_options AS o WHERE o.row_id = r.id AND o.familiarization_template_id = %L)
            FROM public.crew_requirement_rows AS r WHERE r.seed_key = %L$q$,
         pg_temp.oid('tpl_int'), 'familiarisation.' || replace(pg_temp.oid('tpl_int')::text, '-', '_')),
  $q$VALUES ('familiarisation', 'familiarisation', 'Interior induction', 2, true)$q$,
  'Crew Compliance gets a familiarisation requirement row for the template, ticked for its positions (C36)');

-- Fleet templates: the fleet office; FAM-<year>-nnn; vessel_id NULL.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
INSERT INTO out_ids SELECT 'tpl_fleet', (public.familiarisation_template_save(tests.vessel_id('A.dra'), NULL, jsonb_build_object(
  'name', '24-hour safety familiarisation', 'scope', 'fleet', 'due_within_days', 1,
  'sections', jsonb_build_array(jsonb_build_object('section_name', 'Alarms', 'checklist_items', jsonb_build_array('General alarm', 'Muster station'))),
  'position_ids', jsonb_build_array(pg_temp.pos('deckhand'), pg_temp.pos('second_stew')))) ->> 'id')::uuid;
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT scope, vessel_id IS NULL, code ~ ('^FAM-' || to_char(current_date, 'YYYY') || '-[0-9]{3}$') FROM public.familiarization_templates WHERE id = %L$q$, pg_temp.oid('tpl_fleet')),
  $q$VALUES ('fleet', true, true)$q$, 'a fleet template has no vessel and the code FAM-<year>-nnn');
SELECT tests.is((SELECT count(*) FROM public.crew_requirement_rows WHERE seed_key = 'familiarisation.' || replace(pg_temp.oid('tpl_fleet')::text, '-', '_')),
  (SELECT count(*) FROM public.vessels WHERE company_id = tests.company_id('A')),
  'a fleet template with positions is a requirement on every vessel of the company');
SELECT tests.is((SELECT count(DISTINCT code) FROM public.familiarization_templates WHERE company_id = tests.company_id('A') AND code IS NOT NULL),
  (SELECT count(*) FROM public.familiarization_templates WHERE company_id = tests.company_id('A') AND code IS NOT NULL),
  'codes are unique per company');
SELECT tests.throws_like(format($q$INSERT INTO public.familiarization_templates (company_id, vessel_id, template_name, code) VALUES (%L, %L, 'Dup', %L)$q$,
  tests.company_id('A'), tests.vessel_id('A.hyd'), (SELECT code FROM public.familiarization_templates WHERE id = pg_temp.oid('tpl_int'))),
  '23505', '%familiarization_templates_company_code_key%', 'a second template cannot take a code of the company');

SELECT tests.as_user(tests.user_id('A.x110_chief_stew'));
SELECT tests.throws_like(format($q$SELECT public.familiarisation_template_save(%L, NULL, '{"name":"x","scope":"fleet","sections":[{"section_name":"A","checklist_items":["a"]}]}')$q$, tests.vessel_id('A.dra')),
  '42501', 'crew_not_permitted', 'a vessel editor without fleet reach keeps no fleet template');
-- D-376: a vessel-limited admin (admin membership over DRAAK only) with the
-- seeded captain role bound to DRAAK is no fleet office: the fleet save is
-- refused (company-wide answer, admin_scope_all instead of is_company_actor)
-- and the overview says so.
SELECT tests.reset_role();
SELECT tests.seed_user('A', 'A.x110_vcap', 'crew');
SELECT tests.seed_rbac_role('A.x110_vcap', 'captain', 'A.dra');
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'admin', status = 'active', fleet_access = false, vessel_scope = 'assigned',
    is_dpa = false, manages_admins = false, source = 'admin', users_access_level = 'read'
WHERE user_id = tests.user_id('A.x110_vcap');
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT m.id, m.company_id, tests.vessel_id('A.dra') FROM public.account_memberships AS m WHERE m.user_id = tests.user_id('A.x110_vcap');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.x110_vcap'), 'vessel.crew.familiarisation.edit', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.has_capability_for(tests.user_id('A.x110_vcap'), 'vessel.crew.familiarisation.edit', tests.company_id('A'), NULL)
                AND NOT public.has_company_capability_for(tests.user_id('A.x110_vcap'), 'vessel.crew.familiarisation.edit', tests.company_id('A'))
                AND NOT public.admin_scope_all(tests.user_id('A.x110_vcap'), tests.company_id('A')),
                'setup: the vessel-limited admin edits DRAAK''s familiarisation, but holds no company-wide answer and is no all-vessel admin');
SELECT tests.as_user(tests.user_id('A.x110_vcap'));
SELECT tests.throws_like(format($q$SELECT public.familiarisation_template_save(%L, NULL, '{"scope":"fleet","name":"Probe fleet template","sections":[{"section_name":"Bridge","checklist_items":["Probe item"]}]}')$q$, tests.vessel_id('A.dra')),
  '42501', 'crew_not_permitted', 'a vessel-limited admin with a vessel-bound captain role keeps no fleet template');
SELECT tests.is((public.familiarisation_vessel_overview(tests.vessel_id('A.dra')) ->> 'can_edit_fleet_templates')::boolean, false,
  'and the overview says they cannot edit fleet templates');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.familiarization_templates WHERE template_name = 'Probe fleet template'), 0::bigint, 'no fleet template was written');
SELECT tests.as_user(tests.user_id('A.x110_chief_stew'));
SELECT tests.throws_like(format($q$SELECT public.familiarisation_template_save(%L, NULL, '{"name":"x","colour":"red"}')$q$, tests.vessel_id('A.dra')),
  '22023', 'field_unknown', 'an unknown field is refused');
SELECT tests.throws_like(format($q$SELECT public.familiarisation_template_save(%L, NULL, '{"name":"  ","sections":[{"section_name":"A","checklist_items":["a"]}]}')$q$, tests.vessel_id('A.dra')),
  '22023', 'name_required', 'a name is required');
SELECT tests.throws_like(format($q$SELECT public.familiarisation_template_save(%L, NULL, '{"name":"x"}')$q$, tests.vessel_id('A.dra')),
  '22023', 'sections_required', 'a new template needs sections');
SELECT tests.throws_like(format($q$SELECT public.familiarisation_template_save(%L, NULL, '{"name":"x","due_within_days":400,"sections":[{"section_name":"A","checklist_items":["a"]}]}')$q$, tests.vessel_id('A.dra')),
  '22023', 'due_invalid', 'due within is 0 to 365 days');
SELECT tests.throws_like(format($q$SELECT public.familiarisation_template_save(%L, NULL, jsonb_build_object('name','x','sections','[{"section_name":"A","checklist_items":["a"]}]'::jsonb,'position_ids', jsonb_build_array(%L)))$q$,
  tests.vessel_id('A.dra'), gen_random_uuid()), '22023', 'position_unknown', 'an unknown position is refused');
SELECT tests.throws_like(format($q$SELECT public.familiarisation_template_save(%L, %L, '{"scope":"fleet"}')$q$, tests.vessel_id('A.dra'), pg_temp.oid('tpl_int')),
  '22023', 'scope_locked', 'a template keeps its scope');
SELECT tests.throws_like(format($q$SELECT public.familiarisation_template_save(%L, %L, '{"name":"x"}')$q$, tests.vessel_id('A.dra'), pg_temp.oid('tpl_fleet')),
  '42501', 'crew_not_permitted', 'a vessel editor does not change a fleet template');
SELECT tests.throws_like(format($q$SELECT public.familiarisation_template_save(%L, %L, '{"name":"x"}')$q$, tests.vessel_id('A.hyd'), pg_temp.oid('tpl_int')),
  '42501', 'crew_not_permitted', 'not on a vessel the editor does not read');
-- Saving positions again keeps the requirement row in step.
SELECT tests.lives(format($q$SELECT public.familiarisation_template_save(%L, %L, jsonb_build_object('position_ids', jsonb_build_array(%L)))$q$,
  tests.vessel_id('A.dra'), pg_temp.oid('tpl_int'), pg_temp.pos('second_stew')), 'the positions are saved again');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.crew_requirement_positions AS rp JOIN public.crew_requirement_rows AS r ON r.id = rp.row_id
                 WHERE r.seed_key = 'familiarisation.' || replace(pg_temp.oid('tpl_int')::text, '-', '_'))::integer, 1,
  'the requirement row follows the template''s positions');
SELECT tests.as_user(tests.user_id('A.x110_viewer'));
SELECT tests.throws_like(format($q$SELECT public.familiarisation_template_save(%L, NULL, '{"name":"x","sections":[{"section_name":"A","checklist_items":["a"]}]}')$q$, tests.vessel_id('A.dra')),
  '42501', 'crew_not_permitted', 'a viewer saves no template');
SELECT tests.as_user(tests.user_id('A.x110_ext'));
SELECT tests.throws(format($q$SELECT public.familiarisation_template_save(%L, NULL, '{"name":"x","sections":[{"section_name":"A","checklist_items":["a"]}]}')$q$, tests.vessel_id('A.dra')),
  '42501', 'an external viewer saves no template');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws(format($q$SELECT public.familiarisation_template_save(%L, NULL, '{"name":"x","sections":[{"section_name":"A","checklist_items":["a"]}]}')$q$, tests.vessel_id('A.dra')),
  '42501', 'an inactive user saves no template');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws(format($q$SELECT public.familiarisation_template_save(%L, NULL, '{"name":"x","sections":[{"section_name":"A","checklist_items":["a"]}]}')$q$, tests.vessel_id('A.dra')),
  '42501', 'another tenant saves no template on DRAAK');
-- No signed-in direct template write: no write policy (the row is untouched), and the guard behind it.
SELECT tests.as_user(tests.user_id('A.x110_chief_stew'));
SELECT pg_temp.engine_off();
SELECT tests.lives(format($q$UPDATE public.familiarization_templates SET template_name = 'x' WHERE id = %L$q$, pg_temp.oid('tpl_int')), 'a direct template update runs');
SELECT tests.reset_role();
SELECT tests.is((SELECT template_name FROM public.familiarization_templates WHERE id = pg_temp.oid('tpl_int')), 'Interior induction', 'and changes nothing (no write policy)');
SELECT tests._set_claims(jsonb_build_object('sub', tests.user_id('A.x110_chief_stew'), 'role', 'authenticated'));
SELECT pg_temp.engine_off();
SELECT tests.throws_like(format($q$UPDATE public.familiarization_templates SET template_name = 'x' WHERE id = %L$q$, pg_temp.oid('tpl_int')),
  '42501', 'familiarisation_engine_only', 'the template guard refuses a signed-in write outside the engine');
SELECT tests._set_claims('{}'::jsonb);

-- T-134: a vessel variant replaces the fleet template on its vessel.
SELECT tests.as_user(tests.user_id('A.x110_chief_stew'));
INSERT INTO out_ids SELECT 'tpl_variant', (public.familiarisation_template_save(tests.vessel_id('A.dra'), NULL, jsonb_build_object(
  'name', 'DRAAK 24-hour safety familiarisation', 'variant_of', pg_temp.oid('tpl_fleet'), 'due_within_days', 1,
  'sections', jsonb_build_array(jsonb_build_object('section_name', 'Alarms', 'checklist_items', jsonb_build_array('General alarm', 'DRAAK muster plan'))),
  'position_ids', jsonb_build_array(pg_temp.pos('deckhand')))) ->> 'id')::uuid;
SELECT tests.throws_like(format($q$SELECT public.familiarisation_template_save(%L, NULL, jsonb_build_object('name','y','variant_of',%L,'sections','[{"section_name":"A","checklist_items":["a"]}]'::jsonb))$q$,
  tests.vessel_id('A.dra'), pg_temp.oid('tpl_fleet')), '22023', 'variant_exists', 'one active variant of a fleet template per vessel');
SELECT tests.reset_role();
SELECT tests.ok(pg_temp.oid('tpl_fleet') NOT IN (SELECT public.familiarisation_vessel_templates(tests.vessel_id('A.dra')))
                AND pg_temp.oid('tpl_variant') IN (SELECT public.familiarisation_vessel_templates(tests.vessel_id('A.dra')))
                AND pg_temp.oid('tpl_fleet') IN (SELECT public.familiarisation_vessel_templates(tests.vessel_id('A.hyd'))),
  'on DRAAK the variant applies instead of the fleet template; HYDRA keeps the fleet template');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM public.crew_requirement_rows WHERE vessel_id = tests.vessel_id('A.dra')
                            AND seed_key = 'familiarisation.' || replace(pg_temp.oid('tpl_fleet')::text, '-', '_'))
                AND EXISTS (SELECT 1 FROM public.crew_requirement_rows WHERE vessel_id = tests.vessel_id('A.hyd')
                            AND seed_key = 'familiarisation.' || replace(pg_temp.oid('tpl_fleet')::text, '-', '_')),
  'the fleet template''s requirement row leaves DRAAK and stays on HYDRA');

-- ------------------------------------------------------------ 3. start

SELECT tests.as_user(tests.user_id('A.x110_chief_stew'));
INSERT INTO out_ids SELECT 'rec_stew', (public.familiarisation_start(pg_temp.oid('tpl_int'), tests.profile_id('A.x110_stew'), tests.vessel_id('A.dra')) ->> 'id')::uuid;
SELECT tests.reset_role();
INSERT INTO out_ids SELECT 'rec_stew_item' || n, pg_temp.item_id(pg_temp.oid('rec_stew'), n) FROM generate_series(1, 3) AS n;
SELECT tests.is(pg_temp.items(pg_temp.oid('rec_stew')), 'Guest areas|Laundry|false;Guest areas|Pantry|false;Safety|Muster|false',
  'start copies the chosen template''s sections, not the default sections (C63)');
SELECT tests.results_eq(
  format($q$SELECT status, profile_id = %L, user_id = %L, company_id = %L, due_date, target_completion_date = due_date,
                   requires_crew_signature, requires_supervisor_signature, created_by = %L
            FROM public.familiarization_records WHERE id = %L$q$,
         tests.profile_id('A.x110_stew'), tests.user_id('A.x110_stew'), tests.company_id('A'), tests.user_id('A.x110_chief_stew'), pg_temp.oid('rec_stew')),
  $q$VALUES ('open', true, true, true, current_date + 7, true, true, true, true)$q$,
  'the record is open, keyed on the profile and the login, due 7 days from today (joined a month ago, started today)');
SELECT tests.as_user(tests.user_id('A.x110_chief_stew'));
SELECT tests.throws_like(format($q$SELECT public.familiarisation_start(%L, %L, %L)$q$, pg_temp.oid('tpl_int'), tests.profile_id('A.x110_stew'), tests.vessel_id('A.dra')),
  '22023', 'record_exists', 'one open record of a template per person and vessel');
SELECT tests.throws_like(format($q$SELECT public.familiarisation_start(%L, %L, %L)$q$, pg_temp.oid('tpl_int'), tests.profile_id('A.x110_hyd'), tests.vessel_id('A.dra')),
  '22023', 'not_on_vessel', 'a person not on the crew is refused');
SELECT tests.throws_like(format($q$SELECT public.familiarisation_start(%L, %L, %L)$q$, pg_temp.oid('tpl_int'), tests.profile_id('B.x110_crew'), tests.vessel_id('A.dra')),
  'P0002', 'person_not_found', 'another tenant''s person is unknown');
SELECT tests.throws_like(format($q$SELECT public.familiarisation_start(%L, %L, %L)$q$, pg_temp.oid('tpl_fleet'), tests.profile_id('A.x110_deck'), tests.vessel_id('A.dra')),
  '22023', 'template_inactive', 'a fleet template replaced by the vessel''s variant is not started on that vessel');
SELECT tests.throws_like(format($q$SELECT public.familiarisation_start(%L, %L, %L)$q$, gen_random_uuid(), tests.profile_id('A.x110_deck'), tests.vessel_id('A.dra')),
  'P0002', 'template_not_found', 'an unknown template');
SELECT tests.as_user(tests.user_id('A.x110_viewer'));
SELECT tests.throws(format($q$SELECT public.familiarisation_start(%L, %L, %L)$q$, pg_temp.oid('tpl_deck'), tests.profile_id('A.x110_deck'), tests.vessel_id('A.dra')),
  '42501', 'a viewer starts nothing');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 4. ticks and the status machine

SELECT tests.as_user(tests.user_id('A.x110_stew'));
SELECT tests.is((public.familiarisation_tick(pg_temp.item_id(pg_temp.oid('rec_stew'), 1), true, 'done with the purser') ->> 'status'), 'in_progress',
  'the person ticks their own item: in progress');
SELECT tests.as_user(tests.user_id('A.x110_deck'));
SELECT tests.throws_like(format($q$SELECT public.familiarisation_tick(%L, true)$q$, pg_temp.oid('rec_stew_item2')),
  'P0002', 'record_not_found', 'another crew member cannot see, let alone tick, the stew''s record');
SELECT tests.as_user(tests.user_id('A.x110_viewer'));
SELECT tests.throws_like(format($q$SELECT public.familiarisation_tick(%L, true)$q$, pg_temp.item_id(pg_temp.oid('rec_stew'), 2)),
  '42501', 'not_permitted', 'a viewer ticks nobody''s items');
SELECT tests.as_user(tests.user_id('A.x110_chief_stew'));
SELECT tests.is((public.familiarisation_tick(pg_temp.item_id(pg_temp.oid('rec_stew'), 2), true) ->> 'status'), 'in_progress', 'an editor ticks another person''s item');
SELECT tests.is((public.familiarisation_tick(pg_temp.item_id(pg_temp.oid('rec_stew'), 2), false) ->> 'status'), 'in_progress', 'unticking keeps it in progress');
SELECT tests.is((public.familiarisation_tick(pg_temp.item_id(pg_temp.oid('rec_stew'), 1), false) ->> 'status'), 'open', 'nothing ticked is open again');
SELECT tests.is((SELECT string_agg((public.familiarisation_tick(pg_temp.item_id(pg_temp.oid('rec_stew'), n), true) ->> 'status'), ',' ORDER BY n)
                 FROM generate_series(1, 3) AS n), 'in_progress,in_progress,awaiting_signatures',
  'every item ticked: awaiting signatures');
SELECT tests.throws_like(format($q$SELECT public.familiarisation_tick(%L, true)$q$, gen_random_uuid()), 'P0002', 'item_not_found', 'an unknown item');
SELECT tests.throws_like(format($q$SELECT public.familiarisation_tick(%L, true, repeat('x', 501))$q$, pg_temp.item_id(pg_temp.oid('rec_stew'), 1)),
  '22023', 'note_too_long', 'a note has at most 500 characters');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT completed, completed_by_id = %L, completed_date = current_date, notes FROM public.familiarization_checklist_items WHERE id = %L$q$,
         tests.user_id('A.x110_chief_stew'), pg_temp.item_id(pg_temp.oid('rec_stew'), 1)),
  $q$VALUES (true, true, true, 'done with the purser')$q$, 'a tick records who and when; the note stays');
SELECT tests.is((SELECT completion_percentage FROM public.familiarization_records WHERE id = pg_temp.oid('rec_stew')), 100, 'the legacy percentage follows');

-- ------------------------------------------------------------ 5. signatures

SELECT tests.as_user(tests.user_id('A.x110_officer'));
SELECT tests.throws_like(format($q$SELECT public.familiarisation_sign(%L, 'supervisor')$q$, pg_temp.oid('rec_stew')),
  '42501', 'out_of_department', 'a supervisor of another department does not sign');
SELECT tests.throws_like(format($q$SELECT public.familiarisation_sign(%L, 'crew')$q$, pg_temp.oid('rec_stew')),
  '42501', 'not_permitted', 'only the person signs as crew');
SELECT tests.as_user(tests.user_id('A.x110_stew'));
SELECT tests.throws_like(format($q$SELECT public.familiarisation_sign(%L, 'supervisor')$q$, pg_temp.oid('rec_stew')),
  '42501', 'own_record', 'the person never supervises their own record');
SELECT tests.throws_like(format($q$SELECT public.familiarisation_sign(%L, 'witness')$q$, pg_temp.oid('rec_stew')), '22023', 'as_invalid', 'crew or supervisor only');
SELECT tests.is((public.familiarisation_sign(pg_temp.oid('rec_stew'), 'crew') ->> 'status'), 'awaiting_signatures', 'the crew member signs; the supervisor''s is still needed');
SELECT tests.throws_like(format($q$SELECT public.familiarisation_sign(%L, 'crew')$q$, pg_temp.oid('rec_stew')), '22023', 'already_signed', 'one crew signature');
SELECT tests.throws_like(format($q$SELECT public.familiarisation_tick(%L, false)$q$, pg_temp.item_id(pg_temp.oid('rec_stew'), 1)),
  '22023', 'record_signed', 'a signed checklist is not changed');
SELECT tests.as_user(tests.user_id('A.x110_chief_stew'));
SELECT tests.is((public.familiarisation_sign(pg_temp.oid('rec_stew'), 'supervisor') ->> 'status'), 'completed', 'the Chief Stew signs as supervisor: completed');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT status, actual_completion_date = current_date, crew_signed_by = %L, supervisor_signed_by = %L, crew_signed_at IS NOT NULL, supervisor_signed_at IS NOT NULL
            FROM public.familiarization_records WHERE id = %L$q$, tests.user_id('A.x110_stew'), tests.user_id('A.x110_chief_stew'), pg_temp.oid('rec_stew')),
  $q$VALUES ('completed', true, true, true, true, true)$q$, 'completion records both signers and the day');
SELECT tests.as_user(tests.user_id('A.x110_chief_stew'));
SELECT tests.throws_like(format($q$SELECT public.familiarisation_tick(%L, false)$q$, pg_temp.item_id(pg_temp.oid('rec_stew'), 1)),
  '22023', 'record_completed', 'a completed checklist is not changed');
SELECT tests.throws_like(format($q$SELECT public.familiarisation_sign(%L, 'supervisor')$q$, pg_temp.oid('rec_stew')), '22023', 'record_completed', 'no signature after completion');
-- Items open: no signature yet.
INSERT INTO out_ids SELECT 'rec_deck', (public.familiarisation_start(pg_temp.oid('tpl_deck'), tests.profile_id('A.x110_deck'), tests.vessel_id('A.dra')) ->> 'id')::uuid;
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.x110_officer'));
SELECT tests.throws_like(format($q$SELECT public.familiarisation_sign(%L, 'supervisor')$q$, pg_temp.oid('rec_deck')), '22023', 'items_open', 'tick every item before signing');
SELECT tests.as_user(tests.user_id('A.x110_deck'));
SELECT tests.throws_like(format($q$SELECT public.familiarisation_sign(%L, 'crew')$q$, pg_temp.oid('rec_deck')), '22023', 'signature_not_required', 'a template without the crew signature');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 6. reopen and delete

SELECT tests.as_user(tests.user_id('A.x110_officer'));
SELECT tests.throws_like(format($q$SELECT public.familiarisation_reopen(%L, 'redo')$q$, pg_temp.oid('rec_stew')),
  '42501', 'out_of_department', 'a supervisor of another department does not reopen');
SELECT tests.throws_like(format($q$SELECT public.familiarisation_reopen(%L, 'redo')$q$, pg_temp.oid('rec_deck')),
  '22023', 'not_reopenable', 'an open record is not reopened');
SELECT tests.as_user(tests.user_id('A.x110_stew'));
SELECT tests.throws_like(format($q$SELECT public.familiarisation_reopen(%L, 'redo')$q$, pg_temp.oid('rec_stew')), '42501', 'own_record', 'nobody reopens their own record');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(format($q$SELECT public.familiarisation_reopen(%L, '  ')$q$, pg_temp.oid('rec_stew')), '22023', 'reason_required', 'a reason is required');
SELECT tests.is((public.familiarisation_reopen(pg_temp.oid('rec_stew'), 'New laundry equipment fitted') ->> 'status'), 'awaiting_signatures',
  'the Master (every department) reopens: the signatures go, the ticks stay');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT status, crew_signed_at IS NULL, supervisor_signed_at IS NULL, actual_completion_date IS NULL, reopened_reason, reopened_by = %L, reopened_at IS NOT NULL
            FROM public.familiarization_records WHERE id = %L$q$, tests.user_id('A.master_dra'), pg_temp.oid('rec_stew')),
  $q$VALUES ('awaiting_signatures', true, true, true, 'New laundry equipment fitted', true, true)$q$, 'the reopen is recorded');
SELECT tests.as_user(tests.user_id('A.x110_chief_stew'));
SELECT tests.is((public.familiarisation_tick(pg_temp.item_id(pg_temp.oid('rec_stew'), 1), false) ->> 'status'), 'in_progress', 'after reopening the checklist changes again');
SELECT tests.is((public.familiarisation_tick(pg_temp.item_id(pg_temp.oid('rec_deck'), 1), true) ->> 'status'), 'in_progress', 'the deck record is ticked once');
SELECT tests.throws_like(format($q$SELECT public.familiarisation_delete(%L)$q$, pg_temp.oid('rec_deck')), '22023', 'not_deletable', 'a record with a tick is not deleted');
SELECT tests.lives(format($q$SELECT public.familiarisation_tick(%L, false)$q$, pg_temp.item_id(pg_temp.oid('rec_deck'), 1)), 'untick it');
SELECT tests.as_user(tests.user_id('A.x110_viewer'));
SELECT tests.throws_like(format($q$SELECT public.familiarisation_delete(%L)$q$, pg_temp.oid('rec_deck')), '42501', 'not_permitted', 'a viewer deletes nothing');
SELECT tests.as_user(tests.user_id('A.x110_chief_stew'));
SELECT tests.is(public.familiarisation_delete(pg_temp.oid('rec_deck')), pg_temp.oid('rec_deck'), 'an open record with nothing ticked is deleted');
SELECT tests.reset_role();
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM public.familiarization_records WHERE id = pg_temp.oid('rec_deck'))
                AND NOT EXISTS (SELECT 1 FROM public.familiarization_checklist_items WHERE familiarization_id = pg_temp.oid('rec_deck')),
  'the record and its items are gone');

-- ------------------------------------------------------------ 7. required records on crew_assignment_terms (Add Crew, transfer)

-- A person without a login (a pending placement): the insert succeeds and the deck familiarisations open.
INSERT INTO public.crew_assignment_terms (company_id, profile_id, vessel_id, position_id, department_key, start_date, date_joining_vessel)
VALUES (tests.company_id('A'), tests.profile_id('A.x110_ghost'), tests.vessel_id('A.dra'), pg_temp.pos('deckhand'), 'deck', current_date, current_date + 2);
SELECT tests.results_eq(
  format($q$SELECT t.template_name, fr.user_id IS NULL, fr.status, fr.join_date - current_date, fr.due_date - current_date, (SELECT count(*) FROM public.familiarization_checklist_items AS i WHERE i.familiarization_id = fr.id)::integer
            FROM public.familiarization_records AS fr JOIN public.familiarization_templates AS t ON t.id = fr.template_id
            WHERE fr.profile_id = %L ORDER BY t.template_name$q$, tests.profile_id('A.x110_ghost')),
  $q$VALUES ('DRAAK 24-hour safety familiarisation', true, 'open', 2, 3, 2), ('Deck induction', true, 'open', 2, 12, 2)$q$,
  'Add Crew for a person without a login opens the required familiarisations (the vessel variant, not the fleet template), due from the joining date');
INSERT INTO public.crew_assignment_terms (company_id, profile_id, vessel_id, position_id, department_key, start_date)
VALUES (tests.company_id('A'), tests.profile_id('A.x110_ghost'), tests.vessel_id('A.dra'), pg_temp.pos('deckhand'), 'deck', current_date + 1);
SELECT tests.is((SELECT count(*) FROM public.familiarization_records WHERE profile_id = tests.profile_id('A.x110_ghost'))::integer, 2,
  'a second terms row opens no duplicate');
-- A person with a login: familiarisation_assigned is sent to them.
INSERT INTO public.crew_assignment_terms (company_id, profile_id, vessel_id, position_id, department_key, start_date)
VALUES (tests.company_id('A'), tests.profile_id('A.x110_deck2'), tests.vessel_id('A.dra'), pg_temp.pos('deckhand'), 'deck', current_date);
SELECT tests.results_eq(
  format($q$SELECT count(*)::integer, bool_and(o.link_scope = 'vessel'), bool_and(o.link_path LIKE 'crew/familiarisation/%%'), bool_and(o.must_act_user_ids = ARRAY[%L]::uuid[])
            FROM public.notification_outbox AS o WHERE o.type_key = 'familiarisation_assigned' AND o.payload ->> 'record_id' IN (
              SELECT fr.id::text FROM public.familiarization_records AS fr WHERE fr.profile_id = %L)$q$,
         tests.user_id('A.x110_deck2'), tests.profile_id('A.x110_deck2')),
  $q$VALUES (2, true, true, true)$q$, 'familiarisation_assigned goes to the person''s login, linked to the record');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox AS o WHERE o.type_key = 'familiarisation_assigned' AND o.payload ->> 'record_id' IN (
                   SELECT fr.id::text FROM public.familiarization_records AS fr WHERE fr.profile_id = tests.profile_id('A.x110_ghost')))::integer, 0,
  'nobody is told for a person without a login');
-- A position nothing is required of: the insert succeeds, nothing opens.
INSERT INTO public.crew_assignment_terms (company_id, profile_id, vessel_id, position_id, department_key, start_date)
VALUES (tests.company_id('A'), tests.profile_id('A.x110_officer'), tests.vessel_id('A.dra'), pg_temp.pos('chief_officer'), 'deck', current_date);
SELECT tests.is((SELECT count(*) FROM public.familiarization_records WHERE profile_id = tests.profile_id('A.x110_officer'))::integer, 0,
  'no familiarisation is required of the Chief Officer');

-- ------------------------------------------------------------ 8. the guards

SELECT tests.as_user(tests.user_id('A.x110_chief_stew'));
SELECT pg_temp.engine_off();
SELECT tests.lives(format($q$UPDATE public.familiarization_records SET status = 'completed' WHERE id = %L$q$, pg_temp.oid('rec_stew')), 'a direct status update runs');
SELECT tests.lives(format($q$DELETE FROM public.familiarization_records WHERE id = %L$q$, pg_temp.oid('rec_stew')), 'a direct delete runs');
SELECT tests.lives(format($q$UPDATE public.familiarization_checklist_items SET completed = true WHERE id = %L$q$, pg_temp.item_id(pg_temp.oid('rec_stew'), 1)), 'a direct tick runs');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT status, (SELECT completed FROM public.familiarization_checklist_items WHERE id = %L) FROM public.familiarization_records WHERE id = %L$q$,
                               pg_temp.item_id(pg_temp.oid('rec_stew'), 1), pg_temp.oid('rec_stew')),
  $q$VALUES ('in_progress', false)$q$, 'and change nothing: there is no browser write policy');
-- The guards themselves (as the RLS-free owner with a JWT, so only the guard can refuse).
SELECT tests._set_claims(jsonb_build_object('sub', tests.user_id('A.x110_chief_stew'), 'role', 'authenticated'));
SELECT pg_temp.engine_off();
SELECT tests.throws_like(format($q$UPDATE public.familiarization_records SET supervisor_signed_at = now(), supervisor_signed_by = %L WHERE id = %L$q$,
  tests.user_id('A.x110_chief_stew'), pg_temp.oid('rec_stew')), '42501', 'familiarisation_engine_only', 'the record guard refuses signer columns outside the engine');
SELECT tests.throws_like(format($q$INSERT INTO public.familiarization_records (user_id, vessel_id, template_id, join_date, target_completion_date) VALUES (%L, %L, %L, current_date, current_date)$q$,
  tests.user_id('A.x110_deck'), tests.vessel_id('A.dra'), pg_temp.oid('tpl_int')), '42501', 'familiarisation_engine_only', 'the record guard refuses a signed-in insert');
SELECT tests.throws_like(format($q$UPDATE public.familiarization_checklist_items SET completed = true WHERE id = %L$q$, pg_temp.item_id(pg_temp.oid('rec_stew'), 1)),
  '42501', 'familiarisation_engine_only', 'the item guard refuses a signed-in tick');
SELECT tests._set_claims('{}'::jsonb);
SELECT tests.reset_role();
-- Maintenance (no JWT): legacy statuses are mapped; the subject is filled.
INSERT INTO public.familiarization_records (id, user_id, vessel_id, template_id, join_date, target_completion_date, status)
VALUES (tests.id('rec:legacy'), tests.user_id('A.x110_viewer'), tests.vessel_id('A.dra'), tests.id('tpl:legacy'), current_date - 20, current_date - 5, 'Overdue');
SELECT tests.results_eq(
  format($q$SELECT status, profile_id = %L, company_id = %L, due_date = current_date - 5 FROM public.familiarization_records WHERE id = %L$q$,
         tests.profile_id('A.x110_viewer'), tests.company_id('A'), tests.id('rec:legacy')),
  $q$VALUES ('in_progress', true, true, true)$q$, 'a legacy write is mapped (Overdue -> in progress) and keyed on the profile');
SELECT tests.throws_like(format($q$INSERT INTO public.familiarization_records (user_id, vessel_id, template_id, join_date, target_completion_date) VALUES (%L, %L, %L, current_date, current_date)$q$,
  tests.user_id('B.x110_crew'), tests.vessel_id('A.dra'), pg_temp.oid('tpl_int')), '23514', 'familiarisation_record_scope_mismatch', 'a record names one company''s person, vessel and template');
SELECT tests.throws_like(format($q$INSERT INTO public.familiarization_records (vessel_id, template_id, join_date, target_completion_date) VALUES (%L, %L, current_date, current_date)$q$,
  tests.vessel_id('A.dra'), pg_temp.oid('tpl_int')), '23514', '%familiarization_records_subject_check%', 'a record names its person');
SELECT tests.throws_like(format($q$UPDATE public.familiarization_records SET status = 'signed' WHERE id = %L$q$, tests.id('rec:legacy')),
  '23514', '%familiarization_records_status_check%', 'the widened status list (open, in progress, awaiting signatures, completed)');
SELECT tests.throws_like(format($q$INSERT INTO public.familiarization_template_positions (template_id, position_id, vessel_id) VALUES (%L, %L, %L)$q$,
  pg_temp.oid('tpl_int'), pg_temp.pos('deckhand'), tests.vessel_id('A.hyd')), '23514', 'familiarisation_position_scope_mismatch', 'a vessel template''s positions are its own vessel''s');

-- ------------------------------------------------------------ 9. reads

SELECT tests.as_user(tests.user_id('A.x110_viewer'));
SELECT tests.results_eq(
  format($q$SELECT t ->> 'name', (t ->> 'required')::integer, (t ->> 'completed')::integer, (t ->> 'missing')::integer, (t ->> 'in_progress')::integer, (t ->> 'applies')::boolean
            FROM jsonb_array_elements(public.familiarisation_vessel_overview(%L) -> 'templates') AS t
            WHERE t ->> 'id' IN (%L, %L, %L) ORDER BY t ->> 'name'$q$,
         tests.vessel_id('A.dra'), pg_temp.oid('tpl_deck'), pg_temp.oid('tpl_int'), pg_temp.oid('tpl_fleet')),
  $q$VALUES ('24-hour safety familiarisation', 0, 0, 0, 0, false), ('Deck induction', 7, 0, 7, 2, true), ('Interior induction', 1, 0, 1, 1, true)$q$,
  'the overview counts required, completed, missing and in progress per template for the current crew (the fleet template is replaced on DRAAK)');
SELECT tests.ok((SELECT (o ->> 'records_total')::integer >= 5 AND jsonb_array_length(o -> 'records') <= 12 AND NOT (o ->> 'can_create')::boolean
                        AND jsonb_array_length(o -> 'members') = 0
                 FROM (SELECT public.familiarisation_vessel_overview(tests.vessel_id('A.dra')) AS o) AS x),
  'the latest records, the total, and no crew list for a viewer who cannot start one');
SELECT tests.ok((SELECT jsonb_array_length(o -> 'records') = (o ->> 'records_total')::integer FROM (SELECT public.familiarisation_vessel_overview(tests.vessel_id('A.dra'), true) AS o) AS x),
  'View all returns every record');
SELECT tests.results_eq(
  format($q$SELECT r ->> 'status', (r -> 'rights' ->> 'tick'), (r -> 'rights' ->> 'sign_supervisor'), (r -> 'rights' ->> 'delete'), jsonb_array_length(r -> 'items')
            FROM (SELECT public.familiarisation_record_detail(%L) AS r) AS x$q$, pg_temp.oid('rec_stew')),
  $q$VALUES ('in_progress', 'not_permitted', 'not_permitted', 'not_permitted', 3)$q$, 'the viewer reads the record and its items, without any right');
SELECT tests.as_user(tests.user_id('A.x110_stew'));
SELECT tests.throws(format($q$SELECT public.familiarisation_vessel_overview(%L)$q$, tests.vessel_id('A.dra')), '42501', 'crew without familiarisation access see no overview');
SELECT tests.results_eq(
  format($q$SELECT r ->> 'status', r -> 'rights' ->> 'tick', r -> 'rights' ->> 'sign_crew', r -> 'rights' ->> 'sign_supervisor', (r -> 'rights' ->> 'is_own')::boolean
            FROM (SELECT public.familiarisation_record_detail(%L) AS r) AS x$q$, pg_temp.oid('rec_stew')),
  $q$VALUES ('in_progress', 'ok', 'items_open', 'own_record', true)$q$, 'the person reads their own record with their rights');
SELECT tests.is((SELECT count(*) FROM public.familiarization_records)::integer, 1, 'RLS: the person reads only their own record');
SELECT tests.is((SELECT count(*) FROM public.familiarization_checklist_items)::integer, 3, 'RLS: and only its items');
SELECT tests.as_user(tests.user_id('A.x110_deck'));
SELECT tests.throws_like(format($q$SELECT public.familiarisation_record_detail(%L)$q$, pg_temp.oid('rec_stew')), 'P0002', 'record_not_found', 'another crew member reads nothing of it');
SELECT tests.as_user(tests.user_id('A.x110_chief_stew'));
SELECT tests.results_eq(
  format($q$SELECT r -> 'rights' ->> 'tick', r -> 'rights' ->> 'sign_supervisor', r -> 'rights' ->> 'reopen', r -> 'rights' ->> 'delete' FROM (SELECT public.familiarisation_record_detail(%L) AS r) AS x$q$,
         pg_temp.oid('rec_stew')),
  $q$VALUES ('ok', 'items_open', 'not_reopenable', 'not_deletable')$q$, 'the supervisor''s rights follow the record''s state');
SELECT tests.ok((SELECT count(*) FROM public.familiarization_records) >= 5 AND (SELECT count(*) FROM public.familiarization_templates) >= 4,
  'RLS: an editor reads the vessel''s records and templates');
SELECT tests.as_user(tests.user_id('A.x110_ext'));
SELECT tests.throws(format($q$SELECT public.familiarisation_vessel_overview(%L)$q$, tests.vessel_id('A.dra')), '42501', 'an external viewer sees no overview');
SELECT tests.is((SELECT count(*) FROM public.familiarization_records)::integer, 0, 'RLS: an external viewer reads no record of others');
SELECT tests.as_user(tests.user_id('A.x110_hyd'));
SELECT tests.throws(format($q$SELECT public.familiarisation_vessel_overview(%L)$q$, tests.vessel_id('A.dra')), '42501', 'HYDRA''s editor sees nothing of DRAAK');
SELECT tests.is((SELECT count(*) FROM public.familiarization_records WHERE vessel_id = tests.vessel_id('A.dra'))::integer, 0, 'RLS: no reach, no DRAAK records');
SELECT tests.is((SELECT count(*) FROM public.familiarization_templates WHERE vessel_id = tests.vessel_id('A.dra'))::integer, 0, 'RLS: no DRAAK templates either');
SELECT tests.ok((SELECT count(*) FROM public.familiarization_templates WHERE vessel_id IS NULL) >= 1, 'RLS: fleet templates are the company''s');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws(format($q$SELECT public.familiarisation_vessel_overview(%L)$q$, tests.vessel_id('A.dra')), '42501', 'another tenant sees nothing');
SELECT tests.throws_like(format($q$SELECT public.familiarisation_record_detail(%L)$q$, pg_temp.oid('rec_stew')), 'P0002', 'record_not_found', 'another tenant reads no record');
SELECT tests.is((SELECT count(*) FROM public.familiarization_records)::integer + (SELECT count(*) FROM public.familiarization_templates)::integer
                + (SELECT count(*) FROM public.familiarization_template_positions)::integer + (SELECT count(*) FROM public.familiarization_checklist_items)::integer, 0,
  'RLS: another tenant reads no template, position, record or item');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is((SELECT count(*) FROM public.familiarization_records)::integer + (SELECT count(*) FROM public.familiarization_templates)::integer, 0,
  'RLS: an inactive user reads nothing');
SELECT tests.throws(format($q$SELECT public.familiarisation_record_detail(%L)$q$, pg_temp.oid('rec_stew')), '42501', 'an inactive user reads no record');
SELECT tests.as_anon();
SELECT tests.denied($q$SELECT * FROM public.familiarization_template_positions$q$, 'anon reads no position');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 10. the requirement engine counts a completed record by profile (C36)

-- A supervisor-only template completed for the person without a login.
SELECT tests.as_user(tests.user_id('A.x110_officer'));
SELECT tests.lives(format($q$SELECT public.familiarisation_tick(i.id, true) FROM public.familiarization_checklist_items AS i
                           JOIN public.familiarization_records AS fr ON fr.id = i.familiarization_id
                           WHERE fr.profile_id = %L AND fr.template_id = %L$q$, tests.profile_id('A.x110_ghost'), pg_temp.oid('tpl_deck')),
  'the Chief Officer ticks the deck induction of the person without a login');
SELECT tests.is((public.familiarisation_sign((SELECT id FROM public.familiarization_records WHERE profile_id = tests.profile_id('A.x110_ghost') AND template_id = pg_temp.oid('tpl_deck')),
                                             'supervisor') ->> 'status'), 'completed', 'and signs it: completed without a crew signature (not required)');
SELECT tests.reset_role();
SELECT tests.is(
  (SELECT s.state FROM public.crew_requirement_status_for(ARRAY[tests.vessel_id('A.dra')], current_date, tests.profile_id('A.x110_ghost')) AS s
   JOIN public.crew_requirement_rows AS r ON r.id = s.row_id
   WHERE r.seed_key = 'familiarisation.' || replace(pg_temp.oid('tpl_deck')::text, '-', '_')),
  'met', 'Crew Compliance counts the completed record of a person without a login (matched by profile)');
SELECT tests.is(
  (SELECT s.state FROM public.crew_requirement_status_for(ARRAY[tests.vessel_id('A.dra')], current_date, tests.profile_id('A.x110_deck')) AS s
   JOIN public.crew_requirement_rows AS r ON r.id = s.row_id
   WHERE r.seed_key = 'familiarisation.' || replace(pg_temp.oid('tpl_deck')::text, '-', '_')),
  'missing', 'and the deckhand without one is missing it');

-- ------------------------------------------------------------ 11. onboarding progress and the crew dashboard (X1-10B's reads)

SELECT tests.as_user(tests.user_id('A.x110_viewer'));
SELECT tests.ok((SELECT count(*) > 0 AND bool_and(jsonb_array_length(o.checks) = 8)
                        AND bool_and((SELECT e ->> 'state' FROM jsonb_array_elements(o.checks) AS e WHERE e ->> 'key' = 'signature') = 'unknown')
                        AND bool_and(o.known <= 7)
                 FROM public.crew_onboarding_progress(tests.vessel_id('A.dra')) AS o),
  'a crew list viewer reads the eight checks per joiner; the signature check reads unknown while the store is missing');
SELECT tests.results_eq(
  format($q$SELECT o.fam_required, o.fam_completed, jsonb_array_length(o.familiarisation), o.placement_kind, o.is_open
            FROM public.crew_onboarding_progress(%L) AS o WHERE o.profile_id = %L$q$, tests.vessel_id('A.dra'), tests.profile_id('A.x110_ghost')),
  $q$VALUES (2, 1, 2, 'pending_placement', true)$q$, 'the pending joiner''s familiarisations are part of their onboarding');
SELECT tests.throws_like(format($q$SELECT * FROM public.crew_onboarding_progress(%L, NULL, 0)$q$, tests.vessel_id('A.dra')), '22023', 'days_invalid', 'look back 1 to 365 days');
SELECT tests.results_eq(
  format($q$SELECT d -> 'crewing' ->> 'allowed', (d -> 'crewing' ->> 'total')::integer, d -> 'compliance' ->> 'allowed', d -> 'documents' ->> 'allowed',
                   d -> 'hours_of_rest' ->> 'allowed', d -> 'onboarding' ->> 'allowed', (d -> 'onboarding' ->> 'joiners')::integer
            FROM (SELECT public.crew_vessel_dashboard(%L) AS d) AS x$q$, tests.vessel_id('A.dra')),
  $q$VALUES ('true', 11, 'true', 'true', 'true', 'true', 11)$q$,
  'crew list readers (crew roster view) get every crew section of the dashboard');
SELECT tests.as_user(tests.user_id('A.x110_listonly'));
SELECT tests.results_eq(
  format($q$SELECT d -> 'crewing' ->> 'allowed', d -> 'compliance' ->> 'allowed', d -> 'documents' ->> 'allowed', d -> 'hours_of_rest' ->> 'allowed', d -> 'onboarding' ->> 'allowed'
            FROM (SELECT public.crew_vessel_dashboard(%L) AS d) AS x$q$, tests.vessel_id('A.dra')),
  $q$VALUES ('true', 'false', 'false', 'false', 'true')$q$,
  'the dashboard answers each section only for its own capability (a crew-list-only reader: no compliance, documents or hours of rest)');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.ok((SELECT (d -> 'compliance' ->> 'allowed')::boolean AND (d -> 'documents' ->> 'allowed')::boolean AND (d -> 'hours_of_rest' ->> 'allowed')::boolean
                        AND d -> 'documents' ? 'expired' AND d -> 'compliance' ? 'total'
                 FROM (SELECT public.crew_vessel_dashboard(tests.vessel_id('A.dra')) AS d) AS x),
  'a full-access reader gets every section');
SELECT tests.as_user(tests.user_id('A.x110_stew'));
SELECT tests.throws(format($q$SELECT public.crew_vessel_dashboard(%L)$q$, tests.vessel_id('A.dra')), '42501', 'crew without the crew list see no dashboard');
SELECT tests.throws(format($q$SELECT * FROM public.crew_onboarding_progress(%L)$q$, tests.vessel_id('A.dra')), '42501', 'nor the joiners');
SELECT tests.is((SELECT count(*) FROM public.crew_onboarding_progress(tests.vessel_id('A.dra'), tests.profile_id('A.x110_stew')))::integer, 1,
  'but the person reads their own onboarding');
SELECT tests.throws(format($q$SELECT * FROM public.crew_onboarding_progress(%L, %L)$q$, tests.vessel_id('A.dra'), tests.profile_id('A.x110_deck')), '42501', 'and nobody else''s');
SELECT tests.as_user(tests.user_id('A.x110_ext'));
SELECT tests.throws(format($q$SELECT public.crew_vessel_dashboard(%L)$q$, tests.vessel_id('A.dra')), '42501', 'an external viewer sees no dashboard');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws(format($q$SELECT public.crew_vessel_dashboard(%L)$q$, tests.vessel_id('A.dra')), '42501', 'another tenant sees no dashboard');
SELECT tests.throws(format($q$SELECT * FROM public.crew_onboarding_progress(%L)$q$, tests.vessel_id('A.dra')), '42501', 'nor the joiners');
SELECT tests.throws(format($q$SELECT public.crew_vessel_dashboard(%L)$q$, gen_random_uuid()), 'P0002', 'an unknown vessel');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws(format($q$SELECT public.crew_vessel_dashboard(%L)$q$, tests.vessel_id('A.dra')), '42501', 'an inactive user sees no dashboard');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 12. the emitter and grants

SELECT tests.ok(position('''familiarisation_assigned''' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.familiarisation_notify_assigned(uuid)'::regprocedure)) > 0
                AND position('familiarisation_notify_assigned' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.familiarisation_open_required(uuid, uuid, uuid, date)'::regprocedure)) > 0,
  'familiarisation_assigned is emitted (live in crew/module.ts) by familiarisation_open_required through familiarisation_notify_assigned');
SELECT tests.ok(has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE'), 'browser RPC: ' || f)
FROM unnest(ARRAY['public.familiarisation_template_save(uuid, uuid, jsonb)', 'public.familiarisation_start(uuid, uuid, uuid)',
                  'public.familiarisation_tick(uuid, boolean, text)', 'public.familiarisation_sign(uuid, text)', 'public.familiarisation_reopen(uuid, text)',
                  'public.familiarisation_delete(uuid)', 'public.familiarisation_vessel_overview(uuid, boolean)', 'public.familiarisation_record_detail(uuid)',
                  'public.crew_onboarding_progress(uuid, uuid, integer)', 'public.crew_vessel_dashboard(uuid)']) AS f;
SELECT tests.ok(NOT has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE')
                AND has_function_privilege('service_role', f, 'EXECUTE'), 'internal: ' || f)
FROM unnest(ARRAY['public.familiarisation_status_decide(integer, integer, boolean, boolean, boolean, boolean)', 'public.familiarisation_overdue(text, date, date)',
                  'public.familiarisation_action_check(text, text, integer, boolean, boolean, boolean, boolean)',
                  'public.familiarisation_actor_decide(text, boolean, boolean, boolean, boolean, boolean, text)', 'public.familiarisation_sections_normalise(jsonb)',
                  'public.familiarisation_supervisor_scope(uuid, uuid, uuid)', 'public.familiarisation_vessel_templates(uuid)',
                  'public.familiarisation_required_templates(uuid, uuid)', 'public.familiarisation_member_position(uuid, uuid)',
                  'public.familiarisation_record_recompute(uuid)', 'public.familiarisation_notify_assigned(uuid)',
                  'public.familiarisation_open_record(uuid, uuid, uuid, date, uuid, date)', 'public.familiarisation_requirement_sync(uuid, uuid)',
                  'public.familiarisation_open_required(uuid, uuid, uuid, date)', 'public.familiarisation_record_json(uuid, boolean)',
                  'public.familiarisation_record_gate(uuid)', 'public.familiarisation_template_json(uuid)', 'public.crew_onboarding_rows(uuid, uuid, integer)']) AS f;
SELECT tests.ok(NOT has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('service_role', f, 'EXECUTE'), 'trigger function: ' || f)
FROM unnest(ARRAY['public.familiarization_templates_guard()', 'public.familiarization_records_status_guard()', 'public.familiarization_checklist_items_guard()',
                  'public.familiarization_items_recompute()', 'public.familiarization_template_positions_scope_guard()', 'public.familiarisation_required_on_terms()']) AS f;
SELECT tests.ok(has_table_privilege('authenticated', 'public.familiarization_template_positions', 'SELECT')
                AND NOT has_table_privilege('authenticated', 'public.familiarization_template_positions', 'INSERT')
                AND NOT has_table_privilege('authenticated', 'public.familiarization_template_positions', 'UPDATE')
                AND NOT has_table_privilege('authenticated', 'public.familiarization_template_positions', 'DELETE')
                AND NOT has_table_privilege('anon', 'public.familiarization_template_positions', 'SELECT'),
  'relation: read only for the browser, nothing for anon: familiarization_template_positions');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename IN ('familiarization_templates', 'familiarization_records', 'familiarization_checklist_items',
                                                                      'familiarization_template_positions')
                            AND (cmd <> 'SELECT' OR policyname LIKE 'Users can%')),
  'no browser write policy and no legacy company-wide policy is left on the familiarisation tables');
SELECT tests.ok((SELECT prosecdef AND proconfig::text LIKE '%search_path=public%' FROM pg_proc WHERE oid = f::regprocedure), 'definer with search_path: ' || f)
FROM unnest(ARRAY['public.familiarisation_template_save(uuid, uuid, jsonb)', 'public.familiarisation_start(uuid, uuid, uuid)',
                  'public.familiarisation_tick(uuid, boolean, text)', 'public.familiarisation_sign(uuid, text)', 'public.familiarisation_reopen(uuid, text)',
                  'public.familiarisation_delete(uuid)', 'public.familiarisation_vessel_overview(uuid, boolean)', 'public.familiarisation_record_detail(uuid)',
                  'public.crew_onboarding_progress(uuid, uuid, integer)', 'public.crew_vessel_dashboard(uuid)',
                  'public.familiarization_records_status_guard()', 'public.familiarization_templates_guard()', 'public.familiarisation_required_on_terms()']) AS f;
SELECT tests.ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t AND NOT tgisinternal), 'trigger present: ' || t)
FROM unnest(ARRAY['familiarization_templates_guard', 'familiarization_records_status_guard', 'familiarization_checklist_items_guard',
                  'familiarization_items_recompute', 'familiarization_template_positions_scope_guard', 'familiarisation_required_on_terms']) AS t;
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_recompute_familiarization_progress'),
  'the legacy progress trigger (Completed without signatures) is gone');
