/**
 * Development (training) module manifest (BUILD-PLAN B8; gap/00 A2; gap/02
 * fleet training, gap/04 C62). Data only: the registry loads it eagerly, so
 * it imports nothing but icons, the nav builders, the slot ids and paths.
 *
 * - routes: Fleet › Training (`/fleet/training`) and the vessel's Crew
 *   Training (`/v/:vesselCode/crew/training`), both today's CrewTraining page.
 * - nav:
 *   - `fleet.people` Training at order 10;
 *   - `vessel.crew` Crew Training at order 70, closed per vessel by the
 *     `crew_training` module setting. This module owns the vessel page end to
 *     end (platform-prep plan §1, contract 2).
 *
 * - notificationTypes: the training application notification types and
 *   their emitters (platform-prep PP4; deferred until each emitter lands, D-238).
 *
 * Platform-prep PP3 moved the routes from src/routes/index.tsx and the leaves
 * from src/config/sitemap.ts unchanged.
 */
import { GraduationCap } from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import { L, LIVE } from '@/config/navBuilders';
import { FLEET_ROOT } from '@/modules/fleet/paths';
import { DEVELOPMENT_FLEET_PATHS, DEVELOPMENT_VESSEL_PATHS, VESSEL_CREW_ROOT } from './paths';

const manifest: ModuleManifest = {
  id: 'development',
  label: 'Training & Development',
  scopes: ['fleet', 'vessel'],
  routes: [
    {
      scope: 'fleet',
      path: DEVELOPMENT_FLEET_PATHS.training,
      page: () => import('@/modules/development/pages/CrewTraining'),
      guard: { kind: 'login' },
    },
    {
      scope: 'vessel',
      path: DEVELOPMENT_VESSEL_PATHS.crewTraining,
      page: () => import('@/modules/development/pages/CrewTraining'),
      guard: { kind: 'login' },
    },
  ],
  nav: [
    { slot: 'fleet.people', order: 10, node: L('Training', FLEET_ROOT, { icon: GraduationCap, ...LIVE }) },
    {
      slot: 'vessel.crew',
      order: 70,
      node: L('Crew Training', VESSEL_CREW_ROOT, { slug: 'training', icon: GraduationCap, moduleSetting: 'crew_training', ...LIVE }),
    },
  ],
  // Seeded by 20261124030100 (category Training; X5 PR-08). Each flips to
  // 'live' in the slice that lands its emitter, whose SQL test proves it (D-238).
  notificationTypes: [
    { key: 'training_application_action_needed', status: 'deferred', emitter: 'development_transition() (X5-07A)' },
    { key: 'training_application_updated', status: 'deferred', emitter: 'development_transition() (X5-07A)' },
    { key: 'training_applications_stale', status: 'deferred', emitter: 'fleet_ops_daily_sweep() on Mondays (X5-09)' },
  ],
};

export default manifest;
