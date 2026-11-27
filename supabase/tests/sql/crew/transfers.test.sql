-- The controlled transfer and the employment functions (X1-11,
-- 20261124061100_crew_transfers_employment.sql; gap/04 C58, C57, C59, W8,
-- W9; DECISIONS D-207, D-198, D-225, D-246, D-X1-12):
--   1. parity: crew_transfer_next equals nextTransferStatus
--      (src/modules/crew/lib/transfer.ts, through load-ts) for every
--      status, action and fact;
--   2. crew_contracts: the probation and notice columns and their CHECKs;
--   3. the wizard's options (destinations, blocked reasons);
--   4. start refusals: assign on one vessel only, a cross-tenant
--      destination, a pending placement, a person outside the actor's
--      reach (admin_may_act_on_user), an administrator target, a Master
--      without users-access admin of both vessels, dates, positions,
--      inactive, external, another tenant; restart and transfer_open;
--   5. review (gaps, familiarisation on joining, medical flags without
--      clinical text, the appraisal, HoR, open forms), acknowledgements and
--      submit; the engine-only guard;
--   6. completion: origin ended, destination written, terms,
--      familiarisation opened, planner periods moved, movements, notices;
--   7. completion is atomic: a guard refusal on the destination row leaves
--      both assignments, terms and movements untouched;
--   8. fleet approval: pending approval, four eyes, decline with a reason,
--      cancel; the Master transfer by a users-access admin of both vessels;
--   9. reads: detail and a person's transfers (who may, who may not);
--  10. the daily sweep (completion on the sign-on date, the compliance
--      stamp, refused under a JWT);
--  11. end of employment: effects and gates;
--  12. the vessel's employment history and the re-hire prefill: gates;
--  12b. the re-hire save (D-374, D-375): after an ended employment one
--      current assignment, terms linked to it, one draft contract and one
--      On board period; refusals (on another crew now, another company,
--      D-207 out of reach, a Master position without users-access admin,
--      an open transfer, no login, a taken start date, the terms rules,
--      no create/assign, external, inactive, another tenant, anon), each
--      atomic;
--  13. emitters (the three types live in crew/module.ts) and grants.

\set parity `node --input-type=module -e "const lt0=await import('./scripts/db/lib/load-ts.mjs'); const f='src/modules/crew/lib/transfer.ts'; const r=await lt0.loadTs([f]); const T=r.modules[f]; const out=[]; for (const s of [...T.TRANSFER_STATUSES, null, 'bogus']) for (const a of [...T.TRANSFER_ACTIONS, 'bogus']) for (const ra of [true,false,null]) for (const ack of [true,false,null]) for (const due of [true,false,null]) out.push([s,a,ra,ack,due,T.nextTransferStatus(s,a,ra,ack,due)]); process.stdout.write(JSON.stringify(out));"`
CREATE TEMP TABLE px ON COMMIT DROP AS SELECT :'parity'::jsonb AS j;
GRANT SELECT ON px TO PUBLIC;

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ world (company A)

SELECT tests.seed_role('x111_assign', 'vessel');
SELECT tests.seed_role('x111_view', 'vessel');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, x.k, x.p::public.permission_level, 'vessel'
FROM (VALUES ('x111_assign', 'crew_roster', 'edit'), ('x111_view', 'crew_roster', 'view')) AS x(r, k, p)
JOIN public.roles AS r ON r.name = x.r;

CREATE OR REPLACE FUNCTION pg_temp.crew(p_key text, p_vessel text, p_position text, p_role public.user_role DEFAULT 'crew')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM tests.seed_user('A', p_key, p_role);
  PERFORM tests.seed_assignment(p_key, p_vessel, true, p_position);
END;
$$;
CREATE OR REPLACE FUNCTION pg_temp.pos(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT md5('storm.position.' || p_key)::uuid $$;
CREATE OR REPLACE FUNCTION pg_temp.ty(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT md5('storm.crew_document_type.' || p_key)::uuid $$;

-- The officer: assigns crew on DRAAK and GAME CHANGER (a current assignment on each gives reach).
SELECT pg_temp.crew('A.x111_officer', 'A.dra', 'Chief Officer');
SELECT tests.seed_assignment('A.x111_officer', 'A.gam', true, 'Chief Officer');
SELECT tests.seed_rbac_role('A.x111_officer', 'x111_assign', 'A.dra');
SELECT tests.seed_rbac_role('A.x111_officer', 'x111_assign', 'A.gam');
-- Assigns on DRAAK only.
SELECT pg_temp.crew('A.x111_draonly', 'A.dra', 'Second Officer');
SELECT tests.seed_rbac_role('A.x111_draonly', 'x111_assign', 'A.dra');
-- Reads assignments on DRAAK.
SELECT pg_temp.crew('A.x111_viewer', 'A.dra', 'Bosun');
SELECT tests.seed_rbac_role('A.x111_viewer', 'x111_view', 'A.dra');
-- An external viewer holding the assign role on both.
SELECT pg_temp.crew('A.x111_ext', 'A.dra', 'Deckhand');
SELECT tests.seed_assignment('A.x111_ext', 'A.gam', true, 'Deckhand');
SELECT tests.seed_rbac_role('A.x111_ext', 'x111_assign', 'A.dra');
SELECT tests.seed_rbac_role('A.x111_ext', 'x111_assign', 'A.gam');
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'external', vessel_scope = 'assigned', fleet_access = false, source = 'admin',
    valid_from = now() - interval '1 day', valid_until = now() + interval '7 days'
WHERE user_id = tests.user_id('A.x111_ext');
-- The fleet approver (shore management: fleet reach, every crew key).
SELECT tests.seed_user('A', 'A.x111_shore', 'shore_management');
-- Fleet reach, but the assign / approve role bound to DRAAK only (vessel scope): no fleet approver (D-376).
SELECT tests.seed_user('A', 'A.x111_vapprover', 'crew');
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'shore', vessel_scope = 'all', fleet_access = true, source = 'admin'
WHERE user_id = tests.user_id('A.x111_vapprover');
SELECT tests.seed_rbac_role('A.x111_vapprover', 'x111_assign', 'A.dra');
-- The subjects.
SELECT pg_temp.crew('A.x111_deck', 'A.dra', 'Deckhand');
SELECT pg_temp.crew('A.x111_ab', 'A.dra', 'AB Seaman');
SELECT pg_temp.crew('A.x111_ab2', 'A.dra', 'AB Seaman');
SELECT pg_temp.crew('A.x111_stew', 'A.dra', 'Deckhand');
SELECT pg_temp.crew('A.x111_end', 'A.dra', 'Deckhand');
SELECT pg_temp.crew('A.x111_double', 'A.dra', 'Deckhand');
SELECT tests.seed_assignment('A.x111_double', 'A.hyd', true, 'Deckhand');
SELECT pg_temp.crew('A.x111_admintgt', 'A.dra', 'Deckhand');
INSERT INTO public.user_permission_overrides (user_id, module_key, permission, is_granted, reason, created_by)
VALUES (tests.user_id('A.x111_admintgt'), 'settings', 'admin', true, 'Settings administrator', tests.user_id('A.fleet_manager'));
SELECT tests.seed_profile('A', 'A.x111_ghost', 'crew', 'not_invited', NULL,
                          jsonb_build_object('is_imported', true, 'imported_vessel_id', tests.vessel_id('A.dra'), 'position', 'Deckhand'));
-- GAME CHANGER: a company position for the atomicity case, a document requirement and a familiarisation for AB Seamen.
INSERT INTO public.positions (id, company_id, vessel_id, key, name, department_key, rank_tier, sort_order)
VALUES (tests.id('pos:lead_hand'), tests.company_id('A'), tests.vessel_id('A.gam'), 'lead_hand', 'Lead Hand', 'deck', 'rating', 40299);
INSERT INTO public.crew_requirement_rows (id, company_id, vessel_id, group_key, label, kind, sort_order, seed_key)
VALUES (tests.id('req:gam_ab'), tests.company_id('A'), tests.vessel_id('A.gam'), 'stcw_basic', 'Personal survival techniques', 'document', 1, NULL);
INSERT INTO public.crew_requirement_options (company_id, row_id, document_type_id, sort_order)
SELECT tests.company_id('A'), tests.id('req:gam_ab'), t.id, 1 FROM public.crew_document_types AS t WHERE t.company_id IS NULL ORDER BY t.key LIMIT 1;
INSERT INTO public.crew_requirement_positions (company_id, vessel_id, row_id, position_id)
VALUES (tests.company_id('A'), tests.vessel_id('A.gam'), tests.id('req:gam_ab'), pg_temp.pos('ab_seaman'));
INSERT INTO public.familiarization_templates (id, company_id, vessel_id, template_name, sections)
VALUES (tests.id('tpl:gam_deck'), tests.company_id('A'), tests.vessel_id('A.gam'), 'GAME CHANGER deck induction', '[{"section_name":"Deck","checklist_items":["Muster","Tender"]}]');
INSERT INTO public.familiarization_template_positions (company_id, template_id, position_id, vessel_id)
VALUES (tests.company_id('A'), tests.id('tpl:gam_deck'), pg_temp.pos('ab_seaman'), NULL);
-- HYDRA asks for fleet approval.
INSERT INTO public.vessel_crew_settings (vessel_id, company_id, transfer_requires_fleet_approval)
VALUES (tests.vessel_id('A.hyd'), tests.company_id('A'), true)
ON CONFLICT (vessel_id) DO UPDATE SET transfer_requires_fleet_approval = true;
-- The deckhand's record: an open medical follow-up (with clinical text that must never surface) and planner periods.
INSERT INTO public.hw_people (company_id, profile_id, first_name, last_name, person_type)
VALUES (tests.company_id('A'), tests.profile_id('A.x111_deck'), 'Deckhand', 'A.x111_deck', 'crew')
ON CONFLICT DO NOTHING;
INSERT INTO public.med_consultations (company_id, person_id, consultation_number, outcome, assessment, presenting_complaint)
SELECT tests.company_id('A'), hp.id, 'MC-X111-1', 'monitoring', 'CLINICAL-SECRET-ASSESSMENT', 'CLINICAL-SECRET-COMPLAINT'
FROM public.hw_people AS hp WHERE hp.profile_id = tests.profile_id('A.x111_deck');
INSERT INTO public.frp_rotation_assignments (id, company_id, vessel_id, crew_user_id, profile_id, start_date, end_date, status, rotation_type)
VALUES (tests.id('frp:deck_before'), tests.company_id('A'), tests.vessel_id('A.dra'), tests.user_id('A.x111_deck'), tests.profile_id('A.x111_deck'),
        current_date - 20, current_date - 10, 'confirmed', 'onboard'),
       (tests.id('frp:deck_after'), tests.company_id('A'), tests.vessel_id('A.dra'), tests.user_id('A.x111_deck'), tests.profile_id('A.x111_deck'),
        current_date + 20, current_date + 30, 'confirmed', 'leave');
-- The employment terms on DRAAK (the transfer carries the allowance over).
INSERT INTO public.crew_assignment_terms (company_id, profile_id, vessel_id, position_id, department_key, start_date, contract_type_key, leave_method, leave_days_per_year)
VALUES (tests.company_id('A'), tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra'), pg_temp.pos('deckhand'), 'deck', current_date - 30, 'rotational', 'days_per_year', 30);

CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT ALL ON ids TO PUBLIC;
-- Answers of the writing RPCs, kept once (results_eq runs its query more than once).
CREATE TEMP TABLE outj (k text PRIMARY KEY, j jsonb) ON COMMIT DROP;
GRANT ALL ON outj TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.put(p_k text, p_j jsonb) RETURNS jsonb LANGUAGE sql AS $$
  INSERT INTO outj VALUES (p_k, p_j) ON CONFLICT (k) DO UPDATE SET j = EXCLUDED.j RETURNING p_j
$$;
CREATE OR REPLACE FUNCTION pg_temp.got(p_k text) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT j FROM outj WHERE k = p_k $$;
CREATE OR REPLACE FUNCTION pg_temp.tid(p_k text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM ids WHERE k = p_k $$;
CREATE OR REPLACE FUNCTION pg_temp.keep(p_k text, p_json jsonb) RETURNS jsonb LANGUAGE sql AS $$
  INSERT INTO ids VALUES (p_k, (p_json ->> 'id')::uuid) ON CONFLICT (k) DO UPDATE SET id = EXCLUDED.id RETURNING p_json
$$;
-- Ticks every item of a transfer's review.
CREATE OR REPLACE FUNCTION pg_temp.all_ticks(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('key', i ->> 'key', 'acknowledged', true)), '[]'::jsonb)
  FROM public.crew_transfers AS t, jsonb_array_elements(t.gaps_snapshot -> 'items') AS i WHERE t.id = p_id
$$;

-- Setup checks (so each refusal below is the one it claims to be).
SELECT tests.ok(public.has_capability_for(tests.user_id('A.x111_officer'), 'vessel.crew.crew_assignments.assign', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.has_capability_for(tests.user_id('A.x111_officer'), 'vessel.crew.crew_assignments.assign', tests.company_id('A'), tests.vessel_id('A.gam'))
                AND NOT public.has_capability_for(tests.user_id('A.x111_officer'), 'vessel.crew.crew_assignments.assign', tests.company_id('A'), tests.vessel_id('A.hyd'))
                AND NOT coalesce(public.has_capability_for(tests.user_id('A.x111_officer'), 'admin.access.users_access.admin', tests.company_id('A'), tests.vessel_id('A.dra')), false),
  'setup: the officer assigns on DRAAK and GAME CHANGER, not HYDRA, and is no users-access admin');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.x111_draonly'), 'vessel.crew.crew_assignments.assign', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.x111_draonly'), 'vessel.crew.crew_assignments.assign', tests.company_id('A'), tests.vessel_id('A.gam')),
  'setup: the DRAAK-only officer assigns on DRAAK only');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.fleet_manager'), 'admin.access.users_access.admin', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.has_capability_for(tests.user_id('A.fleet_manager'), 'admin.access.users_access.admin', tests.company_id('A'), tests.vessel_id('A.gam'))
                AND public.has_capability_for(tests.user_id('A.fleet_manager'), 'vessel.crew.crew_assignments.assign', tests.company_id('A'), tests.vessel_id('A.hyd')),
  'setup: the fleet manager administers users and assigns crew on every vessel');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.x111_shore'), 'vessel.crew.crew_assignments.approve', tests.company_id('A'), NULL)
                AND public.fleet_reach_for(tests.user_id('A.x111_shore'), tests.company_id('A')),
  'setup: shore management approves crew assignments with fleet reach');
