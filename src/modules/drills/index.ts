// Components
export { default as DrillDetailModal } from './components/DrillDetailModal';
export { default as DrillHistoryTab } from './components/DrillHistoryTab';
export { default as DrillScheduleTab } from './components/DrillScheduleTab';
export { default as EmergencyContactsModal } from './components/EmergencyContactsModal';
export { default as EmergencyProceduresTab } from './components/EmergencyProceduresTab';
export { default as EquipmentReadinessTab } from './components/EquipmentReadinessTab';
export { default as ScheduleDrillModal } from './components/ScheduleDrillModal';

// Hooks
export { useDrills, useDrillDetails } from './hooks/useDrills';
export type { DrillType, Drill, DrillParticipant, DrillEvaluation, DrillDeficiency, DrillEquipment, EmergencyContact, EmergencyProcedure } from './hooks/useDrills';

// Pages
export { default as Drills } from './pages/Drills';
export { default as DrillAnalytics } from './pages/DrillAnalytics';

// Constants
export {
  DRILL_CATEGORIES,
  DRILL_STATUSES,
  WEATHER_CONDITIONS,
  DEFICIENCY_SEVERITIES,
  EQUIPMENT_STATUSES,
  CONTACT_CATEGORIES,
  EMERGENCY_TYPES,
  DEFAULT_OBJECTIVES,
  DEFAULT_EQUIPMENT,
  STATION_ASSIGNMENTS,
  DRILL_TYPE_COLORS,
  getDrillTypeColor,
  generateDrillNumber,
  calculateComplianceStatus,
} from './constants';
