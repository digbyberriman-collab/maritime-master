-- Access to the expiry engine's tables and views
-- (20261124040000_fleet_expiry_engine.sql; D-X5-01, D-X5-02, D-55, D-157):
-- expiry_window_rules is readable only by active members of the row's
-- company and writable by no role directly (set_expiry_window_rule /
-- clear_expiry_window_rule only, gated by fleet reach and reports admin,
-- with their refusals); expiry_sources and every expiry_src_* view are
-- unreadable for authenticated and anon and readable for the service role.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user('A', 'A.reports_admin', 'crew');
SELECT tests.seed_role('x5_reports_admin', 'fleet');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'reports', 'admin', 'fleet' FROM public.roles AS r WHERE r.name = 'x5_reports_admin';
SELECT tests.seed_rbac_role('A.reports_admin', 'x5_reports_admin');

INSERT INTO public.expiry_window_rules (id, company_id, item_type, certificate_type_id, warn_days) VALUES
  (tests.id('ewr:A.passport'), tests.company_id('A'), 'passport', NULL, 200),
  (tests.id('ewr:A.cert'), tests.company_id('A'), 'vessel_certificate', NULL, 60),
  (tests.id('ewr:B.cert'), tests.company_id('B'), 'vessel_certificate', NULL, 45);

-- ------------------------------------------------------------ RLS and grants on the tables

SELECT tests.ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.expiry_window_rules'::regclass)
                AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.expiry_sources'::regclass), 'RLS is on for both tables');
SELECT tests.results_eq(
  $q$SELECT tablename::text, policyname::text, cmd::text, roles::text FROM pg_policies WHERE tablename IN ('expiry_window_rules', 'expiry_sources')$q$,
  $q$VALUES ('expiry_sources'::text, 'expiry_sources_service_all'::text, 'ALL'::text, '{service_role}'::text),
            ('expiry_window_rules', 'expiry_window_rules_select', 'SELECT', '{authenticated}')$q$,
  'policies: one read policy for members, one service-role policy for the registry, no browser write policy');
SELECT tests.ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_expiry_window_rules_updated_at' AND tgrelid = 'public.expiry_window_rules'::regclass),
                'expiry_window_rules keeps updated_at');
SELECT tests.ok(has_table_privilege('authenticated', 'public.expiry_window_rules', 'SELECT')
                AND NOT has_table_privilege('authenticated', 'public.expiry_window_rules', 'INSERT')
                AND NOT has_table_privilege('authenticated', 'public.expiry_window_rules', 'UPDATE')
                AND NOT has_table_privilege('authenticated', 'public.expiry_window_rules', 'DELETE'),
                'expiry_window_rules: authenticated may only SELECT');
SELECT tests.ok(NOT has_table_privilege('authenticated', 'public.expiry_sources', 'SELECT') AND NOT has_table_privilege('authenticated', 'public.expiry_sources', 'INSERT'),
                'expiry_sources: no browser privilege');
SELECT tests.ok(obj_description('public.expiry_window_rules'::regclass, 'pg_class') IS NOT NULL AND obj_description('public.expiry_sources'::regclass, 'pg_class') IS NOT NULL,
                'both tables are commented');

-- ------------------------------------------------------------ reads: active members of the row's company only

SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.results_eq('SELECT id FROM public.expiry_window_rules', format($q$VALUES (%L::uuid), (%L::uuid)$q$, tests.id('ewr:A.passport'), tests.id('ewr:A.cert')),
                        'a crew member of A reads A''s windows');
SELECT tests.is_empty(format($q$SELECT 1 FROM public.expiry_window_rules WHERE company_id = %L$q$, tests.company_id('B')), 'and none of B''s');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.results_eq('SELECT id FROM public.expiry_window_rules', format($q$VALUES (%L::uuid)$q$, tests.id('ewr:B.cert')), 'B''s admin reads only B''s window');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is_empty('SELECT 1 FROM public.expiry_window_rules', 'a disabled member reads nothing');
SELECT tests.as_anon();
SELECT tests.denied('SELECT * FROM public.expiry_window_rules', 'anon reads nothing');
SELECT tests.reset_role();

-- ------------------------------------------------------------ no direct writes, for any role

DO $$
DECLARE p text;
BEGIN
  FOR p IN SELECT unnest(ARRAY['A.fleet_manager', 'A.reports_admin', 'A.crew_hyd', 'B.admin']) LOOP
    PERFORM tests.as_user(tests.user_id(p));
    PERFORM tests.denied(format($q$INSERT INTO public.expiry_window_rules (company_id, item_type, warn_days) VALUES (%L, 'visa', 10) RETURNING id$q$, tests.company_id('A')),
                         p || ': no direct insert');
    PERFORM tests.denied(format($q$UPDATE public.expiry_window_rules SET warn_days = 1 WHERE id = %L RETURNING id$q$, tests.id('ewr:A.cert')), p || ': no direct update');
    PERFORM tests.denied(format($q$DELETE FROM public.expiry_window_rules WHERE id = %L RETURNING id$q$, tests.id('ewr:A.cert')), p || ': no direct delete');
  END LOOP;
