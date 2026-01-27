import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotifyShippingMasterRequest {
  incidentId: string;
  message: string;
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

    // Only DPA and Master can notify shipping master
    if (!['dpa', 'master'].includes(callerProfile.role)) {
      throw new Error('Insufficient permissions to notify shipping master');
    }

    const { incidentId, message }: NotifyShippingMasterRequest = await req.json();

    if (!incidentId || !message) {
      throw new Error('Missing required fields: incidentId and message');
    }

    // Get the incident
    const { data: incident, error: incidentError } = await supabaseAdmin
      .from('incidents')
      .select('*, vessel:vessels(name, company_id)')
      .eq('id', incidentId)
      .single();

    if (incidentError || !incident) {
      throw new Error('Incident not found');
    }

    // Verify same company
    if (incident.company_id !== callerProfile.company_id) {
      throw new Error('Cannot access incident from different company');
    }

    // Update incident with shipping master notification
    const { error: updateError } = await supabaseAdmin
      .from('incidents')
      .update({
        shipping_master_notified: true,
        shipping_master_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', incidentId);

    if (updateError) {
      console.error('Failed to update incident:', updateError);
      throw new Error('Failed to update incident');
    }

    // Create a notification log entry
    const { error: notifError } = await supabaseAdmin
      .from('notification_logs')
      .insert({
        company_id: callerProfile.company_id,
        notification_type: 'shipping_master_notification',
        recipient_type: 'external',
        subject: `Incident Notification: ${incident.incident_number}`,
        body: message,
        related_entity_type: 'incident',
        related_entity_id: incidentId,
        status: 'sent',
        sent_by: callerId,
        sent_at: new Date().toISOString(),
      });

    if (notifError) {
      console.error('Failed to log notification:', notifError);
      // Don't fail the request, just log the error
    }

    console.log(`Shipping master notified for incident ${incident.incident_number}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Shipping master notified successfully',
        incidentNumber: incident.incident_number,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in notify-shipping-master:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
