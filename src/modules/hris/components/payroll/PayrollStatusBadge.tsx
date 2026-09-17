import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { humanise } from '@/modules/hris/lib/format';
import { LINE_STATUS_BADGE_CLASS, RUN_STATUS_BADGE_CLASS, asLineStatus, asRunStatus } from '@/modules/hris/lib/payroll/runHelpers';

export const RunStatusBadge: React.FC<{ status: string; className?: string }> = ({ status, className }) => {
  const s = asRunStatus(status);
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap font-medium', RUN_STATUS_BADGE_CLASS[s], className)}>
      {humanise(s)}
    </Badge>
  );
};

export const LineStatusBadge: React.FC<{ status: string; className?: string }> = ({ status, className }) => {
  const s = asLineStatus(status);
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap font-medium', LINE_STATUS_BADGE_CLASS[s], className)}>
      {humanise(s)}
    </Badge>
  );
};
