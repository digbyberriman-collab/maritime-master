/**
 * Fleet › Reports › Crew qualifications (`/fleet/reports/crew-qualifications`;
 * gap/02 R5; X5 spec X5-10A, agreement 5). Every crew member of the vessels
 * shown against what their position requires on that vessel, from X1's
 * requirement engine (`crew_compliance_for_vessels`) through
 * `fleet_report_crew_qualifications` (040900).
 *
 * - Show (`?show=`): "Required by position" (default) lists the people whose
 *   position requires something; "All crew" adds everyone else (0 of 0).
 * - Status (`?status=`, more options than the reference, T-248): every
 *   status, missing or expired, expired, missing, expiring, complete.
 * - KPI tiles count people per status and link to that status.
 * - Each row: the person (their crew profile), the vessel (its crew
 *   compliance page), the status, met of required per tab (documents, STCW,
 *   qualifications, familiarisation; "–" where nothing is required), the
 *   next expiry and what is not met, by name.
 * - Vessels the reader cannot see compliance on, or with the crew module
 *   off, are named in "Not covered", never counted as 0; vessels whose crew
 *   have nothing required are named with a link to set requirements up.
 * - D-01: while the RPC or X1's engine is missing, "Crew qualification
 *   requirements are not set up yet" (never zeros); any other error with
 *   Retry. Below 768 px one card per person. Export: the rows on screen
 *   (personal data, through the export engine).
 */
import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { AlertOctagon, CalendarClock, CheckCircle2, GraduationCap, ListChecks, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Json } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import type { DataTableColumn } from '@/shared/components/data/DataTable';
import { KpiGrid, KpiTile } from '@/shared/components/data/KpiTile';
import { StatusPill } from '@/shared/components/status/StatusPill';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import { ReportShell, ReportTable } from '../components/ReportShell';
import { CoverageNote, CrewReportGate, ShownVesselsToolbar } from '../components/CrewReportParts';
import { reportsKeys } from '../hooks/keys';
import { useCrewQualifications } from '../hooks/useCrewReports';
import { useReportFilters } from '../hooks/useReportFilters';
import { useShownReportScope } from '../hooks/useShownReportScope';
import { writeReportFilters } from '../lib/reportFilters';
import {
  CREW_QUALIFICATIONS_NOT_SET_UP,
  CREW_QUALIFICATION_FILTERS,
  crewPersonName,
  crewPosition,
  formatDay,
  issuesSummary,
  placementLabel,
  qualificationExportColumns,
  qualificationRows,
  tabPair,
  tallyQualifications,
  vesselsWithoutRequirements,
} from '../lib/crewReports';
import type { ReportComponentProps } from '../registry';
import type { CrewQualificationRow, ReportVesselCoverage } from '../types/db.pending';

const COARSE = '[@media(pointer:coarse)]:min-h-11';
const LINK = cn('-mx-1 inline-flex min-h-8 items-center rounded-sm px-1 hover:underline focus-ring', COARSE);

function PersonCell({ row, vessel }: { row: CrewQualificationRow; vessel: ReportVesselCoverage | undefined }) {
  const name = crewPersonName(row);
  const position = crewPosition(row);
  const placement = placementLabel(row.placement_kind);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1">
        {vessel?.vessel_code ? (
          <Link to={vesselPath(vessel.vessel_code, `crew/people/${row.profile_id}`)} className={cn(LINK, 'font-medium text-foreground')}>
            {name}
          </Link>
        ) : (
          <span className="font-medium text-foreground">{name}</span>
        )}
        {placement ? <Badge variant="neutral">{placement}</Badge> : null}
      </div>
      <div className="truncate text-xs text-muted-foreground">{position ?? 'Position not recorded'}</div>
    </div>
  );
}

