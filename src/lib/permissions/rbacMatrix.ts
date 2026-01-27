// RBAC Matrix - Role-Based Access Control definitions
import { AppRole, ScopeAccess } from './types';

// Scope access matrix by role
export const SCOPE_MATRIX: Record<AppRole, ScopeAccess> = {
  superadmin: {
    fleet: 'full',
    vessel: 'full',
    department: 'full',
    self: 'full',
    external: 'configure',
  },
  dpa: {
    fleet: 'full',
    vessel: 'full',
    department: 'full',
    self: 'full',
    external: 'view',
  },
  fleet_master: {
    fleet: 'read',
    vessel: 'full',
    department: 'full',
    self: 'full',
    external: 'none',
  },
  captain: {
    fleet: 'none',
    vessel: 'full', // assigned vessel only
    department: 'full',
    self: 'full',
    external: 'none',
  },
  purser: {
    fleet: 'none',
    vessel: 'admin', // assigned vessel only
    department: 'full',
    self: 'full',
    external: 'none',
  },
  chief_officer: {
    fleet: 'none',
    vessel: 'read',
    department: 'full', // Deck only
    self: 'full',
    external: 'none',
  },
  chief_engineer: {
    fleet: 'none',
    vessel: 'read',
    department: 'full', // Engine only
    self: 'full',
    external: 'none',
  },
  hod: {
    fleet: 'none',
    vessel: 'read',
    department: 'full', // own department only
    self: 'full',
    external: 'none',
  },
  officer: {
    fleet: 'none',
    vessel: 'limited',
    department: 'read',
    self: 'full',
    external: 'none',
  },
  crew: {
    fleet: 'none',
    vessel: 'minimal',
    department: 'none',
    self: 'full',
    external: 'none',
  },
  auditor_flag: {
    fleet: 'none',
    vessel: 'audit_view',
    department: 'none',
    self: 'none',
    external: 'none',
  },
  auditor_class: {
    fleet: 'none',
    vessel: 'audit_view',
    department: 'none',
    self: 'none',
    external: 'none',
  },
  travel_agent: {
    fleet: 'none',
    vessel: 'none',
    department: 'none',
    self: 'none',
    external: 'flights_only',
  },
  employer_api: {
    fleet: 'none',
    vessel: 'none',
    department: 'none',
    self: 'none',
    external: 'crew_limited',
  },
};

