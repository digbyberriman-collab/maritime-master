import React from 'react';
import { Route } from 'react-router-dom';
import ModuleRoute from '@/shared/components/ModuleRoute';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { LazyLoader } from '@/shared/components/common/LazyLoader';
import { HEALTH_PATHS } from './paths';

type Loader = () => Promise<{ default: React.ComponentType }>;

interface Gate {
  /** Clinical gate. Omitted on pages a crew member opens for their own record. */
  medicalLevel?: 'view' | 'edit' | 'admin';
  /** Wellness gate. Omitted on pages a crew member opens for themselves. */
  wellnessLevel?: 'view' | 'edit' | 'admin';
}

const page = (loader: Loader, gate: Gate = {}) => {
  const C = React.lazy(loader);
  return (
    <ModuleRoute moduleId="health" medicalLevel={gate.medicalLevel} wellnessLevel={gate.wellnessLevel}>
      <DashboardLayout>
        <React.Suspense fallback={<LazyLoader />}>
          <C />
        </React.Suspense>
      </DashboardLayout>
    </ModuleRoute>
  );
};

/**
 * Health & Wellness routes. Listed in src/routes/index.tsx before the sitemap
 * placeholder routes so they take precedence.
 *
 * Gating follows one rule: a page carries a level only when nobody outside
 * that level has business opening it. Pages a crew member opens to see their
 * own record carry no level, because the database returns their row and
 * nothing else; adding a level there would lock people out of their own
 * medical history.
 */
