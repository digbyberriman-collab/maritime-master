/**
 * Inkfleet site map → navigation tree + placeholder route registry.
 *
 * This file is the single source of truth for the sidebar and for
 * placeholder routes registered in `src/routes/index.tsx`. Real pages
 * keep their existing routes (e.g. `/dashboard`, `/ism/drills`); leaves
 * that point at synthesized paths under `/fleet/...`, `/vessel/...`,
 * `/shoreside/...`, `/health/...`, `/yard/...`, `/hris/...` get a
 * generated "Coming Soon" placeholder route until a real page is built.
 */
import {
  LayoutDashboard, Map as MapIcon, Ship, Users, FileText, Shield, Award,
  Wrench, Bell, Settings, LayoutGrid, Building2, Phone, Plane, Clock,
  CalendarDays, CheckSquare, Siren, GraduationCap, MessageSquare,
  AlertCircle, Search, Clipboard, Eye, AlertTriangle, ClipboardList,
  BookOpen, FileCheck, Layers, Package, HardHat, XCircle, Umbrella,
  Briefcase, Compass, GanttChart, Lightbulb, PauseCircle, Anchor,
  Heart, Activity, Utensils, Dumbbell, Stethoscope, Hammer, Building,
  Calendar, ListChecks, CircleDot, Network, Receipt, Banknote, Globe,
  Sparkles, Beaker, Waves, LifeBuoy, BookMarked, Headphones, Cpu,
  Camera, Pickaxe, ScrollText, Truck, ClipboardCheck,
  type LucideIcon,
} from 'lucide-react';
import type { NavItem, NavChild } from './navigation-types';

const def: LucideIcon = CircleDot;

/** Normalize a label into a URL slug. */
const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/['’`"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Build a leaf NavChild under a base path. Pass `existing` to point at
 *  an already-implemented route; otherwise a synthesized path is used. */
type GateOpts = Pick<NavChild, 'moduleKey' | 'minPermission' | 'crossLink' | 'selfServe'>;

function L(
  label: string,
  base: string,
  opts: { existing?: string; icon?: LucideIcon; slug?: string } & GateOpts = {},
): NavChild {
  const s = opts.slug ?? slug(label);
  const path = opts.existing ?? `${base}/${s}`;
  return {
    id: `${base}-${s}`.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+/, ''),
    label,
    path,
    icon: opts.icon ?? def,
    ...(opts.moduleKey ? { moduleKey: opts.moduleKey } : {}),
    ...(opts.minPermission ? { minPermission: opts.minPermission } : {}),
    ...(opts.crossLink ? { crossLink: true } : {}),
    ...(opts.selfServe ? { selfServe: true } : {}),
  };
}

/** Build a group (collapsible child with its own children) under a base path. */
function G(
  label: string,
  base: string,
  children: NavChild[],
  opts: { icon?: LucideIcon; slug?: string } & GateOpts = {},
): NavChild {
  const s = opts.slug ?? slug(label);
  return {
    id: `${base}-${s}`.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+/, ''),
    label,
    path: `${base}/${s}`,
    icon: opts.icon ?? def,
    children,
    ...(opts.moduleKey ? { moduleKey: opts.moduleKey } : {}),
    ...(opts.minPermission ? { minPermission: opts.minPermission } : {}),
    ...(opts.selfServe ? { selfServe: true } : {}),
  };
}

// ─── FLEET ────────────────────────────────────────────────────────────────
const FLEET_BASE = '/fleet';
const fleetChildren: NavChild[] = [
  L('Fleet Dashboard', FLEET_BASE, { existing: '/dashboard', icon: LayoutDashboard }),
  L('Fleet Scheduler', FLEET_BASE, { icon: CalendarDays }),
  L('Fleet Tracker', FLEET_BASE, { existing: '/fleet-map', icon: MapIcon }),
  L('Fleet Reports', FLEET_BASE, { icon: ClipboardList }),
  L('Fleet Calendar', FLEET_BASE, { existing: '/itinerary/timeline', icon: Calendar }),
  L('Fleet Rotation Planner', FLEET_BASE, { icon: Network }),
  L('Fleet Documents', FLEET_BASE, { existing: '/documents', icon: FileText }),
  L('Fleet Checklists', FLEET_BASE, { existing: '/ism/checklists', icon: CheckSquare, crossLink: true }),
  L('Vessels', FLEET_BASE, { existing: '/vessels/dashboard', icon: Ship }),
  L('Users & Access', FLEET_BASE, { existing: '/users-access', icon: Users }),
  L('Notification Center', FLEET_BASE, { existing: '/notifications/center', icon: Bell }),
  L('Notification Management', FLEET_BASE, { existing: '/admin/notifications', icon: Bell }),
  L('Support Tickets', FLEET_BASE, { icon: LifeBuoy }),
  L('Account', FLEET_BASE, { existing: '/account', icon: Settings }),
];

