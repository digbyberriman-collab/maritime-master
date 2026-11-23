-- Access RLS (spec §A.8; CC-2, CC-4, CC-5; D-124): log_permission_change
-- (one overload, service role only, forged actor replaced), the audit log
-- (no insert path, company-scoped admin read), user_roles / rbac_user_roles
-- / user_permission_overrides (company-scoped, no self, no superadmin, rank
-- and module-level caps, audit rows with actor = auth.uid()), the policy
-- predicates evaluate for authenticated (no "permission denied for
-- function"), vessel writes admin-only, roles / role_permissions frozen.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user('A', 'A.shore', 'shore_management');      -- full admin, rank 80, does not manage admins
SELECT tests.seed_user('A', 'A.ua_admin', 'crew');               -- non-legacy users-access admin, rank 10
UPDATE public.account_memberships SET legacy_managed = false, source = 'admin', kind = 'admin', users_access_level = 'write', vessel_scope = 'all', fleet_access = true
WHERE user_id = tests.user_id('A.ua_admin');
SELECT tests.seed_user('B', 'B.crew', 'crew');
SELECT tests.seed_role('superadmin', 'fleet');
SELECT tests.seed_user_role('B.admin', 'dpa', 'B');
SELECT tests.seed_user_role('B.crew', 'crew', 'B');
SELECT tests.seed_user_role('A.crew_hyd', 'crew', 'A');

-- ------------------------------------------------------------ log_permission_change (CC-4)

SELECT tests.is((SELECT count(*) FROM pg_proc WHERE proname = 'log_permission_change' AND pronamespace = 'public'::regnamespace), 1::bigint, 'exactly one log_permission_change overload');
SELECT tests.ok(to_regprocedure('public.log_permission_change(uuid,text,public.audit_action_type,uuid,uuid,text,jsonb,jsonb,text,uuid,inet,text)') IS NOT NULL, 'it has the live signature (p_vessel_scope uuid, live order)');
SELECT tests.ok(NOT has_function_privilege('authenticated', 'public.log_permission_change(uuid,text,public.audit_action_type,uuid,uuid,text,jsonb,jsonb,text,uuid,inet,text)', 'EXECUTE'), 'authenticated cannot execute log_permission_change');
SELECT tests.ok(NOT has_function_privilege('anon', 'public.log_permission_change(uuid,text,public.audit_action_type,uuid,uuid,text,jsonb,jsonb,text,uuid,inet,text)', 'EXECUTE'), 'anon cannot execute log_permission_change');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws(format($q$SELECT public.log_permission_change(%L, 'dpa', 'role_assigned', %L)$q$, tests.user_id('B.admin'), tests.user_id('A.crew_hyd')), '42501', 'a browser session cannot call log_permission_change');
SELECT tests.reset_role();

-- Service role, no JWT: the given actor is recorded, the company is the actor's.
SELECT tests.as_service();
CREATE TEMP TABLE logged ON COMMIT DROP AS
SELECT public.log_permission_change(tests.user_id('A.fleet_manager'), 'dpa', 'role_assigned', tests.user_id('A.crew_hyd'), NULL, 'settings') AS id;
GRANT SELECT ON logged TO PUBLIC;
SELECT tests.reset_role();
SELECT tests.is((SELECT actor_user_id FROM public.permission_audit_log WHERE id = (SELECT id FROM logged)), tests.user_id('A.fleet_manager'), 'service role: the given actor is recorded');
SELECT tests.is((SELECT company_id FROM public.permission_audit_log WHERE id = (SELECT id FROM logged)), tests.company_id('A'), 'service role: company_id = the actor''s company');
SELECT tests.ok((SELECT is_high_impact FROM public.permission_audit_log WHERE id = (SELECT id FROM logged)), 'role_assigned is high impact (live rule kept)');

-- Inside an admin's session (through a definer wrapper, test only) a forged actor is replaced.
CREATE FUNCTION tests.wrap_log_permission_change(p_forged_actor uuid, p_target uuid, p_vessel uuid DEFAULT NULL)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.log_permission_change(p_forged_actor, 'superadmin', 'override_added', p_target, NULL, 'hr', NULL, NULL, 'forged', p_vessel)
$$;
GRANT EXECUTE ON FUNCTION tests.wrap_log_permission_change(uuid, uuid, uuid) TO authenticated;
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
CREATE TEMP TABLE logged_forged ON COMMIT DROP AS SELECT tests.wrap_log_permission_change(tests.user_id('B.admin'), tests.user_id('A.crew_hyd')) AS id;
SELECT tests.throws_like(format('SELECT tests.wrap_log_permission_change(%L, %L)', tests.user_id('A.fleet_manager'), tests.user_id('B.crew')), '42501', 'target_outside_company', 'a target of another company is refused');
SELECT tests.throws_like(format('SELECT tests.wrap_log_permission_change(%L, %L, %L)', tests.user_id('A.fleet_manager'), tests.user_id('A.crew_hyd'), tests.vessel_id('B.lev')), '42501', 'vessel_outside_company', 'a vessel of another company is refused');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.throws_like(format('SELECT tests.wrap_log_permission_change(%L, %L)', tests.user_id('A.fleet_manager'), tests.user_id('A.master_dra')), '42501', 'not_permitted', 'a non-admin session cannot log a change');
SELECT tests.reset_role();
SELECT tests.is((SELECT actor_user_id FROM public.permission_audit_log WHERE id = (SELECT id FROM logged_forged)), tests.user_id('A.fleet_manager'), 'a forged p_actor_user_id is replaced by auth.uid()');
SELECT tests.is((SELECT actor_role FROM public.permission_audit_log WHERE id = (SELECT id FROM logged_forged)), 'dpa', 'the actor role is the caller''s legacy role, not the forged one');
SELECT tests.is((SELECT company_id FROM public.permission_audit_log WHERE id = (SELECT id FROM logged_forged)), tests.company_id('A'), 'the company is the caller''s');

-- ------------------------------------------------------------ permission_audit_log: no insert path, company-scoped read

INSERT INTO public.permission_audit_log (id, actor_user_id, actor_role, action_type, company_id)
VALUES (tests.id('pal:B'), tests.user_id('B.admin'), 'dpa', 'role_assigned', tests.company_id('B'));
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws(format($q$INSERT INTO public.permission_audit_log (actor_user_id, actor_role, action_type, company_id) VALUES (%L, 'dpa', 'role_assigned', %L)$q$, tests.user_id('A.fleet_manager'), tests.company_id('A')), '42501', 'a direct INSERT into permission_audit_log is refused (even for an admin)');
SELECT tests.throws(format($q$INSERT INTO public.permission_audit_log (actor_user_id, actor_role, action_type) VALUES (%L, 'dpa', 'role_assigned')$q$, tests.user_id('B.admin')), '42501', 'a forged actor cannot be inserted');
SELECT tests.denied(format($q$UPDATE public.permission_audit_log SET actor_role = 'x' WHERE id = %L RETURNING id$q$, (SELECT id FROM logged)), 'audit rows cannot be updated');
SELECT tests.denied(format($q$DELETE FROM public.permission_audit_log WHERE id = %L RETURNING id$q$, (SELECT id FROM logged)), 'audit rows cannot be deleted');
SELECT tests.ok((SELECT count(*) FROM public.permission_audit_log WHERE company_id = tests.company_id('A')) >= 2, 'the DPA reads company A''s audit rows');
SELECT tests.is_empty(format('SELECT 1 FROM public.permission_audit_log WHERE company_id = %L', tests.company_id('B')), 'the A DPA reads none of company B''s');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is_empty(format('SELECT 1 FROM public.permission_audit_log WHERE company_id = %L', tests.company_id('A')), 'company B''s admin reads none of company A''s audit rows');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is_empty('SELECT 1 FROM public.permission_audit_log', 'crew read no audit rows');
SELECT tests.as_anon();
SELECT tests.denied('SELECT * FROM public.permission_audit_log', 'anon reads no audit rows');
SELECT tests.reset_role();

-- ------------------------------------------------------------ user_roles (CC-5): no browser write path

-- A users-access admin of A (the DPA) cannot write a user_roles row at all,
-- whatever the role, the target or the company (the service role does).
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format($q$INSERT INTO public.user_roles (user_id, role, company_id) VALUES (%L, %L, %L)$q$, tests.user_id('A.crew_hyd'), r, tests.company_id('A')),
                         '42501', 'new row violates row-level security%', format('the A DPA cannot grant %s in their own company', r))