// Module x Action permission matrix
export const PERMISSION_MATRIX = {
  // Crew Module
  crew: {
    view_roster: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'officer'] as AppRole[],
    view_profile: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'officer', 'crew'] as AppRole[], // crew:self
    edit_profile: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    edit_own_limited: ['crew'] as AppRole[], // phone, emergency contact only
    add_crew: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    delete_crew: ['superadmin', 'dpa'] as AppRole[],
    import_csv: ['superadmin', 'dpa', 'purser'] as AppRole[],
    send_invitation: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    view_certificates: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'officer', 'crew'] as AppRole[], // crew:self
    edit_certificates: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    view_salary: ['superadmin', 'dpa', 'purser', 'crew'] as AppRole[], // crew:self - Restricted
    view_medical: ['superadmin', 'dpa', 'captain', 'crew'] as AppRole[], // crew:self - Restricted
    view_disciplinary: ['superadmin', 'dpa', 'captain'] as AppRole[], // Restricted
  },

  // Incidents Module
  incidents: {
    view_all: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser'] as AppRole[],
    view_vessel: ['hod', 'officer'] as AppRole[],
    view_anonymized: ['crew'] as AppRole[], // For fleet learning
    create: ['superadmin', 'dpa', 'captain', 'purser', 'hod', 'officer', 'crew'] as AppRole[],
    edit_own: ['captain', 'purser', 'hod', 'officer', 'crew'] as AppRole[],
    edit_all: ['superadmin', 'dpa', 'captain'] as AppRole[],
    open_investigation: ['superadmin', 'dpa', 'captain'] as AppRole[],
    close_investigation: ['superadmin', 'dpa'] as AppRole[],
    approve_no_investigation: ['dpa'] as AppRole[], // DPO agreement required
  },

  // Maintenance Module (IDEA overlay)
  maintenance: {
    view_dashboard: ['superadmin', 'dpa', 'fleet_master', 'captain', 'chief_engineer'] as AppRole[],
    view_defects: ['superadmin', 'dpa', 'captain', 'chief_engineer', 'hod'] as AppRole[], // hod:engine
    view_ism_critical: ['superadmin', 'dpa', 'captain', 'chief_engineer'] as AppRole[],
    create_ism_defect: ['superadmin', 'dpa', 'captain', 'chief_engineer'] as AppRole[],
  },

  // Certificates (Vessel)
  vessel_certificates: {
    view: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'auditor_flag', 'auditor_class'] as AppRole[],
    upload: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    approve: ['superadmin', 'dpa'] as AppRole[],
    reject: ['superadmin', 'dpa'] as AppRole[],
  },

  // Flights
  flights: {
    view_all: ['superadmin', 'dpa'] as AppRole[],
    view_vessel: ['captain', 'purser'] as AppRole[],
    view_own: ['crew'] as AppRole[],
    create_request: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    send_to_agent: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    update_booking: ['superadmin', 'dpa', 'travel_agent'] as AppRole[],
    upload_documents: ['superadmin', 'dpa', 'travel_agent'] as AppRole[],
  },

  // Alerts
  alerts: {
    view_fleet: ['superadmin', 'dpa', 'fleet_master'] as AppRole[],
    view_vessel: ['captain', 'purser', 'hod'] as AppRole[],
    acknowledge: ['superadmin', 'dpa', 'captain', 'purser', 'hod'] as AppRole[],
    snooze: ['superadmin', 'dpa', 'captain'] as AppRole[],
    resolve: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    configure_rules: ['superadmin', 'dpa'] as AppRole[],
  },

  // Documents
  documents: {
    view: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'officer', 'crew'] as AppRole[],
    create: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    edit: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    delete: ['superadmin', 'dpa'] as AppRole[],
    approve: ['superadmin', 'dpa'] as AppRole[],
  },

  // Drills
  drills: {
    view: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'officer', 'auditor_flag'] as AppRole[],
    schedule: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    conduct: ['superadmin', 'dpa', 'captain', 'purser', 'hod'] as AppRole[],
    complete: ['superadmin', 'dpa', 'captain'] as AppRole[],
  },

  // Training
  training: {
    view: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'officer', 'crew'] as AppRole[], // crew:self
    create: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    edit: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    complete: ['superadmin', 'dpa', 'captain', 'purser', 'hod'] as AppRole[],
  },

  // Audits
  audits: {
    view: ['superadmin', 'dpa', 'fleet_master', 'captain', 'auditor_flag', 'auditor_class'] as AppRole[],
    schedule: ['superadmin', 'dpa'] as AppRole[],
    conduct: ['superadmin', 'dpa', 'auditor_flag', 'auditor_class'] as AppRole[],
    complete: ['superadmin', 'dpa'] as AppRole[],
    manage_findings: ['superadmin', 'dpa', 'captain'] as AppRole[],
  },

  // Risk Assessments
  risk_assessments: {
    view: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'officer'] as AppRole[],
    create: ['superadmin', 'dpa', 'captain', 'purser', 'hod', 'officer'] as AppRole[],
    approve: ['superadmin', 'dpa', 'captain'] as AppRole[],
  },

  // SMS Forms
  sms_forms: {
    view: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'officer', 'auditor_flag'] as AppRole[],
    create: ['superadmin', 'dpa', 'captain', 'purser', 'hod', 'officer', 'crew'] as AppRole[],
    sign: ['superadmin', 'dpa', 'captain', 'purser', 'hod', 'officer', 'crew'] as AppRole[],
    amend: ['superadmin', 'dpa', 'captain'] as AppRole[],
  },
} as const;

// Helper to check if role has permission
export function roleHasPermission(
  role: AppRole,
  module: keyof typeof PERMISSION_MATRIX,
  action: string
): boolean {
  const modulePerms = PERMISSION_MATRIX[module] as Record<string, AppRole[]>;
  const allowedRoles = modulePerms?.[action];
  if (!allowedRoles) return false;
  return allowedRoles.includes(role);
}

// Get all roles that can perform an action
export function getRolesForAction(
  module: keyof typeof PERMISSION_MATRIX,
  action: string
): AppRole[] {
  const modulePerms = PERMISSION_MATRIX[module] as Record<string, AppRole[]>;
  return modulePerms?.[action] || [];
}
