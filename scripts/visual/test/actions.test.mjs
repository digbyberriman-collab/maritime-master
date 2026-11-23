/**
 * Scripted capture actions and personas (BUILD-PLAN S5; scripts/visual
 * README "Actions" and "Personas"). No browser: actions run against a fake
 * page that records what it was asked to do.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateActions, runActions, describeAction, ACTION_KINDS, MAX_WAIT_MS } from '../lib/actions.mjs';
import { normaliseRoutes, parseArgs } from '../lib/options.mjs';
import { captureWarnings } from '../lib/inspect.mjs';
import { loadFixtures } from '../lib/fixtures.mjs';
import { applyPersona, captureName, loadPersonas, personaFor, validatePersonas } from '../lib/personas.mjs';
import { createMockState, handleSupabaseRequest } from '../lib/supabase-mock.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VISUAL = path.resolve(HERE, '..');
const ROOT = path.resolve(VISUAL, '..', '..');
const NOW = new Date(2026, 10, 22, 12, 0, 0);

// --- validation -------------------------------------------------------------

test('validateActions accepts every documented step and normalises it', () => {
  const steps = validateActions(
    [
      { click: '[data-testid="shell-account-trigger"]' },
      { press: 'Control+k' },
      { type: { selector: '[data-testid="command-palette-input"]', text: 'crew' } },
      { hover: 'nav a' },
      { waitFor: '[data-testid="command-palette"]' },
      { wait: 250 },
    ],
    'Route "x"',
  );
  assert.deepEqual(steps, [
    { kind: 'click', selector: '[data-testid="shell-account-trigger"]' },
    { kind: 'press', key: 'Control+k' },
    { kind: 'type', selector: '[data-testid="command-palette-input"]', text: 'crew' },
    { kind: 'hover', selector: 'nav a' },
    { kind: 'waitFor', selector: '[data-testid="command-palette"]' },
    { kind: 'wait', ms: 250 },
  ]);
  assert.deepEqual(validateActions(undefined), []);
  assert.deepEqual(ACTION_KINDS, ['click', 'press', 'type', 'hover', 'waitFor', 'wait']);
});

test('validateActions rejects unknown keys and malformed steps with a clear error', () => {
  assert.throws(() => validateActions([{ clik: 'a' }], 'Route "palette-open"'), /Route "palette-open": actions\[0\] has unknown key "clik"\. Use one of click, press, type, hover, waitFor, wait\./);
  assert.throws(() => validateActions([{ click: 'a', press: 'b' }]), /exactly one of/);
  assert.throws(() => validateActions([{}]), /exactly one of .* got none/);
  assert.throws(() => validateActions({ click: 'a' }), /must be an array/);
  assert.throws(() => validateActions(['click a']), /must be an object/);
  assert.throws(() => validateActions([{ click: '' }]), /needs a CSS selector/);
  assert.throws(() => validateActions([{ press: 3 }]), /needs a key/);
  assert.throws(() => validateActions([{ type: 'crew' }]), /"type" needs \{ "selector"/);
  assert.throws(() => validateActions([{ type: { selector: 'input', text: 'x', delay: 3 } }]), /"type" has unknown key "delay"/);
  assert.throws(() => validateActions([{ type: { selector: 'input' } }]), /"type\.text" needs a string/);
  assert.throws(() => validateActions([{ wait: -1 }]), /whole milliseconds/);
  assert.throws(() => validateActions([{ wait: MAX_WAIT_MS + 1 }]), /whole milliseconds/);
  assert.throws(() => validateActions([{ wait: 1.5 }]), /whole milliseconds/);
});

test('normaliseRoutes checks actions, persona and reducedMotion, keeping actions as written', () => {
  const [route] = normaliseRoutes([{ path: '/fleet/dashboard', slug: 'p', actions: [{ press: 'Control+k' }], reducedMotion: true, persona: 'vessel-master' }]);
  assert.deepEqual(route.actions, [{ press: 'Control+k' }]);
  assert.deepEqual(route.steps, [{ kind: 'press', key: 'Control+k' }]);
  assert.deepEqual(normaliseRoutes(['/a'])[0].steps, []);
  assert.deepEqual(normaliseRoutes([{ path: '/a', widths: [390, 768] }])[0].widths, [390, 768]);
  assert.throws(() => normaliseRoutes([{ path: '/a', widths: [] }]), /Route "a": "widths" must be a non-empty array/);
  assert.throws(() => normaliseRoutes([{ path: '/a', widths: ['390'] }]), /Route "a": "widths" must be a non-empty array/);
  assert.throws(() => normaliseRoutes([{ path: '/a', actions: [{ tap: 'x' }] }]), /Route "a": actions\[0\] has unknown key "tap"/);
  assert.throws(() => normaliseRoutes([{ path: '/a', reducedMotion: 'yes' }]), /"reducedMotion" must be true or false/);
  assert.throws(() => normaliseRoutes([{ path: '/a', persona: '' }]), /"persona" must be a persona name/);
});

test('--persona is a documented flag', () => {
  assert.equal(parseArgs(['--persona', 'vessel-master'], '/repo').persona, 'vessel-master');
  assert.equal(parseArgs([], '/repo').persona, null);
  assert.throws(() => parseArgs(['--persona'], '/repo'), /needs a value/);
});

// --- execution --------------------------------------------------------------

function fakePage({ failOn = null } = {}) {
  const calls = [];
  const maybeFail = (what, selector) => {
    if (failOn && selector === failOn) throw new Error(`Timeout 10000ms exceeded.\n=== logs ===\nwaiting for ${selector}`);
    calls.push(what);
  };
  return {
    calls,
    click: async (selector, opts) => maybeFail(`click ${selector} ${opts?.timeout}`, selector),
    hover: async (selector) => maybeFail(`hover ${selector}`, selector),
    focus: async (selector) => maybeFail(`focus ${selector}`, selector),
    waitForSelector: async (selector, opts) => maybeFail(`waitFor ${selector} ${opts?.state}`, selector),
    waitForTimeout: async (ms) => calls.push(`wait ${ms}`),
    keyboard: {
      press: async (key) => calls.push(`press ${key}`),
      type: async (text) => calls.push(`type ${text}`),
    },
  };
}

test('runActions plays the steps in order', async () => {
  const page = fakePage();
  const steps = validateActions([
    { press: 'Control+k' },
    { waitFor: '#palette' },
    { type: { selector: '#input', text: 'crew' } },
    { hover: '#row' },
    { click: '#row' },
    { wait: 50 },
  ]);
  const result = await runActions(page, steps, { timeout: 1234 });
  assert.deepEqual(result, { ran: 6, notes: [] });
  assert.deepEqual(page.calls, ['press Control+k', 'waitFor #palette visible', 'focus #input', 'type crew', 'hover #row', 'click #row 1234', 'wait 50']);
});

test('a failing step becomes a warning note, never a crash, and later steps are skipped', async () => {
  const page = fakePage({ failOn: '[data-testid="shell-account-trigger"]' });
  const steps = validateActions([{ click: '[data-testid="shell-account-trigger"]' }, { waitFor: '[data-testid="shell-account-menu"]' }, { wait: 10 }]);
  const result = await runActions(page, steps);
  assert.equal(result.ran, 0);
  assert.deepEqual(result.notes, [
    'action 1 (click [data-testid="shell-account-trigger"]) failed: Timeout 10000ms exceeded.',
    'skipped 2 later actions',
  ]);
  assert.deepEqual(page.calls, []);
  // Report grading: the failure is a warning; the "skipped" line is context only.
  assert.deepEqual(captureWarnings({ notes: result.notes }), [result.notes[0]]);
  // A failure on the last step skips nothing.
  const late = await runActions(fakePage({ failOn: '#late' }), validateActions([{ press: 'Escape' }, { waitFor: '#late' }]));
  assert.deepEqual(late, { ran: 1, notes: ['action 2 (waitFor #late) failed: Timeout 10000ms exceeded.'] });
});

test('describeAction reads well in notes', () => {
  assert.equal(describeAction({ kind: 'press', key: 'Control+k' }), 'press Control+k');
  assert.equal(describeAction({ kind: 'type', selector: 'input', text: 'crew' }), 'type "crew" into input');
  assert.equal(describeAction({ kind: 'wait', ms: 5 }), 'wait 5 ms');
  assert.equal(describeAction({ kind: 'hover', selector: 'a' }), 'hover a');
});

// --- the shipped routes -------------------------------------------------------

const testIdValues = () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/app/shell/testIds.ts'), 'utf8');
  return new Set([...source.matchAll(/:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]));
};

test('the shipped interaction captures use the contract test ids and known personas', () => {
  const routes = normaliseRoutes(JSON.parse(fs.readFileSync(path.join(VISUAL, 'routes.json'), 'utf8')));
  const ids = testIdValues();
  const bySlug = new Map(routes.map((r) => [r.slug, r]));
  for (const slug of ['palette-open', 'palette-query', 'shell-vessel-switcher-open', 'shell-account-menu-open', 'shell-bell-open', 'shell-apps-open']) {
    assert.ok(bySlug.get(slug)?.steps.length, `${slug} has actions`);
  }
  assert.deepEqual(bySlug.get('palette-open').steps.slice(0, 2), [
    { kind: 'press', key: 'Control+k' },
    { kind: 'waitFor', selector: '[data-testid="command-palette"]' },
  ]);
  assert.ok(bySlug.get('palette-query').steps.some((s) => s.kind === 'type' && s.text === 'crew'));
  for (const route of routes) {
    for (const step of route.steps) {
      for (const [, id] of (step.selector ?? '').matchAll(/data-testid="([^"]+)"/g)) {
        assert.ok(ids.has(id), `${route.slug}: data-testid "${id}" is not in src/app/shell/testIds.ts`);
      }
    }
  }
  const personas = loadPersonas(path.join(VISUAL, 'fixtures'), NOW);
  for (const route of routes) personaFor(route, null, personas);
  assert.equal(bySlug.get('vessel-master-dra').persona, 'vessel-master');
  assert.equal(bySlug.get('module-settings-hyd-technical').persona, 'module-settings');
});

// --- personas -------------------------------------------------------------------

test('validatePersonas rejects unknown keys and malformed tables', () => {
  assert.throws(() => validatePersonas([]), /must be an object of personas/);
  assert.throws(() => validatePersonas({ Bad_Name: {} }), /lower case letters/);
  assert.throws(() => validatePersonas({ a: { tabels: {} } }), /persona "a" has unknown key "tabels"/);
  assert.throws(() => validatePersonas({ a: { tables: { vessels: {} } } }), /table "vessels" must be an array/);
  assert.throws(() => validatePersonas({ a: { missingTables: 'user_roles' } }), /"missingTables" must be a list/);
  assert.throws(() => validatePersonas({ a: { auth: { email: 'x@y.example' } } }), /"auth" must be an object with an "id"/);
  assert.deepEqual(validatePersonas({ a: { tables: { t: [{ id: 1 }] }, missingTables: ['x'] } }), { a: { tables: { t: [{ id: 1 }] }, missingTables: ['x'] } });
});

test('applyPersona replaces whole tables, rpc answers and the identity, and adds missing tables', () => {
  const base = {
    tables: { vessels: [{ id: 'v1' }, { id: 'v2' }], user_roles: [{ id: 'r1' }] },
    rpc: { get_user_roles_full: [{ role_name: 'dpa' }] },
    auth: { id: 'u1' },
    config: { missingTables: ['a'], missingRpcs: [] },
  };
  const merged = applyPersona(base, {
    auth: { id: 'u2', email: 'master@demo-fleet.example' },
    tables: { user_roles: [{ id: 'r2' }], vessel_module_settings: [{ vessel_id: 'v1', module_key: 'technical', enabled: false }] },
    rpc: { get_user_roles_full: [] },
    missingTables: ['a', 'b'],
    missingRpcs: ['fn'],
  });
  assert.deepEqual(merged.tables.vessels, [{ id: 'v1' }, { id: 'v2' }]);
  assert.deepEqual(merged.tables.user_roles, [{ id: 'r2' }]);
  assert.equal(merged.tables.vessel_module_settings.length, 1);
  assert.deepEqual(merged.rpc.get_user_roles_full, []);
  assert.equal(merged.auth.id, 'u2');
  assert.deepEqual(merged.config.missingTables, ['a', 'b']);
  assert.deepEqual(merged.config.missingRpcs, ['fn']);
  // The base is untouched, and no persona means the base itself.
  assert.deepEqual(base.tables.user_roles, [{ id: 'r1' }]);
  assert.equal(applyPersona(base, undefined), base);
});

test('personaFor: the run flag wins, an unknown name fails fast; captureName keeps files apart', () => {
  const personas = { 'vessel-master': {}, 'rbac-error': {} };
  assert.equal(personaFor({ slug: 'a' }, null, personas), null);
  assert.equal(personaFor({ slug: 'a', persona: 'vessel-master' }, null, personas), 'vessel-master');
  assert.equal(personaFor({ slug: 'a', persona: 'vessel-master' }, 'rbac-error', personas), 'rbac-error');
  assert.throws(() => personaFor({ slug: 'a', persona: 'nobody' }, null, personas), /Unknown persona "nobody" \(route "a"\)\. Known: vessel-master, rbac-error\./);
  assert.equal(captureName({ slug: 'v-dra' }, null), 'v-dra');
  assert.equal(captureName({ slug: 'v-dra' }, 'rbac-error'), 'v-dra--rbac-error');
  assert.equal(captureName({ slug: 'vessel-master-dra', persona: 'vessel-master' }, 'vessel-master'), 'vessel-master-dra');
});

test('the shipped personas: vessel-master, module-settings, rbac-error and the Phase 2 states', () => {
  const base = loadFixtures(path.join(VISUAL, 'fixtures'), NOW);
  const personas = loadPersonas(path.join(VISUAL, 'fixtures'), NOW);
  assert.deepEqual(Object.keys(personas).sort(), [
    'access-not-live',
    'account-check-error',
    'account-disabled',
    'inbox-empty',
    'inbox-not-live',
    'module-settings',
    'rbac-error',
    'vessel-master',
  ]);
  const dra = base.tables.vessels.find((v) => v.name === 'DRAAK').id;
  const hyd = base.tables.vessels.find((v) => v.name === 'HYDRA').id;

  // vessel-master: a master assigned to DRAAK, captain on DRAAK only, nothing fleet-wide.
  const master = applyPersona(base, personas['vessel-master']);
  const profile = master.tables.profiles.find((p) => p.user_id === master.auth.id);
  assert.equal(profile.role, 'master');
  assert.ok(master.tables.crew_assignments.some((a) => a.user_id === master.auth.id && a.vessel_id === dra && a.is_current));
  assert.ok(!master.tables.crew_assignments.some((a) => a.user_id === master.auth.id && a.vessel_id !== dra && a.is_current));
  const roles = master.rpc.get_user_roles_full;
  assert.ok(roles.length > 0 && roles.every((r) => r.vessel_id === dra && r.is_fleet_wide === false));
  assert.ok(!roles.some((r) => ['superadmin', 'dpa', 'fleet_master'].includes(r.role_name)));
  assert.ok(master.tables.user_roles.every((r) => r.user_id === master.auth.id && r.vessel_id === dra));
  assert.ok(master.rpc.get_user_rbac_permissions.every((p) => p.scope === 'vessel'));

  // module-settings: DRAAK labels Planner and Charter, HYDRA has Technical off.
  const settings = applyPersona(base, personas['module-settings']).tables.vessel_module_settings;
  const row = (vessel, key) => settings.find((s) => s.vessel_id === vessel && s.module_key === key);
  assert.equal(row(dra, 'planner').label_override, 'Leave');
  assert.equal(row(dra, 'charter').label_override, 'Trip');
  assert.equal(row(hyd, 'technical').enabled, false);

  // rbac-error: the permissions store cannot load its roles.
  const broken = applyPersona(base, personas['rbac-error']);
  assert.ok(broken.config.missingTables.includes('user_roles'));
  const state = createMockState({ fixtures: broken, now: NOW });
  const call = (p) => handleSupabaseRequest(state, { method: 'POST', url: new URL(`http://127.0.0.1:54399${p}`), headers: {}, body: {} });
  const rpc = call('/rest/v1/rpc/get_user_roles_full');
  assert.equal(rpc.status, 404);
  assert.equal(JSON.parse(rpc.body).code, 'PGRST202');
  assert.equal(JSON.parse(handleSupabaseRequest(state, { method: 'GET', url: new URL('http://127.0.0.1:54399/rest/v1/user_roles?select=*'), headers: {}, body: null }).body).code, 'PGRST205');
  // The base fixtures still answer normally.
  assert.equal(handleSupabaseRequest(createMockState({ fixtures: base, now: NOW }), { method: 'POST', url: new URL('http://127.0.0.1:54399/rest/v1/rpc/get_user_roles_full'), headers: {}, body: {} }).status, 200);
});

test('personas follow the fixture rules: roles not names, example-domain emails, no phone numbers', () => {
  const personas = loadPersonas(path.join(VISUAL, 'fixtures'), NOW);
  const walk = (value, key, visit) => {
    if (Array.isArray(value)) value.forEach((v) => walk(v, key, visit));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => walk(v, k, visit));
    else visit(key, value);
  };
  walk(personas, '', (key, value) => {
    if (typeof value === 'string' && value.includes('@')) assert.match(value, /@[a-z-]+\.example$/, `${key}: ${value}`);
    if (/phone/.test(key)) assert.ok(value === null || value === '', `${key} must stay empty`);
    if (key === 'first_name') assert.equal(value, 'Demo');
  });
  assert.doesNotMatch(JSON.stringify(personas), /"\$(date|ts|now)|\{year\}/);
});
