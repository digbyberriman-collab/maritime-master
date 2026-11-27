-- The role-scoped legacy policies (20261123010500) pin every row to one
-- company and an active user (review round 2,
-- role-scoped-policies-unpinned-rows; D-122, D-172, CC-5): own-row branches
-- ask user_is_active(auth.uid()); own-row writes stay in the caller's
-- tenancy (a flight request in their company, a vessel row on a vessel
-- they reach); the company of a vessel row is the vessel's real company
-- (vessel_company_of(), not a subquery under the caller's RLS), and every
-- crew + vessel WITH CHECK pins the vessel to the crew member's company.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user_role('B.admin', 'dpa', 'B');                 -- B's DPA (user_roles dpa of B)
SELECT tests.seed_user_role('A.fleet_manager', 'dpa', 'A');         -- A's DPA (user_roles dpa of A)
SELECT tests.seed_user('A', 'A.captain', 'master');                 -- an A captain on DRAAK
SELECT tests.seed_assignment('A.captain', 'A.dra', true, 'Master');
SELECT tests.seed_user_role('A.captain', 'captain', 'A');
SELECT tests.seed_user('B', 'B.crew', 'crew');
SELECT tests.seed_assignment('B.crew', 'B.lev', true, 'Deckhand');
SELECT tests.seed_assignment('A.disabled', 'A.hyd', true, 'Deckhand');

-- Rows written as the superuser.
INSERT INTO public.medical_reports (id, report_number, crew_id, vessel_id) VALUES
  (tests.id('mr:a'), 'MR-A', tests.user_id('A.crew_hyd'), tests.vessel_id('A.hyd')),
  (tests.id('mr:disabled'), 'MR-DIS', tests.user_id('A.disabled'), tests.vessel_id('A.hyd')),
  (tests.id('mr:b'), 'MR-B', tests.user_id('B.crew'), tests.vessel_id('B.lev'));
INSERT INTO public.leave_requests (id, crew_id, vessel_id, leave_type, start_date, end_date) VALUES
  (tests.id('lr:a'), tests.user_id('A.crew_hyd'), tests.vessel_id('A.hyd'), 'annual', current_date, current_date + 5),
  (tests.id('lr:disabled'), tests.user_id('A.disabled'), tests.vessel_id('A.hyd'), 'annual', current_date, current_date + 5),
  (tests.id('lr:b'), tests.user_id('B.crew'), tests.vessel_id('B.lev'), 'annual', current_date, current_date + 5);
INSERT INTO public.hours_of_rest_records (id, crew_id, vessel_id, record_date, rest_periods) VALUES
  (tests.id('hr:disabled'), tests.user_id('A.disabled'), tests.vessel_id('A.hyd'), current_date - 2, '[]');
INSERT INTO public.flight_requests (id, crew_id, company_id, request_number, request_type, depart_from, arrive_to, earliest_departure_date) VALUES
  (tests.id('fr:disabled'), tests.user_id('A.disabled'), tests.company_id('A'), 'FR-DIS', 'crew_change', 'NCE', 'PMI', current_date + 7);
INSERT INTO public.notification_logs (id, recipient_user_id, notification_type, subject)
VALUES (tests.id('nl:disabled'), tests.user_id('A.disabled'), 'general', 'Note');

-- ------------------------------------------------------------ a disabled user gets nothing through an own-row branch

SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is_empty('SELECT 1 FROM public.medical_reports WHERE crew_id = auth.uid()', 'a disabled user reads no own medical report');
SELECT tests.is_empty('SELECT 1 FROM public.leave_requests WHERE crew_id = auth.uid()', 'nor an own leave request');
SELECT tests.is_empty('SELECT 1 FROM public.hours_of_rest_records WHERE crew_id = auth.uid()', 'nor an own rest record');
SELECT tests.is_empty('SELECT 1 FROM public.flight_requests WHERE crew_id = auth.uid()', 'nor an own flight request');
SELECT tests.is_empty('SELECT 1 FROM public.notification_logs WHERE recipient_user_id = auth.uid()', 'nor an own notification');
SELECT tests.throws(format($q$INSERT INTO public.flight_requests (crew_id, company_id, request_number, request_type, depart_from, arrive_to, earliest_departure_date) VALUES (auth.uid(), %L, 'FR-D1', 'crew_change', 'NCE', 'PMI', current_date)$q$, tests.company_id('A')),
                    '42501', 'nor inserts a flight request');
SELECT tests.throws(format($q$INSERT INTO public.hours_of_rest_records (crew_id, vessel_id, record_date, rest_periods) VALUES (auth.uid(), %L, current_date, '[]')$q$, tests.vessel_id('A.hyd')),
                    '42501', 'nor a rest record');
SELECT tests.throws(format($q$INSERT INTO public.work_rest_records (crew_id, vessel_id, record_date) VALUES (auth.uid(), %L, current_date)$q$, tests.vessel_id('A.hyd')),
                    '42501', 'nor a work / rest record');
SELECT tests.throws(format($q$INSERT INTO public.work_rest_monthly_submissions (crew_id, vessel_id, period_year, period_month) VALUES (auth.uid(), %L, 2026, 11)$q$, tests.vessel_id('A.hyd')),
                    '42501', 'nor a monthly submission');
SELECT tests.denied(format($q$UPDATE public.leave_requests SET end_date = end_date + 1 WHERE id = %L RETURNING id$q$, tests.id('lr:disabled')), 'nor updates their own leave request');
SELECT tests.denied(format($q$UPDATE public.hours_of_rest_records SET rest_periods = '[{}]' WHERE id = %L RETURNING id$q$, tests.id('hr:disabled')), 'nor their own rest record');
SELECT tests.reset_role();

-- ------------------------------------------------------------ an active user's own-row writes stay in their tenancy

SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.throws(format($q$INSERT INTO public.flight_requests (crew_id, company_id, request_number, request_type, depart_from, arrive_to, earliest_departure_date) VALUES (auth.uid(), %L, 'FR-X1', 'crew_change', 'NCE', 'PMI', current_date)$q$, tests.company_id('B')),
                    '42501', 'A crew cannot file a flight request in company B');
SELECT tests.throws(format($q$INSERT INTO public.flight_requests (crew_id, company_id, vessel_id, request_number, request_type, depart_from, arrive_to, earliest_departure_date) VALUES (auth.uid(), %L, %L, 'FR-X2', 'crew_change', 'NCE', 'PMI', current_date)$q$, tests.company_id('A'), tests.vessel_id('B.lev')),
                    '42501', 'nor one in A naming a B vessel');
SELECT tests.throws(format($q$INSERT INTO public.hours_of_rest_records (crew_id, vessel_id, record_date, rest_periods) VALUES (auth.uid(), %L, current_date, '[]')$q$, tests.vessel_id('B.lev')),
                    '42501', 'nor a rest record on B.lev');
SELECT tests.throws(format($q$INSERT INTO public.work_rest_records (crew_id, vessel_id, record_date) VALUES (auth.uid(), %L, current_date)$q$, tests.vessel_id('B.lev')),
                    '42501', 'nor a work / rest record on B.lev');
SELECT tests.throws(format($q$INSERT INTO public.work_rest_monthly_submissions (crew_id, vessel_id, period_year, period_month) VALUES (auth.uid(), %L, 2026, 11)$q$, tests.vessel_id('B.lev')),
                    '42501', 'nor a monthly submission on B.lev');
SELECT tests.throws(format($q$INSERT INTO public.hours_of_rest_records (crew_id, vessel_id, record_date, rest_periods) VALUES (auth.uid(), %L, current_date, '[]')$q$, tests.vessel_id('A.dra')),
                    '42501', 'nor a rest record on an own-company vessel they do not reach');
SELECT tests.throws(format($q$UPDATE public.leave_requests SET vessel_id = %L WHERE id = %L$q$, tests.vessel_id('B.lev'), tests.id('lr:a')),
                    '42501', 're-pointing their own leave request to B.lev is refused');
-- Positives: own rows on their own vessel and company.
SELECT tests.lives(format($q$INSERT INTO public.flight_requests (id, crew_id, company_id, vessel_id, request_number, request_type, depart_from, arrive_to, earliest_departure_date) VALUES (%L, auth.uid(), %L, %L, 'FR-A1', 'crew_change', 'NCE', 'PMI', current_date)$q$, tests.id('fr:a1'), tests.company_id('A'), tests.vessel_id('A.hyd')),
                   'an own flight request in A (on their vessel)');
SELECT tests.lives(format($q$INSERT INTO public.hours_of_rest_records (id, crew_id, vessel_id, record_date, rest_periods) VALUES (%L, auth.uid(), %L, current_date, '[]')$q$, tests.id('hr:a1'), tests.vessel_id('A.hyd')),
                   'an own rest record on HYDRA');
-- 20261124060700's engine guard refuses every signed-in direct work / rest write (work_rest_engine_only).
-- This file pins the 010500 RLS policies, so the own-row inserts below run with the engine flag on.
DO $$ BEGIN PERFORM set_config('storm.crew_engine', 'on', true); END $$;
SELECT tests.lives(format($q$INSERT INTO public.work_rest_records (id, crew_id, vessel_id, record_date) VALUES (%L, auth.uid(), %L, current_date)$q$, tests.id('wr:a1'), tests.vessel_id('A.hyd')),
                   'an own work / rest record on HYDRA');
DO $$ BEGIN PERFORM set_config('storm.crew_engine', '', true); END $$;
SELECT tests.lives(format($q$INSERT INTO public.work_rest_monthly_submissions (id, crew_id, vessel_id, period_year, period_month) VALUES (%L, auth.uid(), %L, 2026, 11)$q$, tests.id('ws:a1'), tests.vessel_id('A.hyd')),
                   'an own monthly submission on HYDRA');
SELECT tests.lives(format($q$UPDATE public.leave_requests SET end_date = end_date + 1 WHERE id = %L$q$, tests.id('lr:a')), 'an own leave request update on HYDRA');
SELECT tests.ok((SELECT count(*) FROM public.medical_reports WHERE crew_id = auth.uid()) = 1, 'and reads their own medical report');
SELECT tests.reset_role();

-- ------------------------------------------------------------ the A captain cannot plant rows on a B vessel

SELECT tests.as_user(tests.user_id('A.captain'));
SELECT tests.is_empty(format('SELECT 1 FROM public.vessels WHERE id = %L', tests.vessel_id('B.lev')), 'setup: the A captain cannot see B.lev');
SELECT tests.throws(format($q$INSERT INTO public.medical_reports (crew_id, vessel_id, report_number) VALUES (%L, %L, 'MR-PLANTED')$q$, tests.user_id('A.crew_hyd'), tests.vessel_id('B.lev')),
                    '42501', 'a medical report about A crew on B.lev is refused');
SELECT tests.throws(format($q$INSERT INTO public.medical_reports (crew_id, vessel_id, report_number) VALUES (%L, %L, 'MR-B-BY-A')$q$, tests.user_id('B.crew'), tests.vessel_id('B.lev')),
                    '42501', 'and about B crew');
SELECT tests.throws(format($q$INSERT INTO public.hours_of_rest_records (crew_id, vessel_id, record_date, rest_periods) VALUES (%L, %L, current_date - 1, '[]')$q$, tests.user_id('A.crew_hyd'), tests.vessel_id('B.lev')),
                    '42501', 'a rest record for A crew on B.lev is refused');
SELECT tests.throws(format($q$INSERT INTO public.work_rest_records (crew_id, vessel_id, record_date) VALUES (%L, %L, current_date - 1)$q$, tests.user_id('A.crew_hyd'), tests.vessel_id('B.lev')),
                    '42501', 'a work / rest record for A crew on B.lev is refused');
SELECT tests.throws(format($q$UPDATE public.leave_requests SET vessel_id = %L WHERE id = %L$q$, tests.vessel_id('B.lev'), tests.id('lr:a')),
                    '42501', 'nor can the captain re-point an A leave request to B.lev');
SELECT tests.is_empty(format('SELECT 1 FROM public.medical_reports WHERE id = %L', tests.id('mr:b')), 'nor read B''s medical report');
SELECT tests.denied(format($q$UPDATE public.leave_requests SET vessel_id = %L WHERE id = %L RETURNING id$q$, tests.vessel_id('A.dra'), tests.id('lr:b')), 'nor pull B''s leave request into A');
-- Positives: the captain on an A vessel.
SELECT tests.lives(format($q$INSERT INTO public.medical_reports (id, crew_id, vessel_id, report_number) VALUES (%L, %L, %L, 'MR-A-OK')$q$, tests.id('mr:a-ok'), tests.user_id('A.crew_hyd'), tests.vessel_id('A.dra')),
                   'the A captain files a medical report about A crew on an A vessel');
SELECT tests.lives(format($q$INSERT INTO public.medical_reports (id, vessel_id, report_number) VALUES (%L, %L, 'MR-A-NOCREW')$q$, tests.id('mr:a-nocrew'), tests.vessel_id('A.dra')),
                   'and one with no crew member');
SELECT tests.lives(format($q$INSERT INTO public.hours_of_rest_records (id, crew_id, vessel_id, record_date, rest_periods) VALUES (%L, %L, %L, current_date - 1, '[]')$q$, tests.id('hr:cap'), tests.user_id('A.crew_hyd'), tests.vessel_id('A.hyd')),
                   'and a rest record for A crew on an A vessel');
SELECT tests.reset_role();

-- ------------------------------------------------------------ B's DPA sees none of A's rows; A's DPA reads them

SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.results_eq('SELECT report_number::text FROM public.medical_reports', $$VALUES ('MR-B')$$, 'B''s DPA reads B''s medical report only');
SELECT tests.is_empty(format('SELECT 1 FROM public.hours_of_rest_records WHERE crew_id IN (%L, %L)', tests.user_id('A.crew_hyd'), tests.user_id('A.disabled')), 'no A rest record');
SELECT tests.is_empty(format('SELECT 1 FROM public.work_rest_records WHERE crew_id = %L', tests.user_id('A.crew_hyd')), 'no A work / rest record');
SELECT tests.is_empty(format('SELECT 1 FROM public.work_rest_monthly_submissions WHERE crew_id = %L', tests.user_id('A.crew_hyd')), 'no A submission');
SELECT tests.is_empty(format('SELECT 1 FROM public.flight_requests WHERE company_id = %L', tests.company_id('A')), 'no A flight request');
SELECT tests.results_eq('SELECT id FROM public.leave_requests', format('VALUES (%L::uuid)', tests.id('lr:b')), 'B''s leave request only');
SELECT tests.denied(format($q$UPDATE public.flight_requests SET depart_from = 'LHR' WHERE id = %L RETURNING id$q$, tests.id('fr:a1')), 'and cannot update an A flight request');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.ok((SELECT count(*) FROM public.medical_reports WHERE report_number IN ('MR-A', 'MR-A-OK', 'MR-A-NOCREW', 'MR-DIS')) = 4, 'A''s DPA reads A''s medical reports');
SELECT tests.ok((SELECT count(*) FROM public.hours_of_rest_records WHERE id IN (tests.id('hr:a1'), tests.id('hr:cap'), tests.id('hr:disabled'))) = 3, 'and A''s rest records');
SELECT tests.ok((SELECT count(*) FROM public.leave_requests WHERE id IN (tests.id('lr:a'), tests.id('lr:disabled'))) = 2, 'and A''s leave requests');
SELECT tests.is_empty(format('SELECT 1 FROM public.medical_reports WHERE id = %L', tests.id('mr:b')), 'but not B''s');
SELECT tests.reset_role();

-- ------------------------------------------------------------ the helpers

SELECT tests.is(public.vessel_company_of(tests.vessel_id('B.lev')), tests.company_id('B'), 'vessel_company_of answers the real company');
SELECT tests.is(public.vessel_company_of(tests.id('vessel:nobody')), NULL::uuid, 'and NULL for an unknown vessel');
SELECT tests.is(public.profile_company_of(tests.user_id('B.crew')), tests.company_id('B'), 'profile_company_of answers the profile company');
SELECT tests.is(public.profile_company_of(NULL), NULL::uuid, 'and NULL for NULL');
SELECT tests.ok(has_function_privilege('authenticated', f, 'EXECUTE') AND has_function_privilege('service_role', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE'),
                f || ': authenticated + service_role, not anon')
FROM unnest(ARRAY['public.vessel_company_of(uuid)', 'public.profile_company_of(uuid)']) AS f;
SELECT tests.is_empty(
  $q$SELECT policyname FROM pg_policies WHERE schemaname = 'public'
       AND tablename IN ('hours_of_rest_records', 'leave_requests', 'medical_reports', 'work_rest_monthly_submissions', 'work_rest_records')
       AND (coalesce(qual, '') || coalesce(with_check, '')) ~ 'SELECT v\.company_id\s+FROM vessels'$q$,
  'no role-scoped policy resolves a vessel''s company through a subquery under the caller''s RLS');

-- ------------------------------------------------------------ work-rest child rows hang off a readable parent (review round 3)

-- work-rest-own-row-writes-unpinned (D-172, D-193): a note needs at least
-- one parent and every parent it names must be readable by the caller; a
-- block's record, and an NC's or a check's submission, must be readable and
-- belong to the same crew member. Ports scratchpad frr/repro/r2_notes.sql
-- and verify-wr/children.sql.
INSERT INTO public.work_rest_monthly_submissions (id, crew_id, vessel_id, period_year, period_month)
VALUES (tests.id('ws:a-hyd'), tests.user_id('A.crew_hyd'), tests.vessel_id('A.hyd'), 2026, 10);
INSERT INTO public.work_rest_records (id, submission_id, crew_id, vessel_id, record_date)
VALUES (tests.id('wr:a-hyd'), tests.id('ws:a-hyd'), tests.user_id('A.crew_hyd'), tests.vessel_id('A.hyd'), '2026-10-01');
INSERT INTO public.work_rest_blocks (id, record_id, crew_id, block_type, start_minute, end_minute)
VALUES (tests.id('wb:a-hyd'), tests.id('wr:a-hyd'), tests.user_id('A.crew_hyd'), 'work', 0, 240);
-- B's admin cannot see A's parents.
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is_empty(format('SELECT 1 FROM public.work_rest_monthly_submissions WHERE id = %L', tests.id('ws:a-hyd')), 'setup: B''s admin cannot see A''s submission');
SELECT tests.throws(format($q$INSERT INTO public.work_rest_notes (submission_id, author_id, body) VALUES (%L, auth.uid(), 'planted by another tenant')$q$, tests.id('ws:a-hyd')),
                    '42501', 'r2: B''s admin cannot plant a note on A''s submission');
SELECT tests.throws(format($q$INSERT INTO public.work_rest_notes (record_id, author_id, body) VALUES (%L, auth.uid(), 'note on A record by B')$q$, tests.id('wr:a-hyd')),
                    '42501', 'nor on A''s record');
SELECT tests.throws(format($q$INSERT INTO public.work_rest_notes (block_id, author_id, body) VALUES (%L, auth.uid(), 'note on A block by B')$q$, tests.id('wb:a-hyd')),
                    '42501', 'nor on A''s block');
SELECT tests.throws($q$INSERT INTO public.work_rest_notes (author_id, body) VALUES (auth.uid(), 'a note with no parent')$q$,
                    '42501', 'nor a note with no parent at all');
SELECT tests.throws(format($q$INSERT INTO public.work_rest_blocks (record_id, crew_id, block_type, start_minute, end_minute) VALUES (%L, auth.uid(), 'work', 0, 600)$q$, tests.id('wr:a-hyd')),
                    '42501', 'nor a block of their own on A''s record');
SELECT tests.throws(format($q$INSERT INTO public.work_rest_non_conformities (crew_id, submission_id, rule_code, rule_description, window_start, window_end) VALUES (auth.uid(), %L, 'X', 'planted', now(), now())$q$, tests.id('ws:a-hyd')),
                    '42501', 'nor an NC on A''s submission');
SELECT tests.throws(format($q$INSERT INTO public.work_rest_compliance_checks (crew_id, submission_id, check_window, window_start, window_end, rest_minutes, work_minutes, passes) VALUES (auth.uid(), %L, 'daily', now(), now(), 0, 0, false)$q$, tests.id('ws:a-hyd')),
                    '42501', 'nor a compliance check on A''s submission');
SELECT tests.reset_role();
-- Same tenant, another vessel: the DRAAK Master cannot read HYDRA crew's submission.
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is_empty(format('SELECT 1 FROM public.work_rest_monthly_submissions WHERE id = %L', tests.id('ws:a-hyd')), 'setup: the DRAAK Master cannot see the HYDRA submission');
SELECT tests.throws(format($q$INSERT INTO public.work_rest_notes (submission_id, author_id, body) VALUES (%L, auth.uid(), 'same tenant other vessel')$q$, tests.id('ws:a-hyd')),
                    '42501', 'and cannot plant a note on it');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.work_rest_notes WHERE submission_id = tests.id('ws:a-hyd') OR record_id = tests.id('wr:a-hyd') OR block_id = tests.id('wb:a-hyd')), 0::bigint,
                'nothing was planted');
