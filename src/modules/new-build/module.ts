/**
 * New Build module manifest (BUILD-PLAN B8; gap/00 A2). New Build is one
 * half of the Yard workspace (D-09); it keeps its URL prefix and shell.
 *
 * - routes: ./routes.tsx (page loaders), mounted in the Yard workspace.
 * - nav: the New Build group of the Yard sidebar (slot `workspace.yard`).
 *   Its leaves go live by having a route here (NEW_BUILD_PATHS).
 */
import { FileText, Layers, LayoutGrid, Network, Pickaxe, Settings, Wrench } from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import { G, L } from '@/config/navBuilders';
import type { NavChild } from '@/config/navigation-types';
import { NEW_BUILD_ROUTES } from './routes';

const Y = '/yard';
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
    // `register`, not the default `equipment`: `/equipment/equipment` repeats a segment.
    L('Equipment', nbEquip, { slug: 'register' }),
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

const manifest: ModuleManifest = {
  id: 'new-build',
  label: 'New Build',
  scopes: ['workspace'],
  routes: NEW_BUILD_ROUTES,
  nav: [{ slot: 'workspace.yard', order: 20, node: G('New Build', Y, yardNewBuild, { icon: Pickaxe, slug: 'new-build' }) }],
};

export default manifest;