END
$$;
SELECT tests.as_anon();
SELECT tests.denied(format($q$INSERT INTO public.expiry_window_rules (company_id, item_type, warn_days) VALUES (%L, 'visa', 10) RETURNING id$q$, tests.company_id('A')), 'anon: no direct insert');
SELECT tests.reset_role();
SELECT tests.is((SELECT warn_days FROM public.expiry_window_rules WHERE id = tests.id('ewr:A.cert')), 60, 'the rule is unchanged');

-- ------------------------------------------------------------ set_expiry_window_rule

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
CREATE TEMP TABLE set1 ON COMMIT DROP AS SELECT * FROM public.set_expiry_window_rule('crew_document', NULL, 120);
CREATE TEMP TABLE set2 ON COMMIT DROP AS SELECT * FROM public.set_expiry_window_rule('crew_document', NULL, 100);
CREATE TEMP TABLE set3 ON COMMIT DROP AS SELECT * FROM public.set_expiry_window_rule('crew_document', tests.id('doctype:yellow_fever'), 20);
SELECT tests.reset_role();
GRANT SELECT ON set1, set2, set3 TO PUBLIC;
SELECT tests.ok((SELECT company_id = tests.company_id('A') AND item_type = 'crew_document' AND certificate_type_id IS NULL AND warn_days = 120
                        AND created_by = tests.user_id('A.fleet_manager') AND updated_by = tests.user_id('A.fleet_manager') FROM set1),
                'set: a new item rule in the caller''s company, with actor stamps, returned');
SELECT tests.ok((SELECT s2.id = s1.id AND s2.warn_days = 100 FROM set1 AS s1, set2 AS s2), 'set: the same item rule is updated in place (one row per item type)');
SELECT tests.ok((SELECT s3.id <> s1.id AND s3.certificate_type_id = tests.id('doctype:yellow_fever') AND s3.warn_days = 20 FROM set1 AS s1, set3 AS s3),
                'set: a type rule is its own row');
SELECT tests.is((SELECT count(*) FROM public.expiry_window_rules WHERE company_id = tests.company_id('A') AND item_type = 'crew_document'), 2::bigint, 'set: two crew-document rules stored');
SELECT tests.is(public.expiry_window_for(tests.company_id('A'), 'crew_document', tests.id('doctype:yellow_fever')), 20, 'set: the window engine reads the new type rule');

SELECT tests.as_user(tests.user_id('A.reports_admin'));
SELECT tests.lives($q$SELECT public.set_expiry_window_rule('visa', NULL, 60)$q$, 'set: a fleet-wide reports admin (RBAC) may set windows');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like($q$SELECT public.set_expiry_window_rule('medical_certificate', NULL, 60)$q$, '22023', 'invalid_item_type', 'set: an unknown item type is refused');
SELECT tests.throws_like($q$SELECT public.set_expiry_window_rule(NULL, NULL, 60)$q$, '22023', 'invalid_item_type', 'set: no item type is refused');
SELECT tests.throws_like($q$SELECT public.set_expiry_window_rule('visa', NULL, 1096)$q$, '22023', 'invalid_warn_days', 'set: more than 1095 days is refused');
SELECT tests.throws_like($q$SELECT public.set_expiry_window_rule('visa', NULL, -1)$q$, '22023', 'invalid_warn_days', 'set: a negative window is refused');
SELECT tests.throws_like($q$SELECT public.set_expiry_window_rule('visa', NULL, NULL)$q$, '22023', 'invalid_warn_days', 'set: no window is refused');
SELECT tests.lives($q$SELECT public.set_expiry_window_rule('visa', NULL, 0)$q$, 'set: a zero window is allowed');
SELECT tests.lives($q$SELECT public.set_expiry_window_rule('visa', NULL, 1095)$q$, 'set: 1095 days is allowed');
DO $$
DECLARE p text;
BEGIN
  FOR p IN SELECT unnest(ARRAY['A.master_dra', 'A.crew_hyd', 'A.disabled']) LOOP
    PERFORM tests.as_user(tests.user_id(p));
    PERFORM tests.throws_like($q$SELECT public.set_expiry_window_rule('visa', NULL, 30)$q$, '42501', 'not_permitted', p || ': set is refused');
    PERFORM tests.throws_like(format($q$SELECT public.clear_expiry_window_rule(%L)$q$, tests.id('ewr:A.cert')), '42501', 'not_permitted', p || ': clear is refused');
  END LOOP;
