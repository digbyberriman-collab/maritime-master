/**
 * Typed wrappers for the access edge functions (Phase 2 spec §B.3, §C.3;
 * gap/01 F46, F47, W7; proposed D-121, D-122): `send-invitation`,
 * `bulk-invite` and `admin-actions`.
 *
 * Every wrapper returns the honest outcome the function answered, never a
 * guess (non-negotiable 9):
 *
 * - "sent" only after a 200 whose body says `status: 'sent'`;
 * - a 502 `send_failed` carries the email error code (`not_configured`,
 *   `provider_rejected`, …) and whether the attempt was stored;
 * - `stored: false` means `record_invitation_send()` is not in the database
 *   yet (D-01): the email went, but its delivery status is not tracked;
 * - `partial_failure` names the part that failed (status stored, sign-in
 *   blocked, assignment created, previous assignment closed);
 * - `not_supported` is said as such (ending sessions by user id);
 * - a 2xx without the expected body (an older deployed function, or the
 *   visual harness's `{}`) is `unconfirmed`: STORM cannot say it worked;
 * - anything else is `failed` with an `EdgeFailure`: the HTTP status, the
 *   stable code, `details.reason` and one sentence of STORM copy.
 *
 * `supabase.functions.invoke` turns every non-2xx answer into a
 * `FunctionsHttpError` whose `context` is the `Response`; its JSON body is
 * `{ error: { code, message, details? } }` (plus `invitation` on a 502).
 * The body is read here, so callers never see the raw error.
 *
 * Client-supplied `redirectTo` is never sent: the functions ignore it and
 * links land on `${STORM_SITE_URL}/reset-password?flow=invite|recovery`.
 */
import { supabase } from '@/integrations/supabase/client';

// ─── Vocabulary (mirrors supabase/functions/_shared/http.ts and email.ts) ──

/** Stable error codes of the edge functions (`_shared/http.ts` `ErrorCode`). */
export const EDGE_ERROR_CODES = [
  'unauthorized',
  'account_disabled',
  'forbidden',
  'cross_company',
  'not_found',
  'invalid_request',
  'method_not_allowed',
  'conflict',
  'already_active',
  'cooldown',
  'rate_limited',
  'send_failed',
  'partial_failure',
  'not_supported',
  'status_unavailable',
  'server_misconfigured',
  'internal_error',
] as const;
export type EdgeErrorCode = (typeof EDGE_ERROR_CODES)[number];

/** Why an email was not sent (`_shared/email.ts` `EmailErrorCode`, plus `link_failed`: the auth link could not be made). */
export const EMAIL_ERROR_CODES = [
  'not_configured',
  'provider_rejected',
  'provider_unavailable',
  'invalid_recipient',
  'invalid_link',
  'link_failed',
] as const;
export type EmailErrorCode = (typeof EMAIL_ERROR_CODES)[number];

/** `network`: no answer at all (offline, timeout, relay). `unexpected_response`: an answer STORM cannot read. */
export type FailureCode = EdgeErrorCode | 'network' | 'unexpected_response';

export interface EdgeFailure {
  /** HTTP status; null when nothing answered. */
  status: number | null;
  code: FailureCode;
  /** `details.reason`, a stable snake_case code, when the function gave one. */
  reason: string | null;
  /** One sentence of STORM copy for the person. */
  message: string;
  /** From `details.retry_after_seconds` (cooldown, rate limit, PIN lock). */
  retryAfterSeconds: number | null;
  details: Readonly<Record<string, unknown>>;
}

export type EdgeFunctionName = 'send-invitation' | 'bulk-invite' | 'admin-actions';

// ─── Copy ──────────────────────────────────────────────────────────────────

