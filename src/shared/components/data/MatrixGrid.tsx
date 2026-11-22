import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Density } from '@/components/ui/theme-config';
import { EmptyState, PageError } from '@/shared/components/states';
import { errorMessage } from '@/shared/lib/notify';
import type { DataTableEmpty } from './DataTable';
import {
  ALL_CHIP_ID,
  applyChip,
  ariaSort,
  cellKey,
  chipCounts,
  groupSpans,
  nextSort,
  pluralise,
  searchRows,
  showingSummary,
  sortRows,
  stageEdit,
  stagedValue,
  valueText,
  VIRTUALIZE_THRESHOLD,
  type CellValue,
  type ChipFilter,
  type MatrixChange,
  type StagedEdits,
  type TableSort,
} from './tableModel';
import { CountChips, DensityToggle, SearchField, SkeletonRows, SortButton, SpacerRow, StateRow } from './tableParts';
import { useTableVirtualizer } from './useTableVirtualizer';

export interface MatrixColumn {
  id: string;
  /** Short label in the header (a code or abbreviation). */
  label: React.ReactNode;
  /** Second header line in muted text. */
  sublabel?: React.ReactNode;
  /** Full name for the tooltip, cell labels and the review list. */
  title?: string;
  /** Column-group id; consecutive columns of one group share a header. */
  group?: string;
  /** Column width in px (default 88). */
  width?: number;
}

export interface MatrixColumnGroup {
  id: string;
  label: React.ReactNode;
}

/** A descriptive column between the row header and the matrix (rank, department). */
export interface MatrixRowColumn<R> {
  id: string;
  header: React.ReactNode;
  headerLabel?: string;
  cell: (row: R) => React.ReactNode;
  /** Makes the column sortable and searchable. */
  value?: (row: R) => CellValue;
  minWidth?: number | string;
}

export interface MatrixCellContext<V> {
  /** The value the cell shows (staged when there is a staged edit). */
  value: V;
  /** The saved value. */
  saved: V;
  staged: boolean;
  editable: boolean;
  /** Stage a new value; setting the saved value again un-stages it. */
  setValue: (next: V) => void;
  /** "Chief Engineer, STCW Basic Safety", for the cell control's aria-label. */
  label: string;
}

export interface MatrixGridProps<R, V> {
  /** Accessible name, e.g. "Training matrix". */
  label: string;
  /** What a row is: "crew member" / "crew members". */
  noun?: { one: string; other: string };
  rows: readonly R[];
  getRowId: (row: R) => string;
  /** Plain-text row name: search, sort, cell labels and the review list. */
  rowLabel: (row: R) => string;
  /** Rich row header; defaults to `rowLabel`. */
  renderRowHeader?: (row: R) => React.ReactNode;
  /** Heading of the sticky first column. */
  rowHeader?: React.ReactNode;
  rowColumns?: ReadonlyArray<MatrixRowColumn<R>>;
  columns: readonly MatrixColumn[];
  groups?: readonly MatrixColumnGroup[];
  /** `wrap` (default) for short labels, `rotate` for many narrow columns. */
  labelMode?: 'wrap' | 'rotate';

  getValue: (row: R, column: MatrixColumn) => V;
  renderCell: (context: MatrixCellContext<V>, row: R, column: MatrixColumn) => React.ReactNode;

  /** Cells that can be edited. Edits are staged until "Review & save". */
  editable?: boolean | ((row: R, column: MatrixColumn) => boolean);
  /** Persist staged edits. Throw to keep them staged and show the error. */
  onSave?: (changes: MatrixChange<V>[]) => Promise<void> | void;
  /** Text of a value in the review list ("Granted", "Not required"). */
  formatValue?: (value: V) => string;
  isEqual?: (a: V, b: V) => boolean;
  saveLabel?: string;

