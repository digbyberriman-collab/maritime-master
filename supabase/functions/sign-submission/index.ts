import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SignSubmissionRequest {
  submissionId: string;
  signatureMethod: 'PIN' | 'BIOMETRIC' | 'DRAWN' | 'SSO';
  pin?: string;
  signatureData?: string;
  action: 'SIGNED' | 'REJECTED';
  rejectionReason?: string;
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
      .select('role, company_id, first_name, last_name, rank')
      .eq('user_id', userData.user.id)
      .single();

    if (!profile) {
      throw new Error('Profile not found');
    }

    const body: SignSubmissionRequest = await req.json();

    // Get submission
    const { data: submission, error: submissionError } = await supabaseAdmin
      .from('sms_submissions')
      .select('*, sms_templates(*)')
      .eq('id', body.submissionId)
      .single();

    if (submissionError || !submission) {
      throw new Error('Submission not found');
    }

    if (submission.status !== 'PENDING_SIGNATURE') {
      throw new Error('Submission is not pending signature');
    }

    // Check if user is a required signer
    const { data: requiredSigners } = await supabaseAdmin
      .from('sms_required_signers')
      .select('*')
      .eq('submission_id', body.submissionId)
      .order('sign_order');

    const currentSigner = requiredSigners?.find(s => 
      s.user_id === userData.user.id && !s.signed_at
    );

    if (!currentSigner) {
      throw new Error('You are not authorized to sign this submission');
    }

    // Verify PIN if method is PIN
    if (body.signatureMethod === 'PIN' && body.pin) {
      const { data: userProfile } = await supabaseAdmin
        .from('profiles')
        .select('signature_pin_hash')
        .eq('user_id', userData.user.id)
        .single();

      // In production, compare hashed PIN
      // For now, we'll just check it exists
      if (!userProfile?.signature_pin_hash) {
        console.log('Warning: User has no PIN set');
      }
    }

    const ipAddress = req.headers.get('x-forwarded-for') || 
                      req.headers.get('x-real-ip') || 
                      'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    if (body.action === 'SIGNED') {
      // Record signature
      await supabaseAdmin
        .from('sms_required_signers')
        .update({
          signed_at: new Date().toISOString(),
          signature_method: body.signatureMethod,
          signature_data: body.signatureData,
          ip_address: ipAddress,
          user_agent: userAgent,
        })
        .eq('id', currentSigner.id);

      // Check if all required signers have signed
      const { data: allSigners } = await supabaseAdmin
        .from('sms_required_signers')
        .select('*')
        .eq('submission_id', body.submissionId)
        .eq('is_mandatory', true);

      const allSigned = allSigners?.every(s => s.signed_at);

      if (allSigned) {
        // Update submission status to SIGNED
        await supabaseAdmin
          .from('sms_submissions')
          .update({ 
            status: 'SIGNED',
            signed_at: new Date().toISOString(),
          })
          .eq('id', body.submissionId);
      }

      console.log(`Submission ${submission.submission_number} signed by ${profile.first_name} ${profile.last_name}`);

      return new Response(
        JSON.stringify({
          success: true,
          status: allSigned ? 'SIGNED' : 'PENDING_SIGNATURE',
          message: allSigned ? 'All signatures collected' : 'Signature recorded',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Rejection
      if (!body.rejectionReason) {
        throw new Error('Rejection reason is required');
      }

      await supabaseAdmin
        .from('sms_required_signers')
        .update({
          signed_at: new Date().toISOString(),
          signature_method: body.signatureMethod,
          action: 'REJECTED',
          rejection_reason: body.rejectionReason,
        })
        .eq('id', currentSigner.id);

      await supabaseAdmin
        .from('sms_submissions')
        .update({ 
          status: 'REJECTED',
          rejected_at: new Date().toISOString(),
          rejected_by: userData.user.id,
          rejection_reason: body.rejectionReason,
        })
        .eq('id', body.submissionId);

      console.log(`Submission ${submission.submission_number} rejected by ${profile.first_name} ${profile.last_name}`);

      return new Response(
        JSON.stringify({
          success: true,
          status: 'REJECTED',
          message: 'Submission rejected',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in sign-submission:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
