// =====================================================
// ISM FORMS SYSTEM - CORE TYPES
// Comprehensive type definitions for form templates,
// submissions, signatures, and schedules
// =====================================================

import type { Json } from '@/integrations/supabase/types';

// ============== USER & ROLE TYPES ==============

export type UserRole = 
  | 'captain' 
  | 'chief_officer' 
  | 'chief_engineer' 
  | 'chief_steward'
  | 'second_officer'
  | 'second_engineer'
  | 'safety_officer'
  | 'bosun'
  | 'purser'
  | 'dpa'
  | 'crew'
  | 'owner'
  | 'management';

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  captain: 'Master/Captain',
  chief_officer: 'Chief Officer',
  chief_engineer: 'Chief Engineer',
  chief_steward: 'Chief Steward',
  second_officer: 'Second Officer',
  second_engineer: 'Second Engineer',
  safety_officer: 'Safety Officer',
  bosun: 'Bosun',
  purser: 'Purser',
  dpa: 'DPA',
  crew: 'Crew',
  owner: 'Owner',
  management: 'Management',
};

// ============== FIELD TYPES ==============

export type FieldType = 
  | 'text_input'
  | 'text_area'
  | 'checkbox'
  | 'yes_no'
  | 'yes_no_na'
  | 'date'
  | 'datetime'
  | 'time'
  | 'numeric'
  | 'dropdown'
  | 'header'
  | 'divider'
  | 'instructions'
  | 'signature';

export const FIELD_TYPE_CONFIG: Record<FieldType, { label: string; icon: string }> = {
  text_input: { label: 'Text Input', icon: '📝' },
  text_area: { label: 'Text Area', icon: '📄' },
  checkbox: { label: 'Checkbox', icon: '☑️' },
  yes_no: { label: 'Yes / No', icon: '✓✗' },
  yes_no_na: { label: 'Yes / No / N/A', icon: '✓✗−' },
  date: { label: 'Date', icon: '📅' },
  datetime: { label: 'Date & Time', icon: '🕐' },
  time: { label: 'Time', icon: '⏰' },
  numeric: { label: 'Number', icon: '#' },
  dropdown: { label: 'Dropdown', icon: '▼' },
  header: { label: 'Section Header', icon: '§' },
  divider: { label: 'Divider', icon: '―' },
  instructions: { label: 'Instructions', icon: 'ℹ️' },
  signature: { label: 'Signature', icon: '✍️' },
};

// ============== TEMPLATE FIELD ==============

export interface TemplateField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  helperText?: string;
  options?: string[]; // for dropdowns
  requireCommentOnNo?: boolean; // for yes_no fields
  page: number;
  order: number;
}

// ============== SIGNATURE REQUIREMENT ==============

export interface SignatureRequirement {
  id: string;
  role: UserRole;
  label: string; // e.g., "Master's Signature"
  required: boolean;
  order: number; // for sequential signing
}

// ============== FORM TEMPLATE ==============

export type FormCategory = 
  | 'safety'
  | 'operations'
  | 'maintenance'
  | 'crew'
  | 'environmental'
  | 'security'
  | 'navigation'
  | 'medical'
  | 'drills'
  | 'inspections'
  | 'handover'
  | 'other';

export const FORM_CATEGORY_CONFIG: Record<FormCategory, { label: string; icon: string; color: string }> = {
  safety: { label: 'Safety', icon: '🛡️', color: 'bg-red-100 text-red-800' },
  operations: { label: 'Operations', icon: '⚙️', color: 'bg-blue-100 text-blue-800' },
  maintenance: { label: 'Maintenance', icon: '🔧', color: 'bg-amber-100 text-amber-800' },
  crew: { label: 'Crew', icon: '👥', color: 'bg-purple-100 text-purple-800' },
  environmental: { label: 'Environmental', icon: '🌊', color: 'bg-green-100 text-green-800' },
  security: { label: 'Security', icon: '🔒', color: 'bg-slate-100 text-slate-800' },
  navigation: { label: 'Navigation', icon: '🧭', color: 'bg-indigo-100 text-indigo-800' },
  medical: { label: 'Medical', icon: '🏥', color: 'bg-pink-100 text-pink-800' },
  drills: { label: 'Drills', icon: '🚨', color: 'bg-orange-100 text-orange-800' },
  inspections: { label: 'Inspections', icon: '🔍', color: 'bg-cyan-100 text-cyan-800' },
  handover: { label: 'Handover', icon: '🔄', color: 'bg-teal-100 text-teal-800' },
  other: { label: 'Other', icon: '📋', color: 'bg-gray-100 text-gray-800' },
};

export type TemplateStatus = 'draft' | 'under_review' | 'published' | 'archived';

export const TEMPLATE_STATUS_CONFIG: Record<TemplateStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  under_review: { label: 'Under Review', variant: 'outline' },
  published: { label: 'Published', variant: 'default' },
  archived: { label: 'Archived', variant: 'destructive' },
};

