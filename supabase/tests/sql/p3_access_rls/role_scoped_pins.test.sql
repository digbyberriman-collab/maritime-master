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
SELECT tests.lives(format($q$INSERT INTO public.work_rest_records (id, crew_id, vessel_id, record_date) VALUES (%L, auth.uid(), %L, current_date)$q$, tests.id('wr:a1'), tests.vessel_id('A.hyd')),
                   'an own work / rest record on HYDRA');
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
SELECT tests.lives(format($q$INSERT INTO public.work_rest_blocks (record_id, crew_id, block_type, start_minute, end_minute) VALUES (%L, auth.uid(), 'rest', 240, 600)$q$, tests.id('wr:a-hyd')), 'an own block on an own record');
SELECT tests.lives(format($q$INSERT INTO public.work_rest_non_conformities (crew_id, submission_id, rule_code, rule_description, window_start, window_end) VALUES (auth.uid(), %L, 'R1', 'own', now(), now())$q$, tests.id('ws:a-hyd')),
                   'an own NC on an own submission');
SELECT tests.lives(format($q$INSERT INTO public.work_rest_compliance_checks (crew_id, submission_id, check_window, window_start, window_end, rest_minutes, work_minutes, passes) VALUES (auth.uid(), %L, 'daily', now(), now(), 600, 840, true)$q$, tests.id('ws:a-hyd')),
                   'an own compliance check on an own submission');
SELECT tests.lives($q$INSERT INTO public.work_rest_non_conformities (crew_id, rule_code, rule_description, window_start, window_end) VALUES (auth.uid(), 'R2', 'no submission', now(), now())$q$,
                   'an own NC with no submission');
SELECT tests.ok((SELECT count(*) FROM public.work_rest_notes WHERE submission_id = tests.id('ws:a-hyd') OR record_id = tests.id('wr:a-hyd')) = 2, 'and reads both own notes');
SELECT tests.reset_role();
-- A row of one crew member never attaches to another's parent.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws(format($q$INSERT INTO public.work_rest_blocks (record_id, crew_id, block_type, start_minute, end_minute) VALUES (%L, %L, 'work', 600, 700)$q$, tests.id('wr:a-hyd'), tests.user_id('A.master_dra')),
                    '42501', 'A''s DPA cannot put another crew member''s block on a HYDRA record');
SELECT tests.throws(format($q$INSERT INTO public.work_rest_non_conformities (crew_id, submission_id, rule_code, rule_description, window_start, window_end) VALUES (%L, %L, 'X', 'mismatched', now(), now())$q$, tests.user_id('A.master_dra'), tests.id('ws:a-hyd')),
                    '42501', 'nor another crew member''s NC on that submission');
SELECT tests.reset_role();
