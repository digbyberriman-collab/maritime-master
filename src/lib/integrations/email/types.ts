// Email Service Types

export interface EmailTemplate {
  name: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  requiredVariables: string[];
}

export type EmailTemplateName =
  | 'CREW_INVITATION'
  | 'FLIGHT_REQUEST_TO_AGENT'
  | 'FLIGHT_CONFIRMATION_TO_CREW'
  | 'ALERT_ESCALATION'
  | 'CERTIFICATE_EXPIRY_WARNING'
  | 'DRILL_REMINDER'
  | 'INCIDENT_NOTIFICATION'
  | 'PASSWORD_RESET';

export interface SendEmailRequest {
  to: string;
  template: EmailTemplateName;
  variables: Record<string, string>;
  idempotencyKey: string;
  cc?: string[];
  bcc?: string[];
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  content: string; // Base64 encoded
  contentType: string;
}

export interface SendEmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface NotificationLog {
  id: string;
  recipientEmail: string;
  template: string;
  status: 'SENT' | 'FAILED' | 'QUEUED' | 'RETRYING';
  messageId?: string;
  error?: string;
  idempotencyKey: string;
  createdAt: Date;
  sentAt?: Date;
  retryCount?: number;
}

// Email template definitions
export const EMAIL_TEMPLATES: Record<EmailTemplateName, EmailTemplate> = {
  CREW_INVITATION: {
    name: 'crew_invitation',
    subject: 'Welcome to STORM - Set Up Your Account',
    htmlBody: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1a365d;">Welcome to STORM</h1>
        <p>Dear {{first_name}},</p>
        <p>You have been invited to join the crew management system for <strong>{{vessel_name}}</strong>.</p>
        <p>Please click the button below to set up your account:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="{{invitation_link}}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Set Up Account</a>
        </p>
        <p>This invitation link will expire in 7 days.</p>
        <p>If you have any questions, please contact your vessel management team.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 12px;">This is an automated message from STORM Maritime Management System.</p>
      </div>
    `,
    textBody: 'Welcome to STORM. You have been invited to join {{vessel_name}}. Visit: {{invitation_link}}',
    requiredVariables: ['first_name', 'invitation_link', 'vessel_name'],
  },
  FLIGHT_REQUEST_TO_AGENT: {
    name: 'flight_request_to_agent',
    subject: 'New Flight Request - {{crew_name}} - {{vessel_name}}',
    htmlBody: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1a365d;">New Flight Request</h1>
        <p>A new flight request has been submitted for your attention.</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Request Details</h3>
          <p><strong>Crew Member:</strong> {{crew_name}}</p>
          <p><strong>Vessel:</strong> {{vessel_name}}</p>
          <p><strong>Travel Details:</strong></p>
          <p>{{travel_details}}</p>
        </div>
        <p style="text-align: center; margin: 30px 0;">
          <a href="{{request_link}}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Request</a>
        </p>
      </div>
    `,
    textBody: 'New flight request for {{crew_name}} on {{vessel_name}}. Details: {{travel_details}}. View at: {{request_link}}',
    requiredVariables: ['crew_name', 'vessel_name', 'travel_details', 'request_link'],
  },
  FLIGHT_CONFIRMATION_TO_CREW: {
    name: 'flight_confirmation_to_crew',
    subject: 'Your Flight is Confirmed - {{destination}}',
    htmlBody: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1a365d;">Flight Confirmed</h1>
        <p>Dear {{crew_name}},</p>
        <p>Your flight has been confirmed. Please find the details below:</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Flight Details</h3>
          <p>{{flight_details}}</p>
        </div>
        <p style="text-align: center; margin: 30px 0;">
          <a href="{{itinerary_link}}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Itinerary</a>
        </p>
        <p>Please ensure you have all necessary travel documents ready.</p>
      </div>
    `,
    textBody: 'Your flight to {{destination}} is confirmed. {{flight_details}}. View itinerary: {{itinerary_link}}',
    requiredVariables: ['crew_name', 'destination', 'flight_details', 'itinerary_link'],
  },
  ALERT_ESCALATION: {
    name: 'alert_escalation',
    subject: '[URGENT] {{alert_title}} - {{vessel_name}}',
    htmlBody: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #dc2626; color: white; padding: 15px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0;">⚠️ URGENT ALERT</h1>
        </div>
        <div style="border: 2px solid #dc2626; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
          <h2>{{alert_title}}</h2>
          <p><strong>Vessel:</strong> {{vessel_name}}</p>
          <p><strong>Description:</strong></p>
          <p>{{alert_description}}</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="{{action_link}}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Take Action Now</a>
          </p>
          <p style="color: #6b7280; font-size: 12px;">This alert has been escalated due to no response within the required timeframe.</p>
        </div>
      </div>
    `,
    textBody: 'URGENT: {{alert_title}} on {{vessel_name}}. {{alert_description}}. Action required: {{action_link}}',
    requiredVariables: ['alert_title', 'alert_description', 'vessel_name', 'action_link'],
  },
  CERTIFICATE_EXPIRY_WARNING: {
    name: 'certificate_expiry_warning',
    subject: 'Certificate Expiry Warning - {{certificate_name}} - {{vessel_name}}',
    htmlBody: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #d97706;">Certificate Expiry Warning</h1>
        <p>The following certificate is approaching its expiry date:</p>
        <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #d97706;">
          <p><strong>Certificate:</strong> {{certificate_name}}</p>
          <p><strong>Vessel:</strong> {{vessel_name}}</p>
          <p><strong>Expiry Date:</strong> {{expiry_date}}</p>
          <p><strong>Days Remaining:</strong> {{days_remaining}}</p>
        </div>
        <p>Please take action to renew this certificate before expiry.</p>
      </div>
    `,
    textBody: 'Certificate {{certificate_name}} for {{vessel_name}} expires on {{expiry_date}} ({{days_remaining}} days remaining).',
    requiredVariables: ['certificate_name', 'vessel_name', 'expiry_date', 'days_remaining'],
  },
  DRILL_REMINDER: {
    name: 'drill_reminder',
    subject: 'Drill Scheduled - {{drill_type}} - {{vessel_name}}',
    htmlBody: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1a365d;">Drill Reminder</h1>
        <p>A drill has been scheduled for your vessel:</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Drill Type:</strong> {{drill_type}}</p>
          <p><strong>Vessel:</strong> {{vessel_name}}</p>
          <p><strong>Scheduled Date:</strong> {{drill_date}}</p>
          <p><strong>Scenario:</strong> {{scenario}}</p>
        </div>
        <p>All crew members are expected to participate.</p>
      </div>
    `,
    textBody: '{{drill_type}} drill scheduled for {{vessel_name}} on {{drill_date}}. Scenario: {{scenario}}',
    requiredVariables: ['drill_type', 'vessel_name', 'drill_date', 'scenario'],
  },
  INCIDENT_NOTIFICATION: {
    name: 'incident_notification',
    subject: 'Incident Reported - {{incident_type}} - {{vessel_name}}',
    htmlBody: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #dc2626;">Incident Reported</h1>
        <p>A new incident has been reported:</p>
        <div style="background-color: #fee2e2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
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
    textBody: 'Incident reported on {{vessel_name}}: {{incident_type}} ({{severity}}). {{summary}}. View: {{incident_link}}',
    requiredVariables: ['incident_type', 'vessel_name', 'incident_date', 'severity', 'summary', 'incident_link'],
  },
  PASSWORD_RESET: {
    name: 'password_reset',
    subject: 'Password Reset Request - STORM',
    htmlBody: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1a365d;">Password Reset</h1>
        <p>You requested to reset your password. Click the button below to set a new password:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="{{reset_link}}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Reset Password</a>
        </p>
        <p>If you didn't request this, you can safely ignore this email.</p>
        <p style="color: #6b7280;">This link will expire in 1 hour.</p>
      </div>
    `,
    textBody: 'Reset your STORM password: {{reset_link}}. This link expires in 1 hour.',
    requiredVariables: ['reset_link'],
  },
};

// Render template with variables
export function renderTemplate(template: EmailTemplate, variables: Record<string, string>): { subject: string; html: string; text: string } {
  let subject = template.subject;
  let html = template.htmlBody;
  let text = template.textBody;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    subject = subject.replace(new RegExp(placeholder, 'g'), value);
    html = html.replace(new RegExp(placeholder, 'g'), value);
    text = text.replace(new RegExp(placeholder, 'g'), value);
  }

  return { subject, html, text };
}

// Validate all required variables are present
export function validateTemplateVariables(template: EmailTemplate, variables: Record<string, string>): string[] {
  const missing: string[] = [];
  for (const v of template.requiredVariables) {
    if (!variables[v]) {
      missing.push(v);
    }
  }
  return missing;
}
