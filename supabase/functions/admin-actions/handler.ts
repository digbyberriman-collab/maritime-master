/**
 * admin-actions (Phase 2 spec §C.3; gap/01 F47, W7; D-122).
 *
 * `POST { action, ... }`. Every action except the caller's own PIN pair needs
 * `admin.access.users_access.admin` in the target's company (`assertCapability`).
 * Targets are read with the caller's RLS client (not visible → 404); acting
 * on yourself → 403 (except PIN). Every action on a person then runs
 * `assertMayActOnUser` (D-194 / D-195 / D-207: the service-role
 * `admin_may_act_on_user`, and a manager of administrators for an
 * administrator target) → 403 `forbidden` `details.reason: out_of_reach` /
 * `manages_admins_required`; an account owner → 403. Every change is
 * written to `admin_action_log` without email addresses. No response says
 * sent, reset or disabled unless that step succeeded.
 *
 * | action | body | success | honest failures |
 * |---|---|---|---|
 * | `set_pin` | `pin` (6 digits) | 200 `{ ok: true }` | 400 |
 * | `verify_pin` | `pin` | 200 `{ ok: true, confirmedUntil }` | 400 `reason: pin_format / pin_not_set`, 403 `reason: pin_invalid` (+ `attempts_remaining`) / `pin_locked` (+ `retry_after_seconds`), 429 |
 * | `reset_account` + `resetType: 'password_reset'` | `targetUserId`, `reason?` | 200 `{ ok: true, reset: { status: 'sent' } }` | 502 `send_failed` `details.email_error`; 409 `conflict` (`reason: access_disabled`; `no_login`; `login_missing`: no auth user; `invitation_withdrawn`: the login of a revoked invitee, a `not_invited` / `invited` profile, is banned and only a new invitation lifts that, D-208; `login_blocked`: any other ban; neither makes a link, sends an email or writes an audit row); 429 `cooldown` (`retry_after_seconds`, `Retry-After`: a reset for this person in the last 60 s, no link made); 503 (the cooldown or the login could not be checked) |
 * | `reset_account` + `resetType: 'resend_invitation'` | `targetUserId` or `targetProfileId` | as send-invitation (200 / 502 / 409 / 429 …; top-level `assignment: 'created' \| 'failed'` when the invitation linked a login for an imported vessel, D-199) | 409 `conflict` `reason: login_blocked` (a banned login no revoke explains, D-208: no link, no email, nothing recorded), `login_not_created_by_storm` (D-205); 403 `forbidden` `reason: master_needs_admin` (a pending Master / Captain placement and a caller without users_access.admin for its vessel: nothing reserved, linked or sent, D-198, D-204) |
 * | `reset_account` + `resetType: 'invalidate_sessions'` | `targetUserId` | — | 501 `not_supported` after the target checks (no supported revoke by user id; never faked) |
 * | `toggle_access` | `targetUserId`, `enableAccess`, `reason` (required to disable) | 200 `{ ok: true, statusStored: true, banApplied: true, accountStatus }` | 502 `partial_failure` `details: { statusStored, banApplied }`; 403 refusal (self, owner, `out_of_reach`, `manages_admins_required`, last manager; `reason: invitation_withdrawn` / `membership_removed` for a withdrawn invitation, nothing changed and no ban lifted); 400 |
 * | `reallocate_vessel` | `targetUserId`, `vesselId`, `reason`, `position?`, `effectiveDate?`, `endDate?` | 200 `{ ok: true, assignment }` | 502 `partial_failure` `details: { assignmentCreated, previousEnded }`; 404 vessel; 409; 403 (destination and every source vessel need users_access.admin, D-198; `out_of_reach` for a vessel-scoped administrator; nothing written) |
 * | `revoke_invitation` | `invitationId`, `reason?` | 200 `{ ok: true, invitation: { id, status: 'revoked', profileId, revokedAt }, loginBlocked, loginNote }`: `loginNote` `banned` (a login that never signed in is banned, so the emailed link and "Forgot password" stop working; `loginBlocked: true`), `no_login` (`loginBlocked: true`), `signed_in_before` (not banned; `loginBlocked: false`: turn access off to stop them) | 404 `not_found` (not visible, not live); 403 `forbidden` (capability, own / owner login); 501 `not_supported` `details.reason: invitations_not_live`; 502 `partial_failure` `details: { revoked: true, loginBlocked: false }` + `invitation`; 503 |
 *
 * Every target action (`reset_account` of all three types, `toggle_access`,
 * `reallocate_vessel`) answers 403 `forbidden` `details.reason:
 * out_of_reach` (a person on a vessel the caller does not administer, or
 * without a vessel for an admin who does not administer every vessel) and
 * `manages_admins_required` (an administrator target), before any change.
 *
 * Email idempotency keys (D-146 as amended): `reset:<userId>:<minute>:<h16>`
 * of the recovery link; invitations use `_shared/invitations.ts`.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.2';
import { type AuthContext, getAuthContext } from '../_shared/auth.ts';
import { assertCapability, assertCapabilityForVessels, assertMayActOnUser, legacyManagesAdmins } from '../_shared/capability.ts';
import { asRow, errorCode, errorMessage, int, isMissingFunction, isMissingTable, rowsOf, text, timeOf, type Row } from '../_shared/db.ts';
import { type EdgeDeps, edgeDeps, originsOf } from '../_shared/deps.ts';
import { type EmailMessage, type EmailResult, payloadTag, sendEmail } from '../_shared/email.ts';
import { type EdgeEnv, linkLanding } from '../_shared/env.ts';
import { errorBody, type Handler, HttpError, json, type JsonValue, readJson, withHttp } from '../_shared/http.ts';
import {
  INVITATION_WITHDRAWN_FOR_RESET,
  type InviteDeps,
  inviteProfile,
  invitationResponse,
  isReinvitableStatus,
  LOGIN_BLOCKED,
  outcomeDetails,
} from '../_shared/invitations.ts';
import { log, stripControls } from '../_shared/log.ts';
import { RateLimiter } from '../_shared/rateLimit.ts';
import { type Body, objectBody, optionalDate, optionalString, optionalUuid, requiredBoolean, requiredString, requiredUuid } from '../_shared/validate.ts';
import { hashPin, isValidPin, verifyPin } from './pin.ts';

export interface AdminActionsDeps extends EdgeDeps {
  invite: Partial<InviteDeps>;
  sendEmail: (message: EmailMessage, env: EdgeEnv) => Promise<EmailResult>;
  now: () => Date;
  limiter: RateLimiter;
  pinLimiter: RateLimiter;
  /** One password reset per target per 60 s in this isolate (`reset:<targetUserId>`), on top of the logged-reset check. */
  resetLimiter: RateLimiter;
}

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MS = 15 * 60 * 1000;
const PIN_CONFIRM_MS = 10 * 60 * 1000;
/** A password reset for the same person waits this long after the last one (a new link would kill the delivered one). */
export const RESET_COOLDOWN_MS = 60 * 1000;
/** `ban_duration` for a disabled account: about 100 years (refresh tokens stop working). */
export const DISABLE_BAN = '876000h';
const ADMIN_ROLES = new Set(['dpa', 'shore_management']);
const DISABLED = new Set(['disabled', 'deactivated']);

