/**
 * Route paths for the Health & Wellness module. Kept apart from routes.tsx
 * so pages can import them without pulling in the route elements
 * (fast-refresh friendly), and so the sitemap and the router cannot drift.
 */
const H = '/health';
const MED = `${H}/medical`;
const PERSONNEL = `${MED}/personnel`;
const SPA = `${H}/spa`;
const NUT = `${H}/nutrition`;
const PHYSIO = `${H}/physio`;
const PT = `${H}/personal-training`;
const TRAINER = `${PT}/trainer`;
const ATHLETES = `${TRAINER}/athletes`;
const PROGRAMMING = `${TRAINER}/programming`;
const PT_ADMIN = `${TRAINER}/admin`;
const SOURCES = `${PT_ADMIN}/sources`;
const ATHLETE = `${PT}/athlete`;

export const HEALTH_PATHS = {
  // Medical
  medicalDashboard: `${MED}/dashboard`,
  medicalPatients: `${MED}/patients`,
  medicalStaff: `${MED}/staff`,
  medicalSupplies: `${MED}/supplies`,
  medicalFirstAid: `${MED}/first-aid`,
  medicalEquipment: `${MED}/equipment`,
  medicalProtocols: `${MED}/protocols`,
  medicalLogs: `${MED}/logs`,
  medicalScreening: `${MED}/chek`,

  // Personnel medical data
  crewMedicalRecords: `${PERSONNEL}/crew-medical-records`,
  fitnessToWork: `${PERSONNEL}/fitness-to-work-eng1`,
  vaccinations: `${PERSONNEL}/vaccinations-and-immunisations`,
  allergiesConditions: `${PERSONNEL}/allergies-and-conditions`,
  medications: `${PERSONNEL}/medications`,
  medicalCertificates: `${PERSONNEL}/medical-certificates`,
  personnelNextOfKin: `${PERSONNEL}/next-of-kin-emergency`,
  treatmentHistory: `${PERSONNEL}/incident-and-treatment-history`,

  // Spa
  spaDashboard: `${SPA}/dashboard`,
  spaCalendar: `${SPA}/calendar`,
  spaClients: `${SPA}/clients`,
  spaTreatments: `${SPA}/treatments`,
  spaInventory: `${SPA}/inventory`,

  // Nutrition
  nutritionOverview: `${NUT}/overview`,
  nutritionFoodLog: `${NUT}/food-log`,
  nutritionCalendar: `${NUT}/calendar`,
  nutritionGoals: `${NUT}/goals`,
  nutritionSettings: `${NUT}/settings`,

  // Physio
  physioRehabProtocols: `${PHYSIO}/rehab-protocols`,
  physioAssessments: `${PHYSIO}/assessments`,
  physioTreatmentPlans: `${PHYSIO}/treatment-plans`,
  physioSessionLog: `${PHYSIO}/session-log`,
  physioReferrals: `${PHYSIO}/referrals`,

  // Personal training — trainer
  trainerDashboard: `${TRAINER}/dashboard`,
  trainerSchedule: `${TRAINER}/schedule`,
  athleteRoster: `${ATHLETES}/roster`,
  athleteWorkspace: `${ATHLETES}/athlete-workspace`,
  activePrograms: `${ATHLETES}/active-programs`,
  programmingTemplates: `${PROGRAMMING}/templates`,
  programmingExercises: `${PROGRAMMING}/exercises`,
  programmingRehabProtocols: `${PROGRAMMING}/rehab-protocols`,
  programmingVideos: `${PROGRAMMING}/videos`,
  trainerAdminTrainers: `${PT_ADMIN}/trainers`,
  sourceExerciseDbImport: `${SOURCES}/exercisedb-import`,
  sourceWger: `${SOURCES}/wger`,
  sourceExerciseDbApi: `${SOURCES}/exercisedb-api`,
  sourceMuscleWiki: `${SOURCES}/musclewiki`,
  sourceAnatomyTool: `${SOURCES}/anatomytool`,
  sourceZAnatomy: `${SOURCES}/z-anatomy`,

  // Personal training — athlete
  myTraining: `${ATHLETE}/my-training`,
  myProgress: `${ATHLETE}/progress`,
  myAthleteProfile: `${ATHLETE}/profile`,
} as const;

export type HealthPath = (typeof HEALTH_PATHS)[keyof typeof HEALTH_PATHS];

/** Adds `?person=<hw_people.id>` so a page can be deep-linked to a subject. */
export const healthLink = (path: string, personId?: string | null): string =>
  personId ? `${path}?person=${personId}` : path;

/**
 * The exercise import source each `/admin/sources/...` page configures.
 * The six leaves share one page; this maps the route to the source row.
 */
export const SOURCE_BY_PATH: Record<string, string> = {
  [HEALTH_PATHS.sourceWger]: 'wger',
  [HEALTH_PATHS.sourceExerciseDbApi]: 'exercisedb',
  [HEALTH_PATHS.sourceExerciseDbImport]: 'exercisedb_import',
  [HEALTH_PATHS.sourceMuscleWiki]: 'musclewiki',
  [HEALTH_PATHS.sourceAnatomyTool]: 'anatomytool',
  [HEALTH_PATHS.sourceZAnatomy]: 'z_anatomy',
};
