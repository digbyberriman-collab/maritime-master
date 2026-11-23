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
 *    pre-login link the crew list reads).
 * 9. `sendInvite`: the one invitation path (`inviteProfile`: generateLink,
 *    our email, `record_invitation_send`; `invited` only after a send that
 *    worked). `createUser` / `inviteUserByEmail` are gone.
 * 10. With a vessel and a login (the invitation links one), the current
 *    `crew_assignments` row (it needs a login: `user_id` is NOT NULL). Without
 *    a login the vessel stays on `imported_vessel_id` until they are invited.
 *
 * Responses:
 * - 201 `{ ok: true, profileId, invitation: { status: 'sent', invitationId, stored }, assignment? }`
 * - 201 `{ ok: true, profileId, invitation: { status: 'not_sent' }, assignment? }` (`sendInvite: false`)
 * - 502 `partial_failure` `details: { profileCreated: true, profileId, invitation: 'send_failed', email_error }`
 *   (the email failed; the person exists as not invited; Send again from Users & Access)
 * - 502 `partial_failure` `details: { profileCreated: true, profileId, invitation: 'refused', invite_code }`
 *   (the invitation path refused after the profile was saved, e.g. 503)
 * - 502 `partial_failure` `details: { profileCreated: true, profileId, assignmentCreated: false }` + `invitation`
 *   (invited, but the vessel assignment could not be saved)
 * - 400 / 403 / 404 / 409 (`conflict`: email in use, `reason: vessel_archived`) / 429 / 500 / 503 as above.
 * `assignment` (when a vessel was given): `created` or `pending_login`.
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
  const deps: CreateCrewMemberDeps = {
    ...base,
    invite: patch.invite ?? {},
    // A CSV import calls this once per row: generous per caller, still bounded.
    limiter: patch.limiter ?? new RateLimiter({ limit: 120, windowMs: 60_000 }),
    now: patch.now ?? (() => new Date()),
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

      let invitation: Record<string, JsonValue> = { status: 'not_sent' };
      let inviteFailure: HttpError | null = null;
      if (body.sendInvite) {
        const outcome = await inviteProfile(ctx, profileId, deps.invite);
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

      // The assignment needs a login; the invitation links one (also after a failed send when the database records it).
      let assignment: 'created' | 'pending_login' | 'failed' | null = null;
      if (body.vesselId) {
        assignment = 'pending_login';
        const linked = await service.from('profiles').select('user_id').eq('id', profileId).maybeSingle();
        const userId = linked.error ? null : text(asRow(linked.data), 'user_id');
        if (linked.error) {
          assignment = 'failed';
        } else if (userId) {
          const ins = await service.from('crew_assignments').insert({
            user_id: userId,
            vessel_id: body.vesselId,
            position: body.position ?? body.rank ?? 'Crew',
            join_date: body.joinDate ?? deps.now().toISOString().slice(0, 10),
            is_current: true,
            created_by: ctx.user.id,
          });
          assignment = ins.error ? 'failed' : 'created';
          if (ins.error) log('warn', 'crew_assignment_failed', { profile_id: profileId, code: errorCode(ins.error) || 'none' });
        }
      }
      log('info', 'crew_member_created', { profile_id: profileId, invitation: inviteFailure ? 'failed' : String(invitation.status), assignment });

      if (inviteFailure) {
        const details = { ...(inviteFailure.details ?? {}), ...(assignment === 'failed' ? { assignmentCreated: false } : {}) };
        const err = new HttpError(502, 'partial_failure', inviteFailure.publicMessage, details);
        return json(errorBody(err), { status: 502 });
      }
      if (assignment === 'failed') {
        const err = new HttpError(502, 'partial_failure', 'The crew member was added, but the vessel assignment could not be saved. Assign the vessel from the crew list.', {
          profileCreated: true,
          profileId,
          assignmentCreated: false,
        });
        return json({ ...errorBody(err), invitation }, { status: 502 });
      }
      return json({ ok: true, profileId, invitation, ...(assignment ? { assignment } : {}) }, { status: 201 });
    },
    { allowedOrigins: originsOf(deps), name: 'create-crew-member' },
  );
}
