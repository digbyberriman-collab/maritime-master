-- Fleet operations access (20261124040000_fleet_expiry_engine.sql; D-X5-21;
-- X5 spec §0.4): fleet_ops_can_for() / fleet_ops_can() for each persona x
-- vessel (DRAAK, HYDRA, GAME CHANGER, none = fleet level) x area x level,
-- as one exact grant set per persona (every other case false):
--   A.fleet_manager   legacy dpa: everything (full access, fleet reach)
--   A.shore           legacy shore management: everything
--   A.rbac_super      RBAC superadmin (fleet reach through the role): everything
--   A.cert_captain    crew profile; an assigned (non-legacy) membership on
--                     DRAAK and HYDRA, no fleet reach; an RBAC role bound to
--                     DRAAK: vessel_certificates view (vessel scope) and
--                     reports view (fleet scope)
--   A.crew_hyd        legacy crew on HYDRA (the nav check only)
--   A.master_dra      legacy master on DRAAK (nav checks; HR edit and
--                     fitness view through the domain helpers)
--   A.ext             an external viewer on DRAAK with an RBAC certificates
--                     admin role: view only
--   A.reports_admin   an RBAC fleet role with reports admin: fleet level
--   A.hr_flag         crew on GAME CHANGER with the legacy flag
--                     crew.access_employment_records
--   A.disabled, B.admin (for company A): nothing
-- plus the other company, unknown ids, areas and levels, the caller form,
-- and the grants.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user('A', 'A.shore', 'shore_management');
SELECT tests.seed_user('A', 'A.rbac_super', 'crew');
SELECT tests.seed_role('superadmin', 'fleet');
SELECT tests.seed_rbac_role('A.rbac_super', 'superadmin');
SELECT tests.seed_user('A', 'A.cert_captain', 'crew');
SELECT tests.seed_user('A', 'A.ext', 'crew');
SELECT tests.seed_user('A', 'A.reports_admin', 'crew');
SELECT tests.seed_user('A', 'A.hr_flag', 'crew');
SELECT tests.seed_assignment('A.hr_flag', 'A.gam', true, 'Deckhand');

-- The certificates captain: an assigned membership on DRAAK and HYDRA.
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'shore', vessel_scope = 'assigned', fleet_access = false, source = 'admin'
WHERE user_id = tests.user_id('A.cert_captain');
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT m.id, m.company_id, v FROM public.account_memberships AS m, unnest(ARRAY[tests.vessel_id('A.dra'), tests.vessel_id('A.hyd')]) AS v
WHERE m.user_id = tests.user_id('A.cert_captain');
SELECT tests.seed_role('x5_cert_dra', 'vessel');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, x.m, x.p::public.permission_level, x.s::public.role_scope_type FROM public.roles AS r,
       (VALUES ('vessel_certificates', 'view', 'vessel'), ('reports', 'view', 'fleet')) AS x(m, p, s)
WHERE r.name = 'x5_cert_dra';
SELECT tests.seed_rbac_role('A.cert_captain', 'x5_cert_dra', 'A.dra');

-- The external viewer on DRAAK, with certificates up to admin.
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'external', vessel_scope = 'assigned', fleet_access = false, source = 'admin',
    valid_from = now() - interval '1 day', valid_until = now() + interval '7 days'
WHERE user_id = tests.user_id('A.ext');
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT id, company_id, tests.vessel_id('A.dra') FROM public.account_memberships WHERE user_id = tests.user_id('A.ext');
SELECT tests.seed_role('x5_cert_all', 'vessel');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'vessel_certificates', p::public.permission_level, 'fleet' FROM public.roles AS r, unnest(ARRAY['view', 'edit', 'admin']) AS p
WHERE r.name = 'x5_cert_all';
SELECT tests.seed_rbac_role('A.ext', 'x5_cert_all');

-- The reports admin: a fleet-wide RBAC role (fleet reach, D-26).
SELECT tests.seed_role('x5_reports_admin', 'fleet');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'reports', 'admin', 'fleet' FROM public.roles AS r WHERE r.name = 'x5_reports_admin';
SELECT tests.seed_rbac_role('A.reports_admin', 'x5_reports_admin');

-- The legacy HR flag holder.
SELECT tests.seed_role('x5_hr_flag', 'vessel');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'crew.access_employment_records', 'view', 'fleet' FROM public.roles AS r WHERE r.name = 'x5_hr_flag';
SELECT tests.seed_rbac_role('A.hr_flag', 'x5_hr_flag', 'A.gam');

