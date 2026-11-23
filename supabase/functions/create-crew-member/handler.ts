/**
 * create-crew-member (Phase 2 spec §C.3; gap/01 F46, F47; D-121, D-124, D-130).
 *
 * `POST { email, firstName, lastName, phone?, nationality?, rank?, role?,
 * vesselId?, position?, joinDate?, sendInvite? (default true), companyId? }`.
 * A `password` field is ignored: it is never read, stored or passed to auth
 * (the person chooses one from the invitation link).
 *
 * In order, nothing is written before step 8:
 * 1. `getAuthContext`: 401; a disabled caller 403 `account_disabled`; no
 *    profile 403; status unknown 503.
 * 2. Per-caller rate limit (429 `rate_limited`), then the body (400
 *    `invalid_request` naming the field).
 * 3. The company is the caller's (`ctx.companyId`); a body `companyId` that
 *    differs is 403 `cross_company`.
 * 4. `vesselId` must be visible through the caller's RLS client and belong to
 *    the company, else 404 `not_found` (that vessel); an archived (Sold)
 *    vessel is 409 `conflict` `reason: vessel_archived` after step 5.
 * 5. `assertCapability('admin.access.users_access.admin', { companyId,
 *    vesselId })`: the `has_capability_for` rule (CC-5: only unexpired,
 *    same-company `user_roles` rows count) → 403.
 * 6. `role`: the legacy crew vocabulary only (`CREW_ROLES`), default `crew`.
 *    `dpa` / `shore_management` → 403 `forbidden` `details.reason:
 *    admin_role` (admin roles are given in Users & Access, D-124); anything
 *    else → 400 `field: role`.
 * 7. A real inbox (400 `reason: placeholder_email`); `STORM_SITE_URL` when an
 *    invitation will be sent (500 `server_misconfigured`); an email already
 *    used by any profile, in any company → 409 `conflict` (generic copy).
 * 8. With the service client: the profile, `account_status 'not_invited'`,
 *    no auth user (`is_imported`, the vessel on `imported_vessel_id`, the
 *    pre-login link the crew list reads; `position`, `rank` and
 *    `joining_date` from `joinDate`, which the assignment takes later).
 * 9. `sendInvite`: the one invitation path (`inviteProfile`: generateLink,
 *    our email, `record_invitation_send`; `invited` only after a send that
 *    worked). `createUser` / `inviteUserByEmail` are gone.
 * 10. The vessel assignment belongs to the invitation path (D-199): once an
 *    invitation links a login, `fulfil_imported_assignment()` (D-01: the
 *    service insert in `_shared/invitations.ts`) writes the current
 *    `crew_assignments` row from the stored position (else rank, else Crew)
 *    and `joining_date`, and clears the import flags. This function writes
 *    no assignment itself. Without a linked login (`sendInvite: false`, a
 *    refused invitation, or a failed send that linked none) the vessel stays
 *    on `imported_vessel_id` (`pending_login`), and a later invitation from
 *    Users & Access or the crew list assigns it.
 *
 * Responses:
 * - 201 `{ ok: true, profileId, invitation: { status: 'sent', invitationId, stored }, assignment? }`
 * - 201 `{ ok: true, profileId, invitation: { status: 'not_sent' }, assignment? }` (`sendInvite: false`)
 * - 502 `partial_failure` `details: { profileCreated: true, profileId, invitation: 'send_failed', email_error, assignment? }`
 *   (the email failed; the person exists as not invited; Send again from Users & Access)
 * - 502 `partial_failure` `details: { profileCreated: true, profileId, invitation: 'refused', invite_code, assignment? }`
 *   (the invitation path refused after the profile was saved, e.g. 503)
 * - 502 `partial_failure` `details: { profileCreated: true, profileId, assignmentCreated: false, assignment: 'failed' }` + `invitation`
 *   (invited, but the vessel assignment could not be saved)
 * - 400 / 403 / 404 / 409 (`conflict`: email in use, `reason: vessel_archived`) / 429 / 500 / 503 as above.
 * `assignment` (only when a vessel was given): `created` (the invitation linked a login and wrote the row),
 * `pending_login` (no login linked yet) or, in a 502 only, `failed` (then also `assignmentCreated: false`).
 */
