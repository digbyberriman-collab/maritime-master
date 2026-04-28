import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (_req) => {
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const targetEmail = "domobrada@gmail.com";
    const newPassword = "Storm!Temp2026#Domo";

    // Find user by listing (paginated)
    let userId: string | null = null;
    let page = 1;
    while (page < 20) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      const found = data.users.find((u: any) => (u.email || "").toLowerCase() === targetEmail);
      if (found) { userId = found.id; break; }
      if (data.users.length < 1000) break;
      page++;
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "User not found", email: targetEmail }), { status: 404 });
    }

    const { data, error } = await admin.auth.admin.updateUserById(userId, {
      password: newPassword,
      email_confirm: true,
    });
    if (error) throw error;

    return new Response(JSON.stringify({ success: true, userId, email: data.user?.email, newPassword }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
});
