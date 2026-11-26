/**
 * Route paths and capability keys for the reports module. Fleet paths are
 * relative to `/fleet`. Kept apart from the manifest so pages can import
 * them, and so the manifest, the router and the nav cannot drift.
 */
import type { CapabilityKey } from '@/lib/permissions/types';

/** Fleet pages, relative to `/fleet`. */
export const REPORTS_FLEET_PATHS = {
  /** The reports hub (gap/02 R1): current position, trends and the catalogue. */
  index: 'reports',
  /**
   * One report of the registry (C12, D-X5-11). The four legacy report pages
   * stay static routes under `reports/…` in src/routes/index.tsx; a static
   * segment outranks `:reportKey`.
   */
  report: 'reports/:reportKey',
} as const;

/** The fleet reports root, absolute (links from other modules). */
export const FLEET_REPORTS_ROOT = '/fleet/reports';

/** The PMS keys the reports pages and actions use (X5 spec §1; PP1). */
export const REPORTS_CAPS = {
  /** The hub and every report page (the route guard). */
  view: 'fleet.operations.fleet_reports.view',
  /** Exporting a report (CSV, Excel, PDF). */
  export: 'fleet.operations.fleet_reports.export',
} as const satisfies Record<string, CapabilityKey>;

/** Every key the reports manifest declares (ModuleManifest.capabilities). */
export const REPORTS_CAPABILITIES: readonly CapabilityKey[] = Object.values(REPORTS_CAPS);
