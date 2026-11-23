/**
 * Outbound email for edge functions (Phase 2 spec §C.3; gap/08 NO4; gap/01
 * W2, W7). One sender (`EMAIL_FROM`), no caller-chosen From, Cc or Bcc,
 * every variable HTML-escaped, templates fixed in code. Sends through the
 * provider's REST API with `fetch` (no SDK import), so it runs under
 * `deno check` and in the Edge Runtime.
 *
 * The result is honest: `ok: false` with a stable code whenever the email was
 * not accepted by the provider (`not_configured`: `RESEND_API_KEY` or
 * `EMAIL_FROM` missing; `invalid_recipient`; `invalid_link`: an action link
 * that is missing or not https; `provider_rejected`: the provider refused;
 * `provider_unavailable`: 429 / 5xx / network / timeout; `provider_duplicate`:
 * the provider answered 409 for the idempotency key, i.e. a send with this key
 * is in flight or the key was already used for another payload: retryable,
 * and never a reason to mark an earlier delivered email as failed). Callers
 * report that as a failed send; they never say "sent". Provider response text
 * is never returned or logged.
 *
 * Idempotency keys (D-146 as amended): `invite:<profileId>:<attempt>:<h16>`
 * and `reset:<userId>:<minuteBucket>:<h16>`, where `h16` = `payloadTag()` of
 * the generated action link. One key only ever goes with one payload: a new
 * link (a new one-time token) is a new key, so a retry never hits the
 * provider's "same key, different body" 409.
 */
import type { EdgeEnv } from './env.ts';
import { stripControls } from './log.ts';

export type EmailTemplate = 'CREW_INVITATION' | 'PASSWORD_RESET';
export type EmailErrorCode =
  | 'not_configured'
  | 'provider_rejected'
  | 'provider_unavailable'
  /** Provider 409 on the idempotency key (`invalid_idempotent_request` / `concurrent_idempotent_requests`): retryable. */
  | 'provider_duplicate'
  | 'invalid_recipient'
  | 'invalid_link';
export type EmailResult = { ok: true; providerMessageId: string | null } | { ok: false; errorCode: EmailErrorCode };

export interface EmailMessage {
  to: string;
  template: EmailTemplate;
  /** Plain-text values; every one is HTML-escaped before it reaches the body. */
  variables: Record<string, string>;
  /** Provider idempotency key (retries never send twice). */
  idempotencyKey: string;
}

export type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;
const MAX_VARIABLE = 200;
const MAX_LINK = 2048;
const PROVIDER_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

/**
 * The payload part of an idempotency key: the first 16 lower-case hex
 * characters of SHA-256 of the action link. Not a secret and not reversible
 * to the link's token; it only makes the key unique per payload.
 */
