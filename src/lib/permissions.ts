// Crew permission management for RBAC

export enum Permission {
  VIEW_CREW = 'view_crew',
  EDIT_OWN_PROFILE = 'edit_own_profile',
  EDIT_CREW_BASIC = 'edit_crew_basic',
  EDIT_CREW_FULL = 'edit_crew_full',
  EDIT_CREW_CERTIFICATES = 'edit_crew_certificates',
  EDIT_CREW_ATTACHMENTS = 'edit_crew_attachments',
  DELETE_CREW = 'delete_crew',
  VIEW_AUDIT_LOG = 'view_audit_log',
  TRANSFER_CREW = 'transfer_crew',
  SIGN_OFF_CREW = 'sign_off_crew',
}

export interface RolePermissions {
  [key: string]: Permission[];
}

export const ROLE_PERMISSIONS: RolePermissions = {
  dpa: [
    Permission.VIEW_CREW,
    Permission.EDIT_CREW_FULL,
    Permission.EDIT_CREW_CERTIFICATES,
    Permission.EDIT_CREW_ATTACHMENTS,
    Permission.DELETE_CREW,
    Permission.VIEW_AUDIT_LOG,
    Permission.TRANSFER_CREW,
    Permission.SIGN_OFF_CREW,
  ],
  shore_management: [
    Permission.VIEW_CREW,
    Permission.EDIT_CREW_FULL,
    Permission.EDIT_CREW_CERTIFICATES,
    Permission.EDIT_CREW_ATTACHMENTS,
    Permission.VIEW_AUDIT_LOG,
    Permission.TRANSFER_CREW,
    Permission.SIGN_OFF_CREW,
  ],
  master: [
    Permission.VIEW_CREW,
    Permission.EDIT_CREW_FULL,
    Permission.EDIT_CREW_CERTIFICATES,
    Permission.EDIT_CREW_ATTACHMENTS,
    Permission.VIEW_AUDIT_LOG,
    Permission.TRANSFER_CREW,
    Permission.SIGN_OFF_CREW,
  ],
  chief_engineer: [
    Permission.VIEW_CREW,
    Permission.EDIT_CREW_BASIC,
    Permission.VIEW_AUDIT_LOG,
  ],
  chief_officer: [
    Permission.VIEW_CREW,
    Permission.EDIT_CREW_BASIC,
    Permission.VIEW_AUDIT_LOG,
  ],
  crew: [
    Permission.VIEW_CREW,
    Permission.EDIT_OWN_PROFILE,
  ],
};

export interface PermissionContext {
  targetUserId?: string;
  currentUserId?: string;
  targetVesselId?: string;
  userVesselIds?: string[];
  targetDepartment?: string;
  userDepartment?: string;
}

export const hasPermission = (
  userRole: string | null,
  permission: Permission,
  context?: PermissionContext
): boolean => {
  if (!userRole) return false;
  
  const roleKey = userRole.toLowerCase();
  const rolePermissions = ROLE_PERMISSIONS[roleKey] || [];

  // Check if role has base permission
  if (!rolePermissions.includes(permission)) {
    return false;
  }

  // Additional context-based checks
  if (context) {
    // Crew can only edit their own profile
    if (roleKey === 'crew' && permission === Permission.EDIT_OWN_PROFILE) {
      return context.targetUserId === context.currentUserId;
    }

    // Master can only edit crew on their vessel
    if (roleKey === 'master' && permission === Permission.EDIT_CREW_FULL) {
      if (context.targetVesselId && context.userVesselIds) {
        return context.userVesselIds.includes(context.targetVesselId);
      }
    }

    // HODs can only edit crew in their department
    if (
      (roleKey === 'chief_engineer' || roleKey === 'chief_officer') &&
      permission === Permission.EDIT_CREW_BASIC
    ) {
      return context.targetDepartment === context.userDepartment;
    }
  }

  return true;
};

// All editable profile fields
const ALL_FIELDS = [
  'first_name',
  'last_name',
  'preferred_name',
  'email',
  'phone',
  'nationality',
  'date_of_birth',
  'gender',
  'emergency_contact_name',
  'emergency_contact_phone',
  'rank',
  'department',
  'contract_start_date',
  'contract_end_date',
  'rotation',
  'cabin',
  'status',
  'notes',
  'medical_expiry',
  'passport_number',
  'passport_expiry',
  'visa_status',
  // Assignment fields
  'join_date',
  'position',
  'vessel_id',
] as const;

// Basic fields for HODs
const BASIC_FIELDS = [
  'phone',
  'emergency_contact_name',
  'emergency_contact_phone',
  'cabin',
  'notes',
] as const;

// Fields crew can edit on their own profile
const OWN_PROFILE_FIELDS = [
  'preferred_name',
  'phone',
  'emergency_contact_name',
  'emergency_contact_phone',
] as const;

export type EditableField = typeof ALL_FIELDS[number];

export const getEditableFields = (
  userRole: string | null,
  isOwnProfile: boolean
): EditableField[] => {
  if (!userRole) return [];
  
  const roleKey = userRole.toLowerCase();

  if (roleKey === 'dpa' || roleKey === 'shore_management') {
    return [...ALL_FIELDS];
  }

  if (roleKey === 'master') {
    return [...ALL_FIELDS];
  }

  if (roleKey === 'chief_engineer' || roleKey === 'chief_officer') {
    return [...BASIC_FIELDS];
  }

  if (roleKey === 'crew' && isOwnProfile) {
    return [...OWN_PROFILE_FIELDS];
  }

  return [];
};

export const canEditField = (
  userRole: string | null,
  fieldName: string,
  isOwnProfile: boolean
): boolean => {
  const editableFields = getEditableFields(userRole, isOwnProfile);
  return editableFields.includes(fieldName as EditableField);
};

// Department constants
export const DEPARTMENTS = [
  'Deck',
  'Engine',
  'Interior',
  'Galley',
] as const;

export type Department = typeof DEPARTMENTS[number];

// Gender options
export const GENDERS = [
  'Male',
  'Female',
  'Other',
  'Prefer not to say',
] as const;

export type Gender = typeof GENDERS[number];

// Status options
export const CREW_STATUSES = [
  'Active',
  'On Leave',
  'Inactive',
  'Pending',
  'Invited',
] as const;

export type CrewStatus = typeof CREW_STATUSES[number];
