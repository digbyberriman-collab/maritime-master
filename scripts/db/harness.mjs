#!/usr/bin/env node
/**
 * STORM local database harness (Phase 2 spec §D; proposed D-120, D-131).
 *
 * Run it ONLY as:  flock /tmp/storm-db.lock node scripts/db/harness.mjs [flags]
 * (one run at a time; see scripts/db/README.md for every flag).
 *
 * A full run: discover PostgreSQL binaries -> throwaway cluster in
 * /tmp/storm-pg-<pid> -> Supabase stub -> legacy replay (governed by
 * supabase/tests/harness/replay.json, drift patches in
 * supabase/tests/harness/drift/) -> fidelity against types.ts -> build-out
 * migrations twice (the second pass proves idempotency; one definition per
 * object, rule §0.2) -> test library -> pending-contract check (D4) -> SQL
 * tests (supabase/tests/sql/**\/*.test.sql, each in a rolled-back
 * transaction) -> JSON report -> teardown.
 *
 * Every exit path is honest and leaves nothing behind: a provisional report
 * (exitCode null, "run did not finish") replaces any earlier report as soon
 * as the report path is known; success, failure, SIGINT / SIGTERM / SIGHUP
 * and uncaught errors all tear the cluster down, kill the helper processes,
 * remove the schema snapshots ($TMPDIR/storm-schema-*-<pid>.json) and write
 * the final report with the exit code the process exits with.
 *
 * Exit codes: 0 green, 1 failure, 2 no PostgreSQL (without --allow-skip),
 * 3 usage error. The live Supabase project is never contacted.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, plannedPhases, USAGE, UsageError } from './lib/cli.mjs';
import { buildOutUpTo, listMigrations, readReplayConfig, replayEntry, replayVerdict, validateReplayConfig } from './lib/migrations.mjs';
import { discoverPgBin, psqlCommandLine, psqlConnectionArgs, startCluster, stopCluster, stopCommandLine } from './lib/pg.mjs';
import { firstError, killRunningPsql, queryRows, runPsql } from './lib/psql.mjs';
import { legacyFunctionNames, redefinitionProblems } from './lib/sql.mjs';
import { listTestFiles, parseTestRun, selectTestFiles, testWrapper } from './lib/tests.mjs';
import { diffFidelity, fidelitySummary, parseTypesTs, querySchema } from './fidelity.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// STORM_DB_MIGRATIONS_DIR exists for the harness's own tests (a scratch copy
// of the migrations plus synthetic build-out files); never set it otherwise.
const MIGRATIONS_DIR = process.env.STORM_DB_MIGRATIONS_DIR ? resolve(process.env.STORM_DB_MIGRATIONS_DIR) : join(ROOT, 'supabase/migrations');
const HARNESS_DIR = join(ROOT, 'supabase/tests/harness');
const SQL_TESTS_DIR = join(ROOT, 'supabase/tests/sql');
const STUB = 'supabase/tests/harness/supabase-stub.sql';
const TESTLIB = 'supabase/tests/harness/testlib.sql';
const REPLAY_JSON = join(HARNESS_DIR, 'replay.json');
const TYPES_TS = join(ROOT, 'src/integrations/supabase/types.ts');

// ------------------------------------------------------------------ output

let tapCount = 0;
const out = (line = '') => process.stdout.write(`${line}\n`);
const ok = (text) => out(`ok ${++tapCount} - ${text}`);
const notOk = (text, diagnostics = []) => {
  out(`not ok ${++tapCount} - ${text}`);
  for (const d of diagnostics) out(`  # ${String(d).replace(/\n/g, '\n  # ')}`);
};
const note = (text) => out(`# ${text}`);
const short = (text, max = 600) => {
  const s = String(text ?? '').trim();
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
};

// ------------------------------------------------------------------ teardown

let activeCluster = null;
let keepCluster = false;
let finalised = false;
/** Writes the run's report with an exit code (set by main once the report path is known; synchronous). */
let emitReport = null;
/** The run's problem list (the report's `problems`), so the exit paths can add to it. */
let runProblems = null;
/** Node helpers (schema-export, check-pending-contract) still running; killed on teardown so none writes after it. */
const runningNode = new Set();

