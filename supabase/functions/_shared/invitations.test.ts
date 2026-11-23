import { assert, assertEquals, assertFalse, assertStringIncludes } from 'jsr:@std/assert@1.0.13';
import { getAuthContext } from './auth.ts';
import { type EmailMessage, type EmailResult, payloadTag, sendEmail } from './email.ts';
import type { EdgeEnv } from './env.ts';
import { HttpError } from './http.ts';
import { bulkRow, bulkSummary, type InviteDeps, inviteProfile, invitationResponse, isFakeEmail, MAX_INVITE_ATTEMPT } from './invitations.ts';
import { idempotentProvider } from './testing/fakeFetch.ts';
import { callsOf, fail, fakeClientFactory, type FakeWorld, ok } from './testing/fakeSupabase.ts';
import { buildWorld, CO_A, envWith, P, type Persona, profileRow, request, TEST_ENV, V_A1, V_A2, V_A_SOLD, V_B1 } from './testing/world.ts';

const NOW = new Date('2026-11-23T10:00:00Z');

function mailer(results: EmailResult[] = []) {
  const sent: EmailMessage[] = [];
  let i = 0;
  const deps: Partial<InviteDeps> = {
    isFakeEmail: () => false, // tests use example.test role addresses, which the real check refuses
    now: () => NOW,
    sendEmail: (m: EmailMessage) => {
      sent.push(m);
      return Promise.resolve(results[i++] ?? { ok: true, providerMessageId: `msg-${sent.length}` });
    },
  };
  return { sent, deps };
}

const ctxFor = (world: FakeWorld, who: Persona, env: EdgeEnv = TEST_ENV) =>
  getAuthContext(request(who.token, {}), { env, createClient: fakeClientFactory(world) });

const linkCalls = (world: FakeWorld) => callsOf(world, 'admin').filter((c) => c.method === 'generateLink');

/** The key the invite path must use for a message: `invite:<profileId>:<attempt>:<h16 of its link>`. */
async function expectedKey(m: EmailMessage, profileId: string, attempt: number): Promise<string> {
  return `invite:${profileId}:${attempt}:${await payloadTag(m.variables.action_link)}`;
}

Deno.test('isFakeEmail: placeholder and disposable domains are refused (the real check)', () => {
  for (const e of ['crew@example.com', 'a@example.test', 'b@x.invalid', 'testcrew@ship.org', 'c@mailinator.com', 'nodomain']) assert(isFakeEmail(e), e);
  assertFalse(isFakeEmail('captain@realfleet.org'));
});

Deno.test('invite (P3 live): sent, recorded by record_invitation_send, profile stamped by the RPC', async () => {
  const world = buildWorld({ p3: true });
  const m = mailer();
  const ctx = await ctxFor(world, P.adminA);
  const outcome = await inviteProfile(ctx, P.importedA.profileId, m.deps);
  assertEquals(outcome.status, 'sent');
  assert(outcome.status === 'sent' && outcome.stored && outcome.invitationId);

  // One email, the fixed template, the link on the site (never client input), idempotency key per attempt.
  assertEquals(m.sent.length, 1);
  assertEquals(m.sent[0].template, 'CREW_INVITATION');
  assertEquals(m.sent[0].to, P.importedA.email);
  assertEquals(m.sent[0].idempotencyKey, await expectedKey(m.sent[0], P.importedA.profileId, 1));
  assert(/^invite:[0-9a-f-]{36}:1:[0-9a-f]{16}$/.test(m.sent[0].idempotencyKey), 'D-146 as amended: attempt plus payload tag');
  const reserve = callsOf(world, 'rpc').find((c) => c.fn === 'reserve_invitation_attempt');
  assert(reserve && reserve.caller.role === 'service', 'the attempt is reserved with the service client');
  assert(world.calls.indexOf(reserve) < world.calls.indexOf(linkCalls(world)[0]), 'reserved before any link exists');
  assertStringIncludes(m.sent[0].variables.action_link, encodeURIComponent('https://app.storm.test/reset-password?flow=invite'));
  assertEquals(m.sent[0].variables.company_name, 'Demo Fleet A');
  assertEquals(m.sent[0].variables.vessel_name, 'Aurora');

  const link = callsOf(world, 'admin').find((c) => c.method === 'generateLink');
  assert(link);
  assertEquals(link.args.type, 'invite', 'no auth user yet → invite link (creates the user)');
  const rec = callsOf(world, 'rpc').find((c) => c.fn === 'record_invitation_send');
  assert(rec);
  assertEquals(rec.caller.role, 'service');
  assertEquals(rec.args.p_outcome, 'sent');
  assertEquals(rec.args.p_invited_by, P.adminA.userId);
  const profile = profileRow(world, P.importedA.profileId);
  assertEquals(profile.account_status, 'invited');
  assert(profile.user_id, 'login linked');

  const res = invitationResponse(outcome);
  assertEquals(res.status, 200);
  // importedA waits on Aurora: the linked login got the assignment (D-199).
  assertEquals(await res.json(), { ok: true, invitation: { status: 'sent', stored: true, id: outcome.invitationId }, assignment: 'created' });
});

