import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareDates,
  daysBetween,
  daysInclusive,
  formatWeeksDays,
  isDateOnly,
  localToday,
  maxDate,
  minDate,
  parseWeeksDays,
  periodBarLabel,
  periodDurationLabel,
} from '@/modules/rotation-planner/lib/duration';

describe('isDateOnly', () => {
  it.each([['2026-11-27'], ['2024-02-29'], ['2000-02-29'], ['1999-12-31'], ['2026-01-01']])('accepts %s', (d) => expect(isDateOnly(d)).toBe(true));
  it.each([
    ['2026-02-29'], ['1900-02-29'], ['2026-13-01'], ['2026-00-10'], ['2026-04-31'], ['2026-11-27T00:00:00Z'], ['26-11-27'],
    ['2026-1-7'], [''], [null], [undefined], [20261127], ['2026/11/27'],
  ])('refuses %s', (d) => expect(isDateOnly(d)).toBe(false));
});

describe('addDays / daysBetween / daysInclusive / compareDates', () => {
  it('adds across month, year and leap days', () => {
    expect(addDays('2026-11-27', 0)).toBe('2026-11-27');
    expect(addDays('2026-11-27', 4)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2025-03-01', -1)).toBe('2025-02-28');
    expect(addDays('2026-01-01', 365)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -731)).toBe('2024-01-01');
  });

  it('is unaffected by daylight saving changes (calendar days)', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('refuses a fractional step and a bad date', () => {
    expect(() => addDays('2026-11-27', 1.5)).toThrow(RangeError);
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
    expect(() => daysBetween('x', '2026-01-01')).toThrow(RangeError);
    expect(() => compareDates('2026-01-01', '')).toThrow(RangeError);
  });

  it('daysBetween is b - a and antisymmetric', () => {
    expect(daysBetween('2026-11-27', '2026-11-27')).toBe(0);
    expect(daysBetween('2026-11-27', '2026-12-27')).toBe(30);
    expect(daysBetween('2026-12-27', '2026-11-27')).toBe(-30);
    for (let n = -400; n <= 400; n += 37) expect(daysBetween('2026-06-15', addDays('2026-06-15', n))).toBe(n);
  });

  it('daysInclusive counts both ends and never goes negative', () => {
    expect(daysInclusive('2026-11-27', '2026-11-27')).toBe(1);
    expect(daysInclusive('2026-11-01', '2026-11-30')).toBe(30);
    expect(daysInclusive('2026-11-28', '2026-11-27')).toBe(0);
    expect(daysInclusive('2026-12-01', '2026-11-01')).toBe(0);
  });

  it('compareDates, maxDate and minDate', () => {
    expect(compareDates('2026-01-01', '2026-01-02')).toBe(-1);
    expect(compareDates('2026-01-02', '2026-01-01')).toBe(1);
    expect(compareDates('2026-01-01', '2026-01-01')).toBe(0);
    expect(maxDate('2026-01-01', '2027-01-01')).toBe('2027-01-01');
    expect(maxDate('2027-01-01', '2026-01-01')).toBe('2027-01-01');
    expect(minDate('2026-01-01', '2027-01-01')).toBe('2026-01-01');
    expect(minDate('2027-01-01', '2026-01-01')).toBe('2026-01-01');
    expect(maxDate('2026-05-05', '2026-05-05')).toBe('2026-05-05');
  });
});

describe('localToday', () => {
  it('reads the local calendar day, never UTC', () => {
    expect(localToday(new Date(2026, 10, 27, 23, 59))).toBe('2026-11-27');
    expect(localToday(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
    expect(localToday(new Date(999, 2, 3))).toBe('0999-03-03');
    expect(isDateOnly(localToday())).toBe(true);
  });
});

describe('formatWeeksDays (T-27 "5w 6d")', () => {
  it.each([
    [0, '0d'], [1, '1d'], [6, '6d'], [7, '1w'], [8, '1w 1d'], [13, '1w 6d'], [14, '2w'], [41, '5w 6d'], [42, '6w'], [365, '52w 1d'], [731, '104w 3d'],
  ])('%i days -> %s', (n, s) => expect(formatWeeksDays(n)).toBe(s));

  it.each([[-1], [1.5], [Number.NaN], [Number.POSITIVE_INFINITY]])('refuses %s', (n) => expect(() => formatWeeksDays(n)).toThrow(RangeError));

  it('round-trips through parseWeeksDays for 0 to 800 days', () => {
    for (let n = 0; n <= 800; n++) expect(parseWeeksDays(formatWeeksDays(n))).toBe(n);
  });
});

describe('parseWeeksDays', () => {
  it.each([
    ['5w 6d', 41], ['5w', 35], ['6d', 6], ['5 w 6 d', 41], ['5W6D', 41], [' 2w ', 14], ['0d', 0], ['41', 41], ['0', 0], ['10w 0d', 70],
  ])('%s -> %i', (s, n) => expect(parseWeeksDays(s)).toBe(n));

  it.each([[''], ['  '], [null], [undefined], ['6d 5w'], ['w'], ['d'], ['5x'], ['-3'], ['1.5w'], ['5w 6d 2d'], ['five weeks']])('refuses %s', (s) =>
    expect(parseWeeksDays(s)).toBeNull(),
  );
});

describe('period labels', () => {
  it('a closed period reads its weeks and days, counting both ends', () => {
    expect(periodDurationLabel({ start: '2026-11-01', end: '2026-12-11' })).toBe('5w 6d');
    expect(periodDurationLabel({ start: '2026-11-27', end: '2026-11-27' })).toBe('1d');
    expect(periodDurationLabel({ start: '2026-11-01', end: '2026-11-14', endUnknown: false })).toBe('2w');
  });

  it('an open period reads End unknown', () => {
    expect(periodDurationLabel({ start: '2026-11-01', end: null })).toBe('End unknown');
    expect(periodDurationLabel({ start: '2026-11-01', end: '2026-12-27', endUnknown: true })).toBe('End unknown');
  });

  it('the bar label is the type and the duration', () => {
    expect(periodBarLabel('Rotation leave', { start: '2026-11-01', end: '2026-12-11' })).toBe('Rotation leave · 5w 6d');
    expect(periodBarLabel('On board', { start: '2026-11-01', end: null, endUnknown: true })).toBe('On board · End unknown');
  });
});
