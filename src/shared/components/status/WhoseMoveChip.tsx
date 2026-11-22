import * as React from 'react';
import { Building2, CheckCircle2, Ship, type LucideIcon } from 'lucide-react';
import type { DateInput } from '@/lib/records/dates';
import { whoseMoveLabel } from '@/lib/records/whoseMove';
import type { EnvelopeStatus, WhoseMove } from '@/lib/records/types';
import { StatusPill, type StatusPillProps } from './StatusPill';
import { statusTone } from './statusTone';
import { formatWaiting, waitingDays } from './helpers';

const ICONS: Record<WhoseMove, LucideIcon> = {
  vessel: Ship,
  company: Building2,
  none: CheckCircle2,
};

export interface WhoseMoveChipProps extends Omit<StatusPillProps, 'tone' | 'domain' | 'status' | 'label' | 'icon'> {
  /** From the envelope (server) or `whoseMove()` in `@/lib/records`. */
  move: WhoseMove;
  /** The envelope status, so a voided record reads "Voided" rather than "Closed". */
  status?: EnvelopeStatus;
  /** When the move passed to this side (last transition or thread entry); shows the age. */
  since?: DateInput | null;
  /** Today, for reproducible ages in tests and reports. */
  now?: DateInput;
}

/**
 * Whose-move chip (gap/10 §A.8, engine 3): "Waiting on vessel" (info),
 * "Waiting on company" (purple) or "Closed" (neutral), plus how long it has
 * waited. Shown on SMS, permit and risk-assessment rows and record headers so
 * a record never reads "Completed" while the company still has to act.
 */
export const WhoseMoveChip = React.forwardRef<HTMLSpanElement, WhoseMoveChipProps>(
  ({ move, status, since, now, ...props }, ref) => {
    const label = whoseMoveLabel(move, status);
    const days = move === 'none' ? null : waitingDays(since, now);
    return (
      <StatusPill ref={ref} tone={statusTone('whose_move', move)} icon={ICONS[move] ?? CheckCircle2} data-move={move} {...props}>
        {label}
        {days !== null && (
          <>
            <span aria-hidden="true"> · </span>
            <span className="sr-only">, for </span>
            <span className="font-medium tabular-nums">{formatWaiting(days)}</span>
          </>
        )}
      </StatusPill>
    );
  },
);
WhoseMoveChip.displayName = 'WhoseMoveChip';
