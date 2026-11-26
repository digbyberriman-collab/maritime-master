/**
 * Fixture overlays (fixtures.d/<overlay>/) and route files (routes.d/*.json),
 * platform-prep PP2; scripts/visual README "Overlays". A stream adds its
 * data and captures in folders of its own; collisions are load errors that
 * name both sources.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyOverlays, findOverlays, loadFixtures, loadOverlay } from '../lib/fixtures.mjs';
import { loadPersonas, mergePersonas } from '../lib/personas.mjs';
import { loadRoutes, normaliseRouteSources, parseArgs } from '../lib/options.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VISUAL = path.resolve(HERE, '..');
const NOW = new Date(2026, 10, 22, 12, 0, 0);

/** A throwaway folder tree: `{ 'a/b.json': value }`; strings are written as they are. */
function tree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-overlays-'));
  for (const [rel, value] of Object.entries(files)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  }
  return dir;
}

const BASE = {
  tables: {
    profiles: [
      { id: 'p1', first_name: 'Demo', last_name: 'Master' },
      { id: 'p2', first_name: 'Demo', last_name: 'Bosun' },
    ],
    vessels: [{ id: 'v1', name: 'DRAAK' }],
  },
  rpc: { has_capability: true, my_account_status: 'active' },
  auth: { id: 'u1' },
  config: { missingTables: ['base_missing'], missingRpcs: [] },
};

// --- finding overlays -----------------------------------------------------------

test('findOverlays: folders in name order, README ignored; a missing folder is none unless named', () => {
  const dir = tree({ 'README.md': '# overlays', 'fleet/a.json': [], 'crew/a.json': [], '.hidden/a.json': [] });
  assert.deepEqual(findOverlays(dir).map((d) => path.basename(d)), ['crew', 'fleet']);
  assert.deepEqual(findOverlays(path.join(dir, 'nope')), []);
  assert.throws(() => findOverlays(path.join(dir, 'nope'), { required: true }), /does not exist/);
});

test('findOverlays: a folder holding fixture files itself is one overlay; mixing both is an error', () => {
  const single = tree({ 'profiles.json': [] });
  assert.deepEqual(findOverlays(single), [single]);
  const rpcOnly = tree({ 'rpc/x.json': true });
  assert.deepEqual(findOverlays(rpcOnly), [rpcOnly]);
  const mixed = tree({ 'profiles.json': [], 'crew/a.json': [] });
  assert.throws(() => findOverlays(mixed), /both fixture files and overlay folders \(crew\)/);
});

// --- loading one overlay ---------------------------------------------------------

test('loadOverlay reads tables, rpc answers, _config lists and personas, resolving tokens', () => {
  const dir = tree({
    'crew/profiles.json': [{ id: 'p9', joined: '$date:+1' }],
    'crew/rpc/crew_vessel_list.json': [{ profile_id: 'p9' }],
    'crew/_config.json': { missingRpcs: ['crew_x'] },
    'crew/_personas.json': { 'vessel-crew': { note: 'a rating' } },
    'crew/notes.md': 'not read',
  });
  const o = loadOverlay(path.join(dir, 'crew'), NOW);
  assert.equal(o.name, 'crew');
  assert.deepEqual(o.tables, { profiles: [{ id: 'p9', joined: '2026-11-23' }] });
  assert.deepEqual(o.rpc, { crew_vessel_list: [{ profile_id: 'p9' }] });
  assert.deepEqual(o.config, { missingTables: [], missingRpcs: ['crew_x'] });
  assert.deepEqual(o.personas, { 'vessel-crew': { note: 'a rating' } });
});

