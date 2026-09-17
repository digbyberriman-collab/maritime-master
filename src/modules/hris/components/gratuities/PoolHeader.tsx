import React from 'react';
import { ArrowLeft, Ban, Calculator, Check, CheckCircle2, Download, HandCoins, Loader2, Pencil, Trash2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatDate, formatDateTime, formatMinor, humanise } from '@/modules/hris/lib/format';
import {
  POOL_STATUS_STEPS,
  SPLIT_METHOD_LABEL,
  asSplitMethod,
  canApprovePool,
  canCalculatePool,
  canCancelPool,
  canDeletePool,
  canMarkDistributed,
  isPoolEditable,
  netAmountMinor,
  poolStepIndex,
} from '@/modules/hris/lib/gratuities';
import type { GratuityPoolDetail } from '@/modules/hris/hooks/useGratuities';
import { PoolStatusBadge } from './GratuityBadges';

interface PoolHeaderProps {
  pool: GratuityPoolDetail;
  canEdit: boolean;
  canAdmin: boolean;
  busy?: boolean;
  onBack: () => void;
  onCalculate: () => void;
  onEdit: () => void;
  onApprove: () => void;
  onMarkDistributed: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onExport: () => void;
}

const Stepper: React.FC<{ status: string }> = ({ status }) => {
  const current = poolStepIndex(status);
  const cancelled = status === 'cancelled';
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label="Pool status">
      {POOL_STATUS_STEPS.map((step, i) => {
        const done = !cancelled && i < current;
        const active = !cancelled && i === current;
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold',
                done && 'border-green-500/40 bg-green-500/15 text-green-500',
                active && 'border-primary bg-primary text-primary-foreground',
                !done && !active && 'border-border bg-muted text-muted-foreground',
              )}
            >
              {done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className={cn('font-medium', active ? 'text-foreground' : done ? 'text-foreground/80' : 'text-muted-foreground')}>{humanise(step)}</span>
            {i < POOL_STATUS_STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" aria-hidden />}
          </li>
        );
      })}
      {cancelled && (
        <li className="flex items-center gap-1 font-medium text-destructive">
          <XCircle className="h-4 w-4" /> Cancelled
        </li>
      )}
    </ol>
  );
};

const Fact: React.FC<{ label: string; value: React.ReactNode; muted?: boolean }> = ({ label, value, muted }) => (
  <div className="min-w-0">
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className={cn('truncate text-sm', muted ? 'text-muted-foreground' : 'text-foreground')}>{value}</p>
  </div>
);

/** Pool identity, status stepper, net amount and the workflow actions (gated by status + access). */
export const PoolHeader: React.FC<PoolHeaderProps> = ({
  pool,
  canEdit,
  canAdmin,
  busy,
  onBack,
  onCalculate,
  onEdit,
  onApprove,
  onMarkDistributed,
  onCancel,
  onDelete,
  onExport,
}) => {
  const net = netAmountMinor(pool);
  const showCalculate = canEdit && canCalculatePool(pool.status);
  const showEdit = canEdit && isPoolEditable(pool.status);
  const showApprove = canAdmin && canApprovePool(pool.status);
  const showDistribute = canAdmin && canMarkDistributed(pool.status);
  const showCancel = canEdit && canCancelPool(pool.status) && (pool.status !== 'approved' || canAdmin);
  const showDelete = canEdit && canDeletePool(pool.status);
  const hasShares = pool.distributions.length > 0;

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <Button variant="ghost" size="sm" className="-ml-2 h-7 px-2 text-muted-foreground" onClick={onBack}>
              <ArrowLeft className="mr-1 h-4 w-4" /> All pools
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-foreground">{pool.name}</h2>
              <PoolStatusBadge status={pool.status} />
            </div>
            <Stepper status={pool.status} />
          </div>

          <div className="flex shrink-0 flex-col items-start gap-1 rounded-lg border bg-muted/40 px-4 py-3 lg:items-end">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Net to distribute</span>
            <span className="text-2xl font-semibold tabular-nums text-foreground">{formatMinor(net, pool.currency)}</span>
            <span className="text-xs text-muted-foreground">
              {formatMinor(pool.gross_amount_minor, pool.currency)} gross
              {pool.deductions_minor ? ` − ${formatMinor(pool.deductions_minor, pool.currency)} deductions` : ''}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
          <Fact label="Vessel" value={pool.vessel_name ?? '—'} />
          <Fact label="Period" value={`${formatDate(pool.period_start)} – ${formatDate(pool.period_end)}`} />
          <Fact label="Received" value={formatDate(pool.received_date)} />
          <Fact label="Source" value={humanise(pool.source)} />
          <Fact label="Split method" value={SPLIT_METHOD_LABEL[asSplitMethod(pool.split_method)]} />
          <Fact
            label={pool.status === 'distributed' ? 'Distributed' : pool.status === 'approved' ? 'Approved' : 'Calculated'}
            value={formatDateTime(pool.status === 'distributed' ? pool.distributed_at : pool.status === 'approved' ? pool.approved_at : pool.calculated_at)}
            muted
          />
        </div>

        {(pool.deductions_note || pool.notes) && (
          <div className="space-y-1 text-sm text-muted-foreground">
            {pool.deductions_note && (
              <p>
                <span className="font-medium text-foreground/80">Deductions:</span> {pool.deductions_note}
              </p>
            )}
            {pool.notes && <p className="whitespace-pre-line">{pool.notes}</p>}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          {showCalculate && (
            <Button onClick={onCalculate} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
              {pool.status === 'draft' ? 'Calculate' : 'Recalculate'}
            </Button>
          )}
          {showApprove && (
            <Button onClick={onApprove} disabled={busy || !hasShares} variant={showCalculate ? 'secondary' : 'default'}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
            </Button>
          )}
          {showDistribute && (
            <Button onClick={onMarkDistributed} disabled={busy}>
              <HandCoins className="mr-2 h-4 w-4" /> Mark distributed
            </Button>
          )}
          {showEdit && (
            <Button variant="outline" onClick={onEdit} disabled={busy}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </Button>
          )}
          <Button variant="outline" onClick={onExport} disabled={!hasShares}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {showCancel && (
              <Button variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={onCancel} disabled={busy}>
                <Ban className="mr-2 h-4 w-4" /> Cancel pool
              </Button>
            )}
            {showDelete && (
              <Button variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={onDelete} disabled={busy}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PoolHeader;
