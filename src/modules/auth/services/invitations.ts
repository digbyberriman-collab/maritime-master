/**
 * Invitation status for Users & Access (Phase 2 spec §B.3; gap/01 F46;
 * gap/03 B7; proposed D-121). Reads `user_invitations` (P3 SQL) through the
 * pending client; the edge functions (`send-invitation`, `bulk-invite`,
 * `admin-actions` resend) are the only writers, through
 * `record_invitation_send()`.
 *
 * - Table missing (D-01): `source: 'table-missing'` and no rows. The page
 *   then shows the legacy `profiles.account_status` ("Invited" only, never
 *   "Sent": the old flow stamped it even when the email failed).
 * - Any other error is thrown (the page shows its error state with Retry).
 *
 * Contract stub created by the Phase 2 architect; E2 builds the UI on it
 * and adds tests.
 */
import { isMissingRelation, isMissingTable } from '@/integrations/supabase/pending';
import { authDb } from './accessDb';
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
 * The status to show: the stored status, except that a sent or pending
 * invitation past `expires_at` reads as expired before the expiry job runs
 * (derived, honest: the link no longer works).
 */
export function invitationDisplayStatus(row: Pick<UserInvitationRow, 'status' | 'expires_at'>, now: Date = new Date()): InvitationStatus {
  if ((row.status === 'sent' || row.status === 'pending' || row.status === 'send_failed') && row.expires_at) {
    const expires = Date.parse(row.expires_at);
    if (!Number.isNaN(expires) && expires < now.getTime()) return 'expired';
  }
  return row.status;
}

/** What the invite edge functions return (spec §C.3). */
export interface InvitationSendOutcome {
  status: Extract<InvitationStatus, 'sent' | 'send_failed'>;
  /** False when `record_invitation_send()` is not in the database yet: the outcome was not stored (D-01). */
  stored: boolean;
  invitationId: string | null;
  /** Stable code on failure (`provider_rejected`, `provider_unavailable`, `not_configured`, `cooldown`, …). */
  errorCode: string | null;
}

export type RevokeInvitationOutcome =
  | { kind: 'revoked'; invitation: UserInvitationRow }
  /** `revoke_invitation()` is not in the database yet (D-01): nothing was revoked. */
  | { kind: 'missing' }
  /** No live invitation with that id is visible (already accepted, expired or revoked, or another company's). */
  | { kind: 'not_found' }
  /** The caller may not revoke invitations in that company (42501). */
  | { kind: 'refused' };

/**
 * Revoke a live invitation (`revoke_invitation()`, spec §A.9): the link
 * stops working and the status reads Revoked. The function checks
 * `admin.access.users_access.admin` in the invitation's company; any error
 * other than the three named answers is thrown.
 */
export async function revokeInvitation(invitationId: string): Promise<RevokeInvitationOutcome> {
  const { data, error } = await authDb.rpc('revoke_invitation', { p_invitation_id: invitationId });
  if (error) {
    if (isMissingRelation(error)) return { kind: 'missing' };
    if (error.code === 'P0002') return { kind: 'not_found' };
    if (error.code === '42501') return { kind: 'refused' };
    throw error;
  }
  if (!data || typeof data !== 'object' || (data as UserInvitationRow).status !== 'revoked') return { kind: 'not_found' };
  return { kind: 'revoked', invitation: data as UserInvitationRow };
}
