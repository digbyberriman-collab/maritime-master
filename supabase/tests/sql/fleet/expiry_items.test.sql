-- The fleet expiry list (20261124040000_fleet_expiry_engine.sql; gap/02 X2,
-- X3; D-X5-01, D-X5-09, D-X5-21, D-X5-22): fleet_current_crew(),
-- fleet_counted_vessels_for(), fleet_expiry_items() and
-- fleet_expiry_summary() over two companies and five vessels of A (DRAAK,
-- HYDRA, GAME CHANGER counted; UNCOUNTED with is_counted false; ARCHIVED,
-- sold), crew on and off vessels, a login-less placement and a planned
-- joiner, every legacy source, and a test source with a muted row and an
-- overdue endorsement. Proves: per-bucket counts; explicit uncounted ids
-- allowed, foreign or archived ids refused (42501); an inactive caller gets
-- nothing; muted items count only in muted_count; a bad view name is
-- refused by the CHECK; a deactivated source disappears; a registry row
-- naming a missing view (or a view without the contract columns) is
-- skipped; windows equal expiry_window_for(); search, paging, ordering and
-- the deep links; a time budget for 10 vessels x 3,000 items.

SET LOCAL statement_timeout = '120s';
SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ world

SELECT tests.seed_vessel('A', 'A.unc', 'UNCOUNTED', 'Active', NULL, NULL, '{"is_counted": false}'::jsonb);
SELECT tests.seed_vessel('A', 'A.arc', 'ARCHIVED', 'Sold');

SELECT tests.seed_user('A', 'A.crew_gam', 'crew');
SELECT tests.seed_assignment('A.crew_gam', 'A.gam', true, 'Deckhand');
SELECT tests.seed_user('A', 'A.ashore', 'crew');
SELECT tests.seed_assignment('A.ashore', 'A.hyd', false, 'Deckhand');
SELECT tests.seed_profile('A', 'A.pending', 'crew', 'active', NULL,
  jsonb_build_object('imported_vessel_id', tests.vessel_id('A.dra'), 'is_imported', true, 'position', 'Stewardess', 'joining_date', current_date - 3));
SELECT tests.seed_user('A', 'A.joiner', 'crew');
SELECT tests.seed_assignment('A.joiner', 'A.hyd', true, 'Engineer', jsonb_build_object('join_date', current_date + 10));
SELECT tests.seed_user('A', 'A.unc_crew', 'crew');
SELECT tests.seed_assignment('A.unc_crew', 'A.unc', true, 'Deckhand');
SELECT tests.seed_user('A', 'A.arc_crew', 'crew');
SELECT tests.seed_assignment('A.arc_crew', 'A.arc', true, 'Deckhand');
SELECT tests.seed_user('B', 'B.crew', 'crew');
SELECT tests.seed_assignment('B.crew', 'B.lev', true, 'Deckhand');

-- Vessel certificates (the legacy register).
INSERT INTO public.certificates (id, certificate_type, certificate_number, certificate_name, issuing_authority, vessel_id, user_id, company_id, issue_date, expiry_date, status, superseded_by) VALUES
  (tests.id('cert:dra'), 'Statutory', 'DRA-1', 'Safety Management Certificate', 'Flag', tests.vessel_id('A.dra'), NULL, tests.company_id('A'), current_date - 400, current_date - 5, 'Expired', NULL),
  (tests.id('cert:hyd'), 'Statutory', 'HYD-1', 'Load Line Certificate', 'Class', tests.vessel_id('A.hyd'), NULL, tests.company_id('A'), current_date - 400, current_date + 10, 'Valid', NULL),
  (tests.id('cert:gam'), 'Statutory', 'GAM-1', 'Tonnage Certificate', 'Flag', tests.vessel_id('A.gam'), NULL, tests.company_id('A'), current_date - 400, current_date + 200, 'Valid', NULL),
  (tests.id('cert:unc'), 'Statutory', 'UNC-1', 'Radio Certificate', 'Flag', tests.vessel_id('A.unc'), NULL, tests.company_id('A'), current_date - 400, current_date + 20, 'Valid', NULL),
  (tests.id('cert:arc'), 'Statutory', 'ARC-1', 'Radio Certificate', 'Flag', tests.vessel_id('A.arc'), NULL, tests.company_id('A'), current_date - 400, current_date + 20, 'Valid', NULL),
  (tests.id('cert:doc'), 'DOC', 'DOC-1', 'Document of Compliance', 'Flag', NULL, NULL, tests.company_id('A'), current_date - 400, current_date + 20, 'Valid', NULL),
  (tests.id('cert:lev'), 'Statutory', 'LEV-1', 'Safety Equipment Certificate', 'Flag', tests.vessel_id('B.lev'), NULL, tests.company_id('B'), current_date - 400, current_date + 5, 'Valid', NULL);
INSERT INTO public.certificates (id, certificate_type, certificate_number, certificate_name, issuing_authority, vessel_id, company_id, issue_date, expiry_date, status, superseded_by) VALUES
  (tests.id('cert:dra_old'), 'Statutory', 'DRA-0', 'Safety Management Certificate', 'Flag', tests.vessel_id('A.dra'), tests.company_id('A'), current_date - 900, current_date - 30, 'Superseded', tests.id('cert:dra'));

