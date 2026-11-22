/**
 * Filtering a nav tree for one viewer (gap/10 "Nav visibility rule" steps 7
 * and 8; spec §4.2). Pure: every surface that draws a tree (fleet,
 * workspace, legacy and vessel sidebars, the vessel tab row, the palette's
 * page list) runs the same three steps:
 *
 *   filterNavTree(nodes, decide, order)   hidden nodes dropped, locked marked,
 *                                         empty groups and sections dropped,
 *                                         badges hoisted, saved order applied
 *   applyLabelOverrides(nodes, labelFor)  the vessel's labels, last
 *   firstVisibleLeafPath(nodes)           where a tab opens
 */
import type { NavChild } from '@/config/navigation-types';
import { navKindOf, type NavNodeDecision } from './visibility';

/**
 * A node of a tree about to be filtered. `childrenPending`: a data-driven
 * section whose children are still loading (./navProviders.ts, IA24); it is
 * kept with a skeleton row instead of being dropped as empty.
 */
export interface NavTreeNode extends NavChild {
  childrenPending?: boolean;
  children?: NavTreeNode[];
}

/** A node that passed the filter. `locked`: an add-on without its entitlement (shown with a lock). */
export interface FilteredNavNode extends NavTreeNode {
  locked?: boolean;
  children?: FilteredNavNode[];
}

/** The first badge key anywhere under a node (the node's own key not included). */
export function descendantBadgeKey(item: Pick<NavChild, 'children'>): string | undefined {
  for (const child of item.children ?? []) {
    const key = child.badgeKey ?? descendantBadgeKey(child);
    if (key) return key;
  }
  return undefined;
}

/**
 * The nodes the viewer may see, in the saved order. A `locked` node keeps no
 * children (it opens the add-on explanation, never its pages). A group or
 * section left with no child is dropped. A badge on a hidden leaf moves up
 * to the nearest group, so the count stays reachable; a section heading
 * shows no badge, so it passes its badge on up instead of keeping it.
 */
export function filterNavTree(
  nodes: readonly NavTreeNode[],
  decide: (node: NavChild) => NavNodeDecision,
  order?: <T extends NavChild>(items: T[], parentId: string) => T[],
  parentId = '__root',
): FilteredNavNode[] {
  const ordered = order ? order([...nodes], parentId) : [...nodes];
  const out: FilteredNavNode[] = [];
  for (const node of ordered) {
    const decision = decide(node);
    if (decision === 'hidden') continue;
    if (decision === 'locked') {
      const { children: _children, childrenPending: _pending, ...rest } = node;
      out.push({ ...rest, locked: true });
      continue;
    }
    if (node.childrenPending) {
      // Still loading: a skeleton row, never stale or static children.
      out.push({ ...node, kind: node.kind === 'section' ? 'section' : 'group', children: [], childrenPending: true });
      continue;
    }
    if (!node.children?.length) {
      out.push(node);
      continue;
    }
    const visible = filterNavTree(node.children, decide, order, node.id);
    if (!visible.length) continue;
    if (navKindOf(node) === 'section') {
      out.push({ ...node, children: visible });
      continue;
    }
    const hoisted = node.badgeKey ?? (descendantBadgeKey({ children: visible }) ? undefined : descendantBadgeKey(node));
    out.push({ ...node, children: visible, ...(hoisted ? { badgeKey: hoisted } : {}) });
  }
  return out;
}

/** The vessel's labels (Charter → "Trip", Planner → "Leave"), applied after filtering. */
export function applyLabelOverrides(
  nodes: readonly FilteredNavNode[],
  labelFor: (moduleSetting: string) => string | null,
): FilteredNavNode[] {
  return nodes.map((node) => {
    const label = (node.moduleSetting && labelFor(node.moduleSetting)) || node.label;
    const children = node.children ? applyLabelOverrides(node.children, labelFor) : undefined;
    if (label === node.label && children === undefined) return node;
    return { ...node, label, ...(children ? { children } : {}) };
  });
}

/**
 * Where a tab or a group opens: the first own (not a cross-link), unlocked
 * leaf, preferring a built page over a planned one shown with the roadmap.
 * Null when there is none.
 */
export function firstVisibleLeafPath(nodes: readonly FilteredNavNode[]): string | null {
  let planned: string | null = null;
  const visit = (items: readonly FilteredNavNode[]): string | null => {
    for (const item of items) {
      if (item.locked || item.crossLink) continue;
      if (item.children?.length) {
        const found = visit(item.children);
        if (found) return found;
        continue;
      }
      if (navKindOf(item) !== 'leaf') continue;
      if (item.status === 'planned') {
        planned ??= item.path;
        continue;
      }
      return item.path;
    }
    return null;
  };
  return visit(nodes) ?? planned;
}

/** Every leaf of a filtered tree, depth first (sections and groups walked). */
export function filteredLeaves(nodes: readonly FilteredNavNode[], acc: FilteredNavNode[] = []): FilteredNavNode[] {
  for (const node of nodes) {
    if (node.children?.length) filteredLeaves(node.children, acc);
    else acc.push(node);
  }
  return acc;
}
