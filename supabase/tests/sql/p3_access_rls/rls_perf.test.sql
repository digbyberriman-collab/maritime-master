-- RLS read cost and equivalence (review round 5, rls-helper-per-row-slowdown;
-- D-229). The policy helpers are LANGUAGE plpgsql (PostgreSQL 17 and
-- earlier never inline a SECURITY DEFINER SQL function and plan a nested
-- non-inlined SQL function again on every call), and the read policies of
-- profiles, crew_assignments, hours_of_rest_records, the work / rest
-- tables, leave_requests, medical_reports and the flight tables compute
-- the caller-only work once per statement ((SELECT auth.uid()),
-- (SELECT user_is_active(auth.uid())), role_vessel_ids() /
-- role_company_user_ids(), user_vessel_reach()). This file seeds a fleet in
-- the test (company P: 40 vessels, about 4,000 crew with logins and
-- assignments, about 50,000 work_rest_records over one month, about 20,000
-- hours_of_rest_records; company Q: another tenant; small sets on the other
-- tables, vessel-less rows where the column allows NULL:
-- hours_of_rest_records, work_rest_records and the monthly submissions
-- require a vessel) and proves, for seven callers (a DPA, a captain who
-- does not reach every vessel, a purser, crew, a disabled crew member, a
-- company-Q user and a company-less superadmin):
--   (i)  equivalence: the row count under RLS (tests.as_user) equals the
--        round-4 policies, frozen verbatim below: the counts under those
--        policies (swapped in inside this rolled-back transaction), and, for
--        the tables whose round-4 USING reads no other RLS table (profiles,
--        hours_of_rest_records, work_rest_records), the round-4 predicate
--        evaluated as postgres with the same request.jwt.claims;
--   (ii) the time budget, measured on the second of two runs under the
--        8 s statement timeout: full-table reads under 2 s, one vessel-month
--        under 300 ms, profiles under 300 ms.
-- Adapted from scratchpad verify-perf/seed.sql and seed-wr.sql.

-- ------------------------------------------------------------ seed (company P: the fleet; company Q: another tenant)

SET LOCAL statement_timeout = '120s';
SELECT tests.seed_company('P', 'Perf Fleet');
SELECT tests.seed_company('Q', 'Other Fleet');
INSERT INTO public.vessels (id, company_id, name, status, code, created_at)
SELECT tests.id('rp:vessel:' || g), tests.company_id('P'), 'PERF VESSEL ' || g, 'Active', 'P' || lpad(g::text, 2, '0'), '2026-01-01T00:00:00Z'::timestamptz + g * interval '1 minute'
FROM generate_series(1, 40) AS g;
INSERT INTO public.vessels (id, company_id, name, status, code, created_at)
SELECT tests.id('rp:qvessel:' || g), tests.company_id('Q'), 'OTHER VESSEL ' || g, 'Active', 'Q' || lpad(g::text, 2, '0'), '2026-01-01T00:00:00Z'::timestamptz + g * interval '1 minute'
FROM generate_series(1, 2) AS g;

-- 4,000 crew of P (logins, profiles, one current assignment each) and 50 of Q.
CREATE TEMP TABLE rp_crew ON COMMIT DROP AS
SELECT g, 'P'::text AS co, tests.id('rp:user:' || g) AS uid, tests.id('rp:profile:' || g) AS pid, tests.id('rp:vessel:' || (1 + g % 40)) AS vid
FROM generate_series(1, 4000) AS g
UNION ALL
SELECT 10000 + g, 'Q', tests.id('rp:quser:' || g), tests.id('rp:qprofile:' || g), tests.id('rp:qvessel:' || (1 + g % 2))
FROM generate_series(1, 50) AS g;
INSERT INTO auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'perf-crew-' || g || '@example.test', now(),
       '{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb, now(), now()
FROM rp_crew;
INSERT INTO public.profiles (id, user_id, email, first_name, last_name, company_id, role, account_status)
SELECT pid, uid, 'perf-crew-' || g || '@example.test', 'Crew', 'P' || g, tests.company_id(co), 'crew', 'active'
FROM rp_crew;
INSERT INTO public.crew_assignments (id, user_id, vessel_id, position, join_date, is_current)
SELECT tests.id('rp:assignment:' || g), uid, vid, 'Deckhand', current_date - 60, true FROM rp_crew;

-- The callers.
SELECT tests.seed_user('P', 'P.dpa', 'dpa');
SELECT tests.seed_user_role('P.dpa', 'dpa', 'P');
SELECT tests.seed_user('P', 'P.captain', 'master');
SELECT tests.seed_user_role('P.captain', 'captain', 'P');
SELECT tests.seed_assignment('P.captain', 'rp:none', true, 'Master', jsonb_build_object('vessel_id', tests.id('rp:vessel:3')));
SELECT tests.seed_user('P', 'P.purser', 'crew');
SELECT tests.seed_user_role('P.purser', 'purser', 'P');
SELECT tests.seed_assignment('P.purser', 'rp:none', true, 'Purser', jsonb_build_object('vessel_id', tests.id('rp:vessel:5')));
SELECT tests.seed_user('P', 'P.crew', 'crew');
SELECT tests.seed_assignment('P.crew', 'rp:none', true, 'Deckhand', jsonb_build_object('vessel_id', tests.id('rp:vessel:3')));
SELECT tests.seed_user('P', 'P.disabled', 'crew', 'disabled');
SELECT tests.seed_assignment('P.disabled', 'rp:none', true, 'Deckhand', jsonb_build_object('vessel_id', tests.id('rp:vessel:3')));
SELECT tests.seed_user('Q', 'Q.dpa', 'dpa');
SELECT tests.seed_user_role('Q.dpa', 'dpa', 'Q');
-- A company-less superadmin (platform staff; their profile is in Q, so they are active).
SELECT tests.seed_user('Q', 'X.super', 'crew');
SELECT tests.seed_user_role('X.super', 'superadmin', NULL);
INSERT INTO rp_crew (g, co, uid, pid, vid)
SELECT 20000 + n, c, tests.user_id(k), tests.profile_id(k), v
FROM (VALUES (1, 'P', 'P.captain', tests.id('rp:vessel:3')), (2, 'P', 'P.purser', tests.id('rp:vessel:5')), (3, 'P', 'P.crew', tests.id('rp:vessel:3')),
             (4, 'P', 'P.disabled', tests.id('rp:vessel:3'))) AS t(n, c, k, v);

