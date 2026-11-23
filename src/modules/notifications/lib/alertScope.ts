/**
 * Which alerts the bell and the inbox read (gap/10 top bar element 8, IA15;
 * spec §2.1; D-71; D-04). Pure, so every reader scopes the same way:
 *
 * - inside the vessel scope (`/v/:code`), that vessel's alerts and the
 *   company-wide ones (no vessel);
 * - elsewhere, for a viewer with fleet reach, every alert of the company;
 * - elsewhere, for anyone else, the alerts of the vessels in their reach and
 *   the company-wide ones; with no vessel in reach (unassigned, or the vessel
 *   list failed and is empty), only the company-wide ones.
 *
 * A null vessel selection never widens the scope: the alerts RLS policy is
 * company-wide, so the filter is the only thing between a vessel-only user
 * and every vessel's alerts. Callers wait until access has loaded before
 * they read at all.
 */

export type AlertScope =
  | { kind: 'vessel'; vesselId: string }
  | { kind: 'company' }
  | { kind: 'reach'; vesselIds: readonly string[] };

export interface AlertScopeInput {
  /** The route scope (`useScope().scope`). */
  routeScope: string;
  /** The vessel the route names (`useScope().vessel?.id`); vessel scope only. */
  scopeVesselId: string | null | undefined;
  /** Fleet reach (`useScopeAccess().fleetReach || canAccessAllVessels`). */
  fleetReach: boolean;
  /** The vessels in the viewer's reach (`useVessel().vessels`). */
  reachableIds: readonly string[];
}

export function alertScopeFor({ routeScope, scopeVesselId, fleetReach, reachableIds }: AlertScopeInput): AlertScope {
  if (routeScope === 'vessel' && scopeVesselId) return { kind: 'vessel', vesselId: scopeVesselId };
  if (fleetReach) return { kind: 'company' };
  return { kind: 'reach', vesselIds: [...new Set(reachableIds.filter(Boolean))].sort() };
}

/** A stable cache key part for a scope. */
export function alertScopeKey(scope: AlertScope): string {
  switch (scope.kind) {
    case 'vessel':
      return `vessel:${scope.vesselId}`;
    case 'company':
      return 'company';
    default:
      return `reach:${scope.vesselIds.join(',')}`;
  }
}

/**
 * The PostgREST `or` filter on `alerts.vessel_id` for a scope; null for the
 * whole company (the `company_id` filter alone).
 */
export function alertOrFilter(scope: AlertScope): string | null {
  switch (scope.kind) {
    case 'vessel':
      return `vessel_id.eq.${scope.vesselId},vessel_id.is.null`;
    case 'company':
      return null;
    default:
      return scope.vesselIds.length ? `vessel_id.in.(${scope.vesselIds.join(',')}),vessel_id.is.null` : 'vessel_id.is.null';
  }
}
