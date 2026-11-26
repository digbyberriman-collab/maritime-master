import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';

/**
 * Daily housekeeping for projects without pg_cron. Invoke from any
 * scheduler (Supabase cron, GitHub Actions, uptime monitor) with the
 * service-role key or the shared HR_SWEEPER_SECRET as a bearer token.
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
 *
 * Each result is the count the function returned, 'not applied' when the
 * function is not in the database yet (the platform build-out is not
 * applied, D-01; PostgREST PGRST202 or Postgres 42883), or `error: …`.
 * 'not applied' is not a failure. Any error makes the answer ok: false with
 * status 500, so a scheduler sees the failure (no fake success); the
 * remaining sweeps still run.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** The RPCs, in run order (the platform sweeps before the hr_* sweeps). */
const SWEEPS = [
  'crew_assignments_end_stale',
  'expire_invitations',
  'hr_expire_overrun_contracts',
  'hr_expire_disciplinary_records',
  'hr_archive_due_records',
  'hr_generate_alerts',
] as const;

const NOT_APPLIED = 'not applied';

/** PostgREST: the function is not in the schema cache; Postgres: undefined_function. */
const isMissingFunction = (error: { code?: string | null }) => error.code === 'PGRST202' || error.code === '42883';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const secret = Deno.env.get('HR_SWEEPER_SECRET') ?? '';
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  if (!token || (token !== serviceKey && (!secret || token !== secret))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const results: Record<string, number | string> = {};
  const failed: string[] = [];
  for (const fn of SWEEPS) {
    const { data, error } = await admin.rpc(fn);
    if (!error) {
      results[fn] = (data as number) ?? 0;
    } else if (isMissingFunction(error)) {
      results[fn] = NOT_APPLIED;
    } else {
      results[fn] = `error: ${error.message}`;
      failed.push(fn);
      console.error(`[hr-daily-sweeper] ${fn} failed:`, error.code ?? '', error.message);
    }
  }

  const ok = failed.length === 0;
  return new Response(JSON.stringify({ ok, ran_at: new Date().toISOString(), results, ...(ok ? {} : { failed }) }), {
    status: ok ? 200 : 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
