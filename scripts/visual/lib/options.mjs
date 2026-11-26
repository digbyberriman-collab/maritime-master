/**
 * Command-line options, routes.json normalisation and viewport sizes for the
 * visual harness. Pure apart from `loadRoutes`, which reads routes.json and
 * routes.d/; tested in scripts/visual/test/harness.test.mjs and
 * scripts/visual/test/overlays.test.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { validateActions } from './actions.mjs';

export const HELP = `STORM visual + route-smoke harness

  node scripts/visual/capture.mjs [options]

  --routes a,b          only these routes (slug or path; an unknown /path is captured ad hoc)
  --themes dark,light   themes to capture (default: dark,light)
  --widths 1440,390     viewport widths (default: 1440,390; heights: 1440x900, 390x844, ...)
  --no-server           use a server that is already running at --base-url
  --base-url URL        app origin (default: http://127.0.0.1:4319)
  --supabase-url URL    Supabase origin to mock (default: http://127.0.0.1:54399)
  --out DIR             output directory (default: .visual)
  --full-page           full-page screenshots instead of the viewport
  --concurrency N       captures in parallel (default: 1)
  --external MODE       fonts (default): Google Fonts fetched via curl, other externals stubbed
                        block: stub every external request; live: let the browser go out
  --timeout MS          per-navigation timeout (default: 45000)
  --settle MS           pause before each screenshot (default: 400)
  --persona NAME        capture every selected route as this persona (fixtures/_personas.json)
  --fixtures DIR        base fixtures (default: scripts/visual/fixtures)
  --overlays DIR        fixture overlays, one folder each (default: <fixtures>/../fixtures.d);
                        a folder holding fixture files itself is one overlay
  --no-overlays         base fixtures only
  --strict              exit 1 when any capture fails
  --list                print the selected routes, with the file each comes from, and exit
  --help                this text`;

const DEFAULTS = {
  routes: null,
  themes: ['dark', 'light'],
  widths: [1440, 390],
  server: true,
  baseUrl: 'http://127.0.0.1:4319',
  supabaseUrl: 'http://127.0.0.1:54399',
  out: '.visual',
  fullPage: false,
  concurrency: 1,
  external: 'fonts',
  timeout: 45_000,
  settle: 400,
  serverTimeout: 180_000,
  strict: false,
  persona: null,
  overlays: true,
  list: false,
  help: false,
};

const list = (value) => String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const positiveInt = (flag, value) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${flag} needs a positive integer, got "${value}"`);
  return n;
};

/** Parse argv (without node and the script). Paths resolve against `root`. */
export function parseArgs(argv, root) {
  const o = { ...DEFAULTS, themes: [...DEFAULTS.themes], widths: [...DEFAULTS.widths] };
  let routesFile = null;
  let fixturesDir = null;
  let overlaysDir = null;
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    const eq = raw.indexOf('=');
    const flag = eq === -1 ? raw : raw.slice(0, eq);
    const inline = eq === -1 ? undefined : raw.slice(eq + 1);
    const value = () => {
      if (inline !== undefined) return inline;
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`${flag} needs a value`);
      i += 1;
      return v;
    };
    switch (flag) {
      case '--routes': o.routes = list(value()); break;
      case '--themes': {
        o.themes = list(value());
        const bad = o.themes.filter((t) => t !== 'dark' && t !== 'light');
        if (bad.length) throw new Error(`--themes accepts dark and light, got ${bad.join(', ')}`);
        break;
      }
      case '--widths': o.widths = list(value()).map((w) => positiveInt('--widths', w)); break;
      case '--no-server': o.server = false; break;
      case '--base-url': o.baseUrl = new URL(value()).origin; break;
      case '--supabase-url': o.supabaseUrl = new URL(value()).origin; break;
      case '--out': o.out = value(); break;
      case '--full-page': o.fullPage = true; break;
      case '--concurrency': o.concurrency = positiveInt('--concurrency', value()); break;
      case '--external': {
        const mode = value();
        if (!['fonts', 'block', 'live'].includes(mode)) throw new Error(`--external accepts fonts, block or live, got ${mode}`);
        o.external = mode;
        break;
      }
      case '--timeout': o.timeout = positiveInt('--timeout', value()); break;
      case '--settle': o.settle = Number(value()) || 0; break;
      case '--routes-file': routesFile = value(); break;
      case '--fixtures': fixturesDir = value(); break;
      case '--overlays': overlaysDir = value(); break;
      case '--no-overlays': o.overlays = false; break;
      case '--persona': o.persona = value(); break;
      case '--strict': o.strict = true; break;
      case '--list': o.list = true; break;
      case '--help':
      case '-h': o.help = true; break;
      default: throw new Error(`Unknown option ${raw}. Try --help.`);
    }
  }
  if (o.themes.length === 0) throw new Error('--themes is empty');
  if (o.widths.length === 0) throw new Error('--widths is empty');
  o.out = path.resolve(root, o.out);
  o.routesFile = path.resolve(root, routesFile ?? 'scripts/visual/routes.json');
  o.fixturesDir = path.resolve(root, fixturesDir ?? 'scripts/visual/fixtures');
  if (overlaysDir !== null && !o.overlays) throw new Error('--overlays and --no-overlays together: pick one');
  // An explicit folder must exist; the default may be absent (no overlays).
  o.overlaysExplicit = overlaysDir !== null;
  o.overlaysDir = overlaysDir !== null ? path.resolve(root, overlaysDir) : path.join(path.dirname(o.fixturesDir), 'fixtures.d');
  o.routesDir = path.join(path.dirname(o.routesFile), 'routes.d');
  return o;
}

