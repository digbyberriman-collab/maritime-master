/**
 * The one invitation path (Phase 2 spec §C.3; gap/01 F46, W2; proposed
 * D-121, D-125, D-204, D-205, D-207, D-208). Used by `send-invitation`,
 * `bulk-invite` and the `admin-actions` resend. Replaces `invite-helpers.ts`,
 * which created the auth user, ignored a failed `inviteUserByEmail`, scanned
 * only the first 200 auth users and stamped the profile `invited` even when
 * nothing was sent.
 *
 * For one profile, in order (nothing is sent or stamped before step 9):
 * 1. `STORM_SITE_URL` must be set (500 `server_misconfigured`); links land on
 *    `${STORM_SITE_URL}/reset-password?flow=invite`; a client `redirectTo`
 *    is never used.
 * 2. Target read: the profile with the caller's RLS client (not visible →
 *    404 `not_found`: no cross-tenant probing); then, with the service
 *    client (the caller's view may hide them), every current
 *    `crew_assignments` row of its login, kept only for vessels of the
 *    target's company. The structural vessels are those, else, for a
 *    profile without a login that `is_imported`, its `imported_vessel_id`
 *    (D-204: the imported vessel counts only without a login). The email
 *    names the first one.
 * 3. `assertCapability('admin.access.users_access.assign', { companyId,
 *    vesselId })` for EVERY structural vessel (all must pass; with none,
 *    once without a vessel) → 403 `cross_company` / `forbidden` (`reason:
 *    out_of_reach` for a vessel-scoped administrator), then
 *    `assertMayActOnUser` (D-194 / D-207: `admin_may_act_on_user`, and a
 *    manager of administrators for an administrator, kind from the role) →
 *    403 `out_of_reach` / `manages_admins_required`. A refusal reserves
 *    nothing.
 * 4. Email present, a real inbox (`isFakeEmail`, injectable) → else 400
 *    `invalid_request`; access disabled → 409 `conflict`.
 * 5. With the service client: an existing, confirmed login whose profile is
 *    `active` → 409 `already_active`; a login whose email differs → 409
 *    `login_email_mismatch`.
 * 6. The login (D-205), decided before any link: the profile's own; else
 *    the service-role `auth_user_id_for_email()` (D-01 missing: none). A
 *    login linked to another profile → 409 `conflict`. Otherwise the
 *    service-role `invitation_login_state()` says what it is:
 *    `storm_invited` → adopted (magic link); `unused_orphan` (never
 *    confirmed, never signed in) → removed with `auth.admin.deleteUser`
 *    right before the link (step 8) and a fresh login invited;
 *    `linked_elsewhere` → 409 `conflict`; anything else → 409 `conflict`
 *    `reason: login_not_created_by_storm`, nothing reserved, linked or sent.
 *    D-01 (function missing): `getUserById` and the same rule in code (a
 *    `user_invitations` row of this profile carries the login, or it was
 *    invited, never signed in, never confirmed, email identities only).
 * 7. The sign-in block (D-208), decided before the reservation: a login
 *    banned now may be unbanned only for a `not_invited` / `invited`
 *    profile, or when the newest sign-in-block decision for it in
 *    `admin_action_log` is a revoke (`revoke_invitation` with `login_note
 *    banned`, no newer TOGGLE_ACCESS row) and it never signed in. Any other
 *    banned login → 409 `conflict` `reason: login_blocked`: no link, no
 *    email, nothing recorded.
 * 8. Reserve the attempt before any link exists: the service-role
 *    `reserve_invitation_attempt()` locks the live invitation row, applies
 *    the cooldown under that lock (5 minutes from the last successful send,
 *    30 seconds from a failed attempt, so Retry after a failed send works
 *    almost at once) and returns the attempt number → 429 `cooldown` (with
 *    `Retry-After`), 404 `not_found`, 409 `conflict` (disabled; `reason:
 *    counter_exhausted` when the attempt number would pass the integer
 *    range), 403 `out_of_reach` / `manages_admins_required`. Two concurrent
 *    requests: one reserves, the other gets 429 and makes no link. D-01 (RPC
 *    or table missing): the same cooldown computed here from the live row
 *    (when the table exists) and the profile's `last_invited_at`, and the
 *    attempt from `max(send_attempts, invitation_count) + 1` (past
 *    2147483647 → the same 409). Then the ban is lifted (step 7) or the
 *    orphan removed (step 6); a failure is an honest `link_failed` send
 *    failure: recorded, no link, no email. Then the link: none →
 *    `generateLink('invite')` (creates the login); the own or adopted login
 *    → `generateLink('magiclink')`, and a link for any other login → 409
 *    `conflict`. When `invite` answers "already registered" (a login
 *    appeared after step 6) the lookup and step 6's rule run again before
 *    any magic link is used: only `storm_invited` gets one, else 409
 *    `login_not_created_by_storm` (or `login_blocked` while it is banned)
 *    and no email. D-01 without the lookup: the magic link names the login,
 *    and it is vetted the same way before anything is sent.
 * 9. `sendEmail(CREW_INVITATION)` with idempotency key
 *    `invite:<profileId>:<attempt>:<h16>` (`payloadTag` of the action link:
 *    one key, one payload; D-146 as amended).
 * 10. `record_invitation_send()` (service role) stores the honest outcome
 *    and links `user_id`. When the RPC is missing (D-01) the legacy profile
 *    columns are updated **only after a successful send**, linking only the
 *    vetted login (adopted, or the one `invite` just created), and the
 *    answer says `stored: false`. Any other error (a 42501 refusal such as
 *    `inviter_out_of_reach`, `manages_admins_required`,
 *    `login_email_mismatch`, `login_not_invited`, or a failure) stores and
 *    links nothing and skips step 11: the answer keeps the email's real
 *    result with `stored: false`.
 * 11. The vessel of an imported profile (D-199, D-204): when the profile has
 *    `is_imported` and `imported_vessel_id`, its login had no current
 *    assignment at step 2, and a login is now linked to the profile (its
 *    own, or the one step 10 linked), the service-role
 *    `fulfil_imported_assignment()` writes the current `crew_assignments`
 *    row (`created` / `exists` → `created`; `none` → the row is looked up,
 *    since `record_invitation_send` may already have written it;
 *    `not_eligible`, which includes a Master / Captain position for an
 *    inviter without users_access.admin on the vessel → `failed`). D-01
 *    (RPC missing): only for a login this invitation linked (else `failed`,
 *    `pending_needs_review`); a Master / Captain position needs
 *    users_access.admin for the vessel (else `failed`, nothing written); the
 *    login's current assignments are looked up (service client); one on
 *    another vessel → `failed`; else the vessel must be the target
 *    company's and not Sold, and the edge inserts it with the service
 *    client (position, else rank, else Crew; `joining_date`, else today),
 *    then clears `is_imported` / `imported_vessel_id`. This runs only after
 *    step 3 passed. The answer carries `assignment: 'created' | 'failed'`
 *    only in that case; a D-01 send that failed links no login, so it has
 *    none.
 */
