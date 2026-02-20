// E-SMS Forms/Checklists Constants

// Template types
export const TEMPLATE_TYPES = [
  'PRE_DEPARTURE_CHECKLIST',
  'BRIDGE_WATCHKEEPER_HANDOVER',
  'ENGINE_ROOM_CHECKLIST',
  'SAFETY_DRILL_REPORT',
  'MEETING_MINUTES',
  'INCIDENT_REPORT',
  'AUDIT_FINDING',
  'CORRECTIVE_ACTION',
  'FAMILIARIZATION_CHECKLIST',
  'RISK_ASSESSMENT',
] as const;

export type TemplateType = typeof TEMPLATE_TYPES[number];

export const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  PRE_DEPARTURE_CHECKLIST: 'Pre-departure Checklist',
  BRIDGE_WATCHKEEPER_HANDOVER: 'Bridge Watchkeeper Handover',
  ENGINE_ROOM_CHECKLIST: 'Engine Room Checklist',
  SAFETY_DRILL_REPORT: 'Safety Drill Report',
  MEETING_MINUTES: 'Meeting Minutes',
  INCIDENT_REPORT: 'Incident Report',
  AUDIT_FINDING: 'Audit Finding',
  CORRECTIVE_ACTION: 'Corrective Action',
  FAMILIARIZATION_CHECKLIST: 'Familiarization Checklist',
  RISK_ASSESSMENT: 'Risk Assessment',
};

export const TEMPLATE_TYPE_INFO: Record<TemplateType, { description: string; recurrence: string }> = {
  PRE_DEPARTURE_CHECKLIST: { description: 'Pre-departure safety checks', recurrence: 'Per departure' },
  BRIDGE_WATCHKEEPER_HANDOVER: { description: 'Watch handover checklist', recurrence: 'Per watch' },
  ENGINE_ROOM_CHECKLIST: { description: 'Engine room daily checks', recurrence: 'Daily' },
  SAFETY_DRILL_REPORT: { description: 'Drill completion record', recurrence: 'Per drill' },
  MEETING_MINUTES: { description: 'Meeting documentation', recurrence: 'Per meeting' },
  INCIDENT_REPORT: { description: 'Incident documentation', recurrence: 'Per incident' },
  AUDIT_FINDING: { description: 'Audit observation/NC', recurrence: 'Per finding' },
  CORRECTIVE_ACTION: { description: 'CAPA form', recurrence: 'Per action' },
  FAMILIARIZATION_CHECKLIST: { description: 'New crew familiarization', recurrence: 'Per joining' },
  RISK_ASSESSMENT: { description: 'Task risk assessment', recurrence: 'Per task' },
};

// Submission statuses
export const SUBMISSION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'PENDING_SIGNATURE',
  'SIGNED',
  'REJECTED',
  'AMENDED',
  'ARCHIVED',
] as const;

export type SubmissionStatus = typeof SUBMISSION_STATUSES[number];

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  PENDING_SIGNATURE: 'Pending Signature',
  SIGNED: 'Signed',
  REJECTED: 'Rejected',
  AMENDED: 'Amended',
  ARCHIVED: 'Archived',
};

export const SUBMISSION_STATUS_COLORS: Record<SubmissionStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  PENDING_SIGNATURE: 'bg-amber-100 text-amber-800',
  SIGNED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  AMENDED: 'bg-purple-100 text-purple-800',
  ARCHIVED: 'bg-gray-100 text-gray-800',
};

// Signature methods
export const SIGNATURE_METHODS = ['PIN', 'BIOMETRIC', 'DRAWN', 'SSO'] as const;
export type SignatureMethod = typeof SIGNATURE_METHODS[number];

// Signature actions
export const SIGNATURE_ACTIONS = ['SIGNED', 'REJECTED', 'DELEGATED'] as const;
export type SignatureAction = typeof SIGNATURE_ACTIONS[number];

// Template statuses
export const TEMPLATE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type TemplateStatus = typeof TEMPLATE_STATUSES[number];

// Recurrence types
export const RECURRENCE_TYPES = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'PER_EVENT'] as const;
export type RecurrenceType = typeof RECURRENCE_TYPES[number];

// Signature workflow definition
export interface SignatureTransition {
  to: SubmissionStatus;
  requires?: string[];
  action?: string;
  next_if_complete?: SubmissionStatus;
}

export interface SignatureWorkflowState {
  [action: string]: SignatureTransition;
}

