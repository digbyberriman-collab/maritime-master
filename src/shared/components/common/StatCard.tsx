import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type StatTone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary';

const TONE_VALUE_CLASS: Record<StatTone, string> = {
  default: 'text-foreground',
  success: 'text-emerald-600',
  warning: 'text-amber-600',
  danger: 'text-destructive',
  info: 'text-sky-600',
  primary: 'text-primary',
};

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: StatTone;
  /** Optional helper line shown beneath the value (e.g. "In your fleet"). */
  hint?: React.ReactNode;
  /** Optional click handler. Makes the card behave like a button. */
  onClick?: () => void;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  tone = 'default',
  hint,
  onClick,
  className,
}) => (
  <Card
    className={cn(
      onClick &&
        'cursor-pointer transition hover:shadow-md hover:border-primary/40',
      className,
    )}
    onClick={onClick}
  >
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">
        {label}
      </CardTitle>
      {icon}
    </CardHeader>
    <CardContent>
      <div className={cn('text-2xl font-bold', TONE_VALUE_CLASS[tone])}>
        {value}
      </div>
      {hint && (
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      )}
    </CardContent>
  </Card>
);

interface StatGridProps {
  children: React.ReactNode;
  /** Number of columns at the largest breakpoint. Defaults to 4. */
  cols?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}

const COLS_CLASS: Record<NonNullable<StatGridProps['cols']>, string> = {
  2: 'grid grid-cols-1 sm:grid-cols-2 gap-4',
  3: 'grid grid-cols-2 md:grid-cols-3 gap-4',
  4: 'grid grid-cols-2 md:grid-cols-4 gap-4',
  5: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4',
  6: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4',
};

export const StatGrid: React.FC<StatGridProps> = ({ children, cols = 4, className }) => (
  <div className={cn(COLS_CLASS[cols], className)}>{children}</div>
);

export default StatCard;
