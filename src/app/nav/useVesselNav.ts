/**
 * The vessel view's nav for one vessel: its tab row, each tab's sidebar and
 * the module-settings resolver behind them (gap/10 "Vessel view", IA5, IA6,
 * IA9, W4; spec §5.3). The tab row, the vessel sidebar, the breadcrumb, the
 * route gate, the shell notices and the command palette all read this, so
 * they agree on what is on, what it is called and what the viewer may open.
 *
 * Default vessel: the one the URL is on; outside the vessel scope the vessel
 * the top bar names (the last one opened, else the selected or first). Inside
 * the vessel scope only the URL's vessel counts: an unresolved one (unknown
 * code, out of reach, sold) has no nav at all, never another vessel's (D-04;
 * spec §1), and no tab is active.
 *
 * Status:
 * - `loading` while access or the vessel's settings load: no tabs (the tab
 *   row shows skeletons, the sidebar nothing);
 * - `error` when the settings failed: tabs that need a setting are hidden
 *   (fail closed), Home and Calendar stay, the shell shows a Retry strip;
 * - `ready` otherwise (a missing settings table is ready, every module on).
 */
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { vesselModuleForPath } from '@/config/sitemap';
import { parseVesselPath } from '@/modules/vessels/lib/vesselCode';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useVesselModuleSettings } from '@/modules/vessels/hooks/useVesselModuleSettings';
import { localIsoDate, resolveModuleSettings, type ModuleSettingsResolver } from '@/modules/vessels/lib/moduleSettings';
import { applySidebarOrder, useSidebarOrder } from '@/shared/hooks/useSidebarOrder';
import { useShellVessel } from '@/shared/components/layout/topbar/useShellVessel';
import { useScope } from '@/app/router/scopeContext';
import type { NavChild } from '@/config/navigation-types';
import { useNavNodeFilter } from './useNavNodeFilter';
import { useNavProviderResults, type NavChildrenProvider, type NavProviderVessel } from './navProviders';
import { buildVesselTabs, type VesselTab } from './vesselNavModel';

export type { VesselTab } from './vesselNavModel';

export interface VesselNavTarget {
  id: string;
  code: string;
  name: string;
}

/** Named `…Model`: the dashboard's `VesselNavState` is the AIS state (under way, moored). */
export interface VesselNavModel {
  status: 'loading' | 'error' | 'ready';
  vessel: VesselNavTarget | null;
  /** Filtered and labelled, in tab order; empty while loading. */
  tabs: readonly VesselTab[];
  /** The tab the current URL is on (in the vessel scope), else null; null with no vessel. */
  activeTabId: string | null;
  resolver: ModuleSettingsResolver;
  /** Why the settings failed (`status === 'error'`), for the error state; else null. */
  errorMessage: string | null;
  /** A settings load is in flight (a Retry waits for it). */
  retrying: boolean;
  /** Load the vessel's settings again. */
  retry: () => void;
}

export interface UseVesselNavOptions {
  /** Data-driven nav providers; a fixed list (tests). Default: the registry. */
  providers?: readonly NavChildrenProvider[];
}

/**
 * The vessel in scope; outside the vessel scope the one the top bar names
 * (spec §5.3). Null when there is none, and in a vessel scope whose URL
 * resolved to no vessel (`useShellVessel`'s last-vessel fallback is for the
 * surfaces outside the vessel scope only; D-64, spec §6.1).
 */
function useDefaultTarget(): VesselNavTarget | null {
  const scope = useScope();
  const shellVessel = useShellVessel();
  const { getVesselCodeById } = useVessel();
  const scoped = scope.scope === 'vessel' && scope.vessel && scope.vesselCode ? scope.vessel : null;
  const vessel = scope.scope === 'vessel' ? scoped : shellVessel ?? null;
  const code = scoped ? scope.vesselCode ?? null : vessel ? getVesselCodeById(vessel.id) : null;
  const id = vessel?.id ?? null;
  const name = vessel?.name ?? null;
  return useMemo(() => (id && code && name !== null ? { id, code, name } : null), [id, code, name]);
}

export function useVesselNav(target?: VesselNavTarget | null, options: UseVesselNavOptions = {}): VesselNavModel {
  const fallback = useDefaultTarget();
  // `undefined`: the default vessel; `null`: no vessel (the caller has none yet).
  const chosen = target === undefined ? fallback : target;
  const targetId = chosen?.id ?? null;
  const targetCode = chosen?.code ?? null;
  const targetName = chosen?.name ?? null;
  const vessel = useMemo<VesselNavTarget | null>(
    () => (targetId && targetCode && targetName !== null ? { id: targetId, code: targetCode, name: targetName } : null),
    [targetId, targetCode, targetName],
  );

  const { state, fetching, retry } = useVesselModuleSettings(vessel?.id ?? null);
  const today = localIsoDate();
  const resolver = useMemo(() => resolveModuleSettings(state, today), [state, today]);
  const filter = useNavNodeFilter({ isModuleOn: resolver.isModuleOn });
  const { map } = useSidebarOrder();
  const order = useMemo(
    () => <T extends NavChild>(items: T[], parentId: string) => applySidebarOrder(items, map[parentId]),
    [map],
  );
  const providerVessel = useMemo<NavProviderVessel | null>(() => vessel, [vessel]);
  const providerResults = useNavProviderResults(providerVessel, options.providers);

  const { pathname } = useLocation();
  // No vessel, no active tab: no link is ever current for a URL it does not point to.
  const rest = vessel ? parseVesselPath(pathname)?.rest ?? null : null;
  const activeTabId = rest === null ? null : vesselModuleForPath(rest)?.id ?? null;

  const status: VesselNavModel['status'] = !vessel
    ? filter.ready
      ? 'ready'
      : 'loading'
    : !filter.ready || resolver.status === 'loading'
      ? 'loading'
      : resolver.status === 'error'
        ? 'error'
        : 'ready';

  const tabs = useMemo<readonly VesselTab[]>(() => {
    if (!vessel || status === 'loading') return [];
    return buildVesselTabs({ code: vessel.code, resolver, decide: filter.decide, order, providerResults });
  }, [vessel, status, resolver, filter.decide, order, providerResults]);

  const errorMessage = vessel && state.status === 'error' ? state.message : null;
  return useMemo<VesselNavModel>(
    () => ({ status, vessel, tabs, activeTabId, resolver, errorMessage, retrying: fetching, retry }),
    [status, vessel, tabs, activeTabId, resolver, errorMessage, fetching, retry],
  );
}
