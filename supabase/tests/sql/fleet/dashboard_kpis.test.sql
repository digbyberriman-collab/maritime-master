-- The fleet dashboard RPCs (20261124040100_fleet_dashboard_kpis.sql;
-- gap/02 D1, D3, D4, D6, D7, D9, D10, D12, D13, D15, W9; D-X5-09,
-- D-X5-21, D-X5-22): fleet_dashboard_kpis(), fleet_dashboard_panels() and
-- fleet_vessel_comparison() over two companies and four vessels of A
-- (DRAAK, HYDRA, GAME CHANGER counted; UNCOUNTED with is_counted false),
-- GAME CHANGER with Hours of Rest and Safety switched off. Proves: each
-- part count of every tile (expired items counted, muted items and
-- contracts left out, every item once, in its most urgent part); module
-- off; no_access per tile for a crew member; a foreign vessel refused
-- (42501); the uncounted vessel left out of the default list and allowed
-- explicitly; hours-of-rest checks attributed through the submission and,
-- without one, through the assignment covering the day; fleet-level items
-- only with the default list and fleet reach; an inactive caller and anon
-- get nothing; the ranked lists' order, "n of m" and HESS through a
-- stand-in view; the per-vessel comparison with NULL groups; grants.

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ world

SELECT tests.seed_vessel('A', 'A.unc', 'UNCOUNTED', 'Active', NULL, NULL, '{"is_counted": false}'::jsonb);

SELECT tests.seed_user('A', 'A.mover', 'crew');
SELECT tests.seed_assignment('A.mover', 'A.hyd', false, 'Deckhand', jsonb_build_object('join_date', current_date - 60, 'leave_date', current_date - 10));
SELECT tests.seed_assignment('A.mover', 'A.dra', true, 'Deckhand', jsonb_build_object('join_date', current_date - 9));
SELECT tests.seed_user('A', 'A.joiner', 'crew');
SELECT tests.seed_assignment('A.joiner', 'A.hyd', true, 'Engineer', jsonb_build_object('join_date', current_date + 10));
SELECT tests.seed_profile('A', 'A.pending', 'crew', 'active', NULL,
  jsonb_build_object('imported_vessel_id', tests.vessel_id('A.dra'), 'is_imported', true, 'position', 'Stewardess', 'joining_date', current_date - 3));
SELECT tests.seed_user('A', 'A.crew_gam', 'crew');
SELECT tests.seed_assignment('A.crew_gam', 'A.gam', true, 'Deckhand');
SELECT tests.seed_user('B', 'B.crew', 'crew');
SELECT tests.seed_assignment('B.crew', 'B.lev', true, 'Deckhand');

-- GAME CHANGER: Hours of Rest and Safety off (Technical stays on).
INSERT INTO public.vessel_module_settings (vessel_id, company_id, module_key, enabled) VALUES
  (tests.vessel_id('A.gam'), tests.company_id('A'), 'crew_hor', false),
  (tests.vessel_id('A.gam'), tests.company_id('A'), 'safety', false);

-- ---- documents
INSERT INTO public.certificates (id, certificate_type, certificate_number, certificate_name, issuing_authority, vessel_id, company_id, issue_date, expiry_date, next_survey_date, status) VALUES
  (tests.id('cert:dra'), 'Statutory', 'DRA-1', 'Safety Management Certificate', 'Flag', tests.vessel_id('A.dra'), tests.company_id('A'), current_date - 400, current_date - 5, current_date + 120, 'Expired'),
  (tests.id('cert:hyd'), 'Statutory', 'HYD-1', 'Load Line Certificate', 'Class', tests.vessel_id('A.hyd'), tests.company_id('A'), current_date - 400, current_date + 10, NULL, 'Valid'),
  (tests.id('cert:gam'), 'Statutory', 'GAM-1', 'Tonnage Certificate', 'Flag', tests.vessel_id('A.gam'), tests.company_id('A'), current_date - 400, current_date + 200, current_date + 30, 'Valid'),
  (tests.id('cert:unc'), 'Statutory', 'UNC-1', 'Radio Certificate', 'Flag', tests.vessel_id('A.unc'), tests.company_id('A'), current_date - 400, current_date - 3, NULL, 'Expired'),
  (tests.id('cert:lev'), 'Statutory', 'LEV-1', 'Safety Equipment Certificate', 'Flag', tests.vessel_id('B.lev'), tests.company_id('B'), current_date - 400, current_date - 2, NULL, 'Expired');
INSERT INTO public.crew_certificates (id, user_id, certificate_type, certificate_name, certificate_number, expiry_date, status) VALUES
  (tests.id('cc:stcw'), tests.user_id('A.master_dra'), 'STCW', 'STCW Basic Safety', 'BST-2', current_date + 25, 'Valid');

-- A test source on DRAAK (read area certificates): one row per counting rule.
CREATE VIEW public.expiry_src_zz_dash WITH (security_invoker = true) AS
SELECT 'zz_dash'::text AS source_key, x.item_type, x.id AS record_id, tests.company_id('A') AS company_id,
       tests.vessel_id('A.dra') AS vessel_id, NULL::uuid AS profile_id, x.label, NULL::text AS detail, NULL::uuid AS certificate_type_id,
       x.expires_on, false AS no_expiry, x.endorsement_due_on, x.muted AS alerts_muted, 'vessel'::text AS link_scope, 'crew/list'::text AS link_rel
FROM (VALUES
  (tests.id('zz:crewdoc'), 'crew_document', 'Expired crew document', current_date - 2, NULL::date, false),
  (tests.id('zz:muted'), 'crew_document', 'Muted crew document', current_date - 1, NULL::date, true),
  (tests.id('zz:qual'), 'crew_qualification', 'Expired qualification', current_date - 4, NULL::date, false),
  (tests.id('zz:endorse'), 'vessel_certificate', 'Endorsement overdue', current_date + 200, current_date - 1, false),
  (tests.id('zz:expired_endorse'), 'vessel_certificate', 'Expired and endorsement overdue', current_date - 1, current_date - 3, false),
  (tests.id('zz:contract'), 'contract', 'Expired contract', current_date - 3, NULL::date, false),
  (tests.id('zz:passport'), 'passport', 'Passport', current_date + 100, NULL::date, false)
) AS x(id, item_type, label, expires_on, endorsement_due_on, muted);
INSERT INTO public.expiry_sources (source_key, item_type, label, view_name, read_area, sort_order, is_active, owner_doc)
VALUES ('zz_dash', 'crew_document', 'Dashboard test source', 'expiry_src_zz_dash', 'certificates', 900, true, 'gap/02');

-- ---- insurance
INSERT INTO public.insurance_policies (id, company_id, vessel_id, policy_type, policy_number, insurer_name, coverage_start_date, coverage_end_date, status, lifecycle_status) VALUES
  (tests.id('ins:dra'), tests.company_id('A'), tests.vessel_id('A.dra'), 'Hull & Machinery', 'HM-1', 'Insurer One', current_date - 300, current_date + 40, 'active', 'active'),
  (tests.id('ins:fleet'), tests.company_id('A'), NULL, 'P&I', 'PI-1', 'Mutual Club', current_date - 300, current_date + 15, 'active', 'active'),
  (tests.id('ins:hyd'), tests.company_id('A'), tests.vessel_id('A.hyd'), 'Hull & Machinery', 'HM-2', 'Insurer One', current_date - 100, current_date + 200, 'active', 'active'),
  (tests.id('ins:gam'), tests.company_id('A'), tests.vessel_id('A.gam'), 'War risks', 'WR-1', 'Insurer Two', current_date - 300, current_date - 2, 'active', 'active');