// ─── VESSEL ───────────────────────────────────────────────────────────────
const V = '/vessel';

// Crew
const vCrew = `${V}/crew`;
// HR-owned pages (leave, appraisals, employment history, crewing) live in the
// HRIS module. Vessel keeps cross-links only, so URL → module resolution
// always lands in HRIS for those pages.
const vesselCrew: NavChild[] = [
  L('Crew List', vCrew, { existing: '/crew/list', icon: Users }),
  L('Crew Roster', vCrew, { existing: '/crew/roster', icon: Users }),
  L('Leave', vCrew, { existing: '/crew/leave', icon: CalendarDays, crossLink: true }),
  L('Rotation Planner', vCrew, { existing: '/crew/rotation-planner', icon: Network, crossLink: true }),
  L('Hours of Rest', vCrew, { existing: '/crew/work-rest', icon: Clock }),
  L('Crew Training', vCrew, { existing: '/development/crew-training', icon: GraduationCap, crossLink: true }),
  L('Familiarisation', vCrew, { existing: '/training', icon: FileCheck, crossLink: true }),
];

// Safety
const vSafety = `${V}/safety`;
const sopBase = `${vSafety}/sops`;
const standingBase = `${vSafety}/standing-orders`;
const vesselSafety: NavChild[] = [
  L('SMS Summary', vSafety, { icon: Shield }),
  L('Drills', vSafety, { existing: '/ism/drills', icon: Siren }),
  L('Permit to Work', vSafety, { existing: '/ism/permits-to-work', icon: HardHat }),
  L('SMS Forms', vSafety, { existing: '/ism/miscellaneous', icon: FileText }),
  L('Checklists', vSafety, { existing: '/ism/checklists', icon: CheckSquare }),
  L('Risk Assessments', vSafety, { existing: '/ism/risk-assessments', icon: AlertTriangle }),
  L('Vessel Specific Manuals', vSafety, { icon: BookOpen }),
  L('Crew Duties & Responsibilities', vSafety, { icon: ClipboardList }),
  G('Standing Orders', vSafety, [
    L("Master's Standing Orders", standingBase),
    L("Chief Engineer's Standing Orders", standingBase),
  ], { icon: ScrollText, slug: 'standing-orders' }),
  L('Muster List', vSafety, { icon: ListChecks }),
  L('Safety Management Manual', vSafety, { icon: BookMarked }),
  L('Safety Documents', vSafety, { icon: FileText }),
  G('SOPs', vSafety, [
    L('Bridge SOPs', sopBase),
    L('Deck SOPs', sopBase),
    L('Engineering SOPs', sopBase),
    L('Galley SOPs', sopBase),
    L('Interior SOPs', sopBase),
    L('Medic SOPs', sopBase),
  ], { icon: BookOpen, slug: 'sops' }),
  L('Pollution', vSafety, { icon: Waves }),
  L('Emergency Response', vSafety, { existing: '/ism/erm', icon: AlertCircle }),
  L('Flag Policy & Advice', vSafety, { icon: Globe }),
  L('Agent Information', vSafety, { icon: Phone }),
  L('NTVRP / OPA 90', vSafety, { icon: Shield }),
];

// Certificates
const vCerts = `${V}/certificates`;
const vesselCertificates: NavChild[] = [
  L('Status Summary', vCerts, { icon: LayoutGrid }),
  L('Registration', vCerts, { icon: FileCheck }),
  L('Class / Tonnage / Loadline', vCerts, { icon: Layers }),
  L('Safety', vCerts, { icon: Shield }),
  L('Security', vCerts, { icon: Anchor }),
  L('Maritime Labour Compliance', vCerts, { icon: Users }),
  L('Environment', vCerts, { icon: Waves }),
  L('Radio', vCerts, { icon: Headphones }),
  L('Insurance', vCerts, { icon: Umbrella }),
  L('Fiscal', vCerts, { icon: Receipt }),
  L('LSA / FFE / Medical', vCerts, { icon: LifeBuoy }),
  L('Fleet Certificates', vCerts, { existing: '/certificates', icon: Award }),
];

// Technical
const vTech = `${V}/technical`;
const vesselTechnical: NavChild[] = [
  L('Maintenance Summary', vTech, { existing: '/maintenance/dashboard', icon: LayoutGrid }),
  L('Tasks', vTech, { icon: ClipboardList }),
  L('Operational Checklists', vTech, { icon: CheckSquare }),
  L('Equipment', vTech, { existing: '/maintenance/critical', icon: Wrench }),
  L('Inventory', vTech, { icon: Package }),
  L('Purchase Orders', vTech, { icon: Receipt }),
  L('Maintenance Periods', vTech, { icon: Calendar }),
  L('Surveys', vTech, { icon: ClipboardCheck }),
];