SELECT tests.ok(public.user_is_admin_target(tests.user_id('A.x111_admintgt'), tests.company_id('A'))
                AND public.admin_may_act_on_user(tests.user_id('A.x111_officer'), tests.user_id('A.x111_admintgt'), tests.company_id('A'), NULL)
                AND NOT public.user_manages_admins_for(tests.user_id('A.x111_officer'), tests.company_id('A')),
  'setup: the administrator target is within the officer''s reach, and the officer manages no administrators');
SELECT tests.ok(NOT public.admin_may_act_on_user(tests.user_id('A.x111_officer'), tests.user_id('A.x111_double'), tests.company_id('A'), NULL),
  'setup: the officer may not act on a person who is also on HYDRA');
SELECT tests.ok(coalesce(public.work_rest_is_fleet_hr(tests.user_id('A.fleet_manager'), tests.company_id('A')), false),
  'setup: the fleet manager is fleet HR (the notices'' must-act list)');

-- ------------------------------------------------------------ 1. parity with the TS rule

SELECT tests.is(
  (SELECT count(*) FROM jsonb_array_elements((SELECT j FROM px)) AS c
   WHERE public.crew_transfer_next(c ->> 0, c ->> 1, (c ->> 2)::boolean, (c ->> 3)::boolean, (c ->> 4)::boolean) IS DISTINCT FROM c ->> 5),
  0::bigint, 'crew_transfer_next equals nextTransferStatus on every status, action and fact');
SELECT tests.ok((SELECT jsonb_array_length(j) FROM px) = 8 * 8 * 27, 'parity: 1,728 cases (8 statuses x 8 actions x 27 fact sets)');
SELECT tests.results_eq(
  $q$SELECT public.crew_transfer_next('review', 'submit', true, true, NULL), public.crew_transfer_next('review', 'submit', false, true, NULL),
            public.crew_transfer_next('review', 'submit', false, false, NULL), public.crew_transfer_next('scheduled', 'complete', false, true, false),
            public.crew_transfer_next('completed', 'cancel', false, true, true), public.crew_transfer_next('pending_approval', 'decline', true, true, true)$q$,
  $q$VALUES ('pending_approval', 'scheduled', 'acknowledgements_missing', 'transfer_not_due', 'illegal_transition', 'cancelled')$q$,
  'the step rule: approval routes, ticks, the sign-off date, no cancel after completion, a decline cancels');

-- ------------------------------------------------------------ 2. crew_contracts columns

SELECT tests.ok((SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'crew_contracts'
                 AND column_name IN ('probation_months', 'notice_during_probation_days', 'notice_after_probation_days')) = 3,
  'crew_contracts has the probation length and the two notice periods');
SELECT tests.throws(format($q$INSERT INTO public.crew_contracts (company_id, profile_id, start_date, probation_months) VALUES (%L, %L, current_date, 25)$q$,
                           tests.company_id('A'), tests.profile_id('A.x111_end')), '23514', 'probation is at most 24 months');
SELECT tests.throws(format($q$INSERT INTO public.crew_contracts (company_id, profile_id, start_date, notice_after_probation_days) VALUES (%L, %L, current_date, 400)$q$,
                           tests.company_id('A'), tests.profile_id('A.x111_end')), '23514', 'a notice period is at most 365 days');
SELECT tests.ok((SELECT bool_and(c.convalidated) FROM pg_constraint AS c WHERE c.conrelid = 'public.crew_contracts'::regclass
                 AND c.conname IN ('crew_contracts_probation_months_check', 'crew_contracts_notice_during_probation_days_check', 'crew_contracts_notice_after_probation_days_check')),
  'the three CHECKs are named and validated');

-- ------------------------------------------------------------ 3. the wizard's options

