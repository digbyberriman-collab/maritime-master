import { describe, expect, it } from 'vitest';
import {
  MANNING_BANDS,
  ManningShapeError,
  bandSpans,
  manningBand,
  manningGapLabel,
  manningTotals,
  parseManningRows,
  shortBy,
  type ManningBand,
  type ManningDayRow,
} from '@/modules/rotation-planner/lib/manning';
import { addDays } from '@/modules/rotation-planner/lib/duration';

const N = [0, 1, 2, 3, 4];
const MAXES: Array<number | null> = [null, 0, 1, 2, 3, 4];

const row = (over: Partial<ManningDayRow> & Pick<ManningDayRow, 'day'>): ManningDayRow => ({
  positionId: 'pos-deck',
  positionKey: 'deckhand',
  positionName: 'Deckhand',
  departmentKey: 'deck',
  sortOrder: 50,
  aboard: 2,
  qualified: 2,
  min: 2,
  max: 3,
  shortBy: 0,
  band: 'at_minimum',
  ...over,
});

/** A row as vessel_manning_by_day answers it (snake case). */
const rpc = (r: ManningDayRow) => ({
  day: r.day,
  position_id: r.positionId,
  position_key: r.positionKey,
  position_name: r.positionName,
  department_key: r.departmentKey,
  sort_order: r.sortOrder,
  aboard: r.aboard,
  qualified: r.qualified,
  min_on_board: r.min,
  max_on_board: r.max,
  short_by: r.shortBy,
  band: r.band,
});

describe('manningBand (mirror of planner_manning_band)', () => {
  it('lists the four bands', () => {
    expect(MANNING_BANDS).toEqual(['critical', 'at_minimum', 'normal', 'overmanned']);
  });

  it('follows the precedence over every combination up to 4 (critical > at minimum > overmanned > normal)', () => {
    let cases = 0;
    for (const aboard of N) {
      for (const qualified of N) {
        for (const min of N) {
          for (const max of MAXES) {
            const got = manningBand(aboard, qualified, min, max);
            const critical = min > 0 && qualified < min;
            const atMin = min > 0 && qualified === min;
            const over = max !== null && aboard > max;
            const want: ManningBand = critical ? 'critical' : atMin ? 'at_minimum' : over ? 'overmanned' : 'normal';
            expect(got, `${aboard}/${qualified}/${min}/${max}`).toBe(want);
            cases++;
          }
        }
      }
    }
    expect(cases).toBe(5 * 5 * 5 * 6);
  });

  it.each<[number, number, number, number | null, ManningBand]>([
    [0, 0, 1, null, 'critical'],
    [2, 1, 2, 2, 'critical'],
    [3, 1, 2, 2, 'critical'],
    [2, 2, 2, 2, 'at_minimum'],
    [3, 2, 2, 2, 'at_minimum'],
    [3, 3, 2, 2, 'overmanned'],
    [1, 1, 0, 0, 'overmanned'],
    [0, 0, 0, 0, 'normal'],
    [0, 0, 0, null, 'normal'],
    [5, 5, 2, null, 'normal'],
    [2, 2, 1, 3, 'normal'],
  ])('aboard %i, qualified %i, min %i, max %s -> %s', (a, q, mn, mx, band) => expect(manningBand(a, q, mn, mx)).toBe(band));

  it('a minimum of zero is never critical or at minimum', () => {
    for (const a of N) for (const q of N) for (const mx of MAXES) expect(['normal', 'overmanned']).toContain(manningBand(a, q, 0, mx));
  });

  it('shortBy is the minimum less the qualified, never below zero', () => {
    for (const q of N) for (const mn of N) expect(shortBy(q, mn)).toBe(Math.max(mn - q, 0));
    expect(shortBy(0, 3)).toBe(3);
    expect(shortBy(5, 3)).toBe(0);
  });
});

describe('parseManningRows', () => {
  const good = [row({ day: '2026-11-27' }), row({ day: '2026-11-27', positionId: null, positionKey: null, positionName: null, departmentKey: null, sortOrder: null, max: null, min: 0, band: 'normal' })];

  it('reads the RPC rows into camel case', () => {
    expect(parseManningRows(good.map(rpc))).toEqual(good);
    expect(parseManningRows([])).toEqual([]);
  });

  it('accepts a missing optional (undefined) as null', () => {
    const r = { ...rpc(good[0]), max_on_board: undefined, sort_order: undefined, position_id: undefined };
    const [p] = parseManningRows([r]);
    expect(p.max).toBeNull();
    expect(p.sortOrder).toBeNull();
    expect(p.positionId).toBeNull();
  });

  const base = rpc(good[0]);
  it.each([
    ['not an array', 'x'],
    ['a null row', [null]],
    ['no day', [{ ...base, day: null }]],
    ['a timestamp day', [{ ...base, day: '2026-11-27T00:00:00Z' }]],
    ['an unknown band', [{ ...base, band: 'red' }]],
    ['a negative count', [{ ...base, aboard: -1 }]],
    ['a fractional count', [{ ...base, qualified: 1.5 }]],
    ['a text count', [{ ...base, min_on_board: '2' }]],
    ['a text maximum', [{ ...base, max_on_board: 'two' }]],
    ['a missing short_by', [{ ...base, short_by: undefined }]],
    ['a text sort order', [{ ...base, sort_order: 'first' }]],
    ['a numeric position name', [{ ...base, position_name: 7 }]],
  ])('refuses %s', (_w, input) => expect(() => parseManningRows(input)).toThrow(ManningShapeError));
});

