// PostgreSQL binary discovery (Phase 2 spec §D.2). No cluster is started here.
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { debianBinDirs, discoverPgBin, inspectBinDir, parsePgVersion, psqlCommandLine, REQUIRED_BINARIES, stopCommandLine } from '../lib/pg.mjs';

test('parses postgres --version', () => {
  assert.deepEqual(parsePgVersion('postgres (PostgreSQL) 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)').major, 16);
  assert.equal(parsePgVersion('postgres (PostgreSQL) 15.2').minor, 2);
  assert.equal(parsePgVersion('postgres (PostgreSQL) 17beta1').major, 17);
  assert.equal(parsePgVersion('nothing here'), null);
});

function fakeBinDir(root, version, { missing = [] } = {}) {
  mkdirSync(root, { recursive: true });
  for (const b of REQUIRED_BINARIES.filter((x) => !missing.includes(x))) {
    const path = join(root, b);
    writeFileSync(path, b === 'postgres' ? `#!/bin/sh\necho "postgres (PostgreSQL) ${version}"\n` : '#!/bin/sh\nexit 0\n');
    chmodSync(path, 0o755);
  }
  return root;
}

test('a binaries directory needs all four tools and PostgreSQL >= 15', () => {
  const dir = mkdtempSync(join(tmpdir(), 'storm-db-pg-'));
  try {
    assert.equal(inspectBinDir(fakeBinDir(join(dir, 'ok'), '16.4')).version.major, 16);
    assert.match(inspectBinDir(fakeBinDir(join(dir, 'old'), '14.9')).problem, /older than 15/);
    assert.match(inspectBinDir(fakeBinDir(join(dir, 'partial'), '16.1', { missing: ['pg_ctl'] })).problem, /missing pg_ctl/);
    assert.match(inspectBinDir(join(dir, 'nope')).problem, /does not exist/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an explicit --pg-bin is final: no fallback when it does not qualify', () => {
  const found = discoverPgBin({ pgBin: '/nonexistent' });
  assert.equal(found.binDir, null);
  assert.deepEqual(found.tried, [{ source: '--pg-bin', binDir: '/nonexistent', problem: 'directory does not exist' }]);
});

test('an explicit --pg-bin that qualifies is used', () => {
  const dir = mkdtempSync(join(tmpdir(), 'storm-db-pg-'));
  try {
    const bin = fakeBinDir(join(dir, 'bin'), '15.6');
    const found = discoverPgBin({ pgBin: bin });
    assert.equal(found.binDir, bin);
    assert.equal(found.source, '--pg-bin');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Debian layout: highest major first', () => {
  const dir = mkdtempSync(join(tmpdir(), 'storm-db-pg-'));
  try {
    for (const v of ['9.6', '15', '17', '16', 'common']) mkdirSync(join(dir, v), { recursive: true });
    assert.deepEqual(debianBinDirs(dir), [join(dir, '17/bin'), join(dir, '16/bin'), join(dir, '15/bin'), join(dir, '9.6/bin')]);
    assert.deepEqual(debianBinDirs(join(dir, 'missing')), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('kept-cluster commands name the socket dir, port, database and runuser when root', () => {
  const cluster = { binDir: '/pg/bin', sockDir: '/tmp/storm-pg-1/s', port: 5999, database: 'storm', dataDir: '/tmp/storm-pg-1/data', root: '/tmp/storm-pg-1', asPostgres: true };
  assert.equal(psqlCommandLine(cluster), '/pg/bin/psql -h /tmp/storm-pg-1/s -p 5999 -U postgres storm');
  assert.equal(stopCommandLine(cluster), 'runuser -u postgres -- /pg/bin/pg_ctl -D /tmp/storm-pg-1/data -m immediate stop && rm -rf /tmp/storm-pg-1');
  assert.equal(stopCommandLine({ ...cluster, asPostgres: false }), '/pg/bin/pg_ctl -D /tmp/storm-pg-1/data -m immediate stop && rm -rf /tmp/storm-pg-1');
});
