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

-- ------------------------------------------------------------ user_roles (CC-5)

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format($q$INSERT INTO public.user_roles (user_id, role, company_id) VALUES (%L, 'crew', %L)$q$, tests.user_id('B.crew'), tests.company_id('B')), '42501', 'new row violates row-level security%', 'a company-A DPA cannot grant a role to a company-B user');
SELECT tests.throws_like(format($q$INSERT INTO public.user_roles (user_id, role, company_id) VALUES (%L, 'crew', %L)$q$, tests.user_id('A.crew_hyd'), tests.company_id('B')), '42501', 'new row violates row-level security%', 'a row naming another company is refused');
SELECT tests.throws_like(format($q$INSERT INTO public.user_roles (user_id, role, company_id) VALUES (%L, 'crew', NULL)$q$, tests.user_id('A.master_dra')), '42501', 'new row violates row-level security%', 'a row without a company is refused');
SELECT tests.throws_like(format($q$INSERT INTO public.user_roles (user_id, role, company_id) VALUES (%L, 'superadmin', %L)$q$, tests.user_id('A.master_dra'), tests.company_id('A')), '42501', 'new row violates row-level security%', 'superadmin is never granted by a tenant');
SELECT tests.throws_like(format($q$INSERT INTO public.user_roles (user_id, role, company_id) VALUES (%L, 'captain', %L)$q$, tests.user_id('A.fleet_manager'), tests.company_id('A')), '42501', 'new row violates row-level security%', 'no grant to yourself');
SELECT tests.lives(format($q$INSERT INTO public.user_roles (id, user_id, role, company_id) VALUES (%L, %L, 'captain', %L)$q$, tests.id('ur:new_captain'), tests.user_id('A.master_dra'), tests.company_id('A')), 'the DPA grants captain to a colleague (the predicate runs for authenticated)');
SELECT tests.is_empty(format('SELECT 1 FROM public.user_roles WHERE company_id = %L', tests.company_id('B')), 'the A DPA reads none of company B''s user_roles rows');
SELECT tests.denied(format($q$UPDATE public.user_roles SET is_active = false WHERE user_id = %L RETURNING id$q$, tests.user_id('B.crew')), 'the A DPA cannot update a company-B row');
SELECT tests.denied(format($q$DELETE FROM public.user_roles WHERE user_id = %L RETURNING id$q$, tests.user_id('B.crew')), 'the A DPA cannot delete a company-B row');
SELECT tests.lives(format($q$UPDATE public.user_roles SET is_active = false WHERE id = %L$q$, tests.id('ur:new_captain')), 'the DPA revokes (useRevokeRole sets is_active false)');
SELECT tests.ok((SELECT count(*) FROM public.user_roles WHERE company_id = tests.company_id('A')) >= 2, 'the DPA reads company A''s rows');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.permission_audit_log WHERE target_user_id = tests.user_id('A.master_dra') AND actor_user_id = tests.user_id('A.fleet_manager') AND action_type IN ('role_assigned', 'role_removed') AND after_state ->> 'app_role' = 'captain'), 2::bigint, 'user_roles grant and revoke are audited with actor = auth.uid()');
-- Rank cap: a users-access admin of rank 10 grants crew, not captain.
SELECT tests.as_user(tests.user_id('A.ua_admin'));
SELECT tests.lives(format($q$INSERT INTO public.user_roles (user_id, role, company_id) VALUES (%L, 'crew', %L)$q$, tests.user_id('A.master_dra'), tests.company_id('A')), 'a rank-10 admin grants crew');
SELECT tests.throws_like(format($q$INSERT INTO public.user_roles (user_id, role, company_id) VALUES (%L, 'captain', %L)$q$, tests.user_id('A.crew_hyd'), tests.company_id('A')), '42501', 'new row violates row-level security%', 'never a role ranked above your own');
-- Non-admins.
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(format($q$INSERT INTO public.user_roles (user_id, role, company_id) VALUES (%L, 'crew', %L)$q$, tests.user_id('A.crew_hyd'), tests.company_id('A')), '42501', 'new row violates row-level security%', 'a Master cannot grant app roles');
SELECT tests.is((SELECT count(*) FROM public.user_roles WHERE user_id = auth.uid()), 2::bigint, 'a user still reads their own user_roles rows');
SELECT tests.is_empty(format('SELECT 1 FROM public.user_roles WHERE user_id = %L', tests.user_id('A.crew_hyd')), 'a non-admin reads nobody else''s rows');
-- A dpa row that names company A does not make a company-B user an admin of A.
SELECT tests.seed_user_role('B.crew', 'dpa', 'A');
SELECT tests.as_user(tests.user_id('B.crew'));
SELECT tests.throws_like(format($q$INSERT INTO public.user_roles (user_id, role, company_id) VALUES (%L, 'crew', %L)$q$, tests.user_id('A.crew_hyd'), tests.company_id('A')), '42501', 'new row violates row-level security%', 'a forged dpa row naming company A grants nothing in A');
SELECT tests.is_empty(format('SELECT 1 FROM public.user_roles WHERE company_id = %L AND user_id <> auth.uid()', tests.company_id('A')), 'nor any read of A''s rows');
SELECT tests.reset_role();

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
-- Rank cap: shore management (80) assigns fleet_master (80), not dpa (90).
SELECT tests.as_user(tests.user_id('A.shore'));
SELECT tests.lives(format($q$INSERT INTO public.rbac_user_roles (user_id, role_id) VALUES (%L, (SELECT id FROM public.roles WHERE name = 'fleet_master'))$q$, tests.user_id('A.master_dra')), 'rank 80 assigns a rank-80 role');
SELECT tests.throws_like(format($q$INSERT INTO public.rbac_user_roles (user_id, role_id) VALUES (%L, (SELECT id FROM public.roles WHERE name = 'dpa'))$q$, tests.user_id('A.master_dra')), '42501', 'new row violates row-level security%', 'not a role ranked above your own');
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