const FAILURE_COPY: Readonly<Record<FailureCode, string>> = {
  unauthorized: 'Your session has expired. Sign in again to continue.',
  account_disabled: 'Your access has been disabled by your account administrator.',
  forbidden: "You don't have permission to do that.",
  cross_company: 'That person belongs to another company.',
  not_found: "That person wasn't found, or you don't have access to them.",
  invalid_request: 'Something in the request is not right. Check it and try again.',
  method_not_allowed: 'Something went wrong. Try again.',
  conflict: 'This cannot be done for this person right now.',
  already_active: 'This person has already joined STORM. Send a password reset instead.',
  cooldown: 'STORM tried to send an email to this person a moment ago. Wait a few minutes, then try again.',
  rate_limited: 'Too many requests in a short time. Wait a minute, then try again.',
  send_failed: 'The email could not be sent.',
  partial_failure: 'Only part of the change was made. Try again.',
  not_supported: 'Ending sessions from STORM is not available yet. Turn off their access to stop new sign-ins.',
  status_unavailable: 'STORM could not check this right now. Try again.',
  server_misconfigured: 'STORM is not set up to send this yet. Contact STORM support.',
  internal_error: 'Something went wrong. Try again.',
  network: 'STORM could not reach the server. Check your connection and try again.',
  unexpected_response: 'STORM could not confirm the result. Check the status before trying again.',
};

/** `details.reason` values with copy of their own (edge rule refusals). */
const REASON_COPY: Readonly<Record<string, string>> = {
  missing_email: 'This person has no email address. Add one, then send the invitation.',
  placeholder_email: 'Only a real inbox can be invited. Fix the email address and try again.',
  access_disabled: "This person's access is disabled. Turn access on first.",
  login_email_mismatch: "The email on this profile does not match the person's login. Contact STORM support.",
  login_missing: "This person's login could not be found. Contact STORM support.",
  no_login: 'This person has not joined STORM yet. Send an invitation instead.',
  pin_format: 'The PIN must be exactly 6 digits.',
  pin_not_set: 'Set an admin PIN first.',
  vessel_archived: 'That vessel is archived.',
  already_assigned: 'This person is already assigned to that vessel.',
};

/** What the person reads for each email error (send_failed). */
export const EMAIL_ERROR_COPY: Readonly<Record<EmailErrorCode, string>> = {
  not_configured: 'Email sending is not set up for STORM yet. Contact STORM support.',
  provider_rejected: 'The email service refused the message. Check the email address, then try again.',
  provider_unavailable: 'The email service did not answer. Try again in a few minutes.',
  invalid_recipient: 'The email address is not valid. Fix it, then try again.',
  invalid_link: 'The link for the email could not be made. Contact STORM support.',
  link_failed: 'The sign-in link could not be created. Try again.',
};
const EMAIL_ERROR_FALLBACK = 'The email service did not accept the message. Try again.';

export function emailErrorMessage(code: EmailErrorCode | null): string {
  return code ? EMAIL_ERROR_COPY[code] : EMAIL_ERROR_FALLBACK;
}

/** Retrying can help (the cause is temporary); a missing set-up or a bad address needs someone to fix it first. */
export function emailErrorIsRetryable(code: EmailErrorCode | null): boolean {
  return code === null || code === 'provider_unavailable' || code === 'link_failed' || code === 'provider_rejected';
}

const RETRYABLE_FAILURES: ReadonlySet<FailureCode> = new Set<FailureCode>([
  'network',
  'status_unavailable',
  'internal_error',
  'partial_failure',
  'unexpected_response',
]);

/** True when trying the same action again may work without changing anything first. */
export function failureIsRetryable(failure: EdgeFailure): boolean {
  return RETRYABLE_FAILURES.has(failure.code);
}

