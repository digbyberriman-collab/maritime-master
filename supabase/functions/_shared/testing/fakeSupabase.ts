/**
 * A scripted, in-memory fake of the parts of `SupabaseClient` the edge
 * functions use (Phase 2 spec §C.1), for Deno tests only. Never imported by
 * a function entrypoint.
 *
 * - `auth.getUser(token)`: tokens map to users in `world.authUsers`.
 * - `from(table)`: `select / insert / update / upsert / delete` with `eq`,
 *   `neq`, `in`, `is`, `gt`, `gte`, `lt`, `lte`, `ilike` (`%` / `_`
 *   wildcards, `\` escapes), `order`, `limit`, `single`, `maybeSingle` over
 *   `world.tables` (mutable rows). A filter column may be a PostgREST JSON
 *   path `col->>key` (text of one key of a json column). A user client sees only
 *   the rows `world.rls(table, row, caller)` allows (emulated RLS); the
 *   service client sees everything. Tables listed in `world.missingTables`
 *   answer PGRST205 (D-01 "not live yet").
 * - `rpc(fn, args)`: handlers in `world.rpcs`; an unknown function answers
 *   PGRST202, exactly like PostgREST for a migration that is not applied.
 * - `auth.admin.{generateLink, getUserById, updateUserById, deleteUser,
 *   signOut}` over `world.authUsers`. Like the real auth server, every
 *   `generateLink` call issues a new one-time token (`world.linkSerial`), so
 *   two links for the same person differ; an `invite` link for a new address
 *   creates the login (`invited_at` now, one `email` identity, no password).
 *   A user's `identities` are public (as in the auth API); `password_set`
 *   is not (only the SQL fakes read it, as SQL reads `encrypted_password`).
 * - `world.hooks` can answer any call first (inject errors).
 * - Every call is recorded in `world.calls` for assertions.
 *
 * The one cast to `SupabaseClient` lives in `fakeClientFactory`: the fake is
 * structural, the real type is the library's.
 */
import type { SupabaseClient, SupabaseClientOptions } from 'npm:@supabase/supabase-js@2.49.2';
import type { ClientFactory } from '../auth.ts';

export type FakeRow = Record<string, unknown>;

export interface FakeError {
  code?: string;
  message: string;
  status?: number;
}

export interface FakeResult {
  data: unknown;
  error: FakeError | null;
  count?: number | null;
}

export type ClientRole = 'user' | 'service' | 'anon';

export interface Caller {
  role: ClientRole;
  /** `auth.uid()` of a user client (from its bearer token); null otherwise. */
  userId: string | null;
}

export interface FakeAuthUser {
  id: string;
  email: string;
  email_confirmed_at?: string | null;
  invited_at?: string | null;
  banned_until?: string | null;
  last_sign_in_at?: string | null;
  /** The login has a password (SQL `encrypted_password`); never in the auth API's user object. */
  password_set?: boolean;
  /** Auth identities (`provider` only); an invite-created login has one `email` identity. */
  identities?: Array<{ provider: string }>;
}

type FilterOp = 'eq' | 'neq' | 'in' | 'is' | 'gt' | 'gte' | 'lt' | 'lte' | 'ilike';

export interface Filter {
  column: string;
  op: FilterOp;
  value: unknown;
}

export interface QueryRecord {
  kind: 'query';
  caller: Caller;
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  columns: string | null;
  filters: Filter[];
  values: unknown;
  onConflict: string | null;
  single: 'one' | 'maybe' | null;
  limit: number | null;
  order: Array<{ column: string; ascending: boolean }>;
  returning: boolean;
  head: boolean;
}

export interface RpcRecord {
  kind: 'rpc';
  caller: Caller;
  fn: string;
  args: Record<string, unknown>;
}

export interface AdminRecord {
  kind: 'admin';
  caller: Caller;
  method: 'generateLink' | 'getUserById' | 'updateUserById' | 'deleteUser' | 'signOut';
  args: Record<string, unknown>;
}

export interface GetUserRecord {
  kind: 'getUser';
  token: string;
}

