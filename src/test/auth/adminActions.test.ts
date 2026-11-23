/**
 * The access edge-function wrappers (Phase 2 spec §B.3, §C.3): every answer
 * of send-invitation, bulk-invite and admin-actions becomes an honest
 * outcome, and the copy never says "sent", "reset" or "turned off" unless
 * the function said that step worked (non-negotiable 9).
 *
 * The functions client is a fake: `invoke` resolves `{ data, error }` the
 * way supabase-js does, with a FunctionsHttpError-like error whose
 * `context` is the Response for every non-2xx answer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: h.invoke } } }));

import {
  accessNotice,
  ASSIGNMENT_NOT_SAVED_NOTE,
  BULK_ASSIGNMENT_NOT_SAVED_NOTE,
  EMAIL_ERROR_CODES,
  EMAIL_ERROR_COPY,
  emailErrorIsRetryable,
  bulkInvite,
  bulkInviteNotice,
  endAllSessions,
  endSessionsNotice,
  failureFrom,
  inviteNotice,
  NOT_STORED_NOTE,
  passwordResetNotice,
  reallocateVessel,
  resendInvitation,
  sendInvitation,
  sendPasswordReset,
  setAccess,
  setAdminPin,
  verifyAdminPin,
} from '@/modules/auth/services/adminActions';

/** A 2xx answer: supabase-js hands back the parsed body as `data`. */
const ok = (data: unknown) => h.invoke.mockResolvedValueOnce({ data, error: null });
/** A non-2xx answer: a FunctionsHttpError whose context is the Response. */
const httpError = (status: number, body: unknown) =>
  h.invoke.mockResolvedValueOnce({
    data: null,
    error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      name: 'FunctionsHttpError',
      context: new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
    }),
  });
/** No answer (offline): a FunctionsFetchError without a Response. */
const offline = () =>
  h.invoke.mockResolvedValueOnce({ data: null, error: Object.assign(new Error('Failed to send a request'), { name: 'FunctionsFetchError', context: new TypeError('Failed to fetch') }) });
const edgeError = (code: string, message: string, details?: Record<string, unknown>) => ({ error: { code, message, ...(details ? { details } : {}) } });

beforeEach(() => {
  h.invoke.mockReset();
});