SELECT tests.as_user(tests.user_id('A.x111_officer'));
SELECT tests.results_eq(
  format($q$SELECT d ->> 'name', (d ->> 'requires_approval')::boolean, (d ->> 'same_position_id')::uuid = %L, jsonb_array_length(d -> 'positions') > 50
            FROM jsonb_array_elements(public.transfer_crew_options(%L, %L) -> 'destinations') AS d$q$,
         pg_temp.pos('deckhand'), tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra')),
  $q$VALUES ('GAME CHANGER', false, true, true)$q$,
  'options: the only destination is the other vessel the officer assigns on, with the same position and the catalogue');
SELECT tests.ok((public.transfer_crew_options(tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra')) -> 'blocked') = 'null'::jsonb
                AND (public.transfer_crew_options(tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra')) #>> '{from,position_id}')::uuid = pg_temp.pos('deckhand'),
  'options: the deckhand can be transferred; the origin position is resolved');
SELECT tests.is(public.transfer_crew_options(tests.profile_id('A.x111_ghost'), tests.vessel_id('A.dra')) #>> '{blocked,code}', 'pending_placement_not_transferable',
  'options: a pending placement is blocked (D-225)');
SELECT tests.is(public.transfer_crew_options(tests.profile_id('A.x111_double'), tests.vessel_id('A.dra')) #>> '{blocked,code}', 'out_of_reach',
  'options: a person also on a vessel the officer does not reach is blocked (D-207)');
SELECT tests.throws(format($q$SELECT public.transfer_crew_options(%L, %L)$q$, tests.profile_id('B.admin'), tests.vessel_id('A.dra')), 'P0002',
  'options: a person of another company is unknown');
SELECT tests.as_user(tests.user_id('A.x111_viewer'));
SELECT tests.throws(format($q$SELECT public.transfer_crew_options(%L, %L)$q$, tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra')), '42501',
  'options: a viewer may not transfer');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.ok((SELECT (d ->> 'requires_approval')::boolean FROM jsonb_array_elements(public.transfer_crew_options(tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra')) -> 'destinations') AS d
                 WHERE d ->> 'name' = 'HYDRA'),
  'options: HYDRA asks for fleet approval (D-X1-12)');

-- ------------------------------------------------------------ 4. start refusals, restart

SELECT tests.as_user(tests.user_id('A.x111_draonly'));
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_start(%L, %L, %L, NULL, current_date, current_date + 1)$q$,
                                tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam')), '42501', 'crew_not_permitted',
  'assign on the origin only: refused for the destination');
SELECT tests.as_user(tests.user_id('A.x111_officer'));
SELECT tests.throws(format($q$SELECT public.transfer_crew_start(%L, %L, %L, NULL, current_date, current_date + 1)$q$,
                           tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra'), tests.vessel_id('B.lev')), '42501',
  'a destination of another tenant is refused');
SELECT tests.throws(format($q$SELECT public.transfer_crew_start(%L, %L, %L, NULL, current_date, current_date + 1)$q$,
                           tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra'), gen_random_uuid()), 'P0002',
  'an unknown destination is unknown');
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_start(%L, %L, %L, NULL, current_date, current_date + 1)$q$,
                                tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra'), tests.vessel_id('A.dra')), '22023', 'same_vessel',
  'the same vessel twice is refused');
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_start(%L, %L, %L, NULL, current_date, current_date + 1)$q$,
                                tests.profile_id('A.x111_ghost'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam')), '22023', 'pending_placement_not_transferable',
  'a pending placement is refused (D-225, until PR-X1-M)');
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_start(%L, %L, %L, NULL, current_date, current_date + 1)$q$,
                                tests.profile_id('A.x111_double'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam')), '42501', 'out_of_reach',
  'a person outside the officer''s reach is refused (admin_may_act_on_user, D-207)');
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_start(%L, %L, %L, NULL, current_date, current_date + 1)$q$,
                                tests.profile_id('A.x111_admintgt'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam')), '42501', 'manages_admins_required',
  'an administrator target needs a manager of administrators (D-207)');
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_start(%L, %L, %L, NULL, current_date, current_date + 1)$q$,
                                tests.profile_id('A.master_dra'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam')), '42501', 'master_transfer_refused',
  'a Master transfer needs users-access admin of both vessels (D-198)');
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_start(%L, %L, %L, %L, current_date, current_date + 1)$q$,
                                tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam'), pg_temp.pos('master')), '42501', 'master_transfer_refused',
  'so does making someone Master on the destination');
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_start(%L, %L, %L, NULL, current_date, current_date + 1)$q$,
                                tests.profile_id('A.x111_officer'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam')), '42501', 'self_transfer_refused',
  'moving yourself needs users-access admin');
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_start(%L, %L, %L, NULL, current_date, current_date - 1)$q$,
                                tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam')), '22023', 'dates_invalid',
  'the sign-on date cannot be before the sign-off date');
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_start(%L, %L, %L, NULL, current_date, current_date + 91)$q$,
                                tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam')), '22023', 'gap_too_long',
  'sign on within 90 days');
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_start(%L, %L, %L, NULL, current_date - 32, current_date)$q$,
                                tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam')), '22023', 'sign_off_too_early',
  'a sign-off more than 31 days ago is refused');
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_start(%L, %L, %L, NULL, current_date + 366, current_date + 370)$q$,
                                tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam')), '22023', 'sign_off_too_late',
  'a sign-off more than a year ahead is refused');
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_start(%L, %L, %L, %L, current_date, current_date + 1)$q$,
                                tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam'), gen_random_uuid()), '22023', 'position_unknown',
  'a position the destination cannot see is refused');
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_start(%L, %L, %L, NULL, NULL, current_date + 1)$q$,
                                tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam')), '22023', 'date_required',
  'the dates are required');
SELECT tests.as_user(tests.user_id('A.x111_ext'));
SELECT tests.throws(format($q$SELECT public.transfer_crew_start(%L, %L, %L, NULL, current_date, current_date + 1)$q$,
                           tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam')), '42501', 'an external viewer may not transfer');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws(format($q$SELECT public.transfer_crew_start(%L, %L, %L, NULL, current_date, current_date + 1)$q$,
                           tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam')), '42501', 'an inactive user may not transfer');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws(format($q$SELECT public.transfer_crew_start(%L, %L, %L, NULL, current_date, current_date + 1)$q$,
                           tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam')), '42501', 'another tenant may not transfer');
SELECT tests.as_anon();
SELECT tests.throws(format($q$SELECT public.transfer_crew_start(%L, %L, %L, NULL, current_date, current_date + 1)$q$,
                           tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam')), '42501', 'anon may not call it');

-- Start the deckhand's transfer to GAME CHANGER as AB Seaman, then restart it with other dates.
SELECT tests.as_user(tests.user_id('A.x111_officer'));
SELECT tests.is(pg_temp.keep('deck', public.transfer_crew_start(tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam'),
                                                              pg_temp.pos('ab_seaman'), current_date + 1, current_date + 3, 'Crew change')) ->> 'status', 'draft',
  'start: a draft');
SELECT pg_temp.put('restart', public.transfer_crew_start(tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam'),
                                                       pg_temp.pos('ab_seaman'), current_date, current_date + 2, 'Crew change'));
SELECT tests.results_eq(
  $q$SELECT j ->> 'status', (j ->> 'same_role')::boolean, (j #>> '{to_position,name}'), (j #>> '{rights,can_edit}')::boolean, (j ->> 'sign_off_date')::date - current_date
     FROM (SELECT pg_temp.got('restart') AS j) AS x$q$,
  $q$VALUES ('draft', false, 'AB Seaman', true, 0)$q$,
  'start again: the officer''s own draft is restarted with the new details (a new role)');
SELECT tests.is((SELECT count(*) FROM public.crew_transfers WHERE profile_id = tests.profile_id('A.x111_deck'))::integer, 1, 'one transfer row, not two');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_start(%L, %L, %L, NULL, current_date, current_date + 1)$q$,
                                tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')), '22023', 'transfer_open',
  'somebody else''s open transfer of the person blocks a second one');

-- ------------------------------------------------------------ 5. review, ticks, submit, the guard

SELECT tests.as_user(tests.user_id('A.x111_officer'));
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_submit(%L)$q$, pg_temp.tid('deck')), '22023', 'illegal_transition', 'a draft is not submitted');
SELECT tests.is(public.transfer_crew_review(pg_temp.tid('deck')) ->> 'status', 'review', 'review: Draft -> Review');
SELECT tests.ok((SELECT jsonb_agg(i ->> 'key' ORDER BY i ->> 'key') FROM public.crew_transfers AS t, jsonb_array_elements(t.gaps_snapshot -> 'items') AS i WHERE t.id = pg_temp.tid('deck'))
                @> jsonb_build_array('requirement:' || tests.id('req:gam_ab'), 'familiarisation_required', 'medical:follow_up', 'appraisal:last'),
  'review: the missing destination requirement, the familiarisation opening on joining, the medical follow-up and the appraisal');
SELECT tests.is((SELECT i ->> 'severity' FROM public.crew_transfers AS t, jsonb_array_elements(t.gaps_snapshot -> 'items') AS i
                 WHERE t.id = pg_temp.tid('deck') AND i ->> 'key' = 'requirement:' || tests.id('req:gam_ab')), 'danger', 'a missing requirement is a danger item');
SELECT tests.ok((SELECT position('CLINICAL-SECRET' IN t.gaps_snapshot::text) = 0 FROM public.crew_transfers AS t WHERE t.id = pg_temp.tid('deck')),
  'review: medical flags carry no clinical text');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM public.crew_transfers AS t, jsonb_array_elements(t.gaps_snapshot -> 'items') AS i
                            WHERE t.id = pg_temp.tid('deck') AND i ->> 'key' = 'rest_gap'),
  'review: two days between the vessels is no rest-gap item');
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_submit(%L)$q$, pg_temp.tid('deck')), '22023', 'acknowledgements_missing', 'submit needs every tick');
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_acknowledge(%L, '[{"key": "nope", "acknowledged": true}]')$q$, pg_temp.tid('deck')), '22023', 'item_unknown',
  'an unknown item is refused');
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_acknowledge(%L, '[{"key": "appraisal:last", "acknowledged": false}]')$q$, pg_temp.tid('deck')), '22023', 'tick_required',
  'an item needs its tick');
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_acknowledge(%L, %L)$q$, pg_temp.tid('deck'),
                                jsonb_build_array(jsonb_build_object('key', 'appraisal:last', 'acknowledged', true, 'note', repeat('x', 501)))), '22023', 'note_too_long',
  'a note is at most 500 characters');
