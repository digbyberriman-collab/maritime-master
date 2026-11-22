import { describe, expect, it } from 'vitest';
import {
  compareReferences,
  formatReference,
  formatVoyageReference,
  isReference,
  normaliseReference,
  parseReference,
  referenceCounterScope,
} from '@/lib/records/reference';

describe('formatReference (C21)', () => {
  it('vessel records: TYPE-VSL-YYYY-NNN', () => {
    expect(formatReference({ type: 'PTW', vesselCode: 'DRA', date: '2026-03-14', seq: 61 })).toBe('PTW-DRA-2026-061');
    expect(formatReference({ type: 'inc', vesselCode: 'dra', date: '2026-01-01', seq: 9 })).toBe('INC-DRA-2026-009');
  });

  it('fleet records: TYPE-YYYY-NNN', () => {
    expect(formatReference({ type: 'AUD', date: '2026-11-22', seq: 4 })).toBe('AUD-2026-004');
    expect(formatReference({ type: 'AUD', vesselCode: null, date: '2026-11-22', seq: 4 })).toBe('AUD-2026-004');
    expect(formatReference({ type: 'AUD', vesselCode: '  ', date: '2026-11-22', seq: 4 })).toBe('AUD-2026-004');
  });

  it('voyages: VSL-YYYYMMDD-NNN', () => {
    expect(formatReference({ kind: 'voyage', vesselCode: 'DRA', date: '2026-11-03', seq: 37 })).toBe('DRA-20261103-037');
    expect(formatVoyageReference({ vesselCode: 'hyd', date: '2026-01-09', seq: 1 })).toBe('HYD-20260109-001');
  });

  it('counters grow past 999 without truncation', () => {
    expect(formatReference({ type: 'CA', vesselCode: 'DRA', date: '2026-01-01', seq: 1000 })).toBe('CA-DRA-2026-1000');
  });

  it('uses the local calendar year of a Date', () => {
    expect(formatReference({ type: 'CA', date: new Date(2026, 11, 31, 23, 59), seq: 1 })).toBe('CA-2026-001');
  });

  it.each([
    [{ type: 'PTW', vesselCode: 'DR', date: '2026-01-01', seq: 1 }, 'two-letter vessel code'],
    [{ type: 'PTW', vesselCode: 'DRAK', date: '2026-01-01', seq: 1 }, 'four-letter vessel code'],
    [{ type: 'PTW', vesselCode: 'D1A', date: '2026-01-01', seq: 1 }, 'digit in vessel code'],
    [{ type: '', date: '2026-01-01', seq: 1 }, 'empty type'],
    [{ type: '1PT', date: '2026-01-01', seq: 1 }, 'type starting with a digit'],
    [{ type: 'P-T', date: '2026-01-01', seq: 1 }, 'type with a dash'],
    [{ type: 'ABCDEFGHI', date: '2026-01-01', seq: 1 }, 'type over 8 characters'],
    [{ type: 'PTW', date: '2026-01-01', seq: 0 }, 'zero counter'],
    [{ type: 'PTW', date: '2026-01-01', seq: 1.5 }, 'fractional counter'],
    [{ type: 'PTW', date: '2026-02-30', seq: 1 }, 'impossible date'],
  ])('throws on %j (%s)', (input, _label) => {
    expect(() => formatReference(input)).toThrow(RangeError);
  });
});

describe('parseReference', () => {
  it('parses each format', () => {
    expect(parseReference('PTW-DRA-2026-061')).toEqual({ kind: 'record', type: 'PTW', vesselCode: 'DRA', year: 2026, seq: 61 });
    expect(parseReference('AUD-2026-004')).toEqual({ kind: 'record', type: 'AUD', vesselCode: null, year: 2026, seq: 4 });
    expect(parseReference('DRA-20261103-037')).toEqual({ kind: 'voyage', vesselCode: 'DRA', date: '2026-11-03', seq: 37 });
  });

  it('ignores case and surrounding space (command palette input)', () => {
    expect(parseReference('  ptw-dra-2026-061 ')).toEqual({ kind: 'record', type: 'PTW', vesselCode: 'DRA', year: 2026, seq: 61 });
  });

  it('reads existing legacy numbers (DRILL-YYYY-NNN, AUD-YYYY-NNN)', () => {
    expect(parseReference('DRILL-2026-012')).toMatchObject({ kind: 'record', type: 'DRILL', vesselCode: null });
  });

  it.each([
    '',
    'PTW',
    'PTW-DRA-26-061',
    'PTW-DRA-2026-61',
    'PTW-DRA-2026-000',
    'DRA-20261332-001',
    'DRA-20260230-001',
    'DRA-2026110-001',
    'PTW_DRA_2026_061',
    'PTW-DRA-2026-061-X',
    '1PT-2026-001',
  ])('rejects %j', (text) => {
    expect(parseReference(text)).toBeNull();
    expect(isReference(text)).toBe(false);
  });

  it('round-trips', () => {
    for (const ref of ['PTW-DRA-2026-061', 'CA-HYD-2026-1000', 'AUD-2026-004', 'DRA-20261103-037']) {
      expect(normaliseReference(ref.toLowerCase())).toBe(ref);
    }
    expect(normaliseReference('nonsense')).toBeNull();
  });
});

describe('compareReferences', () => {
  it('sorts counters numerically, then by vessel, type and year', () => {
    const refs = ['PTW-DRA-2026-1000', 'PTW-DRA-2026-999', 'CA-DRA-2026-002', 'PTW-ABC-2026-005', 'PTW-DRA-2025-500', 'garbage', 'DRA-20261103-002'];
    expect([...refs].sort(compareReferences)).toEqual([
      'DRA-20261103-002',
      'CA-DRA-2026-002',
      'PTW-ABC-2026-005',
      'PTW-DRA-2025-500',
      'PTW-DRA-2026-999',
      'PTW-DRA-2026-1000',
      'garbage',
    ]);
  });
});

describe('referenceCounterScope', () => {
  it('keys vessel counters by vessel id, not code', () => {
    expect(referenceCounterScope({ type: 'ptw', companyId: 'co-1', vesselId: 'v-1', date: '2026-03-01' })).toBe('ref:PTW:co-1:v-1:2026');
  });
  it('fleet records use "fleet"', () => {
    expect(referenceCounterScope({ type: 'AUD', companyId: 'co-1', date: '2026-03-01' })).toBe('ref:AUD:co-1:fleet:2026');
  });
  it('voyages count per vessel and day', () => {
    expect(referenceCounterScope({ type: 'VOY', companyId: 'co-1', vesselId: 'v-1', date: '2026-11-03', voyage: true })).toBe('voyage:co-1:v-1:20261103');
    expect(() => referenceCounterScope({ type: 'VOY', companyId: 'co-1', date: '2026-11-03', voyage: true })).toThrow(RangeError);
  });
});
