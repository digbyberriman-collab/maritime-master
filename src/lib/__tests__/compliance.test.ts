import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getRetentionStatus,
  isFieldRedactedForAudit,
  HR_FIELD_ACCESS_LEVELS,
  INSURANCE_FIELD_ACCESS_LEVELS,
} from '../compliance/types';

const NOW = new Date('2026-06-15T12:00:00.000Z');

function isoDaysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getRetentionStatus', () => {
  it('reports a distant retention end as active', () => {
    expect(getRetentionStatus(isoDaysFromNow(365))).toBe('active');
  });

  it('reports a retention end inside thirty days as expiring soon', () => {
    expect(getRetentionStatus(isoDaysFromNow(10))).toBe('expiring_soon');
  });

  it('reports a passed retention end as expired', () => {
    expect(getRetentionStatus(isoDaysFromNow(-1))).toBe('expired');
  });

  it('places the thirty-day boundary just inside the warning band', () => {
    expect(getRetentionStatus(isoDaysFromNow(29))).toBe('expiring_soon');
    expect(getRetentionStatus(isoDaysFromNow(31))).toBe('active');
  });
});

describe('isFieldRedactedForAudit — insurance', () => {
  it('hides commercially sensitive figures from auditors', () => {
    for (const field of INSURANCE_FIELD_ACCESS_LEVELS.auditor_hidden) {
      expect(isFieldRedactedForAudit('insurance', field), `${field} should be hidden`).toBe(true);
    }
  });

  it('shows the policy facts an auditor legitimately needs', () => {
    for (const field of INSURANCE_FIELD_ACCESS_LEVELS.auditor_visible) {
      expect(isFieldRedactedForAudit('insurance', field), `${field} should be visible`).toBe(false);
    }
  });

  it('ignores the HR access level, which does not apply to insurance', () => {
    expect(isFieldRedactedForAudit('insurance', 'premium_amount', 'full')).toBe(true);
    expect(isFieldRedactedForAudit('insurance', 'policy_number', 'none')).toBe(false);
  });
});

describe('isFieldRedactedForAudit — HR', () => {
  it('redacts everything when no access level has been granted', () => {
    expect(isFieldRedactedForAudit('hr', 'position')).toBe(true);
    expect(isFieldRedactedForAudit('hr', 'position', 'none')).toBe(true);
    expect(isFieldRedactedForAudit('hr', 'anything_at_all')).toBe(true);
  });

  it('never exposes an always-denied field, at any access level', () => {
    for (const field of HR_FIELD_ACCESS_LEVELS.always_denied) {
      for (const level of ['employment_only', 'limited', 'full'] as const) {
        expect(
          isFieldRedactedForAudit('hr', field, level),
          `${field} must stay hidden at ${level}`
        ).toBe(true);
      }
    }
  });

  it('keeps salary, medical and disciplinary data hidden even at full access', () => {
    expect(isFieldRedactedForAudit('hr', 'salary', 'full')).toBe(true);
    expect(isFieldRedactedForAudit('hr', 'medical', 'full')).toBe(true);
    expect(isFieldRedactedForAudit('hr', 'disciplinary', 'full')).toBe(true);
    expect(isFieldRedactedForAudit('hr', 'bank_details', 'full')).toBe(true);
  });

  describe('employment_only access', () => {
    it('exposes the employment-confirmation fields', () => {
      for (const field of HR_FIELD_ACCESS_LEVELS.employment_only) {
        expect(
          isFieldRedactedForAudit('hr', field, 'employment_only'),
          `${field} should be visible`
        ).toBe(false);
      }
    });

    it('withholds the wider limited-access fields', () => {
      for (const field of HR_FIELD_ACCESS_LEVELS.limited) {
        expect(
          isFieldRedactedForAudit('hr', field, 'employment_only'),
          `${field} should still be hidden`
        ).toBe(true);
      }
    });

    it('withholds any field it has never heard of', () => {
      expect(isFieldRedactedForAudit('hr', 'undeclared_field', 'employment_only')).toBe(true);
    });
  });

  describe('limited access', () => {
    it('exposes both the employment and limited field sets', () => {
      for (const field of [
        ...HR_FIELD_ACCESS_LEVELS.employment_only,
        ...HR_FIELD_ACCESS_LEVELS.limited,
      ]) {
        expect(isFieldRedactedForAudit('hr', field, 'limited'), `${field} should be visible`).toBe(
          false
        );
      }
    });

    it('withholds any field it has never heard of', () => {
      expect(isFieldRedactedForAudit('hr', 'undeclared_field', 'limited')).toBe(true);
    });
  });

  describe('full access', () => {
    it('exposes declared fields outside the denied list', () => {
      expect(isFieldRedactedForAudit('hr', 'position', 'full')).toBe(false);
      expect(isFieldRedactedForAudit('hr', 'start_date', 'full')).toBe(false);
    });
  });

  it('escalates monotonically: nothing visible at a lower level is hidden at a higher one', () => {
    const LEVELS = ['none', 'employment_only', 'limited', 'full'] as const;
    const fields = [
      ...HR_FIELD_ACCESS_LEVELS.employment_only,
      ...HR_FIELD_ACCESS_LEVELS.limited,
      ...HR_FIELD_ACCESS_LEVELS.always_denied,
    ];

    for (const field of fields) {
      for (let i = 1; i < LEVELS.length; i++) {
        const lower = isFieldRedactedForAudit('hr', field, LEVELS[i - 1]);
        const higher = isFieldRedactedForAudit('hr', field, LEVELS[i]);
        // Visible at the lower level (false) must stay visible at the higher one.
        if (!lower) {
          expect(higher, `${field} regressed between ${LEVELS[i - 1]} and ${LEVELS[i]}`).toBe(false);
        }
      }
    }
  });
});

describe('field access list integrity', () => {
  it('does not place a field in both the denied and the visible HR lists', () => {
    const denied = new Set<string>(HR_FIELD_ACCESS_LEVELS.always_denied);
    const visible = [
      ...HR_FIELD_ACCESS_LEVELS.employment_only,
      ...HR_FIELD_ACCESS_LEVELS.limited,
    ];

    for (const field of visible) {
      expect(denied.has(field), `${field} is both visible and denied`).toBe(false);
    }
  });

  it('does not place an insurance field in both the visible and hidden lists', () => {
    const hidden = new Set<string>(INSURANCE_FIELD_ACCESS_LEVELS.auditor_hidden);

    for (const field of INSURANCE_FIELD_ACCESS_LEVELS.auditor_visible) {
      expect(hidden.has(field), `${field} is both visible and hidden`).toBe(false);
    }
  });
});
