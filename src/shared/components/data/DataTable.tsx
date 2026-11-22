import * as React from 'react';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { Density } from '@/components/ui/theme-config';
import { EmptyState, PageError } from '@/shared/components/states';
import {
  ALL_CHIP_ID,
  applyChip,
  ariaSort,
  chipCounts,
  isEmptyValue,
  nextSort,
  pageCount,
  searchRows,
  selectionState,
  showingSummary,
  sortRows,
  toggleAllVisible,
  toggleOne,
  valueText,
  VIRTUALIZE_THRESHOLD,
  type CellValue,
  type ChipFilter,
  type TableSort,
} from './tableModel';
import { CountChips, DensityToggle, EmptyCell, SearchField, SkeletonRows, SortButton, SpacerRow, StateRow } from './tableParts';
import { useTableVirtualizer } from './useTableVirtualizer';

export type DataTableColumnKind = 'text' | 'number' | 'date' | 'reference';

export interface DataTableColumn<T> {
  id: string;
  header: React.ReactNode;
  /** Text for the sort summary when `header` is not a string. */
  headerLabel?: string;
  /** The cell. Returning `null`, `undefined` or `''` renders the explained empty dash. */
  cell?: (row: T, index: number) => React.ReactNode;
  /** The value behind the cell: sorting, search and the default cell use it. */
  value?: (row: T) => CellValue;
  /** Custom ascending comparison (wins over `value` for sorting). */
  compare?: (a: T, b: T) => number;
  /** Defaults to true when the column has a `value` or `compare`. */
  sortable?: boolean;
  /** First click sorts descending (newest dates, biggest numbers). */
  sortDescFirst?: boolean;
  /** Included in the default search text when it has a `value` (default true). */
  searchable?: boolean;
  /**
   * `number`: right-aligned tabular figures; `reference`: monospace;
   * `date`: never wraps. Text is the default.
   */
  kind?: DataTableColumnKind;
  align?: 'left' | 'center' | 'right';
  /** Keep the column in view while scrolling sideways (use for the first column). */
  sticky?: boolean;
  /** Minimum width (px or any CSS length). */
  minWidth?: number | string;
  /** Tooltip for the empty dash: "Not covered", "Not applicable", "No access". */
  emptyReason?: string | ((row: T) => string | undefined);
  className?: string;
  headerClassName?: string;
}

export type DataTableFilter<T> = ChipFilter<T>;

export interface DataTableEmpty {
  title?: React.ReactNode;
  body?: React.ReactNode;
  icon?: LucideIcon;
  /** Only when the user can actually do it. */
  action?: React.ReactNode;
}

export interface DataTableProps<T> {
  data: readonly T[];
  columns: ReadonlyArray<DataTableColumn<T>>;
  getRowId: (row: T, index: number) => string;
  /** Accessible name of the table, e.g. "Courses". */
  label: string;
  /** "course" / "courses" in the footer and selection labels. */
  noun?: { one: string; other: string };

  isLoading?: boolean;
  /** Anything thrown or returned as an error; a missing table reads "Not available yet" (D-01). */
  error?: unknown;
  onRetry?: () => void;
  /** First-use empty state when there are no rows at all. */
  empty?: DataTableEmpty;

  /** Show the search box (default true when any column has a value or `searchText` is set). */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Text a row is searched by; defaults to the searchable column values. */
  searchText?: (row: T) => string;
  /** Controlled search. */
  search?: string;
  onSearchChange?: (value: string) => void;

  /** Count chips; an "All" chip comes first. */
  filters?: ReadonlyArray<DataTableFilter<T>>;
  allLabel?: string;
  /** Controlled active chip id (`null` = All). */
  activeFilter?: string | null;
  onActiveFilterChange?: (id: string | null) => void;
  defaultFilter?: string | null;

  defaultSort?: TableSort | null;
  /** Controlled sort. */
  sort?: TableSort | null;
  onSortChange?: (sort: TableSort) => void;

  /** Fixed density for this table; otherwise the global preference, changeable here. */
  density?: Density;
  showDensityToggle?: boolean;

  selectable?: boolean;
  selectedIds?: readonly string[];
  onSelectionChange?: (ids: string[]) => void;
  /** Name of a row for its checkbox and keyboard activation ("Select MY Draak"). */
  rowLabel?: (row: T) => string;

