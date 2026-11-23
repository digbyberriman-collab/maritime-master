/**
 * inspectPage() in a real browser, against synthetic DOMs that mimic what the
 * app renders (STORM's ErrorBoundary copy, AccessDenied, the first-paint
 * spinner, an empty root). Skipped when Playwright is not installed.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { loadPlaywright } from '../lib/playwright.mjs';
import { inspectPage, classify } from '../lib/inspect.mjs';

let browser = null;
let skipReason = null;

before(async () => {
  try {
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch();
  } catch (error) {
    skipReason = `Playwright unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
});

after(async () => {
  await browser?.close();
});

async function inspect(html, htmlClass = 'dark') {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><html class="${htmlClass}"><head><title>STORM</title></head><body><div id="root">${html}</div></body></html>`);
  const result = await page.evaluate(inspectPage);
  await page.close();
  return result;
}

const grade = (inspection) =>
  classify({ requestedPath: '/x', finalUrl: 'http://h/x', expectAuth: true, inspection, consoleErrors: [], pageErrors: [], navigationError: null });

test('a rendered page is ok', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const i = await inspect('<main><h1>Fleet Dashboard</h1><p>Seven vessels, two red alerts.</p></main>');
  assert.equal(i.h1, 'Fleet Dashboard');
  assert.equal(i.themeClass, 'dark');
  assert.equal(grade(i).status, 'ok');
});

test('the STORM error boundary is detected with its title', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const i = await inspect(
    '<div><h3>Crew list could not be displayed</h3><p>This part of the page failed to render. The rest of STORM is still usable.</p><p>x is undefined</p></div>',
  );
  assert.equal(i.errorBoundary, true);
  assert.equal(i.errorBoundaryTitle, 'Crew list could not be displayed');
  assert.equal(grade(i).status, 'fail');
});

test('"Something went wrong" outside the boundary is a warning', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const i = await inspect('<h1>Certificates</h1><div role="alert">Something went wrong loading certificates.</div>');
  assert.equal(i.errorBoundary, false);
  assert.equal(i.somethingWentWrong, true);
  assert.equal(grade(i).status, 'warn');
});

test('an empty root is a blank page', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const i = await inspect('');
  assert.equal(i.textLength, 0);
  assert.equal(grade(i).status, 'fail');
  assert.match(grade(i).problems.join(), /blank page/);
});

test('a spinner-only screen and an access-denied card are warnings', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const loading = await inspect('<div><span>STORM</span><svg class="animate-spin" width="32" height="32"></svg><p>Loading...</p></div>');
  assert.equal(loading.loadingOnly, true);
  assert.equal(grade(loading).status, 'warn');
  const denied = await inspect('<div><h1>Restricted area</h1><p>Your role does not include access to this module.</p></div>');
  assert.equal(denied.accessDenied, 'Restricted area');
  assert.equal(grade(denied).status, 'warn');
});

test('the stale-chunk recovery panel is a failure', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const i = await inspect("<div><div>STORM</div><p>We couldn't finish loading STORM. This is usually a temporary connection problem.</p></div>");
  assert.equal(i.recoveryPanel, true);
  assert.equal(grade(i).status, 'fail');
});

async function inspectAt(width, body) {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  await page.setContent(`<!doctype html><html class="dark"><head><title>STORM</title></head><body style="margin:0">${body}</body></html>`);
  const result = await page.evaluate(inspectPage);
  await page.close();
  return { result, width };
}

const gradeAt = ({ result, width }) =>
  classify({ requestedPath: '/x', finalUrl: 'http://h/x', expectAuth: true, inspection: result, consoleErrors: [], pageErrors: [], navigationError: null, viewportWidth: width });

test('a skeleton inside the shell is still loading, however much shell text surrounds it', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const shell = '<nav>' + 'Fleet Crew Safety Documents Maintenance Reports Settings '.repeat(4) + '</nav>';
  const { result } = await inspectAt(1440, `<div id="root">${shell}<main><h1>Crew list</h1><div role="status" aria-busy="true"><div style="height:16px"></div></div></main></div>`);
  assert.equal(result.busy, true);
  assert.ok(result.textLength > 40);
  assert.equal(result.loadingOnly, false);
  assert.deepEqual(gradeAt({ result, width: 1440 }).warnings, ['still loading (skeleton)']);
});

test('a main pane that scrolls sideways at 390 is flagged, and not at 1440', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const body = '<div id="root"><main style="overflow-x:auto;width:100%"><h1>Documents</h1><div style="width:900px;height:20px">wide table</div></main></div>';
  const phone = await inspectAt(390, body);
  assert.ok(phone.result.overflowX.main > 1, `main overflow ${phone.result.overflowX.main}`);
  assert.match(gradeAt(phone).warnings.join(), /horizontal overflow/);
  const desktop = await inspectAt(1440, body);
  assert.equal(desktop.result.overflowX.main, 0);
  assert.equal(gradeAt(desktop).status, 'ok');
});

/** A synthetic top bar: a flex row of absolutely placed controls (left, width), like the shell's. */
const topBar = (controls, extra = '') =>
  `<div id="root"><header data-testid="shell-topbar" style="position:relative;height:52px;width:320px">${controls
    .map(([id, left, width, z = 0]) => `<button data-testid="${id}" style="position:absolute;top:4px;left:${left}px;width:${width}px;height:44px;z-index:${z};overflow:hidden" aria-label="${id}"></button>`)
    .join('')}</header>${extra}<main><h1>Health</h1><p>Medical dashboard with enough text to count as a page.</p></main></div>`;

