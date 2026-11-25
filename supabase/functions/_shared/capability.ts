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
 *
 * `assertCapabilityForVessels(ctx, key, companyId, vesselIds)` asserts the
 * key for every vessel of a set (with none, once without a vessel). A
 * vessel-scoped administrator (the key holds without a vessel, not for this
 * one) gets 403 `forbidden` `details.reason: out_of_reach`.
 *
 * `assertMayActOnUser(ctx, target)` is the one edge check of the D-194 /
 * D-195 / D-207 rule "this admin may act on this person": the service-role
 * `admin_may_act_on_user()` (every structural vessel of the target is in the
 * admin's reach, or the admin administers every vessel), then, for an
 * administrator target, the service-role `user_manages_admins_for()`. Every
 * edge path that acts on a person calls it (invitations, admin-actions);
 * nothing else calls `admin_may_act_on_user` directly.
 */
import type { AuthContext } from './auth.ts';
import { asRow, bool, isMissingFunction, type Row, rowsOf, text } from './db.ts';
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

// ---- a set of vessels ---------------------------------------------------------------------------

/** 403 `out_of_reach` (D-194): the person is on a vessel the caller does not administer. */
export const OUT_OF_REACH = (): HttpError =>
  new HttpError(403, 'forbidden', 'You can only do this for people on the vessels you administer.', { reason: 'out_of_reach' });

/** 403 `manages_admins_required` (D-195, gap/01 F23): an administrator target needs a manager of administrators. */
export const MANAGES_ADMINS_REQUIRED = (): HttpError =>
  new HttpError(403, 'forbidden', 'Only an administrator who manages administrators can do this for an administrator.', {
    reason: 'manages_admins_required',
  });

/**
 * `assertCapability(ctx, key, { companyId, vesselId })` for every vessel in
 * `vesselIds` (all must pass); with none, once with no vessel. A denial for
 * one vessel when the caller holds the key without a vessel (a
 * vessel-scoped administrator: SQL `has_capability` passes a NULL vessel for
 * any users-access writer) is `OUT_OF_REACH`; any other denial is the plain
 * 403 of `assertCapability`.
 */
export async function assertCapabilityForVessels(
  ctx: AuthContext,
  key: CapabilityKey,
  companyId: string | null,
  vesselIds: readonly string[],
): Promise<void> {
  if (vesselIds.length === 0) {
    await assertCapability(ctx, key, { companyId, vesselId: null });
    return;
  }
  for (const vesselId of new Set(vesselIds)) {
    try {
      await assertCapability(ctx, key, { companyId, vesselId });
    } catch (err) {
      if (err instanceof HttpError && err.status === 403 && err.code === 'forbidden' && (await hasCapability(ctx, key, { companyId, vesselId: null }))) {
        throw OUT_OF_REACH();
      }
      throw err;
    }
  }
}

// ---- acting on a person (D-194, D-195, D-207) -----------------------------------------------------

/** The person an admin acts on. */
export interface ActTarget {
  /** The target's company (`profiles.company_id`): must be the caller's. */
  companyId: string | null;
  /** The target's login, when there is one. */
  userId: string | null;
  profileId: string;
  /** `profiles.role`: dpa / shore_management are administrators. */
  role?: string | null;
  /** The invitation kind: admin / owner invitations are for administrators. */
  kind?: string | null;
}

const ADMIN_TARGET_KINDS = new Set(['admin', 'owner']);

/**
 * The D-194 / D-207 rule, after the action's own capability check:
 * 1. the target's company must be the caller's (another → 403
 *    `cross_company`; none → 403 `forbidden`);
 * 2. service-role `admin_may_act_on_user(_actor, _target_user, _company,
 *    _target_profile)`: true passes, false → 403 `out_of_reach`. D-01
 *    (function missing): `legacyMayActOnUser`. Any other error → 503;
 * 3. an administrator target (role dpa / shore_management, kind admin /
 *    owner, or the service-role `user_is_admin_target()`; D-01: role / kind
 *    only) needs the service-role `user_manages_admins_for()` (D-01:
 *    `legacyManagesAdmins`) → else 403 `manages_admins_required`; an error
 *    → 503.
 */
export async function assertMayActOnUser(ctx: AuthContext, target: ActTarget): Promise<void> {
  const companyId = target.companyId;
  if (!companyId || !ctx.companyId) throw new HttpError(403, 'forbidden', 'You do not have permission to do that.');
  if (companyId !== ctx.companyId) throw new HttpError(403, 'cross_company', 'That belongs to another account.');
  const service = ctx.serviceClient();

  const may = await service.rpc('admin_may_act_on_user', {
    _actor: ctx.user.id,
    _target_user: target.userId,
    _company: companyId,
    _target_profile: target.profileId,
  });
  if (may.error) {
    if (!isMissingFunction(may.error)) throw UNAVAILABLE();
    if (!(await legacyMayActOnUser(ctx, target, companyId))) throw OUT_OF_REACH();
  } else if (may.data !== true) {
    throw OUT_OF_REACH();
  }

  if (await isAdminTarget(ctx, target, companyId)) {
    const manages = await service.rpc('user_manages_admins_for', { _user_id: ctx.user.id, _company_id: companyId });
    if (manages.error) {
      if (!isMissingFunction(manages.error)) throw UNAVAILABLE();
      if (!(await legacyManagesAdmins(ctx))) throw MANAGES_ADMINS_REQUIRED();
    } else if (manages.data !== true) {
      throw MANAGES_ADMINS_REQUIRED();
    }
  }
}

async function isAdminTarget(ctx: AuthContext, target: ActTarget, companyId: string): Promise<boolean> {
  if (LEGACY_ADMIN_PROFILE_ROLES.has((target.role ?? '').toLowerCase())) return true;
  if (ADMIN_TARGET_KINDS.has((target.kind ?? '').toLowerCase())) return true;
  if (!target.userId) return false;
  const res = await ctx.serviceClient().rpc('user_is_admin_target', { _user_id: target.userId, _company_id: companyId });
  if (res.error) {
    if (!isMissingFunction(res.error)) throw UNAVAILABLE();
    return false; // D-01: the role and the kind decide
  }
  return res.data === true;
}

/**
 * Who manages administrators without `user_manages_admins_for` (D-01; the
 * W7 legacy guard admin-actions used): the caller's profile role dpa, or an
 * active, unexpired `user_roles` dpa / superadmin row of the caller's
 * company or of no company (CC-5).
 */
export async function legacyManagesAdmins(ctx: AuthContext): Promise<boolean> {
  const profile = await ctx.userClient.from('profiles').select('role').eq('user_id', ctx.user.id).maybeSingle();
  if (profile.error) throw UNAVAILABLE();
  if ((text(asRow(profile.data), 'role') ?? '').toLowerCase() === 'dpa') return true;
  const roles = await ctx.userClient.from('user_roles').select('role, company_id, is_active, expires_at').eq('user_id', ctx.user.id);
  if (roles.error) throw UNAVAILABLE();
  const now = Date.now();
  return rowsOf(roles.data).some((r) => {
    const expires = text(r, 'expires_at');
    const company = text(r, 'company_id');
    return LEGACY_ADMIN_RBAC_ROLES.has((text(r, 'role') ?? '').toLowerCase()) && bool(r, 'is_active') === true &&
      (expires === null || Date.parse(expires) > now) && (company === null || company === ctx.companyId);
  });
}

/** A vessel that counts for reach: set status, not Sold, not archived (SQL `vessel_in_reachable_state`). */
function reachable(row: Row): boolean {
  const status = text(row, 'status');
  return status !== null && status !== 'Sold' && text(row, 'lifecycle_status') !== 'archived';
}

/** Of `ids`, the vessels of `companyId` in a reachable state (service read; an error is 503). */
async function companyVessels(ctx: AuthContext, companyId: string, ids: readonly string[]): Promise<Set<string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Set();
  const res = await ctx.serviceClient().from('vessels').select('id, company_id, status, lifecycle_status').in('id', unique);
  if (res.error) throw UNAVAILABLE();
  const out = new Set<string>();
  for (const row of rowsOf(res.data)) {
    const id = text(row, 'id');
    if (id && text(row, 'company_id') === companyId && reachable(row)) out.add(id);
  }
  return out;
}

