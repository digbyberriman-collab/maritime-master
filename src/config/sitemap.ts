/**
 * STORM site map: the assembler of the navigation trees, and the
 * placeholder and redirect routes generated from them (BUILD-PLAN B3, B7,
 * B8; gap/00 F0.3; gap/10 "Target information architecture"; DECISIONS R1,
 * R3, R4, G1, G5, D-06, D-09, D-17).
 *
 * The trees are slots (src/config/navSlots.ts) filled from two sources: the
 * platform's own nodes, declared here, and the nav fragments of the module
 * manifests (src/modules/<m>/module.ts, collected by src/app/registry). A
 * module adds or moves its leaves in its own manifest, never here.
 *
 * - **Fleet** (`/fleet/…`): the Fleet view sidebar, in the section headings
 *   OVERVIEW, COMPLIANCE, PEOPLE, WORKSPACES, ADMINISTRATION, CONFIGURATION
 *   (gap/10 IA7, R1). No Feedback inbox leaf (R3).
 * - **Vessel** (`VESSEL_MODULES`): one entry per vessel tab, in tab order,
 *   each with the sidebar shown under it. Paths are relative to
 *   `/v/:vesselCode`; `buildVesselNav(code)` resolves them for one vessel.
 *   Finance and Departments are planned slots, hidden by default (G1, G5).
 * - **Workspaces** (HRIS, Health & Wellness, Yard, Shoreside, Legal): the
 *   STORM modules, unchanged (D-09). Their trees come from the HRIS, Health,
 *   Refit, New Build and Legal manifests; Shoreside is still the platform's.
 *   Legal stays at `/departments/legal` (R4); its tree is its four tabs
 *   (D-83), and Fleet's WORKSPACES links to it.
 *
 * `NAVIGATION_ITEMS` feeds today's shell (top module rail + sidebar) until
 * Phase 1 replaces it: its Fleet module is the Fleet tree, and its Vessel
 * module lists the vessel tabs as groups on the `/v/:vesselCode/…` pattern.
 * Following such a link opens the current vessel (see VesselScopeRoute).
 *
 * Every leaf carries a `status` (D-06, gap/10 IA10):
 * - `live`: the leaf reaches a real page. A leaf says so (`LIVE`, or
 *   `existing` for a route served outside the registry), or is live because
 *   a module manifest registers a route at its path.
 * - `planned`: no page yet. The sidebar hides it unless an owner or admin
 *   turns on "Show roadmap", and it gets a Coming Soon placeholder route
 *   (inside its scope for fleet and vessel leaves), so a link still resolves.
 * src/test/router/navStatus.test.tsx checks both against the real router,
 * and src/test/config/registry.test.tsx against the registry.
 *
 * Leaves are built with the shared `L(label, …)` builder (navBuilders.ts) so
 * scripts/permissions/check-storm-coverage.mjs can match every label to the
 * PMS catalogue.
 */
import {
  LayoutDashboard, Map as MapIcon, Ship, Users, FileText, Shield, Award,
  Wrench, Settings, LayoutGrid, Building2, Phone, Clock,
  CalendarDays, CheckSquare, Siren, GraduationCap, MessageSquare,
  AlertCircle, AlertTriangle, ClipboardList,
  BookOpen, FileCheck, Layers, Package, HardHat, Umbrella,
  Briefcase, Compass, Anchor,
  Heart, Flower2, Utensils, Stethoscope, Hammer, Building,
  Calendar, ListChecks, Network, Receipt, Banknote, Globe,
  Sparkles, Beaker, Waves, LifeBuoy, BookMarked, Headphones, Cpu,
  Camera, ScrollText, Truck, ClipboardCheck,
  FileBarChart, ShieldAlert, UserCheck, Puzzle, KeyRound, HelpCircle,
  ShieldCheck, Settings2, Plug, Library, Boxes, Route, Navigation, Radar,
  FolderOpen, Gauge, Eye, UserCircle,
} from 'lucide-react';
import type { NavItem, NavChild, VesselModule, VesselModuleNav } from './navigation-types';
import { G, L, LIVE, S, mergeSlot, resolveNavStatus, withScope, type SlotEntry } from './navBuilders';
import { WORKSPACE_TREES, vesselSlot, type NavSlotId } from './navSlots';
import { MODULE_REGISTRY } from '@/app/registry/modules';
import { HRIS_PATHS } from '@/modules/hris/paths';
import { VESSEL_SCOPE_PATTERN, vesselPath } from '@/modules/vessels/lib/vesselCode';
import { PERSONAL_BASE, buildPersonalNav } from './personalNav';

export { S } from './navBuilders';

/**
 * One slot's children: the platform's own nodes here, merged with the nav
 * fragments module manifests contribute to that slot (navSlots.ts).
 */
const fill = (slot: NavSlotId, base: (NavChild | SlotEntry)[] = []): NavChild[] =>
  mergeSlot(base, MODULE_REGISTRY.fragmentsFor(slot));

/** Whether a registered module route serves an absolute path. */
const isRouted = (path: string): boolean => MODULE_REGISTRY.hasPage(path);

/** Paths a module manifest declares a route for itself, page or redirect (`/departments/legal` → its dashboard). */
const manifestRoutePaths = new Set(MODULE_REGISTRY.routes.map((r) => r.fullPath));

/** Absolute path of a vessel-tree path under `base` (a cross-link stays absolute). */
const underVessel = (base: string, rel: string): string => {
  if (rel.startsWith('/')) return rel;
  return rel ? `${base}/${rel}` : base;
};

