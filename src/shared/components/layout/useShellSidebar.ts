/**
 * Which tree the shell's sidebar draws, per scope (gap/10 IA6, IA7; spec §1
 * scope table, §4.3, §4.5):
 *
 *   fleet      the Fleet tree (six section headings)
 *   vessel     the active tab's sidebar only, for that vessel (none for Home,
 *              Calendar, Reports: the page takes the full width; none when
 *              the URL resolved to no vessel)
 *   workspace  that workspace's tree, only when the user may open the
 *              workspace (the Apps gate, src/app/nav/workspaceAccess.ts; a
 *              skeleton while access loads), also when a legacy page names
 *              the workspace with `?module=`
 *   personal   the personal tree for the user's role (`usePersonalNav`;
 *              company settings only where `canAccessSection` allows)
 *   legacy     as before: `?module=` else the tree that holds the path
 *
 * Every tree goes through the same filter (`useNavNodeFilter().decide` +
 * `filterNavTree`, with the user's saved order), so the sidebar never shows
 * what another surface hides. `available` false means no sidebar column and
 * no menu button for this page.
 */
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { NAVIGATION_ITEMS, vesselModuleForPath } from '@/config/sitemap';
import { WORKSPACE_TREES } from '@/config/navSlots';
import { parseVesselPath } from '@/modules/vessels/lib/vesselCode';
import { useFilteredModuleTree } from '@/app/nav/useFilteredTree';
import type { FilteredNavNode } from '@/app/nav/navTree';
import { useVesselNav } from '@/app/nav/useVesselNav';
import { PERSONAL_TREE_ID, usePersonalNav } from '@/app/nav/usePersonalNav';
import { useWorkspaceRootGate } from '@/app/nav/workspaceAccess';
import type { ShellScope } from './AppShell';
import { useActiveNavModule } from './useActiveNavModule';

export interface ShellSidebarHeading {
  label: string;
  icon: LucideIcon;
}

export interface ShellSidebarModel {
  /** This page has a sidebar (static column ≥ 1024 px, drawer below). */
  available: boolean;
  /** The tree is still being worked out: skeleton rows, never unfiltered nodes. */
  loading: boolean;
  nodes: readonly FilteredNavNode[];
  heading: ShellSidebarHeading | null;
  /** Workspace and legacy trees: the id `?module=` carries (D-45). */
  moduleParam: string | null;
  /** The tree's own root path: a leaf on it is current only on an exact match. */
  rootPath: string | null;
  /** The tree can hold planned nodes, so the Show roadmap switch applies. */
  roadmapApplies: boolean;
}

const NONE: ShellSidebarModel = {
  available: false,
  loading: false,
  nodes: [],
  heading: null,
  moduleParam: null,
  rootPath: null,
  roadmapApplies: false,
};

const PERSONAL_MODULE = NAVIGATION_ITEMS.find((item) => item.id === PERSONAL_TREE_ID);
const PERSONAL_HEADING: ShellSidebarHeading | null = PERSONAL_MODULE ? { label: PERSONAL_MODULE.label, icon: PERSONAL_MODULE.icon } : null;
const PERSONAL_ROOT = PERSONAL_MODULE?.path ?? '/me';

const WORKSPACE_TREE_IDS: ReadonlySet<string> = new Set(WORKSPACE_TREES.map((w) => w.id));

export function useShellSidebar(scope: ShellScope): ShellSidebarModel {
  const { pathname } = useLocation();
  const activeModule = useActiveNavModule();
  // Only the vessel scope reads a vessel's nav (no settings fetch elsewhere).
  const vesselNav = useVesselNav(scope === 'vessel' ? undefined : null);
  // The personal tree is filtered by the user's settings gate, never drawn raw.
  const personalTree = scope === 'personal' || activeModule?.id === PERSONAL_TREE_ID;
  const treeModule = scope === 'vessel' || personalTree ? null : activeModule;
  const nodes = useFilteredModuleTree(treeModule);
  const personal = usePersonalNav();
  // A workspace tree shows only when Apps would offer the workspace (D-09; spec §6.3).
  const workspaceGate = useWorkspaceRootGate();

  // The vessel tab the URL is on, known from the static tree before the
  // vessel's settings load (so the column does not jump in once they do).
  const rest = scope === 'vessel' ? parseVesselPath(pathname)?.rest ?? null : null;
  const staticTab = rest === null ? null : vesselModuleForPath(rest);

  return useMemo<ShellSidebarModel>(() => {
    if (personalTree) {
      if (!personal.nodes.length) return NONE;
      return {
        available: true,
        // The user's own sections show at once; the company settings join once auth is in.
        loading: false,
        nodes: personal.nodes,
        heading: PERSONAL_HEADING,
        moduleParam: null,
        rootPath: PERSONAL_ROOT,
        roadmapApplies: true,
      };
    }
    if (scope === 'vessel') {
      // An unresolved vessel (unknown code, out of reach, sold): no sidebar, not even a skeleton.
      if (!vesselNav.vessel) return NONE;
      if (!staticTab || !staticTab.children.length) return NONE;
      if (vesselNav.status === 'loading') {
        return { ...NONE, available: true, loading: true, heading: { label: staticTab.label, icon: staticTab.icon }, roadmapApplies: true };
      }
      const tab = vesselNav.tabs.find((t) => t.id === staticTab.id);
      if (!tab || tab.locked || (!tab.children.length && !tab.childrenPending)) return NONE;
      return {
        available: true,
        loading: false,
        nodes: tab.children,
        heading: { label: tab.label, icon: tab.icon },
        moduleParam: null,
        rootPath: tab.path,
        roadmapApplies: true,
      };
    }
    if (!treeModule) return NONE;
    const heading: ShellSidebarHeading = { label: treeModule.label, icon: treeModule.icon };
    if (WORKSPACE_TREE_IDS.has(treeModule.id)) {
      // Skeleton rows while access loads, never the unfiltered tree; nothing for a workspace the user may not open.
      if (!workspaceGate.ready) return { ...NONE, available: true, loading: true, heading, roadmapApplies: true };
      if (!workspaceGate.canOpen(treeModule.path)) return NONE;
    }
    const workspaceOrLegacy = scope === 'workspace' || scope === 'legacy';
    return {
      available: true,
      loading: false,
      nodes,
      heading,
      // Fleet and vessel trees never add `?module=`; the legacy vessel pattern tree neither.
      moduleParam: workspaceOrLegacy && treeModule.id !== 'fleet' && treeModule.id !== 'vessel' ? treeModule.id : null,
      rootPath: treeModule.path,
      roadmapApplies: true,
    };
  }, [scope, staticTab, vesselNav.vessel, vesselNav.status, vesselNav.tabs, treeModule, nodes, personalTree, personal.nodes, workspaceGate]);
}
