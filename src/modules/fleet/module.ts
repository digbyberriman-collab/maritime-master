/**
 * Fleet operations module manifest (BUILD-PLAN B8; gap/00 A2; gap/02 M1,
 * X1; gap/04 C61; D-X1-7). Data only: the registry loads it eagerly, so it
 * imports nothing but icons, the nav builders, the slot ids and its own
 * paths (no page, no hook, no heavy library; every page is a lazy chunk,
 * and the module's components and hooks are reached through ./index.ts by
 * the pages that use them).
 *
 * - routes:
 *   - `/fleet/medical`: Fleet › Medical (FleetMedicalPage), the crew medical
 *     grid for the vessels shown. Guard: the capability
 *     `fleet.operations.fleet_medical.view` (ModuleRoute, fails closed; the
 *     page checks the same key before it reads anything).
 *   - `/v/:vesselCode/crew/medical`: the vessel's Crew Medical page
 *     (VesselCrewMedicalPage, the same grid for the scope's vessel), guard
 *     `vessel.crew.crew_medical.view`. This module owns the vessel page end
 *     to end (platform-prep plan §1, contract 1; X1-12 dropped).
 * - nav (each leaf beta, gated by its page's key):
 *   - `fleet.people`: Medical at order 20;
 *   - `vessel.crew`: Crew Medical at order 60 (under the vessel's Crew
 *     module setting).
 * - capabilities: the PMS keys the module's pages and actions use
 *   (./paths.ts FLEET_CAPS).
 *
 * Platform-prep PP3 moved both leaves from src/config/sitemap.ts; X5-01B
 * gave them their capabilities; X5-08 registered the pages and made the
 * leaves beta.
 */
import { Stethoscope } from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import { L } from '@/config/navBuilders';
import { FLEET_CAPABILITIES, FLEET_CAPS, FLEET_PATHS, FLEET_ROOT, FLEET_VESSEL_PATHS, VESSEL_CREW_ROOT } from './paths';

const manifest: ModuleManifest = {
  id: 'fleet',
  label: 'Fleet operations',
  scopes: ['fleet', 'vessel'],
  routes: [
    {
      scope: 'fleet',
      path: FLEET_PATHS.medical,
      page: () => import('@/modules/fleet/pages/FleetMedicalPage'),
      guard: { kind: 'capability', capability: FLEET_CAPS.medicalView },
      label: 'Fleet medical',
    },
    {
      scope: 'vessel',
      path: FLEET_VESSEL_PATHS.crewMedical,
      page: () => import('@/modules/fleet/pages/VesselCrewMedicalPage'),
      guard: { kind: 'capability', capability: FLEET_CAPS.crewMedicalView },
      label: 'Crew medical',
    },
  ],
  nav: [
    {
      slot: 'fleet.people',
      order: 20,
      node: L('Medical', FLEET_ROOT, { slug: FLEET_PATHS.medical, icon: Stethoscope, status: 'beta', capability: FLEET_CAPS.medicalView }),
    },
    {
      slot: 'vessel.crew',
      order: 60,
      node: L('Crew Medical', VESSEL_CREW_ROOT, { slug: 'medical', icon: Stethoscope, status: 'beta', capability: FLEET_CAPS.crewMedicalView }),
    },
  ],
  capabilities: FLEET_CAPABILITIES,
};

export default manifest;
