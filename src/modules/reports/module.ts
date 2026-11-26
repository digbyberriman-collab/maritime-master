/**
 * Reports module manifest (BUILD-PLAN B8; gap/00 A2; gap/02 R1, R2;
 * DECISIONS C12, D-X5-11). Data only: the registry loads it eagerly, so it
 * imports nothing but icons, the nav builders, the slot ids and paths. The
 * report registry (./registry.ts) is not imported here: the pages read it,
 * so it never reaches the entry chunk.
 *
 * - routes:
 *   - `/fleet/reports`: the reports hub (pages/ReportsHubPage), a lazy chunk:
 *     current position, monthly trends and the grouped catalogue;
 *   - `/fleet/reports/:reportKey`: one report of the registry
 *     (pages/ReportPage), which checks the report's own capability.
 *   Both are guarded by `fleet.operations.fleet_reports.view` (ModuleRoute,
 *   fails closed; the pages check the same key before they read anything).
 *   The four legacy report pages under `/fleet/reports/…` stay platform
 *   routes in src/routes/index.tsx (a static segment outranks `:reportKey`).
 * - nav: `fleet.overview` Reports at order 30, beta, with the same key.
 * - capabilities: the PMS keys the module's pages use.
 *
 * Platform-prep PP3 moved the route from src/routes/index.tsx and the leaf
 * from src/config/sitemap.ts; X5-03A swapped in the hub and added the report
 * route.
 */
import { FileBarChart } from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import { L } from '@/config/navBuilders';
import { FLEET_ROOT } from '@/modules/fleet/paths';
import { REPORTS_CAPABILITIES, REPORTS_CAPS, REPORTS_FLEET_PATHS } from './paths';

const manifest: ModuleManifest = {
  id: 'reports',
  label: 'Reports',
  scopes: ['fleet'],
  routes: [
    {
      scope: 'fleet',
      path: REPORTS_FLEET_PATHS.index,
      page: () => import('@/modules/reports/pages/ReportsHubPage'),
      guard: { kind: 'capability', capability: REPORTS_CAPS.view },
      label: 'Fleet reports',
    },
    {
      scope: 'fleet',
      path: REPORTS_FLEET_PATHS.report,
      page: () => import('@/modules/reports/pages/ReportPage'),
      guard: { kind: 'capability', capability: REPORTS_CAPS.view },
      label: 'Fleet report',
    },
  ],
  nav: [
    {
      slot: 'fleet.overview',
      order: 30,
      node: L('Reports', FLEET_ROOT, { icon: FileBarChart, status: 'beta', capability: REPORTS_CAPS.view }),
    },
  ],
  capabilities: REPORTS_CAPABILITIES,
};

export default manifest;
