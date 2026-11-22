import { describe, expect, it } from 'vitest';
import {
  assignVesselCodes,
  getVesselCode,
  isVesselCodeParam,
  normaliseVesselCode,
  parseVesselPath,
  resolveVesselByCode,
  switchVesselInPath,
  vesselCodeCandidates,
  vesselCodeLetters,
  vesselPath,
  vesselPatternPath,
  VESSEL_SCOPE_PATTERN,
  type VesselCodeSource,
} from './vesselCode';

const v = (id: string, name: string, created_at: string | null = '2025-01-01T00:00:00Z', code?: string | null): VesselCodeSource => ({
  id,
  name,
  created_at,
  ...(code !== undefined ? { code } : {}),
});

describe('vesselCodeLetters', () => {
  it.each([
    ['M/Y DRAAK', 'DRAAK'],
    ['m/y draak', 'DRAAK'],
    ['S/Y Hydra', 'HYDRA'],
    ['MY Leviathan', 'LEVIATHAN'],
    ['SY Dagon', 'DAGON'],
    ['R/V Ocean Seeker', 'OCEANSEEKER'],
    ['RV Kraken', 'KRAKEN'],
    ['GAME CHANGER', 'GAMECHANGER'],
    ['M/Y  Game-Changer II', 'GAMECHANGERII'],
  ])('%s → %s', (name, letters) => {
    expect(vesselCodeLetters(name)).toBe(letters);
  });

  it('keeps names that only start like a prefix', () => {
    expect(vesselCodeLetters('MYSTIQUE')).toBe('MYSTIQUE');
    expect(vesselCodeLetters('SYRENA')).toBe('SYRENA');
    expect(vesselCodeLetters('RVX ONE')).toBe('RVXONE');
  });

  it('drops accents and anything that is not a letter', () => {
    expect(vesselCodeLetters('Élan 2')).toBe('ELAN');
  });

  it('falls back to a fixed string when the name has no letters', () => {
    expect(vesselCodeLetters('007')).toBe('VSL');
    expect(vesselCodeLetters(null)).toBe('VSL');
  });
});

describe('vesselCodeCandidates', () => {
  it('starts with the first three letters, then first letter + two consonants, then two letters + digit', () => {
    expect(vesselCodeCandidates('M/Y DRAAK', 4)).toEqual(['DRA', 'DRK', 'DR1', 'DR2']);
    expect(vesselCodeCandidates('GAME CHANGER', 3)).toEqual(['GAM', 'GMC', 'GA1']);
  });

  it('treats Y as a vowel so the consonant code differs from the plain one', () => {
    expect(vesselCodeCandidates('HYDRA', 2)).toEqual(['HYD', 'HDR']);
  });

  it('skips the consonant code when there are not two consonants after the first letter', () => {
    expect(vesselCodeCandidates('AIOE', 2)).toEqual(['AIO', 'AI1']);
  });

  it('pads short names', () => {
    expect(vesselCodeCandidates('Q', 1)).toEqual(['QXX']);
  });
});

