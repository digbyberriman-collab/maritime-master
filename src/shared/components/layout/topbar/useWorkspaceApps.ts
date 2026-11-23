/**
 * The STORM workspaces this user can open (gap/10 top bar element 4, IA8,
 * D-09; spec §6.3): the Fleet tree's Workspaces section, filtered by the same
 * nav filter the sidebar uses (HRIS by HR access, Health by wellness access
 * or self-serve, Yard by maintenance, Shoreside while planned), so the Apps
 * menu and the sidebar never disagree. The section is workspace-scoped, so
 * users without fleet reach get it too. Empty until access has loaded.
 *
 * Each entry opens the workspace's first page the user may open (gap/10 W2:
 * Workspace(w, first allowed leaf)), exactly the link the workspace sidebar's
 * first entry opens (`sidebarHref`, with its `?module=`). A workspace with a
 * tree of its own but no page the user may open is dropped (fail closed;
 * spec §6.3 "lists only workspaces the user can open"). An entry without a
 * tree of its own keeps its path.
 */
import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { NAVIGATION_ITEMS } from '@/config/sitemap';
import { WORKSPACE_TREES } from '@/config/navSlots';
import type { NavChild, NavItem } from '@/config/navigation-types';
import { useNavNodeFilter } from '@/app/nav/useNavNodeFilter';
import { filterNavTree, firstVisibleLeafPath } from '@/app/nav/navTree';
import { sidebarHref } from '@/app/nav/sidebarLinks';
import type { NavNodeDecision } from '@/app/nav/visibility';
import { workspacePurpose } from '@/app/shell/apps';

export interface WorkspaceApp {
  id: string;
  label: string;
  /** Where the entry opens: the workspace's first page the user may open. */
  path: string;
  /** The workspace's URL prefix (`/health`), for "you are here". */
  root: string;
  icon: LucideIcon;
  purpose: string | null;
}

const WORKSPACES_SECTION: NavChild | undefined = NAVIGATION_ITEMS.find((item) => item.id === 'fleet')?.children?.find(
  (node) => node.id === 'fleet-workspaces',
);

const pathnameOf = (path: string): string => path.split(/[?#]/)[0] || '/';

/** The workspace module (its sidebar tree) whose prefix is `pathname`, if any. */
function workspaceModuleAt(pathname: string, modules: readonly NavItem[]): NavItem | undefined {
  const tree = WORKSPACE_TREES.find((w) => w.path === pathname);
  return tree ? modules.find((m) => m.id === tree.id) : undefined;
}

/** The visible workspace entries of a section (pure; exported for tests). */
export function visibleWorkspaceApps(
  section: NavChild | undefined,
  canShow: (item: NavChild) => boolean,
  decide: (item: NavChild) => NavNodeDecision,
  modules: readonly NavItem[] = NAVIGATION_ITEMS,
): WorkspaceApp[] {
  if (!section || !canShow(section)) return [];
  const apps: WorkspaceApp[] = [];
  for (const node of section.children ?? []) {
    if (!canShow(node)) continue;
    const root = pathnameOf(node.path);
    const module = workspaceModuleAt(root, modules);
    let path = node.path;
    if (module) {
      const leaf = firstVisibleLeafPath(filterNavTree(module.children ?? [], decide, undefined, module.id));
      if (!leaf) continue;
      path = sidebarHref(leaf, { moduleParam: module.id, rootPath: module.path });
    }
    apps.push({ id: node.id, label: node.label, path, root, icon: node.icon, purpose: workspacePurpose(node.path) });
  }
  return apps;
}

export function useWorkspaceApps(): { ready: boolean; apps: readonly WorkspaceApp[] } {
  const { ready, canShow, decide } = useNavNodeFilter();
  return useMemo(
    () => (ready ? { ready: true, apps: visibleWorkspaceApps(WORKSPACES_SECTION, canShow, decide) } : { ready: false, apps: [] }),
    [ready, canShow, decide],
  );
}
