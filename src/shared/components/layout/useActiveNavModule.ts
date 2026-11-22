/**
 * The nav module the current page belongs to: the tree the module-aware
 * parts of the shell (workspace and legacy sidebars, breadcrumb, favourite's
 * label) name the page by.
 *
 * - Fleet scope: the Fleet tree. Vessel scope: the vessel tree (URLs matched
 *   on the `/v/:vesselCode` pattern). Personal scope: the tree that holds the
 *   path. These scopes pick their tree from the path and ignore `?module=`
 *   (spec §4.5; deferred item 2), so a stray `?module=hris` on a Fleet, vessel
 *   or `/me` URL never changes the sidebar.
 * - Workspace scope: `?module=` only to choose between two workspace trees
 *   that share a path, else the tree that holds the path.
 * - Legacy pages (old URLs rendering in place): `?module=` (a workspace leaf
 *   linking a legacy URL, D-45), else the tree that holds the path.
 */
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { NAVIGATION_ITEMS, type NavItem } from '@/config/navigation';
import { WORKSPACE_TREES } from '@/config/navSlots';
import { resolveModuleForPath } from '@/shared/lib/moduleNavigation';
import { resolvePageNavigation, type PageNavigation } from '@/shared/lib/pageNavigation';
import { toNavPathname } from '@/app/router/legacyResolve';
import { useScope } from '@/app/router/scopeContext';
import { useVesselNav } from '@/app/nav/useVesselNav';

const WORKSPACE_TREE_IDS = new Set(WORKSPACE_TREES.map((w) => w.id));

export function useActiveNavModule(): NavItem | null {
  const { pathname, search } = useLocation();
  const { scope } = useScope();
  return useMemo(() => {
    const byPath = () => resolveModuleForPath(toNavPathname(pathname));
    if (scope === 'fleet') return NAVIGATION_ITEMS.find((item) => item.id === 'fleet') ?? null;
    if (scope === 'vessel') return NAVIGATION_ITEMS.find((item) => item.id === 'vessel') ?? null;
    if (scope === 'personal') return byPath();
    const requested = new URLSearchParams(search).get('module');
    if (scope === 'workspace') {
      const named = requested && WORKSPACE_TREE_IDS.has(requested) ? NAVIGATION_ITEMS.find((item) => item.id === requested) : undefined;
      return named ?? byPath();
    }
    return NAVIGATION_ITEMS.find((item) => item.id === requested) ?? byPath();
  }, [pathname, search, scope]);
}

/**
 * The current page's crumbs and title: the breadcrumb's, the document
 * title's, the fallback h1's and the favourite's label source. In the vessel
 * scope a crumb on a node with a module setting shows the vessel's label
 * override (Planner → "Leave"), so the crumb, the title, the tab and the
 * sidebar agree (spec §7). The title is the last crumb after overrides.
 */
export function useCurrentPageNavigation(): PageNavigation {
  const { pathname, search } = useLocation();
  const { scope } = useScope();
  const module = useActiveNavModule();
  const moduleId = module?.id ?? null;
  // Only the vessel scope reads a vessel's settings (no fetch elsewhere).
  const { labelFor } = useVesselNav(scope === 'vessel' ? undefined : null).resolver;
  return useMemo(() => {
    const page = resolvePageNavigation(toNavPathname(pathname), search, moduleId);
    if (scope !== 'vessel') return page;
    let changed = false;
    const crumbs = page.crumbs.map((crumb) => {
      const label = crumb.moduleSetting ? labelFor(crumb.moduleSetting) : null;
      if (!label || label === crumb.label) return crumb;
      changed = true;
      return { ...crumb, label };
    });
    if (!changed) return page;
    return { crumbs, title: crumbs[crumbs.length - 1]?.label ?? page.title };
  }, [pathname, search, moduleId, scope, labelFor]);
}
