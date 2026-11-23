/**
 * Server-side capability checks for edge functions (Phase 2 spec §A.4,
 * §C.1; gap/00 C6; DECISIONS D-04).
 *
 * `assertCapability(ctx, key, scope)` calls the SQL `has_capability(p_key,
 * p_company_id, p_vessel_id)` as the caller (RLS-scoped client). When that
 * RPC is not in the database yet (D-01) it evaluates the same legacy rule
 * the SQL function's legacy branch uses (`legacyCapability`), from live
 * tables and RPCs only. Fails closed: an unknown key, a company that is not
 * the caller's, a missing company, or a denial is 403; an error while
 * checking is 503 `status_unavailable` (never "assume allowed").
 */
import type { AuthContext } from './auth.ts';
import { asRow, bool, isMissingFunction, rowsOf, text } from './db.ts';
import { HttpError } from './http.ts';

/** Every key `has_capability` answers in Phase 2 (spec §A.4). Anything else is false. */
export const CAPABILITY_KEYS = [
  'admin.access.users_access.view',
  'admin.access.users_access.assign',
  'admin.access.users_access.admin',
  'admin.access.roles_permissions.admin',
  'admin.access.permission_audit_log.view',
  'fleet.operations.vessels.view',
  'fleet.operations.vessels.admin',
] as const;
export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

export interface CapabilityScope {
  /**
   * The company the action touches. Omitted (`undefined`) = the caller's
   * company. An explicit `null` (e.g. a target row without a company) never
   * passes; any other company than the caller's is refused before the check.
   */
  companyId?: string | null;
  vesselId?: string | null;
}

const LEGACY_ADMIN_PROFILE_ROLES = new Set(['dpa', 'shore_management']);
const LEGACY_ADMIN_RBAC_ROLES = new Set(['superadmin', 'dpa']);
/** D-26 fleet reach through an RBAC role name (besides fleet-wide default scope). */
const LEGACY_FLEET_RBAC_ROLES = new Set(['superadmin', 'dpa', 'fleet_master']);

const UNAVAILABLE = (): HttpError => new HttpError(503, 'status_unavailable', 'Your access could not be checked. Try again.');

export function isCapabilityKey(key: string): key is CapabilityKey {
  return (CAPABILITY_KEYS as readonly string[]).includes(key);
}

function scopeCompany(ctx: AuthContext, scope: CapabilityScope): string | null {
  return scope.companyId === undefined ? ctx.companyId : scope.companyId;
}

export async function hasCapability(ctx: AuthContext, key: CapabilityKey, scope: CapabilityScope = {}): Promise<boolean> {
  if (!isCapabilityKey(key)) return false;
  const companyId = scopeCompany(ctx, scope);
  if (!companyId || !ctx.companyId || companyId !== ctx.companyId) return false;

  const { data, error } = await ctx.userClient.rpc('has_capability', {
    p_key: key,
    p_company_id: companyId,
    p_vessel_id: scope.vesselId ?? null,
  });
  if (!error) return data === true;
  if (!isMissingFunction(error)) throw UNAVAILABLE();
  return legacyCapability(ctx, key, { companyId, vesselId: scope.vesselId ?? null });
}

export async function assertCapability(ctx: AuthContext, key: CapabilityKey, scope: CapabilityScope = {}): Promise<void> {
  const companyId = scopeCompany(ctx, scope);
  if (companyId && ctx.companyId && companyId !== ctx.companyId) {
    throw new HttpError(403, 'cross_company', 'That belongs to another account.');
  }
  if (!(await hasCapability(ctx, key, scope))) {
    throw new HttpError(403, 'forbidden', 'You do not have permission to do that.');
  }
}

interface RbacRole {
  name: string;
  fleetWide: boolean;
}

async function legacyRbacRoles(ctx: AuthContext): Promise<RbacRole[]> {
  // get_user_roles_full returns active, in-date rbac_user_roles rows only (live definition).
  const roles = await ctx.userClient.rpc('get_user_roles_full', { p_user_id: ctx.user.id });
  if (roles.error) throw UNAVAILABLE();
  return rowsOf(roles.data).map((r) => ({
    name: (text(r, 'role_name') ?? '').toLowerCase(),
    fleetWide: bool(r, 'is_fleet_wide') === true,
  }));
}

