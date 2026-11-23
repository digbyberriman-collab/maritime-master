// node --test scripts/db/test/*.test.mjs
// scripts/db/schema-export.mjs: IN-list parsing of printed CHECKs, the SQL
// -> TS class map, snapshot building (arguments, defaults, RETURNS TABLE)
// and the build-out diff.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSnapshot, diffSnapshots, parseCli, parseInList, sqlTypeClass } from '../schema-export.mjs';

test('parseInList reads the IN (...) lists Postgres prints', () => {
  assert.deepEqual(parseInList("CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))", 'status'), ['open', 'closed']);
  assert.deepEqual(parseInList("CHECK (((closed_as IS NULL) OR (closed_as = ANY (ARRAY['after_review'::text, 'duplicate'::text]))))", 'closed_as'), ['after_review', 'duplicate']);
  assert.deepEqual(
    parseInList("CHECK (((kind)::text = ANY ((ARRAY['a'::character varying, 'b'::character varying])::text[])))", 'kind'),
    ['a', 'b'],
    'varchar columns print a cast',
  );
  assert.deepEqual(parseInList("CHECK ((note = ANY (ARRAY['it''s'::text, 'a, b'::text])))", 'note'), ["it's", 'a, b'], 'quotes and commas inside values');
  assert.deepEqual(parseInList("CHECK ((mime_type = ANY (ARRAY['application/pdf'::text, 'image/jpeg'::text])))", 'mime_type'), ['application/pdf', 'image/jpeg']);
});

test('parseInList refuses anything that is not exactly an IN list', () => {
  assert.equal(parseInList("CHECK ((code ~ '^[A-Z][A-Z0-9]{2}$'::text))", 'code'), null, 'a regex');
  assert.equal(parseInList("CHECK ((bucket = 'records'::text))", 'bucket'), null, 'one equality is not a vocabulary');
  assert.equal(parseInList('CHECK ((size_bytes > 0))', 'size_bytes'), null, 'a range');
  assert.equal(parseInList("CHECK (((status = ANY (ARRAY['a'::text])) AND (length(status) > 0)))", 'status'), null, 'an IN list with more logic');
  assert.equal(parseInList("CHECK ((other = ANY (ARRAY['a'::text])))", 'status'), null, 'another column');
  assert.equal(parseInList("CHECK (((status <> ALL (ARRAY['a'::text]))))", 'status'), null, 'NOT IN');
  assert.equal(parseInList("CHECK ((audience <@ ARRAY['must_act'::text, 'dpa'::text]))", 'audience'), null, 'array containment');
});

test('sqlTypeClass maps SQL types to the TS classes of spec §B.1', () => {
  assert.deepEqual(sqlTypeClass({ type: 'uuid' }), { kind: 'string' });
  assert.deepEqual(sqlTypeClass({ type: 'timestamp with time zone' }), { kind: 'string' });
  assert.deepEqual(sqlTypeClass({ type: 'text', inValues: ['a', 'b'] }), { kind: 'literals', values: ['a', 'b'] });
  assert.deepEqual(sqlTypeClass({ type: 'bigint' }), { kind: 'number' });
  assert.deepEqual(sqlTypeClass({ type: 'numeric(10,2)' }), { kind: 'number' });
  assert.deepEqual(sqlTypeClass({ type: 'boolean' }), { kind: 'boolean' });
  assert.deepEqual(sqlTypeClass({ type: 'jsonb' }), { kind: 'json' });
  assert.deepEqual(sqlTypeClass({ type: 'uuid[]' }), { kind: 'array', element: { kind: 'string' } });
  assert.deepEqual(sqlTypeClass({ type: 'permission_level', enumValues: ['view', 'edit'] }), { kind: 'literals', values: ['view', 'edit'] });
});

