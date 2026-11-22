/**
 * Command-line options, routes.json normalisation and viewport sizes for the
 * visual harness. Pure; tested in scripts/visual/test/options.test.mjs.
 */

import path from 'node:path';

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
  --strict              exit 1 when any capture fails
  --list                print the selected routes and exit
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
 *     "waitFor": "main h1", "localStorage": { "key": "value" }, "note": "why it is here" }
 */
export function normaliseRoutes(raw) {
  const entries = Array.isArray(raw) ? raw : raw?.routes;
  if (!Array.isArray(entries)) throw new Error('routes.json must be an array (or { "routes": [...] })');
  const seen = new Set();
  return entries.map((entry) => {
    const r = typeof entry === 'string' ? { path: entry } : { ...entry };
    if (typeof r.path !== 'string' || !r.path.startsWith('/')) throw new Error(`Route path must start with "/": ${JSON.stringify(entry)}`);
    r.slug = r.slug ?? slugFor(r.path);
    if (seen.has(r.slug)) throw new Error(`Duplicate route slug "${r.slug}"`);
    seen.add(r.slug);
    return r;
  });
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