const UNAVAILABLE = (): HttpError => new HttpError(503, 'status_unavailable', 'This could not be checked. Try again.');
const NOT_FOUND = (): HttpError => new HttpError(404, 'not_found', 'That person was not found.');
const NO_LOGIN = (): HttpError => new HttpError(409, 'conflict', 'This person has not joined STORM yet. Send an invitation instead.', { reason: 'no_login' });

type AuditAction = 'RESET_ACCOUNT' | 'TOGGLE_ACCESS' | 'REALLOCATE_VESSEL' | 'SET_PIN';

interface AuditRow {
  action_type: AuditAction;
  target_user_id: string | null;
  target_crew_id: string | null;
  before_json?: Record<string, JsonValue> | null;
  after_json?: Record<string, JsonValue> | null;
  reason?: string | null;
}

/** `admin_action_log` (service role: the table has no insert path for most admins). Never emails. A failed write is logged, not fatal. */
async function audit(ctx: AuthContext, row: AuditRow): Promise<void> {
  const res = await ctx.serviceClient().from('admin_action_log').insert({ actor_user_id: ctx.user.id, ...row });
  if (res.error) log('warn', 'admin_audit_failed', { action: row.action_type, code: errorCode(res.error) || 'none' });
}

interface Target {
  row: Row;
  profileId: string;
  userId: string | null;
  companyId: string | null;
  email: string | null;
  status: string;
  role: string;
}

const TARGET_COLUMNS = 'id, user_id, email, first_name, company_id, account_status, role, rank';

function toTarget(row: Row | null): Target {
  const profileId = text(row, 'id');
  if (!row || !profileId) throw NOT_FOUND();
  return {
    row,
    profileId,
    userId: text(row, 'user_id'),
    companyId: text(row, 'company_id'),
    email: text(row, 'email')?.trim() ?? null,
    status: (text(row, 'account_status') ?? '').toLowerCase(),
    role: (text(row, 'role') ?? '').toLowerCase(),
  };
}

/** The target through the caller's RLS view (no cross-tenant probing). */
async function loadTarget(ctx: AuthContext, by: { userId?: string | null; profileId?: string | null }): Promise<Target> {
  let query = ctx.userClient.from('profiles').select(TARGET_COLUMNS);
  if (by.userId) query = query.eq('user_id', by.userId);
  else if (by.profileId) query = query.eq('id', by.profileId);
  else throw new HttpError(400, 'invalid_request', 'Choose the person.', { field: 'targetUserId' });
  const res = await query.maybeSingle();
  if (res.error) throw UNAVAILABLE();
  return toTarget(asRow(res.data));
}

/**
 * Self, capability, the person (D-194 / D-195 / D-207: `assertMayActOnUser`),
 * owner — in that order, before any change. Shared by every target action.
 */
