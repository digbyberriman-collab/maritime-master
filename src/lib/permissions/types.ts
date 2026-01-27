// RBAC Types and Enums

// Application roles matching database enum
export type AppRole =
  | 'superadmin'
  | 'dpa'
  | 'fleet_master'
  | 'captain'
  | 'purser'
  | 'chief_officer'
  | 'chief_engineer'
  | 'hod'
  | 'officer'
  | 'crew'
  | 'auditor_flag'
  | 'auditor_class'
  | 'travel_agent'
  | 'employer_api';

export const APP_ROLES: AppRole[] = [
  'superadmin',
  'dpa',
  'fleet_master',
  'captain',
  'purser',
  'chief_officer',
  'chief_engineer',
  'hod',
  'officer',
  'crew',
  'auditor_flag',
  'auditor_class',
  'travel_agent',
  'employer_api',
];

export const ROLE_LABELS: Record<AppRole, string> = {
  superadmin: 'Superadmin',
  dpa: 'DPA',
  fleet_master: 'Fleet Master',
  captain: 'Captain/Master',
  purser: 'Purser',
  chief_officer: 'Chief Officer',
  chief_engineer: 'Chief Engineer',
  hod: 'Head of Department',
  officer: 'Officer',
  crew: 'Crew',
  auditor_flag: 'Flag State Auditor',
  auditor_class: 'Classification Auditor',
  travel_agent: 'Travel Agent',
  employer_api: 'Employer API',
};

// Scope types
export type AccessScope = 'fleet' | 'vessel' | 'department' | 'self' | 'external';

export interface ScopeAccess {
  fleet: 'full' | 'read' | 'none';
  vessel: 'full' | 'admin' | 'read' | 'limited' | 'minimal' | 'audit_view' | 'none';
  department: 'full' | 'read' | 'none';
  self: 'full' | 'none';
  external: 'configure' | 'view' | 'flights_only' | 'crew_limited' | 'none';
}

// User role assignment
export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  company_id: string | null;
  vessel_id: string | null;
  department: string | null;
  granted_by: string | null;
  granted_at: string;
  expires_at: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
}

// Permission check context
export interface PermissionContext {
  userId?: string;
  targetUserId?: string;
  companyId?: string;
  vesselId?: string;
  targetVesselId?: string;
  department?: string;
  targetDepartment?: string;
  isSelf?: boolean;
}

// Module types
export type Module =
  | 'crew'
  | 'incidents'
  | 'maintenance'
  | 'vessel_certificates'
  | 'flights'
  | 'alerts'
  | 'documents'
  | 'drills'
  | 'training'
  | 'audits'
  | 'risk_assessments'
  | 'sms_forms';

// Action types per module
export type CrewAction =
  | 'view_roster'
  | 'view_profile'
  | 'edit_profile'
  | 'edit_own_limited'
  | 'add_crew'
  | 'delete_crew'
  | 'import_csv'
  | 'send_invitation'
  | 'view_certificates'
  | 'edit_certificates'
  | 'view_salary'
  | 'view_medical'
  | 'view_disciplinary';

export type IncidentAction =
  | 'view_all'
  | 'view_vessel'
  | 'view_anonymized'
  | 'create'
  | 'edit_own'
  | 'edit_all'
  | 'open_investigation'
  | 'close_investigation'
  | 'approve_no_investigation';

export type MaintenanceAction =
  | 'view_dashboard'
  | 'view_defects'
  | 'view_ism_critical'
  | 'create_ism_defect';

export type VesselCertAction = 'view' | 'upload' | 'approve' | 'reject';

export type FlightAction =
  | 'view_all'
  | 'view_vessel'
  | 'view_own'
  | 'create_request'
  | 'send_to_agent'
  | 'update_booking'
  | 'upload_documents';

export type AlertAction =
  | 'view_fleet'
  | 'view_vessel'
  | 'acknowledge'
  | 'snooze'
  | 'resolve'
  | 'configure_rules';

export type ModuleAction =
  | CrewAction
  | IncidentAction
  | MaintenanceAction
  | VesselCertAction
  | FlightAction
  | AlertAction;