/** The vessels of `userId`'s current crew assignments (service read; an error is 503). */
async function currentAssignmentVessels(ctx: AuthContext, userId: string): Promise<string[]> {
  const res = await ctx.serviceClient().from('crew_assignments').select('vessel_id').eq('user_id', userId).eq('is_current', true).limit(50);
  if (res.error) throw UNAVAILABLE();
  return rowsOf(res.data).map((r) => text(r, 'vessel_id')).filter((v): v is string => v !== null);
}

/**
 * `admin_may_act_on_user` for a database without it (D-01): a full legacy
 * admin (`legacyCapability` users_access.admin) passes; otherwise only a
 * target that is not dpa / shore_management whose structural vessels (the
 * current assignments of the login on vessels of the company; for a profile
 * without a login, `imported_vessel_id` while `is_imported`) are non-empty
 * and every one a vessel the caller currently reaches (an own current
 * assignment, the vessel not Sold). That keeps today's legacy-master
 * invitation for their own vessel (D-125). Every read is the service
 * client's (the caller's RLS view never decides a vessel); an error is 503.
 */
async function legacyMayActOnUser(ctx: AuthContext, target: ActTarget, companyId: string): Promise<boolean> {
  if (await legacyCapability(ctx, 'admin.access.users_access.admin', { companyId })) return true;
  if (LEGACY_ADMIN_PROFILE_ROLES.has((target.role ?? '').toLowerCase())) return false;

  const service = ctx.serviceClient();
  const profileRes = await service
    .from('profiles')
    .select('id, user_id, company_id, role, is_imported, imported_vessel_id')
    .eq('id', target.profileId)
    .maybeSingle();
  if (profileRes.error) throw UNAVAILABLE();
  const profile = asRow(profileRes.data);
  if (!profile || text(profile, 'company_id') !== companyId) return false;
  if (LEGACY_ADMIN_PROFILE_ROLES.has((text(profile, 'role') ?? '').toLowerCase())) return false;

  const userId = target.userId ?? text(profile, 'user_id');
  let candidates: string[] = [];
  if (userId) {
    candidates = await currentAssignmentVessels(ctx, userId);
  } else if (bool(profile, 'is_imported') === true) {
    const imported = text(profile, 'imported_vessel_id');
    if (imported) candidates = [imported];
  }
  const structural = await companyVessels(ctx, companyId, candidates);
  if (structural.size === 0) return false;
  const reach = await companyVessels(ctx, companyId, await currentAssignmentVessels(ctx, ctx.user.id));
  return [...structural].every((v) => reach.has(v));
}
