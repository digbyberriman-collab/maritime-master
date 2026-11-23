/**
 * accept-invitation (Phase 2 spec §C.2, §C.3; gap/01 W2; verify_jwt = false:
 * a public token flow before sign-in).
 *
 * `POST { token, password }` → 200 `{ ok: true }` or a coded error. Legacy:
 * nothing issues `profiles.invitation_token` today (invitations land on the
 * auth link flow), so this answers only for tokens issued earlier. A future
 * issuer must store a hash of the token (never the token itself), generate
 * at least 96 bits of randomness, and compare hashes here.
 *
 * In order:
 * 1. The body, then the token format (16-256 base64url characters): a
 *    malformed request is refused before any limiter counts it, so it never
 *    fills the shared `unknown` per-IP bucket used when no address header
 *    arrives.
 * 2. Per-IP and per-token rate limits (in-memory, per isolate; the token is
 *    hashed before it becomes a key; the IP comes from `cf-connecting-ip` /
 *    `x-real-ip`, never from X-Forwarded-For, which the caller writes).
 * 3. `password.length >= 12` (at most 72, the auth limit).
 * 4. Lookup, constant-time comparison, an expiry is required (a token
 *    without one is treated as expired: fail closed). A disabled or
 *    deactivated profile is 403 `account_disabled`.
 * 5. Refused like an unknown token (no claim, no auth write) unless the
 *    profile is `invited`, `invitation_withdrawn_for()` (service role) is
 *    false (a revoked or expired invitation; D-01: the function missing
 *    means no revoke can have happened; any other error is 503), and the
 *    login exists, has never signed in and is not confirmed (`getUserById`:
 *    not found → refused, any other error → 503).
 * 6. The token is claimed (cleared) before the password is set, so it works
 *    once, and restored only if setting the password fails; the email is
 *    confirmed with the password (the token proved the inbox).
 * Every invalid, unknown, used, expired or withdrawn token gets the same
 * answer (no oracle).
 *
 * Failures (D-200): every well-formed token that turns out invalid is counted
 * on one fixed key that no header can rotate (50 a minute per isolate). Past
 * that, one `accept_invitation_guess_flood` warning per window is logged
 * (the count only; never a token or an address). Nothing is refused because
 * of other callers' failures: refusal stays with the per-IP and per-token
 * limits, and the token entropy makes guessing infeasible.
 *
 * Errors: 400 `invalid_request` (`reason`: `invalid_or_expired`,
 * `password_too_short`, `password_too_long`, `password_rejected`), 403
 * `account_disabled`, 429 `rate_limited`, 500 `internal_error`, 503
 * `status_unavailable`. Cross-isolate quotas need database-backed limits (a
 * recorded followup); the live gateway's address headers are not verified.
 */
import { NO_SESSION } from '../_shared/auth.ts';
import { asRow, errorCode, isMissingFunction, rowsOf, text, timeOf } from '../_shared/db.ts';
import { type EdgeDeps, edgeDeps, originsOf } from '../_shared/deps.ts';
import { type Handler, HttpError, json, readJson, withHttp } from '../_shared/http.ts';
import { log } from '../_shared/log.ts';
import { clientIp, digestKey, RateLimiter, timingSafeEqual } from '../_shared/rateLimit.ts';
import { objectBody } from '../_shared/validate.ts';

export interface AcceptInvitationDeps extends EdgeDeps {
  ipLimiter: RateLimiter;
  tokenLimiter: RateLimiter;
  /** Invalid-token answers for well-formed tokens, on the one key `FAILURE_KEY` (no header decides it). */
  failureLimiter: RateLimiter;
  now: () => Date;
}

const FAILURE_KEY = 'accept-invitation:invalid';
export const FAILURE_LIMIT = 50;
const FAILURE_WINDOW_MS = 60_000;

const TOKEN = /^[A-Za-z0-9_-]{16,256}$/;
export const MIN_PASSWORD = 12;
const MAX_PASSWORD = 72;
const DISABLED = new Set(['disabled', 'deactivated']);

