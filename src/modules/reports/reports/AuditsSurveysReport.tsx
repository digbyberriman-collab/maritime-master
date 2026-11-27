/**
 * Fleet › Reports › Audits and surveys (`/fleet/reports/audits-surveys`;
 * gap/02 R17; X5 spec X5-10B). Audits and certificate surveys on the
 * vessels shown over a period, from `fleet_report_audits` (041000):
 *
 * - Audits dated (actual start, else scheduled) in the period, and every
 *   overdue or in-progress audit whatever its date, so nothing open drops
 *   out of view. Each with its type, scope, status (due, in progress,
 *   overdue, done, cancelled), outcome, dates, auditor and findings (total,
 *   open, major and minor non-conformities, observations).
 * - Certificate surveys whose next survey falls in the period; overdue when
 *   its day has passed. They follow the certificates read, not Safety.
 * - Company audits (no vessel) for the fleet-wide read with fleet reach.
 *
 * Filters in the URL: Period (`?period=`, default the last 12 months and the
 * next 90 days), Show (`?kind=`) and Status (`?state=`, more options than
 * the reference, T-248). KPI tiles count each state and link to it. Survey
 * rows link to the vessel's certificates. Auditors are named: personal data
 * in the export.
 *
 * D-01: while the RPC is missing, "This report is not set up yet"; any other
 * error with Retry. Below 768 px one card per row. Export: the rows on
 * screen.
 */
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck2, CalendarClock, ClipboardCheck, ListChecks, TriangleAlert } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import type { DataTableColumn } from '@/shared/components/data/DataTable';
import { KpiGrid, KpiTile } from '@/shared/components/data/KpiTile';
import { StatusPill } from '@/shared/components/status/StatusPill';
import { todayDateOnly } from '@/shared/lib/form';
import { ReportShell, ReportTable } from '../components/ReportShell';
import { CoverageNote, CrewReportGate, ShownVesselsToolbar } from '../components/CrewReportParts';
import { ReportNote, VesselCell } from '../components/OpsReportParts';
import { reportsKeys } from '../hooks/keys';
import { useAuditsReport } from '../hooks/useOpsReports';
import { useReportFilters } from '../hooks/useReportFilters';
import { useShownReportScope } from '../hooks/useShownReportScope';
import { formatDay } from '../lib/crewReports';
import { reportFilterLabel, writeReportFilters } from '../lib/reportFilters';
import {
  AUDIT_FILTERS,
  AUDIT_STATE_META,
  auditExportColumns,
  auditOutcome,
  auditPeriodRange,
  auditRows,
  auditTypeLabel,
  auditWhenText,
  auditorText,
  findingsText,
  tallyAudits,
  vesselLabeller,
} from '../lib/opsReports';
import type { ReportComponentProps } from '../registry';
import type { AuditSurveyRow, AuditVesselCoverage } from '../types/db.pending';

const COMPANY = 'Company';
const n = (v: number) => v.toLocaleString('en-GB');

const titleOf = (r: AuditSurveyRow) => (r.kind === 'audit' ? auditTypeLabel(r.title) : r.title ?? 'Certificate');

function TitleCell({ row }: { row: AuditSurveyRow }) {
  return (
    <div className="min-w-0">
      <div className="font-medium text-foreground">{titleOf(row)}</div>
      <div className="truncate text-xs text-muted-foreground">
        {[row.kind === 'audit' ? 'Audit' : 'Certificate survey', row.scope, row.reference].filter(Boolean).join(' · ')}
      </div>
    </div>
  );
}

function WhenCell({ row }: { row: AuditSurveyRow }) {
  const when = auditWhenText(row.state, row.days);
  return (
    <div className="flex flex-col">
      <span className="whitespace-nowrap">{formatDay(row.on_date) ?? 'No date'}</span>
      {when ? <span className={cn('text-xs', row.state === 'overdue' ? 'font-medium text-critical' : 'text-muted-foreground')}>{when}</span> : null}
      {row.ended_on && row.ended_on !== row.on_date ? <span className="text-xs text-muted-foreground">to {formatDay(row.ended_on)}</span> : null}
    </div>
  );
}

function StateCell({ row }: { row: AuditSurveyRow }) {
  const meta = AUDIT_STATE_META[row.state];
  const outcome = auditOutcome(row.outcome);
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusPill tone={meta.tone} label={meta.label} />
      {outcome ? <StatusPill size="sm" tone={outcome.tone} label={outcome.label} /> : null}
    </div>
  );
}

function FindingsCell({ row }: { row: AuditSurveyRow }) {
  const text = findingsText(row.findings);
  if (text === null) return <span className="text-muted-foreground">Not recorded for surveys</span>;
  return (
    <div className="flex flex-col items-start gap-1">
      <span className={cn((row.findings?.open ?? 0) > 0 ? 'text-foreground' : 'text-muted-foreground')}>{text}</span>
      {row.findings && row.findings.major > 0 ? (
        <StatusPill size="sm" tone="danger" label={`${n(row.findings.major)} major`} />
      ) : null}
    </div>
  );
}

