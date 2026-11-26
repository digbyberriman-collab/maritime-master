/**
 * A small in-memory stand-in for the Supabase client the Forms &
 * Checklists page tests mock `@/integrations/supabase/client` with (not a
 * test file itself).
 *
 * - Table reads: the rows of `state.rows[table]`, filtered by `eq` / `in`,
 *   projected to the selected columns; `maybeSingle()` answers the first
 *   row or null. A table in `missingTables` answers PostgREST's "table not
 *   found" (PGRST205); a selected column in `missingColumns`
 *   (`table.column`) answers 42703; `tableErrors[table]` forces an error.
 * - Writes (insert / update) are recorded in `writes` with their filters
 *   and answered from `writeAnswers`, in order.
 * - RPCs answer from `rpc[fn]` (a value or a function of the arguments),
 *   else PostgREST's "function not found" (PGRST202). Calls are recorded.
 */
export interface FakeError {
  code?: string;
  message: string;
}

export interface FakeAnswer {
  data: unknown;
  error: FakeError | null;
}

export type FakeRow = Record<string, unknown>;

export interface FakeWrite {
  table: string;
  kind: 'insert' | 'update';
  values: FakeRow;
  filters: Array<[string, string, unknown]>;
}

export interface FakeDbState {
  rows: Record<string, FakeRow[]>;
  missingTables: Set<string>;
  missingColumns: Set<string>;
  tableErrors: Record<string, FakeError>;
  rpc: Record<string, FakeAnswer | ((args: Record<string, unknown>) => FakeAnswer)>;
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
  reads: Array<{ table: string; columns: string }>;
  writes: FakeWrite[];
  writeAnswers: FakeAnswer[];
}

export function freshState(): FakeDbState {
  return {
    rows: {},
    missingTables: new Set(),
    missingColumns: new Set(),
    tableErrors: {},
    rpc: {},
    rpcCalls: [],
    reads: [],
    writes: [],
    writeAnswers: [],
  };
}

type Builder = Record<string, (...args: unknown[]) => unknown>;

export function createFakeDb(state: FakeDbState) {
  function from(table: string) {
    let columns = '*';
    let kind: 'select' | 'insert' | 'update' = 'select';
    let values: FakeRow = {};
    const filters: Array<[string, string, unknown]> = [];
    const builder: Builder = {};
    builder.select = (cols?: unknown) => {
      columns = typeof cols === 'string' ? cols : '*';
      return builder;
    };
    builder.insert = (v: unknown) => {
      kind = 'insert';
      values = (v ?? {}) as FakeRow;
      return builder;
    };
    builder.update = (v: unknown) => {
      kind = 'update';
      values = (v ?? {}) as FakeRow;
      return builder;
    };
    for (const op of ['eq', 'neq', 'in']) {
      builder[op] = (column: unknown, value: unknown) => {
        filters.push([op, String(column), value]);
        return builder;
      };
    }
    builder.order = () => builder;
    builder.limit = () => builder;

    const run = (single: boolean): FakeAnswer => {
      if (kind !== 'select') {
        state.writes.push({ table, kind, values, filters: [...filters] });
        return state.writeAnswers.shift() ?? { data: null, error: { message: `no write answer for ${table}` } };
      }
      state.reads.push({ table, columns });
      if (state.missingTables.has(table)) return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` } };
      if (state.tableErrors[table]) return { data: null, error: state.tableErrors[table] };
      const cols = columns === '*' ? null : columns.split(',').map((c) => c.trim()).filter(Boolean);
      const missing = cols?.find((c) => state.missingColumns.has(`${table}.${c}`));
      if (missing) return { data: null, error: { code: '42703', message: `column ${table}.${missing} does not exist` } };
      const rows = (state.rows[table] ?? [])
        .filter((r) =>
          filters.every(([op, c, v]) => {
            if (op === 'eq') return r[c] === v;
            if (op === 'neq') return r[c] !== v;
            if (op === 'in') return Array.isArray(v) && v.includes(r[c]);
            return true;
          }),
        )
        .map((r) => (cols ? Object.fromEntries(cols.map((c) => [c, r[c] ?? null])) : { ...r }));
      return single ? { data: rows[0] ?? null, error: null } : { data: rows, error: null };
    };

    builder.maybeSingle = () => Promise.resolve(run(true));
    builder.single = () => Promise.resolve(run(true));
    builder.then = (resolve: unknown, reject: unknown) =>
      Promise.resolve(run(false)).then(resolve as (v: FakeAnswer) => unknown, reject as (e: unknown) => unknown);
    return builder;
  }

  function rpc(fn: string, args: Record<string, unknown> = {}) {
    state.rpcCalls.push({ fn, args });
    const answer = state.rpc[fn];
    const value =
      typeof answer === 'function'
        ? answer(args)
        : (answer ?? { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn} in the schema cache` } });
    return Promise.resolve(value);
  }

  return { from, rpc };
}

