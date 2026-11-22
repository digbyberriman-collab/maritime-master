import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { isCalendarDate, toCalendarDate } from '@/lib/records/dates';
import {
  INT4_MAX,
  blankFieldsToNull,
  blankToNull,
  dateOnly,
  fromDateOnly,
  isDateOnly,
  optionalDateOnly,
  optionalPositiveInt,
  optionalText,
  positiveInt,
  requiredText,
  toDateOnly,
  todayDateOnly,
} from '@/shared/lib/form';

describe('blankToNull', () => {
  it.each([
    ['', null],
    ['   ', null],
    ['\n\t', null],
    [undefined, null],
    [null, null],
    ['  Chief Stew  ', 'Chief Stew'],
    ['0', '0'],
  ])('%j → %j', (input, expected) => {
    expect(blankToNull(input as string)).toBe(expected);
  });

  it('leaves non-strings alone', () => {
    expect(blankToNull(0)).toBe(0);
    expect(blankToNull(false)).toBe(false);
    const d = new Date();
    expect(blankToNull(d)).toBe(d);
  });

  it('blankFieldsToNull normalises string fields only', () => {
    expect(blankFieldsToNull({ a: ' ', b: ' x ', c: 3, d: undefined, e: true })).toEqual({
      a: null,
      b: 'x',
      c: 3,
      d: null,
      e: true,
    });
  });
});

describe('isDateOnly', () => {
  it.each(['2026-11-22', '2024-02-29', '2026-12-31', '0001-01-01'])('accepts %s', (v) => {
    expect(isDateOnly(v)).toBe(true);
  });
  it.each(['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-10', '2026-11-00', '2026-11-31', '26-11-22', '2026-1-2', '2026-11-22T00:00', '', 20261122])(
    'rejects %j',
    (v) => {
      expect(isDateOnly(v)).toBe(false);
    },
  );
});

/**
 * The bug class these helpers exist for: `toISOString().slice(0, 10)` gives
 * the UTC day, which is the wrong calendar day outside UTC. Node honours
 * runtime changes to process.env.TZ.
 */
describe.each([
  ['Pacific/Auckland', 'east of UTC'],
  ['America/Los_Angeles', 'west of UTC'],
  ['Asia/Kolkata', 'half-hour offset'],
])('date-only helpers in %s (%s)', (tz) => {
  let previous: string | undefined;
  beforeAll(() => {
    previous = process.env.TZ;
    process.env.TZ = tz;
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });

  it('the environment really is outside UTC', () => {
    expect(new Date(2026, 10, 22, 12).getTimezoneOffset()).not.toBe(0);
  });

  it('toDateOnly keeps the local calendar day just after local midnight', () => {
    const justAfterMidnight = new Date(2026, 10, 22, 0, 30);
    expect(toDateOnly(justAfterMidnight)).toBe('2026-11-22');
  });

  it('toDateOnly keeps the local calendar day late in the evening', () => {
    const lateEvening = new Date(2026, 10, 22, 23, 30);
    expect(toDateOnly(lateEvening)).toBe('2026-11-22');
  });

  it('differs from the UTC slice where the naive approach is wrong', () => {
    // In Auckland 00:30 local is the previous UTC day; in Los Angeles 23:30
    // local is the next UTC day. At least one of the two is wrong for any
    // whole-hour offset outside UTC.
    const samples = [new Date(2026, 10, 22, 0, 30), new Date(2026, 10, 22, 23, 30)];
    const naiveWrong = samples.some((d) => d.toISOString().slice(0, 10) !== '2026-11-22');
    expect(naiveWrong).toBe(true);
    expect(samples.map(toDateOnly)).toEqual(['2026-11-22', '2026-11-22']);
  });

  it('fromDateOnly returns local midnight of that day', () => {
    const d = fromDateOnly('2026-11-22') as Date;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 10, 22, 0, 0]);
  });

  it('round-trips across a DST change and month ends', () => {
    for (const v of ['2026-03-08', '2026-04-05', '2026-09-27', '2026-10-25', '2026-11-01', '2024-02-29', '2026-12-31']) {
      expect(toDateOnly(fromDateOnly(v))).toBe(v);
    }
  });

  it('a UTC timestamp maps to the local day it falls on', () => {
    // 2026-11-21 23:30 UTC is already 22 Nov in Auckland and still 21 Nov in Los Angeles.
    const instant = new Date('2026-11-21T23:30:00Z');
    const expected = process.env.TZ === 'America/Los_Angeles' ? '2026-11-21' : '2026-11-22';
    expect(toDateOnly(instant)).toBe(expected);
  });

  it('todayDateOnly uses the local day', () => {
    expect(todayDateOnly(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });

  it('dateOnly() converts picker Dates with the local day', () => {
    expect(dateOnly().parse(new Date(2026, 10, 22, 0, 30))).toBe('2026-11-22');
  });
});

describe('fromDateOnly / toDateOnly edge cases', () => {
  it('rejects blanks and impossible dates', () => {
    expect(fromDateOnly('')).toBeNull();
    expect(fromDateOnly(null)).toBeNull();
    expect(fromDateOnly(undefined)).toBeNull();
    expect(fromDateOnly('2026-02-30')).toBeNull();
    expect(fromDateOnly('22/11/2026')).toBeNull();
    expect(toDateOnly(null)).toBeNull();
    expect(toDateOnly(new Date('nope'))).toBeNull();
  });

  it('keeps the written date of a full ISO timestamp', () => {
    const d = fromDateOnly('2026-11-22T23:59:59Z') as Date;
    expect(toDateOnly(d)).toBe('2026-11-22');
  });

  it('handles years below 100 without the 19xx shift', () => {
    expect(toDateOnly(fromDateOnly('0042-06-15'))).toBe('0042-06-15');
  });
});