FROM unnest(ARRAY['captain', 'dpa', 'travel_agent', 'crew', 'auditor_flag']) AS r;
SELECT tests.throws_like(format($q$INSERT INTO public.user_roles (user_id, role, company_id) VALUES (%L, 'crew', %L)$q$, tests.user_id('B.crew'), tests.company_id('B')), '42501', 'new row violates row-level security%', 'nor to a company-B user');
SELECT tests.throws_like(format($q$INSERT INTO public.user_roles (user_id, role, company_id) VALUES (%L, 'captain', %L)$q$, tests.user_id('A.fleet_manager'), tests.company_id('A')), '42501', 'new row violates row-level security%', 'nor to themselves');
SELECT tests.reset_role();
SELECT tests.seed_user_role('A.master_dra', 'captain', 'A');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.denied(format($q$UPDATE public.user_roles SET is_active = false WHERE id = %L RETURNING id$q$, tests.id('user_role:A.master_dra:captain:A')), 'the DPA cannot update a service-seeded row of their company');
SELECT tests.denied(format($q$UPDATE public.user_roles SET role = 'dpa' WHERE id = %L RETURNING id$q$, tests.id('user_role:A.master_dra:captain:A')), 'nor raise its role');
SELECT tests.denied(format($q$DELETE FROM public.user_roles WHERE id = %L RETURNING id$q$, tests.id('user_role:A.master_dra:captain:A')), 'nor delete it');
SELECT tests.denied(format($q$UPDATE public.user_roles SET is_active = false WHERE user_id = %L RETURNING id$q$, tests.user_id('B.crew')), 'nor touch a company-B row');
SELECT tests.is_empty(format('SELECT 1 FROM public.user_roles WHERE company_id = %L', tests.company_id('B')), 'the A DPA reads none of company B''s user_roles rows');
SELECT tests.ok((SELECT count(*) FROM public.user_roles WHERE company_id = tests.company_id('A')) >= 2, 'the DPA reads company A''s rows');
SELECT tests.reset_role();
SELECT tests.ok((SELECT is_active AND role::text = 'captain' FROM public.user_roles WHERE id = tests.id('user_role:A.master_dra:captain:A')), 'the service-seeded row is unchanged');
SELECT tests.is((SELECT count(*) FROM public.permission_audit_log WHERE target_user_id = tests.user_id('A.master_dra') AND after_state ? 'app_role'), 0::bigint, 'no audit row: nothing was written');
-- A non-legacy users-access admin and a Master cannot write either.
SELECT tests.as_user(tests.user_id('A.ua_admin'));
SELECT tests.throws_like(format($q$INSERT INTO public.user_roles (user_id, role, company_id) VALUES (%L, 'travel_agent', %L)$q$, tests.user_id('A.crew_hyd'), tests.company_id('A')), '42501', 'new row violates row-level security%', 'a non-legacy users-access admin cannot grant a rank-0 role (travel_agent)');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(format($q$INSERT INTO public.user_roles (user_id, role, company_id) VALUES (%L, 'crew', %L)$q$, tests.user_id('A.crew_hyd'), tests.company_id('A')), '42501', 'new row violates row-level security%', 'a Master cannot grant app roles');
SELECT tests.is((SELECT count(*) FROM public.user_roles WHERE user_id = auth.uid()), 1::bigint, 'a user still reads their own user_roles rows');
SELECT tests.is_empty(format('SELECT 1 FROM public.user_roles WHERE user_id = %L', tests.user_id('A.crew_hyd')), 'a non-admin reads nobody else''s rows');
-- A dpa row that names company A does not make a company-B user an admin of A.
SELECT tests.seed_user_role('B.crew', 'dpa', 'A');
SELECT tests.as_user(tests.user_id('B.crew'));
SELECT tests.throws_like(format($q$INSERT INTO public.user_roles (user_id, role, company_id) VALUES (%L, 'crew', %L)$q$, tests.user_id('A.crew_hyd'), tests.company_id('A')), '42501', 'new row violates row-level security%', 'a forged dpa row naming company A grants nothing in A');
SELECT tests.is_empty(format('SELECT 1 FROM public.user_roles WHERE company_id = %L AND user_id <> auth.uid()', tests.company_id('A')), 'nor any read of A''s rows');
SELECT tests.ok(NOT public.has_role_in_company(auth.uid(), ARRAY['dpa']::public.app_role[], tests.company_id('A')), 'has_role_in_company: a row naming company A does not count for a company-B user');
SELECT tests.reset_role();

-- ------------------------------------------------------------ legacy role policies are company-scoped (has_role_in_company)