-- About 20,000 hours_of_rest_records (5 days per crew member) and about
-- 50,000 work_rest_records (October 2026, 31 days for 1,600 crew of P and
-- every crew member of Q, and the personas).
INSERT INTO public.hours_of_rest_records (crew_id, vessel_id, record_date, rest_periods)
SELECT c.uid, c.vid, current_date - d, '[]'::jsonb FROM rp_crew AS c, generate_series(1, 5) AS d;
INSERT INTO public.work_rest_records (id, crew_id, vessel_id, record_date, total_rest_minutes, is_compliant)
SELECT tests.id('rp:wr:' || c.g || ':' || d), c.uid, c.vid, date '2026-10-01' + (d - 1), 600, true
FROM rp_crew AS c, generate_series(1, 31) AS d
WHERE c.g <= 1600 OR c.g > 10000;

-- The smaller tables, with rows of both companies, vessel-less rows where
-- the column allows NULL, and rows of the personas.
INSERT INTO public.leave_requests (crew_id, vessel_id, leave_type, start_date, end_date)
SELECT c.uid, CASE WHEN c.g % 10 = 0 THEN NULL ELSE c.vid END, 'annual', current_date + 10, current_date + 20
FROM rp_crew AS c WHERE c.g <= 200 OR c.g BETWEEN 10001 AND 10010 OR c.g > 20000;
INSERT INTO public.medical_reports (crew_id, vessel_id, report_number)
SELECT c.uid, CASE WHEN c.g % 10 = 0 THEN NULL ELSE c.vid END, 'MR-' || c.g
FROM rp_crew AS c WHERE c.g <= 200 OR c.g BETWEEN 10001 AND 10010 OR c.g > 20000;
INSERT INTO public.medical_reports (crew_id, vessel_id, report_number)
SELECT NULL, CASE WHEN g % 2 = 0 THEN tests.id('rp:vessel:3') END, 'MR-ANON-' || g FROM generate_series(1, 6) AS g;
INSERT INTO public.flight_requests (id, crew_id, company_id, vessel_id, request_number, request_type, depart_from, arrive_to, earliest_departure_date)
SELECT tests.id('rp:fr:' || c.g), c.uid, tests.company_id(c.co), CASE WHEN c.g % 5 = 0 THEN NULL ELSE c.vid END, 'FR-' || c.g, 'crew_change', 'NCE', 'PMI', current_date + 7
FROM rp_crew AS c WHERE c.g <= 100 OR c.g BETWEEN 10001 AND 10010 OR c.g > 20000;
INSERT INTO public.flight_bookings (flight_request_id, airline, flight_number)
SELECT id, 'XX', 'XX' || row_number() OVER () FROM public.flight_requests WHERE request_number LIKE 'FR-%';
INSERT INTO public.work_rest_monthly_submissions (id, crew_id, vessel_id, period_year, period_month)
SELECT tests.id('rp:ws:' || c.g), c.uid, c.vid, 2026, 10
FROM rp_crew AS c WHERE c.g <= 200 OR c.g BETWEEN 10001 AND 10010 OR c.g > 20000;
INSERT INTO public.work_rest_blocks (record_id, crew_id, block_type, start_minute, end_minute)
SELECT r.id, r.crew_id, 'work', 0, 240 FROM public.work_rest_records AS r
WHERE r.record_date = date '2026-10-01' AND r.crew_id IN (SELECT uid FROM rp_crew WHERE g <= 100 OR g BETWEEN 10001 AND 10010 OR g > 20000);
INSERT INTO public.work_rest_compliance_checks (crew_id, submission_id, check_window, window_start, window_end, rest_minutes, work_minutes, passes)
SELECT c.uid, CASE WHEN c.g % 4 = 0 THEN NULL ELSE tests.id('rp:ws:' || c.g) END, 'daily', '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z', 600, 840, true
FROM rp_crew AS c WHERE c.g <= 100 OR c.g BETWEEN 10001 AND 10010 OR c.g > 20000;
INSERT INTO public.work_rest_non_conformities (crew_id, submission_id, rule_code, rule_description, window_start, window_end)
SELECT c.uid, CASE WHEN c.g % 4 = 0 THEN NULL ELSE tests.id('rp:ws:' || c.g) END, 'MLC_24H', 'Rest under 10 h', '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z'
FROM rp_crew AS c WHERE c.g <= 100 OR c.g BETWEEN 10001 AND 10010 OR c.g > 20000;
INSERT INTO public.work_rest_audit_log (submission_id, crew_id, action)
SELECT tests.id('rp:ws:' || c.g), CASE WHEN c.g % 5 = 0 THEN NULL ELSE c.uid END, 'submitted'
FROM rp_crew AS c WHERE c.g <= 200 OR c.g BETWEEN 10001 AND 10010 OR c.g > 20000;
INSERT INTO public.work_rest_audit_log (submission_id, crew_id, action) VALUES (NULL, NULL, 'orphan');
INSERT INTO public.work_rest_notes (submission_id, record_id, author_id, body)
SELECT CASE WHEN c.g % 2 = 0 THEN tests.id('rp:ws:' || c.g) END, CASE WHEN c.g % 2 = 1 THEN tests.id('rp:wr:' || c.g || ':1') END, c.uid, 'note'
FROM rp_crew AS c WHERE (c.g <= 100 OR c.g BETWEEN 10001 AND 10010 OR c.g > 20000);
INSERT INTO public.work_rest_signatures (submission_id, signer_id, signer_role)
SELECT tests.id('rp:ws:' || c.g), c.uid, 'crew' FROM rp_crew AS c WHERE c.g <= 100 OR c.g BETWEEN 10001 AND 10010 OR c.g > 20000;
INSERT INTO public.work_rest_rule_sets (company_id, vessel_id, name) VALUES
  (tests.company_id('P'), NULL, 'P default'), (NULL, tests.id('rp:vessel:3'), 'P vessel 3'), (NULL, NULL, 'Global'), (tests.company_id('Q'), NULL, 'Q default');
