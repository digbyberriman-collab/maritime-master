import React from 'react';
import { Ship } from 'lucide-react';
import type { CrewMemberWithStatus } from '@/modules/crew/hooks/useCrewWithComputedStatus';

export const VesselCell: React.FC<{ member: CrewMemberWithStatus }> = ({ member }) => {
  if (!member.current_assignment) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Ship className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="truncate">{member.current_assignment.vessel_name}</span>
    </div>
  );
};
