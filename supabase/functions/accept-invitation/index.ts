import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AcceptInvitationRequest {
  token: string;
  password: string;
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

    const { token, password }: AcceptInvitationRequest = await req.json();

    if (!token || !password) {
      throw new Error('Missing required fields: token and password');
    }

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    // Find the profile with this invitation token
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('user_id, email, invitation_token_expires')
      .eq('invitation_token', token)
      .single();

    if (profileError || !profile) {
      throw new Error('Invalid or expired invitation token');
    }

    // Check if token has expired
    if (profile.invitation_token_expires && new Date(profile.invitation_token_expires) < new Date()) {
      throw new Error('Invitation token has expired');
    }

    // Update the user's password
    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
      profile.user_id,
      { password }
    );

    if (updateAuthError) {
      console.error('Failed to update password:', updateAuthError);
      throw new Error('Failed to set password');
    }

    // Clear the invitation token and set invited_at
    const { error: updateProfileError } = await supabaseAdmin
      .from('profiles')
      .update({
        invitation_token: null,
        invitation_token_expires: null,
        invited_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', profile.user_id);

    if (updateProfileError) {
      console.error('Failed to update profile:', updateProfileError);
    }

    console.log(`Invitation accepted for user: ${profile.email}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Invitation accepted successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in accept-invitation:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
