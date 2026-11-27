import React, { Suspense, lazy, useState } from 'react';
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
import { fromDateOnly } from '@/shared/lib/form';
import { useScope } from '@/app/router/scopeContext';
import type { CrewMember } from '@/modules/crew/hooks/useCrew';
import { isPendingPlacementAssignment } from '@/modules/crew/lib/crewUpdateErrors';
import { legacySignOffReason } from '@/modules/crew/lib/employment';

// End employment (X1-11B) loads only when a sign-off opens on a vessel.
const EndEmploymentDialog = lazy(() => import('@/modules/crew/components/profile/EndEmploymentDialog'));

/** D-225: a pending placement is the profile's vessel, not a crew_assignments row; there is nothing to end. */
export const SIGN_OFF_PENDING_MESSAGE =
  'This person is not assigned to the vessel yet: the assignment is written once they are invited and their login is linked. There is nothing to sign off.';

const SIGN_OFF_REASONS = [
  { value: 'contract_end', label: 'Contract end' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'resignation', label: 'Resignation' },
  { value: 'termination', label: 'Termination' },
  { value: 'leave', label: 'Leave of absence' },
  { value: 'other', label: 'Other' },
] as const;

export interface SignOffData {
  assignmentId: string;
  leaveDate: string;
  reason: string;
  notes?: string;
}

export interface LegacySignOffFormProps {
  open: boolean;
  onClose: () => void;
  personName: string;
  vesselName: string | null;
  /** The current assignment to end; null (or a pending placement, D-225) refuses before anything is written. */
  assignmentId: string | null;
  pendingPlacement: boolean;
  onConfirm: (data: SignOffData) => Promise<void>;
  isLoading: boolean;
  /** D-01: why the legacy form is shown (End employment is not applied yet). */
  notice?: string | null;
  /** Entries carried over from End employment. */
  initial?: { leaveDate?: string; reason?: string; notes?: string };
}

/**
 * The legacy sign-off (D-225 fixed: a pending placement is refused before
 * anything is written, a refusal reads as a STORM sentence and keeps the
 * entries): it ends the crew_assignments row only. It is End employment's
 * D-01 fallback while crew_end_employment (20261124061100) is not applied
 * (`notice` says so), and the form outside a vessel scope.
 */
export const LegacySignOffForm: React.FC<LegacySignOffFormProps> = ({
  open,
  onClose,
  personName,
  vesselName,
  assignmentId,
  pendingPlacement,
  onConfirm,
  isLoading,
  notice = null,
  initial,
}) => {
  const [leaveDate, setLeaveDate] = useState<Date>(() => fromDateOnly(initial?.leaveDate) ?? new Date());
  const [reason, setReason] = useState<string>(() => (initial?.reason ? legacySignOffReason(initial.reason) : 'contract_end'));
  const [notes, setNotes] = useState<string>(initial?.notes ?? '');

  const refused = pendingPlacement || !assignmentId;

  const handleConfirm = async () => {
    if (!assignmentId || refused) return;

    try {
      await onConfirm({
        assignmentId,
        leaveDate: format(leaveDate, 'yyyy-MM-dd'),
        reason,
        notes: notes.trim() || undefined,
      });
    } catch {
      // The writer has already said why (a STORM sentence); the dialog stays open with the entries.
      return;
    }

    setLeaveDate(new Date());
    setReason('contract_end');
    setNotes('');
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md" data-sign-off="legacy">
        <DialogHeader>
          <DialogTitle>Sign off crew member</DialogTitle>
          <DialogDescription>
            Sign off {personName}
            {vesselName ? ` from ${vesselName}` : ''}.
          </DialogDescription>
        </DialogHeader>

        {notice ? (
          <Alert variant="info" data-sign-off-fallback="">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}
        {pendingPlacement ? (
          <Alert variant="info" data-sign-off-refused="pending_placement">
            <AlertDescription>{SIGN_OFF_PENDING_MESSAGE}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Leave date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal [@media(pointer:coarse)]:h-11',
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
              <SelectTrigger className="[@media(pointer:coarse)]:h-11">
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
            <Label>Notes (optional)</Label>
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
          <Button variant="outline" className="[@media(pointer:coarse)]:h-11" onClick={onClose}>
            Cancel
          </Button>
          <Button className="[@media(pointer:coarse)]:h-11" onClick={() => void handleConfirm()} disabled={isLoading || refused}>
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Sign off
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface SignOffDialogProps {
  isOpen: boolean;
  onClose: () => void;
  crewMember: CrewMember | null;
  onConfirm: (data: SignOffData) => Promise<void>;
  isLoading: boolean;
}

/**
 * Sign off from the crew list row (and the legacy roster). On a vessel
 * route it is End employment (X1-11B; gap/04 W8: crew_end_employment, the
 * assignment, terms, contract, planner and notice in one definer), lazy;
 * D-01: while that RPC is missing, or outside a vessel scope, the legacy
 * sign-off above (with the notice on a vessel). The props stay the legacy
 * ones, so the callers need no change.
 */
const SignOffDialog: React.FC<SignOffDialogProps> = ({ isOpen, onClose, crewMember, onConfirm, isLoading }) => {
  const scope = useScope();
  if (!crewMember || !isOpen) return null;
  const assignment = crewMember.current_assignment ?? null;
  const pending = isPendingPlacementAssignment(assignment);
  const personName = [crewMember.preferred_name || crewMember.first_name, crewMember.last_name].filter(Boolean).join(' ') || 'crew member';
  const legacy = (notice: string | null, initial?: LegacySignOffFormProps['initial']) => (
    <LegacySignOffForm
      open
      onClose={onClose}
      personName={personName}
      vesselName={assignment?.vessel_name ?? null}
      assignmentId={pending ? null : assignment?.id ?? null}
      pendingPlacement={pending}
      onConfirm={onConfirm}
      isLoading={isLoading}
      notice={notice}
      initial={initial}
    />
  );
  const routeVessel = scope.scope === 'vessel' ? scope.vessel ?? null : null;
  if (!routeVessel) return legacy(null);
  return (
    <Suspense fallback={null}>
      <EndEmploymentDialog
        open
        onOpenChange={(next) => !next && onClose()}
        vessel={{ id: routeVessel.id, companyId: routeVessel.company_id ?? null, name: routeVessel.name }}
        person={{
          profileId: crewMember.id,
          displayName: personName,
          joinDate: assignment && assignment.vessel_id === routeVessel.id ? assignment.join_date ?? null : null,
          pendingPlacement: pending,
        }}
        renderFallback={(notice, carry) => legacy(notice, { leaveDate: carry.endDate, reason: carry.reason, notes: carry.notes })}
      />
    </Suspense>
  );
};

export default SignOffDialog;
