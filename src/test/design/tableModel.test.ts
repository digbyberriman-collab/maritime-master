/**
 * Pure logic behind DataTable and MatrixGrid (BUILD-PLAN A8; gap/10 §A.10):
 * ordering, search, count chips, selection, column groups, staged edits.
 */
import { describe, expect, it } from 'vitest';
import {
  ALL_CHIP_ID,
  applyChip,
  ariaSort,
  cellKey,
  chipCounts,
  compareValues,
  groupSpans,
  isEmptyValue,
  matchesSearch,
  nextSort,
  pageCount,
  pluralise,
  selectionState,
  showingSummary,
  sortRows,
  stagedValue,
  stageEdit,
  toggleAllVisible,
  toggleOne,
  valueText,
  type MatrixChange,
} from '@/shared/components/data/tableModel';

type Row = { id: string; name: string; due: string | null; findings: number | null };
const rows: Row[] = [
  { id: 'a', name: 'Item 10', due: '2026-03-01', findings: 2 },
  { id: 'b', name: 'item 2', due: null, findings: 9 },
  { id: 'c', name: 'Item 1', due: '2025-12-31', findings: null },
  { id: 'd', name: 'Alpha', due: '2026-03-01', findings: 2 },
];

describe('compareValues and emptiness', () => {
  it('compares numbers numerically, dates by time and text naturally, ignoring case', () => {
    expect(compareValues(2, 10)).toBeLessThan(0);
    expect(compareValues(new Date('2026-01-02'), new Date('2026-01-01'))).toBeGreaterThan(0);
    expect(compareValues('Item 2', 'item 10')).toBeLessThan(0);
    expect(compareValues('alpha', 'ALPHA')).toBe(0);
  });

  it('treats null, undefined, blank text, NaN and invalid dates as empty', () => {
    for (const v of [null, undefined, '', '   ', Number.NaN, new Date('nope')]) expect(isEmptyValue(v)).toBe(true);
    for (const v of [0, false, 'x', new Date('2026-01-01')]) expect(isEmptyValue(v)).toBe(false);
  });

  it('turns values into searchable text', () => {
    expect(valueText(new Date('2026-05-04T10:00:00Z'))).toBe('2026-05-04');
    expect(valueText(null)).toBe('');
    expect(valueText(12)).toBe('12');
  });
});

