// Components
export { default as CreateRATemplateModal } from './components/CreateRATemplateModal';
export { default as CreateRiskAssessmentModal } from './components/CreateRiskAssessmentModal';
export { default as CreateWorkPermitModal } from './components/CreateWorkPermitModal';
export { default as RATemplatesTab } from './components/RATemplatesTab';
export { default as RiskAssessmentDetailModal } from './components/RiskAssessmentDetailModal';
export { default as RiskAssessmentsTab } from './components/RiskAssessmentsTab';
export { default as RiskMatrix } from './components/RiskMatrix';
export { default as WorkPermitDetailModal } from './components/WorkPermitDetailModal';
export { default as WorkPermitsTab } from './components/WorkPermitsTab';

// Hooks
export {
  useRiskAssessmentTemplates,
  useCreateRiskAssessmentTemplate,
  useUpdateRiskAssessmentTemplate,
  useRiskAssessments,
  useRiskAssessment,
  useCreateRiskAssessment,
  useUpdateRiskAssessment,
  useDeleteRiskAssessment,
  useRiskAssessmentHazards,
  useCreateRiskAssessmentHazard,
  useUpdateRiskAssessmentHazard,
  useDeleteRiskAssessmentHazard,
  useBulkCreateHazards,
  useWorkPermits,
  useWorkPermit,
  useCreateWorkPermit,
  useUpdateWorkPermit,
  useDeleteWorkPermit,
  usePermitExtensions,
  useCreatePermitExtension,
  useRiskAssessmentStats,
  useWorkPermitStats,
} from './hooks/useRiskAssessments';

// Types
export type {
  RiskAssessmentTemplate,
  RiskAssessment,
  RiskAssessmentHazard,
  WorkPermit,
  PermitExtension,
} from './hooks/useRiskAssessments';

// Constants
export {
  RA_STATUS,
  RA_STATUS_OPTIONS,
  PERMIT_STATUS,
  PERMIT_STATUS_OPTIONS,
  PERMIT_TYPES,
  PERMIT_TYPE_OPTIONS,
  TASK_CATEGORIES,
  LIKELIHOOD_LEVELS,
  SEVERITY_LEVELS,
  getRiskLevel,
  getRiskMatrixColor,
  RESPONSIBLE_ROLES,
  COMMON_HAZARDS,
  SAFETY_PRECAUTIONS,
  EMERGENCY_EQUIPMENT,
} from './constants';

// Pages
export { default as RiskAssessmentsPage } from './pages/RiskAssessments';