export interface FormTemplate {
  id: string;
  name: string;
  description: string;
  category: FormCategory;
  status: TemplateStatus;
  version: number;
  fields: TemplateField[];
  signature_requirements: SignatureRequirement[];
  sequential_signing: boolean;
  total_pages: number;
  vessel_scope: 'all' | 'specific';
  vessel_ids?: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ============== FORM SUBMISSION ==============

export interface FieldValue {
  field_id: string;
  value: unknown;
  comment?: string; // for "No" responses that require comments
}

export interface Signature {
  id: string;
  requirement_id: string;
  user_id: string;
  user_name: string;
  role: UserRole;
  signed_at: string;
  signature_data?: string; // base64 drawn signature (optional)
}

export type SubmissionStatus = 
  | 'draft'
  | 'submitted'
  | 'pending_signatures'
  | 'fully_signed'
  | 'archived'
  | 'amended';

export const SUBMISSION_STATUS_CONFIG: Record<SubmissionStatus, { label: string; color: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', color: 'bg-amber-100 text-amber-800', variant: 'secondary' },
  submitted: { label: 'Submitted', color: 'bg-blue-100 text-blue-800', variant: 'outline' },
  pending_signatures: { label: 'Pending Signatures', color: 'bg-orange-100 text-orange-800', variant: 'outline' },
  fully_signed: { label: 'Completed', color: 'bg-green-100 text-green-800', variant: 'default' },
  archived: { label: 'Archived', color: 'bg-gray-100 text-gray-800', variant: 'secondary' },
  amended: { label: 'Amended', color: 'bg-purple-100 text-purple-800', variant: 'outline' },
};

export interface FormSubmission {
  id: string;
  template_id: string;
  template_version: number;
  vessel_id: string;
  submission_number: string; // e.g., "FRM-2024-001234"
  status: SubmissionStatus;
  field_values: FieldValue[];
  signatures: Signature[];
  created_by: string;
  created_at: string;
  updated_at?: string;
  submitted_at?: string;
  amendment_of?: string; // ID of original submission if this is an amendment
  amendment_reason?: string;
  // Joined data
  template?: FormTemplate;
  vessel?: { id: string; name: string };
  creator?: { id: string; full_name: string };
}

// ============== LINE ITEMS ==============

export interface LineItem {
  id: string;
  type: 'checkbox' | 'yes_no' | 'text';
  label: string;
  value: unknown;
  added_by: string;
  added_at: string;
}

// ============== FORM SCHEDULE ==============

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually';

export const SCHEDULE_FREQUENCY_CONFIG: Record<ScheduleFrequency, { label: string; days: number }> = {
  daily: { label: 'Daily', days: 1 },
  weekly: { label: 'Weekly', days: 7 },
  monthly: { label: 'Monthly', days: 30 },
  quarterly: { label: 'Quarterly', days: 90 },
  annually: { label: 'Annually', days: 365 },
};

export interface FormSchedule {
  id: string;
  template_id: string;
  vessel_id: string;
  frequency: ScheduleFrequency;
  start_date: string;
  end_date?: string;
  next_due: string;
  days_before_due_reminder: number;
  days_until_expiry: number;
  is_active: boolean;
  created_by: string;
  // Joined data
  template?: FormTemplate;
  vessel?: { id: string; name: string };
}

// ============== HELPER FUNCTIONS ==============

export function generateSubmissionNumber(year: number, sequence: number): string {
  return `FRM-${year}-${String(sequence).padStart(6, '0')}`;
}

export function getFieldTypeConfig(type: string): { label: string; icon: string } {
  return FIELD_TYPE_CONFIG[type as FieldType] || { label: type, icon: '📄' };
}

export function getCategoryConfig(category: string): { label: string; icon: string; color: string } {
  return FORM_CATEGORY_CONFIG[category as FormCategory] || FORM_CATEGORY_CONFIG.other;
}

export function getStatusConfig(status: string): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  return TEMPLATE_STATUS_CONFIG[status as TemplateStatus] || { label: status, variant: 'secondary' };
}

export function getSubmissionStatusConfig(status: string): { label: string; color: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  return SUBMISSION_STATUS_CONFIG[status as SubmissionStatus] || SUBMISSION_STATUS_CONFIG.draft;
}

// Calculate signing progress
export function getSigningProgress(submission: FormSubmission): { collected: number; required: number; isComplete: boolean } {
  const collected = submission.signatures.length;
  const required = submission.template?.signature_requirements?.filter(s => s.required).length || 0;
  return {
    collected,
    required,
    isComplete: collected >= required,
  };
}

// Check if it's user's turn to sign (for sequential signing)
export function isUsersTurnToSign(
  submission: FormSubmission,
  userId: string,
  userRole: UserRole
): boolean {
  const template = submission.template;
  if (!template) return false;

  // Find matching signature requirement for user's role
  const matchingRequirement = template.signature_requirements.find(
    req => req.role === userRole
  );
  if (!matchingRequirement) return false;

  // If parallel signing, always allow
  if (!template.sequential_signing) return true;

  // For sequential, check if previous signatures are complete
  const previousRequirements = template.signature_requirements.filter(
    req => req.order < matchingRequirement.order
  );

  const allPreviousSigned = previousRequirements.every(req =>
    submission.signatures.some(sig => sig.requirement_id === req.id)
  );

  return allPreviousSigned;
}

// Check if a draft is stale (older than 7 days)
export function isDraftStale(submission: FormSubmission): boolean {
  if (submission.status !== 'draft') return false;
  const createdDate = new Date(submission.created_at);
  const now = new Date();
  const daysDiff = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
  return daysDiff > 7;
}

// Get draft age in days
export function getDraftAge(submission: FormSubmission): number {
  const createdDate = new Date(submission.created_at);
  const now = new Date();
  return Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
}
