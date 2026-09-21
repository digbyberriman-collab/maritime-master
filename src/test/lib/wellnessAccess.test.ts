import { describe, expect, it } from 'vitest';
import { resolveMedicalAccess, NO_MEDICAL_ACCESS } from '@/modules/auth/lib/medicalAccess';
import {
  canAccessPhysio,
  resolveWellnessAccess,
  wellnessAccessSatisfies,
  type ResolveWellnessAccessInput,
} from '@/modules/auth/lib/wellnessAccess';
import type { ModulePermission } from '@/modules/auth/types';

const perm = (overrides: Partial<ModulePermission>): ModulePermission => ({
  module_key: 'wellness',
  module_name: 'Health & Wellness',
  can_view: false,
  can_edit: false,
  can_admin: false,
  scope: 'fleet',
  restrictions: {},
  ...overrides,
});

const base: ResolveWellnessAccessInput = {
  rbacInitialized: true,
  rbacRoles: [],
  wellnessPermission: null,
  legacyRole: null,
  practitionerDisciplines: [],
  medical: NO_MEDICAL_ACCESS,
};

describe('resolveWellnessAccess', () => {
  it('grants admin to superadmin, dpa and shore management', () => {
    expect(resolveWellnessAccess({ ...base, rbacRoles: ['dpa'] }).level).toBe('admin');
    expect(resolveWellnessAccess({ ...base, rbacRoles: ['superadmin'] }).level).toBe('admin');
    expect(resolveWellnessAccess({ ...base, legacyRole: 'shore_management' }).level).toBe('admin');
  });

  it('grants edit to captains and pursers', () => {
    for (const role of ['captain', 'purser']) {
      expect(resolveWellnessAccess({ ...base, rbacRoles: [role] }).level).toBe('edit');
    }
  });

  it('grants edit to any practitioner, whatever their discipline', () => {
    for (const discipline of ['spa', 'physio', 'nutrition', 'pt']) {
      const access = resolveWellnessAccess({
        ...base,
        legacyRole: 'crew',
        practitionerDisciplines: [discipline],
      });
      expect(access.level).toBe('edit');
      expect(access.disciplines).toContain(discipline);
    }
  });

  it('grants edit to anyone with clinical edit, mirroring wellness_can_edit', () => {
    const medic = resolveMedicalAccess({
      rbacInitialized: true,
      rbacRoles: [],
      medicalPermission: null,
      legacyRole: null,
      practitionerDisciplines: ['medical'],
    });
    // The medic's own discipline list is empty here on purpose: the grant
    // must come from their clinical access, not from the roster lookup.
    const access = resolveWellnessAccess({ ...base, medical: medic });
    expect(access.level).toBe('edit');
  });

  it('grants view to fleet masters and heads of department', () => {
    for (const role of ['fleet_master', 'chief_officer', 'chief_engineer', 'hod']) {
      expect(resolveWellnessAccess({ ...base, rbacRoles: [role] }).level).toBe('view');
    }
  });

  it('treats a self-scoped wellness permission as self-service only', () => {
    const access = resolveWellnessAccess({
      ...base,
      rbacRoles: ['crew'],
      wellnessPermission: perm({ can_view: true, scope: 'self' }),
    });
    expect(access.level).toBe('self');
    expect(access.selfOnly).toBe(true);
    expect(access.canView).toBe(false);
  });

  it('gives crew self-service so they keep their own training and nutrition', () => {
    expect(resolveWellnessAccess({ ...base, legacyRole: 'crew' }).level).toBe('self');
  });

  it('gives an auditor nothing', () => {
    expect(resolveWellnessAccess({ ...base, rbacRoles: ['auditor'] }).level).toBe('none');
  });
});

describe('wellnessAccessSatisfies', () => {
  it('ladders view, edit and admin', () => {
    const admin = resolveWellnessAccess({ ...base, rbacRoles: ['dpa'] });
    expect(wellnessAccessSatisfies(admin, 'admin')).toBe(true);

    const trainer = resolveWellnessAccess({ ...base, practitionerDisciplines: ['pt'] });
    expect(wellnessAccessSatisfies(trainer, 'edit')).toBe(true);
    expect(wellnessAccessSatisfies(trainer, 'admin')).toBe(false);

    const hod = resolveWellnessAccess({ ...base, rbacRoles: ['hod'] });
    expect(wellnessAccessSatisfies(hod, 'view')).toBe(true);
    expect(wellnessAccessSatisfies(hod, 'edit')).toBe(false);
  });
});

describe('canAccessPhysio', () => {
  const medic = resolveMedicalAccess({
    rbacInitialized: true,
    rbacRoles: [],
    medicalPermission: null,
    legacyRole: null,
    practitionerDisciplines: ['medical'],
  });

  it('lets a physiotherapist read and write physio records', () => {
    const wellness = resolveWellnessAccess({ ...base, practitionerDisciplines: ['physio'] });
    expect(canAccessPhysio(NO_MEDICAL_ACCESS, wellness, 'view')).toBe(true);
    expect(canAccessPhysio(NO_MEDICAL_ACCESS, wellness, 'edit')).toBe(true);
  });

  it('lets medical staff read and write physio records', () => {
    const wellness = resolveWellnessAccess({ ...base, medical: medic });
    expect(canAccessPhysio(medic, wellness, 'edit')).toBe(true);
  });

  it('keeps physio notes away from a trainer and a purser', () => {
    const trainer = resolveWellnessAccess({ ...base, practitionerDisciplines: ['pt'] });
    expect(canAccessPhysio(NO_MEDICAL_ACCESS, trainer, 'view')).toBe(false);

    const purser = resolveWellnessAccess({ ...base, rbacRoles: ['purser'] });
    expect(canAccessPhysio(NO_MEDICAL_ACCESS, purser, 'view')).toBe(false);
  });
});
