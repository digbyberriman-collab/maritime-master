import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1.0.13';
import type { EmailMessage, EmailResult } from '../_shared/email.ts';
import type { EdgeEnv } from '../_shared/env.ts';
import { callsOf, fail, fakeClientFactory, type FakeWorld } from '../_shared/testing/fakeSupabase.ts';
import { bodyOf, buildWorld, CO_A, CO_B, envWith, obj, P, profileRow, request, TEST_ENV, V_A1, V_A_SOLD, V_B1 } from '../_shared/testing/world.ts';
import { createHandler } from './handler.ts';

const NOW = new Date('2026-11-23T10:00:00Z');
const PASSWORD = 'chosen-by-the-admin-123';

function setup(opts: { p3?: boolean; env?: EdgeEnv; results?: EmailResult[]; realFakeEmailCheck?: boolean } = {}) {
  const world = buildWorld({ p3: opts.p3 ?? true });
  const sent: EmailMessage[] = [];
  let i = 0;
  const handler = createHandler({
    env: () => opts.env ?? TEST_ENV,
    createClient: fakeClientFactory(world),
    now: () => NOW,
    invite: {
      now: () => NOW,
      ...(opts.realFakeEmailCheck ? {} : { isFakeEmail: () => false }),
      sendEmail: (m) => {
        sent.push(m);
        return Promise.resolve(opts.results?.[i++] ?? { ok: true, providerMessageId: 'msg-1' });
      },
    },
  });
  return { world, sent, handler };
}

const NEW_EMAIL = 'new-deckhand@example.test';
const body = (patch: Record<string, unknown> = {}) => ({ email: NEW_EMAIL, firstName: 'New', lastName: 'Deckhand', ...patch });
const create = (h: ReturnType<typeof setup>, token: string | null, b: unknown) => h.handler(request(token, b));

async function errorOf(res: Response): Promise<Record<string, unknown>> {
  return obj(await bodyOf(res), 'error');
}

const created = (world: FakeWorld) => (world.tables.profiles ?? []).filter((p) => p.email === NEW_EMAIL);
const writes = (world: FakeWorld) => callsOf(world, 'query').filter((q) => q.op !== 'select');

Deno.test('create-crew-member: 201, the profile starts not_invited with no login, then the invitation makes it invited', async () => {
  for (const p3 of [true, false]) {
    const h = setup({ p3 });
    const res = await create(h, P.adminA.token, body({ vesselId: V_A1, position: 'Deckhand', joinDate: '2026-12-01', rank: 'AB', companyId: CO_A }));
    assertEquals(res.status, 201, `p3=${p3}`);
    const answer = await bodyOf(res);
    const [profile] = created(h.world);
    assert(profile, 'profile created');
    assertEquals(answer.ok, true);
    assertEquals(answer.profileId, profile.id);
    const invitation = obj(answer, 'invitation');
    assertEquals(invitation.status, 'sent');
    assertEquals(invitation.stored, p3);
    assertEquals(answer.assignment, 'created');

    const insert = callsOf(h.world, 'query').find((q) => q.table === 'profiles' && q.op === 'insert');
    assert(insert);
    assertEquals(insert.caller.role, 'service');
    const values = insert.values as Record<string, unknown>;
    assertEquals([values.account_status, values.user_id, values.role, values.company_id, values.imported_vessel_id], ['not_invited', null, 'crew', CO_A, V_A1]);

    assertEquals(profile.account_status, 'invited', 'invited only after the send worked');
    assert(typeof profile.user_id === 'string', 'the invitation linked the login');
    // The fake has no createUser / inviteUserByEmail: the only auth call that makes a login is the invite link.
    assertEquals(callsOf(h.world, 'admin').filter((c) => c.method === 'generateLink').map((c) => c.args.type), ['invite']);
    assertEquals(h.sent.length, 1);
    assertEquals(h.sent[0].template, 'CREW_INVITATION');
    assertEquals(h.sent[0].variables.vessel_name, 'Aurora');

    const assignment = (h.world.tables.crew_assignments ?? []).find((a) => a.user_id === profile.user_id);
    assert(assignment, `p3=${p3}`);
    assertEquals([assignment.vessel_id, assignment.position, assignment.join_date, assignment.is_current], [V_A1, 'Deckhand', '2026-12-01', true]);
  }
});

