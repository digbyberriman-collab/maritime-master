import React from 'react';
import { Mail, Printer, MoreHorizontal, X } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusCell } from '@/modules/crew/components/list/cells/StatusCell';
import type { CrewMemberWithStatus } from '@/modules/crew/hooks/useCrewWithComputedStatus';

interface CrewProfileHeaderProps {
  member: CrewMemberWithStatus;
  onClose: () => void;
}

const initials = (m: CrewMemberWithStatus) =>
  `${(m.first_name || '?').charAt(0)}${(m.last_name || '').charAt(0)}`.toUpperCase();

export const CrewProfileHeader: React.FC<CrewProfileHeaderProps> = ({ member, onClose }) => (
  <div className="flex items-start gap-4 pb-4 border-b">
    <Avatar className="h-14 w-14 shrink-0">
      <AvatarFallback className="bg-muted text-lg">{initials(member)}</AvatarFallback>
    </Avatar>
    <div className="flex-1 min-w-0">
      <div className="text-lg font-semibold truncate">
        {`${member.first_name ?? ''} ${member.last_name ?? ''}`.trim() || member.email}
      </div>
      <div className="text-sm text-muted-foreground truncate">
        {member.rank ?? '—'} · {member.current_assignment?.vessel_name ?? 'No vessel'}
      </div>
      <div className="flex gap-2 flex-wrap pt-1.5">
        <StatusCell member={member} />
        {member.department && <Badge variant="outline">{member.department}</Badge>}
      </div>
    </div>
    <div className="flex items-center gap-1">
      {member.email && (
        <Button variant="ghost" size="sm" asChild aria-label="Email">
          <a href={`mailto:${member.email}`}>
            <Mail className="h-4 w-4" />
          </a>
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => window.print()} aria-label="Print">
        <Printer className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" aria-label="More" disabled>
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
        <X className="h-4 w-4" />
      </Button>
    </div>
  </div>
);