-- Insurance policies.
INSERT INTO public.insurance_policies (id, company_id, vessel_id, policy_type, policy_number, insurer_name, coverage_start_date, coverage_end_date, status, lifecycle_status) VALUES
  (tests.id('ins:dra'), tests.company_id('A'), tests.vessel_id('A.dra'), 'Hull & Machinery', 'HM-1', 'Insurer One', current_date - 300, current_date + 40, 'active', 'active'),
  (tests.id('ins:fleet'), tests.company_id('A'), NULL, 'P&I', 'PI-1', 'Mutual Club', current_date - 300, current_date + 15, 'active', 'active'),
  (tests.id('ins:cancel'), tests.company_id('A'), tests.vessel_id('A.dra'), 'Cancelled cover', 'CX-1', 'Insurer Two', current_date - 300, current_date + 15, 'cancelled', 'active'),
  (tests.id('ins:arch'), tests.company_id('A'), tests.vessel_id('A.dra'), 'Archived cover', 'AR-1', 'Insurer Three', current_date - 300, current_date + 15, 'active', 'archived');

-- Passports and visas on the profile.
UPDATE public.profiles SET passport_expiry = current_date + 100, passport_country = 'Malta', visa_expiry = current_date + 400, visa_status = 'C1/D' WHERE user_id = tests.user_id('A.crew_hyd');
UPDATE public.profiles SET passport_expiry = current_date + 50 WHERE id = tests.profile_id('A.pending');
UPDATE public.profiles SET passport_expiry = current_date + 5 WHERE user_id IN (tests.user_id('A.unc_crew'), tests.user_id('B.crew'));
UPDATE public.profiles SET passport_expiry = current_date + 10 WHERE user_id = tests.user_id('A.ashore');
UPDATE public.profiles SET passport_expiry = current_date + 7 WHERE user_id = tests.user_id('A.arc_crew');

-- Legacy crew certificates: the latest of each type and name counts.
INSERT INTO public.crew_certificates (id, user_id, certificate_type, certificate_name, certificate_number, expiry_date, status) VALUES
  (tests.id('cc:stcw'), tests.user_id('A.master_dra'), 'STCW', 'STCW Basic Safety', 'BST-2', current_date + 25, 'Valid'),
  (tests.id('cc:stcw_old'), tests.user_id('A.master_dra'), 'STCW', 'STCW Basic Safety', 'BST-1', current_date - 100, 'Expired'),
  (tests.id('cc:gmdss'), tests.user_id('A.master_dra'), 'STCW', 'GMDSS Operator', 'GM-1', NULL, 'Valid');

-- Right to work.
INSERT INTO public.crew_work_authorisations (id, company_id, profile_id, authorisation_type, country, expiry_date, status) VALUES
  (tests.id('wa:ashore'), tests.company_id('A'), tests.profile_id('A.ashore'), 'b1_b2', 'United States', current_date + 30, 'valid'),
  (tests.id('wa:revoked'), tests.company_id('A'), tests.profile_id('A.crew_hyd'), 'work_permit', 'France', current_date + 30, 'revoked');

-- Training certificates (a per-course window rule below).
INSERT INTO public.training_courses (id, course_name, course_code, course_category) VALUES (tests.id('course:aff'), 'Advanced Fire Fighting', 'AFF', 'STCW');
INSERT INTO public.training_records (id, user_id, course_id, training_provider, completion_date, issue_date, expiry_date, status) VALUES
  (tests.id('tr:gam'), tests.user_id('A.crew_gam'), tests.id('course:aff'), 'Maritime Academy', current_date - 300, current_date - 300, current_date + 60, 'Valid');

-- Medical fitness (administrative fields only).
-- (The Health person row of each profile exists already: a profile trigger creates it.)
INSERT INTO public.med_fitness_assessments (id, company_id, person_id, profile_id, assessment_type, status, issued_on, expires_on, restrictions)
SELECT x.id, tests.company_id('A'), (SELECT h.id FROM public.hw_people AS h WHERE h.profile_id = tests.profile_id('A.crew_hyd')), tests.profile_id('A.crew_hyd'),
       'eng1', x.status, x.issued_on, x.expires_on, x.restrictions
FROM (VALUES (tests.id('med:eng1'), 'fit', current_date - 700, current_date + 20, 'clinical text never read'),
             (tests.id('med:eng1_old'), 'expired', current_date - 1500, current_date - 200, NULL)) AS x(id, status, issued_on, expires_on, restrictions);

-- Contracts: the planned joiner's active contract.
INSERT INTO public.crew_contracts (id, company_id, profile_id, contract_type, contract_number, position, start_date, end_date, status) VALUES
  (tests.id('con:joiner'), tests.company_id('A'), tests.profile_id('A.joiner'), 'rotational', 'C-7', 'Engineer', current_date + 10, current_date + 80, 'active'),
  (tests.id('con:draft'), tests.company_id('A'), tests.profile_id('A.joiner'), 'rotational', 'C-8', 'Engineer', current_date + 10, current_date + 20, 'draft');

-- Window rules of A: crew qualifications 75 days, the fire-fighting course 30.
INSERT INTO public.expiry_window_rules (company_id, item_type, certificate_type_id, warn_days) VALUES
  (tests.company_id('A'), 'crew_qualification', NULL, 75),
  (tests.company_id('A'), 'crew_qualification', tests.id('course:aff'), 30);