const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The sentence for a failure: our copy for known reasons and timed codes, the function's own STORM sentence next, the code's copy last. */
function failureMessage(code: FailureCode, reason: string | null, details: Record<string, unknown>, edgeMessage: string | null, retryAfter: number | null): string {
  if (reason === 'pin_invalid') {
    const left = typeof details.attempts_remaining === 'number' ? details.attempts_remaining : null;
    return left === null ? 'That PIN is not right.' : `That PIN is not right. ${plural(left, 'attempt', 'attempts')} left.`;
  }
  if (reason === 'pin_locked') {
    return retryAfter ? `Too many wrong PINs. Try again in about ${plural(minutes(retryAfter), 'minute', 'minutes')}.` : 'Too many wrong PINs. Try again later.';
  }
  if (reason && REASON_COPY[reason]) return REASON_COPY[reason];
  if (code === 'cooldown' && retryAfter) {
    if (retryAfter < 60) return 'STORM tried to send an email to this person a moment ago. Try again in a few seconds.';
    return `STORM tried to send an email to this person a moment ago. Try again in about ${plural(minutes(retryAfter), 'minute', 'minutes')}.`;
  }
  // Codes whose sentence must not depend on the server's wording.
  if (code === 'network' || code === 'unexpected_response' || code === 'account_disabled' || code === 'unauthorized' || code === 'cooldown' || code === 'not_supported') {
    return FAILURE_COPY[code];
  }
  return edgeMessage ?? FAILURE_COPY[code];
}

// ─── Reading the answer ────────────────────────────────────────────────────

type JsonObject = Record<string, unknown>;

interface EdgeAnswer {
  /** HTTP status; null when nothing answered. */
  status: number | null;
  body: unknown;
}

const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value);
const stringOrNull = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);
const isEdgeCode = (value: unknown): value is EdgeErrorCode => typeof value === 'string' && (EDGE_ERROR_CODES as readonly string[]).includes(value);
const isEmailCode = (value: unknown): value is EmailErrorCode => typeof value === 'string' && (EMAIL_ERROR_CODES as readonly string[]).includes(value);

interface ResponseLike {
  status: number;
  json: () => Promise<unknown>;
}
const isResponseLike = (value: unknown): value is ResponseLike =>
  isObject(value) && typeof value.status === 'number' && typeof value.json === 'function';

/** Calls the function; a non-2xx answer is read from the error's Response, so the body (codes, details) is never lost. */
export async function invokeEdge(name: EdgeFunctionName, body: JsonObject): Promise<EdgeAnswer> {
  let result: { data: unknown; error: unknown };
  try {
    result = await supabase.functions.invoke(name, { body });
  } catch {
    return { status: null, body: null };
  }
  if (!result.error) return { status: 200, body: result.data };
  const context = isObject(result.error) ? result.error.context : undefined;
  if (!isResponseLike(context)) return { status: null, body: null };
  let parsed: unknown = null;
  try {
    parsed = await context.json();
  } catch {
    parsed = null;
  }
  return { status: context.status, body: parsed };
}

function codeForStatus(status: number | null): FailureCode {
  if (status === null) return 'network';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (status === 501) return 'not_supported';
  if (status >= 400 && status < 500) return 'invalid_request';
  if (status >= 500) return 'internal_error';
  return 'unexpected_response';
}

/** A sentence the function wrote (STORM copy by contract); kept short and plain. */
function edgeSentence(value: unknown): string | null {
  const text = stringOrNull(value)?.trim() ?? null;
  if (!text || text.length > 300 || /[<>]/.test(text)) return null;
  return text;
}

/**
 * The failure an answer describes. The current error shape is
 * `{ error: { code, message, details } }`; older deployed functions answer
 * `{ error: '<text>' }` (with `needsSetup`, `locked` or `attemptsRemaining`
 * for the PIN), so the code then comes from the HTTP status and the old
 * text is never shown.
 */