-- ---- hours of rest
INSERT INTO public.work_rest_monthly_submissions (id, crew_id, vessel_id, period_year, period_month, status) VALUES
  (tests.id('sub:hyd'), tests.user_id('A.crew_hyd'), tests.vessel_id('A.hyd'), extract(year FROM current_date)::int, extract(month FROM current_date)::int, 'draft'),
  (tests.id('sub:mover'), tests.user_id('A.mover'), tests.vessel_id('A.dra'), extract(year FROM current_date)::int, extract(month FROM current_date)::int, 'draft');
INSERT INTO public.work_rest_compliance_checks (id, crew_id, submission_id, check_window, window_start, window_end, rest_minutes, work_minutes, passes, threshold_minutes)
SELECT tests.id('chk:' || x.k), tests.user_id(x.crew), CASE WHEN x.sub IS NULL THEN NULL ELSE tests.id(x.sub) END, x.win,
       ((current_date - x.d)::timestamp AT TIME ZONE 'UTC') + x.h * interval '1 hour',
       ((current_date - x.d)::timestamp AT TIME ZONE 'UTC') + (x.h + 24) * interval '1 hour',
       x.rest, 1440 - x.rest, x.passes, x.thr
FROM (VALUES
  ('c1', 'A.crew_hyd', 'sub:hyd', 'rolling_24h', 3, 10, 540, false, 600),   -- breach, HYDRA by its submission
  ('c2', 'A.crew_hyd', 'sub:hyd', 'rolling_7d', 3, 12, 4000, false, 4200),  -- the same crew-day: still one breach day
  ('c3', 'A.crew_hyd', NULL, 'rolling_24h', 5, 6, 500, false, 600),         -- breach, HYDRA by the current assignment
  ('c4', 'A.crew_hyd', NULL, 'rolling_24h', 40, 6, 500, false, 600),        -- outside the 30 days
  ('c5', 'A.crew_hyd', 'sub:hyd', 'rolling_24h', 1, 6, 650, true, 600),     -- near the threshold
  ('c6', 'A.crew_hyd', 'sub:hyd', 'rolling_24h', 2, 6, 800, true, 600),     -- comfortably rested
  ('c7', 'A.mover', NULL, 'rolling_24h', 15, 6, 480, false, 600),           -- breach, HYDRA by the ended assignment covering that day
  ('c8', 'A.mover', 'sub:mover', 'rolling_24h', 2, 6, 500, false, 600),     -- breach, DRAAK by its submission
  ('c9', 'A.mover', 'sub:mover', 'rolling_24h', 2, 12, 640, true, 600),     -- near, but on a breach day
  ('c10', 'A.crew_gam', NULL, 'rolling_24h', 1, 6, 500, false, 600),        -- GAME CHANGER: Hours of Rest off
  ('c11', 'B.crew', NULL, 'rolling_24h', 1, 6, 500, false, 600)             -- company B
) AS x(k, crew, sub, win, d, h, rest, passes, thr);
INSERT INTO public.work_rest_records (id, crew_id, vessel_id, record_date, total_work_minutes, total_rest_minutes) VALUES
  (tests.id('wrr:hyd'), tests.user_id('A.crew_hyd'), tests.vessel_id('A.hyd'), current_date - 2, 600, 840),
  (tests.id('wrr:mover'), tests.user_id('A.mover'), tests.vessel_id('A.dra'), current_date - 1, 600, 840),
  (tests.id('wrr:master_old'), tests.user_id('A.master_dra'), tests.vessel_id('A.dra'), current_date - 8, 600, 840);

-- ---- safety
INSERT INTO public.incidents (id, vessel_id, company_id, reported_by, incident_number, incident_date, incident_type, location, description, severity_actual, severity_potential) VALUES
  (tests.id('inc:dra'), tests.vessel_id('A.dra'), tests.company_id('A'), tests.user_id('A.master_dra'), 'INC-DRA-1', now() - interval '20 days', 'Near Miss', 'Deck', 'Test incident', 1, 2),
  (tests.id('inc:gam'), tests.vessel_id('A.gam'), tests.company_id('A'), tests.user_id('A.master_dra'), 'INC-GAM-1', now() - interval '20 days', 'Near Miss', 'Deck', 'Test incident', 1, 2),
  (tests.id('inc:lev'), tests.vessel_id('B.lev'), tests.company_id('B'), tests.user_id('B.admin'), 'INC-LEV-1', now() - interval '20 days', 'Near Miss', 'Deck', 'Test incident', 1, 2);
INSERT INTO public.audits (id, audit_type, audit_scope, vessel_id, company_id, scheduled_date, status) VALUES
  (tests.id('aud:hyd'), 'Internal ISM audit', 'Vessel', tests.vessel_id('A.hyd'), tests.company_id('A'), current_date + 20, 'Planned'),
  (tests.id('aud:company'), 'Company DOC audit', 'Office', NULL, tests.company_id('A'), current_date + 40, 'Scheduled'),
  (tests.id('aud:old'), 'Flag inspection', 'Vessel', tests.vessel_id('A.dra'), tests.company_id('A'), current_date - 10, 'Planned'),
  (tests.id('aud:done'), 'Class survey', 'Vessel', tests.vessel_id('A.dra'), tests.company_id('A'), current_date - 5, 'Completed'),
  (tests.id('aud:gam'), 'Internal ISM audit', 'Vessel', tests.vessel_id('A.gam'), tests.company_id('A'), current_date + 10, 'Planned'),
  (tests.id('aud:far'), 'Internal ISM audit', 'Vessel', tests.vessel_id('A.hyd'), tests.company_id('A'), current_date + 120, 'Planned');
INSERT INTO public.audit_findings (id, audit_id, finding_type, ism_section, requirement_text, finding_description, objective_evidence) VALUES
  (tests.id('af:hyd'), tests.id('aud:hyd'), 'Observation', 10, 'Maintenance', 'Finding', 'Evidence'),
  (tests.id('af:company'), tests.id('aud:company'), 'Non-conformity', 3, 'Responsibilities', 'Finding', 'Evidence');
INSERT INTO public.corrective_actions (id, incident_id, finding_id, company_id, action_number, description, action_type, assigned_to, assigned_by, due_date, status)
SELECT tests.id('ca:' || x.k), CASE WHEN x.inc IS NULL THEN NULL ELSE tests.id(x.inc) END, CASE WHEN x.af IS NULL THEN NULL ELSE tests.id(x.af) END,
       tests.company_id(x.co), 'CA-' || x.k, 'Corrective action ' || x.k, 'Corrective', tests.user_id(x.who), tests.user_id(x.who), current_date + x.due, x.status
