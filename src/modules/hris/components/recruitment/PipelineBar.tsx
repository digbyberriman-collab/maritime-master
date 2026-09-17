import React from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ACTIVE_STAGES, STAGE_BAR_CLASS, activeApplicationCount, stageDef, type StageCounts } from '@/modules/hris/lib/recruitment';

interface PipelineBarProps {
  counts: StageCounts;
  className?: string;
}

/** Mini stacked bar of active applications per stage, with hired shown after. */
export const PipelineBar: React.FC<PipelineBarProps> = ({ counts, className }) => {
  const active = activeApplicationCount(counts);
  const total = active + counts.hired;
  if (total === 0) {
    return <span className="text-xs text-muted-foreground">No applicants</span>;
  }
  const segments = [...ACTIVE_STAGES, 'hired' as const].filter((s) => counts[s] > 0);
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('flex items-center gap-2', className)}>
            <div className="flex h-2 w-28 overflow-hidden rounded-full bg-muted">
              {segments.map((s) => (
                <div key={s} className={cn('h-full', STAGE_BAR_CLASS[s])} style={{ width: `${(counts[s] / total) * 100}%` }} />
              ))}
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {active} active{counts.hired ? ` · ${counts.hired} hired` : ''}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start">
          <ul className="space-y-0.5 text-xs">
            {segments.map((s) => (
              <li key={s} className="flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full', STAGE_BAR_CLASS[s])} />
                {stageDef(s).label}: {counts[s]}
              </li>
            ))}
            {(counts.rejected > 0 || counts.withdrawn > 0) && (
              <li className="pt-1 text-muted-foreground">
                {counts.rejected} rejected · {counts.withdrawn} withdrawn
              </li>
            )}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default PipelineBar;
