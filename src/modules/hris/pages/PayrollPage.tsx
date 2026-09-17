import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, FileEdit, Plus, Receipt, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePayrollAccess } from '@/modules/auth/hooks/usePayrollAccess';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import {
  usePayPeriodsForRuns,
  usePayrollMutations,
  usePayrollRun,
  usePayrollRuns,
  usePayrollSettings,
  type PayrollLine,
} from '@/modules/hris/hooks/usePayroll';
import { formatMinor, humanise } from '@/modules/hris/lib/format';
import {
  DEFAULT_RUN_FILTERS,
  RUN_STATUSES,
  computePayrollKpis,
  downloadTextFile,
  runToCsv,
  runYear,
  type PayrollRunFilters,
  type PayrollRunStatus,
} from '@/modules/hris/lib/payroll/runHelpers';
import { RunsTable } from '@/modules/hris/components/payroll/RunsTable';
import { RunHeader } from '@/modules/hris/components/payroll/RunHeader';
import { LinesTable } from '@/modules/hris/components/payroll/LinesTable';
import { LineAdjustDialog } from '@/modules/hris/components/payroll/LineAdjustDialog';
import { NewRunDialog } from '@/modules/hris/components/payroll/NewRunDialog';
import { PreviewLinePanel } from '@/modules/hris/components/payroll/PreviewLinePanel';
import { MyPayslips } from '@/modules/hris/components/payroll/MyPayslips';

interface KpiTileProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'default' | 'warning' | 'success';
  active?: boolean;
  onClick?: () => void;
}

