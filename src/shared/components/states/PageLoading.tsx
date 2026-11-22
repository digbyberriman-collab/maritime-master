import * as React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { SLOW_LOADING_AFTER_MS, SLOW_LOADING_MESSAGE } from './copy';

export interface PageLoadingProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Skeleton that matches the page being loaded. */
  variant?: 'list' | 'tiles' | 'cards' | 'detail';
  /** Rows (list) or items (tiles, cards). */
  rows?: number;
  /** Screen-reader text. */
  label?: string;
  /** Show the "still loading" note after this many ms; `null` never shows it. */
  slowAfterMs?: number | null;
  slowMessage?: React.ReactNode;
}

function Skeletons({ variant, rows }: { variant: NonNullable<PageLoadingProps['variant']>; rows: number }) {
  const items = Array.from({ length: rows });
  if (variant === 'tiles') {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 min-[1440px]:grid-cols-6">
        {items.map((_, i) => (
          <div key={i} className="min-h-[132px] space-y-3 rounded-lg border bg-card p-4 shadow-sm">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
    );
  }
  if (variant === 'cards') {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (variant === 'detail') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 w-full rounded-lg lg:col-span-2" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full" />
      {items.map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

/**
 * Page loading body (gap/10 §A.12): a skeleton shaped like the final layout,
 * never a bare spinner. After `slowAfterMs` it adds a "still loading" note
 * so a slow link at sea does not look like a hang. Shimmer stops under
 * reduced motion (global rule in index.css).
 */
export const PageLoading = React.forwardRef<HTMLDivElement, PageLoadingProps>(
  (
    {
      variant = 'list',
      rows,
      label = 'Loading',
      slowAfterMs = SLOW_LOADING_AFTER_MS,
      slowMessage = SLOW_LOADING_MESSAGE,
      className,
      ...props
    },
    ref,
  ) => {
    const [slow, setSlow] = React.useState(false);
    React.useEffect(() => {
      if (slowAfterMs === null || slowAfterMs === undefined) return undefined;
      const timer = window.setTimeout(() => setSlow(true), slowAfterMs);
      return () => window.clearTimeout(timer);
    }, [slowAfterMs]);

    const count = rows ?? (variant === 'tiles' ? 6 : 3);

    return (
      <div ref={ref} role="status" aria-busy="true" className={cn('space-y-3', className)} {...props}>
        <span className="sr-only">{label}</span>
        <div aria-hidden="true">
          <Skeletons variant={variant} rows={count} />
        </div>
        {slow ? <p className="text-sm text-muted-foreground">{slowMessage}</p> : null}
      </div>
    );
  },
);
PageLoading.displayName = 'PageLoading';