FROM (VALUES
  ('1', 'inc:dra', NULL, 'A', 'A.master_dra', -3, 'Open'),            -- DRAAK, overdue
  ('2', NULL, 'af:hyd', 'A', 'A.master_dra', 5, 'In Progress'),       -- HYDRA through the audit, not overdue
  ('3', 'inc:dra', NULL, 'A', 'A.master_dra', -10, 'Closed'),         -- closed
  ('4', NULL, NULL, 'A', 'A.master_dra', -1, 'Open'),                 -- fleet-level, overdue
  ('5', 'inc:lev', NULL, 'B', 'B.admin', -1, 'Open'),                 -- company B
  ('6', NULL, 'af:company', 'A', 'A.master_dra', 3, 'Verification'),  -- fleet-level (company audit)
  ('7', 'inc:gam', NULL, 'A', 'A.master_dra', -1, 'Open')             -- GAME CHANGER: Safety off
) AS x(k, inc, af, co, who, due, status);
INSERT INTO public.drill_types (id, drill_name, category, minimum_frequency) VALUES (tests.id('dt:fire'), 'Fire drill', 'Fire', 30);
INSERT INTO public.drills (id, vessel_id, drill_type_id, drill_date_scheduled, drill_date_actual, scenario_description, status)
SELECT tests.id('dr:' || x.k), tests.vessel_id(x.v), tests.id('dt:fire'), current_date + x.d,
       CASE WHEN x.actual IS NULL THEN NULL ELSE now() + x.actual * interval '1 day' END, 'Scenario', x.status
FROM (VALUES
  ('1', 'A.dra', -2, NULL::int, 'Scheduled'),   -- overdue
  ('2', 'A.hyd', 3, NULL, 'Scheduled'),         -- not due yet
  ('3', 'A.dra', -6, -5, 'Completed'),          -- done
  ('4', 'A.dra', -4, -1, 'Scheduled'),          -- carried out, status not updated
  ('5', 'A.gam', -5, NULL, 'Scheduled'),        -- GAME CHANGER: Safety off
  ('6', 'B.lev', -1, NULL, 'Scheduled')         -- company B
) AS x(k, v, d, actual, status);

-- ---- technical
INSERT INTO public.equipment_categories (id, category_name) VALUES (tests.id('eqc:main'), 'Machinery');
INSERT INTO public.equipment (id, vessel_id, category_id, equipment_name, equipment_code)
SELECT tests.id('eq:' || v), tests.vessel_id(v), tests.id('eqc:main'), 'Main engine', 'ME-' || v FROM unnest(ARRAY['A.dra', 'A.hyd', 'A.gam']) AS v;
INSERT INTO public.maintenance_tasks (id, task_number, equipment_id, task_name, task_type, due_date, status)
SELECT tests.id('mt:' || x.k), 'T-' || x.k, tests.id('eq:' || x.v), 'Job ' || x.k, 'Planned', current_date + x.d, x.status
FROM (VALUES
  ('1', 'A.dra', -1, 'Pending'),            -- overdue
  ('2', 'A.dra', -10, 'Completed'),         -- closed
  ('3', 'A.hyd', -2, 'Pending_Approval'),   -- pending approval (not overdue)
  ('4', 'A.hyd', 10, 'Scheduled'),          -- open
  ('5', 'A.hyd', -3, 'Cancelled'),          -- closed
  ('6', 'A.gam', -1, 'In_Progress'),        -- overdue (Technical on)
  ('7', 'A.dra', 5, 'Overdue')              -- overdue by status
) AS x(k, v, d, status);

-- ------------------------------------------------------------ pure definitions

SELECT tests.is(public.fleet_dashboard_job_state('Pending', current_date - 1, current_date), 'overdue', 'job state: open and due before today is overdue');
SELECT tests.is(public.fleet_dashboard_job_state('In Progress', current_date, current_date), 'open', 'job state: due today is still open');
SELECT tests.is(public.fleet_dashboard_job_state('in-progress', NULL, current_date), 'open', 'job state: no due date is open');
SELECT tests.is(public.fleet_dashboard_job_state('Completed', current_date - 5, current_date), 'closed', 'job state: completed is closed');
SELECT tests.is(public.fleet_dashboard_job_state(' cancelled ', current_date - 5, current_date), 'closed', 'job state: cancelled (any case, spaces) is closed');
SELECT tests.is(public.fleet_dashboard_job_state('Pending approval', current_date - 5, current_date), 'pending_approval', 'job state: pending approval, even past due');
SELECT tests.is(public.fleet_dashboard_job_state('Overdue', current_date + 5, current_date), 'overdue', 'job state: the Overdue status counts');
SELECT tests.ok(public.fleet_dashboard_drill_overdue('Scheduled', NULL, current_date - 1, current_date), 'drill: scheduled before today and not carried out is overdue');
SELECT tests.ok(NOT public.fleet_dashboard_drill_overdue('Scheduled', NULL, current_date, current_date), 'drill: scheduled today is not overdue');
SELECT tests.ok(NOT public.fleet_dashboard_drill_overdue('Scheduled', now(), current_date - 3, current_date), 'drill: carried out is not overdue');
SELECT tests.ok(NOT public.fleet_dashboard_drill_overdue('Completed', NULL, current_date - 3, current_date), 'drill: completed is not overdue');
SELECT tests.ok(NOT public.fleet_dashboard_drill_overdue(NULL, NULL, current_date - 3, current_date), 'drill: no status is not overdue');

SELECT tests.results_eq(
  format($q$SELECT id, vessel_id, source FROM public.fleet_dashboard_open_corrective_actions(%L)$q$, tests.company_id('A')),
  format($q$VALUES (%L::uuid, %L::uuid, 'incident'::text), (%L, %L, 'audit_finding'), (%L, NULL, 'none'), (%L, NULL, 'audit_finding'), (%L, %L, 'incident')$q$,
         tests.id('ca:1'), tests.vessel_id('A.dra'), tests.id('ca:2'), tests.vessel_id('A.hyd'), tests.id('ca:4'), tests.id('ca:6'),
         tests.id('ca:7'), tests.vessel_id('A.gam')),
  'open corrective actions: vessel through the incident, else the audit; company audits and actions with neither are fleet-level; closed and B''s left out');

-- The sections below test the legacy hours-of-rest rule (a failing check
-- is a breach crew-day): X1's breach review columns are hidden for them
-- (rolled back with the file) and shown again for the D-380 section at the
-- end, where breach days come from X1's breach review as in the R9 report.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'work_rest_non_conformities' AND column_name = 'review_outcome') THEN
    ALTER TABLE public.work_rest_non_conformities RENAME COLUMN review_outcome TO review_outcome_x380hidden;
  END IF;
END
$$;
SELECT tests.results_eq(
  format($q$SELECT vessel_id, crew_id, on_day, breach, near FROM public.fleet_dashboard_hor_crew_days(%L, ARRAY[%L, %L, %L]::uuid[], current_date - 29, current_date)$q$,
         tests.company_id('A'), tests.vessel_id('A.dra'), tests.vessel_id('A.hyd'), tests.vessel_id('A.gam')),
  format($q$VALUES (%L::uuid, %L::uuid, current_date - 3, true, false), (%L, %L, current_date - 5, true, false),
                   (%L, %L, current_date - 1, false, true), (%L, %L, current_date - 2, false, false),
                   (%L, %L, current_date - 15, true, false), (%L, %L, current_date - 2, true, true),
                   (%L, %L, current_date - 1, true, false)$q$,
         tests.vessel_id('A.hyd'), tests.user_id('A.crew_hyd'), tests.vessel_id('A.hyd'), tests.user_id('A.crew_hyd'),
         tests.vessel_id('A.hyd'), tests.user_id('A.crew_hyd'), tests.vessel_id('A.hyd'), tests.user_id('A.crew_hyd'),
         tests.vessel_id('A.hyd'), tests.user_id('A.mover'), tests.vessel_id('A.dra'), tests.user_id('A.mover'),
         tests.vessel_id('A.gam'), tests.user_id('A.crew_gam')),
  'hours of rest crew-days: one row per crew-day; the submission''s vessel, else the assignment covering the day (the mover''s old HYDRA day); 40 days ago and B''s crew left out');