SELECT tests.is((SELECT count(*) FROM public.work_rest_blocks WHERE record_id = tests.id('wr:a-hyd')), 1::bigint, 'the record keeps its one block');
SELECT tests.is((SELECT count(*) FROM public.work_rest_non_conformities WHERE submission_id = tests.id('ws:a-hyd')) + (SELECT count(*) FROM public.work_rest_compliance_checks WHERE submission_id = tests.id('ws:a-hyd')),
                0::bigint, 'and no NC or check');
-- The crew member's own child rows still work.
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.lives(format($q$INSERT INTO public.work_rest_notes (submission_id, author_id, body) VALUES (%L, auth.uid(), 'own note on own submission')$q$, tests.id('ws:a-hyd')), 'an own note on an own submission');
SELECT tests.lives(format($q$INSERT INTO public.work_rest_notes (record_id, block_id, author_id, body) VALUES (%L, %L, auth.uid(), 'own note on own record and block')$q$, tests.id('wr:a-hyd'), tests.id('wb:a-hyd')),
                   'an own note on an own record and block');
-- 20261124060700's engine guard refuses every signed-in direct work / rest write (work_rest_engine_only).
-- This file pins the 010500 RLS policies, so the own-row inserts below run with the engine flag on.
DO $$ BEGIN PERFORM set_config('storm.crew_engine', 'on', true); END $$;
SELECT tests.lives(format($q$INSERT INTO public.work_rest_blocks (record_id, crew_id, block_type, start_minute, end_minute) VALUES (%L, auth.uid(), 'rest', 240, 600)$q$, tests.id('wr:a-hyd')), 'an own block on an own record');
SELECT tests.lives(format($q$INSERT INTO public.work_rest_non_conformities (crew_id, submission_id, rule_code, rule_description, window_start, window_end) VALUES (auth.uid(), %L, 'R1', 'own', now(), now())$q$, tests.id('ws:a-hyd')),
                   'an own NC on an own submission');
