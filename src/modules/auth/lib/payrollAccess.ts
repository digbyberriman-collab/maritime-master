import type { ModulePermission } from '@/modules/auth/types';

/**
 * Client-side mirror of the database helpers `payroll_can_view` /
 * `payroll_can_edit` / `payroll_can_admin`
 * (supabase/migrations/20260917120000_hris_phase2_compensation.sql).
 *
 * Finance is deliberately narrower than HR: heads of department and
 * captains do not see salaries. Keep both sides in sync.
 */

export type PayrollAccessLevel = 'none' | 'self' | 'view' | 'edit' | 'admin';

export interface PayrollAccess {
  level: PayrollAccessLevel;
  canView: boolean;
  canEdit: boolean;
  canAdmin: boolean;
  selfOnly: boolean;
}

const RBAC_ADMIN_ROLES = ['superadmin', 'dpa'];
const RBAC_EDIT_ROLES = ['purser'];
const RBAC_VIEW_ROLES = ['fleet_master'];
const LEGACY_ADMIN_ROLES = ['dpa', 'shore_management'];

export interface ResolvePayrollAccessInput {
  rbacRoles: string[];
  financePermission: ModulePermission | null | undefined;
  legacyRole: string | null | undefined;
}

const build = (level: PayrollAccessLevel): PayrollAccess => ({
  level,
  canView: level === 'view' || level === 'edit' || level === 'admin',
  canEdit: level === 'edit' || level === 'admin',
  canAdmin: level === 'admin',
  selfOnly: level === 'self',
});

export function resolvePayrollAccess(input: ResolvePayrollAccessInput): PayrollAccess {
  const roles = new Set(input.rbacRoles.map((r) => r.toLowerCase()));
  const legacy = input.legacyRole?.toLowerCase() ?? null;
  const perm = input.financePermission ?? null;
  const permIsSelf = perm?.scope === 'self';

  if (RBAC_ADMIN_ROLES.some((r) => roles.has(r))) return build('admin');
  if (perm?.can_admin && !permIsSelf) return build('admin');
  if (legacy && LEGACY_ADMIN_ROLES.includes(legacy)) return build('admin');

  if (RBAC_EDIT_ROLES.some((r) => roles.has(r))) return build('edit');
  if (perm?.can_edit && !permIsSelf) return build('edit');

  if (RBAC_VIEW_ROLES.some((r) => roles.has(r))) return build('view');
  if (perm?.can_view && !permIsSelf) return build('view');

  // Everyone with a profile can see their own paid payslips and compensation.
  if (legacy || roles.size > 0 || perm) return build('self');
  return build('none');
}

export const payrollAccessSatisfies = (access: PayrollAccess, required: 'view' | 'edit' | 'admin'): boolean => {
  if (required === 'admin') return access.canAdmin;
  if (required === 'edit') return access.canEdit;
  return access.canView;
};
