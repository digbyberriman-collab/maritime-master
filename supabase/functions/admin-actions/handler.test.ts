import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1.0.13';
import type { EmailMessage, EmailResult } from '../_shared/email.ts';
import type { EdgeEnv } from '../_shared/env.ts';
import { callsOf, fail, fakeClientFactory, type FakeWorld } from '../_shared/testing/fakeSupabase.ts';
import { bodyOf, buildWorld, CO_A, envWith, obj, P, profileRow, request, TEST_ENV, V_A1, V_A2, V_A_SOLD, V_B1 } from '../_shared/testing/world.ts';
import { createHandler, DISABLE_BAN } from './handler.ts';
import { hashPin, verifyPin } from './pin.ts';

const NOW = new Date('2026-11-23T10:00:00Z');

function setup(opts: { p3?: boolean; env?: EdgeEnv; results?: EmailResult[] } = {}) {
  const world = buildWorld({ p3: opts.p3 ?? true });
  const sent: EmailMessage[] = [];
  let i = 0;
  const sendEmail = (m: EmailMessage) => {
    sent.push(m);
    return Promise.resolve(opts.results?.[i++] ?? { ok: true as const, providerMessageId: 'msg-1' });
  };
  const handler = createHandler({
    env: () => opts.env ?? TEST_ENV,
    createClient: fakeClientFactory(world),
    now: () => NOW,
    sendEmail,
    invite: { now: () => NOW, isFakeEmail: () => false, sendEmail },
  });
  return { world, sent, handler };
}

const call = (h: ReturnType<typeof setup>, token: string | null, body: unknown) => h.handler(request(token, body));

async function errorOf(res: Response): Promise<Record<string, unknown>> {
  return obj(await bodyOf(res), 'error');
}

function bans(world: FakeWorld): unknown[] {
  return callsOf(world, 'admin').filter((c) => c.method === 'updateUserById').map((c) => (c.args.attrs as Record<string, unknown>).ban_duration);
}

function auditRows(world: FakeWorld, action: string): Array<Record<string, unknown>> {
  return (world.tables.admin_action_log ?? []).filter((r) => r.action_type === action && r.source !== 'rpc');
}

// ---- gates ------------------------------------------------------------------------------------

Deno.test('admin-actions: auth rejections before any action (no JWT, bad JWT, disabled caller)', async () => {
  const h = setup();
  const body = { action: 'toggle_access', targetUserId: P.crewA.userId, enableAccess: false, reason: 'left' };
  assertEquals((await call(h, null, body)).status, 401);
  assertEquals((await call(h, 'forged', body)).status, 401);
  const disabled = await call(h, P.disabledA.token, body);
  assertEquals(disabled.status, 403);
  assertEquals((await errorOf(disabled)).code, 'account_disabled');
  assertEquals(bans(h.world).length, 0);
});

Deno.test('admin-actions: a non-admin is refused (403) for every targeted action', async () => {
  for (const p3 of [true, false]) {
    const h = setup({ p3 });
    for (const body of [
      { action: 'toggle_access', targetUserId: P.crewA2.userId, enableAccess: false, reason: 'x' },
      { action: 'reset_account', targetUserId: P.crewA2.userId, resetType: 'password_reset' },
      { action: 'reallocate_vessel', targetUserId: P.crewA2.userId, vesselId: V_A1, reason: 'x' },
    ]) {
      const res = await call(h, P.masterA.token, body);
      assertEquals(res.status, 403, `${body.action} p3=${p3}`);
      assertEquals((await errorOf(res)).code, 'forbidden');
    }
    assertEquals(h.sent.length, 0);
    assertEquals(bans(h.world).length, 0);
  }
});

Deno.test('admin-actions: another company\'s user is not visible → 404 (cross-tenant)', async () => {
  const h = setup();
  const res = await call(h, P.adminB.token, { action: 'toggle_access', targetUserId: P.crewA.userId, enableAccess: false, reason: 'x' });
  assertEquals(res.status, 404);
  assertEquals(profileRow(h.world, P.crewA.profileId).account_status, 'active');
});

Deno.test('admin-actions: acting on yourself is refused (except PIN)', async () => {
  const h = setup();
  const res = await call(h, P.adminA.token, { action: 'toggle_access', targetUserId: P.adminA.userId, enableAccess: false, reason: 'x' });
  assertEquals(res.status, 403);
  assertEquals(bans(h.world).length, 0);
});

