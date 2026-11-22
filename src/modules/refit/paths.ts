/**
 * Route paths for the Refit workspace (`/yard/refit/<group>/<page>`).
 *
 * The sitemap and `routes.tsx` both read these, so a sidebar leaf can never
 * drift from the page it opens. (The sidebar used to append the leaf slug to
 * a base that already ended in it, giving `/yard/refit/overview/dashboard/
 * dashboard`; all 32 leaves then fell through to Coming Soon.)
 *
 * Paths are written out in full, as plain strings, because the sitemap
 * target tests read this file's literals.
 */
export const REFIT_PATHS = {
  root: '/yard/refit',
  // Overview
  dashboard: '/yard/refit/overview/dashboard',
  approvals: '/yard/refit/overview/approvals',
  notifications: '/yard/refit/overview/notifications',
  search: '/yard/refit/overview/search',
  // Workflow
  changeOrders: '/yard/refit/workflow/change-orders',
  crewRequests: '/yard/refit/workflow/crew-requests',
  snags: '/yard/refit/workflow/snags',
  works: '/yard/refit/workflow/works',
  meetings: '/yard/refit/workflow/meetings',
  risks: '/yard/refit/workflow/risks',
  // Project
  schedule: '/yard/refit/project/schedule',
  logistics: '/yard/refit/project/logistics',
  inventory: '/yard/refit/project/inventory',
  contractors: '/yard/refit/project/contractors',
  suppliers: '/yard/refit/project/suppliers',
  // Documents
  drawings: '/yard/refit/documents/drawings',
  documentControl: '/yard/refit/documents/document-control',
  files: '/yard/refit/documents/files',
  // Finance
  budget: '/yard/refit/finance/budget',
  purchaseOrders: '/yard/refit/finance/purchase-orders',
  invoices: '/yard/refit/finance/invoices',
  // Compliance. The overview page was `/compliance/compliance`; that path
  // repeated a segment, so it now redirects here (see REFIT_REDIRECTS).
  compliance: '/yard/refit/compliance/overview',
  crew: '/yard/refit/compliance/crew',
  auditLog: '/yard/refit/compliance/audit-log',
  reporting: '/yard/refit/compliance/reporting',
  // Account & admin
  access: '/yard/refit/account/access',
  communications: '/yard/refit/account/communications',
  diagnostics: '/yard/refit/account/diagnostics',
  accessCheck: '/yard/refit/account/access-check',
  admin: '/yard/refit/account/admin',
  import: '/yard/refit/account/import',
  loginDiagnostics: '/yard/refit/account/login-diagnostics',
} as const;

/**
 * Old or shorthand Refit URLs and the page each one now opens.
 *
 * The ported Refit pages link to flat paths (`/yard/refit/approvals`,
 * `/yard/refit/schedule`, …) from the app they came from. Those paths had no
 * route here, so the links bounced to the dashboard. Each redirect keeps the
 * link working without editing the pages.
 */
export const REFIT_REDIRECTS: ReadonlyArray<{ from: string; to: string }> = [
  { from: '/yard/refit/compliance/compliance', to: REFIT_PATHS.compliance },
  { from: '/yard/refit/approvals', to: REFIT_PATHS.approvals },
  { from: '/yard/refit/change-orders', to: REFIT_PATHS.changeOrders },
  { from: '/yard/refit/crew-requests', to: REFIT_PATHS.crewRequests },
  { from: '/yard/refit/risks', to: REFIT_PATHS.risks },
  { from: '/yard/refit/schedule', to: REFIT_PATHS.schedule },
  { from: '/yard/refit/logistics', to: REFIT_PATHS.logistics },
  { from: '/yard/refit/purchase-orders', to: REFIT_PATHS.purchaseOrders },
  { from: '/yard/refit/invoices', to: REFIT_PATHS.invoices },
  { from: '/yard/refit/session-diagnostics', to: REFIT_PATHS.diagnostics },
];
