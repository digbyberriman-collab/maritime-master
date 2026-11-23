import { assert, assertEquals, assertFalse, assertStringIncludes } from 'jsr:@std/assert@1.0.13';
import { getAuthContext } from './auth.ts';
import { type EmailMessage, type EmailResult, payloadTag, sendEmail } from './email.ts';
import type { EdgeEnv } from './env.ts';
import { HttpError } from './http.ts';
import { bulkRow, bulkSummary, type InviteDeps, inviteProfile, invitationResponse, isFakeEmail } from './invitations.ts';
import { idempotentProvider } from './testing/fakeFetch.ts';
import { callsOf, fail, fakeClientFactory, type FakeWorld, ok } from './testing/fakeSupabase.ts';
import { buildWorld, CO_A, envWith, P, type Persona, profileRow, request, TEST_ENV, V_A1, V_A2 } from './testing/world.ts';

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
  assertEquals(await res.json(), { ok: true, invitation: { status: 'sent', stored: true, id: outcome.invitationId } });
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
  assertEquals(await invitationResponse(second).json(), { ok: true, invitation: { status: 'sent', stored: false, id: null } });
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

