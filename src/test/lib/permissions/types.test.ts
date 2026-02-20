import { describe, it, expect } from 'vitest';
import { APP_ROLES, ROLE_LABELS } from '@/lib/permissions/types';
import type { AppRole } from '@/lib/permissions/types';

describe('permissions/types', () => {
  describe('APP_ROLES', () => {
    it('should contain all 14 roles', () => {
      expect(APP_ROLES).toHaveLength(14);
    });

    it('should include all expected roles', () => {
      const expectedRoles: AppRole[] = [
        'superadmin', 'dpa', 'fleet_master', 'captain', 'purser',
        'chief_officer', 'chief_engineer', 'hod', 'officer', 'crew',
        'auditor_flag', 'auditor_class', 'travel_agent', 'employer_api',
      ];

      expectedRoles.forEach(role => {
        expect(APP_ROLES).toContain(role);
      });
    });
  });

  describe('ROLE_LABELS', () => {
    it('should have a label for every role in APP_ROLES', () => {
      APP_ROLES.forEach(role => {
        expect(ROLE_LABELS[role]).toBeDefined();
        expect(typeof ROLE_LABELS[role]).toBe('string');
        expect(ROLE_LABELS[role].length).toBeGreaterThan(0);
      });
    });

    it('should have human-readable labels', () => {
      expect(ROLE_LABELS['superadmin']).toBe('Superadmin');
      expect(ROLE_LABELS['dpa']).toBe('DPA');
      expect(ROLE_LABELS['captain']).toBe('Captain/Master');
      expect(ROLE_LABELS['crew']).toBe('Crew');
      expect(ROLE_LABELS['auditor_flag']).toBe('Flag State Auditor');
      expect(ROLE_LABELS['travel_agent']).toBe('Travel Agent');
    });
  });
});