const rawFixture = () => ({
  relations: {
    t_new: { kind: 'table', columns: { id: { ordinal: 1, type: 'uuid', nullable: false, checks: [] }, status: { ordinal: 2, type: 'text', nullable: false, checks: ["CHECK ((status = ANY (ARRAY['a'::text, 'b'::text])))"] } } },
    v_new: { kind: 'view', columns: { id: { ordinal: 1, type: 'uuid', nullable: true, checks: null } } },
    legacy: { kind: 'table', columns: { id: { ordinal: 1, type: 'uuid', nullable: false, checks: [] }, added: { ordinal: 2, type: 'text', nullable: true, checks: [] } } },
  },
  functions: {
    'f_args(text, uuid, integer)': {
      name: 'f_args', argTypes: ['text', 'uuid', 'integer'], allArgTypes: null, argNames: ['p_a', 'p_b', 'p_c'], argModes: null,
      nargs: 3, nargDefaults: 2, returns: 'boolean', returnsSet: false, returnsRelation: null, secdef: true, volatility: 's', language: 'sql',
      grants: ['authenticated', 'service_role'], config: ['search_path=public'], bodyHash: 'h1',
    },
    'f_table(uuid)': {
      name: 'f_table', argTypes: ['uuid'], allArgTypes: ['uuid', 'uuid', 'text'], argNames: ['p_id', 'id', 'label'], argModes: ['i', 't', 't'],
      nargs: 1, nargDefaults: 0, returns: 'record', returnsSet: true, returnsRelation: null, secdef: false, volatility: 'v', language: 'plpgsql',
      grants: [], config: null, bodyHash: 'h2',
    },
    'legacy_fn(uuid)': {
      name: 'legacy_fn', argTypes: ['uuid'], allArgTypes: null, argNames: ['_u'], argModes: null, nargs: 1, nargDefaults: 0,
      returns: 'boolean', returnsSet: false, returnsRelation: null, secdef: true, volatility: 's', language: 'sql', grants: ['PUBLIC'], config: null, bodyHash: 'old',
    },
    'same_fn()': {
      name: 'same_fn', argTypes: [], allArgTypes: null, argNames: null, argModes: null, nargs: 0, nargDefaults: 0,
      returns: 'integer', returnsSet: false, returnsRelation: null, secdef: false, volatility: 'i', language: 'sql', grants: ['PUBLIC'], config: null, bodyHash: 'same',
    },
  },
});

test('buildSnapshot: IN lists, argument defaults (the last N), RETURNS TABLE columns', () => {
  const snap = buildSnapshot(rawFixture());
  assert.deepEqual(snap.relations.t_new.columns.status.inValues, ['a', 'b']);
  assert.equal(snap.relations.t_new.columns.id.inValues, null);
  assert.deepEqual(snap.relations.v_new.columns.id.checks, [], 'view columns: no checks');
  assert.deepEqual(
    snap.functions['f_args(text, uuid, integer)'].args.map((a) => [a.name, a.type, a.hasDefault]),
    [['p_a', 'text', false], ['p_b', 'uuid', true], ['p_c', 'integer', true]],
  );
  const table = snap.functions['f_table(uuid)'];
  assert.deepEqual(table.args.map((a) => a.name), ['p_id'], 'TABLE columns are not arguments');
  assert.deepEqual(table.returnsTable, [{ name: 'id', type: 'uuid' }, { name: 'label', type: 'text' }]);
});

test('diffSnapshots keeps what the build-out added or changed', () => {
  const baseRaw = rawFixture();
  delete baseRaw.relations.t_new;
  delete baseRaw.relations.v_new;
  delete baseRaw.relations.legacy.columns.added;
  delete baseRaw.functions['f_args(text, uuid, integer)'];
  delete baseRaw.functions['f_table(uuid)'];
  baseRaw.functions['gone()'] = { ...baseRaw.functions['same_fn()'], name: 'gone' };
  const current = rawFixture();
  current.functions['legacy_fn(uuid)'] = { ...current.functions['legacy_fn(uuid)'], grants: ['authenticated', 'service_role'], bodyHash: 'new' };
  const out = diffSnapshots(buildSnapshot(baseRaw), buildSnapshot(current));
  assert.equal(out.kind, 'buildout-export');
  assert.deepEqual(Object.keys(out.tables), ['t_new']);
  assert.deepEqual(Object.keys(out.views), ['v_new']);
  assert.deepEqual(Object.keys(out.legacyColumns), ['legacy']);
  assert.deepEqual(Object.keys(out.legacyColumns.legacy), ['added']);
  assert.equal(out.functions['f_args(text, uuid, integer)'].status, 'new');
  assert.equal(out.functions['legacy_fn(uuid)'].status, 'redefined');
  assert.deepEqual(out.functions['legacy_fn(uuid)'].changed, ['bodyHash', 'grants']);
  assert.equal(out.functions['same_fn()'], undefined, 'an unchanged function is not exported');
  assert.deepEqual(out.removed.functions, ['gone()']);
});

test('parseCli: --psql and --out are required; unknown flags refused', () => {
  assert.throws(() => parseCli(['--out', 'x.json']), /--psql/);
  assert.throws(() => parseCli(['--psql', '-h s']), /--out/);
  assert.throws(() => parseCli(['--psql', '-h s', '--out', 'x', '--nope']), /unknown flag/);
  assert.throws(() => parseCli(['--psql']), /needs a value/);
  const o = parseCli(['--psql', '-h /tmp/s -p 1', '--out', 'x.json', '--baseline', 'b.json', '--psql-bin', '/usr/bin/psql']);
  assert.equal(o.psql, '-h /tmp/s -p 1');
  assert.equal(o.psqlBin, '/usr/bin/psql');
  assert.ok(o.out.endsWith('x.json') && o.baseline.endsWith('b.json'));
});
