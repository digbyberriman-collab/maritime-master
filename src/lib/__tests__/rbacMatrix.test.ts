import { describe, it, expect } from 'vitest';
import {
  SCOPE_MATRIX,
  PERMISSION_MATRIX,
  roleHasPermission,
  getRolesForAction,
  roleHasModuleAccess,
  getPermissionsForRole,
} from '../permissions/rbacMatrix';
import type { AppRole } from '../permissions/types';

const ALL_ROLES = Object.keys(SCOPE_MATRIX) as AppRole[];

describe('roleHasPermission', () => {
  it('grants an action listed for the role', () => {
    expect(roleHasPermission('dpa', 'crew', 'delete_crew')).toBe(true);
    expect(roleHasPermission('purser', 'crew', 'import_csv')).toBe(true);
  });

  it('refuses an action not listed for the role', () => {
    expect(roleHasPermission('crew', 'crew', 'delete_crew')).toBe(false);
    expect(roleHasPermission('captain', 'crew', 'delete_crew')).toBe(false);
  });

  it('refuses an action that does not exist in the module', () => {
    expect(roleHasPermission('superadmin', 'crew', 'launch_missiles')).toBe(false);
  });

  it('refuses a module that does not exist', () => {
    expect(
      roleHasPermission('superadmin', 'nonexistent' as keyof typeof PERMISSION_MATRIX, 'list')
    ).toBe(false);
  });
});

describe('getRolesForAction', () => {
  it('returns the declared role list', () => {
    expect(getRolesForAction('crew', 'delete_crew')).toEqual(['superadmin', 'dpa']);
  });

  it('returns an empty list for an unknown action', () => {
    expect(getRolesForAction('crew', 'not_an_action')).toEqual([]);
  });
});

describe('roleHasModuleAccess', () => {
  it('is true when the role appears anywhere in the module', () => {
    expect(roleHasModuleAccess('crew', 'crew')).toBe(true);
    expect(roleHasModuleAccess('travel_agent', 'flights')).toBe(true);
  });

  it('is false when the role appears nowhere in the module', () => {
    expect(roleHasModuleAccess('travel_agent', 'maintenance')).toBe(false);
    expect(roleHasModuleAccess('crew', 'audits')).toBe(false);
  });

  it('is false for an unknown module', () => {
    expect(
      roleHasModuleAccess('superadmin', 'nonexistent' as keyof typeof PERMISSION_MATRIX)
    ).toBe(false);
  });
});

describe('getPermissionsForRole', () => {
  it('collects every granted action, grouped by module', () => {
    const perms = getPermissionsForRole('travel_agent');

    expect(perms.flights).toContain('add_booking');
    expect(perms.flights).toContain('confirm_booking');
    expect(perms.external).toContain('agent_requests');
  });

  it('omits modules where the role has no access at all', () => {
    const perms = getPermissionsForRole('travel_agent');

    expect(perms.maintenance).toBeUndefined();
    expect(perms.audits).toBeUndefined();
    expect(perms.incidents).toBeUndefined();
  });

  it('agrees with roleHasPermission for every module and action', () => {
    for (const role of ALL_ROLES) {
      const perms = getPermissionsForRole(role);

      for (const [module, actions] of Object.entries(PERMISSION_MATRIX)) {
        for (const action of Object.keys(actions)) {
          const viaMatrix = roleHasPermission(
            role,
            module as keyof typeof PERMISSION_MATRIX,
            action
          );
          const viaSummary = perms[module]?.includes(action) ?? false;
          expect(viaSummary, `${role} / ${module}.${action} disagrees`).toBe(viaMatrix);
        }
      }
    }
  });
});

describe('matrix integrity', () => {
  it('references only roles that exist in the scope matrix', () => {
    for (const [module, actions] of Object.entries(PERMISSION_MATRIX)) {
      for (const [action, roles] of Object.entries(actions as Record<string, AppRole[]>)) {
        for (const role of roles) {
          expect(ALL_ROLES, `${module}.${action} names unknown role "${role}"`).toContain(role);
        }
      }
    }
  });

  it('lists no duplicate roles on a single action', () => {
    for (const [module, actions] of Object.entries(PERMISSION_MATRIX)) {
      for (const [action, roles] of Object.entries(actions as Record<string, AppRole[]>)) {
        expect(new Set(roles).size, `${module}.${action} repeats a role`).toBe(roles.length);
      }
    }
  });

  it('gives superadmin or dpa authority over every module', () => {
    // Every module needs at least one administrator who can reach it, or it
    // becomes unadministrable. External API modules are the deliberate exception.
    for (const module of Object.keys(PERMISSION_MATRIX)) {
      if (module === 'external') continue;
      const reachable =
        roleHasModuleAccess('superadmin', module as keyof typeof PERMISSION_MATRIX) ||
        roleHasModuleAccess('dpa', module as keyof typeof PERMISSION_MATRIX);
      expect(reachable, `${module} has no administrator`).toBe(true);
    }
  });

  it('keeps read-only auditors out of every mutating action', () => {
    const MUTATING = /^(create|update|delete|add|edit|remove|approve|close|verify|publish|submit|sign|reject|amend|confirm|override|schedule|complete|refresh|snooze|resolve|reassign|configure|import|upload|send|notify|open|start|generate)/;

    for (const auditor of ['auditor_flag', 'auditor_class'] as AppRole[]) {
      for (const [module, actions] of Object.entries(PERMISSION_MATRIX)) {
        for (const [action, roles] of Object.entries(actions as Record<string, AppRole[]>)) {
          if (!MUTATING.test(action)) continue;
          // `conduct` is the auditor's own read-and-record workflow.
          if (module === 'audits') continue;
          expect(
            roles.includes(auditor),
            `${auditor} can perform mutating action ${module}.${action}`
          ).toBe(false);
        }
      }
    }
  });

  it('keeps the destructive deletes limited to administrators', () => {
    const DELETE_ACTIONS: Array<[keyof typeof PERMISSION_MATRIX, string]> = [
      ['crew', 'delete_crew'],
      ['crew', 'delete_certificate'],
      ['crew', 'delete_attachment'],
      ['documents', 'delete'],
    ];

    for (const [module, action] of DELETE_ACTIONS) {
      const roles = getRolesForAction(module, action);
      expect(roles.sort(), `${module}.${action} is too widely granted`).toEqual([
        'dpa',
        'superadmin',
      ]);
    }
  });

  it('gives every role a self scope unless it is an external or audit identity', () => {
    const NO_SELF: AppRole[] = [
      'auditor_flag',
      'auditor_class',
      'travel_agent',
      'employer_api',
    ];

    for (const role of ALL_ROLES) {
      const expected = NO_SELF.includes(role) ? 'none' : 'full';
      expect(SCOPE_MATRIX[role].self, `${role} self scope`).toBe(expected);
    }
  });

  it('denies fleet-wide reach to vessel-level and external roles', () => {
    const NO_FLEET: AppRole[] = [
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

    for (const role of NO_FLEET) {
      expect(SCOPE_MATRIX[role].fleet, `${role} should not reach the fleet`).toBe('none');
    }
  });

  it('confines external identities to the external scope only', () => {
    for (const role of ['travel_agent', 'employer_api'] as AppRole[]) {
      const scope = SCOPE_MATRIX[role];
      expect(scope.fleet).toBe('none');
      expect(scope.vessel).toBe('none');
      expect(scope.department).toBe('none');
      expect(scope.self).toBe('none');
      expect(scope.external).not.toBe('none');
    }
  });
});