  onRowClick?: (row: T) => void;
  /** Row actions: revealed on hover and focus, always visible on touch. Keep destructive ones in a menu. */
  rowActions?: (row: T) => React.ReactNode;
  rowClassName?: (row: T) => string | undefined;

  /** Extra controls next to the search box (page-level selects). */
  toolbar?: React.ReactNode;
  /** Controls on the right of the toolbar (Export), given the rows as shown. */
  toolbarEnd?: (context: { rows: readonly T[] }) => React.ReactNode;
  /** Page-level filters outside the table are active (for the filtered empty state). */
  hasExternalFilters?: boolean;
  /** Also clear page-level filters when the user presses "Clear filters". */
  onClearFilters?: () => void;
  /** Footer text; defaults to "Showing 9 of 94 courses". */
  summary?: (context: { shown: number; total: number; selected: number }) => React.ReactNode;

  /** Rows above this count are virtualised (default 200). */
  virtualizeThreshold?: number;
  /** Paginate when not virtualised. */
  pageSize?: number;
  /** Height cap of the scroll area; the header sticks inside it (default 70vh). */
  maxHeight?: number | string;
  className?: string;
}

function useControllable<V>(controlled: V | undefined, initial: V, onChange?: (value: V) => void): [V, (value: V) => void] {
  const [own, setOwn] = React.useState<V>(initial);
  const isControlled = controlled !== undefined;
  const value = isControlled ? controlled : own;
  const set = React.useCallback(
    (next: V) => {
      if (!isControlled) setOwn(next);
      onChange?.(next);
    },
    [isControlled, onChange],
  );
  return [value, set];
}

const INTERACTIVE = 'a, button, input, select, textarea, label, [role="checkbox"], [role="menuitem"], [role="switch"], [data-row-action]';

