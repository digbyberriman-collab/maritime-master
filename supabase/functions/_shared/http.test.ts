import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1.0.13';
import { corsHeaders, handleOptions } from './cors.ts';
import { errorResponse, HttpError, json, readJson, withHttp } from './http.ts';
import { objectBody, optionalDate, requiredUuid, uuidList } from './validate.ts';

const req = (method = 'POST', origin?: string, body?: string) =>
  new Request('https://fn.test/x', { method, headers: origin ? { Origin: origin } : {}, body });

Deno.test('cors: * without an allow-list; only listed origins echoed with one', () => {
  assertEquals(corsHeaders(req())['Access-Control-Allow-Origin'], '*');
  const listed = corsHeaders(req('POST', 'https://app.storm.test'), ['https://app.storm.test']);
  assertEquals(listed['Access-Control-Allow-Origin'], 'https://app.storm.test');
  assertEquals(listed.Vary, 'Origin');
  const other = corsHeaders(req('POST', 'https://evil.test'), ['https://app.storm.test']);
  assertFalse('Access-Control-Allow-Origin' in other);
});

Deno.test('cors: preflight answers 204 with the allowed headers', () => {
  const res = handleOptions(req('OPTIONS'));
  assert(res);
  assertEquals(res.status, 204);
  assert(res.headers.get('Access-Control-Allow-Headers')?.includes('authorization'));
  assertEquals(handleOptions(req('POST')), null);
});

Deno.test('withHttp: preflight, method check and CORS on handler responses', async () => {
  const handler = withHttp(() => Promise.resolve(json({ ok: true })), { allowedOrigins: ['https://app.storm.test'] });
  const pre = await handler(req('OPTIONS', 'https://app.storm.test'));
  assertEquals(pre.status, 204);
  assertEquals(pre.headers.get('Access-Control-Allow-Origin'), 'https://app.storm.test');

  const get = await handler(req('GET'));
  assertEquals(get.status, 405);
  assertEquals((await get.json()).error.code, 'method_not_allowed');

  const post = await handler(req('POST', 'https://app.storm.test', '{}'));
  assertEquals(post.status, 200);
  assertEquals(post.headers.get('Access-Control-Allow-Origin'), 'https://app.storm.test');
  assertEquals(post.headers.get('Cache-Control'), 'no-store');

  const foreign = await handler(req('POST', 'https://evil.test', '{}'));
  assertEquals(foreign.headers.get('Access-Control-Allow-Origin'), null, 'an unlisted origin is never echoed, even if the handler set *');
});

Deno.test('withHttp: an unexpected error is a generic 500 without stack, message or provider text', async () => {
  const secret = 'provider says: mailbox someone@example.test rejected; key re_abcdefghijk';
  const handler = withHttp(() => {
    throw new Error(secret);
  });
  const res = await handler(req());
  assertEquals(res.status, 500);
  const text = await res.text();
  assertFalse(text.includes('provider'));
  assertFalse(text.includes('example.test'));
  assertFalse(text.includes('at '), 'no stack frames');
  assertEquals(JSON.parse(text), { error: { code: 'internal_error', message: 'Something went wrong. Try again.' } });
});

Deno.test('errorResponse: HttpError keeps status, code, details and headers', async () => {
  const res = errorResponse(new HttpError(429, 'cooldown', 'Wait.', { retry_after_seconds: 12 }, { 'Retry-After': '12' }));
  assertEquals(res.status, 429);
  assertEquals(res.headers.get('Retry-After'), '12');
  assertEquals(await res.json(), { error: { code: 'cooldown', message: 'Wait.', details: { retry_after_seconds: 12 } } });
});

Deno.test('readJson: bad JSON and parse failures are 400 invalid_request', async () => {
  const bad = await readJson(req('POST', undefined, 'not json'), (v) => v).catch((e) => e);
  assert(bad instanceof HttpError);
  assertEquals(bad.code, 'invalid_request');
  const wrong = await readJson(req('POST', undefined, '[1]'), objectBody).catch((e) => e);
  assert(wrong instanceof HttpError);
  assertEquals(wrong.status, 400);
});

Deno.test('validate: ids, id lists (dedupe, cap) and dates', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  assertEquals(requiredUuid({ a: id.toUpperCase() }, 'a'), id);
  assertEquals(uuidList({ ids: [id, id] }, 'ids', 50), [id]);
  const over = (() => {
    try {
      uuidList({ ids: Array.from({ length: 51 }, () => id) }, 'ids', 50);
    } catch (e) {
      return e;
    }
  })();
  assert(over instanceof HttpError && over.status === 400);
  assertEquals(optionalDate({ d: '2026-02-28' }, 'd'), '2026-02-28');
  let refused = false;
  try {
    optionalDate({ d: '2026-02-30' }, 'd');
  } catch {
    refused = true;
  }
  assert(refused);
});
