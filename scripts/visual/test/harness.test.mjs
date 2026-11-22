import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveToken, resolveTokens, loadFixtures } from '../lib/fixtures.mjs';
import { parseArgs, normaliseRoutes, selectRoutes, slugFor, viewportFor } from '../lib/options.mjs';
import { classify, captureWarnings, isReactDevWarning, formatConsoleArgs, isHarnessNoise, RUNAWAY_REQUESTS } from '../lib/inspect.mjs';
import { storageKeyFor, fakeJwt, createMockState, handleSupabaseRequest } from '../lib/supabase-mock.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VISUAL = path.resolve(HERE, '..');
const NOW = new Date(2026, 10, 22, 12, 0, 0); // 22 Nov 2026, local time

// --- fixtures ---------------------------------------------------------------

test('date tokens resolve relative to now', () => {
  assert.equal(resolveToken('$date:+30', NOW), '2026-12-22');
  assert.equal(resolveToken('$date:-1y', NOW), '2025-11-22');
  assert.equal(resolveToken('$date:+2w', NOW), '2026-12-06');
  assert.equal(resolveToken('$date:0', NOW), '2026-11-22');
  assert.equal(resolveToken('$ts:-3h', NOW), new Date(NOW.getTime() - 3 * 3_600_000).toISOString());
  assert.equal(resolveToken('INC-DRA-{year}-031', NOW), 'INC-DRA-2026-031');
  assert.equal(resolveToken('$not-a-token', NOW), '$not-a-token');
  assert.deepEqual(resolveTokens({ a: ['$date:+1'], b: { c: 3 } }, NOW), { a: ['2026-11-23'], b: { c: 3 } });
});

test('loadFixtures reads tables, rpc values, _auth and _config', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-fixtures-'));
  fs.mkdirSync(path.join(dir, 'rpc'));
  fs.writeFileSync(path.join(dir, 'vessels.json'), JSON.stringify([{ id: 'v1', due: '$date:+1' }]));
  fs.writeFileSync(path.join(dir, 'rpc', 'flag.json'), 'true');
  fs.writeFileSync(path.join(dir, '_auth.json'), JSON.stringify({ id: 'u1' }));
  fs.writeFileSync(path.join(dir, '_config.json'), JSON.stringify({ missingTables: ['x'] }));
  const f = loadFixtures(dir, NOW);
  assert.deepEqual(f.tables.vessels, [{ id: 'v1', due: '2026-11-23' }]);
  assert.equal(f.rpc.flag, true);
  assert.deepEqual(f.auth, { id: 'u1' });
  assert.deepEqual(f.config.missingTables, ['x']);
  fs.writeFileSync(path.join(dir, 'bad.json'), '{"not":"an array"}');
  assert.throws(() => loadFixtures(dir, NOW), /must be an array/);
});

test('the shipped fixtures load, use the fixture identity and contain no personal data markers', () => {
  const f = loadFixtures(path.join(VISUAL, 'fixtures'), NOW);
  assert.equal(f.tables.companies[0].client_display_name, 'Demo Fleet');
  assert.deepEqual(
    f.tables.vessels.map((v) => v.name).sort(),
    ['DAGON', 'DRAAK', 'GAME CHANGER', 'HYDRA', 'LEVIATHAN', 'ROCINANTE', 'XIPHIAS'],
  );
  // IMO numbers carry a valid check digit.
  for (const v of f.tables.vessels) {
    const d = v.imo_number.split('').map(Number);
    assert.equal(d.slice(0, 6).reduce((a, x, i) => a + x * (7 - i), 0) % 10, d[6], v.name);
  }
  const me = f.tables.profiles.find((p) => p.user_id === f.auth.id);
  assert.ok(me, 'the signed-in user has a profile');
  assert.equal(me.role, 'dpa');
  assert.ok(f.rpc.get_user_roles_full.some((r) => r.role_name === 'superadmin' && r.is_fleet_wide));
  // Crew are named by role, and every email is on a reserved example domain.
  for (const p of f.tables.profiles) {
    assert.equal(p.first_name, 'Demo');
    assert.match(p.email, /@demo-fleet\.example$/);
    assert.equal(p.phone, null);
    assert.equal(p.passport_number, null);
    assert.equal(p.date_of_birth, null);
  }
  // Across every fixture: emails only on the reserved example domain, no phone numbers.
  const walk = (value, key, visit) => {
    if (Array.isArray(value)) value.forEach((v) => walk(v, key, visit));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => walk(v, k, visit));
    else visit(key, value);
  };
  walk({ ...f.tables, ...f.rpc, auth: f.auth }, '', (key, value) => {
    if (typeof value === 'string' && value.includes('@')) assert.match(value, /@[a-z-]+\.example$/, `${key}: ${value}`);
    if (/phone/.test(key)) assert.ok(value === null || value === '', `${key} must stay empty`);
  });
  // No token survived resolution.
  assert.doesNotMatch(JSON.stringify(f), /"\$(date|ts|now)|\{year\}/);
});

