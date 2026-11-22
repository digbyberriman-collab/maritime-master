/**
 * The nav visibility rule (gap/10 "Nav visibility rule").
 *
 * A node renders only when:
 * 1. its status is `live` or `beta`, or it is `planned` and the viewer may
 *    and does show the roadmap;
 * 2. the viewer can open its scope: fleet reach for a `fleet` node, at least
 *    one reachable vessel for a `vessel` node. Personal and workspace nodes
 *    pass here; workspaces keep their own module gates. The scope routes
 *    check the same thing again when the page opens;
 * 3. (per-vessel module settings arrive with S4 / `vessel_module_settings`);
 * 4. it carries no `capability`, or the viewer holds it. That check fails
 *    closed: hidden while access is loading and for an unknown key.
 *
 * The legacy `moduleKey` gates stay in SidebarNavigation and run after this.
 * A group or section with no visible children is hidden by the caller.
 */
import type { NavChild } from '@/config/navigation-types';

export interface NavVisibilityContext {
  /** "Show roadmap" is on and the viewer is an owner or admin. */
  showPlanned: boolean;
  /** Capability check; must return false while loading or for unknown keys. */
  can: (capability: string) => boolean;
  /** The viewer can open the Fleet view; false while loading. */
  fleetReach: boolean;
  /** The viewer can reach at least one vessel; false while loading. */
  vesselReach: boolean;
}

export function isNavNodeVisible(
  item: Pick<NavChild, 'status' | 'capability' | 'scope'>,
  ctx: NavVisibilityContext,
): boolean {
  if (item.status === 'planned' && !ctx.showPlanned) return false;
  if (item.scope === 'fleet' && !ctx.fleetReach) return false;
  if (item.scope === 'vessel' && !ctx.vesselReach) return false;
  if (item.capability && !ctx.can(item.capability)) return false;
  return true;
}

/** Leaf/group/section, with the defaults `kind` documents. */
export function navKindOf(item: Pick<NavChild, 'kind' | 'children'>): 'leaf' | 'group' | 'section' {
  if (item.kind === 'section') return 'section';
  if (item.children?.length) return 'group';
  return item.kind === 'group' ? 'group' : 'leaf';
}
