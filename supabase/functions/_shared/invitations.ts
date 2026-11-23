/**
 * The one invitation path (Phase 2 spec §C.3; gap/01 F46, W2; proposed
 * D-121, D-125). Used by `send-invitation`, `bulk-invite` and the
 * `admin-actions` resend. Replaces `invite-helpers.ts`, which created the
 * auth user, ignored a failed `inviteUserByEmail`, scanned only the first
 * 200 auth users and stamped the profile `invited` even when nothing was
 * sent.
 *
 * For one profile, in order (nothing is sent or stamped before step 9):
 * 1. `STORM_SITE_URL` must be set (500 `server_misconfigured`); links land on
 *    `${STORM_SITE_URL}/reset-password?flow=invite`; a client `redirectTo`
 *    is never used.
 * 2. Target read with the caller's RLS client: not visible → 404
 *    `not_found` (no cross-tenant probing).
 * 3. `assertCapability('admin.access.users_access.assign', { companyId:
 *    target company, vesselId: current assignment vessel, else
 *    imported_vessel_id })` → 403 `cross_company` / `forbidden`.
 * 4. Email present, a real inbox (`isFakeEmail`, injectable) → else 400
 *    `invalid_request`; access disabled → 409 `conflict`.
 * 5. With the service client (capability passed): an existing, confirmed
 *    login whose profile is `active` → 409 `already_active`.
 * 6. Reserve the attempt before any link exists: the service-role
 *    `reserve_invitation_attempt()` locks the live invitation row, applies
 *    the cooldown under that lock (5 minutes from the last successful send,
 *    30 seconds from a failed attempt, so Retry after a failed send works
 *    almost at once) and returns the attempt number → 429 `cooldown` (with
 *    `Retry-After`), 404 `not_found`, 409 `conflict` (disabled; `reason:
 *    counter_exhausted` when the attempt number would pass the integer
 *    range). Two concurrent requests: one reserves, the other gets 429 and
 *    makes no link. D-01 (RPC or table missing): the same cooldown computed
 *    here from the live row (when the table exists) and the profile's
 *    `last_invited_at`, and the attempt from `max(send_attempts,
 *    invitation_count) + 1` (past 2147483647 → the same 409).
 * 7. A revoked invitee's login was banned (admin-actions `revoke_invitation`):
 *    for a `not_invited` / `invited` profile whose login is banned, the ban is
 *    lifted first. If that fails, the attempt is an honest `link_failed`
 *    send failure and no email goes out. Never for a disabled, deactivated
 *    or active profile.
 * 8. Auth user: none → `generateLink('invite')` (creates the user); an
 *    existing unconfirmed one (the profile's `user_id`, the service-role
 *    `auth_user_id_for_email()`, or `generateLink`'s "already registered")
 *    → `generateLink('magiclink')`. An email that belongs to another
 *    person's login → 409 `conflict` (the lookup runs before step 6, so a
 *    refusal reserves nothing).
 * 9. `sendEmail(CREW_INVITATION)` with idempotency key
 *    `invite:<profileId>:<attempt>:<h16>` (`payloadTag` of the action link:
 *    one key, one payload; D-146 as amended).
 * 10. `record_invitation_send()` (service role) stores the honest outcome
 *    and links `user_id`; when the RPC is missing (D-01) the legacy profile
 *    columns are updated **only after a successful send** and the answer
 *    says `stored: false`.
 * 11. The vessel of an imported profile (D-199): when the profile has
 *    `is_imported` and `imported_vessel_id`, step 2 found no current
 *    assignment, and a login is now linked to the profile (its own, or the
 *    one step 10 linked), the service-role `fulfil_imported_assignment()`
 *    writes the current `crew_assignments` row (`created` / `exists` →
 *    `created`; `none` → the row is looked up, since `record_invitation_send`
 *    may already have written it; `not_eligible` → `failed`). D-01 (RPC
 *    missing): the login's current assignments are looked up (service
 *    client); one on another vessel → `failed`; else the vessel must be the
 *    target company's and not Sold, and the edge inserts it with the service client
 *    (position, else rank, else Crew; `joining_date`, else today), then clears
 *    `is_imported` / `imported_vessel_id`. This runs only after step 3
 *    passed. The answer carries `assignment: 'created' | 'failed'` only in
 *    that case; a D-01 send that failed links no login, so it has none.
 */