-- Setup checks.
SELECT tests.ok(public.fleet_reach_for(tests.user_id('A.rbac_super'), tests.company_id('A')) AND public.fleet_reach_for(tests.user_id('A.reports_admin'), tests.company_id('A')),
                'setup: the RBAC superadmin and the fleet-wide reports role have fleet reach');
SELECT tests.ok(public.reach_vessel_for(tests.user_id('A.cert_captain'), tests.vessel_id('A.dra')) AND public.reach_vessel_for(tests.user_id('A.cert_captain'), tests.vessel_id('A.hyd'))
                AND NOT public.reach_vessel_for(tests.user_id('A.cert_captain'), tests.vessel_id('A.gam'))
                AND NOT public.fleet_reach_for(tests.user_id('A.cert_captain'), tests.company_id('A')),
                'setup: the certificates captain reaches DRAAK and HYDRA only, with no fleet reach');
SELECT tests.ok(public.reach_vessel_for(tests.user_id('A.ext'), tests.vessel_id('A.dra')) AND public.record_user_is_external(tests.user_id('A.ext'), tests.company_id('A'))
                AND NOT public.fleet_reach_for(tests.user_id('A.ext'), tests.company_id('A')),
                'setup: the external viewer reaches DRAAK, is external and has no fleet reach');
SELECT tests.ok(NOT public.user_is_active(tests.user_id('A.disabled')), 'setup: A.disabled is not active');

-- ------------------------------------------------------------ the matrix

