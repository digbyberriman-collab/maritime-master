import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { humanise } from '@/modules/hris/lib/format';
import {
  LIFECYCLE_LABEL,
  SEVERITY_LABEL,
  STAGE_LABEL,
  TONE_CLASS,
  appealTone,
  isSeverity,
  isStage,
  lifecycleState,
  lifecycleTone,
  severityTone,
  stageTone,
  type DisciplinaryRecordRow,
} from '@/modules/hris/lib/disciplinary';

const base = 'whitespace-nowrap text-[10px] uppercase tracking-wide';

export const SeverityBadge: React.FC<{ severity: string | null | undefined; className?: string }> = ({ severity, className }) => (
  <Badge variant="outline" className={cn(base, TONE_CLASS[severityTone(severity)], className)}>
    {isSeverity(severity) ? SEVERITY_LABEL[severity] : humanise(severity)}
  </Badge>
);

export const StageBadge: React.FC<{ stage: string | null | undefined; className?: string }> = ({ stage, className }) => (
  <Badge variant="outline" className={cn(base, TONE_CLASS[stageTone(stage)], className)}>
    {isStage(stage) ? STAGE_LABEL[stage] : humanise(stage)}
  </Badge>
);

export const LifecycleBadge: React.FC<{ record: Pick<DisciplinaryRecordRow, 'stage' | 'status' | 'expiry_date' | 'appeal_status'>; className?: string }> = ({
  record,
  className,
}) => {
  const state = lifecycleState(record);
  return (
    <Badge variant="outline" className={cn(base, TONE_CLASS[lifecycleTone(state)], className)}>
      {LIFECYCLE_LABEL[state]}
    </Badge>
  );
};

export const AppealBadge: React.FC<{ appeal: string | null | undefined; className?: string }> = ({ appeal, className }) => {
  if (!appeal || appeal === 'none') return null;
  return (
    <Badge variant="outline" className={cn(base, TONE_CLASS[appealTone(appeal)], className)}>
      Appeal {humanise(appeal).toLowerCase()}
    </Badge>
  );
};
