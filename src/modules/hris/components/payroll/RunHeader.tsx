import React from 'react';
import { ArrowLeft, Ban, Calculator, Check, CheckCircle2, Download, FileText, Loader2, Send, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatDate, formatDateTime, formatMinor, humanise } from '@/modules/hris/lib/format';
import { RUN_STEPS, asRunStatus, type PayrollRunStatus } from '@/modules/hris/lib/payroll/runHelpers';
import type { PayrollRunDetail } from '@/modules/hris/hooks/usePayroll';
import { RunStatusBadge } from './PayrollStatusBadge';

interface RunHeaderProps {
  run: PayrollRunDetail;
  canEdit: boolean;
  canAdmin: boolean;
  busy: boolean;
  onBack: () => void;
  onCalculate: () => void;
  onSubmit: () => void;
  onApprove: () => void;
  onMarkPaid: () => void;
  onCancel: () => void;
  onGeneratePayslips: () => void;
  onExportCsv: () => void;
}

const Stepper: React.FC<{ status: PayrollRunStatus }> = ({ status }) => {
  const idx = RUN_STEPS.indexOf(status);
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs">
      {RUN_STEPS.map((step, i) => {
        const done = idx > i;
        const current = idx === i;
        return (
          <li key={step} className="flex items-center gap-1">
            <span
              className={cn(
                'flex items-center gap-1 rounded-full border px-2 py-0.5',
                done && 'border-green-500/30 bg-green-500/10 text-green-500',
                current && 'border-primary bg-primary/10 font-medium text-primary',
                !done && !current && 'border-border text-muted-foreground',
              )}
            >
              {done ? <Check className="h-3 w-3" /> : <span className="h-3 w-3 text-center leading-3">{i + 1}</span>}
              {humanise(step)}
            </span>
            {i < RUN_STEPS.length - 1 && <span className="h-px w-3 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
};

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <div className="min-w-0">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="truncate text-lg font-semibold tabular-nums text-foreground">{value}</p>
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

/** Run identity, status stepper, totals and the gated action bar. */
export const RunHeader: React.FC<RunHeaderProps> = ({
  run,
  canEdit,
  canAdmin,
  busy,
  onBack,
  onCalculate,
  onSubmit,
  onApprove,
  onMarkPaid,
  onCancel,
  onGeneratePayslips,
  onExportCsv,
}) => {
  const status = asRunStatus(run.status);
  const isCancelled = status === 'cancelled';
  const showCalculate = canEdit && (status === 'draft' || status === 'calculated');
  const showSubmit = canEdit && status === 'calculated';
  const showApprove = canAdmin && status === 'pending_approval';
  const showPay = canAdmin && status === 'approved';
  const showCancel = canEdit && status !== 'paid' && !isCancelled;
  const showPayslips = canEdit && (status === 'approved' || status === 'paid') && run.lines.length > 0;
  const payslipsDone = run.lines.filter((l) => l.status !== 'excluded' && l.payslip_path).length;
  const payslipsTotal = run.lines.filter((l) => l.status !== 'excluded').length;

  return (
    <Card className="bg-card">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3 w-3" /> All runs
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-xl font-semibold text-foreground">{run.run_number}</h2>
              <RunStatusBadge status={run.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {run.period ? `${run.period.label} · ${formatDate(run.period.start_date)} – ${formatDate(run.period.end_date)}` : 'No pay period'}
              {' · '}
              {run.vessel_name ?? 'Company-wide'}
              {' · '}
              {run.currency}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showCalculate && (
              <Button onClick={onCalculate} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
                {status === 'draft' ? 'Calculate' : 'Recalculate'}
              </Button>
            )}
            {showSubmit && (
              <Button variant="secondary" onClick={onSubmit} disabled={busy}>
                <Send className="mr-2 h-4 w-4" /> Submit for approval
              </Button>
            )}
            {showApprove && (
              <Button onClick={onApprove} disabled={busy}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
              </Button>
            )}
            {showPay && (
              <Button onClick={onMarkPaid} disabled={busy}>
                <Wallet className="mr-2 h-4 w-4" /> Mark paid
              </Button>
            )}
            {showPayslips && (
              <Button variant="outline" onClick={onGeneratePayslips} disabled={busy}>
                <FileText className="mr-2 h-4 w-4" /> Generate all payslips
                {payslipsTotal > 0 && <span className="ml-2 text-xs text-muted-foreground">{payslipsDone}/{payslipsTotal}</span>}
              </Button>
            )}
            {run.lines.length > 0 && (
              <Button variant="outline" onClick={onExportCsv} disabled={busy}>
                <Download className="mr-2 h-4 w-4" /> Export CSV
              </Button>
            )}
            {showCancel && (
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={onCancel} disabled={busy}>
                <Ban className="mr-2 h-4 w-4" /> Cancel run
              </Button>
            )}
          </div>
        </div>

        {isCancelled ? (
          <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">This run was cancelled and is read-only.</p>
        ) : (
          <Stepper status={status} />
        )}

        <div className="grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4 lg:grid-cols-6">
          <Stat label="Headcount" value={run.headcount} hint={`${run.lines.filter((l) => l.status === 'excluded').length} excluded`} />
          <Stat label={`Gross (${run.currency})`} value={formatMinor(run.total_gross_minor, run.currency)} />
          <Stat label={`Deductions (${run.currency})`} value={formatMinor(run.total_deductions_minor, run.currency)} />
          <Stat label={`Net (${run.currency})`} value={formatMinor(run.total_net_minor, run.currency)} />
          <Stat label="Calculated" value={<span className="text-sm">{run.calculated_at ? formatDateTime(run.calculated_at) : '—'}</span>} />
          <Stat
            label={status === 'paid' ? 'Paid' : status === 'approved' ? 'Approved' : 'Submitted'}
            value={<span className="text-sm">{formatDateTime(status === 'paid' ? run.paid_at : status === 'approved' ? run.approved_at : run.submitted_at)}</span>}
          />
        </div>
        {run.notes && <p className="text-sm text-muted-foreground">{run.notes}</p>}
      </CardContent>
    </Card>
  );
};

export default RunHeader;
