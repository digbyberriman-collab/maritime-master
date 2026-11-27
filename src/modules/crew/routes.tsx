import type { ManifestPageLoader, RouteDef } from '@/app/registry/types';
import { CREW_CAPS, CREW_FLEET_PATHS, CREW_PATHS, CREW_ROOT } from './paths';

/** The person's own documents, relative to `/me` (X1-04B; the crew manifest's personal.my_work leaf). */
export const MY_DOCUMENTS_PATH = 'documents';

/** The vessel's hours-of-rest report (X1-08B), relative to `/v/:vesselCode`; under the Hours of Rest leaf. */
export const HOR_REPORT_PATH = `${CREW_PATHS.hoursOfRest}/report`;

/** The planner's tabs (X1-09B), relative to `/v/:vesselCode`: timeline | manning | requests | configuration. */
export const PLANNER_TAB_PATH = `${CREW_PATHS.planner}/:tab`;

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
 * vessel.crew.crew_profiles.view, and the server again).
 * X1-07B made Hours of rest a profile tab: the static
 * crew/people/:crewId/hours-of-rest route (the old month page) is gone, so
 * the profile's :tab route serves that URL, and a legacy login id in it
 * (the board's and the crew list's links, the legacy /crew/work-rest/:crewId
 * redirect) is resolved by the profile page. The Hours of Rest leaf keeps
 * covering crew/people/<person>/hours-of-rest, so the vessel's crew_hor
 * setting still closes it.
 * X1-03B adds Add crew member at crew/new (guard
 * vessel.crew.crew_profiles.create; the page checks the key for the route
 * vessel again, and Save also needs users-access administration because
 * create-crew-member makes the person's account). The crew list's Add crew
 * opens it.
 * X1-06B serves Crew Compliance at crew/compliance/:tab (status |
 * configuration; guard vessel.crew.crew_compliance.view, the page asks
 * again for the route vessel and the server for every read) in place of the
 * legacy crew documents page; crew/compliance still redirects to status,
 * and the legacy /crew/certificates lands on status?view=documents.
 * X1-08 serves the vessel hours-of-rest board (HoursOfRestBoardPage) at
 * crew/hours-of-rest in place of the legacy overview, behind
 * vessel.crew.hours_of_rest.approve (the page asks again for the route
 * vessel and sends everyone else to their own month, /me/hours-of-rest;
 * the legacy overview is the board's D-01 fallback and still the page of
 * the legacy /crew/work-rest/overview).
 * X1-08B serves the vessel's hours-of-rest report at
 * crew/hours-of-rest/report?year= (HoursOfRestReportPage) behind
 * vessel.crew.hours_of_rest.view: the year's KPIs and months, open
 * breaches, breach reports sent (and creating one, final approvers) and
 * the reminder log. It sits under the Hours of Rest leaf, so the crew_hor
 * setting closes it with the board.
 * X1-09B serves the planner at crew/planner/:tab (PlannerPage: Timeline,
 * Manning, Requests, Configuration) behind vessel.crew.crew_scheduling.view,
 * in place of the three legacy pages (the lane planner, the day-code leave
 * grid and the requests page), which stay the page's D-01 fallback and the
 * pages of their legacy URLs (/crew/rotation-planner, /crew/leave,
 * /crew/leave/requests; D-45) as thin wrappers over the tabs. crew/planner
 * still redirects to timeline. The fleet planner (/fleet/planner?tab=crew)
 * is the same page in fleet scope.
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
  // Crew Compliance (X1-06B; gap/04 C33, C35): Status and Configuration tabs; an unknown tab lands on Status in the page.
  vesselRedirect(CREW_PATHS.compliance, 'status'),
  vesselCapabilityPage(`${CREW_PATHS.compliance}/:tab`, CREW_CAPS.complianceView, () => import('@/modules/crew/pages/CrewCompliancePage')),
  // The vessel hours-of-rest board (X1-08; gap/04 C40-C43): for approvers; the page asks again for the route vessel.
  vesselCapabilityPage(CREW_PATHS.hoursOfRest, CREW_CAPS.horApprove, () => import('@/modules/work-rest/pages/HoursOfRestBoardPage')),
  // The vessel's hours-of-rest report (X1-08B; gap/04 C44, C41, C42): for anyone who sees the vessel's hours of rest.
  vesselCapabilityPage(HOR_REPORT_PATH, CREW_CAPS.horView, () => import('@/modules/work-rest/pages/HoursOfRestReportPage')),
  // The planner (X1-09B; gap/04 C47-C50, C52, W7): Timeline, Manning, Requests and Configuration tabs on one
  // page; an unknown tab lands on the timeline in the page. The legacy pages stay the D-01 fallback inside it.
  vesselRedirect(CREW_PATHS.planner, 'timeline'),
  vesselCapabilityPage(PLANNER_TAB_PATH, CREW_CAPS.schedulingView, () => import('@/modules/rotation-planner/pages/PlannerPage')),
  vesselPage(CREW_PATHS.familiarisation, () => import('@/modules/training/pages/Training')),
  // The person's own documents (X1-04B; gap/04 C24-C26; X1 spec §4 personal row).
  {
    scope: 'personal',
    path: MY_DOCUMENTS_PATH,
    page: () => import('@/modules/crew/pages/MyDocumentsPage'),
    guard: { kind: 'capability', capability: CREW_CAPS.documentsViewOwn },
  },
  // Crew rotation and season planning across the fleet (DECISIONS R2; gap/04, gap/07): ?tab=crew is the
  // reachable vessels' planners stacked (X1-09B); the Season tab is X4's. Behind crew scheduling view on
  // any vessel; each vessel lane asks again. Its nav leaf stays a platform node of Fleet › Overview
  // (src/config/sitemap.ts).
  {
    scope: 'fleet',
    path: CREW_FLEET_PATHS.planner,
    page: () => import('@/modules/rotation-planner/pages/PlannerPage'),
    guard: { kind: 'capability', capability: CREW_CAPS.schedulingView },
  },
];
