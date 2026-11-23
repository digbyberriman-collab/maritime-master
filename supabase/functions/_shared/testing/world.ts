/**
 * A two-company test world for edge function tests (Deno only). Role
 * addresses on `example.test`, vessel names only, no personal data.
 *
 * `p3: true` = the Phase 2 P2/P3 migrations are applied: `my_account_status`,
 * `has_capability`, `reserve_invitation_attempt`, `record_invitation_send`,
 * `revoke_invitation`, `auth_user_id_for_email`, `set_membership_status`,
 * `fulfil_imported_assignment` and `invitation_withdrawn_for` answer,
 * `user_invitations` exists, and a disabled user reads no rows at all
 * (file 7). `p3: false` = today's live database: those RPCs answer PGRST202
 * and `user_invitations` PGRST205 (D-01), so every function takes its
 * documented legacy branch.
 *
 * The invitation fakes follow the SQL contracts: the reservation locks the
 * profile's live row, applies the 5 min (after a send) / 30 s (after a
 * failed send) cooldown, and increments `send_attempts` (monotonic across a
 * revoke: a new live row starts from the profile's highest count);
 * `record_invitation_send` records the outcome without incrementing, never
 * downgrades a `sent` row on `provider_duplicate`, a `sent` outcome
 * restores a removed membership, and once the profile has a login it calls
 * `fulfil_imported_assignment` (D-199: through `world.rpcs`, so a test that
 * replaces or deletes that function changes both); `revoke_invitation`
 * (users-access admin) also resets a never-signed-in `invited` profile to
 * `not_invited` and removes the never-accepted membership;
 * `invitation_withdrawn_for` answers true for a profile that is neither
 * invited nor active whose newest invitation is revoked or expired and was
 * never accepted.
 */
import type { EdgeEnv } from '../env.ts';
import { createWorld, fail, type Caller, type FakeAuthUser, type FakeResult, type FakeRow, type FakeWorld, ok } from './fakeSupabase.ts';

const id = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

export const CO_A = id(0xa0);
export const CO_B = id(0xb0);
export const V_A1 = id(0xa1);
export const V_A2 = id(0xa2);
export const V_A_SOLD = id(0xa3);
export const V_B1 = id(0xb1);

export interface Persona {
  key: string;
  userId: string | null;
  profileId: string;
  token: string | null;
  email: string;
  companyId: string;
  role: string;
  accountStatus: string;
}

function persona(n: number, key: string, companyId: string, role: string, opts: { login?: boolean; status?: string } = {}): Persona {
  const login = opts.login ?? true;
  return {
    key,
    userId: login ? id(0x1000 + n) : null,
    profileId: id(0x2000 + n),
    token: login ? `tok-${key}` : null,
    email: `${key}@example.test`,
    companyId,
    role,
    accountStatus: opts.status ?? (login ? 'active' : 'not_invited'),
  };
}

export const P = {
  adminA: persona(1, 'dpa-a', CO_A, 'dpa'),
  shoreA: persona(2, 'shore-a', CO_A, 'shore_management'),
  masterA: persona(3, 'master-a', CO_A, 'master'),
  crewA: persona(4, 'crew-a', CO_A, 'crew'),
  crewA2: persona(5, 'crew-a2', CO_A, 'crew'),
  importedA: persona(6, 'deckhand-a', CO_A, 'crew', { login: false }),
  disabledA: persona(7, 'disabled-a', CO_A, 'crew', { status: 'disabled' }),
  invitedA: persona(8, 'invited-a', CO_A, 'crew', { status: 'invited' }),
  adminB: persona(9, 'dpa-b', CO_B, 'dpa'),
  crewB: persona(10, 'crew-b', CO_B, 'crew'),
} as const;

/** An auth user with a valid token and no profile row. */
export const NO_PROFILE_USER = { userId: id(0x1fff), token: 'tok-no-profile', email: 'no-profile@example.test' };

export const TEST_ENV: EdgeEnv = {
  supabaseUrl: 'https://project.supabase.test',
  anonKey: 'anon-key',
  serviceRoleKey: 'service-role-key',
  siteUrl: 'https://app.storm.test',
  allowedOrigins: [],
  resendApiKey: 're_test_key_1234567890',
  emailFrom: 'STORM <no-reply@storm.test>',
};

