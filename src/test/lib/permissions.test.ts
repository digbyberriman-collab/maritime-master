import { describe, it, expect } from 'vitest';
import {
  Permission,
  ROLE_PERMISSIONS,
  hasPermission,
  getEditableFields,
  canEditField,
  DEPARTMENTS,
  GENDERS,
  CREW_STATUSES,
} from '@/lib/permissions';

describe('permissions', () => {
  describe('ROLE_PERMISSIONS', () => {
    it('should define permissions for all expected roles', () => {
      expect(ROLE_PERMISSIONS).toHaveProperty('dpa');
      expect(ROLE_PERMISSIONS).toHaveProperty('shore_management');
      expect(ROLE_PERMISSIONS).toHaveProperty('master');
      expect(ROLE_PERMISSIONS).toHaveProperty('chief_engineer');
      expect(ROLE_PERMISSIONS).toHaveProperty('chief_officer');
      expect(ROLE_PERMISSIONS).toHaveProperty('crew');
    });

    it('should give DPA all permissions', () => {
      const dpaPerms = ROLE_PERMISSIONS['dpa'];
      expect(dpaPerms).toContain(Permission.VIEW_CREW);
      expect(dpaPerms).toContain(Permission.EDIT_CREW_FULL);
      expect(dpaPerms).toContain(Permission.DELETE_CREW);
      expect(dpaPerms).toContain(Permission.VIEW_AUDIT_LOG);
      expect(dpaPerms).toContain(Permission.TRANSFER_CREW);
      expect(dpaPerms).toContain(Permission.SIGN_OFF_CREW);
    });

    it('should give crew only VIEW_CREW and EDIT_OWN_PROFILE', () => {
      const crewPerms = ROLE_PERMISSIONS['crew'];
      expect(crewPerms).toContain(Permission.VIEW_CREW);
      expect(crewPerms).toContain(Permission.EDIT_OWN_PROFILE);
      expect(crewPerms).not.toContain(Permission.EDIT_CREW_FULL);
      expect(crewPerms).not.toContain(Permission.DELETE_CREW);
    });

    it('should not give chief_engineer DELETE_CREW', () => {
      expect(ROLE_PERMISSIONS['chief_engineer']).not.toContain(Permission.DELETE_CREW);
    });

    it('should give shore_management same permissions as DPA except DELETE_CREW', () => {
      expect(ROLE_PERMISSIONS['shore_management']).not.toContain(Permission.DELETE_CREW);
      expect(ROLE_PERMISSIONS['shore_management']).toContain(Permission.EDIT_CREW_FULL);
    });
  });

  describe('hasPermission', () => {
    it('should return false for null role', () => {
      expect(hasPermission(null, Permission.VIEW_CREW)).toBe(false);
    });

    it('should return false for unknown role', () => {
      expect(hasPermission('unknown_role', Permission.VIEW_CREW)).toBe(false);
    });

    it('should return true for DPA with VIEW_CREW', () => {
      expect(hasPermission('dpa', Permission.VIEW_CREW)).toBe(true);
    });

    it('should return true for DPA with DELETE_CREW', () => {
      expect(hasPermission('dpa', Permission.DELETE_CREW)).toBe(true);
    });

    it('should return false for crew with DELETE_CREW', () => {
      expect(hasPermission('crew', Permission.DELETE_CREW)).toBe(false);
    });

    it('should be case-insensitive for role names', () => {
      expect(hasPermission('DPA', Permission.VIEW_CREW)).toBe(true);
      expect(hasPermission('Crew', Permission.VIEW_CREW)).toBe(true);
    });

    describe('context-based checks', () => {
      it('should allow crew to edit their own profile', () => {
        expect(hasPermission('crew', Permission.EDIT_OWN_PROFILE, {
          targetUserId: 'user-1',
          currentUserId: 'user-1',
        })).toBe(true);
      });

      it('should deny crew editing another user profile', () => {
        expect(hasPermission('crew', Permission.EDIT_OWN_PROFILE, {
          targetUserId: 'user-2',
          currentUserId: 'user-1',
        })).toBe(false);
      });

      it('should allow master to edit crew on their vessel', () => {
        expect(hasPermission('master', Permission.EDIT_CREW_FULL, {
          targetVesselId: 'vessel-1',
          userVesselIds: ['vessel-1', 'vessel-2'],
        })).toBe(true);
      });

      it('should deny master editing crew on other vessels', () => {
        expect(hasPermission('master', Permission.EDIT_CREW_FULL, {
          targetVesselId: 'vessel-3',
          userVesselIds: ['vessel-1', 'vessel-2'],
        })).toBe(false);
      });

      it('should allow chief_engineer to edit crew in same department', () => {
        expect(hasPermission('chief_engineer', Permission.EDIT_CREW_BASIC, {
          targetDepartment: 'Engine',
          userDepartment: 'Engine',
        })).toBe(true);
      });

      it('should deny chief_engineer editing crew in different department', () => {
        expect(hasPermission('chief_engineer', Permission.EDIT_CREW_BASIC, {
          targetDepartment: 'Deck',
          userDepartment: 'Engine',
        })).toBe(false);
      });

      it('should allow chief_officer to edit crew in same department', () => {
        expect(hasPermission('chief_officer', Permission.EDIT_CREW_BASIC, {
          targetDepartment: 'Deck',
          userDepartment: 'Deck',
        })).toBe(true);
      });

      it('should still grant permission when no context is provided', () => {
        expect(hasPermission('master', Permission.EDIT_CREW_FULL)).toBe(true);
      });
    });
  });

  describe('getEditableFields', () => {
    it('should return empty array for null role', () => {
      expect(getEditableFields(null, false)).toEqual([]);
    });

    it('should return ALL_FIELDS for DPA', () => {
      const fields = getEditableFields('dpa', false);
      expect(fields).toContain('first_name');
      expect(fields).toContain('last_name');
      expect(fields).toContain('email');
      expect(fields).toContain('rank');
      expect(fields).toContain('status');
      expect(fields).toContain('vessel_id');
    });

    it('should return ALL_FIELDS for shore_management', () => {
      const fields = getEditableFields('shore_management', false);
      expect(fields).toContain('first_name');
      expect(fields).toContain('email');
      expect(fields).toContain('vessel_id');
    });

    it('should return ALL_FIELDS for master', () => {
      const fields = getEditableFields('master', false);
      expect(fields).toContain('first_name');
      expect(fields).toContain('vessel_id');
    });

    it('should return BASIC_FIELDS for chief_engineer', () => {
      const fields = getEditableFields('chief_engineer', false);
      expect(fields).toContain('phone');
      expect(fields).toContain('emergency_contact_name');
      expect(fields).toContain('emergency_contact_phone');
      expect(fields).toContain('cabin');
      expect(fields).toContain('notes');
      expect(fields).not.toContain('email');
      expect(fields).not.toContain('rank');
    });

    it('should return BASIC_FIELDS for chief_officer', () => {
      const fields = getEditableFields('chief_officer', false);
      expect(fields).toContain('phone');
      expect(fields).not.toContain('email');
    });

    it('should return OWN_PROFILE_FIELDS for crew editing own profile', () => {
      const fields = getEditableFields('crew', true);
      expect(fields).toContain('preferred_name');
      expect(fields).toContain('phone');
      expect(fields).toContain('emergency_contact_name');
      expect(fields).toContain('emergency_contact_phone');
      expect(fields).not.toContain('email');
      expect(fields).not.toContain('rank');
    });

    it('should return empty array for crew editing non-own profile', () => {
      expect(getEditableFields('crew', false)).toEqual([]);
    });

    it('should be case-insensitive', () => {
      const fields = getEditableFields('DPA', false);
      expect(fields.length).toBeGreaterThan(0);
    });
  });

  describe('canEditField', () => {
    it('should return true for DPA editing any field', () => {
      expect(canEditField('dpa', 'first_name', false)).toBe(true);
      expect(canEditField('dpa', 'email', false)).toBe(true);
      expect(canEditField('dpa', 'rank', false)).toBe(true);
    });

    it('should return false for crew editing rank', () => {
      expect(canEditField('crew', 'rank', true)).toBe(false);
    });

    it('should return true for crew editing their own phone', () => {
      expect(canEditField('crew', 'phone', true)).toBe(true);
    });

    it('should return false for null role', () => {
      expect(canEditField(null, 'first_name', false)).toBe(false);
    });
  });

  describe('constants', () => {
    it('should define expected departments', () => {
      expect(DEPARTMENTS).toContain('Deck');
      expect(DEPARTMENTS).toContain('Engine');
      expect(DEPARTMENTS).toContain('Interior');
      expect(DEPARTMENTS).toContain('Galley');
    });

    it('should define expected genders', () => {
      expect(GENDERS).toContain('Male');
      expect(GENDERS).toContain('Female');
      expect(GENDERS).toContain('Other');
      expect(GENDERS).toContain('Prefer not to say');
    });

    it('should define expected crew statuses', () => {
      expect(CREW_STATUSES).toContain('Active');
      expect(CREW_STATUSES).toContain('On Leave');
      expect(CREW_STATUSES).toContain('Inactive');
      expect(CREW_STATUSES).toContain('Pending');
      expect(CREW_STATUSES).toContain('Invited');
    });
  });
});
