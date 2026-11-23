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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { KeyRound, LogOut, Mail, Loader2 } from 'lucide-react';
import { useAdminActions, type ResetAccountResult, type ResetType } from '@/modules/auth/hooks/useAdminActions';
import { endSessionsNotice, inviteNotice, passwordResetNotice, type OutcomeNotice } from '@/modules/auth/services/adminActions';
import { notify } from '@/shared/lib/notify';
import type { CrewMember } from '@/modules/crew/hooks/useCrew';

interface ResetAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crewMember: CrewMember | null;
}

interface ResetOption {
  value: ResetType;
  label: string;
  description: string;
  icon: React.ElementType;
  /** Shown instead of the description when the option cannot be used. */
  unavailable?: string;
}

const RESET_OPTIONS: ResetOption[] = [
  {
    value: 'password_reset',
    label: 'Send a password reset',
    description: 'Email a link to set a new password.',
    icon: KeyRound,
  },
  {
    value: 'resend_invitation',
    label: 'Resend the invitation',
    description: 'Email a new invitation link, for someone who has not joined yet.',
    icon: Mail,
  },
  {
    value: 'invalidate_sessions',
    label: 'Sign out everywhere',
    description: 'End every session on every device.',
    // The platform has no supported way to end another person's sessions (spec §C.3: 501, never faked).
    unavailable: 'Ending sessions from STORM is not available yet. Turn off their access to stop new sign-ins.',
    icon: LogOut,
  },
];

function noticeFor(result: ResetAccountResult, email: string | null): OutcomeNotice {
  if (result.resetType === 'password_reset') return passwordResetNotice(result.outcome, email);
  if (result.resetType === 'resend_invitation') return inviteNotice(result.outcome, email);
  return endSessionsNotice(result.outcome);
}

/**
 * Account reset for one crew member (behind the admin PIN). Each action
 * reports the outcome the server gave (spec §C.3): a success closes the
 * dialog with a toast; a failure stays here, says what went wrong and
 * offers Try again when that can help. Nothing says "sent" unless the
 * email went.
 */
const ResetAccountModal: React.FC<ResetAccountModalProps> = ({ open, onOpenChange, crewMember }) => {
  const [resetType, setResetType] = useState<ResetType>('password_reset');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<OutcomeNotice | null>(null);
  const { resetAccount } = useAdminActions();

  useEffect(() => {
    if (!open) {
      setProblem(null);
      setReason('');
      setResetType('password_reset');
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!crewMember) return;
    setProblem(null);
    let notice: OutcomeNotice;
    try {
      const result = await resetAccount.mutateAsync({
        targetUserId: crewMember.user_id ?? null,
        targetProfileId: crewMember.id,
        resetType,
        reason: reason.trim() || undefined,
      });
      notice = noticeFor(result, crewMember.email || null);
    } catch (error) {
      notice = { tone: 'error', title: 'Could not reset the account', description: error instanceof Error ? error.message : undefined, retry: true };
    }
    if (notice.tone === 'success') {
      notify.success(notice.title, notice.description ? { description: notice.description } : undefined);
      onOpenChange(false);
      return;
    }
    setProblem(notice);
  };

  if (!crewMember) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reset account</DialogTitle>
          <DialogDescription>
            For <strong>{crewMember.first_name} {crewMember.last_name}</strong> ({crewMember.email})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label id="reset-action-label">Action</Label>
            <RadioGroup
              aria-labelledby="reset-action-label"
              value={resetType}
              onValueChange={(v) => {
                setResetType(v as ResetType);
                setProblem(null);
              }}
            >
              {RESET_OPTIONS.map((option) => {
                const Icon = option.icon;
                const disabled = Boolean(option.unavailable);
                return (
                  <label
                    key={option.value}
                    htmlFor={`reset-${option.value}`}
                    className={cn(
                      'flex min-h-11 items-start gap-3 rounded-lg border p-4 transition-colors',
                      disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-muted/50',
                      resetType === option.value && !disabled ? 'border-primary bg-primary/5' : '',
                    )}
                  >
                    <RadioGroupItem value={option.value} id={`reset-${option.value}`} className="mt-1" disabled={disabled} />
                    <span className="flex-1">
                      <span className="flex items-center gap-2 font-medium">
                        <Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                        {option.label}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">{option.unavailable ?? option.description}</span>
                    </span>
                  </label>
                );
              })}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reset-reason">Reason (optional)</Label>
            <Textarea id="reset-reason" placeholder="Why this is needed" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>

          {problem ? (
            <Alert variant={problem.tone === 'warning' ? 'warning' : 'destructive'} data-reset-outcome={problem.tone}>
              <AlertTitle>{problem.title}</AlertTitle>
              {problem.description ? <AlertDescription>{problem.description}</AlertDescription> : null}
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {problem ? 'Close' : 'Cancel'}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={resetAccount.isPending}>
            {resetAccount.isPending && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
            {problem?.retry ? 'Try again' : resetType === 'password_reset' ? 'Send reset email' : resetType === 'resend_invitation' ? 'Resend invitation' : 'Sign out everywhere'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ResetAccountModal;
