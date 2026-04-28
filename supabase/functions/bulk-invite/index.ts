import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';
import { inviteProfileById } from '../_shared/invite-helpers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BulkInviteRequest {
  // Either supply profileIds (preferred) or userIds (back-compat).
  profileIds?: string[];
  userIds?: string[];
  redirectTo?: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify the calling user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsError } = await supabaseAdmin.auth.getClaims(token);
    
    if (claimsError || !claims?.claims) {
      throw new Error('Unauthorized');
    }

    const callerId = claims.claims.sub;

    // Get caller's profile to check permissions
    const { data: callerProfile, error: callerError } = await supabaseAdmin
      .from('profiles')
      .select('role, company_id')
      .eq('user_id', callerId)
      .single();

    if (callerError || !callerProfile) {
      throw new Error('Could not verify permissions');
    }

    // Only DPA, Shore Management, Master, and superadmin can bulk invite
    if (!['dpa', 'shore_management', 'master', 'superadmin'].includes(callerProfile.role)) {
      throw new Error('Insufficient permissions to send invitations');
    }

    const { profileIds, userIds, redirectTo }: BulkInviteRequest = await req.json();

    let ids: string[] = [];
    if (profileIds?.length) {
      ids = profileIds;
    } else if (userIds?.length) {
      // Back-compat: translate auth user ids to profile ids.
      const { data: rows } = await supabaseAdmin
        .from('profiles')
        .select('id, user_id')
        .in('user_id', userIds);
      ids = (rows ?? []).map((r) => r.id);
    }

    if (ids.length === 0) {
      throw new Error('Missing or invalid profileIds array');
    }
    if (ids.length > 50) {
      throw new Error('Maximum 50 invitations per batch');
    }

    const results = [];
    for (const id of ids) {
      const r = await inviteProfileById(
        supabaseAdmin,
        id,
        callerProfile.company_id,
        redirectTo,
      );
      results.push(r);
      // Light delay to avoid hammering the auth admin API
      await new Promise((res) => setTimeout(res, 100));
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Sent ${successCount} invitations, ${failCount} failed`,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in bulk-invite:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
