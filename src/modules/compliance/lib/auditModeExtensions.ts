// Extended Audit Mode Rules for HR and Insurance
// These extend the base audit mode rules in src/lib/permissions/auditModeRules.ts

import type { AuditModeConfig } from '@/modules/auth/lib/auditModeRules';

// Insurance Audit Mode Configuration
export const INSURANCE_AUDIT_MODE_CONFIG: AuditModeConfig = {
  allowed_modules: [
    'insurance_policies', // View only
    'insurance_certificates', // View only
  ],
  
  redacted_fields: [
    'insurance_policies.premium_amount',
    'insurance_policies.deductible_amount',
    'insurance_policies.coverage_amount',
    'insurance_policies.notes',
    'insurance_claims.*', // All claims data hidden
  ],
  
  allowed_actions: ['view', 'export_pdf'],
  
  data_scope: {
    vessels: 'assigned_for_audit',
    date_range: 'audit_period_only',
  },
};

// HR Audit Mode Configuration (Default: NO ACCESS)
export const HR_AUDIT_MODE_CONFIG: AuditModeConfig = {
  allowed_modules: [], // No HR modules by default
  
  redacted_fields: [
    'profiles.salary',
    'profiles.compensation',
    'profiles.bank_details',
    'profiles.tax_info',
    'profiles.medical_details',
    'profiles.emergency_contact_phone',
    'profiles.welfare_notes',
    'profiles.disciplinary_records',
    'crew_contracts.salary',
    'crew_contracts.benefits',
    'salary_records.*',
    'pay_reviews.*',
    'annual_reviews.*',
    'performance_evaluations.*',
    'disciplinary_records.*',
    'welfare_notes.*',
    'medical_records.*',
  ],
  
  allowed_actions: [], // No actions by default
  
  data_scope: {
    vessels: 'assigned_for_audit',
  },
};

// HR Audit Mode with explicit employment-only access
export const HR_AUDIT_MODE_EMPLOYMENT_ONLY: AuditModeConfig = {
  allowed_modules: [
    'crew_roster_summary', // Limited view
  ],
  
  redacted_fields: [
    ...HR_AUDIT_MODE_CONFIG.redacted_fields,
    'profiles.date_of_birth',
    'profiles.personal_phone',
    'profiles.personal_email',
    'profiles.home_address',
    'profiles.passport_number',
    'profiles.visa_details',
  ],
  
  allowed_actions: ['view'],
  
  data_scope: {
    vessels: 'assigned_for_audit',
  },
};

// Fields that can NEVER be shown to auditors regardless of access level
export const HR_ABSOLUTELY_RESTRICTED_FIELDS = [
  'salary',
  'compensation',
  'bank_details',
  'tax_info',
  'disciplinary_records',
  'welfare_notes',
  'medical_records',
  'pay_reviews',
  'annual_reviews',
  'performance_evaluations',
] as const;

// Fields that can NEVER be shown to auditors for insurance
export const INSURANCE_ABSOLUTELY_RESTRICTED_FIELDS = [
  'premium_amount',
  'deductible_amount',
  'claim_amount',
  'settlement_amount',
  'correspondence_notes',
  'claims', // All claims data
] as const;

// Audit view transformer for insurance policies
export function transformInsurancePolicyForAudit<T extends Record<string, unknown>>(
  policy: T
): Partial<T> {
  const auditSafeFields = [
    'id',
    'policy_type',
    'policy_number',
    'insurer_name',
    'coverage_start_date',
    'coverage_end_date',
    'certificate_url',
    'status',
    'vessel_id',
  ];
  
  const result: Partial<T> = {};
  
  for (const field of auditSafeFields) {
    if (field in policy) {
      result[field as keyof T] = policy[field as keyof T];
    }
  }
  
  return result;
}

// Audit view transformer for HR/crew data
export function transformHRDataForAudit<T extends Record<string, unknown>>(
  data: T,
  accessLevel: 'none' | 'employment_only' | 'limited' | 'full'
): Partial<T> | { access_denied: true } {
  if (accessLevel === 'none') {
    return { access_denied: true };
  }
  
  const employmentOnlyFields = [
    'id',
    'user_id',
    'full_name', // Just existence confirmation
    'position',
    'department',
    'vessel_id',
    'contract_valid', // Boolean only
    'employment_status',
  ];
  
  const limitedFields = [
    ...employmentOnlyFields,
    'start_date',
    'end_date',
    'contract_type',
    'nationality',
    'rank',
  ];
  
  const allowedFields = accessLevel === 'employment_only' 
    ? employmentOnlyFields 
    : accessLevel === 'limited' 
      ? limitedFields 
      : Object.keys(data).filter(
          (f) => !HR_ABSOLUTELY_RESTRICTED_FIELDS.includes(f as any)
        );
  
  const result: Partial<T> = {};
  
  for (const field of allowedFields) {
    if (field in data) {
      result[field as keyof T] = data[field as keyof T];
    }
  }
  
  // Add masked indicators for restricted fields
  for (const field of HR_ABSOLUTELY_RESTRICTED_FIELDS) {
    if (field in data) {
      (result as any)[field] = '[REDACTED]';
    }
  }
  
  return result;
}

// Check if audit session is currently active
export function isAuditSessionActive(session: {
  is_active: boolean;
  start_datetime: string;
  end_datetime: string;
}): boolean {
  if (!session.is_active) return false;
  
  const now = new Date();
  const start = new Date(session.start_datetime);
  const end = new Date(session.end_datetime);
  
  return now >= start && now <= end;
}

// Generate audit access token
export function generateAuditAccessToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
