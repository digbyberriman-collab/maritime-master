// SQL test selection and the TAP-like NOTICE parser (Phase 2 spec §D.6).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { firstError } from '../lib/psql.mjs';
import { globToRegExp, listTestFiles, parseTestRun, selectTestFiles, testWrapper } from '../lib/tests.mjs';

const FILES = ['00_harness/stub_smoke.test.sql', 'p1_vessel_tenancy/codes.test.sql', 'p2_reach/reach.test.sql', 'p2_reach/nested/deep.test.sql', 'zz_platform/acl.test.sql'];

test('globs select test files relative to supabase/tests/sql', () => {
  assert.deepEqual(selectTestFiles(FILES, null), FILES);
  assert.deepEqual(selectTestFiles(FILES, '00_harness/**'), ['00_harness/stub_smoke.test.sql']);
  assert.deepEqual(selectTestFiles(FILES, 'p2_*/**'), ['p2_reach/reach.test.sql', 'p2_reach/nested/deep.test.sql']);
  assert.deepEqual(selectTestFiles(FILES, 'p2_*/*'), ['p2_reach/reach.test.sql']);
  assert.deepEqual(selectTestFiles(FILES, '{p1_*,zz_*}/**'), ['p1_vessel_tenancy/codes.test.sql', 'zz_platform/acl.test.sql']);
  assert.deepEqual(selectTestFiles(FILES, 'p2_reach'), ['p2_reach/reach.test.sql', 'p2_reach/nested/deep.test.sql'], 'a bare directory selects everything under it');
  assert.deepEqual(selectTestFiles(FILES, '**/acl.test.sql'), ['zz_platform/acl.test.sql']);
  assert.deepEqual(selectTestFiles(FILES, 'p9_*/**'), []);
  assert.equal(globToRegExp('a.b/**').test('aXb/c.test.sql'), false, 'dots are literal');
});

test('discovers *.test.sql recursively, sorted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'storm-db-tests-'));
  try {
    mkdirSync(join(dir, 'b/inner'), { recursive: true });
    mkdirSync(join(dir, 'a'));
    writeFileSync(join(dir, 'b/inner/x.test.sql'), '');
    writeFileSync(join(dir, 'a/y.test.sql'), '');
    writeFileSync(join(dir, 'a/helper.sql'), '');
    assert.deepEqual(listTestFiles(dir), ['a/y.test.sql', 'b/inner/x.test.sql']);
    assert.deepEqual(listTestFiles(join(dir, 'missing')), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the wrapper runs the file in one rolled-back transaction', () => {
  const w = testWrapper('supabase/tests/sql/00_harness/stub_smoke.test.sql');
  const lines = w.split('\n');
  assert.ok(lines.includes('\\set ON_ERROR_STOP 1'));
  const begin = lines.indexOf('BEGIN;');
  assert.ok(begin >= 0);
  assert.equal(lines[begin + 1], "SELECT tests._start('supabase/tests/sql/00_harness/stub_smoke.test.sql');");
  assert.equal(lines[begin + 2], '\\i supabase/tests/sql/00_harness/stub_smoke.test.sql');
  assert.equal(lines[begin + 3], 'SELECT tests._finish();');
  assert.equal(lines[begin + 4], 'ROLLBACK;');
  assert.match(testWrapper("o'brien.test.sql"), /_start\('o''brien\.test\.sql'\)/);
});

const notice = (text, line = 3) => `psql:supabase/tests/sql/x.test.sql:${line}: NOTICE:  ${text}`;

test('parses passes, failures with diagnostics and the finish marker', () => {
  const run = {
    code: 0,
    stdout: '\nt\nf\nSTORM-TESTS-FINISHED 3 1\n',
    stderr: [notice('ok 1 - first'), notice('not ok 2 - second # got: 1, want: 2'), 'NOTICE:  ok 3 - third', notice('# x: 3 tests, 1 failed')].join('\n'),
  };
  const r = parseTestRun(run, firstError);
  assert.equal(r.passed, 2);
  assert.equal(r.failed, 1);
  assert.equal(r.total, 3);
  assert.equal(r.aborted, null);
  assert.deepEqual(r.failures, ['not ok 2 - second # got: 1, want: 2']);
});

test('keeps "# …" notices as notes, not the summary line', () => {
  const run = {
    code: 0,
    stdout: 'STORM-TESTS-FINISHED 1 0\n',
    stderr: [
      notice('# residual (own_row): public.user_sessions "Users can view their own sessions"'),
      notice('ok 1 - first'),
      notice('# supabase/tests/sql/x.test.sql: 1 tests, 0 failed'),
    ].join('\n'),
  };
  const r = parseTestRun(run, firstError);
  assert.equal(r.total, 1);
  assert.equal(r.aborted, null);
  assert.deepEqual(r.notes, ['residual (own_row): public.user_sessions "Users can view their own sessions"']);
  assert.deepEqual(parseTestRun({ code: 0, stdout: 'STORM-TESTS-FINISHED 1 0', stderr: notice('ok 1 - a') }, firstError).notes, []);
});

test('an error aborts the file and names the error', () => {
  const run = {
    code: 3,
    stdout: '',
    stderr: [notice('ok 1 - first'), 'psql:supabase/tests/sql/x.test.sql:9: ERROR:  division by zero'].join('\n'),
  };
  const r = parseTestRun(run, firstError);
  assert.equal(r.passed, 1);
  assert.match(r.aborted, /division by zero \(x\.test\.sql:9\)/);
});

test('no assertion, a missing finish marker or a count mismatch is not a pass', () => {
  assert.equal(parseTestRun({ code: 0, stdout: 'STORM-TESTS-FINISHED 0 0', stderr: '' }, firstError).aborted, 'no assertions ran');
  assert.match(parseTestRun({ code: 0, stdout: '', stderr: notice('ok 1 - a') }, firstError).aborted, /did not reach tests\._finish\(\)/);
  assert.match(parseTestRun({ code: 0, stdout: 'STORM-TESTS-FINISHED 2 0', stderr: notice('ok 1 - a') }, firstError).aborted, /counted 2 assertions but 1/);
});

test('firstError keeps DETAIL and HINT and the file:line', () => {
  const stderr = [
    'psql:supabase/migrations/20260101000000_a.sql:12: ERROR:  insert or update on table "vessels" violates foreign key constraint "vessels_company_id_fkey"',
    'DETAIL:  Key (company_id)=(x) is not present in table "companies".',
    'something else',
  ].join('\n');
  assert.equal(
    firstError(stderr),
    'insert or update on table "vessels" violates foreign key constraint "vessels_company_id_fkey" | DETAIL:  Key (company_id)=(x) is not present in table "companies". (20260101000000_a.sql:12)',
  );
  assert.equal(firstError('NOTICE:  fine'), null);
});