test('top-bar controls that are apart and hit at their centres report nothing', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const { result, width } = await inspectAt(320, topBar([
    ['shell-mobile-nav-trigger', 8, 44],
    ['shell-scope-fleet', 60, 44],
    ['shell-vessel-switcher-trigger', 106, 44],
    ['shell-search-trigger', 180, 44],
    ['shell-notifications-trigger', 226, 44],
    ['shell-account-trigger', 270, 44],
  ]));
  assert.deepEqual(result.topbarCollisions, []);
  assert.equal(gradeAt({ result, width }).status, 'ok');
});

test('a top-bar control painted over another fails: the overlap and the stolen centre', async (t) => {
  if (skipReason) return t.skip(skipReason);
  // The 320 px workspace case from the review: the chevron sits on top of Search.
  const { result, width } = await inspectAt(320, topBar([
    ['shell-scope-fleet', 60, 44],
    ['shell-vessel-switcher-trigger', 150, 44, 2],
    ['shell-search-trigger', 170, 44, 1],
    ['shell-account-trigger', 270, 44],
  ]));
  assert.ok(result.topbarCollisions.includes('shell-vessel-switcher-trigger overlaps shell-search-trigger by 24.0px'), result.topbarCollisions.join(' | '));
  assert.ok(result.topbarCollisions.includes('shell-search-trigger centre hits shell-vessel-switcher-trigger'), result.topbarCollisions.join(' | '));
  const graded = gradeAt({ result, width });
  assert.equal(graded.status, 'fail');
  assert.match(graded.problems.join(), /top bar collision/);
});

test('hidden top-bar controls are ignored, and an open modal skips only the centre test', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const hidden = await inspectAt(320, topBar([['shell-search-trigger', 180, 44], ['shell-account-trigger', 270, 44]]).replace(
    '</header>',
    '<span data-testid="shell-scope-workspace" style="display:none">Health &amp; Wellness</span></header>',
  ));
  assert.deepEqual(hidden.result.topbarCollisions, []);
  // A dialog overlay covers the bar on purpose: centres are not tested, overlaps still are.
  const overlay = '<div aria-modal="true" role="dialog" style="position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.5)">Search</div>';
  const modal = await inspectAt(320, topBar([['shell-search-trigger', 180, 44], ['shell-notifications-trigger', 210, 44], ['shell-account-trigger', 270, 44]], overlay));
  assert.deepEqual(modal.result.topbarCollisions, ['shell-search-trigger overlaps shell-notifications-trigger by 14.0px']);
  // No top bar at all (the sign-in page): not checked.
  const signIn = await inspectAt(320, '<div id="root"><main><h1>Sign in</h1><p>Welcome back to STORM, sign in to continue.</p></main></div>');
  assert.equal(signIn.result.topbarCollisions, null);
});
