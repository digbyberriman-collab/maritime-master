// =====================================================
// ELECTRONIC FORMS SYSTEM CONSTANTS
// Shared constants for form templates and submissions
// =====================================================

// Field type definitions - used in template builder and form renderer
export const FIELD_TYPES = [
  { value: 'text', label: 'Text Input', icon: '📝' },
  { value: 'textarea', label: 'Text Area', icon: '📄' },
  { value: 'checkbox', label: 'Checkbox', icon: '☑️' },
  { value: 'yes_no', label: 'Yes / No', icon: '✓✗' },
  { value: 'yes_no_na', label: 'Yes / No / N/A', icon: '✓✗−' },
  { value: 'date', label: 'Date', icon: '📅' },
  { value: 'datetime', label: 'Date & Time', icon: '🕐' },
  { value: 'time', label: 'Time Only', icon: '⏰' },
  { value: 'number', label: 'Number', icon: '#' },
  { value: 'dropdown', label: 'Dropdown', icon: '▼' },
  { value: 'signature', label: 'Signature', icon: '✍️' },
  { value: 'table', label: 'Table Grid', icon: '▦' },
  { value: 'file', label: 'File Upload', icon: '📎' },
  { value: 'section', label: 'Section Header', icon: '§' }
] as const;

export type FieldType = typeof FIELD_TYPES[number]['value'];

// Form type definitions - categorization for templates
export const FORM_TYPES = [
  { value: 'CHECKLIST', label: 'Checklist', icon: '☑️' },
  { value: 'REPORT', label: 'Report', icon: '📋' },
  { value: 'MEETING_MINUTES', label: 'Meeting Minutes', icon: '📝' },
  { value: 'DRILL_REPORT', label: 'Drill Report', icon: '🚨' },
  { value: 'HANDOVER', label: 'Handover', icon: '🔄' },
  { value: 'AUDIT_FORM', label: 'Audit Form', icon: '🔍' },
  { value: 'RISK_ASSESSMENT', label: 'Risk Assessment', icon: '⚠️' },
  { value: 'INSPECTION', label: 'Inspection', icon: '👁️' },
  { value: 'PERMIT_TO_WORK', label: 'Permit to Work', icon: '🔒' },
  { value: 'OTHER', label: 'Other', icon: '📄' }
] as const;

export type FormType = typeof FORM_TYPES[number]['value'];

// Form/Template statuses.
// These are exactly the values form_templates_status_check allows: the list
// used to carry UNDER_REVIEW and SUPERSEDED as well, which the column has
// never held and now rejects.
export const FORM_TEMPLATE_STATUSES = [
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED',
] as const;

export type FormTemplateStatus = typeof FORM_TEMPLATE_STATUSES[number];

export const FORM_TEMPLATE_STATUS_CONFIG: Record<FormTemplateStatus, { label: string; color: string }> = {
  DRAFT: { label: 'Draft', color: 'bg-muted text-muted-foreground' },
  PUBLISHED: { label: 'Published', color: 'bg-green-100 text-green-800' },
  ARCHIVED: { label: 'Archived', color: 'bg-gray-100 text-gray-800' },
};

// Submission statuses, exactly as form_submissions_status_check allows.
// SUBMITTED and EXPIRED were in this list and in no transition: a form goes
// DRAFT or IN_PROGRESS, then PENDING_SIGNATURE, then SIGNED or REJECTED.
export const FORM_SUBMISSION_STATUSES = [
  'DRAFT',
  'IN_PROGRESS',
  'PENDING_SIGNATURE',
  'SIGNED',
  'REJECTED',
  'AMENDED',
  'ARCHIVED',
] as const;

export type FormSubmissionStatus = typeof FORM_SUBMISSION_STATUSES[number];

export const FORM_SUBMISSION_STATUS_CONFIG: Record<FormSubmissionStatus, { label: string; color: string }> = {
  DRAFT: { label: 'Draft', color: 'bg-muted text-muted-foreground' },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
  PENDING_SIGNATURE: { label: 'Pending Signature', color: 'bg-amber-100 text-amber-800' },
  SUBMITTED: { label: 'Submitted', color: 'bg-blue-100 text-blue-800' },
  SIGNED: { label: 'Signed', color: 'bg-green-100 text-green-800' },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-800' },
  EXPIRED: { label: 'Expired', color: 'bg-gray-100 text-gray-800' },
  AMENDED: { label: 'Amended', color: 'bg-purple-100 text-purple-800' },
  ARCHIVED: { label: 'Archived', color: 'bg-gray-100 text-gray-800' }
};

