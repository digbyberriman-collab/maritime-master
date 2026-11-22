import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseSelect,
  parseFilters,
  matchesFilter,
  parseOrder,
  sortRows,
  splitTopLevel,
  singular,
  handleRest,
} from '../lib/postgrest.mjs';

const V1 = 'e0000000-0000-4000-8000-000000000001';
const V2 = 'e0000000-0000-4000-8000-000000000002';

const makeDb = () => ({
  tables: {
    vessels: [
      { id: V1, name: 'DRAAK', status: 'Active', company_id: 'c1', gross_tonnage: 1650 },
      { id: V2, name: 'GAME CHANGER', status: 'Sold', company_id: 'c1', gross_tonnage: 1480 },
    ],
    profiles: [
      { id: 'p1', user_id: 'u1', first_name: 'Demo', last_name: 'Master', status: 'Active', company_id: 'c1', medical_expiry: null },
      { id: 'p2', user_id: 'u2', first_name: 'Demo', last_name: 'Bosun', status: 'Active', company_id: 'c1', medical_expiry: '2026-01-01' },
    ],
    crew_assignments: [
      { id: 'ca1', user_id: 'u1', vessel_id: V1, is_current: true, position: 'Master' },
      { id: 'ca2', user_id: 'u2', vessel_id: V2, is_current: false, position: 'Bosun' },
    ],
    certificates: [
      { id: 'cert1', vessel_id: V1, user_id: null, certificate_name: 'SMC', tags: ['ism', 'flag'], expiry_date: '2026-12-01' },
    ],
  },
  rpc: { get_user_roles_full: [{ role_name: 'dpa' }], flag: true },
  missingTables: new Set(['pending_table']),
  newId: () => 'new-id',
  now: () => new Date('2026-11-22T10:00:00Z'),
});

const req = (method, path, headers = {}, body = null) => ({
  method,
  url: new URL(`http://127.0.0.1:54399${path}`),
  headers,
  body,
});

test('splitTopLevel keeps nested parentheses and quotes together', () => {
  assert.deepEqual(splitTopLevel('a,b(c,d),"e,f"'), ['a', 'b(c,d)', '"e,f"']);
});

test('singular handles the table names the app uses', () => {
  assert.equal(singular('vessels'), 'vessel');
  assert.equal(singular('companies'), 'company');
  assert.equal(singular('profiles'), 'profile');
  assert.equal(singular('crew'), 'crew');
});

test('parseSelect understands aliases, casts, hints and FK-column embeds', () => {
  const items = parseSelect('id, name::text, label:name, vessels:vessel_id (id, name), profiles!inner(first_name), ...companies(name)');
  assert.equal(items[0].column, 'id');
  assert.equal(items[1].column, 'name');
  assert.deepEqual([items[2].alias, items[2].column], ['label', 'name']);
  assert.deepEqual([items[3].kind, items[3].alias, items[3].name], ['embed', 'vessels', 'vessel_id']);
  assert.equal(items[4].inner, true);
  assert.equal(items[5].spread, true);
});

test('filters: eq, neq (NULL excluded), in, is, gte, ilike, cs and or-groups', () => {
  const rows = makeDb().tables.profiles;
  const run = (qs) => {
    const filters = parseFilters(new URLSearchParams(qs));
    return rows.filter((r) => filters.every((f) => matchesFilter(r, f))).map((r) => r.id);
  };
  assert.deepEqual(run('user_id=eq.u2'), ['p2']);
  assert.deepEqual(run('medical_expiry=neq.2026-01-01'), []);
  assert.deepEqual(run('user_id=in.(u1,u3)'), ['p1']);
  assert.deepEqual(run('medical_expiry=is.null'), ['p1']);
  assert.deepEqual(run('medical_expiry=not.is.null'), ['p2']);
  assert.deepEqual(run('medical_expiry=gte.2025-06-01'), ['p2']);
  assert.deepEqual(run('last_name=ilike.*bos*'), ['p2']);
  assert.deepEqual(run('or=(last_name.eq.Master,user_id.eq.u2)'), ['p1', 'p2']);
  assert.deepEqual(run('or=(last_name.eq.Nobody,and(user_id.eq.u2,status.eq.Active))'), ['p2']);
  // Filters on embedded resources are ignored rather than dropping rows.
  assert.deepEqual(run('vessels.name=eq.DRAAK'), ['p1', 'p2']);
  // Unknown operators keep the row.
  assert.deepEqual(run('last_name=xyz.1'), ['p1', 'p2']);

  const certs = makeDb().tables.certificates;
  const cs = parseFilters(new URLSearchParams('tags=cs.{ism}'));
  assert.equal(certs.filter((r) => cs.every((f) => matchesFilter(r, f))).length, 1);
});

