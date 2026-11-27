-- The planner server (X1-09, 20261124060900_crew_planner_periods.sql;
-- gap/04 C4, C47, C48, C50, C51, C52, W7; DECISIONS D-X1-10, D-X1-16):
--   1. parity with the TS mirrors, loaded from src/ through
--      scripts/db/lib/load-ts.mjs and compared case by case: the leave
--      types (lib/leaveTypes.ts LEAVE_TYPES and the two legacy mappings),
--      rangesOverlap, openHorizon, manningBand, leaveDecisionCheck;
--   2. leave_types: the 14 types, read by active users only, no writes;
--   3. the period store: confirmed periods write their day codes (owned,
--      with the code they replaced), a changed or removed period gives the
--      days back (painted codes restored), locked months are untouched,
--      people without a login get no codes, end-unknown periods are written
--      to today + 30 and moved on by frp_periods_extend_open; overlaps are
--      refused unless replacing rotation leave (split, trimmed), never
--      another type; personal leave needs leave approval; foreign and
--      unknown ids, stale versions and bad dates are refused;
--   4. the guards: a signed-in direct write keeps draft bars and bar
--      geometry, never the status, type, approval or request columns; a
--      leave request's status and reviewer columns are the engine's; a
--      painted code owns its day; the scope guards;
--   5. leave requests: crew self-service (multi-period, its refusals), the
--      HoD step (off / nudge / required), approval creating confirmed
--      periods (with replace), decline with a reason, cancel by the
--      requester while pending and by an approver after approval (periods
--      removed, codes reversed, a legacy request's codes too);
--   6. Add leave: an approver's entry saved Approved (approver recorded),
--      anyone else's (and an approver's own) a pending request, a person
--      without a login added by an approver only;
--   7. the On/Off toggle: a period and a movement each way, the On board
--      period ended, its refusals;
--   8. manning by day: aboard from periods or assignments, qualified from
--      the requirement engine projected by expiry, the four bands, the
--      unmatched-title row, the range rules; the vessel's periods read;
--   9. RLS of the new tables and the gates (another tenant, no reach,
--      inactive, external, anon);
--  10. grants.

\set parity `node --input-type=module -e "const d='src/modules/rotation-planner/lib/'; const lt0=await import('./scripts/db/lib/load-ts.mjs'); const r=await lt0.loadTs([d+'periods.ts', d+'duration.ts', d+'manning.ts', d+'leaveTypes.ts']); const P=r.modules[d+'periods.ts']; const M=r.modules[d+'manning.ts']; const L=r.modules[d+'leaveTypes.ts']; const D=r.modules[d+'duration.ts']; const lt=L.LEAVE_TYPES.map(t=>[t.key,t.label,t.dayCode,t.toneKey,t.balanceEffect,t.policyFlag,t.countsOnBoard,t.isLeave,t.needsApproval,t.sortOrder]); const rot=['onboard','leave','travel','standby','yard','wfh','temp_cover','training','no_crew','tbc'].map(x=>[x,L.leaveTypeKeyForRotation(x)]); const back=L.LEAVE_TYPE_KEYS.map(k=>[k,L.rotationTypeForLeaveType(k)]); const ds=[0,1,2,3,4,5,6].map(i=>D.addDays('2026-03-01',i)); const ends=[null].concat(ds); const ov=[]; for (const a1 of ds) for (const a2 of ends) { if (a2!==null && a2<a1) continue; for (const b1 of ds) for (const b2 of ends) { if (b2!==null && b2<b1) continue; ov.push([a1,a2,b1,b2,P.rangesOverlap(a1,a2,b1,b2)]); } } const hz=[]; for (const s of ds) for (const n of ends) for (const t of ds) hz.push([s,n,t,P.openHorizon(s,n,t)]); const bd=[]; for (const a of [0,1,2,3,4]) for (let q=0;q<=a;q++) for (const mn of [0,1,2,3]) for (const mx of [null,0,1,2,3,4]) bd.push([a,q,mn,mx,M.manningBand(a,q,mn,mx)]); const dc=[]; const tf=[true,false]; for (const dn of ['hod_review','approve','decline','cancel','bogus']) for (const st of ['pending','approved','declined','cancelled','draft']) for (const o of tf) for (const ap of tf) for (const h of tf) for (const mf of tf) for (const sp of ['off','nudge','required']) for (const rv of tf) for (const rs of tf) dc.push([dn,st,o,ap,h,mf,sp,rv,rs,P.leaveDecisionCheck(dn,st,o,ap,h,mf,sp,rv,rs)]); process.stdout.write(JSON.stringify([lt,rot,back,ov,hz,bd,dc]));"`
CREATE TEMP TABLE px ON COMMIT DROP AS SELECT :'parity'::jsonb AS j;
GRANT SELECT ON px TO PUBLIC;

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ world (A.dra unless named)

SELECT tests.seed_role('x19_view', 'vessel');
SELECT tests.seed_role('x19_planner', 'vessel');
SELECT tests.seed_role('x19_approver', 'vessel');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, x.k, x.p::public.permission_level, 'vessel'
FROM (VALUES ('x19_view', 'crew_roster', 'view'), ('x19_planner', 'crew_roster', 'edit'),
             ('x19_approver', 'crew_roster', 'edit'), ('x19_approver', 'crew.approve_leave', 'view')) AS x(r, k, p)
JOIN public.roles AS r ON r.name = x.r;