test('loadOverlay refuses what an overlay may not do', () => {
  const at = (files) => path.join(tree(files), 'x');
  assert.throws(() => loadOverlay(at({ 'x/_auth.json': { id: 'u2' } })), /Fixture overlay "x": _auth.json cannot be overlaid/);
  assert.throws(() => loadOverlay(at({ 'x/profiles.json': { id: 'p' } })), /profiles.json must be an array of row objects/);
  assert.throws(() => loadOverlay(at({ 'x/profiles.json': [1] })), /must be an array of row objects/);
  assert.throws(() => loadOverlay(at({ 'x/profiles.json': [{ id: 'a' }, { id: 'a' }] })), /two rows with id a/);
  assert.throws(() => loadOverlay(at({ 'x/tables/profiles.json': [] })), /unexpected folder tables\//);
  assert.throws(() => loadOverlay(at({ 'x/_config.json': { missing: [] } })), /unknown key "missing"/);
  assert.throws(() => loadOverlay(at({ 'x/_config.json': { missingTables: 'a' } })), /"missingTables" must be a list of names/);
  assert.throws(() => loadOverlay(at({ 'x/profiles.json': '{oops' })), /is not valid JSON/);
  const upper = tree({ 'Crew/profiles.json': [] });
  assert.throws(() => loadOverlay(path.join(upper, 'Crew')), /folder names are lower case/);
});

// --- applying overlays ------------------------------------------------------------

const overlay = (name, parts = {}) => ({ name, dir: `/x/${name}`, tables: {}, rpc: {}, config: { missingTables: [], missingRpcs: [] }, personas: null, ...parts });

test('applyOverlays appends rows, replaces a base row with the same id in place, and adds tables', () => {
  const crew = overlay('crew', {
    tables: {
      profiles: [{ id: 'p2', first_name: 'Demo', last_name: 'Bosun (overlay)' }, { id: 'p9', first_name: 'Demo', last_name: 'Cadet' }, { name: 'no id' }],
      positions: [{ id: 'pos1' }],
    },
  });
  const { fixtures, applied } = applyOverlays(BASE, [crew]);
  assert.deepEqual(applied, ['crew']);
  assert.deepEqual(fixtures.tables.profiles.map((p) => p.last_name ?? p.name), ['Master', 'Bosun (overlay)', 'Cadet', 'no id']);
  assert.deepEqual(fixtures.tables.positions, [{ id: 'pos1' }]);
  assert.deepEqual(fixtures.tables.vessels, BASE.tables.vessels);
  assert.deepEqual(fixtures.auth, BASE.auth);
  // The base is not changed.
  assert.equal(BASE.tables.profiles.length, 2);
  assert.equal(BASE.tables.profiles[1].last_name, 'Bosun');
  assert.equal(BASE.tables.positions, undefined);
});

test('applyOverlays: one row id in two overlays is an error naming both', () => {
  const a = overlay('crew', { tables: { profiles: [{ id: 'p9' }] } });
  const b = overlay('fleet', { tables: { profiles: [{ id: 'p9' }] } });
  assert.throws(() => applyOverlays(BASE, [a, b]), /Fixture overlays "crew" and "fleet" both set profiles row id p9/);
  // A base id overlaid twice, too.
  const c = overlay('crew', { tables: { profiles: [{ id: 'p1' }] } });
  const d = overlay('fleet', { tables: { profiles: [{ id: 'p1' }] } });
  assert.throws(() => applyOverlays(BASE, [c, d]), /"crew" and "fleet" both set profiles row id p1/);
  // The same id in different tables is fine.
  const e = overlay('fleet', { tables: { positions: [{ id: 'p9' }] } });
  assert.doesNotThrow(() => applyOverlays(BASE, [a, e]));
});

test('applyOverlays: an RPC answer replaces the base; two overlays for one RPC is an error', () => {
  const a = overlay('crew', { rpc: { has_capability: false, crew_vessel_list: [] } });
  assert.deepEqual(applyOverlays(BASE, [a]).fixtures.rpc, { has_capability: false, my_account_status: 'active', crew_vessel_list: [] });
  const b = overlay('fleet', { rpc: { has_capability: true } });
  assert.throws(() => applyOverlays(BASE, [a, b]), /Fixture overlays "crew" and "fleet" both answer rpc\/has_capability.json/);
});

test('applyOverlays unions the missing lists and hands on each overlay\'s personas', () => {
  const a = overlay('crew', { config: { missingTables: ['crew_documents', 'base_missing'], missingRpcs: ['crew_x'] }, personas: { 'vessel-crew': {} } });
  const b = overlay('fleet', { config: { missingTables: ['fleet_documents'], missingRpcs: ['crew_x'] } });
  const { fixtures, personas } = applyOverlays(BASE, [a, b]);
  assert.deepEqual(fixtures.config.missingTables, ['base_missing', 'crew_documents', 'fleet_documents']);
  assert.deepEqual(fixtures.config.missingRpcs, ['crew_x']);
  assert.deepEqual(personas, [{ source: 'crew', personas: { 'vessel-crew': {} } }]);
  assert.deepEqual(BASE.config.missingTables, ['base_missing']);
});

test('applyOverlays with no overlays is the base', () => {
  const { fixtures, applied, personas } = applyOverlays(BASE, []);
  assert.deepEqual(fixtures, BASE);
  assert.deepEqual([applied, personas], [[], []]);
});

// --- personas --------------------------------------------------------------------

test('mergePersonas adds overlay personas by name; a name defined twice names both files', () => {
  const base = { 'vessel-master': { note: 'base' } };
  const merged = mergePersonas(base, [{ source: 'crew', personas: { 'vessel-crew': { note: 'rating' }, 'vessel-hod': {} } }]);
  assert.deepEqual(Object.keys(merged), ['vessel-master', 'vessel-crew', 'vessel-hod']);
  assert.deepEqual(base, { 'vessel-master': { note: 'base' } });
  assert.throws(
    () => mergePersonas(base, [{ source: 'crew', personas: { 'vessel-master': {} } }]),
    /Persona "vessel-master" is defined in both _personas.json and fixtures.d\/crew\/_personas.json/,
  );
  assert.throws(
    () => mergePersonas(base, [{ source: 'crew', personas: { a: {} } }, { source: 'fleet', personas: { a: {} } }]),
    /Persona "a" is defined in both fixtures.d\/crew\/_personas.json and fixtures.d\/fleet\/_personas.json/,
  );
  assert.throws(
    () => mergePersonas(base, [{ source: 'crew', personas: { a: { bogus: 1 } } }]),
    /fixtures.d\/crew\/_personas.json: persona "a" has unknown key "bogus"/,
  );
});

// --- options ---------------------------------------------------------------------

test('parseArgs: --overlays, --no-overlays and the default next to the fixtures', () => {
  const d = parseArgs([], '/repo');
  assert.equal(d.overlays, true);
  assert.equal(d.overlaysExplicit, false);
  assert.equal(d.overlaysDir, path.resolve('/repo', 'scripts/visual/fixtures.d'));
  assert.equal(d.routesDir, path.resolve('/repo', 'scripts/visual/routes.d'));
  const copy = parseArgs(['--fixtures', '/tmp/copy/fixtures'], '/repo');
  assert.equal(copy.overlaysDir, path.resolve('/tmp/copy/fixtures.d'));
  const named = parseArgs(['--overlays', 'scratch/overlay'], '/repo');
  assert.equal(named.overlaysDir, path.resolve('/repo', 'scratch/overlay'));
  assert.equal(named.overlaysExplicit, true);
  assert.equal(parseArgs(['--no-overlays'], '/repo').overlays, false);
  assert.throws(() => parseArgs(['--overlays', 'x', '--no-overlays'], '/repo'), /pick one/);
  assert.throws(() => parseArgs(['--overlays'], '/repo'), /needs a value/);
});

// --- routes.d ----------------------------------------------------------------------

test('route files: slugs unique across files, the same capture twice refused, each route tagged with its file', () => {
  const routes = normaliseRouteSources([
    { source: 'routes.json', raw: ['/v/dra/crew/list', { path: '/v/dra/crew/list', slug: 'crew-list-master', persona: 'vessel-master' }] },
    { source: 'routes.d/crew.json', raw: [{ path: '/v/dra/crew/list', slug: 'crew-list-hod', persona: 'vessel-hod' }] },
  ]);
  assert.deepEqual(routes.map((r) => [r.slug, r.source]), [
    ['v-dra-crew-list', 'routes.json'],
    ['crew-list-master', 'routes.json'],
    ['crew-list-hod', 'routes.d/crew.json'],
  ]);
  assert.throws(
    () => normaliseRouteSources([{ source: 'routes.json', raw: ['/a'] }, { source: 'routes.d/fleet.json', raw: [{ path: '/b', slug: 'a' }] }]),
    /Duplicate route slug "a" in routes.d\/fleet.json \(also in routes.json\)/,
  );
  assert.throws(
    () => normaliseRouteSources([{ source: 'routes.json', raw: ['/a'] }, { source: 'routes.d/crew.json', raw: [{ path: '/a', slug: 'a-again', note: 'same page' }] }]),
    /Route "a-again" in routes.d\/crew.json captures the same page as "a" in routes.json/,
  );
  assert.throws(() => normaliseRouteSources([{ source: 'routes.d/crew.json', raw: { nope: [] } }]), /routes.d\/crew.json must be an array/);
  assert.throws(() => normaliseRouteSources([{ source: 'routes.d/crew.json', raw: ['v/dra'] }]), /routes.d\/crew.json: route path must start with/);
});

test('loadRoutes reads routes.json then routes.d/*.json in name order', () => {
  const dir = tree({
    'routes.json': ['/a'],
    'routes.d/fleet.json': ['/fleet/x'],
    'routes.d/crew.json': [{ path: '/v/dra/crew/x', slug: 'crew-x' }],
    'routes.d/README.md': 'not read',
  });
  const routes = loadRoutes(path.join(dir, 'routes.json'));
  assert.deepEqual(routes.map((r) => `${r.source}:${r.slug}`), ['routes.json:a', 'routes.d/crew.json:crew-x', 'routes.d/fleet.json:fleet-x']);
  const none = tree({ 'routes.json': ['/a'] });
  assert.deepEqual(loadRoutes(path.join(none, 'routes.json')).map((r) => r.slug), ['a']);
  const bad = tree({ 'routes.json': ['/a'], 'routes.d/crew.json': '[oops' });
  assert.throws(() => loadRoutes(path.join(bad, 'routes.json')), /routes.d\/crew.json is not valid JSON/);
});

// --- the shipped folders ---------------------------------------------------------------

test('the shipped routes.d files are valid, and both stream files exist', () => {
  const routes = loadRoutes(path.join(VISUAL, 'routes.json'));
  assert.ok(routes.length >= 10);
  for (const seed of ['crew.json', 'fleet.json']) {
    assert.ok(fs.existsSync(path.join(VISUAL, 'routes.d', seed)), `routes.d/${seed}`);
    assert.ok(Array.isArray(JSON.parse(fs.readFileSync(path.join(VISUAL, 'routes.d', seed), 'utf8'))), `routes.d/${seed} is an array`);
  }
});

test('the shipped overlays load on the base fixtures, and follow the no-personal-data rules', () => {
  assert.ok(fs.existsSync(path.join(VISUAL, 'fixtures.d', 'README.md')));
  const overlays = findOverlays(path.join(VISUAL, 'fixtures.d')).map((dir) => loadOverlay(dir, NOW));
  const base = loadFixtures(path.join(VISUAL, 'fixtures'), NOW);
  const { fixtures, personas } = applyOverlays(base, overlays);
  mergePersonas(loadPersonas(path.join(VISUAL, 'fixtures'), NOW), personas);
  // Every overlay's own rows and answers: emails only on the reserved example domain, no phone numbers.
  const walk = (value, key, visit) => {
    if (Array.isArray(value)) value.forEach((v) => walk(v, key, visit));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => walk(v, k, visit));
    else visit(key, value);
  };
  for (const o of overlays) {
    walk({ ...o.tables, ...o.rpc, personas: o.personas }, '', (key, value) => {
      if (typeof value === 'string' && value.includes('@')) assert.match(value, /@[a-z-]+\.example$/, `${o.name} ${key}: ${value}`);
      if (/phone/.test(key)) assert.ok(value === null || value === '', `${o.name} ${key} must stay empty`);
    });
    for (const p of o.tables.profiles ?? []) assert.equal(p.first_name, 'Demo', `${o.name}: profiles are named by role`);
  }
  assert.doesNotMatch(JSON.stringify(fixtures), /"\$(date|ts|now)|\{year\}/);
});
