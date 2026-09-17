import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { humanise } from '@/modules/hris/lib/format';
import { REVIEW_STATUS_BADGE_CLASS, asReviewStatus } from '@/modules/hris/lib/payReviewHelpers';

export const ReviewStatusBadge: React.FC<{ status: string; className?: string }> = ({ status, className }) => {
  const s = asReviewStatus(status);
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap font-medium', REVIEW_STATUS_BADGE_CLASS[s], className)}>
      {humanise(s)}
    </Badge>
  );
};

export default ReviewStatusBadge;
