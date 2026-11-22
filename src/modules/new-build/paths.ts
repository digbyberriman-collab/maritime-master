/**
 * Route paths for the New Build workspace. Kept apart from routes.tsx so the
 * sitemap can tell which New Build leaves reach a real page (and so must not
 * get a Coming Soon placeholder) without importing the route elements.
 */
export const NEW_BUILD_PATHS = {
  root: '/yard/new-build',
  // Overview
  dashboard: '/yard/new-build/overview/dashboard',
  phases: '/yard/new-build/overview/build-phases',
  requirements: '/yard/new-build/overview/requirements',
  onboarding: '/yard/new-build/overview/onboarding',
  // Workflow
  changeOrders: '/yard/new-build/workflow/change-orders',
  raidLog: '/yard/new-build/workflow/raid-log',
  approvals: '/yard/new-build/workflow/approvals',
  schedule: '/yard/new-build/workflow/schedule',
  // Disciplines
  areas: '/yard/new-build/disciplines/areas',
  interior: '/yard/new-build/disciplines/interior',
  navalArchitecture: '/yard/new-build/disciplines/naval-architecture',
  piping: '/yard/new-build/disciplines/piping',
  deckPlan: '/yard/new-build/disciplines/deck-plan',
  // Equipment & Procurement
  equipment: '/yard/new-build/equipment/register',
  purchaseOrders: '/yard/new-build/equipment/purchase-orders',
  // Documents
  files: '/yard/new-build/documents/files',
  drawings: '/yard/new-build/documents/drawings',
  yardStandards: '/yard/new-build/documents/yard-standards',
  regulations: '/yard/new-build/documents/regulations',
  // Configuration
  locations: '/yard/new-build/configuration/locations',
  rasci: '/yard/new-build/configuration/rasci',
  suppliers: '/yard/new-build/configuration/suppliers',
  contacts: '/yard/new-build/configuration/contacts',
  import: '/yard/new-build/configuration/import',
} as const;

/** Old New Build URLs and the page each one now opens. */
export const NEW_BUILD_REDIRECTS: ReadonlyArray<{ from: string; to: string }> = [
  // `/equipment/equipment` repeated a segment, which the sitemap tests reject.
  { from: '/yard/new-build/equipment/equipment', to: NEW_BUILD_PATHS.equipment },
];