CREATE OR REPLACE FUNCTION pg_temp.crew(p_key text, p_vessel text, p_position text, p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM tests.seed_user('A', p_key, 'crew');
  PERFORM tests.seed_assignment(p_key, p_vessel, true, p_position, p_extra);
END;
$$;
SELECT pg_temp.crew('A.x19_planner', 'A.dra', 'Second Officer');
SELECT pg_temp.crew('A.x19_approver', 'A.dra', 'Chief Officer');
SELECT pg_temp.crew('A.x19_viewer', 'A.dra', 'Deckhand');
SELECT pg_temp.crew('A.x19_chief_stew', 'A.dra', 'Chief Stewardess', '{"department": "Interior"}');
SELECT pg_temp.crew('A.x19_stew', 'A.dra', 'Second Stewardess', '{"department": "Interior"}');
SELECT pg_temp.crew('A.x19_deck', 'A.dra', 'Deckhand');
SELECT pg_temp.crew('A.x19_deck2', 'A.dra', 'Deckhand');
SELECT pg_temp.crew('A.x19_cook', 'A.dra', 'Deckhand');
SELECT pg_temp.crew('A.x19_legacy', 'A.dra', 'Purser');
SELECT pg_temp.crew('A.x19_ext', 'A.dra', 'Deckhand');
SELECT tests.seed_profile('A', 'A.x19_ghost', 'crew', 'not_invited', NULL);
SELECT tests.seed_assignment('A.disabled', 'A.dra', true, 'Deckhand');
SELECT tests.seed_user('B', 'B.x19_crew', 'crew');
SELECT tests.seed_assignment('B.x19_crew', 'B.lev', true, 'Deckhand');
SELECT tests.seed_rbac_role('A.x19_planner', 'x19_planner', 'A.dra');
SELECT tests.seed_rbac_role('A.x19_approver', 'x19_approver', 'A.dra');
SELECT tests.seed_rbac_role('A.x19_viewer', 'x19_view', 'A.dra');
SELECT tests.seed_rbac_role('A.x19_chief_stew', 'x19_view', 'A.dra');
SELECT tests.seed_rbac_role('A.x19_ext', 'x19_approver', 'A.dra');
SELECT tests.seed_rbac_role('A.disabled', 'x19_approver', 'A.dra');
SELECT tests.seed_user_role('A.x19_legacy', 'captain', 'A');   -- a legacy planner editor (frp_can_edit)
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'external', vessel_scope = 'assigned', fleet_access = false, source = 'admin',
    valid_from = now() - interval '1 day', valid_until = now() + interval '7 days'
WHERE user_id = tests.user_id('A.x19_ext');
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT id, company_id, tests.vessel_id('A.dra') FROM public.account_memberships WHERE user_id = tests.user_id('A.x19_ext');

CREATE OR REPLACE FUNCTION pg_temp.pos(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT md5('storm.position.' || p_key)::uuid $$;
CREATE OR REPLACE FUNCTION pg_temp.ty(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT md5('storm.crew_document_type.' || p_key)::uuid $$;
-- Day codes of a person over days (offsets from today), '-' for a day without a code.
CREATE OR REPLACE FUNCTION pg_temp.codes(p_key text, p_from integer, p_to integer)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT string_agg(coalesce(e.status_code, '-'), ',' ORDER BY g.d)
  FROM generate_series(current_date + p_from, current_date + p_to, interval '1 day') AS g(d)
  LEFT JOIN public.crew_leave_entries AS e ON e.crew_id = tests.user_id(p_key) AND e.date = g.d::date
$$;
CREATE OR REPLACE FUNCTION pg_temp.rep(p_code text, p_n integer) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT string_agg(p_code, ',') FROM generate_series(1, p_n)
$$;
-- The periods of a person: type, start offset, end offset (NULL: end unknown), as text rows.
CREATE OR REPLACE FUNCTION pg_temp.periods(p_key text)
RETURNS TABLE (leave_type_key text, s integer, e integer) LANGUAGE sql STABLE AS $$
  SELECT a.leave_type_key, a.start_date - current_date, CASE WHEN a.end_unknown THEN NULL ELSE a.end_date - current_date END
  FROM public.frp_rotation_assignments AS a
  WHERE a.profile_id = tests.profile_id(p_key) AND a.status IN ('confirmed', 'complete')
  ORDER BY a.start_date
$$;
CREATE TEMP TABLE out_ids (k text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT ALL ON out_ids TO PUBLIC;
CREATE TEMP TABLE out_rows (k text PRIMARY KEY, r jsonb) ON COMMIT DROP;
GRANT ALL ON out_rows TO PUBLIC;

-- Setup checks (so each refusal below is the one it claims to be).
SELECT tests.ok(public.has_capability_for(tests.user_id('A.x19_planner'), 'vessel.crew.crew_scheduling.edit', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.x19_planner'), 'hris.leave_rotation.leave_requests.approve', tests.company_id('A'), tests.vessel_id('A.dra')),
  'setup: the planner edits the DRAAK planner but does not approve leave');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.x19_approver'), 'vessel.crew.crew_scheduling.edit', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.has_capability_for(tests.user_id('A.x19_approver'), 'hris.leave_rotation.leave_requests.approve', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT coalesce(public.fleet_reach_for(tests.user_id('A.x19_approver'), tests.company_id('A')), false)
                AND NOT coalesce(public.record_is_master(tests.user_id('A.x19_approver'), tests.vessel_id('A.dra')), false),
  'setup: the approver edits the planner and approves leave on DRAAK, and is neither Master nor a fleet approver');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.x19_viewer'), 'vessel.crew.crew_scheduling.view', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.x19_viewer'), 'vessel.crew.crew_scheduling.edit', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.x19_viewer'), 'vessel.crew.crew_scheduling.view', tests.company_id('A'), tests.vessel_id('A.gam')),
  'setup: the viewer reads the DRAAK planner only');
SELECT tests.ok(NOT public.has_capability_for(tests.user_id('A.x19_stew'), 'vessel.crew.crew_scheduling.view', tests.company_id('A'), tests.vessel_id('A.dra')),
  'setup: the stew holds no planner capability');
SELECT tests.ok(public.planner_is_department_hod(tests.user_id('A.x19_chief_stew'), tests.profile_id('A.x19_stew'), tests.vessel_id('A.dra'))
                AND NOT public.planner_is_department_hod(tests.user_id('A.x19_deck'), tests.profile_id('A.x19_stew'), tests.vessel_id('A.dra'))
                AND NOT public.planner_is_department_hod(tests.user_id('A.x19_chief_stew'), tests.profile_id('A.x19_deck'), tests.vessel_id('A.dra'))
                AND NOT public.planner_is_department_hod(tests.user_id('A.x19_stew'), tests.profile_id('A.x19_stew'), tests.vessel_id('A.dra')),
  'setup: the Chief Stew heads the stew''s department (Interior), not the deckhand''s; a deckhand heads nobody; nobody heads themselves');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.x19_ext'), 'vessel.crew.crew_scheduling.edit', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.record_user_is_external(tests.user_id('A.x19_ext'), tests.company_id('A'))
                AND public.frp_can_edit(tests.user_id('A.x19_legacy')),
  'setup: the external viewer holds the planner keys (so its refusals are the external rule); the legacy editor passes frp_can_edit');

-- ------------------------------------------------------------ 1. parity with the TS mirrors

SELECT tests.results_eq(
  $q$SELECT key, label, day_code, tone_key, balance_effect, policy_flag, counts_on_board, is_leave, needs_approval, sort_order, is_system, is_active FROM public.leave_types$q$,
  $q$SELECT e ->> 0, e ->> 1, e ->> 2, e ->> 3, e ->> 4, e ->> 5, (e ->> 6)::boolean, (e ->> 7)::boolean, (e ->> 8)::boolean, (e ->> 9)::integer, true, true
     FROM px, jsonb_array_elements(j -> 0) AS e$q$,
  'leave_types holds exactly LEAVE_TYPES of lib/leaveTypes.ts (14 STORM types, one list for the dialog and the legend)');
SELECT tests.is((SELECT count(*) FROM px, jsonb_array_elements(j -> 0)), 14::bigint, 'the TS list has the 14 W7 types');
SELECT tests.is_empty(
  $q$SELECT e FROM px, jsonb_array_elements(j -> 1) AS e WHERE public.planner_leave_type_for_rotation(e ->> 0) IS DISTINCT FROM e ->> 1$q$,
  'planner_leave_type_for_rotation equals leaveTypeKeyForRotation for every legacy rotation type');
SELECT tests.is_empty(
  $q$SELECT e FROM px, jsonb_array_elements(j -> 2) AS e WHERE public.planner_rotation_type_for_leave(e ->> 0)::text IS DISTINCT FROM e ->> 1$q$,
  'planner_rotation_type_for_leave equals rotationTypeForLeaveType for every leave type');
SELECT tests.ok((SELECT count(*) FROM px, jsonb_array_elements(j -> 3)) > 1000, format('%s overlap cases', (SELECT count(*) FROM px, jsonb_array_elements(j -> 3))));
SELECT tests.is_empty(
  $q$SELECT e FROM px, jsonb_array_elements(j -> 3) AS e
     WHERE public.planner_periods_overlap((e ->> 0)::date, (e ->> 1)::date, (e ->> 2)::date, (e ->> 3)::date) IS DISTINCT FROM (e ->> 4)::boolean$q$,
  'planner_periods_overlap equals rangesOverlap on every case (end unknown included)');
SELECT tests.results_eq(
  $q$SELECT DISTINCT (e ->> 4)::boolean FROM px, jsonb_array_elements(j -> 3) AS e$q$, $q$VALUES (true), (false)$q$, 'the overlap cases reach both answers');
SELECT tests.is_empty(
  $q$SELECT e FROM px, jsonb_array_elements(j -> 4) AS e
     WHERE public.planner_open_horizon((e ->> 0)::date, (e ->> 1)::date, (e ->> 2)::date) IS DISTINCT FROM (e ->> 3)::date$q$,
  'planner_open_horizon equals openHorizon on every case');
SELECT tests.is_empty(
  $q$SELECT e FROM px, jsonb_array_elements(j -> 5) AS e
     WHERE public.planner_manning_band((e ->> 0)::integer, (e ->> 1)::integer, (e ->> 2)::integer, (e ->> 3)::integer) IS DISTINCT FROM e ->> 4$q$,
  'planner_manning_band equals manningBand on every case');
SELECT tests.results_eq(
  $q$SELECT DISTINCT e ->> 4 FROM px, jsonb_array_elements(j -> 5) AS e$q$, $q$VALUES ('critical'), ('at_minimum'), ('normal'), ('overmanned')$q$,
  'the band cases reach every band');
SELECT tests.is((SELECT count(*) FROM px, jsonb_array_elements(j -> 6)), 4800::bigint, '4,800 leave decision cases (5 decisions x 5 statuses x 6 facts x 3 HoD steps)');
SELECT tests.is_empty(
  $q$SELECT e FROM px, jsonb_array_elements(j -> 6) AS e
     WHERE public.planner_leave_decide_check(e ->> 0, e ->> 1, (e ->> 2)::boolean, (e ->> 3)::boolean, (e ->> 4)::boolean, (e ->> 5)::boolean,
                                             e ->> 6, (e ->> 7)::boolean, (e ->> 8)::boolean) IS DISTINCT FROM e ->> 9$q$,
  'planner_leave_decide_check equals leaveDecisionCheck on every case');
SELECT tests.results_eq(
  $q$SELECT DISTINCT e ->> 9 FROM px, jsonb_array_elements(j -> 6) AS e$q$,
  $q$VALUES ('ok'), ('22023:decision_invalid'), ('22023:illegal_transition'), ('22023:hod_step_off'), ('42501:own_request'), ('42501:not_department_hod'),
            ('22023:already_reviewed'), ('42501:not_permitted'), ('22023:hod_review_pending'), ('22023:reason_required'), ('42501:ask_approver')$q$,
  'the decision cases reach every answer');
SELECT tests.is(public.planner_leave_decide_check('approve', 'pending', NULL, NULL, NULL, NULL, NULL, NULL, NULL), '42501:not_permitted', 'NULL facts fail closed');

-- ------------------------------------------------------------ 2. leave_types

SELECT tests.results_eq($q$SELECT day_code FROM public.leave_types WHERE key IN ('emergency', 'other') ORDER BY sort_order$q$, $q$VALUES ('E'), ('O')$q$,
  'Emergency (E) and Other (O) are new day codes');
SELECT tests.is((SELECT count(*) FROM public.leave_types WHERE counts_on_board), 2::bigint, 'On board and Sick on board put a person aboard');
SELECT tests.lives(format($q$INSERT INTO public.crew_leave_entries (crew_id, date, status_code, company_id) VALUES (%L, current_date + 600, 'E', %L)$q$,
  tests.user_id('A.crew_hyd'), tests.company_id('A')), 'crew_leave_entries takes the new code E');
DELETE FROM public.crew_leave_entries WHERE crew_id = tests.user_id('A.crew_hyd') AND date = current_date + 600;
SELECT tests.throws(format($q$INSERT INTO public.crew_leave_entries (crew_id, date, status_code, company_id) VALUES (%L, current_date + 600, 'X', %L)$q$,
  tests.user_id('A.crew_hyd'), tests.company_id('A')), '23514', 'an unknown day code is still refused');
SELECT tests.as_user(tests.user_id('A.x19_stew'));
SELECT tests.is((SELECT count(*) FROM public.leave_types), 14::bigint, 'an active crew member reads the 14 leave types');
SELECT tests.throws($q$INSERT INTO public.leave_types (key, label, day_code, tone_key, balance_effect, sort_order) VALUES ('x', 'X', 'O', 'muted', 'neutral', 1)$q$,
  '42501', 'the browser cannot add a leave type');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is((SELECT count(*) FROM public.leave_types), 0::bigint, 'an inactive user reads no leave type');
SELECT tests.as_anon();
SELECT tests.denied($q$SELECT * FROM public.leave_types$q$, 'anon reads no leave type');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 3. the period store (A.x19_deck)

SELECT tests.as_user(tests.user_id('A.x19_planner'));
INSERT INTO out_ids SELECT 'ob', p.id FROM public.planner_period_upsert(tests.vessel_id('A.dra'), NULL, tests.profile_id('A.x19_deck'), 'on_board', current_date + 40, current_date + 60) AS p;
SELECT tests.reset_role();
SELECT tests.results_eq(
  $q$SELECT status::text, leave_type_key, rotation_type::text, profile_id, crew_user_id, vessel_id, company_id, created_by, label, end_unknown, approved_by, version
     FROM public.frp_rotation_assignments WHERE id = (SELECT id FROM out_ids WHERE k = 'ob')$q$,
  $q$VALUES ('confirmed', 'on_board', 'onboard', tests.profile_id('A.x19_deck'), tests.user_id('A.x19_deck'), tests.vessel_id('A.dra'), tests.company_id('A'),
             tests.user_id('A.x19_planner'), 'On board', false, NULL::uuid, 1)$q$,
  'a confirmed On board period: the person and login, the vessel''s company, the legacy rotation type follows, the planner stamped, no approval');
SELECT tests.is(pg_temp.codes('A.x19_deck', 39, 61), '-,' || pg_temp.rep('F', 21) || ',-', 'its 21 days are written as F, and no other day');
SELECT tests.is((SELECT count(*) FROM public.crew_leave_entries WHERE source_period_id = (SELECT id FROM out_ids WHERE k = 'ob')), 21::bigint,
  'the 21 day codes name their period');
SELECT tests.ok(EXISTS (SELECT 1 FROM public.frp_planner_audit_log WHERE entity_id = (SELECT id FROM out_ids WHERE k = 'ob') AND action = 'create' AND changed_by = tests.user_id('A.x19_planner')),
  'the period''s creation is logged in the planner audit log');

SELECT tests.as_user(tests.user_id('A.x19_planner'));
SELECT tests.throws_like(format($q$SELECT public.planner_period_upsert(%L, NULL, %L, 'rotation', current_date + 55, current_date + 70)$q$,
  tests.vessel_id('A.dra'), tests.profile_id('A.x19_deck')), '22023', 'period_overlap', 'an overlapping period is refused');
SELECT tests.throws_like(format($q$SELECT public.planner_period_upsert(%L, NULL, %L, 'rotation', current_date + 55, current_date + 70, false, NULL, true)$q$,
  tests.vessel_id('A.dra'), tests.profile_id('A.x19_deck')), '22023', 'period_overlap', 'replace never touches an On board period (only rotation leave)');
INSERT INTO out_ids SELECT 'rot', p.id FROM public.planner_period_upsert(tests.vessel_id('A.dra'), NULL, tests.profile_id('A.x19_deck'), 'rotation', current_date + 61, current_date + 80) AS p;
SELECT tests.throws_like(format($q$SELECT public.planner_period_upsert(%L, NULL, %L, 'travel', current_date + 65, current_date + 66)$q$,
  tests.vessel_id('A.dra'), tests.profile_id('A.x19_deck')), '22023', 'period_overlap', 'travel inside rotation leave is refused without replace');
INSERT INTO out_ids SELECT 'tr', p.id FROM public.planner_period_upsert(tests.vessel_id('A.dra'), NULL, tests.profile_id('A.x19_deck'), 'travel', current_date + 65, current_date + 66, false, NULL, true) AS p;
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT * FROM pg_temp.periods('A.x19_deck')$q$,
  $q$VALUES ('on_board', 40, 60), ('rotation', 61, 64), ('travel', 65, 66), ('rotation', 67, 80)$q$,
  'replace splits the rotation leave around the travel: 61-64 and 67-80');
SELECT tests.is(pg_temp.codes('A.x19_deck', 61, 80), pg_temp.rep('R', 4) || ',T,T,' || pg_temp.rep('R', 14), 'the day codes follow: R, then T T, then R');
SELECT tests.is((SELECT count(*) FROM public.crew_leave_entries WHERE source_period_id = (SELECT id FROM out_ids WHERE k = 'rot')), 4::bigint,
  'the trimmed rotation period owns only its four days now');

