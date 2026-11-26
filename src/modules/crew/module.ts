/**
 * Crew module manifest (BUILD-PLAN B8; gap/00 A2; gap/04). Data only: the
 * registry loads it eagerly, so it imports nothing but icons, the nav
 * builders, the slot ids and its own paths and routes.
 *
 * - routes: ./routes.tsx, the vessel Crew pages (relative to `/v/:vesselCode`)
 *   and the fleet planner.
 * - nav:
 *   - `vessel.crew`: the Crew tab's sidebar. Crew Medical (60) comes from the
 *     fleet operations manifest and Crew Training (70) from development's
 *     (platform-prep plan §1), so this module never uses those two orders.
 *   - `personal.my_work`: the user's own documents (planned until /me/documents is built).
 *
 * Platform-prep PP3 moved these from src/config/sitemap.ts and
 * src/routes/index.tsx unchanged: same nodes, same orders, same pages.
 */
import {
  Briefcase, CheckSquare, ClipboardCheck, ClipboardList, Clock, FileCheck, FileText, Network, ShieldCheck, UserCheck, Users,
} from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import { L, LIVE } from '@/config/navBuilders';
import { CREW_ROOT, PERSONAL_ROOT } from './paths';
import { CREW_ROUTES } from './routes';

const manifest: ModuleManifest = {
  id: 'crew',
  label: 'Crew',
  scopes: ['vessel', 'fleet', 'personal'],
  routes: CREW_ROUTES,
  nav: [
    { slot: 'vessel.crew', order: 10, node: L('Crew List', CREW_ROOT, { slug: 'list', icon: Users, ...LIVE }) },
    // STORM extra: the roster page stays reachable until gap/04 folds it into Crew List.
    { slot: 'vessel.crew', order: 20, node: L('Crew Roster', CREW_ROOT, { slug: 'roster', icon: ClipboardList, ...LIVE }) },
    // Label "Leave" on vessels that rename it (vessel_module_settings).
    { slot: 'vessel.crew', order: 30, node: L('Planner', CREW_ROOT, { icon: Network, moduleSetting: 'planner', ...LIVE }) },
    { slot: 'vessel.crew', order: 40, node: L('Crew Compliance', CREW_ROOT, { slug: 'compliance', icon: ShieldCheck, ...LIVE }) },
    // One crew member's month (`crew/people/:crewId/hours-of-rest`, the target
    // of the legacy /crew/work-rest/:crewId) is an Hours of Rest page too: the
    // crew_hor setting closes it with the overview (gap/10 W4, D-63).
    {
      slot: 'vessel.crew',
      order: 50,
      node: {
        ...L('Hours of Rest', CREW_ROOT, { icon: Clock, moduleSetting: 'crew_hor', ...LIVE }),
        alsoCovers: ['crew/people/*/hours-of-rest'],
      },
    },
    { slot: 'vessel.crew', order: 80, node: L('Familiarisation', CREW_ROOT, { icon: FileCheck, ...LIVE }) },
    { slot: 'vessel.crew', order: 90, node: L('Checklists', CREW_ROOT, { icon: CheckSquare }) },
    { slot: 'vessel.crew', order: 100, node: L('Performance Appraisals', CREW_ROOT, { slug: 'appraisals', icon: ClipboardCheck }) },
    { slot: 'vessel.crew', order: 110, node: L('Visitors & Occasional Workers', CREW_ROOT, { slug: 'visitors', icon: UserCheck }) },
    { slot: 'vessel.crew', order: 120, node: L('Employment History', CREW_ROOT, { icon: Briefcase }) },
    { slot: 'personal.my_work', order: 40, node: L('Documents', PERSONAL_ROOT, { icon: FileText, status: 'planned' }) },
  ],
};

export default manifest;
