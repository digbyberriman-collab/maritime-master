/**
 * Fleet › Dashboard (`/fleet/dashboard`; gap/02 D1, D3, D4, D6, D7, W9;
 * DECISIONS D-82, D-88, D-103). The shore-side overview across the vessels
 * shown, in the reference's order of information: tiles → ranked lists →
 * activity.
 *
 * - Gate: `fleet.operations.fleet_dashboard.view` (the route guard uses the
 *   same key). Nothing is read until it is granted: while it loads the page
 *   is a skeleton, denied is AccessDenied (D-04, fail closed).
 * - Header: PageHeader with the company as eyebrow, "Fleet dashboard", the
 *   number of vessels shown; the "Vessels shown" filter (D-X5-09), one
 *   freshness stamp from the KPI read and the Refresh that re-reads it (D-88).
 * - Tiles: FleetKpiRow from `fleet_dashboard_kpis` (server counts, per-tile
 *   gates and module settings) plus the open-alerts tile on the alert scope.
 * - Needs attention: `fleet_dashboard_panels` (one read for every list) as
 *   the dedicated panels: documents and certificates (D9), safety and
 *   compliance (D10), renewals and surveys (D12), the work list (D13);
 *   most urgent first, "n of m", "View all" to the filtered report once the
 *   registry knows it.
 * - Vessel health: the matrix on `fleet_vessel_comparison` with "Compare all
 *   vessels" (D15).
 * - Fleet groups: one mini map per fleet group plus Ungrouped, reported
 *   positions only (D2, D-38).
 * - Activity: the latest crew joins and sign-offs.
 *
 * D-01: an RPC that is missing shows "Not set up yet" on the tiles and a
 * PageEmpty for the lists; any other error says so with Retry; never zeros
 * on error and never sample data. Tokens only; at 390 px the tiles are
 * 2-up, the panels and maps one column, and the matrix scrolls inside its
 * card.
 */