-- Company B data, written as the superuser.
INSERT INTO public.medical_reports (id, vessel_id, crew_id, report_number, injury_type, treatment_given)
VALUES (tests.id('med:B'), tests.vessel_id('B.lev'), tests.user_id('B.crew'), 'MED-B-1', 'Fracture', 'Splint; evacuation'),
       (tests.id('med:A'), tests.vessel_id('A.hyd'), tests.user_id('A.master_dra'), 'MED-A-1', 'Sprain', 'Rest'),
       (tests.id('med:A2'), NULL, tests.user_id('A.master_dra'), 'MED-A-2', 'Cut', 'Dressing');
INSERT INTO public.flight_requests (id, crew_id, vessel_id, company_id, request_number, request_type, depart_from, arrive_to, earliest_departure_date)
VALUES (tests.id('fr:B'), tests.user_id('B.crew'), tests.vessel_id('B.lev'), tests.company_id('B'), 'FR-B-1', 'rotation', 'AAA', 'BBB', current_date + 7),
       (tests.id('fr:A'), tests.user_id('A.master_dra'), tests.vessel_id('A.dra'), tests.company_id('A'), 'FR-A-1', 'rotation', 'CCC', 'DDD', current_date + 7);
INSERT INTO public.flight_bookings (id, flight_request_id, airline, booking_reference, ticket_number)
VALUES (tests.id('fb:B'), tests.id('fr:B'), 'Air B', 'PNR-B', 'TKT-B'),
       (tests.id('fb:A'), tests.id('fr:A'), 'Air A', 'PNR-A', 'TKT-A');
INSERT INTO public.admin_action_log (id, actor_user_id, action_type, target_user_id, reason)
VALUES (tests.id('aal:B'), tests.user_id('B.admin'), 'RESET_ACCOUNT', tests.user_id('B.crew'), 'B internal');
INSERT INTO public.planner_periods (id, vessel_id, period_type, start_date, end_date)
VALUES (tests.id('pp:B'), tests.vessel_id('B.lev'), 'yard', current_date, current_date + 10);

