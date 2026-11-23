-- Policy inventory (spec §A.7, CC-7; rules 3 and 15): every policy in
-- public and storage after the build-out, classified as active-aware or
-- residual. Every build-out policy (and every policy on a build-out table)
-- must be active-aware or TO service_role; the residual legacy policies
-- are listed as notes in the harness report (they admit a disabled user at
-- most for the access-token lifetime after the auth ban, spec §G 5) and are
-- ratcheted: a new residual policy fails this file.
--
-- Classes, first match wins:
--   service_role   TO service_role only
--   deny           USING / WITH CHECK false only
--   restrictive    AS RESTRICTIVE (can only narrow)
--   role_gated_unscoped  calls has_role / has_any_role and names no company   residual
--                  or vessel anywhere (no company_id / vessel_id column, no
--                  company or reach helper): a user_roles row of any company
--                  passes it, so it reaches every tenant (an own-row branch
--                  OR-ed beside the role does not scope the role branch).
--                  Ratcheted separately; the target is 0
--                  (20261123010500_platform_role_scoped_policies.sql)
--   active_aware   calls user_is_active, one of the seven redefined helpers
--                  or a phase 2 helper (reach, capability, record_readable,
--                  the *_write_allowed predicates, storage_path_allowed,
--                  has_role_in_company), or
--                  reads profiles in a subquery (a disabled user reads no
--                  profile row)
--   via_helper     calls a function whose body reaches one of those
--                  (hr_can_view, legal_can_view, nb_project_in_company, …)
--   inherits       a subquery over another RLS table
--   rbac_only      RBAC helpers only (user_has_permission, has_fleet_access, …)  residual
--   own_row        auth.uid() compared with an owner column                       residual
--   signed_in      auth.role() / auth.uid() IS NOT NULL                           residual
--   unscoped       no caller check at all (true, a soft-delete filter, a bucket   residual
--                  id): reference data or a legacy hole
--   other          anything else (must stay empty)                                residual

-- The policies and tables the build-out files create (parsed from the files).
\set bo_policies `grep -hoE 'CREATE POLICY ("[^"]+"|[a-z0-9_]+) ON ([a-z_]+\.)?[a-z0-9_]+' supabase/migrations/20261123*.sql | sort -u`
\set bo_tables `grep -hoE 'CREATE TABLE IF NOT EXISTS ([a-z_]+\.)?[a-z0-9_]+' supabase/migrations/20261123*.sql | sort -u`

CREATE TEMP TABLE bo_policy ON COMMIT DROP AS
SELECT DISTINCT btrim(m[1], '"') AS policyname, coalesce(nullif(rtrim(m[2], '.'), ''), 'public') AS schemaname, m[3] AS tablename
FROM regexp_matches(:'bo_policies', 'CREATE POLICY ("[^"]+"|[a-z0-9_]+) ON ([a-z_]+\.)?([a-z0-9_]+)', 'g') AS m;

CREATE TEMP TABLE bo_table ON COMMIT DROP AS
SELECT DISTINCT coalesce(nullif(rtrim(m[1], '.'), ''), 'public') AS schemaname, m[2] AS tablename
FROM regexp_matches(:'bo_tables', 'CREATE TABLE IF NOT EXISTS ([a-z_]+\.)?([a-z0-9_]+)', 'g') AS m;

