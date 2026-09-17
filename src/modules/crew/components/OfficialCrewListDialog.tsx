import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { FileText } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from '@/shared/hooks/use-toast';
import type { CrewMember } from '@/modules/crew/hooks/useCrew';
import type { Vessel } from '@/modules/vessels/contexts/VesselContext';
import { buildOfficialCrewListPdf } from '@/modules/crew/lib/crewListPdf';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vessels: Vessel[];
  defaultVesselId?: string | null;
  people: CrewMember[];
}

const MASTER_RANKS = ['captain', 'master', 'relief captain'];

const OfficialCrewListDialog: React.FC<Props> = ({
  open, onOpenChange, vessels, defaultVesselId, people,
}) => {
  const [vesselId, setVesselId] = useState<string>(defaultVesselId ?? vessels[0]?.id ?? '');
  const [port, setPort] = useState('');
  const [lastPort, setLastPort] = useState('');
  const [arrivalDate, setArrivalDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [includeContractors, setIncludeContractors] = useState(true);

  const vessel = vessels.find((item) => item.id === vesselId) ?? null;

  const listed = useMemo(() => {
    if (!vesselId) return [];
    return people
      .filter((person) => person.current_assignment?.vessel_id === vesselId)
      .filter((person) => (person.personnel_type ?? 'crew') !== 'shoreside')
      .filter((person) => includeContractors || (person.personnel_type ?? 'crew') !== 'contractor')
      .sort((a, b) => {
        const rankA = MASTER_RANKS.includes((a.rank ?? '').toLowerCase()) ? 0 : 1;
        const rankB = MASTER_RANKS.includes((b.rank ?? '').toLowerCase()) ? 0 : 1;
        if (rankA !== rankB) return rankA - rankB;
        return `${a.last_name}`.localeCompare(`${b.last_name}`);
      });
  }, [people, vesselId, includeContractors]);

  const masterName = useMemo(() => {
    const master = listed.find((person) => MASTER_RANKS.includes((person.rank ?? '').toLowerCase()));
    return master ? `${master.first_name} ${master.last_name}` : '';
  }, [listed]);

  const handleGenerate = () => {
    if (!vessel) {
      toast({ title: 'Choose a vessel first', variant: 'destructive' });
      return;
    }
    const doc = buildOfficialCrewListPdf(listed, {
      vessel,
      portOfArrival: port,
      dateOfArrival: arrivalDate,
      lastPortOfCall: lastPort,
      masterName,
      includeContractors,
    });
    const safeName = vessel.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    doc.save(`crew-list-${safeName}-${arrivalDate}.pdf`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Official crew list
          </DialogTitle>
          <DialogDescription>
            Produces the IMO FAL Form 5 crew list for port, immigration and flag state use.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Vessel</Label>
            <Select value={vesselId} onValueChange={setVesselId}>
              <SelectTrigger><SelectValue placeholder="Select a vessel" /></SelectTrigger>
              <SelectContent>
                {vessels.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Port of arrival / departure</Label>
              <Input value={port} onChange={(event) => setPort(event.target.value)} placeholder="e.g. Palma de Mallorca" />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={arrivalDate} onChange={(event) => setArrivalDate(event.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Last port of call</Label>
              <Input value={lastPort} onChange={(event) => setLastPort(event.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">Include contractors on board</p>
              <p className="text-xs text-muted-foreground">Listed and marked as contractors.</p>
            </div>
            <Switch checked={includeContractors} onCheckedChange={setIncludeContractors} />
          </div>

          <p className="text-sm text-muted-foreground">
            {listed.length} {listed.length === 1 ? 'person' : 'people'} will be listed
            {masterName ? ` — Master: ${masterName}` : ''}.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={!vesselId}>Download PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OfficialCrewListDialog;