// Charter
const vCharter = `${V}/charter`;
const vesselCharter: NavChild[] = [
  L('Charters', vCharter, { icon: FileText }),
  L('Guest List', vCharter, { icon: Users }),
  L('Checklists', vCharter, { icon: CheckSquare }),
];

// Accounting
const vAcct = `${V}/accounting`;
const vesselAccounting: NavChild[] = [
  L('Accounting Dashboard', vAcct, { icon: LayoutGrid }),
  L('Expenses', vAcct, { icon: Banknote }),
  L('Invoices', vAcct, { icon: Receipt }),
  L('APA Management', vAcct, { icon: FileText }),
  L('Payroll', vAcct, { icon: Banknote }),
  L('Gratuities', vAcct, { icon: Sparkles }),
  L('Budgets & Reporting', vAcct, { icon: ClipboardList }),
];

// Electronic Logbooks
const vLog = `${V}/logbooks`;
const vesselLogbooks: NavChild[] = [
  L('Logbooks', vLog, { existing: vLog, icon: BookOpen }),
  L('DAGON Engine Room Log', vLog, {
    icon: Wrench,
    slug: 'engine-log-dagon',
    existing: '/vessel/logbooks/engine-log?vessel=dagon',
  }),
  L('Review & Sign-off', vLog, { existing: `${vLog}/review`, icon: ClipboardCheck }),
  L('Vessel Registry', vLog, { existing: `${vLog}/registry`, icon: Ship }),
  L('Records & Exports', vLog, { existing: `${vLog}/records`, icon: FileText }),
  L('Connections', vLog, { existing: `${vLog}/connections`, icon: Cpu }),
  L('Assurance', vLog, { existing: `${vLog}/assurance`, icon: Shield }),
];

// Vessel (general)
const vVessel = `${V}/general`;
const vesselVessel: NavChild[] = [
  L('Movement Reports', vVessel, { icon: FileText }),
  L('Movement Checklists', vVessel, { icon: CheckSquare }),
  L('Vessel Details', vVessel, { existing: '/vessels/list', icon: Ship }),
  L('Communications', vVessel, { icon: MessageSquare }),
  L('Emergency Contact', vVessel, { existing: '/vessels/emergency-details', icon: Phone }),
  L('Management Company', vVessel, { existing: '/vessels/company-details', icon: Building2 }),
  L('Flag & Class', vVessel, { icon: Globe }),
  L('Insurance', vVessel, { icon: Umbrella }),
  L('Billing', vVessel, { icon: Receipt }),
];

// Departments
const vDept = `${V}/departments`;
const standardDept6 = (base: string): NavChild[] => [
  L('Handover / Notes', base, { icon: FileText }),
  L('Work Lists / Job Cards', base, { icon: ClipboardList }),
  L('Rotas & Watchkeeping', base, { icon: Clock }),
  L('Inventory & Equipment', base, { icon: Package }),
  L('Checklists', base, { icon: CheckSquare }),
  L('Notes / Reference', base, { icon: BookOpen }),
];

const crewDeptBase = `${vDept}/crew`;
const galleyBase = `${crewDeptBase}/galley`;
const diveBase = `${crewDeptBase}/dive`;

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

const crewDepartments: NavChild[] = [
  G('Bridge',      crewDeptBase, standardDept6(`${crewDeptBase}/bridge`),      { icon: Anchor,    slug: 'bridge' }),
  G('Deck',        crewDeptBase, standardDept6(`${crewDeptBase}/deck`),        { icon: Compass,   slug: 'deck' }),
  G('Engineering', crewDeptBase, standardDept6(`${crewDeptBase}/engineering`), { icon: Wrench,    slug: 'engineering' }),
  G('Interior',    crewDeptBase, standardDept6(`${crewDeptBase}/interior`),    { icon: Sparkles,  slug: 'interior' }),
  G('Galley',      crewDeptBase, galleyChildren,                                { icon: Utensils,  slug: 'galley' }),
  L('Spa', crewDeptBase, { existing: '/health/spa', icon: Heart, slug: 'spa', crossLink: true }),
  G('Media',       crewDeptBase, standardDept6(`${crewDeptBase}/media`),       { icon: Camera,    slug: 'media' }),
  G('IT',          crewDeptBase, standardDept6(`${crewDeptBase}/it`),          { icon: Cpu,       slug: 'it' }),
  L('Medical', crewDeptBase, { existing: '/health/medical', icon: Stethoscope, slug: 'medical', crossLink: true }),
  G('Dive',        crewDeptBase, diveChildren,                                  { icon: Waves,     slug: 'dive' }),
];

