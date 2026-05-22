import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusCell } from '@/modules/crew/components/list/cells/StatusCell';
import { CertStatusCell } from '@/modules/crew/components/list/cells/CertStatusCell';
import { useCrewSelection } from '@/modules/crew/hooks/useCrewSelection';
import type { CrewMemberWithStatus } from '@/modules/crew/hooks/useCrewWithComputedStatus';

const initials = (m: CrewMemberWithStatus) =>
  `${(m.first_name || '?').charAt(0)}${(m.last_name || '').charAt(0)}`.toUpperCase();

interface CrewCardViewProps {
  members: CrewMemberWithStatus[];
  onSelectMember: (userId: string) => void;
}

export const CrewCardView: React.FC<CrewCardViewProps> = ({ members, onSelectMember }) => {
  const { rowSelection, setRowSelection } = useCrewSelection();

  if (members.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground border rounded-md">
        No matching crew.
      </div>
    );
  }

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
    >
      {members.map((m) => {
        const selected = !!rowSelection[m.id];
        return (
          <Card
            key={m.id}
            className={`relative transition-colors cursor-pointer hover:border-primary/40 ${selected ? 'ring-2 ring-primary' : ''}`}
            onClick={() => onSelectMember(m.user_id ?? m.id)}
          >
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Avatar className="h-12 w-12 shrink-0">
                  <AvatarFallback className="bg-muted">{initials(m)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">
                    {`${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{m.rank ?? '—'}</div>
                  <div className="text-xs text-muted-foreground truncate">{m.department ?? '—'}</div>
                </div>
                <Checkbox
                  checked={selected}
                  onCheckedChange={(v) => setRowSelection({ ...rowSelection, [m.id]: !!v })}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${m.first_name}`}
                />
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {m.current_assignment?.vessel_name ?? 'No vessel assigned'}
              </div>
              <div className="flex gap-2 flex-wrap">
                <StatusCell member={m} />
                <CertStatusCell member={m} />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
