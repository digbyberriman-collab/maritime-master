/**
 * Documents module manifest (BUILD-PLAN B8; gap/00 A2; gap/02 FD1-FD10,
 * gap/05). Data only: the registry loads it eagerly, so it imports nothing
 * but icons, the nav builders, the slot ids and paths.
 *
 * - routes:
 *   - `/fleet/documents`: the fleet document library (FleetDocumentsPage,
 *     X5-04A; gap/02 FD1, FD2, FD4, FD5, FD10), a lazy chunk. Guard: the
 *     capability `fleet.operations.fleet_documents.view` (ModuleRoute, fails
 *     closed; the page checks the same key before it reads anything). Its
 *     `?tab=acknowledgements` (X5-05B; gap/02 FD6, FD7) is the target of the
 *     legacy `/acknowledgments` redirect for readers with fleet reach.
 *   - `/fleet/documents/register`: the controlled register, today's
 *     Documents page unchanged. Guard `scope` (the Fleet scope's own check:
 *     signed in with fleet reach), so nobody who opens it today loses it
 *     (D-27). The legacy `/documents` and the old sample-data pages
 *     (`/documents/{manuals,policies,procedures}`) land here.
 *   - `/v/:vesselCode/safety/fleet-documents`: the documents the company
 *     publishes to the vessel, to open and acknowledge
 *     (VesselFleetDocumentsPage, X5-05A; gap/02 FD9), a lazy chunk. Guard:
 *     `vessel.safety.fleet_documents.view_own` (signed in; the server
 *     answers only for vessels the caller reaches). Registering it
 *     activates the armed legacy redirects of `/acknowledgments` and
 *     `/crew/acknowledgements` (pendingTarget). Its `?view=crew` (X5-05B;
 *     gap/02 FD6, FD7, FD8) is the Master's and heads of department's crew
 *     view: witnessed acknowledgements, reminders, who can sign.
 * - nav:
 *   - `fleet.compliance` Documents at order 10, beta, with the library's key;
 *   - `vessel.safety` Fleet Documents at order 110, beta, with the vessel
 *     page's key.
 * - capabilities: the library's keys (admin chooses who can sign on any
 *   vessel, X5-05B) and the vessel page's (./paths.ts DOCUMENTS_CAPS,
 *   VESSEL_FLEET_DOCUMENTS_CAPS).
 * - notificationTypes: the fleet document notification types and their
 *   emitters (platform-prep PP4; D-238), all live:
 *   - fleet_document_published and fleet_document_ack_reminder: emitted in
 *     20261124040400, proved by fleet/documents_acks.test.sql (the manual
 *     reminder is sent from the Remind dialogs of X5-05B);
 *   - fleet_document_ack_due_soon, fleet_document_ack_overdue and (Mondays)
 *     fleet_document_ack_digest: emitted by fleet_ops_daily_sweep() in
 *     20261124040800 (X5-09), run daily by hr-daily-sweeper, proved by
 *     fleet/daily_sweep.test.sql.
 *
 * Platform-prep PP3 moved the routes from src/routes/index.tsx and the
 * leaves from src/config/sitemap.ts; X5-04A swapped in the library.
 */
import { FileText } from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import { L } from '@/config/navBuilders';
import { FLEET_ROOT } from '@/modules/fleet/paths';
import {
  DOCUMENTS_CAPABILITIES,
  DOCUMENTS_CAPS,
  DOCUMENTS_FLEET_PATHS,
  DOCUMENTS_VESSEL_PATHS,
  VESSEL_FLEET_DOCUMENTS_CAPS,
  VESSEL_SAFETY_ROOT,
} from './paths';

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
    {
      scope: 'vessel',
      path: DOCUMENTS_VESSEL_PATHS.fleetDocuments,
      page: () => import('@/modules/documents/pages/VesselFleetDocumentsPage'),
      guard: { kind: 'capability', capability: VESSEL_FLEET_DOCUMENTS_CAPS.viewOwn },
      label: 'Fleet documents',
    },
  ],
  nav: [
    {
      slot: 'fleet.compliance',
      order: 10,
      node: L('Documents', FLEET_ROOT, { icon: FileText, status: 'beta', capability: DOCUMENTS_CAPS.view }),
    },
    {
      slot: 'vessel.safety',
      order: 110,
      node: L('Fleet Documents', VESSEL_SAFETY_ROOT, { icon: FileText, status: 'beta', capability: VESSEL_FLEET_DOCUMENTS_CAPS.viewOwn }),
    },
  ],
  capabilities: DOCUMENTS_CAPABILITIES,
  // Seeded by 20261124030100 (category Documents; X5 PR-08). Each flips to
  // 'live' in the slice that lands its emitter, whose SQL test proves it (D-238).
  notificationTypes: [
    { key: 'fleet_document_published', status: 'live', emitter: 'fleet_documents_after_publish() on fleet_document_publish() (X5-05A)' },
    { key: 'fleet_document_ack_reminder', status: 'live', emitter: 'fleet_document_remind() from the Remind dialogs of the Acknowledgements tab and the vessel crew view (X5-05B)' },
    { key: 'fleet_document_ack_due_soon', status: 'live', emitter: 'fleet_ops_daily_sweep() through hr-daily-sweeper: due in three days (X5-09)' },
    { key: 'fleet_document_ack_overdue', status: 'live', emitter: 'fleet_ops_daily_sweep() through hr-daily-sweeper: to the person and their Master / HoD (X5-09)' },
    { key: 'fleet_document_ack_digest', status: 'live', emitter: 'fleet_ops_daily_sweep() on Mondays, to the documents editors (X5-09)' },
  ],
};

export default manifest;