async function guardTarget(ctx: AuthContext, target: Target, vesselId: string | null = null): Promise<void> {
  if ((target.userId && target.userId === ctx.user.id) || target.profileId === ctx.profileId) {
    throw new HttpError(403, 'forbidden', 'You cannot do this to your own account.');
  }
  await assertCapability(ctx, 'admin.access.users_access.admin', { companyId: target.companyId, vesselId });
  await assertMayActOnUser(ctx, { companyId: target.companyId, userId: target.userId, profileId: target.profileId, role: target.role });
  if (!target.userId) return;
  const owner = await ctx.serviceClient()
    .from('account_memberships')
    .select('id')
    .eq('user_id', target.userId)
    .eq('kind', 'owner')
    .neq('status', 'removed')
    .limit(1);
  if (owner.error) {
    if (isMissingTable(owner.error)) return; // no memberships yet (D-01): no owners exist
    throw UNAVAILABLE();
  }
  if (rowsOf(owner.data).length > 0) throw new HttpError(403, 'forbidden', "The account owner's access cannot be changed here.");
}

// ---- PIN (the caller's own) -------------------------------------------------------------------

async function setPin(ctx: AuthContext, body: Body, deps: AdminActionsDeps): Promise<Response> {
  const pin = body.pin;
  if (!isValidPin(pin)) throw new HttpError(400, 'invalid_request', 'The PIN must be exactly 6 digits.', { reason: 'pin_format' });
  const res = await ctx.serviceClient()
    .from('admin_pins')
    .upsert(
      { user_id: ctx.user.id, pin_hash: await hashPin(pin), failed_attempts: 0, locked_until: null, updated_at: deps.now().toISOString() },
      { onConflict: 'user_id' },
    );
  if (res.error) throw new HttpError(500, 'internal_error', 'The PIN could not be saved. Try again.');
  await audit(ctx, { action_type: 'SET_PIN', target_user_id: ctx.user.id, target_crew_id: ctx.profileId, after_json: { action: 'pin_set' } });
  return json({ ok: true });
}

async function verifyPinAction(ctx: AuthContext, body: Body, deps: AdminActionsDeps): Promise<Response> {
  deps.pinLimiter.enforce(`pin:${ctx.user.id}`);
  const pin = body.pin;
  if (!isValidPin(pin)) throw new HttpError(400, 'invalid_request', 'The PIN must be exactly 6 digits.', { reason: 'pin_format' });
  const service = ctx.serviceClient();
  const res = await service.from('admin_pins').select('pin_hash, failed_attempts, locked_until').eq('user_id', ctx.user.id).maybeSingle();
  if (res.error) throw UNAVAILABLE();
  const record = asRow(res.data);
  const stored = text(record, 'pin_hash');
  if (!record || !stored) throw new HttpError(400, 'invalid_request', 'Set an admin PIN first.', { reason: 'pin_not_set' });

  const now = deps.now().getTime();
  const lockedUntil = timeOf(record, 'locked_until');
  if (lockedUntil !== null && lockedUntil > now) {
    const wait = Math.ceil((lockedUntil - now) / 1000);
    throw new HttpError(403, 'forbidden', 'Too many wrong PINs. Try again later.', { reason: 'pin_locked', retry_after_seconds: wait });
  }
  if (!(await verifyPin(pin, stored))) {
    const failed = (int(record, 'failed_attempts') ?? 0) + 1;
    const patch: Record<string, string | number | null> = { failed_attempts: failed };
    if (failed >= PIN_MAX_ATTEMPTS) patch.locked_until = new Date(now + PIN_LOCK_MS).toISOString();
    const upd = await service.from('admin_pins').update(patch).eq('user_id', ctx.user.id);
    if (upd.error) throw UNAVAILABLE(); // never let a failed counter write give unlimited guesses
    throw new HttpError(403, 'forbidden', 'That PIN is not right.', { reason: 'pin_invalid', attempts_remaining: Math.max(0, PIN_MAX_ATTEMPTS - failed) });
  }
  const confirmedAt = new Date(now).toISOString();
  const upd = await service.from('admin_pins').update({ failed_attempts: 0, locked_until: null, last_confirmed_at: confirmedAt }).eq('user_id', ctx.user.id);
  if (upd.error) throw UNAVAILABLE();
  return json({ ok: true, confirmedUntil: new Date(now + PIN_CONFIRM_MS).toISOString() });
}

// ---- reset_account ----------------------------------------------------------------------------

const RESET_TYPES = ['password_reset', 'invalidate_sessions', 'resend_invitation'] as const;
type ResetType = (typeof RESET_TYPES)[number];

