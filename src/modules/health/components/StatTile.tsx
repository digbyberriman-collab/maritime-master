import React from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export type StatTone = 'default' | 'good' | 'warning' | 'critical';

const toneClass: Record<StatTone, string> = {
  default: 'bg-primary/10 text-primary',
  good: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  critical: 'bg-destructive/10 text-destructive',
};

interface StatTileProps {
  icon: LucideIcon;
  label: string;
  value: number | string | null;
  hint?: string;
  tone?: StatTone;
  to?: string;
}

/** One number on a health dashboard, optionally linking to the page behind it. */
export const StatTile: React.FC<StatTileProps> = ({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'default',
  to,
}) => {
  const body = (
    <>
      <div className={cn('rounded-md p-2', toneClass[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        {value === null ? (
          <Skeleton className="h-7 w-10" />
        ) : (
          <p className="text-2xl font-semibold leading-none text-foreground">{value}</p>
        )}
        <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
        {hint && <p className="truncate text-[11px] text-muted-foreground/80">{hint}</p>}
      </div>
    </>
  );
  const className =
    'flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
};

export const StatGrid: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-4', className)}>{children}</div>
);

export default StatTile;
