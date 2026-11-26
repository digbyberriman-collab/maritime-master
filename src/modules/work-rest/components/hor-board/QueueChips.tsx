/**
 * The board's queue chips (gap/04 C40): All, Ready for you, Waiting on
 * crew, Approved and On leave, each with its count (lib/horBoard.ts
 * queueCounts; a month in review with someone else counts under All
 * only). A chip is a toggle button (aria-pressed) that sets `?queue=`;
 * pressing the active one again goes back to All. 44 px on coarse
 * pointers.
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { BOARD_QUEUES, QUEUE_LABEL, type BoardQueue, type QueueCounts } from '../../lib/horBoard';

export interface QueueChipsProps {
  counts: QueueCounts;
  /** The selected queue; null for All. */
  value: BoardQueue | null;
  onChange: (queue: BoardQueue | null) => void;
  className?: string;
  /** Anything that sits at the end of the row (Remind all waiting). */
  children?: React.ReactNode;
}

const chipClass = (active: boolean) =>
  cn(
    'focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 type-body-sm font-medium transition-colors duration-quick ease-tide [@media(pointer:coarse)]:h-11',
    active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-accent',
  );

export const QueueChips: React.FC<QueueChipsProps> = ({ counts, value, onChange, className, children }) => (
  <div className={cn('flex flex-wrap items-center gap-2', className)} data-queue-chips="">
    <div role="group" aria-label="Months by whose move" className="flex flex-wrap items-center gap-2">
      <button type="button" aria-pressed={value === null} className={chipClass(value === null)} onClick={() => onChange(null)} data-queue="all">
        All
        <span className="tabular-nums opacity-80">{counts.all}</span>
      </button>
      {BOARD_QUEUES.map((q) => {
        const active = value === q;
        return (
          <button key={q} type="button" aria-pressed={active} className={chipClass(active)} onClick={() => onChange(active ? null : q)} data-queue={q}>
            {QUEUE_LABEL[q]}
            <span className="tabular-nums opacity-80">{counts[q]}</span>
          </button>
        );
      })}
    </div>
    {children}
  </div>
);

export default QueueChips;
