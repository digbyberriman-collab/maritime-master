-- The engine-flag guards fail closed when storm.crew_engine was never
-- defined in the session (Phase 3 wave 1 review, A1; D-370).
--
-- A fresh PostgREST backend has no storm.crew_engine placeholder until a
-- definer calls set_config on it, so current_setting(..., true) is NULL. The
-- guards read the flag null-safe (coalesce(..., '') = 'on'); before the fix
-- `NOT v_engine` was NULL and the guard was skipped. This file runs in its
-- own psql backend and asserts the GUC is still undefined before every
-- refused write, so no earlier definer call can define it first:
--   1. crew_leave_requests_status_guard (060900): a crew member's direct
--      INSERT of an 'approved' request with a forged Master as reviewer;
--   2. frp_rotation_assignments_status_guard (060900): a 'hod' (frp_can_edit)
--      direct INSERT of a 'confirmed' holiday period with a forged approver
--      and a backdated approval;
--   3. familiarization_records_status_guard and familiarization_templates_guard
--      (061000): a signed-in direct write (claims set, row security out of
--      the way) is refused by the guard itself;
--   4. controls: the draft / pending direct writes the guards allow still
--      succeed, and the refused rows were never written.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user('A', 'A.cook_dra', 'crew');
SELECT tests.seed_assignment('A.cook_dra', 'A.dra', true, 'Chef');
SELECT tests.seed_user('A', 'A.hod_dra', 'crew');
SELECT tests.seed_assignment('A.hod_dra', 'A.dra', true, 'Chief Officer');
SELECT tests.seed_user_role('A.hod_dra', 'hod', 'A');

SELECT tests.ok(current_setting('storm.crew_engine', true) IS NULL, 'the seeded backend has never defined storm.crew_engine');

-- ------------------------------------------------------------ 1. leave request, crew member
SELECT tests.as_user(tests.user_id('A.cook_dra'));
SELECT tests.ok(current_setting('storm.crew_engine', true) IS NULL, 'as the cook: storm.crew_engine is undefined (NULL)');
SELECT tests.throws_like(format($q$
  INSERT INTO public.crew_leave_requests (crew_id, leave_type, start_date, end_date, company_id, vessel_id, status,
                                          reviewed_by, reviewed_at, hod_reviewed_by, hod_reviewed_at)
  VALUES (%L, 'L', current_date + 5, current_date + 30, %L, %L, 'approved', %L, now() - interval '3 days', %L, now() - interval '4 days')$q$,
  tests.user_id('A.cook_dra'), tests.company_id('A'), tests.vessel_id('A.dra'), tests.user_id('A.master_dra'), tests.user_id('A.master_dra')),
  '42501', 'leave_request_engine_only', 'GUC undefined: a crew self-approved leave request with a forged reviewer is refused');
SELECT tests.throws_like(format($q$
  INSERT INTO public.crew_leave_requests (crew_id, leave_type, start_date, end_date, company_id, vessel_id, status)
  VALUES (%L, 'L', current_date + 40, current_date + 45, %L, %L, 'approved')$q$,
  tests.user_id('A.cook_dra'), tests.company_id('A'), tests.vessel_id('A.dra')),
  '42501', 'leave_request_engine_only', 'GUC undefined: an approved request without reviewer columns is refused too');
SELECT tests.ok(current_setting('storm.crew_engine', true) IS NULL, 'the refusals did not define the GUC');
SELECT tests.lives(format($q$
  INSERT INTO public.crew_leave_requests (id, crew_id, leave_type, start_date, end_date, company_id, vessel_id, status)
  VALUES (%L, %L, 'L', current_date + 50, current_date + 55, %L, %L, 'pending')$q$,
  tests.id('x170:pending'), tests.user_id('A.cook_dra'), tests.company_id('A'), tests.vessel_id('A.dra')),
  'control: a pending direct request still saves');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.crew_leave_requests WHERE crew_id = tests.user_id('A.cook_dra'))::integer, 1,
                'only the pending request was written');
SELECT tests.is((SELECT status FROM public.crew_leave_requests WHERE id = tests.id('x170:pending')), 'pending', 'the control request stays pending');

-- ------------------------------------------------------------ 2. planner period, legacy hod
SELECT tests.as_user(tests.user_id('A.hod_dra'));
SELECT tests.ok(current_setting('storm.crew_engine', true) IS NULL, 'as the hod: storm.crew_engine is still undefined');
SELECT tests.ok(public.frp_can_edit(auth.uid()), 'the hod passes the legacy frp_can_edit write policy');
SELECT tests.throws_like(format($q$
  INSERT INTO public.frp_rotation_assignments (company_id, vessel_id, profile_id, start_date, end_date, rotation_type, leave_type_key,
                                               status, approved_by, approved_at)
  VALUES (%L, %L, %L, current_date + 5, current_date + 9, 'leave', 'holiday', 'confirmed', %L, now() - interval '10 days')$q$,
  tests.company_id('A'), tests.vessel_id('A.dra'), tests.profile_id('A.cook_dra'), tests.user_id('A.fleet_manager')),
  '42501', 'planner_engine_only', 'GUC undefined: a confirmed, approved period written directly is refused');
