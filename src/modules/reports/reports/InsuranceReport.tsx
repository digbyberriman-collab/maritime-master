/**
 * Fleet › Reports › Insurance (`/fleet/reports/insurance`; gap/02 R13; X5
 * spec X5-10B). Every insurance policy on the vessels shown, and the
 * fleet's own policies for the fleet-wide read with fleet reach, from
 * `fleet_report_insurance` (041000): type, insurer, policy number, cover
 * dates, status, whether a certificate is on file, and the expiry engine's
 * bucket with the company's warning window for insurance.
 *
 * - Cover by vessel: one row per vessel (and the fleet), one column per kind
 *   of cover (P&I, hull and machinery and crew always, the others when a
 *   policy has them). A cell is the policy of that kind ending last; a
 *   vessel with none of its own shows the fleet's policy, else "No policy".
 *   Vessels with no P&I, hull or crew policy are named under the tiles.
 * - Filters in the URL: Status (`?status=`) and Cover (`?type=`). KPI tiles
 *   count each bucket and link to it.
 * - Amounts, premiums, contacts and notes are never read. Fleet policies
 *   need fleet reach (D-X5-21); vessels the reader cannot see insurance on
 *   are named in "Not covered", never 0.
 *
 * D-01: while the RPC is missing, "This report is not set up yet"; any other
 * error with Retry. Below 768 px one card per policy; the matrix scrolls
 * inside its card. Export: the policies on screen.
 */
import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, FileWarning, ShieldCheck, Umbrella } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';
import { EXPIRY_BUCKETS, type ExpiryBucket } from '@/lib/records/expiry';
import type { DataTableColumn } from '@/shared/components/data/DataTable';
import { KpiGrid, KpiTile } from '@/shared/components/data/KpiTile';
import { MatrixGrid, type MatrixColumn } from '@/shared/components/data/MatrixGrid';
import { ExpiryPill } from '@/shared/components/status/ExpiryPill';
import { StatusPill } from '@/shared/components/status/StatusPill';
import { ReportShell, ReportTable } from '../components/ReportShell';
import { CoverageNote, CrewReportGate, ShownVesselsToolbar } from '../components/CrewReportParts';
import { ReportNote, VesselCell } from '../components/OpsReportParts';
import { reportsKeys } from '../hooks/keys';
import { useInsuranceReport } from '../hooks/useOpsReports';
import { useReportFilters } from '../hooks/useReportFilters';
import { useShownReportScope } from '../hooks/useShownReportScope';
import { formatDay } from '../lib/crewReports';
import { writeReportFilters } from '../lib/reportFilters';
import {
  FLEET_COVER_ROW,
  INSURANCE_FILTERS,
  POLICY_CLASS_LABELS,
  coverMatrix,
  insuranceExportColumns,
  insuranceRows,
  missingCover,
  policyClassNote,
  policyStatusLabel,
  tallyInsurance,
  vesselLabeller,
  type CoverCell,
  type CoverMatrix,
  type PolicyClass,
} from '../lib/opsReports';
import type { ReportComponentProps } from '../registry';
import type { InsurancePolicyRow, ReportVesselCoverage } from '../types/db.pending';

const FLEET_POLICY = 'Fleet policy';
// The vessel's insurance page is planned (sitemap Vessel › Administration › Insurance): policies stay plain text, the vessel name links to its certificates.
const VESSEL_REL = 'certificates';
const BUCKETS: ReadonlySet<string> = new Set(EXPIRY_BUCKETS);

function PolicyExpiry({ row }: { row: InsurancePolicyRow }) {
  if (!BUCKETS.has(row.bucket)) return <StatusPill tone="neutral" label="Expiry unknown" />;
  return <ExpiryPill bucket={row.bucket as ExpiryBucket} daysRemaining={row.days_remaining} expiresOn={row.coverage_end} windowDays={row.window_days} />;
}

function PolicyCell({ row }: { row: InsurancePolicyRow }) {
  const note = policyClassNote(row.policy_type);
  return (
    <div className="min-w-0">
      <div className="font-medium text-foreground">{row.policy_type ?? 'Policy type not recorded'}</div>
      {note ? <div className="truncate text-xs text-muted-foreground">{note}</div> : null}
    </div>
  );
}

