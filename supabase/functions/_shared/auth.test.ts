import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.13';
import { bearerToken, getAuthContext } from './auth.ts';
import { HttpError } from './http.ts';
import { callsOf, fail, fakeClientFactory, ok } from './testing/fakeSupabase.ts';
import { buildWorld, CO_A, NO_PROFILE_USER, P, request, TEST_ENV } from './testing/world.ts';

const ctxFor = (world: ReturnType<typeof buildWorld>, token: string | null) =>
  getAuthContext(request(token, {}), { env: TEST_ENV, createClient: fakeClientFactory(world) });

async function rejectsWith(promise: Promise<unknown>, status: number, code: string): Promise<void> {
  const err = await assertRejects(() => promise, HttpError);
  assertEquals([err.status, err.code], [status, code]);
}

Deno.test('bearerToken: only a well-formed Bearer header', () => {
  assertEquals(bearerToken(request('abc', {})), 'abc');
  assertEquals(bearerToken(request(null, {})), null);
  assertEquals(bearerToken(request(null, {}, { headers: { Authorization: 'Basic abc' } })), null);
  assertEquals(bearerToken(request(null, {}, { headers: { Authorization: 'Bearer a b' } })), null);
});

Deno.test('getAuthContext: no JWT → 401, before any client call', async () => {
  const world = buildWorld();
  await rejectsWith(ctxFor(world, null), 401, 'unauthorized');
  assertEquals(world.calls.length, 0);
});

Deno.test('getAuthContext: a bad or expired JWT → 401', async () => {
  const world = buildWorld({ p3: true });
  await rejectsWith(ctxFor(world, 'not-a-real-token'), 401, 'unauthorized');
  assertEquals(callsOf(world, 'getUser').length, 1);
  assertEquals(callsOf(world, 'rpc').length, 0);
});

for (const p3 of [true, false]) {
  const mode = p3 ? 'via my_account_status()' : 'via the profile fallback (RPC missing)';

  Deno.test(`getAuthContext: an active user gets the context ${mode}`, async () => {
    const world = buildWorld({ p3 });
    const ctx = await ctxFor(world, P.adminA.token);
    assertEquals(ctx.user.id, P.adminA.userId);
    assertEquals(ctx.companyId, CO_A);
    assertEquals(ctx.profileId, P.adminA.profileId);
    assertEquals(ctx.token, P.adminA.token);
    // The service client is created lazily (only after a capability check).
    const before = world.calls.length;
    const service = ctx.serviceClient();
    assert(service === ctx.serviceClient(), 'one service client per context');
    assertEquals(world.calls.length, before);
  });

  Deno.test(`getAuthContext: a disabled user → 403 account_disabled ${mode}`, async () => {
    const world = buildWorld({ p3 });
    await rejectsWith(ctxFor(world, P.disabledA.token), 403, 'account_disabled');
  });

  Deno.test(`getAuthContext: no profile → 403 forbidden (not "disabled") ${mode}`, async () => {
    const world = buildWorld({ p3 });
    await rejectsWith(ctxFor(world, NO_PROFILE_USER.token), 403, 'forbidden');
  });
}

Deno.test('getAuthContext: a deactivated profile is disabled in the fallback too', async () => {
  const world = buildWorld({ p3: false });
  const row = (world.tables.profiles ?? []).find((p) => p.user_id === P.crewA.userId);
  assert(row);
  row.account_status = 'Deactivated';
  await rejectsWith(ctxFor(world, P.crewA.token), 403, 'account_disabled');
});

Deno.test('getAuthContext: the RPC decides even when the disabled user reads no profile row (file 7)', async () => {
  const world = buildWorld({ p3: true });
  const ctx = ctxFor(world, P.disabledA.token);
  await rejectsWith(ctx, 403, 'account_disabled');
  // Refused before reading the profile.
  assertEquals(callsOf(world, 'query').length, 0);
});

Deno.test('getAuthContext: a status RPC error (not "missing") → 503, fail closed', async () => {
  const world = buildWorld({ p3: true });
  world.rpcs.my_account_status = () => fail('57014', 'canceling statement due to statement timeout');
  await rejectsWith(ctxFor(world, P.adminA.token), 503, 'status_unavailable');
});

Deno.test('getAuthContext: an answer outside the vocabulary → 503 (never "assume active")', async () => {
  const world = buildWorld({ p3: true });
  world.rpcs.my_account_status = () => ok('removed');
  await rejectsWith(ctxFor(world, P.adminA.token), 503, 'status_unavailable');
});

Deno.test('getAuthContext: a profile read error → 503', async () => {
  const world = buildWorld({ p3: false });
  world.hooks.query = (q) => (q.table === 'profiles' ? fail('XX000', 'boom') : undefined);
  await rejectsWith(ctxFor(world, P.adminA.token), 503, 'status_unavailable');
});

Deno.test('getAuthContext: a thrown getUser (network) → 401, no detail leaked', async () => {
  const world = buildWorld();
  const factory = fakeClientFactory(world);
  const err = await assertRejects(
    () =>
      getAuthContext(request(P.adminA.token, {}), {
        env: TEST_ENV,
        createClient: (url, key, options) => {
          const client = factory(url, key, options);
          client.auth.getUser = () => Promise.reject(new Error('socket hang up at 10.0.0.1'));
          return client;
        },
      }),
    HttpError,
  );
  assertEquals(err.code, 'unauthorized');
  assert(!err.publicMessage.includes('socket'));
});
