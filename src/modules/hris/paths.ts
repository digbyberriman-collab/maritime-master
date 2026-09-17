/** Route paths for the HRIS module. Kept apart from routes.tsx so pages can
 *  import them without pulling in the route elements (fast-refresh friendly). */
export const HRIS_PATHS = {
  personalDetails: '/hris/employee-records/personal-details',
  contracts: '/hris/employee-records/contracts-and-employment',
  documents: '/hris/employee-records/documents-and-certificates',
  nextOfKin: '/hris/employee-records/next-of-kin-emergency',
  employmentHistory: '/hris/employee-records/employment-history',
  salaries: '/hris/compensation/salaries-and-compensation',
  payroll: '/hris/compensation/payroll',
  gratuities: '/hris/compensation/gratuities',
  payReviews: '/hris/compensation/pay-reviews',
  compensationSettings: '/hris/compensation/compensation-settings',
} as const;