const mgmtBase = `${vDept}/management`;
const managementOffice: NavChild[] = [
  // HR records are owned by the HRIS module; this is a cross-link only.
  L('HR', mgmtBase, { existing: '/hr', icon: Briefcase, slug: 'hr', crossLink: true, moduleKey: 'hr' }),
  L('Management Company', mgmtBase, { existing: '/vessels/company-details', icon: Building2 }),
  L('DPA / ISM Office', mgmtBase, { icon: Shield }),
  L('Procurement', mgmtBase, { icon: Truck }),
  L('Finance / Accounts', mgmtBase, { icon: Banknote }),
  // Legal Support & Ticketing module (src/modules/legal) at /departments/legal.
  L('Legal', mgmtBase, { existing: '/departments/legal', icon: ScrollText }),
  L('Insurance', mgmtBase, { icon: Umbrella }),
  L('Crewing & Recruitment', mgmtBase, { existing: '/hris/recruitment/vacancies', icon: Users, crossLink: true, moduleKey: 'hr' }),
];

const vesselDepartments: NavChild[] = [
  G('Crew Departments', vDept, crewDepartments, { icon: Users, slug: 'crew' }),
  G('Management / Office', vDept, managementOffice, { icon: Building, slug: 'management' }),
];

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

// ─── HEALTH & WELLNESS ───────────────────────────────────────────────────
// Medical leaves carry moduleKey `medical` and are hidden from anyone
// without clinical access. Spa / nutrition / physio / training carry
// `wellness`. Leaves a crew member may open to see only their own record
// are marked selfServe.
const H = '/health';
const MED: GateOpts = { moduleKey: 'medical' };
const MED_SELF: GateOpts = { moduleKey: 'medical', selfServe: true };
const WELL: GateOpts = { moduleKey: 'wellness' };
const WELL_SELF: GateOpts = { moduleKey: 'wellness', selfServe: true };

const medBase = `${H}/medical`;
const personnelMedBase = `${medBase}/personnel`;
const healthMedical: NavChild[] = [
  L('Dashboard', medBase, { icon: LayoutGrid, ...MED }),
  L('Patients', medBase, { icon: Users, ...MED }),
  L('Staff', medBase, { icon: Stethoscope, ...MED }),
  L('Supplies', medBase, { icon: Package, ...MED }),
  L('First Aid', medBase, { icon: LifeBuoy, ...MED }),
  L('Equipment', medBase, { icon: Wrench, ...MED }),
  L('Protocols', medBase, { icon: BookOpen, ...MED }),
  L('Logs', medBase, { icon: FileText, ...MED }),
  L('C.H.E.K.', medBase, { icon: GraduationCap, slug: 'chek', ...MED_SELF }),
  G('Personnel Medical Data', medBase, [
    L('Crew Medical Records', personnelMedBase, MED_SELF),
    L('Fitness-to-Work / ENG1', personnelMedBase, MED_SELF),
    L('Vaccinations & Immunisations', personnelMedBase, MED_SELF),
    L('Allergies & Conditions', personnelMedBase, MED_SELF),
    L('Medications', personnelMedBase, MED_SELF),
    L('Medical Certificates', personnelMedBase, MED_SELF),
    L('Next of Kin / Emergency', personnelMedBase, MED_SELF),
    L('Incident & Treatment History', personnelMedBase, MED_SELF),
  ], { icon: ClipboardCheck, slug: 'personnel', ...MED }),
];

const spaBase = `${H}/spa`;
const healthSpa: NavChild[] = [
  L('Dashboard', spaBase, { icon: LayoutGrid, ...WELL }),
  L('Calendar', spaBase, { icon: Calendar, ...WELL_SELF }),
  L('Clients', spaBase, { icon: Users, ...WELL }),
  L('Treatments', spaBase, { icon: Heart, ...WELL_SELF }),
  L('Inventory', spaBase, { icon: Package, ...WELL }),
];

const nutBase = `${H}/nutrition`;
const healthNutrition: NavChild[] = [
  L('Overview', nutBase, { icon: LayoutGrid, ...WELL_SELF }),
  L('Food Log', nutBase, { icon: FileText, ...WELL_SELF }),
  L('Calendar', nutBase, { icon: Calendar, ...WELL_SELF }),
  L('Goals', nutBase, { icon: ListChecks, ...WELL_SELF }),
  L('Settings', nutBase, { icon: Settings, moduleKey: 'wellness', minPermission: 'admin' }),
];

