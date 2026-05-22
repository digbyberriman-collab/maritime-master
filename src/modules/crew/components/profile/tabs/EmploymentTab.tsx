import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, Check, X } from 'lucide-react';
import { useCrew, type CrewMember } from '@/modules/crew/hooks/useCrew';

interface EmploymentTabProps {
  member: CrewMember;
  canEdit: boolean;
}

type EditableField = 'rank' | 'department' | 'rotation' | 'cabin' | 'contract_start_date' | 'contract_end_date';

const FIELD_TO_PATCH_KEY: Record<EditableField, string> = {
  rank: 'rank',
  department: 'department',
  rotation: 'rotation',
  cabin: 'cabin',
  contract_start_date: 'contractStartDate',
  contract_end_date: 'contractEndDate',
};

export const EmploymentTab: React.FC<EmploymentTabProps> = ({ member, canEdit }) => {
  const { updateCrewMember } = useCrew();
  const [editing, setEditing] = useState<EditableField | null>(null);
  const [draft, setDraft] = useState('');

  const begin = (field: EditableField) => {
    setEditing(field);
    setDraft(String(member[field] ?? ''));
  };

  const save = async () => {
    if (!editing || !member.user_id) return;
    await updateCrewMember.mutateAsync({
      userId: member.user_id,
      [FIELD_TO_PATCH_KEY[editing]]: draft,
    } as Parameters<typeof updateCrewMember.mutateAsync>[0]);
    setEditing(null);
  };

  const renderField = (label: string, field: EditableField, type: 'text' | 'date' = 'text') => (
    <div className="grid grid-cols-3 gap-2 items-center py-1">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="col-span-2 flex items-center gap-2">
        {editing === field ? (
          <>
            <Input type={type} value={draft} onChange={(e) => setDraft(e.target.value)} className="h-8" autoFocus />
            <Button size="sm" variant="ghost" onClick={save} aria-label="Save"><Check className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)} aria-label="Cancel"><X className="h-4 w-4" /></Button>
          </>
        ) : (
          <>
            <span className="text-sm flex-1 truncate">{(member[field] as string | null) ?? '—'}</span>
            {canEdit && (
              <Button size="sm" variant="ghost" onClick={() => begin(field)} aria-label={`Edit ${label}`}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Position</CardTitle></CardHeader>
        <CardContent className="pt-0">
          {renderField('Rank', 'rank')}
          {renderField('Department', 'department')}
          {renderField('Cabin', 'cabin')}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Contract</CardTitle></CardHeader>
        <CardContent className="pt-0">
          {renderField('Start date', 'contract_start_date', 'date')}
          {renderField('End date', 'contract_end_date', 'date')}
          {renderField('Rotation', 'rotation')}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Vessel Assignment</CardTitle></CardHeader>
        <CardContent className="pt-0 text-sm space-y-1">
          {member.current_assignment ? (
            <>
              <div><span className="text-muted-foreground">Vessel:</span> {member.current_assignment.vessel_name}</div>
              <div><span className="text-muted-foreground">Position:</span> {member.current_assignment.position}</div>
              <div><span className="text-muted-foreground">Joined:</span> {member.current_assignment.join_date}</div>
            </>
          ) : (
            <span className="text-muted-foreground">No current vessel assignment.</span>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