-- Service-seeded roles of company A for A.crew_hyd (the rows a tenant admin
-- could mint before this phase): captain, dpa, travel_agent.
SELECT tests.seed_user_role('A.crew_hyd', r, 'A') FROM unnest(ARRAY['captain', 'dpa', 'travel_agent']::public.app_role[]) AS r;
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.ok(public.has_any_role(auth.uid(), ARRAY['captain', 'dpa', 'travel_agent']::public.app_role[]), 'A.crew_hyd holds the three app roles (unscoped helper)');
SELECT tests.ok(public.has_role_in_company(auth.uid(), ARRAY['captain']::public.app_role[], tests.company_id('A')), 'has_role_in_company: captain in A');
SELECT tests.ok(NOT public.has_role_in_company(auth.uid(), ARRAY['captain', 'dpa', 'travel_agent']::public.app_role[], tests.company_id('B')), 'has_role_in_company: none of them in B');
SELECT tests.is_empty('SELECT 1 FROM public.medical_reports WHERE id = ' || quote_literal(tests.id('med:B')), 'A.crew_hyd reads none of company B''s medical reports');
SELECT tests.is_empty(format('SELECT 1 FROM public.flight_requests WHERE company_id = %L', tests.company_id('B')), 'nor company B''s flight requests');
SELECT tests.is_empty('SELECT 1 FROM public.flight_bookings WHERE id = ' || quote_literal(tests.id('fb:B')), 'nor company B''s flight bookings');
SELECT tests.is_empty('SELECT 1 FROM public.admin_action_log WHERE id = ' || quote_literal(tests.id('aal:B')), 'nor company B''s admin action log');
SELECT tests.is_empty('SELECT 1 FROM public.planner_periods WHERE id = ' || quote_literal(tests.id('pp:B')), 'nor company B''s planner periods');
SELECT tests.denied(format($q$UPDATE public.medical_reports SET treatment_given = 'tampered by A' WHERE id = %L RETURNING id$q$, tests.id('med:B')), 'an UPDATE of B''s medical report changes no row');
SELECT tests.denied(format($q$UPDATE public.flight_bookings SET ticket_number = 'X' WHERE id = %L RETURNING id$q$, tests.id('fb:B')), 'nor of B''s flight booking');
SELECT tests.throws_like(format($q$INSERT INTO public.medical_reports (vessel_id, report_number) VALUES (%L, 'MED-FORGED')$q$, tests.vessel_id('B.lev')), '42501', 'new row violates row-level security%', 'no medical report on a company-B vessel');
SELECT tests.throws_like(format($q$INSERT INTO public.planner_periods (vessel_id, period_type, start_date, end_date) VALUES (%L, 'yard', current_date, current_date)$q$, tests.vessel_id('B.lev')), '42501', 'new row violates row-level security%', 'no planner period on a company-B vessel');
-- Company A rows stay readable for the same roles (vessel in reach; vessel-less via the crew's company).
SELECT tests.results_eq('SELECT report_number::text FROM public.medical_reports', $$VALUES ('MED-A-1'), ('MED-A-2')$$, 'the captain of A reads company A''s medical reports (by vessel, and by crew when there is no vessel)');
SELECT tests.results_eq('SELECT request_number::text FROM public.flight_requests', $$VALUES ('FR-A-1')$$, 'and company A''s flight requests');
SELECT tests.results_eq('SELECT booking_reference::text FROM public.flight_bookings', $$VALUES ('PNR-A')$$, 'and company A''s flight bookings');
SELECT tests.lives(format($q$UPDATE public.medical_reports SET treatment_given = 'Rest and ice' WHERE id = %L$q$, tests.id('med:A')), 'the captain of A updates an A medical report');
SELECT tests.reset_role();
SELECT tests.is((SELECT treatment_given FROM public.medical_reports WHERE id = tests.id('med:B')), 'Splint; evacuation', 'B''s medical report is unchanged');
SELECT tests.is((SELECT ticket_number::text FROM public.flight_bookings WHERE id = tests.id('fb:B')), 'TKT-B', 'B''s booking is unchanged');
-- Company B's own DPA (user_roles dpa of B) still manages B's reports.
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.results_eq('SELECT report_number::text FROM public.medical_reports', $$VALUES ('MED-B-1')$$, 'company B''s DPA reads B''s medical report only');
SELECT tests.results_eq('SELECT booking_reference::text FROM public.flight_bookings', $$VALUES ('PNR-B')$$, 'and B''s booking only');
SELECT tests.reset_role();
-- The crew member's own rows stay readable through the own-row branch.
SELECT tests.as_user(tests.user_id('B.crew'));
SELECT tests.results_eq('SELECT request_number::text FROM public.flight_requests', $$VALUES ('FR-B-1')$$, 'a crew member reads their own flight request');
SELECT tests.reset_role();

-- has_role_in_company: the platform superadmin (a user_roles row with no
-- company) passes for any company; a company-less row of another role
-- counts for nobody; a signed-in caller never asks about someone else.
SELECT tests.seed_user('A', 'A.platform', 'crew');
SELECT tests.seed_user_role('A.platform', 'superadmin', NULL);
SELECT tests.seed_user('A', 'A.nullrole', 'crew');
SELECT tests.seed_user_role('A.nullrole', 'dpa', NULL);
SELECT tests.as_user(tests.user_id('A.platform'));
SELECT tests.ok(public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa']::public.app_role[], tests.company_id('B')), 'a company-less superadmin passes has_role_in_company for company B');
SELECT tests.ok(public.has_role_in_company(auth.uid(), ARRAY['superadmin']::public.app_role[], tests.company_id('A')), 'and for company A');
SELECT tests.ok(NOT public.has_role_in_company(auth.uid(), ARRAY['dpa']::public.app_role[], tests.company_id('A')), 'but not for a role they do not hold');
SELECT tests.ok(NOT public.has_role_in_company(auth.uid(), ARRAY['superadmin']::public.app_role[], NULL), 'a NULL company is false');
SELECT tests.ok(NOT public.has_role_in_company(tests.user_id('A.crew_hyd'), ARRAY['captain']::public.app_role[], tests.company_id('A')), 'a signed-in caller asking about someone else gets false');
SELECT tests.as_user(tests.user_id('A.nullrole'));
SELECT tests.ok(NOT public.has_role_in_company(auth.uid(), ARRAY['dpa']::public.app_role[], tests.company_id('A')), 'a company-less dpa row counts for no company');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.ok(NOT public.has_role_in_company(auth.uid(), ARRAY['crew']::public.app_role[], tests.company_id('A')), 'a disabled caller: false');
SELECT tests.reset_role();
SELECT tests.ok(public.has_role_in_company(tests.user_id('A.crew_hyd'), ARRAY['captain']::public.app_role[], tests.company_id('A')), 'no JWT (service, cron): answers for anyone');
SELECT tests.ok(NOT public.has_role_in_company(NULL, ARRAY['captain']::public.app_role[], tests.company_id('A')), 'a NULL user is false');
-- Back to plain crew for the rest of the file.
DELETE FROM public.user_roles WHERE user_id = tests.user_id('A.crew_hyd') AND role IN ('captain', 'dpa', 'travel_agent');

-- ------------------------------------------------------------ rbac_user_roles

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format($q$INSERT INTO public.rbac_user_roles (id, user_id, role_id, vessel_id) VALUES (%L, %L, (SELECT id FROM public.roles WHERE name = 'captain'), %L)$q$, tests.id('rbac:new'), tests.user_id('A.crew_hyd'), tests.vessel_id('A.dra')), 'the DPA assigns an RBAC role on a company vessel');
SELECT tests.throws_like(format($q$INSERT INTO public.rbac_user_roles (user_id, role_id) VALUES (%L, (SELECT id FROM public.roles WHERE name = 'superadmin'))$q$, tests.user_id('A.crew_hyd')), '42501', 'new row violates row-level security%', 'never the superadmin RBAC role');
SELECT tests.throws_like(format($q$INSERT INTO public.rbac_user_roles (user_id, role_id) VALUES (%L, (SELECT id FROM public.roles WHERE name = 'crew'))$q$, tests.user_id('A.fleet_manager')), '42501', 'new row violates row-level security%', 'no RBAC role for yourself');
SELECT tests.throws_like(format($q$INSERT INTO public.rbac_user_roles (user_id, role_id) VALUES (%L, (SELECT id FROM public.roles WHERE name = 'crew'))$q$, tests.user_id('B.crew')), '42501', 'new row violates row-level security%', 'no RBAC role for a company-B user');
SELECT tests.throws_like(format($q$INSERT INTO public.rbac_user_roles (user_id, role_id, vessel_id) VALUES (%L, (SELECT id FROM public.roles WHERE name = 'crew'), %L)$q$, tests.user_id('A.crew_hyd'), tests.vessel_id('B.lev')), '42501', 'new row violates row-level security%', 'no RBAC role on another company''s vessel');
SELECT tests.lives(format($q$UPDATE public.rbac_user_roles SET is_active = false WHERE id = %L$q$, tests.id('rbac:new')), 'the DPA deactivates it');
SELECT tests.lives(format($q$DELETE FROM public.rbac_user_roles WHERE id = %L$q$, tests.id('rbac:new')), 'and deletes it');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT action_type::text, company_id, vessel_scope, target_role_id IS NOT NULL FROM public.permission_audit_log WHERE target_user_id = %L AND actor_user_id = %L AND target_role_id IS NOT NULL$q$, tests.user_id('A.crew_hyd'), tests.user_id('A.fleet_manager')),
  format($q$VALUES ('role_assigned', %1$L::uuid, %2$L::uuid, true), ('role_removed', %1$L::uuid, %2$L::uuid, true), ('role_removed', %1$L::uuid, %2$L::uuid, true)$q$, tests.company_id('A'), tests.vessel_id('A.dra')),
  'rbac assign / deactivate / delete are audited (actor, company, vessel scope, role id)');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM public.permission_audit_log WHERE target_user_id = tests.user_id('A.crew_hyd') AND (before_state::text || after_state::text) ~ '@'), 'audit states carry no email address');