const physioBase = `${H}/physio`;
const healthPhysio: NavChild[] = [
  L('Rehab Protocols', physioBase, { icon: BookOpen, ...WELL }),
  L('Assessments', physioBase, { icon: ClipboardList, ...WELL }),
  L('Treatment Plans', physioBase, { icon: ClipboardCheck, ...WELL }),
  L('Session Log', physioBase, { icon: FileText, ...WELL }),
  L('Referrals', physioBase, { icon: MessageSquare, ...WELL }),
];

const ptBase = `${H}/personal-training`;
const trainerBase = `${ptBase}/trainer`;
const trainerAdminBase = `${trainerBase}/admin`;
const trainerAthletesBase = `${trainerBase}/athletes`;
const trainerProgrammingBase = `${trainerBase}/programming`;
const trainerSourcesBase = `${trainerAdminBase}/sources`;
const athleteBase = `${ptBase}/athlete`;
const healthPT: NavChild[] = [
  G('Trainer', ptBase, [
    L('Dashboard', trainerBase, { icon: LayoutGrid, ...WELL }),
    L('Schedule', trainerBase, { icon: Calendar, ...WELL }),
    G('Athletes', trainerBase, [
      L('Roster', trainerAthletesBase, WELL),
      L('Athlete Workspace', trainerAthletesBase, WELL),
      L('Active Programs', trainerAthletesBase, WELL),
    ], { icon: Users, slug: 'athletes', ...WELL }),
    G('Programming', trainerBase, [
      L('Templates', trainerProgrammingBase, WELL),
      L('Exercises', trainerProgrammingBase, WELL_SELF),
      L('Rehab Protocols', trainerProgrammingBase, WELL),
      L('Videos', trainerProgrammingBase, WELL_SELF),
    ], { icon: Dumbbell, slug: 'programming', ...WELL }),
    G('Admin', trainerBase, [
      L('Trainers', trainerAdminBase, WELL),
      G('Sources', trainerAdminBase, [
        L('ExerciseDB Import', trainerSourcesBase, { moduleKey: 'wellness', minPermission: 'admin' }),
        L('wger', trainerSourcesBase, { moduleKey: 'wellness', minPermission: 'admin' }),
        L('ExerciseDB API', trainerSourcesBase, { moduleKey: 'wellness', minPermission: 'admin' }),
        L('MuscleWiki', trainerSourcesBase, { moduleKey: 'wellness', minPermission: 'admin' }),
        L('AnatomyTOOL', trainerSourcesBase, { moduleKey: 'wellness', minPermission: 'admin' }),
        L('Z-Anatomy', trainerSourcesBase, { moduleKey: 'wellness', minPermission: 'admin' }),
      ], { icon: Layers, slug: 'sources', moduleKey: 'wellness', minPermission: 'admin' }),
    ], { icon: Settings, slug: 'admin', moduleKey: 'wellness', minPermission: 'admin' }),
  ], { icon: Dumbbell, slug: 'trainer', ...WELL }),
  G('Athlete', ptBase, [
    L('My Training', athleteBase, WELL_SELF),
    L('Progress', athleteBase, WELL_SELF),
    L('Profile', athleteBase, WELL_SELF),
  ], { icon: Activity, slug: 'athlete', ...WELL_SELF }),
];

const healthChildren: NavChild[] = [
  G('Medical', H, healthMedical, { icon: Stethoscope, slug: 'medical', ...MED_SELF }),
  G('Spa', H, healthSpa, { icon: Heart, slug: 'spa', ...WELL_SELF }),
  G('Nutrition', H, healthNutrition, { icon: Utensils, slug: 'nutrition', ...WELL_SELF }),
  G('Physio', H, healthPhysio, { icon: Activity, slug: 'physio', ...WELL }),
  G('Personal Training', H, healthPT, { icon: Dumbbell, slug: 'personal-training', ...WELL_SELF }),
];

// ─── YARD ────────────────────────────────────────────────────────────────
const Y = '/yard';