test('order sorts with PostgreSQL null placement', () => {
  const rows = [{ v: 2 }, { v: null }, { v: 1 }];
  assert.deepEqual(sortRows(rows, parseOrder('v.asc')).map((r) => r.v), [1, 2, null]);
  assert.deepEqual(sortRows(rows, parseOrder('v.desc')).map((r) => r.v), [null, 2, 1]);
  assert.deepEqual(sortRows(rows, parseOrder('v.desc.nullslast')).map((r) => r.v), [2, 1, null]);
});

test('GET returns filtered, ordered, projected rows', () => {
  const res = handleRest(makeDb(), req('GET', '/rest/v1/vessels?select=id,name&status=neq.Sold&order=name.asc'));
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), [{ id: V1, name: 'DRAAK' }]);
  assert.equal(res.meta.fixture, true);
});

test('a selected column missing from the fixture comes back as null', () => {
  const res = handleRest(makeDb(), req('GET', '/rest/v1/vessels?select=id,mmsi&id=eq.' + V1));
  assert.deepEqual(JSON.parse(res.body), [{ id: V1, mmsi: null }]);
});

test('embeds resolve many-to-one through FK columns and hints, one-to-many by back reference', () => {
  const db = makeDb();
  const viaColumn = JSON.parse(handleRest(db, req('GET', '/rest/v1/crew_assignments?select=id,vessels:vessel_id(id,name)&is_current=eq.true')).body);
  assert.deepEqual(viaColumn, [{ id: 'ca1', vessels: { id: V1, name: 'DRAAK' } }]);

  const viaName = JSON.parse(handleRest(db, req('GET', '/rest/v1/crew_assignments?select=id,vessels(name)&id=eq.ca2')).body);
  assert.deepEqual(viaName, [{ id: 'ca2', vessels: { name: 'GAME CHANGER' } }]);

  // profiles are matched on user_id when the FK holds an auth user id.
  const viaHint = JSON.parse(handleRest(db, req('GET', '/rest/v1/crew_assignments?select=id,profile:profiles!crew_assignments_user_id_fkey(last_name)&id=eq.ca1')).body);
  assert.deepEqual(viaHint, [{ id: 'ca1', profile: { last_name: 'Master' } }]);

  const nullFk = JSON.parse(handleRest(db, req('GET', '/rest/v1/certificates?select=id,profiles:user_id(first_name)')).body);
  assert.deepEqual(nullFk, [{ id: 'cert1', profiles: null }]);

  const oneToMany = JSON.parse(handleRest(db, req('GET', `/rest/v1/vessels?select=name,crew_assignments(position)&id=eq.${V1}`)).body);
  assert.deepEqual(oneToMany, [{ name: 'DRAAK', crew_assignments: [{ position: 'Master' }] }]);

  const count = JSON.parse(handleRest(db, req('GET', `/rest/v1/vessels?select=name,crew_assignments(count)&id=eq.${V1}`)).body);
  assert.deepEqual(count, [{ name: 'DRAAK', crew_assignments: [{ count: 1 }] }]);

  const inner = JSON.parse(handleRest(db, req('GET', '/rest/v1/profiles?select=id,crew_assignments!inner(position)&crew_assignments.is_current=eq.true')).body);
  assert.deepEqual(inner.map((r) => r.id), ['p1', 'p2']);
});

