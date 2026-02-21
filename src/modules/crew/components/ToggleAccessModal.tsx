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
import { Textarea } from '@/components/ui/textarea';
import { UserCheck, UserX, Loader2, AlertTriangle } from 'lucide-react';
import { useAdminActions } from '@/modules/auth/hooks/useAdminActions';
import type { CrewMember } from '@/modules/crew/hooks/useCrew';

interface ToggleAccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crewMember: CrewMember | null;
}

const ToggleAccessModal: React.FC<ToggleAccessModalProps> = ({
  open,
  onOpenChange,
  crewMember,
}) => {
  const [reason, setReason] = useState('');
  const { toggleAccess } = useAdminActions();

  // Determine current access state (default to active if not set)
  const isCurrentlyDisabled = crewMember?.account_status === 'disabled';
  const willEnable = isCurrentlyDisabled;

  const handleSubmit = async () => {
    if (!crewMember) return;

    await toggleAccess.mutateAsync({
      targetUserId: crewMember.user_id,
      enableAccess: willEnable,
      reason: reason || undefined,
    });

    onOpenChange(false);
    setReason('');
  };

  if (!crewMember) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {willEnable ? (
              <UserCheck className="h-5 w-5 text-green-600" />
            ) : (
              <UserX className="h-5 w-5 text-destructive" />
            )}
            {willEnable ? 'Enable Account Access' : 'Disable Account Access'}
          </DialogTitle>
          <DialogDescription>
            {willEnable 
              ? `Re-enable login access for ${crewMember.first_name} ${crewMember.last_name}`
              : `Disable login access for ${crewMember.first_name} ${crewMember.last_name}`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!willEnable && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
              <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">This will immediately sign out the user</p>
                <p className="mt-1 text-destructive/80">
                  The user will not be able to log in until their access is re-enabled. 
                  No data will be deleted.
                </p>
              </div>
            </div>
          )}

          {willEnable && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20 text-primary">
              <UserCheck className="h-5 w-5 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">This will restore login access</p>
                <p className="mt-1 text-primary/80">
                  The user will be able to log in with their existing credentials.
                </p>
              </div>
            </div>
          )}

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
          <Button 
            onClick={handleSubmit} 
            disabled={toggleAccess.isPending}
            variant={willEnable ? 'default' : 'destructive'}
          >
            {toggleAccess.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {willEnable ? 'Enable Access' : 'Disable Access'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ToggleAccessModal;