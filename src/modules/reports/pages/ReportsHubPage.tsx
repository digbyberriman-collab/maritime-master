/**
 * Fleet › Reports (`/fleet/reports`; gap/02 R1; DECISIONS C12, D-01, D-04,
 * D-53, D-88, D-X5-11; supersedes D-44's interim index). The reports hub:
 *
 * - Gate: `fleet.operations.fleet_reports.view` (the route guard uses the
 *   same key). Nothing is read until it is granted: while it loads the page
 *   is a skeleton, denied is AccessDenied (fail closed).
 * - Header: "Fleet reports", the number of vessels shown, the "Vessels
 *   shown" filter (D-X5-09), the period (`?period=3|6|12` months, default
 *   6), one freshness stamp and the Refresh that re-reads it (D-88).
 * - Current position: the dashboard's KPI tiles from `fleet_dashboard_kpis`
 *   (document alerts, hours of rest, safety, technical); a number opens its
 *   report once the registry knows it.
 * - Trends: `fleet_report_trends` as Recharts bar charts on theme defaults
 *   (D-53), loaded lazily (../components/TrendCharts), one card per series
 *   the reader may count.
 * - All reports: the registry's fleet reports grouped, each card shown only
 *   to readers who hold its capability (useCan through useReportAccess).
 *
 * D-01: while the trends RPC is missing the trends say "This report is not
 * set up yet"; any other error says so with Retry; never zeros and never
 * sample data. Tokens only; at 390 px tiles are 2-up and the charts and
 * cards one column.
 */
