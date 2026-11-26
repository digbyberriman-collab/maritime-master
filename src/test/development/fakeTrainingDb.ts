/**
 * A small in-memory stand-in for the Supabase client the Fleet › Training
 * and Crew Training tests mock `@/integrations/supabase/client` with (not
 * a test file itself; X5-07B).
 *
 * - Table reads: the rows of `state.rows[table]`, filtered by `eq` / `neq`
 *   / `in`, returned whole (embeds are stored on the rows). A table in
 *   `missingTables` answers PostgREST's "table not found" (PGRST205); a
 *   selected column in `missingColumns` (`table.column`) answers 42703;
 *   `tableErrors[table]` forces an error. Every read is recorded with its
 *   filters.
 * - RPCs answer from `rpc[fn]` (a value or a function of the arguments),
 *   else PostgREST's "function not found" (PGRST202). Calls are recorded.
 * - Writes are recorded and refused: the training pages never write a
 *   table directly.
 */
export interface FakeError {
  code?: string;
  message: string;
  hint?: string;
}

export interface FakeAnswer {
  data: unknown;
  error: FakeError | null;
}

export type FakeRow = Record<string, unknown>;

export interface FakeRead {
  table: string;
  columns: string;
  filters: Array<[string, string, unknown]>;
}

export interface TrainingDbState {
  rows: Record<string, FakeRow[]>;
  missingTables: Set<string>;
  missingColumns: Set<string>;
  tableErrors: Record<string, FakeError>;
  rpc: Record<string, FakeAnswer | ((args: Record<string, unknown>) => FakeAnswer)>;
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
  reads: FakeRead[];
  writes: Array<{ table: string; kind: string }>;
}

export function freshTrainingState(): TrainingDbState {
  return { rows: {}, missingTables: new Set(), missingColumns: new Set(), tableErrors: {}, rpc: {}, rpcCalls: [], reads: [], writes: [] };
}

type Builder = Record<string, (...args: unknown[]) => unknown>;

/** The plain column names of a select (embeds and their columns left out). */
function plainColumns(columns: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let token = '';
  for (const ch of columns) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(token.trim());
      token = '';
    } else token += ch;
  }
  if (token.trim()) out.push(token.trim());
  return out.filter((c) => /^[a-z_][a-z0-9_]*$/.test(c));
}

export function createTrainingDb(state: TrainingDbState) {
  function from(table: string) {
    let columns = '*';
    let kind = 'select';
    const filters: Array<[string, string, unknown]> = [];
    const builder: Builder = {};
    builder.select = (cols?: unknown) => {
      columns = typeof cols === 'string' ? cols : '*';
      return builder;
    };
    for (const write of ['insert', 'update', 'upsert', 'delete']) {
      builder[write] = () => {
        kind = write;
        return builder;
      };
    }
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
        state.writes.push({ table, kind });
        return { data: null, error: { code: '42501', message: 'direct writes are not expected' } };
      }
      state.reads.push({ table, columns, filters: [...filters] });
      if (state.missingTables.has(table)) return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` } };
      if (state.tableErrors[table]) return { data: null, error: state.tableErrors[table] };
      const missing = plainColumns(columns).find((c) => state.missingColumns.has(`${table}.${c}`));
      if (missing) return { data: null, error: { code: '42703', message: `column ${table}.${missing} does not exist` } };
      const rows = (state.rows[table] ?? []).filter((r) =>
        filters.every(([op, c, v]) => {
          if (op === 'eq') return r[c] === v;
          if (op === 'neq') return r[c] !== v;
          if (op === 'in') return Array.isArray(v) && v.includes(r[c]);
          return true;
        }),
      );
      return single ? { data: rows[0] ?? null, error: null } : { data: rows.map((r) => ({ ...r })), error: null };
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

// ─── rows ─────────────────────────────────────────────────────────────────

export const COMPANY = 'co-1';
export const V = { dra: 'v-dra', hyd: 'v-hyd', gam: 'v-gam' } as const;

export const VESSELS = [
  { id: V.dra, name: 'DRAAK', code: 'DRA', counted: true, flagState: null, classificationSociety: null, fleetGroupId: null },
  { id: V.gam, name: 'GAME CHANGER', code: 'GAM', counted: true, flagState: null, classificationSociety: null, fleetGroupId: null },
  { id: V.hyd, name: 'HYDRA', code: 'HYD', counted: true, flagState: null, classificationSociety: null, fleetGroupId: null },
];

/** The `useFleetVesselsShown()` answer once the vessels are loaded. */
export function vesselsReady() {
  const ids = VESSELS.map((v) => v.id);
  return {
    status: 'ready' as const,
    companyId: COMPANY,
    vessels: VESSELS,
    shownIds: ids,
    shownVessels: VESSELS,
    countedIds: ids,
    isDefault: true,
    source: 'default' as const,
    droppedCodes: [],
    fleetGroups: [],
    scope: { companyId: COMPANY, vesselIds: ids },
    setShown: () => undefined,
    showAll: () => undefined,
  };
}

const DAY = 86_400_000;
/** An ISO timestamp `days` before now. */
export const daysAgo = (days: number, now = Date.now()) => new Date(now - days * DAY).toISOString();

/** A development_applications row with the live columns, its embed and stage_entered_at. */
export function application(id: string, over: FakeRow = {}): FakeRow {
  return {
    id,
    company_id: COMPANY,
    application_number: `CDA-20261120-${id.padStart(4, '0').slice(-4)}`,
    crew_member_id: `crew-${id}`,
    vessel_id: V.dra,
    course_id: 'course-1',
    course_name: `Course ${id}`,
    category: 'professional',
    status: 'hod_review',
    course_provider: 'Demo Maritime Academy',
    course_location: null,
    course_description: null,
    course_start_date: '2026-12-10',
    course_end_date: '2026-12-12',
    course_duration_days: 3,
    estimated_tuition_usd: 1000,
    estimated_travel_usd: 200,
    estimated_accommodation_usd: 300,
    estimated_food_per_diem_usd: 50,
    estimated_total_usd: 1650,
    application_currency: 'USD',
    tuition_local_amount: null,
    travel_local_amount: null,
    accommodation_local_amount: null,
    is_custom_course: false,
    is_discretionary: false,
    discretionary_justification: null,
    denial_reason: null,
    hod_reviewer_id: null,
    hod_reviewed_at: null,
    hod_decision: null,
    hod_comments: null,
    purser_reviewer_id: null,
    purser_reviewed_at: null,
    purser_decision: null,
    purser_comments: null,
    captain_reviewer_id: null,
    captain_reviewed_at: null,
    captain_decision: null,
    captain_comments: null,
    submitted_at: daysAgo(2),
    completed_at: null,
    clawback_end_date: null,
    created_at: daysAgo(3),
    updated_at: daysAgo(2),
    stage_entered_at: daysAgo(2),
    crew_member: { first_name: 'Demo', last_name: `Crew ${id}`, department: 'Deck' },
    ...over,
  };
}
