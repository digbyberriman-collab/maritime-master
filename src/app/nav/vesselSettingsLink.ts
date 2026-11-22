/**
 * The way to a vessel's Vessel Settings (gap/10 IA5 cog, W4; DECISIONS D-33;
 * spec §5.4, §5.5). The tab row's cog and the route gate's "Open Vessel
 * Settings" button use the same rule, so the button never offers a page the
 * cog would not:
 *
 * - fleet reach (D-33: fleet admin routes need it);
 * - the `fleet.operations.vessels.admin` capability (fails closed);
 * - the Fleet tree's Vessel Settings leaf passes the visibility rule. It is
 *   planned today, so the cog shows only with Show roadmap on.
 */
import { useMemo } from 'react';
import { NAVIGATION_ITEMS } from '@/config/sitemap';
import type { NavChild } from '@/config/navigation-types';
import { normaliseVesselCode } from '@/modules/vessels/lib/vesselCode';
import { useNavAccess } from './navAccess';
import { useNavNodeFilter } from './useNavNodeFilter';

export const VESSEL_SETTINGS_CAPABILITY = 'fleet.operations.vessels.admin';
export const VESSEL_SETTINGS_PATH = '/fleet/admin/vessel-settings';

/** `/fleet/admin/vessel-settings/dra`. */
export function vesselSettingsHref(code: string): string {
  return `${VESSEL_SETTINGS_PATH}/${encodeURIComponent(normaliseVesselCode(code).toLowerCase())}`;
}

function findLeaf(nodes: readonly NavChild[], path: string): NavChild | null {
  for (const node of nodes) {
    if (node.children?.length) {
      const found = findLeaf(node.children, path);
      if (found) return found;
    } else if (!node.crossLink && node.path.split(/[?#]/)[0] === path) {
      return node;
    }
  }
  return null;
}

const VESSEL_SETTINGS_LEAF = findLeaf(NAVIGATION_ITEMS.find((item) => item.id === 'fleet')?.children ?? [], VESSEL_SETTINGS_PATH);

/** Whether the viewer may open Vessel Settings from a vessel (false while access loads). */
export function useVesselSettingsAccess(): boolean {
  const { fleetReach, can } = useNavAccess();
  const { canShow } = useNavNodeFilter();
  return useMemo(
    () => fleetReach && can(VESSEL_SETTINGS_CAPABILITY) && VESSEL_SETTINGS_LEAF !== null && canShow(VESSEL_SETTINGS_LEAF),
    [fleetReach, can, canShow],
  );
}
