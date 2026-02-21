// Components
export { default as AddTrainingModal } from './components/AddTrainingModal';
export { default as ComplianceOverviewTab } from './components/ComplianceOverviewTab';
export { default as FamiliarizationTab } from './components/FamiliarizationTab';
export { default as FamiliarizationTemplatesModal } from './components/FamiliarizationTemplatesModal';
export { default as TrainingMatrixTab } from './components/TrainingMatrixTab';
export { default as TrainingRecordsTab } from './components/TrainingRecordsTab';

// Hooks
export { useTraining } from './hooks/useTraining';
export type {
  TrainingCourse,
  TrainingRecord,
  FamiliarizationTemplate,
  FamiliarizationRecord,
  FamiliarizationChecklistItem,
  TrainingMatrix,
} from './hooks/useTraining';

// Constants
export {
  COURSE_CATEGORIES,
  TRAINING_STATUSES,
  FAMILIARIZATION_STATUSES,
  GRADE_OPTIONS,
  DEFAULT_FAMILIARIZATION_SECTIONS,
  getTrainingStatusColor,
  getFamiliarizationStatusColor,
  getCategoryColor,
  calculateTrainingStatus,
  daysUntilExpiry,
} from './constants';

// Pages
export { default as Training } from './pages/Training';