import type { AuthContext } from './auth.ts';
import { assertCapability } from './capability.ts';
import { asRow, bool, errorCode, errorMessage, int, isMissingFunction, isMissingTable, rowsOf, text, timeOf, type Row } from './db.ts';
import { type EmailErrorCode, type EmailMessage, type EmailResult, isValidRecipient, payloadTag, sendEmail } from './email.ts';
import { type EdgeEnv, linkLanding } from './env.ts';
import { errorBody, HttpError, json, type JsonValue } from './http.ts';
import { log } from './log.ts';

export const INVITE_COOLDOWN_MS = 5 * 60 * 1000;
/** After a failed send (nothing was delivered) a retry waits only this long. */
export const INVITE_RETRY_COOLDOWN_MS = 30 * 1000;
export const BULK_INVITE_MAX = 50;

/** Why an invitation email was not sent: the email error, or the auth link could not be made. */
export type InviteFailureCode = EmailErrorCode | 'link_failed';

/** What step 11 did with an imported profile's vessel once a login was linked (D-199). */
export type AssignmentResult = 'created' | 'failed';

export type InviteOutcome =
  | { status: 'sent'; profileId: string; invitationId: string | null; stored: boolean; assignment?: AssignmentResult }
  | { status: 'send_failed'; profileId: string; invitationId: string | null; stored: boolean; emailError: InviteFailureCode; assignment?: AssignmentResult }
  | { status: 'refused'; profileId: string; error: HttpError };

export interface InviteDeps {
  /** Placeholder / disposable address check (tests inject one that admits `example.test` role addresses). */
  isFakeEmail: (email: string) => boolean;
  sendEmail: (message: EmailMessage, env: EdgeEnv) => Promise<EmailResult>;
  now: () => Date;
}

const BLOCKED_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net',
  'test.com', 'test.local', 'localhost',
  'mailinator.com', 'tempmail.com', 'temp-mail.org',
  'guerrillamail.com', 'yopmail.com', 'sharklasers.com',
  'fakeinbox.com', 'trashmail.com', 'dispostable.com',
]);

/** True for placeholder, reserved or disposable addresses that can never be a real person's inbox (kept from invite-helpers). */
export function isFakeEmail(email: string): boolean {
  const normalized = (email ?? '').trim().toLowerCase();
  const domain = normalized.split('@')[1] ?? '';
  if (!domain) return true;
  if (BLOCKED_DOMAINS.has(domain)) return true;
  if (domain.endsWith('.test') || domain.endsWith('.example') || domain.endsWith('.invalid') || domain.endsWith('.localhost')) {
    return true;
  }
  if (/^test[.\-_]?crew@/i.test(normalized)) return true;
  return false;
}

export const defaultInviteDeps: InviteDeps = {
  isFakeEmail,
  sendEmail: (message, env) => sendEmail(message, env),
  now: () => new Date(),
};

const LIVE_STATUSES = ['pending', 'sent', 'send_failed'];
const ADMIN_ROLES = new Set(['dpa', 'shore_management']);
const DISABLED = new Set(['disabled', 'deactivated']);
/** Profiles whose banned login may be unbanned by a new invitation (a revoked invitee). */
const REINVITABLE = new Set(['not_invited', 'invited']);

const UNAVAILABLE = (): HttpError => new HttpError(503, 'status_unavailable', 'The invitation could not be checked. Try again.');
const ACCESS_DISABLED = (): HttpError =>
  new HttpError(409, 'conflict', "This person's access is disabled. Turn access on before sending an invitation.", { reason: 'access_disabled' });
/** The largest attempt number the database stores (`integer`). */
export const MAX_INVITE_ATTEMPT = 2147483647;
const COUNTER_EXHAUSTED = (): HttpError =>
  new HttpError(409, 'conflict', 'STORM cannot send this person another invitation. Contact STORM support.', { reason: 'counter_exhausted' });

