import React from 'react';
import { Route } from 'react-router-dom';
import ProtectedRoute from '@/shared/components/ProtectedRoute';
import NewBuildShell from '@/modules/new-build/components/layout/NewBuildShell';

const lazyPage = (loader: () => Promise<{ default: React.ComponentType }>) => {
  const C = React.lazy(loader);
  return (
    <ProtectedRoute>
      <NewBuildShell>
        <React.Suspense
          fallback={
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          }
        >
          <C />
        </React.Suspense>
      </NewBuildShell>
    </ProtectedRoute>
  );
};

export const newBuildRoutes = (
  <>
    <Route path="/yard/new-build/overview/dashboard" element={lazyPage(() => import('./pages/Dashboard'))} />
  </>
);
