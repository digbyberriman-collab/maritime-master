/**
 * Calendar-day helpers (src/lib/records/dates.ts). The instant cases compute
 * their expected value from the local calendar day of each instant, so they
 * hold in every time zone; the Done check runs this file under
 * TZ=Pacific/Auckland, America/Los_Angeles, Europe/London and UTC.
 */
import { describe, expect, it } from 'vitest';
import { addCalendarDays, daysBetween, daysBetweenOrNull, isCalendarDate, localCalendarDate, toCalendarDate } from '@/lib/records/dates';

/** The local calendar day of an instant, computed independently of the helper. */
const localDayOf = (d: Date) =>
  `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('isCalendarDate', () => {
  it.each(['2026-02-28', '2028-02-29', '0001-01-01', '9999-12-31'])('accepts %s', (v) => expect(isCalendarDate(v)).toBe(true));
  it.each(['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-3-05', ' 2026-03-05', '2026-03-05T00:00:00Z', '', null, 20260305])(
    'rejects %j',
    (v) => expect(isCalendarDate(v)).toBe(false),
  );
});

describe('toCalendarDate (date columns)', () => {
  it('keeps a string date as written, including the date part of a timestamp', () => {
    expect(toCalendarDate('2026-03-15')).toBe('2026-03-15');
    expect(toCalendarDate('2026-03-15T22:30:00+00:00')).toBe('2026-03-15');
  });
  it('reads a Date as its local day', () => {
    expect(toCalendarDate(new Date(2026, 2, 15, 23, 59))).toBe('2026-03-15');
  });
  it('throws on garbage', () => {
    expect(() => toCalendarDate('garbage')).toThrow(RangeError);
    expect(() => toCalendarDate(new Date(Number.NaN))).toThrow(RangeError);
  });
});

describe('localCalendarDate (instants)', () => {
  it('passes a calendar date through unchanged', () => {
    expect(localCalendarDate('2026-03-15')).toBe('2026-03-15');
    expect(localCalendarDate(' 2026-03-15 ')).toBe('2026-03-15');
  });

  it('reads a timestamp string as the local day of that instant', () => {
    for (const iso of ['2026-03-15T22:30:00+00:00', '2026-03-16T02:00:00+00:00', '2026-03-15T11:00:00Z', '2026-12-31T23:59:59-10:00']) {
      expect(localCalendarDate(iso)).toBe(localDayOf(new Date(iso)));
    }
  });

  it('agrees with the local day of a Date built from local parts', () => {
    const late = new Date(2026, 2, 15, 23, 30);
    expect(localCalendarDate(late)).toBe('2026-03-15');
    expect(localCalendarDate(late.toISOString())).toBe('2026-03-15');
  });

  it.each(['garbage', '', '2026-02-30', '2026-13-01'])('throws on %j', (v) => {
    expect(() => localCalendarDate(v)).toThrow(RangeError);
  });

  it('throws on an invalid Date', () => {
    expect(() => localCalendarDate(new Date(Number.NaN))).toThrow(RangeError);
  });

  it('differs from toCalendarDate only by the zone offset, never by more than a day', () => {
    const iso = '2026-03-15T22:30:00+00:00';
    expect(Math.abs(daysBetween(toCalendarDate(iso), localCalendarDate(iso)))).toBeLessThanOrEqual(1);
  });
});

describe('addCalendarDays', () => {
  it('moves across the daylight-saving changes without losing or repeating a day (Europe/London dates)', () => {
    // Clocks go forward on 29 Mar 2026 and back on 25 Oct 2026 in London.
    expect(addCalendarDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addCalendarDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addCalendarDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addCalendarDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addCalendarDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(addCalendarDays('2026-10-26', -2)).toBe('2026-10-24');
    // A Date is its local day, whatever the hour, on either side of a change.
    expect(addCalendarDays(new Date(2026, 2, 29, 0, 30), 1)).toBe('2026-03-30');
    expect(addCalendarDays(new Date(2026, 9, 25, 23, 30), 1)).toBe('2026-10-26');
    // Round trip with daysBetween across both changes.
    for (let n = -400; n <= 400; n += 37) expect(daysBetween('2026-03-29', addCalendarDays('2026-03-29', n))).toBe(n);
  });

  it('rolls over months, years and leap days', () => {
    expect(addCalendarDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addCalendarDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addCalendarDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addCalendarDays('2028-02-29', 365)).toBe('2029-02-28');
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addCalendarDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addCalendarDays('2026-11-27', 0)).toBe('2026-11-27');
    expect(addCalendarDays('0001-01-02', -1)).toBe('0001-01-01');
  });

  it('reads an ISO timestamp as its date part, like daysBetween', () => {
    expect(addCalendarDays('2026-03-15T22:30:00+00:00', 1)).toBe('2026-03-16');
    expect(addCalendarDays('2026-03-15T23:59:59Z', -15)).toBe('2026-02-28');
  });

  it.each(['garbage', '', '2026-02-30', '2026-13-01', '2026-3-05'])('throws RangeError on %j', (v) => {
    expect(() => addCalendarDays(v, 1)).toThrow(RangeError);
  });

  it('throws RangeError on an invalid Date and on a day count that is not a whole number', () => {
    expect(() => addCalendarDays(new Date(Number.NaN), 1)).toThrow(RangeError);
    for (const n of [1.5, -0.25, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => addCalendarDays('2026-11-27', n), String(n)).toThrow(RangeError);
  });

  it('throws RangeError past the four-digit years', () => {
    expect(() => addCalendarDays('9999-12-31', 1)).toThrow(RangeError);
    expect(() => addCalendarDays('0001-01-01', -1)).toThrow(RangeError);
  });
});

describe('daysBetweenOrNull (display code)', () => {
  it('is daysBetween for two calendar dates', () => {
    expect(daysBetweenOrNull('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetweenOrNull('2026-10-26', '2026-10-24')).toBe(-2);
    expect(daysBetweenOrNull('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetweenOrNull('2026-03-15T22:30:00Z', '2026-03-16')).toBe(1);
  });

  it('is null for a missing side or a value that is not a calendar date, never NaN or a throw', () => {
    expect(daysBetweenOrNull(null, '2026-03-30')).toBeNull();
    expect(daysBetweenOrNull('2026-03-30', undefined)).toBeNull();
    expect(daysBetweenOrNull()).toBeNull();
    expect(daysBetweenOrNull('garbage', '2026-03-30')).toBeNull();
    expect(daysBetweenOrNull('2026-02-30', '2026-03-30')).toBeNull();
    expect(daysBetweenOrNull('', '2026-03-30')).toBeNull();
  });
});