function cooldownError(seconds: number): HttpError {
  const wait = Math.max(1, Math.ceil(seconds));
  return new HttpError(429, 'cooldown', 'An invitation was sent a moment ago. Wait a few minutes before sending another.', { retry_after_seconds: wait }, {
    'Retry-After': String(wait),
  });
}

function confirmed(user: Row | null): boolean {
  return !!(text(user, 'email_confirmed_at') ?? text(user, 'confirmed_at'));
}

function isAlreadyRegistered(error: unknown): boolean {
  const code = errorCode(error);
  return code === 'email_exists' || code === 'user_already_exists' || /already (been )?registered|already exists/i.test(errorMessage(error));
}

function isUserNotFound(error: unknown): boolean {
  const code = errorCode(error);
  const status = error && typeof error === 'object' ? (error as { status?: unknown }).status : undefined;
  return code === 'user_not_found' || status === 404;
}

/** The legacy `userId` request field: the caller's RLS view of profiles resolves it (404 when not visible). */
export async function resolveProfileIdByUserId(ctx: AuthContext, userId: string): Promise<string> {
  const res = await ctx.userClient.from('profiles').select('id').eq('user_id', userId).maybeSingle();
  if (res.error) throw UNAVAILABLE();
  const id = text(asRow(res.data), 'id');
  if (!id) throw new HttpError(404, 'not_found', 'That person was not found.');
  return id;
}

interface Target {
  row: Row;
  profileId: string;
  userId: string | null;
  companyId: string | null;
  email: string | null;
  status: string;
  /** The capability scope: the current assignment's vessel, else `imported_vessel_id`. */
  vesselId: string | null;
  /** True when the linked login has a current assignment (step 11 never runs then). */
  assigned: boolean;
  /** `imported_vessel_id` of an imported profile (`is_imported`): the vessel waiting for a login. */
  pendingVesselId: string | null;
}

async function readTarget(ctx: AuthContext, profileId: string): Promise<Target> {
  const res = await ctx.userClient
    .from('profiles')
    .select(
      'id, user_id, email, first_name, company_id, account_status, role, last_invited_at, invitation_count, invited_at, imported_vessel_id, is_imported, position, rank, joining_date',
    )
    .eq('id', profileId)
    .maybeSingle();
  if (res.error) throw UNAVAILABLE();
  const row = asRow(res.data);
  if (!row) throw new HttpError(404, 'not_found', 'That person was not found.');
  const userId = text(row, 'user_id');
  let vesselId: string | null = null;
  if (userId) {
    const a = await ctx.userClient
      .from('crew_assignments')
      .select('vessel_id, join_date')
      .eq('user_id', userId)
      .eq('is_current', true)
      .order('join_date', { ascending: false })
      .limit(1);
    if (a.error) throw UNAVAILABLE();
    vesselId = text(rowsOf(a.data)[0] ?? null, 'vessel_id');
  }
  const importedVesselId = text(row, 'imported_vessel_id');
  return {
    row,
    profileId,
    userId,
    companyId: text(row, 'company_id'),
    email: text(row, 'email')?.trim() ?? null,
    status: (text(row, 'account_status') ?? '').toLowerCase(),
    vesselId: vesselId ?? importedVesselId,
    assigned: vesselId !== null,
    pendingVesselId: bool(row, 'is_imported') === true ? importedVesselId : null,
  };
}

/** Another profile already linked to `userId` (an email that belongs to someone else's login). */
async function linkedElsewhere(ctx: AuthContext, userId: string, profileId: string): Promise<boolean> {
  const res = await ctx.serviceClient().from('profiles').select('id').eq('user_id', userId).neq('id', profileId).limit(1);
  if (res.error) throw UNAVAILABLE();
  return rowsOf(res.data).length > 0;
}

const EMAIL_TAKEN = (): HttpError =>
  new HttpError(409, 'conflict', 'This email address already belongs to another STORM login. Check the email address.');

interface Link {
  ok: true;
  actionLink: string;
  userId: string | null;
}

/**
 * The login this invitation is for, when one exists: the profile's, else the
 * service-role `auth_user_id_for_email()` (D-01: missing → unknown). An
 * address that belongs to another person's login is refused here, before an
 * attempt is reserved.
 */
