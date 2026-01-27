import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Email templates (simplified version for edge function)
const EMAIL_TEMPLATES: Record<string, {
  subject: string;
  htmlBody: string;
  requiredVariables: string[];
}> = {
  CREW_INVITATION: {
    subject: 'Welcome to STORM - Set Up Your Account',
    htmlBody: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1a365d;">Welcome to STORM</h1>
        <p>Dear {{first_name}},</p>
        <p>You have been invited to join the crew management system for <strong>{{vessel_name}}</strong>.</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="{{invitation_link}}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Set Up Account</a>
        </p>
        <p>This invitation link will expire in 7 days.</p>
      </div>
    `,
    requiredVariables: ['first_name', 'invitation_link', 'vessel_name'],
  },
  FLIGHT_REQUEST_TO_AGENT: {
    subject: 'New Flight Request - {{crew_name}} - {{vessel_name}}',
    htmlBody: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1a365d;">New Flight Request</h1>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
          <p><strong>Crew Member:</strong> {{crew_name}}</p>
          <p><strong>Vessel:</strong> {{vessel_name}}</p>
          <p><strong>Travel Details:</strong> {{travel_details}}</p>
        </div>
        <p style="text-align: center; margin: 30px 0;">
          <a href="{{request_link}}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Request</a>
        </p>
      </div>
    `,
    requiredVariables: ['crew_name', 'vessel_name', 'travel_details', 'request_link'],
  },
  ALERT_ESCALATION: {
    subject: '[URGENT] {{alert_title}} - {{vessel_name}}',
    htmlBody: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #dc2626; color: white; padding: 15px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0;">⚠️ URGENT ALERT</h1>
        </div>
        <div style="border: 2px solid #dc2626; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
          <h2>{{alert_title}}</h2>
          <p><strong>Vessel:</strong> {{vessel_name}}</p>
          <p>{{alert_description}}</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="{{action_link}}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Take Action Now</a>
          </p>
        </div>
      </div>
    `,
    requiredVariables: ['alert_title', 'alert_description', 'vessel_name', 'action_link'],
  },
  CERTIFICATE_EXPIRY_WARNING: {
    subject: 'Certificate Expiry Warning - {{certificate_name}} - {{vessel_name}}',
    htmlBody: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #d97706;">Certificate Expiry Warning</h1>
        <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; border-left: 4px solid #d97706;">
          <p><strong>Certificate:</strong> {{certificate_name}}</p>
          <p><strong>Vessel:</strong> {{vessel_name}}</p>
          <p><strong>Expiry Date:</strong> {{expiry_date}}</p>
          <p><strong>Days Remaining:</strong> {{days_remaining}}</p>
        </div>
        <p>Please take action to renew this certificate before expiry.</p>
      </div>
    `,
    requiredVariables: ['certificate_name', 'vessel_name', 'expiry_date', 'days_remaining'],
  },
  INCIDENT_NOTIFICATION: {
    subject: 'Incident Reported - {{incident_type}} - {{vessel_name}}',
    htmlBody: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #dc2626;">Incident Reported</h1>
        <div style="background-color: #fee2e2; padding: 20px; border-radius: 8px; border-left: 4px solid #dc2626;">
          <p><strong>Type:</strong> {{incident_type}}</p>
          <p><strong>Vessel:</strong> {{vessel_name}}</p>
          <p><strong>Date:</strong> {{incident_date}}</p>
          <p><strong>Severity:</strong> {{severity}}</p>
          <p><strong>Summary:</strong> {{summary}}</p>
        </div>
        <p style="text-align: center; margin: 30px 0;">
          <a href="{{incident_link}}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Incident</a>
        </p>
      </div>
    `,
    requiredVariables: ['incident_type', 'vessel_name', 'incident_date', 'severity', 'summary', 'incident_link'],
  },
  PASSWORD_RESET: {
    subject: 'Password Reset Request - STORM',
    htmlBody: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1a365d;">Password Reset</h1>
        <p>Click the button below to reset your password:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="{{reset_link}}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Reset Password</a>
        </p>
        <p style="color: #6b7280;">This link will expire in 1 hour.</p>
      </div>
    `,
    requiredVariables: ['reset_link'],
  },
};

function renderTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return result;
}

interface SendEmailRequest {
  to: string;
  template: string;
  variables: Record<string, string>;
  idempotencyKey: string;
  cc?: string[];
  from?: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }

    const resend = new Resend(resendApiKey);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body: SendEmailRequest = await req.json();

    // Validate required fields
    if (!body.to || !body.template || !body.idempotencyKey) {
      throw new Error('Missing required fields: to, template, idempotencyKey');
    }

    // Check idempotency
    const { data: existing } = await supabaseAdmin
      .from('notification_logs')
      .select('id, message_id')
      .eq('idempotency_key', body.idempotencyKey)
      .single();

    if (existing) {
      console.log(`Idempotent request - returning existing: ${existing.message_id}`);
      return new Response(
        JSON.stringify({ success: true, messageId: existing.message_id, cached: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get template
    const template = EMAIL_TEMPLATES[body.template];
    if (!template) {
      throw new Error(`Template not found: ${body.template}`);
    }

    // Validate required variables
    const missingVars = template.requiredVariables.filter(v => !body.variables?.[v]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required variables: ${missingVars.join(', ')}`);
    }

    // Render template
    const subject = renderTemplate(template.subject, body.variables);
    const html = renderTemplate(template.htmlBody, body.variables);

    // Send email
    const fromAddress = body.from || Deno.env.get('EMAIL_FROM') || 'STORM <noreply@storm-maritime.com>';
    
    const emailResponse = await resend.emails.send({
      from: fromAddress,
      to: [body.to],
      cc: body.cc,
      subject,
      html,
    });

    const messageId = (emailResponse as { data?: { id?: string } }).data?.id || `sent-${Date.now()}`;
    console.log(`Email sent to ${body.to}: ${messageId}`);

    // Log notification
    await supabaseAdmin
      .from('notification_logs')
      .insert({
        recipient_email: body.to,
        template: body.template,
        status: 'SENT',
        message_id: messageId,
        idempotency_key: body.idempotencyKey,
        sent_at: new Date().toISOString(),
      });

    return new Response(
      JSON.stringify({ success: true, messageId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in send-email:', errorMessage);

    // Log failure if we have enough info
    try {
      const body = await req.clone().json();
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      await supabaseAdmin
        .from('notification_logs')
        .insert({
          recipient_email: body.to || 'unknown',
          template: body.template || 'unknown',
          status: 'FAILED',
          error: errorMessage,
          idempotency_key: body.idempotencyKey || `error-${Date.now()}`,
        });
    } catch {
      // Ignore logging errors
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