Deno.test('invite (P3 live): a failed email is recorded as send_failed and the profile is NOT stamped invited', async () => {
  const world = buildWorld({ p3: true });
  const m = mailer([{ ok: false, errorCode: 'provider_unavailable' }]);
  const outcome = await inviteProfile(await ctxFor(world, P.adminA), P.importedA.profileId, m.deps);
  assertEquals(outcome.status, 'send_failed');
  const profile = profileRow(world, P.importedA.profileId);
  assertEquals(profile.account_status, 'not_invited');
  assertEquals(profile.last_invited_at, null);
  const row = (world.tables.user_invitations ?? [])[0];
  assertEquals([row.status, row.last_error_code, row.send_attempts], ['send_failed', 'provider_unavailable', 1]);

  const res = invitationResponse(outcome);
  assertEquals(res.status, 502);
  const body = await res.json();
  assertEquals(body.error.code, 'send_failed');
  assertEquals(body.error.message, 'The invitation email could not be sent.');
  assertEquals(body.error.details, { email_error: 'provider_unavailable' });
  assertEquals(body.invitation, { status: 'send_failed', stored: true, id: row.id });
});

Deno.test('invite (legacy, RPCs missing): stored:false, profile columns stamped only after a successful send', async () => {
  const world = buildWorld({ p3: false });
  const failing = mailer([{ ok: false, errorCode: 'not_configured' }]);
  const first = await inviteProfile(await ctxFor(world, P.adminA), P.importedA.profileId, failing.deps);
  assertEquals(first.status, 'send_failed');
  assert(first.status === 'send_failed' && !first.stored);
  assertEquals(profileRow(world, P.importedA.profileId).account_status, 'not_invited', 'failure never stamps');
  assertEquals(profileRow(world, P.importedA.profileId).user_id, null, 'nor links (legacy branch)');

  const ok = mailer();
  const second = await inviteProfile(await ctxFor(world, P.adminA), P.importedA.profileId, ok.deps);
  assertEquals(second.status, 'sent');
  assert(second.status === 'sent' && !second.stored && second.invitationId === null);
  // The auth user created by the first link now exists: "already registered" → magic link for the same user.
  const links = callsOf(world, 'admin').filter((c) => c.method === 'generateLink').map((c) => c.args.type);
  assertEquals(links, ['invite', 'invite', 'magiclink']);
  const profile = profileRow(world, P.importedA.profileId);
  assertEquals(profile.account_status, 'invited');
  assertEquals(profile.invitation_count, 1);
  assertEquals(profile.last_invited_at, NOW.toISOString());
  assert(profile.user_id);
  assertEquals(await invitationResponse(second).json(), { ok: true, invitation: { status: 'sent', stored: false, id: null }, assignment: 'created' });
  assert(first.status === 'send_failed' && first.assignment === undefined, 'a D-01 send that failed linked no login: no assignment step');
});

Deno.test('invite: 5-minute cooldown from the live invitation (429) and from the legacy stamp', async () => {
  const world = buildWorld({ p3: true });
  (world.tables.user_invitations ??= []).push({
    id: 'inv-1', company_id: CO_A, profile_id: P.importedA.profileId, status: 'sent', send_attempts: 1,
    last_attempt_at: new Date(NOW.getTime() - 60_000).toISOString(), last_sent_at: new Date(NOW.getTime() - 60_000).toISOString(),
  });
  const m = mailer();
  const outcome = await inviteProfile(await ctxFor(world, P.adminA), P.importedA.profileId, m.deps);
  assertEquals(outcome.status, 'refused');
  assert(outcome.status === 'refused');
  assertEquals([outcome.error.status, outcome.error.code], [429, 'cooldown']);
  assertEquals(outcome.error.details?.retry_after_seconds, 240);
  assertEquals(m.sent.length, 0);
  assertEquals(callsOf(world, 'admin').filter((c) => c.method === 'generateLink').length, 0, 'no link made during cooldown');

  const legacy = buildWorld({ p3: false });
  profileRow(legacy, P.invitedA.profileId).last_invited_at = new Date(NOW.getTime() - 4 * 60_000).toISOString();
  const r2 = await inviteProfile(await ctxFor(legacy, P.adminA), P.invitedA.profileId, mailer().deps);
  assert(r2.status === 'refused' && r2.error.code === 'cooldown');
});

