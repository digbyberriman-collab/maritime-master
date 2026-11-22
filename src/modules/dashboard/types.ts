import type { Tone } from '@/components/ui/tones';

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

/**
 * Activity types: label and status tone (gap/10 §A.8). Render the tone with
 * TONE_TEXT / TONE_SURFACE from `@/components/ui/tones`; never a raw palette
 * class (gap/10 C.3).
 */
export const activityTypeConfig: Record<string, { label: string; tone: Tone }> = {
  form_submitted: { label: 'Form Submitted', tone: 'info' },
  form_approved: { label: 'Form Approved', tone: 'ok' },
  form_rejected: { label: 'Form Rejected', tone: 'danger' },
  incident_logged: { label: 'Incident Logged', tone: 'orange' },
  incident_closed: { label: 'Incident Closed', tone: 'ok' },
  certificate_uploaded: { label: 'Certificate Uploaded', tone: 'info' },
  certificate_expired: { label: 'Certificate Expired', tone: 'danger' },
  certificate_renewed: { label: 'Certificate Renewed', tone: 'ok' },
  crew_joined: { label: 'Crew Joined', tone: 'ok' },
  crew_left: { label: 'Crew Left', tone: 'warn' },
  crew_status_changed: { label: 'Crew Status Changed', tone: 'info' },
  drill_completed: { label: 'Drill Completed', tone: 'ok' },
  drill_overdue: { label: 'Drill Overdue', tone: 'danger' },
  maintenance_completed: { label: 'Maintenance Completed', tone: 'ok' },
  defect_raised: { label: 'Defect Raised', tone: 'orange' },
  defect_closed: { label: 'Defect Closed', tone: 'ok' },
  audit_completed: { label: 'Audit Completed', tone: 'ok' },
  nc_raised: { label: 'NC Raised', tone: 'danger' },
  nc_closed: { label: 'NC Closed', tone: 'ok' },
  capa_opened: { label: 'CAPA Opened', tone: 'orange' },
  capa_closed: { label: 'CAPA Closed', tone: 'ok' },
  alert_created: { label: 'Alert Created', tone: 'warn' },
  alert_acknowledged: { label: 'Alert Acknowledged', tone: 'info' },
  alert_resolved: { label: 'Alert Resolved', tone: 'ok' },
  document_uploaded: { label: 'Document Uploaded', tone: 'info' },
  task_completed: { label: 'Task Completed', tone: 'ok' },
};