const INVALID = (): HttpError =>
  new HttpError(400, 'invalid_request', 'This invitation link is not valid or has expired. Ask your administrator for a new invitation.', {
    reason: 'invalid_or_expired',
  });
const UNAVAILABLE = (): HttpError => new HttpError(503, 'status_unavailable', 'The invitation could not be checked. Try again.');

function isUserNotFound(error: unknown): boolean {
  const status = error && typeof error === 'object' ? (error as { status?: unknown }).status : undefined;
  return errorCode(error) === 'user_not_found' || status === 404;
}

export function createHandler(patch: Partial<AcceptInvitationDeps> = {}): Handler {
  const base = edgeDeps(patch);
  const deps: AcceptInvitationDeps = {
    ...base,
    ipLimiter: patch.ipLimiter ?? new RateLimiter({ limit: 20, windowMs: 10 * 60_000 }),
    tokenLimiter: patch.tokenLimiter ?? new RateLimiter({ limit: 5, windowMs: 10 * 60_000 }),
    failureLimiter: patch.failureLimiter ?? new RateLimiter({ limit: FAILURE_LIMIT, windowMs: FAILURE_WINDOW_MS }),
    now: patch.now ?? (() => new Date()),
  };

  // Detection only (D-200): the failure limiter's verdict says when a window is past its allowance; the
  // warning goes out once per window, with this isolate's count of invalid answers in it.
  let flooding = false;
  let tally = { start: 0, count: 0 };
  /** Count one invalid answer for a well-formed token, then refuse. */
  const invalidToken = (): HttpError => {
    const t = Date.now();
    if (t - tally.start >= FAILURE_WINDOW_MS) tally = { start: t, count: 0 };
    tally.count += 1;
    const verdict = deps.failureLimiter.hit(FAILURE_KEY);
    if (verdict.ok) {
      flooding = false;
    } else if (!flooding) {
      flooding = true;
      log('warn', 'accept_invitation_guess_flood', { window_count: tally.count });
    }
    return INVALID();
  };

  return withHttp(
    async (req) => {
      const env = deps.env();
      const body = await readJson(req, objectBody);
      const token = typeof body.token === 'string' ? body.token.trim() : '';
      const password = body.password;
      if (!TOKEN.test(token)) throw INVALID();
      // Only well-formed requests count per address and per token.
      deps.ipLimiter.enforce(`ip:${clientIp(req)}`);
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
        throw invalidToken();
      }
      const status = (text(profile, 'account_status') ?? '').toLowerCase();
      if (DISABLED.has(status)) {
        throw new HttpError(403, 'account_disabled', 'Your access has been disabled by your account administrator.');
      }
      // Only a live invitation for a login that was never used: anything else is the generic refusal.
      if (status !== 'invited') throw invalidToken();
      const withdrawn = await service.rpc('invitation_withdrawn_for', { _user_id: userId });
      if (withdrawn.error) {
        if (!isMissingFunction(withdrawn.error)) throw UNAVAILABLE(); // D-01: missing → no revoke can have happened
      } else if (withdrawn.data !== false) {
        throw withdrawn.data === true ? invalidToken() : UNAVAILABLE();
      }
      const login = await service.auth.admin.getUserById(userId);
      if (login.error) {
        if (isUserNotFound(login.error)) throw invalidToken();
        throw UNAVAILABLE();
      }
      const user = asRow(login.data?.user);
      if (!user || text(user, 'last_sign_in_at') || text(user, 'email_confirmed_at') || text(user, 'confirmed_at')) throw invalidToken();

      // Claim first: the token works once even under concurrent requests.
      const claim = await service
        .from('profiles')
        .update({ invitation_token: null, invitation_token_expires: null })
        .eq('id', profileId)
        .eq('invitation_token', token)
        .select('id');
      if (claim.error) throw UNAVAILABLE();
      if (rowsOf(claim.data).length !== 1) throw invalidToken();

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

