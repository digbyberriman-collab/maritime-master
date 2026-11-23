import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1.0.13';
import { RateLimiter } from '../_shared/rateLimit.ts';
import { callsOf, fail, fakeClientFactory, type FakeAuthUser, ok } from '../_shared/testing/fakeSupabase.ts';
import { bodyOf, buildWorld, obj, P, profileRow, request, TEST_ENV } from '../_shared/testing/world.ts';
import { createHandler, FAILURE_LIMIT } from './handler.ts';

const NOW = new Date('2026-11-23T10:00:00Z');
const TOKEN = 'inv_0123456789abcdefABCDEF';
const PASSWORD = 'correct horse battery';

function setup(limits: { ip?: number; token?: number; failures?: number } = {}) {
  const world = buildWorld({ p3: false });
  const p = profileRow(world, P.invitedA.profileId);
  p.invitation_token = TOKEN;
  p.invitation_token_expires = new Date(NOW.getTime() + 3600_000).toISOString();
  const handler = createHandler({
    env: () => TEST_ENV,
    createClient: fakeClientFactory(world),
    now: () => NOW,
    ipLimiter: new RateLimiter({ limit: limits.ip ?? 100, windowMs: 60_000 }),
    tokenLimiter: new RateLimiter({ limit: limits.token ?? 100, windowMs: 60_000 }),
    failureLimiter: new RateLimiter({ limit: limits.failures ?? 1000, windowMs: 60_000 }),
  });
  return { world, handler };
}

const accept = (h: ReturnType<typeof setup>, body: unknown, ip = '203.0.113.9') =>
  h.handler(request(null, body, { headers: { 'cf-connecting-ip': ip } }));

async function reasonOf(res: Response): Promise<unknown> {
  const error = obj(await bodyOf(res), 'error');
  return (error.details as Record<string, unknown> | undefined)?.reason ?? error.code;
}

Deno.test('accept-invitation: a valid token sets the password, confirms the email and works once', async () => {
  const h = setup();
  const res = await accept(h, { token: TOKEN, password: PASSWORD });
  assertEquals(res.status, 200);
  assertEquals(await bodyOf(res), { ok: true });
  const update = callsOf(h.world, 'admin').find((c) => c.method === 'updateUserById');
  assert(update);
  assertEquals(update.args.id, P.invitedA.userId);
  assertEquals(update.args.attrs, { password: '[set]', email_confirm: true });
  assertEquals(profileRow(h.world, P.invitedA.profileId).invitation_token, null);

  const again = await accept(h, { token: TOKEN, password: PASSWORD });
  assertEquals(again.status, 400);
  assertEquals(await reasonOf(again), 'invalid_or_expired');
});

Deno.test('accept-invitation: unknown, malformed, expired and expiry-less tokens get the same answer', async () => {
  const h = setup();
  for (const token of ['inv_unknown_token_000000', 'short', '../../etc/passwd', 42]) {
    const res = await accept(h, { token, password: PASSWORD });
    assertEquals(res.status, 400);
    assertEquals(await reasonOf(res), 'invalid_or_expired');
  }
  const p = profileRow(h.world, P.invitedA.profileId);
  p.invitation_token_expires = new Date(NOW.getTime() - 1).toISOString();
  assertEquals(await reasonOf(await accept(h, { token: TOKEN, password: PASSWORD })), 'invalid_or_expired');
  p.invitation_token_expires = null;
  assertEquals(await reasonOf(await accept(h, { token: TOKEN, password: PASSWORD })), 'invalid_or_expired');
  assertEquals(callsOf(h.world, 'admin').length, 0);
});

Deno.test('accept-invitation: password must be at least 12 characters (and at most 72)', async () => {
  const h = setup();
  assertEquals(await reasonOf(await accept(h, { token: TOKEN, password: 'elevenchars' })), 'password_too_short');
  assertEquals(await reasonOf(await accept(h, { token: TOKEN })), 'password_too_short');
  assertEquals(await reasonOf(await accept(h, { token: TOKEN, password: 'x'.repeat(73) })), 'password_too_long');
  assertEquals(profileRow(h.world, P.invitedA.profileId).invitation_token, TOKEN, 'token untouched');
});

