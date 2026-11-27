/**
 * The fleet dashboard's KPI row (gap/02 W9; D3–D8; gap/10 DS13, §A.9) on
 * `KpiTile`: Document alerts, Hours of rest, Leave overdue (not enabled,
 * D5 open), Safety, Technical and Finance (hidden, G1) from
 * `fleet_dashboard_kpis`, plus the open-alerts tile, which reads the alert
 * scope like the bell and the inbox (D-103) rather than the vessels shown.
 *
 * Every state is honest: skeletons while loading, "Not set up yet" while
 * the RPC is missing (D-01), "Could not load" with Retry on a failed read,
 * a tile the caller cannot read is hidden, a module switched off on every
 * vessel shown says so, and "All clear"-style zeros only for a real zero.
 * Each part of a tile's sub-text links to the report that holds what it
 * counts, with its bucket in the query; a tile whose parts do not link
 * opens its report as a whole. A link only when the report registry knows
 * the key (../../lib/fleetKpiRules.ts). 2-up below 1024 px, 6 across at 1440.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarX, Clock, Euro, FileText, ShieldAlert, Wrench, type LucideIcon } from 'lucide-react';
import { KpiGrid, KpiTile } from '@/shared/components/data/KpiTile';
import { alertKpiTileProps, type OpenAlertCountsState } from '../../hooks/useOpenAlertCounts';
import { cn } from '@/lib/utils';
import {
  buildFleetKpiTiles,
  fleetKpiTileOwnHref,
  type FleetKpiPartLink,
  type FleetKpisInput,
  type FleetKpiTileKey,
} from '../../lib/fleetKpiRules';

const PART_LINK = cn(
  'rounded-sm underline decoration-muted-foreground/50 underline-offset-4 transition-colors hover:text-foreground hover:decoration-current focus-ring',
  '[@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center',
);

/** On a coarse pointer each part is its own row (44 px link targets), so the " ·" separators go. */
const COARSE_ROW = '[@media(pointer:coarse)]:flex';
const COARSE_HIDDEN = '[@media(pointer:coarse)]:hidden';

/**
 * Sub-text parts that wrap between parts first: each part is one box, split
 * only when it alone is wider than the tile. A part with an `href` is a link
 * to the report that holds what it counts (gap/02 W9; fleetKpiPartLinks);
 * the others are plain text. On a coarse pointer the parts stack, one row
 * each. The fleet reports hub renders the same parts.
 */
export function KpiSubParts({ parts }: { parts: readonly FleetKpiPartLink[] }) {
  const last = parts.length - 1;
  return (
    <>
      {parts.map((part, i) => (
        <React.Fragment key={part.text}>
          <span className={cn('inline-block', COARSE_ROW)}>
            {part.href ? (
              <Link to={part.href} className={PART_LINK}>
                {part.text}
              </Link>
            ) : (
              part.text
            )}
            {i < last ? <span className={COARSE_HIDDEN}>{'\u00a0·'}</span> : null}
          </span>
          {i < last ? ' ' : null}
        </React.Fragment>
      ))}
    </>
  );
}

const ICONS: Readonly<Record<FleetKpiTileKey, LucideIcon>> = {
  documents: FileText,
  hours_of_rest: Clock,
  leave: CalendarX,
  safety: ShieldAlert,
  technical: Wrench,
  finance: Euro,
};

/** Where the open-alerts tile leads (the notification centre's Attention tab, D-62). */
const OPEN_ALERTS_HREF = '/notifications/center';

export interface FleetKpiRowProps {
  kpis: FleetKpisInput;
  /** Retry for the data tiles' error state. */
  onRetry?: () => void;
  alerts: OpenAlertCountsState & { retry: () => void };
  /** Report keys the report registry knows (a tile links only to these). */
  knownReportKeys: ReadonlySet<string>;
  /** `?vessels=` codes of a non-default "Vessels shown", carried into report links. */
  vesselsParam?: string | null;
}

export function FleetKpiRow({ kpis, onRetry, alerts, knownReportKeys, vesselsParam }: FleetKpiRowProps) {
  const tiles = buildFleetKpiTiles(kpis, { knownReportKeys, vesselsParam });
  const counts = alerts.counts;
  return (
    <section aria-label="Fleet indicators">
      <KpiGrid>
        {tiles.map((tile) => (
          <KpiTile
            key={tile.key}
            label={tile.label}
            icon={ICONS[tile.key]}
            value={tile.value}
            sub={tile.partLinks ? <KpiSubParts parts={tile.partLinks} /> : tile.sub}
            tone={tile.tone}
            href={fleetKpiTileOwnHref(tile)}
            state={tile.state}
            zeroLabel={tile.zeroLabel}
            notEnabledReason={tile.notEnabledReason}
            errorMessage={tile.errorMessage}
            onRetry={tile.state === 'error' ? onRetry : undefined}
          />
        ))}
        <KpiTile
          label="Open alerts"
          icon={AlertTriangle}
          value={counts?.total}
          {...alertKpiTileProps(alerts)}
          tone={counts && counts.RED > 0 ? 'danger' : counts && counts.ORANGE > 0 ? 'orange' : undefined}
          sub={counts ? `${counts.RED} red · ${counts.ORANGE} orange · ${counts.YELLOW} yellow` : undefined}
          href={OPEN_ALERTS_HREF}
        />
      </KpiGrid>
    </section>
  );
}

export default FleetKpiRow;
