/**
 * Fleet › Reports › Overdue drills (`/fleet/reports/overdue-drills`; gap/02
 * R7; X5 spec X5-10B). The drills that are overdue on the vessels shown,
 * from `fleet_report_overdue_drills` (041000), one row per fact:
 *
 * - Missed: a scheduled drill not carried out by its date (the fleet
 *   dashboard's overdue drills: the same rows, so its "View all" lands on
 *   the same number).
 * - Past its interval: a required drill type (SOLAS or company) whose
 *   interval has run out since the last drill of that type carried out.
 * - Due soon (within 7 days) and No drill on record: further Show options
 *   (more status options than the reference, T-248).
 *
 * Filters in the URL: Show (`?show=`, default overdue: missed or past the
 * interval) and Category (`?category=`). KPI tiles count each kind and link
 * to it; the rule behind each kind is written in "How drills are counted".
 * Rows link to the vessel's Drills page. Vessels where Safety is off or the
 * reader cannot see drills are named in "Not covered", never 0.
 *
 * D-01: while the RPC is missing, "This report is not set up yet"; any other
 * error with Retry. Below 768 px one card per row. Export: the rows on
 * screen.
 */
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CalendarX2, ClipboardX, Siren } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import type { DataTableColumn } from '@/shared/components/data/DataTable';
import { KpiGrid, KpiTile } from '@/shared/components/data/KpiTile';
import { StatusPill } from '@/shared/components/status/StatusPill';
import { ReportShell, ReportTable } from '../components/ReportShell';
import { CoverageNote, CrewReportGate, ShownVesselsToolbar } from '../components/CrewReportParts';
import { RulesDisclosure, VesselCell } from '../components/OpsReportParts';
import { reportsKeys } from '../hooks/keys';
import { useOverdueDrills } from '../hooks/useOpsReports';
import { useReportFilters } from '../hooks/useReportFilters';
import { useShownReportScope } from '../hooks/useShownReportScope';
import { formatDay } from '../lib/crewReports';
import { writeReportFilters } from '../lib/reportFilters';
import {
  DRILL_FILTERS,
  DRILL_KINDS,
  DRILL_KIND_META,
  drillCategoryLabel,
  drillExportColumns,
  drillRows,
  dueText,
  frequencyText,
  tallyDrills,
  tidyWord,
  vesselLabeller,
} from '../lib/opsReports';
import type { ReportComponentProps } from '../registry';
import type { OverdueDrillRow, ReportVesselCoverage } from '../types/db.pending';

const DRILLS_REL = 'safety/drills';
const rowId = (r: OverdueDrillRow) => r.drill_id ?? `${r.kind}:${r.vessel_id}:${r.drill_type_id}`;

function KindPill({ row, withStatus = false }: { row: OverdueDrillRow; withStatus?: boolean }) {
  const meta = DRILL_KIND_META[row.kind];
  const status = withStatus && row.kind === 'missed' ? tidyWord(row.status) : null;
  if (!status) return <StatusPill tone={meta.tone} label={meta.label} />;
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusPill tone={meta.tone} label={meta.label} />
      <span className="text-xs text-muted-foreground">Still marked {status}</span>
    </div>
  );
}

function DrillCell({ row }: { row: OverdueDrillRow }) {
  return (
    <div className="min-w-0">
      <div className="font-medium text-foreground">{row.drill_type}</div>
      <div className="truncate text-xs text-muted-foreground">
        {[drillCategoryLabel(row.category), row.solas_reference, row.drill_number].filter(Boolean).join(' · ')}
      </div>
    </div>
  );
}

function DueCell({ row }: { row: OverdueDrillRow }) {
  if (!row.due_on) return <span className="text-muted-foreground">No due day: never carried out</span>;
  const overdue = row.days_overdue !== null && row.days_overdue > 0;
  return (
    <div className="flex flex-col">
      <span className="whitespace-nowrap">{formatDay(row.due_on)}</span>
      <span className={cn('text-xs', overdue ? 'font-medium text-critical' : 'text-muted-foreground')}>{dueText(row.days_overdue)}</span>
    </div>
  );
}

function lastText(row: OverdueDrillRow): string {
  return row.last_done_on ? formatDay(row.last_done_on) ?? '' : 'Never';
}

