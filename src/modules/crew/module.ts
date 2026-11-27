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
 *     leaf is gone. X1-06B rebuilt Crew Compliance (beta, behind
 *     vessel.crew.crew_compliance.view; crew/compliance/:tab). X1-09B
 *     rebuilt the Planner (beta, behind vessel.crew.crew_scheduling.view;
 *     crew/planner/:tab with Timeline, Manning, Requests, Configuration).
 *     X1-08
 *     rebuilt Hours of Rest as the vessel board (beta, behind
 *     vessel.crew.hours_of_rest.approve); X1-08B added its report at
 *     crew/hours-of-rest/report (behind vessel.crew.hours_of_rest.view),
 *     a page under the same leaf, with no leaf of its own. X1-10 rebuilt
 *     Familiarisation (beta, behind vessel.crew.familiarisation.view); a
 *     record at crew/familiarisation/:recordId is a page under its leaf.
 *     X1-11B rebuilt Employment History (beta, behind
 *     hris.employee_records.contracts_employment.view;
 *     crew/employment-history?dept=), with Re-hire into Add crew.
 *     X1-10B added the Dashboard leaf at order 5 (beta, behind
 *     vessel.crew.crew_list.view) with its page at the module root, crew:
 *     the crew dashboard (KPI tiles, Action required, Onboarding, Hours of
 *     rest and Documents cards). The site map's generated crew -> crew/list
 *     redirect gives way to the manifest route (PR-X1-A part 3, PP3); the
 *     leaf lights up only on crew itself, never on the pages under it.
 *   - `personal.my_work`: the user's own documents at /me/documents (X1-04B,
 *     PR-X1-J: beta behind vessel.crew.crew_certificates.view_own; the leaf
 *     is no longer planned, so its Coming Soon route is gone by itself).
 *   Moved leaves keep `live` and exactly today's gates (D-X1-25): the slice
 *   that swaps in a leaf's page sets its §4 capability and status beta.
 *   Planned leaves carry their capability now.
 * - capabilities: the PMS keys the crew pages and actions use (X1 spec §5,
 *   less the crew medical key X5 owns; platform-prep plan §1).
 * - notificationTypes: the crew notification types and their emitters
 *   (platform-prep PP4; deferred until each emitter lands, D-238). The three
 *   crew document types are live from X1-05 (review needed, decided,
 *   expiring), the four hours-of-rest types from X1-08 (reminder, serious
 *   breach, breach report, correction requested). hor_breach_report links
 *   to the report page X1-08B serves (`crew/hours-of-rest/report?year=&report=`).
 *   The transfer and employment types are live from X1-11 (submitted,
 *   completed, employment ended); crew_transfer_submitted links to the
 *   person's profile with `?transfer=<id>`, which opens the transfer wizard.
 *
 * Platform-prep PP3 moved the routes and leaves here from
 * src/config/sitemap.ts and src/routes/index.tsx unchanged; X1-01 set the
 * §4 orders (same sequence as before) and the planned leaves' gates.
 */
import {
  Briefcase, CheckSquare, ClipboardCheck, Clock, FileCheck, FileText, LayoutDashboard, Network, ShieldCheck, UserCheck, Users,
} from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import { L } from '@/config/navBuilders';
import { CREW_CAPABILITIES, CREW_CAPS, CREW_ROOT, PERSONAL_ROOT } from './paths';
import { CREW_ROUTES } from './routes';