function columns(vesselOf: (id: string | null) => ReportVesselCoverage | undefined): DataTableColumn<InsurancePolicyRow>[] {
  return [
    {
      id: 'vessel',
      header: 'Vessel',
      sticky: true,
      minWidth: 140,
      value: (r) => vesselOf(r.vessel_id)?.vessel_name ?? FLEET_POLICY,
      cell: (r) => <VesselCell vessel={vesselOf(r.vessel_id)} rel={VESSEL_REL} noVessel={FLEET_POLICY} />,
    },
    { id: 'policy', header: 'Policy', minWidth: 180, value: (r) => r.policy_type, cell: (r) => <PolicyCell row={r} /> },
    { id: 'insurer', header: 'Insurer', minWidth: 140, value: (r) => r.insurer, emptyReason: 'Insurer not recorded' },
    { id: 'number', header: 'Policy number', kind: 'reference', minWidth: 120, value: (r) => r.policy_number, emptyReason: 'No policy number' },
    {
      id: 'ends',
      header: 'Cover ends',
      kind: 'date',
      minWidth: 210,
      value: (r) => r.days_remaining,
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <span className="whitespace-nowrap">{formatDay(r.coverage_end)}</span>
          <PolicyExpiry row={r} />
        </div>
      ),
    },
    { id: 'from', header: 'Cover from', kind: 'date', minWidth: 110, value: (r) => r.coverage_start, cell: (r) => formatDay(r.coverage_start) },
    { id: 'status', header: 'Status', minWidth: 120, value: (r) => policyStatusLabel(r.status), emptyReason: 'No status recorded' },
    {
      id: 'certificate',
      header: 'Certificate',
      minWidth: 110,
      value: (r) => (r.certificate_on_file ? 1 : 0),
      cell: (r) => (r.certificate_on_file ? 'On file' : <span className="text-muted-foreground">Not on file</span>),
    },
  ];
}

