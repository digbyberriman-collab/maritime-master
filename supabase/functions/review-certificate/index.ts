import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReviewCertificateRequest {
  certificateId: string;
  vesselId: string;
  action: 'approve' | 'reject';
  notes?: string;
  newExpiryDate?: string;
  renewalCertificateNumber?: string;
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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !userData.user) {
      throw new Error('Unauthorized');
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, company_id, first_name, last_name')
      .eq('user_id', userData.user.id)
      .single();

    if (!profile) {
      throw new Error('Profile not found');
    }

    // Only DPA can approve/reject certificates
    if (profile.role !== 'dpa') {
      throw new Error('Only DPA can review certificates');
    }

    const body: ReviewCertificateRequest = await req.json();

    // Get certificate
    const { data: certificate, error: certError } = await supabaseAdmin
      .from('certificates')
      .select('*')
      .eq('id', body.certificateId)
      .eq('vessel_id', body.vesselId)
      .single();

    if (certError || !certificate) {
      throw new Error('Certificate not found');
    }

    if (body.action === 'approve') {
      // If renewing, create new certificate and supersede old one
      if (body.newExpiryDate && body.renewalCertificateNumber) {
        // Create new certificate
        const { data: newCert, error: newCertError } = await supabaseAdmin
          .from('certificates')
          .insert({
            certificate_name: certificate.certificate_name,
            certificate_number: body.renewalCertificateNumber,
            certificate_type: certificate.certificate_type,
            certificate_category: certificate.certificate_category,
            issuing_authority: certificate.issuing_authority,
            issue_date: new Date().toISOString().split('T')[0],
            expiry_date: body.newExpiryDate,
            vessel_id: body.vesselId,
            company_id: certificate.company_id,
            status: 'Valid',
            notes: body.notes,
            alert_days: certificate.alert_days,
          })
          .select()
          .single();

        if (newCertError) {
          throw new Error(`Failed to create renewal certificate: ${newCertError.message}`);
        }

        // Supersede old certificate
        await supabaseAdmin
          .from('certificates')
          .update({
            status: 'Superseded',
            superseded_by: newCert.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', body.certificateId);

        console.log(`Certificate ${certificate.certificate_number} renewed as ${body.renewalCertificateNumber}`);

        return new Response(
          JSON.stringify({
            success: true,
            action: 'renewed',
            oldCertificateId: body.certificateId,
            newCertificateId: newCert.id,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        // Just approve/update existing
        await supabaseAdmin
          .from('certificates')
          .update({
            status: 'Valid',
            notes: body.notes ? `${certificate.notes || ''}\n[${new Date().toISOString()}] Reviewed by ${profile.first_name} ${profile.last_name}: ${body.notes}` : certificate.notes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', body.certificateId);

        console.log(`Certificate ${certificate.certificate_number} approved`);

        return new Response(
          JSON.stringify({
            success: true,
            action: 'approved',
            certificateId: body.certificateId,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Reject
      if (!body.notes) {
        throw new Error('Rejection reason is required');
      }

      await supabaseAdmin
        .from('certificates')
        .update({
          status: 'Rejected',
          notes: `${certificate.notes || ''}\n[${new Date().toISOString()}] Rejected by ${profile.first_name} ${profile.last_name}: ${body.notes}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.certificateId);

      // Create alert for rejection
      await supabaseAdmin
        .from('alerts')
        .insert({
          alert_type: 'certificate_rejected',
          title: `Certificate Rejected: ${certificate.certificate_name}`,
          description: body.notes,
          severity_color: 'red',
          company_id: certificate.company_id,
          vessel_id: body.vesselId,
          related_entity_type: 'certificate',
          related_entity_id: body.certificateId,
          source_module: 'certificates',
        });

      console.log(`Certificate ${certificate.certificate_number} rejected`);

      return new Response(
        JSON.stringify({
          success: true,
          action: 'rejected',
          certificateId: body.certificateId,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in review-certificate:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
