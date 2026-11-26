/**
 * hr-daily-sweeper (D-232, D-239; platform-prep PP4, contract 10): the
 * sweeps run in order (platform, hr_*, then the five stream sweeps); a
 * missing function reads 'not applied' and is not a failure; an error inside
 * an existing body (a 42883 that names another function, an operator error)
 * is a failure; a sweep answers a count or a JSON object; anything else is a
 * failure; every sweep still runs after a failure; the bearer must be the
 * service-role key or the sweeper secret.
 *
 * index.ts serves on import, so the test replaces Deno.serve before loading
 * it and restores it after (no listener, no network, no env).
 */
import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1.0.13';

type Handler = (req: Request) => Promise<Response>;
const served: Handler[] = [];
const original = Object.getOwnPropertyDescriptor(Deno, 'serve');
Object.defineProperty(Deno, 'serve', {
  configurable: true,
  value: (handler: Handler) => {
    served.push(handler);
    return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {}, addr: { transport: 'tcp', hostname: 'test', port: 0 } };
  },
});
const sweeper = await import('./index.ts');
if (original) Object.defineProperty(Deno, 'serve', original);

const { NOT_APPLIED, SWEEPS, createSweeperHandler, isNotApplied, runSweeps } = sweeper;
type SweepClient = Parameters<typeof runSweeps>[0];
type Reply = { data: unknown; error: { code?: string; message?: string } | null };

const STREAM_SWEEPS = [
  'crew_document_expiry_sweep',
  'work_rest_send_due_reminders',
  'frp_periods_extend_open',
  'crew_transfers_complete_due',
  'fleet_ops_daily_sweep',
];

/** A fake client: per-function replies (or a throw); the default answers 0. Records the call order. */
function fakeClient(replies: Record<string, Reply | Error> = {}) {
  const calls: string[] = [];
  const client: SweepClient = {
    rpc(fn: string) {
      calls.push(fn);
      const reply = replies[fn];
      if (reply instanceof Error) return Promise.reject(reply);
      return Promise.resolve(reply ?? { data: 0, error: null });
    },
  };
  return { client, calls };
}

const missingRpc = (): Reply => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function in the schema cache' } });
const missingFn = (fn: string): Reply => ({ data: null, error: { code: '42883', message: `function public.${fn}(date) does not exist` } });

Deno.test('index.ts serves the sweeper on load', () => {
  assertEquals(served.length, 1);
});

Deno.test('the stream sweeps run after the platform and hr_* sweeps, in contract order', () => {
  assertEquals([...SWEEPS], [
    'crew_assignments_end_stale',
    'expire_invitations',
    'hr_expire_overrun_contracts',
    'hr_expire_disciplinary_records',
    'hr_archive_due_records',
    'hr_generate_alerts',
    ...STREAM_SWEEPS,
  ]);
});

Deno.test('every sweep is called once, in order, with no arguments; counts and JSON objects are kept', async () => {
  const { client, calls } = fakeClient({
    crew_assignments_end_stale: { data: 3, error: null },
    hr_generate_alerts: { data: null, error: null },
    fleet_ops_daily_sweep: { data: { documents_due_soon: 2, documents_overdue: 1, digests: 0, training_stale: 0, skipped: 0 }, error: null },
    crew_document_expiry_sweep: { data: { notices: 4, digests: 1 }, error: null },
  });
  const { results, failed } = await runSweeps(client);
  assertEquals(calls, [...SWEEPS]);
  assertEquals(failed, []);
  assertEquals(results.crew_assignments_end_stale, 3);
  assertEquals(results.hr_generate_alerts, 0, 'a NULL count reads 0, as before');
  assertEquals(results.fleet_ops_daily_sweep, { documents_due_soon: 2, documents_overdue: 1, digests: 0, training_stale: 0, skipped: 0 });
  assertEquals(results.crew_document_expiry_sweep, { notices: 4, digests: 1 });
});