-- ------------------------------------------------------------ policies call only authenticated-executable functions (rule 11)

SELECT tests.ok(bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')),
                format('every function the policies on %s call is executable by authenticated', t.tbl))
FROM (VALUES ('vessels'), ('rbac_user_roles'), ('user_permission_overrides'), ('user_roles'), ('permission_audit_log'), ('roles'), ('role_permissions')) AS t(tbl)
JOIN pg_policies AS pol ON pol.schemaname = 'public' AND pol.tablename = t.tbl AND 'authenticated' = ANY (pol.roles)
CROSS JOIN LATERAL regexp_matches(coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, ''), '([a-z_][a-z0-9_]*)\(', 'g') AS m
JOIN pg_proc AS p ON p.proname = m[1] AND p.pronamespace IN ('public'::regnamespace, 'auth'::regnamespace)
GROUP BY t.tbl;
SELECT tests.ok(has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE') AND NOT has_function_privilege('service_role', f, 'EXECUTE'),
                f || ': authenticated only')
FROM unnest(ARRAY['public.rbac_user_roles_write_allowed(uuid,uuid,uuid)', 'public.permission_override_write_allowed(uuid,uuid,text,public.permission_level)', 'public.user_roles_write_allowed(uuid,uuid,public.app_role)']) AS f;
SELECT tests.ok(NOT has_function_privilege(r, f, 'EXECUTE'), f || ' (trigger) is not executable by ' || r)
FROM unnest(ARRAY['public.user_permission_overrides_stamp()', 'public.access_change_audit()']) AS f, unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r;
-- The predicates answer false (not an error) for unknown ids and no caller.
SELECT tests.ok(NOT public.user_roles_write_allowed(tests.user_id('A.crew_hyd'), tests.company_id('A'), 'crew'), 'no caller: user_roles_write_allowed false');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.ok(NOT public.rbac_user_roles_write_allowed(tests.id('user:nobody'), (SELECT id FROM public.roles WHERE name = 'crew'), NULL), 'unknown target: false');
SELECT tests.ok(NOT public.rbac_user_roles_write_allowed(tests.user_id('A.crew_hyd'), tests.id('role:nope'), NULL), 'unknown role: false');
SELECT tests.ok(NOT public.permission_override_write_allowed(tests.user_id('A.crew_hyd'), tests.company_id('B'), 'drills', 'edit'), 'a company that is not the target''s: false');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.ok(NOT public.user_roles_write_allowed(tests.user_id('A.crew_hyd'), tests.company_id('A'), 'crew'), 'a disabled caller: false');
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