SELECT tests.lives(format($q$INSERT INTO public.work_rest_compliance_checks (crew_id, submission_id, check_window, window_start, window_end, rest_minutes, work_minutes, passes) VALUES (auth.uid(), %L, 'daily', now(), now(), 600, 840, true)$q$, tests.id('ws:a-hyd')),
                   'an own compliance check on an own submission');
SELECT tests.lives($q$INSERT INTO public.work_rest_non_conformities (crew_id, rule_code, rule_description, window_start, window_end) VALUES (auth.uid(), 'R2', 'no submission', now(), now())$q$,
                   'an own NC with no submission');
DO $$ BEGIN PERFORM set_config('storm.crew_engine', '', true); END $$;
SELECT tests.ok((SELECT count(*) FROM public.work_rest_notes WHERE submission_id = tests.id('ws:a-hyd') OR record_id = tests.id('wr:a-hyd')) = 2, 'and reads both own notes');
SELECT tests.reset_role();
-- A row of one crew member never attaches to another's parent.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws(format($q$INSERT INTO public.work_rest_blocks (record_id, crew_id, block_type, start_minute, end_minute) VALUES (%L, %L, 'work', 600, 700)$q$, tests.id('wr:a-hyd'), tests.user_id('A.master_dra')),
                    '42501', 'A''s DPA cannot put another crew member''s block on a HYDRA record');