Deno.test('admin-actions: an account owner is untouchable', async () => {
  const h = setup();
  (h.world.tables.account_memberships ??= []).push({ id: 'm1', user_id: P.shoreA.userId, company_id: CO_A, kind: 'owner', status: 'active' });
  const res = await call(h, P.adminA.token, { action: 'reset_account', targetUserId: P.shoreA.userId, resetType: 'password_reset' });
  assertEquals(res.status, 403);
  assertEquals(h.sent.length, 0);
});

Deno.test('admin-actions: unknown action / bad body → 400', async () => {
  const h = setup();
  for (const body of [{ action: 'delete_everyone' }, {}, { action: 'toggle_access', targetUserId: 'nope', enableAccess: true }]) {
    const res = await call(h, P.adminA.token, body);
    assertEquals(res.status, 400, JSON.stringify(body));
  }
});

// ---- toggle_access ----------------------------------------------------------------------------

Deno.test('toggle_access: disable needs a reason (400, nothing changed)', async () => {
  const h = setup();
  const res = await call(h, P.adminA.token, { action: 'toggle_access', targetUserId: P.crewA.userId, enableAccess: false, reason: '  ' });
  assertEquals(res.status, 400);
  assertEquals(callsOf(h.world, 'rpc').filter((c) => c.fn === 'set_membership_status').length, 0);
});

Deno.test('toggle_access (P3): set_membership_status as the actor + auth ban → 200 only when both worked', async () => {
  const h = setup();
  const res = await call(h, P.adminA.token, { action: 'toggle_access', targetUserId: P.crewA.userId, enableAccess: false, reason: 'Left the company' });
  assertEquals(res.status, 200);
  assertEquals(await bodyOf(res), { ok: true, statusStored: true, banApplied: true, accountStatus: 'disabled' });
  const rpc = callsOf(h.world, 'rpc').find((c) => c.fn === 'set_membership_status');
  assert(rpc);
  assertEquals(rpc.caller.role, 'service');
  assertEquals(rpc.args, { p_user_id: P.crewA.userId, p_status: 'disabled', p_actor: P.adminA.userId, p_reason: 'Left the company' });
  assertEquals(bans(h.world), [DISABLE_BAN]);
  assertEquals(profileRow(h.world, P.crewA.profileId).account_status, 'disabled');
  // set_membership_status writes the one audit row; the edge adds none (logged once).
  assertEquals(auditRows(h.world, 'TOGGLE_ACCESS').length, 0);
  const log = (h.world.tables.admin_action_log ?? []).filter((r) => r.action_type === 'TOGGLE_ACCESS');
  assertEquals(log.length, 1);
  assertFalse(JSON.stringify(log).includes('@'), 'no email addresses in the audit row');

  const enable = await call(h, P.adminA.token, { action: 'toggle_access', targetUserId: P.crewA.userId, enableAccess: true });
  assertEquals(enable.status, 200);
  assertEquals(bans(h.world), [DISABLE_BAN, 'none']);
});

Deno.test('toggle_access: ban failure → 502 partial_failure {statusStored:true, banApplied:false}; never "disabled"', async () => {
  const h = setup();
  h.world.hooks.admin = (a) => (a.method === 'updateUserById' ? fail('unexpected_failure', 'auth down', 500) : undefined);
  const res = await call(h, P.adminA.token, { action: 'toggle_access', targetUserId: P.crewA.userId, enableAccess: false, reason: 'x' });
  assertEquals(res.status, 502);
  const error = await errorOf(res);
  assertEquals(error.code, 'partial_failure');
  assertEquals(error.message, 'Access is off in STORM, but sign-in could not be blocked. Try again.');
  assertEquals(error.details, { statusStored: true, banApplied: false });
  // The failed sign-in block is on record next to the SQL status row.
  const edgeRows = auditRows(h.world, 'TOGGLE_ACCESS');
  assertEquals(edgeRows.length, 1);
  assertEquals((edgeRows[0].after_json as Record<string, unknown>).sign_in_block, 'failed');
});

Deno.test('toggle_access: status failure → 502 "Nothing was changed", no ban attempted', async () => {
  const h = setup();
  h.world.rpcs.set_membership_status = () => fail('XX000', 'boom');
  const res = await call(h, P.adminA.token, { action: 'toggle_access', targetUserId: P.crewA.userId, enableAccess: false, reason: 'x' });
  assertEquals(res.status, 502);
  const error = await errorOf(res);
  assertEquals(error.message, 'Nothing was changed. Try again.');
  assertEquals(error.details, { statusStored: false, banApplied: false });
  assertEquals(bans(h.world).length, 0);
});