/** The contract phase's schema snapshots for this run (spec §D.7); none may outlive it. */
function snapshotFiles() {
  return [join(tmpdir(), `storm-schema-legacy-${process.pid}.json`), join(tmpdir(), `storm-schema-buildout-${process.pid}.json`)];
}

/** Removes this run's schema snapshots. Synchronous and idempotent: it runs from the exit and signal handlers. */
function cleanupSnapshots() {
  for (const f of snapshotFiles()) {
    try {
      rmSync(f, { force: true });
    } catch {
      // nothing more can be done from an exit handler
    }
  }
}

function killRunningNode() {
  for (const child of runningNode) {
    try {
      child.kill('SIGKILL');
    } catch {
      // already gone
    }
  }
  runningNode.clear();
}

function printKept(cluster) {
  note(`cluster kept: ${cluster.root} (data ${cluster.dataDir})`);
  note(`connect: ${psqlCommandLine(cluster)}`);
  note(`stop:    ${stopCommandLine(cluster)}`);
}

/**
 * Tears the run down: kills psql and the node helpers, removes the schema
 * snapshots, then stops and removes the cluster (or prints how to reach it
 * with --keep; the snapshots go either way). Idempotent, synchronous.
 */
function finaliseCluster() {
  if (finalised) return;
  finalised = true;
  killRunningPsql();
  killRunningNode();
  cleanupSnapshots();
  if (!activeCluster) return;
  if (keepCluster) {
    try {
      writeFileSync(join(activeCluster.root, 'KEPT'), `${new Date().toISOString()}\n`);
    } catch {
      // the marker only protects the cluster from the stale-cluster sweep
    }
    printKept(activeCluster);
    return;
  }
  const { removed } = stopCluster(activeCluster);
  note(removed ? `cluster removed: ${activeCluster.root}` : `WARNING: could not remove ${activeCluster.root}; stop it with: ${stopCommandLine(activeCluster)}`);
}

/**
 * Ends the run from an exit path that is not main's own return (a signal,
 * an uncaught error, main rejecting): records `problem`, tears down, writes
 * the final report with `code`, and exits with the same code.
 */
function abortRun(problem, code) {
  runProblems?.push(problem);
  note(`FAIL: ${problem}`);
  finaliseCluster();
  emitReport?.(code);
  process.exit(code);
}

let exitHandlersInstalled = false;
function installExitHandlers() {
  if (exitHandlersInstalled) return;
  exitHandlersInstalled = true;
  const onSignal = (signal, code) => () => {
    note(`${signal}: stopping`);
    abortRun(`interrupted by ${signal}`, code);
  };
  process.on('SIGINT', onSignal('SIGINT', 130));
  process.on('SIGTERM', onSignal('SIGTERM', 143));
  process.on('SIGHUP', onSignal('SIGHUP', 129));
  process.on('uncaughtException', (err) => {
    process.stderr.write(`harness: uncaught error: ${err?.stack ?? err}\n`);
    abortRun(`harness error: ${err?.message ?? err}`, 1);
  });
  process.on('unhandledRejection', (err) => {
    process.stderr.write(`harness: unhandled rejection: ${err?.stack ?? err}\n`);
    abortRun(`harness error: ${err?.message ?? err}`, 1);
  });
  // Last resort (e.g. process.exit from elsewhere): no cluster, process or
  // snapshot outlives the run; the report then keeps its provisional
  // "run did not finish".
  process.on('exit', () => finaliseCluster());
}

