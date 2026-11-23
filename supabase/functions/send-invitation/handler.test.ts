import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1.0.13';
import type { EmailMessage, EmailResult } from '../_shared/email.ts';
import type { EdgeEnv } from '../_shared/env.ts';
import { callsOf, fakeClientFactory, type FakeWorld } from '../_shared/testing/fakeSupabase.ts';
import { bodyOf, buildWorld, CO_A, envWith, obj, P, profileRow, request, TEST_ENV } from '../_shared/testing/world.ts';
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
  assertFalse(JSON.stringify(body).includes('"sent"'));
  assertEquals(profileRow(h.world, P.importedA.profileId).account_status, 'not_invited');
});

Deno.test('send-invitation: RPCs missing (D-01) → stored:false; legacy columns only on success', async () => {
  const h = setup({ p3: false });
  const res = await invite(h, P.adminA.token, { profileId: P.importedA.profileId });
  assertEquals(res.status, 200);
  assertEquals(obj(await bodyOf(res), 'invitation'), { status: 'sent', stored: false, id: null });
  assertEquals(profileRow(h.world, P.importedA.profileId).account_status, 'invited');

  const failing = setup({ p3: false, results: [{ ok: false, errorCode: 'not_configured' }] });
  const r2 = await invite(failing, P.adminA.token, { profileId: P.importedA.profileId });
  assertEquals(r2.status, 502);
  assertEquals(obj(await bodyOf(r2), 'invitation'), { status: 'send_failed', stored: false, id: null });
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
