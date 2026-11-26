/**
 * Route paths for the documents module. Fleet paths are relative to
 * `/fleet`, vessel paths to `/v/:vesselCode`. Kept apart from the manifest
 * so pages can import them, and so the manifest, the router and the nav
 * cannot drift.
 */

/** Fleet pages, relative to `/fleet`. */
export const DOCUMENTS_FLEET_PATHS = {
  index: 'documents',
  /** The controlled document register, the target of the legacy `/documents`. */
  register: 'documents/register',
} as const;

/** The vessel Safety tab's root, the base of the vessel Fleet Documents leaf. */
export const VESSEL_SAFETY_ROOT = 'safety';