describe('sendInvitation', () => {
  it('posts only the profile id (no client redirectTo) and reads a 200 sent as sent', async () => {
    ok({ ok: true, invitation: { status: 'sent', stored: true, id: 'inv-1' } });
    await expect(sendInvitation('p-1')).resolves.toEqual({ kind: 'sent', stored: true, invitationId: 'inv-1' });
    expect(h.invoke).toHaveBeenCalledWith('send-invitation', { body: { profileId: 'p-1' } });
  });

  it('stored:false (record_invitation_send not live) is still sent, and the notice says tracking is not set up', async () => {
    ok({ ok: true, invitation: { status: 'sent', stored: false, id: null } });
    const outcome = await sendInvitation('p-1');
    expect(outcome).toEqual({ kind: 'sent', stored: false, invitationId: null });
    const notice = inviteNotice(outcome, 'bosun@demo-fleet.example');
    expect(notice).toMatchObject({ tone: 'success', title: 'Invitation sent', retry: false });
    expect(notice.description).toContain('bosun@demo-fleet.example');
    expect(notice.description).toContain(NOT_STORED_NOTE);
  });

  it('a 502 send_failed is never "sent": the email error decides the copy and Retry', async () => {
    httpError(502, { ...edgeError('send_failed', 'The invitation email could not be sent.', { email_error: 'provider_unavailable' }), invitation: { status: 'send_failed', stored: true, id: 'inv-2' } });
    const outcome = await sendInvitation('p-1');
    expect(outcome).toEqual({ kind: 'send_failed', stored: true, invitationId: 'inv-2', emailError: 'provider_unavailable' });
    const notice = inviteNotice(outcome);
    expect(notice).toMatchObject({ tone: 'error', title: 'The invitation email could not be sent', retry: true });
    expect(notice.description).toMatch(/did not answer/);
    expect(notice.title).not.toMatch(/^Invitation sent/);
  });

  it.each([
    ['not_configured', /not set up/, false],
    ['provider_rejected', /refused/, true],
    ['invalid_recipient', /not valid/, false],
    ['invalid_link', /link/, false],
    ['link_failed', /sign-in link/, true],
    ['provider_duplicate', /already being sent/, true],
  ])('send_failed with %s', async (code, copy, retry) => {
    httpError(502, { ...edgeError('send_failed', 'The invitation email could not be sent.', { email_error: code }), invitation: { status: 'send_failed', stored: false, id: null } });
    const notice = inviteNotice(await sendInvitation('p-1'));
    expect(notice.description).toMatch(copy);
    expect(notice.description).toContain(NOT_STORED_NOTE);
    expect(notice.retry).toBe(retry);
  });

  it('cooldown (429) waits honestly, from retry_after_seconds, and never claims an email went', async () => {
    httpError(429, edgeError('cooldown', 'An invitation was sent a moment ago. Wait a few minutes before sending another.', { retry_after_seconds: 170 }));
    const outcome = await sendInvitation('p-1');
    expect(outcome.kind).toBe('failed');
    if (outcome.kind !== 'failed') return;
    expect(outcome.failure).toMatchObject({ status: 429, code: 'cooldown', retryAfterSeconds: 170 });
    expect(outcome.failure.message).toBe('STORM tried to send an email to this person a moment ago. Try again in about 3 minutes.');
    expect(inviteNotice(outcome).retry).toBe(false);
  });

  it('a short retry cooldown after a failed send (under a minute) says seconds, not minutes', async () => {
    httpError(429, edgeError('cooldown', 'An invitation was sent a moment ago. Wait a few minutes before sending another.', { retry_after_seconds: 20 }));
    const outcome = await sendInvitation('p-1');
    expect(outcome.kind === 'failed' && outcome.failure.message).toBe('STORM tried to send an email to this person a moment ago. Try again in a few seconds.');
  });

  it('already_active (409) and a rule refusal with a reason use STORM copy', async () => {
    httpError(409, edgeError('already_active', 'This person has already joined STORM. Send a password reset instead.'));
    const active = await sendInvitation('p-1');
    expect(active.kind === 'failed' && active.failure.code).toBe('already_active');
    httpError(400, edgeError('invalid_request', 'Only a real inbox can be invited.', { reason: 'placeholder_email' }));
    const fake = await sendInvitation('p-1');
    expect(fake.kind === 'failed' && fake.failure.message).toBe('Only a real inbox can be invited. Fix the email address and try again.');
  });

  it('a forbidden answer keeps the function’s own STORM sentence; offline is a network failure with Retry', async () => {
    httpError(403, edgeError('forbidden', 'You cannot do this to your own account.'));
    const self = await sendInvitation('p-1');
    expect(self.kind === 'failed' && self.failure.message).toBe('You cannot do this to your own account.');
    offline();
    const down = await sendInvitation('p-1');
    expect(down).toMatchObject({ kind: 'failed', failure: { status: null, code: 'network' } });
    expect(down.kind === 'failed' && inviteNotice(down).retry).toBe(true);
  });

  it('a 200 without the honest body (older function, or {}) is unconfirmed, not sent', async () => {
    ok({ success: true, message: 'Invitation sent to someone' });
    await expect(sendInvitation('p-1')).resolves.toEqual({ kind: 'unconfirmed' });
    ok({});
    const outcome = await sendInvitation('p-1');
    expect(outcome).toEqual({ kind: 'unconfirmed' });
    expect(inviteNotice(outcome)).toMatchObject({ tone: 'warning', title: 'Invitation requested' });
  });

  it('a non-JSON error body still fails by status, and server text never reaches the copy', async () => {
    h.invoke.mockResolvedValueOnce({ data: null, error: { name: 'FunctionsHttpError', context: new Response('<html>Bad gateway</html>', { status: 502 }) } });
    const outcome = await sendInvitation('p-1');
    expect(outcome).toMatchObject({ kind: 'failed', failure: { status: 502, code: 'internal_error', message: 'Something went wrong. Try again.' } });
    // An older function's plain-text error is not shown either.
    expect(failureFrom({ status: 400, body: { error: 'Missing targetUserId or resetType' } })).toMatchObject({ code: 'invalid_request', message: 'Something in the request is not right. Check it and try again.' });
  });

  it('invoke throwing is a network failure', async () => {
    h.invoke.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(sendInvitation('p-1')).resolves.toMatchObject({ kind: 'failed', failure: { code: 'network' } });
  });
});

