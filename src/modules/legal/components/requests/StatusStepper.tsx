import React from 'react';
import { Check, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_WORKFLOW, statusDef } from '@/modules/legal/lib/constants';
import { statusIndex } from '@/modules/legal/lib/requests';

/** Workflow stepper: submitted → triaged → in progress → under review → completed. */
export const StatusStepper: React.FC<{ status: string; className?: string }> = ({ status, className }) => {
  const current = statusIndex(status);
  if (status === 'cancelled') {
    return (
      <div className={cn('flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground', className)}>
        <XCircle className="h-4 w-4" aria-hidden /> This request was cancelled.
      </div>
    );
  }
  return (
    <ol className={cn('flex flex-wrap items-center gap-y-3', className)} aria-label="Request progress">
      {STATUS_WORKFLOW.map((s, i) => {
        const def = statusDef(s);
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={s} className="flex items-center">
            <div className="flex items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold',
                  state === 'done' && 'border-success bg-success text-success-foreground',
                  state === 'current' && 'border-primary bg-primary text-primary-foreground',
                  state === 'todo' && 'border-border bg-card text-muted-foreground',
                )}
              >
                {state === 'done' ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn('text-sm', state === 'current' ? 'font-medium text-foreground' : 'text-muted-foreground')} title={def.description}>
                {def.label}
              </span>
            </div>
            {i < STATUS_WORKFLOW.length - 1 && <span className={cn('mx-3 h-px w-6 sm:w-10', i < current ? 'bg-success' : 'bg-border')} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
};

export default StatusStepper;