SELECT tests.throws(format($q$INSERT INTO public.work_rest_non_conformities (crew_id, submission_id, rule_code, rule_description, window_start, window_end) VALUES (%L, %L, 'X', 'mismatched', now(), now())$q$, tests.user_id('A.master_dra'), tests.id('ws:a-hyd')),
                    '42501', 'nor another crew member''s NC on that submission');
SELECT tests.reset_role();

-- ------------------------------------------------------------ a vessel-scoped role row confers the role on that vessel only (D-234)

-- Review round 6 (vessel-scoped-user-role-company-wide; scratchpad
-- verify-vsr/repro.sql): A.capt_dra is crew on DRAAK and holds a captain
-- user_roles row with vessel_id = DRAAK. Before D-234 role_vessel_ids()
-- gave every vessel of A and has_any_role(captain) was true, so the
-- captain read, updated, inserted and deleted HYDRA's medical reports and
-- rest records. A company-wide captain row (no vessel) and vessel-scoped
-- dpa / fleet_master rows stay company-wide.
SELECT tests.seed_user('A', 'A.capt_dra', 'crew');
SELECT tests.seed_assignment('A.capt_dra', 'A.dra', true, 'Deckhand');
SELECT tests.seed_user_role('A.capt_dra', 'captain', 'A');
UPDATE public.user_roles SET vessel_id = tests.vessel_id('A.dra') WHERE user_id = tests.user_id('A.capt_dra');
SELECT tests.seed_user('A', 'A.capt_all', 'crew');                  -- a company-wide captain row
SELECT tests.seed_assignment('A.capt_all', 'A.dra', true, 'Deckhand');
SELECT tests.seed_user_role('A.capt_all', 'captain', 'A');
SELECT tests.seed_user('A', 'A.dpa_dra', 'crew');                   -- a vessel-scoped dpa row
SELECT tests.seed_assignment('A.dpa_dra', 'A.dra', true, 'Deckhand');
SELECT tests.seed_user_role('A.dpa_dra', 'dpa', 'A');
UPDATE public.user_roles SET vessel_id = tests.vessel_id('A.dra') WHERE user_id = tests.user_id('A.dpa_dra');
SELECT tests.seed_user('A', 'A.fm_dra', 'crew');                    -- a vessel-scoped fleet_master row
SELECT tests.seed_assignment('A.fm_dra', 'A.dra', true, 'Deckhand');
SELECT tests.seed_user_role('A.fm_dra', 'fleet_master', 'A');
UPDATE public.user_roles SET vessel_id = tests.vessel_id('A.dra') WHERE user_id = tests.user_id('A.fm_dra');
SELECT tests.seed_user('A', 'A.capt_foreign', 'crew');              -- a captain row of A naming B's vessel
SELECT tests.seed_assignment('A.capt_foreign', 'A.dra', true, 'Deckhand');
SELECT tests.seed_user_role('A.capt_foreign', 'captain', 'A');
UPDATE public.user_roles SET vessel_id = tests.vessel_id('B.lev') WHERE user_id = tests.user_id('A.capt_foreign');

INSERT INTO public.medical_reports (id, report_number, crew_id, vessel_id) VALUES
  (tests.id('vsr:mr:hyd'), 'MR-V-HYD', tests.user_id('A.crew_hyd'), tests.vessel_id('A.hyd')),
  (tests.id('vsr:mr:dra'), 'MR-V-DRA', tests.user_id('A.master_dra'), tests.vessel_id('A.dra'));
INSERT INTO public.hours_of_rest_records (id, crew_id, vessel_id, record_date, rest_periods) VALUES
  (tests.id('vsr:hr:hyd'), tests.user_id('A.crew_hyd'), tests.vessel_id('A.hyd'), current_date - 3, '[]'),
  (tests.id('vsr:hr:dra'), tests.user_id('A.master_dra'), tests.vessel_id('A.dra'), current_date - 3, '[]');
INSERT INTO public.leave_requests (id, crew_id, vessel_id, leave_type, start_date, end_date) VALUES
  (tests.id('vsr:lr:hyd'), tests.user_id('A.crew_hyd'), tests.vessel_id('A.hyd'), 'annual', current_date + 30, current_date + 35),
  (tests.id('vsr:lr:dra'), tests.user_id('A.master_dra'), tests.vessel_id('A.dra'), 'annual', current_date + 30, current_date + 35);
INSERT INTO public.flight_requests (id, crew_id, company_id, vessel_id, request_number, request_type, depart_from, arrive_to, earliest_departure_date) VALUES
  (tests.id('vsr:fr:hyd'), tests.user_id('A.crew_hyd'), tests.company_id('A'), tests.vessel_id('A.hyd'), 'FR-V-HYD', 'crew_change', 'NCE', 'PMI', current_date + 7),
  (tests.id('vsr:fr:dra'), tests.user_id('A.master_dra'), tests.company_id('A'), tests.vessel_id('A.dra'), 'FR-V-DRA', 'crew_change', 'NCE', 'PMI', current_date + 7),
  (tests.id('vsr:fr:none'), tests.user_id('A.master_dra'), tests.company_id('A'), NULL, 'FR-V-NONE', 'crew_change', 'NCE', 'PMI', current_date + 7);

CREATE TEMP TABLE vsr_names ON COMMIT DROP AS
SELECT * FROM (VALUES (tests.vessel_id('A.dra'), 'DRA'), (tests.vessel_id('A.hyd'), 'HYD'), (tests.vessel_id('A.gam'), 'GAM'), (tests.vessel_id('B.lev'), 'LEV')) AS t(id, name);
GRANT SELECT ON vsr_names TO authenticated;

SELECT tests.as_user(tests.user_id('A.capt_dra'));
SELECT tests.is((SELECT string_agg(n.name, ',' ORDER BY n.name) FROM public.role_vessel_ids(ARRAY['captain']::public.app_role[]) AS r JOIN vsr_names AS n ON n.id = r),
                'DRA', 'vessel-scoped captain: role_vessel_ids(captain) = {DRA}');
