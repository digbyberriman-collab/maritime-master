/**
 * Fleet › Reports › Hours of rest (`/fleet/reports/hours-of-rest`; gap/02
 * R9, T-292, T-248; X5 spec X5-10A, agreement 6). The fleet's hours of rest
 * over a period from `fleet_report_hours_of_rest` (040900).
 *
 * - Filters in the URL: Period (`?period=`: last 7 / 30 (default) / 90 days,
 *   this month, last month, last 12 months) and Show (`?show=`: all vessels,
 *   with breaches, with serious breaches, with unreviewed breaches, with
 *   months not submitted, not logging), plus "Vessels shown".
 * - KPI tiles: unreviewed breaches, serious breach days, months not
 *   submitted, vessels logging (of those covered) and breaches per 100
 *   crew-days. The rule behind the numbers is written under them.
 * - The heat map (MatrixGrid): one row per vessel, one column per day (per
 *   week over 5 weeks, per month over 4 months). Each cell shows its number
 *   and a glyph ("·" no entries, "!" a serious breach, "–" not covered), so
 *   the legend never relies on colour alone. Show picks what it counts
 *   (crew in breach, in serious breach, unreviewed breaches).
 * - Per vessel: crew logging, crew-days logged, breach days, serious breach
 *   days, unreviewed breaches, months not submitted, breaches per 100
 *   crew-days and the last entry; "–" where not covered, never 0.
 * - Emerging issues: people with breaches on two or more days.
 * - D-01: while the RPC is missing, "This report is not set up yet"; any
 *   other error with Retry. Below 768 px the vessel table becomes cards and
 *   the heat map scrolls inside its card. Export: the vessel rows on screen.
 */
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { AlertOctagon, CalendarX2, ClipboardList, Clock, Ship, Siren } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';
import { TONE_SURFACE } from '@/components/ui/tones';
import { cn } from '@/lib/utils';
import type { DataTableColumn } from '@/shared/components/data/DataTable';
import { KpiGrid, KpiTile, type KpiTileState } from '@/shared/components/data/KpiTile';
import { MatrixGrid, type MatrixColumn } from '@/shared/components/data/MatrixGrid';
import { TABLET_MIN_WIDTH, useMinWidth } from '@/shared/components/data/useMinWidth';
import { EmptyState } from '@/shared/components/states';
import { todayDateOnly } from '@/shared/lib/form';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import { ReportShell, ReportTable } from '../components/ReportShell';
import { CoverageNote, CrewReportGate, NotCoveredDash, ShownVesselsToolbar } from '../components/CrewReportParts';
import { reportsKeys } from '../hooks/keys';
import { useHoursOfRestReport } from '../hooks/useCrewReports';
import { ReportDataError } from '../hooks/useReportData';
import { useReportFilters } from '../hooks/useReportFilters';
import { useShownReportScope } from '../hooks/useShownReportScope';
import {
  HEAT_MEASURE_LABELS,
  HOR_SOURCE_TEXT,
  HOURS_OF_REST_FILTERS,
  formatDay,
  heatCell,
  heatColumns,
  heatLegend,
  heatMeasureFor,
  horPeriodRange,
  horVesselExportColumns,
  horVesselRows,
  indexHeat,
  moreText,
  personLabel,
  rateText,
  type HeatCellValue,
  type HeatColumn,
  type HeatGrain,
  type HeatMeasure,
} from '../lib/crewReports';
import type { ReportComponentProps } from '../registry';
import type { FleetReportHoursOfRestJson, HoursOfRestVesselRow, ReportVesselCoverage } from '../types/db.pending';

const COARSE = '[@media(pointer:coarse)]:min-h-11';
const LINK = cn('-mx-1 inline-flex min-h-8 items-center rounded-sm px-1 hover:underline focus-ring', COARSE);
const n = (v: number) => v.toLocaleString('en-GB');
/** Refusals a retry cannot fix (the period the server will not read): the tiles offer no Retry for them. */
const NOT_RETRYABLE: ReadonlySet<string> = new Set(['period_too_long', 'invalid_period']);

function VesselLink({ vessel }: { vessel: Pick<ReportVesselCoverage, 'vessel_code' | 'vessel_name'> }) {
  return vessel.vessel_code ? (
    <Link to={vesselPath(vessel.vessel_code, 'crew/hours-of-rest')} className={cn(LINK, 'font-medium text-foreground')}>
      {vessel.vessel_name}
    </Link>
  ) : (
    <span className="font-medium text-foreground">{vessel.vessel_name}</span>
  );
}