export function envWith(patch: Partial<EdgeEnv>): EdgeEnv {
  return { ...TEST_ENV, ...patch };
}

export interface WorldOptions {
  p3?: boolean;
  /** Clock used by the fake for timestamps. */
  now?: () => Date;
}

function profileOf(world: FakeWorld, userId: string | null): FakeRow | undefined {
  if (!userId) return undefined;
  return (world.tables.profiles ?? []).find((p) => p.user_id === userId);
}

const isDisabled = (p: FakeRow | undefined): boolean => ['disabled', 'deactivated'].includes(String(p?.account_status ?? '').toLowerCase());

function vesselCompany(world: FakeWorld, vesselId: unknown): unknown {
  return (world.tables.vessels ?? []).find((v) => v.id === vesselId)?.company_id;
}

function currentAssignment(world: FakeWorld, userId: string, vesselId: unknown): boolean {
  return (world.tables.crew_assignments ?? []).some((a) => a.user_id === userId && a.vessel_id === vesselId && a.is_current === true);
}

export function buildWorld(options: WorldOptions = {}): FakeWorld {
  const p3 = options.p3 ?? false;
  const now = options.now ?? (() => new Date('2026-11-23T10:00:00Z'));
  const personas = Object.values(P);

  const authUsers: FakeAuthUser[] = personas
    .filter((p) => p.userId)
    .map((p) => ({
      id: p.userId as string,
      email: p.email,
      email_confirmed_at: p.accountStatus === 'invited' ? null : '2026-01-01T00:00:00Z',
      banned_until: null,
    }));
  authUsers.push({ id: NO_PROFILE_USER.userId, email: NO_PROFILE_USER.email, email_confirmed_at: '2026-01-01T00:00:00Z' });

  const tokens: Record<string, string> = { [NO_PROFILE_USER.token]: NO_PROFILE_USER.userId };
  for (const p of personas) if (p.token && p.userId) tokens[p.token] = p.userId;

  const world = createWorld({
    now,
    authUsers,
    tokens,
    tables: {
      companies: [
        { id: CO_A, name: 'Demo Fleet A' },
        { id: CO_B, name: 'Demo Fleet B' },
      ],
      vessels: [
        { id: V_A1, company_id: CO_A, name: 'Aurora', status: 'Active' },
        { id: V_A2, company_id: CO_A, name: 'Borealis', status: 'Active' },
        { id: V_A_SOLD, company_id: CO_A, name: 'Cirrus', status: 'Sold' },
        { id: V_B1, company_id: CO_B, name: 'Draak', status: 'Active' },
      ],
      profiles: personas.map((p) => ({
        id: p.profileId,
        user_id: p.userId,
        email: p.email,
        first_name: p.role === 'crew' ? 'Deckhand' : 'Officer',
        last_name: 'Example',
        company_id: p.companyId,
        role: p.role,
        account_status: p.accountStatus,
        imported_vessel_id: p.userId ? null : V_A1,
        is_imported: !p.userId,
        last_invited_at: null,
        invited_at: null,
        invitation_count: 0,
        invitation_token: null,
        invitation_token_expires: null,
      })),
      crew_assignments: [
        { id: id(0x3001), user_id: P.masterA.userId, vessel_id: V_A1, is_current: true, position: 'Master', join_date: '2026-01-01' },
        { id: id(0x3002), user_id: P.crewA.userId, vessel_id: V_A1, is_current: true, position: 'Deckhand', join_date: '2026-02-01' },
        { id: id(0x3003), user_id: P.crewA2.userId, vessel_id: V_A2, is_current: true, position: 'Deckhand', join_date: '2026-03-01' },
        { id: id(0x3004), user_id: P.invitedA.userId, vessel_id: V_A1, is_current: true, position: 'Steward', join_date: '2026-03-01' },
        { id: id(0x3005), user_id: P.disabledA.userId, vessel_id: V_A1, is_current: true, position: 'Deckhand', join_date: '2026-03-01' },
      ],
      user_roles: [],
      rbac_roles_full: [],
      user_invitations: [],
      account_memberships: [],
      admin_pins: [],
      admin_action_log: [],
      notification_logs: [],
    },
    missingTables: new Set(p3 ? [] : ['user_invitations', 'account_memberships']),
  });

  world.rls = (table, row, caller, w) => {
    const me = profileOf(w, caller.userId);
    if (p3 && isDisabled(me)) return false; // file 7: a disabled user reads nothing, not even their own row
    switch (table) {
      case 'profiles':
        return row.user_id === caller.userId || (!!me && row.company_id === me.company_id);
      case 'vessels':
        return !!me && row.company_id === me.company_id;
      case 'crew_assignments':
        return !!me && vesselCompany(w, row.vessel_id) === me.company_id;
      case 'companies':
        return !!me && row.id === me.company_id;
      case 'user_roles':
      case 'admin_pins':
        return row.user_id === caller.userId;
      case 'user_invitations':
        return !!me && row.company_id === me.company_id && ['dpa', 'shore_management'].includes(String(me.role));
      default:
        return false;
    }
  };

  // Live functions (present in both modes).
  world.rpcs.get_user_roles_full = (args) => ok((w(world).rbac_roles_full).filter((r) => r.user_id === args.p_user_id));
  world.rpcs.user_has_permission = () => ok(false);

  if (p3) installP3Rpcs(world);
  return world;
}

