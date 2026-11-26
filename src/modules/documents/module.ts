/**
 * Documents module manifest (BUILD-PLAN B8; gap/00 A2; gap/02 FD1-FD10,
 * gap/05). Data only: the registry loads it eagerly, so it imports nothing
 * but icons, the nav builders, the slot ids and paths.
 *
 * - routes:
 *   - `/fleet/documents`: the fleet document library (FleetDocumentsPage,
 *     X5-04A; gap/02 FD1, FD2, FD4, FD5, FD10), a lazy chunk. Guard: the
 *     capability `fleet.operations.fleet_documents.view` (ModuleRoute, fails
 *     closed; the page checks the same key before it reads anything).
 *   - `/fleet/documents/register`: the controlled register, today's
 *     Documents page unchanged. Guard `scope` (the Fleet scope's own check:
 *     signed in with fleet reach), so nobody who opens it today loses it
 *     (D-27). The legacy `/documents` and the old sample-data pages
 *     (`/documents/{manuals,policies,procedures}`) land here.
 * - nav:
 *   - `fleet.compliance` Documents at order 10, beta, with the library's key;
 *   - `vessel.safety` Fleet Documents at order 110 (planned), the documents
 *     the company publishes to the vessel (X5-05A).
 * - capabilities: the library's keys (./paths.ts DOCUMENTS_CAPS).
 * - notificationTypes: the fleet document notification types and their
 *   emitters (platform-prep PP4; deferred until each emitter lands, D-238).
 *
 * Platform-prep PP3 moved the routes from src/routes/index.tsx and the
 * leaves from src/config/sitemap.ts; X5-04A swapped in the library.
 */
import { FileText } from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import { L } from '@/config/navBuilders';
import { FLEET_ROOT } from '@/modules/fleet/paths';
import { DOCUMENTS_CAPABILITIES, DOCUMENTS_CAPS, DOCUMENTS_FLEET_PATHS, VESSEL_SAFETY_ROOT } from './paths';

const manifest: ModuleManifest = {
  id: 'documents',
  label: 'Documents',
  scopes: ['fleet', 'vessel'],
  routes: [
    {
      scope: 'fleet',
      path: DOCUMENTS_FLEET_PATHS.index,
      page: () => import('@/modules/documents/pages/FleetDocumentsPage'),
      guard: { kind: 'capability', capability: DOCUMENTS_CAPS.view },
      label: 'Fleet documents',
    },
    {
      scope: 'fleet',
      path: DOCUMENTS_FLEET_PATHS.register,
      page: () => import('@/modules/documents/pages/Documents'),
      guard: { kind: 'scope' },
      label: 'Controlled register',
    },
  ],
  nav: [
    {
      slot: 'fleet.compliance',
      order: 10,
      node: L('Documents', FLEET_ROOT, { icon: FileText, status: 'beta', capability: DOCUMENTS_CAPS.view }),
    },
    { slot: 'vessel.safety', order: 110, node: L('Fleet Documents', VESSEL_SAFETY_ROOT, { icon: FileText }) },
  ],
  capabilities: DOCUMENTS_CAPABILITIES,
  // Seeded by 20261124030100 (category Documents; X5 PR-08). Each flips to
  // 'live' in the slice that lands its emitter, whose SQL test proves it (D-238).
  notificationTypes: [
    { key: 'fleet_document_published', status: 'deferred', emitter: 'fleet_document_publish() (X5-05A)' },
    { key: 'fleet_document_ack_reminder', status: 'deferred', emitter: 'fleet_document_remind() (X5-05B)' },
    { key: 'fleet_document_ack_due_soon', status: 'deferred', emitter: 'fleet_ops_daily_sweep() through hr-daily-sweeper (X5-09)' },
    { key: 'fleet_document_ack_overdue', status: 'deferred', emitter: 'fleet_ops_daily_sweep() through hr-daily-sweeper (X5-09)' },
    { key: 'fleet_document_ack_digest', status: 'deferred', emitter: 'fleet_ops_daily_sweep() on Mondays (X5-09)' },
  ],
};

export default manifest;