ANALYZE public.profiles, public.crew_assignments, public.hours_of_rest_records, public.work_rest_records, public.vessels, public.user_roles, public.account_memberships;

SELECT tests.ok((SELECT count(*) FROM public.profiles WHERE company_id = tests.company_id('P')) >= 4000, 'seed: about 4,000 profiles in P');
SELECT tests.ok((SELECT count(*) FROM public.work_rest_records) >= 49000, format('seed: %s work_rest_records', (SELECT count(*) FROM public.work_rest_records)));
SELECT tests.ok((SELECT count(*) FROM public.hours_of_rest_records) >= 20000, format('seed: %s hours_of_rest_records', (SELECT count(*) FROM public.hours_of_rest_records)));
SELECT tests.ok((SELECT count(*) FROM public.leave_requests WHERE vessel_id IS NULL) > 0 AND (SELECT count(*) FROM public.medical_reports WHERE vessel_id IS NULL) > 0,
                'seed: vessel-less leave requests and medical reports');
SELECT tests.ok(NOT public.reach_vessel_for(tests.user_id('P.captain'), tests.id('rp:vessel:4')) AND public.reach_vessel_for(tests.user_id('P.captain'), tests.id('rp:vessel:3')),
                'seed: the captain reaches vessel 3 only (not every vessel)');
SELECT tests.ok(NOT public.user_is_active(tests.user_id('P.disabled')), 'seed: the disabled crew member is not active');