// ─── SHORESIDE ───────────────────────────────────────────────────────────
const SHORE = '/shoreside';
const shoresideChildren: NavChild[] = [
  L('Embrace', SHORE, { icon: Heart }),
  L('Lungfish', SHORE, { icon: Beaker }),
  L('Bonefish', SHORE, { icon: Beaker }),
  L('InkWELL', SHORE, { icon: Sparkles }),
  L('MedINK', SHORE, { icon: Stethoscope }),
  L('Crew Concierge', SHORE, { icon: Headphones }),
  L('Cosmic Frontier Labs', SHORE, { icon: Beaker }),
  L('Dark Ocean', SHORE, { icon: Waves }),
];

// ─── FLEET (/fleet/…) ─────────────────────────────────────────────────────
// gap/10 "Fleet view — left sidebar" is canonical for the grouping (R1); the
// routes come from the domain docs (02 operations, 03 administration, 05
// safety queue, 06 catalogues). A leaf is live only where the Fleet scope
// router mounts a page at its path (src/routes/index.tsx); every other leaf
// is planned and opens a Coming Soon placeholder inside the Fleet scope.
const FLEET_BASE = '/fleet';
const FLEET_ADMIN = `${FLEET_BASE}/admin`;

const fleetChildren: NavChild[] = [
  S('Overview', FLEET_BASE, fill('fleet.overview', [
    L('Dashboard', FLEET_BASE, { icon: LayoutDashboard, ...LIVE }),
    L('Tracker', FLEET_BASE, { icon: MapIcon, ...LIVE }),
    L('Reports', FLEET_BASE, { icon: FileBarChart, ...LIVE }),
    L('Calendar', FLEET_BASE, { icon: Calendar, ...LIVE }),
    // Crew rotation and season planning (gap/04, gap/07); replaces the old
    // Fleet Scheduler placeholder and the Rotation Planner cross-link.
    L('Planner', FLEET_BASE, { icon: Network, ...LIVE }),
    // The Company's whose-move inbox across vessels (gap/05).
    L('Safety queue', FLEET_BASE, { icon: ShieldAlert, slug: 'safety' }),
  ]), { icon: LayoutDashboard }),
  S('Compliance', FLEET_BASE, fill('fleet.compliance', [
    L('Documents', FLEET_BASE, { icon: FileText, ...LIVE }),
    L('Forms & Checklists', FLEET_BASE, { icon: CheckSquare, slug: 'forms' }),
  ]), { icon: ShieldCheck }),
  S('People', FLEET_BASE, fill('fleet.people', [
    L('Training', FLEET_BASE, { icon: GraduationCap, ...LIVE }),
    L('Medical', FLEET_BASE, { icon: Stethoscope }),
    L('Visits', FLEET_BASE, { icon: UserCheck }),
    L('Employment', FLEET_BASE, { icon: Briefcase }),
  ]), { icon: Users }),
  // The STORM workspaces, the same entries as the Apps menu (D-09). They are
  // cross-links: each page belongs to its workspace, which keeps its own URL
  // prefix, shell and gates. The section is workspace-scoped, so it shows to
  // users without fleet reach too. HRIS (10), Health & Wellness (20) and
  // Legal (40) come from their module manifests; Yard and Shoreside are
  // platform workspaces made of several modules or none yet.
  S('Workspaces', FLEET_BASE, fill('fleet.workspaces', [
    { order: 30, node: L('Yard', FLEET_BASE, { existing: '/yard', icon: Hammer, crossLink: true, scope: 'workspace', moduleKey: 'maintenance' }) },
    // D-17: one landing page of service cards. Not built yet, so planned.
    {
      order: 50,
      node: L('Shoreside', FLEET_BASE, { existing: '/shoreside', icon: Waves, crossLink: true, scope: 'workspace', status: 'planned' }),
    },
  ]), { icon: LayoutGrid, scope: 'workspace' }),
  // Owner, admins and shore staff holding an admin capability (gap/03). A
  // leaf names its PMS key where the catalogue has one; the interim adaptor
  // fails closed, so a leaf without the capability is hidden.
  S('Administration', FLEET_BASE, fill('fleet.administration', [
    L('Users & Access', FLEET_ADMIN, { slug: 'users', icon: Users, capability: 'admin.access.users_access.view', ...LIVE }),
    L('Notifications', FLEET_ADMIN, {
      icon: MessageSquare, capability: 'fleet.administration.notification_management.view', ...LIVE,
    }),
    // R3: the feedback inbox is retired into Support; there is no Feedback leaf.
    L('Support', FLEET_ADMIN, { icon: LifeBuoy, capability: 'fleet.administration.support_tickets.view' }),
    L('Company FAQs', FLEET_ADMIN, { slug: 'faqs', icon: HelpCircle }),
    L('Data protection', FLEET_ADMIN, { slug: 'gdpr', icon: ShieldCheck }),
    L('Account', FLEET_ADMIN, { icon: Building2, capability: 'fleet.administration.account.view' }),
    L('Security', FLEET_ADMIN, { icon: KeyRound }),
  ]), { icon: Settings }),
  // Split from Administration so neither list runs past eight (gap/10).
  S('Configuration', FLEET_BASE, fill('fleet.configuration', [
    L('Vessels', FLEET_ADMIN, { icon: Ship, capability: 'fleet.operations.vessels.view', ...LIVE }),
    L('Vessel Settings', FLEET_ADMIN, { icon: Settings2 }),
    L('Fleet Groups', FLEET_ADMIN, { icon: Layers, capability: 'admin.system.fleet_groups.view' }),
    L('Add-ons', FLEET_ADMIN, { slug: 'add-ons', icon: Puzzle }),
    L('Certificate catalogue', FLEET_ADMIN, { slug: 'certificates', icon: Award }),
    L('Job library', FLEET_ADMIN, { icon: Library }),
    L('Suppliers', FLEET_ADMIN, { icon: Boxes }),
    L('Integrations', FLEET_ADMIN, { icon: Plug, capability: 'admin.system.api_integrations.view' }),
  ]), { icon: Settings2 }),
];

