/**
 * Route paths for the dashboard module. Fleet paths are relative to
 * `/fleet`. Kept apart from the manifest so pages can import them, and so
 * the manifest, the router and the nav cannot drift.
 */

/** Fleet pages, relative to `/fleet`. */
export const DASHBOARD_FLEET_PATHS = {
  dashboard: 'dashboard',
} as const;
