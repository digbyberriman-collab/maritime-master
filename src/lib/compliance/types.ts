// Compliance, GDPR, and Data Retention Types

// Record lifecycle status
export type RecordLifecycleStatus =
  | 'active'
  | 'pending_archive'
  | 'archived'
  | 'pending_deletion'
  | 'anonymized';

// GDPR lawful basis
export type GDPRLawfulBasis =
  | 'consent'
  | 'contractual'
  | 'legal_obligation'
  | 'vital_interests'
  | 'public_task'
  | 'legitimate_interest';

// HR record types
export type HRRecordType =
  | 'employment_contract'
  | 'salary_compensation'
  | 'pay_review'
  | 'annual_review'
  | 'performance_evaluation'
  | 'rotation_catchup'
  | 'disciplinary_minor'
  | 'disciplinary_serious'
  | 'welfare_note'
  | 'training_record'
  | 'leave_record'
  | 'medical_record';

// Data retention policy
export interface DataRetentionPolicy {
  id: string;
  company_id: string;
  record_type: HRRecordType;
  retention_years: number;
  retention_trigger: 'record_end_date' | 'termination_date' | 'last_payment_date';
  auto_archive: boolean;
  require_dpa_approval_for_deletion: boolean;
  gdpr_purpose: string;
  gdpr_lawful_basis: GDPRLawfulBasis;
  data_owner: string;
  created_at: string;
  updated_at: string;
}