// ─── VESSEL (/v/:vesselCode/…) ────────────────────────────────────────────
// One module per tab, in tab order (gap/10 "Vessel view"). Sub-trees follow
// the domain docs: crew gap/04, safety gap/05, certificates and technical
// gap/06, charter and vessel gap/07. Paths are relative to /v/:vesselCode.
// A leaf is live only where the vessel scope router mounts a page at its
// path. `moduleSetting` on a module or leaf names the vessel_module_settings
// key that switches it off for a vessel (G3); until that table is live every
// module counts as on (D-01).
//
// Data-driven sections (certificate sections, vessel document sections, one
// leaf per logbook, departments) are static seeds here until their providers
// land (gap/10 IA24).

const vCrew: NavChild[] = [
  L('Crew List', 'crew', { slug: 'list', icon: Users, ...LIVE }),
  // STORM extra: the roster page stays reachable until gap/04 folds it into
  // Crew List.
  L('Crew Roster', 'crew', { slug: 'roster', icon: ClipboardList, ...LIVE }),
  // Label "Leave" on vessels that rename it (vessel_module_settings).
  L('Planner', 'crew', { icon: Network, moduleSetting: 'planner', ...LIVE }),
  L('Crew Compliance', 'crew', { slug: 'compliance', icon: ShieldCheck, ...LIVE }),
  // One crew member's month (`crew/people/:crewId/hours-of-rest`, the target
  // of the legacy /crew/work-rest/:crewId) is an Hours of Rest page too: the
  // crew_hor setting closes it with the overview (gap/10 W4, D-63).
  { ...L('Hours of Rest', 'crew', { icon: Clock, moduleSetting: 'crew_hor', ...LIVE }), alsoCovers: ['crew/people/*/hours-of-rest'] },
  L('Crew Medical', 'crew', { slug: 'medical', icon: Stethoscope }),
  L('Crew Training', 'crew', { slug: 'training', icon: GraduationCap, moduleSetting: 'crew_training', ...LIVE }),
  L('Familiarisation', 'crew', { icon: FileCheck, ...LIVE }),
  L('Checklists', 'crew', { icon: CheckSquare }),
  L('Performance Appraisals', 'crew', { slug: 'appraisals', icon: ClipboardCheck }),
  L('Visitors & Occasional Workers', 'crew', { slug: 'visitors', icon: UserCheck }),
  L('Employment History', 'crew', { icon: Briefcase }),
];

// Seeded vessel document sections (gap/10: they appear under VESSEL
// DOCUMENTS once a section has a document; gap/05).
const vesselDocs = 'safety/vessel-documents';
const vSafety: NavChild[] = [
  L('Summary', 'safety', { icon: LayoutGrid }),
  L('Safety Management Manual', 'safety', { slug: 'manual', icon: BookMarked, moduleSetting: 'safety_manual' }),
  L('Drills', 'safety', { icon: Siren, ...LIVE }),
  // The /ism/permits-to-work page holds sample data (gap/00 K1): planned.
  L('Permits to Work', 'safety', { slug: 'permits', icon: HardHat }),
  L('SMS Forms', 'safety', { slug: 'forms', icon: FileText, ...LIVE }),
  // The /ism/observations page holds sample data (gap/00 K1): planned.
  L('Observations', 'safety', { icon: Eye }),
  L('Checklists', 'safety', { icon: CheckSquare, ...LIVE }),
  L('Risk Assessments', 'safety', { icon: AlertTriangle, ...LIVE }),
  L('Emergency', 'safety', { icon: AlertCircle }),
  S('Vessel Documents', 'safety', [
    L('Vessel Specific Manuals', vesselDocs, { icon: BookOpen }),
    L('Crew Duties & Responsibilities', vesselDocs, { icon: ClipboardList }),
    L("Master's Standing Orders", vesselDocs, { icon: ScrollText }),
    L("Chief Engineer's Standing Orders", vesselDocs, { icon: ScrollText }),
    L('Muster List', vesselDocs, { icon: ListChecks }),
    L('Safety Documents', vesselDocs, { icon: FileText }),
    L('Bridge SOPs', vesselDocs, { icon: BookOpen }),
    L('Deck SOPs', vesselDocs, { icon: BookOpen }),
    L('Engineering SOPs', vesselDocs, { icon: BookOpen }),
    L('Galley SOPs', vesselDocs, { icon: BookOpen }),
    L('Interior SOPs', vesselDocs, { icon: BookOpen }),
    L('Medic SOPs', vesselDocs, { icon: BookOpen }),
    L('Pollution', vesselDocs, { icon: Waves }),
    L('Flag Policy & Advice', vesselDocs, { icon: Globe }),
    L('Agent Information', vesselDocs, { icon: Phone }),
    L('NTVRP / OPA 90', vesselDocs, { icon: Shield }),
  ], { icon: FolderOpen }),
  L('Fleet Documents', 'safety', { icon: FileText }),
  L('Settings', 'safety', { icon: Settings }),
];

// Seeded certificate sections (data-driven per vessel later, gap/06).
const certSections = 'certificates/s';
const vCertificates: NavChild[] = [
  L('Status Summary', 'certificates', { existing: 'certificates', icon: LayoutGrid }),
  L('Registration', certSections, { icon: FileCheck }),
  L('Class / Tonnage / Loadline', certSections, { icon: Layers }),
  L('Safety', certSections, { icon: Shield }),
  L('Security', certSections, { icon: Anchor }),
  L('Maritime Labour Compliance', certSections, { icon: Users }),
  L('Environment', certSections, { icon: Waves }),
  L('Radio', certSections, { icon: Headphones }),
  L('Insurance', certSections, { icon: Umbrella }),
  L('Fiscal', certSections, { icon: Receipt }),
  L('LSA / FFE / Medical', certSections, { icon: LifeBuoy }),
  L('Settings', 'certificates', { icon: Settings }),
];