SELECT tests.is((public.transfer_crew_acknowledge(pg_temp.tid('deck'), '[{"key": "appraisal:last", "acknowledged": true, "note": "Shared with the bosun"}]') ->> 'acknowledged')::boolean,
  false, 'one tick: not all acknowledged yet');
-- A second review keeps the tick of an unchanged item.
SELECT tests.ok((SELECT jsonb_array_length(public.transfer_crew_review(pg_temp.tid('deck')) -> 'acknowledgements')) = 1, 'review again: the unchanged item keeps its tick');
SELECT tests.is((public.transfer_crew_acknowledge(pg_temp.tid('deck'), pg_temp.all_ticks(pg_temp.tid('deck'))) -> 'rights' ->> 'can_submit')::boolean, true,
  'every item ticked: submit is offered');
SELECT pg_temp.put('deck_submit', public.transfer_crew_submit(pg_temp.tid('deck')));
SELECT tests.results_eq(
  $q$SELECT j ->> 'status', (j ->> 'requires_approval')::boolean, (j #>> '{rights,can_complete}')::boolean FROM (SELECT pg_temp.got('deck_submit') AS j) AS x$q$,
  $q$VALUES ('scheduled', false, true)$q$,
  'submit: no fleet approval on DRAAK or GAME CHANGER, so Scheduled, and completion is due from today');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT count(*)::integer, bool_and(o.link_path = %L), bool_and(o.audience = ARRAY['dpa']), bool_and(%L = ANY (o.must_act_user_ids))
            FROM public.notification_outbox AS o WHERE o.type_key = 'crew_transfer_submitted' AND o.payload ->> 'transfer_id' = %L$q$,
         format('crew/people/%s/personal?transfer=%s', tests.profile_id('A.x111_deck'), pg_temp.tid('deck')), tests.user_id('A.fleet_manager'), pg_temp.tid('deck')),
  $q$VALUES (1, true, true, true)$q$,
  'crew_transfer_submitted reaches fleet HR (must act) and the DPA, linked to the profile with the transfer');
-- The guard: no browser write moves a transfer.
SELECT set_config('storm.crew_engine', 'off', true);
SELECT tests.as_user(tests.user_id('A.x111_officer'));
SELECT tests.denied(format($q$UPDATE public.crew_transfers SET status = 'completed' WHERE id = %L RETURNING id$q$, pg_temp.tid('deck')),
  'the browser cannot write a transfer (no write grant)');
SELECT tests.reset_role();
SELECT set_config('request.jwt.claims', json_build_object('sub', tests.user_id('A.x111_officer'), 'role', 'authenticated')::text, true);
SELECT tests.throws_like(format($q$UPDATE public.crew_transfers SET status = 'completed' WHERE id = %L$q$, pg_temp.tid('deck')), '42501', 'crew_transfer_engine_only',
  'a signed-in write outside the engine is refused by the guard');
SELECT set_config('request.jwt.claims', '', true);

-- ------------------------------------------------------------ 6. completion

SELECT tests.as_user(tests.user_id('A.x111_viewer'));
SELECT tests.throws(format($q$SELECT public.transfer_crew(%L)$q$, pg_temp.tid('deck')), '42501', 'a viewer cannot complete a transfer');
SELECT tests.as_user(tests.user_id('A.x111_officer'));
SELECT tests.is(public.transfer_crew(pg_temp.tid('deck')) ->> 'status', 'completed', 'transfer_crew: Completed');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT ca.leave_date = current_date, ca.end_reason, ca.is_current FROM public.crew_assignments AS ca
            WHERE ca.user_id = %L AND ca.vessel_id = %L$q$, tests.user_id('A.x111_deck'), tests.vessel_id('A.dra')),
  $q$VALUES (true, 'transfer', false)$q$,
  'the origin assignment ends on the sign-off date with end reason transfer');
SELECT tests.results_eq(
  format($q$SELECT ca.position, ca.rank, ca.department, ca.join_date - current_date, ca.is_current, ca.id = (SELECT to_assignment_id FROM public.crew_transfers WHERE id = %L)
            FROM public.crew_assignments AS ca WHERE ca.user_id = %L AND ca.vessel_id = %L$q$,
         pg_temp.tid('deck'), tests.user_id('A.x111_deck'), tests.vessel_id('A.gam')),
  $q$VALUES ('AB Seaman', 'AB Seaman', 'Deck', 2, true, true)$q$,
  'the destination assignment: the canonical position (a new role takes it as rank), its department, joining on the sign-on date');
SELECT tests.results_eq(
  format($q$SELECT t.vessel_id = %L, t.end_date = current_date, t.end_reason FROM public.crew_assignment_terms AS t WHERE t.profile_id = %L ORDER BY t.start_date$q$,
         tests.vessel_id('A.dra'), tests.profile_id('A.x111_deck')),
  $q$VALUES (true, true, 'transfer'), (false, NULL::boolean, NULL::text)$q$,
  'terms: the origin''s end at the sign-off; the destination''s are open');
SELECT tests.results_eq(
  format($q$SELECT t.position_id = %L, t.assignment_id IS NOT NULL, t.leave_method, t.leave_days_per_year::integer, t.date_joining_vessel - current_date
            FROM public.crew_assignment_terms AS t WHERE t.profile_id = %L AND t.vessel_id = %L$q$,
         pg_temp.pos('ab_seaman'), tests.profile_id('A.x111_deck'), tests.vessel_id('A.gam')),
  $q$VALUES (true, true, 'days_per_year', 30, 2)$q$,
  'the destination terms: the new position, the linked assignment, the allowance carried over');
SELECT tests.results_eq(
  format($q$SELECT fr.status, fr.join_date - current_date FROM public.familiarization_records AS fr WHERE fr.profile_id = %L AND fr.vessel_id = %L$q$,
         tests.profile_id('A.x111_deck'), tests.vessel_id('A.gam')),
  $q$VALUES ('open', 2)$q$,
  'the required familiarisation opens on GAME CHANGER from the joining date (X1-10''s terms trigger)');
SELECT tests.results_eq(
  format($q$SELECT id = %L, vessel_id = %L FROM public.frp_rotation_assignments WHERE profile_id = %L ORDER BY start_date$q$,
         tests.id('frp:deck_before'), tests.vessel_id('A.dra'), tests.profile_id('A.x111_deck')),
  $q$VALUES (true, true), (false, false)$q$,
  'planner: the period before the sign-off stays on DRAAK; the later one moves to GAME CHANGER');
SELECT tests.results_eq(
  format($q$SELECT kind, vessel_id = %L, occurred_on - current_date, source FROM public.crew_movements WHERE source_id = %L ORDER BY kind$q$,
         tests.vessel_id('A.dra'), pg_temp.tid('deck')),
  $q$VALUES ('transfer_in', false, 2, 'transfer'), ('transfer_out', true, 0, 'transfer')$q$,
  'movements: out of DRAAK on the sign-off, into GAME CHANGER on the sign-on');
SELECT tests.results_eq(
  format($q$SELECT count(*)::integer, bool_and(o.link_path = 'crew/list'), bool_and(o.vessel_id = %L) FROM public.notification_outbox AS o
            WHERE o.type_key = 'crew_transfer_completed' AND o.payload ->> 'transfer_id' = %L$q$, tests.vessel_id('A.gam'), pg_temp.tid('deck')),
  $q$VALUES (1, true, true)$q$,
  'crew_transfer_completed is emitted on the destination');
SELECT tests.as_user(tests.user_id('A.x111_officer'));
SELECT tests.throws_like(format($q$SELECT public.transfer_crew(%L)$q$, pg_temp.tid('deck')), '22023', 'illegal_transition', 'a completed transfer is not completed twice');
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_cancel(%L, 'late')$q$, pg_temp.tid('deck')), '22023', 'illegal_transition', 'nor cancelled');

-- ------------------------------------------------------------ 7. atomic: a guard refusal leaves everything untouched

SELECT pg_temp.keep('ab', public.transfer_crew_start(tests.profile_id('A.x111_ab'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam'),
                                                     tests.id('pos:lead_hand'), current_date, current_date + 5));
SELECT public.transfer_crew_review(pg_temp.tid('ab'));
SELECT public.transfer_crew_acknowledge(pg_temp.tid('ab'), pg_temp.all_ticks(pg_temp.tid('ab')));
SELECT tests.is(public.transfer_crew_submit(pg_temp.tid('ab')) ->> 'status', 'scheduled', 'the second transfer is scheduled');
-- The position is renamed Captain after scheduling: the destination row would now appoint a Master.
SELECT tests.reset_role();
UPDATE public.positions SET name = 'Captain' WHERE id = tests.id('pos:lead_hand');
SELECT tests.as_user(tests.user_id('A.x111_officer'));
SELECT tests.throws_like(format($q$SELECT public.transfer_crew(%L)$q$, pg_temp.tid('ab')), '42501', 'master_office_change_refused',
  'completion: the crew-assignment guard refuses the destination row as the caller');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT ca.leave_date IS NULL, ca.end_reason IS NULL, ca.is_current FROM public.crew_assignments AS ca WHERE ca.user_id = %L ORDER BY ca.vessel_id$q$,
         tests.user_id('A.x111_ab')),
  $q$VALUES (true, true, true)$q$,
  'atomic: the origin assignment is untouched and no destination assignment exists');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM public.crew_movements WHERE source_id = pg_temp.tid('ab'))
                AND NOT EXISTS (SELECT 1 FROM public.crew_assignment_terms WHERE profile_id = tests.profile_id('A.x111_ab'))
                AND (SELECT status FROM public.crew_transfers WHERE id = pg_temp.tid('ab')) = 'scheduled',
  'atomic: no movement, no terms, and the transfer is still scheduled');
