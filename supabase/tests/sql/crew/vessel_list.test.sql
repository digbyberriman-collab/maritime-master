-- The vessel crew list, derived status, movements and the transfers table
-- (X1-02, 20261124060200_crew_vessel_list.sql; gap/04 C3, C4, C7, C9, C11;
-- DECISIONS D-X1-4, D-X1-8, D-199, D-225, D-227):
--   1. crew_status_decide parity with the TS mirror on every case of
--      src/test/crew/fixtures/crewStatusCases.json;
--   2. membership (crew_vessel_members): current, planned and pending
--      placements listed; ended, stale, another company's and fulfilled
--      placements left out; the as-at day decides (a future day lists the
--      planned joiner as joined and drops a leaver);
--   3. crew_vessel_list: the columns (position and department through the
--      positions catalogue and the vessel's rank order, status and detail,
--      leave code, travel today, login state, newest invitation, Master
--      office), the order, the as-at range, and email only with
--      crew_profiles.view (own row always);
--   4. the gates: unknown vessel P0002; another tenant, no reach, no
--      capability, an inactive caller and an external viewer 42501; anon has
--      no grant;
--   5. crew_vessel_movements: stored rows, embark / disembark derived from
--      assignment dates, de-duplicated by source and by person, day and
--      direction; the range rules;
--   6. RLS on crew_movements and crew_transfers (crew_list.view /
--      crew_assignments.view, the person's own transfer, no external, no
--      inactive, no anon, no browser writes) and the integrity guards;
--   7. the transfer status guard (engine flag; service role and no JWT
--      exempt);
--   8. grants (the internals are not executable by authenticated; anon has
--      nothing), since the platform ACL inventory reads the fragment too.

\set cases `cat src/test/crew/fixtures/crewStatusCases.json`
CREATE TEMP TABLE fx ON COMMIT DROP AS SELECT :'cases'::jsonb AS cases;
GRANT SELECT ON fx TO PUBLIC;

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ 1. status parity (crewStatusCases.json)

SELECT tests.ok((SELECT jsonb_array_length(cases -> 'cases') FROM fx) >= 500,
  format('%s status cases', (SELECT jsonb_array_length(cases -> 'cases') FROM fx)));
SELECT tests.is_empty(
  $q$SELECT c FROM fx, jsonb_array_elements(cases -> 'cases') AS c
     WHERE public.crew_status_decide((c ->> 'transferActive')::boolean, c ->> 'placementKind', c ->> 'leaveCode', c ->> 'inOutLast')
           IS DISTINCT FROM c ->> 'expect'$q$,
  'crew_status_decide gives the expected status for every case of crewStatusCases.json (the TS mirror passes the same cases)');
SELECT tests.results_eq(
  $q$SELECT DISTINCT c ->> 'expect' FROM fx, jsonb_array_elements(cases -> 'cases') AS c ORDER BY 1$q$,
  $q$VALUES ('ashore'), ('on_board'), ('on_leave'), ('on_transfer'), ('pending')$q$,
  'the cases reach every status');
SELECT tests.is(public.crew_status_decide(NULL, NULL, NULL, NULL), 'on_board', 'nothing known: on board');
SELECT tests.is(public.crew_status_decide(true, 'pending_placement', 'L', 'out'), 'on_transfer', 'a transfer wins over everything');

-- ------------------------------------------------------------ world (A.dra unless named)

-- Crew with a login.
SELECT tests.seed_user('A', 'A.bosun', 'crew');        -- on board, day code F, travel today
SELECT tests.seed_user('A', 'A.stew', 'crew');         -- on leave (day code L)
SELECT tests.seed_user('A', 'A.joiner', 'crew');       -- planned: joins in 10 days
SELECT tests.seed_user('A', 'A.leaver', 'crew');       -- leaves in 5 days
SELECT tests.seed_user('A', 'A.ended', 'crew');        -- ended yesterday (is_current false)
SELECT tests.seed_user('A', 'A.stale', 'crew');        -- is_current but its leave date has passed
SELECT tests.seed_user('A', 'A.mover', 'crew');        -- transferring from A.hyd to A.dra
SELECT tests.seed_user('A', 'A.cook', 'crew', 'active', '{"department": "Galley"}');  -- title maps to nothing, department from the profile
SELECT tests.seed_user('A', 'A.lister', 'crew');       -- crew_list.view through the legacy flag only (no crew_profiles.view)
SELECT tests.seed_user('A', 'A.ext', 'crew');          -- an external viewer of A on A.dra
SELECT tests.seed_user('A', 'A.placed_elsewhere', 'crew');  -- imported to A.dra but already assigned to A.gam
SELECT tests.seed_assignment('A.bosun', 'A.dra', true, 'Bosun', '{"department": "Deck"}');
SELECT tests.seed_assignment('A.stew', 'A.dra', true, 'Crew', '{"rank": "Second Stewardess", "department": "Interior"}');
SELECT tests.seed_assignment('A.joiner', 'A.dra', true, 'Deckhand', jsonb_build_object('join_date', current_date + 10, 'start_date', current_date + 10));
SELECT tests.seed_assignment('A.leaver', 'A.dra', true, 'Deckhand', jsonb_build_object('leave_date', current_date + 5));
SELECT tests.seed_assignment('A.ended', 'A.dra', false, 'Deckhand');
ALTER TABLE public.crew_assignments DISABLE TRIGGER trg_crew_assignments_normalise_dates;
SELECT tests.seed_assignment('A.stale', 'A.dra', true, 'Deckhand', jsonb_build_object('leave_date', current_date - 2, 'end_date', current_date - 2));
ALTER TABLE public.crew_assignments ENABLE TRIGGER trg_crew_assignments_normalise_dates;
SELECT tests.seed_assignment('A.mover', 'A.hyd', false, 'Deckhand', jsonb_build_object('leave_date', current_date - 1));
SELECT tests.seed_assignment('A.mover', 'A.dra', true, 'Deckhand', jsonb_build_object('join_date', current_date + 2, 'start_date', current_date + 2));
SELECT tests.seed_assignment('A.cook', 'A.dra', true, 'Underwater Welder');
SELECT tests.seed_assignment('A.lister', 'A.dra', true, 'Deckhand');
SELECT tests.seed_assignment('A.placed_elsewhere', 'A.gam', true, 'Deckhand');
UPDATE public.profiles SET is_imported = true, imported_vessel_id = tests.vessel_id('A.dra') WHERE id = tests.profile_id('A.placed_elsewhere');

