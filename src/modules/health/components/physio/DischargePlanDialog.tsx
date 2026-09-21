import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { PhysioTreatmentPlanEntry } from '@/modules/health/hooks/usePhysio';
import { todayIso } from '@/modules/health/lib/format';

interface DischargePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PhysioTreatmentPlanEntry | null;
  onDischarge: (input: { id: string; discharge_summary: string; end_date: string }) => Promise<void>;
  isPending?: boolean;
}

/** Close a treatment plan and put the discharge summary on the record. */
export const DischargePlanDialog: React.FC<DischargePlanDialogProps> = ({
  open,
  onOpenChange,
  plan,
  onDischarge,
  isPending,
}) => {
  const [summary, setSummary] = useState('');
  const [endDate, setEndDate] = useState(todayIso());

  useEffect(() => {
    if (!open) return;
    setSummary(plan?.discharge_summary ?? '');
    setEndDate(plan?.end_date ?? todayIso());
  }, [open, plan]);

  if (!plan) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!summary.trim()) return;
    await onDischarge({ id: plan.id, discharge_summary: summary.trim(), end_date: endDate });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Discharge from treatment</DialogTitle>
          <DialogDescription>
            {plan.title} · {plan.person_name ?? 'Unknown person'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="discharge-summary">Discharge summary</Label>
            <Textarea
              id="discharge-summary"
              rows={5}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Outcome against the goals, what the crew member continues on their own, and what would bring them back."
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="discharge-date">End date</Label>
            <Input
              id="discharge-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="sm:max-w-[200px]"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !summary.trim()}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Discharge
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default DischargePlanDialog;
