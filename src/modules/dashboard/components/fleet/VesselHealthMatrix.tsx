/**
 * Vessel health matrix (gap/02 D15, §4.1, §4.3; X5 spec X5-02B): one row
 * per vessel shown from `fleet_vessel_comparison`, one column per area
 * (Documents, Safety, Technical, Insurance, Hours of rest), on the shared
 * `MatrixGrid` (sticky vessel column, crosshair). It is the preview of the
 * Vessel comparison report: "Compare all vessels" opens it once the report
 * registry knows `vessel-comparison`.
 *
 * - A cell is the area's count with a tone dot: danger for anything
 *   expired or overdue, warn for something coming up, ok for a real zero.
 *   A group the caller cannot count (no access, or the module off on that
 *   vessel) is "–" with no tone, never 0.
 * - Rows: vessels with the most red cells first, then amber, then by name.
 * - The grid scrolls inside its own card (both ways), never the page;
 *   columns are narrower on a phone so two fit beside the vessel names.
 * - States: skeleton rows while loading; "not set up yet" while the RPC is
 *   missing (D-01); an error with Retry; nothing invented.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONE_FILL, TONE_TEXT, type Tone } from '@/components/ui/tones';
import { MatrixGrid, type MatrixColumn } from '@/shared/components/data/MatrixGrid';
import { PageEmpty } from '@/shared/components/states';
import { TABLET_MIN_WIDTH, useMinWidth } from '@/shared/components/data/useMinWidth';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import type { FleetDashboardState, FleetVesselComparison } from '../../hooks/useFleetDashboard';

type Area = 'documents' | 'safety' | 'technical' | 'insurance' | 'hours_of_rest';

const COLUMNS: readonly (MatrixColumn & { id: Area })[] = [
  { id: 'documents', label: 'Documents', title: 'Document alerts' },
  { id: 'safety', label: 'Safety', title: 'Corrective actions and drills' },
  { id: 'technical', label: 'Technical', title: 'Overdue and pending jobs' },
  { id: 'insurance', label: 'Insurance', title: 'Insurance renewals' },
  { id: 'hours_of_rest', label: 'Hours of rest', title: 'Hours of rest breach days (30 days)' },
];

/** Column width: wide enough to fill the card on a desktop, narrow enough to show two columns on a phone. */
const COLUMN_WIDTH = { wide: 168, narrow: 96 } as const;

/** One cell: a count, its tone and what it is made of. `value` null: not covered. */
interface Cell {
  value: number | null;
  tone: Tone | null;
  detail: string;
}

const NOT_COVERED: Cell = { value: null, tone: null, detail: 'Not covered: no access, or the module is off on this vessel' };

const n = (v: number) => v.toLocaleString('en-GB');
const parts = (list: Array<[number | null, string]>): string =>
  list
    .filter(([v]) => v !== null)
    .map(([v, label]) => `${n(v as number)} ${label}`)
    .join(', ');

function cellOf(row: FleetVesselComparison, area: Area): Cell {
  switch (area) {
    case 'documents': {
      const g = row.documents;
      if (!g) return NOT_COVERED;
      const bad = g.expired + g.endorsements_overdue;
      return {
        value: g.value,
        tone: bad > 0 ? 'danger' : g.expiring > 0 ? 'warn' : 'ok',
        detail: parts([
          [g.expired, 'expired'],
          [g.endorsements_overdue, 'endorsements overdue'],
          [g.expiring, 'expiring'],
        ]),
      };
    }
    case 'safety': {
      const g = row.safety;
      if (!g || (g.open_corrective_actions === null && g.overdue_drills === null)) return NOT_COVERED;
      const overdue = (g.overdue_corrective_actions ?? 0) + (g.overdue_drills ?? 0);
      const value = (g.open_corrective_actions ?? 0) + (g.overdue_drills ?? 0);
      return {
        value,
        tone: overdue > 0 ? 'danger' : value > 0 ? 'warn' : 'ok',
        detail: parts([
          [g.open_corrective_actions, 'open actions'],
          [g.overdue_corrective_actions, 'overdue actions'],
          [g.overdue_drills, 'overdue drills'],
        ]),
      };
    }
    case 'technical': {
      const g = row.technical;
      if (!g) return NOT_COVERED;
      return {
        value: g.overdue_jobs + g.pending_approval,
        tone: g.overdue_jobs > 0 ? 'danger' : g.pending_approval > 0 ? 'warn' : 'ok',
        detail: parts([
          [g.overdue_jobs, 'overdue jobs'],
          [g.pending_approval, 'awaiting approval'],
          [g.open_jobs, 'open jobs'],
        ]),
      };
    }
    case 'insurance': {
      const g = row.insurance;
      if (!g) return NOT_COVERED;
      return {
        value: g.expired + g.expiring,
        tone: g.expired > 0 ? 'danger' : g.expiring > 0 ? 'warn' : 'ok',
        detail: parts([
          [g.expired, 'expired'],
          [g.expiring, 'expiring'],
        ]),
      };
    }
    case 'hours_of_rest': {
      const g = row.hours_of_rest;
      if (!g) return NOT_COVERED;
      return {
        value: g.breach_days,
        tone: g.breach_days > 0 ? 'danger' : g.near_threshold + g.crew_without_entries > 0 ? 'warn' : 'ok',
        detail: parts([
          [g.breach_days, 'breach days'],
          [g.near_threshold, 'near the limit'],
          [g.crew_without_entries, 'with no entries'],
        ]),
      };
    }
  }
}

