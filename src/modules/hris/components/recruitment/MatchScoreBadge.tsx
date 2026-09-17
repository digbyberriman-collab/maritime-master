import React, { useMemo } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MATCH_TONE_CLASS, candidateMatchScore, matchTone, type CandidateRow, type VacancyRow } from '@/modules/hris/lib/recruitment';

interface MatchScoreBadgeProps {
  candidate: Pick<CandidateRow, 'rank' | 'department' | 'certificates' | 'available_from'>;
  vacancy: Pick<VacancyRow, 'rank' | 'department' | 'required_certificates' | 'start_date'>;
  className?: string;
  /** Show the reasons inline instead of in a tooltip. */
  expanded?: boolean;
}

/** Candidate ↔ vacancy fit as a percentage, with the reasons on hover. */
export const MatchScoreBadge: React.FC<MatchScoreBadgeProps> = ({ candidate, vacancy, className, expanded }) => {
  const result = useMemo(() => candidateMatchScore(candidate, vacancy), [candidate, vacancy]);
  const tone = matchTone(result.score);
  const label = result.score === null ? 'No criteria' : `${result.score}% match`;

  const reasons = (
    <ul className="space-y-1 text-xs">
      {result.reasons.length === 0 && <li className="text-muted-foreground">The vacancy has no rank, department, certificates or start date to match against.</li>}
      {result.reasons.map((r) => (
        <li key={r.key} className="flex items-start gap-1.5">
          {r.met ? <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" /> : <X className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />}
          <span>{r.label}</span>
        </li>
      ))}
    </ul>
  );

  const badge = (
    <Badge variant="outline" className={cn('cursor-default whitespace-nowrap font-medium tabular-nums', MATCH_TONE_CLASS[tone], className)}>
      {label}
    </Badge>
  );

  if (expanded) {
    return (
      <div className="space-y-2">
        {badge}
        {reasons}
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{badge}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="max-w-xs">
          {reasons}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default MatchScoreBadge;