function columns(vesselOf: (id: string) => ReportVesselCoverage | undefined): DataTableColumn<OverdueDrillRow>[] {
  return [
    {
      id: 'vessel',
      header: 'Vessel',
      sticky: true,
      minWidth: 140,
      value: (r) => vesselOf(r.vessel_id)?.vessel_name ?? '',
      cell: (r) => <VesselCell vessel={vesselOf(r.vessel_id)} rel={DRILLS_REL} noVessel="Vessel" />,
    },
    { id: 'drill', header: 'Drill', minWidth: 200, value: (r) => r.drill_type, cell: (r) => <DrillCell row={r} /> },
    { id: 'why', header: 'Why listed', minWidth: 150, value: (r) => DRILL_KINDS.indexOf(r.kind), cell: (r) => <KindPill row={r} withStatus /> },
    { id: 'due', header: 'Due', kind: 'date', minWidth: 140, sortDescFirst: true, value: (r) => r.days_overdue, cell: (r) => <DueCell row={r} /> },
    { id: 'interval', header: 'Interval', minWidth: 120, value: (r) => r.frequency_days, cell: (r) => frequencyText(r.frequency_days) },
    {
      id: 'last',
      header: 'Last carried out',
      minWidth: 130,
      value: (r) => r.last_done_on,
      cell: (r) => <span className={cn('whitespace-nowrap', !r.last_done_on && 'text-muted-foreground')}>{lastText(r)}</span>,
    },
    {
      id: 'next',
      header: 'Next scheduled',
      kind: 'date',
      minWidth: 130,
      value: (r) => r.next_scheduled_on,
      cell: (r) => (r.kind === 'missed' ? null : r.next_scheduled_on ? formatDay(r.next_scheduled_on) : <span className="text-muted-foreground">Not scheduled</span>),
      emptyReason: 'The missed drill itself is the plan',
    },
  ];
}

