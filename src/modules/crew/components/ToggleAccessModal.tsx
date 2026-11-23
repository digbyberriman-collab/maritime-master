import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { UserCheck, UserX, Loader2, AlertTriangle } from 'lucide-react';
import { useAdminActions } from '@/modules/auth/hooks/useAdminActions';
import { accessNotice, type OutcomeNotice } from '@/modules/auth/services/adminActions';
import { notify } from '@/shared/lib/notify';
import type { CrewMember } from '@/modules/crew/hooks/useCrew';

interface ToggleAccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crewMember: CrewMember | null;
}

const REASON_ID = 'toggle-access-reason';
const REASON_ERROR_ID = 'toggle-access-reason-error';

/**
 * Turn a crew member's access off or on (behind the admin PIN). Turning it
 * off needs a reason. The result is the server's (spec §C.3): "turned off"
 * only when both the STORM status and the sign-in block worked; a partial
 * result names the part that failed and offers Try again.
 */
const ToggleAccessModal: React.FC<ToggleAccessModalProps> = ({ open, onOpenChange, crewMember }) => {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [problem, setProblem] = useState<OutcomeNotice | null>(null);
  const { toggleAccess } = useAdminActions();

  useEffect(() => {
    if (!open) {
      setReason('');
      setReasonError(null);
      setProblem(null);
    }
  }, [open]);

  const status = (crewMember?.account_status ?? '').toLowerCase();
  const willEnable = status === 'disabled' || status === 'deactivated';
  const name = crewMember ? `${crewMember.first_name} ${crewMember.last_name}`.trim() : '';

  const handleSubmit = async () => {
    if (!crewMember?.user_id) return;
    setProblem(null);
    if (!willEnable && !reason.trim()) {
      setReasonError('Give a reason for turning access off.');
      document.getElementById(REASON_ID)?.focus();
      return;
    }
    let notice: OutcomeNotice;
    try {
      const outcome = await toggleAccess.mutateAsync({ targetUserId: crewMember.user_id, enableAccess: willEnable, reason: reason.trim() || undefined });
      notice = accessNotice(outcome, name);
    } catch (error) {
      notice = { tone: 'error', title: 'Could not change access', description: error instanceof Error ? error.message : undefined, retry: true };
    }
    if (notice.tone === 'success') {
      notify.success(notice.title, notice.description ? { description: notice.description } : undefined);
      onOpenChange(false);
      return;
    }
    setProblem(notice);
  };

  if (!crewMember) return null;
  const noLogin = !crewMember.user_id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {willEnable ? <UserCheck aria-hidden="true" className="h-5 w-5 text-success" /> : <UserX aria-hidden="true" className="h-5 w-5 text-destructive" />}
            {willEnable ? 'Turn access on' : 'Turn access off'}
          </DialogTitle>
          <DialogDescription>{willEnable ? `Let ${name} sign in to STORM again.` : `Stop ${name} from signing in to STORM.`}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {noLogin ? (
            <Alert variant="info">
              <AlertDescription>{name} has not joined STORM yet, so there is no sign-in to change. Send an invitation instead.</AlertDescription>
            </Alert>
          ) : !willEnable ? (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-destructive">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">They can no longer sign in</p>
                <p className="mt-1">A device they are signed in on now loses access within the hour. No data is deleted.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/10 p-3 text-primary">
              <UserCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">They can sign in again</p>
                <p className="mt-1">With their existing password.</p>
              </div>
            </div>
          )}

          {!noLogin ? (
            <div className="space-y-2">
              <Label htmlFor={REASON_ID}>{willEnable ? 'Reason (optional)' : 'Reason (required)'}</Label>
              <Textarea
                id={REASON_ID}
                placeholder={willEnable ? 'Why access is back on' : 'Why access is being turned off'}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (reasonError) setReasonError(null);
                }}
                rows={2}
                required={!willEnable}
                aria-invalid={reasonError ? true : undefined}
                aria-describedby={reasonError ? REASON_ERROR_ID : undefined}
              />
              {reasonError ? (
                <p id={REASON_ERROR_ID} className="text-sm text-destructive">
                  {reasonError}
                </p>
              ) : null}
            </div>
          ) : null}

          {problem ? (
            <Alert variant={problem.tone === 'warning' ? 'warning' : 'destructive'} data-access-outcome={problem.tone}>
              <AlertTitle>{problem.title}</AlertTitle>
              {problem.description ? <AlertDescription>{problem.description}</AlertDescription> : null}
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {problem ? 'Close' : 'Cancel'}
          </Button>
          {!noLogin ? (
            <Button onClick={() => void handleSubmit()} disabled={toggleAccess.isPending} variant={willEnable ? 'default' : 'destructive'}>
              {toggleAccess.isPending && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
              {problem?.retry ? 'Try again' : willEnable ? 'Turn access on' : 'Turn access off'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ToggleAccessModal;
