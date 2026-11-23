#!/usr/bin/env node
/**
 * STORM visual + route-smoke harness (a reviewer tool, not a CI gate).
 *
 * Starts the Vite dev server against a mocked Supabase, signs in a fixture
 * fleet manager, visits each route in scripts/visual/routes.json in each theme
 * and viewport, and saves:
 *   .visual/<theme>-<width>-<slug>.png   one screenshot per capture
 *   .visual/report.json                  console/page errors, error boundaries,
 *                                        blank pages, final URL, unmocked tables
 * then prints a summary table. See scripts/visual/README.md.
 *
 * Usage:
 *   node scripts/visual/capture.mjs [--routes a,b] [--themes dark,light] [--widths 1440,390]
 *                                   [--no-server] [--base-url URL] [--supabase-url URL]
 *                                   [--out DIR] [--full-page] [--concurrency N]
 *                                   [--external fonts|block|live] [--timeout MS] [--strict] [--list]
 *                                   [--persona NAME]
 *
 * A route may script the page before its screenshot ("actions": press a key,
 * click, type, wait for a selector; lib/actions.mjs), capture as a persona
 * ("persona": fixtures/_personas.json; lib/personas.mjs) and choose
 * prefers-reduced-motion ("reducedMotion").
 */

import { spawn, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadFixtures } from './lib/fixtures.mjs';
import { loadPersonas, applyPersona, personaFor, captureName } from './lib/personas.mjs';
import { runActions, DEFAULT_ACTION_TIMEOUT_MS } from './lib/actions.mjs';
import { createMockState, installSupabaseMock, FAKE_PUBLISHABLE_KEY } from './lib/supabase-mock.mjs';
import { inspectPage, classify, captureWarnings, isHarnessNoise, isReactDevWarning, formatConsoleArgs } from './lib/inspect.mjs';
import { parseArgs, normaliseRoutes, selectRoutes, viewportFor, HELP } from './lib/options.mjs';
import { loadPlaywright } from './lib/playwright.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

// ---------------------------------------------------------------------------
// Dev server
// ---------------------------------------------------------------------------