/** Most red cells first, then amber, then by name. */
function bySeverity(rows: readonly FleetVesselComparison[]): FleetVesselComparison[] {
  const score = (row: FleetVesselComparison) => {
    let danger = 0;
    let warn = 0;
    for (const c of COLUMNS) {
      const tone = cellOf(row, c.id).tone;
      if (tone === 'danger') danger += 1;
      else if (tone === 'warn') warn += 1;
    }
    return { danger, warn };
  };
  return [...rows]
    .map((row) => ({ row, ...score(row) }))
    .sort((a, b) => b.danger - a.danger || b.warn - a.warn || a.row.vessel_name.localeCompare(b.row.vessel_name, 'en-GB'))
    .map((x) => x.row);
}

function CellView({ cell, label }: { cell: Cell; label: string }) {
  if (cell.value === null) {
    return (
      <span className="text-sm text-muted-foreground" title={cell.detail}>
        –<span className="sr-only">{`${label}: not covered`}</span>
      </span>
    );
  }
  const tone = cell.tone ?? 'neutral';
  return (
    <span className="inline-flex items-center justify-center gap-1.5" title={cell.detail || undefined}>
      <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', TONE_FILL[tone])} />
      <span className={cn('text-sm tabular-nums', tone === 'danger' ? cn('font-semibold', TONE_TEXT.danger) : 'text-foreground')}>
        {n(cell.value)}
      </span>
      <span className="sr-only">{`${label}${cell.detail ? `: ${cell.detail}` : ''}`}</span>
    </span>
  );
}

function Legend() {
  const items: Array<[Tone | null, string]> = [
    ['danger', 'Expired or overdue'],
    ['warn', 'Coming up'],
    ['ok', 'Clear'],
    [null, 'Not covered'],
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 type-caption text-muted-foreground" aria-label="Legend">
      {items.map(([tone, text]) => (
        <li key={text} className="inline-flex items-center gap-1.5">
          {tone ? <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', TONE_FILL[tone])} /> : <span aria-hidden="true">–</span>}
          {text}
        </li>
      ))}
    </ul>
  );
}

export interface VesselHealthMatrixProps {
  state: FleetDashboardState<FleetVesselComparison[]>;
  /** "Compare all vessels": the Vessel comparison report, or null while the registry does not know it (no link). */
  compareHref: string | null;
}

export function VesselHealthMatrix({ state, compareHref }: VesselHealthMatrixProps) {
  const headingId = React.useId();
  const wide = useMinWidth(TABLET_MIN_WIDTH);
  const columns = React.useMemo(
    () => COLUMNS.map((c) => ({ ...c, width: wide ? COLUMN_WIDTH.wide : COLUMN_WIDTH.narrow })),
    [wide],
  );
  const rows = React.useMemo(() => (state.state === 'ready' ? bySeverity(state.data) : []), [state]);

  let body: React.ReactNode;
  if (state.state === 'not_set_up') {
    body = (
      <PageEmpty
        icon={LayoutGrid}
        title="The health matrix is not set up yet"
        body="Each vessel's documents, safety, technical, insurance and hours of rest appear here once the fleet dashboard is set up for your account."
        headingLevel={3}
        bordered
        compact
      />
    );
  } else {
    body = (
      <MatrixGrid<FleetVesselComparison, Cell>
        label="Vessel health matrix"
        noun={{ one: 'vessel', other: 'vessels' }}
        rows={rows}
        getRowId={(row) => row.vessel_id}
        rowLabel={(row) => row.vessel_name}
        renderRowHeader={(row) =>
          row.vessel_code ? (
            <Link
              to={vesselPath(row.vessel_code, '')}
              className="-mx-1 inline-flex min-h-8 items-center rounded-sm px-1 hover:underline focus-ring [@media(pointer:coarse)]:min-h-11"
            >
              {row.vessel_name}
            </Link>
          ) : (
            row.vessel_name
          )
        }
        rowHeader="Vessel"
        columns={columns}
        getValue={(row, column) => cellOf(row, column.id as Area)}
        renderCell={(context) => <CellView cell={context.value} label={context.label} />}
        searchable={rows.length > 8}
        showDensityToggle={false}
        isLoading={state.state === 'loading' || state.state === 'idle'}
        error={state.state === 'error' ? state.error : undefined}
        onRetry={state.state === 'error' ? state.retry : undefined}
        empty={{ title: 'No vessels to compare' }}
        legend={<Legend />}
        maxHeight="26rem"
      />
    );
  }

  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id={headingId} className="type-title text-foreground">
            Vessel health
          </h2>
          <p className="text-sm text-muted-foreground">Each vessel shown, area by area. Worst first.</p>
        </div>
        {compareHref ? (
          <Link
            to={compareHref}
            className="inline-flex min-h-9 items-center gap-1 rounded-sm px-1 text-sm font-medium text-primary underline-offset-2 hover:underline focus-ring [@media(pointer:coarse)]:min-h-11"
          >
            Compare all vessels
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
      {body}
    </section>
  );
}

export default VesselHealthMatrix;