Deno.test('accept-invitation: a disabled account is refused', async () => {
  const h = setup();
  profileRow(h.world, P.invitedA.profileId).account_status = 'disabled';
  const res = await accept(h, { token: TOKEN, password: PASSWORD });
  assertEquals(res.status, 403);
  assertEquals(obj(await bodyOf(res), 'error').code, 'account_disabled');
});

Deno.test('accept-invitation: a failed password write restores the token (the link still works)', async () => {
  const h = setup();
  let failing = true;
  h.world.hooks.admin = (a) => (failing && a.method === 'updateUserById' ? fail('weak_password', 'weak', 422) : undefined);
  const res = await accept(h, { token: TOKEN, password: PASSWORD });
  assertEquals(res.status, 400);
  assertEquals(await reasonOf(res), 'password_rejected');
  assertEquals(profileRow(h.world, P.invitedA.profileId).invitation_token, TOKEN);
  failing = false;
  assertEquals((await accept(h, { token: TOKEN, password: PASSWORD })).status, 200);
});

Deno.test('accept-invitation: per-IP and per-token rate limits (429 with Retry-After)', async () => {
  const ip = setup({ ip: 3 });
  let last: Response | null = null;
  for (let i = 0; i < 4; i++) last = await accept(ip, { token: 'inv_guess_000000000000' + i, password: PASSWORD });
  assert(last);
  assertEquals(last.status, 429);
  assert(last.headers.get('Retry-After'));

  const tok = setup({ token: 2 });
  for (let i = 0; i < 2; i++) await accept(tok, { token: 'inv_guess_aaaaaaaaaaaaaa', password: PASSWORD }, `198.51.100.${i}`);
  const third = await accept(tok, { token: 'inv_guess_aaaaaaaaaaaaaa', password: PASSWORD }, '198.51.100.77');
  assertEquals(third.status, 429, 'a new IP does not reset the per-token limit');
});

Deno.test('accept-invitation: a lookup error is 503 and leaks nothing', async () => {
  const h = setup();
  h.world.hooks.query = () => fail('XX000', 'relation secret_table exploded at 10.0.0.3');
  const res = await accept(h, { token: TOKEN, password: PASSWORD });
  assertEquals(res.status, 503);
  const text = JSON.stringify(await bodyOf(res));
  assert(!text.includes('secret_table'));
});

const guess = (i: number) => `inv_guess_${String(i).padStart(14, '0')}`;

Deno.test('accept-invitation: 25 guesses that rotate the X-Forwarded-For first hop are still limited (429)', async () => {
  // Default limits, as deployed: the per-IP key ignores X-Forwarded-For.
  const world = buildWorld({ p3: false });
  const handler = createHandler({ env: () => TEST_ENV, createClient: fakeClientFactory(world), now: () => NOW });
  const statuses: number[] = [];
  for (let i = 0; i < 25; i++) {
    const res = await handler(request(null, { token: guess(i), password: PASSWORD }, { headers: { 'x-forwarded-for': `10.0.${i}.1, 203.0.113.9` } }));
    statuses.push(res.status);
  }
  assertEquals(statuses.slice(0, 20), Array(20).fill(400));
  assertEquals(statuses.slice(20), Array(5).fill(429));
});

/** Runs `fn` while capturing the warnings the handler logs (one JSON line each). */
async function captureWarnings<T>(fn: () => Promise<T>): Promise<{ result: T; warnings: Array<Record<string, unknown>> }> {
  const original = console.warn;
  const lines: string[] = [];
  console.warn = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  try {
    const result = await fn();
    return { result, warnings: lines.map((l) => JSON.parse(l) as Record<string, unknown>) };
  } finally {
    console.warn = original;
  }
}