async function isUp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function startServer(options) {
  if (await isUp(options.baseUrl)) {
    throw new Error(`${options.baseUrl} is already serving. Stop it, or pass --no-server to use it (it must run with VITE_SUPABASE_URL=${options.supabaseUrl}).`);
  }
  const port = new URL(options.baseUrl).port || '4319';
  const host = new URL(options.baseUrl).hostname;
  fs.mkdirSync(options.out, { recursive: true });
  const logFile = path.join(options.out, 'vite.log');
  const log = fs.createWriteStream(logFile);
  const args = ['vite', '--config', path.relative(ROOT, path.join(HERE, 'vite.visual.config.mjs')), '--port', port, '--strictPort', '--host', host];
  const child = spawn('npx', args, {
    cwd: ROOT,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: options.supabaseUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
      VITE_SUPABASE_PROJECT_ID: 'visual-harness',
      BROWSER: 'none',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  let exited = null;
  child.on('exit', (code) => { exited = code ?? -1; });

  const stop = () => {
    if (exited !== null) return;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
    }
  };

  const deadline = Date.now() + options.serverTimeout;
  while (Date.now() < deadline) {
    if (exited !== null) {
      throw new Error(`Vite exited early (code ${exited}). See ${path.relative(ROOT, logFile)}.`);
    }
    if (await isUp(options.baseUrl)) return { stop, logFile };
    await new Promise((r) => setTimeout(r, 500));
  }
  stop();
  throw new Error(`Vite did not answer on ${options.baseUrl} within ${options.serverTimeout / 1000}s. See ${path.relative(ROOT, logFile)}.`);
}

// ---------------------------------------------------------------------------
// Requests that leave the app and the mock (fonts, map tiles, CDNs)
// ---------------------------------------------------------------------------

const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

function contentTypeFor(url) {
  if (url.hostname === 'fonts.googleapis.com') return 'text/css; charset=utf-8';
  const ext = path.extname(url.pathname).toLowerCase();
  return { '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' }[ext] ?? 'application/octet-stream';
}

/**
 * Google Fonts are fetched by this process with curl (which honours the
 * machine's proxy settings and CA store) and cached under .visual/.cache, so
 * screenshots use the real Inter / Barlow / JetBrains Mono even when the
 * browser itself has no route out.
 */
function makeFontFetcher(cacheDir) {
  const memory = new Map();
  fs.mkdirSync(cacheDir, { recursive: true });
  return async (url, userAgent) => {
    const key = createHash('sha1').update(`${url}|${url.includes('googleapis') ? userAgent : ''}`).digest('hex');
    if (memory.has(key)) return memory.get(key);
    const file = path.join(cacheDir, key);
    if (fs.existsSync(file)) {
      const body = fs.readFileSync(file);
      memory.set(key, body);
      return body;
    }
    const body = await new Promise((resolve, reject) => {
      execFile('curl', ['-sS', '-L', '--fail', '--max-time', '20', '-A', userAgent, url], { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 }, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });
    fs.writeFileSync(file, body);
    memory.set(key, body);
    return body;
  };
}

async function routeExternal(context, { mode, allowedOrigins, fetchFont, record }) {
  if (mode === 'live') return;
  await context.route((url) => /^https?:$/.test(url.protocol) && !allowedOrigins.has(url.origin), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (mode === 'fonts' && FONT_HOSTS.has(url.hostname)) {
      try {
        const body = await fetchFont(url.href, req.headers()['user-agent'] ?? '');
        await route.fulfill({ status: 200, headers: { 'content-type': contentTypeFor(url), 'access-control-allow-origin': '*' }, body });
        return;
      } catch {
        record(url, 'font fetch failed');
        await route.fulfill({ status: 200, headers: { 'content-type': contentTypeFor(url), 'access-control-allow-origin': '*' }, body: '' });
        return;
      }
    }
    record(url, 'stubbed');
    await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' }, body: '' });
  });
}

// ---------------------------------------------------------------------------
// One capture
// ---------------------------------------------------------------------------

async function capture(browser, job, ctx) {
  const { route, theme, width } = job;
  const { options, fetchFont } = ctx;
  const persona = personaFor(route, options.persona, ctx.personas);
  const fixtures = applyPersona(ctx.fixtures, persona ? ctx.personas[persona] : undefined);
  const viewport = viewportFor(width);
  const mobile = width < 768;
  const startedAt = Date.now();
  // Reduced motion by default keeps screenshots stable; a route may ask for motion.
  const reducedMotion = route.reducedMotion === false ? 'no-preference' : 'reduce';
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    colorScheme: theme === 'light' ? 'light' : 'dark',
    reducedMotion,
    locale: 'en-GB',
    timezoneId: 'UTC',
  });
  const state = createMockState({ fixtures, signedIn: route.auth !== false });
  await installSupabaseMock(context, {
    supabaseUrl: options.supabaseUrl,
    state,
    localStorage: { 'storm-theme': theme, ...(route.localStorage ?? {}) },
  });
  const external = new Map();
  await routeExternal(context, {
    mode: options.external,
    allowedOrigins: new Set([new URL(options.baseUrl).origin, new URL(options.supabaseUrl).origin]),
    fetchFont,
    record: (url, how) => external.set(url.host, how),
  });

  const page = await context.newPage();
  if (typeof route.reducedMotion === 'boolean') await page.emulateMedia({ reducedMotion }).catch(() => {});
  const consoleErrors = [];
  const reactWarnings = [];
  const ignoredConsole = [];
  const pageErrors = [];
  const failedRequests = [];
  const pendingConsole = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    pendingConsole.push((async () => {
      const args = await Promise.all(msg.args().map((a) => a.jsonValue().catch(() => '[object]')));
      const text = (args.length ? formatConsoleArgs(args) : msg.text()) || msg.text();
      const loc = msg.location();
      const where = loc?.url ? ` (${loc.url.replace(options.baseUrl, '')}:${loc.lineNumber})` : '';
      const entry = `${text.split('\n')[0]}${where}`.slice(0, 600);
      const list = isHarnessNoise(entry) ? ignoredConsole : isReactDevWarning(text) ? reactWarnings : consoleErrors;
      if (!list.includes(entry)) list.push(entry);
    })().catch(() => {}));
  });
  page.on('pageerror', (error) => pageErrors.push(`${error.name}: ${error.message}`.slice(0, 600)));
  page.on('requestfailed', (req) => {
    const failure = req.failure()?.errorText ?? 'failed';
    if (failure === 'net::ERR_ABORTED') return; // navigations and cancelled fetches
    failedRequests.push(`${req.method()} ${req.url().slice(0, 200)} ${failure}`);
  });

  const notes = [];
  let navigationError = null;
  let inspection = null;
  const steps = route.steps ?? [];
  let actionsRan = 0;
  const target = new URL(route.path, options.baseUrl).href;
  try {
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: options.timeout });
    await page.waitForLoadState('networkidle', { timeout: options.timeout }).catch(() => notes.push('network did not go idle'));
    if (route.waitFor) {
      await page.waitForSelector(route.waitFor, { timeout: options.timeout }).catch(() => notes.push(`waitFor "${route.waitFor}" not found`));
    }
    // Lazy pages and React Query fetch in waves; give spinners a moment to clear.
    await page
      .waitForFunction(() => document.querySelectorAll('.animate-spin').length === 0, null, { timeout: 8_000 })
      .catch(() => notes.push('a spinner was still showing'));
    // Skeletons announce themselves with aria-busy; wait for them the same way.
    await page
      .waitForFunction(() => !document.querySelector('#root [aria-busy="true"]'), null, { timeout: 8_000 })
      .catch(() => notes.push('a skeleton was still showing'));
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await page.waitForTimeout(options.settle);
    if (steps.length) {
      // Scripted interaction on the settled page; a failed step is a note (warning), never a crash.
      const played = await runActions(page, steps, { timeout: Math.min(options.timeout, DEFAULT_ACTION_TIMEOUT_MS) });
      actionsRan = played.ran;
      notes.push(...played.notes);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      await page.evaluate(() => document.fonts?.ready).catch(() => {});
      await page.waitForTimeout(options.settle);
    }
    inspection = await page.evaluate(inspectPage);
  } catch (error) {
    navigationError = error instanceof Error ? error.message.split('\n')[0] : String(error);
  }

  let screenshot = null;
  if (!job.warmup) {
    const file = path.join(options.out, `${theme}-${width}-${captureName(route, persona)}.png`);
    try {
      await page.screenshot({ path: file, fullPage: options.fullPage, animations: 'disabled', caret: 'hide', timeout: 30_000 });
      screenshot = path.relative(ROOT, file);
    } catch (error) {
      notes.push(`screenshot failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    }
  }

  const finalUrl = (() => {
    try { return page.url(); } catch { return null; }
  })();
  await Promise.allSettled(pendingConsole);
  await context.close();

  const restWithoutFixture = [...new Set(state.log.filter((l) => l.kind === 'rest' && !l.fixture).map((l) => l.table))].sort();
  const rpcWithoutFixture = [...new Set(state.log.filter((l) => l.kind === 'rpc' && !l.fixture).map((l) => l.rpc))].sort();
  const grade = classify({
    requestedPath: route.path,
    finalUrl,
    expectAuth: route.auth !== false,
    expectRedirect: route.expectRedirect,
    inspection,
    consoleErrors,
    pageErrors,
    navigationError,
    viewportWidth: viewport.width,
  });
  // Waits that gave up and runaway request volume would otherwise pass as ok.
  grade.warnings.push(...captureWarnings({ notes, mockRequests: state.log.length }));
  if (inspection && !inspection.themeClass.split(/\s+/).includes(theme)) grade.warnings.push(`theme class is "${inspection.themeClass}"`);
  if (state.log.length === 0 && route.auth !== false) {
    grade.warnings.push(`no request reached the mock at ${options.supabaseUrl}: is the server running with VITE_SUPABASE_URL=${options.supabaseUrl}?`);
  }
  if (grade.status === 'ok' && grade.warnings.length) grade.status = 'warn';

  return {
    route: route.path,
    slug: route.slug,
    persona,
    actions: steps.length ? { total: steps.length, ran: actionsRan } : undefined,
    theme,
    width,
    viewport,
    status: grade.status,
    problems: grade.problems,
    warnings: grade.warnings,
    notes,
    finalUrl,
    finalPath: finalUrl ? new URL(finalUrl).pathname + new URL(finalUrl).search : null,
    screenshot,
    durationMs: Date.now() - startedAt,
    page: inspection,
    consoleErrors,
    reactWarnings,
    pageErrors,
    failedRequests,
    ignoredConsoleErrors: ignoredConsole.length,
    externalHosts: Object.fromEntries(external),
    mock: {
      requests: state.log.length,
      restWithoutFixture,
      rpcWithoutFixture,
      tablesRead: [...new Set(state.log.filter((l) => l.kind === 'rest').map((l) => l.table))].sort(),
    },
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function printSummary(results) {
  const rows = results.map((r) => [
    r.status.toUpperCase(),
    r.theme,
    String(r.width),
    r.route,
    r.finalPath ?? '-',
    String(r.consoleErrors.length),
    String(r.reactWarnings.length),
    String(r.pageErrors.length),
    [...r.problems, ...r.warnings].join('; ').slice(0, 90) || '-',
  ]);
  const head = ['STATUS', 'THEME', 'WIDTH', 'ROUTE', 'FINAL', 'CONSOLE', 'REACT', 'PAGEERR', 'NOTES'];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log('');
  console.log(line(head));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  rows.forEach((row) => console.log(line(row)));
  const count = (s) => results.filter((r) => r.status === s).length;
  // The top-bar check (inspectPage's topbarCollisions) in full; the NOTES column cuts it short.
  const checked = results.filter((r) => Array.isArray(r.page?.topbarCollisions));
  const collided = checked.filter((r) => r.page.topbarCollisions.length);
  console.log('');
  if (collided.length) {
    console.log(`Top-bar collisions in ${collided.length} of ${checked.length} capture(s) with a top bar:`);
    for (const r of collided) console.log(`  ${r.theme}-${r.width}-${r.slug}${r.persona ? ` (persona ${r.persona})` : ''}: ${r.page.topbarCollisions.join('; ')}`);
  } else {
    console.log(`Top-bar collisions: none in ${checked.length} capture(s) with a top bar`);
  }
  console.log(`${results.length} capture(s): ${count('ok')} ok, ${count('warn')} warn, ${count('fail')} fail`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2), ROOT);
  if (options.help) {
    console.log(HELP);
    return 0;
  }
  const allRoutes = normaliseRoutes(JSON.parse(fs.readFileSync(options.routesFile, 'utf8')));
  const routes = selectRoutes(allRoutes, options.routes);
  if (options.list) {
    routes.forEach((r) => {
      const extras = [r.auth === false ? 'signed out' : null, r.persona ? `persona ${r.persona}` : null, r.steps?.length ? `${r.steps.length} actions` : null].filter(Boolean);
      console.log(`${r.slug.padEnd(32)} ${r.path}${extras.length ? `  (${extras.join(', ')})` : ''}`);
    });
    return 0;
  }
  if (routes.length === 0) throw new Error('No routes selected.');

  const fixtures = loadFixtures(options.fixturesDir);
  const personas = loadPersonas(options.fixturesDir);
  // Unknown personas fail before the server starts.
  for (const route of routes) personaFor(route, options.persona, personas);
  fs.mkdirSync(options.out, { recursive: true });

  let server = null;
  const cleanup = () => server?.stop();
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });

  try {
    if (options.server) {
      console.log(`Starting Vite on ${options.baseUrl} (Supabase mocked at ${options.supabaseUrl}) ...`);
      server = await startServer(options);
    } else if (!(await isUp(options.baseUrl))) {
      throw new Error(`--no-server: nothing is answering on ${options.baseUrl}.`);
    }

    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch();
    const ctx = { options, fixtures, personas, fetchFont: makeFontFetcher(path.join(options.out, '.cache', 'fonts')) };
    try {
      // Warm-up (no screenshot): the first load makes Vite optimise
      // dependencies and may reload the page once; keep that out of the captures.
      const warmRoute = routes.find((r) => r.auth !== false) ?? routes[0];
      const warm = await capture(browser, { route: warmRoute, theme: 'dark', width: 1440, warmup: true }, {
        ...ctx,
        options: { ...options, timeout: Math.max(options.timeout, 120_000) },
      });
      if (warm.mock.requests === 0 && warmRoute.auth !== false) {
        console.warn(`Warning: the app sent no requests to ${options.supabaseUrl}. If you used --no-server, start the server with VITE_SUPABASE_URL=${options.supabaseUrl} (or pass --supabase-url to match it).`);
      }

      const jobs = [];
      // A route's own `widths` narrows the run's (a phone-only drawer, a tablet-only menu).
      for (const route of routes)
        for (const theme of options.themes)
          for (const width of options.widths) if (!route.widths || route.widths.includes(width)) jobs.push({ route, theme, width });
      const results = new Array(jobs.length);
      let next = 0;
      const worker = async () => {
        while (next < jobs.length) {
          const index = next++;
          const job = jobs[index];
          const result = await capture(browser, job, ctx);
          results[index] = result;
          console.log(`${result.status.padEnd(4)} ${job.theme}-${job.width}-${captureName(job.route, result.persona)} -> ${result.finalPath ?? '?'} (${result.durationMs} ms)`);
        }
      };
      await Promise.all(Array.from({ length: Math.min(options.concurrency, jobs.length) }, worker));

      const report = {
        generatedAt: new Date().toISOString(),
        baseUrl: options.baseUrl,
        supabaseUrl: options.supabaseUrl,
        themes: options.themes,
        widths: options.widths,
        fullPage: options.fullPage,
        external: options.external,
        persona: options.persona,
        summary: {
          total: results.length,
          ok: results.filter((r) => r.status === 'ok').length,
          warn: results.filter((r) => r.status === 'warn').length,
          fail: results.filter((r) => r.status === 'fail').length,
        },
        captures: results,
      };
      const reportFile = path.join(options.out, 'report.json');
      fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
      printSummary(results);
      console.log(`Screenshots and report: ${path.relative(ROOT, options.out) || '.'}/ (report.json)`);
      return options.strict && report.summary.fail > 0 ? 1 : 0;
    } finally {
      await browser.close();
    }
  } finally {
    cleanup();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}
