/**
 * send-email (Phase 2 spec §C.2, §C.3; gap/08 NO4; D-129). Internal
 * transport for other STORM functions: no browser caller exists.
 *
 * - Caller: only a bearer equal to `SUPABASE_SERVICE_ROLE_KEY` (constant-time
 *   comparison); anything else → 401. verify_jwt stays on at the gateway.
 * - `POST { to, template, variables, idempotencyKey }`. A caller `from`,
 *   `cc`, `bcc`, `replyTo`, `html` or `subject` is ignored: the sender is the
 *   fixed `EMAIL_FROM`, the subject and body come from the template
 *   catalogue, every variable is HTML-escaped and every link must be https.
 * - Idempotent: a key already logged as sent in `notification_logs` returns
 *   the stored provider id (`cached: true`) without sending; the provider
 *   also receives the key.
 *
 * 200 `{ ok: true, messageId, cached? }`; 502 `send_failed` with
 * `details.email_error`; 400 `invalid_request` (`details.missing` / `field`);
 * 401 `unauthorized`; 500 `server_misconfigured`.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.2';
import { bearerToken, NO_SESSION } from '../_shared/auth.ts';
import { asRow, errorCode, text } from '../_shared/db.ts';
import { type EdgeDeps, edgeDeps, originsOf } from '../_shared/deps.ts';
import { deliverEmail, type EmailResult, type Fetcher } from '../_shared/email.ts';
import { type Handler, HttpError, json, readJson, withHttp } from '../_shared/http.ts';
import { log } from '../_shared/log.ts';
import { timingSafeEqual } from '../_shared/rateLimit.ts';
import { objectBody, requiredString } from '../_shared/validate.ts';
import { isSendEmailTemplate, renderSendEmail } from './templates.ts';

export interface SendEmailDeps extends EdgeDeps {
  fetcher: Fetcher;
  now: () => Date;
}

interface SendEmailRequest {
  to: string;
  template: string;
  variables: Record<string, string>;
  idempotencyKey: string;
}

function parse(value: unknown): SendEmailRequest {
  const b = objectBody(value);
  const raw = b.variables ?? {};
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpError(400, 'invalid_request', 'The request has a missing or wrong variables object.', { field: 'variables' });
  }
  const variables: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') variables[k] = v;
    else if (typeof v === 'number' && Number.isFinite(v)) variables[k] = String(v);
  }
  // `from`, `cc`, `bcc`, `replyTo`, `subject` and `html` are deliberately never read.
  return {
    to: requiredString(b, 'to', 254),
    template: requiredString(b, 'template', 64),
    variables,
    idempotencyKey: requiredString(b, 'idempotencyKey', 200),
  };
}

async function cachedSend(service: SupabaseClient, key: string): Promise<string | null | undefined> {
  const res = await service.from('notification_logs').select('status, provider_message_id').eq('idempotency_key', key).maybeSingle();
  if (res.error) return undefined; // the log is a convenience; the provider's idempotency key still applies
  const row = asRow(res.data);
  return text(row, 'status')?.toUpperCase() === 'SENT' ? text(row, 'provider_message_id') : undefined;
}

async function record(service: SupabaseClient, req: SendEmailRequest, subject: string, result: EmailResult, now: Date): Promise<void> {
  const at = now.toISOString();
  const res = await service.from('notification_logs').upsert(
    {
      idempotency_key: req.idempotencyKey,
      recipient_email: req.to,
      notification_type: 'email',
      template_name: req.template,
      subject: subject.slice(0, 255),
      provider: 'resend',
      status: result.ok ? 'SENT' : 'FAILED',
      provider_message_id: result.ok ? result.providerMessageId : null,
      sent_at: result.ok ? at : null,
      failed_at: result.ok ? null : at,
      failure_reason: result.ok ? null : result.errorCode,
    },
    { onConflict: 'idempotency_key' },
  );
  if (res.error) log('warn', 'send_email_log_failed', { code: errorCode(res.error) || 'none' });
}

export function createHandler(patch: Partial<SendEmailDeps> = {}): Handler {
  const base = edgeDeps(patch);
  const deps: SendEmailDeps = { ...base, fetcher: patch.fetcher ?? fetch, now: patch.now ?? (() => new Date()) };

  return withHttp(
    async (req) => {
      const env = deps.env();
      const token = bearerToken(req);
      if (!token || !timingSafeEqual(token, env.serviceRoleKey)) {
        throw new HttpError(401, 'unauthorized', 'This endpoint is for STORM services only.');
      }
      const body = await readJson(req, parse);
      if (!isSendEmailTemplate(body.template)) throw new HttpError(400, 'invalid_request', 'Unknown email template.', { field: 'template' });
      const rendered = renderSendEmail(body.template, body.variables);
      if (!rendered.ok) {
        if (rendered.reason === 'missing_variables') {
          throw new HttpError(400, 'invalid_request', 'The email is missing a value.', { missing: rendered.missing.join(',') });
        }
        throw new HttpError(400, 'invalid_request', 'A link in the email must start with https://.', { field: rendered.field });
      }

      const service = deps.createClient(env.supabaseUrl, env.serviceRoleKey, NO_SESSION);
      const cached = await cachedSend(service, body.idempotencyKey);
      if (cached !== undefined) return json({ ok: true, messageId: cached, cached: true });

      const result = await deliverEmail(body.to, rendered.email, body.idempotencyKey, env, deps.fetcher);
      await record(service, body, rendered.email.subject, result, deps.now());
      log('info', 'send_email', { template: body.template, outcome: result.ok ? 'sent' : 'send_failed', code: result.ok ? null : result.errorCode });
      if (!result.ok) throw new HttpError(502, 'send_failed', 'The email could not be sent.', { email_error: result.errorCode });
      return json({ ok: true, messageId: result.providerMessageId });
    },
    { allowedOrigins: originsOf(deps), name: 'send-email' },
  );
}