describe('getVesselCode', () => {
  it('derives the code from the name when no code is stored', () => {
    const draak = v('a', 'M/Y DRAAK');
    expect(getVesselCode(draak, [draak])).toBe('DRA');
    expect(getVesselCode(v('b', 'GAME CHANGER'))).toBe('GAM');
    expect(getVesselCode(v('c', 'HYDRA'))).toBe('HYD');
  });

  it('prefers a stored code, upper-cased', () => {
    const vessel = v('a', 'M/Y DRAAK', null, 'dkx');
    expect(getVesselCode(vessel, [vessel])).toBe('DKX');
  });

  it('ignores a stored code that is not a valid code', () => {
    const vessel = v('a', 'M/Y DRAAK', null, 'toolong');
    expect(getVesselCode(vessel, [vessel])).toBe('DRA');
  });

  it('gives the plain code to the earliest vessel and the consonant code to the next', () => {
    const hydra = v('h1', 'HYDRA', '2024-01-01T00:00:00Z');
    const hydrogen = v('h2', 'M/Y HYDROGEN', '2025-06-01T00:00:00Z');
    // Input order must not matter.
    const fleet = [hydrogen, hydra];
    expect(getVesselCode(hydra, fleet)).toBe('HYD');
    expect(getVesselCode(hydrogen, fleet)).toBe('HDR');
  });

  it('breaks a created_at tie by id', () => {
    const a = v('aaa', 'DRAAK', '2025-01-01T00:00:00Z');
    const b = v('bbb', 'DRAKE', '2025-01-01T00:00:00Z');
    expect(getVesselCode(b, [b, a])).toBe('DRK');
    expect(getVesselCode(a, [b, a])).toBe('DRA');
  });

  it('falls back to two letters + a digit when the consonant code is also taken', () => {
    const fleet = [
      v('1', 'DRAAK', '2024-01-01T00:00:00Z'),
      v('2', 'DRAKE', '2024-02-01T00:00:00Z'),
      v('3', 'DRAKKAR', '2024-03-01T00:00:00Z'),
      v('4', 'DRAKON', '2024-04-01T00:00:00Z'),
    ];
    const codes = assignVesselCodes(fleet);
    expect(codes.get('1')).toBe('DRA');
    expect(codes.get('2')).toBe('DRK');
    expect(codes.get('3')).toBe('DR1');
    expect(codes.get('4')).toBe('DR2');
  });

  it('never hands a derived code to a vessel when another vessel stores it', () => {
    const older = v('1', 'DRAAK', '2024-01-01T00:00:00Z');
    const newer = v('2', 'DRAGONFLY', '2025-01-01T00:00:00Z', 'DRA');
    const codes = assignVesselCodes([older, newer]);
    expect(codes.get('2')).toBe('DRA');
    expect(codes.get('1')).toBe('DRK');
  });

  it('keeps every code unique across a larger fleet', () => {
    const names = ['M/Y DRAAK', 'HYDRA', 'GAME CHANGER', 'DAGON', 'LEVIATHAN', 'DRAKE', 'HYDROGEN', 'GAMBIT', 'GAMMA', 'GAMER'];
    const fleet = names.map((name, i) => v(`id-${i}`, name, `2024-0${(i % 9) + 1}-01T00:00:00Z`));
    const codes = Array.from(assignVesselCodes(fleet).values());
    expect(new Set(codes).size).toBe(fleet.length);
    for (const code of codes) expect(code).toMatch(/^[A-Z][A-Z0-9]{2}$/);
  });

  it('is deterministic: the same fleet gives the same codes', () => {
    const fleet = () => [v('2', 'HYDROGEN', '2025-01-01T00:00:00Z'), v('1', 'HYDRA', '2024-01-01T00:00:00Z')];
    expect(Array.from(assignVesselCodes(fleet()).entries()).sort()).toEqual(Array.from(assignVesselCodes(fleet()).entries()).sort());
  });

  it('orders vessels without a created_at after dated ones', () => {
    const undated = v('0', 'HYDRA', null);
    const dated = v('9', 'HYDROGEN', '2025-01-01T00:00:00Z');
    const codes = assignVesselCodes([undated, dated]);
    expect(codes.get('9')).toBe('HYD');
    expect(codes.get('0')).toBe('HDR');
  });
});