const floods = (warnings: Array<Record<string, unknown>>) => warnings.filter((w) => w.event === 'accept_invitation_guess_flood');

Deno.test('accept-invitation: a guessing flood from rotating addresses never blocks a valid token (D-200); it is logged once', async () => {
  // Default limits, as deployed: one fixed failure key, 50 a minute, detection only.
  const world = buildWorld({ p3: false });
  const p = profileRow(world, P.invitedA.profileId);
  p.invitation_token = TOKEN;
  p.invitation_token_expires = new Date(NOW.getTime() + 3600_000).toISOString();
  const handler = createHandler({ env: () => TEST_ENV, createClient: fakeClientFactory(world), now: () => NOW });
  const { result: statuses, warnings } = await captureWarnings(async () => {
    const out: number[] = [];
    for (let i = 0; i < FAILURE_LIMIT + 1; i++) {
      const headers = { 'cf-connecting-ip': `198.51.${i}.7`, 'x-real-ip': `192.0.${i}.8`, 'x-forwarded-for': `10.0.${i}.1` };
      out.push((await handler(request(null, { token: guess(i), password: PASSWORD }, { headers }))).status);
    }
    out.push((await handler(request(null, { token: guess(999), password: PASSWORD }, { headers: { 'cf-connecting-ip': '198.51.255.7' } }))).status);
    return out;
  });
  assertEquals(statuses, Array(FAILURE_LIMIT + 2).fill(400), 'every miss stays the generic 400');
  const flood = floods(warnings);
  assertEquals(flood.length, 1, 'one warning per window');
  assertEquals(flood[0].window_count, FAILURE_LIMIT + 1);
  assertEquals(Object.keys(flood[0]).sort(), ['at', 'event', 'level', 'window_count'], 'no token, no address');
  assertFalse(JSON.stringify(warnings).includes('inv_guess'));
  assertFalse(JSON.stringify(warnings).includes('198.51.'));

  const valid = await handler(request(null, { token: TOKEN, password: PASSWORD }, { headers: { 'cf-connecting-ip': '203.0.113.50' } }));
  assertEquals(valid.status, 200, 'a valid token from a new address still works');
});

Deno.test('accept-invitation: 20 malformed tokens with no address headers do not block a valid request', async () => {
  const world = buildWorld({ p3: false });
  const p = profileRow(world, P.invitedA.profileId);
  p.invitation_token = TOKEN;
  p.invitation_token_expires = new Date(NOW.getTime() + 3600_000).toISOString();
  const handler = createHandler({ env: () => TEST_ENV, createClient: fakeClientFactory(world), now: () => NOW });
  for (let i = 0; i < 20; i++) assertEquals((await handler(request(null, { token: 'short', password: PASSWORD }))).status, 400);
  for (let i = 0; i < 5; i++) assertEquals((await handler(request(null, 'not json'))).status, 400);
  const valid = await handler(request(null, { token: TOKEN, password: PASSWORD }));
  assertEquals(valid.status, 200, 'the shared unknown bucket holds only well-formed attempts');
});

Deno.test('accept-invitation: the failure count covers only well-formed invalid tokens; past it misses stay 400', async () => {
  const h = setup({ failures: 2 });
  const { warnings } = await captureWarnings(async () => {
    for (let i = 0; i < 5; i++) assertEquals((await accept(h, { token: 'short', password: PASSWORD }, `198.51.100.${i}`)).status, 400, 'malformed: not counted');
    for (let i = 0; i < 5; i++) assertEquals((await accept(h, { token: guess(i), password: 'short' }, `198.51.101.${i}`)).status, 400, 'bad password: no lookup, not counted');
    assertEquals((await accept(h, { token: guess(1), password: PASSWORD })).status, 400);
    assertEquals((await accept(h, { token: guess(2), password: PASSWORD })).status, 400);
    assertEquals((await accept(h, { token: guess(3), password: PASSWORD })).status, 400, 'over the count: still the generic answer, never 429');
    assertEquals((await accept(h, { token: guess(4), password: PASSWORD })).status, 400);
  });
  assertEquals(floods(warnings).map((w) => w.window_count), [3], 'logged once, at the first miss over the count');
  assertEquals((await accept(h, { token: TOKEN, password: PASSWORD })).status, 200, 'a valid token still works');
});