async function resetAccount(ctx: AuthContext, body: Body, deps: AdminActionsDeps): Promise<Response> {
  const resetType = requiredString(body, 'resetType', 40);
  if (!(RESET_TYPES as readonly string[]).includes(resetType)) {
    throw new HttpError(400, 'invalid_request', 'Choose what to reset.', { field: 'resetType' });
  }
  const type = resetType as ResetType;
  const reason = optionalString(body, 'reason', 500);
  const targetUserId = optionalUuid(body, 'targetUserId');
  const targetProfileId = type === 'resend_invitation' ? optionalUuid(body, 'targetProfileId') : null;
  if (type !== 'invalidate_sessions') linkLanding(ctx.env, type === 'password_reset' ? 'recovery' : 'invite'); // before any read or send
  const target = await loadTarget(ctx, { userId: targetUserId, profileId: targetUserId ? null : targetProfileId });
  await guardTarget(ctx, target);
  const before = { account_status: target.status || null };

  if (type === 'invalidate_sessions') {
    throw new HttpError(
      501,
      'not_supported',
      'Signing someone out of every device is not available in STORM yet. Turn off their access to stop new sign-ins.',
    );
  }

  if (type === 'resend_invitation') {
    const outcome = await inviteProfile(ctx, target.profileId, deps.invite);
    if (outcome.status !== 'refused') {
      await audit(ctx, {
        action_type: 'RESET_ACCOUNT',
        target_user_id: target.userId,
        target_crew_id: target.profileId,
        before_json: before,
        after_json: { reset_type: type, ...outcomeDetails(outcome) },
        reason,
      });
    }
    return invitationResponse(outcome);
  }

  // password_reset: our own email with a recovery link (generateLink alone sends nothing; gap/01 F47).
  if (!target.userId || !target.email) throw NO_LOGIN();
  if (DISABLED.has(target.status)) {
    throw new HttpError(409, 'conflict', "This person's access is disabled. Turn access on first.", { reason: 'access_disabled' });
  }
  // A banned login cannot use a recovery link (D-208): refuse before any link, email or 'sent' audit row.
  await assertLoginUsable(ctx, target, deps.now());
  // Every recovery link replaces the last one: refuse a second reset inside the window before any link is made.
  await assertResetWindow(ctx, target.userId, deps);
  const landing = linkLanding(ctx.env, 'recovery');
  const link = await ctx.serviceClient().auth.admin.generateLink({ type: 'recovery', email: target.email, options: { redirectTo: landing } });
  let result: EmailResult | { ok: false; errorCode: 'link_failed' };
  if (link.error || !link.data?.properties?.action_link || (link.data.user?.id && link.data.user.id !== target.userId)) {
    log('warn', 'reset_link_failed', { code: errorCode(link.error) || 'none' });
    result = { ok: false, errorCode: 'link_failed' };
  } else {
    const variables: Record<string, string> = { action_link: link.data.properties.action_link };
    const firstName = text(target.row, 'first_name');
    if (firstName) variables.first_name = firstName;
    const minute = Math.floor(deps.now().getTime() / 60_000);
    const idempotencyKey = `reset:${target.userId}:${minute}:${await payloadTag(link.data.properties.action_link)}`;
    result = await deps.sendEmail({ to: target.email, template: 'PASSWORD_RESET', variables, idempotencyKey }, ctx.env);
  }
  await audit(ctx, {
    action_type: 'RESET_ACCOUNT',
    target_user_id: target.userId,
    target_crew_id: target.profileId,
    before_json: before,
    after_json: { reset_type: type, outcome: result.ok ? 'sent' : 'send_failed', code: result.ok ? null : result.errorCode },
    reason,
  });
  if (!result.ok) {
    throw new HttpError(502, 'send_failed', 'The reset email could not be sent.', { email_error: result.errorCode });
  }
  return json({ ok: true, reset: { status: 'sent' } });
}

/**
 * The target's login exists and is not banned now; a read error is 503.
 * Else 409: `login_missing` (no auth user); for a banned login of a revoked
 * invitee (`not_invited` / `invited`: turning access on is refused for them,
 * only a new invitation lifts the block, D-208) `invitation_withdrawn`; for
 * any other ban (access turned off, or a ban no revoke explains)
 * `login_blocked`.
 */
async function assertLoginUsable(ctx: AuthContext, target: Target, now: Date): Promise<void> {
  if (!target.userId) throw NO_LOGIN();
  const found = await ctx.serviceClient().auth.admin.getUserById(target.userId);
  if (found.error) {
    if (isUserNotFound(found.error)) {
      throw new HttpError(409, 'conflict', "This person's login could not be found. Contact STORM support.", { reason: 'login_missing' });
    }
    throw UNAVAILABLE();
  }
  const bannedUntil = timeOf(asRow(found.data?.user), 'banned_until');
  if (bannedUntil !== null && bannedUntil > now.getTime()) {
    throw isReinvitableStatus(target.status) ? INVITATION_WITHDRAWN_FOR_RESET() : LOGIN_BLOCKED();
  }
}

function resetCooldown(seconds: number): HttpError {
  const wait = Math.max(1, Math.ceil(seconds));
  return new HttpError(429, 'cooldown', 'A reset email was sent to this person a moment ago. Wait a minute before sending another.', {
    retry_after_seconds: wait,
  }, { 'Retry-After': String(wait) });
}

/**
 * The reset window (60 s): the latest logged password reset for this person
 * (`admin_action_log` RESET_ACCOUNT, any outcome: a timed-out send may still
 * have been delivered), then the in-isolate limiter (it also catches two
 * concurrent clicks, which both read the log before either writes it). A read
 * error is 503: never assume there was no recent reset.
 */
