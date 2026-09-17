import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { humanise } from '@/modules/hris/lib/format';
import { asPayoutStatus, asPoolStatus, PAYOUT_STATUS_BADGE_CLASS, POOL_STATUS_BADGE_CLASS } from '@/modules/hris/lib/gratuities';

export const PoolStatusBadge: React.FC<{ status: string; className?: string }> = ({ status, className }) => (
  <Badge variant="outline" className={cn('font-medium', POOL_STATUS_BADGE_CLASS[asPoolStatus(status)], className)}>
    {humanise(status)}
  </Badge>
);

export const PayoutStatusBadge: React.FC<{ status: string; className?: string }> = ({ status, className }) => (
  <Badge variant="outline" className={cn('font-medium', PAYOUT_STATUS_BADGE_CLASS[asPayoutStatus(status)], className)}>
    {humanise(status)}
  </Badge>
);