-- A test source: two expired rows on DRAAK, one muted, the other with an overdue endorsement.
CREATE VIEW public.expiry_src_zz_muted WITH (security_invoker = true) AS
SELECT 'zz_muted'::text AS source_key, 'crew_document'::text AS item_type, x.id AS record_id, tests.company_id('A') AS company_id,
       tests.vessel_id('A.dra') AS vessel_id, NULL::uuid AS profile_id, x.label, NULL::text AS detail, NULL::uuid AS certificate_type_id,
       x.expires_on, false AS no_expiry, x.endorsement_due_on, x.muted AS alerts_muted, 'vessel'::text AS link_scope, 'crew/list'::text AS link_rel
FROM (VALUES (tests.id('zz:loud'), 'Loud test item', current_date - 2, current_date - 1, false),
             (tests.id('zz:muted'), 'Muted test item', current_date - 1, NULL::date, true)) AS x(id, label, expires_on, endorsement_due_on, muted);
INSERT INTO public.expiry_sources (source_key, item_type, label, view_name, read_area, sort_order, is_active, owner_doc)
VALUES ('zz_muted', 'crew_document', 'Test source', 'expiry_src_zz_muted', 'certificates', 900, true, 'gap/02');

-- ------------------------------------------------------------ fleet_current_crew

