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
import { IMPLEMENTED_ROUTE_PATHS } from './implementedRoutes';

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
function L(
  label: string,
  base: string,
  opts: { existing?: string; icon?: LucideIcon; slug?: string } = {},
): NavChild {
  const s = opts.slug ?? slug(label);
  const path = opts.existing ?? `${base}/${s}`;
  return { id: `${base}-${s}`.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+/, ''), label, path, icon: opts.icon ?? def };
}

/** Build a group (collapsible child with its own children) under a base path. */
function G(
  label: string,
  base: string,
  children: NavChild[],
  opts: { icon?: LucideIcon; slug?: string } = {},
): NavChild {
  const s = opts.slug ?? slug(label);
  return {
    id: `${base}-${s}`.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+/, ''),
    label,
    path: `${base}/${s}`,
    icon: opts.icon ?? def,
    children,
  };
}

// ─── FLEET ────────────────────────────────────────────────────────────────
const FLEET_BASE = '/fleet';
const fleetChildren: NavChild[] = [
  L('Fleet Dashboard', FLEET_BASE, { existing: '/dashboard', icon: LayoutDashboard }),
  L('Fleet Scheduler', FLEET_BASE, { existing: '/itinerary/planning', icon: CalendarDays }),
  L('Fleet Tracker', FLEET_BASE, { existing: '/fleet-map', icon: MapIcon }),
  L('Fleet Reports', FLEET_BASE, { existing: '/reports', icon: ClipboardList }),
  L('Fleet Calendar', FLEET_BASE, { existing: '/itinerary/timeline', icon: Calendar }),
  L('Fleet Rotation Planner', FLEET_BASE, { existing: '/crew/rotation-planner', icon: Network }),
  L('Fleet Documents', FLEET_BASE, { existing: '/documents', icon: FileText }),
  L('Fleet Checklists', FLEET_BASE, { existing: '/ism/checklists', icon: CheckSquare }),
  L('Vessels', FLEET_BASE, { existing: '/vessels/dashboard', icon: Ship }),
  L('Users & Access', FLEET_BASE, { existing: '/admin/users', icon: Users }),
  L('Notification Management', FLEET_BASE, { existing: '/settings/notifications', icon: Bell }),
  L('Support Tickets', FLEET_BASE, { existing: '/admin/feedback', icon: LifeBuoy }),
  L('Account', FLEET_BASE, { existing: '/settings/account-details', icon: Settings }),
];

// ─── VESSEL ───────────────────────────────────────────────────────────────
const V = '/vessel';

// Crew
const vCrew = `${V}/crew`;
const vesselCrew: NavChild[] = [
  L('Crew List', vCrew, { existing: '/crew/list', icon: Users }),
  L('Crew Compliance', vCrew, { existing: '/crew/certificates', icon: ClipboardCheck }),
  L('Leave', vCrew, { existing: '/crew/leave', icon: CalendarDays }),
  L('Crewing', vCrew, { existing: '/crew/list', icon: Users }),
  L('Rotation Planner', vCrew, { existing: '/crew/rotation-planner', icon: Network }),
  L('Hours of Rest', vCrew, { existing: '/crew/work-rest', icon: Clock }),
  L('Crew Training', vCrew, { existing: '/development/crew-training', icon: GraduationCap }),
  L('Familiarisation Forms', vCrew, { existing: '/training', icon: FileCheck }),
  L('Performance Appraisals', vCrew, { existing: '/hr?tab=annual-evaluations', icon: ClipboardList }),
  L('Employment History', vCrew, { existing: '/crew/list', icon: ScrollText }),
];