// --- options ----------------------------------------------------------------

test('parseArgs reads the documented flags', () => {
  const o = parseArgs(['--routes', 'dashboard,/crew/list', '--themes=dark', '--widths', '1440', '--no-server', '--full-page', '--strict'], '/repo');
  assert.deepEqual(o.routes, ['dashboard', '/crew/list']);
  assert.deepEqual(o.themes, ['dark']);
  assert.deepEqual(o.widths, [1440]);
  assert.equal(o.server, false);
  assert.equal(o.fullPage, true);
  assert.equal(o.strict, true);
  assert.equal(o.out, path.resolve('/repo', '.visual'));
  assert.equal(o.routesFile, path.resolve('/repo', 'scripts/visual/routes.json'));
  const d = parseArgs([], '/repo');
  assert.deepEqual([d.themes, d.widths, d.server, d.external], [['dark', 'light'], [1440, 390], true, 'fonts']);
  assert.throws(() => parseArgs(['--themes', 'sepia'], '/repo'), /dark and light/);
  assert.throws(() => parseArgs(['--widths', 'wide'], '/repo'), /positive integer/);
  assert.throws(() => parseArgs(['--bogus'], '/repo'), /Unknown option/);
  assert.throws(() => parseArgs(['--routes'], '/repo'), /needs a value/);
});

test('routes: slugs, normalisation and selection', () => {
  assert.equal(slugFor('/crew/list'), 'crew-list');
  assert.equal(slugFor('/'), 'root');
  assert.equal(slugFor('/v/dra/crew?tab=matrix'), 'v-dra-crew-tab-matrix');
  const routes = normaliseRoutes(['/dashboard', { path: '/auth', auth: false }]);
  assert.deepEqual(routes.map((r) => r.slug), ['dashboard', 'auth']);
  assert.throws(() => normaliseRoutes(['/a', '/a']), /Duplicate/);
  assert.throws(() => normaliseRoutes(['nope']), /start with/);
  assert.deepEqual(selectRoutes(routes, ['auth', '/dashboard']).map((r) => r.path), ['/auth', '/dashboard']);
  assert.deepEqual(selectRoutes(routes, ['/fleet/overview']), [{ path: '/fleet/overview', slug: 'fleet-overview' }]);
  assert.throws(() => selectRoutes(routes, ['nothing']), /Unknown route/);
});

test('the shipped routes.json is valid', () => {
  const routes = normaliseRoutes(JSON.parse(fs.readFileSync(path.join(VISUAL, 'routes.json'), 'utf8')));
  assert.ok(routes.length >= 10);
  assert.ok(routes.some((r) => r.path === '/auth' && r.auth === false));
  assert.ok(routes.some((r) => r.path === '/dashboard'));
});

test('viewports use device heights for the standard widths', () => {
  assert.deepEqual(viewportFor(1440), { width: 1440, height: 900 });
  assert.deepEqual(viewportFor(390), { width: 390, height: 844 });
  assert.deepEqual(viewportFor(1600), { width: 1600, height: 1000 });
});

// --- grading ----------------------------------------------------------------

const page = (overrides = {}) => ({
  title: 'STORM', h1: 'Fleet Dashboard', themeClass: 'dark', textLength: 900, textSample: '', rootChildren: 3,
  visibleMedia: 2, errorBoundary: false, errorBoundaryTitle: null, somethingWentWrong: false, accessDenied: null,
  recoveryPanel: false, loadingOnly: false, busy: false, overflowX: { main: 0, document: 0 }, signInForm: false, ...overrides,
});
const base = { requestedPath: '/dashboard', finalUrl: 'http://x/dashboard', expectAuth: true, consoleErrors: [], pageErrors: [], navigationError: null };

