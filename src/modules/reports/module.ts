/**
 * Reports module manifest (BUILD-PLAN B8; gap/00 A2; gap/02 fleet reports).
 * Data only: the registry loads it eagerly, so it imports nothing but icons,
 * the nav builders, the slot ids and paths.
 *
 * - routes: the reports overview at `/fleet/reports`, today's
 *   FleetReportsIndex page. The four legacy report pages under
 *   `/fleet/reports/…` stay platform routes in src/routes/index.tsx.
 * - nav: `fleet.overview` Reports at order 30.
 *
 * Platform-prep PP3 moved the route from src/routes/index.tsx and the leaf
 * from src/config/sitemap.ts unchanged.
 */
import { FileBarChart } from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import { L, LIVE } from '@/config/navBuilders';
import { FLEET_ROOT } from '@/modules/fleet/paths';
import { REPORTS_FLEET_PATHS } from './paths';

const manifest: ModuleManifest = {
  id: 'reports',
  label: 'Reports',
  scopes: ['fleet'],
  routes: [
    {
      scope: 'fleet',
      path: REPORTS_FLEET_PATHS.index,
      page: () => import('@/modules/dashboard/pages/FleetReportsIndex'),
      guard: { kind: 'login' },
    },
  ],
  nav: [{ slot: 'fleet.overview', order: 30, node: L('Reports', FLEET_ROOT, { icon: FileBarChart, ...LIVE }) }],
};

export default manifest;