Deno.test('invite: after a failed send the retry cooldown is 30 seconds, not 5 minutes', async () => {
  const fresh = buildWorld({ p3: true });
  (fresh.tables.user_invitations ??= []).push({
    id: 'inv-1', company_id: CO_A, profile_id: P.importedA.profileId, status: 'send_failed', send_attempts: 1,
    last_attempt_at: new Date(NOW.getTime() - 10_000).toISOString(), last_sent_at: null,
  });
  const early = await inviteProfile(await ctxFor(fresh, P.adminA), P.importedA.profileId, mailer().deps);
  assert(early.status === 'refused');
  assertEquals([early.error.status, early.error.code, early.error.details?.retry_after_seconds], [429, 'cooldown', 20]);

  const later = buildWorld({ p3: true });
  (later.tables.user_invitations ??= []).push({
    id: 'inv-1', company_id: CO_A, profile_id: P.importedA.profileId, status: 'send_failed', send_attempts: 1,
    last_attempt_at: new Date(NOW.getTime() - 60_000).toISOString(), last_sent_at: null,
  });
  const m = mailer();
  const retried = await inviteProfile(await ctxFor(later, P.adminA), P.importedA.profileId, m.deps);
  assertEquals(retried.status, 'sent');
  assertEquals(m.sent.length, 1);
});

Deno.test('invite: the next attempt after the cooldown uses a new idempotency key', async () => {
  const world = buildWorld({ p3: true });
  (world.tables.user_invitations ??= []).push({
    id: 'inv-1', company_id: CO_A, profile_id: P.invitedA.profileId, status: 'sent', send_attempts: 2,
    last_attempt_at: new Date(NOW.getTime() - 10 * 60_000).toISOString(), last_sent_at: new Date(NOW.getTime() - 10 * 60_000).toISOString(),
  });
  const m = mailer();
  const outcome = await inviteProfile(await ctxFor(world, P.adminA), P.invitedA.profileId, m.deps);
  assertEquals(outcome.status, 'sent');
  assertEquals(m.sent[0].idempotencyKey, await expectedKey(m.sent[0], P.invitedA.profileId, 3));
  const link = callsOf(world, 'admin').find((c) => c.method === 'generateLink');
  assertEquals(link?.args.type, 'magiclink', 'existing unconfirmed login → magic link');
  assertEquals((world.tables.user_invitations ?? [])[0].send_attempts, 3);
});

Deno.test('invite: an active, confirmed member → 409 already_active (nothing sent)', async () => {
  const world = buildWorld({ p3: true });
  const m = mailer();
  const outcome = await inviteProfile(await ctxFor(world, P.adminA), P.crewA.profileId, m.deps);
  assert(outcome.status === 'refused');
  assertEquals([outcome.error.status, outcome.error.code], [409, 'already_active']);
  assertEquals(m.sent.length, 0);
});

Deno.test('invite: disabled access → 409 conflict; missing or placeholder email → 400', async () => {
  const world = buildWorld({ p3: true });
  const ctx = await ctxFor(world, P.adminA);
  const disabled = await inviteProfile(ctx, P.disabledA.profileId, mailer().deps);
  assert(disabled.status === 'refused' && disabled.error.status === 409 && disabled.error.code === 'conflict');

  profileRow(world, P.importedA.profileId).email = '';
  const none = await inviteProfile(ctx, P.importedA.profileId, mailer().deps);
  assert(none.status === 'refused' && none.error.code === 'invalid_request' && none.error.details?.reason === 'missing_email');

  profileRow(world, P.importedA.profileId).email = 'deckhand@example.test';
  const real = await inviteProfile(ctx, P.importedA.profileId, { now: () => NOW }); // the real isFakeEmail
  assert(real.status === 'refused' && real.error.code === 'invalid_request' && real.error.details?.reason === 'placeholder_email');
  assertEquals(callsOf(world, 'admin').length, 0, 'refused before any auth admin call');
});

Deno.test('invite: a profile of another company is not visible → 404 (no cross-tenant probing)', async () => {
  const world = buildWorld({ p3: true });
  const outcome = await inviteProfile(await ctxFor(world, P.adminB), P.importedA.profileId, mailer().deps);
  assert(outcome.status === 'refused');
  assertEquals([outcome.error.status, outcome.error.code], [404, 'not_found']);
});

Deno.test('invite: a master invites for their own vessel only; crew cannot invite', async () => {
  for (const p3 of [true, false]) {
    const world = buildWorld({ p3 });
    assertEquals(profileRow(world, P.importedA.profileId).imported_vessel_id, V_A1);
    const own = await inviteProfile(await ctxFor(world, P.masterA), P.importedA.profileId, mailer().deps);
    assertEquals(own.status, 'sent', `own vessel, p3=${p3}`);

    const other = buildWorld({ p3 });
    profileRow(other, P.importedA.profileId).imported_vessel_id = V_A2;
    const refused = await inviteProfile(await ctxFor(other, P.masterA), P.importedA.profileId, mailer().deps);
    assert(refused.status === 'refused' && refused.error.code === 'forbidden', `other vessel, p3=${p3}`);
    // A person with a current assignment: the assignment's vessel decides (crewA2 is on Borealis).
    profileRow(other, P.crewA2.profileId).account_status = 'invited';
    const assigned = await inviteProfile(await ctxFor(other, P.masterA), P.crewA2.profileId, mailer().deps);
    assert(assigned.status === 'refused' && assigned.error.code === 'forbidden', `assignment vessel, p3=${p3}`);
    const crew = await inviteProfile(await ctxFor(other, P.crewA), P.importedA.profileId, mailer().deps);
    assert(crew.status === 'refused' && crew.error.code === 'forbidden');
  }
});

