import React from "react";
import { Route } from "react-router-dom";
import ProtectedRoute from "@/shared/components/ProtectedRoute";
import RefitShell from "@/modules/refit/components/layout/RefitShell";

const lazyPage = (loader: () => Promise<{ default: React.ComponentType }>) => {
  const C = React.lazy(loader);
  return (
    <ProtectedRoute>
      <RefitShell>
        <React.Suspense
          fallback={
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          }
        >
          <C />
        </React.Suspense>
      </RefitShell>
    </ProtectedRoute>
  );
};

const B = "/yard/refit";

export const refitRoutes = (
  <>
    <Route path={`${B}/overview/dashboard`} element={lazyPage(() => import("./pages/Dashboard"))} />
    <Route path={`${B}/overview/approvals`} element={lazyPage(() => import("./pages/approvals"))} />
    <Route path={`${B}/overview/notifications`} element={lazyPage(() => import("./pages/notifications"))} />
    <Route path={`${B}/overview/search`} element={lazyPage(() => import("./pages/search"))} />
    <Route path={`${B}/workflow/change-orders`} element={lazyPage(() => import("./pages/change-orders"))} />
    <Route path={`${B}/workflow/crew-requests`} element={lazyPage(() => import("./pages/crew-requests"))} />
    <Route path={`${B}/workflow/snags`} element={lazyPage(() => import("./pages/snags"))} />
    <Route path={`${B}/workflow/works`} element={lazyPage(() => import("./pages/works"))} />
    <Route path={`${B}/workflow/meetings`} element={lazyPage(() => import("./pages/meetings"))} />
    <Route path={`${B}/workflow/risks`} element={lazyPage(() => import("./pages/risks"))} />
    <Route path={`${B}/project/schedule`} element={lazyPage(() => import("./pages/schedule"))} />
    <Route path={`${B}/project/logistics`} element={lazyPage(() => import("./pages/logistics"))} />
    <Route path={`${B}/project/inventory`} element={lazyPage(() => import("./pages/inventory"))} />
    <Route path={`${B}/project/contractors`} element={lazyPage(() => import("./pages/contractors"))} />
    <Route path={`${B}/project/suppliers`} element={lazyPage(() => import("./pages/suppliers"))} />
    <Route path={`${B}/documents/drawings`} element={lazyPage(() => import("./pages/drawings"))} />
    <Route path={`${B}/documents/document-control`} element={lazyPage(() => import("./pages/document-control"))} />
    <Route path={`${B}/documents/files`} element={lazyPage(() => import("./pages/files"))} />
    <Route path={`${B}/finance/budget`} element={lazyPage(() => import("./pages/budget"))} />
    <Route path={`${B}/finance/purchase-orders`} element={lazyPage(() => import("./pages/purchase-orders"))} />
    <Route path={`${B}/finance/invoices`} element={lazyPage(() => import("./pages/invoices"))} />
    <Route path={`${B}/compliance/compliance`} element={lazyPage(() => import("./pages/compliance"))} />
    <Route path={`${B}/compliance/crew`} element={lazyPage(() => import("./pages/crew"))} />
    <Route path={`${B}/compliance/audit-log`} element={lazyPage(() => import("./pages/audit-log"))} />
    <Route path={`${B}/compliance/reporting`} element={lazyPage(() => import("./pages/reporting"))} />
    <Route path={`${B}/account/access`} element={lazyPage(() => import("./pages/access"))} />
    <Route path={`${B}/account/communications`} element={lazyPage(() => import("./pages/communications"))} />
    <Route path={`${B}/account/diagnostics`} element={lazyPage(() => import("./pages/session-diagnostics"))} />
    <Route path={`${B}/account/access-check`} element={lazyPage(() => import("./pages/access-check"))} />
    <Route path={`${B}/account/admin`} element={lazyPage(() => import("./pages/admin"))} />
    <Route path={`${B}/account/import`} element={lazyPage(() => import("./pages/import"))} />
    <Route path={`${B}/account/login-diagnostics`} element={lazyPage(() => import("./pages/login-diagnostics"))} />
  </>
);
