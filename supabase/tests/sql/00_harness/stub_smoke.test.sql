-- Smoke test of the harness itself (Phase 2 spec §D.6): the Supabase stub
-- (roles, JWT helpers, default grants, storage, extensions, cron, realtime)
-- and the test library. Runs inside the harness's rolled-back transaction.

-- ------------------------------------------------------------ JWT helpers, no caller
SELECT tests.ok(auth.uid() IS NULL, 'auth.uid() is NULL without claims (SQL editor, migrations)');
SELECT tests.ok(auth.role() IS NULL, 'auth.role() is NULL without claims');
SELECT tests.is(current_user::text, 'postgres', 'the file starts as the superuser');

-- claims-only path (PostgREST >= 10 sets request.jwt.claims, not request.jwt.claim.sub)
SELECT set_config('request.jwt.claims', json_build_object('sub', tests.user_id('claims.only'), 'role', 'authenticated', 'email', 'claims-only@example.test')::text, true);
SELECT tests.is(auth.uid(), tests.user_id('claims.only'), 'auth.uid() reads sub from request.jwt.claims');
SELECT tests.is(auth.role(), 'authenticated', 'auth.role() reads role from request.jwt.claims');
SELECT tests.is(auth.email(), 'claims-only@example.test', 'auth.email() reads email from request.jwt.claims');
SELECT tests.is(auth.jwt() ->> 'sub', tests.user_id('claims.only')::text, 'auth.jwt() returns the claims');
-- the legacy per-claim setting wins, as in Supabase
SELECT set_config('request.jwt.claim.sub', tests.user_id('legacy.claim')::text, true);
SELECT tests.is(auth.uid(), tests.user_id('legacy.claim'), 'request.jwt.claim.sub takes precedence over request.jwt.claims');
SELECT tests.reset_role();
SELECT tests.ok(auth.uid() IS NULL AND auth.jwt() IS NULL, 'tests.reset_role() clears the claims');