Deno.test('invite: an email that belongs to another person\'s login → 409 conflict, nothing sent', async () => {
  const world = buildWorld({ p3: true });
  profileRow(world, P.importedA.profileId).email = P.crewA.email; // crewA's login
  const m = mailer();
  const outcome = await inviteProfile(await ctxFor(world, P.adminA), P.importedA.profileId, m.deps);
  assert(outcome.status === 'refused' && outcome.error.code === 'conflict');
  assertEquals(m.sent.length, 0);
  assertEquals(callsOf(world, 'admin').filter((c) => c.method === 'generateLink').length, 0);
  assertEquals(callsOf(world, 'rpc').filter((c) => c.fn === 'reserve_invitation_attempt').length, 0, 'refused before an attempt is reserved');
});

Deno.test('invite: a profile email that differs from the linked login → 409, no link (no stray login created)', async () => {
  const world = buildWorld({ p3: true });
  profileRow(world, P.invitedA.profileId).email = 'steward-new@example.test';
  const before = world.authUsers.length;
  const outcome = await inviteProfile(await ctxFor(world, P.adminA), P.invitedA.profileId, mailer().deps);
  assert(outcome.status === 'refused' && outcome.error.code === 'conflict' && outcome.error.details?.reason === 'login_email_mismatch');
  assertEquals(callsOf(world, 'admin').filter((c) => c.method === 'generateLink').length, 0);
  assertEquals(world.authUsers.length, before);
});

Deno.test('invite: STORM_SITE_URL missing → 500 server_misconfigured, nothing read, sent or stamped', async () => {
  const world = buildWorld({ p3: true });
  const m = mailer();
  const ctx = await ctxFor(world, P.adminA, envWith({ siteUrl: null }));
  const before = world.calls.length;
  const outcome = await inviteProfile(ctx, P.importedA.profileId, m.deps);
  assert(outcome.status === 'refused');
  assertEquals([outcome.error.status, outcome.error.code], [500, 'server_misconfigured']);
  assertEquals(world.calls.length, before);
  assertEquals(m.sent.length, 0);
});

Deno.test('invite: a link that cannot be made is a recorded send failure (link_failed), never "sent"', async () => {
  const world = buildWorld({ p3: true });
  world.hooks.admin = (a) => (a.method === 'generateLink' ? { data: { properties: null, user: null }, error: { message: 'upstream', status: 500 } } : undefined);
  const m = mailer();
  const outcome = await inviteProfile(await ctxFor(world, P.adminA), P.importedA.profileId, m.deps);
  assert(outcome.status === 'send_failed' && outcome.emailError === 'link_failed' && outcome.stored);
  assertEquals(m.sent.length, 0);
  assertEquals((world.tables.user_invitations ?? [])[0].last_error_code, 'link_failed');
});

Deno.test('invite: a record RPC error after a successful send still answers sent (stored:false) and stamps the profile', async () => {
  const world = buildWorld({ p3: true });
  world.rpcs.record_invitation_send = () => fail('23505', 'duplicate key');
  const outcome = await inviteProfile(await ctxFor(world, P.adminA), P.importedA.profileId, mailer().deps);
  assert(outcome.status === 'sent' && !outcome.stored);
  assertEquals(profileRow(world, P.importedA.profileId).account_status, 'invited');
});

Deno.test('bulk rows: sent / send_failed / refused counts; server errors count as failed', () => {
  const rows = [
    bulkRow({ status: 'sent', profileId: 'a', invitationId: 'i', stored: true }),
    bulkRow({ status: 'send_failed', profileId: 'b', invitationId: null, stored: false, emailError: 'provider_rejected' }),
    bulkRow({ status: 'refused', profileId: 'c', error: new HttpError(429, 'cooldown', 'Wait.') }),
    bulkRow({ status: 'refused', profileId: 'd', error: new HttpError(400, 'invalid_request', 'No.', { reason: 'placeholder_email' }) }),
    bulkRow({ status: 'refused', profileId: 'e', error: new HttpError(503, 'status_unavailable', 'Later.') }),
  ];
  const summary = bulkSummary(rows);
  assertEquals([summary.sent, summary.failed, summary.refused], [1, 2, 2]);
  assertEquals(rows[1], { profileId: 'b', status: 'send_failed', code: 'send_failed', emailError: 'provider_rejected', stored: false, invitationId: null });
  assertEquals(rows[3], { profileId: 'd', status: 'refused', code: 'invalid_request', reason: 'placeholder_email', stored: false, invitationId: null });
  assertEquals(rows[4].status, 'send_failed');
  assertEquals(rows[4].code, 'status_unavailable');
});