-- Base helpers that check the caller is active, then every public function
-- whose body reaches one of them (depth-limited closure).
CREATE TEMP TABLE aware_base (name text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO aware_base VALUES
  ('user_is_active'), ('user_belongs_to_company'), ('get_user_company_id'), ('my_profile_id'), ('current_user_company_id'),
  ('has_role'), ('has_any_role'), ('legacy_profile_role'),
  ('user_can_reach_vessel'), ('user_has_fleet_reach'), ('user_vessel_reach'), ('has_capability'), ('user_company_for_admin'),
  ('is_company_actor'), ('record_readable'), ('rbac_user_roles_write_allowed'), ('permission_override_write_allowed'),
  ('storage_path_allowed'), ('has_role_in_company');

CREATE TEMP TABLE aware_via ON COMMIT DROP AS
WITH RECURSIVE reach(name, depth) AS (
  SELECT name COLLATE "C", 0 FROM aware_base
  UNION
  SELECT p.proname::text COLLATE "C", r.depth + 1
  FROM reach AS r
  JOIN pg_proc AS p ON p.prosrc ~ ('\m' || r.name || '\s*\(')
  JOIN pg_namespace AS n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE r.depth < 3
)
SELECT DISTINCT name FROM reach WHERE name NOT IN (SELECT name FROM aware_base);

CREATE TEMP TABLE rls_tables ON COMMIT DROP AS
SELECT c.relname::text AS tablename FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity;

CREATE TEMP TABLE inventory ON COMMIT DROP AS
WITH p AS (
  SELECT schemaname::text, tablename::text, policyname::text, permissive, roles::text[] AS roles, cmd,
         coalesce(qual, '') AS qual, coalesce(with_check, '') AS with_check,
         coalesce(qual, '') || ' ' || coalesce(with_check, '') AS expr
  FROM pg_policies WHERE schemaname IN ('public', 'storage')
),
calls AS (
  SELECT p.schemaname, p.tablename, p.policyname, array_agg(DISTINCT m[1]) AS fns
  FROM p, regexp_matches(p.expr, '([a-z_][a-z0-9_]*)\(', 'g') AS m
  GROUP BY 1, 2, 3
),
subq AS (
  SELECT p.schemaname, p.tablename, p.policyname, array_agg(DISTINCT m[1]) AS tbls
  FROM p, regexp_matches(p.expr, 'FROM (?:public\.)?([a-z_][a-z0-9_]*)', 'g') AS m
  GROUP BY 1, 2, 3
)
SELECT p.schemaname, p.tablename, p.policyname, p.cmd, p.roles,
  CASE
    WHEN p.roles = ARRAY['service_role'] THEN 'service_role'
    WHEN btrim(p.qual) IN ('', 'false') AND btrim(p.with_check) IN ('', 'false') AND (p.qual = 'false' OR p.with_check = 'false') THEN 'deny'
    WHEN p.permissive = 'RESTRICTIVE' THEN 'restrictive'
    WHEN p.expr ~ '\mhas_(any_)?role\s*\('
         AND NOT p.expr ~ '(company_id|vessel_id|user_belongs_to_company|get_user_company_id|current_user_company_id|user_can_reach_vessel|user_has_fleet_reach|user_company_for_admin|has_role_in_company|has_capability)'
      THEN 'role_gated_unscoped'
    WHEN coalesce(c.fns && (SELECT array_agg(name) FROM aware_base), false) OR coalesce('profiles' = ANY (s.tbls), false) THEN 'active_aware'
    WHEN coalesce(c.fns && (SELECT array_agg(name) FROM aware_via), false) THEN 'via_helper'
    WHEN coalesce(s.tbls && (SELECT array_agg(tablename) FROM rls_tables), false) THEN 'inherits'
    WHEN p.expr ~ '\m(user_has_permission|rbac_company_permission|has_fleet_access|user_has_module_access|has_module_permission)\s*\(' THEN 'rbac_only'
    WHEN p.expr ~ 'auth\.uid\(\)\s*=|=\s*auth\.uid\(\)|\(auth\.uid\(\)\)::text\s*=' THEN 'own_row'
    WHEN p.expr ~ 'auth\.role\(\)|auth\.uid\(\) IS NOT NULL' THEN 'signed_in'
    WHEN NOT p.expr ~ '(auth\.|\(\s*SELECT|EXISTS|[a-z_][a-z0-9_]*\()' THEN 'unscoped'
    ELSE 'other'
  END AS class
FROM p
LEFT JOIN calls AS c USING (schemaname, tablename, policyname)
LEFT JOIN subq AS s USING (schemaname, tablename, policyname);

-- ------------------------------------------------------------ sanity

SELECT tests.ok((SELECT count(*) FROM inventory) > 500, format('the inventory covers every policy in public and storage (%s)', (SELECT count(*) FROM inventory)));
SELECT tests.ok((SELECT count(*) FROM bo_policy) >= 10, format('the build-out files create %s policies', (SELECT count(*) FROM bo_policy)));
SELECT tests.ok((SELECT count(*) FROM bo_table) >= 4, format('the build-out files create %s tables', (SELECT count(*) FROM bo_table)));
SELECT tests.ok((SELECT count(*) FROM inventory WHERE class = 'active_aware') > 600, format('%s policies are active-aware through the helpers', (SELECT count(*) FROM inventory WHERE class = 'active_aware')));
SELECT tests.ok((SELECT count(*) FROM aware_via) > 10, format('%s domain helpers reach an active-aware helper', (SELECT count(*) FROM aware_via)));

-- ------------------------------------------------------------ build-out policies (rules 3, 15)

-- Every build-out policy exists after the build-out and is active-aware
-- (or TO service_role, or RESTRICTIVE: it can only narrow).
SELECT tests.ok(i.class IN ('active_aware', 'service_role', 'restrictive'),
                format('build-out policy %s.%s "%s" is %s', b.schemaname, b.tablename, b.policyname, coalesce(i.class, 'missing')))
FROM bo_policy AS b
LEFT JOIN inventory AS i USING (schemaname, tablename, policyname)
ORDER BY b.schemaname, b.tablename, b.policyname;

-- Every policy on a build-out table is one of the build-out policies.
SELECT tests.ok(EXISTS (SELECT 1 FROM bo_policy AS b WHERE b.schemaname = i.schemaname AND b.tablename = i.tablename AND b.policyname = i.policyname),
                format('policy %s.%s "%s" on a build-out table comes from a build-out file', i.schemaname, i.tablename, i.policyname))
FROM inventory AS i
JOIN bo_table AS t USING (schemaname, tablename)
ORDER BY i.tablename, i.policyname;

-- Every build-out table has RLS on and at least one policy.
SELECT tests.ok(c.relrowsecurity AND EXISTS (SELECT 1 FROM inventory AS i WHERE i.schemaname = t.schemaname AND i.tablename = t.tablename),
                format('build-out table %s.%s: RLS on, policies present', t.schemaname, t.tablename))
FROM bo_table AS t
JOIN pg_namespace AS n ON n.nspname = t.schemaname
JOIN pg_class AS c ON c.relnamespace = n.oid AND c.relname = t.tablename
ORDER BY t.tablename;

-- The two own-row profile policies now check the caller is active.
SELECT tests.is((SELECT class FROM inventory WHERE tablename = 'profiles' AND policyname = p), 'active_aware', format('profiles "%s" is active-aware', p))
FROM unnest(ARRAY['Users can view their own profile', 'Users can update their own profile']) AS p;
SELECT tests.ok((SELECT qual FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update their own profile') ~ 'user_is_active'
                AND (SELECT with_check FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update their own profile') ~ 'user_is_active',
                'the own-row update policy checks the active state in USING and WITH CHECK');

-- No new policy reads profiles inline (rule 15): build-out policies use helpers.
SELECT tests.ok(NOT (coalesce(p.qual, '') || coalesce(p.with_check, '')) ~ 'FROM (public\.)?profiles',
                format('build-out policy %s.%s "%s" has no inline profiles subquery', b.schemaname, b.tablename, b.policyname))
FROM bo_policy AS b
JOIN pg_policies AS p ON p.schemaname = b.schemaname AND p.tablename = b.tablename AND p.policyname = b.policyname
ORDER BY b.tablename, b.policyname;

-- ------------------------------------------------------------ residual list (report notes) and ratchet

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT class, count(*) AS n FROM inventory GROUP BY class ORDER BY class
  LOOP
    RAISE NOTICE '# policy inventory: % %', r.class, r.n;
  END LOOP;
  FOR r IN
    SELECT * FROM inventory
    WHERE class IN ('role_gated_unscoped', 'rbac_only', 'own_row', 'signed_in', 'unscoped', 'other')
    ORDER BY class, schemaname, tablename, policyname
  LOOP
    RAISE NOTICE '# residual (%): %.% "%" %', r.class, r.schemaname, r.tablename, r.policyname, r.cmd;
  END LOOP;
END
$$;

-- The residual set may shrink, never grow (raise the bound only with a
-- reason in the D3/D4 report). 2026-11-23 after files 1-12: see the notes.
SELECT tests.ok((SELECT count(*) FROM inventory WHERE class IN ('role_gated_unscoped', 'rbac_only', 'own_row', 'signed_in', 'unscoped', 'other')) <= 92,
                format('residual policies: %s (ratchet <= 92)', (SELECT count(*) FROM inventory WHERE class IN ('role_gated_unscoped', 'rbac_only', 'own_row', 'signed_in', 'unscoped', 'other'))));
SELECT tests.is((SELECT count(*) FROM inventory WHERE class = 'other'), 0::bigint, 'every policy falls in a named class');
-- Role-gated policies with no company or vessel scope (a user_roles row of
-- any company passes them): 45 before 20261123010400 / 20261123010500, 0
-- after. The ratchet is its own and stays at 0.
SELECT tests.is((SELECT count(*) FROM inventory WHERE class = 'role_gated_unscoped'), 0::bigint,
                format('role-gated policies without a company or vessel scope: %s (ratchet = 0)', (SELECT count(*) FROM inventory WHERE class = 'role_gated_unscoped')));
SELECT tests.ok((SELECT count(*) FROM inventory WHERE policyname IN (
                   'DPA and Captain can manage medical reports', 'Medical reports visible to authorized users', 'Travel agents and DPA can manage bookings',
                   'Users can view own flight requests', 'Authorized users can manage flight requests') AND class = 'active_aware') = 5,
                'the medical-report and flight policies are company-scoped and active-aware');
SELECT tests.ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'record_events' AND policyname = 'record_events_export_job_audience'
                          AND permissive = 'RESTRICTIVE' AND cmd = 'SELECT' AND roles = '{authenticated}'),
                'record_events_export_job_audience is a RESTRICTIVE select policy for authenticated');