const refitBase = `${Y}/refit`;
const refitOverview = `${refitBase}/overview`;
const refitWorkflow = `${refitBase}/workflow`;
const refitProject = `${refitBase}/project`;
const refitDocs = `${refitBase}/documents`;
const refitFinance = `${refitBase}/finance`;
const refitCompliance = `${refitBase}/compliance`;
const refitProjects = `${refitBase}/projects`;
const refitAccount = `${refitBase}/account`;
const yardRefit: NavChild[] = [
  G('Overview', refitBase, [
    L('Dashboard', `${refitOverview}/dashboard`, { icon: LayoutGrid }),
    L('Approvals Centre', `${refitOverview}/approvals`),
    L('Notifications', `${refitOverview}/notifications`),
    L('Search', `${refitOverview}/search`),
  ], { icon: LayoutGrid, slug: 'overview' }),
  G('Workflow', refitBase, [
    L('Change Orders', `${refitWorkflow}/change-orders`),
    L('Crew Requests', `${refitWorkflow}/crew-requests`),
    L('Snags & Warranty', `${refitWorkflow}/snags`),
    L('Works Orders', `${refitWorkflow}/works`),
    L('Meetings', `${refitWorkflow}/meetings`),
    L('Risk Register', `${refitWorkflow}/risks`),
  ], { icon: Network, slug: 'workflow' }),
  G('Project', refitBase, [
    L('Schedule', `${refitProject}/schedule`),
    L('Logistics', `${refitProject}/logistics`),
    L('Inventory & Equipment', `${refitProject}/inventory`),
    L('Contractors', `${refitProject}/contractors`),
    L('Suppliers', `${refitProject}/suppliers`),
  ], { icon: ClipboardList, slug: 'project' }),
  G('Documents', refitBase, [
    L('Drawings & Plans', `${refitDocs}/drawings`),
    L('Document Control', `${refitDocs}/document-control`),
    L('Files', `${refitDocs}/files`),
  ], { icon: FileText, slug: 'documents' }),
  G('Finance', refitBase, [
    L('Budget', `${refitFinance}/budget`),
    L('Purchase Orders', `${refitFinance}/purchase-orders`),
    L('Invoices', `${refitFinance}/invoices`),
  ], { icon: Banknote, slug: 'finance' }),
  G('Compliance', refitBase, [
    L('Compliance', `${refitCompliance}/compliance`),
    L('Crew & Certification', `${refitCompliance}/crew`),
    L('Audit Log', `${refitCompliance}/audit-log`),
    L('Reporting', `${refitCompliance}/reporting`),
  ], { icon: Shield, slug: 'compliance' }),
  G('Refit / Projects', refitBase, [
    L('Refit Periods', refitProjects),
    L('Work Packages / Scopes', refitProjects),
    L('Defect & Snag Lists', refitProjects),
    L('Contractors & Subcontractors', refitProjects),
    L('Refit Inventory', refitProjects),
    L('Project Documents & Drawings', refitProjects),
  ], { icon: Hammer, slug: 'projects' }),
  G('Account & Admin', refitBase, [
    L('Access Profile', `${refitAccount}/access`),
    L('Communications', `${refitAccount}/communications`),
    L('Diagnostics', `${refitAccount}/diagnostics`),
    L('Access Check', `${refitAccount}/access-check`),
    L('Admin & Settings', `${refitAccount}/admin`),
    L('Import & API', `${refitAccount}/import`),
    L('Login Diagnostics', `${refitAccount}/login-diagnostics`),
  ], { icon: Settings, slug: 'account' }),
];

const newBuildBase = `${Y}/new-build`;
const nbOverview = `${newBuildBase}/overview`;
const nbWorkflow = `${newBuildBase}/workflow`;
const nbDisciplines = `${newBuildBase}/disciplines`;
const nbEquip = `${newBuildBase}/equipment`;
const nbDocs = `${newBuildBase}/documents`;
const nbConfig = `${newBuildBase}/configuration`;
const yardNewBuild: NavChild[] = [
  G('Overview', newBuildBase, [
    L('Dashboard', nbOverview),
    L('Build Phases', nbOverview),
    L('Requirements', nbOverview),
    L('Onboarding', nbOverview),
  ], { icon: LayoutGrid, slug: 'overview' }),
  G('Workflow', newBuildBase, [
    L('Change Orders', nbWorkflow),
    L('RAID Log', nbWorkflow),
    L('Approvals', nbWorkflow),
    L('Schedule', nbWorkflow),
  ], { icon: Network, slug: 'workflow' }),
  G('Disciplines', newBuildBase, [
    L('Areas', nbDisciplines),
    L('Interior', nbDisciplines),
    L('Naval Architecture', nbDisciplines),
    L('Piping', nbDisciplines),
    L('Deck Plan', nbDisciplines),
  ], { icon: Layers, slug: 'disciplines' }),
  G('Equipment & Procurement', newBuildBase, [
    L('Equipment', nbEquip),
    L('Purchase Orders', nbEquip),
  ], { icon: Wrench, slug: 'equipment' }),
  G('Documents', newBuildBase, [
    L('Files', nbDocs),
    L('Drawings', nbDocs),
    L('Yard Standards', nbDocs),
    L('Regulations', nbDocs),
  ], { icon: FileText, slug: 'documents' }),
  G('Configuration', newBuildBase, [
    L('Locations', nbConfig),
    L('RASCI', nbConfig),
    L('Suppliers', nbConfig),
    L('Contacts', nbConfig),
    L('Import', nbConfig),
  ], { icon: Settings, slug: 'configuration' }),
];

