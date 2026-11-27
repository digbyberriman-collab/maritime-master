/**
 * Fleet › Reports › Work list (`/fleet/reports/work-list`; gap/02 R18; X5
 * spec X5-10B). The jobs of the vessels shown, from
 * `fleet_report_work_list` (041000):
 *
 * - Per vessel: open jobs, overdue (past due, or marked Overdue; the fleet
 *   dashboard's overdue jobs), awaiting approval, due within 30 days, high
 *   or urgent, and completed in the last 30 days, with status chips that add
 *   up to the open jobs (overdue, awaiting approval, then each live status).
 *   Most overdue first.
 * - The overdue jobs, most overdue first (200 named, with the total).
 * - Jobs record no cost yet, so there is no cost column; the page says so.
 *
 * Filters in the URL: Vessels (`?show=`) and Overdue jobs (`?priority=`).
 * KPI tiles link to their filter. Vessels with Technical › Jobs off, or
 * where the reader cannot see jobs, are named in "Not covered", never 0.
 *
 * D-01: while the RPC is missing, "This report is not set up yet"; any other
 * error with Retry. Below 768 px one card per vessel and per job. Export:
 * the vessel rows on screen.
 */
import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, CalendarClock, CheckCircle2, ClipboardList, Flame, Hourglass } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import type { DataTableColumn } from '@/shared/components/data/DataTable';
import { KpiGrid, KpiTile } from '@/shared/components/data/KpiTile';
import { StatusPill } from '@/shared/components/status/StatusPill';
import { ReportShell, ReportTable } from '../components/ReportShell';
import { CoverageNote, CrewReportGate, NotCoveredDash, ShownVesselsToolbar } from '../components/CrewReportParts';
import { ReportNote, VesselCell } from '../components/OpsReportParts';
import { reportsKeys } from '../hooks/keys';
import { useWorkList } from '../hooks/useOpsReports';
import { useReportFilters } from '../hooks/useReportFilters';
import { useShownReportScope } from '../hooks/useShownReportScope';
import { formatDay } from '../lib/crewReports';
import { writeReportFilters } from '../lib/reportFilters';
import {
  WORK_FILTERS,
  dueText,
  overdueJobRows,
  priorityTone,
  tidyWord,
  workChips,
  workVesselExportColumns,
  workVesselRows,
} from '../lib/opsReports';
import type { ReportComponentProps } from '../registry';
import type { OverdueJobRow, ReportVesselCoverage, WorkListVesselRow } from '../types/db.pending';

const JOBS_REL = 'technical';
const n = (v: number) => v.toLocaleString('en-GB');

const NOT_COVERED_REASON = (r: WorkListVesselRow) =>
  r.state === 'module_off' ? 'Not covered: Technical › Jobs is switched off on this vessel' : r.state === 'no_access' ? 'Not covered: you cannot see jobs on this vessel' : 'None';

function Chips({ row }: { row: WorkListVesselRow }) {
  if (row.state !== 'ok') return <NotCoveredDash label="Open jobs by status" />;
  const chips = workChips(row.statuses);
  if (chips.length === 0) return <span className="text-muted-foreground">No open jobs</span>;
  return (
    <ul className="flex flex-wrap gap-1" aria-label={`${row.vessel_name}: open jobs by status`}>
      {chips.map((c) => (
        <li key={c.key}>
          <StatusPill size="sm" tone={c.tone} label={`${c.label} ${n(c.count)}`} />
        </li>
      ))}
    </ul>
  );
}

function metric(id: string, header: string, pick: (r: WorkListVesselRow) => number | null, minWidth = 96, danger = false): DataTableColumn<WorkListVesselRow> {
  return {
    id,
    header,
    kind: 'number',
    minWidth,
    sortDescFirst: true,
    value: (r) => (r.state === 'ok' ? pick(r) : null),
    cell: (r) => {
      const v = r.state === 'ok' ? pick(r) : null;
      if (v === null) return null;
      return <span className={cn(danger && v > 0 ? 'font-semibold text-critical' : v === 0 ? 'text-muted-foreground' : undefined)}>{n(v)}</span>;
    },
    emptyReason: NOT_COVERED_REASON,
  };
}