// Sub-modules a vessel can switch off (gap/06 X2). Equipment stays on.
const vTechnical: NavChild[] = [
  L('Overview', 'technical', { existing: 'technical', icon: Gauge }),
  L('Jobs', 'technical', { icon: ClipboardList, moduleSetting: 'technical.jobs' }),
  L('Maintenance Periods', 'technical', { slug: 'periods', icon: Calendar, moduleSetting: 'technical.periods' }),
  L('Surveys', 'technical', { icon: ClipboardCheck, moduleSetting: 'technical.surveys' }),
  // /maintenance/critical holds sample data (gap/00 K1): planned.
  L('Equipment', 'technical', { icon: Wrench }),
  L('Inventory', 'technical', { icon: Package, moduleSetting: 'technical.inventory' }),
  L('Purchase Orders', 'technical', { icon: Receipt, moduleSetting: 'technical.purchasing' }),
  L('Rounds', 'technical', { icon: Route, moduleSetting: 'technical.rounds' }),
  L('Forms & Checklists', 'technical', { slug: 'forms', icon: CheckSquare }),
  L('Documents & Plans', 'technical', { slug: 'documents', icon: FolderOpen }),
  // Add-on (G4): locked without the `deck_plans` entitlement. There is no
  // entitlement source yet (gap/03), so it is locked for everyone; it is also
  // planned, so nobody sees the lock unless Show roadmap is on.
  L('Deck Plans', 'technical', { icon: Layers, moduleSetting: 'technical.deck_plans', entitlement: 'deck_plans' }),
  L('Viewers', 'technical', { icon: Eye }),
  L('Settings', 'technical', { icon: Settings }),
];

// The module may be renamed "Trip" per vessel (gap/07).
const vCharter: NavChild[] = [
  L('Charters', 'charter', { existing: 'charter', icon: FileText, status: 'planned' }),
  L('Planner', 'charter', { icon: CalendarDays }),
  L('Guest List', 'charter', { slug: 'guests', icon: Users }),
  L('Checklists', 'charter', { icon: CheckSquare }),
];

const vVessel: NavChild[] = [
  S('Operations', 'vessel', [
    L('Voyage Plans', 'vessel', { slug: 'voyages', icon: Navigation }),
    L('Tracking', 'vessel', { icon: Radar }),
    L('Voyage Checklists', 'vessel', { icon: CheckSquare }),
  ], { icon: Navigation }),
  S('Vessel Record', 'vessel', [
    // The vessel's own record; the fleet vessel list is Fleet › Vessels.
    L('Vessel Details', 'vessel', { slug: 'details', icon: Ship }),
    L('Communications', 'vessel', { icon: MessageSquare, badgeKey: 'unreadMessages' }),
    L('Emergency Contact', 'vessel', { slug: 'emergency', icon: Phone, ...LIVE }),
    L('Documents', 'vessel', { icon: FolderOpen }),
  ], { icon: Ship }),
  S('Administration', 'vessel', [
    // /vessels/company-details holds sample data (gap/00 K1): planned.
    L('Management Company', 'vessel', { slug: 'management', icon: Building2 }),
    L('Owner & Employer', 'vessel', { slug: 'owner-employer', icon: Briefcase }),
    L('Flag & Class', 'vessel', { slug: 'flag-class', icon: Globe }),
    L('Insurance', 'vessel', { icon: Umbrella }),
    L('Billing', 'vessel', { icon: Receipt }),
    L('Settings', 'vessel', { icon: Settings }),
  ], { icon: Settings }),
];

// One leaf per logbook in the vessel registry comes from data later (gap/10
// IA24); it replaces the old hard-coded single-vessel engine log leaf.
const vLogbooks: NavChild[] = [
  L('Logbooks', 'logbooks', { existing: 'logbooks', icon: BookOpen }),
  L('Review & Sign-off', 'logbooks', { slug: 'review', icon: ClipboardCheck, ...LIVE }),
  L('Records & Exports', 'logbooks', { slug: 'records', icon: FileText, ...LIVE }),
  S('Administration', 'logbooks', [
    L('Registry', 'logbooks', { icon: Ship, ...LIVE }),
    L('Connections', 'logbooks', { icon: Cpu, ...LIVE }),
    L('Assurance', 'logbooks', { icon: Shield, ...LIVE }),
  ], { icon: Settings }),
];

// G1: Finance is hidden in this programme. Payroll and gratuities stay in the
// HRIS workspace; Finance only links to them.
const vFinance: NavChild[] = [
  L('Overview', 'finance', { existing: 'finance', icon: LayoutGrid, status: 'planned' }),
  L('Expenses', 'finance', { icon: Banknote }),
  L('Invoices', 'finance', { icon: Receipt }),
  L('APA Management', 'finance', { slug: 'apa', icon: FileText }),
  L('Budgets & Reporting', 'finance', { slug: 'budgets', icon: ClipboardList }),
  L('Payroll', 'finance', {
    existing: HRIS_PATHS.payroll, icon: Banknote, crossLink: true, scope: 'workspace', moduleKey: 'finance',
  }),
  L('Gratuities', 'finance', {
    existing: HRIS_PATHS.gratuities, icon: Sparkles, crossLink: true, scope: 'workspace', moduleKey: 'finance',
  }),
];