-- The callers and the tables (with a sample filter for the big tables, so
-- the round-4 counts stay quick).
CREATE TEMP TABLE rp_callers (key text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO rp_callers VALUES ('P.dpa'), ('P.captain'), ('P.purser'), ('P.crew'), ('P.disabled'), ('Q.dpa'), ('X.super');
CREATE TEMP TABLE rp_tables (tbl text PRIMARY KEY, filter text NOT NULL, predicate_oracle boolean NOT NULL) ON COMMIT DROP;
INSERT INTO rp_tables VALUES
  ('profiles', 'true', true),
  ('crew_assignments', 'true', false),
  ('hours_of_rest_records', format('vessel_id = ANY (%L::uuid[])', ARRAY[tests.id('rp:vessel:1'), tests.id('rp:vessel:3'), tests.id('rp:vessel:5'), tests.id('rp:qvessel:1')]), true),
  ('work_rest_records', format('vessel_id = ANY (%L::uuid[])', ARRAY[tests.id('rp:vessel:1'), tests.id('rp:vessel:3'), tests.id('rp:vessel:5'), tests.id('rp:qvessel:1')]), true),
  ('leave_requests', 'true', false), ('medical_reports', 'true', false), ('flight_requests', 'true', false), ('flight_bookings', 'true', false),
  ('work_rest_monthly_submissions', 'true', false), ('work_rest_blocks', 'true', false), ('work_rest_compliance_checks', 'true', false),
  ('work_rest_non_conformities', 'true', false), ('work_rest_audit_log', 'true', false), ('work_rest_notes', 'true', false),
  ('work_rest_signatures', 'true', false), ('work_rest_rule_sets', 'true', false);
CREATE TEMP TABLE rp_counts (phase text, caller text, tbl text, n bigint, PRIMARY KEY (phase, caller, tbl)) ON COMMIT DROP;
CREATE TEMP TABLE rp_timing (caller text, label text, ms numeric, budget_ms numeric, rows bigint, PRIMARY KEY (caller, label)) ON COMMIT DROP;
GRANT ALL ON rp_callers, rp_tables, rp_counts, rp_timing TO PUBLIC;

-- Counts of every table for one caller, under RLS (the caller's session).
CREATE FUNCTION tests.rp_count_as(p_phase text, p_caller text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  t record;
  v_n bigint;
BEGIN
  PERFORM tests.as_user(tests.user_id(p_caller));
  FOR t IN SELECT * FROM rp_tables ORDER BY tbl LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %s', t.tbl, t.filter) INTO v_n;
    INSERT INTO rp_counts VALUES (p_phase, p_caller, t.tbl, v_n);
  END LOOP;
  PERFORM tests.reset_role();
END;
$$;
-- The installed policies' USING, OR-ed, evaluated as postgres (no RLS)
-- with the caller's claims.
CREATE FUNCTION tests.rp_count_predicate(p_caller text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  t record;
  v_quals text;
  v_n bigint;
BEGIN
  PERFORM tests.reset_role();
  PERFORM tests._set_claims(jsonb_build_object('sub', tests.user_id(p_caller), 'role', 'authenticated', 'aud', 'authenticated'));
  FOR t IN SELECT * FROM rp_tables WHERE predicate_oracle ORDER BY tbl LOOP
    SELECT string_agg('(' || p.qual || ')', ' OR ') INTO v_quals
    FROM pg_policies AS p
    WHERE p.schemaname = 'public' AND p.tablename = t.tbl AND p.cmd IN ('SELECT', 'ALL') AND p.permissive = 'PERMISSIVE'
      AND p.roles && ARRAY['public', 'authenticated']::name[];
    EXECUTE format('SELECT count(*) FROM public.%I WHERE (%s) AND (%s)', t.tbl, t.filter, coalesce(v_quals, 'false')) INTO v_n;
    INSERT INTO rp_counts VALUES ('predicate', p_caller, t.tbl, v_n);
  END LOOP;
  PERFORM tests.reset_role();
END;
$$;
-- The second of two runs of a read, in ms, as the caller.
CREATE FUNCTION tests.rp_time(p_caller text, p_label text, p_sql text, p_budget_ms numeric) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_t0 timestamptz;
  v_n bigint;
  v_ms numeric;
BEGIN
  PERFORM tests.as_user(tests.user_id(p_caller));
  EXECUTE p_sql INTO v_n;
  v_t0 := clock_timestamp();
  EXECUTE p_sql INTO v_n;
  v_ms := round(extract(epoch FROM clock_timestamp() - v_t0) * 1000, 1);
  PERFORM tests.reset_role();
  INSERT INTO rp_timing VALUES (p_caller, p_label, v_ms, p_budget_ms, v_n);
END;
$$;
GRANT EXECUTE ON FUNCTION tests.rp_count_as(text, text), tests.rp_count_predicate(text), tests.rp_time(text, text, text, numeric) TO PUBLIC;

-- ------------------------------------------------------------ (ii) the time budget (the shipped policies)

SET LOCAL statement_timeout = '8s';
-- Each read runs twice as the caller; the second run is timed.
SELECT format($f$SELECT tests.rp_time(%L, %L, %L, %s)$f$, c.key, m.label, m.sql, m.budget)
FROM (VALUES ('P.dpa'), ('P.captain'), ('P.purser'), ('P.crew')) AS c(key)
CROSS JOIN (VALUES
  ('hours_of_rest_records, full table', 'SELECT count(*) FROM public.hours_of_rest_records', 2000),
  ('work_rest_records, full table', 'SELECT count(*) FROM public.work_rest_records', 2000),
  ('work_rest_records, one vessel-month', format($q$SELECT count(*) FROM public.work_rest_records WHERE vessel_id = %L AND record_date BETWEEN '2026-10-01' AND '2026-10-31'$q$, tests.id('rp:vessel:3')), 300),
  ('profiles, full table', 'SELECT count(*) FROM public.profiles', 300),
  ('crew list of one vessel (profiles x crew_assignments)',
   format($q$SELECT count(*) FROM public.profiles AS p JOIN public.crew_assignments AS ca ON ca.user_id = p.user_id WHERE ca.vessel_id = %L AND ca.is_current$q$, tests.id('rp:vessel:3')), 300)
) AS m(label, sql, budget)
ORDER BY c.key, m.label \gexec

SELECT tests.ok(t.ms < t.budget_ms, format('budget: %s as %s: %s ms for %s rows (second run; budget %s ms)', t.label, t.caller, t.ms, t.rows, t.budget_ms))
FROM rp_timing AS t ORDER BY t.caller, t.label;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM rp_timing ORDER BY label, caller LOOP
    RAISE NOTICE '# rls timing: % as %: % ms (% rows)', r.label, r.caller, r.ms, r.rows;
  END LOOP;
END
$$;
SELECT tests.ok((SELECT rows FROM rp_timing WHERE caller = 'P.captain' AND label = 'hours_of_rest_records, full table') >= 20000,
                'the captain (user_roles captain of P) reads every P rest record through the role set');
SELECT tests.ok((SELECT rows FROM rp_timing WHERE caller = 'P.crew' AND label = 'hours_of_rest_records, full table') = 5,
                'a crew member reads only their own five rest records');

-- The shipped read policies no longer call a definer per row in their role branch.
SELECT tests.is_empty(
  $q$SELECT tablename, policyname FROM pg_policies
     WHERE schemaname = 'public' AND cmd IN ('SELECT', 'ALL')
       AND tablename IN ('hours_of_rest_records', 'work_rest_records', 'work_rest_monthly_submissions', 'leave_requests', 'medical_reports',
                         'work_rest_blocks', 'work_rest_compliance_checks', 'work_rest_non_conformities', 'work_rest_audit_log', 'work_rest_notes', 'work_rest_signatures')
       AND (qual ~ 'has_role_in_company\(' OR qual ~ 'user_company_for_admin\(' OR qual ~ 'vessel_company_of\(' OR qual ~ 'user_can_reach_vessel\(')$q$,
  'no read policy of the hot tables calls has_role_in_company / vessel_company_of / user_company_for_admin / user_can_reach_vessel per row in USING');
SELECT tests.is_empty(
  $q$SELECT tablename, policyname FROM pg_policies
     WHERE schemaname = 'public' AND cmd IN ('SELECT', 'ALL') AND tablename IN ('profiles', 'crew_assignments', 'work_rest_rule_sets')
       AND qual ~ 'user_belongs_to_company\('$q$,
  'nor user_belongs_to_company on profiles, crew_assignments and the rule sets (the caller''s company is an initplan)');
SELECT tests.ok((SELECT bool_and(l.lanname = 'plpgsql') FROM pg_proc AS p JOIN pg_language AS l ON l.oid = p.prolang
                 WHERE p.pronamespace = 'public'::regnamespace
                   AND p.proname IN ('user_is_active', 'user_belongs_to_company', 'get_user_company_id', 'has_role_in_company', 'vessel_company_of',
                                     'profile_company_of', 'user_company_for_admin', 'has_capability', 'admin_may_view_user', 'record_readable',
                                     'has_role', 'has_any_role', 'my_profile_id', 'current_user_company_id', 'legacy_profile_role',
                                     'role_vessel_ids', 'role_company_user_ids')),
                'D-229: the policy helpers are LANGUAGE plpgsql');

-- ------------------------------------------------------------ (i) equivalence: the shipped policies

SELECT format('SELECT tests.rp_count_as(%L, %L)', 'shipped', key) FROM rp_callers ORDER BY key \gexec

-- ------------------------------------------------------------ the round-4 policies, frozen verbatim (the oracle)

SET LOCAL statement_timeout = '60s';
DROP POLICY "Authorized users can manage flight requests" ON public.flight_requests;
CREATE POLICY "Authorized users can manage flight requests" ON public.flight_requests
  FOR ALL
  USING ((crew_id = auth.uid() AND public.user_is_active(auth.uid()) AND public.user_belongs_to_company(auth.uid(), company_id))
         OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser']::public.app_role[], company_id))
  WITH CHECK (((crew_id = auth.uid() AND public.user_is_active(auth.uid()) AND public.user_belongs_to_company(auth.uid(), company_id))
               OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser']::public.app_role[], company_id))
              AND (vessel_id IS NULL OR public.vessel_company_of(vessel_id) = company_id));
DROP POLICY "Users can view own flight requests" ON public.flight_requests;
CREATE POLICY "Users can view own flight requests" ON public.flight_requests
  FOR SELECT
  USING ((crew_id = auth.uid() AND public.user_is_active(auth.uid())) OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser', 'travel_agent']::public.app_role[], company_id));
DROP POLICY "Flight bookings viewable by request owner and staff" ON public.flight_bookings;
CREATE POLICY "Flight bookings viewable by request owner and staff" ON public.flight_bookings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.flight_requests AS fr
      WHERE fr.id = flight_bookings.flight_request_id
        AND ((fr.crew_id = auth.uid() AND public.user_is_active(auth.uid()))
             OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser', 'travel_agent']::public.app_role[], fr.company_id))
    )
  );
DROP POLICY "Travel agents and DPA can manage bookings" ON public.flight_bookings;
CREATE POLICY "Travel agents and DPA can manage bookings" ON public.flight_bookings
  FOR ALL
  USING (public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'travel_agent']::public.app_role[],
           (SELECT fr.company_id FROM public.flight_requests AS fr WHERE fr.id = flight_bookings.flight_request_id)))
  WITH CHECK (public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'travel_agent']::public.app_role[],
           (SELECT fr.company_id FROM public.flight_requests AS fr WHERE fr.id = flight_bookings.flight_request_id)));
DROP POLICY "Users can manage own rest records" ON public.hours_of_rest_records;
CREATE POLICY "Users can manage own rest records" ON public.hours_of_rest_records
  FOR ALL
  USING ((crew_id = auth.uid() AND public.user_is_active(auth.uid()) AND (vessel_id IS NULL OR public.user_can_reach_vessel(auth.uid(), vessel_id))) OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain']::public.app_role[],
           CASE WHEN hours_of_rest_records.vessel_id IS NOT NULL THEN public.vessel_company_of(hours_of_rest_records.vessel_id) ELSE public.user_company_for_admin(hours_of_rest_records.crew_id) END))
  WITH CHECK (((crew_id = auth.uid() AND public.user_is_active(auth.uid()) AND (vessel_id IS NULL OR public.user_can_reach_vessel(auth.uid(), vessel_id))) OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain']::public.app_role[],
                CASE WHEN hours_of_rest_records.vessel_id IS NOT NULL THEN public.vessel_company_of(hours_of_rest_records.vessel_id) ELSE public.user_company_for_admin(hours_of_rest_records.crew_id) END))
              AND (hours_of_rest_records.vessel_id IS NULL OR public.vessel_company_of(hours_of_rest_records.vessel_id) = public.profile_company_of(hours_of_rest_records.crew_id)));
