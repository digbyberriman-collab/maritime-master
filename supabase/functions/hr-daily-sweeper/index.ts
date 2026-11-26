import { createClient } from 'npm:@supabase/supabase-js@2.49.2';
import { timingSafeEqual } from '../_shared/rateLimit.ts';

/**
 * Daily housekeeping for projects without pg_cron. Invoke from any
 * scheduler (Supabase cron, GitHub Actions, uptime monitor) with the
 * service-role key or the shared HR_SWEEPER_SECRET as a bearer token
 * (docs/JOBS.md lists every sweep, its owner file and the owner action).
 * The sweeps run in this order:
 *   - crew_assignments_end_stale: end crew assignments whose leave / end
 *     date has passed (is_current = false), so the legacy readers that
 *     filter on is_current stop granting reach (D-227)
 *   - expire_invitations: live invitations past expires_at become expired,
 *     and the access each opened is withdrawn when it was never accepted
 *     (D-228)
 *   - expire overrun contracts and lapsed disciplinary warnings
 *   - archive HR records past their retention date (auto_archive policies)
 *   - raise / refresh / auto-dismiss HR alerts from hr_expiry_items and
 *     hr_performance_due_items (contracts, probation, passports, visas,
 *     medicals, certificates, work authorisations, reviews, objectives)
 *   - Phase 3 wave 1 stream sweeps (platform-prep PP4; contract 10): each
 *     takes only defaulted arguments (p_today date DEFAULT current_date),
 *     is EXECUTE for service_role only, and returns a count or a jsonb of
 *     counts (D-232):
 *       crew_document_expiry_sweep     X1-05, crew document expiry notices and digests
 *       work_rest_send_due_reminders   X1-08, automatic hours of rest reminders
 *       frp_periods_extend_open        X1-09, extends end-unknown planner periods
 *       crew_transfers_complete_due    X1-11, completes scheduled transfers on their sign-on date
 *       fleet_ops_daily_sweep          X5-09, fleet document acknowledgements and stale training applications
 *     Until a stream's file is applied its sweep reads 'not applied'.
 *
 * Each result is what the function returned (a number, or a JSON object of
 * counts), 'not applied' when the function is not in the database yet (the
 * build-out is not applied, D-01), or `error: …`. 'not applied' is
 * PostgREST PGRST202 (no such RPC in its schema cache), or a Postgres 42883
 * only when its message names the called function itself (`function
 * [public.]<fn>(…) does not exist`, a stale schema cache). A 42883 raised
 * inside an existing body (`operator does not exist: uuid = text`, or a
 * missing helper such as `function public.hr_can_admin(uuid) does not
 * exist`) is a failure (D-239), and so is an answer that is neither a
 * number nor a JSON object. 'not applied' is not a failure. Any failure
 * makes the answer ok: false with status 500, so a scheduler sees it (no
 * fake success); the remaining sweeps still run.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** The RPCs, in run order: the platform sweeps, the hr_* sweeps, then the stream sweeps. */
export const SWEEPS = [
  'crew_assignments_end_stale',
  'expire_invitations',
  'hr_expire_overrun_contracts',
  'hr_expire_disciplinary_records',
  'hr_archive_due_records',
  'hr_generate_alerts',
  'crew_document_expiry_sweep',
  'work_rest_send_due_reminders',
  'frp_periods_extend_open',
  'crew_transfers_complete_due',
  'fleet_ops_daily_sweep',
] as const;

export type SweepName = (typeof SWEEPS)[number];

export const NOT_APPLIED = 'not applied';

/** A sweep's answer: a count, a JSON object of counts, 'not applied' or `error: …`. */
export type SweepResult = number | Record<string, unknown> | string;

export interface SweepError {
  code?: string | null;
  message?: string | null;
}

/** The one call the sweeper makes: `rpc(fn)` with no arguments (every sweep defaults them). */
export interface SweepClient {
  rpc(fn: string): PromiseLike<{ data: unknown; error: SweepError | null }>;
}

export interface SweeperEnv {
  url: string;
  serviceRoleKey: string;
  sweeperSecret: string;
}

export interface SweeperDeps {
  env: () => SweeperEnv;
  createClient: (url: string, serviceRoleKey: string) => SweepClient;
  now?: () => Date;
}

/** Escapes a string for use as a literal inside a RegExp. */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Not applied (D-01, D-239): PostgREST has no such RPC (PGRST202), or
 * Postgres says THIS function does not exist (42883 from a stale schema
 * cache; the pattern is `^function (public\.)?<fn>\(.*\) does not exist$`).
 * A 42883 raised inside an existing body (operator does not exist, a missing
 * helper) is a failure.
 */
export const isNotApplied = (fn: string, error: SweepError): boolean =>
  error.code === 'PGRST202' ||
  (error.code === '42883' && new RegExp(`^function (public\\.)?${escapeRe(fn)}\\(.*\\) does not exist$`).test(error.message ?? ''));

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Runs every sweep in order; a failure never stops the ones after it. */
export async function runSweeps(client: SweepClient): Promise<{ results: Record<string, SweepResult>; failed: string[] }> {
  const results: Record<string, SweepResult> = {};
  const failed: string[] = [];
  for (const fn of SWEEPS) {
    let answer: { data: unknown; error: SweepError | null };
    try {
      answer = await client.rpc(fn);
    } catch (thrown) {
      answer = { data: null, error: { message: thrown instanceof Error ? thrown.message : String(thrown) } };
    }
    const { data, error } = answer;
    if (error) {
      if (isNotApplied(fn, error)) {
        results[fn] = NOT_APPLIED;
      } else {
        results[fn] = `error: ${error.message ?? 'unknown error'}`;
        failed.push(fn);
        console.error(`[hr-daily-sweeper] ${fn} failed:`, error.code ?? '', error.message ?? '');
      }
    } else if (data === null || data === undefined) {
      results[fn] = 0;
    } else if (typeof data === 'number' || isPlainObject(data)) {
      results[fn] = data;
    } else {
      results[fn] = 'error: unexpected answer (neither a count nor a JSON object)';
      failed.push(fn);
      console.error(`[hr-daily-sweeper] ${fn} returned an unexpected answer:`, typeof data);
    }
  }
  return { results, failed };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

export function createSweeperHandler(deps: SweeperDeps): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    const env = deps.env();
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
    const isServiceKey = Boolean(env.serviceRoleKey) && timingSafeEqual(token, env.serviceRoleKey);
    const isSecret = Boolean(env.sweeperSecret) && timingSafeEqual(token, env.sweeperSecret);
    if (!token || !(isServiceKey || isSecret)) return json(401, { error: 'Unauthorized' });

    const client = deps.createClient(env.url, env.serviceRoleKey);
    const { results, failed } = await runSweeps(client);
    const ok = failed.length === 0;
    const ranAt = (deps.now ?? (() => new Date()))().toISOString();
    return json(ok ? 200 : 500, { ok, ran_at: ranAt, results, ...(ok ? {} : { failed }) });
  };
}

export const defaultSweeperDeps: SweeperDeps = {
  env: () => ({
    url: Deno.env.get('SUPABASE_URL') ?? '',
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    sweeperSecret: Deno.env.get('HR_SWEEPER_SECRET') ?? '',
  }),
  createClient: (url, serviceRoleKey) => createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }),
};

Deno.serve(createSweeperHandler(defaultSweeperDeps));
