// The W7 "never the last manager of admins" guard under concurrency
// (review round 2, last-manager-guard-race): two sessions disable each
// other, the company's only two managers of admins, at the same time. With
// lock_company_admin_managers() (20261123010000) the second waits for the
// first, then sees its actor disabled and is refused, so at least one
// active manager of admins remains.
//
// The SQL test runner is single-session, so this starts a kept harness
// cluster (through the lock, like harness-lifecycle.test.mjs: never run
// this file under /tmp/storm-db.lock), seeds company RC with two dpa users
// and races two psql sessions as service_role. The cluster is stopped in
// `finally`. Without PostgreSQL or flock the test is skipped.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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

/** Runs a command; resolves to { code, stdout, stderr }. */
function run(cmd, args, { input = null } = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('close', (code) => resolvePromise({ code, stdout, stderr }));
    if (input !== null) child.stdin.end(input);
    else child.stdin.end();
  });
}

/** Parses the kept cluster's connect and stop lines from the harness output. */
function keptCluster(stdout) {
  const connect = stdout.match(/^# connect: (\S+) -h (\S+) -p (\d+) -U (\S+) (\S+)\s*$/m);
  const stop = stdout.match(/^# stop:\s+(.+)$/m);
  if (!connect || !stop) return null;
  const [, psql, host, port, user, db] = connect;
  return { psql, args: ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-h', host, '-p', port, '-U', user, db], stop: stop[1].trim() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('two concurrent disables of the last two managers of admins leave one manager', { skip, timeout: TIMEOUT }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'storm-db-race-'));
  let cluster = null;
  try {
    const harness = await run('flock', [
      '-w', '900', LOCK, process.execPath, HARNESS,
      '--keep', '--no-fidelity', '--no-contract', '--tests', '00_harness/**', '--report', join(dir, 'report.json'),
    ]);
    cluster = keptCluster(harness.stdout);
    assert.ok(cluster, `the harness kept a cluster and printed its connect and stop lines:\n${harness.stdout}${harness.stderr}`);
    assert.equal(harness.code, 0, harness.stdout + harness.stderr);

    const psql = (sql) => run(cluster.psql, [...cluster.args, '-c', sql]);
    const seed = await psql(
      "SELECT tests.seed_company('RC'); SELECT tests.seed_user('RC', 'RC.dpa1', 'dpa'); SELECT tests.seed_user('RC', 'RC.dpa2', 'dpa');",
    );
    assert.equal(seed.code, 0, seed.stderr);
    const managers = async () => {
      const r = await psql(
        "SELECT count(*) FROM public.profiles AS o WHERE o.company_id = tests.company_id('RC') AND o.user_id IS NOT NULL AND public.user_is_active(o.user_id) AND public.user_manages_admins_for(o.user_id, o.company_id)",
      );
      assert.equal(r.code, 0, r.stderr);
      return Number(r.stdout.trim().split('\n').pop());
    };
    assert.equal(await managers(), 2, 'setup: two active managers of admins in RC');

    // Session 1 disables dpa2 (actor dpa1) and holds its transaction open;
    // session 2 starts a second later and disables dpa1 (actor dpa2).
    const first = run(cluster.psql, cluster.args, {
      input: [
        'BEGIN;',
        'SET ROLE service_role;',
        "SELECT (public.set_membership_status(tests.user_id('RC.dpa2'), 'disabled', tests.user_id('RC.dpa1'), 'race 1')).status;",
        'SELECT pg_sleep(4);',
        'COMMIT;',
        '',
      ].join('\n'),
    });
    await sleep(1000);
    const second = run(cluster.psql, cluster.args, {
      input: [
        'BEGIN;',
        'SET ROLE service_role;',
        "SELECT (public.set_membership_status(tests.user_id('RC.dpa1'), 'disabled', tests.user_id('RC.dpa2'), 'race 2')).status;",
        'COMMIT;',
        '',
      ].join('\n'),
    });
    const [r1, r2] = await Promise.all([first, second]);

    assert.equal(r1.code, 0, `the first disable commits: ${r1.stderr}`);
    assert.match(r1.stdout, /disabled/);
    assert.notEqual(r2.code, 0, `the second disable must be refused, got: ${r2.stdout}`);
    assert.match(r2.stderr, /not_permitted|last_manager_of_admins/, r2.stderr);
    assert.ok((await managers()) >= 1, 'at least one active manager of admins remains');
  } finally {
    if (cluster) spawnSync('sh', ['-c', cluster.stop], { stdio: 'ignore' });
    rmSync(dir, { recursive: true, force: true });
  }
});
