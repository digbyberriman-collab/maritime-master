import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

/**
 * A small segmented choice (show all / on board, by department / one list,
 * matrix / cards): buttons with aria-pressed in a labelled group, 32 px and
 * 44 px on touch screens, visible focus.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex shrink-0 rounded-md border border-input bg-card p-0.5', className)}>
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'focus-ring inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 text-xs font-medium transition-colors duration-quick [@media(pointer:coarse)]:h-11',
              active ? 'bg-signal-muted text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {Icon ? <Icon aria-hidden="true" className="h-3.5 w-3.5" /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
