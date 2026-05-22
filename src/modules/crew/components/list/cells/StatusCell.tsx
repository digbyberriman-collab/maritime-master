import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Ship, Plane, UserMinus, Pause } from 'lucide-react';
import type { CrewMemberWithStatus } from '@/modules/crew/hooks/useCrewWithComputedStatus';

export const StatusCell: React.FC<{ member: CrewMemberWithStatus }> = ({ member }) => {
  if (!member.hasAssignment) {
    return (
      <Badge variant="outline" className="gap-1">
        <UserMinus className="h-3 w-3" /> Unassigned
      </Badge>
    );
  }
  if (member.isOnLeave) {
    return (
      <Badge variant="outline" className="gap-1 border-warning/40 text-warning-foreground bg-warning/10">
        <Plane className="h-3 w-3" /> On Leave
      </Badge>
    );
  }
  const isSuspended = (member.account_status ?? '').toLowerCase() === 'disabled';
  if (isSuspended) {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive bg-destructive/10">
        <Pause className="h-3 w-3" /> Suspended
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-success/40 text-success bg-success/10">
      <Ship className="h-3 w-3" /> Onboard
    </Badge>
  );
};
