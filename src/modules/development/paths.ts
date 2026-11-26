/**
 * Route paths for the development (training) module. Fleet paths are
 * relative to `/fleet`, vessel paths to `/v/:vesselCode`. Kept apart from
 * the manifest so pages can import them, and so the manifest, the router
 * and the nav cannot drift.
 */

/** Fleet pages, relative to `/fleet`. */
export const DEVELOPMENT_FLEET_PATHS = {
  training: 'training',
} as const;

/** The vessel Crew tab's root, the base of the vessel Crew Training leaf. */
export const VESSEL_CREW_ROOT = 'crew';

/** Vessel pages, relative to `/v/:vesselCode`. */
export const DEVELOPMENT_VESSEL_PATHS = {
  crewTraining: `${VESSEL_CREW_ROOT}/training`,
} as const;
