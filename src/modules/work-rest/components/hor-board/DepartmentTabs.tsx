/**
 * The board's department tabs (gap/04 C40): All, then one per department on
 * the board in the department catalogue's order, people without one last
 * as Other (lib/horBoard.ts departmentTabs). A tab is a toggle button
 * (aria-pressed) that sets `?dept=`; the row scrolls sideways at phone
 * width instead of wrapping.
 */
import React from 'react';
import { cn } from '@/lib/utils';
import type { DepartmentTab } from '../../lib/horBoard';

export interface DepartmentTabsProps {
  tabs: readonly DepartmentTab[];
  /** The selected tab's key ('all' when none). */
  value: string;
  onChange: (key: string) => void;
  className?: string;
}

const tabClass = (active: boolean) =>
  cn(
    'relative inline-flex h-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-3 type-body font-medium transition-colors duration-quick ease-tide',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
    'after:pointer-events-none after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:transition-transform after:duration-indicator after:ease-tide',
    active ? 'text-foreground after:scale-x-100' : 'text-muted-foreground after:scale-x-0 hover:text-foreground',
  );

export const DepartmentTabs: React.FC<DepartmentTabsProps> = ({ tabs, value, onChange, className }) => (
  <div
    role="group"
    aria-label="Departments"
    className={cn(
      'flex h-11 max-w-full items-stretch gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain shadow-[inset_0_-1px_0_0_hsl(var(--border))] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      className,
    )}
    data-department-tabs=""
  >
    {tabs.map((t) => {
      const active = t.key === value;
      return (
        <button key={t.key} type="button" aria-pressed={active} className={tabClass(active)} onClick={() => onChange(t.key)} data-dept={t.key}>
          {t.label}
          <span className="type-caption tabular-nums text-muted-foreground">{t.count}</span>
        </button>
      );
    })}
  </div>
);

export default DepartmentTabs;
