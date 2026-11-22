import type { AccessLevel, ManifestPageLoader, RouteDef } from '@/app/registry/types';
import { HEALTH_PATHS } from './paths';

interface Gate {
  /** Clinical gate. Omitted on pages a crew member opens for their own record. */
  medicalLevel?: AccessLevel;
  /** Wellness gate. Omitted on pages a crew member opens for themselves. */
  wellnessLevel?: AccessLevel;
}

/**
 * Health & Wellness routes, as data (BUILD-PLAN B8). The module manifest
 * (./module.ts) registers them and the router mounts them inside the Health
 * workspace scope (src/app/router/manifestRoutes.tsx).
 *
 * Gating follows one rule: a page carries a level only when nobody outside
 * that level has business opening it. Pages a crew member opens to see their
 * own record carry no level, because the database returns their row and
 * nothing else; adding a level there would lock people out of their own
 * medical history.
 */
const page = (path: string, loader: ManifestPageLoader, gate: Gate = {}): RouteDef => ({
  scope: 'workspace',
  workspace: 'health',
  path,
  page: loader,
  layout: 'dashboard',
  guard: { kind: 'module', moduleId: 'health', ...gate },
});

export const HEALTH_ROUTES: readonly RouteDef[] = [
  // Medical: company-wide clinical pages. Crew complete their own screening (C.H.E.K.), so that one is not gated.
  page(HEALTH_PATHS.medicalDashboard, () => import('@/modules/health/pages/medical/MedicalDashboardPage'), { medicalLevel: 'view' }),
  page(HEALTH_PATHS.medicalPatients, () => import('@/modules/health/pages/medical/MedicalPatientsPage'), { medicalLevel: 'view' }),
  page(HEALTH_PATHS.medicalStaff, () => import('@/modules/health/pages/medical/MedicalStaffPage'), { medicalLevel: 'view' }),
  page(HEALTH_PATHS.medicalSupplies, () => import('@/modules/health/pages/medical/MedicalSuppliesPage'), { medicalLevel: 'view' }),
  page(HEALTH_PATHS.medicalFirstAid, () => import('@/modules/health/pages/medical/FirstAidPage'), { medicalLevel: 'view' }),
  page(HEALTH_PATHS.medicalEquipment, () => import('@/modules/health/pages/medical/MedicalEquipmentPage'), { medicalLevel: 'view' }),
  page(HEALTH_PATHS.medicalProtocols, () => import('@/modules/health/pages/medical/MedicalProtocolsPage')),
  page(HEALTH_PATHS.medicalLogs, () => import('@/modules/health/pages/medical/MedicalLogsPage'), { medicalLevel: 'view' }),
  page(HEALTH_PATHS.medicalScreening, () => import('@/modules/health/pages/medical/HealthScreeningPage')),
  // Personnel medical data: a crew member's own record is theirs to read.
  page(HEALTH_PATHS.crewMedicalRecords, () => import('@/modules/health/pages/medical/CrewMedicalRecordsPage')),
  page(HEALTH_PATHS.fitnessToWork, () => import('@/modules/health/pages/medical/FitnessToWorkPage')),
  page(HEALTH_PATHS.vaccinations, () => import('@/modules/health/pages/medical/VaccinationsPage')),
  page(HEALTH_PATHS.allergiesConditions, () => import('@/modules/health/pages/medical/AllergiesConditionsPage')),
  page(HEALTH_PATHS.medications, () => import('@/modules/health/pages/medical/MedicationsPage')),
  page(HEALTH_PATHS.medicalCertificates, () => import('@/modules/health/pages/medical/MedicalCertificatesPage')),
  page(HEALTH_PATHS.personnelNextOfKin, () => import('@/modules/health/pages/medical/PersonnelNextOfKinPage')),
  page(HEALTH_PATHS.treatmentHistory, () => import('@/modules/health/pages/medical/TreatmentHistoryPage')),
  // Spa
  page(HEALTH_PATHS.spaDashboard, () => import('@/modules/health/pages/spa/SpaDashboardPage'), { wellnessLevel: 'view' }),
  page(HEALTH_PATHS.spaCalendar, () => import('@/modules/health/pages/spa/SpaCalendarPage')),
  page(HEALTH_PATHS.spaClients, () => import('@/modules/health/pages/spa/SpaClientsPage'), { wellnessLevel: 'view' }),
  page(HEALTH_PATHS.spaTreatments, () => import('@/modules/health/pages/spa/SpaTreatmentsPage')),
  page(HEALTH_PATHS.spaInventory, () => import('@/modules/health/pages/spa/SpaInventoryPage'), { wellnessLevel: 'view' }),
  // Nutrition: everyone tracks their own.
  page(HEALTH_PATHS.nutritionOverview, () => import('@/modules/health/pages/nutrition/NutritionOverviewPage')),
  page(HEALTH_PATHS.nutritionFoodLog, () => import('@/modules/health/pages/nutrition/FoodLogPage')),
  page(HEALTH_PATHS.nutritionCalendar, () => import('@/modules/health/pages/nutrition/MealCalendarPage')),
  page(HEALTH_PATHS.nutritionGoals, () => import('@/modules/health/pages/nutrition/NutritionGoalsPage')),
  page(HEALTH_PATHS.nutritionSettings, () => import('@/modules/health/pages/nutrition/NutritionSettingsPage'), { wellnessLevel: 'admin' }),
  // Physio: clinical, so the page itself checks the physio discipline.
  page(HEALTH_PATHS.physioRehabProtocols, () => import('@/modules/health/pages/pt/RehabProtocolLibraryPage'), { wellnessLevel: 'view' }),
  page(HEALTH_PATHS.physioAssessments, () => import('@/modules/health/pages/physio/PhysioAssessmentsPage')),
  page(HEALTH_PATHS.physioTreatmentPlans, () => import('@/modules/health/pages/physio/TreatmentPlansPage')),
  page(HEALTH_PATHS.physioSessionLog, () => import('@/modules/health/pages/physio/SessionLogPage')),
  page(HEALTH_PATHS.physioReferrals, () => import('@/modules/health/pages/physio/ReferralsPage')),
  // Personal training, trainer side.
  page(HEALTH_PATHS.trainerDashboard, () => import('@/modules/health/pages/pt/TrainerDashboardPage'), { wellnessLevel: 'view' }),
  page(HEALTH_PATHS.trainerSchedule, () => import('@/modules/health/pages/pt/TrainerSchedulePage'), { wellnessLevel: 'view' }),
  page(HEALTH_PATHS.athleteRoster, () => import('@/modules/health/pages/pt/AthleteRosterPage'), { wellnessLevel: 'view' }),
  page(HEALTH_PATHS.athleteWorkspace, () => import('@/modules/health/pages/pt/AthleteWorkspacePage'), { wellnessLevel: 'view' }),
  page(HEALTH_PATHS.activePrograms, () => import('@/modules/health/pages/pt/ActiveProgramsPage'), { wellnessLevel: 'view' }),
  page(HEALTH_PATHS.programmingTemplates, () => import('@/modules/health/pages/pt/ProgramTemplatesPage'), { wellnessLevel: 'view' }),
  page(HEALTH_PATHS.programmingExercises, () => import('@/modules/health/pages/pt/ExerciseLibraryPage')),
  page(HEALTH_PATHS.programmingRehabProtocols, () => import('@/modules/health/pages/pt/RehabProtocolLibraryPage'), { wellnessLevel: 'view' }),
  page(HEALTH_PATHS.programmingVideos, () => import('@/modules/health/pages/pt/VideoLibraryPage')),
  page(HEALTH_PATHS.trainerAdminTrainers, () => import('@/modules/health/pages/pt/TrainersAdminPage'), { wellnessLevel: 'admin' }),
  // Exercise import connectors: one page, six routes, credentials inside.
  page(HEALTH_PATHS.sourceExerciseDbImport, () => import('@/modules/health/pages/pt/ExerciseSourcePage'), { wellnessLevel: 'admin' }),
  page(HEALTH_PATHS.sourceWger, () => import('@/modules/health/pages/pt/ExerciseSourcePage'), { wellnessLevel: 'admin' }),
  page(HEALTH_PATHS.sourceExerciseDbApi, () => import('@/modules/health/pages/pt/ExerciseSourcePage'), { wellnessLevel: 'admin' }),
  page(HEALTH_PATHS.sourceMuscleWiki, () => import('@/modules/health/pages/pt/ExerciseSourcePage'), { wellnessLevel: 'admin' }),
  page(HEALTH_PATHS.sourceAnatomyTool, () => import('@/modules/health/pages/pt/ExerciseSourcePage'), { wellnessLevel: 'admin' }),
  page(HEALTH_PATHS.sourceZAnatomy, () => import('@/modules/health/pages/pt/ExerciseSourcePage'), { wellnessLevel: 'admin' }),
  // Personal training, athlete side: always their own.
  page(HEALTH_PATHS.myTraining, () => import('@/modules/health/pages/pt/athlete/MyTrainingPage')),
  page(HEALTH_PATHS.myProgress, () => import('@/modules/health/pages/pt/athlete/MyProgressPage')),
  page(HEALTH_PATHS.myAthleteProfile, () => import('@/modules/health/pages/pt/athlete/MyAthleteProfilePage')),
];