Deno.test('a stream sweep that is not in the database yet reads "not applied" and is not a failure (PGRST202 and its own 42883)', async () => {
  const replies: Record<string, Reply> = {};
  for (const [i, fn] of STREAM_SWEEPS.entries()) replies[fn] = i % 2 ? missingFn(fn) : missingRpc();
  const { client } = fakeClient(replies);
  const { results, failed } = await runSweeps(client);
  for (const fn of STREAM_SWEEPS) assertEquals(results[fn], NOT_APPLIED, fn);
  assertEquals(failed, []);
});

Deno.test('an error inside an existing body is a failure (D-239), and the sweeps after it still run', async () => {
  const { client, calls } = fakeClient({
    work_rest_send_due_reminders: { data: null, error: { code: '42883', message: 'function public.hr_can_admin(uuid) does not exist' } },
    frp_periods_extend_open: { data: null, error: { code: '42883', message: 'operator does not exist: uuid = text' } },
    crew_transfers_complete_due: { data: null, error: { code: '42501', message: 'permission denied for function crew_transfers_complete_due' } },
    fleet_ops_daily_sweep: new Error('network down'),
  });
  const { results, failed } = await runSweeps(client);
  assertEquals(calls, [...SWEEPS]);
  assertEquals(failed, ['work_rest_send_due_reminders', 'frp_periods_extend_open', 'crew_transfers_complete_due', 'fleet_ops_daily_sweep']);
  assertEquals(results.work_rest_send_due_reminders, 'error: function public.hr_can_admin(uuid) does not exist');
  assertEquals(results.frp_periods_extend_open, 'error: operator does not exist: uuid = text');
  assertEquals(results.fleet_ops_daily_sweep, 'error: network down');
  assertEquals(results.crew_document_expiry_sweep, 0);
});

Deno.test('an answer that is neither a count nor a JSON object is a failure', async () => {
  const { client } = fakeClient({
    crew_document_expiry_sweep: { data: 'done', error: null },
    fleet_ops_daily_sweep: { data: [1, 2], error: null },
  });
  const { results, failed } = await runSweeps(client);
  assertEquals(failed, ['crew_document_expiry_sweep', 'fleet_ops_daily_sweep']);
  assert(String(results.crew_document_expiry_sweep).startsWith('error: unexpected answer'));
});

Deno.test('isNotApplied: only a missing RPC, or a 42883 that names the called function itself', () => {
  assert(isNotApplied('fleet_ops_daily_sweep', { code: 'PGRST202', message: 'x' }));
  assert(isNotApplied('fleet_ops_daily_sweep', { code: '42883', message: 'function fleet_ops_daily_sweep(date) does not exist' }));
  assertFalse(isNotApplied('fleet_ops_daily_sweep', { code: '42883', message: 'function public.fleet_ops_can(uuid, uuid, text, text) does not exist' }));
  assertFalse(isNotApplied('fleet_ops_daily_sweep', { code: '42883', message: 'function public.fleet_ops_daily_sweep_x() does not exist' }));
  assertFalse(isNotApplied('fleet_ops_daily_sweep', { code: 'P0001', message: 'boom' }));
});

const ENV = { url: 'http://sweeper.test', serviceRoleKey: 'service-key', sweeperSecret: 'sweeper-secret' };
const call = (handler: Handler, token: string | null) =>
  handler(new Request('http://sweeper.test/', { method: 'POST', headers: token === null ? {} : { Authorization: `Bearer ${token}` } }));