function VesselCell({ vessel }: { vessel: ReportVesselCoverage | undefined }) {
  if (!vessel) return <span className="text-muted-foreground">Vessel not listed</span>;
  return vessel.vessel_code ? (
    <Link to={vesselPath(vessel.vessel_code, 'crew/compliance')} className={LINK} aria-label={`Crew compliance on ${vessel.vessel_name}`}>
      {vessel.vessel_name}
    </Link>
  ) : (
    <span>{vessel.vessel_name}</span>
  );
}

function PairCell({ met, required, label }: { met: number; required: number; label: string }) {
  const pair = tabPair(met, required);
  if (!pair) {
    return (
      <span className="text-muted-foreground" title="Nothing required">
        <span aria-hidden="true">–</span>
        <span className="sr-only">{`${label}: nothing required`}</span>
      </span>
    );
  }
  return <span className={cn('tabular-nums whitespace-nowrap', met < required && 'font-medium text-foreground')}>{pair}</span>;
}

function IssuesCell({ row }: { row: CrewQualificationRow }) {
  const { shown, more } = issuesSummary(row.issues);
  if (shown.length === 0) {
    return <span className="text-muted-foreground">{row.required === 0 ? 'Nothing required' : 'All met'}</span>;
  }
  return (
    <span className="text-sm">
      {shown.join(', ')}
      {more > 0 ? <span className="text-muted-foreground">{`, and ${more} more`}</span> : null}
    </span>
  );
}

function columns(vesselOf: (id: string) => ReportVesselCoverage | undefined): DataTableColumn<CrewQualificationRow>[] {
  return [
    {
      id: 'person',
      header: 'Crew member',
      sticky: true,
      minWidth: 180,
      value: (r) => crewPersonName(r),
      cell: (r) => <PersonCell row={r} vessel={vesselOf(r.vessel_id)} />,
    },
    { id: 'vessel', header: 'Vessel', minWidth: 110, value: (r) => vesselOf(r.vessel_id)?.vessel_name ?? null, cell: (r) => <VesselCell vessel={vesselOf(r.vessel_id)} /> },
    {
      id: 'status',
      header: 'Status',
      minWidth: 112,
      value: (r) => ['expired', 'missing', 'expiring', 'complete'].indexOf(r.status),
      cell: (r) => <StatusPill domain="crew_compliance" status={r.status} />,
    },
    {
      id: 'met',
      header: 'Met',
      kind: 'number',
      minWidth: 64,
      value: (r) => (r.required > 0 ? r.met / r.required : null),
      cell: (r) => <PairCell met={r.met} required={r.required} label="Requirements" />,
      emptyReason: 'Nothing required',
    },
    { id: 'documents', header: 'Documents', minWidth: 88, cell: (r) => <PairCell met={r.docs_met} required={r.docs_required} label="Documents" /> },
    { id: 'stcw', header: 'STCW', minWidth: 64, cell: (r) => <PairCell met={r.stcw_met} required={r.stcw_required} label="STCW" /> },
    { id: 'quals', header: 'Qualifications', minWidth: 104, cell: (r) => <PairCell met={r.quals_met} required={r.quals_required} label="Qualifications" /> },
    { id: 'fam', header: 'Familiarisation', minWidth: 112, cell: (r) => <PairCell met={r.fam_met} required={r.fam_required} label="Familiarisation" /> },
    { id: 'next', header: 'Next expiry', kind: 'date', minWidth: 104, value: (r) => r.next_expiry, cell: (r) => formatDay(r.next_expiry), emptyReason: 'Nothing expires' },
    { id: 'issues', header: 'Not met', minWidth: 200, value: (r) => r.issues.map((i) => i.label).join(' '), cell: (r) => <IssuesCell row={r} /> },
  ];
}

