// Permissions module - re-export all permission utilities
export * from './types';
export * from './rbacMatrix';
export * from './auditModeRules';

import { AppRole, PermissionContext, Module } from './types';
import { PERMISSION_MATRIX, SCOPE_MATRIX, roleHasPermission } from './rbacMatrix';
import { AUDIT_MODE_RULES, isModuleAllowed, isActionAllowed, isFieldRedacted } from './auditModeRules';

// Main permission check function
export function hasPermission(
  roles: AppRole[],
  module: keyof typeof PERMISSION_MATRIX,
  action: string,
  context?: PermissionContext
): boolean {
  // Check if any of the user's roles has the permission
  for (const role of roles) {
    // Check audit mode restrictions first
    if (AUDIT_MODE_RULES[role]) {
      if (!isModuleAllowed(role, module)) continue;
      if (!isActionAllowed(role, action)) continue;
    }

    // Check the permission matrix
    if (roleHasPermission(role, module, action)) {
      // Apply context-based restrictions
      if (context) {
        if (!checkContextRestrictions(role, module, action, context)) {
          continue;
        }
      }
      return true;
    }
  }

  return false;
}

// Context-based restrictions
function checkContextRestrictions(
  role: AppRole,
  module: keyof typeof PERMISSION_MATRIX,
  action: string,
  context: PermissionContext
): boolean {
  const scope = SCOPE_MATRIX[role];

  // Crew self-only actions
  if (module === 'crew') {
    // Actions that require self
    const selfOnlyActions = ['edit_own_limited', 'view_salary', 'view_medical'];
    if (selfOnlyActions.includes(action) && role === 'crew') {
      if (!context.isSelf && context.targetUserId !== context.userId) {
        return false;
      }
    }
  }

  // Vessel scope restrictions
  if (scope.vessel !== 'full' && scope.fleet !== 'full') {
    // Captain, Purser, HODs are vessel-scoped
    if (['captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer'].includes(role)) {
      if (context.targetVesselId && context.vesselId !== context.targetVesselId) {
        return false;
      }
    }
  }

  // Department scope restrictions
  if (scope.department === 'full' && scope.vessel !== 'full') {
    // HODs can only access their department
    if (['chief_officer', 'chief_engineer', 'hod'].includes(role)) {
      // Chief Officer -> Deck, Chief Engineer -> Engine
      if (role === 'chief_officer' && context.targetDepartment && context.targetDepartment !== 'Deck') {
        return false;
      }
      if (role === 'chief_engineer' && context.targetDepartment && context.targetDepartment !== 'Engine') {
        return false;
      }
      if (role === 'hod' && context.targetDepartment && context.department !== context.targetDepartment) {
        return false;
      }
    }
  }

  return true;
}

// Get effective permissions for a user
export function getEffectivePermissions(
  roles: AppRole[]
): Record<string, string[]> {
  const permissions: Record<string, string[]> = {};

  for (const [module, actions] of Object.entries(PERMISSION_MATRIX)) {
    const allowedActions: string[] = [];

    for (const [action, allowedRoles] of Object.entries(actions)) {
      for (const role of roles) {
        if (allowedRoles.includes(role)) {
          // Check audit mode restrictions
          if (AUDIT_MODE_RULES[role]) {
            if (!isModuleAllowed(role, module) || !isActionAllowed(role, action)) {
              continue;
            }
          }
          if (!allowedActions.includes(action)) {
            allowedActions.push(action);
          }
        }
      }
    }

    if (allowedActions.length > 0) {
      permissions[module] = allowedActions;
    }
  }

  return permissions;
}

// Check if user has fleet-level access
export function hasFleetAccess(roles: AppRole[]): boolean {
  const fleetRoles: AppRole[] = ['superadmin', 'dpa', 'fleet_master'];
  return roles.some((role) => fleetRoles.includes(role));
}

// Check if user is an auditor
export function isAuditor(roles: AppRole[]): boolean {
  const auditorRoles: AppRole[] = ['auditor_flag', 'auditor_class'];
  return roles.some((role) => auditorRoles.includes(role));
}

// Check if user is external
export function isExternalUser(roles: AppRole[]): boolean {
  const externalRoles: AppRole[] = ['auditor_flag', 'auditor_class', 'travel_agent', 'employer_api'];
  return roles.some((role) => externalRoles.includes(role));
}

// Get highest privilege role
export function getHighestRole(roles: AppRole[]): AppRole | null {
  const roleOrder: AppRole[] = [
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

  for (const role of roleOrder) {
    if (roles.includes(role)) {
      return role;
    }
  }

  return null;
}

// Legacy compatibility - map old roles to new roles
export function mapLegacyRole(legacyRole: string): AppRole {
  const mapping: Record<string, AppRole> = {
    master: 'captain',
    shore_management: 'dpa',
    chief_engineer: 'chief_engineer',
    chief_officer: 'chief_officer',
    crew: 'crew',
    dpa: 'dpa',
  };

  return mapping[legacyRole.toLowerCase()] || 'crew';
}