UPDATE public.positions SET name = 'Lead Hand' WHERE id = tests.id('pos:lead_hand');

-- ------------------------------------------------------------ 8. fleet approval, four eyes, decline, cancel; the Master

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT pg_temp.keep('stew', public.transfer_crew_start(tests.profile_id('A.x111_stew'), tests.vessel_id('A.dra'), tests.vessel_id('A.hyd'),
                                                       NULL, current_date, current_date));
SELECT tests.ok((SELECT bool_or(i ->> 'key' = 'rest_gap') FROM jsonb_array_elements(public.transfer_crew_review(pg_temp.tid('stew')) #> '{review,items}') AS i),
  'review: joining the same day is a rest-gap item');
SELECT public.transfer_crew_acknowledge(pg_temp.tid('stew'), pg_temp.all_ticks(pg_temp.tid('stew')));
SELECT pg_temp.put('stew_submit', public.transfer_crew_submit(pg_temp.tid('stew')));
SELECT tests.results_eq($q$SELECT j ->> 'status', (j ->> 'requires_approval')::boolean FROM (SELECT pg_temp.got('stew_submit') AS j) AS x$q$,
  $q$VALUES ('pending_approval', true)$q$, 'submit: HYDRA asks for fleet approval');
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_decide(%L, 'approve')$q$, pg_temp.tid('stew')), '42501', 'own_submission',
  'four eyes: the submitter does not approve');
SELECT tests.throws_like(format($q$SELECT public.transfer_crew(%L)$q$, pg_temp.tid('stew')), '22023', 'illegal_transition', 'a pending transfer cannot be completed');
SELECT tests.as_user(tests.user_id('A.x111_officer'));
SELECT tests.throws(format($q$SELECT public.transfer_crew_decide(%L, 'approve')$q$, pg_temp.tid('stew')), '42501', 'an officer is no fleet approver');
SELECT tests.reset_role();
SELECT tests.ok(public.fleet_reach_for(tests.user_id('A.x111_vapprover'), tests.company_id('A'))
                AND public.has_capability_for(tests.user_id('A.x111_vapprover'), 'vessel.crew.crew_assignments.approve', tests.company_id('A'), NULL)
                AND NOT public.has_company_capability_for(tests.user_id('A.x111_vapprover'), 'vessel.crew.crew_assignments.approve', tests.company_id('A')),
  'setup: fleet reach and a DRAAK-bound approve role: "anywhere in the company" yes, company-wide no (D-376)');
SELECT tests._set_claims(jsonb_build_object('sub', tests.user_id('A.x111_vapprover'), 'role', 'authenticated'));
SELECT tests.is(public.crew_transfer_is_approver(tests.company_id('A')), false, 'a vessel-bound approve role is no fleet approver of transfers');
SELECT tests._set_claims(jsonb_build_object('sub', tests.user_id('A.x111_shore'), 'role', 'authenticated'));
SELECT tests.is(public.crew_transfer_is_approver(tests.company_id('A')), true, 'control: shore management is');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.x111_vapprover'));
SELECT tests.throws(format($q$SELECT public.transfer_crew_decide(%L, 'approve')$q$, pg_temp.tid('stew')), '42501', 'so they cannot approve a transfer that needs fleet approval');
SELECT tests.as_user(tests.user_id('A.x111_shore'));
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_decide(%L, 'decline')$q$, pg_temp.tid('stew')), '22023', 'reason_required', 'a decline needs a reason');
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_decide(%L, 'maybe')$q$, pg_temp.tid('stew')), '22023', 'decision_unknown', 'approve or decline');
SELECT pg_temp.put('stew_approve', public.transfer_crew_decide(pg_temp.tid('stew'), 'approve'));
SELECT tests.results_eq($q$SELECT j ->> 'status', j ->> 'approved_by_name' IS NOT NULL FROM (SELECT pg_temp.got('stew_approve') AS j) AS x$q$,
  $q$VALUES ('scheduled', true)$q$, 'the fleet approver approves: Scheduled');
SELECT tests.throws_like(format($q$SELECT public.transfer_crew_cancel(%L)$q$, pg_temp.tid('stew')), '22023', 'reason_required', 'cancelling a scheduled transfer needs a reason');
SELECT pg_temp.put('stew_cancel', public.transfer_crew_cancel(pg_temp.tid('stew'), 'Owner changed the plan'));
SELECT tests.results_eq($q$SELECT j ->> 'status', j ->> 'cancelled_reason' FROM (SELECT pg_temp.got('stew_cancel') AS j) AS x$q$,
  $q$VALUES ('cancelled', 'Owner changed the plan')$q$, 'cancelled with the reason');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT pg_temp.keep('stew2', public.transfer_crew_start(tests.profile_id('A.x111_stew'), tests.vessel_id('A.dra'), tests.vessel_id('A.hyd'), NULL, current_date, current_date + 1));
