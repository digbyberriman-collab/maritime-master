import React from 'react';
import { Navigate, Route } from 'react-router-dom';
import ProtectedRoute from '@/shared/components/ProtectedRoute';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { LazyLoader } from '@/shared/components/common/LazyLoader';
import { LEGAL_PATHS } from './paths';

type Loader = () => Promise<{ default: React.ComponentType }>;

const page = (loader: Loader) => {
  const C = React.lazy(loader);
  return (
    <ProtectedRoute>
      <DashboardLayout>
        <React.Suspense fallback={<LazyLoader />}>
          <C />
        </React.Suspense>
      </DashboardLayout>
    </ProtectedRoute>
  );
};

/**
 * Legal module routes under /departments/legal. Any signed-in user may enter
 * (everyone can raise a request and fill in forms); legal-team controls are
 * gated in the pages by useLegalAccess and enforced by row level security.
 * Listed in src/routes/index.tsx before the sitemap placeholders.
 */
export const legalRoutes = (
  <>
    <Route path={LEGAL_PATHS.root} element={<Navigate to={LEGAL_PATHS.dashboard} replace />} />
    <Route path={LEGAL_PATHS.legacyPlaceholder} element={<Navigate to={LEGAL_PATHS.dashboard} replace />} />
    <Route path={LEGAL_PATHS.dashboard} element={page(() => import('@/modules/legal/pages/LegalDashboardPage'))} />
    <Route path={LEGAL_PATHS.requests} element={page(() => import('@/modules/legal/pages/LegalRequestsPage'))} />
    <Route path={LEGAL_PATHS.newRequest} element={page(() => import('@/modules/legal/pages/LegalRequestNewPage'))} />
    <Route path={`${LEGAL_PATHS.requests}/:id`} element={page(() => import('@/modules/legal/pages/LegalRequestDetailPage'))} />
    <Route path={LEGAL_PATHS.documents} element={page(() => import('@/modules/legal/pages/LegalDocumentsPage'))} />
    <Route path={`${LEGAL_PATHS.documents}/:id`} element={page(() => import('@/modules/legal/pages/LegalDocumentEditorPage'))} />
    <Route path={LEGAL_PATHS.forms} element={page(() => import('@/modules/legal/pages/LegalFormsPage'))} />
    <Route path={`${LEGAL_PATHS.forms}/:templateId/fill`} element={page(() => import('@/modules/legal/pages/LegalFormFillPage'))} />
    <Route path={`${LEGAL_PATHS.forms}/:templateId/submissions`} element={page(() => import('@/modules/legal/pages/LegalFormSubmissionsPage'))} />
  </>
);
