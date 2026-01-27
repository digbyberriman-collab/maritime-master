import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

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

    const url = new URL(req.url);
    const path = url.pathname.replace('/external-api', '');
    const apiKey = req.headers.get('x-api-key');

    if (!apiKey) {
      throw new Error('API key required');
    }

    // Validate API key and get associated entity
    const { data: apiKeyRecord, error: keyError } = await supabaseAdmin
      .from('api_keys')
      .select('*, companies(*)')
      .eq('key_hash', apiKey) // In production, hash the key
      .eq('is_active', true)
      .single();

    if (keyError || !apiKeyRecord) {
      return new Response(
        JSON.stringify({ error: 'Invalid API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check key expiration
    if (apiKeyRecord.expires_at && new Date(apiKeyRecord.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'API key expired' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log API access
    await supabaseAdmin
      .from('api_access_logs')
      .insert({
        api_key_id: apiKeyRecord.id,
        endpoint: path,
        method: req.method,
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
        user_agent: req.headers.get('user-agent'),
      });

    // Route based on path and key type
    const keyType = apiKeyRecord.key_type;

    // Employer API: /employer/crew
    if (path === '/employer/crew' && keyType === 'employer') {
      const { data: crew, error: crewError } = await supabaseAdmin
        .from('profiles')
        .select(`
          user_id,
          first_name,
          last_name,
          rank,
          nationality,
          status,
          crew_assignments!inner(
            vessel_id,
            position,
            join_date,
            leave_date,
            is_current,
            vessels(name, imo_number)
          )
        `)
        .eq('company_id', apiKeyRecord.company_id)
        .eq('crew_assignments.is_current', true);

      if (crewError) {
        throw new Error(`Failed to fetch crew: ${crewError.message}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          count: crew?.length || 0,
          data: crew?.map(c => {
            const assignments = c.crew_assignments as unknown as Array<{ vessel_id: string; position: string; join_date: string; vessels?: { name: string; imo_number: string } }>;
            const assignment = assignments?.[0];
            return {
              id: c.user_id,
              firstName: c.first_name,
              lastName: c.last_name,
              rank: c.rank,
              nationality: c.nationality,
              status: c.status,
              currentAssignment: assignment ? {
                vesselId: assignment.vessel_id,
                vesselName: assignment.vessels?.name,
                vesselImo: assignment.vessels?.imo_number,
                position: assignment.position,
                joinDate: assignment.join_date,
              } : null,
            };
          }),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Auditor API: /auditor/vessel/{id}
    if (path.startsWith('/auditor/vessel/') && keyType === 'auditor') {
      const vesselId = path.split('/').pop();

      // Check if auditor has access to this vessel
      const allowedVessels = apiKeyRecord.allowed_vessels || [];
      if (allowedVessels.length > 0 && !allowedVessels.includes(vesselId)) {
        return new Response(
          JSON.stringify({ error: 'Access denied to this vessel' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fetch audit-scoped data
      const [vesselResult, certificatesResult, drillsResult, incidentsResult] = await Promise.all([
        supabaseAdmin
          .from('vessels')
          .select('id, name, imo_number, flag_state, vessel_type, gross_tonnage')
          .eq('id', vesselId)
          .single(),
        supabaseAdmin
          .from('certificates')
          .select('certificate_name, certificate_number, expiry_date, status')
          .eq('vessel_id', vesselId)
          .order('expiry_date'),
        supabaseAdmin
          .from('drills')
          .select('drill_number, drill_type_id, drill_date_actual, status, overall_rating')
          .eq('vessel_id', vesselId)
          .order('drill_date_actual', { ascending: false })
          .limit(50),
        supabaseAdmin
          .from('incidents')
          .select('incident_number, incident_type, incident_date, severity, status')
          .eq('vessel_id', vesselId)
          .order('incident_date', { ascending: false })
          .limit(50),
      ]);

      return new Response(
        JSON.stringify({
          success: true,
          vessel: vesselResult.data,
          certificates: certificatesResult.data,
          recentDrills: drillsResult.data,
          recentIncidents: incidentsResult.data,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Travel Agent API: /agent/requests
    if (path === '/agent/requests' && keyType === 'travel_agent') {
      const { data: requests, error: requestsError } = await supabaseAdmin
        .from('flight_requests')
        .select(`
          id,
          request_number,
          status,
          travel_type,
          departure_date,
          created_at,
          profiles!flight_requests_crew_member_id_fkey(
            first_name,
            last_name,
            rank
          ),
          vessels(name)
        `)
        .eq('agent_id', apiKeyRecord.entity_id)
        .in('status', ['sent_to_agent', 'booking_pending', 'booking_confirmed']);

      if (requestsError) {
        throw new Error(`Failed to fetch requests: ${requestsError.message}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          count: requests?.length || 0,
          data: requests?.map(r => {
            const profile = (r.profiles as unknown) as { first_name: string; last_name: string; rank: string } | null;
            const vessel = (r.vessels as unknown) as { name: string } | null;
            return {
              id: r.id,
              requestNumber: r.request_number,
              status: r.status,
              travelType: r.travel_type,
              departureDate: r.departure_date,
              crewMember: profile ? {
                firstName: profile.first_name,
                lastName: profile.last_name,
                rank: profile.rank,
              } : null,
              vesselName: vessel?.name,
              createdAt: r.created_at,
            };
          }),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Endpoint not found or not authorized' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in external-api:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
