/**
 * The vessel's hours-of-rest report (gap/04 C44, C41, C42; W6; T-142,
 * T-292; X1-08B) at crew/hours-of-rest/report?year=: the year at a glance
 * for the people who look after the crew's hours of rest.
 *
 * - KPIs: Unreviewed breaches, Serious open, Not submitted (crew months of
 *   months that have ended), Awaiting approval. Each has its own loading,
 *   zero and error state; for approvers each opens the board on the month
 *   that has some.
 * - By month (work_rest_month_stats): crew, days logged, breach days,
 *   unreviewed and the month's submissions. Months wholly before the
 *   vessel's Hours of Rest start date are not expected (C45).
 * - Open breaches of the year (approvers), Breach reports sent
 *   (work_rest_breach_reports: the final approvers see every report of the
 *   vessel, recipients the ones shared with them; each PDF is rebuilt on
 *   demand and its download logged, D-X1-23) and the Reminders log
 *   (work_rest_reminders, approvers; "Automatic reminders are not scheduled
 *   yet" until the vessel has had one, C41).
 * - Export all months: Excel through the export engine, logged first
 *   (personal data), named per EX1. Create breach report (final approver):
 *   BreachReportDialog, also opened by `?new=1`. `?report=<id>` (the
 *   hor_breach_report notice's link) marks that report.
 *
 * Gate: vessel.crew.hours_of_rest.view on the route vessel (the route
 * guard checks the key too). Nothing is read while it loads; without it the
 * page says so and links to the viewer's own month. The server gates every
 * read again.
 *
 * D-01: while work_rest_month_stats is missing, "The hours of rest report
 * becomes available once the crew update is applied."; a panel whose own
 * table or RPC is missing says it is not available yet; any other error is
 * an error with Try again (a 42501 reads as no access).
 */
import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertOctagon,
  BellRing,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileClock,
  FileText,
  Info,
  LayoutGrid,
  Send,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCapability } from '@/lib/permissions/useCan';
