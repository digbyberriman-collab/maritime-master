/**
 * Fleet › Reports › Vessel comparison (`/fleet/reports/vessel-comparison`;
 * gap/02 R2; X5 spec X5-03A). Every vessel shown, side by side, one area at
 * a time: Documents, Safety, Technical, Insurance, Hours of rest
 * (`?tab=`, default Documents), worst first.
 *
 * - Data: `fleet_vessel_comparison` (one row per vessel, 040100) through the
 *   dashboard's `useFleetVesselComparison`, over the "Vessels shown"
 *   (`?vessels=`). A group the reader cannot count on a vessel (no access,
 *   its module off) is "–" (not covered), never 0, and the vessel sorts
 *   after the covered ones.
 * - Order: by findings, then by name (../lib/vesselComparison.ts).
 * - Filter: Show all vessels, or only those with findings (`?show=`,
 *   applied with Apply).
 * - Numbers open the vessel's own page for them where one exists
 *   (`vesselPath`): certificates, drills, the technical schedule, hours of
 *   rest; corrective actions open the CAPA tracker; insurance numbers are
 *   plain until a vessel insurance page exists.
 * - KPI row: vessels compared, vessels needing action, vessels with
 *   something coming up, and the tab's totals.
 * - Export: the rows on screen for the tab (CSV, Excel, PDF) through
 *   ReportShell; no personal data.
 * - D-01: while the RPC is missing, "This report is not set up yet"; any
 *   other error says so with Retry; never sample data. Below 768 px the
 *   table folds into one card per vessel.
 */
import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, LayoutGrid, Ship } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TONE_TEXT } from '@/components/ui/tones';
import type { Json } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import type { DataTableColumn } from '@/shared/components/data/DataTable';
import { KpiGrid, KpiTile } from '@/shared/components/data/KpiTile';
import { StatusPill } from '@/shared/components/status/StatusPill';
import { EmptyState, PageEmpty, PageError } from '@/shared/components/states';
import { FleetVesselsFilter, VESSELS_SHOWN_PARAM, useFleetVesselsShown } from '@/modules/fleet';
import {
  dashboardKeys,
  useFleetVesselComparison,
  type FleetDashboardScope,
  type FleetVesselComparison,
} from '@/modules/dashboard/hooks/useFleetDashboard';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import { ReportShell, ReportTable } from '../components/ReportShell';
import { useReportFilters } from '../hooks/useReportFilters';
import type { ReportComponentProps } from '../registry';
import {
  COMPARISON_FILTERS,
  COMPARISON_LEAD_LABEL,
  COMPARISON_METRICS,
  COMPARISON_TABS,
  COMPARISON_TAB_LABELS,
  COMPARISON_TAB_PARAM,
  NOT_COVERED_REASON,
  comparisonExportColumns,
  comparisonMetrics,
  comparisonRows,
  comparisonSummary,
  findingsStatus,
  parseComparisonTab,
  vesselFindings,
  writeComparisonTab,
  type ComparisonMetric,
  type ComparisonTab,
} from '../lib/vesselComparison';

const COARSE = '[@media(pointer:coarse)]:min-h-11';
const n = (v: number) => v.toLocaleString('en-GB');
const plural = (count: number, one: string, many: string = `${one}s`) => `${n(count)} ${count === 1 ? one : many}`;

function metricTone(metric: ComparisonMetric, value: number): string | undefined {
  if (value <= 0) return undefined;
  if (metric.weight === 'severe') return cn('font-semibold', TONE_TEXT.danger);
  if (metric.weight === 'watch') return TONE_TEXT.warn;
  return undefined;
}

/** A count: linked to its page when there is one and something to see, "–" when not covered. */
function MetricValue({ row, metric }: { row: FleetVesselComparison; metric: ComparisonMetric }) {
  const value = metric.value(row);
  if (value === null) {
    return (
      <span className="text-muted-foreground" title={NOT_COVERED_REASON}>
        <span aria-hidden="true">–</span>
        <span className="sr-only">{`${metric.title}: not covered`}</span>
      </span>
    );
  }
  const href = value > 0 && row.vessel_code ? metric.href(row.vessel_code) : null;
  const text = <span className={cn('tabular-nums', metricTone(metric, value))}>{n(value)}</span>;
  if (!href) return text;
  return (
    <Link
      to={href}
      className={cn('-mx-1 inline-flex min-h-8 items-center rounded-sm px-1 underline-offset-2 hover:underline focus-ring', COARSE)}
      aria-label={`${metric.title} on ${row.vessel_name}: ${n(value)}`}
    >
      {text}
    </Link>
  );
}

