/**
 * A small in-memory stand-in for the Supabase client, for the shell tests.
 *
 *   vi.mock('@/integrations/supabase/client', async () => (await import('./fakeSupabase')).fakeSupabaseModule);
 *
 * `fakeDb.tables[name]` holds the rows a `from(name)` read returns, filtered
 * by `eq`, `in` and `is`; `fakeDb.failures[name]` makes every request to that
 * table fail; `fakeDb.calls` records each request (table, operation, filters,
 * payload) so a test can check what was asked. Writes resolve with no rows
 * and are recorded, not applied, unless `fakeDb.applyWrites` is on.
 *
 * Also recorded: `select(columns, options)` options (`selectOptions`) and the
 * `or(filter)` strings (`or`; recorded only, never applied). A select with
 * `{ count: 'exact' }` resolves `{ data, count, error }` (`data` null with
 * `head: true`); an `update(...).select()` resolves the rows it matched,
 * merged with the payload.
 */
type Row = Record<string, unknown>;

export interface FakeCall {
  table: string;
  op: 'select' | 'insert' | 'upsert' | 'update' | 'delete';
  filters: Array<[string, string, unknown]>;
  payload?: unknown;
  options?: unknown;
  limit?: number;
  order?: Array<[string, boolean]>;
  /** The options of `select(columns, options)` on a read. */
  selectOptions?: { count?: string; head?: boolean };
  /** `select()` was chained after `update()` or `insert()` (return the written rows). */
  returning?: boolean;
  /** The `or(filter)` strings, in order (recorded, not applied). */
  or?: string[];
}

export const fakeDb = {
  tables: {} as Record<string, Row[]>,
  failures: {} as Record<string, { message: string; code?: string } | undefined>,
  /** Like `failures`, for inserts, upserts, updates and deletes only. */
  writeFailures: {} as Record<string, { message: string; code?: string } | undefined>,
  calls: [] as FakeCall[],
  applyWrites: false,
  /** Resolve each request after this many ms (0 = next microtask). */
  delayMs: 0,
};

export function resetFakeDb(): void {
  fakeDb.tables = {};
  fakeDb.failures = {};
  fakeDb.writeFailures = {};
  fakeDb.calls = [];
  fakeDb.applyWrites = false;
  fakeDb.delayMs = 0;
}

function matches(row: Row, filters: FakeCall['filters']): boolean {
  return filters.every(([column, op, value]) => {
    const cell = row[column];
    if (op === 'eq') return cell === value;
    if (op === 'in') return Array.isArray(value) && value.includes(cell);
    if (op === 'is') return cell === value;
    return true;
  });
}

function builder(table: string) {
  const call: FakeCall = { table, op: 'select', filters: [] };
  fakeDb.calls.push(call);
  const run = () => {
    const failure = fakeDb.failures[table];
    if (failure) return { data: null, error: failure };
    if (call.op !== 'select') {
      const writeFailure = fakeDb.writeFailures[table];
      if (writeFailure) return { data: null, error: writeFailure };
      if (fakeDb.applyWrites) {
        const rows = fakeDb.tables[table] ?? [];
        if (call.op === 'insert' || call.op === 'upsert') {
          const added = (Array.isArray(call.payload) ? call.payload : [call.payload]) as Row[];
          fakeDb.tables[table] = [...rows, ...added.map((r, i) => ({ id: `fake-${rows.length + i + 1}`, ...r }))];
        } else if (call.op === 'delete') {
          fakeDb.tables[table] = rows.filter((r) => !matches(r, call.filters));
        }
      }
      if (call.op === 'update' && call.returning) {
        const patch = (call.payload ?? {}) as Row;
        const updated = (fakeDb.tables[table] ?? []).filter((r) => matches(r, call.filters)).map((r) => ({ ...r, ...patch }));
        return { data: updated, error: null };
      }
      return { data: null, error: null };
    }
    const matched = (fakeDb.tables[table] ?? []).filter((r) => matches(r, call.filters));
    const rows = call.limit !== undefined ? matched.slice(0, call.limit) : matched;
    if (call.selectOptions?.count === 'exact') {
      return { data: call.selectOptions.head ? null : rows, count: matched.length, error: null };
    }
    return { data: rows, error: null };
  };
  const set = (patch: Partial<FakeCall>) => {
    Object.assign(call, patch);
    return api;
  };
  const api = {
    select: (_columns?: string, options?: { count?: string; head?: boolean }) => {
      if (call.op === 'select') {
        if (options) call.selectOptions = options;
      } else if (call.op === 'update' || call.op === 'insert') {
        call.returning = true;
      }
      return api;
    },
    insert: (payload: unknown) => set({ op: 'insert', payload }),
    upsert: (payload: unknown, options?: unknown) => set({ op: 'upsert', payload, options }),
    update: (payload: unknown) => set({ op: 'update', payload }),
    delete: () => set({ op: 'delete' }),
    eq: (column: string, value: unknown) => {
      call.filters.push([column, 'eq', value]);
      return api;
    },
    in: (column: string, value: unknown) => {
      call.filters.push([column, 'in', value]);
      return api;
    },
    is: (column: string, value: unknown) => {
      call.filters.push([column, 'is', value]);
      return api;
    },
    not: () => api,
    or: (filter: string) => {
      call.or = [...(call.or ?? []), filter];
      return api;
    },
    order: (column: string, options?: { ascending?: boolean }) => {
      call.order = [...(call.order ?? []), [column, options?.ascending !== false]];
      return api;
    },
    limit: (n: number) => {
      call.limit = n;
      return api;
    },
    maybeSingle: () => api,
    single: () => api,
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      const result = new Promise((done) => {
        if (fakeDb.delayMs > 0) setTimeout(() => done(run()), fakeDb.delayMs);
        else queueMicrotask(() => done(run()));
      });
      return result.then(resolve, reject);
    },
  };
  return api;
}

const channel = () => {
  const ch = { on: () => ch, subscribe: () => ch, unsubscribe: () => undefined };
  return ch;
};

export const fakeSupabase = {
  from: (table: string) => builder(table),
  channel,
  removeChannel: () => undefined,
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
  },
};

export const fakeSupabaseModule = { supabase: fakeSupabase };