// ---- reservation, per-payload keys, revoked invitees ------------------------------------------

Deno.test('invite (P3): two concurrent invites for one person → one send, one 429; the second makes no link', async () => {
  const world = buildWorld({ p3: true });
  const provider = idempotentProvider();
  const deps: Partial<InviteDeps> = { isFakeEmail: () => false, now: () => NOW, sendEmail: (msg, env) => sendEmail(msg, env, provider.fetcher) };
  const ctx = await ctxFor(world, P.adminA);
  const outcomes = await Promise.all([inviteProfile(ctx, P.invitedA.profileId, deps), inviteProfile(ctx, P.invitedA.profileId, deps)]);
  assertEquals(outcomes.map((o) => o.status).sort(), ['refused', 'sent']);
  const refused = outcomes.find((o) => o.status === 'refused');
  assert(refused?.status === 'refused');
  assertEquals([refused.error.status, refused.error.code], [429, 'cooldown']);
  assert(Number(refused.error.details?.retry_after_seconds) > 0);
  assertEquals(linkCalls(world).length, 1, 'the refused request made no link, so the delivered one stays valid');
  assertEquals(provider.log.map((l) => l.status), [200], 'one email, no 409');
  const row = (world.tables.user_invitations ?? [])[0];
  assertEquals([row.status, row.send_attempts], ['sent', 1]);
});

Deno.test('invite (D-01): a retry after a timed-out send uses a new key; the provider never answers 409', async () => {
  let t = NOW.getTime();
  const world = buildWorld({ p3: false, now: () => new Date(t) });
  const provider = idempotentProvider(['timeout_after_accept']);
  const deps: Partial<InviteDeps> = { isFakeEmail: () => false, now: () => new Date(t), sendEmail: (msg, env) => sendEmail(msg, env, provider.fetcher) };
  const ctx = await ctxFor(world, P.adminA);
  const first = await inviteProfile(ctx, P.importedA.profileId, deps);
  assert(first.status === 'send_failed' && first.emailError === 'provider_unavailable', 'the caller saw a timeout');
  const outcomes: string[] = [];
  for (const minutes of [1, 60, 600]) {
    t += minutes * 60_000;
    outcomes.push((await inviteProfile(ctx, P.importedA.profileId, deps)).status);
  }
  assertEquals(outcomes, ['sent', 'sent', 'sent']);
  const keys = provider.log.map((l) => l.key);
  assertEquals(new Set(keys).size, keys.length, 'every payload has its own key');
  assertFalse(provider.log.some((l) => l.status === 409));
  assert(keys.every((k) => /^invite:[0-9a-f-]{36}:\d+:[0-9a-f]{16}$/.test(k)));
});

Deno.test('invite: reservation answers map to 404 / 409 / 503, and nothing is linked or sent', async () => {
  const cases: Array<[ReturnType<typeof ok> | ReturnType<typeof fail>, number, string]> = [
    [ok({ ok: false, code: 'not_found' }), 404, 'not_found'],
    [ok({ ok: false, code: 'disabled' }), 409, 'conflict'],
    [ok({ ok: false, code: 'surprise' }), 503, 'status_unavailable'],
    [ok({ ok: true, invitation_id: 'inv-x' }), 503, 'status_unavailable'],
    [fail('XX000', 'lock timeout'), 503, 'status_unavailable'],
  ];
  for (const [answer, status, code] of cases) {
    const world = buildWorld({ p3: true });
    world.hooks.rpc = (r) => (r.fn === 'reserve_invitation_attempt' ? answer : undefined);
    const m = mailer();
    const outcome = await inviteProfile(await ctxFor(world, P.adminA), P.importedA.profileId, m.deps);
    assert(outcome.status === 'refused', code);
    assertEquals([outcome.error.status, outcome.error.code], [status, code]);
    assertEquals(linkCalls(world).length, 0);
    assertEquals(m.sent.length, 0);
  }
});

Deno.test('invite: a revoked invitee\'s banned login is unbanned before the link; the email goes out', async () => {
  const world = buildWorld({ p3: true });
  profileRow(world, P.invitedA.profileId).account_status = 'not_invited';
  const login = world.authUsers.find((u) => u.id === P.invitedA.userId);
  assert(login);
  login.banned_until = '2126-01-01T00:00:00Z';
  const m = mailer();
  const outcome = await inviteProfile(await ctxFor(world, P.adminA), P.invitedA.profileId, m.deps);
  assertEquals(outcome.status, 'sent');
  const unban = callsOf(world, 'admin').find((c) => c.method === 'updateUserById');
  assert(unban);
  assertEquals(unban.args, { id: P.invitedA.userId, attrs: { ban_duration: 'none' } });
  assert(world.calls.indexOf(unban) < world.calls.indexOf(linkCalls(world)[0]), 'unbanned before the link is made');
  assertEquals(login.banned_until, null);
  assertEquals(m.sent.length, 1);
});

