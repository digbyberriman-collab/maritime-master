// node --test scripts/db/test/*.test.mjs
// scripts/db/check-pending-contract.mjs on a synthetic repo (a pending file,
// stubs of pending.ts and types.ts) and a synthetic export: every mismatch
// class of spec §D.7, the must-mirror rules, notMirrored and
// knownMismatches governance, and the TS type classification.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { classifyColumnText, compareContract, loadPending } from '../check-pending-contract.mjs';

const root = mkdtempSync(join(tmpdir(), 'storm-contract-'));
after(() => rmSync(root, { recursive: true, force: true }));

const write = (rel, text) => {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

write('src/integrations/supabase/types.ts', 'export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\n');
write(
  'src/integrations/supabase/pending.ts',
  `export type PendingColumns<Row extends object> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row> };
export type PendingTable<Row extends object, Required extends keyof Row = never> = { Row: Row; Insert: Partial<Row> & Pick<Row, Required>; Update: Partial<Row>; Relationships: [] };
export type PendingView<Row extends object> = { Row: Row; Relationships: [] };
`,
);

const GOOD_TS = `
import type { PendingColumns, PendingTable, PendingView } from '@/integrations/supabase/pending';
import type { Json } from '@/integrations/supabase/types';
export const LEVELS = ['low', 'high'] as const;
export type Level = (typeof LEVELS)[number];
export type ThingStatus = 'open' | 'closed';
export type ThingRow = {
  id: string;
  status: ThingStatus;
  level: Level | null;
  note: string | null;
  count: number;
  flag: boolean;
  data: Json;
  extra: Json | null;
  tags: string[];
};
export type ThingStateRow = { id: string; state: 'a' | 'b'; label: string };
export type TestPendingTables = { things: PendingTable<ThingRow, 'id'> };
export type TestPendingViews = { thing_states: PendingView<ThingStateRow> };
export type TestPendingColumns = { legacy: PendingColumns<{ added: string | null }> };
export type TestPendingFunctions = {
  thing_open: { Args: { p_id: string; p_note?: string }; Returns: ThingRow };
  thing_count: { Args: never; Returns: number };
  thing_ids: { Args: { p_level: Level }; Returns: string[] };
  thing_status: { Args: { p_id: string }; Returns: 'ok' | 'gone' };
};
`;

const MAP = {
  version: 1,
  files: [
    {
      file: 'src/x/db.pending.ts',
      tables: { type: 'TestPendingTables', expect: ['things'] },
      views: { type: 'TestPendingViews', expect: ['thing_states'] },
      columns: { type: 'TestPendingColumns', expect: ['legacy'] },
      functions: { type: 'TestPendingFunctions', expect: ['thing_open', 'thing_count', 'thing_ids', 'thing_status'] },
    },
  ],
  notMirrored: { tables: { thing_outbox: 'service only' }, views: {}, columns: {}, functions: { thing_helper: 'pure helper' } },
  knownMismatches: [],
};

const col = (type, nullable, extra = {}) => ({ type, nullable, checks: [], inValues: null, ...extra });
const fn = (name, args, returns, extra = {}) => ({
  name,
  args: args.map(([n, type, hasDefault = false]) => ({ name: n, type, mode: 'i', hasDefault })),
  returns,
  returnsSet: false,
  returnsRelation: null,
  returnsEnum: null,
  returnsTable: null,
  secdef: true,
  grants: ['authenticated', 'service_role'],
  status: 'new',
  ...extra,
});

const goodExport = () => ({
  version: 1,
  kind: 'buildout-export',
  tables: {
    things: {
      kind: 'table',
      columns: {
        id: col('uuid', false),
        status: col('text', false, { inValues: ['open', 'closed'] }),
        level: col('text', true, { inValues: ['low', 'high'] }),
        note: col('text', true),
        count: col('integer', false),
        flag: col('boolean', false),
        data: col('jsonb', false),
        extra: col('jsonb', true),
        tags: col('text[]', false),
      },
    },
    thing_outbox: { kind: 'table', columns: { id: col('uuid', false) } },
  },
  views: { thing_states: { kind: 'view', columns: { id: col('uuid', true), state: col('text', true), label: col('text', true) } } },
  legacyColumns: { legacy: { added: col('text', true) } },
  changedLegacyColumns: {},
  functions: {
    'thing_open(uuid, text)': fn('thing_open', [['p_id', 'uuid'], ['p_note', 'text', true]], 'things', { returnsRelation: 'things' }),
    'thing_count()': fn('thing_count', [], 'integer'),
    'thing_ids(text)': fn('thing_ids', [['p_level', 'text']], 'uuid', { returnsSet: true }),
    'thing_status(uuid)': fn('thing_status', [['p_id', 'uuid']], 'text'),
    'thing_helper(text)': fn('thing_helper', [['p', 'text']], 'text'),
    'thing_internal(uuid)': fn('thing_internal', [['p', 'uuid']], 'boolean', { grants: ['service_role'] }),
  },
  removed: { relations: [], columns: [], functions: [] },
});

const run = (tsSource, exportDoc = goodExport(), map = MAP, opts = {}) => {
  write('src/x/db.pending.ts', tsSource);
  return compareContract(exportDoc, loadPending({ root, map }), map, opts);
};
const keys = (result) => result.mismatches.map((m) => m.key).sort();

test('a matching pending file has no mismatch; a view union is only a warning', () => {
  const r = run(GOOD_TS);
  assert.deepEqual(r.mismatches, []);
  assert.ok(r.warnings.some((w) => w.includes('thing_states') && w.includes("'a' | 'b'")), 'the view union is reported as unverifiable');
  assert.equal(r.counts.tables, 1);
  assert.equal(r.counts.functions, 4);
});

test('column mismatches: nullability, unions with and without a CHECK, types, missing columns', () => {
  const ts = GOOD_TS.replace('note: string | null;', 'note: string;')
    .replace('status: ThingStatus;', 'status: string;')
    .replace('count: number;', 'count: string;')
    .replace('flag: boolean;', "flag: boolean;\n  ghost: string;")
    .replace('tags: string[];', "tags: ('x' | 'y')[];")
    .replace('extra: Json | null;', 'extra: Json;');
  const ex = goodExport();
  ex.tables.things.columns.missing_in_ts = col('date', true);
  ex.tables.things.columns.level.inValues = ['low', 'high', 'max'];
  const r = run(ts, ex);
  assert.deepEqual(keys(r).filter((k) => k.startsWith('table:')), [
    'table:things.count:type',
    'table:things.extra:nullability',
    'table:things.ghost:missing-in-sql',
    'table:things.level:union',
    'table:things.missing_in_ts:missing-in-ts',
    'table:things.note:nullability',
    'table:things.status:union',
    'table:things.tags:union',
  ]);
  assert.equal(keys(r).filter((k) => k.startsWith('function:thing_open:returns.')).length, 8, 'the same row checked again as the return type of thing_open');
});

test('a literal union on a column without an IN CHECK is refused (CC-13)', () => {
  const ex = goodExport();
  ex.tables.things.columns.status.inValues = null;
  const r = run(GOOD_TS, ex);
  assert.deepEqual(keys(r), ['function:thing_open:returns.status:union', 'table:things.status:union']);
  assert.match(r.mismatches.find((m) => m.key === 'table:things.status:union').message, /without an SQL IN/);
});

test('function mismatches: argument names, optionality, Args never, return shapes, grants', () => {
  const ts = GOOD_TS.replace('p_note?: string', 'p_note: string')
    .replace("thing_count: { Args: never; Returns: number }", "thing_count: { Args: { p_x: string }; Returns: number }")
    .replace('Returns: string[] }', 'Returns: string }')
    .replace("thing_status: { Args: { p_id: string }; Returns: 'ok' | 'gone' }", "thing_status: { Args: { p_ident: string }; Returns: 'ok' | 'gone' }");
  const ex = goodExport();
  ex.functions['thing_status(uuid)'].grants = ['service_role'];
  assert.deepEqual(keys(run(ts, ex)), [
    'function:thing_count(p_x):missing-in-sql',
    'function:thing_ids:returns',
    'function:thing_open(p_note):optional',
    'function:thing_status(p_id):missing-in-ts',
    'function:thing_status(p_ident):missing-in-sql',
    'function:thing_status:grant',
  ]);
});

test("a row-returning function compares the returned table's columns", () => {
  const ts = GOOD_TS.replace("thing_open: { Args: { p_id: string; p_note?: string }; Returns: ThingRow }", "thing_open: { Args: { p_id: string; p_note?: string }; Returns: ThingStateRow }");
  const r = run(ts);
  assert.ok(r.mismatches.some((m) => m.key.startsWith('function:thing_open:returns.') && m.key.endsWith(':missing-in-ts')), 'columns of things missing from the returned type');
  const r2 = run(GOOD_TS.replace('Returns: ThingRow }', 'Returns: boolean }'));
  assert.deepEqual(keys(r2), ['function:thing_open:returns']);
});

test('must mirror: expected names, new tables / views / columns / callable functions, and the map stays honest', () => {
  const ts = GOOD_TS.replace("export type TestPendingViews = { thing_states: PendingView<ThingStateRow> };", 'export type TestPendingViews = {};').replace(
    "export type TestPendingColumns = { legacy: PendingColumns<{ added: string | null }> };",
    'export type TestPendingColumns = {};',
  );
  const ex = goodExport();
  ex.functions['thing_new(uuid)'] = fn('thing_new', [['p', 'uuid']], 'boolean');
  ex.tables.thing_extra = { kind: 'table', columns: { id: col('uuid', false) } };
  const map = structuredClone(MAP);
  map.notMirrored.functions.thing_gone = 'stale entry';
  assert.deepEqual(keys(run(ts, ex, map)), [
    'columns:legacy:missing-in-ts',
    'map:function:thing_gone:stale',
    'mirror:column:legacy.added',
    'mirror:function:thing_new',
    'mirror:table:thing_extra',
    'mirror:view:thing_states',
    'views:thing_states:missing-in-ts',
  ]);
});

test('a pending table that is not a new table, and pending columns that are not new columns', () => {
  const ts = GOOD_TS.replace("export type TestPendingColumns = { legacy: PendingColumns<{ added: string | null }> };", "export type TestPendingColumns = { legacy: PendingColumns<{ added: string | null; nope: string }> };");
  const ex = goodExport();
  delete ex.tables.things;
  const r = run(ts, ex);
  assert.ok(keys(r).includes('table:things:missing-in-sql'));
  assert.ok(keys(r).includes('columns:legacy.nope:missing-in-sql'));
});

test('knownMismatches are reported, not failed; a stale entry fails', () => {
  const ts = GOOD_TS.replace('note: string | null;', 'note: string;');
  const map = structuredClone(MAP);
  map.knownMismatches = [
    { key: 'table:things.note:nullability', followup: 'Lane 2: add | null' },
    { key: 'function:thing_open:returns.note:nullability', followup: 'Lane 2: add | null' },
    { key: 'table:things.flag:type', followup: 'stale' },
  ];
  const r = run(ts, goodExport(), map);
  assert.deepEqual(r.known.map((k) => k.key).sort(), ['function:thing_open:returns.note:nullability', 'table:things.note:nullability']);
  assert.equal(r.known[0].followup, 'Lane 2: add | null');
  assert.deepEqual(keys(r), ['map:known:table:things.flag:type:stale']);
});

test('warnings: a legacy function in types.ts the build-out closed to the browser', () => {
  const ex = goodExport();
  ex.functions['old_rpc(uuid)'] = fn('old_rpc', [['p', 'uuid']], 'uuid', { status: 'redefined', grants: ['service_role'] });
  const r = run(GOOD_TS, ex, MAP, { typesFunctions: new Set(['old_rpc']) });
  assert.deepEqual(r.mismatches, []);
  assert.ok(r.warnings.some((w) => w.startsWith('old_rpc is in types.ts')));
});

test('a missing type or file is a mismatch, never a silent pass', () => {
  const map = structuredClone(MAP);
  map.files[0].functions.type = 'NoSuchFunctions';
  assert.ok(keys(run(GOOD_TS, goodExport(), map)).includes('type:src/x/db.pending.ts:NoSuchFunctions:missing'));
  const map2 = structuredClone(MAP);
  map2.files.push({ file: 'src/none/db.pending.ts', tables: { type: 'X', expect: [] } });
  assert.ok(keys(run(GOOD_TS, goodExport(), map2)).includes('file:src/none/db.pending.ts:missing'));
});

test('classifyColumnText keeps null apart from Json and resolves aliases', () => {
  const json = 'type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];';
  assert.deepEqual(classifyColumnText('Json', json), { kind: 'json', values: undefined, nullable: false, element: undefined });
  assert.equal(classifyColumnText('Json | null', json).nullable, true);
  assert.deepEqual(classifyColumnText("'b' | 'a' | null"), { kind: 'literals', values: ['a', 'b'], nullable: true, element: undefined });
  assert.deepEqual(classifyColumnText('L', "const X = ['x', 'y'] as const; type L = (typeof X)[number];").values, ['x', 'y']);
  assert.equal(classifyColumnText('string[]').kind, 'array');
  assert.equal(classifyColumnText('Array<number>').element.kind, 'number');
  assert.equal(classifyColumnText('boolean | null').kind, 'boolean');
  assert.equal(classifyColumnText('string | number').kind, 'mixed');
});
