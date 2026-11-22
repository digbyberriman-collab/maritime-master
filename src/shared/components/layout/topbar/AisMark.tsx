/**
 * A vessel's AIS state as a small mark (D-22: navigation state by shape, one
 * Signal colour; spec §6.1). Under way: a Signal arrow along the course.
 * Moored: a filled dot. At anchor: a ringed dot. A fresh fix with an unknown
 * status: a faint dot. No fix, or one older than six hours: a hollow ring.
 * While positions load or after an error there is no mark at all: unknown is
 * not "no position". Every mark carries its meaning as text (sr-only, and a
 * tooltip where asked), so it never depends on shape or colour alone.
 */
import React from 'react';
import { Navigation2 } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { aisMarkState, type AisMarkInput } from './aisMarkState';

export interface AisMarkProps extends AisMarkInput {
  /** Show the meaning in a hover tooltip as well as to screen readers. */
  tooltip?: boolean;
  className?: string;
}

const AisMark: React.FC<AisMarkProps> = ({ tooltip = true, className, ...input }) => {
  const mark = aisMarkState(input);
  if (!mark) return null;
  const age = mark.fixAt ? `, fix ${formatDistanceToNowStrict(new Date(mark.fixAt), { addSuffix: true })}` : '';
  const label = `${mark.label}${age}`;

  const glyph =
    mark.kind === 'under_way' ? (
      <Navigation2
        className="h-3 w-3 fill-current text-primary"
        strokeWidth={1.75}
        style={mark.course !== null ? { transform: `rotate(${mark.course}deg)` } : undefined}
        aria-hidden="true"
      />
    ) : (
      <span
        aria-hidden="true"
        className={cn(
          'block size-2 rounded-full',
          mark.kind === 'moored' && 'bg-muted-foreground',
          mark.kind === 'at_anchor' && 'bg-muted-foreground ring-1 ring-muted-foreground ring-offset-1 ring-offset-background',
          mark.kind === 'unknown' && 'bg-muted-foreground/60',
          mark.kind === 'stale' && 'border border-muted-foreground',
        )}
      />
    );

  const body = (
    <span data-ais={mark.kind} className={cn('inline-flex h-3 w-3 shrink-0 items-center justify-center', className)}>
      {glyph}
      <span className="sr-only">{label}</span>
    </span>
  );
  if (!tooltip) return body;
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{body}</TooltipTrigger>
        <TooltipContent side="bottom" className="type-caption">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default AisMark;