// G5: Departments stays hidden until a department page is live. The
// Management / Office group is gone (gap/10): HR is the HRIS workspace, Legal
// the Legal workspace, DPA / ISM office the fleet Safety queue, Procurement
// Technical › Purchase Orders, Finance the Finance tab, Insurance and
// Management Company the Vessel tab, Crewing the fleet Employment page.
const DEPT = 'departments';
const standardDept6 = (base: string): NavChild[] => [
  L('Handover / Notes', base, { icon: FileText }),
  L('Work Lists / Job Cards', base, { icon: ClipboardList }),
  L('Rotas & Watchkeeping', base, { icon: Clock }),
  L('Inventory & Equipment', base, { icon: Package }),
  L('Checklists', base, { icon: CheckSquare }),
  L('Notes / Reference', base, { icon: BookOpen }),
];

const galleyBase = `${DEPT}/galley`;
const diveBase = `${DEPT}/dive`;

const galleyChildren: NavChild[] = [
  L('Daily Menus', galleyBase, { icon: Utensils }),
  L('Trip Planner', galleyBase, { icon: Compass }),
  L('Galley Logs', galleyBase, { icon: FileText }),
  L('Chef Handover', galleyBase, { icon: ClipboardList }),
  L('Provisioning', galleyBase, { icon: Truck }),
  L('Galley SOPs', galleyBase, { icon: BookOpen }),
  L('Recipe Library', galleyBase, { icon: BookMarked }),
  L('Projects', galleyBase, { icon: Layers }),
  L('Rotation Schedule', galleyBase, { icon: Network }),
  L('Feedback & Requests', galleyBase, { icon: MessageSquare }),
  L('Nutrition', galleyBase, { icon: Heart }),
  L('Candidate Records', galleyBase, { icon: Users }),
  L('Professional Development', galleyBase, { icon: GraduationCap }),
];

const diveChildren: NavChild[] = [
  ...standardDept6(diveBase),
  G('Dive Operations', diveBase, [
    L('Dive Ops Procedures', `${diveBase}/operations`),
    L('Dive Logs', `${diveBase}/operations`),
    L('Gas & Cylinder Tracking', `${diveBase}/operations`),
  ], { icon: Waves, slug: 'operations' }),
  G('Dive Emergency', diveBase, [
    L('Emergency Procedures', `${diveBase}/emergency`),
    L('Chamber & Evac', `${diveBase}/emergency`),
    L('Emergency Contacts', `${diveBase}/emergency`),
  ], { icon: AlertCircle, slug: 'emergency' }),
  G('Dive Tools', diveBase, [
    L('Equipment Register', `${diveBase}/tools`),
    L('Servicing & Tests', `${diveBase}/tools`),
    L('Spares', `${diveBase}/tools`),
  ], { icon: Wrench, slug: 'tools' }),
];

const vDepartments: NavChild[] = [
  G('Bridge',      DEPT, standardDept6(`${DEPT}/bridge`),      { icon: Anchor,    slug: 'bridge' }),
  G('Deck',        DEPT, standardDept6(`${DEPT}/deck`),        { icon: Compass,   slug: 'deck' }),
  G('Engineering', DEPT, standardDept6(`${DEPT}/engineering`), { icon: Wrench,    slug: 'engineering' }),
  G('Interior',    DEPT, standardDept6(`${DEPT}/interior`),    { icon: Sparkles,  slug: 'interior' }),
  G('Galley',      DEPT, galleyChildren,                       { icon: Utensils,  slug: 'galley' }),
  // Spa and Medical are Health & Wellness pages (cross-links).
  L('Spa', DEPT, { existing: '/health/spa', icon: Flower2, crossLink: true, scope: 'workspace', moduleKey: 'wellness' }),
  G('Media',       DEPT, standardDept6(`${DEPT}/media`),       { icon: Camera,    slug: 'media' }),
  G('IT',          DEPT, standardDept6(`${DEPT}/it`),          { icon: Cpu,       slug: 'it' }),
  L('Medical', DEPT, { existing: '/health/medical', icon: Stethoscope, crossLink: true, scope: 'workspace', moduleKey: 'medical' }),
  G('Dive',        DEPT, diveChildren,                         { icon: Waves,     slug: 'dive' }),
];

/**
 * The Vessel view modules in tab order (gap/10): Home · Crew · Safety ·
 * Certificates · Technical · Charter · Vessel · Logbooks · Finance ·
 * Departments · Calendar · Reports. Paths are relative to `/v/:vesselCode`.
 * The tab row and the per-module sidebar (Phase 1, S2/S3) read this through
 * `buildVesselNav(code)`.
 */
const vesselModule = (m: VesselModule): VesselModule => ({
  ...m,
  // Each tab's sidebar is its slot (navSlots.ts `vessel.<id>`); a leaf with no
  // status is live once a vessel route is registered at its path.
  children: resolveNavStatus(fill(vesselSlot(m.id), m.children), (rel) => isRouted(underVessel(VESSEL_SCOPE_PATTERN, rel))),
});

