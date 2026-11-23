/**
 * PostgreSQL binaries and the throwaway cluster of the DB harness (Phase 2
 * spec §D.2).
 *
 * Discovery order: `--pg-bin`, `pg_config --bindir`, the highest
 * `/usr/lib/postgresql/<n>/bin`, then `PATH`. A candidate counts only when it
 * holds `initdb`, `pg_ctl`, `postgres` and `psql` and `postgres --version`
 * is 15 or newer (`security_invoker` views). An explicit `--pg-bin` that does
 * not qualify is final: there is no fallback, so `--pg-bin /nonexistent`
 * reports "no PostgreSQL".
 *
 * The cluster lives in `/tmp/storm-pg-<pid>/` (`data/`, socket dir `s/`,
 * `server.log`): short enough for the 107-byte unix socket limit, and never
 * under the scratchpad. It listens on a unix socket only
 * (`listen_addresses=''`); the port (picked free on 127.0.0.1) only names
 * the socket file. Postgres refuses to run as root, so when uid is 0 the
 * directory is chowned to `postgres` and `initdb` / `pg_ctl` run through
 * `runuser -u postgres --`; `psql` runs as the current user.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { delimiter, join } from 'node:path';

export const REQUIRED_BINARIES = ['initdb', 'pg_ctl', 'postgres', 'psql'];
export const MIN_MAJOR = 15;

const isExecutableFile = (path) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

/** The major version a `postgres --version` line names, or null. */
export function parsePgVersion(text) {
  const m = String(text).match(/\(PostgreSQL\)\s+(\d+)(?:\.(\d+))?/) ?? String(text).match(/PostgreSQL\s+(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return { major: Number(m[1]), minor: m[2] === undefined ? 0 : Number(m[2]), text: String(text).trim() };
}

/** Checks one directory; returns `{ binDir, version }` or `{ binDir, problem }`. */
export function inspectBinDir(binDir) {
  if (!binDir || !existsSync(binDir)) return { binDir, problem: 'directory does not exist' };
  const missing = REQUIRED_BINARIES.filter((b) => !isExecutableFile(join(binDir, b)));
  if (missing.length) return { binDir, problem: `missing ${missing.join(', ')}` };
  const out = spawnSync(join(binDir, 'postgres'), ['--version'], { encoding: 'utf8' });
  const version = parsePgVersion(`${out.stdout ?? ''}${out.stderr ?? ''}`);
  if (!version) return { binDir, problem: 'postgres --version gave no version' };
  if (version.major < MIN_MAJOR) return { binDir, problem: `PostgreSQL ${version.major} is older than ${MIN_MAJOR}` };
  return { binDir, version };
}

/** `/usr/lib/postgresql/<n>/bin` directories, highest major first. */
export function debianBinDirs(root = '/usr/lib/postgresql') {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((d) => /^\d+(?:\.\d+)?$/.test(d))
    .sort((a, b) => Number(b) - Number(a))
    .map((d) => join(root, d, 'bin'));
}

/**
 * Finds the binaries. Returns `{ binDir, version, tried }` or
 * `{ binDir: null, tried }` where `tried` lists every candidate and why it
 * was refused.
 */
export function discoverPgBin({ pgBin = null, env = process.env } = {}) {
  const tried = [];
  const accept = (candidate, source) => {
    const result = inspectBinDir(candidate);
    tried.push({ source, binDir: candidate, problem: result.problem ?? null });
    return result.version ? { binDir: candidate, version: result.version, source, tried } : null;
  };
  if (pgBin) return accept(pgBin, '--pg-bin') ?? { binDir: null, tried };

  const pgConfig = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8', env });
  if (pgConfig.status === 0 && pgConfig.stdout.trim()) {
    const found = accept(pgConfig.stdout.trim(), 'pg_config --bindir');
    if (found) return found;
  }
  for (const dir of debianBinDirs()) {
    const found = accept(dir, '/usr/lib/postgresql');
    if (found) return found;
  }
  for (const dir of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
    if (!REQUIRED_BINARIES.every((b) => isExecutableFile(join(dir, b)))) continue;
    const found = accept(dir, 'PATH');
    if (found) return found;
  }
  return { binDir: null, tried };
}

/** A free TCP port on 127.0.0.1 (bind port 0, read it, close). */
export function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const isRoot = () => typeof process.getuid === 'function' && process.getuid() === 0;

/** Runs a server-side binary (initdb, pg_ctl) as `postgres` when we are root. */
function runServerBinary(cluster, bin, args, { allowFailure = false } = {}) {
  const exe = join(cluster.binDir, bin);
  const [cmd, argv] = cluster.asPostgres ? ['runuser', ['-u', 'postgres', '--', exe, ...args]] : [exe, args];
  const out = spawnSync(cmd, argv, { encoding: 'utf8', cwd: cluster.root, maxBuffer: 64 * 1024 * 1024 });
  if (out.error) throw new Error(`${bin}: ${out.error.message}`);
  if (out.status !== 0 && !allowFailure) {
    throw new Error(`${bin} ${args.join(' ')} exited ${out.status}: ${`${out.stdout}\n${out.stderr}`.trim().slice(-2000)}`);
  }
  return out;
}

/** The locales `initdb` can use here: C.UTF-8 when the system has it, else C. */
function initdbLocales() {
  const out = spawnSync('locale', ['-a'], { encoding: 'utf8' });
  const list = out.status === 0 ? out.stdout.split('\n').map((l) => l.trim().toLowerCase()) : [];
  return list.includes('c.utf8') || list.includes('c.utf-8') ? ['C.UTF-8', 'C'] : ['C'];
}

/**
 * Creates and starts a cluster. Returns the cluster handle; `stopCluster`
 * tears it down. The handle is returned before `initdb` runs (through
 * `onCreated`) so the caller can register it for teardown at once.
 */
export async function startCluster({ binDir, database = 'storm', onCreated = () => {} }) {
  const root = `/tmp/storm-pg-${process.pid}`;
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  const cluster = {
    root,
    binDir,
    dataDir: join(root, 'data'),
    sockDir: join(root, 's'),
    logFile: join(root, 'server.log'),
    port: await freePort(),
    database,
    asPostgres: isRoot(),
    started: false,
    locale: null,
  };
  mkdirSync(cluster.sockDir, { recursive: true });
  onCreated(cluster);
  if (cluster.asPostgres) {
    const chown = spawnSync('chown', ['-R', 'postgres:postgres', root], { encoding: 'utf8' });
    if (chown.status !== 0) throw new Error(`chown postgres ${root} failed: ${chown.stderr}`);
  }

  let lastError = null;
  for (const locale of initdbLocales()) {
    const out = runServerBinary(cluster, 'initdb', ['-D', cluster.dataDir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', `--locale=${locale}`], {
      allowFailure: true,
    });
    if (out.status === 0) {
      cluster.locale = locale;
      lastError = null;
      break;
    }
    lastError = `${out.stdout}\n${out.stderr}`.trim().slice(-2000);
    rmSync(cluster.dataDir, { recursive: true, force: true });
  }
  if (lastError) throw new Error(`initdb failed: ${lastError}`);

  const serverOptions = [
    `-k ${cluster.sockDir}`,
    `-p ${cluster.port}`,
    "-c listen_addresses=''",
    '-c fsync=off',
    '-c synchronous_commit=off',
    '-c full_page_writes=off',
    '-c max_connections=20',
  ].join(' ');
  runServerBinary(cluster, 'pg_ctl', ['-D', cluster.dataDir, '-w', '-t', '60', '-l', cluster.logFile, '-o', serverOptions, 'start']);
  cluster.started = true;
  return cluster;
}

/**
 * Stops the server (`pg_ctl stop -m immediate`) and removes the directory.
 * Synchronous on purpose: it runs from signal and exit handlers. Never throws.
 */
export function stopCluster(cluster) {
  if (!cluster) return { stopped: false, removed: false };
  let stopped = false;
  try {
    if (cluster.started && existsSync(cluster.dataDir)) {
      const out = runServerBinary(cluster, 'pg_ctl', ['-D', cluster.dataDir, '-m', 'immediate', '-w', '-t', '30', 'stop'], { allowFailure: true });
      stopped = out.status === 0;
    }
  } catch {
    stopped = false;
  }
  cluster.started = false;
  let removed = false;
  try {
    rmSync(cluster.root, { recursive: true, force: true });
    removed = !existsSync(cluster.root);
  } catch {
    removed = false;
  }
  return { stopped, removed };
}

/** psql connection arguments for this cluster. */
export function psqlConnectionArgs(cluster, database = cluster.database) {
  return ['-h', cluster.sockDir, '-p', String(cluster.port), '-U', 'postgres', '-d', database];
}

/** The command a person pastes to connect to a kept cluster. */
export function psqlCommandLine(cluster) {
  return `${join(cluster.binDir, 'psql')} -h ${cluster.sockDir} -p ${cluster.port} -U postgres ${cluster.database}`;
}

/** The command that stops a kept cluster. */
export function stopCommandLine(cluster) {
  const pgCtl = `${join(cluster.binDir, 'pg_ctl')} -D ${cluster.dataDir} -m immediate stop`;
  const run = cluster.asPostgres ? `runuser -u postgres -- ${pgCtl}` : pgCtl;
  return `${run} && rm -rf ${cluster.root}`;
}
