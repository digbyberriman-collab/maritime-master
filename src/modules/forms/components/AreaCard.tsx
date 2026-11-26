/**
 * One card of the Forms & Checklists overview (gap/02 FC1, FC7): the area,
 * where crews find its templates on board, and its counts on the vessels
 * in view (shown, customised, hidden; drafts for editors; overdue when run
 * tracking answers). The whole card opens the area page.
 *
 * Permits (FC7): the permit types and their checklists are configured with
 * Safety › Permits to Work (the safety stream's page); until that page
 * exists the card says it is planned, with no link.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/shared/components/status';
import { AREA_CREW_LOCATIONS } from '../lib/areaModel';
import { areaKeyLabel, plural, type AreaCounts } from '../lib/catalogueModel';

export interface AreaCardProps {
  counts: AreaCounts;
  href: string;
  /** Hidden counts are known (the per-vessel settings answered). */
  settingsKnown: boolean;
  /** Show the drafts count (editors). */
  showDrafts: boolean;
}

function Count({ value, label, muted }: { value: number | null; label: string; muted?: boolean }) {
  return (
    <span className={cn('inline-flex items-baseline gap-1', muted && 'text-muted-foreground')}>
      <span className="font-display text-lg font-semibold tabular-nums text-foreground">{value === null ? '–' : value.toLocaleString('en-GB')}</span>
      <span className="type-caption text-muted-foreground">{label}</span>
    </span>
  );
}

export function AreaCard({ counts, href, settingsKnown, showDrafts }: AreaCardProps) {
  const label = areaKeyLabel(counts.area);
  const where = counts.area === null ? 'Not on any vessel menu until each one is given an area.' : `Crew find these in ${AREA_CREW_LOCATIONS[counts.area]}.`;
  const empty = counts.offered === 0 && counts.drafts === 0;
  return (
    <li className="min-w-0">
      <Link
        to={href}
        aria-label={`${label}: ${plural(counts.shown, 'template')} shown`}
        className={cn(
          'group flex h-full min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors',
          'hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
      >
        <span className="flex min-w-0 items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate font-display text-base font-semibold text-foreground">{label}</span>
            <span className="mt-0.5 block type-body-sm text-muted-foreground">{where}</span>
          </span>
          <ChevronRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </span>
        {empty ? (
          <span className="type-body-sm text-muted-foreground">No templates yet</span>
        ) : (
          <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <Count value={counts.shown} label="shown" />
            <Count value={counts.customised} label="customised" />
            <Count value={settingsKnown ? counts.hidden : null} label="hidden" />
            {showDrafts && counts.drafts > 0 ? <Count value={counts.drafts} label={counts.drafts === 1 ? 'draft' : 'drafts'} muted /> : null}
          </span>
        )}
        {counts.overdue ? <StatusPill tone="danger" label={`${plural(counts.overdue, 'template')} overdue`} className="w-fit" /> : null}
        {counts.area === 'ptw' ? (
          <span className="flex flex-wrap items-center gap-2 border-t border-border pt-3 type-body-sm text-muted-foreground">
            <StatusPill tone="neutral" label="Planned" icon={null} />
            Permit types and their checklists are set up with Safety › Permits to Work.
          </span>
        ) : null}
      </Link>
    </li>
  );
}
