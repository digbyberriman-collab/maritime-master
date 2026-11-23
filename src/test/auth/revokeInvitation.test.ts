/**
 * Revoking an invitation (gap/01 W2 row 8; finding revoke-invitation-keeps-access):
 * the revoke goes through admin-actions `revoke_invitation`, which also
 * blocks a login that never signed in. The outcome says whether the invitee
 * can still sign in, and the copy never says "the link no longer works"
 * unless the answer said the login is blocked (non-negotiable 9).
 *
 * An older deployed admin-actions (400 unknown action) falls back to the
 * database function, whose success is "revoked, sign-in still possible".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => h.invoke(...args) }, rpc: (...args: unknown[]) => h.rpc(...args) },
}));

import { revokeInvitation, revokeInvitationNotice } from '@/modules/auth/services/invitations';

const ok = (data: unknown) => h.invoke.mockResolvedValueOnce({ data, error: null });
const httpError = (status: number, body: unknown) =>
  h.invoke.mockResolvedValueOnce({
    data: null,
    error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      name: 'FunctionsHttpError',
      context: new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
    }),
  });
const edgeError = (code: string, message: string, details?: Record<string, unknown>) => ({ error: { code, message, ...(details ? { details } : {}) } });
const INVITATION = { id: 'inv-1', status: 'revoked', profileId: 'p-1', revokedAt: '2026-11-23T10:00:00Z' };
const REVOKED = { id: 'inv-1', profileId: 'p-1', revokedAt: '2026-11-23T10:00:00Z' };

beforeEach(() => {
  h.invoke.mockReset();
  h.rpc.mockReset();
});

describe('revokeInvitation through admin-actions', () => {
  it('sends only the action and the invitation id, never calls the RPC directly', async () => {
    ok({ ok: true, invitation: INVITATION, loginBlocked: true, loginNote: 'banned' });
    await revokeInvitation('inv-1');
    expect(h.invoke).toHaveBeenCalledWith('admin-actions', { body: { action: 'revoke_invitation', invitationId: 'inv-1' } });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it.each(['banned', 'no_login'])('200 loginBlocked (%s) → revoked: the link is said to be unusable', async (loginNote) => {
    ok({ ok: true, invitation: INVITATION, loginBlocked: true, loginNote });
    const outcome = await revokeInvitation('inv-1');
    expect(outcome).toEqual({ kind: 'revoked', invitation: REVOKED });
    expect(revokeInvitationNotice(outcome, 'Demo Bosun')).toEqual({
      tone: 'success',
      title: 'Invitation revoked',
      description: 'Demo Bosun can no longer use the invitation link.',
      retry: false,
    });
  });

  it('200 signed_in_before → revoked_login_open with the "turn their access off" warning', async () => {
    ok({ ok: true, invitation: INVITATION, loginBlocked: false, loginNote: 'signed_in_before' });
    const outcome = await revokeInvitation('inv-1');
    expect(outcome).toEqual({ kind: 'revoked_login_open', reason: 'signed_in_before', invitation: REVOKED });
    const notice = revokeInvitationNotice(outcome, 'Demo Bosun');
    expect(notice.tone).toBe('warning');
    expect(notice.description).toBe('Demo Bosun has signed in before. To stop them signing in, turn their access off.');
  });

  it('502 partial_failure (revoked, ban failed) → revoked_login_open ban_failed, never a success', async () => {
    httpError(502, { ...edgeError('partial_failure', 'The invitation is revoked, but sign-in could not be blocked.', { revoked: true, loginBlocked: false }), invitation: INVITATION });
    const outcome = await revokeInvitation('inv-1');
    expect(outcome).toEqual({ kind: 'revoked_login_open', reason: 'ban_failed', invitation: REVOKED });
    const notice = revokeInvitationNotice(outcome, 'Demo Bosun');
    expect(notice).toMatchObject({ tone: 'warning', retry: false });
    expect(notice.description).toBe('The invitation is marked revoked, but Demo Bosun may still be able to sign in. To stop that, turn their access off.');
    expect(notice.description).not.toMatch(/no longer works|stops working/);
  });

  it('501 invitations_not_live → not_live (nothing changed)', async () => {
    httpError(501, edgeError('not_supported', 'Revoking an invitation is not available in STORM yet.', { reason: 'invitations_not_live' }));
    const outcome = await revokeInvitation('inv-1');
    expect(outcome).toEqual({ kind: 'not_live' });
    expect(revokeInvitationNotice(outcome)).toMatchObject({ tone: 'warning', title: 'Not available yet' });
  });

  it('404 → not_found', async () => {
    httpError(404, edgeError('not_found', 'That invitation was not found, or it is no longer open.'));
    await expect(revokeInvitation('inv-1')).resolves.toEqual({ kind: 'not_found' });
  });

  it('403 forbidden → refused, with the function’s STORM sentence', async () => {
    httpError(403, edgeError('forbidden', 'You cannot do this to your own account.'));
    const outcome = await revokeInvitation('inv-1');
    expect(outcome).toEqual({ kind: 'refused', message: 'You cannot do this to your own account.' });
    expect(revokeInvitationNotice(outcome)).toMatchObject({ tone: 'error', title: 'Could not revoke the invitation', description: 'You cannot do this to your own account.' });
  });

  it('403 account_disabled and 503 are failed (the disabled copy; a retry for the 503)', async () => {
    httpError(403, edgeError('account_disabled', 'x'));
    const disabled = await revokeInvitation('inv-1');
    expect(disabled).toMatchObject({ kind: 'failed', failure: { code: 'account_disabled', message: 'Your access has been disabled by your account administrator.' } });
    httpError(503, edgeError('status_unavailable', 'The invitation could not be revoked. Nothing was changed. Try again.'));
    const down = await revokeInvitation('inv-1');
    expect(down.kind).toBe('failed');
    expect(revokeInvitationNotice(down)).toMatchObject({ tone: 'error', retry: true });
  });

  it('a 2xx without the honest body (or {}) is failed, never revoked', async () => {
    ok({});
    await expect(revokeInvitation('inv-1')).resolves.toMatchObject({ kind: 'failed', failure: { code: 'unexpected_response' } });
    ok({ success: true });
    await expect(revokeInvitation('inv-1')).resolves.toMatchObject({ kind: 'failed', failure: { code: 'unexpected_response' } });
    ok({ ok: true, invitation: { id: 'inv-1', status: 'sent' }, loginBlocked: true });
    await expect(revokeInvitation('inv-1')).resolves.toMatchObject({ kind: 'failed' });
  });

  it('a 200 revoke whose login answer is unclear is "may still sign in", not "revoked"', async () => {
    ok({ ok: true, invitation: INVITATION });
    await expect(revokeInvitation('inv-1')).resolves.toEqual({ kind: 'revoked_login_open', reason: 'ban_failed', invitation: REVOKED });
  });

  it('a 400 for another field (not the action) is a failure, not the fallback', async () => {
    httpError(400, edgeError('invalid_request', 'invitationId must be a uuid.', { field: 'invitationId' }));
    await expect(revokeInvitation('inv-1')).resolves.toMatchObject({ kind: 'failed', failure: { code: 'invalid_request' } });
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe('revokeInvitation on an older admin-actions (no revoke_invitation action)', () => {
  const unknownAction = () => httpError(400, edgeError('invalid_request', 'Unknown action.', { field: 'action' }));

  it('falls back to the database function; its success is revoked_login_open edge_unavailable', async () => {
    unknownAction();
    h.rpc.mockResolvedValueOnce({ data: { id: 'inv-1', profile_id: 'p-1', status: 'revoked', revoked_at: '2026-11-23T10:00:00Z' }, error: null });
    const outcome = await revokeInvitation('inv-1');
    expect(h.rpc).toHaveBeenCalledWith('revoke_invitation', { p_invitation_id: 'inv-1' });
    expect(outcome).toEqual({ kind: 'revoked_login_open', reason: 'edge_unavailable', invitation: REVOKED });
    const notice = revokeInvitationNotice(outcome, 'Demo Bosun');
    expect(notice.tone).toBe('warning');
    expect(notice.description).toBe('The invitation is marked revoked, but Demo Bosun may still be able to sign in. To stop that, turn their access off.');
  });

  it('the legacy function’s plain "Invalid action" answer falls back too', async () => {
    httpError(400, { error: 'Invalid action' });
    h.rpc.mockResolvedValueOnce({ data: { id: 'inv-1', profile_id: 'p-1', status: 'revoked', revoked_at: null }, error: null });
    await expect(revokeInvitation('inv-1')).resolves.toMatchObject({ kind: 'revoked_login_open', reason: 'edge_unavailable' });
  });

  it.each([
    [{ code: 'PGRST202', message: 'Could not find the function public.revoke_invitation' }, { kind: 'not_live' }],
    [{ code: 'P0002', message: 'no live invitation' }, { kind: 'not_found' }],
    [{ code: '42501', message: 'permission denied' }, { kind: 'refused', message: "You don't have permission to revoke invitations." }],
  ])('fallback RPC error %o → %o', async (error, expected) => {
    unknownAction();
    h.rpc.mockResolvedValueOnce({ data: null, error });
    await expect(revokeInvitation('inv-1')).resolves.toEqual(expected);
  });

  it('a fallback row that is not revoked is not_found; any other RPC error is thrown', async () => {
    unknownAction();
    h.rpc.mockResolvedValueOnce({ data: { id: 'inv-1', status: 'sent' }, error: null });
    await expect(revokeInvitation('inv-1')).resolves.toEqual({ kind: 'not_found' });
    unknownAction();
    h.rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'boom' } });
    await expect(revokeInvitation('inv-1')).rejects.toMatchObject({ code: 'XX000' });
  });
});
