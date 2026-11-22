/**
 * The nav visibility rule (gap/10 "Nav visibility rule", W3, W4; spec §4.1).
 * One function for every surface: sidebar, vessel tab row, Apps menu,
 * command palette, route gate, vessel switch.
 *
 * In this order:
 * 1. **status**: `planned` is hidden unless the viewer may and does show the
 *    roadmap (D-06, D-29); `beta`, `live` or none go on.
 * 2. **scope guard**: a `fleet` node needs fleet reach, a `vessel` node at
 *    least one reachable vessel (D-26). Workspace and personal nodes pass;
 *    their module gates follow.
 * 3. **vessel module setting**: with a vessel's settings (`isModuleOn`), a
 *    node whose `moduleSetting` is off is hidden (C13, G3).
 * 4. **capability**: a node with a `capability` the viewer does not hold is
 *    hidden. Fails closed: hidden while access loads and for an unknown key.
 * 5. (legacy `moduleKey` gates: in `useNavNodeFilter`, after this function.)
 * 6. **entitlement**: an add-on node whose entitlement the vessel lacks is
 *    `locked`: visible with a lock, opening the add-on explanation, never
 *    the page (G4). No entitlement source (`isEntitled` absent) = locked.
 *
 * Empty groups and sections (7) and label overrides (8) are applied by
 * `filterNavTree` / `applyLabelOverrides` in ./navTree.ts.
 */
import type { NavChild } from '@/config/navigation-types';

export type NavNodeDecision = 'hidden' | 'visible' | 'locked';

export interface NavVisibilityContext {
  /** "Show roadmap" is on and the viewer is an owner or admin. */
  showPlanned: boolean;
  /** Capability check; must return false while loading or for unknown keys. */
  can: (capability: string) => boolean;
  /** The viewer can open the Fleet view; false while loading. */
  fleetReach: boolean;
  /** The viewer can reach at least one vessel; false while loading. */
  vesselReach: boolean;
  /** The vessel's module settings; present only for a vessel's own tree. */
  isModuleOn?: (moduleSetting: string) => boolean;
  /** Add-on entitlements of the vessel or account; absent = none (fail closed). */
  isEntitled?: (entitlement: string) => boolean;
}

export type NavGateFields = Pick<NavChild, 'status' | 'scope' | 'moduleSetting' | 'capability' | 'entitlement'>;

export function navNodeDecision(item: NavGateFields, ctx: NavVisibilityContext): NavNodeDecision {
  if (item.status === 'planned' && !ctx.showPlanned) return 'hidden';
  if (item.scope === 'fleet' && !ctx.fleetReach) return 'hidden';
  if (item.scope === 'vessel' && !ctx.vesselReach) return 'hidden';
  if (item.moduleSetting && ctx.isModuleOn && !ctx.isModuleOn(item.moduleSetting)) return 'hidden';
  if (item.capability && !ctx.can(item.capability)) return 'hidden';
  if (item.entitlement && !(ctx.isEntitled?.(item.entitlement) ?? false)) return 'locked';
  return 'visible';
}

/** The node renders (visible or locked). Kept for callers that only need yes or no. */
export function isNavNodeVisible(item: NavGateFields, ctx: NavVisibilityContext): boolean {
  return navNodeDecision(item, ctx) !== 'hidden';
}

/** Leaf/group/section, with the defaults `kind` documents. */
export function navKindOf(item: Pick<NavChild, 'kind' | 'children'>): 'leaf' | 'group' | 'section' {
  if (item.kind === 'section') return 'section';
  if (item.children?.length) return 'group';
  return item.kind === 'group' ? 'group' : 'leaf';
}