-- ------------------------------------------------------------ roles and grants of the stub
SELECT tests.ok((SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role'), 'service_role has BYPASSRLS');
SELECT tests.ok(NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'authenticated'), 'authenticated does not bypass RLS');
SELECT tests.is(
  (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role', 'supabase_admin', 'supabase_auth_admin', 'sandbox_exec', 'supabase_realtime_admin')),
  7::bigint,
  'the Supabase roles exist (incl. sandbox_exec for the Lovable grants)'
);

-- Supabase's default privileges: a new public table / function is granted to the API roles directly
CREATE TABLE public.zz_harness_smoke (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), note text);
CREATE FUNCTION public.zz_harness_smoke_fn() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
SELECT tests.ok(has_table_privilege('anon', 'public.zz_harness_smoke', 'SELECT, INSERT, UPDATE, DELETE'), 'a new public table is granted to anon by default (as on Supabase)');
SELECT tests.ok(has_table_privilege('authenticated', 'public.zz_harness_smoke', 'SELECT, INSERT, UPDATE, DELETE'), 'a new public table is granted to authenticated by default');
SELECT tests.ok(
  (SELECT bool_and(r IN (SELECT (aclexplode(proacl)).grantee::regrole::text FROM pg_proc WHERE oid = 'public.zz_harness_smoke_fn()'::regprocedure))
     FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r),
  'a new public function grants EXECUTE to anon, authenticated and service_role directly (REVOKE FROM PUBLIC alone is not enough)'
);
REVOKE ALL ON FUNCTION public.zz_harness_smoke_fn() FROM PUBLIC;
SELECT tests.ok(has_function_privilege('authenticated', 'public.zz_harness_smoke_fn()', 'EXECUTE'), 'after REVOKE … FROM PUBLIC, authenticated can still execute it (rule 5, CC-1)');

-- ------------------------------------------------------------ RLS on a live tenant table
SELECT tests.ok(jsonb_typeof(tests.seed_two_tenants()) = 'object', 'tests.seed_two_tenants() seeds the standard world');
SELECT tests.is((SELECT count(*) FROM public.vessels WHERE company_id IN (tests.company_id('A'), tests.company_id('B'))), 4::bigint, 'four seeded vessels');
SELECT tests.is((SELECT email FROM public.profiles WHERE id = tests.profile_id('A.master_dra')), 'a-master_dra@example.test', 'seeded emails are example.test role addresses');

SELECT tests.as_anon();
SELECT tests.is(current_user::text, 'anon', 'tests.as_anon() switches to anon');
SELECT tests.ok(auth.uid() IS NULL, 'anon has no auth.uid()');
SELECT tests.denied('SELECT * FROM public.vessels', 'anon reads no vessel (RLS on public.vessels)');
SELECT tests.denied(format($q$INSERT INTO public.vessels (company_id, name) VALUES (%L, 'ANON BOAT')$q$, tests.company_id('A')), 'anon cannot insert a vessel');
SELECT tests.denied('SELECT * FROM public.profiles', 'anon reads no profile');

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(current_user::text, 'authenticated', 'tests.as_user() switches to authenticated');
SELECT tests.is(auth.uid(), tests.user_id('A.fleet_manager'), 'auth.uid() is the user under tests.as_user()');
SELECT tests.is(current_setting('request.jwt.claim.sub', true), tests.user_id('A.fleet_manager')::text, 'tests.as_user() also sets request.jwt.claim.sub');
SELECT tests.is(auth.email(), 'a-fleet_manager@example.test', 'the claims carry the user''s email');
SELECT tests.is((SELECT count(*) FROM public.vessels WHERE company_id = tests.company_id('A')), 3::bigint, 'company A''s fleet manager sees A''s three vessels');
SELECT tests.is_empty(format('SELECT 1 FROM public.vessels WHERE company_id = %L', tests.company_id('B')), 'company A''s fleet manager sees nothing of company B');

SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is(auth.uid(), tests.user_id('B.admin'), 'switching user replaces the claims');
SELECT tests.is_empty(format('SELECT 1 FROM public.vessels WHERE company_id = %L', tests.company_id('A')), 'company B''s admin sees no vessel of company A (two-tenant isolation)');
SELECT tests.is((SELECT count(*) FROM public.vessels WHERE id = tests.vessel_id('B.lev')), 1::bigint, 'company B''s admin sees LEVIATHAN');

SELECT tests.as_service();
SELECT tests.is(current_user::text, 'service_role', 'tests.as_service() switches to service_role');
SELECT tests.is((SELECT count(*) FROM public.vessels WHERE company_id IN (tests.company_id('A'), tests.company_id('B'))), 4::bigint, 'service_role bypasses RLS and sees both companies');
SELECT tests.reset_role();
SELECT tests.is(current_user::text, 'postgres', 'tests.reset_role() returns to the superuser');

-- ------------------------------------------------------------ storage
SELECT tests.is(storage.foldername('company/vessel/report.pdf'), ARRAY['company', 'vessel'], 'storage.foldername() returns the folders');
SELECT tests.is(storage.filename('company/vessel/report.pdf'), 'report.pdf', 'storage.filename() returns the last segment');
SELECT tests.is(storage.extension('company/vessel/archive.tar.gz'), 'gz', 'storage.extension() returns the last extension');
SELECT tests.ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'storage.objects'::regclass), 'storage.objects has RLS enabled');
SELECT tests.as_anon();
SELECT tests.denied($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('documents', 'smoke/anon.pdf')$q$, 'anon cannot write to a private bucket');
SELECT tests.as_service();
SELECT tests.lives($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('documents', 'smoke/service.pdf')$q$, 'service_role writes storage objects (bypasses RLS)');
SELECT tests.is((SELECT path_tokens FROM storage.objects WHERE name = 'smoke/service.pdf'), ARRAY['smoke', 'service.pdf'], 'storage.objects.path_tokens is generated from the name');
SELECT tests.reset_role();

