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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PERSON_TYPES,
  emptyPersonForm,
  type HealthPersonFormData,
} from '@/modules/health/hooks/useHealthPeople';

const NO_VESSEL = '__none__';

/** Guests and the owner's party never get a login, so only these types fit. */
const GUEST_TYPES = PERSON_TYPES.filter((t) =>
  ['guest', 'owner', 'family', 'visitor', 'contractor', 'other'].includes(t.value),
);

interface AddGuestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vessels: { id: string; name: string }[];
  onSubmit: (values: HealthPersonFormData) => Promise<void>;
  isPending?: boolean;
}

/** Add a non-crew client so the spa can book them in. */
export const AddGuestDialog: React.FC<AddGuestDialogProps> = ({
  open,
  onOpenChange,
  vessels,
  onSubmit,
  isPending,
}) => {
  const [values, setValues] = useState<HealthPersonFormData>(emptyPersonForm());

  useEffect(() => {
    if (open) setValues(emptyPersonForm());
  }, [open]);

  const patch = (next: Partial<HealthPersonFormData>) => setValues((prev) => ({ ...prev, ...next }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a client</DialogTitle>
          <DialogDescription>
            For guests and the owner&apos;s party. Crew appear here automatically from their profile.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="guest-first">First name</Label>
              <Input
                id="guest-first"
                required
                value={values.first_name}
                onChange={(e) => patch({ first_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-last">Last name</Label>
              <Input
                id="guest-last"
                required
                value={values.last_name}
                onChange={(e) => patch({ last_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-preferred">Preferred name</Label>
              <Input
                id="guest-preferred"
                value={values.preferred_name ?? ''}
                onChange={(e) => patch({ preferred_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={values.person_type} onValueChange={(v) => patch({ person_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GUEST_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Vessel</Label>
              <Select
                value={values.vessel_id ?? NO_VESSEL}
                onValueChange={(v) => patch({ vessel_id: v === NO_VESSEL ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Not aboard yet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_VESSEL}>Not aboard yet</SelectItem>
                  {vessels.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-cabin">Cabin</Label>
              <Input
                id="guest-cabin"
                value={values.cabin ?? ''}
                onChange={(e) => patch({ cabin: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-arrived">Aboard from</Label>
              <Input
                id="guest-arrived"
                type="date"
                value={values.arrived_on ?? ''}
                onChange={(e) => patch({ arrived_on: e.target.value || null })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-departed">Aboard until</Label>
              <Input
                id="guest-departed"
                type="date"
                value={values.departed_on ?? ''}
                onChange={(e) => patch({ departed_on: e.target.value || null })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="guest-notes">Notes</Label>
              <Textarea
                id="guest-notes"
                rows={2}
                value={values.notes ?? ''}
                onChange={(e) => patch({ notes: e.target.value })}
                placeholder="Preferences the spa team should know about"
              />
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
            <div className="space-y-0.5">
              <Label htmlFor="guest-consent">Share safety flags with wellness staff</Label>
              <p className="text-xs text-muted-foreground">
                Lets the spa and galley see allergies and dietary needs. Clinical detail is never
                shared on this flag.
              </p>
            </div>
            <Switch
              id="guest-consent"
              checked={values.consent_share_safety_flags}
              onCheckedChange={(checked) => patch({ consent_share_safety_flags: checked })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || !values.first_name.trim() || !values.last_name.trim()}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add client
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddGuestDialog;
