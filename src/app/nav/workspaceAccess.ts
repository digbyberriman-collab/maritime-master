/**
 * Workspace access (gap/10 nav visibility rule, step 2; D-09; spec §6.3):
 * whether the user may open a workspace at all, decided once, by the entry
 * the Apps menu lists for it. Those entries are the Fleet tree's WORKSPACES
 * section (the same source as `useWorkspaceApps`), each with its own gate:
 * HRIS by HR access, Health & Wellness by wellness access or self-serve, Yard
 * by maintenance, Shoreside while planned, Legal ungated.
 *
 * The command palette's pages (`useVisibleNavLeaves`) and the workspace
 * sidebar (`useShellSidebar`) ask this gate before they walk a workspace's
 * own tree, whose nodes mostly carry no gate of their own. So Apps, the
 * palette and the sidebar never disagree about a workspace.
 *
 * Fails closed (D-04): no workspace opens while access loads, for a root no
 * entry names, or when the user's gates hide the entry.
 */
import { useCallback, useMemo } from 'react';
import { NAVIGATION_ITEMS } from '@/config/sitemap';
import type { NavChild } from '@/config/navigation-types';
import { useNavNodeFilter } from './useNavNodeFilter';

const pathnameOf = (path: string): string => path.split(/[?#]/)[0] || '/';

/** The Fleet tree's Workspaces section: the Apps menu's source. */
const WORKSPACES_SECTION: NavChild | undefined = NAVIGATION_ITEMS.find((item) => item.id === 'fleet')?.children?.find(
  (node) => node.id === 'fleet-workspaces',
);

/** The Apps entries, one per workspace. */
export const WORKSPACE_ENTRIES: readonly NavChild[] = WORKSPACES_SECTION?.children ?? [];

/** The Apps entry for a workspace root (`/yard`, `/departments/legal`), if there is one. */
export function workspaceEntryForRoot(root: string): NavChild | undefined {
  const pathname = pathnameOf(root);
  return WORKSPACE_ENTRIES.find((entry) => pathnameOf(entry.path) === pathname);
}

/** Whether the workspace at `root` opens for a viewer whose node gate is `canShow` (pure; fails closed). */
export function canOpenWorkspaceRoot(root: string, canShow: (item: NavChild) => boolean): boolean {
  if (!WORKSPACES_SECTION || !canShow(WORKSPACES_SECTION)) return false;
  const entry = workspaceEntryForRoot(root);
  return entry ? canShow(entry) : false;
}

export interface WorkspaceRootGate {
  /** Access has loaded; until then `canOpen` is false for every root. */
  ready: boolean;
  /** The user may open the workspace whose tree is rooted at `root`. */
  canOpen: (root: string) => boolean;
}

export function useWorkspaceRootGate(): WorkspaceRootGate {
  const { ready, canShow } = useNavNodeFilter();
  const canOpen = useCallback((root: string): boolean => ready && canOpenWorkspaceRoot(root, canShow), [ready, canShow]);
  return useMemo(() => ({ ready, canOpen }), [ready, canOpen]);
}
