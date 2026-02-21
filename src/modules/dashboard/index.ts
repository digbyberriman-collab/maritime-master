// Dashboard module public API

// Pages
export { default as Dashboard } from './pages/Dashboard';
export { default as DPADashboard } from './pages/DPADashboard';
export { default as FleetMap } from './pages/FleetMap';

// Components
export { AlertKPITiles } from './components/AlertKPITiles';
export { ComplianceSnapshot } from './components/ComplianceSnapshot';
export { DashboardHeader } from './components/DashboardHeader';
export { FleetFilter } from './components/FleetFilter';
export { KPITiles } from './components/KPITiles';
export { default as MaintenanceWidgets } from './components/MaintenanceWidgets';
export { OperationsSnapshot } from './components/OperationsSnapshot';
export { QuickActionsMenu } from './components/QuickActionsMenu';
export { RecentActivityFeed } from './components/RecentActivityFeed';
export {
  AlertsWidget,
  CrewWidget,
  CertificatesWidget,
  MaintenanceWidget,
  DrillsWidget,
  TrainingWidget,
  ComplianceWidget,
  SignaturesWidget,
  WidgetSkeleton,
} from './components/VesselDashboardWidgets';
export { default as VesselFilter } from './components/VesselFilter';
export { default as VesselHeader } from './components/VesselHeader';

// Store
export {
  useDashboardStore,
  useDashboardSummary,
  useDashboardAlerts,
  useDashboardCerts,
  useDashboardAudits,
  useDashboardActivity,
  useDashboardLoading,
  useDashboardVesselContext,
} from './store/dashboardStore';

// Types
export type {
  DashboardSummary,
  DashboardAlert,
  ExpiringCertificate,
  UpcomingAudit,
  ActivityItem,
  CrewMovement,
  OperationsSnapshot as OperationsSnapshotType,
  WidgetKey,
} from './types';

export {
  roleWidgetVisibility,
  canRoleSeeWidget,
  getWidgetsForRole,
  activityTypeConfig,
} from './types';
