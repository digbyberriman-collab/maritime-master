/**
 * Who may open which scope, from the access state STORM has today
 * (gap/00 C4, gap/01 landing rules). Pure: the hooks in ./useScopeAccess.ts
 * feed it, and the tests drive it directly.
 *
 * Fleet reach until memberships land (gap/01 F22–F24):
 * - legacy `profiles.role` DPA or shore management (VesselContext already
 *   gives these "All vessels");
 * - any RBAC role flagged `is_fleet_wide` (permissionsStore.hasFleetAccess);
 * - the RBAC roles useUserRoles treats as fleet access: superadmin, DPA,
 *   fleet master.
 */

export const FLEET_RBAC_ROLES: readonly string[] = ['superadmin', 'dpa', 'fleet_master'];

export interface FleetReachInput {
  /** VesselContext.canAccessAllVessels (legacy role). */
  canAccessAllVessels: boolean;
  /** permissionsStore.hasFleetAccess. */
  hasFleetWideRole: boolean;
  /** RBAC role names. */
  rbacRoles: readonly (string | null | undefined)[];
}

export function hasFleetReach({ canAccessAllVessels, hasFleetWideRole, rbacRoles }: FleetReachInput): boolean {
  if (canAccessAllVessels || hasFleetWideRole) return true;
  return rbacRoles.some((r) => !!r && FLEET_RBAC_ROLES.includes(r));
}

export interface LandingInput {
  fleetReach: boolean;
  /** Code of the selected (last) vessel, else the first reachable one; null if none. */
  lastVesselCode: string | null;
}

/**
 * Where a signed-in user lands (gap/01 "Landing rules after sign-in"):
 * fleet users on the fleet dashboard, vessel users on their vessel's home,
 * and anyone with no vessel on their own area.
 */
export function landingPath({ fleetReach, lastVesselCode }: LandingInput): string {
  if (fleetReach) return '/fleet/dashboard';
  if (lastVesselCode) return `/v/${lastVesselCode.toLowerCase()}`;
  return '/me';
}
