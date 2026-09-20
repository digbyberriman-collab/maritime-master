import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PersonPicker } from '@/modules/health/components/PersonPicker';
import {
  TO_DISCIPLINES,
  URGENCIES,
  disciplineName,
  useReferrals,
  type ReferralEntry,
} from '@/modules/health/hooks/useReferrals';

interface RaiseReferralDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPersonId?: string | null;
  defaultToDiscipline?: string;
  defaultUrgency?: string;
  defaultReason?: string;
  /** The subject is fixed when the referral is raised from their record. */
  lockPerson?: boolean;
}

/**
 * Raise a referral out of physiotherapy. `from_discipline` is always `physio`
 * here, because this dialog only ever appears inside the physio module.
 */
export const RaiseReferralDialog: React.FC<RaiseReferralDialogProps> = ({
  open,
  onOpenChange,
  defaultPersonId,
  defaultToDiscipline = 'medical',
  defaultUrgency = 'routine',
  defaultReason = '',
  lockPerson,
}) => {
  const { save } = useReferrals({});
  const [personId, setPersonId] = useState<string | null>(defaultPersonId ?? null);
  const [toDiscipline, setToDiscipline] = useState(defaultToDiscipline);
  const [urgency, setUrgency] = useState(defaultUrgency);
  const [reason, setReason] = useState(defaultReason);

  useEffect(() => {
    if (!open) return;
    setPersonId(defaultPersonId ?? null);
    setToDiscipline(defaultToDiscipline);
    setUrgency(defaultUrgency);
    setReason(defaultReason);
  }, [open, defaultPersonId, defaultToDiscipline, defaultUrgency, defaultReason]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!personId || !reason.trim()) return;
    try {
      await save.mutateAsync({
        person_id: personId,
        from_discipline: 'physio',
        to_discipline: toDiscipline,
        urgency,
        reason: reason.trim(),
        status: 'open',
      });
      onOpenChange(false);
    } catch {
      // The hook raises the toast; leave the dialog open so it can be retried.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Refer on from physiotherapy</DialogTitle>
          <DialogDescription>
            The receiving discipline sees this in their incoming list and can accept, decline or
            complete it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Person</Label>
            <PersonPicker
              value={personId}
              onChange={(id) => setPersonId(id)}
              disabled={lockPerson}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="referral-to">Refer to</Label>
              <Select value={toDiscipline} onValueChange={setToDiscipline}>
                <SelectTrigger id="referral-to">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TO_DISCIPLINES.filter((d) => d.value !== 'physio').map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="referral-urgency">Urgency</Label>
              <Select value={urgency} onValueChange={setUrgency}>
                <SelectTrigger id="referral-urgency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {URGENCIES.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="referral-reason">Reason</Label>
            <Textarea
              id="referral-reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What you found and what you are asking for"
              required
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending || !personId || !reason.trim()}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send referral
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

interface RespondDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referral: ReferralEntry | null;
  onRespond: (input: {
    id: string;
    status: string;
    response_notes?: string | null;
    outcome?: string | null;
  }) => Promise<void>;
  isPending?: boolean;
}

const RESPONSES = [
  { value: 'accepted', label: 'Accept' },
  { value: 'declined', label: 'Decline' },
  { value: 'completed', label: 'Complete' },
] as const;

/** Accept, decline or complete an incoming referral with a written response. */
export const RespondToReferralDialog: React.FC<RespondDialogProps> = ({
  open,
  onOpenChange,
  referral,
  onRespond,
  isPending,
}) => {
  const [status, setStatus] = useState<string>('accepted');
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState('');

  useEffect(() => {
    if (!open) return;
    setStatus(referral?.status === 'accepted' ? 'completed' : 'accepted');
    setNotes(referral?.response_notes ?? '');
    setOutcome(referral?.outcome ?? '');
  }, [open, referral]);

  if (!referral) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onRespond({
      id: referral.id,
      status,
      response_notes: notes.trim() ? notes.trim() : null,
      outcome: outcome.trim() ? outcome.trim() : null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Respond to referral</DialogTitle>
          <DialogDescription>
            {referral.person_name ?? 'Unknown person'} · from {disciplineName(referral.from_discipline)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3 text-sm text-foreground">
            {referral.reason}
          </div>
          <div className="space-y-2 sm:max-w-[240px]">
            <Label htmlFor="respond-status">Response</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="respond-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESPONSES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="respond-notes">Response notes</Label>
            <Textarea
              id="respond-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="When you can see them, or why you are declining"
            />
          </div>
          {status === 'completed' && (
            <div className="space-y-2">
              <Label htmlFor="respond-outcome">Outcome</Label>
              <Input
                id="respond-outcome"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                placeholder="Discharged, six sessions completed"
              />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save response
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