// Safety
const vSafety = `${V}/safety`;
const sopBase = `${vSafety}/sops`;
const standingBase = `${vSafety}/standing-orders`;
const vesselSafety: NavChild[] = [
  L('SMS Summary', vSafety, { existing: '/documents/ism-sms', icon: Shield }),
  L('Drills', vSafety, { existing: '/ism/drills', icon: Siren }),
  L('Permit to Work', vSafety, { existing: '/ism/permits-to-work', icon: HardHat }),
  L('SMS Forms', vSafety, { existing: '/ism/miscellaneous', icon: FileText }),
  L('Checklists', vSafety, { existing: '/ism/checklists', icon: CheckSquare }),
  L('Risk Assessments', vSafety, { existing: '/ism/risk-assessments', icon: AlertTriangle }),
  L('Vessel Specific Manuals', vSafety, { existing: '/documents/manuals', icon: BookOpen }),
  L('Crew Duties & Responsibilities', vSafety, { existing: '/documents/procedures', icon: ClipboardList }),
  G('Standing Orders', vSafety, [
    L("Master's Standing Orders", standingBase, { existing: '/documents/policies' }),
    L("Chief Engineer's Standing Orders", standingBase, { existing: '/documents/policies' }),
  ], { icon: ScrollText, slug: 'standing-orders' }),
  L('Muster List', vSafety, { existing: '/ism/checklists', icon: ListChecks }),
  L('Safety Management Manual', vSafety, { existing: '/documents/ism-sms', icon: BookMarked }),
  L('Safety Documents', vSafety, { existing: '/documents', icon: FileText }),
  G('SOPs', vSafety, [
    L('Bridge SOPs', sopBase, { existing: '/ism/sops' }),
    L('Deck SOPs', sopBase, { existing: '/ism/sops' }),
    L('Engineering SOPs', sopBase, { existing: '/ism/sops' }),
    L('Galley SOPs', sopBase, { existing: '/ism/sops' }),
    L('Interior SOPs', sopBase, { existing: '/ism/sops' }),
    L('Medic SOPs', sopBase, { existing: '/ism/sops' }),
  ], { icon: BookOpen, slug: 'sops' }),
  L('Pollution', vSafety, { existing: '/compliance', icon: Waves }),
  L('Emergency Response', vSafety, { existing: '/ism/erm', icon: AlertCircle }),
  L('Flag Policy & Advice', vSafety, { existing: '/documents/policies', icon: Globe }),
  L('Agent Information', vSafety, { icon: Phone }),
  L('NTVRP / OPA 90', vSafety, { existing: '/compliance', icon: Shield }),
];

// Certificates
const vCerts = `${V}/certificates`;
const vesselCertificates: NavChild[] = [
  L('Status Summary', vCerts, { existing: '/certificates', icon: LayoutGrid }),
  L('Registration', vCerts, { existing: '/certificates/vessel', icon: FileCheck }),
  L('Class / Tonnage / Loadline', vCerts, { existing: '/certificates/vessel', icon: Layers }),
  L('Safety', vCerts, { existing: '/certificates/vessel', icon: Shield }),
  L('Security', vCerts, { existing: '/certificates/vessel', icon: Anchor }),
  L('Maritime Labour Compliance', vCerts, { existing: '/compliance', icon: Users }),
  L('Environment', vCerts, { existing: '/certificates/vessel', icon: Waves }),
  L('Radio', vCerts, { existing: '/certificates/vessel', icon: Headphones }),
  L('Insurance', vCerts, { existing: '/insurance', icon: Umbrella }),
  L('Fiscal', vCerts, { existing: '/certificates/vessel', icon: Receipt }),
  L('LSA / FFE / Medical', vCerts, { existing: '/certificates/vessel', icon: LifeBuoy }),
  L('Fleet Certificates', vCerts, { existing: '/certificates', icon: Award }),
];

// Technical
const vTech = `${V}/technical`;
const vesselTechnical: NavChild[] = [
  L('Maintenance Summary', vTech, { existing: '/maintenance/dashboard', icon: LayoutGrid }),
  L('Tasks', vTech, { existing: '/crew/tasks', icon: ClipboardList }),
  L('Operational Checklists', vTech, { existing: '/ism/checklists', icon: CheckSquare }),
  L('Equipment', vTech, { existing: '/maintenance/critical', icon: Wrench }),
  L('Inventory', vTech, { existing: '/maintenance/spares', icon: Package }),
  L('Purchase Orders', vTech, { icon: Receipt }),
  L('Maintenance Periods', vTech, { icon: Calendar }),
  L('Surveys', vTech, { existing: '/ism/audits-surveys', icon: ClipboardCheck }),
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
  L('Payroll', vAcct, { existing: '/hr?tab=salaries-compensation', icon: Banknote }),
  L('Gratuities', vAcct, { icon: Sparkles }),
  L('Budgets & Reporting', vAcct, { existing: '/reports', icon: ClipboardList }),
];

