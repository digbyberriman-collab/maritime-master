import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import { useOnboardingTemplates, type StartOnboardingArgs } from '@/modules/hris/hooks/useOnboarding';
import type { HrCrewDirectoryEntry } from '@/modules/hris/hooks/useHrCrewDirectory';
import { countTemplateItems, parseTemplateSections } from '@/modules/hris/lib/onboarding';

interface StartOnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crew: HrCrewDirectoryEntry;
  /** Suggested start date (e.g. from the contract or assignment). */
  suggestedStartDate?: string | null;
  submitting?: boolean;
  onSubmit: (args: StartOnboardingArgs) => Promise<unknown>;
}

const AUTO = '__auto__';
const NONE = '__none__';

/** Vessel, start date, template and buddy for a new onboarding record. */
export const StartOnboardingDialog: React.FC<StartOnboardingDialogProps> = ({ open, onOpenChange, crew, suggestedStartDate, submitting, onSubmit }) => {
  const { vessels } = useCompanyVessels();
  const { templates, isLoading: templatesLoading } = useOnboardingTemplates();
  const [vesselId, setVesselId] = useState<string>(NONE);
  const [startDate, setStartDate] = useState('');
  const [templateId, setTemplateId] = useState<string>(AUTO);
  const [buddyId, setBuddyId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setVesselId(crew.vessel_id ?? NONE);
    setStartDate(suggestedStartDate ?? format(new Date(), 'yyyy-MM-dd'));
    setTemplateId(AUTO);
    setBuddyId(null);
    setNotes('');
  }, [open, crew.vessel_id, suggestedStartDate]);

  /** Mirrors the RPC's fallback: vessel-specific first, then default, then oldest. */
  const autoTemplate = useMemo(() => {
    const vessel = vesselId === NONE ? null : vesselId;
    return (
      templates.find((t) => t.vessel_id && t.vessel_id === vessel) ??
      templates.find((t) => !t.vessel_id && t.is_default) ??
      templates.find((t) => !t.vessel_id) ??
      null
    );
  }, [templates, vesselId]);

  const chosen = templateId === AUTO ? autoTemplate : templates.find((t) => t.id === templateId) ?? null;
  const counts = chosen ? countTemplateItems(parseTemplateSections(chosen.sections)) : null;

  const submit = async () => {
    if (!startDate) return;
    await onSubmit({
      profileId: crew.id,
      vesselId: vesselId === NONE ? null : vesselId,
      startDate,
      templateId: templateId === AUTO ? null : templateId,
      buddyProfileId: buddyId,
      notes: notes.trim() || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Rocket className="h-4 w-4 text-primary" /> Start onboarding for {crew.displayName}</DialogTitle>
          <DialogDescription>The template is exploded into a checklist with due dates relative to the start date.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Vessel</Label>
              <Select value={vesselId} onValueChange={setVesselId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No vessel / shore</SelectItem>
                  {vessels.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ob-start">Start date</Label>
              <Input id="ob-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={setTemplateId} disabled={templatesLoading}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO}>Automatic{autoTemplate ? ` · ${autoTemplate.name}` : ''}</SelectItem>
                {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.is_default ? ' (default)' : ''}</SelectItem>)}
              </SelectContent>
            </Select>
            {chosen && counts ? (
              <p className="text-xs text-muted-foreground">{counts.total} items, {counts.required} required.</p>
            ) : !templatesLoading ? (
              <Alert variant="destructive" className="mt-2">
                <AlertDescription>No active template matches. Create one under Templates before starting.</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Buddy (optional)</Label>
            <CrewPicker value={buddyId} onChange={(id) => setBuddyId(id === crew.id ? null : id)} placeholder="Pick a buddy on board" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ob-notes">Notes</Label>
            <Textarea id="ob-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the vessel should know before they arrive" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !startDate || !chosen} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Start onboarding
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StartOnboardingDialog;
