/**
 * Phone numbers as an international dial code plus a national number
 * (gap/04 C20, improvement 14, T-68: the reference stored "+44" in front of
 * a number that already had it, and showed it twice). STORM stores the two
 * parts apart (crew_personal_details.phone_dial_code / phone_number, and
 * the mobile pair; crew_next_of_kin's new columns) and renders them once.
 *
 * `splitLegacyPhone` is the TS mirror of the SQL `crew_phone_split()` the
 * 060300 backfill runs over profiles.phone; both pass the same cases
 * (src/test/crew/phone.test.ts and supabase/tests/sql/crew/profile_details
 * .test.sql). The form uses it to split a pasted "+44 7700 900123" into its
 * two fields. Pure: no React, no client.
 */
import type { Country } from '../types/domain';

export interface PhoneParts {
  /** Digits only (1 to 4), or null for a number written without one. */
  dialCode: string | null;
  /** Digits only. */
  national: string;
}

const toCodes = (dialCodes: Iterable<string>): string[] => [...new Set(dialCodes)].filter((c) => /^[0-9]{1,4}$/.test(c));

/**
 * A legacy phone text as dial code and national digits, or null when it
 * cannot be read (the SQL leaves such a number behind):
 * - "+" or "00" first: international; a written trunk prefix "(0)" is
 *   dropped; the longest known dial code that starts the digits is the dial
 *   code (+1 876 is Jamaica, +1 212 the United States); no known code: null;
 * - otherwise a national number without a dial code;
 * - the national part keeps 4 to 20 digits.
 */
export function splitLegacyPhone(raw: string | null | undefined, dialCodes: Iterable<string>): PhoneParts | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  const international = /^(\+|00)/.test(text);
  let digits = text.split('(0)').join('').replace(/[^0-9]/g, '');
  if (text.startsWith('00')) digits = digits.slice(2);
  let dialCode: string | null = null;
  if (international) {
    const codes = toCodes(dialCodes).sort((a, b) => b.length - a.length || a.localeCompare(b));
    dialCode = codes.find((code) => digits.startsWith(code)) ?? null;
    if (!dialCode) return null;
    digits = digits.slice(dialCode.length);
  }
  if (digits.length < 4 || digits.length > 20) return null;
  return { dialCode, national: digits };
}

/** A dial code as typed ("+44", " 44 ") to its digits, or null when it is not 1 to 4 digits. */
export function normaliseDialCode(text: string | null | undefined): string | null {
  const digits = (text ?? '').trim().replace(/^\+/, '').replace(/\s+/g, '');
  return /^[0-9]{1,4}$/.test(digits) ? digits : null;
}

/**
 * A national number as typed to what STORM stores: separators (. - / ( ))
 * become spaces, runs of spaces one space, trimmed. "7700-900.123" ->
 * "7700 900 123". It does not judge the result (see isValidNationalNumber).
 */
export function normaliseNationalNumber(text: string | null | undefined): string {
  return (text ?? '')
    .replace(/[.\-/()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The stored rule (CHECK in 060300): digits and spaces, starting and ending with a digit, 4 to 20 characters. */
export function isValidNationalNumber(text: string | null | undefined): boolean {
  return /^[0-9][0-9 ]{2,18}[0-9]$/.test(text ?? '');
}

/** "+44 7700 900123": the number rendered once, with its dial code when it has one; null when there is no number. */
export function formatPhone(dialCode: string | null | undefined, national: string | null | undefined): string | null {
  const number = (national ?? '').trim();
  if (!number) return null;
  const code = normaliseDialCode(dialCode);
  return code ? `+${code} ${number}` : number;
}

/** A `tel:` link for the number (E.164-like when there is a dial code), or null. */
export function telHref(dialCode: string | null | undefined, national: string | null | undefined): string | null {
  const digits = (national ?? '').replace(/[^0-9]/g, '');
  if (!digits) return null;
  const code = normaliseDialCode(dialCode);
  return code ? `tel:+${code}${digits}` : `tel:${digits}`;
}

/**
 * The country a dial code stands for, for the dial-code picker (which picks
 * a country). Shared codes resolve to the person's own country when it uses
 * that code (their address or nationality, in the order given), else to the
 * main country of the code (+1 the United States, +44 the United Kingdom,
 * +7 Russia, …), else the first country with the code by name.
 */
export const PRIMARY_COUNTRY_FOR_DIAL_CODE: Readonly<Record<string, string>> = {
  '1': 'US',
  '7': 'RU',
  '44': 'GB',
  '47': 'NO',
  '61': 'AU',
  '64': 'NZ',
  '212': 'MA',
  '262': 'RE',
  '358': 'FI',
  '500': 'FK',
  '590': 'GP',
  '599': 'CW',
  '672': 'NF',
};

export function countryForDialCode(
  dialCode: string | null | undefined,
  countries: readonly Country[],
  prefer: readonly (string | null | undefined)[] = [],
): Country | null {
  const code = normaliseDialCode(dialCode);
  if (!code) return null;
  const matches = countries.filter((c) => c.dialCode === code);
  if (matches.length === 0) return null;
  for (const iso2 of prefer) {
    const hit = iso2 ? matches.find((c) => c.iso2 === iso2) : undefined;
    if (hit) return hit;
  }
  const primary = PRIMARY_COUNTRY_FOR_DIAL_CODE[code];
  return matches.find((c) => c.iso2 === primary) ?? [...matches].sort((a, b) => a.sortName.localeCompare(b.sortName))[0];
}
