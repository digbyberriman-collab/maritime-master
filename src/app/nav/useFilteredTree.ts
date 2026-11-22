/**
 * A nav tree filtered for the viewer, in their saved sidebar order (spec
 * §4.3): `useNavNodeFilter().decide` + `filterNavTree` + `applySidebarOrder`.
 * The Fleet, workspace and legacy sidebars use it; the vessel tree goes
 * through `useVesselNav`, which adds the vessel's module settings.
 */
import { useMemo } from 'react';
import type { NavChild, NavItem } from '@/config/navigation-types';
import { applySidebarOrder, useSidebarOrder } from '@/shared/hooks/useSidebarOrder';
import { useNavNodeFilter } from './useNavNodeFilter';
import { filterNavTree, type FilteredNavNode } from './navTree';

/** A `NAVIGATION_ITEMS` module's children, filtered; `[]` for none. */
export function useFilteredModuleTree(module: Pick<NavItem, 'id' | 'children'> | null): FilteredNavNode[] {
  const { decide } = useNavNodeFilter();
  const { map } = useSidebarOrder();
  return useMemo(() => {
    if (!module?.children?.length) return [];
    const order = <T extends NavChild>(items: T[], parentId: string) => applySidebarOrder(items, map[parentId]);
    return filterNavTree(module.children, decide, order, module.id);
  }, [module, decide, map]);
}