SELECT tests.is(public.has_role_on_vessel_in_company(auth.uid(), ARRAY['captain']::public.app_role[], tests.vessel_id('A.dra')), true, 'has_role_on_vessel_in_company: DRA');
SELECT tests.is(public.has_role_on_vessel_in_company(auth.uid(), ARRAY['captain']::public.app_role[], tests.vessel_id('A.hyd')), false, 'has_role_on_vessel_in_company: not HYD');
SELECT tests.is(public.has_role_on_vessel_in_company(auth.uid(), ARRAY['captain']::public.app_role[], tests.vessel_id('B.lev')), false, 'has_role_on_vessel_in_company: not B''s vessel');
SELECT tests.is(public.has_role_on_vessel_in_company(auth.uid(), ARRAY['captain']::public.app_role[], NULL), false, 'has_role_on_vessel_in_company: NULL vessel -> false');
SELECT tests.is(public.has_role_on_vessel_in_company(auth.uid(), ARRAY['captain']::public.app_role[], tests.id('vsr:no-such-vessel')), false, 'has_role_on_vessel_in_company: unknown vessel -> false');
SELECT tests.is(public.has_role_on_vessel_in_company(tests.user_id('A.capt_all'), ARRAY['captain']::public.app_role[], tests.vessel_id('A.dra')), false, 'has_role_on_vessel_in_company: no probing of another user');
SELECT tests.is(public.has_role_in_company(auth.uid(), ARRAY['captain']::public.app_role[], tests.company_id('A')), false, 'has_role_in_company(captain, A) is false: the row is vessel-scoped');
SELECT tests.is(public.has_any_role(auth.uid(), ARRAY['captain']::public.app_role[]), false, 'has_any_role(captain) is false (company-wide rows only)');
SELECT tests.is(public.hr_can_edit(auth.uid()), false, 'so hr_can_edit is false (a vessel-scoped captain loses legacy HRIS edit, fail closed)');
SELECT tests.is((SELECT count(*) FROM public.role_company_user_ids(ARRAY['captain']::public.app_role[])), 0::bigint, 'role_company_user_ids(captain) is empty');
-- HYDRA: nothing.
SELECT tests.is_empty(format('SELECT 1 FROM public.medical_reports WHERE id = %L', tests.id('vsr:mr:hyd')), 'vessel-scoped captain reads no HYDRA medical report');
SELECT tests.denied(format($q$UPDATE public.medical_reports SET report_number = 'MR-V-HYD-X' WHERE id = %L RETURNING id$q$, tests.id('vsr:mr:hyd')), 'nor updates it');
SELECT tests.denied(format($q$DELETE FROM public.medical_reports WHERE id = %L RETURNING id$q$, tests.id('vsr:mr:hyd')), 'nor deletes it');
SELECT tests.throws(format($q$INSERT INTO public.medical_reports (crew_id, vessel_id, report_number) VALUES (%L, %L, 'MR-V-HYD-NEW')$q$, tests.user_id('A.crew_hyd'), tests.vessel_id('A.hyd')), '42501', 'nor inserts a HYDRA medical report');
SELECT tests.is_empty(format('SELECT 1 FROM public.hours_of_rest_records WHERE id = %L', tests.id('vsr:hr:hyd')), 'reads no HYDRA rest record');
SELECT tests.denied(format($q$UPDATE public.hours_of_rest_records SET rest_periods = '[{}]' WHERE id = %L RETURNING id$q$, tests.id('vsr:hr:hyd')), 'nor updates it');
SELECT tests.denied(format($q$DELETE FROM public.hours_of_rest_records WHERE id = %L RETURNING id$q$, tests.id('vsr:hr:hyd')), 'nor deletes it');
SELECT tests.throws(format($q$INSERT INTO public.hours_of_rest_records (crew_id, vessel_id, record_date, rest_periods) VALUES (%L, %L, current_date, '[]')$q$, tests.user_id('A.crew_hyd'), tests.vessel_id('A.hyd')), '42501', 'nor inserts one');
SELECT tests.is_empty(format('SELECT 1 FROM public.leave_requests WHERE id = %L', tests.id('vsr:lr:hyd')), 'reads no HYDRA leave request');
SELECT tests.denied(format($q$UPDATE public.leave_requests SET end_date = end_date + 1 WHERE id = %L RETURNING id$q$, tests.id('vsr:lr:hyd')), 'nor updates it');
SELECT tests.denied(format($q$DELETE FROM public.leave_requests WHERE id = %L RETURNING id$q$, tests.id('vsr:lr:hyd')), 'nor deletes it');
SELECT tests.throws(format($q$INSERT INTO public.leave_requests (crew_id, vessel_id, leave_type, start_date, end_date) VALUES (%L, %L, 'annual', current_date, current_date + 1)$q$, tests.user_id('A.crew_hyd'), tests.vessel_id('A.hyd')), '42501', 'nor inserts one');
SELECT tests.is_empty(format('SELECT 1 FROM public.flight_requests WHERE id = %L', tests.id('vsr:fr:hyd')), 'reads no HYDRA flight request');
SELECT tests.is_empty(format('SELECT 1 FROM public.flight_requests WHERE id = %L', tests.id('vsr:fr:none')), 'nor a vessel-less flight request of the company (company-level)');
SELECT tests.denied(format($q$UPDATE public.flight_requests SET arrive_to = 'LHR' WHERE id = %L RETURNING id$q$, tests.id('vsr:fr:hyd')), 'nor updates the HYDRA flight request');
SELECT tests.denied(format($q$DELETE FROM public.flight_requests WHERE id = %L RETURNING id$q$, tests.id('vsr:fr:hyd')), 'nor deletes it');
SELECT tests.throws(format($q$INSERT INTO public.flight_requests (crew_id, company_id, vessel_id, request_number, request_type, depart_from, arrive_to, earliest_departure_date) VALUES (%L, %L, %L, 'FR-V-HYD2', 'crew_change', 'NCE', 'PMI', current_date)$q$, tests.user_id('A.crew_hyd'), tests.company_id('A'), tests.vessel_id('A.hyd')),
                    '42501', 'nor inserts a HYDRA flight request');
SELECT tests.throws(format($q$INSERT INTO public.flight_requests (crew_id, company_id, request_number, request_type, depart_from, arrive_to, earliest_departure_date) VALUES (%L, %L, 'FR-V-NONE2', 'crew_change', 'NCE', 'PMI', current_date)$q$, tests.user_id('A.crew_hyd'), tests.company_id('A')),
                    '42501', 'nor a vessel-less one for someone else');
-- DRAAK: the captain's own vessel works.
SELECT tests.is((SELECT count(*) FROM public.medical_reports WHERE id = tests.id('vsr:mr:dra')), 1::bigint, 'vessel-scoped captain reads the DRAAK medical report');
SELECT tests.lives(format($q$UPDATE public.medical_reports SET report_number = 'MR-V-DRA-X' WHERE id = %L$q$, tests.id('vsr:mr:dra')), 'updates it');
SELECT tests.lives(format($q$INSERT INTO public.medical_reports (id, crew_id, vessel_id, report_number) VALUES (%L, %L, %L, 'MR-V-DRA-NEW')$q$, tests.id('vsr:mr:dra-new'), tests.user_id('A.master_dra'), tests.vessel_id('A.dra')), 'inserts one on DRAAK');
SELECT tests.lives(format($q$DELETE FROM public.medical_reports WHERE id = %L$q$, tests.id('vsr:mr:dra-new')), 'deletes it');
SELECT tests.is((SELECT count(*) FROM public.hours_of_rest_records WHERE id = tests.id('vsr:hr:dra')), 1::bigint, 'reads the DRAAK rest record');
SELECT tests.lives(format($q$UPDATE public.hours_of_rest_records SET rest_periods = '[{}]' WHERE id = %L$q$, tests.id('vsr:hr:dra')), 'updates it');
SELECT tests.lives(format($q$INSERT INTO public.hours_of_rest_records (id, crew_id, vessel_id, record_date, rest_periods) VALUES (%L, %L, %L, current_date, '[]')$q$, tests.id('vsr:hr:dra-new'), tests.user_id('A.master_dra'), tests.vessel_id('A.dra')), 'inserts one on DRAAK');
SELECT tests.lives(format($q$DELETE FROM public.hours_of_rest_records WHERE id = %L$q$, tests.id('vsr:hr:dra-new')), 'deletes it');
SELECT tests.is((SELECT count(*) FROM public.leave_requests WHERE id = tests.id('vsr:lr:dra')), 1::bigint, 'reads the DRAAK leave request');
SELECT tests.lives(format($q$UPDATE public.leave_requests SET end_date = end_date + 1 WHERE id = %L$q$, tests.id('vsr:lr:dra')), 'updates it');
SELECT tests.is((SELECT count(*) FROM public.flight_requests WHERE id = tests.id('vsr:fr:dra')), 1::bigint, 'reads the DRAAK flight request');
SELECT tests.lives(format($q$UPDATE public.flight_requests SET arrive_to = 'LHR' WHERE id = %L$q$, tests.id('vsr:fr:dra')), 'updates it');
SELECT tests.lives(format($q$INSERT INTO public.flight_requests (id, crew_id, company_id, vessel_id, request_number, request_type, depart_from, arrive_to, earliest_departure_date) VALUES (%L, %L, %L, %L, 'FR-V-DRA2', 'crew_change', 'NCE', 'PMI', current_date)$q$, tests.id('vsr:fr:dra-new'), tests.user_id('A.master_dra'), tests.company_id('A'), tests.vessel_id('A.dra')),
                   'inserts one on DRAAK');
