import * as React from 'react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { isCalendarDate } from '@/lib/records/dates';
import { ARCHIVED_ICON } from './copy';
import { EmptyState } from './EmptyState';

export interface VesselArchivedProps {
  vesselName?: string;
  /** `yyyy-MM-dd` (or an ISO timestamp; its date part is used). */
  archivedOn?: string | null;
  /** `page` replaces the page; `banner` sits above a read-only page. */
  variant?: 'page' | 'banner';
  /** E.g. "Back to fleet", or "Restore" for the owner. */
  action?: React.ReactNode;
  headingLevel?: 1 | 2 | 3 | 4;
  className?: string;
}

const formatDay = (value: string | null | undefined): string | null => {
  const day = value ? value.slice(0, 10) : '';
  if (!isCalendarDate(day)) return null;
  const [y, m, d] = day.split('-').map(Number);
  return format(new Date(y, m - 1, d), 'dd MMM yyyy');
};

/**
 * An archived vessel (gap/01 F10: read-only, hidden from switchers, restore
 * by the account owner). The banner variant keeps the page readable for
 * audits while saying why nothing can be added.
 */
export function VesselArchived({
  vesselName,
  archivedOn,
  variant = 'page',
  action,
  headingLevel = 1,
  className,
}: VesselArchivedProps) {
  const name = vesselName ?? 'This vessel';
  const day = formatDay(archivedOn);
  const when = day ? ` on ${day}` : '';

  if (variant === 'banner') {
    const Icon = ARCHIVED_ICON;
    return (
      <div
        role="status"
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-warning/40 bg-warning-muted px-3 py-2 text-sm text-warning',
          className,
        )}
      >
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          <strong className="font-semibold">
            {name} was archived{when}.
          </strong>{' '}
          Records are read-only.
        </span>
        {action}
      </div>
    );
  }

  return (
    <EmptyState
      kind="not-enabled"
      icon={ARCHIVED_ICON}
      title={`${name} is archived`}
      body={`It was archived${when} and is read-only. Its records stay available for audits and exports; an account owner can restore it.`}
      action={action}
      headingLevel={headingLevel}
      className={className}
    />
  );
}