import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { Gauge, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCapability } from '@/lib/permissions/useCan';
import { AccessDenied, EmptyState, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { FleetVesselsFilter, VESSELS_SHOWN_PARAM, useFleetVesselsShown } from '@/modules/fleet';
import { useRecentCrewChanges } from '@/modules/crew/hooks/useCrew';
import FleetDashboardHeader from '../components/FleetDashboardHeader';
import { RecentCrewChangesCard } from '../components/FleetDashboardWidgets';
import { FleetKpiRow } from '../components/fleet/FleetKpiRow';
import { ExpiryPanels, type PanelListKey, type PanelScope } from '../components/fleet/ExpiryPanels';
import { SafetyPanels } from '../components/fleet/SafetyPanels';
import { InsuranceSurveysPanel } from '../components/fleet/InsuranceSurveysPanel';
import { WorkListPanel } from '../components/fleet/WorkListPanel';
import { VesselHealthMatrix } from '../components/fleet/VesselHealthMatrix';
import { FleetGroupMaps } from '../components/fleet/FleetGroupMaps';
import { useOpenAlertCounts } from '../hooks/useOpenAlertCounts';
import {
  FleetDashboardError,
  dashboardKeys,
  useFleetDashboardKpis,
  useFleetDashboardPanels,
  useFleetVesselComparison,
  type FleetDashboardScope,
  type FleetDashboardState,
} from '../hooks/useFleetDashboard';
import { FLEET_DASHBOARD_VIEW, fleetKpisInput, fleetReportHref, formatFreshnessUtc } from '../lib/fleetKpiRules';
import { FLEET_REPORT_PATHS } from './FleetReportsIndex';
import type { FleetDashboardPanelsJson } from '../types/db.pending';

/** The report keys the report registry knows today (the fleet reports index, until X5-03A's registry). */
const KNOWN_REPORT_KEYS: ReadonlySet<string> = new Set(FLEET_REPORT_PATHS);

/** The report each ranked list's "View all" opens (gap/02 R-keys); a link only once the registry knows it. */
const LIST_REPORT_KEY: Readonly<Record<PanelListKey, string | null>> = {
  vessel_certificates: 'fleet-certificates',
  crew_documents: 'crew-documents',
  crew_qualifications: 'crew-qualifications',
  corrective_actions: 'capa-tracker',
  overdue_drills: 'overdue-drills',
  hess: null,
  insurance: 'insurance',
  surveys: 'audits-surveys',
  work_list: 'work-list',
};

/** The Vessel comparison report (X5-03A) behind "Compare all vessels". */
const VESSEL_COMPARISON_REPORT = 'vessel-comparison';

const FleetDashboardPage: React.FC = () => {
  const access = useCapability(FLEET_DASHBOARD_VIEW);
  if (access.status === 'loading') {
    return <PageLoading variant="tiles" label="Loading the fleet dashboard" />;
  }
  if (!access.allowed) {
    return <AccessDenied detail="The fleet dashboard needs access to fleet operations. If you think you should see it, ask your account admin." />;
  }
  return <FleetDashboardBody />;
};

export default FleetDashboardPage;

// ─── Body ───────────────────────────────────────────────────────────────

const plural = (n: number, one: string, many: string = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

function FleetDashboardBody() {
  const shown = useFleetVesselsShown();
  const [params] = useSearchParams();
  const ready = shown.status === 'ready' ? shown : null;

  const scope = useMemo<FleetDashboardScope | null>(
    () => (ready ? { companyId: ready.companyId, vesselIds: ready.shownIds, fleetWide: ready.isDefault } : null),
    [ready],
  );
  const kpis = useFleetDashboardKpis(scope);
  const panels = useFleetDashboardPanels(scope);
  const comparison = useFleetVesselComparison(scope);
  const alerts = useOpenAlertCounts();
  const crewChanges = useRecentCrewChanges(5);

  const shownCount = ready?.shownIds.length ?? 0;
  const description = ready
    ? ready.isDefault
      ? plural(shownCount, 'vessel')
      : `${plural(shownCount, 'vessel')} shown of ${ready.vessels.length.toLocaleString('en-GB')}`
    : undefined;

  // Refresh re-reads every dashboard query of this company (a "not set up yet" answer too, so an
  // RPC applied meanwhile shows up), the alert counts and the crew changes.
  const queryClient = useQueryClient();
  const companyId = ready?.companyId ?? null;
  const refreshing = useIsFetching({ queryKey: dashboardKeys.fleet(companyId) }) > 0;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: dashboardKeys.fleet(companyId) });
    alerts.retry();
    void crewChanges.refetch();
  };

  const actions = ready ? (
    <>
      <FleetVesselsFilter
        vessels={ready.vessels}
        selectedIds={ready.shownIds}
        countedIds={ready.countedIds}
        fleetGroups={ready.fleetGroups}
        droppedCodes={ready.droppedCodes}
        onApply={ready.setShown}
      />
      {kpis.state === 'ready' ? (
        <span className="type-caption tabular-nums text-muted-foreground" data-testid="fleet-dashboard-updated">
          {formatFreshnessUtc(kpis.updatedAt)}
        </span>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="[@media(pointer:coarse)]:min-h-11"
        onClick={refresh}
        disabled={refreshing}
      >
        <RefreshCw aria-hidden="true" className={cn('h-4 w-4', refreshing && 'motion-safe:animate-spin')} />
        Refresh
      </Button>
    </>
  ) : null;

  const header = <FleetDashboardHeader description={description} actions={actions} />;

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
        <PageLoading variant="tiles" label="Loading the fleet dashboard" />
      </div>
    );
  }
  if (shownCount === 0) {
    return (
      <div className="space-y-4">
        {header}
        <EmptyState
          title="No vessels to show"
          body="The fleet dashboard counts the vessels you can reach. None is set up for you yet; ask your account admin."
          headingLevel={2}
          bordered
        />
      </div>
    );
  }

  const outOfReach = kpis.state === 'error' && kpis.error instanceof FleetDashboardError && kpis.error.reason === 'vessel_out_of_reach';
  const vesselsParam = ready.isDefault ? null : params.get(VESSELS_SHOWN_PARAM);
  const panelScope: PanelScope = {
    scope: 'fleet',
    viewAllHref: (list) => fleetReportHref(LIST_REPORT_KEY[list], KNOWN_REPORT_KEYS, { vessels: vesselsParam }),
  };

  return (
    <div className="space-y-6">
      {header}

      {outOfReach ? (
        <PageError
          variant="inline"
          title="Some vessels shown are out of reach"
          error={kpis.error}
          onRetry={ready.showAll}
          headingLevel={2}
        />
      ) : null}

      <FleetKpiRow
        kpis={fleetKpisInput(kpis)}
        onRetry={kpis.state === 'error' ? kpis.retry : undefined}
        alerts={alerts}
        knownReportKeys={KNOWN_REPORT_KEYS}
        vesselsParam={vesselsParam}
      />

      <section aria-labelledby="fleet-dashboard-lists" className="space-y-3">
        <h2 id="fleet-dashboard-lists" className="type-title text-foreground">
          Needs attention
        </h2>
        <NeedsAttention panels={panels} scope={panelScope} />
      </section>

      <VesselHealthMatrix
        state={comparison}
        compareHref={fleetReportHref(VESSEL_COMPARISON_REPORT, KNOWN_REPORT_KEYS, { vessels: vesselsParam })}
      />

      <FleetGroupMaps companyId={ready.companyId} vessels={ready.shownVessels} />

      <section aria-labelledby="fleet-dashboard-activity" className="space-y-3">
        <h2 id="fleet-dashboard-activity" className="type-title text-foreground">
          Activity
        </h2>
        <div className="grid grid-cols-1 gap-4">
          <RecentCrewChangesCard
            changes={crewChanges.data}
            isLoading={crewChanges.isPending}
            isError={crewChanges.isError}
            onRetry={() => void crewChanges.refetch()}
          />
        </div>
      </section>
    </div>
  );
}

