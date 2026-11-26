/**
 * The daily sweeper's answer (supabase/functions/hr-daily-sweeper; D-227,
 * D-228): the platform sweeps run before the hr_* sweeps, a function the
 * database does not have yet (the build-out is not applied, D-01) reads
 * 'not applied' and is not a failure, and every other error is reported
 * as one (ok: false, status 500; no fake success).
 *
 * The function is legacy Deno code on remote imports, so it runs here over
 * mocked `serve` / `createClient` and a stubbed `Deno.env`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type RpcAnswer = { data: unknown; error: { code?: string; message: string } | null };

const h = vi.hoisted(() => ({
  handler: null as null | ((req: Request) => Promise<Response>),
  calls: [] as string[],
  answers: {} as Record<string, RpcAnswer>,
}));

vi.mock('https://deno.land/std@0.190.0/http/server.ts', () => ({
  serve: (fn: (req: Request) => Promise<Response>) => {
    h.handler = fn;
  },
}));
vi.mock('https://esm.sh/@supabase/supabase-js@2.49.2', () => ({
  createClient: () => ({
    rpc: async (fn: string) => {
      h.calls.push(fn);
      return h.answers[fn] ?? { data: 0, error: null };
    },
  }),
}));

const ENV: Record<string, string> = { SUPABASE_URL: 'http://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'service-key', HR_SWEEPER_SECRET: '' };
const globals = globalThis as { Deno?: unknown };

beforeAll(async () => {
  globals.Deno = { env: { get: (key: string) => ENV[key] } };
  // A computed path keeps tsc out of the Deno source (it type-checks only src/).
  const entry = ['..', '..', '..', 'supabase', 'functions', 'hr-daily-sweeper', 'index.ts'].join('/');
  await import(/* @vite-ignore */ entry);
});
afterAll(() => {
  delete globals.Deno;
});
beforeEach(() => {
  h.calls = [];
  h.answers = {};
});

const run = async (token = 'service-key') => {
  if (!h.handler) throw new Error('the sweeper did not register a handler');
  const res = await h.handler(new Request('http://fn.example.test/hr-daily-sweeper', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }));
  return { status: res.status, body: (await res.json()) as { ok?: boolean; results?: Record<string, number | string>; failed?: string[]; error?: string } };
};

describe('hr-daily-sweeper', () => {
  it('runs the stale-assignment and invitation-expiry sweeps first, then the hr_* sweeps', async () => {
    h.answers = { crew_assignments_end_stale: { data: 2, error: null }, expire_invitations: { data: 1, error: null } };
    const { status, body } = await run();
    expect(h.calls).toEqual([
      'crew_assignments_end_stale',
      'expire_invitations',
      'hr_expire_overrun_contracts',
      'hr_expire_disciplinary_records',
      'hr_archive_due_records',
      'hr_generate_alerts',
    ]);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.results).toMatchObject({ crew_assignments_end_stale: 2, expire_invitations: 1, hr_generate_alerts: 0 });
    expect(body.failed).toBeUndefined();
  });

  it('a function the database does not have yet (PGRST202 or 42883) reads "not applied", not a failure', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    h.answers = {
      crew_assignments_end_stale: { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.crew_assignments_end_stale without parameters in the schema cache' } },
      expire_invitations: { data: null, error: { code: '42883', message: 'function public.expire_invitations() does not exist' } },
    };
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.results).toMatchObject({ crew_assignments_end_stale: 'not applied', expire_invitations: 'not applied', hr_expire_overrun_contracts: 0 });
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('any other error is reported as an error: ok false, status 500, and the other sweeps still run', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    h.answers = { expire_invitations: { data: null, error: { code: '42501', message: 'permission denied for function expire_invitations' } } };
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.failed).toEqual(['expire_invitations']);
    expect(body.results?.expire_invitations).toBe('error: permission denied for function expire_invitations');
    expect(h.calls).toHaveLength(6);
    expect(error).toHaveBeenCalledTimes(1);
    // The log names the function and the database error, never the bearer or the key.
    expect(JSON.stringify(error.mock.calls)).not.toContain('service-key');
    error.mockRestore();
  });

  it('refuses a caller without the service-role key or the sweeper secret, and runs nothing', async () => {
    const { status, body } = await run('someone-else');
    expect(status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(h.calls).toEqual([]);
  });
});
