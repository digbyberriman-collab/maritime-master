import React, { useEffect, useMemo, useRef } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
  type Updater,
  type VisibilityState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useCrewListPreferences, reconcileColumnIds } from '@/modules/crew/hooks/useCrewListPreferences';
import { useCrewSelection } from '@/modules/crew/hooks/useCrewSelection';
import { buildCrewColumns, DEFAULT_HIDDEN_COLUMNS } from '@/modules/crew/components/list/columns/crewColumns';
import type { CrewMemberWithStatus } from '@/modules/crew/hooks/useCrewWithComputedStatus';

const ROW_HEIGHT = 56;
const VIRTUALIZATION_THRESHOLD = 50;

interface CrewTableViewProps {
  members: CrewMemberWithStatus[];
  onSelectMember: (userId: string) => void;
}

export const CrewTableView: React.FC<CrewTableViewProps> = ({ members, onSelectMember }) => {
  const columns = useMemo(() => buildCrewColumns(), []);
  const knownIds = useMemo(() => columns.map((c) => c.id!).filter(Boolean), [columns]);

  const {
    columnVisibility,
    columnSizing,
    sorting,
    setColumnVisibility,
    setColumnSizing,
    setSorting,
  } = useCrewListPreferences();
  const { rowSelection, setRowSelection } = useCrewSelection();

  // Hydrate column visibility on first mount: if the user has never opened
  // this view, hide the columns marked `hideableByDefault`. Otherwise respect
  // their persisted choices (reconcileColumnIds drops stale entries).
  useEffect(() => {
    reconcileColumnIds(knownIds);
    if (Object.keys(columnVisibility).length === 0) {
      const initial: VisibilityState = {};
      for (const id of DEFAULT_HIDDEN_COLUMNS) initial[id] = false;
      setColumnVisibility(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSorting: OnChangeFn<SortingState> = (u) =>
    setSorting(typeof u === 'function' ? (u as (prev: SortingState) => SortingState) : () => u);
  const handleSizing: OnChangeFn<typeof columnSizing> = (u) =>
    setColumnSizing(typeof u === 'function' ? (u as (prev: typeof columnSizing) => typeof columnSizing) : () => u);
  const handleVisibility: OnChangeFn<VisibilityState> = (u) =>
    setColumnVisibility(typeof u === 'function' ? (u as (prev: VisibilityState) => VisibilityState) : () => u);
  const handleSelection: OnChangeFn<RowSelectionState> = (u: Updater<RowSelectionState>) =>
    setRowSelection(typeof u === 'function' ? u : () => u);

  const table = useReactTable({
    data: members,
    columns,
    state: { sorting, columnVisibility, columnSizing, rowSelection },
    enableRowSelection: true,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    getRowId: (row) => row.id,
    onSortingChange: handleSorting,
    onColumnVisibilityChange: handleVisibility,
    onColumnSizingChange: handleSizing,
    onRowSelectionChange: handleSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const { rows } = table.getRowModel();
  const containerRef = useRef<HTMLDivElement>(null);
  const useVirtual = rows.length > VIRTUALIZATION_THRESHOLD;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    enabled: useVirtual,
  });

  const visibleColumns = table.getVisibleLeafColumns();
  const totalWidth = visibleColumns.reduce((acc, c) => acc + c.getSize(), 0);
  const gridTemplate = visibleColumns.map((c) => `${c.getSize()}px`).join(' ');

  const renderRow = (row: (typeof rows)[number], top?: number) => (
    <div
      key={row.id}
      role="row"
      aria-selected={row.getIsSelected()}
      data-state={row.getIsSelected() ? 'selected' : undefined}
      onClick={() => onSelectMember(row.original.user_id ?? row.original.id)}
      className="grid items-center border-b border-border/60 px-4 cursor-pointer hover:bg-muted/40 data-[state=selected]:bg-accent/40"
      style={{
        gridTemplateColumns: gridTemplate,
        height: ROW_HEIGHT,
        ...(top !== undefined
          ? { position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${top}px)` }
          : {}),
      }}
    >
      {row.getVisibleCells().map((cell) => (
        <div
          key={cell.id}
          role="cell"
          className="truncate pr-3 text-sm"
          style={{ width: cell.column.getSize() }}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </div>
      ))}
    </div>
  );

  return (
    <div className="border rounded-md bg-card">
      {/* Header */}
      <div
        role="rowheader"
        className="grid items-center border-b bg-muted/50 px-4 sticky top-0 z-10 text-xs font-medium uppercase tracking-wide text-muted-foreground"
        style={{ gridTemplateColumns: gridTemplate, height: 44, width: Math.max(totalWidth, 100) }}
      >
        {table.getHeaderGroups()[0]?.headers.map((header) => {
          const sortDir = header.column.getIsSorted();
          const sortable = header.column.getCanSort();
          return (
            <div
              key={header.id}
              className={`flex items-center gap-1 pr-3 ${sortable ? 'cursor-pointer select-none' : ''}`}
              onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
              style={{ width: header.getSize() }}
            >
              <span className="truncate">
                {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
              </span>
              {sortable && (
                <span className="text-muted-foreground/60">
                  {sortDir === 'asc' ? <ArrowUp className="h-3 w-3" />
                    : sortDir === 'desc' ? <ArrowDown className="h-3 w-3" />
                    : <ArrowUpDown className="h-3 w-3" />}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Body */}
      <div
        ref={containerRef}
        className="overflow-auto"
        style={{ height: 'calc(100vh - 320px)', minHeight: 320 }}
      >
        {rows.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            No matching crew.
          </div>
        ) : useVirtual ? (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vRow) => renderRow(rows[vRow.index]!, vRow.start))}
          </div>
        ) : (
          rows.map((row) => renderRow(row))
        )}
      </div>

      <div className="px-4 py-2 text-xs text-muted-foreground border-t flex items-center justify-between">
        <span>{rows.length} crew{useVirtual ? ' · virtualized' : ''}</span>
        {Object.keys(rowSelection).length > 0 && (
          <span>{Object.keys(rowSelection).length} selected</span>
        )}
      </div>
    </div>
  );
};