SELECT tests.lives(format($q$DELETE FROM public.flight_requests WHERE id = %L$q$, tests.id('vsr:fr:dra-new')), 'deletes it');
SELECT tests.throws(format($q$INSERT INTO public.flight_requests (crew_id, company_id, vessel_id, request_number, request_type, depart_from, arrive_to, earliest_departure_date) VALUES (%L, %L, %L, 'FR-V-X', 'crew_change', 'NCE', 'PMI', current_date)$q$, tests.user_id('A.master_dra'), tests.company_id('B'), tests.vessel_id('A.dra')),
                    '42501', 'but never a DRAAK flight request filed under company B');
SELECT tests.reset_role();
SELECT tests.is((SELECT report_number FROM public.medical_reports WHERE id = tests.id('vsr:mr:hyd')), 'MR-V-HYD', 'the HYDRA medical report is unchanged');
SELECT tests.is((SELECT count(*) FROM public.hours_of_rest_records WHERE id = tests.id('vsr:hr:hyd')), 1::bigint, 'the HYDRA rest record is still there');
SELECT tests.is((SELECT end_date FROM public.leave_requests WHERE id = tests.id('vsr:lr:hyd')), current_date + 35, 'the HYDRA leave request is unchanged');
SELECT tests.is((SELECT arrive_to FROM public.flight_requests WHERE id = tests.id('vsr:fr:hyd')), 'PMI', 'the HYDRA flight request is unchanged');

-- Controls: a company-wide captain row reaches every vessel of A; a
-- vessel-scoped dpa or fleet_master row stays company-wide; a row naming
-- another company's vessel gives nothing.
SELECT tests.as_user(tests.user_id('A.capt_all'));
SELECT tests.is((SELECT string_agg(n.name, ',' ORDER BY n.name) FROM public.role_vessel_ids(ARRAY['captain']::public.app_role[]) AS r JOIN vsr_names AS n ON n.id = r),
                'DRA,GAM,HYD', 'company-wide captain: role_vessel_ids(captain) = {DRA, GAM, HYD}');
SELECT tests.is((SELECT count(*) FROM public.medical_reports WHERE id = tests.id('vsr:mr:hyd')), 1::bigint, 'company-wide captain reads the HYDRA medical report');
SELECT tests.is((SELECT count(*) FROM public.flight_requests WHERE id = tests.id('vsr:fr:none')), 1::bigint, 'and the vessel-less flight request');
SELECT tests.is(public.has_any_role(auth.uid(), ARRAY['captain']::public.app_role[]), true, 'company-wide captain: has_any_role(captain)');
SELECT tests.is(public.hr_can_edit(auth.uid()), true, 'company-wide captain: hr_can_edit');
SELECT tests.as_user(tests.user_id('A.dpa_dra'));
SELECT tests.is((SELECT string_agg(n.name, ',' ORDER BY n.name) FROM public.role_vessel_ids(ARRAY['dpa']::public.app_role[]) AS r JOIN vsr_names AS n ON n.id = r),
                'DRA,GAM,HYD', 'a vessel-scoped dpa row stays company-wide');
SELECT tests.is(public.has_role_in_company(auth.uid(), ARRAY['dpa']::public.app_role[], tests.company_id('A')), true, 'and has_role_in_company(dpa, A)');
SELECT tests.is(public.has_any_role(auth.uid(), ARRAY['dpa']::public.app_role[]), true, 'and has_any_role(dpa)');
SELECT tests.is((SELECT count(*) FROM public.medical_reports WHERE id = tests.id('vsr:mr:hyd')), 1::bigint, 'and reads the HYDRA medical report');
SELECT tests.as_user(tests.user_id('A.fm_dra'));
SELECT tests.is((SELECT string_agg(n.name, ',' ORDER BY n.name) FROM public.role_vessel_ids(ARRAY['fleet_master']::public.app_role[]) AS r JOIN vsr_names AS n ON n.id = r),
                'DRA,GAM,HYD', 'a vessel-scoped fleet_master row stays company-wide');
SELECT tests.is(public.has_any_role(auth.uid(), ARRAY['fleet_master']::public.app_role[]), true, 'and has_any_role(fleet_master)');
SELECT tests.as_user(tests.user_id('A.capt_foreign'));
SELECT tests.is((SELECT count(*) FROM public.role_vessel_ids(ARRAY['captain']::public.app_role[])), 0::bigint, 'a captain row of A naming B''s vessel gives no vessel');
SELECT tests.is(public.has_role_on_vessel_in_company(auth.uid(), ARRAY['captain']::public.app_role[], tests.vessel_id('B.lev')), false, 'nor the vessel itself');
SELECT tests.is(public.has_any_role(auth.uid(), ARRAY['captain']::public.app_role[]), false, 'nor has_any_role(captain)');
SELECT tests.reset_role();

-- ------------------------------------------------------------ a vessel delete removes its vessel-scoped grants (D-245; review round 7)

-- user-roles-vessel-delete-widens (scratchpad r6sec/a1_vessel_delete_widens_role.sql):
-- user_roles_vessel_id_fkey was ON DELETE SET NULL, and under D-234 a NULL
-- vessel_id is company-wide, so deleting a vessel turned its vessel-scoped
-- captain into a company-wide captain (every vessel, legacy HRIS edit). It
-- is ON DELETE CASCADE now, like rbac_user_roles, and access_change_audit()
-- writes vessel_scope NULL for a vessel that is gone (the vessel id stays
-- in before_state), so an authorised delete succeeds and is audited.
SELECT tests.seed_vessel('A', 'A.tmp1', 'TEMP ONE');
SELECT tests.seed_user('A', 'A.capt_tmp', 'crew');
SELECT tests.seed_user_role('A.capt_tmp', 'captain', 'A');
UPDATE public.user_roles SET vessel_id = tests.vessel_id('A.tmp1') WHERE user_id = tests.user_id('A.capt_tmp');
SELECT tests.seed_rbac_role('A.capt_tmp', 'purser', 'A.tmp1');
SELECT tests.as_user(tests.user_id('A.capt_tmp'));
SELECT tests.is(public.has_role_in_company(auth.uid(), ARRAY['captain']::public.app_role[], tests.company_id('A')), false, 'setup: the TEMP ONE captain is no company-wide captain');
SELECT tests.is((SELECT array_agg(r) FROM public.role_vessel_ids(ARRAY['captain']::public.app_role[]) AS r), ARRAY[tests.vessel_id('A.tmp1')], 'setup: role_vessel_ids(captain) = {TEMP ONE}');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format('DELETE FROM public.vessels WHERE id = %L', tests.vessel_id('A.tmp1')), 'the fleet manager deletes TEMP ONE (its vessel-scoped grants cascade, audited)');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.user_roles WHERE user_id = tests.user_id('A.capt_tmp')), 0::bigint, 'the captain''s user_roles row is gone (no company-wide row with a NULL vessel is left)');
SELECT tests.is((SELECT count(*) FROM public.rbac_user_roles WHERE user_id = tests.user_id('A.capt_tmp')), 0::bigint, 'and so is the RBAC purser row');
SELECT tests.is((SELECT count(*) FROM public.permission_audit_log
                  WHERE target_user_id = tests.user_id('A.capt_tmp') AND action_type = 'role_removed'
                    AND vessel_scope IS NULL AND before_state ->> 'vessel_id' = tests.vessel_id('A.tmp1')::text), 2::bigint,
                'both removals are audited (role_removed, vessel_scope NULL, the vessel in before_state)');
