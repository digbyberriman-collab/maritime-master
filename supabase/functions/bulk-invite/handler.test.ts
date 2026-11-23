import { assert, assertEquals } from 'jsr:@std/assert@1.0.13';
import type { EmailMessage, EmailResult } from '../_shared/email.ts';
import { callsOf, fakeClientFactory } from '../_shared/testing/fakeSupabase.ts';
import { bodyOf, buildWorld, envWith, obj, P, profileRow, request, TEST_ENV } from '../_shared/testing/world.ts';
import { createHandler } from './handler.ts';

const NOW = new Date('2026-11-23T10:00:00Z');

function setup(opts: { p3?: boolean; results?: EmailResult[]; siteUrl?: string | null } = {}) {
  const world = buildWorld({ p3: opts.p3 ?? true });
  const sent: EmailMessage[] = [];
  let i = 0;
  const handler = createHandler({
    env: () => (opts.siteUrl === undefined ? TEST_ENV : envWith({ siteUrl: opts.siteUrl })),
    createClient: fakeClientFactory(world),
    pauseMs: 0,
    invite: {
      now: () => NOW,
      isFakeEmail: () => false,
      sendEmail: (m) => {
        sent.push(m);
        return Promise.resolve(opts.results?.[i++] ?? { ok: true, providerMessageId: `msg-${sent.length}` });
      },
    },
  });
  return { world, sent, handler };
}

Deno.test('bulk-invite: per-row results with sent / failed / refused counts', async () => {
  const h = setup({ results: [{ ok: true, providerMessageId: 'm1' }, { ok: false, errorCode: 'provider_unavailable' }] });
  const ids = [P.importedA.profileId, P.invitedA.profileId, P.crewA.profileId, P.crewB.profileId, P.disabledA.profileId];
  const res = await h.handler(request(P.adminA.token, { profileIds: ids }));
  assertEquals(res.status, 200);
  const body = await bodyOf(res);
  assertEquals([body.sent, body.failed, body.refused], [1, 1, 3]);
  const results = body.results as Array<Record<string, unknown>>;
  assertEquals(results.map((r) => [r.profileId, r.status, r.code ?? null]), [
    [P.importedA.profileId, 'sent', null],
    [P.invitedA.profileId, 'send_failed', 'send_failed'],
    [P.crewA.profileId, 'refused', 'already_active'],
    [P.crewB.profileId, 'refused', 'not_found'],
    [P.disabledA.profileId, 'refused', 'conflict'],
  ]);
  assertEquals(results[1].emailError, 'provider_unavailable');
  assertEquals(results[0].stored, true);
  // importedA waited on Aurora: its row says the vessel was assigned; people already on a vessel and refusals carry no field.
  assertEquals(results.map((r) => r.assignment ?? null), ['created', null, null, null, null]);
  assertEquals(h.sent.length, 2);
  assertEquals(profileRow(h.world, P.invitedA.profileId).account_status, 'invited', 'unchanged by a failed send');
  assertEquals(profileRow(h.world, P.importedA.profileId).account_status, 'invited');
});

Deno.test('bulk-invite: at most 50, at least one, ids only', async () => {
  const h = setup();
  const tooMany = Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${(0x9000 + i).toString(16).padStart(12, '0')}`);
  for (const body of [{ profileIds: tooMany }, { profileIds: [] }, {}, { profileIds: ['x'] }]) {
    const res = await h.handler(request(P.adminA.token, body));
    assertEquals(res.status, 400);
    assertEquals(obj(await bodyOf(res), 'error').code, 'invalid_request');
  }
  assertEquals(callsOf(h.world, 'admin').length, 0);
});

Deno.test('bulk-invite: a master gets per-row refusals for people outside their vessel', async () => {
  const h = setup({ p3: false });
  profileRow(h.world, P.crewA2.profileId).account_status = 'invited';
  const res = await h.handler(request(P.masterA.token, { profileIds: [P.importedA.profileId, P.crewA2.profileId] }));
  const body = await bodyOf(res);
  const results = body.results as Array<Record<string, unknown>>;
  assertEquals(results.map((r) => r.status), ['sent', 'refused']);
  assertEquals(results[1].code, 'forbidden');
  assertEquals(results[0].stored, false, 'legacy database: not stored');
  assertEquals(results[0].assignment, 'created', 'D-01: the edge assigned the vessel the master may invite for');
  assertEquals(results[1].assignment, undefined);
});

Deno.test('bulk-invite: STORM_SITE_URL missing → 500 before any row', async () => {
  const h = setup({ siteUrl: null });
  const res = await h.handler(request(P.adminA.token, { profileIds: [P.importedA.profileId] }));
  assertEquals(res.status, 500);
  assertEquals(obj(await bodyOf(res), 'error').code, 'server_misconfigured');
  assertEquals(h.sent.length, 0);
  assertEquals(callsOf(h.world, 'admin').length, 0);
});

Deno.test('bulk-invite: no JWT → 401; disabled caller → 403; per-caller rate limit → 429', async () => {
  const h = setup();
  assertEquals((await h.handler(request(null, { profileIds: [P.importedA.profileId] }))).status, 401);
  assertEquals((await h.handler(request(P.disabledA.token, { profileIds: [P.importedA.profileId] }))).status, 403);
  let last = 0;
  for (let i = 0; i < 6; i++) last = (await h.handler(request(P.adminA.token, { profileIds: [P.crewA.profileId] }))).status;
  assertEquals(last, 429);
  assert(h.sent.length === 0, 'crewA is already active: nothing sent');
});