// Signature types
export const SIGNATURE_TYPES = ['TYPED', 'DRAWN', 'PIN', 'BIOMETRIC'] as const;
export type SignatureType = typeof SIGNATURE_TYPES[number];

// Signature statuses
export const SIGNATURE_STATUSES = ['PENDING', 'SIGNED', 'REJECTED', 'DELEGATED', 'SKIPPED'] as const;
export type SignatureStatus = typeof SIGNATURE_STATUSES[number];

// Vessel scope options
export const VESSEL_SCOPE_OPTIONS = [
  { value: 'FLEET', label: 'Fleet-wide (All Vessels)' },
  { value: 'VESSEL_SPECIFIC', label: 'Specific Vessels' }
] as const;

// Department scope options
export const DEPARTMENT_SCOPE_OPTIONS = [
  { value: 'ALL', label: 'All Departments' },
  { value: 'DECK', label: 'Deck' },
  { value: 'ENGINE', label: 'Engine' },
  { value: 'INTERIOR', label: 'Interior' },
  { value: 'GALLEY', label: 'Galley' }
] as const;

// Initiation mode options
export const INITIATION_MODE_OPTIONS = [
  { value: 'MANUAL', label: 'Manual Only' },
  { value: 'SCHEDULED', label: 'Scheduled Only' },
  { value: 'BOTH', label: 'Both Manual & Scheduled' }
] as const;

// Recurrence type options
export const RECURRENCE_TYPE_OPTIONS = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'ANNUALLY', label: 'Annually' },
  { value: 'CUSTOM', label: 'Custom (Cron)' }
] as const;

// Common signer roles for maritime operations
export const SIGNER_ROLES = [
  { value: 'captain', label: 'Master/Captain' },
  { value: 'chief_officer', label: 'Chief Officer' },
  { value: 'chief_engineer', label: 'Chief Engineer' },
  { value: 'second_officer', label: 'Second Officer' },
  { value: 'second_engineer', label: 'Second Engineer' },
  { value: 'safety_officer', label: 'Safety Officer' },
  { value: 'bosun', label: 'Bosun' },
  { value: 'purser', label: 'Purser' },
  { value: 'chief_steward', label: 'Chief Steward' },
  { value: 'dpa', label: 'DPA' }
] as const;

// TypeScript interfaces for form schema
export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: string[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  conditionalOn?: {
    fieldId: string;
    operator: 'equals' | 'not_equals' | 'contains';
    value: string;
  };
  tableConfig?: {
    columns: Array<{ id: string; label: string; type: string }>;
    minRows?: number;
    maxRows?: number;
  };
  pageNumber?: number;
}

export interface FormPage {
  id: string;
  number: number;
  title?: string;
  fields: string[]; // Field IDs on this page
}

export interface FormSchema {
  pages: FormPage[];
  fields: FormField[];
  layout?: {
    columnsPerRow?: number;
    showPageNumbers?: boolean;
  };
  conditionalRules?: Array<{
    sourceFieldId: string;
    targetFieldId: string;
    condition: string;
    action: 'show' | 'hide' | 'require';
  }>;
}

export interface RequiredSigner {
  role: string;
  order: number;
  signature_type: SignatureType;
  is_mandatory: boolean;
}

// Helper functions
export function getFieldTypeInfo(type: string) {
  return FIELD_TYPES.find(t => t.value === type) || { value: type, label: type, icon: '📄' };
}

export function getFormTypeInfo(type: string) {
  return FORM_TYPES.find(t => t.value === type) || { value: type, label: type, icon: '📄' };
}

export function getTemplateStatusConfig(status: string) {
  return FORM_TEMPLATE_STATUS_CONFIG[status as FormTemplateStatus] || { label: status, color: 'bg-muted' };
}

export function getSubmissionStatusConfig(status: string) {
  return FORM_SUBMISSION_STATUS_CONFIG[status as FormSubmissionStatus] || { label: status, color: 'bg-muted' };
}