-- Rank cap: strictly below your own rank; an equal rank only for a manager
-- of admins. Shore management (80, does not manage admins) assigns captain
-- (60), not fleet_master (80) nor dpa (90); the DPA (90, manages admins)
-- assigns fleet_master and dpa; nobody assigns superadmin.
SELECT tests.as_user(tests.user_id('A.shore'));
SELECT tests.lives(format($q$INSERT INTO public.rbac_user_roles (user_id, role_id) VALUES (%L, (SELECT id FROM public.roles WHERE name = 'captain'))$q$, tests.user_id('A.master_dra')), 'rank 80 assigns a rank-60 role');
SELECT tests.throws_like(format($q$INSERT INTO public.rbac_user_roles (user_id, role_id) VALUES (%L, (SELECT id FROM public.roles WHERE name = 'fleet_master'))$q$, tests.user_id('A.master_dra')), '42501', 'new row violates row-level security%', 'rank 80 without manages_admins cannot assign a rank-80 role');
SELECT tests.throws_like(format($q$INSERT INTO public.rbac_user_roles (user_id, role_id) VALUES (%L, (SELECT id FROM public.roles WHERE name = 'dpa'))$q$, tests.user_id('A.master_dra')), '42501', 'new row violates row-level security%', 'not a role ranked above your own');
SELECT tests.throws_like(format($q$INSERT INTO public.rbac_user_roles (user_id, role_id) VALUES (%L, (SELECT id FROM public.roles WHERE name = 'superadmin'))$q$, tests.user_id('A.master_dra')), '42501', 'new row violates row-level security%', 'shore management never assigns superadmin');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format($q$INSERT INTO public.rbac_user_roles (id, user_id, role_id) VALUES (%L, %L, (SELECT id FROM public.roles WHERE name = 'fleet_master'))$q$, tests.id('rbac:fm'), tests.user_id('A.crew_hyd')), 'the DPA assigns a role below 90 (fleet_master)');
SELECT tests.lives(format($q$INSERT INTO public.rbac_user_roles (id, user_id, role_id) VALUES (%L, %L, (SELECT id FROM public.roles WHERE name = 'dpa'))$q$, tests.id('rbac:dpa'), tests.user_id('A.shore')), 'the DPA, a manager of admins, assigns the equal rank dpa');
SELECT tests.throws_like(format($q$INSERT INTO public.rbac_user_roles (user_id, role_id) VALUES (%L, (SELECT id FROM public.roles WHERE name = 'superadmin'))$q$, tests.user_id('A.master_dra')), '42501', 'new row violates row-level security%', 'nor does the DPA assign superadmin');
SELECT tests.reset_role();
DELETE FROM public.rbac_user_roles WHERE id IN (tests.id('rbac:fm'), tests.id('rbac:dpa'));
-- Reads.
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.ok((SELECT count(*) FROM public.rbac_user_roles WHERE user_id = auth.uid()) >= 1, 'a user reads their own RBAC roles');
SELECT tests.is_empty(format('SELECT 1 FROM public.rbac_user_roles WHERE user_id <> %L', tests.user_id('A.master_dra')), 'and nobody else''s');
SELECT tests.throws_like(format($q$INSERT INTO public.rbac_user_roles (user_id, role_id) VALUES (%L, (SELECT id FROM public.roles WHERE name = 'crew'))$q$, tests.user_id('A.crew_hyd')), '42501', 'new row violates row-level security%', 'a non-admin cannot assign RBAC roles');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is_empty(format('SELECT 1 FROM public.rbac_user_roles WHERE user_id = %L', tests.user_id('A.master_dra')), 'company B''s admin reads none of A''s RBAC roles');
SELECT tests.denied(format($q$UPDATE public.rbac_user_roles SET is_active = false WHERE user_id = %L RETURNING id$q$, tests.user_id('A.master_dra')), 'nor changes them');
SELECT tests.reset_role();

-- ------------------------------------------------------------ user_permission_overrides

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format($q$INSERT INTO public.user_permission_overrides (id, user_id, module_key, permission, is_granted, reason, created_by, company_id) VALUES (%L, %L, 'drills', 'edit', true, 'Drill lead', %L, %L)$q$,
  tests.id('upo:new'), tests.user_id('A.crew_hyd'), tests.user_id('B.admin'), tests.company_id('B')), 'the DPA adds an override (client company and creator are ignored)');
SELECT tests.reset_role();
SELECT tests.is((SELECT company_id FROM public.user_permission_overrides WHERE id = tests.id('upo:new')), tests.company_id('A'), 'company_id stamped from the target, not the client');
SELECT tests.is((SELECT created_by FROM public.user_permission_overrides WHERE id = tests.id('upo:new')), tests.user_id('A.fleet_manager'), 'created_by is the caller, not the client value');
SELECT tests.is((SELECT count(*) FROM public.permission_audit_log WHERE action_type = 'override_added' AND target_user_id = tests.user_id('A.crew_hyd') AND actor_user_id = tests.user_id('A.fleet_manager') AND target_module_key = 'drills' AND company_id = tests.company_id('A')), 1::bigint, 'the override is audited');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format($q$INSERT INTO public.user_permission_overrides (user_id, module_key, permission, is_granted, reason, created_by) VALUES (%L, 'drills', 'edit', true, 'x', %L)$q$, tests.user_id('B.crew'), tests.user_id('A.fleet_manager')), '42501', 'new row violates row-level security%', 'no override for a company-B user');
SELECT tests.throws_like(format($q$INSERT INTO public.user_permission_overrides (user_id, module_key, permission, is_granted, reason, created_by) VALUES (%L, 'settings', 'admin', true, 'x', %L)$q$, tests.user_id('A.fleet_manager'), tests.user_id('A.fleet_manager')), '42501', 'new row violates row-level security%', 'no override for yourself');
SELECT tests.throws_like(format($q$INSERT INTO public.user_permission_overrides (user_id, module_key, permission, is_granted, reason, created_by, vessel_id) VALUES (%L, 'ptw', 'edit', true, 'x', %L, %L)$q$, tests.user_id('A.crew_hyd'), tests.user_id('A.fleet_manager'), tests.vessel_id('B.lev')), '23514', 'override_vessel_company_mismatch', 'no override on another company''s vessel');
SELECT tests.throws_like(format($q$INSERT INTO public.user_permission_overrides (user_id, module_key, permission, is_granted, reason, created_by, vessel_id) VALUES (%L, 'ptw', 'edit', true, 'x', %L, %L)$q$, tests.user_id('A.crew_hyd'), tests.user_id('A.fleet_manager'), tests.vessel_id('A.hyd')), '23514', '%user_permission_overrides_vessel_unsupported%', 'a vessel-limited override is refused even on a company vessel (no evaluator honours it yet, D-124)');
SELECT tests.throws_like(format($q$UPDATE public.user_permission_overrides SET vessel_id = %L WHERE id = %L$q$, tests.vessel_id('A.hyd'), tests.id('upo:new')), '23514', '%user_permission_overrides_vessel_unsupported%', 'nor can an override be narrowed to a vessel');
SELECT tests.lives(format($q$UPDATE public.user_permission_overrides SET permission = 'view' WHERE id = %L$q$, tests.id('upo:new')), 'the DPA updates it');
SELECT tests.lives(format($q$DELETE FROM public.user_permission_overrides WHERE id = %L$q$, tests.id('upo:new')), 'and removes it');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.permission_audit_log WHERE target_user_id = tests.user_id('A.crew_hyd') AND target_module_key = 'drills' AND action_type IN ('permission_updated', 'override_removed')), 2::bigint, 'update and removal are audited');
-- A users-access admin without the module level cannot grant it.
SELECT tests.as_user(tests.user_id('A.ua_admin'));
SELECT tests.ok(public.has_capability('admin.access.users_access.admin', tests.company_id('A')), 'the non-legacy admin is a users-access admin');
SELECT tests.throws_like(format($q$INSERT INTO public.user_permission_overrides (user_id, module_key, permission, is_granted, reason, created_by) VALUES (%L, 'hr', 'admin', true, 'x', %L)$q$, tests.user_id('A.crew_hyd'), tests.user_id('A.ua_admin')), '42501', 'new row violates row-level security%', 'no granting a module level you do not hold');
SELECT tests.reset_role();
-- Reads.
INSERT INTO public.user_permission_overrides (id, user_id, module_key, permission, is_granted, reason, created_by)
VALUES (tests.id('upo:own'), tests.user_id('A.master_dra'), 'ptw', 'edit', true, 'Permit lead', tests.user_id('A.fleet_manager'));
SELECT tests.is((SELECT company_id FROM public.user_permission_overrides WHERE id = tests.id('upo:own')), tests.company_id('A'), 'the stamp also runs without a JWT');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is((SELECT count(*) FROM public.user_permission_overrides WHERE user_id = auth.uid()), 1::bigint, 'a user reads their own override');
SELECT tests.denied(format($q$UPDATE public.user_permission_overrides SET permission = 'admin' WHERE id = %L RETURNING id$q$, tests.id('upo:own')), 'a user cannot raise their own override');
SELECT tests.is((SELECT permission::text FROM public.user_permission_overrides WHERE id = tests.id('upo:own')), 'edit', 'unchanged');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is_empty('SELECT 1 FROM public.user_permission_overrides', 'company B''s admin reads none of A''s overrides');
SELECT tests.reset_role();

