import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusCell } from '@/modules/crew/components/list/cells/StatusCell';
import { useCrewSelection } from '@/modules/crew/hooks/useCrewSelection';
import type { CrewMemberWithStatus } from '@/modules/crew/hooks/useCrewWithComputedStatus';

interface CrewCompactViewProps {
  members: CrewMemberWithStatus[];
  onSelectMember: (userId: string) => void;
}

export const CrewCompactView: React.FC<CrewCompactViewProps> = ({ members, onSelectMember }) => {
  const { rowSelection, setRowSelection } = useCrewSelection();

  if (members.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground border rounded-md">
        No matching crew.
      </div>
    );
  }

  return (
    <div className="border rounded-md bg-card overflow-hidden">
      {members.map((m) => {
        const selected = !!rowSelection[m.id];
        return (
          <div
            key={m.id}
            role="row"
            className={`flex items-center gap-3 px-3 py-2 border-b last:border-b-0 text-sm cursor-pointer hover:bg-muted/40 ${selected ? 'bg-accent/40' : ''}`}
            style={{ height: 36 }}
            onClick={() => onSelectMember(m.user_id ?? m.id)}
          >
            <Checkbox
              checked={selected}
              onCheckedChange={(v) => setRowSelection({ ...rowSelection, [m.id]: !!v })}
              onClick={(e) => e.stopPropagation()}
              aria-label="Select"
            />
            <span className="flex-1 min-w-0 truncate font-medium">
              {`${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email}
            </span>
            <span className="hidden sm:inline text-muted-foreground text-xs truncate w-32">
              {m.rank ?? '—'}
            </span>
            <span className="hidden md:inline text-muted-foreground text-xs truncate w-40">
              {m.current_assignment?.vessel_name ?? '—'}
            </span>
            <StatusCell member={m} />
          </div>
        );
      })}
    </div>
  );
};
