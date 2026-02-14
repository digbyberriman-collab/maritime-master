import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useCreateEntry, useTripTypes, useItineraryVessels } from '@/hooks/useItinerary';
import { useToast } from '@/hooks/use-toast';
import type { ItineraryStatus, CreateEntryInput } from '@/types/itinerary';

interface CreateEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;
  defaultVesselId?: string;
}

const CreateEntryModal: React.FC<CreateEntryModalProps> = ({
  open,
  onOpenChange,
  defaultDate,
  defaultVesselId,
}) => {
  const { toast } = useToast();
  const { data: tripTypes = [] } = useTripTypes();
  const { data: vessels = [] } = useItineraryVessels();
  const createEntry = useCreateEntry();

  const today = new Date().toISOString().split('T')[0];
  const [title, setTitle] = useState('');
  const [tripTypeId, setTripTypeId] = useState<string>('');
  const [location, setLocation] = useState('');
  const [country, setCountry] = useState('');
  const [startDate, setStartDate] = useState(defaultDate || today);
  const [endDate, setEndDate] = useState(defaultDate || today);
  const [status, setStatus] = useState<ItineraryStatus>('draft');
  const [notes, setNotes] = useState('');
  const [selectedVessels, setSelectedVessels] = useState<string[]>(
    defaultVesselId ? [defaultVesselId] : []
  );

  const toggleVessel = (vesselId: string) => {
    setSelectedVessels(prev =>
      prev.includes(vesselId) ? prev.filter(v => v !== vesselId) : [...prev, vesselId]
    );
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({ title: 'Title required', variant: 'destructive' });
      return;
    }
    if (selectedVessels.length === 0) {
      toast({ title: 'Select at least one vessel', variant: 'destructive' });
      return;
    }

    try {
      await createEntry.mutateAsync({
        title: title.trim(),
        trip_type_id: tripTypeId || null,
        location,
        country,
        start_date: startDate,
        end_date: endDate,
        status,
        notes,
        vessel_ids: selectedVessels,
      });
      toast({ title: 'Entry created' });
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      toast({ title: 'Error creating entry', description: err.message, variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setTitle('');
    setTripTypeId('');
    setLocation('');
    setCountry('');
    setStartDate(today);
    setEndDate(today);
    setStatus('draft');
    setNotes('');
    setSelectedVessels(defaultVesselId ? [defaultVesselId] : []);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Itinerary Entry</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Trip type */}
          <div className="space-y-1.5">
            <Label className="text-xs">Trip Type</Label>
            <Select value={tripTypeId} onValueChange={setTripTypeId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select trip type" />
              </SelectTrigger>
              <SelectContent>
                {tripTypes.map(tt => (
                  <SelectItem key={tt.id} value={tt.id}>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: tt.colour }} />
                      {tt.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-xs">Title *</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Cocos Islands Dive Trip"
              className="h-9"
            />
          </div>

          {/* Location & Country */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Location</Label>
              <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Port / area" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Country</Label>
              <Input value={country} onChange={e => setCountry(e.target.value)} placeholder="Country" className="h-9" />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End Date</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-9" />
            </div>
          </div>

          {/* Vessels */}
          <div className="space-y-1.5">
            <Label className="text-xs">Vessel(s) *</Label>
            <div className="grid grid-cols-2 gap-1 p-2 border border-border rounded-md max-h-32 overflow-y-auto bg-muted/30">
              {vessels.map(v => (
                <label key={v.id} className="flex items-center gap-2 text-xs cursor-pointer py-0.5">
                  <Checkbox
                    checked={selectedVessels.includes(v.id)}
                    onCheckedChange={() => toggleVessel(v.id)}
                  />
                  <span className="truncate">{v.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={v => setStatus(v as ItineraryStatus)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="tentative">Tentative</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any additional notes..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createEntry.isPending}>
            {createEntry.isPending ? 'Creating...' : 'Create Entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateEntryModal;
