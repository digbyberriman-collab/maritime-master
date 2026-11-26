/**
 * Route paths for the Crew module. Vessel paths are relative to
 * `/v/:vesselCode` (link them with useScopedPath()), fleet paths relative
 * to `/fleet`. Kept apart from routes.tsx so pages can import them without
 * the route table, and so the manifest, the router and the nav cannot drift.
 */

/** The vessel Crew tab's root, and the base its nav leaves are built on. */
export const CREW_ROOT = 'crew';

/** The personal area's root (the same `/me` as src/config/personalNav.ts PERSONAL_BASE). */
export const PERSONAL_ROOT = '/me';

/** Vessel crew pages, relative to `/v/:vesselCode`. */
export const CREW_PATHS = {
  list: `${CREW_ROOT}/list`,
  roster: `${CREW_ROOT}/roster`,
  compliance: `${CREW_ROOT}/compliance`,
  complianceStatus: `${CREW_ROOT}/compliance/status`,
  hoursOfRest: `${CREW_ROOT}/hours-of-rest`,
  personHoursOfRest: `${CREW_ROOT}/people/:crewId/hours-of-rest`,
  planner: `${CREW_ROOT}/planner`,
  plannerTimeline: `${CREW_ROOT}/planner/timeline`,
  plannerManning: `${CREW_ROOT}/planner/manning`,
  plannerRequests: `${CREW_ROOT}/planner/requests`,
  familiarisation: `${CREW_ROOT}/familiarisation`,
} as const;

/** Fleet crew pages, relative to `/fleet`. */
export const CREW_FLEET_PATHS = {
  planner: 'planner',
} as const;
