import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendToAgentRequest {
  requestId: string;
  agentEmail?: string;
  notes?: string;
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

    // Only DPA, Master, and Purser can send to agent
    if (!['dpa', 'master', 'shore_management'].includes(callerProfile.role)) {
      throw new Error('Insufficient permissions to send flight request to agent');
    }

    const { requestId, agentEmail, notes }: SendToAgentRequest = await req.json();

    if (!requestId) {
      throw new Error('Missing required field: requestId');
    }

    // Get the flight request
    const { data: flightRequest, error: requestError } = await supabaseAdmin
      .from('flight_requests')
      .select('*, vessel:vessels(name, company_id)')
      .eq('id', requestId)
      .single();

    if (requestError || !flightRequest) {
      throw new Error('Flight request not found');
    }

    // Verify same company
    if (flightRequest.company_id !== callerProfile.company_id) {
      throw new Error('Cannot access flight request from different company');
    }

    // Check if already sent
    if (flightRequest.status !== 'draft' && flightRequest.status !== 'pending') {
      throw new Error('Flight request has already been processed');
    }

    // Update the flight request status
    const { error: updateError } = await supabaseAdmin
      .from('flight_requests')
      .update({
        status: 'sent_to_agent',
        agent_email: agentEmail || flightRequest.agent_email,
        agent_notes: notes,
        sent_to_agent_at: new Date().toISOString(),
        sent_to_agent_by: callerId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('Failed to update flight request:', updateError);
      throw new Error('Failed to update flight request');
    }

    // Create notification log
    const { error: notifError } = await supabaseAdmin
      .from('notification_logs')
      .insert({
        company_id: callerProfile.company_id,
        notification_type: 'flight_request_to_agent',
        recipient_type: 'external',
        recipient_email: agentEmail || flightRequest.agent_email,
        subject: `Flight Request: ${flightRequest.request_number}`,
        body: notes || 'New flight request submitted',
        related_entity_type: 'flight_request',
        related_entity_id: requestId,
        status: 'pending',
        sent_by: callerId,
      });

    if (notifError) {
      console.error('Failed to log notification:', notifError);
    }

    console.log(`Flight request ${flightRequest.request_number} sent to agent`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Flight request sent to agent successfully',
        requestNumber: flightRequest.request_number,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in send-to-agent:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