Deno.test('toggle_access: a 42501 refusal from set_membership_status → 403 with its message, nothing else done', async () => {
  const h = setup();
  // shoreA (shore_management) is an admin but does not manage admins: disabling the DPA is refused by SQL.
  profileRow(h.world, P.shoreA.profileId).role = 'shore_management';
  const res = await call(h, P.shoreA.token, { action: 'toggle_access', targetUserId: P.adminA.userId, enableAccess: false, reason: 'x' });
  assertEquals(res.status, 403);
  assertEquals((await errorOf(res)).message, 'Only an administrator who manages administrators can change this access.');
  assertEquals(bans(h.world).length, 0);
});

Deno.test('toggle_access (legacy, RPC missing): profile column + ban, W7 guards in code', async () => {
  const h = setup({ p3: false });
  const ok = await call(h, P.adminA.token, { action: 'toggle_access', targetUserId: P.crewA.userId, enableAccess: false, reason: 'Left' });
  assertEquals(ok.status, 200);
  assertEquals(profileRow(h.world, P.crewA.profileId).account_status, 'disabled');
  assertEquals(bans(h.world), [DISABLE_BAN]);
  const row = auditRows(h.world, 'TOGGLE_ACCESS')[0];
  assertEquals(row.reason, 'Left');
  assertEquals((row.after_json as Record<string, unknown>).via, 'legacy');

  // An admin who does not manage admins (shore_management) cannot change the DPA.
  const notManager = await call(h, P.shoreA.token, { action: 'toggle_access', targetUserId: P.adminA.userId, enableAccess: false, reason: 'x' });
  assertEquals(notManager.status, 403);

  // With an own-company user_roles dpa row the shore admin manages admins, but adminA is the last active DPA.
  (h.world.tables.user_roles ??= []).push({ id: 'ur', user_id: P.shoreA.userId, role: 'dpa', company_id: CO_A, is_active: true, expires_at: null });
  const last = await call(h, P.shoreA.token, { action: 'toggle_access', targetUserId: P.adminA.userId, enableAccess: false, reason: 'x' });
  assertEquals(last.status, 403);
  assertEquals((await errorOf(last)).message, 'This is the last administrator who manages administrators. Give someone else that role first.');

  // A second active DPA exists: now it is allowed.
  profileRow(h.world, P.crewA2.profileId).role = 'dpa';
  const allowed = await call(h, P.shoreA.token, { action: 'toggle_access', targetUserId: P.adminA.userId, enableAccess: false, reason: 'x' });
  assertEquals(allowed.status, 200);
  assertEquals(profileRow(h.world, P.adminA.profileId).account_status, 'disabled');
});

// ---- reset_account ----------------------------------------------------------------------------

Deno.test('password_reset: recovery link + our email → 200 sent; link lands on the site', async () => {
  const h = setup();
  const res = await call(h, P.adminA.token, { action: 'reset_account', targetUserId: P.crewA.userId, resetType: 'password_reset', reason: 'locked out', redirectTo: 'https://evil.test' });
  assertEquals(res.status, 200);
  assertEquals(await bodyOf(res), { ok: true, reset: { status: 'sent' } });
  const link = callsOf(h.world, 'admin').find((c) => c.method === 'generateLink');
  assertEquals(link?.args.type, 'recovery');
  assertEquals((link?.args.options as { redirectTo?: string }).redirectTo, 'https://app.storm.test/reset-password?flow=recovery');
  assertEquals(h.sent.length, 1);
  assertEquals(h.sent[0].template, 'PASSWORD_RESET');
  assertEquals(h.sent[0].to, P.crewA.email);
  const log = auditRows(h.world, 'RESET_ACCOUNT');
  assertEquals((log[0].after_json as Record<string, unknown>).outcome, 'sent');
  assertFalse(JSON.stringify(log).includes('@'));
});

Deno.test('password_reset: email failure → 502 send_failed ("could not be sent"), logged as failed', async () => {
  const h = setup({ results: [{ ok: false, errorCode: 'not_configured' }] });
  const res = await call(h, P.adminA.token, { action: 'reset_account', targetUserId: P.crewA.userId, resetType: 'password_reset' });
  assertEquals(res.status, 502);
  const error = await errorOf(res);
  assertEquals(error.code, 'send_failed');
  assertEquals(error.message, 'The reset email could not be sent.');
  assertEquals(error.details, { email_error: 'not_configured' });
  assertEquals((auditRows(h.world, 'RESET_ACCOUNT')[0].after_json as Record<string, unknown>).outcome, 'send_failed');
});

