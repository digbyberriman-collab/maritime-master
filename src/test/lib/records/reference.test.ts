import { describe, expect, it } from 'vitest';
import {
  compareReferences,
  formatReference,
  formatVoyageReference,
  isReference,
  normaliseReference,
  parseReference,
  referenceCounterScope,
  VESSEL_CODE_PATTERN,
} from '@/lib/records/reference';
import { assignVesselCodes, storedVesselCode } from '@/modules/vessels/lib/vesselCode';

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
    [{ type: 'PTW', vesselCode: '1RA', date: '2026-01-01', seq: 1 }, 'vessel code starting with a digit'],
    [{ type: 'PTW', vesselCode: 'D-A', date: '2026-01-01', seq: 1 }, 'dash in vessel code'],
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

describe('vessel codes with digits (D-25)', () => {
  it.each(['DRA', 'DR1', 'D1A', 'DR', 'DRAK', '1RA', 'D-A', 'dr1', ' DR1 '])(
    'VESSEL_CODE_PATTERN agrees with storedVesselCode for %j',
    (code) => {
      const upper = code.trim().toUpperCase();
      expect(VESSEL_CODE_PATTERN.test(upper)).toBe(storedVesselCode({ code }) === upper);
    },
  );

  it.each(['DR1', 'D1A'])('%s formats, parses and normalises as a record and a voyage', (code) => {
    const record = formatReference({ type: 'PTW', vesselCode: code.toLowerCase(), date: '2026-03-14', seq: 61 });
    expect(record).toBe(`PTW-${code}-2026-061`);
    expect(parseReference(record)).toEqual({ kind: 'record', type: 'PTW', vesselCode: code, year: 2026, seq: 61 });
    expect(isReference(record)).toBe(true);
    expect(normaliseReference(record.toLowerCase())).toBe(record);

    const voyage = formatReference({ kind: 'voyage', vesselCode: code, date: '2026-11-03', seq: 37 });
    expect(voyage).toBe(`${code}-20261103-037`);
    expect(parseReference(voyage)).toEqual({ kind: 'voyage', vesselCode: code, date: '2026-11-03', seq: 37 });
    expect(isReference(voyage)).toBe(true);
    expect(normaliseReference(` ${voyage.toLowerCase()} `)).toBe(voyage);
  });

  it.each(['PTW-DR-2026-001', 'PTW-DRAK-2026-001', 'PTW-1RA-2026-001', '1RA-20261103-001', 'DR-20261103-001'])(
    'still rejects %j',
    (text) => {
      expect(parseReference(text)).toBeNull();
    },
  );

  it('a fleet record is not read as a voyage or a vessel record', () => {
    expect(parseReference('AUD-2026-004')).toEqual({ kind: 'record', type: 'AUD', vesselCode: null, year: 2026, seq: 4 });
    expect(parseReference('A12-2026-004')).toEqual({ kind: 'record', type: 'A12', vesselCode: null, year: 2026, seq: 4 });
  });

  it.each([
    [['M/Y DRAAK', 'M/Y DRAAKE', 'S/Y DRAKAR']],
    [['AAA', 'AAAA']],
    [['HYDRA', 'HYDRAX', 'HYDRO']],
  ])('every code assignVesselCodes gives the fleet %j round-trips', (names) => {
    const fleet = names.map((name, i) => ({ id: `v${i}`, name, created_at: `202${i}-01-01T00:00:00Z` }));
    const codes = [...assignVesselCodes(fleet).values()];
    expect(codes).toHaveLength(names.length);
    expect(codes.some((c) => /\d/.test(c))).toBe(true);
    for (const code of codes) {
      expect(VESSEL_CODE_PATTERN.test(code)).toBe(true);
      const record = formatReference({ type: 'PTW', vesselCode: code, date: '2026-01-01', seq: 7 });
      expect(parseReference(record)).toMatchObject({ kind: 'record', vesselCode: code });
      expect(normaliseReference(record.toLowerCase())).toBe(record);
      const voyage = formatVoyageReference({ vesselCode: code, date: '2026-01-01', seq: 7 });
      expect(parseReference(voyage)).toMatchObject({ kind: 'voyage', vesselCode: code });
      expect(normaliseReference(voyage.toLowerCase())).toBe(voyage);
    }
  });

  it('sorts a digit code as a parseable reference', () => {
    const refs = ['PTW-DR1-2026-002', 'garbage', 'PTW-DRK-2026-001', 'PTW-DRA-2026-003'];
    expect([...refs].sort(compareReferences)).toEqual(['PTW-DR1-2026-002', 'PTW-DRA-2026-003', 'PTW-DRK-2026-001', 'garbage']);
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