/** Clusters a crashed run left behind (pid gone, no KEPT marker): stop and remove them. */
function removeStaleClusters(binDir) {
  for (const name of readdirSync('/tmp')) {
    const m = name.match(/^storm-pg-(\d+)$/);
    if (!m || Number(m[1]) === process.pid) continue;
    const root = join('/tmp', name);
    if (existsSync(join(root, 'KEPT'))) continue;
    let alive = true;
    try {
      process.kill(Number(m[1]), 0);
    } catch (err) {
      alive = err.code === 'EPERM';
    }
    if (alive) continue;
    const { removed } = stopCluster({ root, binDir, dataDir: join(root, 'data'), started: true, asPostgres: process.getuid?.() === 0 });
    note(
      removed
        ? `removed stale cluster ${root} (its harness run is gone)`
        : `WARNING: could not remove stale cluster ${root} (its harness run is gone); remove it by hand`,
    );
  }
}

// ------------------------------------------------------------------ phases

/** A migration's path as psql gets it: relative to the repo root when inside it (shorter error locations). */
const migrationPath = (file) => {
  const full = join(MIGRATIONS_DIR, file);
  const fromRoot = relative(ROOT, full);
  return fromRoot.startsWith('..') || isAbsolute(fromRoot) ? full : fromRoot.split('\\').join('/');
};

async function psqlFile(ctx, file, { label }) {
  const res = await runPsql(ctx.cluster, { file, singleTransaction: true, cwd: ROOT });
  if (ctx.options.verbose) {
    note(`psql -f ${file} (${label}) exit ${res.code}`);
    for (const l of `${res.stdout}${res.stderr}`.split('\n').filter(Boolean)) out(`  ${l}`);
  }
  return { ...res, error: res.code === 0 ? null : (firstError(res.stderr) ?? short(res.stderr || `psql exited ${res.code}`)) };
}

async function loadStub(ctx) {
  const res = await psqlFile(ctx, STUB, { label: 'stub' });
  ctx.report.phases.stub = { ok: res.code === 0, error: res.error };
  if (res.code !== 0) {
    ctx.problems.push(`stub: ${res.error}`);
    notOk(`stub: ${STUB} failed`, [res.error]);
    return false;
  }
  ok(`stub: ${STUB} loaded`);
  return true;
}

async function replayLegacy(ctx) {
  const { legacy } = ctx.migrations;
  const config = ctx.replayConfig;
  note(`phase replay: ${legacy.length} legacy migrations (version < 20261123000000), each in its own transaction`);
  const results = [];
  const counts = { applied: 0, expected_failure: 0, skipped: 0, problems: 0, drift: 0 };
  for (const file of legacy) {
    const entry = replayEntry(config, file);
    if (entry.action === 'skip') {
      results.push({ file, action: 'skip', ok: true, outcome: 'skipped', reason: entry.reason ?? null, supersededBy: entry.supersededBy ?? null });
      counts.skipped += 1;
      if (ctx.options.verbose) ok(`replay: ${file} skipped (${entry.supersededBy ? `superseded by ${entry.supersededBy}` : entry.reason})`);
      continue;
    }
    const drift = [];
    for (const patch of entry.driftBefore) {
      const res = await psqlFile(ctx, `supabase/tests/harness/${patch}`, { label: `drift for ${file}` });
      drift.push({ patch, ok: res.code === 0, error: res.error });
      counts.drift += 1;
      if (res.code !== 0) {
        counts.problems += 1;
        ctx.problems.push(`replay: drift patch ${patch} (before ${file}) failed: ${res.error}`);
        notOk(`replay: drift patch ${patch} before ${file} failed`, [res.error]);
      }
    }
    const res = await psqlFile(ctx, migrationPath(file), { label: 'legacy' });
    const verdict = replayVerdict(entry, { code: res.code, error: res.error });
    const record = { file, action: entry.action, ok: verdict.ok, outcome: verdict.outcome, drift };
    if (res.error) record.error = res.error;
    if (!verdict.ok) record.problem = verdict.problem;
    results.push(record);
    if (verdict.outcome === 'applied') counts.applied += 1;
    if (verdict.outcome === 'expected_failure') counts.expected_failure += 1;
    if (!verdict.ok) {
      counts.problems += 1;
      ctx.problems.push(`replay: ${file}: ${verdict.problem}`);
      notOk(`replay: ${file} (${verdict.outcome})`, [verdict.problem]);
    } else if (ctx.options.verbose || verdict.outcome === 'expected_failure') {
      ok(`replay: ${file} ${verdict.outcome === 'expected_failure' ? `failed as expected (${entry.reason})` : 'applied'}`);
    }
  }
  ctx.report.replay = results;
  ctx.report.phases.replay = { ok: counts.problems === 0, ...counts };
  const summary = `replay: ${counts.applied} applied, ${counts.expected_failure} expected failure(s), ${counts.skipped} skipped, ${counts.drift} drift patch run(s)`;
  if (counts.problems === 0) ok(summary);
  else notOk(`${summary}; ${counts.problems} problem(s)`);
}