const VESSEL_MODULE_DEFS: VesselModule[] = [
  { id: 'home', label: 'Home', icon: LayoutDashboard, root: '', children: [], status: 'live' },
  { id: 'crew', label: 'Crew', icon: Users, root: 'crew', children: vCrew, moduleSetting: 'crew', status: 'live' },
  {
    id: 'safety', label: 'Safety', icon: Shield, root: 'safety', children: vSafety, moduleSetting: 'safety',
    status: 'live', badgeKey: 'pendingCompliance',
  },
  {
    id: 'certificates', label: 'Certificates', icon: Award, root: 'certificates', children: vCertificates,
    moduleSetting: 'certificates', status: 'live',
  },
  {
    id: 'technical', label: 'Technical', icon: Wrench, root: 'technical', children: vTechnical, moduleSetting: 'technical',
    status: 'live', badgeKey: 'overdueTasks',
  },
  // No charter page is built yet, so the whole tab is planned.
  { id: 'charter', label: 'Charter', icon: Compass, root: 'charter', children: vCharter, moduleSetting: 'charter', status: 'planned' },
  { id: 'vessel', label: 'Vessel', icon: Ship, root: 'vessel', children: vVessel, moduleSetting: 'vessel', status: 'live' },
  { id: 'logbooks', label: 'Logbooks', icon: BookOpen, root: 'logbooks', children: vLogbooks, moduleSetting: 'logbooks', status: 'live' },
  { id: 'finance', label: 'Finance', icon: Banknote, root: 'finance', children: vFinance, moduleSetting: 'finance', status: 'planned' },
  {
    id: 'departments', label: 'Departments', icon: Building, root: DEPT, children: vDepartments,
    moduleSetting: 'departments', status: 'planned',
  },
  { id: 'calendar', label: 'Calendar', icon: Calendar, root: 'calendar', children: [], status: 'live' },
  { id: 'reports', label: 'Reports', icon: FileBarChart, root: 'reports', children: [], status: 'planned' },
];

export const VESSEL_MODULES: readonly VesselModule[] = VESSEL_MODULE_DEFS.map(vesselModule);

/** What `buildVesselNav` needs to know about one vessel (gap/10 W4). */
export interface VesselNavOptions {
  /**
   * Whether a `vessel_module_settings` key is on for the vessel. Defaults to
   * every key on: the table is not live yet (D-01, BUILD-PLAN S4).
   */
  isModuleOn?: (moduleSetting: string) => boolean;
  /** The vessel's label for a key (Charter → "Trip", Planner → "Leave"); empty keeps the default. */
  labelFor?: (moduleSetting: string) => string | null | undefined;
}

function resolveVesselChildren(items: NavChild[], base: string, options: VesselNavOptions): NavChild[] {
  const on = options.isModuleOn ?? (() => true);
  return items
    .filter((item) => !item.moduleSetting || on(item.moduleSetting))
    .map((item) => {
      const label = (item.moduleSetting && options.labelFor?.(item.moduleSetting)) || item.label;
      return {
        ...item,
        id: `vessel-${item.id}`,
        label,
        path: underVessel(base, item.path),
        scope: item.scope ?? 'vessel',
        ...(item.children ? { children: resolveVesselChildren(item.children, base, options) } : {}),
      };
    });
}

/**
 * The vessel modules with absolute paths under `base`: `/v/dra` for one
 * vessel, or the `/v/:vesselCode` pattern for the static tree. Modules and
 * leaves whose `moduleSetting` is off are dropped, and per-vessel labels
 * applied. Node ids are prefixed `vessel-`, so they are the same for every
 * vessel (saved sidebar order carries over).
 */
export function vesselModuleNav(base: string, options: VesselNavOptions = {}): VesselModuleNav[] {
  const on = options.isModuleOn ?? (() => true);
  return VESSEL_MODULES.filter((m) => !m.moduleSetting || on(m.moduleSetting)).map((m) => ({
    ...m,
    label: (m.moduleSetting && options.labelFor?.(m.moduleSetting)) || m.label,
    path: underVessel(base, m.root),
    children: resolveVesselChildren(m.children, base, options),
  }));
}

/** The vessel tab row and sidebars for one vessel: `buildVesselNav('DRA')` → paths under `/v/dra`. */
export function buildVesselNav(vesselCode: string, options: VesselNavOptions = {}): VesselModuleNav[] {
  return vesselModuleNav(vesselPath(vesselCode), options);
}

/**
 * The module a path inside the vessel scope belongs to, given the part after
 * `/v/<code>/` (`crew/list` → Crew). The home module answers only the bare
 * vessel root. Used by the tab row to light the active tab.
 */