DROP POLICY "Users can view own rest records" ON public.hours_of_rest_records;
CREATE POLICY "Users can view own rest records" ON public.hours_of_rest_records
  FOR SELECT
  USING ((crew_id = auth.uid() AND public.user_is_active(auth.uid())) OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser']::public.app_role[],
           CASE WHEN hours_of_rest_records.vessel_id IS NOT NULL THEN public.vessel_company_of(hours_of_rest_records.vessel_id) ELSE public.user_company_for_admin(hours_of_rest_records.crew_id) END));
DROP POLICY "Users can view own leave requests" ON public.leave_requests;
CREATE POLICY "Users can view own leave requests" ON public.leave_requests
  FOR SELECT
  USING ((crew_id = auth.uid() AND public.user_is_active(auth.uid())) OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser']::public.app_role[],
           CASE WHEN leave_requests.vessel_id IS NOT NULL THEN public.vessel_company_of(leave_requests.vessel_id) ELSE public.user_company_for_admin(leave_requests.crew_id) END));
DROP POLICY "DPA and Captain can manage medical reports" ON public.medical_reports;
CREATE POLICY "DPA and Captain can manage medical reports" ON public.medical_reports
  FOR ALL
  USING (public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain']::public.app_role[],
           CASE WHEN medical_reports.vessel_id IS NOT NULL THEN public.vessel_company_of(medical_reports.vessel_id) ELSE public.user_company_for_admin(medical_reports.crew_id) END))
  WITH CHECK (public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain']::public.app_role[],
                CASE WHEN medical_reports.vessel_id IS NOT NULL THEN public.vessel_company_of(medical_reports.vessel_id) ELSE public.user_company_for_admin(medical_reports.crew_id) END)
              AND (medical_reports.vessel_id IS NULL OR medical_reports.crew_id IS NULL OR public.vessel_company_of(medical_reports.vessel_id) = public.profile_company_of(medical_reports.crew_id)));
