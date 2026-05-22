import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, Check, X } from 'lucide-react';
import { useCrew, type CrewMember } from '@/modules/crew/hooks/useCrew';

interface OverviewTabProps {
  member: CrewMember;
  canEdit: boolean;
}

type EditableField =
  | 'preferred_name'
  | 'phone'
  | 'emergency_contact_name'
  | 'emergency_contact_phone'
  | 'date_of_birth'
  | 'nationality'
  | 'gender';

const FIELD_TO_PATCH_KEY: Record<EditableField, string> = {
  preferred_name: 'preferredName',
  phone: 'phone',
  emergency_contact_name: 'emergencyContactName',
  emergency_contact_phone: 'emergencyContactPhone',
  date_of_birth: 'dateOfBirth',
  nationality: 'nationality',
  gender: 'gender',
};

export const OverviewTab: React.FC<OverviewTabProps> = ({ member, canEdit }) => {
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
            <Input
              type={type}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-8"
              autoFocus
            />
            <Button size="sm" variant="ghost" onClick={save} aria-label="Save">
              <Check className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)} aria-label="Cancel">
              <X className="h-4 w-4" />
            </Button>
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
        <CardHeader className="pb-2"><CardTitle className="text-sm">Personal</CardTitle></CardHeader>
        <CardContent className="pt-0">
          {renderField('Preferred name', 'preferred_name')}
          {renderField('Date of birth', 'date_of_birth', 'date')}
          {renderField('Nationality', 'nationality')}
          {renderField('Gender', 'gender')}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Contact</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-3 gap-2 items-center py-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Email</Label>
            <div className="col-span-2 text-sm truncate">{member.email}</div>
          </div>
          {renderField('Phone', 'phone')}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Emergency Contact</CardTitle></CardHeader>
        <CardContent className="pt-0">
          {renderField('Name', 'emergency_contact_name')}
          {renderField('Phone', 'emergency_contact_phone')}
        </CardContent>
      </Card>
    </div>
  );
};
