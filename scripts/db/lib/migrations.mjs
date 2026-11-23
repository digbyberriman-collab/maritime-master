/**
 * Migration ordering and replay governance (Phase 2 spec §D.4).
 *
 * Files replay in version order. The one accepted legacy duplicate version
 * (`20260919120000`, two applied files; ledger "Known exceptions",
 * `src/test/config/migrations.test.ts`) replays in file-name order; any
 * other shared version is refused. Files with a version at or after
 * `20261123000000` are the build-out (D-12), everything before is legacy.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const BUILD_OUT_FROM = '20261123000000';
export const ACCEPTED_DUPLICATES = new Map([['20260919120000', ['20260919120000_health_phase3_wellness.sql', '20260919120000_legal_module.sql']]]);
export const REPLAY_ACTIONS = new Set(['apply', 'expect_failure', 'skip']);

const FILE_NAME = /^(\d{14})_(.+)\.sql$/;

/** `{ version, name }` of a migration file name, or null. */
export function parseMigrationName(file) {
  const m = String(file).match(FILE_NAME);
  return m ? { version: m[1], name: m[2] } : null;
}

/**
 * Orders migration file names for replay: by version, the accepted duplicate
 * by file name. Throws on a bad name or a duplicate version that is not the
 * accepted one (with exactly its two files).
 */
