import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { humanise } from '@/modules/hris/lib/format';
import { deriveContractStatus, STATUS_BADGE_CLASS, type CrewContractRow } from '@/modules/hris/lib/contractHelpers';

interface ContractStatusBadgeProps {
  contract: Pick<CrewContractRow, 'status' | 'end_date'>;
  className?: string;
}

/** Status pill using the derived status (an overrun active contract shows as expired). */
export const ContractStatusBadge: React.FC<ContractStatusBadgeProps> = ({ contract, className }) => {
  const status = deriveContractStatus(contract);
  return (
    <Badge variant="outline" className={cn('font-medium', STATUS_BADGE_CLASS[status], className)}>
      {humanise(status)}
    </Badge>
  );
};

export default ContractStatusBadge;
