/**
 * Phone numbers as dial code + national number (X1-03; gap/04 C20,
 * improvement 14, T-68). splitLegacyPhone is the TS mirror of the SQL
 * crew_phone_split() that the 060300 backfill runs: the cases below are the
 * same as supabase/tests/sql/crew/profile_details.test.sql (section 1).
 */
import { describe, expect, it } from 'vitest';
import {
  PRIMARY_COUNTRY_FOR_DIAL_CODE,
  countryForDialCode,
  formatPhone,
  isValidNationalNumber,
  normaliseDialCode,
  normaliseNationalNumber,
  splitLegacyPhone,
  telHref,
} from '@/modules/crew/lib/phone';
import type { Country } from '@/modules/crew/types/domain';

// The dial codes of the cases (a subset of ref_countries; the longest-prefix rule needs both 1 and 1876).
const DIAL_CODES = ['1', '1876', '1268', '7', '33', '44', '590', '31', '358'];

/** The SQL test's cases, row for row: [raw, dial code, national] (null national: no row). */
const CASES: ReadonlyArray<[string | null, string | null, string | null]> = [
  ['+44 7700 900123', '44', '7700900123'],
  ['+44 (0)7700 900123', '44', '7700900123'],
  ['0044 20 7946 0000', '44', '2079460000'],
  ['+1 876 555 0101', '1876', '5550101'],
  ['+1 (212) 555-0100', '1', '2125550100'],
  ['+33 6 12 34 56 78', '33', '612345678'],
  ['+590 690 12 34 56', '590', '690123456'],
  ['+7 912 345-67-89', '7', '9123456789'],
  ['07700 900123', null, '07700900123'],
  ['  612.34.56.78 ', null, '612345678'],
  ['+999 1234 5678', null, null],
  ['+44 12', null, null],
  ['123', null, null],
  ['+44 1234 5678 9012 3456 78901', null, null],
  ['+44 1234 5678 9012 3456 7890', '44', '12345678901234567890'],
  ['', null, null],
  [null, null, null],
];

describe('splitLegacyPhone (mirror of crew_phone_split)', () => {
  it.each(CASES)('%j -> %j %j', (raw, dial, national) => {
    const parts = splitLegacyPhone(raw, DIAL_CODES);
    if (national === null) expect(parts).toBeNull();
    else expect(parts).toEqual({ dialCode: dial, national });
  });

  it('picks the longest known dial code (Jamaica 1876 over the United States 1)', () => {
    expect(splitLegacyPhone('+18765550101', DIAL_CODES)?.dialCode).toBe('1876');
    expect(splitLegacyPhone('+12125550100', DIAL_CODES)?.dialCode).toBe('1');
  });

  it('ignores malformed codes in the list and duplicates', () => {
    expect(splitLegacyPhone('+44 7700 900123', ['44', '44', '+44', '12345', 'x'])).toEqual({ dialCode: '44', national: '7700900123' });
  });

  it('an international number with no known code is left behind', () => {
    expect(splitLegacyPhone('+44 7700 900123', [])).toBeNull();
  });
});

describe('the stored parts', () => {
  it('normaliseDialCode keeps 1 to 4 digits, without the plus', () => {
    expect(normaliseDialCode('+44')).toBe('44');
    expect(normaliseDialCode(' 1 876 ')).toBe('1876');
    expect(normaliseDialCode('12345')).toBeNull();
    expect(normaliseDialCode('')).toBeNull();
    expect(normaliseDialCode(null)).toBeNull();
    expect(normaliseDialCode('44a')).toBeNull();
  });

  it('normaliseNationalNumber turns separators into single spaces', () => {
    expect(normaliseNationalNumber(' 7700-900.123 ')).toBe('7700 900 123');
    expect(normaliseNationalNumber('(0)20 7946/0000')).toBe('0 20 7946 0000');
    expect(normaliseNationalNumber('612   34  56')).toBe('612 34 56');
    expect(normaliseNationalNumber(undefined)).toBe('');
  });

  it('isValidNationalNumber is the stored CHECK: digits and spaces, a digit at each end, 4 to 20 characters', () => {
    expect(isValidNationalNumber('7700 900123')).toBe(true);
    expect(isValidNationalNumber('1234')).toBe(true);
    expect(isValidNationalNumber('12345678901234567890')).toBe(true);
    expect(isValidNationalNumber('123456789012345678901')).toBe(false);
    expect(isValidNationalNumber('123')).toBe(false);
    expect(isValidNationalNumber(' 1234')).toBe(false);
    expect(isValidNationalNumber('+44 7700')).toBe(false);
    expect(isValidNationalNumber('7700-900')).toBe(false);
    expect(isValidNationalNumber('')).toBe(false);
    expect(isValidNationalNumber(null)).toBe(false);
  });
});

describe('rendering once (T-68)', () => {
  it('formatPhone shows the dial code once, or the number alone', () => {
    expect(formatPhone('44', '7700 900123')).toBe('+44 7700 900123');
    expect(formatPhone('+44', '7700 900123')).toBe('+44 7700 900123');
    expect(formatPhone(null, '07700 900123')).toBe('07700 900123');
    expect(formatPhone('44', '')).toBeNull();
    expect(formatPhone('44', null)).toBeNull();
  });

  it('telHref dials the digits with the code', () => {
    expect(telHref('44', '7700 900123')).toBe('tel:+447700900123');
    expect(telHref(null, '07700 900123')).toBe('tel:07700900123');
    expect(telHref('44', '  ')).toBeNull();
  });
});

describe('countryForDialCode (the dial-code picker picks a country)', () => {
  const c = (iso2: string, dialCode: string | null, name = iso2): Country => ({
    iso2,
    iso3: `${iso2}X`,
    name,
    demonym: null,
    dialCode,
    flagEmoji: null,
    sortName: name,
  });
  const countries = [c('GB', '44', 'United Kingdom'), c('JE', '44', 'Jersey'), c('GG', '44', 'Guernsey'), c('US', '1'), c('CA', '1'), c('JM', '1876'), c('FR', '33'), c('AQ', null)];

  it("prefers the person's own country when it uses the code", () => {
    expect(countryForDialCode('44', countries, ['JE'])?.iso2).toBe('JE');
    expect(countryForDialCode('1', countries, [null, 'CA'])?.iso2).toBe('CA');
  });

  it('else the main country of a shared code', () => {
    expect(countryForDialCode('44', countries)?.iso2).toBe('GB');
    expect(countryForDialCode('+1', countries, ['FR'])?.iso2).toBe('US');
  });

  it('else the only, or the first by name, country with the code', () => {
    expect(countryForDialCode('1876', countries)?.iso2).toBe('JM');
    expect(countryForDialCode('33', countries)?.iso2).toBe('FR');
    const noPrimary = [c('ZZ', '999', 'Zed'), c('YY', '999', 'Why')];
    expect(countryForDialCode('999', noPrimary)?.iso2).toBe('YY');
  });

  it('nothing for an unknown or empty code', () => {
    expect(countryForDialCode('8', countries)).toBeNull();
    expect(countryForDialCode('', countries)).toBeNull();
    expect(countryForDialCode(null, countries)).toBeNull();
  });

  it('every shared code of the seed has a main country, each a two-letter code', () => {
    for (const [code, iso2] of Object.entries(PRIMARY_COUNTRY_FOR_DIAL_CODE)) {
      expect(code).toMatch(/^[0-9]{1,4}$/);
      expect(iso2).toMatch(/^[A-Z]{2}$/);
    }
  });
});