const KpiTile: React.FC<KpiTileProps> = ({ icon: Icon, label, value, hint, tone = 'default', active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      active && 'border-primary ring-1 ring-primary',
    )}
  >
    <div className={cn('rounded-md p-2', tone === 'warning' ? 'bg-yellow-500/10 text-yellow-500' : tone === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-primary/10 text-primary')}>
      <Icon className="h-5 w-5" />
    </div>
    <div className="min-w-0">
      <p className="truncate text-2xl font-semibold leading-none text-foreground">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
      {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  </button>
);

type Confirm = { kind: 'submit' | 'approve' | 'pay' | 'cancel' | 'payslips' } | null;

const CONFIRM_COPY: Record<NonNullable<Confirm>['kind'], { title: string; body: string; action: string; status?: PayrollRunStatus; destructive?: boolean }> = {
  submit: { title: 'Submit for approval?', body: 'Lines can no longer be adjusted once the run is submitted. A payroll admin will review and approve it.', action: 'Submit', status: 'pending_approval' },
  approve: { title: 'Approve this run?', body: 'Approval confirms the totals are correct and releases the run for payment.', action: 'Approve', status: 'approved' },
  pay: { title: 'Mark this run as paid?', body: 'This is final: lines and attached gratuities are marked paid, payslips become visible to crew and the run can no longer change.', action: 'Mark paid', status: 'paid' },
  cancel: { title: 'Cancel this run?', body: 'The run is kept for the audit trail but its lines will not be paid. Attached gratuities are released when a new run is calculated.', action: 'Cancel run', status: 'cancelled', destructive: true },
  payslips: { title: 'Generate payslips for every line?', body: 'A branded PDF is created for each included crew member and stored under their documents. Existing payslips are replaced.', action: 'Generate' },
};

const PayrollPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const runId = searchParams.get('run');
  const { profile } = useAuth();
  const access = usePayrollAccess();
  const canEdit = !access.loading && access.canEdit;
  const canAdmin = !access.loading && access.canAdmin;
  const selfOnly = !access.loading && access.selfOnly;

  const [filters, setFilters] = useState<PayrollRunFilters>(DEFAULT_RUN_FILTERS);
  const [newRunOpen, setNewRunOpen] = useState(false);
  const [adjusting, setAdjusting] = useState<PayrollLine | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const { vessels } = useCompanyVessels();
  const { settings } = usePayrollSettings();
  const { periods } = usePayPeriodsForRuns();
  const list = usePayrollRuns(filters);
  const detail = usePayrollRun(runId);
  const m = usePayrollMutations();

  const busy =
    m.createRun.isPending || m.calculateRun.isPending || m.updateLine.isPending || m.setLineExcluded.isPending || m.setStatus.isPending || m.generatePayslips.isPending;

  const thisYear = new Date().getFullYear();
  const kpis = useMemo(() => (list.isLoading ? null : computePayrollKpis(list.all, thisYear)), [list.isLoading, list.all, thisYear]);
  const years = useMemo(() => Array.from(new Set(list.all.map(runYear))).sort((a, b) => b - a), [list.all]);

  const openRun = (id: string | null) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set('run', id);
      else next.delete('run');
      return next;
    }, { replace: true });

  const run = detail.run;
  const runEditable = Boolean(run) && canEdit && (run?.status === 'draft' || run?.status === 'calculated');
  const payslipsAllowed = Boolean(run) && canEdit && (run?.status === 'approved' || run?.status === 'paid');

  const paidTotal = kpis
    ? Object.entries(kpis.paidThisYear.byCurrency).length <= 1
      ? formatMinor(kpis.paidThisYear.totalNetMinor, Object.keys(kpis.paidThisYear.byCurrency)[0] ?? settings.default_currency)
      : Object.entries(kpis.paidThisYear.byCurrency).map(([c, v]) => formatMinor(v, c)).join(' + ')
    : null;

  const runConfirm = async () => {
    if (!confirm || !run) return;
    const copy = CONFIRM_COPY[confirm.kind];
    if (confirm.kind === 'payslips') await m.generatePayslips.mutateAsync({ run });
    else if (copy.status) await m.setStatus.mutateAsync({ run, status: copy.status });
    setConfirm(null);
  };

  const exportCsv = () => {
    if (!run) return;
    downloadTextFile(runToCsv(run, run.lines), `${run.run_number}.csv`);
  };

  // ------------------------------------------------------------------ self-service
  if (selfOnly) {
    const name = profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() : 'crew';
    return (
      <div className="space-y-6">
        <HrisPageHeader icon={Receipt} title="Payroll" description="Your paid payslips." />
        <MyPayslips crewName={name || 'crew'} />
      </div>
    );
  }

  // ------------------------------------------------------------------ run mode
  if (runId) {
    return (
      <div className="space-y-6">
        <HrisPageHeader icon={Receipt} title="Payroll" description="Calculate, review, approve and pay a payroll run." />
        {detail.isLoading || access.loading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : !run ? (
          <Card className="border-dashed bg-card">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <Receipt className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium text-foreground">Run not found</p>
              <p className="text-sm text-muted-foreground">It may have been deleted or you may not have access to it.</p>
              <Button variant="outline" onClick={() => openRun(null)}>Back to runs</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <RunHeader
              run={run}
              canEdit={canEdit}
              canAdmin={canAdmin}
              busy={busy}
              onBack={() => openRun(null)}
              onCalculate={() => m.calculateRun.mutate(run)}
              onSubmit={() => setConfirm({ kind: 'submit' })}
              onApprove={() => setConfirm({ kind: 'approve' })}
              onMarkPaid={() => setConfirm({ kind: 'pay' })}
              onCancel={() => setConfirm({ kind: 'cancel' })}
              onGeneratePayslips={() => setConfirm({ kind: 'payslips' })}
              onExportCsv={exportCsv}
            />
            <LinesTable
              run={run}
              canAdjust={runEditable}
              canGeneratePayslip={payslipsAllowed}
              busy={busy}
              onAdjust={setAdjusting}
              onToggleExcluded={(line, excluded) => m.setLineExcluded.mutate({ line, excluded })}
              onGeneratePayslip={(line) => m.generatePayslips.mutate({ run, lines: [line] })}
            />
            {canEdit && <PreviewLinePanel defaultStart={run.period?.start_date} defaultEnd={run.period?.end_date} vesselId={run.vessel_id} />}

            <LineAdjustDialog
              open={Boolean(adjusting)}
              onOpenChange={(open) => !open && setAdjusting(null)}
              line={adjusting}
              runCurrency={run.currency}
              roundingMinor={settings.rounding_minor}
              isPending={m.updateLine.isPending}
              onSubmit={async (args) => {
                await m.updateLine.mutateAsync(args);
                setAdjusting(null);
              }}
            />

            <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{confirm ? CONFIRM_COPY[confirm.kind].title : ''}</AlertDialogTitle>
                  <AlertDialogDescription>{confirm ? CONFIRM_COPY[confirm.kind].body : ''}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={busy}>Back</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={busy}
                    className={confirm && CONFIRM_COPY[confirm.kind].destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      void runConfirm();
                    }}
                  >
                    {confirm ? CONFIRM_COPY[confirm.kind].action : ''}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------ list mode
  return (
    <div className="space-y-6">
      <HrisPageHeader
        icon={Receipt}
        title="Payroll"
        description="Payroll runs per pay period: calculated from active compensation, days onboard and approved gratuities."
        actions={
          canEdit && (
            <Button onClick={() => setNewRunOpen(true)} disabled={busy}>
              <Plus className="mr-2 h-4 w-4" /> New run
            </Button>
          )
        }
        toolbar={
          <>
            <Select value={filters.vesselId} onValueChange={(v) => setFilters((f) => ({ ...f, vesselId: v }))}>
              <SelectTrigger className="md:w-[200px]"><SelectValue placeholder="Vessel" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All vessels</SelectItem>
                <SelectItem value="company">Company-wide runs</SelectItem>
                {vessels.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v as PayrollRunFilters['status'] }))}>
              <SelectTrigger className="md:w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {RUN_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{humanise(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(filters.year)} onValueChange={(v) => setFilters((f) => ({ ...f, year: v === 'all' ? 'all' : Number(v) }))}>
              <SelectTrigger className="md:w-[140px]"><SelectValue placeholder="Year" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {(years.length ? years : [thisYear]).map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(filters.vesselId !== 'all' || filters.status !== 'all' || filters.year !== 'all') && (
              <Button variant="ghost" size="sm" onClick={() => setFilters(DEFAULT_RUN_FILTERS)}>Clear</Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile
          icon={FileEdit}
          label="Draft & calculated runs"
          value={kpis ? kpis.draftRuns : <Skeleton className="h-7 w-10" />}
          active={filters.status === 'draft' || filters.status === 'calculated'}
          onClick={() => setFilters({ ...DEFAULT_RUN_FILTERS, status: filters.status === 'draft' ? 'calculated' : 'draft' })}
        />
        <KpiTile
          icon={CheckCircle2}
          label="Awaiting approval"
          value={kpis ? kpis.awaitingApproval : <Skeleton className="h-7 w-10" />}
          tone="warning"
          active={filters.status === 'pending_approval'}
          onClick={() => setFilters({ ...DEFAULT_RUN_FILTERS, status: 'pending_approval' })}
        />
        <KpiTile
          icon={Wallet}
          label={`Paid in ${thisYear}`}
          value={paidTotal ?? <Skeleton className="h-7 w-24" />}
          hint={kpis ? `${kpis.paidThisYear.runs} run${kpis.paidThisYear.runs === 1 ? '' : 's'} (net)` : undefined}
          tone="success"
          active={filters.status === 'paid' && filters.year === thisYear}
          onClick={() => setFilters({ ...DEFAULT_RUN_FILTERS, status: 'paid', year: thisYear })}
        />
      </div>

      <RunsTable
        runs={list.runs}
        isLoading={list.isLoading || access.loading}
        onOpen={openRun}
        emptyHint={canEdit ? 'Create a run for an open pay period to get started.' : undefined}
      />

      {canEdit && <PreviewLinePanel defaultStart={periods[0]?.start_date} defaultEnd={periods[0]?.end_date} />}

      <NewRunDialog
        open={newRunOpen}
        onOpenChange={setNewRunOpen}
        periods={periods}
        vessels={vessels}
        defaultCurrency={settings.default_currency}
        isPending={m.createRun.isPending}
        onSubmit={async (args) => {
          const created = await m.createRun.mutateAsync(args);
          setNewRunOpen(false);
          openRun(created.id);
        }}
      />
    </div>
  );
};

export default PayrollPage;
