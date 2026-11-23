import { assert, assertEquals, assertFalse, assertStringIncludes } from 'jsr:@std/assert@1.0.13';
import { type EmailErrorCode, escapeHtml, isSafeLink, payloadTag, renderEmail, sendEmail, type EmailMessage } from './email.ts';
import { fakeFetcher, idempotentProvider } from './testing/fakeFetch.ts';
import { envWith, TEST_ENV } from './testing/world.ts';

const LINK = 'https://project.supabase.test/auth/v1/verify?token=t&type=invite&redirect_to=https%3A%2F%2Fapp.storm.test%2Freset-password%3Fflow%3Dinvite';

const message = (patch: Partial<EmailMessage> = {}): EmailMessage => ({
  to: 'crew-a@example.test',
  template: 'CREW_INVITATION',
  variables: { action_link: LINK, first_name: 'Deckhand', company_name: 'Demo Fleet A', vessel_name: 'Aurora' },
  idempotencyKey: 'invite:p1:1',
  ...patch,
});

Deno.test('sendEmail: not_configured when RESEND_API_KEY or EMAIL_FROM is missing (no request made)', async () => {
  for (const patch of [{ resendApiKey: null }, { emailFrom: null }, { emailFrom: 'not an address' }]) {
    const f = fakeFetcher();
    const result = await sendEmail(message(), envWith(patch), f.fetcher);
    assertEquals(result, { ok: false, errorCode: 'not_configured' });
    assertEquals(f.calls.length, 0);
  }
});

Deno.test('sendEmail: invalid_recipient and invalid_link are refused before the provider', async () => {
  const f = fakeFetcher();
  assertEquals(await sendEmail(message({ to: 'nobody' }), TEST_ENV, f.fetcher), { ok: false, errorCode: 'invalid_recipient' });
  assertEquals(await sendEmail(message({ to: 'a@b.c\r\nBcc: x@y.z' }), TEST_ENV, f.fetcher), { ok: false, errorCode: 'invalid_recipient' });
  for (const link of ['http://project.supabase.test/verify', 'javascript:alert(1)', 'https://x.test/a b', '']) {
    const r = await sendEmail(message({ variables: { action_link: link } }), TEST_ENV, f.fetcher);
    assertEquals(r, { ok: false, errorCode: 'invalid_link' }, link);
  }
  assertEquals(await sendEmail(message({ variables: {} }), TEST_ENV, f.fetcher), { ok: false, errorCode: 'invalid_link' });
  assertEquals(f.calls.length, 0);
});

Deno.test('sendEmail: fixed sender, one recipient, no cc / bcc, idempotency key, html + text', async () => {
  const f = fakeFetcher([200]);
  const result = await sendEmail(message(), TEST_ENV, f.fetcher);
  assertEquals(result, { ok: true, providerMessageId: 'msg-1' });
  const call = f.calls[0];
  assertEquals(call.url, 'https://api.resend.com/emails');
  assertEquals(call.headers['idempotency-key'], 'invite:p1:1');
  assertEquals(call.headers.authorization, `Bearer ${TEST_ENV.resendApiKey}`);
  assertEquals(call.body.from, TEST_ENV.emailFrom);
  assertEquals(call.body.to, ['crew-a@example.test']);
  assertFalse('cc' in call.body);
  assertFalse('bcc' in call.body);
  assertEquals(call.body.subject, 'Join Demo Fleet A on STORM');
  assertStringIncludes(String(call.body.html), 'Set your password');
  assertStringIncludes(String(call.body.text), LINK);
});

Deno.test('sendEmail: every variable is HTML-escaped; the subject has no line breaks', async () => {
  const f = fakeFetcher([200]);
  await sendEmail(
    message({ variables: { action_link: LINK, first_name: '<script>alert(1)</script>', company_name: 'A & B\r\nBcc: x@y.z', vessel_name: '"><img src=x onerror=1>' } }),
    TEST_ENV,
    f.fetcher,
  );
  const html = String(f.calls[0].body.html);
  assertFalse(html.includes('<script>'));
  assertFalse(html.includes('<img src=x'));
  assertStringIncludes(html, '&lt;script&gt;alert(1)&lt;/script&gt;');
  assertStringIncludes(html, 'A &amp; B');
  assertStringIncludes(html, `href="${escapeHtml(LINK)}"`);
  assertFalse(String(f.calls[0].body.subject).includes('\n'));
});

Deno.test('sendEmail: honest provider outcomes (never "sent" unless accepted)', async () => {
  const cases: Array<[number | 'network', EmailErrorCode]> = [
    [422, 'provider_rejected'],
    [401, 'provider_rejected'],
    [409, 'provider_duplicate'],
    [429, 'provider_unavailable'],
    [500, 'provider_unavailable'],
    [503, 'provider_unavailable'],
    ['network', 'provider_unavailable'],
  ];
  for (const [status, code] of cases) {
    const f = fakeFetcher([status]);
    assertEquals(await sendEmail(message(), TEST_ENV, f.fetcher), { ok: false, errorCode: code }, String(status));
  }
});

Deno.test('templates: password reset copy, plain greeting without a name', () => {
  const r = renderEmail('PASSWORD_RESET', { action_link: LINK });
  assert(r.ok);
  assertEquals(r.email.subject, 'Reset your STORM password');
  assertStringIncludes(r.email.text, 'Hello,');
  assertStringIncludes(r.email.html, 'Choose a new password');
  const invite = renderEmail('CREW_INVITATION', { action_link: LINK });
  assert(invite.ok);
  assertEquals(invite.email.subject, 'You are invited to STORM');
});

Deno.test('isSafeLink: https only, no whitespace or quotes', () => {
  assert(isSafeLink(LINK));
  assertFalse(isSafeLink('http://x.test'));
  assertFalse(isSafeLink('https://x.test/"onclick'));
  assertFalse(isSafeLink(undefined));
  assertFalse(isSafeLink(`https://x.test/${'a'.repeat(3000)}`));
});

Deno.test('sendEmail: a provider 409 on the idempotency key is provider_duplicate (retryable), never provider_rejected', async () => {
  const provider = idempotentProvider();
  const first = await sendEmail(message({ idempotencyKey: 'reset:u1:1' }), TEST_ENV, provider.fetcher);
  assertEquals(first.ok, true);
  const other = message({ idempotencyKey: 'reset:u1:1', variables: { action_link: `${LINK}&n=2` } });
  assertEquals(await sendEmail(other, TEST_ENV, provider.fetcher), { ok: false, errorCode: 'provider_duplicate' });
  assertEquals(provider.delivered.length, 1);
});

Deno.test('payloadTag: 16 lower-case hex characters of SHA-256 of the link; a new link is a new tag', async () => {
  const tag = await payloadTag(LINK);
  assert(/^[0-9a-f]{16}$/.test(tag));
  assertEquals(tag, await payloadTag(LINK));
  assertFalse(tag === (await payloadTag(`${LINK}&n=2`)));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(LINK)));
  assertEquals(tag, Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join(''));
  assertFalse(LINK.includes(tag), 'the tag does not carry the link');
});

