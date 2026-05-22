import React from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { StatusCell } from '@/modules/crew/components/list/cells/StatusCell';
import type { CrewMemberWithStatus } from '@/modules/crew/hooks/useCrewWithComputedStatus';

interface CrewMusterViewProps {
  members: CrewMemberWithStatus[];
  onSelectMember: (userId: string) => void;
}

const initials = (m: CrewMemberWithStatus) =>
  `${(m.first_name || '?').charAt(0)}${(m.last_name || '').charAt(0)}`.toUpperCase();

export const CrewMusterView: React.FC<CrewMusterViewProps> = ({ members, onSelectMember }) => {
  if (members.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground border rounded-md">
        No matching crew.
      </div>
    );
  }

  return (
    <div className="border rounded-md bg-card overflow-hidden print:border-0 print:rounded-none">
      <div className="hidden md:grid items-center gap-3 px-4 py-2 border-b text-xs font-medium uppercase tracking-wide text-muted-foreground"
           style={{ gridTemplateColumns: '64px 1fr 160px 140px 90px 200px' }}>
        <span aria-hidden />
        <span>Name</span>
        <span>Rank · Vessel</span>
        <span>Status</span>
        <span>Cabin</span>
        <span>Emergency Contact</span>
      </div>
      {members.map((m) => (
        <button
          type="button"
          key={m.id}
          className="grid w-full items-center gap-3 px-4 border-b last:border-b-0 text-left hover:bg-muted/30 print:border-b print:hover:bg-transparent"
          style={{
            gridTemplateColumns: '64px 1fr 160px 140px 90px 200px',
            minHeight: 72,
          }}
          onClick={() => onSelectMember(m.user_id ?? m.id)}
        >
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-muted text-lg">{initials(m)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="text-base font-semibold truncate">
              {`${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email}
            </div>
            {m.preferred_name && (
              <div className="text-xs text-muted-foreground truncate">"{m.preferred_name}"</div>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm truncate">{m.rank ?? '—'}</div>
            <div className="text-xs text-muted-foreground truncate">
              {m.current_assignment?.vessel_name ?? 'No vessel'}
            </div>
          </div>
          <StatusCell member={m} />
          <div className="text-sm font-mono">{m.cabin ?? '—'}</div>
          <div className="min-w-0">
            <div className="text-sm truncate">{m.emergency_contact_name ?? '—'}</div>
            <div className="text-xs text-muted-foreground truncate">{m.emergency_contact_phone ?? ''}</div>
          </div>
        </button>
      ))}
    </div>
  );
};