Deno.test('create-crew-member: sendInvite false → 201 not_sent; the vessel waits on imported_vessel_id (no login yet)', async () => {
  const h = setup();
  const res = await create(h, P.adminA.token, body({ vesselId: V_A1, sendInvite: false }));
  assertEquals(res.status, 201);
  const answer = await bodyOf(res);
  assertEquals(obj(answer, 'invitation'), { status: 'not_sent' });
  assertEquals(answer.assignment, 'pending_login');
  const [profile] = created(h.world);
  assertEquals([profile.account_status, profile.user_id, profile.imported_vessel_id, profile.is_imported], ['not_invited', null, V_A1, true]);
  assertEquals(callsOf(h.world, 'admin').length, 0);
  assertEquals(h.sent.length, 0);
});

Deno.test('create-crew-member: a failed email → 502 partial_failure { profileCreated, profileId, invitation: send_failed, email_error }', async () => {
  const h = setup({ results: [{ ok: false, errorCode: 'provider_unavailable' }] });
  const res = await create(h, P.adminA.token, body());
  assertEquals(res.status, 502);
  const error = await errorOf(res);
  const [profile] = created(h.world);
  assertEquals(error.code, 'partial_failure');
  assertEquals(error.details, { profileCreated: true, profileId: profile.id, invitation: 'send_failed', email_error: 'provider_unavailable' });
  assertEquals(profile.account_status, 'not_invited', 'never stamped invited after a failed send');
});

Deno.test('create-crew-member: the assignment fails → 502 partial_failure { profileCreated, profileId, assignmentCreated: false } + invitation', async () => {
  const h = setup();
  h.world.hooks.query = (q) => (q.table === 'crew_assignments' && q.op === 'insert' ? fail('XX000', 'boom') : undefined);
  const res = await create(h, P.adminA.token, body({ vesselId: V_A1 }));
  assertEquals(res.status, 502);
  const answer = await bodyOf(res);
  const error = obj(answer, 'error');
  const [profile] = created(h.world);
  assertEquals(error.code, 'partial_failure');
  assertEquals(error.details, { profileCreated: true, profileId: profile.id, assignmentCreated: false });
  assertEquals(obj(answer, 'invitation').status, 'sent');
});

Deno.test('create-crew-member: a disabled caller → 403 account_disabled, nothing written', async () => {
  for (const p3 of [true, false]) {
    const h = setup({ p3 });
    profileRow(h.world, P.disabledA.profileId).role = 'dpa';
    const res = await create(h, P.disabledA.token, body());
    assertEquals(res.status, 403, `p3=${p3}`);
    assertEquals((await errorOf(res)).code, 'account_disabled');
    assertEquals(writes(h.world).length, 0);
  }
});

Deno.test('create-crew-member: an expired, or another company\'s, dpa user_roles row never counts (CC-5) → 403', async () => {
  for (const p3 of [true, false]) {
    for (const row of [
      { company_id: CO_B, expires_at: null },
      { company_id: CO_A, expires_at: '2020-01-01T00:00:00Z' },
      { company_id: CO_A, expires_at: null, is_active: false },
    ]) {
      const h = setup({ p3 });
      (h.world.tables.user_roles ??= []).push({ id: 'ur-1', user_id: P.crewA.userId, role: 'dpa', is_active: true, ...row });
      const res = await create(h, P.crewA.token, body());
      assertEquals(res.status, 403, `p3=${p3} ${JSON.stringify(row)}`);
      assertEquals((await errorOf(res)).code, 'forbidden');
      assertEquals(writes(h.world).length, 0);
    }
    // Control: an active, unexpired row of the caller's company does count.
    const ok = setup({ p3 });
    (ok.world.tables.user_roles ??= []).push({ id: 'ur-2', user_id: P.crewA.userId, role: 'dpa', is_active: true, company_id: CO_A, expires_at: null });
    assertEquals((await create(ok, P.crewA.token, body())).status, 201, `p3=${p3}`);
  }
});

Deno.test('create-crew-member: admin roles are refused (403 admin_role); unknown roles are 400; crew roles pass', async () => {
  for (const role of ['dpa', 'shore_management', 'DPA']) {
    const h = setup();
    const res = await create(h, P.adminA.token, body({ role }));
    assertEquals(res.status, 403, role);
    const error = await errorOf(res);
    assertEquals([error.code, error.message, error.details], ['forbidden', 'Admin roles are given in Users & Access.', { reason: 'admin_role' }]);
    assertEquals(writes(h.world).length, 0);
  }
  const unknown = setup();
  const res = await create(unknown, P.adminA.token, body({ role: 'superadmin' }));
  assertEquals(res.status, 400);
  assertEquals((await errorOf(res)).details, { field: 'role' });
  for (const role of ['master', 'Chief_Officer', 'chief_engineer']) {
    const h = setup();
    assertEquals((await create(h, P.adminA.token, body({ role }))).status, 201, role);
    assertEquals(created(h.world)[0].role, role.toLowerCase());
  }
});

