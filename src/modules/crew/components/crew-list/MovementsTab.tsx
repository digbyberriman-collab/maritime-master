import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, Download, History, Loader2, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable, type DataTableColumn } from '@/shared/components/data';
import { PageEmpty } from '@/shared/components/states';
import { runExport, notifyExportResult, type ExportColumn } from '@/lib/export';
import { useCrewMovements } from '@/modules/crew/hooks/useCrewMovements';
import type { CrewListVessel } from '@/modules/crew/hooks/useVesselCrewList';
import {
  daysBetween,
  isDay,
  MOVEMENT_KIND_LABEL,
  MOVEMENT_RANGE_MAX_DAYS,
  MOVEMENT_SOURCE_LABEL,
  type CrewMovement,
  type MovementRange,
} from '@/modules/crew/lib/crewListModel';
import { ROW_BUTTON } from './CrewTable';

const NOUN = { one: 'movement', other: 'movements' };

const fmtDay = (day: string) => {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return y && m && d ? format(new Date(y, m - 1, d), 'd MMM yyyy') : day;
};

const KIND_ICON: Record<CrewMovement['kind'], LucideIcon> = {
  embark: ArrowDownToLine,
  disembark: ArrowUpFromLine,
  transfer_in: ArrowRightLeft,
  transfer_out: ArrowRightLeft,
};

const COLUMNS: DataTableColumn<CrewMovement>[] = [
  {
    id: 'date',
    header: 'Date',
    kind: 'date',
    value: (m) => m.occurredOn,
    sortDescFirst: true,
    cell: (m) => fmtDay(m.occurredOn),
  },
  {
    id: 'person',
    header: 'Crew member',
    sticky: true,
    minWidth: 170,
    value: (m) => m.displayName,
    cell: (m) => (
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-foreground">{m.displayName}</span>
        {m.positionText ? <span className="truncate type-caption text-muted-foreground">{m.positionText}</span> : null}
      </div>
    ),
  },
  {
    id: 'event',
    header: 'Event',
    value: (m) => MOVEMENT_KIND_LABEL[m.kind],
    cell: (m) => {
      const Icon = KIND_ICON[m.kind];
      return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          {MOVEMENT_KIND_LABEL[m.kind]}
        </span>
      );
    },
  },
  { id: 'port', header: 'Port', value: (m) => m.port, emptyReason: 'No port recorded' },
  { id: 'source', header: 'Source', value: (m) => MOVEMENT_SOURCE_LABEL[m.source], sortable: false },
];

const EXPORT_COLUMNS: ExportColumn<CrewMovement>[] = [
  { key: 'occurred_on', header: 'Date', kind: 'date', value: (m) => m.occurredOn },
  { key: 'crew_member', header: 'Crew member', value: (m) => m.displayName },
  { key: 'position', header: 'Position', value: (m) => m.positionText },
  { key: 'event', header: 'Event', value: (m) => MOVEMENT_KIND_LABEL[m.kind] },
  { key: 'port', header: 'Port', value: (m) => m.port },
  { key: 'source', header: 'Source', value: (m) => MOVEMENT_SOURCE_LABEL[m.source] },
  { key: 'notes', header: 'Notes', value: (m) => m.notes },
];

interface MovementsTabProps {
  vessel: CrewListVessel & { code: string | null; name: string };
  range: MovementRange;
  onRangeChange: (range: MovementRange) => void;
  /** The crew list itself is the basic D-01 list: the movements are not set up either. */
  notSetUp: boolean;
  /** The crew list has not said yet whether it is set up: wait (shown as loading) instead of asking twice. */
  listPending?: boolean;
  canExport: boolean;
}

/** Why a typed range cannot be used, or null. */
function rangeProblem(from: string, to: string): string | null {
  if (!isDay(from) || !isDay(to)) return 'Choose a start and an end date.';
  if (daysBetween(from, to) < 0) return 'The end date is before the start date.';
  if (daysBetween(from, to) > MOVEMENT_RANGE_MAX_DAYS) return 'Choose a range of three years or less.';
  return null;
}

/**
 * The vessel's crew movements (gap/04 C9): joins, departures and transfers
 * in a date range kept in the URL (`from`, `to`), newest first, with a CSV
 * export (logged first, personal data). While the server part is not live
 * (D-01) the tab says so instead of showing an empty list that would read
 * as "no movements".
 */
export const MovementsTab: React.FC<MovementsTabProps> = ({ vessel, range, onRangeChange, notSetUp, listPending = false, canExport }) => {
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    setFrom(range.from);
    setTo(range.to);
  }, [range.from, range.to]);
  const problem = rangeProblem(from, to);

  // Idle (shown as loading) until the crew list knows whether the crew update is applied.
  const state = useCrewMovements(vessel, range, { enabled: !notSetUp && !listPending });

  const commit = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    if (!rangeProblem(nextFrom, nextTo)) onRangeChange({ from: nextFrom, to: nextTo });
  };

  const movements = useMemo(() => (state.status === 'ready' ? state.movements : []), [state]);

  if (notSetUp || state.status === 'not-set-up') {
    return (
      <PageEmpty
        icon={History}
        title="Movements are not set up yet"
        body="Joins, departures and transfers appear here once the crew update is applied."
        data-movements-state="not-set-up"
      />
    );
  }

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await runExport({
        format: 'csv',
        kind: 'Crew movements',
        sourceKey: 'crew.crew_movements',
        personalData: true,
        vesselId: vessel.id,
        vesselCode: vessel.code,
        columns: EXPORT_COLUMNS,
        rows: movements,
        range: { from: range.from, to: range.to },
        params: { from: range.from, to: range.to },
      });
      notifyExportResult(result);
    } finally {
      setExporting(false);
    }
  };

  return (
    <section aria-label="Crew movements" className="space-y-3" data-movements-state={state.status}>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="grid grid-cols-2 gap-3 sm:flex sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="crew-movements-from">From</Label>
            <Input
              id="crew-movements-from"
              type="date"
              value={from}
              onChange={(event) => commit(event.target.value, to)}
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? 'crew-movements-range-problem' : undefined}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="crew-movements-to">To</Label>
            <Input
              id="crew-movements-to"
              type="date"
              value={to}
              onChange={(event) => commit(from, event.target.value)}
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? 'crew-movements-range-problem' : undefined}
            />
          </div>
        </div>
        {canExport ? (
          <Button
            type="button"
            variant="outline"
            className={`sm:ml-auto ${ROW_BUTTON}`}
            onClick={() => void handleExport()}
            disabled={exporting || state.status !== 'ready' || movements.length === 0}
          >
            {exporting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Download aria-hidden="true" />}
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        ) : null}
      </div>
      {problem ? (
        <p id="crew-movements-range-problem" className="type-body-sm text-destructive" role="alert">
          {problem}
        </p>
      ) : null}

      <DataTable<CrewMovement>
        label="Crew movements"
        noun={NOUN}
        data={movements}
        columns={COLUMNS}
        getRowId={(m) => m.key}
        isLoading={state.status === 'loading' || state.status === 'idle'}
        error={state.status === 'error' ? state.error : undefined}
        onRetry={state.status === 'error' ? state.retry : undefined}
        empty={{
          title: 'No movements in this period',
          body: 'Joins and departures from the crew assignments, and any recorded movements, show here. Choose a wider range to see more.',
          icon: History,
        }}
        searchPlaceholder="Search crew member or port"
        defaultSort={{ columnId: 'date', direction: 'desc' }}
        showDensityToggle={false}
      />
    </section>
  );
};

export default MovementsTab;