const yardChildren: NavChild[] = [
  G('Refit', Y, yardRefit, { icon: Hammer, slug: 'refit' }),
  G('New Build', Y, yardNewBuild, { icon: Pickaxe, slug: 'new-build' }),
];

// ─── HRIS ────────────────────────────────────────────────────────────────
const HR = '/hris';
const hrisEmpRec = `${HR}/employee-records`;
const hrisComp = `${HR}/compensation`;
const hrisPerf = `${HR}/performance`;
const hrisRecruit = `${HR}/recruitment`;
const hrisLeave = `${HR}/leave-and-rotation`;
// Every HR record leaf is gated on the RBAC `hr` module (view by default).
// Compensation and disciplinary need edit rights; see hr_can_* SQL helpers.
const hrView: GateOpts = { moduleKey: 'hr' };
const hrEdit: GateOpts = { moduleKey: 'hr', minPermission: 'edit' };
const hrisChildren: NavChild[] = [
  L('HR Dashboard', HR, { existing: '/hr', icon: LayoutGrid, ...hrView }),
  G('Employee Records', HR, [
    L('Personal Details', hrisEmpRec, hrView),
    L('Contracts & Employment', hrisEmpRec, hrView),
    L('Documents & Certificates', hrisEmpRec, hrView),
    L('Next of Kin / Emergency', hrisEmpRec, hrView),
    L('Employment History', hrisEmpRec, hrView),
  ], { icon: Users, slug: 'employee-records', ...hrView }),
  // Compensation is gated on the narrower `finance` module (DPA, purser,
  // fleet manager) rather than HR at large.
  G('Compensation', HR, [
    L('Salaries & Compensation', hrisComp, { moduleKey: 'finance' }),
    L('Payroll', hrisComp, { moduleKey: 'finance' }),
    L('Gratuities', hrisComp, { moduleKey: 'finance' }),
    L('Pay Reviews', hrisComp, { moduleKey: 'finance' }),
    L('Compensation Settings', hrisComp, { moduleKey: 'finance', minPermission: 'admin', icon: Settings }),
  ], { icon: Banknote, slug: 'compensation', moduleKey: 'finance' }),
  G('Performance', HR, [
    L('Annual Evaluations', hrisPerf, hrView),
    L('Annual Reviews', hrisPerf, hrView),
    L('End of Rotation', hrisPerf, hrView),
    L('Objectives & PDPs', hrisPerf, hrView),
    L('Disciplinary Matters', hrisPerf, hrEdit),
  ], { icon: ClipboardCheck, slug: 'performance', ...hrView }),
  G('Recruitment', HR, [
    L('Vacancies', hrisRecruit, hrView),
    L('Candidates', hrisRecruit, hrView),
    L('Onboarding', hrisRecruit, hrView),
  ], { icon: Search, slug: 'recruitment', ...hrView }),
  G('Leave & Rotation', HR, [
    L('Leave Planner', hrisLeave, { existing: '/crew/leave', icon: CalendarDays }),
    L('Leave Requests', hrisLeave, { existing: '/crew/leave/requests', icon: ClipboardList }),
    L('Leave Calculator', hrisLeave, { existing: '/crew/leave/calculator', icon: Clock }),
    L('Rotation Planner', hrisLeave, { existing: '/crew/rotation-planner', icon: Network }),
  ], { icon: CalendarDays, slug: 'leave-and-rotation' }),
  L('Training & Development', HR, { existing: '/development', icon: GraduationCap }),
  L('Compliance & Right to Work', HR, { icon: Shield, ...hrView }),
  L('Reporting & Analytics', HR, { icon: ClipboardList, ...hrView }),
];

// ─── TOP-LEVEL ────────────────────────────────────────────────────────────
export const NAVIGATION_ITEMS: NavItem[] = [
  { id: 'fleet', label: 'Fleet', icon: Ship, path: FLEET_BASE, permissions: ['all'], defaultOpen: true, children: fleetChildren },
  {
    id: 'vessel', label: 'Vessel', icon: Anchor, path: V, permissions: ['all'], defaultOpen: true,
    children: [
      G('Crew',         V, vesselCrew,        { icon: Users,      slug: 'crew' }),
      G('Safety',       V, vesselSafety,      { icon: Shield,     slug: 'safety' }),
      G('Certificates', V, vesselCertificates,{ icon: Award,      slug: 'certificates' }),
      G('Technical',    V, vesselTechnical,   { icon: Wrench,     slug: 'technical' }),
      G('Charter',      V, vesselCharter,     { icon: Compass,    slug: 'charter' }),
      G('Accounting',   V, vesselAccounting,  { icon: Banknote,   slug: 'accounting' }),
      G('Vessel',       V, vesselVessel,      { icon: Ship,       slug: 'general' }),
      G('Electronic Logbooks', V, vesselLogbooks, { icon: BookOpen, slug: 'logbooks' }),
      G('Departments',  V, vesselDepartments, { icon: Building,   slug: 'departments' }),
    ],
  },
  { id: 'shoreside', label: 'Shoreside', icon: Waves, path: SHORE, permissions: ['all'], children: shoresideChildren },
  { id: 'health', label: 'Health & Wellness', icon: Heart, path: H, permissions: ['all'], children: healthChildren },
  { id: 'yard', label: 'Yard', icon: Hammer, path: Y, permissions: ['all'], children: yardChildren },
  { id: 'hris', label: 'HRIS', icon: Briefcase, path: HR, permissions: ['all'], children: hrisChildren },
];

