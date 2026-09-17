import React, { useEffect, useState } from 'react';
import { IdCard } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { CrewMember } from '@/modules/crew/hooks/useCrew';
import { usePersonnelDetails, type PersonnelType } from '@/modules/crew/hooks/usePersonnelDetails';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: CrewMember | null;
}

const PersonnelRecordDialog: React.FC<Props> = ({ open, onOpenChange, person }) => {
  const update = usePersonnelDetails();
  const [form, setForm] = useState({
    personnel_type: 'crew' as PersonnelType,
    job_title: '',
    office_location: '',
    place_of_birth: '',
    passport_country: '',
    passport_number: '',
    passport_expiry: '',
    seamans_book_number: '',
    embarkation_port: '',
  });

  useEffect(() => {
    if (!person) return;
    setForm({
      personnel_type: (person.personnel_type as PersonnelType) ?? 'crew',
      job_title: person.job_title ?? '',
      office_location: person.office_location ?? '',
      place_of_birth: person.place_of_birth ?? '',
      passport_country: person.passport_country ?? '',
      passport_number: person.passport_number ?? '',
      passport_expiry: person.passport_expiry ?? '',
      seamans_book_number: person.seamans_book_number ?? '',
      embarkation_port: person.embarkation_port ?? '',
    });
  }, [person]);

  if (!person) return null;

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const handleSave = () => {
    update.mutate(
      { profileId: person.id, ...form },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const isShoreside = form.personnel_type === 'shoreside';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IdCard className="h-5 w-5" /> Personnel record
          </DialogTitle>
          <DialogDescription>
            {person.first_name} {person.last_name} — classification and travel documents.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Personnel type</Label>
            <Select value={form.personnel_type} onValueChange={(value) => set('personnel_type')(value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="crew">Crew</SelectItem>
                <SelectItem value="contractor">Contractor / day worker</SelectItem>
                <SelectItem value="shoreside">Shoreside employee</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Job title</Label>
            <Input value={form.job_title} onChange={(event) => set('job_title')(event.target.value)} placeholder="e.g. Fleet Technical Manager" />
          </div>
          <div className="space-y-2">
            <Label>{isShoreside ? 'Office location' : 'Port of embarkation'}</Label>
            {isShoreside ? (
              <Input value={form.office_location} onChange={(event) => set('office_location')(event.target.value)} placeholder="e.g. Fort Lauderdale" />
            ) : (
              <Input value={form.embarkation_port} onChange={(event) => set('embarkation_port')(event.target.value)} placeholder="e.g. Palma de Mallorca" />
            )}
          </div>

          <div className="space-y-2">
            <Label>Place of birth</Label>
            <Input value={form.place_of_birth} onChange={(event) => set('place_of_birth')(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Passport issuing state</Label>
            <Input value={form.passport_country} onChange={(event) => set('passport_country')(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Passport number</Label>
            <Input value={form.passport_number} onChange={(event) => set('passport_number')(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Passport expiry</Label>
            <Input type="date" value={form.passport_expiry} onChange={(event) => set('passport_expiry')(event.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Seaman's book number</Label>
            <Input value={form.seamans_book_number} onChange={(event) => set('seamans_book_number')(event.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? 'Saving...' : 'Save record'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PersonnelRecordDialog;
