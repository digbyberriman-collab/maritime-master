/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * In-memory Supabase client double for HRIS page tests.
 *
 * `fixtures` is a map of table/view name → rows. Rows should already carry
 * any nested join shapes the code selects (e.g. `vessels: { name }`), because
 * the mock ignores select strings. Simple `eq` / `in` / `neq` filters are
 * applied on top-level keys so tests can assert which rows a page shows.
 * Writes are recorded in `calls` and echoed back with a generated id.
 */
export type Fixtures = Record<string, any[]>;

export interface SupabaseCall {
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' | 'rpc';
  payload?: unknown;
  filters: Array<{ kind: string; column?: string; value?: unknown }>;
}

export interface SupabaseMockOptions {
  user?: { id: string; email?: string } | null;
  rpc?: Record<string, (args: any) => any>;
  /** Tables whose reads should fail (simulates RLS / network errors). */
  failReads?: string[];
}

let idSeq = 1;
const nextId = () => `gen-${idSeq++}`;

export function createSupabaseMock(fixtures: Fixtures, options: SupabaseMockOptions = {}) {
  const calls: SupabaseCall[] = [];
  const store: Fixtures = Object.fromEntries(Object.entries(fixtures).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const user = options.user === undefined ? { id: 'u-dpa', email: 'dpa@example.com' } : options.user;

  const applyFilters = (rows: any[], filters: SupabaseCall['filters']) =>
    rows.filter((row) =>
      filters.every((f) => {
        if (f.kind === 'eq') return row[f.column as string] === f.value;
        if (f.kind === 'neq') return row[f.column as string] !== f.value;
        if (f.kind === 'in') return (f.value as unknown[]).includes(row[f.column as string]);
        if (f.kind === 'is') return row[f.column as string] === f.value;
        return true;
      }),
    );

  function builder(table: string) {
    const call: SupabaseCall = { table, op: 'select', filters: [] };
    let single: 'single' | 'maybeSingle' | null = null;
    let payload: any;
    let returning = false;

    const resolve = () => {
      calls.push(call);
      if (options.failReads?.includes(table) && call.op === 'select') {
        return { data: null, error: { message: `read denied on ${table}`, code: '42501' } };
      }
      const rows = store[table] ?? [];
      let data: any;
      if (call.op === 'select') {
        data = applyFilters(rows, call.filters);
      } else if (call.op === 'insert' || call.op === 'upsert') {
        const list = Array.isArray(payload) ? payload : [payload];
        const inserted = list.map((p: any) => ({ id: nextId(), created_at: new Date().toISOString(), ...p }));
        store[table] = [...rows, ...inserted];
        data = returning ? inserted : null;
      } else if (call.op === 'update') {
        const targets = applyFilters(rows, call.filters);
        targets.forEach((t) => Object.assign(t, payload));
        data = returning ? targets : null;
      } else if (call.op === 'delete') {
        const targets = applyFilters(rows, call.filters);
        store[table] = rows.filter((r) => !targets.includes(r));
        data = returning ? targets : null;
      }
      if (single === 'single') return { data: Array.isArray(data) ? data[0] ?? null : data, error: Array.isArray(data) && data.length === 0 ? { message: 'Row not found' } : null };
      if (single === 'maybeSingle') return { data: Array.isArray(data) ? data[0] ?? null : data, error: null };
      return { data, error: null, count: Array.isArray(data) ? data.length : null };
    };

    const api: any = {
      select: (_cols?: string, _opts?: any) => {
        if (call.op !== 'select') returning = true;
        return api;
      },
      insert: (p: any) => { call.op = 'insert'; payload = p; call.payload = p; return api; },
      upsert: (p: any) => { call.op = 'upsert'; payload = p; call.payload = p; return api; },
      update: (p: any) => { call.op = 'update'; payload = p; call.payload = p; return api; },
      delete: () => { call.op = 'delete'; return api; },
      eq: (column: string, value: unknown) => { call.filters.push({ kind: 'eq', column, value }); return api; },
      neq: (column: string, value: unknown) => { call.filters.push({ kind: 'neq', column, value }); return api; },
      in: (column: string, value: unknown[]) => { call.filters.push({ kind: 'in', column, value }); return api; },
      is: (column: string, value: unknown) => { call.filters.push({ kind: 'is', column, value }); return api; },
      gte: () => api, gt: () => api, lte: () => api, lt: () => api, like: () => api, ilike: () => api,
      or: () => api, not: () => api, contains: () => api, filter: () => api, match: () => api,
      order: () => api, limit: () => api, range: () => api, csv: () => api,
      single: () => { single = 'single'; return api; },
      maybeSingle: () => { single = 'maybeSingle'; return api; },
      then: (onFulfilled: any, onRejected?: any) => Promise.resolve(resolve()).then(onFulfilled, onRejected),
    };
    return api;
  }

  const supabase = {
    from: (table: string) => builder(table),
    rpc: async (name: string, args?: any) => {
      calls.push({ table: name, op: 'rpc', payload: args, filters: [] });
      const fn = options.rpc?.[name];
      return { data: fn ? fn(args) : null, error: null };
    },
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      getSession: async () => ({ data: { session: user ? { user } : null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string) => { calls.push({ table: `storage:${bucket}`, op: 'insert', payload: path, filters: [] }); return { data: { path }, error: null }; },
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signed.local/${bucket}/${path}` }, error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://public.local/${bucket}/${path}` } }),
        remove: async (paths: string[]) => { calls.push({ table: `storage:${bucket}`, op: 'delete', payload: paths, filters: [] }); return { data: null, error: null }; },
      }),
    },
    functions: {
      invoke: async (name: string, body?: any) => { calls.push({ table: `fn:${name}`, op: 'rpc', payload: body, filters: [] }); return { data: { ok: true }, error: null }; },
    },
  };

  return { supabase, calls, store };
}
