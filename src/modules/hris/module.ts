/**
 * HRIS module manifest (BUILD-PLAN B8; gap/00 A2). The HRIS workspace keeps
 * its URL prefix, shell and gates (D-09); this file only registers them.
 *
 * - routes: ./routes.tsx (page loaders, gates), mounted in the HRIS workspace.
 * - nav: the HRIS sidebar (slot `workspace.hris`) and the HRIS entry in the
 *   Fleet sidebar's WORKSPACES section.
 */
import {
  Banknote, CalendarDays, ClipboardCheck, ClipboardList, Clock, GraduationCap, LayoutGrid, Network, Search, Settings,
  Shield, Users, Briefcase,
} from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import { G, L, inSlot, type GateOpts } from '@/config/navBuilders';
import type { NavChild } from '@/config/navigation-types';
import { HRIS_ROUTES } from './routes';

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

const hrisTree: NavChild[] = [
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

const manifest: ModuleManifest = {
  id: 'hris',
  label: 'HRIS',
  scopes: ['workspace'],
  routes: HRIS_ROUTES,
  nav: [
    ...inSlot('workspace.hris', hrisTree),
    {
      slot: 'fleet.workspaces',
      order: 10,
      node: L('HRIS', '/fleet', { existing: HR, icon: Briefcase, crossLink: true, scope: 'workspace', moduleKey: 'hr' }),
    },
  ],
};

export default manifest;
