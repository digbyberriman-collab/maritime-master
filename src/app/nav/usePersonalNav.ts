/**
 * The personal area's tree for the signed-in user (spec §8, §4.3): the
 * sections everyone has, plus the company settings their role may open
 * (`canAccessSection`, the settings permissions), through the same filter as
 * every other tree (`useNavNodeFilter().decide` + `filterNavTree`, saved
 * order). The personal sidebar and the palette's Pages read it, so neither
 * lists a section the user cannot open.
 *
 * Fails closed: until auth has loaded, `ready` is false and no company
 * settings are listed; a role that is still unknown (the profile has not
 * arrived) opens none of them either.
 */
import { useMemo } from 'react';
import { buildPersonalNav } from '@/config/personalNav';
import type { NavChild } from '@/config/navigation-types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { applySidebarOrder, useSidebarOrder } from '@/shared/hooks/useSidebarOrder';
import { canAccessSection } from '@/shared/utils/settingsPermissions';
import { useNavNodeFilter } from './useNavNodeFilter';
import { filterNavTree, type FilteredNavNode } from './navTree';

/** The id of the personal tree in `NAVIGATION_ITEMS`. */
export const PERSONAL_TREE_ID = 'personal';

export interface PersonalNav {
  /** Auth has loaded; before that `nodes` holds only the user's own sections. */
  ready: boolean;
  nodes: FilteredNavNode[];
}

/** The unfiltered personal tree for a role (pure; exported for tests). */
export function personalNavFor(role: string | null): NavChild[] {
  return buildPersonalNav((id) => canAccessSection(role, id));
}

export function usePersonalNav(): PersonalNav {
  const { profile, loading } = useAuth();
  const { decide } = useNavNodeFilter();
  const { map } = useSidebarOrder();
  const role = loading ? null : (profile?.role ?? null);
  return useMemo<PersonalNav>(() => {
    const order = <T extends NavChild>(items: T[], parentId: string) => applySidebarOrder(items, map[parentId]);
    return { ready: !loading, nodes: filterNavTree(personalNavFor(role), decide, order, PERSONAL_TREE_ID) };
  }, [role, loading, decide, map]);
}
