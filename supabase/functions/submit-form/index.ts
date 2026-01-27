import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SubmitFormRequest {
  templateId: string;
  vesselId: string;
  formData: Record<string, unknown>;
  attachments?: string[];
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

    const body: SubmitFormRequest = await req.json();

    // Get template details
    const { data: template, error: templateError } = await supabaseAdmin
      .from('sms_templates')
      .select('*')
      .eq('id', body.templateId)
      .single();

    if (templateError || !template) {
      throw new Error('Template not found');
    }

    // Generate submission number
    const year = new Date().getFullYear();
    const { count } = await supabaseAdmin
      .from('sms_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('template_id', body.templateId)
      .gte('created_at', `${year}-01-01`);

    const sequence = (count || 0) + 1;
    const submissionNumber = `${template.template_code}-${year}-${String(sequence).padStart(5, '0')}`;

    // Generate content hash for integrity
    const content = JSON.stringify(body.formData);
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    const contentHash = Math.abs(hash).toString(16).padStart(16, '0');

    // Create submission
    const { data: submission, error: submissionError } = await supabaseAdmin
      .from('sms_submissions')
      .insert({
        template_id: body.templateId,
        vessel_id: body.vesselId,
        submission_number: submissionNumber,
        form_data: body.formData,
        content_hash: contentHash,
        status: 'DRAFT',
        created_by: userData.user.id,
        company_id: profile.company_id,
      })
      .select()
      .single();

    if (submissionError) {
      console.error('Submission error:', submissionError);
      throw new Error(`Failed to create submission: ${submissionError.message}`);
    }

    // Add attachments if provided
    if (body.attachments && body.attachments.length > 0) {
      const attachmentRecords = body.attachments.map((url, index) => ({
        submission_id: submission.id,
        file_url: url,
        file_name: `attachment_${index + 1}`,
        uploaded_by: userData.user.id,
      }));

      await supabaseAdmin
        .from('sms_submission_attachments')
        .insert(attachmentRecords);
    }

    console.log(`Form submission created: ${submissionNumber}`);

    return new Response(
      JSON.stringify({
        success: true,
        submission: {
          id: submission.id,
          submissionNumber,
          status: 'DRAFT',
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in submit-form:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
