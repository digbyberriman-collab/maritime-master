import React from 'react';
import { ArrowRight } from 'lucide-react';
import { StatusPill } from '@/shared/components/status';
import type { Transfer } from '@/modules/crew/lib/transfer';
import { daysBetween, formatTransferDay } from '@/modules/crew/lib/transfer';

/** The move in one card: from where to where, the position and the dates. */
export const TransferSummary: React.FC<{ transfer: Transfer }> = ({ transfer }) => {
  const gap = daysBetween(transfer.signOffDate, transfer.signOnDate);
  return (
    <dl className="grid gap-3 rounded-md border border-border bg-muted/40 p-3 sm:grid-cols-2" data-transfer-summary="">
      <div className="min-w-0 sm:col-span-2">
        <dt className="sr-only">Move</dt>
        <dd className="flex flex-wrap items-center gap-2 type-body font-medium text-foreground">
          <span className="break-words">{transfer.fromVessel.name}</span>
          <ArrowRight aria-label="to" className="size-4 shrink-0 text-muted-foreground" />
          <span className="break-words">{transfer.toVessel.name}</span>
          <StatusPill domain="crew_transfer" status={transfer.status} />
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="type-caption text-muted-foreground">Position</dt>
        <dd className="type-body">
          {transfer.toPosition?.name ?? 'Not chosen'}
          {transfer.sameRole ? <span className="type-caption text-muted-foreground"> · same role</span> : null}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="type-caption text-muted-foreground">Dates</dt>
        <dd className="type-body">
          Signs off {formatTransferDay(transfer.signOffDate)}, joins {formatTransferDay(transfer.signOnDate)}
          <span className="type-caption text-muted-foreground">{gap === 0 ? ' · same day' : ` · ${gap} day${gap === 1 ? '' : 's'} between`}</span>
        </dd>
      </div>
      {transfer.notes ? (
        <div className="min-w-0 sm:col-span-2">
          <dt className="type-caption text-muted-foreground">Notes</dt>
          <dd className="type-body break-words">{transfer.notes}</dd>
        </div>
      ) : null}
    </dl>
  );
};

export default TransferSummary;
