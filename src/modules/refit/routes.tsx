import type { ManifestPageLoader, RouteDef } from '@/app/registry/types';
import { REFIT_PATHS, REFIT_REDIRECTS } from './paths';

/**
 * Refit workspace routes, as data (BUILD-PLAN B8). The module manifest
 * (./module.ts) registers them and the router mounts them inside the Yard
 * workspace scope. Every page is signed-in only and renders inside the Refit
 * shell. The sitemap's Refit leaves point at the same REFIT_PATHS.
 */
const page = (path: string, loader: ManifestPageLoader): RouteDef => ({
  scope: 'workspace',
  workspace: 'yard',
  path,
  page: loader,
  guard: { kind: 'login' },
  layout: 'refit-shell',
});

export const REFIT_ROUTES: readonly RouteDef[] = [
  page(REFIT_PATHS.dashboard, () => import('./pages/Dashboard')),
  page(REFIT_PATHS.approvals, () => import('./pages/approvals')),
  page(REFIT_PATHS.notifications, () => import('./pages/notifications')),
  page(REFIT_PATHS.search, () => import('./pages/search')),
  page(REFIT_PATHS.changeOrders, () => import('./pages/change-orders')),
  page(REFIT_PATHS.crewRequests, () => import('./pages/crew-requests')),
  page(REFIT_PATHS.snags, () => import('./pages/snags')),
  page(REFIT_PATHS.works, () => import('./pages/works')),
  page(REFIT_PATHS.meetings, () => import('./pages/meetings')),
  page(REFIT_PATHS.risks, () => import('./pages/risks')),
  page(REFIT_PATHS.schedule, () => import('./pages/schedule')),
  page(REFIT_PATHS.logistics, () => import('./pages/logistics')),
  page(REFIT_PATHS.inventory, () => import('./pages/inventory')),
  page(REFIT_PATHS.contractors, () => import('./pages/contractors')),
  page(REFIT_PATHS.suppliers, () => import('./pages/suppliers')),
  page(REFIT_PATHS.drawings, () => import('./pages/drawings')),
  page(REFIT_PATHS.documentControl, () => import('./pages/document-control')),
  page(REFIT_PATHS.files, () => import('./pages/files')),
  page(REFIT_PATHS.budget, () => import('./pages/budget')),
  page(REFIT_PATHS.purchaseOrders, () => import('./pages/purchase-orders')),
  page(REFIT_PATHS.invoices, () => import('./pages/invoices')),
  page(REFIT_PATHS.compliance, () => import('./pages/compliance')),
  page(REFIT_PATHS.crew, () => import('./pages/crew')),
  page(REFIT_PATHS.auditLog, () => import('./pages/audit-log')),
  page(REFIT_PATHS.reporting, () => import('./pages/reporting')),
  page(REFIT_PATHS.access, () => import('./pages/access')),
  page(REFIT_PATHS.communications, () => import('./pages/communications')),
  page(REFIT_PATHS.diagnostics, () => import('./pages/session-diagnostics')),
  page(REFIT_PATHS.accessCheck, () => import('./pages/access-check')),
  page(REFIT_PATHS.admin, () => import('./pages/admin')),
  page(REFIT_PATHS.import, () => import('./pages/import')),
  page(REFIT_PATHS.loginDiagnostics, () => import('./pages/login-diagnostics')),
  // Old or shorthand Refit URLs the ported pages link to (see REFIT_REDIRECTS).
  ...REFIT_REDIRECTS.map(({ from, to }): RouteDef => ({ scope: 'workspace', workspace: 'yard', path: from, redirectTo: to })),
];
