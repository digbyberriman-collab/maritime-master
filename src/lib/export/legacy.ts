/**
 * Exports that already work today and contain personal data (platform-prep
 * plan §1, contract 9; D-01).
 *
 * While `log_client_export` is not in the database, the engine refuses a
 * personal-data export ("Exports that contain personal data are unavailable
 * until the export log is set up", D-X5-12). The exports below already work
 * without any log, so moving one onto the engine must not take it away from
 * the people who use it: a call with `legacyUnlogged: true` and one of these
 * source keys proceeds unlogged as its documented D-01 fallback, and is
 * logged as soon as the log exists. Any other source key with
 * `legacyUnlogged` is refused (`legacy_unlogged_unlisted`): a new export
 * never skips the log.
 *
 * `today` names where the export lives before its stream moves it onto the
 * engine. The list only shrinks: the integrator removes an entry once the
 * export log is applied live. src/test/lib/export/runExport.test.ts pins it.
 */
export interface LegacyUnloggedExport {
  sourceKey: string;
  /** Where the export is built today. */
  today: string;
  label: string;
}

export const LEGACY_UNLOGGED_EXPORTS: readonly LegacyUnloggedExport[] = [
  { sourceKey: 'crew.crew_list', today: 'src/modules/crew/lib/crewListPdf.ts', label: 'Official crew list (PDF)' },
  { sourceKey: 'crew.crew_roster', today: 'src/modules/crew/pages/CrewRoster.tsx', label: 'Crew roster (CSV)' },
  { sourceKey: 'crew.audit_log', today: 'src/modules/crew/components/CrewAuditLog.tsx', label: 'Crew audit log (CSV)' },
  { sourceKey: 'crew.leave_planner', today: 'src/modules/crew/pages/LeavePlannerPage.tsx', label: 'Leave planner (CSV)' },
  { sourceKey: 'crew.leave_requests', today: 'src/modules/crew/pages/LeaveRequestsPage.tsx', label: 'Leave requests (CSV)' },
  { sourceKey: 'crew.leave_balances', today: 'src/modules/crew/pages/LeaveCalculatorPage.tsx', label: 'Leave balances (CSV)' },
  { sourceKey: 'work_rest.hor_month', today: 'src/modules/work-rest/reports/exports.ts', label: 'Hours of rest month (PDF, CSV)' },
  { sourceKey: 'work_rest.hor_department', today: 'src/modules/work-rest/reports/exports.ts', label: 'Hours of rest by crew member (CSV)' },
  { sourceKey: 'training.training_matrix', today: 'src/modules/training/components/TrainingMatrixTab.tsx', label: 'Training matrix (CSV)' },
  { sourceKey: 'development.courses_register', today: 'src/modules/development/pages/CoursesRegister.tsx', label: 'Courses register (CSV)' },
  { sourceKey: 'rotation_planner.rotation_plan', today: 'src/modules/rotation-planner/lib/xlsxExporter.ts', label: 'Rotation plan (Excel, PDF)' },
  { sourceKey: 'hris.employment_history', today: 'src/modules/hris/pages/EmploymentHistoryPage.tsx', label: 'Employment history (CSV)' },
];

const KEYS: ReadonlySet<string> = new Set(LEGACY_UNLOGGED_EXPORTS.map((e) => e.sourceKey));

export function isLegacyUnloggedExport(sourceKey: string): boolean {
  return KEYS.has(sourceKey);
}