Deno.test('invite: a failed unban is an honest link_failed send failure; no link, no email', async () => {
  const world = buildWorld({ p3: true });
  profileRow(world, P.invitedA.profileId).account_status = 'not_invited';
  const login = world.authUsers.find((u) => u.id === P.invitedA.userId);
  assert(login);
  login.banned_until = '2126-01-01T00:00:00Z';
  world.hooks.admin = (a) => (a.method === 'updateUserById' ? fail('unexpected_failure', 'auth down', 500) : undefined);
  const m = mailer();
  const outcome = await inviteProfile(await ctxFor(world, P.adminA), P.invitedA.profileId, m.deps);
  assert(outcome.status === 'send_failed' && outcome.emailError === 'link_failed' && outcome.stored);
  assertEquals(linkCalls(world).length, 0);
  assertEquals(m.sent.length, 0);
  const row = (world.tables.user_invitations ?? [])[0];
  assertEquals([row.status, row.last_error_code], ['send_failed', 'link_failed']);
  assertEquals(profileRow(world, P.invitedA.profileId).account_status, 'not_invited');
});

Deno.test('invite: a ban is never lifted for an active profile', async () => {
  const world = buildWorld({ p3: true });
  // Active in STORM but the login was never confirmed (so the invite path runs) and is banned.
  profileRow(world, P.invitedA.profileId).account_status = 'active';
  const login = world.authUsers.find((u) => u.id === P.invitedA.userId);
  assert(login);
  login.banned_until = '2126-01-01T00:00:00Z';
  await inviteProfile(await ctxFor(world, P.adminA), P.invitedA.profileId, mailer().deps);
  assertEquals(callsOf(world, 'admin').filter((c) => c.method === 'updateUserById').length, 0);
  assertEquals(login.banned_until, '2126-01-01T00:00:00Z');
});

Deno.test('invite: a provider_duplicate answer is a failed attempt for the caller; a sent row is not downgraded', async () => {
  const world = buildWorld({ p3: true });
  (world.tables.user_invitations ??= []).push({
    id: 'inv-1', company_id: CO_A, profile_id: P.invitedA.profileId, status: 'sent', send_attempts: 1,
    last_attempt_at: new Date(NOW.getTime() - 10 * 60_000).toISOString(), last_sent_at: new Date(NOW.getTime() - 10 * 60_000).toISOString(),
  });
  const outcome = await inviteProfile(await ctxFor(world, P.adminA), P.invitedA.profileId, mailer([{ ok: false, errorCode: 'provider_duplicate' }]).deps);
  assert(outcome.status === 'send_failed' && outcome.emailError === 'provider_duplicate');
  assertEquals((world.tables.user_invitations ?? [])[0].status, 'sent');
});


// ---- step 11: the imported vessel becomes an assignment once a login is linked (D-199) ----------

const assignmentsOf = (world: FakeWorld, userId: unknown) => (world.tables.crew_assignments ?? []).filter((a) => a.user_id === userId && a.is_current === true);
const fulfilCalls = (world: FakeWorld) => callsOf(world, 'rpc').filter((c) => c.fn === 'fulfil_imported_assignment');
const assignmentReads = (world: FakeWorld) =>
  callsOf(world, 'query').filter((q) => q.table === 'crew_assignments' && q.op === 'select' && q.caller.role === 'service');
const assignmentInserts = (world: FakeWorld) => callsOf(world, 'query').filter((q) => q.table === 'crew_assignments' && q.op === 'insert');

Deno.test('assignment (P3): the RPC answers created → assignment created, no lookup and no edge insert', async () => {
  const world = buildWorld({ p3: true });
  world.hooks.rpc = (r) => (r.fn === 'fulfil_imported_assignment' ? ok('created') : undefined);
  const outcome = await inviteProfile(await ctxFor(world, P.adminA), P.importedA.profileId, mailer().deps);
  assert(outcome.status === 'sent');
  assertEquals(outcome.assignment, 'created');
  const [call] = fulfilCalls(world);
  assert(call, 'the edge asked the database');
  assertEquals(call.caller.role, 'service');
  assertEquals(call.args, { p_profile_id: P.importedA.profileId, p_actor: P.adminA.userId });
  const record = callsOf(world, 'rpc').find((c) => c.fn === 'record_invitation_send');
  assert(record && world.calls.indexOf(record) < world.calls.indexOf(call), 'after the send is recorded');
  assertEquals(assignmentReads(world).length, 0);
  assertEquals(assignmentInserts(world).length, 0);
  assertEquals(await invitationResponse(outcome).json(), { ok: true, invitation: { status: 'sent', stored: true, id: outcome.invitationId }, assignment: 'created' });
});

