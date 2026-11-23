/**
 * A two-company test world for edge function tests (Deno only). Role
 * addresses on `example.test`, vessel names only, no personal data.
 *
 * `p3: true` = the Phase 2 P2/P3 migrations are applied: `my_account_status`,
 * `has_capability`, `record_invitation_send`, `auth_user_id_for_email` and
 * `set_membership_status` answer, `user_invitations` exists, and a disabled
 * user reads no rows at all (file 7). `p3: false` = today's live database:
 * those RPCs answer PGRST202 and `user_invitations` PGRST205 (D-01), so every
 * function takes its documented legacy branch.
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

function installP3Rpcs(world: FakeWorld): void {
  world.rpcs.my_account_status = (_args, caller, wd) => {
    const me = profileOf(wd, caller.userId);
    if (!me) return ok('no_profile');
    return ok(isDisabled(me) ? 'disabled' : 'active');
  };

  world.rpcs.has_capability = (args, caller, wd) => {
    const me = profileOf(wd, caller.userId);
    if (!me || isDisabled(me) || me.company_id !== args.p_company_id) return ok(false);
    const key = String(args.p_key);
    const vessel = args.p_vessel_id ?? null;
    if (vessel !== null && vesselCompany(wd, vessel) !== args.p_company_id) return ok(false);
    const fullAdmin = me.role === 'dpa' || me.role === 'shore_management';
    switch (key) {
      case 'admin.access.users_access.view':
      case 'admin.access.users_access.admin':
      case 'fleet.operations.vessels.admin':
      case 'admin.access.permission_audit_log.view':
        return ok(fullAdmin);
      case 'admin.access.users_access.assign':
        return ok(fullAdmin || (me.role === 'master' && vessel !== null && currentAssignment(wd, String(caller.userId), vessel)));
      case 'fleet.operations.vessels.view':
        return ok(fullAdmin || (vessel !== null && currentAssignment(wd, String(caller.userId), vessel)));
      default:
        return ok(false);
    }
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
    const rows = (wd.tables.user_invitations ??= []);
    let live = rows.find((r) => r.profile_id === profile.id && ['pending', 'sent', 'send_failed'].includes(String(r.status)));
    const at = wd.now().toISOString();
    if (!live) {
      live = { id: crypto.randomUUID(), company_id: profile.company_id, profile_id: profile.id, send_attempts: 0, status: 'pending', last_attempt_at: null, last_sent_at: null };
      rows.push(live);
    }
    Object.assign(live, {
      status: outcome,
      send_attempts: Number(live.send_attempts ?? 0) + 1,
      last_attempt_at: at,
      last_sent_at: outcome === 'sent' ? at : live.last_sent_at,
      last_error_code: outcome === 'sent' ? null : args.p_error_code,
      provider_message_id: args.p_provider_message_id ?? null,
      invited_by: args.p_invited_by ?? null,
      kind: args.p_kind ?? 'crew',
      user_id: args.p_user_id ?? live.user_id ?? null,
    });
    if (args.p_user_id && !profile.user_id) profile.user_id = args.p_user_id;
    if (outcome === 'sent') {
      if (!['active', 'disabled'].includes(String(profile.account_status))) profile.account_status = 'invited';
      profile.last_invited_at = at;
      profile.invited_at ??= at;
      profile.invitation_count = Number(profile.invitation_count ?? 0) + 1;
    }
    return ok({ ...live });
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
