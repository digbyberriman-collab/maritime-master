/**
 * A text form of the whole site map (BUILD-PLAN B8 snapshot): every node of
 * every tree with every field it carries, plus the placeholder and redirect
 * lists generated from them. One line per node, so a change shows up as a
 * readable diff against the committed baseline.
 *
 * Per-module baselines (Phase 3 platform-prep PP2). The route and site-map
 * snapshots are split by owner, so a stream slice that adds a route or a leaf
 * rewrites only its own module's file and never a shared one:
 *
 * - a route line belongs to the module that registers that full path
 *   (`MODULE_REGISTRY.routes`);
 * - a nav line belongs to the module whose fragment contributed the node,
 *   matched by node id (a vessel fragment also owns the `vessel-<id>` lines
 *   that `vesselModuleNav` derives for the tab tree and today's shell);
 * - an entry of a generated list (placeholders, root and section redirects)
 *   belongs to the owner of the leaf it comes from, and so does the route
 *   the router mounts for that entry (its Coming Soon page or redirect);
 * - every other line stays in the platform baselines.
 *
 * Only the modules in `STREAM_BASELINE_MODULES` get a file
 * (`src/test/<module>/registry.baseline.json`); a missing file reads as
 * empty. src/test/config/registrySnapshot.test.ts compares and writes them.
 */
import * as sitemap from '@/config/sitemap';
import type { NavChild, NavItem, VesselModule } from '@/config/navigation-types';

const iconName = (icon: unknown): string => {
  const t = icon as { displayName?: string; name?: string } | undefined;
  return t?.displayName || t?.name || '?';
};

function nodeLine(node: NavChild | NavItem | VesselModule, depth: number): string {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node).sort(([a], [b]) => a.localeCompare(b))) {
    if (key === 'children' || key === 'icon' || value === undefined) continue;
    fields[key] = value;
  }
  return `${'  '.repeat(depth)}${iconName(node.icon)} ${JSON.stringify(fields)}`;
}

function treeLines(items: readonly (NavChild | NavItem | VesselModule)[], depth = 0, acc: string[] = []): string[] {
  for (const item of items) {
    acc.push(nodeLine(item, depth));
    if (item.children?.length) treeLines(item.children, depth + 1, acc);
  }
  return acc;
}

export function sitemapSnapshot(): Record<string, string[]> {
  return {
    NAVIGATION_ITEMS: treeLines(sitemap.NAVIGATION_ITEMS),
    VESSEL_MODULES: treeLines(sitemap.VESSEL_MODULES),
    buildVesselNav: treeLines(sitemap.buildVesselNav('DRA')),
    PLACEHOLDER_LEAVES: sitemap.PLACEHOLDER_LEAVES.map((l) => `${l.path} ${l.label}`),
    FLEET_PLACEHOLDER_LEAVES: sitemap.FLEET_PLACEHOLDER_LEAVES.map((l) => `${l.path} ${l.label}`),
    VESSEL_PLACEHOLDER_LEAVES: sitemap.VESSEL_PLACEHOLDER_LEAVES.map((l) => `${l.path} ${l.label}`),
    PERSONAL_PLACEHOLDER_LEAVES: sitemap.PERSONAL_PLACEHOLDER_LEAVES.map((l) => `${l.path} ${l.label}`),
    VESSEL_ROOT_REDIRECTS: sitemap.VESSEL_ROOT_REDIRECTS.map((r) => `${r.from} -> ${r.to}`),
    SECTION_REDIRECTS: sitemap.SECTION_REDIRECTS.map((r) => `${r.from} -> ${r.to}`),
  };
}

// ─── Per-module partition ─────────────────────────────────────────────────

/** The modules Phase 3 wave 1 streams own, each with its own baseline file (platform-prep PP2). */
export const STREAM_BASELINE_MODULES = ['crew', 'dashboard', 'development', 'documents', 'fleet', 'forms', 'reports'] as const;

/** Where a module's baseline lives, relative to the repository root. */
export const moduleBaselinePath = (moduleId: string): string => `src/test/${moduleId}/registry.baseline.json`;

/** One module's share of the snapshot. A list with no lines is left out of `nav`. */
export interface ModuleBaseline {
  routes: string[];
  nav: Record<string, string[]>;
}

/** The parts of the module registry the partition reads (`MODULE_REGISTRY` or a fixture). */
export interface OwnershipSource {
  routes: readonly { moduleId: string; fullPath: string }[];
  nav: readonly { moduleId: string; slot: string; node: NavChild }[];
}

export interface SnapshotPartition {
  platform: { routes: string[]; nav: Record<string, string[]> };
  /** Every module asked for, in the order asked, possibly empty. */
  modules: Record<string, ModuleBaseline>;
  /** Ambiguous ownership (two modules claim one id or path, one id matches two lines). Must be empty. */
  problems: string[];
}

const VESSEL_ROOT = '/v/:vesselCode';

/** The tree lists: one line per node, owned by node id. */
const TREE_LISTS = new Set(['NAVIGATION_ITEMS', 'VESSEL_MODULES', 'buildVesselNav']);