Deno.test('assignment (P3): none (record_invitation_send already wrote it) + the row → created; none and no row → failed', async () => {
  const world = buildWorld({ p3: true });
  const outcome = await inviteProfile(await ctxFor(world, P.adminA), P.importedA.profileId, mailer().deps);
  assert(outcome.status === 'sent' && outcome.assignment === 'created');
  const profile = profileRow(world, P.importedA.profileId);
  const rows = assignmentsOf(world, profile.user_id);
  assertEquals(rows.map((a) => [a.vessel_id, a.position, a.join_date]), [[V_A1, 'Crew', '2026-11-23']]);
  assertEquals([profile.is_imported, profile.imported_vessel_id], [false, null]);
  assertEquals(assignmentReads(world).length, 1, 'the edge looked the row up');
  assertEquals(assignmentInserts(world).length, 0, 'and wrote nothing itself');

  const missing = buildWorld({ p3: true });
  missing.rpcs.fulfil_imported_assignment = () => ok('none');
  const failed = await inviteProfile(await ctxFor(missing, P.adminA), P.importedA.profileId, mailer().deps);
  assert(failed.status === 'sent');
  assertEquals(failed.assignment, 'failed');
  assertEquals(assignmentsOf(missing, profileRow(missing, P.importedA.profileId).user_id).length, 0);
});

Deno.test('assignment (P3): not_eligible, or any other RPC error → failed (no edge insert)', async () => {
  const notEligible = buildWorld({ p3: true });
  notEligible.rpcs.fulfil_imported_assignment = () => ok('not_eligible');
  const a = await inviteProfile(await ctxFor(notEligible, P.adminA), P.importedA.profileId, mailer().deps);
  assert(a.status === 'sent' && a.assignment === 'failed');
  assertEquals(assignmentInserts(notEligible).length, 0);
  const body = await invitationResponse(a).json();
  assertEquals(body.assignment, 'failed');

  const broken = buildWorld({ p3: true });
  broken.hooks.rpc = (r) => (r.fn === 'fulfil_imported_assignment' ? fail('XX000', 'lock timeout') : undefined);
  const b = await inviteProfile(await ctxFor(broken, P.adminA), P.importedA.profileId, mailer().deps);
  assert(b.status === 'sent' && b.assignment === 'failed');
  assertEquals(assignmentInserts(broken).length, 0);
});

Deno.test('assignment (D-01, RPC missing): exactly one row from the profile, the import flags cleared', async () => {
  for (const p3 of [false, true]) {
    let t = NOW.getTime();
    const clock = () => new Date(t);
    const world = buildWorld({ p3, now: clock });
    if (p3) delete world.rpcs.fulfil_imported_assignment; // record_invitation_send applied, the new function not yet
    const profile = profileRow(world, P.importedA.profileId);
    Object.assign(profile, { position: 'Bosun', rank: 'AB', joining_date: '2026-12-01' });
    const m = mailer();
    m.deps.now = clock;
    const outcome = await inviteProfile(await ctxFor(world, P.adminA), P.importedA.profileId, m.deps);
    assert(outcome.status === 'sent', `p3=${p3}`);
    assertEquals(outcome.assignment, 'created', `p3=${p3}`);
    const rows = assignmentsOf(world, profile.user_id);
    assertEquals(rows.length, 1, `p3=${p3}`);
    assertEquals([rows[0].vessel_id, rows[0].position, rows[0].join_date, rows[0].created_by], [V_A1, 'Bosun', '2026-12-01', P.adminA.userId]);
    const [insert] = assignmentInserts(world);
    assert(insert && insert.caller.role === 'service');
    assertEquals([profile.is_imported, profile.imported_vessel_id], [false, null]);

    // Inviting again after the cooldown: the vessel is no longer pending, so nothing more is written.
    t += 10 * 60_000;
    const again = await inviteProfile(await ctxFor(world, P.adminA), P.importedA.profileId, m.deps);
    assert(again.status === 'sent' && again.assignment === undefined, `p3=${p3}`);
    assertEquals(assignmentsOf(world, profile.user_id).length, 1);
  }
  // Without a position (blank counts as missing) or a joining date: rank, else Crew; today.
  const plain = buildWorld({ p3: false });
  Object.assign(profileRow(plain, P.importedA.profileId), { position: '  ', rank: 'AB' });
  await inviteProfile(await ctxFor(plain, P.adminA), P.importedA.profileId, mailer().deps);
  const [row] = assignmentsOf(plain, profileRow(plain, P.importedA.profileId).user_id);
  assertEquals([row.position, row.join_date], ['AB', '2026-11-23']);
});

