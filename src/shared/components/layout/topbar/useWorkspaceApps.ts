/**
 * The STORM workspaces this user can open (gap/10 top bar element 4, IA8,
 * D-09; spec §6.3): the Fleet tree's Workspaces section, filtered by the same
 * nav filter the sidebar uses (HRIS by HR access, Health by wellness access
 * or self-serve, Yard by maintenance, Shoreside while planned), so the Apps
 * menu and the sidebar never disagree. The section is workspace-scoped, so
 * users without fleet reach get it too. Empty until access has loaded.
 */
import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { NAVIGATION_ITEMS } from '@/config/sitemap';
import type { NavChild } from '@/config/navigation-types';
import { useNavNodeFilter } from '@/app/nav/useNavNodeFilter';
import { workspacePurpose } from '@/app/shell/apps';

export interface WorkspaceApp {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  purpose: string | null;
}

const WORKSPACES_SECTION: NavChild | undefined = NAVIGATION_ITEMS.find((item) => item.id === 'fleet')?.children?.find(
  (node) => node.id === 'fleet-workspaces',
);

/** The visible workspace entries of a section (pure; exported for tests). */
export function visibleWorkspaceApps(section: NavChild | undefined, canShow: (item: NavChild) => boolean): WorkspaceApp[] {
  if (!section || !canShow(section)) return [];
  return (section.children ?? [])
    .filter((node) => canShow(node))
    .map((node) => ({ id: node.id, label: node.label, path: node.path, icon: node.icon, purpose: workspacePurpose(node.path) }));
}

export function useWorkspaceApps(): { ready: boolean; apps: readonly WorkspaceApp[] } {
  const { ready, canShow } = useNavNodeFilter();
  return useMemo(
    () => (ready ? { ready: true, apps: visibleWorkspaceApps(WORKSPACES_SECTION, canShow) } : { ready: false, apps: [] }),
    [ready, canShow],
  );
}
