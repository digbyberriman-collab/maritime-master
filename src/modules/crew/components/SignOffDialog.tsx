import React, { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { CrewMember } from '@/modules/crew/hooks/useCrew';
import { isPendingPlacementAssignment } from '@/modules/crew/lib/crewUpdateErrors';

/** D-225: a pending placement is the profile's vessel, not a crew_assignments row; there is nothing to end. */
export const SIGN_OFF_PENDING_MESSAGE =
  'This person is not assigned to the vessel yet: the assignment is written once they are invited and their login is linked. There is nothing to sign off.';

const SIGN_OFF_REASONS = [
  { value: 'contract_end', label: 'Contract End' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'resignation', label: 'Resignation' },
  { value: 'termination', label: 'Termination' },
  { value: 'leave', label: 'Leave of Absence' },
  { value: 'other', label: 'Other' },
] as const;

interface SignOffDialogProps {
  isOpen: boolean;
  onClose: () => void;
  crewMember: CrewMember | null;
  onConfirm: (data: { assignmentId: string; leaveDate: string; reason: string; notes?: string }) => Promise<void>;
  isLoading: boolean;
}

const SignOffDialog: React.FC<SignOffDialogProps> = ({
  isOpen,
  onClose,
  crewMember,
  onConfirm,
  isLoading,
}) => {
  const [leaveDate, setLeaveDate] = useState<Date>(new Date());
  const [reason, setReason] = useState<string>('contract_end');
  const [notes, setNotes] = useState<string>('');

  const pending = isPendingPlacementAssignment(crewMember?.current_assignment);

  const handleConfirm = async () => {
    if (!crewMember?.current_assignment || pending) return;

    try {
      await onConfirm({
        assignmentId: crewMember.current_assignment.id,
        leaveDate: format(leaveDate, 'yyyy-MM-dd'),
        reason,
        notes: notes || undefined,
      });
    } catch {
      // The writer has already said why (a STORM sentence); the dialog stays open with the entries.
      return;
    }

    // Reset form
    setLeaveDate(new Date());
    setReason('contract_end');
    setNotes('');
  };

  if (!crewMember) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sign Off Crew Member</DialogTitle>
          <DialogDescription>
            Sign off {crewMember.first_name} {crewMember.last_name} from{' '}
            {crewMember.current_assignment?.vessel_name}
          </DialogDescription>
        </DialogHeader>

        {pending ? (
          <Alert variant="info" data-sign-off-refused="pending_placement">
            <AlertDescription>{SIGN_OFF_PENDING_MESSAGE}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Leave Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !leaveDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {leaveDate ? format(leaveDate, 'PPP') : 'Select date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-popover" align="start">
                <Calendar
                  mode="single"
                  selected={leaveDate}
                  onSelect={(date) => date && setLeaveDate(date)}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Reason *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {SIGN_OFF_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea
              placeholder="Add any additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={isLoading || pending}>
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Sign Off
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SignOffDialog;
