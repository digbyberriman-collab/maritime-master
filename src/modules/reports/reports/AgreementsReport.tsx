/**
 * Fleet › Reports › Agreements (`/fleet/reports/agreements`; gap/02 R10;
 * X5 spec X5-10A). Every seafarer employment agreement in force or in draft
 * on the vessels shown, by state, from `fleet_report_contracts(…,
 * 'agreements')` (040900).
 *
 * - State: signed (both parties signed), draft (a draft with no SEA
 *   reference and no signature), else not yet signed, with who is awaited
 *   (the crew member, the company or both). The rule is the SQL
 *   fleet_report_agreement_state, mirrored in lib/crewReports.ts.
 * - Filter (`?state=`, more options than the reference, T-248): every
 *   state, draft, not yet signed, awaiting the crew member, awaiting the
 *   company, signed. KPI tiles count each state and link to it.
 * - A contract's vessel is the person's current vessel, else the contract's
 *   own; contracts of people with no current vessel are listed only on the
 *   default fleet-wide read for readers with fleet reach and the HR rule.
 * - Vessels without the HR rule are named in "Not covered", never 0.
 * - D-01: while the RPC is missing, "This report is not set up yet"; any
 *   other error with Retry. Wages and terms are never read. Below 768 px
 *   one card per agreement. Export: the rows on screen (personal data).
 */
import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FilePen, FileSignature, FileText } from 'lucide-react';
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
  AGREEMENT_FILTERS,
  AGREEMENT_STATE_META,
  AWAITING_LABELS,
  agreementExportColumns,
  agreementRows,
  contractTypeLabel,
  contractVesselName,
  formatDay,
  formatStamp,
  personLabel,
  tallyAgreements,
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

function AgreementCell({ row }: { row: ContractReportRow }) {
  const meta = AGREEMENT_STATE_META[row.agreement_state];
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusPill tone={meta.tone} label={meta.label} />
      {row.awaiting ? <span className="text-xs text-muted-foreground">{AWAITING_LABELS[row.awaiting]}</span> : null}
    </div>
  );
}

function SignedCell({ row }: { row: ContractReportRow }) {
  const crew = formatStamp(row.signed_by_crew_at);
  const company = formatStamp(row.signed_by_company_at);
  return (
    <div className="space-y-0.5 text-xs">
      <div>
        <span className="text-muted-foreground">Crew: </span>
        {crew ?? 'Not yet'}
      </div>
      <div>
        <span className="text-muted-foreground">Company: </span>
        {company ?? 'Not yet'}
      </div>
    </div>
  );
}

function columns(vesselOf: (id: string | null) => ReportVesselCoverage | undefined, vesselName: (id: string | null) => string): DataTableColumn<ContractReportRow>[] {
  return [
    { id: 'person', header: 'Crew member', sticky: true, minWidth: 180, value: (r) => personLabel(r.person_name), cell: (r) => <PersonCell row={r} vessel={vesselOf(r.vessel_id)} /> },
    { id: 'vessel', header: 'Vessel', minWidth: 130, value: (r) => vesselName(r.vessel_id) },
    {
      id: 'agreement',
      header: 'Agreement',
      minWidth: 170,
      value: (r) => ['not_signed', 'draft', 'signed'].indexOf(r.agreement_state),
      cell: (r) => <AgreementCell row={r} />,
    },
    { id: 'sea', header: 'SEA reference', kind: 'reference', minWidth: 120, value: (r) => r.sea_reference, emptyReason: 'No SEA reference yet' },
    { id: 'type', header: 'Type', minWidth: 100, value: (r) => contractTypeLabel(r.contract_type) },
    { id: 'start', header: 'Starts', kind: 'date', minWidth: 110, value: (r) => r.start_date, cell: (r) => formatDay(r.start_date) },
    { id: 'end', header: 'Ends', kind: 'date', minWidth: 110, value: (r) => r.end_date, cell: (r) => formatDay(r.end_date), emptyReason: 'No end date' },
    { id: 'signed', header: 'Signed', minWidth: 150, cell: (r) => <SignedCell row={r} /> },
  ];
}

function AgreementCard({ row, vessel, vesselName }: { row: ContractReportRow; vessel: ReportVesselCoverage | undefined; vesselName: string }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <PersonCell row={row} vessel={vessel} />
        <AgreementCell row={row} />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div className="min-w-0">
          <dt className="type-caption text-muted-foreground">Vessel</dt>
          <dd className="truncate">{vesselName}</dd>
        </div>
        <div className="min-w-0">
          <dt className="type-caption text-muted-foreground">SEA reference</dt>
          <dd className="truncate">{row.sea_reference ?? <span className="text-muted-foreground">None yet</span>}</dd>
        </div>
        <div className="min-w-0">
          <dt className="type-caption text-muted-foreground">Starts</dt>
          <dd>{formatDay(row.start_date)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="type-caption text-muted-foreground">Ends</dt>
          <dd>{formatDay(row.end_date) ?? <span className="text-muted-foreground">No end date</span>}</dd>
        </div>
      </dl>
      <SignedCell row={row} />
    </div>
  );
}