-- A painted code is kept: a period takes the day over and gives it back.
SELECT tests.as_user(tests.user_id('A.x19_legacy'));
SELECT tests.lives(format($q$INSERT INTO public.crew_leave_entries (crew_id, date, status_code, company_id, vessel_id, source_period_id, replaced_code)
                           VALUES (%L, current_date + 90, 'L', %L, %L, %L, 'F')$q$,
  tests.user_id('A.x19_deck'), tests.company_id('A'), tests.vessel_id('A.dra'), (SELECT id FROM out_ids WHERE k = 'ob')),
  'a legacy editor paints a day code (naming a period, which the guard drops)');
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT status_code::text, source_period_id, replaced_code::text FROM public.crew_leave_entries WHERE crew_id = tests.user_id('A.x19_deck') AND date = current_date + 90$q$,
  $q$VALUES ('L', NULL::uuid, NULL::text)$q$, 'a painted code is manual: no period, no replaced code');
SELECT tests.as_user(tests.user_id('A.x19_planner'));
INSERT INTO out_ids SELECT 'r2', p.id FROM public.planner_period_upsert(tests.vessel_id('A.dra'), NULL, tests.profile_id('A.x19_deck'), 'rotation', current_date + 85, current_date + 95) AS p;
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT status_code::text, source_period_id, replaced_code::text FROM public.crew_leave_entries WHERE crew_id = tests.user_id('A.x19_deck') AND date = current_date + 90$q$,
  $q$SELECT 'R', (SELECT id FROM out_ids WHERE k = 'r2'), 'L'$q$, 'the period takes the painted day over and keeps its code (L)');
SELECT tests.as_user(tests.user_id('A.x19_planner'));
SELECT tests.is((SELECT public.planner_period_delete(tests.vessel_id('A.dra'), (SELECT id FROM out_ids WHERE k = 'r2'))), (SELECT id FROM out_ids WHERE k = 'r2'),
  'planner_period_delete returns the removed id');
SELECT tests.reset_role();
SELECT tests.is(pg_temp.codes('A.x19_deck', 85, 95), '-,-,-,-,-,L,-,-,-,-,-', 'removing the period gives its days back: the painted L returns, the rest is cleared');
SELECT tests.results_eq($q$SELECT source_period_id, replaced_code::text FROM public.crew_leave_entries WHERE crew_id = tests.user_id('A.x19_deck') AND date = current_date + 90$q$,
  $q$VALUES (NULL::uuid, NULL::text)$q$, 'the restored code is manual again');

-- A painted code over a period's day detaches it; shrinking the period takes it back and releases the rest.
SELECT tests.as_user(tests.user_id('A.x19_legacy'));
SELECT tests.lives(format($q$UPDATE public.crew_leave_entries SET status_code = 'L' WHERE crew_id = %L AND date = current_date + 45$q$, tests.user_id('A.x19_deck')),
  'a legacy editor paints L over a period''s day');
SELECT tests.reset_role();
SELECT tests.is((SELECT source_period_id FROM public.crew_leave_entries WHERE crew_id = tests.user_id('A.x19_deck') AND date = current_date + 45), NULL::uuid,
  'the painted day belongs to the painter (detached from the period)');
SELECT tests.as_user(tests.user_id('A.x19_planner'));
SELECT tests.throws_like(format($q$SELECT public.planner_period_upsert(%L, %L, %L, 'on_board', current_date + 40, current_date + 50, false, NULL, false, 99)$q$,
  tests.vessel_id('A.dra'), (SELECT id FROM out_ids WHERE k = 'ob'), tests.profile_id('A.x19_deck')), '22023', 'period_changed', 'a stale version is refused');
SELECT tests.is((SELECT p.version FROM public.planner_period_upsert(tests.vessel_id('A.dra'), (SELECT id FROM out_ids WHERE k = 'ob'), tests.profile_id('A.x19_deck'),
                  'on_board', current_date + 40, current_date + 50, false, 'Shortened', false, 1) AS p), 2,
  'the current version changes the period (version 2)');
SELECT tests.reset_role();
SELECT tests.is(pg_temp.codes('A.x19_deck', 40, 60), pg_temp.rep('F', 11) || ',' || pg_temp.rep('-', 10), 'shrinking to 40-50 releases 51-60 and retakes the painted day');
SELECT tests.results_eq($q$SELECT status_code::text, replaced_code::text FROM public.crew_leave_entries WHERE crew_id = tests.user_id('A.x19_deck') AND date = current_date + 45$q$,
  $q$VALUES ('F', 'L')$q$, 'the retaken day keeps the painted code as its replaced code');

-- Locked months are never written or cleared.
SELECT date_trunc('month', current_date + 200)::date - current_date AS m200 \gset
INSERT INTO public.crew_leave_locked_months (year, month, company_id, vessel_id)
VALUES (extract(year FROM current_date + :m200)::integer, extract(month FROM current_date + :m200)::integer, tests.company_id('A'), NULL);
SELECT tests.as_user(tests.user_id('A.x19_planner'));
INSERT INTO out_ids SELECT 'lock', p.id FROM public.planner_period_upsert(tests.vessel_id('A.dra'), NULL, tests.profile_id('A.x19_deck'), 'rotation', current_date + :m200 - 2, current_date + :m200 + 2) AS p;
SELECT tests.reset_role();
SELECT tests.is(pg_temp.codes('A.x19_deck', :m200 - 2, :m200 + 2), 'R,R,-,-,-', 'a period crossing into a locked month writes only the open days');

-- End unknown: written to today + 30 (never past the day before the next period), moved on daily.
SELECT tests.as_user(tests.user_id('A.x19_planner'));
INSERT INTO out_ids SELECT 'open', p.id FROM public.planner_period_upsert(tests.vessel_id('A.dra'), NULL, tests.profile_id('A.x19_deck'), 'rotation', current_date + 5, NULL, true) AS p;
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT end_unknown, end_date - current_date FROM public.frp_rotation_assignments WHERE id = (SELECT id FROM out_ids WHERE k = 'open')$q$,
  $q$VALUES (true, 30)$q$, 'an end-unknown period before the On board one is written to today + 30');
SELECT tests.is(pg_temp.codes('A.x19_deck', 4, 40), '-,' || pg_temp.rep('R', 26) || ',' || pg_temp.rep('-', 9) || ',F', 'days 5 to 30 are R, 31 to 39 not yet');
SELECT tests.as_user(tests.user_id('A.x19_planner'));
SELECT tests.throws($q$SELECT public.frp_periods_extend_open()$q$, '42501', 'the daily sweep is not the browser''s');
SELECT tests.as_service();
SELECT tests.ok((SELECT public.frp_periods_extend_open(current_date + 20)) >= 1, 'the sweep (as on day 20) moves the open period on');
SELECT tests.reset_role();
SELECT tests.is((SELECT end_date - current_date FROM public.frp_rotation_assignments WHERE id = (SELECT id FROM out_ids WHERE k = 'open')), 39,
  'it stops the day before the next period (39, not 50)');
SELECT tests.is(pg_temp.codes('A.x19_deck', 31, 40), pg_temp.rep('R', 9) || ',F', 'days 31 to 39 are now written');
SELECT tests.as_service();
SELECT tests.is((SELECT public.frp_periods_extend_open(current_date + 20)), 0, 'a second run the same day moves nothing');
SELECT tests.reset_role();

-- A person without a login has periods but no day codes.
SELECT tests.as_user(tests.user_id('A.x19_planner'));
INSERT INTO out_ids SELECT 'ghost', p.id FROM public.planner_period_upsert(tests.vessel_id('A.dra'), NULL, tests.profile_id('A.x19_ghost'), 'on_board', current_date + 10, current_date + 20) AS p;
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT profile_id, crew_user_id FROM public.frp_rotation_assignments WHERE id = (SELECT id FROM out_ids WHERE k = 'ghost')$q$,
  $q$VALUES (tests.profile_id('A.x19_ghost'), NULL::uuid)$q$, 'a period for a crew member without a login keys on the profile');
SELECT tests.is((SELECT count(*) FROM public.crew_leave_entries WHERE source_period_id = (SELECT id FROM out_ids WHERE k = 'ghost')), 0::bigint, 'and writes no day code');

-- Personal leave needs leave approval; Sick on board carries its flag.
SELECT tests.as_user(tests.user_id('A.x19_planner'));
SELECT tests.throws_like(format($q$SELECT public.planner_period_upsert(%L, NULL, %L, 'holiday', current_date + 100, current_date + 105)$q$,
  tests.vessel_id('A.dra'), tests.profile_id('A.x19_deck')), '42501', 'leave_approval_required', 'a planner without leave approval cannot write a holiday');
SELECT tests.as_user(tests.user_id('A.x19_approver'));
INSERT INTO out_ids SELECT 'hol', p.id FROM public.planner_period_upsert(tests.vessel_id('A.dra'), NULL, tests.profile_id('A.x19_deck'), 'holiday', current_date + 100, current_date + 105) AS p;
INSERT INTO out_ids SELECT 'sick', p.id FROM public.planner_period_upsert(tests.vessel_id('A.dra'), NULL, tests.profile_id('A.x19_cook'), 'sick_on_board', current_date + 10, current_date + 12) AS p;
SELECT tests.as_user(tests.user_id('A.x19_planner'));
SELECT tests.throws_like(format($q$SELECT public.planner_period_delete(%L, %L)$q$, tests.vessel_id('A.dra'), (SELECT id FROM out_ids WHERE k = 'hol')),
  '42501', 'leave_approval_required', 'nor remove one');
SELECT tests.throws_like(format($q$SELECT public.planner_period_upsert(%L, %L, %L, 'rotation', current_date + 100, current_date + 105)$q$,
  tests.vessel_id('A.dra'), (SELECT id FROM out_ids WHERE k = 'hol'), tests.profile_id('A.x19_deck')), '42501', 'leave_approval_required', 'nor turn it into another type');
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT approved_by, approved_at IS NOT NULL FROM public.frp_rotation_assignments WHERE id = (SELECT id FROM out_ids WHERE k = 'hol')$q$,
  $q$VALUES (tests.user_id('A.x19_approver'), true)$q$, 'an approver''s holiday is approved, the approver recorded (D-X1-10)');
SELECT tests.is(pg_temp.codes('A.x19_deck', 100, 105), pg_temp.rep('L', 6), 'a holiday writes L');
SELECT tests.results_eq($q$SELECT is_sick_on_board, rotation_type::text FROM public.frp_rotation_assignments WHERE id = (SELECT id FROM out_ids WHERE k = 'sick')$q$,
  $q$VALUES (true, 'onboard')$q$, 'Sick on board is flagged on the period and reads aboard to the legacy planner');
SELECT tests.is(pg_temp.codes('A.x19_cook', 10, 12), 'F,F,F', 'Sick on board writes F');

-- Foreign, unknown and invalid input.
INSERT INTO public.frp_rotation_assignments (company_id, vessel_id, profile_id, start_date, end_date, leave_type_key, status)
VALUES (tests.company_id('A'), tests.vessel_id('A.hyd'), tests.profile_id('A.x19_ghost'), current_date + 300, current_date + 301, 'travel', 'confirmed')
RETURNING id AS hyd_period \gset
SELECT tests.as_user(tests.user_id('A.x19_planner'));
SELECT tests.throws_like(format($q$SELECT public.planner_period_upsert(%L, NULL, %L, 'rotation', current_date + 1, current_date + 2)$q$,
  tests.vessel_id('A.dra'), tests.profile_id('B.x19_crew')), 'P0002', 'person_not_found', 'another company''s person is unknown');
SELECT tests.throws_like(format($q$SELECT public.planner_period_upsert(%L, NULL, %L, 'rotation', current_date + 1, current_date + 2)$q$,
  tests.vessel_id('A.dra'), tests.id('profile:nobody')), 'P0002', 'person_not_found', 'an unknown person is refused');
SELECT tests.throws_like(format($q$SELECT public.planner_period_upsert(%L, %L, %L, 'travel', current_date + 300, current_date + 301)$q$,
  tests.vessel_id('A.dra'), :'hyd_period', tests.profile_id('A.x19_ghost')), 'P0002', 'period_not_found', 'a period of another vessel is not changed from this one');
