import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { HEALTH_PATHS } from '@/modules/health/paths';
import {
  emptyFixtures,
  populatedFixtures,
  renderHealthPage,
  setupHealthAccess,
  setupSupabase,
  PERSON_ID,
  type HealthRole,
} from '@/test/health/harness';

vi.mock('@/integrations/supabase/client', async () => {
  const s = await import('@/test/hris/state');
  return { supabase: s.supabaseProxy };
});
vi.mock('@/modules/auth/contexts/AuthContext', async () => {
  const s = await import('@/test/hris/state');
  return {
    useAuth: () => s.authState.value,
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});
vi.mock('@/modules/vessels/contexts/VesselContext', () => ({
  useVessel: () => ({
    vessels: [{ id: 'v1', name: 'M/Y Draak', company_id: 'co-1' }],
    selectedVessel: null,
    selectedVesselId: null,
    setSelectedVessel: () => undefined,
    loading: false,
    canAccessAllVessels: true,
  }),
  VesselProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Medical
import MedicalDashboardPage from '@/modules/health/pages/medical/MedicalDashboardPage';
import MedicalPatientsPage from '@/modules/health/pages/medical/MedicalPatientsPage';
import MedicalStaffPage from '@/modules/health/pages/medical/MedicalStaffPage';
import MedicalSuppliesPage from '@/modules/health/pages/medical/MedicalSuppliesPage';
import FirstAidPage from '@/modules/health/pages/medical/FirstAidPage';
import MedicalEquipmentPage from '@/modules/health/pages/medical/MedicalEquipmentPage';
import MedicalProtocolsPage from '@/modules/health/pages/medical/MedicalProtocolsPage';
import MedicalLogsPage from '@/modules/health/pages/medical/MedicalLogsPage';
import HealthScreeningPage from '@/modules/health/pages/medical/HealthScreeningPage';
import CrewMedicalRecordsPage from '@/modules/health/pages/medical/CrewMedicalRecordsPage';
import FitnessToWorkPage from '@/modules/health/pages/medical/FitnessToWorkPage';
import VaccinationsPage from '@/modules/health/pages/medical/VaccinationsPage';
import AllergiesConditionsPage from '@/modules/health/pages/medical/AllergiesConditionsPage';
import MedicationsPage from '@/modules/health/pages/medical/MedicationsPage';
import MedicalCertificatesPage from '@/modules/health/pages/medical/MedicalCertificatesPage';
import PersonnelNextOfKinPage from '@/modules/health/pages/medical/PersonnelNextOfKinPage';
import TreatmentHistoryPage from '@/modules/health/pages/medical/TreatmentHistoryPage';

// Spa
import SpaDashboardPage from '@/modules/health/pages/spa/SpaDashboardPage';
import SpaCalendarPage from '@/modules/health/pages/spa/SpaCalendarPage';
import SpaClientsPage from '@/modules/health/pages/spa/SpaClientsPage';
import SpaTreatmentsPage from '@/modules/health/pages/spa/SpaTreatmentsPage';
import SpaInventoryPage from '@/modules/health/pages/spa/SpaInventoryPage';

// Nutrition
import NutritionOverviewPage from '@/modules/health/pages/nutrition/NutritionOverviewPage';
import FoodLogPage from '@/modules/health/pages/nutrition/FoodLogPage';
import MealCalendarPage from '@/modules/health/pages/nutrition/MealCalendarPage';
import NutritionGoalsPage from '@/modules/health/pages/nutrition/NutritionGoalsPage';
import NutritionSettingsPage from '@/modules/health/pages/nutrition/NutritionSettingsPage';

// Physio
import PhysioAssessmentsPage from '@/modules/health/pages/physio/PhysioAssessmentsPage';
import TreatmentPlansPage from '@/modules/health/pages/physio/TreatmentPlansPage';
import SessionLogPage from '@/modules/health/pages/physio/SessionLogPage';
import ReferralsPage from '@/modules/health/pages/physio/ReferralsPage';

// Personal training
import TrainerDashboardPage from '@/modules/health/pages/pt/TrainerDashboardPage';
import TrainerSchedulePage from '@/modules/health/pages/pt/TrainerSchedulePage';
import AthleteRosterPage from '@/modules/health/pages/pt/AthleteRosterPage';
import AthleteWorkspacePage from '@/modules/health/pages/pt/AthleteWorkspacePage';
import ActiveProgramsPage from '@/modules/health/pages/pt/ActiveProgramsPage';
import ProgramTemplatesPage from '@/modules/health/pages/pt/ProgramTemplatesPage';
import ExerciseLibraryPage from '@/modules/health/pages/pt/ExerciseLibraryPage';
import RehabProtocolLibraryPage from '@/modules/health/pages/pt/RehabProtocolLibraryPage';
import VideoLibraryPage from '@/modules/health/pages/pt/VideoLibraryPage';
import TrainersAdminPage from '@/modules/health/pages/pt/TrainersAdminPage';
import ExerciseSourcePage from '@/modules/health/pages/pt/ExerciseSourcePage';
import MyTrainingPage from '@/modules/health/pages/pt/athlete/MyTrainingPage';
import MyProgressPage from '@/modules/health/pages/pt/athlete/MyProgressPage';
import MyAthleteProfilePage from '@/modules/health/pages/pt/athlete/MyAthleteProfilePage';

interface PageCase {
  name: string;
  Page: React.ComponentType;
  route: string;
  /** Who opens it. Defaults to the ship's medic, who holds both accesses. */
  role?: HealthRole;
}

const PAGES: PageCase[] = [
  { name: 'Medical dashboard', Page: MedicalDashboardPage, route: HEALTH_PATHS.medicalDashboard },
  { name: 'Patients', Page: MedicalPatientsPage, route: HEALTH_PATHS.medicalPatients },
  { name: 'Medical staff', Page: MedicalStaffPage, route: HEALTH_PATHS.medicalStaff },
  { name: 'Medical stores', Page: MedicalSuppliesPage, route: HEALTH_PATHS.medicalSupplies },
  { name: 'First aid', Page: FirstAidPage, route: HEALTH_PATHS.medicalFirstAid },
  { name: 'Medical equipment', Page: MedicalEquipmentPage, route: HEALTH_PATHS.medicalEquipment },
  { name: 'Protocols', Page: MedicalProtocolsPage, route: HEALTH_PATHS.medicalProtocols },
  { name: 'Medical logs', Page: MedicalLogsPage, route: HEALTH_PATHS.medicalLogs },
  { name: 'Health screening', Page: HealthScreeningPage, route: HEALTH_PATHS.medicalScreening },
  { name: 'Crew medical records', Page: CrewMedicalRecordsPage, route: HEALTH_PATHS.crewMedicalRecords },
  { name: 'Fitness to work', Page: FitnessToWorkPage, route: HEALTH_PATHS.fitnessToWork },
  { name: 'Vaccinations', Page: VaccinationsPage, route: HEALTH_PATHS.vaccinations },
  { name: 'Allergies and conditions', Page: AllergiesConditionsPage, route: HEALTH_PATHS.allergiesConditions },
  { name: 'Medications', Page: MedicationsPage, route: HEALTH_PATHS.medications },
  { name: 'Medical certificates', Page: MedicalCertificatesPage, route: HEALTH_PATHS.medicalCertificates },
  { name: 'Next of kin', Page: PersonnelNextOfKinPage, route: HEALTH_PATHS.personnelNextOfKin },
  { name: 'Treatment history', Page: TreatmentHistoryPage, route: HEALTH_PATHS.treatmentHistory },

  { name: 'Spa dashboard', Page: SpaDashboardPage, route: HEALTH_PATHS.spaDashboard },
  { name: 'Spa calendar', Page: SpaCalendarPage, route: HEALTH_PATHS.spaCalendar },
  { name: 'Spa clients', Page: SpaClientsPage, route: HEALTH_PATHS.spaClients },
  { name: 'Spa treatments', Page: SpaTreatmentsPage, route: HEALTH_PATHS.spaTreatments },
  { name: 'Spa inventory', Page: SpaInventoryPage, route: HEALTH_PATHS.spaInventory },

  { name: 'Nutrition overview', Page: NutritionOverviewPage, route: HEALTH_PATHS.nutritionOverview },
  { name: 'Food log', Page: FoodLogPage, route: HEALTH_PATHS.nutritionFoodLog },
  { name: 'Meal calendar', Page: MealCalendarPage, route: HEALTH_PATHS.nutritionCalendar },
  { name: 'Nutrition goals', Page: NutritionGoalsPage, route: HEALTH_PATHS.nutritionGoals },
  { name: 'Nutrition settings', Page: NutritionSettingsPage, route: HEALTH_PATHS.nutritionSettings, role: 'dpa' },

  { name: 'Physio assessments', Page: PhysioAssessmentsPage, route: HEALTH_PATHS.physioAssessments },
  { name: 'Treatment plans', Page: TreatmentPlansPage, route: HEALTH_PATHS.physioTreatmentPlans },
  { name: 'Physio session log', Page: SessionLogPage, route: HEALTH_PATHS.physioSessionLog },
  { name: 'Physio referrals', Page: ReferralsPage, route: HEALTH_PATHS.physioReferrals },

  { name: 'Trainer dashboard', Page: TrainerDashboardPage, route: HEALTH_PATHS.trainerDashboard, role: 'trainer' },
  { name: 'Trainer schedule', Page: TrainerSchedulePage, route: HEALTH_PATHS.trainerSchedule, role: 'trainer' },
  { name: 'Athlete roster', Page: AthleteRosterPage, route: HEALTH_PATHS.athleteRoster, role: 'trainer' },
  { name: 'Athlete workspace', Page: AthleteWorkspacePage, route: HEALTH_PATHS.athleteWorkspace, role: 'trainer' },
  { name: 'Active programmes', Page: ActiveProgramsPage, route: HEALTH_PATHS.activePrograms, role: 'trainer' },
  { name: 'Programme templates', Page: ProgramTemplatesPage, route: HEALTH_PATHS.programmingTemplates, role: 'trainer' },
  { name: 'Exercise library', Page: ExerciseLibraryPage, route: HEALTH_PATHS.programmingExercises, role: 'trainer' },
  { name: 'Rehab protocols', Page: RehabProtocolLibraryPage, route: HEALTH_PATHS.programmingRehabProtocols, role: 'trainer' },
  { name: 'Video library', Page: VideoLibraryPage, route: HEALTH_PATHS.programmingVideos, role: 'trainer' },
  { name: 'Trainers admin', Page: TrainersAdminPage, route: HEALTH_PATHS.trainerAdminTrainers, role: 'dpa' },
  { name: 'Exercise source (wger)', Page: ExerciseSourcePage, route: HEALTH_PATHS.sourceWger, role: 'dpa' },
  { name: 'My training', Page: MyTrainingPage, route: HEALTH_PATHS.myTraining, role: 'crew' },
  { name: 'My progress', Page: MyProgressPage, route: HEALTH_PATHS.myProgress, role: 'crew' },
  { name: 'My athlete profile', Page: MyAthleteProfilePage, route: HEALTH_PATHS.myAthleteProfile, role: 'crew' },
];

/**
 * Every page in the section, rendered twice: against a company with no data
 * at all, which is what a vessel looks like the day this is switched on, and
 * against one with a crew member on record.
 *
 * The assertion is deliberately weak. It is not checking what each page says,
 * it is checking that none of them throws: a hook called conditionally, a
 * `[0]` on an empty list, a date parsed from null. Those are the failures that
 * typecheck and lint cannot see, and that a medic would meet as a white screen.
 */
describe('Health & Wellness pages render', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  describe('on a company with no data yet', () => {
    for (const { name, Page, route, role } of PAGES) {
      it(`renders ${name}`, async () => {
        setupSupabase(emptyFixtures());
        setupHealthAccess(role ?? 'medic');
        const { container } = renderHealthPage(Page, { route });
        await waitFor(() => expect(container.firstChild).toBeTruthy());
        expect(container.textContent?.length ?? 0).toBeGreaterThan(0);
      });
    }
  });

  describe('with a crew member on record', () => {
    for (const { name, Page, route, role } of PAGES) {
      it(`renders ${name}`, async () => {
        setupSupabase(populatedFixtures());
        setupHealthAccess(role ?? 'medic');
        const deepLink = route.includes('?') ? route : `${route}?person=${PERSON_ID}`;
        const { container } = renderHealthPage(Page, { route: deepLink, path: route });
        await waitFor(() => expect(container.firstChild).toBeTruthy());
        expect(container.textContent?.length ?? 0).toBeGreaterThan(0);
      });
    }
  });

  it('badges the access each person actually holds', async () => {
    setupSupabase(populatedFixtures());
    setupHealthAccess('medic');
    const medicView = renderHealthPage(MedicalPatientsPage, { route: HEALTH_PATHS.medicalPatients });
    await waitFor(() => expect(screen.getByText('Patients')).toBeInTheDocument());
    expect(screen.getByText('Clinical')).toBeInTheDocument();
    medicView.unmount();

    setupSupabase(populatedFixtures());
    setupHealthAccess('crew');
    renderHealthPage(CrewMedicalRecordsPage, { route: HEALTH_PATHS.crewMedicalRecords });
    await waitFor(() => expect(screen.getByText('Crew medical records')).toBeInTheDocument());
    // A crew member holds self-service access only, so the page says so and
    // never offers them the company-wide picker.
    expect(screen.getByText('My records')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Choose whose record/i)).not.toBeInTheDocument();
  });
});
