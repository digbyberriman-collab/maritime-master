/**
 * Access facts the sidebar needs, handed down by `NavAccessProvider`
 * (mounted once around the routes in src/routes/index.tsx).
 *
 * The sidebar reads this context instead of calling the auth hooks itself,
 * so it renders anywhere: without a provider it gets the fail-closed default
 * (no roadmap, every capability-gated node hidden, no fleet or vessel scope).
 */
import { createContext, useContext } from 'react';

export interface NavAccess {
  /** Auth and RBAC have loaded. Until then `can` is false for every key. */
  ready: boolean;
  /** `profiles.role` (legacy). */
  legacyRole: string | null;
  /** RBAC role names. */
  rbacRoles: readonly string[];
  /** Capability check (interim `useCan` adaptor, D-04). Fails closed. */
  can: (capability: string) => boolean;
  /**
   * The user can open the Fleet view (src/app/router/reach.ts). False while
   * access loads. Gates every fleet-scope node (gap/10 visibility rule, step 2).
   */
  fleetReach: boolean;
  /** The user can reach at least one vessel. False while access loads. Gates vessel-scope nodes. */
  vesselReach: boolean;
}

export const FAIL_CLOSED_NAV_ACCESS: NavAccess = {
  ready: false,
  legacyRole: null,
  rbacRoles: [],
  can: () => false,
  fleetReach: false,
  vesselReach: false,
};

export const NavAccessContext = createContext<NavAccess>(FAIL_CLOSED_NAV_ACCESS);

export function useNavAccess(): NavAccess {
  return useContext(NavAccessContext);
}
