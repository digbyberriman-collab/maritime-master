import { describe, expect, it } from 'vitest';
import { LOGBOOK_BOOKS } from '../catalog';
import { coverFromRegistry, freshReading, particularsFromVolume, profileForFlag } from '../registryRules';
import { parseRmc, simulate, checksum } from '../telemetry';

const fields = { shipName: 'Fictional registry vessel', officialNumber: 'DEMO-REG', portRegistry: 'George Town', grossTonnage: 500, netTonnage: 0, vesselType: 'Commercial yacht', workingLanguage: 'English', owner: 'Demo owner', callSign: 'DEMO', openingPlace: 'Previous port', label: 'Previous volume' };
const registry = { fields, book_defaults: { ballast: { certificateRef: 'BALLAST-DEMO', tankPlan: 'Ballast plan', ballastCapacity: 0 }, oil2: { tankPlan: 'Cargo plan', tankCapacities: 'T1: 50 m³', slopDepths: 'S1: 1 m' } } };

describe('registry cover population', () => {
  it('fills only supported registry fields and book-specific references', () => {
    for (const book of LOGBOOK_BOOKS) {
      const values = coverFromRegistry(registry, book.id, book.coverFields);
      expect(values.shipName).toBe(fields.shipName);
      expect(values.netTonnage).toBe(0);
      expect('openingPlace' in values).toBe(false);
      expect('label' in values).toBe(false);
      expect('owner' in values).toBe(false);
      if (!['ballast', 'oil2'].includes(book.id)) expect('tankPlan' in values).toBe(false);
    }
    expect(coverFromRegistry(registry, 'ballast', LOGBOOK_BOOKS.find((b) => b.id === 'ballast')!.coverFields).ballastCapacity).toBe(0);
    expect(coverFromRegistry(registry, 'oil2', LOGBOOK_BOOKS.find((b) => b.id === 'oil2')!.coverFields).tankPlan).toBe('Cargo plan');
  });

  it('prefills particulars rows from the fixed cover and pinned registry snapshot', () => {
    const official = LOGBOOK_BOOKS.find((b) => b.id === 'official')!;
    const particulars = official.sections.find((s) => s.id === 'particulars')!;
    const volume = { particulars: { shipName: 'Cover name', openingPlace: 'Demo port' }, registry_source: { fields: { owner: 'Demo owner', shipName: 'Registry name' } } };
    const values = particularsFromVolume(volume, particulars);
    expect(values.shipName).toBe('Cover name');
    expect(values.owner).toBe('Demo owner');
    expect(values.openingPlace).toBe('Demo port');
    expect(particularsFromVolume(volume, official.sections.find((s) => s.id === 'drills')!)).toEqual({});
  });

  it('derives the default flag profile from the vessel flag', () => {
    expect(profileForFlag('Cayman Islands')).toBe('CISR');
    expect(profileForFlag('United Kingdom')).toBe('MCA');
    expect(profileForFlag('UK')).toBe('MCA');
    expect(profileForFlag('British Virgin Islands')).toBe('MCA');
    expect(profileForFlag('Ukraine')).toBe('CISR');
    expect(profileForFlag('Turkey')).toBe('CISR');
    expect(profileForFlag(null)).toBe('CISR');
  });
});

describe('readings', () => {
  it('selects only a fresh matching sample', () => {
    const now = Date.parse('2026-09-15T12:00:00Z');
    const fresh = { sample_type: 'navigation', observed_at: '2026-09-15T11:59:00Z' };
    const stale = { sample_type: 'machinery', observed_at: '2026-09-15T11:50:00Z' };
    const ahead = { sample_type: 'machinery', observed_at: '2026-09-15T12:00:10Z' };
    expect(freshReading([fresh, stale], 'navigation', now)).toBe(fresh);
    expect(freshReading([stale], 'machinery', now)).toBeNull();
    expect(freshReading([ahead], 'machinery', now)).toBeNull();
    expect(freshReading([fresh], undefined, now)).toBeNull();
  });

  it('parses a valid RMC sentence and rejects a bad checksum', () => {
    const body = 'GPRMC,120000,A,4341.8200,N,00716.2400,E,12.4,086.2,150926,,,A';
    const sample = parseRmc(`$${body}*${checksum(body)}`);
    expect(sample.values.latitude).toBeCloseTo(43.697, 3);
    expect(sample.values.longitude).toBeCloseTo(7.270667, 5);
    expect(sample.observed_at).toBe('2026-09-15T12:00:00.000Z');
    expect(() => parseRmc(`$${body}*00`)).toThrow(/checksum/);
    expect(simulate('machinery').values.generatorLoad).toBe(186);
  });
});
