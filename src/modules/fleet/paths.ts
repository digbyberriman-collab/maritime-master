/**
 * Route paths for the Fleet operations module. Fleet paths are relative to
 * `/fleet`, vessel paths to `/v/:vesselCode`. Kept apart from the manifest
 * so pages can import them, and so the manifest, the router and the nav
 * cannot drift.
 */

/** The Fleet view's root (gap/10 IA7), the base its nav leaves are built on. */
export const FLEET_ROOT = '/fleet';

/** The vessel Crew tab's root, the base of the vessel Crew Medical leaf. */
export const VESSEL_CREW_ROOT = 'crew';
