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

Deno.test('clientIp: cf-connecting-ip, then x-real-ip, else unknown; X-Forwarded-For is never trusted', () => {
  const ip = (headers: Record<string, string>) => clientIp(new Request('https://x.test', { headers }));
  assertEquals(ip({ 'cf-connecting-ip': '198.51.100.4', 'x-real-ip': '192.0.2.8', 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }), '198.51.100.4');
  assertEquals(ip({ 'x-real-ip': '192.0.2.8', 'x-forwarded-for': '203.0.113.7' }), '192.0.2.8');
  assertEquals(ip({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }), 'unknown', 'the caller-written first hop is not an address');
  assertEquals(ip({}), 'unknown');
  assertEquals(ip({ 'cf-connecting-ip': 'x'.repeat(65) }), 'unknown');
});

Deno.test('clientIp: rotating the X-Forwarded-For first hop does not change the key', () => {
  const keys = new Set<string>();
  for (let i = 0; i < 25; i++) {
    keys.add(clientIp(new Request('https://x.test', { headers: { 'x-forwarded-for': `10.0.${i}.1, 203.0.113.9`, 'cf-connecting-ip': '198.51.100.4' } })));
  }
  assertEquals([...keys], ['198.51.100.4']);
});

Deno.test('RateLimiter.peek: reports an exhausted key without counting', () => {
  let t = 0;
  const limiter = new RateLimiter({ limit: 2, windowMs: 60_000 }, () => t);
  assert(limiter.peek('k').ok);
  assert(limiter.peek('k').ok, 'peeking never counts');
  limiter.hit('k');
  assert(limiter.peek('k').ok);
  limiter.hit('k');
  const blocked = limiter.peek('k');
  assertFalse(blocked.ok);
  assertEquals(blocked.retryAfterSeconds, 60);
  t = 60_000;
  assert(limiter.peek('k').ok, 'a new window');
});

Deno.test('digestKey', async () => {
  const d = await digestKey('token-1');
  assertEquals(d.length, 64);
  assertNotEquals(d, 'token-1');
  assertEquals(d, await digestKey('token-1'));
});