DROP POLICY "Medical reports visible to authorized users" ON public.medical_reports;
CREATE POLICY "Medical reports visible to authorized users" ON public.medical_reports
  FOR SELECT
  USING (
    public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain']::public.app_role[],
      CASE WHEN medical_reports.vessel_id IS NOT NULL THEN public.vessel_company_of(medical_reports.vessel_id) ELSE public.user_company_for_admin(medical_reports.crew_id) END)
    OR (crew_id = auth.uid() AND public.user_is_active(auth.uid()))
  );
DROP POLICY "Admins manage rule sets" ON public.work_rest_rule_sets;
CREATE POLICY "Admins manage rule sets" ON public.work_rest_rule_sets
  FOR ALL
  USING (public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain']::public.app_role[],
           coalesce(company_id, public.vessel_company_of(work_rest_rule_sets.vessel_id))))
  WITH CHECK (public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain']::public.app_role[],
           coalesce(company_id, public.vessel_company_of(work_rest_rule_sets.vessel_id))));
DROP POLICY "Crew view own submission" ON public.work_rest_monthly_submissions;
CREATE POLICY "Crew view own submission" ON public.work_rest_monthly_submissions
  FOR SELECT
  USING ((crew_id = auth.uid() AND public.user_is_active(auth.uid())) OR public.has_role_in_company(auth.uid(),
           ARRAY['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'chief_officer', 'chief_engineer', 'auditor_flag', 'auditor_class']::public.app_role[],
           CASE WHEN work_rest_monthly_submissions.vessel_id IS NOT NULL THEN public.vessel_company_of(work_rest_monthly_submissions.vessel_id) ELSE public.user_company_for_admin(work_rest_monthly_submissions.crew_id) END));
DROP POLICY "Crew manage own records" ON public.work_rest_records;
CREATE POLICY "Crew manage own records" ON public.work_rest_records
  FOR ALL
  USING ((crew_id = auth.uid() AND public.user_is_active(auth.uid()) AND (vessel_id IS NULL OR public.user_can_reach_vessel(auth.uid(), vessel_id))) OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser', 'hod']::public.app_role[],
           CASE WHEN work_rest_records.vessel_id IS NOT NULL THEN public.vessel_company_of(work_rest_records.vessel_id) ELSE public.user_company_for_admin(work_rest_records.crew_id) END))
  WITH CHECK (((crew_id = auth.uid() AND public.user_is_active(auth.uid()) AND (vessel_id IS NULL OR public.user_can_reach_vessel(auth.uid(), vessel_id))) OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser', 'hod']::public.app_role[],
                CASE WHEN work_rest_records.vessel_id IS NOT NULL THEN public.vessel_company_of(work_rest_records.vessel_id) ELSE public.user_company_for_admin(work_rest_records.crew_id) END))
              AND (work_rest_records.vessel_id IS NULL OR public.vessel_company_of(work_rest_records.vessel_id) = public.profile_company_of(work_rest_records.crew_id)));
DROP POLICY "Crew view own records" ON public.work_rest_records;
CREATE POLICY "Crew view own records" ON public.work_rest_records
  FOR SELECT
  USING ((crew_id = auth.uid() AND public.user_is_active(auth.uid())) OR public.has_role_in_company(auth.uid(),
           ARRAY['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'chief_officer', 'chief_engineer', 'auditor_flag', 'auditor_class']::public.app_role[],
           CASE WHEN work_rest_records.vessel_id IS NOT NULL THEN public.vessel_company_of(work_rest_records.vessel_id) ELSE public.user_company_for_admin(work_rest_records.crew_id) END));
DROP POLICY "Manage blocks via record" ON public.work_rest_blocks;
CREATE POLICY "Manage blocks via record" ON public.work_rest_blocks
  FOR ALL
  USING ((crew_id = auth.uid() AND public.user_is_active(auth.uid())) OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser', 'hod']::public.app_role[], public.user_company_for_admin(work_rest_blocks.crew_id)))
  WITH CHECK (((crew_id = auth.uid() AND public.user_is_active(auth.uid())) OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser', 'hod']::public.app_role[], public.user_company_for_admin(work_rest_blocks.crew_id)))
              AND EXISTS (SELECT 1 FROM public.work_rest_records AS r WHERE r.id = work_rest_blocks.record_id AND r.crew_id = work_rest_blocks.crew_id));
DROP POLICY "View blocks via record visibility" ON public.work_rest_blocks;
CREATE POLICY "View blocks via record visibility" ON public.work_rest_blocks
  FOR SELECT
  USING ((crew_id = auth.uid() AND public.user_is_active(auth.uid())) OR public.has_role_in_company(auth.uid(),
           ARRAY['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'chief_officer', 'chief_engineer', 'auditor_flag', 'auditor_class']::public.app_role[],
           public.user_company_for_admin(work_rest_blocks.crew_id)));
DROP POLICY "System manages compliance checks" ON public.work_rest_compliance_checks;
CREATE POLICY "System manages compliance checks" ON public.work_rest_compliance_checks
  FOR ALL
  USING ((crew_id = auth.uid() AND public.user_is_active(auth.uid())) OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'hod']::public.app_role[], public.user_company_for_admin(work_rest_compliance_checks.crew_id)))
  WITH CHECK (((crew_id = auth.uid() AND public.user_is_active(auth.uid())) OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'hod']::public.app_role[], public.user_company_for_admin(work_rest_compliance_checks.crew_id)))
              AND (work_rest_compliance_checks.submission_id IS NULL
                   OR EXISTS (SELECT 1 FROM public.work_rest_monthly_submissions AS s
                               WHERE s.id = work_rest_compliance_checks.submission_id AND s.crew_id = work_rest_compliance_checks.crew_id)));
