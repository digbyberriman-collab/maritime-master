-- Read-only baseline collection. Execute separately against staging and production.
-- Save results privately outside this repository; no credentials belong in files.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT current_database() AS database_name, version() AS server_version;

SELECT table_schema, table_name, column_name, ordinal_position,
       data_type, udt_schema, udt_name, is_nullable, column_default,
       is_identity, is_generated
FROM information_schema.columns
WHERE table_schema IN ('public', 'auth', 'storage', 'medical')
ORDER BY table_schema, table_name, ordinal_position;

SELECT n.nspname AS schema_name, c.relname AS table_name, c.relrowsecurity,
       c.relforcerowsecurity, con.conname, con.contype, con.convalidated,
       pg_get_constraintdef(con.oid, true) AS definition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_constraint con ON con.conrelid = c.oid
WHERE c.relkind IN ('r', 'p')
  AND n.nspname IN ('public', 'auth', 'storage', 'medical')
ORDER BY n.nspname, c.relname, con.conname;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname IN ('public', 'auth', 'storage', 'medical')
ORDER BY schemaname, tablename, policyname;

-- Estimates only. Exact row counts and row-level comparison must be collected
-- in the final reconciliation transaction, after the target scope is mapped.
SELECT schemaname, relname, n_live_tup AS estimated_rows
FROM pg_stat_user_tables
ORDER BY schemaname, relname;

COMMIT;