-- ------------------------------------------------------------ extensions, cron, realtime, auth tables
SELECT tests.ok(position('extensions' IN current_setting('search_path')) > 0, 'the extensions schema is on the database search_path');
SELECT tests.is(encode(digest('abc', 'sha256'), 'hex'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'pgcrypto digest() resolves through the search_path');
SELECT tests.is((SELECT extnamespace::regnamespace::text FROM pg_extension WHERE extname = 'pgcrypto'), 'extensions', 'pgcrypto lives in schema extensions');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'), 'pg_cron is not installed (legacy schedules are skipped as on a project without it)');
SELECT tests.ok(cron.schedule('harness-smoke', '0 0 * * *', 'SELECT 1') > 0, 'cron.schedule() is callable');
SELECT tests.ok(EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'), 'the supabase_realtime publication exists');
SELECT tests.is(
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users'
     AND column_name IN ('id', 'instance_id', 'aud', 'role', 'email', 'encrypted_password', 'email_confirmed_at', 'invited_at',
                         'confirmation_token', 'recovery_token', 'last_sign_in_at', 'raw_app_meta_data', 'raw_user_meta_data',
                         'is_super_admin', 'created_at', 'updated_at', 'phone', 'banned_until', 'deleted_at', 'is_anonymous')),
  20::bigint,
  'auth.users has the columns the migrations and helpers use'
);
SELECT tests.ok(to_regclass('auth.sessions') IS NOT NULL AND to_regclass('auth.refresh_tokens') IS NOT NULL, 'auth.sessions and auth.refresh_tokens exist');

-- ------------------------------------------------------------ the other seeders
SELECT tests.ok(tests.seed_role('harness_custom', 'fleet') = tests.id('role:harness_custom'), 'tests.seed_role() creates a custom RBAC role');
SELECT tests.is(tests.seed_role('captain'), (SELECT id FROM public.roles WHERE name = 'captain'), 'tests.seed_role() returns a seeded role as it is');
SELECT tests.ok(tests.seed_rbac_role('A.master_dra', 'captain', 'A.dra') IS NOT NULL, 'tests.seed_rbac_role() assigns a vessel role');
SELECT tests.is((SELECT count(*) FROM public.rbac_user_roles WHERE user_id = tests.user_id('A.master_dra') AND vessel_id = tests.vessel_id('A.dra') AND is_active), 1::bigint, 'the RBAC row is active on A.dra');
SELECT tests.throws($q$SELECT tests.seed_rbac_role('A.master_dra', 'no_such_role')$q$, 'P0001', 'tests.seed_rbac_role() refuses an unknown role');
SELECT tests.ok(tests.seed_user_role('A.fleet_manager', 'dpa', 'A') IS NOT NULL, 'tests.seed_user_role() adds a legacy user_roles row');
SELECT tests.is((SELECT company_id FROM public.user_roles WHERE user_id = tests.user_id('A.fleet_manager') AND role = 'dpa'), tests.company_id('A'), 'the user_roles row is scoped to company A');
SELECT tests.is(tests.seed_profile('A', 'A.imported', 'crew', 'not_invited'), tests.profile_id('A.imported'), 'tests.seed_profile() seeds a profile without a login');
SELECT tests.ok((SELECT user_id IS NULL FROM public.profiles WHERE id = tests.profile_id('A.imported')), 'the imported profile has no login');
SELECT tests.ok(tests.seed_auth_user('A.banned', '{"banned_until": "2099-01-01T00:00:00Z"}') = tests.user_id('A.banned'), 'tests.seed_auth_user() takes extra auth.users columns');
SELECT tests.ok((SELECT banned_until > now() FROM auth.users WHERE id = tests.user_id('A.banned')), 'the banned login carries banned_until');
SELECT tests.is(tests.seed_vessel('A', 'A.old', 'OLD TIMER', 'Sold', NULL, '2026-01-05T00:00:00Z'), tests.vessel_id('A.old'), 'tests.seed_vessel() seeds a sold vessel');
SELECT tests.is(tests.seed_vessel('A', 'A.old'), tests.vessel_id('A.old'), 'seeding the same key again is a no-op');
SELECT tests.is((SELECT count(*) FROM public.vessels WHERE id = tests.vessel_id('A.old')), 1::bigint, 'one row per key');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is(tests.seed_assignment('A.crew_hyd', 'A.gam', false), tests.id('assignment:A.crew_hyd@A.gam'), 'seeders work while acting as a user');
SELECT tests.is(auth.uid(), tests.user_id('A.crew_hyd'), 'and restore the caller''s claims afterwards');
SELECT tests.reset_role();
SELECT tests.ok((SELECT NOT is_current AND leave_date < current_date FROM public.crew_assignments WHERE id = tests.id('assignment:A.crew_hyd@A.gam')), 'a past assignment is not current');

-- ------------------------------------------------------------ the library's own assertions
SELECT tests.is(NULL::text, NULL::text, 'tests.is treats NULL as equal to NULL');
SELECT tests.isnt(1, 2, 'tests.isnt passes on different values');
SELECT tests.is(tests.id('x'), tests.id('x'), 'tests.id() is deterministic');
SELECT tests.isnt(tests.company_id('A'), tests.vessel_id('A'), 'ids are namespaced by kind');
SELECT tests.throws('SELECT 1 / 0', '22012', 'tests.throws matches the SQLSTATE');
SELECT tests.throws_like($q$SELECT public.no_such_function()$q$, '42883', '%no_such_function%', 'tests.throws_like matches the message');
SELECT tests.lives('SELECT 1', 'tests.lives passes on a statement that runs');
SELECT tests.results_eq('SELECT * FROM (VALUES (2), (1), (1)) AS t(x)', 'SELECT * FROM (VALUES (1), (1), (2)) AS t(x)', 'tests.results_eq compares rows in any order, duplicates counted');
SELECT tests.is_empty('SELECT 1 WHERE false', 'tests.is_empty passes on no row');