// ─── Heat map ───────────────────────────────────────────────────────────

const HEAT_WIDTH: Readonly<Record<HeatGrain, number>> = { day: 30, week: 64, month: 56 };

function HeatGlyph({ value, measure }: { value: HeatCellValue; measure: HeatMeasure }) {
  if (value.kind === 'not_covered') return <span className="text-muted-foreground">–</span>;
  if (value.kind === 'no_entries') return <span className="text-muted-foreground">·</span>;
  const serious = measure === 'breaches' && value.serious > 0;
  return (
    <span
      className={cn(
        'inline-flex min-w-[1.5rem] items-center justify-center rounded-sm border px-0.5 text-xs tabular-nums',
        value.level === 'none' ? 'border-transparent text-muted-foreground/60' : value.level === 'few' ? TONE_SURFACE.warn : cn(TONE_SURFACE.danger, 'font-semibold'),
      )}
    >
      {n(value.value)}
      {serious ? <span className="font-bold">!</span> : null}
    </span>
  );
}

function heatCellWords(value: HeatCellValue, measure: HeatMeasure): string {
  if (value.kind === 'not_covered') return 'not covered';
  if (value.kind === 'no_entries') return 'no entries';
  const what = HEAT_MEASURE_LABELS[measure].toLowerCase();
  const serious = measure === 'breaches' && value.serious > 0 ? `, ${n(value.serious)} serious` : '';
  return `${n(value.value)} ${what}${serious}; ${n(value.logged)} crew-days logged`;
}

function HeatLegend({ grain, measure }: { grain: HeatGrain; measure: HeatMeasure }) {
  const sample: Record<string, HeatCellValue> = {
    no_entries: { kind: 'no_entries' },
    none: { kind: 'value', value: 0, serious: 0, logged: 1, level: 'none' },
    few: { kind: 'value', value: 1, serious: 0, logged: 1, level: 'few' },
    many: { kind: 'value', value: 3, serious: 0, logged: 1, level: 'many' },
    serious: { kind: 'value', value: 1, serious: 1, logged: 1, level: 'few' },
    not_covered: { kind: 'not_covered' },
  };
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 type-caption text-muted-foreground" aria-label="Heat map legend">
      {heatLegend(grain, measure).map((item) => {
        const value = sample[item.key];
        return (
          <li key={item.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-flex min-w-[1.5rem] justify-center">
              {item.key === 'many' || item.key === 'few' ? (
                <span className={cn('inline-flex min-w-[1.5rem] items-center justify-center rounded-sm border px-0.5 text-xs tabular-nums', item.key === 'few' ? TONE_SURFACE.warn : cn(TONE_SURFACE.danger, 'font-semibold'))}>
                  {item.glyph}
                </span>
              ) : value ? (
                <HeatGlyph value={value} measure={measure} />
              ) : (
                item.glyph
              )}
            </span>
            {item.label}
          </li>
        );
      })}
    </ul>
  );
}

function HeatMap({ data, rows, measure }: { data: FleetReportHoursOfRestJson; rows: readonly HoursOfRestVesselRow[]; measure: HeatMeasure }) {
  const headingId = React.useId();
  const { grain, columns } = useMemo(() => heatColumns(data.from, data.to), [data.from, data.to]);
  const index = useMemo(() => indexHeat(data.heat), [data.heat]);
  const byId = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);
  const matrixColumns: MatrixColumn[] = useMemo(
    () => columns.map((c) => ({ id: c.id, label: c.label, sublabel: c.sublabel, title: c.title, width: HEAT_WIDTH[grain] })),
    [columns, grain],
  );
  const grainWords = grain === 'day' ? 'day' : grain === 'week' ? 'week' : 'month';
  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-2">
      <div className="min-w-0">
        <h2 id={headingId} className="type-title text-foreground">
          {HEAT_MEASURE_LABELS[measure]} by {grainWords}
        </h2>
        <p className="text-sm text-muted-foreground">
          {formatDay(data.from)} to {formatDay(data.to)}. Each cell counts one vessel’s {grainWords}.
        </p>
      </div>
      <MatrixGrid<HoursOfRestVesselRow, HeatCellValue>
        label={`${HEAT_MEASURE_LABELS[measure]} by ${grainWords}`}
        noun={{ one: 'vessel', other: 'vessels' }}
        rows={rows}
        getRowId={(r) => r.vessel_id}
        rowLabel={(r) => r.vessel_name}
        renderRowHeader={(r) => <VesselLink vessel={r} />}
        rowHeader="Vessel"
        columns={matrixColumns}
        getValue={(row, column) => heatCell(index, row, byId.get(column.id) as HeatColumn, measure, grain)}
        renderCell={(context) => (
          <span title={heatCellWords(context.value, measure)}>
            <span aria-hidden="true">
              <HeatGlyph value={context.value} measure={measure} />
            </span>
            <span className="sr-only">{`${context.label}: ${heatCellWords(context.value, measure)}`}</span>
          </span>
        )}
        showDensityToggle={false}
        searchable={rows.length > 8}
        empty={{ title: 'No vessels match', body: 'Change Show to see every vessel.' }}
        legend={<HeatLegend grain={grain} measure={measure} />}
        maxHeight="26rem"
      />
    </section>
  );
}

