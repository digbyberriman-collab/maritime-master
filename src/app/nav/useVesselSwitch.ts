/**
 * Open another vessel, keeping the user's place (gap/10 W2, IA23; contract,
 * BUILD-PLAN S1, S4, S5; spec §6.2). The vessel switcher, the scope control's
 * vessel segment and the command palette's Vessels group call this; none
 * navigates on its own.
 *
 * 1. Fetch the target vessel's module settings (one cache entry with the
 *    vessel nav, `vesselModuleSettingsQueryOptions`). A missing table means
 *    every module on (D-01); any other failure fails closed: the vessel home.
 * 2. Build the target's filtered vessel nav (`buildVesselTabs`: its settings,
 *    the viewer's gates, add-on locks) and let `vesselSwitchTarget` keep the
 *    sub-path, else the tab root, else the vessel home; from a Fleet page,
 *    the vessel counterpart under the same checks.
 * 3. Navigate and put the vessel at the front of the user's recent list.
 *
 * Latest selection wins: a switch overtaken by a later one never navigates.
 */
import { useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { NAVIGATION_ITEMS } from '@/config/sitemap';
import type { NavChild } from '@/config/navigation-types';
import { VESSEL_SCOPE_PATTERN, vesselPath } from '@/modules/vessels/lib/vesselCode';
import { vesselModuleSettingsQueryOptions, type ReadyModuleSettings } from '@/modules/vessels/hooks/useVesselModuleSettings';
import { localIsoDate, resolveModuleSettings } from '@/modules/vessels/lib/moduleSettings';
import { applySidebarOrder, useSidebarOrder } from '@/shared/hooks/useSidebarOrder';
import { vesselSwitchTarget } from './vesselSwitch';
import { recordRecentVessel } from './recentVessels';
import { useNavNodeFilter } from './useNavNodeFilter';
import { buildVesselTabs, vesselRestVisibilityFromTabs } from './vesselNavModel';
import type { NavNodeDecision } from './visibility';

export interface VesselSwitchTargetVessel {
  id: string;
  /** The vessel's code (D-03), any case. */
  code: string;
}

const strip = (path: string): string => path.replace(/^\/+|\/+$/g, '');

/**
 * Whether a vessel page (`rest` after `/v/<code>/`) is visible in a vessel nav
 * tree on the `/v/:vesselCode` pattern: every node from its tab down to the
 * most specific node the page sits under must pass `canShow`. The vessel home
 * is always visible; a page the tree does not know is left to its own guard.
 * (The static check; the switch itself uses the target vessel's filtered nav.)
 */
export function vesselRestVisibility(
  tree: readonly NavChild[],
  canShow: (item: NavChild) => boolean,
): (vesselRest: string) => boolean {
  const base = strip(VESSEL_SCOPE_PATTERN);
  return (vesselRest: string) => {
    const rest = strip(vesselRest.split(/[?#]/)[0]);
    if (!rest) return true;
    const target = `${base}/${rest}`;
    let best: readonly NavChild[] = [];
    let bestLength = -1;
    const visit = (nodes: readonly NavChild[], above: readonly NavChild[]) => {
      for (const node of nodes) {
        if (node.crossLink) continue;
        const path = strip(node.path.split(/[?#]/)[0]);
        const chain = [...above, node];
        const under = path !== base && (target === path || target.startsWith(`${path}/`));
        if (under && (path.length > bestLength || (path.length === bestLength && chain.length > best.length))) {
          best = chain;
          bestLength = path.length;
        }
        if (node.children?.length) visit(node.children, chain);
      }
    };
    visit(tree, []);
    return best.every((node) => canShow(node));
  };
}

/** The static vessel tree (`/v/:vesselCode` pattern), for `vesselRestVisibility`. */
export const VESSEL_PATTERN_TREE: readonly NavChild[] = NAVIGATION_ITEMS.find((item) => item.id === 'vessel')?.children ?? [];

/** Returns `switchTo(vessel)`, which navigates once the target vessel's settings are known. */
export function useVesselSwitch(): (vessel: VesselSwitchTargetVessel) => void {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // The viewer's gates without any vessel's settings; the target's are added per switch.
  const { decide } = useNavNodeFilter();
  const { map } = useSidebarOrder();
  const order = useMemo(
    () => <T extends NavChild>(items: T[], parentId: string) => applySidebarOrder(items, map[parentId]),
    [map],
  );
  const current = `${location.pathname}${location.search}${location.hash}`;
  const latest = useRef(0);

  return useCallback(
    (vessel: VesselSwitchTargetVessel) => {
      const ticket = ++latest.current;
      const go = (target: string) => {
        if (ticket !== latest.current) return;
        recordRecentVessel(userId, vessel.id);
        navigate(target);
      };
      void (async () => {
        let state: ReadyModuleSettings;
        try {
          state = await queryClient.fetchQuery(vesselModuleSettingsQueryOptions(vessel.id));
        } catch {
          // The target's settings failed: open its home, never a page that may be off.
          go(vesselPath(vessel.code));
          return;
        }
        const resolver = resolveModuleSettings(state, localIsoDate());
        const decideForTarget = (node: NavChild): NavNodeDecision =>
          node.moduleSetting && !resolver.isModuleOn(node.moduleSetting) ? 'hidden' : decide(node);
        const tabs = buildVesselTabs({ code: vessel.code, resolver, decide: decideForTarget, order });
        const isVisible = vesselRestVisibilityFromTabs(tabs, vessel.code);
        go(vesselSwitchTarget({ currentPath: current, targetCode: vessel.code, isModuleOn: resolver.isModuleOn, isVisible }));
      })();
    },
    [navigate, queryClient, current, decide, order, userId],
  );
}
