/**
 * React Query keys of the development (training) module. Every key carries
 * the scope it reads (the user, the company or the application), so a
 * switch of user or company never serves another scope's rows. The first
 * segment of each key is the one the pages already used, so invalidating
 * a family by its prefix still reaches every page.
 */
import type { QueryClient } from '@tanstack/react-query';

export const developmentKeys = {
  myApplications: (userId: string | null | undefined) => ['my-development-applications', userId ?? null] as const,
  myStats: (userId: string | null | undefined) => ['my-development-stats', userId ?? null] as const,
  myRepayments: (userId: string | null | undefined) => ['my-development-repayments', userId ?? null] as const,
  review: (companyId: string | null | undefined) => ['development-applications-review', companyId ?? null] as const,
  fleet: (companyId: string | null | undefined) => ['fleet-development-applications', companyId ?? null] as const,
  fleetExpenses: (companyId: string | null | undefined) => ['fleet-development-expenses', companyId ?? null] as const,
  coursesRegister: (companyId: string | null | undefined) => ['courses-register', companyId ?? null] as const,
  crewTraining: (companyId: string | null | undefined) => ['crew-training-all', companyId ?? null] as const,
  settings: (companyId: string | null | undefined) => ['development-program-settings', companyId ?? null] as const,
  policyExtras: (companyId: string | null | undefined) => ['development-program-settings', companyId ?? null, 'extras'] as const,
  lifecycle: (applicationId: string | null | undefined) => ['development-application-lifecycle', applicationId ?? null] as const,
  /** Whether development_transition is in the database: 'unknown' until a call answers, then 'available' or 'missing' (D-01). */
  transitionSupport: (companyId: string | null | undefined) => ['development-transition-support', companyId ?? null] as const,
};

/** The key families an application change can affect. */
const APPLICATION_FAMILIES = [
  'my-development-applications',
  'my-development-stats',
  'development-applications-review',
  'fleet-development-applications',
  'courses-register',
  'crew-training-all',
  'development-eligibility-context',
  'development-application-lifecycle',
] as const;

/** Refetch every list and detail an application appears in. */
export function invalidateApplicationQueries(queryClient: QueryClient): Promise<void> {
  return Promise.all(APPLICATION_FAMILIES.map((family) => queryClient.invalidateQueries({ queryKey: [family] }))).then(() => undefined);
}
