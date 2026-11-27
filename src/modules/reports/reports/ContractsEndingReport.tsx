/**
 * Fleet › Reports › Contracts ending (`/fleet/reports/contracts-ending`;
 * gap/02 R11; X5 spec X5-10A). Active contracts on the vessels shown that
 * have ended or end within 90 days, soonest first, from
 * `fleet_report_contracts(…, 'ending')` (040900).
 *
 * - Buckets (SQL fleet_report_contract_bucket, mirrored in
 *   lib/crewReports.ts): ended (the end date has passed but the contract is
 *   still marked active), within 30 days, 31 to 60, 61 to 90. KPI tiles
 *   count each and link to it.
 * - Filters in the URL (more options than the reference, T-248): Ending
 *   (`?window=`: ended or within 90 days (default), ended, within 30 / 60 /
 *   90 days) and Renewal (`?renewal=`: with or without, no renewal
 *   drafted, renewal drafted).
 * - Renewal drafted: a draft contract of the same person that supersedes
 *   this one or starts on or after it.
 * - A contract's vessel is the person's current vessel, else the contract's
 *   own; people with no current vessel are listed only on the default
 *   fleet-wide read for readers with fleet reach and the HR rule.
 * - D-01: while the RPC is missing, "This report is not set up yet"; any
 *   other error with Retry. Wages and terms are never read. Below 768 px
 *   one card per contract. Export: the rows on screen (personal data).
 */
import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CalendarRange, CalendarX2, Hourglass } from 'lucide-react';
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
import { useContractsReport } from '../hooks/useCrewReports';
import { useReportFilters } from '../hooks/useReportFilters';
import { useShownReportScope } from '../hooks/useShownReportScope';
import { writeReportFilters } from '../lib/reportFilters';
import {
  AGREEMENT_STATE_META,
  CONTRACT_BUCKET_META,
  CONTRACT_ENDING_FILTERS,
  contractTypeLabel,
  contractVesselName,
  endingExportColumns,
  endingRows,
  endsText,
  formatDay,
  personLabel,
  tallyEnding,
} from '../lib/crewReports';
import type { ReportComponentProps } from '../registry';
import type { ContractReportRow, ReportVesselCoverage } from '../types/db.pending';

const COARSE = '[@media(pointer:coarse)]:min-h-11';
const LINK = cn('-mx-1 inline-flex min-h-8 items-center rounded-sm px-1 hover:underline focus-ring', COARSE);

function PersonCell({ row, vessel }: { row: ContractReportRow; vessel: ReportVesselCoverage | undefined }) {
  const name = personLabel(row.person_name);
  return (
    <div className="min-w-0">
      {vessel?.vessel_code ? (
        <Link to={vesselPath(vessel.vessel_code, `crew/people/${row.profile_id}`)} className={cn(LINK, 'font-medium text-foreground')}>
          {name}
        </Link>
      ) : (
        <span className="font-medium text-foreground">{name}</span>
      )}
      <div className="truncate text-xs text-muted-foreground">{row.position ?? 'Position not recorded'}</div>
    </div>
  );
}

function EndsCell({ row }: { row: ContractReportRow }) {
  const meta = row.bucket ? CONTRACT_BUCKET_META[row.bucket] : null;
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="whitespace-nowrap">{formatDay(row.end_date)}</span>
      {meta ? <StatusPill tone={meta.tone} label={endsText(row.days_left) ?? meta.label} /> : null}
    </div>
  );
}

function RenewalCell({ row }: { row: ContractReportRow }) {
  return row.renewal_drafted ? <Badge variant="info">Renewal drafted</Badge> : <span className="text-muted-foreground">None yet</span>;
}

