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

/**
 * RETIRED, for one release (gap/10 W3; D-02, D-06): remove in the release
 * after this one. Before Phase 0 the Refit sidebar appended each leaf's slug
 * to a base that already ended in it, so every leaf linked a double-slug URL
 * (`/yard/refit/overview/dashboard/dashboard`). Those are in bookmarks and
 * shared links; each opens its page here instead of bouncing to the user's
 * home. An explicit list, not a `/yard/refit/:group/:leaf/:slug` pattern,
 * so a mistyped URL still reaches the not-found route.
 *
 * `${page}/${slug}`, the slug being the old sidebar's slug of the leaf label.
 * The old Compliance leaf sat at `/compliance/compliance`, now the overview
 * page (D-24).
 */
export const REFIT_RETIRED_SIDEBAR_REDIRECTS: ReadonlyArray<{ from: string; to: string }> = [
  // Overview
  { from: `${REFIT_PATHS.dashboard}/dashboard`, to: REFIT_PATHS.dashboard },
  { from: `${REFIT_PATHS.approvals}/approvals-centre`, to: REFIT_PATHS.approvals },
  { from: `${REFIT_PATHS.notifications}/notifications`, to: REFIT_PATHS.notifications },
  { from: `${REFIT_PATHS.search}/search`, to: REFIT_PATHS.search },
  // Workflow
  { from: `${REFIT_PATHS.changeOrders}/change-orders`, to: REFIT_PATHS.changeOrders },
  { from: `${REFIT_PATHS.crewRequests}/crew-requests`, to: REFIT_PATHS.crewRequests },
  { from: `${REFIT_PATHS.snags}/snags-and-warranty`, to: REFIT_PATHS.snags },
  { from: `${REFIT_PATHS.works}/works-orders`, to: REFIT_PATHS.works },
  { from: `${REFIT_PATHS.meetings}/meetings`, to: REFIT_PATHS.meetings },
  { from: `${REFIT_PATHS.risks}/risk-register`, to: REFIT_PATHS.risks },
  // Project
  { from: `${REFIT_PATHS.schedule}/schedule`, to: REFIT_PATHS.schedule },
  { from: `${REFIT_PATHS.logistics}/logistics`, to: REFIT_PATHS.logistics },
  { from: `${REFIT_PATHS.inventory}/inventory-and-equipment`, to: REFIT_PATHS.inventory },
  { from: `${REFIT_PATHS.contractors}/contractors`, to: REFIT_PATHS.contractors },
  { from: `${REFIT_PATHS.suppliers}/suppliers`, to: REFIT_PATHS.suppliers },
  // Documents
  { from: `${REFIT_PATHS.drawings}/drawings-and-plans`, to: REFIT_PATHS.drawings },
  { from: `${REFIT_PATHS.documentControl}/document-control`, to: REFIT_PATHS.documentControl },
  { from: `${REFIT_PATHS.files}/files`, to: REFIT_PATHS.files },
  // Finance
  { from: `${REFIT_PATHS.budget}/budget`, to: REFIT_PATHS.budget },
  { from: `${REFIT_PATHS.purchaseOrders}/purchase-orders`, to: REFIT_PATHS.purchaseOrders },
  { from: `${REFIT_PATHS.invoices}/invoices`, to: REFIT_PATHS.invoices },
  // Compliance
  { from: `${REFIT_PATHS.root}/compliance/compliance/compliance`, to: REFIT_PATHS.compliance },
  { from: `${REFIT_PATHS.crew}/crew-and-certification`, to: REFIT_PATHS.crew },
  { from: `${REFIT_PATHS.auditLog}/audit-log`, to: REFIT_PATHS.auditLog },
  { from: `${REFIT_PATHS.reporting}/reporting`, to: REFIT_PATHS.reporting },
  // Account & admin
  { from: `${REFIT_PATHS.access}/access-profile`, to: REFIT_PATHS.access },
  { from: `${REFIT_PATHS.communications}/communications`, to: REFIT_PATHS.communications },
  { from: `${REFIT_PATHS.diagnostics}/diagnostics`, to: REFIT_PATHS.diagnostics },
  { from: `${REFIT_PATHS.accessCheck}/access-check`, to: REFIT_PATHS.accessCheck },
  { from: `${REFIT_PATHS.admin}/admin-and-settings`, to: REFIT_PATHS.admin },
  { from: `${REFIT_PATHS.import}/import-and-api`, to: REFIT_PATHS.import },
  { from: `${REFIT_PATHS.loginDiagnostics}/login-diagnostics`, to: REFIT_PATHS.loginDiagnostics },
];