export function failureFrom(answer: EdgeAnswer): EdgeFailure {
  const body = isObject(answer.body) ? answer.body : {};
  const error = body.error;
  let code: FailureCode;
  let details: JsonObject = {};
  let edgeMessage: string | null = null;
  if (isObject(error)) {
    code = isEdgeCode(error.code) ? error.code : codeForStatus(answer.status);
    details = isObject(error.details) ? error.details : {};
    edgeMessage = edgeSentence(error.message);
  } else {
    code = codeForStatus(answer.status);
    // Older admin-actions PIN answers.
    if (body.needsSetup === true) details = { reason: 'pin_not_set' };
    else if (body.locked === true) details = { reason: 'pin_locked' };
    else if (typeof body.attemptsRemaining === 'number') details = { reason: 'pin_invalid', attempts_remaining: body.attemptsRemaining };
    if (details.reason) code = 'forbidden';
  }
  const reason = stringOrNull(details.reason);
  const retryAfterSeconds = typeof details.retry_after_seconds === 'number' && details.retry_after_seconds > 0 ? details.retry_after_seconds : null;
  return {
    status: answer.status,
    code,
    reason,
    message: failureMessage(code, reason, details, edgeMessage, retryAfterSeconds),
    retryAfterSeconds,
    details,
  };
}

const isSuccess = (answer: EdgeAnswer) => answer.status !== null && answer.status >= 200 && answer.status < 300;
const okBody = (answer: EdgeAnswer): JsonObject | null => (isSuccess(answer) && isObject(answer.body) && answer.body.ok === true ? answer.body : null);

// ─── Invitations ───────────────────────────────────────────────────────────

export type InviteOutcome =
  | { kind: 'sent'; stored: boolean; invitationId: string | null }
  | { kind: 'send_failed'; stored: boolean; invitationId: string | null; emailError: EmailErrorCode | null }
  /** A 2xx without the honest body (an older deployed function): delivery cannot be confirmed. */
  | { kind: 'unconfirmed' }
  | { kind: 'failed'; failure: EdgeFailure };

/** The send-invitation (and admin-actions resend) answer as an outcome. */
export function inviteOutcomeFrom(answer: EdgeAnswer): InviteOutcome {
  const body = isObject(answer.body) ? answer.body : {};
  const invitation = isObject(body.invitation) ? body.invitation : null;
  const ok = okBody(answer);
  if (ok) {
    if (invitation?.status === 'sent') {
      return { kind: 'sent', stored: invitation.stored === true, invitationId: stringOrNull(invitation.id) };
    }
    return { kind: 'unconfirmed' };
  }
  if (isSuccess(answer)) return { kind: 'unconfirmed' };
  if (invitation?.status === 'send_failed') {
    const error = isObject(body.error) ? body.error : {};
    const details = isObject(error.details) ? error.details : {};
    return {
      kind: 'send_failed',
      stored: invitation.stored === true,
      invitationId: stringOrNull(invitation.id),
      emailError: isEmailCode(details.email_error) ? details.email_error : null,
    };
  }
  return { kind: 'failed', failure: failureFrom(answer) };
}

/** Invite one person (`profiles.id`). */
export async function sendInvitation(profileId: string): Promise<InviteOutcome> {
  return inviteOutcomeFrom(await invokeEdge('send-invitation', { profileId }));
}

export const BULK_INVITE_MAX = 50;

export interface BulkInviteRow {
  profileId: string;
  status: 'sent' | 'send_failed' | 'refused';
  stored: boolean;
  invitationId: string | null;
  /** Stable code: `send_failed`, `status_unavailable`, `cooldown`, `already_active`, … */
  code: string | null;
  emailError: EmailErrorCode | null;
  reason: string | null;
}

export type BulkInviteOutcome =
  | { kind: 'done'; results: BulkInviteRow[]; sent: number; failed: number; refused: number; notStored: number }
  /** Some batches answered; then one did not (rows of the batches that answered are kept). */
  | { kind: 'failed'; failure: EdgeFailure; results: BulkInviteRow[]; sent: number; failed: number; refused: number; notStored: number }
  | { kind: 'unconfirmed'; results: BulkInviteRow[]; sent: number; failed: number; refused: number; notStored: number };

