/**
 * Where "go to the Fleet view" lands from the current page (gap/10 W2; spec
 * §6.1): the Fleet counterpart of the vessel page when the viewer can see
 * that Fleet page in their filtered Fleet tree (the same `filterNavTree`
 * the sidebar draws), else the fleet dashboard. The scope control's Fleet
 * segment, the tab row's "← Fleet" and the `g f` shortcut all use it.
 * Callers show it only with fleet reach (D-26).
 */
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { NAVIGATION_ITEMS } from '@/config/sitemap';
import type { NavChild } from '@/config/navigation-types';
import { parseVesselPath } from '@/modules/vessels/lib/vesselCode';
import { fleetCounterpart } from '@/app/nav/counterparts';
import { filterNavTree, filteredLeaves, type FilteredNavNode } from '@/app/nav/navTree';
import { useNavNodeFilter } from '@/app/nav/useNavNodeFilter';

export const FLEET_HOME = '/fleet/dashboard';

const FLEET_TREE: readonly NavChild[] = NAVIGATION_ITEMS.find((item) => item.id === 'fleet')?.children ?? [];

/** A Fleet page is visible when its leaf is in the viewer's filtered Fleet tree, unlocked. */
export function fleetPathVisible(filtered: readonly FilteredNavNode[], path: string): boolean {
  return filteredLeaves(filtered).some((leaf) => !leaf.locked && !leaf.crossLink && leaf.path.split(/[?#]/)[0] === path);
}

export function useFleetTarget(): string {
  const { pathname } = useLocation();
  const { decide } = useNavNodeFilter();
  const filtered = useMemo(() => filterNavTree(FLEET_TREE, decide), [decide]);
  return useMemo(() => {
    const parsed = parseVesselPath(pathname);
    if (!parsed) return FLEET_HOME;
    const counterpart = fleetCounterpart(parsed.rest);
    return counterpart && fleetPathVisible(filtered, counterpart) ? counterpart : FLEET_HOME;
  }, [pathname, filtered]);
}
