import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';
import { inviteProfileById } from '../_shared/invite-helpers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendInvitationRequest {
  // Either may be supplied. profileId is preferred and works for both
  // imported (no auth user yet) and existing crew. userId is kept for
  // backwards compatibility with older callers.
  profileId?: string;
  userId?: string;
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

    // Only DPA, Shore Management, Master, and superadmin can send invitations
    if (!['dpa', 'shore_management', 'master', 'superadmin'].includes(callerProfile.role)) {
      throw new Error('Insufficient permissions to send invitations');
    }

    const { profileId, userId, redirectTo }: SendInvitationRequest = await req.json();

    let resolvedProfileId = profileId;
    if (!resolvedProfileId && userId) {
      // Backwards compat: caller passed the auth user id. Look up the profile.
      const { data: byUser } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      resolvedProfileId = byUser?.id;
    }

    if (!resolvedProfileId) {
      throw new Error('Missing required field: profileId (or userId)');
    }

    const result = await inviteProfileById(
      supabaseAdmin,
      resolvedProfileId,
      callerProfile.company_id,
      redirectTo,
    );

    if (!result.success) {
      return new Response(
        JSON.stringify({ success: false, error: result.error, email: result.email }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: `Invitation sent to ${result.email}`, email: result.email }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in send-invitation:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
