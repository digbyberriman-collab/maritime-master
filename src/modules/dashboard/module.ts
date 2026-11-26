/**
 * Dashboard module manifest (BUILD-PLAN B8; gap/00 A2; gap/02 fleet
 * dashboard). Data only: the registry loads it eagerly, so it imports
 * nothing but icons, the nav builders, the slot ids and paths.
 *
 * - routes: the fleet dashboard at `/fleet/dashboard` (the landing for fleet
 *   users, gap/01): FleetDashboardPage (X5-02A; gap/02 D1, D3, D4, D6, D7),
 *   a lazy chunk. Guard: the capability `fleet.operations.fleet_dashboard.view`
 *   (ModuleRoute, fails closed; the page checks the same key before it reads
 *   anything). The old generic widget page (pages/Dashboard.tsx) is no
 *   longer routed; `/dpa-dashboard` keeps DPADashboard as its legacy page.
 * - nav: `fleet.overview` Dashboard at order 10, beta, with the same key.
 * - capabilities: the PMS keys the module's pages use.
 *
 * Platform-prep PP3 moved the route from src/routes/index.tsx and the leaf
 * from src/config/sitemap.ts; X5-02A swapped in the fleet dashboard page.
 */
import { LayoutDashboard } from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import type { CapabilityKey } from '@/lib/permissions/types';
import { L } from '@/config/navBuilders';
import { FLEET_ROOT } from '@/modules/fleet/paths';
import { DASHBOARD_FLEET_PATHS } from './paths';

/** The fleet dashboard's gate (lib/fleetKpiRules.ts FLEET_DASHBOARD_VIEW is the same key; the wiring test pins it). */
const FLEET_DASHBOARD_VIEW: CapabilityKey = 'fleet.operations.fleet_dashboard.view';

const manifest: ModuleManifest = {
  id: 'dashboard',
  label: 'Dashboard',
  scopes: ['fleet'],
  routes: [
    {
      scope: 'fleet',
      path: DASHBOARD_FLEET_PATHS.dashboard,
      page: () => import('@/modules/dashboard/pages/FleetDashboardPage'),
      guard: { kind: 'capability', capability: FLEET_DASHBOARD_VIEW },
      label: 'Fleet dashboard',
    },
  ],
  nav: [
    {
      slot: 'fleet.overview',
      order: 10,
      node: L('Dashboard', FLEET_ROOT, { icon: LayoutDashboard, status: 'beta', capability: FLEET_DASHBOARD_VIEW }),
    },
  ],
  capabilities: [FLEET_DASHBOARD_VIEW],
};

export default manifest;