// Vessel (general)
const vVessel = `${V}/general`;
const vesselVessel: NavChild[] = [
  L('Movement Reports', vVessel, { icon: FileText }),
  L('Movement Checklists', vVessel, { existing: '/ism/checklists', icon: CheckSquare }),
  L('Vessel Details', vVessel, { existing: '/vessels/list', icon: Ship }),
  L('Communications', vVessel, { icon: MessageSquare }),
  L('Emergency Contact', vVessel, { existing: '/vessels/emergency-details', icon: Phone }),
  L('Management Company', vVessel, { existing: '/vessels/company-details', icon: Building2 }),
  L('Flag & Class', vVessel, { existing: '/vessels/list', icon: Globe }),
  L('Insurance', vVessel, { existing: '/insurance', icon: Umbrella }),
  L('Billing', vVessel, { icon: Receipt }),
];

// Departments
const vDept = `${V}/departments`;
const standardDept6 = (base: string): NavChild[] => [
  L('Handover / Notes', base, { icon: FileText }),
  L('Work Lists / Job Cards', base, { existing: '/maintenance/defects', icon: ClipboardList }),
  L('Rotas & Watchkeeping', base, { existing: '/crew/work-rest', icon: Clock }),
  L('Inventory & Equipment', base, { existing: '/maintenance/spares', icon: Package }),
  L('Checklists', base, { existing: '/checklists', icon: CheckSquare }),
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
  L('Galley SOPs', galleyBase, { existing: '/ism/sops', icon: BookOpen }),
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
    L('Equipment Register', `${diveBase}/tools`, { existing: '/maintenance/critical' }),
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
  L('Spa', crewDeptBase, { existing: '/health/spa', icon: Heart, slug: 'spa' }),
  G('Media',       crewDeptBase, standardDept6(`${crewDeptBase}/media`),       { icon: Camera,    slug: 'media' }),
  G('IT',          crewDeptBase, standardDept6(`${crewDeptBase}/it`),          { icon: Cpu,       slug: 'it' }),
  L('Medical', crewDeptBase, { existing: '/health/medical', icon: Stethoscope, slug: 'medical' }),
  G('Dive',        crewDeptBase, diveChildren,                                  { icon: Waves,     slug: 'dive' }),
];