async function fidelity(ctx) {
  note('phase fidelity: replayed public schema vs src/integrations/supabase/types.ts');
  const expected = parseTypesTs(readFileSync(TYPES_TS, 'utf8'), TYPES_TS);
  const actual = await querySchema((sql) => queryRows(ctx.cluster, sql));
  const result = diffFidelity(expected, actual, ctx.replayConfig.fidelityExceptions ?? {});
  ctx.report.fidelity = { ok: result.unexplained.length === 0, counts: result.counts, unexplained: result.unexplained, explained: result.explained, warnings: result.warnings };
  ctx.report.phases.fidelity = { ok: result.unexplained.length === 0, ...result.counts };
  if (ctx.options.verbose) for (const w of result.warnings) note(`fidelity warning ${w.kind} ${w.name}: ${w.detail}`);
  if (result.unexplained.length === 0) ok(`fidelity: ${fidelitySummary(result)}`);
  else {
    ctx.problems.push(`fidelity: ${result.unexplained.length} unexplained miss(es)`);
    notOk(
      `fidelity: ${fidelitySummary(result)}`,
      result.unexplained.map((m) => `${m.kind} ${m.name}: ${m.detail} (add a drift patch, or a fidelityExceptions entry with a reason)`),
    );
  }
}

async function buildOut(ctx) {
  const all = ctx.migrations.buildOut;
  const files = ctx.options.file ? buildOutUpTo(all, ctx.options.file) : all;
  const again = ctx.options.file ? [files[files.length - 1]] : files;
  note(`phase build-out: ${files.length} file(s) (version >= 20261123000000), pass 1 then pass 2 (${again.length} file(s), idempotency)`);
  const report = { ok: true, files, pass1: [], pass2: [], redefinitions: [] };
  ctx.report.buildOut = report;

  const legacySql = ctx.migrations.legacy.map((f) => ({ file: f, sql: readFileSync(join(MIGRATIONS_DIR, f), 'utf8') }));
  const buildSql = files.map((f) => ({ file: f, sql: readFileSync(join(MIGRATIONS_DIR, f), 'utf8') }));
  report.redefinitions = redefinitionProblems(buildSql, legacyFunctionNames(legacySql));
  if (report.redefinitions.length) {
    report.ok = false;
    ctx.problems.push(...report.redefinitions.map((p) => `build-out: ${p}`));
    notOk(`build-out: one definition per object (rule §0.2)`, report.redefinitions);
  } else ok(`build-out: one definition per object (rule §0.2) across ${files.length} file(s)`);

  for (const [pass, list] of [
    ['pass1', files],
    ['pass2', again],
  ]) {
    let failed = false;
    for (const file of list) {
      const res = await psqlFile(ctx, migrationPath(file), { label: `build-out ${pass}` });
      report[pass].push({ file, ok: res.code === 0, error: res.error });
      if (res.code === 0) {
        if (ctx.options.verbose) ok(`build-out ${pass}: ${file}`);
        continue;
      }
      failed = true;
      report.ok = false;
      const why = pass === 'pass2' ? `second run failed (not idempotent): ${res.error}` : res.error;
      ctx.problems.push(`build-out ${pass}: ${file}: ${why}`);
      notOk(`build-out ${pass}: ${file}`, [why]);
      if (pass === 'pass1') break;
    }
    if (!failed) ok(`build-out ${pass}: ${list.length} file(s) applied${pass === 'pass2' ? ' again (idempotent)' : ''}`);
    if (failed && pass === 'pass1') {
      note('build-out pass 2 skipped: pass 1 failed');
      break;
    }
  }
  ctx.report.phases.buildOut = { ok: report.ok, files: files.length, redefinitions: report.redefinitions.length };
  // The later phases need the files applied; a redefinition problem alone still lets them run.
  return report.pass1.every((r) => r.ok) && report.pass2.every((r) => r.ok) && report.pass1.length === files.length;
}