function PolicyCard({ row, vessel }: { row: InsurancePolicyRow; vessel: ReportVesselCoverage | undefined }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <VesselCell vessel={vessel} rel={VESSEL_REL} noVessel={FLEET_POLICY} />
          <PolicyCell row={row} />
        </div>
        <PolicyExpiry row={row} />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div className="min-w-0">
          <dt className="type-caption text-muted-foreground">Insurer</dt>
          <dd className="truncate">{row.insurer ?? 'Not recorded'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="type-caption text-muted-foreground">Policy number</dt>
          <dd className="truncate font-mono text-xs">{row.policy_number ?? 'Not recorded'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="type-caption text-muted-foreground">Cover</dt>
          <dd>
            {formatDay(row.coverage_start) ?? '?'} to {formatDay(row.coverage_end) ?? '?'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="type-caption text-muted-foreground">Certificate</dt>
          <dd>{row.certificate_on_file ? 'On file' : 'Not on file'}</dd>
        </div>
      </dl>
    </div>
  );
}

function coverWords(cell: CoverCell): string {
  if (cell.kind === 'none') return 'No policy';
  const ends = formatDay(cell.policy.coverage_end) ?? 'an unknown date';
  const more = cell.count > 1 ? ` (${cell.count} policies)` : '';
  return cell.kind === 'fleet' ? `Fleet policy, ends ${ends}${more}` : `Ends ${ends}${more}`;
}

function CoverCellView({ cell }: { cell: CoverCell }) {
  if (cell.kind === 'none') return <span className="text-sm text-muted-foreground">No policy</span>;
  return (
    <span className="flex flex-col items-start gap-0.5">
      {BUCKETS.has(cell.policy.bucket) ? (
        <ExpiryPill
          size="sm"
          bucket={cell.policy.bucket as ExpiryBucket}
          daysRemaining={cell.policy.days_remaining}
          expiresOn={cell.policy.coverage_end}
          windowDays={cell.policy.window_days}
        />
      ) : (
        <StatusPill size="sm" tone="neutral" label="Expiry unknown" />
      )}
      {cell.kind === 'fleet' ? <span className="type-caption text-muted-foreground">Fleet policy</span> : null}
    </span>
  );
}

function CoverByVessel({ matrix, vesselOf }: { matrix: CoverMatrix; vesselOf: (id: string | null) => ReportVesselCoverage | undefined }) {
  const headingId = React.useId();
  const matrixColumns: MatrixColumn[] = useMemo(
    () => matrix.classes.map((c) => ({ id: c, label: POLICY_CLASS_LABELS[c], width: 176 })),
    [matrix.classes],
  );
  if (matrix.rows.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-2">
      <div className="min-w-0">
        <h2 id={headingId} className="type-title text-foreground">
          Cover by vessel
        </h2>
        <p className="text-sm text-muted-foreground">The policy of each kind that ends last on each vessel. A vessel with no policy of its own shows the fleet’s.</p>
      </div>
      <MatrixGrid<CoverMatrix['rows'][number], CoverCell>
        label="Cover by vessel"
        noun={{ one: 'vessel', other: 'vessels' }}
        rows={matrix.rows}
        getRowId={(r) => r.id}
        rowLabel={(r) => r.label}
        renderRowHeader={(r) =>
          r.id === FLEET_COVER_ROW ? <span className="font-medium text-foreground">{r.label}</span> : <VesselCell vessel={vesselOf(r.id)} rel={VESSEL_REL} noVessel={r.label} />
        }
        rowHeader="Vessel"
        columns={matrixColumns}
        getValue={(row, column) => matrix.cell(row.id, column.id as PolicyClass)}
        renderCell={(context) => (
          <span title={coverWords(context.value)}>
            <span aria-hidden="true">
              <CoverCellView cell={context.value} />
            </span>
            <span className="sr-only">{`${context.label}: ${coverWords(context.value)}`}</span>
          </span>
        )}
        showDensityToggle={false}
        searchable={matrix.rows.length > 8}
        empty={{ title: 'No vessels to show', body: 'No vessel shown is covered by this report.' }}
        maxHeight="24rem"
      />
    </section>
  );
}

export default function InsuranceReport({ definition }: ReportComponentProps) {
  const { shown, ready, scope, vesselsParam } = useShownReportScope();
  const filters = useReportFilters(INSURANCE_FILTERS);
  const { status, type } = filters.applied;
  const location = useLocation();
  const read = useInsuranceReport(scope);
  const data = read.state === 'ready' ? read.data : null;

  const vessels = useMemo(() => data?.vessels ?? [], [data]);
  const vesselOf = useMemo(() => {
    const byId = new Map(vessels.map((v) => [v.vessel_id, v]));
    return (id: string | null) => (id ? byId.get(id) : undefined);
  }, [vessels]);
  const vesselName = useMemo(() => vesselLabeller(vessels, FLEET_POLICY), [vessels]);
  const rows = useMemo(() => (data ? insuranceRows(data.rows, status, type) : []), [data, status, type]);
  const tally = useMemo(() => tallyInsurance(data ? insuranceRows(data.rows, 'all', type) : []), [data, type]);
  const matrix = useMemo(() => (data ? coverMatrix(data.rows, data.vessels, data.fleet_level) : null), [data]);
  const missing = useMemo(() => (matrix ? missingCover(matrix) : []), [matrix]);
  const covered = vessels.filter((v) => v.state === 'ok').length;

  const queryClient = useQueryClient();
  const prefix = [...reportsKeys.company(ready?.companyId ?? null), 'insurance'];
  const refreshing = useIsFetching({ queryKey: prefix }) > 0;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: prefix });

  const statusHref = (value: string) => {
    const next = writeReportFilters(INSURANCE_FILTERS, { status: value, type }, new URLSearchParams(location.search));
    const search = next.toString();
    return `${location.pathname}${search ? `?${search}` : ''}`;
  };

  const loading = read.state === 'loading' || read.state === 'idle' || !ready;
  const gated = shown.status === 'error' || read.state === 'not_set_up' || read.state === 'no_vessels';
  const noneCovered = data !== null && covered === 0 && !data.fleet_level;
  const tileState = loading ? 'loading' : noneCovered ? 'not-enabled' : undefined;
  const NOT_COVERED = 'Not covered on any vessel shown';
  const windowDays = data?.rows[0]?.window_days ?? null;
  const exportBlockedReason =
    read.state === 'not_set_up'
      ? 'This report is not set up yet.'
      : read.state === 'error' || shown.status === 'error'
        ? 'The report could not load.'
        : read.state === 'no_vessels'
          ? 'There are no vessels to report on.'
          : null;
  const exportParams: Json = { status, type, vessels: ready && !ready.isDefault ? ready.shownVessels.map((v) => v.code) : 'counted' };

  const body = gated ? (
    <CrewReportGate
      shown={shown}
      state={read.state}
      notSetUp={{
        icon: Umbrella,
        title: 'This report is not set up yet',
        body: 'Each vessel’s insurance cover, its insurer and when it ends appear here once fleet reports are set up for your account.',
      }}
      noVessels={{ title: 'No vessels to report on', body: 'Insurance covers the vessels you can reach. None is set up for you yet; ask your account admin.' }}
    />
  ) : (
    <>
      <section aria-label="Insurance summary" className="space-y-3">
        <KpiGrid className="min-[1440px]:grid-cols-4">
          <KpiTile
            label="Expired"
            icon={FileWarning}
            value={tally.expired}
            tone={tally.expired > 0 ? 'danger' : undefined}
            state={tileState}
            notEnabledReason={NOT_COVERED}
            zeroLabel="None expired"
            href={statusHref('expired')}
          />
          <KpiTile
            label="Ending within 30 days"
            icon={CalendarClock}
            value={tally.expiring_soon}
            tone={tally.expiring_soon > 0 ? 'orange' : undefined}
            state={tileState}
            notEnabledReason={NOT_COVERED}
            zeroLabel="None this month"
            href={statusHref('expiring_soon')}
          />
          <KpiTile
            label="Ending within the window"
            icon={CalendarClock}
            value={tally.expiring}
            tone={tally.expiring > 0 ? 'warn' : undefined}
            state={tileState}
            notEnabledReason={NOT_COVERED}
            zeroLabel="None due"
            sub={windowDays !== null ? `Warning window ${windowDays} days` : undefined}
            href={statusHref('expiring')}
          />
          <KpiTile
            label="In force"
            icon={ShieldCheck}
            value={tally.valid}
            state={tileState}
            notEnabledReason={NOT_COVERED}
            zeroLabel="None in force"
            sub={tally.total > 0 ? `${tally.total} ${tally.total === 1 ? 'policy' : 'policies'} in all` : undefined}
            href={statusHref('valid')}
          />
        </KpiGrid>
        {data ? <CoverageNote vessels={vessels} moduleName="Insurance" /> : null}
        {data?.fleet_level && tally.fleet > 0 ? <ReportNote>Fleet policies (no vessel) are listed too, under “Fleet policy”.</ReportNote> : null}
        {missing.length > 0 ? (
          <ReportNote>
            <span className="font-medium text-foreground">No policy recorded: </span>
            {missing.map((m, i) => (
              <React.Fragment key={`${m.vessel}:${m.cover}`}>
                {i > 0 ? '; ' : null}
                {m.vessel} ({m.cover})
              </React.Fragment>
            ))}
            .
          </ReportNote>
        ) : null}
      </section>
      {matrix ? <CoverByVessel matrix={matrix} vesselOf={vesselOf} /> : null}
      <ReportTable
        label="Insurance policies"
        noun={{ one: 'policy', other: 'policies' }}
        rows={rows}
        columns={columns(vesselOf)}
        getRowId={(r) => r.policy_id}
        renderCard={(r) => <PolicyCard row={r} vessel={vesselOf(r.vessel_id)} />}
        isLoading={loading}
        error={read.state === 'error' ? read.error : undefined}
        onRetry={read.state === 'error' ? read.retry : undefined}
        empty={{
          title: 'No insurance policies',
          body: noneCovered ? 'No vessel shown is covered by this report.' : 'No policy is recorded for the vessels shown.',
        }}
        hasExternalFilters={status !== 'all' || type !== 'all'}
        onClearFilters={filters.reset}
        searchable={rows.length > 8}
      />
    </>
  );

  return (
    <ReportShell<InsurancePolicyRow>
      definition={definition}
      generatedAt={read.state === 'ready' ? read.updatedAt : null}
      refreshing={refreshing}
      onRefresh={ready ? refresh : undefined}
      vesselsParam={vesselsParam}
      toolbar={<ShownVesselsToolbar ready={ready} />}
      toolbarLabel="Vessels"
      filters={filters}
      exportSpec={data ? { kind: 'Insurance', columns: insuranceExportColumns(vesselName), rows, params: exportParams } : null}
      exportBlockedReason={exportBlockedReason}
    >
      {body}
    </ReportShell>
  );
}
