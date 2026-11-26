/**
 * Invitation status for Users & Access (Phase 2 spec §B.3; gap/01 F46;
 * gap/03 B7; proposed D-121). Reads `user_invitations` (P3 SQL) through the
 * pending client; the edge functions (`send-invitation`, `bulk-invite`,
 * `admin-actions` resend and revoke) are the only writers, through
 * `record_invitation_send()` and `revoke_invitation()`.
 *
 * - Table missing (D-01): `source: 'table-missing'` and no rows. The page
 *   then shows the legacy `profiles.account_status` ("Invited" only, never
 *   "Sent": the old flow stamped it even when the email failed).
 * - Any other error is thrown (the page shows its error state with Retry).
 *
 * Used by the Users & Access list and detail pages (hooks/useInvitations.ts,
 * lib/invitationStatus.ts).
 */
import { isMissingRelation, isMissingTable } from '@/integrations/supabase/pending';
import { authDb } from './accessDb';
import {
  failureFrom,
  failureIsRetryable,
  invokeEdge,
  isSuccess,
  okBody,
  unconfirmedFailure,
  type EdgeAnswer,
  type EdgeFailure,
  type OutcomeNotice,
} from './adminActions';
import type { InvitationStatus, UserInvitationRow } from '../types/db.pending';

export type InvitationListRow = Pick<
  UserInvitationRow,
  'id' | 'profile_id' | 'status' | 'send_attempts' | 'last_attempt_at' | 'last_sent_at' | 'last_error_code' | 'expires_at' | 'accepted_at' | 'revoked_at'
>;

export type InvitationsByProfile =
  | { source: 'table'; byProfile: ReadonlyMap<string, InvitationListRow> }
  | { source: 'table-missing'; byProfile: ReadonlyMap<string, InvitationListRow> };

const INVITATION_COLUMNS =
  'id, profile_id, status, send_attempts, last_attempt_at, last_sent_at, last_error_code, expires_at, accepted_at, revoked_at, created_at';

/** The newest invitation of each profile (any status). */
export async function fetchInvitationsByProfile(companyId: string, profileIds: readonly string[]): Promise<InvitationsByProfile> {
  if (profileIds.length === 0) return { source: 'table', byProfile: new Map() };
  const { data, error } = await authDb
    .from('user_invitations')
    .select(INVITATION_COLUMNS)
    .eq('company_id', companyId)
    .in('profile_id', [...profileIds])
    .order('created_at', { ascending: false });
  if (error) {
    if (isMissingTable(error)) return { source: 'table-missing', byProfile: new Map() };
    throw error;
  }
  const byProfile = new Map<string, InvitationListRow>();
  for (const row of data ?? []) {
    if (!byProfile.has(row.profile_id)) byProfile.set(row.profile_id, row);
  }
  return { source: 'table', byProfile };
}

/**
 * The status to show: the stored status, except that a pending, sent or
 * send_failed invitation past `expires_at` reads as expired before the
 * expiry job runs. Derived and honest: past `expires_at` the link no longer
 * works and, once the build-out is applied, the server ends the access the
 * invitation opened (`user_is_active()` / `record_session_start()`, D-228).
 * The stored row is still live, so it can still be revoked
 * (`invitationCell`).
 */
export function invitationDisplayStatus(row: Pick<UserInvitationRow, 'status' | 'expires_at'>, now: Date = new Date()): InvitationStatus {
  if ((row.status === 'sent' || row.status === 'pending' || row.status === 'send_failed') && row.expires_at) {
    const expires = Date.parse(row.expires_at);
    if (!Number.isNaN(expires) && expires < now.getTime()) return 'expired';
  }
  return row.status;
}

/** The revoked invitation as the answer described it. */
export interface RevokedInvitation {
  id: string;
  profileId: string | null;
  revokedAt: string | null;
}

/** Why the invitee may still be able to sign in after a revoke. */
export type RevokeLoginOpenReason =
  /** They have signed in before: only turning their access off stops them. */
  | 'signed_in_before'
  /** The invitation is revoked, but the function could not block the login. */
  | 'ban_failed'
  /** An older deployed admin-actions without `revoke_invitation`: only the database row was revoked, the login was not touched. */
  | 'edge_unavailable';

export type RevokeInvitationOutcome =
  /** Revoked, and the login blocked (or there is none): neither the emailed link nor "Forgot password" lets them in. */
  | { kind: 'revoked'; invitation: RevokedInvitation }
  /** Revoked, but the person may still be able to sign in. */
  | { kind: 'revoked_login_open'; reason: RevokeLoginOpenReason; invitation: RevokedInvitation | null }
  /** Invitation tracking is not in the database yet (D-01): nothing was revoked. */
  | { kind: 'not_live' }
  /** No live invitation with that id is visible (already accepted, expired or revoked, or another company's). */
  | { kind: 'not_found' }
  /** The caller may not revoke this invitation (capability, their own login, the account owner). */
  | { kind: 'refused'; message: string }
  | { kind: 'failed'; failure: EdgeFailure };

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value);
const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

function revokedFromEdge(value: unknown): RevokedInvitation | null {
  if (!isObject(value) || value.status !== 'revoked') return null;
  const id = textOrNull(value.id);
  return id ? { id, profileId: textOrNull(value.profileId), revokedAt: textOrNull(value.revokedAt) } : null;
}

