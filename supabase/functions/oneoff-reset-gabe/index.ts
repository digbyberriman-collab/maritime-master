import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const userId = "7aecfa51-3673-47cd-b565-9bb26af992b3";
  const newPassword = "Storm!Temp2026#Gabe";
  const { data, error } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
    email_confirm: true,
  });
  return new Response(
    JSON.stringify({ ok: !error, error: error?.message, email: data?.user?.email }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});