function DrillCard({ row, vessel }: { row: OverdueDrillRow; vessel: ReportVesselCoverage | undefined }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <VesselCell vessel={vessel} rel={DRILLS_REL} noVessel="Vessel" />
          <DrillCell row={row} />
        </div>
        <KindPill row={row} />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div className="min-w-0">
          <dt className="type-caption text-muted-foreground">Due</dt>
          <dd>
            <DueCell row={row} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="type-caption text-muted-foreground">Interval</dt>
          <dd>{frequencyText(row.frequency_days)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="type-caption text-muted-foreground">Last carried out</dt>
          <dd>{lastText(row)}</dd>
        </div>
        {row.kind === 'missed' ? (
          <div className="min-w-0">
            <dt className="type-caption text-muted-foreground">Status</dt>
            <dd>{tidyWord(row.status) ?? 'Scheduled'}</dd>
          </div>
        ) : (
          <div className="min-w-0">
            <dt className="type-caption text-muted-foreground">Next scheduled</dt>
            <dd>{row.next_scheduled_on ? formatDay(row.next_scheduled_on) : 'Not scheduled'}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

const EMPTY_BODY: Readonly<Record<string, string>> = {
  overdue: 'Every scheduled drill was carried out and every required drill is within its interval.',
  missed: 'Every scheduled drill was carried out by its date.',
  lapsed: 'Every required drill is within its interval.',
  'due-soon': 'No required drill falls due in the next 7 days.',
  never: 'Every required drill type has been carried out at least once on these vessels.',
  all: 'Nothing is overdue, due soon or missing a record.',
};

export default function OverdueDrillsReport({ definition }: ReportComponentProps) {
  const { shown, ready, scope, vesselsParam } = useShownReportScope();
  const filters = useReportFilters(DRILL_FILTERS);
  const { show, category } = filters.applied;
  const location = useLocation();
  const read = useOverdueDrills(scope);
  const data = read.state === 'ready' ? read.data : null;

  const vessels = useMemo(() => data?.vessels ?? [], [data]);
  const vesselOf = useMemo(() => {
    const byId = new Map(vessels.map((v) => [v.vessel_id, v]));
    return (id: string) => byId.get(id);
  }, [vessels]);
  const vesselName = useMemo(() => vesselLabeller(vessels, 'Vessel'), [vessels]);
  const rows = useMemo(() => (data ? drillRows(data.rows, show, category) : []), [data, show, category]);
  // The tiles count every kind for the chosen category, so each tile's number is what its Show option lists.
  const tally = useMemo(() => tallyDrills(data ? drillRows(data.rows, 'all', category) : []), [data, category]);
  const covered = vessels.filter((v) => v.state === 'ok').length;

  const queryClient = useQueryClient();
  const prefix = [...reportsKeys.company(ready?.companyId ?? null), 'overdue-drills'];
  const refreshing = useIsFetching({ queryKey: prefix }) > 0;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: prefix });

  const showHref = (value: string) => {
    const next = writeReportFilters(DRILL_FILTERS, { show: value, category }, new URLSearchParams(location.search));
    const search = next.toString();
    return `${location.pathname}${search ? `?${search}` : ''}`;
  };

  const loading = read.state === 'loading' || read.state === 'idle' || !ready;
  const gated = shown.status === 'error' || read.state === 'not_set_up' || read.state === 'no_vessels';
  const noneCovered = data !== null && covered === 0;
  const tileState = loading ? 'loading' : noneCovered ? 'not-enabled' : undefined;
  const NOT_COVERED = 'Not covered on any vessel shown';
  const exportBlockedReason =
    read.state === 'not_set_up'
      ? 'This report is not set up yet.'
      : read.state === 'error' || shown.status === 'error'
        ? 'The report could not load.'
        : read.state === 'no_vessels'
          ? 'There are no vessels to report on.'
          : null;
  const exportParams: Json = { show, category, vessels: ready && !ready.isDefault ? ready.shownVessels.map((v) => v.code) : 'counted' };
  const vesselsAffected = tally.vessels_overdue > 0 ? `On ${tally.vessels_overdue} of ${covered} ${covered === 1 ? 'vessel' : 'vessels'}` : undefined;

  const body = gated ? (
    <CrewReportGate
      shown={shown}
      state={read.state}
      notSetUp={{
        icon: Siren,
        title: 'This report is not set up yet',
        body: 'Missed drills and required drills past their interval appear here once fleet reports are set up for your account.',
      }}
      noVessels={{ title: 'No vessels to report on', body: 'Overdue drills cover the vessels you can reach. None is set up for you yet; ask your account admin.' }}
    />
  ) : (
    <>
      <section aria-label="Overdue drills summary" className="space-y-3">
        <KpiGrid className="min-[1440px]:grid-cols-4">
          <KpiTile
            label="Missed"
            icon={CalendarX2}
            value={tally.missed}
            tone={tally.missed > 0 ? 'danger' : undefined}
            state={tileState}
            notEnabledReason={NOT_COVERED}
            zeroLabel="None missed"
            sub={tally.missed > 0 ? 'Scheduled, not carried out' : undefined}
            href={showHref('missed')}
          />
          <KpiTile
            label="Past their interval"
            icon={Siren}
            value={tally.lapsed}
            tone={tally.lapsed > 0 ? 'danger' : undefined}
            state={tileState}
            notEnabledReason={NOT_COVERED}
            zeroLabel="All within interval"
            sub={vesselsAffected}
            href={showHref('lapsed')}
          />
          <KpiTile
            label="Due within 7 days"
            icon={CalendarClock}
            value={tally.due_soon}
            tone={tally.due_soon > 0 ? 'warn' : undefined}
            state={tileState}
            notEnabledReason={NOT_COVERED}
            zeroLabel="None this week"
            href={showHref('due-soon')}
          />
          <KpiTile
            label="No drill on record"
            icon={ClipboardX}
            value={tally.never}
            state={tileState}
            notEnabledReason={NOT_COVERED}
            zeroLabel="Every type on record"
            sub={tally.never > 0 ? 'Required types never carried out' : undefined}
            href={showHref('never')}
          />
        </KpiGrid>
        {data ? <CoverageNote vessels={vessels} moduleName="Safety" /> : null}
        <RulesDisclosure
          title="How drills are counted"
          testId="drill-rules"
          items={DRILL_KINDS.map((kind) => ({
            key: kind,
            marker: <StatusPill tone={DRILL_KIND_META[kind].tone} label={DRILL_KIND_META[kind].label} />,
            text: DRILL_KIND_META[kind].rule,
          }))}
          footer={
            data
              ? `Required drills: the ${data.required_types === 1 ? 'active SOLAS or company drill type' : `${data.required_types} active SOLAS and company drill types`}, each with its own interval. A drill counts as carried out when it has an actual date or is marked completed; cancelled drills never count.`
              : null
          }
        />
      </section>
      <ReportTable
        label="Overdue drills"
        noun={{ one: 'drill', other: 'drills' }}
        rows={rows}
        columns={columns(vesselOf)}
        getRowId={rowId}
        renderCard={(r) => <DrillCard row={r} vessel={vesselOf(r.vessel_id)} />}
        isLoading={loading}
        error={read.state === 'error' ? read.error : undefined}
        onRetry={read.state === 'error' ? read.retry : undefined}
        empty={{ title: 'No overdue drills', body: noneCovered ? 'No vessel shown is covered by this report.' : EMPTY_BODY[show] ?? EMPTY_BODY.overdue }}
        hasExternalFilters={category !== 'all'}
        onClearFilters={filters.reset}
        searchable={rows.length > 8}
      />
    </>
  );

  return (
    <ReportShell<OverdueDrillRow>
      definition={definition}
      generatedAt={read.state === 'ready' ? read.updatedAt : null}
      refreshing={refreshing}
      onRefresh={ready ? refresh : undefined}
      vesselsParam={vesselsParam}
      toolbar={<ShownVesselsToolbar ready={ready} />}
      toolbarLabel="Vessels"
      filters={filters}
      exportSpec={data ? { kind: 'Overdue drills', columns: drillExportColumns(vesselName), rows, params: exportParams } : null}
      exportBlockedReason={exportBlockedReason}
    >
      {body}
    </ReportShell>
  );
}
