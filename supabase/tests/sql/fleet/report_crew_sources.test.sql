-- The fleet crew report RPCs (20261124040900_fleet_report_crew_sources.sql;
-- gap/02 R5, R9, R10, R11; X5 agreements 5 and 6; D-X5-09, D-X5-10,
-- D-X5-21, D-X5-22): fleet_report_crew_qualifications(),
-- fleet_report_hours_of_rest() and fleet_report_contracts() over two
-- companies and the three vessels of A (DRAAK, HYDRA, GAME CHANGER with the
-- crew module switched off), on days relative to today. Proves: the pure
-- agreement and bucket rules (the cases between the markers are asserted
-- by the TS mirror too); R5 through X1's crew_compliance_for_vessels() only
-- for the covered vessels, not_set_up while it is missing, the login id
-- left out; R9's counts on a seeded world by both breach sources (X1's
-- review columns, and without them the compliance checks and open legacy
-- non-conformities), vessel attribution through the breach, its month and
-- the assignment, the heat map, months not submitted, people with repeat
-- breaches, the span refusals; R10 / R11's agreement states, buckets,
-- renewals, vessel attribution and the unassigned rule; the HR and HoR
-- gates (no_access, never zeros), a foreign vessel refused (42501), an
-- inactive caller, company B, anon; grants and search_path.

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ pure rules (TS lib/crewReports.ts reads these cases)

CREATE TEMP TABLE agreement_case (k text PRIMARY KEY, status text, sea text, crew boolean, company boolean, want_state text, want_awaiting text) ON COMMIT DROP;
INSERT INTO agreement_case VALUES
-- agreement-cases:start
  ('signed_active', 'active', 'SEA-1', true, true, 'signed', NULL),
  ('signed_draft', 'draft', NULL, true, true, 'signed', NULL),
  ('draft_blank', 'draft', NULL, false, false, 'draft', NULL),
  ('draft_spaces_ref', 'draft', '  ', false, false, 'draft', NULL),
  ('draft_with_ref', 'draft', 'SEA-2', false, false, 'not_signed', 'both'),
  ('active_unsigned', 'active', NULL, false, false, 'not_signed', 'both'),
  ('active_crew_signed', 'active', NULL, true, false, 'not_signed', 'company'),
  ('draft_company_signed', 'draft', NULL, false, true, 'not_signed', 'crew'),
  ('active_ref_company_signed', 'active', 'SEA-3', false, true, 'not_signed', 'crew')
-- agreement-cases:end
;
SELECT tests.is(public.fleet_report_agreement_state(c.status, c.sea,
                  CASE WHEN c.crew THEN now() END, CASE WHEN c.company THEN now() END), c.want_state,
                'agreement state: ' || c.k)
FROM agreement_case AS c ORDER BY c.k;
SELECT tests.is(public.fleet_report_agreement_awaiting(c.status, c.sea,
                  CASE WHEN c.crew THEN now() END, CASE WHEN c.company THEN now() END), c.want_awaiting,
                'agreement awaiting: ' || c.k)
FROM agreement_case AS c ORDER BY c.k;

CREATE TEMP TABLE bucket_case (k text PRIMARY KEY, days integer, want text) ON COMMIT DROP;
INSERT INTO bucket_case VALUES
-- bucket-cases:start
  ('no_end_date', NULL, NULL),
  ('ended_yesterday', -1, 'ended'),
  ('ended_long_ago', -400, 'ended'),
  ('ends_today', 0, 'd30'),
  ('ends_in_30', 30, 'd30'),
  ('ends_in_31', 31, 'd60'),
  ('ends_in_60', 60, 'd60'),
  ('ends_in_61', 61, 'd90'),
  ('ends_in_90', 90, 'd90'),
  ('ends_in_91', 91, NULL)
-- bucket-cases:end
;
SELECT tests.is(public.fleet_report_contract_bucket(CASE WHEN c.days IS NULL THEN NULL ELSE date '2026-11-15' + c.days END, date '2026-11-15'),
                c.want, 'contract bucket: ' || c.k)
FROM bucket_case AS c ORDER BY c.k;
SELECT tests.is(public.fleet_report_contract_bucket(date '2026-11-15', NULL), NULL::text, 'contract bucket: no day, no bucket');

-- ------------------------------------------------------------ world

-- GAME CHANGER: the crew module off (R5 and R9 read module_off there).
INSERT INTO public.vessel_module_settings (vessel_id, company_id, module_key, enabled) VALUES
  (tests.vessel_id('A.gam'), tests.company_id('A'), 'crew', false);

-- A reports-only reader of DRAAK (no hours-of-rest, HR or compliance rule).
SELECT tests.seed_user('A', 'A.rep_only', 'crew');
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'shore', vessel_scope = 'assigned', fleet_access = false, source = 'admin'
WHERE user_id = tests.user_id('A.rep_only');
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT m.id, m.company_id, tests.vessel_id('A.dra') FROM public.account_memberships AS m WHERE m.user_id = tests.user_id('A.rep_only');
SELECT tests.seed_role('x5_crew_rep_only', 'vessel');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'reports', 'view', 'fleet' FROM public.roles AS r WHERE r.name = 'x5_crew_rep_only';
SELECT tests.seed_rbac_role('A.rep_only', 'x5_crew_rep_only');

-- Crew with logins (assignments from 90 days back), one per data case.
SELECT tests.seed_user('A', 'A.hr1', 'crew', 'active', '{"position": "Bosun"}'::jsonb);
SELECT tests.seed_user('A', 'A.hr2', 'crew', 'active', '{"position": "Cook"}'::jsonb);
SELECT tests.seed_user('A', 'A.hr3', 'crew', 'active', '{"position": "Engineer"}'::jsonb);
SELECT tests.seed_user('A', 'A.hr4', 'crew');
SELECT tests.seed_user('A', 'A.far', 'crew');
SELECT tests.seed_user('A', 'A.leaver', 'crew');
SELECT tests.seed_user('A', 'A.onleave', 'crew');
SELECT tests.seed_user('A', 'A.exp', 'crew');
SELECT tests.seed_user('B', 'B.crew1', 'crew');
SELECT tests.seed_assignment('A.hr1', 'A.dra', true, 'Bosun', jsonb_build_object('join_date', current_date - 90));
SELECT tests.seed_assignment('A.hr2', 'A.dra', true, 'Cook', jsonb_build_object('join_date', current_date - 90));
SELECT tests.seed_assignment('A.hr3', 'A.hyd', true, 'Engineer', jsonb_build_object('join_date', current_date - 90));
SELECT tests.seed_assignment('A.hr4', 'A.gam', true, 'Deckhand', jsonb_build_object('join_date', current_date - 90));
SELECT tests.seed_assignment('A.far', 'A.hyd', true, 'Chef', jsonb_build_object('join_date', current_date - 90));
SELECT tests.seed_assignment('A.leaver', 'A.dra', false, 'Stewardess', jsonb_build_object('join_date', current_date - 200, 'leave_date', current_date - 100));
SELECT tests.seed_assignment('A.onleave', 'A.dra', false, 'Deckhand', jsonb_build_object('join_date', current_date - 200, 'leave_date', current_date - 20));
SELECT tests.seed_assignment('B.crew1', 'B.lev', true, 'Deckhand', jsonb_build_object('join_date', current_date - 90));