async function knownLogin(ctx: AuthContext, target: Target, email: string): Promise<string | null> {
  if (target.userId) return target.userId;
  const lookup = await ctx.serviceClient().rpc('auth_user_id_for_email', { p_email: email });
  if (lookup.error) {
    if (!isMissingFunction(lookup.error)) throw UNAVAILABLE();
    return null;
  }
  if (typeof lookup.data !== 'string' || !lookup.data) return null;
  if (await linkedElsewhere(ctx, lookup.data, target.profileId)) throw EMAIL_TAKEN();
  return lookup.data;
}

async function generateInviteLink(ctx: AuthContext, target: Target, email: string, landing: string, knownUserId: string | null): Promise<Link | { ok: false }> {
  const admin = ctx.serviceClient().auth.admin;
  let type: 'invite' | 'magiclink' = knownUserId ? 'magiclink' : 'invite';
  let res = await admin.generateLink({ type, email, options: { redirectTo: landing } });
  if (res.error && type === 'invite' && isAlreadyRegistered(res.error)) {
    type = 'magiclink';
    res = await admin.generateLink({ type, email, options: { redirectTo: landing } });
  }
  if (res.error || !res.data?.properties?.action_link) {
    log('warn', 'invite_link_failed', { profile_id: target.profileId, link_type: type, code: errorCode(res.error) || 'none' });
    return { ok: false };
  }
  const linkUserId = typeof res.data.user?.id === 'string' ? res.data.user.id : null;
  if (target.userId && linkUserId && linkUserId !== target.userId) throw EMAIL_TAKEN();
  if (!target.userId && linkUserId && linkUserId !== knownUserId && (await linkedElsewhere(ctx, linkUserId, target.profileId))) {
    throw EMAIL_TAKEN();
  }
  return { ok: true, actionLink: res.data.properties.action_link, userId: linkUserId ?? knownUserId };
}

