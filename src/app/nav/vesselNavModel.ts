/**
 * One vessel's tab row and per-tab sidebars, filtered for one viewer (gap/10
 * "Vessel view", IA5, IA6, IA9; spec §5.3). Pure: `useVesselNav` feeds it
 * the vessel's module settings, the viewer's `decide` and saved order; the
 * vessel switch builds the same model for the vessel it is about to open.
 *
 * Tab rules:
 * - Home always shows (no module setting, live).
 * - A module tab passes the visibility rule on its own fields (status,
 *   module setting, capability, entitlement); a locked tab (add-on) shows
 *   with a lock and opens the add-on explanation.
 * - A tab with a sidebar whose filtered tree is empty is hidden (nothing in
 *   it the viewer may open).
 * - `href` is the tab's first visible leaf, else its root, so a tab never
 *   opens a page the viewer cannot see.
 * - Labels come last: the vessel's override for the tab's or a leaf's key.
 * - The tab shows its own badge, else the first badge under it.
 */
import { buildVesselNav, vesselModuleForPath } from '@/config/sitemap';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import type { NavChild, VesselModuleNav } from '@/config/navigation-types';
import type { ModuleSettingsResolver } from '@/modules/vessels/lib/moduleSettings';
import { applyLabelOverrides, descendantBadgeKey, filterNavTree, firstVisibleLeafPath, type FilteredNavNode } from './navTree';
import { applyNavProviders, type NavProviderResult } from './navProviders';
import type { NavNodeDecision } from './visibility';

export interface VesselTab extends Omit<VesselModuleNav, 'children'> {
  /** An add-on the vessel lacks: shown with a lock, never navigates. */
  locked?: boolean;
  /** Where the tab opens. */
  href: string;
  /** The tab's sidebar, filtered and labelled. Empty: no sidebar. */
  children: FilteredNavNode[];
  /** The sidebar is still loading from a data-driven provider (IA24). */
  childrenPending?: boolean;
}

export interface BuildVesselTabsInput {
  code: string;
  resolver: Pick<ModuleSettingsResolver, 'labelFor'>;
  /** `useNavNodeFilter({ isModuleOn: resolver.isModuleOn }).decide`. */
  decide: (node: NavChild) => NavNodeDecision;
  /** The saved sidebar order (`applySidebarOrder` over the user's map). */
  order?: <T extends NavChild>(items: T[], parentId: string) => T[];
  /** Data-driven children (./navProviders.ts). */
  providerResults?: ReadonlyMap<string, NavProviderResult>;
}

/** The node the visibility rule judges for a tab. */
export function tabNode(module: Pick<VesselModuleNav, 'id' | 'label' | 'path' | 'icon' | 'status' | 'moduleSetting' | 'capability' | 'entitlement'>): NavChild {
  return {
    id: `vessel-${module.id}`,
    label: module.label,
    path: module.path,
    icon: module.icon,
    kind: 'leaf',
    status: module.status,
    scope: 'vessel',
    ...(module.moduleSetting ? { moduleSetting: module.moduleSetting } : {}),
    ...(module.capability ? { capability: module.capability } : {}),
    ...(module.entitlement ? { entitlement: module.entitlement } : {}),
  };
}

const NO_PROVIDERS: ReadonlyMap<string, NavProviderResult> = new Map();

export function buildVesselTabs({ code, resolver, decide, order, providerResults = NO_PROVIDERS }: BuildVesselTabsInput): VesselTab[] {
  const modules = applyNavProviders(buildVesselNav(code), providerResults);
  const tabs: VesselTab[] = [];
  for (const module of modules) {
    const isHome = module.root === '';
    const decision = isHome ? 'visible' : decide(tabNode(module));
    if (decision === 'hidden') continue;
    const label = (module.moduleSetting && resolver.labelFor(module.moduleSetting)) || module.label;
    const badgeKey = module.badgeKey ?? descendantBadgeKey(module);
    const base = { ...module, label, ...(badgeKey ? { badgeKey } : {}) };
    if (decision === 'locked') {
      tabs.push({ ...base, locked: true, href: module.path, children: [], childrenPending: false });
      continue;
    }
    const hadSidebar = module.children.length > 0 || Boolean(module.childrenPending);
    const children = applyLabelOverrides(filterNavTree(module.children, decide, order, `vessel-${module.id}`), resolver.labelFor);
    if (hadSidebar && !children.length && !module.childrenPending) continue;
    tabs.push({
      ...base,
      href: firstVisibleLeafPath(children) ?? module.path,
      children,
      childrenPending: Boolean(module.childrenPending),
    });
  }
  return tabs;
}

const strip = (path: string): string => path.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');

function underPath(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Whether a vessel page (`rest` after `/v/<code>/`) is visible in a filtered
 * tab model: its tab is shown and not locked, and the deepest nav node the
 * page sits under is in the filtered tree, unlocked. The vessel home is
 * always visible; a tab root is visible with its tab; a page the static tree
 * does not know is left to its own guard (visible). Used by the vessel
 * switch ("keep the sub-path only when visible") and the counterparts.
 */
export function vesselRestVisibilityFromTabs(tabs: readonly VesselTab[], code: string): (vesselRest: string) => boolean {
  const statics = buildVesselNav(code);
  return (vesselRest: string) => {
    const rest = strip(vesselRest);
    if (!rest) return true;
    const module = vesselModuleForPath(rest);
    if (!module || !module.root) return true;
    const tab = tabs.find((t) => t.id === module.id);
    if (!tab || tab.locked) return false;
    const tabRoot = strip(tab.path);
    const target = strip(vesselPath(code, rest));
    if (target === tabRoot) return true;
    // The deepest static node the page sits under (sections share the tab's
    // path and never count)…
    let deepest: string | null = null;
    const visitStatic = (nodes: readonly NavChild[]) => {
      for (const node of nodes) {
        if (node.crossLink) continue;
        const path = strip(node.path);
        if (path !== tabRoot && underPath(target, path) && (deepest === null || path.length > deepest.length)) deepest = path;
        if (node.children?.length) visitStatic(node.children);
      }
    };
    visitStatic(statics.find((m) => m.id === module.id)?.children ?? []);
    if (deepest === null) return true;
    // …must be in the viewer's filtered tree, unlocked.
    const wanted = deepest;
    const inFiltered = (nodes: readonly FilteredNavNode[]): boolean =>
      nodes.some((node) => (!node.locked && !node.crossLink && strip(node.path) === wanted) || (node.children?.length ? inFiltered(node.children) : false));
    return inFiltered(tab.children);
  };
}