function PersonCard({ row, vessel }: { row: CrewQualificationRow; vessel: ReportVesselCoverage | undefined }) {
  const pairs: Array<[string, number, number]> = [
    ['Documents', row.docs_met, row.docs_required],
    ['STCW', row.stcw_met, row.stcw_required],
    ['Qualifications', row.quals_met, row.quals_required],
    ['Familiarisation', row.fam_met, row.fam_required],
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <PersonCell row={row} vessel={vessel} />
        <StatusPill domain="crew_compliance" status={row.status} />
      </div>
      <div className="text-sm">
        <VesselCell vessel={vessel} />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        {pairs.map(([label, met, required]) => (
          <div key={label} className="min-w-0">
            <dt className="type-caption text-muted-foreground">{label}</dt>
            <dd className="text-sm">
              <PairCell met={met} required={required} label={label} />
            </dd>
          </div>
        ))}
      </dl>
      {row.issues.length > 0 ? (
        <div>
          <div className="type-caption text-muted-foreground">Not met</div>
          <IssuesCell row={row} />
        </div>
      ) : null}
    </div>
  );
}

export default function CrewQualificationsReport({ definition }: ReportComponentProps) {
  const { shown, ready, scope, vesselsParam } = useShownReportScope();
  const filters = useReportFilters(CREW_QUALIFICATION_FILTERS);
  const { show, status } = filters.applied;
  const location = useLocation();
  const read = useCrewQualifications(scope);
  const data = read.state === 'ready' ? read.data : null;

  const vessels = useMemo(() => data?.vessels ?? [], [data]);
  const vesselOf = useMemo(() => {
    const byId = new Map(vessels.map((v) => [v.vessel_id, v]));
    return (id: string) => byId.get(id);
  }, [vessels]);
  const inView = useMemo(() => (data ? qualificationRows(data.rows, data.vessels, show, 'all') : []), [data, show]);
  const rows = useMemo(() => (data ? qualificationRows(data.rows, data.vessels, show, status) : []), [data, show, status]);
  const tally = tallyQualifications(inView);
  const unset = useMemo(() => (data ? vesselsWithoutRequirements(data.rows, data.vessels) : []), [data]);
  const covered = vessels.filter((v) => v.state === 'ok').length;

  const queryClient = useQueryClient();
  const prefix = [...reportsKeys.company(ready?.companyId ?? null), 'crew-qualifications'];
  const refreshing = useIsFetching({ queryKey: prefix }) > 0;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: prefix });

  const statusHref = (value: string) => {
    const next = writeReportFilters(CREW_QUALIFICATION_FILTERS, { ...filters.applied, status: value }, new URLSearchParams(location.search));
    const search = next.toString();
    return `${location.pathname}${search ? `?${search}` : ''}`;
  };

  const loading = read.state === 'loading' || read.state === 'idle' || !ready;
  const gate = (
    <CrewReportGate
      shown={shown}
      state={read.state}
      notSetUp={{
        icon: GraduationCap,
        title: CREW_QUALIFICATIONS_NOT_SET_UP,
        body: 'Each crew member’s documents, STCW certificates, qualifications and familiarisation against what their position requires appear here once the crew requirements are set up for your account.',
      }}
      noVessels={{ title: 'No vessels to report on', body: 'Crew qualifications cover the vessels you can reach. None is set up for you yet; ask your account admin.' }}
    />
  );
  const gated = shown.status === 'error' || read.state === 'not_set_up' || read.state === 'no_vessels';

  const exportBlockedReason =
    read.state === 'not_set_up'
      ? 'Crew qualification requirements are not set up yet.'
      : read.state === 'error' || shown.status === 'error'
        ? 'The report could not load.'
        : read.state === 'no_vessels'
          ? 'There are no vessels to report on.'
          : null;
  const exportParams: Json = { show, status, vessels: ready && !ready.isDefault ? ready.shownVessels.map((v) => v.code) : 'counted' };
  const coveredLine = covered < vessels.length ? `On ${covered} of ${vessels.length} vessels` : undefined;

  const body = gated ? (
    gate
  ) : (
    <>
      <section aria-label="Crew qualifications summary" className="space-y-3">
        <KpiGrid className="min-[1440px]:grid-cols-4">
          <KpiTile label="Crew checked" icon={Users} value={tally.people} state={loading ? 'loading' : 'ready'} sub={coveredLine} />
          <KpiTile
            label="Missing or expired"
            icon={AlertOctagon}
            value={tally.missing + tally.expired}
            tone={tally.missing + tally.expired > 0 ? 'danger' : undefined}
            state={loading ? 'loading' : undefined}
            zeroLabel="Nothing missing or expired"
            sub={tally.missing + tally.expired > 0 ? `${tally.missing} missing · ${tally.expired} expired` : undefined}
            href={statusHref('needs-action')}
          />
          <KpiTile
            label="Expiring"
            icon={CalendarClock}
            value={tally.expiring}
            tone={tally.expiring > 0 ? 'warn' : undefined}
            state={loading ? 'loading' : undefined}
            zeroLabel="Nothing expiring"
            href={statusHref('expiring')}
          />
          <KpiTile
            label="Complete"
            icon={CheckCircle2}
            value={tally.complete}
            state={loading ? 'loading' : undefined}
            zeroTone="neutral"
            zeroLabel="None complete yet"
            href={statusHref('complete')}
          />
        </KpiGrid>
        {data ? <CoverageNote vessels={vessels} moduleName="the crew module" /> : null}
        {unset.length > 0 ? (
          <p role="note" className="flex items-start gap-2 text-sm text-muted-foreground">
            <ListChecks aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-medium text-foreground">No requirements set: </span>
              {unset.map((v, i) => (
                <React.Fragment key={v.vessel_id}>
                  {i > 0 ? ', ' : null}
                  {v.vessel_code ? (
                    <Link to={vesselPath(v.vessel_code, 'crew/compliance')} className={cn(LINK, 'text-foreground')}>
                      {v.vessel_name}
                    </Link>
                  ) : (
                    v.vessel_name
                  )}
                </React.Fragment>
              ))}
              . Nobody’s position requires anything on {unset.length === 1 ? 'this vessel' : 'these vessels'} yet; set it up in the vessel’s crew compliance.
            </span>
          </p>
        ) : null}
      </section>
      <ReportTable
        label="Crew qualifications"
        noun={{ one: 'crew member', other: 'crew members' }}
        rows={rows}
        columns={columns(vesselOf)}
        getRowId={(r) => `${r.vessel_id}:${r.profile_id}`}
        renderCard={(r) => <PersonCard row={r} vessel={vesselOf(r.vessel_id)} />}
        isLoading={loading}
        error={read.state === 'error' ? read.error : undefined}
        onRetry={read.state === 'error' ? read.retry : undefined}
        empty={
          show === 'required'
            ? { title: 'Nobody’s position requires anything here', body: 'Choose “All crew” to list everyone, or set requirements up in each vessel’s crew compliance.' }
            : { title: 'Nobody on these crew lists', body: covered === 0 ? 'No vessel shown is covered by this report.' : undefined }
        }
        hasExternalFilters={status !== 'all'}
        onClearFilters={filters.reset}
        searchable={rows.length > 8}
      />
    </>
  );

  return (
    <ReportShell<CrewQualificationRow>
      definition={definition}
      generatedAt={read.state === 'ready' ? read.updatedAt : null}
      refreshing={refreshing}
      onRefresh={ready ? refresh : undefined}
      vesselsParam={vesselsParam}
      toolbar={<ShownVesselsToolbar ready={ready} />}
      toolbarLabel="Vessels"
      filters={filters}
      exportSpec={
        data
          ? {
              kind: 'Crew qualifications',
              columns: qualificationExportColumns((id) => vesselOf(id)?.vessel_name ?? 'Vessel not listed'),
              rows,
              params: exportParams,
            }
          : null
      }
      exportBlockedReason={exportBlockedReason}
    >
      {body}
    </ReportShell>
  );
}
