import React from 'react';
import { differenceInDays, format } from 'date-fns';
import type { CrewMemberWithStatus } from '@/modules/crew/hooks/useCrewWithComputedStatus';

export const ContractEndCell: React.FC<{ member: CrewMemberWithStatus }> = ({ member }) => {
  if (!member.contract_end_date) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const date = new Date(member.contract_end_date);
  if (Number.isNaN(date.getTime())) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const days = differenceInDays(date, new Date());
  const colour = days < 0
    ? 'text-destructive'
    : days <= 30
    ? 'text-warning-foreground'
    : days <= 90
    ? 'text-foreground'
    : 'text-muted-foreground';
  return (
    <div className={`flex flex-col leading-tight ${colour}`}>
      <span className="text-sm">{format(date, 'yyyy-MM-dd')}</span>
      <span className="text-xs opacity-70">
        {days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? 'today' : `in ${days}d`}
      </span>
    </div>
  );
};
