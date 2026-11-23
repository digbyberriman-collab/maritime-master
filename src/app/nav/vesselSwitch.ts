/**
 * Where "open vessel B" lands (gap/10 W2, IA23; contract, BUILD-PLAN S1, S5).
 * Pure: the vessel switcher, the scope control and the command palette all
 * call it through `useVesselSwitch()`, so they always agree.
 *
 * Rule (spec §6.2):
 * - Inside the vessel scope, keep the sub-path, query and hash when every
 *   module-setting key on the way to the page is on for the target vessel and
 *   the page's tab is visible to the user; else go to that tab's root when
 *   the tab is on and visible; else the vessel home.
 * - From a Fleet page, open its vessel counterpart (Fleet › Training → Crew ›
 *   Training) under the same checks, else the vessel home.
 * - From anywhere else (a workspace, the personal area, a legacy page), the
 *   vessel home.
 *
 * `isModuleOn` comes from the target vessel's module settings (fail closed
 * while they load; all on when the table is missing, D-01). `isVisible`
 * comes from the target's filtered nav tree; absent means visible.
 */
import { parseVesselPath, vesselPath } from '@/modules/vessels/lib/vesselCode';
import { vesselModuleForPath } from '@/config/sitemap';
import type { NavChild } from '@/config/navigation-types';
import { vesselCounterpart } from './counterparts';

export interface VesselSwitchInput {
  /** The current location: pathname plus search and hash. */
  currentPath: string;
  /** The target vessel's code (any case). */
  targetCode: string;
  /**
   * Whether a `vessel_module_settings` key is on for the target vessel.
   * Must return false while the target's settings are loading or failed
   * (fail closed); true for every key when the table is missing (D-01).
   */
  isModuleOn: (moduleSetting: string) => boolean;
  /**
   * Whether the user can see the target page in the target vessel's nav
   * (`vesselRest` is the part after `/v/<code>/`, `''` = home): status,
   * capability and add-on lock, as the filtered vessel tree decides. Used for
   * the counterpart of a Fleet page and for the kept sub-path's tab. Absent
   * = visible (the page's own guard still applies). Added by the critic so
   * the counterpart rule ("only when its target leaf is visible", spec §6.1)
   * needs no signature change later.
   */
  isVisible?: (vesselRest: string) => boolean;
}

const strip = (path: string): string => path.replace(/^\/+|\/+$/g, '');

const isUnder = (rest: string, prefix: string): boolean => prefix !== '' && (rest === prefix || rest.startsWith(`${prefix}/`));

/**
 * How much of `rest` an `alsoCovers` pattern matches (`*` = exactly one
 * segment): the length of the matched prefix when `rest` is the pattern or
 * continues it with `/`, else -1.
 */
function coveredLength(rest: string, pattern: string): number {
  const want = strip(pattern).split('/');
  const got = rest.split('/');
  if (!want[0] || got.length < want.length) return -1;
  const matches = want.every((segment, i) => (segment === '*' ? got[i] !== '' : segment === got[i]));
  return matches ? got.slice(0, want.length).join('/').length : -1;
}

/** How much of `rest` a node governs: its own path, or the longest of its `alsoCovers` patterns; -1 for none. */
function matchedLength(rest: string, node: NavChild): number {
  const rel = strip(node.path);
  let length = isUnder(rest, rel) ? rel.length : -1;
  for (const pattern of node.alsoCovers ?? []) length = Math.max(length, coveredLength(rest, pattern));
  return length;
}

/**
 * Every `vessel_module_settings` key that must be on for a vessel page: its
 * tab's key, then the key of each nav node on the way down to the most
 * specific node the path sits under (`technical/jobs/12` → `technical`,
 * `technical.jobs`). A node also governs the pages its `alsoCovers` patterns
 * name (`crew/people/p1/hours-of-rest` → `crew`, `crew_hor`), so the route
 * gate and the vessel switch close them with it. Pages outside any module
 * need none.
 */
export function vesselSettingKeysForRest(vesselRest: string): string[] {
  const rest = strip(vesselRest.split(/[?#]/)[0]);
  const tab = vesselModuleForPath(rest);
  if (!tab) return [];
  // The deepest node the page sits under (by the length of the part of the
  // path it matches), with the nodes above it. Cross-links (absolute paths
  // into another tree) never match a vessel page.
  const found: { length: number; chain: readonly NavChild[] } = { length: -1, chain: [] };
  const visit = (nodes: readonly NavChild[], above: readonly NavChild[]) => {
    for (const node of nodes) {
      if (node.path.startsWith('/')) continue;
      const chain = [...above, node];
      const length = matchedLength(rest, node);
      if (length >= 0 && (length > found.length || (length === found.length && chain.length > found.chain.length))) {
        found.length = length;
        found.chain = chain;
      }
      if (node.children?.length) visit(node.children, chain);
    }
  };
  if (rest) visit(tab.children, []);
  const keys = [tab.moduleSetting, ...found.chain.map((n) => n.moduleSetting)].filter((k): k is string => !!k);
  return Array.from(new Set(keys));
}

/** The tab root of a vessel page (`crew/list/7` → `crew`), `''` for Home, null outside any module. */
export function vesselTabRootForRest(vesselRest: string): string | null {
  const tab = vesselModuleForPath(strip(vesselRest.split(/[?#]/)[0]));
  return tab ? tab.root : null;
}

function splitLocation(currentPath: string): { pathname: string; query: string; hash: string } {
  const hashAt = currentPath.indexOf('#');
  const beforeHash = hashAt === -1 ? currentPath : currentPath.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : currentPath.slice(hashAt + 1);
  const queryAt = beforeHash.indexOf('?');
  return {
    pathname: queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt),
    query: queryAt === -1 ? '' : beforeHash.slice(queryAt + 1),
    hash,
  };
}

export function vesselSwitchTarget({ currentPath, targetCode, isModuleOn, isVisible = () => true }: VesselSwitchInput): string {
  const { pathname, query, hash } = splitLocation(currentPath);
  const home = vesselPath(targetCode);
  const allOn = (keys: readonly string[]) => keys.every((key) => isModuleOn(key));

  const parsed = parseVesselPath(pathname);
  if (parsed) {
    const rest = parsed.rest;
    const tail = `${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`;
    if (!rest) return `${home}${tail}`;
    const tabRoot = vesselTabRootForRest(rest);
    // A page outside every module (no tab) keeps its place; its own guard decides.
    if (tabRoot === null) return `${vesselPath(targetCode, rest)}${tail}`;
    if (allOn(vesselSettingKeysForRest(rest)) && isVisible(tabRoot)) return `${vesselPath(targetCode, rest)}${tail}`;
    if (tabRoot && allOn(vesselSettingKeysForRest(tabRoot)) && isVisible(tabRoot)) return vesselPath(targetCode, tabRoot);
    return home;
  }

  if (pathname === '/fleet' || pathname.startsWith('/fleet/')) {
    const rest = vesselCounterpart(pathname);
    if (rest && allOn(vesselSettingKeysForRest(rest)) && isVisible(rest)) return vesselPath(targetCode, rest);
    return home;
  }

  return home;
}
