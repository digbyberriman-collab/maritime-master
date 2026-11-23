/**
 * Where a sidebar link goes, and whether it carries the workspace's
 * `?module=` (deferred item 2 with D-45; spec §4.5, corrected by the critic).
 *
 * A workspace or legacy sidebar marks the links it opens with `?module=<id>`
 * so a legacy URL two trees share (`/crew/leave`, linked from HRIS) keeps the
 * tree it was opened from (D-45: "they keep their old URLs and the workspace
 * nav scope"). The parameter is added only when it helps:
 *
 * - never on a link into the Fleet, vessel or personal scope (`/fleet…`,
 *   `/v/…`, `/me…`, `/inbox`): those scopes pick their own sidebar from the
 *   path and ignore `?module=` (HRIS › Training & Development → `/me/training`);
 * - never on a link under another workspace's root (a cross-link into
 *   Health opens Health's own tree);
 * - otherwise (a legacy unscoped URL, or the tree's own prefix) it is added.
 *
 * Fleet and vessel sidebars never add it.
 */
import { WORKSPACE_TREES } from '@/config/navSlots';
import { VESSEL_SCOPE_PREFIX } from '@/modules/vessels/lib/vesselCode';

const pathnameOf = (path: string): string => path.split(/[?#]/)[0] || '/';

const under = (path: string, prefix: string): boolean => path === prefix || path.startsWith(`${prefix}/`);

/** The scope roots that pick their own sidebar (Fleet, vessel, personal). */
export const SCOPED_PREFIXES: readonly string[] = Object.freeze(['/fleet', VESSEL_SCOPE_PREFIX, '/me', '/inbox']);

/** True for a path in the Fleet, vessel or personal scope. */
export function isScopedPath(path: string): boolean {
  const pathname = pathnameOf(path);
  return SCOPED_PREFIXES.some((prefix) => under(pathname, prefix));
}

/**
 * Workspace roots: the trees' prefixes, Legal's among them (R4: it stays at
 * `/departments/legal`). Listed once each, Legal also when it had no tree.
 */
export const WORKSPACE_ROOTS: readonly string[] = Object.freeze(Array.from(new Set([...WORKSPACE_TREES.map((w) => w.path), '/departments/legal'])));

export interface SidebarTreeContext {
  /** The workspace or legacy tree's id (`hris`); null for Fleet, vessel and personal sidebars. */
  moduleParam: string | null;
  /** The tree's own URL prefix (`/hris`). */
  rootPath: string | null;
}

/** The link a sidebar node opens, with `?module=` only where the rule above adds it. */
export function sidebarHref(path: string, { moduleParam, rootPath }: SidebarTreeContext): string {
  if (!moduleParam) return path;
  const pathname = pathnameOf(path);
  if (isScopedPath(pathname)) return path;
  const ownRoot = rootPath ? pathnameOf(rootPath) : null;
  const inOwnTree = ownRoot !== null && ownRoot !== '/' && under(pathname, ownRoot);
  if (!inOwnTree && WORKSPACE_ROOTS.some((root) => root !== ownRoot && under(pathname, root))) return path;
  const hashAt = path.indexOf('#');
  const beforeHash = hashAt === -1 ? path : path.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : path.slice(hashAt);
  const queryAt = beforeHash.indexOf('?');
  const params = new URLSearchParams(queryAt === -1 ? '' : beforeHash.slice(queryAt + 1));
  params.set('module', moduleParam);
  return `${pathname}?${params.toString()}${hash}`;
}
