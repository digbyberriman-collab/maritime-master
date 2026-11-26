-- The crew requirement engine and its configuration (X1-06,
-- 20261124060600_crew_compliance.sql; gap/04 C5, C33, C34, C36, W5;
-- DECISIONS D-01, D-229, D-233, D-X1-3, D-X1-12, D-X1-22; platform plan
-- contract 5):
--   1. the pure rules (tab, group of a category, status, dots);
--   2. the tables: CHECKs, the scope guards (company, vessel, kind,
--      foreign types, templates and positions), the seed key, the satisfaction
--      pair per scope, RLS on and comments;
--   3. RLS: compliance.view on the vessel reads, nobody else (other vessel,
--      other tenant, plain crew, external viewer, inactive, anon); no browser
--      write;
--   4. the read RPCs: gates (unknown vessel P0002, no capability, other
--      tenant, plain crew, external, inactive, no JWT, anon), the answers
--      (met / expiring / missing with reasons, a pending placement, own rows
--      with view_own), crew_compliance_for_vessels refusing unknown or
--      unreached ids with 42501 vessel_out_of_reach, the configuration;
--   5. the internal views and functions are not the browser's; the public
--      views return only the reader's permitted vessels;
--   6. the writes: row save / delete / cells / bulk, the STCW basic set, the
--      passenger toggle (add and remove), settings, tenant document types and
--      company satisfaction rules, every refusal; the engine follows a
--      company rule at once;
--   7. the seed: training_matrix mapping, the STCW basic fallback, vessels
--      already configured only marked, a second run adds nothing, a cleared
--      configuration stays cleared;
--   8. performance: 100 crew x 40 requirements read under 500 ms;
--   9. grants and ACLs.

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ world (A.dra unless named)

SELECT tests.seed_role('x16_admin', 'vessel');
SELECT tests.seed_role('x16_view', 'vessel');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'crew_certificates', x.p::public.permission_level, 'vessel'
FROM (VALUES ('x16_admin', 'admin'), ('x16_view', 'view')) AS x(r, p)
JOIN public.roles AS r ON r.name = x.r;

SELECT tests.seed_user('A', 'A.cadmin', 'crew');                                 -- compliance admin on A.dra
SELECT tests.seed_assignment('A.cadmin', 'A.dra', true, 'Second Officer');
SELECT tests.seed_rbac_role('A.cadmin', 'x16_admin', 'A.dra');
SELECT tests.seed_user('A', 'A.cview', 'crew');                                  -- compliance view on A.hyd only
SELECT tests.seed_assignment('A.cview', 'A.hyd', true, 'Bosun');
SELECT tests.seed_rbac_role('A.cview', 'x16_view', 'A.hyd');
SELECT tests.seed_user('A', 'A.deck', 'crew');                                   -- plain crew on A.dra
SELECT tests.seed_assignment('A.deck', 'A.dra', true, 'Deckhand');
SELECT tests.seed_user('A', 'A.deck2', 'crew');
SELECT tests.seed_assignment('A.deck2', 'A.dra', true, 'Deckhand');
SELECT tests.seed_profile('A', 'A.pending', 'crew', 'not_invited', NULL,
  jsonb_build_object('is_imported', true, 'imported_vessel_id', tests.vessel_id('A.dra'), 'rank', 'Deckhand'));
SELECT tests.seed_user('A', 'A.ext', 'crew');                                    -- an external viewer of A on A.dra
SELECT tests.seed_rbac_role('A.ext', 'x16_view', 'A.dra');
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'external', vessel_scope = 'assigned', fleet_access = false, source = 'admin',
    valid_from = now() - interval '1 day', valid_until = now() + interval '7 days'
WHERE user_id = tests.user_id('A.ext');
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT id, company_id, tests.vessel_id('A.dra') FROM public.account_memberships WHERE user_id = tests.user_id('A.ext');
SELECT tests.seed_rbac_role('A.disabled', 'x16_admin', 'A.dra');                 -- would be an admin, but disabled
SELECT tests.seed_assignment('A.disabled', 'A.dra', true, 'Deckhand');

CREATE OR REPLACE FUNCTION pg_temp.ty(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT md5('storm.crew_document_type.' || p_key)::uuid $$;
CREATE OR REPLACE FUNCTION pg_temp.pos(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT md5('storm.position.' || p_key)::uuid $$;
CREATE OR REPLACE FUNCTION pg_temp.doc(p_key text, p_person text, p_type text, p_expiry date, p_status text DEFAULT 'verified')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid := tests.id('x16doc:' || p_key);
BEGIN
  INSERT INTO public.crew_certificates (id, user_id, profile_id, certificate_type, certificate_name, expiry_date, document_type_id,
                                        verification_status, file_path, status)
  SELECT v_id, p.user_id, p.id, t.name, t.name, p_expiry, t.id, p_status,
         p.company_id::text || '/crew/' || p.id::text || '/documents/' || v_id::text || '-scan.pdf', 'Valid'
  FROM public.profiles AS p, public.crew_document_types AS t
  WHERE p.id = tests.profile_id(p_person) AND t.id = pg_temp.ty(p_type);
  RETURN v_id;
END;
$$;
CREATE TEMP TABLE rpc_out (k text PRIMARY KEY, r jsonb) ON COMMIT DROP;
GRANT ALL ON rpc_out TO authenticated, service_role, anon;

-- Listed positions: DRAAK lists the Deckhand, the Second Officer and the Master; HYDRA the Bosun.
INSERT INTO public.position_manning (company_id, vessel_id, position_id, is_listed, min_on_board) VALUES
  (tests.company_id('A'), tests.vessel_id('A.dra'), pg_temp.pos('deckhand'), true, 0),
  (tests.company_id('A'), tests.vessel_id('A.dra'), pg_temp.pos('second_officer'), true, 0),
  (tests.company_id('A'), tests.vessel_id('A.dra'), pg_temp.pos('master'), true, 0),
  (tests.company_id('A'), tests.vessel_id('A.hyd'), pg_temp.pos('bosun'), true, 0)
ON CONFLICT (vessel_id, position_id) DO UPDATE SET is_listed = true;

SELECT pg_temp.doc('deck_bst', 'A.deck', 'stcw_basic_safety', current_date + 400);
SELECT pg_temp.doc('deck_eng1', 'A.deck', 'eng1', current_date + 20);
SELECT pg_temp.doc('deck2_pst', 'A.deck2', 'stcw_pst', current_date + 400, 'rejected');
SELECT pg_temp.doc('pending_pst', 'A.pending', 'stcw_pst', current_date + 400);

-- Setup checks.
SELECT tests.ok(public.has_capability_for(tests.user_id('A.cadmin'), 'vessel.crew.crew_compliance.admin', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.cadmin'), 'vessel.crew.crew_compliance.view', tests.company_id('A'), tests.vessel_id('A.hyd'))
                AND public.has_capability_for(tests.user_id('A.cadmin'), 'vessel.crew.crew_compliance.admin', tests.company_id('A'), NULL),
  'setup: A.cadmin administers crew compliance on DRAAK (and at company level), not on HYDRA');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.cview'), 'vessel.crew.crew_compliance.view', tests.company_id('A'), tests.vessel_id('A.hyd'))
                AND NOT public.has_capability_for(tests.user_id('A.cview'), 'vessel.crew.crew_compliance.admin', tests.company_id('A'), tests.vessel_id('A.hyd'))
                AND NOT public.has_capability_for(tests.user_id('A.cview'), 'vessel.crew.crew_compliance.view', tests.company_id('A'), tests.vessel_id('A.dra')),
  'setup: A.cview reads crew compliance on HYDRA only and administers nothing');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.master_dra'), 'vessel.crew.crew_compliance.view', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.master_dra'), 'vessel.crew.crew_compliance.admin', tests.company_id('A'), tests.vessel_id('A.dra')),
  'setup: the master reads crew compliance on DRAAK (the crew nav rule) but does not administer it');
SELECT tests.ok(NOT public.has_capability_for(tests.user_id('A.deck'), 'vessel.crew.crew_compliance.view', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.has_capability_for(tests.user_id('A.deck'), 'vessel.crew.crew_certificates.view_own', tests.company_id('A'), tests.vessel_id('A.dra')),
  'setup: a deckhand holds no compliance view, only view_own');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.ext'), 'vessel.crew.crew_compliance.view', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.record_user_is_external(tests.user_id('A.ext'), tests.company_id('A')),
  'setup: the external viewer holds compliance view on DRAAK (so the refusals below are the external rule)');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.fleet_manager'), 'vessel.crew.crew_compliance.admin', tests.company_id('A'), tests.vessel_id('A.hyd')),
  'setup: the fleet manager administers every A vessel');

-- ------------------------------------------------------------ 1. pure rules

SELECT tests.results_eq($q$SELECT public.crew_requirement_tab(k, g, t) FROM (VALUES
    ('familiarisation', 'familiarisation', 'stcw'), ('document', 'medical', 'documents'), ('document', 'medical', NULL),
    ('document', 'documents', NULL), ('document', 'coc_gmdss', NULL), ('document', 'custom', 'nonsense'), ('document', 'security', NULL)) AS x(k, g, t)$q$,
  $q$VALUES ('familiarisation'), ('documents'), ('stcw'), ('documents'), ('qualifications'), ('qualifications'), ('stcw')$q$,
  'crew_requirement_tab: familiarisation, the option tab, else the group (TS requirementTab)');
SELECT tests.results_eq($q$SELECT public.crew_requirement_group_for_category(c) FROM unnest(ARRAY['stcw_basic', 'stcw_fire', 'medical_fitness', 'coc_deck', 'radio', 'ratings', 'stcw_navigation', 'passports', 'culinary', NULL]) AS c$q$,
  $q$VALUES ('stcw_basic'), ('advanced_training'), ('medical'), ('coc_gmdss'), ('coc_gmdss'), ('deck_engineering'), ('navigation_safety'), ('documents'), ('custom'), ('custom')$q$,
  'crew_requirement_group_for_category (TS requirementGroupForCategory; compliance.test.ts compares every category)');