describe('provider_duplicate (the email service already has a send with this key)', () => {
  it('is its own code with its own copy, and retryable everywhere', async () => {
    expect(EMAIL_ERROR_CODES).toContain('provider_duplicate');
    expect(EMAIL_ERROR_COPY.provider_duplicate).toBe('An email to this person is already being sent. Wait a minute, then try again.');
    expect(emailErrorIsRetryable('provider_duplicate')).toBe(true);

    httpError(502, { ...edgeError('send_failed', 'The invitation email could not be sent.', { email_error: 'provider_duplicate' }), invitation: { status: 'send_failed', stored: true, id: 'inv-9' } });
    const invite = await sendInvitation('p-1');
    expect(invite).toEqual({ kind: 'send_failed', stored: true, invitationId: 'inv-9', emailError: 'provider_duplicate' });
    expect(inviteNotice(invite)).toMatchObject({ tone: 'error', retry: true, description: 'An email to this person is already being sent. Wait a minute, then try again.' });

    httpError(502, edgeError('send_failed', 'The reset email could not be sent.', { email_error: 'provider_duplicate' }));
    const reset = await sendPasswordReset('u-1');
    expect(reset).toEqual({ kind: 'send_failed', emailError: 'provider_duplicate' });
    expect(passwordResetNotice(reset)).toMatchObject({ retry: true });
  });

  it('a bulk row that failed with it is retryable; a bad address is not', async () => {
    ok({
      ok: true,
      results: [
        { profileId: 'p-1', status: 'send_failed', stored: true, invitationId: null, code: 'send_failed', emailError: 'provider_duplicate' },
        { profileId: 'p-2', status: 'send_failed', stored: true, invitationId: null, code: 'send_failed', emailError: 'invalid_recipient' },
        { profileId: 'p-3', status: 'sent', stored: true, invitationId: 'i-3' },
      ],
    });
    const outcome = await bulkInvite(['p-1', 'p-2', 'p-3']);
    expect(outcome.results.map((r) => [r.profileId, r.retryable])).toEqual([
      ['p-1', true],
      ['p-2', false],
      ['p-3', false],
    ]);
  });
});

