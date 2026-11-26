/**
 * Documents module manifest (BUILD-PLAN B8; gap/00 A2; gap/02, gap/05).
 * Data only: the registry loads it eagerly, so it imports nothing but icons,
 * the nav builders, the slot ids and paths.
 *
 * - routes: `/fleet/documents` and `/fleet/documents/register`, both today's
 *   Documents page. The register is where the legacy `/documents` and the
 *   old sample-data pages (`/documents/{manuals,policies,procedures}`) land.
 * - nav:
 *   - `fleet.compliance` Documents at order 10;
 *   - `vessel.safety` Fleet Documents at order 110 (planned), the documents
 *     the company publishes to the vessel.
 *
 * Platform-prep PP3 moved the route from src/routes/index.tsx and the leaves
 * from src/config/sitemap.ts unchanged.
 */
import { FileText } from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import { L, LIVE } from '@/config/navBuilders';
import { FLEET_ROOT } from '@/modules/fleet/paths';
import { DOCUMENTS_FLEET_PATHS, VESSEL_SAFETY_ROOT } from './paths';

const manifest: ModuleManifest = {
  id: 'documents',
  label: 'Documents',
  scopes: ['fleet', 'vessel'],
  routes: [
    {
      scope: 'fleet',
      path: DOCUMENTS_FLEET_PATHS.index,
      page: () => import('@/modules/documents/pages/Documents'),
      guard: { kind: 'login' },
    },
    {
      scope: 'fleet',
      path: DOCUMENTS_FLEET_PATHS.register,
      page: () => import('@/modules/documents/pages/Documents'),
      guard: { kind: 'login' },
    },
  ],
  nav: [
    { slot: 'fleet.compliance', order: 10, node: L('Documents', FLEET_ROOT, { icon: FileText, ...LIVE }) },
    { slot: 'vessel.safety', order: 110, node: L('Fleet Documents', VESSEL_SAFETY_ROOT, { icon: FileText }) },
  ],
};

export default manifest;