describe('resolveVesselByCode', () => {
  const fleet = [v('d', 'M/Y DRAAK'), v('h', 'HYDRA'), v('g', 'GAME CHANGER')];

  it('finds a vessel by code, ignoring case', () => {
    expect(resolveVesselByCode('dra', fleet)?.id).toBe('d');
    expect(resolveVesselByCode('DRA', fleet)?.id).toBe('d');
    expect(resolveVesselByCode(' Hyd ', fleet)?.id).toBe('h');
  });

  it('returns undefined for an unknown or empty code', () => {
    expect(resolveVesselByCode('xyz', fleet)).toBeUndefined();
    expect(resolveVesselByCode('', fleet)).toBeUndefined();
    expect(resolveVesselByCode(undefined, fleet)).toBeUndefined();
  });

  it('derives codes against the whole fleet, not only the reachable vessels', () => {
    const hydra = v('h1', 'HYDRA', '2024-01-01T00:00:00Z');
    const hydrogen = v('h2', 'HYDROGEN', '2025-01-01T00:00:00Z');
    // A crew member who can only reach HYDROGEN still sees it as HDR.
    expect(resolveVesselByCode('hdr', [hydrogen], [hydra, hydrogen])?.id).toBe('h2');
    expect(resolveVesselByCode('hyd', [hydrogen], [hydra, hydrogen])).toBeUndefined();
  });
});

describe('vessel paths', () => {
  it('builds lower-case scoped paths', () => {
    expect(vesselPath('DRA')).toBe('/v/dra');
    expect(vesselPath('DRA', 'crew/list')).toBe('/v/dra/crew/list');
    expect(vesselPath('dra', '/safety/permits')).toBe('/v/dra/safety/permits');
    expect(vesselPath('DRA', 'crew/list?tab=onboard')).toBe('/v/dra/crew/list?tab=onboard');
    expect(vesselPath('DRA', '?tab=x')).toBe('/v/dra?tab=x');
  });

  it('parses a scoped path', () => {
    expect(parseVesselPath('/v/dra/crew/list')).toEqual({ code: 'DRA', rest: 'crew/list' });
    expect(parseVesselPath('/v/DRA')).toEqual({ code: 'DRA', rest: '' });
    expect(parseVesselPath('/v/dra/')).toEqual({ code: 'DRA', rest: '' });
    expect(parseVesselPath('/vessel/dra')).toBeNull();
    expect(parseVesselPath('/fleet/dashboard')).toBeNull();
  });

  it('switches vessel and keeps the sub-path, query and hash', () => {
    expect(switchVesselInPath('/v/dra/safety/permits?tab=open#top', 'HYD')).toBe('/v/hyd/safety/permits?tab=open#top');
    expect(switchVesselInPath('/v/dra', 'hyd')).toBe('/v/hyd');
    expect(switchVesselInPath('/fleet/dashboard?x=1', 'HYD')).toBe('/v/hyd');
  });

  it('normalises codes', () => {
    expect(normaliseVesselCode(' dra ')).toBe('DRA');
    expect(normaliseVesselCode(null)).toBe('');
  });
});

describe('vessel path patterns (the static nav tree)', () => {
  it('builds paths on the :vesselCode pattern', () => {
    expect(VESSEL_SCOPE_PATTERN).toBe('/v/:vesselCode');
    expect(vesselPatternPath()).toBe('/v/:vesselCode');
    expect(vesselPatternPath('crew/list')).toBe('/v/:vesselCode/crew/list');
    expect(vesselPatternPath('/safety/drills')).toBe('/v/:vesselCode/safety/drills');
    expect(vesselPatternPath('?tab=x')).toBe('/v/:vesselCode?tab=x');
  });

  it('recognises the literal param in a URL, and nothing that could be a code', () => {
    expect(isVesselCodeParam(':vesselCode')).toBe(true);
    expect(isVesselCodeParam(':VESSELCODE')).toBe(true);
    expect(isVesselCodeParam('dra')).toBe(false);
    expect(isVesselCodeParam('vesselCode')).toBe(false);
    expect(isVesselCodeParam(null)).toBe(false);
  });

  it('parses a pattern path like any scoped path', () => {
    expect(parseVesselPath(vesselPatternPath('crew/list'))).toEqual({ code: ':VESSELCODE', rest: 'crew/list' });
    expect(isVesselCodeParam(parseVesselPath('/v/:vesselCode')?.code)).toBe(true);
  });
});
