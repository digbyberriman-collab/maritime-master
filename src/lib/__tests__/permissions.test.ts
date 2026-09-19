import { describe, it, expect } from 'vitest';
import {
  Permission,
  ROLE_PERMISSIONS,
  hasPermission,
  getEditableFields,
  canEditField,
} from '../permissions';

describe('hasPermission', () => {
  it('denies everything when the role is null', () => {
    expect(hasPermission(null, Permission.VIEW_CREW)).toBe(false);
    expect(hasPermission(null, Permission.DELETE_CREW)).toBe(false);
  });

  it('denies unknown roles', () => {
    expect(hasPermission('not_a_role', Permission.VIEW_CREW)).toBe(false);
  });

  it('matches roles case-insensitively', () => {
    expect(hasPermission('DPA', Permission.DELETE_CREW)).toBe(true);
    expect(hasPermission('Dpa', Permission.DELETE_CREW)).toBe(true);
  });

  it('grants base permissions from the role matrix', () => {
    expect(hasPermission('dpa', Permission.DELETE_CREW)).toBe(true);
    expect(hasPermission('shore_management', Permission.TRANSFER_CREW)).toBe(true);
  });

  it('withholds permissions the role does not have', () => {
    // Only the DPA may delete crew.
    expect(hasPermission('shore_management', Permission.DELETE_CREW)).toBe(false);
    expect(hasPermission('master', Permission.DELETE_CREW)).toBe(false);
    expect(hasPermission('chief_engineer', Permission.DELETE_CREW)).toBe(false);
    expect(hasPermission('crew', Permission.DELETE_CREW)).toBe(false);
  });

  it('never lets ordinary crew edit other people', () => {
    expect(hasPermission('crew', Permission.EDIT_CREW_FULL)).toBe(false);
    expect(hasPermission('crew', Permission.EDIT_CREW_BASIC)).toBe(false);
    expect(hasPermission('crew', Permission.TRANSFER_CREW)).toBe(false);
    expect(hasPermission('crew', Permission.SIGN_OFF_CREW)).toBe(false);
  });

  describe('crew editing their own profile', () => {
    it('allows a crew member to edit their own record', () => {
      expect(
        hasPermission('crew', Permission.EDIT_OWN_PROFILE, {
          targetUserId: 'user-1',
          currentUserId: 'user-1',
        })
      ).toBe(true);
    });

    it('blocks a crew member from editing someone else', () => {
      expect(
        hasPermission('crew', Permission.EDIT_OWN_PROFILE, {
          targetUserId: 'user-2',
          currentUserId: 'user-1',
        })
      ).toBe(false);
    });

    it('fails closed when identity cannot be established', () => {
      // A partial context must not be read as "these two undefineds match".
      expect(hasPermission('crew', Permission.EDIT_OWN_PROFILE, {})).toBe(false);
      expect(
        hasPermission('crew', Permission.EDIT_OWN_PROFILE, { currentUserId: 'user-1' })
      ).toBe(false);
      expect(
        hasPermission('crew', Permission.EDIT_OWN_PROFILE, { targetUserId: 'user-1' })
      ).toBe(false);
    });
  });

  describe('master scoped to their own vessel', () => {
    it('allows editing crew on an assigned vessel', () => {
      expect(
        hasPermission('master', Permission.EDIT_CREW_FULL, {
          targetVesselId: 'vessel-a',
          userVesselIds: ['vessel-a', 'vessel-b'],
        })
      ).toBe(true);
    });

    it('blocks editing crew on a vessel they are not assigned to', () => {
      expect(
        hasPermission('master', Permission.EDIT_CREW_FULL, {
          targetVesselId: 'vessel-z',
          userVesselIds: ['vessel-a', 'vessel-b'],
        })
      ).toBe(false);
    });

    it('blocks a master with no vessel assignments', () => {
      expect(
        hasPermission('master', Permission.EDIT_CREW_FULL, {
          targetVesselId: 'vessel-a',
          userVesselIds: [],
        })
      ).toBe(false);
    });

    it('fails closed when the vessel scope is incomplete', () => {
      // Missing either side of the comparison must deny, not fall through to allow.
      expect(hasPermission('master', Permission.EDIT_CREW_FULL, {})).toBe(false);
      expect(
        hasPermission('master', Permission.EDIT_CREW_FULL, { targetVesselId: 'vessel-a' })
      ).toBe(false);
      expect(
        hasPermission('master', Permission.EDIT_CREW_FULL, { userVesselIds: ['vessel-a'] })
      ).toBe(false);
    });
  });

  describe('heads of department scoped to their own department', () => {
    it('allows editing crew in the same department', () => {
      expect(
        hasPermission('chief_engineer', Permission.EDIT_CREW_BASIC, {
          targetDepartment: 'Engine',
          userDepartment: 'Engine',
        })
      ).toBe(true);
      expect(
        hasPermission('chief_officer', Permission.EDIT_CREW_BASIC, {
          targetDepartment: 'Deck',
          userDepartment: 'Deck',
        })
      ).toBe(true);
    });

    it('blocks editing crew in another department', () => {
      expect(
        hasPermission('chief_engineer', Permission.EDIT_CREW_BASIC, {
          targetDepartment: 'Deck',
          userDepartment: 'Engine',
        })
      ).toBe(false);
    });

    it('fails closed when the department scope is incomplete', () => {
      expect(hasPermission('chief_engineer', Permission.EDIT_CREW_BASIC, {})).toBe(false);
      expect(
        hasPermission('chief_officer', Permission.EDIT_CREW_BASIC, { userDepartment: 'Deck' })
      ).toBe(false);
    });
  });

  it('leaves unscoped permissions unaffected by context', () => {
    // VIEW_CREW carries no scoping rule, so a context must not change the answer.
    expect(
      hasPermission('chief_engineer', Permission.VIEW_CREW, {
        targetDepartment: 'Deck',
        userDepartment: 'Engine',
      })
    ).toBe(true);
  });
});

