import { assert, assertEquals } from 'jsr:@std/assert@1.0.13';
import { RateLimiter } from '../_shared/rateLimit.ts';
import { callsOf, fail, fakeClientFactory } from '../_shared/testing/fakeSupabase.ts';
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

Deno.test('accept-invitation: rotating every address header still hits the failure limiter (one fixed key)', async () => {
  const h = setup({ ip: 1000, failures: FAILURE_LIMIT });
  const statuses: number[] = [];
  for (let i = 0; i < FAILURE_LIMIT + 5; i++) {
    const headers = { 'cf-connecting-ip': `198.51.${i}.7`, 'x-real-ip': `192.0.${i}.8`, 'x-forwarded-for': `10.0.${i}.1` };
    statuses.push((await h.handler(request(null, { token: guess(i), password: PASSWORD }, { headers }))).status);
  }
  assertEquals(statuses.filter((s) => s === 400).length, FAILURE_LIMIT);
  assertEquals(statuses.slice(FAILURE_LIMIT), Array(5).fill(429));
  // While it is exhausted the lookup is not even made (a valid token waits too).
  const before = h.world.calls.length;
  const valid = await accept(h, { token: TOKEN, password: PASSWORD }, '198.51.200.1');
  assertEquals(valid.status, 429);
  assert(valid.headers.get('Retry-After'));
  assertEquals(h.world.calls.length, before, 'refused before the lookup');
});

Deno.test('accept-invitation: the failure limiter counts only well-formed invalid tokens', async () => {
  const h = setup({ failures: 2 });
  for (let i = 0; i < 5; i++) assertEquals((await accept(h, { token: 'short', password: PASSWORD }, `198.51.100.${i}`)).status, 400, 'malformed: not counted');
  for (let i = 0; i < 5; i++) assertEquals((await accept(h, { token: guess(i), password: 'short' }, `198.51.101.${i}`)).status, 400, 'bad password: no lookup, not counted');
  assertEquals((await accept(h, { token: TOKEN, password: PASSWORD })).status, 200, 'a valid token still works');
  assertEquals((await accept(h, { token: guess(1), password: PASSWORD })).status, 400);
  assertEquals((await accept(h, { token: guess(2), password: PASSWORD })).status, 400);
  assertEquals((await accept(h, { token: guess(3), password: PASSWORD })).status, 429);
});