// ─── Needs attention ────────────────────────────────────────────────────

/** Whether any ranked list is shown (the panels' own rule), to tell "none for your role" from the lists. */
function anyListShown(data: FleetDashboardPanelsJson, scope: PanelScope): boolean {
  const shown = ExpiryPanels.listShown;
  const expiry = data.expiry.state === 'ok' ? 'ok' : 'no_access';
  return (
    shown('vessel_certificates', expiry, scope) ||
    shown('crew_documents', expiry, scope) ||
    shown('crew_qualifications', expiry, scope) ||
    shown('corrective_actions', data.corrective_actions.state, scope) ||
    shown('overdue_drills', data.overdue_drills.state, scope) ||
    shown('hess', data.hess.state, scope) ||
    shown('insurance', data.insurance.state, scope) ||
    shown('surveys', data.surveys.state, scope) ||
    shown('work_list', data.work_list.state, scope)
  );
}

function NeedsAttention({ panels, scope }: { panels: FleetDashboardState<FleetDashboardPanelsJson>; scope: PanelScope }) {
  switch (panels.state) {
    case 'ready': {
      const data = panels.data;
      if (!anyListShown(data, scope)) {
        return (
          <EmptyState
            kind="no-access"
            title="No lists for your role"
            body="Your role does not include the records these lists are built from."
            headingLevel={3}
            bordered
            compact
          />
        );
      }
      return (
        <div className="space-y-6" data-testid="fleet-dashboard-lists">
          <ExpiryPanels expiry={data.expiry} {...scope} />
          <SafetyPanels correctiveActions={data.corrective_actions} drills={data.overdue_drills} hess={data.hess} today={data.today} {...scope} />
          <div className="grid grid-cols-1 gap-x-4 gap-y-6 xl:grid-cols-3">
            <InsuranceSurveysPanel insurance={data.insurance} surveys={data.surveys} className="xl:col-span-2" {...scope} />
            <WorkListPanel workList={data.work_list} {...scope} />
          </div>
        </div>
      );
    }
    case 'not_set_up':
      return (
        <PageEmpty
          icon={Gauge}
          title="The ranked lists are not set up yet"
          body="Expiring documents, open actions, overdue drills and the work list appear here once the fleet dashboard is set up for your account."
          headingLevel={3}
          bordered
          compact
        />
      );
    case 'error':
      return (
        <PageError
          variant="inline"
          title="The ranked lists could not load"
          error={panels.error}
          onRetry={panels.retry}
          headingLevel={3}
          treatMissingAsOff={false}
        />
      );
    default:
      return <PageLoading variant="cards" rows={3} label="Loading the ranked lists" />;
  }
}
