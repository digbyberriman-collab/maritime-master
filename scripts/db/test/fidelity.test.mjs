// Fidelity diff on a small synthetic types.ts (Phase 2 spec §D.5).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dbTypeClass, diffFidelity, parseTypesTs, querySchema } from '../fidelity.mjs';

const TYPES = `
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.1" }
  public: {
    Tables: {
      vessels: {
        Row: {
          id: string
          name: string
          status: string | null
          gross_tonnage: number | null
          particulars: Json
          tags: string[] | null
          role: Database["public"]["Enums"]["user_role"]
          ip: unknown
        }
        Insert: { id?: string }
        Update: { id?: string }
        Relationships: []
      }
      gone_table: {
        Row: { id: string }
        Insert: { id?: string }
        Update: { id?: string }
        Relationships: []
      }
    }
    Views: {
      vessel_list: {
        Row: { id: string | null; name: string | null }
        Relationships: []
      }
    }
    Functions: {
      user_belongs_to_company: { Args: { _company_id: string; _user_id: string }; Returns: boolean }
      current_user_company_id: { Args: never; Returns: string }
      overloaded:
        | { Args: { a: string }; Returns: number }
        | { Args: { a: string; b?: number }; Returns: number }
      missing_fn: { Args: never; Returns: undefined }
    }
    Enums: { user_role: "master" | "crew" | "dpa" }
    CompositeTypes: { [_ in never]: never }
  }
}
`;

const col = (dbType, nullable, typname = dbType) => ({ dbType, nullable, typname });

function database() {
  return {
    tables: new Map([
      [
        'vessels',
        {
          columns: new Map([
            ['id', col('string', false, 'uuid')],
            ['name', col('string', true, 'text')],
            ['status', col('string', true, 'text')],
            ['gross_tonnage', col('string', true, 'text')],
            ['particulars', col('json', false, 'jsonb')],
            ['tags', col('array:string', true, '_text')],
            ['role', col('enum:user_role', false, 'user_role')],
            ['ip', col('unknown', true, 'inet')],
            ['extra', col('string', true, 'text')],
          ]),
        },
      ],
      ['db_only', { columns: new Map([['id', col('string', false, 'uuid')]]) }],
    ]),
    views: new Map([['vessel_list', { columns: new Map([['id', col('string', true, 'uuid')]]) }]]),
    functions: new Map([
      ['user_belongs_to_company', { overloads: [{ args: [{ name: '_user_id' }, { name: '_company_id' }], defaults: 0 }], trigger: false }],
      ['current_user_company_id', { overloads: [{ args: [], defaults: 0 }], trigger: false }],
      ['overloaded', { overloads: [{ args: [{ name: 'a' }], defaults: 0 }], trigger: false }],
      ['set_updated_at', { overloads: [{ args: [], defaults: 0 }], trigger: true }],
      ['db_only_fn', { overloads: [{ args: [], defaults: 0 }], trigger: false }],
    ]),
    enums: new Map([['user_role', ['master', 'crew']]]),
  };
}

test('parseTypesTs reads tables, views, functions (with overloads) and enums', () => {
  const t = parseTypesTs(TYPES);
  assert.deepEqual([...t.tables.keys()], ['vessels', 'gone_table']);
  const v = t.tables.get('vessels').columns;
  assert.deepEqual(v.get('id'), { tsType: 'string', nullable: false, text: 'string' });
  assert.equal(v.get('status').nullable, true);
  assert.equal(v.get('gross_tonnage').tsType, 'number');
  assert.equal(v.get('particulars').tsType, 'json');
  assert.equal(v.get('tags').tsType, 'array:string');
  assert.equal(v.get('role').tsType, 'enum:user_role');
  assert.equal(v.get('ip').tsType, 'unknown');
  assert.deepEqual([...t.views.keys()], ['vessel_list']);
  assert.deepEqual(t.functions.get('current_user_company_id').overloads, [{ args: [] }]);
  assert.deepEqual(t.functions.get('overloaded').overloads.map((o) => o.args.map((a) => `${a.name}${a.optional ? '?' : ''}`)), [['a'], ['a', 'b?']]);
  assert.deepEqual(t.enums.get('user_role'), ['master', 'crew', 'dpa']);
});

