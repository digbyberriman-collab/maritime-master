import React from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { CrewMemberWithStatus } from '@/modules/crew/hooks/useCrewWithComputedStatus';

const initials = (m: CrewMemberWithStatus) =>
  `${(m.first_name || '?').charAt(0)}${(m.last_name || '').charAt(0)}`.toUpperCase();

export const AvatarNameCell: React.FC<{ member: CrewMemberWithStatus }> = ({ member }) => {
  const fullName = `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim() || member.email;
  const subtitle = member.preferred_name && member.preferred_name !== member.first_name
    ? `"${member.preferred_name}"`
    : member.email;
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="text-xs bg-muted">{initials(member)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="truncate font-medium leading-tight">{fullName}</div>
        <div className="truncate text-xs text-muted-foreground leading-tight">{subtitle}</div>
      </div>
    </div>
  );
};
