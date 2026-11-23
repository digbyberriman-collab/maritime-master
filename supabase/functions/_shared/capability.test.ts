import { assert, assertEquals, assertFalse, assertRejects } from 'jsr:@std/assert@1.0.13';
import { getAuthContext } from './auth.ts';
import { assertCapability, type CapabilityKey, hasCapability, legacyCapability } from './capability.ts';
import { HttpError } from './http.ts';
import { callsOf, fail, fakeClientFactory, type FakeWorld } from './testing/fakeSupabase.ts';
import { buildWorld, CO_A, CO_B, P, type Persona, request, TEST_ENV, V_A1, V_A2, V_A_SOLD, V_B1 } from './testing/world.ts';

const ctxFor = (world: FakeWorld, who: Persona) =>
  getAuthContext(request(who.token, {}), { env: TEST_ENV, createClient: fakeClientFactory(world) });

Deno.test('assertCapability: a company that is not the caller\'s → 403 cross_company, no RPC call', async () => {
  const world = buildWorld({ p3: true });
  const ctx = await ctxFor(world, P.adminA);
  const before = callsOf(world, 'rpc').length;
  const err = await assertRejects(() => assertCapability(ctx, 'admin.access.users_access.admin', { companyId: CO_B }), HttpError);
  assertEquals([err.status, err.code], [403, 'cross_company']);
  assertEquals(callsOf(world, 'rpc').length, before);
});

Deno.test('assertCapability: an explicit null company (target without a company) never passes', async () => {
  const world = buildWorld({ p3: true });
  const ctx = await ctxFor(world, P.adminA);
  const err = await assertRejects(() => assertCapability(ctx, 'admin.access.users_access.admin', { companyId: null }), HttpError);
  assertEquals([err.status, err.code], [403, 'forbidden']);
});

Deno.test('hasCapability: an unknown key is false without asking the database', async () => {
  const world = buildWorld({ p3: true });
  const ctx = await ctxFor(world, P.adminA);
  const before = world.calls.length;
  assertFalse(await hasCapability(ctx, 'admin.everything' as CapabilityKey));
  assertEquals(world.calls.length, before);
});

Deno.test('hasCapability: calls has_capability as the caller with the scope', async () => {
  const world = buildWorld({ p3: true });
  const ctx = await ctxFor(world, P.masterA);
  assert(await hasCapability(ctx, 'admin.access.users_access.assign', { companyId: CO_A, vesselId: V_A1 }));
  const call = callsOf(world, 'rpc').find((c) => c.fn === 'has_capability');
  assert(call);
  assertEquals(call.caller.role, 'user');
  assertEquals(call.args, { p_key: 'admin.access.users_access.assign', p_company_id: CO_A, p_vessel_id: V_A1 });
  assertFalse(await hasCapability(ctx, 'admin.access.users_access.assign', { companyId: CO_A, vesselId: V_A2 }));
  const err = await assertRejects(() => assertCapability(ctx, 'admin.access.users_access.admin', { companyId: CO_A }), HttpError);
  assertEquals([err.status, err.code], [403, 'forbidden']);
});

Deno.test('hasCapability: an RPC error that is not "missing" → 503, never the legacy rule', async () => {
  const world = buildWorld({ p3: true });
  const ctx = await ctxFor(world, P.adminA);
  world.rpcs.has_capability = () => fail('40001', 'serialization failure');
  const err = await assertRejects(() => hasCapability(ctx, 'admin.access.users_access.admin', { companyId: CO_A }), HttpError);
  assertEquals([err.status, err.code], [503, 'status_unavailable']);
});

// ---- Legacy fallback (has_capability missing, D-01) -------------------------------------------

Deno.test('legacy: profile dpa / shore_management are admins; crew is not', async () => {
  const world = buildWorld({ p3: false });
  assert(await hasCapability(await ctxFor(world, P.adminA), 'admin.access.users_access.admin', { companyId: CO_A }));
  assert(await hasCapability(await ctxFor(world, P.shoreA), 'fleet.operations.vessels.admin', { companyId: CO_A }));
  assertFalse(await hasCapability(await ctxFor(world, P.crewA), 'admin.access.users_access.view', { companyId: CO_A }));
});

