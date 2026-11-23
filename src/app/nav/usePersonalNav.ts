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
 *
 * A personal leaf with a vessel module setting (Hours of rest: `crew_hor`,
 * D-109) shows only when that setting is on for at least one of the user's
 * reachable vessels. Their settings are read with the query the vessel
 * switch and the vessel tree use (one cache entry per vessel). The leaf is
 * hidden while any read loads or has failed, and with no vessel at all; a
 * table that does not exist yet counts as on (D-01).
 *
 * The shell calls this hook on every page, but only fetches those settings
 * while the personal tree is in use: the personal scope (or a page whose nav
 * tree is the personal one) or the open command palette. Elsewhere it reads
 * what is already cached and fetches nothing, as only the vessel scope reads
 * a vessel's settings.
 */
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueries, type QueryObserverResult } from '@tanstack/react-query';
import { buildPersonalNav } from '@/config/personalNav';
import type { NavChild } from '@/config/navigation-types';
import { useScope } from '@/app/router/scopeContext';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import {
  moduleSettingsStateOf,
  vesselModuleSettingsQueryOptions,
  type ReadyModuleSettings,
} from '@/modules/vessels/hooks/useVesselModuleSettings';
import { localIsoDate, resolveModuleSettings, type ModuleSettingsState } from '@/modules/vessels/lib/moduleSettings';
import { useCommandPalette } from '@/shared/components/command-palette';
import { applySidebarOrder, useSidebarOrder } from '@/shared/hooks/useSidebarOrder';
import { resolveModuleForPath } from '@/shared/lib/moduleNavigation';
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

const NOTHING_ON = (): boolean => false;

/**
 * "Is this vessel module setting on for at least one of the user's vessels?"
 * (pure; exported for tests). False for every key until every read has
 * settled without an error, and with no vessels. `today` is `localIsoDate()`.
 */
export function anyVesselModuleOn(states: readonly ModuleSettingsState[], today: string): (moduleSetting: string) => boolean {
  if (!states.length || states.some((s) => s.status !== 'ready')) return NOTHING_ON;
  const resolvers = states.map((s) => resolveModuleSettings(s, today));
  return (moduleSetting: string) => resolvers.some((r) => r.isModuleOn(moduleSetting));
}

// Module level, so `useQueries` re-runs it only when a result changes.
const combineStates = (results: QueryObserverResult<ReadyModuleSettings>[]): ModuleSettingsState[] =>
  results.map((r) => moduleSettingsStateOf(r));

/** The personal tree is on screen (its scope, or a page whose tree it is) or the palette, which lists it, is open. */
function usePersonalTreeInUse(): boolean {
  const { scope } = useScope();
  const { pathname } = useLocation();
  const palette = useCommandPalette();
  if (scope === 'personal' || palette.isOpen) return true;
  if (scope === 'fleet' || scope === 'vessel') return false;
  return resolveModuleForPath(pathname)?.id === PERSONAL_TREE_ID;
}

export function usePersonalNav(): PersonalNav {
  const { profile, loading } = useAuth();
  const { vessels } = useVessel();
  const inUse = usePersonalTreeInUse();
  const states = useQueries({
    queries: vessels.map((v) => ({ ...vesselModuleSettingsQueryOptions(v.id), enabled: inUse })),
    combine: combineStates,
  });
  const today = localIsoDate();
  const isModuleOn = useMemo(() => anyVesselModuleOn(states, today), [states, today]);
  const { decide } = useNavNodeFilter({ isModuleOn });
  const { map } = useSidebarOrder();
  const role = loading ? null : (profile?.role ?? null);
  return useMemo<PersonalNav>(() => {
    const order = <T extends NavChild>(items: T[], parentId: string) => applySidebarOrder(items, map[parentId]);
    return { ready: !loading, nodes: filterNavTree(personalNavFor(role), decide, order, PERSONAL_TREE_ID) };
  }, [role, loading, decide, map]);
}