async function loadTestlib(ctx) {
  const res = await psqlFile(ctx, TESTLIB, { label: 'testlib' });
  ctx.report.phases.testlib = { ok: res.code === 0, error: res.error };
  if (res.code !== 0) {
    ctx.problems.push(`testlib: ${res.error}`);
    notOk(`testlib: ${TESTLIB} failed`, [res.error]);
    return false;
  }
  ok(`testlib: ${TESTLIB} loaded`);
  return true;
}

function runNode(script, args) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    runningNode.add(child);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('error', (err) => {
      stderr += `${err.message}\n`;
    });
    child.on('close', (code) => {
      runningNode.delete(child);
      resolvePromise({ code: code ?? 1, stdout, stderr });
    });
  });
}

/**
 * Contract phase (spec §D.7; D4 owns this hook). Snapshot the schema after
 * the legacy replay and after the build-out with scripts/db/schema-export.mjs,
 * then compare the difference with the pending TS types through
 * scripts/db/check-pending-contract.mjs. Until those scripts exist the phase
 * reports "not configured" (not a failure).
 */
const CONTRACT = {
  exporter: join(ROOT, 'scripts/db/schema-export.mjs'),
  checker: join(ROOT, 'scripts/db/check-pending-contract.mjs'),
  configured: () => existsSync(CONTRACT.exporter) && existsSync(CONTRACT.checker),
  legacySnapshot: () => snapshotFiles()[0],
  buildOutSnapshot: () => snapshotFiles()[1],
};

const exporterArgs = (ctx) => ['--psql', psqlConnectionArgs(ctx.cluster).join(' '), '--psql-bin', join(ctx.cluster.binDir, 'psql')];

async function contractSnapshotAfterReplay(ctx) {
  if (!CONTRACT.configured()) return;
  const res = await runNode(CONTRACT.exporter, [...exporterArgs(ctx), '--out', CONTRACT.legacySnapshot()]);
  ctx.contractBaseline = res.code === 0 ? CONTRACT.legacySnapshot() : null;
  if (res.code !== 0) ctx.contractBaselineError = short(res.stderr || res.stdout);
}

