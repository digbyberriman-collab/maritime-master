import React from 'react';
import { Route } from 'react-router-dom';
import ModuleRoute from '@/shared/components/ModuleRoute';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Loader2 } from 'lucide-react';

const LazyLoader = () => (
  <div className="flex min-h-[40vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

type Loader = () => Promise<{ default: React.ComponentType }>;

const page = (loader: Loader, hrLevel?: 'view' | 'edit' | 'admin') => {
  const C = React.lazy(loader);
  return (
    <ModuleRoute moduleId="hris" hrLevel={hrLevel}>
      <DashboardLayout>
        <React.Suspense fallback={<LazyLoader />}>
          <C />
        </React.Suspense>
      </DashboardLayout>
    </ModuleRoute>
  );
};

export const HRIS_PATHS = {
  personalDetails: '/hris/employee-records/personal-details',
  contracts: '/hris/employee-records/contracts-and-employment',
  documents: '/hris/employee-records/documents-and-certificates',
  nextOfKin: '/hris/employee-records/next-of-kin-emergency',
  employmentHistory: '/hris/employee-records/employment-history',
} as const;

/**
 * HRIS routes. Listed in src/routes/index.tsx before the sitemap placeholder
 * routes so they take precedence. Every page is wrapped in ModuleRoute (login
 * + HRIS module access); pages that must never render for self-service users
 * pass an explicit hrLevel.
 */
export const hrisRoutes = (
  <>
    <Route path={HRIS_PATHS.personalDetails} element={page(() => import('@/modules/hris/pages/PersonalDetailsPage'))} />
    <Route path={HRIS_PATHS.contracts} element={page(() => import('@/modules/hris/pages/ContractsPage'))} />
    <Route path={HRIS_PATHS.documents} element={page(() => import('@/modules/hris/pages/DocumentsPage'))} />
    <Route path={HRIS_PATHS.nextOfKin} element={page(() => import('@/modules/hris/pages/NextOfKinPage'))} />
    <Route path={HRIS_PATHS.employmentHistory} element={page(() => import('@/modules/hris/pages/EmploymentHistoryPage'))} />
  </>
);