function VesselName({ row }: { row: FleetVesselComparison }) {
  if (!row.vessel_code) return <span className="font-medium text-foreground">{row.vessel_name}</span>;
  return (
    <Link
      to={vesselPath(row.vessel_code, '')}
      className={cn('-mx-1 inline-flex min-h-8 items-center rounded-sm px-1 font-medium text-foreground hover:underline focus-ring', COARSE)}
    >
      {row.vessel_name}
    </Link>
  );
}

function StatusCell({ row, tab }: { row: FleetVesselComparison; tab: ComparisonTab }) {
  const status = findingsStatus(vesselFindings(row, tab));
  return <StatusPill tone={status.tone} label={status.label} />;
}

function columnsFor(tab: ComparisonTab, metrics: readonly ComparisonMetric[]): DataTableColumn<FleetVesselComparison>[] {
  return [
    {
      id: 'vessel',
      header: 'Vessel',
      sticky: true,
      minWidth: 180,
      value: (r) => r.vessel_name,
      cell: (r) => <VesselName row={r} />,
    },
    {
      id: 'status',
      header: 'Status',
      headerLabel: 'Status',
      sortable: false,
      minWidth: 132,
      cell: (r) => <StatusCell row={r} tab={tab} />,
    },
    ...metrics.map(
      (m): DataTableColumn<FleetVesselComparison> => ({
        id: m.id,
        header: m.label,
        headerLabel: m.title,
        kind: 'number',
        minWidth: 120,
        sortDescFirst: true,
        value: (r) => m.value(r),
        cell: (r) => <MetricValue row={r} metric={m} />,
        emptyReason: NOT_COVERED_REASON,
      }),
    ),
  ];
}

