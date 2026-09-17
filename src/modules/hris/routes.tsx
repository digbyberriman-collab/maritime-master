import React from 'react';
import { Route } from 'react-router-dom';
import ModuleRoute from '@/shared/components/ModuleRoute';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { LazyLoader } from '@/shared/components/common/LazyLoader';

type Loader = () => Promise<{ default: React.ComponentType }>;

const page = (loader: Loader, gate: { hrLevel?: 'view' | 'edit' | 'admin'; payrollLevel?: 'view' | 'edit' | 'admin' } = {}) => {
  const C = React.lazy(loader);
  return (
    <ModuleRoute moduleId="hris" hrLevel={gate.hrLevel} payrollLevel={gate.payrollLevel}>
      <DashboardLayout>
        <React.Suspense fallback={<LazyLoader />}>
          <C />
        </React.Suspense>
      </DashboardLayout>
    </ModuleRoute>
  );
};

import { HRIS_PATHS } from './paths';

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
    <Route path={HRIS_PATHS.salaries} element={page(() => import('@/modules/hris/pages/SalariesPage'))} />
    <Route path={HRIS_PATHS.payroll} element={page(() => import('@/modules/hris/pages/PayrollPage'), { payrollLevel: 'view' })} />
    <Route path={HRIS_PATHS.gratuities} element={page(() => import('@/modules/hris/pages/GratuitiesPage'), { payrollLevel: 'view' })} />
    <Route path={HRIS_PATHS.payReviews} element={page(() => import('@/modules/hris/pages/PayReviewsPage'), { payrollLevel: 'view' })} />
    <Route path={HRIS_PATHS.compensationSettings} element={page(() => import('@/modules/hris/pages/CompensationSettingsPage'), { payrollLevel: 'admin' })} />
  </>
);
