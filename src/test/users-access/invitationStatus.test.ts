/**
 * Invitation status rules for Users & Access (Phase 2 spec §B.3; proposed
 * D-121): the honest vocabulary, the legacy caveat, the D-01 fallback that
 * never reads "Sent", and fail-closed actions while the status is unknown.
 */
import { describe, expect, it, vi } from 'vitest';

// The rules are pure; the service modules they import build the client at load.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { accountStateOf, invitationCell, LEGACY_UNVERIFIED_NOTE, NOT_TRACKED_NOTE } from '@/modules/users-access/lib/invitationStatus';
import { invitationDisplayStatus, type InvitationListRow } from '@/modules/auth/services/invitations';
import { statusMeta, statusVocabulary } from '@/shared/components/status';

const NOW = new Date('2026-11-23T12:00:00Z');

const row = (patch: Partial<InvitationListRow>): InvitationListRow => ({
  id: 'inv-1',
  profile_id: 'p-1',
  status: 'sent',
  send_attempts: 1,
  last_attempt_at: '2026-11-22T12:00:00Z',
  last_sent_at: '2026-11-22T12:00:00Z',
  last_error_code: null,
  expires_at: '2026-11-29T12:00:00Z',
  accepted_at: null,
  revoked_at: null,
  ...patch,
});

describe('the invitation vocabulary (statusTone)', () => {
  it('has Pending, Sent, Send failed, Accepted, Expired, Revoked, plus the profile fallbacks', () => {
    const labels = Object.fromEntries(statusVocabulary('invitation').map((e) => [e.status, e.label]));
    expect(labels).toEqual({
      pending: 'Pending',
      sent: 'Sent',
      send_failed: 'Send failed',
      accepted: 'Accepted',
      expired: 'Expired',
      revoked: 'Revoked',
      invited: 'Invited',
      not_invited: 'Not invited',
    });
  });

  it('pins the tones that matter: a failed send is danger, accepted ok, expired a warning', () => {
    expect(statusMeta('invitation', 'send_failed').tone).toBe('danger');
    expect(statusMeta('invitation', 'accepted').tone).toBe('ok');
    expect(statusMeta('invitation', 'expired').tone).toBe('warn');
    expect(statusMeta('invitation', 'revoked').tone).toBe('neutral');
    // "Invited" (the legacy profile status) is never shown as "Sent".
    expect(statusMeta('invitation', 'invited').label).toBe('Invited');
  });
});

describe('accountStateOf', () => {
  it.each([
    ['active', true, 'active'],
    [null, true, 'active'],
    ['ACTIVE', false, 'not_invited'],
    ['Disabled', true, 'disabled'],
    ['deactivated', false, 'disabled'],
    ['invited', true, 'invited'],
    ['not_invited', false, 'not_invited'],
    ['something_else', false, 'not_invited'],
  ] as const)('%s with login %s → %s', (raw, login, expected) => {
    expect(accountStateOf(raw, login)).toBe(expected);
  });
});

describe('invitationCell', () => {
  it('an invitation row decides, through invitationDisplayStatus', () => {
    expect(invitationCell('invited', row({ status: 'sent' }), 'table', NOW)).toMatchObject({ status: 'sent', canResend: true, canRevoke: true, canInvite: false });
    expect(invitationCell('active', row({ status: 'accepted', accepted_at: '2026-11-23T08:00:00Z' }), 'table', NOW)).toMatchObject({
      status: 'accepted',
      canResend: false,
      canRevoke: false,
    });
    expect(invitationCell('invited', row({ status: 'revoked' }), 'table', NOW)).toMatchObject({ status: 'revoked', canResend: true, canRevoke: false });
  });

  it('a sent link past expires_at reads Expired before the expiry job runs, and can be resent but not revoked', () => {
    const late = row({ status: 'sent', expires_at: '2026-11-20T00:00:00Z' });
    expect(invitationDisplayStatus(late, NOW)).toBe('expired');
    expect(invitationCell('invited', late, 'table', NOW)).toMatchObject({ status: 'expired', canResend: true, canRevoke: false });
  });

  it('send failed shows why, with resend', () => {
    const cell = invitationCell('not_invited', row({ status: 'send_failed', last_error_code: 'provider_unavailable', last_sent_at: null }), 'table', NOW);
    expect(cell).toMatchObject({ status: 'send_failed', canResend: true, canRevoke: true });
    expect(cell.note).toMatch(/did not answer/);
  });

  it('a send that failed as provider_duplicate says an email is already on its way, with resend', () => {
    const cell = invitationCell('invited', row({ status: 'send_failed', last_error_code: 'provider_duplicate', last_sent_at: null }), 'table', NOW);
    expect(cell).toMatchObject({ status: 'send_failed', canResend: true });
    expect(cell.note).toBe('An email to this person is already being sent. Wait a minute, then try again.');
  });

  it('a backfilled legacy row says it was sent before delivery tracking', () => {
    const cell = invitationCell('invited', row({ status: 'pending', last_error_code: 'legacy_unverified' }), 'table', NOW);
    expect(cell).toMatchObject({ status: 'pending', note: LEGACY_UNVERIFIED_NOTE, canResend: true });
    expect(LEGACY_UNVERIFIED_NOTE).toBe('Sent before delivery tracking — resend to confirm');
  });

  it('table missing (D-01): the profile’s "invited" shows as Invited, never Sent, with the tracking note', () => {
    const cell = invitationCell('invited', undefined, 'table-missing', NOW);
    expect(cell).toMatchObject({ status: 'invited', note: NOT_TRACKED_NOTE, canResend: true, canRevoke: false, invitationId: null });
    expect(cell.status).not.toBe('sent');
  });

  it('no row visible to the viewer: Invited too (without the tracking note)', () => {
    expect(invitationCell('invited', undefined, 'table', NOW)).toMatchObject({ status: 'invited', note: null, canResend: true });
  });

  it('not invited yet offers Invite; an active person without a row shows nothing to do', () => {
    expect(invitationCell('not_invited', undefined, 'table', NOW)).toMatchObject({ status: 'not_invited', canInvite: true });
    expect(invitationCell('active', undefined, 'table-missing', NOW)).toMatchObject({ status: 'none', canInvite: false, canResend: false });
  });

  it('while loading or after a failed read: unknown, and no action (fail closed)', () => {
    for (const source of ['loading', 'error'] as const) {
      expect(invitationCell('not_invited', undefined, source, NOW)).toEqual({
        status: 'unknown',
        note: null,
        invitationId: null,
        canInvite: false,
        canResend: false,
        canRevoke: false,
      });
    }
  });

  it('a disabled person is never invited, resent or revoked from here', () => {
    expect(invitationCell('disabled', row({ status: 'sent' }), 'table', NOW)).toMatchObject({ status: 'sent', canResend: false, canRevoke: false });
    expect(invitationCell('disabled', undefined, 'table', NOW)).toMatchObject({ status: 'none', canInvite: false });
  });
});