test('misses fail unless explained; differences are warnings', () => {
  const result = diffFidelity(parseTypesTs(TYPES), database(), { tables: { gone_table: 'created live by hand' }, columns: { 'vessels.stale': 'no longer needed' } });
  assert.deepEqual(
    result.unexplained.map((m) => `${m.kind}:${m.name}`),
    ['column:vessel_list.name', 'function:missing_fn'],
  );
  assert.deepEqual(result.explained.map((m) => `${m.kind}:${m.name}:${m.reason}`), ['table:gone_table:created live by hand']);
  const warnings = result.warnings.map((w) => `${w.kind}:${w.name}`);
  assert.ok(warnings.includes('nullability:vessels.name'), 'types.ts not null, database nullable');
  assert.ok(!warnings.includes('nullability:vessels.ip'), 'unknown columns carry no nullability in types.ts');
  assert.ok(warnings.includes('type:vessels.gross_tonnage'), 'number vs text');
  assert.ok(warnings.includes('extra_column:vessels.extra'));
  assert.ok(warnings.includes('extra_table:db_only'));
  assert.ok(warnings.includes('extra_function:db_only_fn'));
  assert.ok(!warnings.includes('extra_function:set_updated_at'), 'trigger functions are not in types.ts');
  assert.ok(warnings.includes('function_args:overloaded'), 'the (a, b) overload has no database match');
  assert.ok(!warnings.includes('function_args:user_belongs_to_company'), 'argument order does not matter (types.ts sorts them)');
  assert.ok(warnings.includes('enum:user_role'), 'dpa is missing');
  assert.ok(warnings.includes('stale_exception:columns.vessels.stale'));
  assert.ok(!warnings.some((w) => w.startsWith('nullability:vessel_list')), 'view columns are never compared for nullability');
  assert.equal(result.counts.unexplained, 2);
  assert.equal(result.counts.explained, 1);
});

test('a clean database has no miss', () => {
  const t = parseTypesTs(TYPES);
  const db = database();
  db.tables.set('gone_table', { columns: new Map([['id', col('string', false, 'uuid')]]) });
  db.views.get('vessel_list').columns.set('name', col('string', true, 'text'));
  db.functions.set('missing_fn', { overloads: [{ args: [], defaults: 0 }], trigger: false });
  assert.deepEqual(diffFidelity(t, db, {}).unexplained, []);
});

test('database type classes', () => {
  assert.equal(dbTypeClass({ typname: 'uuid', category: 'U' }), 'string');
  assert.equal(dbTypeClass({ typname: 'jsonb', category: 'U' }), 'json');
  assert.equal(dbTypeClass({ typname: 'timestamptz', category: 'D' }), 'string');
  assert.equal(dbTypeClass({ typname: 'int8', category: 'N' }), 'number');
  assert.equal(dbTypeClass({ typname: 'bool', category: 'B' }), 'boolean');
  assert.equal(dbTypeClass({ typname: 'user_role', category: 'E' }), 'enum:user_role');
  assert.equal(dbTypeClass({ typname: '_uuid', category: 'A', elemName: 'uuid', elemCategory: 'U' }), 'array:string');
  assert.equal(dbTypeClass({ typname: 'inet', category: 'I' }), 'unknown');
});

test('querySchema shapes psql rows', async () => {
  const answers = [
    [['vessels', 'table'], ['vessel_list', 'view']],
    [
      ['vessels', 'table', 'id', 'f', 'uuid', 'U', '', ''],
      ['vessels', 'table', 'tags', 't', '_text', 'A', 'text', 'S'],
      ['vessel_list', 'view', 'id', 't', 'uuid', 'U', '', ''],
    ],
    [['f', '_a,_b', '1', 'f'], ['f', '', '0', 'f'], ['trg', '', '0', 't']],
    [['user_role', 'master'], ['user_role', 'crew']],
  ];
  let i = 0;
  const schema = await querySchema(async () => answers[i++]);
  assert.deepEqual(schema.tables.get('vessels').columns.get('tags'), { dbType: 'array:string', nullable: true, typname: '_text' });
  assert.equal(schema.views.get('vessel_list').columns.get('id').nullable, true);
  assert.deepEqual(schema.functions.get('f').overloads.map((o) => o.args.map((a) => a.name)), [['_a', '_b'], []]);
  assert.equal(schema.functions.get('trg').trigger, true);
  assert.deepEqual(schema.enums.get('user_role'), ['master', 'crew']);
});
