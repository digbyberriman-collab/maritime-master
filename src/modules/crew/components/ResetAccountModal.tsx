import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { KeyRound, LogOut, Mail, Loader2 } from 'lucide-react';
import { useAdminActions } from '@/modules/auth/hooks/useAdminActions';
import type { CrewMember } from '@/modules/crew/hooks/useCrew';

interface ResetAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crewMember: CrewMember | null;
}

type ResetType = 'password_reset' | 'invalidate_sessions' | 'resend_invitation';

const RESET_OPTIONS: { value: ResetType; label: string; description: string; icon: React.ElementType }[] = [
  {
    value: 'password_reset',
    label: 'Force Password Reset',
    description: 'Send a password reset link to the user\'s email',
    icon: KeyRound,
  },
  {
    value: 'invalidate_sessions',
    label: 'Invalidate Sessions',
    description: 'Sign out the user from all devices immediately',
    icon: LogOut,
  },
  {
    value: 'resend_invitation',
    label: 'Resend Invitation',
    description: 'Send a new invitation email if no account exists',
    icon: Mail,
  },
];

const ResetAccountModal: React.FC<ResetAccountModalProps> = ({
  open,
  onOpenChange,
  crewMember,
}) => {
  const [resetType, setResetType] = useState<ResetType>('password_reset');
  const [reason, setReason] = useState('');
  const { resetAccount } = useAdminActions();

  const handleSubmit = async () => {
    if (!crewMember) return;

    await resetAccount.mutateAsync({
      targetUserId: crewMember.user_id,
      resetType,
      reason: reason || undefined,
    });

    onOpenChange(false);
    setReason('');
    setResetType('password_reset');
  };

  if (!crewMember) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reset User Account</DialogTitle>
          <DialogDescription>
            Reset account for <strong>{crewMember.first_name} {crewMember.last_name}</strong> ({crewMember.email})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label>Reset Action</Label>
            <RadioGroup value={resetType} onValueChange={(v) => setResetType(v as ResetType)}>
              {RESET_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <div
                    key={option.value}
                    className={`flex items-start space-x-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                      resetType === option.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setResetType(option.value)}
                  >
                    <RadioGroupItem value={option.value} id={option.value} className="mt-1" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <Label htmlFor={option.value} className="font-medium cursor-pointer">
                          {option.label}
                        </Label>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{option.description}</p>
                    </div>
                  </div>
                );
              })}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              placeholder="Enter a reason for this action..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={resetAccount.isPending}>
            {resetAccount.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Reset Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ResetAccountModal;