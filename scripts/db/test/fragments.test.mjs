// node --test scripts/db/test/*.test.mjs
// scripts/db/lib/fragments.mjs (Phase 3 wave 1, PP1): the per-stream
// fragments of the contract map, the function-grants fixture and the
// inactive-gate probes merge in file-name order; a name two files claim is
// an error; the CLI prints the merged JSON or exits 1 with nothing on stdout;
// the contract checker runs its stale checks on fragment entries and names
// the fragment; the repo's own seeded fragments merge cleanly.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import { compareContract, loadMergedMap } from '../check-pending-contract.mjs';
import {
  FragmentError,
  loadContractMap,
  loadGrants,
  loadProbes,
  mergeContractMap,
  mergeGrants,
  mergeProbes,
  readFragments,
} from '../lib/fragments.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(REPO, 'scripts/db/lib/fragments.mjs');
const CHECKER = join(REPO, 'scripts/db/check-pending-contract.mjs');

const tmp = mkdtempSync(join(tmpdir(), 'storm-fragments-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
/** A throwaway repo root with the given files (path -> JSON value or raw string). */
const repo = (files) => {
  const root = join(tmp, `r${(n += 1)}`);
  for (const [rel, value] of Object.entries(files)) {
    const path = join(root, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
  }
  return root;
};
const problemsOf = (fn) => {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof FragmentError, `a FragmentError, got ${err}`);
    return err.problems;
  }
  assert.fail('expected a FragmentError');
};

const MAIN_MAP = {
  version: 1,
  description: 'main',
  files: [{ file: 'src/a/db.pending.ts', tables: { type: 'APendingTables', expect: [] } }],
  notMirrored: { tables: { main_outbox: 'service only' }, views: {}, columns: {}, functions: { main_helper: 'pure' } },
  knownMismatches: [{ key: 'table:a.x:type', followup: 'main followup' }],
};
const GRANTS = {
  version: 1,
  description: 'main grants',
  functions: { 'public.main_fn(uuid)': ['service_role'] },
  relations: { 'public.main_table': { kind: 'table', authenticated: ['SELECT'], authenticatedColumns: {} } },
};

// ---------------------------------------------------------------- contract map

test('contract map: fragments merge in file-name order; files, notMirrored and knownMismatches carry their source', () => {
  const merged = mergeContractMap({ file: 'scripts/db/contract-map.json', doc: MAIN_MAP }, [
    { file: 'scripts/db/contract-map.d/crew.json', doc: { version: 1, files: [{ file: 'src/crew/db.pending.ts' }], notMirrored: { functions: { crew_helper: 'internal' } } } },
    { file: 'scripts/db/contract-map.d/fleet.json', doc: { version: 1, files: [{ file: 'src/fleet/db.pending.ts' }], notMirrored: { views: { expiry_src_x: 'source view' } }, knownMismatches: [{ key: 'k:fleet', followup: 'X5' }] } },
  ]);
  assert.deepEqual(merged.files.map((f) => f.file), ['src/a/db.pending.ts', 'src/crew/db.pending.ts', 'src/fleet/db.pending.ts']);
  assert.deepEqual(merged.notMirrored.functions, { main_helper: 'pure', crew_helper: 'internal' });
  assert.deepEqual(merged.notMirrored.views, { expiry_src_x: 'source view' });
  assert.deepEqual(merged.knownMismatches.map((k) => k.key), ['table:a.x:type', 'k:fleet']);
  assert.equal(merged.sources['notMirrored.functions.crew_helper'], 'scripts/db/contract-map.d/crew.json');
  assert.equal(merged.sources['notMirrored.tables.main_outbox'], 'scripts/db/contract-map.json');
  assert.equal(merged.sources['known:k:fleet'], 'scripts/db/contract-map.d/fleet.json');
  assert.equal(merged.description, 'main');
});

test('contract map: a file named twice, a notMirrored key twice or a known mismatch twice is an error', () => {
  const problems = problemsOf(() =>
    mergeContractMap({ file: 'contract-map.json', doc: MAIN_MAP }, [
      { file: 'd/crew.json', doc: { version: 1, files: [{ file: 'src/a/db.pending.ts' }], notMirrored: { tables: { main_outbox: 'again' } } } },
      { file: 'd/fleet.json', doc: { version: 1, files: [], notMirrored: { functions: { shared: 'x' } }, knownMismatches: [{ key: 'table:a.x:type', followup: 'again' }] } },
      { file: 'd/zz.json', doc: { version: 1, files: [], notMirrored: { functions: { shared: 'y' } } } },
    ]),
  );
  assert.equal(problems.length, 4);
  assert.match(problems[0], /d\/crew\.json: files\[\] names src\/a\/db\.pending\.ts, already named by contract-map\.json/);
  assert.match(problems[1], /d\/crew\.json: notMirrored\.tables\.main_outbox is already listed by contract-map\.json/);
  assert.match(problems[2], /d\/fleet\.json: knownMismatches table:a\.x:type is already listed by contract-map\.json/);
  assert.match(problems[3], /d\/zz\.json: notMirrored\.functions\.shared is already listed by d\/fleet\.json/);
});

test('contract map: an invalid fragment (version, unknown key or section, shapes, bad JSON) is an error', () => {
  const problems = problemsOf(() =>
    mergeContractMap({ file: 'm.json', doc: MAIN_MAP }, [
      { file: 'd/a.json', doc: { version: 2, files: {}, extra: true } },
      { file: 'd/b.json', doc: { version: 1, notMirrored: { routines: {} }, knownMismatches: [{}] } },
      { file: 'd/c.json', doc: [] },
    ]),
  );
  assert.deepEqual(problems, [
    'd/a.json: version must be 1',
    'd/a.json: unknown key "extra"',
    'd/a.json: files must be an array',
    'd/b.json: notMirrored.routines is not a section (tables, views, functions, columns)',
    'd/b.json: every knownMismatches entry needs a "key"',
    'd/c.json: a contract map must be a JSON object',
  ]);
  const root = repo({ 'scripts/db/contract-map.json': MAIN_MAP, 'scripts/db/contract-map.d/bad.json': '{ not json' });
  assert.match(problemsOf(() => loadContractMap({ root }))[0], /contract-map\.d\/bad\.json: not valid JSON/);
});

test('readFragments: only *.json, in file-name order; a missing directory is no fragments', () => {
  const root = repo({ 'x.d/b.json': [], 'x.d/a.json': [], 'x.d/README.md': 'not a fragment' });
  assert.deepEqual(readFragments('x.d', { root }).map((f) => f.file), ['x.d/a.json', 'x.d/b.json']);
  assert.deepEqual(readFragments('nope.d', { root }), []);
});

test('contract checker: the stale checks run on fragment entries and name the fragment', () => {
  const root = repo({
    'scripts/db/contract-map.json': { version: 1, files: [], notMirrored: { tables: {}, views: {}, columns: {}, functions: {} }, knownMismatches: [] },
    'scripts/db/contract-map.d/crew.json': {
      version: 1,
      files: [],
      notMirrored: { functions: { crew_gone: 'stale', crew_helper: 'internal' }, tables: { crew_gone_table: 'stale' } },
      knownMismatches: [{ key: 'table:crew.x:type', followup: 'X1' }],
    },
  });
  const map = loadMergedMap(join(root, 'scripts/db/contract-map.json'), { root });
  const exportDoc = {
    kind: 'buildout-export',
    tables: {},
    views: {},
    legacyColumns: {},
    functions: { 'crew_helper(uuid)': { name: 'crew_helper', args: [], returns: 'boolean', returnsSet: false, grants: ['authenticated'], status: 'new' } },
  };
  const r = compareContract(exportDoc, { files: [], problems: [] }, map);
  const stale = r.mismatches.filter((m) => m.key.endsWith(':stale'));
  assert.deepEqual(stale.map((m) => m.key).sort(), ['map:function:crew_gone:stale', 'map:known:table:crew.x:type:stale', 'map:table:crew_gone_table:stale']);
  for (const m of stale) assert.match(m.message, /^scripts\/db\/contract-map\.d\/crew\.json /, m.message);
  assert.ok(!r.mismatches.some((m) => m.key.includes('crew_helper')), 'a live fragment entry is not stale');
});

test('contract checker CLI: a duplicate across fragments fails with a mismatch (also in --json)', () => {
  const root = repo({
    'scripts/db/contract-map.json': { version: 1, files: [], notMirrored: {}, knownMismatches: [] },
    'scripts/db/contract-map.d/crew.json': { version: 1, files: [], notMirrored: { functions: { dup: 'a' } } },
    'scripts/db/contract-map.d/fleet.json': { version: 1, files: [], notMirrored: { functions: { dup: 'b' } } },
    'export.json': { kind: 'buildout-export', tables: {}, views: {}, legacyColumns: {}, functions: {} },
  });
  const args = ['--export', join(root, 'export.json'), '--map', join(root, 'scripts/db/contract-map.json'), '--root', root];
  const text = spawnSync(process.execPath, [CHECKER, ...args], { encoding: 'utf8' });
  assert.equal(text.status, 1);
  assert.match(text.stdout, /MISMATCH contract-map fragments: scripts\/db\/contract-map\.d\/fleet\.json: notMirrored\.functions\.dup is already listed by scripts\/db\/contract-map\.d\/crew\.json \[map:fragment\]/);
  const json = spawnSync(process.execPath, [CHECKER, ...args, '--json'], { encoding: 'utf8' });
  assert.equal(json.status, 1);
  assert.equal(JSON.parse(json.stdout).mismatches[0].key, 'map:fragment');
});

// ---------------------------------------------------------------- grants

test('grants: fragments add functions and relations; a key listed twice is an error', () => {
  const merged = mergeGrants({ file: 'g.json', doc: GRANTS }, [
    { file: 'g.d/crew.json', doc: {} },
    { file: 'g.d/fleet.json', doc: { functions: { 'public.fleet_fn(uuid)': ['authenticated'] }, relations: { 'public.fleet_t': { kind: 'table', authenticated: ['SELECT'], authenticatedColumns: {} } } } },
  ]);
  assert.deepEqual(Object.keys(merged.functions), ['public.main_fn(uuid)', 'public.fleet_fn(uuid)']);
  assert.deepEqual(Object.keys(merged.relations), ['public.main_table', 'public.fleet_t']);
  assert.equal(merged.description, 'main grants');

  const problems = problemsOf(() =>
    mergeGrants({ file: 'g.json', doc: GRANTS }, [
      { file: 'g.d/crew.json', doc: { functions: { 'public.main_fn(uuid)': ['authenticated'], 'public.x(uuid)': [] } } },
      { file: 'g.d/fleet.json', doc: { functions: { 'public.x(uuid)': [] }, relations: { 'public.main_table': {} }, roles: {} } },
      { file: 'g.d/zz.json', doc: [] },
    ]),
  );
  assert.deepEqual(problems, [
    'g.d/crew.json: functions "public.main_fn(uuid)" is already listed by g.json',
    'g.d/fleet.json: unknown key "roles"',
    'g.d/fleet.json: functions "public.x(uuid)" is already listed by g.d/crew.json',
    'g.d/fleet.json: relations "public.main_table" is already listed by g.json',
    'g.d/zz.json: a grants fragment must be a JSON object',
  ]);
});

test('grants CLI: merged JSON on stdout and exit 0; on a duplicate nothing on stdout and exit 1', () => {
  const good = repo({ 'supabase/tests/fixtures/function-grants.json': GRANTS, 'supabase/tests/fixtures/function-grants.d/crew.json': {} });
  const ok = spawnSync(process.execPath, [CLI, 'grants', '--root', good], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(Object.keys(JSON.parse(ok.stdout).functions), ['public.main_fn(uuid)']);

  const bad = repo({
    'supabase/tests/fixtures/function-grants.json': GRANTS,
    'supabase/tests/fixtures/function-grants.d/crew.json': { functions: { 'public.main_fn(uuid)': ['authenticated'] } },
  });
  const ko = spawnSync(process.execPath, [CLI, 'grants', '--root', bad], { encoding: 'utf8' });
  assert.equal(ko.status, 1);
  assert.equal(ko.stdout, '');
  assert.match(ko.stderr, /function-grants\.d\/crew\.json: functions "public\.main_fn\(uuid\)" is already listed by supabase\/tests\/fixtures\/function-grants\.json/);

  const usage = spawnSync(process.execPath, [CLI, 'everything'], { encoding: 'utf8' });
  assert.equal(usage.status, 3);
});

// ---------------------------------------------------------------- probes

test('probes: probe and allow entries concatenate with their source; a callee twice or a malformed entry is an error', () => {
  const merged = mergeProbes([
    { file: 'p.d/crew.json', doc: [{ probe: { callee: 'crew_profile_visible', expr: 'public.crew_profile_visible({profile:A.crew_hyd})' } }] },
    { file: 'p.d/fleet.json', doc: [{ allow: { callee: 'fleet_hod_covers', reason: 'decides on the subject' } }] },
  ]);
  assert.deepEqual(merged, [
    { kind: 'probe', callee: 'crew_profile_visible', expr: 'public.crew_profile_visible({profile:A.crew_hyd})', source: 'p.d/crew.json' },
    { kind: 'allow', callee: 'fleet_hod_covers', reason: 'decides on the subject', source: 'p.d/fleet.json' },
  ]);
  const problems = problemsOf(() =>
    mergeProbes([
      { file: 'p.d/crew.json', doc: [{ probe: { callee: 'same', expr: 'x' } }, { probe: { callee: 'Bad-Name', expr: 'x' } }, { probe: { callee: 'y' } }] },
      { file: 'p.d/fleet.json', doc: [{ allow: { callee: 'same', reason: 'again' } }, { probe: {}, allow: {} }] },
      { file: 'p.d/zz.json', doc: {} },
    ]),
  );
  assert.deepEqual(problems, [
    'p.d/crew.json[1]: probe needs a snake_case "callee" and a non-empty "expr"',
    'p.d/crew.json[2]: probe needs a snake_case "callee" and a non-empty "expr"',
    'p.d/fleet.json[0]: callee same is already listed by p.d/crew.json[0]',
    'p.d/fleet.json[1]: each entry is { "probe": { callee, expr } } or { "allow": { callee, reason } }',
    'p.d/zz.json: a probes fragment must be a JSON array',
  ]);
});

// ---------------------------------------------------------------- the repo's own fragments

test('the repo: crew and fleet fragments exist and merge cleanly (streams fill them; the integrator folds them back)', () => {
  for (const dir of ['scripts/db/contract-map.d', 'supabase/tests/fixtures/function-grants.d', 'supabase/tests/fixtures/inactive-probes.d']) {
    const names = readFragments(dir, { root: REPO }).map((f) => f.file.split('/').pop());
    assert.ok(names.includes('crew.json') && names.includes('fleet.json'), `${dir} has crew.json and fleet.json`);
  }
  assert.doesNotThrow(() => loadContractMap({ root: REPO }));
  assert.doesNotThrow(() => loadGrants({ root: REPO }));
  assert.doesNotThrow(() => loadProbes({ root: REPO }));
});