export default function AgreementsReport({ definition }: ReportComponentProps) {
  const { shown, ready, scope, vesselsParam } = useShownReportScope();
  const filters = useReportFilters(AGREEMENT_FILTERS);
  const { state } = filters.applied;
  const location = useLocation();
  const read = useContractsReport(scope, 'agreements');
  const data = read.state === 'ready' ? read.data : null;

  const vessels = useMemo(() => data?.vessels ?? [], [data]);
  const vesselOf = useMemo(() => {
    const byId = new Map(vessels.map((v) => [v.vessel_id, v]));
    return (id: string | null) => (id ? byId.get(id) : undefined);
  }, [vessels]);
  const vesselName = useMemo(() => contractVesselName(vessels), [vessels]);
  const rows = useMemo(() => (data ? agreementRows(data.rows, state) : []), [data, state]);
  const tally = tallyAgreements(data?.rows ?? []);
  const covered = vessels.filter((v) => v.state === 'ok').length;

  const queryClient = useQueryClient();
  const prefix = [...reportsKeys.company(ready?.companyId ?? null), 'contracts', 'agreements'];
  const refreshing = useIsFetching({ queryKey: prefix }) > 0;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: prefix });

  const stateHref = (value: string) => {
    const next = writeReportFilters(AGREEMENT_FILTERS, { state: value }, new URLSearchParams(location.search));
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
  const exportParams: Json = { state, vessels: ready && !ready.isDefault ? ready.shownVessels.map((v) => v.code) : 'counted' };

  const body = gated ? (
    <CrewReportGate
      shown={shown}
      state={read.state}
      notSetUp={{
        icon: FileSignature,
        title: 'This report is not set up yet',
        body: 'Each seafarer employment agreement in draft or in force, and who still has to sign it, appears here once fleet reports are set up for your account.',
      }}
      noVessels={{ title: 'No vessels to report on', body: 'Agreements cover the vessels you can reach. None is set up for you yet; ask your account admin.' }}
    />
  ) : (
    <>
      <section aria-label="Agreements summary" className="space-y-3">
        <KpiGrid className="min-[1440px]:grid-cols-4">
          <KpiTile
            label="Not yet signed"
            icon={FilePen}
            value={tally.not_signed}
            tone={tally.not_signed > 0 ? 'warn' : undefined}
            state={tileState}
            notEnabledReason={NOT_COVERED}
            zeroLabel="Nothing waiting"
            sub={
              tally.not_signed > 0
                ? [
                    tally.awaiting_crew ? `${tally.awaiting_crew} crew` : null,
                    tally.awaiting_company ? `${tally.awaiting_company} company` : null,
                    tally.awaiting_both ? `${tally.awaiting_both} both` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : undefined
            }
            href={stateHref('not-signed')}
          />
          <KpiTile label="Draft" icon={FileText} value={tally.draft} state={tileState} notEnabledReason={NOT_COVERED} zeroLabel="No drafts" href={stateHref('draft')} />
          <KpiTile label="Signed" icon={CheckCircle2} value={tally.signed} state={tileState} notEnabledReason={NOT_COVERED} zeroLabel="None signed yet" href={stateHref('signed')} />
          <KpiTile
            label="Agreements"
            icon={FileSignature}
            value={tally.total}
            state={tileState}
            notEnabledReason={NOT_COVERED}
            zeroLabel="No agreements"
            sub={covered < vessels.length ? `On ${covered} of ${vessels.length} vessels` : undefined}
          />
        </KpiGrid>
        {data ? <CoverageNote vessels={vessels} moduleName="the HR records" /> : null}
        {data?.unassigned ? (
          <p className="text-sm text-muted-foreground">Agreements of people with no current vessel are listed too, under “No current vessel”.</p>
        ) : null}
      </section>
      <ReportTable
        label="Agreements"
        noun={{ one: 'agreement', other: 'agreements' }}
        rows={rows}
        columns={columns(vesselOf, vesselName)}
        getRowId={(r) => r.contract_id}
        renderCard={(r) => <AgreementCard row={r} vessel={vesselOf(r.vessel_id)} vesselName={vesselName(r.vessel_id)} />}
        isLoading={loading}
        error={read.state === 'error' ? read.error : undefined}
        onRetry={read.state === 'error' ? read.retry : undefined}
        empty={{ title: 'No agreements on these vessels', body: noneCovered ? 'No vessel shown is covered by this report.' : 'No contract is in draft or in force.' }}
        hasExternalFilters={state !== 'all'}
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
      exportSpec={data ? { kind: 'Agreements', columns: agreementExportColumns(vesselName), rows, params: exportParams } : null}
      exportBlockedReason={exportBlockedReason}
    >
      {body}
    </ReportShell>
  );
}