describe('bulkInvite', () => {
  const row = (profileId: string, status: string, extra: Record<string, unknown> = {}) => ({ profileId, status, stored: true, invitationId: null, ...extra });

  it('counts come from the rows: "Sent n · Failed m", refusals named, tracking note when not stored', async () => {
    ok({
      ok: true,
      results: [
        row('p-1', 'sent'),
        row('p-2', 'send_failed', { code: 'send_failed', emailError: 'provider_rejected' }),
        row('p-3', 'refused', { code: 'cooldown', stored: false }),
        row('p-4', 'sent', { stored: false }),
      ],
      sent: 2,
      failed: 1,
      refused: 1,
    });
    const outcome = await bulkInvite(['p-1', 'p-2', 'p-3', 'p-4']);
    expect(outcome).toMatchObject({ kind: 'done', sent: 2, failed: 1, refused: 1, notStored: 1 });
    expect(h.invoke).toHaveBeenCalledWith('bulk-invite', { body: { profileIds: ['p-1', 'p-2', 'p-3', 'p-4'] } });
    const notice = bulkInviteNotice(outcome);
    expect(notice.title).toBe('Sent 2 · Failed 1 · Not sent 1');
    expect(notice.tone).toBe('warning');
    expect(notice.description).toContain(NOT_STORED_NOTE);
  });

  it('splits more than 50 ids into batches and de-duplicates', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `p-${i}`);
    ok({ ok: true, results: ids.slice(0, 50).map((id) => row(id, 'sent')), sent: 50, failed: 0, refused: 0 });
    ok({ ok: true, results: ids.slice(50).map((id) => row(id, 'sent')), sent: 10, failed: 0, refused: 0 });
    const outcome = await bulkInvite([...ids, 'p-1']);
    expect(h.invoke).toHaveBeenCalledTimes(2);
    expect((h.invoke.mock.calls[0][1] as { body: { profileIds: string[] } }).body.profileIds).toHaveLength(50);
    expect(outcome).toMatchObject({ kind: 'done', sent: 60, failed: 0 });
    expect(bulkInviteNotice(outcome)).toMatchObject({ tone: 'success', title: 'Sent 60 · Failed 0' });
  });

  it('a batch that fails keeps the earlier rows and says so; malformed rows are unconfirmed', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `p-${i}`);
    ok({ ok: true, results: ids.slice(0, 50).map((id) => row(id, 'sent')) });
    httpError(429, edgeError('rate_limited', 'Too many requests.'));
    const outcome = await bulkInvite(ids);
    expect(outcome).toMatchObject({ kind: 'failed', sent: 50, failure: { code: 'rate_limited' } });
    expect(bulkInviteNotice(outcome)).toMatchObject({ tone: 'error', title: 'Sent 50 · Failed 0' });

    ok({ ok: true, results: [{ profileId: 'p-1', status: 'maybe' }] });
    await expect(bulkInvite(['p-1'])).resolves.toMatchObject({ kind: 'unconfirmed', sent: 0 });
  });

  it('all failed is an error tone', async () => {
    ok({ ok: true, results: [row('p-1', 'send_failed', { code: 'status_unavailable' })] });
    const outcome = await bulkInvite(['p-1']);
    expect(bulkInviteNotice(outcome)).toMatchObject({ tone: 'error', title: 'Sent 0 · Failed 1' });
  });
});

/**
 * An invitation that links a login also writes the imported vessel's
 * assignment (D-199); the answer's top-level `assignment` says whether that
 * worked, and the copy never claims a vessel assignment it was not told about.
 */