async function contract(ctx) {
  note('phase contract: build-out schema vs the pending TS types');
  if (!CONTRACT.configured()) {
    ctx.report.contract = { ok: true, status: 'not_configured', detail: 'scripts/db/schema-export.mjs and check-pending-contract.mjs arrive with D4 (spec §D.7)' };
    ctx.report.phases.contract = { ok: true, status: 'not_configured' };
    ok('contract: not configured yet (D4 adds scripts/db/check-pending-contract.mjs) # SKIP');
    return;
  }
  const problems = [];
  if (!ctx.contractBaseline) problems.push(`legacy snapshot failed: ${ctx.contractBaselineError ?? 'not taken'}`);
  let result = null;
  if (!problems.length) {
    const snap = await runNode(CONTRACT.exporter, [...exporterArgs(ctx), '--baseline', ctx.contractBaseline, '--out', CONTRACT.buildOutSnapshot()]);
    if (snap.code !== 0) problems.push(`build-out snapshot failed: ${short(snap.stderr || snap.stdout)}`);
    else {
      const check = await runNode(CONTRACT.checker, ['--export', CONTRACT.buildOutSnapshot(), '--json']);
      try {
        result = JSON.parse(check.stdout);
      } catch {
        result = null;
      }
      if (!result) problems.push(`check-pending-contract.mjs exited ${check.code}: ${short(check.stderr || check.stdout)}`);
      else problems.push(...result.mismatches.map((m) => `${m.message} [${m.key}]`));
    }
  }
  // Done with them; teardown removes them too, on every other path.
  cleanupSnapshots();
  ctx.report.contract = {
    ok: problems.length === 0,
    status: 'checked',
    problems,
    known: result?.known ?? [],
    warnings: result?.warnings ?? [],
    counts: result?.counts ?? null,
  };
  ctx.report.phases.contract = { ok: problems.length === 0, status: 'checked', problems: problems.length, known: result?.known?.length ?? 0, warnings: result?.warnings?.length ?? 0 };
  for (const k of result?.known ?? []) note(`contract: known mismatch (followup: ${short(k.followup, 200)}): ${short(k.message, 300)}`);
  for (const w of result?.warnings ?? []) note(`contract warning: ${short(w, 300)}`);
  const c = result?.counts;
  const summary = c ? ` (${c.tables} tables, ${c.views} views, ${c.columnSets} column sets, ${c.functions} functions)` : '';
  if (problems.length) {
    ctx.problems.push(...problems.map((p) => `contract: ${p}`));
    notOk(`contract: pending TS types do not mirror the build-out schema${summary}`, problems);
  } else ok(`contract: pending TS types mirror the build-out schema${summary}${result?.known?.length ? `; ${result.known.length} known mismatch(es) with followups` : ''}`);
}

async function sqlTests(ctx) {
  const all = listTestFiles(SQL_TESTS_DIR);
  const files = selectTestFiles(all, ctx.options.tests);
  note(`phase tests: ${files.length} SQL test file(s)${ctx.options.tests ? ` matching ${ctx.options.tests}` : ''} (each in a rolled-back transaction)`);
  const results = [];
  ctx.report.tests = results;
  if (files.length === 0) {
    ctx.problems.push(`tests: no SQL test file${ctx.options.tests ? ` matches ${ctx.options.tests}` : ' found'}`);
    notOk(`tests: no SQL test file${ctx.options.tests ? ` matches "${ctx.options.tests}" (relative to supabase/tests/sql/)` : ' found'}`);
    ctx.report.phases.tests = { ok: false, files: 0 };
    return;
  }
  let failedFiles = 0;
  let assertions = 0;
  for (const f of files) {
    const relPath = `supabase/tests/sql/${f}`;
    const res = await runPsql(ctx.cluster, { input: testWrapper(relPath), cwd: ROOT });
    if (ctx.options.verbose) for (const l of `${res.stdout}${res.stderr}`.split('\n').filter(Boolean)) out(`  ${l}`);
    const parsed = parseTestRun(res, firstError);
    assertions += parsed.total;
    results.push({
      file: f,
      passed: parsed.passed,
      failed: parsed.failed,
      aborted: parsed.aborted,
      failures: parsed.failures,
      ...(parsed.notes.length ? { notes: parsed.notes } : {}),
    });
    const label = `sql: ${f} (${parsed.passed}/${parsed.total} passed)`;
    if (parsed.failed === 0 && !parsed.aborted) {
      ok(label);
      if (ctx.options.verbose) for (const a of parsed.assertions) note(`  ok ${a.n} - ${a.description}`);
      if (parsed.notes.length) note(`${f}: ${parsed.notes.length} note(s) in the report${ctx.options.verbose ? '' : ' (--verbose prints them)'}`);
      if (ctx.options.verbose) for (const n of parsed.notes) note(`  ${n}`);
    } else {
      failedFiles += 1;
      const diag = [...parsed.failures];
      if (parsed.aborted) diag.push(`not ok - ${f}: aborted: ${parsed.aborted}`);
      ctx.problems.push(`tests: ${f}: ${parsed.failed} failed${parsed.aborted ? `, aborted: ${parsed.aborted}` : ''}`);
      notOk(label, diag);
    }
  }
  ctx.report.phases.tests = { ok: failedFiles === 0, files: files.length, failedFiles, assertions };
}