const mgmtBase = `${vDept}/management`;
const hrSubBase = `${mgmtBase}/hr`;
const managementOffice: NavChild[] = [
  G('HR', mgmtBase, [
    L('Contracts & Employment', hrSubBase, { existing: '/hr?tab=contracts-employment' }),
    L('Salaries & Compensation', hrSubBase, { existing: '/hr?tab=salaries-compensation' }),
    L('Payroll', hrSubBase, { existing: '/hr?tab=salaries-compensation' }),
    L('Annual Evaluations', hrSubBase, { existing: '/hr?tab=annual-evaluations' }),
    L('Annual Reviews', hrSubBase, { existing: '/hr?tab=annual-reviews' }),
    L('Pay Reviews', hrSubBase, { existing: '/hr?tab=pay-reviews' }),
    L('End of Rotation', hrSubBase, { existing: '/hr?tab=end-of-rotation' }),
  ], { icon: Briefcase, slug: 'hr' }),
  L('Management Company', mgmtBase, { existing: '/vessels/company-details', icon: Building2 }),
  L('DPA / ISM Office', mgmtBase, { existing: '/dpa-dashboard', icon: Shield }),
  L('Procurement', mgmtBase, { icon: Truck }),
  L('Finance / Accounts', mgmtBase, { existing: '/hr?tab=salaries-compensation', icon: Banknote }),
  L('Legal', mgmtBase, { icon: ScrollText }),
  L('Insurance', mgmtBase, { existing: '/insurance', icon: Umbrella }),
  L('Crewing & Recruitment', mgmtBase, { existing: '/crew/list', icon: Users }),
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
const H = '/health';

const medBase = `${H}/medical`;
const personnelMedBase = `${medBase}/personnel`;
const healthMedical: NavChild[] = [
  L('Dashboard', medBase, { icon: LayoutGrid }),
  L('Patients', medBase, { icon: Users }),
  L('Staff', medBase, { icon: Users }),
  L('Supplies', medBase, { icon: Package }),
  L('First Aid', medBase, { icon: LifeBuoy }),
  L('Equipment', medBase, { icon: Wrench }),
  L('Protocols', medBase, { icon: BookOpen }),
  L('Logs', medBase, { icon: FileText }),
  L('C.H.E.K.', medBase, { icon: GraduationCap, slug: 'chek' }),
  G('Personnel Medical Data', medBase, [
    L('Crew Medical Records', personnelMedBase),
    L('Fitness-to-Work / ENG1', personnelMedBase),
    L('Vaccinations & Immunisations', personnelMedBase),
    L('Allergies & Conditions', personnelMedBase),
    L('Medications', personnelMedBase),
    L('Medical Certificates', personnelMedBase),
    L('Next of Kin / Emergency', personnelMedBase),
    L('Incident & Treatment History', personnelMedBase),
  ], { icon: ClipboardCheck, slug: 'personnel' }),
];

const spaBase = `${H}/spa`;
const healthSpa: NavChild[] = [
  L('Dashboard', spaBase, { icon: LayoutGrid }),
  L('Calendar', spaBase, { icon: Calendar }),
  L('Clients', spaBase, { icon: Users }),
  L('Treatments', spaBase, { icon: Heart }),
  L('Inventory', spaBase, { icon: Package }),
];

const nutBase = `${H}/nutrition`;
const healthNutrition: NavChild[] = [
  L('Overview', nutBase, { icon: LayoutGrid }),
  L('Food Log', nutBase, { icon: FileText }),
  L('Calendar', nutBase, { icon: Calendar }),
  L('Goals', nutBase, { icon: ListChecks }),
  L('Settings', nutBase, { icon: Settings }),
];

const physioBase = `${H}/physio`;
const healthPhysio: NavChild[] = [
  L('Rehab Protocols', physioBase, { icon: BookOpen }),
  L('Assessments', physioBase, { icon: ClipboardList }),
  L('Treatment Plans', physioBase, { icon: ClipboardCheck }),
  L('Session Log', physioBase, { icon: FileText }),
  L('Referrals', physioBase, { icon: MessageSquare }),
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
    L('Dashboard', trainerBase, { icon: LayoutGrid }),
    L('Schedule', trainerBase, { icon: Calendar }),
    G('Athletes', trainerBase, [
      L('Roster', trainerAthletesBase),
      L('Athlete Workspace', trainerAthletesBase),
      L('Active Programs', trainerAthletesBase),
    ], { icon: Users, slug: 'athletes' }),
    G('Programming', trainerBase, [
      L('Templates', trainerProgrammingBase),
      L('Exercises', trainerProgrammingBase),
      L('Rehab Protocols', trainerProgrammingBase),
      L('Videos', trainerProgrammingBase),
    ], { icon: Dumbbell, slug: 'programming' }),
    G('Admin', trainerBase, [
      L('Trainers', trainerAdminBase),
      G('Sources', trainerAdminBase, [
        L('ExerciseDB Import', trainerSourcesBase),
        L('wger', trainerSourcesBase),
        L('ExerciseDB API', trainerSourcesBase),
        L('MuscleWiki', trainerSourcesBase),
        L('AnatomyTOOL', trainerSourcesBase),
        L('Z-Anatomy', trainerSourcesBase),
      ], { icon: Layers, slug: 'sources' }),
    ], { icon: Settings, slug: 'admin' }),
  ], { icon: Dumbbell, slug: 'trainer' }),
  G('Athlete', ptBase, [
    L('My Training', athleteBase),
    L('Progress', athleteBase),
    L('Profile', athleteBase),
  ], { icon: Activity, slug: 'athlete' }),
];

