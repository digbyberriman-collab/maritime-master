// Audit-Mode Visibility Rules
// Default: DENY ALL, then explicit ALLOW

export interface AuditModeConfig {
  allowed_modules: string[];
  redacted_fields: string[];
  allowed_actions: string[];
  data_scope: {
    vessels?: 'assigned_for_audit' | 'all';
    date_range?: 'audit_period_only' | 'all';
  };
  rate_limit?: string;
}

export const AUDIT_MODE_RULES: Record<string, AuditModeConfig> = {
  auditor_flag: {
    allowed_modules: [
      'vessel_profile',
      'vessel_certificates',
      'crew_roster', // names, ranks, cert validity only
      'crew_certificates',
      'sms_submissions', // completed forms only
      'drills',
      'training_records',
      'incidents', // severity, date, status - no names
      'corrective_actions',
      'audit_history',
      // Insurance - limited view
      'insurance_policies_summary',
    ],

    redacted_fields: [
      'crew.salary',
      'crew.medical_details',
      'crew.disciplinary_records',
      'crew.personal_phone',
      'crew.emergency_contact',
      'incident.crew_names', // show as "Crew Member A"
      'maintenance.*', // all maintenance hidden
      'defects.cost',
      'commercial.*',
      // HR - ALL HIDDEN by default
      'hr.*',
      'profiles.salary',
      'profiles.compensation',
      'profiles.bank_details',
      'profiles.tax_info',
      'profiles.welfare_notes',
      'profiles.disciplinary',
      'profiles.pay_reviews',
      'profiles.annual_reviews',
      'profiles.performance_evaluations',
      'profiles.medical_records',
      // Insurance - sensitive fields
      'insurance_policies.premium_amount',
      'insurance_policies.deductible_amount',
      'insurance_policies.coverage_amount',
      'insurance_policies.notes',
      'insurance_claims.*', // all claims hidden
    ],

    allowed_actions: ['view', 'export_pdf'],

    data_scope: {
      vessels: 'assigned_for_audit',
      date_range: 'audit_period_only',
    },
  },

  auditor_class: {
    allowed_modules: [
      'vessel_profile',
      'vessel_certificates',
      'survey_records',
      'defects', // class-related only
      'ism_critical_equipment',
      'corrective_actions', // class-related only
      // Insurance - certificate view only
      'insurance_certificates',
    ],

    redacted_fields: [
      'crew.*', // all crew data hidden
      'hr.*', // all HR data hidden
      'incidents.*',
      'commercial.*',
      'maintenance.cost',
      // Insurance - all financial data
      'insurance_policies.premium_amount',
      'insurance_policies.deductible_amount',
      'insurance_policies.coverage_amount',
      'insurance_policies.notes',
      'insurance_claims.*',
    ],

    allowed_actions: ['view', 'export_pdf'],

    data_scope: {
      vessels: 'assigned_for_audit',
      date_range: 'audit_period_only',
    },
  },

  employer_api: {
    allowed_modules: ['crew_limited'],

    redacted_fields: [
      'crew.salary',
      'crew.medical_details',
      'crew.disciplinary_records',
      'crew.personal_phone',
      'crew.emergency_contact',
      'crew.passport_number',
      'crew.visa_details',
      'hr.*', // all HR hidden
      'insurance.*', // all insurance hidden
    ],

    allowed_actions: ['view'],

    data_scope: {
      vessels: 'all',
    },

    rate_limit: '100 requests/hour',
  },

  travel_agent: {
    allowed_modules: ['flights'],

    redacted_fields: [
      'crew.*', // only see flight-relevant crew data
      'hr.*', // all HR hidden
      'incidents.*',
      'maintenance.*',
      'documents.*',
      'insurance.*', // all insurance hidden
    ],

    allowed_actions: ['view', 'update_booking', 'upload_documents'],

    data_scope: {},
  },
};

// Employer API allowed fields
export const EMPLOYER_API_ALLOWED_FIELDS = [
  'crew.name',
  'crew.rank',
  'crew.position',
  'crew.vessel_assignment',
  'crew.contract_start',
  'crew.contract_end',
  'crew.leave_balance',
  'crew.status',
];

// HR fields that are ABSOLUTELY NEVER shown to auditors
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

