import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';

/**
 * Daily HR housekeeping for projects without pg_cron. Invoke from any
 * scheduler (Supabase cron, GitHub Actions, uptime monitor) with the
 * service-role key or the shared HR_SWEEPER_SECRET as a bearer token:
 *   - expire overrun contracts and lapsed disciplinary warnings
 *   - archive HR records past their retention date (auto_archive policies)
 *   - raise / refresh / auto-dismiss HR alerts from hr_expiry_items and
 *     hr_performance_due_items (contracts, probation, passports, visas,
 *     medicals, certificates, work authorisations, reviews, objectives)
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  for (const fn of ['hr_expire_overrun_contracts', 'hr_expire_disciplinary_records', 'hr_archive_due_records', 'hr_generate_alerts'] as const) {
    const { data, error } = await admin.rpc(fn);
    results[fn] = error ? `error: ${error.message}` : (data as number) ?? 0;
    if (error) console.error(`[hr-daily-sweeper] ${fn} failed:`, error.message);
  }

  return new Response(JSON.stringify({ ok: true, ran_at: new Date().toISOString(), results }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