END
$$;
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.lives($q$SELECT public.set_expiry_window_rule('passport', NULL, 365)$q$, 'set: B''s admin sets B''s window');
SELECT tests.as_anon();
SELECT tests.throws($q$SELECT public.set_expiry_window_rule('visa', NULL, 30)$q$, '42501', 'set: anon cannot execute it');
SELECT tests.reset_role();
SELECT tests.is((SELECT warn_days FROM public.expiry_window_rules WHERE company_id = tests.company_id('A') AND item_type = 'passport' AND certificate_type_id IS NULL), 200,
                'set: B''s write landed in B, never in A (the company is the caller''s)');
SELECT tests.is((SELECT warn_days FROM public.expiry_window_rules WHERE company_id = tests.company_id('B') AND item_type = 'passport'), 365, 'set: B''s passport rule');

-- ------------------------------------------------------------ clear_expiry_window_rule

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format($q$SELECT public.clear_expiry_window_rule(%L)$q$, tests.id('ewr:A.cert')), 'clear: the fleet manager clears A''s certificate rule');
SELECT tests.throws_like(format($q$SELECT public.clear_expiry_window_rule(%L)$q$, tests.id('ewr:A.cert')), 'P0002', 'rule_not_found', 'clear: twice is not found');
SELECT tests.throws_like(format($q$SELECT public.clear_expiry_window_rule(%L)$q$, tests.id('ewr:B.cert')), 'P0002', 'rule_not_found', 'clear: another company''s rule reads as not found');
SELECT tests.throws_like(format($q$SELECT public.clear_expiry_window_rule(%L)$q$, tests.id('ewr:nowhere')), 'P0002', 'rule_not_found', 'clear: an unknown id is not found');
SELECT tests.throws_like('SELECT public.clear_expiry_window_rule(NULL)', '22023', 'rule_required', 'clear: an id is required');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.expiry_window_rules WHERE id = tests.id('ewr:A.cert')), 0::bigint, 'clear: A''s rule is gone');
SELECT tests.is((SELECT warn_days FROM public.expiry_window_rules WHERE id = tests.id('ewr:B.cert')), 45, 'clear: B''s rule is untouched');
SELECT tests.is(public.expiry_window_for(tests.company_id('A'), 'vessel_certificate'), 90, 'clear: A''s certificates fall back to the default');

-- ------------------------------------------------------------ the registry and the source views

CREATE TEMP TABLE src_view ON COMMIT DROP AS
SELECT view_name FROM public.expiry_sources WHERE owner_doc = 'gap/02';
GRANT SELECT ON src_view TO PUBLIC;
SELECT tests.is((SELECT count(*) FROM src_view), 8::bigint, 'the eight legacy source views');
SELECT tests.ok(coalesce((SELECT reloptions @> ARRAY['security_invoker=true'] FROM pg_class WHERE oid = to_regclass('public.' || v.view_name)), false),
                format('%s is security_invoker', v.view_name))
FROM src_view AS v ORDER BY v.view_name;
SELECT tests.ok(obj_description(to_regclass('public.' || v.view_name), 'pg_class') IS NOT NULL, format('%s is commented', v.view_name))
FROM src_view AS v ORDER BY v.view_name;

DO $$
DECLARE p text; v text;
BEGIN
  FOR p IN SELECT unnest(ARRAY['A.fleet_manager', 'A.crew_hyd', 'B.admin']) LOOP
    PERFORM tests.as_user(tests.user_id(p));
    PERFORM tests.denied('SELECT * FROM public.expiry_sources', p || ': expiry_sources is unreadable');
    PERFORM tests.denied($q$INSERT INTO public.expiry_sources (source_key, item_type, label, view_name, read_area, owner_doc) VALUES ('mine', 'visa', 'Mine', 'expiry_src_mine', 'hr', 'gap/02') RETURNING source_key$q$,
                         p || ': expiry_sources is not writable');
    FOR v IN SELECT view_name FROM src_view ORDER BY view_name LOOP
      PERFORM tests.denied(format('SELECT * FROM public.%I', v), format('%s: %s is unreadable', p, v));
    END LOOP;
  END LOOP;
  PERFORM tests.as_anon();
  PERFORM tests.denied('SELECT * FROM public.expiry_sources', 'anon: expiry_sources is unreadable');
  FOR v IN SELECT view_name FROM src_view ORDER BY view_name LOOP
    PERFORM tests.denied(format('SELECT * FROM public.%I', v), format('anon: %s is unreadable', v));
  END LOOP;
END
$$;
SELECT tests.reset_role();

SELECT tests.as_service();
SELECT tests.is((SELECT count(*) FROM public.expiry_sources WHERE owner_doc = 'gap/02'), 8::bigint, 'the service role reads the registry');
SELECT tests.lives('SELECT count(*) FROM public.expiry_src_vessel_certificates', 'the service role reads a source view');
SELECT tests.lives($q$UPDATE public.expiry_sources SET sort_order = sort_order WHERE source_key = 'vessel_certificates'$q$, 'the service role writes the registry');
SELECT tests.reset_role();
