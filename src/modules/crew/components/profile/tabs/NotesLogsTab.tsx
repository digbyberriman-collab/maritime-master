import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { CrewAuditLog } from '@/modules/crew/components/CrewAuditLog';
import { useCrew, type CrewMember } from '@/modules/crew/hooks/useCrew';

interface NotesLogsTabProps {
  member: CrewMember;
  canEdit: boolean;
}

export const NotesLogsTab: React.FC<NotesLogsTabProps> = ({ member, canEdit }) => {
  const { updateCrewMember } = useCrew();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(member.notes ?? '');

  const save = async () => {
    if (!member.user_id) return;
    await updateCrewMember.mutateAsync({ userId: member.user_id, notes: draft });
    setEditing(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Notes</CardTitle>
          {canEdit && !editing && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          {editing ? (
            <div className="space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="min-h-[120px]"
                placeholder="Add notes…"
              />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => { setDraft(member.notes ?? ''); setEditing(false); }}>Cancel</Button>
                <Button size="sm" onClick={save} disabled={updateCrewMember.isPending}>Save</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">
              {member.notes ? member.notes : 'No notes.'}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Activity log</CardTitle></CardHeader>
        <CardContent className="pt-0">
          {member.user_id ? (
            <CrewAuditLog crewId={member.user_id} />
          ) : (
            <p className="text-sm text-muted-foreground">No activity available for imported crew without an account.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
