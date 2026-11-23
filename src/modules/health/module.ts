/**
 * Health & Wellness module manifest (BUILD-PLAN B8; gap/00 A2). The
 * workspace keeps its URL prefix, shell and gates (D-09); this file only
 * registers them.
 *
 * - routes: ./routes.tsx (page loaders, clinical and wellness gates),
 *   mounted in the Health workspace.
 * - nav: the Health sidebar (slot `workspace.health`) and the Health entry
 *   in the Fleet sidebar's WORKSPACES section.
 */
import {
  Activity, BookOpen, Calendar, ClipboardCheck, ClipboardList, Dumbbell, FileText, Flower2, GraduationCap, Heart, Layers,
  LayoutGrid, LifeBuoy, ListChecks, MessageSquare, Package, Settings, Stethoscope, Users, Utensils, Wrench,
} from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import { G, L, inSlot, type GateOpts } from '@/config/navBuilders';
import type { NavChild } from '@/config/navigation-types';
import { HEALTH_ROUTES } from './routes';

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

const healthTree: NavChild[] = [
  G('Medical', H, healthMedical, { icon: Stethoscope, slug: 'medical', ...MED_SELF }),
  G('Spa', H, healthSpa, { icon: Flower2, slug: 'spa', ...WELL_SELF }),
  G('Nutrition', H, healthNutrition, { icon: Utensils, slug: 'nutrition', ...WELL_SELF }),
  G('Physio', H, healthPhysio, { icon: Activity, slug: 'physio', ...WELL }),
  G('Personal Training', H, healthPT, { icon: Dumbbell, slug: 'personal-training', ...WELL_SELF }),
];

const manifest: ModuleManifest = {
  id: 'health',
  label: 'Health & Wellness',
  scopes: ['workspace'],
  routes: HEALTH_ROUTES,
  nav: [
    ...inSlot('workspace.health', healthTree),
    {
      slot: 'fleet.workspaces',
      order: 20,
      node: L('Health & Wellness', '/fleet', {
        existing: H, icon: Heart, crossLink: true, scope: 'workspace', moduleKey: 'health', selfServe: true,
      }),
    },
  ],
};

export default manifest;