SELECT tests.throws_like(format($q$SELECT public.planner_period_upsert(%L, %L, %L, 'travel', current_date + 300, current_date + 301)$q$,
  tests.vessel_id('A.hyd'), :'hyd_period', tests.profile_id('A.x19_ghost')), '42501', 'crew_not_permitted', 'nor on the vessel the planner does not edit');
SELECT tests.throws_like(format($q$SELECT public.planner_period_upsert(%L, NULL, %L, 'rotation', current_date + 1, current_date + 2)$q$,
  tests.id('vessel:nowhere'), tests.profile_id('A.x19_deck')), 'P0002', 'vessel_not_found', 'an unknown vessel');
SELECT tests.throws_like(format($q$SELECT public.planner_period_upsert(%L, NULL, %L, 'rotation', current_date + 9, current_date + 8)$q$,
  tests.vessel_id('A.dra'), tests.profile_id('A.x19_ghost')), '22023', 'period_dates_invalid', 'an end before the start');
SELECT tests.throws_like(format($q$SELECT public.planner_period_upsert(%L, NULL, %L, 'rotation', current_date + 30, current_date + 31, true)$q$,
  tests.vessel_id('A.dra'), tests.profile_id('A.x19_ghost')), '22023', 'period_invalid', 'end unknown with an end');
SELECT tests.throws_like(format($q$SELECT public.planner_period_upsert(%L, NULL, %L, 'rotation', current_date + 30, NULL)$q$,
  tests.vessel_id('A.dra'), tests.profile_id('A.x19_ghost')), '22023', 'period_invalid', 'no end and not end unknown');
SELECT tests.throws_like(format($q$SELECT public.planner_period_upsert(%L, NULL, %L, 'rotation', current_date + 800, current_date + 801)$q$,
  tests.vessel_id('A.dra'), tests.profile_id('A.x19_ghost')), '22023', 'period_out_of_range', 'beyond two years');
SELECT tests.throws_like(format($q$SELECT public.planner_period_upsert(%L, NULL, %L, 'sabbatical', current_date + 30, current_date + 31)$q$,
  tests.vessel_id('A.dra'), tests.profile_id('A.x19_ghost')), '22023', 'leave_type_unknown', 'an unknown leave type');
SELECT tests.throws_like(format($q$SELECT public.planner_period_upsert(%L, NULL, %L, 'rotation', current_date + 30, current_date + 31, false, repeat('x', 2001))$q$,
  tests.vessel_id('A.dra'), tests.profile_id('A.x19_ghost')), '22023', 'notes_too_long', 'notes over 2,000 characters');
SELECT tests.as_user(tests.user_id('A.x19_viewer'));
SELECT tests.throws_like(format($q$SELECT public.planner_period_upsert(%L, NULL, %L, 'rotation', current_date + 30, current_date + 31)$q$,
  tests.vessel_id('A.dra'), tests.profile_id('A.x19_ghost')), '42501', 'crew_not_permitted', 'a planner viewer cannot write');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws(format($q$SELECT public.planner_period_upsert(%L, NULL, %L, 'rotation', current_date + 30, current_date + 31)$q$,
  tests.vessel_id('A.dra'), tests.profile_id('A.x19_ghost')), '42501', 'an inactive approver is refused');
SELECT tests.as_user(tests.user_id('A.x19_ext'));
SELECT tests.throws(format($q$SELECT public.planner_period_upsert(%L, NULL, %L, 'rotation', current_date + 30, current_date + 31)$q$,
  tests.vessel_id('A.dra'), tests.profile_id('A.x19_ghost')), '42501', 'an external viewer is refused');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws(format($q$SELECT public.planner_period_upsert(%L, NULL, %L, 'rotation', current_date + 30, current_date + 31)$q$,
  tests.vessel_id('A.dra'), tests.profile_id('A.x19_ghost')), '42501', 'another tenant is refused');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 4. the guards (direct writes)

SELECT set_config('storm.crew_engine', '', true);
SELECT tests.as_user(tests.user_id('A.x19_legacy'));
SELECT tests.lives(format($q$INSERT INTO public.frp_rotation_assignments (id, company_id, vessel_id, crew_user_id, start_date, end_date, rotation_type, status, label)
                           VALUES (%L, %L, %L, %L, current_date + 300, current_date + 310, 'leave', 'draft', 'Plan')$q$,
  tests.id('frp:draft'), tests.company_id('A'), tests.vessel_id('A.dra'), tests.user_id('A.x19_deck2')), 'a legacy editor adds a draft bar (D-01 fallback)');
SELECT tests.throws_like(format($q$INSERT INTO public.frp_rotation_assignments (company_id, vessel_id, crew_user_id, start_date, end_date, rotation_type, status)
                                VALUES (%L, %L, %L, current_date + 320, current_date + 321, 'onboard', 'confirmed')$q$,
  tests.company_id('A'), tests.vessel_id('A.dra'), tests.user_id('A.x19_deck2')), '42501', 'planner_engine_only', 'but no confirmed bar');
SELECT tests.throws_like(format($q$UPDATE public.frp_rotation_assignments SET status = 'confirmed' WHERE id = %L$q$, tests.id('frp:draft')),
  '42501', 'planner_engine_only', 'nor confirms a draft');
SELECT tests.throws_like(format($q$UPDATE public.frp_rotation_assignments SET leave_type_key = 'holiday' WHERE id = %L$q$, tests.id('frp:draft')),
  '42501', 'planner_engine_only', 'nor sets the leave type');
SELECT tests.throws_like(format($q$UPDATE public.frp_rotation_assignments SET approved_by = %L, approved_at = now() WHERE id = %L$q$, tests.user_id('A.x19_legacy'), tests.id('frp:draft')),
  '42501', 'planner_engine_only', 'nor approves');
SELECT tests.lives(format($q$UPDATE public.frp_rotation_assignments SET rotation_type = 'travel', start_date = current_date + 302 WHERE id = %L$q$, tests.id('frp:draft')),
  'moves and retypes its draft');
SELECT tests.throws_like(format($q$UPDATE public.frp_rotation_assignments SET status = 'draft' WHERE id = %L$q$, (SELECT id FROM out_ids WHERE k = 'tr')),
  '42501', 'planner_engine_only', 'never moves a confirmed period''s status');
SELECT tests.throws_like(format($q$UPDATE public.frp_rotation_assignments SET rotation_type = 'leave' WHERE id = %L$q$, (SELECT id FROM out_ids WHERE k = 'tr')),
  '42501', 'planner_engine_only', 'nor its type');
SELECT tests.lives(format($q$UPDATE public.frp_rotation_assignments SET end_date = current_date + 65 WHERE id = %L$q$, (SELECT id FROM out_ids WHERE k = 'tr')),
  'but keeps a confirmed bar''s geometry writable (the D-01 fallback)');
SELECT tests.throws_like(format($q$DELETE FROM public.frp_rotation_assignments WHERE id = %L$q$, (SELECT id FROM out_ids WHERE k = 'tr')),
  '42501', 'planner_engine_only', 'and never deletes a confirmed period');
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT leave_type_key, profile_id, status::text, version FROM public.frp_rotation_assignments WHERE id = tests.id('frp:draft')$q$,
  $q$VALUES ('travel', tests.profile_id('A.x19_deck2'), 'draft', 2)$q$, 'the draft''s type follows its rotation type; the person is filled; the version counts');
SELECT tests.is((SELECT count(*) FROM public.crew_leave_entries WHERE crew_id = tests.user_id('A.x19_deck2') AND date BETWEEN current_date + 300 AND current_date + 310), 0::bigint,
  'a draft writes no day code');
SELECT tests.is(pg_temp.codes('A.x19_deck', 64, 67), 'R,T,-,R', 'the moved confirmed bar re-writes its days (66 released)');
SELECT tests.as_user(tests.user_id('A.x19_legacy'));
SELECT tests.lives(format($q$DELETE FROM public.frp_rotation_assignments WHERE id = %L$q$, tests.id('frp:draft')), 'a legacy editor deletes a draft');
SELECT tests.reset_role();
SELECT tests.lives(format($q$UPDATE public.frp_rotation_assignments SET status = 'complete' WHERE id = %L$q$, (SELECT id FROM out_ids WHERE k = 'tr')),
  'the service role and no-JWT maintenance are exempt');
SELECT tests.throws_like(format($q$INSERT INTO public.frp_rotation_assignments (company_id, vessel_id, start_date, end_date) VALUES (%L, %L, current_date, current_date)$q$,
  tests.company_id('A'), tests.vessel_id('B.lev')), '23514', 'planner_period_scope_mismatch', 'a period names a vessel of its own company');
SELECT tests.throws_like(format($q$INSERT INTO public.frp_rotation_assignments (company_id, profile_id, start_date, end_date) VALUES (%L, %L, current_date, current_date)$q$,
  tests.company_id('A'), tests.profile_id('B.x19_crew')), '23514', 'planner_period_scope_mismatch', 'and a person of its own company');

-- Leave requests: the status and reviewer columns are the engine's.
SELECT tests.as_user(tests.user_id('A.x19_stew'));
SELECT tests.lives(format($q$INSERT INTO public.crew_leave_requests (id, crew_id, leave_type, start_date, end_date, status, company_id, vessel_id)
                           VALUES (%L, %L, 'R', current_date + 270, current_date + 272, 'pending', %L, %L)$q$,
  tests.id('req:legacy'), tests.user_id('A.x19_stew'), tests.company_id('A'), tests.vessel_id('A.dra')), 'a crew member raises a legacy single-period request');
SELECT tests.throws_like(format($q$INSERT INTO public.crew_leave_requests (crew_id, leave_type, start_date, end_date, status, company_id, vessel_id)
                                VALUES (%L, 'L', current_date + 1, current_date + 2, 'approved', %L, %L)$q$,
  tests.user_id('A.x19_stew'), tests.company_id('A'), tests.vessel_id('A.dra')), '42501', 'leave_request_engine_only', 'but cannot raise it approved');
SELECT tests.throws(format($q$UPDATE public.crew_leave_requests SET status = 'cancelled' WHERE id = %L$q$, tests.id('req:legacy')), '42501',
  'nor change its status directly');
SELECT tests.as_user(tests.user_id('A.x19_legacy'));
SELECT tests.throws_like(format($q$UPDATE public.crew_leave_requests SET status = 'approved', reviewed_by = %L, reviewed_at = now() WHERE id = %L$q$,
  tests.user_id('A.x19_legacy'), tests.id('req:legacy')), '42501', 'leave_request_engine_only', 'and a legacy editor cannot approve it directly');
SELECT tests.reset_role();
SELECT tests.is((SELECT profile_id FROM public.crew_leave_requests WHERE id = tests.id('req:legacy')), tests.profile_id('A.x19_stew'), 'the request''s profile is filled');
SELECT tests.as_user(tests.user_id('A.x19_stew'));
SELECT tests.throws(format($q$INSERT INTO public.crew_leave_request_periods (request_id, leave_type_key, start_date, end_date) VALUES (%L, 'rotation', current_date, current_date)$q$,
  tests.id('req:legacy')), '42501', 'the browser never writes request periods');
SELECT tests.reset_role();
SELECT tests.throws_like(format($q$INSERT INTO public.crew_leave_request_periods (company_id, request_id, leave_type_key, start_date, end_date) VALUES (%L, %L, 'rotation', current_date, current_date)$q$,
  tests.company_id('B'), tests.id('req:legacy')), '23514', 'leave_request_period_scope_mismatch', 'a request period carries its request''s company');

-- ------------------------------------------------------------ 5. leave requests (A.x19_stew)

