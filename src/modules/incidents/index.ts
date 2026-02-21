// Pages
export { default as Incidents } from './pages/Incidents';
export { default as IncidentAnalytics } from './pages/IncidentAnalytics';
export { default as CAPATracker } from './pages/CAPATracker';

// Components
export { IncidentDetailView } from './components/IncidentDetailView';
export { IncidentViewModal } from './components/IncidentViewModal';
export { ReportIncidentModal } from './components/ReportIncidentModal';

// Hooks
export {
  useIncidents,
  useIncidentStats,
  useCreateIncident,
  useUpdateIncident,
  useUploadIncidentAttachment,
} from './hooks/useIncidents';
export { useIncidentTimeline } from './hooks/useIncidentTimeline';
export {
  useInvestigation,
  useStartInvestigation,
  useUpdateInvestigation,
  useCompleteInvestigation,
  useApproveInvestigation,
} from './hooks/useInvestigation';
export {
  useCorrectiveActions,
  useCreateCorrectedAction,
  useUpdateCorrectedAction,
} from './hooks/useCorrectiveActions';

// Constants
export {
  INCIDENT_TYPES,
  VESSEL_LOCATIONS,
  SEVERITY_LEVELS,
  INVESTIGATION_METHODS,
  ACTION_TYPES,
  getIncidentTypeColor,
  getStatusColor,
  getCAPAStatusColor,
} from './constants';

// Types
export type { Incident, IncidentFormData, PersonInvolved, Witness } from './hooks/useIncidents';
export type { TimelineEntry } from './hooks/useIncidentTimeline';
export type {
  Investigation,
  InvestigationTeamMember,
  StartInvestigationData,
  UpdateInvestigationData,
} from './hooks/useInvestigation';
export type { CorrectiveAction, CreateCAPAData, UpdateCAPAData } from './hooks/useCorrectiveActions';