function defaultCell<T>(column: DataTableColumn<T>, row: T): React.ReactNode {
  const value = column.value?.(row);
  if (isEmptyValue(value)) return null;
  if (value instanceof Date) return value.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  if (typeof value === 'number') return value.toLocaleString('en-GB');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

const isBlankNode = (node: React.ReactNode) => node === null || node === undefined || node === false || node === '';

function alignOf<T>(column: DataTableColumn<T>): 'left' | 'center' | 'right' {
  return column.align ?? (column.kind === 'number' ? 'right' : 'left');
}

const ALIGN_CLASS = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;

const toLength = (value: number | string | undefined) => (typeof value === 'number' ? `${value}px` : value);

/**
 * The register table (gap/10 DS14, §A.10). Sticky header, sortable columns,
 * count-chip filters, search, per-table density, row selection, row actions
 * on hover / focus, explained empty cells, tabular numbers, and windowed
 * rendering above 200 rows. Loading, empty, filtered and error bodies come
 * from the shared page states.
 *
 *   <DataTable
 *     label="Courses" noun={{ one: 'course', other: 'courses' }}
 *     data={rows} getRowId={(r) => r.id} columns={columns}
 *     filters={[{ id: 'due', label: 'Due ≤ 30 d', predicate: (r) => r.bucket === 'expiring_soon' }]}
 *     isLoading={isLoading} error={error} onRetry={refetch}
 *   />
 */
export function DataTable<T>({
  data,
  columns,
  getRowId,
  label,
  noun = { one: 'row', other: 'rows' },
  isLoading = false,
  error,
  onRetry,
  empty,
  searchable,
  searchPlaceholder,
  searchText,
  search: searchProp,
  onSearchChange,
  filters = [],
  allLabel = 'All',
  activeFilter: activeFilterProp,
  onActiveFilterChange,
  defaultFilter = null,
  defaultSort = null,
  sort: sortProp,
  onSortChange,
  density,
  showDensityToggle = true,
  selectable = false,
  selectedIds,
  onSelectionChange,
  rowLabel,
  onRowClick,
  rowActions,
  rowClassName,
  toolbar,
  toolbarEnd,
  hasExternalFilters = false,
  onClearFilters,
  summary,
  virtualizeThreshold = VIRTUALIZE_THRESHOLD,
  pageSize,
  maxHeight = '70vh',
  className,
}: DataTableProps<T>) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [search, setSearch] = useControllable(searchProp, '', onSearchChange);
  const [activeFilter, setActiveFilter] = useControllable<string | null>(activeFilterProp, defaultFilter, onActiveFilterChange);
  const emitSort = React.useMemo(
    () => (onSortChange ? (next: TableSort | null) => next && onSortChange(next) : undefined),
    [onSortChange],
  );
  const [sort, setSort] = useControllable<TableSort | null>(sortProp, defaultSort, emitSort);
  const [ownDensity, setOwnDensity] = React.useState<Density | undefined>(density);
  const [ownSelection, setOwnSelection] = React.useState<ReadonlySet<string>>(() => new Set());
  const [page, setPage] = React.useState(0);

  React.useEffect(() => setOwnDensity(density), [density]);

  const selected = React.useMemo<ReadonlySet<string>>(
    () => (selectedIds ? new Set(selectedIds) : ownSelection),
    [selectedIds, ownSelection],
  );
  const setSelected = (next: Set<string>) => {
    if (!selectedIds) setOwnSelection(next);
    onSelectionChange?.(Array.from(next));
  };

  const textOf = React.useCallback(
    (row: T) =>
      searchText
        ? searchText(row)
        : columns
            .filter((c) => c.value && c.searchable !== false)
            .map((c) => valueText(c.value!(row)))
            .join(' '),
    [columns, searchText],
  );
  const showSearch = searchable ?? Boolean(searchText || columns.some((c) => c.value && c.searchable !== false));

  const searched = React.useMemo(() => searchRows(data, search, textOf), [data, search, textOf]);
  const chips = React.useMemo(() => chipCounts(searched, filters, allLabel), [searched, filters, allLabel]);
  const activeChip = activeFilter && filters.some((f) => f.id === activeFilter) ? activeFilter : ALL_CHIP_ID;
  const filtered = React.useMemo(() => applyChip(searched, filters, activeChip), [searched, filters, activeChip]);
  const sortColumn = sort ? columns.find((c) => c.id === sort.columnId) : undefined;
  const sorted = React.useMemo(
    () => (sort && sortColumn ? sortRows(filtered, sortColumn, sort.direction) : filtered),
    [filtered, sort, sortColumn],
  );

  const virtualCandidate = sorted.length > virtualizeThreshold;
  const paginated = Boolean(pageSize) && !virtualCandidate && sorted.length > (pageSize ?? 0);
  const pages = paginated ? pageCount(sorted.length, pageSize!) : 1;
  const currentPage = Math.min(page, pages - 1);
  const shown = paginated ? sorted.slice(currentPage * pageSize!, (currentPage + 1) * pageSize!) : sorted;

  React.useEffect(() => setPage(0), [search, activeChip, sort?.columnId, sort?.direction]);

  const windowed = useTableVirtualizer({
    count: shown.length,
    scrollRef,
    density: ownDensity,
    threshold: virtualizeThreshold,
  });

  const filtersActive = Boolean(search.trim()) || activeChip !== ALL_CHIP_ID || hasExternalFilters;
  const clearFilters = () => {
    setSearch('');
    setActiveFilter(null);
    onClearFilters?.();
  };

  const isSortable = (c: DataTableColumn<T>) => c.sortable ?? Boolean(c.value || c.compare);
  const handleSort = (columnId: string) => {
    const column = columns.find((c) => c.id === columnId);
    setSort(nextSort(sort, columnId, column?.sortDescFirst));
  };

  const visibleIds = React.useMemo(() => shown.map((row, i) => getRowId(row, i)), [shown, getRowId]);
  const headerChecked = selectionState(visibleIds, selected);
  const colSpan = columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0);
  const stickyOffset = selectable ? 'left-10' : 'left-0';

  const activateRow = (event: React.MouseEvent | React.KeyboardEvent, row: T) => {
    if (!onRowClick) return;
    const target = event.target as HTMLElement;
    const interactive = target.closest(INTERACTIVE);
    if (interactive && interactive !== event.currentTarget) return;
    onRowClick(row);
  };

  const sortedByLabel = sortColumn
    ? `, sorted by ${sortColumn.headerLabel ?? (typeof sortColumn.header === 'string' ? sortColumn.header : sortColumn.id)} ${
        sort!.direction === 'asc' ? 'ascending' : 'descending'
      }`
    : '';

  let body: React.ReactNode;
  if (isLoading) {
    body = <SkeletonRows columns={colSpan} />;
  } else if (data.length === 0 && !hasExternalFilters) {
    body = (
      <StateRow colSpan={colSpan}>
        <EmptyState
          compact
          kind="first-use"
          title={empty?.title ?? `No ${noun.other} yet`}
          body={empty?.body}
          icon={empty?.icon}
          action={empty?.action}
          headingLevel={3}
        />
      </StateRow>
    );
  } else if (shown.length === 0) {
    body = (
      <StateRow colSpan={colSpan}>
        <EmptyState
          compact
          kind="filtered"
          headingLevel={3}
          action={
            filtersActive ? (
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      </StateRow>
    );
  } else {
    body = (
      <>
        <SpacerRow height={windowed.paddingTop} colSpan={colSpan} />
        {windowed.indexes.map((index) => {
          const row = shown[index];
          if (row === undefined) return null;
          const id = visibleIds[index];
          const isSelected = selected.has(id);
          const name = rowLabel?.(row);
          return (
            <tr
              key={id}
              ref={windowed.virtualised ? windowed.measureRow : undefined}
              data-index={index}
              data-row-id={id}
              data-state={isSelected ? 'selected' : undefined}
              aria-rowindex={windowed.virtualised ? index + 2 : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? (event) => activateRow(event, row) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === 'Enter' && event.target === event.currentTarget) {
                        event.preventDefault();
                        activateRow(event, row);
                      }
                    }
                  : undefined
              }
              className={cn(
                // `dt-row` (index.css) draws the focus ring and the selected
                // bar on the cells, where sticky cells cannot cover them.
                'dt-row group/row h-[var(--row-h)] transition-colors duration-quick',
                isSelected ? 'bg-signal-muted' : 'hover:bg-accent',
                onRowClick && 'cursor-pointer',
                rowClassName?.(row),
              )}
            >
              {selectable ? (
                <td
                  className={cn(
                    'sticky left-0 z-[1] w-10 border-b border-border px-3 align-middle',
                    isSelected ? 'bg-signal-muted' : 'bg-card group-hover/row:bg-accent',
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => setSelected(toggleOne(selected, id))}
                    aria-label={`Select ${name ?? noun.one}`}
                  />
                </td>
              ) : null}
              {columns.map((column) => {
                const content = column.cell ? column.cell(row, index) : defaultCell(column, row);
                const reason = typeof column.emptyReason === 'function' ? column.emptyReason(row) : column.emptyReason;
                const align = alignOf(column);
                return (
                  <td
                    key={column.id}
                    style={column.minWidth !== undefined ? { minWidth: toLength(column.minWidth) } : undefined}
                    className={cn(
                      'border-b border-border px-[var(--cell-px)] py-[var(--cell-py)] align-middle',
                      ALIGN_CLASS[align],
                      column.kind === 'number' && 'tabular-nums',
                      column.kind === 'reference' && 'type-mono whitespace-nowrap',
                      column.kind === 'date' && 'whitespace-nowrap tabular-nums',
                      column.sticky && cn('sticky z-[1]', stickyOffset, isSelected ? 'bg-signal-muted' : 'bg-card group-hover/row:bg-accent'),
                      column.className,
                    )}
                  >
                    {isBlankNode(content) ? <EmptyCell reason={reason} /> : content}
                  </td>
                );
              })}
              {rowActions ? (
                <td className="w-px whitespace-nowrap border-b border-border px-[var(--cell-px)] py-0 text-right align-middle">
                  <div
                    data-row-action=""
                    className="flex items-center justify-end gap-1 opacity-0 transition-opacity duration-quick group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(pointer:coarse)]:opacity-100"
                  >
                    {rowActions(row)}
                  </div>
                </td>
              ) : null}
            </tr>
          );
        })}
        <SpacerRow height={windowed.paddingBottom} colSpan={colSpan} />
      </>
    );
  }

  const selectedCount = selected.size;
  const footer = summary
    ? summary({ shown: sorted.length, total: data.length, selected: selectedCount })
    : `${showingSummary(sorted.length, data.length, noun)}${sortedByLabel}`;

  return (
    <section
      data-density={ownDensity}
      data-virtualised={windowed.virtualised ? '' : undefined}
      className={cn('overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-e1', className)}
    >
      {showSearch || toolbar || toolbarEnd || showDensityToggle ? (
        <div className="flex flex-col gap-2 border-b border-border p-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {showSearch ? (
              <SearchField value={search} onChange={setSearch} placeholder={searchPlaceholder ?? `Search ${noun.other}`} />
            ) : null}
            {toolbar}
          </div>
          <div className="flex items-center gap-2 self-end md:self-auto">
            {showDensityToggle ? (
              <DensityToggle value={windowed.effectiveDensity} onChange={setOwnDensity} />
            ) : null}
            {toolbarEnd?.({ rows: sorted })}
          </div>
        </div>
      ) : null}

      {filters.length > 0 ? (
        <div className="border-b border-border px-3 py-2">
          <CountChips
            chips={chips}
            activeId={activeChip}
            onChange={(id) => setActiveFilter(id === ALL_CHIP_ID ? null : id)}
            label={`Filter ${noun.other}`}
          />
        </div>
      ) : null}

      {error && !isLoading ? (
        <div className="p-4">
          <PageError error={error} onRetry={onRetry} variant="inline" headingLevel={3} />
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="relative overflow-auto overscroll-contain"
          style={{ maxHeight: toLength(maxHeight) }}
        >
          <table
            aria-label={label}
            aria-busy={isLoading || undefined}
            aria-rowcount={windowed.virtualised ? shown.length + 1 : undefined}
            className="w-full caption-bottom border-separate border-spacing-0 text-sm tabular-nums"
          >
            <thead>
              <tr aria-rowindex={windowed.virtualised ? 1 : undefined}>
                {selectable ? (
                  <th
                    scope="col"
                    className="sticky left-0 top-0 z-30 w-10 border-b border-border bg-muted px-3 align-middle"
                  >
                    <Checkbox
                      checked={headerChecked}
                      onCheckedChange={() => setSelected(toggleAllVisible(visibleIds, selected))}
                      aria-label={`Select all shown ${noun.other}`}
                      disabled={isLoading || visibleIds.length === 0}
                    />
                  </th>
                ) : null}
                {columns.map((column) => {
                  const align = alignOf(column);
                  return (
                    <th
                      key={column.id}
                      scope="col"
                      aria-sort={isSortable(column) ? ariaSort(sort, column.id) : undefined}
                      style={column.minWidth !== undefined ? { minWidth: toLength(column.minWidth) } : undefined}
                      className={cn(
                        'sticky top-0 z-20 h-[var(--row-h)] whitespace-nowrap border-b border-border bg-muted px-[var(--cell-px)] align-middle text-xs font-semibold text-muted-foreground',
                        ALIGN_CLASS[align],
                        column.sticky && cn('z-30', stickyOffset),
                        column.headerClassName,
                      )}
                    >
                      {isSortable(column) ? (
                        <SortButton columnId={column.id} sort={sort} onSort={handleSort} align={align}>
                          {column.header}
                        </SortButton>
                      ) : (
                        column.header
                      )}
                    </th>
                  );
                })}
                {rowActions ? (
                  <th scope="col" className="sticky top-0 z-20 w-px border-b border-border bg-muted px-[var(--cell-px)]">
                    <span className="sr-only">Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>{body}</tbody>
          </table>
          {isLoading ? (
            <span role="status" className="sr-only">
              Loading {noun.other}
            </span>
          ) : null}
        </div>
      )}

      {!isLoading && !error && data.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <p aria-live="polite" className="tabular-nums">
            {footer}
            {selectable && selectedCount > 0 ? ` · ${selectedCount.toLocaleString('en-GB')} selected` : null}
          </p>
          {paginated ? (
            <nav aria-label={`${label} pages`} className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage === 0}
                aria-label="Previous page"
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <span className="tabular-nums">
                Page {currentPage + 1} of {pages}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= pages - 1}
                aria-label="Next page"
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </nav>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