SELECT tests.as_user(tests.user_id('A.x19_stew'));
INSERT INTO out_ids SELECT 'req1', r.id FROM public.crew_leave_request_submit(tests.vessel_id('A.dra'),
  jsonb_build_array(jsonb_build_object('leave_type_key', 'holiday', 'start_date', current_date + 120, 'end_date', current_date + 125),
                    jsonb_build_object('leave_type_key', 'emergency', 'start_date', current_date + 130, 'end_date', current_date + 131)), 'Family visit') AS r;
SELECT tests.reset_role();
SELECT tests.results_eq(
  $q$SELECT status, leave_type::text, start_date - current_date, end_date - current_date, crew_id, profile_id, notes, reviewed_by
     FROM public.crew_leave_requests WHERE id = (SELECT id FROM out_ids WHERE k = 'req1')$q$,
  $q$VALUES ('pending', 'L', 120, 131, tests.user_id('A.x19_stew'), tests.profile_id('A.x19_stew'), 'Family visit', NULL::uuid)$q$,
  'a two-period request is pending; the row keeps the first code and the overall span');
SELECT tests.results_eq(
  $q$SELECT sort_order, leave_type_key, start_date - current_date, end_date - current_date, company_id FROM public.crew_leave_request_periods
     WHERE request_id = (SELECT id FROM out_ids WHERE k = 'req1')$q$,
  $q$VALUES (0, 'holiday', 120, 125, tests.company_id('A')), (1, 'emergency', 130, 131, tests.company_id('A'))$q$, 'its two periods, in order');
SELECT tests.is((SELECT count(*) FROM pg_temp.periods('A.x19_stew')), 0::bigint, 'a pending request writes no period');

SELECT tests.as_user(tests.user_id('A.x19_stew'));
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_submit(%L, '[{"leave_type_key": "on_board", "start_date": "%s", "end_date": "%s"}]'::jsonb)$q$,
  tests.vessel_id('A.dra'), current_date + 1, current_date + 2), '22023', 'leave_type_not_requestable', 'On board is not requested');
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_submit(%L, '[{"leave_type_key": "holiday", "start_date": "%s", "end_date": "%s"}, {"leave_type_key": "unpaid", "start_date": "%s", "end_date": "%s"}]'::jsonb)$q$,
  tests.vessel_id('A.dra'), current_date + 1, current_date + 5, current_date + 4, current_date + 8), '22023', 'periods_overlap', 'two overlapping periods');
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_submit(%L, '[]'::jsonb)$q$, tests.vessel_id('A.dra')), '22023', 'periods_required', 'no period');
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_submit(%L, (SELECT jsonb_agg(jsonb_build_object('leave_type_key', 'holiday', 'start_date', current_date + i * 3, 'end_date', current_date + i * 3)) FROM generate_series(1, 11) AS i))$q$,
  tests.vessel_id('A.dra')), '22023', 'periods_too_many', 'eleven periods');
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_submit(%L, '[{"leave_type_key": "sabbatical", "start_date": "%s", "end_date": "%s"}]'::jsonb)$q$,
  tests.vessel_id('A.dra'), current_date + 1, current_date + 2), '22023', 'leave_type_unknown', 'an unknown type');
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_submit(%L, '[{"leave_type_key": "holiday", "start_date": "%s", "end_date": "%s"}]'::jsonb)$q$,
  tests.vessel_id('A.dra'), current_date + 5, current_date + 2), '22023', 'period_dates_invalid', 'an end before the start');
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_submit(%L, '[{"leave_type_key": "holiday", "start_date": "%s", "end_unknown": true, "end_date": "%s"}]'::jsonb)$q$,
  tests.vessel_id('A.dra'), current_date + 5, current_date + 6), '22023', 'period_invalid', 'end unknown with an end');
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_submit(%L, '[{"leave_type_key": "holiday", "start_date": "%s", "end_date": "%s"}]'::jsonb)$q$,
  tests.vessel_id('A.dra'), current_date + 900, current_date + 901), '22023', 'period_out_of_range', 'beyond two years');
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_submit(%L, '[{"leave_type_key": "holiday", "start_date": "nonsense", "end_date": "%s"}]'::jsonb)$q$,
  tests.vessel_id('A.dra'), current_date + 1), '22023', 'period_invalid', 'a date that is no date');
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_submit(%L, '[{"leave_type_key": "holiday", "start_date": "%s", "end_date": "%s"}]'::jsonb)$q$,
  tests.id('vessel:nowhere'), current_date + 1, current_date + 2), 'P0002', 'vessel_not_found', 'an unknown vessel');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_submit(%L, '[{"leave_type_key": "holiday", "start_date": "%s", "end_date": "%s"}]'::jsonb)$q$,
  tests.vessel_id('A.dra'), current_date + 1, current_date + 2), '42501', 'not_on_vessel_crew', 'a crew member of another vessel cannot request leave here');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws(format($q$SELECT public.crew_leave_request_submit(%L, '[{"leave_type_key": "holiday", "start_date": "%s", "end_date": "%s"}]'::jsonb)$q$,
  tests.vessel_id('A.dra'), current_date + 1, current_date + 2), '42501', 'an inactive crew member is refused');
SELECT tests.as_user(tests.user_id('B.x19_crew'));
SELECT tests.throws(format($q$SELECT public.crew_leave_request_submit(%L, '[{"leave_type_key": "holiday", "start_date": "%s", "end_date": "%s"}]'::jsonb)$q$,
  tests.vessel_id('A.dra'), current_date + 1, current_date + 2), '42501', 'another tenant is refused');
SELECT tests.reset_role();

-- The vessel's HoD step.
SELECT tests.as_user(tests.user_id('A.x19_planner'));
SELECT tests.throws(format($q$SELECT public.planner_leave_settings_save(%L, 'required')$q$, tests.vessel_id('A.dra')), '42501', 'a planner does not set how leave is approved');
SELECT tests.as_user(tests.user_id('A.x19_approver'));
SELECT tests.throws_like(format($q$SELECT public.planner_leave_settings_save(%L, 'sometimes')$q$, tests.vessel_id('A.dra')), '22023', 'hod_step_invalid', 'an unknown step');
SELECT tests.is((SELECT s.hod_step FROM public.planner_leave_settings_save(tests.vessel_id('A.dra'), 'required') AS s), 'required', 'an approver requires the HoD review');
SELECT tests.as_user(tests.user_id('A.x19_viewer'));
SELECT tests.is((SELECT hod_step FROM public.crew_leave_settings WHERE vessel_id = tests.vessel_id('A.dra')), 'required', 'a planner viewer reads the vessel''s step');
SELECT tests.as_user(tests.user_id('A.x19_stew'));
SELECT tests.is((SELECT count(*) FROM public.crew_leave_settings), 0::bigint, 'crew without planner access read no settings');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is((SELECT count(*) FROM public.crew_leave_settings), 0::bigint, 'another tenant reads none');
SELECT tests.reset_role();

-- Deciding req1 under the required HoD step.
SELECT tests.as_user(tests.user_id('A.x19_planner'));
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_decide(%L, 'approve')$q$, (SELECT id FROM out_ids WHERE k = 'req1')), '42501', 'not_permitted',
  'a planner without leave approval does not approve');
SELECT tests.as_user(tests.user_id('A.x19_stew'));
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_decide(%L, 'approve')$q$, (SELECT id FROM out_ids WHERE k = 'req1')), '42501', 'own_request',
  'nobody approves their own request');
SELECT tests.as_user(tests.user_id('A.x19_approver'));
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_decide(%L, 'approve')$q$, (SELECT id FROM out_ids WHERE k = 'req1')), '22023', 'hod_review_pending',
  'with the step required, the approver waits for the HoD review');
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_decide(%L, 'agree')$q$, (SELECT id FROM out_ids WHERE k = 'req1')), '22023', 'decision_invalid', 'an unknown decision');
SELECT tests.as_user(tests.user_id('A.x19_deck'));
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_decide(%L, 'hod_review')$q$, (SELECT id FROM out_ids WHERE k = 'req1')), '42501', 'not_department_hod',
  'only the head of the stew''s department reviews');
SELECT tests.as_user(tests.user_id('A.x19_chief_stew'));
SELECT tests.is((SELECT r.hod_reviewed_by FROM public.crew_leave_request_decide((SELECT id FROM out_ids WHERE k = 'req1'), 'hod_review') AS r), tests.user_id('A.x19_chief_stew'),
  'the Chief Stew reviews (the request stays pending)');
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_decide(%L, 'hod_review')$q$, (SELECT id FROM out_ids WHERE k = 'req1')), '22023', 'already_reviewed', 'once');
SELECT tests.as_user(tests.user_id('A.x19_approver'));
SELECT tests.is((SELECT r.status FROM public.crew_leave_request_decide((SELECT id FROM out_ids WHERE k = 'req1'), 'approve') AS r), 'approved', 'then the approver approves');
SELECT tests.reset_role();
SELECT tests.results_eq(
  $q$SELECT leave_type_key, start_date - current_date, end_date - current_date, approved_by, request_id, status::text FROM public.frp_rotation_assignments
     WHERE request_id = (SELECT id FROM out_ids WHERE k = 'req1')$q$,
  $q$VALUES ('holiday', 120, 125, tests.user_id('A.x19_approver'), (SELECT id FROM out_ids WHERE k = 'req1'), 'confirmed'),
            ('emergency', 130, 131, tests.user_id('A.x19_approver'), (SELECT id FROM out_ids WHERE k = 'req1'), 'confirmed')$q$,
  'approval creates one confirmed period per request period, tagged with the request and the approver');
SELECT tests.is(pg_temp.codes('A.x19_stew', 120, 131), pg_temp.rep('L', 6) || ',-,-,-,-,E,E', 'their day codes: L and E');
SELECT tests.is((SELECT reviewed_by FROM public.crew_leave_requests WHERE id = (SELECT id FROM out_ids WHERE k = 'req1')), tests.user_id('A.x19_approver'), 'the reviewer is stamped');
INSERT INTO out_ids SELECT 'req1_hol', a.id FROM public.frp_rotation_assignments AS a WHERE a.request_id = (SELECT id FROM out_ids WHERE k = 'req1') AND a.leave_type_key = 'holiday';
SELECT tests.as_user(tests.user_id('A.x19_approver'));
SELECT tests.throws_like(format($q$SELECT public.planner_period_upsert(%L, %L, %L, 'holiday', current_date + 120, current_date + 126)$q$,
  tests.vessel_id('A.dra'), (SELECT id FROM out_ids WHERE k = 'req1_hol'), tests.profile_id('A.x19_stew')),
  '22023', 'period_from_request', 'a period from a request is not changed in the planner');
SELECT tests.throws_like(format($q$SELECT public.planner_period_delete(%L, %L)$q$,
  tests.vessel_id('A.dra'), (SELECT id FROM out_ids WHERE k = 'req1_hol')),
  '22023', 'period_from_request', 'nor removed there');
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_decide(%L, 'approve')$q$, (SELECT id FROM out_ids WHERE k = 'req1')), '22023', 'illegal_transition', 'approved twice');
SELECT tests.as_user(tests.user_id('A.x19_stew'));
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_decide(%L, 'cancel')$q$, (SELECT id FROM out_ids WHERE k = 'req1')), '42501', 'ask_approver',
  'the requester does not cancel approved leave');
SELECT tests.as_user(tests.user_id('A.x19_approver'));
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_decide(%L, 'cancel')$q$, (SELECT id FROM out_ids WHERE k = 'req1')), '22023', 'reason_required',
  'an approver cancels with a reason');
SELECT tests.is((SELECT r.status FROM public.crew_leave_request_decide((SELECT id FROM out_ids WHERE k = 'req1'), 'cancel', 'Trip cancelled') AS r), 'cancelled', 'cancelled after approval');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.frp_rotation_assignments WHERE request_id = (SELECT id FROM out_ids WHERE k = 'req1')), 0::bigint, 'its periods are removed');
SELECT tests.is(pg_temp.codes('A.x19_stew', 120, 131), pg_temp.rep('-', 12), 'and their day codes reversed');
SELECT tests.is((SELECT cancellation_reason FROM public.crew_leave_requests WHERE id = (SELECT id FROM out_ids WHERE k = 'req1')), 'Trip cancelled', 'the reason is kept');