/**
 * The generated lists: what each entry is, and the root its paths are
 * relative to (`null`: absolute). A placeholder entry is `<path> <label>`; a
 * redirect entry is `<from> -> <to>`, where a vessel root redirect's `to` is
 * relative to its `from`.
 */
const GENERATED_LISTS: Readonly<Record<string, { kind: 'placeholder' | 'redirect'; root: string | null }>> = {
  PLACEHOLDER_LEAVES: { kind: 'placeholder', root: null },
  FLEET_PLACEHOLDER_LEAVES: { kind: 'placeholder', root: '/fleet' },
  VESSEL_PLACEHOLDER_LEAVES: { kind: 'placeholder', root: VESSEL_ROOT },
  PERSONAL_PLACEHOLDER_LEAVES: { kind: 'placeholder', root: '/me' },
  VESSEL_ROOT_REDIRECTS: { kind: 'redirect', root: VESSEL_ROOT },
  SECTION_REDIRECTS: { kind: 'redirect', root: null },
};

const under = (root: string | null, rel: string): string => {
  if (root === null || rel.startsWith('/')) return rel;
  return rel ? `${root}/${rel}` : root;
};
const pathname = (path: string): string => path.split(/[?#]/)[0];

/** The route pattern of a `describeRouteTree` line (`/fleet (index) [<X>] :: …` → `/fleet`). */
export const routeLinePath = (line: string): string => line.slice(0, line.search(/ |$/));

/** What a `describeRouteTree` line renders (the text after ` :: `). */
const routeLineElement = (line: string): string => {
  const at = line.indexOf(' :: ');
  return at < 0 ? '' : line.slice(at + 4);
};

/** The node id of a tree line (`  Users {"id":"vessel-crew-list",…}` → `vessel-crew-list`). */
export function treeLineId(line: string): string | null {
  const body = line.trimStart();
  const at = body.indexOf(' {');
  if (at < 0) return null;
  try {
    const fields = JSON.parse(body.slice(at + 1)) as { id?: unknown };
    return typeof fields.id === 'string' ? fields.id : null;
  } catch {
    return null;
  }
}

/** What one generated entry points at: the leaf it comes from and the route the router mounts for it. */
function generatedEntry(list: string, entry: string): { leaf: string; route: string; kind: 'placeholder' | 'redirect' } | null {
  const spec = GENERATED_LISTS[list];
  if (!spec) return null;
  if (spec.kind === 'placeholder') {
    const space = entry.indexOf(' ');
    const rel = space < 0 ? entry : entry.slice(0, space);
    const abs = under(spec.root, rel);
    return { leaf: pathname(abs), route: pathname(abs), kind: 'placeholder' };
  }
  const arrow = entry.indexOf(' -> ');
  if (arrow < 0) return null;
  const from = entry.slice(0, arrow);
  const to = entry.slice(arrow + 4);
  const route = under(spec.root, from);
  const leaf = spec.root === null || to.startsWith('/') ? to : `${route}/${to}`;
  return { leaf: pathname(leaf), route, kind: 'redirect' };
}

const walk = (node: NavChild, visit: (n: NavChild) => void) => {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
};

interface Ownership {
  nodeOwner: Map<string, string>;
  leafOwner: Map<string, string>;
  routeOwner: Map<string, string>;
  problems: string[];
}

function ownershipOf(source: OwnershipSource, modules: readonly string[]): Ownership {
  const wanted = new Set(modules);
  const problems: string[] = [];
  const claim = (map: Map<string, string>, key: string, owner: string, what: string) => {
    const prior = map.get(key);
    if (prior && prior !== owner) problems.push(`${what} ${key} is claimed by both ${prior} and ${owner}`);
    else map.set(key, owner);
  };

  const routeOwner = new Map<string, string>();
  for (const r of source.routes) if (wanted.has(r.moduleId)) claim(routeOwner, r.fullPath, r.moduleId, 'route');

  const nodeOwner = new Map<string, string>();
  const leafOwner = new Map<string, string>();
  for (const f of source.nav) {
    if (!wanted.has(f.moduleId)) continue;
    const vessel = f.slot.startsWith('vessel.');
    walk(f.node, (n) => {
      claim(nodeOwner, n.id, f.moduleId, 'nav node');
      if (vessel) claim(nodeOwner, `vessel-${n.id}`, f.moduleId, 'nav node');
      if (!n.children?.length && typeof n.path === 'string') {
        claim(leafOwner, pathname(vessel ? under(VESSEL_ROOT, n.path) : n.path), f.moduleId, 'nav leaf');
      }
    });
  }
  return { nodeOwner, leafOwner, routeOwner, problems };
}

const emptyBaseline = (): ModuleBaseline => ({ routes: [], nav: {} });

/**
 * Split a route snapshot and a site-map snapshot by owner. Lines keep their
 * order inside each part, so the platform part is exactly the full snapshot
 * minus the lines the listed modules own.
 */
export function partitionSnapshot(
  snapshot: { routes: readonly string[]; nav: Readonly<Record<string, readonly string[]>> },
  source: OwnershipSource,
  modules: readonly string[] = STREAM_BASELINE_MODULES,
): SnapshotPartition {
  const own = ownershipOf(source, modules);
  const problems = [...own.problems];
  const out: SnapshotPartition = {
    platform: { routes: [], nav: {} },
    modules: Object.fromEntries(modules.map((m) => [m, emptyBaseline()])),
    problems,
  };

  // Generated entries first: their routes are owned through them.
  const generatedRoutes = new Map<string, { owner: string; kind: 'placeholder' | 'redirect' }>();
  const navOwner = (list: string, line: string): string | undefined => {
    if (TREE_LISTS.has(list)) {
      const id = treeLineId(line);
      return id === null ? undefined : own.nodeOwner.get(id);
    }
    const entry = generatedEntry(list, line);
    if (!entry) return undefined;
    const owner = own.leafOwner.get(entry.leaf);
    if (owner) generatedRoutes.set(entry.route, { owner, kind: entry.kind });
    return owner;
  };

  for (const [list, lines] of Object.entries(snapshot.nav)) {
    const platform: string[] = [];
    const matches = new Map<string, number>();
    for (const line of lines) {
      const owner = navOwner(list, line);
      if (!owner) {
        platform.push(line);
        continue;
      }
      if (TREE_LISTS.has(list)) {
        const id = treeLineId(line) as string;
        matches.set(id, (matches.get(id) ?? 0) + 1);
      }
      (out.modules[owner].nav[list] ??= []).push(line);
    }
    for (const [id, n] of matches) if (n > 1) problems.push(`nav node ${id} matches ${n} lines in ${list}; node ids must be unique`);
    out.platform.nav[list] = platform;
  }

  for (const line of snapshot.routes) {
    const path = routeLinePath(line);
    let owner = own.routeOwner.get(path);
    if (!owner) {
      const generated = generatedRoutes.get(path);
      const element = routeLineElement(line);
      const isGenerated =
        generated &&
        (generated.kind === 'placeholder' ? element.includes('<PlaceholderWrapper') : element.startsWith('redirect('));
      if (isGenerated) owner = generated.owner;
    }
    if (owner) out.modules[owner].routes.push(line);
    else out.platform.routes.push(line);
  }
  return out;
}

/** A module baseline file's content, with list keys in snapshot order and empty lists left out. */
export function moduleBaselineJson(baseline: ModuleBaseline, listOrder: readonly string[]): string {
  const nav: Record<string, string[]> = {};
  for (const list of listOrder) if (baseline.nav[list]?.length) nav[list] = baseline.nav[list];
  return `${JSON.stringify({ routes: baseline.routes, nav }, null, 2)}\n`;
}

/** Read a module baseline file's parsed content; anything malformed throws with the reason. */
export function parseModuleBaseline(raw: unknown, file: string, knownLists: readonly string[]): ModuleBaseline {
  const fail = (why: string): never => {
    throw new Error(`${file}: ${why}`);
  };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('expected { "routes": [], "nav": {} }');
  const { routes, nav, ...rest } = raw as { routes?: unknown; nav?: unknown };
  if (Object.keys(rest).length) fail(`unknown keys ${Object.keys(rest).join(', ')}`);
  const strings = (v: unknown, what: string): string[] => {
    if (!Array.isArray(v) || v.some((s) => typeof s !== 'string')) fail(`${what} must be a list of strings`);
    return v as string[];
  };
  const out: ModuleBaseline = { routes: routes === undefined ? [] : strings(routes, 'routes'), nav: {} };
  if (nav !== undefined) {
    if (!nav || typeof nav !== 'object' || Array.isArray(nav)) fail('nav must be an object of lists');
    for (const [list, lines] of Object.entries(nav as Record<string, unknown>)) {
      if (!knownLists.includes(list)) fail(`unknown nav list ${list}`);
      out.nav[list] = strings(lines, `nav.${list}`);
    }
  }
  return out;
}

/**
 * `UPDATE_REGISTRY_BASELINE`: unset → write nothing; `1` (or `all`) → the
 * platform baselines and every module file; `crew,fleet` → only those module
 * files, never the platform ones. An unknown module name throws, so a typo
 * never silently writes nothing.
 */
export function parseBaselineUpdate(
  value: string | undefined,
  modules: readonly string[] = STREAM_BASELINE_MODULES,
): { platform: boolean; modules: string[] } {
  const spec = (value ?? '').trim();
  if (!spec || spec === '0') return { platform: false, modules: [] };
  if (spec === '1' || spec === 'all') return { platform: true, modules: [...modules] };
  const names = spec.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = names.filter((n) => !modules.includes(n));
  if (unknown.length) {
    throw new Error(`UPDATE_REGISTRY_BASELINE names ${unknown.join(', ')}; use 1 or a comma list of ${modules.join(', ')}`);
  }
  return { platform: false, modules: modules.filter((m) => names.includes(m)) };
}
