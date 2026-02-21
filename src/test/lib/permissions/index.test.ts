import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  getEffectivePermissions,
  hasFleetAccess,
  isAuditor,
  isExternalUser,
  getHighestRole,
  mapLegacyRole,
} from '@/modules/auth/lib/permissionsIndex';
import type { AppRole } from '@/modules/auth/lib/types';

describe('permissions/index', () => {
  describe('hasPermission', () => {
    it('should return true when any role has permission', () => {
      expect(hasPermission(['crew', 'captain'], 'crew', 'delete_crew')).toBe(false);
      expect(hasPermission(['dpa'], 'crew', 'delete_crew')).toBe(true);
    });

    it('should return false when no roles have permission', () => {
      expect(hasPermission(['crew'], 'crew', 'delete_crew')).toBe(false);
    });

    it('should return false for empty roles array', () => {
      expect(hasPermission([], 'crew', 'list')).toBe(false);
    });

    it('should check multiple roles (union of permissions)', () => {
      // crew alone cannot list_all incidents, but captain can
      expect(hasPermission(['crew', 'captain'], 'incidents', 'list_all')).toBe(true);
    });

    it('should apply audit mode restrictions', () => {
      // auditor_flag should not be able to access flights module
      expect(hasPermission(['auditor_flag'], 'flights', 'view')).toBe(false);
    });

    describe('context-based restrictions', () => {
      it('should restrict crew self-only actions to own data', () => {
        expect(hasPermission(['crew'], 'crew', 'edit_own_limited', {
          userId: 'user-1',
          targetUserId: 'user-2',
          isSelf: false,
        })).toBe(false);

        expect(hasPermission(['crew'], 'crew', 'edit_own_limited', {
          userId: 'user-1',
          targetUserId: 'user-1',
          isSelf: true,
        })).toBe(true);
      });

      it('should restrict vessel-scoped roles to their vessel', () => {
        // Purser has scope.vessel='admin' (not 'full'), so vessel restriction applies
        expect(hasPermission(['purser'], 'crew', 'edit_profile', {
          vesselId: 'vessel-1',
          targetVesselId: 'vessel-2',
        })).toBe(false);

        expect(hasPermission(['purser'], 'crew', 'edit_profile', {
          vesselId: 'vessel-1',
          targetVesselId: 'vessel-1',
        })).toBe(true);
      });

      it('should not restrict captain (full vessel scope) by vessel', () => {
        // Captain has scope.vessel='full', so vessel restriction does NOT apply
        expect(hasPermission(['captain'], 'crew', 'edit_profile', {
          vesselId: 'vessel-1',
          targetVesselId: 'vessel-2',
        })).toBe(true);
      });

      it('should restrict chief_officer to Deck department', () => {
        // chief_officer has incidents.list_vessel permission
        expect(hasPermission(['chief_officer'], 'incidents', 'list_vessel', {
          targetDepartment: 'Engine',
        })).toBe(false);

        expect(hasPermission(['chief_officer'], 'incidents', 'list_vessel', {
          targetDepartment: 'Deck',
        })).toBe(true);
      });

      it('should restrict chief_engineer to Engine department', () => {
        // chief_engineer has incidents.list_vessel permission
        expect(hasPermission(['chief_engineer'], 'incidents', 'list_vessel', {
          targetDepartment: 'Deck',
        })).toBe(false);

        expect(hasPermission(['chief_engineer'], 'incidents', 'list_vessel', {
          targetDepartment: 'Engine',
        })).toBe(true);
      });

      it('should not restrict fleet-level roles by vessel', () => {
        expect(hasPermission(['dpa'], 'crew', 'edit_profile', {
          vesselId: 'vessel-1',
          targetVesselId: 'vessel-2',
        })).toBe(true);
      });
    });
  });

  describe('getEffectivePermissions', () => {
    it('should return all permissions for superadmin', () => {
      const perms = getEffectivePermissions(['superadmin']);
      expect(Object.keys(perms).length).toBeGreaterThan(5);
      expect(perms['crew']).toContain('delete_crew');
    });

    it('should merge permissions from multiple roles', () => {
      const crewOnlyPerms = getEffectivePermissions(['crew']);
      const mergedPerms = getEffectivePermissions(['crew', 'captain']);

      // Merged should have more permissions
      const crewActions = crewOnlyPerms['crew']?.length || 0;
      const mergedActions = mergedPerms['crew']?.length || 0;
      expect(mergedActions).toBeGreaterThanOrEqual(crewActions);
    });

    it('should filter out audit-restricted permissions for auditors', () => {
      const perms = getEffectivePermissions(['auditor_flag']);
      // auditor_flag should not have flights permissions
      expect(perms).not.toHaveProperty('flights');
    });

    it('should return empty for empty roles', () => {
      const perms = getEffectivePermissions([]);
      expect(Object.keys(perms)).toHaveLength(0);
    });
  });

  describe('hasFleetAccess', () => {
    it('should return true for superadmin', () => {
      expect(hasFleetAccess(['superadmin'])).toBe(true);
    });

    it('should return true for dpa', () => {
      expect(hasFleetAccess(['dpa'])).toBe(true);
    });

    it('should return true for fleet_master', () => {
      expect(hasFleetAccess(['fleet_master'])).toBe(true);
    });

    it('should return false for captain', () => {
      expect(hasFleetAccess(['captain'])).toBe(false);
    });

    it('should return false for crew', () => {
      expect(hasFleetAccess(['crew'])).toBe(false);
    });

    it('should return true if any role has fleet access', () => {
      expect(hasFleetAccess(['crew', 'dpa'])).toBe(true);
    });
  });

  describe('isAuditor', () => {
    it('should return true for auditor_flag', () => {
      expect(isAuditor(['auditor_flag'])).toBe(true);
    });

    it('should return true for auditor_class', () => {
      expect(isAuditor(['auditor_class'])).toBe(true);
    });

    it('should return false for captain', () => {
      expect(isAuditor(['captain'])).toBe(false);
    });

    it('should return false for empty array', () => {
      expect(isAuditor([])).toBe(false);
    });
  });

  describe('isExternalUser', () => {
    it('should return true for auditor_flag', () => {
      expect(isExternalUser(['auditor_flag'])).toBe(true);
    });

    it('should return true for travel_agent', () => {
      expect(isExternalUser(['travel_agent'])).toBe(true);
    });

    it('should return true for employer_api', () => {
      expect(isExternalUser(['employer_api'])).toBe(true);
    });

    it('should return false for internal roles', () => {
      expect(isExternalUser(['captain'])).toBe(false);
      expect(isExternalUser(['crew'])).toBe(false);
      expect(isExternalUser(['dpa'])).toBe(false);
    });
  });

  describe('getHighestRole', () => {
    it('should return superadmin when present', () => {
      expect(getHighestRole(['crew', 'superadmin', 'captain'])).toBe('superadmin');
    });

    it('should return dpa over captain', () => {
      expect(getHighestRole(['captain', 'dpa'])).toBe('dpa');
    });

    it('should return captain over crew', () => {
      expect(getHighestRole(['crew', 'captain'])).toBe('captain');
    });

    it('should return null for empty array', () => {
      expect(getHighestRole([])).toBeNull();
    });

    it('should return the only role present', () => {
      expect(getHighestRole(['officer'])).toBe('officer');
    });
  });

  describe('mapLegacyRole', () => {
    it('should map master to captain', () => {
      expect(mapLegacyRole('master')).toBe('captain');
    });

    it('should map shore_management to dpa', () => {
      expect(mapLegacyRole('shore_management')).toBe('dpa');
    });

    it('should preserve chief_engineer', () => {
      expect(mapLegacyRole('chief_engineer')).toBe('chief_engineer');
    });

    it('should preserve dpa', () => {
      expect(mapLegacyRole('dpa')).toBe('dpa');
    });

    it('should default unknown roles to crew', () => {
      expect(mapLegacyRole('unknown_role')).toBe('crew');
    });

    it('should be case-insensitive', () => {
      expect(mapLegacyRole('MASTER')).toBe('captain');
      expect(mapLegacyRole('DPA')).toBe('dpa');
    });
  });
});