export const healthRoutes = (
  <>
    {/* Medical — company-wide clinical pages */}
    <Route
      path={HEALTH_PATHS.medicalDashboard}
      element={page(() => import('@/modules/health/pages/medical/MedicalDashboardPage'), {
        medicalLevel: 'view',
      })}
    />
    <Route
      path={HEALTH_PATHS.medicalPatients}
      element={page(() => import('@/modules/health/pages/medical/MedicalPatientsPage'), {
        medicalLevel: 'view',
      })}
    />
    <Route
      path={HEALTH_PATHS.medicalStaff}
      element={page(() => import('@/modules/health/pages/medical/MedicalStaffPage'), {
        medicalLevel: 'view',
      })}
    />
    <Route
      path={HEALTH_PATHS.medicalSupplies}
      element={page(() => import('@/modules/health/pages/medical/MedicalSuppliesPage'), {
        medicalLevel: 'view',
      })}
    />
    <Route
      path={HEALTH_PATHS.medicalFirstAid}
      element={page(() => import('@/modules/health/pages/medical/FirstAidPage'), {
        medicalLevel: 'view',
      })}
    />
    <Route
      path={HEALTH_PATHS.medicalEquipment}
      element={page(() => import('@/modules/health/pages/medical/MedicalEquipmentPage'), {
        medicalLevel: 'view',
      })}
    />
    <Route
      path={HEALTH_PATHS.medicalProtocols}
      element={page(() => import('@/modules/health/pages/medical/MedicalProtocolsPage'))}
    />
    <Route
      path={HEALTH_PATHS.medicalLogs}
      element={page(() => import('@/modules/health/pages/medical/MedicalLogsPage'), {
        medicalLevel: 'view',
      })}
    />
    {/* Crew complete their own screening, so this one is not gated. */}
    <Route
      path={HEALTH_PATHS.medicalScreening}
      element={page(() => import('@/modules/health/pages/medical/HealthScreeningPage'))}
    />

    {/* Personnel medical data — a crew member's own record is theirs to read */}
    <Route
      path={HEALTH_PATHS.crewMedicalRecords}
      element={page(() => import('@/modules/health/pages/medical/CrewMedicalRecordsPage'))}
    />
    <Route
      path={HEALTH_PATHS.fitnessToWork}
      element={page(() => import('@/modules/health/pages/medical/FitnessToWorkPage'))}
    />
    <Route
      path={HEALTH_PATHS.vaccinations}
      element={page(() => import('@/modules/health/pages/medical/VaccinationsPage'))}
    />
    <Route
      path={HEALTH_PATHS.allergiesConditions}
      element={page(() => import('@/modules/health/pages/medical/AllergiesConditionsPage'))}
    />
    <Route
      path={HEALTH_PATHS.medications}
      element={page(() => import('@/modules/health/pages/medical/MedicationsPage'))}
    />
    <Route
      path={HEALTH_PATHS.medicalCertificates}
      element={page(() => import('@/modules/health/pages/medical/MedicalCertificatesPage'))}
    />
    <Route
      path={HEALTH_PATHS.personnelNextOfKin}
      element={page(() => import('@/modules/health/pages/medical/PersonnelNextOfKinPage'))}
    />
    <Route
      path={HEALTH_PATHS.treatmentHistory}
      element={page(() => import('@/modules/health/pages/medical/TreatmentHistoryPage'))}
    />

    {/* Spa */}
    <Route
      path={HEALTH_PATHS.spaDashboard}
      element={page(() => import('@/modules/health/pages/spa/SpaDashboardPage'), {
        wellnessLevel: 'view',
      })}
    />
    <Route
      path={HEALTH_PATHS.spaCalendar}
      element={page(() => import('@/modules/health/pages/spa/SpaCalendarPage'))}
    />
    <Route
      path={HEALTH_PATHS.spaClients}
      element={page(() => import('@/modules/health/pages/spa/SpaClientsPage'), {
        wellnessLevel: 'view',
      })}
    />
    <Route
      path={HEALTH_PATHS.spaTreatments}
      element={page(() => import('@/modules/health/pages/spa/SpaTreatmentsPage'))}
    />
    <Route
      path={HEALTH_PATHS.spaInventory}
      element={page(() => import('@/modules/health/pages/spa/SpaInventoryPage'), {
        wellnessLevel: 'view',
      })}
    />

    {/* Nutrition — everyone tracks their own */}
    <Route
      path={HEALTH_PATHS.nutritionOverview}
      element={page(() => import('@/modules/health/pages/nutrition/NutritionOverviewPage'))}
    />
    <Route
      path={HEALTH_PATHS.nutritionFoodLog}
      element={page(() => import('@/modules/health/pages/nutrition/FoodLogPage'))}
    />
    <Route
      path={HEALTH_PATHS.nutritionCalendar}
      element={page(() => import('@/modules/health/pages/nutrition/MealCalendarPage'))}
    />
    <Route
      path={HEALTH_PATHS.nutritionGoals}
      element={page(() => import('@/modules/health/pages/nutrition/NutritionGoalsPage'))}
    />
    <Route
      path={HEALTH_PATHS.nutritionSettings}
      element={page(() => import('@/modules/health/pages/nutrition/NutritionSettingsPage'), {
        wellnessLevel: 'admin',
      })}
    />

    {/* Physio — clinical, so the page itself checks the physio discipline */}
    <Route
      path={HEALTH_PATHS.physioRehabProtocols}
      element={page(() => import('@/modules/health/pages/pt/RehabProtocolLibraryPage'), {
        wellnessLevel: 'view',
      })}
    />
    <Route
      path={HEALTH_PATHS.physioAssessments}
      element={page(() => import('@/modules/health/pages/physio/PhysioAssessmentsPage'))}
    />
    <Route
      path={HEALTH_PATHS.physioTreatmentPlans}
      element={page(() => import('@/modules/health/pages/physio/TreatmentPlansPage'))}
    />
    <Route
      path={HEALTH_PATHS.physioSessionLog}
      element={page(() => import('@/modules/health/pages/physio/SessionLogPage'))}
    />
    <Route
      path={HEALTH_PATHS.physioReferrals}
      element={page(() => import('@/modules/health/pages/physio/ReferralsPage'))}
    />

    {/* Personal training — trainer side */}
    <Route
      path={HEALTH_PATHS.trainerDashboard}
      element={page(() => import('@/modules/health/pages/pt/TrainerDashboardPage'), {
        wellnessLevel: 'view',
      })}
    />
    <Route
      path={HEALTH_PATHS.trainerSchedule}
      element={page(() => import('@/modules/health/pages/pt/TrainerSchedulePage'), {
        wellnessLevel: 'view',
      })}
    />
    <Route
      path={HEALTH_PATHS.athleteRoster}
      element={page(() => import('@/modules/health/pages/pt/AthleteRosterPage'), {
        wellnessLevel: 'view',
      })}
    />
    <Route
      path={HEALTH_PATHS.athleteWorkspace}
      element={page(() => import('@/modules/health/pages/pt/AthleteWorkspacePage'), {
        wellnessLevel: 'view',
      })}
    />
    <Route
      path={HEALTH_PATHS.activePrograms}
      element={page(() => import('@/modules/health/pages/pt/ActiveProgramsPage'), {
        wellnessLevel: 'view',
      })}
    />
    <Route
      path={HEALTH_PATHS.programmingTemplates}
      element={page(() => import('@/modules/health/pages/pt/ProgramTemplatesPage'), {
        wellnessLevel: 'view',
      })}
    />
    <Route
      path={HEALTH_PATHS.programmingExercises}
      element={page(() => import('@/modules/health/pages/pt/ExerciseLibraryPage'))}
    />
    <Route
      path={HEALTH_PATHS.programmingRehabProtocols}
      element={page(() => import('@/modules/health/pages/pt/RehabProtocolLibraryPage'), {
        wellnessLevel: 'view',
      })}
    />
    <Route
      path={HEALTH_PATHS.programmingVideos}
      element={page(() => import('@/modules/health/pages/pt/VideoLibraryPage'))}
    />
    <Route
      path={HEALTH_PATHS.trainerAdminTrainers}
      element={page(() => import('@/modules/health/pages/pt/TrainersAdminPage'), {
        wellnessLevel: 'admin',
      })}
    />

    {/* Exercise import connectors: one page, six routes, credentials inside */}
    {[
      HEALTH_PATHS.sourceExerciseDbImport,
      HEALTH_PATHS.sourceWger,
      HEALTH_PATHS.sourceExerciseDbApi,
      HEALTH_PATHS.sourceMuscleWiki,
      HEALTH_PATHS.sourceAnatomyTool,
      HEALTH_PATHS.sourceZAnatomy,
    ].map((path) => (
      <Route
        key={path}
        path={path}
        element={page(() => import('@/modules/health/pages/pt/ExerciseSourcePage'), {
          wellnessLevel: 'admin',
        })}
      />
    ))}

    {/* Personal training — athlete side, always their own */}
    <Route
      path={HEALTH_PATHS.myTraining}
      element={page(() => import('@/modules/health/pages/pt/athlete/MyTrainingPage'))}
    />
    <Route
      path={HEALTH_PATHS.myProgress}
      element={page(() => import('@/modules/health/pages/pt/athlete/MyProgressPage'))}
    />
    <Route
      path={HEALTH_PATHS.myAthleteProfile}
      element={page(() => import('@/modules/health/pages/pt/athlete/MyAthleteProfilePage'))}
    />
  </>
);
