-- The who-did-it columns of an access change are the server's (review
-- round 5, actor-columns-client-forgeable; D-230): rbac_user_roles
-- assigned_by / assigned_at are stamped by trg_rbac_user_roles_stamp on a
-- signed-in insert (the caller and now(), whatever the client sends) and
-- never change on an update; without a JWT the given values are kept. The
-- permission audit log keeps recording the real actor. Ports scratchpad
-- r4sec/a6_assigned_by_forgery.sql and verify-a6-extra.sql (the vessel
-- archive stamp is in p1_vessel_tenancy/triggers.test.sql).

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ a signed-in insert is stamped to the caller

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
INSERT INTO public.rbac_user_roles (id, user_id, role_id, vessel_id, assigned_by, assigned_at)
VALUES (tests.id('rbac:forged'), tests.user_id('A.crew_hyd'), (SELECT id FROM public.roles WHERE name = 'officer'), tests.vessel_id('A.hyd'),
        tests.user_id('B.admin'), '2020-01-01T00:00:00Z');
INSERT INTO public.rbac_user_roles (id, user_id, role_id, vessel_id)
VALUES (tests.id('rbac:plain'), tests.user_id('A.crew_hyd'), (SELECT id FROM public.roles WHERE name = 'crew'), tests.vessel_id('A.hyd'));
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT assigned_by, assigned_at = now() FROM public.rbac_user_roles WHERE id = %L$q$, tests.id('rbac:forged')),
  format($q$VALUES (%L::uuid, true)$q$, tests.user_id('A.fleet_manager')),
  'a forged assigned_by (another tenant''s user) and assigned_at are stamped to the caller and now()');
SELECT tests.results_eq(
  format($q$SELECT assigned_by, assigned_at = now() FROM public.rbac_user_roles WHERE id = %L$q$, tests.id('rbac:plain')),
  format($q$VALUES (%L::uuid, true)$q$, tests.user_id('A.fleet_manager')),
  'an insert without the actor columns is stamped too');

-- ------------------------------------------------------------ an update never changes them

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
UPDATE public.rbac_user_roles SET assigned_by = tests.user_id('B.admin'), assigned_at = '1999-01-01T00:00:00Z', department = 'Deck'
 WHERE id = tests.id('rbac:forged');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT assigned_by, assigned_at = now(), department FROM public.rbac_user_roles WHERE id = %L$q$, tests.id('rbac:forged')),
  format($q$VALUES (%L::uuid, true, 'Deck'::text)$q$, tests.user_id('A.fleet_manager')),
  'an update cannot rewrite assigned_by / assigned_at (other columns still change)');
-- Not even without a JWT: the stored values stay.
UPDATE public.rbac_user_roles SET assigned_by = tests.user_id('B.admin') WHERE id = tests.id('rbac:forged');
SELECT tests.is((SELECT assigned_by FROM public.rbac_user_roles WHERE id = tests.id('rbac:forged')), tests.user_id('A.fleet_manager'),
                'nor a service-role update');

-- ------------------------------------------------------------ without a JWT the given values are kept

INSERT INTO public.rbac_user_roles (id, user_id, role_id, assigned_by, assigned_at)
VALUES (tests.id('rbac:svc'), tests.user_id('A.crew_hyd'), (SELECT id FROM public.roles WHERE name = 'crew'), tests.user_id('A.fleet_manager'), '2025-06-01T00:00:00Z');
SELECT tests.results_eq(
  format($q$SELECT assigned_by, assigned_at FROM public.rbac_user_roles WHERE id = %L$q$, tests.id('rbac:svc')),
  format($q$VALUES (%L::uuid, '2025-06-01T00:00:00Z'::timestamptz)$q$, tests.user_id('A.fleet_manager')),
  'a service-role / maintenance insert keeps the given values');

-- ------------------------------------------------------------ the audit log still names the real actor

SELECT tests.ok((SELECT bool_and(actor_user_id = tests.user_id('A.fleet_manager')) FROM public.permission_audit_log WHERE target_user_id = tests.user_id('A.crew_hyd')),
                'permission_audit_log records the real actor for every change');
SELECT tests.ok((SELECT count(*) FROM public.permission_audit_log WHERE target_user_id = tests.user_id('A.crew_hyd')) >= 3,
                'and logged the signed-in inserts and the update');

-- ------------------------------------------------------------ ACL

SELECT tests.ok(NOT has_function_privilege('authenticated', 'public.rbac_user_roles_stamp()', 'EXECUTE')
                AND NOT has_function_privilege('service_role', 'public.rbac_user_roles_stamp()', 'EXECUTE')
                AND NOT has_function_privilege('anon', 'public.rbac_user_roles_stamp()', 'EXECUTE'),
                'rbac_user_roles_stamp is executable by nobody (a trigger function)');
SELECT tests.ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.rbac_user_roles'::regclass AND tgname = 'trg_rbac_user_roles_stamp' AND (tgtype & 2) <> 0),
                'trg_rbac_user_roles_stamp is a BEFORE trigger on rbac_user_roles');