-- ---- hours of rest: the 10-day period P1 is today - 9 .. today; P2 is the previous month's first day .. today.
CREATE TEMP TABLE d ON COMMIT DROP AS
SELECT current_date AS t,
       (date_trunc('month', current_date::timestamp) - interval '1 month')::date AS pm_start,
       ((date_trunc('month', current_date::timestamp) - interval '1 month')::date + 9) AS pm10;
GRANT SELECT ON d TO PUBLIC;

-- Month rows: hr1's previous month on DRAAK still a draft; hr3's previous month on HYDRA submitted.
INSERT INTO public.work_rest_monthly_submissions (id, crew_id, vessel_id, period_year, period_month, status)
SELECT tests.id('sub:' || x.k), tests.user_id(x.crew), tests.vessel_id(x.v),
       extract(year FROM (SELECT pm_start FROM d))::int, extract(month FROM (SELECT pm_start FROM d))::int, x.status
FROM (VALUES ('hr1:pm', 'A.hr1', 'A.dra', 'draft'), ('hr3:pm', 'A.hr3', 'A.hyd', 'submitted')) AS x(k, crew, v, status);

-- Logged days.
INSERT INTO public.work_rest_records (id, crew_id, vessel_id, record_date, total_work_minutes, total_rest_minutes)
SELECT tests.id('wrr:' || x.crew || ':' || x.off), tests.user_id(x.crew), tests.vessel_id(x.v), (SELECT t FROM d) - x.off, 600, 840
FROM (VALUES
  ('A.hr1', 'A.dra', 6), ('A.hr1', 'A.dra', 5), ('A.hr1', 'A.dra', 4), ('A.hr1', 'A.dra', 3), ('A.hr1', 'A.dra', 2),
  ('A.hr2', 'A.dra', 5), ('A.hr2', 'A.dra', 4), ('A.hr2', 'A.dra', 3),
  ('A.hr3', 'A.hyd', 6), ('A.hr3', 'A.hyd', 5), ('A.hr3', 'A.hyd', 4),
  ('A.hr4', 'A.gam', 3),     -- GAME CHANGER: crew off
  ('B.crew1', 'B.lev', 3)    -- company B
) AS x(crew, v, off);
-- The previous month's tenth day (P2's months; days that are not already logged above).
INSERT INTO public.work_rest_records (id, crew_id, vessel_id, record_date, total_work_minutes, total_rest_minutes)
SELECT tests.id('wrr:' || x.crew || ':pm10'), tests.user_id(x.crew), tests.vessel_id(x.v), (SELECT pm10 FROM d), 600, 840
FROM (VALUES ('A.hr1', 'A.dra'), ('A.hr2', 'A.dra'), ('A.hr3', 'A.hyd')) AS x(crew, v)
WHERE NOT EXISTS (SELECT 1 FROM public.work_rest_records AS r WHERE r.crew_id = tests.user_id(x.crew) AND r.record_date = (SELECT pm10 FROM d));

-- Compliance checks (the legacy breach source).
INSERT INTO public.work_rest_compliance_checks (id, crew_id, submission_id, check_window, window_start, window_end, rest_minutes, work_minutes, passes, threshold_minutes)
SELECT tests.id('chk:' || x.k), tests.user_id(x.crew), CASE WHEN x.sub IS NULL THEN NULL ELSE tests.id(x.sub) END, x.win,
       (((SELECT t FROM d) - x.off)::timestamp AT TIME ZONE 'UTC'),
       (((SELECT t FROM d) - x.off)::timestamp AT TIME ZONE 'UTC') + interval '24 hours',
       x.rest, 1440 - least(x.rest, 1440), x.passes, x.thr
FROM (VALUES
  ('c1', 'A.hr1', NULL, 'rolling_24h', 4, 200, false, 600),      -- serious (< 4 h)
  ('c2', 'A.hr1', NULL, 'rolling_24h', 3, 500, false, 600),      -- a breach, not serious
  ('c3', 'A.hr1', NULL, 'rolling_7d', 3, 4000, false, 4620),     -- the same crew-day
  ('c4', 'A.hr2', NULL, 'rolling_7d', 4, 2900, false, 4620),     -- serious (< 50 h)
  ('c5', 'A.hr3', 'sub:hr3:pm', 'rolling_24h', 5, 450, false, 600), -- HYDRA through its month
  ('c6', 'A.hr1', NULL, 'rolling_24h', 2, 700, true, 600),       -- passes: no breach
  ('c7', 'A.hr1', NULL, 'rolling_24h', 15, 300, false, 600),     -- before P1
  ('c8', 'A.hr4', NULL, 'rolling_24h', 3, 200, false, 600),      -- GAME CHANGER
  ('c9', 'B.crew1', NULL, 'rolling_24h', 3, 200, false, 600)     -- company B
) AS x(k, crew, sub, win, off, rest, passes, thr);

-- X1's breach columns (contract 6): record whether this build has them, then make sure they exist
-- (a stub when X1's files are not in the build: the harness's --file mode), inside this test's transaction.
CREATE TEMP TABLE build_x1 ON COMMIT DROP AS
SELECT (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'work_rest_non_conformities'
          AND column_name IN ('review_outcome', 'is_serious', 'superseded_at', 'vessel_id', 'breach_day')) = 5 AS review,
       to_regprocedure('public.crew_compliance_for_vessels(uuid[])') IS NOT NULL AS compliance;
SELECT tests.ok(true, format('build: X1 breach review columns %s, X1 crew_compliance_for_vessels %s (stubs added when absent)',
                             CASE WHEN review THEN 'present' ELSE 'absent' END, CASE WHEN compliance THEN 'present' ELSE 'absent' END))
FROM build_x1;
ALTER TABLE public.work_rest_non_conformities ADD COLUMN IF NOT EXISTS vessel_id uuid, ADD COLUMN IF NOT EXISTS breach_day date,
  ADD COLUMN IF NOT EXISTS is_serious boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_outcome text;

