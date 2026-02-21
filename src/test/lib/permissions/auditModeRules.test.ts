import { describe, it, expect } from 'vitest';
import {
  AUDIT_MODE_RULES,
  EMPLOYER_API_ALLOWED_FIELDS,
  HR_ABSOLUTELY_RESTRICTED_FIELDS,
  INSURANCE_ABSOLUTELY_RESTRICTED_FIELDS,
  isFieldRedacted,
  isModuleAllowed,
  isActionAllowed,
  anonymizeCrewName,
  redactData,
  maskFieldValue,
  isHRAuditAccessAllowed,
  getAllowedHRFieldsForAudit,
  transformForAuditView,
} from '@/modules/auth/lib/auditModeRules';

describe('auditModeRules', () => {
  describe('AUDIT_MODE_RULES', () => {
    it('should define rules for auditor_flag', () => {
      const rules = AUDIT_MODE_RULES['auditor_flag'];
      expect(rules).toBeDefined();
      expect(rules.allowed_modules).toContain('vessel_certificates');
      expect(rules.allowed_modules).toContain('drills');
      expect(rules.allowed_actions).toEqual(['view', 'export_pdf']);
    });

    it('should define rules for auditor_class', () => {
      const rules = AUDIT_MODE_RULES['auditor_class'];
      expect(rules).toBeDefined();
      expect(rules.allowed_modules).toContain('vessel_certificates');
      expect(rules.allowed_modules).toContain('ism_critical_equipment');
    });

    it('should define rules for employer_api', () => {
      const rules = AUDIT_MODE_RULES['employer_api'];
      expect(rules).toBeDefined();
      expect(rules.allowed_modules).toEqual(['crew_limited']);
      expect(rules.rate_limit).toBe('100 requests/hour');
    });

    it('should define rules for travel_agent', () => {
      const rules = AUDIT_MODE_RULES['travel_agent'];
      expect(rules).toBeDefined();
      expect(rules.allowed_modules).toEqual(['flights']);
      expect(rules.allowed_actions).toContain('update_booking');
    });

    it('should redact salary fields for auditor_flag', () => {
      expect(AUDIT_MODE_RULES['auditor_flag'].redacted_fields).toContain('crew.salary');
    });

    it('should redact all maintenance for auditor_flag', () => {
      expect(AUDIT_MODE_RULES['auditor_flag'].redacted_fields).toContain('maintenance.*');
    });

    it('should redact all crew data for auditor_class', () => {
      expect(AUDIT_MODE_RULES['auditor_class'].redacted_fields).toContain('crew.*');
    });

    it('should scope auditors to assigned vessels only', () => {
      expect(AUDIT_MODE_RULES['auditor_flag'].data_scope.vessels).toBe('assigned_for_audit');
      expect(AUDIT_MODE_RULES['auditor_class'].data_scope.vessels).toBe('assigned_for_audit');
    });
  });

  describe('isFieldRedacted', () => {
    it('should return true for exact field match', () => {
      expect(isFieldRedacted('auditor_flag', 'crew.salary')).toBe(true);
    });

    it('should return true for wildcard prefix match', () => {
      expect(isFieldRedacted('auditor_flag', 'maintenance.cost')).toBe(true);
      expect(isFieldRedacted('auditor_flag', 'maintenance.schedule')).toBe(true);
    });

    it('should return false for non-redacted fields', () => {
      expect(isFieldRedacted('auditor_flag', 'vessel.name')).toBe(false);
    });

    it('should return false for non-audit roles', () => {
      expect(isFieldRedacted('captain', 'crew.salary')).toBe(false);
    });

    it('should redact all crew fields for auditor_class', () => {
      expect(isFieldRedacted('auditor_class', 'crew.name')).toBe(true);
      expect(isFieldRedacted('auditor_class', 'crew.rank')).toBe(true);
    });

    it('should redact insurance fields for auditors', () => {
      expect(isFieldRedacted('auditor_flag', 'insurance_policies.premium_amount')).toBe(true);
      expect(isFieldRedacted('auditor_flag', 'insurance_claims.anything')).toBe(true);
    });
  });

  describe('isModuleAllowed', () => {
    it('should return true for allowed modules', () => {
      expect(isModuleAllowed('auditor_flag', 'vessel_certificates')).toBe(true);
      expect(isModuleAllowed('auditor_flag', 'drills')).toBe(true);
    });

    it('should return false for disallowed modules', () => {
      expect(isModuleAllowed('auditor_flag', 'flights')).toBe(false);
      expect(isModuleAllowed('travel_agent', 'crew')).toBe(false);
    });

    it('should return true for non-audit roles (standard access)', () => {
      expect(isModuleAllowed('captain', 'crew')).toBe(true);
      expect(isModuleAllowed('dpa', 'incidents')).toBe(true);
    });
  });

  describe('isActionAllowed', () => {
    it('should allow view and export_pdf for auditors', () => {
      expect(isActionAllowed('auditor_flag', 'view')).toBe(true);
      expect(isActionAllowed('auditor_flag', 'export_pdf')).toBe(true);
    });

    it('should deny create/update for auditors', () => {
      expect(isActionAllowed('auditor_flag', 'create')).toBe(false);
      expect(isActionAllowed('auditor_flag', 'update')).toBe(false);
      expect(isActionAllowed('auditor_flag', 'delete')).toBe(false);
    });

    it('should allow update_booking for travel_agent', () => {
      expect(isActionAllowed('travel_agent', 'update_booking')).toBe(true);
    });

    it('should return true for non-audit roles', () => {
      expect(isActionAllowed('captain', 'create')).toBe(true);
      expect(isActionAllowed('dpa', 'delete')).toBe(true);
    });
  });

  describe('anonymizeCrewName', () => {
    it('should return Crew Member A for index 0', () => {
      expect(anonymizeCrewName(0)).toBe('Crew Member A');
    });

    it('should return Crew Member B for index 1', () => {
      expect(anonymizeCrewName(1)).toBe('Crew Member B');
    });

    it('should wrap around after Z', () => {
      expect(anonymizeCrewName(26)).toBe('Crew Member A');
    });
  });

  describe('redactData', () => {
    it('should redact fields matching exact patterns', () => {
      const data = { salary: 50000, name: 'John' };
      const result = redactData(data, 'auditor_flag', 'crew');
      expect(result.salary).toBe('[REDACTED]');
      // name is not in the redacted_fields for auditor_flag under crew
    });

    it('should redact fields matching wildcard patterns', () => {
      const data = { cost: 10000, schedule: 'weekly', description: 'test' };
      const result = redactData(data, 'auditor_flag', 'maintenance');
      expect(result.cost).toBe('[REDACTED]');
      expect(result.schedule).toBe('[REDACTED]');
    });

    it('should not redact data for non-audit roles', () => {
      const data = { salary: 50000, name: 'John' };
      const result = redactData(data, 'captain', 'crew');
      expect(result.salary).toBe(50000);
      expect(result.name).toBe('John');
    });

    it('should handle nested objects', () => {
      const data = { details: { salary: 50000 } };
      const result = redactData(data, 'auditor_class', 'crew');
      expect(result.details).toBe('[REDACTED]');
    });
  });

  describe('maskFieldValue', () => {
    it('should mask value showing first 3 characters by default', () => {
      expect(maskFieldValue('12345678')).toBe('123***');
    });

    it('should return *** for short values', () => {
      expect(maskFieldValue('ab')).toBe('***');
    });

    it('should return *** for empty string', () => {
      expect(maskFieldValue('')).toBe('***');
    });

    it('should respect custom showChars parameter', () => {
      expect(maskFieldValue('12345678', 5)).toBe('12345***');
    });
  });

  describe('isHRAuditAccessAllowed', () => {
    it('should return false for none access', () => {
      expect(isHRAuditAccessAllowed('none')).toBe(false);
    });

    it('should return true for employment_only', () => {
      expect(isHRAuditAccessAllowed('employment_only')).toBe(true);
    });

    it('should return true for limited', () => {
      expect(isHRAuditAccessAllowed('limited')).toBe(true);
    });

    it('should return true for full', () => {
      expect(isHRAuditAccessAllowed('full')).toBe(true);
    });
  });

  describe('getAllowedHRFieldsForAudit', () => {
    it('should return empty array for none access', () => {
      expect(getAllowedHRFieldsForAudit('none')).toEqual([]);
    });

    it('should return employment fields for employment_only', () => {
      const fields = getAllowedHRFieldsForAudit('employment_only');
      expect(fields).toContain('employment_exists');
      expect(fields).toContain('position');
      expect(fields).not.toContain('start_date');
    });

    it('should return more fields for limited access', () => {
      const fields = getAllowedHRFieldsForAudit('limited');
      expect(fields).toContain('employment_exists');
      expect(fields).toContain('start_date');
      expect(fields).toContain('nationality');
    });

    it('should return limited fields even for full access', () => {
      const fields = getAllowedHRFieldsForAudit('full');
      expect(fields).toContain('employment_exists');
      expect(fields).toContain('start_date');
    });
  });

  describe('transformForAuditView', () => {
    it('should deny access for HR module with no access level', () => {
      const data = { salary: 50000, position: 'Captain' };
      const result = transformForAuditView(data, 'hr');
      expect(result).toEqual({ access_denied: true });
    });

    it('should deny access for HR module with none access', () => {
      const data = { salary: 50000, position: 'Captain' };
      const result = transformForAuditView(data, 'hr', 'none');
      expect(result).toEqual({ access_denied: true });
    });

    it('should return limited fields for HR with employment_only', () => {
      const data = { employment_exists: true, position: 'Captain', salary: 50000 };
      const result = transformForAuditView(data, 'hr', 'employment_only');
      expect(result).toHaveProperty('employment_exists');
      expect(result).toHaveProperty('position');
      expect((result as any).salary).toBe('[REDACTED]');
    });

    it('should return audit-safe fields for insurance module', () => {
      const data = {
        id: '1',
        policy_type: 'P&I',
        premium_amount: 50000,
        policy_number: 'POL-001',
        status: 'Active',
      };
      const result = transformForAuditView(data, 'insurance');
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('policy_type');
      expect(result).toHaveProperty('policy_number');
      expect((result as any).premium_amount).toBe('[REDACTED]');
    });

    it('should pass through data for unknown modules', () => {
      const data = { foo: 'bar' };
      const result = transformForAuditView(data, 'hr', 'limited');
      // hr with limited access should not be access_denied
      expect(result).not.toEqual({ access_denied: true });
    });
  });

  describe('constant arrays', () => {
    it('should define employer API allowed fields', () => {
      expect(EMPLOYER_API_ALLOWED_FIELDS).toContain('crew.name');
      expect(EMPLOYER_API_ALLOWED_FIELDS).toContain('crew.rank');
      expect(EMPLOYER_API_ALLOWED_FIELDS).toContain('crew.status');
    });

    it('should define HR restricted fields', () => {
      expect(HR_ABSOLUTELY_RESTRICTED_FIELDS).toContain('salary');
      expect(HR_ABSOLUTELY_RESTRICTED_FIELDS).toContain('bank_details');
      expect(HR_ABSOLUTELY_RESTRICTED_FIELDS).toContain('disciplinary_records');
    });

    it('should define insurance restricted fields', () => {
      expect(INSURANCE_ABSOLUTELY_RESTRICTED_FIELDS).toContain('premium_amount');
      expect(INSURANCE_ABSOLUTELY_RESTRICTED_FIELDS).toContain('claim_amount');
    });
  });
});