describe('getEditableFields', () => {
  it('returns nothing without a role', () => {
    expect(getEditableFields(null, true)).toEqual([]);
    expect(getEditableFields(null, false)).toEqual([]);
  });

  it('returns nothing for an unknown role', () => {
    expect(getEditableFields('auditor', false)).toEqual([]);
  });

  it('gives DPA, shore management and master the same full field set', () => {
    const dpa = getEditableFields('dpa', false);
    const shore = getEditableFields('shore_management', false);
    const master = getEditableFields('master', false);

    expect(dpa).toEqual(shore);
    expect(dpa).toEqual(master);
    expect(dpa).toContain('rank');
    expect(dpa).toContain('vessel_id');
    expect(dpa).toContain('contract_end_date');
  });

  it('limits heads of department to welfare-style basic fields', () => {
    const fields = getEditableFields('chief_engineer', false);

    expect(fields).toEqual(['phone', 'emergency_contact_name', 'emergency_contact_phone', 'cabin', 'notes']);
    // A HOD must not be able to change rank, contract or vessel.
    expect(fields).not.toContain('rank');
    expect(fields).not.toContain('vessel_id');
    expect(fields).not.toContain('contract_end_date');
  });

  it('limits crew to a small set on their own profile only', () => {
    const own = getEditableFields('crew', true);
    expect(own).toEqual([
      'preferred_name',
      'phone',
      'emergency_contact_name',
      'emergency_contact_phone',
    ]);

    // The same role on somebody else's profile gets nothing.
    expect(getEditableFields('crew', false)).toEqual([]);
  });

  it('returns a fresh array each call so callers cannot mutate the source lists', () => {
    const first = getEditableFields('crew', true);
    first.pop();
    expect(getEditableFields('crew', true)).toHaveLength(4);
  });
});

describe('canEditField', () => {
  it('permits a field that the role owns', () => {
    expect(canEditField('dpa', 'rank', false)).toBe(true);
    expect(canEditField('chief_officer', 'cabin', false)).toBe(true);
    expect(canEditField('crew', 'phone', true)).toBe(true);
  });

  it('refuses a field outside the role', () => {
    expect(canEditField('chief_officer', 'rank', false)).toBe(false);
    expect(canEditField('crew', 'rank', true)).toBe(false);
    expect(canEditField('crew', 'phone', false)).toBe(false);
  });

  it('refuses a field that does not exist', () => {
    expect(canEditField('dpa', 'definitely_not_a_field', false)).toBe(false);
  });

  it('refuses everything without a role', () => {
    expect(canEditField(null, 'phone', true)).toBe(false);
  });
});

describe('ROLE_PERMISSIONS integrity', () => {
  it('lets every defined role at least view crew', () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      expect(perms, `${role} should be able to view crew`).toContain(Permission.VIEW_CREW);
    }
  });

  it('keeps crew deletion restricted to the DPA alone', () => {
    const rolesThatCanDelete = Object.entries(ROLE_PERMISSIONS)
      .filter(([, perms]) => perms.includes(Permission.DELETE_CREW))
      .map(([role]) => role);

    expect(rolesThatCanDelete).toEqual(['dpa']);
  });

  it('declares no duplicate permissions within a role', () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      expect(new Set(perms).size, `${role} has duplicate permissions`).toBe(perms.length);
    }
  });
});