async function bestEffortName(ctx: AuthContext, table: 'companies' | 'vessels', id: string | null): Promise<string | undefined> {
  if (!id) return undefined;
  try {
    const res = await ctx.userClient.from(table).select('name').eq('id', id).maybeSingle();
    return res.error ? undefined : text(asRow(res.data), 'name') ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Legacy profile columns, only after a successful send (D-01 branch, or when
 * the record RPC failed). True when the update was stored (so `user_id` is
 * linked when it was missing).
 */
async function stampLegacyProfile(ctx: AuthContext, target: Target, linkUserId: string | null, now: Date): Promise<boolean> {
  const at = now.toISOString();
  const patch: Record<string, string | number> = {
    last_invited_at: at,
    invited_at: text(target.row, 'invited_at') ?? at,
    invitation_count: (int(target.row, 'invitation_count') ?? 0) + 1,
    updated_at: at,
  };
  if (target.status !== 'active' && !DISABLED.has(target.status)) patch.account_status = 'invited';
  if (!target.userId && linkUserId) patch.user_id = linkUserId;
  const res = await ctx.serviceClient().from('profiles').update(patch).eq('id', target.profileId);
  if (res.error) log('warn', 'invite_legacy_stamp_failed', { profile_id: target.profileId, code: errorCode(res.error) || 'none' });
  return !res.error;
}

function bannedNow(user: Row | null, now: Date): boolean {
  const until = timeOf(user, 'banned_until');
  return until !== null && until > now.getTime();
}

interface Reservation {
  attempt: number;
  invitationId: string | null;
  /** True when `reserve_invitation_attempt()` answered (the cooldown ran under its lock). */
  reserved: boolean;
}

/**
 * Step 6: the attempt number, reserved before any link is generated. Refusals
 * throw (429 cooldown, 404, 409); a database without the reservation RPC
 * (D-01) gets the same cooldown computed here.
 */
async function reserveAttempt(ctx: AuthContext, target: Target, kind: string, now: Date): Promise<Reservation> {
  const service = ctx.serviceClient();
  const res = await service.rpc('reserve_invitation_attempt', { p_profile_id: target.profileId, p_invited_by: ctx.user.id, p_kind: kind });
  if (!res.error) {
    const row = asRow(res.data);
    if (row?.ok === true) {
      const attempt = int(row, 'attempt');
      if (attempt === null || attempt < 1) throw UNAVAILABLE();
      return { attempt, invitationId: text(row, 'invitation_id'), reserved: true };
    }
    switch (text(row, 'code')) {
      case 'cooldown':
        throw cooldownError(int(row, 'retry_after_seconds') ?? INVITE_COOLDOWN_MS / 1000);
      case 'not_found':
        throw new HttpError(404, 'not_found', 'That person was not found.');
      case 'disabled':
        throw ACCESS_DISABLED();
      case 'counter_exhausted':
        throw COUNTER_EXHAUSTED();
      default:
        throw UNAVAILABLE();
    }
  }
  if (!isMissingFunction(res.error) && !isMissingTable(res.error)) {
    log('warn', 'invite_reserve_failed', { profile_id: target.profileId, code: errorCode(res.error) || 'none' });
    throw UNAVAILABLE();
  }

  // D-01: 5 minutes from the latest successful send (live invitation or the
  // legacy stamp), 30 seconds from a failed attempt, whichever ends later.
  const live = await service
    .from('user_invitations')
    .select('id, status, send_attempts, last_attempt_at, last_sent_at')
    .eq('profile_id', target.profileId)
    .in('status', LIVE_STATUSES)
    .maybeSingle();
  let liveRow: Row | null = null;
  if (live.error) {
    if (!isMissingTable(live.error)) throw UNAVAILABLE();
  } else {
    liveRow = asRow(live.data);
  }
  const lastSent = Math.max(timeOf(liveRow, 'last_sent_at') ?? 0, timeOf(target.row, 'last_invited_at') ?? 0);
  const lastAttempt = timeOf(liveRow, 'last_attempt_at') ?? 0;
  const attemptCooldown = text(liveRow, 'status') === 'send_failed' ? INVITE_RETRY_COOLDOWN_MS : INVITE_COOLDOWN_MS;
  const until = Math.max(lastSent > 0 ? lastSent + INVITE_COOLDOWN_MS : 0, lastAttempt > 0 ? lastAttempt + attemptCooldown : 0);
  if (until > now.getTime()) throw cooldownError((until - now.getTime()) / 1000);
  // The attempt does not move after a failed send here; the payload tag in the key keeps it unique per link.
  const attempt = Math.max(int(liveRow, 'send_attempts') ?? 0, int(target.row, 'invitation_count') ?? 0) + 1;
  if (attempt > MAX_INVITE_ATTEMPT) throw COUNTER_EXHAUSTED();
  return { attempt, invitationId: text(liveRow, 'id'), reserved: false };
}

/**
 * The vessels of `userId`'s current assignments (service client: the caller's
 * RLS view in step 2 may not see all of them), or null when they could not
 * be read.
 */
async function currentVessels(ctx: AuthContext, userId: string): Promise<string[] | null> {
  const res = await ctx.serviceClient().from('crew_assignments').select('vessel_id').eq('user_id', userId).eq('is_current', true).limit(50);
  if (res.error) return null;
  return rowsOf(res.data).map((r) => text(r, 'vessel_id')).filter((v): v is string => v !== null);
}

/** A text column with something in it (trimmed), else null: a blank position counts as missing, as in SQL. */
function filled(row: Row | null, key: string): string | null {
  const value = text(row, key)?.trim();
  return value ? value : null;
}

function assignmentFailed(profileId: string, code: string): AssignmentResult {
  log('warn', 'invite_assignment_failed', { profile_id: profileId, code });
  return 'failed';
}

/**
 * Step 11 (D-199). The caller passed `assertCapability` for this target in
 * step 3; `userId` is the login now linked to the profile.
 */
async function fulfilAssignment(ctx: AuthContext, target: Target, vesselId: string, userId: string, now: Date): Promise<AssignmentResult> {
  const service = ctx.serviceClient();
  const rpc = await service.rpc('fulfil_imported_assignment', { p_profile_id: target.profileId, p_actor: ctx.user.id });
  if (!rpc.error) {
    switch (rpc.data) {
      case 'created':
      case 'exists':
        return 'created';
      case 'none': {
        // Nothing left to do: record_invitation_send (or the link trigger) may already have written it.
        const vessels = await currentVessels(ctx, userId);
        if (vessels === null) return assignmentFailed(target.profileId, 'verify_failed');
        return vessels.includes(vesselId) ? 'created' : assignmentFailed(target.profileId, 'none');
      }
      case 'not_eligible':
        return assignmentFailed(target.profileId, 'not_eligible');
      default:
        return assignmentFailed(target.profileId, 'unexpected_answer');
    }
  }
  if (!isMissingFunction(rpc.error)) return assignmentFailed(target.profileId, errorCode(rpc.error) || 'none');

  // D-01: the function is not in the database yet. The same rule, with the service client: never for
  // someone already on another vessel, and only for a vessel of the target's company that is not Sold.
  const vessels = await currentVessels(ctx, userId);
  if (vessels === null) return assignmentFailed(target.profileId, 'verify_failed');
  if (!vessels.includes(vesselId)) {
    if (vessels.length > 0) return assignmentFailed(target.profileId, 'already_assigned');
    const vessel = await service.from('vessels').select('id, company_id, status').eq('id', vesselId).maybeSingle();
    if (vessel.error) return assignmentFailed(target.profileId, errorCode(vessel.error) || 'none');
    const row = asRow(vessel.data);
    if (!row || !target.companyId || text(row, 'company_id') !== target.companyId || text(row, 'status') === 'Sold') {
      return assignmentFailed(target.profileId, 'not_eligible');
    }
    const insert = await service.from('crew_assignments').insert({
      user_id: userId,
      vessel_id: vesselId,
      position: filled(target.row, 'position') ?? filled(target.row, 'rank') ?? 'Crew',
      join_date: text(target.row, 'joining_date') ?? now.toISOString().slice(0, 10),
      is_current: true,
      created_by: ctx.user.id,
    });
    if (insert.error) return assignmentFailed(target.profileId, errorCode(insert.error) || 'none');
  }
  // The vessel is on crew_assignments now: the profile is no longer waiting for a login.
  const clear = await service
    .from('profiles')
    .update({ is_imported: false, imported_vessel_id: null })
    .eq('id', target.profileId)
    .eq('imported_vessel_id', vesselId);
  if (clear.error) log('warn', 'invite_import_flags_failed', { profile_id: target.profileId, code: errorCode(clear.error) || 'none' });
  return 'created';
}

async function runInvite(ctx: AuthContext, profileId: string, deps: InviteDeps): Promise<InviteOutcome> {
  const landing = linkLanding(ctx.env, 'invite');
  const target = await readTarget(ctx, profileId);
  await assertCapability(ctx, 'admin.access.users_access.assign', { companyId: target.companyId, vesselId: target.vesselId });

  const email = target.email;
  if (!email) {
    throw new HttpError(400, 'invalid_request', 'This person has no email address. Add one, then send the invitation.', { reason: 'missing_email' });
  }
  if (!isValidRecipient(email) || deps.isFakeEmail(email)) {
    throw new HttpError(400, 'invalid_request', 'Only a real inbox can be invited. Fix the email address and try again.', { reason: 'placeholder_email' });
  }
  if (DISABLED.has(target.status)) throw ACCESS_DISABLED();

  const service = ctx.serviceClient();
  let authUser: Row | null = null;
  if (target.userId) {
    const existing = await service.auth.admin.getUserById(target.userId);
    if (existing.error) {
      if (isUserNotFound(existing.error)) {
        throw new HttpError(409, 'conflict', "This person's login could not be found. Contact STORM support.", { reason: 'login_missing' });
      }
      throw UNAVAILABLE();
    }
    authUser = asRow(existing.data?.user);
    if (target.status === 'active' && confirmed(authUser)) {
      throw new HttpError(409, 'already_active', 'This person has already joined STORM. Send a password reset instead.');
    }
    // A link for another address would create a second login: refuse before any link is made.
    const loginEmail = text(authUser, 'email');
    if (loginEmail && loginEmail.trim().toLowerCase() !== email.toLowerCase()) {
      throw new HttpError(409, 'conflict', "The email on this profile does not match the person's login. Contact STORM support.", {
        reason: 'login_email_mismatch',
      });
    }
  }

  const knownUserId = await knownLogin(ctx, target, email);
  const kind = ADMIN_ROLES.has((text(target.row, 'role') ?? '').toLowerCase()) ? 'admin' : 'crew';
  const now = deps.now();
  const reservation = await reserveAttempt(ctx, target, kind, now);

  // A revoked invitee's login is banned: lift the ban for the new invitation, or fail honestly before any link.
  let banLifted = true;
  if (authUser && target.userId && REINVITABLE.has(target.status) && bannedNow(authUser, now)) {
    const lift = await service.auth.admin.updateUserById(target.userId, { ban_duration: 'none' });
    banLifted = !lift.error;
    if (lift.error) log('warn', 'invite_unban_failed', { profile_id: profileId, code: errorCode(lift.error) || 'none' });
  }

  const link = banLifted ? await generateInviteLink(ctx, target, email, landing, knownUserId) : ({ ok: false } as const);
  let result: EmailResult | { ok: false; errorCode: 'link_failed' };
  let linkUserId: string | null = null;
  if (link.ok) {
    linkUserId = link.userId;
    const attempt = reservation.attempt;
    const variables: Record<string, string> = { action_link: link.actionLink };
    const firstName = text(target.row, 'first_name');
    if (firstName) variables.first_name = firstName;
    const company = await bestEffortName(ctx, 'companies', target.companyId);
    if (company) variables.company_name = company;
    const vessel = await bestEffortName(ctx, 'vessels', target.vesselId);
    if (vessel) variables.vessel_name = vessel;
    const idempotencyKey = `invite:${profileId}:${attempt}:${await payloadTag(link.actionLink)}`;
    result = await deps.sendEmail({ to: email, template: 'CREW_INVITATION', variables, idempotencyKey }, ctx.env);
  } else {
    result = { ok: false, errorCode: 'link_failed' };
  }

  const outcome = result.ok ? 'sent' : 'send_failed';
  const record = await service.rpc('record_invitation_send', {
    p_profile_id: profileId,
    p_outcome: outcome,
    p_error_code: result.ok ? null : result.errorCode,
    p_provider_message_id: result.ok ? result.providerMessageId : null,
    p_invited_by: ctx.user.id,
    p_kind: kind,
    p_expires_at: null,
    p_user_id: linkUserId,
  });
  let stored = false;
  let invitationId: string | null = reservation.invitationId;
  /** The profile now carries `linkUserId` (the record RPC links it; the legacy stamp only after a successful send). */
  let linkStored = false;
  if (record.error) {
    if (!isMissingFunction(record.error)) {
      log('warn', 'invite_record_failed', { profile_id: profileId, outcome, code: errorCode(record.error) || 'none' });
    }
    if (result.ok) linkStored = await stampLegacyProfile(ctx, target, linkUserId, now);
  } else {
    stored = true;
    linkStored = true;
    invitationId = text(asRow(record.data), 'id') ?? invitationId;
  }

  // Step 11: the imported vessel becomes an assignment once a login is linked (capability checked in step 3).
  const linked = target.userId ?? (linkStored ? linkUserId : null);
  let assignment: AssignmentResult | undefined;
  if (target.pendingVesselId && !target.assigned && linked) {
    assignment = await fulfilAssignment(ctx, target, target.pendingVesselId, linked, now);
  }

  log('info', 'invite_attempt', {
    profile_id: profileId,
    outcome,
    stored,
    reserved: reservation.reserved,
    code: result.ok ? null : result.errorCode,
    assignment: assignment ?? null,
  });
  const extra = assignment ? { assignment } : {};
  if (result.ok) return { status: 'sent', profileId, invitationId, stored, ...extra };
  return { status: 'send_failed', profileId, invitationId, stored, emailError: result.errorCode, ...extra };
}

/**
 * Invite one profile. Rule refusals and check failures come back as
 * `refused` with the `HttpError` (status and code); only the email result
 * decides `sent` vs `send_failed`.
 */
export async function inviteProfile(ctx: AuthContext, profileId: string, deps: Partial<InviteDeps> = {}): Promise<InviteOutcome> {
  try {
    return await runInvite(ctx, profileId, { ...defaultInviteDeps, ...deps });
  } catch (err) {
    if (err instanceof HttpError) return { status: 'refused', profileId, error: err };
    log('error', 'invite_unexpected', { profile_id: profileId, kind: err instanceof Error ? err.name : typeof err });
    return { status: 'refused', profileId, error: new HttpError(500, 'internal_error', 'Something went wrong. Try again.') };
  }
}

/**
 * The single-invite response (spec §C.3): 200 sent, 502 send_failed (with the
 * invitation), or the refusal. Both 200 and 502 carry a top-level
 * `assignment: 'created' | 'failed'` when step 11 ran.
 */
export function invitationResponse(outcome: InviteOutcome): Response {
  if (outcome.status === 'sent') {
    const extra = outcome.assignment ? { assignment: outcome.assignment } : {};
    return json({ ok: true, invitation: { status: 'sent', stored: outcome.stored, id: outcome.invitationId }, ...extra });
  }
  if (outcome.status === 'send_failed') {
    const err = new HttpError(502, 'send_failed', 'The invitation email could not be sent.', { email_error: outcome.emailError });
    const extra = outcome.assignment ? { assignment: outcome.assignment } : {};
    return json(
      { ...errorBody(err), invitation: { status: 'send_failed', stored: outcome.stored, id: outcome.invitationId }, ...extra },
      { status: 502 },
    );
  }
  return json(errorBody(outcome.error), { status: outcome.error.status, headers: outcome.error.headers });
}

export type BulkInviteRow = {
  profileId: string;
  status: 'sent' | 'send_failed' | 'refused';
  stored: boolean;
  invitationId: string | null;
  code?: string;
  emailError?: InviteFailureCode;
  reason?: string;
  /** Step 11's result, when it ran (`sent` and `send_failed` rows only). */
  assignment?: AssignmentResult;
};

/**
 * One bulk result row: `sent`; `send_failed` when the email (or the link)
 * failed or the server could not finish (5xx, `code` says which); `refused`
 * for a rule (4xx: not found, permission, cooldown, already active, bad
 * address).
 */
export function bulkRow(outcome: InviteOutcome): BulkInviteRow {
  if (outcome.status === 'sent') {
    const row: BulkInviteRow = { profileId: outcome.profileId, status: 'sent', stored: outcome.stored, invitationId: outcome.invitationId };
    if (outcome.assignment) row.assignment = outcome.assignment;
    return row;
  }
  if (outcome.status === 'send_failed') {
    const row: BulkInviteRow = {
      profileId: outcome.profileId,
      status: 'send_failed',
      code: 'send_failed',
      emailError: outcome.emailError,
      stored: outcome.stored,
      invitationId: outcome.invitationId,
    };
    if (outcome.assignment) row.assignment = outcome.assignment;
    return row;
  }
  const reason = outcome.error.details?.reason;
  const row: BulkInviteRow = {
    profileId: outcome.profileId,
    status: outcome.error.status >= 500 ? 'send_failed' : 'refused',
    code: outcome.error.code,
    stored: false,
    invitationId: null,
  };
  if (typeof reason === 'string') row.reason = reason;
  return row;
}

export function bulkSummary(rows: BulkInviteRow[]): { ok: true; results: BulkInviteRow[]; sent: number; failed: number; refused: number } {
  return {
    ok: true,
    results: rows,
    sent: rows.filter((r) => r.status === 'sent').length,
    failed: rows.filter((r) => r.status === 'send_failed').length,
    refused: rows.filter((r) => r.status === 'refused').length,
  };
}

/** For callers that need the outcome as JSON details (e.g. admin-actions logging). */
export function outcomeDetails(outcome: InviteOutcome): Record<string, JsonValue> {
  if (outcome.status === 'refused') return { outcome: 'refused', code: outcome.error.code };
  const details: Record<string, JsonValue> = outcome.status === 'send_failed'
    ? { outcome: 'send_failed', code: outcome.emailError, stored: outcome.stored }
    : { outcome: 'sent', stored: outcome.stored };
  if (outcome.assignment) details.assignment = outcome.assignment;
  return details;
}
