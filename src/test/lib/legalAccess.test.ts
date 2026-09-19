import { describe, expect, it } from 'vitest';
import { legalAccessSatisfies, resolveLegalAccess } from '@/modules/auth/lib/legalAccess';
import type { ModulePermission } from '@/modules/auth/types';

const perm = (overrides: Partial<ModulePermission>): ModulePermission => ({
  module_key: 'legal',
  module_name: 'Legal',
  can_view: false,
  can_edit: false,
  can_admin: false,
  scope: 'fleet',
  restrictions: null,
  ...overrides,
});

const base = { rbacInitialized: true, rbacRoles: [] as string[], legalPermission: null, legacyRole: 'crew' };

describe('resolveLegalAccess', () => {
  it('is none when signed out', () => {
    expect(resolveLegalAccess({ ...base, signedIn: false }).level).toBe('none');
  });

  it('is self-only before RBAC has loaded and for ordinary crew', () => {
    expect(resolveLegalAccess({ ...base, rbacInitialized: false, rbacRoles: ['dpa'] }).level).toBe('self');
    const crew = resolveLegalAccess(base);
    expect(crew.level).toBe('self');
    expect(crew.selfOnly).toBe(true);
    expect(crew.canEdit).toBe(false);
  });

  it('grants admin to superadmin, DPA and legacy shore management', () => {
    expect(resolveLegalAccess({ ...base, rbacRoles: ['superadmin'] }).canAdmin).toBe(true);
    expect(resolveLegalAccess({ ...base, rbacRoles: ['DPA'] }).canAdmin).toBe(true);
    expect(resolveLegalAccess({ ...base, legacyRole: 'shore_management' }).canAdmin).toBe(true);
    expect(resolveLegalAccess({ ...base, legalPermission: perm({ can_admin: true }) }).canAdmin).toBe(true);
  });

  it('grants edit to legal counsel and RBAC legal editors', () => {
    const counsel = resolveLegalAccess({ ...base, rbacRoles: ['legal_counsel'] });
    expect(counsel.level).toBe('edit');
    expect(counsel.canEdit).toBe(true);
    expect(counsel.canAdmin).toBe(false);
    expect(resolveLegalAccess({ ...base, legalPermission: perm({ can_edit: true, can_view: true }) }).level).toBe('edit');
  });

  it('grants view-only oversight from an RBAC view permission', () => {
    const viewer = resolveLegalAccess({ ...base, legalPermission: perm({ can_view: true }) });
    expect(viewer.level).toBe('view');
    expect(viewer.canView).toBe(true);
    expect(viewer.canEdit).toBe(false);
  });

  it('never promotes a self-scoped grant', () => {
    expect(resolveLegalAccess({ ...base, legalPermission: perm({ can_admin: true, can_edit: true, can_view: true, scope: 'self' }) }).level).toBe('self');
  });

  it('captains and pursers are not on the legal team by default', () => {
    expect(resolveLegalAccess({ ...base, rbacRoles: ['captain', 'purser'], legacyRole: 'master' }).level).toBe('self');
  });

  it('legalAccessSatisfies maps levels to requirements', () => {
    const edit = resolveLegalAccess({ ...base, rbacRoles: ['legal_counsel'] });
    expect(legalAccessSatisfies(edit, 'view')).toBe(true);
    expect(legalAccessSatisfies(edit, 'edit')).toBe(true);
    expect(legalAccessSatisfies(edit, 'admin')).toBe(false);
  });
});