function bulkRowFrom(value: unknown): BulkInviteRow | null {
  if (!isObject(value)) return null;
  const profileId = stringOrNull(value.profileId);
  const status = value.status;
  if (!profileId || (status !== 'sent' && status !== 'send_failed' && status !== 'refused')) return null;
  return {
    profileId,
    status,
    stored: value.stored === true,
    invitationId: stringOrNull(value.invitationId),
    code: stringOrNull(value.code),
    emailError: isEmailCode(value.emailError) ? value.emailError : null,
    reason: stringOrNull(value.reason),
  };
}

function tally(results: BulkInviteRow[]) {
  return {
    results,
    sent: results.filter((r) => r.status === 'sent').length,
    failed: results.filter((r) => r.status === 'send_failed').length,
    refused: results.filter((r) => r.status === 'refused').length,
    notStored: results.filter((r) => r.status !== 'refused' && !r.stored).length,
  };
}

/**
 * Invite several people. The function takes at most 50 ids per call, so
 * larger selections go in batches of 50, one after another; every row's
 * honest status comes back (sent, send_failed, refused). Counts are taken
 * from the rows the function returned, never assumed.
 */
export async function bulkInvite(profileIds: readonly string[]): Promise<BulkInviteOutcome> {
  const ids = [...new Set(profileIds)];
  const results: BulkInviteRow[] = [];
  for (let i = 0; i < ids.length; i += BULK_INVITE_MAX) {
    const batch = ids.slice(i, i + BULK_INVITE_MAX);
    const answer = await invokeEdge('bulk-invite', { profileIds: batch });
    const ok = okBody(answer);
    if (!ok) {
      if (isSuccess(answer)) return { kind: 'unconfirmed', ...tally(results) };
      return { kind: 'failed', failure: failureFrom(answer), ...tally(results) };
    }
    const rows = Array.isArray(ok.results) ? ok.results.map(bulkRowFrom) : null;
    if (!rows || rows.some((r) => r === null)) return { kind: 'unconfirmed', ...tally(results) };
    results.push(...(rows as BulkInviteRow[]));
  }
  return { kind: 'done', ...tally(results) };
}

// ─── admin-actions ─────────────────────────────────────────────────────────

export type PinVerifyOutcome = { kind: 'confirmed'; confirmedUntil: string } | { kind: 'failed'; failure: EdgeFailure };
export type PinSetOutcome = { kind: 'saved' } | { kind: 'failed'; failure: EdgeFailure };

/** Older deployed functions answer `{ success: true, … }`. */
const legacySuccess = (answer: EdgeAnswer): JsonObject | null =>
  isSuccess(answer) && isObject(answer.body) && (answer.body.ok === true || answer.body.success === true) ? answer.body : null;

export async function setAdminPin(pin: string): Promise<PinSetOutcome> {
  const answer = await invokeEdge('admin-actions', { action: 'set_pin', pin });
  if (legacySuccess(answer)) return { kind: 'saved' };
  return { kind: 'failed', failure: isSuccess(answer) ? unconfirmedFailure(answer) : failureFrom(answer) };
}

export async function verifyAdminPin(pin: string): Promise<PinVerifyOutcome> {
  const answer = await invokeEdge('admin-actions', { action: 'verify_pin', pin });
  const ok = legacySuccess(answer);
  const until = ok ? stringOrNull(ok.confirmedUntil) : null;
  if (until && !Number.isNaN(Date.parse(until))) return { kind: 'confirmed', confirmedUntil: until };
  if (isSuccess(answer)) return { kind: 'failed', failure: unconfirmedFailure(answer) };
  return { kind: 'failed', failure: failureFrom(answer) };
}

function unconfirmedFailure(answer: EdgeAnswer): EdgeFailure {
  return { status: answer.status, code: 'unexpected_response', reason: null, message: FAILURE_COPY.unexpected_response, retryAfterSeconds: null, details: {} };
}

export type PasswordResetOutcome =
  | { kind: 'sent' }
  | { kind: 'send_failed'; emailError: EmailErrorCode | null }
  | { kind: 'unconfirmed' }
  | { kind: 'failed'; failure: EdgeFailure };

