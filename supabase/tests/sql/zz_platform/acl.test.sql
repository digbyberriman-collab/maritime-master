-- ACL inventory of the whole build-out (spec §D.7, rule 5, CC-1, CC-26;
-- proposed D-135), after pass 2: every function the build-out files create
-- or redefine in public has exactly the EXECUTE grants of
-- supabase/tests/fixtures/function-grants.json (never PUBLIC or anon); every
-- SECURITY DEFINER among them has a search_path; every table and view they
-- create grants anon nothing, authenticated exactly the fixture's
-- privileges, and the service role full access; nothing the build-out
-- creates is missing from the fixture, and nothing in the fixture is gone.

\set grants `cat supabase/tests/fixtures/function-grants.json`
\set bo_functions `grep -hoE 'CREATE OR REPLACE FUNCTION public\.[a-z0-9_]+' supabase/migrations/20261123*.sql | sort -u`
\set bo_relations `grep -hoE 'CREATE (TABLE IF NOT EXISTS|OR REPLACE VIEW) public\.[a-z0-9_]+' supabase/migrations/20261123*.sql | sort -u`

-- The functions and relations the build-out files name (parsed from the files).
CREATE TEMP TABLE bo_function_name ON COMMIT DROP AS
SELECT DISTINCT m[1] AS name FROM regexp_matches(:'bo_functions', 'FUNCTION public\.([a-z0-9_]+)', 'g') AS m;
CREATE TEMP TABLE bo_relation_name ON COMMIT DROP AS
SELECT DISTINCT m[1] AS name FROM regexp_matches(:'bo_relations', '(?:EXISTS|VIEW) public\.([a-z0-9_]+)', 'g') AS m;

-- Every overload of those names in public, with its EXECUTE grantees (the owner excluded).
CREATE TEMP TABLE fn_actual ON COMMIT DROP AS
SELECT 'public.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')' AS ident,
       ARRAY(SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE r.rolname::text END
             FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS a
             LEFT JOIN pg_roles AS r ON r.oid = a.grantee
             WHERE a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner
             ORDER BY 1) AS roles,
       p.prosecdef,
       coalesce(p.proconfig, '{}') AS proconfig
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace AND n.nspname = 'public'
WHERE p.proname IN (SELECT name FROM bo_function_name);

CREATE TEMP TABLE fn_want ON COMMIT DROP AS
SELECT f.key AS ident, ARRAY(SELECT jsonb_array_elements_text(f.value) ORDER BY 1) AS roles
FROM jsonb_each(:'grants'::jsonb -> 'functions') AS f;

GRANT SELECT ON fn_actual, fn_want, bo_function_name, bo_relation_name TO PUBLIC;

SELECT tests.ok((SELECT count(*) FROM bo_function_name) >= 100, format('the build-out files name %s functions (parser sanity)', (SELECT count(*) FROM bo_function_name)));
SELECT tests.ok((SELECT count(*) FROM bo_relation_name) >= 20, format('the build-out files name %s tables and views (parser sanity)', (SELECT count(*) FROM bo_relation_name)));

-- Exactly the fixture's grants, function by function.
SELECT tests.is(coalesce(a.roles::text, '<missing from the database>'), w.roles::text, format('EXECUTE on %s', w.ident))
FROM fn_want AS w LEFT JOIN fn_actual AS a ON a.ident = w.ident
ORDER BY w.ident;

SELECT tests.is_empty($q$SELECT ident FROM fn_actual WHERE ident NOT IN (SELECT ident FROM fn_want)$q$,
  'no build-out function is missing from function-grants.json');
SELECT tests.is_empty($q$SELECT ident FROM fn_actual WHERE roles && ARRAY['PUBLIC', 'anon']$q$,
  'no build-out function is executable by PUBLIC or anon');
SELECT tests.is_empty($q$SELECT ident FROM fn_want WHERE roles && ARRAY['PUBLIC', 'anon']$q$,
  'the fixture never grants PUBLIC or anon');
SELECT tests.is_empty($q$SELECT ident FROM fn_actual WHERE prosecdef AND NOT EXISTS (SELECT 1 FROM unnest(proconfig) AS c WHERE c LIKE 'search_path=%')$q$,
  'every build-out SECURITY DEFINER function in public sets search_path');
SELECT tests.is_empty($q$SELECT ident FROM fn_actual WHERE NOT EXISTS (SELECT 1 FROM unnest(proconfig) AS c WHERE c LIKE 'search_path=%')$q$,
  'every build-out function (definer or not) sets search_path');
