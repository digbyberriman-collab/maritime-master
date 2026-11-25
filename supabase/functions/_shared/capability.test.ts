import { assert, assertEquals, assertFalse, assertRejects } from 'jsr:@std/assert@1.0.13';
import { getAuthContext } from './auth.ts';
import { assertCapability, assertCapabilityForVessels, assertMayActOnUser, type CapabilityKey, hasCapability, legacyCapability } from './capability.ts';
import { HttpError } from './http.ts';
import { callsOf, fail, fakeClientFactory, type FakeWorld, ok } from './testing/fakeSupabase.ts';
import { buildWorld, CO_A, CO_B, P, type Persona, profileRow, request, TEST_ENV, V_A1, V_A2, V_A_SOLD, V_B1 } from './testing/world.ts';

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

// ---- assertMayActOnUser (D-194, D-195, D-207) ---------------------------------------------------

const targetOf = (who: Persona, patch: { kind?: string } = {}) => ({ companyId: who.companyId, userId: who.userId, profileId: who.profileId, role: who.role, ...patch });

async function refusal(promise: Promise<unknown>): Promise<[number, string, unknown]> {
  const err = await assertRejects(() => promise, HttpError);
  return [err.status, err.code, err.details?.reason];
}

Deno.test('assertMayActOnUser (P3): admin_may_act_on_user true passes; asked with the service client and the target ids', async () => {
  const world = buildWorld({ p3: true });
  await assertMayActOnUser(await ctxFor(world, P.adminA), targetOf(P.crewA));
  const call = callsOf(world, 'rpc').find((c) => c.fn === 'admin_may_act_on_user');
  assert(call);
  assertEquals(call.caller.role, 'service');
  assertEquals(call.args, { _actor: P.adminA.userId, _target_user: P.crewA.userId, _company: CO_A, _target_profile: P.crewA.profileId });
  // A vessel-scoped admin acts on a person of their own vessel.
  await assertMayActOnUser(await ctxFor(world, P.vesselAdminA), targetOf(P.crewA2));
});

Deno.test('assertMayActOnUser (P3): false → 403 out_of_reach (a vessel admin and a person elsewhere, the DPA, a vessel-less person)', async () => {
  const world = buildWorld({ p3: true });
  const ctx = await ctxFor(world, P.vesselAdminA);
  for (const who of [P.crewA, P.adminA, P.importedA]) {
    assertEquals(await refusal(assertMayActOnUser(ctx, targetOf(who))), [403, 'forbidden', 'out_of_reach'], who.key);
  }
  // Any answer but true is a refusal.
  world.hooks.rpc = (r) => (r.fn === 'admin_may_act_on_user' ? ok(null) : undefined);
  assertEquals(await refusal(assertMayActOnUser(await ctxFor(world, P.adminA), targetOf(P.crewA))), [403, 'forbidden', 'out_of_reach']);
});

Deno.test('assertMayActOnUser: an error that is not "missing" → 503; another or no company → 403 before any RPC', async () => {
  const world = buildWorld({ p3: true });
  const ctx = await ctxFor(world, P.adminA);
  world.hooks.rpc = (r) => (r.fn === 'admin_may_act_on_user' ? fail('40001', 'serialization failure') : undefined);
  assertEquals(await refusal(assertMayActOnUser(ctx, targetOf(P.crewA))), [503, 'status_unavailable', undefined]);
  world.hooks.rpc = undefined;
  const before = callsOf(world, 'rpc').length;
  assertEquals(await refusal(assertMayActOnUser(ctx, targetOf(P.crewB))), [403, 'cross_company', undefined]);
  assertEquals(await refusal(assertMayActOnUser(ctx, { ...targetOf(P.crewA), companyId: null })), [403, 'forbidden', undefined]);
  assertEquals(callsOf(world, 'rpc').length, before);
});

Deno.test('assertMayActOnUser (D-01, function missing): a full legacy admin passes; others only for people of vessels they are on', async () => {
  const world = buildWorld({ p3: false });
  await assertMayActOnUser(await ctxFor(world, P.adminA), targetOf(P.crewA2));
  const master = await ctxFor(world, P.masterA);
  await assertMayActOnUser(master, targetOf(P.importedA)); // waits for Aurora, the master's vessel (D-125)
  await assertMayActOnUser(master, targetOf(P.crewA)); // on Aurora
  assertEquals(await refusal(assertMayActOnUser(master, targetOf(P.crewA2))), [403, 'forbidden', 'out_of_reach'], 'on Borealis');
  assertEquals(await refusal(assertMayActOnUser(master, targetOf(P.shoreA))), [403, 'forbidden', 'out_of_reach'], 'an administrator');
  profileRow(world, P.importedA.profileId).imported_vessel_id = V_A2;
  assertEquals(await refusal(assertMayActOnUser(master, targetOf(P.importedA))), [403, 'forbidden', 'out_of_reach'], 'waits for Borealis');
  world.tables.crew_assignments = (world.tables.crew_assignments ?? []).filter((a) => a.user_id !== P.crewA.userId);
  assertEquals(await refusal(assertMayActOnUser(master, targetOf(P.crewA))), [403, 'forbidden', 'out_of_reach'], 'no vessel at all');
  // Every read is the service client's (never the caller's RLS view).
  assertFalse(callsOf(world, 'query').some((q) => q.table === 'crew_assignments' && q.caller.role !== 'service'));
});