-- Decline (a reason) and the requester's cancel while pending.
SELECT tests.as_user(tests.user_id('A.x19_stew'));
INSERT INTO out_ids SELECT 'req2', r.id FROM public.crew_leave_request_submit(tests.vessel_id('A.dra'),
  jsonb_build_array(jsonb_build_object('leave_type_key', 'holiday', 'start_date', current_date + 150, 'end_date', current_date + 152))) AS r;
INSERT INTO out_ids SELECT 'req3', r.id FROM public.crew_leave_request_submit(tests.vessel_id('A.dra'),
  jsonb_build_array(jsonb_build_object('leave_type_key', 'rotation', 'start_date', current_date + 170, 'end_unknown', true))) AS r;
SELECT tests.is((SELECT r.status FROM public.crew_leave_request_decide((SELECT id FROM out_ids WHERE k = 'req3'), 'cancel') AS r), 'cancelled',
  'the requester cancels a pending request (no reason needed)');
SELECT tests.as_user(tests.user_id('A.x19_approver'));
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_decide(%L, 'decline')$q$, (SELECT id FROM out_ids WHERE k = 'req2')), '22023', 'reason_required', 'declining needs a reason');
INSERT INTO out_rows SELECT 'decline', to_jsonb(r) FROM public.crew_leave_request_decide((SELECT id FROM out_ids WHERE k = 'req2'), 'decline', 'Short-handed that week') AS r;
SELECT tests.is((SELECT r ->> 'status' || ' / ' || (r ->> 'cancellation_reason') FROM out_rows WHERE k = 'decline'), 'declined / Short-handed that week', 'declined with its reason');
SELECT tests.as_user(tests.user_id('A.x19_chief_stew'));
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_decide(%L, 'hod_review')$q$, (SELECT id FROM out_ids WHERE k = 'req2')), '22023', 'illegal_transition',
  'a decided request is not reviewed');
SELECT tests.reset_role();

-- A fleet approver does not wait for the HoD review.
SELECT tests.as_user(tests.user_id('A.x19_stew'));
INSERT INTO out_ids SELECT 'req4', r.id FROM public.crew_leave_request_submit(tests.vessel_id('A.dra'),
  jsonb_build_array(jsonb_build_object('leave_type_key', 'compassionate', 'start_date', current_date + 140, 'end_date', current_date + 142))) AS r;
SELECT tests.as_user(tests.user_id('A.x19_ext'));
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_decide(%L, 'approve')$q$, (SELECT id FROM out_ids WHERE k = 'req4')), '42501', 'not_permitted',
  'an external viewer holding leave approval does not approve');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws(format($q$SELECT public.crew_leave_request_decide(%L, 'approve')$q$, (SELECT id FROM out_ids WHERE k = 'req4')), 'P0002', 'an inactive approver finds no request');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws(format($q$SELECT public.crew_leave_request_decide(%L, 'approve')$q$, (SELECT id FROM out_ids WHERE k = 'req4')), 'P0002', 'another tenant finds no request');
SELECT tests.throws(format($q$SELECT public.crew_leave_request_decide(%L, 'approve')$q$, tests.id('req:nowhere')), 'P0002', 'an unknown request');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is((SELECT r.status FROM public.crew_leave_request_decide((SELECT id FROM out_ids WHERE k = 'req4'), 'approve') AS r), 'approved',
  'the fleet manager approves without the HoD review');
SELECT tests.reset_role();
SELECT tests.is(pg_temp.codes('A.x19_stew', 140, 142), 'CL,CL,CL', 'compassionate leave writes CL');

-- Approval over rotation leave: refused, then replacing it.
SELECT tests.as_user(tests.user_id('A.x19_planner'));
INSERT INTO out_ids SELECT 'stew_rot', p.id FROM public.planner_period_upsert(tests.vessel_id('A.dra'), NULL, tests.profile_id('A.x19_stew'), 'rotation', current_date + 240, current_date + 260) AS p;
SELECT tests.as_user(tests.user_id('A.x19_stew'));
INSERT INTO out_ids SELECT 'req5', r.id FROM public.crew_leave_request_submit(tests.vessel_id('A.dra'),
  jsonb_build_array(jsonb_build_object('leave_type_key', 'holiday', 'start_date', current_date + 250, 'end_date', current_date + 252))) AS r;
SELECT tests.as_user(tests.user_id('A.x19_chief_stew'));
SELECT tests.lives(format($q$SELECT public.crew_leave_request_decide(%L, 'hod_review')$q$, (SELECT id FROM out_ids WHERE k = 'req5')), 'the HoD reviews req5');
SELECT tests.as_user(tests.user_id('A.x19_approver'));
SELECT tests.throws_like(format($q$SELECT public.crew_leave_request_decide(%L, 'approve')$q$, (SELECT id FROM out_ids WHERE k = 'req5')), '22023', 'period_overlap',
  'approval over rotation leave is refused without replace');
SELECT tests.is((SELECT status FROM public.crew_leave_requests WHERE id = (SELECT id FROM out_ids WHERE k = 'req5')), 'pending', 'the refused approval leaves the request pending');
SELECT tests.lives(format($q$SELECT public.crew_leave_request_decide(%L, 'approve', NULL, true)$q$, (SELECT id FROM out_ids WHERE k = 'req5')), 'and replaces it when asked');
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT * FROM pg_temp.periods('A.x19_stew') WHERE s >= 240$q$,
  $q$VALUES ('rotation', 240, 249), ('holiday', 250, 252), ('rotation', 253, 260)$q$, 'the rotation leave is split around the holiday');
SELECT tests.is(pg_temp.codes('A.x19_stew', 248, 254), 'R,R,L,L,L,R,R', 'and the day codes follow');

-- A legacy request (no periods) is approved as one period; a legacy approved one's codes are reversed on cancel.
SELECT tests.as_user(tests.user_id('A.x19_chief_stew'));
SELECT tests.lives(format($q$SELECT public.crew_leave_request_decide(%L, 'hod_review')$q$, tests.id('req:legacy')), 'the HoD reviews the legacy request');
SELECT tests.as_user(tests.user_id('A.x19_approver'));
SELECT tests.lives(format($q$SELECT public.crew_leave_request_decide(%L, 'approve')$q$, tests.id('req:legacy')), 'the approver approves it');
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT leave_type_key, start_date - current_date, end_date - current_date FROM public.frp_rotation_assignments WHERE request_id = tests.id('req:legacy')$q$,
  $q$VALUES ('rotation', 270, 272)$q$, 'a legacy request becomes one period of the type its code stands for (R: rotation leave)');
SELECT set_config('storm.crew_engine', 'on', true);
INSERT INTO public.crew_leave_requests (id, crew_id, leave_type, start_date, end_date, status, company_id, vessel_id, reviewed_by, reviewed_at)
VALUES (tests.id('req:legacy_approved'), tests.user_id('A.x19_stew'), 'L', current_date + 280, current_date + 281, 'approved', tests.company_id('A'), tests.vessel_id('A.dra'),
        tests.user_id('A.x19_approver'), now());
SELECT set_config('storm.crew_engine', '', true);
INSERT INTO public.crew_leave_entries (crew_id, date, status_code, company_id, vessel_id)
VALUES (tests.user_id('A.x19_stew'), current_date + 280, 'L', tests.company_id('A'), tests.vessel_id('A.dra')),
       (tests.user_id('A.x19_stew'), current_date + 281, 'L', tests.company_id('A'), tests.vessel_id('A.dra'));
SELECT tests.as_user(tests.user_id('A.x19_approver'));
SELECT tests.lives(format($q$SELECT public.crew_leave_request_decide(%L, 'cancel', 'Rescheduled')$q$, tests.id('req:legacy_approved')), 'cancelling a legacy approved request');
SELECT tests.reset_role();
SELECT tests.is(pg_temp.codes('A.x19_stew', 280, 281), '-,-', 'reverses the day codes the legacy page wrote');

-- ------------------------------------------------------------ 6. Add leave (planner_add_leave)

SELECT tests.as_user(tests.user_id('A.x19_approver'));
INSERT INTO out_ids SELECT 'add1', a.request_id FROM public.planner_add_leave(tests.vessel_id('A.dra'), tests.profile_id('A.x19_cook'),
  jsonb_build_array(jsonb_build_object('leave_type_key', 'holiday', 'start_date', current_date + 20, 'end_date', current_date + 22)), 'Added by the office') AS a
WHERE a.status = 'approved' AND cardinality(a.period_ids) = 1;
SELECT tests.reset_role();
SELECT tests.ok((SELECT id FROM out_ids WHERE k = 'add1') IS NOT NULL, 'an approver''s Add leave for someone else is saved Approved, with its period');
SELECT tests.results_eq($q$SELECT status, reviewed_by, crew_id FROM public.crew_leave_requests WHERE id = (SELECT id FROM out_ids WHERE k = 'add1')$q$,
  $q$VALUES ('approved', tests.user_id('A.x19_approver'), tests.user_id('A.x19_cook'))$q$, 'the request records the approver (D-X1-10)');
SELECT tests.results_eq($q$SELECT leave_type_key, approved_by FROM public.frp_rotation_assignments WHERE request_id = (SELECT id FROM out_ids WHERE k = 'add1')$q$,
  $q$VALUES ('holiday', tests.user_id('A.x19_approver'))$q$, 'its period is confirmed and approved');
SELECT tests.is(pg_temp.codes('A.x19_cook', 20, 22), 'L,L,L', 'and writes its day codes');
SELECT tests.as_user(tests.user_id('A.x19_planner'));
INSERT INTO out_rows SELECT 'add_planner', to_jsonb(a) FROM public.planner_add_leave(tests.vessel_id('A.dra'), tests.profile_id('A.x19_cook'),
  jsonb_build_array(jsonb_build_object('leave_type_key', 'holiday', 'start_date', current_date + 30, 'end_date', current_date + 31))) AS a;
SELECT tests.is((SELECT (r ->> 'status') || ' / ' || jsonb_array_length(r -> 'period_ids') FROM out_rows WHERE k = 'add_planner'), 'pending / 0',
  'a planner''s Add leave is a pending request with no period');
SELECT tests.throws_like(format($q$SELECT public.planner_add_leave(%L, %L, '[{"leave_type_key": "rotation", "start_date": "%s", "end_date": "%s"}]'::jsonb)$q$,
  tests.vessel_id('A.dra'), tests.profile_id('A.x19_ghost'), current_date + 30, current_date + 31), '22023', 'request_needs_login',
  'a planner cannot request leave for a crew member without a login');
SELECT tests.throws_like(format($q$SELECT public.planner_add_leave(%L, %L, '[{"leave_type_key": "rotation", "start_date": "%s", "end_date": "%s"}]'::jsonb)$q$,
  tests.vessel_id('A.dra'), tests.profile_id('B.x19_crew'), current_date + 30, current_date + 31), 'P0002', 'person_not_found', 'another company''s person is unknown');
SELECT tests.as_user(tests.user_id('A.x19_approver'));
INSERT INTO out_rows SELECT 'add_own', to_jsonb(a) FROM public.planner_add_leave(tests.vessel_id('A.dra'), tests.profile_id('A.x19_approver'),
  jsonb_build_array(jsonb_build_object('leave_type_key', 'holiday', 'start_date', current_date + 30, 'end_date', current_date + 31))) AS a;
SELECT tests.is((SELECT (r ->> 'status') || ' / ' || jsonb_array_length(r -> 'period_ids') FROM out_rows WHERE k = 'add_own'), 'pending / 0',
  'an approver''s own leave is a pending request (never self-approved)');
