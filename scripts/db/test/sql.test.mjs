// Statement splitting and the one-definition scanner (Phase 2 rule §0.2, proposed D-120).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { definitionsIn, legacyFunctionNames, qualifiedName, redefinitionProblems, topLevelStatements } from '../lib/sql.mjs';

test('top-level statements drop comments and keep dollar bodies as $$…$$', () => {
  const sql = `
    -- a comment; with a semicolon
    CREATE OR REPLACE FUNCTION public.f() RETURNS int LANGUAGE sql AS $fn$ SELECT 1; $fn$;
    /* block; comment */ SELECT ';' AS semi;
    DO $$ BEGIN CREATE POLICY "inner" ON t USING (true); END $$;
  `;
  const bodies = [];
  assert.deepEqual(topLevelStatements(sql, bodies), [
    'CREATE OR REPLACE FUNCTION public.f() RETURNS int LANGUAGE sql AS $$…$$',
    "SELECT ';' AS semi",
    'DO $$…$$',
  ]);
  assert.equal(bodies.length, 2);
});

test('qualified names fold case unless quoted, public by default', () => {
  assert.equal(qualifiedName('Foo'), 'public.foo');
  assert.equal(qualifiedName('Public.Foo'), 'public.foo');
  assert.equal(qualifiedName('"Mixed"'), 'public.Mixed');
  assert.equal(qualifiedName('tests."Is"'), 'tests.Is');
});

test('definitions: functions, procedures, views, materialized views and policies at top level only', () => {
  const defs = definitionsIn(`
    CREATE FUNCTION a() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;
    CREATE OR REPLACE FUNCTION public.B (x int) RETURNS int LANGUAGE sql AS $$ SELECT x $$;
    CREATE OR REPLACE PROCEDURE p() LANGUAGE sql AS $$ SELECT 1 $$;
    CREATE OR REPLACE VIEW public.v WITH (security_invoker = true) AS SELECT 1;
    CREATE MATERIALIZED VIEW IF NOT EXISTS mv AS SELECT 1;
    DROP POLICY IF EXISTS "Read own" ON public.t;
    CREATE POLICY "Read own" ON public.t FOR SELECT TO authenticated USING (auth.uid() = user_id);
    CREATE POLICY read_all ON t2 FOR SELECT TO service_role USING (true);
    DO $$ BEGIN EXECUTE 'CREATE FUNCTION hidden() RETURNS int LANGUAGE sql AS ''SELECT 1'''; END $$;
  `);
  assert.deepEqual(
    defs.map((d) => `${d.kind}:${d.key}`),
    ['function:public.a', 'function:public.b', 'function:public.p', 'view:public.v', 'view:public.mv', 'policy:Read own@public.t', 'policy:read_all@public.t2'],
  );
});

test('zero build-out files: no problem', () => {
  assert.deepEqual(redefinitionProblems([]), []);
});

test('one definition per object across build-out files', () => {
  const files = [
    { file: '20261123000100_platform_a.sql', sql: 'CREATE OR REPLACE FUNCTION public.helper(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$; CREATE OR REPLACE FUNCTION public.helper(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;' },
    { file: '20261123000200_platform_b.sql', sql: 'CREATE OR REPLACE FUNCTION public.other() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;' },
  ];
  // the same file may define (and overload) its own function
  assert.deepEqual(redefinitionProblems(files), []);

  const again = [...files, { file: '20261123000300_platform_c.sql', sql: 'CREATE OR REPLACE FUNCTION helper(text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;' }];
  const problems = redefinitionProblems(again);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /function public\.helper is created in more than one build-out file \(20261123000100_platform_a\.sql, 20261123000300_platform_c\.sql\)/);
});

test('views and policies, keyed by table for policies', () => {
  const problems = redefinitionProblems([
    { file: '1.sql', sql: 'CREATE OR REPLACE VIEW public.v AS SELECT 1; DROP POLICY IF EXISTS p ON a; CREATE POLICY p ON a USING (true);' },
    { file: '2.sql', sql: 'CREATE OR REPLACE VIEW v AS SELECT 2; DROP POLICY IF EXISTS p ON b; CREATE POLICY p ON b USING (true);' },
    { file: '3.sql', sql: 'DROP POLICY IF EXISTS "p" ON public.a; CREATE POLICY "p" ON public.a USING (false);' },
  ]);
  assert.equal(problems.length, 2);
  assert.ok(problems.some((p) => /view public\.v .*\(1\.sql, 2\.sql\)/.test(p)));
  assert.ok(problems.some((p) => /policy "p" on public\.a .*\(1\.sql, 3\.sql\)/.test(p)));
});

test('a legacy function redefined in two build-out files is named as such', () => {
  const legacy = legacyFunctionNames([{ file: '20260101000000_x.sql', sql: 'CREATE OR REPLACE FUNCTION public.user_belongs_to_company(uuid, uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;' }]);
  assert.ok(legacy.has('public.user_belongs_to_company'));
  const once = [{ file: '20261123010000_platform_user_status.sql', sql: 'CREATE OR REPLACE FUNCTION public.user_belongs_to_company(_user_id uuid, _company_id uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;' }];
  assert.deepEqual(redefinitionProblems(once, legacy), []);
  const twice = [...once, { file: '20261123010100_platform_access_rls.sql', sql: 'CREATE OR REPLACE FUNCTION public.user_belongs_to_company(_user_id uuid, _company_id uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;' }];
  const problems = redefinitionProblems(twice, legacy);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^legacy function public\.user_belongs_to_company is redefined in more than one build-out file/);
});