SELECT tests.results_eq($q$SELECT public.crew_compliance_status_decide(a, b, c) FROM (VALUES (0, 0, 0), (0, 0, 2), (0, 1, 2), (1, 1, 2), (NULL, NULL, NULL)) AS x(a, b, c)$q$,
  $q$VALUES ('complete'), ('expiring'), ('missing'), ('expired'), ('complete')$q$, 'crew_compliance_status_decide: expired > missing > expiring > complete');
SELECT tests.results_eq($q$SELECT public.crew_compliance_dot(a, b, c) FROM (VALUES (0, 3, 3), (2, 0, 0), (2, 0, 1), (2, 1, 1)) AS x(a, b, c)$q$,
  $q$VALUES ('none'), ('ok'), ('warn'), ('danger')$q$, 'crew_compliance_dot: none, ok, warn, danger');

-- ------------------------------------------------------------ 2. tables and guards

SELECT tests.ok((SELECT bool_and(c.relrowsecurity) FROM pg_class AS c WHERE c.oid IN ('public.crew_requirement_rows'::regclass, 'public.crew_requirement_options'::regclass, 'public.crew_requirement_positions'::regclass)),
  'RLS is on for the three requirement tables');
SELECT tests.ok((SELECT bool_and(obj_description(c.oid, 'pg_class') IS NOT NULL) FROM pg_class AS c
                 WHERE c.oid IN ('public.crew_requirement_rows'::regclass, 'public.crew_requirement_options'::regclass, 'public.crew_requirement_positions'::regclass,
                                 'public.crew_requirement_status'::regclass, 'public.crew_compliance_summary'::regclass,
                                 'public.crew_requirement_status_internal'::regclass, 'public.crew_compliance_summary_internal'::regclass)),
  'every table and view has a comment');
SELECT tests.ok(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vessel_crew_settings' AND column_name = 'requirements_seeded_at'),
  'vessel_crew_settings.requirements_seeded_at exists');
SELECT tests.ok(EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'crew_requirement_positions_position_idx')
                AND EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'crew_certificates_profile_document_type_idx'),
  'the engine indexes exist: crew_requirement_positions(position_id), crew_certificates(profile_id, document_type_id)');

INSERT INTO public.crew_requirement_rows (id, vessel_id, group_key, label, kind, sort_order)
VALUES (tests.id('row:g1'), tests.vessel_id('A.dra'), 'custom', 'Guard test', 'document', 5000);
SELECT tests.is((SELECT company_id FROM public.crew_requirement_rows WHERE id = tests.id('row:g1')), tests.company_id('A'), 'the row guard fills the vessel''s company');
SELECT tests.throws_like(format($q$INSERT INTO public.crew_requirement_rows (vessel_id, company_id, group_key, label) VALUES (%L, %L, 'custom', 'x')$q$,
  tests.vessel_id('A.dra'), tests.company_id('B')), '23514', 'crew_requirement_scope_mismatch', 'a row of another company than its vessel''s is refused');
SELECT tests.throws_like(format($q$UPDATE public.crew_requirement_rows SET vessel_id = %L WHERE id = %L$q$, tests.vessel_id('A.hyd'), tests.id('row:g1')),
  '23514', 'crew_requirement_vessel_locked', 'a row stays on its vessel');
SELECT tests.throws_like(format($q$INSERT INTO public.crew_requirement_rows (vessel_id, group_key, label) VALUES (%L, 'nonsense', 'x')$q$, tests.vessel_id('A.dra')),
  '23514', '%group_key%', 'the group CHECK');
SELECT tests.throws_like(format($q$INSERT INTO public.crew_requirement_rows (vessel_id, group_key, label, kind) VALUES (%L, 'custom', 'x', 'familiarisation')$q$, tests.vessel_id('A.dra')),
  '23514', '%kind_group%', 'a familiarisation row sits in the familiarisation group');
SELECT tests.throws_like(format($q$INSERT INTO public.crew_requirement_rows (vessel_id, group_key, label) VALUES (%L, 'custom', '   ')$q$, tests.vessel_id('A.dra')),
  '23514', '%label%', 'a blank label is refused');
SELECT tests.throws(format($q$INSERT INTO public.crew_requirement_options (row_id) VALUES (%L)$q$, tests.id('row:g1')), '23514', 'an option names exactly one of a type or a template (none)');
SELECT tests.throws_like(format($q$INSERT INTO public.crew_requirement_options (row_id, document_type_id) VALUES (%L, %L)$q$, tests.id('row:g1'), tests.id('nope')),
  '23514', 'crew_requirement_type_scope_mismatch', 'an option of an unknown type is refused');
INSERT INTO public.crew_document_types (id, company_id, category_key, key, name, expiry_item_type)
VALUES (tests.id('type:B.own'), tests.company_id('B'), 'other_qualifications', 'b_own_course', 'B own course', 'crew_qualification');
SELECT tests.throws_like(format($q$INSERT INTO public.crew_requirement_options (row_id, document_type_id) VALUES (%L, %L)$q$, tests.id('row:g1'), tests.id('type:B.own')),
  '23514', 'crew_requirement_type_scope_mismatch', 'an option of another company''s type is refused');
INSERT INTO public.familiarization_templates (id, vessel_id, template_name, sections, total_duration_days)
VALUES (tests.id('tpl:dra'), tests.vessel_id('A.dra'), 'DRAAK deck induction', '[]', 14),
       (tests.id('tpl:lev'), tests.vessel_id('B.lev'), 'LEVIATHAN induction', '[]', 14);
SELECT tests.throws_like(format($q$INSERT INTO public.crew_requirement_options (row_id, familiarization_template_id) VALUES (%L, %L)$q$, tests.id('row:g1'), tests.id('tpl:dra')),
  '23514', 'crew_requirement_option_kind_mismatch', 'a document row takes no template');
INSERT INTO public.crew_requirement_rows (id, vessel_id, group_key, label, kind, sort_order)
VALUES (tests.id('row:gf'), tests.vessel_id('A.dra'), 'familiarisation', 'Deck induction', 'familiarisation', 5010);
SELECT tests.throws_like(format($q$INSERT INTO public.crew_requirement_options (row_id, familiarization_template_id) VALUES (%L, %L)$q$, tests.id('row:gf'), tests.id('tpl:lev')),
  '23514', 'crew_requirement_template_scope_mismatch', 'a template of another company is refused');
SELECT tests.throws_like(format($q$INSERT INTO public.crew_requirement_options (row_id, document_type_id) VALUES (%L, %L)$q$, tests.id('row:gf'), pg_temp.ty('stcw_pst')),
  '23514', 'crew_requirement_option_kind_mismatch', 'a familiarisation row takes no document type');
INSERT INTO public.crew_requirement_options (row_id, familiarization_template_id) VALUES (tests.id('row:gf'), tests.id('tpl:dra'));
SELECT tests.is((SELECT vessel_id FROM public.crew_requirement_options WHERE row_id = tests.id('row:gf')), tests.vessel_id('A.dra'), 'the option guard fills the row''s vessel');
SELECT tests.throws_like(format($q$UPDATE public.crew_requirement_rows SET kind = 'document', group_key = 'custom' WHERE id = %L$q$, tests.id('row:gf')),
  '23514', 'crew_requirement_option_kind_mismatch', 'a row with options does not change kind under them');
INSERT INTO public.positions (id, company_id, vessel_id, key, name, department_key, rank_tier)
VALUES (tests.id('pos:hyd_only'), tests.company_id('A'), tests.vessel_id('A.hyd'), 'hydra_diver', 'Hydra diver', 'dive', 'rating');
SELECT tests.throws_like(format($q$INSERT INTO public.crew_requirement_positions (row_id, position_id) VALUES (%L, %L)$q$, tests.id('row:g1'), tests.id('pos:hyd_only')),
  '23514', 'crew_requirement_position_scope_mismatch', 'a position of another vessel cannot be ticked');
INSERT INTO public.crew_requirement_positions (row_id, position_id) VALUES (tests.id('row:g1'), pg_temp.pos('bosun'));
SELECT tests.throws(format($q$INSERT INTO public.crew_requirement_positions (row_id, position_id) VALUES (%L, %L)$q$, tests.id('row:g1'), pg_temp.pos('bosun')), '23505',
  'a cell is ticked once');
INSERT INTO public.crew_requirement_rows (vessel_id, group_key, label, seed_key) VALUES (tests.vessel_id('A.dra'), 'custom', 'Seeded', 'test.seed');
SELECT tests.throws(format($q$INSERT INTO public.crew_requirement_rows (vessel_id, group_key, label, seed_key) VALUES (%L, 'custom', 'Again', 'test.seed')$q$, tests.vessel_id('A.dra')),
  '23505', 'a seed key is unique per vessel');
SELECT tests.lives(format($q$INSERT INTO public.crew_requirement_rows (vessel_id, group_key, label, seed_key) VALUES (%L, 'custom', 'Elsewhere', 'test.seed')$q$, tests.vessel_id('A.hyd')),
  'the same seed key on another vessel');
DELETE FROM public.crew_requirement_rows WHERE id = tests.id('row:g1') OR seed_key = 'test.seed';

-- The satisfaction pair is unique per scope: two companies may each accept the same pair.
INSERT INTO public.crew_document_type_satisfies (company_id, type_id, satisfies_type_id, kind)
VALUES (tests.company_id('A'), pg_temp.ty('stcw_pscrb'), pg_temp.ty('stcw_pst'), 'equivalent');
SELECT tests.lives(format($q$INSERT INTO public.crew_document_type_satisfies (company_id, type_id, satisfies_type_id, kind) VALUES (%L, %L, %L, 'equivalent')$q$,
  tests.company_id('B'), pg_temp.ty('stcw_pscrb'), pg_temp.ty('stcw_pst')), 'another company accepts the same pair (one pair per scope)');