SELECT tests.is_empty(
  $q$SELECT 'public.' || p.proname FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace AND n.nspname = 'public'
     WHERE p.proname IN (SELECT name FROM bo_function_name) AND p.prorettype = 'trigger'::regtype
       AND EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS a WHERE a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner)$q$,
  'trigger functions are executable by nobody');
SELECT tests.is((SELECT count(*) FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace AND n.nspname = 'public' WHERE p.proname = 'log_permission_change'), 1::bigint,
  'log_permission_change has exactly one overload (CC-4)');

-- Relations: anon nothing; authenticated exactly the fixture; the service role everything.
CREATE TEMP TABLE rel_actual ON COMMIT DROP AS
SELECT 'public.' || c.relname AS ident, c.oid, c.relkind,
       ARRAY(SELECT g.privilege_type::text FROM information_schema.role_table_grants AS g
             WHERE g.table_schema = 'public' AND g.table_name = c.relname AND g.grantee = 'authenticated' ORDER BY 1) AS auth_privs,
       coalesce((SELECT jsonb_object_agg(x.privilege_type, x.cols) FROM (
         SELECT g.privilege_type, jsonb_agg(g.column_name ORDER BY g.column_name) AS cols
         FROM information_schema.column_privileges AS g
         WHERE g.table_schema = 'public' AND g.table_name = c.relname AND g.grantee = 'authenticated'
           AND NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants AS t
                           WHERE t.table_schema = 'public' AND t.table_name = c.relname AND t.grantee = g.grantee AND t.privilege_type = g.privilege_type)
         GROUP BY g.privilege_type) AS x), '{}'::jsonb) AS auth_cols
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE c.relname IN (SELECT name FROM bo_relation_name) AND c.relkind IN ('r', 'v', 'm', 'p');
GRANT SELECT ON rel_actual TO PUBLIC;

SELECT tests.is(coalesce(a.auth_privs::text, '<missing from the database>'), ARRAY(SELECT jsonb_array_elements_text(r.value -> 'authenticated') ORDER BY 1)::text,
                format('authenticated privileges on %s', r.key))
FROM jsonb_each(:'grants'::jsonb -> 'relations') AS r LEFT JOIN rel_actual AS a ON a.ident = r.key
ORDER BY r.key;
SELECT tests.is(coalesce(a.auth_cols, '"<missing>"'::jsonb), r.value -> 'authenticatedColumns', format('authenticated column grants on %s', r.key))
FROM jsonb_each(:'grants'::jsonb -> 'relations') AS r LEFT JOIN rel_actual AS a ON a.ident = r.key
ORDER BY r.key;
SELECT tests.is(CASE a.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'view' ELSE 'table' END, r.value ->> 'kind', format('%s is a %s', r.key, r.value ->> 'kind'))
FROM jsonb_each(:'grants'::jsonb -> 'relations') AS r JOIN rel_actual AS a ON a.ident = r.key
ORDER BY r.key;
SELECT tests.is_empty(format($q$SELECT ident FROM rel_actual WHERE ident NOT IN (SELECT jsonb_object_keys(%L::jsonb -> 'relations'))$q$, :'grants'),
  'no build-out table or view is missing from function-grants.json');
SELECT tests.is_empty(
  $q$SELECT ident FROM rel_actual
     WHERE has_table_privilege('anon', oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
        OR has_any_column_privilege('anon', oid, 'SELECT, INSERT, UPDATE, REFERENCES')$q$,
  'anon holds no privilege (table or column, directly or through PUBLIC) on any build-out table or view');
SELECT tests.is_empty(
  $q$SELECT ident FROM rel_actual
     WHERE relkind = 'r' AND NOT (has_table_privilege('service_role', oid, 'SELECT') AND has_table_privilege('service_role', oid, 'INSERT')
                                  AND has_table_privilege('service_role', oid, 'UPDATE') AND has_table_privilege('service_role', oid, 'DELETE'))$q$,
  'the service role keeps full access to every build-out table (rule 4)');
SELECT tests.is_empty(
  $q$SELECT ident FROM rel_actual AS a JOIN pg_class AS c ON c.oid = a.oid WHERE a.relkind = 'r' AND NOT c.relrowsecurity$q$,
  'every build-out table has row level security on');
SELECT tests.is_empty(
  $q$SELECT ident FROM rel_actual AS a WHERE a.relkind = 'r' AND obj_description(a.oid, 'pg_class') IS NULL$q$,
  'every build-out table has a COMMENT');
SELECT tests.is_empty(
  $q$SELECT ident FROM rel_actual AS a JOIN pg_class AS c ON c.oid = a.oid
     WHERE a.relkind = 'v' AND NOT coalesce(c.reloptions @> ARRAY['security_invoker=true'], false)$q$,
  'every build-out view is security_invoker (the underlying RLS applies)');
