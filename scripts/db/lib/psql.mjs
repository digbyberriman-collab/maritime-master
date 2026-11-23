/**
 * Runs psql against the harness cluster. Every call is its own session
 * (Supabase's database-level `search_path` applies), with `-X` (no
 * ~/.psqlrc), `ON_ERROR_STOP=1` and, for files, `-1` (one transaction).
 *
 * Child processes are tracked so the harness can kill them on SIGINT /
 * SIGTERM before it tears the cluster down.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { psqlConnectionArgs } from './pg.mjs';

const running = new Set();

/** Kills every psql still running (used by the signal handlers). */
export function killRunningPsql() {
  for (const child of running) {
    try {
      child.kill('SIGKILL');
    } catch {
      // already gone
    }
  }
  running.clear();
}

/**
 * Runs psql. `file` runs a script (`-f`), `input` is piped on stdin, `sql`
 * is one `-c` command. `singleTransaction` adds `-1`. Resolves to
 * `{ code, stdout, stderr }` (never rejects on a SQL error; rejects only when
 * psql cannot be started).
 */
export function runPsql(cluster, { file = null, input = null, sql = null, singleTransaction = false, cwd = process.cwd(), extraArgs = [], database } = {}) {
  const args = ['-X', '-v', 'ON_ERROR_STOP=1', ...psqlConnectionArgs(cluster, database ?? cluster.database), ...extraArgs];
  if (singleTransaction) args.push('-1');
  if (file) args.push('-f', file);
  if (sql !== null) args.push('-c', sql);
  return new Promise((resolve, reject) => {
    const child = spawn(join(cluster.binDir, 'psql'), args, {
      cwd,
      env: { ...process.env, PGOPTIONS: '', PGPASSWORD: '', PGTZ: 'UTC' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    running.add(child);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('error', (err) => {
      running.delete(child);
      reject(err);
    });
    child.on('close', (code, signal) => {
      running.delete(child);
      resolve({ code: code ?? (signal ? 128 : 1), stdout, stderr });
    });
    child.stdin.on('error', () => {
      // psql exited before reading all input (ON_ERROR_STOP); the exit code says why
    });
    if (input !== null) child.stdin.end(input);
    else child.stdin.end();
  });
}

/** Runs one query and returns its rows as arrays of strings (unaligned, tuples only, unit separator). */
export async function queryRows(cluster, sql, opts = {}) {
  const out = await runPsql(cluster, { sql, extraArgs: ['-A', '-t', '-q', '-F', '\x1f', '-R', '\x1e'], ...opts });
  if (out.code !== 0) throw new Error(`query failed: ${firstError(out.stderr) ?? out.stderr.trim()}\n${sql}`);
  return out.stdout
    .split('\x1e')
    .map((r) => r.replace(/^\n+|\n+$/g, ''))
    .filter((r) => r.length > 0)
    .map((r) => r.split('\x1f'));
}

/** The first `ERROR:` message in psql's stderr (with its DETAIL / HINT lines), or null. */
export function firstError(stderr) {
  const lines = String(stderr).split('\n');
  const i = lines.findIndex((l) => /\bERROR:\s/.test(l));
  if (i === -1) return null;
  const msg = [lines[i].replace(/^.*?\bERROR:\s+/, '').trim()];
  for (const extra of lines.slice(i + 1, i + 4)) {
    if (/^(DETAIL|HINT|CONTEXT|LINE \d+):/.test(extra.trim())) msg.push(extra.trim());
    else break;
  }
  const where = lines[i].match(/^psql:([^:]+):(\d+):/);
  return where ? `${msg.join(' | ')} (${where[1].split('/').pop()}:${where[2]})` : msg.join(' | ');
}