Deno.test('assertMayActOnUser (D-01): a read error → 503 (fail closed)', async () => {
  const world = buildWorld({ p3: false });
  const ctx = await ctxFor(world, P.masterA);
  world.hooks.query = (q) => (q.table === 'crew_assignments' && q.caller.role === 'service' ? fail('XX000', 'boom') : undefined);
  assertEquals(await refusal(assertMayActOnUser(ctx, targetOf(P.crewA))), [503, 'status_unavailable', undefined]);
});

Deno.test('assertMayActOnUser: an administrator target needs a manager of administrators (role, kind, user_is_admin_target)', async () => {
  const world = buildWorld({ p3: true });
  const shore = await ctxFor(world, P.shoreA); // every vessel, does not manage administrators
  const dpa = await ctxFor(world, P.adminA);
  assertEquals(await refusal(assertMayActOnUser(shore, targetOf(P.adminA))), [403, 'forbidden', 'manages_admins_required'], 'role dpa');
  assertEquals(await refusal(assertMayActOnUser(shore, targetOf(P.importedA, { kind: 'admin' }))), [403, 'forbidden', 'manages_admins_required'], 'kind admin');
  await assertMayActOnUser(shore, targetOf(P.crewA));
  (world.tables.user_roles ??= []).push({ id: 'ur', user_id: P.crewA.userId, role: 'dpa', company_id: CO_A, is_active: true, expires_at: null });
  assertEquals(await refusal(assertMayActOnUser(shore, targetOf(P.crewA))), [403, 'forbidden', 'manages_admins_required'], 'user_is_admin_target');
  await assertMayActOnUser(dpa, targetOf(P.shoreA));
  await assertMayActOnUser(dpa, targetOf(P.crewA));
  const asked = callsOf(world, 'rpc').filter((c) => c.fn === 'user_manages_admins_for');
  assert(asked.length > 0 && asked.every((c) => c.caller.role === 'service'));

  world.hooks.rpc = (r) => (r.fn === 'user_manages_admins_for' ? fail('XX000', 'boom') : undefined);
  assertEquals(await refusal(assertMayActOnUser(dpa, targetOf(P.shoreA))), [503, 'status_unavailable', undefined]);
  world.hooks.rpc = (r) => (r.fn === 'user_is_admin_target' ? fail('XX000', 'boom') : undefined);
  assertEquals(await refusal(assertMayActOnUser(dpa, targetOf(P.crewA2))), [503, 'status_unavailable', undefined]);
});

Deno.test('assertMayActOnUser (D-01): manages-admins falls back to the legacy rule; user_is_admin_target missing → role and kind only', async () => {
  const world = buildWorld({ p3: true });
  delete world.rpcs.user_manages_admins_for;
  delete world.rpcs.user_is_admin_target;
  const shore = await ctxFor(world, P.shoreA);
  assertEquals(await refusal(assertMayActOnUser(shore, targetOf(P.adminA))), [403, 'forbidden', 'manages_admins_required']);
  (world.tables.user_roles ??= []).push({ id: 'ur', user_id: P.crewA.userId, role: 'dpa', company_id: CO_A, is_active: true, expires_at: null });
  await assertMayActOnUser(shore, targetOf(P.crewA)); // a user_roles row alone does not make an administrator target without the function
  world.tables.user_roles.push({ id: 'ur2', user_id: P.shoreA.userId, role: 'dpa', company_id: CO_A, is_active: true, expires_at: null });
  await assertMayActOnUser(shore, targetOf(P.adminA)); // now a manager (an own-company user_roles dpa row)
  const legacy = buildWorld({ p3: false });
  assertEquals(await refusal(assertMayActOnUser(await ctxFor(legacy, P.shoreA), targetOf(P.adminA))), [403, 'forbidden', 'manages_admins_required']);
  await assertMayActOnUser(await ctxFor(legacy, P.adminA), targetOf(P.shoreA));
});

Deno.test('assertCapabilityForVessels: every vessel must pass; a vessel-scoped admin gets out_of_reach, a master the plain refusal', async () => {
  const world = buildWorld({ p3: true });
  const vesselAdmin = await ctxFor(world, P.vesselAdminA);
  await assertCapabilityForVessels(vesselAdmin, 'admin.access.users_access.assign', CO_A, [V_A2]);
  await assertCapabilityForVessels(vesselAdmin, 'admin.access.users_access.assign', CO_A, []); // no vessel: SQL passes a NULL vessel
  assertEquals(await refusal(assertCapabilityForVessels(vesselAdmin, 'admin.access.users_access.assign', CO_A, [V_A2, V_A1])), [403, 'forbidden', 'out_of_reach']);
  const master = await ctxFor(world, P.masterA);
  await assertCapabilityForVessels(master, 'admin.access.users_access.assign', CO_A, [V_A1]);
  assertEquals(await refusal(assertCapabilityForVessels(master, 'admin.access.users_access.assign', CO_A, [V_A1, V_A2])), [403, 'forbidden', undefined]);
  assertEquals(await refusal(assertCapabilityForVessels(master, 'admin.access.users_access.assign', CO_A, [])), [403, 'forbidden', undefined]);
  assertEquals(await refusal(assertCapabilityForVessels(master, 'admin.access.users_access.assign', CO_B, [V_B1])), [403, 'cross_company', undefined]);
});