function rel(row: AuditSurveyRow): string {
  return row.kind === 'certificate_survey' ? 'certificates' : 'safety';
}

function columns(vesselOf: (id: string | null) => AuditVesselCoverage | undefined): DataTableColumn<AuditSurveyRow>[] {
  return [
    { id: 'when', header: 'Date', kind: 'date', sticky: true, minWidth: 140, value: (r) => r.on_date, cell: (r) => <WhenCell row={r} /> },
    {
      id: 'vessel',
      header: 'Vessel',
      minWidth: 130,
      value: (r) => vesselOf(r.vessel_id)?.vessel_name ?? COMPANY,
      cell: (r) => <VesselCell vessel={vesselOf(r.vessel_id)} rel={rel(r)} noVessel={COMPANY} />,
    },
    { id: 'title', header: 'Audit or survey', minWidth: 220, value: (r) => titleOf(r), cell: (r) => <TitleCell row={r} /> },
    { id: 'status', header: 'Status and outcome', minWidth: 170, value: (r) => AUDIT_STATE_META[r.state].label, cell: (r) => <StateCell row={r} /> },
    { id: 'auditor', header: 'Auditor or surveyor', minWidth: 170, value: (r) => auditorText(r), emptyReason: 'Not recorded' },
    { id: 'findings', header: 'Findings', minWidth: 130, sortDescFirst: true, value: (r) => r.findings?.open ?? null, cell: (r) => <FindingsCell row={r} /> },
  ];
}