-- ------------------------------------------------------------ overrides involving an administrator need a manager of admins (W7)

-- w7-manages-admins-missing-overrides-revoke: A.shore (a full legacy admin,
-- users-access admin, not a manager of admins) cannot mint a full admin
-- (settings:admin) nor touch a DPA's access; ordinary module overrides are
-- still theirs; the DPA does both.
SELECT tests.as_user(tests.user_id('A.shore'));
SELECT tests.ok(NOT public.permission_override_write_allowed(tests.user_id('A.crew_hyd'), tests.company_id('A'), 'settings', 'admin'), 'A.shore: settings:admin on crew is refused');
SELECT tests.throws_like(format($q$INSERT INTO public.user_permission_overrides (user_id, module_key, permission, is_granted, reason, created_by) VALUES (%L, 'settings', 'admin', true, 'mint', auth.uid())$q$, tests.user_id('A.crew_hyd')),
                         '42501', 'new row violates row-level security%', 'and the INSERT is refused');
SELECT tests.ok(NOT public.permission_override_write_allowed(tests.user_id('A.fleet_manager'), tests.company_id('A'), m, 'view'), 'A.shore: no ' || m || ' override on the DPA')
FROM unnest(ARRAY['hr', 'crew_roster', 'settings']) AS m;
SELECT tests.throws_like(format($q$INSERT INTO public.user_permission_overrides (user_id, module_key, permission, is_granted, reason, created_by) VALUES (%L, 'hr', 'view', false, 'deny', auth.uid())$q$, tests.user_id('A.fleet_manager')),
                         '42501', 'new row violates row-level security%', 'not even a deny');
SELECT tests.ok(public.permission_override_write_allowed(tests.user_id('A.crew_hyd'), tests.company_id('A'), 'crew_roster', 'view'), 'A.shore still writes crew_roster:view on crew');
SELECT tests.lives(format($q$INSERT INTO public.user_permission_overrides (id, user_id, module_key, permission, is_granted, reason, created_by) VALUES (%L, %L, 'crew_roster', 'view', true, 'Crew list', auth.uid())$q$, tests.id('upo:shore'), tests.user_id('A.crew_hyd')),
                   'and inserts it');
SELECT tests.reset_role();
SELECT tests.ok(NOT public.legacy_user_admin(tests.user_id('A.crew_hyd')), 'crew_hyd is still no full admin');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.ok(public.permission_override_write_allowed(tests.user_id('A.crew_hyd'), tests.company_id('A'), 'settings', 'admin'), 'the DPA may write settings:admin on crew');
SELECT tests.ok(public.permission_override_write_allowed(tests.user_id('A.shore'), tests.company_id('A'), 'hr', 'view'), 'and an override on an administrator');
SELECT tests.reset_role();
DELETE FROM public.user_permission_overrides WHERE id = tests.id('upo:shore');
-- The same rule on RBAC roles: a non-manager cannot touch a DPA's roles.
SELECT tests.seed_role('watch_keeper_test', 'vessel');
SELECT tests.seed_rbac_role('A.fleet_manager', 'watch_keeper_test', 'A.dra');
SELECT tests.as_user(tests.user_id('A.shore'));
SELECT tests.ok(NOT public.rbac_user_roles_write_allowed(tests.user_id('A.fleet_manager'), (SELECT id FROM public.roles WHERE name = 'watch_keeper_test'), tests.vessel_id('A.dra')),
                'A.shore: no RBAC change on the DPA, even a rank-0 role');
SELECT tests.denied(format($q$DELETE FROM public.rbac_user_roles WHERE id = %L RETURNING id$q$, tests.id('rbac:A.fleet_manager:watch_keeper_test:A.dra')), 'nor deletes the DPA''s lower-ranked role');
SELECT tests.ok(public.rbac_user_roles_write_allowed(tests.user_id('A.crew_hyd'), (SELECT id FROM public.roles WHERE name = 'watch_keeper_test'), tests.vessel_id('A.hyd')),
                'A.shore still assigns it to crew');
SELECT tests.reset_role();

-- ------------------------------------------------------------ fleet-conferring and module roles are not rank-0 loopholes (review round 2)

-- rbac-fleet-role-rank-too-low: legal_counsel (rank 0, default scope
-- fleet, legal:edit) and employer_api (rank 20, fleet, hr:view) confer
-- fleet reach and module rights; they need an all-vessels admin with fleet
-- reach, and a non-legacy admin holds every right of the role it grants.
SELECT tests.seed_user('A', 'A.ua_write_hyd', 'crew');                -- non-legacy admin, write, HYDRA only, rank 10
UPDATE public.account_memberships SET legacy_managed = false, source = 'admin', kind = 'admin', users_access_level = 'write' WHERE user_id = tests.user_id('A.ua_write_hyd');
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT id, company_id, tests.vessel_id('A.hyd') FROM public.account_memberships WHERE user_id = tests.user_id('A.ua_write_hyd');
SELECT tests.seed_user('A', 'A.ua_master_all', 'master');             -- non-legacy admin, write, all vessels, no fleet access, rank 60
UPDATE public.account_memberships SET legacy_managed = false, source = 'admin', kind = 'admin', users_access_level = 'write', vessel_scope = 'all', fleet_access = false
WHERE user_id = tests.user_id('A.ua_master_all');
SELECT tests.ok(NOT public.fleet_reach_for(tests.user_id('A.crew_hyd'), tests.company_id('A')), 'setup: crew_hyd has no fleet reach');
SELECT tests.as_user(tests.user_id('A.ua_write_hyd'));
SELECT tests.throws_like(format($q$INSERT INTO public.rbac_user_roles (user_id, role_id, vessel_id) VALUES (%L, (SELECT id FROM public.roles WHERE name = %L), NULL)$q$, tests.user_id('A.crew_hyd'), r),
                         '42501', 'new row violates row-level security%', 'the HYDRA admin cannot grant ' || r || ' company-wide')
