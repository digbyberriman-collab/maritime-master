import React from 'react';
import { AlertTriangle, Flag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { badgeToneClass } from '@/modules/health/lib/format';
import {
  fitForDutyLabel,
  fitForDutyTone,
  painLabel,
  painTone,
  planStatusLabel,
  planStatusTone,
  sessionStatusLabel,
  sessionStatusTone,
} from '@/modules/health/hooks/usePhysio';

type Tone = 'good' | 'warning' | 'critical' | 'default';

interface ToneBadgeProps {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}

export const ToneBadge: React.FC<ToneBadgeProps> = ({ tone, children, className }) => (
  <Badge variant="outline" className={cn('text-[11px] font-medium', badgeToneClass[tone], className)}>
    {children}
  </Badge>
);

/** 0 to 10 numeric rating, coloured so a severe score cannot be skimmed past. */
export const PainBadge: React.FC<{ score: number | null | undefined; prefix?: string }> = ({
  score,
  prefix,
}) => {
  if (score === null || score === undefined) {
    return <span className="text-xs text-muted-foreground">{prefix ? `${prefix} not recorded` : 'Not recorded'}</span>;
  }
  return (
    <ToneBadge tone={painTone(score)}>
      {prefix ? `${prefix} ` : ''}
      {score}/10 · {painLabel(score)}
    </ToneBadge>
  );
};

export const FitForDutyBadge: React.FC<{ value: string | null | undefined }> = ({ value }) => {
  if (!value) return <span className="text-xs text-muted-foreground">Not stated</span>;
  return (
    <ToneBadge tone={fitForDutyTone(value)}>
      {value === 'unfit' && <AlertTriangle className="mr-1 h-3 w-3" />}
      {fitForDutyLabel(value)}
    </ToneBadge>
  );
};

export const PlanStatusBadge: React.FC<{ value: string | null | undefined }> = ({ value }) => (
  <ToneBadge tone={planStatusTone(value)}>{planStatusLabel(value)}</ToneBadge>
);

export const SessionStatusBadge: React.FC<{ value: string | null | undefined }> = ({ value }) => (
  <ToneBadge tone={sessionStatusTone(value)}>{sessionStatusLabel(value)}</ToneBadge>
);

export const RedFlagBadge: React.FC<{ className?: string }> = ({ className }) => (
  <ToneBadge tone="critical" className={className}>
    <Flag className="mr-1 h-3 w-3" />
    Red flag
  </ToneBadge>
);

/** Pain before and after one session, with the change spelled out. */
export const PainChange: React.FC<{ before: number | null; after: number | null }> = ({
  before,
  after,
}) => {
  if (before === null && after === null) {
    return <span className="text-xs text-muted-foreground">No pain scores</span>;
  }
  const delta = before !== null && after !== null ? after - before : null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <PainBadge score={before} prefix="Before" />
      <span className="text-xs text-muted-foreground">to</span>
      <PainBadge score={after} prefix="After" />
      {delta !== null && delta !== 0 && (
        <span
          className={cn(
            'text-xs font-medium',
            delta < 0 ? 'text-success' : 'text-destructive',
          )}
        >
          {delta < 0 ? `${Math.abs(delta)} better` : `${delta} worse`}
        </span>
      )}
    </div>
  );
};
