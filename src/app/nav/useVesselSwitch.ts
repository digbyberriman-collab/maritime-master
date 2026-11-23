/**
 * Open another vessel, keeping the user's place (gap/10 W2, IA23; contract,
 * BUILD-PLAN S1, S4, S5; spec §6.2). The vessel switcher, the scope control's
 * vessel segment, the in-page vessel pickers and the command palette's
 * Vessels group call this; none navigates on its own.
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
 * Latest selection wins across callers (one epoch shared by every caller):
 * a switch overtaken by a later one never navigates. A switch is abandoned
 * when the user closes the switcher (`cancelPendingVesselSwitch`) or
 * navigates elsewhere (`useInvalidateVesselSwitchOnNavigate`, mounted once
 * in the top bar), so a settings read the user stopped waiting for never
 * moves them later.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import type { NavChild } from '@/config/navigation-types';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
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

/**
 * Every switch takes the next value; a switch navigates only while it is
 * still the latest. Shared by every caller, so a later pick anywhere (the
 * switcher, the palette, a page picker) overtakes an earlier one.
 */
let switchEpoch = 0;

/** Abandon the switch in flight, if any (the user closed the switcher). */
export function cancelPendingVesselSwitch(): void {
  switchEpoch += 1;
}

/**
 * Abandon any switch in flight whenever the location changes. Mount once in
 * a component that stays mounted for the whole shell (the top bar): a
 * caller such as the palette unmounts before its switch resolves. The bump
 * caused by a switch's own navigation is harmless (it has navigated).
 */
export function useInvalidateVesselSwitchOnNavigate(): void {
  const { key } = useLocation();
  useEffect(() => {
    switchEpoch += 1;
  }, [key]);
}

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

  // While a caller stays mounted it also abandons on a location change (not on
  // mount); the top bar's `useInvalidateVesselSwitchOnNavigate` covers callers
  // that unmount on pick, such as the palette.
  const seenKey = useRef(location.key);
  useEffect(() => {
    if (seenKey.current === location.key) return;
    seenKey.current = location.key;
    switchEpoch += 1;
  }, [location.key]);

  return useCallback(
    (vessel: VesselSwitchTargetVessel) => {
      switchEpoch += 1;
      const ticket = switchEpoch;
      const go = (target: string) => {
        if (ticket !== switchEpoch) return;
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
