-- STORM SQL test library (Phase 2 spec §D.6). Schema `tests`.
--
-- Loaded by scripts/db/harness.mjs after the build-out (pass 2), never on a
-- real project. Each test file runs inside one transaction that is rolled
-- back:
--
--   BEGIN; SELECT tests._start('<file>'); \i <file>; SELECT tests._finish(); ROLLBACK;
--
-- Assertions emit TAP-like NOTICEs ('ok <n> - <description>' /
-- 'not ok <n> - <description> # <diagnostic>') that the harness collects.
-- Numbering uses sequences, which a rolled-back subtransaction does not
-- reset, so an assertion inside an exception block still counts once.
--
--   assertions   tests.ok, is, isnt, is_empty, results_eq, throws, throws_like,
--                lives, denied
--   roles        tests.as_user(uid, extra_claims), as_anon(), as_service(),
--                reset_role()  (SECURITY INVOKER: they switch the caller's role)
--   ids          tests.id(key) = md5 uuid of key; company_id / vessel_id /
--                user_id / profile_id(key) are tests.id('<kind>:' || key)
--   seeders      seed_company, seed_vessel, seed_auth_user, seed_profile,
--                seed_user, seed_assignment, seed_role, seed_rbac_role,
--                seed_user_role, seed_two_tenants, seed_reach_world
--
-- Assertions that only compare values are SECURITY DEFINER (they record
-- while the session role is anon / authenticated). Assertions that run SQL
-- (is_empty, results_eq, throws, throws_like, lives, denied) are SECURITY
-- INVOKER so the SQL runs as the current role, under its RLS; they record
-- through the definer tests._record. Seeders are SECURITY DEFINER and run
-- with no JWT claims (they suspend and restore them), so seeding works under
-- any role and no trigger mistakes the seed for a user action.
--
-- Fixture data uses role words and example.test addresses only: emails are
-- '<key, lower case, dots as dashes>@example.test'.

SET client_min_messages = warning;

CREATE SCHEMA IF NOT EXISTS tests;
COMMENT ON SCHEMA tests IS 'STORM DB harness test library (supabase/tests/harness/testlib.sql); exists only in harness databases.';

CREATE SEQUENCE IF NOT EXISTS tests.assertion_seq;
CREATE SEQUENCE IF NOT EXISTS tests.failure_seq;

-- ------------------------------------------------------------------ recording

CREATE OR REPLACE FUNCTION tests._oneline(p_text text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT replace(replace(coalesce(p_text, 'NULL'), E'\r', '\r'), E'\n', '\n')
$$;

CREATE OR REPLACE FUNCTION tests._count(p_seq regclass)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_last bigint;
  v_called boolean;
BEGIN
  EXECUTE format('SELECT last_value, is_called FROM %s', p_seq) INTO v_last, v_called;
  RETURN CASE WHEN v_called THEN v_last ELSE 0 END;
END;
$$;

-- Records one assertion: emits the TAP line and returns the outcome.
CREATE OR REPLACE FUNCTION tests._record(p_ok boolean, p_description text, p_diagnostic text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_n bigint := nextval('tests.assertion_seq');
  v_ok boolean := coalesce(p_ok, false);
  v_desc text := tests._oneline(coalesce(nullif(p_description, ''), 'assertion ' || v_n));
BEGIN
  IF v_ok THEN
    RAISE NOTICE 'ok % - %', v_n, v_desc;
  ELSE
    PERFORM nextval('tests.failure_seq');
    RAISE NOTICE 'not ok % - %', v_n, v_desc || CASE WHEN p_diagnostic IS NULL THEN '' ELSE ' # ' || tests._oneline(p_diagnostic) END;
  END IF;
  RETURN v_ok;
END;
$$;

CREATE OR REPLACE FUNCTION tests._start(p_file text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  PERFORM setval('tests.assertion_seq', 1, false);
  PERFORM setval('tests.failure_seq', 1, false);
  PERFORM set_config('tests.file', coalesce(p_file, ''), false);
  -- Test-only stand-in for the Phase 3 domain definers: from a signed-in
  -- session, record_open_envelope() binds an entity id only under the
  -- transaction-local flag storm.record_domain (20261123020000; 22023
  -- entity_unverified otherwise). These files open entity-bound envelopes
  -- as a signed-in user only to set up their records; until each sets the
  -- flag itself before those calls, the flag is on for its whole
  -- (rolled-back) transaction. p4_registry/registry.test.sql asserts the
  -- refusal without it. Remove an entry once its file sets the flag.
  IF coalesce(p_file, '') ~ '(^|/)(p4_files/files|p4_threads/engine_integration|p4_threads/scenarios|p5_notifications/notifications)\.test\.sql$' THEN
    PERFORM set_config('storm.record_domain', 'on', true);
  END IF;
END;
$$;

-- Ends a file: '# <file>: <n> tests, <m> failed' and the marker line the harness reads.
CREATE OR REPLACE FUNCTION tests._finish()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_n bigint := tests._count('tests.assertion_seq');
  v_failed bigint := tests._count('tests.failure_seq');
BEGIN
  RAISE NOTICE '# %: % tests, % failed', current_setting('tests.file', true), v_n, v_failed;
  RETURN format('STORM-TESTS-FINISHED %s %s', v_n, v_failed);
END;
$$;

-- ------------------------------------------------------------------ value assertions

CREATE OR REPLACE FUNCTION tests.ok(p_condition boolean, p_description text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT tests._record(coalesce(p_condition, false), p_description, CASE WHEN p_condition IS NULL THEN 'condition is NULL' ELSE NULL END)
$$;

-- Equality with IS NOT DISTINCT FROM (NULL equals NULL). anycompatible, so
-- tests.is(count(*), 3, '…') compares bigint with integer.
CREATE OR REPLACE FUNCTION tests.is(p_got anycompatible, p_want anycompatible, p_description text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT tests._record(
    p_got IS NOT DISTINCT FROM p_want,
    p_description,
    CASE WHEN p_got IS DISTINCT FROM p_want THEN format('got: %s, want: %s', coalesce(p_got::text, 'NULL'), coalesce(p_want::text, 'NULL')) END
  )
$$;

CREATE OR REPLACE FUNCTION tests.isnt(p_got anycompatible, p_unwanted anycompatible, p_description text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT tests._record(
    p_got IS DISTINCT FROM p_unwanted,
    p_description,
    CASE WHEN p_got IS NOT DISTINCT FROM p_unwanted THEN format('got: %s, which it must not be', coalesce(p_got::text, 'NULL')) END
  )
$$;

-- ------------------------------------------------------------------ SQL assertions (run as the current role)

-- The query returns no row. An error is a failure (recorded, the file goes on).
CREATE OR REPLACE FUNCTION tests.is_empty(p_sql text, p_description text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_count bigint;
  v_rows text;
BEGIN
  BEGIN
    EXECUTE format('SELECT count(*) FROM (%s) AS q', p_sql) INTO v_count;
    IF v_count > 0 THEN
      EXECUTE format('SELECT string_agg(q::text, ''; '') FROM (SELECT * FROM (%s) AS x LIMIT 3) AS q', p_sql) INTO v_rows;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN tests._record(false, p_description, format('raised %s: %s', SQLSTATE, SQLERRM));
  END;
  RETURN tests._record(v_count = 0, p_description, CASE WHEN v_count > 0 THEN format('%s row(s), e.g. %s', v_count, v_rows) END);
END;
$$;

-- Same rows in any order, duplicates counted (multiset equality).
CREATE OR REPLACE FUNCTION tests.results_eq(p_sql text, p_want_sql text, p_description text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_extra text;
  v_missing text;
BEGIN
  BEGIN
    EXECUTE format('SELECT string_agg(q::text, ''; '') FROM (SELECT * FROM ((%s) EXCEPT ALL (%s)) AS x LIMIT 5) AS q', p_sql, p_want_sql) INTO v_extra;
    EXECUTE format('SELECT string_agg(q::text, ''; '') FROM (SELECT * FROM ((%s) EXCEPT ALL (%s)) AS x LIMIT 5) AS q', p_want_sql, p_sql) INTO v_missing;
  EXCEPTION WHEN OTHERS THEN
    RETURN tests._record(false, p_description, format('raised %s: %s', SQLSTATE, SQLERRM));
  END;
  RETURN tests._record(
    v_extra IS NULL AND v_missing IS NULL,
    p_description,
    CASE WHEN v_extra IS NOT NULL OR v_missing IS NOT NULL
      THEN concat_ws(', ', 'unexpected: ' || v_extra, 'missing: ' || v_missing) END
  );
END;
$$;

-- The statement raises (with this SQLSTATE when given). Its effects roll back.
CREATE OR REPLACE FUNCTION tests.throws(p_sql text, p_sqlstate text DEFAULT NULL, p_description text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF p_sqlstate IS NULL OR SQLSTATE = p_sqlstate THEN
      RETURN tests._record(true, p_description);
    END IF;
    RETURN tests._record(false, p_description, format('raised %s (%s), want %s', SQLSTATE, SQLERRM, p_sqlstate));
  END;
  RETURN tests._record(false, p_description, format('no error raised, want %s', coalesce(p_sqlstate, 'an error')));
END;
$$;

-- The statement raises with this SQLSTATE (NULL: any) and a message matching the LIKE pattern.
CREATE OR REPLACE FUNCTION tests.throws_like(p_sql text, p_sqlstate text, p_message_like text, p_description text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF (p_sqlstate IS NULL OR SQLSTATE = p_sqlstate) AND SQLERRM LIKE p_message_like THEN
      RETURN tests._record(true, p_description);
    END IF;
    RETURN tests._record(false, p_description, format('raised %s (%s), want %s like %L', SQLSTATE, SQLERRM, coalesce(p_sqlstate, 'any'), p_message_like));
  END;
  RETURN tests._record(false, p_description, format('no error raised, want %s like %L', coalesce(p_sqlstate, 'an error'), p_message_like));
END;
$$;

-- The statement runs without error; its effects stay in the test transaction.
CREATE OR REPLACE FUNCTION tests.lives(p_sql text, p_description text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    RETURN tests._record(false, p_description, format('raised %s: %s', SQLSTATE, SQLERRM));
  END;
  RETURN tests._record(true, p_description);
END;
$$;

-- Access is denied: the statement raises insufficient_privilege (42501:
-- missing grant, function ACL or an RLS WITH CHECK) or returns / changes no
-- row (RLS filtering). Pass a row-returning query (SELECT * …, not count(*)).
-- Its effects roll back either way. Any other error is a failure.
CREATE OR REPLACE FUNCTION tests.denied(p_sql text, p_description text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows bigint;
BEGIN
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE EXCEPTION USING ERRCODE = 'P0T01', MESSAGE = v_rows::text;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RETURN tests._record(true, p_description);
    WHEN SQLSTATE 'P0T01' THEN
      RETURN tests._record(SQLERRM = '0', p_description, CASE WHEN SQLERRM <> '0' THEN format('not denied: %s row(s) returned or changed', SQLERRM) END);
    WHEN OTHERS THEN
      RETURN tests._record(false, p_description, format('raised %s (%s), want 42501 or no row', SQLSTATE, SQLERRM));
  END;
END;
$$;

-- ------------------------------------------------------------------ roles and claims (SECURITY INVOKER, no SET clause)

CREATE OR REPLACE FUNCTION tests._user_email(p_uid uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT email::text FROM auth.users WHERE id = p_uid
$$;

CREATE OR REPLACE FUNCTION tests._set_claims(p_claims jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', coalesce(p_claims::text, ''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_claims ->> 'sub', ''), true);
  PERFORM set_config('request.jwt.claim.role', coalesce(p_claims ->> 'role', ''), true);
  PERFORM set_config('request.jwt.claim.email', coalesce(p_claims ->> 'email', ''), true);
  PERFORM set_config('request.jwt.claim', '', true);
END;
$$;

-- Act as a signed-in user: role authenticated, claims as PostgREST sets them.
CREATE OR REPLACE FUNCTION tests.as_user(p_uid uuid, p_extra_claims jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_claims jsonb := jsonb_strip_nulls(jsonb_build_object(
    'sub', p_uid,
    'role', 'authenticated',
    'aud', 'authenticated',
    'email', tests._user_email(p_uid),
    'aal', 'aal1',
    'is_anonymous', false
  )) || coalesce(p_extra_claims, '{}'::jsonb);
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'tests.as_user needs a user id';
  END IF;
  RESET ROLE;
  PERFORM tests._set_claims(v_claims);
  EXECUTE format('SET LOCAL ROLE %I', coalesce(v_claims ->> 'role', 'authenticated'));
END;
$$;

CREATE OR REPLACE FUNCTION tests.as_anon()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RESET ROLE;
  PERFORM tests._set_claims(jsonb_build_object('role', 'anon'));
  SET LOCAL ROLE anon;
END;
$$;

CREATE OR REPLACE FUNCTION tests.as_service()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RESET ROLE;
  PERFORM tests._set_claims(jsonb_build_object('role', 'service_role'));
  SET LOCAL ROLE service_role;
END;
$$;

-- Back to the superuser with no JWT (as the SQL editor or a migration runs).
CREATE OR REPLACE FUNCTION tests.reset_role()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RESET ROLE;
  PERFORM tests._set_claims(NULL);
END;
$$;

-- ------------------------------------------------------------------ deterministic ids

CREATE OR REPLACE FUNCTION tests.id(p_key text)
RETURNS uuid
LANGUAGE sql IMMUTABLE
AS $$ SELECT md5(p_key)::uuid $$;

CREATE OR REPLACE FUNCTION tests.company_id(p_key text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT tests.id('company:' || p_key) $$;
CREATE OR REPLACE FUNCTION tests.vessel_id(p_key text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT tests.id('vessel:' || p_key) $$;
CREATE OR REPLACE FUNCTION tests.user_id(p_key text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT tests.id('user:' || p_key) $$;
CREATE OR REPLACE FUNCTION tests.profile_id(p_key text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT tests.id('profile:' || p_key) $$;

-- '<key, lower case, dots as dashes>@example.test'
CREATE OR REPLACE FUNCTION tests.email(p_key text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$ SELECT lower(replace(p_key, '.', '-')) || '@example.test' $$;

-- ------------------------------------------------------------------ seeding helpers

-- Clears the JWT claims for the duration of a seeder; returns what to restore.
CREATE OR REPLACE FUNCTION tests._suspend_claims()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_saved jsonb := jsonb_build_object(
    'claims', current_setting('request.jwt.claims', true),
    'sub', current_setting('request.jwt.claim.sub', true),
    'role', current_setting('request.jwt.claim.role', true),
    'email', current_setting('request.jwt.claim.email', true),
    'claim', current_setting('request.jwt.claim', true)
  );
BEGIN
  PERFORM tests._set_claims(NULL);
  RETURN v_saved;
END;
$$;

CREATE OR REPLACE FUNCTION tests._restore_claims(p_saved jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', coalesce(p_saved ->> 'claims', ''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_saved ->> 'sub', ''), true);
  PERFORM set_config('request.jwt.claim.role', coalesce(p_saved ->> 'role', ''), true);
  PERFORM set_config('request.jwt.claim.email', coalesce(p_saved ->> 'email', ''), true);
  PERFORM set_config('request.jwt.claim', coalesce(p_saved ->> 'claim', ''), true);
END;
$$;

-- INSERT … ON CONFLICT (id) DO NOTHING of the given columns (omitted columns keep their defaults).
CREATE OR REPLACE FUNCTION tests._insert(p_table regclass, p_row jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(k), ', ' ORDER BY k) INTO v_cols FROM jsonb_object_keys(p_row) AS k;
  EXECUTE format(
    'INSERT INTO %s (%s) SELECT %s FROM jsonb_populate_record(NULL::%s, $1) ON CONFLICT (id) DO NOTHING',
    p_table, v_cols, v_cols, p_table
  ) USING p_row;
END;
$$;

CREATE OR REPLACE FUNCTION tests.seed_company(p_key text, p_name text DEFAULT NULL, p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_saved jsonb := tests._suspend_claims();
  v_id uuid := tests.company_id(p_key);
BEGIN
  PERFORM tests._insert('public.companies', jsonb_build_object('id', v_id, 'name', coalesce(p_name, 'Company ' || p_key)) || coalesce(p_extra, '{}'::jsonb));
  PERFORM tests._restore_claims(v_saved);
  RETURN v_id;
END;
$$;

-- p_code is written only when given (the column arrives with P1, file 1).
-- p_extra sets any other vessels column, e.g. '{"lifecycle_status": "archived"}'.
CREATE OR REPLACE FUNCTION tests.seed_vessel(
  p_company_key text,
  p_key text,
  p_name text DEFAULT NULL,
  p_status text DEFAULT 'Active',
  p_code text DEFAULT NULL,
  p_created_at timestamptz DEFAULT NULL,
  p_extra jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_saved jsonb := tests._suspend_claims();
  v_id uuid := tests.vessel_id(p_key);
  v_row jsonb;
BEGIN
  PERFORM tests.seed_company(p_company_key);
  v_row := jsonb_build_object(
    'id', v_id,
    'company_id', tests.company_id(p_company_key),
    'name', coalesce(p_name, upper(regexp_replace(p_key, '^.*\.', ''))),
    'status', p_status,
    'created_at', coalesce(p_created_at, now())
  );
  IF p_code IS NOT NULL THEN
    v_row := v_row || jsonb_build_object('code', p_code);
  END IF;
  PERFORM tests._insert('public.vessels', v_row || coalesce(p_extra, '{}'::jsonb));
  PERFORM tests._restore_claims(v_saved);
  RETURN v_id;
END;
$$;

-- An auth.users row (a login) for the key; returns its id.
CREATE OR REPLACE FUNCTION tests.seed_auth_user(p_key text, p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_saved jsonb := tests._suspend_claims();
  v_id uuid := tests.user_id(p_key);
BEGIN
  PERFORM tests._insert('auth.users', jsonb_build_object(
    'id', v_id,
    'instance_id', '00000000-0000-0000-0000-000000000000',
    'aud', 'authenticated',
    'role', 'authenticated',
    'email', tests.email(p_key),
    'email_confirmed_at', now(),
    'raw_app_meta_data', jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    'raw_user_meta_data', '{}'::jsonb,
    'created_at', now(),
    'updated_at', now()
  ) || coalesce(p_extra, '{}'::jsonb));
  PERFORM tests._restore_claims(v_saved);
  RETURN v_id;
END;
$$;

-- A profile for the key; p_user_key links it to a login (NULL: an imported
-- profile without one). Names are role words: '<Role>' '<key>'.
CREATE OR REPLACE FUNCTION tests.seed_profile(
  p_company_key text,
  p_key text,
  p_profile_role public.user_role DEFAULT 'crew',
  p_account_status text DEFAULT 'active',
  p_user_key text DEFAULT NULL,
  p_extra jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_saved jsonb := tests._suspend_claims();
  v_id uuid := tests.profile_id(p_key);
  v_role_word text := CASE p_profile_role
    WHEN 'dpa' THEN 'DPA'
    ELSE initcap(replace(p_profile_role::text, '_', ' '))
  END;
BEGIN
  IF p_company_key IS NOT NULL THEN
    PERFORM tests.seed_company(p_company_key);
  END IF;
  PERFORM tests._insert('public.profiles', jsonb_build_object(
    'id', v_id,
    'user_id', CASE WHEN p_user_key IS NULL THEN NULL ELSE tests.user_id(p_user_key) END,
    'email', tests.email(p_key),
    'first_name', v_role_word,
    'last_name', p_key,
    'company_id', CASE WHEN p_company_key IS NULL THEN NULL ELSE tests.company_id(p_company_key) END,
    'role', p_profile_role,
    'account_status', p_account_status
  ) || coalesce(p_extra, '{}'::jsonb));
  PERFORM tests._restore_claims(v_saved);
  RETURN v_id;
END;
$$;

-- A login and its profile; returns the auth user id (use with tests.as_user).
CREATE OR REPLACE FUNCTION tests.seed_user(
  p_company_key text,
  p_key text,
  p_profile_role public.user_role DEFAULT 'crew',
  p_account_status text DEFAULT 'active',
  p_extra jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid := tests.seed_auth_user(p_key);
BEGIN
  PERFORM tests.seed_profile(p_company_key, p_key, p_profile_role, p_account_status, p_key, p_extra);
  RETURN v_uid;
END;
$$;

-- A crew assignment (current, or ended yesterday).
CREATE OR REPLACE FUNCTION tests.seed_assignment(
  p_user_key text,
  p_vessel_key text,
  p_is_current boolean DEFAULT true,
  p_position text DEFAULT 'Crew',
  p_extra jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_saved jsonb := tests._suspend_claims();
  v_id uuid := tests.id('assignment:' || p_user_key || '@' || p_vessel_key);
BEGIN
  PERFORM tests._insert('public.crew_assignments', jsonb_build_object(
    'id', v_id,
    'vessel_id', tests.vessel_id(p_vessel_key),
    'user_id', tests.user_id(p_user_key),
    'position', p_position,
    'join_date', current_date - 30,
    'leave_date', CASE WHEN p_is_current THEN NULL ELSE current_date - 1 END,
    'is_current', p_is_current
  ) || coalesce(p_extra, '{}'::jsonb));
  PERFORM tests._restore_claims(v_saved);
  RETURN v_id;
END;
$$;

-- An RBAC role definition (for custom roles; the seeded ones already exist).
CREATE OR REPLACE FUNCTION tests.seed_role(p_name text, p_default_scope public.role_scope_type DEFAULT 'vessel')
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_saved jsonb := tests._suspend_claims();
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.roles WHERE name = p_name;
  IF v_id IS NULL THEN
    v_id := tests.id('role:' || p_name);
    PERFORM tests._insert('public.roles', jsonb_build_object(
      'id', v_id, 'name', p_name, 'display_name', initcap(replace(p_name, '_', ' ')),
      'is_system_role', false, 'default_scope', p_default_scope
    ));
  END IF;
  PERFORM tests._restore_claims(v_saved);
  RETURN v_id;
END;
$$;

-- An RBAC role assignment (rbac_user_roles); the role must exist (tests.seed_role for custom ones).
CREATE OR REPLACE FUNCTION tests.seed_rbac_role(
  p_user_key text,
  p_role_name text,
  p_vessel_key text DEFAULT NULL,
  p_is_active boolean DEFAULT true,
  p_valid_until timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_saved jsonb := tests._suspend_claims();
  v_role uuid;
  v_id uuid := tests.id('rbac:' || p_user_key || ':' || p_role_name || ':' || coalesce(p_vessel_key, '*'));
BEGIN
  SELECT id INTO v_role FROM public.roles WHERE name = p_role_name;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'tests.seed_rbac_role: no role named % (seed it with tests.seed_role)', p_role_name;
  END IF;
  PERFORM tests._insert('public.rbac_user_roles', jsonb_build_object(
    'id', v_id,
    'user_id', tests.user_id(p_user_key),
    'role_id', v_role,
    'vessel_id', CASE WHEN p_vessel_key IS NULL THEN NULL ELSE tests.vessel_id(p_vessel_key) END,
    'is_active', p_is_active,
    'valid_until', p_valid_until
  ));
  PERFORM tests._restore_claims(v_saved);
  RETURN v_id;
END;
$$;

-- A legacy app role (user_roles: superadmin, dpa, …), scoped to a company when given.
CREATE OR REPLACE FUNCTION tests.seed_user_role(
  p_user_key text,
  p_role public.app_role,
  p_company_key text DEFAULT NULL,
  p_is_active boolean DEFAULT true,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_saved jsonb := tests._suspend_claims();
  v_id uuid := tests.id('user_role:' || p_user_key || ':' || p_role::text || ':' || coalesce(p_company_key, '*'));
BEGIN
  PERFORM tests._insert('public.user_roles', jsonb_build_object(
    'id', v_id,
    'user_id', tests.user_id(p_user_key),
    'role', p_role,
    'company_id', CASE WHEN p_company_key IS NULL THEN NULL ELSE tests.company_id(p_company_key) END,
    'is_active', p_is_active,
    'expires_at', p_expires_at
  ));
  PERFORM tests._restore_claims(v_saved);
  RETURN v_id;
END;
$$;

-- The standard small world: companies A and B; vessels A.dra (M/Y DRAAK),
-- A.hyd (HYDRA), A.gam (GAME CHANGER) in A and B.lev (LEVIATHAN) in B;
-- personas A.fleet_manager (dpa), A.master_dra (master, on A.dra),
-- A.crew_hyd (crew, on A.hyd), A.disabled (crew, account_status disabled)
-- and B.admin (dpa). Returns the ids as jsonb.
CREATE OR REPLACE FUNCTION tests.seed_two_tenants()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_saved jsonb := tests._suspend_claims();
  v_users jsonb := '{}'::jsonb;
  v_profiles jsonb := '{}'::jsonb;
  r record;
BEGIN
  PERFORM tests.seed_company('A');
  PERFORM tests.seed_company('B');
  PERFORM tests.seed_vessel('A', 'A.dra', 'M/Y DRAAK', 'Active', NULL, '2026-01-01T00:00:00Z');
  PERFORM tests.seed_vessel('A', 'A.hyd', 'HYDRA', 'Active', NULL, '2026-01-02T00:00:00Z');
  PERFORM tests.seed_vessel('A', 'A.gam', 'GAME CHANGER', 'Active', NULL, '2026-01-03T00:00:00Z');
  PERFORM tests.seed_vessel('B', 'B.lev', 'LEVIATHAN', 'Active', NULL, '2026-01-04T00:00:00Z');
  FOR r IN
    SELECT * FROM (VALUES
      ('A', 'A.fleet_manager', 'dpa'::public.user_role, 'active'),
      ('A', 'A.master_dra', 'master'::public.user_role, 'active'),
      ('A', 'A.crew_hyd', 'crew'::public.user_role, 'active'),
      ('A', 'A.disabled', 'crew'::public.user_role, 'disabled'),
      ('B', 'B.admin', 'dpa'::public.user_role, 'active')
    ) AS v(company_key, user_key, profile_role, account_status)
  LOOP
    v_users := v_users || jsonb_build_object(r.user_key, tests.seed_user(r.company_key, r.user_key, r.profile_role, r.account_status));
    v_profiles := v_profiles || jsonb_build_object(r.user_key, tests.profile_id(r.user_key));
  END LOOP;
  PERFORM tests.seed_assignment('A.master_dra', 'A.dra', true, 'Master');
  PERFORM tests.seed_assignment('A.crew_hyd', 'A.hyd', true, 'Deckhand');
  PERFORM tests._restore_claims(v_saved);
  RETURN jsonb_build_object(
    'companies', jsonb_build_object('A', tests.company_id('A'), 'B', tests.company_id('B')),
    'vessels', jsonb_build_object(
      'A.dra', tests.vessel_id('A.dra'), 'A.hyd', tests.vessel_id('A.hyd'),
      'A.gam', tests.vessel_id('A.gam'), 'B.lev', tests.vessel_id('B.lev')
    ),
    'users', v_users,
    'profiles', v_profiles
  );
END;
$$;

-- The shared reach world of supabase/tests/fixtures/reach-cases.json (spec
-- §A.3, §E): its companies, vessels (status, lifecycle, created_at), RBAC
-- roles (custom ones included), users (legacy profile role, account
-- status), crew assignments and explicit memberships. Every user gets a
-- login and a profile, so the profile sync creates their legacy-managed
-- membership; a user whose fixture `membership` is set has that row turned
-- into the explicit, non-legacy membership (with its vessel rows).
--
-- Times in the fixture are relative to its `now`: they are shifted by
-- now() - fixture.now, so the windows mean the same whatever the clock.
-- A membership vessel of another company cannot be stored (the
-- account_membership_vessels trigger refuses it); it is skipped and listed
-- in the result's `skipped`. The fixture's 'deactivated' account status
-- (a legacy value the HRIS reads) is outside the live
-- profiles_account_status_check, so that CHECK is relaxed to NOT VALID
-- for the seeding and put back (NOT VALID, same definition) afterwards:
-- harness only, inside the test's rolled-back transaction.
--
-- Crew assignments keep the fixture's leaveDate / endDate (D-217; review
-- round 5). An isCurrent row whose date has already passed models a row
-- written before its leave date came, which the legacy normaliser
-- (trg_crew_assignments_normalise_dates) would end on insert: that trigger
-- is disabled for that one insert and enabled again right after, inside
-- the test's rolled-back transaction.
--
-- Returns {companies, vessels, users, profiles, skipped} as jsonb of ids.
CREATE OR REPLACE FUNCTION tests.seed_reach_world(p_fixture jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_saved jsonb := tests._suspend_claims();
  v_shift interval := now() - (p_fixture ->> 'now')::timestamptz;
  v_check text;
  v_relaxed boolean := false;
  v_users jsonb := '{}'::jsonb;
  v_profiles jsonb := '{}'::jsonb;
  v_vessels jsonb := '{}'::jsonb;
  v_companies jsonb := '{}'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_membership uuid;
  v_stale boolean;
  c text;
  r jsonb;
  x jsonb;
  m jsonb;
BEGIN
  IF p_fixture IS NULL OR jsonb_typeof(p_fixture -> 'users') <> 'array' THEN
    RAISE EXCEPTION 'tests.seed_reach_world needs the reach-cases.json fixture';
  END IF;

  -- RBAC roles: the fixture's custom roles, then any role a user holds that the seed lacks.
  FOR r IN SELECT e FROM jsonb_array_elements(coalesce(p_fixture -> 'roles', '[]'::jsonb)) AS e LOOP
    PERFORM tests.seed_role(r ->> 'name', (r ->> 'defaultScope')::public.role_scope_type);
  END LOOP;
  FOR r IN
    SELECT DISTINCT ON (rr ->> 'roleName') rr
    FROM jsonb_array_elements(p_fixture -> 'users') AS u, jsonb_array_elements(coalesce(u -> 'rbacRoles', '[]'::jsonb)) AS rr
    ORDER BY rr ->> 'roleName'
  LOOP
    PERFORM tests.seed_role(r ->> 'roleName', (r ->> 'defaultScope')::public.role_scope_type);
  END LOOP;

  FOR c IN SELECT jsonb_array_elements_text(p_fixture -> 'companies') LOOP
    v_companies := v_companies || jsonb_build_object(c, tests.seed_company(c));
  END LOOP;

  FOR r IN SELECT e FROM jsonb_array_elements(p_fixture -> 'vessels') AS e LOOP
    v_vessels := v_vessels || jsonb_build_object(r ->> 'key', tests.seed_vessel(
      r ->> 'company', r ->> 'key', r ->> 'name', r ->> 'status', NULL, (r ->> 'createdAt')::timestamptz,
      jsonb_strip_nulls(jsonb_build_object('lifecycle_status', r ->> 'lifecycleStatus'))
    ));
  END LOOP;

  -- Relax the live account-status CHECK when the fixture uses a value it refuses.
  SELECT pg_get_constraintdef(oid) INTO v_check FROM pg_constraint
  WHERE conrelid = 'public.profiles'::regclass AND conname = 'profiles_account_status_check';
  IF v_check IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_fixture -> 'users') AS u
    WHERE u ->> 'accountStatus' IS NOT NULL AND u ->> 'accountStatus' NOT IN ('active', 'disabled', 'invited', 'not_invited')
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_account_status_check;
    v_relaxed := true;
  END IF;

  FOR r IN SELECT e FROM jsonb_array_elements(p_fixture -> 'users') AS e LOOP
    v_users := v_users || jsonb_build_object(r ->> 'key', tests.seed_user(r ->> 'company', r ->> 'key', (r ->> 'profileRole')::public.user_role, r ->> 'accountStatus'));
    v_profiles := v_profiles || jsonb_build_object(r ->> 'key', tests.profile_id(r ->> 'key'));
    FOR x IN SELECT e2 FROM jsonb_array_elements(coalesce(r -> 'rbacRoles', '[]'::jsonb)) AS e2 LOOP
      PERFORM tests.seed_rbac_role(r ->> 'key', x ->> 'roleName', x ->> 'vessel', (x ->> 'isActive')::boolean, (x ->> 'validUntil')::timestamptz + v_shift);
    END LOOP;
    FOR x IN SELECT e2 FROM jsonb_array_elements(coalesce(r -> 'assignments', '[]'::jsonb)) AS e2 LOOP
      IF x ? 'leaveDate' OR x ? 'endDate' THEN
        -- The fixture's dates (D-217), stored as given. A row that still says
        -- is_current although its leave (else end) date has passed is a row
        -- written before that date came: the legacy normaliser
        -- (trg_crew_assignments_normalise_dates) would end it on this
        -- insert, so it is off for this one insert (inside the test's
        -- transaction, which rolls back).
        v_stale := (x ->> 'isCurrent')::boolean
          AND coalesce((x ->> 'leaveDate')::date, (x ->> 'endDate')::date) <= current_date;
        IF v_stale THEN
          ALTER TABLE public.crew_assignments DISABLE TRIGGER trg_crew_assignments_normalise_dates;
        END IF;
        PERFORM tests.seed_assignment(r ->> 'key', x ->> 'vessel', (x ->> 'isCurrent')::boolean, 'Crew',
          jsonb_build_object('leave_date', x ->> 'leaveDate', 'end_date', x ->> 'endDate'));
        IF v_stale THEN
          ALTER TABLE public.crew_assignments ENABLE TRIGGER trg_crew_assignments_normalise_dates;
        END IF;
      ELSE
        PERFORM tests.seed_assignment(r ->> 'key', x ->> 'vessel', (x ->> 'isCurrent')::boolean);
      END IF;
    END LOOP;

    m := r -> 'membership';
    IF m IS NOT NULL AND jsonb_typeof(m) = 'object' THEN
      v_membership := NULL;
      UPDATE public.account_memberships
      SET legacy_managed = false,
          kind = m ->> 'kind',
          status = m ->> 'status',
          fleet_access = (m ->> 'fleetAccess')::boolean,
          vessel_scope = m ->> 'vesselScope',
          valid_from = (m ->> 'validFrom')::timestamptz + v_shift,
          valid_until = (m ->> 'validUntil')::timestamptz + v_shift,
          is_dpa = false,
          manages_admins = false,
          removed_at = CASE WHEN m ->> 'status' = 'removed' THEN now() END,
          disabled_at = CASE WHEN m ->> 'status' = 'disabled' THEN now() END,
          source = 'admin'
      WHERE company_id = tests.company_id(r ->> 'company') AND user_id = tests.user_id(r ->> 'key')
      RETURNING id INTO v_membership;
      IF v_membership IS NULL THEN
        RAISE EXCEPTION 'tests.seed_reach_world: no membership was synced for %', r ->> 'key';
      END IF;
      FOR x IN SELECT e2 FROM jsonb_array_elements(coalesce(m -> 'vessels', '[]'::jsonb)) AS e2 LOOP
        IF EXISTS (SELECT 1 FROM public.vessels WHERE id = tests.vessel_id(x ->> 'vessel') AND company_id = tests.company_id(r ->> 'company')) THEN
          INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id, valid_from, valid_until)
          VALUES (v_membership, tests.company_id(r ->> 'company'), tests.vessel_id(x ->> 'vessel'),
                  (x ->> 'validFrom')::timestamptz + v_shift, (x ->> 'validUntil')::timestamptz + v_shift)
          ON CONFLICT (membership_id, vessel_id) DO NOTHING;
        ELSE
          v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('user', r ->> 'key', 'vessel', x ->> 'vessel', 'reason', 'vessel of another company'));
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  IF v_relaxed THEN
    EXECUTE format('ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_status_check %s NOT VALID', v_check);
  END IF;

  PERFORM tests._restore_claims(v_saved);
  RETURN jsonb_build_object('companies', v_companies, 'vessels', v_vessels, 'users', v_users, 'profiles', v_profiles, 'skipped', v_skipped);
END;
$$;

-- ------------------------------------------------------------------ access

GRANT USAGE ON SCHEMA tests TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated, service_role;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA tests TO anon, authenticated, service_role;