describe('manningTotals', () => {
  it('sums per day, keeps the worst band and counts the critical positions, days ascending', () => {
    const rows = [
      row({ day: '2026-11-28', aboard: 1, qualified: 1, min: 2, max: 2, shortBy: 1, band: 'critical' }),
      row({ day: '2026-11-27' }),
      row({ day: '2026-11-27', positionId: 'pos-master', positionName: 'Master', aboard: 1, qualified: 1, min: 1, max: 1, band: 'at_minimum' }),
      row({ day: '2026-11-28', positionId: 'pos-cook', positionName: 'Cook', aboard: 3, qualified: 3, min: 0, max: 2, band: 'overmanned' }),
    ];
    expect(manningTotals(rows)).toEqual([
      { day: '2026-11-27', aboard: 3, qualified: 3, min: 3, max: 4, band: 'at_minimum', criticalPositions: 0 },
      { day: '2026-11-28', aboard: 4, qualified: 4, min: 2, max: 4, band: 'critical', criticalPositions: 1 },
    ]);
  });

  it('orders bands critical, at minimum, overmanned, normal', () => {
    const day = '2026-11-27';
    const pairs: Array<[ManningBand, ManningBand, ManningBand]> = [
      ['normal', 'overmanned', 'overmanned'],
      ['overmanned', 'at_minimum', 'at_minimum'],
      ['at_minimum', 'critical', 'critical'],
      ['normal', 'normal', 'normal'],
      ['critical', 'normal', 'critical'],
    ];
    for (const [a, b, want] of pairs) {
      const [t] = manningTotals([row({ day, band: a }), row({ day, positionId: 'x', band: b })]);
      expect(t.band).toBe(want);
    }
  });

  it('has no total maximum when a staffed or required position has none; positions with nobody and no minimum do not count', () => {
    const day = '2026-11-27';
    expect(manningTotals([row({ day, max: 3 }), row({ day, positionId: 'x', aboard: 1, min: 0, max: null, band: 'normal' })])[0].max).toBeNull();
    expect(manningTotals([row({ day, max: 3 }), row({ day, positionId: 'x', aboard: 0, qualified: 0, min: 0, max: null, band: 'normal' })])[0].max).toBe(3);
  });

  it('answers nothing for no rows', () => {
    expect(manningTotals([])).toEqual([]);
  });
});

describe('bandSpans and manningGapLabel', () => {
  const critical = (day: string, over: Partial<ManningDayRow> = {}) => row({ day, aboard: 1, qualified: 1, min: 2, shortBy: 1, band: 'critical', ...over });

  it('joins consecutive critical days of a position, keeping the worst shortfall', () => {
    const rows = [critical('2026-11-27'), critical('2026-11-28', { qualified: 0, shortBy: 2 }), critical('2026-11-29'), row({ day: '2026-11-30' })];
    expect(bandSpans(rows)).toEqual([
      { positionId: 'pos-deck', positionName: 'Deckhand', departmentKey: 'deck', band: 'critical', start: '2026-11-27', end: '2026-11-29', days: 3, min: 2, worstShortBy: 2 },
    ]);
  });

  it('breaks a span at a day in another band or a day missing from the rows', () => {
    const rows = [critical('2026-11-27'), row({ day: '2026-11-28' }), critical('2026-11-29'), critical('2026-12-01')];
    expect(bandSpans(rows).map((s) => [s.start, s.end, s.days])).toEqual([
      ['2026-11-27', '2026-11-27', 1],
      ['2026-11-29', '2026-11-29', 1],
      ['2026-12-01', '2026-12-01', 1],
    ]);
  });

  it('reads rows in any order, per position, ordered by start then rank order then name', () => {
    const master = (day: string) => critical(day, { positionId: 'pos-master', positionKey: 'master', positionName: 'Master', sortOrder: 1, min: 1, qualified: 0, shortBy: 1 });
    const unmatched = (day: string) => critical(day, { positionId: null, positionKey: null, positionName: null, sortOrder: null, min: 1, qualified: 0, shortBy: 1 });
    const rows = [critical('2026-11-28'), unmatched('2026-11-27'), master('2026-11-28'), critical('2026-11-27'), master('2026-11-27')];
    expect(bandSpans(rows).map((s) => [s.positionName, s.start, s.end])).toEqual([
      ['Master', '2026-11-27', '2026-11-28'],
      ['Deckhand', '2026-11-27', '2026-11-28'],
      [null, '2026-11-27', '2026-11-27'],
    ]);
  });

  it('finds spans of any band, and none in an empty list', () => {
    const rows = [row({ day: '2026-11-27', band: 'overmanned' }), row({ day: '2026-11-28', band: 'overmanned' })];
    expect(bandSpans(rows, 'overmanned')).toHaveLength(1);
    expect(bandSpans(rows)).toEqual([]);
    expect(bandSpans([])).toEqual([]);
  });

  it('a 60-day window of one position stays one span', () => {
    const rows = Array.from({ length: 60 }, (_, i) => critical(addDays('2026-11-01', i)));
    const [s] = bandSpans(rows);
    expect([s.start, s.end, s.days]).toEqual(['2026-11-01', '2026-12-30', 60]);
  });

  it('labels a gap with the position, its minimum and the shortfall', () => {
    expect(manningGapLabel({ positionName: 'Master', min: 1, worstShortBy: 1 })).toBe('Master needs 1 on board, short by 1');
    expect(manningGapLabel({ positionName: null, min: 2, worstShortBy: 2 })).toBe('Unmatched titles needs 2 on board, short by 2');
  });
});
