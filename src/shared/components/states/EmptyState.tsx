import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EMPTY_STATE_DEFAULTS, type EmptyStateKind } from './copy';

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** `first-use` (default), `filtered`, `not-enabled`, `no-access` or `error`. */
  kind?: EmptyStateKind;
  title?: React.ReactNode;
  body?: React.ReactNode;
  icon?: LucideIcon;
  /** The primary action. Only pass it when the user can actually perform it. */
  action?: React.ReactNode;
  /** A secondary line or link under the action (e.g. an error reference). */
  secondary?: React.ReactNode;
  /** Heading level for the title (2 by default; 1 when the state is the whole page). */
  headingLevel?: 1 | 2 | 3 | 4;
  /** Dashed outline, for an empty state that sits in place of a list or card. */
  bordered?: boolean;
  /** Tighter spacing and a smaller icon, for use inside cards and tables. */
  compact?: boolean;
}

/**
 * The one empty / not-enabled / no-access / error body (gap/10 §A.12):
 * centred, icon in a muted circle, a title that says what is missing, one
 * line of body, and the action that fixes it when the user may take it.
 */
export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    { kind = 'first-use', title, body, icon, action, secondary, headingLevel = 2, bordered, compact, className, ...props },
    ref,
  ) => {
    const defaults = EMPTY_STATE_DEFAULTS[kind] ?? EMPTY_STATE_DEFAULTS['first-use'];
    const Icon = icon ?? defaults.icon;
    const Heading = `h${headingLevel}` as const;
    const bodyContent = body === undefined ? defaults.body : body;

    return (
      <div
        ref={ref}
        role={defaults.role}
        data-kind={kind}
        className={cn(
          'flex flex-col items-center justify-center text-center',
          compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-10',
          bordered && 'rounded-lg border border-dashed border-border',
          className,
        )}
        {...props}
      >
        <div
          aria-hidden="true"
          className={cn(
            'flex shrink-0 items-center justify-center rounded-full bg-muted',
            compact ? 'h-12 w-12' : 'h-[72px] w-[72px]',
          )}
        >
          <Icon
            className={cn(compact ? 'h-6 w-6' : 'h-10 w-10', kind === 'error' ? 'text-critical' : 'text-muted-foreground')}
            strokeWidth={1.75}
          />
        </div>
        <Heading className="type-subtitle max-w-md text-foreground">{title ?? defaults.title}</Heading>
        {bodyContent ? <div className="max-w-md text-sm text-muted-foreground">{bodyContent}</div> : null}
        {action ? <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
        {secondary ? <div className="text-xs text-muted-foreground">{secondary}</div> : null}
      </div>
    );
  },
);
EmptyState.displayName = 'EmptyState';
