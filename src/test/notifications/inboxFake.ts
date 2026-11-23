/**
 * An in-memory stand-in for the Supabase client, for the inbox tests:
 *
 *   vi.mock('@/integrations/supabase/client', async () => (await import('./inboxFake')).inboxFakeModule);
 *
 * `inboxFake.tables[name]` holds rows; reads apply `eq`, `is`, `not(col,
 * 'is', null)`, `in`, `order` (one column, desc or asc) and `limit`; a
 * `{ count: 'exact', head: true }` select answers `count` only. Updates apply
 * to the matched rows and `.select()` returns them. `inboxFake.failures[name]`
 * fails every request to a table (e.g. `MISSING_TABLE`); `rpcs[name]` answers
 * `rpc(name, args)`; `channels` records realtime subscriptions and lets a
 * test fire their callbacks. Every request is recorded in `calls`.
 */
type Row = Record<string, unknown>;
type Filter = [column: string, op: 'eq' | 'is' | 'not_is' | 'in', value: unknown];

export interface FakeError {
  message: string;
  code?: string;
}

export const MISSING_TABLE: FakeError = { code: '42P01', message: 'relation "public.notification_inbox" does not exist' };
export const SCHEMA_CACHE_MISS: FakeError = { code: 'PGRST205', message: "Could not find the table 'public.notification_inbox' in the schema cache" };
export const RLS_DENIED: FakeError = { code: '42501', message: 'permission denied for table notification_inbox' };

export interface FakeCall {
  table: string;
  op: 'select' | 'update';
  filters: Filter[];
  payload?: Row;
  head?: boolean;
  count?: string;
  limit?: number;
  order?: [string, boolean];
  columns?: string;
  returning?: boolean;
  or?: string[];
}

export interface FakeChannel {
  name: string;
  bindings: Array<{ event: string; filter: Record<string, unknown>; callback: (payload: unknown) => void }>;
  subscribed: boolean;
  removed: boolean;
}

export const inboxFake = {
  tables: {} as Record<string, Row[]>,
  failures: {} as Record<string, FakeError | undefined>,
  /** Fails only head-count selects on a table. */
  countFailures: {} as Record<string, FakeError | undefined>,
  /** Fails only list (non-head) selects on a table. */
  listFailures: {} as Record<string, FakeError | undefined>,
  writeFailures: {} as Record<string, FakeError | undefined>,
  /** A head count that answers without a number (a broken proxy, say). */
  nullCounts: false,
  rpcs: {} as Record<string, (args: Record<string, unknown>) => { data: unknown; error: FakeError | null }>,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  calls: [] as FakeCall[],
  channels: [] as FakeChannel[],
  /** Each request resolves after this many ms (0: next microtask). */
  delayMs: 0,
};

export function resetInboxFake(): void {
  inboxFake.tables = {};
  inboxFake.failures = {};
  inboxFake.countFailures = {};
  inboxFake.listFailures = {};
  inboxFake.writeFailures = {};
  inboxFake.nullCounts = false;
  inboxFake.rpcs = {};
  inboxFake.rpcCalls = [];
  inboxFake.calls = [];
  inboxFake.channels = [];
  inboxFake.delayMs = 0;
}

const matches = (row: Row, filters: Filter[]) =>
  filters.every(([column, op, value]) => {
    const cell = row[column] ?? null;
    if (op === 'eq') return cell === value;
    if (op === 'is') return cell === value;
    if (op === 'not_is') return cell !== value;
    return Array.isArray(value) && value.includes(cell);
  });

const later = <T>(value: () => T): Promise<T> =>
  new Promise((resolve) => {
    if (inboxFake.delayMs > 0) setTimeout(() => resolve(value()), inboxFake.delayMs);
    else queueMicrotask(() => resolve(value()));
  });

