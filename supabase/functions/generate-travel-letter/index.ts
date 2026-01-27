import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateTravelLetterRequest {
  crewId: string;
  flightRequestId?: string;
  travelDate: string;
  destination: string;
  purpose: string;
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
      .select('role, company_id, first_name, last_name')
      .eq('user_id', callerId)
      .single();

    if (callerError || !callerProfile) {
      throw new Error('Could not verify permissions');
    }

    // Only DPA, Master, and Purser can generate travel letters
    if (!['dpa', 'master', 'shore_management'].includes(callerProfile.role)) {
      throw new Error('Insufficient permissions to generate travel letters');
    }

    const { crewId, flightRequestId, travelDate, destination, purpose }: GenerateTravelLetterRequest = await req.json();

    if (!crewId || !travelDate || !destination || !purpose) {
      throw new Error('Missing required fields');
    }

    // Get crew member details
    const { data: crewProfile, error: crewError } = await supabaseAdmin
      .from('profiles')
      .select('*, company:companies(name, address)')
      .eq('user_id', crewId)
      .single();

    if (crewError || !crewProfile) {
      throw new Error('Crew member not found');
    }

    // Verify same company
    if (crewProfile.company_id !== callerProfile.company_id) {
      throw new Error('Cannot generate travel letter for crew from different company');
    }

    // Get current vessel assignment
    const { data: assignment } = await supabaseAdmin
      .from('crew_assignments')
      .select('*, vessel:vessels(name)')
      .eq('user_id', crewId)
      .eq('is_current', true)
      .single();

    // Get company details
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('*')
      .eq('id', callerProfile.company_id)
      .single();

    // Generate the travel letter content
    const letterDate = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    const travelDateFormatted = new Date(travelDate).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    const letterContent = `
TRAVEL LETTER

Date: ${letterDate}

To Whom It May Concern,

This letter confirms that ${crewProfile.first_name} ${crewProfile.last_name} is employed by ${company?.name || 'our company'} as ${crewProfile.rank || 'crew member'}${assignment ? ` aboard ${assignment.vessel?.name}` : ''}.

${crewProfile.first_name} ${crewProfile.last_name} is authorized to travel to ${destination} on ${travelDateFormatted} for the purpose of: ${purpose}.

Personal Details:
- Full Name: ${crewProfile.first_name} ${crewProfile.last_name}
- Nationality: ${crewProfile.nationality || 'Not specified'}
- Passport Number: ${crewProfile.passport_number || 'On file'}
${crewProfile.passport_expiry ? `- Passport Expiry: ${new Date(crewProfile.passport_expiry).toLocaleDateString('en-GB')}` : ''}

Company Details:
- Company Name: ${company?.name || 'Not specified'}
- Address: ${company?.address || 'Not specified'}
- DPA Contact: ${company?.dpa_name || 'Not specified'}
- DPA Phone: ${company?.dpa_phone_24_7 || 'Not specified'}

Should you require any further information, please do not hesitate to contact us.

Yours faithfully,

${callerProfile.first_name} ${callerProfile.last_name}
${callerProfile.role === 'dpa' ? 'Designated Person Ashore' : callerProfile.role === 'master' ? 'Master' : 'Shore Management'}
${company?.name || ''}
    `.trim();

    console.log(`Travel letter generated for ${crewProfile.first_name} ${crewProfile.last_name}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        letterContent,
        metadata: {
          crewName: `${crewProfile.first_name} ${crewProfile.last_name}`,
          destination,
          travelDate: travelDateFormatted,
          generatedAt: new Date().toISOString(),
          generatedBy: `${callerProfile.first_name} ${callerProfile.last_name}`,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in generate-travel-letter:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