// ---- only a live invitation for a login that was never used (profile-invite-bookkeeping, revoke) ---

Deno.test('accept-invitation: a token on a profile that is not invited is refused like an unknown token', async () => {
  for (const status of ['active', 'not_invited', '']) {
    const h = setup();
    profileRow(h.world, P.invitedA.profileId).account_status = status;
    const res = await accept(h, { token: TOKEN, password: PASSWORD });
    assertEquals(res.status, 400, status);
    assertEquals(await reasonOf(res), 'invalid_or_expired');
    assertEquals(callsOf(h.world, 'admin').filter((c) => c.method === 'updateUserById').length, 0);
    assertEquals(profileRow(h.world, P.invitedA.profileId).invitation_token, TOKEN, 'no claim');
  }
});

Deno.test('accept-invitation: a login that has signed in or is confirmed is refused (an admin\'s login cannot be taken over)', async () => {
  const cases: Array<[string, Partial<FakeAuthUser>]> = [
    ['signed in', { last_sign_in_at: '2026-11-01T00:00:00Z' }],
    ['confirmed', { email_confirmed_at: '2026-11-01T00:00:00Z' }],
  ];
  for (const [label, patch] of cases) {
    const h = setup();
    const login = h.world.authUsers.find((u) => u.id === P.invitedA.userId);
    assert(login);
    Object.assign(login, patch);
    const res = await accept(h, { token: TOKEN, password: PASSWORD });
    assertEquals(res.status, 400, label);
    assertEquals(await reasonOf(res), 'invalid_or_expired');
    assertEquals(callsOf(h.world, 'admin').filter((c) => c.method === 'updateUserById').length, 0, label);
    assertEquals(profileRow(h.world, P.invitedA.profileId).invitation_token, TOKEN, `${label}: no claim`);
  }
  // The review's case: a token written onto an active admin profile with a confirmed login.
  const admin = setup();
  const row = profileRow(admin.world, P.adminA.profileId);
  row.invitation_token = 'attackerChosenToken_0123456789';
  row.invitation_token_expires = new Date(NOW.getTime() + 86_400_000).toISOString();
  const res = await accept(admin, { token: 'attackerChosenToken_0123456789', password: PASSWORD });
  assertEquals(res.status, 400);
  assertEquals(await reasonOf(res), 'invalid_or_expired');
  assertEquals(callsOf(admin.world, 'admin').filter((c) => c.method === 'updateUserById').length, 0);
});

Deno.test('accept-invitation: a missing login is refused; a login read error is 503; neither claims the token', async () => {
  const gone = setup();
  gone.world.authUsers = gone.world.authUsers.filter((u) => u.id !== P.invitedA.userId);
  const r1 = await accept(gone, { token: TOKEN, password: PASSWORD });
  assertEquals(r1.status, 400);
  assertEquals(await reasonOf(r1), 'invalid_or_expired');
  assertEquals(profileRow(gone.world, P.invitedA.profileId).invitation_token, TOKEN);

  const down = setup();
  down.world.hooks.admin = (a) => (a.method === 'getUserById' ? fail('unexpected_failure', 'auth down at 10.0.0.3', 500) : undefined);
  const r2 = await accept(down, { token: TOKEN, password: PASSWORD });
  assertEquals(r2.status, 503);
  assertFalse(JSON.stringify(await bodyOf(r2)).includes('10.0.0.3'));
  assertEquals(callsOf(down.world, 'admin').filter((c) => c.method === 'updateUserById').length, 0);
  assertEquals(profileRow(down.world, P.invitedA.profileId).invitation_token, TOKEN);
});

