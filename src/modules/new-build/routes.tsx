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

const B = '/yard/new-build';

export const newBuildRoutes = (
  <>
    {/* Overview */}
    <Route path={`${B}/overview/dashboard`} element={lazyPage(() => import('./pages/Dashboard'))} />
    <Route path={`${B}/overview/build-phases`} element={lazyPage(() => import('./pages/Phases'))} />
    <Route path={`${B}/overview/requirements`} element={lazyPage(() => import('./pages/Requirements'))} />
    <Route path={`${B}/overview/onboarding`} element={lazyPage(() => import('./pages/Onboarding'))} />
    {/* Workflow */}
    <Route path={`${B}/workflow/change-orders`} element={lazyPage(() => import('./pages/ChangeOrders'))} />
    <Route path={`${B}/workflow/raid-log`} element={lazyPage(() => import('./pages/Decisions'))} />
    <Route path={`${B}/workflow/approvals`} element={lazyPage(() => import('./pages/Approvals'))} />
    <Route path={`${B}/workflow/schedule`} element={lazyPage(() => import('./pages/Timeline'))} />
    {/* Disciplines */}
    <Route path={`${B}/disciplines/areas`} element={lazyPage(() => import('./pages/Areas'))} />
    <Route path={`${B}/disciplines/interior`} element={lazyPage(() => import('./pages/Interior'))} />
    <Route path={`${B}/disciplines/naval-architecture`} element={lazyPage(() => import('./pages/NavalArchitecture'))} />
    <Route path={`${B}/disciplines/piping`} element={lazyPage(() => import('./pages/Piping'))} />
    <Route path={`${B}/disciplines/deck-plan`} element={lazyPage(() => import('./pages/DeckPlan'))} />
    {/* Equipment & Procurement */}
    <Route path={`${B}/equipment/equipment`} element={lazyPage(() => import('./pages/Equipment'))} />
    <Route path={`${B}/equipment/purchase-orders`} element={lazyPage(() => import('./pages/PurchaseOrders'))} />
    {/* Documents */}
    <Route path={`${B}/documents/files`} element={lazyPage(() => import('./pages/Files'))} />
    <Route path={`${B}/documents/drawings`} element={lazyPage(() => import('./pages/Files'))} />
    <Route path={`${B}/documents/yard-standards`} element={lazyPage(() => import('./pages/YardStandards'))} />
    <Route path={`${B}/documents/regulations`} element={lazyPage(() => import('./pages/Regulations'))} />
    {/* Configuration */}
    <Route path={`${B}/configuration/locations`} element={lazyPage(() => import('./pages/Locations'))} />
    <Route path={`${B}/configuration/rasci`} element={lazyPage(() => import('./pages/Rasci'))} />
    <Route path={`${B}/configuration/suppliers`} element={lazyPage(() => import('./pages/Suppliers'))} />
    <Route path={`${B}/configuration/contacts`} element={lazyPage(() => import('./pages/Contacts'))} />
    <Route path={`${B}/configuration/import`} element={lazyPage(() => import('./pages/Import'))} />
  </>
);
