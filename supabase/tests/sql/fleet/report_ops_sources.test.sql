-- The fleet operations report RPCs (20261124041000_fleet_report_ops_sources.sql;
-- gap/02 R7, R13, R17, R18; D-X5-09, D-X5-21, D-X5-22):
-- fleet_report_overdue_drills(), fleet_report_insurance(),
-- fleet_report_audits() and fleet_report_work_list() over two companies and
-- the three vessels of A (DRAAK; HYDRA with Technical › Jobs switched off;
-- GAME CHANGER with Safety switched off), on days relative to today.
-- Proves: the pure drill-interval and audit-state rules (the cases between
-- the markers are asserted by the TS mirror too); each report's counts on a
-- seeded world (missed and lapsed drills, due soon, never carried out; the
-- dashboard's overdue drills are the same rows); insurance buckets from the
-- expiry engine, with the company's window; audits and surveys in a
-- period, overdue and in-progress audits whatever the period, findings,
-- auditors; the work list per vessel with its status chips and the overdue
-- jobs (the dashboard's overdue jobs are the same jobs); the per-vessel
-- gates (no_access, module_off, never zeros); fleet-level insurance and
-- company audits only for the fleet-wide read with fleet reach; a foreign
-- vessel refused (42501); the period refusals; an inactive caller, company
-- B, anon; grants, search_path and the definer flag.

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ pure rules (TS lib/opsReports.ts reads these cases)

CREATE TEMP TABLE interval_case (k text PRIMARY KEY, last_off integer, freq integer, want text) ON COMMIT DROP;
INSERT INTO interval_case VALUES
-- drill-interval-cases:start
  ('never', NULL, 7, 'never'),
  ('lapsed_by_one', -8, 7, 'lapsed'),
  ('lapsed_long_ago', -400, 30, 'lapsed'),
  ('due_today', -7, 7, 'due_soon'),
  ('due_in_7', -23, 30, 'due_soon'),
  ('due_in_8', -22, 30, 'on_track'),
  ('fresh', 0, 30, 'on_track'),
  ('future_last', 5, 7, 'on_track'),
  ('no_interval', -3, NULL, NULL),
  ('zero_interval', -3, 0, NULL),
  ('never_no_interval', NULL, NULL, NULL)
-- drill-interval-cases:end
;
SELECT tests.is(public.fleet_report_drill_interval_state(CASE WHEN c.last_off IS NULL THEN NULL ELSE date '2026-11-15' + c.last_off END,
                                                         c.freq, date '2026-11-15'),
                c.want, 'drill interval: ' || c.k)
FROM interval_case AS c ORDER BY c.k;
SELECT tests.is(public.fleet_report_drill_interval_state(date '2026-11-01', 7, NULL), NULL::text, 'drill interval: no day, no state');

CREATE TEMP TABLE audit_case (k text PRIMARY KEY, status text, off integer, want text) ON COMMIT DROP;
INSERT INTO audit_case VALUES
-- audit-state-cases:start
  ('planned_future', 'Planned', 5, 'due'),
  ('planned_today', 'Planned', 0, 'due'),
  ('planned_past', 'Planned', -1, 'overdue'),
  ('scheduled_past', 'Scheduled', -3, 'overdue'),
  ('in_progress_past', 'In_Progress', -10, 'in_progress'),
  ('in_progress_spaced', 'In Progress', -2, 'in_progress'),
  ('completed_past', 'Completed', -5, 'done'),
  ('closed_future', 'Closed', 3, 'done'),
  ('cancelled', 'Cancelled', -5, 'cancelled'),
  ('canceled_lower', 'canceled', 2, 'cancelled'),
  ('no_status_past', NULL, -1, 'overdue'),
  ('no_status_future', NULL, 10, 'due'),
  ('no_date', 'Planned', NULL, 'due')
-- audit-state-cases:end
;
SELECT tests.is(public.fleet_report_audit_state(c.status, CASE WHEN c.off IS NULL THEN NULL ELSE date '2026-11-15' + c.off END, date '2026-11-15'),
                c.want, 'audit state: ' || c.k)
FROM audit_case AS c ORDER BY c.k;

-- ------------------------------------------------------------ world

-- GAME CHANGER: Safety off (drills and audits module_off). HYDRA: Technical › Jobs off (the work list module_off; Technical stays on).
INSERT INTO public.vessel_module_settings (vessel_id, company_id, module_key, enabled) VALUES
  (tests.vessel_id('A.gam'), tests.company_id('A'), 'safety', false),
  (tests.vessel_id('A.hyd'), tests.company_id('A'), 'technical.jobs', false);

-- A reader of DRAAK only (no fleet reach) with every operations rule; a reports-only reader of DRAAK.
SELECT tests.seed_user('A', 'A.ops_dra', 'crew');
SELECT tests.seed_user('A', 'A.rep_only', 'crew');
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'shore', vessel_scope = 'assigned', fleet_access = false, source = 'admin'
WHERE user_id IN (tests.user_id('A.ops_dra'), tests.user_id('A.rep_only'));
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT m.id, m.company_id, tests.vessel_id('A.dra') FROM public.account_memberships AS m
WHERE m.user_id IN (tests.user_id('A.ops_dra'), tests.user_id('A.rep_only'));
SELECT tests.seed_role('x5_ops_dra', 'vessel');
SELECT tests.seed_role('x5_ops_rep_only', 'vessel');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, m, 'view', 'fleet' FROM public.roles AS r,
       unnest(ARRAY['reports', 'drills', 'insurance', 'audits_surveys', 'maintenance', 'vessel_certificates']) AS m
WHERE r.name = 'x5_ops_dra';
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'reports', 'view', 'fleet' FROM public.roles AS r WHERE r.name = 'x5_ops_rep_only';
SELECT tests.seed_rbac_role('A.ops_dra', 'x5_ops_dra');
SELECT tests.seed_rbac_role('A.rep_only', 'x5_ops_rep_only');

-- ---- drills: this test's own drill types only (the seeded ones are switched off inside the transaction).
UPDATE public.drill_types SET is_active = false;
INSERT INTO public.drill_types (id, drill_name, category, minimum_frequency, solas_reference, is_active) VALUES
  (tests.id('dt:fire'), 'Fire drill (test)', 'SOLAS_Required', 7, 'SOLAS III/19', true),
  (tests.id('dt:abandon'), 'Abandon ship drill (test)', 'SOLAS_Required', 30, 'SOLAS III/19', true),
  (tests.id('dt:collision'), 'Collision drill (test)', 'Company_Required', 90, NULL, true),
  (tests.id('dt:voluntary'), 'Voluntary drill (test)', 'Voluntary', 30, NULL, true),
  (tests.id('dt:retired'), 'Retired drill (test)', 'SOLAS_Required', 30, NULL, false);
INSERT INTO public.drills (id, vessel_id, drill_type_id, drill_date_scheduled, drill_date_actual, scenario_description, status)
SELECT tests.id('dr:' || x.k), tests.vessel_id(x.v), tests.id('dt:' || x.t), current_date + x.sched,
       CASE WHEN x.actual IS NULL THEN NULL ELSE ((current_date + x.actual)::timestamp + interval '10 hours') AT TIME ZONE 'UTC' END,
       'Scenario', x.status
FROM (VALUES
  ('d1', 'A.dra', 'fire', -3, NULL::int, 'Scheduled'),       -- missed 3 days ago
  ('d2', 'A.dra', 'fire', -11, -10, 'Completed'),            -- the last fire drill: due 3 days ago (lapsed)
  ('d3', 'A.dra', 'abandon', -25, NULL, 'Completed'),        -- completed, no actual: its scheduled day; due in 5 days
  ('d4', 'A.dra', 'abandon', 10, NULL, 'Scheduled'),         -- the next abandon ship drill
  ('d6', 'A.dra', 'fire', -1, NULL, 'Cancelled'),            -- cancelled: not missed, not done
  ('d7', 'A.dra', 'voluntary', -5, NULL, 'Scheduled'),       -- a missed voluntary drill (missed counts every type)
  ('d8', 'A.dra', 'fire', -2, NULL, 'Postponed'),            -- postponed: not missed (the dashboard's rule)
  ('d9', 'A.dra', 'retired', -400, NULL, 'Completed'),       -- a retired type: no interval row
  ('h1', 'A.hyd', 'fire', -2, -2, 'Completed'),              -- due in 5 days
  ('h2', 'A.hyd', 'abandon', -29, -29, 'Completed'),         -- due tomorrow
  ('h3', 'A.hyd', 'collision', -30, -30, 'Completed'),       -- on track
  ('g1', 'A.gam', 'fire', -5, NULL, 'Scheduled'),            -- GAME CHANGER: Safety off
  ('b1', 'B.lev', 'fire', -4, NULL, 'Scheduled')             -- company B
) AS x(k, v, t, sched, actual, status);

-- ---- insurance policies (expiry engine source insurance_policies; the default window for insurance is 90 days).
INSERT INTO public.insurance_policies (id, company_id, vessel_id, policy_type, policy_number, insurer_name, insurer_contact,
                                       coverage_start_date, coverage_end_date, status, lifecycle_status, certificate_url, premium_amount)
SELECT tests.id('ins:' || x.k), tests.company_id(x.co), CASE WHEN x.v IS NULL THEN NULL ELSE tests.vessel_id(x.v) END, x.type, 'POL-' || x.k,
       x.insurer, 'Broker desk', current_date - 300, current_date + x.e, x.status, x.lifecycle::public.record_lifecycle_status,
       x.cert, 1000
FROM (VALUES
  ('p1', 'A', 'A.dra', 'P&I', 'Mutual Club', -5, 'active', 'active', 'files/p1.pdf'),
  ('p2', 'A', 'A.dra', 'Hull & Machinery', 'Insurer One', 20, 'pending_renewal', 'active', NULL),
  ('p3', 'A', 'A.hyd', 'Crew Medical', 'Insurer Two', 60, 'active', 'active', NULL),
  ('p4', 'A', 'A.hyd', 'Hull & Machinery', 'Insurer One', 400, 'active', 'active', NULL),
  ('p5', 'A', NULL, 'War risks', 'Insurer Three', 45, 'active', 'active', NULL),
  ('p6', 'A', 'A.dra', 'Pollution', 'Insurer One', 30, 'cancelled', 'active', NULL),
  ('p7', 'A', 'A.dra', 'Wreck removal', 'Insurer One', 30, 'active', 'archived', NULL),
  ('p8', 'A', 'A.gam', 'P&I', 'Mutual Club', 10, 'active', 'active', NULL),
  ('p9', 'B', 'B.lev', 'P&I', 'Mutual Club', 10, 'active', 'active', NULL)
) AS x(k, co, v, type, insurer, e, status, lifecycle, cert);

-- ---- audits (dated by actual start, else scheduled) and their findings.
INSERT INTO public.audits (id, audit_type, audit_scope, vessel_id, company_id, scheduled_date, actual_start_date, actual_end_date, status,
                           overall_result, external_auditor_org, external_auditor_name, lead_auditor_id)
SELECT tests.id('aud:' || x.k), x.type, 'Full SMS', CASE WHEN x.v IS NULL THEN NULL ELSE tests.vessel_id(x.v) END, tests.company_id(x.co),
       current_date + x.sched, CASE WHEN x.started IS NULL THEN NULL ELSE current_date + x.started END,
       CASE WHEN x.ended IS NULL THEN NULL ELSE current_date + x.ended END, x.status, x.result, x.org, x.auditor,
       CASE WHEN x.lead IS NULL THEN NULL ELSE tests.user_id(x.lead) END
FROM (VALUES
  ('a1', 'A', 'A.dra', 'Internal', -20, NULL::int, NULL::int, 'Planned', NULL, NULL, NULL, NULL),                  -- overdue
  ('a2', 'A', 'A.dra', 'External_Annual', -100, -98, -97, 'Completed', 'Satisfactory_with_Observations', 'Class society', 'Lead surveyor', NULL),
  ('a3', 'A', 'A.dra', 'Internal', 30, NULL, NULL, 'Planned', NULL, NULL, NULL, 'A.master_dra'),                    -- due, an internal lead auditor
  ('a4', 'A', 'A.dra', 'Internal', -500, -500, -499, 'Completed', 'Satisfactory', NULL, NULL, NULL),               -- before the period: left out
  ('a5', 'A', 'A.dra', 'External_Renewal', -600, NULL, NULL, 'Planned', NULL, 'Flag', NULL, NULL),                 -- overdue long ago: listed
  ('a6', 'A', 'A.dra', 'External_Intermediate', -12, -10, NULL, 'In_Progress', NULL, 'Class society', NULL, NULL), -- in progress
  ('a7', 'A', 'A.dra', 'Internal', -5, NULL, NULL, 'Cancelled', NULL, NULL, NULL, NULL),                           -- cancelled, in the period
  ('a8', 'A', 'A.hyd', 'Internal', 60, NULL, NULL, 'Planned', NULL, NULL, NULL, NULL),
  ('a9', 'A', 'A.gam', 'Internal', 5, NULL, NULL, 'Planned', NULL, NULL, NULL, NULL),                              -- GAME CHANGER: Safety off
  ('a10', 'A', NULL, 'External_Annual', 15, NULL, NULL, 'Planned', NULL, 'Flag', NULL, NULL),                      -- a company audit
  ('a11', 'B', 'B.lev', 'Internal', -20, NULL, NULL, 'Planned', NULL, NULL, NULL, NULL)                            -- company B
) AS x(k, co, v, type, sched, started, ended, status, result, org, auditor, lead);
INSERT INTO public.audit_findings (id, audit_id, finding_type, ism_section, requirement_text, finding_description, objective_evidence, status)
SELECT tests.id('af:' || x.k), tests.id('aud:' || x.a), x.type, 10, 'Requirement', 'Finding', 'Evidence', x.status
FROM (VALUES
  ('f1', 'a2', 'Major_NC', 'Open'),
  ('f2', 'a2', 'Minor_NC', 'Closed'),
  ('f3', 'a2', 'Observation', 'CAPA_Assigned'),
  ('f4', 'a11', 'Major_NC', 'Open')
) AS x(k, a, type, status);

-- ---- certificate surveys (next_survey_date).
INSERT INTO public.certificates (id, certificate_type, certificate_number, certificate_name, issuing_authority, vessel_id, company_id,
                                 issue_date, expiry_date, next_survey_date, status, superseded_by)
SELECT tests.id('cert:' || x.k), 'Statutory', 'C-' || x.k, x.name, x.auth, tests.vessel_id(x.v), tests.company_id(x.co),
       current_date - 400, current_date + 500, current_date + x.survey, x.status,
       CASE WHEN x.sup THEN tests.id('cert:c1') END
FROM (VALUES
  ('c1', 'A', 'A.dra', 'Safety Management Certificate', 'Flag', 40, 'Valid', false),
  ('c2', 'A', 'A.dra', 'Old Load Line Certificate', 'Class', 20, 'Superseded', true),
  ('c3', 'A', 'A.hyd', 'Load Line Certificate', 'Class', -3, 'Valid', false),
  ('c4', 'A', 'A.gam', 'Tonnage Certificate', 'Flag', 20, 'Valid', false),
  ('c5', 'A', 'A.dra', 'Radio Certificate', 'Flag', 200, 'Valid', false),
  ('c6', 'B', 'B.lev', 'Safety Equipment Certificate', 'Flag', 20, 'Valid', false)
) AS x(k, co, v, name, auth, survey, status, sup);

-- ---- jobs (maintenance_tasks through equipment.vessel_id).
INSERT INTO public.equipment_categories (id, category_name) VALUES (tests.id('eqc:ops'), 'Machinery');
INSERT INTO public.equipment (id, vessel_id, category_id, equipment_name, equipment_code)
SELECT tests.id('eq:' || v), tests.vessel_id(v), tests.id('eqc:ops'), 'Main engine', 'ME-' || v FROM unnest(ARRAY['A.dra', 'A.hyd', 'A.gam', 'B.lev']) AS v;
INSERT INTO public.maintenance_tasks (id, task_number, equipment_id, task_name, task_type, due_date, status, priority, actual_completion_date)
SELECT tests.id('mt:' || x.k), 'OPS-' || x.k, tests.id('eq:' || x.v), 'Job ' || x.k, 'Planned', current_date + x.d, x.status, x.priority,
       CASE WHEN x.done IS NULL THEN NULL ELSE ((current_date + x.done)::timestamp + interval '10 hours') AT TIME ZONE 'UTC' END
FROM (VALUES
  ('j1', 'A.dra', -10, 'Pending', 'High', NULL::int),         -- overdue 10 days
  ('j2', 'A.dra', -2, 'Scheduled', 'Normal', NULL),           -- overdue 2 days
  ('j3', 'A.dra', 5, 'Overdue', 'Urgent', NULL),              -- status Overdue: overdue, 0 days
  ('j4', 'A.dra', 10, 'In_Progress', 'Normal', NULL),         -- open, due within 30 days
  ('j5', 'A.dra', 45, 'Pending', 'Low', NULL),                -- open, later
  ('j6', 'A.dra', -5, 'Completed', 'Normal', -3),             -- completed in the last 30 days
  ('j7', 'A.dra', -70, 'Completed', 'Normal', -60),           -- completed long ago
  ('j8', 'A.dra', -3, 'Cancelled', 'Normal', NULL),           -- closed
  ('j9', 'A.dra', -1, 'Pending approval', 'Normal', NULL),    -- awaiting approval (not overdue)
  ('j10', 'A.gam', -1, 'Pending', 'Normal', NULL),            -- overdue 1 day
  ('j11', 'A.hyd', -4, 'Pending', 'Normal', NULL),            -- HYDRA: Jobs off
  ('j12', 'B.lev', -4, 'Pending', 'Normal', NULL)             -- company B
) AS x(k, v, d, status, priority, done);

-- ------------------------------------------------------------ the reads

CREATE TEMP TABLE r ON COMMIT DROP AS SELECT 'x'::text AS label, NULL::jsonb AS j WHERE false;
GRANT ALL ON r TO PUBLIC;
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
INSERT INTO r SELECT 'drills', public.fleet_report_overdue_drills();
INSERT INTO r SELECT 'drills_dra', public.fleet_report_overdue_drills(ARRAY[tests.vessel_id('A.dra')]);
INSERT INTO r SELECT 'panels', public.fleet_dashboard_panels(NULL, 20);
INSERT INTO r SELECT 'ins', public.fleet_report_insurance();
INSERT INTO r SELECT 'ins_dra', public.fleet_report_insurance(ARRAY[tests.vessel_id('A.dra')]);
INSERT INTO r SELECT 'aud', public.fleet_report_audits();
INSERT INTO r SELECT 'aud_next90', public.fleet_report_audits(NULL, current_date, current_date + 90);
INSERT INTO r SELECT 'aud_hyd', public.fleet_report_audits(ARRAY[tests.vessel_id('A.hyd')]);
INSERT INTO r SELECT 'work', public.fleet_report_work_list();
INSERT INTO r SELECT 'kpis_dra', public.fleet_dashboard_kpis(ARRAY[tests.vessel_id('A.dra')]);
INSERT INTO r SELECT 'work_dra', public.fleet_report_work_list(ARRAY[tests.vessel_id('A.dra')]);
SELECT tests.throws_like(format($q$SELECT public.fleet_report_overdue_drills(ARRAY[%L]::uuid[])$q$, tests.vessel_id('B.lev')),
                         '42501', 'vessel_out_of_reach', 'R7: a foreign vessel is refused (42501)');
SELECT tests.throws_like(format($q$SELECT public.fleet_report_insurance(ARRAY[%L, %L]::uuid[])$q$, tests.vessel_id('A.dra'), tests.vessel_id('B.lev')),
                         '42501', 'vessel_out_of_reach', 'R13: one foreign vessel among own ones refuses the whole read');
SELECT tests.throws_like(format($q$SELECT public.fleet_report_audits(ARRAY[%L]::uuid[])$q$, tests.vessel_id('B.lev')),
                         '42501', 'vessel_out_of_reach', 'R17: a foreign vessel is refused (42501)');
SELECT tests.throws_like(format($q$SELECT public.fleet_report_work_list(ARRAY[%L]::uuid[])$q$, tests.vessel_id('B.lev')),
                         '42501', 'vessel_out_of_reach', 'R18: a foreign vessel is refused (42501)');
SELECT tests.throws_like(format($q$SELECT public.fleet_report_audits(NULL, %L::date, %L::date)$q$, current_date, current_date - 1),
                         '22023', 'invalid_period', 'R17: a period that starts after it ends is refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_report_audits(NULL, %L::date, %L::date)$q$, current_date - 731, current_date),
                         '22023', 'period_too_long', 'R17: 732 days are refused');
SELECT tests.lives(format($q$SELECT public.fleet_report_audits(NULL, %L::date, %L::date)$q$, current_date - 730, current_date),
                   'R17: 731 days are allowed');
-- The company's insurance window, 30 days: expiring becomes valid beyond it.
SELECT tests.reset_role();
INSERT INTO public.expiry_window_rules (company_id, item_type, warn_days) VALUES (tests.company_id('A'), 'insurance_policy', 30);
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
INSERT INTO r SELECT 'ins_w30', public.fleet_report_insurance();
SELECT tests.reset_role();
DELETE FROM public.expiry_window_rules WHERE company_id = tests.company_id('A') AND item_type = 'insurance_policy';

SELECT tests.as_user(tests.user_id('A.ops_dra'));
INSERT INTO r SELECT 'drills_ops', public.fleet_report_overdue_drills();
INSERT INTO r SELECT 'ins_ops', public.fleet_report_insurance();
INSERT INTO r SELECT 'aud_ops', public.fleet_report_audits();
INSERT INTO r SELECT 'work_ops', public.fleet_report_work_list();
SELECT tests.throws_like(format($q$SELECT public.fleet_report_insurance(ARRAY[%L]::uuid[])$q$, tests.vessel_id('A.hyd')),
                         '42501', 'vessel_out_of_reach', 'R13: a vessel the DRAAK reader does not reach is refused');
SELECT tests.as_user(tests.user_id('A.rep_only'));
INSERT INTO r SELECT 'drills_rep', public.fleet_report_overdue_drills();
INSERT INTO r SELECT 'ins_rep', public.fleet_report_insurance();
INSERT INTO r SELECT 'aud_rep', public.fleet_report_audits();
INSERT INTO r SELECT 'work_rep', public.fleet_report_work_list();
SELECT tests.as_user(tests.user_id('A.disabled'));
INSERT INTO r SELECT 'drills_off', public.fleet_report_overdue_drills(ARRAY[tests.vessel_id('A.dra')]);
INSERT INTO r SELECT 'ins_off', public.fleet_report_insurance(ARRAY[tests.vessel_id('A.dra')]);
INSERT INTO r SELECT 'aud_off', public.fleet_report_audits(ARRAY[tests.vessel_id('A.dra')]);
INSERT INTO r SELECT 'work_off', public.fleet_report_work_list(ARRAY[tests.vessel_id('A.dra')]);
SELECT tests.as_user(tests.user_id('B.admin'));
INSERT INTO r SELECT 'drills_b', public.fleet_report_overdue_drills();
INSERT INTO r SELECT 'ins_b', public.fleet_report_insurance();
INSERT INTO r SELECT 'aud_b', public.fleet_report_audits();
INSERT INTO r SELECT 'work_b', public.fleet_report_work_list();
SELECT tests.as_anon();
SELECT tests.throws('SELECT public.fleet_report_overdue_drills()', '42501', 'anon cannot execute fleet_report_overdue_drills');
SELECT tests.throws('SELECT public.fleet_report_insurance()', '42501', 'anon cannot execute fleet_report_insurance');
SELECT tests.throws('SELECT public.fleet_report_audits()', '42501', 'anon cannot execute fleet_report_audits');
SELECT tests.throws('SELECT public.fleet_report_work_list()', '42501', 'anon cannot execute fleet_report_work_list');
SELECT tests.reset_role();

CREATE FUNCTION pg_temp.vessel_states(p_label text) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg((e ->> 'vessel_name') || ':' || (e ->> 'state'), ', ' ORDER BY n) FROM r, jsonb_array_elements(r.j -> 'vessels') WITH ORDINALITY AS x(e, n)
  WHERE r.label = p_label
$$;

-- ------------------------------------------------------------ R7 overdue drills

SELECT tests.is(pg_temp.vessel_states('drills'), 'GAME CHANGER:module_off, HYDRA:ok, M/Y DRAAK:ok', 'R7: vessels by name; GAME CHANGER module_off (Safety off)');
SELECT tests.is((SELECT (j ->> 'required_types')::int FROM r WHERE label = 'drills'), 3, 'R7: three active required drill types (SOLAS and company; not voluntary or retired)');
SELECT tests.results_eq(
  $q$SELECT e ->> 'kind', e ->> 'vessel_id', e ->> 'drill_type', (e ->> 'days_overdue')::int, e ->> 'status'
     FROM r, jsonb_array_elements(r.j -> 'rows') WITH ORDINALITY AS x(e, n) WHERE r.label = 'drills' ORDER BY n$q$,
  format($q$VALUES ('missed'::text, %1$L::text, 'Voluntary drill (test)'::text, 5, 'Scheduled'::text),
                   ('lapsed', %1$L, 'Fire drill (test)', 3, NULL),
                   ('missed', %1$L, 'Fire drill (test)', 3, 'Scheduled'),
                   ('due_soon', %2$L, 'Abandon ship drill (test)', -1, NULL),
                   ('due_soon', %2$L, 'Fire drill (test)', -5, NULL),
                   ('due_soon', %1$L, 'Abandon ship drill (test)', -5, NULL),
                   ('never', %1$L, 'Collision drill (test)', NULL, NULL)$q$,
         tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')),
  'R7: missed and lapsed most overdue first, then due soon soonest first, then never; cancelled, postponed, on-track and retired left out');
CREATE FUNCTION pg_temp.drill(p_label text, p_kind text, p_vessel text, p_type text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT e FROM r, jsonb_array_elements(r.j -> 'rows') AS e
  WHERE r.label = p_label AND e ->> 'kind' = p_kind AND e ->> 'vessel_id' = tests.vessel_id(p_vessel)::text AND e ->> 'drill_type_id' = tests.id('dt:' || p_type)::text
$$;
SELECT tests.is((pg_temp.drill('drills', 'lapsed', 'A.dra', 'fire') ->> 'last_done_on')::date, current_date - 10, 'R7 lapsed: the last drill carried out, on its actual day');
SELECT tests.is((pg_temp.drill('drills', 'lapsed', 'A.dra', 'fire') ->> 'due_on')::date, current_date - 3, 'R7 lapsed: due = last + 7 days');
SELECT tests.is((pg_temp.drill('drills', 'lapsed', 'A.dra', 'fire') ->> 'frequency_days')::int, 7, 'R7: the interval in days');
SELECT tests.is(pg_temp.drill('drills', 'lapsed', 'A.dra', 'fire') ->> 'category', 'SOLAS_Required', 'R7: the category');
SELECT tests.is(pg_temp.drill('drills', 'lapsed', 'A.dra', 'fire') ->> 'solas_reference', 'SOLAS III/19', 'R7: the SOLAS reference');
SELECT tests.is(pg_temp.drill('drills', 'missed', 'A.dra', 'fire') ->> 'drill_id', tests.id('dr:d1')::text, 'R7 missed: the drill itself');
SELECT tests.ok(pg_temp.drill('drills', 'missed', 'A.dra', 'fire') ->> 'drill_number' IS NOT NULL, 'R7 missed: its drill number');
SELECT tests.is((pg_temp.drill('drills', 'missed', 'A.dra', 'fire') ->> 'last_done_on')::date, current_date - 10,
                'R7 missed: when its type was last carried out on that vessel');
SELECT tests.is(pg_temp.drill('drills', 'missed', 'A.dra', 'voluntary') ->> 'last_done_on', NULL::text,
                'R7 missed: no last day when the type was never carried out there');
SELECT tests.is((pg_temp.drill('drills', 'due_soon', 'A.dra', 'abandon') ->> 'last_done_on')::date, current_date - 25,
                'R7: a completed drill with no actual date counts on its scheduled day');
SELECT tests.is((pg_temp.drill('drills', 'due_soon', 'A.dra', 'abandon') ->> 'next_scheduled_on')::date, current_date + 10, 'R7: the next drill scheduled');
SELECT tests.is(pg_temp.drill('drills', 'lapsed', 'A.dra', 'fire') ->> 'next_scheduled_on', NULL::text, 'R7: nothing scheduled (the missed and postponed drills are past)');
SELECT tests.is(pg_temp.drill('drills', 'never', 'A.dra', 'collision') ->> 'due_on', NULL::text, 'R7 never: no due day');
SELECT tests.is((SELECT count(*)::int FROM r, jsonb_array_elements(r.j -> 'rows') AS e WHERE r.label = 'drills' AND e ->> 'kind' = 'missed'),
                (SELECT (j #>> '{overdue_drills,total}')::int FROM r WHERE label = 'panels'),
                'R7: the missed drills are the dashboard''s overdue drills');
SELECT tests.results_eq(
  $q$SELECT e ->> 'kind', e ->> 'drill_type' FROM r, jsonb_array_elements(r.j -> 'rows') WITH ORDINALITY AS x(e, n) WHERE r.label = 'drills_dra' ORDER BY n$q$,
  $q$VALUES ('missed'::text, 'Voluntary drill (test)'::text), ('lapsed', 'Fire drill (test)'), ('missed', 'Fire drill (test)'),
            ('due_soon', 'Abandon ship drill (test)'), ('never', 'Collision drill (test)')$q$,
  'R7: an explicit vessel list shows those vessels only');
SELECT tests.is(pg_temp.vessel_states('drills_ops'), 'M/Y DRAAK:ok', 'R7 DRAAK reader: its vessel only');
SELECT tests.is((SELECT jsonb_array_length(j -> 'rows') FROM r WHERE label = 'drills_ops'), 5, 'R7 DRAAK reader: DRAAK''s five rows');
SELECT tests.is(pg_temp.vessel_states('drills_rep'), 'M/Y DRAAK:no_access', 'R7 reports only (no drills rule): DRAAK no_access');
SELECT tests.is((SELECT j -> 'rows' FROM r WHERE label = 'drills_rep'), '[]'::jsonb, 'R7 reports only: no rows, never zeros');
SELECT tests.is((SELECT j -> 'vessels' FROM r WHERE label = 'drills_off'), '[]'::jsonb, 'R7 inactive: nothing (an explicit id is not even looked at)');
SELECT tests.is((SELECT j -> 'rows' FROM r WHERE label = 'drills_off'), '[]'::jsonb, 'R7 inactive: no rows');
SELECT tests.results_eq(
  $q$SELECT e ->> 'kind', e ->> 'vessel_id' FROM r, jsonb_array_elements(r.j -> 'rows') AS e WHERE r.label = 'drills_b' AND e ->> 'kind' = 'missed'$q$,
  format($q$VALUES ('missed'::text, %L::text)$q$, tests.vessel_id('B.lev')), 'R7 company B: its own missed drill only');

-- ------------------------------------------------------------ R13 insurance

CREATE FUNCTION pg_temp.policy(p_label text, p_key text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT e FROM r, jsonb_array_elements(r.j -> 'rows') AS e WHERE r.label = p_label AND e ->> 'policy_id' = tests.id('ins:' || p_key)::text
$$;
SELECT tests.results_eq(
  $q$SELECT e ->> 'policy_number', e ->> 'bucket', (e ->> 'days_remaining')::int
     FROM r, jsonb_array_elements(r.j -> 'rows') WITH ORDINALITY AS x(e, n) WHERE r.label = 'ins' ORDER BY n$q$,
  $q$VALUES ('POL-p1'::text, 'expired'::text, -5), ('POL-p8', 'expiring_soon', 10), ('POL-p2', 'expiring_soon', 20),
            ('POL-p5', 'expiring', 45), ('POL-p3', 'expiring', 60), ('POL-p4', 'valid', 400)$q$,
  'R13: every policy most urgent first, by the engine''s buckets; cancelled, archived and company B left out');
SELECT tests.is((SELECT (j ->> 'fleet_level')::boolean FROM r WHERE label = 'ins'), true, 'R13: the fleet-wide read with fleet reach lists fleet policies');
SELECT tests.is(pg_temp.policy('ins', 'p5') ->> 'vessel_id', NULL::text, 'R13: a fleet policy has no vessel');
SELECT tests.is(pg_temp.vessel_states('ins'), 'GAME CHANGER:ok, HYDRA:ok, M/Y DRAAK:ok', 'R13: insurance has no module setting');
SELECT tests.is(pg_temp.policy('ins', 'p2') - 'policy_id' - 'vessel_id' - 'coverage_start' - 'coverage_end',
                '{"policy_type": "Hull & Machinery", "insurer": "Insurer One", "policy_number": "POL-p2", "days_remaining": 20, "bucket": "expiring_soon", "window_days": 90, "status": "pending_renewal", "certificate_on_file": false}'::jsonb,
                'R13: type, insurer, number, the engine''s bucket and window, the live status, no certificate on file');
SELECT tests.is((pg_temp.policy('ins', 'p1') ->> 'certificate_on_file')::boolean, true, 'R13: a certificate on file');
SELECT tests.is((pg_temp.policy('ins', 'p1') ->> 'coverage_end')::date, current_date - 5, 'R13: the coverage end');
SELECT tests.ok(NOT (pg_temp.policy('ins', 'p1') ?| ARRAY['premium_amount', 'coverage_amount', 'insurer_contact', 'notes', 'certificate_url']),
                'R13: amounts, contacts, notes and file paths are never sent');
SELECT tests.results_eq(
  $q$SELECT e ->> 'policy_number', e ->> 'bucket' FROM r, jsonb_array_elements(r.j -> 'rows') WITH ORDINALITY AS x(e, n) WHERE r.label = 'ins_w30' AND e ->> 'policy_number' IN ('POL-p3', 'POL-p5', 'POL-p2') ORDER BY n$q$,
  $q$VALUES ('POL-p2'::text, 'expiring_soon'::text), ('POL-p5', 'valid'), ('POL-p3', 'valid')$q$,
  'R13: the company''s 30-day insurance window (expiry_window_rules) moves 45 and 60 days to valid');
SELECT tests.is((pg_temp.policy('ins_w30', 'p2') ->> 'window_days')::int, 30, 'R13: the window sent is the company''s');
SELECT tests.results_eq(
  $q$SELECT e ->> 'policy_number' FROM r, jsonb_array_elements(r.j -> 'rows') WITH ORDINALITY AS x(e, n) WHERE r.label = 'ins_dra' ORDER BY n$q$,
  $q$VALUES ('POL-p1'::text), ('POL-p2')$q$, 'R13: an explicit vessel list: those vessels'' policies, no fleet policy');
SELECT tests.is((SELECT (j ->> 'fleet_level')::boolean FROM r WHERE label = 'ins_dra'), false, 'R13: an explicit list is never fleet level');
SELECT tests.results_eq(
  $q$SELECT e ->> 'policy_number' FROM r, jsonb_array_elements(r.j -> 'rows') WITH ORDINALITY AS x(e, n) WHERE r.label = 'ins_ops' ORDER BY n$q$,
  $q$VALUES ('POL-p1'::text), ('POL-p2')$q$, 'R13 DRAAK reader (no fleet reach): DRAAK''s policies, the fleet policy not listed');
SELECT tests.is((SELECT (j ->> 'fleet_level')::boolean FROM r WHERE label = 'ins_ops'), false, 'R13: fleet-level insurance needs fleet reach, even on the fleet-wide read');
SELECT tests.is(pg_temp.vessel_states('ins_rep'), 'M/Y DRAAK:no_access', 'R13 reports only (no insurance rule): DRAAK no_access');
SELECT tests.is((SELECT j -> 'rows' FROM r WHERE label = 'ins_rep'), '[]'::jsonb, 'R13 reports only: no rows');
SELECT tests.is((SELECT (j ->> 'fleet_level')::boolean FROM r WHERE label = 'ins_rep'), false, 'R13 reports only: no fleet policies');
SELECT tests.is((SELECT j -> 'rows' FROM r WHERE label = 'ins_off'), '[]'::jsonb, 'R13 inactive: nothing');
SELECT tests.is((SELECT j -> 'vessels' FROM r WHERE label = 'ins_off'), '[]'::jsonb, 'R13 inactive: no vessels');
SELECT tests.results_eq(
  $q$SELECT e ->> 'policy_number' FROM r, jsonb_array_elements(r.j -> 'rows') AS e WHERE r.label = 'ins_b'$q$,
  $q$VALUES ('POL-p9'::text)$q$, 'R13 company B: its own policy only');

-- ------------------------------------------------------------ R17 audits and surveys

CREATE FUNCTION pg_temp.audit(p_label text, p_key text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT e FROM r, jsonb_array_elements(r.j -> 'rows') AS e WHERE r.label = p_label AND e ->> 'id' IN (tests.id('aud:' || p_key)::text, tests.id('cert:' || p_key)::text)
$$;
CREATE FUNCTION pg_temp.audit_keys(p_label text) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(k.key || ':' || (e ->> 'state'), ', ' ORDER BY n)
  FROM r, jsonb_array_elements(r.j -> 'rows') WITH ORDINALITY AS x(e, n),
       LATERAL (SELECT kk AS key FROM unnest(ARRAY['a1','a2','a3','a4','a5','a6','a7','a8','a9','a10','a11','c1','c2','c3','c4','c5','c6']) AS kk
                WHERE e ->> 'id' IN (tests.id('aud:' || kk)::text, tests.id('cert:' || kk)::text)) AS k
  WHERE r.label = p_label
$$;
SELECT tests.is(pg_temp.audit_keys('aud'), 'a5:overdue, a1:overdue, c3:overdue, a6:in_progress, a10:due, c4:due, a3:due, c1:due, a8:due, a7:cancelled, a2:done',
                'R17 default period (365 days back, 90 ahead): overdue oldest first, in progress, due soonest first, then done and cancelled latest first; an overdue audit from long ago listed, one done before the period, the superseded and the out-of-period surveys, GAME CHANGER''s audit (Safety off) and company B left out');
SELECT tests.is((SELECT (j ->> 'from')::date FROM r WHERE label = 'aud'), current_date - 365, 'R17 default period: from 365 days back');
SELECT tests.is((SELECT (j ->> 'to')::date FROM r WHERE label = 'aud'), current_date + 90, 'R17 default period: to 90 days ahead');
SELECT tests.is(pg_temp.audit_keys('aud_next90'), 'a5:overdue, a1:overdue, a6:in_progress, a10:due, c4:due, a3:due, c1:due, a8:due',
                'R17 next 90 days: overdue and in-progress audits whatever their date; past surveys, done and cancelled audits before the period left out');
SELECT tests.is(pg_temp.vessel_states('aud'), 'GAME CHANGER:module_off, HYDRA:ok, M/Y DRAAK:ok', 'R17: audits module_off where Safety is off');
SELECT tests.is((SELECT string_agg((e ->> 'vessel_name') || ':' || (e ->> 'surveys_state'), ', ' ORDER BY e ->> 'vessel_name')
                 FROM r, jsonb_array_elements(r.j -> 'vessels') AS e WHERE r.label = 'aud'),
                'GAME CHANGER:ok, HYDRA:ok, M/Y DRAAK:ok', 'R17: certificate surveys follow the certificates rule, not Safety');
SELECT tests.is((SELECT (j ->> 'fleet_level')::boolean FROM r WHERE label = 'aud'), true, 'R17: company audits are listed for the fleet-wide read with fleet reach');
SELECT tests.is(pg_temp.audit('aud', 'a10') ->> 'vessel_id', NULL::text, 'R17: a company audit has no vessel');
SELECT tests.is(pg_temp.audit('aud', 'a2') -> 'findings', '{"total": 3, "open": 2, "major": 1, "minor": 1, "observations": 1}'::jsonb,
                'R17: findings: total, open (not Closed), major, minor, observations');
SELECT tests.is(pg_temp.audit('aud', 'a2') - 'id' - 'vessel_id' - 'reference' - 'findings' - 'scheduled_on' - 'started_on' - 'ended_on' - 'on_date',
                '{"kind": "audit", "title": "External_Annual", "scope": "Full SMS", "status": "Completed", "state": "done", "outcome": "Satisfactory_with_Observations", "days": -98, "auditor_org": "Class society", "auditor_name": "Lead surveyor", "lead_auditor": null}'::jsonb,
                'R17: an audit''s type, scope, status, state, outcome, days and auditor');
SELECT tests.is((pg_temp.audit('aud', 'a2') ->> 'on_date')::date, current_date - 98, 'R17: an audit is dated by its actual start');
SELECT tests.is((pg_temp.audit('aud', 'a2') ->> 'ended_on')::date, current_date - 97, 'R17: its end');
SELECT tests.ok(pg_temp.audit('aud', 'a2') ->> 'reference' IS NOT NULL, 'R17: its audit number');
SELECT tests.ok(pg_temp.audit('aud', 'a3') ->> 'lead_auditor' IS NOT NULL, 'R17: an internal lead auditor is named');
SELECT tests.is(pg_temp.audit('aud', 'a1') -> 'findings', '{"total": 0, "open": 0, "major": 0, "minor": 0, "observations": 0}'::jsonb, 'R17: no findings: zeros (the audit is counted)');
SELECT tests.is(pg_temp.audit('aud', 'c3') - 'id' - 'vessel_id' - 'scheduled_on' - 'on_date',
                '{"kind": "certificate_survey", "reference": "C-c3", "title": "Load Line Certificate", "scope": "Statutory", "status": null, "state": "overdue", "outcome": null, "started_on": null, "ended_on": null, "days": -3, "auditor_org": "Class", "auditor_name": null, "lead_auditor": null, "findings": null}'::jsonb,
                'R17: a certificate survey: overdue when its date has passed, the issuing authority, no findings');
SELECT tests.is(pg_temp.audit_keys('aud_hyd'), 'c3:overdue, a8:due', 'R17: an explicit vessel list shows those vessels only, no company audit');
SELECT tests.is((SELECT (j ->> 'fleet_level')::boolean FROM r WHERE label = 'aud_hyd'), false, 'R17: an explicit list is never fleet level');
SELECT tests.is(pg_temp.audit_keys('aud_ops'), 'a5:overdue, a1:overdue, a6:in_progress, a3:due, c1:due, a7:cancelled, a2:done',
                'R17 DRAAK reader (no fleet reach): DRAAK only, no company audit');
SELECT tests.is((SELECT (j ->> 'fleet_level')::boolean FROM r WHERE label = 'aud_ops'), false, 'R17 DRAAK reader: company audits need fleet reach');
SELECT tests.is(pg_temp.vessel_states('aud_rep'), 'M/Y DRAAK:no_access', 'R17 reports only: DRAAK no_access');
SELECT tests.is((SELECT j #>> '{vessels,0,surveys_state}' FROM r WHERE label = 'aud_rep'), 'no_access', 'R17 reports only: surveys no_access');
SELECT tests.is((SELECT j -> 'rows' FROM r WHERE label = 'aud_rep'), '[]'::jsonb, 'R17 reports only: no rows');
SELECT tests.is((SELECT j -> 'rows' FROM r WHERE label = 'aud_off'), '[]'::jsonb, 'R17 inactive: nothing');
SELECT tests.is((SELECT j -> 'vessels' FROM r WHERE label = 'aud_off'), '[]'::jsonb, 'R17 inactive: no vessels');
SELECT tests.results_eq(
  $q$SELECT e ->> 'id', (e #>> '{findings,major}')::int FROM r, jsonb_array_elements(r.j -> 'rows') AS e WHERE r.label = 'aud_b' AND e ->> 'kind' = 'audit'$q$,
  format($q$VALUES (%L::text, 1)$q$, tests.id('aud:a11')), 'R17 company B: its own audit and finding only');

-- ------------------------------------------------------------ R18 work list

CREATE FUNCTION pg_temp.work(p_label text, p_vessel text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT e FROM r, jsonb_array_elements(r.j -> 'vessels') AS e WHERE r.label = p_label AND e ->> 'vessel_id' = tests.vessel_id(p_vessel)::text
$$;
SELECT tests.is(pg_temp.vessel_states('work'), 'GAME CHANGER:ok, HYDRA:module_off, M/Y DRAAK:ok', 'R18: HYDRA module_off (Technical › Jobs off)');
SELECT tests.is(pg_temp.work('work', 'A.dra') - 'vessel_id' - 'vessel_name' - 'vessel_code' - 'state',
                '{"open": 6, "overdue": 3, "pending_approval": 1, "due_30": 1, "high_priority": 2, "completed_30": 1, "statuses": {"in_progress": 1, "overdue": 3, "pending": 1, "pending_approval": 1}}'::jsonb,
                'R18 DRAAK: open, overdue (past due or status Overdue), awaiting approval, due in 30 days, high or urgent, completed in 30 days; chips that add up to the open jobs');
SELECT tests.is(pg_temp.work('work', 'A.gam') ->> 'statuses', '{"overdue": 1}', 'R18 GAME CHANGER: its chips');
SELECT tests.is(pg_temp.work('work', 'A.hyd') - 'vessel_id' - 'vessel_name' - 'vessel_code' - 'state',
                '{"open": null, "overdue": null, "pending_approval": null, "due_30": null, "high_priority": null, "completed_30": null, "statuses": null}'::jsonb,
                'R18 HYDRA (Jobs off): no numbers at all, never zeros');
SELECT tests.is((SELECT j -> 'totals' FROM r WHERE label = 'work'),
                '{"vessels_covered": 2, "open": 7, "overdue": 4, "pending_approval": 1, "due_30": 1, "high_priority": 2, "completed_30": 1}'::jsonb,
                'R18 totals over the covered vessels');
SELECT tests.results_eq(
  $q$SELECT e ->> 'task_number', (e ->> 'days_overdue')::int, e ->> 'priority', e ->> 'equipment_name'
     FROM r, jsonb_array_elements(r.j #> '{overdue,rows}') WITH ORDINALITY AS x(e, n) WHERE r.label = 'work' ORDER BY n$q$,
  $q$VALUES ('OPS-j1'::text, 10, 'High'::text, 'Main engine'::text), ('OPS-j2', 2, 'Normal', 'Main engine'), ('OPS-j10', 1, 'Normal', 'Main engine'),
            ('OPS-j3', 0, 'Urgent', 'Main engine')$q$,
  'R18 overdue jobs: most overdue first (a status Overdue job not yet due last); HYDRA''s and company B''s left out');
SELECT tests.is((SELECT (j #>> '{overdue,total}')::int FROM r WHERE label = 'work'), 4, 'R18: the overdue total');
SELECT tests.is((SELECT (j #>> '{totals,overdue}')::int FROM r WHERE label = 'work_dra'),
                (SELECT (j #>> '{tiles,technical,overdue_jobs}')::int FROM r WHERE label = 'kpis_dra'),
                'R18: DRAAK''s overdue jobs are the dashboard''s');
SELECT tests.is(pg_temp.vessel_states('work_ops'), 'M/Y DRAAK:ok', 'R18 DRAAK reader: its vessel only');
SELECT tests.is((SELECT (j #>> '{totals,open}')::int FROM r WHERE label = 'work_ops'), 6, 'R18 DRAAK reader: DRAAK''s jobs');
SELECT tests.is(pg_temp.vessel_states('work_rep'), 'M/Y DRAAK:no_access', 'R18 reports only: DRAAK no_access');
SELECT tests.is((SELECT j -> 'totals' FROM r WHERE label = 'work_rep'), 'null'::jsonb, 'R18 reports only: no totals, never zeros');
SELECT tests.is((SELECT (j #>> '{overdue,total}')::int FROM r WHERE label = 'work_rep'), 0, 'R18 reports only: no overdue jobs');
SELECT tests.is((SELECT j -> 'vessels' FROM r WHERE label = 'work_off'), '[]'::jsonb, 'R18 inactive: nothing');
SELECT tests.results_eq(
  $q$SELECT e ->> 'task_number' FROM r, jsonb_array_elements(r.j #> '{overdue,rows}') AS e WHERE r.label = 'work_b'$q$,
  $q$VALUES ('OPS-j12'::text)$q$, 'R18 company B: its own job only');

-- ------------------------------------------------------------ the scope helper

SELECT tests.results_eq(
  format($q$SELECT cardinality(vessel_ids), cardinality(drills), cardinality(drills_on), cardinality(insurance), cardinality(audits),
                   cardinality(audits_on), cardinality(certificates), cardinality(technical), cardinality(technical_on), fleet_insurance, fleet_audits
            FROM public.fleet_report_ops_scope_for(%L, %L, NULL, current_date)$q$, tests.user_id('A.fleet_manager'), tests.company_id('A')),
  $q$VALUES (3, 3, 2, 3, 3, 2, 3, 3, 2, true, true)$q$,
  'scope (fleet manager): three vessels; Safety off on one, Jobs off on another; fleet-level insurance and audits');
SELECT tests.results_eq(
  format($q$SELECT cardinality(vessel_ids), cardinality(drills_on), cardinality(insurance), cardinality(audits_on), cardinality(certificates),
                   cardinality(technical_on), fleet_insurance, fleet_audits
            FROM public.fleet_report_ops_scope_for(%L, %L, NULL, current_date)$q$, tests.user_id('A.ops_dra'), tests.company_id('A')),
  $q$VALUES (1, 1, 1, 1, 1, 1, false, false)$q$,
  'scope (DRAAK reader): DRAAK for every report, nothing fleet level (no fleet reach)');
SELECT tests.results_eq(
  format($q$SELECT cardinality(vessel_ids), cardinality(drills), cardinality(insurance), cardinality(audits), cardinality(certificates), cardinality(technical)
            FROM public.fleet_report_ops_scope_for(%L, %L, NULL, current_date)$q$, tests.user_id('A.rep_only'), tests.company_id('A')),
  $q$VALUES (1, 0, 0, 0, 0, 0)$q$, 'scope (reports only): DRAAK, no report''s own rule');
SELECT tests.results_eq(
  format($q$SELECT cardinality(vessel_ids), fleet_insurance, fleet_audits FROM public.fleet_report_ops_scope_for(%L, %L, NULL, current_date)$q$,
         tests.user_id('A.disabled'), tests.company_id('A')),
  $q$VALUES (0, false, false)$q$, 'scope (inactive): nothing');
SELECT tests.results_eq(
  format($q$SELECT cardinality(vessel_ids), fleet_insurance, fleet_audits FROM public.fleet_report_ops_scope_for(%L, %L, ARRAY[%L]::uuid[], current_date)$q$,
         tests.user_id('A.fleet_manager'), tests.company_id('A'), tests.vessel_id('A.hyd')),
  $q$VALUES (1, false, false)$q$, 'scope: an explicit list is never fleet level');
SELECT tests.results_eq(
  format($q$SELECT cardinality(vessel_ids) FROM public.fleet_report_ops_scope_for(%L, %L, NULL, current_date)$q$,
         tests.user_id('A.fleet_manager'), tests.company_id('B')),
  $q$VALUES (0)$q$, 'scope: another company: nothing');

-- ------------------------------------------------------------ grants

SELECT tests.ok(has_function_privilege('authenticated', x, 'EXECUTE') AND NOT has_function_privilege('anon', x, 'EXECUTE')
                AND NOT has_function_privilege('service_role', x, 'EXECUTE'),
                'grants: authenticated only: ' || x)
FROM unnest(ARRAY[
  'public.fleet_report_overdue_drills(uuid[], date)',
  'public.fleet_report_insurance(uuid[], date)',
  'public.fleet_report_audits(uuid[], date, date, date)',
  'public.fleet_report_work_list(uuid[], date)']) AS x;
SELECT tests.ok(NOT has_function_privilege('authenticated', x, 'EXECUTE') AND NOT has_function_privilege('anon', x, 'EXECUTE')
                AND has_function_privilege('service_role', x, 'EXECUTE'),
                'grants: service role only: ' || x)
FROM unnest(ARRAY[
  'public.fleet_report_ops_scope_for(uuid, uuid, uuid[], date)',
  'public.fleet_report_drill_interval_state(date, integer, date)',
  'public.fleet_report_audit_state(text, date, date)']) AS x;
SELECT tests.ok(p.proconfig @> ARRAY['search_path=public'] AND p.prosecdef, 'definer with search_path: ' || p.proname)
FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('fleet_report_overdue_drills', 'fleet_report_insurance', 'fleet_report_audits', 'fleet_report_work_list',
                                             'fleet_report_ops_scope_for', 'fleet_report_drill_interval_state', 'fleet_report_audit_state')
ORDER BY p.proname;
