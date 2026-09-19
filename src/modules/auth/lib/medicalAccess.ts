import type { ModulePermission } from '@/modules/auth/types';

/**
 * Client-side mirror of the database helpers `medical_can_view` /
 * `medical_can_edit` / `medical_can_admin`
 * (supabase/migrations/20260919100000_health_phase1_foundation.sql).
 *
 * Both sides must agree: the UI decides what to show, RLS decides what is
 * returned. Keep the two in step when adding roles.
 *
 * Medical access is deliberately narrow. Rank does not grant it: a ship's
 * medic gets clinical access by being listed in `hw_practitioners` with
 * discipline `medical`, not by being senior. Captains and HR are absent on
 * purpose — they read fitness to work through `resolveFitnessAccess`, which
 * carries no diagnosis, medication or consultation notes.
 */

export type MedicalAccessLevel = 'none' | 'self' | 'view' | 'edit' | 'admin';

export interface MedicalAccess {
  level: MedicalAccessLevel;
  /** Can read other people's clinical records. */
  canView: boolean;
  /** Can create and change clinical records. */
  canEdit: boolean;
  /** Full clinical control: protocols, screening templates, stores setup. */
  canAdmin: boolean;
  /** Only their own record (crew self-service). */
  selfOnly: boolean;
  /** True when clinical access comes from being a practitioner, not a role. */
  isPractitioner: boolean;
}

const RBAC_ADMIN_ROLES = ['superadmin', 'dpa'];
const LEGACY_ADMIN_ROLES = ['dpa', 'shore_management'];

export interface ResolveMedicalAccessInput {
  /** RBAC store has finished loading (permissions may still be empty). */
  rbacInitialized: boolean;
  /** RBAC role names held by the user. */
  rbacRoles: string[];
  /** RBAC permission row for module key `medical`, if any. */
  medicalPermission: ModulePermission | null | undefined;
  /** profiles.role (legacy user_role enum). */
  legacyRole: string | null | undefined;
  /** Disciplines the user is an active practitioner in (`hw_practitioners`). */
  practitionerDisciplines: string[];
}

const build = (level: MedicalAccessLevel, isPractitioner: boolean): MedicalAccess => ({
  level,
  canView: level === 'view' || level === 'edit' || level === 'admin',
  canEdit: level === 'edit' || level === 'admin',
  canAdmin: level === 'admin',
  selfOnly: level === 'self',
  isPractitioner,
});

export const NO_MEDICAL_ACCESS: MedicalAccess = build('none', false);

export function resolveMedicalAccess(input: ResolveMedicalAccessInput): MedicalAccess {
  const roles = new Set(input.rbacRoles.map((r) => r.toLowerCase()));
  const legacy = input.legacyRole?.toLowerCase() ?? null;
  const perm = input.medicalPermission ?? null;
  const permIsSelf = perm?.scope === 'self';
  const isMedic = input.practitionerDisciplines.includes('medical');

  if (RBAC_ADMIN_ROLES.some((r) => roles.has(r))) return build('admin', isMedic);
  if (perm?.can_admin && !permIsSelf) return build('admin', isMedic);
  if (legacy && LEGACY_ADMIN_ROLES.includes(legacy)) return build('admin', isMedic);

  if (isMedic) return build('edit', true);
  if (perm?.can_edit && !permIsSelf) return build('edit', false);

  if (perm?.can_view && !permIsSelf) return build('view', false);

  if (perm?.can_view && permIsSelf) return build('self', false);
  if (legacy === 'crew') return build('self', false);

  return NO_MEDICAL_ACCESS;
}

export const medicalAccessSatisfies = (
  access: MedicalAccess,
  required: 'view' | 'edit' | 'admin',
): boolean => {
  if (required === 'admin') return access.canAdmin;
  if (required === 'edit') return access.canEdit;
  return access.canView;
};

/**
 * Mirror of `med_fitness_can_view`. Fitness to work is the one medical
 * surface HR and the bridge can read: status, restrictions and expiry, so a
 * vessel is not crewed with an expired certificate. It is not clinical.
 */
export interface ResolveFitnessAccessInput {
  medical: MedicalAccess;
  /** True when `resolveHrAccess(...).canView`, which already covers the
   *  legacy master and shore management roles. */
  hrCanView: boolean;
  rbacRoles: string[];
}

export function resolveFitnessAccess(input: ResolveFitnessAccessInput): boolean {
  if (input.medical.canView) return true;
  if (input.hrCanView) return true;
  const roles = new Set(input.rbacRoles.map((r) => r.toLowerCase()));
  return roles.has('captain') || roles.has('fleet_master');
}