async function assertResetWindow(ctx: AuthContext, targetUserId: string, deps: AdminActionsDeps): Promise<void> {
  const now = deps.now().getTime();
  const last = await ctx.serviceClient()
    .from('admin_action_log')
    .select('created_at')
    .eq('action_type', 'RESET_ACCOUNT')
    .eq('target_user_id', targetUserId)
    .eq('after_json->>reset_type', 'password_reset')
    .order('created_at', { ascending: false })
    .limit(1);
  if (last.error) throw new HttpError(503, 'status_unavailable', 'Recent reset emails could not be checked. Try again.');
  const at = timeOf(rowsOf(last.data)[0] ?? null, 'created_at');
  if (at !== null && now - at < RESET_COOLDOWN_MS) throw resetCooldown((at + RESET_COOLDOWN_MS - now) / 1000);
  const verdict = deps.resetLimiter.hit(`reset:${targetUserId}`);
  if (!verdict.ok) throw resetCooldown(verdict.retryAfterSeconds);
}

// ---- revoke_invitation ------------------------------------------------------------------------

const INVITATION_NOT_FOUND = (): HttpError => new HttpError(404, 'not_found', 'That invitation was not found, or it is no longer open.');
const INVITATIONS_NOT_LIVE = (): HttpError =>
  new HttpError(501, 'not_supported', 'Revoking an invitation is not available in STORM yet.', { reason: 'invitations_not_live' });

function isUserNotFound(error: unknown): boolean {
  const status = error && typeof error === 'object' ? (error as { status?: unknown }).status : undefined;
  return errorCode(error) === 'user_not_found' || status === 404;
}

type LoginNote = 'banned' | 'no_login' | 'signed_in_before';

/**
 * Revoke a live invitation (gap/01 W2 row 8): the SQL `revoke_invitation()`
 * as the caller (it marks the row revoked, resets a never-signed-in profile
 * and removes the never-accepted membership), then, with the service client,
 * the login: one that never signed in is banned, so neither the emailed link
 * nor "Forgot password" lets the invitee in; a re-invite lifts the ban
 * (`_shared/invitations.ts`). Someone who has signed in before is not banned
 * here: turning their access off is the honest tool for that.
 */
async function revokeInvitation(ctx: AuthContext, body: Body, _deps: AdminActionsDeps): Promise<Response> {
  const invitationId = requiredUuid(body, 'invitationId');
  const reason = optionalString(body, 'reason', 500);

  const read = await ctx.userClient.from('user_invitations').select('id, company_id, profile_id, user_id, status').eq('id', invitationId).maybeSingle();
  if (read.error) {
    if (isMissingTable(read.error)) throw INVITATIONS_NOT_LIVE();
    throw UNAVAILABLE();
  }
  const row = asRow(read.data);
  const companyId = text(row, 'company_id');
  const profileId = text(row, 'profile_id');
  if (!row || !companyId || !profileId) throw INVITATION_NOT_FOUND();
  await assertCapability(ctx, 'admin.access.users_access.admin', { companyId });

  // The login to block: the invitation's, else the profile's (read as the caller).
  let userId = text(row, 'user_id');
  if (!userId) {
    const profile = await ctx.userClient.from('profiles').select('user_id').eq('id', profileId).maybeSingle();
    if (profile.error) throw UNAVAILABLE();
    userId = text(asRow(profile.data), 'user_id');
  }
  if (userId && (userId === ctx.user.id || profileId === ctx.profileId)) {
    throw new HttpError(403, 'forbidden', 'You cannot do this to your own account.');
  }
  if (userId) {
    const owner = await ctx.serviceClient().from('account_memberships').select('id').eq('user_id', userId).eq('kind', 'owner').neq('status', 'removed').limit(1);
    if (owner.error && !isMissingTable(owner.error)) throw UNAVAILABLE();
    if (!owner.error && rowsOf(owner.data).length > 0) throw new HttpError(403, 'forbidden', "The account owner's access cannot be changed here.");
  }

  const rpc = await ctx.userClient.rpc('revoke_invitation', { p_invitation_id: invitationId });
  if (rpc.error) {
    const code = errorCode(rpc.error);
    if (code === '42501') throw new HttpError(403, 'forbidden', 'You do not have permission to do that.');
    if (isMissingFunction(rpc.error) || isMissingTable(rpc.error)) throw INVITATIONS_NOT_LIVE();
    if (code === 'P0002') throw INVITATION_NOT_FOUND();
    log('warn', 'revoke_invitation_failed', { code: code || 'none' });
    throw new HttpError(503, 'status_unavailable', 'The invitation could not be revoked. Nothing was changed. Try again.');
  }
  const revoked = asRow(rpc.data);
  if (!revoked || text(revoked, 'status') !== 'revoked') throw INVITATION_NOT_FOUND();
  userId = text(revoked, 'user_id') ?? userId;
  const invitation: Record<string, JsonValue> = {
    id: text(revoked, 'id') ?? invitationId,
    status: 'revoked',
    profileId,
    revokedAt: text(revoked, 'revoked_at'),
  };

  let loginNote: LoginNote | null = null;
  if (!userId) {
    loginNote = 'no_login';
  } else {
    const admin = ctx.serviceClient().auth.admin;
    const found = await admin.getUserById(userId);
    if (found.error) {
      if (isUserNotFound(found.error)) loginNote = 'no_login';
      else log('warn', 'revoke_login_read_failed', { code: errorCode(found.error) || 'none' });
    } else if (text(asRow(found.data?.user), 'last_sign_in_at')) {
      loginNote = 'signed_in_before';
    } else {
      const ban = await admin.updateUserById(userId, { ban_duration: DISABLE_BAN });
      if (ban.error) log('warn', 'revoke_ban_failed', { code: errorCode(ban.error) || 'none' });
      else loginNote = 'banned';
    }
  }
  const loginBlocked = loginNote === 'banned' || loginNote === 'no_login';

  await audit(ctx, {
    action_type: 'RESET_ACCOUNT',
    target_user_id: userId,
    target_crew_id: profileId,
    before_json: { invitation_status: text(row, 'status') },
    after_json: { reset_type: 'revoke_invitation', invitation_id: invitation.id, login_blocked: loginBlocked, login_note: loginNote ?? 'failed' },
    reason,
  });

  if (loginNote === null) {
    const err = new HttpError(502, 'partial_failure', 'The invitation is revoked, but sign-in could not be blocked. Turn off their access, or try again.', {
      revoked: true,
      loginBlocked: false,
    });
    return json({ ...errorBody(err), invitation }, { status: 502 });
  }
  return json({ ok: true, invitation, loginBlocked, loginNote });
}