test('classify: ok, warn and fail', () => {
  assert.equal(classify({ ...base, inspection: page() }).status, 'ok');
  assert.equal(classify({ ...base, inspection: page(), consoleErrors: ['x'] }).status, 'warn');
  assert.equal(classify({ ...base, inspection: page({ errorBoundary: true, errorBoundaryTitle: 'Something went wrong' }) }).status, 'fail');
  assert.equal(classify({ ...base, inspection: page({ textLength: 0, visibleMedia: 0 }) }).status, 'fail');
  assert.equal(classify({ ...base, inspection: page(), pageErrors: ['TypeError'] }).status, 'fail');
  const toAuth = classify({ ...base, finalUrl: 'http://x/auth', inspection: page() });
  assert.equal(toAuth.status, 'fail');
  assert.match(toAuth.problems.join(), /sign-in/);
  // Signed-out routes may sit on /auth.
  assert.equal(classify({ ...base, requestedPath: '/auth', finalUrl: 'http://x/auth', expectAuth: false, inspection: page() }).status, 'ok');
  // Redirects warn unless expected.
  assert.equal(classify({ ...base, requestedPath: '/vessels', finalUrl: 'http://x/vessels/dashboard', inspection: page() }).status, 'warn');
  assert.equal(classify({ ...base, requestedPath: '/vessels', finalUrl: 'http://x/vessels/dashboard', expectRedirect: '/vessels/dashboard', inspection: page() }).status, 'ok');
  assert.equal(classify({ ...base, requestedPath: '/hris', finalUrl: 'http://x/hr?module=hris', expectRedirect: true, inspection: page() }).status, 'ok');
  assert.equal(classify({ ...base, inspection: page({ accessDenied: 'Restricted area' }) }).status, 'warn');
  assert.equal(classify({ ...base, inspection: null, navigationError: 'Timeout' }).status, 'fail');
});

test('classify: a skeleton still busy is a warning whatever the text length', () => {
  const busy = classify({ ...base, inspection: page({ busy: true, textLength: 2000 }) });
  assert.equal(busy.status, 'warn');
  assert.deepEqual(busy.warnings, ['still loading (skeleton)']);
  // The short spinner-only screen keeps its own wording.
  assert.deepEqual(classify({ ...base, inspection: page({ loadingOnly: true }) }).warnings, ['still loading']);
});

test('classify: sideways scroll warns at phone width only', () => {
  const wide = page({ overflowX: { main: 510, document: 0 } });
  const phone = classify({ ...base, inspection: wide, viewportWidth: 390 });
  assert.equal(phone.status, 'warn');
  assert.match(phone.warnings.join(), /horizontal overflow: 510px at 390px wide/);
  assert.equal(classify({ ...base, inspection: page({ overflowX: { main: 0, document: 24 } }), viewportWidth: 390 }).status, 'warn');
  // Desktop, sub-pixel rounding, or no width given: no warning.
  assert.equal(classify({ ...base, inspection: wide, viewportWidth: 1440 }).status, 'ok');
  assert.equal(classify({ ...base, inspection: page({ overflowX: { main: 1, document: 1 } }), viewportWidth: 390 }).status, 'ok');
  assert.equal(classify({ ...base, inspection: wide }).status, 'ok');
});

test('captureWarnings: waits that gave up and runaway fetching are warnings, not notes', () => {
  assert.deepEqual(
    captureWarnings({
      notes: [
        'network did not go idle',
        'a spinner was still showing',
        'a skeleton was still showing',
        'waitFor "[data-testid=grid]" not found',
        'screenshot failed: Timeout 30000ms exceeded',
      ],
    }),
    [
      'network did not go idle',
      'a spinner was still showing',
      'a skeleton was still showing',
      'waitFor "[data-testid=grid]" not found',
      'screenshot failed: Timeout 30000ms exceeded',
    ],
  );
  assert.deepEqual(captureWarnings({ notes: [], mockRequests: 60 }), []);
  assert.deepEqual(captureWarnings({ mockRequests: RUNAWAY_REQUESTS }), []);
  assert.deepEqual(captureWarnings({ notes: ['network did not go idle'], mockRequests: 10469 }), [
    'network did not go idle',
    'runaway fetching: 10469 mock requests',
  ]);
  assert.deepEqual(captureWarnings(), []);
});