describe('zod helpers', () => {
  const schema = z.object({
    title: requiredText('Give the permit a title', 120),
    notes: optionalText(500),
    validFrom: dateOnly(),
    reviewOn: optionalDateOnly(),
    persons: positiveInt(),
    spare: optionalPositiveInt(),
  });

  it('parses a filled-in form', () => {
    expect(
      schema.parse({
        title: '  Hot work, engine room  ',
        notes: '   ',
        validFrom: '2026-11-22',
        reviewOn: '',
        persons: '3',
        spare: '',
      }),
    ).toEqual({ title: 'Hot work, engine room', notes: null, validFrom: '2026-11-22', reviewOn: null, persons: 3, spare: null });
  });

  it('requiredText rejects blank with the given message', () => {
    const r = schema.shape.title.safeParse('   ');
    expect(r.success).toBe(false);
    expect(r.success ? '' : r.error.issues[0].message).toBe('Give the permit a title');
    expect(requiredText().safeParse(undefined).success).toBe(false);
    expect(requiredText().safeParse(null).success).toBe(false);
  });

  it('text length limits', () => {
    expect(optionalText(3).safeParse('abcd').success).toBe(false);
    expect(optionalText(3).parse(' abc ')).toBe('abc');
    expect(requiredText('Required', 3).safeParse('abcd').success).toBe(false);
  });

  it('optionalText maps undefined and null to null', () => {
    expect(optionalText().parse(undefined)).toBeNull();
    expect(optionalText().parse(null)).toBeNull();
  });

  it('dateOnly rejects blanks and impossible dates', () => {
    expect(dateOnly().safeParse('').success).toBe(false);
    expect(dateOnly().safeParse(undefined).success).toBe(false);
    expect(dateOnly().safeParse('2026-02-30').success).toBe(false);
    expect(dateOnly().safeParse(new Date('nope')).success).toBe(false);
    expect(dateOnly().parse(' 2026-11-22 ')).toBe('2026-11-22');
  });

  it('optionalDateOnly accepts blank, Date and string', () => {
    expect(optionalDateOnly().parse(undefined)).toBeNull();
    expect(optionalDateOnly().parse(null)).toBeNull();
    expect(optionalDateOnly().parse('2026-01-31')).toBe('2026-01-31');
    expect(optionalDateOnly().parse(new Date(2026, 0, 31))).toBe('2026-01-31');
    expect(optionalDateOnly().safeParse('2026-01-32').success).toBe(false);
  });

  it.each([
    ['1', 1],
    [' 12 ', 12],
    [7, 7],
  ])('positiveInt accepts %j', (input, expected) => {
    expect(positiveInt().parse(input)).toBe(expected);
  });

  it.each(['', '0', '-2', '1.5', 'abc', '1e3', 0, -1, 2.5, null, undefined])('positiveInt rejects %j', (input) => {
    expect(positiveInt().safeParse(input).success).toBe(false);
  });

  it('positiveInt reports a required message for blanks', () => {
    const r = positiveInt('How many people?').safeParse('');
    expect(r.success ? '' : r.error.issues[0].message).toBe('How many people?');
  });

  it('optionalPositiveInt', () => {
    expect(optionalPositiveInt().parse('')).toBeNull();
    expect(optionalPositiveInt().parse(undefined)).toBeNull();
    expect(optionalPositiveInt().parse('4')).toBe(4);
    expect(optionalPositiveInt().safeParse('0').success).toBe(false);
  });

  it('NaN (valueAsNumber on an empty input) is blank', () => {
    expect(optionalPositiveInt().parse(Number.NaN)).toBeNull();
    const r = positiveInt('How many people?').safeParse(Number.NaN);
    expect(r.success ? '' : r.error.issues[0].message).toBe('How many people?');
  });

  const firstIssue = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? 'ok' : r.error?.issues[0].message);

  it('values above the column ceiling are refused (default int4)', () => {
    expect(INT4_MAX).toBe(2147483647);
    expect(positiveInt().parse(2147483647)).toBe(2147483647);
    expect(firstIssue(positiveInt().safeParse(2147483648))).toBe('Must be 2147483647 or less');
    expect(firstIssue(positiveInt().safeParse(1e21))).toBe('Must be 2147483647 or less');
    expect(firstIssue(optionalPositiveInt().safeParse('2147483648'))).toBe('Must be 2147483647 or less');
  });

  it('a digit string too long to hold exactly is refused, even with a raised ceiling', () => {
    expect(firstIssue(positiveInt().safeParse('99999999999999999999'))).toBe('Must be 2147483647 or less');
    const big = positiveInt(undefined, Number.MAX_SAFE_INTEGER);
    expect(big.parse('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
    expect(firstIssue(big.safeParse('9007199254740993'))).toBe(`Must be ${Number.MAX_SAFE_INTEGER} or less`);
    // A ceiling above the safe range is clamped to it.
    expect(firstIssue(optionalPositiveInt(1e30).safeParse('99999999999999999999'))).toBe(`Must be ${Number.MAX_SAFE_INTEGER} or less`);
    expect(optionalPositiveInt(10).safeParse(11).success).toBe(false);
  });
});

describe('date-only helpers are the records date primitive', () => {
  it('isDateOnly is isCalendarDate; toDateOnly is toCalendarDate without the throw', () => {
    expect(isDateOnly).toBe(isCalendarDate);
    const d = new Date(2026, 10, 22, 23, 59);
    expect(toDateOnly(d)).toBe(toCalendarDate(d));
    expect(toDateOnly(new Date(Number.NaN))).toBeNull();
  });
});