/** Email the person a link to set a new password (a recovery link through STORM's own email). */
export async function sendPasswordReset(targetUserId: string, reason?: string): Promise<PasswordResetOutcome> {
  const answer = await invokeEdge('admin-actions', { action: 'reset_account', resetType: 'password_reset', targetUserId, ...(reason ? { reason } : {}) });
  const ok = okBody(answer);
  if (ok) return isObject(ok.reset) && ok.reset.status === 'sent' ? { kind: 'sent' } : { kind: 'unconfirmed' };
  if (isSuccess(answer)) return { kind: 'unconfirmed' };
  const failure = failureFrom(answer);
  if (failure.code === 'send_failed') {
    return { kind: 'send_failed', emailError: isEmailCode(failure.details.email_error) ? failure.details.email_error : null };
  }
  return { kind: 'failed', failure };
}

/** Send the invitation again (the send-invitation path, cooldown included). By login, or by profile for someone without one. */
export async function resendInvitation(target: { userId?: string | null; profileId?: string | null }, reason?: string): Promise<InviteOutcome> {
  const body: JsonObject = { action: 'reset_account', resetType: 'resend_invitation' };
  if (target.userId) body.targetUserId = target.userId;
  else if (target.profileId) body.targetProfileId = target.profileId;
  if (reason) body.reason = reason;
  return inviteOutcomeFrom(await invokeEdge('admin-actions', body));
}

export type EndSessionsOutcome = { kind: 'ended' } | { kind: 'not_supported'; message: string } | { kind: 'unconfirmed' } | { kind: 'failed'; failure: EdgeFailure };

/** Sign the person out everywhere. Not supported by the platform today: the function says so (501). */
export async function endAllSessions(targetUserId: string, reason?: string): Promise<EndSessionsOutcome> {
  const answer = await invokeEdge('admin-actions', { action: 'reset_account', resetType: 'invalidate_sessions', targetUserId, ...(reason ? { reason } : {}) });
  if (okBody(answer)) return { kind: 'ended' };
  if (isSuccess(answer)) return { kind: 'unconfirmed' };
  const failure = failureFrom(answer);
  if (failure.code === 'not_supported') return { kind: 'not_supported', message: failure.message };
  return { kind: 'failed', failure };
}

export type ToggleAccessOutcome =
  | { kind: 'done'; accountStatus: 'active' | 'disabled' }
  /** Which step worked: the STORM status (membership / profile) and the sign-in block (auth ban). */
  | { kind: 'partial_failure'; enable: boolean; statusStored: boolean; banApplied: boolean }
  | { kind: 'unconfirmed' }
  | { kind: 'failed'; failure: EdgeFailure };

/** Turn a person's access on or off. A reason is required to turn it off (the function refuses without one). */
export async function setAccess(targetUserId: string, enable: boolean, reason?: string): Promise<ToggleAccessOutcome> {
  const answer = await invokeEdge('admin-actions', { action: 'toggle_access', targetUserId, enableAccess: enable, ...(reason ? { reason } : {}) });
  const ok = okBody(answer);
  if (ok) {
    const status = ok.accountStatus;
    if (ok.statusStored === true && ok.banApplied === true && (status === 'active' || status === 'disabled')) return { kind: 'done', accountStatus: status };
    return { kind: 'unconfirmed' };
  }
  if (isSuccess(answer)) return { kind: 'unconfirmed' };
  const failure = failureFrom(answer);
  if (failure.code === 'partial_failure') {
    return { kind: 'partial_failure', enable, statusStored: failure.details.statusStored === true, banApplied: failure.details.banApplied === true };
  }
  return { kind: 'failed', failure };
}

export interface ReallocatedAssignment {
  id: string | null;
  vesselId: string | null;
  position: string | null;
  effectiveDate: string | null;
  endDate: string | null;
}

