/**
 * create-crew-member from the browser (finding create-crew-member-unmigrated,
 * client part): the typed wrapper sends no password and no company, and
 * every answer becomes an honest outcome (D-143, non-negotiable 9):
 *
 * - 201 with the honest body: created (invitation sent / not sent);
 * - 502 partial_failure: created, and the invitation or the vessel
 *   assignment named as the part that failed;
 * - a 2xx without that body: unconfirmed;
 * - anything else: failed (nothing added).
 *
 * The CSV import keeps each row's outcome and counts from them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...args: unknown[]) => h.invoke(...args) } } }));

import {
  createCrewMember,
  createCrewNotice,
  crewImportRowResult,
  crewImportSummary,
  CREW_MEMBER_ROLES,
  NOT_STORED_NOTE,
  type CreateCrewOutcome,
} from '@/modules/auth/services/adminActions';

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

const INPUT = { email: 'deckhand@example.test', firstName: 'Demo', lastName: 'Deckhand', rank: 'Deckhand', role: 'crew' as const, vesselId: 'v-1', position: '', joinDate: '2026-11-23' };

beforeEach(() => h.invoke.mockReset());

describe('createCrewMember: the request', () => {
  it('posts to create-crew-member without a password or a company; blank fields are left out', async () => {
    ok({ ok: true, profileId: 'p-1', invitation: { status: 'sent', invitationId: 'inv-1', stored: true } });
    await createCrewMember({ ...INPUT, sendInvite: true });
    expect(h.invoke).toHaveBeenCalledWith('create-crew-member', {
      body: { email: 'deckhand@example.test', firstName: 'Demo', lastName: 'Deckhand', rank: 'Deckhand', role: 'crew', vesselId: 'v-1', joinDate: '2026-11-23', sendInvite: true },
    });
    const body = (h.invoke.mock.calls[0][1] as { body: Record<string, unknown> }).body;
    expect(body).not.toHaveProperty('password');
    expect(body).not.toHaveProperty('companyId');
  });

  it('offers the crew vocabulary only (no admin roles)', () => {
    expect([...CREW_MEMBER_ROLES]).toEqual(['crew', 'master', 'chief_officer', 'chief_engineer']);
    expect(CREW_MEMBER_ROLES).not.toContain('dpa');
    expect(CREW_MEMBER_ROLES).not.toContain('shore_management');
  });
});

describe('createCrewMember: the outcome', () => {
  it('201 sent → created, invited', async () => {
    ok({ ok: true, profileId: 'p-1', invitation: { status: 'sent', invitationId: 'inv-1', stored: false } });
    const outcome = await createCrewMember(INPUT);
    expect(outcome).toEqual({ kind: 'created', profileId: 'p-1', invited: 'sent', stored: false });
    const notice = createCrewNotice(outcome, 'Demo Deckhand');
    expect(notice).toMatchObject({ tone: 'success', title: 'Crew member added' });
    expect(notice.description).toContain('Demo Deckhand was added and STORM emailed them an invitation.');
    expect(notice.description).toContain(NOT_STORED_NOTE);
  });

  it('201 not_sent → created, not invited (said so)', async () => {
    ok({ ok: true, profileId: 'p-1', invitation: { status: 'not_sent' } });
    const outcome = await createCrewMember({ ...INPUT, sendInvite: false });
    expect(outcome).toEqual({ kind: 'created', profileId: 'p-1', invited: 'not_sent', stored: true });
    expect(createCrewNotice(outcome, 'Demo Deckhand').description).toMatch(/Send their invitation from Users & Access/);
  });

  it('502 partial_failure send_failed → created_invite_failed with the email error, never "invited"', async () => {
    httpError(502, edgeError('partial_failure', 'The crew member was added, but the invitation email could not be sent.', { profileCreated: true, profileId: 'p-1', invitation: 'send_failed', email_error: 'provider_unavailable' }));
    const outcome = await createCrewMember(INPUT);
    expect(outcome).toEqual({ kind: 'created_invite_failed', profileId: 'p-1', emailError: 'provider_unavailable', inviteCode: null, assignmentFailed: false });
    const notice = createCrewNotice(outcome, 'Demo Deckhand');
    expect(notice).toMatchObject({ tone: 'error', title: 'Crew member added, invitation not sent', retry: false });
    expect(notice.description).toMatch(/did not answer/);
    expect(notice.description).toMatch(/Send it from Users & Access/);
  });

  it('502 partial_failure invitation refused → created_invite_failed with the code', async () => {
    httpError(502, edgeError('partial_failure', 'x', { profileCreated: true, profileId: 'p-1', invitation: 'refused', invite_code: 'status_unavailable' }));
    await expect(createCrewMember(INPUT)).resolves.toEqual({ kind: 'created_invite_failed', profileId: 'p-1', emailError: null, inviteCode: 'status_unavailable', assignmentFailed: false });
  });

  it('502 partial_failure with both failures names both', async () => {
    httpError(502, edgeError('partial_failure', 'x', { profileCreated: true, profileId: 'p-1', invitation: 'send_failed', email_error: 'not_configured', assignmentCreated: false }));
    const outcome = await createCrewMember(INPUT);
    expect(outcome).toMatchObject({ kind: 'created_invite_failed', assignmentFailed: true });
    expect(createCrewNotice(outcome).description).toMatch(/vessel assignment was not saved either/);
  });

  it('502 partial_failure assignmentCreated false → created_assignment_failed (invited said as it went)', async () => {
    httpError(502, { ...edgeError('partial_failure', 'x', { profileCreated: true, profileId: 'p-1', assignmentCreated: false }), invitation: { status: 'sent', invitationId: 'inv-1', stored: true } });
    const outcome = await createCrewMember(INPUT);
    expect(outcome).toEqual({ kind: 'created_assignment_failed', profileId: 'p-1', invited: 'sent' });
    expect(createCrewNotice(outcome, 'Demo Deckhand')).toMatchObject({
      tone: 'error',
      title: 'Crew member added, vessel not assigned',
      description: 'Demo Deckhand was added and invited, but the vessel assignment could not be saved. Assign the vessel from the crew list.',
    });
  });

  it('a 2xx without the honest body (an older function’s {success:true}, or {}) is unconfirmed', async () => {
    ok({ success: true, userId: 'u-1' });
    await expect(createCrewMember(INPUT)).resolves.toEqual({ kind: 'unconfirmed' });
    ok({});
    const outcome = await createCrewMember(INPUT);
    expect(outcome).toEqual({ kind: 'unconfirmed' });
    expect(createCrewNotice(outcome)).toMatchObject({ tone: 'warning', title: 'Crew member requested' });
    ok({ ok: true, invitation: { status: 'sent' } });
    await expect(createCrewMember(INPUT)).resolves.toEqual({ kind: 'unconfirmed' });
  });

  it.each([
    [403, edgeError('forbidden', 'Admin roles are given in Users & Access.', { reason: 'admin_role' }), 'forbidden', 'Admin roles are given in Users & Access.'],
    [403, edgeError('cross_company', 'That belongs to another account.'), 'cross_company', 'That belongs to another account.'],
    [403, edgeError('account_disabled', 'x'), 'account_disabled', 'Your access has been disabled by your account administrator.'],
    [404, edgeError('not_found', 'That vessel was not found.'), 'not_found', 'That vessel was not found.'],
    [409, edgeError('conflict', 'This email address cannot be used for a new crew member. Check the address, or find the person in the crew list.'), 'conflict', 'This email address cannot be used for a new crew member. Check the address, or find the person in the crew list.'],
    [409, edgeError('conflict', 'That vessel is archived.', { reason: 'vessel_archived' }), 'conflict', 'That vessel is archived.'],
    [400, edgeError('invalid_request', 'Only a real inbox can be added.', { reason: 'placeholder_email' }), 'invalid_request', 'Only a real inbox can be invited. Fix the email address and try again.'],
    [503, edgeError('status_unavailable', 'This could not be checked. Try again.'), 'status_unavailable', 'This could not be checked. Try again.'],
  ])('%i %o → failed (nothing added)', async (status, body, code, message) => {
    httpError(status, body);
    const outcome = await createCrewMember(INPUT);
    expect(outcome).toMatchObject({ kind: 'failed', failure: { status, code, message } });
    expect(createCrewNotice(outcome)).toMatchObject({ tone: 'error', title: 'Could not add the crew member', description: message });
  });

  it('offline is a failed network outcome with Retry', async () => {
    h.invoke.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const outcome = await createCrewMember(INPUT);
    expect(outcome).toMatchObject({ kind: 'failed', failure: { code: 'network' } });
    expect(createCrewNotice(outcome).retry).toBe(true);
  });
});

/**
 * The vessel is said only as the function reported it (D-184, D-199,
 * finding create-crew-member-pending-login-never-assigned): `created` when
 * the invitation linked a login and the assignment was written,
 * `pending_login` while no login is linked; an unknown value is ignored.
 */
