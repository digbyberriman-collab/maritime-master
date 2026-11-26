-- vessel_company_of() / profile_company_of() are no cross-tenant oracle
-- (review round 3, company-of-definers-oracle; D-122, D-192): both answer
-- only a caller of that company (user_belongs_to_company, so an active
-- member), a superadmin there (has_role_in_company; a company-less
-- superadmin row counts anywhere) or no JWT; NULL for anyone else, a
-- disabled caller included. The role-scoped policies of 20261123010500
-- resolve a row with a vessel through the vessel only (CASE, never a
-- coalesce with the crew member's company), so a mis-paired legacy row (A
-- crew on a B vessel) is invisible to A's DPA. Ports scratchpad
-- frr/repro/r3_probe.sql.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user_role('A.fleet_manager', 'dpa', 'A');
SELECT tests.seed_user_role('B.admin', 'dpa', 'B');
-- Platform staff: a company-less superadmin row (D-192).
SELECT tests.seed_user('A', 'A.platform', 'crew');
SELECT tests.seed_user_role('A.platform', 'superadmin', NULL);
-- A B vessel-only medical report, and a mis-paired legacy row: A crew on a B vessel.
INSERT INTO public.medical_reports (id, report_number, crew_id, vessel_id) VALUES
  (tests.id('mr:bv'), 'MR-BV', NULL, tests.vessel_id('B.lev')),
  (tests.id('mr:mix'), 'MR-MIX', tests.user_id('A.crew_hyd'), tests.vessel_id('B.lev'));

-- ------------------------------------------------------------ the helpers

SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is_empty(format('SELECT 1 FROM public.vessels WHERE id = %L', tests.vessel_id('A.hyd')), 'setup: B''s admin cannot see HYDRA');
SELECT tests.is(public.vessel_company_of(tests.vessel_id('A.hyd')), NULL::uuid, 'r3: B''s admin learns nothing about an A vessel');
SELECT tests.is(public.profile_company_of(tests.user_id('A.crew_hyd')), NULL::uuid, 'r3: nor about an A user');
SELECT tests.is(public.vessel_company_of(tests.vessel_id('B.lev')), tests.company_id('B'), 'but answers for their own vessel');
SELECT tests.is(public.profile_company_of(tests.user_id('B.admin')), tests.company_id('B'), 'and their own company''s people');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is(public.vessel_company_of(tests.vessel_id('A.hyd')), NULL::uuid, 'a disabled user gets NULL, even for their own company''s vessel');
SELECT tests.is(public.profile_company_of(tests.user_id('B.admin')), NULL::uuid, 'and NULL for another company''s user');
SELECT tests.is(public.profile_company_of(tests.user_id('A.crew_hyd')), NULL::uuid, 'and for their own company''s');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(public.vessel_company_of(tests.vessel_id('A.hyd')), tests.company_id('A'), 'A''s DPA gets A for an A vessel');
SELECT tests.is(public.profile_company_of(tests.user_id('A.crew_hyd')), tests.company_id('A'), 'and for an A user');
SELECT tests.is(public.vessel_company_of(tests.vessel_id('B.lev')), NULL::uuid, 'and NULL for a B vessel');
SELECT tests.is(public.vessel_company_of(tests.id('vessel:nobody')), NULL::uuid, 'and NULL for an unknown vessel');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.platform'));
SELECT tests.is(public.vessel_company_of(tests.vessel_id('B.lev')), tests.company_id('B'), 'the company-less superadmin gets B for B.lev (D-192)');
SELECT tests.is(public.profile_company_of(tests.user_id('B.admin')), tests.company_id('B'), 'and for a B user');
SELECT tests.ok((SELECT count(*) FROM public.medical_reports WHERE id = tests.id('mr:bv')) = 1, 'and still reads the B vessel-only medical report');
SELECT tests.reset_role();
SELECT tests.as_service();
SELECT tests.is(public.vessel_company_of(tests.vessel_id('A.hyd')), tests.company_id('A'), 'the service role (no JWT user) gets the real company');
SELECT tests.is(public.profile_company_of(tests.user_id('B.admin')), tests.company_id('B'), 'for people too');
SELECT tests.reset_role();
SELECT tests.is(public.vessel_company_of(tests.vessel_id('A.hyd')), tests.company_id('A'), 'no JWT (a migration) too');

-- ------------------------------------------------------------ the policies never fall back from the vessel to the crew member

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is_empty(format('SELECT 1 FROM public.medical_reports WHERE id = %L', tests.id('mr:mix')), 'A''s DPA does not read a mis-paired row (A crew on a B vessel)');
SELECT tests.denied(format('DELETE FROM public.medical_reports WHERE id = %L RETURNING id', tests.id('mr:mix')), 'nor delete it');
SELECT tests.is_empty(format('SELECT 1 FROM public.medical_reports WHERE id = %L', tests.id('mr:bv')), 'nor the B vessel-only row');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.medical_reports WHERE id IN (tests.id('mr:mix'), tests.id('mr:bv'))), 2::bigint, 'both rows are still there');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.ok((SELECT count(*) FROM public.medical_reports WHERE id IN (tests.id('mr:mix'), tests.id('mr:bv'))) = 2, 'B''s DPA (the vessel''s company) reads both');
SELECT tests.reset_role();
SELECT tests.is_empty(
  $q$SELECT policyname FROM pg_policies WHERE schemaname = 'public'
       AND tablename IN ('hours_of_rest_records', 'leave_requests', 'medical_reports', 'work_rest_monthly_submissions', 'work_rest_records')
       AND (coalesce(qual, '') || coalesce(with_check, '')) ~* 'coalesce\(vessel_company_of'$q$,
  'no role-scoped policy coalesces the vessel''s company with the crew member''s');
SELECT tests.is((SELECT count(DISTINCT tablename) FROM pg_policies WHERE schemaname = 'public'
                   AND tablename IN ('hours_of_rest_records', 'leave_requests', 'medical_reports', 'work_rest_monthly_submissions', 'work_rest_records')
                   AND (coalesce(qual, '') || coalesce(with_check, '')) ~ 'CASE\s+WHEN \((\w+\.)?vessel_id IS NOT NULL\) THEN has_role_on_vessel_in_company'),
                5::bigint, 'all five vessel-else-crew tables decide a vessel row by CASE on the vessel (the vessel role check, D-234)');
SELECT tests.ok(has_function_privilege('authenticated', f, 'EXECUTE') AND has_function_privilege('service_role', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE'),
                f || ': grants unchanged (authenticated + service_role, not anon)')
FROM unnest(ARRAY['public.vessel_company_of(uuid)', 'public.profile_company_of(uuid)']) AS f;
