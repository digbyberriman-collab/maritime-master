/**
 * Route paths for the reports module. Fleet paths are relative to `/fleet`.
 * Kept apart from the manifest so pages can import them, and so the
 * manifest, the router and the nav cannot drift.
 */

/** Fleet pages, relative to `/fleet`. */
export const REPORTS_FLEET_PATHS = {
  /** The reports overview (gap/02): links every fleet report, risk overview included. */
  index: 'reports',
} as const;