SELECT public.transfer_crew_review(pg_temp.tid('stew2'));
SELECT public.transfer_crew_acknowledge(pg_temp.tid('stew2'), pg_temp.all_ticks(pg_temp.tid('stew2')));
SELECT public.transfer_crew_submit(pg_temp.tid('stew2'));
SELECT tests.as_user(tests.user_id('A.x111_shore'));
SELECT pg_temp.put('stew2_decline', public.transfer_crew_decide(pg_temp.tid('stew2'), 'decline', 'HYDRA is fully crewed'));
SELECT tests.results_eq($q$SELECT j ->> 'status', j ->> 'decline_reason' FROM (SELECT pg_temp.got('stew2_decline') AS j) AS x$q$,
  $q$VALUES ('cancelled', 'HYDRA is fully crewed')$q$, 'a decline cancels the transfer with its reason');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(public.transfer_crew_start(tests.profile_id('A.master_dra'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam'), NULL, current_date + 5, current_date + 6) ->> 'status',
  'draft', 'a users-access admin of both vessels may start a Master''s transfer (D-198)');

-- ------------------------------------------------------------ 9. reads

SELECT tests.as_user(tests.user_id('A.x111_viewer'));
SELECT tests.is(public.transfer_crew_detail(pg_temp.tid('deck')) ->> 'status', 'completed', 'detail: crew_assignments.view on the origin reads it');
SELECT tests.is((public.transfer_crew_detail(pg_temp.tid('deck')) #>> '{rights,can_cancel}')::boolean, false, 'detail: a viewer may do nothing');
SELECT tests.as_user(tests.user_id('A.x111_deck'));
SELECT tests.is(public.transfer_crew_detail(pg_temp.tid('deck')) ->> 'status', 'completed', 'detail: the person reads their own transfer');
SELECT tests.is(jsonb_array_length(public.crew_transfers_for_profile(tests.profile_id('A.x111_deck'))), 1, 'a person''s transfers: their own');
SELECT tests.as_user(tests.user_id('A.x111_ab2'));
SELECT tests.throws(format($q$SELECT public.transfer_crew_detail(%L)$q$, pg_temp.tid('deck')), 'P0002', 'detail: another crew member sees nothing');
SELECT tests.is(jsonb_array_length(public.crew_transfers_for_profile(tests.profile_id('A.x111_deck'))), 0, 'a person''s transfers: none for a crew member without access');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws(format($q$SELECT public.transfer_crew_detail(%L)$q$, pg_temp.tid('deck')), 'P0002', 'detail: another tenant sees nothing');
SELECT tests.throws(format($q$SELECT public.crew_transfers_for_profile(%L)$q$, tests.profile_id('A.x111_deck')), 'P0002', 'nor a person''s transfers');
SELECT tests.throws(format($q$SELECT public.transfer_crew_review(%L)$q$, pg_temp.tid('ab')), 'P0002', 'nor any step');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws(format($q$SELECT public.transfer_crew_detail(%L)$q$, pg_temp.tid('deck')), 'P0002', 'detail: an inactive user sees nothing');
SELECT tests.as_user(tests.user_id('A.x111_viewer'));
SELECT tests.ok(EXISTS (SELECT 1 FROM public.crew_transfers WHERE id = pg_temp.tid('stew')),
  'RLS: crew_assignments.view on the origin reads the transfer row');
SELECT tests.as_user(tests.user_id('A.x111_ab2'));
SELECT tests.is_empty(format($q$SELECT id FROM public.crew_transfers WHERE id = %L$q$, pg_temp.tid('stew')),
  'RLS: a crew member without it reads no other person''s transfer');

-- ------------------------------------------------------------ 10. the daily sweep

SELECT tests.as_user(tests.user_id('A.x111_officer'));
SELECT pg_temp.keep('ab2', public.transfer_crew_start(tests.profile_id('A.x111_ab2'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam'), NULL, current_date, current_date));
SELECT public.transfer_crew_review(pg_temp.tid('ab2'));
SELECT public.transfer_crew_acknowledge(pg_temp.tid('ab2'), pg_temp.all_ticks(pg_temp.tid('ab2')));
SELECT public.transfer_crew_submit(pg_temp.tid('ab2'));
SELECT tests.throws($q$SELECT public.crew_transfers_complete_due()$q$, '42501', 'the sweep refuses a user session (and authenticated may not call it)');
SELECT tests.reset_role();
-- The person has a valid document for GAME CHANGER's requirement, so compliance reads complete there.
INSERT INTO public.crew_certificates (user_id, profile_id, company_id, document_type_id, certificate_name, certificate_type, issue_date, expiry_date, no_expiry)
SELECT tests.user_id('A.x111_ab2'), tests.profile_id('A.x111_ab2'), tests.company_id('A'), o.document_type_id, 'Personal survival techniques', 'STCW',
       current_date - 100, current_date + 1000, false
FROM public.crew_requirement_options AS o WHERE o.row_id = tests.id('req:gam_ab');
SELECT pg_temp.put('sweep', public.crew_transfers_complete_due(current_date));
SELECT tests.results_eq($q$SELECT (j ->> 'completed')::integer, (j ->> 'failed')::integer, (j ->> 'compliant_stamped')::integer >= 1 FROM (SELECT pg_temp.got('sweep') AS j) AS x$q$,
  $q$VALUES (1, 0, true)$q$, 'the sweep completes the transfer due today and stamps destination compliance');
SELECT tests.results_eq(format($q$SELECT status, compliant_on_destination_at IS NOT NULL FROM public.crew_transfers WHERE id = %L$q$, pg_temp.tid('ab2')),
  $q$VALUES ('completed', true)$q$, 'completed, compliant on the destination');
SELECT tests.is((SELECT status FROM public.crew_transfers WHERE id = pg_temp.tid('ab')), 'scheduled', 'a transfer joining later waits for its day');
SELECT tests.is((SELECT public.crew_transfers_complete_due(current_date) ->> 'completed')::integer, 0, 'a second run completes nothing');

-- ------------------------------------------------------------ 11. end of employment

INSERT INTO public.crew_contracts (id, company_id, profile_id, vessel_id, contract_type, start_date, status)
VALUES (tests.id('contract:end'), tests.company_id('A'), tests.profile_id('A.x111_end'), tests.vessel_id('A.dra'), 'rotational', current_date - 200, 'active');
INSERT INTO public.crew_assignment_terms (company_id, profile_id, vessel_id, position_id, department_key, start_date)
VALUES (tests.company_id('A'), tests.profile_id('A.x111_end'), tests.vessel_id('A.dra'), pg_temp.pos('deckhand'), 'deck', current_date - 200);
INSERT INTO public.frp_rotation_assignments (id, company_id, vessel_id, crew_user_id, profile_id, start_date, end_date, status, rotation_type)
VALUES (tests.id('frp:end_span'), tests.company_id('A'), tests.vessel_id('A.dra'), tests.user_id('A.x111_end'), tests.profile_id('A.x111_end'),
        current_date, current_date + 10, 'confirmed', 'onboard'),
       (tests.id('frp:end_after'), tests.company_id('A'), tests.vessel_id('A.dra'), tests.user_id('A.x111_end'), tests.profile_id('A.x111_end'),
        current_date + 20, current_date + 30, 'confirmed', 'leave');
SELECT tests.as_user(tests.user_id('A.x111_officer'));
SELECT tests.throws(format($q$SELECT public.crew_end_employment(%L, %L, current_date + 3, 'resignation')$q$, tests.profile_id('A.x111_end'), tests.vessel_id('A.dra')), '42501',
  'end employment needs contracts_employment.edit');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws(format($q$SELECT public.crew_end_employment(%L, %L, current_date + 3, 'resignation')$q$, tests.profile_id('A.x111_end'), tests.vessel_id('A.dra')), '42501',
  'another tenant may not end it');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format($q$SELECT public.crew_end_employment(%L, %L, current_date + 3, 'bored')$q$, tests.profile_id('A.x111_end'), tests.vessel_id('A.dra')), '22023', 'reason_unknown',
  'an unknown reason is refused');
SELECT tests.throws_like(format($q$SELECT public.crew_end_employment(%L, %L, current_date + 3, 'other')$q$, tests.profile_id('A.x111_end'), tests.vessel_id('A.dra')), '22023', 'notes_required',
  'Other needs a note');
SELECT tests.throws_like(format($q$SELECT public.crew_end_employment(%L, %L, current_date + 3, 'resignation')$q$, tests.profile_id('A.x111_ghost'), tests.vessel_id('A.dra')), '22023',
  'pending_placement_not_ended', 'a pending placement is changed on the profile (D-225)');
SELECT tests.throws_like(format($q$SELECT public.crew_end_employment(%L, %L, current_date + 3, 'resignation')$q$, tests.profile_id('A.x111_ab'), tests.vessel_id('A.dra')), '22023',
  'transfer_open', 'a person with an open transfer: cancel it first');
SELECT tests.throws_like(format($q$SELECT public.crew_end_employment(%L, %L, current_date - 400, 'resignation')$q$, tests.profile_id('A.x111_end'), tests.vessel_id('A.dra')), '22023',
  'end_date_out_of_range', 'an end date more than a year away is refused');
SELECT tests.throws(format($q$SELECT public.crew_end_employment(%L, %L, current_date + 3, 'resignation')$q$, tests.profile_id('B.admin'), tests.vessel_id('A.dra')), 'P0002',
  'a person of another company is unknown');
SELECT pg_temp.put('end', public.crew_end_employment(tests.profile_id('A.x111_end'), tests.vessel_id('A.dra'), current_date + 3, 'resignation', 'Personal reasons'));
SELECT tests.results_eq(
  $q$SELECT (j ->> 'terms_ended')::integer, j #>> '{contract,status}', (j ->> 'periods_removed')::integer, (j ->> 'periods_trimmed')::integer,
            (j #>> '{final_hor_month,month}')::integer = extract(month FROM current_date + 3)::integer, j #>> '{final_hor_month,submission_status}'
     FROM (SELECT pg_temp.got('end') AS j) AS x$q$,
  $q$VALUES (1, 'terminated', 1, 1, true, 'none')$q$,
  'end employment: terms ended, the contract terminated, the later period removed and the running one trimmed, the final HoR month named');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT ca.leave_date - current_date, ca.end_reason FROM public.crew_assignments AS ca WHERE ca.user_id = %L$q$, tests.user_id('A.x111_end')),
  $q$VALUES (3, 'resignation')$q$, 'the assignment ends on the end date with the reason');
SELECT tests.results_eq(
  format($q$SELECT status, terminated_at - current_date, termination_reason FROM public.crew_contracts WHERE id = %L$q$, tests.id('contract:end')),
  $q$VALUES ('terminated', 3, 'Resignation')$q$, 'the active contract is terminated on the end date');
SELECT tests.results_eq(
  format($q$SELECT id = %L, end_date - current_date FROM public.frp_rotation_assignments WHERE profile_id = %L$q$, tests.id('frp:end_span'), tests.profile_id('A.x111_end')),
  $q$VALUES (true, 3)$q$, 'planner: only the trimmed period is left');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE type_key = 'crew_employment_ended' AND payload ->> 'profile_id' = tests.profile_id('A.x111_end')::text)::integer, 1,
  'crew_employment_ended is emitted');

-- ------------------------------------------------------------ 12. history and re-hire

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.results_eq(
  format($q$SELECT h.position_text, h.department_key, h.end_reason, h.current_vessel_name FROM public.crew_vessel_employment_history(%L) AS h WHERE h.profile_id = %L$q$,
         tests.vessel_id('A.dra'), tests.profile_id('A.x111_deck')),
  $q$VALUES ('Deckhand', 'deck', 'transfer', 'GAME CHANGER')$q$,
  'history: the transferred deckhand''s ended DRAAK assignment, with where they are now');
SELECT tests.is((SELECT count(*) FROM public.crew_vessel_employment_history(tests.vessel_id('A.dra'), 'interior'))::integer, 0, 'history: the department filter');
SELECT tests.results_eq(
  format($q$SELECT j #>> '{last_assignment,vessel_name}', j #>> '{current,vessel_name}', j ->> 'email' IS NOT NULL, (j ->> 'has_login')::boolean FROM (SELECT public.crew_rehire_prefill(%L, %L) AS j) AS x$q$,
         tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra')),
  $q$VALUES ('GAME CHANGER', 'GAME CHANGER', true, true)$q$,
  're-hire prefill: the last assignment and the current vessel');
SELECT tests.throws(format($q$SELECT public.crew_rehire_prefill(%L, %L)$q$, tests.profile_id('B.admin'), tests.vessel_id('A.dra')), 'P0002', 're-hire: a person of another company is unknown');
SELECT tests.as_user(tests.user_id('A.x111_viewer'));
SELECT tests.throws(format($q$SELECT * FROM public.crew_vessel_employment_history(%L)$q$, tests.vessel_id('A.dra')), '42501', 'history needs contracts_employment.view');
SELECT tests.throws(format($q$SELECT public.crew_rehire_prefill(%L, %L)$q$, tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra')), '42501', 're-hire needs crew_profiles.create');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws(format($q$SELECT * FROM public.crew_vessel_employment_history(%L)$q$, tests.vessel_id('A.dra')), '42501', 'another tenant reads no history');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws(format($q$SELECT * FROM public.crew_vessel_employment_history(%L)$q$, tests.vessel_id('A.dra')), '42501', 'an inactive user reads no history');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 12b. the re-hire save (D-374, D-375)
-- crew_onboarding_save refuses a person on no crew (its gate is "on this
-- vessel's crew"), so the re-hire is crew_rehire_save: the assignment, the
-- terms linked to it, the draft contract and the On board period, all or nothing.
SELECT pg_temp.crew('A.x374_back', 'A.dra', 'Deckhand');
SELECT pg_temp.crew('A.x374_open', 'A.dra', 'Deckhand');
SELECT pg_temp.crew('A.x374_master', 'A.dra', 'Deckhand');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT pg_temp.put('x374_end_' || k, public.crew_end_employment(tests.profile_id(k), tests.vessel_id('A.dra'), current_date - 1, 'contract_end'))
FROM unnest(ARRAY['A.x374_back', 'A.x374_open', 'A.x374_master']) AS k;
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.crew_assignments AS x
                 WHERE x.user_id IN (tests.user_id('A.x374_back'), tests.user_id('A.x374_open'), tests.user_id('A.x374_master'))
                   AND public.crew_assignment_is_current(x.is_current, x.leave_date, x.end_date))::integer, 0,
  'setup: the three are on no crew after their employment ended');
-- An open transfer of an ended person (written as the engine would).
SELECT set_config('storm.crew_engine', 'on', true);
INSERT INTO public.crew_transfers (id, company_id, profile_id, user_id, from_vessel_id, to_vessel_id, sign_off_date, sign_on_date, status, created_by, updated_by)
VALUES (tests.id('x374:transfer'), tests.company_id('A'), tests.profile_id('A.x374_open'), tests.user_id('A.x374_open'), tests.vessel_id('A.dra'), tests.vessel_id('A.gam'),
        current_date + 5, current_date + 6, 'draft', tests.user_id('A.fleet_manager'), tests.user_id('A.fleet_manager'));
SELECT set_config('storm.crew_engine', '', true);
-- The old employment's terms on DRAAK (a re-hire on the same start date is refused).
INSERT INTO public.crew_assignment_terms (company_id, profile_id, vessel_id, position_id, department_key, start_date, end_date, end_reason)
VALUES (tests.company_id('A'), tests.profile_id('A.x374_back'), tests.vessel_id('A.dra'), pg_temp.pos('deckhand'), 'deck', current_date - 300, current_date - 1, 'contract_end');

-- The verifier's repro: the save Add crew made for a re-hire was refused.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format($q$SELECT public.crew_onboarding_save(%L, %L, jsonb_build_object('start_date', current_date + 5))$q$,
                                tests.profile_id('A.x374_back'), tests.vessel_id('A.dra')),
  '42501', 'crew_onboarding_refused', 'crew_onboarding_save still refuses a person on no crew (the re-hire has its own definer)');

-- Refusals (each before anything is written).
SELECT tests.throws_like(format($q$SELECT public.crew_rehire_save(%L, %L, jsonb_build_object('start_date', current_date + 5, 'position_id', %L))$q$,
                                tests.profile_id('A.x111_deck'), tests.vessel_id('A.dra'), pg_temp.pos('deckhand')),
  '22023', 'on_crew_now', 'someone on another crew today: transfer them instead');
SELECT tests.throws(format($q$SELECT public.crew_rehire_save(%L, %L, jsonb_build_object('start_date', current_date + 5, 'position_id', %L))$q$,
                           tests.profile_id('B.admin'), tests.vessel_id('A.dra'), pg_temp.pos('deckhand')),
  'P0002', 'a person of another company is unknown');
SELECT tests.throws_like(format($q$SELECT public.crew_rehire_save(%L, %L, jsonb_build_object('start_date', current_date + 5, 'position_id', %L))$q$,
                                tests.profile_id('A.x374_open'), tests.vessel_id('A.dra'), pg_temp.pos('deckhand')),
  '22023', 'transfer_open', 'an open transfer of the person is refused');
SELECT tests.throws_like(format($q$SELECT public.crew_rehire_save(%L, %L, jsonb_build_object('start_date', current_date + 5, 'position_id', %L))$q$,
                                tests.profile_id('A.x111_ghost'), tests.vessel_id('A.dra'), pg_temp.pos('deckhand')),
  '0A000', 'rehire_no_login', 'a person without a login: not available until the pending-placement engine (PR-X1-M)');
SELECT tests.throws_like(format($q$SELECT public.crew_rehire_save(%L, %L, jsonb_build_object('start_date', current_date - 300, 'position_id', %L))$q$,
                                tests.profile_id('A.x374_back'), tests.vessel_id('A.dra'), pg_temp.pos('deckhand')),
  '22023', 'start_date_taken', 'a start date that already has terms on the vessel is refused');
SELECT tests.throws_like(format($q$SELECT public.crew_rehire_save(%L, %L, jsonb_build_object('start_date', current_date + 5, 'position_id', %L))$q$,
                                tests.profile_id('A.x374_back'), tests.vessel_id('A.dra'), tests.id('position:nowhere')),
  '22023', 'position_unknown', 'an unknown position is refused');
SELECT tests.throws_like(format($q$SELECT public.crew_rehire_save(%L, %L, jsonb_build_object('position_id', %L))$q$,
                                tests.profile_id('A.x374_back'), tests.vessel_id('A.dra'), pg_temp.pos('deckhand')),
  '22023', 'start_date_required', 'the start date is required');
SELECT tests.throws_like(format($q$SELECT public.crew_rehire_save(%L, %L, jsonb_build_object('start_date', current_date + 5, 'position_id', %L, 'leave_method', 'monthly'))$q$,
                                tests.profile_id('A.x374_back'), tests.vessel_id('A.dra'), pg_temp.pos('deckhand')),
  '22023', 'field_invalid', 'the shared terms rules apply (and roll the assignment back)');
SELECT tests.reset_role();
SELECT tests.ok(public.has_capability_for(tests.user_id('A.x111_officer'), 'vessel.crew.crew_profiles.create', tests.company_id('A'), tests.vessel_id('A.dra')),
  'setup: the officer may add crew on DRAAK');
SELECT tests.as_user(tests.user_id('A.x111_officer'));
SELECT tests.throws_like(format($q$SELECT public.crew_rehire_save(%L, %L, jsonb_build_object('start_date', current_date + 5, 'position_id', %L))$q$,
                                tests.profile_id('A.x111_double'), tests.vessel_id('A.dra'), pg_temp.pos('deckhand')),
  '42501', 'out_of_reach', 'D-207: a person outside the officer''s reach');
SELECT tests.throws_like(format($q$SELECT public.crew_rehire_save(%L, %L, jsonb_build_object('start_date', current_date + 5, 'position_id', %L))$q$,
                                tests.profile_id('A.x374_master'), tests.vessel_id('A.dra'), pg_temp.pos('deckhand')),
  '42501', 'out_of_reach', 'D-207: someone on no crew is outside a vessel officer''s reach');
-- A company-wide administrator who reads Users & Access only (no users-access admin), with create and assign on DRAAK:
-- may act on the person (admin_scope_all), may not appoint a Master.
SELECT tests.reset_role();
SELECT tests.seed_user('A', 'A.x374_uaread', 'crew');
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'admin', vessel_scope = 'all', fleet_access = true, users_access_level = 'read', source = 'admin'
WHERE user_id = tests.user_id('A.x374_uaread');
SELECT tests.seed_rbac_role('A.x374_uaread', 'x111_assign', 'A.dra');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.x374_uaread'), 'vessel.crew.crew_profiles.create', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.has_capability_for(tests.user_id('A.x374_uaread'), 'vessel.crew.crew_assignments.assign', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT coalesce(public.has_capability_for(tests.user_id('A.x374_uaread'), 'admin.access.users_access.admin', tests.company_id('A'), tests.vessel_id('A.dra')), false)
                AND public.admin_may_act_on_user(tests.user_id('A.x374_uaread'), tests.user_id('A.x374_master'), tests.company_id('A'), tests.profile_id('A.x374_master')),
  'setup: the read-only Users & Access administrator adds and assigns crew on DRAAK, may act on the ended person, and is no users-access admin');
SELECT tests.as_user(tests.user_id('A.x374_uaread'));
SELECT tests.throws_like(format($q$SELECT public.crew_rehire_save(%L, %L, jsonb_build_object('start_date', current_date + 5, 'position_id', %L))$q$,
                                tests.profile_id('A.x374_master'), tests.vessel_id('A.dra'), pg_temp.pos('master')),
  '42501', 'master_rehire_refused', 'D-198: a Master position needs users-access admin of the vessel');
SELECT tests.as_user(tests.user_id('A.x111_viewer'));
SELECT tests.throws(format($q$SELECT public.crew_rehire_save(%L, %L, jsonb_build_object('start_date', current_date + 5, 'position_id', %L))$q$,
                           tests.profile_id('A.x374_back'), tests.vessel_id('A.dra'), pg_temp.pos('deckhand')),
  '42501', 'the re-hire needs crew_profiles.create and crew_assignments.assign');
SELECT tests.as_user(tests.user_id('A.x111_ext'));
SELECT tests.throws(format($q$SELECT public.crew_rehire_save(%L, %L, jsonb_build_object('start_date', current_date + 5, 'position_id', %L))$q$,
                           tests.profile_id('A.x374_back'), tests.vessel_id('A.dra'), pg_temp.pos('deckhand')),
  '42501', 'an external viewer is refused');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws(format($q$SELECT public.crew_rehire_save(%L, %L, jsonb_build_object('start_date', current_date + 5, 'position_id', %L))$q$,
                           tests.profile_id('A.x374_back'), tests.vessel_id('A.dra'), pg_temp.pos('deckhand')),
  '42501', 'an inactive caller is refused');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws(format($q$SELECT public.crew_rehire_save(%L, %L, jsonb_build_object('start_date', current_date + 5, 'position_id', %L))$q$,
                           tests.profile_id('A.x374_back'), tests.vessel_id('A.dra'), pg_temp.pos('deckhand')),
  '42501', 'another tenant may not re-hire on DRAAK');
SELECT tests.as_anon();
SELECT tests.throws(format($q$SELECT public.crew_rehire_save(%L, %L, jsonb_build_object('start_date', current_date + 5))$q$,
                           tests.profile_id('A.x374_back'), tests.vessel_id('A.dra')),
  '42501', 'anon may not call it');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.crew_assignments WHERE user_id IN (tests.user_id('A.x374_back'), tests.user_id('A.x374_master'), tests.user_id('A.x374_open'))
                   AND coalesce(join_date, start_date) > current_date - 2)::integer, 0,
  'atomic: no refusal left an assignment behind');
