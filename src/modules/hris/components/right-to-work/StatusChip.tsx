import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDate } from '@/modules/hris/lib/format';
import { COMPLIANCE_LABELS, type ComplianceStatus, type MatrixCell } from '@/modules/hris/lib/rightToWork';

export const STATUS_CHIP_CLASS: Record<ComplianceStatus, string> = {
  expired: 'bg-destructive/10 text-destructive border-destructive/20',
  critical: 'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400',
  warning: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:text-yellow-400',
  ok: 'bg-green-500/10 text-green-600 border-green-500/20 dark:text-green-400',
  missing: 'bg-muted text-muted-foreground border-border border-dashed',
};

const short = (status: ComplianceStatus, days: number | null): string => {
  if (status === 'missing') return '—';
  if (status === 'ok') return 'OK';
  if (days === null) return COMPLIANCE_LABELS[status];
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return 'Today';
  return `${days}d`;
};

export const StatusChip: React.FC<{ status: ComplianceStatus; label?: string; className?: string }> = ({ status, label, className }) => (
  <Badge variant="outline" className={cn('whitespace-nowrap text-[11px] font-medium', STATUS_CHIP_CLASS[status], className)}>
    {label ?? COMPLIANCE_LABELS[status]}
  </Badge>
);

/** A matrix cell chip with the underlying items in a tooltip. */
export const CellChip: React.FC<{ cell: MatrixCell }> = ({ cell }) => {
  const chip = <StatusChip status={cell.status} label={short(cell.status, cell.soonestDays)} className="min-w-[52px] justify-center" />;
  if (cell.items.length === 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild><span>{chip}</span></TooltipTrigger>
        <TooltipContent>Not recorded</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild><span className="inline-flex items-center gap-1">{chip}{cell.items.length > 1 && <span className="text-[10px] text-muted-foreground">×{cell.items.length}</span>}</span></TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <ul className="space-y-0.5 text-xs">
          {cell.items.map((i, idx) => (
            <li key={`${i.label}-${idx}`} className="flex items-center justify-between gap-3">
              <span className="truncate">{i.label}</span>
              <span className={cn('shrink-0', i.status === 'expired' ? 'text-destructive' : i.status === 'critical' ? 'text-orange-400' : i.status === 'warning' ? 'text-yellow-400' : 'text-muted-foreground')}>
                {i.dueDate ? formatDate(i.dueDate) : 'no expiry'}
              </span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
};