// HR record metadata for retention tracking
export interface HRRecordMetadata {
  id: string;
  company_id: string;
  user_id: string;
  record_type: HRRecordType;
  record_id: string;
  source_table: string;
  lifecycle_status: RecordLifecycleStatus;
  retention_start_date: string;
  retention_end_date: string;
  archived_at?: string;
  archived_by?: string;
  anonymized_at?: string;
  anonymized_by?: string;
  last_accessed_at?: string;
  last_accessed_by?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

// GDPR data subject request
export interface GDPRRequest {
  id: string;
  company_id: string;
  subject_user_id: string;
  request_type: 'access' | 'rectification' | 'erasure' | 'portability' | 'restriction' | 'objection';
  status: 'pending' | 'in_progress' | 'completed' | 'rejected';
  requested_at: string;
  requested_by: string;
  processed_by?: string;
  processed_at?: string;
  response_notes?: string;
  export_file_url?: string;
  deadline_date: string;
  created_at: string;
  updated_at: string;
}

// Insurance policy
export interface InsurancePolicy {
  id: string;
  company_id: string;
  vessel_id?: string;
  policy_type: string;
  policy_number: string;
  insurer_name: string;
  insurer_contact?: string;
  coverage_start_date: string;
  coverage_end_date: string;
  coverage_amount?: number;
  premium_amount?: number; // SENSITIVE
  deductible_amount?: number; // SENSITIVE
  certificate_url?: string;
  policy_document_url?: string;
  status: 'active' | 'expired' | 'cancelled' | 'pending_renewal';
  notes?: string; // SENSITIVE
  lifecycle_status: RecordLifecycleStatus;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

// Insurance claim
export interface InsuranceClaim {
  id: string;
  company_id: string;
  policy_id: string;
  claim_number: string;
  claim_date: string;
  incident_description: string;
  claim_amount?: number; // SENSITIVE
  settlement_amount?: number; // SENSITIVE
  status: 'open' | 'under_review' | 'approved' | 'rejected' | 'settled' | 'closed';
  correspondence_notes?: string; // HIGHLY SENSITIVE
  attachments?: string[];
  lifecycle_status: RecordLifecycleStatus;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

// Insurance audit session
export interface InsuranceAuditSession {
  id: string;
  company_id: string;
  vessel_id?: string;
  audit_party: string;
  auditor_name?: string;
  auditor_email?: string;
  start_datetime: string;
  end_datetime: string;
  is_active: boolean;
  access_token?: string;
  access_token_expires_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Compliance access log entry
export interface ComplianceAccessLog {
  id: string;
  company_id: string;
  user_id: string;
  user_role: string;
  module: 'hr' | 'insurance' | 'crew' | 'incidents';
  action: 'view' | 'export' | 'edit' | 'archive' | 'anonymize' | 'delete';
  entity_type: string;
  entity_id: string;
  accessed_fields?: string[];
  is_audit_mode: boolean;
  audit_session_id?: string;
  ip_address?: string;
  user_agent?: string;
  access_granted: boolean;
  denial_reason?: string;
  created_at: string;
}

// HR audit access grant
export interface HRAuditAccessGrant {
  id: string;
  company_id: string;
  audit_session_id: string;
  granted_access_level: 'none' | 'employment_only' | 'limited' | 'full';
  allowed_fields: string[];
  denied_fields: string[];
  granted_by: string;
  granted_at: string;
  expires_at: string;
  revoked_at?: string;
  revoked_by?: string;
  notes?: string;
}

// Audit-safe view of insurance policy (redacted for auditors)
export interface InsurancePolicyAuditView {
  id: string;
  policy_type: string;
  insurer_name: string;
  coverage_start_date: string;
  coverage_end_date: string;
  certificate_url?: string;
  status: string;
  // All sensitive fields are OMITTED
}

// HR field access levels
export const HR_FIELD_ACCESS_LEVELS = {
  // Fields always accessible to auditors (if HR access granted)
  employment_only: [
    'employment_exists',
    'contract_valid',
    'position',
    'department',
    'vessel_assignment',
  ],
  // Additional fields for limited access
  limited: [
    'start_date',
    'end_date',
    'contract_type',
    'nationality',
    'certification_status',
  ],
  // Fields NEVER accessible to auditors
  always_denied: [
    'salary',
    'compensation',
    'pay_review',
    'annual_review',
    'performance_evaluation',
    'disciplinary',
    'welfare',
    'medical',
    'emergency_contact',
    'bank_details',
    'tax_info',
  ],
} as const;

// Insurance field access levels
export const INSURANCE_FIELD_ACCESS_LEVELS = {
  // Fields accessible to auditors
  auditor_visible: [
    'policy_type',
    'policy_number',
    'insurer_name',
    'coverage_start_date',
    'coverage_end_date',
    'certificate_url',
    'status',
  ],
  // Fields NEVER accessible to auditors
  auditor_hidden: [
    'premium_amount',
    'deductible_amount',
    'coverage_amount',
    'notes',
    'claim_amount',
    'settlement_amount',
    'correspondence_notes',
  ],
} as const;

// GDPR mapping for HR tabs
export const HR_GDPR_MAPPING: Record<HRRecordType, {
  purpose: string;
  lawful_basis: GDPRLawfulBasis;
  retention_years: number;
  data_owner: string;
}> = {
  employment_contract: {
    purpose: 'Legal compliance and employment record keeping',
    lawful_basis: 'legal_obligation',
    retention_years: 7,
    data_owner: 'Company',
  },
  salary_compensation: {
    purpose: 'Tax and payroll compliance',
    lawful_basis: 'legal_obligation',
    retention_years: 7,
    data_owner: 'Company',
  },
  pay_review: {
    purpose: 'Compensation management and audit trail',
    lawful_basis: 'legitimate_interest',
    retention_years: 5,
    data_owner: 'Company',
  },
  annual_review: {
    purpose: 'Performance management and development',
    lawful_basis: 'legitimate_interest',
    retention_years: 5,
    data_owner: 'Company',
  },
  performance_evaluation: {
    purpose: 'Performance management',
    lawful_basis: 'legitimate_interest',
    retention_years: 3,
    data_owner: 'Company',
  },
  rotation_catchup: {
    purpose: 'Crew welfare and management',
    lawful_basis: 'legitimate_interest',
    retention_years: 2,
    data_owner: 'Company',
  },
  disciplinary_minor: {
    purpose: 'Workplace conduct management',
    lawful_basis: 'legitimate_interest',
    retention_years: 2,
    data_owner: 'Company',
  },
  disciplinary_serious: {
    purpose: 'Legal compliance and safety',
    lawful_basis: 'legal_obligation',
    retention_years: 7,
    data_owner: 'Company',
  },
  welfare_note: {
    purpose: 'Crew welfare support',
    lawful_basis: 'legitimate_interest',
    retention_years: 3,
    data_owner: 'Company',
  },
  training_record: {
    purpose: 'Compliance and certification',
    lawful_basis: 'legal_obligation',
    retention_years: 7,
    data_owner: 'Company',
  },
  leave_record: {
    purpose: 'Leave management and compliance',
    lawful_basis: 'contractual',
    retention_years: 3,
    data_owner: 'Company',
  },
  medical_record: {
    purpose: 'Health and safety compliance',
    lawful_basis: 'legal_obligation',
    retention_years: 7,
    data_owner: 'Company',
  },
};

// Retention status helper
export function getRetentionStatus(retentionEndDate: string): 'active' | 'expiring_soon' | 'expired' {
  const endDate = new Date(retentionEndDate);
  const now = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  
  if (endDate < now) {
    return 'expired';
  } else if (endDate < thirtyDaysFromNow) {
    return 'expiring_soon';
  }
  return 'active';
}

// Check if a field should be redacted for audit access
export function isFieldRedactedForAudit(
  module: 'hr' | 'insurance',
  fieldName: string,
  accessLevel?: 'none' | 'employment_only' | 'limited' | 'full'
): boolean {
  if (module === 'insurance') {
    return INSURANCE_FIELD_ACCESS_LEVELS.auditor_hidden.includes(fieldName as any);
  }
  
  if (module === 'hr') {
    // HR is fully redacted by default
    if (!accessLevel || accessLevel === 'none') {
      return true;
    }
    
    // Always denied fields
    if (HR_FIELD_ACCESS_LEVELS.always_denied.includes(fieldName as any)) {
      return true;
    }
    
    // Check access level
    if (accessLevel === 'employment_only') {
      return !HR_FIELD_ACCESS_LEVELS.employment_only.includes(fieldName as any);
    }
    
    if (accessLevel === 'limited') {
      return !(
        HR_FIELD_ACCESS_LEVELS.employment_only.includes(fieldName as any) ||
        HR_FIELD_ACCESS_LEVELS.limited.includes(fieldName as any)
      );
    }
    
    // Full access - only always_denied fields are redacted
    return false;
  }
  
  return false;
}