/** '/crew/list' → 'crew-list', '/' → 'root', '/v/dra/crew?tab=x' → 'v-dra-crew-tab-x'. */
export function slugFor(routePath) {
  const slug = routePath.replace(/^\/+/, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return slug || 'root';
}

/**
 * routes.json entries are a path string or an object:
 *   { "path": "/auth", "slug": "sign-in", "auth": false, "expectRedirect": "/dashboard",
 *     "waitFor": "main h1", "localStorage": { "key": "value" }, "note": "why it is here",
 *     "persona": "vessel-master", "reducedMotion": true, "widths": [390, 768],
 *     "actions": [{ "press": "Control+k" }, { "waitFor": "[data-testid=\"command-palette\"]" }] }
 * `actions` are checked here (lib/actions.mjs) into `steps`, so a typo fails before the run.
 */
export function normaliseRoutes(raw, source = 'routes.json') {
  return normaliseRouteSources([{ source, raw }]);
}

/** What a capture does, apart from its name and notes: two entries with the same key capture the same thing. */
const captureKey = (r) => JSON.stringify([r.path, r.auth ?? true, r.persona ?? null, r.actions ?? null, r.localStorage ?? null, r.widths ?? null, r.reducedMotion ?? null]);

/**
 * Normalise routes from several files (routes.json, then routes.d/*.json),
 * each route tagged with its `source`. Slugs are unique across all files,
 * and no two entries capture the same thing (same path with the same auth,
 * persona, actions, localStorage, widths and reduced motion); either is an
 * error naming both files.
 * @param {{ source: string, raw: unknown }[]} sources
 */
export function normaliseRouteSources(sources) {
  const slugs = new Map();
  const captures = new Map();
  const out = [];
  for (const { source, raw } of sources) {
    const entries = Array.isArray(raw) ? raw : raw?.routes;
    if (!Array.isArray(entries)) throw new Error(`${source} must be an array (or { "routes": [...] })`);
    for (const entry of entries) {
      const r = typeof entry === 'string' ? { path: entry } : { ...entry };
      if (typeof r.path !== 'string' || !r.path.startsWith('/')) throw new Error(`${source}: route path must start with "/": ${JSON.stringify(entry)}`);
      r.slug = r.slug ?? slugFor(r.path);
      const where = `Route "${r.slug}"`;
      const twin = slugs.get(r.slug);
      if (twin) throw new Error(`Duplicate route slug "${r.slug}" in ${source}${twin === source ? '' : ` (also in ${twin})`}`);
      slugs.set(r.slug, source);
      // `steps` is the checked form capture.mjs plays; `actions` stays as written.
      r.steps = validateActions(r.actions, where);
      if (r.reducedMotion !== undefined && typeof r.reducedMotion !== 'boolean') throw new Error(`${where}: "reducedMotion" must be true or false`);
      if (r.persona !== undefined && (typeof r.persona !== 'string' || !r.persona)) throw new Error(`${where}: "persona" must be a persona name`);
      if (r.widths !== undefined && (!Array.isArray(r.widths) || r.widths.length === 0 || !r.widths.every((w) => Number.isInteger(w) && w > 0))) {
        throw new Error(`${where}: "widths" must be a non-empty array of viewport widths`);
      }
      const key = captureKey(r);
      const same = captures.get(key);
      if (same) throw new Error(`${where} in ${source} captures the same page as "${same.slug}" in ${same.source} (same path and settings); give it a persona, actions or other settings, or drop it`);
      captures.set(key, { slug: r.slug, source });
      r.source = source;
      out.push(r);
    }
  }
  return out;
}

const readRoutesJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * routes.json plus every `routes.d/*.json` next to it (in name order), so a
 * stream adds its captures in its own file. Each route carries `source`
 * (`routes.json`, `routes.d/crew.json`).
 */
export function loadRoutes(routesFile, routesDir = path.join(path.dirname(routesFile), 'routes.d')) {
  const sources = [{ source: path.basename(routesFile), raw: readRoutesJson(routesFile) }];
  if (fs.existsSync(routesDir)) {
    for (const name of fs.readdirSync(routesDir).filter((n) => n.endsWith('.json')).sort()) {
      sources.push({ source: `${path.basename(routesDir)}/${name}`, raw: readRoutesJson(path.join(routesDir, name)) });
    }
  }
  return normaliseRouteSources(sources);
}

/** Pick routes by slug or path; an unknown value that is a path becomes an ad-hoc route. */
export function selectRoutes(routes, wanted) {
  if (!wanted) return routes;
  return wanted.map((w) => {
    const match = routes.find((r) => r.slug === w || r.path === w || r.path === `/${w.replace(/^\/+/, '')}`);
    if (match) return match;
    if (w.startsWith('/')) return { path: w, slug: slugFor(w) };
    throw new Error(`Unknown route "${w}". Use a slug from routes.json (see --list) or a path starting with "/".`);
  });
}

const HEIGHTS = { 1920: 1080, 1440: 900, 1366: 768, 1280: 800, 1024: 768, 834: 1194, 820: 1180, 768: 1024, 414: 896, 390: 844, 375: 812, 360: 800 };

/** Viewport for a width: common device heights, else 16:10 landscape / phone-like portrait. */
export function viewportFor(width) {
  const height = HEIGHTS[width] ?? (width >= 1024 ? Math.round(width * 0.625) : Math.round(width * 2.16));
  return { width, height };
}