/**
 * The caller can reach `vesselId` under the D-26 legacy rules a master needs:
 * a current crew assignment on that vessel, and the vessel is one of the
 * caller's company's vessels in a reachable state (status set and not Sold).
 */
async function legacyVesselReach(ctx: AuthContext, vesselId: string): Promise<boolean> {
  const assignment = await ctx.userClient
    .from('crew_assignments')
    .select('id')
    .eq('user_id', ctx.user.id)
    .eq('vessel_id', vesselId)
    .eq('is_current', true)
    .limit(1);
  if (assignment.error) throw UNAVAILABLE();
  if (rowsOf(assignment.data).length === 0) return false;
  const vessel = await ctx.userClient.from('vessels').select('id, company_id, status').eq('id', vesselId).maybeSingle();
  if (vessel.error) throw UNAVAILABLE();
  const row = asRow(vessel.data);
  const status = text(row, 'status');
  return !!row && text(row, 'company_id') === ctx.companyId && status !== null && status !== 'Sold';
}

/**
 * The legacy rule (spec §A.4 `legacy_user_admin`), for databases without
 * `has_capability`: legacy profile role dpa / shore_management, an active,
 * unexpired `user_roles` dpa / superadmin row of the caller's company (or
 * with no company: a row naming another company never counts, CC-5/CC-20),
 * an active, in-date RBAC role superadmin / dpa, or RBAC `settings` at
 * admin. That is today's admin-actions gate. `assign` also admits a legacy
 * master for a vessel in their reach; `fleet.operations.vessels.view` admits
 * D-26 fleet reach or reach of the given vessel; `roles_permissions.admin`
 * is never granted to a tenant. Callers have already checked that the scope
 * company is the caller's own.
 */
export async function legacyCapability(ctx: AuthContext, key: CapabilityKey, scope: CapabilityScope): Promise<boolean> {
  if (!isCapabilityKey(key) || key === 'admin.access.roles_permissions.admin') return false;
  const companyId = scopeCompany(ctx, scope);
  if (!companyId || !ctx.companyId || companyId !== ctx.companyId) return false;

  const profile = await ctx.userClient.from('profiles').select('role').eq('user_id', ctx.user.id).maybeSingle();
  if (profile.error) throw UNAVAILABLE();
  const role = (text(asRow(profile.data), 'role') ?? '').toLowerCase();

  let admin = LEGACY_ADMIN_PROFILE_ROLES.has(role);
  if (!admin) {
    const appRoles = await ctx.userClient
      .from('user_roles')
      .select('role, company_id, is_active, expires_at')
      .eq('user_id', ctx.user.id);
    if (appRoles.error) throw UNAVAILABLE();
    const now = Date.now();
    admin = rowsOf(appRoles.data).some((r) => {
      const expires = text(r, 'expires_at');
      const rowCompany = text(r, 'company_id');
      return (
        LEGACY_ADMIN_RBAC_ROLES.has((text(r, 'role') ?? '').toLowerCase()) &&
        bool(r, 'is_active') === true &&
        (expires === null || Date.parse(expires) > now) &&
        (rowCompany === null || rowCompany === ctx.companyId)
      );
    });
  }
  let rbac: RbacRole[] | null = null;
  if (!admin) {
    rbac = await legacyRbacRoles(ctx);
    admin = rbac.some((r) => LEGACY_ADMIN_RBAC_ROLES.has(r.name));
  }
  if (!admin) {
    const settings = await ctx.userClient.rpc('user_has_permission', {
      p_user_id: ctx.user.id,
      p_module_key: 'settings',
      p_permission: 'admin',
    });
    if (settings.error) throw UNAVAILABLE();
    admin = settings.data === true;
  }
  if (admin) return true;

  const vesselId = scope.vesselId ?? null;
  switch (key) {
    case 'admin.access.users_access.assign':
      return role === 'master' && !!vesselId && (await legacyVesselReach(ctx, vesselId));
    case 'fleet.operations.vessels.view': {
      const roles = rbac ?? (await legacyRbacRoles(ctx));
      if (roles.some((r) => r.fleetWide || LEGACY_FLEET_RBAC_ROLES.has(r.name))) return true;
      return !!vesselId && (await legacyVesselReach(ctx, vesselId));
    }
    default:
      return false;
  }
}