-- Pending placements (no login): one with a rank and a joining date, one with nothing.
SELECT tests.seed_profile('A', 'A.pending', 'crew', 'not_invited', NULL,
  jsonb_build_object('is_imported', true, 'imported_vessel_id', tests.vessel_id('A.dra'), 'rank', 'Deckhand', 'joining_date', current_date + 3, 'nationality', 'Dutch'));
SELECT tests.seed_profile('A', 'A.pending_bare', 'crew', 'invited', NULL,
  jsonb_build_object('is_imported', true, 'imported_vessel_id', tests.vessel_id('A.dra'), 'created_at', '2026-10-01T08:00:00Z'));
-- Another company's imported profile pointing at A.dra: never on A's list.
SELECT tests.seed_profile('B', 'B.misplaced', 'crew', 'not_invited', NULL,
  jsonb_build_object('is_imported', true, 'imported_vessel_id', tests.vessel_id('A.dra')));

-- Positions: DRAAK ranks the Bosun first (vessel override).
INSERT INTO public.position_manning (company_id, vessel_id, position_id, sort_order, is_listed, min_on_board)
VALUES (tests.company_id('A'), tests.vessel_id('A.dra'), md5('storm.position.bosun')::uuid, 5, true, 1)
ON CONFLICT (vessel_id, position_id) DO UPDATE SET sort_order = 5;

-- Leave planner day codes, travel, a scheduled transfer, invitations.
INSERT INTO public.crew_leave_entries (crew_id, date, status_code, company_id, vessel_id) VALUES
  (tests.user_id('A.bosun'), current_date, 'F', tests.company_id('A'), tests.vessel_id('A.dra')),
  (tests.user_id('A.stew'), current_date, 'L', tests.company_id('A'), tests.vessel_id('A.dra')),
  (tests.user_id('A.stew'), current_date + 10, 'F', tests.company_id('A'), tests.vessel_id('A.dra'));
INSERT INTO public.frp_travel_movements (company_id, crew_user_id, vessel_id, direction, changeover_date) VALUES
  (tests.company_id('A'), tests.user_id('A.bosun'), tests.vessel_id('A.dra'), 'departure', current_date),
  (tests.company_id('A'), tests.user_id('A.stew'), tests.vessel_id('A.dra'), 'arrival', current_date + 1);
INSERT INTO public.crew_transfers (id, company_id, profile_id, user_id, from_vessel_id, to_vessel_id, sign_off_date, sign_on_date, status)
VALUES (tests.id('transfer:mover'), tests.company_id('A'), tests.profile_id('A.mover'), tests.user_id('A.mover'),
        tests.vessel_id('A.hyd'), tests.vessel_id('A.dra'), current_date - 1, current_date + 2, 'scheduled');
INSERT INTO public.user_invitations (id, company_id, profile_id, status, created_at, revoked_at) VALUES
  (tests.id('inv:pending:old'), tests.company_id('A'), tests.profile_id('A.pending'), 'revoked', now() - interval '3 days', now() - interval '2 days');
INSERT INTO public.user_invitations (id, company_id, profile_id, status, send_attempts, last_sent_at, expires_at, created_at) VALUES
  (tests.id('inv:pending:new'), tests.company_id('A'), tests.profile_id('A.pending'), 'sent', 1, now() - interval '1 day', now() + interval '6 days', now() - interval '1 day');

-- The legacy crew-list flag (crew.see_crew_list) for A.lister and A.ext.
SELECT tests.seed_role('x1_see_crew_list', 'vessel');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'crew.see_crew_list', 'view', 'fleet' FROM public.roles AS r WHERE r.name = 'x1_see_crew_list';
SELECT tests.seed_rbac_role('A.lister', 'x1_see_crew_list');
SELECT tests.seed_rbac_role('A.ext', 'x1_see_crew_list');
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'external', vessel_scope = 'assigned', fleet_access = false, source = 'admin',
    valid_from = now() - interval '1 day', valid_until = now() + interval '7 days'
