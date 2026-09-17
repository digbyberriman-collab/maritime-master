import React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { humanise } from '@/modules/hris/lib/format';
import {
  CANDIDATE_STATUS_CLASS,
  OUTCOME_CLASS,
  PRIORITY_CLASS,
  STAGE_TONE_CLASS,
  VACANCY_STATUS_CLASS,
  stageDef,
  type CandidateStatus,
  type InterviewOutcome,
  type VacancyPriority,
  type VacancyStatus,
} from '@/modules/hris/lib/recruitment';

interface BadgeProps {
  className?: string;
}

export const StageBadge: React.FC<BadgeProps & { stage: string }> = ({ stage, className }) => {
  const def = stageDef(stage);
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap font-medium', STAGE_TONE_CLASS[def.tone], className)}>
      {def.key === stage ? def.label : humanise(stage)}
    </Badge>
  );
};

export const VacancyStatusBadge: React.FC<BadgeProps & { status: string }> = ({ status, className }) => (
  <Badge variant="outline" className={cn('whitespace-nowrap font-medium', VACANCY_STATUS_CLASS[status as VacancyStatus] ?? STAGE_TONE_CLASS.neutral, className)}>
    {humanise(status)}
  </Badge>
);

export const PriorityBadge: React.FC<BadgeProps & { priority: string }> = ({ priority, className }) => (
  <Badge variant="outline" className={cn('whitespace-nowrap font-medium', PRIORITY_CLASS[priority as VacancyPriority] ?? STAGE_TONE_CLASS.neutral, className)}>
    {humanise(priority)}
  </Badge>
);

export const CandidateStatusBadge: React.FC<BadgeProps & { status: string }> = ({ status, className }) => (
  <Badge variant="outline" className={cn('whitespace-nowrap font-medium', CANDIDATE_STATUS_CLASS[status as CandidateStatus] ?? STAGE_TONE_CLASS.neutral, className)}>
    {humanise(status)}
  </Badge>
);

export const OutcomeBadge: React.FC<BadgeProps & { outcome: string | null }> = ({ outcome, className }) => {
  if (!outcome) return <span className="text-xs text-muted-foreground">No outcome</span>;
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap font-medium', OUTCOME_CLASS[outcome as InterviewOutcome] ?? STAGE_TONE_CLASS.neutral, className)}>
      {humanise(outcome)}
    </Badge>
  );
};

interface RatingStarsProps {
  value: number | null;
  onChange?: (value: number | null) => void;
  size?: 'sm' | 'md';
  className?: string;
}

/** 1–5 star display; clickable when `onChange` is given (click the same star again to clear). */
export const RatingStars: React.FC<RatingStarsProps> = ({ value, onChange, size = 'sm', className }) => {
  const dim = size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5';
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={value ? `${value} of 5` : 'Not rated'}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value !== null && n <= value;
        const star = <Star className={cn(dim, filled ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />;
        return onChange ? (
          <button
            key={n}
            type="button"
            className="rounded-sm p-0.5 hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onChange(value === n ? null : n)}
            aria-label={`Rate ${n}`}
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </span>
  );
};