Deno.test('accept-invitation: a withdrawn invitation (invitation_withdrawn_for true) → 400, no password, token untouched', async () => {
  const h = setup();
  h.world.hooks.rpc = (r) => (r.fn === 'invitation_withdrawn_for' ? ok(true) : undefined);
  const res = await accept(h, { token: TOKEN, password: PASSWORD });
  assertEquals(res.status, 400);
  assertEquals(await reasonOf(res), 'invalid_or_expired');
  const check = callsOf(h.world, 'rpc').find((c) => c.fn === 'invitation_withdrawn_for');
  assert(check);
  assertEquals([check.caller.role, check.args], ['service', { _user_id: P.invitedA.userId }]);
  assertEquals(callsOf(h.world, 'admin').filter((c) => c.method === 'updateUserById').length, 0);
  const p = profileRow(h.world, P.invitedA.profileId);
  assertEquals([p.invitation_token, p.invitation_token_expires], [TOKEN, new Date(NOW.getTime() + 3600_000).toISOString()]);
});

Deno.test('accept-invitation: invitation_withdrawn_for missing (D-01) carries on; false carries on; an error or a non-boolean is 503', async () => {
  const missing = setup(); // p3:false world: the function is not there
  assertEquals((await accept(missing, { token: TOKEN, password: PASSWORD })).status, 200);

  const live = setup();
  live.world.hooks.rpc = (r) => (r.fn === 'invitation_withdrawn_for' ? ok(false) : undefined);
  assertEquals((await accept(live, { token: TOKEN, password: PASSWORD })).status, 200);

  for (const answer of [fail('XX000', 'boom'), fail('42501', 'permission denied'), ok(null)]) {
    const h = setup();
    h.world.hooks.rpc = (r) => (r.fn === 'invitation_withdrawn_for' ? answer : undefined);
    const res = await accept(h, { token: TOKEN, password: PASSWORD });
    assertEquals(res.status, 503, JSON.stringify(answer));
    assertEquals(callsOf(h.world, 'admin').filter((c) => c.method === 'updateUserById').length, 0);
    assertEquals(profileRow(h.world, P.invitedA.profileId).invitation_token, TOKEN);
  }
});

Deno.test('accept-invitation (P3): after a revoke the legacy token is refused end to end', async () => {
  const world = buildWorld({ p3: true });
  const p = profileRow(world, P.invitedA.profileId);
  p.invitation_token = TOKEN;
  p.invitation_token_expires = new Date(NOW.getTime() + 3600_000).toISOString();
  (world.tables.user_invitations ??= []).push({ id: 'inv-1', company_id: p.company_id, profile_id: p.id, user_id: p.user_id, status: 'sent', send_attempts: 1 });
  // The fleet manager revokes it (the SQL resets the never-signed-in profile to not_invited).
  const asAdmin = fakeClientFactory(world)(TEST_ENV.supabaseUrl, TEST_ENV.anonKey, { global: { headers: { Authorization: `Bearer ${P.adminA.token}` } } });
  const revoked = await asAdmin.rpc('revoke_invitation', { p_invitation_id: 'inv-1' });
  assertEquals(revoked.error, null);
  assertEquals(p.account_status, 'not_invited');
  const handler = createHandler({ env: () => TEST_ENV, createClient: fakeClientFactory(world), now: () => NOW });
  const res = await handler(request(null, { token: TOKEN, password: PASSWORD }, { headers: { 'cf-connecting-ip': '203.0.113.9' } }));
  assertEquals(res.status, 400);
  assertEquals(await reasonOf(res), 'invalid_or_expired');
  assertEquals(callsOf(world, 'admin').filter((c) => c.method === 'updateUserById').length, 0);
  assertEquals(p.invitation_token, TOKEN);
});

