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
import { Ship, CalendarIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminActions } from '@/hooks/useAdminActions';
import { useVessels } from '@/hooks/useVessels';
import type { CrewMember } from '@/hooks/useCrew';
import { RANKS } from '@/lib/crewConstants';

interface ReallocateVesselModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crewMember: CrewMember | null;
}

const ReallocateVesselModal: React.FC<ReallocateVesselModalProps> = ({
  open,
  onOpenChange,
  crewMember,
}) => {
  const [vesselId, setVesselId] = useState('');
  const [position, setPosition] = useState('');
  const [effectiveDate, setEffectiveDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [reason, setReason] = useState('');
  
  const { vessels } = useVessels();
  const { reallocateVessel } = useAdminActions();

  const activeVessels = vessels.filter((v) => v.status === 'Active');

  // Reset form when modal opens
  React.useEffect(() => {
    if (open && crewMember) {
      setVesselId('');
      setPosition(crewMember.current_assignment?.position || crewMember.rank || '');
      setEffectiveDate(new Date());
      setEndDate(undefined);
      setReason('');
    }
  }, [open, crewMember]);

  const handleSubmit = async () => {
    if (!crewMember || !vesselId || !reason) return;

    await reallocateVessel.mutateAsync({
      targetUserId: crewMember.user_id,
      vesselId,
      position: position || undefined,
      effectiveDate: format(effectiveDate, 'yyyy-MM-dd'),
      endDate: endDate ? format(endDate, 'yyyy-MM-dd') : undefined,
      reason,
    });

    onOpenChange(false);
  };

  if (!crewMember) return null;

  const currentVesselName = crewMember.current_assignment?.vessel_name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ship className="h-5 w-5" />
            Reallocate Vessel Assignment
          </DialogTitle>
          <DialogDescription>
            Change vessel assignment for <strong>{crewMember.first_name} {crewMember.last_name}</strong>
            {currentVesselName && (
              <span className="block mt-1">
                Currently assigned to: <strong>{currentVesselName}</strong>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="vessel">New Vessel *</Label>
            <Select value={vesselId} onValueChange={setVesselId}>
              <SelectTrigger>
                <SelectValue placeholder="Select vessel" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {activeVessels.map((vessel) => (
                  <SelectItem 
                    key={vessel.id} 
                    value={vessel.id}
                    disabled={vessel.id === crewMember.current_assignment?.vessel_id}
                  >
                    {vessel.name} {vessel.imo_number && `(IMO: ${vessel.imo_number})`}
                    {vessel.id === crewMember.current_assignment?.vessel_id && ' (current)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="position">Position</Label>
            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger>
                <SelectValue placeholder="Select position" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {RANKS.map((rank) => (
                  <SelectItem key={rank} value={rank}>
                    {rank}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Effective Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !effectiveDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {effectiveDate ? format(effectiveDate, "PP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={effectiveDate}
                    onSelect={(d) => d && setEffectiveDate(d)}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>End Date (optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "PP") : "No end date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    disabled={(date) => date < effectiveDate}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason *</Label>
            <Textarea
              id="reason"
              placeholder="Enter the reason for this vessel reassignment..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
            />
            <p className="text-xs text-muted-foreground">
              This reason will be logged in the audit trail.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={reallocateVessel.isPending || !vesselId || !reason}
          >
            {reallocateVessel.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirm Reassignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReallocateVesselModal;