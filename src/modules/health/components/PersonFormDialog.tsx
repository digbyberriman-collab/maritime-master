import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import {
  emptyPersonForm,
  PERSON_TYPES,
  useHealthPersonMutations,
  type HealthPersonEntry,
  type HealthPersonFormData,
} from '@/modules/health/hooks/useHealthPeople';

interface PersonFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing an existing subject; omit to create one. */
  person?: HealthPersonEntry | null;
  /** Default person type for a new subject. */
  defaultType?: string;
}

/**
 * Create or edit a non-crew health subject: a guest, the owner's party, a
 * visiting contractor. Crew rows are owned by `profiles` and kept in step by
 * a database trigger, so their identity fields are read-only here.
 */
export const PersonFormDialog: React.FC<PersonFormDialogProps> = ({
  open,
  onOpenChange,
  person,
  defaultType = 'guest',
}) => {
  const { vessels } = useVessel();
  const { createPerson, updatePerson, isMutating } = useHealthPersonMutations();
  const [form, setForm] = useState<HealthPersonFormData>(emptyPersonForm());
  const isCrew = Boolean(person?.profile_id);

  useEffect(() => {
    if (!open) return;
    if (person) {
      setForm({
        first_name: person.first_name,
        last_name: person.last_name,
        preferred_name: person.preferred_name,
        person_type: person.person_type,
        date_of_birth: person.date_of_birth,
        gender: person.gender,
        nationality: person.nationality,
        email: person.email,
        phone: person.phone,
        vessel_id: person.vessel_id,
        cabin: person.cabin,
        language: person.language,
        emergency_contact_name: person.emergency_contact_name,
        emergency_contact_phone: person.emergency_contact_phone,
        consent_share_safety_flags: person.consent_share_safety_flags,
        arrived_on: person.arrived_on,
        departed_on: person.departed_on,
        is_active: person.is_active,
        notes: person.notes,
      });
    } else {
      setForm({ ...emptyPersonForm(), person_type: defaultType });
    }
  }, [open, person, defaultType]);

  const set = <K extends keyof HealthPersonFormData>(key: K) => (value: HealthPersonFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    if (person) await updatePerson.mutateAsync({ id: person.id, values: form });
    else await createPerson.mutateAsync(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{person ? 'Edit person' : 'Add a person'}</DialogTitle>
          <DialogDescription>
            {isCrew
              ? 'This person is crew. Name and identity come from their crew profile and are changed there.'
              : 'Guests, the owner’s party and visiting contractors live here only. They never get a login.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="person-first">First name</Label>
            <Input
              id="person-first"
              value={form.first_name}
              disabled={isCrew}
              onChange={(e) => set('first_name')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-last">Last name</Label>
            <Input
              id="person-last"
              value={form.last_name}
              disabled={isCrew}
              onChange={(e) => set('last_name')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-preferred">Preferred name</Label>
            <Input
              id="person-preferred"
              value={form.preferred_name ?? ''}
              onChange={(e) => set('preferred_name')(e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-type">Type</Label>
            <Select value={form.person_type} onValueChange={set('person_type')} disabled={isCrew}>
              <SelectTrigger id="person-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERSON_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-dob">Date of birth</Label>
            <Input
              id="person-dob"
              type="date"
              value={form.date_of_birth ?? ''}
              disabled={isCrew}
              onChange={(e) => set('date_of_birth')(e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-nationality">Nationality</Label>
            <Input
              id="person-nationality"
              value={form.nationality ?? ''}
              disabled={isCrew}
              onChange={(e) => set('nationality')(e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-vessel">Vessel</Label>
            <Select
              value={form.vessel_id ?? 'none'}
              onValueChange={(v) => set('vessel_id')(v === 'none' ? null : v)}
            >
              <SelectTrigger id="person-vessel">
                <SelectValue placeholder="Not assigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not assigned</SelectItem>
                {vessels.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-cabin">Cabin</Label>
            <Input
              id="person-cabin"
              value={form.cabin ?? ''}
              onChange={(e) => set('cabin')(e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-email">Email</Label>
            <Input
              id="person-email"
              type="email"
              value={form.email ?? ''}
              onChange={(e) => set('email')(e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-phone">Phone</Label>
            <Input
              id="person-phone"
              value={form.phone ?? ''}
              onChange={(e) => set('phone')(e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-ice-name">Emergency contact</Label>
            <Input
              id="person-ice-name"
              value={form.emergency_contact_name ?? ''}
              onChange={(e) => set('emergency_contact_name')(e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-ice-phone">Emergency contact phone</Label>
            <Input
              id="person-ice-phone"
              value={form.emergency_contact_phone ?? ''}
              onChange={(e) => set('emergency_contact_phone')(e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-arrived">Arrived</Label>
            <Input
              id="person-arrived"
              type="date"
              value={form.arrived_on ?? ''}
              onChange={(e) => set('arrived_on')(e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-departed">Departed</Label>
            <Input
              id="person-departed"
              type="date"
              value={form.departed_on ?? ''}
              onChange={(e) => set('departed_on')(e.target.value || null)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="person-notes">Notes</Label>
          <Textarea
            id="person-notes"
            rows={2}
            value={form.notes ?? ''}
            onChange={(e) => set('notes')(e.target.value || null)}
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor="person-consent" className="text-sm">
              Share safety flags with wellness staff
            </Label>
            <p className="text-xs text-muted-foreground">
              Lets the galley, spa and gym see allergies and dietary needs. No clinical detail is
              shared either way.
            </p>
          </div>
          <Switch
            id="person-consent"
            checked={form.consent_share_safety_flags}
            onCheckedChange={set('consent_share_safety_flags')}
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <Label htmlFor="person-active" className="text-sm">
            Active
          </Label>
          <Switch id="person-active" checked={form.is_active} onCheckedChange={set('is_active')} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMutating}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={isMutating || !form.first_name.trim() || !form.last_name.trim()}
          >
            {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {person ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PersonFormDialog;