import type { AuthContext } from './auth.ts';
import { assertCapabilityForVessels, assertMayActOnUser, hasCapability, MANAGES_ADMINS_REQUIRED, OUT_OF_REACH } from './capability.ts';
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
/** D-205: a login with the invitee's address that STORM did not create for this profile is never adopted. */
const LOGIN_NOT_CREATED_BY_STORM = (): HttpError =>
  new HttpError(409, 'conflict', 'An account with this email exists that STORM did not create. Contact STORM support.', {
    reason: 'login_not_created_by_storm',
  });
/** D-208: a banned login that no revoke explains; an invitation it could not use is never sent. */
export const LOGIN_BLOCKED = (): HttpError =>
  new HttpError(409, 'conflict', "This person's sign-in is blocked. Turn access on first.", { reason: 'login_blocked' });

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

/** A stable snake_case refusal code from an error message (SQL `MESSAGE`), else null. Never free text. */
function refusalCode(error: unknown): string | null {
  const message = errorMessage(error).trim();
  return /^[a-z][a-z0-9_]{2,63}$/.test(message) ? message : null;
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
  role: string;
  /**
   * The capability scope (D-204): the vessels of the login's current
   * assignments in the target's company (service read), else, without a
   * login, `imported_vessel_id` of an imported profile.
   */
  structuralVessels: string[];
  /** The vessel the email names: the first structural vessel. */
  vesselId: string | null;
  /** True when the login has any current assignment (step 11 never runs then). */
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
  const companyId = text(row, 'company_id');

  // The profile is visible to the caller; its assignments are read with the service client, because the caller's
  // RLS view may hide a vessel they do not reach (the capability must see every one).
  let current: string[] = [];
  if (userId) {
    const a = await ctx.serviceClient()
      .from('crew_assignments')
      .select('vessel_id, join_date')
      .eq('user_id', userId)
      .eq('is_current', true)
      .order('join_date', { ascending: false })
      .limit(50);
    if (a.error) throw UNAVAILABLE();
    current = rowsOf(a.data).map((r) => text(r, 'vessel_id')).filter((v): v is string => v !== null);
  }
  let inCompany: string[] = [];
  if (current.length > 0 && companyId) {
    const v = await ctx.serviceClient().from('vessels').select('id, company_id').in('id', [...new Set(current)]);
    if (v.error) throw UNAVAILABLE();
    const ours = new Set(rowsOf(v.data).filter((r) => text(r, 'company_id') === companyId).map((r) => text(r, 'id')));
    inCompany = [...new Set(current.filter((id) => ours.has(id)))];
  }
  const importedVesselId = text(row, 'imported_vessel_id');
  const isImported = bool(row, 'is_imported') === true;
  const structuralVessels = inCompany.length > 0 ? inCompany : !userId && isImported && importedVesselId ? [importedVesselId] : [];
  return {
    row,
    profileId,
    userId,
    companyId,
    email: text(row, 'email')?.trim() ?? null,
    status: (text(row, 'account_status') ?? '').toLowerCase(),
    role: (text(row, 'role') ?? '').toLowerCase(),
    structuralVessels,
    vesselId: structuralVessels[0] ?? null,
    assigned: current.length > 0,
    pendingVesselId: isImported ? importedVesselId : null,
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
 * The login the invitation goes to (step 6, D-205): `own` (the profile's),
 * `adopt` (a login STORM invited for this profile), `orphan` (an unused
 * login to remove before `invite`), or `none` (`invite` creates one).
 */
type LoginPlan =
  | { kind: 'none' }
  | { kind: 'own'; userId: string; user: Row | null }
  | { kind: 'adopt'; userId: string; user: Row | null }
  | { kind: 'orphan'; userId: string };

/** The service-role `auth_user_id_for_email()`; null when there is none or the function is missing (D-01). */
async function lookupLogin(ctx: AuthContext, email: string): Promise<{ id: string | null; available: boolean }> {
  const lookup = await ctx.serviceClient().rpc('auth_user_id_for_email', { p_email: email });
  if (lookup.error) {
    if (!isMissingFunction(lookup.error)) throw UNAVAILABLE();
    return { id: null, available: false };
  }
  return { id: typeof lookup.data === 'string' && lookup.data ? lookup.data : null, available: true };
}

async function loginById(ctx: AuthContext, userId: string): Promise<Row | null> {
  const found = await ctx.serviceClient().auth.admin.getUserById(userId);
  if (found.error) throw UNAVAILABLE();
  return asRow(found.data?.user);
}

/** The auth providers of a login's identities (none → empty). */
function providersOf(user: Row | null): string[] {
  const identities = user?.identities;
  if (!Array.isArray(identities)) return [];
  return identities.map((i) => text(asRow(i), 'provider') ?? '?');
}

/** D-01: a `user_invitations` row of this profile already carries the login (table missing → no). */
async function invitationCarries(ctx: AuthContext, profileId: string, userId: string): Promise<boolean> {
  const res = await ctx.serviceClient().from('user_invitations').select('id').eq('profile_id', profileId).eq('user_id', userId).limit(1);
  if (res.error) {
    if (isMissingTable(res.error)) return false;
    throw UNAVAILABLE();
  }
  return rowsOf(res.data).length > 0;
}

/**
 * What `userId` is to this profile: the service-role
 * `invitation_login_state()`; D-01 (function missing) the same rule in
 * code from `getUserById`. Without SQL the edge cannot see a password, so
 * the D-01 rule also needs an unconfirmed login.
 */
async function loginState(ctx: AuthContext, target: Target, userId: string): Promise<{ state: string; user: Row | null }> {
  const rpc = await ctx.serviceClient().rpc('invitation_login_state', { p_profile_id: target.profileId, p_user_id: userId });
  if (!rpc.error) {
    const state = typeof rpc.data === 'string' ? rpc.data : 'unexpected';
    return { state, user: state === 'storm_invited' ? await loginById(ctx, userId) : null };
  }
  if (!isMissingFunction(rpc.error)) throw UNAVAILABLE();
  const user = await loginById(ctx, userId);
  if (!user) return { state: 'unknown', user };
  const loginEmail = (text(user, 'email') ?? '').trim().toLowerCase();
  if (loginEmail !== (target.email ?? '').trim().toLowerCase()) return { state: 'email_mismatch', user };
  const signedIn = !!text(user, 'last_sign_in_at');
  const emailOnly = providersOf(user).every((p) => p === 'email');
  if (await invitationCarries(ctx, target.profileId, userId)) return { state: 'storm_invited', user };
  if (text(user, 'invited_at') && !signedIn && !confirmed(user) && emailOnly) return { state: 'storm_invited', user };
  if (!confirmed(user) && !signedIn) return { state: 'unused_orphan', user };
  return { state: 'foreign', user };
}

/** Step 6's rule for a login found by the address. `allowOrphan` false (after `invite`): only `storm_invited` passes. */
async function dispose(ctx: AuthContext, target: Target, userId: string, allowOrphan: boolean): Promise<LoginPlan> {
  if (await linkedElsewhere(ctx, userId, target.profileId)) throw EMAIL_TAKEN();
  const { state, user } = await loginState(ctx, target, userId);
  if (state === 'storm_invited') return { kind: 'adopt', userId, user };
  if (state === 'unused_orphan' && allowOrphan) return { kind: 'orphan', userId };
  if (state === 'linked_elsewhere') throw EMAIL_TAKEN();
  if (state === 'linked') throw UNAVAILABLE(); // linked to this profile since step 2: the next try reads it as its own
  log('warn', 'invite_login_refused', { profile_id: target.profileId, state: /^[a-z_]{1,40}$/.test(state) ? state : 'unexpected' });
  throw LOGIN_NOT_CREATED_BY_STORM();
}

/** Step 6: the login this invitation is for, decided before any reservation or link. */
async function planLogin(ctx: AuthContext, target: Target, email: string, ownUser: Row | null): Promise<LoginPlan> {
  if (target.userId) return { kind: 'own', userId: target.userId, user: ownUser };
  const found = await lookupLogin(ctx, email);
  if (!found.id) return { kind: 'none' };
  return dispose(ctx, target, found.id, true);
}

/**
 * Step 8's link. `invite` only when step 6 found no login; a login that
 * appears in between is vetted with step 6's rule before its magic link is
 * used (D-01 without the lookup: vetted from the magic link's user, before
 * anything is sent).
 */
async function generateInviteLink(ctx: AuthContext, target: Target, email: string, landing: string, plan: LoginPlan, now: Date): Promise<Link | { ok: false }> {
  const admin = ctx.serviceClient().auth.admin;
  let vetted: string | null = plan.kind === 'own' || plan.kind === 'adopt' ? plan.userId : null;
  let type: 'invite' | 'magiclink' = vetted ? 'magiclink' : 'invite';
  let vetLinkUser = false;
  let res = await admin.generateLink({ type, email, options: { redirectTo: landing } });
  if (res.error && type === 'invite' && isAlreadyRegistered(res.error)) {
    const again = await lookupLogin(ctx, email);
    if (again.id) {
      const p = await dispose(ctx, target, again.id, false);
      if (p.kind === 'adopt' && bannedNow(p.user, now)) throw LOGIN_BLOCKED();
      vetted = again.id;
    } else if (!again.available) {
      vetLinkUser = true;
    } else {
      throw UNAVAILABLE(); // "already registered", yet no login has the address: nothing to vet
    }
    type = 'magiclink';
    res = await admin.generateLink({ type, email, options: { redirectTo: landing } });
  }
  if (res.error || !res.data?.properties?.action_link) {
    log('warn', 'invite_link_failed', { profile_id: target.profileId, link_type: type, code: errorCode(res.error) || 'none' });
    return { ok: false };
  }
  const linkUserId = typeof res.data.user?.id === 'string' ? res.data.user.id : null;
  if (vetLinkUser) {
    // D-01, no lookup function: the magic link names the login. Nothing was sent; it is used only when STORM invited it.
    if (!linkUserId) throw LOGIN_NOT_CREATED_BY_STORM();
    const p = await dispose(ctx, target, linkUserId, false);
    if (p.kind === 'adopt' && bannedNow(p.user, now)) throw LOGIN_BLOCKED();
    vetted = linkUserId;
  }
  if (vetted && linkUserId && linkUserId !== vetted) throw EMAIL_TAKEN();
  if (!vetted && linkUserId && (await linkedElsewhere(ctx, linkUserId, target.profileId))) throw EMAIL_TAKEN();
  return { ok: true, actionLink: res.data.properties.action_link, userId: linkUserId ?? vetted };
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
 * Legacy profile columns, only after a successful send and only when
 * `record_invitation_send` is missing (D-01). `linkUserId` is the vetted
 * login (step 6 / step 8). True when the update was stored (so `user_id` is
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

/**
 * Whether the newest sign-in-block decision for `userId` is a revoke that
 * banned it (D-208): the newest `RESET_ACCOUNT` `revoke_invitation` row with
 * `login_note: banned`, and no `TOGGLE_ACCESS` row (any `sign_in_block`) at
 * or after it. Service reads; an error is 503.
 */
async function banCameFromRevoke(ctx: AuthContext, userId: string): Promise<boolean> {
  const service = ctx.serviceClient();
  const revokes = await service
    .from('admin_action_log')
    .select('created_at, after_json')
    .eq('target_user_id', userId)
    .eq('action_type', 'RESET_ACCOUNT')
    .eq('after_json->>reset_type', 'revoke_invitation')
    .order('created_at', { ascending: false })
    .limit(1);
  if (revokes.error) throw UNAVAILABLE();
  const revoke = rowsOf(revokes.data)[0] ?? null;
  if (!revoke || text(asRow(revoke.after_json), 'login_note') !== 'banned') return false;
  const toggles = await service
    .from('admin_action_log')
    .select('created_at')
    .eq('target_user_id', userId)
    .eq('action_type', 'TOGGLE_ACCESS')
    .order('created_at', { ascending: false })
    .limit(1);
  if (toggles.error) throw UNAVAILABLE();
  const toggle = rowsOf(toggles.data)[0] ?? null;
  if (!toggle) return true;
  const toggledAt = timeOf(toggle, 'created_at');
  const revokedAt = timeOf(revoke, 'created_at');
  return toggledAt !== null && revokedAt !== null && toggledAt < revokedAt;
}

/**
 * Step 7: true when the login is banned now and this invitation may lift
 * the ban; a banned login it may not lift → `LOGIN_BLOCKED` (before the
 * reservation).
 */
async function mayLiftBan(ctx: AuthContext, target: Target, userId: string | null, user: Row | null, now: Date): Promise<boolean> {
  if (!userId || !bannedNow(user, now)) return false;
  if (!DISABLED.has(target.status)) {
    if (REINVITABLE.has(target.status)) return true;
    if (!text(user, 'last_sign_in_at') && (await banCameFromRevoke(ctx, userId))) return true;
  }
  throw LOGIN_BLOCKED();
}

interface Reservation {
  attempt: number;
  invitationId: string | null;
  /** True when `reserve_invitation_attempt()` answered (the cooldown ran under its lock). */
  reserved: boolean;
}

/**
 * Step 8: the attempt number, reserved before any link is generated. Refusals
 * throw (429 cooldown, 404, 409, 403); a database without the reservation RPC
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
      case 'forbidden':
        throw OUT_OF_REACH();
      case 'manages_admins_required':
        throw MANAGES_ADMINS_REQUIRED();
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

/** The Master office in the crew_assignments_guard vocabulary (ASCII lower-case, non-alphanumerics to `_`, as SQL normalises it). */
function isMasterOffice(position: string): boolean {
  const normalised = position.trim().replace(/[A-Z]/g, (c) => c.toLowerCase()).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return normalised === 'master' || normalised === 'captain';
}

function assignmentFailed(profileId: string, code: string): AssignmentResult {
  log('warn', 'invite_assignment_failed', { profile_id: profileId, code });
  return 'failed';
}

/**
 * Step 11 (D-199). The caller passed the capability checks for this target
 * in step 3; `userId` is the login now linked to the profile.
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

  // D-01: the function is not in the database yet. The same rule, with the service client. Only for a login this
  // invitation linked: a login that already had the profile may have written the import columns itself (D-204).
  if (target.userId) return assignmentFailed(target.profileId, 'pending_needs_review');
  const position = filled(target.row, 'position') ?? filled(target.row, 'rank') ?? 'Crew';
  // D-198: making anyone Master needs users_access.admin for the vessel, whoever wrote the position.
  if (isMasterOffice(position) && !(await hasCapability(ctx, 'admin.access.users_access.admin', { companyId: target.companyId, vesselId }))) {
    return assignmentFailed(target.profileId, 'master_needs_admin');
  }
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
      position,
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
  const kind = ADMIN_ROLES.has(target.role) ? 'admin' : 'crew';
  // Step 3: every structural vessel, then the person (D-194 / D-207). Nothing is reserved or written before.
  await assertCapabilityForVessels(ctx, 'admin.access.users_access.assign', target.companyId, target.structuralVessels);
  await assertMayActOnUser(ctx, { companyId: target.companyId, userId: target.userId, profileId, role: target.role, kind });

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

  // Steps 6 and 7, before the reservation: whose login, and whether its sign-in block may be lifted.
  const plan = await planLogin(ctx, target, email, authUser);
  const now = deps.now();
  const planned = plan.kind === 'own' || plan.kind === 'adopt' ? plan : null;
  const liftBan = await mayLiftBan(ctx, target, planned?.userId ?? null, planned?.user ?? null, now);
  const reservation = await reserveAttempt(ctx, target, kind, now);

  // A revoked invitee's login is banned: lift the ban for the new invitation, or fail honestly before any link.
  let ready = true;
  if (liftBan && planned) {
    const lift = await service.auth.admin.updateUserById(planned.userId, { ban_duration: 'none' });
    ready = !lift.error;
    if (lift.error) log('warn', 'invite_unban_failed', { profile_id: profileId, code: errorCode(lift.error) || 'none' });
  }
  // An unused login with the address that STORM did not create: removed, so `invite` makes a fresh one.
  if (plan.kind === 'orphan') {
    const removed = await service.auth.admin.deleteUser(plan.userId);
    ready = !removed.error;
    if (removed.error) log('warn', 'invite_orphan_login_remove_failed', { profile_id: profileId, code: errorCode(removed.error) || 'none' });
    else log('info', 'invite_orphan_login_removed', { profile_id: profileId });
  }

  const link = ready ? await generateInviteLink(ctx, target, email, landing, plan, now) : ({ ok: false } as const);
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
  /** False when the database refused the record (step 11 does not run then). */
  let recordAccepted = true;
  if (record.error) {
    if (isMissingFunction(record.error)) {
      if (result.ok) linkStored = await stampLegacyProfile(ctx, target, linkUserId, now);
    } else {
      // A refusal (42501 inviter_out_of_reach, manages_admins_required, login_email_mismatch, login_not_invited) or a
      // failure: nothing is stored or linked here, and the answer keeps what the email did.
      recordAccepted = false;
      log('warn', 'invite_record_refused', { profile_id: profileId, outcome, code: errorCode(record.error) || 'none', reason: refusalCode(record.error) });
    }
  } else {
    stored = true;
    linkStored = true;
    invitationId = text(asRow(record.data), 'id') ?? invitationId;
  }

  // Step 11: the imported vessel becomes an assignment once a login is linked (capability checked in step 3).
  const linked = target.userId ?? (linkStored ? linkUserId : null);
  let assignment: AssignmentResult | undefined;
  if (recordAccepted && target.pendingVesselId && !target.assigned && linked) {
    assignment = await fulfilAssignment(ctx, target, target.pendingVesselId, linked, now);
  }

  log('info', 'invite_attempt', {
    profile_id: profileId,
    outcome,
    stored,
    reserved: reservation.reserved,
    login: plan.kind,
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
