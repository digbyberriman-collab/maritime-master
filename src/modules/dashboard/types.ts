// Dashboard Types for Vessel Dashboard

export interface DashboardSummary {
  vessel_id: string | null;
  vessel_name: string;
  imo_number: string | null;
  flag_state: string | null;
  classification_society: string | null;
  open_alerts_count: number;
  red_alerts_count: number;
  crew_onboard_count: number;
  current_captain: string | null;
  certs_expiring_90d: number;
  crew_certs_expiring_90d: number;
  overdue_drills_count: number;
  training_gaps_count: number;
  overdue_maintenance_count: number;
  critical_defects_count: number;
  audits_due_90d: number;
  open_ncs_count: number;
  open_capas_count: number;
  pending_signatures_count: number;
  data_refreshed_at: string;
}

export interface DashboardAlert {
  id: string;
  title: string;
  severity: 'red' | 'orange' | 'yellow' | 'green';
  source_module: string | null;
  due_at: string | null;
  vessel_id: string | null;
  vessel_name: string | null;
  created_at: string;
  is_overdue: boolean;
}

export interface ExpiringCertificate {
  id: string;
  certificate_type: string;
  certificate_name: string;
  expiry_date: string;
  days_until_expiry: number;
  vessel_id: string | null;
  vessel_name: string | null;
  is_crew_cert: boolean;
  crew_member_name: string | null;
}

export interface UpcomingAudit {
  id: string;
  audit_type: string;
  audit_number: string;
  audit_scope: string;
  scheduled_date: string;
  days_until_due: number;
  vessel_id: string | null;
  vessel_name: string | null;
  status: string;
}

export interface ActivityItem {
  id: string;
  activity_type: string;
  title: string;
  description: string | null;
  module: string | null;
  record_id: string | null;
  vessel_id: string | null;
  vessel_name: string | null;
  performed_by_name: string | null;
  created_at: string;
}

export interface CrewMovement {
  id: string;
  crew_name: string;
  movement_type: 'join' | 'leave';
  date: string;
  vessel_id?: string;
}

export interface OperationsSnapshot {
  next_port: string | null;
  eta: string | null;
  upcoming_crew_movements: CrewMovement[];
  pending_signatures: number;
}

// Widget visibility per role
export type WidgetKey = 
  | 'alerts'
  | 'compliance'
  | 'operations'
  | 'activity'
  | 'kpi_alerts'
  | 'kpi_crew'
  | 'kpi_captain'
  | 'kpi_certs'
  | 'kpi_drills'
  | 'kpi_training'
  | 'kpi_maintenance'
  | 'kpi_compliance'
  | 'kpi_signatures';

export const roleWidgetVisibility: Record<string, WidgetKey[]> = {
  // Shore-side roles - full fleet visibility
  superadmin: ['alerts', 'compliance', 'operations', 'activity', 'kpi_alerts', 'kpi_crew', 'kpi_captain', 'kpi_certs', 'kpi_drills', 'kpi_training', 'kpi_maintenance', 'kpi_compliance', 'kpi_signatures'],
  dpa: ['alerts', 'compliance', 'operations', 'activity', 'kpi_alerts', 'kpi_crew', 'kpi_captain', 'kpi_certs', 'kpi_drills', 'kpi_training', 'kpi_maintenance', 'kpi_compliance', 'kpi_signatures'],
  fleet_master: ['alerts', 'compliance', 'operations', 'activity', 'kpi_alerts', 'kpi_crew', 'kpi_captain', 'kpi_certs', 'kpi_drills', 'kpi_training', 'kpi_maintenance', 'kpi_compliance', 'kpi_signatures'],
  
  // Vessel command - full vessel visibility
  captain: ['alerts', 'compliance', 'operations', 'activity', 'kpi_alerts', 'kpi_crew', 'kpi_captain', 'kpi_certs', 'kpi_drills', 'kpi_training', 'kpi_maintenance', 'kpi_compliance', 'kpi_signatures'],
  master: ['alerts', 'compliance', 'operations', 'activity', 'kpi_alerts', 'kpi_crew', 'kpi_captain', 'kpi_certs', 'kpi_drills', 'kpi_training', 'kpi_maintenance', 'kpi_compliance', 'kpi_signatures'],
  
  // Senior officers - operational focus
  chief_officer: ['alerts', 'compliance', 'operations', 'kpi_alerts', 'kpi_crew', 'kpi_certs', 'kpi_drills', 'kpi_training', 'kpi_signatures'],
  chief_engineer: ['alerts', 'compliance', 'kpi_alerts', 'kpi_maintenance', 'kpi_drills', 'kpi_certs'],
  
  // Department heads - department focus
  purser: ['alerts', 'compliance', 'kpi_alerts', 'kpi_crew', 'kpi_certs', 'kpi_signatures'],
  hod_deck: ['alerts', 'kpi_alerts', 'kpi_drills', 'kpi_maintenance'],
  hod_engine: ['alerts', 'kpi_alerts', 'kpi_maintenance', 'kpi_drills'],
  hod_interior: ['alerts', 'kpi_alerts', 'kpi_crew', 'kpi_training'],
  
  // Officers - limited view
  officer: ['alerts', 'kpi_alerts', 'kpi_drills'],
  
  // Crew - minimal view
  crew: ['alerts', 'kpi_alerts'],
  
  // External roles - no dashboard widgets
  auditor_flag: [],
  auditor_class: [],
  travel_agent: [],
  employer_api: [],
};