SELECT tests.is((SELECT count(*) FROM public.crew_contracts WHERE profile_id = tests.profile_id('A.x374_back'))::integer, 0, 'nor a contract');

-- The re-hire.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT pg_temp.put('x374', public.crew_rehire_save(tests.profile_id('A.x374_back'), tests.vessel_id('A.dra'),
  jsonb_build_object('start_date', current_date + 5, 'position_id', pg_temp.pos('deckhand'), 'department_key', 'deck',
                     'contract_type_key', 'permanent', 'leave_method', 'days_per_year', 'leave_days_per_year', 30),
  '{"city": "Valletta"}'::jsonb));
SELECT tests.reset_role();
SELECT tests.ok((SELECT (j ->> 'assignment_id') IS NOT NULL AND (j ->> 'terms_id') IS NOT NULL AND (j ->> 'contract_id') IS NOT NULL AND (j ->> 'period_id') IS NOT NULL
                 FROM (SELECT pg_temp.got('x374') AS j) AS x),
  're-hire: the answer names the assignment, the terms, the draft contract and the On board period');
SELECT tests.results_eq(
  format($q$SELECT x.id, x.vessel_id, x.position, x.rank, x.department, x.join_date - current_date, x.created_by
            FROM public.crew_assignments AS x WHERE x.user_id = %L AND public.crew_assignment_is_current(x.is_current, x.leave_date, x.end_date)$q$,
         tests.user_id('A.x374_back')),
  format($q$VALUES (%L::uuid, %L::uuid, 'Deckhand', 'Deckhand', 'Deck', 5, %L::uuid)$q$,
         pg_temp.got('x374') ->> 'assignment_id', tests.vessel_id('A.dra'), tests.user_id('A.fleet_manager')),
  'one current assignment on DRAAK from the start date, written as the caller');
