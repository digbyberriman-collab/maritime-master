import type { ManifestPageLoader, RouteDef } from '@/app/registry/types';
import { CREW_CAPS, CREW_FLEET_PATHS, CREW_PATHS, CREW_ROOT } from './paths';

/** The person's own documents, relative to `/me` (X1-04B; the crew manifest's personal.my_work leaf). */
export const MY_DOCUMENTS_PATH = 'documents';

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
 * X1-03 adds the routed crew profile: crew/people/:profileId redirects to
 * its Personal tab and crew/people/:profileId/:tab is the page (guard: the
 * scope; the page gates on the person's own profile or
 * vessel.crew.crew_profiles.view, and the server again). The static
 * crew/people/:crewId/hours-of-rest (the month page) outranks the :tab
 * route until X1-07B makes Hours of rest a profile tab.
 * X1-03B adds Add crew member at crew/new (guard
 * vessel.crew.crew_profiles.create; the page checks the key for the route
 * vessel again, and Save also needs users-access administration because
 * create-crew-member makes the person's account). The crew list's Add crew
 * opens it.
 * X1-04B adds the person's own documents at /me/documents (scope personal,
 * path `documents`, guard vessel.crew.crew_certificates.view_own; the page
 * asks again and the server answers only for the caller's own profile). The
 * profile's Documents, STCW and Qualifications tabs are crew/people/:profileId/:tab
 * pages (lib/profileTabs.ts), not routes of their own.
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

/** A vessel page whose gate is in the page (and on the server): the scope guard only. */
const vesselScopePage = (path: string, loader: ManifestPageLoader): RouteDef => ({
  scope: 'vessel',
  path,
  page: loader,
  guard: { kind: 'scope' },
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
  // The routed crew profile (X1-03; D-X1-19: a legacy login id in :profileId is resolved and replaced).
  vesselRedirect(`${CREW_ROOT}/people/:profileId`, 'personal'),
  vesselScopePage(`${CREW_ROOT}/people/:profileId/:tab`, () => import('@/modules/crew/pages/CrewProfilePage')),
  // Add crew member (X1-03B; gap/04 C14, W1): `?rehire=<profileId>` prefills a returning crew member (X1-11B).
  vesselCapabilityPage(`${CREW_ROOT}/new`, CREW_CAPS.profilesCreate, () => import('@/modules/crew/pages/AddCrewPage')),
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
  // The person's own documents (X1-04B; gap/04 C24-C26; X1 spec §4 personal row).
  {
    scope: 'personal',
    path: MY_DOCUMENTS_PATH,
    page: () => import('@/modules/crew/pages/MyDocumentsPage'),
    guard: { kind: 'capability', capability: CREW_CAPS.documentsViewOwn },
  },
  // Crew rotation and season planning across the fleet (gap/04, gap/07). Its
  // nav leaf stays a platform node of Fleet › Overview (src/config/sitemap.ts).
  {
    scope: 'fleet',
    path: CREW_FLEET_PATHS.planner,
    page: () => import('@/modules/rotation-planner/pages/RotationPlannerPage'),
    guard: { kind: 'login' },
  },
];
