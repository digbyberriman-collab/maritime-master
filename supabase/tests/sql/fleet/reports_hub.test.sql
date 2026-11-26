-- The fleet reports hub RPCs (20261124040200_fleet_reports_hub.sql; gap/02
-- R1, R14; D-X5-09, D-X5-21, D-X5-22): fleet_report_trends() and
-- fleet_vessel_list() over two companies and four vessels of A (DRAAK,
-- HYDRA, GAME CHANGER counted; UNCOUNTED with is_counted false), GAME
-- CHANGER with Safety switched off, on a fixed day (15 Nov 2026) so the
-- month arithmetic never depends on the run date. Proves: each monthly
-- count (incidents, corrective actions opened / closed, drills completed /
-- overdue) on the UTC day, its month boundary and the period (3, 6, 12;
-- anything else refused with 22023); document expiries ahead with the
-- Document alerts rules (insurance, contracts and muted items left out;
-- items already expired counted apart); module off; no_access per series
-- for a reports-only reader and for a reader without the reports rule; a
-- foreign vessel refused (42501); the uncounted vessel left out of the
-- default list and allowed explicitly; fleet-level corrective actions only
-- with the default list and fleet reach; the vessel list's particulars,
-- fleet group, active crew (planned joiners left out, pending placements
-- in) and certificate counts, NULL where not covered; an inactive caller,
-- company B and anon; the gates; grants.

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ world

SELECT tests.seed_vessel('A', 'A.unc', 'UNCOUNTED', 'Active', NULL, NULL, '{"is_counted": false}'::jsonb);