export const SIGNATURE_WORKFLOW: Record<SubmissionStatus, SignatureWorkflowState> = {
  DRAFT: {
    submit: {
      to: 'SUBMITTED',
      requires: ['form_complete', 'attachments_valid'],
      action: 'notify_first_signer',
    },
    save: { to: 'DRAFT' },
  },
  SUBMITTED: {
    start_signing: {
      to: 'PENDING_SIGNATURE',
      action: 'lock_form',
    },
  },
  PENDING_SIGNATURE: {
    sign: {
      to: 'PENDING_SIGNATURE',
      requires: ['valid_pin_or_auth'],
      action: 'record_signature',
      next_if_complete: 'SIGNED',
    },
    reject: {
      to: 'REJECTED',
      requires: ['rejection_reason'],
      action: 'notify_submitter',
    },
  },
  SIGNED: {
    amend: {
      to: 'AMENDED',
      requires: ['amendment_reason', 'dpa_approval'],
      action: 'create_amendment_record',
    },
  },
  REJECTED: {
    resubmit: {
      to: 'SUBMITTED',
      requires: ['corrections_made'],
    },
  },
  AMENDED: {
    re_sign: {
      to: 'PENDING_SIGNATURE',
      action: 'request_re_signatures',
    },
  },
  ARCHIVED: {},
};

// Required signers by template type
export const DEFAULT_REQUIRED_SIGNERS: Record<TemplateType, { role: string; order: number; is_mandatory: boolean }[]> = {
  PRE_DEPARTURE_CHECKLIST: [
    { role: 'master', order: 1, is_mandatory: true },
    { role: 'chief_officer', order: 2, is_mandatory: true },
  ],
  BRIDGE_WATCHKEEPER_HANDOVER: [
    { role: 'outgoing_oow', order: 1, is_mandatory: true },
    { role: 'incoming_oow', order: 2, is_mandatory: true },
  ],
  ENGINE_ROOM_CHECKLIST: [
    { role: 'chief_engineer', order: 1, is_mandatory: true },
  ],
  SAFETY_DRILL_REPORT: [
    { role: 'master', order: 1, is_mandatory: true },
    { role: 'safety_officer', order: 2, is_mandatory: false },
  ],
  MEETING_MINUTES: [
    { role: 'chairman', order: 1, is_mandatory: true },
    { role: 'secretary', order: 2, is_mandatory: true },
  ],
  INCIDENT_REPORT: [
    { role: 'reporting_officer', order: 1, is_mandatory: true },
    { role: 'master', order: 2, is_mandatory: true },
  ],
  AUDIT_FINDING: [
    { role: 'auditor', order: 1, is_mandatory: true },
    { role: 'master', order: 2, is_mandatory: true },
  ],
  CORRECTIVE_ACTION: [
    { role: 'responsible_person', order: 1, is_mandatory: true },
    { role: 'dpa', order: 2, is_mandatory: true },
  ],
  FAMILIARIZATION_CHECKLIST: [
    { role: 'new_crew', order: 1, is_mandatory: true },
    { role: 'supervisor', order: 2, is_mandatory: true },
    { role: 'master', order: 3, is_mandatory: true },
  ],
  RISK_ASSESSMENT: [
    { role: 'assessor', order: 1, is_mandatory: true },
    { role: 'master', order: 2, is_mandatory: true },
  ],
};

// Form categories
export const FORM_CATEGORIES = [
  'Safety',
  'Operations',
  'Navigation',
  'Engineering',
  'Environmental',
  'Security',
  'Crew Management',
  'Audit',
  'General',
] as const;

export type FormCategory = typeof FORM_CATEGORIES[number];

// Helper functions
export function canTransition(
  currentStatus: SubmissionStatus,
  action: string
): SignatureTransition | null {
  const stateTransitions = SIGNATURE_WORKFLOW[currentStatus];
  if (!stateTransitions) return null;
  return stateTransitions[action] || null;
}

export function getAvailableActions(currentStatus: SubmissionStatus): string[] {
  const stateTransitions = SIGNATURE_WORKFLOW[currentStatus];
  if (!stateTransitions) return [];
  return Object.keys(stateTransitions);
}

export function generateSubmissionNumber(
  templateCode: string,
  vesselName: string,
  year: number,
  sequence: number
): string {
  const vesselAbbr = vesselName.substring(0, 5).toUpperCase().replace(/\s/g, '');
  return `${templateCode}-${vesselAbbr}-${year}-${String(sequence).padStart(5, '0')}`;
}

export function generateContentHash(formData: Record<string, unknown>): string {
  // Simple hash for integrity verification
  const content = JSON.stringify(formData);
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}