function columns(vesselOf: (id: string | null) => ReportVesselCoverage | undefined, vesselName: (id: string | null) => string): DataTableColumn<ContractReportRow>[] {
  return [
    { id: 'person', header: 'Crew member', sticky: true, minWidth: 180, value: (r) => personLabel(r.person_name), cell: (r) => <PersonCell row={r} vessel={vesselOf(r.vessel_id)} /> },
    { id: 'vessel', header: 'Vessel', minWidth: 130, value: (r) => vesselName(r.vessel_id) },
    { id: 'ends', header: 'Ends', kind: 'date', minWidth: 160, value: (r) => r.days_left, cell: (r) => <EndsCell row={r} /> },
    { id: 'renewal', header: 'Renewal', minWidth: 130, value: (r) => (r.renewal_drafted ? 1 : 0), cell: (r) => <RenewalCell row={r} /> },
    { id: 'type', header: 'Type', minWidth: 100, value: (r) => contractTypeLabel(r.contract_type) },
    { id: 'contract', header: 'Contract', kind: 'reference', minWidth: 100, value: (r) => r.contract_number, emptyReason: 'No contract number' },
    {
      id: 'agreement',
      header: 'Agreement',
      minWidth: 130,
      value: (r) => r.agreement_state,
      cell: (r) => <StatusPill tone={AGREEMENT_STATE_META[r.agreement_state].tone} label={AGREEMENT_STATE_META[r.agreement_state].label} />,
    },
  ];
}