-- ------------------------------------------------------------ the fleet manager

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
CREATE TEMP TABLE fm ON COMMIT DROP AS
SELECT public.fleet_dashboard_kpis() AS d,
       public.fleet_dashboard_kpis(ARRAY[tests.vessel_id('A.unc')]) AS unc,
       public.fleet_dashboard_kpis(ARRAY[tests.vessel_id('A.gam')]) AS gam,
       public.fleet_dashboard_kpis(ARRAY[tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')]) AS dh,
       public.fleet_dashboard_panels(p_limit => 1) AS p,
       public.fleet_dashboard_panels() AS p5;
CREATE TEMP TABLE fm_cmp ON COMMIT DROP AS SELECT * FROM public.fleet_vessel_comparison();
SELECT tests.throws_like(format($q$SELECT public.fleet_dashboard_kpis(ARRAY[%L]::uuid[])$q$, tests.vessel_id('B.lev')),
                         '42501', 'vessel_out_of_reach', 'kpis: a foreign vessel is refused (42501)');
SELECT tests.throws_like(format($q$SELECT public.fleet_dashboard_panels(ARRAY[%L]::uuid[])$q$, tests.vessel_id('B.lev')),
                         '42501', 'vessel_out_of_reach', 'panels: a foreign vessel is refused (42501)');
SELECT tests.throws_like(format($q$SELECT * FROM public.fleet_vessel_comparison(ARRAY[%L]::uuid[])$q$, tests.vessel_id('B.lev')),
                         '42501', 'vessel_out_of_reach', 'comparison: a foreign vessel is refused (42501)');
SELECT tests.throws_like('SELECT public.fleet_dashboard_panels(p_limit => 0)', '22023', 'invalid_limit', 'panels: p_limit 0 is refused');
SELECT tests.throws_like('SELECT public.fleet_dashboard_panels(p_limit => 21)', '22023', 'invalid_limit', 'panels: p_limit 21 is refused');
SELECT tests.reset_role();
GRANT SELECT ON fm, fm_cmp TO PUBLIC;

-- KPI row, default (every counted vessel + fleet-level items).
SELECT tests.is((SELECT (d ->> 'vessels')::int FROM fm), 3, 'kpis: the three counted vessels; the uncounted one is left out of the default list');
SELECT tests.is((SELECT d #>> '{tiles,documents,state}' FROM fm), 'ok', 'documents: ok');
SELECT tests.is((SELECT (d #>> '{tiles,documents,parts,expired_vessel_certificates}')::int FROM fm), 2,
                'documents: expired vessel certificates (the register''s and the expired one with an overdue endorsement, counted once)');
SELECT tests.is((SELECT (d #>> '{tiles,documents,parts,expired_crew_documents}')::int FROM fm), 1, 'documents: expired crew documents (the muted one left out)');
SELECT tests.is((SELECT (d #>> '{tiles,documents,parts,expired_crew_qualifications}')::int FROM fm), 1, 'documents: expired crew qualifications');
SELECT tests.is((SELECT (d #>> '{tiles,documents,parts,endorsements_overdue}')::int FROM fm), 1, 'documents: endorsements overdue (of items not expired)');
SELECT tests.is((SELECT (d #>> '{tiles,documents,parts,expiring}')::int FROM fm), 3,
                'documents: expiring = HYDRA''s certificate, the master''s STCW and the passport inside its 270-day window');
SELECT tests.is((SELECT (d #>> '{tiles,documents,value}')::int FROM fm), 8, 'documents: the value is the sum of the parts; contracts and insurance never count');

SELECT tests.is((SELECT d #>> '{tiles,hours_of_rest,state}' FROM fm), 'ok', 'hours of rest: ok');
SELECT tests.is((SELECT (d #>> '{tiles,hours_of_rest,breach_days}')::int FROM fm), 4,
                'hours of rest: breach crew-days in 30 days (HYDRA 3 incl. the mover''s day there, DRAAK 1); GAME CHANGER (off) and B left out');
SELECT tests.is((SELECT (d #>> '{tiles,hours_of_rest,value}')::int FROM fm), 4, 'hours of rest: the value is the breach days');
SELECT tests.is((SELECT (d #>> '{tiles,hours_of_rest,near_threshold}')::int FROM fm), 1, 'hours of rest: near threshold (not on a breach day)');
SELECT tests.is((SELECT (d #>> '{tiles,hours_of_rest,crew_without_entries}')::int FROM fm), 1,
                'hours of rest: crew with no entries in 7 days = the master (not the planned joiner, the login-less placement or crew with entries)');
SELECT tests.is((SELECT (d #>> '{tiles,hours_of_rest,vessels_logging}')::int FROM fm), 2, 'hours of rest: two vessels logging');
SELECT tests.is((SELECT (d #>> '{tiles,hours_of_rest,vessels_off}')::int FROM fm), 1, 'hours of rest: one vessel with Hours of Rest off');

SELECT tests.is((SELECT d #>> '{tiles,safety,state}' FROM fm), 'ok', 'safety: ok');
SELECT tests.is((SELECT (d #>> '{tiles,safety,open_corrective_actions}')::int FROM fm), 4,
                'safety: open corrective actions (DRAAK, HYDRA, two fleet-level); closed, B''s and GAME CHANGER''s (off) left out');
SELECT tests.is((SELECT (d #>> '{tiles,safety,overdue_corrective_actions}')::int FROM fm), 2, 'safety: overdue corrective actions');
SELECT tests.is((SELECT (d #>> '{tiles,safety,overdue_drills}')::int FROM fm), 1, 'safety: overdue drills (scheduled, not carried out, before today)');
SELECT tests.is((SELECT (d #>> '{tiles,safety,value}')::int FROM fm), 5, 'safety: the value is open corrective actions + overdue drills');

SELECT tests.is((SELECT d #>> '{tiles,technical,state}' FROM fm), 'ok', 'technical: ok');
SELECT tests.is((SELECT (d #>> '{tiles,technical,overdue_jobs}')::int FROM fm), 3, 'technical: overdue jobs (by due date, and by status)');
SELECT tests.is((SELECT (d #>> '{tiles,technical,pending_approval}')::int FROM fm), 1, 'technical: pending approval');
SELECT tests.is((SELECT (d #>> '{tiles,technical,open_jobs}')::int FROM fm), 5, 'technical: open jobs');
SELECT tests.is((SELECT (d #>> '{tiles,technical,value}')::int FROM fm), 4, 'technical: the value is overdue + pending approval');
SELECT tests.is((SELECT d #>> '{tiles,leave,state}' FROM fm), 'not_enabled', 'leave: not enabled (D5 open)');
SELECT tests.is((SELECT d #>> '{tiles,finance,state}' FROM fm), 'hidden', 'finance: hidden (G1)');

-- Explicit lists.
SELECT tests.is((SELECT (unc ->> 'vessels')::int FROM fm), 1, 'kpis: an explicit uncounted vessel is allowed (D-X5-22)');
SELECT tests.is((SELECT (unc #>> '{tiles,documents,parts,expired_vessel_certificates}')::int FROM fm), 1, 'kpis: the uncounted vessel''s own expired certificate');
SELECT tests.is((SELECT gam #>> '{tiles,hours_of_rest,state}' FROM fm), 'module_off', 'kpis (GAME CHANGER): Hours of Rest is off');
SELECT tests.is((SELECT gam #>> '{tiles,safety,state}' FROM fm), 'module_off', 'kpis (GAME CHANGER): Safety is off');
SELECT tests.is((SELECT gam #>> '{tiles,technical,state}' FROM fm), 'ok', 'kpis (GAME CHANGER): Technical is on');
SELECT tests.is((SELECT (gam #>> '{tiles,documents,value}')::int FROM fm), 0, 'kpis (GAME CHANGER): a real zero for documents');
SELECT tests.is((SELECT (dh #>> '{tiles,safety,open_corrective_actions}')::int FROM fm), 2, 'kpis (DRAAK, HYDRA): no fleet-level actions with an explicit list');
SELECT tests.is((SELECT (dh #>> '{tiles,safety,overdue_corrective_actions}')::int FROM fm), 1, 'kpis (DRAAK, HYDRA): one overdue');
SELECT tests.is((SELECT (dh #>> '{tiles,hours_of_rest,breach_days}')::int FROM fm), 4, 'kpis (DRAAK, HYDRA): the same breach days');

-- Panels.
SELECT tests.is((SELECT p #>> '{expiry,state}' FROM fm), 'ok', 'panels: expiry ok');
SELECT tests.is((SELECT (p #>> '{expiry,groups,vessel_certificates,total}')::int FROM fm), 4,
                'panels: vessel certificate alerts (two expired, one endorsement overdue, one expiring)');
SELECT tests.is((SELECT jsonb_array_length(p #> '{expiry,groups,vessel_certificates,items}') FROM fm), 1, 'panels: p_limit 1 item ("1 of 4")');
SELECT tests.is((SELECT p #>> '{expiry,groups,vessel_certificates,items,0,record_id}' FROM fm), tests.id('cert:dra')::text, 'panels: the most overdue first');
SELECT tests.is((SELECT (p5 #>> '{expiry,groups,vessel_certificates,items,2,record_id}') FROM fm), tests.id('zz:endorse')::text,
                'panels: an overdue endorsement ranks after the expired items and before the expiring ones');
SELECT tests.is((SELECT (p #>> '{expiry,groups,crew_documents,total}')::int FROM fm), 2, 'panels: crew document alerts (the muted one and the contract left out)');
SELECT tests.is((SELECT (p #>> '{expiry,groups,crew_qualifications,total}')::int FROM fm), 2, 'panels: crew qualification alerts');
SELECT tests.is((SELECT p #>> '{corrective_actions,state}' FROM fm), 'ok', 'panels: corrective actions ok');
SELECT tests.is((SELECT (p #>> '{corrective_actions,total}')::int FROM fm), 4, 'panels: four open corrective actions');
SELECT tests.is((SELECT (p #>> '{corrective_actions,overdue}')::int FROM fm), 2, 'panels: two overdue');
SELECT tests.is((SELECT p #>> '{corrective_actions,items,0,id}' FROM fm), tests.id('ca:1')::text, 'panels: the action due first');
SELECT tests.is((SELECT (p #>> '{corrective_actions,items,0,days_overdue}')::int FROM fm), 3, 'panels: days overdue');
SELECT tests.is((SELECT (p #>> '{overdue_drills,total}')::int FROM fm), 1, 'panels: one overdue drill');
SELECT tests.is((SELECT p #>> '{overdue_drills,items,0,drill_type}' FROM fm), 'Fire drill', 'panels: the drill type');
SELECT tests.is((SELECT (p #>> '{overdue_drills,items,0,days_overdue}')::int FROM fm), 2, 'panels: the drill is two days overdue');
SELECT tests.is((SELECT p #>> '{hess,state}' FROM fm), 'not_tracked', 'panels: HESS not tracked while X2''s safety_hess_status is missing');
SELECT tests.is((SELECT (p5 #>> '{insurance,total}')::int FROM fm), 3,
                'panels: insurance expired or expiring within 90 days (GAME CHANGER, the fleet P&I, DRAAK); HYDRA''s 200 days left out');
SELECT tests.is((SELECT p5 #>> '{insurance,items,0,record_id}' FROM fm), tests.id('ins:gam')::text, 'panels: the expired policy first');
SELECT tests.is((SELECT p5 #>> '{insurance,items,1,record_id}' FROM fm), tests.id('ins:fleet')::text, 'panels: the fleet policy (default list, fleet reach)');
SELECT tests.is((SELECT (p5 #>> '{surveys,total}')::int FROM fm), 4,
                'panels: audits and surveys (the overdue open audit, HYDRA''s audit, GAME CHANGER''s certificate survey, the company audit); done, far and GAME CHANGER''s audit (Safety off) left out');
SELECT tests.is((SELECT p5 #>> '{surveys,items,0,id}' FROM fm), tests.id('aud:old')::text, 'panels: the overdue audit first');
SELECT tests.is((SELECT p5 #>> '{surveys,items,2,kind}' FROM fm), 'certificate_survey', 'panels: the certificate survey in date order');
SELECT tests.is((SELECT jsonb_array_length(p #> '{work_list,vessels}') FROM fm), 3, 'panels: the work list has every vessel with Technical on');
SELECT tests.is((SELECT p #>> '{work_list,vessels,0,vessel_id}' FROM fm), tests.vessel_id('A.dra')::text, 'panels: the work list puts the most overdue first');
SELECT tests.is((SELECT (p #>> '{work_list,vessels,0,overdue}')::int FROM fm), 2, 'panels: DRAAK has two overdue jobs');
SELECT tests.is((SELECT (p #>> '{work_list,vessels,2,pending_approval}')::int FROM fm), 1, 'panels: HYDRA has one job pending approval');

-- Comparison.
SELECT tests.results_eq(
  'SELECT vessel_id FROM fm_cmp',
  format($q$VALUES (%L::uuid), (%L::uuid), (%L::uuid)$q$, tests.vessel_id('A.dra'), tests.vessel_id('A.hyd'), tests.vessel_id('A.gam')),
  'comparison: one row per counted vessel; no fleet-level row');
SELECT tests.is((SELECT (documents ->> 'value')::int FROM fm_cmp WHERE vessel_id = tests.vessel_id('A.dra')), 7, 'comparison: DRAAK document alerts');
SELECT tests.is((SELECT (documents ->> 'expired')::int FROM fm_cmp WHERE vessel_id = tests.vessel_id('A.dra')), 4, 'comparison: DRAAK expired items');
SELECT tests.ok((SELECT hours_of_rest IS NULL AND safety IS NULL FROM fm_cmp WHERE vessel_id = tests.vessel_id('A.gam')),
                'comparison: GAME CHANGER''s Hours of Rest and Safety are NULL (off), never zeros');
SELECT tests.is((SELECT (technical ->> 'overdue_jobs')::int FROM fm_cmp WHERE vessel_id = tests.vessel_id('A.gam')), 1, 'comparison: GAME CHANGER technical');
SELECT tests.is((SELECT (insurance ->> 'expired')::int FROM fm_cmp WHERE vessel_id = tests.vessel_id('A.gam')), 1, 'comparison: GAME CHANGER expired insurance');
SELECT tests.is((SELECT (hours_of_rest ->> 'breach_days')::int FROM fm_cmp WHERE vessel_id = tests.vessel_id('A.hyd')), 3, 'comparison: HYDRA breach days');
SELECT tests.is((SELECT (safety ->> 'open_corrective_actions')::int FROM fm_cmp WHERE vessel_id = tests.vessel_id('A.hyd')), 1, 'comparison: HYDRA open actions');

-- HESS through X2's view (a stand-in with the agreed columns), then a view without them.
CREATE VIEW public.safety_hess_status AS
SELECT x.vessel_id, x.next_due_on
FROM (VALUES (tests.vessel_id('A.dra'), current_date + 5), (tests.vessel_id('A.hyd'), current_date + 30), (tests.vessel_id('A.gam'), current_date - 1)) AS x(vessel_id, next_due_on);
GRANT SELECT ON public.safety_hess_status TO PUBLIC;
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
CREATE TEMP TABLE hess_ok ON COMMIT DROP AS SELECT public.fleet_dashboard_panels() AS p;
SELECT tests.reset_role();
DROP VIEW public.safety_hess_status;
CREATE VIEW public.safety_hess_status AS SELECT tests.vessel_id('A.dra') AS vessel_id, 'soon'::text AS due_text;
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
CREATE TEMP TABLE hess_bad ON COMMIT DROP AS SELECT public.fleet_dashboard_panels() AS p;
SELECT tests.reset_role();
DROP VIEW public.safety_hess_status;
GRANT SELECT ON hess_ok, hess_bad TO PUBLIC;
SELECT tests.is((SELECT p #>> '{hess,state}' FROM hess_ok), 'ok', 'panels: HESS tracked once safety_hess_status exists');
SELECT tests.is((SELECT (p #>> '{hess,total}')::int FROM hess_ok), 1, 'panels: HESS due within 14 days on DRAAK; HYDRA later; GAME CHANGER (Safety off) left out');
SELECT tests.is((SELECT p #>> '{hess,items,0,vessel_id}' FROM hess_ok), tests.vessel_id('A.dra')::text, 'panels: HESS item on DRAAK');
SELECT tests.is((SELECT p #>> '{hess,state}' FROM hess_bad), 'not_tracked', 'panels: a safety_hess_status without the agreed columns reads as not tracked');

-- ------------------------------------------------------------ other callers

-- The DRAAK master: their vessel only, no fleet-level items.
SELECT tests.as_user(tests.user_id('A.master_dra'));
CREATE TEMP TABLE ms ON COMMIT DROP AS SELECT public.fleet_dashboard_kpis() AS d, public.fleet_dashboard_panels() AS p;
CREATE TEMP TABLE ms_cmp ON COMMIT DROP AS SELECT * FROM public.fleet_vessel_comparison();
SELECT tests.throws_like(format($q$SELECT public.fleet_dashboard_kpis(ARRAY[%L]::uuid[])$q$, tests.vessel_id('A.hyd')),
                         '42501', 'vessel_out_of_reach', 'master: a vessel they do not reach is refused');
-- The HYDRA deckhand: the dashboard opens, no tile's data.
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
CREATE TEMP TABLE cr ON COMMIT DROP AS SELECT public.fleet_dashboard_kpis() AS d, public.fleet_dashboard_panels() AS p;
CREATE TEMP TABLE cr_cmp ON COMMIT DROP AS SELECT * FROM public.fleet_vessel_comparison();
-- Inactive.
SELECT tests.as_user(tests.user_id('A.disabled'));
CREATE TEMP TABLE off ON COMMIT DROP AS SELECT public.fleet_dashboard_kpis() AS d, public.fleet_dashboard_panels() AS p;
SELECT tests.is_empty('SELECT * FROM public.fleet_vessel_comparison()', 'inactive: no comparison row');
-- Company B.
SELECT tests.as_user(tests.user_id('B.admin'));
CREATE TEMP TABLE bb ON COMMIT DROP AS SELECT public.fleet_dashboard_kpis() AS d;
-- anon.
SELECT tests.as_anon();
SELECT tests.throws('SELECT public.fleet_dashboard_kpis()', '42501', 'anon cannot execute fleet_dashboard_kpis');
SELECT tests.throws('SELECT public.fleet_dashboard_panels()', '42501', 'anon cannot execute fleet_dashboard_panels');
SELECT tests.throws('SELECT * FROM public.fleet_vessel_comparison()', '42501', 'anon cannot execute fleet_vessel_comparison');
SELECT tests.reset_role();
GRANT SELECT ON ms, ms_cmp, cr, cr_cmp, off, bb TO PUBLIC;

SELECT tests.is((SELECT (d ->> 'vessels')::int FROM ms), 1, 'master: DRAAK only');
SELECT tests.is((SELECT (d #>> '{tiles,documents,value}')::int FROM ms), 7, 'master: DRAAK''s document alerts');
SELECT tests.is((SELECT (d #>> '{tiles,hours_of_rest,breach_days}')::int FROM ms), 1, 'master: DRAAK''s breach day');
SELECT tests.is((SELECT (d #>> '{tiles,hours_of_rest,crew_without_entries}')::int FROM ms), 1, 'master: themselves with no entries');
SELECT tests.is((SELECT (d #>> '{tiles,safety,open_corrective_actions}')::int FROM ms), 1, 'master: DRAAK''s action, no fleet-level ones (no fleet reach)');
SELECT tests.is((SELECT (d #>> '{tiles,safety,value}')::int FROM ms), 2, 'master: safety = one action + one overdue drill');
SELECT tests.is((SELECT (d #>> '{tiles,technical,overdue_jobs}')::int FROM ms), 2, 'master: DRAAK''s overdue jobs');
SELECT tests.is((SELECT p #>> '{insurance,state}' FROM ms), 'no_access', 'master panels: no insurance read (fleet_ops_can insurance), so no_access, never an empty list');
SELECT tests.is((SELECT (p #>> '{surveys,total}')::int FROM ms), 1, 'master panels: DRAAK''s overdue audit only, not the company audit');
SELECT tests.is((SELECT count(*) FROM ms_cmp), 1::bigint, 'master: one comparison row');

SELECT tests.is((SELECT (d ->> 'vessels')::int FROM cr), 1, 'crew: the dashboard covers HYDRA');
SELECT tests.results_eq(
  $q$SELECT key, value ->> 'state' FROM cr, jsonb_each(d -> 'tiles')$q$,
  $q$VALUES ('documents'::text, 'no_access'::text), ('hours_of_rest', 'no_access'), ('safety', 'no_access'), ('technical', 'no_access'),
            ('leave', 'not_enabled'), ('finance', 'hidden')$q$,
  'crew: every data tile is no_access (no read rule passes), never zeros');
SELECT tests.ok((SELECT d #> '{tiles,documents,value}' IS NULL FROM cr), 'crew: no documents value at all');
SELECT tests.results_eq(
  $q$SELECT key, value ->> 'state' FROM cr, jsonb_each(p) WHERE key NOT IN ('vessels', 'today')$q$,
  $q$VALUES ('expiry'::text, 'no_access'::text), ('corrective_actions', 'no_access'), ('overdue_drills', 'no_access'), ('hess', 'no_access'),
            ('insurance', 'no_access'), ('surveys', 'no_access'), ('work_list', 'no_access')$q$,
  'crew: every panel is no_access');
SELECT tests.ok((SELECT documents IS NULL AND safety IS NULL AND technical IS NULL AND insurance IS NULL AND hours_of_rest IS NULL FROM cr_cmp),
                'crew: the comparison row has every group NULL');

SELECT tests.is((SELECT (d ->> 'vessels')::int FROM off), 0, 'inactive: no vessel');
SELECT tests.results_eq(
  $q$SELECT key, value ->> 'state' FROM off, jsonb_each(d -> 'tiles') WHERE key NOT IN ('leave', 'finance')$q$,
  $q$VALUES ('documents'::text, 'no_access'::text), ('hours_of_rest', 'no_access'), ('safety', 'no_access'), ('technical', 'no_access')$q$,
  'inactive: every tile no_access');
SELECT tests.is((SELECT p #>> '{expiry,state}' FROM off), 'no_access', 'inactive: panels no_access');

SELECT tests.is((SELECT (d ->> 'vessels')::int FROM bb), 1, 'company B: LEVIATHAN only');
SELECT tests.is((SELECT (d #>> '{tiles,safety,overdue_drills}')::int FROM bb), 1, 'company B: its own overdue drill');
SELECT tests.is((SELECT (d #>> '{tiles,safety,open_corrective_actions}')::int FROM bb), 1, 'company B: its own corrective action');
SELECT tests.is((SELECT (d #>> '{tiles,documents,parts,expired_vessel_certificates}')::int FROM bb), 1, 'company B: its own expired certificate, none of A''s');
SELECT tests.is((SELECT (d #>> '{tiles,hours_of_rest,breach_days}')::int FROM bb), 1, 'company B: its own breach day');

-- ------------------------------------------------------------ gates

SELECT tests.ok(NOT public.fleet_dashboard_tile_can_for(tests.user_id('A.crew_hyd'), tests.company_id('A'), tests.vessel_id('A.hyd'), 'technical'),
                'gate: a deckhand has no technical read');
SELECT tests.ok(public.fleet_dashboard_tile_can_for(tests.user_id('A.master_dra'), tests.company_id('A'), tests.vessel_id('A.dra'), 'corrective_actions'),
                'gate: the master reads corrective actions on their vessel (MODULE_ACCESS ism)');
SELECT tests.ok(NOT public.fleet_dashboard_tile_can_for(tests.user_id('A.master_dra'), tests.company_id('A'), tests.vessel_id('A.hyd'), 'corrective_actions'),
                'gate: not on a vessel they do not reach');
SELECT tests.ok(NOT public.fleet_dashboard_tile_can_for(tests.user_id('A.master_dra'), tests.company_id('A'), NULL, 'corrective_actions'),
                'gate: fleet-level data needs fleet reach (D-X5-21)');
SELECT tests.ok(public.fleet_dashboard_tile_can_for(tests.user_id('A.fleet_manager'), tests.company_id('A'), NULL, 'audits_surveys'),
                'gate: the fleet manager reads fleet-level audits');
SELECT tests.ok(NOT public.fleet_dashboard_tile_can_for(tests.user_id('A.fleet_manager'), tests.company_id('B'), tests.vessel_id('B.lev'), 'technical'),
                'gate: another company''s vessel');
SELECT tests.ok(NOT public.fleet_dashboard_tile_can_for(tests.user_id('A.disabled'), tests.company_id('A'), tests.vessel_id('A.hyd'), 'drills'),
                'gate: an inactive user');
SELECT tests.ok(NOT public.fleet_dashboard_tile_can_for(tests.user_id('A.fleet_manager'), tests.company_id('A'), tests.vessel_id('A.dra'), 'bogus'),
                'gate: an unknown gate');
SELECT tests.ok(public.fleet_dashboard_tile_can_for(tests.user_id('A.master_dra'), tests.company_id('A'), tests.vessel_id('A.dra'), 'hours_of_rest'),
                'gate: hours of rest through has_capability_for (the master on their vessel)');
SELECT tests.ok(NOT public.fleet_dashboard_tile_can_for(tests.user_id('A.crew_hyd'), tests.company_id('A'), tests.vessel_id('A.hyd'), 'hours_of_rest'),
                'gate: a deckhand does not read the vessel''s hours of rest');

-- ------------------------------------------------------------ grants

SELECT tests.ok(has_function_privilege('authenticated', 'public.fleet_dashboard_kpis(uuid[], date)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.fleet_dashboard_panels(uuid[], integer, date)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.fleet_vessel_comparison(uuid[], date)', 'EXECUTE'),
                'grants: the three RPCs are executable by authenticated');
SELECT tests.ok(NOT has_function_privilege('anon', 'public.fleet_dashboard_kpis(uuid[], date)', 'EXECUTE')
                AND NOT has_function_privilege('anon', 'public.fleet_dashboard_panels(uuid[], integer, date)', 'EXECUTE')
                AND NOT has_function_privilege('anon', 'public.fleet_vessel_comparison(uuid[], date)', 'EXECUTE'),
                'grants: not by anon');
SELECT tests.ok(NOT has_function_privilege('authenticated', x, 'EXECUTE') AND has_function_privilege('service_role', x, 'EXECUTE'),
                'grants: ' || x || ' is service-only')
FROM unnest(ARRAY[
  'public.fleet_dashboard_tile_can_for(uuid, uuid, uuid, text)',
  'public.fleet_dashboard_scope_for(uuid, uuid, uuid[], date)',
  'public.fleet_dashboard_job_state(text, date, date)',
  'public.fleet_dashboard_drill_overdue(text, timestamptz, date, date)',
  'public.fleet_dashboard_open_corrective_actions(uuid)',
  'public.fleet_dashboard_hor_crew_days(uuid, uuid[], date, date)',
  'public.fleet_dashboard_counts_for(uuid, uuid, uuid[], date)']) AS x;
SELECT tests.ok(NOT p.prosecdef OR p.proconfig @> ARRAY['search_path=public'], 'definers set search_path: ' || p.proname)
FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND (p.proname LIKE 'fleet_dashboard_%' OR p.proname = 'fleet_vessel_comparison');

-- ------------------------------------------------------------ hours of rest from X1's breach review (D-380)

-- X1's breach review columns back (stubs when X1 is not in the build), and
-- its breach list: the failing-check day -3 of A.crew_hyd was dismissed in
-- review, day -5 is a live breach, day -8 a periods-only breach with no
-- failing check; the mover's day -2 is a breach of its DRAAK month and day
-- -15 one with no vessel (the HYDRA assignment covering it); a superseded
-- one and B's crew never count.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'work_rest_non_conformities' AND column_name = 'review_outcome_x380hidden') THEN
    ALTER TABLE public.work_rest_non_conformities RENAME COLUMN review_outcome_x380hidden TO review_outcome;
  END IF;
END
$$;
ALTER TABLE public.work_rest_non_conformities ADD COLUMN IF NOT EXISTS vessel_id uuid, ADD COLUMN IF NOT EXISTS breach_day date,
  ADD COLUMN IF NOT EXISTS is_serious boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_outcome text;
INSERT INTO public.work_rest_non_conformities (id, crew_id, submission_id, rule_code, rule_description, severity, window_start, window_end,
                                               measured_value, threshold_value, status, vessel_id, breach_day, is_serious, superseded_at, review_outcome)
SELECT tests.id('nc380:' || x.k), tests.user_id(x.crew), CASE WHEN x.sub IS NULL THEN NULL ELSE tests.id(x.sub) END, x.rule, 'Rest rule', 'high',
       ((current_date - x.d)::timestamp AT TIME ZONE 'UTC'), ((current_date - x.d + 1)::timestamp AT TIME ZONE 'UTC'),
       8, 10, x.status, CASE WHEN x.v IS NULL THEN NULL ELSE tests.vessel_id(x.v) END, CASE WHEN x.bd THEN current_date - x.d END,
       false, CASE WHEN x.superseded THEN now() END, x.outcome
FROM (VALUES
  ('d3', 'A.crew_hyd', 'sub:hyd', 'REST_24H_MIN', 3, 'dismissed', 'A.hyd', true, false, 'dismissed'),      -- dismissed; its failing checks c1, c2 stay
  ('d5', 'A.crew_hyd', NULL, 'REST_24H_MIN', 5, 'open', 'A.hyd', true, false, NULL),                       -- live breach (check c3 too)
  ('d8', 'A.crew_hyd', NULL, 'REST_PERIODS_MAX', 8, 'reviewed', NULL, false, false, 'accepted'),           -- periods only, no failing check; HYDRA by the assignment
  ('d8s', 'A.crew_hyd', NULL, 'REST_24H_MIN', 9, 'reviewed', 'A.hyd', true, true, 'accepted'),             -- superseded
  ('m2', 'A.mover', 'sub:mover', 'REST_24H_MIN', 2, 'open', NULL, false, false, NULL),                     -- DRAAK by its month
  ('m15', 'A.mover', NULL, 'REST_INTERVAL_MAX', 15, 'open', NULL, false, false, NULL),                     -- HYDRA by the ended assignment covering the day
  ('b1', 'B.crew', NULL, 'REST_24H_MIN', 1, 'open', 'B.lev', true, false, NULL)                            -- company B
) AS x(k, crew, sub, rule, d, status, v, bd, superseded, outcome);

SELECT tests.results_eq(
  format($q$SELECT vessel_id, crew_id, on_day, breach, near FROM public.fleet_dashboard_hor_crew_days(%L, ARRAY[%L, %L]::uuid[], current_date - 29, current_date) ORDER BY 3, 1, 2$q$,
         tests.company_id('A'), tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')),
  format($q$VALUES (%L::uuid, %L::uuid, current_date - 15, true, false), (%L, %L, current_date - 8, true, false), (%L, %L, current_date - 5, true, false),
                   (%L, %L, current_date - 2, true, true), (%L, %L, current_date - 1, false, true)$q$,
         tests.vessel_id('A.hyd'), tests.user_id('A.mover'), tests.vessel_id('A.hyd'), tests.user_id('A.crew_hyd'),
         tests.vessel_id('A.hyd'), tests.user_id('A.crew_hyd'), tests.vessel_id('A.dra'), tests.user_id('A.mover'),
         tests.vessel_id('A.hyd'), tests.user_id('A.crew_hyd')),
  'D-380 crew-days: the dismissed day is gone though its failing checks stay, the periods-only day counts, vessels by the NC, its month, else the assignment; near joined by crew-day');

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
CREATE TEMP TABLE x380 ON COMMIT DROP AS
SELECT public.fleet_dashboard_kpis(ARRAY[tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')]) AS k,
       public.fleet_report_hours_of_rest(ARRAY[tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')]) AS r;
CREATE TEMP TABLE x380_cmp ON COMMIT DROP AS SELECT * FROM public.fleet_vessel_comparison(ARRAY[tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')]);
SELECT tests.reset_role();
GRANT SELECT ON x380, x380_cmp TO PUBLIC;
SELECT tests.is((SELECT (k #>> '{tiles,hours_of_rest,breach_days}')::int FROM x380), 4,
                'D-380 tile: 4 breach crew-days (HYDRA 3, DRAAK 1); the dismissed one with its failing check counts 0, the periods-only one 1');
SELECT tests.is((SELECT (k #>> '{tiles,hours_of_rest,near_threshold}')::int FROM x380), 1, 'D-380 tile: near threshold on a crew-day without a breach');
SELECT tests.is((SELECT r ->> 'source' FROM x380), 'breach_review', 'the R9 report reads X1''s breach review');
SELECT tests.is((SELECT (k #>> '{tiles,hours_of_rest,breach_days}')::int FROM x380), (SELECT (r #>> '{totals,breach_days}')::int FROM x380),
                'D-380: the tile''s breach days equal the R9 report''s totals for the same vessels and the 30 days ending today');
SELECT tests.is((SELECT (hours_of_rest ->> 'breach_days')::int FROM x380_cmp WHERE vessel_id = tests.vessel_id('A.hyd')), 3, 'D-380 comparison: HYDRA 3 breach days');
SELECT tests.is((SELECT (hours_of_rest ->> 'breach_days')::int FROM x380_cmp WHERE vessel_id = tests.vessel_id('A.dra')), 1, 'D-380 comparison: DRAAK 1');
SELECT tests.is((SELECT sum((hours_of_rest ->> 'breach_days')::int) FROM x380_cmp)::int, (SELECT (r #>> '{totals,breach_days}')::int FROM x380),
                'D-380: the comparison''s breach days add up to the report''s');

-- ------------------------------------------------------------ documents by source (C-1, D-381)

SELECT tests.is((SELECT (d #>> '{tiles,documents,parts,expiring_vessel_certificates}')::int + (d #>> '{tiles,documents,parts,expiring_crew_items}')::int FROM fm),
                (SELECT (d #>> '{tiles,documents,parts,expiring}')::int FROM fm), 'C-1: the expiring parts by source sum to expiring');
SELECT tests.is((SELECT (d #>> '{tiles,documents,parts,expiring_vessel_certificates}')::int FROM fm), 1, 'C-1: one vessel certificate expiring (HYDRA''s)');
SELECT tests.is((SELECT (d #>> '{tiles,documents,parts,expiring_crew_items}')::int FROM fm), 2, 'C-1: two crew items expiring (the master''s STCW and the passport)');
SELECT tests.is_empty(
  $q$SELECT vessel_id FROM fm_cmp
     WHERE documents IS NOT NULL
       AND ((documents ->> 'expired_vessel_certificates')::int + (documents ->> 'expired_crew_items')::int IS DISTINCT FROM (documents ->> 'expired')::int
            OR (documents ->> 'expiring_vessel_certificates')::int + (documents ->> 'expiring_crew_items')::int IS DISTINCT FROM (documents ->> 'expiring')::int)$q$,
  'C-1: per vessel the comparison''s documents by source sum to expired and expiring');
SELECT tests.ok((SELECT bool_and(documents ? 'expired_vessel_certificates' AND documents ? 'expired_crew_items' AND documents ? 'expiring_vessel_certificates'
                                 AND documents ? 'expiring_crew_items' AND documents ? 'value' AND documents ? 'endorsements_overdue')
                 FROM fm_cmp WHERE documents IS NOT NULL),
                'C-1: the comparison keeps its keys and adds the four by source');
