import React from 'react';
import { Button } from '@/components/ui/button';
import { Mail, Ship, Pencil, X } from 'lucide-react';
import { useCrewSelection } from '@/modules/crew/hooks/useCrewSelection';

interface CrewBulkActionsBarProps {
  onEmail: () => void;
  onReassign: () => void;
  onBulkEdit: () => void;
}

export const CrewBulkActionsBar: React.FC<CrewBulkActionsBarProps> = ({ onEmail, onReassign, onBulkEdit }) => {
  const rowSelection = useCrewSelection((s) => s.rowSelection);
  const clear = useCrewSelection((s) => s.clear);
  const count = Object.keys(rowSelection).length;
  if (count === 0) return null;

  return (
    <div
      className="sticky bottom-3 z-20 mx-auto w-fit max-w-full bg-card border shadow-lg rounded-full px-3 py-2 flex items-center gap-2"
      role="toolbar"
      aria-label="Bulk crew actions"
    >
      <span className="text-sm font-medium px-2">{count} selected</span>
      <div className="h-5 w-px bg-border" />
      <Button size="sm" variant="ghost" onClick={onEmail} className="gap-1.5">
        <Mail className="h-4 w-4" /> Email
      </Button>
      <Button size="sm" variant="ghost" onClick={onReassign} className="gap-1.5">
        <Ship className="h-4 w-4" /> Reassign
      </Button>
      <Button size="sm" variant="ghost" onClick={onBulkEdit} className="gap-1.5">
        <Pencil className="h-4 w-4" /> Bulk Edit
      </Button>
      <div className="h-5 w-px bg-border" />
      <Button size="sm" variant="ghost" onClick={clear} aria-label="Clear selection">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};