SELECT tests.throws_like(format($q$
  INSERT INTO public.frp_rotation_assignments (company_id, vessel_id, profile_id, start_date, end_date, rotation_type, status)
  VALUES (%L, %L, %L, current_date + 12, current_date + 14, 'leave', 'confirmed')$q$,
  tests.company_id('A'), tests.vessel_id('A.dra'), tests.profile_id('A.cook_dra')),
  '42501', 'planner_engine_only', 'GUC undefined: a confirmed period without approval columns is refused too');
SELECT tests.ok(current_setting('storm.crew_engine', true) IS NULL, 'the refusals did not define the GUC');
SELECT tests.lives(format($q$
  INSERT INTO public.frp_rotation_assignments (id, company_id, vessel_id, profile_id, start_date, end_date, rotation_type, status)
  VALUES (%L, %L, %L, %L, current_date + 20, current_date + 24, 'leave', 'draft')$q$,
  tests.id('x170:draft'), tests.company_id('A'), tests.vessel_id('A.dra'), tests.profile_id('A.cook_dra')),
  'control: a draft bar still saves');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.frp_rotation_assignments WHERE profile_id = tests.profile_id('A.cook_dra'))::integer, 1,
                'only the draft bar was written');
SELECT tests.is((SELECT count(*) FROM public.crew_leave_entries WHERE crew_id = tests.user_id('A.cook_dra'))::integer, 0,
                'no day codes were materialised');

-- ------------------------------------------------------------ 3. familiarisation, signed-in writer
-- Claims only (the superuser keeps its role, so row security does not
-- answer first): the guard itself must refuse.
SELECT tests._set_claims(jsonb_build_object('sub', tests.user_id('A.master_dra'), 'role', 'authenticated'));
SELECT tests.ok(auth.uid() = tests.user_id('A.master_dra') AND current_setting('storm.crew_engine', true) IS NULL,
                'signed in as the Master, storm.crew_engine still undefined');
SELECT tests.throws_like(format($q$
  INSERT INTO public.familiarization_templates (company_id, vessel_id, template_name) VALUES (%L, %L, 'Direct template')$q$,
  tests.company_id('A'), tests.vessel_id('A.dra')),
  '42501', 'familiarisation_engine_only', 'GUC undefined: a direct template write is refused');
SELECT tests.throws_like(format($q$
  INSERT INTO public.familiarization_records (user_id, vessel_id, join_date, target_completion_date, status)
  VALUES (%L, %L, current_date, current_date + 7, 'completed')$q$,
  tests.user_id('A.cook_dra'), tests.vessel_id('A.dra')),
  '42501', 'familiarisation_engine_only', 'GUC undefined: a direct completed familiarisation record is refused');
SELECT tests.ok(current_setting('storm.crew_engine', true) IS NULL, 'the refusals did not define the GUC');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.familiarization_records WHERE user_id = tests.user_id('A.cook_dra'))::integer, 0,
                'no familiarisation record was written');
-- control: no-JWT maintenance (the SQL editor, the owner's import) stays exempt
SELECT tests.lives(format($q$
  INSERT INTO public.familiarization_records (id, user_id, vessel_id, join_date, target_completion_date, status)
  VALUES (%L, %L, %L, current_date, current_date + 7, 'Not_Started')$q$,
  tests.id('x170:fam'), tests.user_id('A.cook_dra'), tests.vessel_id('A.dra')),
  'control: a no-JWT maintenance insert still saves');
SELECT tests.is((SELECT status FROM public.familiarization_records WHERE id = tests.id('x170:fam')), 'open', 'and its legacy status is mapped');

-- ------------------------------------------------------------ 4. the declarations
SELECT tests.ok(pg_get_functiondef(f::regprocedure) LIKE '%coalesce(current_setting(''storm.crew_engine'', true), '''') = ''on''%',
                'null-safe flag read: ' || f)
FROM unnest(ARRAY['public.crew_leave_requests_status_guard()', 'public.frp_rotation_assignments_status_guard()',
                  'public.familiarization_templates_guard()', 'public.familiarization_records_status_guard()']) AS f;
SELECT tests.ok(pg_get_functiondef(f::regprocedure) LIKE '%coalesce(current_setting(''storm.fleet_tx'', true), '''') = ''on''%',
                'null-safe flag read: ' || f)
FROM unnest(ARRAY['public.form_templates_guard()', 'public.development_applications_guard()']) AS f;
