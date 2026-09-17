import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { humanise } from '@/modules/hris/lib/format';
import { asCompensationStatus, STATUS_BADGE_CLASS } from '@/modules/hris/lib/compensation';

interface CompensationStatusBadgeProps {
  status: string;
  className?: string;
}

export const CompensationStatusBadge: React.FC<CompensationStatusBadgeProps> = ({ status, className }) => {
  const s = asCompensationStatus(status);
  return (
    <Badge variant="outline" className={cn('font-medium', STATUS_BADGE_CLASS[s], className)}>
      {humanise(s)}
    </Badge>
  );
};

export default CompensationStatusBadge;
