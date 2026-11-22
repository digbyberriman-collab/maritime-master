/**
 * Pure logic behind `DataTable` and `MatrixGrid` (gap/10 DS14, DS15, §A.10):
 * comparing, sorting, searching, count-chip filters, selection, staged
 * matrix edits and column-group spans. No React, so it is unit-tested
 * directly and shared by both components.
 */
import type { Density } from '@/components/ui/theme-config';

export type SortDirection = 'asc' | 'desc';

export interface TableSort {
  columnId: string;
  direction: SortDirection;
}

/** Anything a column can expose for sorting, searching and the default cell. */
export type CellValue = string | number | boolean | Date | null | undefined;

/** Rows above this count render through the virtualiser instead of all at once. */
export const VIRTUALIZE_THRESHOLD = 200;

/** Row heights per density, mirroring `--row-h` in index.css (A.7). */
export const ROW_HEIGHT: Readonly<Record<Density, number>> = {
  comfortable: 44,
  default: 40,
  compact: 32,
};

const collator = new Intl.Collator('en-GB', { numeric: true, sensitivity: 'base' });

/** `null`, `undefined`, `''`, `NaN` and invalid dates count as empty. */
export function isEmptyValue(value: CellValue): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'number') return Number.isNaN(value);
  if (value instanceof Date) return Number.isNaN(value.getTime());
  return false;
}

/**
 * Ascending comparison of two cell values. Numbers compare numerically,
 * dates by time, text with a natural, case-insensitive collation
 * ("Item 2" before "Item 10"). Empty values are not ordered here: the
 * sorters keep them last in both directions.
 */
export function compareValues(a: CellValue, b: CellValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return collator.compare(String(a), String(b));
}

export interface SortableColumn<T> {
  id: string;
  value?: (row: T) => CellValue;
  compare?: (a: T, b: T) => number;
}

/**
 * Stable sort by one column. Rows with an empty value go last whichever way
 * the sort runs, so "most findings first" never starts with blanks.
 */
export function sortRows<T>(rows: readonly T[], column: SortableColumn<T> | undefined, direction: SortDirection): T[] {
  const indexed = rows.map((row, index) => ({ row, index }));
  if (!column || (!column.compare && !column.value)) return rows.slice();
  const sign = direction === 'asc' ? 1 : -1;
  indexed.sort((x, y) => {
    let result: number;
    if (column.compare) {
      result = column.compare(x.row, y.row) * sign;
    } else {
      const av = column.value!(x.row);
      const bv = column.value!(y.row);
      const ae = isEmptyValue(av);
      const be = isEmptyValue(bv);
      if (ae && be) result = 0;
      else if (ae) result = 1;
      else if (be) result = -1;
      else result = compareValues(av, bv) * sign;
    }
    return result !== 0 ? result : x.index - y.index;
  });
  return indexed.map((entry) => entry.row);
}

/**
 * The next sort after clicking a header: a new column starts ascending
 * (or descending when `descFirst`), the same column flips direction.
 */