INSERT INTO public.work_rest_non_conformities (id, crew_id, submission_id, rule_code, rule_description, severity, window_start, window_end,
                                               measured_value, threshold_value, status, vessel_id, breach_day, is_serious, superseded_at, review_outcome)
SELECT tests.id('nc:' || x.k), tests.user_id(x.crew), CASE WHEN x.sub IS NULL THEN NULL ELSE tests.id(x.sub) END, x.rule, 'Rest rule', 'high',
       (((SELECT t FROM d) - x.off)::timestamp AT TIME ZONE 'UTC'),
       (((SELECT t FROM d) - x.off + 1)::timestamp AT TIME ZONE 'UTC'),
       3.3, 10, x.status, CASE WHEN x.v IS NULL THEN NULL ELSE tests.vessel_id(x.v) END,
       CASE WHEN x.v IS NULL THEN NULL ELSE (SELECT t FROM d) - x.off END,
       x.serious, CASE WHEN x.superseded THEN now() END, x.outcome
FROM (VALUES
  ('n1', 'A.hr1', NULL, 'REST_24H_MIN', 4, 'open', 'A.dra', true, false, NULL),
  ('n2', 'A.hr1', NULL, 'REST_PERIODS_MAX', 3, 'reviewed', 'A.dra', false, false, 'accepted'),
  ('n3', 'A.hr1', NULL, 'REST_24H_MIN', 2, 'reviewed', 'A.dra', true, true, 'accepted'),      -- superseded
  ('n4', 'A.hr2', NULL, 'REST_7D_MIN', 4, 'open', 'A.dra', false, false, NULL),
  ('n5', 'A.hr2', NULL, 'REST_24H_MIN', 3, 'dismissed', 'A.dra', true, false, 'dismissed'),  -- dismissed
  ('n6', 'A.hr3', 'sub:hr3:pm', 'REST_24H_MIN', 5, 'open', NULL, false, false, NULL),       -- vessel through its month
  ('n7', 'A.hr3', NULL, 'REST_LONG_BLOCK_MIN', 6, 'open', 'A.hyd', false, false, NULL),
  ('n8', 'A.hr4', NULL, 'REST_24H_MIN', 3, 'open', 'A.gam', true, false, NULL),             -- GAME CHANGER
  ('n9', 'B.crew1', NULL, 'REST_24H_MIN', 3, 'open', 'B.lev', true, false, NULL),           -- company B
  ('n10', 'A.hr1', NULL, 'REST_24H_MIN', 20, 'open', 'A.dra', true, false, NULL)            -- before P1
) AS x(k, crew, sub, rule, off, status, v, serious, superseded, outcome);

-- ---- contracts (today = current_date)
INSERT INTO public.crew_contracts (id, company_id, profile_id, vessel_id, contract_type, contract_number, position, start_date, end_date, status,
                                   sea_reference, signed_by_crew_at, signed_by_company_at, supersedes_contract_id)
SELECT tests.id('k:' || x.k), tests.company_id(x.co), tests.profile_id(x.who), CASE WHEN x.v IS NULL THEN NULL ELSE tests.vessel_id(x.v) END,
       'rotational', 'C-' || x.k, x.pos, current_date + x.s, CASE WHEN x.e IS NULL THEN NULL ELSE current_date + x.e END, x.status,
       x.sea, CASE WHEN x.crew_signed THEN now() - interval '10 days' END, CASE WHEN x.company_signed THEN now() - interval '9 days' END,
       CASE WHEN x.sup IS NULL THEN NULL ELSE tests.id('k:' || x.sup) END
FROM (VALUES
  ('k1', 'A', 'A.hr1', NULL, 'Bosun', -200, 20, 'active', 'SEA-DRA-1', true, true, NULL),
  ('k3', 'A', 'A.hr2', 'A.dra', NULL, -100, 45, 'active', NULL, true, false, NULL),
  ('k4', 'A', 'A.hr3', 'A.hyd', 'Engineer', -300, -3, 'active', 'SEA-HYD-1', false, false, NULL),
  ('k5', 'A', 'A.hr4', 'A.gam', 'Deckhand', -100, 80, 'active', NULL, false, true, NULL),
  ('k6', 'A', 'A.leaver', NULL, 'Stewardess', -300, 10, 'active', NULL, false, false, NULL),
  ('k7', 'A', 'A.onleave', 'A.dra', 'Deckhand', -300, 60, 'active', 'SEA-DRA-7', true, true, NULL),
  ('k8', 'A', 'A.far', 'A.dra', 'Chef', -100, 120, 'active', 'SEA-8', true, true, NULL),
  ('k9', 'A', 'A.exp', 'A.dra', NULL, -400, -40, 'expired', NULL, true, true, NULL),
  ('k10', 'B', 'B.crew1', 'B.lev', NULL, -100, 30, 'active', NULL, false, false, NULL)
) AS x(k, co, who, v, pos, s, e, status, sea, crew_signed, company_signed, sup);
-- hr1's renewal, drafted.
INSERT INTO public.crew_contracts (id, company_id, profile_id, vessel_id, contract_type, contract_number, start_date, end_date, status, supersedes_contract_id)
VALUES (tests.id('k:k2'), tests.company_id('A'), tests.profile_id('A.hr1'), tests.vessel_id('A.dra'), 'rotational', 'C-k2',
        current_date + 21, current_date + 400, 'draft', tests.id('k:k1'));

