-- Admin action log (20261123010400; gap/01 F6, W7): company-scoped reads
-- (permission-audit viewers of the row's company), no browser write path,
-- company_id filled from the target (else the actor) on insert.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user_role('B.admin', 'dpa', 'B');
SELECT tests.seed_user_role('A.fleet_manager', 'dpa', 'A');

-- The TOGGLE_ACCESS row set_membership_status writes (with the reason).
SELECT tests.as_service();
SELECT public.set_membership_status(tests.user_id('A.crew_hyd'), 'disabled', tests.user_id('A.fleet_manager'), 'Medical leave');
-- A service-role insert without a company (admin-actions writes this way).
INSERT INTO public.admin_action_log (id, actor_user_id, action_type, target_user_id, reason)
VALUES (tests.id('aal:reset'), tests.user_id('A.fleet_manager'), 'RESET_ACCOUNT', tests.user_id('A.master_dra'), NULL);
INSERT INTO public.admin_action_log (id, actor_user_id, action_type, target_crew_id)
VALUES (tests.id('aal:crew'), tests.user_id('B.admin'), 'REALLOCATE_VESSEL', tests.profile_id('B.admin'));
INSERT INTO public.admin_action_log (id, actor_user_id, action_type)
VALUES (tests.id('aal:actor'), tests.user_id('B.admin'), 'SET_PIN');
SELECT tests.reset_role();

SELECT tests.is((SELECT company_id FROM public.admin_action_log WHERE action_type = 'TOGGLE_ACCESS' AND target_user_id = tests.user_id('A.crew_hyd')), tests.company_id('A'), 'the TOGGLE_ACCESS row carries the target''s company');
SELECT tests.is((SELECT company_id FROM public.admin_action_log WHERE id = tests.id('aal:reset')), tests.company_id('A'), 'a service-role insert without company_id gets the target''s company');
SELECT tests.is((SELECT company_id FROM public.admin_action_log WHERE id = tests.id('aal:crew')), tests.company_id('B'), 'target_crew_id resolves through the profile id');
SELECT tests.is((SELECT company_id FROM public.admin_action_log WHERE id = tests.id('aal:actor')), tests.company_id('B'), 'no target: the actor''s company');
-- A writer that passes a company keeps it.
INSERT INTO public.admin_action_log (id, actor_user_id, action_type, target_user_id, company_id)
VALUES (tests.id('aal:given'), tests.user_id('A.fleet_manager'), 'SET_PIN', tests.user_id('A.master_dra'), tests.company_id('A'));
SELECT tests.is((SELECT company_id FROM public.admin_action_log WHERE id = tests.id('aal:given')), tests.company_id('A'), 'a given company is kept');

-- Reads: permission-audit viewers of the row's company only.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.ok(public.has_capability('admin.access.permission_audit_log.view', tests.company_id('A')), 'the A DPA is a permission-audit viewer of A');
SELECT tests.is((SELECT reason FROM public.admin_action_log WHERE action_type = 'TOGGLE_ACCESS' AND target_user_id = tests.user_id('A.crew_hyd')), 'Medical leave', 'A.fleet_manager sees A''s TOGGLE_ACCESS row written by set_membership_status');
SELECT tests.is_empty(format('SELECT 1 FROM public.admin_action_log WHERE company_id IS DISTINCT FROM %L', tests.company_id('A')), 'and none of company B''s rows');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.ok(public.has_any_role(auth.uid(), ARRAY['dpa']::public.app_role[]), 'B.admin holds a user_roles dpa row (of B)');
SELECT tests.is_empty(format('SELECT 1 FROM public.admin_action_log WHERE company_id = %L', tests.company_id('A')), 'B.admin with a user_roles dpa row of B sees none of A''s rows');
SELECT tests.is_empty('SELECT 1 FROM public.admin_action_log WHERE reason = ''Medical leave''', 'nor the disable reason');
SELECT tests.ok((SELECT count(*) FROM public.admin_action_log) >= 2, 'B.admin reads company B''s rows');
-- No browser write path: a forged row is refused with 42501.
SELECT tests.throws(format($q$INSERT INTO public.admin_action_log (actor_user_id, action_type, target_user_id, reason) VALUES (%L, 'TOGGLE_ACCESS', %L, 'forged by company B')$q$,
                    tests.user_id('A.fleet_manager'), tests.user_id('A.master_dra')), '42501', 'a forged INSERT is refused');
SELECT tests.throws(format($q$INSERT INTO public.admin_action_log (actor_user_id, action_type, company_id) VALUES (%L, 'SET_PIN', %L)$q$,
                    tests.user_id('B.admin'), tests.company_id('B')), '42501', 'even of a row naming the caller and their own company');
SELECT tests.denied(format($q$UPDATE public.admin_action_log SET reason = 'x' WHERE id = %L RETURNING id$q$, tests.id('aal:crew')), 'no UPDATE');
SELECT tests.denied(format($q$DELETE FROM public.admin_action_log WHERE id = %L RETURNING id$q$, tests.id('aal:crew')), 'no DELETE');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is_empty('SELECT 1 FROM public.admin_action_log', 'a disabled crew member reads nothing');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is_empty('SELECT 1 FROM public.admin_action_log', 'a Master (no audit capability) reads nothing, not even rows about themselves');
SELECT tests.as_anon();
SELECT tests.denied('SELECT * FROM public.admin_action_log', 'anon is denied');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.admin_action_log WHERE reason LIKE 'forged%'), 0::bigint, 'no forged row persisted');

-- Grants and policies.
SELECT tests.ok(NOT has_table_privilege('anon', 'public.admin_action_log', r) AND NOT (r <> 'SELECT' AND has_table_privilege('authenticated', 'public.admin_action_log', r)),
                format('%s: anon none, authenticated SELECT only', r))
FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS r;
SELECT tests.results_eq($q$SELECT policyname::text, cmd::text FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_action_log'$q$,
                        $q$VALUES ('admin_action_log_select', 'SELECT')$q$, 'one policy: admin_action_log_select (the legacy DPA policies are gone)');
SELECT tests.ok(NOT has_function_privilege(r, 'public.admin_action_log_stamp_company()', 'EXECUTE'), 'the stamp trigger function is not executable by ' || r)
FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r;