function ContractCard({ row, vessel, vesselName }: { row: ContractReportRow; vessel: ReportVesselCoverage | undefined; vesselName: string }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <PersonCell row={row} vessel={vessel} />
        <EndsCell row={row} />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div className="min-w-0">
          <dt className="type-caption text-muted-foreground">Vessel</dt>
          <dd className="truncate">{vesselName}</dd>
        </div>
        <div className="min-w-0">
          <dt className="type-caption text-muted-foreground">Renewal</dt>
          <dd>
            <RenewalCell row={row} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="type-caption text-muted-foreground">Type</dt>
          <dd>{contractTypeLabel(row.contract_type)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="type-caption text-muted-foreground">Agreement</dt>
          <dd>{AGREEMENT_STATE_META[row.agreement_state].label}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function ContractsEndingReport({ definition }: ReportComponentProps) {
  const { shown, ready, scope, vesselsParam } = useShownReportScope();
  const filters = useReportFilters(CONTRACT_ENDING_FILTERS);
  const { window: ending, renewal } = filters.applied;
  const location = useLocation();
  const read = useContractsReport(scope, 'ending');
  const data = read.state === 'ready' ? read.data : null;

  const vessels = useMemo(() => data?.vessels ?? [], [data]);
  const vesselOf = useMemo(() => {
    const byId = new Map(vessels.map((v) => [v.vessel_id, v]));
    return (id: string | null) => (id ? byId.get(id) : undefined);
  }, [vessels]);
  const vesselName = useMemo(() => contractVesselName(vessels), [vessels]);
  const rows = useMemo(() => (data ? endingRows(data.rows, ending, renewal) : []), [data, ending, renewal]);
  const tally = tallyEnding(data?.rows ?? []);
  const covered = vessels.filter((v) => v.state === 'ok').length;

  const queryClient = useQueryClient();
  const prefix = [...reportsKeys.company(ready?.companyId ?? null), 'contracts', 'ending'];
  const refreshing = useIsFetching({ queryKey: prefix }) > 0;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: prefix });

  const windowHref = (value: string) => {
    const next = writeReportFilters(CONTRACT_ENDING_FILTERS, { window: value, renewal }, new URLSearchParams(location.search));
    const search = next.toString();
    return `${location.pathname}${search ? `?${search}` : ''}`;
  };

  const loading = read.state === 'loading' || read.state === 'idle' || !ready;
  const gated = shown.status === 'error' || read.state === 'not_set_up' || read.state === 'no_vessels';
  const noneCovered = data !== null && covered === 0 && !data.unassigned;
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
  const exportParams: Json = { window: ending, renewal, vessels: ready && !ready.isDefault ? ready.shownVessels.map((v) => v.code) : 'counted' };

  const body = gated ? (
    <CrewReportGate
      shown={shown}
      state={read.state}
      notSetUp={{
        icon: CalendarClock,
        title: 'This report is not set up yet',
        body: 'Contracts that have ended or end within 90 days, and whether a renewal is drafted, appear here once fleet reports are set up for your account.',
      }}
      noVessels={{ title: 'No vessels to report on', body: 'Contracts ending cover the vessels you can reach. None is set up for you yet; ask your account admin.' }}
    />
  ) : (
    <>
      <section aria-label="Contracts ending summary" className="space-y-3">
        <KpiGrid className="min-[1440px]:grid-cols-4">
          <KpiTile
            label="Ended, still active"
            icon={CalendarX2}
            value={tally.ended}
            tone={tally.ended > 0 ? 'danger' : undefined}
            state={tileState}
            notEnabledReason={NOT_COVERED}
            zeroLabel="None overdue"
            href={windowHref('ended')}
          />
          <KpiTile
            label="Within 30 days"
            icon={Hourglass}
            value={tally.d30}
            tone={tally.d30 > 0 ? 'orange' : undefined}
            state={tileState}
            notEnabledReason={NOT_COVERED}
            zeroLabel="None this month"
            href={windowHref('d30')}
          />
          <KpiTile label="In 31 to 60 days" icon={CalendarClock} value={tally.d60} tone={tally.d60 > 0 ? 'warn' : undefined} state={tileState} notEnabledReason={NOT_COVERED} zeroLabel="None" />
          <KpiTile label="In 61 to 90 days" icon={CalendarRange} value={tally.d90} state={tileState} notEnabledReason={NOT_COVERED} zeroLabel="None" />
        </KpiGrid>
        {tally.total > 0 ? (
          <p className="text-sm text-muted-foreground">
            {tally.renewals === 0
              ? 'No renewal is drafted for any of these contracts yet.'
              : `${tally.renewals} of ${tally.total} ${tally.total === 1 ? 'contract has' : 'contracts have'} a renewal drafted.`}
          </p>
        ) : null}
        {data ? <CoverageNote vessels={vessels} moduleName="the HR records" /> : null}
        {data?.unassigned ? (
          <p className="text-sm text-muted-foreground">Contracts of people with no current vessel are listed too, under “No current vessel”.</p>
        ) : null}
      </section>
      <ReportTable
        label="Contracts ending"
        noun={{ one: 'contract', other: 'contracts' }}
        rows={rows}
        columns={columns(vesselOf, vesselName)}
        getRowId={(r) => r.contract_id}
        renderCard={(r) => <ContractCard row={r} vessel={vesselOf(r.vessel_id)} vesselName={vesselName(r.vessel_id)} />}
        isLoading={loading}
        error={read.state === 'error' ? read.error : undefined}
        onRetry={read.state === 'error' ? read.retry : undefined}
        empty={{ title: 'No contracts ending soon', body: noneCovered ? 'No vessel shown is covered by this report.' : 'No active contract has ended or ends within 90 days.' }}
        hasExternalFilters={ending !== 'all' || renewal !== 'all'}
        onClearFilters={filters.reset}
        searchable={rows.length > 8}
      />
    </>
  );

  return (
    <ReportShell<ContractReportRow>
      definition={definition}
      generatedAt={read.state === 'ready' ? read.updatedAt : null}
      refreshing={refreshing}
      onRefresh={ready ? refresh : undefined}
      vesselsParam={vesselsParam}
      toolbar={<ShownVesselsToolbar ready={ready} />}
      toolbarLabel="Vessels"
      filters={filters}
      exportSpec={data ? { kind: 'Contracts ending', columns: endingExportColumns(vesselName), rows, params: exportParams } : null}
      exportBlockedReason={exportBlockedReason}
    >
      {body}
    </ReportShell>
  );
}