SELECT tests.results_eq(
  format($q$SELECT t.id, t.assignment_id, t.start_date - current_date, t.end_date, t.contract_type_key, t.leave_days_per_year
            FROM public.crew_assignment_terms AS t WHERE t.profile_id = %L AND t.end_date IS NULL$q$, tests.profile_id('A.x374_back')),
  format($q$VALUES (%L::uuid, %L::uuid, 5, NULL::date, 'permanent', 30.00::numeric)$q$,
         pg_temp.got('x374') ->> 'terms_id', pg_temp.got('x374') ->> 'assignment_id'),
  'the new terms, linked to the new assignment; the old terms stay ended');
SELECT tests.results_eq(
  format($q$SELECT c.id, c.vessel_id, c.status, c.contract_type, c.position, c.department, c.start_date - current_date FROM public.crew_contracts AS c WHERE c.profile_id = %L$q$,
         tests.profile_id('A.x374_back')),
  format($q$VALUES (%L::uuid, %L::uuid, 'draft', 'permanent', 'Deckhand', 'Deck', 5)$q$, pg_temp.got('x374') ->> 'contract_id', tests.vessel_id('A.dra')),
  'one draft contract');
SELECT tests.results_eq(
  format($q$SELECT a.id, a.vessel_id, a.leave_type_key, a.start_date - current_date, a.end_unknown, a.status::text
            FROM public.frp_rotation_assignments AS a WHERE a.profile_id = %L AND a.start_date >= current_date$q$, tests.profile_id('A.x374_back')),
  format($q$VALUES (%L::uuid, %L::uuid, 'on_board', 5, true, 'confirmed')$q$, pg_temp.got('x374') ->> 'period_id', tests.vessel_id('A.dra')),
  'one On board period from the start date, end unknown');
SELECT tests.is((SELECT city FROM public.crew_personal_details WHERE profile_id = tests.profile_id('A.x374_back')), 'Valletta', 'the personal details are applied');
SELECT tests.is((SELECT count(*) FROM public.audit_logs WHERE entity_id = tests.profile_id('A.x374_back') AND new_values ->> 'via' = 'crew_rehire_save'
                   AND new_values ->> 'assignment_id' = pg_temp.got('x374') ->> 'assignment_id')::integer, 1, 'one audit row');
SELECT tests.ok(current_setting('storm.crew_engine', true) IS DISTINCT FROM 'on', 'the engine flag is not left on');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format($q$SELECT public.crew_rehire_save(%L, %L, jsonb_build_object('start_date', current_date + 9, 'position_id', %L))$q$,
                                tests.profile_id('A.x374_back'), tests.vessel_id('A.dra'), pg_temp.pos('deckhand')),
  '22023', 'on_crew_now', 'a second re-hire: they are on the crew now');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 13. emitters and grants

SELECT tests.ok(position('''crew_transfer_submitted''' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.transfer_crew_submit(uuid)'::regprocedure)) > 0
                AND position('''crew_transfer_completed''' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.crew_transfer_apply(uuid, uuid, date)'::regprocedure)) > 0
                AND position('crew_transfer_apply' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.transfer_crew(uuid)'::regprocedure)) > 0
                AND position('''crew_employment_ended''' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.crew_end_employment(uuid, uuid, date, text, text)'::regprocedure)) > 0,
  'the three types live in crew/module.ts are emitted (submit, the completion through crew_transfer_apply, end of employment)');
SELECT tests.ok(has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE'), 'browser RPC: ' || f)
FROM unnest(ARRAY['public.transfer_crew_options(uuid, uuid)', 'public.transfer_crew_start(uuid, uuid, uuid, uuid, date, date, text)',
                  'public.transfer_crew_review(uuid)', 'public.transfer_crew_acknowledge(uuid, jsonb)', 'public.transfer_crew_submit(uuid)',
                  'public.transfer_crew_decide(uuid, text, text)', 'public.transfer_crew_cancel(uuid, text)', 'public.transfer_crew(uuid)',
                  'public.transfer_crew_detail(uuid)', 'public.crew_transfers_for_profile(uuid)', 'public.crew_end_employment(uuid, uuid, date, text, text)',
                  'public.crew_vessel_employment_history(uuid, text)', 'public.crew_rehire_prefill(uuid, uuid)', 'public.crew_rehire_save(uuid, uuid, jsonb, jsonb)']) AS f;
SELECT tests.ok(NOT has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE')
                AND has_function_privilege('service_role', f, 'EXECUTE'), 'internal or sweep: ' || f)
FROM unnest(ARRAY['public.crew_transfer_next(text, text, boolean, boolean, boolean)', 'public.crew_end_reason_label(text)',
                  'public.crew_transfer_actor_check(uuid, uuid)', 'public.crew_transfer_is_approver(uuid)', 'public.crew_transfer_fleet_hr(uuid)',
                  'public.crew_transfer_review_snapshot(uuid)', 'public.crew_transfer_acknowledged(jsonb, jsonb)', 'public.crew_transfer_json(uuid)',
                  'public.crew_transfer_gate(uuid, uuid, uuid)', 'public.crew_transfer_load(uuid)', 'public.crew_transfer_apply(uuid, uuid, date)',
                  'public.crew_transfers_complete_due(date)']) AS f;
SELECT tests.ok((SELECT prosecdef AND proconfig::text LIKE '%search_path=public%' FROM pg_proc WHERE oid = f::regprocedure), 'definer with search_path: ' || f)
FROM unnest(ARRAY['public.transfer_crew_options(uuid, uuid)', 'public.transfer_crew_start(uuid, uuid, uuid, uuid, date, date, text)',
                  'public.transfer_crew_review(uuid)', 'public.transfer_crew_acknowledge(uuid, jsonb)', 'public.transfer_crew_submit(uuid)',
                  'public.transfer_crew_decide(uuid, text, text)', 'public.transfer_crew_cancel(uuid, text)', 'public.transfer_crew(uuid)',
                  'public.transfer_crew_detail(uuid)', 'public.crew_transfers_for_profile(uuid)', 'public.crew_end_employment(uuid, uuid, date, text, text)',
                  'public.crew_vessel_employment_history(uuid, text)', 'public.crew_rehire_prefill(uuid, uuid)', 'public.crew_rehire_save(uuid, uuid, jsonb, jsonb)',
                  'public.crew_transfers_complete_due(date)']) AS f;
SELECT tests.ok(NOT has_table_privilege('anon', 'public.crew_transfers', 'SELECT') AND NOT has_table_privilege('authenticated', 'public.crew_transfers', 'UPDATE')
                AND NOT has_table_privilege('authenticated', 'public.crew_movements', 'INSERT'),
  'the transfer and movement tables stay read-only for the browser, nothing for anon');