CREATE TEMP TABLE fo_vessel (vkey text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO fo_vessel VALUES ('A.dra'), ('A.hyd'), ('A.gam'), ('-');
CREATE TEMP TABLE fo_area (area text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO fo_area VALUES ('dashboard'), ('reports'), ('documents'), ('checklists'), ('training'), ('certificates'), ('crew_documents'),
  ('insurance'), ('hr'), ('medical_fitness'), ('medical_clinical'), ('medical_admin');
CREATE TEMP TABLE fo_level (level text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO fo_level VALUES ('view'), ('edit'), ('admin');
CREATE TEMP TABLE fo_case ON COMMIT DROP AS
SELECT v.vkey, a.area, l.level FROM fo_vessel AS v, fo_area AS a, fo_level AS l;

-- Expected grants (persona, vessel, area, level); '*' = every case.
CREATE TEMP TABLE fo_grant (persona text, vkey text, area text, level text) ON COMMIT DROP;
INSERT INTO fo_grant VALUES
  ('A.fleet_manager', '*', '*', '*'),
  ('A.shore', '*', '*', '*'),
  ('A.rbac_super', '*', '*', '*'),
  -- certificates on DRAAK only (the role is bound to DRAAK); reports (fleet scope) on both reached vessels; the crew nav checks
  ('A.cert_captain', 'A.dra', 'certificates', 'view'),
  ('A.cert_captain', 'A.dra', 'reports', 'view'),
  ('A.cert_captain', 'A.hyd', 'reports', 'view'),
  ('A.cert_captain', 'A.dra', 'dashboard', 'view'),
  ('A.cert_captain', 'A.hyd', 'dashboard', 'view'),
  ('A.cert_captain', 'A.dra', 'documents', 'view'),
  ('A.cert_captain', 'A.hyd', 'documents', 'view'),
  ('A.crew_hyd', 'A.hyd', 'dashboard', 'view'),
  ('A.crew_hyd', 'A.hyd', 'documents', 'view'),
  ('A.master_dra', 'A.dra', 'dashboard', 'view'),
  ('A.master_dra', 'A.dra', 'documents', 'view'),
  ('A.master_dra', 'A.dra', 'checklists', 'view'),
  ('A.master_dra', 'A.dra', 'certificates', 'view'),
  ('A.master_dra', 'A.dra', 'crew_documents', 'view'),
  ('A.master_dra', 'A.dra', 'hr', 'view'),
  ('A.master_dra', 'A.dra', 'hr', 'edit'),
  ('A.master_dra', 'A.dra', 'medical_fitness', 'view'),
  ('A.ext', 'A.dra', 'certificates', 'view'),
  ('A.ext', 'A.dra', 'dashboard', 'view'),
  ('A.ext', 'A.dra', 'documents', 'view'),
  ('A.reports_admin', '*', 'reports', '*'),
  ('A.reports_admin', '*', 'dashboard', 'view'),
  ('A.reports_admin', '*', 'documents', 'view'),
  ('A.hr_flag', 'A.gam', 'hr', 'view'),
  ('A.hr_flag', 'A.gam', 'dashboard', 'view'),
  ('A.hr_flag', 'A.gam', 'documents', 'view');

CREATE TEMP TABLE fo_persona (persona text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO fo_persona VALUES ('A.fleet_manager'), ('A.shore'), ('A.rbac_super'), ('A.cert_captain'), ('A.crew_hyd'), ('A.master_dra'),
  ('A.ext'), ('A.reports_admin'), ('A.hr_flag'), ('A.disabled'), ('B.admin');

CREATE TEMP TABLE fo_got ON COMMIT DROP AS
SELECT p.persona, c.vkey, c.area, c.level,
       public.fleet_ops_can_for(tests.user_id(p.persona), tests.company_id('A'),
                                CASE WHEN c.vkey = '-' THEN NULL ELSE tests.vessel_id(c.vkey) END, c.area, c.level) AS granted
FROM fo_persona AS p, fo_case AS c;
CREATE TEMP TABLE fo_want ON COMMIT DROP AS
SELECT p.persona, c.vkey, c.area, c.level,
       EXISTS (SELECT 1 FROM fo_grant AS g
               WHERE g.persona = p.persona AND (g.vkey = '*' OR g.vkey = c.vkey) AND (g.area = '*' OR g.area = c.area) AND (g.level = '*' OR g.level = c.level)) AS granted
FROM fo_persona AS p, fo_case AS c;
GRANT SELECT ON fo_vessel, fo_area, fo_level, fo_case, fo_grant, fo_persona, fo_got, fo_want TO PUBLIC;

SELECT tests.is((SELECT count(*) FROM fo_case), 144::bigint, 'matrix: 4 scopes x 12 areas x 3 levels');
SELECT tests.is((SELECT count(*) FROM fo_got WHERE granted IS NULL), 0::bigint, 'matrix: never NULL (two-valued)');
SELECT tests.results_eq(
  format($q$SELECT vkey, area, level FROM fo_got WHERE persona = %L AND granted$q$, p.persona),
  format($q$SELECT vkey, area, level FROM fo_want WHERE persona = %L AND granted$q$, p.persona),
  format('matrix: %s holds exactly its expected grants (%s of 144)', p.persona, (SELECT count(*) FROM fo_want AS w WHERE w.persona = p.persona AND w.granted)))
FROM fo_persona AS p ORDER BY p.persona;

-- Fleet-level data needs fleet reach (D-X5-21): the captain's fleet-scope
-- reports permission covers the vessels they reach, not the fleet level.
SELECT tests.ok(public.fleet_ops_can_for(tests.user_id('A.cert_captain'), tests.company_id('A'), tests.vessel_id('A.hyd'), 'reports', 'view')
                AND NOT public.fleet_ops_can_for(tests.user_id('A.cert_captain'), tests.company_id('A'), NULL, 'reports', 'view'),
                'NULL vessel needs fleet reach: a vessel-reach-only holder of reports view is refused at fleet level');
SELECT tests.ok(public.fleet_ops_can_for(tests.user_id('A.reports_admin'), tests.company_id('A'), NULL, 'reports', 'admin'),
                'with fleet reach the same rule passes at fleet level');

-- ------------------------------------------------------------ other company, unknown ids, areas and levels

SELECT tests.ok(public.fleet_ops_can_for(tests.user_id('B.admin'), tests.company_id('B'), tests.vessel_id('B.lev'), 'certificates', 'admin')
                AND public.fleet_ops_can_for(tests.user_id('B.admin'), tests.company_id('B'), NULL, 'medical_admin', 'admin'),
                'B.admin has full access in company B');
SELECT tests.is(public.fleet_ops_can_for(tests.user_id('A.fleet_manager'), tests.company_id('B'), NULL, 'certificates', 'view'), false, 'another company: false');
SELECT tests.is(public.fleet_ops_can_for(tests.user_id('A.fleet_manager'), tests.company_id('B'), tests.vessel_id('B.lev'), 'certificates', 'view'), false, 'another company''s vessel: false');
SELECT tests.is(public.fleet_ops_can_for(tests.user_id('A.fleet_manager'), tests.company_id('A'), tests.vessel_id('B.lev'), 'certificates', 'view'), false, 'a foreign vessel under one''s own company: false');
SELECT tests.is(public.fleet_ops_can_for(tests.user_id('A.fleet_manager'), tests.company_id('A'), tests.id('vessel:nowhere'), 'certificates', 'view'), false, 'an unknown vessel: false');
SELECT tests.is(public.fleet_ops_can_for(tests.user_id('A.fleet_manager'), tests.company_id('A'), NULL, 'payroll', 'view'), false, 'an unknown area: false');
SELECT tests.is(public.fleet_ops_can_for(tests.user_id('A.fleet_manager'), tests.company_id('A'), NULL, 'reports', 'delete'), false, 'an unknown level: false');
SELECT tests.is(public.fleet_ops_can_for(NULL, tests.company_id('A'), NULL, 'reports', 'view'), false, 'a NULL user: false');
SELECT tests.is(public.fleet_ops_can_for(tests.user_id('A.fleet_manager'), NULL, NULL, 'reports', 'view'), false, 'a NULL company: false');
SELECT tests.is(public.fleet_ops_can_for(tests.user_id('A.fleet_manager'), tests.company_id('A'), NULL, NULL, 'view'), false, 'a NULL area: false');
SELECT tests.is(public.fleet_ops_can_for(tests.id('user:nobody'), tests.company_id('A'), NULL, 'reports', 'view'), false, 'an unknown user: false');

-- An archived (Sold) vessel stays a vessel of the company for fleet reach
-- (history); a vessel-reach holder no longer reaches it.
SELECT tests.seed_vessel('A', 'A.sold', 'SOLD ONE', 'Sold');
SELECT tests.is(public.fleet_ops_can_for(tests.user_id('A.fleet_manager'), tests.company_id('A'), tests.vessel_id('A.sold'), 'certificates', 'view'), true,
                'a sold vessel: fleet reach still covers it');
SELECT tests.seed_assignment('A.crew_hyd', 'A.sold', true, 'Deckhand');
SELECT tests.is(public.fleet_ops_can_for(tests.user_id('A.crew_hyd'), tests.company_id('A'), tests.vessel_id('A.sold'), 'dashboard', 'view'), false,
                'a sold vessel: an assignment no longer gives reach to it');

-- ------------------------------------------------------------ the caller form

DO $$
DECLARE p text; c record; v_got boolean; v_want boolean;
BEGIN
  FOR p IN SELECT unnest(ARRAY['A.fleet_manager', 'A.cert_captain', 'A.crew_hyd', 'A.master_dra', 'A.ext', 'A.disabled', 'B.admin']) LOOP
    PERFORM tests.as_user(tests.user_id(p));
    FOR c IN SELECT * FROM fo_case WHERE area IN ('certificates', 'reports', 'hr') ORDER BY vkey, area, level LOOP
      v_got := public.fleet_ops_can(tests.company_id('A'), CASE WHEN c.vkey = '-' THEN NULL ELSE tests.vessel_id(c.vkey) END, c.area, c.level);
      SELECT w.granted INTO v_want FROM fo_want AS w WHERE w.persona = p AND w.vkey = c.vkey AND w.area = c.area AND w.level = c.level;
      PERFORM tests.is(v_got, v_want, format('fleet_ops_can as %s: %s %s %s', p, c.vkey, c.area, c.level));
    END LOOP;
  END LOOP;
END
$$;
SELECT tests.reset_role();
SELECT tests.is(public.fleet_ops_can(tests.company_id('A'), NULL, 'reports', 'view'), false, 'fleet_ops_can with no JWT (no caller): false');
SELECT tests.as_anon();
SELECT tests.throws(format($q$SELECT public.fleet_ops_can(%L, NULL, 'reports', 'view')$q$, tests.company_id('A')), '42501', 'anon cannot execute fleet_ops_can');
SELECT tests.reset_role();

-- ------------------------------------------------------------ grants

SELECT tests.ok(has_function_privilege('authenticated', 'public.fleet_ops_can(uuid,uuid,text,text)', 'EXECUTE'), 'fleet_ops_can: authenticated');
SELECT tests.ok(NOT has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE')
                AND has_function_privilege('service_role', f, 'EXECUTE'),
                format('%s: service role only', f))
FROM unnest(ARRAY['public.fleet_ops_can_for(uuid,uuid,uuid,text,text)', 'public.fleet_counted_vessels_for(uuid,uuid,uuid[])',
                  'public.fleet_current_crew(uuid[])', 'public.fleet_hod_covers(uuid,uuid,text)',
                  'public.fleet_expiry_rows_for(uuid,uuid,uuid[],text[],boolean,date)']) AS f;

-- ------------------------------------------------------------ fleet_hod_covers

SELECT tests.seed_user('A', 'A.hod_deck', 'crew');
SELECT tests.seed_assignment('A.hod_deck', 'A.dra', true, 'Bosun');
INSERT INTO public.user_roles (id, user_id, role, company_id, vessel_id, department, is_active)
VALUES (tests.id('ur:hod_deck'), tests.user_id('A.hod_deck'), 'hod', tests.company_id('A'), tests.vessel_id('A.dra'), 'Deck', true);
SELECT tests.seed_user('A', 'A.hod_all', 'crew');
SELECT tests.seed_assignment('A.hod_all', 'A.hyd', true, 'Purser');
INSERT INTO public.user_roles (id, user_id, role, company_id, vessel_id, department, is_active)
VALUES (tests.id('ur:hod_all'), tests.user_id('A.hod_all'), 'hod', tests.company_id('A'), NULL, NULL, true);
SELECT tests.seed_user('A', 'A.hod_old', 'crew');
SELECT tests.seed_assignment('A.hod_old', 'A.dra', true, 'Bosun');
INSERT INTO public.user_roles (id, user_id, role, company_id, vessel_id, department, is_active, expires_at)
VALUES (tests.id('ur:hod_old'), tests.user_id('A.hod_old'), 'hod', tests.company_id('A'), tests.vessel_id('A.dra'), 'Deck', true, now() - interval '1 day');
INSERT INTO public.user_roles (id, user_id, role, company_id, vessel_id, department, is_active)
VALUES (tests.id('ur:ext_hod'), tests.user_id('A.ext'), 'hod', tests.company_id('A'), tests.vessel_id('A.dra'), NULL, true);

SELECT tests.is(public.fleet_hod_covers(tests.user_id('A.hod_deck'), tests.vessel_id('A.dra'), 'Deck'), true, 'HoD: the deck HoD covers Deck on DRAAK');
SELECT tests.is(public.fleet_hod_covers(tests.user_id('A.hod_deck'), tests.vessel_id('A.dra'), '  deck '), true, 'HoD: department names compare case-insensitively, trimmed');
SELECT tests.is(public.fleet_hod_covers(tests.user_id('A.hod_deck'), tests.vessel_id('A.dra'), 'Engine'), false, 'HoD: not another department');
SELECT tests.is(public.fleet_hod_covers(tests.user_id('A.hod_deck'), tests.vessel_id('A.dra'), NULL), false, 'HoD: a department HoD does not cover a person with no department');
SELECT tests.is(public.fleet_hod_covers(tests.user_id('A.hod_deck'), tests.vessel_id('A.hyd'), 'Deck'), false, 'HoD: not on another vessel');
SELECT tests.is(public.fleet_hod_covers(tests.user_id('A.hod_all'), tests.vessel_id('A.hyd'), 'Interior'), true, 'HoD: a company-wide, all-department HoD covers the vessel they reach');
SELECT tests.is(public.fleet_hod_covers(tests.user_id('A.hod_all'), tests.vessel_id('A.hyd'), NULL), true, 'HoD: and a person with no department');
SELECT tests.is(public.fleet_hod_covers(tests.user_id('A.hod_all'), tests.vessel_id('A.dra'), 'Interior'), false, 'HoD: never a vessel they do not reach');
SELECT tests.is(public.fleet_hod_covers(tests.user_id('A.hod_all'), tests.vessel_id('B.lev'), 'Interior'), false, 'HoD: never another company''s vessel');
SELECT tests.is(public.fleet_hod_covers(tests.user_id('A.hod_old'), tests.vessel_id('A.dra'), 'Deck'), false, 'HoD: an expired role covers nothing');
SELECT tests.is(public.fleet_hod_covers(tests.user_id('A.ext'), tests.vessel_id('A.dra'), 'Deck'), false, 'HoD: an external viewer never covers');
SELECT tests.is(public.fleet_hod_covers(tests.user_id('A.master_dra'), tests.vessel_id('A.dra'), 'Deck'), false, 'HoD: no hod role, no cover');
SELECT tests.is(public.fleet_hod_covers(NULL, tests.vessel_id('A.dra'), 'Deck'), false, 'HoD: a NULL user');
SELECT tests.is(public.fleet_hod_covers(tests.user_id('A.hod_deck'), NULL, 'Deck'), false, 'HoD: a NULL vessel');
UPDATE public.profiles SET account_status = 'disabled' WHERE user_id = tests.user_id('A.hod_deck');
SELECT tests.is(public.fleet_hod_covers(tests.user_id('A.hod_deck'), tests.vessel_id('A.dra'), 'Deck'), false, 'HoD: a disabled HoD covers nothing');