SELECT tests.throws(format($q$INSERT INTO public.crew_document_type_satisfies (company_id, type_id, satisfies_type_id, kind) VALUES (%L, %L, %L, 'supersedes')$q$,
  tests.company_id('A'), pg_temp.ty('stcw_pscrb'), pg_temp.ty('stcw_pst')), '23505', 'but a company holds a pair once');
DELETE FROM public.crew_document_type_satisfies WHERE company_id IS NOT NULL AND type_id = pg_temp.ty('stcw_pscrb');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crew_document_type_satisfies_pair_key'), 'X1-04''s global pair key is gone');

-- ------------------------------------------------------------ 3. the configuration through the RPCs (and RLS)

-- The STCW basic set and an ENG1 row on DRAAK, by the compliance admin.
SELECT tests.as_user(tests.user_id('A.cadmin'));
INSERT INTO rpc_out SELECT 'basic1', to_jsonb(s) FROM public.crew_requirements_add_stcw_basic(tests.vessel_id('A.dra')) AS s;
INSERT INTO rpc_out SELECT 'eng1', to_jsonb(public.crew_requirement_row_save(tests.vessel_id('A.dra'), NULL,
  jsonb_build_object('group_key', 'medical', 'label', 'Medical fitness', 'options', jsonb_build_array(jsonb_build_object('document_type_id', pg_temp.ty('eng1'))),
                     'position_ids', jsonb_build_array(pg_temp.pos('deckhand')))));
SELECT tests.reset_role();
SELECT tests.is((SELECT r FROM rpc_out WHERE k = 'basic1'), '{"rows_added": 4, "cells_added": 12}'::jsonb, 'the STCW basic set: four rows, ticked for the three listed positions');
SELECT tests.results_eq($q$SELECT seed_key, label, group_key FROM public.crew_requirement_rows WHERE vessel_id = tests.vessel_id('A.dra') AND seed_key LIKE 'stcw_basic.%' ORDER BY sort_order$q$,
  $q$VALUES ('stcw_basic.pst', 'Personal survival techniques', 'stcw_basic'), ('stcw_basic.fpff', 'Fire prevention and fire fighting', 'stcw_basic'),
            ('stcw_basic.efa', 'Elementary first aid', 'stcw_basic'), ('stcw_basic.pssr', 'Personal safety and social responsibilities', 'stcw_basic')$q$,
  'PST, FPFF, EFA, PSSR, named after their types');
SELECT tests.ok((SELECT (r ->> 'kind') = 'document' AND (r ->> 'created_by')::uuid = tests.user_id('A.cadmin') AND (r ->> 'sort_order')::integer > 0 FROM rpc_out WHERE k = 'eng1'),
  'row_save creates a document row stamped with its author');

-- RLS.
SELECT tests.as_user(tests.user_id('A.cadmin'));
SELECT tests.is((SELECT count(*) FROM public.crew_requirement_rows), 6::bigint, 'the compliance admin reads DRAAK''s six rows (the familiarisation row included)');
SELECT tests.is((SELECT count(*) FROM public.crew_requirement_positions), 13::bigint, 'and their thirteen ticks');
SELECT tests.is((SELECT count(*) FROM public.crew_requirement_options), 6::bigint, 'and their six options (the familiarisation row included)');
SELECT tests.throws($q$INSERT INTO public.crew_requirement_rows (vessel_id, group_key, label) VALUES (tests.vessel_id('A.dra'), 'custom', 'x')$q$, '42501', 'no browser insert');
SELECT tests.throws($q$UPDATE public.crew_requirement_rows SET label = 'x'$q$, '42501', 'no browser update');
SELECT tests.throws($q$DELETE FROM public.crew_requirement_positions$q$, '42501', 'no browser delete');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is((SELECT count(*) FROM public.crew_requirement_rows), 6::bigint, 'the master reads them (compliance view)');
SELECT tests.as_user(tests.user_id('A.cview'));
SELECT tests.is((SELECT count(*) FROM public.crew_requirement_rows), 0::bigint, 'compliance view on HYDRA reads none of DRAAK''s');
SELECT tests.as_user(tests.user_id('A.deck'));
SELECT tests.is((SELECT count(*) FROM public.crew_requirement_rows) + (SELECT count(*) FROM public.crew_requirement_options) + (SELECT count(*) FROM public.crew_requirement_positions),
  0::bigint, 'a deckhand reads no configuration');
SELECT tests.as_user(tests.user_id('A.ext'));
SELECT tests.is((SELECT count(*) FROM public.crew_requirement_rows), 0::bigint, 'an external viewer reads none');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is((SELECT count(*) FROM public.crew_requirement_rows), 0::bigint, 'an inactive caller reads none');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is((SELECT count(*) FROM public.crew_requirement_rows), 0::bigint, 'another tenant reads none');
SELECT tests.as_anon();
SELECT tests.throws($q$SELECT count(*) FROM public.crew_requirement_rows$q$, '42501', 'anon has no grant');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 4. the read RPCs

-- Gates of crew_vessel_compliance.
SELECT tests.as_user(tests.user_id('A.cadmin'));
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_compliance(tests.id('no-such-vessel'))$q$, 'P0002', 'vessel_not_found', 'an unknown vessel: P0002');
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_compliance(tests.vessel_id('B.lev'))$q$, '42501', 'crew_not_permitted', 'another tenant''s vessel: 42501');
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_compliance(tests.vessel_id('A.hyd'))$q$, '42501', 'crew_not_permitted', 'a vessel without the capability: 42501');
SELECT tests.as_user(tests.user_id('A.deck'));
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_compliance(tests.vessel_id('A.dra'))$q$, '42501', 'crew_not_permitted', 'a plain crew member: 42501');
SELECT tests.as_user(tests.user_id('A.ext'));
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_compliance(tests.vessel_id('A.dra'))$q$, '42501', 'crew_not_permitted', 'an external viewer: 42501 although the capability answers');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws($q$SELECT * FROM public.crew_vessel_compliance(tests.vessel_id('A.dra'))$q$, '42501', 'an inactive caller: 42501');
SELECT tests.as_anon();
SELECT tests.throws($q$SELECT * FROM public.crew_vessel_compliance(tests.vessel_id('A.dra'))$q$, '42501', 'anon cannot execute it');
SELECT tests.reset_role();
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_compliance(tests.vessel_id('A.dra'))$q$, '42501', 'not_signed_in', 'without a JWT: not signed in');

-- The answers.
SELECT tests.as_user(tests.user_id('A.master_dra'));
CREATE TEMP TABLE dra_sum ON COMMIT DROP AS SELECT * FROM public.crew_vessel_compliance(tests.vessel_id('A.dra'));
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT last_name, position_name, placement_kind, required, met, status, dot_documents, dot_qualifications FROM dra_sum ORDER BY last_name$q$,
  $q$VALUES ('A.cadmin', 'Second Officer', 'assignment', 4, 0, 'missing', 'none', 'danger'),
            ('A.deck', 'Deckhand', 'assignment', 5, 5, 'expiring', 'warn', 'ok'),
            ('A.deck2', 'Deckhand', 'assignment', 5, 0, 'missing', 'danger', 'danger'),
            ('A.disabled', 'Deckhand', 'assignment', 5, 0, 'missing', 'danger', 'danger'),
            ('A.master_dra', 'Master', 'assignment', 4, 0, 'missing', 'none', 'danger'),
            ('A.pending', 'Deckhand', 'pending_placement', 5, 1, 'missing', 'danger', 'danger')$q$,
  'the DRAAK crew: a summary per member (a pending placement included; the external viewer is no member)');
SELECT tests.results_eq($q$SELECT docs_required, docs_met, stcw_required, stcw_met, expiring, next_expiry - current_date, issues FROM dra_sum WHERE last_name = 'A.deck'$q$,
  $q$VALUES (1, 1, 4, 4, 1, 20, jsonb_build_array(jsonb_build_object('row_id', (SELECT id FROM public.crew_requirement_rows WHERE label = 'Medical fitness'),
            'label', 'Medical fitness', 'tab', 'documents', 'state', 'expiring', 'reason', 'expiring')))$q$,
  'A.deck: the combined certificate covers the basic set, ENG1 expires in 20 days (next expiry, the one issue)');

SELECT tests.as_user(tests.user_id('A.cadmin'));
CREATE TEMP TABLE dra_rows ON COMMIT DROP AS SELECT * FROM public.crew_vessel_requirement_status(tests.vessel_id('A.dra'));
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT row_label, state, satisfied_via, gap_reason, nearest_document_id = tests.id('x16doc:pending_pst') FROM dra_rows
     WHERE profile_id = tests.profile_id('A.pending') ORDER BY row_sort$q$,
  $q$VALUES ('Personal survival techniques', 'met', 'option', NULL::text, NULL::boolean),
            ('Fire prevention and fire fighting', 'missing', NULL, 'not_linked', true),
            ('Elementary first aid', 'missing', NULL, 'not_linked', true),
            ('Personal safety and social responsibilities', 'missing', NULL, 'not_linked', true),
            ('Medical fitness', 'missing', NULL, 'none', NULL)$q$,
  'the pending placement: PST held; the other basic rows name it as nearest, not linked; ENG1 nothing near');
SELECT tests.results_eq($q$SELECT state, gap_reason, nearest_document_id = tests.id('x16doc:deck2_pst') FROM dra_rows
     WHERE profile_id = tests.profile_id('A.deck2') AND row_label = 'Personal survival techniques'$q$,
  $q$VALUES ('missing', 'rejected', true)$q$, 'A.deck2: a rejected PST never counts; the cell says so');
