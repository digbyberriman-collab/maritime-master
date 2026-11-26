import type { ManifestPageLoader, RouteDef } from '@/app/registry/types';
import { CREW_CAPS, CREW_FLEET_PATHS, CREW_PATHS } from './paths';

/**
 * Crew routes, as data (BUILD-PLAN B8). The module manifest (./module.ts)
 * registers them, and the router mounts them inside their scope's layout
 * route (src/app/router/manifestRoutes.tsx): vessel paths relative to
 * `/v/:vesselCode`, the fleet planner relative to `/fleet`.
 *
 * Platform-prep PP3 moved these out of src/routes/index.tsx unchanged: each
 * page is the one that served the path before, behind the same check
 * (`login`: ProtectedRoute around the page, as the old protectedPage did).
 * The crew slices swap in their pages and capability guards here:
 * X1-02 serves the vessel crew list (CrewListPage, guard
 * vessel.crew.crew_list.view) at crew/list and turns crew/roster into a
 * redirect to it (the roster is folded into the list, gap/04 C3).
 */
const vesselPage = (path: string, loader: ManifestPageLoader): RouteDef => ({
  scope: 'vessel',
  path,
  page: loader,
  guard: { kind: 'login' },
});

/** A rebuilt vessel page behind its PMS capability (X1 spec §4). */
const vesselCapabilityPage = (path: string, capability: (typeof CREW_CAPS)[keyof typeof CREW_CAPS], loader: ManifestPageLoader): RouteDef => ({
  scope: 'vessel',
  path,
  page: loader,
  guard: { kind: 'capability', capability },
});

/** A redirect inside the vessel scope; `redirectTo` is relative to the route. */
const vesselRedirect = (path: string, redirectTo: string): RouteDef => ({ scope: 'vessel', path, redirectTo });

export const CREW_ROUTES: readonly RouteDef[] = [
  vesselCapabilityPage(CREW_PATHS.list, CREW_CAPS.crewListView, () => import('@/modules/crew/pages/CrewListPage')),
  // The roster is folded into the crew list (X1-02); old links land on the list, query kept.
  // Path-relative on purpose ('./' first): a leading '..' climbs one route in
  // React Router (to /v/:vesselCode), one segment in plain path resolution;
  // './../list' lands on crew/list under both.
  vesselRedirect(CREW_PATHS.roster, './../list'),
  vesselRedirect(CREW_PATHS.compliance, 'status'),
  vesselPage(CREW_PATHS.complianceStatus, () => import('@/modules/crew/pages/CrewDocuments')),
  vesselPage(CREW_PATHS.hoursOfRest, () => import('@/modules/work-rest/pages/WorkRestOverview')),
  // One crew member's month: the target of the legacy /crew/work-rest/:crewId.
  vesselPage(CREW_PATHS.personHoursOfRest, () => import('@/modules/work-rest/pages/MyWorkRestMonth')),
  vesselRedirect(CREW_PATHS.planner, 'timeline'),
  vesselPage(CREW_PATHS.plannerTimeline, () => import('@/modules/rotation-planner/pages/RotationPlannerPage')),
  vesselPage(CREW_PATHS.plannerManning, () => import('@/modules/crew/pages/LeavePlannerPage')),
  vesselPage(CREW_PATHS.plannerRequests, () => import('@/modules/crew/pages/LeaveRequestsPage')),
  vesselPage(CREW_PATHS.familiarisation, () => import('@/modules/training/pages/Training')),
  // Crew rotation and season planning across the fleet (gap/04, gap/07). Its
  // nav leaf stays a platform node of Fleet › Overview (src/config/sitemap.ts).
  {
    scope: 'fleet',
    path: CREW_FLEET_PATHS.planner,
    page: () => import('@/modules/rotation-planner/pages/RotationPlannerPage'),
    guard: { kind: 'login' },
  },
];