const healthChildren: NavChild[] = [
  G('Medical', H, healthMedical, { icon: Stethoscope, slug: 'medical' }),
  G('Spa', H, healthSpa, { icon: Heart, slug: 'spa' }),
  G('Nutrition', H, healthNutrition, { icon: Utensils, slug: 'nutrition' }),
  G('Physio', H, healthPhysio, { icon: Activity, slug: 'physio' }),
  G('Personal Training', H, healthPT, { icon: Dumbbell, slug: 'personal-training' }),
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
    L('Dashboard', refitOverview, { icon: LayoutGrid, slug: 'dashboard' }),
    L('Approvals Centre', refitOverview, { slug: 'approvals' }),
    L('Notifications', refitOverview, { slug: 'notifications' }),
    L('Search', refitOverview, { slug: 'search' }),
  ], { icon: LayoutGrid, slug: 'overview' }),
  G('Workflow', refitBase, [
    L('Change Orders', refitWorkflow, { slug: 'change-orders' }),
    L('Crew Requests', refitWorkflow, { slug: 'crew-requests' }),
    L('Snags & Warranty', refitWorkflow, { slug: 'snags' }),
    L('Works Orders', refitWorkflow, { slug: 'works' }),
    L('Meetings', refitWorkflow, { slug: 'meetings' }),
    L('Risk Register', refitWorkflow, { slug: 'risks' }),
  ], { icon: Network, slug: 'workflow' }),
  G('Project', refitBase, [
    L('Schedule', refitProject, { slug: 'schedule' }),
    L('Logistics', refitProject, { slug: 'logistics' }),
    L('Inventory & Equipment', refitProject, { slug: 'inventory' }),
    L('Contractors', refitProject, { slug: 'contractors' }),
    L('Suppliers', refitProject, { slug: 'suppliers' }),
  ], { icon: ClipboardList, slug: 'project' }),
  G('Documents', refitBase, [
    L('Drawings & Plans', refitDocs, { slug: 'drawings' }),
    L('Document Control', refitDocs, { slug: 'document-control' }),
    L('Files', refitDocs, { slug: 'files' }),
  ], { icon: FileText, slug: 'documents' }),
  G('Finance', refitBase, [
    L('Budget', refitFinance, { slug: 'budget' }),
    L('Purchase Orders', refitFinance, { slug: 'purchase-orders' }),
    L('Invoices', refitFinance, { slug: 'invoices' }),
  ], { icon: Banknote, slug: 'finance' }),
  G('Compliance', refitBase, [
    L('Compliance', refitCompliance, { slug: 'compliance' }),
    L('Crew & Certification', refitCompliance, { slug: 'crew' }),
    L('Audit Log', refitCompliance, { slug: 'audit-log' }),
    L('Reporting', refitCompliance, { slug: 'reporting' }),
  ], { icon: Shield, slug: 'compliance' }),
  G('Refit / Projects', refitBase, [
    L('Refit Periods', refitProjects, { existing: '/yard/refit/project/schedule', slug: 'refit-periods' }),
    L('Work Packages / Scopes', refitProjects, { existing: '/yard/refit/workflow/works', slug: 'work-packages-scopes' }),
    L('Defect & Snag Lists', refitProjects, { existing: '/yard/refit/workflow/snags', slug: 'defect-and-snag-lists' }),
    L('Contractors & Subcontractors', refitProjects, { existing: '/yard/refit/project/contractors', slug: 'contractors-and-subcontractors' }),
    L('Refit Inventory', refitProjects, { existing: '/yard/refit/project/inventory', slug: 'refit-inventory' }),
    L('Project Documents & Drawings', refitProjects, { existing: '/yard/refit/documents/files', slug: 'project-documents-and-drawings' }),
  ], { icon: Hammer, slug: 'projects' }),
  G('Account & Admin', refitBase, [
    L('Access Profile', refitAccount, { slug: 'access' }),
    L('Communications', refitAccount, { slug: 'communications' }),
    L('Diagnostics', refitAccount, { slug: 'diagnostics' }),
    L('Access Check', refitAccount, { slug: 'access-check' }),
    L('Admin & Settings', refitAccount, { slug: 'admin' }),
    L('Import & API', refitAccount, { slug: 'import' }),
    L('Login Diagnostics', refitAccount, { slug: 'login-diagnostics' }),
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
const hrisChildren: NavChild[] = [
  L('HR Dashboard', HR, { existing: '/hr', icon: LayoutGrid }),
  G('Employee Records', HR, [
    L('Personal Details', hrisEmpRec, { existing: '/crew/list' }),
    L('Contracts & Employment', hrisEmpRec, { existing: '/hr?tab=contracts-employment' }),
    L('Documents & Certificates', hrisEmpRec, { existing: '/crew/certificates' }),
    L('Next of Kin / Emergency', hrisEmpRec, { existing: '/crew/list' }),
    L('Employment History', hrisEmpRec, { existing: '/crew/list' }),
  ], { icon: Users, slug: 'employee-records' }),
  G('Compensation', HR, [
    L('Salaries & Compensation', hrisComp, { existing: '/hr?tab=salaries-compensation' }),
    L('Payroll', hrisComp, { existing: '/hr?tab=salaries-compensation' }),
    L('Gratuities', hrisComp),
    L('Pay Reviews', hrisComp, { existing: '/hr?tab=pay-reviews' }),
  ], { icon: Banknote, slug: 'compensation' }),
  G('Performance', HR, [
    L('Annual Evaluations', hrisPerf, { existing: '/hr?tab=annual-evaluations' }),
    L('Annual Reviews', hrisPerf, { existing: '/hr?tab=annual-reviews' }),
    L('Objectives & PDPs', hrisPerf, { existing: '/development/my' }),
    L('End of Rotation', hrisPerf, { existing: '/hr?tab=end-of-rotation' }),
  ], { icon: ClipboardCheck, slug: 'performance' }),
  G('Recruitment', HR, [
    L('Vacancies', hrisRecruit),
    L('Candidates', hrisRecruit),
    L('Onboarding', hrisRecruit),
    L('Crewing & Recruitment', hrisRecruit, { existing: '/crew/list' }),
  ], { icon: Search, slug: 'recruitment' }),
  L('Leave & Rotation', HR, { existing: '/crew/leave', icon: CalendarDays }),
  L('Training & Development', HR, { existing: '/development', icon: GraduationCap }),
  L('Compliance & Right to Work', HR, { existing: '/compliance', icon: Shield }),
  L('Reporting & Analytics', HR, { existing: '/reports', icon: ClipboardList }),
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

function collectLeaves(items: (NavItem | NavChild)[], acc: SitemapLeaf[]): void {
  for (const it of items) {
    if ('children' in it && it.children?.length) {
      collectLeaves(it.children, acc);
    } else {
      acc.push({ path: it.path, label: it.label });
    }
  }
}

const _allLeaves: SitemapLeaf[] = [];
collectLeaves(NAVIGATION_ITEMS, _allLeaves);

/** Unique placeholder leaves (only paths under our synthesized section roots). */
export const PLACEHOLDER_LEAVES: SitemapLeaf[] = (() => {
  const seen = new Set<string>();
  const out: SitemapLeaf[] = [];
  for (const leaf of _allLeaves) {
    if (!PLACEHOLDER_PREFIXES.some((p) => leaf.path.startsWith(p))) continue;
    if (seen.has(leaf.path)) continue;
    if (IMPLEMENTED_ROUTE_PATHS.has(leaf.path)) continue;
    seen.add(leaf.path);
    out.push(leaf);
  }
  return out;
})();