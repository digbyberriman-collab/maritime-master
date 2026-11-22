/**
 * Building blocks shared by `DataTable` and `MatrixGrid` (gap/10 §A.10):
 * the search box, count chips, density toggle, sortable header button,
 * explained empty cell and skeleton rows. Exported for pages that need one
 * piece on its own (a chip row above a card grid, an explained dash).
 */
import * as React from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Rows2, Rows3, Rows4, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { Density } from '@/components/ui/theme-config';
import type { ChipCount, TableSort } from './tableModel';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Accessible name; defaults to the placeholder. */
  label?: string;
  className?: string;
}

export function SearchField({ value, onChange, placeholder = 'Search', label, className }: SearchFieldProps) {
  return (
    <div className={cn('relative w-full sm:w-72', className)}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        className="pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="focus-ring absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export interface CountChipsProps {
  chips: readonly ChipCount[];
  activeId: string;
  onChange: (id: string) => void;
  /** Accessible name of the chip group, e.g. "Filter courses". */
  label: string;
  className?: string;
}

/**
 * Count chips as filters ("All 94 · Waiting on crew 5"): live counts, one
 * active at a time, `aria-pressed` on each so the state is announced.
 */
export function CountChips({ chips, activeId, onChange, label, className }: CountChipsProps) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {chips.map((chip) => {
        const active = chip.id === activeId;
        return (
          <button
            key={chip.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(chip.id)}
            className={cn(
              'focus-ring inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors duration-quick',
              '[@media(pointer:coarse)]:h-11',
              active
                ? 'border-primary bg-signal-muted text-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <span>{chip.label}</span>
            <span
              data-count={chip.count}
              className={cn('tabular-nums font-semibold', active ? 'text-primary' : 'text-foreground')}
            >
              {chip.count.toLocaleString('en-GB')}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const DENSITY_OPTIONS: ReadonlyArray<{ value: Density; label: string; icon: typeof Rows2 }> = [
  { value: 'comfortable', label: 'Comfortable rows', icon: Rows2 },
  { value: 'default', label: 'Default rows', icon: Rows3 },
  { value: 'compact', label: 'Compact rows', icon: Rows4 },
];

export interface DensityToggleProps {
  value: Density;
  onChange: (density: Density) => void;
  className?: string;
}

/** Row density for one table (A.7); the global preference stays as it is. */
export function DensityToggle({ value, onChange, className }: DensityToggleProps) {
  return (
    <div role="group" aria-label="Row density" className={cn('inline-flex rounded-md border border-input p-0.5', className)}>
      {DENSITY_OPTIONS.map(({ value: option, label, icon: Icon }) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          aria-label={label}
          title={label}
          onClick={() => onChange(option)}
          className={cn(
            'focus-ring flex h-7 w-7 items-center justify-center rounded-sm transition-colors duration-quick',
            '[@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10',
            value === option ? 'bg-signal-muted text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
        </button>
      ))}
    </div>
  );
}

export interface SortButtonProps {
  columnId: string;
  sort: TableSort | null | undefined;
  onSort: (columnId: string) => void;
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
}

/** Header label as a button: sort icon on hover, the active sort in foreground with its arrow. */
export function SortButton({ columnId, sort, onSort, children, align = 'left' }: SortButtonProps) {
  const active = sort?.columnId === columnId;
  const Icon = !active ? ChevronsUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(columnId)}
      className={cn(
        'focus-ring group/sort -mx-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 font-semibold',
        align === 'right' && 'flex-row-reverse',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <span>{children}</span>
      <Icon
        aria-hidden="true"
        className={cn(
          'h-3.5 w-3.5 shrink-0 transition-opacity duration-quick',
          active ? 'opacity-100' : 'opacity-0 group-hover/sort:opacity-100 group-focus-visible/sort:opacity-100',
        )}
      />
    </button>
  );
}

export interface EmptyCellProps {
  /** Why there is no value: "Not covered", "Not applicable", "No access". */
  reason?: string;
}

/**
 * An empty cell that explains itself (A.10): an en dash in muted text with
 * the reason as a tooltip and for screen readers, never a bare dash.
 */
export function EmptyCell({ reason }: EmptyCellProps) {
  const text = reason ?? 'No value';
  return (
    <span className="text-muted-foreground" title={text}>
      <span aria-hidden="true">–</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

/** Skeleton rows shaped like the table while it loads (A.12), never a spinner. */
export function SkeletonRows({ rows = 5, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden="true" className="h-[var(--row-h)] border-b border-border">
          {Array.from({ length: columns }, (_, c) => (
            <td key={c} className="px-[var(--cell-px)] py-[var(--cell-py)]">
              <Skeleton className={cn('h-3.5', c === 0 ? 'w-32' : 'w-16')} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Keeps the scroll height of a virtualised body. */
export function SpacerRow({ height, colSpan }: { height: number; colSpan: number }) {
  if (height <= 0) return null;
  return (
    <tr aria-hidden="true" data-spacer="" style={{ height }}>
      <td colSpan={colSpan} className="p-0" />
    </tr>
  );
}

/** A body row that holds a whole-table state (empty, filtered, error). */
export function StateRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        {children}
      </td>
    </tr>
  );
}