// ─── Flat list of generated placeholder paths ────────────────────────────
const PLACEHOLDER_PREFIXES = ['/fleet/', '/vessel/', '/shoreside/', '/health/', '/yard/', '/hris/'];

export interface SitemapLeaf {
  path: string;
  label: string;
}

function collectLeaves(items: (NavItem | NavChild)[], acc: SitemapLeaf[], groups: Set<string>): void {
  for (const it of items) {
    if ('children' in it && it.children?.length) {
      groups.add(it.path.split('?')[0]);
      collectLeaves(it.children, acc, groups);
    } else {
      acc.push({ path: it.path, label: it.label });
    }
  }
}

const _allLeaves: SitemapLeaf[] = [];
const _groupPaths = new Set<string>();
collectLeaves(NAVIGATION_ITEMS, _allLeaves, _groupPaths);

/** Unique placeholder leaves (only paths under our synthesized section roots).
 *  A path that is a group elsewhere in the tree is not a placeholder: it gets
 *  a section redirect instead (see SECTION_REDIRECTS). */
/** Leaves handled by real routes elsewhere (dynamic route params, ported
 *  modules) must never be turned into Coming Soon placeholders — static
 *  placeholder paths outrank dynamic routes in React Router's ranking. */
const IMPLEMENTED_PREFIXES = ['/vessel/logbooks/'];

export const PLACEHOLDER_LEAVES: SitemapLeaf[] = (() => {
  const seen = new Set<string>();
  const out: SitemapLeaf[] = [];
  for (const leaf of _allLeaves) {
    if (!PLACEHOLDER_PREFIXES.some((p) => leaf.path.startsWith(p))) continue;
    if (IMPLEMENTED_PREFIXES.some((p) => leaf.path.startsWith(p))) continue;
    if (seen.has(leaf.path)) continue;
    if (_groupPaths.has(leaf.path.split('?')[0])) continue;
    seen.add(leaf.path);
    out.push(leaf);
  }
  return out;
})();

// ─── Section / group redirects ───────────────────────────────────────────
// `/hris`, `/hris/employee-records`, … have no page of their own. Each one
// redirects to its first real (non-cross-link) leaf so bookmarks and typed
// URLs land somewhere useful instead of bouncing to the dashboard.
export interface SectionRedirect {
  from: string;
  to: string;
}

function firstLeaf(items: NavChild[] | undefined): string | null {
  for (const item of items ?? []) {
    if (item.crossLink) continue;
    if (item.children?.length) {
      const nested = firstLeaf(item.children);
      if (nested) return nested;
    } else {
      return item.path;
    }
  }
  return null;
}

function withModule(path: string, moduleId: string): string {
  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('module', moduleId);
  return `${pathname}?${params.toString()}`;
}

export const SECTION_REDIRECTS: SectionRedirect[] = (() => {
  const out: SectionRedirect[] = [];
  const seen = new Set<string>();
  const visit = (items: NavChild[] | undefined, moduleId: string) => {
    for (const item of items ?? []) {
      if (!item.children?.length) continue;
      const target = firstLeaf(item.children);
      if (target && PLACEHOLDER_PREFIXES.some((p) => item.path.startsWith(p)) && !seen.has(item.path)) {
        seen.add(item.path);
        out.push({ from: item.path, to: withModule(target, moduleId) });
      }
      visit(item.children, moduleId);
    }
  };
  for (const module of NAVIGATION_ITEMS) {
    const root = `${module.path}/`;
    if (PLACEHOLDER_PREFIXES.includes(root)) {
      const target = firstLeaf(module.children);
      if (target && !seen.has(module.path)) {
        seen.add(module.path);
        out.push({ from: module.path, to: withModule(target, module.id) });
      }
    }
    visit(module.children, module.id);
  }
  return out;
})();
