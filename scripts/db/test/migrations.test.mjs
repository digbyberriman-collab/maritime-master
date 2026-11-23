// Version ordering and replay governance (Phase 2 spec §D.4).
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  BUILD_OUT_FROM,
  buildOutUpTo,
  isBuildOut,
  listMigrations,
  orderMigrations,
  parseMigrationName,
  readReplayConfig,
  replayEntry,
  replayVerdict,
  validateReplayConfig,
} from '../lib/migrations.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const MIGRATIONS = join(ROOT, 'supabase/migrations');
const HARNESS = join(ROOT, 'supabase/tests/harness');

test('parses migration names', () => {
  assert.deepEqual(parseMigrationName('20261123000100_platform_vessel_tenancy.sql'), { version: '20261123000100', name: 'platform_vessel_tenancy' });
  assert.equal(parseMigrationName('2026_bad.sql'), null);
  assert.equal(parseMigrationName('20261123000100_x.txt'), null);
});

test('orders by version, the accepted duplicate by file name', () => {
  const files = [
    '20260919130000_health_phase4_training.sql',
    '20260919120000_legal_module.sql',
    '20260101000000_first.sql',
    '20260919120000_health_phase3_wellness.sql',
  ];
  assert.deepEqual(orderMigrations(files), [
    '20260101000000_first.sql',
    '20260919120000_health_phase3_wellness.sql',
    '20260919120000_legal_module.sql',
    '20260919130000_health_phase4_training.sql',
  ]);
});

test('refuses any other shared version, and bad names', () => {
  assert.throws(() => orderMigrations(['20260101000000_a.sql', '20260101000000_b.sql']), /duplicate migration version 20260101000000/);
  // the accepted version with a different pair of files is not accepted either
  assert.throws(() => orderMigrations(['20260919120000_health_phase3_wellness.sql', '20260919120000_other.sql']), /duplicate migration version 20260919120000/);
  assert.throws(() => orderMigrations(['not-a-migration.sql']), /not a migration file name/);
});

test('splits legacy and build-out at 20261123000000', () => {
  assert.equal(BUILD_OUT_FROM, '20261123000000');
  assert.equal(isBuildOut('20261122235959_x_y.sql'), false);
  assert.equal(isBuildOut('20261123000000_platform_x.sql'), true);
  assert.equal(isBuildOut('20261123000100_platform_vessel_tenancy.sql'), true);
});

test('the repo migrations order with the duplicate pair adjacent, health before legal', () => {
  const { legacy, buildOut } = listMigrations(MIGRATIONS);
  assert.ok(legacy.length > 100);
  const i = legacy.indexOf('20260919120000_health_phase3_wellness.sql');
  assert.ok(i > 0);
  assert.equal(legacy[i + 1], '20260919120000_legal_module.sql');
  assert.ok(buildOut.every(isBuildOut));
  assert.ok(legacy.every((f) => !isBuildOut(f)));
});

test('--file selects the build-out files up to and including the target', () => {
  const files = ['20261123000100_platform_a.sql', '20261123000200_platform_b.sql', '20261123000300_platform_c.sql'];
  assert.deepEqual(buildOutUpTo(files, '20261123000200_platform_b.sql'), files.slice(0, 2));
  assert.deepEqual(buildOutUpTo(files, 'supabase/migrations/20261123000300_platform_c.sql'), files);
  assert.equal(buildOutUpTo(files, '20261123000400_platform_d.sql'), null);
  assert.equal(buildOutUpTo([], 'anything.sql'), null);
});

const LEGACY = ['20260101000000_a.sql', '20260102000000_b_copy.sql', '20260103000000_c.sql'];
const validate = (config) => validateReplayConfig(config, { legacyFiles: LEGACY, driftExists: (p) => p === 'drift/known.sql' });

test('a minimal replay.json is valid', () => {
  assert.deepEqual(validate({ version: 1, files: {} }), []);
  assert.deepEqual(
    validate({
      version: 1,
      files: {
        '20260101000000_a.sql': { action: 'apply', driftBefore: ['drift/known.sql'], reason: 'seed row' },
        '20260103000000_c.sql': { action: 'expect_failure', reason: 'r', evidence: 'e', errorMatch: 'boom' },
        '20260102000000_b_copy.sql': { action: 'skip', supersededBy: '20260103000000_c.sql' },
      },
      fidelityExceptions: { tables: { t: 'why' }, columns: { 't.c': 'why' }, functions: {}, views: {} },
    }),
    [],
  );
});