function w(world: FakeWorld): Record<string, FakeRow[]> {
  return world.tables;
}

const SERVICE_ONLY = (caller: Caller): FakeResult | null =>
  caller.role === 'service' ? null : fail('42501', 'permission denied for function', 403);

const LIVE = ['pending', 'sent', 'send_failed'];
export const INVITE_COOLDOWN_MS = 5 * 60_000;
export const INVITE_RETRY_COOLDOWN_MS = 30_000;

/**
 * `has_capability_for` as the SQL defines it: an active profile of the
 * company, and an admin profile role or an active, unexpired dpa / superadmin
 * `user_roles` row of that company or of no company (CC-5: another company's
 * row, or an expired one, never counts).
 */
export function fakeCapability(wd: FakeWorld, userId: string | null, key: string, companyId: unknown, vesselId: unknown = null): boolean {
  const me = profileOf(wd, userId);
  if (!userId || !me || isDisabled(me) || me.company_id !== companyId) return false;
  const vessel = vesselId ?? null;
  if (vessel !== null && vesselCompany(wd, vessel) !== companyId) return false;
  const now = wd.now().getTime();
  const roleRow = (wd.tables.user_roles ?? []).some((r) =>
    r.user_id === userId && ['dpa', 'superadmin'].includes(String(r.role).toLowerCase()) && r.is_active === true &&
    (r.expires_at === null || r.expires_at === undefined || Date.parse(String(r.expires_at)) > now) &&
    (r.company_id === null || r.company_id === undefined || r.company_id === companyId)
  );
  const fullAdmin = me.role === 'dpa' || me.role === 'shore_management' || roleRow;
  switch (key) {
    case 'admin.access.users_access.view':
    case 'admin.access.users_access.admin':
    case 'fleet.operations.vessels.admin':
    case 'admin.access.permission_audit_log.view':
      return fullAdmin;
    case 'admin.access.users_access.assign':
      return fullAdmin || (me.role === 'master' && vessel !== null && currentAssignment(wd, userId, vessel));
    case 'fleet.operations.vessels.view':
      return fullAdmin || (vessel !== null && currentAssignment(wd, userId, vessel));
    default:
      return false;
  }
}

function invitationRows(wd: FakeWorld): FakeRow[] {
  return (wd.tables.user_invitations ??= []);
}

export type FulfilAnswer = 'created' | 'exists' | 'none' | 'not_eligible';

/**
 * `fulfil_imported_assignment` as the SQL (D-199) defines it: a linked,
 * imported profile with `imported_vessel_id` and no current assignment at
 * all gets one current `crew_assignments` row on that vessel (its company's,
 * not Sold: else `not_eligible`, profile untouched), from its position (else
 * rank, else Crew; blank counts as missing) and `joining_date` (else today),
 * and the import flags are cleared. Anything else (not imported, no login,
 * already a current crew member) is `none` and changes nothing, so a second
 * call adds nothing.
 */
