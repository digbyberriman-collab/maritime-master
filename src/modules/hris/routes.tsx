import type { AccessLevel, ManifestPageLoader, RouteDef } from '@/app/registry/types';
import { HRIS_PATHS } from './paths';

/**
 * HRIS routes, as data (BUILD-PLAN B8). The module manifest (./module.ts)
 * registers them and the router mounts them inside the HRIS workspace scope
 * (src/app/router/manifestRoutes.tsx), so route order no longer matters.
 *
 * Every page is wrapped in ModuleRoute (login + HRIS module access) and the
 * shell; pages that must never render for self-service users pass an
 * explicit hrLevel or payrollLevel.
 */
const page = (
  path: string,
  loader: ManifestPageLoader,
  gate: { hrLevel?: AccessLevel; payrollLevel?: AccessLevel } = {},
): RouteDef => ({
  scope: 'workspace',
  workspace: 'hris',
  path,
  page: loader,
  layout: 'dashboard',
  guard: { kind: 'module', moduleId: 'hris', ...gate },
});

export const HRIS_ROUTES: readonly RouteDef[] = [
  page(HRIS_PATHS.personalDetails, () => import('@/modules/hris/pages/PersonalDetailsPage')),
  page(HRIS_PATHS.contracts, () => import('@/modules/hris/pages/ContractsPage')),
  page(HRIS_PATHS.documents, () => import('@/modules/hris/pages/DocumentsPage')),
  page(HRIS_PATHS.nextOfKin, () => import('@/modules/hris/pages/NextOfKinPage')),
  page(HRIS_PATHS.employmentHistory, () => import('@/modules/hris/pages/EmploymentHistoryPage')),
  page(HRIS_PATHS.salaries, () => import('@/modules/hris/pages/SalariesPage')),
  page(HRIS_PATHS.payroll, () => import('@/modules/hris/pages/PayrollPage'), { payrollLevel: 'view' }),
  page(HRIS_PATHS.gratuities, () => import('@/modules/hris/pages/GratuitiesPage'), { payrollLevel: 'view' }),
  page(HRIS_PATHS.payReviews, () => import('@/modules/hris/pages/PayReviewsPage'), { payrollLevel: 'view' }),
  page(HRIS_PATHS.compensationSettings, () => import('@/modules/hris/pages/CompensationSettingsPage'), { payrollLevel: 'admin' }),
  page(HRIS_PATHS.annualEvaluations, () => import('@/modules/hris/pages/ReviewsPage')),
  page(HRIS_PATHS.annualReviews, () => import('@/modules/hris/pages/ReviewsPage')),
  page(HRIS_PATHS.endOfRotation, () => import('@/modules/hris/pages/ReviewsPage')),
  page(HRIS_PATHS.objectives, () => import('@/modules/hris/pages/ObjectivesPage')),
  page(HRIS_PATHS.disciplinary, () => import('@/modules/hris/pages/DisciplinaryPage'), { hrLevel: 'edit' }),
  page(HRIS_PATHS.reporting, () => import('@/modules/hris/pages/ReportingPage'), { hrLevel: 'view' }),
  page(HRIS_PATHS.vacancies, () => import('@/modules/hris/pages/VacanciesPage'), { hrLevel: 'view' }),
  page(HRIS_PATHS.candidates, () => import('@/modules/hris/pages/CandidatesPage'), { hrLevel: 'view' }),
  page(HRIS_PATHS.onboarding, () => import('@/modules/hris/pages/OnboardingPage')),
  page(HRIS_PATHS.rightToWork, () => import('@/modules/hris/pages/RightToWorkPage')),
];

/**
 * The module's public name for its routes (`@/modules/hris`). They are route
 * definitions now, mounted by the router from the module registry; nothing
 * renders them directly.
 */
export const hrisRoutes = HRIS_ROUTES;
