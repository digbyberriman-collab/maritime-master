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