Deno.test('password_reset: a link failure is a send failure too; STORM_SITE_URL missing → 500 before anything', async () => {
  const h = setup();
  h.world.hooks.admin = (a) => (a.method === 'generateLink' ? { data: { properties: null, user: null }, error: { message: 'x', status: 500 } } : undefined);
  const res = await call(h, P.adminA.token, { action: 'reset_account', targetUserId: P.crewA.userId, resetType: 'password_reset' });
  assertEquals(res.status, 502);
  assertEquals((await errorOf(res)).details, { email_error: 'link_failed' });
  assertEquals(h.sent.length, 0);

  const m = setup({ env: envWith({ siteUrl: null }) });
  const r2 = await call(m, P.adminA.token, { action: 'reset_account', targetUserId: P.crewA.userId, resetType: 'password_reset' });
  assertEquals(r2.status, 500);
  assertEquals(callsOf(m.world, 'admin').length, 0);
});

Deno.test('invalidate_sessions: honest 501 not_supported (never "sessions ended")', async () => {
  const h = setup();
  const res = await call(h, P.adminA.token, { action: 'reset_account', targetUserId: P.crewA.userId, resetType: 'invalidate_sessions' });
  assertEquals(res.status, 501);
  assertEquals((await errorOf(res)).code, 'not_supported');
  assertEquals(callsOf(h.world, 'admin').filter((c) => c.method === 'signOut').length, 0);
  const crew = await call(h, P.crewA.token, { action: 'reset_account', targetUserId: P.crewA2.userId, resetType: 'invalidate_sessions' });
  assertEquals(crew.status, 403, 'capability first');
});

Deno.test('resend_invitation: the one invite path (cooldown included), by user or profile id', async () => {
  const h = setup();
  const res = await call(h, P.adminA.token, { action: 'reset_account', targetUserId: P.invitedA.userId, resetType: 'resend_invitation' });
  assertEquals(res.status, 200);
  assertEquals(obj(await bodyOf(res), 'invitation').status, 'sent');
  const again = await call(h, P.adminA.token, { action: 'reset_account', targetUserId: P.invitedA.userId, resetType: 'resend_invitation' });
  assertEquals(again.status, 429);
  const imported = await call(h, P.adminA.token, { action: 'reset_account', targetProfileId: P.importedA.profileId, resetType: 'resend_invitation' });
  assertEquals(imported.status, 200);
  assertEquals(h.sent.length, 2);
});

// ---- reallocate_vessel ------------------------------------------------------------------------

Deno.test('reallocate_vessel: new assignment, previous closed, audited', async () => {
  const h = setup();
  const res = await call(h, P.adminA.token, { action: 'reallocate_vessel', targetUserId: P.crewA.userId, vesselId: V_A2, reason: 'Crew change', effectiveDate: '2026-12-01' });
  assertEquals(res.status, 200);
  const assignment = obj(await bodyOf(res), 'assignment');
  assertEquals([assignment.vesselId, assignment.position, assignment.effectiveDate], [V_A2, 'Deckhand', '2026-12-01']);
  const rows = (h.world.tables.crew_assignments ?? []).filter((a) => a.user_id === P.crewA.userId);
  assertEquals(rows.filter((a) => a.is_current).map((a) => a.vessel_id), [V_A2]);
  assertEquals(rows.find((a) => a.vessel_id === V_A1)?.leave_date, '2026-12-01');
  assertEquals(auditRows(h.world, 'REALLOCATE_VESSEL').length, 1);
});

Deno.test('reallocate_vessel: foreign vessel → 404; archived → 409; same vessel → 409; reason required', async () => {
  const h = setup();
  const base = { action: 'reallocate_vessel', targetUserId: P.crewA.userId, reason: 'x' };
  assertEquals((await call(h, P.adminA.token, { ...base, vesselId: V_B1 })).status, 404);
  assertEquals((await call(h, P.adminA.token, { ...base, vesselId: V_A_SOLD })).status, 409);
  assertEquals((await call(h, P.adminA.token, { ...base, vesselId: V_A1 })).status, 409);
  assertEquals((await call(h, P.adminA.token, { action: 'reallocate_vessel', targetUserId: P.crewA.userId, vesselId: V_A2 })).status, 400);
  assertEquals((await call(h, P.adminA.token, { ...base, vesselId: V_A2, effectiveDate: '2026-12-10', endDate: '2026-12-01' })).status, 400);
});

