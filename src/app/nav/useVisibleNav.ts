/**
 * "Which pages can this user open from the nav?" as a flat list (contract,
 * BUILD-PLAN S5: the command palette's Pages group consumes it).
 *
 * Built on the same pipeline as the sidebar and the tab row (spec §4.3):
 * - Fleet and workspace trees: `NAVIGATION_ITEMS` through
 *   `useNavNodeFilter().decide` + `filterNavTree` (empty groups dropped). A
 *   workspace the Apps menu would not offer (./workspaceAccess.ts) lists no
 *   page at all, whatever its own nodes carry.
 * - Vessel: the current vessel's resolved nav (`useVesselNav`): real code in
 *   every path (`/v/dra/crew/list`), the vessel's label overrides applied,
 *   modules switched off dropped. With no vessel known, no vessel leaves.
 * - Personal: the user's own sections and the company settings their role
 *   may open (`usePersonalNav`), never the unfiltered tree.
 * - Locked add-ons are left out (they open no page).
 * De-duplicated by path, own leaves before cross-links.
 *
 * Fails closed: `ready` is false and the list is empty until access and the
 * vessel's settings have loaded.
 */
import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { NAVIGATION_ITEMS } from '@/config/sitemap';
import { WORKSPACE_TREES } from '@/config/navSlots';
import type { NavChild, NavItem, NavScope } from '@/config/navigation-types';
import { applySidebarOrder, useSidebarOrder } from '@/shared/hooks/useSidebarOrder';
import { navKindOf } from './visibility';
import { useNavNodeFilter } from './useNavNodeFilter';
import { filterNavTree, type FilteredNavNode } from './navTree';
import { useVesselNav } from './useVesselNav';
import { PERSONAL_TREE_ID, usePersonalNav } from './usePersonalNav';
import type { VesselTab } from './vesselNavModel';
import { canOpenWorkspaceRoot } from './workspaceAccess';

export interface VisibleNavLeaf {
  /** The nav node id (stable across vessels). */
  id: string;
  /** Label as the user sees it (the vessel's label overrides applied). */
  label: string;
  /** Absolute and navigable as-is; may carry a query (`?tab=`). */
  path: string;
  icon: LucideIcon;
  scope: NavScope | undefined;
  /** Labels of the module and the groups / sections above the leaf: `['Vessel', 'Crew']`. */
  trail: readonly string[];
  /** The leaf points into another module's tree (a workspace page linked from Fleet). */
  crossLink: boolean;
}

export interface VisibleNav {
  /** Access has loaded; before that `leaves` is empty. */
  ready: boolean;
  leaves: readonly VisibleNavLeaf[];
}

/** Every visible leaf of a tree, depth first; pure (exported for tests). */
export function collectVisibleLeaves(
  modules: readonly NavItem[],
  canShow: (item: NavChild) => boolean,
): VisibleNavLeaf[] {
  const own: VisibleNavLeaf[] = [];
  const cross: VisibleNavLeaf[] = [];
  const visit = (items: readonly NavChild[] | undefined, trail: readonly string[], scope: NavScope | undefined) => {
    for (const item of items ?? []) {
      if (!canShow(item)) continue;
      const kind = navKindOf(item);
      if (kind === 'leaf') {
        const leaf: VisibleNavLeaf = {
          id: item.id,
          label: item.label,
          path: item.path,
          icon: item.icon,
          scope: item.scope ?? scope,
          trail,
          crossLink: Boolean(item.crossLink),
        };
        (leaf.crossLink ? cross : own).push(leaf);
        continue;
      }
      visit(item.children, [...trail, item.label], item.scope ?? scope);
    }
  };
  for (const module of modules) visit(module.children, [module.label], module.scope);

  const seen = new Set<string>();
  const out: VisibleNavLeaf[] = [];
  for (const leaf of [...own, ...cross]) {
    if (seen.has(leaf.path)) continue;
    seen.add(leaf.path);
    out.push(leaf);
  }
  return out;
}

/** A vessel tab as a node of the flat list: a group over its sidebar, or a leaf (Home, Calendar). */
function tabAsNode(tab: VesselTab): FilteredNavNode {
  const base: FilteredNavNode = { id: `vessel-${tab.id}`, label: tab.label, path: tab.path, icon: tab.icon, status: tab.status, scope: 'vessel' };
  if (tab.children.length) return { ...base, kind: 'group', children: tab.children };
  return { ...base, kind: 'leaf' };
}

const notLocked = (item: NavChild): boolean => !(item as FilteredNavNode).locked;

const WORKSPACE_TREE_IDS: ReadonlySet<string> = new Set(WORKSPACE_TREES.map((w) => w.id));

export function useVisibleNavLeaves(): VisibleNav {
  // `ready` is the workspace gate's readiness too (one filter decides both).
  const { ready, decide, canShow } = useNavNodeFilter();
  const { map } = useSidebarOrder();
  const vesselNav = useVesselNav();
  const personal = usePersonalNav();
  const vesselReady = vesselNav.status !== 'loading';
  return useMemo<VisibleNav>(() => {
    if (!ready || !vesselReady || !personal.ready) return { ready: false, leaves: [] };
    const order = <T extends NavChild>(items: T[], parentId: string) => applySidebarOrder(items, map[parentId]);
    const modules: NavItem[] = [];
    for (const module of NAVIGATION_ITEMS) {
      if (module.id === 'vessel') {
        // Locked tabs open no page; tabs with nothing visible are already gone.
        const tabs = vesselNav.tabs.filter((tab) => !tab.locked).map(tabAsNode);
        if (tabs.length) modules.push({ ...module, children: tabs });
        continue;
      }
      if (module.id === PERSONAL_TREE_ID) {
        modules.push({ ...module, children: personal.nodes });
        continue;
      }
      // A workspace the user may not open lists none of its pages (the Apps gate).
      if (module.scope === 'workspace' && WORKSPACE_TREE_IDS.has(module.id) && !canOpenWorkspaceRoot(module.path, canShow)) continue;
      modules.push({ ...module, children: filterNavTree(module.children ?? [], decide, order, module.id) });
    }
    return { ready: true, leaves: collectVisibleLeaves(modules, notLocked) };
  }, [ready, vesselReady, decide, canShow, map, vesselNav.tabs, personal.ready, personal.nodes]);
}