-- Reports readers: an assigned membership (DRAAK; DRAAK and HYDRA), a fleet-wide RBAC role.
SELECT tests.seed_user('A', 'A.rep_only', 'crew');
SELECT tests.seed_user('A', 'A.rep_inc', 'crew');
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'shore', vessel_scope = 'assigned', fleet_access = false, source = 'admin'
WHERE user_id IN (tests.user_id('A.rep_only'), tests.user_id('A.rep_inc'));
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT m.id, m.company_id, tests.vessel_id('A.dra') FROM public.account_memberships AS m WHERE m.user_id = tests.user_id('A.rep_only');
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT m.id, m.company_id, v FROM public.account_memberships AS m, unnest(ARRAY[tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')]) AS v
WHERE m.user_id = tests.user_id('A.rep_inc');
SELECT tests.seed_role('x5_rep_only', 'vessel');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'reports', 'view', 'fleet' FROM public.roles AS r WHERE r.name = 'x5_rep_only';
SELECT tests.seed_rbac_role('A.rep_only', 'x5_rep_only');
SELECT tests.seed_role('x5_rep_inc', 'vessel');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, x.m, 'view', 'fleet' FROM public.roles AS r, (VALUES ('reports'), ('incidents')) AS x(m) WHERE r.name = 'x5_rep_inc';
SELECT tests.seed_rbac_role('A.rep_inc', 'x5_rep_inc');

-- Crew: a planned joiner (left out of active crew), a login-less placement (counted).
SELECT tests.seed_user('A', 'A.joiner', 'crew');
SELECT tests.seed_assignment('A.joiner', 'A.hyd', true, 'Engineer', jsonb_build_object('join_date', current_date + 10));
SELECT tests.seed_profile('A', 'A.pending', 'crew', 'active', NULL,
  jsonb_build_object('imported_vessel_id', tests.vessel_id('A.dra'), 'is_imported', true, 'position', 'Stewardess', 'joining_date', current_date - 3));

-- GAME CHANGER: Safety off.
INSERT INTO public.vessel_module_settings (vessel_id, company_id, module_key, enabled) VALUES
  (tests.vessel_id('A.gam'), tests.company_id('A'), 'safety', false);

-- Particulars and a fleet group.
INSERT INTO public.fleet_groups (id, company_id, name) VALUES (tests.id('fg:med'), tests.company_id('A'), 'Mediterranean');
UPDATE public.vessels
SET vessel_type = 'Motor yacht', flag_state = 'Cayman Islands', classification_society = 'Lloyd''s Register', imo_number = '9000001',
    length_overall = 72.50, builder = 'Shipyard One', build_year = 2019, fleet_group_id = tests.id('fg:med')
WHERE id = tests.vessel_id('A.dra');
UPDATE public.vessels SET fleet_group_id = tests.id('fg:med'), build_year = 2015 WHERE id = tests.vessel_id('A.hyd');

-- ---- incidents (UTC days)
INSERT INTO public.incidents (id, vessel_id, company_id, reported_by, incident_number, incident_date, incident_type, location, description, severity_actual, severity_potential)
SELECT tests.id('inc:' || x.k), tests.vessel_id(x.v), tests.company_id(x.co), tests.user_id(x.who), 'INC-' || x.k, x.at::timestamptz, 'Near Miss', 'Deck', 'Test incident', 1, 2
FROM (VALUES
  ('1', 'A.dra', 'A', 'A.master_dra', '2026-11-03 10:00:00+00'),   -- Nov
  ('2', 'A.dra', 'A', 'A.master_dra', '2026-09-30 23:30:00+00'),   -- Sep (the UTC day, not the next month)
  ('3', 'A.hyd', 'A', 'A.master_dra', '2026-10-01 00:30:00+00'),   -- Oct
  ('3b', 'A.hyd', 'A', 'A.master_dra', '2026-10-28 12:00:00+00'),  -- Oct
  ('4', 'A.hyd', 'A', 'A.master_dra', '2026-08-31 12:00:00+00'),   -- Aug: outside 3 months, inside 6
  ('5', 'A.gam', 'A', 'A.master_dra', '2026-10-10 12:00:00+00'),   -- GAME CHANGER: Safety off
  ('6', 'A.dra', 'A', 'A.master_dra', '2026-11-20 12:00:00+00'),   -- after the day
  ('unc', 'A.unc', 'A', 'A.master_dra', '2026-10-05 12:00:00+00'), -- uncounted vessel
  ('lev', 'B.lev', 'B', 'B.admin', '2026-10-05 12:00:00+00')       -- company B
) AS x(k, v, co, who, at);

-- ---- corrective actions (opened by created_at; closed by verification, else completion)
INSERT INTO public.audits (id, audit_type, audit_scope, vessel_id, company_id, scheduled_date, status) VALUES
  (tests.id('aud:hyd'), 'Internal ISM audit', 'Vessel', tests.vessel_id('A.hyd'), tests.company_id('A'), date '2026-10-01', 'Completed');
INSERT INTO public.audit_findings (id, audit_id, finding_type, ism_section, requirement_text, finding_description, objective_evidence) VALUES
  (tests.id('af:hyd'), tests.id('aud:hyd'), 'Observation', 10, 'Maintenance', 'Finding', 'Evidence');
INSERT INTO public.corrective_actions (id, incident_id, finding_id, company_id, action_number, description, action_type, assigned_to, assigned_by,
                                       due_date, status, created_at, verified_date, completion_date)
SELECT tests.id('ca:' || x.k), CASE WHEN x.inc IS NULL THEN NULL ELSE tests.id(x.inc) END, CASE WHEN x.af IS NULL THEN NULL ELSE tests.id(x.af) END,
       tests.company_id(x.co), 'CA-' || x.k, 'Corrective action ' || x.k, 'Corrective', tests.user_id(x.who), tests.user_id(x.who),
       date '2026-12-31', x.status, x.created::timestamptz, x.verified::date, x.completed::date
FROM (VALUES
  ('1', 'inc:1', NULL, 'A', 'A.master_dra', 'Open', '2026-11-05 09:00:00+00', NULL, NULL),                    -- DRAAK: opened Nov
  ('2', NULL, 'af:hyd', 'A', 'A.master_dra', 'Closed', '2026-10-02 09:00:00+00', '2026-11-10', '2026-11-01'), -- HYDRA (audit): opened Oct, closed Nov (verification)
  ('3', NULL, NULL, 'A', 'A.master_dra', 'Closed', '2026-09-15 09:00:00+00', NULL, '2026-10-20'),             -- fleet-level: opened Sep, closed Oct (completion)
  ('4', 'inc:5', NULL, 'A', 'A.master_dra', 'Open', '2026-10-15 09:00:00+00', NULL, NULL),                    -- GAME CHANGER: Safety off
  ('5', 'inc:lev', NULL, 'B', 'B.admin', 'Open', '2026-10-15 09:00:00+00', NULL, NULL),                       -- company B
  ('6', 'inc:2', NULL, 'A', 'A.master_dra', 'Closed', '2026-07-01 09:00:00+00', '2026-09-02', NULL),          -- DRAAK: opened July (out), closed Sep
  ('7', 'inc:3', NULL, 'A', 'A.master_dra', 'In Progress', '2026-11-01 00:10:00+00', NULL, NULL),             -- HYDRA: opened Nov
  ('8', NULL, NULL, 'A', 'A.master_dra', 'Closed', '2026-09-01 09:00:00+00', '2026-11-12', NULL),             -- fleet-level: opened Sep, closed Nov
  ('9', 'inc:1', NULL, 'A', 'A.master_dra', 'Verification', '2026-11-16 09:00:00+00', NULL, '2026-11-16')     -- opened after the day
) AS x(k, inc, af, co, who, status, created, verified, completed);

-- ---- drills
INSERT INTO public.drill_types (id, drill_name, category, minimum_frequency) VALUES (tests.id('dt:fire'), 'Fire drill', 'Fire', 30);
INSERT INTO public.drills (id, vessel_id, drill_type_id, drill_date_scheduled, drill_date_actual, scenario_description, status)
SELECT tests.id('dr:' || x.k), tests.vessel_id(x.v), tests.id('dt:fire'), x.scheduled::date, x.actual::timestamptz, 'Scenario', x.status
FROM (VALUES
  ('1', 'A.dra', '2026-10-05', '2026-10-06 10:00:00+00', 'Completed'),  -- completed Oct
  ('2', 'A.dra', '2026-11-01', NULL, 'Scheduled'),                      -- overdue, Nov
  ('3', 'A.hyd', '2026-09-10', NULL, 'Completed'),                      -- completed Sep (status only: the scheduled day)
  ('4', 'A.hyd', '2026-11-20', NULL, 'Scheduled'),                      -- not due on the day
  ('5', 'A.hyd', '2026-10-20', '2026-10-22 10:00:00+00', 'Cancelled'),  -- cancelled: neither
  ('6', 'A.gam', '2026-10-01', NULL, 'Scheduled'),                      -- GAME CHANGER: Safety off
  ('7', 'A.dra', '2026-09-20', '2026-09-21 08:00:00+00', 'Scheduled'),  -- carried out, status not updated: completed Sep
  ('8', 'A.hyd', '2026-09-25', NULL, 'Scheduled'),                      -- overdue, Sep
  ('9', 'B.lev', '2026-10-01', NULL, 'Scheduled')                       -- company B
) AS x(k, v, scheduled, actual, status);

-- ---- document expiries (vessel certificates, a test source for the other rules, insurance)
INSERT INTO public.certificates (id, certificate_type, certificate_number, certificate_name, issuing_authority, vessel_id, company_id, issue_date, expiry_date, status)
SELECT tests.id('cert:' || x.k), 'Statutory', upper(x.k), 'Certificate ' || x.k, 'Flag', tests.vessel_id(x.v), tests.company_id(x.co), date '2024-01-01', x.exp::date, 'Valid'
FROM (VALUES
  ('dra1', 'A.dra', 'A', '2026-11-01'),  -- expired before the day (this month, but not due)
  ('dra2', 'A.dra', 'A', '2026-11-20'),  -- due Nov (5 days: expiring soon)
  ('hyd1', 'A.hyd', 'A', '2026-12-05'),  -- due Dec
  ('hyd2', 'A.hyd', 'A', '2027-01-31'),  -- due Jan (77 days: expiring)
  ('hyd3', 'A.hyd', 'A', '2027-03-01'),  -- due Mar: outside 3 months ahead (valid)
  ('gam', 'A.gam', 'A', '2026-12-10'),   -- GAME CHANGER: documents do not follow Safety
  ('unc', 'A.unc', 'A', '2026-12-01'),   -- uncounted vessel
  ('lev', 'B.lev', 'B', '2026-12-01')    -- company B
) AS x(k, v, co, exp);
INSERT INTO public.insurance_policies (id, company_id, vessel_id, policy_type, policy_number, insurer_name, coverage_start_date, coverage_end_date, status, lifecycle_status) VALUES
  (tests.id('ins:dra'), tests.company_id('A'), tests.vessel_id('A.dra'), 'Hull & Machinery', 'HM-1', 'Insurer One', date '2026-01-01', date '2026-12-01', 'active', 'active');
CREATE VIEW public.expiry_src_zz_rep WITH (security_invoker = true) AS
SELECT 'zz_rep'::text AS source_key, x.item_type, x.id AS record_id, tests.company_id('A') AS company_id,
       tests.vessel_id('A.dra') AS vessel_id, NULL::uuid AS profile_id, x.label, NULL::text AS detail, NULL::uuid AS certificate_type_id,
       x.expires_on, false AS no_expiry, NULL::date AS endorsement_due_on, x.muted AS alerts_muted, 'vessel'::text AS link_scope, 'crew/list'::text AS link_rel
FROM (VALUES
  (tests.id('zz:qual'), 'crew_qualification', 'Qualification', date '2026-11-30', false),  -- due Nov
  (tests.id('zz:muted'), 'crew_document', 'Muted document', date '2026-12-03', true),      -- muted: never counts
  (tests.id('zz:contract'), 'contract', 'Contract', date '2026-12-04', false)              -- contracts never count
) AS x(id, item_type, label, expires_on, muted);
INSERT INTO public.expiry_sources (source_key, item_type, label, view_name, read_area, sort_order, is_active, owner_doc)
VALUES ('zz_rep', 'crew_document', 'Reports test source', 'expiry_src_zz_rep', 'certificates', 900, true, 'gap/02');

-- ------------------------------------------------------------ the fleet manager

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
CREATE TEMP TABLE fm ON COMMIT DROP AS
SELECT public.fleet_report_trends(p_months => 3, p_today => date '2026-11-15') AS t3,
       public.fleet_report_trends(p_today => date '2026-11-15') AS t6,
       public.fleet_report_trends(p_months => 12, p_today => date '2026-11-15') AS t12,
       public.fleet_report_trends(ARRAY[tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')], 3, date '2026-11-15') AS dh,
       public.fleet_report_trends(ARRAY[tests.vessel_id('A.gam')], 3, date '2026-11-15') AS gam,
       public.fleet_report_trends(ARRAY[tests.vessel_id('A.unc')], 3, date '2026-11-15') AS unc;
CREATE TEMP TABLE fm_list ON COMMIT DROP AS SELECT * FROM public.fleet_vessel_list(p_today => date '2026-11-15');
CREATE TEMP TABLE fm_list_unc ON COMMIT DROP AS SELECT * FROM public.fleet_vessel_list(ARRAY[tests.vessel_id('A.unc')], date '2026-11-15');
SELECT tests.throws_like('SELECT public.fleet_report_trends(p_months => 5)', '22023', 'invalid_period', 'trends: a period of 5 months is refused');
SELECT tests.throws_like('SELECT public.fleet_report_trends(p_months => NULL)', '22023', 'invalid_period', 'trends: no period is refused');
SELECT tests.throws_like('SELECT public.fleet_report_trends(p_months => 0)', '22023', 'invalid_period', 'trends: a period of 0 is refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_report_trends(ARRAY[%L]::uuid[])$q$, tests.vessel_id('B.lev')),
                         '42501', 'vessel_out_of_reach', 'trends: a foreign vessel is refused (42501)');
SELECT tests.throws_like(format($q$SELECT * FROM public.fleet_vessel_list(ARRAY[%L]::uuid[])$q$, tests.vessel_id('B.lev')),
                         '42501', 'vessel_out_of_reach', 'vessel list: a foreign vessel is refused (42501)');
SELECT tests.throws_like(format($q$SELECT public.fleet_report_trends(ARRAY[%L, %L]::uuid[])$q$, tests.vessel_id('A.dra'), tests.vessel_id('B.lev')),
                         '42501', 'vessel_out_of_reach', 'trends: one foreign vessel among own ones refuses the whole read');
SELECT tests.reset_role();
GRANT SELECT ON fm, fm_list, fm_list_unc TO PUBLIC;

-- Period.
SELECT tests.is((SELECT t3 -> 'months' FROM fm), '["2026-09-01", "2026-10-01", "2026-11-01"]'::jsonb, 'trends: 3 months ending with the day''s month, oldest first');
SELECT tests.is((SELECT t3 -> 'ahead' FROM fm), '["2026-11-01", "2026-12-01", "2027-01-01"]'::jsonb, 'trends: 3 months ahead from the day''s month');
SELECT tests.is((SELECT jsonb_array_length(t6 -> 'months') FROM fm), 6, 'trends: the default period is 6 months');
SELECT tests.is((SELECT t6 #>> '{months,0}' FROM fm), '2026-06-01', 'trends: 6 months start in June');
SELECT tests.is((SELECT jsonb_array_length(t12 -> 'months') FROM fm), 12, 'trends: 12 months');
SELECT tests.is((SELECT t12 #>> '{months,0}' FROM fm), '2025-12-01', 'trends: 12 months start the December before');
SELECT tests.is((SELECT t12 #>> '{ahead,11}' FROM fm), '2027-10-01', 'trends: 12 months ahead end in October next year');
SELECT tests.is((SELECT (t3 ->> 'vessels')::int FROM fm), 3, 'trends: the three counted vessels; the uncounted one is left out of the default list');
SELECT tests.is((SELECT t3 ->> 'today' FROM fm), '2026-11-15', 'trends: the day it counted for');

-- Incidents.
SELECT tests.is((SELECT t3 #>> '{incidents,state}' FROM fm), 'ok', 'incidents: ok');
SELECT tests.is((SELECT t3 #> '{incidents,counts}' FROM fm), '[1, 2, 1]'::jsonb,
                'incidents per month: Sep (the 23:30 UTC one), Oct (two on HYDRA), Nov (not the one after the day); GAME CHANGER (Safety off), uncounted and B left out');
SELECT tests.is((SELECT (t3 #>> '{incidents,vessels}')::int FROM fm), 2, 'incidents: counted on two vessels (GAME CHANGER has Safety off)');
SELECT tests.is((SELECT t6 #> '{incidents,counts}' FROM fm), '[0, 0, 1, 1, 2, 1]'::jsonb, 'incidents over 6 months: August''s appears');
SELECT tests.is((SELECT unc #> '{incidents,counts}' FROM fm), '[0, 1, 0]'::jsonb, 'incidents: an explicit uncounted vessel is allowed (D-X5-22)');

-- Corrective actions.
SELECT tests.is((SELECT t3 #>> '{corrective_actions,state}' FROM fm), 'ok', 'corrective actions: ok');
SELECT tests.is((SELECT t3 #> '{corrective_actions,opened}' FROM fm), '[2, 1, 2]'::jsonb,
                'corrective actions opened: Sep (two fleet-level), Oct (HYDRA through the audit), Nov (DRAAK, HYDRA at 00:10 UTC); after the day, GAME CHANGER and B left out');
SELECT tests.is((SELECT t3 #> '{corrective_actions,closed}' FROM fm), '[1, 1, 2]'::jsonb,
                'corrective actions closed: Sep (DRAAK, opened in July), Oct (fleet-level, by completion), Nov (HYDRA by verification, fleet-level)');
SELECT tests.is((SELECT dh #> '{corrective_actions,opened}' FROM fm), '[0, 1, 2]'::jsonb, 'corrective actions (DRAAK, HYDRA): no fleet-level actions with an explicit list');
SELECT tests.is((SELECT dh #> '{corrective_actions,closed}' FROM fm), '[1, 0, 1]'::jsonb, 'corrective actions closed (DRAAK, HYDRA)');

-- Drills.
SELECT tests.is((SELECT t3 #>> '{drills,state}' FROM fm), 'ok', 'drills: ok');
SELECT tests.is((SELECT t3 #> '{drills,completed}' FROM fm), '[2, 1, 0]'::jsonb,
                'drills completed: Sep (by status on its scheduled day, and carried out without a status change), Oct; cancelled never');
SELECT tests.is((SELECT t3 #> '{drills,overdue}' FROM fm), '[1, 0, 1]'::jsonb, 'drills overdue by their scheduled month; not yet due and GAME CHANGER left out');

-- Document expiries.
SELECT tests.is((SELECT t3 #>> '{expiries,state}' FROM fm), 'ok', 'expiries: ok');
SELECT tests.is((SELECT (t3 #>> '{expiries,expired}')::int FROM fm), 1, 'expiries: one already expired (counted apart, not as due this month)');
SELECT tests.is((SELECT t3 #> '{expiries,due}' FROM fm), '[2, 2, 1]'::jsonb,
                'expiries due ahead: Nov (a certificate and a qualification), Dec (HYDRA and GAME CHANGER), Jan; insurance, the contract and the muted item never count');
SELECT tests.is((SELECT t6 #> '{expiries,due}' FROM fm), '[2, 2, 1, 0, 1, 0]'::jsonb, 'expiries due over 6 months ahead: March''s appears');
SELECT tests.is((SELECT (t3 #>> '{expiries,vessels}')::int FROM fm), 3, 'expiries: counted on the three vessels');

-- GAME CHANGER alone: Safety off.
SELECT tests.is((SELECT gam #>> '{incidents,state}' FROM fm), 'module_off', 'GAME CHANGER: incidents module_off');
SELECT tests.is((SELECT gam #>> '{corrective_actions,state}' FROM fm), 'module_off', 'GAME CHANGER: corrective actions module_off (no fleet-level items with an explicit list)');
SELECT tests.is((SELECT gam #>> '{drills,state}' FROM fm), 'module_off', 'GAME CHANGER: drills module_off');
SELECT tests.ok((SELECT gam #> '{incidents,counts}' IS NULL FROM fm), 'GAME CHANGER: no incident numbers at all, never zeros');
SELECT tests.is((SELECT gam #> '{expiries,due}' FROM fm), '[0, 1, 0]'::jsonb, 'GAME CHANGER: its expiries still count');

-- Vessel list.
SELECT tests.results_eq(
  'SELECT vessel_name FROM fm_list',
  $q$VALUES ('GAME CHANGER'::text), ('HYDRA'::text), ('M/Y DRAAK'::text)$q$,
  'vessel list: the counted vessels, by name');
SELECT tests.results_eq(
  'SELECT vessel_type, flag_state, classification_society, imo_number, length_overall, builder, build_year, fleet_group_name, is_counted FROM fm_list WHERE vessel_name = ''M/Y DRAAK''',
  $q$VALUES ('Motor yacht'::text, 'Cayman Islands'::text, 'Lloyd''s Register'::text, '9000001'::text, 72.50::numeric, 'Shipyard One'::text, 2019, 'Mediterranean'::text, true)$q$,
  'vessel list: DRAAK''s particulars and fleet group');
SELECT tests.is((SELECT fleet_group_id FROM fm_list WHERE vessel_name = 'GAME CHANGER'), NULL::uuid, 'vessel list: GAME CHANGER has no fleet group');
SELECT tests.is((SELECT vessel_code FROM fm_list WHERE vessel_name = 'M/Y DRAAK'), 'DRA', 'vessel list: the vessel code');
SELECT tests.results_eq(
  'SELECT vessel_name, active_crew FROM fm_list',
  $q$VALUES ('GAME CHANGER'::text, 0), ('HYDRA'::text, 1), ('M/Y DRAAK'::text, 2)$q$,
  'vessel list: active crew (DRAAK the master and the login-less placement; HYDRA the deckhand, not the planned joiner); a real zero');
SELECT tests.results_eq(
  'SELECT vessel_name, certificates_total, certificates_expired, certificates_expiring FROM fm_list',
  $q$VALUES ('GAME CHANGER'::text, 1, 0, 1), ('HYDRA'::text, 3, 0, 2), ('M/Y DRAAK'::text, 2, 1, 1)$q$,
  'vessel list: certificates total / expired / expiring (within the window; March is still valid)');
SELECT tests.results_eq(
  'SELECT vessel_name, is_counted, certificates_expired FROM fm_list_unc',
  $q$VALUES ('UNCOUNTED'::text, false, 0)$q$,
  'vessel list: an explicit uncounted vessel is allowed and says it is not counted');

-- ------------------------------------------------------------ other callers

-- Reports only (DRAAK): the vessel, nothing else.
SELECT tests.as_user(tests.user_id('A.rep_only'));
CREATE TEMP TABLE ro ON COMMIT DROP AS SELECT public.fleet_report_trends(p_months => 3, p_today => date '2026-11-15') AS t;
CREATE TEMP TABLE ro_list ON COMMIT DROP AS SELECT * FROM public.fleet_vessel_list(p_today => date '2026-11-15');
SELECT tests.throws_like(format($q$SELECT public.fleet_report_trends(ARRAY[%L]::uuid[])$q$, tests.vessel_id('A.hyd')),
                         '42501', 'vessel_out_of_reach', 'reports only: a vessel they do not reach is refused');
-- Reports and incidents (DRAAK, HYDRA).
SELECT tests.as_user(tests.user_id('A.rep_inc'));
CREATE TEMP TABLE ri ON COMMIT DROP AS SELECT public.fleet_report_trends(p_months => 3, p_today => date '2026-11-15') AS t;
-- The DRAAK master: no reports rule.
SELECT tests.as_user(tests.user_id('A.master_dra'));
CREATE TEMP TABLE ms ON COMMIT DROP AS SELECT public.fleet_report_trends(p_months => 3, p_today => date '2026-11-15') AS t;
SELECT tests.is_empty('SELECT * FROM public.fleet_vessel_list()', 'master without the reports rule: no vessel row');
-- The HYDRA deckhand.
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
CREATE TEMP TABLE cr ON COMMIT DROP AS SELECT public.fleet_report_trends(p_months => 3, p_today => date '2026-11-15') AS t;
SELECT tests.is_empty('SELECT * FROM public.fleet_vessel_list()', 'crew: no vessel row');
-- Inactive (an explicit id is not even looked at).
SELECT tests.as_user(tests.user_id('A.disabled'));
CREATE TEMP TABLE off ON COMMIT DROP AS
SELECT public.fleet_report_trends(p_months => 3, p_today => date '2026-11-15') AS t,
       public.fleet_report_trends(ARRAY[tests.vessel_id('A.hyd')], 3, date '2026-11-15') AS t_hyd;
SELECT tests.is_empty('SELECT * FROM public.fleet_vessel_list()', 'inactive: no vessel row');
SELECT tests.throws_like('SELECT public.fleet_report_trends(p_months => 7)', '22023', 'invalid_period', 'inactive: a bad period is still refused');
-- Company B.
SELECT tests.as_user(tests.user_id('B.admin'));
CREATE TEMP TABLE bb ON COMMIT DROP AS SELECT public.fleet_report_trends(p_months => 3, p_today => date '2026-11-15') AS t;
CREATE TEMP TABLE bb_list ON COMMIT DROP AS SELECT * FROM public.fleet_vessel_list(p_today => date '2026-11-15');
SELECT tests.throws_like(format($q$SELECT * FROM public.fleet_vessel_list(ARRAY[%L]::uuid[])$q$, tests.vessel_id('A.dra')),
                         '42501', 'vessel_out_of_reach', 'company B: A''s vessel is refused');
-- anon.
SELECT tests.as_anon();
SELECT tests.throws('SELECT public.fleet_report_trends()', '42501', 'anon cannot execute fleet_report_trends');
SELECT tests.throws('SELECT * FROM public.fleet_vessel_list()', '42501', 'anon cannot execute fleet_vessel_list');
SELECT tests.reset_role();
GRANT SELECT ON ro, ro_list, ri, ms, cr, off, bb, bb_list TO PUBLIC;

SELECT tests.is((SELECT (t ->> 'vessels')::int FROM ro), 1, 'reports only: DRAAK');
SELECT tests.results_eq(
  $q$SELECT key, value ->> 'state' FROM ro, jsonb_each(t) WHERE key IN ('incidents', 'corrective_actions', 'drills', 'expiries')$q$,
  $q$VALUES ('corrective_actions'::text, 'no_access'::text), ('drills', 'no_access'), ('expiries', 'no_access'), ('incidents', 'no_access')$q$,
  'reports only: every series no_access (no data rule passes), never zeros');
SELECT tests.results_eq(
  'SELECT vessel_name, active_crew, certificates_total, certificates_expired, certificates_expiring FROM ro_list',
  $q$VALUES ('M/Y DRAAK'::text, NULL::integer, NULL::integer, NULL::integer, NULL::integer)$q$,
  'reports only: the vessel''s particulars, its counts NULL (not covered), never 0');
SELECT tests.is((SELECT imo_number FROM ro_list), '9000001', 'reports only: the particulars are shown');

SELECT tests.is((SELECT (t ->> 'vessels')::int FROM ri), 2, 'reports and incidents: DRAAK and HYDRA');
SELECT tests.is((SELECT t #> '{incidents,counts}' FROM ri), '[1, 2, 1]'::jsonb, 'reports and incidents: the incidents of both vessels (RBAC incidents)');
SELECT tests.is((SELECT t #>> '{corrective_actions,state}' FROM ri), 'no_access', 'reports and incidents: no corrective actions');
SELECT tests.is((SELECT t #>> '{expiries,state}' FROM ri), 'no_access', 'reports and incidents: no document expiries');

SELECT tests.is((SELECT (t ->> 'vessels')::int FROM ms), 0, 'master without the reports rule: no vessel');
SELECT tests.is((SELECT t #>> '{incidents,state}' FROM ms), 'no_access', 'master without the reports rule: incidents no_access');
SELECT tests.is((SELECT t #>> '{corrective_actions,state}' FROM ms), 'no_access', 'master without the reports rule: corrective actions no_access');

SELECT tests.is((SELECT (t ->> 'vessels')::int FROM cr), 0, 'crew: no vessel');
SELECT tests.is((SELECT t #>> '{drills,state}' FROM cr), 'no_access', 'crew: drills no_access');

SELECT tests.is((SELECT (t ->> 'vessels')::int FROM off), 0, 'inactive: no vessel');
SELECT tests.results_eq(
  $q$SELECT key, value ->> 'state' FROM off, jsonb_each(t) WHERE key IN ('incidents', 'corrective_actions', 'drills', 'expiries')$q$,
  $q$VALUES ('corrective_actions'::text, 'no_access'::text), ('drills', 'no_access'), ('expiries', 'no_access'), ('incidents', 'no_access')$q$,
  'inactive: every series no_access');
SELECT tests.is((SELECT t_hyd #>> '{incidents,state}' FROM off), 'no_access', 'inactive with an explicit vessel: nothing');
SELECT tests.is((SELECT t -> 'months' FROM off), '["2026-09-01", "2026-10-01", "2026-11-01"]'::jsonb, 'inactive: the months are still named');

SELECT tests.is((SELECT (t ->> 'vessels')::int FROM bb), 1, 'company B: LEVIATHAN only');
SELECT tests.is((SELECT t #> '{incidents,counts}' FROM bb), '[0, 1, 0]'::jsonb, 'company B: its own incident, none of A''s');
SELECT tests.is((SELECT t #> '{corrective_actions,opened}' FROM bb), '[0, 1, 0]'::jsonb, 'company B: its own corrective action');
SELECT tests.is((SELECT t #> '{drills,overdue}' FROM bb), '[0, 1, 0]'::jsonb, 'company B: its own overdue drill');
SELECT tests.is((SELECT t #> '{expiries,due}' FROM bb), '[0, 1, 0]'::jsonb, 'company B: its own certificate');
SELECT tests.results_eq('SELECT vessel_name FROM bb_list', $q$VALUES ('LEVIATHAN'::text)$q$, 'company B: LEVIATHAN only in the vessel list');

-- ------------------------------------------------------------ gates and helpers

SELECT tests.ok(public.fleet_report_gate_can_for(tests.user_id('A.master_dra'), tests.company_id('A'), tests.vessel_id('A.dra'), 'incidents'),
                'gate: the master reads incidents on their vessel (MODULE_ACCESS ism)');
SELECT tests.ok(NOT public.fleet_report_gate_can_for(tests.user_id('A.master_dra'), tests.company_id('A'), tests.vessel_id('A.hyd'), 'incidents'),
                'gate: not on a vessel they do not reach');
SELECT tests.ok(NOT public.fleet_report_gate_can_for(tests.user_id('A.master_dra'), tests.company_id('A'), NULL, 'incidents'),
                'gate: fleet-level data needs fleet reach (D-X5-21)');
SELECT tests.ok(NOT public.fleet_report_gate_can_for(tests.user_id('A.crew_hyd'), tests.company_id('A'), tests.vessel_id('A.hyd'), 'incidents'),
                'gate: a deckhand has no incidents read');
SELECT tests.ok(public.fleet_report_gate_can_for(tests.user_id('A.rep_inc'), tests.company_id('A'), tests.vessel_id('A.hyd'), 'incidents'),
                'gate: the RBAC incidents module at view');
SELECT tests.ok(NOT public.fleet_report_gate_can_for(tests.user_id('A.rep_inc'), tests.company_id('A'), tests.vessel_id('A.gam'), 'incidents'),
                'gate: the RBAC holder, not on a vessel outside their membership');
SELECT tests.ok(public.fleet_report_gate_can_for(tests.user_id('A.fleet_manager'), tests.company_id('A'), tests.vessel_id('A.hyd'), 'crew_list'),
                'gate: the fleet manager reads the crew list');
SELECT tests.ok(NOT public.fleet_report_gate_can_for(tests.user_id('A.rep_only'), tests.company_id('A'), tests.vessel_id('A.dra'), 'crew_list'),
                'gate: a reports-only reader does not read the crew list');
SELECT tests.ok(public.fleet_report_gate_can_for(tests.user_id('A.master_dra'), tests.company_id('A'), tests.vessel_id('A.dra'), 'corrective_actions'),
                'gate: corrective actions through the dashboard gate');
SELECT tests.ok(NOT public.fleet_report_gate_can_for(tests.user_id('A.fleet_manager'), tests.company_id('B'), tests.vessel_id('B.lev'), 'incidents'),
                'gate: another company''s vessel');
SELECT tests.ok(NOT public.fleet_report_gate_can_for(tests.user_id('A.disabled'), tests.company_id('A'), tests.vessel_id('A.hyd'), 'incidents'),
                'gate: an inactive user');
SELECT tests.ok(NOT public.fleet_report_gate_can_for(tests.user_id('A.fleet_manager'), tests.company_id('A'), tests.vessel_id('A.dra'), 'bogus'),
                'gate: an unknown gate');
SELECT tests.ok(NOT public.fleet_report_gate_can_for(NULL, tests.company_id('A'), tests.vessel_id('A.dra'), 'incidents'),
                'gate: no user');

SELECT tests.results_eq(
  format($q$SELECT id, vessel_id, opened_on, closed_on FROM public.fleet_report_corrective_actions(%L) WHERE id IN (%L, %L, %L) ORDER BY opened_on$q$,
         tests.company_id('A'), tests.id('ca:2'), tests.id('ca:3'), tests.id('ca:6')),
  format($q$VALUES (%L::uuid, %L::uuid, date '2026-07-01', date '2026-09-02'), (%L, NULL, date '2026-09-15', date '2026-10-20'), (%L, %L, date '2026-10-02', date '2026-11-10')$q$,
         tests.id('ca:6'), tests.vessel_id('A.dra'), tests.id('ca:3'), tests.id('ca:2'), tests.vessel_id('A.hyd')),
  'corrective actions: the vessel through the incident or the audit, NULL for fleet-level; closed by verification, else completion');
SELECT tests.is((SELECT closed_on FROM public.fleet_report_corrective_actions(tests.company_id('A')) WHERE id = tests.id('ca:9')), NULL::date,
                'corrective actions: not closed until the status is Closed (Verification with a completion date is still open)');
SELECT tests.is_empty(format($q$SELECT 1 FROM public.fleet_report_corrective_actions(%L) WHERE id = %L$q$, tests.company_id('A'), tests.id('ca:5')),
                      'corrective actions: another company''s are left out');

SELECT tests.results_eq(
  format($q$SELECT cardinality(vessel_ids), cardinality(incidents), cardinality(incidents_on), cardinality(documents), cardinality(crew_list), fleet_level, fleet_corrective_actions
            FROM public.fleet_report_scope_for(%L, %L, NULL, date '2026-11-15')$q$, tests.user_id('A.fleet_manager'), tests.company_id('A')),
  $q$VALUES (3, 3, 2, 3, 3, true, true)$q$,
  'scope (fleet manager): three vessels; incidents on two with Safety on; fleet level');
SELECT tests.results_eq(
  format($q$SELECT cardinality(vessel_ids), cardinality(incidents), fleet_level FROM public.fleet_report_scope_for(%L, %L, NULL, date '2026-11-15')$q$,
         tests.user_id('A.rep_inc'), tests.company_id('A')),
  $q$VALUES (2, 2, false)$q$,
  'scope (reports and incidents): their two vessels, no fleet level (no fleet reach)');
SELECT tests.results_eq(
  format($q$SELECT cardinality(vessel_ids), fleet_level FROM public.fleet_report_scope_for(%L, %L, NULL, date '2026-11-15')$q$,
         tests.user_id('A.disabled'), tests.company_id('A')),
  $q$VALUES (0, false)$q$,
  'scope (inactive): nothing');

-- ------------------------------------------------------------ grants

SELECT tests.ok(has_function_privilege('authenticated', 'public.fleet_report_trends(uuid[], integer, date)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.fleet_vessel_list(uuid[], date)', 'EXECUTE'),
                'grants: authenticated executes the two browser RPCs');
SELECT tests.ok(NOT has_function_privilege('anon', 'public.fleet_report_trends(uuid[], integer, date)', 'EXECUTE')
                AND NOT has_function_privilege('anon', 'public.fleet_vessel_list(uuid[], date)', 'EXECUTE'),
                'grants: anon executes neither');
SELECT tests.ok(NOT has_function_privilege('authenticated', x, 'EXECUTE') AND has_function_privilege('service_role', x, 'EXECUTE'),
                'grants: service role only: ' || x)
FROM unnest(ARRAY[
  'public.fleet_report_gate_can_for(uuid, uuid, uuid, text)',
  'public.fleet_report_scope_for(uuid, uuid, uuid[], date)',
  'public.fleet_report_corrective_actions(uuid)']) AS x;
SELECT tests.ok(p.prosecdef AND p.proconfig @> ARRAY['search_path=public'], 'definers set search_path: ' || p.proname)
FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND (p.proname LIKE 'fleet_report_%' OR p.proname = 'fleet_vessel_list');
