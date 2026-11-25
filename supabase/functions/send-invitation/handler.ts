/**
 * send-invitation (Phase 2 spec §C.3; gap/01 F46, W2; D-121, D-125, D-205, D-207, D-208).
 *
 * `POST { profileId }` (legacy `userId` still accepted: resolved through the
 * caller's RLS view of profiles). `redirectTo` from the client is ignored:
 * links land on `${STORM_SITE_URL}/reset-password?flow=invite`.
 *
 * Responses (every error is `{ error: { code, message, details? } }`):
 * - 200 `{ ok: true, invitation: { status: 'sent', stored, id }, assignment? }`
 * - 502 `{ error: { code: 'send_failed', message, details: { email_error } }, invitation: { status: 'send_failed', stored, id }, assignment? }`
 * - `assignment: 'created' | 'failed'` (top level) only when the invitation
 *   linked a login for an imported profile still waiting for its vessel and
 *   the assignment step ran (D-199); absent otherwise
 * - 409 `conflict` with `details.reason: counter_exhausted` when the attempt
 *   counter is at its ceiling (nothing linked or sent, D-196)
 * - 400 `invalid_request` (no id; `details.reason` `missing_email` / `placeholder_email`)
 * - 401 `unauthorized`, 403 `account_disabled` / `forbidden` / `cross_company`;
 *   `forbidden` with `details.reason: out_of_reach` (a person on a vessel the
 *   caller does not administer, or the vessel-less / administrator person an
 *   admin of some vessels may not act on; D-194, D-207),
 *   `manages_admins_required` (an administrator invitee; D-195) or
 *   `master_needs_admin` (a pending Master or Captain placement and the
 *   caller is not a users-access admin of that vessel; nothing reserved,
 *   linked or sent; D-219)
 * - 404 `not_found` (not visible to the caller), 409 `already_active` / `conflict`
 *   (`details.reason: login_not_created_by_storm`: a login with this address
 *   that STORM did not create, never adopted, D-205; `login_blocked`: a banned
 *   login no revoke explains, D-208; nothing reserved, linked or sent)
 * - 429 `cooldown` (5 minutes, `Retry-After`) / `rate_limited`
 * - 500 `server_misconfigured` (`STORM_SITE_URL` missing: nothing sent or stamped), 503 `status_unavailable`
 */
import { getAuthContext } from '../_shared/auth.ts';
import { type EdgeDeps, edgeDeps, originsOf } from '../_shared/deps.ts';
import { linkLanding } from '../_shared/env.ts';
import { type Handler, HttpError, readJson, withHttp } from '../_shared/http.ts';
import { type InviteDeps, inviteProfile, invitationResponse, resolveProfileIdByUserId } from '../_shared/invitations.ts';
import { RateLimiter } from '../_shared/rateLimit.ts';
import { objectBody, optionalUuid } from '../_shared/validate.ts';

export interface SendInvitationDeps extends EdgeDeps {
  invite: Partial<InviteDeps>;
  limiter: RateLimiter;
}

export function createHandler(patch: Partial<SendInvitationDeps> = {}): Handler {
  const base = edgeDeps(patch);
  const deps: SendInvitationDeps = {
    ...base,
    invite: patch.invite ?? {},
    limiter: patch.limiter ?? new RateLimiter({ limit: 30, windowMs: 60_000 }),
  };

  return withHttp(
    async (req) => {
      const env = deps.env();
      const ctx = await getAuthContext(req, { env, createClient: deps.createClient });
      deps.limiter.enforce(`send-invitation:${ctx.user.id}`);
      const body = await readJson(req, (value) => {
        const b = objectBody(value);
        return { profileId: optionalUuid(b, 'profileId'), userId: optionalUuid(b, 'userId') };
      });
      linkLanding(env, 'invite'); // STORM_SITE_URL first: nothing is read, sent or stamped without it
      const profileId = body.profileId ?? (body.userId ? await resolveProfileIdByUserId(ctx, body.userId) : null);
      if (!profileId) throw new HttpError(400, 'invalid_request', 'Choose the person to invite.', { field: 'profileId' });
      return invitationResponse(await inviteProfile(ctx, profileId, deps.invite));
    },
    { allowedOrigins: originsOf(deps), name: 'send-invitation' },
  );
}