export function nextSort(current: TableSort | null | undefined, columnId: string, descFirst = false): TableSort {
  if (current && current.columnId === columnId) {
    return { columnId, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { columnId, direction: descFirst ? 'desc' : 'asc' };
}

/** `aria-sort` for a header. */
export function ariaSort(sort: TableSort | null | undefined, columnId: string): 'ascending' | 'descending' | 'none' {
  if (!sort || sort.columnId !== columnId) return 'none';
  return sort.direction === 'asc' ? 'ascending' : 'descending';
}

/** Plain text of a value, for search and summaries. */
export function valueText(value: CellValue): string {
  if (isEmptyValue(value)) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/** Lower-cased, trimmed query; whitespace-separated terms must all match. */
export function matchesSearch(haystack: string, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = haystack.toLowerCase();
  return terms.every((term) => text.includes(term));
}

export function searchRows<T>(rows: readonly T[], query: string, text: (row: T) => string): T[] {
  if (!query.trim()) return rows.slice();
  return rows.filter((row) => matchesSearch(text(row), query));
}

/** A count chip: "Waiting on crew 5". */
export interface ChipFilter<T> {
  id: string;
  label: string;
  predicate: (row: T) => boolean;
}

export const ALL_CHIP_ID = '__all__';

export interface ChipCount {
  id: string;
  label: string;
  count: number;
}

/** Live counts for the "All" chip and each filter chip, over the rows the search leaves. */
export function chipCounts<T>(rows: readonly T[], filters: ReadonlyArray<ChipFilter<T>>, allLabel = 'All'): ChipCount[] {
  return [
    { id: ALL_CHIP_ID, label: allLabel, count: rows.length },
    ...filters.map((f) => ({ id: f.id, label: f.label, count: rows.filter(f.predicate).length })),
  ];
}

export function applyChip<T>(rows: readonly T[], filters: ReadonlyArray<ChipFilter<T>>, activeId: string | null | undefined): T[] {
  if (!activeId || activeId === ALL_CHIP_ID) return rows.slice();
  const filter = filters.find((f) => f.id === activeId);
  return filter ? rows.filter(filter.predicate) : rows.slice();
}

/** Header checkbox state for the visible rows. */
export function selectionState(visibleIds: readonly string[], selected: ReadonlySet<string>): boolean | 'indeterminate' {
  if (visibleIds.length === 0) return false;
  const count = visibleIds.filter((id) => selected.has(id)).length;
  if (count === 0) return false;
  return count === visibleIds.length ? true : 'indeterminate';
}

/** Select or clear every visible row, keeping selections that are filtered out of view. */
export function toggleAllVisible(visibleIds: readonly string[], selected: ReadonlySet<string>): Set<string> {
  const next = new Set(selected);
  const allSelected = selectionState(visibleIds, selected) === true;
  for (const id of visibleIds) {
    if (allSelected) next.delete(id);
    else next.add(id);
  }
  return next;
}

export function toggleOne(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** "1 vessel" / "9 vessels". */
export function pluralise(count: number, noun: { one: string; other: string }): string {
  return `${count.toLocaleString('en-GB')} ${count === 1 ? noun.one : noun.other}`;
}

/** Footer line: "Showing 9 of 94 courses". */
export function showingSummary(shown: number, total: number, noun: { one: string; other: string }): string {
  return `Showing ${shown.toLocaleString('en-GB')} of ${pluralise(total, noun)}`;
}

export function pageCount(rows: number, pageSize: number): number {
  return Math.max(1, Math.ceil(rows / Math.max(1, pageSize)));
}

// ---------------------------------------------------------------------------
// MatrixGrid: column groups and staged edits ("Review & save", §7.12)
// ---------------------------------------------------------------------------

export interface GroupSpan {
  /** `null` for a run of ungrouped columns. */
  groupId: string | null;
  span: number;
}

/** Consecutive columns with the same group collapse into one header cell. */
export function groupSpans(columns: ReadonlyArray<{ group?: string | null }>): GroupSpan[] {
  const spans: GroupSpan[] = [];
  for (const column of columns) {
    const groupId = column.group ?? null;
    const last = spans[spans.length - 1];
    if (last && last.groupId === groupId) last.span += 1;
    else spans.push({ groupId, span: 1 });
  }
  return spans;
}

export interface MatrixChange<V> {
  rowId: string;
  columnId: string;
  from: V;
  to: V;
}

export type StagedEdits<V> = ReadonlyMap<string, MatrixChange<V>>;

export const cellKey = (rowId: string, columnId: string) => `${rowId}\u0000${columnId}`;

/**
 * Stage `to` for a cell whose saved value is `from`. Setting a cell back to
 * its saved value un-stages it, so the footer count is always the real diff.
 */
export function stageEdit<V>(
  edits: StagedEdits<V>,
  change: MatrixChange<V>,
  isEqual: (a: V, b: V) => boolean = Object.is,
): Map<string, MatrixChange<V>> {
  const next = new Map(edits);
  const key = cellKey(change.rowId, change.columnId);
  if (isEqual(change.from, change.to)) next.delete(key);
  else next.set(key, change);
  return next;
}

/** The value a cell shows: the staged one when there is one. */
export function stagedValue<V>(edits: StagedEdits<V>, rowId: string, columnId: string, saved: V): V {
  const staged = edits.get(cellKey(rowId, columnId));
  return staged ? staged.to : saved;
}