// Insurance fields that are NEVER shown to auditors
export const INSURANCE_ABSOLUTELY_RESTRICTED_FIELDS = [
  'premium_amount',
  'deductible_amount',
  'claim_amount',
  'settlement_amount',
  'correspondence_notes',
] as const;

// Check if a field should be redacted for a role
export function isFieldRedacted(role: string, fieldPath: string): boolean {
  const rules = AUDIT_MODE_RULES[role];
  if (!rules) return false;

  return rules.redacted_fields.some((pattern) => {
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return fieldPath.startsWith(prefix);
    }
    return fieldPath === pattern;
  });
}

// Check if module is allowed for a role
export function isModuleAllowed(role: string, module: string): boolean {
  const rules = AUDIT_MODE_RULES[role];
  if (!rules) return true; // Non-audit roles have standard access
  return rules.allowed_modules.includes(module);
}

// Check if action is allowed for a role
export function isActionAllowed(role: string, action: string): boolean {
  const rules = AUDIT_MODE_RULES[role];
  if (!rules) return true; // Non-audit roles have standard access
  return rules.allowed_actions.includes(action);
}

// Get anonymized name for crew in incident reports
export function anonymizeCrewName(index: number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return `Crew Member ${letters[index % 26]}`;
}

// Redact sensitive data based on role
export function redactData<T extends Record<string, unknown>>(
  data: T,
  role: string,
  prefix: string = ''
): T {
  const rules = AUDIT_MODE_RULES[role];
  if (!rules) return data;

  const result = { ...data };

  for (const key of Object.keys(result)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;

    if (isFieldRedacted(role, fieldPath)) {
      // @ts-expect-error Dynamic assignment
      result[key] = '[REDACTED]';
    } else if (typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key])) {
      // @ts-expect-error Dynamic assignment
      result[key] = redactData(result[key] as Record<string, unknown>, role, fieldPath);
    }
  }

  return result;
}

// Mask a field value (show partial for reference)
export function maskFieldValue(value: string, showChars = 3): string {
  if (!value || value.length <= showChars) return '***';
  return value.substring(0, showChars) + '***';
}

// Check if HR access is allowed for audit session
export function isHRAuditAccessAllowed(
  accessLevel: 'none' | 'employment_only' | 'limited' | 'full'
): boolean {
  return accessLevel !== 'none';
}

// Get allowed HR fields based on access level
export function getAllowedHRFieldsForAudit(
  accessLevel: 'none' | 'employment_only' | 'limited' | 'full'
): string[] {
  if (accessLevel === 'none') return [];
  
  const employmentOnlyFields = [
    'employment_exists',
    'contract_valid',
    'position',
    'department',
    'vessel_assignment',
  ];
  
  const limitedFields = [
    ...employmentOnlyFields,
    'start_date',
    'end_date',
    'contract_type',
    'nationality',
    'certification_status',
  ];
  
  if (accessLevel === 'employment_only') return employmentOnlyFields;
  if (accessLevel === 'limited') return limitedFields;
  
  // Full access - everything except absolutely restricted
  return limitedFields; // Even "full" doesn't include salary, disciplinary, etc.
}

// Transform data for audit-safe view
export function transformForAuditView<T extends Record<string, unknown>>(
  data: T,
  module: 'hr' | 'insurance',
  accessLevel?: 'none' | 'employment_only' | 'limited' | 'full'
): Partial<T> | { access_denied: true } {
  if (module === 'hr') {
    if (!accessLevel || accessLevel === 'none') {
      return { access_denied: true };
    }
    
    const allowedFields = getAllowedHRFieldsForAudit(accessLevel);
    const result: Partial<T> = {};
    
    for (const field of allowedFields) {
      if (field in data) {
        result[field as keyof T] = data[field as keyof T];
      }
    }
    
    // Mark restricted fields
    for (const field of HR_ABSOLUTELY_RESTRICTED_FIELDS) {
      if (field in data) {
        (result as any)[field] = '[REDACTED]';
      }
    }
    
    return result;
  }
  
  if (module === 'insurance') {
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
      if (field in data) {
        result[field as keyof T] = data[field as keyof T];
      }
    }
    
    // Mark restricted fields
    for (const field of INSURANCE_ABSOLUTELY_RESTRICTED_FIELDS) {
      if (field in data) {
        (result as any)[field] = '[REDACTED]';
      }
    }
    
    return result;
  }
  
  return data;
}