describe('createCrewMember: the vessel assignment', () => {
  const NAME = 'Demo Deckhand';

  it('201 sent + created → "added to the vessel"', async () => {
    ok({ ok: true, profileId: 'p-1', invitation: { status: 'sent', invitationId: 'inv-1', stored: true }, assignment: 'created' });
    const outcome = await createCrewMember(INPUT);
    expect(outcome).toEqual({ kind: 'created', profileId: 'p-1', invited: 'sent', stored: true, assignment: 'created' });
    expect(createCrewNotice(outcome, NAME)).toEqual({
      tone: 'success',
      title: 'Crew member added',
      description: 'Demo Deckhand was added to the vessel and STORM emailed them an invitation.',
      retry: false,
    });
    expect(crewImportRowResult(outcome)).toEqual({ status: 'invited', created: true, message: 'Added and invited.' });
  });

  it('201 sent + created, not stored → the tracking note still follows', async () => {
    ok({ ok: true, profileId: 'p-1', invitation: { status: 'sent', invitationId: null, stored: false }, assignment: 'created' });
    const outcome = await createCrewMember(INPUT);
    expect(createCrewNotice(outcome, NAME).description).toBe(`Demo Deckhand was added to the vessel and STORM emailed them an invitation. ${NOT_STORED_NOTE}`);
    expect(crewImportRowResult(outcome).message).toBe(`Added and invited. ${NOT_STORED_NOTE}`);
  });

  it('201 sent + pending_login → invited, and the vessel waits for the login', async () => {
    ok({ ok: true, profileId: 'p-1', invitation: { status: 'sent', invitationId: 'inv-1', stored: true }, assignment: 'pending_login' });
    const outcome = await createCrewMember(INPUT);
    expect(outcome).toEqual({ kind: 'created', profileId: 'p-1', invited: 'sent', stored: true, assignment: 'pending_login' });
    const notice = createCrewNotice(outcome, NAME);
    expect(notice).toMatchObject({ tone: 'success', title: 'Crew member added', retry: false });
    expect(notice.description).toBe('Demo Deckhand was added and STORM emailed them an invitation. They are assigned to the vessel once their login is linked.');
    expect(notice.description).not.toMatch(/added to the vessel/);
    expect(crewImportRowResult(outcome)).toEqual({ status: 'invited', created: true, message: 'Added and invited. The vessel is assigned once their login is linked.' });
  });

  it('201 not_sent + pending_login → added, the vessel waits for the invitation and the login', async () => {
    ok({ ok: true, profileId: 'p-1', invitation: { status: 'not_sent' }, assignment: 'pending_login' });
    const outcome = await createCrewMember({ ...INPUT, sendInvite: false });
    expect(outcome).toEqual({ kind: 'created', profileId: 'p-1', invited: 'not_sent', stored: true, assignment: 'pending_login' });
    expect(createCrewNotice(outcome, NAME)).toEqual({
      tone: 'success',
      title: 'Crew member added',
      description:
        'Demo Deckhand was added. They are assigned to the vessel once they are invited and their login is linked. Send their invitation from Users & Access when they are ready to join.',
      retry: false,
    });
    expect(crewImportRowResult(outcome)).toEqual({
      status: 'added',
      created: true,
      message: 'Added. No invitation was sent. The vessel is assigned once they are invited and their login is linked.',
    });
  });

  it('201 not_sent + created (a login was already linked) → "added to the vessel"', async () => {
    ok({ ok: true, profileId: 'p-1', invitation: { status: 'not_sent' }, assignment: 'created' });
    const outcome = await createCrewMember({ ...INPUT, sendInvite: false });
    expect(outcome).toMatchObject({ kind: 'created', invited: 'not_sent', assignment: 'created' });
    expect(createCrewNotice(outcome, NAME).description).toBe('Demo Deckhand was added to the vessel. Send their invitation from Users & Access when they are ready to join.');
    expect(crewImportRowResult(outcome)).toEqual({ status: 'added', created: true, message: 'Added. No invitation was sent.' });
  });

  it('no vessel (no assignment in the answer) keeps the copy without a vessel', async () => {
    ok({ ok: true, profileId: 'p-1', invitation: { status: 'sent', invitationId: 'inv-1', stored: true } });
    const sent = await createCrewMember({ ...INPUT, vesselId: undefined });
    expect(sent).not.toHaveProperty('assignment');
    expect(createCrewNotice(sent, NAME).description).toBe('Demo Deckhand was added and STORM emailed them an invitation.');
    ok({ ok: true, profileId: 'p-1', invitation: { status: 'not_sent' } });
    const notSent = await createCrewMember({ ...INPUT, vesselId: undefined, sendInvite: false });
    expect(createCrewNotice(notSent, NAME).description).toBe('Demo Deckhand was added. Send their invitation from Users & Access when they are ready to join.');
    expect(crewImportRowResult(notSent).message).toBe('Added. No invitation was sent.');
  });

  it.each([['maybe'], ['failed'], [true], [{ status: 'created' }]])('an unknown 201 assignment value (%o) is ignored, never guessed', async (value) => {
    ok({ ok: true, profileId: 'p-1', invitation: { status: 'not_sent' }, assignment: value });
    const outcome = await createCrewMember({ ...INPUT, sendInvite: false });
    expect(outcome).toEqual({ kind: 'created', profileId: 'p-1', invited: 'not_sent', stored: true });
    expect(outcome).not.toHaveProperty('assignment');
    expect(createCrewNotice(outcome, NAME).description).toBe('Demo Deckhand was added. Send their invitation from Users & Access when they are ready to join.');
    expect(crewImportRowResult(outcome).message).toBe('Added. No invitation was sent.');
  });

  it('502 send_failed + pending_login → the vessel waits for the invitation and the login', async () => {
    httpError(502, edgeError('partial_failure', 'x', { profileCreated: true, profileId: 'p-1', invitation: 'send_failed', email_error: 'provider_unavailable', assignment: 'pending_login' }));
    const outcome = await createCrewMember(INPUT);
    expect(outcome).toEqual({ kind: 'created_invite_failed', profileId: 'p-1', emailError: 'provider_unavailable', inviteCode: null, assignmentFailed: false, assignment: 'pending_login' });
    const notice = createCrewNotice(outcome, NAME);
    expect(notice).toMatchObject({ tone: 'error', title: 'Crew member added, invitation not sent', retry: false });
    expect(notice.description).toBe(
      'Demo Deckhand was added, but the invitation email could not be sent. The email service did not answer. Try again in a few minutes. Send it from Users & Access. They are assigned to the vessel once they are invited and their login is linked.',
    );
    expect(crewImportRowResult(outcome)).toEqual({
      status: 'invite_failed',
      created: true,
      message:
        'Added, but not invited. The invitation email could not be sent: The email service did not answer. Try again in a few minutes. Send it from Users & Access. The vessel is assigned once they are invited and their login is linked.',
    });
  });

  it('502 refused + pending_login → the same vessel sentence', async () => {
    httpError(502, edgeError('partial_failure', 'x', { profileCreated: true, profileId: 'p-1', invitation: 'refused', invite_code: 'status_unavailable', assignment: 'pending_login' }));
    const outcome = await createCrewMember(INPUT);
    expect(outcome).toEqual({ kind: 'created_invite_failed', profileId: 'p-1', emailError: null, inviteCode: 'status_unavailable', assignmentFailed: false, assignment: 'pending_login' });
    expect(createCrewNotice(outcome, NAME).description).toBe(
      'Demo Deckhand was added, but the invitation was not sent. Send it from Users & Access. They are assigned to the vessel once they are invited and their login is linked.',
    );
    expect(crewImportRowResult(outcome).message).toBe('Added, but not invited. The invitation was not sent. Send it from Users & Access. The vessel is assigned once they are invited and their login is linked.');
  });

  it('502 send_failed + created (the failed send still linked the login) → no vessel caveat', async () => {
    httpError(502, edgeError('partial_failure', 'x', { profileCreated: true, profileId: 'p-1', invitation: 'send_failed', email_error: 'provider_rejected', assignment: 'created' }));
    const outcome = await createCrewMember(INPUT);
    expect(outcome).toEqual({ kind: 'created_invite_failed', profileId: 'p-1', emailError: 'provider_rejected', inviteCode: null, assignmentFailed: false, assignment: 'created' });
    const description = createCrewNotice(outcome, NAME).description ?? '';
    expect(description).not.toMatch(/once they are invited|not saved/);
    expect(crewImportRowResult(outcome).message).not.toMatch(/once they are invited|not saved/);
  });

  it('502 send_failed + assignment failed → assignmentFailed, said once, and no "once they are invited"', async () => {
    httpError(502, edgeError('partial_failure', 'x', { profileCreated: true, profileId: 'p-1', invitation: 'send_failed', email_error: 'provider_rejected', assignment: 'failed', assignmentCreated: false }));
    const outcome = await createCrewMember(INPUT);
    expect(outcome).toEqual({ kind: 'created_invite_failed', profileId: 'p-1', emailError: 'provider_rejected', inviteCode: null, assignmentFailed: true, assignment: 'failed' });
    expect(createCrewNotice(outcome, NAME).description).toMatch(/vessel assignment was not saved either/);
    expect(createCrewNotice(outcome, NAME).description).not.toMatch(/once they are invited/);
    expect(crewImportRowResult(outcome).message).toMatch(/vessel assignment was not saved either/);
  });

  it('502 details.assignment failed alone also sets assignmentFailed', async () => {
    httpError(502, edgeError('partial_failure', 'x', { profileCreated: true, profileId: 'p-1', invitation: 'send_failed', email_error: 'link_failed', assignment: 'failed' }));
    await expect(createCrewMember(INPUT)).resolves.toMatchObject({ kind: 'created_invite_failed', assignmentFailed: true, assignment: 'failed' });
  });

  it('502 with an unknown details.assignment is ignored', async () => {
    httpError(502, edgeError('partial_failure', 'x', { profileCreated: true, profileId: 'p-1', invitation: 'refused', invite_code: 'forbidden', assignment: 'later' }));
    const outcome = await createCrewMember(INPUT);
    expect(outcome).toEqual({ kind: 'created_invite_failed', profileId: 'p-1', emailError: null, inviteCode: 'forbidden', assignmentFailed: false });
    expect(createCrewNotice(outcome, NAME).description).not.toMatch(/vessel/);
  });

  it('the assignment-failed 502 (invited, assignment failed) is unchanged', async () => {
    httpError(502, {
      ...edgeError('partial_failure', 'x', { profileCreated: true, profileId: 'p-1', assignmentCreated: false, assignment: 'failed' }),
      invitation: { status: 'sent', invitationId: 'inv-1', stored: true },
    });
    const outcome = await createCrewMember(INPUT);
    expect(outcome).toEqual({ kind: 'created_assignment_failed', profileId: 'p-1', invited: 'sent' });
    expect(crewImportRowResult(outcome).status).toBe('assignment_failed');
  });
});