export type CallRecord = QueryRecord | RpcRecord | AdminRecord | GetUserRecord;

export type RpcHandler = (args: Record<string, unknown>, caller: Caller, world: FakeWorld) => FakeResult;

export interface FakeWorld {
  tables: Record<string, FakeRow[]>;
  missingTables: Set<string>;
  authUsers: FakeAuthUser[];
  /** Access token → auth user id. */
  tokens: Record<string, string>;
  rpcs: Record<string, RpcHandler>;
  /** Emulated RLS for user clients; default: everything visible. */
  rls: (table: string, row: FakeRow, caller: Caller, world: FakeWorld) => boolean;
  hooks: {
    query?: (q: QueryRecord, world: FakeWorld) => FakeResult | undefined;
    rpc?: (r: RpcRecord, world: FakeWorld) => FakeResult | undefined;
    admin?: (a: AdminRecord, world: FakeWorld) => FakeResult | undefined;
  };
  calls: CallRecord[];
  serviceKey: string;
  anonKey: string;
  /** Clock for timestamps the fake writes. */
  now: () => Date;
  /** Counter behind the one-time token of each generated link. */
  linkSerial: number;
}

export function createWorld(init: Partial<Omit<FakeWorld, 'calls'>> = {}): FakeWorld {
  return {
    tables: init.tables ?? {},
    missingTables: init.missingTables ?? new Set(),
    authUsers: init.authUsers ?? [],
    tokens: init.tokens ?? {},
    rpcs: init.rpcs ?? {},
    rls: init.rls ?? (() => true),
    hooks: init.hooks ?? {},
    calls: [],
    serviceKey: init.serviceKey ?? 'service-role-key',
    anonKey: init.anonKey ?? 'anon-key',
    now: init.now ?? (() => new Date()),
    linkSerial: init.linkSerial ?? 0,
  };
}

export const missingFunction = (fn: string): FakeResult => ({
  data: null,
  error: { code: 'PGRST202', message: `Could not find the function public.${fn} in the schema cache` },
});