DROP POLICY "View own compliance checks" ON public.work_rest_compliance_checks;
CREATE POLICY "View own compliance checks" ON public.work_rest_compliance_checks
  FOR SELECT
  USING ((crew_id = auth.uid() AND public.user_is_active(auth.uid())) OR public.has_role_in_company(auth.uid(),
           ARRAY['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'chief_officer', 'chief_engineer', 'auditor_flag', 'auditor_class']::public.app_role[],
           public.user_company_for_admin(work_rest_compliance_checks.crew_id)));
DROP POLICY "Manage NCs" ON public.work_rest_non_conformities;
CREATE POLICY "Manage NCs" ON public.work_rest_non_conformities
  FOR ALL
  USING ((crew_id = auth.uid() AND public.user_is_active(auth.uid())) OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'hod']::public.app_role[], public.user_company_for_admin(work_rest_non_conformities.crew_id)))
  WITH CHECK (((crew_id = auth.uid() AND public.user_is_active(auth.uid())) OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'hod']::public.app_role[], public.user_company_for_admin(work_rest_non_conformities.crew_id)))
              AND (work_rest_non_conformities.submission_id IS NULL
                   OR EXISTS (SELECT 1 FROM public.work_rest_monthly_submissions AS s
                               WHERE s.id = work_rest_non_conformities.submission_id AND s.crew_id = work_rest_non_conformities.crew_id)));
DROP POLICY "View own NCs" ON public.work_rest_non_conformities;
CREATE POLICY "View own NCs" ON public.work_rest_non_conformities
  FOR SELECT
  USING ((crew_id = auth.uid() AND public.user_is_active(auth.uid())) OR public.has_role_in_company(auth.uid(),
           ARRAY['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'chief_officer', 'chief_engineer', 'auditor_flag', 'auditor_class']::public.app_role[],
           public.user_company_for_admin(work_rest_non_conformities.crew_id)));
DROP POLICY "View audit log" ON public.work_rest_audit_log;
CREATE POLICY "View audit log" ON public.work_rest_audit_log
  FOR SELECT
  USING ((crew_id = auth.uid() AND public.user_is_active(auth.uid())) OR public.has_role_in_company(auth.uid(),
           ARRAY['superadmin', 'dpa', 'captain', 'hod', 'auditor_flag', 'auditor_class']::public.app_role[],
           coalesce(public.user_company_for_admin(work_rest_audit_log.crew_id),
                    (SELECT public.vessel_company_of(s.vessel_id) FROM public.work_rest_monthly_submissions AS s
                      WHERE s.id = work_rest_audit_log.submission_id))));
DROP POLICY "Manage own notes" ON public.work_rest_notes;
CREATE POLICY "Manage own notes" ON public.work_rest_notes
  FOR ALL
  USING ((author_id = auth.uid() AND public.user_is_active(auth.uid())
          AND (work_rest_notes.submission_id IS NULL OR EXISTS (SELECT 1 FROM public.work_rest_monthly_submissions AS s WHERE s.id = work_rest_notes.submission_id))
          AND (work_rest_notes.record_id IS NULL OR EXISTS (SELECT 1 FROM public.work_rest_records AS r WHERE r.id = work_rest_notes.record_id))
          AND (work_rest_notes.block_id IS NULL OR EXISTS (SELECT 1 FROM public.work_rest_blocks AS b WHERE b.id = work_rest_notes.block_id)))
         OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'hod']::public.app_role[],
           coalesce((SELECT public.vessel_company_of(s.vessel_id) FROM public.work_rest_monthly_submissions AS s WHERE s.id = work_rest_notes.submission_id),
                    (SELECT public.vessel_company_of(r.vessel_id) FROM public.work_rest_records AS r WHERE r.id = work_rest_notes.record_id))))
  WITH CHECK (((author_id = auth.uid() AND public.user_is_active(auth.uid())) OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'hod']::public.app_role[],
           coalesce((SELECT public.vessel_company_of(s.vessel_id) FROM public.work_rest_monthly_submissions AS s WHERE s.id = work_rest_notes.submission_id),
                    (SELECT public.vessel_company_of(r.vessel_id) FROM public.work_rest_records AS r WHERE r.id = work_rest_notes.record_id))))
              AND (work_rest_notes.submission_id IS NOT NULL OR work_rest_notes.record_id IS NOT NULL OR work_rest_notes.block_id IS NOT NULL)
              AND (work_rest_notes.submission_id IS NULL OR EXISTS (SELECT 1 FROM public.work_rest_monthly_submissions AS s WHERE s.id = work_rest_notes.submission_id))
              AND (work_rest_notes.record_id IS NULL OR EXISTS (SELECT 1 FROM public.work_rest_records AS r WHERE r.id = work_rest_notes.record_id))
              AND (work_rest_notes.block_id IS NULL OR EXISTS (SELECT 1 FROM public.work_rest_blocks AS b WHERE b.id = work_rest_notes.block_id)));
DROP POLICY "View notes" ON public.work_rest_notes;
CREATE POLICY "View notes" ON public.work_rest_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.work_rest_monthly_submissions AS s
      WHERE s.id = work_rest_notes.submission_id
        AND ((s.crew_id = auth.uid() AND public.user_is_active(auth.uid()))
             OR public.has_role_in_company(auth.uid(),
                  ARRAY['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'chief_officer', 'chief_engineer', 'auditor_flag', 'auditor_class']::public.app_role[],
                  public.vessel_company_of(s.vessel_id)))
    )
  );
