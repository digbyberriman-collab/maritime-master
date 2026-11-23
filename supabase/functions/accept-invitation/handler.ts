/**
 * accept-invitation (Phase 2 spec §C.2, §C.3; gap/01 W2; verify_jwt = false:
 * a public token flow before sign-in).
 *
 * `POST { token, password }` → 200 `{ ok: true }` or a coded error. Legacy:
 * nothing writes `profiles.invitation_token` today (invitations land on the
 * auth link flow), so this answers only for tokens issued earlier.
 *
 * Guards: per-IP and per-token rate limits (in-memory, per isolate; the
 * token is hashed before it becomes a key); token format check; lookup then
 * constant-time comparison; an expiry is required (a token without one is
 * treated as expired: fail closed); the token is claimed (cleared) before the
 * password is set, so it works once, and restored only if setting the
 * password fails; `password.length >= 12` (at most 72, the auth limit); the
 * email is confirmed with the password (the token proved the inbox). Every
 * invalid, unknown, used or expired token gets the same answer (no oracle).
 *
 * Errors: 400 `invalid_request` (`reason`: `invalid_or_expired`,
 * `password_too_short`, `password_too_long`, `password_rejected`), 403
 * `account_disabled`, 429 `rate_limited`, 500 `internal_error`, 503
 * `status_unavailable`.
 */
import { NO_SESSION } from '../_shared/auth.ts';
import { errorCode, rowsOf, text, timeOf } from '../_shared/db.ts';
import { type EdgeDeps, edgeDeps, originsOf } from '../_shared/deps.ts';
import { type Handler, HttpError, json, readJson, withHttp } from '../_shared/http.ts';
import { log } from '../_shared/log.ts';
import { clientIp, digestKey, RateLimiter, timingSafeEqual } from '../_shared/rateLimit.ts';
import { objectBody } from '../_shared/validate.ts';

export interface AcceptInvitationDeps extends EdgeDeps {
  ipLimiter: RateLimiter;
  tokenLimiter: RateLimiter;
  now: () => Date;
}

const TOKEN = /^[A-Za-z0-9_-]{16,256}$/;
export const MIN_PASSWORD = 12;
const MAX_PASSWORD = 72;
const DISABLED = new Set(['disabled', 'deactivated']);

const INVALID = (): HttpError =>
  new HttpError(400, 'invalid_request', 'This invitation link is not valid or has expired. Ask your administrator for a new invitation.', {
    reason: 'invalid_or_expired',
  });
const UNAVAILABLE = (): HttpError => new HttpError(503, 'status_unavailable', 'The invitation could not be checked. Try again.');

export function createHandler(patch: Partial<AcceptInvitationDeps> = {}): Handler {
  const base = edgeDeps(patch);
  const deps: AcceptInvitationDeps = {
    ...base,
    ipLimiter: patch.ipLimiter ?? new RateLimiter({ limit: 20, windowMs: 10 * 60_000 }),
    tokenLimiter: patch.tokenLimiter ?? new RateLimiter({ limit: 5, windowMs: 10 * 60_000 }),
    now: patch.now ?? (() => new Date()),
  };

  return withHttp(
    async (req) => {
      deps.ipLimiter.enforce(`ip:${clientIp(req)}`);
      const env = deps.env();
      const body = await readJson(req, objectBody);
      const token = typeof body.token === 'string' ? body.token.trim() : '';
      const password = body.password;
      if (!TOKEN.test(token)) throw INVALID();
      deps.tokenLimiter.enforce(`token:${await digestKey(token)}`);
      if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
        throw new HttpError(400, 'invalid_request', `Choose a password of at least ${MIN_PASSWORD} characters.`, { reason: 'password_too_short' });
      }
      if (password.length > MAX_PASSWORD) {
        throw new HttpError(400, 'invalid_request', `Choose a password of at most ${MAX_PASSWORD} characters.`, { reason: 'password_too_long' });
      }

      // No caller identity in this flow: the service client is the only way to find the token's profile.
      const service = deps.createClient(env.supabaseUrl, env.serviceRoleKey, NO_SESSION);
      const res = await service
        .from('profiles')
        .select('id, user_id, account_status, invitation_token, invitation_token_expires')
        .eq('invitation_token', token)
        .limit(2);
      if (res.error) throw UNAVAILABLE();
      const rows = rowsOf(res.data);
      const profile = rows.length === 1 ? rows[0] : null;
      const stored = text(profile, 'invitation_token');
      const expires = timeOf(profile, 'invitation_token_expires');
      const userId = text(profile, 'user_id');
      const profileId = text(profile, 'id');
      if (!profile || !stored || !timingSafeEqual(stored, token) || expires === null || expires <= deps.now().getTime() || !userId || !profileId) {
        throw INVALID();
      }
      if (DISABLED.has((text(profile, 'account_status') ?? '').toLowerCase())) {
        throw new HttpError(403, 'account_disabled', 'Your access has been disabled by your account administrator.');
      }

      // Claim first: the token works once even under concurrent requests.
      const claim = await service
        .from('profiles')
        .update({ invitation_token: null, invitation_token_expires: null })
        .eq('id', profileId)
        .eq('invitation_token', token)
        .select('id');
      if (claim.error) throw UNAVAILABLE();
      if (rowsOf(claim.data).length !== 1) throw INVALID();

      const set = await service.auth.admin.updateUserById(userId, { password, email_confirm: true });
      if (set.error) {
        const restore = await service
          .from('profiles')
          .update({ invitation_token: stored, invitation_token_expires: text(profile, 'invitation_token_expires') })
          .eq('id', profileId)
          .is('invitation_token', null);
        if (restore.error) log('warn', 'accept_restore_failed', { profile_id: profileId, code: errorCode(restore.error) || 'none' });
        const status = set.error.status;
        if (status === 422 || status === 400) {
          throw new HttpError(400, 'invalid_request', 'That password was not accepted. Choose a longer or less common one.', { reason: 'password_rejected' });
        }
        log('warn', 'accept_password_failed', { profile_id: profileId, code: errorCode(set.error) || 'none' });
        throw new HttpError(500, 'internal_error', 'Your password could not be set. Try again.');
      }
      log('info', 'invitation_accepted', { profile_id: profileId });
      return json({ ok: true });
    },
    { allowedOrigins: originsOf(deps), name: 'accept-invitation' },
  );
}