Deno.test('create-crew-member: another company\'s vessel → 404, nothing written', async () => {
  const h = setup();
  const res = await create(h, P.adminA.token, body({ vesselId: V_B1, position: 'Deckhand', joinDate: '2026-12-01' }));
  assertEquals(res.status, 404);
  assertEquals((await errorOf(res)).code, 'not_found');
  assertEquals(writes(h.world).length, 0);
  assertEquals((h.world.tables.crew_assignments ?? []).filter((a) => a.vessel_id === V_B1).length, 0);
});

Deno.test('create-crew-member: an archived vessel → 409 vessel_archived, nothing written', async () => {
  const h = setup();
  const res = await create(h, P.adminA.token, body({ vesselId: V_A_SOLD }));
  assertEquals(res.status, 409);
  assertEquals(((await errorOf(res)).details as Record<string, unknown>).reason, 'vessel_archived');
  assertEquals(writes(h.world).length, 0);
});

Deno.test('create-crew-member: a body companyId that is not the caller\'s → 403 cross_company', async () => {
  const h = setup();
  const res = await create(h, P.adminA.token, body({ companyId: CO_B }));
  assertEquals(res.status, 403);
  assertEquals((await errorOf(res)).code, 'cross_company');
  assertEquals(writes(h.world).length, 0);
});

Deno.test('create-crew-member: a password in the body never reaches auth or the database', async () => {
  const h = setup();
  const res = await create(h, P.adminA.token, body({ password: PASSWORD, vesselId: V_A1 }));
  assertEquals(res.status, 201);
  assertFalse(JSON.stringify(h.world.calls).includes(PASSWORD));
  assertFalse(JSON.stringify(h.world.tables).includes(PASSWORD));
  assertEquals(callsOf(h.world, 'admin').filter((c) => c.method === 'updateUserById').length, 0);
});

Deno.test('create-crew-member: an email already used by any profile → 409 with copy that names nobody', async () => {
  const h = setup();
  for (const email of [P.crewB.email.toUpperCase(), ` ${P.crewA.email} `]) {
    const res = await create(h, P.adminA.token, body({ email }));
    assertEquals(res.status, 409, email);
    const error = await errorOf(res);
    assertEquals(error.code, 'conflict');
    assertFalse(JSON.stringify(error).includes('Demo Fleet'));
    assertFalse(JSON.stringify(error).includes('@'));
  }
  // `_` and `%` are literal: a near miss is not a duplicate.
  assertEquals((await create(h, P.adminA.token, body({ email: 'crew_a@example.test' }))).status, 201);
  assertEquals(writes(h.world).filter((q) => q.table === 'profiles' && q.op === 'insert').length, 1);
});

Deno.test('create-crew-member: placeholder address 400; STORM_SITE_URL missing 500; both before any write', async () => {
  const real = setup({ realFakeEmailCheck: true });
  const r1 = await create(real, P.adminA.token, body({ email: 'deckhand@example.com' }));
  assertEquals(r1.status, 400);
  assertEquals(((await errorOf(r1)).details as Record<string, unknown>).reason, 'placeholder_email');
  assertEquals(writes(real.world).length, 0);

  const noSite = setup({ env: envWith({ siteUrl: null }) });
  const r2 = await create(noSite, P.adminA.token, body());
  assertEquals(r2.status, 500);
  assertEquals((await errorOf(r2)).code, 'server_misconfigured');
  assertEquals(writes(noSite.world).length, 0);
  assertEquals((await create(noSite, P.adminA.token, body({ sendInvite: false }))).status, 201, 'no invitation, no link needed');
});

Deno.test('create-crew-member: no JWT 401, crew 403, a master 403 (admin capability), bad body 400, GET 405', async () => {
  const h = setup();
  assertEquals((await create(h, null, body())).status, 401);
  assertEquals((await create(h, P.crewA.token, body())).status, 403);
  assertEquals((await create(h, P.masterA.token, body({ vesselId: V_A1 }))).status, 403);
  for (const bad of [{}, body({ email: '' }), body({ vesselId: 'nope' }), body({ joinDate: '2026-02-30' }), body({ sendInvite: 'yes' })]) {
    const res = await create(h, P.adminA.token, bad);
    assertEquals(res.status, 400, JSON.stringify(bad));
  }
  assertEquals(writes(h.world).length, 0);
  assertEquals((await h.handler(request(P.adminA.token, null, { method: 'GET' }))).status, 405);
});
