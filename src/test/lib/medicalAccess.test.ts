import { describe, expect, it } from 'vitest';
import {
  medicalAccessSatisfies,
  resolveFitnessAccess,
  resolveMedicalAccess,
  type ResolveMedicalAccessInput,
} from '@/modules/auth/lib/medicalAccess';
import type { ModulePermission } from '@/modules/auth/types';

const perm = (overrides: Partial<ModulePermission>): ModulePermission => ({
  module_key: 'medical',
  module_name: 'Medical',
  can_view: false,
  can_edit: false,
  can_admin: false,
  scope: 'fleet',
  restrictions: {},
  ...overrides,
});

const base: ResolveMedicalAccessInput = {
  rbacInitialized: true,
  rbacRoles: [],
  medicalPermission: null,
  legacyRole: null,
  practitionerDisciplines: [],
};

describe('resolveMedicalAccess', () => {
  it('grants admin to RBAC superadmin and dpa', () => {
    expect(resolveMedicalAccess({ ...base, rbacRoles: ['dpa'] }).level).toBe('admin');
    expect(resolveMedicalAccess({ ...base, rbacRoles: ['superadmin'] }).level).toBe('admin');
  });

  it('grants admin to the legacy dpa and shore management roles', () => {
    expect(resolveMedicalAccess({ ...base, legacyRole: 'dpa' }).level).toBe('admin');
    expect(resolveMedicalAccess({ ...base, legacyRole: 'shore_management' }).level).toBe('admin');
  });

  it('grants edit to an active medical practitioner, whatever their rank', () => {
    const access = resolveMedicalAccess({
      ...base,
      legacyRole: 'crew',
      practitionerDisciplines: ['medical'],
    });
    expect(access.level).toBe('edit');
    expect(access.isPractitioner).toBe(true);
  });

  it('does not grant clinical access to a practitioner in another discipline', () => {
    const access = resolveMedicalAccess({
      ...base,
      legacyRole: 'crew',
      practitionerDisciplines: ['pt', 'spa'],
    });
    expect(access.level).toBe('self');
    expect(access.canView).toBe(false);
  });

  it('never grants clinical access to a captain by rank alone', () => {
    for (const role of ['captain', 'fleet_master', 'chief_officer', 'purser', 'hod']) {
      const access = resolveMedicalAccess({ ...base, rbacRoles: [role] });
      expect(access.canView).toBe(false);
      expect(access.level).toBe('none');
    }
  });

  it('never grants clinical access to the legacy master role', () => {
    expect(resolveMedicalAccess({ ...base, legacyRole: 'master' }).canView).toBe(false);
  });

  it('treats a self-scoped medical permission as self-service only', () => {
    const access = resolveMedicalAccess({
      ...base,
      rbacRoles: ['crew'],
      medicalPermission: perm({ can_view: true, scope: 'self' }),
    });
    expect(access.level).toBe('self');
    expect(access.selfOnly).toBe(true);
    expect(access.canView).toBe(false);
  });

  it('honours a fleet-scoped medical permission', () => {
    expect(
      resolveMedicalAccess({ ...base, medicalPermission: perm({ can_view: true }) }).level,
    ).toBe('view');
    expect(
      resolveMedicalAccess({ ...base, medicalPermission: perm({ can_edit: true }) }).level,
    ).toBe('edit');
    expect(
      resolveMedicalAccess({ ...base, medicalPermission: perm({ can_admin: true }) }).level,
    ).toBe('admin');
  });

  it('gives crew self-service and nothing more', () => {
    const access = resolveMedicalAccess({ ...base, legacyRole: 'crew' });
    expect(access.level).toBe('self');
    expect(access.canEdit).toBe(false);
  });

  it('gives an auditor nothing', () => {
    expect(resolveMedicalAccess({ ...base, rbacRoles: ['auditor'] }).level).toBe('none');
  });
});

describe('medicalAccessSatisfies', () => {
  it('ladders view, edit and admin', () => {
    const admin = resolveMedicalAccess({ ...base, rbacRoles: ['dpa'] });
    expect(medicalAccessSatisfies(admin, 'view')).toBe(true);
    expect(medicalAccessSatisfies(admin, 'edit')).toBe(true);
    expect(medicalAccessSatisfies(admin, 'admin')).toBe(true);

    const medic = resolveMedicalAccess({ ...base, practitionerDisciplines: ['medical'] });
    expect(medicalAccessSatisfies(medic, 'view')).toBe(true);
    expect(medicalAccessSatisfies(medic, 'edit')).toBe(true);
    expect(medicalAccessSatisfies(medic, 'admin')).toBe(false);

    const self = resolveMedicalAccess({ ...base, legacyRole: 'crew' });
    expect(medicalAccessSatisfies(self, 'view')).toBe(false);
  });
});

describe('resolveFitnessAccess', () => {
  const none = resolveMedicalAccess(base);
  const medic = resolveMedicalAccess({ ...base, practitionerDisciplines: ['medical'] });

  it('lets a captain and a fleet master read fitness without clinical access', () => {
    expect(resolveFitnessAccess({ medical: none, hrCanView: false, rbacRoles: ['captain'] })).toBe(true);
    expect(
      resolveFitnessAccess({ medical: none, hrCanView: false, rbacRoles: ['fleet_master'] }),
    ).toBe(true);
  });

  it('lets anyone with HR view read fitness', () => {
    expect(resolveFitnessAccess({ medical: none, hrCanView: true, rbacRoles: [] })).toBe(true);
  });

  it('lets medical staff read fitness', () => {
    expect(resolveFitnessAccess({ medical: medic, hrCanView: false, rbacRoles: [] })).toBe(true);
  });

  it('keeps fitness away from crew and auditors', () => {
    expect(resolveFitnessAccess({ medical: none, hrCanView: false, rbacRoles: ['crew'] })).toBe(false);
    expect(resolveFitnessAccess({ medical: none, hrCanView: false, rbacRoles: ['auditor'] })).toBe(
      false,
    );
  });
});