/** An admin-actions deploy that predates `revoke_invitation` (the current 400, or the legacy function's plain-text answer). */
function isUnknownAction(answer: EdgeAnswer): boolean {
  if (answer.status !== 400 || !isObject(answer.body)) return false;
  const error = answer.body.error;
  if (isObject(error)) return error.code === 'invalid_request' && isObject(error.details) && error.details.field === 'action';
  return error === 'Invalid action';
}

const RPC_REFUSED = "You don't have permission to revoke invitations.";

/** The database-only revoke (`revoke_invitation()` as the caller), for a deploy without the edge action. */
async function revokeInDatabase(invitationId: string): Promise<RevokeInvitationOutcome> {
  const { data, error } = await authDb.rpc('revoke_invitation', { p_invitation_id: invitationId });
  if (error) {
    if (isMissingRelation(error)) return { kind: 'not_live' };
    if (error.code === 'P0002') return { kind: 'not_found' };
    if (error.code === '42501') return { kind: 'refused', message: RPC_REFUSED };
    throw error;
  }
  const row = isObject(data) ? (data as Partial<UserInvitationRow>) : null;
  if (!row || row.status !== 'revoked' || !row.id) return { kind: 'not_found' };
  return {
    kind: 'revoked_login_open',
    reason: 'edge_unavailable',
    invitation: { id: row.id, profileId: row.profile_id ?? null, revokedAt: row.revoked_at ?? null },
  };
}

/**
 * Revoke a live invitation through admin-actions (`revoke_invitation`;
 * gap/01 W2 row 8): the function revokes the row as the caller (capability
 * `admin.access.users_access.admin` in the invitation's company), then
 * blocks a login that never signed in. The outcome says whether the
 * invitee can still sign in; it never claims more than the answer did
 * (non-negotiable 9):
 *
 * - 200 `loginBlocked: true` → `revoked`;
 * - 200 `loginBlocked: false` (signed in before), or 502 `partial_failure`
 *   with `details.revoked` → `revoked_login_open`;
 * - 501 `invitations_not_live` → `not_live`; 404 → `not_found`; 403
 *   `forbidden` → `refused`; anything else, a 2xx without the honest body
 *   included → `failed`.
 *
 * An older deployed admin-actions answers 400 "unknown action": the
 * database function is then called directly, and its success is
 * `revoked_login_open` (`edge_unavailable`): the login was not touched.
 */
export async function revokeInvitation(invitationId: string): Promise<RevokeInvitationOutcome> {
  const answer = await invokeEdge('admin-actions', { action: 'revoke_invitation', invitationId });
  const ok = okBody(answer);
  if (ok) {
    const invitation = revokedFromEdge(ok.invitation);
    if (!invitation) return { kind: 'failed', failure: unconfirmedFailure(answer) };
    if (ok.loginBlocked === true) return { kind: 'revoked', invitation };
    return { kind: 'revoked_login_open', reason: ok.loginNote === 'signed_in_before' ? 'signed_in_before' : 'ban_failed', invitation };
  }
  if (isSuccess(answer)) return { kind: 'failed', failure: unconfirmedFailure(answer) };
  if (isUnknownAction(answer)) return revokeInDatabase(invitationId);

  const failure = failureFrom(answer);
  if (failure.code === 'partial_failure' && failure.details.revoked === true) {
    const body = isObject(answer.body) ? answer.body : {};
    return { kind: 'revoked_login_open', reason: 'ban_failed', invitation: revokedFromEdge(body.invitation) };
  }
  if (failure.code === 'not_supported' && failure.reason === 'invitations_not_live') return { kind: 'not_live' };
  if (failure.code === 'not_found') return { kind: 'not_found' };
  if (failure.code === 'forbidden') return { kind: 'refused', message: failure.message };
  return { kind: 'failed', failure };
}

/** What to tell the person after a revoke: never "the link no longer works" unless the login was blocked. */
export function revokeInvitationNotice(outcome: RevokeInvitationOutcome, name?: string | null): OutcomeNotice {
  const who = name?.trim() || 'This person';
  switch (outcome.kind) {
    case 'revoked':
      return { tone: 'success', title: 'Invitation revoked', description: `${who} can no longer use the invitation link.`, retry: false };
    case 'revoked_login_open':
      return {
        tone: 'warning',
        title: 'Invitation revoked, sign-in still possible',
        description:
          outcome.reason === 'signed_in_before'
            ? `${who} has signed in before. To stop them signing in, turn their access off.`
            : `The invitation is marked revoked, but ${who} may still be able to sign in. To stop that, turn their access off.`,
        retry: false,
      };
    case 'not_live':
      return { tone: 'warning', title: 'Not available yet', description: 'Revoking needs invitation tracking, which is not set up yet. Nothing was changed.', retry: false };
    case 'not_found':
      return { tone: 'warning', title: 'Nothing to revoke', description: 'This invitation was already accepted, expired or revoked.', retry: false };
    case 'refused':
      return { tone: 'error', title: 'Could not revoke the invitation', description: outcome.message, retry: false };
    case 'failed':
      return { tone: 'error', title: 'Could not revoke the invitation', description: outcome.failure.message, retry: failureIsRetryable(outcome.failure) };
  }
}
