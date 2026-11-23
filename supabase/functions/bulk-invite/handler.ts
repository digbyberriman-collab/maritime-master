/**
 * bulk-invite (Phase 2 spec §C.3; gap/01 F46).
 *
 * `POST { profileIds }` (1–50 profile ids). Each profile goes through the one
 * invitation path (`_shared/invitations.ts`), in order, so every row gets the
 * same checks, cooldown and honest outcome as `send-invitation`.
 * `redirectTo` from the client is ignored.
 *
 * 200 `{ ok: true, results: [{ profileId, status: 'sent' | 'send_failed' | 'refused', stored, invitationId, code?, emailError?, reason? }], sent, failed, refused }`
 * - `sent`: the email was accepted by the provider;
 * - `send_failed`: the email (or its link) failed, or the server could not
 *   finish that row (`code` says which: `send_failed`, `status_unavailable`, …);
 * - `refused`: a rule (`not_found`, `forbidden`, `cross_company`, `cooldown`,
 *   `already_active`, `conflict`, `invalid_request` with `reason`).
 * Request errors: 400 (no ids, more than 50, bad ids), 401 / 403 (caller),
 * 429 `rate_limited`, 500 `server_misconfigured` (`STORM_SITE_URL` missing:
 * nothing sent or stamped).
 */
import { getAuthContext } from '../_shared/auth.ts';
import { type EdgeDeps, edgeDeps, originsOf } from '../_shared/deps.ts';
import { linkLanding } from '../_shared/env.ts';
import { type Handler, HttpError, json, readJson, withHttp } from '../_shared/http.ts';
import { BULK_INVITE_MAX, bulkRow, bulkSummary, type BulkInviteRow, type InviteDeps, inviteProfile } from '../_shared/invitations.ts';
import { RateLimiter } from '../_shared/rateLimit.ts';
import { objectBody, uuidList } from '../_shared/validate.ts';

export interface BulkInviteDeps extends EdgeDeps {
  invite: Partial<InviteDeps>;
  limiter: RateLimiter;
  /** Pause between rows (auth admin API courtesy); tests pass 0. */
  pauseMs: number;
}

export function createHandler(patch: Partial<BulkInviteDeps> = {}): Handler {
  const base = edgeDeps(patch);
  const deps: BulkInviteDeps = {
    ...base,
    invite: patch.invite ?? {},
    limiter: patch.limiter ?? new RateLimiter({ limit: 5, windowMs: 60_000 }),
    pauseMs: patch.pauseMs ?? 100,
  };

  return withHttp(
    async (req) => {
      const env = deps.env();
      const ctx = await getAuthContext(req, { env, createClient: deps.createClient });
      deps.limiter.enforce(`bulk-invite:${ctx.user.id}`);
      const ids = await readJson(req, (value) => uuidList(objectBody(value), 'profileIds', BULK_INVITE_MAX));
      if (ids.length === 0) throw new HttpError(400, 'invalid_request', 'Choose at least one person to invite.', { field: 'profileIds' });
      linkLanding(env, 'invite'); // STORM_SITE_URL first: nothing is read, sent or stamped without it

      const rows: BulkInviteRow[] = [];
      for (const [i, id] of ids.entries()) {
        if (i > 0 && deps.pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, deps.pauseMs));
        rows.push(bulkRow(await inviteProfile(ctx, id, deps.invite)));
      }
      return json(bulkSummary(rows));
    },
    { allowedOrigins: originsOf(deps), name: 'bulk-invite' },
  );
}
