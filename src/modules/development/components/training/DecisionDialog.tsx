/**
 * The confirmation for a final step on a training application (gap/02 W3,
 * TR6; X5-07B): Reject (final, the applicant is told why) and Void
 * (entered in error; it leaves every register and total). Each needs a
 * reason, says what the step does before it is taken, and stays open when
 * the server refuses (the refusal is shown in words by the transition
 * hook). Reject is never a Return: a return goes back to the applicant to
 * change and resubmit.
 */
import React, { useEffect, useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { COARSE } from './TrainingParts';

export type DecisionKind = 'reject' | 'void';

const COPY: Readonly<Record<DecisionKind, { title: string; body: string; label: string; confirm: string }>> = {
  reject: {
    title: 'Reject this application',
    body: 'Rejecting ends the application: it cannot be resubmitted, and the applicant is told your reason. To ask for changes instead, return it for changes.',
    label: 'Why it is rejected',
    confirm: 'Reject application',
  },
  void: {
    title: 'Void this application',
    body: 'Voiding is for an application entered in error. It leaves every register and total, nothing more can change on it, and its history is kept.',
    label: 'Why it is voided',
    confirm: 'Void application',
  },
};

export interface DecisionDialogProps {
  kind: DecisionKind | null;
  courseName: string;
  /** Sends the step; resolves when the server confirmed it, rejects when it was refused. */
  onConfirm: (kind: DecisionKind, reason: string) => Promise<void>;
  onClose: () => void;
  pending?: boolean;
}

export function DecisionDialog({ kind, courseName, onConfirm, onClose, pending = false }: DecisionDialogProps) {
  const [reason, setReason] = useState('');
  const id = useId();
  useEffect(() => {
    if (kind) setReason('');
  }, [kind]);
  if (!kind) return null;
  const copy = COPY[kind];
  const trimmed = reason.trim();
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-w-lg" aria-describedby={`${id}-body`}>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription id={`${id}-body`}>
            <span className="block font-medium text-foreground">{courseName}</span>
            {copy.body}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!trimmed || pending) return;
            void onConfirm(kind, trimmed).then(onClose, () => undefined);
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={`${id}-reason`}>{copy.label}</Label>
            <Textarea id={`${id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={2000} required autoFocus />
            <p className="type-caption text-muted-foreground">A reason is needed. Up to 2,000 characters.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className={COARSE} onClick={onClose} disabled={pending}>
              Keep it
            </Button>
            <Button type="submit" variant="destructive" className={COARSE} disabled={!trimmed || pending}>
              {pending ? <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" /> : null}
              {copy.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