WHERE user_id = tests.user_id('A.ext');
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT id, company_id, tests.vessel_id('A.dra') FROM public.account_memberships WHERE user_id = tests.user_id('A.ext');

-- Setup checks (so each refusal below is the one it claims to be).
SELECT tests.ok(public.has_capability_for(tests.user_id('A.lister'), 'vessel.crew.crew_list.view', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.lister'), 'vessel.crew.crew_profiles.view', tests.company_id('A'), tests.vessel_id('A.dra')),
                'setup: A.lister holds crew_list.view on A.dra but not crew_profiles.view');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.ext'), 'vessel.crew.crew_list.view', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.record_user_is_external(tests.user_id('A.ext'), tests.company_id('A')),
                'setup: the external viewer holds crew_list.view on A.dra (so the refusal below is the external rule)');
SELECT tests.ok(public.has_capability_for(tests.user_id('A.fleet_manager'), 'vessel.crew.crew_profiles.view', tests.company_id('A'), tests.vessel_id('A.dra')),
                'setup: the fleet manager holds crew_profiles.view');
SELECT tests.ok(NOT public.has_capability_for(tests.user_id('A.crew_hyd'), 'vessel.crew.crew_list.view', tests.company_id('A'), tests.vessel_id('A.hyd')),
                'setup: a plain crew member holds no crew_list.view');

-- ------------------------------------------------------------ 2. membership (crew_vessel_members)

SELECT tests.results_eq(
  $q$SELECT profile_id, placement_kind FROM public.crew_vessel_members(tests.vessel_id('A.dra'), current_date) ORDER BY profile_id$q$,
  $q$SELECT tests.profile_id(k), p FROM (VALUES
       ('A.master_dra', 'assignment'), ('A.bosun', 'assignment'), ('A.stew', 'assignment'), ('A.joiner', 'planned'),
       ('A.leaver', 'assignment'), ('A.mover', 'planned'), ('A.cook', 'assignment'), ('A.lister', 'assignment'),
       ('A.pending', 'pending_placement'), ('A.pending_bare', 'pending_placement')) AS x(k, p)
     ORDER BY 1$q$,
  'today: current and planned assignments and the pending placements; not the ended, the stale, the placement whose login is assigned elsewhere, nor another company''s profile');
SELECT tests.results_eq(
  $q$SELECT position_text, rank_text, join_date, assignment_id IS NULL FROM public.crew_vessel_members(tests.vessel_id('A.dra'), current_date)
     WHERE profile_id IN (tests.profile_id('A.pending'), tests.profile_id('A.pending_bare')) ORDER BY position_text$q$,
  $q$VALUES ('Crew', NULL::text, '2026-10-01'::date, true), ('Deckhand', 'Deckhand', current_date + 3, true)$q$,
  'a pending placement reads as it will be written: position, else rank, else Crew; joining date, else created date (D-225)');
SELECT tests.results_eq(
  $q$SELECT profile_id, placement_kind FROM public.crew_vessel_members(tests.vessel_id('A.dra'), current_date + 10)
     WHERE profile_id IN (tests.profile_id('A.joiner'), tests.profile_id('A.leaver'), tests.profile_id('A.mover')) ORDER BY profile_id$q$,
  $q$SELECT tests.profile_id(k), p FROM (VALUES ('A.joiner', 'assignment'), ('A.mover', 'assignment')) AS x(k, p) ORDER BY 1$q$,
  'as at a future day: the joiner has joined, the transfer has signed on, the leaver has left');
SELECT tests.is((SELECT count(*) FROM public.crew_vessel_members(tests.vessel_id('A.hyd'), current_date) WHERE profile_id = tests.profile_id('A.mover')), 0::bigint,
  'the transfer''s ended source assignment is not on A.hyd''s list');
SELECT tests.is((SELECT count(*) FROM public.crew_vessel_members(tests.id('vessel:nowhere'), current_date)), 0::bigint, 'an unknown vessel has no members');

-- ------------------------------------------------------------ 3. crew_vessel_list

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.results_eq(
  $q$SELECT profile_id, status, status_detail FROM public.crew_vessel_list(tests.vessel_id('A.dra')) ORDER BY profile_id$q$,
  $q$SELECT tests.profile_id(k), s, d FROM (VALUES
       ('A.master_dra', 'on_board', NULL::text), ('A.bosun', 'on_board', NULL), ('A.stew', 'on_leave', 'leave'),
       ('A.joiner', 'pending', 'planned'), ('A.leaver', 'on_board', NULL), ('A.mover', 'on_transfer', 'transfer_in'),
       ('A.cook', 'on_board', NULL), ('A.lister', 'on_board', NULL),
       ('A.pending', 'pending', 'pending_placement'), ('A.pending_bare', 'pending', 'pending_placement')) AS x(k, s, d)
     ORDER BY 1$q$,
  'status per person today: leave from the day code, Pending for the planned joiner and the placements, On transfer beats Pending');
