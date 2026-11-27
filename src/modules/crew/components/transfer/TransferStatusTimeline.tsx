import React from 'react';
import { Check, Circle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { transferTimeline, type TimelineStep, type TransferProgress } from '@/modules/crew/lib/transfer';

const STATE_WORDS: Record<TimelineStep['state'], string> = {
  done: 'done',
  current: 'current step',
  upcoming: 'not reached',
  cancelled: 'stopped here',
};

/**
 * Where a transfer stands (gap/04 W9): Details, Review, Fleet approval
 * (only when a vessel asks for it), Scheduled, Completed. Steps read in
 * words as well as marks (never colour alone); a cancelled transfer marks
 * the step it stopped at. Wraps onto two lines at 390 px instead of
 * scrolling.
 */
export const TransferStatusTimeline: React.FC<{ progress: TransferProgress; className?: string }> = ({ progress, className }) => {
  const steps = transferTimeline(progress);
  return (
    <ol className={cn('flex flex-wrap items-center gap-x-1 gap-y-2', className)} aria-label="Transfer progress" data-transfer-timeline="">
      {steps.map((step, i) => (
        <li key={step.key} className="flex items-center gap-1" data-step={step.key} data-state={step.state}>
          <span
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 type-caption',
              step.state === 'done' && 'border-success/40 bg-success-muted text-success',
              step.state === 'current' && 'border-primary/50 bg-primary/10 text-foreground',
              step.state === 'upcoming' && 'border-border text-muted-foreground',
              step.state === 'cancelled' && 'border-critical/40 bg-critical-muted text-critical',
            )}
            aria-current={step.state === 'current' ? 'step' : undefined}
          >
            {step.state === 'done' ? (
              <Check aria-hidden="true" className="size-3.5" />
            ) : step.state === 'cancelled' ? (
              <X aria-hidden="true" className="size-3.5" />
            ) : (
              <Circle aria-hidden="true" className={cn('size-2.5', step.state === 'current' ? 'fill-primary text-primary' : '')} />
            )}
            <span>{step.label}</span>
            <span className="sr-only">: {STATE_WORDS[step.state]}</span>
          </span>
          {i < steps.length - 1 ? <span aria-hidden="true" className="h-px w-3 bg-border" /> : null}
        </li>
      ))}
    </ol>
  );
};

export default TransferStatusTimeline;