// Helper function to check if a role can see a widget
export const canRoleSeeWidget = (role: string | null | undefined, widget: WidgetKey): boolean => {
  if (!role) return false;
  const normalizedRole = role.toLowerCase().replace(/\s+/g, '_');
  const allowedWidgets = roleWidgetVisibility[normalizedRole] || [];
  return allowedWidgets.includes(widget);
};

// Helper function to get all widgets for a role
export const getWidgetsForRole = (role: string | null | undefined): WidgetKey[] => {
  if (!role) return [];
  const normalizedRole = role.toLowerCase().replace(/\s+/g, '_');
  return roleWidgetVisibility[normalizedRole] || [];
};

// Activity type icons and labels
export const activityTypeConfig: Record<string, { label: string; color: string }> = {
  form_submitted: { label: 'Form Submitted', color: 'text-blue-500' },
  form_approved: { label: 'Form Approved', color: 'text-green-500' },
  form_rejected: { label: 'Form Rejected', color: 'text-red-500' },
  incident_logged: { label: 'Incident Logged', color: 'text-orange-500' },
  incident_closed: { label: 'Incident Closed', color: 'text-green-500' },
  certificate_uploaded: { label: 'Certificate Uploaded', color: 'text-blue-500' },
  certificate_expired: { label: 'Certificate Expired', color: 'text-red-500' },
  certificate_renewed: { label: 'Certificate Renewed', color: 'text-green-500' },
  crew_joined: { label: 'Crew Joined', color: 'text-green-500' },
  crew_left: { label: 'Crew Left', color: 'text-amber-500' },
  crew_status_changed: { label: 'Crew Status Changed', color: 'text-blue-500' },
  drill_completed: { label: 'Drill Completed', color: 'text-green-500' },
  drill_overdue: { label: 'Drill Overdue', color: 'text-red-500' },
  maintenance_completed: { label: 'Maintenance Completed', color: 'text-green-500' },
  defect_raised: { label: 'Defect Raised', color: 'text-orange-500' },
  defect_closed: { label: 'Defect Closed', color: 'text-green-500' },
  audit_completed: { label: 'Audit Completed', color: 'text-green-500' },
  nc_raised: { label: 'NC Raised', color: 'text-red-500' },
  nc_closed: { label: 'NC Closed', color: 'text-green-500' },
  capa_opened: { label: 'CAPA Opened', color: 'text-orange-500' },
  capa_closed: { label: 'CAPA Closed', color: 'text-green-500' },
  alert_created: { label: 'Alert Created', color: 'text-amber-500' },
  alert_acknowledged: { label: 'Alert Acknowledged', color: 'text-blue-500' },
  alert_resolved: { label: 'Alert Resolved', color: 'text-green-500' },
  document_uploaded: { label: 'Document Uploaded', color: 'text-blue-500' },
  task_completed: { label: 'Task Completed', color: 'text-green-500' },
};