SELECT tests.results_eq($q$SELECT row_label, satisfied_via, satisfying_document_id = tests.id('x16doc:deck_bst') FROM dra_rows
     WHERE profile_id = tests.profile_id('A.deck') AND row_label <> 'Medical fitness' ORDER BY row_sort$q$,
  $q$VALUES ('Personal survival techniques', 'component', true), ('Fire prevention and fire fighting', 'component', true),
            ('Elementary first aid', 'component', true), ('Personal safety and social responsibilities', 'component', true)$q$,
  'A.deck: every basic row names the combined certificate as a component');

-- One person; one's own rows with view_own.
SELECT tests.as_user(tests.user_id('A.cadmin'));
SELECT tests.is((SELECT count(*) FROM public.crew_vessel_requirement_status(tests.vessel_id('A.dra'), tests.profile_id('A.deck'))), 5::bigint, 'one person''s rows');
SELECT tests.is((SELECT count(*) FROM public.crew_vessel_requirement_status(tests.vessel_id('A.dra'), tests.profile_id('A.crew_hyd'))), 0::bigint, 'a person who is not on the crew has no rows');
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_requirement_status(tests.vessel_id('A.dra'), tests.profile_id('B.admin'))$q$, 'P0002', 'profile_not_found', 'a person of another company: P0002');
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_requirement_status(tests.id('nope'))$q$, 'P0002', 'vessel_not_found', 'an unknown vessel: P0002');
SELECT tests.as_user(tests.user_id('A.deck'));
SELECT tests.is((SELECT count(*) FROM public.crew_vessel_requirement_status(tests.vessel_id('A.dra'), tests.profile_id('A.deck'))), 5::bigint,
  'a deckhand reads their own rows (view_own: the profile''s Missing required block)');
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_requirement_status(tests.vessel_id('A.dra'), tests.profile_id('A.deck2'))$q$, '42501', 'crew_not_permitted', 'but nobody else''s');
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_requirement_status(tests.vessel_id('A.dra'))$q$, '42501', 'crew_not_permitted', 'nor the whole crew');
SELECT tests.as_user(tests.user_id('A.ext'));
SELECT tests.throws($q$SELECT * FROM public.crew_vessel_requirement_status(tests.vessel_id('A.dra'))$q$, '42501', 'an external viewer: 42501');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws($q$SELECT * FROM public.crew_vessel_requirement_status(tests.vessel_id('A.dra'), tests.profile_id('A.disabled'))$q$, '42501', 'an inactive caller, own rows included: 42501');
SELECT tests.reset_role();

-- crew_compliance_for_vessels (fleet report R5, contract 5).
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is((SELECT count(DISTINCT vessel_id) FROM public.crew_compliance_for_vessels(ARRAY[tests.vessel_id('A.dra'), tests.vessel_id('A.hyd'), tests.vessel_id('A.dra')])), 2::bigint,
  'the fleet manager reads DRAAK and HYDRA (a repeated id once)');
SELECT tests.is((SELECT count(*) FROM public.crew_compliance_for_vessels(ARRAY[]::uuid[])), 0::bigint, 'an empty list: no rows');
SELECT tests.throws_like($q$SELECT * FROM public.crew_compliance_for_vessels(ARRAY[tests.vessel_id('A.dra'), tests.vessel_id('B.lev')])$q$, '42501', 'vessel_out_of_reach', 'another tenant''s vessel refuses the whole call');
SELECT tests.throws_like($q$SELECT * FROM public.crew_compliance_for_vessels(ARRAY[tests.vessel_id('A.dra'), tests.id('no-such-vessel')])$q$, '42501', 'vessel_out_of_reach', 'an unknown id too (never P0002: no existence leak)');
SELECT tests.throws_like($q$SELECT * FROM public.crew_compliance_for_vessels(ARRAY[tests.vessel_id('A.dra'), NULL])$q$, '42501', 'vessel_out_of_reach', 'and a NULL id');
SELECT tests.throws_like($q$SELECT * FROM public.crew_compliance_for_vessels(NULL)$q$, '22023', 'vessels_required', 'no list: 22023');
SELECT tests.throws_like($q$SELECT * FROM public.crew_compliance_for_vessels(ARRAY(SELECT tests.vessel_id('A.dra') FROM generate_series(1, 501)))$q$, '22023', 'too_many_vessels', 'more than 500 ids: 22023');
SELECT tests.as_user(tests.user_id('A.cview'));
SELECT tests.is((SELECT count(*) FROM public.crew_compliance_for_vessels(ARRAY[tests.vessel_id('A.hyd')])), 2::bigint, 'compliance view on HYDRA reads its crew');
SELECT tests.throws_like($q$SELECT * FROM public.crew_compliance_for_vessels(ARRAY[tests.vessel_id('A.hyd'), tests.vessel_id('A.dra')])$q$, '42501', 'vessel_out_of_reach', 'a same-company vessel without the capability refuses the call');
SELECT tests.as_user(tests.user_id('A.ext'));
SELECT tests.throws_like($q$SELECT * FROM public.crew_compliance_for_vessels(ARRAY[tests.vessel_id('A.dra')])$q$, '42501', 'vessel_out_of_reach', 'an external viewer is refused');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws_like($q$SELECT * FROM public.crew_compliance_for_vessels(ARRAY[tests.vessel_id('A.dra')])$q$, '42501', 'vessel_out_of_reach', 'an inactive caller reaches nothing');
SELECT tests.reset_role();
SELECT tests.throws_like($q$SELECT * FROM public.crew_compliance_for_vessels(ARRAY[tests.vessel_id('A.dra')])$q$, '42501', 'not_signed_in', 'without a JWT: not signed in');

-- The configuration.
SELECT tests.as_user(tests.user_id('A.cadmin'));
INSERT INTO rpc_out VALUES ('config_admin', public.crew_requirements_config(tests.vessel_id('A.dra')));
SELECT tests.as_user(tests.user_id('A.master_dra'));
INSERT INTO rpc_out VALUES ('config_master', public.crew_requirements_config(tests.vessel_id('A.dra')));
SELECT tests.as_user(tests.user_id('A.deck'));
SELECT tests.throws($q$SELECT public.crew_requirements_config(tests.vessel_id('A.dra'))$q$, '42501', 'a deckhand cannot read the configuration');
SELECT tests.as_user(tests.user_id('A.ext'));
SELECT tests.throws($q$SELECT public.crew_requirements_config(tests.vessel_id('A.dra'))$q$, '42501', 'nor an external viewer');
SELECT tests.reset_role();
SELECT tests.ok((SELECT (r ->> 'can_admin')::boolean AND (r ->> 'can_admin_company')::boolean FROM rpc_out WHERE k = 'config_admin')
                AND (SELECT NOT (r ->> 'can_admin')::boolean AND NOT (r ->> 'can_admin_company')::boolean FROM rpc_out WHERE k = 'config_master'),
  'config: the admin may change it (vessel and company level), the master only reads');
SELECT tests.is((SELECT jsonb_array_length(r -> 'rows') FROM rpc_out WHERE k = 'config_admin'), 6, 'config: six rows (the familiarisation row included)');
SELECT tests.results_eq($q$SELECT x ->> 'name', (x ->> 'is_listed')::boolean FROM rpc_out, jsonb_array_elements(r -> 'positions') AS x WHERE k = 'config_admin'$q$,
  $q$VALUES ('Master', true), ('Second Officer', true), ('Deckhand', true)$q$, 'config: the listed positions in rank order');
SELECT tests.results_eq($q$SELECT x ->> 'label', (x ->> 'held_by')::integer, jsonb_array_length(x -> 'options'), jsonb_array_length(x -> 'position_ids'), x ->> 'tab'
     FROM rpc_out, jsonb_array_elements(r -> 'rows') AS x WHERE k = 'config_admin' AND x ->> 'kind' = 'document' ORDER BY (x ->> 'sort_order')::integer$q$,
  $q$VALUES ('Personal survival techniques', 2, 1, 3, 'stcw'), ('Fire prevention and fire fighting', 1, 1, 3, 'stcw'),
            ('Elementary first aid', 1, 1, 3, 'stcw'), ('Personal safety and social responsibilities', 1, 1, 3, 'stcw'),
            ('Medical fitness', 1, 1, 1, 'documents')$q$,
  'config: N options, held by X (a rejected document holds nothing), the ticks, the tab');