function VesselCard({ row, tab, metrics }: { row: FleetVesselComparison; tab: ComparisonTab; metrics: readonly ComparisonMetric[] }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <VesselName row={row} />
        <StatusCell row={row} tab={tab} />
      </div>
      <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
        {metrics.map((m) => (
          <div key={m.id} className="min-w-0">
            <dt className="type-caption text-muted-foreground">{m.label}</dt>
            <dd className="text-sm">
              <MetricValue row={row} metric={m} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SummaryTiles({ rows, tab, loading }: { rows: readonly FleetVesselComparison[]; tab: ComparisonTab; loading: boolean }) {
  const summary = comparisonSummary(rows, tab);
  const lead = COMPARISON_METRICS[tab][0];
  const leadTotal = summary.totals[lead.id];
  const state = loading ? 'loading' : undefined;
  const notCovered = summary.vessels - summary.covered;
  return (
    <section aria-label="Comparison summary">
      <KpiGrid className="min-[1440px]:grid-cols-4">
        <KpiTile
          label="Vessels compared"
          icon={Ship}
          value={summary.vessels}
          state={loading ? 'loading' : 'ready'}
          sub={notCovered > 0 ? `${n(notCovered)} not covered on ${COMPARISON_TAB_LABELS[tab].toLowerCase()}` : undefined}
        />
        <KpiTile
          label="Need action"
          icon={AlertTriangle}
          value={summary.withSevere}
          tone={summary.withSevere > 0 ? 'danger' : undefined}
          state={state}
          zeroLabel="No vessel needs action"
        />
        <KpiTile
          label="Coming up"
          icon={CalendarClock}
          value={summary.withWatch}
          tone={summary.withWatch > 0 ? 'warn' : undefined}
          state={state}
          zeroLabel="Nothing coming up"
        />
        <KpiTile
          label={COMPARISON_LEAD_LABEL[tab]}
          icon={LayoutGrid}
          value={leadTotal ?? undefined}
          tone={leadTotal && leadTotal > 0 ? 'danger' : undefined}
          state={loading ? 'loading' : leadTotal === null ? 'not-enabled' : undefined}
          notEnabledReason="Not covered on any vessel shown"
          zeroLabel={`None on ${plural(summary.covered, 'vessel')}`}
        />
      </KpiGrid>
    </section>
  );
}

export default function VesselComparisonReport({ definition }: ReportComponentProps) {
  const shown = useFleetVesselsShown();
  const [params, setParams] = useSearchParams();
  const tab = parseComparisonTab(params.get(COMPARISON_TAB_PARAM));
  const filters = useReportFilters(COMPARISON_FILTERS);
  const show = filters.applied.show;

  const ready = shown.status === 'ready' ? shown : null;
  const scope = useMemo<FleetDashboardScope | null>(
    () => (ready ? { companyId: ready.companyId, vesselIds: ready.shownIds, fleetWide: ready.isDefault } : null),
    [ready],
  );
  const comparison = useFleetVesselComparison(scope);
  const data = useMemo(() => (comparison.state === 'ready' ? comparison.data : []), [comparison]);
  const rows = useMemo(() => comparisonRows(data, tab, show), [data, tab, show]);

  const queryClient = useQueryClient();
  const companyId = ready?.companyId ?? null;
  const comparisonPrefix = [...dashboardKeys.fleet(companyId), 'comparison'];
  const refreshing = useIsFetching({ queryKey: comparisonPrefix }) > 0;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: comparisonPrefix });

  const vesselsParam = ready && !ready.isDefault ? params.get(VESSELS_SHOWN_PARAM) : null;
  const loading = comparison.state === 'loading' || comparison.state === 'idle' || !ready;

  const exportBlockedReason =
    comparison.state === 'not_set_up'
      ? 'This report is not set up yet.'
      : comparison.state === 'error' || shown.status === 'error'
        ? 'The report could not load.'
        : comparison.state === 'no_vessels'
          ? 'There are no vessels to compare.'
          : null;
  const exportParams: Json = {
    tab,
    show,
    vessels: ready && !ready.isDefault ? ready.shownVessels.map((v) => v.code) : 'counted',
  };

  const toolbar = ready ? (
    <FleetVesselsFilter
      vessels={ready.vessels}
      selectedIds={ready.shownIds}
      countedIds={ready.countedIds}
      fleetGroups={ready.fleetGroups}
      droppedCodes={ready.droppedCodes}
      onApply={ready.setShown}
    />
  ) : null;

  let body: React.ReactNode;
  if (shown.status === 'error') {
    body = <PageError error={shown.error} title="Your vessels could not load" onRetry={shown.retry} headingLevel={2} />;
  } else if (comparison.state === 'not_set_up') {
    body = (
      <PageEmpty
        icon={LayoutGrid}
        title="This report is not set up yet"
        body="Each vessel's documents, safety, technical, insurance and hours of rest appear here once fleet reports are set up for your account."
        headingLevel={2}
        bordered
      />
    );
  } else if (comparison.state === 'no_vessels') {
    body = (
      <EmptyState
        title="No vessels to compare"
        body="The comparison covers the vessels you can reach. None is set up for you yet; ask your account admin."
        headingLevel={2}
        bordered
      />
    );
  } else {
    body = (
      <>
        <SummaryTiles rows={data} tab={tab} loading={loading} />
        <Tabs value={tab} onValueChange={(value) => setParams((current) => writeComparisonTab(parseComparisonTab(value), current), { replace: true })}>
          <TabsList aria-label="Area">
            {COMPARISON_TABS.map((t) => (
              <TabsTrigger key={t} value={t} className={COARSE}>
                {COMPARISON_TAB_LABELS[t]}
              </TabsTrigger>
            ))}
          </TabsList>
          {COMPARISON_TABS.map((t) => (
            <TabsContent key={t} value={t} className="mt-4">
              <ReportTable
                label={`Vessel comparison: ${COMPARISON_TAB_LABELS[t]}`}
                noun={{ one: 'vessel', other: 'vessels' }}
                rows={rows}
                columns={columnsFor(t, comparisonMetrics(t, data))}
                getRowId={(r) => r.vessel_id}
                renderCard={(r) => <VesselCard row={r} tab={t} metrics={comparisonMetrics(t, data)} />}
                isLoading={loading}
                error={comparison.state === 'error' ? comparison.error : undefined}
                onRetry={comparison.state === 'error' ? comparison.retry : undefined}
                empty={{ title: 'No vessels to compare' }}
                hasExternalFilters={show !== 'all'}
                onClearFilters={filters.reset}
                searchable={rows.length > 8}
              />
            </TabsContent>
          ))}
        </Tabs>
      </>
    );
  }

  return (
    <ReportShell<FleetVesselComparison>
      definition={definition}
      generatedAt={comparison.state === 'ready' ? comparison.updatedAt : null}
      refreshing={refreshing}
      onRefresh={ready ? refresh : undefined}
      vesselsParam={vesselsParam}
      toolbar={toolbar}
      toolbarLabel="Vessels"
      filters={filters}
      exportSpec={
        comparison.state === 'ready'
          ? { kind: `Vessel comparison ${COMPARISON_TAB_LABELS[tab]}`, columns: comparisonExportColumns(tab, data), rows, params: exportParams }
          : null
      }
      exportBlockedReason={exportBlockedReason}
    >
      {body}
    </ReportShell>
  );
}
