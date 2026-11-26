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
 * - Ranked lists: `fleet_dashboard_panels`, most urgent first with "n of m".
 * - Activity: the latest crew joins and sign-offs.
 *
 * D-01: an RPC that is missing shows "Not set up yet" on the tiles and a
 * PageEmpty for the lists; any other error says so with Retry; never zeros
 * on error and never sample data. Tokens only; at 390 px the tiles are
 * 2-up and the lists one column.
 */
import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  CalendarClock,
  ClipboardCheck,
  FileWarning,
  Gauge,
  GraduationCap,
  RefreshCw,
  Siren,
  Umbrella,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Tone } from '@/components/ui/tones';
import { useCapability } from '@/lib/permissions/useCan';
import { EXPIRY_BUCKETS, type ExpiryBucket } from '@/lib/records/expiry';
import { AccessDenied, EmptyState, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { ExpiryPill, StatusPill } from '@/shared/components/status';
import { FleetVesselsFilter, VESSELS_SHOWN_PARAM, useFleetVesselsShown } from '@/modules/fleet';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import { useRecentCrewChanges } from '@/modules/crew/hooks/useCrew';
import FleetDashboardHeader from '../components/FleetDashboardHeader';
import { RecentCrewChangesCard } from '../components/FleetDashboardWidgets';
import { FleetKpiRow } from '../components/fleet/FleetKpiRow';
import { useOpenAlertCounts } from '../hooks/useOpenAlertCounts';
import {
  FleetDashboardError,
  dashboardKeys,
  useFleetDashboardKpis,
  useFleetDashboardPanels,
  type FleetDashboardScope,
  type FleetDashboardState,
} from '../hooks/useFleetDashboard';
import { FLEET_DASHBOARD_VIEW, fleetKpisInput, formatFreshnessUtc } from '../lib/fleetKpiRules';
import { FLEET_REPORT_PATHS } from './FleetReportsIndex';
import type { FleetDashboardPanelsJson, FleetExpiryPanelItem, FleetPanelVessel } from '../types/db.pending';

/** The report keys the report registry knows today (the fleet reports index, until X5-03A's registry). */
const KNOWN_REPORT_KEYS: ReadonlySet<string> = new Set(FLEET_REPORT_PATHS);

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
        <RankedLists panels={panels} />
      </section>

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

// ─── Ranked lists ───────────────────────────────────────────────────────

interface ListRow {
  id: string;
  primary: string;
  secondary?: string;
  href?: string;
  badge: React.ReactNode;
}

interface ListCardProps {
  title: string;
  /** A short scope line under the title ("Next 90 days"). */
  hint?: string;
  icon: LucideIcon;
  /** A list the caller has no access to is not rendered at all. */
  state: 'ok' | 'module_off' | 'not_tracked';
  total?: number;
  rows?: ListRow[];
  emptyText: string;
  offText?: string;
}

const BUCKETS: ReadonlySet<string> = new Set(EXPIRY_BUCKETS);
const asBucket = (value: string): ExpiryBucket | null => (BUCKETS.has(value) ? (value as ExpiryBucket) : null);

function vesselLabel(v: FleetPanelVessel): string {
  return v.vessel_name ?? (v.vessel_id ? 'Vessel' : 'Fleet');
}

function inVessel(v: FleetPanelVessel, rel: string): string | undefined {
  return v.vessel_code ? vesselPath(v.vessel_code, rel) : undefined;
}

/** Whole days from `from` to `to` (both `yyyy-MM-dd`, counted as calendar dates). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function daysPill(daysLeft: number, dueLabel = 'Due'): React.ReactNode {
  if (daysLeft < 0) return <StatusPill tone="danger" label={`${Math.abs(daysLeft)} d overdue`} />;
  if (daysLeft === 0) return <StatusPill tone="orange" label={`${dueLabel} today`} />;
  const tone: Tone = daysLeft <= 30 ? 'warn' : 'neutral';
  return <StatusPill tone={tone} label={`${dueLabel} in ${daysLeft} d`} />;
}

function expiryRow(item: FleetExpiryPanelItem): ListRow {
  const bucket = asBucket(item.bucket);
  const badge =
    item.endorsement_state === 'overdue' && bucket !== 'expired' ? (
      <StatusPill tone="danger" label="Endorsement overdue" />
    ) : bucket ? (
      <ExpiryPill bucket={bucket} daysRemaining={item.days_remaining} expiresOn={item.expires_on} />
    ) : (
      <StatusPill tone="neutral" label={item.bucket} />
    );
  return {
    id: `${item.source_key}:${item.record_id}:${item.item_type}`,
    primary: item.label,
    secondary: [item.person_name, vesselLabel(item), item.detail].filter(Boolean).join(' · '),
    href: item.link_scope === 'vessel' ? inVessel(item, item.link_rel) : undefined,
    badge,
  };
}

function ListCard({ title, hint, icon: Icon, state, total, rows = [], emptyText, offText }: ListCardProps) {
  const headingId = React.useId();
  return (
    <Card className="flex h-full min-w-0 flex-col" aria-labelledby={headingId} role="region">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0">
          <h3 id={headingId} className="flex min-w-0 items-center gap-2 type-subtitle text-foreground">
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{title}</span>
          </h3>
          {hint ? <p className="type-caption mt-0.5 pl-6 text-muted-foreground">{hint}</p> : null}
        </div>
        {state === 'ok' && total !== undefined && total > 0 ? (
          <span className="shrink-0 type-caption tabular-nums text-muted-foreground" data-testid="list-count">
            {rows.length < total ? `${rows.length} of ${total}` : plural(total, 'item')}
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="flex-1">
        {state === 'module_off' ? (
          <p className="text-sm text-muted-foreground">{offText ?? 'Switched off on every vessel shown.'}</p>
        ) : state === 'not_tracked' ? (
          <p className="text-sm text-muted-foreground">Not tracked yet.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const body = (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 break-words text-sm font-medium text-foreground">{row.primary}</p>
                    {row.secondary ? <p className="truncate text-xs text-muted-foreground">{row.secondary}</p> : null}
                  </div>
                  <div className="shrink-0">{row.badge}</div>
                </>
              );
              return (
                <li key={row.id}>
                  {row.href ? (
                    <Link
                      to={row.href}
                      className="-mx-2 flex min-h-11 items-center gap-3 rounded-md px-2 py-2 transition-colors duration-quick ease-tide hover:bg-accent/40 focus-ring"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex min-h-11 items-center gap-3 py-2">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const SAFETY_OFF = 'Safety is off on every vessel shown.';
const TECHNICAL_OFF = 'Technical is off on every vessel shown.';

function buildCards(data: FleetDashboardPanelsJson): ListCardProps[] {
  const cards: ListCardProps[] = [];

  if (data.expiry.state === 'ok') {
    const g = data.expiry.groups;
    cards.push(
      { title: 'Vessel certificates', icon: Award, state: 'ok', total: g.vessel_certificates.total, rows: g.vessel_certificates.items.map(expiryRow), emptyText: 'No certificate expired or expiring.' },
      { title: 'Crew documents', icon: FileWarning, state: 'ok', total: g.crew_documents.total, rows: g.crew_documents.items.map(expiryRow), emptyText: 'No crew document expired or expiring.' },
      { title: 'Crew qualifications', icon: GraduationCap, state: 'ok', total: g.crew_qualifications.total, rows: g.crew_qualifications.items.map(expiryRow), emptyText: 'No qualification expired or expiring.' },
    );
  }

  const ca = data.corrective_actions;
  if (ca.state !== 'no_access') {
    cards.push({
      title: 'Corrective actions',
      icon: ClipboardCheck,
      state: ca.state,
      offText: SAFETY_OFF,
      total: ca.state === 'ok' ? ca.total : undefined,
      rows:
        ca.state === 'ok'
          ? ca.items.map((item) => ({
              id: item.id,
              primary: `${item.action_number} · ${item.description}`,
              secondary: [vesselLabel(item), item.status].join(' · '),
              badge: item.days_overdue > 0 ? <StatusPill tone="danger" label={`${item.days_overdue} d overdue`} /> : daysPill(daysBetween(data.today, item.due_date)),
            }))
          : [],
      emptyText: 'No open corrective action.',
    });
  }

  const drills = data.overdue_drills;
  if (drills.state !== 'no_access') {
    cards.push({
      title: 'Overdue drills',
      icon: Siren,
      state: drills.state,
      offText: SAFETY_OFF,
      total: drills.state === 'ok' ? drills.total : undefined,
      rows:
        drills.state === 'ok'
          ? drills.items.map((item) => ({
              id: item.id,
              primary: item.drill_type ?? item.drill_number,
              secondary: [vesselLabel(item), item.drill_number].filter(Boolean).join(' · '),
              href: inVessel(item, 'safety/drills'),
              badge: <StatusPill tone="danger" label={`${item.days_overdue} d overdue`} />,
            }))
          : [],
      emptyText: 'No drill overdue.',
    });
  }

  const hess = data.hess;
  if (hess.state !== 'no_access') {
    cards.push({
      title: 'HESS meetings',
      hint: 'Due in the next 14 days',
      icon: Users,
      state: hess.state,
      offText: SAFETY_OFF,
      total: hess.state === 'ok' ? hess.total : undefined,
      rows: hess.state === 'ok' ? hess.items.map((item) => ({ id: item.vessel_id ?? item.next_due_on, primary: vesselLabel(item), badge: daysPill(item.days_remaining) })) : [],
      emptyText: 'No HESS meeting due in the next 14 days.',
    });
  }

  const ins = data.insurance;
  if (ins.state !== 'no_access') {
    cards.push({
      title: 'Insurance renewals',
      hint: 'Next 90 days',
      icon: Umbrella,
      state: ins.state,
      total: ins.state === 'ok' ? ins.total : undefined,
      rows:
        ins.state === 'ok'
          ? ins.items.map((item) => {
              const bucket = asBucket(item.bucket);
              return {
                id: item.record_id,
                primary: item.label,
                secondary: [vesselLabel(item), item.detail].filter(Boolean).join(' · '),
                href: item.link_scope === 'vessel' ? inVessel(item, item.link_rel) : undefined,
                badge: bucket ? <ExpiryPill bucket={bucket} daysRemaining={item.days_remaining} expiresOn={item.expires_on} /> : <StatusPill tone="neutral" label={item.bucket} />,
              };
            })
          : [],
      emptyText: 'No policy expires in the next 90 days.',
    });
  }

  const surveys = data.surveys;
  if (surveys.state !== 'no_access') {
    cards.push({
      title: 'Audits and surveys',
      hint: 'Next 90 days',
      icon: CalendarClock,
      state: surveys.state,
      total: surveys.state === 'ok' ? surveys.total : undefined,
      rows:
        surveys.state === 'ok'
          ? surveys.items.map((item) => ({
              id: `${item.kind}:${item.id}`,
              primary: item.label,
              secondary: [vesselLabel(item), item.kind === 'certificate_survey' ? 'Certificate survey' : 'Audit', item.reference].filter(Boolean).join(' · '),
              href: item.kind === 'certificate_survey' ? inVessel(item, 'certificates') : undefined,
              badge: daysPill(item.days_remaining),
            }))
          : [],
      emptyText: 'No audit or survey in the next 90 days.',
    });
  }

  const work = data.work_list;
  if (work.state !== 'no_access') {
    const vessels = work.state === 'ok' ? work.vessels : [];
    cards.push({
      title: 'Work list',
      icon: Wrench,
      state: work.state,
      offText: TECHNICAL_OFF,
      total: work.state === 'ok' ? vessels.length : undefined,
      rows: vessels.map((v) => ({
        id: v.vessel_id,
        primary: v.vessel_name,
        secondary: `${plural(v.open, 'open job')}${v.pending_approval > 0 ? ` · ${v.pending_approval} awaiting approval` : ''}`,
        href: v.vessel_code ? vesselPath(v.vessel_code, 'technical') : undefined,
        badge: v.overdue > 0 ? <StatusPill tone="danger" label={`${v.overdue} overdue`} /> : <StatusPill tone="ok" label="On track" />,
      })),
      emptyText: 'No vessel with Technical on.',
    });
  }

  return cards;
}

function RankedLists({ panels }: { panels: FleetDashboardState<FleetDashboardPanelsJson> }) {
  switch (panels.state) {
    case 'ready': {
      const cards = buildCards(panels.data);
      if (cards.length === 0) {
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="fleet-dashboard-lists">
          {cards.map((card) => (
            <ListCard key={card.title} {...card} />
          ))}
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
