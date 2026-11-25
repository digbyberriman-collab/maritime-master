import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1.0.13';
import type { EmailMessage, EmailResult } from '../_shared/email.ts';
import type { EdgeEnv } from '../_shared/env.ts';
import { callsOf, fakeClientFactory, type FakeWorld } from '../_shared/testing/fakeSupabase.ts';
import { bodyOf, buildWorld, CO_A, envWith, obj, P, profileRow, request, TEST_ENV, V_A1 } from '../_shared/testing/world.ts';
import { createHandler } from './handler.ts';

const NOW = new Date('2026-11-23T10:00:00Z');

function setup(opts: { p3?: boolean; env?: EdgeEnv; results?: EmailResult[]; realFakeEmailCheck?: boolean } = {}) {
  const world = buildWorld({ p3: opts.p3 ?? true });
  const sent: EmailMessage[] = [];
  let i = 0;
  const handler = createHandler({
    env: () => opts.env ?? TEST_ENV,
    createClient: fakeClientFactory(world),
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

const invite = (h: ReturnType<typeof setup>, token: string | null, body: unknown) => h.handler(request(token, body));

function generatedLinks(world: FakeWorld): unknown[] {
  return callsOf(world, 'admin').filter((c) => c.method === 'generateLink').map((c) => c.args.type);
}

Deno.test('send-invitation: 200 sent with the stored invitation id', async () => {
  const h = setup();
  const res = await invite(h, P.adminA.token, { profileId: P.importedA.profileId, redirectTo: 'https://evil.test/phish' });
  assertEquals(res.status, 200);
  const body = await bodyOf(res);
  assertEquals(body.ok, true);
  const invitation = obj(body, 'invitation');
  assertEquals(invitation.status, 'sent');
  assertEquals(invitation.stored, true);
  assert(typeof invitation.id === 'string');
  // importedA waits on Aurora: the invitation linked a login, so the vessel is assigned (D-199).
  assertEquals(body.assignment, 'created');
  const userId = profileRow(h.world, P.importedA.profileId).user_id;
  assertEquals((h.world.tables.crew_assignments ?? []).filter((a) => a.user_id === userId && a.is_current).map((a) => a.vessel_id), [V_A1]);
  // The client redirectTo is ignored: the link lands on STORM_SITE_URL.
  const link = callsOf(h.world, 'admin').find((c) => c.method === 'generateLink');
  const options = link?.args.options as { redirectTo?: string } | undefined;
  assertEquals(options?.redirectTo, 'https://app.storm.test/reset-password?flow=invite');
  assertFalse(JSON.stringify(h.world.calls).includes('evil.test'));
});

Deno.test('send-invitation: 502 send_failed with details.email_error; never "sent"; profile not stamped', async () => {
  const h = setup({ results: [{ ok: false, errorCode: 'provider_rejected' }] });
  const res = await invite(h, P.adminA.token, { profileId: P.importedA.profileId });
  assertEquals(res.status, 502);
  const body = await bodyOf(res);
  assertEquals(obj(body, 'error').code, 'send_failed');
  assertEquals(obj(obj(body, 'error'), 'details'), { email_error: 'provider_rejected' });
  assertEquals(obj(body, 'invitation').status, 'send_failed');
  assertEquals(obj(body, 'invitation').stored, true);
  assertEquals(body.assignment, 'created', 'the recorded failure still linked the login (D-199)');
  assertFalse(JSON.stringify(body).includes('"sent"'));
  assertEquals(profileRow(h.world, P.importedA.profileId).account_status, 'not_invited');
});

Deno.test('send-invitation: RPCs missing (D-01) → stored:false; legacy columns only on success', async () => {
  const h = setup({ p3: false });
  const res = await invite(h, P.adminA.token, { profileId: P.importedA.profileId });
  assertEquals(res.status, 200);
  const answer = await bodyOf(res);
  assertEquals(obj(answer, 'invitation'), { status: 'sent', stored: false, id: null });
  assertEquals(answer.assignment, 'created', 'D-01: the edge wrote the assignment');
  assertEquals(profileRow(h.world, P.importedA.profileId).account_status, 'invited');

  const failing = setup({ p3: false, results: [{ ok: false, errorCode: 'not_configured' }] });
  const r2 = await invite(failing, P.adminA.token, { profileId: P.importedA.profileId });
  assertEquals(r2.status, 502);
  const failed = await bodyOf(r2);
  assertEquals(obj(failed, 'invitation'), { status: 'send_failed', stored: false, id: null });
  assertFalse('assignment' in failed, 'a D-01 failure links no login, so nothing was assigned or claimed');
  assertEquals(profileRow(failing.world, P.importedA.profileId).account_status, 'not_invited');
});

Deno.test('send-invitation: cooldown → 429 with Retry-After', async () => {
  const h = setup();
  profileRow(h.world, P.invitedA.profileId).last_invited_at = new Date(NOW.getTime() - 2 * 60_000).toISOString();
  const res = await invite(h, P.adminA.token, { profileId: P.invitedA.profileId });
  assertEquals(res.status, 429);
  assertEquals(res.headers.get('Retry-After'), '180');
  assertEquals(obj(await bodyOf(res), 'error').code, 'cooldown');
  assertEquals(h.sent.length, 0);
});

Deno.test('send-invitation: an active member → 409 already_active', async () => {
  const h = setup();
  const res = await invite(h, P.adminA.token, { profileId: P.crewA.profileId });
  assertEquals(res.status, 409);
  assertEquals(obj(await bodyOf(res), 'error').code, 'already_active');
});

Deno.test('send-invitation: another company\'s profile is not visible → 404', async () => {
  const h = setup();
  const res = await invite(h, P.adminB.token, { profileId: P.importedA.profileId });
  assertEquals(res.status, 404);
  assertEquals(obj(await bodyOf(res), 'error').code, 'not_found');
  assertEquals(generatedLinks(h.world).length, 0);
});

Deno.test('send-invitation: a placeholder address is refused by the real check', async () => {
  const h = setup({ realFakeEmailCheck: true });
  const res = await invite(h, P.adminA.token, { profileId: P.importedA.profileId });
  assertEquals(res.status, 400);
  const error = obj(await bodyOf(res), 'error');
  assertEquals(error.code, 'invalid_request');
  assertEquals(obj(error, 'details').reason, 'placeholder_email');
});

Deno.test('send-invitation: STORM_SITE_URL missing → 500, nothing read, sent or stamped', async () => {
  const h = setup({ env: envWith({ siteUrl: null }) });
  const res = await invite(h, P.adminA.token, { profileId: P.importedA.profileId });
  assertEquals(res.status, 500);
  const error = obj(await bodyOf(res), 'error');
  assertEquals(error.code, 'server_misconfigured');
  assertEquals(obj(error, 'details'), { missing: 'STORM_SITE_URL' });
  assertEquals(h.sent.length, 0);
  assertEquals(callsOf(h.world, 'admin').length, 0);
  assertEquals(callsOf(h.world, 'query').filter((q) => q.op !== 'select').length, 0);
  assertEquals(profileRow(h.world, P.importedA.profileId).account_status, 'not_invited');
});

Deno.test('send-invitation: auth rejections (no JWT, bad JWT, disabled, crew without capability)', async () => {
  const h = setup();
  const cases: Array<[string | null, number, string]> = [
    [null, 401, 'unauthorized'],
    ['forged-token', 401, 'unauthorized'],
    [P.disabledA.token, 403, 'account_disabled'],
    [P.crewA.token, 403, 'forbidden'],
  ];
  for (const [token, status, code] of cases) {
    const res = await invite(h, token, { profileId: P.importedA.profileId });
    assertEquals(res.status, status, String(token));
    assertEquals(obj(await bodyOf(res), 'error').code, code);
  }
  assertEquals(h.sent.length, 0);
});

Deno.test('send-invitation: legacy userId is resolved through the caller\'s RLS view', async () => {
  const h = setup();
  const res = await invite(h, P.adminA.token, { userId: P.invitedA.userId });
  assertEquals(res.status, 200);
  assertEquals(h.sent[0].to, P.invitedA.email);
  assertFalse('assignment' in (await bodyOf(res)), 'already on a vessel: no assignment step');
  const other = await invite(h, P.adminB.token, { userId: P.invitedA.userId });
  assertEquals(other.status, 404);
});

Deno.test('send-invitation: bad bodies → 400; GET → 405; preflight → 204', async () => {
  const h = setup();
  for (const body of ['not json', [], { profileId: 'not-a-uuid' }, {}]) {
    const res = await invite(h, P.adminA.token, body);
    assertEquals(res.status, 400, JSON.stringify(body));
    assertEquals(obj(await bodyOf(res), 'error').code, 'invalid_request');
  }
  assertEquals((await h.handler(request(P.adminA.token, null, { method: 'GET' }))).status, 405);
  assertEquals((await h.handler(request(null, null, { method: 'OPTIONS' }))).status, 204);
  assertEquals(CO_A.length, 36);
});

Deno.test('send-invitation: a vessel-scoped admin → 403 out_of_reach for a person on another vessel and for the DPA; no link, no email', async () => {
  const h = setup();
  profileRow(h.world, P.crewA.profileId).account_status = 'invited';
  for (const target of [P.crewA, P.adminA]) {
    const res = await invite(h, P.vesselAdminA.token, { profileId: target.profileId });
    assertEquals(res.status, 403, target.key);
    const error = obj(await bodyOf(res), 'error');
    assertEquals([error.code, error.message], ['forbidden', 'You can only do this for people on the vessels you administer.']);
    assertEquals(obj(error, 'details'), { reason: 'out_of_reach' });
  }
  assertEquals(generatedLinks(h.world).length, 0);
  assertEquals(h.sent.length, 0);
  assertEquals(callsOf(h.world, 'admin').filter((c) => c.method === 'updateUserById').length, 0);
});

Deno.test('send-invitation: an admin of every vessel who does not manage admins → 403 manages_admins_required for an administrator', async () => {
  const h = setup();
  profileRow(h.world, P.importedA.profileId).role = 'shore_management';
  const res = await invite(h, P.shoreA.token, { profileId: P.importedA.profileId });
  assertEquals(res.status, 403);
  assertEquals(obj(obj(await bodyOf(res), 'error'), 'details'), { reason: 'manages_admins_required' });
  assertEquals(generatedLinks(h.world).length, 0);
});

Deno.test('send-invitation: a login with the address that STORM did not create → 409 login_not_created_by_storm, nothing sent', async () => {
  const h = setup();
  h.world.authUsers.push({ id: '99999999-9999-4999-8999-999999999999', email: P.importedA.email, email_confirmed_at: '2026-11-20T09:00:00Z', last_sign_in_at: '2026-11-20T09:00:00Z', password_set: true });
  const res = await invite(h, P.adminA.token, { profileId: P.importedA.profileId });
  assertEquals(res.status, 409);
  const error = obj(await bodyOf(res), 'error');
  assertEquals(error.message, 'An account with this email exists that STORM did not create. Contact STORM support.');
  assertEquals(obj(error, 'details'), { reason: 'login_not_created_by_storm' });
  assertEquals(generatedLinks(h.world).length, 0);
  assertEquals(h.sent.length, 0);
  assertEquals(profileRow(h.world, P.importedA.profileId).user_id, null);
});