test('single object: one row → object, otherwise 406 PGRST116', () => {
  const db = makeDb();
  const one = handleRest(db, req('GET', `/rest/v1/vessels?id=eq.${V1}`, { accept: 'application/vnd.pgrst.object+json' }));
  assert.equal(one.status, 200);
  assert.equal(JSON.parse(one.body).name, 'DRAAK');

  const none = handleRest(db, req('GET', '/rest/v1/vessels?id=eq.nope', { accept: 'application/vnd.pgrst.object+json' }));
  assert.equal(none.status, 406);
  const err = JSON.parse(none.body);
  assert.equal(err.code, 'PGRST116');
  // postgrest-js turns this into data: null for .maybeSingle() because details mention "0 rows".
  assert.match(err.details, /0 rows/);

  const many = handleRest(db, req('GET', '/rest/v1/vessels', { accept: 'application/vnd.pgrst.object+json' }));
  assert.equal(many.status, 406);
});

test('counts, HEAD, limit/offset and Range', () => {
  const db = makeDb();
  const head = handleRest(db, req('HEAD', '/rest/v1/profiles?status=eq.Active', { prefer: 'count=exact' }));
  assert.equal(head.body, '');
  assert.equal(head.headers['content-range'], '0-1/2');

  const page = handleRest(db, req('GET', '/rest/v1/profiles?limit=1&offset=1&order=id.asc', { prefer: 'count=exact' }));
  assert.deepEqual(JSON.parse(page.body).map((r) => r.id), ['p2']);
  assert.equal(page.headers['content-range'], '1-1/2');

  const ranged = handleRest(db, req('GET', '/rest/v1/profiles?order=id.asc', { range: '0-0' }));
  assert.deepEqual(JSON.parse(ranged.body).map((r) => r.id), ['p1']);

  const empty = handleRest(db, req('GET', '/rest/v1/profiles?user_id=eq.none', { prefer: 'count=exact' }));
  assert.equal(empty.headers['content-range'], '*/0');
});

test('tables without a fixture answer [], missing tables answer PGRST205', () => {
  const db = makeDb();
  const unknown = handleRest(db, req('GET', '/rest/v1/never_seeded?select=*'));
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body, '[]');
  assert.equal(unknown.meta.fixture, false);

  const missing = handleRest(db, req('GET', '/rest/v1/pending_table'));
  assert.equal(missing.status, 404);
  assert.equal(JSON.parse(missing.body).code, 'PGRST205');
});

test('RPC: fixture value, null when absent, single object on request', () => {
  const db = makeDb();
  assert.deepEqual(JSON.parse(handleRest(db, req('POST', '/rest/v1/rpc/get_user_roles_full', {}, { p_user_id: 'u1' })).body), [{ role_name: 'dpa' }]);
  assert.equal(handleRest(db, req('POST', '/rest/v1/rpc/flag')).body, 'true');
  const absent = handleRest(db, req('POST', '/rest/v1/rpc/not_there'));
  assert.equal(absent.body, 'null');
  assert.equal(absent.meta.fixture, false);
  const single = handleRest(db, req('POST', '/rest/v1/rpc/get_user_roles_full', { accept: 'application/vnd.pgrst.object+json' }));
  assert.deepEqual(JSON.parse(single.body), { role_name: 'dpa' });
});

test('writes: insert with representation, upsert, update and delete stay in memory', () => {
  const db = makeDb();
  const insert = handleRest(db, req('POST', '/rest/v1/user_preferences?select=*', { prefer: 'return=representation', accept: 'application/vnd.pgrst.object+json' }, { user_id: 'u1', theme: 'dark' }));
  assert.equal(insert.status, 201);
  assert.equal(JSON.parse(insert.body).id, 'new-id');
  assert.equal(db.tables.user_preferences.length, 1);

  const upsert = handleRest(db, req('POST', '/rest/v1/user_preferences?on_conflict=user_id', { prefer: 'resolution=merge-duplicates,return=minimal' }, { user_id: 'u1', theme: 'light' }));
  assert.equal(upsert.status, 201);
  assert.equal(upsert.body, '');
  assert.equal(db.tables.user_preferences.length, 1);
  assert.equal(db.tables.user_preferences[0].theme, 'light');

  const patch = handleRest(db, req('PATCH', '/rest/v1/profiles?id=eq.p1', { prefer: 'return=representation' }, { last_name: 'Captain' }));
  assert.equal(patch.status, 200);
  assert.equal(db.tables.profiles[0].last_name, 'Captain');

  const del = handleRest(db, req('DELETE', '/rest/v1/profiles?id=eq.p2'));
  assert.equal(del.status, 204);
  assert.equal(db.tables.profiles.length, 1);
});
