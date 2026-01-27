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
    ],

    redacted_fields: [
      'crew.*', // all crew data hidden
      'incidents.*',
      'commercial.*',
      'maintenance.cost',
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
      'incidents.*',
      'maintenance.*',
      'documents.*',
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