-- ------------------------------------------------------------ R9 as the fleet manager (X1's breach source)

CREATE TEMP TABLE h ON COMMIT DROP AS SELECT 'x'::text AS label, NULL::jsonb AS r WHERE false;
GRANT ALL ON h TO PUBLIC;
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
INSERT INTO h SELECT 'p1', public.fleet_report_hours_of_rest(NULL, (SELECT t FROM d) - 9, (SELECT t FROM d), (SELECT t FROM d));
INSERT INTO h SELECT 'p2', public.fleet_report_hours_of_rest(NULL, (SELECT pm_start FROM d), (SELECT t FROM d), (SELECT t FROM d));
INSERT INTO h SELECT 'default', public.fleet_report_hours_of_rest();
INSERT INTO h SELECT 'dra', public.fleet_report_hours_of_rest(ARRAY[tests.vessel_id('A.dra')], (SELECT t FROM d) - 9, (SELECT t FROM d), (SELECT t FROM d));
SELECT tests.throws_like(format($q$SELECT public.fleet_report_hours_of_rest(NULL, %L::date, %L::date)$q$, current_date, current_date - 1),
                         '22023', 'invalid_period', 'R9: a period that starts after it ends is refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_report_hours_of_rest(NULL, %L::date, %L::date)$q$, current_date - 366, current_date),
                         '22023', 'period_too_long', 'R9: 367 days are refused');
SELECT tests.lives(format($q$SELECT public.fleet_report_hours_of_rest(NULL, %L::date, %L::date)$q$, current_date - 365, current_date),
                   'R9: 366 days are allowed');
SELECT tests.throws_like(format($q$SELECT public.fleet_report_hours_of_rest(ARRAY[%L]::uuid[])$q$, tests.vessel_id('B.lev')),
                         '42501', 'vessel_out_of_reach', 'R9: a foreign vessel is refused (42501)');
SELECT tests.throws_like(format($q$SELECT public.fleet_report_hours_of_rest(ARRAY[%L, %L]::uuid[])$q$, tests.vessel_id('A.dra'), tests.vessel_id('B.lev')),
                         '42501', 'vessel_out_of_reach', 'R9: one foreign vessel among own ones refuses the whole read');
SELECT tests.reset_role();

CREATE FUNCTION pg_temp.hv(p_label text, p_vessel text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT e FROM h, jsonb_array_elements(h.r -> 'per_vessel') AS e WHERE h.label = p_label AND e ->> 'vessel_id' = tests.vessel_id(p_vessel)::text
$$;
CREATE FUNCTION pg_temp.cell(p_label text, p_vessel text, p_off integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT e - 'vessel_id' - 'day' FROM h, jsonb_array_elements(h.r -> 'heat') AS e
  WHERE h.label = p_label AND e ->> 'vessel_id' = tests.vessel_id(p_vessel)::text AND (e ->> 'day')::date = current_date - p_off
$$;

SELECT tests.is((SELECT r ->> 'source' FROM h WHERE label = 'p1'), 'breach_review', 'R9: X1''s breach review columns are the breach source');
SELECT tests.is((SELECT (r ->> 'vessels')::int FROM h WHERE label = 'p1'), 3, 'R9: the three counted vessels of A');
SELECT tests.results_eq(
  $q$SELECT e ->> 'vessel_name', e ->> 'state' FROM h, jsonb_array_elements(h.r -> 'per_vessel') AS e WHERE h.label = 'p1'$q$,
  $q$VALUES ('GAME CHANGER'::text, 'module_off'::text), ('HYDRA', 'ok'), ('M/Y DRAAK', 'ok')$q$,
  'R9: per vessel by name; GAME CHANGER module_off (crew off)');
SELECT tests.is(pg_temp.hv('p1', 'A.gam') - 'vessel_id' - 'vessel_name' - 'vessel_code' - 'state',
                '{"crew_logging": null, "crew_days": null, "breach_days": null, "serious_days": null, "unreviewed": null, "months_not_submitted": null, "rate_per_100": null, "last_entry": null}'::jsonb,
                'R9: GAME CHANGER has no numbers at all, never zeros');
SELECT tests.is(pg_temp.hv('p1', 'A.dra') - 'vessel_id' - 'vessel_name' - 'vessel_code' - 'state' - 'months_not_submitted' - 'last_entry',
                '{"crew_logging": 2, "crew_days": 8, "breach_days": 3, "serious_days": 1, "unreviewed": 2, "rate_per_100": 37.5}'::jsonb,
                'R9 DRAAK: 2 crew over 8 crew-days; 3 breach days (hr1 twice, hr2 once; superseded and dismissed left out); 1 serious; 2 unreviewed; 37.5 per 100');
SELECT tests.is((pg_temp.hv('p1', 'A.dra') ->> 'last_entry')::date, current_date - 2, 'R9 DRAAK: the last entry');
SELECT tests.is(pg_temp.hv('p1', 'A.hyd') - 'vessel_id' - 'vessel_name' - 'vessel_code' - 'state' - 'months_not_submitted' - 'last_entry',
                '{"crew_logging": 1, "crew_days": 3, "breach_days": 2, "serious_days": 0, "unreviewed": 2, "rate_per_100": 66.7}'::jsonb,
                'R9 HYDRA: one breach through its month, one on the vessel; 66.7 per 100');
SELECT tests.is((SELECT r -> 'totals' FROM h WHERE label = 'p1') - 'months_not_submitted',
                '{"vessels_covered": 2, "vessels_logging": 2, "crew_days": 11, "breach_days": 5, "serious_days": 1, "unreviewed": 4, "rate_per_100": 45.5}'::jsonb,
                'R9 totals over the covered vessels; GAME CHANGER and company B left out');
SELECT tests.is(pg_temp.cell('p1', 'A.dra', 4), '{"logged": 2, "breaches": 2, "serious": 1, "unreviewed": 2}'::jsonb, 'R9 heat: DRAAK four days ago');
SELECT tests.is(pg_temp.cell('p1', 'A.dra', 3), '{"logged": 2, "breaches": 1, "serious": 0, "unreviewed": 0}'::jsonb, 'R9 heat: DRAAK three days ago (the accepted breach)');
SELECT tests.is(pg_temp.cell('p1', 'A.dra', 6), '{"logged": 1, "breaches": 0, "serious": 0, "unreviewed": 0}'::jsonb, 'R9 heat: a logged day with no breach');
SELECT tests.is(pg_temp.cell('p1', 'A.hyd', 6), '{"logged": 1, "breaches": 1, "serious": 0, "unreviewed": 1}'::jsonb, 'R9 heat: HYDRA six days ago');
SELECT tests.is(pg_temp.cell('p1', 'A.dra', 1), NULL::jsonb, 'R9 heat: a day with nothing is left out');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM h, jsonb_array_elements(h.r -> 'heat') AS e WHERE h.label = 'p1' AND e ->> 'vessel_id' = tests.vessel_id('A.gam')::text),
                'R9 heat: nothing for GAME CHANGER');
SELECT tests.is((SELECT (r #>> '{emerging,total}')::int FROM h WHERE label = 'p1'), 2, 'R9 emerging: two people with breaches on two or more days');
SELECT tests.results_eq(
  $q$SELECT e ->> 'profile_id', (e ->> 'breach_days')::int, (e ->> 'serious_days')::int, (e ->> 'unreviewed')::int, e ->> 'position', e ->> 'vessel_id'
     FROM h, jsonb_array_elements(h.r #> '{emerging,rows}') WITH ORDINALITY AS x(e, n) WHERE h.label = 'p1' ORDER BY n$q$,
  format($q$VALUES (%L::text, 2, 1, 1, 'Bosun'::text, %L::text), (%L, 2, 0, 2, 'Engineer', %L)$q$,
         tests.profile_id('A.hr1'), tests.vessel_id('A.dra'), tests.profile_id('A.hr3'), tests.vessel_id('A.hyd')),
  'R9 emerging: most breach days first, then serious; position from the assignment');
SELECT tests.ok((SELECT r #>> '{emerging,rows,0,person_name}' FROM h WHERE label = 'p1') IS NOT NULL, 'R9 emerging: named');
SELECT tests.is((SELECT (r #>> '{totals,months_not_submitted}')::int FROM h WHERE label = 'p2'), 2,
                'R9 months: last month not submitted twice on DRAAK (a draft, and no month row), HYDRA''s submitted');
SELECT tests.is((pg_temp.hv('p2', 'A.dra') ->> 'months_not_submitted')::int, 2, 'R9 months: DRAAK 2');
SELECT tests.is((pg_temp.hv('p2', 'A.hyd') ->> 'months_not_submitted')::int, 0, 'R9 months: HYDRA 0');
SELECT tests.is((SELECT (r ->> 'from')::date FROM h WHERE label = 'default'), current_date - 29, 'R9 default period: the 30 days ending today');
SELECT tests.is((SELECT (r ->> 'to')::date FROM h WHERE label = 'default'), current_date, 'R9 default period: ending today');
SELECT tests.results_eq(
  $q$SELECT e ->> 'vessel_name' FROM h, jsonb_array_elements(h.r -> 'per_vessel') AS e WHERE h.label = 'dra'$q$,
  $q$VALUES ('M/Y DRAAK'::text)$q$, 'R9: an explicit vessel list shows those vessels only');
SELECT tests.is((SELECT (r #>> '{totals,breach_days}')::int FROM h WHERE label = 'dra'), 3, 'R9: DRAAK alone');

-- ------------------------------------------------------------ R9 without X1's columns (the legacy breach source)

ALTER TABLE public.work_rest_non_conformities RENAME COLUMN review_outcome TO review_outcome_x5hidden;
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
INSERT INTO h SELECT 'legacy', public.fleet_report_hours_of_rest(NULL, (SELECT t FROM d) - 9, (SELECT t FROM d), (SELECT t FROM d));
SELECT tests.reset_role();
ALTER TABLE public.work_rest_non_conformities RENAME COLUMN review_outcome_x5hidden TO review_outcome;

SELECT tests.is((SELECT r ->> 'source' FROM h WHERE label = 'legacy'), 'compliance_checks', 'R9 legacy: failing compliance checks are the breach source');
SELECT tests.is(pg_temp.hv('legacy', 'A.dra') - 'vessel_id' - 'vessel_name' - 'vessel_code' - 'state' - 'months_not_submitted' - 'last_entry',
                '{"crew_logging": 2, "crew_days": 8, "breach_days": 3, "serious_days": 2, "unreviewed": 2, "rate_per_100": 37.5}'::jsonb,
                'R9 legacy DRAAK: 3 failing crew-days (two checks one day count once); < 4 h in 24 h and < 50 h in 7 days serious; open legacy breaches unreviewed');
SELECT tests.is(pg_temp.hv('legacy', 'A.hyd') - 'vessel_id' - 'vessel_name' - 'vessel_code' - 'state' - 'months_not_submitted' - 'last_entry',
                '{"crew_logging": 1, "crew_days": 3, "breach_days": 1, "serious_days": 0, "unreviewed": 2, "rate_per_100": 33.3}'::jsonb,
                'R9 legacy HYDRA: the failing check through its month; both open breaches, one by the assignment');
SELECT tests.is((SELECT (r #>> '{emerging,total}')::int FROM h WHERE label = 'legacy'), 1, 'R9 legacy emerging: only hr1 has two breach days');

-- ------------------------------------------------------------ R5 crew qualifications

-- A stub of X1's function with the frozen columns (contract 5), in place of the real one for this test.
DO $$
BEGIN
  IF to_regprocedure('public.crew_compliance_for_vessels(uuid[])') IS NOT NULL THEN
    ALTER FUNCTION public.crew_compliance_for_vessels(uuid[]) RENAME TO crew_compliance_for_vessels_x5hidden;
  END IF;
END
$$;
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
CREATE TEMP TABLE q_missing ON COMMIT DROP AS SELECT public.fleet_report_crew_qualifications() AS r;
SELECT tests.reset_role();
CREATE FUNCTION public.crew_compliance_for_vessels(p_vessel_ids uuid[])
RETURNS TABLE (company_id uuid, vessel_id uuid, profile_id uuid, user_id uuid, first_name text, last_name text, preferred_name text,
               position_id uuid, position_name text, position_text text, department_key text, rank_tier text, sort_order integer,
               placement_kind text, required integer, met integer, expiring integer, expired integer, missing integer, conditional integer,
               muted integer, docs_required integer, docs_met integer, stcw_required integer, stcw_met integer, quals_required integer,
               quals_met integer, fam_required integer, fam_met integer, status text, next_expiry date, dot_documents text,
               dot_qualifications text, issues jsonb)
LANGUAGE sql STABLE AS $$
  SELECT x.company_id, x.vessel_id, x.profile_id, x.user_id, 'Crew'::text, x.last_name, NULL::text, NULL::uuid, x.pos, x.pos, 'deck'::text,
         NULL::text, x.sort_order, 'assignment'::text, x.required, x.met, 0, x.expired, x.missing, 0, 0, x.required, x.met, 0, 0, 0, 0, 0, 0,
         x.status, NULL::date, 'ok'::text, 'none'::text, x.issues
  FROM (VALUES
    (tests.company_id('A'), tests.vessel_id('A.dra'), tests.profile_id('A.hr1'), tests.user_id('A.hr1'), 'hr1', 'Bosun', 1, 3, 2, 0, 1, 'missing',
     '[{"row_id": "r1", "label": "Advanced fire fighting", "tab": "stcw", "state": "missing", "reason": "missing"}]'::jsonb),
    (tests.company_id('A'), tests.vessel_id('A.dra'), tests.profile_id('A.hr2'), tests.user_id('A.hr2'), 'hr2', 'Cook', 2, 0, 0, 0, 0, 'complete', '[]'::jsonb),
    (tests.company_id('A'), tests.vessel_id('A.hyd'), tests.profile_id('A.hr3'), tests.user_id('A.hr3'), 'hr3', 'Engineer', 1, 2, 1, 1, 0, 'expired',
     '[{"row_id": "r2", "label": "Engine watch", "tab": "qualifications", "state": "expired", "reason": "expired"}]'::jsonb),
    (tests.company_id('A'), tests.vessel_id('A.gam'), tests.profile_id('A.hr4'), tests.user_id('A.hr4'), 'hr4', 'Deckhand', 1, 1, 1, 0, 0, 'complete', '[]'::jsonb)
  ) AS x(company_id, vessel_id, profile_id, user_id, last_name, pos, sort_order, required, met, expired, missing, status, issues)
  WHERE x.vessel_id = ANY (p_vessel_ids)
$$;
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
CREATE TEMP TABLE q_all ON COMMIT DROP AS SELECT public.fleet_report_crew_qualifications() AS r;
CREATE TEMP TABLE q_hyd ON COMMIT DROP AS SELECT public.fleet_report_crew_qualifications(ARRAY[tests.vessel_id('A.hyd')]) AS r;
SELECT tests.throws_like(format($q$SELECT public.fleet_report_crew_qualifications(ARRAY[%L]::uuid[])$q$, tests.vessel_id('B.lev')),
                         '42501', 'vessel_out_of_reach', 'R5: a foreign vessel is refused (42501)');
SELECT tests.as_user(tests.user_id('A.rep_only'));
CREATE TEMP TABLE q_rep ON COMMIT DROP AS SELECT public.fleet_report_crew_qualifications() AS r;
SELECT tests.as_user(tests.user_id('A.disabled'));
CREATE TEMP TABLE q_off ON COMMIT DROP AS SELECT public.fleet_report_crew_qualifications(ARRAY[tests.vessel_id('A.dra')]) AS r;
SELECT tests.reset_role();
DROP FUNCTION public.crew_compliance_for_vessels(uuid[]);
DO $$
BEGIN
  IF to_regprocedure('public.crew_compliance_for_vessels_x5hidden(uuid[])') IS NOT NULL THEN
    ALTER FUNCTION public.crew_compliance_for_vessels_x5hidden(uuid[]) RENAME TO crew_compliance_for_vessels;
  END IF;
END
$$;
GRANT SELECT ON q_missing, q_all, q_hyd, q_rep, q_off TO PUBLIC;

SELECT tests.is((SELECT r ->> 'state' FROM q_missing), 'not_set_up', 'R5: X1''s function missing: not_set_up');
SELECT tests.is((SELECT r -> 'rows' FROM q_missing), '[]'::jsonb, 'R5: not set up: no rows, never zeros');
SELECT tests.is((SELECT jsonb_array_length(r -> 'vessels') FROM q_missing), 3, 'R5: not set up still lists the vessels');
SELECT tests.is((SELECT r ->> 'state' FROM q_all), 'ok', 'R5: with X1''s function: ok');
SELECT tests.results_eq(
  $q$SELECT e ->> 'vessel_name', e ->> 'state' FROM q_all, jsonb_array_elements(r -> 'vessels') AS e$q$,
  $q$VALUES ('GAME CHANGER'::text, 'module_off'::text), ('HYDRA', 'ok'), ('M/Y DRAAK', 'ok')$q$,
  'R5: vessels by name; GAME CHANGER module_off (crew off)');
SELECT tests.results_eq(
  $q$SELECT e ->> 'profile_id', e ->> 'status', (e ->> 'required')::int, (e ->> 'met')::int FROM q_all, jsonb_array_elements(r -> 'rows') AS e
     ORDER BY e ->> 'last_name'$q$,
  format($q$VALUES (%L::text, 'missing'::text, 3, 2), (%L, 'complete', 0, 0), (%L, 'expired', 2, 1)$q$,
         tests.profile_id('A.hr1'), tests.profile_id('A.hr2'), tests.profile_id('A.hr3')),
  'R5: X1''s rows of the covered vessels only (GAME CHANGER''s crew not asked for)');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM q_all, jsonb_array_elements(r -> 'rows') AS e WHERE e ? 'user_id'), 'R5: the login id is left out');
SELECT tests.is((SELECT e #>> '{issues,0,label}' FROM q_all, jsonb_array_elements(r -> 'rows') AS e WHERE e ->> 'profile_id' = tests.profile_id('A.hr1')::text),
                'Advanced fire fighting', 'R5: the issues pass through');
SELECT tests.is((SELECT jsonb_array_length(r -> 'rows') FROM q_hyd), 1, 'R5: an explicit list asks X1 for those vessels only');
SELECT tests.results_eq(
  $q$SELECT e ->> 'vessel_name', e ->> 'state' FROM q_rep, jsonb_array_elements(r -> 'vessels') AS e$q$,
  $q$VALUES ('M/Y DRAAK'::text, 'no_access'::text)$q$, 'R5 reports only: DRAAK no_access');
SELECT tests.is((SELECT r -> 'rows' FROM q_rep), '[]'::jsonb, 'R5 reports only: no rows');
SELECT tests.is((SELECT r -> 'vessels' FROM q_off), '[]'::jsonb, 'R5 inactive: nothing (an explicit id is not even looked at)');

-- X1's real function, when this build has it: the wrapper's call matches its columns.
DO $$
BEGIN
  IF (SELECT compliance FROM build_x1) THEN
    PERFORM tests.as_user(tests.user_id('A.fleet_manager'));
    CREATE TEMP TABLE q_real ON COMMIT DROP AS SELECT public.fleet_report_crew_qualifications() AS r;
    PERFORM tests.reset_role();
  ELSE
    CREATE TEMP TABLE q_real ON COMMIT DROP AS SELECT jsonb_build_object('state', 'ok', 'rows', '[]'::jsonb) AS r;
  END IF;
END
$$;
SELECT tests.is((SELECT r ->> 'state' FROM q_real), 'ok',
                CASE WHEN (SELECT compliance FROM build_x1) THEN 'R5: X1''s crew_compliance_for_vessels answers through the wrapper'
                     ELSE 'R5: X1''s crew_compliance_for_vessels is not in this build (checked in the full run)' END);
SELECT tests.ok(jsonb_typeof((SELECT r -> 'rows' FROM q_real)) = 'array', 'R5: rows is an array');

-- ------------------------------------------------------------ R10 / R11 contracts

CREATE TEMP TABLE k ON COMMIT DROP AS SELECT 'x'::text AS label, NULL::jsonb AS r WHERE false;
GRANT ALL ON k TO PUBLIC;
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
INSERT INTO k SELECT 'agreements', public.fleet_report_contracts();
INSERT INTO k SELECT 'ending', public.fleet_report_contracts(NULL, 'ending');
INSERT INTO k SELECT 'dra', public.fleet_report_contracts(ARRAY[tests.vessel_id('A.dra')], 'agreements');
SELECT tests.throws_like('SELECT public.fleet_report_contracts(NULL, ''expired'')', '22023', 'invalid_mode', 'R10/R11: an unknown mode is refused');
SELECT tests.throws_like('SELECT public.fleet_report_contracts(NULL, NULL)', '22023', 'invalid_mode', 'R10/R11: no mode is refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_report_contracts(ARRAY[%L]::uuid[], 'ending')$q$, tests.vessel_id('B.lev')),
                         '42501', 'vessel_out_of_reach', 'R10/R11: a foreign vessel is refused (42501)');
SELECT tests.as_user(tests.user_id('A.rep_only'));
INSERT INTO k SELECT 'rep', public.fleet_report_contracts(NULL, 'ending');
SELECT tests.as_user(tests.user_id('A.disabled'));
INSERT INTO k SELECT 'off', public.fleet_report_contracts(ARRAY[tests.vessel_id('A.dra')], 'ending');
SELECT tests.as_user(tests.user_id('B.admin'));
INSERT INTO k SELECT 'b', public.fleet_report_contracts(NULL, 'agreements');
SELECT tests.reset_role();

CREATE FUNCTION pg_temp.kr(p_label text, p_key text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT e FROM k, jsonb_array_elements(k.r -> 'rows') AS e WHERE k.label = p_label AND e ->> 'contract_id' = tests.id('k:' || p_key)::text
$$;

SELECT tests.results_eq(
  $q$SELECT e ->> 'contract_number', e ->> 'agreement_state', e ->> 'awaiting' FROM k, jsonb_array_elements(k.r -> 'rows') AS e
     WHERE k.label = 'agreements' ORDER BY e ->> 'contract_number'$q$,
  $q$VALUES ('C-k1'::text, 'signed'::text, NULL::text), ('C-k2', 'draft', NULL), ('C-k3', 'not_signed', 'company'), ('C-k4', 'not_signed', 'both'),
            ('C-k5', 'not_signed', 'crew'), ('C-k6', 'not_signed', 'both'), ('C-k7', 'signed', NULL), ('C-k8', 'signed', NULL)$q$,
  'R10: every draft and active contract of A with its state; the expired one and company B left out');
SELECT tests.is((pg_temp.kr('agreements', 'k1') ->> 'vessel_id'), tests.vessel_id('A.dra')::text, 'R10: a contract with no vessel takes the person''s current vessel');
SELECT tests.is((pg_temp.kr('agreements', 'k7') ->> 'vessel_id'), tests.vessel_id('A.dra')::text, 'R10: someone on leave takes the contract''s own vessel');
SELECT tests.is((pg_temp.kr('agreements', 'k8') ->> 'vessel_id'), tests.vessel_id('A.hyd')::text, 'R10: the person''s current vessel wins over the contract''s');
SELECT tests.is((pg_temp.kr('agreements', 'k6') ->> 'vessel_id'), NULL::text, 'R10: no vessel at all: unassigned, listed for the fleet-wide read with fleet reach');
SELECT tests.is((pg_temp.kr('agreements', 'k1') ->> 'sea_reference'), 'SEA-DRA-1', 'R10: the SEA reference');
SELECT tests.is((pg_temp.kr('agreements', 'k3') ->> 'position'), 'Cook', 'R10: no contract position: the person''s');
SELECT tests.ok(NOT (pg_temp.kr('agreements', 'k1') ?| ARRAY['base_wage_minor', 'wage_currency', 'notice_period_days', 'notes']), 'R10: wages and terms are never read');
SELECT tests.is((SELECT (r ->> 'unassigned')::boolean FROM k WHERE label = 'agreements'), true, 'R10: the fleet-wide read lists unassigned contracts');
SELECT tests.results_eq(
  $q$SELECT e ->> 'contract_number' FROM k, jsonb_array_elements(k.r -> 'rows') AS e WHERE k.label = 'dra' ORDER BY 1$q$,
  $q$VALUES ('C-k1'::text), ('C-k2'), ('C-k3'), ('C-k7')$q$,
  'R10 DRAAK only: its contracts, no unassigned ones, not the one whose person is on HYDRA');
SELECT tests.is((SELECT (r ->> 'unassigned')::boolean FROM k WHERE label = 'dra'), false, 'R10: an explicit list lists no unassigned contracts');

SELECT tests.results_eq(
  $q$SELECT e ->> 'contract_number', e ->> 'bucket', (e ->> 'days_left')::int, (e ->> 'renewal_drafted')::boolean FROM k, jsonb_array_elements(k.r -> 'rows') AS e
     WHERE k.label = 'ending' ORDER BY (e ->> 'days_left')::int$q$,
  $q$VALUES ('C-k4'::text, 'ended'::text, -3, false), ('C-k6', 'd30', 10, false), ('C-k1', 'd30', 20, true), ('C-k3', 'd60', 45, false),
            ('C-k7', 'd60', 60, false), ('C-k5', 'd90', 80, false)$q$,
  'R11: active contracts ending by today + 90 (ended first), the renewal drafted for hr1; 120 days out, drafts and B left out');
SELECT tests.is((SELECT r ->> 'mode' FROM k WHERE label = 'ending'), 'ending', 'R11: the mode');
SELECT tests.results_eq(
  $q$SELECT e ->> 'vessel_name', e ->> 'state' FROM k, jsonb_array_elements(k.r -> 'vessels') AS e WHERE k.label = 'ending'$q$,
  $q$VALUES ('GAME CHANGER'::text, 'ok'::text), ('HYDRA', 'ok'), ('M/Y DRAAK', 'ok')$q$,
  'R11: HR has no module setting: GAME CHANGER''s contracts count');

SELECT tests.results_eq(
  $q$SELECT e ->> 'vessel_name', e ->> 'state' FROM k, jsonb_array_elements(k.r -> 'vessels') AS e WHERE k.label = 'rep'$q$,
  $q$VALUES ('M/Y DRAAK'::text, 'no_access'::text)$q$, 'R11 reports only (no HR rule): DRAAK no_access');
SELECT tests.is((SELECT r -> 'rows' FROM k WHERE label = 'rep'), '[]'::jsonb, 'R11 reports only: no rows');
SELECT tests.is((SELECT (r ->> 'unassigned')::boolean FROM k WHERE label = 'rep'), false, 'R11 reports only: no unassigned contracts');
SELECT tests.is((SELECT r -> 'rows' FROM k WHERE label = 'off'), '[]'::jsonb, 'R11 inactive: nothing');
SELECT tests.is((SELECT r -> 'vessels' FROM k WHERE label = 'off'), '[]'::jsonb, 'R11 inactive: no vessels');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM k, jsonb_array_elements(k.r -> 'rows') AS e WHERE k.label = 'b' AND e ->> 'contract_number' <> 'C-k10'),
                'R10 company B: only its own contract');

-- ------------------------------------------------------------ other callers of R9

SELECT tests.as_user(tests.user_id('A.rep_only'));
INSERT INTO h SELECT 'rep', public.fleet_report_hours_of_rest();
SELECT tests.as_user(tests.user_id('A.disabled'));
INSERT INTO h SELECT 'off', public.fleet_report_hours_of_rest(ARRAY[tests.vessel_id('A.hyd')]);
SELECT tests.as_user(tests.user_id('B.admin'));
INSERT INTO h SELECT 'b', public.fleet_report_hours_of_rest(NULL, (SELECT t FROM d) - 9, (SELECT t FROM d), (SELECT t FROM d));
SELECT tests.as_anon();
SELECT tests.throws('SELECT public.fleet_report_hours_of_rest()', '42501', 'anon cannot execute fleet_report_hours_of_rest');
SELECT tests.throws('SELECT public.fleet_report_contracts()', '42501', 'anon cannot execute fleet_report_contracts');
SELECT tests.throws('SELECT public.fleet_report_crew_qualifications()', '42501', 'anon cannot execute fleet_report_crew_qualifications');
SELECT tests.reset_role();

SELECT tests.results_eq(
  $q$SELECT e ->> 'vessel_name', e ->> 'state', e ->> 'breach_days' FROM h, jsonb_array_elements(h.r -> 'per_vessel') AS e WHERE h.label = 'rep'$q$,
  $q$VALUES ('M/Y DRAAK'::text, 'no_access'::text, NULL::text)$q$, 'R9 reports only (no HoR rule): DRAAK no_access, no numbers');
SELECT tests.is((SELECT r -> 'totals' FROM h WHERE label = 'rep'), 'null'::jsonb, 'R9 reports only: no totals at all, never zeros');
SELECT tests.is((SELECT r -> 'heat' FROM h WHERE label = 'rep'), '[]'::jsonb, 'R9 reports only: no heat map');
SELECT tests.is((SELECT (r #>> '{emerging,total}')::int FROM h WHERE label = 'rep'), 0, 'R9 reports only: no people');
SELECT tests.is((SELECT (r ->> 'vessels')::int FROM h WHERE label = 'off'), 0, 'R9 inactive: nothing (an explicit id is not even looked at)');
SELECT tests.is((SELECT r -> 'per_vessel' FROM h WHERE label = 'off'), '[]'::jsonb, 'R9 inactive: no vessels');
SELECT tests.is((SELECT r #>> '{per_vessel,0,vessel_name}' FROM h WHERE label = 'b'), 'LEVIATHAN', 'R9 company B: its own vessel');
SELECT tests.is((SELECT (r #>> '{per_vessel,0,breach_days}')::int FROM h WHERE label = 'b'), 1, 'R9 company B: its own breach only');

-- ------------------------------------------------------------ the scope helper

SELECT tests.results_eq(
  format($q$SELECT cardinality(vessel_ids), cardinality(hours_of_rest), cardinality(hours_of_rest_on), cardinality(hr), cardinality(compliance),
                   cardinality(compliance_on), fleet_hr
            FROM public.fleet_report_crew_scope_for(%L, %L, NULL, current_date)$q$, tests.user_id('A.fleet_manager'), tests.company_id('A')),
  $q$VALUES (3, 3, 2, 3, 3, 2, true)$q$,
  'scope (fleet manager): three vessels; HoR and compliance on two with crew on; HR on all three; fleet-level HR');
SELECT tests.results_eq(
  format($q$SELECT cardinality(vessel_ids), cardinality(hours_of_rest), cardinality(hr), cardinality(compliance), fleet_hr
            FROM public.fleet_report_crew_scope_for(%L, %L, NULL, current_date)$q$, tests.user_id('A.rep_only'), tests.company_id('A')),
  $q$VALUES (1, 0, 0, 0, false)$q$,
  'scope (reports only): DRAAK, nothing else, no fleet level');
SELECT tests.results_eq(
  format($q$SELECT cardinality(vessel_ids), fleet_hr FROM public.fleet_report_crew_scope_for(%L, %L, NULL, current_date)$q$,
         tests.user_id('A.disabled'), tests.company_id('A')),
  $q$VALUES (0, false)$q$, 'scope (inactive): nothing');
SELECT tests.results_eq(
  format($q$SELECT cardinality(vessel_ids), fleet_hr FROM public.fleet_report_crew_scope_for(%L, %L, ARRAY[%L]::uuid[], current_date)$q$,
         tests.user_id('A.fleet_manager'), tests.company_id('A'), tests.vessel_id('A.hyd')),
  $q$VALUES (1, false)$q$, 'scope: an explicit list is never fleet level');
SELECT tests.is(public.fleet_report_hor_vessel_on(tests.user_id('A.hr3'), current_date - 5), tests.vessel_id('A.hyd'), 'attribution: the assignment covering the day');
SELECT tests.is(public.fleet_report_hor_vessel_on(tests.user_id('A.hr3'), current_date - 200), NULL::uuid, 'attribution: no assignment that day');

-- ------------------------------------------------------------ grants

SELECT tests.ok(has_function_privilege('authenticated', x, 'EXECUTE') AND NOT has_function_privilege('anon', x, 'EXECUTE'),
                'grants: authenticated, not anon: ' || x)
FROM unnest(ARRAY[
  'public.fleet_report_crew_qualifications(uuid[])',
  'public.fleet_report_hours_of_rest(uuid[], date, date, date)',
  'public.fleet_report_contracts(uuid[], text, date)']) AS x;
SELECT tests.ok(NOT has_function_privilege('authenticated', x, 'EXECUTE') AND NOT has_function_privilege('anon', x, 'EXECUTE')
                AND has_function_privilege('service_role', x, 'EXECUTE'),
                'grants: service role only: ' || x)
FROM unnest(ARRAY[
  'public.fleet_report_crew_scope_for(uuid, uuid, uuid[], date)',
  'public.fleet_report_hor_vessel_on(uuid, date)',
  'public.fleet_report_agreement_state(text, text, timestamptz, timestamptz)',
  'public.fleet_report_agreement_awaiting(text, text, timestamptz, timestamptz)',
  'public.fleet_report_contract_bucket(date, date)']) AS x;
SELECT tests.ok(p.proconfig @> ARRAY['search_path=public'], 'functions set search_path: ' || p.proname)
FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('fleet_report_crew_qualifications', 'fleet_report_hours_of_rest', 'fleet_report_contracts',
                                             'fleet_report_crew_scope_for', 'fleet_report_hor_vessel_on', 'fleet_report_agreement_state',
                                             'fleet_report_agreement_awaiting', 'fleet_report_contract_bucket')
ORDER BY p.proname;
SELECT tests.ok(p.prosecdef, 'definer: ' || p.proname)
FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('fleet_report_crew_qualifications', 'fleet_report_hours_of_rest', 'fleet_report_contracts',
                                             'fleet_report_crew_scope_for', 'fleet_report_hor_vessel_on', 'fleet_report_agreement_state',
                                             'fleet_report_agreement_awaiting', 'fleet_report_contract_bucket')
ORDER BY p.proname;