export const missingTable = (table: string): FakeResult => ({
  data: null,
  error: { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` },
});

export const ok = (data: unknown): FakeResult => ({ data, error: null });
export const fail = (code: string, message = 'failed', status?: number): FakeResult => ({ data: null, error: { code, message, status } });

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return String(a) < String(b) ? -1 : 1;
}

/** A column value, or the text of `key` for a PostgREST JSON path `col->>key`. */
function columnValue(row: FakeRow, column: string): unknown {
  const path = /^([A-Za-z0-9_]+)->>([A-Za-z0-9_]+)$/.exec(column);
  if (!path) return row[column];
  const json = row[path[1]];
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return null;
  const v = (json as Record<string, unknown>)[path[2]];
  return v === null || v === undefined ? null : typeof v === 'string' ? v : JSON.stringify(v);
}

/** SQL ILIKE: `%` any run, `_` one character, `\` escapes the next one; case-insensitive. */
function ilike(value: string, pattern: string): boolean {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\' && i + 1 < pattern.length) re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (c === '%') re += '.*';
    else if (c === '_') re += '.';
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'is').test(value);
}

function matches(row: FakeRow, f: Filter): boolean {
  const v = columnValue(row, f.column);
  switch (f.op) {
    case 'eq':
      return v !== null && v !== undefined && String(v) === String(f.value);
    case 'neq':
      return v !== null && v !== undefined && String(v) !== String(f.value);
    case 'in':
      return Array.isArray(f.value) && v !== null && v !== undefined && f.value.map(String).includes(String(v));
    case 'is':
      return f.value === null ? v === null || v === undefined : v === f.value;
    case 'gt':
      return v !== null && v !== undefined && compare(v, f.value) > 0;
    case 'gte':
      return v !== null && v !== undefined && compare(v, f.value) >= 0;
    case 'lt':
      return v !== null && v !== undefined && compare(v, f.value) < 0;
    case 'lte':
      return v !== null && v !== undefined && compare(v, f.value) <= 0;
    case 'ilike':
      return v !== null && v !== undefined && typeof f.value === 'string' && ilike(String(v), f.value);
  }
}

class FakeQuery implements PromiseLike<FakeResult> {
  private q: QueryRecord;

  constructor(private world: FakeWorld, caller: Caller, table: string) {
    this.q = {
      kind: 'query',
      caller,
      table,
      op: 'select',
      columns: null,
      filters: [],
      values: null,
      onConflict: null,
      single: null,
      limit: null,
      order: [],
      returning: false,
      head: false,
    };
  }

  select(columns = '*', options: { count?: string; head?: boolean } = {}): this {
    if (this.q.op === 'select') this.q.columns = columns;
    else this.q.returning = true;
    if (options.head) this.q.head = true;
    return this;
  }
  insert(values: unknown): this {
    this.q.op = 'insert';
    this.q.values = values;
    return this;
  }
  update(values: unknown): this {
    this.q.op = 'update';
    this.q.values = values;
    return this;
  }
  upsert(values: unknown, options: { onConflict?: string } = {}): this {
    this.q.op = 'upsert';
    this.q.values = values;
    this.q.onConflict = options.onConflict ?? 'id';
    return this;
  }
  delete(): this {
    this.q.op = 'delete';
    return this;
  }
  private filter(column: string, op: FilterOp, value: unknown): this {
    this.q.filters.push({ column, op, value });
    return this;
  }
  eq(column: string, value: unknown): this {
    return this.filter(column, 'eq', value);
  }
  neq(column: string, value: unknown): this {
    return this.filter(column, 'neq', value);
  }
  in(column: string, value: unknown[]): this {
    return this.filter(column, 'in', value);
  }
  is(column: string, value: unknown): this {
    return this.filter(column, 'is', value);
  }
  gt(column: string, value: unknown): this {
    return this.filter(column, 'gt', value);
  }
  gte(column: string, value: unknown): this {
    return this.filter(column, 'gte', value);
  }
  lt(column: string, value: unknown): this {
    return this.filter(column, 'lt', value);
  }
  lte(column: string, value: unknown): this {
    return this.filter(column, 'lte', value);
  }
  ilike(column: string, pattern: string): this {
    return this.filter(column, 'ilike', pattern);
  }
  order(column: string, options: { ascending?: boolean } = {}): this {
    this.q.order.push({ column, ascending: options.ascending ?? true });
    return this;
  }
  limit(n: number): this {
    this.q.limit = n;
    return this;
  }
  single(): PromiseLike<FakeResult> {
    this.q.single = 'one';
    return this;
  }
  maybeSingle(): PromiseLike<FakeResult> {
    this.q.single = 'maybe';
    return this;
  }

  then<A = FakeResult, B = never>(
    onfulfilled?: ((value: FakeResult) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.execute())
      .then(onfulfilled, onrejected);
  }

  private execute(): FakeResult {
    const q = this.q;
    const world = this.world;
    world.calls.push(structuredClone(q));
    const hooked = world.hooks.query?.(q, world);
    if (hooked) return hooked;
    if (world.missingTables.has(q.table)) return missingTable(q.table);
    const rows = (world.tables[q.table] ??= []);
    const visible = (r: FakeRow) => q.caller.role === 'service' || world.rls(q.table, r, q.caller, world);
    const matched = () => rows.filter((r) => visible(r) && q.filters.every((f) => matches(r, f)));

    let out: FakeRow[];
    switch (q.op) {
      case 'select': {
        out = matched();
        for (const o of [...q.order].reverse()) {
          out = [...out].sort((a, b) => (o.ascending ? 1 : -1) * compare(columnValue(a, o.column), columnValue(b, o.column)));
        }
        if (q.limit !== null) out = out.slice(0, q.limit);
        if (q.head) return { data: null, error: null, count: out.length };
        break;
      }
      case 'insert': {
        const values = (Array.isArray(q.values) ? q.values : [q.values]) as FakeRow[];
        out = values.map((v) => ({ id: crypto.randomUUID(), created_at: world.now().toISOString(), ...v }));
        rows.push(...out);
        break;
      }
      case 'update': {
        out = matched();
        for (const r of out) Object.assign(r, q.values as FakeRow);
        break;
      }
      case 'upsert': {
        const keys = (q.onConflict ?? 'id').split(',').map((k) => k.trim());
        const values = (Array.isArray(q.values) ? q.values : [q.values]) as FakeRow[];
        out = [];
        for (const v of values) {
          const existing = rows.find((r) => keys.every((k) => r[k] !== undefined && r[k] === v[k]));
          if (existing) {
            Object.assign(existing, v);
            out.push(existing);
          } else {
            const row = { id: crypto.randomUUID(), created_at: world.now().toISOString(), ...v };
            rows.push(row);
            out.push(row);
          }
        }
        break;
      }
      case 'delete': {
        out = matched();
        world.tables[q.table] = rows.filter((r) => !out.includes(r));
        break;
      }
    }
    if (q.op !== 'select' && !q.returning) return { data: null, error: null };
    const copies = out.map((r) => ({ ...r }));
    if (q.single === 'one') {
      return copies.length === 1 ? ok(copies[0]) : fail('PGRST116', 'JSON object requested, multiple (or no) rows returned', 406);
    }
    if (q.single === 'maybe') {
      if (copies.length > 1) return fail('PGRST116', 'JSON object requested, multiple rows returned', 406);
      return ok(copies[0] ?? null);
    }
    return ok(copies);
  }
}

function findUserByEmail(world: FakeWorld, email: string): FakeAuthUser | undefined {
  const e = email.trim().toLowerCase();
  return world.authUsers.find((u) => u.email.toLowerCase() === e);
}

function publicUser(u: FakeAuthUser): Record<string, unknown> {
  return {
    id: u.id,
    email: u.email,
    email_confirmed_at: u.email_confirmed_at ?? null,
    confirmed_at: u.email_confirmed_at ?? null,
    invited_at: u.invited_at ?? null,
    banned_until: u.banned_until ?? null,
    last_sign_in_at: u.last_sign_in_at ?? null,
    identities: (u.identities ?? []).map((i) => ({ provider: i.provider })),
  };
}

function authError(message: string, status: number, code: string): { message: string; status: number; code: string; name: string } {
  return { message, status, code, name: 'AuthApiError' };
}

export class FakeClient {
  readonly caller: Caller;

  constructor(private world: FakeWorld, caller: Caller) {
    this.caller = caller;
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this.world, this.caller, table);
  }

  rpc(fn: string, args: Record<string, unknown> = {}): Promise<FakeResult> {
    const world = this.world;
    const record: RpcRecord = { kind: 'rpc', caller: this.caller, fn, args: structuredClone(args) };
    world.calls.push(record);
    const hooked = world.hooks.rpc?.(record, world);
    if (hooked) return Promise.resolve(hooked);
    const handler = world.rpcs[fn];
    return Promise.resolve(handler ? handler(args, this.caller, world) : missingFunction(fn));
  }

  readonly auth = {
    getUser: (token?: string): Promise<{ data: { user: Record<string, unknown> | null }; error: unknown }> => {
      const t = token ?? '';
      this.world.calls.push({ kind: 'getUser', token: t });
      const id = this.world.tokens[t];
      const user = id ? this.world.authUsers.find((u) => u.id === id) : undefined;
      if (!user) return Promise.resolve({ data: { user: null }, error: authError('invalid JWT', 401, 'bad_jwt') });
      return Promise.resolve({ data: { user: publicUser(user) }, error: null });
    },
    admin: {
      generateLink: (params: { type: string; email: string; options?: { redirectTo?: string } }) =>
        Promise.resolve(this.admin('generateLink', { ...params }, () => {
          const world = this.world;
          let user = findUserByEmail(world, params.email);
          if (params.type === 'invite' && user) {
            return { data: { properties: null, user: null }, error: authError('A user with this email address has already been registered', 422, 'email_exists') };
          }
          if (params.type === 'recovery' && !user) {
            return { data: { properties: null, user: null }, error: authError('User not found', 404, 'user_not_found') };
          }
          if (!user) {
            user = {
              id: crypto.randomUUID(),
              email: params.email,
              email_confirmed_at: null,
              invited_at: world.now().toISOString(),
              identities: [{ provider: 'email' }],
            };
            world.authUsers.push(user);
          }
          const redirect = params.options?.redirectTo ?? '';
          world.linkSerial += 1;
          const hashed = `hashed-${world.linkSerial}-${user.id}`;
          const action_link = `https://project.supabase.test/auth/v1/verify?token=${hashed}&type=${params.type}&redirect_to=${encodeURIComponent(redirect)}`;
          return {
            data: {
              properties: { action_link, email_otp: '000000', hashed_token: hashed, redirect_to: redirect, verification_type: params.type },
              user: publicUser(user),
            },
            error: null,
          };
        })),
      getUserById: (id: string) =>
        Promise.resolve(this.admin('getUserById', { id }, () => {
          const user = this.world.authUsers.find((u) => u.id === id);
          return user
            ? { data: { user: publicUser(user) }, error: null }
            : { data: { user: null }, error: authError('User not found', 404, 'user_not_found') };
        })),
      updateUserById: (id: string, attrs: Record<string, unknown>) => {
        const recorded = { ...attrs };
        if ('password' in recorded) recorded.password = '[set]';
        return Promise.resolve(this.admin('updateUserById', { id, attrs: recorded }, () => {
          const user = this.world.authUsers.find((u) => u.id === id);
          if (!user) return { data: { user: null }, error: authError('User not found', 404, 'user_not_found') };
          if (attrs.ban_duration === 'none') user.banned_until = null;
          else if (typeof attrs.ban_duration === 'string') user.banned_until = '2126-01-01T00:00:00Z';
          if (typeof attrs.password === 'string') user.password_set = true;
          if (attrs.email_confirm === true) user.email_confirmed_at ??= this.world.now().toISOString();
          return { data: { user: publicUser(user) }, error: null };
        }));
      },
      deleteUser: (id: string, shouldSoftDelete = false) =>
        Promise.resolve(this.admin('deleteUser', { id, shouldSoftDelete }, () => {
          const world = this.world;
          const index = world.authUsers.findIndex((u) => u.id === id);
          if (index < 0) return { data: { user: null }, error: authError('User not found', 404, 'user_not_found') };
          const [removed] = world.authUsers.splice(index, 1);
          return { data: { user: publicUser(removed) }, error: null };
        })),
      signOut: (jwt: string, scope?: string) =>
        Promise.resolve(this.admin('signOut', { jwt, scope: scope ?? 'global' }, () => ({ data: null, error: null }))),
    },
  };

  private admin(method: AdminRecord['method'], args: Record<string, unknown>, run: () => FakeResult): FakeResult {
    const record: AdminRecord = { kind: 'admin', caller: this.caller, method, args };
    this.world.calls.push(record);
    if (this.caller.role !== 'service') {
      return { data: { user: null, properties: null }, error: authError('User not allowed', 403, 'not_admin') };
    }
    return this.world.hooks.admin?.(record, this.world) ?? run();
  }
}

/** A `ClientFactory` over `world`: the service key gives the service client; the anon key a user (with a bearer) or anon client. */
export function fakeClientFactory(world: FakeWorld): ClientFactory {
  return (_url: string, key: string, options?: SupabaseClientOptions<'public'>): SupabaseClient => {
    let caller: Caller;
    if (key === world.serviceKey) {
      caller = { role: 'service', userId: null };
    } else {
      const header = options?.global?.headers?.Authorization ?? '';
      const token = /^Bearer\s+(\S+)$/i.exec(header)?.[1] ?? '';
      const userId = world.tokens[token] ?? null;
      caller = userId ? { role: 'user', userId } : { role: 'anon', userId: null };
    }
    return new FakeClient(world, caller) as unknown as SupabaseClient;
  };
}

/** Calls of one kind, typed. */
export function callsOf<K extends CallRecord['kind']>(world: FakeWorld, kind: K): Extract<CallRecord, { kind: K }>[] {
  return world.calls.filter((c): c is Extract<CallRecord, { kind: K }> => c.kind === kind);
}
