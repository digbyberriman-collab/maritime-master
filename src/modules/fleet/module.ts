/**
 * Fleet operations module manifest (BUILD-PLAN B8; gap/00 A2; gap/02,
 * gap/04 C61). Data only: the registry loads it eagerly, so it imports
 * nothing but icons, the nav builders, the slot ids and its own paths.
 *
 * - routes: none yet. A leaf below goes live when this manifest registers a
 *   route at its path (src/config/navBuilders.ts resolveNavStatus).
 * - nav:
 *   - `fleet.people`: Medical, the fleet medical overview (planned).
 *   - `vessel.crew`: Crew Medical at order 60 (planned). This module owns the
 *     vessel page end to end (platform-prep plan §1, contract 1).
 *
 * Platform-prep PP3 moved both leaves from src/config/sitemap.ts unchanged.
 */
import { Stethoscope } from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import { L } from '@/config/navBuilders';
import { FLEET_ROOT, VESSEL_CREW_ROOT } from './paths';

const manifest: ModuleManifest = {
  id: 'fleet',
  label: 'Fleet operations',
  scopes: ['fleet', 'vessel'],
  nav: [
    { slot: 'fleet.people', order: 20, node: L('Medical', FLEET_ROOT, { icon: Stethoscope }) },
    { slot: 'vessel.crew', order: 60, node: L('Crew Medical', VESSEL_CREW_ROOT, { slug: 'medical', icon: Stethoscope }) },
  ],
};

export default manifest;
