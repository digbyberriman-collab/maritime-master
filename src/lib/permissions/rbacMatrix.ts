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
  // ============================================================================
  // AUTHENTICATION & USERS (7.1)
  // ============================================================================
  users: {
    list: ['superadmin', 'dpa', 'captain'] as AppRole[],
    view_profile: ['superadmin', 'dpa', 'captain', 'purser', 'hod', 'officer', 'crew'] as AppRole[], // self access
    update_profile: ['superadmin', 'dpa', 'captain'] as AppRole[],
    update_own_limited: ['crew'] as AppRole[], // limited fields only
    send_invitation: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    bulk_invite: ['superadmin', 'dpa'] as AppRole[],
  },

  // ============================================================================
  // VESSELS (7.2)
  // ============================================================================
  vessels: {
    list: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer'] as AppRole[],
    view: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer'] as AppRole[],
    update: ['superadmin', 'dpa', 'captain'] as AppRole[],
    update_company_details: ['superadmin', 'dpa'] as AppRole[],
    update_emergency_details: ['superadmin', 'dpa', 'captain'] as AppRole[],
    view_dashboard: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer'] as AppRole[],
    view_crew_onboard: ['superadmin', 'dpa', 'captain'] as AppRole[],
    override_crew_onboard: ['superadmin', 'dpa'] as AppRole[],
  },

  // ============================================================================
  // FLEET MAP & AIS (7.3)
  // ============================================================================
  fleet_map: {
    view_all: ['superadmin', 'dpa', 'fleet_master'] as AppRole[],
    view_assigned: ['captain', 'purser', 'chief_officer', 'chief_engineer'] as AppRole[],
    view_vessel_detail: ['superadmin', 'dpa', 'captain'] as AppRole[],
    view_ais_history: ['superadmin', 'dpa', 'captain'] as AppRole[],
    refresh_ais: ['superadmin'] as AppRole[], // System only
  },

  // ============================================================================
  // CREW (7.4)
  // ============================================================================
  crew: {
    list: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'officer'] as AppRole[],
    view_profile: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'officer', 'crew'] as AppRole[], // crew:self
    edit_profile: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    edit_own_limited: ['crew'] as AppRole[], // phone, emergency contact only
    add_crew: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    delete_crew: ['superadmin', 'dpa'] as AppRole[],
    import_csv: ['superadmin', 'dpa', 'purser'] as AppRole[],
    confirm_import: ['superadmin', 'dpa', 'purser'] as AppRole[],
    view_assignments: ['superadmin', 'dpa', 'captain'] as AppRole[],
    create_assignment: ['superadmin', 'dpa', 'captain'] as AppRole[],
    view_certificates: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'officer', 'crew'] as AppRole[], // crew:self
    add_certificate: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    edit_certificate: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    delete_certificate: ['superadmin', 'dpa'] as AppRole[],
    view_attachments: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'officer', 'crew'] as AppRole[], // crew:self
    upload_attachment: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    delete_attachment: ['superadmin', 'dpa'] as AppRole[],
    view_audit_log: ['superadmin', 'dpa', 'captain'] as AppRole[],
    send_invitation: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    view_salary: ['superadmin', 'dpa', 'purser', 'crew'] as AppRole[], // crew:self - Restricted
    view_medical: ['superadmin', 'dpa', 'captain', 'crew'] as AppRole[], // crew:self - Restricted
    view_disciplinary: ['superadmin', 'dpa', 'captain'] as AppRole[], // Restricted
  },

  // ============================================================================
  // FLIGHTS (7.5)
  // ============================================================================
  flights: {
    list_all: ['superadmin', 'dpa'] as AppRole[],
    list_vessel: ['captain', 'purser'] as AppRole[],
    list_assigned: ['travel_agent'] as AppRole[],
    view: ['superadmin', 'dpa', 'captain', 'purser', 'travel_agent', 'crew'] as AppRole[], // crew:own only
    create: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    update: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    send_to_agent: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    add_booking: ['superadmin', 'dpa', 'travel_agent'] as AppRole[],
    update_booking: ['superadmin', 'dpa', 'travel_agent'] as AppRole[],
    confirm_booking: ['superadmin', 'dpa', 'travel_agent'] as AppRole[],
    upload_documents: ['superadmin', 'dpa', 'travel_agent'] as AppRole[],
    generate_travel_letter: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
  },

  // ============================================================================
  // ALERTS (7.6)
  // ============================================================================
  alerts: {
    list_fleet: ['superadmin', 'dpa', 'fleet_master'] as AppRole[],
    list_vessel: ['captain', 'purser', 'hod'] as AppRole[],
    view_summary: ['superadmin', 'dpa', 'captain'] as AppRole[],
    acknowledge: ['superadmin', 'dpa', 'captain', 'purser', 'hod'] as AppRole[],
    snooze: ['superadmin', 'dpa', 'captain'] as AppRole[],
    resolve: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    reassign: ['superadmin', 'dpa'] as AppRole[],
    configure_rules: ['superadmin', 'dpa'] as AppRole[],
  },

  // ============================================================================
  // SMS FORMS & CHECKLISTS (7.7)
  // ============================================================================
  templates: {
    list: ['superadmin', 'dpa', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer'] as AppRole[],
    view: ['superadmin', 'dpa', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer'] as AppRole[],
    create: ['superadmin', 'dpa'] as AppRole[],
    update: ['superadmin', 'dpa'] as AppRole[],
    publish: ['superadmin', 'dpa'] as AppRole[],
  },

  submissions: {
    list: ['superadmin', 'dpa', 'captain', 'auditor_flag'] as AppRole[],
    view: ['superadmin', 'dpa', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer', 'auditor_flag'] as AppRole[],
    create: ['superadmin', 'dpa', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer', 'crew'] as AppRole[],
    update_own: ['superadmin', 'dpa', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer', 'crew'] as AppRole[], // if draft
    submit: ['superadmin', 'dpa', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer', 'crew'] as AppRole[],
    sign: ['superadmin', 'dpa', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer', 'crew'] as AppRole[], // required signer
    reject: ['superadmin', 'dpa', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer', 'crew'] as AppRole[], // required signer
    amend: ['superadmin', 'dpa'] as AppRole[],
    add_attachment: ['superadmin', 'dpa', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer', 'crew'] as AppRole[], // creator
  },

  // ============================================================================
  // INCIDENTS & INVESTIGATIONS (7.8)
  // ============================================================================
  incidents: {
    list_all: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser'] as AppRole[],
    list_vessel: ['chief_officer', 'chief_engineer', 'hod', 'officer'] as AppRole[],
    list_anonymized: ['crew'] as AppRole[], // For fleet learning
    view: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer'] as AppRole[],
    create: ['superadmin', 'dpa', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer', 'crew'] as AppRole[],
    update: ['superadmin', 'dpa', 'captain'] as AppRole[],
    edit_own: ['captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer', 'crew'] as AppRole[],
    open_investigation: ['superadmin', 'dpa', 'captain'] as AppRole[],
    approve_no_investigation: ['superadmin', 'dpa'] as AppRole[], // DPO agreement required
    notify_shipping_master: ['superadmin', 'dpa', 'captain'] as AppRole[],
  },

  investigations: {
    view: ['superadmin', 'dpa', 'captain'] as AppRole[],
    update: ['superadmin', 'dpa', 'captain'] as AppRole[], // or investigator
    complete: ['superadmin', 'dpa'] as AppRole[],
  },

  // ============================================================================
  // DRILLS & TRAINING (7.9)
  // ============================================================================
  drills: {
    list_types: ['superadmin', 'dpa', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer'] as AppRole[],
    list_occurrences: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser'] as AppRole[],
    view: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer', 'auditor_flag'] as AppRole[],
    create_occurrence: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[], // or Safety Officer
    update_occurrence: ['superadmin', 'dpa', 'captain'] as AppRole[],
    complete_occurrence: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[], // or Safety Officer
    view_crew_matrix: ['superadmin', 'dpa', 'captain', 'auditor_flag', 'auditor_class'] as AppRole[],
    view_vessel_matrix: ['superadmin', 'dpa', 'captain', 'auditor_flag', 'auditor_class'] as AppRole[],
  },

  training: {
    list: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser'] as AppRole[],
    view: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'officer', 'crew'] as AppRole[], // crew:self
    create: ['superadmin', 'dpa', 'captain', 'purser', 'hod'] as AppRole[],
    update: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
  },

  familiarization: {
    view: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[], // or supervisor
    update: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[], // or supervisor
  },

  // ============================================================================
  // VESSEL CERTIFICATES (7.10)
  // ============================================================================
  vessel_certificates: {
    list: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'auditor_flag', 'auditor_class'] as AppRole[],
    view: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'auditor_flag', 'auditor_class'] as AppRole[],
    upload: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    update: ['superadmin', 'dpa', 'captain'] as AppRole[],
    review: ['superadmin', 'dpa'] as AppRole[],
  },

  // ============================================================================
  // CORRECTIVE ACTIONS (CAPA)
  // ============================================================================
  corrective_actions: {
    list: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser'] as AppRole[],
    view: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod'] as AppRole[],
    create: ['superadmin', 'dpa', 'captain'] as AppRole[],
    update: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    close: ['superadmin', 'dpa', 'captain'] as AppRole[],
    verify: ['superadmin', 'dpa'] as AppRole[],
  },

  // ============================================================================
  // AUDITS
  // ============================================================================
  audits: {
    list: ['superadmin', 'dpa', 'fleet_master', 'captain', 'auditor_flag', 'auditor_class'] as AppRole[],
    view: ['superadmin', 'dpa', 'fleet_master', 'captain', 'auditor_flag', 'auditor_class'] as AppRole[],
    schedule: ['superadmin', 'dpa'] as AppRole[],
    conduct: ['superadmin', 'dpa', 'auditor_flag', 'auditor_class'] as AppRole[],
    complete: ['superadmin', 'dpa'] as AppRole[],
    manage_findings: ['superadmin', 'dpa', 'captain'] as AppRole[],
  },

  // ============================================================================
  // RISK ASSESSMENTS
  // ============================================================================
  risk_assessments: {
    list: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer'] as AppRole[],
    view: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer'] as AppRole[],
    create: ['superadmin', 'dpa', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer'] as AppRole[],
    update: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    approve: ['superadmin', 'dpa', 'captain'] as AppRole[],
  },

  // ============================================================================
  // DOCUMENTS
  // ============================================================================
  documents: {
    list: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer', 'crew'] as AppRole[],
    view: ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer', 'crew'] as AppRole[],
    create: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    update: ['superadmin', 'dpa', 'captain', 'purser'] as AppRole[],
    delete: ['superadmin', 'dpa'] as AppRole[],
    approve: ['superadmin', 'dpa'] as AppRole[],
  },

  // ============================================================================
  // MAINTENANCE
  // ============================================================================
  maintenance: {
    view_dashboard: ['superadmin', 'dpa', 'fleet_master', 'captain', 'chief_engineer'] as AppRole[],
    view_defects: ['superadmin', 'dpa', 'captain', 'chief_engineer', 'hod'] as AppRole[], // hod:engine
    view_ism_critical: ['superadmin', 'dpa', 'captain', 'chief_engineer'] as AppRole[],
    create_ism_defect: ['superadmin', 'dpa', 'captain', 'chief_engineer'] as AppRole[],
  },

  // ============================================================================
  // EXTERNAL APIs (7.11)
  // ============================================================================
  external: {
    employer_crew: ['employer_api'] as AppRole[],
    auditor_vessel: ['auditor_flag', 'auditor_class'] as AppRole[],
    agent_requests: ['travel_agent'] as AppRole[],
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

// Check if role has any permission in a module
export function roleHasModuleAccess(
  role: AppRole,
  module: keyof typeof PERMISSION_MATRIX
): boolean {
  const modulePerms = PERMISSION_MATRIX[module] as Record<string, AppRole[]>;
  if (!modulePerms) return false;
  
  return Object.values(modulePerms).some((roles) => roles.includes(role));
}

// Get all permissions for a role
export function getPermissionsForRole(role: AppRole): Record<string, string[]> {
  const permissions: Record<string, string[]> = {};
  
  for (const [module, actions] of Object.entries(PERMISSION_MATRIX)) {
    const moduleActions: string[] = [];
    for (const [action, roles] of Object.entries(actions as Record<string, AppRole[]>)) {
      if (roles.includes(role)) {
        moduleActions.push(action);
      }
    }
    if (moduleActions.length > 0) {
      permissions[module] = moduleActions;
    }
  }
  
  return permissions;
}