SELECT tests.results_eq(
  $q$SELECT leave_code, transfer_vessel_id FROM public.crew_vessel_list(tests.vessel_id('A.dra'))
     WHERE profile_id IN (tests.profile_id('A.stew'), tests.profile_id('A.mover'), tests.profile_id('A.bosun')) ORDER BY last_name$q$,
  $q$VALUES ('F', NULL::uuid), (NULL::text, tests.vessel_id('A.hyd')), ('L', NULL::uuid)$q$,
  'the day code is returned (F for the bosun, L on leave) and the transfer names the other vessel');
SELECT tests.results_eq(
  $q$SELECT position_id, position_name, department_key, department_label, rank_tier, sort_order
     FROM public.crew_vessel_list(tests.vessel_id('A.dra')) WHERE profile_id = tests.profile_id('A.bosun')$q$,
  $q$SELECT md5('storm.position.bosun')::uuid, p.name, p.department_key, d.label, p.rank_tier, 5
     FROM public.positions AS p JOIN public.departments AS d ON d.key = p.department_key WHERE p.id = md5('storm.position.bosun')::uuid$q$,
  'position, department and tier from the catalogue, the rank order from the vessel''s override');
SELECT tests.results_eq(
  $q$SELECT position_id, position_text, department_key, sort_order FROM public.crew_vessel_list(tests.vessel_id('A.dra')) WHERE profile_id = tests.profile_id('A.cook')$q$,
  $q$VALUES (NULL::uuid, 'Underwater Welder', 'galley', NULL::integer)$q$,
  'an unmatched title keeps its text, takes the department from the legacy text (Galley), and has no rank order');
SELECT tests.results_eq(
  $q$SELECT position_name FROM public.crew_vessel_list(tests.vessel_id('A.dra')) WHERE profile_id = tests.profile_id('A.stew')$q$,
  $q$SELECT name FROM public.positions WHERE id = md5('storm.position.second_stew')::uuid$q$,
  'a rank maps when the position title does not (Crew / Second Stewardess)');
SELECT tests.is((SELECT profile_id FROM public.crew_vessel_list(tests.vessel_id('A.dra')) LIMIT 1), tests.profile_id('A.bosun'),
  'the vessel''s rank order comes first (the Bosun override 5 beats the Master)');
SELECT tests.is((SELECT profile_id FROM public.crew_vessel_list(tests.vessel_id('A.dra')) OFFSET 1 LIMIT 1), tests.profile_id('A.master_dra'),
  'then the catalogue order (the Master)');
SELECT tests.ok((SELECT bool_and(sort_order IS NULL) FROM (SELECT sort_order FROM public.crew_vessel_list(tests.vessel_id('A.dra')) OFFSET 8) AS t),
  'unmatched titles sort last');
SELECT tests.results_eq(
  $q$SELECT profile_id FROM public.crew_vessel_list(tests.vessel_id('A.dra')) WHERE travel_today$q$,
  $q$VALUES (tests.profile_id('A.bosun'))$q$,
  'travel today: the bosun''s changeover is today (the stew travels tomorrow)');
SELECT tests.results_eq(
  $q$SELECT profile_id, login_state, account_status FROM public.crew_vessel_list(tests.vessel_id('A.dra')) WHERE login_state <> 'active' ORDER BY profile_id$q$,
  $q$SELECT tests.profile_id(k), 'pending_login', a FROM (VALUES ('A.pending', 'not_invited'), ('A.pending_bare', 'invited')) AS x(k, a) ORDER BY 1$q$,
  'no login reads pending_login (D-199)');
SELECT tests.results_eq(
  $q$SELECT invitation_id, invitation_status, invitation_last_sent_at IS NOT NULL, invitation_expires_at IS NOT NULL
     FROM public.crew_vessel_list(tests.vessel_id('A.dra')) WHERE profile_id = tests.profile_id('A.pending')$q$,
  $q$VALUES (tests.id('inv:pending:new'), 'sent', true, true)$q$,
  'the newest invitation (sent, with its last send and expiry), not the older revoked one');
SELECT tests.is((SELECT count(*) FROM public.crew_vessel_list(tests.vessel_id('A.dra')) WHERE invitation_id IS NOT NULL), 1::bigint,
  'no invitation columns for people without an invitation row');
SELECT tests.results_eq(
  $q$SELECT profile_id FROM public.crew_vessel_list(tests.vessel_id('A.dra')) WHERE is_master_office$q$,
  $q$VALUES (tests.profile_id('A.master_dra'))$q$,
  'the Master office flag');
SELECT tests.is((SELECT nationality FROM public.crew_vessel_list(tests.vessel_id('A.dra')) WHERE profile_id = tests.profile_id('A.pending')), 'Dutch',
  'nationality from the profile');
SELECT tests.is((SELECT count(*) FROM public.crew_vessel_list(tests.vessel_id('A.dra')) WHERE email IS NULL), 0::bigint,
  'with crew_profiles.view every email is returned');