describe('invite answers with an imported vessel assignment', () => {
  it('200 sent + assignment failed → sent, warning tone, and the vessel sentence', async () => {
    ok({ ok: true, invitation: { status: 'sent', stored: true, id: 'inv-1' }, assignment: 'failed' });
    const outcome = await sendInvitation('p-1');
    expect(outcome).toEqual({ kind: 'sent', stored: true, invitationId: 'inv-1', assignmentFailed: true });
    expect(inviteNotice(outcome, 'bosun@demo-fleet.example')).toEqual({
      tone: 'warning',
      title: 'Invitation sent',
      description: `STORM emailed an invitation to bosun@demo-fleet.example. ${ASSIGNMENT_NOT_SAVED_NOTE}`,
      retry: false,
    });
    expect(ASSIGNMENT_NOT_SAVED_NOTE).toBe('The vessel assignment could not be saved. Assign the vessel from the crew list.');
  });

  it('200 sent + assignment failed, not stored → both notes', async () => {
    ok({ ok: true, invitation: { status: 'sent', stored: false, id: null }, assignment: 'failed' });
    const notice = inviteNotice(await sendInvitation('p-1'));
    expect(notice.tone).toBe('warning');
    expect(notice.description).toContain(NOT_STORED_NOTE);
    expect(notice.description).toContain(ASSIGNMENT_NOT_SAVED_NOTE);
  });

  it('200 sent + assignment created → sent, success, no vessel sentence', async () => {
    ok({ ok: true, invitation: { status: 'sent', stored: true, id: 'inv-1' }, assignment: 'created' });
    const outcome = await sendInvitation('p-1');
    expect(outcome).toEqual({ kind: 'sent', stored: true, invitationId: 'inv-1', assignmentFailed: false });
    expect(inviteNotice(outcome)).toEqual({ tone: 'success', title: 'Invitation sent', description: 'STORM emailed the invitation.', retry: false });
  });

  it.each([['pending_login'], ['maybe'], [false]])('an unknown assignment value (%o) is ignored', async (value) => {
    ok({ ok: true, invitation: { status: 'sent', stored: true, id: 'inv-1' }, assignment: value });
    const outcome = await sendInvitation('p-1');
    expect(outcome).toEqual({ kind: 'sent', stored: true, invitationId: 'inv-1' });
    expect(outcome).not.toHaveProperty('assignmentFailed');
    expect(inviteNotice(outcome).tone).toBe('success');
  });

  it('502 send_failed + assignment failed → the email error, then the vessel sentence', async () => {
    httpError(502, {
      ...edgeError('send_failed', 'The invitation email could not be sent.', { email_error: 'provider_unavailable' }),
      invitation: { status: 'send_failed', stored: true, id: 'inv-2' },
      assignment: 'failed',
    });
    const outcome = await sendInvitation('p-1');
    expect(outcome).toEqual({ kind: 'send_failed', stored: true, invitationId: 'inv-2', emailError: 'provider_unavailable', assignmentFailed: true });
    expect(inviteNotice(outcome)).toEqual({
      tone: 'error',
      title: 'The invitation email could not be sent',
      description: `The email service did not answer. Try again in a few minutes. ${ASSIGNMENT_NOT_SAVED_NOTE}`,
      retry: true,
    });
  });

  it('502 send_failed + assignment created → no vessel sentence', async () => {
    httpError(502, {
      ...edgeError('send_failed', 'x', { email_error: 'provider_rejected' }),
      invitation: { status: 'send_failed', stored: true, id: 'inv-2' },
      assignment: 'created',
    });
    const outcome = await sendInvitation('p-1');
    expect(outcome).toMatchObject({ kind: 'send_failed', assignmentFailed: false });
    expect(inviteNotice(outcome).description).not.toContain(ASSIGNMENT_NOT_SAVED_NOTE);
  });

  it('resend (admin-actions) reads the same assignment field, 200 and 502', async () => {
    ok({ ok: true, invitation: { status: 'sent', stored: true, id: 'inv-3' }, assignment: 'failed' });
    const sent = await resendInvitation({ profileId: 'p-9' });
    expect(sent).toEqual({ kind: 'sent', stored: true, invitationId: 'inv-3', assignmentFailed: true });
    expect(inviteNotice(sent)).toMatchObject({ tone: 'warning', title: 'Invitation sent' });
    expect(inviteNotice(sent).description).toContain(ASSIGNMENT_NOT_SAVED_NOTE);

    ok({ ok: true, invitation: { status: 'sent', stored: true, id: 'inv-3' }, assignment: 'created' });
    await expect(resendInvitation({ userId: 'u-1' })).resolves.toEqual({ kind: 'sent', stored: true, invitationId: 'inv-3', assignmentFailed: false });

    httpError(502, { ...edgeError('send_failed', 'x', { email_error: 'link_failed' }), invitation: { status: 'send_failed', stored: true, id: 'inv-3' }, assignment: 'failed' });
    const failed = await resendInvitation({ profileId: 'p-9' });
    expect(failed).toMatchObject({ kind: 'send_failed', emailError: 'link_failed', assignmentFailed: true });
    expect(inviteNotice(failed).description).toContain(ASSIGNMENT_NOT_SAVED_NOTE);
  });

  it('bulk rows keep their assignment; a failed one adds the note and turns an all-sent run into a warning', async () => {
    ok({
      ok: true,
      results: [
        { profileId: 'p-1', status: 'sent', stored: true, invitationId: 'i-1', assignment: 'created' },
        { profileId: 'p-2', status: 'sent', stored: true, invitationId: 'i-2', assignment: 'failed' },
        { profileId: 'p-3', status: 'sent', stored: true, invitationId: 'i-3' },
        { profileId: 'p-4', status: 'sent', stored: true, invitationId: 'i-4', assignment: 'pending_login' },
      ],
    });
    const outcome = await bulkInvite(['p-1', 'p-2', 'p-3', 'p-4']);
    expect(outcome.results.map((r) => r.assignment)).toEqual(['created', 'failed', undefined, undefined]);
    expect(outcome.results[2]).not.toHaveProperty('assignment');
    expect(bulkInviteNotice(outcome)).toEqual({ tone: 'warning', title: 'Sent 4 · Failed 0', description: BULK_ASSIGNMENT_NOT_SAVED_NOTE, retry: false });
    expect(BULK_ASSIGNMENT_NOT_SAVED_NOTE).toBe('Some vessel assignments could not be saved. Assign them from the crew list.');
  });

  it('bulk: assignments all created → success, no note; a failed send row that failed its assignment adds the note', async () => {
    ok({ ok: true, results: [{ profileId: 'p-1', status: 'sent', stored: true, invitationId: 'i-1', assignment: 'created' }] });
    expect(bulkInviteNotice(await bulkInvite(['p-1']))).toEqual({ tone: 'success', title: 'Sent 1 · Failed 0', description: undefined, retry: false });

    ok({
      ok: true,
      results: [
        { profileId: 'p-1', status: 'sent', stored: true, invitationId: 'i-1' },
        { profileId: 'p-2', status: 'send_failed', stored: true, invitationId: null, code: 'send_failed', emailError: 'provider_rejected', assignment: 'failed' },
      ],
    });
    const notice = bulkInviteNotice(await bulkInvite(['p-1', 'p-2']));
    expect(notice.tone).toBe('warning');
    expect(notice.description).toContain('Some invitation emails could not be sent.');
    expect(notice.description).toContain(BULK_ASSIGNMENT_NOT_SAVED_NOTE);
  });

  it('bulk: rows that answered before a batch failed or was unconfirmed still carry the note', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `p-${i}`);
    ok({ ok: true, results: ids.slice(0, 50).map((id, i) => ({ profileId: id, status: 'sent', stored: true, invitationId: null, ...(i === 0 ? { assignment: 'failed' } : {}) })) });
    httpError(429, edgeError('rate_limited', 'Too many requests.'));
    const failed = bulkInviteNotice(await bulkInvite(ids));
    expect(failed.tone).toBe('error');
    expect(failed.description).toContain(BULK_ASSIGNMENT_NOT_SAVED_NOTE);

    ok({ ok: true, results: ids.slice(0, 50).map((id, i) => ({ profileId: id, status: 'sent', stored: true, invitationId: null, ...(i === 0 ? { assignment: 'failed' } : {}) })) });
    ok({});
    const unconfirmed = bulkInviteNotice(await bulkInvite(ids));
    expect(unconfirmed.tone).toBe('warning');
    expect(unconfirmed.description).toContain('STORM could not confirm every result.');
    expect(unconfirmed.description).toContain(BULK_ASSIGNMENT_NOT_SAVED_NOTE);
  });
});