test('console helpers: React warnings, formatting and harness noise', () => {
  assert.equal(isReactDevWarning('Warning: React does not recognize the `fetchPriority` prop'), true);
  assert.equal(isReactDevWarning('Warning: Maximum update depth exceeded.'), false);
  assert.equal(isReactDevWarning('TypeError: x is undefined'), false);
  assert.equal(formatConsoleArgs(['Warning: %s cannot appear in <%s>.%s', 'div', 'p', '']), 'Warning: div cannot appear in <p>.');
  assert.equal(formatConsoleArgs(['a', { b: 1 }]), 'a {"b":1}');
  assert.equal(isHarnessNoise('Failed to load resource: net::ERR_FAILED https://tile.openstreetmap.org/1/1/1.png'), true);
  assert.equal(isHarnessNoise('Failed to load resource: the server responded with a status of 500'), false);
});

// --- supabase mock ------------------------------------------------------------

test('storage key matches supabase-js for the mock URL', () => {
  assert.equal(storageKeyFor('http://127.0.0.1:54399'), 'sb-127-auth-token');
  assert.equal(storageKeyFor('https://abcdefgh.supabase.co'), 'sb-abcdefgh-auth-token');
});

test('fake JWTs decode to the claims supabase-js reads', () => {
  const token = fakeJwt({ sub: 'u1', exp: 4_102_444_800, role: 'authenticated' });
  const [, payload] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url').toString()), { sub: 'u1', exp: 4_102_444_800, role: 'authenticated' });
});

const call = (state, method, p, body = null, headers = {}) =>
  handleSupabaseRequest(state, { method, url: new URL(`http://127.0.0.1:54399${p}`), headers, body });

test('auth endpoints answer for the fixture user; signed-out state refuses', () => {
  const fixtures = loadFixtures(path.join(VISUAL, 'fixtures'), NOW);
  const state = createMockState({ fixtures, signedIn: true, now: NOW });
  assert.ok(state.session.expires_at * 1000 > NOW.getTime() + 3_600_000);
  assert.equal(state.session.user.id, fixtures.auth.id);
  const user = call(state, 'GET', '/auth/v1/user');
  assert.equal(user.status, 200);
  assert.equal(JSON.parse(user.body).id, fixtures.auth.id);
  const refreshed = call(state, 'POST', '/auth/v1/token?grant_type=refresh_token', { refresh_token: 'x' });
  assert.equal(JSON.parse(refreshed.body).user.id, fixtures.auth.id);
  assert.equal(call(state, 'GET', '/auth/v1/sessions').body, '[]');
  assert.equal(call(state, 'POST', '/auth/v1/logout').status, 204);
  assert.equal(call(state, 'GET', '/auth/v1/user').status, 401);
  assert.equal(call(state, 'POST', '/auth/v1/token?grant_type=refresh_token').status, 400);
  // A password sign-in on /auth signs the fixture user back in.
  assert.equal(call(state, 'POST', '/auth/v1/token?grant_type=password', { email: 'a', password: 'b' }).status, 200);
});

test('rest, rpc, storage and functions are routed and logged', () => {
  const fixtures = loadFixtures(path.join(VISUAL, 'fixtures'), NOW);
  const state = createMockState({ fixtures, now: NOW });
  const profile = call(state, 'GET', `/rest/v1/profiles?select=*&user_id=eq.${fixtures.auth.id}`, null, { accept: 'application/vnd.pgrst.object+json' });
  assert.equal(JSON.parse(profile.body).role, 'dpa');
  assert.equal(call(state, 'POST', '/rest/v1/rpc/get_user_rbac_permissions', { p_user_id: fixtures.auth.id }).status, 200);
  assert.equal(call(state, 'POST', '/storage/v1/object/list/crew-documents', { prefix: '' }).body, '[]');
  assert.equal(call(state, 'GET', '/storage/v1/object/public/logos/a.png').headers['content-type'], 'image/png');
  assert.match(JSON.parse(call(state, 'POST', '/storage/v1/object/sign/docs/a.pdf', { expiresIn: 60 }).body).signedURL, /token=visual/);
  assert.equal(call(state, 'POST', '/functions/v1/send-invite', {}).body, '{}');
  assert.deepEqual(state.log.map((l) => l.kind), ['rest', 'rpc', 'storage', 'storage', 'storage', 'functions']);
  // Writes made in one context never reach the shared fixtures.
  call(state, 'DELETE', '/rest/v1/vessels?id=neq.none');
  assert.equal(state.db.tables.vessels.length, 0);
  assert.equal(fixtures.tables.vessels.length, 7);
});
