/**
 * Forms & Checklists module manifest (BUILD-PLAN B8; gap/00 A2; gap/02).
 * Data only: the registry loads it eagerly, so it imports nothing but icons,
 * the nav builders, the slot ids and paths.
 *
 * - routes: none yet. The leaf goes live when this manifest registers a
 *   route at its path (src/config/navBuilders.ts resolveNavStatus).
 * - nav: `fleet.compliance` Forms & Checklists at order 20 (planned).
 *
 * Platform-prep PP3 moved the leaf from src/config/sitemap.ts unchanged.
 */
import { CheckSquare } from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import { L } from '@/config/navBuilders';
import { FLEET_ROOT } from '@/modules/fleet/paths';
import { FORMS_FLEET_ROOT } from './paths';

const manifest: ModuleManifest = {
  id: 'forms',
  label: 'Forms & Checklists',
  scopes: ['fleet'],
  nav: [{ slot: 'fleet.compliance', order: 20, node: L('Forms & Checklists', FLEET_ROOT, { icon: CheckSquare, slug: FORMS_FLEET_ROOT }) }],
};

export default manifest;
