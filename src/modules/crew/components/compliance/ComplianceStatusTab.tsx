import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertOctagon, CheckCircle2, CircleDashed, Clock, LayoutGrid, Settings2, ShieldCheck, Table2, Users } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CountChips, KpiGrid, KpiTile, SearchField, TABLET_MIN_WIDTH, useMinWidth } from '@/shared/components/data';
import { AccessDenied, EmptyState, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { statusLabel } from '@/shared/components/status';
import { useCan } from '@/lib/permissions/useCan';
import { CREW_CAPS } from '@/modules/crew/paths';
import { useDepartments } from '@/modules/crew/hooks/useReferenceData';
import { useVesselCompliance, COMPLIANCE_NOT_SET_UP_NOTICE } from '@/modules/crew/hooks/useVesselCompliance';
import { useVesselCrewList } from '@/modules/crew/hooks/useVesselCrewList';
import { localDay } from '@/modules/crew/lib/crewListModel';
import type { CrewStatus } from '@/modules/crew/lib/crewStatus';
import {
  STATUS_FILTER_ORDER,
  STATUS_VIEWS,
  STATUS_VIEW_LABEL,
  complianceKpis,
  complianceSearch,
  effectiveLayout,
  filterPeople,
  groupPeople,
  kpiPeople,
  parseComplianceParams,
  requirementColumns,
  statusCounts,
  viewTab,
  withComplianceParams,
  type ComplianceParams,
  type DepartmentInfo,
  type GroupOption,
  type LayoutOption,
  type ShowOption,
  type StatusView,
} from '@/modules/crew/lib/complianceModel';
import { ComplianceCards } from './ComplianceCards';
import { ComplianceStatusMatrix } from './ComplianceStatusMatrix';
import { Dot } from './ComplianceCells';
import { STATE_ICON } from './cellLook';
import { Segmented } from './Segmented';
import { buildRowModels, type ComplianceRowModel } from './statusRows';

export interface ComplianceVessel {
  id: string;
  companyId: string;
  name: string;
}

const ALL = 'all';

/** The cell legend: each state's icon and word (the meaning is never in the colour alone). */
const Legend: React.FC = () => (
  <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 type-caption text-muted-foreground" aria-label="What the cells mean" data-compliance-legend="">
    {(
      [
        ['met', 'Met'],
        ['expiring', 'Expiring'],
        ['expired', 'Expired'],
        ['missing', 'Missing'],
        ['not_required', 'Not required'],
      ] as const
    ).map(([state, word]) => {
      const Icon = STATE_ICON[state];
      return (
        <li key={state} className="inline-flex items-center gap-1.5">
          <Icon aria-hidden="true" className="h-3.5 w-3.5" />
          {word}
        </li>
      );
    })}
    <li className="inline-flex items-center gap-1.5">
      <Dot dot="warn" className="h-4 w-4" />
      Amber: expiring, conditionally approved or no expiry date
    </li>
  </ul>
);

const SHOW: ReadonlyArray<{ value: ShowOption; label: string }> = [
  { value: 'all', label: 'All crew' },
  { value: 'onboard', label: 'On board' },
];
const GROUP: ReadonlyArray<{ value: GroupOption; label: string }> = [
  { value: 'dept', label: 'By department' },
  { value: 'flat', label: 'One list' },
];
const LAYOUT: ReadonlyArray<{ value: LayoutOption; label: string; icon: typeof Table2 }> = [
  { value: 'matrix', label: 'Matrix', icon: Table2 },
  { value: 'cards', label: 'Cards', icon: LayoutGrid },
];

/**
 * The Status tab of Crew Compliance (gap/04 C35, W5 §4): KPI tiles (Total,
 * Compliant, Expiring, Expired, Missing), the views (Overview, Gaps and one
 * per tab), on board or everyone, by department or one list, and the matrix
 * (cards below 768 px). Everything the reader sets is in the URL, so a link
 * opens the same view (the legacy /crew/certificates lands on
 * ?view=documents).
 *
 * Reads crew_vessel_compliance and crew_vessel_requirement_status (one gate
 * on the server, crew_compliance.view). D-01: while they are not applied
 * the tab says so (PageEmpty); a refusal is AccessDenied; any other error
 * is an error with Retry. On board comes from the crew list when the reader
 * may see it, else from the placement.
 */
export const ComplianceStatusTab: React.FC<{ vessel: ComplianceVessel; configurationHref: string; profileHref: ((profileId: string) => string) | null }> = ({
  vessel,
  configurationHref,
  profileHref,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const params = React.useMemo(() => parseComplianceParams(searchParams), [searchParams]);
  const setParams = React.useCallback(
    (patch: Partial<ComplianceParams>) => setSearchParams((current) => withComplianceParams(current, patch), { replace: true }),
    [setSearchParams],
  );
  const wide = useMinWidth(TABLET_MIN_WIDTH);
  const layout = effectiveLayout(params.layout, wide);
  const [today] = React.useState(() => localDay(new Date()));

  const compliance = useVesselCompliance(vessel.id, { companyId: vessel.companyId, detail: 'cells' });
  const deptList = useDepartments();
  const departments = React.useMemo<ReadonlyMap<string, DepartmentInfo>>(
    () => new Map(deptList.items.map((d) => [d.key, { label: d.label, sortOrder: d.sortOrder }])),
    [deptList.items],
  );
  const canSeeList = useCan(CREW_CAPS.crewListView, { vesselId: vessel.id });
  const list = useVesselCrewList({ id: vessel.id, companyId: vessel.companyId }, today, { enabled: canSeeList });
  const listRows = list.status === 'ready' ? list.rows : null;
  const crewStatus = React.useMemo<ReadonlyMap<string, CrewStatus> | null>(
    () => (listRows ? new Map(listRows.map((r) => [r.profileId, r.status])) : null),
    [listRows],
  );

  const ready = compliance.status === 'ready' ? compliance.compliance : null;
  const ctx = React.useMemo(() => ({ crewStatus, departments }), [crewStatus, departments]);
  const counted = React.useMemo(() => (ready ? kpiPeople(ready.people, params, ctx) : []), [ready, params, ctx]);
  const shown = React.useMemo(() => (ready ? filterPeople(ready.people, params, ctx) : []), [ready, params, ctx]);
  const models = React.useMemo(() => (ready ? buildRowModels(shown, ready.statusByProfile) : []), [ready, shown]);
  const groups = React.useMemo(() => groupPeople(models.map((m) => m.person), params.group, departments), [models, params.group, departments]);
  const modelById = React.useMemo(() => new Map(models.map((m) => [m.person.profileId, m])), [models]);
  const columns = React.useMemo(
    () => (ready ? requirementColumns(ready.statusByProfile, params.view, shown.map((p) => p.profileId)) : []),
    [ready, params.view, shown],
  );

  if (compliance.status === 'idle' || compliance.status === 'loading') {
    return <PageLoading variant="tiles" rows={5} label="Loading crew compliance" />;
  }
  if (compliance.status === 'not_set_up') {
    return <PageEmpty icon={ShieldCheck} title="Crew compliance is not set up yet" body={COMPLIANCE_NOT_SET_UP_NOTICE} data-compliance-state="not-set-up" />;
  }
  if (compliance.status === 'denied') {
    return <AccessDenied title="You can't see crew compliance on this vessel" detail={compliance.notice} backTo={null} headingLevel={2} />;
  }
  if (compliance.status === 'error') {
    return <PageError error={compliance.error} onRetry={compliance.retry} title="Crew compliance could not load" treatMissingAsOff={false} headingLevel={2} />;
  }

  const people = compliance.compliance.people;
  if (people.length === 0) {
    return (
      <PageEmpty
        icon={Users}
        title={`No crew on ${vessel.name} yet`}
        body="Compliance is worked out for everyone on the vessel's crew. People appear here once they are assigned to this vessel."
        data-compliance-state="empty"
      />
    );
  }

  const kpis = complianceKpis(counted);
  const counts = statusCounts(kpiPeople(people, { q: params.q, show: params.show }, ctx).filter((p) => params.view !== 'gaps' || p.issues.length > 0));
  const nothingConfigured = people.every((p) => p.required === 0);
  const tab = viewTab(params.view);
  const hrefWith = (patch: Partial<ComplianceParams>) => complianceSearch(searchParams, patch) || '?';
  const filtersOn = params.q !== '' || params.status !== null || params.show !== 'all';

  const kpiTiles = (
    <KpiGrid className="min-[1440px]:grid-cols-5" data-compliance-kpis="">
      <KpiTile label="Total" icon={Users} value={kpis.total} state="ready" sub={params.show === 'onboard' ? 'On board' : 'On the crew'} href={hrefWith({ status: null })} />
      <KpiTile
        label="Compliant"
        icon={CheckCircle2}
        value={kpis.complete}
        state="ready"
        sub={kpis.nothingRequired > 0 ? `Includes ${kpis.nothingRequired} with nothing required` : 'Everything required is held'}
        href={hrefWith({ status: 'complete' })}
      />
      <KpiTile
        label="Expiring"
        icon={Clock}
        value={kpis.expiring}
        tone={kpis.expiring > 0 ? 'warn' : undefined}
        zeroLabel="Nothing expiring"
        sub="Held, but running out"
        href={hrefWith({ status: 'expiring' })}
      />
      <KpiTile
        label="Expired"
        icon={AlertOctagon}
        value={kpis.expired}
        tone={kpis.expired > 0 ? 'danger' : undefined}
        zeroLabel="Nothing expired"
        sub="Held only expired"
        href={hrefWith({ status: 'expired' })}
      />
      <KpiTile
        label="Missing"
        icon={CircleDashed}
        value={kpis.missing}
        tone={kpis.missing > 0 ? 'orange' : undefined}
        zeroLabel="Nothing missing"
        sub="Not held at all"
        href={hrefWith({ status: 'missing' })}
      />
    </KpiGrid>
  );

  const chips = [
    { id: ALL, label: 'All', count: counts.all },
    ...STATUS_FILTER_ORDER.map((s) => ({ id: s, label: statusLabel('crew_compliance', s), count: counts[s] })),
  ];

  const toolbar = (
    <div className="flex min-w-0 flex-col gap-2" data-compliance-toolbar="">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <SearchField value={params.q} onChange={(q) => setParams({ q })} placeholder="Search crew" label="Search crew by name, position or department" />
        <Segmented label="Show" value={params.show} options={SHOW} onChange={(show) => setParams({ show })} />
        <Segmented label="Group" value={params.group} options={GROUP} onChange={(group) => setParams({ group })} />
        {wide ? <Segmented label="Layout" value={params.layout} options={LAYOUT} onChange={(l) => setParams({ layout: l })} /> : null}
      </div>
      <CountChips
        chips={chips}
        activeId={params.status ?? ALL}
        onChange={(id) => setParams({ status: id === ALL ? null : (id as ComplianceParams['status']) })}
        label="Filter by status"
      />
    </div>
  );

  const groupBody = (label: string, list: readonly ComplianceRowModel[], flat: boolean) =>
    layout === 'cards' ? (
      <ComplianceCards label={label} models={list} view={params.view} profileHref={profileHref} today={today} />
    ) : (
      <ComplianceStatusMatrix
        label={label}
        models={list}
        view={params.view}
        columns={columns}
        profileHref={profileHref}
        today={today}
        maxHeight={flat ? '70vh' : 'none'}
      />
    );

  let results: React.ReactNode;
  if (shown.length === 0) {
    results =
      params.view === 'gaps' && !filtersOn ? (
        <EmptyState
          kind="first-use"
          icon={CheckCircle2}
          title="No gaps"
          body="Everyone on the crew holds what their position requires, and nothing needs a look."
          bordered
          headingLevel={3}
        />
      ) : (
        <PageEmpty
          filtered
          headingLevel={3}
          title="Nobody matches these filters"
          onClearFilters={() => setParams({ q: '', status: null, show: 'all' })}
          bordered
        />
      );
  } else if (tab !== null && layout === 'matrix' && columns.length === 0) {
    results = (
      <EmptyState
        kind="first-use"
        icon={ShieldCheck}
        title={`No ${STATUS_VIEW_LABEL[tab]} requirements for these positions`}
        body="Choose what each position needs on the Configuration tab."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to={configurationHref}>
              <Settings2 aria-hidden="true" />
              Open configuration
            </Link>
          </Button>
        }
        bordered
        headingLevel={3}
      />
    );
  } else {
    results = (
      <div className="min-w-0 space-y-5">
        {groups.map((g) => {
          const list = g.people.map((p) => modelById.get(p.profileId)).filter((m): m is ComplianceRowModel => Boolean(m));
          const flat = params.group === 'flat';
          return (
            <section key={g.key} className="min-w-0 space-y-2" aria-labelledby={`compliance-group-${g.key}`} data-compliance-group={g.key}>
              {flat ? (
                <h3 id={`compliance-group-${g.key}`} className="sr-only">
                  Everyone
                </h3>
              ) : (
                <h3 id={`compliance-group-${g.key}`} className="flex items-baseline gap-2 type-subtitle text-foreground">
                  {g.label}
                  <span className="type-caption tabular-nums text-muted-foreground">{list.length}</span>
                </h3>
              )}
              {groupBody(flat ? 'Crew compliance' : `Crew compliance, ${g.label}`, list, flat)}
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-w-0 space-y-4" data-compliance-state="ready" data-compliance-view={params.view} data-compliance-layout={layout}>
        {kpiTiles}
        {nothingConfigured ? (
          <Alert variant="info" data-compliance-notice="unconfigured">
            <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
              No requirements are set for the positions on this vessel yet, so there is nothing to check.
              <Link to={configurationHref} className="font-medium text-primary underline-offset-4 hover:underline focus-ring rounded-sm">
                Open configuration
              </Link>
            </AlertDescription>
          </Alert>
        ) : null}
        <Tabs value={params.view} onValueChange={(v) => setParams({ view: (STATUS_VIEWS as readonly string[]).includes(v) ? (v as StatusView) : 'overview' })}>
          <TabsList aria-label="Compliance views">
            {STATUS_VIEWS.map((v) => (
              <TabsTrigger key={v} value={v}>
                {STATUS_VIEW_LABEL[v]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {toolbar}
        <Legend />
        {results}
      </div>
    </TooltipProvider>
  );
};

export default ComplianceStatusTab;
