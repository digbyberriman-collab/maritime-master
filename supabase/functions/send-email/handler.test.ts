import { assert, assertEquals, assertFalse, assertStringIncludes } from 'jsr:@std/assert@1.0.13';
import { fakeFetcher } from '../_shared/testing/fakeFetch.ts';
import { fakeClientFactory } from '../_shared/testing/fakeSupabase.ts';
import { bodyOf, buildWorld, envWith, obj, P, request, TEST_ENV } from '../_shared/testing/world.ts';
import { createHandler } from './handler.ts';

const NOW = new Date('2026-11-23T10:00:00Z');

function setup(script: Array<number | 'network'> = [], env = TEST_ENV) {
  const world = buildWorld();
  const f = fakeFetcher(script);
  const handler = createHandler({ env: () => env, createClient: fakeClientFactory(world), fetcher: f.fetcher, now: () => NOW });
  return { world, f, handler };
}

const incident = {
  to: 'safety-officer@example.test',
  template: 'INCIDENT_NOTIFICATION',
  idempotencyKey: 'incident:1',
  variables: {
    incident_type: 'Slip <b>hazard</b>',
    vessel_name: 'Aurora',
    incident_date: '2026-11-22',
    severity: 'Medium',
    summary: 'Wet deck near the tender garage',
    incident_link: 'https://app.storm.test/v/AUR/safety/incidents/1',
  },
};

Deno.test('send-email: only the service-role bearer may call (user, anon and forged keys → 401)', async () => {
  const h = setup();
  for (const token of [null, P.adminA.token, TEST_ENV.anonKey, `${TEST_ENV.serviceRoleKey}x`, TEST_ENV.serviceRoleKey.slice(0, -1)]) {
    const res = await h.handler(request(token, incident));
    assertEquals(res.status, 401, String(token));
    assertEquals(obj(await bodyOf(res), 'error').code, 'unauthorized');
  }
  assertEquals(h.f.calls.length, 0);
});

Deno.test('send-email: caller from / cc / bcc / subject / html are dropped; fixed sender; escaped variables', async () => {
  const h = setup([200]);
  const res = await h.handler(request(TEST_ENV.serviceRoleKey, {
    ...incident,
    from: 'ceo@bank.example',
    cc: ['victim@example.test'],
    bcc: ['victim2@example.test'],
    subject: 'Your account is locked',
    html: '<a href="https://phish.test">log in</a>',
  }));
  assertEquals(res.status, 200);
  assertEquals((await bodyOf(res)).messageId, 'msg-1');
  const sent = h.f.calls[0].body;
  assertEquals(sent.from, TEST_ENV.emailFrom);
  assertEquals(sent.to, ['safety-officer@example.test']);
  assertFalse('cc' in sent || 'bcc' in sent);
  assertEquals(sent.subject, 'Incident reported: Slip <b>hazard</b>, Aurora');
  const html = String(sent.html);
  assertFalse(html.includes('phish.test'));
  assertFalse(html.includes('<b>hazard</b>'));
  assertStringIncludes(html, 'Slip &lt;b&gt;hazard&lt;/b&gt;');
  const log = (h.world.tables.notification_logs ?? [])[0];
  assertEquals([log.status, log.template_name, log.idempotency_key], ['SENT', 'INCIDENT_NOTIFICATION', 'incident:1']);
});

Deno.test('send-email: idempotent on the key (no second send)', async () => {
  const h = setup([200, 200]);
  await h.handler(request(TEST_ENV.serviceRoleKey, incident));
  const again = await h.handler(request(TEST_ENV.serviceRoleKey, incident));
  assertEquals(await bodyOf(again), { ok: true, messageId: 'msg-1', cached: true });
  assertEquals(h.f.calls.length, 1);
});

Deno.test('send-email: honest failures → 502 send_failed with the code (and a FAILED log row)', async () => {
  const h = setup([500]);
  const res = await h.handler(request(TEST_ENV.serviceRoleKey, incident));
  assertEquals(res.status, 502);
  const error = obj(await bodyOf(res), 'error');
  assertEquals(error.code, 'send_failed');
  assertEquals(error.details, { email_error: 'provider_unavailable' });
  assertEquals((h.world.tables.notification_logs ?? [])[0].status, 'FAILED');

  const unconfigured = setup([], envWith({ emailFrom: null }));
  const r2 = await unconfigured.handler(request(TEST_ENV.serviceRoleKey, incident));
  assertEquals(r2.status, 502);
  assertEquals(obj(obj(await bodyOf(r2), 'error'), 'details'), { email_error: 'not_configured' });
  assertEquals(unconfigured.f.calls.length, 0);
});

Deno.test('send-email: unknown template, missing variables and non-https links → 400', async () => {
  const h = setup();
  const cases = [
    { ...incident, template: 'ANYTHING_GOES' },
    { ...incident, variables: { ...incident.variables, summary: '' } },
    { ...incident, variables: { ...incident.variables, incident_link: 'http://app.storm.test/x' } },
    { ...incident, variables: { ...incident.variables, incident_link: 'javascript:alert(1)' } },
    { ...incident, to: '' },
  ];
  for (const body of cases) assertEquals((await h.handler(request(TEST_ENV.serviceRoleKey, body))).status, 400);
  assertEquals(h.f.calls.length, 0);
});

Deno.test('send-email: the shared invitation template accepts the older link name', async () => {
  const h = setup([200]);
  const res = await h.handler(request(TEST_ENV.serviceRoleKey, {
    to: 'crew-a@example.test',
    template: 'CREW_INVITATION',
    idempotencyKey: 'invite:x:1',
    variables: { first_name: 'Deckhand', invitation_link: 'https://project.supabase.test/auth/v1/verify?token=t' },
  }));
  assertEquals(res.status, 200);
  assert(String(h.f.calls[0].body.html).includes('Set your password'));
});