const VESSEL_COLUMNS: DataTableColumn<WorkListVesselRow>[] = [
  { id: 'vessel', header: 'Vessel', sticky: true, minWidth: 140, value: (r) => r.vessel_name, cell: (r) => <VesselCell vessel={r} rel={JOBS_REL} noVessel="Vessel" /> },
  metric('overdue', 'Overdue', (r) => r.overdue, 84, true),
  metric('pending_approval', 'Awaiting approval', (r) => r.pending_approval, 96),
  metric('open', 'Open', (r) => r.open, 72),
  metric('due_30', 'Due in 30 days', (r) => r.due_30, 96),
  metric('high_priority', 'High or urgent', (r) => r.high_priority, 96),
  metric('completed_30', 'Completed, 30 days', (r) => r.completed_30, 104),
  { id: 'chips', header: 'Open jobs by status', minWidth: 240, sortable: false, cell: (r) => <Chips row={r} /> },
];

function VesselCard({ row }: { row: WorkListVesselRow }) {
  const covered = row.state === 'ok';
  const cell = (label: string, value: number | null, danger = false) => (
    <div className="min-w-0">
      <dt className="type-caption text-muted-foreground">{label}</dt>
      <dd className={cn('tabular-nums', danger && (value ?? 0) > 0 && 'font-semibold text-critical')}>{covered && value !== null ? n(value) : '–'}</dd>
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <VesselCell vessel={row} rel={JOBS_REL} noVessel="Vessel" />
        {!covered ? <span className="text-xs text-muted-foreground">{NOT_COVERED_REASON(row)}</span> : null}
      </div>
      {covered ? (
        <>
          <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
            {cell('Overdue', row.overdue, true)}
            {cell('Awaiting approval', row.pending_approval)}
            {cell('Open', row.open)}
            {cell('Due in 30 days', row.due_30)}
            {cell('High or urgent', row.high_priority)}
            {cell('Completed, 30 days', row.completed_30)}
          </dl>
          <Chips row={row} />
        </>
      ) : null}
    </div>
  );
}

function JobCell({ row }: { row: OverdueJobRow }) {
  return (
    <div className="min-w-0">
      <div className="font-medium text-foreground">{row.task_name}</div>
      <div className="truncate text-xs text-muted-foreground">{[row.task_number, row.equipment_name].filter(Boolean).join(' · ')}</div>
    </div>
  );
}

function jobColumns(vesselOf: (id: string) => ReportVesselCoverage | undefined): DataTableColumn<OverdueJobRow>[] {
  return [
    { id: 'job', header: 'Job', sticky: true, minWidth: 220, value: (r) => r.task_name, cell: (r) => <JobCell row={r} /> },
    {
      id: 'vessel',
      header: 'Vessel',
      minWidth: 130,
      value: (r) => vesselOf(r.vessel_id)?.vessel_name ?? '',
      cell: (r) => <VesselCell vessel={vesselOf(r.vessel_id)} rel={JOBS_REL} noVessel="Vessel" />,
    },
    {
      id: 'due',
      header: 'Due',
      kind: 'date',
      minWidth: 140,
      sortDescFirst: true,
      value: (r) => r.days_overdue,
      cell: (r) => (
        <div className="flex flex-col">
          <span className="whitespace-nowrap">{formatDay(r.due_date)}</span>
          <span className="text-xs font-medium text-critical">{r.days_overdue > 0 ? dueText(r.days_overdue) : 'Marked overdue'}</span>
        </div>
      ),
    },
    {
      id: 'priority',
      header: 'Priority',
      minWidth: 100,
      value: (r) => r.priority,
      cell: (r) => (r.priority ? <StatusPill size="sm" tone={priorityTone(r.priority)} label={tidyWord(r.priority) ?? r.priority} icon={null} /> : null),
      emptyReason: 'No priority set',
    },
    { id: 'status', header: 'Status', minWidth: 110, value: (r) => tidyWord(r.status), emptyReason: 'No status recorded' },
  ];
}

