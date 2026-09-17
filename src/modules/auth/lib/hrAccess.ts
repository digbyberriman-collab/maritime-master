import type { ModulePermission } from '@/modules/auth/types';

/**
 * Client-side mirror of the database helpers `hr_can_view` / `hr_can_edit` /
 * `hr_can_admin` (supabase/migrations/20260917100000_hris_phase0_substrate.sql).
 *
 * Both sides must agree: the UI decides what to show, RLS decides what is
 * returned. Keep the two in sync when adding roles.
 */

export type HrAccessLevel = 'none' | 'self' | 'view' | 'edit' | 'admin';

export interface HrAccess {
  level: HrAccessLevel;
  /** Can read other people's HR records. */
  canView: boolean;
  /** Can create/update HR records for other people. */
  canEdit: boolean;
  /** Full HR control: compensation, disciplinary, retention actions. */
  canAdmin: boolean;
  /** Only their own records (crew self-service). */
  selfOnly: boolean;
}

const RBAC_ADMIN_ROLES = ['superadmin', 'dpa'];
const RBAC_EDIT_ROLES = ['fleet_master', 'captain', 'purser'];
const RBAC_VIEW_ROLES = ['chief_officer', 'chief_engineer', 'hod'];

const LEGACY_ADMIN_ROLES = ['dpa', 'shore_management'];
const LEGACY_EDIT_ROLES = ['master'];
const LEGACY_VIEW_ROLES = ['chief_officer', 'chief_engineer'];

export interface ResolveHrAccessInput {
  /** RBAC store has finished loading (permissions may still be empty). */
  rbacInitialized: boolean;
  /** RBAC role names held by the user. */
  rbacRoles: string[];
  /** RBAC permission row for module key `hr`, if any. */
  hrPermission: ModulePermission | null | undefined;
  /** profiles.role (legacy user_role enum). */
  legacyRole: string | null | undefined;
}

const build = (level: HrAccessLevel): HrAccess => ({
  level,
  canView: level === 'view' || level === 'edit' || level === 'admin',
  canEdit: level === 'edit' || level === 'admin',
  canAdmin: level === 'admin',
  selfOnly: level === 'self',
});

export const NO_HR_ACCESS: HrAccess = build('none');

export function resolveHrAccess(input: ResolveHrAccessInput): HrAccess {
  const roles = new Set(input.rbacRoles.map((r) => r.toLowerCase()));
  const legacy = input.legacyRole?.toLowerCase() ?? null;
  const perm = input.hrPermission ?? null;
  const permIsSelf = perm?.scope === 'self';

  if (RBAC_ADMIN_ROLES.some((r) => roles.has(r))) return build('admin');
  if (perm?.can_admin && !permIsSelf) return build('admin');
  if (legacy && LEGACY_ADMIN_ROLES.includes(legacy)) return build('admin');

  if (RBAC_EDIT_ROLES.some((r) => roles.has(r))) return build('edit');
  if (perm?.can_edit && !permIsSelf) return build('edit');
  if (legacy && LEGACY_EDIT_ROLES.includes(legacy)) return build('edit');

  if (RBAC_VIEW_ROLES.some((r) => roles.has(r))) return build('view');
  if (perm?.can_view && !permIsSelf) return build('view');
  if (legacy && LEGACY_VIEW_ROLES.includes(legacy)) return build('view');

  if (perm?.can_view && permIsSelf) return build('self');
  if (legacy === 'crew') return build('self');

  return NO_HR_ACCESS;
}

export const hrAccessSatisfies = (access: HrAccess, required: 'view' | 'edit' | 'admin'): boolean => {
  if (required === 'admin') return access.canAdmin;
  if (required === 'edit') return access.canEdit;
  return access.canView;
};