import React, { Suspense, lazy, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BarChart3, Clock, FileText, RefreshCw, ShieldAlert, Wrench, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useCapability } from '@/lib/permissions/useCan';
import { cn } from '@/lib/utils';
import { KpiGrid, KpiTile } from '@/shared/components/data/KpiTile';
import PageHeader from '@/shared/components/layout/PageHeader';
import { AccessDenied, EmptyState, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { useBrandingContext } from '@/shared/contexts/BrandingContext';
import { FleetVesselsFilter, VESSELS_SHOWN_PARAM, useFleetVesselsShown } from '@/modules/fleet';
import { dashboardKeys, useFleetDashboardKpis } from '@/modules/dashboard/hooks/useFleetDashboard';
import { buildFleetKpiTiles, fleetKpisInput, type FleetKpiTileKey } from '@/modules/dashboard/lib/fleetKpiRules';
import { REPORTS_CAPS } from '../paths';
import { FLEET_REPORT_KEYS, REPORT_GROUPS, fleetReportPath, reportsForScope, type ReportDefinition } from '../registry';
import { reportsKeys } from '../hooks/keys';
import { useReportAccess } from '../hooks/useReportAccess';
import { useReportTrends, type ReportDataState, type ReportScope } from '../hooks/useReportData';
import { formatGeneratedStamp } from '../lib/reportStamp';
import { REPORT_PERIODS, parseReportPeriod, periodLabel, trendCards, writeReportPeriod, type ReportPeriod } from '../lib/trends';
import type { FleetReportTrendsJson } from '../types/db.pending';

const TrendCharts = lazy(() => import('../components/TrendCharts'));

const COARSE = '[@media(pointer:coarse)]:min-h-11';

const ReportsHubPage: React.FC = () => {
  const access = useCapability(REPORTS_CAPS.view);
  if (access.status === 'loading') return <PageLoading variant="tiles" label="Loading fleet reports" />;
  if (!access.allowed) {
    return <AccessDenied detail="Fleet reports need access to fleet reporting. If you think you should see them, ask your account admin." />;
  }
  return <ReportsHubBody />;
};

export default ReportsHubPage;

// ─── Body ───────────────────────────────────────────────────────────────

const plural = (n: number, one: string, many: string = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

/** The current-position tiles (the dashboard's, without leave and finance). */
const POSITION_TILES: readonly FleetKpiTileKey[] = ['documents', 'hours_of_rest', 'safety', 'technical'];
const TILE_ICONS: Readonly<Partial<Record<FleetKpiTileKey, LucideIcon>>> = {
  documents: FileText,
  hours_of_rest: Clock,
  safety: ShieldAlert,
  technical: Wrench,
};

/** Sub-text parts that wrap between parts first (each part one box), as on the dashboard. */
function SubParts({ parts }: { parts: readonly string[] }) {
  const last = parts.length - 1;
  return (
    <>
      {parts.map((part, i) => (
        <React.Fragment key={part}>
          <span className="inline-block">
            {part}
            {i < last ? '\u00a0·' : null}
          </span>
          {i < last ? ' ' : null}
        </React.Fragment>
      ))}
    </>
  );
}

function ReportsHubBody() {
  const { clientDisplayName, companyName } = useBrandingContext();
  const eyebrow = clientDisplayName?.trim() || companyName?.trim() || 'Fleet';
  const shown = useFleetVesselsShown();
  const [params, setParams] = useSearchParams();
  const period = parseReportPeriod(params.get('period'));
  const ready = shown.status === 'ready' ? shown : null;
  const scope = useMemo<ReportScope | null>(
    () => (ready ? { companyId: ready.companyId, vesselIds: ready.shownIds, fleetWide: ready.isDefault } : null),
    [ready],
  );
  const kpis = useFleetDashboardKpis(scope);
  const trends = useReportTrends(scope, period);

  const queryClient = useQueryClient();
  const companyId = ready?.companyId ?? null;
  const refreshing =
    useIsFetching({ queryKey: reportsKeys.company(companyId) }) + useIsFetching({ queryKey: dashboardKeys.fleet(companyId) }) > 0;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: reportsKeys.company(companyId) });
    void queryClient.invalidateQueries({ queryKey: dashboardKeys.fleet(companyId) });
  };

  // One stamp (D-88): the older of the two reads on screen.
  const stamps = [kpis, trends].flatMap((s) => (s.state === 'ready' ? [s.updatedAt] : []));
  const generatedAt = stamps.length ? Math.min(...stamps) : null;
  const vesselsParam = ready && !ready.isDefault ? params.get(VESSELS_SHOWN_PARAM) : null;
  const shownCount = ready?.shownIds.length ?? 0;

  const description = ready
    ? ready.isDefault
      ? `Trends and reports across ${plural(shownCount, 'vessel')}.`
      : `Trends and reports across ${plural(shownCount, 'vessel')} shown of ${ready.vessels.length.toLocaleString('en-GB')}.`
    : 'Trends and reports across the vessels you reach.';

  const setPeriod = (value: string) => {
    if (!value) return;
    setParams((current) => writeReportPeriod(parseReportPeriod(value), current), { replace: true });
  };

  const header = (
    <PageHeader
      eyebrow={eyebrow}
      title="Fleet reports"
      description={description}
      actions={
        ready ? (
          <>
            {generatedAt ? (
              <span className="type-caption tabular-nums text-muted-foreground" data-testid="reports-generated">
                {formatGeneratedStamp('Fleet', generatedAt)}
              </span>
            ) : null}
            <Button type="button" variant="outline" size="sm" className={COARSE} onClick={refresh} disabled={refreshing}>
              <RefreshCw aria-hidden="true" className={cn('h-4 w-4', refreshing && 'motion-safe:animate-spin')} />
              Refresh
            </Button>
          </>
        ) : null
      }
    />
  );

  if (shown.status === 'error') {
    return (
      <div className="space-y-4">
        {header}
        <PageError error={shown.error} title="Your vessels could not load" onRetry={shown.retry} />
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="space-y-4">
        {header}
        <PageLoading variant="tiles" label="Loading fleet reports" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <div role="group" aria-label="Report view" className="flex flex-wrap items-center gap-3">
        <FleetVesselsFilter
          vessels={ready.vessels}
          selectedIds={ready.shownIds}
          countedIds={ready.countedIds}
          fleetGroups={ready.fleetGroups}
          droppedCodes={ready.droppedCodes}
          onApply={ready.setShown}
        />
        <ToggleGroup
          type="single"
          value={String(period)}
          onValueChange={setPeriod}
          aria-label="Period"
          className="rounded-md border border-border bg-card p-0.5"
        >
          {REPORT_PERIODS.map((p) => (
            <ToggleGroupItem key={p} value={String(p)} aria-label={`Last ${periodLabel(p)}`} className={cn('px-3 text-sm', COARSE)}>
              {periodLabel(p)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {shownCount === 0 ? (
        <EmptyState
          title="No vessels to report on"
          body="Fleet reports count the vessels you can reach. None is set up for you yet; ask your account admin."
          headingLevel={2}
          bordered
        />
      ) : (
        <>
          <CurrentPosition kpis={kpis} vesselsParam={vesselsParam} />
          <Trends state={trends} period={period} />
        </>
      )}

      <Catalogue vesselsParam={vesselsParam} />
    </div>
  );
}

// ─── Current position ───────────────────────────────────────────────────

function CurrentPosition({ kpis, vesselsParam }: { kpis: ReturnType<typeof useFleetDashboardKpis>; vesselsParam: string | null }) {
  const tiles = buildFleetKpiTiles(fleetKpisInput(kpis), { knownReportKeys: FLEET_REPORT_KEYS, vesselsParam }).filter(
    (t) => POSITION_TILES.includes(t.key) && t.state !== 'no-access',
  );
  return (
    <section aria-labelledby="reports-position" className="space-y-3">
      <div>
        <h2 id="reports-position" className="type-title text-foreground">
          Current position
        </h2>
        <p className="text-sm text-muted-foreground">Today, across the vessels shown.</p>
      </div>
      {tiles.length === 0 ? (
        <EmptyState
          kind="no-access"
          title="No current figures you can see"
          body="The figures come from the fleet dashboard. Ask your account admin for access to it."
          headingLevel={3}
          bordered
          compact
        />
      ) : (
        <KpiGrid className="min-[1440px]:grid-cols-4">
          {tiles.map((tile) => (
            <KpiTile
              key={tile.key}
              label={tile.label}
              icon={TILE_ICONS[tile.key]}
              value={tile.value}
              sub={tile.parts ? <SubParts parts={tile.parts} /> : tile.sub}
              tone={tile.tone}
              href={tile.href}
              state={tile.state}
              zeroLabel={tile.zeroLabel}
              notEnabledReason={tile.notEnabledReason}
              errorMessage={tile.errorMessage}
              onRetry={kpis.state === 'error' ? kpis.retry : undefined}
            />
          ))}
        </KpiGrid>
      )}
    </section>
  );
}

// ─── Trends ─────────────────────────────────────────────────────────────

function ChartsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading the trends" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4">
          <Skeleton className="mb-2 h-4 w-32" />
          <Skeleton className="mb-4 h-3 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      ))}
    </div>
  );
}

function Trends({ state, period }: { state: ReportDataState<FleetReportTrendsJson>; period: ReportPeriod }) {
  let body: React.ReactNode;
  if (state.state === 'not_set_up') {
    body = (
      <PageEmpty
        icon={BarChart3}
        title="This report is not set up yet"
        body="Monthly incidents, corrective actions, drills and document expiries appear here once fleet reports are set up for your account."
        headingLevel={3}
        bordered
        compact
      />
    );
  } else if (state.state === 'error') {
    body = <PageError variant="inline" title="The trends could not load" error={state.error} onRetry={state.retry} />;
  } else if (state.state === 'ready') {
    const cards = trendCards(state.data);
    body = cards.length ? (
      <Suspense fallback={<ChartsLoading />}>
        <TrendCharts cards={cards} period={period} />
      </Suspense>
    ) : (
      <EmptyState
        kind="no-access"
        title="No trends you can see"
        body="The trends follow your access to incidents, corrective actions, drills and documents."
        headingLevel={3}
        bordered
        compact
      />
    );
  } else {
    body = <ChartsLoading />;
  }
  return (
    <section aria-labelledby="reports-trends" className="space-y-3">
      <div>
        <h2 id="reports-trends" className="type-title text-foreground">
          Trends
        </h2>
        <p className="text-sm text-muted-foreground">
          The last {periodLabel(period)}, month by month; document expiries look {periodLabel(period)} ahead.
        </p>
      </div>
      {body}
    </section>
  );
}

// ─── Catalogue ──────────────────────────────────────────────────────────

const FLEET_REPORTS = reportsForScope('fleet');

function ReportCard({ report, vesselsParam }: { report: ReportDefinition; vesselsParam: string | null }) {
  const query = report.load && vesselsParam ? new URLSearchParams({ vessels: vesselsParam }) : null;
  return (
    <Link
      to={fleetReportPath(report, query)}
      className="group flex h-full items-start gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground transition-colors hover:bg-accent focus-ring"
    >
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="type-subtitle text-foreground">{report.title}</span>
          <Badge variant="neutral">{report.moduleChip}</Badge>
        </span>
        <span className="type-body-sm block text-muted-foreground">{report.description}</span>
      </span>
      <ArrowRight aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function Catalogue({ vesselsParam }: { vesselsParam: string | null }) {
  const access = useReportAccess(FLEET_REPORTS);
  const groups = REPORT_GROUPS.map((g) => ({ ...g, reports: access.allowed.filter((r) => r.group === g.id) })).filter((g) => g.reports.length);
  return (
    <section aria-labelledby="reports-catalogue" className="space-y-4">
      <h2 id="reports-catalogue" className="type-title text-foreground">
        All reports
      </h2>
      {access.status === 'loading' ? (
        <div aria-busy="true" aria-label="Loading the reports" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          kind="no-access"
          title="No reports you can open"
          body="Each report follows your access to its data. Ask your account admin if you need one."
          headingLevel={3}
          bordered
          compact
        />
      ) : (
        groups.map((group) => (
          <section key={group.id} aria-labelledby={`reports-group-${group.id}`} className="space-y-2">
            <div>
              <h3 id={`reports-group-${group.id}`} className="type-eyebrow text-muted-foreground">
                {group.title}
              </h3>
            </div>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.reports.map((report) => (
                <li key={report.key}>
                  <ReportCard report={report} vesselsParam={vesselsParam} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}