SELECT tests.results_eq(
  format($q$SELECT vessel_id, profile_id, user_id, position, is_planned, pending_login FROM public.fleet_current_crew(ARRAY[%L, %L]::uuid[])$q$,
         tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')),
  format($q$VALUES (%L::uuid, %L::uuid, %L::uuid, 'Master'::text, false, false),
                   (%L::uuid, %L::uuid, NULL::uuid, 'Stewardess'::text, false, true),
                   (%L::uuid, %L::uuid, %L::uuid, 'Deckhand'::text, false, false),
                   (%L::uuid, %L::uuid, %L::uuid, 'Engineer'::text, true, false)$q$,
         tests.vessel_id('A.dra'), tests.profile_id('A.master_dra'), tests.user_id('A.master_dra'),
         tests.vessel_id('A.dra'), tests.profile_id('A.pending'),
         tests.vessel_id('A.hyd'), tests.profile_id('A.crew_hyd'), tests.user_id('A.crew_hyd'),
         tests.vessel_id('A.hyd'), tests.profile_id('A.joiner'), tests.user_id('A.joiner')),
  'current crew: assignments on DRAAK and HYDRA, the login-less placement (pending_login) and the planned joiner (is_planned); not the ended assignment');
SELECT tests.is((SELECT join_date FROM public.fleet_current_crew(ARRAY[tests.vessel_id('A.dra')]) WHERE profile_id = tests.profile_id('A.pending')), current_date - 3,
                'current crew: a placement''s join date is its joining date');
SELECT tests.is((SELECT count(*) FROM public.fleet_current_crew(ARRAY[tests.vessel_id('A.arc')])), 0::bigint, 'current crew: none on an archived (sold) vessel');
SELECT tests.is((SELECT count(*) FROM public.fleet_current_crew(NULL) WHERE profile_id IN (tests.profile_id('A.ashore'), tests.profile_id('A.arc_crew'))), 0::bigint,
                'current crew (all vessels): the ended crew member and the crew of the sold vessel are not current crew');
SELECT tests.is((SELECT count(*) FROM public.fleet_current_crew(NULL) WHERE vessel_id = tests.vessel_id('B.lev')), 1::bigint, 'current crew (all vessels): B''s crew on its own vessel');
SELECT tests.is((SELECT count(*) FROM public.fleet_current_crew(ARRAY[]::uuid[])), 0::bigint, 'current crew: an empty vessel list is nobody');

-- ------------------------------------------------------------ fleet_counted_vessels_for

SELECT tests.results_eq(
  format($q$SELECT x FROM public.fleet_counted_vessels_for(%L, %L, NULL) AS x$q$, tests.user_id('A.fleet_manager'), tests.company_id('A')),
  format($q$VALUES (%L::uuid), (%L::uuid), (%L::uuid)$q$, tests.vessel_id('A.dra'), tests.vessel_id('A.hyd'), tests.vessel_id('A.gam')),
  'counted vessels (NULL): the three counted vessels; not the uncounted or the sold one');
SELECT tests.results_eq(
  format($q$SELECT x FROM public.fleet_counted_vessels_for(%L, %L, ARRAY[%L]::uuid[]) AS x$q$, tests.user_id('A.fleet_manager'), tests.company_id('A'), tests.vessel_id('A.unc')),
  format($q$VALUES (%L::uuid)$q$, tests.vessel_id('A.unc')),
  'counted vessels: an explicit uncounted id is allowed (D-X5-22)');
SELECT tests.results_eq(
  format($q$SELECT x FROM public.fleet_counted_vessels_for(%L, %L, ARRAY[%L, %L, NULL]::uuid[]) AS x$q$, tests.user_id('A.fleet_manager'), tests.company_id('A'), tests.vessel_id('A.dra'), tests.vessel_id('A.dra')),
  format($q$VALUES (%L::uuid)$q$, tests.vessel_id('A.dra')),
  'counted vessels: duplicates collapse, NULL entries are ignored');
SELECT tests.is_empty(format($q$SELECT x FROM public.fleet_counted_vessels_for(%L, %L, ARRAY[]::uuid[]) AS x$q$, tests.user_id('A.fleet_manager'), tests.company_id('A')),
                      'counted vessels: an empty list is no vessel');
SELECT tests.throws_like(format($q$SELECT public.fleet_counted_vessels_for(%L, %L, ARRAY[%L]::uuid[])$q$, tests.user_id('A.fleet_manager'), tests.company_id('A'), tests.vessel_id('A.arc')),
                         '42501', 'vessel_out_of_reach', 'counted vessels: an archived id is refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_counted_vessels_for(%L, %L, ARRAY[%L]::uuid[])$q$, tests.user_id('A.fleet_manager'), tests.company_id('A'), tests.vessel_id('B.lev')),
                         '42501', 'vessel_out_of_reach', 'counted vessels: a foreign id is refused');
SELECT tests.throws_like(format($q$SELECT public.fleet_counted_vessels_for(%L, %L, ARRAY[%L]::uuid[])$q$, tests.user_id('A.master_dra'), tests.company_id('A'), tests.vessel_id('A.hyd')),
                         '42501', 'vessel_out_of_reach', 'counted vessels: a vessel the user does not reach is refused');
SELECT tests.results_eq(
  format($q$SELECT x FROM public.fleet_counted_vessels_for(%L, %L, NULL) AS x$q$, tests.user_id('A.master_dra'), tests.company_id('A')),
  format($q$VALUES (%L::uuid)$q$, tests.vessel_id('A.dra')),
  'counted vessels: a master without fleet reach covers their own vessel');
SELECT tests.is_empty(format($q$SELECT x FROM public.fleet_counted_vessels_for(%L, %L, NULL) AS x$q$, tests.user_id('A.disabled'), tests.company_id('A')),
                      'counted vessels: an inactive user covers nothing');
SELECT tests.is_empty(format($q$SELECT x FROM public.fleet_counted_vessels_for(%L, %L, NULL) AS x$q$, tests.user_id('A.fleet_manager'), tests.company_id('B')),
                      'counted vessels: another company covers nothing');

-- ------------------------------------------------------------ the fleet manager's list

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
CREATE TEMP TABLE fm_items ON COMMIT DROP AS SELECT * FROM public.fleet_expiry_items() WITH ORDINALITY AS f;
CREATE TEMP TABLE fm_unassigned ON COMMIT DROP AS SELECT * FROM public.fleet_expiry_items(p_include_unassigned => true);
CREATE TEMP TABLE fm_summary ON COMMIT DROP AS SELECT * FROM public.fleet_expiry_summary();
CREATE TEMP TABLE fm_by_vessel ON COMMIT DROP AS SELECT * FROM public.fleet_expiry_summary(p_by_vessel => true);
SELECT tests.reset_role();
GRANT SELECT ON fm_items, fm_unassigned, fm_summary, fm_by_vessel TO PUBLIC;

SELECT tests.results_eq(
  'SELECT source_key, record_id, item_type, vessel_id, bucket, days_remaining FROM fm_items',
  format($q$VALUES
    ('vessel_certificates'::text, %L::uuid, 'vessel_certificate'::text, %L::uuid, 'expired'::text, -5),
    ('zz_muted', %L, 'crew_document', %L, 'expired', -2),
    ('zz_muted', %L, 'crew_document', %L, 'expired', -1),
    ('vessel_certificates', %L, 'vessel_certificate', %L, 'expiring_soon', 10),
    ('medical_fitness', %L, 'medical', %L, 'expiring_soon', 20),
    ('crew_certificates_legacy', %L, 'crew_qualification', %L, 'expiring_soon', 25),
    ('insurance_policies', %L, 'insurance_policy', %L, 'expiring', 40),
    ('profile_identity_legacy', %L, 'passport', %L, 'expiring', 50),
    ('crew_contracts', %L, 'contract', %L, 'expiring', 80),
    ('profile_identity_legacy', %L, 'passport', %L, 'expiring', 100),
    ('training_records', %L, 'crew_qualification', %L, 'valid', 60),
    ('vessel_certificates', %L, 'vessel_certificate', %L, 'valid', 200),
    ('profile_identity_legacy', %L, 'visa', %L, 'valid', 400)$q$,
    tests.id('cert:dra'), tests.vessel_id('A.dra'),
    tests.id('zz:loud'), tests.vessel_id('A.dra'),
    tests.id('zz:muted'), tests.vessel_id('A.dra'),
    tests.id('cert:hyd'), tests.vessel_id('A.hyd'),
    tests.id('med:eng1'), tests.vessel_id('A.hyd'),
    tests.id('cc:stcw'), tests.vessel_id('A.dra'),
    tests.id('ins:dra'), tests.vessel_id('A.dra'),
    tests.profile_id('A.pending'), tests.vessel_id('A.dra'),
    tests.id('con:joiner'), tests.vessel_id('A.hyd'),
    tests.profile_id('A.crew_hyd'), tests.vessel_id('A.hyd'),
    tests.id('tr:gam'), tests.vessel_id('A.gam'),
    tests.id('cert:gam'), tests.vessel_id('A.gam'),
    tests.profile_id('A.crew_hyd'), tests.vessel_id('A.hyd')),
  'fleet list: every source over the counted vessels; superseded, company-level, cancelled, archived, revoked, older and undated rows left out; uncounted, sold and unassigned not included');
SELECT tests.results_eq(
  'SELECT bucket, count(*) FROM fm_items GROUP BY bucket',
  $q$VALUES ('expired'::text, 3::bigint), ('expiring_soon', 3), ('expiring', 4), ('valid', 3)$q$,
  'fleet list: per-bucket counts');
SELECT tests.ok((SELECT bool_and(total_count = 13) FROM fm_items), 'fleet list: total_count is every match');
SELECT tests.is((SELECT record_id FROM fm_items ORDER BY ordinality LIMIT 1), tests.id('cert:dra'), 'fleet list: most urgent first (expired, fewest days)');
SELECT tests.is_empty(
  $q$SELECT 1 FROM (SELECT ordinality,
                           CASE bucket WHEN 'expired' THEN 0 WHEN 'expiring_soon' THEN 1 WHEN 'expiring' THEN 2 WHEN 'valid' THEN 3 ELSE 4 END AS sev,
                           days_remaining FROM fm_items) AS a
     JOIN (SELECT ordinality,
                  CASE bucket WHEN 'expired' THEN 0 WHEN 'expiring_soon' THEN 1 WHEN 'expiring' THEN 2 WHEN 'valid' THEN 3 ELSE 4 END AS sev,
                  days_remaining FROM fm_items) AS b ON b.ordinality = a.ordinality + 1
     WHERE b.sev < a.sev OR (b.sev = a.sev AND b.days_remaining < a.days_remaining)$q$,
  'fleet list: ordered by bucket severity, then days remaining');
SELECT tests.is((SELECT count(*) FROM fm_items WHERE window_days IS DISTINCT FROM public.expiry_window_for(tests.company_id('A'), item_type,
                   CASE WHEN source_key = 'training_records' THEN tests.id('course:aff') END)), 0::bigint,
                'fleet list: every window equals expiry_window_for() (type rule > item rule > default)');
SELECT tests.results_eq(
  'SELECT record_id, window_days FROM fm_items WHERE item_type = ''crew_qualification''',
  format($q$VALUES (%L::uuid, 75), (%L::uuid, 30)$q$, tests.id('cc:stcw'), tests.id('tr:gam')),
  'fleet list: the item rule (75) for crew qualifications, the course rule (30) for the fire-fighting course');
SELECT tests.is((SELECT window_days FROM fm_items WHERE item_type = 'passport' AND record_id = tests.profile_id('A.pending')), 270, 'fleet list: passports default to 270');
SELECT tests.ok((SELECT bool_and(days_remaining = expires_on - current_date) FROM fm_items), 'fleet list: days remaining = expiry - today');
SELECT tests.results_eq(
  'SELECT record_id, endorsement_due_on, endorsement_state, alerts_muted FROM fm_items WHERE source_key = ''zz_muted''',
  format($q$VALUES (%L::uuid, current_date - 1, 'overdue'::text, false), (%L::uuid, NULL::date, NULL::text, true)$q$, tests.id('zz:loud'), tests.id('zz:muted')),
  'fleet list: the endorsement state comes from the engine; the muted row is listed and flagged');
SELECT tests.results_eq(
  format($q$SELECT vessel_name, vessel_code IS NOT NULL, person_name, label, detail, link_scope, link_rel FROM fm_items WHERE record_id IN (%L, %L, %L)$q$,
         tests.id('cert:dra'), tests.id('cc:stcw'), tests.profile_id('A.pending')),
  format($q$VALUES ('M/Y DRAAK'::text, true, NULL::text, 'Safety Management Certificate'::text, 'DRA-1 · Flag'::text, 'vessel'::text, 'certificates'::text),
                   ('M/Y DRAAK', true, 'Master A.master_dra', 'STCW Basic Safety', 'BST-2', 'vessel', 'crew/people/' || %L || '/documents'),
                   ('M/Y DRAAK', true, 'Crew A.pending', 'Passport', NULL, 'vessel', 'crew/people/' || %L || '/documents')$q$,
         tests.profile_id('A.master_dra'), tests.profile_id('A.pending')),
  'fleet list: vessel, person, label, detail and the deep link');
SELECT tests.is((SELECT detail FROM fm_items WHERE record_id = tests.id('med:eng1')), 'Fit', 'fleet list: a fitness certificate shows its status, never its clinical text');

-- Unassigned rows (fleet-level access).
SELECT tests.results_eq(
  'SELECT source_key, record_id, item_type, bucket, link_scope, link_rel FROM fm_unassigned WHERE vessel_id IS NULL',
  format($q$VALUES ('insurance_policies'::text, %L::uuid, 'insurance_policy'::text, 'expiring_soon'::text, 'fleet'::text, 'reports/insurance'::text),
                   ('profile_identity_legacy', %L, 'passport', 'expiring_soon', 'workspace', 'hris/employee-records'),
                   ('profile_identity_legacy', %L, 'passport', 'expiring_soon', 'workspace', 'hris/employee-records'),
                   ('work_authorisations', %L, 'visa', 'expiring_soon', 'workspace', 'hris/employee-records')$q$,
         tests.id('ins:fleet'), tests.profile_id('A.arc_crew'), tests.profile_id('A.ashore'), tests.id('wa:ashore')),
  'unassigned: the fleet policy, the people with no current vessel (ended, or on a sold vessel) and the b1/b2 visa as item type visa');
SELECT tests.is((SELECT count(*) FROM fm_unassigned), 17::bigint, 'unassigned: 13 + 4');

-- Summary: muted only in muted_count; unassigned not counted.
SELECT tests.is((SELECT sum(item_count) FROM fm_summary), 12::numeric, 'summary: 12 counted items');
SELECT tests.is((SELECT sum(muted_count) FROM fm_summary), 1::numeric, 'summary: the muted item only in muted_count');
SELECT tests.results_eq(
  'SELECT source_key, item_type, bucket, endorsement_state, item_count, muted_count FROM fm_summary WHERE source_key IN (''zz_muted'', ''vessel_certificates'')',
  $q$VALUES ('vessel_certificates'::text, 'vessel_certificate'::text, 'expired'::text, NULL::text, 1::bigint, 0::bigint),
            ('vessel_certificates', 'vessel_certificate', 'expiring_soon', NULL, 1, 0),
            ('vessel_certificates', 'vessel_certificate', 'valid', NULL, 1, 0),
            ('zz_muted', 'crew_document', 'expired', NULL, 0, 1),
            ('zz_muted', 'crew_document', 'expired', 'overdue', 1, 0)$q$,
  'summary: per source, item type, bucket and endorsement state');
SELECT tests.ok((SELECT bool_and(vessel_id IS NULL) FROM fm_summary), 'summary: no vessel without p_by_vessel');
SELECT tests.results_eq(
  'SELECT vessel_id, sum(item_count + muted_count)::bigint FROM fm_by_vessel GROUP BY vessel_id',
  format($q$VALUES (%L::uuid, 6::bigint), (%L::uuid, 5::bigint), (%L::uuid, 2::bigint)$q$, tests.vessel_id('A.dra'), tests.vessel_id('A.hyd'), tests.vessel_id('A.gam')),
  'summary by vessel: DRAAK 6, HYDRA 5, GAME CHANGER 2');

-- ------------------------------------------------------------ explicit vessels, paging, search, buckets

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.results_eq(
  format($q$SELECT record_id FROM public.fleet_expiry_items(p_vessel_ids => ARRAY[%L]::uuid[])$q$, tests.vessel_id('A.unc')),
  format($q$VALUES (%L::uuid), (%L::uuid)$q$, tests.id('cert:unc'), tests.profile_id('A.unc_crew')),
  'explicit uncounted vessel: its items are listed (D-X5-22)');
SELECT tests.throws_like(format($q$SELECT * FROM public.fleet_expiry_items(p_vessel_ids => ARRAY[%L]::uuid[])$q$, tests.vessel_id('A.arc')),
                         '42501', 'vessel_out_of_reach', 'explicit archived vessel: refused');
SELECT tests.throws_like(format($q$SELECT * FROM public.fleet_expiry_items(p_vessel_ids => ARRAY[%L]::uuid[])$q$, tests.vessel_id('B.lev')),
                         '42501', 'vessel_out_of_reach', 'explicit foreign vessel: refused');
SELECT tests.throws_like(format($q$SELECT * FROM public.fleet_expiry_summary(p_vessel_ids => ARRAY[%L]::uuid[])$q$, tests.vessel_id('B.lev')),
                         '42501', 'vessel_out_of_reach', 'summary: an explicit foreign vessel is refused too');
SELECT tests.is((SELECT count(*) FROM public.fleet_expiry_items(p_vessel_ids => ARRAY[tests.vessel_id('A.dra')])), 6::bigint, 'explicit DRAAK: its six items');
SELECT tests.results_eq('SELECT count(*), max(total_count) FROM public.fleet_expiry_items(p_limit => 2)', $q$VALUES (2::bigint, 13::bigint)$q$, 'paging: a page of 2, total 13');
SELECT tests.results_eq('SELECT count(*) FROM public.fleet_expiry_items(p_limit => 5, p_offset => 12)', $q$VALUES (1::bigint)$q$, 'paging: the last page');
SELECT tests.results_eq($q$SELECT record_id FROM public.fleet_expiry_items(p_search => 'stcw')$q$, format($q$VALUES (%L::uuid)$q$, tests.id('cc:stcw')), 'search: case-insensitive on the label');
SELECT tests.results_eq($q$SELECT record_id FROM public.fleet_expiry_items(p_search => 'master_dra')$q$, format($q$VALUES (%L::uuid)$q$, tests.id('cc:stcw')), 'search: on the person''s name');
SELECT tests.results_eq($q$SELECT record_id FROM public.fleet_expiry_items(p_search => 'HM-1')$q$, format($q$VALUES (%L::uuid)$q$, tests.id('ins:dra')), 'search: on the detail');
SELECT tests.is_empty($q$SELECT * FROM public.fleet_expiry_items(p_search => '%')$q$, 'search: % is literal (escaped), not a wildcard');
SELECT tests.is_empty($q$SELECT * FROM public.fleet_expiry_items(p_search => 'Safety_Management')$q$, 'search: _ is literal (escaped)');
SELECT tests.is((SELECT count(*) FROM public.fleet_expiry_items(p_search => '   ')), 13::bigint, 'search: blank is no search');
SELECT tests.results_eq($q$SELECT DISTINCT bucket FROM public.fleet_expiry_items(p_buckets => ARRAY['expired'])$q$, $q$VALUES ('expired'::text)$q$, 'buckets: only the asked buckets');
SELECT tests.results_eq($q$SELECT DISTINCT source_key FROM public.fleet_expiry_items(p_sources => ARRAY['insurance_policies', 'nope'])$q$, $q$VALUES ('insurance_policies'::text)$q$,
                        'sources: only the asked sources (unknown keys match nothing)');
SELECT tests.throws_like($q$SELECT * FROM public.fleet_expiry_items(p_buckets => ARRAY['bogus'])$q$, '22023', 'invalid_bucket', 'an unknown bucket is refused');
SELECT tests.throws_like($q$SELECT * FROM public.fleet_expiry_items(p_limit => 0)$q$, '22023', 'invalid_limit', 'p_limit 0 is refused');
SELECT tests.throws_like($q$SELECT * FROM public.fleet_expiry_items(p_limit => 501)$q$, '22023', 'invalid_limit', 'p_limit 501 is refused');
SELECT tests.throws_like($q$SELECT * FROM public.fleet_expiry_items(p_offset => -1)$q$, '22023', 'invalid_offset', 'a negative offset is refused');
SELECT tests.throws_like($q$SELECT * FROM public.fleet_expiry_items(p_search => repeat('x', 201))$q$, '22023', 'invalid_search', 'a search over 200 characters is refused');
SELECT tests.is((SELECT bucket FROM public.fleet_expiry_items(p_today => current_date + 300) WHERE record_id = tests.id('cert:gam')), 'expired', 'p_today moves the clock');
SELECT tests.reset_role();

-- ------------------------------------------------------------ other callers

SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.results_eq('SELECT record_id FROM public.fleet_expiry_items(p_include_unassigned => true)',
  format($q$VALUES (%L::uuid), (%L::uuid), (%L::uuid), (%L::uuid), (%L::uuid)$q$,
         tests.id('cert:dra'), tests.id('zz:loud'), tests.id('zz:muted'), tests.id('cc:stcw'), tests.profile_id('A.pending')),
  'a master: certificates and crew documents of their own vessel only; no insurance (no area), no other vessel, no unassigned rows (no fleet reach)');
SELECT tests.throws_like(format($q$SELECT * FROM public.fleet_expiry_items(p_vessel_ids => ARRAY[%L]::uuid[])$q$, tests.vessel_id('A.hyd')),
                         '42501', 'vessel_out_of_reach', 'a master: another vessel is refused');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is_empty('SELECT * FROM public.fleet_expiry_items()', 'crew: nothing (no area)');
SELECT tests.is_empty('SELECT * FROM public.fleet_expiry_summary()', 'crew: no counts');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is_empty('SELECT * FROM public.fleet_expiry_items()', 'an inactive caller: nothing');
SELECT tests.is_empty(format($q$SELECT * FROM public.fleet_expiry_items(p_vessel_ids => ARRAY[%L]::uuid[], p_include_unassigned => true)$q$, tests.vessel_id('A.dra')),
                      'an inactive caller: nothing, even for explicit vessels');
SELECT tests.is_empty('SELECT * FROM public.fleet_expiry_summary()', 'an inactive caller: no counts');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.results_eq('SELECT record_id FROM public.fleet_expiry_items(p_include_unassigned => true)',
  format($q$VALUES (%L::uuid), (%L::uuid)$q$, tests.id('cert:lev'), tests.profile_id('B.crew')),
  'company B: only its own items, never A''s');
SELECT tests.as_anon();
SELECT tests.throws('SELECT * FROM public.fleet_expiry_items()', '42501', 'anon cannot execute fleet_expiry_items');
SELECT tests.throws('SELECT * FROM public.fleet_expiry_summary()', '42501', 'anon cannot execute fleet_expiry_summary');
SELECT tests.reset_role();
SELECT tests.is_empty('SELECT * FROM public.fleet_expiry_items()', 'no JWT (no caller): nothing');

-- ------------------------------------------------------------ the registry

SELECT tests.throws(
  $q$INSERT INTO public.expiry_sources (source_key, item_type, label, view_name, read_area, owner_doc) VALUES ('bad', 'crew_document', 'Bad', 'profiles', 'hr', 'gap/02')$q$,
  '23514', 'registry: a view name outside expiry_src_* is refused by the CHECK');
SELECT tests.throws(
  $q$INSERT INTO public.expiry_sources (source_key, item_type, label, view_name, read_area, owner_doc) VALUES ('bad2', 'crew_document', 'Bad', 'expiry_src_x; DROP TABLE profiles', 'hr', 'gap/02')$q$,
  '23514', 'registry: a view name with SQL in it is refused by the CHECK');
SELECT tests.throws(
  $q$INSERT INTO public.expiry_sources (source_key, item_type, label, view_name, read_area, owner_doc) VALUES ('bad3', 'crew_document', 'Bad', 'expiry_src_ok', 'payroll', 'gap/02')$q$,
  '23514', 'registry: an unknown read area is refused');
SELECT tests.throws(
  $q$INSERT INTO public.expiry_sources (source_key, item_type, label, view_name, read_area, owner_doc) VALUES ('bad4', 'medical_certificate', 'Bad', 'expiry_src_ok', 'hr', 'gap/02')$q$,
  '23514', 'registry: an unknown item type is refused');

-- A registry row naming a missing view, and a view without the contract columns: skipped.
INSERT INTO public.expiry_sources (source_key, item_type, label, view_name, read_area, sort_order, is_active, owner_doc)
VALUES ('zz_missing', 'crew_document', 'Missing view', 'expiry_src_zz_missing', 'certificates', 950, true, 'gap/02');
CREATE VIEW public.expiry_src_zz_partial WITH (security_invoker = true) AS
SELECT 'zz_partial'::text AS source_key, tests.company_id('A') AS company_id, tests.vessel_id('A.dra') AS vessel_id, current_date AS expires_on;
INSERT INTO public.expiry_sources (source_key, item_type, label, view_name, read_area, sort_order, is_active, owner_doc)
VALUES ('zz_partial', 'crew_document', 'Partial view', 'expiry_src_zz_partial', 'certificates', 960, true, 'gap/02');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is((SELECT count(*) FROM public.fleet_expiry_items()), 13::bigint, 'registry: a missing view and a view without the contract columns are skipped; the rest still answers');
SELECT tests.reset_role();

-- A deactivated source is gone (X1 deactivates two legacy rows this way).
UPDATE public.expiry_sources SET is_active = false WHERE source_key = 'insurance_policies';
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is((SELECT count(*) FROM public.fleet_expiry_items(p_include_unassigned => true) WHERE source_key = 'insurance_policies'), 0::bigint, 'registry: a deactivated source is gone');
SELECT tests.is((SELECT count(*) FROM public.fleet_expiry_items()), 12::bigint, 'registry: the others stay');
SELECT tests.reset_role();
UPDATE public.expiry_sources SET is_active = true WHERE source_key = 'insurance_policies';

-- The seed: eight legacy sources, each with its view.
SELECT tests.results_eq(
  'SELECT source_key, item_type, view_name, read_area FROM public.expiry_sources WHERE owner_doc = ''gap/02'' AND source_key NOT LIKE ''zz\_%''',
  $q$VALUES ('vessel_certificates'::text, 'vessel_certificate'::text, 'expiry_src_vessel_certificates'::text, 'certificates'::text),
            ('insurance_policies', 'insurance_policy', 'expiry_src_insurance_policies', 'insurance'),
            ('crew_certificates_legacy', 'crew_qualification', 'expiry_src_crew_certificates', 'crew_documents'),
            ('profile_identity_legacy', 'passport', 'expiry_src_profile_identity', 'crew_documents'),
            ('work_authorisations', 'work_authorisation', 'expiry_src_work_authorisations', 'crew_documents'),
            ('training_records', 'crew_qualification', 'expiry_src_training_records', 'training'),
            ('medical_fitness', 'medical', 'expiry_src_medical_fitness', 'medical_fitness'),
            ('crew_contracts', 'contract', 'expiry_src_crew_contracts', 'hr')$q$,
  'seed: the eight legacy sources');
SELECT tests.ok(to_regclass('public.' || view_name) IS NOT NULL, format('seed: %s exists', view_name))
FROM public.expiry_sources WHERE source_key NOT LIKE 'zz\_%' ORDER BY sort_order;
SELECT tests.is(
  (SELECT count(*) FROM public.expiry_sources AS s JOIN pg_attribute AS a ON a.attrelid = to_regclass('public.' || s.view_name) AND a.attnum > 0 AND NOT a.attisdropped
   WHERE s.source_key NOT LIKE 'zz\_%'),
  8 * 15::bigint, 'seed: every source view has exactly the 15 contract columns');

-- ------------------------------------------------------------ time budget (10 vessels x 3,000 items)

SELECT tests.seed_company('P', 'Perf Fleet');
INSERT INTO public.vessels (id, company_id, name, status, created_at)
SELECT tests.id('xp:vessel:' || g), tests.company_id('P'), 'PERF VESSEL ' || g, 'Active', '2026-01-01T00:00:00Z'::timestamptz + g * interval '1 minute'
FROM generate_series(1, 10) AS g;
INSERT INTO public.certificates (id, certificate_type, certificate_number, certificate_name, issuing_authority, vessel_id, company_id, issue_date, expiry_date, status)
SELECT tests.id('xp:cert:' || g), 'Statutory', 'P-' || g, 'Certificate ' || g, 'Flag', tests.id('xp:vessel:' || (1 + g % 10)), tests.company_id('P'),
       current_date - 400, current_date - 60 + (g % 400), 'Valid'
FROM generate_series(1, 3000) AS g;
SELECT tests.seed_user('P', 'P.dpa', 'dpa');
SELECT tests.as_user(tests.user_id('P.dpa'));
SELECT tests.is((SELECT max(total_count) FROM public.fleet_expiry_items(p_limit => 100)), 3000::bigint, 'time budget: 3,000 items over 10 vessels');
CREATE TEMP TABLE xp_timing (ms numeric) ON COMMIT DROP;
GRANT INSERT, SELECT ON xp_timing TO PUBLIC;
DO $$
DECLARE t0 timestamptz; n bigint;
BEGIN
  PERFORM count(*) FROM public.fleet_expiry_items(p_limit => 100);
  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM public.fleet_expiry_items(p_limit => 100);
  INSERT INTO xp_timing VALUES (extract(epoch FROM clock_timestamp() - t0) * 1000);
  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM public.fleet_expiry_summary(p_by_vessel => true);
  INSERT INTO xp_timing VALUES (extract(epoch FROM clock_timestamp() - t0) * 1000);
END
$$;
SELECT tests.reset_role();
DO $$
BEGIN
  RAISE NOTICE '# time budget: fleet_expiry_items % ms, fleet_expiry_summary % ms (10 vessels, 3,000 items, second run)',
    (SELECT round(ms) FROM xp_timing LIMIT 1), (SELECT round(ms) FROM xp_timing OFFSET 1 LIMIT 1);
END
$$;
SELECT tests.ok((SELECT max(ms) FROM xp_timing) < 1000, format('time budget: each call under 1 s (measured %s ms; target 300 ms on production hardware)', (SELECT round(max(ms)) FROM xp_timing)));
