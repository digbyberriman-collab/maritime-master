/**
 * Rest still needed today (lib/restNeeded.ts; gap/04 C37, W6): the larger of
 * the 24 h shortfall (today's calendar day) and the 7-day shortfall (today
 * and the six days before), each only when its days are entered.
 */
import { describe, expect, it } from 'vitest';
import { restMinutesOf, restNeeded } from '@/modules/work-rest/lib/restNeeded';
import { DEFAULT_RULE_SET, type DailyRecord } from '@/modules/work-rest/types';

const H = (h: number) => Math.round(h * 60);
const rec = (date: string, work: Array<[number, number]>): Pick<DailyRecord, 'record_date' | 'blocks'> => ({
  record_date: date,
  blocks: work.map(([s, e]) => ({ block_type: 'work' as const, start_minute: H(s), end_minute: H(e) })),
});
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const TODAY = '2026-11-20';
const week = (work: Array<[number, number]>, todayWork: Array<[number, number]> = work) =>
  Array.from({ length: 7 }, (_, i) => rec(addDays(TODAY, -i), i === 0 ? todayWork : work));

describe('rest minutes of a day', () => {
  it('is 1440 minus the union of the work blocks; rest blocks do not count', () => {
    expect(restMinutesOf(rec(TODAY, []))).toBe(1440);
    expect(restMinutesOf(rec(TODAY, [[8, 18]]))).toBe(840);
    expect(restMinutesOf(rec(TODAY, [[0, 5], [4, 10]]))).toBe(840);
    expect(
      restMinutesOf({ record_date: TODAY, blocks: [{ block_type: 'rest', start_minute: 0, end_minute: 600 }, { block_type: 'work', start_minute: 600, end_minute: 660 }] }),
    ).toBe(1380);
    expect(restMinutesOf({ record_date: TODAY, blocks: [{ block_type: 'work', start_minute: -60, end_minute: 1500 }] })).toBe(0);
  });
});

describe('rest still needed today', () => {
  it('nothing entered: nothing is known', () => {
    expect(restNeeded([], TODAY)).toEqual({ shortfall24hMinutes: null, shortfall7dMinutes: null, neededMinutes: null, basis: 'none' });
  });

  it('today entered with enough rest: nothing needed (the 7 days not all entered)', () => {
    expect(restNeeded([rec(TODAY, [[8, 18]])], TODAY)).toEqual({ shortfall24hMinutes: 0, shortfall7dMinutes: null, neededMinutes: 0, basis: 'none' });
  });

  it('today short of 10 h: the 24 h shortfall decides', () => {
    expect(restNeeded([rec(TODAY, [[6, 22]])], TODAY)).toEqual({ shortfall24hMinutes: 120, shortfall7dMinutes: null, neededMinutes: 120, basis: '24h' });
  });

  it('a week of 10 h rest leaves 7 h short of 77 h: the 7-day shortfall decides', () => {
    const r = restNeeded(week([[0, 14]]), TODAY);
    expect(r).toEqual({ shortfall24hMinutes: 0, shortfall7dMinutes: 7 * 60, neededMinutes: 7 * 60, basis: '7d' });
  });

  it('both short: the larger wins', () => {
    const r = restNeeded(week([[0, 12]], [[0, 20]]), TODAY);
    // Today 4 h rest (6 h short); the week 6 x 12 h + 4 h = 76 h (1 h short).
    expect(r).toEqual({ shortfall24hMinutes: 360, shortfall7dMinutes: 60, neededMinutes: 360, basis: '24h' });
  });

  it('a missing day in the week leaves the 7-day figure unknown', () => {
    const records = week([[0, 14]]).filter((r) => r.record_date !== addDays(TODAY, -3));
    expect(restNeeded(records, TODAY).shortfall7dMinutes).toBeNull();
  });

  it('days after today are not counted', () => {
    const records = [...week([[0, 14]]), rec(addDays(TODAY, 1), [])];
    expect(restNeeded(records, TODAY).shortfall7dMinutes).toBe(7 * 60);
  });

  it('follows the rule set and rounds a fractional minimum up to whole minutes', () => {
    expect(restNeeded([rec(TODAY, [[8, 18]])], TODAY, { ...DEFAULT_RULE_SET, min_rest_per_24h: 14.01 }).shortfall24hMinutes).toBe(1);
    expect(restNeeded([rec(TODAY, [[8, 18]])], TODAY, { ...DEFAULT_RULE_SET, min_rest_per_24h: 16 }).neededMinutes).toBe(120);
  });

  it('the first record of a date wins', () => {
    expect(restNeeded([rec(TODAY, [[6, 22]]), rec(TODAY, [])], TODAY).shortfall24hMinutes).toBe(120);
  });
});