Deno.test('the handler: 401 without the service key or the secret; 200 with every sweep run; 500 when one failed', async () => {
  const clients: string[] = [];
  const good = fakeClient({ fleet_ops_daily_sweep: missingRpc() });
  const handler = createSweeperHandler({
    env: () => ENV,
    createClient: (url, key) => {
      clients.push(`${url} ${key}`);
      return good.client;
    },
    now: () => new Date('2026-11-26T03:00:00Z'),
  });
  for (const token of [null, '', 'wrong', 'service-key-x']) assertEquals((await call(handler, token)).status, 401, String(token));
  assertEquals(clients, [], 'no client before the caller is checked');

  const ok = await call(handler, 'service-key');
  assertEquals(ok.status, 200);
  const body = await ok.json();
  assertEquals(body.ok, true);
  assertEquals(body.ran_at, '2026-11-26T03:00:00.000Z');
  assertEquals(body.results.fleet_ops_daily_sweep, NOT_APPLIED);
  assertEquals(Object.keys(body.results), [...SWEEPS]);
  assertEquals((await call(handler, 'sweeper-secret')).status, 200);
  assertEquals(clients, ['http://sweeper.test service-key', 'http://sweeper.test service-key'], 'the service client, never the caller token');

  const bad = createSweeperHandler({
    env: () => ENV,
    createClient: () => fakeClient({ crew_transfers_complete_due: { data: null, error: { code: '23514', message: 'check violation' } } }).client,
  });
  const res = await call(bad, 'service-key');
  assertEquals(res.status, 500);
  const failed = await res.json();
  assertEquals(failed.ok, false);
  assertEquals(failed.failed, ['crew_transfers_complete_due']);
});

Deno.test('the handler: no secret configured means only the service key works; OPTIONS answers CORS', async () => {
  const handler = createSweeperHandler({ env: () => ({ ...ENV, sweeperSecret: '' }), createClient: () => fakeClient().client });
  assertEquals((await call(handler, '')).status, 401);
  assertEquals((await call(handler, 'sweeper-secret')).status, 401);
  assertEquals((await call(handler, 'service-key')).status, 200);
  const preflight = await handler(new Request('http://sweeper.test/', { method: 'OPTIONS' }));
  assertEquals(preflight.status, 200);
  assert(preflight.headers.get('Access-Control-Allow-Headers')?.includes('authorization'));
});

Deno.test('a 42883 is "not applied" only when its message names the called function itself (the anchored pattern, pinned)', async () => {
  const cases: Array<[message: string, notApplied: boolean]> = [
    ['function public.expire_invitations() does not exist', true],
    // Unqualified, as Postgres reports it when resolved through search_path.
    ['function expire_invitations() does not exist', true],
    ['function public.expire_invitations(uuid) does not exist', true],
    // Another function: a missing helper inside the body.
    ['function public.hr_can_admin(uuid) does not exist', false],
    // A name that only starts with the called one: the escaped \( must follow the name.
    ['function public.expire_invitations_legacy() does not exist', false],
    // The escaped \. in (public\.)? : any other character before the name is no match.
    ['function publicXexpire_invitations() does not exist', false],
    ['function other.expire_invitations() does not exist', false],
    // Anchored at both ends.
    ['ERROR: function public.expire_invitations() does not exist', false],
    ['function public.expire_invitations() does not exist (CONTEXT: PL/pgSQL)', false],
    ['operator does not exist: text = uuid', false],
    ['', false],
  ];
  for (const [message, notApplied] of cases) {
    const { client, calls } = fakeClient({ expire_invitations: { data: null, error: { code: '42883', message } } });
    const { results, failed } = await runSweeps(client);
    assertEquals(calls.length, SWEEPS.length, message);
    if (notApplied) {
      assertEquals(results.expire_invitations, NOT_APPLIED, message);
      assertEquals(failed, [], message);
    } else {
      assertEquals(results.expire_invitations, `error: ${message}`, message);
      assertEquals(failed, ['expire_invitations'], message);
    }
  }
});

Deno.test('the failure log names the function and the database error, never the bearer, the key or the secret', async () => {
  const logged: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    const handler = createSweeperHandler({
      env: () => ENV,
      createClient: () => fakeClient({ hr_generate_alerts: { data: null, error: { code: '42883', message: 'operator does not exist: uuid = text' } } }).client,
    });
    assertEquals((await call(handler, 'sweeper-secret')).status, 500);
  } finally {
    console.error = originalError;
  }
  assertEquals(logged.length, 1);
  const text = JSON.stringify(logged);
  assert(text.includes('hr_generate_alerts') && text.includes('operator does not exist'));
  assertFalse(text.includes('service-key'));
  assertFalse(text.includes('sweeper-secret'));
});