export type ReallocateOutcome =
  | { kind: 'done'; assignment: ReallocatedAssignment }
  | { kind: 'partial_failure'; assignmentCreated: boolean; previousEnded: boolean; message: string }
  | { kind: 'unconfirmed' }
  | { kind: 'failed'; failure: EdgeFailure };

export interface ReallocateInput {
  targetUserId: string;
  vesselId: string;
  reason: string;
  position?: string;
  effectiveDate?: string;
  endDate?: string;
}

function assignmentFrom(value: unknown): ReallocatedAssignment {
  const a = isObject(value) ? value : {};
  return {
    id: stringOrNull(a.id),
    vesselId: stringOrNull(a.vesselId),
    position: stringOrNull(a.position),
    effectiveDate: stringOrNull(a.effectiveDate),
    endDate: stringOrNull(a.endDate),
  };
}

export async function reallocateVessel(input: ReallocateInput): Promise<ReallocateOutcome> {
  const answer = await invokeEdge('admin-actions', { action: 'reallocate_vessel', ...input });
  const ok = okBody(answer);
  if (ok) return isObject(ok.assignment) ? { kind: 'done', assignment: assignmentFrom(ok.assignment) } : { kind: 'unconfirmed' };
  if (isSuccess(answer)) return { kind: 'unconfirmed' };
  const failure = failureFrom(answer);
  if (failure.code === 'partial_failure') {
    return {
      kind: 'partial_failure',
      assignmentCreated: failure.details.assignmentCreated === true,
      previousEnded: failure.details.previousEnded === true,
      message: failure.details.assignmentCreated === true
        ? 'The new assignment was saved, but the previous one could not be closed. Try again.'
        : 'Nothing was changed. Try again.',
    };
  }
  return { kind: 'failed', failure };
}

// ─── What to tell the person ───────────────────────────────────────────────

export type NoticeTone = 'success' | 'warning' | 'error';

export interface OutcomeNotice {
  tone: NoticeTone;
  title: string;
  description?: string;
  /** Offer Retry: trying the same action again may work. */
  retry: boolean;
}

export const NOT_STORED_NOTE = 'Delivery tracking is not set up yet.';

const withNote = (text: string | undefined, note: string | null) => [text, note].filter(Boolean).join(' ') || undefined;

/** The notice for an invitation outcome (single invite or resend). */
export function inviteNotice(outcome: InviteOutcome, recipient?: string | null): OutcomeNotice {
  switch (outcome.kind) {
    case 'sent':
      return {
        tone: 'success',
        title: 'Invitation sent',
        description: withNote(recipient ? `STORM emailed an invitation to ${recipient}.` : 'STORM emailed the invitation.', outcome.stored ? null : NOT_STORED_NOTE),
        retry: false,
      };
    case 'send_failed':
      return {
        tone: 'error',
        title: 'The invitation email could not be sent',
        description: withNote(emailErrorMessage(outcome.emailError), outcome.stored ? null : NOT_STORED_NOTE),
        retry: emailErrorIsRetryable(outcome.emailError),
      };
    case 'unconfirmed':
      return {
        tone: 'warning',
        title: 'Invitation requested',
        description: 'STORM could not confirm that the email was sent. Check the invitation status before sending again.',
        retry: false,
      };
    case 'failed':
      return { tone: 'error', title: 'Could not send the invitation', description: outcome.failure.message, retry: failureIsRetryable(outcome.failure) };
  }
}