Deno.test('reallocate_vessel: closing the previous assignment fails → 502 partial_failure, retry finishes the job', async () => {
  const h = setup();
  let failEnd = true;
  h.world.hooks.query = (q) => (failEnd && q.table === 'crew_assignments' && q.op === 'update' ? fail('XX000', 'boom') : undefined);
  const res = await call(h, P.adminA.token, { action: 'reallocate_vessel', targetUserId: P.crewA.userId, vesselId: V_A2, reason: 'x' });
  assertEquals(res.status, 502);
  assertEquals((await errorOf(res)).details, { assignmentCreated: true, previousEnded: false });
  failEnd = false;
  const retry = await call(h, P.adminA.token, { action: 'reallocate_vessel', targetUserId: P.crewA.userId, vesselId: V_A2, reason: 'x' });
  assertEquals(retry.status, 200);
  const current = (h.world.tables.crew_assignments ?? []).filter((a) => a.user_id === P.crewA.userId && a.is_current);
  assertEquals(current.map((a) => a.vessel_id), [V_A2], 'no duplicate assignment on retry');
});

// ---- PIN --------------------------------------------------------------------------------------

Deno.test('PIN: hash format, constant-time verify, malformed stored values never match', async () => {
  const stored = await hashPin('123456');
  assert(/^[0-9a-f]{32}:[0-9a-f]{64}$/.test(stored));
  assert(await verifyPin('123456', stored));
  assertFalse(await verifyPin('654321', stored));
  for (const bad of ['', 'zz:yy', 'abc', `${stored}:x`]) assertFalse(await verifyPin('123456', bad));
});

Deno.test('PIN: set and verify the caller\'s own PIN without the admin capability; lockout after 5 wrong', async () => {
  const h = setup();
  const set = await call(h, P.crewA.token, { action: 'set_pin', pin: '246810' });
  assertEquals(set.status, 200);
  assertEquals(auditRows(h.world, 'SET_PIN')[0].target_user_id, P.crewA.userId);
  assertFalse(JSON.stringify(h.world.tables.admin_action_log).includes('246810'));
  const ok = await call(h, P.crewA.token, { action: 'verify_pin', pin: '246810' });
  assertEquals(ok.status, 200);
  assertEquals((await bodyOf(ok)).confirmedUntil, '2026-11-23T10:10:00.000Z');

  for (let i = 1; i <= 5; i++) {
    const wrong = await call(h, P.crewA.token, { action: 'verify_pin', pin: '000000' });
    assertEquals(wrong.status, 403);
    const details = (await errorOf(wrong)).details as Record<string, unknown>;
    assertEquals(details.reason, 'pin_invalid');
    assertEquals(details.attempts_remaining, 5 - i);
  }
  const locked = await call(h, P.crewA.token, { action: 'verify_pin', pin: '246810' });
  assertEquals(locked.status, 403);
  assertEquals(((await errorOf(locked)).details as Record<string, unknown>).reason, 'pin_locked');

  assertEquals((await call(h, P.crewA.token, { action: 'set_pin', pin: '12ab56' })).status, 400);
  const unset = await call(h, P.crewA2.token, { action: 'verify_pin', pin: '123456' });
  assertEquals(((await errorOf(unset)).details as Record<string, unknown>).reason, 'pin_not_set');
});

Deno.test('PIN: verify attempts are rate limited per caller (429)', async () => {
  const h = setup();
  await call(h, P.crewA.token, { action: 'set_pin', pin: '246810' });
  let status = 0;
  for (let i = 0; i < 11; i++) status = (await call(h, P.crewA.token, { action: 'verify_pin', pin: '246810' })).status;
  assertEquals(status, 429);
});

Deno.test('toggle_access: SQL refusals as snake_case codes map to copy with details.reason; foreign text never passes', async () => {
  const cases: Array<[string, string, number, string, string | undefined]> = [
    ['42501', 'cannot_disable_last_admin_manager', 403, 'This is the last administrator who manages administrators. Give someone else that role first.', 'cannot_disable_last_admin_manager'],
    ['42501', 'owner_untouchable', 403, "The account owner's access cannot be changed here.", 'owner_untouchable'],
    ['22023', 'reason_required', 400, 'Give a reason for turning access off.', 'reason_required'],
    ['42501', 'ERROR: permission denied for table profiles; detail at row 3', 403, 'You do not have permission to change this access.', undefined],
  ];
  for (const [code, message, status, copy, reason] of cases) {
    const h = setup();
    h.world.rpcs.set_membership_status = () => fail(code, message);
    const res = await call(h, P.adminA.token, { action: 'toggle_access', targetUserId: P.crewA.userId, enableAccess: false, reason: 'x' });
    assertEquals(res.status, status, message);
    const error = await errorOf(res);
    assertEquals(error.message, copy);
    assertEquals((error.details as Record<string, unknown> | undefined)?.reason, reason);
    assertEquals(bans(h.world).length, 0);
  }
});