export function fakeFulfil(wd: FakeWorld, profile: FakeRow, actor: unknown): FulfilAnswer {
  const userId = profile.user_id;
  const vesselId = profile.imported_vessel_id;
  if (typeof userId !== 'string' || !userId || profile.is_imported !== true || !vesselId) return 'none';
  const rows = (wd.tables.crew_assignments ??= []);
  if (rows.some((a) => a.user_id === userId && a.is_current === true)) return 'none';
  const vessel = (wd.tables.vessels ?? []).find((v) => v.id === vesselId);
  if (!vessel || vessel.company_id !== profile.company_id || vessel.status === 'Sold') return 'not_eligible';
  const filled = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  rows.push({
    id: crypto.randomUUID(),
    user_id: userId,
    vessel_id: vesselId,
    position: filled(profile.position) ?? filled(profile.rank) ?? 'Crew',
    join_date: profile.joining_date ?? wd.now().toISOString().slice(0, 10),
    is_current: true,
    created_by: actor ?? null,
  });
  profile.is_imported = false;
  profile.imported_vessel_id = null;
  return 'created';
}

function installP3Rpcs(world: FakeWorld): void {
  world.rpcs.my_account_status = (_args, caller, wd) => {
    const me = profileOf(wd, caller.userId);
    if (!me) return ok('no_profile');
    return ok(isDisabled(me) ? 'disabled' : 'active');
  };

  world.rpcs.has_capability = (args, caller, wd) =>
    ok(fakeCapability(wd, caller.userId, String(args.p_key), args.p_company_id, args.p_vessel_id ?? null));

  world.rpcs.reserve_invitation_attempt = (args, caller, wd) => {
    const denied = SERVICE_ONLY(caller);
    if (denied) return denied;
    const profile = (wd.tables.profiles ?? []).find((p) => p.id === args.p_profile_id);
    if (!profile) return ok({ ok: false, code: 'not_found' });
    if (isDisabled(profile)) return ok({ ok: false, code: 'disabled' });
    const rows = invitationRows(wd);
    const now = wd.now().getTime();
    let live = rows.find((r) => r.profile_id === profile.id && LIVE.includes(String(r.status)));
    if (live) {
      const time = (k: string): number => (live && typeof live[k] === 'string' ? Date.parse(String(live[k])) : 0);
      const legacy = typeof profile.last_invited_at === 'string' ? Date.parse(profile.last_invited_at) : 0;
      const lastSent = Math.max(time('last_sent_at'), legacy);
      const lastAttempt = time('last_attempt_at');
      const attemptCooldown = live.status === 'send_failed' ? INVITE_RETRY_COOLDOWN_MS : INVITE_COOLDOWN_MS;
      const until = Math.max(lastSent > 0 ? lastSent + INVITE_COOLDOWN_MS : 0, lastAttempt > 0 ? lastAttempt + attemptCooldown : 0);
      if (until > now) return ok({ ok: false, code: 'cooldown', retry_after_seconds: Math.max(1, Math.ceil((until - now) / 1000)) });
    } else {
      const legacy = typeof profile.last_invited_at === 'string' ? Date.parse(profile.last_invited_at) : 0;
      if (legacy > 0 && legacy + INVITE_COOLDOWN_MS > now) {
        return ok({ ok: false, code: 'cooldown', retry_after_seconds: Math.max(1, Math.ceil((legacy + INVITE_COOLDOWN_MS - now) / 1000)) });
      }
      // Monotonic across revoke / expire: start from the profile's highest count so far.
      const carried = Math.max(
        Number(profile.invitation_count ?? 0),
        ...rows.filter((r) => r.profile_id === profile.id).map((r) => Number(r.send_attempts ?? 0)),
      );
      live = {
        id: crypto.randomUUID(), company_id: profile.company_id, profile_id: profile.id, user_id: profile.user_id ?? null,
        kind: args.p_kind ?? 'crew', status: 'pending', send_attempts: carried, last_attempt_at: null, last_sent_at: null,
        last_error_code: null, invited_by: args.p_invited_by ?? null, accepted_at: null, revoked_at: null, revoked_by: null,
      };
      rows.push(live);
    }
    live.send_attempts = Number(live.send_attempts ?? 0) + 1;
    live.last_attempt_at = new Date(now).toISOString();
    return ok({ ok: true, invitation_id: live.id, attempt: live.send_attempts });
  };

  world.rpcs.revoke_invitation = (args, caller, wd) => {
    const me = profileOf(wd, caller.userId);
    if (caller.role !== 'user' || !me || isDisabled(me)) return fail('42501', 'not_permitted');
    const inv = invitationRows(wd).find((r) => r.id === args.p_invitation_id);
    if (!inv) return fail('P0002', 'invitation_not_found');
    if (!fakeCapability(wd, caller.userId, 'admin.access.users_access.admin', inv.company_id)) return fail('42501', 'not_permitted');
    if (!LIVE.includes(String(inv.status))) return fail('P0002', 'invitation_not_live');
    const at = wd.now().toISOString();
    Object.assign(inv, { status: 'revoked', revoked_at: at, revoked_by: caller.userId });
    const profile = (wd.tables.profiles ?? []).find((p) => p.id === inv.profile_id);
    if (profile && profile.account_status === 'invited' && !profile.last_login_at) profile.account_status = 'not_invited';
    const userId = inv.user_id ?? profile?.user_id ?? null;
    for (const m of wd.tables.account_memberships ?? []) {
      if (userId && m.user_id === userId && m.company_id === inv.company_id && !m.accepted_at && m.status !== 'removed') {
        Object.assign(m, { status: 'removed', removed_at: at });
      }
    }
    return ok({ ...inv });
  };

  world.rpcs.auth_user_id_for_email = (args, caller, wd) => {
    const denied = SERVICE_ONLY(caller);
    if (denied) return denied;
    const email = String(args.p_email ?? '').trim().toLowerCase();
    return ok(wd.authUsers.find((u) => u.email.toLowerCase() === email)?.id ?? null);
  };

  world.rpcs.record_invitation_send = (args, caller, wd) => {
    const denied = SERVICE_ONLY(caller);
    if (denied) return denied;
    const profile = (wd.tables.profiles ?? []).find((p) => p.id === args.p_profile_id);
    if (!profile) return fail('P0002', 'invitation_profile_not_found');
    const outcome = String(args.p_outcome);
    if (outcome !== 'sent' && outcome !== 'send_failed') return fail('22023', 'invalid_outcome');
    if (outcome === 'send_failed' && !args.p_error_code) return fail('22023', 'error_code_required');
    const rows = invitationRows(wd);
    let live = rows.find((r) => r.profile_id === profile.id && LIVE.includes(String(r.status)));
    const at = wd.now().toISOString();
    if (!live) {
      // Called without a reservation (an older caller): the row starts at one attempt.
      live = { id: crypto.randomUUID(), company_id: profile.company_id, profile_id: profile.id, send_attempts: 1, status: 'pending', last_attempt_at: null, last_sent_at: null };
      rows.push(live);
    }
    // A duplicate-key answer is no reason to mark a delivered invitation as failed.
    if (outcome === 'send_failed' && args.p_error_code === 'provider_duplicate' && live.status === 'sent') return ok({ ...live });
    Object.assign(live, {
      status: outcome,
      last_attempt_at: at,
      last_sent_at: outcome === 'sent' ? at : live.last_sent_at,
      last_error_code: outcome === 'sent' ? null : args.p_error_code,
      provider_message_id: args.p_provider_message_id ?? null,
      invited_by: args.p_invited_by ?? null,
      kind: args.p_kind ?? 'crew',
      user_id: args.p_user_id ?? live.user_id ?? null,
    });
    if (args.p_user_id && !profile.user_id) profile.user_id = args.p_user_id;
    // D-199: a linked login gets its imported vessel (a send that failed but still linked it too).
    const fulfil = wd.rpcs.fulfil_imported_assignment;
    if (profile.user_id && fulfil) fulfil({ p_profile_id: profile.id, p_actor: args.p_invited_by ?? null }, { role: 'service', userId: null }, wd);
    if (outcome === 'sent') {
      if (!['active', 'disabled'].includes(String(profile.account_status))) profile.account_status = 'invited';
      profile.last_invited_at = at;
      profile.invited_at ??= at;
      profile.invitation_count = Number(profile.invitation_count ?? 0) + 1;
      const userId = profile.user_id ?? null;
      for (const m of wd.tables.account_memberships ?? []) {
        if (userId && m.user_id === userId && m.company_id === profile.company_id && m.status === 'removed' && !m.accepted_at) {
          Object.assign(m, { status: 'active', removed_at: null });
        }
      }
    }
    return ok({ ...live });
  };

  world.rpcs.fulfil_imported_assignment = (args, caller, wd) => {
    const denied = SERVICE_ONLY(caller);
    if (denied) return denied;
    const profile = (wd.tables.profiles ?? []).find((p) => p.id === args.p_profile_id);
    return ok(profile ? fakeFulfil(wd, profile, args.p_actor) : 'none');
  };

  world.rpcs.invitation_withdrawn_for = (args, caller, wd) => {
    const denied = SERVICE_ONLY(caller);
    if (denied) return denied;
    const profile = profileOf(wd, typeof args._user_id === 'string' ? args._user_id : null);
    if (!profile || ['invited', 'active'].includes(String(profile.account_status ?? '').toLowerCase())) return ok(false);
    const newest = invitationRows(wd).filter((r) => r.profile_id === profile.id || r.user_id === profile.user_id).at(-1);
    return ok(!!newest && ['revoked', 'expired'].includes(String(newest.status)) && !newest.accepted_at);
  };

  world.rpcs.set_membership_status = (args, caller, wd) => {
    const denied = SERVICE_ONLY(caller);
    if (denied) return denied;
    if (!args.p_actor) return fail('22023', 'actor_required');
    const status = String(args.p_status);
    if (status !== 'active' && status !== 'disabled') return fail('22023', 'invalid_status');
    if (args.p_actor === args.p_user_id) return fail('42501', 'You cannot change your own access.');
    const target = (wd.tables.profiles ?? []).find((p) => p.user_id === args.p_user_id);
    const actor = (wd.tables.profiles ?? []).find((p) => p.user_id === args.p_actor);
    if (!target || !actor || target.company_id !== actor.company_id) return fail('42501', 'You do not have permission to change this access.');
    if (['dpa', 'shore_management'].includes(String(target.role)) && actor.role !== 'dpa') {
      return fail('42501', 'Only an administrator who manages administrators can change this access.');
    }
    if (status === 'disabled' && !String(args.p_reason ?? '').trim()) return fail('22023', 'reason_required');
    target.account_status = status;
    (wd.tables.admin_action_log ??= []).push({ actor_user_id: args.p_actor, action_type: 'TOGGLE_ACCESS', target_user_id: args.p_user_id, reason: args.p_reason ?? null, source: 'rpc' });
    return ok({ id: crypto.randomUUID(), user_id: args.p_user_id, company_id: target.company_id, status });
  };
}

/** A request with a bearer token and a JSON body. */
export function request(token: string | null, body: unknown, init: { method?: string; headers?: Record<string, string> } = {}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request('https://project.supabase.test/functions/v1/fn', {
    method: init.method ?? 'POST',
    headers,
    body: init.method === 'OPTIONS' || init.method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** The parsed JSON body of a response, as a plain object. */
export async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  const value: unknown = await res.json();
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('response body is not an object');
  return value as Record<string, unknown>;
}

/** A nested object field of a response body (throws when absent, for test readability). */
export function obj(value: unknown, key: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object') throw new Error(`not an object at ${key}`);
  const inner = (value as Record<string, unknown>)[key];
  if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) throw new Error(`no object at ${key}`);
  return inner as Record<string, unknown>;
}

export function profileRow(world: FakeWorld, profileId: string): FakeRow {
  const row = (world.tables.profiles ?? []).find((p) => p.id === profileId);
  if (!row) throw new Error(`no profile ${profileId}`);
  return row;
}
