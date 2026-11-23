// The harness's exit paths (scripts/db/README.md §Teardown and §Output):
// a failed build-out, a SIGTERM mid-run and an initdb failure each tear the
// cluster down, leave no schema snapshot ($TMPDIR/storm-schema-*-<pid>.json)
// and write a final report whose exitCode is the process exit code, so an
// earlier run's green report never survives a run that did not pass.
//
// These start real throwaway clusters, so they need the PostgreSQL binaries
// and `flock`: each harness run takes /tmp/storm-db.lock itself (the only
// way the harness may run). Do not run this file under that lock. Without
// PostgreSQL or flock the tests are skipped.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { discoverPgBin } from '../lib/pg.mjs';

const HARNESS = fileURLToPath(new URL('../harness.mjs', import.meta.url));
const ROOT = resolve(dirname(HARNESS), '../..');
const LOCK = '/tmp/storm-db.lock';
const pg = discoverPgBin();
const hasFlock = spawnSync('flock', ['--version'], { encoding: 'utf8' }).status === 0;
const skip = !pg.binDir ? 'no PostgreSQL binaries' : !hasFlock ? 'no flock' : false;
const TIMEOUT = 15 * 60 * 1000;

/**
 * Runs the harness under the lock. `onStdout(text, child)` sees the output
 * so far. Resolves to { code, signal, stdout, stderr, pid } where pid is the
 * harness's own pid (read from its cluster line, else null).
 */
function runHarness(args, { env = {}, onStdout = null } = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn('flock', ['-w', '900', LOCK, process.execPath, HARNESS, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d;
      onStdout?.(stdout, child);
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('close', (code, signal) => {
      const m = stdout.match(/# cluster \/tmp\/storm-pg-(\d+) /);
      resolvePromise({ code, signal, stdout, stderr, pid: m ? Number(m[1]) : null });
    });
  });
}

/** This run's leftovers: schema snapshots in $TMPDIR, the cluster directory. */
function leftovers(pid) {
  const snaps = readdirSync(tmpdir()).filter((f) => new RegExp(`^storm-schema-.*-${pid}\\.json$`).test(f));
  return { snapshots: snaps, cluster: existsSync(`/tmp/storm-pg-${pid}`) };
}

const readReport = (path) => JSON.parse(readFileSync(path, 'utf8'));
/** A green report from an earlier run, which must not survive this one. */
const STALE_GREEN = { tool: 'scripts/db/harness.mjs', startedAt: '2000-01-01T00:00:00.000Z', exitCode: 0, problems: [] };

test('a failing build-out: exit 1, the report says 1, no snapshot or cluster left', { skip, timeout: TIMEOUT }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'storm-db-lifecycle-'));
  try {
    const migrations = join(dir, 'migrations');
    mkdirSync(migrations);
    for (const f of readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql'))) {
      copyFileSync(join(ROOT, 'supabase/migrations', f), join(migrations, f));
    }
    // Before every real build-out file, so --file runs it alone.
    writeFileSync(join(migrations, '20261123000050_synthetic_fail.sql'), 'SELECT 1/0;\n');
    const report = join(dir, 'report.json');
    writeFileSync(report, JSON.stringify(STALE_GREEN));

    const run = await runHarness(['--file', '20261123000050_synthetic_fail.sql', '--report', report], {
      env: { STORM_DB_MIGRATIONS_DIR: migrations },
    });
    assert.equal(run.code, 1, run.stdout + run.stderr);
    assert.ok(run.pid, 'the run started a cluster');
    assert.match(run.stdout, /not ok \d+ - build-out pass1: 20261123000050_synthetic_fail\.sql/);
    assert.match(run.stdout, /# FAIL: /);
    const r = readReport(report);
    assert.equal(r.exitCode, run.code);
    assert.notEqual(r.startedAt, STALE_GREEN.startedAt);
    assert.ok(r.problems.some((p) => p.includes('20261123000050_synthetic_fail.sql')), JSON.stringify(r.problems));
    assert.deepEqual(leftovers(run.pid), { snapshots: [], cluster: false });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('SIGTERM mid-run: exit 143, the report says 143 and why, no snapshot or cluster left', { skip, timeout: TIMEOUT }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'storm-db-lifecycle-'));
  try {
    const report = join(dir, 'report.json');
    writeFileSync(report, JSON.stringify(STALE_GREEN));
    let sent = false;
    // By the build-out phase the legacy snapshot exists, so teardown must remove it.
    const run = await runHarness(['--tests', '00_harness/**', '--report', report], {
      onStdout: (text) => {
        if (sent || !text.includes('# phase build-out')) return;
        const m = text.match(/# cluster \/tmp\/storm-pg-(\d+) /);
        if (!m) return;
        sent = true;
        process.kill(Number(m[1]), 'SIGTERM');
      },
    });
    assert.ok(sent, `the run reached the build-out phase: ${run.stdout}${run.stderr}`);
    assert.equal(run.code, 143, run.stdout + run.stderr);
    assert.match(run.stdout, /# SIGTERM: stopping/);
    const r = readReport(report);
    assert.equal(r.exitCode, 143);
    assert.notEqual(r.startedAt, STALE_GREEN.startedAt);
    assert.ok(r.problems.includes('interrupted by SIGTERM'), JSON.stringify(r.problems));
    assert.deepEqual(leftovers(run.pid), { snapshots: [], cluster: false });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('initdb fails: a harness error with a FAIL summary and a report that says 1, no cluster left', { skip, timeout: TIMEOUT }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'storm-db-lifecycle-'));
  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    for (const b of ['pg_ctl', 'postgres', 'psql']) symlinkSync(join(pg.binDir, b), join(bin, b));
    writeFileSync(join(bin, 'initdb'), '#!/bin/sh\necho "initdb: synthetic failure" >&2\nexit 1\n', { mode: 0o755 });
    const report = join(dir, 'report.json');
    writeFileSync(report, JSON.stringify(STALE_GREEN));

    const run = await runHarness(['--pg-bin', bin, '--report', report]);
    assert.equal(run.code, 1, run.stdout + run.stderr);
    assert.match(run.stdout, /not ok \d+ - harness error/);
    assert.match(run.stdout, /# FAIL: /);
    const r = readReport(report);
    assert.equal(r.exitCode, 1);
    assert.equal(r.postgres?.binDir, bin);
    assert.ok(r.problems.some((p) => p.startsWith('harness error: initdb failed')), JSON.stringify(r.problems));
    const pid = Number((run.stdout.match(/cluster removed: \/tmp\/storm-pg-(\d+)/) ?? [])[1]);
    assert.ok(pid, `the cluster directory was removed: ${run.stdout}`);
    assert.deepEqual(leftovers(pid), { snapshots: [], cluster: false });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a usage error after the report path is known still writes the final report (exit 3)', { skip, timeout: TIMEOUT }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'storm-db-lifecycle-'));
  try {
    const report = join(dir, 'report.json');
    writeFileSync(report, JSON.stringify(STALE_GREEN));
    const run = await runHarness(['--file', '20000101000000_not_a_build_out.sql', '--report', report]);
    assert.equal(run.code, 3, run.stdout + run.stderr);
    const r = readReport(report);
    assert.equal(r.exitCode, 3);
    assert.ok(r.problems.some((p) => p.startsWith('usage: --file')), JSON.stringify(r.problems));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