-- As at a later day.
SELECT tests.results_eq(
  $q$SELECT profile_id, status FROM public.crew_vessel_list(tests.vessel_id('A.dra'), current_date + 10)
     WHERE profile_id IN (tests.profile_id('A.joiner'), tests.profile_id('A.leaver'), tests.profile_id('A.mover'), tests.profile_id('A.stew')) ORDER BY profile_id$q$,
  $q$SELECT tests.profile_id(k), s FROM (VALUES ('A.joiner', 'on_board'), ('A.mover', 'on_board'), ('A.stew', 'on_board')) AS x(k, s) ORDER BY 1$q$,
  'as at day +10 (T-306): the joiner and the transfer are on board, the stew is back (code F), the leaver is gone');
SELECT tests.lives($q$SELECT * FROM public.crew_vessel_list(tests.vessel_id('A.dra'), (current_date + interval '2 years')::date)$q$, 'two years ahead is allowed');
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_list(tests.vessel_id('A.dra'), (current_date + interval '2 years 1 day')::date)$q$,
  '22023', 'as_at_out_of_range', 'more than two years ahead: 22023 as_at_out_of_range');
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_list(tests.vessel_id('A.dra'), (current_date - interval '2 years 1 day')::date)$q$,
  '22023', 'as_at_out_of_range', 'more than two years back: 22023 as_at_out_of_range');
SELECT tests.lives($q$SELECT * FROM public.crew_vessel_list(tests.vessel_id('A.dra'), NULL)$q$, 'a NULL day means today');

-- Email without crew_profiles.view: only the caller's own.
SELECT tests.as_user(tests.user_id('A.lister'));
SELECT tests.results_eq(
  $q$SELECT profile_id FROM public.crew_vessel_list(tests.vessel_id('A.dra')) WHERE email IS NOT NULL$q$,
  $q$VALUES (tests.profile_id('A.lister'))$q$,
  'without crew_profiles.view only the caller''s own email is returned');
SELECT tests.is((SELECT count(*) FROM public.crew_vessel_list(tests.vessel_id('A.dra'))), 10::bigint, 'but the whole list is');

-- The DRAAK master (legacy crew access on the vessel they reach).
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is((SELECT count(*) FROM public.crew_vessel_list(tests.vessel_id('A.dra'))), 10::bigint, 'the DRAAK master reads DRAAK''s list');

-- ------------------------------------------------------------ 4. gates

SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_list(tests.vessel_id('A.hyd'))$q$, '42501', 'crew_not_permitted',
  'the DRAAK master cannot read HYDRA (no reach)');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_list(tests.id('vessel:nowhere'))$q$, 'P0002', 'vessel_not_found', 'an unknown vessel: P0002');
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_list(NULL)$q$, '22023', 'vessel_required', 'no vessel: 22023');
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_list(tests.vessel_id('B.lev'))$q$, '42501', 'crew_not_permitted', 'another tenant''s vessel: 42501');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_list(tests.vessel_id('A.dra'))$q$, '42501', 'crew_not_permitted', 'B''s admin cannot read A''s vessel');
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_movements(tests.vessel_id('A.dra'), current_date - 30, current_date)$q$, '42501', 'crew_not_permitted',
  'nor its movements');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_list(tests.vessel_id('A.hyd'))$q$, '42501', 'crew_not_permitted',
  'a crew member without crew_list.view cannot read their own vessel''s list');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws($q$SELECT * FROM public.crew_vessel_list(tests.vessel_id('A.dra'))$q$, '42501', 'an inactive caller is refused');
SELECT tests.throws($q$SELECT * FROM public.crew_vessel_movements(tests.vessel_id('A.dra'), current_date - 30, current_date)$q$, '42501', 'and gets no movements');
SELECT tests.as_user(tests.user_id('A.ext'));
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_list(tests.vessel_id('A.dra'))$q$, '42501', 'crew_not_permitted',
  'an external viewer is refused although the capability answers true');
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_movements(tests.vessel_id('A.dra'), current_date - 30, current_date)$q$, '42501', 'crew_not_permitted',
  'and gets no movements');
SELECT tests.as_anon();
SELECT tests.denied($q$SELECT * FROM public.crew_vessel_list(tests.vessel_id('A.dra'))$q$, 'anon cannot call crew_vessel_list (no grant)');
SELECT tests.denied($q$SELECT * FROM public.crew_vessel_movements(tests.vessel_id('A.dra'), current_date - 30, current_date)$q$, 'nor crew_vessel_movements');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 5. crew_vessel_movements

