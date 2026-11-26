/**
 * Development (training) module manifest (BUILD-PLAN B8; gap/00 A2; gap/02
 * TR1–TR10, X1; gap/04 C62; D-X1-7; X5 spec §1, X5-07B). Data only: the
 * registry loads it eagerly, so it imports nothing but icons, the nav
 * builders, the slot ids and paths. Every page is a lazy chunk.
 *
 * - routes:
 *   - `/fleet/training` redirects to `/fleet/training/overview` (the query
 *     and hash are kept).
 *   - `/fleet/training/:tab`: Fleet › Training (FleetTrainingPage), one tab
 *     per segment: overview, by-vessel, applications, catalogue, settings.
 *     An unknown segment lands on the overview, in the page. Guard: the
 *     capability `fleet.operations.fleet_training.view` (ModuleRoute, fails
 *     closed; the page checks the same key before it reads anything).
 *     Registering it arms the legacy `/development/{admin,catalogue,
 *     applications,courses-register}` redirects (pendingTarget
 *     `/fleet/training/:tab`, PP3) for readers with fleet reach (D-27).
 *   - `/v/:vesselCode/crew/training`: the vessel's Crew Training register
 *     (CrewTraining) for the scope's vessel only, guard
 *     `vessel.crew.crew_training.view`. This module owns the vessel page end
 *     to end (D-X1-7, platform-prep plan §1 contract 2).
 * - nav:
 *   - `fleet.people` Training at order 10, beta, with the view key;
 *   - `vessel.crew` Crew Training at order 70, beta, with the vessel key,
 *     closed per vessel by the `crew_training` module setting.
 * - capabilities: ./paths.ts DEVELOPMENT_CAPABILITIES.
 * - notificationTypes: the training application notification types and
 *   their emitters (platform-prep PP4; D-238): the two transition types are
 *   live from X5-07A, the stale digest waits for X5-09.
 *
 * Platform-prep PP3 moved the routes from src/routes/index.tsx and the leaves
 * from src/config/sitemap.ts; X5-07B swapped in the fleet page, the guards
 * and the beta status.
 */
import { GraduationCap } from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import { L } from '@/config/navBuilders';
import { FLEET_ROOT } from '@/modules/fleet/paths';
import {
  DEVELOPMENT_CAPABILITIES,
  DEVELOPMENT_FLEET_PATHS,
  DEVELOPMENT_VESSEL_PATHS,
  FLEET_TRAINING_ROOT,
  FLEET_TRAINING_TABS,
  TRAINING_CAPS,
  VESSEL_CREW_ROOT,
  VESSEL_CREW_TRAINING_CAPS,
} from './paths';

const manifest: ModuleManifest = {
  id: 'development',
  label: 'Training & Development',
  scopes: ['fleet', 'vessel'],
  routes: [
    // Relative to the route: /fleet/training → /fleet/training/overview.
    { scope: 'fleet', path: DEVELOPMENT_FLEET_PATHS.training, redirectTo: FLEET_TRAINING_TABS[0] },
    {
      scope: 'fleet',
      path: DEVELOPMENT_FLEET_PATHS.trainingTab,
      page: () => import('@/modules/development/pages/FleetTrainingPage'),
      guard: { kind: 'capability', capability: TRAINING_CAPS.view },
      label: 'Fleet training',
    },
    {
      scope: 'vessel',
      path: DEVELOPMENT_VESSEL_PATHS.crewTraining,
      page: () => import('@/modules/development/pages/CrewTraining'),
      guard: { kind: 'capability', capability: VESSEL_CREW_TRAINING_CAPS.view },
      label: 'Crew training',
    },
  ],
  nav: [
    {
      slot: 'fleet.people',
      order: 10,
      node: L('Training', FLEET_ROOT, { icon: GraduationCap, slug: FLEET_TRAINING_ROOT, status: 'beta', capability: TRAINING_CAPS.view }),
    },
    {
      slot: 'vessel.crew',
      order: 70,
      node: L('Crew Training', VESSEL_CREW_ROOT, {
        slug: 'training',
        icon: GraduationCap,
        moduleSetting: 'crew_training',
        status: 'beta',
        capability: VESSEL_CREW_TRAINING_CAPS.view,
      }),
    },
  ],
  capabilities: DEVELOPMENT_CAPABILITIES,
  // Seeded by 20261124030100 (category Training; X5 PR-08). Each flips to
  // 'live' in the slice that lands its emitter, whose SQL test proves it (D-238):
  // development_transition() emits both through development_application_notify()
  // (20261124040600; supabase/tests/sql/fleet/training_transitions.test.sql).
  notificationTypes: [
    { key: 'training_application_action_needed', status: 'live', emitter: 'development_transition() (X5-07A)' },
    { key: 'training_application_updated', status: 'live', emitter: 'development_transition() (X5-07A)' },
    { key: 'training_applications_stale', status: 'deferred', emitter: 'fleet_ops_daily_sweep() on Mondays (X5-09)' },
  ],
};

export default manifest;
