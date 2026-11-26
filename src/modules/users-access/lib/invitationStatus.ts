/**
 * What Users & Access shows for a person's account and invitation (Phase 2
 * spec §B.3; gap/01 F46; gap/03 B7; proposed D-121). Pure, so the rules
 * are pinned by tests:
 *
 * - An invitation row (`user_invitations`) decides the invitation status,
 *   through `invitationDisplayStatus` (a link past `expires_at` reads
 *   Expired before the expiry job runs).
 * - Revoke follows the stored row, not the display status: a row shown
 *   Expired whose stored status is still live (pending, sent, send_failed)
 *   can be revoked, because `revoke_invitation()` accepts it and withdraws
 *   the access it opened. Once the build-out is applied the server grants
 *   such a row nothing: `user_is_active()` and `record_session_start()` end
 *   the access past `expires_at` (D-228). A stored expired, revoked or
 *   accepted row offers no revoke.
 * - A backfilled row (`pending` + `legacy_unverified`) was "sent" by the old
 *   flow, which cannot prove it: it says so and offers a resend.
 * - No row (the table is not live yet, D-01, or no row is visible to the
 *   viewer): the profile's `account_status` shows, and `invited` reads
 *   "Invited", never "Sent".
 * - While invitations load, or when they failed to load, the status is
 *   unknown and no invitation action is offered (fail closed).
 */
import { invitationDisplayStatus, type InvitationListRow } from '@/modules/auth/services/invitations';
import { EMAIL_ERROR_CODES, emailErrorMessage, type EmailErrorCode } from '@/modules/auth/services/adminActions';

export type AccountState = 'active' | 'invited' | 'not_invited' | 'disabled';

/** `profiles.account_status` (any case) and whether the person has a login. */
export function accountStateOf(rawStatus: string | null | undefined, hasLogin: boolean): AccountState {
  const value = (rawStatus ?? '').trim().toLowerCase();
  if (value === 'disabled' || value === 'deactivated') return 'disabled';
  if (value === 'invited') return 'invited';
  if (value === 'not_invited') return 'not_invited';
  return hasLogin ? 'active' : 'not_invited';
}

/** `user_invitations` statuses plus the profile-only fallbacks (`statusTone('invitation', …)`). */
export type InvitationCellStatus =
  | 'pending'
  | 'sent'
  | 'send_failed'
  | 'accepted'
  | 'expired'
  | 'revoked'
  | 'invited'
  | 'not_invited'
  /** Joined without an invitation on record: nothing to show. */
  | 'none'
  /** Invitations are loading or could not be read. */
  | 'unknown';

export type InvitationSource = 'table' | 'table-missing' | 'loading' | 'error';

export interface InvitationCell {
  status: InvitationCellStatus;
  /** A second line under the pill (legacy delivery, the last failure). */
  note: string | null;
  invitationId: string | null;
  canInvite: boolean;
  canResend: boolean;
  canRevoke: boolean;
}

export const LEGACY_UNVERIFIED_NOTE = 'Sent before delivery tracking — resend to confirm';
export const NOT_TRACKED_NOTE = 'Delivery tracking is not set up yet';

const NONE: Omit<InvitationCell, 'status'> = { note: null, invitationId: null, canInvite: false, canResend: false, canRevoke: false };

const isEmailCode = (value: string | null): value is EmailErrorCode =>
  value !== null && (EMAIL_ERROR_CODES as readonly string[]).includes(value);

export function invitationCell(
  account: AccountState,
  invitation: InvitationListRow | undefined,
  source: InvitationSource,
  now: Date = new Date(),
): InvitationCell {
  if (source === 'loading' || source === 'error') return { status: 'unknown', ...NONE };
  const disabled = account === 'disabled';

  if (invitation) {
    const status = invitationDisplayStatus(invitation, now);
    const legacy = status === 'pending' && invitation.last_error_code === 'legacy_unverified';
    const note = legacy
      ? LEGACY_UNVERIFIED_NOTE
      : status === 'send_failed'
        ? emailErrorMessage(isEmailCode(invitation.last_error_code) ? invitation.last_error_code : null)
        : null;
    const resendable = status === 'pending' || status === 'sent' || status === 'send_failed' || status === 'expired' || status === 'revoked';
    const live = invitation.status === 'pending' || invitation.status === 'sent' || invitation.status === 'send_failed';
    return {
      status,
      note,
      invitationId: invitation.id,
      canInvite: false,
      canResend: !disabled && resendable && account !== 'active',
      // The stored row decides: a live row past expires_at (shown Expired) can still be revoked (D-228).
      canRevoke: !disabled && live,
    };
  }

  // No row visible: the profile's status, never "Sent" (the old flow stamped it without proof).
  if (account === 'invited') {
    return { status: 'invited', ...NONE, note: source === 'table-missing' ? NOT_TRACKED_NOTE : null, canResend: true };
  }
  if (account === 'not_invited') return { status: 'not_invited', ...NONE, canInvite: true };
  // Active (joined without an invitation on record) or disabled: nothing to invite.
  return { status: 'none', ...NONE };
}
