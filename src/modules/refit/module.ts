/**
 * Refit module manifest (BUILD-PLAN B8; gap/00 A2). Refit is one half of
 * the Yard workspace (D-09); it keeps its URL prefix and shell.
 *
 * - routes: ./routes.tsx (page loaders), mounted in the Yard workspace.
 * - nav: the Refit group of the Yard sidebar (slot `workspace.yard`).
 */
import {
  Banknote, ClipboardList, FileText, Hammer, LayoutGrid, Network, Settings, Shield,
} from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import { G, L } from '@/config/navBuilders';
import type { NavChild } from '@/config/navigation-types';
import { REFIT_PATHS } from './paths';
import { REFIT_ROUTES } from './routes';

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
// Each built Refit leaf passes `existing: REFIT_PATHS.<page>`, the route
// the page is registered on. The second argument only shapes the leaf id
// (unchanged, so saved sidebar order survives); it is never the path. The
// path used to be base + slug, which doubled the last segment.
const yardRefit: NavChild[] = [
  G('Overview', refitBase, [
    L('Dashboard', `${refitOverview}/dashboard`, { existing: REFIT_PATHS.dashboard, icon: LayoutGrid }),
    L('Approvals Centre', `${refitOverview}/approvals`, { existing: REFIT_PATHS.approvals }),
    L('Notifications', `${refitOverview}/notifications`, { existing: REFIT_PATHS.notifications }),
    L('Search', `${refitOverview}/search`, { existing: REFIT_PATHS.search }),
  ], { icon: LayoutGrid, slug: 'overview' }),
  G('Workflow', refitBase, [
    L('Change Orders', `${refitWorkflow}/change-orders`, { existing: REFIT_PATHS.changeOrders }),
    L('Crew Requests', `${refitWorkflow}/crew-requests`, { existing: REFIT_PATHS.crewRequests }),
    L('Snags & Warranty', `${refitWorkflow}/snags`, { existing: REFIT_PATHS.snags }),
    L('Works Orders', `${refitWorkflow}/works`, { existing: REFIT_PATHS.works }),
    L('Meetings', `${refitWorkflow}/meetings`, { existing: REFIT_PATHS.meetings }),
    L('Risk Register', `${refitWorkflow}/risks`, { existing: REFIT_PATHS.risks }),
  ], { icon: Network, slug: 'workflow' }),
  G('Project', refitBase, [
    L('Schedule', `${refitProject}/schedule`, { existing: REFIT_PATHS.schedule }),
    L('Logistics', `${refitProject}/logistics`, { existing: REFIT_PATHS.logistics }),
    L('Inventory & Equipment', `${refitProject}/inventory`, { existing: REFIT_PATHS.inventory }),
    L('Contractors', `${refitProject}/contractors`, { existing: REFIT_PATHS.contractors }),
    L('Suppliers', `${refitProject}/suppliers`, { existing: REFIT_PATHS.suppliers }),
  ], { icon: ClipboardList, slug: 'project' }),
  G('Documents', refitBase, [
    L('Drawings & Plans', `${refitDocs}/drawings`, { existing: REFIT_PATHS.drawings }),
    L('Document Control', `${refitDocs}/document-control`, { existing: REFIT_PATHS.documentControl }),
    L('Files', `${refitDocs}/files`, { existing: REFIT_PATHS.files }),
  ], { icon: FileText, slug: 'documents' }),
  G('Finance', refitBase, [
    L('Budget', `${refitFinance}/budget`, { existing: REFIT_PATHS.budget }),
    L('Purchase Orders', `${refitFinance}/purchase-orders`, { existing: REFIT_PATHS.purchaseOrders }),
    L('Invoices', `${refitFinance}/invoices`, { existing: REFIT_PATHS.invoices }),
  ], { icon: Banknote, slug: 'finance' }),
  G('Compliance', refitBase, [
    L('Compliance', `${refitCompliance}/compliance`, { existing: REFIT_PATHS.compliance }),
    L('Crew & Certification', `${refitCompliance}/crew`, { existing: REFIT_PATHS.crew }),
    L('Audit Log', `${refitCompliance}/audit-log`, { existing: REFIT_PATHS.auditLog }),
    L('Reporting', `${refitCompliance}/reporting`, { existing: REFIT_PATHS.reporting }),
  ], { icon: Shield, slug: 'compliance' }),
  // No pages yet: these stay Coming Soon placeholders.
  G('Refit / Projects', refitBase, [
    L('Refit Periods', refitProjects),
    L('Work Packages / Scopes', refitProjects),
    L('Defect & Snag Lists', refitProjects),
    L('Contractors & Subcontractors', refitProjects),
    L('Refit Inventory', refitProjects),
    L('Project Documents & Drawings', refitProjects),
  ], { icon: Hammer, slug: 'projects' }),
  G('Account & Admin', refitBase, [
    L('Access Profile', `${refitAccount}/access`, { existing: REFIT_PATHS.access }),
    L('Communications', `${refitAccount}/communications`, { existing: REFIT_PATHS.communications }),
    L('Diagnostics', `${refitAccount}/diagnostics`, { existing: REFIT_PATHS.diagnostics }),
    L('Access Check', `${refitAccount}/access-check`, { existing: REFIT_PATHS.accessCheck }),
    L('Admin & Settings', `${refitAccount}/admin`, { existing: REFIT_PATHS.admin }),
    L('Import & API', `${refitAccount}/import`, { existing: REFIT_PATHS.import }),
    L('Login Diagnostics', `${refitAccount}/login-diagnostics`, { existing: REFIT_PATHS.loginDiagnostics }),
  ], { icon: Settings, slug: 'account' }),
];

const manifest: ModuleManifest = {
  id: 'refit',
  label: 'Refit',
  scopes: ['workspace'],
  routes: REFIT_ROUTES,
  nav: [{ slot: 'workspace.yard', order: 10, node: G('Refit', Y, yardRefit, { icon: Hammer, slug: 'refit' }) }],
};

export default manifest;