FROM unnest(ARRAY['legal_counsel', 'employer_api']) AS r;
SELECT tests.throws_like(format($q$INSERT INTO public.rbac_user_roles (user_id, role_id, vessel_id) VALUES (%L, (SELECT id FROM public.roles WHERE name = 'legal_counsel'), %L)$q$, tests.user_id('A.crew_hyd'), tests.vessel_id('A.hyd')),
                         '42501', 'new row violates row-level security%', 'nor legal_counsel on their own vessel without legal:edit');
SELECT tests.as_user(tests.user_id('A.ua_master_all'));
SELECT tests.ok(public.has_capability('admin.access.users_access.admin', tests.company_id('A')) AND NOT public.user_has_fleet_reach(auth.uid(), tests.company_id('A')),
                'setup: A.ua_master_all is a users-access admin over all vessels without fleet reach');
SELECT tests.throws_like(format($q$INSERT INTO public.rbac_user_roles (user_id, role_id, vessel_id) VALUES (%L, (SELECT id FROM public.roles WHERE name = 'employer_api'), NULL)$q$, tests.user_id('A.crew_hyd')),
                         '42501', 'new row violates row-level security%', 'a rank-60 all-vessels admin without fleet access cannot grant employer_api');
SELECT tests.reset_role();
SELECT tests.ok(NOT public.fleet_reach_for(tests.user_id('A.crew_hyd'), tests.company_id('A')), 'after the refused attempts crew_hyd still has no fleet reach');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format($q$INSERT INTO public.rbac_user_roles (id, user_id, role_id, vessel_id) VALUES (%L, %L, (SELECT id FROM public.roles WHERE name = %L), NULL)$q$, tests.id('rbac:fleet:' || r), tests.user_id('A.crew_hyd'), r),
                   'the DPA (fleet reach) grants ' || r)
FROM unnest(ARRAY['legal_counsel', 'employer_api']) AS r;
SELECT tests.reset_role();
DELETE FROM public.rbac_user_roles WHERE id IN (tests.id('rbac:fleet:legal_counsel'), tests.id('rbac:fleet:employer_api'));

-- ------------------------------------------------------------ policies call only authenticated-executable functions (rule 11)

SELECT tests.ok(bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')),
                format('every function the policies on %s call is executable by authenticated', t.tbl))
FROM (VALUES ('vessels'), ('rbac_user_roles'), ('user_permission_overrides'), ('user_roles'), ('permission_audit_log'), ('roles'), ('role_permissions'),
             ('medical_reports'), ('flight_requests'), ('flight_bookings'), ('planner_periods'), ('work_rest_monthly_submissions'), ('work_rest_blocks'),
             ('notification_logs'), ('support_tickets'), ('admin_action_log')) AS t(tbl)
JOIN pg_policies AS pol ON pol.schemaname = 'public' AND pol.tablename = t.tbl AND 'authenticated' = ANY (pol.roles)
CROSS JOIN LATERAL regexp_matches(coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, ''), '([a-z_][a-z0-9_]*)\(', 'g') AS m
JOIN pg_proc AS p ON p.proname = m[1] AND p.pronamespace IN ('public'::regnamespace, 'auth'::regnamespace)
GROUP BY t.tbl;
SELECT tests.ok(has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE') AND NOT has_function_privilege('service_role', f, 'EXECUTE'),
                f || ': authenticated only')
