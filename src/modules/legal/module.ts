/**
 * Legal module manifest (BUILD-PLAN B8; gap/00 A2). The Legal workspace
 * stays at /departments/legal (R4) in its own department shell; /legal/* are
 * the public policy pages.
 *
 * - routes: ./routes.tsx (page loaders), mounted in the Legal workspace.
 * - nav: the Legal entry in the Fleet sidebar's WORKSPACES section. Legal has
 *   no sidebar tree: its tabs live in the Legal shell (./paths LEGAL_TABS).
 */
import { Scale } from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import { L } from '@/config/navBuilders';
import { LEGAL_ROOT } from './paths';
import { LEGAL_ROUTES } from './routes';

const manifest: ModuleManifest = {
  id: 'legal',
  label: 'Legal',
  scopes: ['workspace'],
  routes: LEGAL_ROUTES,
  nav: [
    {
      slot: 'fleet.workspaces',
      order: 40,
      // R4: Legal stays at /departments/legal; /legal/* are the policy pages.
      node: L('Legal', '/fleet', { existing: LEGAL_ROOT, icon: Scale, crossLink: true, scope: 'workspace' }),
    },
  ],
};

export default manifest;