function builder(table: string) {
  const call: FakeCall = { table, op: 'select', filters: [] };
  inboxFake.calls.push(call);
  const run = () => {
    const failure = inboxFake.failures[table];
    if (failure) return { data: null, count: null, error: failure };
    if (call.op === 'update') {
      const writeFailure = inboxFake.writeFailures[table];
      if (writeFailure) return { data: null, error: writeFailure };
      const rows = (inboxFake.tables[table] ?? []).filter((r) => matches(r, call.filters));
      for (const r of rows) Object.assign(r, call.payload);
      return { data: call.returning ? rows.map((r) => ({ id: r.id })) : null, error: null };
    }
    if (call.head && inboxFake.countFailures[table]) return { data: null, count: null, error: inboxFake.countFailures[table] };
    if (!call.head && inboxFake.listFailures[table]) return { data: null, error: inboxFake.listFailures[table] };
    let rows = (inboxFake.tables[table] ?? []).filter((r) => matches(r, call.filters));
    if (call.order) {
      const [column, ascending] = call.order;
      rows = [...rows].sort((a, b) => {
        const x = String(a[column] ?? '');
        const y = String(b[column] ?? '');
        return ascending ? x.localeCompare(y) : y.localeCompare(x);
      });
    }
    const total = rows.length;
    if (call.limit !== undefined) rows = rows.slice(0, call.limit);
    if (call.count === 'exact') return { data: call.head ? null : rows, count: inboxFake.nullCounts ? null : total, error: null };
    return { data: rows.map((r) => ({ ...r })), error: null };
  };
  const api = {
    select(columns?: string, options?: { count?: string; head?: boolean }) {
      if (call.op === 'update') call.returning = true;
      else {
        call.columns = columns;
        call.count = options?.count;
        call.head = options?.head;
      }
      return api;
    },
    update(payload: Row) {
      call.op = 'update';
      call.payload = payload;
      return api;
    },
    eq(column: string, value: unknown) {
      call.filters.push([column, 'eq', value]);
      return api;
    },
    is(column: string, value: unknown) {
      call.filters.push([column, 'is', value]);
      return api;
    },
    not(column: string, op: string, value: unknown) {
      if (op !== 'is') throw new Error(`fake: not(${op}) unsupported`);
      call.filters.push([column, 'not_is', value]);
      return api;
    },
    in(column: string, value: unknown) {
      call.filters.push([column, 'in', value]);
      return api;
    },
    /** Recorded only (the alerts bell's scope filter); not applied. */
    or(filter: string) {
      call.or = [...(call.or ?? []), filter];
      return api;
    },
    order(column: string, options?: { ascending?: boolean }) {
      // The first order() is the primary sort; later ones only break ties.
      if (!call.order) call.order = [column, options?.ascending !== false];
      return api;
    },
    limit(n: number) {
      call.limit = n;
      return api;
    },
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return later(run).then(resolve, reject);
    },
  };
  return api;
}

export const inboxFakeSupabase = {
  from: (table: string) => builder(table),
  rpc: (name: string, args: Record<string, unknown> = {}) => {
    inboxFake.rpcCalls.push({ name, args });
    const handler = inboxFake.rpcs[name];
    return later(() => (handler ? handler(args) : { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name}` } }));
  },
  channel: (name: string) => {
    const ch: FakeChannel = { name, bindings: [], subscribed: false, removed: false };
    inboxFake.channels.push(ch);
    const api = {
      on(_type: string, filter: Record<string, unknown>, callback: (payload: unknown) => void) {
        ch.bindings.push({ event: String(filter.event), filter, callback });
        return api;
      },
      subscribe() {
        ch.subscribed = true;
        return api;
      },
      unsubscribe() {
        ch.removed = true;
        return Promise.resolve('ok');
      },
      __fake: ch,
    };
    return api;
  },
  removeChannel: (channel: { __fake?: FakeChannel }) => {
    if (channel.__fake) channel.__fake.removed = true;
    return Promise.resolve('ok');
  },
};

export const inboxFakeModule = { supabase: inboxFakeSupabase };

/** Fire every live binding on the inbox channels (a realtime change). */
export function fireInboxChange(payload: unknown = { eventType: 'INSERT' }): number {
  let fired = 0;
  for (const ch of inboxFake.channels) {
    if (!ch.subscribed || ch.removed) continue;
    for (const b of ch.bindings) {
      b.callback(payload);
      fired += 1;
    }
  }
  return fired;
}

export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
export const COMPANY_ID = 'c0000000-0000-4000-8000-000000000001';
export const DRAAK_ID = 'v-dra';
export const HYDRA_ID = 'v-hyd';

let seq = 0;
/** One inbox row; `minutesAgo` orders them (newest first). */
export function inboxRow(over: Partial<Row> & { minutesAgo?: number } = {}): Row {
  seq += 1;
  const { minutesAgo = seq, ...rest } = over;
  const created = new Date(Date.UTC(2026, 10, 23, 12, 0, 0) - minutesAgo * 60_000).toISOString();
  return {
    id: `n-${seq}`,
    outbox_id: `o-${seq}`,
    user_id: USER_ID,
    company_id: COMPANY_ID,
    vessel_id: DRAAK_ID,
    type_key: 'record_returned',
    module_key: 'safety',
    title: `Notification ${seq}`,
    body: null,
    severity: 'info',
    link_scope: 'vessel',
    link_vessel_code: 'DRA',
    link_workspace: null,
    link_path: `safety/permits/p-${seq}`,
    record_kind: null,
    record_id: null,
    record_ref: null,
    payload: {},
    read_at: null,
    archived_at: null,
    created_at: created,
    ...rest,
  };
}