/** The notice for a bulk invite: "Sent n · Failed m" from the rows the function returned. */
export function bulkInviteNotice(outcome: BulkInviteOutcome): OutcomeNotice {
  const parts = [`Sent ${outcome.sent}`, `Failed ${outcome.failed}`];
  if (outcome.refused > 0) parts.push(`Not sent ${outcome.refused}`);
  const title = parts.join(' · ');
  const notes: string[] = [];
  if (outcome.failed > 0) notes.push('Some invitation emails could not be sent. Retry them from the list.');
  if (outcome.refused > 0) notes.push('Some people could not be invited; their status says why.');
  if (outcome.notStored > 0) notes.push(NOT_STORED_NOTE);
  if (outcome.kind === 'failed') {
    return { tone: 'error', title: outcome.results.length ? title : 'Could not send the invitations', description: [outcome.failure.message, ...notes].join(' '), retry: failureIsRetryable(outcome.failure) };
  }
  if (outcome.kind === 'unconfirmed') {
    return { tone: 'warning', title: outcome.results.length ? title : 'Invitations requested', description: 'STORM could not confirm every result. Check the invitation status before sending again.', retry: false };
  }
  const tone: NoticeTone = outcome.failed + outcome.refused === 0 ? 'success' : outcome.sent === 0 ? 'error' : 'warning';
  return { tone, title, description: notes.join(' ') || undefined, retry: false };
}

export function passwordResetNotice(outcome: PasswordResetOutcome, recipient?: string | null): OutcomeNotice {
  switch (outcome.kind) {
    case 'sent':
      return { tone: 'success', title: 'Password reset email sent', description: recipient ? `STORM emailed a reset link to ${recipient}.` : 'STORM emailed a reset link.', retry: false };
    case 'send_failed':
      return { tone: 'error', title: 'The reset email could not be sent', description: emailErrorMessage(outcome.emailError), retry: emailErrorIsRetryable(outcome.emailError) };
    case 'unconfirmed':
      return { tone: 'warning', title: 'Password reset requested', description: 'STORM could not confirm that the email was sent.', retry: false };
    case 'failed':
      return { tone: 'error', title: 'Could not send the reset email', description: outcome.failure.message, retry: failureIsRetryable(outcome.failure) };
  }
}

export function endSessionsNotice(outcome: EndSessionsOutcome): OutcomeNotice {
  switch (outcome.kind) {
    case 'ended':
      return { tone: 'success', title: 'Signed out everywhere', retry: false };
    case 'not_supported':
      return { tone: 'warning', title: 'Not available yet', description: outcome.message, retry: false };
    case 'unconfirmed':
      return { tone: 'warning', title: 'Sign-out requested', description: 'STORM could not confirm that the sessions were ended.', retry: false };
    case 'failed':
      return { tone: 'error', title: 'Could not end the sessions', description: outcome.failure.message, retry: failureIsRetryable(outcome.failure) };
  }
}

/** Partial-failure copy names the step that failed (spec §C.3). */
export function partialAccessMessage(enable: boolean, statusStored: boolean, banApplied: boolean): string {
  if (!statusStored) return 'Nothing was changed. Try again.';
  if (!banApplied) {
    return enable ? 'Access is on in STORM, but sign-in is still blocked. Try again.' : 'Access is off in STORM, but sign-in could not be blocked. Try again.';
  }
  return 'Only part of the change was made. Try again.';
}

export function accessNotice(outcome: ToggleAccessOutcome, name?: string | null): OutcomeNotice {
  const who = name?.trim() || 'This person';
  switch (outcome.kind) {
    case 'done':
      return outcome.accountStatus === 'disabled'
        ? { tone: 'success', title: 'Access turned off', description: `${who} can no longer sign in to STORM.`, retry: false }
        : { tone: 'success', title: 'Access turned on', description: `${who} can sign in to STORM again.`, retry: false };
    case 'partial_failure':
      return {
        tone: 'error',
        title: outcome.statusStored ? 'Access only partly changed' : 'Access not changed',
        description: partialAccessMessage(outcome.enable, outcome.statusStored, outcome.banApplied),
        retry: true,
      };
    case 'unconfirmed':
      return { tone: 'warning', title: 'Change requested', description: "STORM could not confirm the change. Check the person's status.", retry: false };
    case 'failed':
      return { tone: 'error', title: 'Could not change access', description: outcome.failure.message, retry: failureIsRetryable(outcome.failure) };
  }
}
