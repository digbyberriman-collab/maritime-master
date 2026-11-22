/**
 * Calendar-day helpers (src/lib/records/dates.ts). The instant cases compute
 * their expected value from the local calendar day of each instant, so they
 * hold in every time zone; the Done check runs this file under
 * TZ=Pacific/Auckland, America/Los_Angeles and UTC.
 */
import { describe, expect, it } from 'vitest';
import { daysBetween, isCalendarDate, localCalendarDate, toCalendarDate } from '@/lib/records/dates';

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