export function vesselModuleForPath(rest: string): VesselModule | null {
  const path = rest.replace(/^\/+|\/+$/g, '').split(/[?#]/)[0];
  if (!path) return VESSEL_MODULES.find((m) => m.root === '') ?? null;
  let best: VesselModule | null = null;
  for (const m of VESSEL_MODULES) {
    if (!m.root) continue;
    if (path === m.root || path.startsWith(`${m.root}/`)) {
      if (!best || m.root.length > best.root.length) best = m;
    }
  }
  return best;
}

/** One vessel module as a node of today's sidebar: a group, or a leaf when it has no sidebar. */
function vesselModuleNode(m: VesselModuleNav): NavChild {
  const common: NavChild = {
    id: `vessel-${m.id}`,
    label: m.label,
    path: m.path,
    icon: m.icon,
    scope: 'vessel',
    ...(m.moduleSetting ? { moduleSetting: m.moduleSetting } : {}),
    ...(m.badgeKey ? { badgeKey: m.badgeKey } : {}),
  };
  if (!m.children.length) return { ...common, kind: 'leaf', status: m.status };
  // A planned module stays hidden even when it holds live cross-links.
  return { ...common, kind: 'group', children: m.children, ...(m.status === 'planned' ? { status: 'planned' as const } : {}) };
}

// ─── TOP-LEVEL (today's shell) ────────────────────────────────────────────
/** The vessel tree on the `/v/:vesselCode` pattern, for the static shell. */
const vesselPatternModules = vesselModuleNav(VESSEL_SCOPE_PATTERN);

/** The Fleet tree, with each unsettled leaf live only if a fleet route is registered at its path. */
const fleetTree = resolveNavStatus(fleetChildren, isRouted);

/** The platform's own nodes in a workspace slot; the rest come from module manifests. */
const WORKSPACE_BASE: Readonly<Record<string, NavChild[]>> = { shoreside: shoresideChildren };

/**
 * The workspaces with a sidebar tree, after Fleet and Vessel (navSlots.ts
 * WORKSPACE_TREES). Health & Wellness, Yard (Refit, New Build), HRIS and
 * Legal fill their slots from their module manifests.
 */
const workspaceItems: NavItem[] = WORKSPACE_TREES.map((w) => ({
  id: w.id,
  label: w.label,
  icon: w.icon,
  path: w.path,
  permissions: ['all'],
  scope: 'workspace',
  children: withScope(resolveNavStatus(fill(w.slot, WORKSPACE_BASE[w.id] ?? []), isRouted), 'workspace'),
}));

export const NAVIGATION_ITEMS: NavItem[] = [
  {
    id: 'fleet', label: 'Fleet', icon: Globe, path: FLEET_BASE, permissions: ['all'], defaultOpen: true, scope: 'fleet',
    children: withScope(fleetTree, 'fleet'),
  },
  {
    // Each vessel tab is a group here (a leaf when it has no sidebar). Its
    // links carry the literal `:vesselCode`, which the vessel scope turns
    // into the current vessel, so the tree works without knowing the code.
    id: 'vessel', label: 'Vessel', icon: Anchor, path: VESSEL_SCOPE_PATTERN, permissions: ['all'], defaultOpen: true, scope: 'vessel',
    children: vesselPatternModules.map(vesselModuleNode),
  },
  ...workspaceItems,
  {
    // The personal area (spec §8). Unfiltered here, for titles and
    // breadcrumbs; the sidebar draws `buildPersonalNav` with the user's
    // settings gate (src/app/nav/usePersonalNav.ts).
    id: 'personal', label: 'My account', icon: UserCircle, path: PERSONAL_BASE, permissions: ['all'], scope: 'personal',
    children: buildPersonalNav(() => true),
  },
];

// ─── Placeholder and redirect routes ─────────────────────────────────────

export interface SitemapLeaf {
  path: string;
  label: string;
}

export interface SectionRedirect {
  from: string;
  to: string;
}

/** True for a leaf with no real page yet (D-06). */
export const isPlannedLeaf = (item: Pick<NavChild, 'status'>): boolean => item.status === 'planned';

/** Every leaf of a tree (sections and groups are walked, not returned). */
export function navLeaves(items: (NavItem | NavChild)[], acc: NavChild[] = []): NavChild[] {
  for (const it of items) {
    if (it.children?.length) navLeaves(it.children, acc);
    else if (!('permissions' in it)) acc.push(it);
  }
  return acc;
}

/** The first own (non-cross-link) leaf, preferring one with a real page. */
function firstLeaf(items: NavChild[] | undefined): string | null {
  const own = navLeaves(items ?? []).filter((leaf) => !leaf.crossLink);
  return (own.find((leaf) => !isPlannedLeaf(leaf)) ?? own[0])?.path ?? null;
}

function withModule(path: string, moduleId: string): string {
  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('module', moduleId);
  return `${pathname}?${params.toString()}`;
}

/** Workspace prefixes whose unbuilt leaves get a top-level placeholder route. */
const WORKSPACE_PREFIXES = WORKSPACE_TREES.map((w) => `${w.path}/`);
const WORKSPACE_MODULE_IDS = new Set(WORKSPACE_TREES.map((w) => w.id));
const workspaceModules = NAVIGATION_ITEMS.filter((m) => WORKSPACE_MODULE_IDS.has(m.id));

function collectGroupPaths(items: (NavItem | NavChild)[], groups: Set<string>): void {
  for (const it of items) {
    if (it.children?.length) {
      groups.add(it.path.split('?')[0]);
      collectGroupPaths(it.children, groups);
    }
  }
}

const _groupPaths = new Set<string>();
collectGroupPaths(NAVIGATION_ITEMS, _groupPaths);

const workspaceRoots = new Set(workspaceModules.map((m) => m.path));

/**
 * One Coming Soon route per planned workspace leaf, so a link to a page that
 * is not built yet still resolves. A live leaf never gets one: its real route
 * serves the path, whatever the route order. A path that is a group elsewhere
 * in the tree is not a placeholder: it gets a section redirect instead (see
 * SECTION_REDIRECTS). The exception is a workspace root that a planned leaf
 * names, such as the Shoreside landing (D-17): the root is that page, so it
 * gets the placeholder and no redirect. Fleet and vessel placeholders live
 * inside their scopes (FLEET_PLACEHOLDER_LEAVES, VESSEL_PLACEHOLDER_LEAVES).
 */
export const PLACEHOLDER_LEAVES: SitemapLeaf[] = (() => {
  const seen = new Set<string>();
  const out: SitemapLeaf[] = [];
  for (const leaf of navLeaves(NAVIGATION_ITEMS)) {
    if (!isPlannedLeaf(leaf)) continue;
    const pathname = leaf.path.split('?')[0];
    const isRoot = workspaceRoots.has(pathname);
    if (!isRoot && !WORKSPACE_PREFIXES.some((p) => leaf.path.startsWith(p))) continue;
    if (seen.has(leaf.path)) continue;
    if (!isRoot && _groupPaths.has(pathname)) continue;
    seen.add(leaf.path);
    out.push({ path: leaf.path, label: leaf.label });
  }
  return out;
})();

const _placeholderPaths = new Set(PLACEHOLDER_LEAVES.map((l) => l.path));

/**
 * Planned Fleet leaves, as paths relative to `/fleet`. The router mounts a
 * Coming Soon page for each inside FleetScope, so the fleet reach check and
 * the shell apply to them as to any fleet page.
 */
export const FLEET_PLACEHOLDER_LEAVES: SitemapLeaf[] = (() => {
  const out: SitemapLeaf[] = [];
  const seen = new Set<string>();
  for (const leaf of navLeaves(fleetTree)) {
    if (!isPlannedLeaf(leaf) || leaf.crossLink || !leaf.path.startsWith(`${FLEET_BASE}/`)) continue;
    const rel = leaf.path.slice(FLEET_BASE.length + 1);
    if (seen.has(rel)) continue;
    seen.add(rel);
    out.push({ path: rel, label: leaf.label });
  }
  return out;
})();

/** Every own (non-cross-link) leaf of the vessel tree, relative paths. */
function vesselOwnLeaves(): NavChild[] {
  const out: NavChild[] = [];
  for (const m of VESSEL_MODULES) {
    if (!m.children.length) {
      out.push({ id: `module-${m.id}`, label: m.label, path: m.root, icon: m.icon, status: m.status });
      continue;
    }
    out.push(...navLeaves(m.children).filter((l) => !l.crossLink));
  }
  return out;
}

/**
 * Planned vessel leaves, as paths relative to `/v/:vesselCode` (`''` is the
 * vessel home). The router mounts a Coming Soon page for each inside the
 * vessel scope, so the vessel reach check and the shell apply to them.
 */
export const VESSEL_PLACEHOLDER_LEAVES: SitemapLeaf[] = (() => {
  const out: SitemapLeaf[] = [];
  const seen = new Set<string>();
  for (const leaf of vesselOwnLeaves()) {
    if (!isPlannedLeaf(leaf) || seen.has(leaf.path)) continue;
    seen.add(leaf.path);
    out.push({ path: leaf.path, label: leaf.label });
  }
  return out;
})();

/**
 * Planned personal leaves (`signature`, `documents`, `leave`, the company
 * settings placeholders), as paths relative to `/me`. The router mounts a
 * Coming Soon page for each inside the personal scope, so a bookmark
 * resolves while the sidebar hides the leaf (D-06).
 */
export const PERSONAL_PLACEHOLDER_LEAVES: SitemapLeaf[] = (() => {
  const out: SitemapLeaf[] = [];
  const seen = new Set<string>();
  const personal = NAVIGATION_ITEMS.find((m) => m.id === 'personal');
  for (const leaf of navLeaves(personal?.children ?? [])) {
    if (!isPlannedLeaf(leaf) || leaf.crossLink || !leaf.path.startsWith(`${PERSONAL_BASE}/`)) continue;
    const rel = leaf.path.slice(PERSONAL_BASE.length + 1);
    if (seen.has(rel)) continue;
    seen.add(rel);
    out.push({ path: rel, label: leaf.label });
  }
  return out;
})();

/**
 * Vessel module roots and groups with no page of their own (`crew`,
 * `departments/bridge`), relative to `/v/:vesselCode`. Each redirects to its
 * first own leaf, preferring a real page: `crew` → `crew/list`. `to` is
 * relative to `from`, so it can be the `to` of a nested <Navigate>.
 * Sections are headings that share their parent's path, so they add nothing.
 */
export const VESSEL_ROOT_REDIRECTS: SectionRedirect[] = (() => {
  const leafPaths = new Set(vesselOwnLeaves().map((l) => l.path));
  const out: SectionRedirect[] = [];
  const seen = new Set<string>();
  const add = (from: string, items: NavChild[]) => {
    if (leafPaths.has(from) || seen.has(from)) return;
    const target = firstLeaf(items);
    if (!target || !target.startsWith(`${from}/`)) return;
    seen.add(from);
    out.push({ from, to: target.slice(from.length + 1) });
  };
  const visit = (items: NavChild[]) => {
    for (const item of items) {
      if (!item.children?.length) continue;
      if (item.kind !== 'section') add(item.path, item.children);
      visit(item.children);
    }
  };
  for (const m of VESSEL_MODULES) {
    if (!m.children.length) continue;
    add(m.root, m.children);
    visit(m.children);
  }
  return out;
})();

// ─── Section / group redirects ───────────────────────────────────────────
// `/hris`, `/hris/employee-records`, … have no page of their own. Each one
// redirects to its first real (non-cross-link) leaf so bookmarks and typed
// URLs land somewhere useful instead of bouncing to the dashboard. Fleet
// headings share the `/fleet` path, which the Fleet scope already sends to
// its dashboard; vessel roots are VESSEL_ROOT_REDIRECTS. A path a module
// manifest already routes itself (Legal's root redirects to its dashboard)
// gets none, so no path is declared twice.
export const SECTION_REDIRECTS: SectionRedirect[] = (() => {
  const out: SectionRedirect[] = [];
  const seen = new Set<string>();
  const visit = (items: NavChild[] | undefined, moduleId: string) => {
    for (const item of items ?? []) {
      if (!item.children?.length) continue;
      const target = firstLeaf(item.children);
      if (target && WORKSPACE_PREFIXES.some((p) => item.path.startsWith(p)) && !seen.has(item.path) && !manifestRoutePaths.has(item.path)) {
        seen.add(item.path);
        out.push({ from: item.path, to: withModule(target, moduleId) });
      }
      visit(item.children, moduleId);
    }
  };
  for (const module of workspaceModules) {
    const target = firstLeaf(module.children);
    if (target && !seen.has(module.path) && !_placeholderPaths.has(module.path) && !manifestRoutePaths.has(module.path)) {
      seen.add(module.path);
      out.push({ from: module.path, to: withModule(target, module.id) });
    }
    visit(module.children, module.id);
  }
  return out;
})();