-- A stored embark for the bosun's assignment (replaces the derived one), a
-- manual disembark for the leaver on its leave day (replaces the derived
-- one by person, day and direction), and a port.
INSERT INTO public.crew_movements (id, company_id, vessel_id, profile_id, kind, occurred_on, port, source, source_id)
VALUES (tests.id('mv:bosun'), tests.company_id('A'), tests.vessel_id('A.dra'), tests.profile_id('A.bosun'), 'embark', current_date - 30, 'Palma', 'manual',
        tests.id('assignment:A.bosun@A.dra')),
       (tests.id('mv:leaver'), tests.company_id('A'), tests.vessel_id('A.dra'), tests.profile_id('A.leaver'), 'disembark', current_date + 5, 'Antibes', 'manual', NULL),
       (tests.id('mv:old'), tests.company_id('A'), tests.vessel_id('A.dra'), tests.profile_id('A.stew'), 'embark', current_date - 400, NULL, 'manual', NULL);

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.results_eq(
  $q$SELECT movement_id, kind, port, source FROM public.crew_vessel_movements(tests.vessel_id('A.dra'), current_date - 31, current_date + 31)
     WHERE profile_id IN (tests.profile_id('A.bosun'), tests.profile_id('A.leaver')) ORDER BY kind, movement_id NULLS LAST$q$,
  $q$VALUES (tests.id('mv:leaver'), 'disembark', 'Antibes', 'manual'), (tests.id('mv:bosun'), 'embark', 'Palma', 'manual'),
            (NULL::uuid, 'embark', NULL::text, 'assignment')$q$,
  'stored rows replace the derived embark (same source) and the derived disembark (same person, day and direction); the leaver''s own embark stays derived');
SELECT tests.results_eq(
  $q$SELECT profile_id, kind, occurred_on, source FROM public.crew_vessel_movements(tests.vessel_id('A.dra'), current_date - 3, current_date - 1) ORDER BY profile_id$q$,
  $q$SELECT tests.profile_id('A.ended'), 'disembark', current_date - 1, 'assignment'
     UNION ALL SELECT tests.profile_id('A.stale'), 'disembark', current_date - 2, 'assignment'
     ORDER BY 1$q$,
  'disembarks derived from leave dates in the range (ended and stale rows count as history)');
SELECT tests.results_eq(
  $q$SELECT kind, occurred_on FROM public.crew_vessel_movements(tests.vessel_id('A.hyd'), current_date - 3, current_date) WHERE profile_id = tests.profile_id('A.mover')$q$,
  $q$VALUES ('disembark', current_date - 1)$q$,
  'HYDRA lists the transfer''s departure');
SELECT tests.is((SELECT count(*) FROM public.crew_vessel_movements(tests.vessel_id('A.dra'), current_date - 31, current_date + 31) WHERE movement_id = tests.id('mv:old')), 0::bigint,
  'a movement outside the range is left out');
SELECT tests.is((SELECT position_text FROM public.crew_vessel_movements(tests.vessel_id('A.dra'), current_date - 31, current_date + 31) WHERE movement_id = tests.id('mv:bosun')), 'Bosun',
  'a stored movement carries the person''s title on the vessel');
SELECT tests.ok((SELECT bool_and(occurred_on >= lead_on) FROM (
  SELECT occurred_on, lead(occurred_on) OVER (ORDER BY ordinality) AS lead_on
  FROM public.crew_vessel_movements(tests.vessel_id('A.dra'), current_date - 31, current_date + 31) WITH ORDINALITY) AS t WHERE lead_on IS NOT NULL),
  'newest first');
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_movements(tests.vessel_id('A.dra'), current_date, current_date - 1)$q$, '22023', 'range_invalid', 'to before from: 22023');
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_movements(tests.vessel_id('A.dra'), NULL, current_date)$q$, '22023', 'range_required', 'no start: 22023');
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_movements(tests.vessel_id('A.dra'), current_date - 1100, current_date)$q$, '22023', 'range_too_long', 'more than three years: 22023');
SELECT tests.lives($q$SELECT * FROM public.crew_vessel_movements(tests.vessel_id('A.dra'), (current_date - interval '3 years')::date, current_date)$q$, 'three years is allowed');
SELECT tests.throws_like($q$SELECT * FROM public.crew_vessel_movements(tests.id('vessel:nowhere'), current_date - 1, current_date)$q$, 'P0002', 'vessel_not_found', 'unknown vessel: P0002');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 6. RLS and integrity guards

INSERT INTO public.crew_movements (company_id, vessel_id, profile_id, kind, occurred_on, source)
VALUES (tests.company_id('A'), tests.vessel_id('A.hyd'), tests.profile_id('A.crew_hyd'), 'embark', current_date, 'manual');
SELECT tests.seed_user('B', 'B.crew', 'crew');
SELECT tests.seed_assignment('B.crew', 'B.lev', true, 'Deckhand');
INSERT INTO public.crew_movements (company_id, vessel_id, profile_id, kind, occurred_on, source)
VALUES (tests.company_id('B'), tests.vessel_id('B.lev'), tests.profile_id('B.crew'), 'embark', current_date, 'manual');

SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.results_eq($q$SELECT DISTINCT vessel_id FROM public.crew_movements$q$, $q$VALUES (tests.vessel_id('A.dra'))$q$,
  'movements: the DRAAK master reads DRAAK''s rows only');
