/**
 * The board's month navigation (gap/04 C40): « a year back, ‹ a month back,
 * the month, › a month on, and Current month. A month after the vessel's
 * current one is never offered (the server refuses it, 22023
 * month_in_future). The arrows and the month stay on one line; Current
 * month wraps under them on a phone. 44 px targets on coarse pointers.
 */
import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { compareMonths, monthLabel, shiftMonth, type YearMonth } from '../../lib/horBoard';

export interface MonthNavProps {
  value: YearMonth;
  /** The vessel's current month: the latest one offered. */
  current: YearMonth;
  onChange: (month: YearMonth) => void;
  className?: string;
}

const navButton = 'h-9 w-9 shrink-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11';

export const MonthNav: React.FC<MonthNavProps> = ({ value, current, onChange, className }) => {
  const atCurrent = compareMonths(value, current) >= 0;
  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-x-1 gap-y-2', className)} data-month-nav="">
      <div className="flex min-w-0 items-center gap-1">
        <Button type="button" variant="outline" size="icon" className={navButton} aria-label="A year earlier" onClick={() => onChange(shiftMonth(value, -12))}>
          <ChevronsLeft aria-hidden="true" className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" className={navButton} aria-label="Previous month" onClick={() => onChange(shiftMonth(value, -1))}>
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        </Button>
        <h2 className="min-w-[8.5rem] whitespace-nowrap px-1 text-center type-h3 tabular-nums text-foreground" aria-live="polite">
          {monthLabel(value)}
        </h2>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={navButton}
          aria-label="Next month"
          disabled={atCurrent}
          onClick={() => onChange(shiftMonth(value, 1))}
        >
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="shrink-0 [@media(pointer:coarse)]:h-11"
        disabled={compareMonths(value, current) === 0}
        onClick={() => onChange(current)}
      >
        Current month
      </Button>
    </div>
  );
};

export default MonthNav;