// ─── Per vessel ─────────────────────────────────────────────────────────

const NOT_COVERED_REASON = (r: HoursOfRestVesselRow) =>
  r.state === 'module_off' ? 'Not covered: Hours of rest is switched off on this vessel' : r.state === 'no_access' ? 'Not covered: you cannot see hours of rest on this vessel' : 'None';

function metric(id: string, header: string, pick: (r: HoursOfRestVesselRow) => number | null, minWidth = 96): DataTableColumn<HoursOfRestVesselRow> {
  return {
    id,
    header,
    kind: 'number',
    minWidth,
    sortDescFirst: true,
    value: (r) => (r.state === 'ok' ? pick(r) : null),
    cell: (r) => {
      const v = r.state === 'ok' ? pick(r) : null;
      return v === null ? null : n(v);
    },
    emptyReason: NOT_COVERED_REASON,
  };
}

const VESSEL_COLUMNS: DataTableColumn<HoursOfRestVesselRow>[] = [
  { id: 'vessel', header: 'Vessel', sticky: true, minWidth: 150, value: (r) => r.vessel_name, cell: (r) => <VesselLink vessel={r} /> },
  metric('crew_logging', 'Crew logging', (r) => r.crew_logging, 84),
  metric('crew_days', 'Crew-days', (r) => r.crew_days, 84),
  metric('breach_days', 'Breach days', (r) => r.breach_days, 84),
  metric('serious_days', 'Serious days', (r) => r.serious_days, 84),
  metric('unreviewed', 'Unreviewed', (r) => r.unreviewed, 84),
  metric('months', 'Months not submitted', (r) => r.months_not_submitted, 96),
  {
    id: 'rate',
    header: 'Per 100 crew-days',
    kind: 'number',
    minWidth: 96,
    sortDescFirst: true,
    value: (r) => (r.state === 'ok' ? r.rate_per_100 : null),
    cell: (r) => (r.state === 'ok' ? rateText(r.rate_per_100) : null),
    emptyReason: (r) => (r.state === 'ok' ? 'Nothing logged in the period' : NOT_COVERED_REASON(r)),
  },
  {
    id: 'last',
    header: 'Last entry',
    kind: 'date',
    minWidth: 104,
    value: (r) => r.last_entry,
    cell: (r) => formatDay(r.last_entry),
    emptyReason: (r) => (r.state === 'ok' ? 'No entries yet' : NOT_COVERED_REASON(r)),
  },
];

