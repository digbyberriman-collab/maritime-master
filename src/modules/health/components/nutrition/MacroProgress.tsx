import React from 'react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface MacroProgressProps {
  label: string;
  current: number;
  target: number | null | undefined;
  unit: string;
  /** Going over is a problem for calories, but not for water or fibre. */
  overIsWarning?: boolean;
  className?: string;
}

/** One target with its bar, used on the overview and in the food log. */
export const MacroProgress: React.FC<MacroProgressProps> = ({
  label,
  current,
  target,
  unit,
  overIsWarning = true,
  className,
}) => {
  const rounded = Math.round(current);
  const hasTarget = Boolean(target && target > 0);
  const pct = hasTarget ? Math.min(100, Math.round((current / (target as number)) * 100)) : 0;
  const over = hasTarget && current > (target as number);
  const remaining = hasTarget ? Math.round((target as number) - current) : null;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-xs text-foreground">
          {rounded}
          {hasTarget ? ` / ${target}` : ''} {unit}
        </span>
      </div>
      <Progress
        value={pct}
        className={cn(
          'h-2',
          over && overIsWarning && '[&>div]:bg-warning',
          over && !overIsWarning && '[&>div]:bg-success',
        )}
      />
      <p
        className={cn(
          'text-[11px]',
          over && overIsWarning ? 'text-warning' : 'text-muted-foreground',
        )}
      >
        {!hasTarget
          ? 'No target set'
          : over
            ? `${Math.abs(remaining as number)} ${unit} over`
            : `${remaining} ${unit} to go`}
      </p>
    </div>
  );
};

export const MacroProgressGrid: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>{children}</div>;

export default MacroProgress;
