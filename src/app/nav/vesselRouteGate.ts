/**
 * Switched-off modules close their pages too, not only their nav entries
 * (BUILD-PLAN S4 "routes hidden"; gap/10 W4; DECISIONS C13, G3, D-04; spec
 * §5.5). Pure: the vessel scope (src/app/router/scopes.tsx) asks
 * `vesselRouteDecision` before it renders a page, and the vessel switch uses
 * the same keys (`moduleSettingsForVesselPath`) to decide where to land.
 *
 * - A path that no `vessel_module_settings` key governs (the vessel home,
 *   Calendar, any page outside a module with a setting) is `ok` in every
 *   resolver state: those pages never wait for, or fail on, the settings.
 * - Otherwise: `loading` while the settings load, `error` when they failed
 *   (fail closed), `{ off }` naming the first key that is off, else `ok`.
 *
 * Off is off for everyone on that vessel, admins included (W4); the data is
 * kept, and the tab row's cog stays the way back to Vessel Settings.
 */
import { VESSEL_MODULES } from '@/config/sitemap';
import type { NavChild } from '@/config/navigation-types';
import type { ModuleSettingsResolver } from '@/modules/vessels/lib/moduleSettings';
import { vesselSettingKeysForRest } from './vesselSwitch';

export type VesselRouteDecision = 'ok' | 'loading' | 'error' | { off: string };

/**
 * Every `vessel_module_settings` key a vessel page needs on: its tab's key,
 * then each key on the way down to the most specific nav node the path sits
 * under (`technical/jobs/123` → `['technical', 'technical.jobs']`;
 * `crew/hours-of-rest` → `['crew', 'crew_hor']`), including the pages a node
 * lists in `alsoCovers` (one crew member's month,
 * `crew/people/p1/hours-of-rest` → `['crew', 'crew_hor']`). `[]` for the
 * vessel home and for pages outside every module with a setting. It is the
 * vessel switch's rule (`vesselSettingKeysForRest`), so the two never drift.
 */
export function moduleSettingsForVesselPath(vesselRest: string): string[] {
  return vesselSettingKeysForRest(vesselRest);
}

export function vesselRouteDecision(vesselRest: string, resolver: ModuleSettingsResolver): VesselRouteDecision {
  const keys = moduleSettingsForVesselPath(vesselRest);
  if (!keys.length) return 'ok';
  if (resolver.status === 'loading') return 'loading';
  if (resolver.status === 'error') return 'error';
  const off = keys.find((key) => !resolver.isModuleOn(key));
  return off ? { off } : 'ok';
}

function findLabel(nodes: readonly NavChild[], key: string): string | null {
  for (const node of nodes) {
    if (node.moduleSetting === key) return node.label;
    const below = node.children?.length ? findLabel(node.children, key) : null;
    if (below) return below;
  }
  return null;
}

/**
 * What the nav calls the module or page a key switches (after the vessel's
 * label override): `technical` → "Technical", `planner` → "Leave" on a vessel
 * that renames it. Falls back to the key itself for a key the nav does not know.
 */
export function moduleSettingLabel(key: string, labelFor: (moduleSetting: string) => string | null): string {
  const override = labelFor(key);
  if (override) return override;
  for (const module of VESSEL_MODULES) {
    if (module.moduleSetting === key) return module.label;
    const label = findLabel(module.children, key);
    if (label) return label;
  }
  return key;
}