FROM unnest(ARRAY['public.rbac_user_roles_write_allowed(uuid,uuid,uuid)', 'public.permission_override_write_allowed(uuid,uuid,text,public.permission_level)']) AS f;
SELECT tests.ok(to_regprocedure('public.user_roles_write_allowed(uuid,uuid,public.app_role)') IS NULL, 'user_roles_write_allowed is gone (no browser write path for user_roles)');
SELECT tests.is((SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles' AND cmd <> 'SELECT'), 0::bigint, 'user_roles has no write policy');
SELECT tests.ok(has_function_privilege('authenticated', 'public.has_role_in_company(uuid,public.app_role[],uuid)', 'EXECUTE')
            AND has_function_privilege('service_role', 'public.has_role_in_company(uuid,public.app_role[],uuid)', 'EXECUTE')
            AND NOT has_function_privilege('anon', 'public.has_role_in_company(uuid,public.app_role[],uuid)', 'EXECUTE'), 'has_role_in_company: authenticated + service_role, not anon');
SELECT tests.ok(NOT has_function_privilege(r, f, 'EXECUTE'), f || ' (trigger) is not executable by ' || r)
FROM unnest(ARRAY['public.user_permission_overrides_stamp()', 'public.access_change_audit()']) AS f, unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r;
-- The predicates answer false (not an error) for unknown ids and no caller.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.ok(NOT public.rbac_user_roles_write_allowed(tests.id('user:nobody'), (SELECT id FROM public.roles WHERE name = 'crew'), NULL), 'unknown target: false');
SELECT tests.ok(NOT public.rbac_user_roles_write_allowed(tests.user_id('A.crew_hyd'), tests.id('role:nope'), NULL), 'unknown role: false');
SELECT tests.ok(NOT public.permission_override_write_allowed(tests.user_id('A.crew_hyd'), tests.company_id('B'), 'drills', 'edit'), 'a company that is not the target''s: false');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.ok(NOT public.rbac_user_roles_write_allowed(tests.user_id('A.crew_hyd'), (SELECT id FROM public.roles WHERE name = 'crew'), NULL), 'a disabled caller: false');
SELECT tests.reset_role();

-- ------------------------------------------------------------ vessels: writes admin-only, reads scoped

SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.denied(format($q$UPDATE public.vessels SET name = 'RENAMED' WHERE id = %L RETURNING id$q$, tests.vessel_id('A.dra')), 'the Master cannot update the vessel record');
SELECT tests.throws_like(format($q$INSERT INTO public.vessels (company_id, name) VALUES (%L, 'NEW ONE')$q$, tests.company_id('A')), '42501', 'new row violates row-level security%', 'the Master cannot add a vessel');
SELECT tests.denied(format($q$DELETE FROM public.vessels WHERE id = %L RETURNING id$q$, tests.vessel_id('A.dra')), 'the Master cannot delete a vessel');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.denied(format($q$UPDATE public.vessels SET name = 'RENAMED' WHERE id = %L RETURNING id$q$, tests.vessel_id('A.hyd')), 'crew cannot update their vessel');
SELECT tests.results_eq('SELECT id FROM public.vessels', format('VALUES (%L::uuid)', tests.vessel_id('A.hyd')), 'crew read only the vessel they reach');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.denied(format($q$UPDATE public.vessels SET name = 'RENAMED' WHERE id = %L RETURNING id$q$, tests.vessel_id('A.dra')), 'company B''s admin cannot touch A''s vessel');
SELECT tests.is_empty(format('SELECT 1 FROM public.vessels WHERE company_id = %L', tests.company_id('A')), 'nor read it');
SELECT tests.throws_like(format($q$INSERT INTO public.vessels (company_id, name) VALUES (%L, 'FORGED')$q$, tests.company_id('A')), '42501', 'new row violates row-level security%', 'nor add one to company A');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format($q$UPDATE public.vessels SET name = 'M/Y DRAAK II' WHERE id = %L$q$, tests.vessel_id('A.dra')), 'the fleet admin updates a vessel');
SELECT tests.lives(format($q$INSERT INTO public.vessels (id, company_id, name, status) VALUES (%L, %L, 'NEW HORIZON', 'Active')$q$, tests.id('vessel:new'), tests.company_id('A')), 'the fleet admin adds a vessel');
SELECT tests.is((SELECT code FROM public.vessels WHERE id = tests.id('vessel:new')), 'NEW', 'its code is derived by trg_vessels_set_code (P1)');
SELECT tests.lives(format($q$DELETE FROM public.vessels WHERE id = %L$q$, tests.id('vessel:new')), 'and deletes it');
SELECT tests.is((SELECT count(*) FROM public.vessels), 3::bigint, 'the fleet admin reads every company vessel');
SELECT tests.reset_role();
SELECT tests.as_anon();
SELECT tests.denied('SELECT * FROM public.vessels', 'anon reads no vessel');
SELECT tests.reset_role();

-- ------------------------------------------------------------ roles / role_permissions frozen

DO $$
DECLARE p text;
BEGIN
  FOREACH p IN ARRAY ARRAY['A.fleet_manager', 'A.shore', 'A.master_dra', 'A.crew_hyd'] LOOP
    PERFORM tests.as_user(tests.user_id(p));
    PERFORM tests.throws($q$INSERT INTO public.roles (name, display_name) VALUES ('tenant_role', 'Tenant role')$q$, '42501', p || ': roles insert refused');
    PERFORM tests.throws($q$UPDATE public.roles SET display_name = 'Changed' WHERE name = 'crew'$q$, '42501', p || ': roles update refused');
    PERFORM tests.throws($q$DELETE FROM public.role_permissions WHERE module_key = 'drills'$q$, '42501', p || ': role_permissions delete refused');
    PERFORM tests.throws($q$INSERT INTO public.role_permissions (role_id, module_key, permission) SELECT id, 'settings', 'admin' FROM public.roles WHERE name = 'crew'$q$, '42501', p || ': role_permissions insert refused');
    PERFORM tests.ok((SELECT count(*) FROM public.roles) > 0, p || ': roles are still readable');
  END LOOP;
END
$$;
SELECT tests.reset_role();
SELECT tests.as_service();
SELECT tests.lives($q$UPDATE public.roles SET description = coalesce(description, '') WHERE name = 'crew'$q$, 'the service role still maintains role definitions');
SELECT tests.reset_role();
SELECT tests.ok(EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'roles' AND policyname = 'roles_write_service' AND roles = '{service_role}'), 'roles_write_service is TO service_role only');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename IN ('roles', 'role_permissions') AND cmd <> 'SELECT' AND roles <> '{service_role}'), 'no tenant write policy remains on roles / role_permissions');

-- ------------------------------------------------------------ legacy user_roles rows without a company (20261123010500 backfill)

-- Re-running the file on legacy rows: a company-less row of a tenant role is
-- given its user's profile company (one per user / role / vessel, so
-- duplicates never collide); a company-less superadmin row stays platform-wide.
INSERT INTO public.user_roles (id, user_id, role, company_id, vessel_id, is_active) VALUES
  (tests.id('ur:legacy:captain:1'), tests.user_id('A.master_dra'), 'captain', NULL, tests.vessel_id('A.dra'), true),
  (tests.id('ur:legacy:captain:2'), tests.user_id('A.master_dra'), 'captain', NULL, tests.vessel_id('A.dra'), true),
  (tests.id('ur:legacy:fm'), tests.user_id('A.master_dra'), 'fleet_master', NULL, NULL, true),
  (tests.id('ur:legacy:sa'), tests.user_id('A.master_dra'), 'superadmin', NULL, NULL, true);
SELECT tests.ok(NOT public.has_role_in_company(tests.user_id('A.master_dra'), ARRAY['fleet_master']::public.app_role[], tests.company_id('A')), 'before the backfill a company-less fleet_master row counts for no company');
\i supabase/migrations/20261123010500_platform_role_scoped_policies.sql
SELECT tests.results_eq(
  format($q$SELECT role::text, count(*) FILTER (WHERE company_id = %L), count(*) FILTER (WHERE company_id IS NULL) FROM public.user_roles WHERE id IN (%L, %L, %L, %L) GROUP BY role$q$,
         tests.company_id('A'), tests.id('ur:legacy:captain:1'), tests.id('ur:legacy:captain:2'), tests.id('ur:legacy:fm'), tests.id('ur:legacy:sa')),
  $q$VALUES ('captain', 1::bigint, 1::bigint), ('fleet_master', 1, 0), ('superadmin', 0, 1)$q$,
  'the backfill gives tenant roles the profile company (one of two duplicates), never a superadmin row');
SELECT tests.ok(public.has_role_in_company(tests.user_id('A.master_dra'), ARRAY['fleet_master']::public.app_role[], tests.company_id('A')), 'after it the legacy holder keeps the role in their own company');
SELECT tests.ok(NOT public.has_role_in_company(tests.user_id('A.master_dra'), ARRAY['fleet_master', 'captain']::public.app_role[], tests.company_id('B')), 'and gains nothing in company B');