SELECT tests.as_user(tests.user_id('A.capt_tmp'));
SELECT tests.is(public.has_role_in_company(auth.uid(), ARRAY['captain']::public.app_role[], tests.company_id('A')), false, 'after the delete: no captain in A');
SELECT tests.is(public.has_role_on_vessel_in_company(auth.uid(), ARRAY['captain']::public.app_role[], tests.vessel_id('A.hyd')), false, 'nor on HYDRA');
SELECT tests.is((SELECT count(*) FROM public.role_vessel_ids(ARRAY['captain']::public.app_role[])), 0::bigint, 'role_vessel_ids(captain) is empty');
SELECT tests.is(public.hr_can_edit(auth.uid()), false, 'and no legacy HRIS edit');
SELECT tests.reset_role();
-- Without a JWT (the SQL editor, the service role) the delete cascades too,
-- and the audit trigger writes nothing.
SELECT tests.seed_vessel('A', 'A.tmp2', 'TEMP TWO');
SELECT tests.seed_user('A', 'A.capt_tmp2', 'crew');
SELECT tests.seed_user_role('A.capt_tmp2', 'captain', 'A');
UPDATE public.user_roles SET vessel_id = tests.vessel_id('A.tmp2') WHERE user_id = tests.user_id('A.capt_tmp2');
SELECT tests.lives(format('DELETE FROM public.vessels WHERE id = %L', tests.vessel_id('A.tmp2')), 'without a JWT the vessel delete cascades too');
SELECT tests.is((SELECT count(*) FROM public.user_roles WHERE user_id = tests.user_id('A.capt_tmp2')), 0::bigint, 'the TEMP TWO captain row is gone');
SELECT tests.is((SELECT count(*) FROM public.permission_audit_log WHERE target_user_id = tests.user_id('A.capt_tmp2')), 0::bigint, 'and no audit row is written without a JWT');
SELECT tests.is((SELECT confdeltype::text FROM pg_constraint WHERE conrelid = 'public.user_roles'::regclass AND conname = 'user_roles_vessel_id_fkey'), 'c',
                'user_roles_vessel_id_fkey is ON DELETE CASCADE');

-- ------------------------------------------------------------ role-branch writes name a person of the row's company (D-247; review round 7)

-- role-branch-writes-foreign-subject (scratchpad verify-frp/repro*.sql,
-- r6sec/a2_foreign_crew_plant.sql): the WITH CHECK of "Authorized users can
-- manage flight requests" and of "Officers can create tasks" pinned the
-- vessel but not the person, so a captain of A planted a flight request or
-- a task naming a user of B, which that user read and updated; the legacy
-- crew_tasks update policy let a task be re-pointed after a legitimate
-- insert, and its has_fleet_access read showed every tenant's tasks.
-- profile_company_of(crew_id / assigned_to) = company_id now pins them; an
-- unknown id is 42501 as well (no profiles-FK existence oracle).
SELECT tests.seed_user('A', 'A.co_dra', 'crew');                    -- a vessel-scoped chief officer on DRAAK
SELECT tests.seed_assignment('A.co_dra', 'A.dra', true, 'Chief Officer');
SELECT tests.seed_user_role('A.co_dra', 'chief_officer', 'A');
UPDATE public.user_roles SET vessel_id = tests.vessel_id('A.dra') WHERE user_id = tests.user_id('A.co_dra');

-- Flight requests: the company-wide captain and the DRAAK-only captain.
DO $$
DECLARE p text;
BEGIN
  FOREACH p IN ARRAY ARRAY['A.captain', 'A.capt_dra'] LOOP
    PERFORM tests.as_user(tests.user_id(p));
    PERFORM tests.throws(format($q$INSERT INTO public.flight_requests (crew_id, company_id, vessel_id, request_number, request_type, depart_from, arrive_to, earliest_departure_date) VALUES (%L, %L, %L, 'FR-PLANT', 'crew_change', 'NCE', 'PMI', current_date)$q$,
                                tests.user_id('B.crew'), tests.company_id('A'), tests.vessel_id('A.dra')),
                         '42501', p || ': no DRAAK flight request for B''s crew member');
    PERFORM tests.throws(format($q$INSERT INTO public.flight_requests (crew_id, company_id, vessel_id, request_number, request_type, depart_from, arrive_to, earliest_departure_date) VALUES (%L, %L, %L, 'FR-RAND', 'crew_change', 'NCE', 'PMI', current_date)$q$,
                                gen_random_uuid(), tests.company_id('A'), tests.vessel_id('A.dra')),
                         '42501', p || ': nor for an unknown id (42501, not the profiles FK: no existence oracle)');
    PERFORM tests.lives(format($q$INSERT INTO public.flight_requests (id, crew_id, company_id, vessel_id, request_number, request_type, depart_from, arrive_to, earliest_departure_date) VALUES (%L, %L, %L, %L, %L, 'crew_change', 'NCE', 'PMI', current_date)$q$,
                               tests.id('d247:fr:' || p), tests.user_id('A.master_dra'), tests.company_id('A'), tests.vessel_id('A.dra'), 'FR-OK-' || p),
                        p || ': a DRAAK flight request for A''s Master lives');
    PERFORM tests.throws(format($q$UPDATE public.flight_requests SET crew_id = %L WHERE id = %L$q$, tests.user_id('B.crew'), tests.id('d247:fr:' || p)),
                         '42501', p || ': and cannot be re-pointed to B''s crew member');
  END LOOP;
END
$$;
SELECT tests.as_user(tests.user_id('A.captain'));
SELECT tests.throws(format($q$INSERT INTO public.flight_requests (crew_id, company_id, request_number, request_type, depart_from, arrive_to, earliest_departure_date) VALUES (%L, %L, 'FR-PLANT-NV', 'crew_change', 'NCE', 'PMI', current_date)$q$,
                           tests.user_id('B.crew'), tests.company_id('A')),
                    '42501', 'A.captain: nor a vessel-less one for B''s crew member');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.flight_requests WHERE crew_id = tests.user_id('B.crew')), 0::bigint, 'no flight request names B''s crew member');

-- Crew tasks: inserts.
SELECT tests.as_user(tests.user_id('A.captain'));
SELECT tests.throws(format($q$INSERT INTO public.crew_tasks (company_id, vessel_id, title, task_type, assigned_to, assigned_by) VALUES (%L, NULL, 'T-PLANT', 'task', %L, auth.uid())$q$, tests.company_id('A'), tests.user_id('B.crew')),
                    '42501', 'A.captain: no vessel-less task for B''s crew member');