Deno.test('assignment: a Sold or another company\'s vessel → failed, no row, the vessel stays pending', async () => {
  // P3: the database refuses (not_eligible). D-01: the edge checks the vessel itself.
  for (const [p3, vessel] of [[true, V_A_SOLD], [false, V_A_SOLD], [false, V_B1]] as const) {
    const world = buildWorld({ p3 });
    profileRow(world, P.importedA.profileId).imported_vessel_id = vessel;
    const outcome = await inviteProfile(await ctxFor(world, P.adminA), P.importedA.profileId, mailer().deps);
    assert(outcome.status === 'sent', `p3=${p3} ${vessel}`);
    assertEquals(outcome.assignment, 'failed', `p3=${p3} ${vessel}`);
    const profile = profileRow(world, P.importedA.profileId);
    assertEquals(assignmentsOf(world, profile.user_id).length, 0);
    assertEquals(assignmentInserts(world).length, 0);
    assertEquals([profile.is_imported, profile.imported_vessel_id], [true, vessel]);
  }
});

Deno.test('assignment (D-01): a login already on a vessel the caller cannot see gets no second assignment', async () => {
  const world = buildWorld({ p3: false });
  // importedA has a login with a current assignment in another company (invisible to the fleet manager's RLS view).
  const login = { id: '00000000-0000-4000-8000-00000000a1b6', email: P.importedA.email, email_confirmed_at: null };
  world.authUsers.push(login);
  profileRow(world, P.importedA.profileId).user_id = login.id;
  (world.tables.crew_assignments ??= []).push({ id: 'elsewhere', user_id: login.id, vessel_id: V_B1, is_current: true, position: 'Deckhand', join_date: '2026-01-01' });
  const outcome = await inviteProfile(await ctxFor(world, P.adminA), P.importedA.profileId, mailer().deps);
  assert(outcome.status === 'sent');
  assertEquals(outcome.assignment, 'failed');
  assertEquals(assignmentInserts(world).length, 0);
  assertEquals(assignmentsOf(world, login.id).map((a) => a.vessel_id), [V_B1]);
  assertEquals(profileRow(world, P.importedA.profileId).imported_vessel_id, V_A1, 'still pending: the admin sees the vessel was not assigned');
});

Deno.test('assignment: a target with a current assignment gets no fulfilment and no field', async () => {
  for (const p3 of [true, false]) {
    const world = buildWorld({ p3 });
    // invitedA is on Aurora already; a stale import link must not add a second vessel.
    Object.assign(profileRow(world, P.invitedA.profileId), { is_imported: true, imported_vessel_id: V_A2 });
    const outcome = await inviteProfile(await ctxFor(world, P.adminA), P.invitedA.profileId, mailer().deps);
    assert(outcome.status === 'sent', `p3=${p3}`);
    assertEquals(outcome.assignment, undefined);
    assertEquals(fulfilCalls(world).length, 0);
    assertEquals(assignmentInserts(world).length, 0);
    assertEquals(assignmentsOf(world, P.invitedA.userId).map((a) => a.vessel_id), [V_A1]);
    assertFalse('assignment' in (await invitationResponse(outcome).json()));
  }
});

Deno.test('assignment (P3): a failed send that linked the login still assigns; the 502 and the bulk row carry it', async () => {
  const world = buildWorld({ p3: true });
  const outcome = await inviteProfile(await ctxFor(world, P.adminA), P.importedA.profileId, mailer([{ ok: false, errorCode: 'provider_unavailable' }]).deps);
  assert(outcome.status === 'send_failed');
  assertEquals(outcome.assignment, 'created');
  const res = invitationResponse(outcome);
  assertEquals(res.status, 502);
  assertEquals((await res.json()).assignment, 'created');
  assertEquals(bulkRow(outcome).assignment, 'created');
});

// ---- the attempt counter ------------------------------------------------------------------------

Deno.test('invite: an exhausted attempt counter → 409 counter_exhausted, no link, nothing sent', async () => {
  const world = buildWorld({ p3: true });
  world.hooks.rpc = (r) => (r.fn === 'reserve_invitation_attempt' ? ok({ ok: false, code: 'counter_exhausted' }) : undefined);
  const m = mailer();
  const outcome = await inviteProfile(await ctxFor(world, P.adminA), P.importedA.profileId, m.deps);
  assert(outcome.status === 'refused');
  assertEquals([outcome.error.status, outcome.error.code, outcome.error.details?.reason], [409, 'conflict', 'counter_exhausted']);
  assertEquals(outcome.error.publicMessage, 'STORM cannot send this person another invitation. Contact STORM support.');
  assertEquals(linkCalls(world).length, 0);
  assertEquals(m.sent.length, 0);

  // D-01: the same answer when the computed attempt would pass the integer range.
  const legacy = buildWorld({ p3: false });
  profileRow(legacy, P.importedA.profileId).invitation_count = MAX_INVITE_ATTEMPT;
  const l = mailer();
  const refused = await inviteProfile(await ctxFor(legacy, P.adminA), P.importedA.profileId, l.deps);
  assert(refused.status === 'refused');
  assertEquals([refused.error.status, refused.error.details?.reason], [409, 'counter_exhausted']);
  assertEquals(linkCalls(legacy).length, 0);
  assertEquals(l.sent.length, 0);
  assertEquals(bulkRow(refused).reason, 'counter_exhausted');
});
