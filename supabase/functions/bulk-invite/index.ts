import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BulkInviteRequest {
  userIds: string[];
}

interface InviteResult {
  userId: string;
  email: string;
  success: boolean;
  error?: string;
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

    // Only DPA can bulk invite
    if (callerProfile.role !== 'dpa') {
      throw new Error('Only DPA can send bulk invitations');
    }

    const { userIds }: BulkInviteRequest = await req.json();

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      throw new Error('Missing or invalid userIds array');
    }

    if (userIds.length > 50) {
      throw new Error('Maximum 50 invitations per batch');
    }

    const results: InviteResult[] = [];
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    for (const userId of userIds) {
      try {
        // Get user profile
        const { data: profile, error: profileError } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (profileError || !profile) {
          results.push({ userId, email: '', success: false, error: 'User not found' });
          continue;
        }

        // Check same company
        if (profile.company_id !== callerProfile.company_id) {
          results.push({ userId, email: profile.email, success: false, error: 'Different company' });
          continue;
        }

        // Check cooldown
        if (profile.last_invited_at && new Date(profile.last_invited_at) > fiveMinutesAgo) {
          results.push({ userId, email: profile.email, success: false, error: 'Cooldown period active' });
          continue;
        }

        // Generate invitation token
        const invitationToken = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        // Update profile
        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({
            invitation_token: invitationToken,
            invitation_token_expires: expiresAt,
            last_invited_at: new Date().toISOString(),
            invitation_count: (profile.invitation_count || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);

        if (updateError) {
          results.push({ userId, email: profile.email, success: false, error: 'Failed to update' });
          continue;
        }

        results.push({ userId, email: profile.email, success: true });
        console.log(`Invitation sent to ${profile.email}`);
      } catch (err: any) {
        results.push({ userId, email: '', success: false, error: err.message });
      }
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
