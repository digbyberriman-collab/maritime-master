/**
 * Fleet operations module manifest (BUILD-PLAN B8; gap/00 A2; gap/02,
 * gap/04 C61). Data only: the registry loads it eagerly, so it imports
 * nothing but icons, the nav builders, the slot ids and its own paths (no
 * page, no hook, no heavy library; the module's components and hooks are
 * reached through ./index.ts by the pages that use them).
 *
 * - routes: none yet. A leaf goes live when this manifest registers a route
 *   at its path (src/config/navBuilders.ts resolveNavStatus); X5-08 adds the
 *   fleet medical overview and the vessel Crew Medical page, as beta.
 * - nav:
 *   - `fleet.people`: Medical, the fleet medical overview (planned).
 *   - `vessel.crew`: Crew Medical at order 60 (planned). This module owns the
 *     vessel page end to end (platform-prep plan §1, contract 1).
 *   Planned leaves carry the capability their page will need, so they stay
 *   hidden from users who could not open the page.
 * - capabilities: the PMS keys the module's pages and actions use
 *   (./paths.ts FLEET_CAPS).
 *
 * Platform-prep PP3 moved both leaves from src/config/sitemap.ts; X5-01B
 * gave them their capabilities.
 */
import { Stethoscope } from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import { L } from '@/config/navBuilders';
import { FLEET_CAPABILITIES, FLEET_CAPS, FLEET_PATHS, FLEET_ROOT, VESSEL_CREW_ROOT } from './paths';

const manifest: ModuleManifest = {
  id: 'fleet',
  label: 'Fleet operations',
  scopes: ['fleet', 'vessel'],
  nav: [
    {
      slot: 'fleet.people',
      order: 20,
      node: L('Medical', FLEET_ROOT, { slug: FLEET_PATHS.medical, icon: Stethoscope, capability: FLEET_CAPS.medicalView }),
    },
    {
      slot: 'vessel.crew',
      order: 60,
      node: L('Crew Medical', VESSEL_CREW_ROOT, { slug: 'medical', icon: Stethoscope, capability: FLEET_CAPS.crewMedicalView }),
    },
  ],
  capabilities: FLEET_CAPABILITIES,
};

export default manifest;