// ---- toggle_access ----------------------------------------------------------------------------

/**
 * The answer for a `set_membership_status` refusal (`42501` / `22023`). Its
 * message is either a STORM sentence (passed through) or a stable
 * snake_case code (mapped to copy and returned as `details.reason`).
 * Anything else gets the generic sentence: SQL text never reaches a person
 * unless it is one of ours.
 */
function refusal(error: unknown, status: 400 | 403): HttpError {
  const message = stripControls(errorMessage(error)).trim();
  const code = status === 403 ? 'forbidden' : 'invalid_request';
  if (/^[a-z][a-z0-9_]{2,63}$/.test(message)) {
    const copy = REFUSAL_COPY.find(([pattern]) => pattern.test(message))?.[1];
    return new HttpError(status, code, copy ?? (status === 403 ? 'You do not have permission to change this access.' : 'The request has a wrong value.'), { reason: message });
  }
  if (/^[A-Z][A-Za-z0-9 ,.'’()-]{5,200}[.!]$/.test(message)) return new HttpError(status, code, message);
  return new HttpError(status, code, status === 403 ? 'You do not have permission to change this access.' : 'The request has a wrong value.');
}

/**
 * First match wins. The two invitation codes come first: `set_membership_status`
 * refuses turning access on for a withdrawn invitation (`invitation_withdrawn`)
 * and turning it off when the withdrawal already removed it
 * (`membership_removed`); a refusal changes nothing, so the revoke's sign-in
 * block stays.
 */
const REFUSAL_COPY: ReadonlyArray<readonly [RegExp, string]> = [
  [/invitation_withdrawn/, 'Their invitation was withdrawn. Send a new invitation instead.'],
  [/membership_removed/, "This person's access was already withdrawn with their invitation, so there is nothing to turn off. Send a new invitation if they need access again."],
  [/reason/, 'Give a reason for turning access off.'],
  [/owner/, "The account owner's access cannot be changed here."],
  [/last/, 'This is the last administrator who manages administrators. Give someone else that role first.'],
  [/self|own_/, 'You cannot change your own access.'],
  [/manage|admin/, 'Only an administrator who manages administrators can change this access.'],
  [/actor/, 'The request is missing who made the change.'],
  [/status/, 'Choose whether access is on or off.'],
];

/**
 * The legacy W7 guards for databases without `set_membership_status` (D-01):
 * a manager of administrators for an administrator target (the shared
 * `legacyManagesAdmins`; `guardTarget` already asked `assertMayActOnUser`),
 * and never the company's last active DPA.
 */
async function legacyGuards(ctx: AuthContext, target: Target, disable: boolean): Promise<void> {
  if (!ADMIN_ROLES.has(target.role)) return;
  if (!(await legacyManagesAdmins(ctx))) {
    throw new HttpError(403, 'forbidden', 'Only an administrator who manages administrators can change this access.');
  }
  if (disable && target.role === 'dpa') {
    const others = await ctx.serviceClient()
      .from('profiles')
      .select('id, account_status')
      .eq('company_id', target.companyId)
      .eq('role', 'dpa')
      .neq('id', target.profileId);
    if (others.error) throw UNAVAILABLE();
    const active = rowsOf(others.data).filter((r) => !DISABLED.has((text(r, 'account_status') ?? '').toLowerCase()));
    if (active.length === 0) {
      throw new HttpError(403, 'forbidden', 'This is the last administrator who manages administrators. Give someone else that role first.');
    }
  }
}

async function storeStatus(ctx: AuthContext, target: Target, status: 'active' | 'disabled', reason: string | null): Promise<{ stored: boolean; via: 'rpc' | 'legacy' }> {
  const service: SupabaseClient = ctx.serviceClient();
  const rpc = await service.rpc('set_membership_status', { p_user_id: target.userId, p_status: status, p_actor: ctx.user.id, p_reason: reason });
  if (!rpc.error) return { stored: true, via: 'rpc' };
  const code = errorCode(rpc.error);
  if (code === '42501') throw refusal(rpc.error, 403);
  if (code === '22023') throw refusal(rpc.error, 400);
  if (!isMissingFunction(rpc.error)) {
    log('warn', 'toggle_status_failed', { code: code || 'none' });
    return { stored: false, via: 'rpc' };
  }
  // D-01: no membership RPC yet → today's profile column, with the W7 guards in code.
  await legacyGuards(ctx, target, status === 'disabled');
  const upd = await service.from('profiles').update({ account_status: status }).eq('id', target.profileId);
  if (upd.error) {
    log('warn', 'toggle_status_failed', { code: errorCode(upd.error) || 'none', via: 'legacy' });
    return { stored: false, via: 'legacy' };
  }
  return { stored: true, via: 'legacy' };
}

async function toggleAccess(ctx: AuthContext, body: Body, _deps: AdminActionsDeps): Promise<Response> {
  const targetUserId = requiredUuid(body, 'targetUserId');
  const enable = requiredBoolean(body, 'enableAccess');
  const reason = optionalString(body, 'reason', 500);
  if (!enable && !reason) throw new HttpError(400, 'invalid_request', 'Give a reason for turning access off.', { field: 'reason' });
  const target = await loadTarget(ctx, { userId: targetUserId });
  await guardTarget(ctx, target);
  if (!target.userId) throw NOT_FOUND();
  const status = enable ? 'active' : 'disabled';

  const step1 = await storeStatus(ctx, target, status, reason);
  let banApplied = false;
  if (step1.stored) {
    const ban = await ctx.serviceClient().auth.admin.updateUserById(target.userId, { ban_duration: enable ? 'none' : DISABLE_BAN });
    banApplied = !ban.error;
    if (ban.error) log('warn', 'toggle_ban_failed', { code: errorCode(ban.error) || 'none', enable });
  }
  // set_membership_status writes the TOGGLE_ACCESS row itself, so a toggle it
  // stored is logged once: here only when the sign-in block then failed (the
  // partial outcome stays on record). The legacy path and a status step that
  // failed are logged here.
  const loggedBySql = step1.via === 'rpc' && step1.stored;
  if (!loggedBySql || !banApplied) await audit(ctx, {
    action_type: 'TOGGLE_ACCESS',
    target_user_id: target.userId,
    target_crew_id: target.profileId,
    before_json: { account_status: target.status || null },
    after_json: { account_status: step1.stored ? status : target.status || null, status_stored: step1.stored, sign_in_block: banApplied ? (enable ? 'lifted' : 'applied') : 'failed', via: step1.via },
    reason,
  });

  if (step1.stored && banApplied) return json({ ok: true, statusStored: true, banApplied: true, accountStatus: status });
  const message = !step1.stored
    ? 'Nothing was changed. Try again.'
    : enable
    ? 'Access is on in STORM, but sign-in is still blocked. Try again.'
    : 'Access is off in STORM, but sign-in could not be blocked. Try again.';
  const err = new HttpError(502, 'partial_failure', message, { statusStored: step1.stored, banApplied });
  return json(errorBody(err), { status: 502 });
}

// ---- reallocate_vessel ------------------------------------------------------------------------

async function reallocateVessel(ctx: AuthContext, body: Body, deps: AdminActionsDeps): Promise<Response> {
  const targetUserId = requiredUuid(body, 'targetUserId');
  const vesselId = requiredUuid(body, 'vesselId');
  const reason = requiredString(body, 'reason', 500);
  const positionInput = optionalString(body, 'position', 100);
  const effectiveDate = optionalDate(body, 'effectiveDate') ?? deps.now().toISOString().slice(0, 10);
  const endDate = optionalDate(body, 'endDate');
  if (endDate && endDate < effectiveDate) throw new HttpError(400, 'invalid_request', 'The end date must be after the start date.', { field: 'endDate' });

  const target = await loadTarget(ctx, { userId: targetUserId });
  if (!target.userId) throw NOT_FOUND();
  const vesselRes = await ctx.userClient.from('vessels').select('id, company_id, status').eq('id', vesselId).maybeSingle();
  if (vesselRes.error) throw UNAVAILABLE();
  const vessel = asRow(vesselRes.data);
  if (!vessel || text(vessel, 'company_id') !== target.companyId) throw new HttpError(404, 'not_found', 'That vessel was not found.');
  await guardTarget(ctx, target, vesselId);
  if (text(vessel, 'status') === 'Sold') throw new HttpError(409, 'conflict', 'That vessel is archived.', { reason: 'vessel_archived' });

  // The source assignments with the service client (the caller's RLS view may hide one), kept for vessels of the
  // target's company; every source vessel needs the admin capability too (D-198: old and new vessel on a move).
  const service = ctx.serviceClient();
  const currentRes = await service
    .from('crew_assignments')
    .select('id, vessel_id, position, join_date')
    .eq('user_id', target.userId)
    .eq('is_current', true)
    .order('join_date', { ascending: false });
  if (currentRes.error) throw UNAVAILABLE();
  const rows = rowsOf(currentRes.data);
  const vesselIds = [...new Set(rows.map((a) => text(a, 'vessel_id')).filter((v): v is string => v !== null))];
  let ours = new Set<string>();
  if (vesselIds.length > 0) {
    const vesselsRes = await service.from('vessels').select('id, company_id').in('id', vesselIds);
    if (vesselsRes.error) throw UNAVAILABLE();
    ours = new Set(rowsOf(vesselsRes.data).filter((v) => text(v, 'company_id') === target.companyId).map((v) => text(v, 'id') ?? ''));
  }
  const current = rows.filter((a) => ours.has(text(a, 'vessel_id') ?? ''));
  const onDestination = current.find((a) => text(a, 'vessel_id') === vesselId);
  const previous = current.filter((a) => a !== onDestination);
  const sourceVessels = [...new Set(previous.map((a) => text(a, 'vessel_id')).filter((v): v is string => v !== null))];
  if (sourceVessels.length > 0) {
    await assertCapabilityForVessels(ctx, 'admin.access.users_access.admin', target.companyId, sourceVessels);
  }
  if (onDestination && previous.length === 0) {
    throw new HttpError(409, 'conflict', 'This person is already assigned to that vessel.', { reason: 'already_assigned' });
  }
  const position = positionInput ?? text(previous[0] ?? onDestination ?? null, 'position') ?? text(target.row, 'rank') ?? 'Crew';

  // New assignment first, then close the previous ones: a failure never leaves the person on no vessel.
  let assignmentId = text(onDestination ?? null, 'id');
  if (!assignmentId) {
    const ins = await service
      .from('crew_assignments')
      .insert({ user_id: target.userId, vessel_id: vesselId, position, join_date: effectiveDate, end_date: endDate, is_current: true, created_by: ctx.user.id })
      .select('id')
      .single();
    if (ins.error) {
      log('warn', 'reallocate_insert_failed', { code: errorCode(ins.error) || 'none' });
      const err = new HttpError(502, 'partial_failure', 'Nothing was changed. Try again.', { assignmentCreated: false, previousEnded: false });
      return json(errorBody(err), { status: 502 });
    }
    assignmentId = text(asRow(ins.data), 'id');
  }
  let previousEnded = true;
  const previousIds = previous.map((a) => text(a, 'id')).filter((id): id is string => !!id);
  if (previousIds.length > 0) {
    const end = await service.from('crew_assignments').update({ is_current: false, leave_date: effectiveDate }).in('id', previousIds);
    previousEnded = !end.error;
    if (end.error) log('warn', 'reallocate_end_failed', { code: errorCode(end.error) || 'none' });
  }
  const assignment = { id: assignmentId, vesselId, position, effectiveDate, endDate };
  await audit(ctx, {
    action_type: 'REALLOCATE_VESSEL',
    target_user_id: target.userId,
    target_crew_id: target.profileId,
    before_json: { vessel_ids: sourceVessels },
    after_json: { vessel_id: vesselId, position, effective_date: effectiveDate, end_date: endDate, previous_ended: previousEnded },
    reason,
  });
  if (!previousEnded) {
    const err = new HttpError(502, 'partial_failure', 'The new assignment was saved, but the previous one could not be closed. Try again.', {
      assignmentCreated: true,
      previousEnded: false,
    });
    return json({ ...errorBody(err), assignment }, { status: 502 });
  }
  return json({ ok: true, assignment });
}

// ---- entry ------------------------------------------------------------------------------------

export function createHandler(patch: Partial<AdminActionsDeps> = {}): Handler {
  const base = edgeDeps(patch);
  const deps: AdminActionsDeps = {
    ...base,
    invite: patch.invite ?? {},
    sendEmail: patch.sendEmail ?? ((message, env) => sendEmail(message, env)),
    now: patch.now ?? (() => new Date()),
    limiter: patch.limiter ?? new RateLimiter({ limit: 30, windowMs: 60_000 }),
    pinLimiter: patch.pinLimiter ?? new RateLimiter({ limit: 10, windowMs: 5 * 60_000 }),
    resetLimiter: patch.resetLimiter ?? new RateLimiter({ limit: 1, windowMs: RESET_COOLDOWN_MS }),
  };

  return withHttp(
    async (req) => {
      const env = deps.env();
      const ctx = await getAuthContext(req, { env, createClient: deps.createClient });
      deps.limiter.enforce(`admin-actions:${ctx.user.id}`);
      const body = await readJson(req, objectBody);
      const action = requiredString(body, 'action', 40);
      switch (action) {
        case 'set_pin':
          return setPin(ctx, body, deps);
        case 'verify_pin':
          return verifyPinAction(ctx, body, deps);
        case 'reset_account':
          return resetAccount(ctx, body, deps);
        case 'toggle_access':
          return toggleAccess(ctx, body, deps);
        case 'reallocate_vessel':
          return reallocateVessel(ctx, body, deps);
        case 'revoke_invitation':
          return revokeInvitation(ctx, body, deps);
        default:
          throw new HttpError(400, 'invalid_request', 'Unknown action.', { field: 'action' });
      }
    },
    { allowedOrigins: originsOf(deps), name: 'admin-actions' },
  );
}