function JobCard({ row, vessel }: { row: OverdueJobRow; vessel: ReportVesselCoverage | undefined }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <JobCell row={row} />
        {row.priority ? <StatusPill size="sm" tone={priorityTone(row.priority)} label={tidyWord(row.priority) ?? row.priority} icon={null} /> : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <VesselCell vessel={vessel} rel={JOBS_REL} noVessel="Vessel" />
        <span className="text-xs font-medium text-critical">
          {formatDay(row.due_date)} · {row.days_overdue > 0 ? dueText(row.days_overdue) : 'Marked overdue'}
        </span>
      </div>
    </div>
  );
}

export default function WorkListReport({ definition }: ReportComponentProps) {
  const { shown, ready, scope, vesselsParam } = useShownReportScope();
  const filters = useReportFilters(WORK_FILTERS);
  const { show, priority } = filters.applied;
  const location = useLocation();
  const read = useWorkList(scope);
  const data = read.state === 'ready' ? read.data : null;

  const vessels = useMemo(() => data?.vessels ?? [], [data]);
  const vesselOf = useMemo(() => {
    const byId = new Map(vessels.map((v) => [v.vessel_id, v]));
    return (id: string) => byId.get(id);
  }, [vessels]);
  const rows = useMemo(() => workVesselRows(vessels, show), [vessels, show]);
  const jobs = useMemo(() => (data ? overdueJobRows(data.overdue.rows, priority) : []), [data, priority]);
  const totals = data?.totals ?? null;
  const jobsHeadingId = React.useId();

  const queryClient = useQueryClient();
  const prefix = [...reportsKeys.company(ready?.companyId ?? null), 'work-list'];
  const refreshing = useIsFetching({ queryKey: prefix }) > 0;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: prefix });

  const filterHref = (values: Partial<Record<'show' | 'priority', string>>) => {
    const next = writeReportFilters(WORK_FILTERS, { show, priority, ...values }, new URLSearchParams(location.search));
    const search = next.toString();
    return `${location.pathname}${search ? `?${search}` : ''}`;
  };

  const loading = read.state === 'loading' || read.state === 'idle' || !ready;
  const gated = shown.status === 'error' || read.state === 'not_set_up' || read.state === 'no_vessels';
  const noneCovered = data !== null && totals === null;
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
  const exportParams: Json = { show, priority, vessels: ready && !ready.isDefault ? ready.shownVessels.map((v) => v.code) : 'counted' };
  const shownJobs = data ? data.overdue.rows.length : 0;

  const body = gated ? (
    <CrewReportGate
      shown={shown}
      state={read.state}
      notSetUp={{
        icon: ClipboardList,
        title: 'This report is not set up yet',
        body: 'Open, overdue and awaiting-approval jobs on each vessel appear here once fleet reports are set up for your account.',
      }}
      noVessels={{ title: 'No vessels to report on', body: 'The work list covers the vessels you can reach. None is set up for you yet; ask your account admin.' }}
    />
  ) : (
    <>
      <section aria-label="Work list summary" className="space-y-3">
        <KpiGrid className="min-[1440px]:grid-cols-5">
          <KpiTile
            label="Overdue"
            icon={AlarmClock}
            value={totals?.overdue ?? null}
            tone={(totals?.overdue ?? 0) > 0 ? 'danger' : undefined}
            state={tileState}
            notEnabledReason={NOT_COVERED}
            zeroLabel="Nothing overdue"
            href={filterHref({ show: 'overdue' })}
          />
          <KpiTile
            label="Awaiting approval"
            icon={Hourglass}
            value={totals?.pending_approval ?? null}
            tone={(totals?.pending_approval ?? 0) > 0 ? 'purple' : undefined}
            state={tileState}
            notEnabledReason={NOT_COVERED}
            zeroLabel="None waiting"
            href={filterHref({ show: 'approval' })}
          />
          <KpiTile
            label="Due in 30 days"
            icon={CalendarClock}
            value={totals?.due_30 ?? null}
            state={tileState}
            notEnabledReason={NOT_COVERED}
            zeroLabel="None due"
            sub={totals ? `${n(totals.open)} open in all` : undefined}
          />
          <KpiTile
            label="High or urgent"
            icon={Flame}
            value={totals?.high_priority ?? null}
            tone={(totals?.high_priority ?? 0) > 0 ? 'orange' : undefined}
            state={tileState}
            notEnabledReason={NOT_COVERED}
            zeroLabel="None open"
            href={filterHref({ priority: 'high' })}
          />
          <KpiTile
            label="Completed, 30 days"
            icon={CheckCircle2}
            value={totals?.completed_30 ?? null}
            state={tileState}
            notEnabledReason={NOT_COVERED}
            zeroLabel="None completed"
          />
        </KpiGrid>
        {data ? <CoverageNote vessels={vessels} moduleName="Technical › Jobs" /> : null}
        <ReportNote>Jobs do not record a cost yet, so this report has no cost column.</ReportNote>
      </section>
      <ReportTable
        label="Work list by vessel"
        noun={{ one: 'vessel', other: 'vessels' }}
        rows={rows}
        columns={VESSEL_COLUMNS}
        getRowId={(r) => r.vessel_id}
        renderCard={(r) => <VesselCard row={r} />}
        isLoading={loading}
        error={read.state === 'error' ? read.error : undefined}
        onRetry={read.state === 'error' ? read.retry : undefined}
        empty={{ title: 'No vessels to show', body: noneCovered ? 'No vessel shown is covered by this report.' : 'No vessel has jobs.' }}
        hasExternalFilters={show !== 'all'}
        onClearFilters={filters.reset}
        searchable={rows.length > 8}
      />
      {data && !noneCovered ? (
        <section aria-labelledby={jobsHeadingId} className="space-y-2">
          <div className="min-w-0">
            <h2 id={jobsHeadingId} className="type-title text-foreground">
              Overdue jobs
            </h2>
            <p className="text-sm text-muted-foreground">
              {data.overdue.total === 0
                ? 'No job is overdue on the vessels covered.'
                : data.overdue.total > shownJobs
                  ? `The ${n(shownJobs)} most overdue of ${n(data.overdue.total)}.`
                  : `${n(data.overdue.total)} ${data.overdue.total === 1 ? 'job' : 'jobs'}, most overdue first.`}
            </p>
          </div>
          {data.overdue.total > 0 ? (
            <ReportTable
              label="Overdue jobs"
              noun={{ one: 'job', other: 'jobs' }}
              rows={jobs}
              columns={jobColumns(vesselOf)}
              getRowId={(r) => r.job_id}
              renderCard={(r) => <JobCard row={r} vessel={vesselOf(r.vessel_id)} />}
              empty={{ title: 'No overdue jobs', body: 'No job is overdue on the vessels covered.' }}
              hasExternalFilters={priority !== 'all'}
              onClearFilters={filters.reset}
              searchable={jobs.length > 8}
            />
          ) : null}
        </section>
      ) : null}
    </>
  );

  return (
    <ReportShell<WorkListVesselRow>
      definition={definition}
      generatedAt={read.state === 'ready' ? read.updatedAt : null}
      refreshing={refreshing}
      onRefresh={ready ? refresh : undefined}
      vesselsParam={vesselsParam}
      toolbar={<ShownVesselsToolbar ready={ready} />}
      toolbarLabel="Vessels"
      filters={filters}
      exportSpec={data ? { kind: 'Work list', columns: workVesselExportColumns(), rows, params: exportParams } : null}
      exportBlockedReason={exportBlockedReason}
    >
      {body}
    </ReportShell>
  );
}
