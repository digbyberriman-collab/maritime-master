import type { ManifestPageLoader, RouteDef } from '@/app/registry/types';
import { NEW_BUILD_PATHS, NEW_BUILD_REDIRECTS } from './paths';

/**
 * New Build workspace routes, as data (BUILD-PLAN B8). The module manifest
 * (./module.ts) registers them and the router mounts them inside the Yard
 * workspace scope. Every page is signed-in only and renders inside the New
 * Build shell. Files and Drawings share a page module but stay separate
 * routes, so switching between them remounts the page as before.
 */
const page = (path: string, loader: ManifestPageLoader): RouteDef => ({
  scope: 'workspace',
  workspace: 'yard',
  path,
  page: loader,
  guard: { kind: 'login' },
  layout: 'new-build-shell',
});

export const NEW_BUILD_ROUTES: readonly RouteDef[] = [
  // Overview
  page(NEW_BUILD_PATHS.dashboard, () => import('./pages/Dashboard')),
  page(NEW_BUILD_PATHS.phases, () => import('./pages/Phases')),
  page(NEW_BUILD_PATHS.requirements, () => import('./pages/Requirements')),
  page(NEW_BUILD_PATHS.onboarding, () => import('./pages/Onboarding')),
  // Workflow
  page(NEW_BUILD_PATHS.changeOrders, () => import('./pages/ChangeOrders')),
  page(NEW_BUILD_PATHS.raidLog, () => import('./pages/Decisions')),
  page(NEW_BUILD_PATHS.approvals, () => import('./pages/Approvals')),
  page(NEW_BUILD_PATHS.schedule, () => import('./pages/Timeline')),
  // Disciplines
  page(NEW_BUILD_PATHS.areas, () => import('./pages/Areas')),
  page(NEW_BUILD_PATHS.interior, () => import('./pages/Interior')),
  page(NEW_BUILD_PATHS.navalArchitecture, () => import('./pages/NavalArchitecture')),
  page(NEW_BUILD_PATHS.piping, () => import('./pages/Piping')),
  page(NEW_BUILD_PATHS.deckPlan, () => import('./pages/DeckPlan')),
  // Equipment & Procurement
  page(NEW_BUILD_PATHS.equipment, () => import('./pages/Equipment')),
  page(NEW_BUILD_PATHS.purchaseOrders, () => import('./pages/PurchaseOrders')),
  // Documents
  page(NEW_BUILD_PATHS.files, () => import('./pages/Files')),
  page(NEW_BUILD_PATHS.drawings, () => import('./pages/Files')),
  page(NEW_BUILD_PATHS.yardStandards, () => import('./pages/YardStandards')),
  page(NEW_BUILD_PATHS.regulations, () => import('./pages/Regulations')),
  // Configuration
  page(NEW_BUILD_PATHS.locations, () => import('./pages/Locations')),
  page(NEW_BUILD_PATHS.rasci, () => import('./pages/Rasci')),
  page(NEW_BUILD_PATHS.suppliers, () => import('./pages/Suppliers')),
  page(NEW_BUILD_PATHS.contacts, () => import('./pages/Contacts')),
  page(NEW_BUILD_PATHS.import, () => import('./pages/Import')),
  // Old URLs (e.g. the doubled `/equipment/equipment`) redirect.
  ...NEW_BUILD_REDIRECTS.map(({ from, to }): RouteDef => ({ scope: 'workspace', workspace: 'yard', path: from, redirectTo: to })),
];