  searchable?: boolean;
  searchPlaceholder?: string;
  filters?: ReadonlyArray<ChipFilter<R>>;
  allLabel?: string;
  defaultSort?: TableSort | null;
  density?: Density;
  showDensityToggle?: boolean;

  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: DataTableEmpty;

  toolbar?: React.ReactNode;
  toolbarEnd?: (context: { rows: readonly R[] }) => React.ReactNode;
  /** Shown in the footer, e.g. the cell legend. */
  legend?: React.ReactNode;
  virtualizeThreshold?: number;
  maxHeight?: number | string;
  className?: string;
}

const ROW_HEADER_ID = '__row__';
const DEFAULT_COLUMN_WIDTH = 88;

type Crosshair = { r: number | null; c: number | null };

interface CrosshairHandle {
  set: (next: Crosshair) => void;
}

/**
 * The crosshair is a scoped style rule rather than per-cell state, so moving
 * the pointer across a 50 × 30 matrix re-renders one <style> element, not
 * 1,500 cells.
 */
const CrosshairStyle = React.forwardRef<CrosshairHandle, { scope: string }>(({ scope }, ref) => {
  const [point, setPoint] = React.useState<Crosshair>({ r: null, c: null });
  React.useImperativeHandle(
    ref,
    () => ({ set: (next) => setPoint((prev) => (prev.r === next.r && prev.c === next.c ? prev : next)) }),
    [],
  );
  const root = `[data-matrix="${scope}"]`;
  const rules: string[] = [];
  if (point.r !== null) rules.push(`${root} tr[data-r="${point.r}"] > *{background-color:hsl(var(--accent))}`);
  if (point.c !== null) rules.push(`${root} [data-c="${point.c}"]{background-color:hsl(var(--accent))}`);
  if (point.r !== null && point.c !== null) {
    rules.push(
      `${root} tr[data-r="${point.r}"] > [data-c="${point.c}"]{background-color:hsl(var(--signal-muted));box-shadow:inset 0 0 0 1px hsl(var(--primary))}`,
    );
  }
  return <style data-crosshair={`${point.r ?? ''}:${point.c ?? ''}`}>{rules.join('')}</style>;
});
CrosshairStyle.displayName = 'CrosshairStyle';

const toLength = (value: number | string | undefined) => (typeof value === 'number' ? `${value}px` : value);

const readIndex = (element: Element | null, attr: 'data-r' | 'data-c'): number | null => {
  const raw = element?.getAttribute(attr);
  return raw === null || raw === undefined || raw === '' ? null : Number(raw);
};

/**
 * Matrix grid (gap/10 DS15): people × flags, crew × qualifications, drills ×
 * months, vessels × modules. Sticky header row(s) and first column, column
 * groups, wrapped or rotated labels, a crosshair on hover and focus, count
 * chips, sort and search on rows, density, windowed rows above 200, and the
 * staged-edit footer: edits collect locally, "Review & save" lists every
 * change (row, column, before → after) before one `onSave` call (§7.12).
 */
