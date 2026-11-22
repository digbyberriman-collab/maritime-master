import type { ManifestPageLoader, RouteDef } from '@/app/registry/types';
import { LEGAL_PATHS } from './paths';

/**
 * Legal module routes under /departments/legal (R4), as data (BUILD-PLAN
 * B8). The module manifest (./module.ts) registers them and the router
 * mounts them inside the Legal workspace scope.
 *
 * Any signed-in user may enter (everyone can raise a request and fill in
 * forms); legal-team controls are gated in the pages by useLegalAccess and
 * enforced by row level security.
 */
const page = (path: string, loader: ManifestPageLoader): RouteDef => ({
  scope: 'workspace',
  workspace: 'legal',
  path,
  page: loader,
  guard: { kind: 'login' },
  layout: 'dashboard',
});

const redirect = (path: string, redirectTo: string): RouteDef => ({ scope: 'workspace', workspace: 'legal', path, redirectTo });

export const LEGAL_ROUTES: readonly RouteDef[] = [
  redirect(LEGAL_PATHS.root, LEGAL_PATHS.dashboard),
  redirect(LEGAL_PATHS.legacyPlaceholder, LEGAL_PATHS.dashboard),
  page(LEGAL_PATHS.dashboard, () => import('@/modules/legal/pages/LegalDashboardPage')),
  page(LEGAL_PATHS.requests, () => import('@/modules/legal/pages/LegalRequestsPage')),
  page(LEGAL_PATHS.newRequest, () => import('@/modules/legal/pages/LegalRequestNewPage')),
  page(`${LEGAL_PATHS.requests}/:id`, () => import('@/modules/legal/pages/LegalRequestDetailPage')),
  page(LEGAL_PATHS.documents, () => import('@/modules/legal/pages/LegalDocumentsPage')),
  page(`${LEGAL_PATHS.documents}/:id`, () => import('@/modules/legal/pages/LegalDocumentEditorPage')),
  page(LEGAL_PATHS.forms, () => import('@/modules/legal/pages/LegalFormsPage')),
  page(`${LEGAL_PATHS.forms}/:templateId/fill`, () => import('@/modules/legal/pages/LegalFormFillPage')),
  page(`${LEGAL_PATHS.forms}/:templateId/submissions`, () => import('@/modules/legal/pages/LegalFormSubmissionsPage')),
];

/**
 * The module's public name for its routes (`@/modules/legal`). They are route
 * definitions now, mounted by the router from the module registry; nothing
 * renders them directly.
 */
export const legalRoutes = LEGAL_ROUTES;
