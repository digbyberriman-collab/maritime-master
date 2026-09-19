import type { ModulePermission } from '@/modules/auth/types';

/**
 * Client-side mirror of the database helpers `legal_can_view` /
 * `legal_can_edit` / `legal_can_admin`
 * (supabase/migrations/20260919120000_legal_module.sql).
 *
 * Two tiers matter: the legal team (edit / admin) who triage, assign and
 * resolve every request in the company and own the document library, and
 * everyone else, who can raise requests, follow their own, and fill in
 * published forms (`self`). Keep both sides in sync.
 */

export type LegalAccessLevel = 'none' | 'self' | 'view' | 'edit' | 'admin';

export interface LegalAccess {
  level: LegalAccessLevel;
  /** Can read every request and submission in the company (read-only oversight). */
  canView: boolean;
  /** Legal team: triage, assign, risk-rate, resolve, author documents. */
  canEdit: boolean;
  /** Can delete records and run the SLA sweeper. */
  canAdmin: boolean;
  /** Signed in but not on the legal team: own requests and submissions only. */
  selfOnly: boolean;
}

const RBAC_ADMIN_ROLES = ['superadmin', 'dpa'];
const RBAC_EDIT_ROLES = ['legal_counsel'];
const LEGACY_ADMIN_ROLES = ['dpa', 'shore_management'];

export interface ResolveLegalAccessInput {
  /** False until the RBAC store has loaded; nothing is granted before then. */
  rbacInitialized: boolean;
  rbacRoles: string[];
  legalPermission: ModulePermission | null | undefined;
  legacyRole: string | null | undefined;
  /** Whether a signed-in user exists at all. */
  signedIn?: boolean;
}

const build = (level: LegalAccessLevel): LegalAccess => ({
  level,
  canView: level === 'view' || level === 'edit' || level === 'admin',
  canEdit: level === 'edit' || level === 'admin',
  canAdmin: level === 'admin',
  selfOnly: level === 'self',
});

export function resolveLegalAccess(input: ResolveLegalAccessInput): LegalAccess {
  const signedIn = input.signedIn ?? true;
  if (!signedIn) return build('none');
  if (!input.rbacInitialized) return build('self');

  const roles = new Set(input.rbacRoles.map((r) => r.toLowerCase()));
  const legacy = input.legacyRole?.toLowerCase() ?? null;
  const perm = input.legalPermission ?? null;
  const permIsSelf = perm?.scope === 'self';

  if (RBAC_ADMIN_ROLES.some((r) => roles.has(r))) return build('admin');
  if (perm?.can_admin && !permIsSelf) return build('admin');
  if (legacy && LEGACY_ADMIN_ROLES.includes(legacy)) return build('admin');

  if (RBAC_EDIT_ROLES.some((r) => roles.has(r))) return build('edit');
  if (perm?.can_edit && !permIsSelf) return build('edit');

  if (perm?.can_view && !permIsSelf) return build('view');

  return build('self');
}

export const legalAccessSatisfies = (access: LegalAccess, required: 'view' | 'edit' | 'admin'): boolean => {
  if (required === 'admin') return access.canAdmin;
  if (required === 'edit') return access.canEdit;
  return access.canView;
};
