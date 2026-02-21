import { describe, it, expect } from 'vitest';
import {
  SCOPE_MATRIX,
  PERMISSION_MATRIX,
  roleHasPermission,
  getRolesForAction,
  roleHasModuleAccess,
  getPermissionsForRole,
} from '@/modules/auth/lib/rbacMatrix';
import type { AppRole } from '@/modules/auth/lib/types';

describe('rbacMatrix', () => {
  describe('SCOPE_MATRIX', () => {
    it('should give superadmin full access to all scopes', () => {
      const scope = SCOPE_MATRIX['superadmin'];
      expect(scope.fleet).toBe('full');
      expect(scope.vessel).toBe('full');
      expect(scope.department).toBe('full');
      expect(scope.self).toBe('full');
      expect(scope.external).toBe('configure');
    });

    it('should give crew minimal vessel access and self access only', () => {
      const scope = SCOPE_MATRIX['crew'];
      expect(scope.fleet).toBe('none');
      expect(scope.vessel).toBe('minimal');
      expect(scope.department).toBe('none');
      expect(scope.self).toBe('full');
      expect(scope.external).toBe('none');
    });

    it('should give auditor_flag audit_view vessel access', () => {
      expect(SCOPE_MATRIX['auditor_flag'].vessel).toBe('audit_view');
    });

    it('should give travel_agent flights_only external access', () => {
      expect(SCOPE_MATRIX['travel_agent'].external).toBe('flights_only');
    });

    it('should give employer_api crew_limited external access', () => {
      expect(SCOPE_MATRIX['employer_api'].external).toBe('crew_limited');
    });

    it('should give captain full vessel access but no fleet access', () => {
      expect(SCOPE_MATRIX['captain'].fleet).toBe('none');
      expect(SCOPE_MATRIX['captain'].vessel).toBe('full');
    });

    it('should define scopes for all 14 roles', () => {
      const roles: AppRole[] = [
        'superadmin', 'dpa', 'fleet_master', 'captain', 'purser',
        'chief_officer', 'chief_engineer', 'hod', 'officer', 'crew',
        'auditor_flag', 'auditor_class', 'travel_agent', 'employer_api',
      ];
      roles.forEach(role => {
        expect(SCOPE_MATRIX).toHaveProperty(role);
      });
    });
  });

  describe('PERMISSION_MATRIX', () => {
    it('should define permissions for all major modules', () => {
      expect(PERMISSION_MATRIX).toHaveProperty('users');
      expect(PERMISSION_MATRIX).toHaveProperty('vessels');
      expect(PERMISSION_MATRIX).toHaveProperty('crew');
      expect(PERMISSION_MATRIX).toHaveProperty('incidents');
      expect(PERMISSION_MATRIX).toHaveProperty('drills');
      expect(PERMISSION_MATRIX).toHaveProperty('documents');
      expect(PERMISSION_MATRIX).toHaveProperty('maintenance');
      expect(PERMISSION_MATRIX).toHaveProperty('audits');
      expect(PERMISSION_MATRIX).toHaveProperty('flights');
      expect(PERMISSION_MATRIX).toHaveProperty('alerts');
      expect(PERMISSION_MATRIX).toHaveProperty('risk_assessments');
      expect(PERMISSION_MATRIX).toHaveProperty('corrective_actions');
    });

    it('should restrict crew deletion to superadmin and dpa', () => {
      expect(PERMISSION_MATRIX.crew.delete_crew).toEqual(['superadmin', 'dpa']);
    });

    it('should allow all roles to create incidents (except auditors/externals)', () => {
      const createRoles = PERMISSION_MATRIX.incidents.create;
      expect(createRoles).toContain('crew');
      expect(createRoles).toContain('captain');
      expect(createRoles).toContain('officer');
      expect(createRoles).not.toContain('auditor_flag');
      expect(createRoles).not.toContain('travel_agent');
    });

    it('should restrict document deletion to superadmin and dpa', () => {
      expect(PERMISSION_MATRIX.documents.delete).toEqual(['superadmin', 'dpa']);
    });

    it('should allow crew to view documents', () => {
      expect(PERMISSION_MATRIX.documents.list).toContain('crew');
    });
  });

  describe('roleHasPermission', () => {
    it('should return true when role has the permission', () => {
      expect(roleHasPermission('superadmin', 'crew', 'delete_crew')).toBe(true);
      expect(roleHasPermission('dpa', 'crew', 'list')).toBe(true);
    });

    it('should return false when role lacks the permission', () => {
      expect(roleHasPermission('crew', 'crew', 'delete_crew')).toBe(false);
      expect(roleHasPermission('travel_agent', 'incidents', 'create')).toBe(false);
    });

    it('should return false for non-existent action', () => {
      expect(roleHasPermission('superadmin', 'crew', 'nonexistent_action')).toBe(false);
    });

    it('should return false for non-existent module', () => {
      expect(roleHasPermission('superadmin', 'nonexistent_module' as any, 'list')).toBe(false);
    });
  });

  describe('getRolesForAction', () => {
    it('should return correct roles for crew.delete_crew', () => {
      const roles = getRolesForAction('crew', 'delete_crew');
      expect(roles).toEqual(['superadmin', 'dpa']);
    });

    it('should return multiple roles for crew.list', () => {
      const roles = getRolesForAction('crew', 'list');
      expect(roles).toContain('superadmin');
      expect(roles).toContain('dpa');
      expect(roles).toContain('captain');
    });

    it('should return empty array for non-existent action', () => {
      expect(getRolesForAction('crew', 'nonexistent')).toEqual([]);
    });
  });

  describe('roleHasModuleAccess', () => {
    it('should return true for superadmin accessing any module', () => {
      expect(roleHasModuleAccess('superadmin', 'crew')).toBe(true);
      expect(roleHasModuleAccess('superadmin', 'incidents')).toBe(true);
      expect(roleHasModuleAccess('superadmin', 'documents')).toBe(true);
    });

    it('should return true for crew accessing crew module', () => {
      expect(roleHasModuleAccess('crew', 'crew')).toBe(true);
    });

    it('should return false for travel_agent accessing crew module', () => {
      expect(roleHasModuleAccess('travel_agent', 'crew')).toBe(false);
    });

    it('should return true for travel_agent accessing flights module', () => {
      expect(roleHasModuleAccess('travel_agent', 'flights')).toBe(true);
    });

    it('should return false for non-existent module', () => {
      expect(roleHasModuleAccess('superadmin', 'nonexistent' as any)).toBe(false);
    });
  });

  describe('getPermissionsForRole', () => {
    it('should return non-empty permissions for superadmin', () => {
      const perms = getPermissionsForRole('superadmin');
      expect(Object.keys(perms).length).toBeGreaterThan(0);
      expect(perms).toHaveProperty('crew');
      expect(perms).toHaveProperty('incidents');
    });

    it('should include all crew actions for superadmin', () => {
      const perms = getPermissionsForRole('superadmin');
      expect(perms['crew']).toContain('delete_crew');
      expect(perms['crew']).toContain('list');
    });

    it('should return limited permissions for travel_agent', () => {
      const perms = getPermissionsForRole('travel_agent');
      expect(perms).toHaveProperty('flights');
      expect(perms).not.toHaveProperty('crew');
      expect(perms).not.toHaveProperty('incidents');
    });

    it('should return limited permissions for crew', () => {
      const perms = getPermissionsForRole('crew');
      expect(perms['crew']).toContain('view_profile');
      expect(perms['crew']).not.toContain('delete_crew');
    });
  });
});