// ─── Rows ────────────────────────────────────────────────────────────────

export const COMPANY = 'co-1';
export const USER = 'user-1';
export const V = { dra: 'v-dra', hyd: 'v-hyd', gam: 'v-gam', xip: 'v-xip' } as const;

export const SHOWN_VESSELS = [
  { id: V.dra, name: 'DRAAK', code: 'DRA', counted: true, flagState: 'Malta', classificationSociety: 'LR', fleetGroupId: null },
  { id: V.gam, name: 'GAME CHANGER', code: 'GAM', counted: true, flagState: 'Malta', classificationSociety: 'BV', fleetGroupId: null },
  { id: V.hyd, name: 'HYDRA', code: 'HYD', counted: true, flagState: 'Cayman', classificationSociety: 'LR', fleetGroupId: null },
  { id: V.xip, name: 'XIPHIAS', code: 'XIP', counted: false, flagState: null, classificationSociety: null, fleetGroupId: null },
];

/** The `useFleetVesselsShown()` answer once the vessels are loaded. */
export function shownReady() {
  const counted = SHOWN_VESSELS.filter((v) => v.counted).map((v) => v.id);
  return {
    status: 'ready' as const,
    companyId: COMPANY,
    vessels: SHOWN_VESSELS,
    shownIds: counted,
    shownVessels: SHOWN_VESSELS.filter((v) => v.counted),
    countedIds: counted,
    isDefault: true,
    source: 'default' as const,
    droppedCodes: [],
    fleetGroups: [],
    scope: { companyId: COMPANY, vesselIds: counted },
    setShown: () => undefined,
    showAll: () => undefined,
  };
}

const stamp = '2026-11-20T10:00:00.000Z';

/** A `form_templates` row with the live and the catalogue columns. */
export function template(id: string, over: FakeRow = {}): FakeRow {
  return {
    id,
    company_id: COMPANY,
    template_code: `CODE_${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`,
    template_name: `Template ${id}`,
    description: null,
    form_type: 'CHECKLIST',
    status: 'PUBLISHED',
    version: 1,
    vessel_scope: 'FLEET',
    vessel_ids: null,
    published_at: stamp,
    updated_at: stamp,
    created_at: stamp,
    supersedes_template_id: null,
    form_schema: { pages: [], fields: [{ id: `${id}-s1`, type: 'section', label: 'Checks', required: false }, { id: `${id}-f1`, type: 'yes_no', label: 'All clear', required: true }] },
    area: 'safety',
    form_kind: 'checklist',
    cadence: 'daily',
    requires_completion_signature: false,
    origin: 'company',
    source_template_id: null,
    version_label: null,
    ...over,
  };
}

export function setting(templateId: string, vesselId: string, over: FakeRow = {}): FakeRow {
  return {
    template_id: templateId,
    vessel_id: vesselId,
    company_id: COMPANY,
    visibility: 'shown',
    sort_order: null,
    reason: null,
    hidden_at: null,
    ...over,
  };
}

export function stat(templateId: string, vesselId: string, over: FakeRow = {}): FakeRow {
  return { template_id: templateId, vessel_id: vesselId, hidden: false, runs: 0, last_run_at: null, last_run_on: null, next_due: null, overdue: false, ...over };
}