INSERT INTO out_rows SELECT 'add_ghost', to_jsonb(a) FROM public.planner_add_leave(tests.vessel_id('A.dra'), tests.profile_id('A.x19_ghost'),
  jsonb_build_array(jsonb_build_object('leave_type_key', 'rotation', 'start_date', current_date + 30, 'end_date', current_date + 40))) AS a;
SELECT tests.is((SELECT (r ->> 'request_id' IS NULL)::text || ' / ' || (r ->> 'status') || ' / ' || jsonb_array_length(r -> 'period_ids') FROM out_rows WHERE k = 'add_ghost'),
  'true / approved / 1', 'an approver adds leave for a crew member without a login: the period, no request');
INSERT INTO out_ids SELECT 'cook_rot', p.id FROM public.planner_period_upsert(tests.vessel_id('A.dra'), NULL, tests.profile_id('A.x19_cook'), 'rotation', current_date + 50, current_date + 60) AS p;
SELECT tests.throws_like(format($q$SELECT public.planner_add_leave(%L, %L, '[{"leave_type_key": "holiday", "start_date": "%s", "end_date": "%s"}]'::jsonb)$q$,
  tests.vessel_id('A.dra'), tests.profile_id('A.x19_cook'), current_date + 55, current_date + 56), '22023', 'period_overlap', 'Add leave over rotation leave is refused without replace');
SELECT tests.lives(format($q$SELECT public.planner_add_leave(%L, %L, '[{"leave_type_key": "holiday", "start_date": "%s", "end_date": "%s"}]'::jsonb, 'Swap', true)$q$,
  tests.vessel_id('A.dra'), tests.profile_id('A.x19_cook'), current_date + 55, current_date + 56), 'and replaces it when asked');
SELECT tests.as_user(tests.user_id('A.x19_viewer'));
SELECT tests.throws_like(format($q$SELECT public.planner_add_leave(%L, %L, '[{"leave_type_key": "rotation", "start_date": "%s", "end_date": "%s"}]'::jsonb)$q$,
  tests.vessel_id('A.dra'), tests.profile_id('A.x19_cook'), current_date + 70, current_date + 71), '42501', 'crew_not_permitted', 'a planner viewer cannot add leave');
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT * FROM pg_temp.periods('A.x19_cook') WHERE s >= 50$q$,
  $q$VALUES ('rotation', 50, 54), ('holiday', 55, 56), ('rotation', 57, 60)$q$, 'replace split the cook''s rotation leave');

-- ------------------------------------------------------------ 7. the On/Off toggle (A.x19_deck2)

SELECT tests.as_user(tests.user_id('A.x19_planner'));
INSERT INTO out_ids SELECT 'off1', t.period_id FROM public.crew_toggle_onboard(tests.vessel_id('A.dra'), tests.profile_id('A.x19_deck2'), 'off') AS t WHERE t.direction = 'off';
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT leave_type_key, start_date - current_date, end_unknown, end_date - current_date FROM public.frp_rotation_assignments WHERE id = (SELECT id FROM out_ids WHERE k = 'off1')$q$,
  $q$VALUES ('rotation', 0, true, 30)$q$, 'Off writes rotation leave from today, end unknown (written to today + 30)');
SELECT tests.results_eq($q$SELECT kind, occurred_on - current_date, source, source_id, vessel_id FROM public.crew_movements WHERE profile_id = tests.profile_id('A.x19_deck2') ORDER BY created_at$q$,
  $q$SELECT 'disembark', 0, 'toggle', (SELECT id FROM out_ids WHERE k = 'off1'), tests.vessel_id('A.dra')$q$, 'and a disembark movement from the toggle');
SELECT tests.is(pg_temp.codes('A.x19_deck2', 0, 30), pg_temp.rep('R', 31), 'its days are R');
SELECT tests.as_user(tests.user_id('A.x19_planner'));
SELECT tests.throws_like(format($q$SELECT public.crew_toggle_onboard(%L, %L, 'off')$q$, tests.vessel_id('A.dra'), tests.profile_id('A.x19_deck2')), '22023', 'already_off', 'off twice');
SELECT tests.is((SELECT t.direction FROM public.crew_toggle_onboard(tests.vessel_id('A.dra'), tests.profile_id('A.x19_deck2'), 'on') AS t), 'on', 'On the same day');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.frp_rotation_assignments WHERE id = (SELECT id FROM out_ids WHERE k = 'off1')), 0::bigint, 'ends a leave that started that day by removing it');
SELECT tests.is(pg_temp.codes('A.x19_deck2', 0, 30), pg_temp.rep('-', 31), 'its day codes are reversed');
SELECT tests.results_eq($q$SELECT kind, source, source_id FROM public.crew_movements WHERE profile_id = tests.profile_id('A.x19_deck2')$q$,
  $q$VALUES ('disembark', 'toggle', (SELECT id FROM out_ids WHERE k = 'off1')), ('embark', 'toggle', (SELECT id FROM out_ids WHERE k = 'off1'))$q$,
  'and writes an embark movement naming the period');
SELECT tests.as_user(tests.user_id('A.x19_planner'));
SELECT tests.throws_like(format($q$SELECT public.crew_toggle_onboard(%L, %L, 'on')$q$, tests.vessel_id('A.dra'), tests.profile_id('A.x19_deck2')), '22023', 'not_on_leave', 'on twice');
SELECT tests.lives(format($q$SELECT public.crew_toggle_onboard(%L, %L, 'off', 'rotation', current_date - 3)$q$, tests.vessel_id('A.dra'), tests.profile_id('A.x19_deck2')),
  'Off three days ago');
SELECT tests.lives(format($q$SELECT public.crew_toggle_onboard(%L, %L, 'on')$q$, tests.vessel_id('A.dra'), tests.profile_id('A.x19_deck2')), 'On today');
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT * FROM pg_temp.periods('A.x19_deck2')$q$, $q$VALUES ('rotation', -3, -1)$q$, 'On ends the leave yesterday (end now known)');
SELECT tests.is(pg_temp.codes('A.x19_deck2', -3, 2), 'R,R,R,-,-,-', 'the day codes stop yesterday');
SELECT tests.as_user(tests.user_id('A.x19_planner'));
SELECT tests.lives(format($q$SELECT public.planner_period_upsert(%L, NULL, %L, 'on_board', current_date + 1, current_date + 20)$q$, tests.vessel_id('A.dra'), tests.profile_id('A.x19_deck2')),
  'an On board period from tomorrow');
SELECT tests.lives(format($q$SELECT public.crew_toggle_onboard(%L, %L, 'off', 'travel', current_date + 5, current_date + 6)$q$, tests.vessel_id('A.dra'), tests.profile_id('A.x19_deck2')),
  'Off on day 5 for two days of travel');
SELECT tests.reset_role();
SELECT tests.results_eq($q$SELECT * FROM pg_temp.periods('A.x19_deck2') WHERE s >= 0$q$, $q$VALUES ('on_board', 1, 4), ('travel', 5, 6)$q$,
  'Off ends the On board period the day before');
SELECT tests.as_user(tests.user_id('A.x19_planner'));
SELECT tests.throws_like(format($q$SELECT public.crew_toggle_onboard(%L, %L, 'off', 'holiday', current_date + 10)$q$, tests.vessel_id('A.dra'), tests.profile_id('A.x19_deck2')),
  '42501', 'leave_approval_required', 'Off as a holiday needs leave approval');
SELECT tests.throws_like(format($q$SELECT public.crew_toggle_onboard(%L, %L, 'off', 'on_board', current_date + 10)$q$, tests.vessel_id('A.dra'), tests.profile_id('A.x19_deck2')),
  '22023', 'leave_type_invalid', 'Off is time off');
SELECT tests.throws_like(format($q$SELECT public.crew_toggle_onboard(%L, %L, 'off')$q$, tests.vessel_id('A.dra'), tests.profile_id('A.x19_ghost')),
  '22023', 'person_not_on_vessel', 'a crew member without an assignment here is not toggled');
SELECT tests.throws_like(format($q$SELECT public.crew_toggle_onboard(%L, %L, 'sideways')$q$, tests.vessel_id('A.dra'), tests.profile_id('A.x19_deck2')),
  '22023', 'direction_invalid', 'on or off only');
SELECT tests.throws_like(format($q$SELECT public.crew_toggle_onboard(%L, %L, 'off', 'rotation', current_date + 40)$q$, tests.vessel_id('A.dra'), tests.profile_id('A.x19_deck2')),
  '22023', 'date_out_of_range', 'within a month of today');
SELECT tests.throws_like(format($q$SELECT public.crew_toggle_onboard(%L, %L, 'off')$q$, tests.vessel_id('A.dra'), tests.profile_id('B.x19_crew')),
  'P0002', 'person_not_found', 'another company''s person');
SELECT tests.as_user(tests.user_id('A.x19_viewer'));
SELECT tests.throws(format($q$SELECT public.crew_toggle_onboard(%L, %L, 'off')$q$, tests.vessel_id('A.dra'), tests.profile_id('A.x19_deck2')), '42501', 'a viewer does not toggle');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 8. manning by day (A.gam) and the vessel's periods

SELECT tests.seed_user('A', 'A.x19_g1', 'crew');
SELECT tests.seed_user('A', 'A.x19_g2', 'crew');
SELECT tests.seed_user('A', 'A.x19_g3', 'crew');
SELECT tests.seed_user('A', 'A.x19_gb', 'crew');
SELECT tests.seed_user('A', 'A.x19_gx', 'crew');
SELECT tests.seed_user('A', 'A.x19_relief', 'crew', 'active', '{"position": "Deckhand"}');
SELECT tests.seed_assignment(k, 'A.gam', true, 'Deckhand') FROM unnest(ARRAY['A.x19_g1', 'A.x19_g2', 'A.x19_g3']) AS k;
SELECT tests.seed_assignment('A.x19_gb', 'A.gam', true, 'Bosun');
SELECT tests.seed_assignment('A.x19_gx', 'A.gam', true, 'Underwater Welder');
SELECT tests.seed_assignment('A.x19_relief', 'A.hyd', true, 'Deckhand');
INSERT INTO public.position_manning (company_id, vessel_id, position_id, is_listed, min_on_board, max_on_board) VALUES
  (tests.company_id('A'), tests.vessel_id('A.gam'), pg_temp.pos('deckhand'), true, 2, 2),
  (tests.company_id('A'), tests.vessel_id('A.gam'), pg_temp.pos('bosun'), true, 0, 0),
  (tests.company_id('A'), tests.vessel_id('A.gam'), pg_temp.pos('master'), true, 1, NULL),
  (tests.company_id('A'), tests.vessel_id('A.gam'), pg_temp.pos('cook'), true, 0, NULL)
ON CONFLICT (vessel_id, position_id) DO UPDATE SET is_listed = true, min_on_board = EXCLUDED.min_on_board, max_on_board = EXCLUDED.max_on_board;
INSERT INTO public.crew_requirement_rows (id, vessel_id, group_key, label, kind, sort_order)
VALUES (tests.id('x19row:bst'), tests.vessel_id('A.gam'), 'custom', 'Basic safety', 'document', 10);
INSERT INTO public.crew_requirement_options (row_id, document_type_id) VALUES (tests.id('x19row:bst'), pg_temp.ty('stcw_basic_safety'));
INSERT INTO public.crew_requirement_positions (row_id, position_id) VALUES (tests.id('x19row:bst'), pg_temp.pos('deckhand'));
INSERT INTO public.crew_certificates (id, user_id, profile_id, certificate_type, certificate_name, expiry_date, document_type_id, verification_status, file_path, status)
SELECT tests.id('x19doc:' || x.k), p.user_id, p.id, t.name, t.name, current_date + x.days, t.id, 'verified',
       p.company_id::text || '/crew/' || p.id::text || '/documents/' || tests.id('x19doc:' || x.k)::text || '-scan.pdf', 'Valid'
