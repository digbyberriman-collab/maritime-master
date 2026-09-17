import { describe, expect, it } from 'vitest';
import { resolvePayrollAccess } from '@/modules/auth/lib/payrollAccess';
import type { ModulePermission } from '@/modules/auth/types';

const perm = (o: Partial<ModulePermission>): ModulePermission => ({
  module_key: 'finance', module_name: 'Finance', can_view: false, can_edit: false, can_admin: false, scope: 'fleet', restrictions: {}, ...o,
});

describe('resolvePayrollAccess', () => {
  it('dpa/superadmin are admins; purser edits; fleet_master views', () => {
    expect(resolvePayrollAccess({ rbacRoles: ['dpa'], financePermission: null, legacyRole: null }).level).toBe('admin');
    expect(resolvePayrollAccess({ rbacRoles: ['purser'], financePermission: null, legacyRole: null }).level).toBe('edit');
    expect(resolvePayrollAccess({ rbacRoles: ['fleet_master'], financePermission: null, legacyRole: null }).level).toBe('view');
  });
  it('captains and HODs do not see salaries (self only)', () => {
    expect(resolvePayrollAccess({ rbacRoles: ['captain'], financePermission: null, legacyRole: null }).level).toBe('self');
    expect(resolvePayrollAccess({ rbacRoles: ['chief_officer'], financePermission: null, legacyRole: 'chief_officer' }).level).toBe('self');
  });
  it('finance module permissions grant access to non-standard roles', () => {
    expect(resolvePayrollAccess({ rbacRoles: ['officer'], financePermission: perm({ can_view: true }), legacyRole: null }).level).toBe('view');
    expect(resolvePayrollAccess({ rbacRoles: ['officer'], financePermission: perm({ can_view: true, can_edit: true }), legacyRole: null }).level).toBe('edit');
  });
  it('legacy dpa/shore_management fallback', () => {
    expect(resolvePayrollAccess({ rbacRoles: [], financePermission: null, legacyRole: 'shore_management' }).level).toBe('admin');
    expect(resolvePayrollAccess({ rbacRoles: [], financePermission: null, legacyRole: 'master' }).level).toBe('self');
  });
  it('no identity at all is none', () => {
    expect(resolvePayrollAccess({ rbacRoles: [], financePermission: null, legacyRole: null }).level).toBe('none');
  });
});