test('replay.json validation catches every malformed entry', () => {
  const problems = (files, extra = {}) => validate({ version: 1, files, ...extra }).join('\n');
  assert.match(problems({ '20260101000000_a.sql': { action: 'retry' } }), /unknown action "retry"/);
  assert.match(problems({ '20260101000000_a.sql': { action: 'expect_failure', evidence: 'e', errorMatch: 'x' } }), /expect_failure needs a non-empty "reason"/);
  assert.match(problems({ '20260101000000_a.sql': { action: 'expect_failure', reason: 'r', errorMatch: 'x' } }), /expect_failure needs a non-empty "evidence"/);
  assert.match(problems({ '20260101000000_a.sql': { action: 'expect_failure', reason: 'r', evidence: 'e' } }), /expect_failure needs a non-empty "errorMatch"/);
  assert.match(problems({ '20260101000000_a.sql': { action: 'skip' } }), /skip needs "supersededBy" or a "reason"/);
  assert.match(problems({ '20260101000000_a.sql': { action: 'skip', supersededBy: '20991231000000_nope.sql' } }), /is not a legacy migration/);
  assert.match(problems({ '20990101000000_unknown.sql': { action: 'apply' } }), /not a legacy migration in supabase\/migrations/);
  assert.match(problems({ '20260101000000_a.sql': { action: 'apply', errorMatch: 'x' } }), /"errorMatch" only applies to expect_failure/);
  assert.match(problems({ '20260101000000_a.sql': { driftBefore: ['drift/missing.sql'] } }), /does not exist/);
  assert.match(problems({ '20260101000000_a.sql': { driftBefore: ['../escape.sql'] } }), /must be drift\/<name>\.sql/);
  assert.match(problems({ '20260101000000_a.sql': { driftBefore: 'drift/known.sql' } }), /driftBefore must be a list/);
  assert.match(problems({ '20260101000000_a.sql': { driftBefore: ['drift/known.sql', 'drift/known.sql'] } }), /lists a patch twice/);
  assert.match(problems({ '20260101000000_a.sql': { action: 'apply', note: 'x' } }), /unknown key "note"/);
  assert.match(problems({}, { fidelityExceptions: { tables: { t: '' } } }), /needs a reason/);
  assert.match(problems({}, { fidelityExceptions: { columns: { nodot: 'why' } } }), /must be <table>\.<column>/);
  assert.match(problems({}, { fidelityExceptions: { enums: {} } }), /unknown key "enums"/);
  assert.match(validate({ version: 2, files: {} }).join('\n'), /version must be 1/);
  assert.match(validate([]).join('\n'), /must be a JSON object/);
});

test('unlisted files apply with no drift', () => {
  assert.deepEqual(replayEntry({ files: {} }, 'x.sql'), { action: 'apply', driftBefore: [] });
  assert.equal(replayEntry({ files: { 'x.sql': { action: 'skip', reason: 'r' } } }, 'x.sql').action, 'skip');
});

test('replay verdicts: unexpected failure, expected failure, expect_failure that applies', () => {
  const apply = { action: 'apply' };
  const expect = { action: 'expect_failure', errorMatch: 'text = uuid' };
  assert.deepEqual(replayVerdict(apply, { code: 0, error: null }), { ok: true, outcome: 'applied' });
  assert.equal(replayVerdict(apply, { code: 3, error: 'boom' }).ok, false);
  assert.equal(replayVerdict(apply, { code: 3, error: 'boom' }).outcome, 'unexpected_failure');
  assert.deepEqual(replayVerdict(expect, { code: 3, error: 'operator does not exist: text = uuid' }), { ok: true, outcome: 'expected_failure' });
  const wrongError = replayVerdict(expect, { code: 3, error: 'relation "x" does not exist' });
  assert.equal(wrongError.ok, false);
  assert.match(wrongError.problem, /different error/);
  const applied = replayVerdict(expect, { code: 0, error: null });
  assert.equal(applied.ok, false);
  assert.equal(applied.outcome, 'unexpected_success');
  assert.match(applied.problem, /remove the expect_failure entry/);
});

test('the repo replay.json is valid, and every drift patch cites its evidence', () => {
  const config = readReplayConfig(join(HARNESS, 'replay.json'));
  const { legacy } = listMigrations(MIGRATIONS);
  assert.deepEqual(validateReplayConfig(config, { legacyFiles: legacy, harnessDir: HARNESS }), []);
  const patches = new Set(Object.values(config.files).flatMap((e) => e.driftBefore ?? []));
  assert.ok(patches.size > 0);
  for (const p of patches) {
    const sql = readFileSync(join(HARNESS, p), 'utf8');
    assert.match(sql, /^-- Drift patch:/, `${p} starts with the drift header`);
    assert.match(sql, /-- Evidence:/, `${p} names its evidence`);
    assert.match(sql, /-- Before: \d{14}_/, `${p} names the file it runs before`);
    // schema state only (CC-25): no operators, casts or functions
    assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:OPERATOR|CAST|FUNCTION|PROCEDURE)\b/i, `${p} creates no operator, cast or function`);
  }
  for (const f of Object.keys(config.files)) assert.ok(existsSync(join(MIGRATIONS, f)), f);
  // no orphan patch: every file in drift/ is run before some migration
  const onDisk = readdirSync(join(HARNESS, 'drift')).filter((f) => f.endsWith('.sql')).map((f) => `drift/${f}`);
  assert.deepEqual(onDisk.filter((p) => !patches.has(p)), [], 'every drift patch is referenced by a driftBefore');
});