describe('admin-actions', () => {
  it('verify_pin: confirmed with the server time; pin_invalid / pin_locked read from details', async () => {
    ok({ ok: true, confirmedUntil: '2026-11-23T10:10:00.000Z' });
    await expect(verifyAdminPin('123456')).resolves.toEqual({ kind: 'confirmed', confirmedUntil: '2026-11-23T10:10:00.000Z' });
    expect(h.invoke).toHaveBeenCalledWith('admin-actions', { body: { action: 'verify_pin', pin: '123456' } });

    httpError(403, edgeError('forbidden', 'That PIN is not right.', { reason: 'pin_invalid', attempts_remaining: 1 }));
    await expect(verifyAdminPin('000000')).resolves.toMatchObject({ kind: 'failed', failure: { reason: 'pin_invalid', message: 'That PIN is not right. 1 attempt left.' } });

    httpError(403, edgeError('forbidden', 'Too many wrong PINs.', { reason: 'pin_locked', retry_after_seconds: 840 }));
    await expect(verifyAdminPin('000000')).resolves.toMatchObject({ kind: 'failed', failure: { reason: 'pin_locked', message: 'Too many wrong PINs. Try again in about 14 minutes.' } });

    // An older function's PIN answer still reads right.
    httpError(401, { error: 'Invalid PIN. 3 attempts remaining', attemptsRemaining: 3 });
    await expect(verifyAdminPin('000000')).resolves.toMatchObject({ kind: 'failed', failure: { reason: 'pin_invalid', message: 'That PIN is not right. 3 attempts left.' } });

    // A 2xx without a confirmation time is not a confirmation.
    ok({ ok: true });
    await expect(verifyAdminPin('123456')).resolves.toMatchObject({ kind: 'failed', failure: { code: 'unexpected_response' } });
  });

  it('set_pin: saved, or the format refusal', async () => {
    ok({ ok: true });
    await expect(setAdminPin('123456')).resolves.toEqual({ kind: 'saved' });
    httpError(400, edgeError('invalid_request', 'The PIN must be exactly 6 digits.', { reason: 'pin_format' }));
    await expect(setAdminPin('12')).resolves.toMatchObject({ kind: 'failed', failure: { message: 'The PIN must be exactly 6 digits.' } });
  });

  it('password reset: sent only with reset.status sent; 502 send_failed with the email error; 409 no_login', async () => {
    ok({ ok: true, reset: { status: 'sent' } });
    const sent = await sendPasswordReset('u-1');
    expect(sent).toEqual({ kind: 'sent' });
    expect(h.invoke).toHaveBeenCalledWith('admin-actions', { body: { action: 'reset_account', resetType: 'password_reset', targetUserId: 'u-1' } });
    expect(passwordResetNotice(sent, 'bosun@demo-fleet.example')).toMatchObject({ tone: 'success', title: 'Password reset email sent' });

    httpError(502, edgeError('send_failed', 'The reset email could not be sent.', { email_error: 'not_configured' }));
    const failed = await sendPasswordReset('u-1');
    expect(failed).toEqual({ kind: 'send_failed', emailError: 'not_configured' });
    expect(passwordResetNotice(failed)).toMatchObject({ tone: 'error', title: 'The reset email could not be sent', retry: false });

    httpError(409, edgeError('conflict', 'This person has not joined STORM yet.', { reason: 'no_login' }));
    await expect(sendPasswordReset('u-1')).resolves.toMatchObject({ kind: 'failed', failure: { message: 'This person has not joined STORM yet. Send an invitation instead.' } });

    ok({ success: true, message: 'Password reset email sent' });
    await expect(sendPasswordReset('u-1')).resolves.toEqual({ kind: 'unconfirmed' });
  });

  it('resend invitation goes through admin-actions by user or by profile, with the invitation outcome', async () => {
    ok({ ok: true, invitation: { status: 'sent', stored: true, id: 'inv-3' } });
    await expect(resendInvitation({ userId: 'u-1' })).resolves.toEqual({ kind: 'sent', stored: true, invitationId: 'inv-3' });
    expect(h.invoke).toHaveBeenLastCalledWith('admin-actions', { body: { action: 'reset_account', resetType: 'resend_invitation', targetUserId: 'u-1' } });
    httpError(502, { ...edgeError('send_failed', 'x', { email_error: 'link_failed' }), invitation: { status: 'send_failed', stored: true, id: 'inv-3' } });
    await expect(resendInvitation({ profileId: 'p-9' })).resolves.toMatchObject({ kind: 'send_failed', emailError: 'link_failed' });
    expect(h.invoke).toHaveBeenLastCalledWith('admin-actions', { body: { action: 'reset_account', resetType: 'resend_invitation', targetProfileId: 'p-9' } });
  });

  it('ending sessions: the 501 not_supported is said as such', async () => {
    httpError(501, edgeError('not_supported', 'Signing someone out of every device is not available in STORM yet.'));
    const outcome = await endAllSessions('u-1');
    expect(outcome.kind).toBe('not_supported');
    const notice = endSessionsNotice(outcome);
    expect(notice).toMatchObject({ tone: 'warning', title: 'Not available yet' });
    expect(notice.description).toMatch(/not available yet/);
  });

  it('toggle access: done only when both steps worked; partial failures name the failed part', async () => {
    ok({ ok: true, statusStored: true, banApplied: true, accountStatus: 'disabled' });
    const done = await setAccess('u-1', false, 'Left the company');
    expect(done).toEqual({ kind: 'done', accountStatus: 'disabled' });
    expect(h.invoke).toHaveBeenLastCalledWith('admin-actions', { body: { action: 'toggle_access', targetUserId: 'u-1', enableAccess: false, reason: 'Left the company' } });
    expect(accessNotice(done, 'Demo Bosun')).toMatchObject({ tone: 'success', title: 'Access turned off', description: 'Demo Bosun can no longer sign in to STORM.' });

    httpError(502, edgeError('partial_failure', 'Access is off in STORM, but sign-in could not be blocked. Try again.', { statusStored: true, banApplied: false }));
    const half = await setAccess('u-1', false, 'Left');
    expect(half).toEqual({ kind: 'partial_failure', enable: false, statusStored: true, banApplied: false });
    expect(accessNotice(half)).toMatchObject({ tone: 'error', title: 'Access only partly changed', description: 'Access is off in STORM, but sign-in could not be blocked. Try again.', retry: true });

    httpError(502, edgeError('partial_failure', 'x', { statusStored: true, banApplied: false }));
    expect(accessNotice(await setAccess('u-1', true))).toMatchObject({ description: 'Access is on in STORM, but sign-in is still blocked. Try again.' });

    httpError(502, edgeError('partial_failure', 'Nothing was changed. Try again.', { statusStored: false, banApplied: false }));
    expect(accessNotice(await setAccess('u-1', false, 'Left'))).toMatchObject({ title: 'Access not changed', description: 'Nothing was changed. Try again.' });

    // A legacy {success:true} cannot say both steps worked.
    ok({ success: true, message: 'Access disabled' });
    const legacy = await setAccess('u-1', false, 'Left');
    expect(legacy).toEqual({ kind: 'unconfirmed' });
    expect(accessNotice(legacy).title).not.toMatch(/turned off/i);

    httpError(403, edgeError('forbidden', 'This is the last administrator who manages administrators. Give someone else that role first.'));
    await expect(setAccess('u-1', false, 'Left')).resolves.toMatchObject({ kind: 'failed', failure: { message: 'This is the last administrator who manages administrators. Give someone else that role first.' } });
  });

  it('reallocate: done with the assignment; partial failure says which part', async () => {
    ok({ ok: true, assignment: { id: 'a-1', vesselId: 'v-1', position: 'Bosun', effectiveDate: '2026-11-23', endDate: null } });
    await expect(reallocateVessel({ targetUserId: 'u-1', vesselId: 'v-1', reason: 'Rotation' })).resolves.toMatchObject({ kind: 'done', assignment: { id: 'a-1', vesselId: 'v-1' } });
    httpError(502, { ...edgeError('partial_failure', 'x', { assignmentCreated: true, previousEnded: false }), assignment: { id: 'a-2' } });
    await expect(reallocateVessel({ targetUserId: 'u-1', vesselId: 'v-1', reason: 'Rotation' })).resolves.toMatchObject({
      kind: 'partial_failure',
      assignmentCreated: true,
      previousEnded: false,
      message: 'The new assignment was saved, but the previous one could not be closed. Try again.',
    });
  });
});