export function MatrixGrid<R, V>({
  label,
  noun = { one: 'row', other: 'rows' },
  rows,
  getRowId,
  rowLabel,
  renderRowHeader,
  rowHeader = 'Name',
  rowColumns = [],
  columns,
  groups,
  labelMode = 'wrap',
  getValue,
  renderCell,
  editable = false,
  onSave,
  formatValue = (value: V) => valueText(value as CellValue) || '—',
  isEqual = Object.is,
  saveLabel = 'Review & save',
  searchable = true,
  searchPlaceholder,
  filters = [],
  allLabel = 'All',
  defaultSort = null,
  density,
  showDensityToggle = true,
  isLoading = false,
  error,
  onRetry,
  empty,
  toolbar,
  toolbarEnd,
  legend,
  virtualizeThreshold = VIRTUALIZE_THRESHOLD,
  maxHeight = '70vh',
  className,
}: MatrixGridProps<R, V>) {
  const scope = React.useId();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const crosshair = React.useRef<CrosshairHandle>(null);
  const [search, setSearch] = React.useState('');
  const [activeChip, setActiveChip] = React.useState<string>(ALL_CHIP_ID);
  const [sort, setSort] = React.useState<TableSort | null>(defaultSort);
  const [ownDensity, setOwnDensity] = React.useState<Density | undefined>(density);
  const [edits, setEdits] = React.useState<StagedEdits<V>>(() => new Map());
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [savedNote, setSavedNote] = React.useState<string | null>(null);

  React.useEffect(() => setOwnDensity(density), [density]);

  const searchTextOf = React.useCallback(
    (row: R) => [rowLabel(row), ...rowColumns.map((c) => (c.value ? valueText(c.value(row)) : ''))].join(' '),
    [rowLabel, rowColumns],
  );
  const searched = React.useMemo(() => searchRows(rows, search, searchTextOf), [rows, search, searchTextOf]);
  const chips = React.useMemo(() => chipCounts(searched, filters, allLabel), [searched, filters, allLabel]);
  const chipId = filters.some((f) => f.id === activeChip) ? activeChip : ALL_CHIP_ID;
  const filtered = React.useMemo(() => applyChip(searched, filters, chipId), [searched, filters, chipId]);
  const sortColumn = React.useMemo(() => {
    if (!sort) return undefined;
    if (sort.columnId === ROW_HEADER_ID) return { id: ROW_HEADER_ID, value: (row: R) => rowLabel(row) };
    const meta = rowColumns.find((c) => c.id === sort.columnId);
    return meta?.value ? { id: meta.id, value: meta.value } : undefined;
  }, [sort, rowColumns, rowLabel]);
  const shown = React.useMemo(
    () => (sort && sortColumn ? sortRows(filtered, sortColumn, sort.direction) : filtered),
    [filtered, sort, sortColumn],
  );

  const windowed = useTableVirtualizer({ count: shown.length, scrollRef, density: ownDensity, threshold: virtualizeThreshold });

  const columnById = React.useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);
  const rowById = React.useMemo(() => new Map(rows.map((r) => [getRowId(r), r])), [rows, getRowId]);
  const hasGroups = Boolean(groups?.length) || columns.some((c) => c.group);
  const spans = React.useMemo(() => (hasGroups ? groupSpans(columns) : []), [hasGroups, columns]);
  const groupLabel = (id: string | null) => (id ? (groups?.find((g) => g.id === id)?.label ?? id) : null);
  const frozenCount = 1 + rowColumns.length;
  const colSpan = frozenCount + columns.length;
  const dirty = edits.size > 0;

  // Unsaved staged edits survive in-app navigation only until the page unmounts; warn on reload / close.
  React.useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const canEdit = (row: R, column: MatrixColumn) =>
    Boolean(onSave) && (typeof editable === 'function' ? editable(row, column) : editable);

  const stage = React.useCallback(
    (rowId: string, columnId: string, saved: V, next: V) => {
      setSavedNote(null);
      setEdits((prev) => stageEdit(prev, { rowId, columnId, from: saved, to: next }, isEqual));
    },
    [isEqual],
  );

  const columnName = (column: MatrixColumn) => column.title ?? (typeof column.label === 'string' ? column.label : column.id);

  const trackPointer = (event: React.SyntheticEvent) => {
    const target = event.target as Element;
    const cell = target.closest('[data-c]');
    const row = target.closest('tr[data-r]');
    crosshair.current?.set({ r: readIndex(row, 'data-r'), c: readIndex(cell, 'data-c') });
  };
  const clearPointer = () => crosshair.current?.set({ r: null, c: null });

  const save = async () => {
    if (!onSave) return;
    const changes = Array.from(edits.values());
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(changes);
      setEdits(new Map());
      setReviewOpen(false);
      setSavedNote(`${pluralise(changes.length, { one: 'change', other: 'changes' })} saved`);
    } catch (err) {
      setSaveError(errorMessage(err, 'The changes could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const reviewGroups = React.useMemo(() => {
    const byRow = new Map<string, MatrixChange<V>[]>();
    for (const change of edits.values()) {
      const list = byRow.get(change.rowId) ?? [];
      list.push(change);
      byRow.set(change.rowId, list);
    }
    return Array.from(byRow.entries());
  }, [edits]);

  const headerTop = hasGroups ? 'top-8' : 'top-0';
  const labelHeight = labelMode === 'rotate' ? 'h-36' : 'h-auto min-h-[var(--row-h)]';

  const sortable = (id: string) => id === ROW_HEADER_ID || Boolean(rowColumns.find((c) => c.id === id)?.value);
  const onSort = (id: string) => setSort((prev) => nextSort(prev, id));

  const frozenHeaders = (
    <>
      <th
        scope="col"
        rowSpan={hasGroups ? 2 : undefined}
        aria-sort={ariaSort(sort, ROW_HEADER_ID)}
        className={cn(
          'sticky left-0 top-0 z-40 min-w-[140px] border-b border-r border-border bg-muted px-[var(--cell-px)] text-left align-bottom text-xs font-semibold text-muted-foreground sm:min-w-[200px]',
          labelHeight,
        )}
      >
        <div className="py-2">
          <SortButton columnId={ROW_HEADER_ID} sort={sort} onSort={onSort}>
            {rowHeader}
          </SortButton>
        </div>
      </th>
      {rowColumns.map((column) => (
        <th
          key={column.id}
          scope="col"
          rowSpan={hasGroups ? 2 : undefined}
          aria-sort={sortable(column.id) ? ariaSort(sort, column.id) : undefined}
          style={column.minWidth !== undefined ? { minWidth: toLength(column.minWidth) } : undefined}
          className={cn(
            'sticky top-0 z-30 whitespace-nowrap border-b border-border bg-muted px-[var(--cell-px)] text-left align-bottom text-xs font-semibold text-muted-foreground',
            labelHeight,
          )}
        >
          <div className="py-2">
            {sortable(column.id) ? (
              <SortButton columnId={column.id} sort={sort} onSort={onSort}>
                {column.header}
              </SortButton>
            ) : (
              column.header
            )}
          </div>
        </th>
      ))}
    </>
  );

  let body: React.ReactNode;
  if (isLoading) {
    body = <SkeletonRows columns={Math.min(colSpan, frozenCount + 8)} />;
  } else if (rows.length === 0 || columns.length === 0) {
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch('');
                setActiveChip(ALL_CHIP_ID);
              }}
            >
              Clear filters
            </Button>
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
          const rowId = getRowId(row);
          const name = rowLabel(row);
          return (
            <tr
              key={rowId}
              ref={windowed.virtualised ? windowed.measureRow : undefined}
              data-index={index}
              data-r={index}
              data-row-id={rowId}
              aria-rowindex={windowed.virtualised ? index + (hasGroups ? 3 : 2) : undefined}
              className="h-[var(--row-h)]"
            >
              <th
                scope="row"
                className="sticky left-0 z-[1] border-b border-r border-border bg-card px-[var(--cell-px)] py-[var(--cell-py)] text-left align-middle text-sm font-medium text-foreground"
              >
                {renderRowHeader ? renderRowHeader(row) : name}
              </th>
              {rowColumns.map((column) => (
                <td
                  key={column.id}
                  className="whitespace-nowrap border-b border-border bg-card px-[var(--cell-px)] py-[var(--cell-py)] align-middle"
                >
                  {column.cell(row)}
                </td>
              ))}
              {columns.map((column, c) => {
                const saved = getValue(row, column);
                const value = stagedValue(edits, rowId, column.id, saved);
                const isStaged = edits.has(cellKey(rowId, column.id));
                const cellEditable = canEdit(row, column);
                return (
                  <td
                    key={column.id}
                    data-c={c}
                    data-staged={isStaged ? '' : undefined}
                    className="relative border-b border-border bg-card px-1 py-[var(--cell-py)] text-center align-middle"
                  >
                    {renderCell(
                      {
                        value,
                        saved,
                        staged: isStaged,
                        editable: cellEditable,
                        setValue: (next) => (cellEditable ? stage(rowId, column.id, saved, next) : undefined),
                        label: `${name}, ${columnName(column)}`,
                      },
                      row,
                      column,
                    )}
                    {isStaged ? (
                      <span aria-hidden="true" className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-warning" />
                    ) : null}
                  </td>
                );
              })}
            </tr>
          );
        })}
        <SpacerRow height={windowed.paddingBottom} colSpan={colSpan} />
      </>
    );
  }

  return (
    <section
      data-density={ownDensity}
      data-virtualised={windowed.virtualised ? '' : undefined}
      className={cn('overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-e1', className)}
    >
      {searchable || toolbar || toolbarEnd || showDensityToggle ? (
        <div className="flex flex-col gap-2 border-b border-border p-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {searchable ? (
              <SearchField value={search} onChange={setSearch} placeholder={searchPlaceholder ?? `Search ${noun.other}`} />
            ) : null}
            {toolbar}
          </div>
          <div className="flex items-center gap-2 self-end md:self-auto">
            {showDensityToggle ? <DensityToggle value={windowed.effectiveDensity} onChange={setOwnDensity} /> : null}
            {toolbarEnd?.({ rows: shown })}
          </div>
        </div>
      ) : null}

      {filters.length > 0 ? (
        <div className="border-b border-border px-3 py-2">
          <CountChips chips={chips} activeId={chipId} onChange={setActiveChip} label={`Filter ${noun.other}`} />
        </div>
      ) : null}

      {error && !isLoading ? (
        <div className="p-4">
          <PageError error={error} onRetry={onRetry} variant="inline" headingLevel={3} />
        </div>
      ) : (
        <div
          ref={scrollRef}
          data-matrix={scope}
          className="relative overflow-auto overscroll-contain"
          style={{ maxHeight: toLength(maxHeight) }}
        >
          <CrosshairStyle ref={crosshair} scope={scope} />
          <table
            aria-label={label}
            aria-busy={isLoading || undefined}
            aria-rowcount={windowed.virtualised ? shown.length + (hasGroups ? 2 : 1) : undefined}
            onPointerOver={trackPointer}
            onFocusCapture={trackPointer}
            onPointerLeave={clearPointer}
            onBlurCapture={clearPointer}
            className="border-separate border-spacing-0 text-sm tabular-nums"
          >
            <thead>
              {hasGroups ? (
                <tr>
                  {frozenHeaders}
                  {spans.map((span, i) => (
                    <th
                      key={`${span.groupId ?? 'none'}-${i}`}
                      scope="colgroup"
                      colSpan={span.span}
                      className={cn(
                        'sticky top-0 z-20 h-8 whitespace-nowrap border-b border-l border-border bg-muted px-2 text-center align-middle text-xs font-semibold',
                        span.groupId ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {groupLabel(span.groupId)}
                    </th>
                  ))}
                </tr>
              ) : null}
              <tr>
                {hasGroups ? null : frozenHeaders}
                {columns.map((column, c) => {
                  const width = column.width ?? DEFAULT_COLUMN_WIDTH;
                  return (
                    <th
                      key={column.id}
                      scope="col"
                      data-c={c}
                      title={column.title}
                      style={{ minWidth: width, width }}
                      className={cn(
                        'sticky z-20 border-b border-border bg-muted px-1 align-bottom text-xs font-semibold text-muted-foreground',
                        headerTop,
                        labelHeight,
                      )}
                    >
                      {labelMode === 'rotate' ? (
                        <div className="mx-auto flex h-32 items-end justify-center pb-2">
                          <span className="rotate-180 whitespace-nowrap text-left [writing-mode:vertical-rl]">
                            {column.label}
                            {column.sublabel ? <span className="font-normal text-muted-foreground"> {column.sublabel}</span> : null}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-0.5 py-2 text-center leading-tight">
                          <span className="break-words text-foreground">{column.label}</span>
                          {column.sublabel ? (
                            <span className="line-clamp-2 break-words font-normal text-muted-foreground">{column.sublabel}</span>
                          ) : null}
                        </div>
                      )}
                    </th>
                  );
                })}
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

      {!isLoading && !error && rows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <p aria-live="polite" className="tabular-nums">
            {showingSummary(shown.length, rows.length, noun)}
            {savedNote ? ` · ${savedNote}` : null}
          </p>
          {legend ? <div className="flex flex-wrap items-center gap-x-4 gap-y-1">{legend}</div> : null}
        </div>
      ) : null}

      {dirty ? (
        <div
          role="region"
          aria-label="Unsaved changes"
          className="sticky bottom-0 z-40 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-popover px-3 py-2 text-popover-foreground shadow-e2"
        >
          <p className="text-sm font-medium tabular-nums">
            {pluralise(edits.size, { one: 'unsaved change', other: 'unsaved changes' })}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEdits(new Map())} disabled={saving}>
              Discard
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setSaveError(null);
                setReviewOpen(true);
              }}
            >
              {saveLabel}
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={reviewOpen} onOpenChange={(open) => !saving && setReviewOpen(open)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review changes</DialogTitle>
            <DialogDescription>
              {pluralise(edits.size, { one: 'change', other: 'changes' })} to {label.toLowerCase()}. Nothing is saved until you
              confirm.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-[50vh] space-y-3 overflow-y-auto text-sm" aria-label="Changes to save">
            {reviewGroups.map(([rowId, changes]) => {
              const row = rowById.get(rowId);
              return (
                <li key={rowId}>
                  <p className="font-medium text-foreground">{row ? rowLabel(row) : rowId}</p>
                  <ul className="mt-1 space-y-1">
                    {changes.map((change) => {
                      const column = columnById.get(change.columnId);
                      return (
                        <li key={change.columnId} className="flex flex-wrap items-baseline gap-x-2 text-muted-foreground">
                          <span className="text-foreground">{column ? columnName(column) : change.columnId}</span>
                          <span>
                            <span className="sr-only">from </span>
                            <del className="no-underline">{formatValue(change.from)}</del>
                            <span aria-hidden="true"> → </span>
                            <span className="sr-only"> to </span>
                            <ins className="font-medium text-foreground no-underline">{formatValue(change.to)}</ins>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
          {saveError ? (
            <Alert variant="destructive">
              <AlertTitle>Not saved</AlertTitle>
              <AlertDescription>{saveError}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReviewOpen(false)} disabled={saving}>
              Back
            </Button>
            <Button type="button" onClick={save} disabled={saving || edits.size === 0}>
              {saving ? 'Saving…' : `Save ${pluralise(edits.size, { one: 'change', other: 'changes' })}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/**
 * A yes / no matrix cell (granted, required, enabled). A real checkbox for
 * assistive tech, 28 px visible and 44 px on touch.
 */
export function MatrixToggleCell({ context }: { context: MatrixCellContext<boolean> }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={context.value}
      aria-label={context.label}
      disabled={!context.editable}
      onClick={() => context.setValue(!context.value)}
      className={cn(
        'focus-ring mx-auto flex h-7 w-7 items-center justify-center rounded-sm border transition-colors duration-quick [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11',
        context.value ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-field text-transparent',
        context.editable ? 'cursor-pointer hover:border-primary' : 'cursor-default opacity-70',
      )}
    >
      <Check aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
    </button>
  );
}
