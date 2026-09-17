import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate, formatMinor } from '@/modules/hris/lib/format';
import { personalDetailsLink, type ApplicationRow, type VacancyRow } from '@/modules/hris/lib/recruitment';
import type { CompanyVessel } from '@/modules/hris/hooks/useCrewContracts';

const NONE = '__none__';

interface HireDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string;
  application: Pick<ApplicationRow, 'offer_currency' | 'offer_base_minor' | 'offer_start_date'>;
  vacancy: Pick<VacancyRow, 'vessel_id' | 'title' | 'start_date'>;
  vessels: CompanyVessel[];
  /** Runs the hire RPC and resolves with the new profiles.id. */
  onHire: (args: { startDate: string; vesselId: string | null }) => Promise<string>;
  isPending?: boolean;
}

/**
 * Confirms start date and vessel, runs the hire RPC (crew profile + draft
 * contract + onboarding) and then links to the new Personal Details record.
 */
export const HireDialog: React.FC<HireDialogProps> = ({ open, onOpenChange, candidateName, application, vacancy, vessels, onHire, isPending }) => {
  const [startDate, setStartDate] = useState('');
  const [vesselId, setVesselId] = useState<string>(NONE);
  const [hiredProfileId, setHiredProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStartDate(application.offer_start_date ?? vacancy.start_date ?? '');
      setVesselId(vacancy.vessel_id ?? NONE);
      setHiredProfileId(null);
    }
  }, [open, application.offer_start_date, vacancy.start_date, vacancy.vessel_id]);

  const submit = async () => {
    const id = await onHire({ startDate, vesselId: vesselId === NONE ? null : vesselId });
    setHiredProfileId(id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {hiredProfileId ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" /> {candidateName} hired
              </DialogTitle>
              <DialogDescription>
                A crew profile and a draft contract have been created and onboarding has started. Complete their personal details, then send the login invitation.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              <Button asChild>
                <Link to={personalDetailsLink(hiredProfileId)}>
                  Open Personal Details <ExternalLink className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Hire {candidateName}</DialogTitle>
              <DialogDescription>
                Creates a crew profile (no login yet), a draft contract for <span className="font-medium">{vacancy.title}</span>
                {application.offer_base_minor !== null ? ` at ${formatMinor(application.offer_base_minor, application.offer_currency)}/month` : ''}, and starts onboarding.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="hire-start">Start date</Label>
                <Input id="hire-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                {application.offer_start_date && startDate !== application.offer_start_date && (
                  <p className="text-xs text-muted-foreground">Offer said {formatDate(application.offer_start_date)}.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Joining vessel</Label>
                <Select value={vesselId} onValueChange={setVesselId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Shore / to be assigned</SelectItem>
                    {vessels.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button onClick={() => void submit()} disabled={!startDate || isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm hire
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default HireDialog;