SELECT tests.ok((SELECT (r #>> '{settings,is_passenger_ship}')::boolean = false AND r -> 'templates' @> jsonb_build_array(jsonb_build_object('name', 'DRAAK deck induction'))
                 FROM rpc_out WHERE k = 'config_admin'), 'config: the settings (no row reads all off) and the vessel''s familiarisation templates');

-- ------------------------------------------------------------ 5. internal objects; the public views

SELECT tests.ok(NOT has_table_privilege('authenticated', 'public.crew_requirement_status_internal', 'SELECT')
                AND NOT has_table_privilege('authenticated', 'public.crew_compliance_summary_internal', 'SELECT')
                AND NOT has_table_privilege('anon', 'public.crew_requirement_status_internal', 'SELECT')
                AND has_table_privilege('service_role', 'public.crew_compliance_summary_internal', 'SELECT'),
  'the internal views: the service role only');
SELECT tests.ok((SELECT bool_and(coalesce(c.reloptions @> ARRAY['security_invoker=true'], false)) FROM pg_class AS c
                 WHERE c.oid IN ('public.crew_requirement_status'::regclass, 'public.crew_compliance_summary'::regclass,
                                 'public.crew_requirement_status_internal'::regclass, 'public.crew_compliance_summary_internal'::regclass)),
  'all four views are security invoker (zz_platform/acl)');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws($q$SELECT count(*) FROM public.crew_requirement_status_internal$q$, '42501', 'even the fleet manager cannot read the internal status view');
SELECT tests.throws($q$SELECT count(*) FROM public.crew_compliance_summary_internal$q$, '42501', 'nor the internal summary view');
SELECT tests.throws($q$SELECT * FROM public.crew_requirement_status_for(ARRAY[tests.vessel_id('A.dra')])$q$, '42501', 'nor call the engine');
SELECT tests.as_service();
SELECT tests.ok((SELECT count(*) FROM public.crew_compliance_summary_internal WHERE vessel_id = tests.vessel_id('A.dra')) = 6, 'the service role reads the internal summary of every vessel');
SELECT tests.reset_role();

-- HYDRA gets the basic set too (the fleet manager), so the views have two vessels to tell apart.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is((SELECT rows_added FROM public.crew_requirements_add_stcw_basic(tests.vessel_id('A.hyd'))), 4, 'HYDRA: the basic set');
SELECT tests.is((SELECT array_agg(DISTINCT vessel_id ORDER BY vessel_id) FROM public.crew_requirement_status),
  (SELECT array_agg(v ORDER BY v) FROM unnest(ARRAY[tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')]) AS v), 'the fleet manager''s status view: DRAAK and HYDRA');
SELECT tests.reset_role();
INSERT INTO rpc_out SELECT 'hyd_row', to_jsonb(id) FROM public.crew_requirement_rows WHERE vessel_id = tests.vessel_id('A.hyd') ORDER BY sort_order LIMIT 1;
SELECT tests.as_user(tests.user_id('A.cadmin'));
SELECT tests.is((SELECT array_agg(DISTINCT vessel_id) FROM public.crew_requirement_status), ARRAY[tests.vessel_id('A.dra')], 'A.cadmin''s status view: DRAAK only');
SELECT tests.is((SELECT count(*) FROM public.crew_compliance_summary), 6::bigint, 'A.cadmin''s summary view: the six DRAAK members');
SELECT tests.as_user(tests.user_id('A.cview'));
SELECT tests.is((SELECT array_agg(DISTINCT vessel_id) FROM public.crew_compliance_summary), ARRAY[tests.vessel_id('A.hyd')], 'A.cview''s summary view: HYDRA only');
SELECT tests.as_user(tests.user_id('A.deck'));
SELECT tests.is((SELECT count(*) FROM public.crew_requirement_status) + (SELECT count(*) FROM public.crew_compliance_summary), 0::bigint, 'a deckhand: both views empty');
SELECT tests.as_user(tests.user_id('A.ext'));
SELECT tests.is((SELECT count(*) FROM public.crew_compliance_summary), 0::bigint, 'an external viewer: empty');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is((SELECT count(*) FROM public.crew_requirement_status), 0::bigint, 'an inactive caller: empty');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is((SELECT count(*) FROM public.crew_compliance_summary WHERE company_id = tests.company_id('A')), 0::bigint, 'another tenant: none of A''s rows');
SELECT tests.as_anon();
SELECT tests.throws($q$SELECT count(*) FROM public.crew_compliance_summary$q$, '42501', 'anon: no grant on the public views');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.crew_requirement_status), 0::bigint, 'without a JWT the public view is empty');

-- ------------------------------------------------------------ 6. writes

-- crew_requirement_row_save.
SELECT tests.as_user(tests.user_id('A.cadmin'));
SELECT tests.throws_like($q$SELECT public.crew_requirement_row_save(tests.vessel_id('A.dra'), NULL, '[]'::jsonb)$q$, '22023', 'payload_invalid', 'a payload is an object');
SELECT tests.throws_like($q$SELECT public.crew_requirement_row_save(tests.vessel_id('A.dra'), NULL, '{"group_key":"nonsense","label":"x"}')$q$, '22023', 'group_invalid', 'an unknown group');
SELECT tests.throws_like($q$SELECT public.crew_requirement_row_save(tests.vessel_id('A.dra'), NULL, '{"group_key":"custom","label":"  "}')$q$, '22023', 'label_invalid', 'a blank label');
SELECT tests.throws_like($q$SELECT public.crew_requirement_row_save(tests.vessel_id('A.dra'), NULL, '{"group_key":"custom","label":"x","kind":"familiarisation"}')$q$, '22023', 'kind_group_mismatch', 'a familiarisation row outside its group');
SELECT tests.throws_like($q$SELECT public.crew_requirement_row_save(tests.vessel_id('A.dra'), NULL, '{"group_key":"custom","label":"x"}')$q$, '22023', 'options_required', 'a new row needs options');
SELECT tests.throws_like($q$SELECT public.crew_requirement_row_save(tests.vessel_id('A.dra'), NULL, '{"group_key":"custom","label":"x","options":[{"document_type_id":"not-a-uuid"}]}')$q$, '22023', 'option_invalid', 'a malformed option');
SELECT tests.throws_like($q$SELECT public.crew_requirement_row_save(tests.vessel_id('A.dra'), NULL, '{"group_key":"custom","label":"x","options":["x"]}')$q$, '22023', 'option_invalid', 'an option is an object');
SELECT tests.throws_like(format($q$SELECT public.crew_requirement_row_save(tests.vessel_id('A.dra'), NULL, '{"group_key":"custom","label":"x","options":[{"document_type_id":"%s"}]}')$q$, tests.id('type:B.own')),
  '22023', 'document_type_unknown', 'another company''s document type');
SELECT tests.throws_like(format($q$SELECT public.crew_requirement_row_save(tests.vessel_id('A.dra'), NULL, '{"group_key":"familiarisation","label":"x","options":[{"familiarization_template_id":"%s"}]}')$q$, tests.id('tpl:lev')),
  '22023', 'template_unknown', 'another company''s template');
SELECT tests.throws_like(format($q$SELECT public.crew_requirement_row_save(tests.vessel_id('A.dra'), NULL, '{"group_key":"custom","label":"x","options":[{"document_type_id":"%s"}],"position_ids":["%s"]}')$q$,
  pg_temp.ty('stcw_aff'), tests.id('pos:hyd_only')), '22023', 'position_unknown', 'a position of another vessel');
SELECT tests.throws_like(format($q$SELECT public.crew_requirement_row_save(tests.vessel_id('A.dra'), NULL, '{"group_key":"custom","label":"x","options":[{"document_type_id":"%s"}],"sort_order":"high"}')$q$,
  pg_temp.ty('stcw_aff')), '22023', 'sort_order_invalid', 'a sort order is a number');
SELECT tests.throws_like(format($q$SELECT public.crew_requirement_row_save(tests.vessel_id('A.dra'), %L, '{"label":"x"}')$q$,
  (SELECT (r #>> '{}')::uuid FROM rpc_out WHERE k = 'hyd_row')), 'P0002', 'requirement_not_found', 'another vessel''s row is not found here');
INSERT INTO rpc_out SELECT 'aff', to_jsonb(public.crew_requirement_row_save(tests.vessel_id('A.dra'), NULL,
  jsonb_build_object('group_key', 'advanced_training', 'label', 'Advanced fire fighting',
                     'options', jsonb_build_array(jsonb_build_object('document_type_id', pg_temp.ty('stcw_aff')), jsonb_build_object('document_type_id', pg_temp.ty('stcw_aff'))),
                     'position_ids', jsonb_build_array(pg_temp.pos('master'), pg_temp.pos('second_officer')))));
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.crew_requirement_options WHERE row_id = (SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'aff')), 1::bigint, 'a repeated option is kept once');
SELECT tests.is((SELECT count(*) FROM public.crew_requirement_positions WHERE row_id = (SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'aff')), 2::bigint, 'the ticks given');
SELECT tests.as_user(tests.user_id('A.cadmin'));
SELECT tests.is((public.crew_requirement_row_save(tests.vessel_id('A.dra'), (SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'aff'),
  jsonb_build_object('label', 'Advanced fire fighting (officers)', 'options', jsonb_build_array(jsonb_build_object('document_type_id', pg_temp.ty('stcw_aff_refresher'))),
                     'position_ids', jsonb_build_array(pg_temp.pos('master'))))).label, 'Advanced fire fighting (officers)', 'an update renames, replaces the options and the ticks');
SELECT tests.throws_like(format($q$SELECT public.crew_requirement_row_save(tests.vessel_id('A.dra'), %L, '{"group_key":"familiarisation"}')$q$, (SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'aff')),
  '22023', 'options_required', 'a change of kind needs the options of the new kind');
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT o.document_type_id, p.position_id FROM public.crew_requirement_options AS o JOIN public.crew_requirement_positions AS p ON p.row_id = o.row_id
     WHERE o.row_id = (SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'aff')$q$,
  $q$SELECT md5('storm.crew_document_type.stcw_aff_refresher')::uuid, md5('storm.position.master')::uuid$q$, 'the stored options and ticks are the new ones');

-- Refusals of every write for a caller without admin.
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like($q$SELECT public.crew_requirement_row_save(tests.vessel_id('A.dra'), NULL, '{"group_key":"custom","label":"x"}')$q$, '42501', 'crew_not_permitted', 'the master cannot change requirements');
SELECT tests.throws($q$SELECT public.crew_requirement_row_delete(tests.vessel_id('A.dra'), tests.id('nope'))$q$, '42501', 'nor delete');
SELECT tests.throws($q$SELECT public.crew_requirement_cell_set(tests.vessel_id('A.dra'), '[]')$q$, '42501', 'nor set cells');
SELECT tests.throws($q$SELECT public.crew_requirement_row_bulk(tests.vessel_id('A.dra'), tests.id('nope'), 'clear_all')$q$, '42501', 'nor bulk');
SELECT tests.throws($q$SELECT * FROM public.crew_requirements_add_stcw_basic(tests.vessel_id('A.dra'))$q$, '42501', 'nor add the basic set');
SELECT tests.throws($q$SELECT * FROM public.crew_vessel_set_passenger(tests.vessel_id('A.dra'), true)$q$, '42501', 'nor toggle passenger ship');
SELECT tests.throws($q$SELECT public.crew_vessel_settings_save(tests.vessel_id('A.dra'), '{"crew_uploads_enabled":true}')$q$, '42501', 'nor save settings');
SELECT tests.throws($q$SELECT public.crew_document_type_create('stcw_basic', 'A new course')$q$, '42501', 'nor add a document type');
SELECT tests.throws($q$SELECT public.crew_document_type_satisfies_save(md5('storm.crew_document_type.stcw_aff')::uuid, md5('storm.crew_document_type.stcw_pst')::uuid, 'equivalent')$q$, '42501', 'nor add a rule');
SELECT tests.as_user(tests.user_id('A.ext'));
SELECT tests.throws($q$SELECT public.crew_requirement_row_bulk(tests.vessel_id('A.dra'), tests.id('nope'), 'clear_all')$q$, '42501', 'an external viewer writes nothing');
SELECT tests.throws($q$SELECT public.crew_document_type_create('stcw_basic', 'A new course')$q$, '42501', 'nor company-level');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws($q$SELECT * FROM public.crew_requirements_add_stcw_basic(tests.vessel_id('A.dra'))$q$, '42501', 'an inactive admin writes nothing');
SELECT tests.throws($q$SELECT public.crew_document_type_create('stcw_basic', 'A new course')$q$, '42501', 'nor company-level');
SELECT tests.as_user(tests.user_id('A.cadmin'));
SELECT tests.throws_like($q$SELECT public.crew_requirement_row_delete(tests.id('nope'), tests.id('nope'))$q$, 'P0002', 'vessel_not_found', 'an unknown vessel: P0002');
SELECT tests.throws($q$SELECT public.crew_requirement_row_bulk(tests.vessel_id('B.lev'), tests.id('nope'), 'clear_all')$q$, '42501', 'another tenant''s vessel: 42501');

-- Cells.
SELECT tests.throws_like($q$SELECT public.crew_requirement_cell_set(tests.vessel_id('A.dra'), '[]')$q$, '22023', 'cells_required', 'no cells');
SELECT tests.throws_like($q$SELECT public.crew_requirement_cell_set(tests.vessel_id('A.dra'), '[{"row_id":"x","position_id":"y","required":true}]')$q$, '22023', 'cells_invalid', 'malformed cells');
SELECT tests.throws_like(format($q$SELECT public.crew_requirement_cell_set(tests.vessel_id('A.dra'), '[{"row_id":"%s","position_id":"%s"}]')$q$, tests.id('x'), tests.id('y')), '22023', 'cells_invalid', 'a cell says whether it is required');
SELECT tests.throws_like(format($q$SELECT public.crew_requirement_cell_set(tests.vessel_id('A.dra'), '[{"row_id":"%1$s","position_id":"%2$s","required":true},{"row_id":"%1$s","position_id":"%2$s","required":false}]')$q$,
  (SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'aff'), pg_temp.pos('deckhand')), '22023', 'cells_duplicate', 'each cell once');
SELECT tests.throws_like(format($q$SELECT public.crew_requirement_cell_set(tests.vessel_id('A.dra'), '[{"row_id":"%s","position_id":"%s","required":true}]')$q$,
  (SELECT (r #>> '{}')::uuid FROM rpc_out WHERE k = 'hyd_row'), pg_temp.pos('deckhand')), 'P0002', 'requirement_not_found', 'a row of another vessel');
SELECT tests.throws_like(format($q$SELECT public.crew_requirement_cell_set(tests.vessel_id('A.dra'), '[{"row_id":"%s","position_id":"%s","required":true}]')$q$,
  (SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'aff'), tests.id('pos:hyd_only')), '22023', 'position_unknown', 'a position of another vessel');
SELECT tests.is(public.crew_requirement_cell_set(tests.vessel_id('A.dra'), jsonb_build_array(
    jsonb_build_object('row_id', (SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'aff'), 'position_id', pg_temp.pos('deckhand'), 'required', true),
    jsonb_build_object('row_id', (SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'aff'), 'position_id', pg_temp.pos('master'), 'required', false),
    jsonb_build_object('row_id', (SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'aff'), 'position_id', pg_temp.pos('second_officer'), 'required', false))),
  3, 'three cells applied (an untick of an unticked cell included)');
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT position_id FROM public.crew_requirement_positions WHERE row_id = (SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'aff')$q$,
  $q$SELECT md5('storm.position.deckhand')::uuid$q$, 'the row is now ticked for the deckhand only');

-- Bulk.
SELECT tests.as_user(tests.user_id('A.cadmin'));
SELECT tests.throws_like(format($q$SELECT public.crew_requirement_row_bulk(tests.vessel_id('A.dra'), %L, 'everyone')$q$, (SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'aff')), '22023', 'action_invalid', 'an unknown action');
SELECT tests.throws_like($q$SELECT public.crew_requirement_row_bulk(tests.vessel_id('A.dra'), tests.id('nope'), 'clear_all')$q$, 'P0002', 'requirement_not_found', 'an unknown row');
SELECT tests.is(public.crew_requirement_row_bulk(tests.vessel_id('A.dra'), (SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'aff'), 'require_all'), 3, 'require all: every listed position');
SELECT tests.is(public.crew_requirement_row_bulk(tests.vessel_id('A.dra'), (SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'aff'), 'clear_all'), 0, 'clear all: no tick');

-- Delete.
SELECT tests.is(public.crew_requirement_row_delete(tests.vessel_id('A.dra'), (SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'aff')), (SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'aff'), 'delete returns the id');
SELECT tests.throws_like(format($q$SELECT public.crew_requirement_row_delete(tests.vessel_id('A.dra'), %L)$q$, (SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'aff')), 'P0002', 'requirement_not_found', 'a deleted row is gone');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.crew_requirement_options WHERE row_id = (SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'aff')), 0::bigint, 'its options went with it');

-- The STCW basic set again: idempotent; a removed row comes back; a newly listed position is ticked.
SELECT tests.as_user(tests.user_id('A.cadmin'));
SELECT tests.is((SELECT to_jsonb(s) FROM public.crew_requirements_add_stcw_basic(tests.vessel_id('A.dra')) AS s), '{"rows_added": 0, "cells_added": 0}'::jsonb, 'adding the basic set twice adds nothing');
SELECT public.crew_requirement_row_delete(tests.vessel_id('A.dra'), (SELECT id FROM public.crew_requirement_rows WHERE vessel_id = tests.vessel_id('A.dra') AND seed_key = 'stcw_basic.efa'));
SELECT tests.reset_role();
INSERT INTO public.position_manning (company_id, vessel_id, position_id, is_listed, min_on_board)
VALUES (tests.company_id('A'), tests.vessel_id('A.dra'), pg_temp.pos('bosun'), true, 0) ON CONFLICT (vessel_id, position_id) DO UPDATE SET is_listed = true;
SELECT tests.as_user(tests.user_id('A.cadmin'));
SELECT tests.is((SELECT to_jsonb(s) FROM public.crew_requirements_add_stcw_basic(tests.vessel_id('A.dra')) AS s), '{"rows_added": 1, "cells_added": 7}'::jsonb,
  'the removed EFA row comes back with four ticks, and the bosun is ticked on the three others');

-- The passenger toggle.
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_set_passenger(tests.vessel_id('A.dra'), NULL)$q$, '22023', 'value_required', 'the toggle needs a value');
SELECT tests.is((SELECT to_jsonb(s) FROM public.crew_vessel_set_passenger(tests.vessel_id('A.dra'), true) AS s), '{"rows_added": 3, "rows_removed": 0, "is_passenger_ship": true}'::jsonb,
  'passenger ship on: the three STCW V/2 rows');
SELECT tests.is((SELECT to_jsonb(s) FROM public.crew_vessel_set_passenger(tests.vessel_id('A.dra'), true) AS s), '{"rows_added": 0, "rows_removed": 0, "is_passenger_ship": true}'::jsonb,
  'on again: nothing more');
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT seed_key, (SELECT count(*) FROM public.crew_requirement_positions AS p WHERE p.row_id = r.id) FROM public.crew_requirement_rows AS r
     WHERE vessel_id = tests.vessel_id('A.dra') AND group_key = 'stcw_passenger' ORDER BY sort_order$q$,
  $q$VALUES ('stcw_passenger.crowd', 4::bigint), ('stcw_passenger.crisis', 4::bigint), ('stcw_passenger.safety', 4::bigint)$q$,
  'crowd management, crisis management, passenger service safety, ticked for the four listed positions');
SELECT tests.is((SELECT is_passenger_ship FROM public.vessel_crew_settings WHERE vessel_id = tests.vessel_id('A.dra')), true, 'the vessel flag is on');
SELECT tests.as_user(tests.user_id('A.cadmin'));
SELECT tests.is((SELECT to_jsonb(s) FROM public.crew_vessel_set_passenger(tests.vessel_id('A.dra'), false) AS s), '{"rows_added": 0, "rows_removed": 3, "is_passenger_ship": false}'::jsonb,
  'passenger ship off: the three rows go');
SELECT tests.reset_role();
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM public.crew_requirement_rows WHERE vessel_id = tests.vessel_id('A.dra') AND group_key = 'stcw_passenger')
                AND NOT (SELECT is_passenger_ship FROM public.vessel_crew_settings WHERE vessel_id = tests.vessel_id('A.dra')),
  'no STCW V/2 row is left and the flag is off');

-- Settings.
SELECT tests.as_user(tests.user_id('A.cadmin'));
SELECT tests.throws_like($q$SELECT public.crew_vessel_settings_save(tests.vessel_id('A.dra'), '{}')$q$, '22023', 'patch_empty', 'an empty patch');
SELECT tests.throws_like($q$SELECT public.crew_vessel_settings_save(tests.vessel_id('A.dra'), '{"is_passenger_ship":true}')$q$, '22023', 'use_passenger_toggle', 'the passenger flag has its own switch');
SELECT tests.throws_like($q$SELECT public.crew_vessel_settings_save(tests.vessel_id('A.dra'), '{"colour":"blue"}')$q$, '22023', 'setting_unknown', 'an unknown setting');
SELECT tests.throws_like($q$SELECT public.crew_vessel_settings_save(tests.vessel_id('A.dra'), '{"crew_uploads_enabled":"yes"}')$q$, '22023', 'setting_invalid', 'a setting is a boolean');
SELECT tests.is((public.crew_vessel_settings_save(tests.vessel_id('A.dra'), '{"transfer_requires_fleet_approval":true}')).transfer_requires_fleet_approval, true, 'transfer approval on');
SELECT tests.ok((SELECT s.crew_uploads_enabled AND s.transfer_requires_fleet_approval AND s.updated_by = tests.user_id('A.cadmin')
                 FROM public.crew_vessel_settings_save(tests.vessel_id('A.dra'), '{"crew_uploads_enabled":true}') AS s),
  'crew uploads on; the other setting is kept; the writer stamped');
SELECT tests.reset_role();

-- Tenant document types (company level).
SELECT tests.as_user(tests.user_id('A.cadmin'));
INSERT INTO rpc_out SELECT 'type_a', to_jsonb(public.crew_document_type_create('stcw_basic', '  Acme sea survival  ', 'acme-ss', 'ASS', 60, 'Company course'));
SELECT tests.throws_like($q$SELECT public.crew_document_type_create('stcw_basic', 'Personal survival techniques')$q$, '22023', 'document_type_exists', 'the name of a STORM type');
SELECT tests.throws_like($q$SELECT public.crew_document_type_create('stcw_basic', 'Something else', 'STCW-PST')$q$, '22023', 'document_type_exists', 'the code of a STORM type');
SELECT tests.throws_like($q$SELECT public.crew_document_type_create('stcw_basic', 'ACME sea-survival')$q$, '22023', 'document_type_exists', 'the company''s own name again, in other case and punctuation');
SELECT tests.throws_like($q$SELECT public.crew_document_type_create('nonsense', 'Something')$q$, '22023', 'category_unknown', 'an unknown category');
SELECT tests.throws_like($q$SELECT public.crew_document_type_create('stcw_basic', ' ')$q$, '22023', 'name_invalid', 'a blank name');
SELECT tests.throws_like($q$SELECT public.crew_document_type_create('stcw_basic', 'Something', 'bad code!')$q$, '22023', 'code_invalid', 'a code of letters, digits and dashes');
SELECT tests.throws_like($q$SELECT public.crew_document_type_create('stcw_basic', 'Something', NULL, NULL, 300)$q$, '22023', 'validity_invalid', 'validity 0 to 240 months');
SELECT tests.reset_role();
SELECT tests.ok((SELECT (r ->> 'company_id')::uuid = tests.company_id('A') AND r ->> 'key' = 'acme_sea_survival' AND r ->> 'name' = 'Acme sea survival' AND r ->> 'code' = 'ACME-SS'
                        AND r ->> 'expiry_item_type' = 'crew_qualification' AND (r ->> 'default_validity_months')::integer = 60 FROM rpc_out WHERE k = 'type_a'),
  'the type is the company''s: key from the name, code upper case, a qualification of its category');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.lives($q$SELECT public.crew_document_type_create('stcw_basic', 'Acme sea survival')$q$, 'another company may use the same name for its own type');
SELECT tests.reset_role();

-- Company satisfaction rules, and the engine follows them at once.
SELECT tests.as_user(tests.user_id('A.cadmin'));
INSERT INTO rpc_out VALUES ('rule_a', to_jsonb(public.crew_document_type_satisfies_save((SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'type_a'), md5('storm.crew_document_type.stcw_efa')::uuid, 'equivalent')));
SELECT tests.is(public.crew_document_type_satisfies_save((SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'type_a'), md5('storm.crew_document_type.stcw_efa')::uuid, 'supersedes'),
  (SELECT (r #>> '{}')::uuid FROM rpc_out WHERE k = 'rule_a'), 'saving the pair again changes its kind, same rule');
SELECT tests.throws_like($q$SELECT public.crew_document_type_satisfies_save(md5('storm.crew_document_type.stcw_basic_safety')::uuid, md5('storm.crew_document_type.stcw_pst')::uuid, 'equivalent')$q$,
  '22023', 'rule_exists', 'a pair STORM already has');
SELECT tests.throws_like($q$SELECT public.crew_document_type_satisfies_save(md5('storm.crew_document_type.stcw_basic_safety')::uuid, md5('storm.crew_document_type.stcw_pst')::uuid, NULL, true)$q$,
  '22023', 'system_rule_locked', 'STORM''s rules stay');
SELECT tests.throws_like(format($q$SELECT public.crew_document_type_satisfies_save(%L, md5('storm.crew_document_type.stcw_pst')::uuid, 'equivalent')$q$, tests.id('type:B.own')),
  '22023', 'document_type_unknown', 'another company''s type');
SELECT tests.throws_like($q$SELECT public.crew_document_type_satisfies_save(md5('storm.crew_document_type.stcw_pst')::uuid, md5('storm.crew_document_type.stcw_pst')::uuid, 'equivalent')$q$,
  '22023', 'rule_self', 'a type for itself');
SELECT tests.throws_like($q$SELECT public.crew_document_type_satisfies_save(md5('storm.crew_document_type.stcw_aff')::uuid, md5('storm.crew_document_type.stcw_pst')::uuid, 'related')$q$,
  '22023', 'kind_invalid', 'an unknown kind');
SELECT tests.reset_role();
SELECT pg_temp.doc('pending_acme', 'A.pending', 'stcw_pst', current_date + 300);
UPDATE public.crew_certificates SET document_type_id = (SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'type_a') WHERE id = tests.id('x16doc:pending_acme');
SELECT tests.as_user(tests.user_id('A.cadmin'));
SELECT tests.results_eq($q$SELECT state, satisfied_via FROM public.crew_vessel_requirement_status(tests.vessel_id('A.dra'), tests.profile_id('A.pending')) WHERE row_label = 'Elementary first aid'$q$,
  $q$VALUES ('met', 'supersedes')$q$, 'the company rule counts at once: the pending placement''s company course covers EFA');
SELECT tests.is(public.crew_document_type_satisfies_save((SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'type_a'), md5('storm.crew_document_type.stcw_efa')::uuid, NULL, true),
  (SELECT (r #>> '{}')::uuid FROM rpc_out WHERE k = 'rule_a'), 'removing the company rule returns its id');
SELECT tests.throws_like(format($q$SELECT public.crew_document_type_satisfies_save(%L, md5('storm.crew_document_type.stcw_efa')::uuid, NULL, true)$q$, (SELECT (r ->> 'id')::uuid FROM rpc_out WHERE k = 'type_a')),
  'P0002', 'rule_not_found', 'removing it again: P0002');
SELECT tests.results_eq($q$SELECT state FROM public.crew_vessel_requirement_status(tests.vessel_id('A.dra'), tests.profile_id('A.pending')) WHERE row_label = 'Elementary first aid'$q$,
  $q$VALUES ('missing')$q$, 'and the requirement is missing again');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.lives($q$SELECT public.crew_document_type_satisfies_save(md5('storm.crew_document_type.stcw_aff')::uuid, md5('storm.crew_document_type.stcw_pst')::uuid, 'equivalent')$q$,
  'B accepts a pair of STORM types for itself');
SELECT tests.as_user(tests.user_id('A.cadmin'));
SELECT tests.lives($q$SELECT public.crew_document_type_satisfies_save(md5('storm.crew_document_type.stcw_aff')::uuid, md5('storm.crew_document_type.stcw_pst')::uuid, 'equivalent')$q$,
  'and A the same pair for itself (one pair per scope)');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 7. the seed

SELECT tests.seed_vessel('A', 'A.sea', 'SEA DOG');
SELECT tests.seed_vessel('A', 'A.empty', 'EMPTY');
INSERT INTO public.position_manning (company_id, vessel_id, position_id, is_listed, min_on_board)
VALUES (tests.company_id('A'), tests.vessel_id('A.empty'), pg_temp.pos('deckhand'), true, 0);
INSERT INTO public.training_courses (id, course_name, course_code, course_category) VALUES
  (tests.id('course:bst'), 'STCW Basic Safety Training (VI/1)', 'BST', 'STCW'),
  (tests.id('course:eng1'), 'Medical fitness (flag)', 'ENG1', 'Flag_Required'),
  (tests.id('course:odd'), 'Underwater basket weaving', 'UBW', 'Other');
INSERT INTO public.training_matrix (vessel_id, rank, required_courses) VALUES
  (tests.vessel_id('A.sea'), 'Deckhand', jsonb_build_array(tests.id('course:bst'), tests.id('course:eng1'), tests.id('course:odd'), 'not-a-course')),
  (tests.vessel_id('A.sea'), 'Master', jsonb_build_array(upper(tests.id('course:bst')::text)));
SELECT tests.as_service();
INSERT INTO rpc_out VALUES ('seed1', public.crew_requirements_seed());
INSERT INTO rpc_out VALUES ('seed2', public.crew_requirements_seed());
SELECT tests.reset_role();
SELECT tests.ok((SELECT (r ->> 'vessels')::integer >= 3 AND (r ->> 'already_configured')::integer >= 2 AND (r ->> 'from_training_matrix')::integer >= 1 FROM rpc_out WHERE k = 'seed1'),
  format('the first run seeds the new vessels and marks the configured ones: %s', (SELECT r::text FROM rpc_out WHERE k = 'seed1')));
SELECT tests.is((SELECT r FROM rpc_out WHERE k = 'seed2'), '{"rows": 0, "cells": 0, "vessels": 0, "stcw_basic": 0, "already_configured": 0, "from_training_matrix": 0}'::jsonb,
  'a second run does nothing (seed idempotence)');
SELECT tests.results_eq($q$SELECT r.seed_key, r.group_key, r.label, (SELECT array_agg(p.position_id ORDER BY p.position_id) FROM public.crew_requirement_positions AS p WHERE p.row_id = r.id)
     FROM public.crew_requirement_rows AS r WHERE r.vessel_id = tests.vessel_id('A.sea') ORDER BY r.sort_order$q$,
  $q$VALUES ('training_matrix.eng1', 'medical', 'ENG1 seafarer medical certificate', ARRAY[md5('storm.position.deckhand')::uuid]),
            ('training_matrix.stcw_basic_safety', 'stcw_basic', 'Basic safety training (combined certificate)',
             (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[md5('storm.position.deckhand')::uuid, md5('storm.position.master')::uuid]) AS x))$q$,
  'SEA DOG from its training matrix: the legacy course maps to the combined certificate, the code ENG1 to ENG1, ranks to positions, the odd course and the bad id skipped');
SELECT tests.results_eq($q$SELECT seed_key, (SELECT count(*) FROM public.crew_requirement_positions AS p WHERE p.row_id = r.id) FROM public.crew_requirement_rows AS r
     WHERE r.vessel_id = tests.vessel_id('A.empty') ORDER BY r.sort_order$q$,
  $q$VALUES ('stcw_basic.pst', 1::bigint), ('stcw_basic.fpff', 1::bigint), ('stcw_basic.efa', 1::bigint), ('stcw_basic.pssr', 1::bigint)$q$,
  'EMPTY without a matrix: the STCW basic set for its listed position');
SELECT tests.ok((SELECT count(*) = 4 FROM public.crew_requirement_rows WHERE vessel_id = tests.vessel_id('A.hyd'))
                AND (SELECT requirements_seeded_at IS NOT NULL FROM public.vessel_crew_settings WHERE vessel_id = tests.vessel_id('A.hyd')),
  'HYDRA, already configured, is only marked');
SELECT tests.ok((SELECT bool_and(s.requirements_seeded_at IS NOT NULL) FROM public.vessels AS v LEFT JOIN public.vessel_crew_settings AS s ON s.vessel_id = v.id),
  'every vessel is marked');
DELETE FROM public.crew_requirement_rows WHERE vessel_id = tests.vessel_id('A.empty');
SELECT tests.as_service();
INSERT INTO rpc_out VALUES ('seed3', public.crew_requirements_seed());
SELECT tests.reset_role();
SELECT tests.ok((SELECT (r ->> 'vessels')::integer = 0 FROM rpc_out WHERE k = 'seed3') AND NOT EXISTS (SELECT 1 FROM public.crew_requirement_rows WHERE vessel_id = tests.vessel_id('A.empty')),
  'a configuration cleared after the seed stays cleared');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws($q$SELECT public.crew_requirements_seed()$q$, '42501', 'the seed is the service role''s');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 8. performance: 100 crew x 40 requirements

SELECT tests.seed_vessel('A', 'A.perf', 'PERF');
DO $$
DECLARE
  i integer;
  v_vessel uuid := tests.vessel_id('A.perf');
  v_types uuid[];
  v_row uuid;
  k integer;
BEGIN
  SELECT array_agg(t.id ORDER BY t.sort_order, t.key) INTO v_types
  FROM (SELECT * FROM public.crew_document_types WHERE company_id IS NULL ORDER BY key LIMIT 40) AS t;
  FOR i IN 1..100 LOOP
    PERFORM tests.seed_user('A', 'A.perf' || i, 'crew');
    PERFORM tests.seed_assignment('A.perf' || i, 'A.perf', true, 'Deckhand');
  END LOOP;
  FOR k IN 1..40 LOOP
    v_row := tests.id('perfrow:' || k);
    INSERT INTO public.crew_requirement_rows (id, vessel_id, group_key, label, sort_order) VALUES (v_row, v_vessel, 'custom', 'Requirement ' || k, k * 10);
    INSERT INTO public.crew_requirement_options (row_id, document_type_id) VALUES (v_row, v_types[k]);
    INSERT INTO public.crew_requirement_positions (row_id, position_id) VALUES (v_row, md5('storm.position.deckhand')::uuid);
  END LOOP;
  -- Each person holds ten documents of the requirement types.
  INSERT INTO public.crew_certificates (user_id, profile_id, certificate_type, certificate_name, expiry_date, document_type_id, verification_status, file_path, status)
  SELECT p.user_id, p.id, 'Perf', 'Perf', current_date + 10 * ((gi.n + gk.n) % 60), v_types[1 + ((gi.n * 7 + gk.n * 3) % 40)], 'verified', 'perf/scan.pdf', 'Valid'
  FROM generate_series(1, 100) AS gi(n)
  CROSS JOIN generate_series(1, 10) AS gk(n)
  JOIN public.profiles AS p ON p.id = tests.profile_id('A.perf' || gi.n);
END
$$;
CREATE TEMP TABLE perf (label text PRIMARY KEY, ms numeric, n bigint) ON COMMIT DROP;
GRANT ALL ON perf TO authenticated;
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
DO $$
DECLARE
  t0 timestamptz;
  v_n bigint;
BEGIN
  PERFORM count(*) FROM public.crew_vessel_compliance(tests.vessel_id('A.perf'));  -- warm the plans
  t0 := clock_timestamp();
  SELECT count(*) INTO v_n FROM public.crew_vessel_compliance(tests.vessel_id('A.perf'));
  INSERT INTO perf VALUES ('summary', extract(epoch FROM clock_timestamp() - t0) * 1000, v_n);
  t0 := clock_timestamp();
  SELECT count(*) INTO v_n FROM public.crew_vessel_requirement_status(tests.vessel_id('A.perf'));
  INSERT INTO perf VALUES ('status', extract(epoch FROM clock_timestamp() - t0) * 1000, v_n);
  t0 := clock_timestamp();
  SELECT count(*) INTO v_n FROM public.crew_compliance_summary WHERE vessel_id = tests.vessel_id('A.perf');
  INSERT INTO perf VALUES ('view', extract(epoch FROM clock_timestamp() - t0) * 1000, v_n);
END
$$;
SELECT tests.reset_role();
SELECT tests.is((SELECT n FROM perf WHERE label = 'summary'), 100::bigint, 'performance: the summary has the 100 crew');
SELECT tests.is((SELECT n FROM perf WHERE label = 'status'), 4000::bigint, 'performance: 100 crew x 40 requirements = 4000 status rows');
SELECT tests.ok((SELECT ms FROM perf WHERE label = 'summary') < 500, format('performance: the vessel summary reads in %s ms (< 500)', (SELECT round(ms) FROM perf WHERE label = 'summary')));
SELECT tests.ok((SELECT ms FROM perf WHERE label = 'status') < 500, format('performance: the status rows read in %s ms (< 500)', (SELECT round(ms) FROM perf WHERE label = 'status')));
SELECT tests.ok((SELECT ms FROM perf WHERE label = 'view') < 1500, format('performance: the summary view over the fleet manager''s vessels reads in %s ms', (SELECT round(ms) FROM perf WHERE label = 'view')));

-- ------------------------------------------------------------ 9. grants

SELECT tests.is_empty($q$
  SELECT p.oid::regprocedure::text FROM pg_proc AS p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('crew_vessel_compliance', 'crew_vessel_requirement_status', 'crew_compliance_for_vessels', 'crew_requirements_config',
                      'crew_requirement_row_save', 'crew_requirement_row_delete', 'crew_requirement_cell_set', 'crew_requirement_row_bulk',
                      'crew_requirements_add_stcw_basic', 'crew_vessel_set_passenger', 'crew_vessel_settings_save', 'crew_document_type_create',
                      'crew_document_type_satisfies_save', 'crew_requirement_status_rows', 'crew_compliance_summary_rows')
    AND (NOT has_function_privilege('authenticated', p.oid, 'EXECUTE') OR has_function_privilege('anon', p.oid, 'EXECUTE')
         OR NOT p.prosecdef OR NOT coalesce(p.proconfig, '{}') @> ARRAY['search_path=public'])$q$,
  'the browser RPCs: authenticated may execute, anon not; definers with a search path');
SELECT tests.is_empty($q$
  SELECT p.oid::regprocedure::text FROM pg_proc AS p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('crew_requirement_tab', 'crew_requirement_group_for_category', 'crew_compliance_status_decide', 'crew_compliance_dot',
                      'crew_requirement_row_satisfiers', 'crew_requirement_status_for', 'crew_compliance_summary_for', 'crew_requirement_held_by',
                      'crew_requirement_set_add', 'crew_requirement_admin_gate', 'crew_compliance_company_gate', 'crew_requirements_seed',
                      'crew_requirement_rows_scope_guard', 'crew_requirement_options_scope_guard', 'crew_requirement_positions_scope_guard')
    AND (has_function_privilege('authenticated', p.oid, 'EXECUTE') OR has_function_privilege('anon', p.oid, 'EXECUTE'))$q$,
  'the internal functions and triggers: neither authenticated nor anon');
SELECT tests.is_empty($q$
  SELECT r FROM unnest(ARRAY['public.crew_requirement_rows', 'public.crew_requirement_options', 'public.crew_requirement_positions',
                             'public.crew_requirement_status', 'public.crew_compliance_summary', 'public.crew_requirement_status_internal',
                             'public.crew_compliance_summary_internal']) AS r
  WHERE has_table_privilege('anon', r, 'SELECT') OR has_table_privilege('anon', r, 'INSERT')
     OR has_table_privilege('authenticated', r, 'INSERT') OR has_table_privilege('authenticated', r, 'UPDATE') OR has_table_privilege('authenticated', r, 'DELETE')$q$,
  'no table or view grants anon anything, nor authenticated a write');
SELECT tests.ok((SELECT bool_and(c.reloptions @> ARRAY['security_invoker=true']) FROM pg_class AS c
                 WHERE c.oid IN ('public.crew_requirement_status'::regclass, 'public.crew_compliance_summary'::regclass)),
  'the public views are security invoker');