import { useScope } from '@/app/router/scopeContext';
import { useScopedPath } from '@/app/router/scopes';
import { CREW_CAPS } from '@/modules/crew/paths';
import { useVesselModuleSettings } from '@/modules/vessels/hooks/useVesselModuleSettings';
import PageHeader from '@/shared/components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '@/shared/components/data/DataTable';
import { KpiTile } from '@/shared/components/data/KpiTile';
import { TABLET_MIN_WIDTH, useMinWidth } from '@/shared/components/data/useMinWidth';
import { AccessDenied, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { todayDateOnly } from '@/shared/lib/form';
import { notify } from '@/shared/lib/notify';
import { breachState, deficitText, isOpenBreach, monthParam, ruleLabel, sortBreaches } from '../lib/horBoard';
import {
  REPORT_NOT_SET_UP,
  autoRemindersNotice,
  hasAnyCrew,
  monthRows,
  periodText,
  personName,
  reminderMonth,
  reminderWho,
  reportKpis,
  parseReportYear,
  sentByLine,
  sentReportLine,
  shortDate,
  type MonthRow,
  type ReportContext,
  type SentReport,
} from '../lib/horReport';
import { useVesselBreaches } from '../hooks/useBreaches';
import { loadReportBreaches, reportErrorText, useHorMonthStats, useReminderLog, useSentBreachReports } from '../hooks/useHorStats';
import { WorkRestRefusal } from '../services/workRestService';
import type { WorkRestVesselBreachRow } from '../types/db.pending';

const BreachReportDialog = lazy(() => import('../components/hor-board/BreachReportDialog'));

const MY_HOURS = '/me/hours-of-rest';
const BOARD = 'crew/hours-of-rest';
const COARSE = '[@media(pointer:coarse)]:h-11';

const ReportDenied: React.FC<{ headingLevel?: 1 | 2 }> = ({ headingLevel = 1 }) => (
  <AccessDenied
    title="The hours of rest report is not open to you"
    detail="The vessel's hours of rest report needs hours of rest access on this vessel. Your own month is in My hours of rest."
    backTo={{ to: MY_HOURS, label: 'Open my hours of rest' }}
    headingLevel={headingLevel}
  />
);

const HoursOfRestReportPage: React.FC = () => {
  const scope = useScope();
  const vessel = scope.scope === 'vessel' ? scope.vessel ?? null : null;
  const gate = useCapability(CREW_CAPS.horView, { vesselId: vessel?.id ?? null });

  if (!vessel) return <PageEmpty title="Choose a vessel" body="Hours of rest belong to a vessel. Open the report from a vessel's Crew tab." />;
  if (gate.status === 'loading') return <PageLoading variant="tiles" rows={4} label="Checking your access" />;
  if (!gate.allowed) return <ReportDenied />;
  return <ReportBody key={vessel.id} vesselId={vessel.id} vesselName={vessel.name} vesselCode={scope.vesselCode ?? null} />;
};

interface ReportBodyProps {
  vesselId: string;
  vesselName: string;
  vesselCode: string | null;
}

const ReportBody: React.FC<ReportBodyProps> = ({ vesselId, vesselName, vesselCode }) => {
  const scoped = useScopedPath();
  const [params, setParams] = useSearchParams();
  const today = todayDateOnly();
  const currentYear = Number(today.slice(0, 4));
  const year = parseReportYear(params.get('year'), currentYear);
  const approve = useCapability(CREW_CAPS.horApprove, { vesselId });
  const finalApprove = useCapability(CREW_CAPS.horFinalApprove, { vesselId });
  const exportCap = useCapability(CREW_CAPS.horExport, { vesselId });
  const settings = useVesselModuleSettings(vesselId);
  const horFrom = settings.state.status === 'ready' ? settings.state.settings.get('crew_hor')?.enabledFrom ?? null : null;
  const ctx = useMemo<ReportContext>(() => ({ year, today, horFrom }), [year, today, horFrom]);
  const stats = useHorMonthStats({ vesselId, year });
  const statRows = useMemo(() => (stats.data?.applied ? stats.data.data : null), [stats.data]);
  const rows = useMemo(() => (statRows ? monthRows(statRows, ctx) : []), [statRows, ctx]);
  const [exporting, setExporting] = useState(false);

  /** Sets or clears URL parameters, keeping the others. */
  const update = (patch: Readonly<Record<string, string | null>>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next);
  };
  const dialogOpen = params.get('new') === '1' && finalApprove.allowed && Boolean(statRows);
  const boardHref = (query: string) => `${scoped(BOARD)}${query ? `?${query}` : ''}`;
  const canBoard = approve.allowed;

  const exportAll = async () => {
    if (!statRows) return;
    setExporting(true);
    try {
      const { exportAllMonths } = await import('../reports/exports');
      const { notifyExportResult } = await import('@/lib/export');
      notifyExportResult(await exportAllMonths({ vesselId, vesselCode, vesselName, year, rows }));
    } catch (e) {
      notify.error(e, { title: 'Export not made' });
    } finally {
      setExporting(false);
    }
  };

  const header = (
    <PageHeader
      eyebrow={vesselName}
      title="Hours of rest report"
      description="The year's months on board: breaches still to review, months not submitted or awaiting approval, and the breach reports sent."
      actions={
        <>
          {exportCap.allowed ? (
            <Button type="button" variant="outline" size="sm" className={COARSE} disabled={!statRows || exporting} onClick={exportAll} data-export-all-months="">
              <Download aria-hidden="true" />
              {exporting ? 'Exporting…' : 'Export all months'}
            </Button>
          ) : null}
          {finalApprove.allowed && statRows ? (
            <Button type="button" size="sm" className={COARSE} onClick={() => update({ new: '1' })} data-open-breach-report="">
              <Send aria-hidden="true" />
              Create breach report
            </Button>
          ) : null}
          {canBoard ? (
            <Button asChild variant="outline" size="sm" className={COARSE}>
              <Link to={boardHref('')}>
                <LayoutGrid aria-hidden="true" />
                Board
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm" className={COARSE}>
              <Link to={MY_HOURS}>
                <UserRound aria-hidden="true" />
                My hours
              </Link>
            </Button>
          )}
        </>
      }
    />
  );

  let content: React.ReactNode;
  if (stats.isLoading) {
    content = (
      <>
        <KpiRow state="loading" />
        <PageLoading variant="list" rows={6} label="Loading the report" />
      </>
    );
  } else if (stats.error) {
    const e = stats.error;
    if (e instanceof WorkRestRefusal && e.code === '42501') content = <ReportDenied headingLevel={2} />;
    else {
      content = (
        <>
          <KpiRow state="error" onRetry={() => void stats.refetch()} />
          <PageError error={e} title="The report could not load" onRetry={() => void stats.refetch()} headingLevel={2} />
        </>
      );
    }
  } else if (stats.data && !stats.data.applied) {
    content = <PageEmpty icon={CalendarClock} title="The report is not set up yet" body={REPORT_NOT_SET_UP} headingLevel={2} bordered data-hor-report-not-set-up="" />;
  } else if (statRows) {
    const kpis = reportKpis(statRows, ctx);
    const target = (month: number | null, query: string) => (canBoard && month ? boardHref(`month=${monthParam({ year, month })}&${query}`) : undefined);
    content = (
      <>
        <KpiRow
          state="ready"
          kpis={kpis}
          hrefs={{
            unreviewed: target(kpis.targets.unreviewed, 'breaches=open'),
            seriousOpen: target(kpis.targets.seriousOpen, 'breaches=open'),
            notSubmitted: target(kpis.targets.notSubmitted, 'queue=waiting'),
            awaitingApproval: target(kpis.targets.awaitingApproval, 'queue=ready'),
          }}
        />
        {horFrom && horFrom.slice(0, 4) === String(year) && horFrom > `${year}-01-01` ? (
          <Alert variant="info" data-hor-start={horFrom}>
            <CalendarClock aria-hidden="true" className="h-4 w-4" />
            <AlertDescription>Hours of rest starts on {shortDate(horFrom)} on {vesselName}. Earlier months are not expected.</AlertDescription>
          </Alert>
        ) : null}
        <MonthTable rows={rows} year={year} anyCrew={hasAnyCrew(statRows)} vesselName={vesselName} monthHref={canBoard ? (m) => boardHref(`month=${monthParam({ year, month: m })}`) : null} />
        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
          <OpenBreachesPanel vesselId={vesselId} year={year} canReview={approve} boardHref={boardHref} />
          <SentReportsPanel
            vesselId={vesselId}
            vesselName={vesselName}
            vesselCode={vesselCode}
            year={year}
            canDownload={approve.allowed}
            isFinalApprover={finalApprove.allowed}
            highlight={params.get('report')}
            onCreate={finalApprove.allowed ? () => update({ new: '1' }) : null}
          />
        </div>
        <RemindersPanel vesselId={vesselId} year={year} canSee={approve} />
      </>
    );
  }

  return (
    <div className="min-w-0 space-y-4" data-hor-report={statRows ? 'ready' : stats.data && !stats.data.applied ? 'not-set-up' : stats.error ? 'error' : 'loading'}>
      {header}
      <YearNav year={year} currentYear={currentYear} onChange={(y) => update({ year: String(y), report: null })} />
      {content}
      {dialogOpen ? (
        <Suspense fallback={null}>
          <BreachReportDialog
            vesselId={vesselId}
            vesselName={vesselName}
            defaultFrom={`${year}-01-01`}
            defaultTo={year === currentYear ? today : `${year}-12-31`}
            today={today}
            onClose={() => update({ new: null })}
            onCreated={(created) => update({ new: null, report: created.reportId })}
          />
        </Suspense>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------- the year

const YearNav: React.FC<{ year: number; currentYear: number; onChange: (year: number) => void }> = ({ year, currentYear, onChange }) => (
  <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Year">
    <Button type="button" variant="outline" size="icon" className="[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" onClick={() => onChange(year - 1)} disabled={year <= 2000} aria-label={`Show ${year - 1}`}>
      <ChevronLeft aria-hidden="true" />
    </Button>
    <span className="min-w-[4.5rem] text-center type-h3 tabular-nums" aria-live="polite" data-report-year={year}>
      {year}
    </span>
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
      onClick={() => onChange(year + 1)}
      disabled={year >= currentYear}
      aria-label={year >= currentYear ? 'Next year (not started yet)' : `Show ${year + 1}`}
    >
      <ChevronRight aria-hidden="true" />
    </Button>
    {year !== currentYear ? (
      <Button type="button" variant="ghost" size="sm" className={COARSE} onClick={() => onChange(currentYear)}>
        This year
      </Button>
    ) : null}
  </div>
);

// ---------------------------------------------------------------- the KPIs

type KpiRowProps =
  | { state: 'loading' }
  | { state: 'error'; onRetry: () => void }
  | {
      state: 'ready';
      kpis: ReturnType<typeof reportKpis>;
      hrefs: { unreviewed?: string; seriousOpen?: string; notSubmitted?: string; awaitingApproval?: string };
    };

const KpiRow: React.FC<KpiRowProps> = (props) => {
  const grid = 'grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4';
  if (props.state !== 'ready') {
    const common = props.state === 'loading' ? ({ state: 'loading' } as const) : ({ state: 'error', onRetry: props.onRetry } as const);
    return (
      <div className={grid} data-hor-kpis={props.state}>
        <KpiTile label="Unreviewed breaches" icon={ShieldAlert} {...common} />
        <KpiTile label="Serious open" icon={AlertOctagon} {...common} />
        <KpiTile label="Not submitted" icon={FileClock} {...common} />
        <KpiTile label="Awaiting approval" icon={ClipboardCheck} {...common} />
      </div>
    );
  }
  const { kpis, hrefs } = props;
  return (
    <div className={grid} data-hor-kpis="ready">
      <KpiTile
        label="Unreviewed breaches"
        icon={ShieldAlert}
        value={kpis.unreviewed}
        tone="warn"
        sub={kpis.awaitingCorrection ? `${kpis.awaitingCorrection} more waiting on a correction` : 'To accept or send back'}
        zeroLabel={kpis.awaitingCorrection ? `${kpis.awaitingCorrection} waiting on a correction` : 'None to review'}
        href={hrefs.unreviewed}
      />
      <KpiTile
        label="Serious open"
        icon={AlertOctagon}
        value={kpis.seriousOpen}
        tone="danger"
        sub="Escalated to the Master and fleet HR"
        zeroLabel="No serious breach open"
        href={hrefs.seriousOpen}
      />
      <KpiTile
        label="Not submitted"
        icon={FileClock}
        value={kpis.notSubmitted}
        tone="warn"
        sub={kpis.notSubmittedMonths === 1 ? 'Crew months in 1 ended month' : `Crew months in ${kpis.notSubmittedMonths} ended months`}
        zeroLabel={kpis.anyMonthEnded ? 'Every ended month submitted' : 'No month has ended yet'}
        href={hrefs.notSubmitted}
      />
      <KpiTile
        label="Awaiting approval"
        icon={ClipboardCheck}
        value={kpis.awaitingApproval}
        tone="info"
        sub="Submitted months to sign off"
        zeroLabel="Nothing waiting"
        href={hrefs.awaitingApproval}
      />
    </div>
  );
};

// ---------------------------------------------------------------- by month

const Section: React.FC<{ id: string; title: string; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  id,
  title,
  description,
  actions,
  children,
  className,
}) => (
  <section aria-labelledby={id} className={cn('min-w-0 space-y-3', className)} data-report-section={id}>
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h2 id={id} className="type-h3 text-foreground">
          {title}
        </h2>
        {description ? <p className="type-body-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions}
    </div>
    {children}
  </section>
);

const MonthTable: React.FC<{
  rows: readonly MonthRow[];
  year: number;
  anyCrew: boolean;
  vesselName: string;
  monthHref: ((month: number) => string) | null;
}> = ({ rows, year, anyCrew, vesselName, monthHref }) => {
  const wide = useMinWidth(TABLET_MIN_WIDTH);
  const columns = useMemo<DataTableColumn<MonthRow>[]>(
    () => [
      {
        id: 'month',
        header: 'Month',
        sticky: true,
        minWidth: 120,
        value: (r) => r.month,
        sortDescFirst: true,
        cell: (r) =>
          monthHref && r.phase !== 'before_start' ? (
            <Link to={monthHref(r.month)} className="rounded-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-ring">
              {r.label}
            </Link>
          ) : (
            <span className="font-medium text-foreground">{r.label}</span>
          ),
      },
      { id: 'crew', header: 'Crew', kind: 'number', value: (r) => r.crew },
      { id: 'days', header: 'Days logged', kind: 'number', value: (r) => r.daysLogged },
      { id: 'breach_days', header: 'Breach days', kind: 'number', value: (r) => r.breachDays },
      {
        id: 'unreviewed',
        header: 'Unreviewed',
        kind: 'number',
        value: (r) => r.unreviewed,
        cell: (r) => (
          <span className="inline-flex flex-col items-end">
            <span className={cn('tabular-nums', r.unreviewed ? 'font-medium text-foreground' : 'text-muted-foreground')}>{r.unreviewed}</span>
            {r.seriousOpen ? <span className="type-caption text-critical">{r.seriousOpen} serious</span> : null}
            {r.awaitingCorrection ? <span className="type-caption text-muted-foreground">{r.awaitingCorrection} to correct</span> : null}
          </span>
        ),
      },
      {
        id: 'submission',
        header: 'Submission',
        minWidth: 220,
        value: (r) => r.submission.label,
        cell: (r) => (
          <span className="flex min-w-0 flex-col items-start gap-0.5">
            <StatusPill tone={r.submission.tone} label={r.submission.label} />
            {r.submission.detail && r.submission.detail !== r.submission.label ? (
              <span className="type-caption text-muted-foreground">{r.submission.detail}</span>
            ) : null}
          </span>
        ),
      },
    ],
    [monthHref],
  );
  return (
    <Section id="hor-report-months" title="By month" description="Each month of the year up to the current one, newest first.">
      {!rows.length || !anyCrew ? (
        <PageEmpty
          icon={CalendarClock}
          title={rows.length ? `Nobody was on board in ${year}` : `${year} has no months to show`}
          body={rows.length ? `No one was assigned to ${vesselName} in ${year}.` : 'The report shows months up to the vessel’s current one.'}
          headingLevel={3}
          bordered
        />
      ) : !wide ? (
        <MonthCards rows={rows} year={year} monthHref={monthHref} />
      ) : (
        <DataTable label={`Hours of rest by month, ${year}`} noun={{ one: 'month', other: 'months' }} data={rows} columns={columns} getRowId={(r) => String(r.month)} searchable={false} showDensityToggle={false} rowClassName={(r) => (r.phase === 'before_start' ? 'text-muted-foreground' : undefined)} />
      )}
    </Section>
  );
};

/** Below the tablet width the months are cards: the month and its submissions first, the figures in words under them. */
const MonthCards: React.FC<{ rows: readonly MonthRow[]; year: number; monthHref: ((month: number) => string) | null }> = ({ rows, year, monthHref }) => (
  <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card" aria-label={`Hours of rest by month, ${year}`} data-month-cards="">
    {rows.map((r) => {
      const figures = [
        `${r.crew} crew`,
        `${r.daysLogged} days logged`,
        r.breachDays ? `${r.breachDays} breach ${r.breachDays === 1 ? 'day' : 'days'}` : null,
        r.unreviewed ? `${r.unreviewed} unreviewed${r.seriousOpen ? ` (${r.seriousOpen} serious)` : ''}` : null,
        r.awaitingCorrection ? `${r.awaitingCorrection} to correct` : null,
      ].filter(Boolean);
      return (
        <li key={r.month} className={cn('min-w-0 space-y-1 px-4 py-3', r.phase === 'before_start' && 'text-muted-foreground')} data-month-card={r.month}>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
            {monthHref && r.phase !== 'before_start' ? (
              <Link to={monthHref(r.month)} className="inline-flex min-h-11 items-center rounded-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-ring">
                {r.label}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{r.label}</span>
            )}
            <StatusPill tone={r.submission.tone} label={r.submission.label} />
          </div>
          {r.phase !== 'before_start' ? <p className="type-caption text-muted-foreground">{figures.join(' · ')}</p> : null}
          {r.submission.detail ? <p className="type-caption text-muted-foreground">{r.submission.detail}</p> : null}
        </li>
      );
    })}
  </ul>
);

// ---------------------------------------------------------------- open breaches

type Decision = ReturnType<typeof useCapability>;

const PanelNote: React.FC<{ children: React.ReactNode; icon?: React.ReactNode }> = ({ children, icon }) => (
  <p className="flex items-start gap-2 rounded-lg border border-dashed border-border bg-card px-4 py-3 type-body-sm text-muted-foreground">
    {icon}
    <span>{children}</span>
  </p>
);

const OPEN_SHOWN = 6;

const OpenBreachesPanel: React.FC<{ vesselId: string; year: number; canReview: Decision; boardHref: (query: string) => string }> = ({ vesselId, year, canReview, boardHref }) => {
  const query = useVesselBreaches({ vesselId, from: `${year}-01-01`, to: `${year}-12-31`, onlyOpen: true, enabled: canReview.allowed });
  const rows = useMemo<WorkRestVesselBreachRow[]>(() => (query.data?.applied ? sortBreaches(query.data.data.filter(isOpenBreach)) : []), [query.data]);
  let body: React.ReactNode;
  if (canReview.status === 'loading') body = <PageLoading variant="list" rows={3} label="Checking your access" slowAfterMs={null} />;
  else if (!canReview.allowed) body = <PanelNote>Open breaches are listed for the vessel's hours of rest approvers.</PanelNote>;
  else if (query.isLoading) body = <PageLoading variant="list" rows={3} label="Loading the open breaches" slowAfterMs={null} />;
  else if (query.error) body = <PageError error={query.error} title="The open breaches could not load" onRetry={() => void query.refetch()} variant="inline" headingLevel={3} />;
  else if (query.data && !query.data.applied) body = <PanelNote icon={<Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}>Breach review is not set up on this database yet.</PanelNote>;
  else if (!rows.length) body = <PanelNote>No breach is open in {year}. Every breach recorded this year has been reviewed.</PanelNote>;
  else {
    body = (
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card" aria-label={`Open breaches, ${year}`} data-open-breaches="">
        {rows.slice(0, OPEN_SHOWN).map((b) => (
          <li key={b.nc_id} className={cn('flex min-w-0 flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3', b.is_serious && 'bg-critical-muted/40')}>
            <div className="min-w-0 sm:flex-1">
              <p className="truncate font-medium text-foreground">{personName(b)}</p>
              <p className="type-caption text-muted-foreground">
                {b.breach_day ? shortDate(b.breach_day) : 'No day'} · {ruleLabel(b.rule_code)}
                {b.deficit_hours !== null ? ` · ${deficitText(b.deficit_hours)} short` : ''}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {b.is_serious ? <StatusPill tone="danger" label="Serious" /> : null}
              <StatusPill domain="work_rest_nc" status={breachState(b)} />
            </div>
          </li>
        ))}
      </ul>
    );
  }
  const latest = rows[0]?.breach_day;
  return (
    <Section
      id="hor-report-open-breaches"
      title="Open breaches"
      description={rows.length ? `${rows.length} still to review or correct, serious first.` : 'Breaches not yet accepted or dismissed.'}
      actions={
        canReview.allowed && rows.length ? (
          <Button asChild variant="outline" size="sm" className={COARSE}>
            <Link to={boardHref(`${latest ? `month=${latest.slice(0, 7)}&` : ''}breaches=open`)}>
              Review on the board{rows.length > OPEN_SHOWN ? ` (${rows.length})` : ''}
            </Link>
          </Button>
        ) : null
      }
    >
      {body}
    </Section>
  );
};

// ---------------------------------------------------------------- breach reports sent

const SentReportsPanel: React.FC<{
  vesselId: string;
  vesselName: string;
  vesselCode: string | null;
  year: number;
  canDownload: boolean;
  isFinalApprover: boolean;
  highlight: string | null;
  onCreate: (() => void) | null;
}> = ({ vesselId, vesselName, vesselCode, year, canDownload, isFinalApprover, highlight, onCreate }) => {
  const query = useSentBreachReports({ vesselId, year });
  const reports = useMemo(() => (query.data?.applied ? query.data.data : []), [query.data]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!highlight || !reports.some((r) => r.id === highlight)) return;
    const row = document.querySelector(`[data-sent-report="${CSS.escape(highlight)}"]`);
    if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'center' });
  }, [highlight, reports]);

  const download = async (report: SentReport) => {
    setBusy(report.id);
    try {
      const { rows, missing } = await loadReportBreaches(vesselId, report);
      if (!rows.length) {
        notify.error(new Error('The breaches of this report are no longer on record, so no PDF was made.'), { title: 'PDF not made' });
        return;
      }
      const [{ exportBreachReportPdf }, { notifyExportResult }] = await Promise.all([import('../reports/exports'), import('@/lib/export')]);
      const result = await exportBreachReportPdf({ vesselId, vesselCode, vesselName, report, rows });
      notifyExportResult(result);
      if (result.status === 'ok' && missing > 0) {
        notify.info(missing === 1 ? '1 breach of this report is no longer listed: its record was corrected.' : `${missing} breaches of this report are no longer listed: their records were corrected.`);
      }
    } catch (e) {
      notify.error(new Error(reportErrorText(e)), { title: 'PDF not made' });
    } finally {
      setBusy(null);
    }
  };

  let body: React.ReactNode;
  if (query.isLoading) body = <PageLoading variant="list" rows={2} label="Loading the breach reports" slowAfterMs={null} />;
  else if (query.error) body = <PageError error={query.error} title="The breach reports could not load" onRetry={() => void query.refetch()} variant="inline" headingLevel={3} />;
  else if (query.data && !query.data.applied) body = <PanelNote icon={<Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}>Breach reports are not set up on this database yet.</PanelNote>;
  else if (!reports.length) {
    body = (
      <PanelNote>
        {isFinalApprover ? `No breach report was sent for ${year}.` : `No breach report of ${year} was shared with you.`} A report is never sent on its own: the
        final approver creates it from reviewed breaches.
      </PanelNote>
    );
  } else {
    body = (
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card" aria-label={`Breach reports, ${year}`}>
        {reports.map((r) => (
          <li
            key={r.id}
            className={cn('flex min-w-0 flex-wrap items-start justify-between gap-3 px-4 py-3', r.id === highlight && 'bg-signal-muted ring-2 ring-inset ring-primary')}
            data-sent-report={r.id}
            aria-current={r.id === highlight ? 'true' : undefined}
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="flex flex-wrap items-center gap-2">
                <span className="type-mono rounded-sm border border-input px-1.5 py-0.5 text-foreground">{r.reference}</span>
                <span className="type-body-sm text-foreground">{periodText(r.periodFrom, r.periodTo)}</span>
              </p>
              <p className="type-caption text-muted-foreground">{sentReportLine(r)}</p>
              <p className="type-caption text-muted-foreground">{sentByLine(r)}</p>
              {r.notes ? <p className="line-clamp-2 type-caption text-foreground">{r.notes}</p> : null}
            </div>
            {canDownload ? (
              <Button type="button" variant="outline" size="sm" className={COARSE} disabled={busy !== null} onClick={() => download(r)} aria-label={`Download ${r.reference} as PDF`}>
                <FileText aria-hidden="true" />
                {busy === r.id ? 'Making…' : 'PDF'}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <Section
      id="hor-report-sent"
      title="Breach reports sent"
      description={isFinalApprover ? `Every breach report of ${vesselName} for ${year}, shared in STORM.` : 'The breach reports shared with you.'}
      actions={
        onCreate && !query.isLoading && query.data?.applied ? (
          <Button type="button" variant="outline" size="sm" className={COARSE} onClick={onCreate}>
            <Send aria-hidden="true" />
            New report
          </Button>
        ) : null
      }
    >
      {body}
      {canDownload || !reports.length ? null : (
        <p className="type-caption text-muted-foreground">The PDF of a report is made for the vessel's hours of rest approvers.</p>
      )}
    </Section>
  );
};

// ---------------------------------------------------------------- reminders (C41)

const REMINDERS_SHOWN = 8;

const RemindersPanel: React.FC<{ vesselId: string; year: number; canSee: Decision }> = ({ vesselId, year, canSee }) => {
  const query = useReminderLog({ vesselId, year, enabled: canSee.allowed });
  const [all, setAll] = useState(false);
  const log = query.data?.applied ? query.data.data : null;
  const notice = log ? autoRemindersNotice(log.automaticSeen) : null;
  let body: React.ReactNode;
  if (canSee.status === 'loading') body = <PageLoading variant="list" rows={2} label="Checking your access" slowAfterMs={null} />;
  else if (!canSee.allowed) body = <PanelNote>The reminder log is for the vessel's hours of rest approvers.</PanelNote>;
  else if (query.isLoading) body = <PageLoading variant="list" rows={2} label="Loading the reminders" slowAfterMs={null} />;
  else if (query.error) body = <PageError error={query.error} title="The reminders could not load" onRetry={() => void query.refetch()} variant="inline" headingLevel={3} />;
  else if (query.data && !query.data.applied) body = <PanelNote icon={<Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}>Reminders are not set up on this database yet.</PanelNote>;
  else if (log) {
    const shown = all ? log.entries : log.entries.slice(0, REMINDERS_SHOWN);
    body = (
      <div className="space-y-3">
        {notice ? (
          <Alert variant="info" data-auto-reminders="not-scheduled">
            <BellRing aria-hidden="true" className="h-4 w-4" />
            <AlertDescription>{notice}. Reminders are sent from the board until the daily reminder run is switched on for the company.</AlertDescription>
          </Alert>
        ) : null}
        {!log.entries.length ? (
          <PanelNote>No reminder was sent about {year}'s months.</PanelNote>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card" aria-label={`Reminders, ${year}`} data-reminder-log="">
            {shown.map((e) => (
              <li key={e.id} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{e.crewName}</p>
                  <p className="type-caption text-muted-foreground">
                    {reminderWho(e)} · about {reminderMonth(e)}
                  </p>
                </div>
                <span className="shrink-0 type-caption tabular-nums text-muted-foreground">{shortDate(e.sentOn)}</span>
              </li>
            ))}
          </ul>
        )}
        {log.entries.length > REMINDERS_SHOWN ? (
          <Button type="button" variant="ghost" size="sm" className={COARSE} onClick={() => setAll((v) => !v)} aria-expanded={all}>
            {all ? 'Show fewer' : `Show all ${log.entries.length}`}
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <Section id="hor-report-reminders" title="Reminders" description={`Who was reminded to complete their hours of rest, about ${year}'s months.`}>
      {body}
    </Section>
  );
};

export default HoursOfRestReportPage;