describe('CSV import rows', () => {
  const outcomes: CreateCrewOutcome[] = [
    { kind: 'created', profileId: 'p-1', invited: 'sent', stored: true },
    { kind: 'created', profileId: 'p-2', invited: 'not_sent', stored: true },
    { kind: 'created_invite_failed', profileId: 'p-3', emailError: 'provider_rejected', inviteCode: null, assignmentFailed: false },
    { kind: 'created_assignment_failed', profileId: 'p-4', invited: 'sent' },
    { kind: 'unconfirmed' },
    { kind: 'failed', failure: { status: 409, code: 'conflict', reason: null, message: 'This email address cannot be used for a new crew member.', retryAfterSeconds: null, details: {} } },
  ];

  it('each row says what happened', () => {
    const rows = outcomes.map(crewImportRowResult);
    expect(rows.map((r) => [r.status, r.created])).toEqual([
      ['invited', true],
      ['added', true],
      ['invite_failed', true],
      ['assignment_failed', true],
      ['unconfirmed', false],
      ['failed', false],
    ]);
    expect(rows[2].message).toBe('Added, but not invited. The invitation email could not be sent: The email service refused the message. Check the email address, then try again. Send it from Users & Access.');
    expect(rows[5].message).toBe('This email address cannot be used for a new crew member.');
  });

  it('the summary counts the rows’ own results', () => {
    expect(crewImportSummary(outcomes.map(crewImportRowResult))).toEqual({ created: 4, invited: 1, inviteFailed: 1, assignmentFailed: 1, unconfirmed: 1, failed: 1 });
  });
});
