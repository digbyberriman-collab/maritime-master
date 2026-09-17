import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { TONE_CLASS, statusLabel, statusTone, type CrewObjectiveRow } from '@/modules/hris/lib/objectives';

interface ObjectiveStatusBadgeProps {
  objective: Pick<CrewObjectiveRow, 'status' | 'target_date'>;
  className?: string;
}

/** Status pill that surfaces "Overdue" for open objectives past their target date. */
export const ObjectiveStatusBadge: React.FC<ObjectiveStatusBadgeProps> = ({ objective, className }) => (
  <Badge variant="outline" className={cn('whitespace-nowrap text-[10px] uppercase tracking-wide', TONE_CLASS[statusTone(objective)], className)}>
    {statusLabel(objective)}
  </Badge>
);

export default ObjectiveStatusBadge;
