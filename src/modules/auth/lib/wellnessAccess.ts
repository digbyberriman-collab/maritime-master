import type { ModulePermission } from '@/modules/auth/types';
import type { MedicalAccess } from '@/modules/auth/lib/medicalAccess';

/**
 * Client-side mirror of the database helpers `wellness_can_view` /
 * `wellness_can_edit` / `wellness_can_admin`
 * (supabase/migrations/20260919100000_health_phase1_foundation.sql).
 *
 * Wellness covers spa, nutrition, physiotherapy and personal training.
 * These are operational records rather than clinical ones, so the bar is
 * lower than `medical`: heads of department and the bridge can see who is
 * booked in the gym. Physiotherapy notes are the exception and are gated on
 * medical access or the physio discipline, enforced by RLS.
 */

export type WellnessAccessLevel = 'none' | 'self' | 'view' | 'edit' | 'admin';

export interface WellnessAccess {
  level: WellnessAccessLevel;
  canView: boolean;
  canEdit: boolean;
  canAdmin: boolean;
  selfOnly: boolean;
  /** Disciplines the user practises in: spa, physio, nutrition, pt, medical. */
  disciplines: string[];
}

export const WELLNESS_DISCIPLINES = ['medical', 'spa', 'physio', 'nutrition', 'pt'] as const;
export type WellnessDiscipline = (typeof WELLNESS_DISCIPLINES)[number];

const RBAC_ADMIN_ROLES = ['superadmin', 'dpa'];
const RBAC_EDIT_ROLES = ['captain', 'purser'];
const RBAC_VIEW_ROLES = ['fleet_master', 'chief_officer', 'chief_engineer', 'hod'];
const LEGACY_ADMIN_ROLES = ['dpa', 'shore_management'];

export interface ResolveWellnessAccessInput {
  rbacInitialized: boolean;
  rbacRoles: string[];
  /** RBAC permission row for module key `wellness`, if any. */
  wellnessPermission: ModulePermission | null | undefined;
  legacyRole: string | null | undefined;
  practitionerDisciplines: string[];
  /** Medical access, because `wellness_can_edit` includes `medical_can_edit`. */
  medical: MedicalAccess;
}

const build = (level: WellnessAccessLevel, disciplines: string[]): WellnessAccess => ({
  level,
  canView: level === 'view' || level === 'edit' || level === 'admin',
  canEdit: level === 'edit' || level === 'admin',
  canAdmin: level === 'admin',
  selfOnly: level === 'self',
  disciplines,
});

export const NO_WELLNESS_ACCESS: WellnessAccess = build('none', []);

export function resolveWellnessAccess(input: ResolveWellnessAccessInput): WellnessAccess {
  const roles = new Set(input.rbacRoles.map((r) => r.toLowerCase()));
  const legacy = input.legacyRole?.toLowerCase() ?? null;
  const perm = input.wellnessPermission ?? null;
  const permIsSelf = perm?.scope === 'self';
  const disciplines = input.practitionerDisciplines;

  if (RBAC_ADMIN_ROLES.some((r) => roles.has(r))) return build('admin', disciplines);
  if (perm?.can_admin && !permIsSelf) return build('admin', disciplines);
  if (legacy && LEGACY_ADMIN_ROLES.includes(legacy)) return build('admin', disciplines);

  if (input.medical.canEdit) return build('edit', disciplines);
  if (disciplines.length > 0) return build('edit', disciplines);
  if (RBAC_EDIT_ROLES.some((r) => roles.has(r))) return build('edit', disciplines);
  if (perm?.can_edit && !permIsSelf) return build('edit', disciplines);
  if (legacy === 'master') return build('edit', disciplines);

  if (RBAC_VIEW_ROLES.some((r) => roles.has(r))) return build('view', disciplines);
  if (perm?.can_view && !permIsSelf) return build('view', disciplines);

  if (perm?.can_view && permIsSelf) return build('self', disciplines);
  if (legacy === 'crew') return build('self', disciplines);

  return NO_WELLNESS_ACCESS;
}

export const wellnessAccessSatisfies = (
  access: WellnessAccess,
  required: 'view' | 'edit' | 'admin',
): boolean => {
  if (required === 'admin') return access.canAdmin;
  if (required === 'edit') return access.canEdit;
  return access.canView;
};

/**
 * Physiotherapy records are clinical. Mirror of the `physio_*` RLS policies:
 * medical staff, an active physiotherapist, or a wellness admin.
 */
export const canAccessPhysio = (
  medical: MedicalAccess,
  wellness: WellnessAccess,
  mode: 'view' | 'edit',
): boolean => {
  if (wellness.disciplines.includes('physio')) return true;
  if (wellness.canAdmin) return true;
  return mode === 'edit' ? medical.canEdit : medical.canView;
};
