import { describe, expect, it } from 'vitest';
import { resolveHrAccess, hrAccessSatisfies, type ResolveHrAccessInput } from '@/modules/auth/lib/hrAccess';
import type { ModulePermission } from '@/modules/auth/types';

const perm = (overrides: Partial<ModulePermission>): ModulePermission => ({
  module_key: 'hr',
  module_name: 'HR',
  can_view: false,
  can_edit: false,
  can_admin: false,
  scope: 'fleet',
  restrictions: {},
  ...overrides,
});

const base: ResolveHrAccessInput = {
  rbacInitialized: true,
  rbacRoles: [],
  hrPermission: null,
  legacyRole: null,
};

describe('resolveHrAccess', () => {
  it('grants admin to RBAC superadmin/dpa regardless of hr permission rows', () => {
    expect(resolveHrAccess({ ...base, rbacRoles: ['dpa'] }).level).toBe('admin');
    expect(resolveHrAccess({ ...base, rbacRoles: ['superadmin'] }).level).toBe('admin');
  });

  it('grants edit to fleet_master, captain and purser', () => {
    for (const role of ['fleet_master', 'captain', 'purser']) {
      expect(resolveHrAccess({ ...base, rbacRoles: [role] }).level).toBe('edit');
    }
  });

  it('grants view to heads of department', () => {
    for (const role of ['chief_officer', 'chief_engineer', 'hod']) {
      expect(resolveHrAccess({ ...base, rbacRoles: [role] }).level).toBe('view');
    }
  });

  it('treats a self-scoped hr permission as self-service only, never view of others', () => {
    const access = resolveHrAccess({
      ...base,
      rbacRoles: ['crew'],
      hrPermission: perm({ can_view: true, scope: 'self' }),
    });
    expect(access.level).toBe('self');
    expect(access.canView).toBe(false);
    expect(access.selfOnly).toBe(true);
  });

  it('uses hr module permission levels when the role is not a known HR role', () => {
    expect(resolveHrAccess({ ...base, rbacRoles: ['officer'], hrPermission: perm({ can_view: true }) }).level).toBe('view');
    expect(resolveHrAccess({ ...base, rbacRoles: ['officer'], hrPermission: perm({ can_view: true, can_edit: true }) }).level).toBe('edit');
    expect(resolveHrAccess({ ...base, rbacRoles: ['officer'], hrPermission: perm({ can_view: true, can_edit: true, can_admin: true }) }).level).toBe('admin');
  });

  it('falls back to the legacy profiles.role when RBAC has nothing', () => {
    expect(resolveHrAccess({ ...base, legacyRole: 'dpa' }).level).toBe('admin');
    expect(resolveHrAccess({ ...base, legacyRole: 'shore_management' }).level).toBe('admin');
    expect(resolveHrAccess({ ...base, legacyRole: 'master' }).level).toBe('edit');
    expect(resolveHrAccess({ ...base, legacyRole: 'chief_officer' }).level).toBe('view');
    expect(resolveHrAccess({ ...base, legacyRole: 'crew' }).level).toBe('self');
  });

  it('denies auditors and unknown roles', () => {
    expect(resolveHrAccess({ ...base, rbacRoles: ['auditor'] }).level).toBe('none');
    expect(resolveHrAccess({ ...base, rbacRoles: ['travel_agent'] }).level).toBe('none');
    expect(resolveHrAccess(base).level).toBe('none');
  });

  it('hrAccessSatisfies is monotonic', () => {
    const edit = resolveHrAccess({ ...base, rbacRoles: ['captain'] });
    expect(hrAccessSatisfies(edit, 'view')).toBe(true);
    expect(hrAccessSatisfies(edit, 'edit')).toBe(true);
    expect(hrAccessSatisfies(edit, 'admin')).toBe(false);
  });
});
