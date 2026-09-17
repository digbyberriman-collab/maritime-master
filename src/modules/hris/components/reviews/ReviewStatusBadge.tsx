import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { STATUS_TONE_CLASS, statusLabel, statusTone } from '@/modules/hris/lib/reviews';

interface ReviewStatusBadgeProps {
  status: string | null | undefined;
  className?: string;
}

export const ReviewStatusBadge: React.FC<ReviewStatusBadgeProps> = ({ status, className }) => (
  <Badge variant="outline" className={cn('whitespace-nowrap font-medium', STATUS_TONE_CLASS[statusTone(status)], className)}>
    {statusLabel(status)}
  </Badge>
);

export default ReviewStatusBadge;
