import React, { useState } from 'react';
import { format } from 'date-fns';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import { useBulkReassignVessel } from '@/modules/crew/hooks/useBulkCrewMutations';

interface BulkReassignVesselDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userIds: string[];
}

export const BulkReassignVesselDialog: React.FC<BulkReassignVesselDialogProps> = ({ open, onOpenChange, userIds }) => {
  const { vessels = [] } = useVessels();
  const [vesselId, setVesselId] = useState<string>('');
  const [position, setPosition] = useState('');
  const [transferDate, setTransferDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const mutation = useBulkReassignVessel();

  const submit = async () => {
    if (!vesselId) return;
    await mutation.mutateAsync({ userIds, vesselId, position: position || undefined, transferDate });
    onOpenChange(false);
    setVesselId('');
    setPosition('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reassign {userIds.length} crew to a new vessel</DialogTitle>
          <DialogDescription>
            Ends the current assignment for each selected member and creates a new assignment on the chosen vessel.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>New vessel</Label>
            <Select value={vesselId} onValueChange={setVesselId}>
              <SelectTrigger><SelectValue placeholder="Select vessel" /></SelectTrigger>
              <SelectContent>
                {vessels.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-position">Position (optional — leaves existing position if blank)</Label>
            <Input id="bulk-position" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Bosun" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-date">Transfer date</Label>
            <Input id="bulk-date" type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!vesselId || mutation.isPending}>
            {mutation.isPending ? 'Reassigning…' : 'Reassign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
