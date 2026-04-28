import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';

serve(async () => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  const ids = [
    '685eaad2-946b-4a6f-8cb0-b14cf2f6b012',
    '28f6275a-62fe-47a9-85ba-363eb5abc2c2',
    'f1a2ab3a-afcd-4d71-a25f-fa8dc0350ff2',
    '57909b22-5fff-4a14-96ac-036c3c4d8133',
  ];
  const results: Record<string, string> = {};
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    results[id] = error ? `error: ${error.message}` : 'deleted';
  }
  return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
});