DROP POLICY "View signatures" ON public.work_rest_signatures;
CREATE POLICY "View signatures" ON public.work_rest_signatures
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.work_rest_monthly_submissions AS s
      WHERE s.id = work_rest_signatures.submission_id
        AND ((s.crew_id = auth.uid() AND public.user_is_active(auth.uid()))
             OR public.has_role_in_company(auth.uid(),
                  ARRAY['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'chief_officer', 'chief_engineer', 'auditor_flag', 'auditor_class']::public.app_role[],
                  public.vessel_company_of(s.vessel_id)))
    )
  );
DROP POLICY "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.user_is_active(auth.uid()));
DROP POLICY "Users can view profiles in their company" ON public.profiles;
CREATE POLICY "Users can view profiles in their company" ON public.profiles
  FOR SELECT
  USING (public.user_belongs_to_company(auth.uid(), company_id));
DROP POLICY "Users can view crew assignments in their company" ON public.crew_assignments;
CREATE POLICY "Users can view crew assignments in their company" ON public.crew_assignments
  FOR SELECT
  USING (vessel_id IN (SELECT v.id FROM public.vessels AS v WHERE public.user_belongs_to_company(auth.uid(), v.company_id)));
DROP POLICY "View rule sets in company" ON public.work_rest_rule_sets;
CREATE POLICY "View rule sets in company" ON public.work_rest_rule_sets
  FOR SELECT
  USING (company_id IS NULL OR public.user_belongs_to_company(auth.uid(), company_id));

SET LOCAL statement_timeout = '8s';
SELECT format('SELECT tests.rp_count_as(%L, %L)', 'round4', key) FROM rp_callers ORDER BY key \gexec
SELECT format('SELECT tests.rp_count_predicate(%L)', key) FROM rp_callers ORDER BY key \gexec
SET LOCAL statement_timeout = '0';

SELECT tests.is(s.n, r.n, format('equivalence: %s as %s: %s row(s) under the shipped policies = the round-4 policies', s.tbl, s.caller, s.n))
FROM rp_counts AS s JOIN rp_counts AS r ON r.phase = 'round4' AND r.caller = s.caller AND r.tbl = s.tbl
WHERE s.phase = 'shipped' ORDER BY s.tbl, s.caller;
SELECT tests.is(s.n, p.n, format('equivalence: %s as %s = the round-4 predicate evaluated as postgres with the same claims', s.tbl, s.caller))
FROM rp_counts AS s JOIN rp_counts AS p ON p.phase = 'predicate' AND p.caller = s.caller AND p.tbl = s.tbl
WHERE s.phase = 'shipped' ORDER BY s.tbl, s.caller;
SELECT tests.is((SELECT count(*) FROM rp_counts WHERE phase = 'shipped'), (SELECT count(*) FROM rp_counts WHERE phase = 'round4'), 'every shipped count has its round-4 count');

-- The comparison is not vacuous: the callers see different things.
SELECT tests.ok((SELECT bool_and(n = 0) FROM rp_counts WHERE phase = 'shipped' AND caller = 'P.disabled' AND tbl <> 'work_rest_rule_sets'),
                'the disabled crew member reads nothing anywhere (the rule sets without a company are global reference rows, readable by all as before)');
SELECT tests.is((SELECT n FROM rp_counts WHERE phase = 'shipped' AND caller = 'P.crew' AND tbl = 'crew_assignments'),
                (SELECT count(*) FROM public.crew_assignments WHERE vessel_id = tests.id('rp:vessel:3')),
                'a crew member reads the crew assignments of the vessel they reach only (the vessels subquery keeps the caller''s vessel RLS)');
SELECT tests.is((SELECT n FROM rp_counts WHERE phase = 'shipped' AND caller = 'P.captain' AND tbl = 'crew_assignments'),
                (SELECT count(*) FROM public.crew_assignments AS ca JOIN public.vessels AS v ON v.id = ca.vessel_id WHERE v.company_id = tests.company_id('P')),
                'the captain (an HR viewer: the vessels_select HR exception) reads every P assignment');
SELECT tests.ok((SELECT n FROM rp_counts WHERE phase = 'shipped' AND caller = 'X.super' AND tbl = 'hours_of_rest_records') > 0
                AND (SELECT n FROM rp_counts WHERE phase = 'shipped' AND caller = 'Q.dpa' AND tbl = 'hours_of_rest_records') > 0
                AND (SELECT n FROM rp_counts WHERE phase = 'shipped' AND caller = 'Q.dpa' AND tbl = 'hours_of_rest_records')
                    < (SELECT n FROM rp_counts WHERE phase = 'shipped' AND caller = 'X.super' AND tbl = 'hours_of_rest_records'),
                'the company-less superadmin reads P''s vessel rows; Q''s DPA only Q''s');
SELECT tests.ok((SELECT n FROM rp_counts WHERE phase = 'shipped' AND caller = 'P.purser' AND tbl = 'medical_reports') = 1
                AND (SELECT n FROM rp_counts WHERE phase = 'shipped' AND caller = 'P.dpa' AND tbl = 'medical_reports') > 100,
                'the purser reads only their own medical report (not a medical role); the DPA reads the company''s');
SELECT tests.ok((SELECT n FROM rp_counts WHERE phase = 'shipped' AND caller = 'P.dpa' AND tbl = 'leave_requests')
                > (SELECT count(*) FROM public.leave_requests AS l JOIN public.vessels AS v ON v.id = l.vessel_id WHERE v.company_id = tests.company_id('P')),
                'the DPA also reads P''s vessel-less leave requests (the crew branch)');
