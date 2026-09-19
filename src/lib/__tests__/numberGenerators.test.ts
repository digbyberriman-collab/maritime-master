import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateAuditNumber, generateFindingNumber } from '../auditConstants';
import { generateDrillNumber } from '../drillConstants';
import { generateTaskNumber, generateDefectNumber } from '../maintenanceConstants';
import { generateSubmissionNumber as generateFormNumber } from '../forms/types';

const NOW = new Date('2026-06-15T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('generateAuditNumber', () => {
  it('numbers the first audit of the year as 001', () => {
    expect(generateAuditNumber(0)).toBe('AUD-2026-001');
  });

  it('continues from the existing count', () => {
    expect(generateAuditNumber(7)).toBe('AUD-2026-008');
  });

  it('pads to three digits and grows beyond them', () => {
    expect(generateAuditNumber(98)).toBe('AUD-2026-099');
    expect(generateAuditNumber(999)).toBe('AUD-2026-1000');
  });

  it('picks up the current year from the clock', () => {
    vi.setSystemTime(new Date('2031-01-02T00:00:00.000Z'));
    expect(generateAuditNumber(0)).toBe('AUD-2031-001');
  });

  it('produces a distinct number for each successive count', () => {
    const numbers = Array.from({ length: 50 }, (_, i) => generateAuditNumber(i));
    expect(new Set(numbers).size).toBe(50);
  });
});

describe('generateFindingNumber', () => {
  it('hangs the finding off its parent audit number', () => {
    expect(generateFindingNumber('AUD-2026-001', 0)).toBe('AUD-2026-001-F01');
  });

  it('continues from the existing finding count', () => {
    expect(generateFindingNumber('AUD-2026-001', 4)).toBe('AUD-2026-001-F05');
  });

  it('pads to two digits and grows beyond them', () => {
    expect(generateFindingNumber('AUD-2026-001', 8)).toBe('AUD-2026-001-F09');
    expect(generateFindingNumber('AUD-2026-001', 99)).toBe('AUD-2026-001-F100');
  });

  it('keeps findings from different audits distinct', () => {
    expect(generateFindingNumber('AUD-2026-001', 0)).not.toBe(
      generateFindingNumber('AUD-2026-002', 0)
    );
  });
});

describe('generateDrillNumber', () => {
  it('numbers the first drill of the year as 001', () => {
    expect(generateDrillNumber(0)).toBe('DRILL-2026-001');
  });

  it('continues from the existing count', () => {
    expect(generateDrillNumber(11)).toBe('DRILL-2026-012');
  });

  it('picks up the current year from the clock', () => {
    vi.setSystemTime(new Date('2027-03-01T00:00:00.000Z'));
    expect(generateDrillNumber(0)).toBe('DRILL-2027-001');
  });
});

describe('generateTaskNumber', () => {
  it('formats a maintenance task number', () => {
    expect(generateTaskNumber(2026, 1)).toBe('MAINT-2026-001');
  });

  it('pads to three digits and grows beyond them', () => {
    expect(generateTaskNumber(2026, 42)).toBe('MAINT-2026-042');
    expect(generateTaskNumber(2026, 1234)).toBe('MAINT-2026-1234');
  });

  it('takes the year from its argument rather than the clock', () => {
    expect(generateTaskNumber(2019, 1)).toBe('MAINT-2019-001');
  });
});

describe('generateDefectNumber', () => {
  it('formats a defect number', () => {
    expect(generateDefectNumber(2026, 3)).toBe('DEF-2026-003');
  });

  it('does not collide with a task number of the same sequence', () => {
    expect(generateDefectNumber(2026, 3)).not.toBe(generateTaskNumber(2026, 3));
  });
});

describe('generateSubmissionNumber (forms)', () => {
  it('pads the sequence to six digits', () => {
    expect(generateFormNumber(2026, 1)).toBe('FRM-2026-000001');
    expect(generateFormNumber(2026, 123456)).toBe('FRM-2026-123456');
  });

  it('keeps sequences unique within a year', () => {
    const numbers = Array.from({ length: 100 }, (_, i) => generateFormNumber(2026, i));
    expect(new Set(numbers).size).toBe(100);
  });

  it('separates the same sequence across different years', () => {
    expect(generateFormNumber(2025, 1)).not.toBe(generateFormNumber(2026, 1));
  });
});

describe('identifier prefixes', () => {
  it('gives each record type a distinct prefix', () => {
    const prefixes = [
      generateAuditNumber(0),
      generateDrillNumber(0),
      generateTaskNumber(2026, 1),
      generateDefectNumber(2026, 1),
      generateFormNumber(2026, 1),
    ].map((n) => n.split('-')[0]);

    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});
