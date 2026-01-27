import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendInvitationRequest {
  userId: string;
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

    // Only DPA, Master, and Purser can send invitations
    if (!['dpa', 'shore_management', 'master'].includes(callerProfile.role)) {
      throw new Error('Insufficient permissions to send invitations');
    }

    const { userId }: SendInvitationRequest = await req.json();

    if (!userId) {
      throw new Error('Missing required field: userId');
    }

    // Get the target user's profile
    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (targetError || !targetProfile) {
      throw new Error('User not found');
    }

    // Ensure same company
    if (targetProfile.company_id !== callerProfile.company_id) {
      throw new Error('Cannot send invitation to user from different company');
    }

    // Check 5-minute cooldown
    if (targetProfile.last_invited_at) {
      const lastInvited = new Date(targetProfile.last_invited_at);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (lastInvited > fiveMinutesAgo) {
        throw new Error('Please wait 5 minutes before sending another invitation');
      }
    }

    // Generate invitation token (7-day expiry)
    const invitationToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Update profile with invitation token
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        invitation_token: invitationToken,
        invitation_token_expires: expiresAt,
        last_invited_at: new Date().toISOString(),
        invitation_count: (targetProfile.invitation_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Failed to update profile:', updateError);
      throw new Error('Failed to generate invitation');
    }

    // TODO: Send email with invitation link
    // For now, just return the token (in production, this would be sent via email)
    console.log(`Invitation sent to ${targetProfile.email}, token: ${invitationToken}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Invitation sent successfully',
        // In production, don't return the token - it should be sent via email
        invitationToken: invitationToken,
        expiresAt: expiresAt,
      }),
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
