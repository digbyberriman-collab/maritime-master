import { assert, assertEquals, assertFalse, assertNotEquals, assertThrows } from 'jsr:@std/assert@1.0.13';
import { HttpError } from './http.ts';
import { clientIp, digestKey, RateLimiter, timingSafeEqual } from './rateLimit.ts';

Deno.test('RateLimiter: allows the limit per window and key, then 429 with Retry-After', () => {
  let t = 0;
  const limiter = new RateLimiter({ limit: 2, windowMs: 60_000 }, () => t);
  assert(limiter.hit('a').ok);
  assert(limiter.hit('a').ok);
  const third = limiter.hit('a');
  assertFalse(third.ok);
  assertEquals(third.retryAfterSeconds, 60);
  assert(limiter.hit('b').ok, 'keys are independent');
  t = 30_000;
  const err = assertThrows(() => limiter.enforce('a'), HttpError);
  assertEquals(err.status, 429);
  assertEquals(err.code, 'rate_limited');
  assertEquals(err.headers?.['Retry-After'], '30');
  t = 60_000;
  assert(limiter.hit('a').ok, 'a new window starts');
});

Deno.test('RateLimiter: the key map stays bounded under a flood of fresh keys', () => {
  const limiter = new RateLimiter({ limit: 1, windowMs: 60_000 }, () => 0);
  for (let i = 0; i < 12_000; i++) limiter.hit(`k${i}`);
  assert(limiter.size <= 10_000);
});

Deno.test('timingSafeEqual: equal only for identical strings', () => {
  assert(timingSafeEqual('abc', 'abc'));
  assertFalse(timingSafeEqual('abc', 'abd'));
  assertFalse(timingSafeEqual('abc', 'abcd'));
  assertFalse(timingSafeEqual('', 'a'));
  assert(timingSafeEqual('', ''));
});

Deno.test('clientIp and digestKey', async () => {
  const req = new Request('https://x.test', { headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' } });
  assertEquals(clientIp(req), '203.0.113.7');
  assertEquals(clientIp(new Request('https://x.test')), 'unknown');
  const d = await digestKey('token-1');
  assertEquals(d.length, 64);
  assertNotEquals(d, 'token-1');
  assertEquals(d, await digestKey('token-1'));
});