const manifest: ModuleManifest = {
  id: 'crew',
  label: 'Crew',
  scopes: ['vessel', 'fleet', 'personal'],
  routes: CREW_ROUTES,
  nav: [
    // X1-10B: the vessel crew dashboard at the module root (crew), beta behind crew list view (X1 spec §4).
    {
      slot: 'vessel.crew',
      order: 5,
      node: L('Dashboard', CREW_ROOT, { existing: CREW_ROOT, icon: LayoutDashboard, status: 'beta', capability: CREW_CAPS.crewListView }),
    },
    // X1-02: one list (the roster folded in), beta behind its capability (X1 spec §4).
    {
      slot: 'vessel.crew',
      order: 10,
      node: L('Crew List', CREW_ROOT, { slug: 'list', icon: Users, status: 'beta', capability: CREW_CAPS.crewListView }),
    },
    // X1-09B: the planner (Timeline, Manning, Requests, Configuration), beta behind crew scheduling view.
    // Label "Leave" on vessels that rename it (vessel_module_settings).
    {
      slot: 'vessel.crew',
      order: 20,
      node: L('Planner', CREW_ROOT, { icon: Network, moduleSetting: 'planner', status: 'beta', capability: CREW_CAPS.schedulingView }),
    },
    // X1-06B: the requirement-driven compliance page (status matrix and configuration), beta behind its capability.
    {
      slot: 'vessel.crew',
      order: 30,
      node: L('Crew Compliance', CREW_ROOT, { slug: 'compliance', icon: ShieldCheck, status: 'beta', capability: CREW_CAPS.complianceView }),
    },
    // X1-08: the vessel hours-of-rest board, beta behind hours_of_rest.approve
    // (crew members reach their own month at /me/hours-of-rest). One crew
    // member's month is the crew profile's Hours of rest tab
    // (`crew/people/:profileId/hours-of-rest`, X1-07B; also the target of the
    // legacy /crew/work-rest/:crewId). It is an Hours of Rest page too: the
    // crew_hor setting closes it with the board (gap/10 W4, D-63).
    {
      slot: 'vessel.crew',
      order: 40,
      node: {
        ...L('Hours of Rest', CREW_ROOT, { icon: Clock, moduleSetting: 'crew_hor', status: 'beta', capability: CREW_CAPS.horApprove }),
        alsoCovers: ['crew/people/*/hours-of-rest'],
      },
    },
    // X1-10: familiarisation per vessel and position (templates, forms, sign-off), beta behind its capability.
    // A record (crew/familiarisation/:recordId) is a page under the same leaf.
    {
      slot: 'vessel.crew',
      order: 80,
      node: L('Familiarisation', CREW_ROOT, { icon: FileCheck, status: 'beta', capability: CREW_CAPS.famView }),
    },
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
    // X1-11B: the vessel's employment history (ended assignments, re-hire), beta behind contracts and employment view.
    {
      slot: 'vessel.crew',
      order: 120,
      node: L('Employment History', CREW_ROOT, { icon: Briefcase, status: 'beta', capability: CREW_CAPS.employmentView }),
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
    // Live from X1-05 (20261124060500; its SQL test proves each emitter).
    { key: 'crew_document_review_needed', status: 'live', emitter: 'crew_certificates_review_notify() trigger (X1-05)' },
    { key: 'crew_document_decided', status: 'live', emitter: 'crew_document_verify() (X1-05)' },
    { key: 'crew_document_expiring', status: 'live', emitter: 'crew_document_expiry_sweep() through hr-daily-sweeper (X1-05)' },
    // Live from X1-08 (20261124060800; hor_board.test.sql proves each emitter).
    { key: 'hor_reminder', status: 'live', emitter: 'work_rest_remind() and work_rest_send_due_reminders() through work_rest_reminder_emit() (X1-08)' },
    { key: 'hor_serious_breach', status: 'live', emitter: 'work_rest_serious_breach_notify() trigger (X1-08)' },
    { key: 'hor_breach_report', status: 'live', emitter: 'work_rest_breach_report_create() (X1-08)' },
    { key: 'hor_correction_requested', status: 'live', emitter: 'work_rest_review_breach() (X1-08)' },
    // Live from X1-10 (20261124061000; familiarisation.test.sql proves the emitter).
    { key: 'familiarisation_assigned', status: 'live', emitter: 'familiarisation_open_required() through familiarisation_notify_assigned() (X1-10)' },
    // Live from X1-11 (20261124061100; transfers.test.sql proves each emitter).
    { key: 'crew_transfer_submitted', status: 'live', emitter: 'transfer_crew_submit() (X1-11)' },
    { key: 'crew_transfer_completed', status: 'live', emitter: 'transfer_crew() and crew_transfers_complete_due() through crew_transfer_apply() (X1-11)' },
    { key: 'crew_employment_ended', status: 'live', emitter: 'crew_end_employment() (X1-11)' },
  ],
};

export default manifest;