SELECT tests.results_eq($q$SELECT id FROM public.crew_transfers$q$, $q$VALUES (tests.id('transfer:mover'))$q$,
  'transfers: the DRAAK master (crew_assignments.view on the destination) reads the transfer');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.results_eq($q$SELECT DISTINCT vessel_id FROM public.crew_movements ORDER BY 1$q$,
  $q$SELECT unnest(ARRAY[tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')]) ORDER BY 1$q$,
  'the fleet manager reads every vessel of A, none of B');
SELECT tests.as_user(tests.user_id('A.mover'));
SELECT tests.is_empty('SELECT * FROM public.crew_movements', 'a crew member without crew_list.view reads no movement');
SELECT tests.results_eq($q$SELECT id FROM public.crew_transfers$q$, $q$VALUES (tests.id('transfer:mover'))$q$, 'the person reads their own transfer');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is_empty('SELECT * FROM public.crew_transfers', 'another crew member does not');
SELECT tests.as_user(tests.user_id('A.ext'));
SELECT tests.is_empty('SELECT * FROM public.crew_movements', 'an external viewer reads no movement');
SELECT tests.is_empty('SELECT * FROM public.crew_transfers', 'nor a transfer');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is_empty('SELECT * FROM public.crew_movements', 'an inactive caller reads no movement');
SELECT tests.is_empty('SELECT * FROM public.crew_transfers', 'nor a transfer');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.results_eq($q$SELECT DISTINCT vessel_id FROM public.crew_movements$q$, $q$VALUES (tests.vessel_id('B.lev'))$q$, 'B reads only B''s movements');
SELECT tests.is_empty('SELECT * FROM public.crew_transfers', 'and none of A''s transfers');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.denied(format($q$INSERT INTO public.crew_movements (company_id, vessel_id, profile_id, kind, occurred_on) VALUES (%L, %L, %L, 'embark', current_date)$q$,
  tests.company_id('A'), tests.vessel_id('A.dra'), tests.profile_id('A.bosun')), 'the browser cannot insert a movement (no grant)');
SELECT tests.denied(format($q$UPDATE public.crew_transfers SET status = 'completed' WHERE id = %L$q$, tests.id('transfer:mover')), 'nor update a transfer');
SELECT tests.denied(format($q$DELETE FROM public.crew_movements WHERE vessel_id = %L$q$, tests.vessel_id('A.dra')), 'nor delete a movement');
SELECT tests.as_anon();
SELECT tests.denied('SELECT * FROM public.crew_movements', 'anon reads no movement (no grant)');
SELECT tests.denied('SELECT * FROM public.crew_transfers', 'anon reads no transfer');
SELECT tests.reset_role();

SELECT tests.throws(format($q$INSERT INTO public.crew_movements (company_id, vessel_id, profile_id, kind, occurred_on) VALUES (%L, %L, %L, 'embark', current_date)$q$,
  tests.company_id('B'), tests.vessel_id('A.dra'), tests.profile_id('A.bosun')), '23514', 'a movement must name a vessel of its own company');
SELECT tests.throws(format($q$INSERT INTO public.crew_movements (company_id, vessel_id, profile_id, kind, occurred_on) VALUES (%L, %L, %L, 'embark', current_date)$q$,
  tests.company_id('A'), tests.vessel_id('A.dra'), tests.profile_id('B.crew')), '23514', 'and a person of its own company');
SELECT tests.throws(format($q$INSERT INTO public.crew_transfers (company_id, profile_id, from_vessel_id, to_vessel_id, sign_off_date, sign_on_date) VALUES (%L, %L, %L, %L, current_date, current_date)$q$,
  tests.company_id('A'), tests.profile_id('A.bosun'), tests.vessel_id('A.dra'), tests.vessel_id('B.lev')), '23514', 'a transfer stays inside one company');
SELECT tests.throws(format($q$INSERT INTO public.crew_transfers (company_id, profile_id, from_vessel_id, to_vessel_id, sign_off_date, sign_on_date) VALUES (%L, %L, %L, %L, current_date, current_date - 1)$q$,
  tests.company_id('A'), tests.profile_id('A.bosun'), tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')), '23514', 'sign-on cannot be before sign-off');
SELECT tests.throws(format($q$INSERT INTO public.crew_transfers (company_id, profile_id, from_vessel_id, to_vessel_id, sign_off_date, sign_on_date) VALUES (%L, %L, %L, %L, current_date, current_date)$q$,
  tests.company_id('A'), tests.profile_id('A.bosun'), tests.vessel_id('A.dra'), tests.vessel_id('A.dra')), '23514', 'nor to the same vessel');
SELECT tests.throws(format($q$INSERT INTO public.crew_transfers (company_id, profile_id, from_vessel_id, to_vessel_id, sign_off_date, sign_on_date, status) VALUES (%L, %L, %L, %L, current_date, current_date, 'approved')$q$,
  tests.company_id('A'), tests.profile_id('A.bosun'), tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')), '23514', 'the status vocabulary is checked');

-- ------------------------------------------------------------ 7. the transfer status guard (engine flag)

-- A signed-in writer (claims set, privileges of the superuser so the guard
-- itself is what answers).
SELECT tests._set_claims(jsonb_build_object('sub', tests.user_id('A.fleet_manager'), 'role', 'authenticated'));
SELECT tests.throws_like(format($q$UPDATE public.crew_transfers SET status = 'completed' WHERE id = %L$q$, tests.id('transfer:mover')), '42501', 'crew_transfer_engine_only',
  'a signed-in writer cannot move a transfer''s status without the engine flag');
SELECT tests.throws_like(format($q$UPDATE public.crew_transfers SET approved_at = now() WHERE id = %L$q$, tests.id('transfer:mover')), '42501', 'crew_transfer_engine_only',
  'nor a decision column');
SELECT tests.lives(format($q$UPDATE public.crew_transfers SET notes = 'Flight booked' WHERE id = %L$q$, tests.id('transfer:mover')),
  'other columns stay writable (the definers of X1-11 decide who)');
SELECT tests.throws_like(format($q$INSERT INTO public.crew_transfers (company_id, profile_id, from_vessel_id, to_vessel_id, sign_off_date, sign_on_date, status) VALUES (%L, %L, %L, %L, current_date, current_date + 1, 'scheduled')$q$,
  tests.company_id('A'), tests.profile_id('A.bosun'), tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')), '42501', 'crew_transfer_engine_only',
  'an insert must be a draft without a decision');
SELECT tests.lives(format($q$INSERT INTO public.crew_transfers (id, company_id, profile_id, from_vessel_id, to_vessel_id, sign_off_date, sign_on_date) VALUES (%L, %L, %L, %L, %L, current_date, current_date + 1)$q$,
  tests.id('transfer:draft'), tests.company_id('A'), tests.profile_id('A.bosun'), tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')), 'a draft insert passes the guard');
SELECT tests.throws_like(format($q$DELETE FROM public.crew_transfers WHERE id = %L$q$, tests.id('transfer:mover')), '42501', 'crew_transfer_engine_only',
  'a scheduled transfer cannot be deleted');
SELECT tests.lives(format($q$DELETE FROM public.crew_transfers WHERE id = %L$q$, tests.id('transfer:draft')), 'a draft can');
SELECT set_config('storm.crew_engine', 'on', true);
SELECT tests.lives(format($q$UPDATE public.crew_transfers SET status = 'completed', completed_at = now() WHERE id = %L$q$, tests.id('transfer:mover')),
  'with the engine flag the status moves');
SELECT set_config('storm.crew_engine', '', true);
SELECT tests.reset_role();
SELECT tests.lives(format($q$UPDATE public.crew_transfers SET status = 'scheduled', completed_at = NULL WHERE id = %L$q$, tests.id('transfer:mover')),
  'no JWT (migrations, the SQL editor) is exempt');
SELECT tests.as_service();
SELECT tests.lives(format($q$UPDATE public.crew_transfers SET status = 'cancelled', cancelled_at = now() WHERE id = %L$q$, tests.id('transfer:mover')),
  'the service role is exempt');
SELECT tests.reset_role();

-- A cancelled transfer no longer makes anyone On transfer.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is((SELECT status FROM public.crew_vessel_list(tests.vessel_id('A.dra')) WHERE profile_id = tests.profile_id('A.mover')), 'pending',
  'only a scheduled transfer counts: cancelled, the mover reads Pending again (planned join)');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 8. grants

SELECT tests.ok(NOT has_function_privilege('authenticated', 'public.crew_vessel_members(uuid, date)', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.crew_status_decide(boolean, text, text, text)', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.crew_movements_scope_guard()', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.crew_transfers_scope_guard()', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.crew_transfers_guard()', 'EXECUTE'),
  'the internals are not executable by authenticated');
SELECT tests.ok(has_function_privilege('service_role', 'public.crew_vessel_members(uuid, date)', 'EXECUTE')
                AND has_function_privilege('service_role', 'public.crew_status_decide(boolean, text, text, text)', 'EXECUTE'),
  'the service role (and definers) may call the membership and status helpers');
SELECT tests.ok(has_function_privilege('authenticated', 'public.crew_vessel_list(uuid, date)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.crew_vessel_movements(uuid, date, date)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.crew_caller_is_external()', 'EXECUTE'),
  'the RPCs and the policy helper are executable by authenticated');
SELECT tests.is_empty(
  $q$SELECT p.oid::regprocedure::text FROM pg_proc AS p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('crew_status_decide', 'crew_vessel_members', 'crew_caller_is_external', 'crew_vessel_list', 'crew_vessel_movements',
                         'crew_movements_scope_guard', 'crew_transfers_scope_guard', 'crew_transfers_guard')
       AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('public', p.oid, 'EXECUTE'))$q$,
  'anon and PUBLIC execute nothing of this file');
SELECT tests.is_empty(
  $q$SELECT c.relname FROM pg_class AS c
     WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('crew_movements', 'crew_transfers')
       AND (has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
            OR has_table_privilege('authenticated', c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
            OR NOT has_table_privilege('authenticated', c.oid, 'SELECT')
            OR NOT c.relrowsecurity)$q$,
  'both tables: RLS on, SELECT only for authenticated, nothing for anon');
SELECT tests.is_empty(
  $q$SELECT p.oid::regprocedure::text FROM pg_proc AS p
     WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
       AND p.proname IN ('crew_caller_is_external', 'crew_vessel_list', 'crew_vessel_movements')
       AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) AS c WHERE c = 'search_path=public')$q$,
  'every definer of this file pins search_path = public');
SELECT tests.is((SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prosecdef
                 AND proname IN ('crew_status_decide', 'crew_vessel_members')), 0::bigint,
  'the pure status function and the membership helper are not definers (they run as their caller, a gated definer)');