describe('sortRows', () => {
  const byName = { id: 'name', value: (r: Row) => r.name };
  const byFindings = { id: 'findings', value: (r: Row) => r.findings };
  const byDue = { id: 'due', value: (r: Row) => r.due };

  it('sorts text naturally in both directions', () => {
    expect(sortRows(rows, byName, 'asc').map((r) => r.id)).toEqual(['d', 'c', 'b', 'a']);
    expect(sortRows(rows, byName, 'desc').map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps empty values last whichever way it sorts', () => {
    expect(sortRows(rows, byFindings, 'desc').map((r) => r.id)).toEqual(['b', 'a', 'd', 'c']);
    expect(sortRows(rows, byFindings, 'asc').map((r) => r.id)).toEqual(['a', 'd', 'b', 'c']);
    expect(sortRows(rows, byDue, 'asc').at(-1)?.id).toBe('b');
    expect(sortRows(rows, byDue, 'desc').at(-1)?.id).toBe('b');
  });

  it('is stable for ties and never mutates the input', () => {
    const copy = rows.slice();
    expect(sortRows(rows, byDue, 'desc').map((r) => r.id)).toEqual(['a', 'd', 'c', 'b']);
    expect(rows).toEqual(copy);
  });

  it('uses a custom comparator when given', () => {
    const custom = { id: 'x', compare: (a: Row, b: Row) => b.id.localeCompare(a.id) };
    expect(sortRows(rows, custom, 'asc').map((r) => r.id)).toEqual(['d', 'c', 'b', 'a']);
    expect(sortRows(rows, custom, 'desc').map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns a copy when the column cannot sort', () => {
    expect(sortRows(rows, undefined, 'asc')).toEqual(rows);
    expect(sortRows(rows, { id: 'none' }, 'asc')).toEqual(rows);
  });
});

describe('sort cycling and aria-sort', () => {
  it('starts a new column ascending (or descending when asked) and flips the same column', () => {
    expect(nextSort(null, 'name')).toEqual({ columnId: 'name', direction: 'asc' });
    expect(nextSort(null, 'due', true)).toEqual({ columnId: 'due', direction: 'desc' });
    expect(nextSort({ columnId: 'name', direction: 'asc' }, 'name')).toEqual({ columnId: 'name', direction: 'desc' });
    expect(nextSort({ columnId: 'name', direction: 'desc' }, 'name')).toEqual({ columnId: 'name', direction: 'asc' });
    expect(nextSort({ columnId: 'name', direction: 'desc' }, 'due')).toEqual({ columnId: 'due', direction: 'asc' });
  });

  it('reports aria-sort per header', () => {
    const sort = { columnId: 'name', direction: 'desc' as const };
    expect(ariaSort(sort, 'name')).toBe('descending');
    expect(ariaSort(sort, 'due')).toBe('none');
    expect(ariaSort(null, 'name')).toBe('none');
  });
});

describe('search and count chips', () => {
  it('matches every term, in any order, ignoring case', () => {
    expect(matchesSearch('Chief Engineer MY Draak', 'draak chief')).toBe(true);
    expect(matchesSearch('Chief Engineer MY Draak', 'draak bosun')).toBe(false);
    expect(matchesSearch('anything', '   ')).toBe(true);
  });

  const filters = [
    { id: 'many', label: 'Many findings', predicate: (r: Row) => (r.findings ?? 0) > 5 },
    { id: 'undated', label: 'No due date', predicate: (r: Row) => r.due === null },
  ];

  it('counts All first, then each chip, over the rows given', () => {
    expect(chipCounts(rows, filters)).toEqual([
      { id: ALL_CHIP_ID, label: 'All', count: 4 },
      { id: 'many', label: 'Many findings', count: 1 },
      { id: 'undated', label: 'No due date', count: 1 },
    ]);
    expect(chipCounts([], filters, 'Everything')[0]).toEqual({ id: ALL_CHIP_ID, label: 'Everything', count: 0 });
  });

  it('applies the active chip; All or an unknown id shows everything', () => {
    expect(applyChip(rows, filters, 'many').map((r) => r.id)).toEqual(['b']);
    expect(applyChip(rows, filters, ALL_CHIP_ID)).toHaveLength(4);
    expect(applyChip(rows, filters, 'gone')).toHaveLength(4);
    expect(applyChip(rows, filters, null)).toHaveLength(4);
  });
});

describe('selection', () => {
  it('reports the header checkbox state for the visible rows', () => {
    expect(selectionState([], new Set(['a']))).toBe(false);
    expect(selectionState(['a', 'b'], new Set())).toBe(false);
    expect(selectionState(['a', 'b'], new Set(['a']))).toBe('indeterminate');
    expect(selectionState(['a', 'b'], new Set(['a', 'b', 'z']))).toBe(true);
  });

  it('selects all visible, then clears only the visible, keeping hidden selections', () => {
    const all = toggleAllVisible(['a', 'b'], new Set(['z']));
    expect([...all].sort()).toEqual(['a', 'b', 'z']);
    expect([...toggleAllVisible(['a', 'b'], all)]).toEqual(['z']);
  });

  it('toggles one row', () => {
    expect([...toggleOne(new Set(['a']), 'b')].sort()).toEqual(['a', 'b']);
    expect([...toggleOne(new Set(['a']), 'a')]).toEqual([]);
  });
});

describe('copy helpers', () => {
  it('pluralises and builds the footer summary', () => {
    const noun = { one: 'vessel', other: 'vessels' };
    expect(pluralise(1, noun)).toBe('1 vessel');
    expect(pluralise(1200, noun)).toBe('1,200 vessels');
    expect(showingSummary(9, 9, noun)).toBe('Showing 9 of 9 vessels');
    expect(showingSummary(0, 1, noun)).toBe('Showing 0 of 1 vessel');
  });

  it('counts pages, never fewer than one', () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
    expect(pageCount(50, 25)).toBe(2);
  });
});

describe('matrix column groups', () => {
  it('collapses consecutive columns of one group and keeps ungrouped runs', () => {
    expect(
      groupSpans([{ group: 'stcw' }, { group: 'stcw' }, {}, { group: null }, { group: 'flag' }, { group: 'stcw' }]),
    ).toEqual([
      { groupId: 'stcw', span: 2 },
      { groupId: null, span: 2 },
      { groupId: 'flag', span: 1 },
      { groupId: 'stcw', span: 1 },
    ]);
    expect(groupSpans([])).toEqual([]);
  });
});

describe('staged matrix edits', () => {
  const change = (to: boolean): MatrixChange<boolean> => ({ rowId: 'r1', columnId: 'c1', from: false, to });

  it('stages a change and shows the staged value', () => {
    const edits = stageEdit(new Map(), change(true));
    expect(edits.size).toBe(1);
    expect(edits.get(cellKey('r1', 'c1'))).toEqual(change(true));
    expect(stagedValue(edits, 'r1', 'c1', false)).toBe(true);
    expect(stagedValue(edits, 'r1', 'c2', false)).toBe(false);
  });

  it('un-stages a cell set back to its saved value, so the count is the real diff', () => {
    const staged = stageEdit(new Map(), change(true));
    expect(stageEdit(staged, change(false)).size).toBe(0);
  });

  it('accepts a custom equality for object values', () => {
    const eq = (a: { v: number }, b: { v: number }) => a.v === b.v;
    const edits = stageEdit(new Map(), { rowId: 'r', columnId: 'c', from: { v: 1 }, to: { v: 1 } }, eq);
    expect(edits.size).toBe(0);
  });

  it('keeps row and column ids apart in the key', () => {
    expect(cellKey('a', 'bc')).not.toBe(cellKey('ab', 'c'));
  });
});