Deno.test('legacy: an own-company (or company-less) user_roles dpa row counts; another company\'s does not', async () => {
  const world = buildWorld({ p3: false });
  const roles = (world.tables.user_roles ??= []);
  const ctx = await ctxFor(world, P.crewA);

  roles.push({ id: 'r1', user_id: P.crewA.userId, role: 'dpa', company_id: CO_B, is_active: true, expires_at: null });
  assertFalse(await hasCapability(ctx, 'admin.access.users_access.admin', { companyId: CO_A }), 'company B row ignored in A');

  roles.push({ id: 'r2', user_id: P.crewA.userId, role: 'superadmin', company_id: CO_A, is_active: false, expires_at: null });
  roles.push({ id: 'r3', user_id: P.crewA.userId, role: 'dpa', company_id: CO_A, is_active: true, expires_at: '2020-01-01T00:00:00Z' });
  assertFalse(await hasCapability(ctx, 'admin.access.users_access.admin', { companyId: CO_A }), 'inactive / expired rows ignored');

  roles.push({ id: 'r4', user_id: P.crewA.userId, role: 'dpa', company_id: CO_A, is_active: true, expires_at: null });
  assert(await hasCapability(ctx, 'admin.access.users_access.admin', { companyId: CO_A }), 'own-company dpa row counts');

  const world2 = buildWorld({ p3: false });
  (world2.tables.user_roles ??= []).push({ id: 'r5', user_id: P.crewA.userId, role: 'superadmin', company_id: null, is_active: true, expires_at: null });
  assert(await hasCapability(await ctxFor(world2, P.crewA), 'admin.access.users_access.admin', { companyId: CO_A }), 'company-less row counts');
});

Deno.test('legacy: an RBAC superadmin / dpa role, or settings admin, makes an admin', async () => {
  const world = buildWorld({ p3: false });
  (world.tables.rbac_roles_full ??= []).push({ user_id: P.crewA.userId, role_name: 'superadmin', is_fleet_wide: true });
  assert(await hasCapability(await ctxFor(world, P.crewA), 'admin.access.users_access.admin', { companyId: CO_A }));

  const world2 = buildWorld({ p3: false });
  world2.rpcs.user_has_permission = (args) => ({ data: args.p_module_key === 'settings' && args.p_permission === 'admin', error: null });
  assert(await hasCapability(await ctxFor(world2, P.crewA2), 'admin.access.users_access.view', { companyId: CO_A }));
});

Deno.test('legacy: a master may invite for their own vessel only (and not a Sold one)', async () => {
  const world = buildWorld({ p3: false });
  const ctx = await ctxFor(world, P.masterA);
  assert(await hasCapability(ctx, 'admin.access.users_access.assign', { companyId: CO_A, vesselId: V_A1 }));
  assertFalse(await hasCapability(ctx, 'admin.access.users_access.assign', { companyId: CO_A, vesselId: V_A2 }));
  assertFalse(await hasCapability(ctx, 'admin.access.users_access.assign', { companyId: CO_A }), 'no vessel → no master rule');
  assertFalse(await hasCapability(ctx, 'admin.access.users_access.admin', { companyId: CO_A }));
  (world.tables.crew_assignments ??= []).push({ id: 'x', user_id: P.masterA.userId, vessel_id: V_A_SOLD, is_current: true });
  assertFalse(await hasCapability(ctx, 'admin.access.users_access.assign', { companyId: CO_A, vesselId: V_A_SOLD }));
  (world.tables.crew_assignments ??= []).push({ id: 'y', user_id: P.masterA.userId, vessel_id: V_B1, is_current: true });
  assertFalse(await hasCapability(ctx, 'admin.access.users_access.assign', { companyId: CO_A, vesselId: V_B1 }), 'foreign vessel');
});

Deno.test('legacy: vessels.view = fleet reach or reach of the given vessel', async () => {
  const world = buildWorld({ p3: false });
  assert(await hasCapability(await ctxFor(world, P.crewA), 'fleet.operations.vessels.view', { companyId: CO_A, vesselId: V_A1 }));
  assertFalse(await hasCapability(await ctxFor(world, P.crewA), 'fleet.operations.vessels.view', { companyId: CO_A, vesselId: V_A2 }));
  (world.tables.rbac_roles_full ??= []).push({ user_id: P.crewA2.userId, role_name: 'fleet_master', is_fleet_wide: false });
  assert(await hasCapability(await ctxFor(world, P.crewA2), 'fleet.operations.vessels.view', { companyId: CO_A }));
});

Deno.test('legacy: roles_permissions.admin is never granted to a tenant; another company is refused', async () => {
  const world = buildWorld({ p3: false });
  const ctx = await ctxFor(world, P.adminA);
  assertFalse(await hasCapability(ctx, 'admin.access.roles_permissions.admin', { companyId: CO_A }));
  assertFalse(await legacyCapability(ctx, 'admin.access.users_access.admin', { companyId: CO_B }));
});

Deno.test('legacy: a read error while checking → 503 (fail closed)', async () => {
  const world = buildWorld({ p3: false });
  const ctx = await ctxFor(world, P.crewA);
  world.hooks.query = (q) => (q.table === 'user_roles' ? fail('XX000', 'boom') : undefined);
  const err = await assertRejects(() => hasCapability(ctx, 'admin.access.users_access.admin', { companyId: CO_A }), HttpError);
  assertEquals(err.code, 'status_unavailable');
});
