// Flag parsing of the DB harness (Phase 2 spec §D.1).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { defaultOptions, parseArgs, plannedPhases, UsageError } from '../lib/cli.mjs';

const HARNESS = resolve(dirname(fileURLToPath(import.meta.url)), '../harness.mjs');
const ROOT = resolve(dirname(HARNESS), '../..');

test('no flags is a full run', () => {
  assert.deepEqual(parseArgs([]), defaultOptions());
  assert.deepEqual(plannedPhases(parseArgs([])), { replay: true, fidelity: true, buildOut: true, contract: true, tests: true });
});

test('boolean flags', () => {
  const o = parseArgs(['--replay-only', '--keep', '--allow-skip', '--verbose', '--no-fidelity']);
  assert.equal(o.replayOnly, true);
  assert.equal(o.keep, true);
  assert.equal(o.allowSkip, true);
  assert.equal(o.verbose, true);
  assert.equal(o.noFidelity, true);
  assert.deepEqual(plannedPhases(o), { replay: true, fidelity: false, buildOut: false, contract: false, tests: false });
  const p = parseArgs(['--no-tests', '--no-contract']);
  assert.deepEqual(plannedPhases(p), { replay: true, fidelity: true, buildOut: true, contract: false, tests: false });
});

test('value flags take the next argument or =value', () => {
  const o = parseArgs(['--tests', 'p2_*/**', '--file=20261123000100_platform_vessel_tenancy.sql', '--report', '/tmp/r.json', '--pg-bin', '/usr/lib/postgresql/16/bin']);
  assert.equal(o.tests, 'p2_*/**');
  assert.equal(o.file, '20261123000100_platform_vessel_tenancy.sql');
  assert.equal(o.report, '/tmp/r.json');
  assert.equal(o.pgBin, '/usr/lib/postgresql/16/bin');
});

test('usage errors', () => {
  const cases = [
    [['--bogus'], /unknown flag --bogus/],
    [['positional'], /unexpected argument positional/],
    [['--tests'], /--tests needs a value/],
    [['--tests', '--keep'], /--tests needs a value/],
    [['--report='], /--report needs a value/],
    [['--keep=yes'], /--keep takes no value/],
    [['--keep', '--keep'], /given more than once/],
    [['--replay-only', '--file', 'x.sql'], /cannot be combined/],
    [['--replay-only', '--tests', 'p1_*'], /cannot be combined/],
    [['--no-tests', '--tests', 'p1_*'], /cannot be combined/],
  ];
  for (const [argv, message] of cases) {
    assert.throws(() => parseArgs(argv), (err) => err instanceof UsageError && message.test(err.message), argv.join(' '));
  }
});

test('--help wins over contradictions', () => {
  assert.equal(parseArgs(['--help', '--replay-only', '--file', 'x.sql']).help, true);
  assert.equal(parseArgs(['-h']).help, true);
});

// The CLI exit codes that need no PostgreSQL cluster.
const run = (args) => spawnSync(process.execPath, [HARNESS, ...args], { encoding: 'utf8' });

test('exit 3 on a usage error, with the usage text', () => {
  const out = run(['--bogus']);
  assert.equal(out.status, 3);
  assert.match(out.stderr, /unknown flag --bogus/);
  assert.match(out.stderr, /Exit codes: 0 green, 1 failure, 2 no PostgreSQL/);
});

test('exit 3 when --report points inside the repo', () => {
  const out = run(['--report', join(ROOT, 'supabase/tests/report.json')]);
  assert.equal(out.status, 3);
  assert.match(out.stderr, /never goes inside the repo/);
});

test('no PostgreSQL: exit 2, or 0 with --allow-skip and the SKIP line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'storm-db-cli-'));
  try {
    const report = join(dir, 'report.json');
    const strict = run(['--pg-bin', '/nonexistent', '--report', report]);
    assert.equal(strict.status, 2);
    assert.match(strict.stderr, /no PostgreSQL binaries found/);
    assert.equal(JSON.parse(readFileSync(report, 'utf8')).exitCode, 2);
    const skip = run(['--pg-bin', '/nonexistent', '--allow-skip', '--report', report]);
    assert.equal(skip.status, 0);
    assert.match(skip.stdout, /^SKIP: no PostgreSQL binaries found$/m);
    assert.equal(JSON.parse(readFileSync(report, 'utf8')).phases.discover.skipped, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--help prints the usage and exits 0', () => {
  const out = run(['--help']);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /flock \/tmp\/storm-db\.lock node scripts\/db\/harness\.mjs/);
});
