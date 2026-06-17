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

// Maps every sitemap leaf under /yard/new-build/* to its real ported page.
// Listing routes here (rather than inline in routes/index.tsx) keeps the
// 23 entries isolated and easy to extend.
export const newBuildRoutes = (
  <>
    {/* Overview */}
    <Route path="/yard/new-build/overview/dashboard"     element={lazyPage(() => import('./pages/Dashboard'))} />
    <Route path="/yard/new-build/overview/build-phases"  element={lazyPage(() => import('./pages/Phases'))} />
    <Route path="/yard/new-build/overview/requirements"  element={lazyPage(() => import('./pages/Requirements'))} />
    <Route path="/yard/new-build/overview/onboarding"    element={lazyPage(() => import('./pages/Onboarding'))} />

    {/* Workflow */}
    <Route path="/yard/new-build/workflow/change-orders" element={lazyPage(() => import('./pages/ChangeOrders'))} />
    <Route path="/yard/new-build/workflow/raid-log"      element={lazyPage(() => import('./pages/Decisions'))} />
    <Route path="/yard/new-build/workflow/approvals"     element={lazyPage(() => import('./pages/Approvals'))} />
    <Route path="/yard/new-build/workflow/schedule"      element={lazyPage(() => import('./pages/Timeline'))} />

    {/* Disciplines */}
    <Route path="/yard/new-build/disciplines/areas"               element={lazyPage(() => import('./pages/Areas'))} />
    <Route path="/yard/new-build/disciplines/interior"            element={lazyPage(() => import('./pages/Interior'))} />
    <Route path="/yard/new-build/disciplines/interior/materials"  element={lazyPage(() => import('./pages/interior/InteriorMaterials'))} />
    <Route path="/yard/new-build/disciplines/interior/drawings"   element={lazyPage(() => import('./pages/interior/InteriorDrawings'))} />
    <Route path="/yard/new-build/disciplines/interior/approvals"  element={lazyPage(() => import('./pages/interior/InteriorApprovals'))} />
    <Route path="/yard/new-build/disciplines/interior/schedule"   element={lazyPage(() => import('./pages/interior/InteriorSchedule'))} />
    <Route path="/yard/new-build/disciplines/interior/demarcation" element={lazyPage(() => import('./pages/interior/InteriorDemarcation'))} />
    <Route path="/yard/new-build/disciplines/naval-architecture" element={lazyPage(() => import('./pages/NavalArchitecture'))} />
    <Route path="/yard/new-build/disciplines/piping"             element={lazyPage(() => import('./pages/Piping'))} />
    <Route path="/yard/new-build/disciplines/deck-plan"          element={lazyPage(() => import('./pages/DeckPlan'))} />

    {/* Equipment & Procurement */}
    <Route path="/yard/new-build/equipment/equipment"        element={lazyPage(() => import('./pages/Equipment'))} />
    <Route path="/yard/new-build/equipment/purchase-orders"  element={lazyPage(() => import('./pages/PurchaseOrders'))} />

    {/* Documents */}
    <Route path="/yard/new-build/documents/files"           element={lazyPage(() => import('./pages/Files'))} />
    <Route path="/yard/new-build/documents/drawings"        element={lazyPage(() => import('./pages/Files'))} />
    <Route path="/yard/new-build/documents/yard-standards"  element={lazyPage(() => import('./pages/YardStandards'))} />
    <Route path="/yard/new-build/documents/regulations"     element={lazyPage(() => import('./pages/Regulations'))} />

    {/* Configuration */}
    <Route path="/yard/new-build/configuration/locations"  element={lazyPage(() => import('./pages/Locations'))} />
    <Route path="/yard/new-build/configuration/rasci"      element={lazyPage(() => import('./pages/Rasci'))} />
    <Route path="/yard/new-build/configuration/suppliers"  element={lazyPage(() => import('./pages/Suppliers'))} />
    <Route path="/yard/new-build/configuration/contacts"   element={lazyPage(() => import('./pages/Contacts'))} />
    <Route path="/yard/new-build/configuration/import"     element={lazyPage(() => import('./pages/Import'))} />

    {/* Convenience aliases */}
    <Route path="/yard/new-build" element={lazyPage(() => import('./pages/Dashboard'))} />
  </>
);