export async function payloadTag(actionLink: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(actionLink)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export function isValidRecipient(to: string): boolean {
  return to.length <= 254 && EMAIL.test(to);
}

/** A plain-text variable: control characters removed, trimmed, capped. */
export function cleanVariable(value: string | undefined, max = MAX_VARIABLE): string {
  return stripControls(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** An https URL without whitespace or quotes, at most 2048 characters. */
export function isSafeLink(value: string | undefined): value is string {
  if (!value || value.length > MAX_LINK || /[\s"'<>`]/.test(value)) return false;
  if (!/^https:\/\//i.test(value)) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

// Abyss anchors (DECISIONS §1). Email clients have no CSS variables, so the
// anchor values are written out here; text on Signal is Abyss.
const C = {
  abyss: '#0A0E14',
  deep: '#111722',
  slate: '#1C2533',
  drift: '#8A94A6',
  ink: '#E6EAF0',
  signal: '#00AFE6',
} as const;

/** The parts of a STORM email. Every string is already HTML-escaped (paragraphs may hold escaped text with `<strong>`). */
export interface EmailLayout {
  preheader: string;
  heading: string;
  paragraphs: string[];
  button?: { label: string; href: string };
  footnotes: string[];
}

/** One-column table layout (inline styles only, works in every client). Every argument is already escaped. */
export function renderLayout(l: EmailLayout): string {
  const button = l.button
    ? [
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px 0;"><tr><td style="border-radius:8px;background:${C.signal};">`,
      `<a href="${l.button.href}" style="display:inline-block;padding:14px 24px;font-size:15px;font-weight:600;color:${C.abyss};text-decoration:none;border-radius:8px;">${l.button.label}</a>`,
      '</td></tr></table>',
    ]
    : [];
  const p = (t: string) => `<p style="margin:0 0 16px 0;font-size:15px;line-height:22px;color:${C.ink};">${t}</p>`;
  const note = (t: string) => `<p style="margin:0 0 12px 0;font-size:13px;line-height:19px;color:${C.drift};">${t}</p>`;
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="dark light"><title>STORM</title></head>',
    `<body style="margin:0;padding:0;background:${C.abyss};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">`,
    `<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${l.preheader}</span>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.abyss};"><tr><td align="center" style="padding:32px 16px;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.deep};border:1px solid ${C.slate};border-radius:12px;">`,
    `<tr><td style="padding:24px 32px;border-bottom:1px solid ${C.slate};font-size:13px;font-weight:700;letter-spacing:4px;color:${C.signal};">STORM</td></tr>`,
    `<tr><td style="padding:32px;">`,
    `<h1 style="margin:0 0 20px 0;font-size:22px;line-height:28px;font-weight:600;color:${C.ink};">${l.heading}</h1>`,
    ...l.paragraphs.map(p),
    ...button,
    ...l.footnotes.map(note),
    `</td></tr></table></td></tr></table></body></html>`,
  ].join('');
}

type Vars = Readonly<Record<string, string>>;

interface TemplateDef {
  /** Variables that must be present and non-empty. */
  required: readonly string[];
  /** Variables that are links: must be https (else `invalid_link`). */
  links: readonly string[];
  render(v: Vars): RenderedEmail;
}

/** The fixed STORM templates. `v` holds cleaned plain text; escape with `e()` for HTML. */
export const TEMPLATES: Readonly<Record<EmailTemplate, TemplateDef>> = {
  CREW_INVITATION: {
    required: ['action_link'],
    links: ['action_link'],
    render(v) {
      const e = escapeHtml;
      const company = v.company_name ?? '';
      const vessel = v.vessel_name ?? '';
      const greeting = v.first_name ? `Hello ${v.first_name},` : 'Hello,';
      const who = company ? `${company} has invited you to STORM` : 'You have been invited to STORM';
      const intro = `${who}, the fleet operations workspace${vessel ? ` for ${vessel}` : ''}.`;
      const how = 'The button signs you in once and asks you to choose a password. Then you land in STORM.';
      const expiry = 'For your security the link works once and expires soon. If it has expired, ask your administrator to send a new invitation.';
      const ignore = 'If you were not expecting this invitation, you can ignore this email: nothing happens until the link is used.';
      const fallback = 'If the button does not work, copy this address into your browser:';
      const subject = company ? `Join ${company} on STORM` : 'You are invited to STORM';
      return {
        subject,
        html: renderLayout({
          preheader: e(intro),
          heading: e('Set up your STORM account'),
          paragraphs: [e(greeting), e(intro), e(how)],
          button: { label: e('Set your password'), href: e(v.action_link) },
          footnotes: [e(expiry), e(ignore), `${e(fallback)}<br><span style="word-break:break-all;">${e(v.action_link)}</span>`],
        }),
        text: [greeting, '', intro, how, '', `Set your password: ${v.action_link}`, '', expiry, ignore].join('\n'),
      };
    },
  },
  PASSWORD_RESET: {
    required: ['action_link'],
    links: ['action_link'],
    render(v) {
      const e = escapeHtml;
      const greeting = v.first_name ? `Hello ${v.first_name},` : 'Hello,';
      const intro = 'An administrator of your STORM account sent you a link to choose a new password.';
      const how = 'Your current password keeps working until you choose a new one.';
      const expiry = 'For your security the link works once and expires soon. If it has expired, ask your administrator to send a new one.';
      const unexpected = 'If you did not expect this, contact your account administrator.';
      const fallback = 'If the button does not work, copy this address into your browser:';
      return {
        subject: 'Reset your STORM password',
        html: renderLayout({
          preheader: e(intro),
          heading: e('Choose a new password'),
          paragraphs: [e(greeting), e(intro), e(how)],
          button: { label: e('Choose a new password'), href: e(v.action_link) },
          footnotes: [e(expiry), e(unexpected), `${e(fallback)}<br><span style="word-break:break-all;">${e(v.action_link)}</span>`],
        }),
        text: [greeting, '', intro, how, '', `Choose a new password: ${v.action_link}`, '', expiry, unexpected].join('\n'),
      };
    },
  },
};

/** Clean every variable (links keep their full length) and drop empty ones. */
export function cleanVariables(variables: Record<string, string>, links: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, raw] of Object.entries(variables)) {
    if (typeof raw !== 'string') continue;
    const value = links.includes(k) ? raw.trim() : cleanVariable(raw);
    if (value) out[k] = value;
  }
  return out;
}

/** Render a fixed template, or the reason it cannot be sent (`invalid_link`). */
export function renderEmail(template: EmailTemplate, variables: Record<string, string>): { ok: true; email: RenderedEmail } | { ok: false; errorCode: EmailErrorCode } {
  const def = TEMPLATES[template];
  const vars = cleanVariables(variables, def.links);
  for (const link of def.links) if (link in vars && !isSafeLink(vars[link])) return { ok: false, errorCode: 'invalid_link' };
  for (const name of def.required) {
    if (!vars[name]) return { ok: false, errorCode: def.links.includes(name) ? 'invalid_link' : 'provider_rejected' };
  }
  return { ok: true, email: def.render(vars) };
}

/** `Name <address>` or `address`, single line. */
function validSender(from: string): boolean {
  if (/[\r\n]/.test(from)) return false;
  const m = /^(?:[^<>]{1,100}<([^<>]+)>|([^<>\s]+))$/.exec(from.trim());
  const address = m?.[1] ?? m?.[2];
  return !!address && isValidRecipient(address.trim());
}

/**
 * Hand a rendered email to the provider with the fixed sender. Used by
 * `sendEmail` and by `send-email` (its own template catalogue). Never logs
 * or returns provider text.
 */
export async function deliverEmail(to: string, email: RenderedEmail, idempotencyKey: string, env: EdgeEnv, fetcher: Fetcher = fetch): Promise<EmailResult> {
  if (!env.resendApiKey || !env.emailFrom || !validSender(env.emailFrom)) return { ok: false, errorCode: 'not_configured' };
  if (!isValidRecipient(to)) return { ok: false, errorCode: 'invalid_recipient' };
  const subject = cleanVariable(email.subject, 200);
  try {
    const res = await fetcher(PROVIDER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': cleanVariable(idempotencyKey, 256),
      },
      body: JSON.stringify({ from: env.emailFrom, to: [to], subject, html: email.html, text: email.text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status >= 500 || res.status === 429) {
      await res.body?.cancel();
      return { ok: false, errorCode: 'provider_unavailable' };
    }
    if (res.status === 409) {
      // Idempotency conflict: the body is never read (provider text stays out of logs and answers).
      await res.body?.cancel();
      return { ok: false, errorCode: 'provider_duplicate' };
    }
    if (!res.ok) {
      await res.body?.cancel();
      return { ok: false, errorCode: 'provider_rejected' };
    }
    const body: unknown = await res.json().catch(() => null);
    const id = body !== null && typeof body === 'object' ? (body as { id?: unknown }).id : null;
    return { ok: true, providerMessageId: typeof id === 'string' && id.length <= 200 ? id : null };
  } catch {
    return { ok: false, errorCode: 'provider_unavailable' };
  }
}

export async function sendEmail(message: EmailMessage, env: EdgeEnv, fetcher: Fetcher = fetch): Promise<EmailResult> {
  if (!env.resendApiKey || !env.emailFrom) return { ok: false, errorCode: 'not_configured' };
  const to = message.to.trim();
  if (!isValidRecipient(to)) return { ok: false, errorCode: 'invalid_recipient' };
  const rendered = renderEmail(message.template, message.variables);
  if (!rendered.ok) return rendered;
  return await deliverEmail(to, rendered.email, message.idempotencyKey, env, fetcher);
}