function VesselCard({ row }: { row: HoursOfRestVesselRow }) {
  const facts: Array<[string, React.ReactNode]> = [
    ['Breach days', row.breach_days],
    ['Serious days', row.serious_days],
    ['Unreviewed', row.unreviewed],
    ['Months not submitted', row.months_not_submitted],
    ['Crew logging', row.crew_logging],
    ['Per 100 crew-days', rateText(row.rate_per_100)],
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <VesselLink vessel={row} />
        <span className="type-caption text-muted-foreground">
          {row.state === 'ok' ? `Last entry ${formatDay(row.last_entry) ?? 'none yet'}` : NOT_COVERED_REASON(row)}
        </span>
      </div>
      {row.state === 'ok' ? (
        <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="type-caption text-muted-foreground">{label}</dt>
              <dd className="text-sm tabular-nums">{value === null || value === undefined ? <NotCoveredDash label={label} /> : typeof value === 'number' ? n(value) : value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

// ─── Emerging issues ────────────────────────────────────────────────────

function EmergingIssues({ data }: { data: FleetReportHoursOfRestJson }) {
  const headingId = React.useId();
  const vessels = new Map(data.per_vessel.map((v) => [v.vessel_id, v]));
  const more = moreText(data.emerging.rows.length, data.emerging.total);
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <div>
        <h2 id={headingId} className="type-title text-foreground">
          Repeat breaches
        </h2>
        <p className="text-sm text-muted-foreground">People with breaches on two or more days of the period, most first.</p>
      </div>
      {data.emerging.rows.length === 0 ? (
        <EmptyState title="Nobody has repeat breaches" body="No one breached their rest on more than one day in this period." headingLevel={3} bordered compact />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {data.emerging.rows.map((p) => {
            const vessel = p.vessel_id ? vessels.get(p.vessel_id) : undefined;
            return (
              <li key={p.profile_id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0">
                  {vessel?.vessel_code ? (
                    <Link to={vesselPath(vessel.vessel_code, `crew/people/${p.profile_id}`)} className={cn(LINK, 'font-medium text-foreground')}>
                      {personLabel(p.person_name)}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground">{personLabel(p.person_name)}</span>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {[p.position, vessel?.vessel_name].filter(Boolean).join(' · ') || 'Position not recorded'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums">
                  <span>{`${n(p.breach_days)} breach days`}</span>
                  {p.serious_days > 0 ? (
                    <span className={cn('rounded-sm border px-1.5 text-xs font-medium', TONE_SURFACE.danger)}>{`${n(p.serious_days)} serious`}</span>
                  ) : null}
                  {p.unreviewed > 0 ? <span className="text-muted-foreground">{`${n(p.unreviewed)} unreviewed`}</span> : null}
                  <span className="text-muted-foreground">{`last ${formatDay(p.last_breach)}`}</span>
                </div>
              </li>
            );
          })}
          {more ? <li className="px-4 py-2 text-sm text-muted-foreground">{more}</li> : null}
        </ul>
      )}
    </section>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────

export default function HoursOfRestReport({ definition }: ReportComponentProps) {
  const { shown, ready, scope, vesselsParam } = useShownReportScope();
  const filters = useReportFilters(HOURS_OF_REST_FILTERS);
  const { period, show } = filters.applied;
  const today = todayDateOnly();
  const range = useMemo(() => horPeriodRange(period, today), [period, today]);
  const read = useHoursOfRestReport(scope, range, { today });
  const data = read.state === 'ready' ? read.data : null;
  const wide = useMinWidth(TABLET_MIN_WIDTH);

  const rows = useMemo(() => (data ? horVesselRows(data.per_vessel, show) : []), [data, show]);
  const heatRows = useMemo(() => rows.filter((r) => r.state === 'ok' || show === 'all'), [rows, show]);
  const measure = heatMeasureFor(show);
  const totals = data?.totals ?? null;

  const queryClient = useQueryClient();
  const prefix = [...reportsKeys.company(ready?.companyId ?? null), 'hours-of-rest'];
  const refreshing = useIsFetching({ queryKey: prefix }) > 0;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: prefix });

  const loading = read.state === 'loading' || read.state === 'idle' || !ready;
  const gated = shown.status === 'error' || read.state === 'not_set_up' || read.state === 'no_vessels';
  const exportBlockedReason =
    read.state === 'not_set_up'
      ? 'This report is not set up yet.'
      : read.state === 'error' || shown.status === 'error'
        ? 'The report could not load.'
        : read.state === 'no_vessels'
          ? 'There are no vessels to report on.'
          : null;
  const exportParams: Json = { period, show, from: range.from, to: range.to, vessels: ready && !ready.isDefault ? ready.shownVessels.map((v) => v.code) : 'counted' };

  const notCoveredAnywhere = data !== null && totals === null;
  // A failed read is an error on every tile (never a skeleton that stays busy); Retry only where retrying can help:
  // a period the server refuses fails the same way again.
  const failed = read.state === 'error';
  const refused = failed && read.error instanceof ReportDataError && NOT_RETRYABLE.has(read.error.reason);
  const retry = failed && !refused ? read.retry : undefined;
  const tileState = (value: number | undefined): KpiTileState | undefined =>
    loading ? 'loading' : failed ? 'error' : notCoveredAnywhere ? 'not-enabled' : value === undefined ? 'loading' : undefined;
  const NOT_COVERED = 'Not covered on any vessel shown';

  let body: React.ReactNode;
  if (gated) {
    body = (
      <CrewReportGate
        shown={shown}
        state={read.state}
        notSetUp={{
          icon: Clock,
          title: 'This report is not set up yet',
          body: 'Breaches, serious breach days, months not submitted and the fleet heat map appear here once fleet reports are set up for your account.',
        }}
        noVessels={{ title: 'No vessels to report on', body: 'The hours-of-rest report covers the vessels you can reach. None is set up for you yet; ask your account admin.' }}
      />
    );
  } else {
    body = (
      <>
        <section aria-label="Hours of rest summary" className="space-y-3">
          <KpiGrid className="min-[1440px]:grid-cols-5">
            <KpiTile
              label="Unreviewed breaches"
              icon={ClipboardList}
              value={totals?.unreviewed}
              tone={totals && totals.unreviewed > 0 ? 'danger' : undefined}
              state={tileState(totals?.unreviewed)}
              onRetry={retry}
              notEnabledReason={NOT_COVERED}
              zeroLabel="All reviewed"
            />
            <KpiTile
              label="Serious breach days"
              icon={Siren}
              value={totals?.serious_days}
              tone={totals && totals.serious_days > 0 ? 'danger' : undefined}
              state={tileState(totals?.serious_days)}
              onRetry={retry}
              notEnabledReason={NOT_COVERED}
              zeroLabel="None serious"
              sub={totals ? `${n(totals.breach_days)} breach days in all` : undefined}
            />
            <KpiTile
              label="Months not submitted"
              icon={CalendarX2}
              value={totals?.months_not_submitted}
              tone={totals && totals.months_not_submitted > 0 ? 'warn' : undefined}
              state={tileState(totals?.months_not_submitted)}
              onRetry={retry}
              notEnabledReason={NOT_COVERED}
              zeroLabel="All submitted"
            />
            <KpiTile
              label="Vessels logging"
              icon={Ship}
              value={totals?.vessels_logging}
              state={tileState(totals?.vessels_logging)}
              onRetry={retry}
              notEnabledReason={NOT_COVERED}
              zeroLabel="None logging"
              sub={totals ? `of ${n(totals.vessels_covered)} covered` : undefined}
            />
            <KpiTile
              label="Breach rate"
              icon={AlertOctagon}
              value={totals ? rateText(totals.rate_per_100) : undefined}
              state={loading ? 'loading' : failed ? 'error' : notCoveredAnywhere ? 'not-enabled' : totals && totals.rate_per_100 === null ? 'zero' : undefined}
              onRetry={retry}
              notEnabledReason={NOT_COVERED}
              zeroLabel="Nothing logged"
              sub={totals ? `per 100 crew-days · ${n(totals.crew_days)} logged` : undefined}
            />
          </KpiGrid>
          {data?.source ? <p className="text-sm text-muted-foreground">{HOR_SOURCE_TEXT[data.source]}</p> : null}
          {data ? <CoverageNote vessels={data.per_vessel} moduleName="Hours of rest" /> : null}
        </section>
        {data && totals ? <HeatMap data={data} rows={heatRows} measure={measure} /> : null}
        <section aria-label="Hours of rest by vessel" className="space-y-2">
          {wide ? null : <h2 className="type-title text-foreground">By vessel</h2>}
          <ReportTable
            label="Hours of rest by vessel"
            noun={{ one: 'vessel', other: 'vessels' }}
            rows={rows}
            columns={VESSEL_COLUMNS}
            getRowId={(r) => r.vessel_id}
            renderCard={(r) => <VesselCard row={r} />}
            isLoading={loading}
            error={read.state === 'error' ? read.error : undefined}
            onRetry={read.state === 'error' ? read.retry : undefined}
            empty={{ title: 'No vessels to report on' }}
            hasExternalFilters={show !== 'all'}
            onClearFilters={filters.reset}
            searchable={rows.length > 8}
          />
        </section>
        {data && totals ? <EmergingIssues data={data} /> : null}
      </>
    );
  }

  return (
    <ReportShell<HoursOfRestVesselRow>
      definition={definition}
      generatedAt={read.state === 'ready' ? read.updatedAt : null}
      refreshing={refreshing}
      onRefresh={ready ? refresh : undefined}
      vesselsParam={vesselsParam}
      toolbar={<ShownVesselsToolbar ready={ready} />}
      toolbarLabel="Vessels"
      filters={filters}
      exportSpec={data ? { kind: 'Hours of rest', columns: horVesselExportColumns(), rows, params: exportParams, range: { from: range.from, to: range.to } } : null}
      exportBlockedReason={exportBlockedReason}
    >
      {body}
    </ReportShell>
  );
}
