import { assertEquals, assertFalse } from 'jsr:@std/assert@1.0.13';
import { log, sanitize } from './log.ts';

Deno.test('sanitize: drops keys that could carry secrets or personal data', () => {
  const out = sanitize({
    event_kind: 'x',
    token: 'abc',
    access_token: 'abc',
    serviceRoleKey: 'abc',
    idempotencyKey: 'abc',
    password: 'abc',
    email: 'a@b.c',
    recipient_email: 'a@b.c',
    first_name: 'n',
    phone: '1',
    body: '{}',
    message: 'provider text',
    authorization: 'Bearer x',
    pin: '123456',
    pin_hash: 'h',
    pinHash: 'h',
    shipping_status: 'ok',
    profile_id: 'p',
    status: 404,
  });
  assertEquals(out, { event_kind: 'x', shipping_status: 'ok', profile_id: 'p', status: 404 });
});

Deno.test('sanitize: scrubs emails, JWTs, bearer values and API keys inside allowed fields', () => {
  const out = sanitize({
    detail: 'sent to crew-a@example.test ok',
    jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl',
    header: 'Bearer abc.def',
    resend: 'used re_abcdefghij12 here',
  });
  assertEquals(out.detail, 'sent to [redacted] ok');
  assertEquals(out.jwt, '[redacted]');
  assertEquals(out.header, '[redacted]');
  assertEquals(out.resend, 'used [redacted] here');
});

Deno.test('sanitize: removes control characters (no log-line injection) and caps length', () => {
  const out = sanitize({ code: 'a\nb c', long: 'x'.repeat(500), n: Number.NaN, skip: undefined });
  assertEquals(out.code, 'a b c');
  assertEquals(String(out.long).length, 200);
  assertEquals(out.n, null);
  assertFalse('skip' in out);
});

Deno.test('log: one JSON line; reserved keys cannot be overwritten', () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (line: string) => lines.push(line);
  try {
    log('info', 'invite_attempt', { level: 'error', event: 'forged', outcome: 'sent', email: 'x@y.z' });
  } finally {
    console.log = original;
  }
  assertEquals(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assertEquals(parsed.level, 'info');
  assertEquals(parsed.event, 'invite_attempt');
  assertEquals(parsed.outcome, 'sent');
  assertFalse('email' in parsed);
});