import { getAuthContext } from '../_shared/auth.ts';
import { assertCapability } from '../_shared/capability.ts';
import { asRow, errorCode, rowsOf, text } from '../_shared/db.ts';
import { type EdgeDeps, edgeDeps, originsOf } from '../_shared/deps.ts';
import { isValidRecipient } from '../_shared/email.ts';
import { linkLanding } from '../_shared/env.ts';
import { errorBody, type Handler, HttpError, json, type JsonValue, readJson, withHttp } from '../_shared/http.ts';
import { type InviteDeps, inviteProfile, isFakeEmail } from '../_shared/invitations.ts';
import { log } from '../_shared/log.ts';
import { RateLimiter } from '../_shared/rateLimit.ts';
import { objectBody, optionalBoolean, optionalDate, optionalString, optionalUuid, requiredString } from '../_shared/validate.ts';

export interface CreateCrewMemberDeps extends EdgeDeps {
  invite: Partial<InviteDeps>;
  limiter: RateLimiter;
  /** The clock; also the invitation path's, unless `invite.now` is given. */
  now: () => Date;
}

/** `profiles.role` (enum `user_role`) without the admin roles. */
export const CREW_ROLES = ['crew', 'master', 'chief_officer', 'chief_engineer'] as const;
const ADMIN_ROLES = new Set(['dpa', 'shore_management']);

const UNAVAILABLE = (): HttpError => new HttpError(503, 'status_unavailable', 'This could not be checked. Try again.');
const EMAIL_IN_USE = (): HttpError =>
  new HttpError(409, 'conflict', 'This email address cannot be used for a new crew member. Check the address, or find the person in the crew list.');

interface CreateCrewRequest {
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  nationality: string | null;
  rank: string | null;
  role: string | null;
  vesselId: string | null;
  position: string | null;
  joinDate: string | null;
  sendInvite: boolean;
  companyId: string | null;
}

function parseRequest(value: unknown): CreateCrewRequest {
  const b = objectBody(value);
  return {
    email: requiredString(b, 'email', 254),
    firstName: requiredString(b, 'firstName', 100),
    lastName: requiredString(b, 'lastName', 100),
    phone: optionalString(b, 'phone', 50),
    nationality: optionalString(b, 'nationality', 100),
    rank: optionalString(b, 'rank', 100),
    role: optionalString(b, 'role', 40),
    vesselId: optionalUuid(b, 'vesselId'),
    position: optionalString(b, 'position', 100),
    joinDate: optionalDate(b, 'joinDate'),
    sendInvite: optionalBoolean(b, 'sendInvite') ?? true,
    companyId: optionalUuid(b, 'companyId'),
    // `password` is deliberately not read.
  };
}

function crewRole(input: string | null): string {
  const role = (input ?? 'crew').trim().toLowerCase();
  if (ADMIN_ROLES.has(role)) {
    throw new HttpError(403, 'forbidden', 'Admin roles are given in Users & Access.', { reason: 'admin_role' });
  }
  if (!(CREW_ROLES as readonly string[]).includes(role)) {
    throw new HttpError(400, 'invalid_request', 'Choose a crew role.', { field: 'role' });
  }
  return role;
}

/** An ILIKE pattern that matches `value` literally (`\`, `%` and `_` escaped). */
function literalPattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const DUPLICATE_SCAN = 25;

