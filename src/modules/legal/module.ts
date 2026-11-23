/**
 * Legal module manifest (BUILD-PLAN B8; gap/00 A2). The Legal workspace
 * stays at /departments/legal (R4) in its own department shell; /legal/* are
 * the public policy pages.
 *
 * - routes: ./routes.tsx (page loaders), mounted in the Legal workspace.
 * - nav:
 *   - `workspace.legal`: the Legal sidebar tree, its four tabs
 *     (./paths LEGAL_TABS; gap/10 Workspaces table, D-83). The Legal shell
 *     keeps the same tabs in-page below 1024 px, where the sidebar is a drawer.
 *   - `fleet.workspaces`: the Legal entry in the Fleet sidebar's WORKSPACES
 *     section, a cross-link into this workspace (it never claims its pages).
 */
import { CheckSquare, FileText, Inbox, LayoutDashboard, Scale, type LucideIcon } from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import { L, LIVE, inSlot } from '@/config/navBuilders';
import { LEGAL_ROOT, LEGAL_TABS, type LegalTabId } from './paths';
import { LEGAL_ROUTES } from './routes';

const TAB_ICONS: Record<LegalTabId, LucideIcon> = {
  dashboard: LayoutDashboard,
  requests: Inbox,
  documents: FileText,
  forms: CheckSquare,
};

const manifest: ModuleManifest = {
  id: 'legal',
  label: 'Legal',
  scopes: ['workspace'],
  routes: LEGAL_ROUTES,
  nav: [
    ...inSlot(
      'workspace.legal',
      LEGAL_TABS.map((tab) => L(tab.label, LEGAL_ROOT, { existing: tab.path, slug: tab.id, icon: TAB_ICONS[tab.id], ...LIVE })),
    ),
    {
      slot: 'fleet.workspaces',
      order: 40,
      // R4: Legal stays at /departments/legal; /legal/* are the policy pages.
      node: L('Legal', '/fleet', { existing: LEGAL_ROOT, icon: Scale, crossLink: true, scope: 'workspace' }),
    },
  ],
};

export default manifest;
