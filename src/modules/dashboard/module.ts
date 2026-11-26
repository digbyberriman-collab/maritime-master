/**
 * Dashboard module manifest (BUILD-PLAN B8; gap/00 A2; gap/02 fleet
 * dashboard). Data only: the registry loads it eagerly, so it imports
 * nothing but icons, the nav builders, the slot ids and paths.
 *
 * - routes: the fleet dashboard at `/fleet/dashboard` (the landing for fleet
 *   users, gap/01). The page is a lazy chunk now, so it no longer sits in the
 *   entry chunk. Guard `scope`: FleetScope's reach check guards it, as it
 *   did when the router mounted the page bare.
 * - nav: `fleet.overview` Dashboard at order 10.
 *
 * Platform-prep PP3 moved the route from src/routes/index.tsx and the leaf
 * from src/config/sitemap.ts unchanged.
 */
import { LayoutDashboard } from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import { L, LIVE } from '@/config/navBuilders';
import { FLEET_ROOT } from '@/modules/fleet/paths';
import { DASHBOARD_FLEET_PATHS } from './paths';

const manifest: ModuleManifest = {
  id: 'dashboard',
  label: 'Dashboard',
  scopes: ['fleet'],
  routes: [
    {
      scope: 'fleet',
      path: DASHBOARD_FLEET_PATHS.dashboard,
      page: () => import('@/modules/dashboard/pages/Dashboard'),
      guard: { kind: 'scope' },
    },
  ],
  nav: [{ slot: 'fleet.overview', order: 10, node: L('Dashboard', FLEET_ROOT, { icon: LayoutDashboard, ...LIVE }) }],
};

export default manifest;