export function createHandler(patch: Partial<CreateCrewMemberDeps> = {}): Handler {
  const base = edgeDeps(patch);
  const now = patch.now ?? (() => new Date());
  const deps: CreateCrewMemberDeps = {
    ...base,
    invite: { now, ...(patch.invite ?? {}) },
    // A CSV import calls this once per row: generous per caller, still bounded.
    limiter: patch.limiter ?? new RateLimiter({ limit: 120, windowMs: 60_000 }),
    now,
  };
  const fakeEmail = deps.invite.isFakeEmail ?? isFakeEmail;

  return withHttp(
    async (req) => {
      const env = deps.env();
      const ctx = await getAuthContext(req, { env, createClient: deps.createClient });
      deps.limiter.enforce(`create-crew-member:${ctx.user.id}`);
      const body = await readJson(req, parseRequest);

      const companyId = ctx.companyId;
      if (!companyId) throw new HttpError(403, 'forbidden', 'Your account is not set up for this action.');
      if (body.companyId && body.companyId !== companyId) throw new HttpError(403, 'cross_company', 'That belongs to another account.');

      let archived = false;
      if (body.vesselId) {
        const vessel = await ctx.userClient.from('vessels').select('id, company_id, status').eq('id', body.vesselId).maybeSingle();
        if (vessel.error) throw UNAVAILABLE();
        const row = asRow(vessel.data);
        if (text(row, 'company_id') !== companyId) throw new HttpError(404, 'not_found', 'That vessel was not found.');
        archived = text(row, 'status') === 'Sold';
      }
      await assertCapability(ctx, 'admin.access.users_access.admin', { companyId, vesselId: body.vesselId });
      if (archived) throw new HttpError(409, 'conflict', 'That vessel is archived.', { reason: 'vessel_archived' });
      const role = crewRole(body.role);

      const email = body.email.trim().toLowerCase();
      if (!isValidRecipient(email) || fakeEmail(email)) {
        throw new HttpError(400, 'invalid_request', 'Only a real inbox can be added. Fix the email address and try again.', { reason: 'placeholder_email' });
      }
      if (body.sendInvite) linkLanding(env, 'invite'); // STORM_SITE_URL first: nothing is written without it

      const service = ctx.serviceClient();
      // Any company: one email, one person. The answer never says where it is used.
      const same = await service.from('profiles').select('id, email').ilike('email', literalPattern(email)).limit(DUPLICATE_SCAN);
      if (same.error) throw UNAVAILABLE();
      const rows = rowsOf(same.data);
      if (rows.length >= DUPLICATE_SCAN || rows.some((r) => (text(r, 'email') ?? '').trim().toLowerCase() === email)) throw EMAIL_IN_USE();

      const insert = await service
        .from('profiles')
        .insert({
          email,
          first_name: body.firstName,
          last_name: body.lastName,
          phone: body.phone,
          nationality: body.nationality,
          rank: body.rank,
          position: body.position,
          role,
          company_id: companyId,
          account_status: 'not_invited',
          is_imported: true,
          imported_vessel_id: body.vesselId,
          joining_date: body.joinDate,
          user_id: null,
        })
        .select('id')
        .single();
      if (insert.error) {
        if (errorCode(insert.error) === '23505') throw EMAIL_IN_USE();
        log('warn', 'crew_create_failed', { code: errorCode(insert.error) || 'none' });
        throw new HttpError(500, 'internal_error', 'The crew member could not be added. Nothing was saved. Try again.');
      }
      const profileId = text(asRow(insert.data), 'id');
      if (!profileId) throw new HttpError(500, 'internal_error', 'The crew member could not be added. Try again.');

      // The vessel waits on imported_vessel_id until an invitation links a login; the invitation path then writes
      // the assignment (step 10) and says so. No invitation, or a refused one: still waiting.
      let assignment: 'created' | 'pending_login' | 'failed' | null = body.vesselId ? 'pending_login' : null;
      let invitation: Record<string, JsonValue> = { status: 'not_sent' };
      let inviteFailure: HttpError | null = null;
      if (body.sendInvite) {
        const outcome = await inviteProfile(ctx, profileId, deps.invite);
        if (body.vesselId && outcome.status !== 'refused') assignment = outcome.assignment ?? 'pending_login';
        if (outcome.status === 'sent') {
          invitation = { status: 'sent', invitationId: outcome.invitationId, stored: outcome.stored };
        } else if (outcome.status === 'send_failed') {
          inviteFailure = new HttpError(502, 'partial_failure', 'The crew member was added, but the invitation email could not be sent. Send it again from Users & Access.', {
            profileCreated: true,
            profileId,
            invitation: 'send_failed',
            email_error: outcome.emailError,
          });
        } else {
          inviteFailure = new HttpError(502, 'partial_failure', 'The crew member was added, but the invitation was not sent. Send it from Users & Access.', {
            profileCreated: true,
            profileId,
            invitation: 'refused',
            invite_code: outcome.error.code,
          });
        }
      }
      log('info', 'crew_member_created', { profile_id: profileId, invitation: inviteFailure ? 'failed' : String(invitation.status), assignment });

      if (inviteFailure) {
        const details = {
          ...(inviteFailure.details ?? {}),
          ...(assignment ? { assignment } : {}),
          ...(assignment === 'failed' ? { assignmentCreated: false } : {}),
        };
        const err = new HttpError(502, 'partial_failure', inviteFailure.publicMessage, details);
        return json(errorBody(err), { status: 502 });
      }
      if (assignment === 'failed') {
        const err = new HttpError(502, 'partial_failure', 'The crew member was added, but the vessel assignment could not be saved. Assign the vessel from the crew list.', {
          profileCreated: true,
          profileId,
          assignmentCreated: false,
          assignment: 'failed',
        });
        return json({ ...errorBody(err), invitation }, { status: 502 });
      }
      return json({ ok: true, profileId, invitation, ...(assignment ? { assignment } : {}) }, { status: 201 });
    },
    { allowedOrigins: originsOf(deps), name: 'create-crew-member' },
  );
}