function AuditCard({ row, vessel }: { row: AuditSurveyRow; vessel: AuditVesselCoverage | undefined }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <VesselCell vessel={vessel} rel={rel(row)} noVessel={COMPANY} />
          <TitleCell row={row} />
        </div>
        <StateCell row={row} />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div className="min-w-0">
          <dt className="type-caption text-muted-foreground">Date</dt>
          <dd>
            <WhenCell row={row} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="type-caption text-muted-foreground">Findings</dt>
          <dd>
            <FindingsCell row={row} />
          </dd>
        </div>
        <div className="col-span-2 min-w-0">
          <dt className="type-caption text-muted-foreground">Auditor or surveyor</dt>
          <dd className="truncate">{auditorText(row) ?? 'Not recorded'}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function AuditsSurveysReport({ definition }: ReportComponentProps) {
  const { shown, ready, scope, vesselsParam } = useShownReportScope();
  const filters = useReportFilters(AUDIT_FILTERS);
  const { period, kind, state } = filters.applied;
  const location = useLocation();
  const today = todayDateOnly();
  const range = useMemo(() => auditPeriodRange(period, today), [period, today]);
  const read = useAuditsReport(scope, range, { today });
  const data = read.state === 'ready' ? read.data : null;

  const vessels = useMemo(() => data?.vessels ?? [], [data]);
  const vesselOf = useMemo(() => {
    const byId = new Map(vessels.map((v) => [v.vessel_id, v]));
    return (id: string | null) => (id ? byId.get(id) : undefined);
  }, [vessels]);
  const vesselName = useMemo(() => vesselLabeller(vessels, COMPANY), [vessels]);
  const rows = useMemo(() => (data ? auditRows(data.rows, kind, state) : []), [data, kind, state]);
  const tally = useMemo(() => tallyAudits(data ? auditRows(data.rows, kind, 'all') : []), [data, kind]);
  const auditsCovered = vessels.filter((v) => v.state === 'ok').length;
  const surveysCovered = vessels.filter((v) => v.surveys_state === 'ok').length;
  const surveysMissing = vessels.filter((v) => v.surveys_state !== 'ok');

  const queryClient = useQueryClient();
  const prefix = [...reportsKeys.company(ready?.companyId ?? null), 'audits-surveys'];
  const refreshing = useIsFetching({ queryKey: prefix }) > 0;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: prefix });

  const stateHref = (value: string) => {
    const next = writeReportFilters(AUDIT_FILTERS, { period, kind, state: value }, new URLSearchParams(location.search));
    const search = next.toString();
    return `${location.pathname}${search ? `?${search}` : ''}`;
  };

  const loading = read.state === 'loading' || read.state === 'idle' || !ready;
  const gated = shown.status === 'error' || read.state === 'not_set_up' || read.state === 'no_vessels';
  const noneCovered = data !== null && auditsCovered === 0 && surveysCovered === 0 && !data.fleet_level;
  const tileState = loading ? 'loading' : noneCovered ? 'not-enabled' : undefined;
  const NOT_COVERED = 'Not covered on any vessel shown';
  const periodSpec = AUDIT_FILTERS[0];
  const exportBlockedReason =
    read.state === 'not_set_up'
      ? 'This report is not set up yet.'
      : read.state === 'error' || shown.status === 'error'
        ? 'The report could not load.'
        : read.state === 'no_vessels'
          ? 'There are no vessels to report on.'
          : null;
  const exportParams: Json = { period, kind, state, vessels: ready && !ready.isDefault ? ready.shownVessels.map((v) => v.code) : 'counted' };

  const body = gated ? (
    <CrewReportGate
      shown={shown}
      state={read.state}
      notSetUp={{
        icon: ClipboardCheck,
        title: 'This report is not set up yet',
        body: 'Audits and certificate surveys across the fleet, with their outcome and findings, appear here once fleet reports are set up for your account.',
      }}
      noVessels={{ title: 'No vessels to report on', body: 'Audits and surveys cover the vessels you can reach. None is set up for you yet; ask your account admin.' }}
    />
  ) : (
    <>
      <section aria-label="Audits and surveys summary" className="space-y-3">
        <KpiGrid className="min-[1440px]:grid-cols-4">
          <KpiTile
            label="Overdue"
            icon={TriangleAlert}
            value={tally.overdue}
            tone={tally.overdue > 0 ? 'danger' : undefined}
            state={tileState}
            notEnabledReason={NOT_COVERED}
            zeroLabel="Nothing overdue"
            sub={tally.overdue > 0 && tally.surveys_due > 0 ? `${n(tally.surveys_due)} certificate ${tally.surveys_due === 1 ? 'survey' : 'surveys'} due or overdue` : undefined}
            href={stateHref('overdue')}
          />
          <KpiTile
            label="In progress"
            icon={ListChecks}
            value={tally.in_progress}
            tone={tally.in_progress > 0 ? 'signal' : undefined}
            state={tileState}
            notEnabledReason={NOT_COVERED}
            zeroLabel="None in progress"
            href={stateHref('in-progress')}
          />
          <KpiTile
            label="Due"
            icon={CalendarClock}
            value={tally.due}
            state={tileState}
            notEnabledReason={NOT_COVERED}
            zeroLabel="Nothing due"
            sub={`By ${formatDay(data?.to ?? range.to) ?? ''}`}
            href={stateHref('due')}
          />
          <KpiTile
            label="Open findings"
            icon={CalendarCheck2}
            value={tally.open_findings}
            tone={tally.open_findings > 0 ? 'warn' : undefined}
            state={tileState}
            notEnabledReason={NOT_COVERED}
            zeroLabel="No open findings"
            sub={tally.major_findings > 0 ? `${n(tally.major_findings)} major non-conformit${tally.major_findings === 1 ? 'y' : 'ies'} recorded` : undefined}
            href={stateHref('findings')}
          />
        </KpiGrid>
        <p className="text-sm text-muted-foreground">
          {reportFilterLabel(periodSpec, period)}: {formatDay(data?.from ?? range.from)} to {formatDay(data?.to ?? range.to)}. Overdue and in-progress audits are listed whatever their date.
        </p>
        {data ? <CoverageNote vessels={vessels} moduleName="Safety" /> : null}
        {data && surveysMissing.length > 0 && surveysCovered < vessels.length ? (
          <ReportNote>
            <span className="font-medium text-foreground">Certificate surveys not covered: </span>
            {surveysMissing.map((v) => v.vessel_name).join('; ')} (you cannot see certificates on {surveysMissing.length === 1 ? 'this vessel' : 'these vessels'}).
          </ReportNote>
        ) : null}
        {data?.fleet_level ? <ReportNote>Company audits (no vessel) are listed too, under “{COMPANY}”.</ReportNote> : null}
      </section>
      <ReportTable
        label="Audits and surveys"
        noun={{ one: 'audit or survey', other: 'audits and surveys' }}
        rows={rows}
        columns={columns(vesselOf)}
        getRowId={(r) => `${r.kind}:${r.id}`}
        renderCard={(r) => <AuditCard row={r} vessel={vesselOf(r.vessel_id)} />}
        isLoading={loading}
        error={read.state === 'error' ? read.error : undefined}
        onRetry={read.state === 'error' ? read.retry : undefined}
        empty={{
          title: 'No audits or surveys in this period',
          body: noneCovered ? 'No vessel shown is covered by this report.' : 'Choose a longer period to see more.',
        }}
        hasExternalFilters={kind !== 'all' || state !== 'all'}
        onClearFilters={filters.reset}
        searchable={rows.length > 8}
      />
    </>
  );

  return (
    <ReportShell<AuditSurveyRow>
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
          ? { kind: 'Audits and surveys', columns: auditExportColumns(vesselName), rows, params: exportParams, range: { from: data.from, to: data.to } }
          : null
      }
      exportBlockedReason={exportBlockedReason}
    >
      {body}
    </ReportShell>
  );
}