// ------------------------------------------------------------------ main

function defaultReportPath() {
  return join(tmpdir(), 'storm-db-report.json');
}

function resolveReportPath(option) {
  const path = option ? (isAbsolute(option) ? option : resolve(process.cwd(), option)) : defaultReportPath();
  const fromRoot = relative(ROOT, path);
  if (!fromRoot.startsWith('..') && !isAbsolute(fromRoot)) throw new UsageError(`--report ${option}: the report never goes inside the repo (use $TMPDIR or the scratchpad)`);
  return path;
}

async function main() {
  const started = Date.now();
  let options;
  let reportPath;
  try {
    options = parseArgs(process.argv.slice(2));
    if (options.help) {
      out(USAGE);
      return 0;
    }
    reportPath = resolveReportPath(options.report);
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`harness: ${err.message}\n\n${USAGE}\n`);
      return 3;
    }
    throw err;
  }

  const report = {
    tool: 'scripts/db/harness.mjs',
    startedAt: new Date(started).toISOString(),
    options,
    postgres: null,
    cluster: null,
    phases: {},
    replay: [],
    fidelity: null,
    buildOut: null,
    contract: null,
    tests: [],
    problems: [],
    exitCode: null,
  };
  // One list for the whole run: the phases, the exit paths and the report share it.
  const problems = report.problems;
  runProblems = problems;
  const writeReport = (exitCode, { quiet = false } = {}) => {
    report.exitCode = exitCode;
    report.durationMs = Date.now() - started;
    try {
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      if (!quiet) note(`report: ${reportPath}`);
      return true;
    } catch (err) {
      note(`WARNING: could not write the report to ${reportPath}: ${err.message}`);
      return false;
    }
  };
  // Provisional, at once: an earlier run's report (green or not) never
  // survives this one. Every exit path below replaces it with the final one.
  report.problems.push('run did not finish');
  if (!writeReport(null, { quiet: true })) {
    // A stale report the provisional one could not replace must not be read as this run's.
    try {
      rmSync(reportPath, { force: true });
    } catch {
      // the warning above already names the path
    }
  }
  report.problems.length = 0;
  emitReport = (exitCode) => {
    if (exitCode !== 0 && problems.length === 0) problems.push(`exit code ${exitCode}`);
    writeReport(exitCode);
  };
  keepCluster = options.keep;
  installExitHandlers();

  const pg = discoverPgBin({ pgBin: options.pgBin });
  if (!pg.binDir) {
    const tried = pg.tried.map((t) => `${t.source} ${t.binDir}: ${t.problem}`).join('; ');
    if (options.allowSkip) {
      out('SKIP: no PostgreSQL binaries found');
      if (tried) note(`tried: ${tried}`);
      report.phases.discover = { ok: true, skipped: true, tried: pg.tried };
      writeReport(0);
      return 0;
    }
    process.stderr.write(`harness: no PostgreSQL binaries found (need initdb, pg_ctl, postgres, psql; PostgreSQL >= 15).${tried ? ` Tried: ${tried}.` : ''} Pass --pg-bin <dir>, install PostgreSQL, or use --allow-skip.\n`);
    report.phases.discover = { ok: false, tried: pg.tried };
    problems.push('no PostgreSQL binaries found');
    writeReport(2);
    return 2;
  }
  report.postgres = { binDir: pg.binDir, version: pg.version.text, source: pg.source };

  // Static inputs first: a bad replay.json or --file never starts a cluster.
  let migrations;
  let replayConfig;
  try {
    migrations = listMigrations(MIGRATIONS_DIR);
    replayConfig = readReplayConfig(REPLAY_JSON);
  } catch (err) {
    process.stderr.write(`harness: ${err.message}\n`);
    problems.push(err.message);
    writeReport(1);
    return 1;
  }
  if (options.file && !buildOutUpTo(migrations.buildOut, options.file)) {
    process.stderr.write(`harness: --file ${options.file}: not a build-out migration (version >= 20261123000000) in supabase/migrations\n\n${USAGE}\n`);
    problems.push(`usage: --file ${options.file} is not a build-out migration`);
    writeReport(3);
    return 3;
  }

  out('TAP version 14');
  note(`STORM DB harness: ${pg.version.text} (${pg.binDir}, via ${pg.source})`);
  const replayProblems = validateReplayConfig(replayConfig, { legacyFiles: migrations.legacy, harnessDir: HARNESS_DIR });
  if (replayProblems.length) {
    notOk('replay.json is valid', replayProblems);
    problems.push(...replayProblems.map((p) => `replay.json: ${p}`));
    out(`1..${tapCount}`);
    writeReport(1);
    return 1;
  }
  ok(`replay.json is valid (${Object.keys(replayConfig.files ?? {}).length} governed file(s))`);

  removeStaleClusters(pg.binDir);
  const phases = plannedPhases(options);
  try {
    // Inside the try: an initdb or pg_ctl failure is a harness error with a
    // FAIL summary and a report, never a bare stack trace.
    const cluster = await startCluster({
      binDir: pg.binDir,
      onCreated: (c) => {
        activeCluster = c;
      },
    });
    report.cluster = { root: cluster.root, socketDir: cluster.sockDir, port: cluster.port, locale: cluster.locale, asPostgres: cluster.asPostgres };
    note(`cluster ${cluster.root} (socket ${cluster.sockDir}, port ${cluster.port}, locale ${cluster.locale}${cluster.asPostgres ? ', running as postgres via runuser' : ''})`);
    const ctx = { options, cluster, migrations, replayConfig, report, problems };
    const created = await runPsql(cluster, { sql: `CREATE DATABASE ${cluster.database}`, database: 'postgres' });
    if (created.code !== 0) throw new Error(`CREATE DATABASE failed: ${firstError(created.stderr) ?? created.stderr}`);
    await runPhases(ctx, phases);
  } catch (err) {
    // An error in the harness itself (not in the SQL under test) still fails the run with a report.
    problems.push(`harness error: ${err?.message ?? err}`);
    notOk('harness error', [err?.stack ?? String(err)]);
  }

  out(`1..${tapCount}`);
  const exitCode = problems.length ? 1 : 0;
  note(exitCode === 0 ? `PASS (${((Date.now() - started) / 1000).toFixed(1)} s)` : `FAIL: ${problems.length} problem(s)`);
  for (const p of problems) note(`  - ${short(p, 300)}`);
  finaliseCluster();
  writeReport(exitCode);
  return exitCode;
}

/** The phases after the database exists, in order. */
async function runPhases(ctx, phases) {
  if (await loadStub(ctx)) {
    await replayLegacy(ctx);
    if (phases.fidelity) await fidelity(ctx);
    else ok('fidelity: skipped (--no-fidelity) # SKIP');
    if (phases.buildOut) {
      if (phases.contract) await contractSnapshotAfterReplay(ctx);
      const built = await buildOut(ctx); // true when both passes applied every file
      const libLoaded = built && (await loadTestlib(ctx));
      if (phases.contract) {
        if (built) await contract(ctx);
        else note('contract skipped: the build-out failed');
      } else ok('contract: skipped (--no-contract) # SKIP');
      if (phases.tests) {
        if (libLoaded) await sqlTests(ctx);
        else note('SQL tests skipped: the build-out or the test library failed');
      } else ok('tests: skipped (--no-tests) # SKIP');
    }
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    process.stderr.write(`harness: ${err?.stack ?? err}\n`);
    abortRun(`harness error: ${err?.message ?? err}`, 1);
  },
);
