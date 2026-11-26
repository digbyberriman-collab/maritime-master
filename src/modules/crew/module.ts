/**
 * Crew module manifest (BUILD-PLAN B8; gap/00 A2; gap/04). Data only: the
 * registry loads it eagerly, so it imports nothing but icons, the nav
 * builders, the slot ids and its own paths and routes.
 *
 * - routes: ./routes.tsx, the vessel Crew pages (relative to `/v/:vesselCode`)
 *   and the fleet planner. The routed crew profile (crew/people/:profileId,
 *   X1-03) has no nav leaf: it opens from the crew list's View profile. Nor
 *   has Add crew member (crew/new, X1-03B): it opens from the list's Add crew.
 * - nav:
 *   - `vessel.crew`: the Crew tab's sidebar, at the X1 spec §4 orders (Crew
 *     List 10, Planner 20, Crew Compliance 30, Hours of Rest 40,
 *     Familiarisation 80, …). Crew Medical (60) comes from the fleet
 *     operations manifest and Crew Training (70) from development's
 *     (platform-prep plan §1), so this module never uses those two orders.
 *     X1-02 folded the roster into the Crew List (beta, behind
 *     vessel.crew.crew_list.view); crew/roster redirects to it, and its
 *     leaf is gone.
 *     There is no Dashboard leaf yet: a planned leaf at the module root
 *     would turn today's crew -> crew/list redirect into a Coming Soon page
 *     (X1-10B adds it as beta with its page).
 *   - `personal.my_work`: the user's own documents at /me/documents (X1-04B,
 *     PR-X1-J: beta behind vessel.crew.crew_certificates.view_own; the leaf
 *     is no longer planned, so its Coming Soon route is gone by itself).
 *   Moved leaves keep `live` and exactly today's gates (D-X1-25): the slice
 *   that swaps in a leaf's page sets its §4 capability and status beta.
 *   Planned leaves carry their capability now.
 * - capabilities: the PMS keys the crew pages and actions use (X1 spec §5,
 *   less the crew medical key X5 owns; platform-prep plan §1).
 * - notificationTypes: the crew notification types and their emitters
 *   (platform-prep PP4; deferred until each emitter lands, D-238).
 *
 * Platform-prep PP3 moved the routes and leaves here from
 * src/config/sitemap.ts and src/routes/index.tsx unchanged; X1-01 set the
 * §4 orders (same sequence as before) and the planned leaves' gates.
 */
import {
  Briefcase, CheckSquare, ClipboardCheck, Clock, FileCheck, FileText, Network, ShieldCheck, UserCheck, Users,
} from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import { L, LIVE } from '@/config/navBuilders';
import { CREW_CAPABILITIES, CREW_CAPS, CREW_ROOT, PERSONAL_ROOT } from './paths';
import { CREW_ROUTES } from './routes';

const manifest: ModuleManifest = {
  id: 'crew',
  label: 'Crew',
  scopes: ['vessel', 'fleet', 'personal'],
  routes: CREW_ROUTES,
  nav: [
    // X1-02: one list (the roster folded in), beta behind its capability (X1 spec §4).
    {
      slot: 'vessel.crew',
      order: 10,
      node: L('Crew List', CREW_ROOT, { slug: 'list', icon: Users, status: 'beta', capability: CREW_CAPS.crewListView }),
    },
    // Label "Leave" on vessels that rename it (vessel_module_settings).
    { slot: 'vessel.crew', order: 20, node: L('Planner', CREW_ROOT, { icon: Network, moduleSetting: 'planner', ...LIVE }) },
    { slot: 'vessel.crew', order: 30, node: L('Crew Compliance', CREW_ROOT, { slug: 'compliance', icon: ShieldCheck, ...LIVE }) },
    // One crew member's month (`crew/people/:crewId/hours-of-rest`, the target
    // of the legacy /crew/work-rest/:crewId) is an Hours of Rest page too: the
    // crew_hor setting closes it with the overview (gap/10 W4, D-63).
    {
      slot: 'vessel.crew',
      order: 40,
      node: {
        ...L('Hours of Rest', CREW_ROOT, { icon: Clock, moduleSetting: 'crew_hor', ...LIVE }),
        alsoCovers: ['crew/people/*/hours-of-rest'],
      },
    },
    { slot: 'vessel.crew', order: 80, node: L('Familiarisation', CREW_ROOT, { icon: FileCheck, ...LIVE }) },
    // Planned (Coming Soon until their slice): each carries the capability its page will need.
    { slot: 'vessel.crew', order: 90, node: L('Checklists', CREW_ROOT, { icon: CheckSquare }) },
    {
      slot: 'vessel.crew',
      order: 100,
      node: L('Performance Appraisals', CREW_ROOT, { slug: 'appraisals', icon: ClipboardCheck, capability: 'hris.performance.annual_evaluations.view' }),
    },
    {
      slot: 'vessel.crew',
      order: 110,
      node: L('Visitors & Occasional Workers', CREW_ROOT, { slug: 'visitors', icon: UserCheck, capability: 'vessel.crew.crew_list.view' }),
    },
    {
      slot: 'vessel.crew',
      order: 120,
      node: L('Employment History', CREW_ROOT, { icon: Briefcase, capability: 'hris.employee_records.contracts_employment.view' }),
    },
    // X1-04B (PR-X1-J): the person's own documents at /me/documents, beta behind view_own.
    {
      slot: 'personal.my_work',
      order: 40,
      node: L('Documents', PERSONAL_ROOT, { icon: FileText, status: 'beta', capability: CREW_CAPS.documentsViewOwn }),
    },
  ],
  capabilities: CREW_CAPABILITIES,
  // Seeded by 20261124030100 (category Crew; PR-X1-E). Each flips to 'live'
  // in the slice that lands its emitter, whose SQL test proves it (D-238).
  notificationTypes: [
    { key: 'crew_document_review_needed', status: 'deferred', emitter: 'crew_certificates_review_notify() trigger (X1-05)' },
    { key: 'crew_document_decided', status: 'deferred', emitter: 'crew_document_verify() (X1-05)' },
    { key: 'crew_document_expiring', status: 'deferred', emitter: 'crew_document_expiry_sweep() through hr-daily-sweeper (X1-05)' },
    { key: 'hor_reminder', status: 'deferred', emitter: 'work_rest_remind() and work_rest_send_due_reminders() (X1-08)' },
    { key: 'hor_serious_breach', status: 'deferred', emitter: 'work_rest_serious_breach_notify() trigger (X1-08)' },
    { key: 'hor_breach_report', status: 'deferred', emitter: 'work_rest_breach_report_create() (X1-08)' },
    { key: 'hor_correction_requested', status: 'deferred', emitter: 'work_rest_review_breach() (X1-08)' },
    { key: 'familiarisation_assigned', status: 'deferred', emitter: 'familiarisation_open_required() (X1-10)' },
    { key: 'crew_transfer_submitted', status: 'deferred', emitter: 'transfer_crew_submit() (X1-11)' },
    { key: 'crew_transfer_completed', status: 'deferred', emitter: 'transfer_crew() (X1-11)' },
    { key: 'crew_employment_ended', status: 'deferred', emitter: 'crew_end_employment() (X1-11)' },
  ],
};

export default manifest;