SELECT tests.throws(format($q$INSERT INTO public.crew_tasks (company_id, vessel_id, title, task_type, assigned_to, assigned_by) VALUES (%L, %L, 'T-PLANT', 'task', %L, auth.uid())$q$, tests.company_id('A'), tests.vessel_id('A.dra'), tests.user_id('B.crew')),
                    '42501', 'A.captain: nor a DRAAK task for them');
SELECT tests.throws(format($q$INSERT INTO public.crew_tasks (company_id, vessel_id, title, task_type, assigned_to, assigned_by) VALUES (%L, NULL, 'T-RAND', 'task', %L, auth.uid())$q$, tests.company_id('A'), gen_random_uuid()),
                    '42501', 'A.captain: nor for an unknown id (42501, not the profiles FK)');
SELECT tests.lives(format($q$INSERT INTO public.crew_tasks (id, company_id, vessel_id, title, task_type, assigned_to, assigned_by) VALUES (%L, %L, NULL, 'T-CAP', 'task', %L, auth.uid())$q$, tests.id('d247:ct:cap'), tests.company_id('A'), tests.user_id('A.crew_hyd')),
                   'A.captain: a task for HYDRA crew lives');
SELECT tests.as_user(tests.user_id('A.capt_dra'));
SELECT tests.throws(format($q$INSERT INTO public.crew_tasks (company_id, vessel_id, title, task_type, assigned_to, assigned_by) VALUES (%L, %L, 'T-PLANT', 'task', %L, auth.uid())$q$, tests.company_id('A'), tests.vessel_id('A.dra'), tests.user_id('B.crew')),
                    '42501', 'A.capt_dra: no DRAAK task for B''s crew member');
SELECT tests.as_user(tests.user_id('A.co_dra'));
SELECT tests.throws(format($q$INSERT INTO public.crew_tasks (company_id, vessel_id, title, task_type, assigned_to, assigned_by) VALUES (%L, %L, 'T-PLANT', 'task', %L, auth.uid())$q$, tests.company_id('A'), tests.vessel_id('A.dra'), tests.user_id('B.crew')),
                    '42501', 'A.co_dra: no DRAAK task for B''s crew member');
SELECT tests.throws(format($q$INSERT INTO public.crew_tasks (company_id, vessel_id, title, task_type, assigned_to, assigned_by) VALUES (%L, %L, 'T-RAND', 'task', %L, auth.uid())$q$, tests.company_id('A'), tests.vessel_id('A.dra'), gen_random_uuid()),
                    '42501', 'A.co_dra: nor for an unknown id');
SELECT tests.lives(format($q$INSERT INTO public.crew_tasks (id, company_id, vessel_id, title, task_type, assigned_to, assigned_by) VALUES (%L, %L, %L, 'T-CO', 'task', %L, auth.uid())$q$, tests.id('d247:ct:co'), tests.company_id('A'), tests.vessel_id('A.dra'), tests.user_id('A.master_dra')),
                   'A.co_dra: a DRAAK task for the Master lives');
SELECT tests.reset_role();
-- Crew tasks: updates never re-point a task to another tenant or its people.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('A.captain', 'd247:ct:cap'), ('A.co_dra', 'd247:ct:co')) AS v(persona, task_key) LOOP
    PERFORM tests.as_user(tests.user_id(r.persona));
    PERFORM tests.throws(format($q$UPDATE public.crew_tasks SET assigned_to = %L WHERE id = %L$q$, tests.user_id('B.crew'), tests.id(r.task_key)),
                         '42501', r.persona || ': cannot re-point their task to B''s crew member');
    PERFORM tests.throws(format($q$UPDATE public.crew_tasks SET company_id = %L WHERE id = %L$q$, tests.company_id('B'), tests.id(r.task_key)),
                         '42501', r.persona || ': nor move it to company B');
  END LOOP;
END
$$;
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.crew_tasks WHERE assigned_to = tests.user_id('B.crew') OR company_id = tests.company_id('B')), 0::bigint,
                'no task names B''s crew member or company B');

-- Rows planted before the fix (no JWT here): a task and a flight request of
-- A naming B's crew member, and a booking on the request.
INSERT INTO public.crew_tasks (id, company_id, vessel_id, title, task_type, assigned_to, assigned_by)
VALUES (tests.id('d247:ct:plant'), tests.company_id('A'), tests.vessel_id('A.dra'), 'T-PLANTED', 'task', tests.user_id('B.crew'), tests.user_id('A.captain'));
INSERT INTO public.flight_requests (id, crew_id, company_id, vessel_id, request_number, request_type, depart_from, arrive_to, earliest_departure_date)
VALUES (tests.id('d247:fr:plant'), tests.user_id('B.crew'), tests.company_id('A'), tests.vessel_id('A.dra'), 'FR-PLANTED', 'crew_change', 'NCE', 'PMI', current_date + 7);
INSERT INTO public.flight_bookings (id, flight_request_id, airline, flight_number)
VALUES (tests.id('d247:fb:plant'), tests.id('d247:fr:plant'), 'XX', 'XX1');
SELECT tests.as_user(tests.user_id('B.crew'));
SELECT tests.is((SELECT count(*) FROM public.crew_tasks), 0::bigint, 'B''s crew member reads no task of A (not even the one naming them)');
SELECT tests.is((SELECT count(*) FROM public.flight_requests WHERE company_id = tests.company_id('A')), 0::bigint, 'nor the planted flight request');
SELECT tests.is((SELECT count(*) FROM public.flight_bookings WHERE id = tests.id('d247:fb:plant')), 0::bigint, 'nor its booking');
SELECT tests.denied(format($q$UPDATE public.crew_tasks SET status = 'completed' WHERE id = %L RETURNING id$q$, tests.id('d247:ct:plant')), 'and cannot complete the planted task');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is((SELECT count(*) FROM public.crew_tasks WHERE company_id = tests.company_id('A')), 0::bigint, 'B''s DPA reads no task of A (the has_fleet_access read is gone)');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is((SELECT count(*) FROM public.crew_tasks WHERE id IN (tests.id('d247:ct:cap'), tests.id('d247:ct:co'), tests.id('d247:ct:plant'))), 3::bigint, 'A''s DPA reads A''s tasks, the planted one included');
SELECT tests.lives(format($q$UPDATE public.crew_tasks SET status = 'in_progress' WHERE id = %L$q$, tests.id('d247:ct:co')), 'and updates one');
SELECT tests.lives(format($q$DELETE FROM public.crew_tasks WHERE id = %L$q$, tests.id('d247:ct:plant')), 'and deletes the planted one');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is((SELECT count(*) FROM public.crew_tasks WHERE id = tests.id('d247:ct:cap')), 1::bigint, 'HYDRA crew read their own task');
SELECT tests.lives(format($q$UPDATE public.crew_tasks SET status = 'completed' WHERE id = %L$q$, tests.id('d247:ct:cap')), 'and complete it');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT id, status FROM public.crew_tasks WHERE id IN (%L, %L, %L)$q$, tests.id('d247:ct:cap'), tests.id('d247:ct:co'), tests.id('d247:ct:plant')),
                        format($q$VALUES (%L::uuid, 'completed'::text), (%L::uuid, 'in_progress'::text)$q$, tests.id('d247:ct:cap'), tests.id('d247:ct:co')),
                        'the tasks as left: completed, in progress, the planted one deleted');
SELECT tests.ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'crew_tasks' AND policyname = 'Officers can create tasks' AND with_check LIKE '%profile_company_of%')
                AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'flight_requests' AND policyname = 'Authorized users can manage flight requests' AND with_check LIKE '%profile_company_of%')
                AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'crew_tasks' AND coalesce(qual, '') LIKE '%has_fleet_access%'),
                'the pins are in place and no crew_tasks policy reads has_fleet_access');