FROM (VALUES ('A.x19_g1', 200), ('A.x19_g2', 5)) AS x(k, days)
JOIN public.profiles AS p ON p.id = tests.profile_id(x.k)
JOIN public.crew_document_types AS t ON t.id = pg_temp.ty('stcw_basic_safety');
CREATE TEMP TABLE man ON COMMIT DROP AS SELECT * FROM public.planner_manning_rows(tests.vessel_id('A.gam'), tests.company_id('A'), current_date, current_date) LIMIT 0;
GRANT ALL ON man TO PUBLIC;
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format($q$SELECT public.planner_period_upsert(%L, NULL, %L, 'rotation', current_date + 10, current_date + 12)$q$, tests.vessel_id('A.gam'), tests.profile_id('A.x19_g2')),
  'g2 is on rotation leave on days 10 to 12');
SELECT tests.lives(format($q$SELECT public.planner_period_upsert(%L, NULL, %L, 'on_board', current_date + 22, current_date + 25)$q$, tests.vessel_id('A.gam'), tests.profile_id('A.x19_relief')),
  'a relief deckhand (assigned elsewhere) is on board GAME CHANGER on days 22 to 25');
INSERT INTO man SELECT * FROM public.vessel_manning_by_day(tests.vessel_id('A.gam'), current_date, current_date + 30);
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM man), 155::bigint, '31 days x 5 positions (four listed and the unmatched titles)');
SELECT tests.results_eq(
  $q$SELECT day - current_date, aboard, qualified, min_on_board, max_on_board, short_by, band FROM man WHERE position_id = md5('storm.position.deckhand')::uuid AND day - current_date IN (0, 7, 11, 22)$q$,
  $q$VALUES (0, 3, 2, 2, 2, 0, 'at_minimum'), (7, 3, 1, 2, 2, 1, 'critical'), (11, 2, 1, 2, 2, 1, 'critical'), (22, 4, 1, 2, 2, 1, 'critical')$q$,
  'deckhands: 3 aboard and 2 qualified today (at minimum, before overmanned); g2''s certificate expires on day 5; g2 is off on day 11; the relief counts aboard on day 22 but is not qualified');
SELECT tests.results_eq(
  $q$SELECT DISTINCT position_key, aboard, qualified, short_by, band FROM man WHERE position_key IN ('bosun', 'master', 'cook') OR position_id IS NULL ORDER BY 1 NULLS LAST$q$,
  $q$VALUES ('bosun', 1, 1, 0, 'overmanned'), ('cook', 0, 0, 0, 'normal'), ('master', 0, 0, 1, 'critical'), (NULL::text, 1, 1, 0, 'normal')$q$,
  'the bosun above a maximum of 0 is overmanned, nobody as Master is critical, an empty unrequired position is normal, the unmatched title has its own row');
SELECT tests.is((SELECT position_name FROM man WHERE position_key = 'deckhand' LIMIT 1), (SELECT name FROM public.positions WHERE id = md5('storm.position.deckhand')::uuid),
  'rows carry the position''s name');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format($q$SELECT * FROM public.vessel_manning_by_day(%L, current_date, current_date + 400)$q$, tests.vessel_id('A.gam')), '22023', 'range_too_long', 'at most 400 days');
SELECT tests.lives(format($q$SELECT * FROM public.vessel_manning_by_day(%L, current_date, current_date + 399)$q$, tests.vessel_id('A.gam')), '400 days are fine');
SELECT tests.throws_like(format($q$SELECT * FROM public.vessel_manning_by_day(%L, current_date, current_date - 1)$q$, tests.vessel_id('A.gam')), '22023', 'range_invalid', 'an end before the start');
SELECT tests.throws_like(format($q$SELECT * FROM public.vessel_manning_by_day(%L, NULL, current_date)$q$, tests.vessel_id('A.gam')), '22023', 'range_required', 'a range');
SELECT tests.throws_like(format($q$SELECT * FROM public.vessel_manning_by_day(%L, current_date, current_date)$q$, tests.id('vessel:nowhere')), 'P0002', 'vessel_not_found', 'an unknown vessel');
SELECT tests.as_user(tests.user_id('A.x19_viewer'));
SELECT tests.throws(format($q$SELECT * FROM public.vessel_manning_by_day(%L, current_date, current_date)$q$, tests.vessel_id('A.gam')), '42501', 'a viewer of another vessel');
SELECT tests.as_user(tests.user_id('A.x19_ext'));
SELECT tests.throws(format($q$SELECT * FROM public.vessel_manning_by_day(%L, current_date, current_date)$q$, tests.vessel_id('A.dra')), '42501', 'an external viewer');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws(format($q$SELECT * FROM public.vessel_manning_by_day(%L, current_date, current_date)$q$, tests.vessel_id('A.dra')), '42501', 'an inactive user');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws(format($q$SELECT * FROM public.vessel_manning_by_day(%L, current_date, current_date)$q$, tests.vessel_id('A.gam')), '42501', 'another tenant');
SELECT tests.as_anon();
SELECT tests.throws(format($q$SELECT * FROM public.vessel_manning_by_day(%L, current_date, current_date)$q$, tests.vessel_id('A.gam')), '42501', 'anon');
SELECT tests.reset_role();

-- The vessel's periods (the timeline's read).
SELECT tests.as_user(tests.user_id('A.x19_viewer'));
SELECT tests.results_eq(
  $q$SELECT leave_type_key, start_date - current_date, end_unknown, effective_end - current_date, first_name IS NOT NULL
     FROM public.planner_vessel_periods(tests.vessel_id('A.dra'), current_date, current_date + 100) WHERE profile_id = tests.profile_id('A.x19_deck') ORDER BY start_date$q$,
  $q$VALUES ('rotation', 5, true, 39, true), ('on_board', 40, false, 50, true), ('rotation', 61, false, 64, true), ('travel', 65, false, 65, true),
            ('rotation', 67, false, 80, true), ('holiday', 100, false, 105, true)$q$,
  'a planner viewer reads the vessel''s periods with the effective end of an end-unknown period and the names');
SELECT tests.throws_like(format($q$SELECT * FROM public.planner_vessel_periods(%L, current_date, current_date + 800)$q$, tests.vessel_id('A.dra')), '22023', 'range_too_long', 'two years at most');
SELECT tests.throws(format($q$SELECT * FROM public.planner_vessel_periods(%L, current_date, current_date + 10)$q$, tests.vessel_id('A.gam')), '42501', 'not on a vessel the viewer does not read');
SELECT tests.as_user(tests.user_id('A.x19_stew'));
SELECT tests.throws(format($q$SELECT * FROM public.planner_vessel_periods(%L, current_date, current_date + 10)$q$, tests.vessel_id('A.dra')), '42501', 'crew without planner access read no periods');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 9. RLS of the request periods

SELECT tests.as_user(tests.user_id('A.x19_approver'));
SELECT tests.is((SELECT count(*) FROM public.crew_leave_request_periods WHERE request_id = (SELECT id FROM out_ids WHERE k = 'req1')), 2::bigint, 'company members read a request''s periods');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is((SELECT count(*) FROM public.crew_leave_request_periods), 0::bigint, 'another tenant reads none');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is((SELECT count(*) FROM public.crew_leave_request_periods), 0::bigint, 'an inactive user reads none');
SELECT tests.as_anon();
SELECT tests.denied($q$SELECT * FROM public.crew_leave_request_periods$q$, 'anon reads none');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 10. grants

SELECT tests.ok(has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE'), 'browser RPC: ' || f)
FROM unnest(ARRAY['public.planner_period_upsert(uuid, uuid, uuid, text, date, date, boolean, text, boolean, integer)', 'public.planner_period_delete(uuid, uuid)',
                  'public.planner_add_leave(uuid, uuid, jsonb, text, boolean)', 'public.crew_leave_request_submit(uuid, jsonb, text)',
                  'public.crew_leave_request_decide(uuid, text, text, boolean)', 'public.planner_leave_settings_save(uuid, text)',
                  'public.crew_toggle_onboard(uuid, uuid, text, text, date, date, boolean)', 'public.vessel_manning_by_day(uuid, date, date)',
                  'public.planner_vessel_periods(uuid, date, date)']) AS f;
SELECT tests.ok(NOT has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE')
                AND has_function_privilege('service_role', f, 'EXECUTE'), 'internal: ' || f)
FROM unnest(ARRAY['public.frp_periods_extend_open(date)', 'public.planner_leave_type_for_rotation(text)', 'public.planner_rotation_type_for_leave(text)',
                  'public.planner_periods_overlap(date, date, date, date)', 'public.planner_open_horizon(date, date, date)',
                  'public.planner_manning_band(integer, integer, integer, integer)',
                  'public.planner_leave_decide_check(text, text, boolean, boolean, boolean, boolean, text, boolean, boolean)',
                  'public.planner_day_locked(uuid, uuid, date)', 'public.planner_person_materialise(uuid, date, date)', 'public.planner_gate(text, uuid, text)',
                  'public.planner_person_company(uuid, uuid)', 'public.planner_is_department_hod(uuid, uuid, uuid)', 'public.planner_periods_parse(jsonb)',
                  'public.planner_reflow_open(uuid, date)',
                  'public.planner_period_write(uuid, uuid, uuid, uuid, text, date, date, boolean, text, boolean, uuid, boolean, uuid)',
                  'public.planner_request_create(uuid, uuid, uuid, uuid, jsonb, text, uuid)', 'public.planner_manning_rows(uuid, uuid, date, date)']) AS f;
SELECT tests.ok(NOT has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('service_role', f, 'EXECUTE'), 'trigger function: ' || f)
FROM unnest(ARRAY['public.frp_rotation_assignments_status_guard()', 'public.frp_periods_materialise()', 'public.crew_leave_entries_source_guard()',
                  'public.crew_leave_requests_status_guard()', 'public.crew_leave_request_periods_scope_guard()', 'public.crew_leave_settings_scope_guard()']) AS f;
SELECT tests.ok(has_table_privilege('authenticated', t, 'SELECT') AND NOT has_table_privilege('authenticated', t, 'INSERT')
                AND NOT has_table_privilege('authenticated', t, 'UPDATE') AND NOT has_table_privilege('authenticated', t, 'DELETE')
                AND NOT has_table_privilege('anon', t, 'SELECT'), 'relation: read only for the browser, nothing for anon: ' || t)
FROM unnest(ARRAY['public.leave_types', 'public.crew_leave_request_periods', 'public.crew_leave_settings']) AS t;
SELECT tests.ok((SELECT prosecdef AND proconfig::text LIKE '%search_path=public%' FROM pg_proc WHERE oid = f::regprocedure), 'definer with search_path: ' || f)
FROM unnest(ARRAY['public.planner_period_upsert(uuid, uuid, uuid, text, date, date, boolean, text, boolean, integer)', 'public.planner_period_delete(uuid, uuid)',
                  'public.planner_add_leave(uuid, uuid, jsonb, text, boolean)', 'public.crew_leave_request_submit(uuid, jsonb, text)',
                  'public.crew_leave_request_decide(uuid, text, text, boolean)', 'public.planner_leave_settings_save(uuid, text)',
                  'public.crew_toggle_onboard(uuid, uuid, text, text, date, date, boolean)', 'public.vessel_manning_by_day(uuid, date, date)',
                  'public.planner_vessel_periods(uuid, date, date)', 'public.frp_periods_extend_open(date)', 'public.frp_periods_materialise()',
                  'public.frp_rotation_assignments_status_guard()', 'public.crew_leave_requests_status_guard()']) AS f;
SELECT tests.ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t AND NOT tgisinternal), 'trigger present: ' || t)
FROM unnest(ARRAY['frp_rotation_assignments_status_guard', 'frp_periods_materialise', 'crew_leave_entries_source_guard', 'crew_leave_requests_status_guard',
                  'crew_leave_request_periods_scope_guard', 'crew_leave_settings_scope_guard']) AS t;
