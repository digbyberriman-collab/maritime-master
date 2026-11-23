/**
 * SQL test files: discovery, glob selection, the wrapper the harness sends to
 * psql, and parsing of the TAP-like NOTICE stream that
 * `supabase/tests/harness/testlib.sql` emits (Phase 2 spec §D.6).
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Every `*.test.sql` under `dir`, as paths relative to it with `/` separators, sorted. */
export function listTestFiles(dir) {
  const out = [];
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(d, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (name.endsWith('.test.sql')) out.push(relative(dir, full).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * A glob as a RegExp over `/`-separated relative paths: `**` any number of
 * path segments, `*` within one segment, `?` one character, `{a,b}`
 * alternatives. A pattern without a wildcard also matches everything under
 * it when it names a directory (`00_harness` = `00_harness/**`).
 */
export function globToRegExp(glob) {
  let re = '';
  const g = String(glob).replace(/^\.\//, '').replace(/\/+$/, '');
  for (let i = 0; i < g.length; i += 1) {
    const ch = g[i];
    if (ch === '*' && g[i + 1] === '*') {
      const slash = g[i + 2] === '/';
      re += slash ? '(?:.*/)?' : '.*';
      i += slash ? 2 : 1;
    } else if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else if (ch === '{') {
      const end = g.indexOf('}', i);
      if (end === -1) re += '\\{';
      else {
        re += `(?:${g
          .slice(i + 1, end)
          .split(',')
          .map((alt) => alt.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]'))
          .join('|')})`;
        i = end;
      }
    } else re += ch.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  const wildcard = /[*?{]/.test(g);
  return new RegExp(wildcard ? `^${re}$` : `^${re}(?:/.*)?$`);
}

/** The test files `glob` selects (all when `glob` is null). */
export function selectTestFiles(files, glob) {
  if (!glob) return files;
  const re = globToRegExp(glob);
  return files.filter((f) => re.test(f));
}

const sqlString = (s) => `'${String(s).replace(/'/g, "''")}'`;

/**
 * What the harness pipes into psql for one test file (path relative to the
 * repo root, which is psql's working directory): one transaction, rolled
 * back, around `\i <file>`.
 */
export function testWrapper(relPath) {
  return [
    '\\set ON_ERROR_STOP 1',
    '\\set QUIET 1',
    '\\pset tuples_only on',
    '\\pset format unaligned',
    'SET client_min_messages = notice;',
    'BEGIN;',
    `SELECT tests._start(${sqlString(relPath)});`,
    `\\i ${relPath}`,
    'SELECT tests._finish();',
    'ROLLBACK;',
    '',
  ].join('\n');
}

const ASSERTION = /NOTICE:\s+(not ok|ok) (\d+) - (.*)$/;
const FINISHED = /^STORM-TESTS-FINISHED (\d+) (\d+)$/m;
/** `RAISE NOTICE '# <text>'` from a test file: an informational note kept in the report (e.g. an inventory). */
const NOTE = /NOTICE:\s+# (.*)$/;
/** The summary line `tests._finish()` emits is not a note. */
const SUMMARY = /^\S.*: \d+ tests, \d+ failed$/;

/**
 * Parses one test file's psql run. Returns
 * `{ passed, failed, total, aborted, assertions, failures, notes }`;
 * `aborted` is the reason the file did not reach `tests._finish()` (an
 * error, or a file with no assertions), else null; `notes` are the
 * `RAISE NOTICE '# …'` lines of the file (not the summary line).
 */
export function parseTestRun({ code, stdout, stderr }, firstError) {
  const assertions = [];
  const notes = [];
  for (const line of String(stderr).split('\n')) {
    const m = line.match(ASSERTION);
    if (m) {
      assertions.push({ ok: m[1] === 'ok', n: Number(m[2]), description: m[3] });
      continue;
    }
    const n = line.match(NOTE);
    if (n && !SUMMARY.test(n[1])) notes.push(n[1]);
  }
  const finished = String(stdout).match(FINISHED);
  const passed = assertions.filter((a) => a.ok).length;
  const failed = assertions.length - passed;
  let aborted = null;
  if (code !== 0 || !finished) {
    aborted = firstError(stderr) ?? (code !== 0 ? `psql exited ${code}` : 'did not reach tests._finish() (a COMMIT, ROLLBACK or \\q in the test file?)');
  } else if (assertions.length === 0) {
    aborted = 'no assertions ran';
  } else if (Number(finished[1]) !== assertions.length) {
    aborted = `tests._finish() counted ${finished[1]} assertions but ${assertions.length} were reported (client_min_messages raised above NOTICE?)`;
  }
  return {
    passed,
    failed,
    total: assertions.length,
    aborted,
    assertions,
    failures: assertions.filter((a) => !a.ok).map((a) => `not ok ${a.n} - ${a.description}`),
    notes,
  };
}