export function orderMigrations(files) {
  const bad = files.filter((f) => !parseMigrationName(f));
  if (bad.length) throw new Error(`not a migration file name: ${bad.join(', ')}`);
  const byVersion = new Map();
  for (const f of files) {
    const { version } = parseMigrationName(f);
    byVersion.set(version, [...(byVersion.get(version) ?? []), f]);
  }
  for (const [version, group] of byVersion) {
    if (group.length < 2) continue;
    const accepted = ACCEPTED_DUPLICATES.get(version);
    const same = accepted && accepted.length === group.length && [...group].sort().every((f, i) => f === [...accepted].sort()[i]);
    if (!same) throw new Error(`duplicate migration version ${version}: ${group.join(', ')}`);
  }
  return [...files].sort((a, b) => {
    const va = parseMigrationName(a).version;
    const vb = parseMigrationName(b).version;
    if (va !== vb) return va < vb ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

export const isBuildOut = (file) => parseMigrationName(file)?.version >= BUILD_OUT_FROM;

/** The migration files of a directory, split into ordered legacy and build-out lists. */
export function listMigrations(dir) {
  const files = orderMigrations(readdirSync(dir).filter((f) => f.endsWith('.sql')));
  return { legacy: files.filter((f) => !isBuildOut(f)), buildOut: files.filter(isBuildOut) };
}

/** The build-out files `--file <migration>` runs: every file up to and including it (accepts a bare name or a path). */
export function buildOutUpTo(buildOut, target) {
  const name = String(target).split('/').pop();
  const i = buildOut.indexOf(name);
  if (i === -1) return null;
  return buildOut.slice(0, i + 1);
}

/**
 * Problems in a parsed `replay.json` (empty when valid). `legacyFiles` are
 * the legacy migration names; `harnessDir` resolves `driftBefore` paths.
 */
export function validateReplayConfig(config, { legacyFiles, harnessDir = null, driftExists = null } = {}) {
  const problems = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) return ['replay.json must be a JSON object'];
  const known = new Set(['version', 'description', 'files', 'fidelityExceptions']);
  for (const key of Object.keys(config)) if (!known.has(key)) problems.push(`unknown top-level key "${key}"`);
  if (config.version !== 1) problems.push('version must be 1');
  const files = config.files ?? {};
  if (typeof files !== 'object' || Array.isArray(files)) problems.push('files must be an object keyed by migration file name');
  const legacy = new Set(legacyFiles ?? []);
  const exists = driftExists ?? ((p) => (harnessDir ? existsSync(join(harnessDir, p)) : true));
  for (const [file, entry] of Object.entries(files && typeof files === 'object' ? files : {})) {
    const where = `files["${file}"]`;
    if (!legacy.has(file)) {
      problems.push(`${where}: not a legacy migration in supabase/migrations (build-out files are never governed by replay.json)`);
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      problems.push(`${where}: must be an object`);
      continue;
    }
    const allowed = new Set(['action', 'driftBefore', 'reason', 'evidence', 'errorMatch', 'supersededBy']);
    for (const key of Object.keys(entry)) if (!allowed.has(key)) problems.push(`${where}: unknown key "${key}"`);
    const action = entry.action ?? 'apply';
    if (!REPLAY_ACTIONS.has(action)) problems.push(`${where}: unknown action "${action}" (apply | expect_failure | skip)`);
    const text = (k) => typeof entry[k] === 'string' && entry[k].trim().length > 0;
    if (action === 'expect_failure') {
      for (const k of ['reason', 'evidence', 'errorMatch']) if (!text(k)) problems.push(`${where}: expect_failure needs a non-empty "${k}"`);
    }
    if (action === 'skip') {
      if (!text('reason') && !text('supersededBy')) problems.push(`${where}: skip needs "supersededBy" or a "reason"`);
      if (entry.supersededBy !== undefined) {
        if (!text('supersededBy')) problems.push(`${where}: supersededBy must be a file name`);
        else if (!legacy.has(entry.supersededBy)) problems.push(`${where}: supersededBy "${entry.supersededBy}" is not a legacy migration`);
      }
    }
    if (action === 'apply') {
      for (const k of ['errorMatch', 'supersededBy']) if (entry[k] !== undefined) problems.push(`${where}: "${k}" only applies to ${k === 'errorMatch' ? 'expect_failure' : 'skip'}`);
    }
    if (entry.driftBefore !== undefined) {
      if (!Array.isArray(entry.driftBefore) || entry.driftBefore.some((p) => typeof p !== 'string' || !p)) {
        problems.push(`${where}: driftBefore must be a list of paths`);
      } else {
        for (const p of entry.driftBefore) {
          if (!/^drift\/[a-z0-9][a-z0-9_.-]*\.sql$/.test(p)) problems.push(`${where}: drift patch "${p}" must be drift/<name>.sql`);
          else if (!exists(p)) problems.push(`${where}: drift patch "${p}" does not exist`);
        }
        if (new Set(entry.driftBefore).size !== entry.driftBefore.length) problems.push(`${where}: driftBefore lists a patch twice`);
      }
    }
  }
  const fx = config.fidelityExceptions ?? {};
  if (typeof fx !== 'object' || Array.isArray(fx)) problems.push('fidelityExceptions must be an object');
  else {
    for (const key of Object.keys(fx)) if (!['tables', 'views', 'columns', 'functions'].includes(key)) problems.push(`fidelityExceptions: unknown key "${key}"`);
    for (const [kind, map] of Object.entries(fx)) {
      if (!map || typeof map !== 'object' || Array.isArray(map)) {
        problems.push(`fidelityExceptions.${kind} must be an object of name -> reason`);
        continue;
      }
      for (const [name, reason] of Object.entries(map)) {
        if (typeof reason !== 'string' || !reason.trim()) problems.push(`fidelityExceptions.${kind}["${name}"]: needs a reason`);
        if (kind === 'columns' && !/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/.test(name)) problems.push(`fidelityExceptions.columns["${name}"]: must be <table>.<column>`);
      }
    }
  }
  return problems;
}

/** The replay entry of a file (unlisted files are `apply` with no drift). */
export function replayEntry(config, file) {
  const entry = config?.files?.[file] ?? {};
  return { action: entry.action ?? 'apply', driftBefore: entry.driftBefore ?? [], ...entry };
}

/**
 * The verdict of one replayed file: `{ ok, outcome, problem? }`.
 * - apply: ok when psql succeeded;
 * - expect_failure: ok only when psql failed with an error containing
 *   `errorMatch`; succeeding fails the run ("remove the entry").
 */
export function replayVerdict(entry, { code, error }) {
  if (entry.action === 'expect_failure') {
    if (code === 0) return { ok: false, outcome: 'unexpected_success', problem: 'expected to fail but applied: remove the expect_failure entry' };
    if (!String(error ?? '').includes(entry.errorMatch)) {
      return { ok: false, outcome: 'unexpected_failure', problem: `failed with a different error than expected ("${entry.errorMatch}"): ${error}` };
    }
    return { ok: true, outcome: 'expected_failure' };
  }
  if (code === 0) return { ok: true, outcome: 'applied' };
  return { ok: false, outcome: 'unexpected_failure', problem: error ?? 'psql failed' };
}

/** Reads and parses replay.json. */
export function readReplayConfig(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
